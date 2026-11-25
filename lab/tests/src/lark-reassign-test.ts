import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import {
  DATA_DIR_ENV,
  PORT_ENV,
  RULES_PATH_ENV,
  SERVICE_KEY_ENV,
  TEST_HOOKS_ENV,
} from '@lab/shared';
import { keyOf, pagePasswordOf, runCli, traceTable } from './cli.js';
import { freePorts, labRoot, spawnBuiltService, stopChild, waitForHealth, type SpawnedService } from './process.js';

const HOA = 'NV-02';
const MINH = 'NV-04';
const DEFAULT_RULES = join(labRoot, 'gateway', 'policy', 'rules.json');
const ASSIGNEE_MODE_ENV = 'LAB_TASKS_ASSIGNEE_MODE';
const TASKS_PROFILE_ENV = 'LAB_TASKS_PROFILE';

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

interface Lab {
  readonly base: string;
  readonly tasksUrl: string;
  readonly serviceKey: string;
  readonly serviceHeaders: Readonly<Record<string, string>>;
  readonly env: NodeJS.ProcessEnv;
  readonly hoaKey: string;
  readonly hoaPassword: string;
}

async function eventually<T>(what: string, read: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Start the fake directory, the lark-task task list and a gateway that reassigns through member calls. */
async function startLab(t: TestContext): Promise<Lab> {
  const serviceKey = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-lark-reassign-'));
  const rulesDir = await mkdtemp(join(tmpdir(), 'agentlize-lark-reassign-rules-'));
  const rulesPath = join(rulesDir, 'rules.json');
  await copyFile(DEFAULT_RULES, rulesPath);

  const [directoryPort, tasksPort, gatewayPort] = await freePorts(3);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: serviceKey,
    [DATA_DIR_ENV]: dataDir,
    [RULES_PATH_ENV]: rulesPath,
    [TEST_HOOKS_ENV]: '1',
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
    [PORT_ENV.gateway]: String(gatewayPort),
    [TASKS_PROFILE_ENV]: 'lark-task',
    [ASSIGNEE_MODE_ENV]: 'members',
  };

  const started: SpawnedService[] = [];
  t.after(async () => {
    for (const service of [...started].reverse()) await stopChild(service.child);
    await rm(dataDir, { recursive: true, force: true });
    await rm(rulesDir, { recursive: true, force: true });
  });

  const directory = spawnBuiltService('fake-directory', env);
  started.push(directory);
  const tasks = spawnBuiltService('fake-tasks', env);
  started.push(tasks);
  await waitForHealth(directory, directoryPort ?? 0, serviceKey);
  await waitForHealth(tasks, tasksPort ?? 0, serviceKey);

  const gateway = spawnBuiltService('gateway', env);
  started.push(gateway);
  await waitForHealth(gateway, gatewayPort ?? 0, serviceKey);

  const keys = runCli('seed-keys-main.js', [], env);

  return {
    base: `http://127.0.0.1:${gatewayPort}`,
    tasksUrl: `http://127.0.0.1:${tasksPort}`,
    serviceKey,
    serviceHeaders: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    env,
    hoaKey: keyOf(keys, 'hoa').key,
    hoaPassword: pagePasswordOf(keys, 'hoa').password,
  };
}

async function signIn(lab: Lab, proposalId: string): Promise<Browser> {
  const login = await fetch(`${lab.base}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      employee: HOA,
      password: lab.hoaPassword,
      next: `/xac-nhan/${proposalId}`,
    }).toString(),
  });
  assert.equal(login.status, 303);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const card = await fetch(`${lab.base}/xac-nhan/${proposalId}`, { headers: { cookie } });
  assert.equal(card.status, 200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await card.text())?.[1];
  assert.ok(csrf !== undefined, 'the card carries a CSRF token');
  return { cookie, csrf };
}

function press(lab: Lab, proposalId: string, browser: Browser): Promise<Response> {
  return fetch(`${lab.base}/xac-nhan/${proposalId}/gui`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

async function draftReassign(lab: Lab): Promise<{ id: string; browser: Browser }> {
  const answer = await fetch(`${lab.base}/v1/tools/propose_task_change`, {
    method: 'POST',
    headers: { ...lab.serviceHeaders, authorization: `Bearer ${lab.hoaKey}` },
    body: JSON.stringify({ task_ids: ['T-12'], changes: { assignee: MINH } }),
  });
  const body = (await answer.json()) as { text: string; reason_code: string | null };
  assert.equal(answer.status, 200, body.text);
  assert.equal(body.reason_code, null, body.text);
  const link = body.text.split('\n').find((line) => /\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a confirmation link: ${body.text}`);
  const id = link.slice(link.lastIndexOf('/') + 1);
  return { id, browser: await signIn(lab, id) };
}

async function armDrop(lab: Lab, call: 'add_members' | 'remove_members'): Promise<void> {
  const response = await fetch(`${lab.tasksUrl}/admin/faults`, {
    method: 'POST',
    headers: lab.serviceHeaders,
    body: JSON.stringify({ mode: 'drop_response_after_commit', count: 1, call }),
  });
  assert.equal(response.status, 200, await response.text());
}

async function targetJson<T>(lab: Lab, path: string): Promise<T> {
  const response = await fetch(`${lab.tasksUrl}${path}`, { headers: lab.serviceHeaders });
  assert.equal(response.status, 200, path);
  return (await response.json()) as T;
}

interface TaskView {
  readonly id: string;
  readonly assignee: string;
  readonly assignees: readonly string[];
  readonly version: number;
}

interface WriteEntry {
  readonly kind: string;
  readonly key: string;
  readonly fields: readonly string[];
}

async function waitExecuted(lab: Lab, id: string): Promise<{ text: string; attempts: number }> {
  return eventually('the gateway to settle the write', async () => {
    const response = await fetch(`${lab.base}/v1/tools/get_request_status`, {
      method: 'POST',
      headers: { authorization: `Bearer ${lab.hoaKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: id }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { text: string; gateway_status: string };
    if (body.gateway_status !== 'executed') return undefined;
    const attempts = /lần gửi thứ (\d+)/.exec(body.text)?.[1];
    assert.ok(attempts !== undefined, `the status names the send round: ${body.text}`);
    return { text: body.text, attempts: Number(attempts) };
  });
}

test('lark-task reassign through the gateway: one new assignee, the counter returns to zero, and both calls are traced', async (t) => {
  for (const scenario of ['clean', 'drop after add', 'drop after remove'] as const) {
    await t.test(scenario, async (t) => {
      const lab = await startLab(t);
      if (scenario === 'drop after add') await armDrop(lab, 'add_members');
      if (scenario === 'drop after remove') await armDrop(lab, 'remove_members');

      const { id, browser } = await draftReassign(lab);
      const pressed = await press(lab, id, browser);
      assert.equal(pressed.status, 303, await pressed.text());

      const status = await waitExecuted(lab, id);
      assert.match(status.text, /đã ghi thay đổi vào task T-12/);
      assert.equal(status.attempts, scenario === 'clean' ? 1 : 2, 'a lost answer costs one resend');

      const task = await targetJson<TaskView>(lab, '/tasks/T-12');
      assert.equal(task.assignee, MINH);
      assert.deepEqual(task.assignees, [MINH], 'the task ends with exactly the new assignee');
      assert.equal(task.version, 3, 'the add and the remove each moved one version, and the resend moved none');

      const multiple = await targetJson<{ count: number }>(lab, '/admin/multiple-assignee-count');
      assert.equal(multiple.count, 0, 'no task is left with more than one assignee');
      assert.equal(await targetJson<{ count: number }>(lab, '/admin/write-count?task=T-12').then((body) => body.count), 2);

      const writes = await targetJson<{ writes: readonly WriteEntry[] }>(lab, '/admin/writes?task=T-12');
      assert.deepEqual(
        writes.writes.map((write) => [write.kind, write.fields]),
        [
          ['add_members', ['assignee']],
          ['remove_members', ['assignee']],
        ],
        'the target write trace names the add and the remove',
      );
      assert.equal(writes.writes[0]?.key, `${id}:1`, 'the add carries the command key');
      assert.match(writes.writes[1]?.key ?? '', /^member:remove:T-12:\d+$/, 'the remove has no client token');

      const trace = traceTable(lab.env, ['--task', 'T-12']);
      assert.match(trace, /write_command/, 'the gateway trace has the write line');
      assert.match(trace, new RegExp(`${id}:1\\s+${String(status.attempts)}\\b`), 'the trace names the key and the send count');
      assert.match(trace, new RegExp(`write_command\\s+T-12\\s+ok`), 'the write ended well');
    });
  }
});
