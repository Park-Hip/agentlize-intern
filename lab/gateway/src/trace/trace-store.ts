import { randomBytes } from 'node:crypto';
import type { ReasonCode } from '@lab/shared';
import type { GatewayDatabase } from '../database.js';

/**
 * Where a call came in: `http` is `POST /v1/tools/<name>`, `mcp` is the `/mcp`
 * door, `web` is a person pressing a button on a page of the gateway.
 */
export const ENTRIES = ['http', 'mcp', 'web'] as const;
export type TraceEntry = (typeof ENTRIES)[number];

/**
 * What happened, in four words. `not_found` covers both "nothing matched" and
 * "outside the reader's scope"; `out_of_scope` and `reason_code` tell them apart.
 */
export const OUTCOMES = ['ok', 'refused', 'not_found', 'error'] as const;
export type TraceOutcome = (typeof OUTCOMES)[number];

/**
 * One line of the trace. There is no field for a name, an email, a phone
 * number, an address or a key, so none can be written by mistake.
 */
export interface TraceRecord {
  readonly traceId: string;
  /** Employee code of the person asking; null when the key did not lead to a person. */
  readonly requester: string | null;
  /** Where the key says the call comes from; null when the key is unknown. */
  readonly caller: string | null;
  readonly entry: TraceEntry;
  readonly tool: string;
  /** Code of the thing asked about, such as `T-12`; null when the call named none. */
  readonly objectId: string | null;
  readonly outcome: TraceOutcome;
  readonly reasonCode: ReasonCode | null;
  /** True when the answer hid something the reader may not see. */
  readonly outOfScope: boolean;
  readonly ruleId: string | null;
  readonly policyVersion: number | null;
  /**
   * The `x-user-id` the host attached, already masked like a key (`user_a...(len=29)`).
   * A claim to look at later, never an input to a permission decision (ADR-0005).
   */
  readonly hostUser: string | null;
  /** The proposal this line is a step of (write, send or cancel); null for a call that touched none. */
  readonly proposalId?: string | null;
  /** The fixed key of a write command; null for every line that is not a write. */
  readonly idempotencyKey?: string | null;
  /** How many times a write command had been sent when this line was written. */
  readonly attempts?: number | null;
  readonly durationMs: number;
}

export interface TraceRow extends TraceRecord {
  readonly at: string;
}

export interface TraceFilter {
  /** One line, by its code. The console asks for the line of the call it just made. */
  readonly traceId?: string;
  readonly employee?: string;
  /**
   * One task. A line matches when it names the task, or when it belongs to a
   * proposal that contains it, so task 17 of a 30-item proposal still shows
   * the send, the approval and its own write.
   */
  readonly task?: string;
  /** The proposal a line is a step of, such as `dx-0123456789abcdef`. */
  readonly proposal?: string;
  /** The door the call came through: `http`, `mcp` or `web`. */
  readonly entry?: TraceEntry;
  readonly limit?: number;
}

interface Row {
  trace_id: string;
  at: string;
  requester: string | null;
  caller: string | null;
  entry: TraceEntry;
  tool: string;
  object_id: string | null;
  outcome: TraceOutcome;
  reason_code: ReasonCode | null;
  out_of_scope: number;
  rule_id: string | null;
  policy_version: number | null;
  host_user: string | null;
  proposal_id: string | null;
  idempotency_key: string | null;
  attempts: number | null;
  duration_ms: number;
}

const quoted = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

function createTraceSql(table: string): string {
  return `
    CREATE TABLE ${table} (
      seq            INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id       TEXT NOT NULL UNIQUE,
      at             TEXT NOT NULL,
      requester      TEXT,
      caller         TEXT,
      entry          TEXT NOT NULL CHECK (entry IN (${quoted(ENTRIES)})),
      tool           TEXT NOT NULL,
      object_id      TEXT,
      outcome        TEXT NOT NULL CHECK (outcome IN (${quoted(OUTCOMES)})),
      reason_code    TEXT,
      out_of_scope   INTEGER NOT NULL CHECK (out_of_scope IN (0, 1)),
      rule_id        TEXT,
      policy_version INTEGER,
      host_user      TEXT,
      proposal_id    TEXT,
      idempotency_key TEXT,
      attempts       INTEGER,
      duration_ms    INTEGER NOT NULL
    );
  `;
}

/** The indexes, and the two triggers that abort every UPDATE and DELETE. */
const GUARDS_SQL = `
  CREATE INDEX IF NOT EXISTS trace_requester ON trace (requester);
  CREATE INDEX IF NOT EXISTS trace_object ON trace (object_id);
  CREATE INDEX IF NOT EXISTS trace_proposal ON trace (proposal_id);
  CREATE TRIGGER IF NOT EXISTS trace_no_update BEFORE UPDATE ON trace
  BEGIN SELECT RAISE(ABORT, 'trace is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS trace_no_delete BEFORE DELETE ON trace
  BEGIN SELECT RAISE(ABORT, 'trace is append-only'); END;
`;

export const DEFAULT_TRACE_LIMIT = 200;

/** A fresh code for one call, for example `tr-9f2c41d07ab3e6c5`. */
export function newTraceId(): string {
  return `tr-${randomBytes(8).toString('hex')}`;
}

function toRow(row: Row): TraceRow {
  return {
    traceId: row.trace_id,
    at: row.at,
    requester: row.requester,
    caller: row.caller,
    entry: row.entry,
    tool: row.tool,
    objectId: row.object_id,
    outcome: row.outcome,
    reasonCode: row.reason_code,
    outOfScope: row.out_of_scope === 1,
    ruleId: row.rule_id,
    policyVersion: row.policy_version,
    hostUser: row.host_user,
    proposalId: row.proposal_id,
    idempotencyKey: row.idempotency_key,
    attempts: row.attempts,
    durationMs: row.duration_ms,
  };
}

/**
 * Reads the trace without ever writing it. The console opens the gateway
 * database read-only and reads through this class (ADR-0006 section 3.6), so
 * the query and the row shape exist once for the gateway, the CLI and the page.
 */
export class TraceReader {
  constructor(protected readonly db: GatewayDatabase) {}

  /** Newest lines first, at most `limit`. Every filter narrows the same list. */
  list(filter: TraceFilter = {}): TraceRow[] {
    const { where, params } = this.where(filter);
    params['limit'] = filter.limit ?? DEFAULT_TRACE_LIMIT;
    const sql = `SELECT * FROM trace ${where} ORDER BY seq DESC LIMIT @limit`;
    return (this.db.prepare(sql).all(params) as Row[]).map(toRow);
  }

  /** How many lines match a filter, without reading them. */
  count(filter: TraceFilter = {}): number {
    const { where, params } = this.where(filter);
    const row = this.db.prepare(`SELECT COUNT(*) AS total FROM trace ${where}`).get(params) as { total: number };
    return row.total;
  }

  /** `proposal_items` arrives with change sets; a trace-only database from before them has no such table. */
  private hasProposalItems(): boolean {
    return (
      this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'proposal_items'").get() !== undefined
    );
  }

  private where(filter: TraceFilter): { where: string; params: Record<string, string | number> } {
    const clauses: string[] = [];
    const params: Record<string, string | number> = {};
    if (filter.traceId !== undefined) {
      clauses.push('trace_id = @traceId');
      params['traceId'] = filter.traceId;
    }
    if (filter.employee !== undefined) {
      clauses.push('requester = @employee');
      params['employee'] = filter.employee;
    }
    if (filter.task !== undefined) {
      params['task'] = filter.task;
      // The approval line names only the first item (`items[0]`), so a task
      // filter has to reach the proposal's other lines through its items.
      // A table from before change sets has no `proposal_items`; there the
      // older object-only filter still answers, and `--proposal` reaches the rest.
      if (this.hasProposalItems()) {
        clauses.push(
          '(object_id = @task OR proposal_id IN (SELECT proposal_id FROM proposal_items WHERE record_type = @taskType AND record_id = @task))',
        );
        params['taskType'] = 'task';
      } else {
        clauses.push('object_id = @task');
      }
    }
    if (filter.proposal !== undefined) {
      clauses.push('proposal_id = @proposal');
      params['proposal'] = filter.proposal;
    }
    if (filter.entry !== undefined) {
      clauses.push('entry = @entry');
      params['entry'] = filter.entry;
    }
    return { where: clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`, params };
  }
}

/**
 * Owns the `trace` table (SR7). The table only grows: two triggers abort every
 * UPDATE and DELETE, so even code with database access cannot rewrite history.
 */
export class TraceStore extends TraceReader {
  constructor(
    db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    super(db);
    const existing = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'trace'").get() as
      | { sql: string }
      | undefined;
    if (existing === undefined) {
      db.exec(createTraceSql('trace'));
      db.exec(GUARDS_SQL);
      return;
    }

    // A table made before a column existed gets it; ADD COLUMN is not an UPDATE, so the triggers stay quiet.
    const columns = (db.prepare('PRAGMA table_info(trace)').all() as { name: string }[]).map((column) => column.name);
    for (const column of ['host_user', 'proposal_id', 'idempotency_key', 'attempts']) {
      if (!columns.includes(column)) {
        const type = column === 'attempts' ? 'INTEGER' : 'TEXT';
        db.exec(`ALTER TABLE trace ADD COLUMN ${column} ${type}`);
      }
    }
    // The `entry` check cannot be altered, so a table made before the `web` entry is copied into a new one.
    if (!existing.sql.includes("'web'")) this.rebuild();
  }

  /** Copy every line into a table whose checks know all the entries, keeping each `seq`. The triggers are put back at once. */
  private rebuild(): void {
    this.db.transaction(() => {
      this.db.exec(`
        DROP TRIGGER IF EXISTS trace_no_update;
        DROP TRIGGER IF EXISTS trace_no_delete;
        DROP INDEX IF EXISTS trace_requester;
        DROP INDEX IF EXISTS trace_object;
        ALTER TABLE trace RENAME TO trace_before_web;
      `);
      this.db.exec(createTraceSql('trace'));
      this.db.exec(`
        INSERT INTO trace (seq, trace_id, at, requester, caller, entry, tool, object_id, outcome, reason_code,
                           out_of_scope, rule_id, policy_version, host_user, proposal_id, idempotency_key, attempts, duration_ms)
        SELECT seq, trace_id, at, requester, caller, entry, tool, object_id, outcome, reason_code,
               out_of_scope, rule_id, policy_version, host_user, proposal_id, idempotency_key, attempts, duration_ms
        FROM trace_before_web;
        DROP TABLE trace_before_web;
      `);
      this.db.exec(GUARDS_SQL);
    })();
  }

  append(record: TraceRecord): void {
    const row: Row & { at: string } = {
      trace_id: record.traceId,
      at: this.now().toISOString(),
      requester: record.requester,
      caller: record.caller,
      entry: record.entry,
      tool: record.tool,
      object_id: record.objectId,
      outcome: record.outcome,
      reason_code: record.reasonCode,
      out_of_scope: record.outOfScope ? 1 : 0,
      rule_id: record.ruleId,
      policy_version: record.policyVersion,
      host_user: record.hostUser,
      proposal_id: record.proposalId ?? null,
      idempotency_key: record.idempotencyKey ?? null,
      attempts: record.attempts ?? null,
      duration_ms: Math.max(0, Math.round(record.durationMs)),
    };
    this.db
      .prepare(
        `INSERT INTO trace (trace_id, at, requester, caller, entry, tool, object_id, outcome, reason_code,
                            out_of_scope, rule_id, policy_version, host_user, proposal_id, idempotency_key,
                            attempts, duration_ms)
         VALUES (@trace_id, @at, @requester, @caller, @entry, @tool, @object_id, @outcome, @reason_code,
                 @out_of_scope, @rule_id, @policy_version, @host_user, @proposal_id, @idempotency_key,
                 @attempts, @duration_ms)`,
      )
      .run(row);
  }
}
