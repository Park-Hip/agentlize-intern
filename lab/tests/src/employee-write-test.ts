import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DATA_DIR_ENV,
  PORT_ENV,
  RULES_PATH_ENV,
  SERVICE_KEY_ENV,
  TEST_HOOKS_ENV,
} from '@lab/shared';
import { keyOf, pagePasswordOf, runCli, traceTable } from './cli.js';
import { DOORS } from './doors.js';
import { freePorts, labRoot, spawnBuiltService, stopChild, waitForHealth, type SpawnedService } from './process.js';

const NHUNG = 'NV-06';
const MINH = 'NV-04';
const HOA = 'NV-02';
const DEFAULT_RULES = join(labRoot, 'gateway', 'policy', 'rules.json');

interface EmployeeView {
  readonly employee_id: string;
  readonly version: number;
  readonly work_email: string;
}

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

function proposalOf(text: string): { id: string; text: string } {
  const link = text.split('\n').find((line) => /^http:\/\/127\.0\.0\.1:\d+\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a confirmation link: ${text}`);
  return { id: link.slice(link.lastIndexOf('/') + 1), text };
}

async function signIn(base: string, employeeId: string, password: string, proposalId: string): Promise<Browser> {
  const login = await fetch(`${base}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: employeeId, password, next: `/xac-nhan/${proposalId}` }).toString(),
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

/** Keep polling until a read returns a value, or fail with the reason the wait mattered. */
async function eventually<T>(what: string, read: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

test('employee write: HR edits one work email through the shared path, staff is refused, a replay writes once', async (t) => {
  const door = DOORS.find((candidate) => candidate.name === 'tho-than-host');
  assert.ok(door !== undefined, 'the Thổ Thần host door is available');

  const serviceKey = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-employee-'));
  const rulesDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-employee-rules-'));
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
  t.after(async () => {
    await Promise.all(started.map((service) => stopChild(service.child)));
    await rm(dataDir, { recursive: true, force: true });
    await rm(rulesDir, { recursive: true, force: true });
  });

  const directory = spawnBuiltService('fake-directory', env);
  started.push(directory);
  await waitForHealth(directory, directoryPort ?? 0, serviceKey);

  const gateway = spawnBuiltService('gateway', env);
  started.push(gateway);
  await waitForHealth(gateway, gatewayPort ?? 0, serviceKey);

  const base = `http://127.0.0.1:${gatewayPort}`;
  const directoryUrl = `http://127.0.0.1:${directoryPort}`;
  const serviceHeaders = { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };

  const keys = runCli('seed-keys-main.js', [], env);
  const nhung = keyOf(keys, 'nhung').key;
  const nhungPagePassword = pagePasswordOf(keys, 'nhung').password;
  const hoa = keyOf(keys, 'hoa').key;

  const call = (tool: string, args: unknown, key: string) => door.call(base, tool, args, key);

  const employeeOf = async (employeeId: string): Promise<EmployeeView> => {
    const response = await fetch(`${directoryUrl}/employees/${employeeId}`, { headers: serviceHeaders });
    assert.equal(response.status, 200);
    return (await response.json()) as EmployeeView;
  };

  const writeCount = async (employeeId: string): Promise<number> => {
    const response = await fetch(`${directoryUrl}/admin/write-count?employee=${employeeId}`, { headers: serviceHeaders });
    assert.equal(response.status, 200);
    return ((await response.json()) as { count: number }).count;
  };

  await t.test('chị Hoa is refused, and the directory is untouched', async () => {
    const answer = await call(
      'propose_employee_change',
      { employee_id: MINH, work_email: 'minh.moi@lab.example' },
      hoa,
    );
    assert.equal(answer.reasonCode, 'NOT_PERMITTED');
    assert.match(answer.text, /^CHƯA THỰC HIỆN \[NOT_PERMITTED\] /);
    assert.ok(answer.text.includes('Trần Văn Quang'), 'the refusal says which lead to ask');
    assert.ok(!answer.text.includes('/xac-nhan/'), 'a refused draft returns no link');

    const before = await employeeOf(MINH);
    assert.equal(before.work_email, 'minh.vu@lab.example');
    assert.equal(before.version, 1);
    assert.equal(await writeCount(MINH), 0);

    const trace = traceTable(env, ['--employee', HOA]);
    assert.match(
      trace,
      new RegExp(
        String.raw`${HOA}\s+\S+\s+${door.traceEntry}\s+propose_employee_change\s+${MINH}\s+refused\s+NOT_PERMITTED\s+-\s+employee\.edit_work_email\.staff`,
      ),
      'the trace names the rule the policy engine applied',
    );
  });

  await t.test('chị Nhung drafts, the card shows the email, and Gửi writes it once', async () => {
    const answer = await call(
      'propose_employee_change',
      { employee_id: MINH, work_email: 'minh.moi@lab.example' },
      nhung,
    );
    assert.equal(answer.reasonCode, null, answer.text);
    assert.match(answer.text, /Email công việc: minh\.vu@lab\.example -> minh\.moi@lab\.example/);
    assert.match(answer.text, /Chưa có gì được ghi vào danh bạ/);
    const proposal = proposalOf(answer.text);

    const before = await employeeOf(MINH);
    assert.equal(before.work_email, 'minh.vu@lab.example', 'drafting writes nothing');
    assert.equal(before.version, 1);

    const browser = await signIn(base, NHUNG, nhungPagePassword, proposal.id);
    const card = await fetch(`${base}/xac-nhan/${proposal.id}`, { headers: { cookie: browser.cookie } });
    assert.equal(card.status, 200);
    const cardHtml = await card.text();
    assert.match(cardHtml, /Xác nhận thay đổi NV-04/);
    assert.match(cardHtml, /Email công việc/);
    assert.match(cardHtml, /minh\.vu@lab\.example/);
    assert.match(cardHtml, /minh\.moi@lab\.example/);
    assert.doesNotMatch(cardHtml, /task NV-04/, 'the card names the employee, not a task');

    const pressed = await press(base, proposal.id, browser);
    assert.equal(pressed.status, 303);
    await pressed.text();

    const updated = await eventually('the directory write', async () => {
      const employee = await employeeOf(MINH);
      return employee.work_email === 'minh.moi@lab.example' ? employee : undefined;
    });
    assert.equal(updated.version, 2, 'one write bumps the version one step');
    assert.equal(await writeCount(MINH), 1, 'exactly one committed write, replays excluded');

    const status = await call('get_request_status', { request_id: proposal.id }, nhung);
    assert.match(status.text, /đã ghi thay đổi vào nhân viên NV-04 ở lần gửi thứ 1/);
    assert.equal(status.reasonCode, null);

    // A retry of item 1 with the same key replays the first answer and commits nothing new.
    const replay = await fetch(`${directoryUrl}/employees/${MINH}`, {
      method: 'PATCH',
      headers: { ...serviceHeaders, 'idempotency-key': `${proposal.id}:1` },
      body: JSON.stringify({ expected_version: 1, changes: { work_email: 'minh.moi@lab.example' } }),
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('idempotent-replayed'), 'true');
    assert.equal(((await replay.json()) as EmployeeView).version, 2);
    assert.equal(await writeCount(MINH), 1, 'the retry did not write a second time');

    const doneCard = await fetch(`${base}/xac-nhan/${proposal.id}`, { headers: { cookie: browser.cookie } });
    assert.equal(doneCard.status, 200);
    assert.match(await doneCard.text(), /Đã ghi thay đổi vào NV-04 ở lần gửi thứ 1/);
  });
});
