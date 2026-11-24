import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { PROFILE_NAMES } from './config.js';
import { EMPLOYEE } from './seed.js';
import { startTasksServer } from './server.js';
import {
  appliedCount,
  createTask,
  getTask,
  harness,
  issueToken,
  notificationCount,
  patch,
  writeCount,
  writeList,
  type Harness,
} from './test-support.js';

const CREATE = {
  title: 'Việc kiểm hồ sơ',
  description: 'Dữ liệu giả của Lab.',
  assignee: EMPLOYEE.minh,
  department: 'Vận hành' as const,
  due: '2026-12-01',
};

async function profileOf(h: Harness): Promise<string> {
  const response = await h.call('GET', '/admin/profile');
  assert.equal(response.status, 200);
  return ((await response.json()) as { profile: string }).profile;
}

test('profile smoke: standard keeps the old write path', async (t) => {
  const h = await harness(t);
  assert.equal(await profileOf(h), 'standard');
  assert.equal(((await (await h.call('GET', '/tasks')).json()) as { tasks: unknown[] }).tasks.length, 100);
  const first = await patch(h, 'T-12', 'smoke-standard', { status: 'doing' }, 1);
  assert.equal(first.status, 200);
  const firstText = await first.text();
  const again = await patch(h, 'T-12', 'smoke-standard', { status: 'doing' }, 1);
  assert.equal(again.status, 200);
  assert.equal(again.headers.get('idempotent-replayed'), 'true');
  assert.equal(await again.text(), firstText);
  assert.equal(await writeCount(h, 'T-12'), 1);
});

test('profile smoke: lark-task remembers create keys per token, skips version checks and notifies every write', async (t) => {
  const h = await harness(t, { profile: 'lark-task' });
  assert.equal(await profileOf(h), 'lark-task');

  const token = await issueToken(h);
  const created = await createTask(h, 'smoke-lark-create', CREATE, { token });
  assert.equal(created.status, 201);
  const createdId = ((await created.clone().json()) as { task: { id: string } }).task.id;
  const replay = await createTask(h, 'smoke-lark-create', CREATE, { token });
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get('idempotent-replayed'), 'true');
  assert.equal(((await replay.json()) as { task: { id: string } }).task.id, createdId);

  assert.equal((await patch(h, 'T-12', 'smoke-lark-update-1', { status: 'doing' })).status, 200);
  assert.equal((await patch(h, 'T-12', 'smoke-lark-update-2', { status: 'doing' })).status, 200);
  assert.equal((await getTask(h, 'T-12')).version, 3);
  assert.equal(await notificationCount(h, 'T-12'), 2);
});

test('profile smoke: lark-approval remembers the key and reports a repeat as an error', async (t) => {
  const h = await harness(t, { profile: 'lark-approval' });
  assert.equal(await profileOf(h), 'lark-approval');
  assert.equal((await createTask(h, 'smoke-approval', CREATE)).status, 201);
  const duplicate = await createTask(h, 'smoke-approval', CREATE);
  assert.equal(duplicate.status, 409);
  assert.equal(((await duplicate.json()) as { error: string }).error, 'duplicate_idempotency_key');
});

test('profile smoke: no-dedup creates twice and hides the write actor', async (t) => {
  const h = await harness(t, { profile: 'no-dedup' });
  assert.equal(await profileOf(h), 'no-dedup');
  const first = await createTask(h, 'smoke-no-dedup', CREATE);
  const second = await createTask(h, 'smoke-no-dedup', CREATE);
  const firstId = ((await first.json()) as { task: { id: string } }).task.id;
  const secondId = ((await second.json()) as { task: { id: string } }).task.id;
  assert.notEqual(firstId, secondId);

  assert.equal((await patch(h, 'T-12', 'smoke-no-dedup-patch', { status: 'doing' }, 1)).status, 200);
  const list = await writeList(h, 'T-12');
  assert.equal(list.history, false);
  assert.equal(list.writes[0]?.actor, null);
});

test('profile smoke: short-memory still replays inside its long window', async (t) => {
  const h = await harness(t, { profile: 'short-memory' });
  assert.equal(await profileOf(h), 'short-memory');
  const first = await createTask(h, 'smoke-short', CREATE);
  const again = await createTask(h, 'smoke-short', CREATE);
  const firstId = ((await first.json()) as { task: { id: string } }).task.id;
  assert.equal(again.headers.get('idempotent-replayed'), 'true');
  assert.equal(((await again.json()) as { task: { id: string } }).task.id, firstId);
});

test('profile smoke: late-result accepts, then applies the first write', async (t) => {
  const h = await harness(t, { profile: 'late-result' });
  assert.equal(await profileOf(h), 'late-result');
  const accepted = await patch(h, 'T-12', 'smoke-late', { status: 'doing' }, 1);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('write-state'), 'processing');
  assert.equal((await getTask(h, 'T-12')).version, 1);
  await sleep(1_200);
  assert.equal((await getTask(h, 'T-12')).version, 2);
  assert.equal(await appliedCount(h, 'T-12'), 1);
});

test('profile smoke: rate-limited answers 429 with Retry-After', async (t) => {
  const h = await harness(t, { profile: 'rate-limited' });
  assert.equal(await profileOf(h), 'rate-limited');
  assert.equal((await patch(h, 'T-12', 'smoke-rate-1', { status: 'doing' }, 1)).status, 200);
  assert.equal((await patch(h, 'T-13', 'smoke-rate-2', { status: 'doing' }, 1)).status, 200);
  const limited = await patch(h, 'T-14', 'smoke-rate-3', { status: 'doing' }, 1);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '1');
});

test('profile smoke: stale-read serves the previous version for a moment', async (t) => {
  const h = await harness(t, { profile: 'stale-read' });
  assert.equal(await profileOf(h), 'stale-read');
  assert.equal((await patch(h, 'T-12', 'smoke-stale', { status: 'doing' }, 1)).status, 200);
  assert.equal((await getTask(h, 'T-12')).version, 1);
  await sleep(1_200);
  assert.equal((await getTask(h, 'T-12')).version, 2);
});

test('startup: an unknown profile or an invalid switch override stops before listening', async () => {
  const key = 'x'.repeat(32);
  await assert.rejects(
    startTasksServer({ env: { LAB_SERVICE_KEY: key, LAB_TASKS_PROFILE: 'unknown' }, port: 0 }),
    /LAB_TASKS_PROFILE/,
  );
  await assert.rejects(
    startTasksServer({ env: { LAB_SERVICE_KEY: key, LAB_TASKS_SWITCHES: '{' }, port: 0 }),
    /LAB_TASKS_SWITCHES/,
  );
  await assert.rejects(
    startTasksServer({ env: { LAB_SERVICE_KEY: key, LAB_TASKS_SWITCHES: '{"nope":true}' }, port: 0 }),
    /LAB_TASKS_SWITCHES/,
  );
});

test('startup: every named profile is listed for the smoke tests', () => {
  assert.deepEqual([...PROFILE_NAMES], [
    'standard',
    'lark-task',
    'lark-approval',
    'no-dedup',
    'short-memory',
    'late-result',
    'rate-limited',
    'stale-read',
  ]);
});
