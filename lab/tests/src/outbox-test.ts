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
import { keyOf, pagePasswordOf, runCli } from './cli.js';
import { freePorts, killChild, labRoot, spawnBuiltService, stopChild, waitForHealth, type SpawnedService } from './process.js';

const QUANG = 'NV-01';
const LAN_OPEN_TASKS = Array.from({ length: 30 }, (_, index) => `T-${index + 5}`);
const DEFAULT_RULES = join(labRoot, 'gateway', 'policy', 'rules.json');

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

interface Lab {
  readonly base: string;
  readonly tasksUrl: string;
  readonly serviceHeaders: Readonly<Record<string, string>>;
  readonly env: NodeJS.ProcessEnv;
  readonly gatewayPort: number;
  readonly tasksPort: number;
  readonly serviceKey: string;
  readonly quangKey: string;
  readonly quangPagePassword: string;
  readonly gateway: SpawnedService;
  readonly tasks: SpawnedService;
  /** A service started later is closed by the test cleanup too. */
  track(service: SpawnedService): SpawnedService;
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

async function signIn(base: string, employee: string, password: string, proposalId: string): Promise<Browser> {
  const login = await fetch(`${base}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee, password, next: `/xac-nhan/${proposalId}` }).toString(),
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

/** Start two fake systems and the gateway on free ports, with one key and one page password for anh Quang. */
async function startLab(t: TestContext): Promise<Lab> {
  const serviceKey = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-outbox-'));
  const rulesDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-outbox-rules-'));
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
  };

  const started: SpawnedService[] = [];
  const track = (service: SpawnedService): SpawnedService => {
    started.push(service);
    return service;
  };

  t.after(async () => {
    for (const service of [...started].reverse()) await stopChild(service.child);
    await rm(dataDir, { recursive: true, force: true });
    await rm(rulesDir, { recursive: true, force: true });
  });

  const directory = track(spawnBuiltService('fake-directory', env));
  const tasks = track(spawnBuiltService('fake-tasks', env));
  await waitForHealth(directory, directoryPort ?? 0, serviceKey);
  await waitForHealth(tasks, tasksPort ?? 0, serviceKey);

  const gateway = track(spawnBuiltService('gateway', env));
  await waitForHealth(gateway, gatewayPort ?? 0, serviceKey);

  const keys = runCli('seed-keys-main.js', [], env);

  return {
    base: `http://127.0.0.1:${gatewayPort}`,
    tasksUrl: `http://127.0.0.1:${tasksPort}`,
    serviceHeaders: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    env,
    gatewayPort: gatewayPort ?? 0,
    tasksPort: tasksPort ?? 0,
    serviceKey,
    quangKey: keyOf(keys, 'quang').key,
    quangPagePassword: pagePasswordOf(keys, 'quang').password,
    gateway,
    tasks,
    track,
  };
}

/** Start the gateway again on the same port and data, the way a person starts it after a crash. */
async function restartGateway(lab: Lab): Promise<SpawnedService> {
  const gateway = lab.track(spawnBuiltService('gateway', lab.env));
  await waitForHealth(gateway, lab.gatewayPort, lab.serviceKey);
  return gateway;
}

async function restartTasks(lab: Lab): Promise<SpawnedService> {
  const tasks = lab.track(spawnBuiltService('fake-tasks', lab.env));
  await waitForHealth(tasks, lab.tasksPort, lab.serviceKey);
  return tasks;
}

async function draftThirty(lab: Lab): Promise<{ id: string; browser: Browser }> {
  const answer = await fetch(`${lab.base}/v1/tools/propose_task_change`, {
    method: 'POST',
    headers: { ...lab.serviceHeaders, authorization: `Bearer ${lab.quangKey}` },
    body: JSON.stringify({ task_ids: LAN_OPEN_TASKS, changes: { assignee: 'NV-04' } }),
  });
  const body = (await answer.json()) as { text: string; reason_code: string | null };
  assert.equal(answer.status, 200, body.text);
  assert.equal(body.reason_code, null, body.text);
  const link = body.text.split('\n').find((line) => /\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a confirmation link: ${body.text}`);
  const id = link.slice(link.lastIndexOf('/') + 1);
  return { id, browser: await signIn(lab.base, QUANG, lab.quangPagePassword, id) };
}

async function writeCount(lab: Lab, taskId: string): Promise<number> {
  const response = await fetch(`${lab.tasksUrl}/admin/write-count?task=${taskId}`, { headers: lab.serviceHeaders });
  assert.equal(response.status, 200);
  return ((await response.json()) as { count: number }).count;
}

async function armHold(lab: Lab, position: number, when: 'before' | 'after'): Promise<void> {
  const mode = when === 'before' ? 'hold_item_before_commit' : 'hold_item_after_commit';
  const response = await fetch(`${lab.tasksUrl}/admin/faults`, {
    method: 'POST',
    headers: lab.serviceHeaders,
    body: JSON.stringify({ mode, position, delay_ms: 60_000 }),
  });
  assert.equal(response.status, 200, await response.text());
}

async function waitAllThirty(lab: Lab, timeoutMs = 60_000): Promise<void> {
  await eventually(
    'the background loop to write all thirty tasks',
    async () => {
      const counts = await Promise.all(LAN_OPEN_TASKS.map((task) => writeCount(lab, task)));
      return counts.every((count) => count === 1) ? true : undefined;
    },
    timeoutMs,
  );
  for (const task of LAN_OPEN_TASKS) {
    assert.equal(await writeCount(lab, task), 1, `${task} was written exactly once`);
    const response = await fetch(`${lab.tasksUrl}/tasks/${task}`, { headers: lab.serviceHeaders });
    const stored = (await response.json()) as { assignee: string; version: number };
    assert.equal(stored.assignee, 'NV-04', `${task} holds the change the card showed`);
    assert.equal(stored.version, 2, `${task} moved one version`);
  }
}

/** Press Gửi and assert the page answers before any system call can finish. */
async function pressQuickly(lab: Lab, id: string, browser: Browser): Promise<void> {
  const started = Date.now();
  const pressed = await press(lab.base, id, browser);
  const elapsed = Date.now() - started;
  assert.equal(pressed.status, 303);
  assert.ok(elapsed < 1_000, `Gửi answered in ${elapsed} ms`);
}

async function statusText(lab: Lab, id: string): Promise<{ text: string; reason_code: string | null }> {
  const answer = await fetch(`${lab.base}/v1/tools/get_request_status`, {
    method: 'POST',
    headers: { authorization: `Bearer ${lab.quangKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ request_id: id }),
  });
  assert.equal(answer.status, 200);
  return (await answer.json()) as { text: string; reason_code: string | null };
}

test('outbox: a crash before the first item, mid item 17 and after item 30 still writes each of thirty tasks once', async (t) => {
  for (const point of ['before the first item', 'mid item 17', 'after item 30'] as const) {
    await t.test(point, async (t) => {
      const lab = await startLab(t);
      const { id, browser } = await draftThirty(lab);

      if (point === 'before the first item') await armHold(lab, 1, 'before');
      if (point === 'mid item 17') await armHold(lab, 17, 'after');
      if (point === 'after item 30') await armHold(lab, 30, 'after');

      if (point === 'before the first item') {
        // The first send is held before it commits; the process is stopped while no task has changed.
        await pressQuickly(lab, id, browser);
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 300));
        assert.equal(await writeCount(lab, 'T-5'), 0, 'nothing was written before the crash');
      } else {
        await pressQuickly(lab, id, browser);
        const watched = point === 'mid item 17' ? 'T-21' : 'T-34';
        await eventually(
          `${watched} to be committed before the crash`,
          async () => ((await writeCount(lab, watched)) === 1 ? true : undefined),
        );
      }

      // A crash: no signal handler, no closing the database.
      await killChild(lab.gateway.child);
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 200));

      await restartGateway(lab);
      await waitAllThirty(lab);

      const status = await statusText(lab, id);
      assert.match(status.text, /đã ghi 30 trên 30 mục/, 'the proposal ends as fully written');
    });
  }
});

test('outbox: the task list not answering for twenty seconds does not need a gateway restart', async (t) => {
  const lab = await startLab(t);
  const { id, browser } = await draftThirty(lab);

  // Item 15 commits, then its answer is held: the run is exactly in the middle when the task list disappears.
  await armHold(lab, 15, 'after');
  await pressQuickly(lab, id, browser);

  await eventually('the run to reach item 15', async () => ((await writeCount(lab, 'T-19')) === 1 ? true : undefined));

  // The task list disappears for twenty seconds; the gateway keeps the open command and resends with its old key.
  await killChild(lab.tasks.child);
  await new Promise((resolveSleep) => setTimeout(resolveSleep, 20_000));
  await restartTasks(lab);

  await waitAllThirty(lab, 90_000);

  const status = await statusText(lab, id);
  assert.match(status.text, /đã ghi 30 trên 30 mục/, 'the same process finished all thirty items');
});
