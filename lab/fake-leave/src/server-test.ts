import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { SERVICE_KEY_ENV, TEST_HOOKS_ENV } from '@lab/shared';
import type { LeaveConfig } from './config.js';
import { startLeaveServer, type RunningLeaveServer } from './server.js';

const KEY = randomBytes(32).toString('base64url');

const BODY = {
  employee: 'NV-04',
  leave_type: 'annual',
  from_date: '2026-11-26',
  to_date: '2026-11-27',
  reason: 'Việc gia đình',
  note: 'Về quê',
} as const;

function config(overrides: Partial<LeaveConfig> = {}): LeaveConfig {
  return {
    profile: 'standard',
    dedupCreate: true,
    decisionDelayMs: 60_000,
    decision: 'approved',
    ...overrides,
  };
}

interface Harness {
  readonly running: RunningLeaveServer;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

async function start(t: TestContext, overrides: Partial<LeaveConfig> = {}): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), 'agentlize-leave-'));
  const running = await startLeaveServer({
    port: 0,
    dbPath: join(dir, 'leave.sqlite'),
    env: { ...process.env, [SERVICE_KEY_ENV]: KEY, [TEST_HOOKS_ENV]: '1' },
    config: config(overrides),
  });
  t.after(async () => {
    await running.close();
    await rm(dir, { recursive: true, force: true });
  });
  return {
    running,
    url: running.url,
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
  };
}

async function create(harness: Harness, key: string, body: unknown = BODY): Promise<Response> {
  return fetch(`${harness.url}/leave-requests`, {
    method: 'POST',
    headers: { ...harness.headers, 'idempotency-key': key },
    body: JSON.stringify(body),
  });
}

test('fake leave: create returns a code and the request waits for the manager', async (t) => {
  const harness = await start(t);
  const response = await create(harness, 'dx-1:1');
  assert.equal(response.status, 201);
  const body = (await response.json()) as { request: { code: string; status: string; decided_at: string } };
  assert.equal(body.request.code, 'NP-1');
  assert.equal(body.request.status, 'pending');
  assert.equal(body.request.decided_at, '');

  const byCode = await fetch(`${harness.url}/leave-requests/NP-1`, { headers: harness.headers });
  assert.equal(byCode.status, 200);
  assert.deepEqual(await byCode.json(), body.request);

  const sameDay = await fetch(`${harness.url}/leave-requests?employee=NV-04&date=2026-11-26`, {
    headers: harness.headers,
  });
  assert.equal(sameDay.status, 200);
  const listed = (await sameDay.json()) as { requests: { code: string }[] };
  assert.deepEqual(listed.requests.map((request) => request.code), ['NP-1']);

  const otherDay = await fetch(`${harness.url}/leave-requests?employee=NV-04&date=2026-11-28`, {
    headers: harness.headers,
  });
  assert.deepEqual((await otherDay.json()) as { requests: unknown[] }, { requests: [] });

  const otherPerson = await fetch(`${harness.url}/leave-requests?employee=NV-05&date=2026-11-26`, {
    headers: harness.headers,
  });
  assert.deepEqual((await otherPerson.json()) as { requests: unknown[] }, { requests: [] });
});

test('fake leave: the same key replays the first answer and the target creates one request', async (t) => {
  const harness = await start(t);
  const first = await create(harness, 'dx-1:1');
  const firstBody = (await first.json()) as { request: { code: string } };
  const second = await create(harness, 'dx-1:1');
  const secondBody = (await second.json()) as { request: { code: string } };
  assert.equal(second.status, 201);
  assert.equal(second.headers.get('idempotent-replayed'), 'true');
  assert.equal(secondBody.request.code, firstBody.request.code);

  const count = await fetch(`${harness.url}/admin/created-count`, { headers: harness.headers });
  assert.deepEqual(await count.json(), { count: 1 });

  const reused = await create(harness, 'dx-1:1', { ...BODY, reason: 'Lý do khác' });
  assert.equal(reused.status, 422);
  assert.deepEqual(await reused.json(), { error: 'idempotency_key_reused', detail: 'This key was used with different content' });
});

test('fake leave: no-dedup creates a second request for the same key', async (t) => {
  const harness = await start(t, { profile: 'no-dedup', dedupCreate: false });
  const first = await create(harness, 'dx-1:1');
  const second = await create(harness, 'dx-1:1');
  const firstBody = (await first.json()) as { request: { code: string } };
  const secondBody = (await second.json()) as { request: { code: string } };
  assert.notEqual(firstBody.request.code, secondBody.request.code);

  const count = await fetch(`${harness.url}/admin/created-count`, { headers: harness.headers });
  assert.deepEqual(await count.json(), { count: 2 });
});

test('fake leave: the manager decision appears after the configured delay', async (t) => {
  const harness = await start(t, { decisionDelayMs: 20, decision: 'rejected' });
  const created = (await (await create(harness, 'dx-1:1')).json()) as { request: { status: string } };
  assert.equal(created.request.status, 'pending');
  await new Promise((resolve) => setTimeout(resolve, 50));

  const response = await fetch(`${harness.url}/leave-requests/NP-1`, { headers: harness.headers });
  const body = (await response.json()) as { status: string; decided_at: string };
  assert.equal(body.status, 'rejected');
  assert.notEqual(body.decided_at, '');
});

test('fake leave: every route needs the service key and the list rejects unknown filters', async (t) => {
  const harness = await start(t);
  const anonymous = await fetch(`${harness.url}/health`);
  assert.equal(anonymous.status, 401);
  await anonymous.text();

  const health = await fetch(`${harness.url}/health`, { headers: harness.headers });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'leave' });

  const bad = await fetch(`${harness.url}/leave-requests?department=Vận hành`, { headers: harness.headers });
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), {
    error: 'unsupported_filter',
    detail: 'allowed filters: employee, date, status',
  });
});
