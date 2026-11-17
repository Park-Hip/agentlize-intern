import { randomBytes } from 'node:crypto';
import type { ReasonCode } from '@lab/shared';
import type { GatewayDatabase } from '../database.js';

/** The four states one write command can be in (spec section 5.3). */
export const COMMAND_STATUSES = ['not_sent', 'sent_unknown', 'done', 'failed'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

/**
 * One command is one task write. A proposal that changes one task has exactly
 * one command; the position keeps room for a bulk proposal later, where each
 * task gets its own command and its own key.
 */
export interface WriteCommand {
  readonly commandId: string;
  readonly proposalId: string;
  readonly taskId: string;
  readonly position: number;
  /** `<proposal code>:<position>`; every resend of this command uses this same key. */
  readonly idempotencyKey: string;
  /** The task version read when the proposal was drafted. */
  readonly expectedVersion: number;
  readonly status: CommandStatus;
  /** How many times the gateway has sent the PATCH, replays included. */
  readonly attempts: number;
  /** A short machine-readable account of the last outcome, kept as JSON. */
  readonly result: string | null;
  readonly reasonCode: ReasonCode | null;
  readonly updatedAt: string;
}

export interface CommandTask {
  readonly proposalId: string;
  readonly taskId: string;
  readonly baseVersion: number;
}

export interface SettledCommand {
  readonly status: 'done' | 'failed';
  readonly result: string;
  readonly reasonCode: ReasonCode | null;
}

interface Row {
  command_id: string;
  proposal_id: string;
  task_id: string;
  position: number;
  idempotency_key: string;
  expected_version: number;
  status: CommandStatus;
  attempts: number;
  result: string | null;
  reason_code: ReasonCode | null;
  updated_at: string;
}

const quoted = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

function toCommand(row: Row): WriteCommand {
  return {
    commandId: row.command_id,
    proposalId: row.proposal_id,
    taskId: row.task_id,
    position: row.position,
    idempotencyKey: row.idempotency_key,
    expectedVersion: row.expected_version,
    status: row.status,
    attempts: row.attempts,
    result: row.result,
    reasonCode: row.reason_code,
    updatedAt: row.updated_at,
  };
}

/**
 * Owns the `write_commands` table (spec section 6). The row is created in the
 * same transaction that confirms the proposal, so a confirmation never exists
 * without the command that will carry it out. The status changes only through
 * the methods here, each in its own short transaction.
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
        task_id          TEXT NOT NULL,
        position         INTEGER NOT NULL,
        idempotency_key  TEXT NOT NULL UNIQUE,
        expected_version INTEGER NOT NULL,
        status           TEXT NOT NULL CHECK (status IN (${quoted(COMMAND_STATUSES)})),
        attempts         INTEGER NOT NULL,
        result           TEXT,
        reason_code      TEXT,
        updated_at       TEXT NOT NULL,
        UNIQUE (proposal_id, position)
      );
      CREATE INDEX IF NOT EXISTS write_commands_proposal ON write_commands (proposal_id);
      CREATE INDEX IF NOT EXISTS write_commands_status ON write_commands (status);
    `);
  }

  /** The command of a proposal, or a new one in `not_sent`. Returns the existing row untouched, so a replay cannot fork it. */
  createForProposal(proposal: CommandTask): WriteCommand {
    const existing = this.findByProposal(proposal.proposalId);
    if (existing !== undefined) return existing;

    const row: Row = {
      command_id: `wc-${randomBytes(8).toString('hex')}`,
      proposal_id: proposal.proposalId,
      task_id: proposal.taskId,
      position: 1,
      idempotency_key: `${proposal.proposalId}:1`,
      expected_version: proposal.baseVersion,
      status: 'not_sent',
      attempts: 0,
      result: null,
      reason_code: null,
      updated_at: this.now().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO write_commands (command_id, proposal_id, task_id, position, idempotency_key,
                                     expected_version, status, attempts, result, reason_code, updated_at)
         VALUES (@command_id, @proposal_id, @task_id, @position, @idempotency_key,
                 @expected_version, @status, @attempts, @result, @reason_code, @updated_at)`,
      )
      .run(row);
    return toCommand(row);
  }

  get(commandId: string): WriteCommand | undefined {
    const row = this.db.prepare('SELECT * FROM write_commands WHERE command_id = ?').get(commandId) as Row | undefined;
    return row === undefined ? undefined : toCommand(row);
  }

  findByProposal(proposalId: string): WriteCommand | undefined {
    const row = this.db.prepare('SELECT * FROM write_commands WHERE proposal_id = ?').get(proposalId) as Row | undefined;
    return row === undefined ? undefined : toCommand(row);
  }

  /** Oldest first, so a restart resends in the order the commands were confirmed. */
  listByStatus(status: CommandStatus): WriteCommand[] {
    const rows = this.db
      .prepare('SELECT * FROM write_commands WHERE status = ? ORDER BY updated_at, command_id')
      .all(status) as Row[];
    return rows.map(toCommand);
  }

  list(): WriteCommand[] {
    const rows = this.db.prepare('SELECT * FROM write_commands ORDER BY updated_at, command_id').all() as Row[];
    return rows.map(toCommand);
  }

  /**
   * The moment before every send: the state becomes "sent, result unknown" and
   * the send count grows. Committed first, so a crash between here and the
   * PATCH leaves a row the next start will pick up.
   */
  markSent(commandId: string): WriteCommand {
    const now = this.now().toISOString();
    const changed = this.db
      .prepare(
        `UPDATE write_commands
            SET status = 'sent_unknown', attempts = attempts + 1, updated_at = ?
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

  /** The send changed the task or was definitively refused: a terminal state, changed at most once. */
  settle(commandId: string, outcome: SettledCommand, record: (command: WriteCommand) => void): WriteCommand {
    return this.db
      .transaction((): WriteCommand => {
        const current = this.get(commandId);
        if (current === undefined) throw new Error(`command ${commandId} disappeared`);
        // A command that already settled is never changed again, so two callers cannot overwrite one result.
        if (current.status === 'done' || current.status === 'failed') return current;

        this.db
          .prepare('UPDATE write_commands SET status = ?, result = ?, reason_code = ?, updated_at = ? WHERE command_id = ?')
          .run(outcome.status, outcome.result, outcome.reasonCode, this.now().toISOString(), commandId);
        const updated = this.get(commandId);
        if (updated === undefined) throw new Error(`command ${commandId} disappeared`);
        record(updated);
        return updated;
      })
      .immediate();
  }

  /** The outcome is still unknown: keep `sent_unknown` and note what the last attempt saw. */
  noteAttempt(commandId: string, result: string, record: (command: WriteCommand) => void): WriteCommand {
    return this.db
      .transaction((): WriteCommand => {
        const current = this.get(commandId);
        if (current === undefined) throw new Error(`command ${commandId} disappeared`);
        // A concurrent send may have settled it; then this note is stale and must not add a second outcome line.
        if (current.status !== 'sent_unknown') return current;

        this.db
          .prepare('UPDATE write_commands SET result = ?, updated_at = ? WHERE command_id = ? AND status = ?')
          .run(result, this.now().toISOString(), commandId, 'sent_unknown');
        const updated = this.get(commandId);
        if (updated === undefined) throw new Error(`command ${commandId} disappeared`);
        record(updated);
        return updated;
      })
      .immediate();
  }
}
