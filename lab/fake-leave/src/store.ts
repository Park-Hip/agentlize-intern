import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import type { Department } from '@lab/shared';
import type { LeaveConfig } from './config.js';
import type { LeaveDecision, LeaveRequest, LeaveStatus, LeaveType } from './types.js';

export interface LeaveFilter {
  readonly employee?: string;
  /** One calendar day; a request matches when it falls between `from_date` and `to_date`. */
  readonly date?: string;
  readonly status?: LeaveStatus;
}

export interface CreateLeaveInput {
  readonly employee: string;
  readonly department: Department;
  readonly leave_type: LeaveType;
  readonly from_date: string;
  readonly to_date: string;
  readonly reason: string;
  readonly note: string;
  /** The gateway's fixed key; it is also the marker kept on the row. */
  readonly requestKey: string;
  /** Milliseconds since the epoch, supplied by the caller so tests can control time. */
  readonly now: number;
}

/** The exact status and body a caller received, kept so a replay is byte-for-byte the first answer. */
export interface StoredResponse {
  readonly status: number;
  readonly body: string;
}

export type CreateOutcome =
  | { readonly kind: 'replayed'; readonly response: StoredResponse }
  | { readonly kind: 'key_reused' }
  | { readonly kind: 'written'; readonly response: StoredResponse; readonly request: LeaveRequest };

interface LeaveRow {
  seq: number;
  code: string;
  employee: string;
  department: Department;
  leave_type: LeaveType;
  from_date: string;
  to_date: string;
  reason: string;
  note: string;
  status: LeaveStatus;
  decision: LeaveDecision;
  decide_at: number;
  decided_at: string | null;
  request_key: string;
  created_at: string;
}

interface KeyRow {
  fingerprint: string;
  status: number;
  body: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leave_requests (
  seq         INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  employee    TEXT NOT NULL,
  department  TEXT NOT NULL,
  leave_type  TEXT NOT NULL,
  from_date   TEXT NOT NULL,
  to_date     TEXT NOT NULL,
  reason      TEXT NOT NULL,
  note        TEXT NOT NULL,
  status      TEXT NOT NULL,
  decision    TEXT NOT NULL,
  decide_at   INTEGER NOT NULL,
  decided_at  TEXT,
  request_key TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leave_requests_employee ON leave_requests (employee, from_date, to_date);
CREATE INDEX IF NOT EXISTS leave_requests_status ON leave_requests (status);
CREATE TABLE IF NOT EXISTS idempotency (
  key         TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  status      INTEGER NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
`;

/** Same request, same values: same fingerprint, whatever the key order. */
export function leaveFingerprint(input: CreateLeaveInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'create',
        input.employee,
        input.leave_type,
        input.from_date,
        input.to_date,
        input.reason,
        input.note,
      ]),
    )
    .digest('hex');
}

function toLeave(row: LeaveRow): LeaveRequest {
  return {
    code: row.code,
    employee: row.employee,
    department: row.department,
    leave_type: row.leave_type,
    from_date: row.from_date,
    to_date: row.to_date,
    reason: row.reason,
    note: row.note,
    status: row.status,
    request_key: row.request_key,
    created_at: row.created_at,
    decided_at: row.decided_at ?? '',
  };
}

/**
 * The only module that touches SQLite (ADR-0003). The manager approval is
 * lazy: a read after `decide_at` moves a waiting request to the decision the
 * row was created with. That keeps the transition configurable and gives a
 * test the same answer without waiting on a timer.
 */
export class LeaveStore {
  readonly #db: Database.Database;
  readonly #config: LeaveConfig;
  readonly #createTx: (input: CreateLeaveInput) => CreateOutcome;
  #nextSeq = 1;

  constructor(path: string, config: LeaveConfig) {
    this.#db = new Database(path);
    this.#config = config;
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('synchronous = FULL');
    this.#db.exec(SCHEMA);
    this.#nextSeq = this.#maxSeq() + 1;
    this.#createTx = this.#db.transaction((input: CreateLeaveInput): CreateOutcome => this.#create(input)).immediate;
  }

  create(input: CreateLeaveInput): CreateOutcome {
    return this.#createTx(input);
  }

  get(code: string, now: number = Date.now()): LeaveRequest | undefined {
    this.#refreshDue(now);
    const row = this.#db.prepare('SELECT * FROM leave_requests WHERE code = ?').get(code) as LeaveRow | undefined;
    return row === undefined ? undefined : toLeave(row);
  }

  list(filter: LeaveFilter, now: number = Date.now()): LeaveRequest[] {
    this.#refreshDue(now);
    const clauses: string[] = [];
    const values: string[] = [];
    if (filter.employee !== undefined) {
      clauses.push('employee = ?');
      values.push(filter.employee);
    }
    if (filter.date !== undefined) {
      clauses.push('from_date <= ? AND to_date >= ?');
      values.push(filter.date, filter.date);
    }
    if (filter.status !== undefined) {
      clauses.push('status = ?');
      values.push(filter.status);
    }
    const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const rows = this.#db.prepare(`SELECT * FROM leave_requests ${where} ORDER BY seq`).all(...values) as LeaveRow[];
    return rows.map(toLeave);
  }

  /** How many requests the target really created; the counter a duplicate-key test reads. */
  createdCount(): number {
    const row = this.#db.prepare('SELECT COUNT(*) AS n FROM leave_requests').get() as { n: number };
    return row.n;
  }

  reset(): void {
    this.#db
      .transaction(() => {
        this.#db.exec('DELETE FROM leave_requests; DELETE FROM idempotency;');
        this.#nextSeq = 1;
      })
      .immediate();
  }

  close(): void {
    this.#db.close();
  }

  #create(input: CreateLeaveInput): CreateOutcome {
    const print = leaveFingerprint(input);
    if (this.#config.dedupCreate) {
      const seen = this.#db.prepare('SELECT fingerprint, status, body FROM idempotency WHERE key = ?').get(
        input.requestKey,
      ) as KeyRow | undefined;
      if (seen !== undefined) {
        if (seen.fingerprint !== print) return { kind: 'key_reused' };
        return { kind: 'replayed', response: { status: seen.status, body: seen.body } };
      }
    }

    const seq = this.#nextSeq;
    this.#nextSeq += 1;
    const decideAt = input.now + this.#config.decisionDelayMs;
    const request: LeaveRequest = {
      code: `NP-${seq}`,
      employee: input.employee,
      department: input.department,
      leave_type: input.leave_type,
      from_date: input.from_date,
      to_date: input.to_date,
      reason: input.reason,
      note: input.note,
      status: 'pending',
      request_key: input.requestKey,
      created_at: new Date(input.now).toISOString(),
      decided_at: '',
    };

    this.#db
      .prepare(
        `INSERT INTO leave_requests (seq, code, employee, department, leave_type, from_date, to_date, reason, note,
                                     status, decision, decide_at, decided_at, request_key, created_at)
         VALUES (@seq, @code, @employee, @department, @leave_type, @from_date, @to_date, @reason, @note,
                 @status, @decision, @decide_at, NULL, @request_key, @created_at)`,
      )
      .run({
        seq,
        code: request.code,
        employee: request.employee,
        department: request.department,
        leave_type: request.leave_type,
        from_date: request.from_date,
        to_date: request.to_date,
        reason: request.reason,
        note: request.note,
        status: request.status,
        decision: this.#config.decision,
        decide_at: decideAt,
        request_key: request.request_key,
        created_at: request.created_at,
      });

    const response: StoredResponse = { status: 201, body: `${JSON.stringify({ request })}\n` };
    if (this.#config.dedupCreate) {
      this.#db
        .prepare('INSERT INTO idempotency (key, fingerprint, status, body, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(input.requestKey, print, response.status, response.body, input.now);
    }
    return { kind: 'written', response, request };
  }

  #refreshDue(now: number): void {
    const due = this.#db
      .prepare("SELECT seq, decide_at FROM leave_requests WHERE status = 'pending' AND decide_at <= ?")
      .all(now) as { seq: number; decide_at: number }[];
    if (due.length === 0) return;
    const update = this.#db.prepare(
      "UPDATE leave_requests SET status = decision, decided_at = ? WHERE seq = ? AND status = 'pending'",
    );
    this.#db
      .transaction(() => {
        for (const row of due) update.run(new Date(row.decide_at).toISOString(), row.seq);
      })
      .immediate();
  }

  #maxSeq(): number {
    const row = this.#db.prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM leave_requests').get() as { n: number };
    return row.n;
  }
}
