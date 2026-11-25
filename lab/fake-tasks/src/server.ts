import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { z } from 'zod';
import {
  LOOPBACK_HOST,
  PERSONAS,
  hasValidServiceKey,
  readServiceKey,
  resolveDataDir,
  resolvePort,
  testHooksEnabled,
} from '@lab/shared';
import { readTargetConfig, type IdempotencySwitch, type RateLimitMode, type RepeatMode } from './config.js';
import {
  TaskStore,
  type AddMemberInput,
  type LateJob,
  type MemberInput,
  type PatchInput,
  type StoredResponse,
  type TaskFilter,
} from './store.js';
import { DEPARTMENTS, TASK_STATUSES, type Department, type TaskChanges, type TaskStatus } from './types.js';

const MAX_BODY_BYTES = 64 * 1024;
const TASK_ID = /^T-[1-9][0-9]*$/;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const EMPLOYEE_CODE = /^NV-[0-9]{2}$/;
const ACTOR_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;
const MAX_TOKEN_MS = 86_400_000;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), 'not a calendar date');

const changesSchema = z
  .strictObject({
    assignee: z.string().regex(EMPLOYEE_CODE),
    due: dateSchema,
    description: z.string().max(2_000),
    status: z.enum(TASK_STATUSES),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, 'changes must name at least one field');

const createBodySchema = z.strictObject({
  title: z.string().min(1).max(500),
  description: z.string().max(2_000),
  assignee: z.string().regex(EMPLOYEE_CODE),
  department: z.enum(DEPARTMENTS),
  status: z.enum(TASK_STATUSES).optional(),
  due: dateSchema,
});

function patchBodySchema(versionCheck: boolean) {
  const expectedVersion = versionCheck ? z.number().int().min(1) : z.number().int().min(1).optional();
  return z.strictObject({ changes: changesSchema, expected_version: expectedVersion });
}

const tokenBodySchema = z.strictObject({
  ttl_ms: z.number().int().min(1).max(MAX_TOKEN_MS).optional(),
});

const otherWriteBodySchema = z.strictObject({
  task_id: z.string().regex(TASK_ID),
  changes: changesSchema,
  expected_version: z.number().int().min(1).optional(),
});

const memberBodySchema = z.strictObject({
  members: z.array(z.string().regex(EMPLOYEE_CODE)).min(1).max(100),
});

/** Which write a drop fault applies to; the default keeps the old behaviour for every write. */
const dropCalls = ['any', 'add_members', 'remove_members'] as const;
type DropCall = (typeof dropCalls)[number];

const faultBodySchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('drop_response_after_commit'),
    count: z.number().int().min(0).max(1_000).default(1),
    /** Only a member call of this kind is dropped; a PATCH or create does not use the fault. */
    call: z.enum(dropCalls).default('any'),
  }),
  z.strictObject({
    /** Commit, then hold the answer open so a test can stop the caller before it hears the result. */
    mode: z.literal('delay_response_after_commit'),
    count: z.number().int().min(0).max(1_000).default(1),
    delay_ms: z.number().int().min(1).max(60_000).default(1_500),
  }),
  z.strictObject({
    /**
     * Hold one chosen item before it commits, so a test can stop the gateway
     * before the first write of an item. The position comes from the
     * idempotency key `<proposal>:<position>`.
     */
    mode: z.literal('hold_item_before_commit'),
    position: z.number().int().min(1).max(1_000),
    delay_ms: z.number().int().min(1).max(120_000).default(60_000),
  }),
  z.strictObject({
    /**
     * Commit one chosen item, then hold its answer, so a test can stop the
     * gateway between that item and the next. The position comes from the
     * idempotency key `<proposal>:<position>`.
     */
    mode: z.literal('hold_item_after_commit'),
    position: z.number().int().min(1).max(1_000),
    delay_ms: z.number().int().min(1).max(120_000).default(60_000),
  }),
]);

export interface TasksServerOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Explicit port, used by tests with 0. Defaults to `LAB_TASKS_PORT`. */
  readonly port?: number;
  /** Explicit SQLite path. Defaults to `<data dir>/tasks.sqlite`. */
  readonly dbPath?: string;
}

export interface RunningTasksServer {
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
    readonly headers: Record<string, string> = {},
    readonly responseBody?: unknown,
  ) {
    super(code);
  }
}

function sendRaw(res: ServerResponse, response: StoredResponse, headers: Record<string, string> = {}): void {
  res.writeHead(response.status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(response.body);
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  sendRaw(res, { status, body: `${JSON.stringify(body)}\n` }, headers);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'body_too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue === undefined ? undefined : `${issue.path.join('.')}: ${issue.message}`;
    throw new HttpError(400, 'invalid_body', detail);
  }
  return result.data;
}

/** zod types an absent optional field as `undefined`; the store wants it absent. */
function definedOnly(changes: z.infer<typeof changesSchema>): TaskChanges {
  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as TaskChanges;
}

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function parseFilter(params: URLSearchParams): TaskFilter {
  const assignee = params.get('assignee');
  const department = params.get('department');
  const status = params.get('status');
  const filter: { assignee?: string; department?: Department; status?: TaskStatus } = {};

  if (assignee !== null) {
    if (!EMPLOYEE_CODE.test(assignee)) throw new HttpError(400, 'invalid_query', 'assignee');
    filter.assignee = assignee;
  }
  if (department !== null) {
    if (!isOneOf(DEPARTMENTS, department)) throw new HttpError(400, 'invalid_query', 'department');
    filter.department = department;
  }
  if (status !== null) {
    if (!isOneOf(TASK_STATUSES, status)) throw new HttpError(400, 'invalid_query', 'status');
    filter.status = status;
  }
  return filter;
}

function actorOf(req: IncomingMessage): string {
  const raw = req.headers['x-lab-actor'];
  if (raw === undefined) return 'gateway';
  if (typeof raw !== 'string' || !ACTOR_PATTERN.test(raw)) throw new HttpError(400, 'invalid_actor');
  return raw;
}

function rateLimitHeaders(mode: RateLimitMode, waitMs: number): Record<string, string> {
  const seconds = String(Math.max(1, Math.ceil(waitMs / 1_000)));
  if (mode === 'retry_after') return { 'retry-after': seconds };
  if (mode === 'custom_header') return { 'x-ogw-ratelimit-reset': seconds };
  return {};
}

function rateLimitBody(mode: RateLimitMode): unknown {
  if (mode === 'custom_header') {
    return { code: 99991400, msg: 'request trigger frequency limit' };
  }
  return undefined;
}

interface Waiting {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

/**
 * Start the fake task list: loopback only, every route behind the service key.
 * The key and the target profile are read before the socket opens, so a
 * misconfigured process never answers a request.
 */
export async function startTasksServer(options: TasksServerOptions = {}): Promise<RunningTasksServer> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);
  const hooks = testHooksEnabled(env);
  const port = options.port ?? resolvePort('tasks', env);
  const { profile, config } = readTargetConfig(env);

  let dbPath = options.dbPath;
  if (dbPath === undefined) {
    const dataDir = resolveDataDir(env);
    mkdirSync(dataDir, { recursive: true });
    dbPath = join(dataDir, 'tasks.sqlite');
  }
  const store = new TaskStore(dbPath, config);
  const bodySchema = patchBodySchema(config.versionCheck);

  /** Committed writes whose response is still to be dropped (test hook). */
  let dropsLeft = 0;
  /** The write kind a drop fault waits for; `any` keeps the old behaviour. */
  let dropCall: DropCall = 'any';
  /** Committed writes whose response is held open for a while (test hook). */
  let delaysLeft = 0;
  let delayMs = 0;
  /** One chosen position whose send is held, so a test can stop the gateway between items. */
  let heldPosition: number | null = null;
  let heldMs = 0;
  let heldBeforeCommit = false;

  /** Access tokens for the `token` idempotency scope. Never written to the database. */
  const tokens = new Map<string, { readonly id: string; readonly expiresAt: number }>();
  const inFlight = new Map<string, Waiting>();
  const pendingTimers = new Set<NodeJS.Timeout>();
  let generation = 0;
  let closed = false;

  const limiter = (() => {
    const setting = config.rateLimit;
    let timestamps: number[] = [];
    let blockedUntil = 0;
    return {
      enforce(now: number): void {
        if (setting.mode === 'none') return;
        const wait = (): never => {
          const waitMs = Math.max(1, blockedUntil - now);
          throw new HttpError(
            429,
            'rate_limited',
            undefined,
            rateLimitHeaders(setting.mode, waitMs),
            rateLimitBody(setting.mode),
          );
        };
        if (blockedUntil > now) {
          if (setting.mode === 'silent') blockedUntil = now + setting.extraBlockSeconds * 1_000;
          wait();
        }
        timestamps = timestamps.filter((stamp) => now - stamp < setting.windowMs);
        if (timestamps.length >= setting.maxRequests) {
          blockedUntil = now + setting.retryAfterSeconds * 1_000;
          wait();
        }
        timestamps.push(now);
      },
      reset(): void {
        timestamps = [];
        blockedUntil = 0;
      },
    };
  })();

  function tokenSeconds(): number {
    if (config.idempotency.create.scope === 'token') return config.idempotency.create.tokenSeconds;
    if (config.idempotency.update.scope === 'token') return config.idempotency.update.tokenSeconds;
    return 7_200;
  }

  function scopeOf(open: IdempotencySwitch, req: IncomingMessage, now: number): string {
    if (open.scope === 'service_key') return '';
    const raw = req.headers['x-lab-token'];
    if (typeof raw !== 'string' || raw === '') throw new HttpError(401, 'invalid_token');
    const token = tokens.get(raw);
    if (token === undefined) throw new HttpError(401, 'invalid_token');
    if (token.expiresAt <= now) {
      tokens.delete(raw);
      throw new HttpError(401, 'token_expired');
    }
    return token.id;
  }

  function scopedKey(scope: string, key: string): string {
    return scope === '' ? key : `${scope}:${key}`;
  }

  async function enterInFlight(key: string, repeat: RepeatMode): Promise<Waiting | undefined> {
    if (repeat === 'replay') return undefined;
    const existing = inFlight.get(key);
    if (existing !== undefined) {
      if (repeat === 'wait') {
        await existing.promise;
        return undefined;
      }
      if (repeat === 'conflict') throw new HttpError(409, 'write_in_progress');
      if (repeat === 'conflict_1470422') {
        throw new HttpError(500, 'client_token_conflict', undefined, {}, {
          code: 1470422,
          msg: 'concurrent requests with the same client_token',
        });
      }
      throw new HttpError(409, 'duplicate_idempotency_key');
    }

    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const entry: Waiting = { promise, resolve };
    inFlight.set(key, entry);
    return entry;
  }

  function leaveInFlight(key: string, entry: Waiting | undefined): void {
    if (entry === undefined) return;
    inFlight.delete(key);
    entry.resolve();
  }

  function scheduleLate(job: LateJob): void {
    const startedAt = generation;
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (closed || startedAt !== generation) return;
      try {
        store.finishLate(job);
      } catch (error) {
        console.error(`[fake-tasks] late write failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, config.finalResult.delayMs);
    timer.unref();
    pendingTimers.add(timer);
  }

  /** The position part of `<proposal>:<position>`, or null for a key from another caller. */
  function positionOfKey(key: string): number | null {
    const match = /:(\d+)$/.exec(key);
    return match === null ? null : Number(match[1]);
  }

  /** Commit, then answer late; the caller being gone is fine, the committed write is what matters. */
  function answerLater(res: ServerResponse, response: StoredResponse, afterMs: number): void {
    const timer = setTimeout(() => {
      try {
        if (!res.writableEnded && !res.destroyed) sendRaw(res, response);
      } catch {
        // The caller is gone; the committed write is what the test needs.
      }
    }, afterMs);
    timer.unref();
  }

  async function holdBeforeCommit(key: string): Promise<void> {
    if (!heldBeforeCommit || heldPosition === null || positionOfKey(key) !== heldPosition) return;
    const afterMs = heldMs;
    heldPosition = null;
    // The caller can be stopped before the write; nothing is committed yet.
    await new Promise<void>((resolveWait) => {
      const timer = setTimeout(resolveWait, afterMs);
      timer.unref();
    });
  }

  function sendCommitted(
    req: IncomingMessage,
    res: ServerResponse,
    key: string,
    response: StoredResponse,
    kind: 'patch' | 'create' | 'add_members' | 'remove_members',
  ): void {
    if (!heldBeforeCommit && heldPosition !== null && positionOfKey(key) === heldPosition) {
      const afterMs = heldMs;
      heldPosition = null;
      answerLater(res, response, afterMs);
      return;
    }
    if (dropsLeft > 0 && (dropCall === 'any' || dropCall === kind)) {
      // The write is committed; the caller never hears about it.
      dropsLeft -= 1;
      req.socket.destroy();
      return;
    }
    if (delaysLeft > 0) {
      // The write is committed; the answer is held so a caller can be stopped before reading it.
      delaysLeft -= 1;
      answerLater(res, response, delayMs);
      return;
    }
    sendRaw(res, response);
  }

  async function handlePatch(req: IncomingMessage, res: ServerResponse, taskId: string, body: unknown): Promise<void> {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new HttpError(400, 'invalid_idempotency_key', 'Idempotency-Key header is required');
    }
    const parsed = parseBody(bodySchema, body);
    if (config.memberCalls && parsed.changes.assignee !== undefined) {
      // Lark Task: "Task member/reminder/tasklist data cannot be updated by this api."
      throw new HttpError(400, 'assignee_not_patchable', 'Change task members through add_members and remove_members');
    }
    const sw = config.idempotency.update;
    const now = Date.now();
    const scope = scopeOf(sw, req, now);
    const storedKey = scopedKey(scope, key);
    const actor = actorOf(req);
    limiter.enforce(now);

    const entry = await enterInFlight(storedKey, sw.repeat);
    try {
      await holdBeforeCommit(storedKey);
      const input: PatchInput = {
        taskId,
        idempotencyKey: storedKey,
        expectedVersion: parsed.expected_version ?? null,
        changes: definedOnly(parsed.changes),
        actor,
        now,
      };
      const outcome = store.patch(input);
      switch (outcome.kind) {
        case 'replayed':
          sendRaw(res, outcome.response, { 'idempotent-replayed': 'true' });
          return;
        case 'key_reused':
          throw new HttpError(422, 'idempotency_key_reused', 'This key was used with different content');
        case 'duplicate':
          throw new HttpError(409, 'duplicate_idempotency_key', 'This key was used before');
        case 'not_found':
          throw new HttpError(404, 'task_not_found');
        case 'conflict':
          sendJson(res, 409, { error: 'version_conflict', current_version: outcome.currentVersion });
          return;
        case 'written':
          sendCommitted(req, res, storedKey, outcome.response, 'patch');
          return;
        case 'accepted':
          scheduleLate(outcome.job);
          sendRaw(res, outcome.response, { 'write-state': 'processing' });
          return;
      }
    } finally {
      leaveInFlight(storedKey, entry);
    }
  }

  async function handleCreate(req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new HttpError(400, 'invalid_idempotency_key', 'Idempotency-Key header is required');
    }
    const parsed = parseBody(createBodySchema, body);
    const sw = config.idempotency.create;
    const now = Date.now();
    const scope = scopeOf(sw, req, now);
    const storedKey = scopedKey(scope, key);
    const actor = actorOf(req);
    limiter.enforce(now);

    const entry = await enterInFlight(storedKey, sw.repeat);
    try {
      await holdBeforeCommit(storedKey);
      const outcome = store.create({
        idempotencyKey: storedKey,
        title: parsed.title,
        description: parsed.description,
        assignee: parsed.assignee,
        department: parsed.department,
        status: parsed.status ?? 'todo',
        due: parsed.due,
        actor,
        now,
      });
      switch (outcome.kind) {
        case 'replayed':
          sendRaw(res, outcome.response, { 'idempotent-replayed': 'true' });
          return;
        case 'key_reused':
          throw new HttpError(422, 'idempotency_key_reused', 'This key was used with different content');
        case 'duplicate':
          throw new HttpError(409, 'duplicate_idempotency_key', 'This key was used before');
        case 'written':
          sendCommitted(req, res, storedKey, outcome.response, 'create');
          return;
        case 'accepted':
          scheduleLate(outcome.job);
          sendRaw(res, outcome.response, { 'write-state': 'processing' });
          return;
      }
    } finally {
      leaveInFlight(storedKey, entry);
    }
  }

  async function handleAddMembers(req: IncomingMessage, res: ServerResponse, taskId: string, body: unknown): Promise<void> {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new HttpError(400, 'invalid_idempotency_key', 'Idempotency-Key header is required');
    }
    const parsed = parseBody(memberBodySchema, body);
    const actor = actorOf(req);
    const now = Date.now();
    limiter.enforce(now);

    const input: AddMemberInput = {
      taskId,
      members: parsed.members,
      actor,
      idempotencyKey: key,
      now,
    };
    const outcome = store.addMembers(input);
    switch (outcome.kind) {
      case 'replayed':
        sendRaw(res, outcome.response, { 'idempotent-replayed': 'true' });
        return;
      case 'key_reused':
        throw new HttpError(422, 'idempotency_key_reused', 'This key was used with different content');
      case 'not_found':
        throw new HttpError(404, 'task_not_found');
      case 'unchanged':
        sendRaw(res, outcome.response);
        return;
      case 'written':
        sendCommitted(req, res, key, outcome.response, 'add_members');
        return;
    }
  }

  async function handleRemoveMembers(
    req: IncomingMessage,
    res: ServerResponse,
    taskId: string,
    body: unknown,
  ): Promise<void> {
    const parsed = parseBody(memberBodySchema, body);
    const actor = actorOf(req);
    const now = Date.now();
    limiter.enforce(now);

    const input: MemberInput = {
      taskId,
      members: parsed.members,
      actor,
      now,
    };
    const outcome = store.removeMembers(input);
    switch (outcome.kind) {
      case 'not_found':
        throw new HttpError(404, 'task_not_found');
      case 'unchanged':
        sendRaw(res, outcome.response);
        return;
      case 'written':
        sendCommitted(req, res, `member:remove:${taskId}:${now}`, outcome.response, 'remove_members');
        return;
    }
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!hasValidServiceKey(req.headers.authorization, serviceKey)) {
      sendJson(res, 401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/health') {
      if (method !== 'GET') throw new HttpError(405, 'method_not_allowed');
      sendJson(res, 200, { status: 'ok', service: 'tasks' });
      return;
    }

    if (path === '/tasks') {
      if (method === 'GET') {
        sendJson(res, 200, { tasks: store.list(parseFilter(url.searchParams)) });
        return;
      }
      if (method === 'POST') {
        await handleCreate(req, res, await readJson(req));
        return;
      }
      throw new HttpError(405, 'method_not_allowed');
    }

    const memberMatch = /^\/tasks\/([^/]+)\/(add_members|remove_members)$/.exec(path);
    if (memberMatch !== null) {
      if (!config.memberCalls) throw new HttpError(404, 'not_found');
      const id = decodeURIComponent(memberMatch[1] ?? '');
      if (!TASK_ID.test(id)) throw new HttpError(404, 'task_not_found');
      if (method !== 'POST') throw new HttpError(405, 'method_not_allowed');
      const body = await readJson(req);
      if (memberMatch[2] === 'add_members') await handleAddMembers(req, res, id, body);
      else await handleRemoveMembers(req, res, id, body);
      return;
    }

    const taskMatch = /^\/tasks\/([^/]+)$/.exec(path);
    if (taskMatch !== null) {
      const id = decodeURIComponent(taskMatch[1] ?? '');
      if (method === 'GET') {
        const task = TASK_ID.test(id) ? store.get(id) : undefined;
        if (task === undefined) throw new HttpError(404, 'task_not_found');
        sendJson(res, 200, task);
        return;
      }
      if (method === 'PATCH') {
        if (!TASK_ID.test(id)) throw new HttpError(404, 'task_not_found');
        await handlePatch(req, res, id, await readJson(req));
        return;
      }
      throw new HttpError(405, 'method_not_allowed');
    }

    if (hooks) {
      if (path === '/admin/reset' && method === 'POST') {
        generation += 1;
        for (const timer of pendingTimers) clearTimeout(timer);
        pendingTimers.clear();
        tokens.clear();
        limiter.reset();
        store.reset();
        dropsLeft = 0;
        dropCall = 'any';
        delaysLeft = 0;
        delayMs = 0;
        heldPosition = null;
        heldMs = 0;
        heldBeforeCommit = false;
        sendJson(res, 200, { status: 'reset' });
        return;
      }
      if (path === '/admin/faults' && method === 'POST') {
        const fault = parseBody(faultBodySchema, await readJson(req));
        if (fault.mode === 'hold_item_after_commit' || fault.mode === 'hold_item_before_commit') {
          dropsLeft = 0;
          dropCall = 'any';
          delaysLeft = 0;
          delayMs = 0;
          heldPosition = fault.position;
          heldMs = fault.delay_ms;
          heldBeforeCommit = fault.mode === 'hold_item_before_commit';
          sendJson(res, 200, { mode: fault.mode, position: heldPosition, delay_ms: heldMs });
          return;
        }
        heldPosition = null;
        heldMs = 0;
        heldBeforeCommit = false;
        if (fault.mode === 'delay_response_after_commit') {
          dropsLeft = 0;
          dropCall = 'any';
          delaysLeft = fault.count;
          delayMs = fault.delay_ms;
          sendJson(res, 200, { mode: fault.mode, count: delaysLeft, delay_ms: delayMs });
          return;
        }
        dropsLeft = fault.count;
        dropCall = fault.call;
        delaysLeft = 0;
        delayMs = 0;
        sendJson(res, 200, { mode: fault.mode, count: dropsLeft, call: dropCall });
        return;
      }
      if (path === '/admin/write-count' && method === 'GET') {
        const task = url.searchParams.get('task');
        if (task === null || !TASK_ID.test(task)) throw new HttpError(400, 'invalid_query', 'task');
        sendJson(res, 200, { task, count: store.writeCount(task) });
        return;
      }
      if (path === '/admin/applied-count' && method === 'GET') {
        const task = url.searchParams.get('task');
        if (task === null || !TASK_ID.test(task)) throw new HttpError(400, 'invalid_query', 'task');
        sendJson(res, 200, { task, count: store.appliedCount(task) });
        return;
      }
      if (path === '/admin/notification-count' && method === 'GET') {
        const task = url.searchParams.get('task');
        if (task === null || !TASK_ID.test(task)) throw new HttpError(400, 'invalid_query', 'task');
        sendJson(res, 200, { task, count: store.notificationCount(task) });
        return;
      }
      if (path === '/admin/multiple-assignee-count' && method === 'GET') {
        sendJson(res, 200, { count: store.multipleAssigneeCount() });
        return;
      }
      if (path === '/admin/writes' && method === 'GET') {
        const task = url.searchParams.get('task');
        if (task === null || !TASK_ID.test(task)) throw new HttpError(400, 'invalid_query', 'task');
        sendJson(res, 200, {
          task,
          history: config.writeHistory,
          writes: store.writes(task).map((write) => ({
            id: write.id,
            key: write.key,
            actor: write.actor,
            kind: write.kind,
            fields: write.fields,
            state: write.state,
            notifications: write.notifications,
            at: new Date(write.at).toISOString(),
            applied_at: write.appliedAt === null ? null : new Date(write.appliedAt).toISOString(),
          })),
        });
        return;
      }
      if (path === '/admin/profile' && method === 'GET') {
        sendJson(res, 200, { profile, switches: config });
        return;
      }
      if (path === '/admin/tokens' && method === 'POST') {
        const body = parseBody(tokenBodySchema, await readJson(req));
        const ttlMs = body.ttl_ms ?? tokenSeconds() * 1_000;
        const token = randomBytes(24).toString('base64url');
        const expiresAt = Date.now() + ttlMs;
        tokens.set(token, { id: randomBytes(8).toString('hex'), expiresAt });
        sendJson(res, 200, { token, expires_at: new Date(expiresAt).toISOString(), expires_in_ms: ttlMs });
        return;
      }
      if (path === '/admin/other-write' && method === 'POST') {
        const body = parseBody(otherWriteBodySchema, await readJson(req));
        const outcome = store.otherWrite({
          taskId: body.task_id,
          changes: definedOnly(body.changes),
          expectedVersion: body.expected_version ?? null,
          actor: PERSONAS.quang.employeeId,
          now: Date.now(),
        });
        if (outcome.kind === 'not_found') throw new HttpError(404, 'task_not_found');
        if (outcome.kind === 'conflict') {
          sendJson(res, 409, { error: 'version_conflict', current_version: outcome.currentVersion });
          return;
        }
        sendJson(res, 200, { task: outcome.task });
        return;
      }
    }

    throw new HttpError(404, 'not_found');
  }

  const server: Server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof HttpError) {
        const body =
          error.responseBody !== undefined
            ? error.responseBody
            : error.detail === undefined
              ? { error: error.code }
              : { error: error.code, detail: error.detail };
        sendJson(
          res,
          error.status,
          body,
          error.status === 405 ? { ...error.headers, allow: 'GET, PATCH, POST' } : error.headers,
        );
        return;
      }
      console.error(`[fake-tasks] request failed: ${error instanceof Error ? error.message : String(error)}`);
      sendJson(res, 500, { error: 'internal_error' });
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, LOOPBACK_HOST, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    store.close();
    throw error;
  }

  const address = server.address();
  if (address === null || typeof address !== 'object') {
    server.close();
    store.close();
    throw new Error('tasks did not report a listening address');
  }

  let closedOnce = false;
  return {
    port: address.port,
    url: `http://${LOOPBACK_HOST}:${address.port}`,
    async close(): Promise<void> {
      if (closedOnce) return;
      closedOnce = true;
      closed = true;
      for (const timer of pendingTimers) clearTimeout(timer);
      pendingTimers.clear();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      store.close();
    },
  };
}
