import assert from 'node:assert/strict';
import test from 'node:test';
import { readTaskAssigneeMode, TasksAdapter, TASK_ASSIGNEE_MODE_ENV, taskSchema } from './tasks.js';
import type { ApplyResult } from './types.js';

interface Call {
  readonly method: string;
  readonly path: string;
  readonly key: string | null;
  readonly body: unknown;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A task list that keeps the member list and counts versions the way the real profile does. */
function memberSystem(): {
  readonly fetch: typeof fetch;
  readonly calls: Call[];
  failNextRemove(): void;
  members(): readonly string[];
} {
  let version = 1;
  let due = '2026-11-27';
  let members = ['NV-03'];
  let failRemove = false;
  const calls: Call[] = [];

  const task = (): unknown => ({
    id: 'T-12',
    title: 'Gọi lại khách hàng X',
    description: 'Dữ liệu giả của Lab.',
    assignee: members[0] ?? '',
    assignees: [...members],
    department: 'Vận hành',
    status: 'todo',
    due,
    version,
  });

  const doFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = init?.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown);
    calls.push({ method, path: url.pathname, key: headers.get('idempotency-key'), body });

    if (method === 'GET') return json(200, task());
    if (method === 'PATCH') {
      const changes = (body as { changes?: { due?: string } }).changes ?? {};
      if (changes.due !== undefined) due = changes.due;
      version += 1;
      return json(200, { task: task() });
    }
    if (url.pathname.endsWith('/add_members')) {
      const wanted = (body as { members?: string[] }).members ?? [];
      const added = wanted.filter((member) => !members.includes(member));
      if (added.length > 0) {
        members = [...members, ...added];
        version += 1;
      }
      return json(200, { task: task() });
    }
    if (url.pathname.endsWith('/remove_members')) {
      const wanted = new Set((body as { members?: string[] }).members ?? []);
      const kept = members.filter((member) => !wanted.has(member));
      if (kept.length !== members.length) {
        members = kept;
        version += 1;
      }
      if (failRemove) {
        // The removal landed; only the answer is lost.
        failRemove = false;
        throw new TypeError('network down');
      }
      return json(200, { task: task() });
    }
    return json(404, { error: 'not_found' });
  };

  return {
    fetch: doFetch,
    calls,
    failNextRemove: () => {
      failRemove = true;
    },
    members: () => [...members],
  };
}

function adapter(fetchImpl: typeof fetch, assigneeMode: 'patch' | 'members'): TasksAdapter {
  return new TasksAdapter({ url: 'http://tasks.test', serviceKey: 'k', fetch: fetchImpl, assigneeMode });
}

test('assignee mode: the documented option defaults to patch and refuses an unknown value', () => {
  assert.equal(readTaskAssigneeMode({}), 'patch');
  assert.equal(readTaskAssigneeMode({ [TASK_ASSIGNEE_MODE_ENV]: 'members' }), 'members');
  assert.equal(readTaskAssigneeMode({ [TASK_ASSIGNEE_MODE_ENV]: 'patch' }), 'patch');
  assert.throws(() => readTaskAssigneeMode({ [TASK_ASSIGNEE_MODE_ENV]: 'both' }), /LAB_TASKS_ASSIGNEE_MODE/);
});

test('assignee mode: patch keeps one PATCH and never calls the member routes', async () => {
  const system = memberSystem();
  const tasks = adapter(system.fetch, 'patch');

  const result = await tasks.apply({
    id: 'T-12',
    idempotencyKey: 'dx-0123456789abcdef:1',
    expectedVersion: 1,
    changes: { assignee: 'NV-04' },
  });

  assert.equal(result.kind, 'written');
  assert.deepEqual(
    system.calls.map((call) => [call.method, call.path]),
    [['PATCH', '/tasks/T-12']],
  );
  assert.equal(system.calls[0]?.key, 'dx-0123456789abcdef:1');
});

test('assignee mode: members adds first with the command key, then removes the old member', async () => {
  const system = memberSystem();
  const tasks = adapter(system.fetch, 'members');

  const result = await tasks.apply({
    id: 'T-12',
    idempotencyKey: 'dx-0123456789abcdef:1',
    expectedVersion: 1,
    changes: { assignee: 'NV-04', due: '2026-12-01' },
  });

  assert.equal(result.kind, 'written');
  assert.deepEqual(
    system.calls.map((call) => [call.method, call.path, call.key]),
    [
      ['GET', '/tasks/T-12', null],
      ['PATCH', '/tasks/T-12', 'dx-0123456789abcdef:1'],
      ['POST', '/tasks/T-12/add_members', 'dx-0123456789abcdef:1'],
      ['POST', '/tasks/T-12/remove_members', null],
      ['GET', '/tasks/T-12', null],
    ],
    'the due change stays a PATCH; the assignee goes through add then remove',
  );
  assert.deepEqual(system.calls[2]?.body, { members: ['NV-04'] });
  assert.deepEqual(system.calls[3]?.body, { members: ['NV-03'] });

  const written = taskSchema.parse(result.kind === 'written' ? result.record : {});
  assert.equal(written.assignee, 'NV-04');
  assert.equal(written.due, '2026-12-01');
});

test('assignee mode: a lost answer on remove leaves the call unknown, and the resend sees nothing left to remove', async () => {
  const system = memberSystem();
  const tasks = adapter(system.fetch, 'members');
  const write = {
    id: 'T-12',
    idempotencyKey: 'dx-0123456789abcdef:1',
    expectedVersion: 1,
    changes: { assignee: 'NV-04' },
  };

  system.failNextRemove();
  const first: ApplyResult = await tasks.apply(write);
  assert.equal(first.kind, 'unavailable');

  const beforeResend = system.calls.length;
  const second = await tasks.apply(write);
  assert.equal(second.kind, 'written');
  assert.deepEqual(
    system.calls.slice(beforeResend).map((call) => [call.method, call.path, call.key]),
    [
      ['GET', '/tasks/T-12', null],
      ['POST', '/tasks/T-12/add_members', 'dx-0123456789abcdef:1'],
      ['GET', '/tasks/T-12', null],
    ],
    'the remove already landed, so the resend has only the add replay and the final read',
  );
  assert.equal(
    system.calls.slice(beforeResend).some((call) => call.path.endsWith('/remove_members')),
    false,
    'the resend sends no second remove',
  );

  assert.deepEqual(system.members(), ['NV-04'], 'the task ends with exactly the new assignee');
  const written = taskSchema.parse(second.kind === 'written' ? second.record : {});
  assert.equal(written.assignee, 'NV-04');
  const keys = system.calls.filter((call) => call.path.endsWith('/add_members')).map((call) => call.key);
  assert.deepEqual(keys, ['dx-0123456789abcdef:1', 'dx-0123456789abcdef:1']);
});
