import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { SEED_EMPLOYEES, type EmployeeDocument } from './seed.js';

export interface Employee {
  readonly employeeId: string;
  readonly version: number;
  readonly document: EmployeeDocument;
}

export interface EmployeeFilter {
  readonly name?: string | undefined;
  readonly department?: string | undefined;
}

export interface PatchInput {
  readonly employeeId: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly changes: Readonly<Record<string, string>>;
}

/** A response worth keeping: the exact status and body a caller received. */
export interface StoredResponse {
  readonly status: number;
  readonly body: string;
}

export type PatchOutcome =
  /** The key was seen before with the same content: the old response, untouched. */
  | { readonly kind: 'replayed'; readonly response: StoredResponse }
  /** The key was seen before with different content. */
  | { readonly kind: 'key_reused' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict'; readonly currentVersion: number }
  | { readonly kind: 'unknown_field'; readonly field: string }
  | { readonly kind: 'written'; readonly response: StoredResponse };

export type AddFieldResult = { readonly kind: 'added'; readonly count: number } | { readonly kind: 'exists' };

interface Row {
  employee_id: string;
  version: number;
  doc: string;
}

interface KeyRow {
  fingerprint: string;
  status: number;
  body: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  employee_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  doc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status INTEGER NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS writes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS writes_employee ON writes (employee_id);
`;

/** The JSON shape of one employee: the document with its code and version beside it. */
export function serializeEmployee(employee: Employee): Record<string, string | number> {
  return { employee_id: employee.employeeId, version: employee.version, ...employee.document };
}

/** Same employee, same version, same changes: same fingerprint, whatever the key order. */
export function fingerprintOf(input: PatchInput): string {
  const changes = Object.fromEntries(Object.entries(input.changes).sort(([a], [b]) => (a < b ? -1 : 1)));
  return createHash('sha256')
    .update(JSON.stringify([input.employeeId, input.expectedVersion, changes]))
    .digest('hex');
}

/**
 * Lower case, no accents, single spaces. Used so "minh", "Minh" and "MINH"
 * find the same person and "van hanh" finds "Vận hành".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toEmployee(row: Row): Employee {
  return { employeeId: row.employee_id, version: row.version, document: JSON.parse(row.doc) as EmployeeDocument };
}

/**
 * The only module that touches SQLite (ADR-0003), so the library can change
 * without touching the routes.
 * Each employee is one JSON document plus a code and a version column, so a
 * new field needs no schema change.
 */
export class DirectoryStore {
  private readonly db: Database.Database;

  constructor(file: string) {
    if (file !== ':memory:') {
      mkdirSync(dirname(file), { recursive: true });
    }
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.exec(SCHEMA);
    const { total } = this.db.prepare('SELECT COUNT(*) AS total FROM employees').get() as { total: number };
    if (total === 0) {
      this.reset();
    }
  }

  close(): void {
    this.db.close();
  }

  /** Replace everything with the fixed starting data, every version back to 1, and forget saved keys. */
  reset(): void {
    const insert = this.db.prepare('INSERT INTO employees (employee_id, version, doc) VALUES (?, 1, ?)');
    this.db.transaction(() => {
      this.db.exec('DELETE FROM employees; DELETE FROM idempotency; DELETE FROM writes;');
      for (const seed of SEED_EMPLOYEES) {
        insert.run(seed.employeeId, JSON.stringify(seed.document));
      }
    })();
  }

  /**
   * Filter by name and department only, nothing else.
   * A name matches whole words in order ("Hoa" does not match "Hoàng"); a
   * department must match fully.
   */
  list(filter: EmployeeFilter): Employee[] {
    const rows = this.db.prepare('SELECT employee_id, version, doc FROM employees ORDER BY employee_id').all() as Row[];
    const name = filter.name === undefined ? '' : normalize(filter.name);
    const department = filter.department === undefined ? '' : normalize(filter.department);

    return rows.map(toEmployee).filter((employee) => {
      if (name !== '' && !` ${normalize(employee.document.full_name ?? '')} `.includes(` ${name} `)) {
        return false;
      }
      return department === '' || normalize(employee.document.department ?? '') === department;
    });
  }

  get(employeeId: string): Employee | undefined {
    const row = this.db
      .prepare('SELECT employee_id, version, doc FROM employees WHERE employee_id = ?')
      .get(employeeId) as Row | undefined;
    return row === undefined ? undefined : toEmployee(row);
  }

  /** How many writes really committed for an employee, replays excluded. */
  writeCount(employeeId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM writes WHERE employee_id = ?').get(employeeId) as { n: number };
    return row.n;
  }

  /**
   * One versioned write. The order is the same as the fake task list: a saved
   * key first, so a retry after a lost answer gets the old response and not a
   * version conflict; then the record, the field names and the version.
   */
  patch(input: PatchInput): PatchOutcome {
    return this.db.transaction((): PatchOutcome => {
      const print = fingerprintOf(input);

      const seen = this.db.prepare('SELECT fingerprint, status, body FROM idempotency WHERE key = ?').get(input.idempotencyKey) as
        | KeyRow
        | undefined;
      if (seen !== undefined) {
        if (seen.fingerprint !== print) return { kind: 'key_reused' };
        return { kind: 'replayed', response: { status: seen.status, body: seen.body } };
      }

      const row = this.db
        .prepare('SELECT employee_id, version, doc FROM employees WHERE employee_id = ?')
        .get(input.employeeId) as Row | undefined;
      if (row === undefined) {
        return { kind: 'not_found' };
      }

      const document = JSON.parse(row.doc) as EmployeeDocument;
      for (const field of Object.keys(input.changes)) {
        if (!Object.hasOwn(document, field)) {
          return { kind: 'unknown_field', field };
        }
      }
      if (row.version !== input.expectedVersion) {
        return { kind: 'conflict', currentVersion: row.version };
      }

      const next = row.version + 1;
      const changed = this.db
        .prepare('UPDATE employees SET version = ?, doc = ? WHERE employee_id = ? AND version = ?')
        .run(next, JSON.stringify({ ...document, ...input.changes }), input.employeeId, row.version);
      if (changed.changes !== 1) {
        return { kind: 'conflict', currentVersion: row.version };
      }

      const employee: Employee = { employeeId: input.employeeId, version: next, document: { ...document, ...input.changes } };
      const response: StoredResponse = { status: 200, body: `${JSON.stringify(serializeEmployee(employee))}\n` };
      this.db
        .prepare('INSERT INTO idempotency (key, fingerprint, employee_id, status, body) VALUES (?, ?, ?, ?, ?)')
        .run(input.idempotencyKey, print, input.employeeId, response.status, response.body);
      this.db.prepare('INSERT INTO writes (employee_id, key) VALUES (?, ?)').run(input.employeeId, input.idempotencyKey);

      return { kind: 'written', response };
    }).immediate();
  }

  /** Add one field to every employee and raise every version, since every document changed. */
  addField(field: string, value: string): AddFieldResult {
    return this.db.transaction((): AddFieldResult => {
      const rows = this.db.prepare('SELECT employee_id, version, doc FROM employees').all() as Row[];
      if (rows.some((row) => Object.hasOwn(JSON.parse(row.doc) as EmployeeDocument, field))) {
        return { kind: 'exists' };
      }
      const update = this.db.prepare('UPDATE employees SET version = version + 1, doc = ? WHERE employee_id = ?');
      for (const row of rows) {
        update.run(JSON.stringify({ ...(JSON.parse(row.doc) as EmployeeDocument), [field]: value }), row.employee_id);
      }
      return { kind: 'added', count: rows.length };
    })();
  }
}
