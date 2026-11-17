import { randomBytes } from 'node:crypto';
import type { ReasonCode } from '@lab/shared';
import type { GatewayDatabase } from '../database.js';

/** Where a call came in. `mcp` is reserved for the `/mcp` door of a later milestone. */
export const ENTRIES = ['http', 'mcp'] as const;
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
  duration_ms: number;
}

const quoted = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

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
    db.exec(`
      CREATE TABLE IF NOT EXISTS trace (
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
        duration_ms    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS trace_requester ON trace (requester);
      CREATE INDEX IF NOT EXISTS trace_object ON trace (object_id);
      CREATE TRIGGER IF NOT EXISTS trace_no_update BEFORE UPDATE ON trace
      BEGIN SELECT RAISE(ABORT, 'trace is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trace_no_delete BEFORE DELETE ON trace
      BEGIN SELECT RAISE(ABORT, 'trace is append-only'); END;
    `);
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
      duration_ms: Math.max(0, Math.round(record.durationMs)),
    };
    this.db
      .prepare(
        `INSERT INTO trace (trace_id, at, requester, caller, entry, tool, object_id, outcome, reason_code,
                            out_of_scope, rule_id, policy_version, duration_ms)
         VALUES (@trace_id, @at, @requester, @caller, @entry, @tool, @object_id, @outcome, @reason_code,
                 @out_of_scope, @rule_id, @policy_version, @duration_ms)`,
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
