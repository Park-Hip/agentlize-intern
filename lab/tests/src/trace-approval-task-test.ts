import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DATA_DIR_ENV, LOOPBACK_HOST, PORT_ENV, RULES_PATH_ENV, SERVICE_KEY_ENV, TEST_HOOKS_ENV } from '@lab/shared';
import { keyOf, pagePasswordOf, runCli, traceTable } from './cli.js';
import { freePorts, labRoot, spawnBuiltService, stopChild, waitForHealth, type SpawnedService } from './process.js';

const HOA = 'NV-02';
const QUANG = 'NV-01';
const DEFAULT_RULES = join(labRoot, 'gateway', 'policy', 'rules.json');

interface ToolAnswer {
  readonly text: string;
  readonly reason_code: string | null;
  readonly trace_id: string;
}

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

function proposalOf(text: string): string {
  const link = text.split('\n').find((line) => /^http:\/\/127\.0\.0\.1:\d+\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a confirmation link: ${text}`);
  return link.slice(link.lastIndexOf('/') + 1);
}

async function signInAs(base: string, employeeId: string, password: string, next: string): Promise<Browser> {
  const login = await fetch(`${base}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: employeeId, password, next }).toString(),
  });
  assert.equal(login.status, 303);
  return { cookie: (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '', csrf: '' };
}

async function signIn(base: string, password: string, proposalId: string): Promise<Browser> {
  const browser = await signInAs(base, HOA, password, `/xac-nhan/${proposalId}`);
  const card = await fetch(`${base}/xac-nhan/${proposalId}`, { headers: { cookie: browser.cookie } });
  assert.equal(card.status, 200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await card.text())?.[1];
  assert.ok(csrf !== undefined, 'the card carries a CSRF token');
  return { cookie: browser.cookie, csrf };
}

async function signInForApproval(
  base: string,
  employeeId: string,
  password: string,
  proposalId: string,
): Promise<Browser> {
  const browser = await signInAs(base, employeeId, password, `/duyet/${proposalId}`);
  const page = await fetch(`${base}/duyet/${proposalId}`, { headers: { cookie: browser.cookie } });
  const html = await page.text();
  assert.equal(page.status, 200, html);
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(csrf !== undefined, 'the approval page carries a CSRF token');
  return { cookie: browser.cookie, csrf };
}

function pressConfirm(base: string, proposalId: string, browser: Browser): Promise<Response> {
  return fetch(`${base}/xac-nhan/${proposalId}/gui`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

function pressApproval(base: string, proposalId: string, browser: Browser): Promise<Response> {
  return fetch(`${base}/duyet/${proposalId}/duyet`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

/** Keep asking the gateway until the write outbox says every item is done. */
async function waitForAllWrites(base: string, proposalId: string, key: string, count: number): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const response = await fetch(`${base}/v1/tools/get_request_status`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: proposalId }),
    });
    const answer = (await response.json()) as ToolAnswer;
    if (answer.text.includes(`đã ghi ${count} trên ${count} mục`)) return;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${count} writes: ${answer.text}`);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
}

function traceIdsIn(html: string): string[] {
  return [...html.matchAll(/tr-[0-9a-f]{16}/g)].map((match) => match[0]).sort();
}

test('trace: task 17 of a 30-task proposal shows the requester, the approver, the policy version and its one write', async (t) => {
  const serviceKey = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-trace-'));
  const rulesDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-trace-rules-'));
  const rulesPath = join(rulesDir, 'rules.json');
  await copyFile(DEFAULT_RULES, rulesPath);

  const [directoryPort, tasksPort, gatewayPort, consolePort] = await freePorts(4);
  const ports = {
    directory: directoryPort ?? 0,
    tasks: tasksPort ?? 0,
    gateway: gatewayPort ?? 0,
    console: consolePort ?? 0,
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: serviceKey,
    [DATA_DIR_ENV]: dataDir,
    [RULES_PATH_ENV]: rulesPath,
    [TEST_HOOKS_ENV]: '1',
    [PORT_ENV.directory]: String(ports.directory),
    [PORT_ENV.tasks]: String(ports.tasks),
    [PORT_ENV.gateway]: String(ports.gateway),
    [PORT_ENV.console]: String(ports.console),
  };

  const started: SpawnedService[] = [];
  t.after(async () => {
    await Promise.all(started.map((service) => stopChild(service.child)));
    await rm(dataDir, { recursive: true, force: true });
    await rm(rulesDir, { recursive: true, force: true });
  });

  const directory = spawnBuiltService('fake-directory', env);
  const tasks = spawnBuiltService('fake-tasks', env);
  started.push(directory, tasks);
  await waitForHealth(directory, ports.directory, serviceKey);
  await waitForHealth(tasks, ports.tasks, serviceKey);

  const gateway = spawnBuiltService('gateway', env);
  started.push(gateway);
  await waitForHealth(gateway, ports.gateway, serviceKey);

  // Keys and page passwords come from the identity CLI; no raw secret is written in this file.
  const keys = runCli('seed-keys-main.js', [], env);
  const hoa = keyOf(keys, 'hoa').key;
  const hoaPagePassword = pagePasswordOf(keys, 'hoa').password;
  const quangPagePassword = pagePasswordOf(keys, 'quang').password;

  const consoleService = spawnBuiltService('console', env);
  started.push(consoleService);
  await waitForHealth(consoleService, ports.console, serviceKey);

  const base = `http://${LOOPBACK_HOST}:${ports.gateway}`;
  const consoleUrl = `http://${LOOPBACK_HOST}:${ports.console}`;

  // T-5 to T-34 are thirty open tasks of chị Lan; the seventeenth item is T-21.
  const lanTasks = Array.from({ length: 30 }, (_, index) => `T-${index + 5}`);
  const seventeenth = 'T-21';
  assert.equal(lanTasks[16], seventeenth, 'the seventeenth item is T-21');
  const answer = await fetch(`${base}/v1/tools/propose_task_change`, {
    method: 'POST',
    headers: { authorization: `Bearer ${hoa}`, 'content-type': 'application/json' },
    body: JSON.stringify({ task_ids: lanTasks, changes: { assignee: 'NV-04' } }),
  });
  const proposalAnswer = (await answer.json()) as ToolAnswer;
  assert.equal(answer.status, 200, proposalAnswer.text);
  assert.equal(proposalAnswer.reason_code, 'NEEDS_APPROVAL', 'thirty items reach the bulk threshold');
  const proposalId = proposalOf(proposalAnswer.text);

  const hoaBrowser = await signIn(base, hoaPagePassword, proposalId);
  const sent = await pressConfirm(base, proposalId, hoaBrowser);
  assert.equal(sent.status, 303, await sent.text());
  const lead = await signInForApproval(base, QUANG, quangPagePassword, proposalId);
  const approved = await pressApproval(base, proposalId, lead);
  assert.equal(approved.status, 303, await approved.text());
  await waitForAllWrites(base, proposalId, hoa, lanTasks.length);

  // The CLI filter must reach the approval line even though that line names the first item, T-5.
  const byTask = traceTable(env, ['--task', seventeenth]);
  const lines = byTask.split('\n').filter((line) => line.trim() !== '');
  const approvalLines = lines.filter((line) => /\sproposal_approve\s/.test(line));
  assert.equal(approvalLines.length, 1, 'the proposal has exactly one approval line, not one per item');
  assert.match(
    approvalLines[0] ?? '',
    new RegExp(String.raw`${QUANG}\s+tho-than-desktop\s+web\s+proposal_approve\s+T-5\s+ok\s+-\s+-\s+WEB\.APPROVE\s+v1`),
    'task 17 shows who approved, and the policy version of the approval',
  );
  assert.match(
    byTask,
    new RegExp(String.raw`${HOA}\s+tho-than-desktop\s+web\s+proposal_send\s+T-5\s+ok\s+-\s+-\s+task\.change_task_assignee_or_due\.staff\.bulk\s+v1`),
    'task 17 shows who requested the proposal, and the policy version of the send',
  );
  const ownWrites = lines.filter((line) => new RegExp(String.raw`\swrite_command\s+${seventeenth}\s`).test(line));
  assert.equal(ownWrites.length, 1, 'task 17 has exactly one write line');
  assert.match(ownWrites[0] ?? '', new RegExp(String.raw`\swrite_command\s+${seventeenth}\s+ok\s+-\s+-\s+WRITE\.SEND\s+v1\b`));
  assert.match(ownWrites[0] ?? '', new RegExp(`${proposalId}:17\\s+1\\s+\\d+\\s+-\\s+chi phí: host không báo$`), 'the write keeps its fixed key and one send');

  const byProposal = traceTable(env, ['--proposal', proposalId]);
  assert.equal((byProposal.match(/\sproposal_approve\s/g) ?? []).length, 1);
  assert.equal((byProposal.match(/\swrite_command\s+T-\d+\s+ok\s/g) ?? []).length, 30);
  for (const task of lanTasks) {
    assert.match(byProposal, new RegExp(String.raw`\swrite_command\s+${task}\s+ok\s`), `${task} was written successfully`);
  }

  // The console page reads the same rows, then the refresh fragment keeps them.
  const page = await (await fetch(`${consoleUrl}/trace?task=${seventeenth}`)).text();
  const plainPage = page.replaceAll('<wbr>', '');
  assert.equal(plainPage.match(/proposal_approve/g)?.length, 1, 'the page shows one approval line');
  assert.match(plainPage, /30 lệnh ghi/, 'the group says the proposal has thirty writes');
  assert.match(plainPage, new RegExp(`Đề xuất <code>${proposalId}</code>`));
  assert.match(plainPage, new RegExp(`<code>${QUANG}</code>`));
  assert.match(plainPage, new RegExp(`<code>${HOA}</code>`));
  assert.match(plainPage, /Lọc theo task/);
  assert.deepEqual(traceIdsIn(page), [...byTask.matchAll(/tr-[0-9a-f]{16}/g)].map((match) => match[0]).sort());

  const fragment = await (await fetch(`${consoleUrl}/trace/rows?task=${seventeenth}`)).text();
  assert.equal(fragment.includes('<!doctype'), false);
  const plainFragment = fragment.replaceAll('<wbr>', '');
  assert.equal(plainFragment.match(/proposal_approve/g)?.length, 1);
  assert.match(plainFragment, /<code>write_command<\/code>/);
  assert.deepEqual(traceIdsIn(fragment), traceIdsIn(page));
});
