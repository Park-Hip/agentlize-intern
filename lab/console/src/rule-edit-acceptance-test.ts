import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DATA_DIR_ENV, LOOPBACK_HOST, PORT_ENV, SERVICE_KEY_ENV, TEST_HOOKS_ENV } from '@lab/shared';
import { startConsole } from './server.js';
import { catalogOf, freePort, hiddenFields, postForm, readRules, saveFields } from './test-support.js';

/** console/dist is two levels below lab/. */
const LAB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEALTH_TIMEOUT_MS = 15_000;

interface ChildService {
  readonly name: string;
  readonly child: ChildProcess;
  output(): string;
}

function spawnService(packageDir: string, env: NodeJS.ProcessEnv): ChildService {
  const child = spawn(process.execPath, [join(LAB_ROOT, packageDir, 'dist', 'index.js')], {
    cwd: LAB_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let captured = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    captured += chunk;
  });
  child.stderr?.on('data', (chunk: string) => {
    captured += chunk;
  });
  return { name: packageDir, child, output: () => captured };
}

async function waitForHealth(service: ChildService, port: number, serviceKey: string): Promise<void> {
  const url = `http://${LOOPBACK_HOST}:${port}/health`;
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (service.child.exitCode !== null || service.child.signalCode !== null) {
      throw new Error(`${service.name} exited before answering ${url}\n${service.output()}`);
    }
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${serviceKey}` },
        signal: AbortSignal.timeout(1_000),
      });
      await response.text();
      if (response.ok) return;
    } catch {
      // The socket may not be open yet.
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`${service.name} did not answer ${url}\n${service.output()}`);
}

function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((done) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done();
    }, 3_000);
    timer.unref();
    child.once('exit', () => {
      clearTimeout(timer);
      done();
    });
    child.kill('SIGTERM');
  });
}

/** `seed-keys` prints one line per persona; read one raw key without writing it anywhere. */
function seededKey(output: string, persona: string): string {
  const line = output.split('\n').find((candidate) => candidate.startsWith(`${persona}  `));
  const key = line?.trim().split(/\s+/)[3];
  assert.ok(key !== undefined && key.startsWith('lab_'), `no key for ${persona}`);
  return key;
}

/**
 * The experiment the issue names, end to end: remove `work_email` from the
 * staff role in the console, then call the real gateway with chị Hoa's key and
 * see the field gone. The three real services and the console run here; the
 * rule file lives in a temporary data folder and is never the committed one.
 */
test('acceptance: removing work_email from staff in the console changes the next gateway answer', async (t) => {
  const serviceKey = randomBytes(32).toString('base64url');
  const dataDir = mkdtempSync(join(tmpdir(), 'lab-console-acceptance-'));
  const [directoryPort, tasksPort, gatewayPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: serviceKey,
    [DATA_DIR_ENV]: dataDir,
    [TEST_HOOKS_ENV]: '1',
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
    [PORT_ENV.gateway]: String(gatewayPort),
  };

  const started: ChildService[] = [];
  let consoleService: Awaited<ReturnType<typeof startConsole>> | undefined;
  t.after(async () => {
    if (consoleService !== undefined) await consoleService.close();
    await Promise.all(started.map((service) => stopChild(service.child)));
    rmSync(dataDir, { recursive: true, force: true });
  });

  const directory = spawnService('fake-directory', env);
  const tasks = spawnService('fake-tasks', env);
  started.push(directory, tasks);
  await waitForHealth(directory, directoryPort ?? 0, serviceKey);
  await waitForHealth(tasks, tasksPort ?? 0, serviceKey);

  const gateway = spawnService('gateway', env);
  started.push(gateway);
  await waitForHealth(gateway, gatewayPort ?? 0, serviceKey);

  const keys = spawnSync(process.execPath, [join(LAB_ROOT, 'gateway', 'dist', 'cli', 'seed-keys-main.js')], {
    cwd: LAB_ROOT,
    env,
    encoding: 'utf8',
  });
  assert.equal(keys.status, 0, keys.stderr);

  consoleService = await startConsole({ port: 0, env });
  const consolePort = consoleService.port;

  // A field added to the directory after the rule file: it must appear as "chưa khai".
  const added = await fetch(`http://${LOOPBACK_HOST}:${directoryPort}/admin/add-field`, {
    method: 'POST',
    headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ field: 'badge_code', value: 'BADGE-NV-04' }),
  });
  assert.equal(added.status, 200, await added.text());

  const page = await (await fetch(`http://${LOOPBACK_HOST}:${consolePort}/permissions`)).text();
  assert.match(page, /Đang áp <strong>phiên bản 1<\/strong>/);
  assert.match(page, /chưa khai/);
  assert.match(page, /badge_code/);
  const hidden = hiddenFields(page);
  const rules = readRules(join(dataDir, 'rules.json'));
  const fields = saveFields(rules, hidden, catalogOf(page), (form) => {
    const staff = form.get('fields.employee.staff') ?? [];
    form.set(
      'fields.employee.staff',
      staff.filter((field) => field !== 'work_email'),
    );
    const taskStaff = form.get('fields.task.staff') ?? [];
    form.set(
      'fields.task.staff',
      taskStaff.filter((field) => field !== 'description'),
    );
  });

  const saved = await postForm({ port: consolePort }, fields);
  assert.equal(saved.status, 303);
  assert.equal(saved.headers.get('location'), '/permissions?saved=2');
  await saved.text();

  const after = readRules(join(dataDir, 'rules.json'));
  assert.equal(after['version'], 2);
  const resources = after['resources'] as Record<string, { fields: Record<string, string[]> }>;
  const staff = resources['employee']?.fields['staff'] ?? [];
  assert.equal(staff.includes('work_email'), false);
  const taskStaff = resources['task']?.fields['staff'] ?? [];
  assert.equal(taskStaff.includes('description'), false);
  assert.ok(existsSync(join(dataDir, 'rules-history', 'v2.json')));

  const call = async (persona: string): Promise<string> => {
    const answer = await fetch(`http://${LOOPBACK_HOST}:${gatewayPort}/v1/tools/find_employee`, {
      method: 'POST',
      headers: { authorization: `Bearer ${seededKey(keys.stdout, persona)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Minh' }),
    });
    assert.equal(answer.status, 200);
    const body = (await answer.json()) as { text: string };
    return body.text;
  };

  const asHoa = await call('hoa');
  assert.match(asHoa, /Vũ Quốc Minh/);
  assert.equal(asHoa.includes('Email công việc: '), false);
  assert.equal(asHoa.includes('@lab.example'), false);
  assert.match(asHoa, /Không hiện theo quyền của bạn: Email công việc, Số điện thoại cá nhân, Địa chỉ nhà\./);

  // The hr role was not touched: the same person still carries the email for hr.
  const asNhung = await call('nhung');
  assert.match(asNhung, /Email công việc: \S+@lab\.example/);

  // The task field removal reaches the next get_task of the same person: no description, title still there.
  const taskAnswer = await fetch(`http://${LOOPBACK_HOST}:${gatewayPort}/v1/tools/get_task`, {
    method: 'POST',
    headers: { authorization: `Bearer ${seededKey(keys.stdout, 'hoa')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ task_id: 'T-12' }),
  });
  assert.equal(taskAnswer.status, 200);
  const taskBody = (await taskAnswer.json()) as { text: string };
  assert.match(taskBody.text, /^Task T-12\./);
  assert.match(taskBody.text, /Tiêu đề: Gọi lại khách hàng X/);
  assert.equal(taskBody.text.includes('Mô tả: '), false);
  assert.equal(taskBody.text.includes('Khách hàng X hỏi về đơn giao trễ'), false);

  // The trace of the call carries the new rule version and the field rule that decided it.
  const trace = spawnSync(
    process.execPath,
    [join(LAB_ROOT, 'gateway', 'dist', 'cli', 'trace-main.js'), '--employee', 'NV-02', '--limit', '1000'],
    { cwd: LAB_ROOT, env, encoding: 'utf8' },
  );
  assert.equal(trace.status, 0, trace.stderr);
  const line = trace.stdout
    .split('\n')
    .find((candidate) => candidate.includes('find_employee') && candidate.includes('employee.fields.staff'));
  assert.ok(line !== undefined, trace.stdout);
  assert.match(line, /\bv2\b/);

  // The reloaded screen shows the new version and the unchecked box.
  const reloaded = await (await fetch(`http://${LOOPBACK_HOST}:${consolePort}/permissions`)).text();
  assert.match(reloaded, /Đang áp <strong>phiên bản 2<\/strong>/);
  const staffEmail = /<input type="checkbox" name="fields\.employee\.staff" value="work_email"( checked)?>/.exec(reloaded);
  assert.ok(staffEmail !== null);
  assert.equal(staffEmail[1], undefined);

  // No raw key or password reached a log or the page.
  const everything = [page, reloaded, ...started.map((service) => service.output())].join('\n');
  assert.equal(everything.includes(serviceKey), false);
  assert.equal(everything.includes(seededKey(keys.stdout, 'hoa')), false);
  assert.equal(readFileSync(join(dataDir, 'rules.json'), 'utf8').includes(serviceKey), false);
});
