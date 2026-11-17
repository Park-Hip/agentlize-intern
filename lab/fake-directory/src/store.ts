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

export type UpdateResult =
  | { readonly kind: 'updated'; readonly employee: Employee }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict'; readonly currentVersion: number }
  | { readonly kind: 'unknown_field'; readonly field: string };

export type AddFieldResult = { readonly kind: 'added'; readonly count: number } | { readonly kind: 'exists' };

interface Row {
  employee_id: string;
  version: number;
  doc: string;
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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS employees (
        employee_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        doc TEXT NOT NULL
      )
    `);
    const { total } = this.db.prepare('SELECT COUNT(*) AS total FROM employees').get() as { total: number };
    if (total === 0) {
      this.reset();
    }
  }

  close(): void {
    this.db.close();
  }

  /** Replace everything with the fixed starting data, every version back to 1. */
  reset(): void {
    const insert = this.db.prepare('INSERT INTO employees (employee_id, version, doc) VALUES (?, 1, ?)');
    this.db.transaction(() => {
      this.db.exec('DELETE FROM employees');
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

  /** Apply changes if the stored version still equals `expectedVersion`. */
  update(employeeId: string, expectedVersion: number, changes: Readonly<Record<string, string>>): UpdateResult {
    return this.db.transaction((): UpdateResult => {
      const row = this.db
        .prepare('SELECT employee_id, version, doc FROM employees WHERE employee_id = ?')
        .get(employeeId) as Row | undefined;
      if (row === undefined) {
        return { kind: 'not_found' };
      }

      const document = JSON.parse(row.doc) as EmployeeDocument;
      for (const field of Object.keys(changes)) {
        if (!Object.hasOwn(document, field)) {
          return { kind: 'unknown_field', field };
        }
      }
      if (row.version !== expectedVersion) {
        return { kind: 'conflict', currentVersion: row.version };
      }

      const next = row.version + 1;
      const result = this.db
        .prepare('UPDATE employees SET version = ?, doc = ? WHERE employee_id = ? AND version = ?')
        .run(next, JSON.stringify({ ...document, ...changes }), employeeId, row.version);
      if (result.changes !== 1) {
        return { kind: 'conflict', currentVersion: row.version };
      }

      return { kind: 'updated', employee: { employeeId, version: next, document: { ...document, ...changes } } };
    })();
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
