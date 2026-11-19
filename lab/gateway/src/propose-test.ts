import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { GATEWAY_DB_FILE } from './database.js';
import { startFixture, type GatewayFixture } from './fixture.js';
import type { Proposal, ProposalExecutor } from './proposals/index.js';

const HOA = 'NV-02';
const NAM = 'NV-05';
const QUANG = 'NV-01';
const MINUTE = 60_000;

/** A clock the tests move by hand, and an executor that only counts what it was given. */
function harness(): { clock: { at: number }; now: () => Date; executed: Proposal[]; executor: ProposalExecutor } {
  const clock = { at: Date.parse('2026-11-17T09:00:00.000Z') };
  const executed: Proposal[] = [];
  return {
    clock,
    now: () => new Date(clock.at),
    executed,
    executor: {
      execute(proposal) {
        executed.push(proposal);
        return Promise.resolve({ state: 'received' });
      },
    },
  };
}

type Harness = ReturnType<typeof harness>;

async function withGateway(run: (f: GatewayFixture, h: Harness) => Promise<void>): Promise<void> {
  const h = harness();
  const f = await startFixture({ now: h.now, executor: h.executor });
  try {
    await run(f, h);
  } finally {
    await f.close();
  }
}

/** The lines of a tool answer that hold the confirmation link, and the proposal code it ends with. */
function linkOf(text: string): { link: string; id: string } {
  const lines = text.split('\n');
  const link = lines.find((line) => /^http:\/\/127\.0\.0\.1:\d+\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a link on a line of its own: ${text}`);
  return { link, id: link.slice(link.lastIndexOf('/') + 1) };
}

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

/** What a person does in the browser: log in, then open the card. */
async function login(f: GatewayFixture, employeeId: string, password: string, next: string): Promise<{ response: Response; cookie: string }> {
  const response = await fetch(`${f.gateway.url}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: employeeId, password, next }).toString(),
  });
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { response, cookie: setCookie.split(';')[0] ?? '' };
}

async function openCard(f: GatewayFixture, proposalId: string, cookie: string): Promise<{ response: Response; html: string }> {
  const response = await fetch(`${f.gateway.url}/xac-nhan/${proposalId}`, { redirect: 'manual', headers: { cookie } });
  return { response, html: await response.text() };
}

async function signIn(f: GatewayFixture, employeeId: string, proposalId: string): Promise<Browser> {
  const { response, cookie } = await login(f, employeeId, f.pagePasswordFor(employeeId), `/xac-nhan/${proposalId}`);
  assert.equal(response.status, 303);
  const { html } = await openCard(f, proposalId, cookie);
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(csrf !== undefined, 'the card carries a CSRF token');
  return { cookie, csrf };
}

function press(
  f: GatewayFixture,
  proposalId: string,
  button: 'gui' | 'huy',
  headers: Record<string, string>,
  form: Record<string, string> | undefined,
): Promise<Response> {
  return fetch(`${f.gateway.url}/xac-nhan/${proposalId}/${button}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(form ?? {}).toString(),
  });
}

async function propose(f: GatewayFixture, employeeId: string, changes: Record<string, string>, task = 'T-12'): Promise<{ id: string; text: string }> {
  const answer = await f.call('propose_task_change', { task_ids: [task], changes }, f.keyFor(employeeId));
  assert.equal(answer.status, 200, answer.body.text);
  return { id: linkOf(answer.body.text).id, text: answer.body.text };
}

function statusOf(f: GatewayFixture, proposalId: string): string | undefined {
  return f.gateway.proposals.get(proposalId)?.status;
}

test('propose: chị Hoa gets a card and a link, and nothing is written', async () => {
  await withGateway(async (f, h) => {
    const before = structuredClone(f.systems.tasks);
    const answer = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'Vũ Quốc Minh' } }, f.keyFor(HOA));
    assert.equal(answer.status, 200);
    assert.equal(answer.body.reason_code, null);
    assert.match(answer.body.text, /Người phụ trách: NV-03 Đỗ Thị Lan -> NV-04 Vũ Quốc Minh/);
    assert.match(answer.body.text, /Chưa có gì được ghi vào task/);
    assert.doesNotMatch(answer.body.text, /^CHƯA THỰC HIỆN/, 'a drafted proposal is not a refusal');
    const { id } = linkOf(answer.body.text);

    const stored = f.gateway.proposals.get(id);
    assert.ok(stored !== undefined);
    assert.equal(stored.requester, HOA);
    assert.equal(stored.caller, 'test');
    assert.equal(stored.items.length, 1);
    const [item] = stored.items;
    assert.equal(item?.recordId, 'T-12');
    assert.deepEqual(item?.changes, { assignee: 'NV-04' });
    assert.deepEqual(item?.previous, { assignee: 'NV-03' });
    assert.equal(item?.baseVersion, 1);
    assert.equal(stored.requiresApproval, false);
    assert.match(stored.fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(stored.status, 'awaiting_confirmation');
    assert.equal(stored.policyVersion, 1);
    assert.equal(Date.parse(stored.expiresAt) - h.clock.at, 30 * MINUTE);

    assert.deepEqual(f.systems.tasks, before, 'the task list is untouched');
    const line = f.gateway.trace.list({ task: 'T-12' })[0];
    assert.equal(line?.tool, 'propose_task_change');
    assert.equal(line?.proposalId, id);
    assert.equal(line?.outcome, 'ok');
  });
});

test('propose: the same words from Nam are refused with the reason and the lead to ask, and no link', async () => {
  await withGateway(async (f) => {
    const answer = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'NV-04' } }, f.keyFor(NAM));
    assert.equal(answer.status, 403);
    assert.equal(answer.body.reason_code, 'NOT_PERMITTED');
    assert.match(answer.body.text, /^CHƯA THỰC HIỆN \[NOT_PERMITTED\] /);
    assert.ok(answer.body.text.includes('Trần Văn Quang'), 'names the lead of the department, read from the directory');
    assert.doesNotMatch(answer.body.text, /xac-nhan|http/);

    const line = f.gateway.trace.list({ employee: NAM })[0];
    assert.equal(line?.outcome, 'refused');
    assert.equal(line?.reasonCode, 'NOT_PERMITTED');
    assert.equal(line?.ruleId, 'task.change_task_assignee_or_due.intern');
    assert.equal(line?.proposalId, null);
  });
});

test('propose: with several fields the strictest answer wins', async () => {
  await withGateway(async (f) => {
    // Nam may change a status but not an assignee; both in one call is refused as a whole.
    const both = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { status: 'done', assignee: 'NV-04' } }, f.keyFor(NAM));
    assert.equal(both.body.reason_code, 'NOT_PERMITTED');

    const statusOnly = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } }, f.keyFor(NAM));
    assert.equal(statusOnly.status, 200);
    assert.match(statusOnly.body.text, /Trạng thái: doing -> done/);
  });
});

test('propose: a read-only key cannot draft, a task of another department is not found, a missing one is the same', async () => {
  await withGateway(async (f) => {
    const readOnly = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } }, f.keyFor(HOA, 'read_only'));
    assert.equal(readOnly.body.reason_code, 'NOT_PERMITTED');
    assert.match(readOnly.body.text, /chỉ để đọc/);

    const other = await f.call('propose_task_change', { task_ids: ['T-70'], changes: { status: 'done' } }, f.keyFor(HOA));
    const missing = await f.call('propose_task_change', { task_ids: ['T-9999'], changes: { status: 'done' } }, f.keyFor(HOA));
    assert.equal(other.body.text, 'Không tìm thấy task T-70.');
    assert.equal(other.body.text.replace('T-70', 'T-9999'), missing.body.text);
    assert.equal(other.body.reason_code, null);
    const line = f.gateway.trace.list({ task: 'T-70' })[0];
    assert.equal(line?.outOfScope, true);
    assert.equal(line?.reasonCode, 'NOT_PERMITTED');
  });
});

test('propose: a change that equals the task makes no proposal, an unclear name is asked back, a wrong date is a bad request', async () => {
  await withGateway(async (f) => {
    const same = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { status: 'doing', assignee: 'NV-03' } }, f.keyFor(HOA));
    assert.equal(same.status, 200);
    assert.match(same.body.text, /không cần soạn đề xuất/);

    const ambiguous = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'Minh' } }, f.keyFor(HOA));
    assert.equal(ambiguous.status, 400);
    assert.ok(ambiguous.body.text.includes('NV-04') && ambiguous.body.text.includes('NV-11'));

    const nobody = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'NV-77' } }, f.keyFor(HOA));
    assert.match(nobody.body.text, /Không tìm thấy nhân viên/);

    const date = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { due: '2026-02-30' } }, f.keyFor(HOA));
    assert.equal(date.status, 400);
    const field = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { title: 'x' } }, f.keyFor(HOA));
    assert.equal(field.status, 400);
    const none = await f.call('propose_task_change', { task_ids: ['T-12'], changes: {} }, f.keyFor(HOA));
    assert.equal(none.status, 400);

    assert.equal(f.gateway.trace.list().filter((line) => line.proposalId !== null).length, 0);
  });
});

test('propose: get_request_status shows the link while waiting, hides another person, and says expired after 30 minutes', async () => {
  await withGateway(async (f, h) => {
    const { id, text } = await propose(f, HOA, { status: 'done' });
    const waiting = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(waiting.body.text, /đang chờ người yêu cầu bấm Gửi/);
    assert.equal(linkOf(waiting.body.text).link, linkOf(text).link);

    const stranger = await f.call('get_request_status', { request_id: id }, f.keyFor(QUANG));
    const unknown = await f.call('get_request_status', { request_id: 'dx-0000000000000000' }, f.keyFor(QUANG));
    assert.equal(stranger.body.text, `Không tìm thấy đề xuất ${id}.`);
    assert.equal(stranger.body.text.replace(id, 'dx-0000000000000000'), unknown.body.text);

    h.clock.at += 31 * MINUTE;
    const late = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(late.body.text, /đã hết hạn/);
    assert.doesNotMatch(late.body.text, /xac-nhan/);
  });
});

test('login: only the right page password of the chosen person opens a session, as an HttpOnly SameSite=Strict cookie for 15 minutes', async () => {
  await withGateway(async (f) => {
    const page = await fetch(`${f.gateway.url}/dang-nhap`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Đăng nhập giả lập/);
    assert.match(html, /không phải đăng nhập thật/i);
    assert.match(html, /Mật khẩu trang/);
    assert.match(html, /placeholder="trang_\.\.\."/);

    const wrongPerson = await login(f, HOA, f.pagePasswordFor(NAM), '');
    assert.equal(wrongPerson.response.status, 401);
    assert.equal(wrongPerson.response.headers.get('set-cookie'), null);
    assert.match(await wrongPerson.response.text(), /<option value="NV-02" selected>/, 'the chosen person stays chosen');

    // The tool key is not a page password, even for the right person.
    const toolKey = await login(f, HOA, f.keyFor(HOA), '');
    assert.equal(toolKey.response.status, 401);
    assert.equal(toolKey.response.headers.get('set-cookie'), null);

    const garbage = await login(f, HOA, 'trang_not-a-password', '');
    assert.equal(garbage.response.status, 401);

    const ok = await login(f, HOA, f.pagePasswordFor(HOA), '');
    assert.equal(ok.response.status, 200);
    const cookie = ok.response.headers.get('set-cookie') ?? '';
    assert.match(cookie, /^lab_session=[A-Za-z0-9_-]{43};/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Max-Age=900/);
    assert.doesNotMatch(cookie, /Secure/, 'the local address is http');

    // `next` that is not one of our own links is dropped, so the login cannot be used to bounce a person elsewhere.
    const bounce = await login(f, HOA, f.pagePasswordFor(HOA), 'https://evil.example/');
    assert.equal(bounce.response.status, 200);
  });
});

test('card: opening it needs a session, shows the values read from the systems, escapes everything, and changes nothing', async () => {
  await withGateway(async (f) => {
    const hostile = '<script>alert(1)</script> & "quote"';
    f.systems.tasks = f.systems.tasks.map((task) => (task.id === 'T-12' ? { ...task, description: '<img src=x onerror=alert(2)>' } : task));
    const { id } = await propose(f, HOA, { description: hostile });

    const anonymous = await fetch(`${f.gateway.url}/xac-nhan/${id}`, { redirect: 'manual' });
    assert.equal(anonymous.status, 303);
    assert.equal(anonymous.headers.get('location'), `/dang-nhap?next=${encodeURIComponent(`/xac-nhan/${id}`)}`);

    const traceBefore = f.gateway.trace.count();
    const { cookie } = await login(f, HOA, f.pagePasswordFor(HOA), `/xac-nhan/${id}`);
    const { response, html } = await openCard(f, id, cookie);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    assert.ok(html.includes('Xác nhận thay đổi task T-12'));
    assert.ok(html.includes('NV-02 Nguyễn Thị Hoa'), 'the requester name comes from the directory');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quote&quot;'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(2)&gt;'), 'the old value read from the system is escaped too');
    assert.ok(!html.includes('<script>alert') && !html.includes('<img src=x'));

    assert.equal(statusOf(f, id), 'awaiting_confirmation', 'GET does not change the state');
    assert.equal(f.gateway.trace.count(), traceBefore, 'and leaves no step in the trace');

    // Not the other person's to look at.
    const lead = await login(f, QUANG, f.pagePasswordFor(QUANG), '');
    const peek = await openCard(f, id, lead.cookie);
    assert.equal(peek.response.status, 403);
    assert.ok(!peek.html.includes('quote') && !peek.html.includes('Nguyễn Thị Hoa'), 'the other person sees none of the card');

    const unknown = await openCard(f, 'dx-0000000000000000', cookie);
    assert.equal(unknown.response.status, 404);
    const malformed = await openCard(f, 'not-an-id', cookie);
    assert.equal(malformed.response.status, 404);
  });
});

test('send: the requester presses Gửi with a session and the CSRF token, once', async () => {
  await withGateway(async (f, h) => {
    const { id } = await propose(f, HOA, { assignee: 'NV-04' });
    const browser = await signIn(f, HOA, id);

    const sent = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(sent.status, 303);
    assert.equal(sent.headers.get('location'), `/xac-nhan/${id}`);
    assert.equal(statusOf(f, id), 'confirmed');
    assert.equal(h.executed.length, 1);
    assert.equal(h.executed[0]?.proposalId, id);
    assert.deepEqual(h.executed[0]?.changes, { assignee: 'NV-04' });

    const { html } = await openCard(f, id, browser.cookie);
    assert.match(html, /Đã xác nhận đề xuất/);
    assert.doesNotMatch(html, /<button/, 'a sent proposal has no buttons left');

    const again = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(again.status, 409);
    assert.match(await again.text(), /\[APPROVAL_USED\]/);
    const cancelLater = await press(f, id, 'huy', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(cancelLater.status, 409);
    assert.equal(h.executed.length, 1, 'the executor is given the proposal once');

    const steps = f.gateway.trace.list().filter((line) => line.proposalId === id).map((line) => `${line.entry}:${line.tool}:${line.outcome}:${line.reasonCode ?? '-'}`);
    assert.deepEqual(steps.reverse(), [
      'http:propose_task_change:ok:-',
      'web:proposal_send:ok:-',
      'web:proposal_send:refused:APPROVAL_USED',
      'web:proposal_cancel:refused:APPROVAL_USED',
    ]);
    const sendLine = f.gateway.trace.list().find((line) => line.tool === 'proposal_send' && line.outcome === 'ok');
    assert.equal(sendLine?.requester, HOA);
    assert.equal(sendLine?.objectId, 'T-12');
    assert.equal(sendLine?.caller, 'test');
  });
});

test('send: without the CSRF token, with a wrong one, with no session or from another site nothing changes', async () => {
  await withGateway(async (f, h) => {
    const { id } = await propose(f, HOA, { status: 'done' });
    const browser = await signIn(f, HOA, id);

    const missing = await press(f, id, 'gui', { cookie: browser.cookie }, undefined);
    assert.equal(missing.status, 403);
    const wrong = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: `${browser.csrf.slice(0, -1)}x` });
    assert.equal(wrong.status, 403);
    const noSession = await press(f, id, 'gui', {}, { csrf: browser.csrf });
    assert.equal(noSession.status, 401);
    const forged = await press(f, id, 'gui', { cookie: browser.cookie, origin: 'https://evil.example' }, { csrf: browser.csrf });
    assert.equal(forged.status, 403);
    const wrongType = await fetch(`${f.gateway.url}/xac-nhan/${id}/gui`, {
      method: 'POST',
      headers: { cookie: browser.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ csrf: browser.csrf }),
    });
    assert.equal(wrongType.status, 403, 'the token must come in a form, not as JSON');
    const viaGet = await fetch(`${f.gateway.url}/xac-nhan/${id}/gui`, { headers: { cookie: browser.cookie } });
    assert.equal(viaGet.status, 405);

    assert.equal(statusOf(f, id), 'awaiting_confirmation');
    assert.equal(h.executed.length, 0);
    const refusals = f.gateway.trace.list().filter((line) => line.tool === 'proposal_send');
    assert.equal(refusals.length, 5, 'each attempt left a line');
    assert.ok(refusals.every((line) => line.outcome === 'refused'));
  });
});

test('send: the session of another person is refused and the proposal stays open for its owner', async () => {
  await withGateway(async (f, h) => {
    const { id } = await propose(f, HOA, { status: 'done' });
    // Quang cannot open the card, so he has no token from it; he uses the one of his own session, the best a forger could do.
    const { cookie } = await login(f, QUANG, f.pagePasswordFor(QUANG), '');
    const csrf = f.gateway.sessions.find(cookie.slice('lab_session='.length))?.csrfToken ?? '';
    assert.notEqual(csrf, '');

    const sent = await press(f, id, 'gui', { cookie }, { csrf });
    assert.equal(sent.status, 403);
    assert.match(await sent.text(), /\[NOT_PERMITTED\]/);
    const cancelled = await press(f, id, 'huy', { cookie }, { csrf });
    assert.equal(cancelled.status, 403);
    assert.equal(statusOf(f, id), 'awaiting_confirmation');
    assert.equal(h.executed.length, 0);

    // The owner can still send it.
    const owner = await signIn(f, HOA, id);
    const ok = await press(f, id, 'gui', { cookie: owner.cookie }, { csrf: owner.csrf });
    assert.equal(ok.status, 303);
  });
});

test('cancel: Sửa cancels the proposal, tells the person to ask the AI again, and sends nothing', async () => {
  await withGateway(async (f, h) => {
    const { id } = await propose(f, HOA, { due: '2026-12-01' });
    const browser = await signIn(f, HOA, id);

    const cancelled = await press(f, id, 'huy', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(cancelled.status, 303);
    assert.equal(statusOf(f, id), 'cancelled');
    assert.equal(h.executed.length, 0);

    const { html } = await openCard(f, id, browser.cookie);
    assert.match(html, /nhờ AI soạn lại/);
    const status = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(status.body.text, /đã bấm Sửa/);

    const line = f.gateway.trace.list().find((entry) => entry.tool === 'proposal_cancel');
    assert.equal(line?.outcome, 'ok');
    assert.equal(line?.proposalId, id);

    // A new draft is a new proposal with a new link.
    const second = await propose(f, HOA, { due: '2026-12-02' });
    assert.notEqual(second.id, id);
  });
});

test('expiry: after 30 minutes the page and both buttons say APPROVAL_EXPIRED and nothing is sent', async () => {
  await withGateway(async (f, h) => {
    const { id } = await propose(f, HOA, { status: 'done' });
    h.clock.at += 20 * MINUTE;
    const browser = await signIn(f, HOA, id);
    h.clock.at += 11 * MINUTE;

    const { html } = await openCard(f, id, browser.cookie);
    assert.match(html, /\[APPROVAL_EXPIRED\]/);
    assert.doesNotMatch(html, /<button/);
    assert.equal(statusOf(f, id), 'awaiting_confirmation', 'looking at it does not change it');

    const sent = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(sent.status, 410);
    assert.match(await sent.text(), /\[APPROVAL_EXPIRED\]/);
    assert.equal(statusOf(f, id), 'expired');
    const cancelled = await press(f, id, 'huy', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(cancelled.status, 410);
    assert.equal(h.executed.length, 0);
    assert.equal(f.gateway.trace.list().find((line) => line.tool === 'proposal_send')?.reasonCode, 'APPROVAL_EXPIRED');
  });
});

test('session: it ends after 15 minutes, and when its page password is revoked', async () => {
  await withGateway(async (f, h) => {
    const { id } = await propose(f, HOA, { status: 'done' });
    const browser = await signIn(f, HOA, id);

    h.clock.at += 16 * MINUTE;
    const late = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(late.status, 401);
    const card = await openCard(f, id, browser.cookie);
    assert.equal(card.response.status, 303, 'an ended session is asked to log in again');

    // Revoking the page password ends a session that is still within its 15 minutes.
    const { id: second } = await propose(f, HOA, { status: 'todo' });
    const again = await signIn(f, HOA, second);
    const passwordId = f.gateway.sessions.find(again.cookie.slice('lab_session='.length))?.passwordId ?? '';
    assert.ok(f.gateway.pagePasswords.revoke(passwordId));
    const revoked = await press(f, second, 'gui', { cookie: again.cookie }, { csrf: again.csrf });
    assert.equal(revoked.status, 401);
    assert.match(await revoked.text(), /\[KEY_REVOKED\]/);
    assert.equal(statusOf(f, second), 'awaiting_confirmation');
    assert.equal(h.executed.length, 0);
  });
});

test('send: a stored proposal whose content no longer matches its print is refused as CONTENT_CHANGED', async () => {
  await withGateway(async (f, h) => {
    const { id } = await propose(f, HOA, { assignee: 'NV-04' });
    const browser = await signIn(f, HOA, id);

    const db = new Database(join(f.dir, GATEWAY_DB_FILE));
    try {
      db.prepare("UPDATE proposal_items SET changes = '{\"assignee\":\"NV-05\"}' WHERE proposal_id = ?").run(id);
    } finally {
      db.close();
    }

    const sent = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(sent.status, 409);
    assert.match(await sent.text(), /\[CONTENT_CHANGED\]/);
    assert.equal(statusOf(f, id), 'awaiting_confirmation');
    assert.equal(h.executed.length, 0);
  });
});

test('send: when the trace line cannot be written the press is rolled back', async () => {
  await withGateway(async (f, h) => {
    const { id } = await propose(f, HOA, { status: 'done' });
    const browser = await signIn(f, HOA, id);

    const db = new Database(join(f.dir, GATEWAY_DB_FILE));
    try {
      db.exec('DROP TRIGGER trace_no_update; DROP TRIGGER trace_no_delete; ALTER TABLE trace RENAME TO trace_hidden;');
    } finally {
      db.close();
    }

    const sent = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(sent.status, 500);
    assert.equal(statusOf(f, id), 'awaiting_confirmation', 'no step happens without its trace line');
    assert.equal(h.executed.length, 0);
  });
});

test('mcp: the same proposal comes through /mcp, and a refusal is an error there', async () => {
  await withGateway(async (f) => {
    async function call(employeeId: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
      const client = new Client({ name: 'propose-test', version: '0.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${f.gateway.url}/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${f.keyFor(employeeId)}` } },
        }),
      );
      try {
        const result = (await client.callTool({ name: 'propose_task_change', arguments: args })) as CallToolResult;
        const first = result.content[0];
        return { text: first?.type === 'text' ? first.text : '', isError: result.isError === true };
      } finally {
        await client.close();
      }
    }

    const ok = await call(HOA, { task_ids: ['T-12'], changes: { assignee: 'NV-04' } });
    assert.equal(ok.isError, false);
    const { id } = linkOf(ok.text);
    assert.equal(f.gateway.proposals.get(id)?.requester, HOA);
    assert.equal(f.gateway.trace.list().find((line) => line.proposalId === id)?.entry, 'mcp');

    const refused = await call(NAM, { task_ids: ['T-12'], changes: { assignee: 'NV-04' } });
    assert.equal(refused.isError, true);
    assert.match(refused.text, /^CHƯA THỰC HIỆN \[NOT_PERMITTED\]/);
  });
});

test('propose: one call with several codes makes one proposal with one item per task, read in one list call', async () => {
  await withGateway(async (f) => {
    const searchesBefore = f.systems.taskSearches.length;
    const answer = await f.call(
      'propose_task_change',
      { task_ids: ['T-14', 'T-12', 'T-13'], changes: { description: 'Mô tả chung cho cả nhóm.' } },
      f.keyFor(HOA),
    );
    assert.equal(answer.status, 200, answer.body.text);
    assert.equal(answer.body.reason_code, null);
    assert.match(answer.body.text, /Đã soạn đề xuất dx-[0-9a-f]{16} cho 3 task/);
    assert.match(answer.body.text, /T-12: Mô tả: /);
    assert.match(answer.body.text, /T-13: Mô tả: /);
    assert.match(answer.body.text, /T-14: Mô tả: /);
    assert.equal(f.systems.taskSearches.length - searchesBefore, 1, 'the draft read every task with one list call');
    assert.equal(f.systems.writeCount('T-12'), 0);

    const { id } = linkOf(answer.body.text);
    const stored = f.gateway.proposals.get(id);
    assert.ok(stored !== undefined);
    assert.equal(stored.recordType, 'task');
    assert.equal(stored.items.length, 3);
    assert.deepEqual(
      stored.items.map((item) => [item.position, item.recordId]),
      [[1, 'T-12'], [2, 'T-13'], [3, 'T-14']],
      'items are numbered in code order, not in the order the agent sent them',
    );
    assert.ok(stored.items.every((item) => item.changes['description'] === 'Mô tả chung cho cả nhóm.'));
    assert.deepEqual(stored.changes, { description: 'Mô tả chung cho cả nhóm.' });
    assert.equal(stored.requiresApproval, false);
    assert.match(stored.fingerprint, /^[0-9a-f]{64}$/);
  });
});

test('propose: the fingerprint covers the sorted item list, so order does not matter and one changed item does', async () => {
  await withGateway(async (f) => {
    const changes = { description: 'Cùng một mô tả.' };
    const first = await f.call('propose_task_change', { task_ids: ['T-12', 'T-13'], changes }, f.keyFor(HOA));
    const second = await f.call('propose_task_change', { task_ids: ['T-13', 'T-12'], changes }, f.keyFor(HOA));
    const other = await f.call('propose_task_change', { task_ids: ['T-12', 'T-14'], changes }, f.keyFor(HOA));

    const printOf = (answer: { body: { text: string } }): string | undefined => {
      const { id } = linkOf(answer.body.text);
      return f.gateway.proposals.get(id)?.fingerprint;
    };
    const firstPrint = printOf(first);
    assert.ok(firstPrint !== undefined);
    assert.equal(printOf(second), firstPrint, 'the same two codes in another order have the same print');
    assert.notEqual(printOf(other), firstPrint, 'swapping one item changes the print');
    assert.equal(f.gateway.proposals.get(linkOf(first.body.text).id)?.items.length, 2);
  });
});

test('propose: one code outside the read scope refuses the whole proposal and names exactly the failing codes', async () => {
  await withGateway(async (f) => {
    const before = f.gateway.proposals.get('dx-0000000000000000');
    assert.equal(before, undefined);

    const mixed = await f.call(
      'propose_task_change',
      { task_ids: ['T-12', 'T-70', 'T-100'], changes: { description: 'Mô tả mới.' } },
      f.keyFor(HOA),
    );
    assert.equal(mixed.status, 200);
    assert.equal(mixed.body.reason_code, null);
    assert.equal(mixed.body.text, 'Không tìm thấy task T-70.');
    assert.ok(!mixed.body.text.includes('/xac-nhan/'), 'a refused proposal has no link');
    assert.equal(f.gateway.trace.list({ task: 'T-70' })[0]?.outOfScope, true);
    assert.equal(f.systems.writeCount('T-70'), 0);

    const missing = await f.call(
      'propose_task_change',
      { task_ids: ['T-12', 'T-9998', 'T-9999'], changes: { description: 'Mô tả mới.' } },
      f.keyFor(HOA),
    );
    assert.equal(missing.body.text, 'Không tìm thấy task T-9998, T-9999.');
    assert.equal(f.gateway.trace.list({ task: 'T-9998' })[0]?.outOfScope, false);
  });
});

test('propose: a task already at the new value is left out of the proposal and named in the answer', async () => {
  await withGateway(async (f) => {
    // T-12 already belongs to chị Lan, T-13 belongs to anh Minh.
    const answer = await f.call(
      'propose_task_change',
      { task_ids: ['T-12', 'T-13'], changes: { assignee: 'NV-03' } },
      f.keyFor(HOA),
    );
    assert.equal(answer.status, 200, answer.body.text);
    assert.match(answer.body.text, /Đã bỏ qua vì đã có đúng giá trị mới: T-12\./);

    const { id } = linkOf(answer.body.text);
    const stored = f.gateway.proposals.get(id);
    assert.equal(stored?.items.length, 1);
    assert.equal(stored?.items[0]?.recordId, 'T-13');
    assert.deepEqual(stored?.items[0]?.changes, { assignee: 'NV-03' });
    assert.deepEqual(stored?.items[0]?.previous, { assignee: 'NV-04' });
  });
});

test('propose: thirty codes at the bulk threshold are drafted with a note that a lead must approve, three are not', async () => {
  await withGateway(async (f) => {
    const thirty = Array.from({ length: 30 }, (_, index) => `T-${100 + index}`);
    const batch = await f.call(
      'propose_task_change',
      { task_ids: thirty, changes: { assignee: 'NV-04' } },
      f.keyFor(HOA),
    );
    assert.equal(batch.status, 200, batch.body.text);
    assert.equal(batch.body.reason_code, 'NEEDS_APPROVAL');
    assert.match(batch.body.text, /30 task/);
    assert.match(batch.body.text, /cần trưởng nhóm Vận hành duyệt/);
    assert.match(batch.body.text, /30 mục/);
    const batchId = linkOf(batch.body.text).id;
    const stored = f.gateway.proposals.get(batchId);
    assert.equal(stored?.items.length, 30);
    assert.equal(stored?.requiresApproval, true);
    assert.equal(f.systems.writeCount('T-100'), 0);

    const three = await f.call(
      'propose_task_change',
      { task_ids: thirty.slice(0, 3), changes: { assignee: 'NV-04' } },
      f.keyFor(HOA),
    );
    assert.equal(three.status, 200, three.body.text);
    assert.equal(three.body.reason_code, null);
    assert.doesNotMatch(three.body.text, /cần trưởng nhóm .* duyệt/);
    assert.equal(f.gateway.proposals.get(linkOf(three.body.text).id)?.requiresApproval, false);
  });
});

test('propose: task_ids is capped at fifty and the old task_id parameter is refused', async () => {
  await withGateway(async (f) => {
    const tooMany = Array.from({ length: 51 }, (_, index) => `T-${100 + index}`);
    const many = await f.call('propose_task_change', { task_ids: tooMany, changes: { status: 'done' } }, f.keyFor(HOA));
    assert.equal(many.status, 400);
    assert.match(many.body.text, /task_ids/);

    const old = await f.call('propose_task_change', { task_id: 'T-12', changes: { status: 'done' } }, f.keyFor(HOA));
    assert.equal(old.status, 400);
    assert.match(old.body.text, /task_id/);

    const empty = await f.call('propose_task_change', { task_ids: [], changes: { status: 'done' } }, f.keyFor(HOA));
    assert.equal(empty.status, 400);
  });
});
