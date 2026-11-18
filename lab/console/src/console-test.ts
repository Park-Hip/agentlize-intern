import assert from 'node:assert/strict';
import test from 'node:test';
import { LOOPBACK_HOST } from '@lab/shared';
import {
  SERVICE_KEY,
  csrfFrom,
  line,
  rawGet,
  rawPost,
  startFixture,
} from './test-support.js';

test('console: overview shows the three services, the applied rule version and the seven identities', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  assert.equal(fixture.url, `http://${LOOPBACK_HOST}:${fixture.port}`);
  const response = await fetch(`${fixture.url}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('referrer-policy'), 'same-origin');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

  const html = await response.text();
  assert.match(html, /<h1>Tổng quan<\/h1>/);
  assert.match(html, /Phiên bản 7/);
  assert.equal(html.match(/Đang chạy/g)?.length, 3);
  assert.match(html, /Nhân viên 02/);
  assert.match(html, /Nhân viên 01/);
  assert.match(html, /NV-99/);
  assert.match(html, /Khách/);
  assert.match(html, /Không có trong danh bạ/);
  // Only the six characters and the guest, never the rest of the directory.
  assert.equal(html.includes('Nhân viên 07'), false);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes(SERVICE_KEY), false);
});

test('console: tool screen shows descriptions, parameters and the read or propose label', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/tools`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /find_employee/);
  assert.match(html, /propose_task_change/);
  assert.match(html, /Chỉ đọc/);
  assert.match(html, /Soạn đề xuất/);
  assert.match(html, /changes\.assignee/);
  assert.match(html, /data-label="Bắt buộc">Có/);
  assert.match(html, /data-label="Bắt buộc">Không/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes(SERVICE_KEY), false);
});

test('console: only 127.0.0.1 and localhost for the bound port pass the Host check', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const loopback = await rawGet(fixture.port, '/', `127.0.0.1:${fixture.port}`);
  assert.equal(loopback.status, 200);
  const localhost = await rawGet(fixture.port, '/tools', `localhost:${fixture.port}`);
  assert.equal(localhost.status, 200);

  const foreignName = await rawGet(fixture.port, '/', `evil.example:${fixture.port}`);
  assert.equal(foreignName.status, 403);
  assert.equal(foreignName.body.includes('Tổng quan'), false);
  const foreignPort = await rawGet(fixture.port, '/', '127.0.0.1:1');
  assert.equal(foreignPort.status, 403);
  const noPort = await rawGet(fixture.port, '/', '127.0.0.1');
  assert.equal(noPort.status, 403);
});

test('console: overview still opens when the directory is off and says so', async (t) => {
  const fixture = await startFixture({ directory: false });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Không đọc được danh bạ/);
  assert.match(html, /Danh bạ giả/);
  assert.match(html, /Chưa đọc được/);
  assert.match(html, /NV-01/);
  // The gateway and the task list are still reported as running.
  assert.equal(html.match(/Đang chạy/g)?.length, 2);
  assert.equal(html.match(/Không chạy/g)?.length, 1);
});

test('console: tool screen still opens when the gateway is off and says so', async (t) => {
  const fixture = await startFixture({ gateway: false });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/tools`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Cổng không chạy/);
  assert.match(html, /chưa đọc được danh mục tool/);
  assert.match(html, /<h1>Tool<\/h1>/);
});

test('console: overview still opens when the task list is off and says so', async (t) => {
  const fixture = await startFixture({ tasks: false });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Task giả/);
  assert.match(html, /Không chạy/);
  assert.match(html, /Nhân viên 02/);
  assert.equal(html.match(/Đang chạy/g)?.length, 2);
  assert.equal(html.match(/Không chạy/g)?.length, 1);
});

test('console: a broken rule file is reported without hiding the rest of the page', async (t) => {
  const fixture = await startFixture({ rulesText: '{' });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /File luật không đọc được/);
  assert.match(html, /POLICY_UNAVAILABLE/);
  assert.match(html, /Nhân viên 02/);
});

test('console: source data shows both systems raw, states the operator view and pages 100 tasks', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/data`);
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<h1>Dữ liệu gốc<\/h1>/);
  assert.match(html, /Góc nhìn người vận hành, AI không thấy thế này\./);
  assert.match(html, /<code>work_email<\/code>/);
  assert.match(html, /<code>personal_phone<\/code>/);
  assert.match(html, /nv02@lab\.example/);
  assert.match(html, /0900 555 02/);
  assert.match(html, /Đỗ &lt;script&gt;alert\(1\)&lt;\/script&gt; Lan/);
  assert.equal(html.includes('<script>alert'), false);

  // Tasks: the first page holds T-1 to T-20, and the pager says there are five.
  assert.match(html, /<code>T-1<\/code>/);
  assert.match(html, /<code>T-20<\/code>/);
  assert.equal(html.includes('T-21'), false);
  assert.match(html, /Trang 1\/5, 100 task\./);
  assert.match(html, /href="\/data\?page=2"/);

  // No control changes a record: the department filter is the only form.
  assert.equal(html.match(/<form/g)?.length, 1);
  assert.equal(html.includes('method="post"'), false);
  assert.equal(html.includes('PATCH'), false);
  assert.equal(html.includes(SERVICE_KEY), false);

  const second = await fetch(`${fixture.url}/data?page=2`);
  assert.equal(second.status, 200);
  const secondHtml = await second.text();
  assert.match(secondHtml, /<code>T-21<\/code>/);
  assert.match(secondHtml, /<code>T-40<\/code>/);
  assert.equal(secondHtml.includes('T-41'), false);

  // A page past the end lands on the last page instead of an empty table.
  const last = await fetch(`${fixture.url}/data?page=99`);
  const lastHtml = await last.text();
  assert.match(lastHtml, /Trang 5\/5, 100 task\./);
  assert.match(lastHtml, /<code>T-100<\/code>/);
});

test('console: the department filter narrows both tables and an unknown department is ignored', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/data?department=${encodeURIComponent('Kinh doanh')}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<code>NV-11<\/code>/);
  assert.equal(html.includes('NV-01'), false);
  assert.match(html, /Trang 1\/2, 40 task\./);
  assert.match(html, /<code>T-61<\/code>/);
  // The page link keeps the department.
  assert.match(html, /href="\/data\?department=Kinh\+doanh&amp;page=2"/);

  const unknown = await fetch(`${fixture.url}/data?department=${encodeURIComponent('Kế toán')}`);
  const unknownHtml = await unknown.text();
  assert.match(unknownHtml, /bỏ qua bộ lọc phòng/);
  assert.match(unknownHtml, /<code>NV-01<\/code>/);
  assert.match(unknownHtml, /Trang 1\/5, 100 task\./);
});

test('console: source data still opens when a system is off and says which table is empty', async (t) => {
  const directoryOff = await startFixture({ directory: false });
  t.after(() => directoryOff.close());
  const withoutDirectory = await (await fetch(`${directoryOff.url}/data`)).text();
  assert.match(withoutDirectory, /Không đọc được danh bạ/);
  assert.match(withoutDirectory, /Chưa đọc được danh bạ nên bảng nhân viên để trống\./);
  assert.match(withoutDirectory, /<code>T-1<\/code>/);

  const tasksOff = await startFixture({ tasks: false });
  t.after(() => tasksOff.close());
  const withoutTasks = await (await fetch(`${tasksOff.url}/data`)).text();
  assert.match(withoutTasks, /Không đọc được danh sách task/);
  assert.match(withoutTasks, /Chưa đọc được danh sách task nên bảng task để trống\./);
  assert.match(withoutTasks, /<code>NV-01<\/code>/);
});

test('console: the test buttons appear only with LAB_TEST_HOOKS, and a press needs Origin and the token', async (t) => {
  const off = await startFixture();
  t.after(() => off.close());
  const withoutHooks = await (await fetch(`${off.url}/data`)).text();
  assert.equal(withoutHooks.includes('Đặt lại danh bạ'), false);
  assert.equal(withoutHooks.includes('mất phản hồi'), false);
  const refused = await rawPost(off.port, '/data/tasks/reset', 'csrf=anything', {
    host: `127.0.0.1:${off.port}`,
    origin: `http://127.0.0.1:${off.port}`,
  });
  assert.equal(refused.status, 404);
  assert.equal(off.adminCalls.length, 0);

  const on = await startFixture({ testHooks: true });
  t.after(() => on.close());
  const page = await fetch(`${on.url}/data`);
  const html = await page.text();
  assert.match(html, /Nút dùng cho phép thử/);
  assert.match(html, /Đặt lại danh bạ về dữ liệu gốc/);
  assert.match(html, /Đặt lại task về dữ liệu gốc/);
  assert.match(html, /Gây lỗi mất phản hồi sau khi ghi/);
  assert.equal(html.match(/method="post"/g)?.length, 3);
  const token = csrfFrom(html);
  assert.equal(html.includes(SERVICE_KEY), false);

  const origin = `http://127.0.0.1:${on.port}`;
  const noOrigin = await rawPost(on.port, '/data/tasks/reset', `csrf=${token}`, { host: `127.0.0.1:${on.port}` });
  assert.equal(noOrigin.status, 403);
  const foreignOrigin = await rawPost(on.port, '/data/tasks/reset', `csrf=${token}`, {
    host: `127.0.0.1:${on.port}`,
    origin: 'http://evil.example',
  });
  assert.equal(foreignOrigin.status, 403);
  const wrongToken = await rawPost(on.port, '/data/tasks/reset', 'csrf=nope', { host: `127.0.0.1:${on.port}`, origin });
  assert.equal(wrongToken.status, 403);
  assert.equal(on.adminCalls.length, 0);

  const reset = await rawPost(on.port, '/data/tasks/reset', `csrf=${encodeURIComponent(token)}`, {
    host: `127.0.0.1:${on.port}`,
    origin,
  });
  assert.equal(reset.status, 303);
  assert.equal(reset.headers.location, '/data?done=tasks-reset&ok=1');
  assert.deepEqual(on.adminCalls.map((call) => `${call.system}${call.path}`), ['tasks/admin/reset']);

  const news = await fetch(`${on.url}/data?done=tasks-reset&ok=1`);
  const newsHtml = await news.text();
  assert.match(newsHtml, /Đã gửi lệnh đặt lại danh sách task\./);

  const faultToken = csrfFrom(newsHtml);
  const fault = await rawPost(on.port, '/data/tasks/faults', `csrf=${encodeURIComponent(faultToken)}`, {
    host: `127.0.0.1:${on.port}`,
    origin,
  });
  assert.equal(fault.status, 303);
  assert.equal(fault.headers.location, '/data?done=tasks-faults&ok=1');
  assert.deepEqual(on.adminCalls.at(-1), {
    system: 'tasks',
    path: '/admin/faults',
    body: '{"mode":"drop_response_after_commit","count":1}',
  });

  const directoryToken = csrfFrom(await (await fetch(`${on.url}/data`)).text());
  const directoryReset = await rawPost(on.port, '/data/directory/reset', `csrf=${encodeURIComponent(directoryToken)}`, {
    host: `127.0.0.1:${on.port}`,
    origin,
  });
  assert.equal(directoryReset.status, 303);
  assert.equal(on.adminCalls.at(-1)?.system, 'directory');
  assert.equal(on.adminCalls.at(-1)?.path, '/admin/reset');
});

test('console: trace groups one task chain by proposal, with every column, and never shows personal data', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const proposal = 'dx-0123456789abcdef';
  fixture.appendTrace([
    line('tr-0000000000000001', {
      tool: 'propose_task_change',
      entry: 'http',
      objectId: 'T-12',
      proposalId: proposal,
      ruleId: 'PENDING',
    }),
    line('tr-0000000000000002', {
      tool: 'proposal_send',
      entry: 'web',
      objectId: 'T-12',
      proposalId: proposal,
      ruleId: 'WEB.CONFIRM',
    }),
    line('tr-0000000000000003', {
      tool: 'write_command',
      entry: 'web',
      objectId: 'T-12',
      proposalId: proposal,
      idempotencyKey: `${proposal}:1`,
      attempts: 1,
      ruleId: 'WRITE.SEND',
    }),
    line('tr-0000000000000004', {
      requester: 'NV-05',
      tool: 'get_task',
      entry: 'mcp',
      objectId: 'T-70',
      ruleId: 'READ_SCOPE.own_department',
    }),
    line('tr-0000000000000005', {
      requester: 'NV-99',
      tool: 'find_employee',
      outcome: 'refused',
      reasonCode: 'KEY_INVALID',
      ruleId: 'IDENTITY.KEY_INVALID',
      objectId: null,
      policyVersion: null,
    }),
  ]);

  const response = await fetch(`${fixture.url}/trace?task=T-12`);
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<h1>Vết<\/h1>/);
  assert.match(html, new RegExp(`Đề xuất <code>${proposal}</code>`));
  assert.match(html, /3 dòng/);
  assert.match(html, /NV-02, task T-12/);
  // The chain reads oldest first inside its proposal.
  const draft = html.indexOf('propose_task_change');
  const confirm = html.indexOf('proposal_send');
  const write = html.indexOf('write_command');
  assert.ok(draft !== -1 && confirm !== -1 && write !== -1);
  assert.ok(draft < confirm && confirm < write, 'the chain reads soạn, xác nhận, ghi');

  // Every column the issue names is on the page.
  assert.match(html, /2026-11-18 10:00:00Z/);
  assert.match(html, /Gọi HTTP <code>http<\/code>/);
  assert.match(html, /Trang cổng <code>web<\/code>/);
  assert.match(html, /<code>PENDING<\/code>/);
  assert.match(html, /v7/);
  assert.match(html, /khoá ghi <code>dx-0123456789abcdef:1<\/code>, lần gửi 1/);
  assert.match(html, /<code>NV-02<\/code>/);
  assert.match(html, /<code>tr-0000000000000001<\/code>/);

  // T-70 is another task, so the filter leaves it out.
  assert.equal(html.includes('T-70'), false);
  assert.equal(html.includes('tr-0000000000000004'), false);

  // The trace holds no personal field and no key, and this page reads none of them.
  for (const forbidden of ['nv02@lab.example', '0900 555 02', 'Đường Giả Định', SERVICE_KEY]) {
    assert.equal(html.includes(forbidden), false, `the trace page must not show "${forbidden}"`);
  }

  // The page ships its own refresh loop, allowed by a per-response nonce, and still reads without it.
  assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'nonce-[^']+'/);
  assert.match(html, /<script nonce="[^"]+">/);
  assert.ok(html.includes("fetch(location.pathname.replace(/\\/$/, '') + '/rows' + location.search)"));
  assert.match(html, /<noscript>/);
  assert.match(html, /Trang vẫn lọc và xem đầy đủ khi JavaScript tắt/);
});

test('console: the trace filters by person, proposal and door, and an invalid value is explained', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const proposal = 'dx-0123456789abcdef';
  fixture.appendTrace([
    line('tr-0000000000000001', { objectId: 'T-12', proposalId: proposal }),
    line('tr-0000000000000002', { requester: 'NV-05', entry: 'mcp', objectId: 'T-70' }),
    line('tr-0000000000000003', { requester: 'NV-05', entry: 'web', objectId: 'T-12', tool: 'proposal_send', proposalId: proposal }),
  ]);

  const byPerson = await (await fetch(`${fixture.url}/trace?employee=NV-05`)).text();
  assert.match(byPerson, /tr-0000000000000003/);
  assert.equal(byPerson.includes('tr-0000000000000001'), false);
  assert.match(byPerson, /2 dòng khớp bộ lọc\./);

  const byProposal = await (await fetch(`${fixture.url}/trace?proposal=${proposal}`)).text();
  assert.match(byProposal, /tr-0000000000000001/);
  assert.match(byProposal, /tr-0000000000000003/);
  assert.equal(byProposal.includes('tr-0000000000000002'), false);

  const byEntry = await (await fetch(`${fixture.url}/trace?entry=mcp`)).text();
  assert.match(byEntry, /tr-0000000000000002/);
  assert.equal(byEntry.includes('tr-0000000000000001'), false);

  const invalid = await (await fetch(`${fixture.url}/trace?task=twelve&entry=ftp`)).text();
  assert.match(invalid, /Mã task phải có dạng T-12/);
  assert.match(invalid, /Nơi gọi phải là http, mcp hoặc web/);
  assert.match(invalid, /3 dòng khớp bộ lọc\./);
  // The invalid text stays visible in the form, escaped.
  assert.match(invalid, /value="twelve"/);
});

test('console: the trace screen says the trace table is not there yet instead of failing', async (t) => {
  // The console opens gateway.sqlite at startup to issue the playground keys, so the file
  // exists; the trace table appears only once the gateway writes its first line.
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/trace`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /gateway\.sqlite chưa có bảng trace/);
  assert.match(html, /<h1>Vết<\/h1>/);
  assert.equal(html.includes(SERVICE_KEY), false);
});

test('console: the refresh route returns the table alone and refuses a POST', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());
  fixture.appendTrace([line('tr-0000000000000001', { objectId: 'T-12' })]);

  const fragment = await fetch(`${fixture.url}/trace/rows?task=T-12`);
  assert.equal(fragment.status, 200);
  const html = await fragment.text();
  assert.match(html, /tr-0000000000000001/);
  assert.equal(html.includes('<!doctype'), false);
  assert.equal(html.includes('<h1>'), false);

  const refused = await rawPost(fixture.port, '/trace/rows', '', { host: `127.0.0.1:${fixture.port}` });
  assert.equal(refused.status, 405);
  assert.equal(refused.headers.allow, 'GET');
});

test('console: an unknown screen and a wrong method still answer with a page', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const missing = await fetch(`${fixture.url}/khong-co`);
  assert.equal(missing.status, 404);
  const missingHtml = await missing.text();
  assert.match(missingHtml, /Không có màn hình \/khong-co/);

  const wrongMethod = await rawPost(fixture.port, '/data', '', { host: `127.0.0.1:${fixture.port}` });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.allow, 'GET');
});
