import assert from 'node:assert/strict';
import test from 'node:test';
import { SERVICE_KEY, rawGet, startFixture } from './test-support.js';

test('console: overview shows the three services, the applied rule version and the seven identities', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  assert.equal(fixture.url, `http://127.0.0.1:${fixture.port}`);
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
  assert.match(html, /Trần Văn Quang/);
  assert.match(html, /Nguyễn Thị Hoa/);
  assert.match(html, /Đỗ &lt;script&gt;alert\(1\)&lt;\/script&gt; Lan/);
  assert.match(html, /NV-99/);
  assert.match(html, /Khách/);
  assert.match(html, /Không có trong danh bạ/);
  // Only the six characters and the guest, never the rest of the directory.
  assert.equal(html.includes('Bùi Thanh Tâm'), false);
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

  const foreignSave = await rawGet(fixture.port, '/permissions', `evil.example:${fixture.port}`);
  assert.equal(foreignSave.status, 403);
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
  assert.match(html, /Trần Văn Quang/);
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
  assert.match(html, /Trần Văn Quang/);
});
