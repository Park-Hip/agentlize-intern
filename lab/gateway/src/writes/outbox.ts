import { performance } from 'node:perf_hooks';
import type { ReasonCode } from '@lab/shared';
import { adapterOf, type ApplyResult, type ResourceAdapter } from '../adapters/index.js';
import { OUTBOX_DOOR, type AuthorizationRegistry } from '../authorization/index.js';
import type { ExecutionReceipt, Proposal, ProposalExecutor, ProposalStore } from '../proposals/index.js';
import { newTraceId, type TraceOutcome, type TraceStore } from '../trace/index.js';
import type { CommandStore, WriteCommand } from './command-store.js';

/** How often the loop looks at the table when no wake arrives. */
export const OUTBOX_POLL_MS = 1_000;
/** The first wait after a lost answer, and the longest one; every resend uses the same key. */
export const RETRY_MIN_MS = 1_000;
export const RETRY_MAX_MS = 60_000;

/** 1s, 2s, 4s, ... capped at 60s: `attempts` is the send count after the last try. */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(1, attempts) - 1;
  return Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** exponent);
}

export interface OutboxOptions {
  readonly commands: CommandStore;
  readonly proposals: ProposalStore;
  readonly adapters: readonly ResourceAdapter[];
  readonly trace: TraceStore;
  /** The one resolver every step uses; the outbox asks it again before each send. */
  readonly authorization: AuthorizationRegistry;
  /** Replaced in tests that move time by hand. */
  readonly now?: () => Date;
  readonly pollMs?: number;
  readonly log?: (line: string) => void;
}

type SendOutcome =
  | { readonly kind: 'written'; readonly status: number; readonly replayed: boolean; readonly version: number }
  | {
      readonly kind: 'created';
      readonly status: number;
      readonly replayed: boolean;
      readonly recordId: string;
    }
  | { readonly kind: 'target_changed'; readonly status: number; readonly currentVersion: number | null }
  | { readonly kind: 'content_changed'; readonly status: number; readonly error: string }
  | { readonly kind: 'rejected'; readonly status: number; readonly error: string };

interface Settled {
  readonly status: 'done' | 'failed';
  readonly outcome: TraceOutcome;
  readonly reasonCode: ReasonCode | null;
  readonly result: string;
  /** Present when a create landed, so the command row can carry the new code. */
  readonly recordId?: string;
}

/** What a terminal outcome means for the command, the trace and the page. */
function settledOf(outcome: SendOutcome): Settled {
  switch (outcome.kind) {
    case 'written':
      return {
        status: 'done',
        outcome: 'ok',
        reasonCode: null,
        result: JSON.stringify({ kind: 'written', status: outcome.status, replayed: outcome.replayed, version: outcome.version }),
      };
    case 'created':
      return {
        status: 'done',
        outcome: 'ok',
        reasonCode: null,
        result: JSON.stringify({
          kind: 'created',
          status: outcome.status,
          replayed: outcome.replayed,
          recordId: outcome.recordId,
        }),
        recordId: outcome.recordId,
      };
    case 'target_changed':
      return {
        status: 'failed',
        outcome: 'refused',
        reasonCode: 'TARGET_CHANGED',
        result: JSON.stringify({ kind: 'target_changed', status: outcome.status, currentVersion: outcome.currentVersion }),
      };
    case 'content_changed':
      return {
        status: 'failed',
        outcome: 'refused',
        reasonCode: 'CONTENT_CHANGED',
        result: JSON.stringify({ kind: 'content_changed', status: outcome.status, error: outcome.error }),
      };
    case 'rejected':
      return {
        status: 'failed',
        outcome: 'refused',
        reasonCode: 'GATEWAY_UNAVAILABLE',
        result: JSON.stringify({ kind: 'rejected', status: outcome.status, error: outcome.error }),
      };
  }
}

/**
 * The background half of the write outbox (ADR-0007 section 3.5). The Gửi
 * transaction creates the commands; this loop carries them to the systems.
 * It wakes right after that transaction, looks at the table every second, and
 * sends the lowest open position of each proposal. Every send saves
 * `sent_unknown` before the PATCH and the result after it, so a crash at any
 * point leaves a row that the next start sends again with the same key.
 */
export class Outbox implements ProposalExecutor {
  private readonly commands: CommandStore;
  private readonly proposals: ProposalStore;
  private readonly adapters: readonly ResourceAdapter[];
  private readonly trace: TraceStore;
  private readonly authorization: AuthorizationRegistry;
  private readonly now: () => Date;
  private readonly pollMs: number;
  private readonly log: (line: string) => void;
  private timer: NodeJS.Timeout | undefined;
  private wakeHandle: NodeJS.Immediate | undefined;
  /** The hold last logged for each command, so a dead source does not write a line on every poll round. */
  private readonly heldSignatures = new Map<string, string>();
  private current: Promise<void> | undefined;
  private started = false;
  private stopped = false;
  private dirty = false;

  constructor(options: OutboxOptions) {
    this.commands = options.commands;
    this.proposals = options.proposals;
    this.adapters = options.adapters;
    this.trace = options.trace;
    this.authorization = options.authorization;
    this.now = options.now ?? ((): Date => new Date());
    this.pollMs = options.pollMs ?? OUTBOX_POLL_MS;
    this.log = options.log ?? ((line) => console.error(line));
  }

  /**
   * Open the loop and run one round at once, so every command a previous run
   * left open is picked up without a separate startup path.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.timer = setInterval(() => this.wake(), this.pollMs);
    this.timer.unref();
    this.wake();
  }

  /** The Gửi page hands the proposal over here and answers without waiting for a system. */
  execute(_proposal: Proposal): Promise<ExecutionReceipt> {
    this.wake();
    return Promise.resolve({ state: 'received' });
  }

  /** Run a round now rather than at the next second. */
  wake(): void {
    if (this.stopped) return;
    this.dirty = true;
    if (this.wakeHandle !== undefined) return;
    this.wakeHandle = setImmediate(() => {
      this.wakeHandle = undefined;
      void this.run();
    });
  }

  /** Stop the timer, then let the send in flight save its result. */
  async close(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.wakeHandle !== undefined) {
      clearImmediate(this.wakeHandle);
      this.wakeHandle = undefined;
    }
    const running = this.current;
    if (running !== undefined) await running.catch(() => undefined);
  }

  private run(): Promise<void> {
    if (this.current !== undefined) return this.current;
    const running = this.drain().finally(() => {
      if (this.current === running) this.current = undefined;
    });
    this.current = running;
    return running;
  }

  private async drain(): Promise<void> {
    if (this.stopped) return;
    try {
      // A proposal whose source does not resolve is held for this round, so
      // the loop moves on instead of picking the same row every turn. It is
      // not forgotten: the next round asks the resolver again.
      const held = new Set<string>();
      for (;;) {
        if (this.stopped) return;
        this.dirty = false;
        const next = this.nextDue(held);
        if (next === undefined) {
          if (!this.dirty) return;
          continue;
        }
        const progressed = await this.send(next);
        if (!progressed) held.add(next.proposalId);
      }
    } catch (error) {
      this.log(`[gateway] outbox stopped its round: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // A command created while the last read ran must not wait for the next second.
      if (this.dirty && !this.stopped) this.wake();
    }
  }

  /**
   * The first open command of each proposal, when its retry time has passed.
   * Keeping to the first position means item 18 never starts before item 17,
   * while a proposal waiting for a retry does not hold up another proposal.
   */
  private nextDue(held: ReadonlySet<string> = new Set()): WriteCommand | undefined {
    const firstOfProposal = new Map<string, WriteCommand>();
    for (const command of this.commands.listOpen()) {
      if (held.has(command.proposalId)) continue;
      if (!firstOfProposal.has(command.proposalId)) firstOfProposal.set(command.proposalId, command);
    }

    const now = this.now().getTime();
    const due = [...firstOfProposal.values()].filter(
      (command) => command.nextAttemptAt === null || Date.parse(command.nextAttemptAt) <= now,
    );
    due.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.proposalId.localeCompare(right.proposalId));
    return due[0];
  }

  /** True when this turn changed or attempted something, false when the command was held before any state moved. */
  private async send(command: WriteCommand): Promise<boolean> {
    if (command.status === 'done' || command.status === 'failed') return true;

    // The check happens before the row moves. A command no one has sent stays
    // `not_sent`; a command whose answer was lost stays `sent_unknown` with its
    // attempts and result, because it may already have landed. Neither status
    // is rewritten and no evidence is deleted.
    const known = this.proposals.get(command.proposalId);
    if (known !== undefined) {
      const resolution = this.authorization.resolve(known.authorization, OUTBOX_DOOR);
      if (!resolution.ok) {
        // One line per held state, not per poll round: the signature changes only when the command's state or the refusal does.
        const signature = `${command.status}:${resolution.reason}`;
        if (this.heldSignatures.get(command.commandId) !== signature) {
          this.heldSignatures.set(command.commandId, signature);
          this.log(
            `[gateway] command ${command.commandId} held as ${command.status}: ${resolution.reason}; no state changed`,
          );
        }
        return false;
      }
    }

    // The source resolves again, so a later hold is a new episode worth one line.
    this.heldSignatures.delete(command.commandId);
    const ruleId = command.attempts === 0 ? 'WRITE.SEND' : 'WRITE.RETRY';
    const started = performance.now();

    let current: WriteCommand;
    try {
      current = this.commands.markSent(command.commandId);
    } catch (error) {
      this.log(`[gateway] command ${command.commandId} could not be marked: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }

    const proposal = known ?? this.proposals.get(current.proposalId);
    if (proposal === undefined) {
      this.log(`[gateway] command ${current.commandId} points at a missing proposal`);
      this.settle(current, { kind: 'rejected', status: 500, error: 'missing proposal' }, ruleId, started);
      return true;
    }
    const item = proposal.items.find((candidate) => candidate.position === current.position);
    if (item === undefined) {
      this.log(`[gateway] command ${current.commandId} points at a missing item`);
      this.settle(current, { kind: 'rejected', status: 500, error: 'missing item' }, ruleId, started);
      return true;
    }

    let result: ApplyResult;
    try {
      const adapter = adapterOf(this.adapters, item.recordType);
      if (item.kind === 'create') {
        result =
          adapter.create === undefined
            ? { kind: 'rejected', status: 501, error: 'create_not_supported' }
            : await adapter.create({ idempotencyKey: current.idempotencyKey, changes: item.changes });
      } else {
        result = await adapter.apply({
          id: current.recordId,
          idempotencyKey: current.idempotencyKey,
          expectedVersion: current.expectedVersion,
          changes: item.changes,
        });
      }
    } catch (error) {
      result = { kind: 'unavailable', detail: error instanceof Error ? error.message : String(error) };
    }

    switch (result.kind) {
      case 'written':
        this.settle(current, { kind: 'written', status: 200, replayed: result.replayed, version: result.version }, ruleId, started);
        return true;
      case 'created':
        this.settle(
          current,
          { kind: 'created', status: 201, replayed: result.replayed, recordId: result.recordId },
          ruleId,
          started,
        );
        return true;
      case 'conflict':
        this.settle(current, { kind: 'target_changed', status: 409, currentVersion: result.currentVersion }, ruleId, started);
        return true;
      case 'not_found':
        this.settle(current, { kind: 'target_changed', status: 404, currentVersion: null }, ruleId, started);
        return true;
      case 'rejected':
        this.settle(
          current,
          result.status === 422
            ? { kind: 'content_changed', status: result.status, error: result.error }
            : { kind: 'rejected', status: result.status, error: result.error },
          ruleId,
          started,
        );
        return true;
      case 'unavailable': {
        // The write may or may not have landed. Keep the command and send it again with the same key, after a growing wait.
        const retryAt = new Date(this.now().getTime() + retryDelayMs(current.attempts));
        try {
          this.commands.noteAttempt(
            current.commandId,
            JSON.stringify({ kind: 'unavailable', detail: result.detail }),
            retryAt,
            (updated) => this.traceLine(updated, 'error', null, ruleId, started),
          );
        } catch (error) {
          this.log(
            `[gateway] command ${current.commandId} could not note its unknown state: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return true;
      }
    }
  }

  private settle(command: WriteCommand, outcome: SendOutcome, ruleId: string, started: number): void {
    const settled = settledOf(outcome);
    try {
      this.commands.settle(
        command.commandId,
        {
          status: settled.status,
          result: settled.result,
          reasonCode: settled.reasonCode,
          ...(settled.recordId === undefined ? {} : { recordId: settled.recordId }),
        },
        // The state change and its trace line share one transaction: if the line cannot be written, the command stays open.
        (next) => this.traceLine(next, settled.outcome, settled.reasonCode, ruleId, started),
      );
    } catch (error) {
      this.log(`[gateway] command ${command.commandId} could not record its result: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** One line per send round, with the key and the count, so a retry can be followed from the draft to the write. */
  private traceLine(command: WriteCommand, outcome: TraceOutcome, reasonCode: ReasonCode | null, ruleId: string, started: number): void {
    const proposal = this.proposals.get(command.proposalId);
    this.trace.append({
      traceId: newTraceId(),
      requester: proposal?.requester ?? null,
      caller: proposal?.caller ?? null,
      entry: 'web',
      tool: 'write_command',
      objectId: command.recordId,
      outcome,
      reasonCode,
      outOfScope: false,
      ruleId,
      policyVersion: proposal?.policyVersion ?? null,
      hostUser: null,
      proposalId: command.proposalId,
      idempotencyKey: command.idempotencyKey,
      attempts: command.attempts,
      durationMs: performance.now() - started,
    });
  }
}
