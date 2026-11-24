import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { EMPLOYEE } from './seed.js';
import {
  appliedCount,
  createTask,
  getTask,
  harness,
  issueToken,
  notificationCount,
  otherWrite,
  patch,
  writeCount,
  writeList,
} from './test-support.js';

const CREATE = {
  title: 'Việc kiểm công tắc',
  description: 'Dữ liệu giả của Lab.',
  assignee: EMPLOYEE.minh,
  department: 'Vận hành' as const,
  due: '2026-12-01',
};

test('switch: idempotency memory replays forever, expires after N seconds or forgets', async (t) => {
  const forever = await harness(t);
  const firstForever = await createTask(forever, 'memory-forever', CREATE);
  assert.equal(firstForever.status, 201);
  const foreverId = ((await firstForever.clone().json()) as { task: { id: string } }).task.id;
  const replay = await createTask(forever, 'memory-forever', CREATE);
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get('idempotent-replayed'), 'true');
  assert.equal(((await replay.json()) as { task: { id: string } }).task.id, foreverId);

  const short = await harness(t, {
    switches: { idempotency: { create: { memory: 'seconds', memorySeconds: 1 } } },
  });
  const firstShort = await createTask(short, 'memory-short', CREATE);
  assert.equal(firstShort.status, 201);
  const shortId = ((await firstShort.clone().json()) as { task: { id: string } }).task.id;
  const stillThere = await createTask(short, 'memory-short', CREATE);
  assert.equal(((await stillThere.json()) as { task: { id: string } }).task.id, shortId);
  await sleep(1_100);
  const afterExpiry = await createTask(short, 'memory-short', CREATE);
  assert.equal(afterExpiry.status, 201);
  assert.equal(afterExpiry.headers.get('idempotent-replayed'), null);
  const secondId = ((await afterExpiry.json()) as { task: { id: string } }).task.id;
  assert.notEqual(secondId, shortId);

  const forgetful = await harness(t, { switches: { idempotency: { create: { memory: 'none' } } } });
  const one = await createTask(forgetful, 'memory-none', CREATE);
  const two = await createTask(forgetful, 'memory-none', CREATE);
  const oneId = ((await one.json()) as { task: { id: string } }).task.id;
  const twoId = ((await two.json()) as { task: { id: string } }).task.id;
  assert.notEqual(oneId, twoId);
});

test('switch: idempotency scope shares by service key, separates by token and expires a token', async (t) => {
  const shared = await harness(t);
  const firstShared = await createTask(shared, 'scope-shared', CREATE);
  const sharedId = ((await firstShared.clone().json()) as { task: { id: string } }).task.id;
  const secondShared = await createTask(shared, 'scope-shared', CREATE);
  assert.equal(secondShared.headers.get('idempotent-replayed'), 'true');
  assert.equal(((await secondShared.json()) as { task: { id: string } }).task.id, sharedId);

  const byToken = await harness(t, {
    switches: { idempotency: { create: { scope: 'token', tokenSeconds: 1 } } },
  });
  const tokenA = await issueToken(byToken, 1_000);
  const tokenB = await issueToken(byToken, 1_000);
  const firstA = await createTask(byToken, 'scope-token', CREATE, { token: tokenA });
  assert.equal(firstA.status, 201);
  const idA = ((await firstA.clone().json()) as { task: { id: string } }).task.id;
  const replayA = await createTask(byToken, 'scope-token', CREATE, { token: tokenA });
  assert.equal(replayA.headers.get('idempotent-replayed'), 'true');
  assert.equal(((await replayA.json()) as { task: { id: string } }).task.id, idA);

  const firstB = await createTask(byToken, 'scope-token', CREATE, { token: tokenB });
  assert.equal(firstB.status, 201);
  assert.equal(firstB.headers.get('idempotent-replayed'), null);
  assert.notEqual(((await firstB.json()) as { task: { id: string } }).task.id, idA);

  assert.equal((await createTask(byToken, 'scope-missing', CREATE)).status, 401);
  await sleep(1_100);
  const expired = await createTask(byToken, 'scope-token', CREATE, { token: tokenA });
  assert.equal(expired.status, 401);
  assert.equal(((await expired.json()) as { error: string }).error, 'token_expired');
});

test('switch: a repeated key replays, errors, waits or conflicts', async (t) => {
  const replay = await harness(t);
  assert.equal((await createTask(replay, 'repeat-replay', CREATE)).status, 201);
  const again = await createTask(replay, 'repeat-replay', CREATE);
  assert.equal(again.status, 201);
  assert.equal(again.headers.get('idempotent-replayed'), 'true');

  const duplicate = await harness(t, {
    switches: { idempotency: { create: { repeat: 'duplicate_error' } } },
  });
  assert.equal((await createTask(duplicate, 'repeat-duplicate', CREATE)).status, 201);
  const rejected = await createTask(duplicate, 'repeat-duplicate', CREATE);
  assert.equal(rejected.status, 409);
  assert.equal(((await rejected.json()) as { error: string }).error, 'duplicate_idempotency_key');

  const waits = await harness(t, { switches: { idempotency: { update: { repeat: 'wait' } } } });
  await waits.call('POST', '/admin/faults', {
    body: { mode: 'hold_item_before_commit', position: 2, delay_ms: 500 },
  });
  const firstWait = patch(waits, 'T-12', 'proposal:2', { status: 'doing' }, 1);
  await sleep(150);
  const secondWait = patch(waits, 'T-12', 'proposal:2', { status: 'doing' }, 1);
  const [waitedFirst, waitedSecond] = await Promise.all([firstWait, secondWait]);
  assert.equal(waitedFirst.status, 200);
  assert.equal(waitedSecond.status, 200);
  assert.equal(await waitedSecond.text(), await waitedFirst.text());
  assert.equal(await writeCount(waits, 'T-12'), 1);

  const conflicts = await harness(t, { switches: { idempotency: { update: { repeat: 'conflict' } } } });
  await conflicts.call('POST', '/admin/faults', {
    body: { mode: 'hold_item_before_commit', position: 2, delay_ms: 500 },
  });
  const firstConflict = patch(conflicts, 'T-12', 'proposal:2', { status: 'doing' }, 1);
  await sleep(150);
  const secondConflict = await patch(conflicts, 'T-12', 'proposal:2', { status: 'doing' }, 1);
  assert.equal(secondConflict.status, 409);
  assert.equal(((await secondConflict.json()) as { error: string }).error, 'write_in_progress');
  assert.equal((await firstConflict).status, 200);
  assert.equal(await writeCount(conflicts, 'T-12'), 1);
});

test('switch: version check refuses a stale version or accepts and overwrites', async (t) => {
  const checked = await harness(t);
  assert.equal((await patch(checked, 'T-12', 'version-1', { status: 'doing' }, 1)).status, 200);
  assert.equal((await patch(checked, 'T-12', 'version-2', { status: 'done' }, 1)).status, 409);

  const unchecked = await harness(t, { switches: { versionCheck: false } });
  const first = await patch(unchecked, 'T-12', 'version-open-1', { status: 'doing' }, 1);
  assert.equal(first.status, 200);
  assert.equal(((await first.json()) as { task: { version: number } }).task.version, 2);
  const stale = await patch(unchecked, 'T-12', 'version-open-2', { status: 'done' }, 1);
  assert.equal(stale.status, 200);
  const staleTask = ((await stale.json()) as { task: { version: number; status: string } }).task;
  assert.equal(staleTask.version, 3);
  assert.equal(staleTask.status, 'done');
  const noVersion = await patch(unchecked, 'T-12', 'version-open-3', { assignee: EMPLOYEE.minh });
  assert.equal(noVersion.status, 200);
  assert.equal(((await noVersion.json()) as { task: { version: number } }).task.version, 4);
});

test('switch: final result is immediate, or accepted then applied or failed later', async (t) => {
  const immediate = await harness(t);
  const now = await patch(immediate, 'T-12', 'final-now', { status: 'doing' }, 1);
  assert.equal(now.status, 200);
  const nowBody = (await now.json()) as { task: { version: number }; write_state?: string };
  assert.equal(nowBody.task.version, 2);
  assert.equal(nowBody.write_state, undefined);

  const late = await harness(t, {
    switches: { finalResult: { mode: 'late', delayMs: 200, failureEvery: 3 } },
  });
  const accepted = await patch(late, 'T-12', 'final-late-1', { status: 'doing' }, 1);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('write-state'), 'processing');
  const preview = (await accepted.json()) as { task: { version: number }; write_state: string };
  assert.equal(preview.write_state, 'processing');
  assert.equal(preview.task.version, 1);
  assert.equal((await getTask(late, 'T-12')).version, 1);
  assert.equal(await appliedCount(late, 'T-12'), 0);
  assert.equal((await writeList(late, 'T-12')).writes[0]?.state, 'processing');

  await sleep(300);
  assert.equal((await getTask(late, 'T-12')).version, 2);
  assert.equal(await appliedCount(late, 'T-12'), 1);
  assert.equal((await writeList(late, 'T-12')).writes[0]?.state, 'applied');

  assert.equal((await patch(late, 'T-13', 'final-late-2', { status: 'doing' }, 1)).status, 200);
  await sleep(300);
  assert.equal((await getTask(late, 'T-13')).version, 2);

  assert.equal((await patch(late, 'T-14', 'final-late-3', { status: 'doing' }, 1)).status, 200);
  await sleep(300);
  assert.equal((await getTask(late, 'T-14')).version, 1);
  assert.equal(await appliedCount(late, 'T-14'), 0);
  const failed = await writeList(late, 'T-14');
  assert.equal(failed.writes[0]?.state, 'failed');
  assert.equal(failed.writes[0]?.notifications, 0);

  const lateCreateOne = await createTask(late, 'final-late-create-1', CREATE);
  assert.equal(lateCreateOne.status, 200);
  await sleep(300);
  assert.equal((await getTask(late, 'T-101')).version, 1);
  assert.equal(await appliedCount(late, 'T-101'), 1);

  const lateCreateTwo = await createTask(late, 'final-late-create-2', CREATE);
  assert.equal(lateCreateTwo.status, 200);
  await sleep(300);
  assert.equal((await getTask(late, 'T-102')).version, 1);
  assert.equal(await appliedCount(late, 'T-102'), 1);

  const lateCreateFails = await createTask(late, 'final-late-create-3', CREATE);
  assert.equal(lateCreateFails.status, 200);
  await sleep(300);
  assert.equal((await late.call('GET', '/tasks/T-103')).status, 404);
  assert.equal(await appliedCount(late, 'T-103'), 0);
});

test('switch: rate limit passes, reports Retry-After, a custom header, or nothing and blocks early retries', async (t) => {
  const open = await harness(t);
  for (const id of ['T-12', 'T-13', 'T-14']) {
    assert.equal((await patch(open, id, `rate-open-${id}`, { status: 'doing' }, 1)).status, 200);
  }

  const retryAfter = await harness(t, {
    switches: { rateLimit: { mode: 'retry_after', maxRequests: 1, windowMs: 60_000, retryAfterSeconds: 1 } },
  });
  assert.equal((await patch(retryAfter, 'T-12', 'rate-after-1', { status: 'doing' }, 1)).status, 200);
  const limited = await patch(retryAfter, 'T-13', 'rate-after-2', { status: 'doing' }, 1);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '1');
  assert.equal(((await limited.json()) as { error: string }).error, 'rate_limited');
  assert.equal(await appliedCount(retryAfter, 'T-13'), 0);

  const custom = await harness(t, {
    switches: { rateLimit: { mode: 'custom_header', maxRequests: 1, windowMs: 60_000, retryAfterSeconds: 1 } },
  });
  assert.equal((await patch(custom, 'T-12', 'rate-custom-1', { status: 'doing' }, 1)).status, 200);
  const customLimited = await patch(custom, 'T-13', 'rate-custom-2', { status: 'doing' }, 1);
  assert.equal(customLimited.status, 429);
  assert.equal(customLimited.headers.get('x-estimated-time-to-regain-access'), '1');
  assert.equal(customLimited.headers.get('retry-after'), null);

  const silent = await harness(t, {
    switches: {
      rateLimit: { mode: 'silent', maxRequests: 1, windowMs: 200, retryAfterSeconds: 1, extraBlockSeconds: 2 },
    },
  });
  assert.equal((await patch(silent, 'T-12', 'rate-silent-1', { status: 'doing' }, 1)).status, 200);
  const firstBlock = await patch(silent, 'T-13', 'rate-silent-2', { status: 'doing' }, 1);
  assert.equal(firstBlock.status, 429);
  assert.equal(firstBlock.headers.get('retry-after'), null);
  assert.equal(firstBlock.headers.get('x-estimated-time-to-regain-access'), null);
  assert.equal((await patch(silent, 'T-14', 'rate-silent-3', { status: 'doing' }, 1)).status, 429);
  await sleep(1_200);
  assert.equal((await patch(silent, 'T-15', 'rate-silent-4', { status: 'doing' }, 1)).status, 429);
  await sleep(2_200);
  assert.equal((await patch(silent, 'T-16', 'rate-silent-5', { status: 'doing' }, 1)).status, 200);
});

test('switch: read delay serves the old record until the lag passes', async (t) => {
  const fresh = await harness(t);
  assert.equal((await patch(fresh, 'T-12', 'read-now', { status: 'doing' }, 1)).status, 200);
  assert.equal((await getTask(fresh, 'T-12')).version, 2);

  const lagging = await harness(t, { switches: { readDelayMs: 150 } });
  assert.equal((await patch(lagging, 'T-12', 'read-late', { status: 'doing' }, 1)).status, 200);
  assert.equal((await getTask(lagging, 'T-12')).version, 1);
  const listed = ((await (await lagging.call('GET', `/tasks?assignee=${EMPLOYEE.lan}`)).json()) as {
    tasks: Array<{ id: string; version: number }>;
  }).tasks;
  assert.equal(listed.find((task) => task.id === 'T-12')?.version, 1);

  assert.equal((await createTask(lagging, 'read-create', CREATE)).status, 201);
  assert.equal((await lagging.call('GET', '/tasks/T-101')).status, 404);

  await sleep(250);
  assert.equal((await getTask(lagging, 'T-12')).version, 2);
  assert.equal((await getTask(lagging, 'T-101')).version, 1);
});

test('switch: side effects send no notification, one per write, or one per real change', async (t) => {
  const quiet = await harness(t);
  assert.equal((await patch(quiet, 'T-12', 'notify-quiet', { status: 'doing' }, 1)).status, 200);
  assert.equal(await notificationCount(quiet, 'T-12'), 0);
  assert.equal((await writeList(quiet, 'T-12')).writes[0]?.notifications, 0);

  const every = await harness(t, { switches: { notifications: 'every_write' } });
  assert.equal((await patch(every, 'T-12', 'notify-every-1', { status: 'doing' }, 1)).status, 200);
  assert.equal((await patch(every, 'T-12', 'notify-every-2', { status: 'doing' }, 2)).status, 200);
  assert.equal(await notificationCount(every, 'T-12'), 2);
  assert.deepEqual(
    (await writeList(every, 'T-12')).writes.map((write) => write.notifications),
    [1, 1],
  );

  const changed = await harness(t, { switches: { notifications: 'on_change' } });
  assert.equal((await patch(changed, 'T-12', 'notify-change-1', { status: 'doing' }, 1)).status, 200);
  assert.equal((await patch(changed, 'T-12', 'notify-change-2', { status: 'doing' }, 2)).status, 200);
  assert.equal((await patch(changed, 'T-12', 'notify-change-3', { status: 'done' }, 3)).status, 200);
  assert.equal(await notificationCount(changed, 'T-12'), 2);
  assert.deepEqual(
    (await writeList(changed, 'T-12')).writes.map((write) => write.notifications),
    [1, 0, 1],
  );
});

test('switch: write history names the actor or only counts writes', async (t) => {
  const named = await harness(t);
  assert.equal((await patch(named, 'T-12', 'history-1', { status: 'doing' }, 1)).status, 200);
  assert.equal((await otherWrite(named, 'T-12', { status: 'done' }, 2)).status, 200);
  const namedList = await writeList(named, 'T-12');
  assert.equal(namedList.history, true);
  assert.deepEqual(
    namedList.writes.map((write) => write.actor),
    ['gateway', EMPLOYEE.quang],
  );
  assert.equal(await appliedCount(named, 'T-12'), 2);

  const anonymous = await harness(t, { switches: { writeHistory: false } });
  assert.equal((await patch(anonymous, 'T-12', 'history-off-1', { status: 'doing' }, 1)).status, 200);
  assert.equal((await otherWrite(anonymous, 'T-12', { status: 'done' }, 2)).status, 200);
  const anonymousList = await writeList(anonymous, 'T-12');
  assert.equal(anonymousList.history, false);
  assert.deepEqual(
    anonymousList.writes.map((write) => write.actor),
    [null, null],
  );
  assert.equal(await appliedCount(anonymous, 'T-12'), 2);
  assert.equal(await writeCount(anonymous, 'T-12'), 2);
});
