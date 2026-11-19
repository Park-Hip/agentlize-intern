import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DATA_DIR_ENV, LOOPBACK_HOST, PORT_ENV, RULES_PATH_ENV, SERVICE_KEY_ENV } from '@lab/shared';
import { runCli, traceTable } from './cli.js';
import { freePorts, spawnBuiltService, stopChild, waitForHealth, type SpawnedService } from './process.js';

const SCENARIO_A = 'a';
const SCENARIO_B = 'b';

function csrfOf(html: string): string {
  const token = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(token !== undefined, 'the playground page carries a CSRF token');
  return token;
}

async function postScenario(consoleUrl: string, csrf: string, scenario: string): Promise<string> {
  const response = await fetch(`${consoleUrl}/playground`, {
    method: 'POST',
    // A browser sends the console's own Origin with the form; the console refuses a POST without it.
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: new URL(consoleUrl).origin },
    body: new URLSearchParams({ csrf, scenario }).toString(),
  });
  assert.equal(response.status, 200);
  return response.text();
}

test('console playground: scenario A drafts a proposal through the real gateway and the trace names lab-console', async (t) => {
  const serviceKey = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-console-'));
  const [directoryPort, tasksPort, gatewayPort, consolePort] = await freePorts(4);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: serviceKey,
    [DATA_DIR_ENV]: dataDir,
    [RULES_PATH_ENV]: join(dataDir, 'rules.json'),
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
    [PORT_ENV.gateway]: String(gatewayPort),
    [PORT_ENV.console]: String(consolePort),
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

  const consoleService = spawnBuiltService('console', env);
  started.push(consoleService);
  await waitForHealth(consoleService, consolePort ?? 0, serviceKey);

  const consoleUrl = `http://${LOOPBACK_HOST}:${consolePort}`;
  const gatewayUrl = `http://${LOOPBACK_HOST}:${gatewayPort}`;

  // The form comes from the gateway catalog and goes through the real gateway.
  const page = await fetch(`${consoleUrl}/playground?persona=NV-02&tool=propose_task_change`);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /<h1>Sân chơi<\/h1>/);
  assert.match(pageHtml, /name="arg\.task_id"/);
  const csrf = csrfOf(pageHtml);

  const scenarioA = await postScenario(consoleUrl, csrf, SCENARIO_A);
  assert.match(scenarioA, /HTTP 200/);
  assert.match(scenarioA, /Đã soạn đề xuất dx-[0-9a-f]{16} cho task T-12/);
  assert.match(scenarioA, /<a class="btn" href="http:\/\/127\.0\.0\.1:\d+\/xac-nhan\/dx-[0-9a-f]{16}">Mở thẻ xác nhận<\/a>/);
  assert.match(scenarioA, /<th scope="row">Nơi gọi<\/th><td>lab-console<\/td>/);
  assert.match(scenarioA, /<th scope="row">Người hỏi<\/th><td>NV-02<\/td>/);
  assert.match(scenarioA, /Mã vết: <code>tr-[0-9a-f]{16}<\/code>/);
  assert.equal(scenarioA.includes(gatewayUrl.replace('http://', '')), true, 'the link points at the gateway');
  assert.equal(/lab_[A-Za-z0-9_-]{10,}/.test(scenarioA), false, 'no raw key on the result page');

  // Scenario B: the same sentence as Nam, refused with a reason and no link.
  const scenarioB = await postScenario(consoleUrl, csrf, SCENARIO_B);
  assert.match(scenarioB, /HTTP 403/);
  assert.match(scenarioB, /Mã lý do: <strong>NOT_PERMITTED<\/strong>/);
  assert.match(scenarioB, /CHƯA THỰC HIỆN \[NOT_PERMITTED\]/);
  assert.match(scenarioB, /Trần Văn Quang, trưởng nhóm Vận hành/);
  assert.equal(scenarioB.includes('Mở thẻ xác nhận'), false, 'a refused draft has no confirmation link');
  assert.match(scenarioB, /<th scope="row">Người hỏi<\/th><td>NV-05<\/td>/);

  // Both calls went through the gateway's own door, under the console caller.
  const trace = traceTable(env);
  assert.match(trace, /NV-02\s+lab-console\s+http\s+propose_task_change\s+T-12\s+ok\s+-\s+-\s+task\.change_task_assignee_or_due\.(staff|intern)/);
  assert.match(trace, /NV-05\s+lab-console\s+http\s+propose_task_change\s+T-12\s+refused\s+NOT_PERMITTED/);

  // One key per persona plus the guest is active while the console runs, and no raw key reaches the log.
  const keys = runCli('keys-main.js', ['list'], env);
  const consoleKeys = keys.split('\n').filter((line) => line.includes('lab-console'));
  assert.equal(consoleKeys.length, 7);
  assert.equal(consoleKeys.filter((line) => line.includes('active')).length, 7);

  const logs = started.map((service) => service.output()).join('\n');
  assert.equal(/lab_[A-Za-z0-9_-]{10,}/.test(logs), false, 'no raw key in any service log');
  assert.equal(logs.includes(serviceKey), false, 'the service key never reaches a log');
});
