import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DATA_DIR_ENV, PORT_ENV, SERVICE_KEY_ENV, type ToolResponse } from '@lab/shared';
import { freePorts, labRoot, spawnBuiltService, stopChild, waitForHealth, type SpawnedService } from './process.js';

const HOA = 'NV-02';

interface ProposalAnswer {
  readonly id: string;
  readonly text: string;
}

function proposalOf(text: string): ProposalAnswer {
  const link = text.split('\n').find((line) => /^http:\/\/127\.0\.0\.1:\d+\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a confirmation link: ${text}`);
  return { id: link.slice(link.lastIndexOf('/') + 1), text };
}

function runCli(script: string, args: readonly string[], env: NodeJS.ProcessEnv): string {
  const result = spawnSync(process.execPath, [join(labRoot, 'gateway', 'dist', 'cli', script), ...args], {
    cwd: labRoot,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${script} failed: ${result.stderr}`);
  return result.stdout;
}

/** `seed-keys` prints `persona employee key_id key`; read the key of one persona. */
function keyOf(table: string, persona: string): string {
  const line = table.split('\n').find((candidate) => candidate.startsWith(`${persona}  `));
  const key = line?.trim().split(/\s+/).at(-1);
  assert.ok(key !== undefined && key.startsWith('lab_'), `no key for ${persona}`);
  return key;
}

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

async function signIn(base: string, key: string, proposalId: string): Promise<Browser> {
  const login = await fetch(`${base}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: HOA, key, next: `/xac-nhan/${proposalId}` }).toString(),
  });
  assert.equal(login.status, 303);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const card = await fetch(`${base}/xac-nhan/${proposalId}`, { headers: { cookie } });
  assert.equal(card.status, 200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await card.text())?.[1];
  assert.ok(csrf !== undefined, 'the card carries a CSRF token');
  return { cookie, csrf };
}

function press(base: string, proposalId: string, browser: Browser): Promise<Response> {
  return fetch(`${base}/xac-nhan/${proposalId}/gui`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

test('gateway write path: a lost answer becomes one write, and a changed task is not overwritten', async (t) => {
  const serviceKey = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-write-'));
  const [directoryPort, tasksPort, gatewayPort] = await freePorts(3);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: serviceKey,
    [DATA_DIR_ENV]: dataDir,
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
    [PORT_ENV.gateway]: String(gatewayPort),
    // The fault and write-count routes of the fake task list are behind this switch.
    LAB_TEST_HOOKS: '1',
  };

  const started: SpawnedService[] = [];
  t.after(async () => {
    await Promise.all(started.map((service) => stopChild(service.child)));
    await rm(dataDir, { recursive: true, force: true });
  });

  const directory = spawnBuiltService('fake-directory', env);
  const tasks = spawnBuiltService('fake-tasks', env);
  started.push(directory, tasks);
  await waitForHealth(directory, directoryPort ?? 0, serviceKey);
  await waitForHealth(tasks, tasksPort ?? 0, serviceKey);

  const gateway = spawnBuiltService('gateway', env);
  started.push(gateway);
  await waitForHealth(gateway, gatewayPort ?? 0, serviceKey);

  const base = `http://127.0.0.1:${gatewayPort}`;
  const tasksBase = `http://127.0.0.1:${tasksPort}`;
  const hoa = keyOf(runCli('seed-keys-main.js', [], env), 'hoa');

  const call = async (tool: string, args: unknown): Promise<ToolResponse> => {
    const response = await fetch(`${base}/v1/tools/${tool}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${hoa}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    return (await response.json()) as ToolResponse;
  };

  const taskOf = async (taskId: string): Promise<{ assignee: string; status: string; version: number; description: string }> => {
    const response = await fetch(`${tasksBase}/tasks/${taskId}`, { headers: { authorization: `Bearer ${serviceKey}` } });
    assert.equal(response.status, 200);
    return (await response.json()) as { assignee: string; status: string; version: number; description: string };
  };

  const writeCount = async (taskId: string): Promise<number> => {
    const response = await fetch(`${tasksBase}/admin/write-count?task=${taskId}`, {
      headers: { authorization: `Bearer ${serviceKey}` },
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as { count: number }).count;
  };

  await t.test('the task list commits the write once even when its answer is dropped', async () => {
    const draft = await call('propose_task_change', { task_id: 'T-12', changes: { assignee: 'NV-04' } });
    assert.equal(draft.reason_code, null);
    const proposal = proposalOf(draft.text);
    const browser = await signIn(base, hoa, proposal.id);

    // The next committed write is answered by closing the connection: the gateway cannot know it landed.
    const fault = await fetch(`${tasksBase}/admin/faults`, {
      method: 'POST',
      headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'drop_response_after_commit', count: 1 }),
    });
    assert.equal(fault.status, 200);

    const sent = await press(base, proposal.id, browser);
    assert.equal(sent.status, 303);

    assert.equal(await writeCount('T-12'), 1, 'exactly one committed write, replays excluded');
    const task = await taskOf('T-12');
    assert.equal(task.assignee, 'NV-04');
    assert.equal(task.version, 2, 'one write bumps the version one step');

    const status = await call('get_request_status', { request_id: proposal.id });
    assert.match(status.text, /đã ghi thay đổi vào task T-12 ở lần gửi thứ 2/);
    assert.equal(status.reason_code, null);

    const card = await fetch(`${base}/xac-nhan/${proposal.id}`, { headers: { cookie: browser.cookie } });
    assert.match(await card.text(), /Đã ghi thay đổi vào task T-12 ở lần gửi thứ 2/);

    const trace = runCli('trace-main.js', ['--task', 'T-12'], env);
    assert.match(trace, new RegExp(String.raw`write_command\s+T-12\s+ok\s+-\s+\S+\s+WRITE\.SEND\s+v1\s+-\s+${proposal.id}\s+${proposal.id}:1\s+2`));
  });

  await t.test('a task another person changed is left alone and the press reports TARGET_CHANGED', async () => {
    const draft = await call('propose_task_change', { task_id: 'T-13', changes: { description: 'Mô tả do AI soạn' } });
    const proposal = proposalOf(draft.text);
    const browser = await signIn(base, hoa, proposal.id);

    // Someone else finishes T-13 while the proposal waits.
    const direct = await fetch(`${tasksBase}/tasks/T-13`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        'idempotency-key': 'e2e-direct-write-T-13:1',
      },
      body: JSON.stringify({ changes: { status: 'done' }, expected_version: 1 }),
    });
    assert.equal(direct.status, 200);
    assert.equal(await writeCount('T-13'), 1, 'only the direct write committed so far');

    const sent = await press(base, proposal.id, browser);
    assert.equal(sent.status, 303);
    assert.equal(await writeCount('T-13'), 1, 'the gateway did not write over the other change');

    const task = await taskOf('T-13');
    assert.equal(task.status, 'done');
    assert.notEqual(task.description, 'Mô tả do AI soạn');
    assert.equal(task.version, 2);

    const status = await call('get_request_status', { request_id: proposal.id });
    assert.match(status.text, /\[TARGET_CHANGED\]/);
    assert.match(status.text, /nhờ AI soạn lại/);
    assert.equal(status.reason_code, 'TARGET_CHANGED');

    const card = await fetch(`${base}/xac-nhan/${proposal.id}`, { headers: { cookie: browser.cookie } });
    const html = await card.text();
    assert.match(html, /\[TARGET_CHANGED\]/);
    assert.match(html, /nhờ AI soạn lại/);

    const trace = runCli('trace-main.js', ['--task', 'T-13'], env);
    assert.match(trace, /write_command\s+T-13\s+refused\s+TARGET_CHANGED/);
  });
});
