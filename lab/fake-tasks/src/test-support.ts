import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { DATA_DIR_ENV, SERVICE_KEY_ENV, TEST_HOOKS_ENV } from '@lab/shared';
import { PROFILE_ENV, SWITCHES_ENV } from './config.js';
import { startTasksServer, type RunningTasksServer } from './server.js';
import type { Task } from './types.js';

export interface CallOptions {
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  /** Send this value instead of the service key. `null` sends no Authorization header. */
  readonly authorization?: string | null;
  /** Value of `X-Lab-Token`, used by the token idempotency scope. */
  readonly token?: string;
  /** Value of `X-Lab-Actor`, used by the write history and counters. */
  readonly actor?: string;
}

export interface HarnessOptions {
  readonly hooks?: boolean;
  readonly profile?: string;
  readonly switches?: Readonly<Record<string, unknown>>;
}

export interface Harness {
  readonly server: RunningTasksServer;
  readonly key: string;
  readonly dataDir: string;
  call(method: string, path: string, options?: CallOptions): Promise<Response>;
  restart(): Promise<void>;
}

export async function harness(t: TestContext, options: HarnessOptions = {}): Promise<Harness> {
  const key = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-tasks-'));
  const env: NodeJS.ProcessEnv = {
    [SERVICE_KEY_ENV]: key,
    [DATA_DIR_ENV]: dataDir,
    ...(options.hooks === false ? {} : { [TEST_HOOKS_ENV]: '1' }),
    ...(options.profile === undefined ? {} : { [PROFILE_ENV]: options.profile }),
    ...(options.switches === undefined ? {} : { [SWITCHES_ENV]: JSON.stringify(options.switches) }),
  };

  const state = { server: await startTasksServer({ env, port: 0 }) };
  t.after(async () => {
    await state.server.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  return {
    get server() {
      return state.server;
    },
    key,
    dataDir,
    call(method, path, request = {}) {
      const headers: Record<string, string> = {};
      if (request.authorization !== null) headers.authorization = request.authorization ?? `Bearer ${key}`;
      if (request.idempotencyKey !== undefined) headers['idempotency-key'] = request.idempotencyKey;
      if (request.token !== undefined) headers['x-lab-token'] = request.token;
      if (request.actor !== undefined) headers['x-lab-actor'] = request.actor;
      if (request.body !== undefined) headers['content-type'] = 'application/json';
      return fetch(`${state.server.url}${path}`, {
        method,
        headers,
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      });
    },
    async restart() {
      await state.server.close();
      state.server = await startTasksServer({ env, port: 0 });
    },
  };
}

export async function getTask(h: Harness, id: string): Promise<Task> {
  const response = await h.call('GET', `/tasks/${id}`);
  assert.equal(response.status, 200);
  return (await response.json()) as Task;
}

export async function writeCount(h: Harness, id: string): Promise<number> {
  const response = await h.call('GET', `/admin/write-count?task=${id}`);
  assert.equal(response.status, 200);
  return ((await response.json()) as { count: number }).count;
}

export async function appliedCount(h: Harness, id: string): Promise<number> {
  const response = await h.call('GET', `/admin/applied-count?task=${id}`);
  assert.equal(response.status, 200);
  return ((await response.json()) as { count: number }).count;
}

export async function notificationCount(h: Harness, id: string): Promise<number> {
  const response = await h.call('GET', `/admin/notification-count?task=${id}`);
  assert.equal(response.status, 200);
  return ((await response.json()) as { count: number }).count;
}

export interface WriteEntry {
  readonly id: number;
  readonly key: string;
  readonly actor: string | null;
  readonly kind: string;
  readonly fields: readonly string[];
  readonly state: 'processing' | 'applied' | 'failed';
  readonly notifications: number;
  readonly at: string;
  readonly applied_at: string | null;
}

export interface WriteList {
  readonly task: string;
  readonly history: boolean;
  readonly writes: readonly WriteEntry[];
}

export async function writeList(h: Harness, id: string): Promise<WriteList> {
  const response = await h.call('GET', `/admin/writes?task=${id}`);
  assert.equal(response.status, 200);
  return (await response.json()) as WriteList;
}

export function patch(
  h: Harness,
  id: string,
  key: string,
  changes: object,
  expectedVersion?: number | null,
  options: Pick<CallOptions, 'token' | 'actor'> = {},
): Promise<Response> {
  return h.call('PATCH', `/tasks/${id}`, {
    idempotencyKey: key,
    ...(options.token === undefined ? {} : { token: options.token }),
    ...(options.actor === undefined ? {} : { actor: options.actor }),
    body:
      expectedVersion === undefined || expectedVersion === null
        ? { changes }
        : { changes, expected_version: expectedVersion },
  });
}

export interface CreateBody {
  readonly title: string;
  readonly description: string;
  readonly assignee: string;
  readonly department: 'Vận hành' | 'Kinh doanh';
  readonly status?: 'todo' | 'doing' | 'done';
  readonly due: string;
}

export function createTask(
  h: Harness,
  key: string,
  body: CreateBody,
  options: Pick<CallOptions, 'token' | 'actor'> = {},
): Promise<Response> {
  return h.call('POST', '/tasks', {
    idempotencyKey: key,
    ...(options.token === undefined ? {} : { token: options.token }),
    ...(options.actor === undefined ? {} : { actor: options.actor }),
    body,
  });
}

export async function issueToken(h: Harness, ttlMs?: number): Promise<string> {
  const response = await h.call('POST', '/admin/tokens', {
    body: ttlMs === undefined ? {} : { ttl_ms: ttlMs },
  });
  assert.equal(response.status, 200);
  return ((await response.json()) as { token: string }).token;
}

export function otherWrite(
  h: Harness,
  taskId: string,
  changes: object,
  expectedVersion?: number,
): Promise<Response> {
  return h.call('POST', '/admin/other-write', {
    body: {
      task_id: taskId,
      changes,
      ...(expectedVersion === undefined ? {} : { expected_version: expectedVersion }),
    },
  });
}

export async function reset(h: Harness): Promise<void> {
  const response = await h.call('POST', '/admin/reset');
  assert.equal(response.status, 200);
}
