import assert from 'node:assert/strict';
import test from 'node:test';
import { startFixture, type GatewayFixture } from './fixture.js';
import type { Proposal } from './proposals/index.js';

const MINH = 'NV-04';
const QUANG = 'NV-01';

interface Harness {
  readonly clock: { at: number };
  readonly now: () => Date;
}

function harness(): Harness {
  const clock = { at: Date.parse('2026-11-17T09:00:00.000Z') };
  return { clock, now: () => new Date(clock.at) };
}

async function withGateway(run: (f: GatewayFixture, h: Harness) => Promise<void>): Promise<void> {
  const h = harness();
  const f = await startFixture({ now: h.now });
  try {
    await run(f, h);
  } finally {
    await f.close();
  }
}

function linkOf(text: string): { link: string; id: string } {
  const line = text.split('\n').find((candidate) => /^http:\/\/127\.0\.0\.1:\d+\/xac-nhan\/dx-[0-9a-f]{16}$/.test(candidate));
  assert.ok(line !== undefined, `the answer has a confirmation link on its own line: ${text}`);
  return { link: line, id: line.slice(line.lastIndexOf('/') + 1) };
}

async function login(
  f: GatewayFixture,
  employeeId: string,
  next: string,
): Promise<{ cookie: string; csrf: string }> {
  const response = await fetch(`${f.gateway.url}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: employeeId, password: f.pagePasswordFor(employeeId), next }).toString(),
  });
  assert.equal(response.status, 303);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const page = await fetch(`${f.gateway.url}${next}`, { headers: { cookie } });
  assert.equal(page.status, 200);
  const token = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
  assert.ok(token !== undefined, 'the page carries a CSRF token');
  return { cookie, csrf: token };
}

async function press(f: GatewayFixture, path: string, browser: { cookie: string; csrf: string }): Promise<Response> {
  return fetch(`${f.gateway.url}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 4_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

test('leave: the requester drafts, the lead approves, the gateway creates the request, and the answer waits for the manager', async () => {
  await withGateway(async (f) => {
    const key = f.keyFor(MINH);
    const drafted = await f.call(
      'propose_leave_request',
      {
        leave_type: 'annual',
        from_date: '2026-11-26',
        to_date: '2026-11-27',
        reason: 'Việc gia đình',
        note: 'Về quê',
      },
      key,
    );
    assert.equal(drafted.status, 200, drafted.body.text);
    assert.equal(drafted.body.reason_code, 'NEEDS_APPROVAL');
    assert.match(drafted.body.text, /Chưa có gì được ghi vào hệ thống đơn nghỉ phép/);
    const { id } = linkOf(drafted.body.text);

    const requester = await login(f, MINH, `/xac-nhan/${id}`);
    const sent = await press(f, `/xac-nhan/${id}/gui`, requester);
    assert.equal(sent.status, 303, await sent.text());
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_approval');
    assert.equal(f.systems.leaves.length, 0, 'pressing Gửi waits for the lead, it does not create yet');

    const lead = await login(f, QUANG, `/duyet/${id}`);
    const approvalPage = await fetch(`${f.gateway.url}/duyet/${id}`, { headers: { cookie: lead.cookie } });
    assert.equal(approvalPage.status, 200);
    const html = await approvalPage.text();
    assert.match(html, /Tạo đơn nghỉ phép mới/);
    assert.match(html, /NV-04 Vũ Quốc Minh/);

    const approved = await press(f, `/duyet/${id}/duyet`, lead);
    assert.equal(approved.status, 303, await approved.text());

    await waitFor(() => f.systems.leaves.length === 1, 'the create to reach the leave system');
    const request = f.systems.leaves[0];
    assert.ok(request !== undefined);
    assert.equal(request.code, 'NP-1');
    assert.equal(request.employee, MINH);
    assert.equal(request.leave_type, 'annual');
    assert.equal(request.from_date, '2026-11-26');
    assert.equal(request.to_date, '2026-11-27');
    assert.equal(request.reason, 'Việc gia đình');
    assert.equal(request.note, 'Về quê');
    assert.equal(request.status, 'pending');
    assert.equal(request.request_key, `${id}:1`);

    const createCall = f.systems.createCalls[0];
    assert.equal(createCall?.idempotencyKey, `${id}:1`);
    assert.equal(createCall?.changes['employee'], MINH);

    const created = await f.call('get_request_status', { request_id: id }, key);
    assert.equal(created.status, 200, created.body.text);
    assert.match(created.body.text, /đã tạo đơn nghỉ phép NP-1/);
    assert.match(created.body.text, /Trạng thái hiện tại: đang chờ quản lý duyệt\./);
    assert.doesNotMatch(created.body.text, /Trạng thái hiện tại: đã được duyệt/);

    // The source system's manager decides after its own delay; the answer now says so, and only now.
    f.systems.leaves = f.systems.leaves.map((leave) => ({
      ...leave,
      status: 'approved',
      decided_at: '2026-11-17T09:05:00.000Z',
    }));
    const decided = await f.call('get_request_status', { request_id: id }, key);
    assert.equal(decided.status, 200, decided.body.text);
    assert.match(decided.body.text, /Trạng thái hiện tại: đã được duyệt\./);

    const lines = f.gateway.trace.list().filter((line) => line.proposalId === id);
    const approveLine = lines.find((line) => line.tool === 'proposal_approve' && line.outcome === 'ok');
    assert.equal(approveLine?.requester, QUANG);
    const writeLine = lines.find((line) => line.tool === 'write_command' && line.outcome === 'ok');
    assert.equal(writeLine?.requester, MINH);
    assert.equal(writeLine?.objectId, 'NP-1');
  });
});

test('leave: the tool refuses a range that ends before it starts, and creates nothing', async () => {
  await withGateway(async (f) => {
    const answer = await f.call(
      'propose_leave_request',
      {
        leave_type: 'sick',
        from_date: '2026-11-27',
        to_date: '2026-11-26',
        reason: 'Khám bệnh',
      },
      f.keyFor(MINH),
    );
    assert.equal(answer.status, 400);
    assert.match(answer.body.text, /Ngày kết thúc không được trước ngày bắt đầu/);
    assert.equal(f.gateway.proposals.countPending(MINH), 0);
    assert.equal(f.systems.leaves.length, 0);
  });
});

test('leave: a lead can draft and send without waiting, and the trace still names the request code', async () => {
  await withGateway(async (f) => {
    const drafted = await f.call(
      'propose_leave_request',
      {
        leave_type: 'personal',
        from_date: '2026-12-01',
        to_date: '2026-12-01',
        reason: 'Việc riêng',
      },
      f.keyFor(QUANG),
    );
    assert.equal(drafted.status, 200, drafted.body.text);
    assert.equal(drafted.body.reason_code, null);
    const { id } = linkOf(drafted.body.text);

    const browser = await login(f, QUANG, `/xac-nhan/${id}`);
    const sent = await press(f, `/xac-nhan/${id}/gui`, browser);
    assert.equal(sent.status, 303, await sent.text());
    await waitFor(() => f.systems.leaves.length === 1, 'the lead create to reach the leave system');
    assert.equal(f.systems.leaves[0]?.code, 'NP-1');

    const line = f.gateway.trace.list().find((entry) => entry.proposalId === id && entry.tool === 'write_command');
    assert.equal(line?.outcome, 'ok');
    assert.equal(line?.objectId, 'NP-1');
  });
});

/** The create item keeps the group changes in the proposal, so the approval page can name it. */
function proposalOf(f: GatewayFixture, id: string): Proposal | undefined {
  return f.gateway.proposals.get(id);
}

test('leave: the stored proposal has one create item and no fake record code in the group', async () => {
  await withGateway(async (f) => {
    const drafted = await f.call(
      'propose_leave_request',
      {
        leave_type: 'unpaid',
        from_date: '2026-12-02',
        to_date: '2026-12-03',
        reason: 'Việc cá nhân',
      },
      f.keyFor(MINH),
    );
    assert.equal(drafted.status, 200, drafted.body.text);
    const { id } = linkOf(drafted.body.text);
    const proposal = proposalOf(f, id);
    assert.ok(proposal !== undefined);
    assert.equal(proposal.recordType, 'leave');
    assert.equal(proposal.items[0]?.kind, 'create');
    assert.equal(proposal.items[0]?.recordId, 'new:1');
    assert.equal(proposal.items[0]?.baseVersion, 0);
    assert.deepEqual(proposal.items[0]?.previous, {});
    assert.equal(proposal.requiresApproval, true);
  });
});
