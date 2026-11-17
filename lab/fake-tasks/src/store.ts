import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { seedTasks } from './seed.js';
import type { Department, Task, TaskChanges, TaskStatus } from './types.js';

export interface TaskFilter {
  readonly assignee?: string;
  readonly department?: Department;
  readonly status?: TaskStatus;
}

export interface PatchInput {
  readonly taskId: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly changes: TaskChanges;
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
  | { readonly kind: 'written'; readonly response: StoredResponse };

interface TaskRow {
  id: string;
  title: string;
  description: string;
  assignee: string;
  department: Department;
  status: TaskStatus;
  due: string;
  version: number;
}

interface KeyRow {
  fingerprint: string;
  status: number;
  body: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  assignee TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL,
  due TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks (assignee);
CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status INTEGER NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS writes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS writes_task ON writes (task_id);
`;

/** Same task, same version, same changes: same fingerprint, whatever the key order. */
export function fingerprint(input: PatchInput): string {
  const changes = Object.fromEntries(Object.entries(input.changes).sort(([a], [b]) => (a < b ? -1 : 1)));
  return createHash('sha256')
    .update(JSON.stringify([input.taskId, input.expectedVersion, changes]))
    .digest('hex');
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assignee: row.assignee,
    department: row.department,
    status: row.status,
    due: row.due,
    version: row.version,
  };
}

/**
 * The only module that touches SQLite (ADR-0003). Every method is
 * synchronous, so one request is never interleaved with another.
 */
export class TaskStore {
  readonly #db: Database.Database;
  readonly #patch: (input: PatchInput) => PatchOutcome;

  constructor(path: string) {
    this.#db = new Database(path);
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('synchronous = FULL');
    this.#db.exec(SCHEMA);

    const count = this.#db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number };
    if (count.n === 0) this.#seed();

    // One transaction covers the key check, the version check, the write and
    // the saved response, so a crash leaves all of it or none of it.
    this.#patch = this.#db.transaction((input: PatchInput): PatchOutcome => this.#patchInTransaction(input)).immediate;
  }

  get(id: string): Task | undefined {
    const row = this.#db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row === undefined ? undefined : toTask(row);
  }

  list(filter: TaskFilter): Task[] {
    const clauses: string[] = [];
    const values: string[] = [];
    for (const field of ['assignee', 'department', 'status'] as const) {
      const value = filter[field];
      if (value !== undefined) {
        clauses.push(`${field} = ?`);
        values.push(value);
      }
    }
    const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const rows = this.#db.prepare(`SELECT * FROM tasks ${where} ORDER BY seq`).all(...values) as TaskRow[];
    return rows.map(toTask);
  }

  patch(input: PatchInput): PatchOutcome {
    return this.#patch(input);
  }

  /** How many writes really committed for a task, replays excluded. */
  writeCount(taskId: string): number {
    const row = this.#db.prepare('SELECT COUNT(*) AS n FROM writes WHERE task_id = ?').get(taskId) as { n: number };
    return row.n;
  }

  /** Back to the seed: tasks, saved keys and write counts. */
  reset(): void {
    this.#db
      .transaction(() => {
        this.#db.exec('DELETE FROM tasks; DELETE FROM idempotency; DELETE FROM writes;');
        this.#seed();
      })
      .immediate();
  }

  close(): void {
    this.#db.close();
  }

  #seed(): void {
    const insert = this.#db.prepare(
      'INSERT INTO tasks (seq, id, title, description, assignee, department, status, due, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertAll = this.#db.transaction((tasks: Task[]) => {
      tasks.forEach((t, index) => {
        insert.run(index + 1, t.id, t.title, t.description, t.assignee, t.department, t.status, t.due, t.version);
      });
    });
    insertAll(seedTasks());
  }

  #patchInTransaction(input: PatchInput): PatchOutcome {
    const print = fingerprint(input);

    // 1. Idempotency key first: a retry after a lost response must get the old answer.
    const seen = this.#db.prepare('SELECT fingerprint, status, body FROM idempotency WHERE key = ?').get(input.idempotencyKey) as
      | KeyRow
      | undefined;
    if (seen !== undefined) {
      if (seen.fingerprint !== print) return { kind: 'key_reused' };
      return { kind: 'replayed', response: { status: seen.status, body: seen.body } };
    }

    const current = this.get(input.taskId);
    if (current === undefined) return { kind: 'not_found' };

    // 2. Version: someone else changed the task since the caller read it.
    if (current.version !== input.expectedVersion) {
      return { kind: 'conflict', currentVersion: current.version };
    }

    // 3. Write, bump the version, keep the response under the key.
    const next: Task = { ...current, ...input.changes, version: current.version + 1 };
    this.#db
      .prepare('UPDATE tasks SET description = ?, assignee = ?, status = ?, due = ?, version = ? WHERE id = ?')
      .run(next.description, next.assignee, next.status, next.due, next.version, next.id);

    const response: StoredResponse = { status: 200, body: `${JSON.stringify({ task: next })}\n` };
    this.#db
      .prepare('INSERT INTO idempotency (key, fingerprint, task_id, status, body) VALUES (?, ?, ?, ?, ?)')
      .run(input.idempotencyKey, print, input.taskId, response.status, response.body);
    this.#db.prepare('INSERT INTO writes (task_id, key) VALUES (?, ?)').run(input.taskId, input.idempotencyKey);

    return { kind: 'written', response };
  }
}
