import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import type { TargetConfig, IdempotencySwitch } from './config.js';
import { seedTasks } from './seed.js';
import type { Department, Task, TaskChanges, TaskStatus } from './types.js';

export interface TaskFilter {
  readonly assignee?: string;
  readonly department?: Department;
  readonly status?: TaskStatus;
}

/** Who sends a write, and which idempotency scope the key belongs to. */
export interface WriteMeta {
  /** `gateway` for the connector, an employee code for a person editing directly. */
  readonly actor: string;
  /** The key after the scope prefix; two tokens never share a key. */
  readonly idempotencyKey: string;
  /** Milliseconds since the epoch, supplied by the caller so tests can control time. */
  readonly now: number;
}

export interface PatchInput extends WriteMeta {
  readonly taskId: string;
  /** Null when the target does not check a version. */
  readonly expectedVersion: number | null;
  readonly changes: TaskChanges;
}

export interface CreateInput extends WriteMeta {
  readonly title: string;
  readonly description: string;
  readonly assignee: string;
  readonly department: Department;
  readonly status: TaskStatus;
  readonly due: string;
}

export interface OtherWriteInput {
  readonly taskId: string;
  readonly changes: TaskChanges;
  /** Null means "I read the latest screen just before saving". */
  readonly expectedVersion: number | null;
  readonly actor: string;
  readonly now: number;
}

/** A response worth keeping: the exact status and body a caller received. */
export interface StoredResponse {
  readonly status: number;
  readonly body: string;
}

export interface LateJob {
  readonly operation: 'patch' | 'create';
  readonly key: string;
  readonly taskId: string;
  readonly expectedVersion: number;
  readonly changes: TaskChanges;
  /** The record a late create will insert. */
  readonly intended: Task | null;
  readonly willFail: boolean;
  readonly logId: number;
}

export type PatchOutcome =
  /** The key was seen before with the same content: the old response, untouched. */
  | { readonly kind: 'replayed'; readonly response: StoredResponse }
  /** The key was seen before with different content. */
  | { readonly kind: 'key_reused' }
  /** The target only enforces uniqueness and reports the repeat as an error. */
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict'; readonly currentVersion: number }
  | { readonly kind: 'written'; readonly response: StoredResponse }
  /** Accepted, but the final result is not known yet. */
  | { readonly kind: 'accepted'; readonly response: StoredResponse; readonly job: LateJob };

export type CreateOutcome =
  | { readonly kind: 'replayed'; readonly response: StoredResponse }
  | { readonly kind: 'key_reused' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'written'; readonly response: StoredResponse }
  | { readonly kind: 'accepted'; readonly response: StoredResponse; readonly job: LateJob };

export type OtherWriteOutcome =
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict'; readonly currentVersion: number }
  | { readonly kind: 'written'; readonly task: Task };

export interface WriteEntry {
  readonly id: number;
  readonly key: string;
  readonly actor: string | null;
  readonly kind: string;
  readonly fields: readonly string[];
  readonly state: 'processing' | 'applied' | 'failed';
  readonly notifications: number;
  readonly at: number;
  readonly appliedAt: number | null;
}

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
  created_at: number;
  state: 'processing' | 'done';
}

interface LogRow {
  id: number;
  task_id: string;
  key: string;
  actor: string | null;
  kind: string;
  fields: string;
  state: 'processing' | 'applied' | 'failed';
  notifications: number;
  at: number;
  applied_at: number | null;
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
CREATE TABLE IF NOT EXISTS write_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  key TEXT NOT NULL,
  actor TEXT,
  kind TEXT NOT NULL,
  fields TEXT NOT NULL,
  state TEXT NOT NULL,
  notifications INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  applied_at INTEGER
);
CREATE INDEX IF NOT EXISTS write_log_task ON write_log (task_id);
CREATE TABLE IF NOT EXISTS task_versions (
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  visible_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, version)
);
CREATE INDEX IF NOT EXISTS task_versions_visible ON task_versions (task_id, visible_at);
`;

/** Same task, same version, same changes: same fingerprint, whatever the key order. */
export function fingerprint(input: PatchInput): string {
  const changes = Object.fromEntries(Object.entries(input.changes).sort(([a], [b]) => (a < b ? -1 : 1)));
  return createHash('sha256')
    .update(JSON.stringify([input.taskId, input.expectedVersion, changes]))
    .digest('hex');
}

export function createFingerprint(input: CreateInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'create',
        input.title,
        input.description,
        input.assignee,
        input.department,
        input.status,
        input.due,
      ]),
    )
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

function differs(task: Task, changes: TaskChanges): boolean {
  return Object.entries(changes).some(([field, value]) => task[field as keyof TaskChanges] !== value);
}

function notificationFor(
  mode: TargetConfig['notifications'],
  task: Task | null,
  changes: TaskChanges | null,
): number {
  if (mode === 'none') return 0;
  if (mode === 'every_write') return 1;
  // on_change: a create is always a change, a patch only when a value really moved.
  if (task === null) return 1;
  return changes !== null && differs(task, changes) ? 1 : 0;
}

function processingResponse(task: Task, finalAt: number): StoredResponse {
  return {
    status: 200,
    body: `${JSON.stringify({ task, write_state: 'processing', final_at: new Date(finalAt).toISOString() })}\n`,
  };
}

/**
 * The only module that touches SQLite (ADR-0003). Every method is
 * synchronous, so one request is never interleaved with another. The
 * behaviour that differs between target profiles is read from the resolved
 * configuration, never from a profile name.
 */
export class TaskStore {
  readonly #db: Database.Database;
  readonly #config: TargetConfig;
  readonly #patch: (input: PatchInput) => PatchOutcome;
  readonly #other: (input: OtherWriteInput) => OtherWriteOutcome;
  readonly #finish: (job: LateJob) => void;
  #nextSeq = 1;
  #lateSequence = 0;

  constructor(path: string, config: TargetConfig) {
    this.#db = new Database(path);
    this.#config = config;
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('synchronous = FULL');
    this.#db.exec(SCHEMA);
    this.#addMissingKeyColumns();

    const count = this.#db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number };
    if (count.n === 0) this.#seed();
    this.#backfillVersions();
    this.#nextSeq = this.#maxSeq() + 1;

    // One transaction covers the key check, the version check, the write and
    // the saved response, so a crash leaves all of it or none of it.
    this.#patch = this.#db.transaction((input: PatchInput): PatchOutcome => this.#patchInTransaction(input)).immediate;
    this.#other = this.#db.transaction((input: OtherWriteInput): OtherWriteOutcome => this.#otherInTransaction(input)).immediate;
    this.#finish = this.#db.transaction((job: LateJob): void => this.#finishInTransaction(job)).immediate;
  }

  get(id: string): Task | undefined {
    if (this.#config.readDelayMs === 0) return this.#currentTask(id);
    const visibleAt = Date.now();
    const row = this.#db
      .prepare(
        'SELECT body FROM task_versions WHERE task_id = ? AND visible_at <= ? ORDER BY version DESC LIMIT 1',
      )
      .get(id, visibleAt) as { body: string } | undefined;
    return row === undefined ? undefined : (JSON.parse(row.body) as Task);
  }

  list(filter: TaskFilter): Task[] {
    if (this.#config.readDelayMs === 0) {
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

    const ids = this.#db.prepare('SELECT id FROM tasks ORDER BY seq').all() as { id: string }[];
    const visibleAt = Date.now();
    const pick = this.#db.prepare(
      'SELECT body FROM task_versions WHERE task_id = ? AND visible_at <= ? ORDER BY version DESC LIMIT 1',
    );
    const tasks: Task[] = [];
    for (const { id } of ids) {
      const row = pick.get(id, visibleAt) as { body: string } | undefined;
      if (row === undefined) continue;
      const task = JSON.parse(row.body) as Task;
      if (filter.assignee !== undefined && task.assignee !== filter.assignee) continue;
      if (filter.department !== undefined && task.department !== filter.department) continue;
      if (filter.status !== undefined && task.status !== filter.status) continue;
      tasks.push(task);
    }
    return tasks;
  }

  patch(input: PatchInput): PatchOutcome {
    return this.#patch(input);
  }

  create(input: CreateInput): CreateOutcome {
    return this.#db
      .transaction((value: CreateInput): CreateOutcome => this.#createInTransaction(value))
      .immediate(input);
  }

  otherWrite(input: OtherWriteInput): OtherWriteOutcome {
    return this.#other(input);
  }

  /** Apply or fail a write whose result was promised for later. */
  finishLate(job: LateJob): void {
    this.#finish(job);
  }

  /** How many writes really committed for a task, replays excluded. */
  writeCount(taskId: string): number {
    const row = this.#db.prepare('SELECT COUNT(*) AS n FROM writes WHERE task_id = ?').get(taskId) as { n: number };
    return row.n;
  }

  /** How many writes were applied to a task, counting only applied late results. */
  appliedCount(taskId: string): number {
    const row = this.#db
      .prepare("SELECT COUNT(*) AS n FROM write_log WHERE task_id = ? AND state = 'applied'")
      .get(taskId) as { n: number };
    return row.n;
  }

  /** How many notifications the target sent about a task. */
  notificationCount(taskId: string): number {
    const row = this.#db
      .prepare('SELECT COALESCE(SUM(notifications), 0) AS n FROM write_log WHERE task_id = ?')
      .get(taskId) as { n: number };
    return row.n;
  }

  /** The write history, with the actor hidden when the profile has no history. */
  writes(taskId: string): WriteEntry[] {
    const rows = this.#db.prepare('SELECT * FROM write_log WHERE task_id = ? ORDER BY id').all(taskId) as LogRow[];
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      actor: this.#config.writeHistory ? row.actor : null,
      kind: row.kind,
      fields: JSON.parse(row.fields) as string[],
      state: row.state,
      notifications: row.notifications,
      at: row.at,
      appliedAt: row.applied_at,
    }));
  }

  /** Back to the seed: tasks, saved keys, counters, write history and versions. */
  reset(): void {
    this.#db
      .transaction(() => {
        this.#db.exec(
          'DELETE FROM tasks; DELETE FROM idempotency; DELETE FROM writes; DELETE FROM write_log; DELETE FROM task_versions;',
        );
        this.#seed();
        this.#nextSeq = this.#maxSeq() + 1;
        this.#lateSequence = 0;
      })
      .immediate();
  }

  close(): void {
    this.#db.close();
  }

  #addMissingKeyColumns(): void {
    const columns = this.#db.prepare('PRAGMA table_info(idempotency)').all() as { name: string }[];
    if (!columns.some((column) => column.name === 'created_at')) {
      this.#db.exec('ALTER TABLE idempotency ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.some((column) => column.name === 'state')) {
      this.#db.exec("ALTER TABLE idempotency ADD COLUMN state TEXT NOT NULL DEFAULT 'done'");
    }
  }

  #maxSeq(): number {
    const row = this.#db.prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM tasks').get() as { n: number };
    return row.n;
  }

  #seed(): void {
    const insert = this.#db.prepare(
      'INSERT INTO tasks (seq, id, title, description, assignee, department, status, due, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const version = this.#db.prepare(
      'INSERT INTO task_versions (task_id, version, body, visible_at) VALUES (?, ?, ?, 0)',
    );
    const insertAll = this.#db.transaction((tasks: Task[]) => {
      tasks.forEach((task, index) => {
        insert.run(
          index + 1,
          task.id,
          task.title,
          task.description,
          task.assignee,
          task.department,
          task.status,
          task.due,
          task.version,
        );
        version.run(task.id, task.version, JSON.stringify(task));
      });
    });
    insertAll(seedTasks());
  }

  #backfillVersions(): void {
    const count = this.#db.prepare('SELECT COUNT(*) AS n FROM task_versions').get() as { n: number };
    if (count.n > 0) return;
    const rows = this.#db.prepare('SELECT * FROM tasks ORDER BY seq').all() as TaskRow[];
    const insert = this.#db.prepare(
      'INSERT INTO task_versions (task_id, version, body, visible_at) VALUES (?, ?, ?, 0)',
    );
    const insertAll = this.#db.transaction((tasks: TaskRow[]) => {
      for (const row of tasks) insert.run(row.id, row.version, JSON.stringify(toTask(row)));
    });
    insertAll(rows);
  }

  #currentTask(id: string): Task | undefined {
    const row = this.#db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row === undefined ? undefined : toTask(row);
  }

  #savedKey(key: string, sw: IdempotencySwitch, now: number): KeyRow | undefined {
    if (sw.memory === 'none') return undefined;
    const row = this.#db
      .prepare('SELECT fingerprint, status, body, created_at, state FROM idempotency WHERE key = ?')
      .get(key) as KeyRow | undefined;
    if (row === undefined) return undefined;
    const expired =
      sw.memory === 'seconds' &&
      row.state !== 'processing' &&
      now - row.created_at >= sw.memorySeconds * 1_000;
    if (!expired) return row;
    this.#db.prepare('DELETE FROM idempotency WHERE key = ?').run(key);
    return undefined;
  }

  #saveKey(
    key: string,
    fingerprintValue: string,
    taskId: string,
    response: StoredResponse,
    state: 'processing' | 'done',
    now: number,
  ): void {
    this.#db
      .prepare(
        `INSERT INTO idempotency (key, fingerprint, task_id, status, body, created_at, state)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           fingerprint = excluded.fingerprint,
           task_id = excluded.task_id,
           status = excluded.status,
           body = excluded.body,
           created_at = excluded.created_at,
           state = excluded.state`,
      )
      .run(key, fingerprintValue, taskId, response.status, response.body, now, state);
  }

  #finishKey(key: string, response: StoredResponse): void {
    this.#db
      .prepare("UPDATE idempotency SET status = ?, body = ?, state = 'done' WHERE key = ?")
      .run(response.status, response.body, key);
  }

  #logWrite(
    taskId: string,
    key: string,
    actor: string,
    kind: string,
    fields: readonly string[],
    notifications: number,
    state: 'processing' | 'applied' | 'failed',
    at: number,
    appliedAt: number | null,
  ): number {
    const result = this.#db
      .prepare(
        `INSERT INTO write_log (task_id, key, actor, kind, fields, state, notifications, at, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(taskId, key, actor, kind, JSON.stringify(fields), state, notifications, at, appliedAt);
    return Number(result.lastInsertRowid);
  }

  #applyPatch(
    current: Task,
    changes: TaskChanges,
    key: string,
    actor: string,
    now: number,
    log: boolean,
    kind: 'patch' | 'other',
  ): { task: Task; notifications: number } {
    const next: Task = { ...current, ...changes, version: current.version + 1 };
    this.#db
      .prepare('UPDATE tasks SET description = ?, assignee = ?, status = ?, due = ?, version = ? WHERE id = ?')
      .run(next.description, next.assignee, next.status, next.due, next.version, next.id);
    this.#db.prepare('INSERT INTO writes (task_id, key) VALUES (?, ?)').run(next.id, key);
    const notifications = notificationFor(this.#config.notifications, current, changes);
    if (log) {
      this.#logWrite(next.id, key, actor, kind, Object.keys(changes), notifications, 'applied', now, now);
    }
    this.#recordVersion(next, now + this.#config.readDelayMs);
    return { task: next, notifications };
  }

  #insertTask(task: Task, key: string, actor: string, now: number, log: boolean): number {
    const seq = Number(task.id.slice(2));
    this.#db
      .prepare(
        'INSERT INTO tasks (seq, id, title, description, assignee, department, status, due, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(seq, task.id, task.title, task.description, task.assignee, task.department, task.status, task.due, task.version);
    this.#db.prepare('INSERT INTO writes (task_id, key) VALUES (?, ?)').run(task.id, key);
    const notifications = notificationFor(this.#config.notifications, null, null);
    if (log) {
      this.#logWrite(
        task.id,
        key,
        actor,
        'create',
        ['title', 'description', 'assignee', 'department', 'status', 'due'],
        notifications,
        'applied',
        now,
        now,
      );
    }
    this.#recordVersion(task, now + this.#config.readDelayMs);
    return notifications;
  }

  #recordVersion(task: Task, visibleAt: number): void {
    this.#db
      .prepare(
        `INSERT INTO task_versions (task_id, version, body, visible_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(task_id, version) DO UPDATE SET body = excluded.body, visible_at = excluded.visible_at`,
      )
      .run(task.id, task.version, JSON.stringify(task), visibleAt);
  }

  #patchInTransaction(input: PatchInput): PatchOutcome {
    const sw = this.#config.idempotency.update;
    const print = fingerprint(input);

    // 1. Idempotency key first: a retry after a lost response must get the old answer.
    const seen = this.#savedKey(input.idempotencyKey, sw, input.now);
    if (seen !== undefined) {
      if (sw.repeat === 'duplicate_error') return { kind: 'duplicate' };
      if (seen.fingerprint !== print) return { kind: 'key_reused' };
      return { kind: 'replayed', response: { status: seen.status, body: seen.body } };
    }

    const current = this.#currentTask(input.taskId);
    if (current === undefined) return { kind: 'not_found' };

    // 2. Version: someone else changed the task since the caller read it.
    if (
      this.#config.versionCheck &&
      (input.expectedVersion === null || current.version !== input.expectedVersion)
    ) {
      return { kind: 'conflict', currentVersion: current.version };
    }

    if (this.#config.finalResult.mode === 'late') {
      this.#lateSequence += 1;
      const willFail =
        this.#config.finalResult.failureEvery > 0 &&
        this.#lateSequence % this.#config.finalResult.failureEvery === 0;
      const response = processingResponse(current, input.now + this.#config.finalResult.delayMs);
      const logId = this.#logWrite(
        input.taskId,
        input.idempotencyKey,
        input.actor,
        'patch',
        Object.keys(input.changes),
        0,
        'processing',
        input.now,
        null,
      );
      if (sw.memory !== 'none') {
        this.#saveKey(input.idempotencyKey, print, input.taskId, response, 'processing', input.now);
      }
      return {
        kind: 'accepted',
        response,
        job: {
          operation: 'patch',
          key: input.idempotencyKey,
          taskId: input.taskId,
          expectedVersion: current.version,
          changes: input.changes,
          intended: null,
          willFail,
          logId,
        },
      };
    }

    // 3. Write, bump the version, keep the response under the key.
    const { task } = this.#applyPatch(
      current,
      input.changes,
      input.idempotencyKey,
      input.actor,
      input.now,
      true,
      'patch',
    );
    const response: StoredResponse = { status: 200, body: `${JSON.stringify({ task })}\n` };
    if (sw.memory !== 'none') {
      this.#saveKey(input.idempotencyKey, print, input.taskId, response, 'done', input.now);
    }
    return { kind: 'written', response };
  }

  #createInTransaction(input: CreateInput): CreateOutcome {
    const sw = this.#config.idempotency.create;
    const print = createFingerprint(input);

    const seen = this.#savedKey(input.idempotencyKey, sw, input.now);
    if (seen !== undefined) {
      if (sw.repeat === 'duplicate_error') return { kind: 'duplicate' };
      if (seen.fingerprint !== print) return { kind: 'key_reused' };
      return { kind: 'replayed', response: { status: seen.status, body: seen.body } };
    }

    const seq = this.#nextSeq;
    this.#nextSeq += 1;
    const task: Task = {
      id: `T-${seq}`,
      title: input.title,
      description: input.description,
      assignee: input.assignee,
      department: input.department,
      status: input.status,
      due: input.due,
      version: 1,
    };

    if (this.#config.finalResult.mode === 'late') {
      this.#lateSequence += 1;
      const willFail =
        this.#config.finalResult.failureEvery > 0 &&
        this.#lateSequence % this.#config.finalResult.failureEvery === 0;
      const response = processingResponse(task, input.now + this.#config.finalResult.delayMs);
      const logId = this.#logWrite(
        task.id,
        input.idempotencyKey,
        input.actor,
        'create',
        ['title', 'description', 'assignee', 'department', 'status', 'due'],
        0,
        'processing',
        input.now,
        null,
      );
      if (sw.memory !== 'none') {
        this.#saveKey(input.idempotencyKey, print, task.id, response, 'processing', input.now);
      }
      return {
        kind: 'accepted',
        response,
        job: {
          operation: 'create',
          key: input.idempotencyKey,
          taskId: task.id,
          expectedVersion: 0,
          changes: {},
          intended: task,
          willFail,
          logId,
        },
      };
    }

    this.#insertTask(task, input.idempotencyKey, input.actor, input.now, true);
    const response: StoredResponse = { status: 201, body: `${JSON.stringify({ task })}\n` };
    if (sw.memory !== 'none') {
      this.#saveKey(input.idempotencyKey, print, task.id, response, 'done', input.now);
    }
    return { kind: 'written', response };
  }

  #otherInTransaction(input: OtherWriteInput): OtherWriteOutcome {
    const current = this.#currentTask(input.taskId);
    if (current === undefined) return { kind: 'not_found' };
    if (
      this.#config.versionCheck &&
      input.expectedVersion !== null &&
      current.version !== input.expectedVersion
    ) {
      return { kind: 'conflict', currentVersion: current.version };
    }
    const { task } = this.#applyPatch(
      current,
      input.changes,
      `other:${input.now}`,
      input.actor,
      input.now,
      true,
      'other',
    );
    return { kind: 'written', task };
  }

  #finishInTransaction(job: LateJob): void {
    const log = this.#db.prepare('SELECT state FROM write_log WHERE id = ?').get(job.logId) as
      | { state: string }
      | undefined;
    if (log === undefined || log.state !== 'processing') return;

    const fail = (response: StoredResponse): void => {
      this.#db.prepare("UPDATE write_log SET state = 'failed' WHERE id = ?").run(job.logId);
      this.#finishKey(job.key, response);
    };

    if (job.willFail) {
      fail({ status: 500, body: `${JSON.stringify({ error: 'async_write_failed' })}\n` });
      return;
    }

    if (job.operation === 'patch') {
      const current = this.#currentTask(job.taskId);
      if (current === undefined) {
        fail({ status: 404, body: `${JSON.stringify({ error: 'task_not_found' })}\n` });
        return;
      }
      if (this.#config.versionCheck && current.version !== job.expectedVersion) {
        fail({
          status: 409,
          body: `${JSON.stringify({ error: 'version_conflict', current_version: current.version })}\n`,
        });
        return;
      }
      const now = Date.now();
      const { task, notifications } = this.#applyPatch(
        current,
        job.changes,
        job.key,
        'gateway',
        now,
        false,
        'patch',
      );
      this.#db
        .prepare('UPDATE write_log SET state = ?, notifications = ?, applied_at = ? WHERE id = ?')
        .run('applied', notifications, now, job.logId);
      this.#finishKey(job.key, { status: 200, body: `${JSON.stringify({ task })}\n` });
      return;
    }

    const intended = job.intended;
    if (intended === null) {
      fail({ status: 500, body: `${JSON.stringify({ error: 'async_write_failed' })}\n` });
      return;
    }
    if (this.#currentTask(intended.id) !== undefined) {
      fail({ status: 409, body: `${JSON.stringify({ error: 'task_already_exists' })}\n` });
      return;
    }
    const now = Date.now();
    const notifications = this.#insertTask(intended, job.key, 'gateway', now, false);
    this.#db
      .prepare('UPDATE write_log SET state = ?, notifications = ?, applied_at = ? WHERE id = ?')
      .run('applied', notifications, now, job.logId);
    this.#finishKey(job.key, { status: 201, body: `${JSON.stringify({ task: intended })}\n` });
  }
}
