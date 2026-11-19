import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LOOPBACK_HOST, PORT_ENV } from '@lab/shared';
import { CONSOLE_CALLER } from '@lab/gateway';
import { startConsole } from './server.js';
import { csrfFrom, freePort, postForm, startFixture, type Fixture } from './test-support.js';

const CONSOLE_ENTRY = fileURLToPath(new URL('./index.js', import.meta.url));

function press(fixture: Fixture, fields: Readonly<Record<string, string>>, origin?: string): Promise<Response> {
  return postForm(fixture, fields, { path: '/playground', ...(origin === undefined ? {} : { origin }) });
}

async function waitForHealth(child: ReturnType<typeof spawn>, port: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('the console exited before answering /health');
    try {
      const response = await fetch(`http://${LOOPBACK_HOST}:${port}/health`, { signal: AbortSignal.timeout(1_000) });
      await response.text();
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the console did not answer on port ${port}`);
}

async function killChild(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((done) => {
    child.once('exit', () => done());
    child.kill('SIGKILL');
  });
}

const activeConsoleKeys = (fixture: Fixture): number =>
  fixture.keyRows().filter((row) => row.revoked_at === null && row.caller === CONSOLE_CALLER).length;

test('playground: needs the gateway and says so instead of showing an empty form', async (t) => {
  const fixture = await startFixture({ gateway: false });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/playground`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>Sân chơi<\/h1>/);
  assert.match(html, /Cổng không đọc được danh mục tool/);
  assert.equal(html.includes('name="csrf"'), false, 'no form without a catalog');
});

test('playground: startup revokes stale console keys, then issues one per persona and the guest, and keeps them off the page', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const consoleRows = fixture.keyRows().filter((row) => row.caller === CONSOLE_CALLER);
  assert.equal(consoleRows.length, 7);
  assert.equal(consoleRows.filter((row) => row.revoked_at === null).length, 7);
  assert.deepEqual(
    consoleRows.map((row) => row.employee_id).sort(),
    ['NV-01', 'NV-02', 'NV-03', 'NV-04', 'NV-05', 'NV-06', 'NV-99'],
  );
  for (const row of consoleRows) {
    // Only the hash and the six-character prefix reach the disk; no raw key does.
    assert.match(row.key_hash, /^[0-9a-f]{64}$/);
    assert.equal(row.key_prefix.length, 6);
  }

  const response = await fetch(`${fixture.url}/playground`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(/lab_[A-Za-z0-9_-]{10,}/.test(html), false, 'no raw key on the page');
});

test('playground: the form is built from the tool schema and lists the five scenarios', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/playground?persona=NV-02&tool=propose_task_change`);
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<h1>Sân chơi<\/h1>/);
  assert.match(html, /<a class="nav-link" href="\/playground" aria-current="page">Sân chơi<\/a>/);
  assert.match(html, /<form method="post" action="\/playground">/);
  assert.match(html, /name="arg\.task_id" type="text"[^>]* required/);
  assert.match(html, /name="arg\.changes\.assignee"/);
  assert.match(html, /name="arg\.changes\.due" type="date"/);
  assert.match(html, /<textarea id="f-changes-description" name="arg\.changes\.description"/);
  assert.match(html, /<select id="f-changes-status" name="arg\.changes\.status">/);
  assert.match(html, /<option value="todo">todo<\/option>/);
  assert.match(html, /<option value="doing">doing<\/option>/);
  assert.match(html, /<option value="done">done<\/option>/);
  assert.match(html, /name="persona" value="NV-02"/);
  assert.match(html, /name="tool" value="propose_task_change"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, 'the tool description is escaped');
  assert.equal(html.includes('<img src=x'), false);

  for (const title of [
    'A. Chị Hoa chuyển T-12 cho anh Minh, hạn thứ Sáu',
    'B. Nam gõ đúng câu đó',
    'D. Chị Hoa tra email công việc của anh Minh',
    'Câu lệnh cài trong mô tả task T-13',
    'Hỏi một task của phòng khác',
  ]) {
    assert.ok(html.includes(title), `scenario "${title}" has a button`);
  }
  assert.equal((html.match(/name="scenario"/g) ?? []).length, 5);
});

test('playground: a form POST calls the gateway with the chosen persona key and the JSON arguments', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/playground?persona=NV-02&tool=propose_task_change`)).text();
  const response = await press(fixture, {
    csrf: csrfFrom(page),
    persona: 'NV-02',
    tool: 'propose_task_change',
    'arg.task_id': 'T-12',
    'arg.changes.assignee': 'NV-04',
    'arg.changes.due': '2026-11-20',
    'arg.changes.description': '',
    'arg.changes.status': '',
  });
  assert.equal(response.status, 200);
  const html = await response.text();

  const [call] = fixture.toolCalls;
  assert.equal(call?.tool, 'propose_task_change');
  assert.deepEqual(call?.args, { task_id: 'T-12', changes: { assignee: 'NV-04', due: '2026-11-20' } });
  assert.equal(call?.employeeId, 'NV-02');
  assert.equal(call?.caller, CONSOLE_CALLER);

  assert.match(html, /HTTP 200/);
  assert.match(html, /Mã lý do: <strong>-<\/strong>/);
  assert.match(html, /Nguyên văn chữ AI nhận/);
  assert.match(html, /Đã soạn đề xuất dx-0123456789abcdef/);
  assert.match(html, /Mã vết: <code>tr-[0-9a-f]{16}<\/code>/);
  assert.match(html, /<a class="btn" href="http:\/\/127\.0\.0\.1:8790\/xac-nhan\/dx-0123456789abcdef">Mở thẻ xác nhận<\/a>/);
  assert.match(html, /hỏi mật khẩu trang của nhân vật/);
  assert.match(html, /mật khẩu <code>trang_<\/code>/);
  assert.match(html, /<th scope="row">Nơi gọi<\/th><td>lab-console<\/td>/);
  assert.match(html, /<th scope="row">Đề xuất<\/th><td>dx-0123456789abcdef<\/td>/);
  assert.equal(html.includes('href="javascript:'), false, 'only an http link becomes clickable');
});

test('playground: a refusal keeps its HTTP status, reason code and refusal text on the page', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/playground?persona=NV-05&tool=get_task`)).text();
  const response = await press(fixture, {
    csrf: csrfFrom(page),
    persona: 'NV-05',
    tool: 'get_task',
    'arg.task_id': 'T-12',
  });
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<span class="badge bad">HTTP 403<\/span>/);
  assert.match(html, /Mã lý do: <strong>NOT_PERMITTED<\/strong>/);
  assert.match(html, /CHƯA THỰC HIỆN \[NOT_PERMITTED\]/);
  assert.match(html, /Trần Văn Quang, trưởng nhóm Vận hành/);
  assert.equal(fixture.toolCalls[0]?.employeeId, 'NV-05');
});

test('playground: the result shows the exact text and survives a trace line that is missing', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/playground?persona=NV-02&tool=find_employee`)).text();
  const csrf = csrfFrom(page);
  const found = await (
    await press(fixture, { csrf, persona: 'NV-02', tool: 'find_employee', 'arg.name': 'Minh', 'arg.department': '' })
  ).text();
  assert.match(found, /<pre class="verbatim">Tìm thấy 1 nhân viên\.\n&lt;&lt;&lt;DỮ LIỆU/);
  assert.match(found, /Mã: NV-04 \| Tên: Vũ Quốc Minh &lt;b&gt;phá&lt;\/b&gt;/);
  assert.equal(found.includes('<b>phá</b>'), false, 'the answer is escaped, not rendered');
  assert.match(found, /<th scope="row">Người hỏi<\/th><td>NV-02<\/td>/);

  const noLine = await (await press(fixture, { csrf, persona: 'NV-02', tool: 'list_tasks' })).text();
  assert.match(noLine, /Có 0 task khớp\./);
  assert.match(noLine, /Chưa đọc được dòng vết/);
});

test('playground: each scenario button calls its own tool with its own persona', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const csrf = csrfFrom(await (await fetch(`${fixture.url}/playground`)).text());
  const expected = [
    { key: 'a', tool: 'propose_task_change', employee: 'NV-02', args: { task_id: 'T-12', changes: { assignee: 'NV-04', due: '2026-11-20' } } },
    { key: 'b', tool: 'propose_task_change', employee: 'NV-05', args: { task_id: 'T-12', changes: { assignee: 'NV-04', due: '2026-11-20' } } },
    { key: 'd', tool: 'find_employee', employee: 'NV-02', args: { name: 'Minh' } },
    { key: 'embedded', tool: 'get_task', employee: 'NV-02', args: { task_id: 'T-13' } },
    { key: 'outside', tool: 'get_task', employee: 'NV-02', args: { task_id: 'T-61' } },
  ];

  for (const scenario of expected) {
    const before = fixture.toolCalls.length;
    const response = await press(fixture, { csrf, scenario: scenario.key });
    assert.equal(response.status, 200, scenario.key);
    const html = await response.text();
    const call = fixture.toolCalls[before];
    assert.ok(call !== undefined, `${scenario.key} made one call`);
    assert.equal(call.tool, scenario.tool, scenario.key);
    assert.equal(call.employeeId, scenario.employee, scenario.key);
    assert.deepEqual(call.args, scenario.args, scenario.key);
    // The page shows the scenario's own tool form, filled with its arguments.
    assert.ok(html.includes(`<code>${scenario.tool}</code>`), `${scenario.key} shows its tool`);
  }
});

test('playground: a POST without the CSRF token, from another origin or with no origin never reaches the gateway', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const csrf = csrfFrom(await (await fetch(`${fixture.url}/playground`)).text());
  const fields = { persona: 'NV-02', tool: 'find_employee', 'arg.name': 'Minh' };

  assert.equal((await press(fixture, fields)).status, 403, 'no token');
  assert.equal((await press(fixture, { ...fields, csrf: 'not-the-token' })).status, 403, 'wrong token');
  assert.equal((await press(fixture, { ...fields, csrf }, 'http://evil.example')).status, 403, 'foreign origin');
  const noOrigin = await postForm(fixture, { ...fields, csrf }, { path: '/playground', origin: null });
  assert.equal(noOrigin.status, 403, 'no origin');
  assert.equal(fixture.toolCalls.length, 0, 'no refused press reaches the gateway');

  const accepted = await press(fixture, { ...fields, csrf });
  assert.equal(accepted.status, 200);
  assert.equal(fixture.toolCalls.length, 1);
  assert.equal(fixture.toolCalls[0]?.employeeId, 'NV-02');
});

test('playground: the token the data screen hands out also works here, because the console keeps one set', async (t) => {
  const fixture = await startFixture({ testHooks: true });
  t.after(() => fixture.close());

  const csrf = csrfFrom(await (await fetch(`${fixture.url}/data`)).text());
  const response = await press(fixture, { csrf, persona: 'NV-02', tool: 'find_employee', 'arg.name': 'Minh' });
  assert.equal(response.status, 200);
  assert.equal(fixture.toolCalls.length, 1);
});

test('playground: closing the console revokes every key it issued', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  assert.equal(activeConsoleKeys(fixture), 7);
  await fixture.stopConsole();

  const after = fixture.keyRows().filter((row) => row.caller === CONSOLE_CALLER);
  assert.equal(after.length, 7);
  assert.equal(after.filter((row) => row.revoked_at === null).length, 0);
});

test('playground: a console killed sideways leaves keys that the next start revokes', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...fixture.env, [PORT_ENV.console]: String(port) };
  const child = spawn(process.execPath, [CONSOLE_ENTRY], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logged = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    logged += chunk;
  });
  child.stderr?.on('data', (chunk: string) => {
    logged += chunk;
  });
  let restarted: Awaited<ReturnType<typeof startConsole>> | undefined;
  try {
    await waitForHealth(child, port);
    const firstRun = fixture.keyRows().filter((row) => row.revoked_at === null && row.caller === CONSOLE_CALLER);
    assert.equal(firstRun.length, 7, 'the second console revoked the first console keys and issued its own');

    // A sideways kill runs no signal handler, so the keys stay active.
    await killChild(child);
    assert.equal(activeConsoleKeys(fixture), 7);

    restarted = await startConsole({ port: 0, env });
    const active = fixture.keyRows().filter((row) => row.revoked_at === null && row.caller === CONSOLE_CALLER);
    assert.equal(active.length, 7);
    assert.deepEqual(
      active.map((row) => row.key_id).filter((keyId) => firstRun.some((row) => row.key_id === keyId)),
      [],
      'the new run issued new keys, not the old ones',
    );
    for (const row of firstRun) {
      assert.notEqual(
        fixture.keyRows().find((candidate) => candidate.key_id === row.key_id)?.revoked_at,
        null,
        row.key_id,
      );
    }
    assert.equal(/lab_[A-Za-z0-9_-]{10,}/.test(logged), false, 'no raw key in the console log');
  } finally {
    await restarted?.close();
    await killChild(child);
  }
});
