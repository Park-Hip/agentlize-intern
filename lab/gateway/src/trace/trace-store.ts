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
  readonly durationMs: number;
}

export interface TraceRow extends TraceRecord {
  readonly at: string;
}

export interface TraceFilter {
  readonly employee?: string;
  readonly task?: string;
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
    durationMs: row.duration_ms,
  };
}

/**
 * Owns the `trace` table (SR7). The table only grows: two triggers abort every
 * UPDATE and DELETE, so even code with database access cannot rewrite history.
 */
export class TraceStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
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
    for (const column of ['host_user', 'proposal_id']) {
      if (!columns.includes(column)) db.exec(`ALTER TABLE trace ADD COLUMN ${column} TEXT`);
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
                           out_of_scope, rule_id, policy_version, host_user, proposal_id, duration_ms)
        SELECT seq, trace_id, at, requester, caller, entry, tool, object_id, outcome, reason_code,
               out_of_scope, rule_id, policy_version, host_user, proposal_id, duration_ms
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
      duration_ms: Math.max(0, Math.round(record.durationMs)),
    };
    this.db
      .prepare(
        `INSERT INTO trace (trace_id, at, requester, caller, entry, tool, object_id, outcome, reason_code,
                            out_of_scope, rule_id, policy_version, host_user, proposal_id, duration_ms)
         VALUES (@trace_id, @at, @requester, @caller, @entry, @tool, @object_id, @outcome, @reason_code,
                 @out_of_scope, @rule_id, @policy_version, @host_user, @proposal_id, @duration_ms)`,
      )
      .run(row);
  }

  /** Newest lines first, at most `limit`. `employee` matches the asker, `task` the thing asked about. */
  list(filter: TraceFilter = {}): TraceRow[] {
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    if (filter.employee !== undefined) {
      where.push('requester = @employee');
      params['employee'] = filter.employee;
    }
    if (filter.task !== undefined) {
      where.push('object_id = @task');
      params['task'] = filter.task;
    }
    params['limit'] = filter.limit ?? DEFAULT_TRACE_LIMIT;

    const sql = `SELECT * FROM trace ${where.length === 0 ? '' : `WHERE ${where.join(' AND ')}`}
                 ORDER BY seq DESC LIMIT @limit`;
    return (this.db.prepare(sql).all(params) as Row[]).map(toRow);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS total FROM trace').get() as { total: number };
    return row.total;
  }
}
