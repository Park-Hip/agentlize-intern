import { randomBytes } from 'node:crypto';
import type { ReasonCode } from '@lab/shared';
import type { GatewayDatabase } from '../database.js';
import type { Proposal, ProposalItem } from '../proposals/index.js';
import type { ItemKind } from '../proposals/index.js';

/** The four states one write command can be in (spec section 5.3). */
export const COMMAND_STATUSES = ['not_sent', 'sent_unknown', 'done', 'failed'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

/**
 * One command is one record write. A proposal with N items has N commands,
 * one per position, each with its own idempotency key.
 */
export interface WriteCommand {
  readonly commandId: string;
  readonly proposalId: string;
  readonly recordId: string;
  readonly position: number;
  /** `create` sends a POST; absent or `update` sends a PATCH to `recordId`. */
  readonly kind: ItemKind;
  /** `<proposal code>:<position>`; every resend of this command uses this same key. */
  readonly idempotencyKey: string;
  /** The record version read when the proposal was drafted; 0 for a create. */
  readonly expectedVersion: number;
  readonly status: CommandStatus;
  /** How many times the gateway has sent the write, replays included. */
  readonly attempts: number;
  /** A short machine-readable account of the last outcome, kept as JSON. */
  readonly result: string | null;
  readonly reasonCode: ReasonCode | null;
  /** When the outbox may send again; null means now. Kept in the row, so a restart keeps the wait. */
  readonly nextAttemptAt: string | null;
  readonly updatedAt: string;
}

export interface SettledCommand {
  readonly status: 'done' | 'failed';
  readonly result: string;
  readonly reasonCode: ReasonCode | null;
  /** For a create that landed: the code the target gave the new record. */
  readonly recordId?: string;
}

interface Row {
  command_id: string;
  proposal_id: string;
  record_id: string;
  position: number;
  kind: ItemKind;
  idempotency_key: string;
  expected_version: number;
  status: CommandStatus;
  attempts: number;
  result: string | null;
  reason_code: ReasonCode | null;
  next_attempt_at: string | null;
  updated_at: string;
}

const quoted = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

function toCommand(row: Row): WriteCommand {
  return {
    commandId: row.command_id,
    proposalId: row.proposal_id,
    recordId: row.record_id,
    position: row.position,
    kind: row.kind,
    idempotencyKey: row.idempotency_key,
    expectedVersion: row.expected_version,
    status: row.status,
    attempts: row.attempts,
    result: row.result,
    reasonCode: row.reason_code,
    nextAttemptAt: row.next_attempt_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Owns the `write_commands` table (spec section 6). The rows are created in
 * the same transaction that confirms the proposal, so a confirmation never
 * exists without the commands that will carry it out. The status changes only
 * through the methods here, each in its own short transaction.
 */
export class CommandStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS write_commands (
        command_id       TEXT PRIMARY KEY,
        proposal_id      TEXT NOT NULL REFERENCES proposals (proposal_id),
        record_id        TEXT NOT NULL,
        position         INTEGER NOT NULL,
        kind             TEXT NOT NULL DEFAULT 'update',
        idempotency_key  TEXT NOT NULL UNIQUE,
        expected_version INTEGER NOT NULL,
        status           TEXT NOT NULL CHECK (status IN (${quoted(COMMAND_STATUSES)})),
        attempts         INTEGER NOT NULL,
        result           TEXT,
        reason_code      TEXT,
        next_attempt_at  TEXT,
        updated_at       TEXT NOT NULL,
        UNIQUE (proposal_id, position)
      );
      CREATE INDEX IF NOT EXISTS write_commands_proposal ON write_commands (proposal_id);
      CREATE INDEX IF NOT EXISTS write_commands_status ON write_commands (status);
    `);
    // A database from the first outbox version has no retry column; adding it keeps the simulated rows.
    const columns = db.prepare("PRAGMA table_info('write_commands')").all() as { name: string }[];
    if (!columns.some((column) => column.name === 'next_attempt_at')) {
      db.exec('ALTER TABLE write_commands ADD COLUMN next_attempt_at TEXT');
    }
    // A database from before the create contract defaults every existing row
    // to `update`, so it keeps sending the same PATCH it sent before.
    if (!columns.some((column) => column.name === 'kind')) {
      db.exec("ALTER TABLE write_commands ADD COLUMN kind TEXT NOT NULL DEFAULT 'update'");
    }
  }

  /**
   * One command per item, in position order. Existing rows are returned
   * untouched, so a replay cannot fork a proposal into a second set of writes.
   */
  createForProposal(proposal: Proposal): WriteCommand[] {
    const existing = this.listByProposal(proposal.proposalId);
    if (existing.length > 0) return existing;
    return this.db
      .transaction(() => proposal.items.map((item) => this.insert(proposal.proposalId, item)))
      .immediate();
  }

  private insert(proposalId: string, item: ProposalItem): WriteCommand {
    const row: Row = {
      command_id: `wc-${randomBytes(8).toString('hex')}`,
      proposal_id: proposalId,
      record_id: item.recordId,
      position: item.position,
      kind: item.kind,
      idempotency_key: `${proposalId}:${item.position}`,
      expected_version: item.baseVersion,
      status: 'not_sent',
      attempts: 0,
      result: null,
      reason_code: null,
      next_attempt_at: null,
      updated_at: this.now().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO write_commands (command_id, proposal_id, record_id, position, kind, idempotency_key,
                                     expected_version, status, attempts, result, reason_code, next_attempt_at, updated_at)
         VALUES (@command_id, @proposal_id, @record_id, @position, @kind, @idempotency_key,
                 @expected_version, @status, @attempts, @result, @reason_code, @next_attempt_at, @updated_at)`,
      )
      .run(row);
    return toCommand(row);
  }

  get(commandId: string): WriteCommand | undefined {
    const row = this.db.prepare('SELECT * FROM write_commands WHERE command_id = ?').get(commandId) as Row | undefined;
    return row === undefined ? undefined : toCommand(row);
  }

  /** The first command of a proposal, for callers that only need one record's result. */
  findByProposal(proposalId: string): WriteCommand | undefined {
    const row = this.db
      .prepare('SELECT * FROM write_commands WHERE proposal_id = ? ORDER BY position LIMIT 1')
      .get(proposalId) as Row | undefined;
    return row === undefined ? undefined : toCommand(row);
  }

  /** Every command of one proposal, in the order the items were numbered. */
  listByProposal(proposalId: string): WriteCommand[] {
    const rows = this.db
      .prepare('SELECT * FROM write_commands WHERE proposal_id = ? ORDER BY position')
      .all(proposalId) as Row[];
    return rows.map(toCommand);
  }

  /** Oldest first, then by proposal and position, so a restart resends in the order the person saw. */
  listByStatus(status: CommandStatus): WriteCommand[] {
    const rows = this.db
      .prepare('SELECT * FROM write_commands WHERE status = ? ORDER BY updated_at, proposal_id, position')
      .all(status) as Row[];
    return rows.map(toCommand);
  }

  /**
   * Every command still open, first by proposal and then by position. The
   * outbox uses the first row of each proposal, so an item never overtakes the
   * one before it.
   */
  listOpen(): WriteCommand[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM write_commands WHERE status IN ('not_sent', 'sent_unknown') ORDER BY proposal_id, position",
      )
      .all() as Row[];
    return rows.map(toCommand);
  }

  list(): WriteCommand[] {
    const rows = this.db
      .prepare('SELECT * FROM write_commands ORDER BY updated_at, proposal_id, position')
      .all() as Row[];
    return rows.map(toCommand);
  }

  /**
   * The moment before every send: the state becomes "sent, result unknown" and
   * the send count grows. Committed first, so a crash between here and the
   * PATCH leaves a row the next start will pick up. The retry time is cleared
   * while the request is in flight.
   */
  markSent(commandId: string): WriteCommand {
    const now = this.now().toISOString();
    const changed = this.db
      .prepare(
        `UPDATE write_commands
            SET status = 'sent_unknown', attempts = attempts + 1, next_attempt_at = NULL, updated_at = ?
          WHERE command_id = ? AND status IN ('not_sent', 'sent_unknown')`,
      )
      .run(now, commandId);
    if (changed.changes !== 1) {
      throw new Error(`command ${commandId} cannot be sent from its current state`);
    }
    const command = this.get(commandId);
    if (command === undefined) throw new Error(`command ${commandId} disappeared`);
    return command;
  }

  /** The send changed the record or was definitively refused: a terminal state, changed at most once. */
  settle(commandId: string, outcome: SettledCommand, record: (command: WriteCommand) => void): WriteCommand {
    return this.db
      .transaction((): WriteCommand => {
        const current = this.get(commandId);
        if (current === undefined) throw new Error(`command ${commandId} disappeared`);
        // A command that already settled is never changed again, so two callers cannot overwrite one result.
        if (current.status === 'done' || current.status === 'failed') return current;

        this.db
          .prepare(
            `UPDATE write_commands
                SET status = ?, result = ?, reason_code = ?, next_attempt_at = NULL, updated_at = ?,
                    record_id = COALESCE(?, record_id)
              WHERE command_id = ?`,
          )
          .run(
            outcome.status,
            outcome.result,
            outcome.reasonCode,
            this.now().toISOString(),
            outcome.recordId ?? null,
            commandId,
          );
        const updated = this.get(commandId);
        if (updated === undefined) throw new Error(`command ${commandId} disappeared`);
        record(updated);
        return updated;
      })
      .immediate();
  }

  /** The outcome is still unknown: keep `sent_unknown`, note what the last attempt saw, and say when to try again. */
  noteAttempt(
    commandId: string,
    result: string,
    nextAttemptAt: Date,
    record: (command: WriteCommand) => void,
  ): WriteCommand {
    return this.db
      .transaction((): WriteCommand => {
        const current = this.get(commandId);
        if (current === undefined) throw new Error(`command ${commandId} disappeared`);
        // A concurrent send may have settled it; then this note is stale and must not add a second outcome line.
        if (current.status !== 'sent_unknown') return current;

        this.db
          .prepare('UPDATE write_commands SET result = ?, next_attempt_at = ?, updated_at = ? WHERE command_id = ? AND status = ?')
          .run(result, nextAttemptAt.toISOString(), this.now().toISOString(), commandId, 'sent_unknown');
        const updated = this.get(commandId);
        if (updated === undefined) throw new Error(`command ${commandId} disappeared`);
        record(updated);
        return updated;
      })
      .immediate();
  }
}
