import { performance } from 'node:perf_hooks';
import type { ReasonCode } from '@lab/shared';
import { adapterOf, type ResourceAdapter } from '../adapters/index.js';
import type { Proposal, ProposalExecutor, ProposalStore, ExecutionReceipt } from '../proposals/index.js';
import { newTraceId, type TraceOutcome, type TraceStore } from '../trace/index.js';
import type { CommandStore, WriteCommand } from './command-store.js';

/** How many times one send round repeats after a lost answer, on top of the first try. */
export const MAX_RETRIES = 3;

export interface TaskListExecutorOptions {
  readonly commands: CommandStore;
  readonly proposals: ProposalStore;
  /** The registered system adapters; the command's record type picks the one that carries the write. */
  readonly adapters: readonly ResourceAdapter[];
  readonly trace: TraceStore;
  /** Tests lower it to keep a failed system cheap to simulate. */
  readonly maxRetries?: number;
  readonly log?: (line: string) => void;
}

type SendOutcome =
  | { readonly kind: 'written'; readonly status: number; readonly replayed: boolean; readonly version: number }
  | { readonly kind: 'target_changed'; readonly status: number; readonly currentVersion: number | null }
  | { readonly kind: 'content_changed'; readonly status: number; readonly error: string }
  | { readonly kind: 'rejected'; readonly status: number; readonly error: string };

interface Settled {
  readonly status: 'done' | 'failed';
  readonly outcome: TraceOutcome;
  readonly reasonCode: ReasonCode | null;
  readonly result: string;
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

function receiptOf(command: WriteCommand | undefined): ExecutionReceipt {
  if (command === undefined) return { state: 'sent_unknown' };
  const state =
    command.status === 'done' || command.status === 'failed' || command.status === 'sent_unknown'
      ? command.status
      : 'sent_unknown';
  return { state, commandId: command.commandId, attempts: command.attempts, reasonCode: command.reasonCode };
}

/**
 * Carries a confirmed proposal to the task list at most once. The command is
 * saved as `sent_unknown` before every PATCH, so a crash or a lost answer
 * leaves a row that a later send settles with the same idempotency key and the
 * version read when the proposal was drafted.
 */
export class TaskListExecutor implements ProposalExecutor {
  private readonly maxRetries: number;
  private readonly log: (line: string) => void;

  constructor(private readonly options: TaskListExecutorOptions) {
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    this.log = options.log ?? ((line) => console.error(line));
  }

  /**
   * One command per item, sent in position order. Each item keeps its own
   * result, so one task that changed meanwhile does not stop the rest
   * (ADR-0002 section 3 point 8).
   */
  async execute(proposal: Proposal): Promise<ExecutionReceipt> {
    const commands = this.options.commands.createForProposal(proposal);
    for (const command of commands) {
      await this.send(command, 'WRITE.SEND');
    }
    return this.summaryOf(proposal.proposalId);
  }

  /** What the page and the tool can say about the proposal as a whole, from the per-item results. */
  private summaryOf(proposalId: string): ExecutionReceipt {
    const commands = this.options.commands.listByProposal(proposalId);
    const last = commands[commands.length - 1];
    if (last === undefined) return { state: 'received' };
    const same = (status: WriteCommand['status']): boolean => commands.every((command) => command.status === status);
    const open = commands.some((command) => command.status === 'not_sent' || command.status === 'sent_unknown');
    const state = same('done') ? 'done' : same('failed') ? 'failed' : open ? 'sent_unknown' : 'failed';
    return { state, commandId: last.commandId, attempts: last.attempts, reasonCode: last.reasonCode };
  }

  /** Every command a previous run left open: confirmed but not sent, or sent with no answer. */
  async resume(): Promise<void> {
    const open = [...this.options.commands.listByStatus('not_sent'), ...this.options.commands.listByStatus('sent_unknown')];
    for (const command of open) {
      try {
        await this.send(command, 'WRITE.RESUME');
      } catch (error) {
        this.log(`[gateway] resume ${command.commandId} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async send(command: WriteCommand, ruleId: string): Promise<ExecutionReceipt> {
    if (command.status === 'done' || command.status === 'failed') return receiptOf(command);

    const started = performance.now();
    let lastDetail = 'no answer';
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let current: WriteCommand;
      try {
        current = this.options.commands.markSent(command.commandId);
      } catch (error) {
        this.log(`[gateway] command ${command.commandId} could not be marked: ${error instanceof Error ? error.message : String(error)}`);
        return receiptOf(this.options.commands.get(command.commandId));
      }

      const proposal = this.options.proposals.get(current.proposalId);
      if (proposal === undefined) {
        this.log(`[gateway] command ${command.commandId} points at a missing proposal`);
        return receiptOf(current);
      }
      const item = proposal.items.find((candidate) => candidate.position === current.position);
      if (item === undefined) {
        this.log(`[gateway] command ${command.commandId} points at a missing item`);
        return receiptOf(current);
      }

      const write = adapterOf(this.options.adapters, item.recordType);
      const result = await write.apply({
        id: current.recordId,
        idempotencyKey: current.idempotencyKey,
        expectedVersion: current.expectedVersion,
        changes: item.changes,
      });

      switch (result.kind) {
        case 'written':
          return this.settle(current, { kind: 'written', status: 200, replayed: result.replayed, version: result.version }, ruleId, started);
        case 'conflict':
          return this.settle(current, { kind: 'target_changed', status: 409, currentVersion: result.currentVersion }, ruleId, started);
        case 'not_found':
          return this.settle(current, { kind: 'target_changed', status: 404, currentVersion: null }, ruleId, started);
        case 'rejected':
          return result.status === 422
            ? this.settle(current, { kind: 'content_changed', status: result.status, error: result.error }, ruleId, started)
            : this.settle(current, { kind: 'rejected', status: result.status, error: result.error }, ruleId, started);
        case 'unavailable':
          // The write may or may not have landed. Keep the command and send it again with the same key.
          lastDetail = result.detail;
          break;
      }
    }

    try {
      this.options.commands.noteAttempt(
        command.commandId,
        JSON.stringify({ kind: 'unavailable', detail: lastDetail }),
        (updated) => this.trace(updated, 'error', null, ruleId, started),
      );
    } catch (error) {
      this.log(`[gateway] command ${command.commandId} could not note its unknown state: ${error instanceof Error ? error.message : String(error)}`);
    }
    return receiptOf(this.options.commands.get(command.commandId));
  }

  private settle(command: WriteCommand, outcome: SendOutcome, ruleId: string, started: number): ExecutionReceipt {
    const settled = settledOf(outcome);
    try {
      const updated = this.options.commands.settle(
        command.commandId,
        { status: settled.status, result: settled.result, reasonCode: settled.reasonCode },
        // The state change and its trace line share one transaction: if the line cannot be written, the command stays open.
        (next) => this.trace(next, settled.outcome, settled.reasonCode, ruleId, started),
      );
      return receiptOf(updated);
    } catch (error) {
      this.log(`[gateway] command ${command.commandId} could not record its result: ${error instanceof Error ? error.message : String(error)}`);
      return receiptOf(this.options.commands.get(command.commandId));
    }
  }

  /** One line per send round, with the key and the count, so a retry can be followed from the draft to the write. */
  private trace(command: WriteCommand, outcome: TraceOutcome, reasonCode: ReasonCode | null, ruleId: string, started: number): void {
    const proposal = this.options.proposals.get(command.proposalId);
    this.options.trace.append({
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
