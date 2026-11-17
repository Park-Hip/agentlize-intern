import { mkdirSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { z } from 'zod';
import {
  LOOPBACK_HOST,
  hasValidServiceKey,
  readServiceKey,
  resolveDataDir,
  resolvePort,
  testHooksEnabled,
} from '@lab/shared';
import { TaskStore, type PatchInput, type StoredResponse, type TaskFilter } from './store.js';
import { DEPARTMENTS, TASK_STATUSES, type Department, type TaskChanges, type TaskStatus } from './types.js';

const MAX_BODY_BYTES = 64 * 1024;
const TASK_ID = /^T-[1-9][0-9]*$/;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const EMPLOYEE_CODE = /^NV-[0-9]{2}$/;

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

const patchBodySchema = z.strictObject({
  changes: changesSchema,
  expected_version: z.number().int().min(1),
});

const faultBodySchema = z.strictObject({
  mode: z.literal('drop_response_after_commit'),
  count: z.number().int().min(0).max(1_000).default(1),
});

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

/**
 * Start the fake task list: loopback only, every route behind the service key.
 * The key is read before the socket opens, so a misconfigured process never
 * answers a request.
 */
export async function startTasksServer(options: TasksServerOptions = {}): Promise<RunningTasksServer> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);
  const hooks = testHooksEnabled(env);
  const port = options.port ?? resolvePort('tasks', env);

  let dbPath = options.dbPath;
  if (dbPath === undefined) {
    const dataDir = resolveDataDir(env);
    mkdirSync(dataDir, { recursive: true });
    dbPath = join(dataDir, 'tasks.sqlite');
  }
  const store = new TaskStore(dbPath);

  /** Committed writes whose response is still to be dropped (test hook). */
  let dropsLeft = 0;

  function handlePatch(req: IncomingMessage, res: ServerResponse, taskId: string, body: unknown): void {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new HttpError(400, 'invalid_idempotency_key', 'Idempotency-Key header is required');
    }
    const parsed = parseBody(patchBodySchema, body);
    const input: PatchInput = {
      taskId,
      idempotencyKey: key,
      expectedVersion: parsed.expected_version,
      changes: definedOnly(parsed.changes),
    };

    const outcome = store.patch(input);
    switch (outcome.kind) {
      case 'replayed':
        sendRaw(res, outcome.response, { 'idempotent-replayed': 'true' });
        return;
      case 'key_reused':
        throw new HttpError(422, 'idempotency_key_reused', 'This key was used with different content');
      case 'not_found':
        throw new HttpError(404, 'task_not_found');
      case 'conflict':
        sendJson(res, 409, { error: 'version_conflict', current_version: outcome.currentVersion });
        return;
      case 'written':
        if (dropsLeft > 0) {
          // The write is committed; the caller never hears about it.
          dropsLeft -= 1;
          req.socket.destroy();
          return;
        }
        sendRaw(res, outcome.response);
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
      if (method !== 'GET') throw new HttpError(405, 'method_not_allowed');
      sendJson(res, 200, { tasks: store.list(parseFilter(url.searchParams)) });
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
        handlePatch(req, res, id, await readJson(req));
        return;
      }
      throw new HttpError(405, 'method_not_allowed');
    }

    if (hooks) {
      if (path === '/admin/reset' && method === 'POST') {
        store.reset();
        dropsLeft = 0;
        sendJson(res, 200, { status: 'reset' });
        return;
      }
      if (path === '/admin/faults' && method === 'POST') {
        const fault = parseBody(faultBodySchema, await readJson(req));
        dropsLeft = fault.count;
        sendJson(res, 200, { mode: fault.mode, count: dropsLeft });
        return;
      }
      if (path === '/admin/write-count' && method === 'GET') {
        const task = url.searchParams.get('task');
        if (task === null || !TASK_ID.test(task)) throw new HttpError(400, 'invalid_query', 'task');
        sendJson(res, 200, { task, count: store.writeCount(task) });
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
        const body = error.detail === undefined ? { error: error.code } : { error: error.code, detail: error.detail };
        sendJson(res, error.status, body, error.status === 405 ? { allow: 'GET, PATCH, POST' } : {});
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

  let closed = false;
  return {
    port: address.port,
    url: `http://${LOOPBACK_HOST}:${address.port}`,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      store.close();
    },
  };
}
