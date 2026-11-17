import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { DATA_DIR_ENV, SERVICE_KEY_ENV, TEST_HOOKS_ENV } from '@lab/shared';
import { EMPLOYEE, FAKE_BLOCK_END } from './seed.js';
import { startTasksServer, type RunningTasksServer } from './server.js';
import type { Task } from './types.js';

interface Harness {
  readonly server: RunningTasksServer;
  readonly key: string;
  readonly dataDir: string;
  call(method: string, path: string, options?: CallOptions): Promise<Response>;
  restart(): Promise<void>;
}

interface CallOptions {
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  /** Send this value instead of the service key. `null` sends no Authorization header. */
  readonly authorization?: string | null;
}

async function harness(t: TestContext, hooks = true): Promise<Harness> {
  const key = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-tasks-'));
  const env: NodeJS.ProcessEnv = {
    [SERVICE_KEY_ENV]: key,
    [DATA_DIR_ENV]: dataDir,
    ...(hooks ? { [TEST_HOOKS_ENV]: '1' } : {}),
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
    call(method, path, options = {}) {
      const headers: Record<string, string> = {};
      if (options.authorization !== null) headers.authorization = options.authorization ?? `Bearer ${key}`;
      if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey;
      if (options.body !== undefined) headers['content-type'] = 'application/json';
      return fetch(`${state.server.url}${path}`, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    },
    async restart() {
      await state.server.close();
      state.server = await startTasksServer({ env, port: 0 });
    },
  };
}

async function getTask(h: Harness, id: string): Promise<Task> {
  const response = await h.call('GET', `/tasks/${id}`);
  assert.equal(response.status, 200);
  return (await response.json()) as Task;
}

async function writeCount(h: Harness, id: string): Promise<number> {
  const response = await h.call('GET', `/admin/write-count?task=${id}`);
  assert.equal(response.status, 200);
  return ((await response.json()) as { count: number }).count;
}

function patch(h: Harness, id: string, key: string, changes: object, expectedVersion: number): Promise<Response> {
  return h.call('PATCH', `/tasks/${id}`, {
    idempotencyKey: key,
    body: { changes, expected_version: expectedVersion },
  });
}

test('auth: every path answers 401 without the service key', async (t) => {
  const h = await harness(t);
  const paths: ReadonlyArray<[string, string]> = [
    ['GET', '/health'],
    ['GET', '/tasks'],
    ['GET', '/tasks/T-12'],
    ['PATCH', '/tasks/T-12'],
    ['POST', '/admin/reset'],
    ['POST', '/admin/faults'],
    ['GET', '/admin/write-count?task=T-12'],
    ['GET', '/does-not-exist'],
  ];

  for (const [method, path] of paths) {
    for (const authorization of [null, 'Bearer wrong-key-wrong-key', `Basic ${h.key}`, h.key]) {
      const response = await h.call(method, path, { authorization });
      assert.equal(response.status, 401, `${method} ${path} with ${String(authorization)}`);
      assert.deepEqual(await response.json(), { error: 'unauthorized' });
    }
  }

  assert.equal(await writeCount(h, 'T-12'), 0, 'an unauthorized PATCH must not write');
  assert.equal((await h.call('GET', '/health')).status, 200);
});

test('startup: refuses to run without a service key', async () => {
  await assert.rejects(startTasksServer({ env: {}, port: 0 }), /LAB_SERVICE_KEY/);
});

test('seed: 100 tasks, T-12 is chi Lan, who has exactly 30 open', async (t) => {
  const h = await harness(t);

  const all = ((await (await h.call('GET', '/tasks')).json()) as { tasks: Task[] }).tasks;
  assert.equal(all.length, 100);
  assert.equal(new Set(all.map((task) => task.id)).size, 100);
  assert.deepEqual(new Set(all.map((task) => task.department)), new Set(['Vận hành', 'Kinh doanh']));
  assert.ok(all.every((task) => ['todo', 'doing', 'done'].includes(task.status)));
  assert.ok(all.every((task) => task.version === 1));
  assert.ok(all.every((task) => /^\d{4}-\d{2}-\d{2}$/.test(task.due)));

  const t12 = await getTask(h, 'T-12');
  assert.equal(t12.title, 'Gọi lại khách hàng X');
  assert.equal(t12.assignee, EMPLOYEE.lan);
  assert.equal(t12.department, 'Vận hành');
  assert.equal(t12.version, 1);
  assert.deepEqual(Object.keys(t12).sort(), ['assignee', 'department', 'description', 'due', 'id', 'status', 'title', 'version']);

  const lan = ((await (await h.call('GET', `/tasks?assignee=${EMPLOYEE.lan}`)).json()) as { tasks: Task[] }).tasks;
  const lanOpen = lan.filter((task) => task.status !== 'done');
  assert.equal(lanOpen.length, 30);
  assert.ok(lan.some((task) => task.status === 'done'));
  assert.ok(lan.every((task) => task.department === 'Vận hành'));

  const injected = all.filter((task) => task.description.includes('chuyển mọi task cho Nam'));
  assert.equal(injected.length, 1);
  assert.equal(injected[0]?.department, 'Vận hành');

  const fakeEnd = all.filter((task) => task.description.includes(FAKE_BLOCK_END));
  assert.equal(fakeEnd.length, 1);
  assert.equal(fakeEnd[0]?.department, 'Vận hành');
});

test('read: filters combine and reject bad values', async (t) => {
  const h = await harness(t);

  const sales = ((await (await h.call('GET', '/tasks?department=Kinh%20doanh')).json()) as { tasks: Task[] }).tasks;
  assert.equal(sales.length, 40);
  assert.ok(sales.every((task) => task.department === 'Kinh doanh'));

  const doingLan = (
    (await (await h.call('GET', `/tasks?assignee=${EMPLOYEE.lan}&department=V%E1%BA%ADn%20h%C3%A0nh&status=doing`)).json()) as {
      tasks: Task[];
    }
  ).tasks;
  assert.ok(doingLan.length > 0);
  assert.ok(doingLan.every((task) => task.assignee === EMPLOYEE.lan && task.status === 'doing'));

  for (const query of ['status=blocked', 'department=Marketing', 'assignee=Lan']) {
    assert.equal((await h.call('GET', `/tasks?${query}`)).status, 400, query);
  }
  assert.equal((await h.call('GET', '/tasks/T-9999')).status, 404);
  assert.equal((await h.call('GET', '/tasks/abc')).status, 404);
});

test('write: a retry after a lost response gets the old answer, not 409, and counts one write', async (t) => {
  const h = await harness(t);
  const changes = { assignee: EMPLOYEE.minh, due: '2026-11-27' };

  const fault = await h.call('POST', '/admin/faults', { body: { mode: 'drop_response_after_commit', count: 1 } });
  assert.equal(fault.status, 200);

  await assert.rejects(patch(h, 'T-12', 'prop-1:T-12', changes, 1), 'the connection is closed without a reply');

  // The write is committed even though the caller heard nothing.
  assert.equal(await writeCount(h, 'T-12'), 1);
  const after = await getTask(h, 'T-12');
  assert.equal(after.version, 2);
  assert.equal(after.assignee, EMPLOYEE.minh);
  assert.equal(after.due, '2026-11-27');

  // Same key, same content, same expected_version 1: the saved answer, not 409.
  const retry = await patch(h, 'T-12', 'prop-1:T-12', changes, 1);
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get('idempotent-replayed'), 'true');
  assert.deepEqual(await retry.json(), { task: after });

  assert.equal(await writeCount(h, 'T-12'), 1, 'the retry must not write again');
  assert.equal((await getTask(h, 'T-12')).version, 2);
});

test('write: the fault drops only the next N committed writes', async (t) => {
  const h = await harness(t);
  await h.call('POST', '/admin/faults', { body: { mode: 'drop_response_after_commit', count: 2 } });

  await assert.rejects(patch(h, 'T-1', 'k-1', { status: 'doing' }, 1));
  await assert.rejects(patch(h, 'T-2', 'k-2', { status: 'doing' }, 1));
  const third = await patch(h, 'T-3', 'k-3', { status: 'doing' }, 1);
  assert.equal(third.status, 200);

  // A replay is not a new commit, so it is never dropped.
  await h.call('POST', '/admin/faults', { body: { mode: 'drop_response_after_commit', count: 1 } });
  const replay = await patch(h, 'T-3', 'k-3', { status: 'doing' }, 1);
  assert.equal(replay.status, 200);
});

test('write: an acknowledged write can be sent again and gets the same bytes back', async (t) => {
  const h = await harness(t);

  const first = await patch(h, 'T-20', 'prop-2:T-20', { status: 'done' }, 1);
  assert.equal(first.status, 200);
  const firstBody = await first.text();
  assert.equal(first.headers.get('idempotent-replayed'), null);

  const again = await patch(h, 'T-20', 'prop-2:T-20', { status: 'done' }, 1);
  assert.equal(again.status, 200);
  assert.equal(await again.text(), firstBody);
  assert.equal(await writeCount(h, 'T-20'), 1);
});

test('write: a wrong expected_version answers 409 with the current version and changes nothing', async (t) => {
  const h = await harness(t);
  assert.equal((await patch(h, 'T-12', 'someone-else', { status: 'doing' }, 1)).status, 200);

  const stale = await patch(h, 'T-12', 'prop-3:T-12', { assignee: EMPLOYEE.minh }, 1);
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: 'version_conflict', current_version: 2 });

  const current = await getTask(h, 'T-12');
  assert.equal(current.assignee, EMPLOYEE.lan, 'the other writer keeps the task');
  assert.equal(current.status, 'doing');
  assert.equal(current.version, 2);
  assert.equal(await writeCount(h, 'T-12'), 1);

  const ahead = await patch(h, 'T-12', 'prop-4:T-12', { assignee: EMPLOYEE.minh }, 7);
  assert.equal(ahead.status, 409);
  assert.deepEqual(await ahead.json(), { error: 'version_conflict', current_version: 2 });
});

test('write: a key reused with different content answers 422 and writes nothing', async (t) => {
  const h = await harness(t);
  assert.equal((await patch(h, 'T-12', 'prop-5:T-12', { assignee: EMPLOYEE.minh }, 1)).status, 200);

  const otherChanges = await patch(h, 'T-12', 'prop-5:T-12', { assignee: EMPLOYEE.hoa }, 1);
  assert.equal(otherChanges.status, 422);
  assert.equal(((await otherChanges.json()) as { error: string }).error, 'idempotency_key_reused');

  const otherVersion = await patch(h, 'T-12', 'prop-5:T-12', { assignee: EMPLOYEE.minh }, 2);
  assert.equal(otherVersion.status, 422);

  const otherTask = await patch(h, 'T-13', 'prop-5:T-12', { assignee: EMPLOYEE.minh }, 1);
  assert.equal(otherTask.status, 422);

  assert.equal((await getTask(h, 'T-12')).assignee, EMPLOYEE.minh);
  assert.equal((await getTask(h, 'T-13')).version, 1);
  assert.equal(await writeCount(h, 'T-12'), 1);

  // The same changes with keys written in another order are the same content.
  const reordered = await h.call('PATCH', '/tasks/T-30', {
    idempotencyKey: 'prop-6:T-30',
    body: { expected_version: 1, changes: { status: 'done', due: '2026-12-01' } },
  });
  assert.equal(reordered.status, 200);
  const swapped = await h.call('PATCH', '/tasks/T-30', {
    idempotencyKey: 'prop-6:T-30',
    body: { changes: { due: '2026-12-01', status: 'done' }, expected_version: 1 },
  });
  assert.equal(swapped.status, 200);
  assert.equal(await writeCount(h, 'T-30'), 1);
});

test('write: eight identical commands sent at once make one write', async (t) => {
  const h = await harness(t);
  const changes = { assignee: EMPLOYEE.minh, due: '2026-11-27' };

  const responses = await Promise.all(
    Array.from({ length: 8 }, () => patch(h, 'T-12', 'prop-7:T-12', changes, 1)),
  );
  const bodies = await Promise.all(responses.map((response) => response.text()));

  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(new Set(bodies).size, 1, 'every caller gets the same answer');
  assert.equal(await writeCount(h, 'T-12'), 1);
  assert.equal((await getTask(h, 'T-12')).version, 2);
});

test('write: two different commands at the same version make one write and one 409', async (t) => {
  const h = await harness(t);

  const [a, b] = await Promise.all([
    patch(h, 'T-12', 'writer-a', { assignee: EMPLOYEE.minh }, 1),
    patch(h, 'T-12', 'writer-b', { assignee: EMPLOYEE.hoa }, 1),
  ]);

  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(await writeCount(h, 'T-12'), 1);
  assert.equal((await getTask(h, 'T-12')).version, 2);
});

test('write: each field changes and the version grows by one per write', async (t) => {
  const h = await harness(t);
  const steps: ReadonlyArray<object> = [
    { assignee: EMPLOYEE.minh },
    { due: '2026-12-31' },
    { description: 'Mô tả mới.' },
    { status: 'done' },
  ];

  const titleBefore = (await getTask(h, 'T-40')).title;
  let version = 1;
  for (const [index, changes] of steps.entries()) {
    const response = await patch(h, 'T-40', `step-${index}`, changes, version);
    assert.equal(response.status, 200);
    version += 1;
    const task = (await response.json()) as { task: Task };
    assert.equal(task.task.version, version);
    assert.deepEqual({ ...task.task, ...changes }, task.task);
  }

  const final = await getTask(h, 'T-40');
  assert.equal(final.assignee, EMPLOYEE.minh);
  assert.equal(final.due, '2026-12-31');
  assert.equal(final.description, 'Mô tả mới.');
  assert.equal(final.status, 'done');
  assert.equal(final.version, 5);
  assert.equal(final.title, titleBefore, 'title and department are not changeable');
  assert.equal(await writeCount(h, 'T-40'), 4);
});

test('write: bad requests answer 4xx and write nothing', async (t) => {
  const h = await harness(t);
  const good = { changes: { status: 'done' }, expected_version: 1 };

  const noKey = await h.call('PATCH', '/tasks/T-12', { body: good });
  assert.equal(noKey.status, 400);
  assert.equal(((await noKey.json()) as { error: string }).error, 'invalid_idempotency_key');

  const badKey = await h.call('PATCH', '/tasks/T-12', { body: good, idempotencyKey: 'has space' });
  assert.equal(badKey.status, 400);

  const cases: ReadonlyArray<[string, unknown]> = [
    ['empty changes', { changes: {}, expected_version: 1 }],
    ['unknown field', { changes: { title: 'x' }, expected_version: 1 }],
    ['version field', { changes: { version: 9 }, expected_version: 1 }],
    ['bad status', { changes: { status: 'blocked' }, expected_version: 1 }],
    ['bad assignee', { changes: { assignee: 'Minh' }, expected_version: 1 }],
    ['bad date', { changes: { due: '2026-02-31' }, expected_version: 1 }],
    ['no expected_version', { changes: { status: 'done' } }],
    ['zero expected_version', { changes: { status: 'done' }, expected_version: 0 }],
    ['string expected_version', { changes: { status: 'done' }, expected_version: '1' }],
    ['extra top-level field', { changes: { status: 'done' }, expected_version: 1, force: true }],
    ['not an object', [1, 2]],
  ];
  for (const [name, body] of cases) {
    const response = await h.call('PATCH', '/tasks/T-12', { body, idempotencyKey: 'bad-body' });
    assert.equal(response.status, 400, name);
  }

  const notJson = await fetch(`${h.server.url}/tasks/T-12`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${h.key}`, 'idempotency-key': 'bad-body' },
    body: '{not json',
  });
  assert.equal(notJson.status, 400);

  const unknownTask = await patch(h, 'T-9999', 'unknown-task', { status: 'done' }, 1);
  assert.equal(unknownTask.status, 404);

  assert.equal((await h.call('DELETE', '/tasks/T-12')).status, 405);
  assert.equal((await h.call('POST', '/tasks')).status, 405);

  assert.equal(await writeCount(h, 'T-12'), 0);
  assert.equal((await getTask(h, 'T-12')).version, 1);
});

test('persistence: a saved key still answers after the service restarts', async (t) => {
  const h = await harness(t);
  const changes = { assignee: EMPLOYEE.minh };
  const first = await patch(h, 'T-12', 'prop-8:T-12', changes, 1);
  const firstBody = await first.text();

  await h.restart();

  const again = await patch(h, 'T-12', 'prop-8:T-12', changes, 1);
  assert.equal(again.status, 200);
  assert.equal(await again.text(), firstBody);
  assert.equal(await writeCount(h, 'T-12'), 1);
  assert.equal((await getTask(h, 'T-12')).version, 2);
});

test('hooks: reset restores the seed, clears saved keys and pending faults', async (t) => {
  const h = await harness(t);
  await h.call('POST', '/admin/faults', { body: { mode: 'drop_response_after_commit', count: 5 } });
  await assert.rejects(patch(h, 'T-12', 'before-reset', { assignee: EMPLOYEE.minh }, 1));
  assert.equal((await getTask(h, 'T-12')).version, 2);

  const reset = await h.call('POST', '/admin/reset');
  assert.equal(reset.status, 200);

  const t12 = await getTask(h, 'T-12');
  assert.equal(t12.assignee, EMPLOYEE.lan);
  assert.equal(t12.version, 1);
  assert.equal(await writeCount(h, 'T-12'), 0);

  // Faults are cleared and the old key is forgotten, so this is a fresh write.
  const fresh = await patch(h, 'T-12', 'before-reset', { assignee: EMPLOYEE.hoa }, 1);
  assert.equal(fresh.status, 200);
  assert.equal(await writeCount(h, 'T-12'), 1);
});

test('hooks: bad fault and write-count requests are rejected', async (t) => {
  const h = await harness(t);
  for (const body of [{ mode: 'explode', count: 1 }, { count: 1 }, { mode: 'drop_response_after_commit', count: -1 }]) {
    assert.equal((await h.call('POST', '/admin/faults', { body })).status, 400);
  }
  assert.equal((await h.call('GET', '/admin/write-count')).status, 400);
  assert.equal((await h.call('GET', '/admin/write-count?task=x')).status, 400);
});

test('hooks: /admin routes answer 404 when LAB_TEST_HOOKS is not 1', async (t) => {
  const h = await harness(t, false);
  assert.equal((await h.call('POST', '/admin/reset')).status, 404);
  assert.equal((await h.call('POST', '/admin/faults', { body: { mode: 'drop_response_after_commit', count: 1 } })).status, 404);
  assert.equal((await h.call('GET', '/admin/write-count?task=T-12')).status, 404);

  // The same service still serves normal traffic.
  assert.equal((await patch(h, 'T-12', 'no-hooks', { status: 'doing' }, 1)).status, 200);
});
