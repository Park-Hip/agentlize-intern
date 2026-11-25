import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPLOYEE } from './seed.js';
import {
  addMembers,
  createTask,
  getTask,
  harness,
  issueToken,
  multipleAssigneeCount,
  notificationCount,
  otherWrite,
  patch,
  removeMembers,
  writeCount,
  writeList,
} from './test-support.js';
import type { Task } from './types.js';

const CREATE = {
  title: 'Việc kiểm lời gọi thành viên',
  description: 'Dữ liệu giả của Lab.',
  assignee: EMPLOYEE.minh,
  department: 'Vận hành' as const,
  due: '2026-12-01',
};

test('switch: member calls are off on standard and on in lark-task', async (t) => {
  const standard = await harness(t);
  assert.equal((await addMembers(standard, 'T-12', 'standard-add', [EMPLOYEE.minh])).status, 404);
  assert.equal((await patch(standard, 'T-12', 'standard-patch', { assignee: EMPLOYEE.minh }, 1)).status, 200);
  const oldShape = await getTask(standard, 'T-12');
  assert.equal(oldShape.assignee, EMPLOYEE.minh);
  assert.equal(Object.hasOwn(oldShape, 'assignees'), false, 'standard keeps the old read shape');

  const lark = await harness(t, { profile: 'lark-task' });
  const profile = (await (await lark.call('GET', '/admin/profile')).json()) as {
    switches: { memberCalls: boolean };
  };
  assert.equal(profile.switches.memberCalls, true);
  const first = await getTask(lark, 'T-12');
  assert.deepEqual(first.assignees, [EMPLOYEE.lan]);
  assert.equal(first.assignee, EMPLOYEE.lan);
});

test('switch: a member change needs add_members and remove_members, never a PATCH', async (t) => {
  const h = await harness(t, { profile: 'lark-task' });

  const refused = await patch(h, 'T-12', 'member-patch', { assignee: EMPLOYEE.minh }, 1);
  assert.equal(refused.status, 400);
  assert.equal(((await refused.json()) as { error: string }).error, 'assignee_not_patchable');
  assert.equal(await writeCount(h, 'T-12'), 0);
  assert.deepEqual((await getTask(h, 'T-12')).assignees, [EMPLOYEE.lan]);

  const added = await addMembers(h, 'T-12', 'member-add', [EMPLOYEE.minh]);
  assert.equal(added.status, 200);
  const addedTask = ((await added.json()) as { task: Task }).task;
  assert.equal(addedTask.assignee, EMPLOYEE.lan, 'the old field stays the first member');
  assert.deepEqual(addedTask.assignees, [EMPLOYEE.lan, EMPLOYEE.minh]);
  assert.equal(addedTask.version, 2);
  assert.equal(await writeCount(h, 'T-12'), 1);
  assert.equal(await multipleAssigneeCount(h), 1);

  const replay = await addMembers(h, 'T-12', 'member-add', [EMPLOYEE.minh]);
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('idempotent-replayed'), 'true');
  assert.equal(((await replay.json()) as { task: Task }).task.version, 2);
  assert.equal(await writeCount(h, 'T-12'), 1, 'the saved key does not write again');

  const alreadyThere = await addMembers(h, 'T-12', 'member-add-again', [EMPLOYEE.minh]);
  assert.equal(alreadyThere.status, 200);
  assert.equal(((await alreadyThere.json()) as { task: Task }).task.version, 2, 'an existing member is ignored');
  assert.equal(await writeCount(h, 'T-12'), 1);

  const reused = await addMembers(h, 'T-12', 'member-add', [EMPLOYEE.hoa]);
  assert.equal(reused.status, 422);
  assert.equal(((await reused.json()) as { error: string }).error, 'idempotency_key_reused');

  const absent = await removeMembers(h, 'T-12', [EMPLOYEE.nam]);
  assert.equal(absent.status, 200);
  assert.equal(((await absent.json()) as { task: Task }).task.version, 2, 'an absent member is ignored');
  assert.equal(await writeCount(h, 'T-12'), 1);

  const removed = await removeMembers(h, 'T-12', [EMPLOYEE.lan]);
  assert.equal(removed.status, 200);
  const final = ((await removed.json()) as { task: Task }).task;
  assert.equal(final.assignee, EMPLOYEE.minh);
  assert.deepEqual(final.assignees, [EMPLOYEE.minh]);
  assert.equal(final.version, 3);
  assert.equal(await writeCount(h, 'T-12'), 2);
  assert.equal(await multipleAssigneeCount(h), 0);
  assert.equal(await notificationCount(h, 'T-12'), 2);

  const list = await writeList(h, 'T-12');
  assert.deepEqual(
    list.writes.map((write) => [write.kind, write.fields]),
    [
      ['add_members', ['assignee']],
      ['remove_members', ['assignee']],
    ],
  );
  assert.equal(list.writes[0]?.key, 'member-add', 'the add call keeps the key it was given');
  assert.match(list.writes[1]?.key ?? '', /^member:remove:T-12:\d+$/, 'a remove call has no key of its own');
});

test('switch: a create carries the member list, and a direct edit keeps it truthful', async (t) => {
  const h = await harness(t, { profile: 'lark-task' });
  const token = await issueToken(h);

  const created = await createTask(h, 'member-create', CREATE, { token });
  assert.equal(created.status, 201);
  const task = ((await created.json()) as { task: Task }).task;
  assert.equal(task.assignee, EMPLOYEE.minh);
  assert.deepEqual(task.assignees, [EMPLOYEE.minh]);
  assert.equal(await multipleAssigneeCount(h), 0);

  assert.equal((await otherWrite(h, 'T-12', { assignee: EMPLOYEE.hoa }, 1)).status, 200);
  const edited = await getTask(h, 'T-12');
  assert.equal(edited.assignee, EMPLOYEE.hoa);
  assert.deepEqual(edited.assignees, [EMPLOYEE.hoa]);
});
