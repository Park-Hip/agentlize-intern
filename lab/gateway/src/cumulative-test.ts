import assert from 'node:assert/strict';
import test from 'node:test';
import { startFixture, type GatewayFixture } from './fixture.js';

const HOA = 'NV-02';
const LAN = 'NV-03';
const QUANG = 'NV-01';
const MINUTE = 60_000;

interface Clock {
  at: number;
}

/** A clock the tests move by hand, so the 60-minute window costs no real time. */
function harness(): { clock: Clock; now: () => Date } {
  const clock = { at: Date.parse('2026-11-18T09:00:00.000Z') };
  return { clock, now: () => new Date(clock.at) };
}

async function withGateway(run: (f: GatewayFixture, h: { clock: Clock; now: () => Date }) => Promise<void>): Promise<void> {
  const h = harness();
  const f = await startFixture({ now: h.now });
  try {
    await run(f, h);
  } finally {
    await f.close();
  }
}

/** The line of a tool answer that holds the confirmation link, and the proposal code it ends with. */
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

async function signIn(f: GatewayFixture, employeeId: string, proposalId: string): Promise<Browser> {
  const login = await fetch(`${f.gateway.url}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      employee: employeeId,
      password: f.pagePasswordFor(employeeId),
      next: `/xac-nhan/${proposalId}`,
    }).toString(),
  });
  assert.equal(login.status, 303);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const card = await fetch(`${f.gateway.url}/xac-nhan/${proposalId}`, { headers: { cookie } });
  assert.equal(card.status, 200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await card.text())?.[1];
  assert.ok(csrf !== undefined, 'the card carries a CSRF token');
  return { cookie, csrf };
}

async function signInForApproval(f: GatewayFixture, employeeId: string, proposalId: string): Promise<Browser> {
  const login = await fetch(`${f.gateway.url}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      employee: employeeId,
      password: f.pagePasswordFor(employeeId),
      next: `/duyet/${proposalId}`,
    }).toString(),
  });
  assert.equal(login.status, 303);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const page = await fetch(`${f.gateway.url}/duyet/${proposalId}`, { headers: { cookie } });
  assert.equal(page.status, 200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
  assert.ok(csrf !== undefined, 'the approval page carries a CSRF token');
  return { cookie, csrf };
}

function press(f: GatewayFixture, proposalId: string, browser: Browser): Promise<Response> {
  return fetch(`${f.gateway.url}/xac-nhan/${proposalId}/gui`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

function pressApproval(f: GatewayFixture, proposalId: string, browser: Browser): Promise<Response> {
  return fetch(`${f.gateway.url}/duyet/${proposalId}/duyet`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

interface Draft {
  readonly id: string;
  readonly text: string;
  readonly reasonCode: string | null;
}

async function draft(
  f: GatewayFixture,
  taskId: string,
  changes: Record<string, string> = { assignee: 'NV-04' },
  employeeId = HOA,
): Promise<Draft> {
  const answer = await f.call('propose_task_change', { task_ids: [taskId], changes }, f.keyFor(employeeId));
  assert.equal(answer.status, 200, answer.body.text);
  return { id: linkOf(answer.body.text).id, text: answer.body.text, reasonCode: answer.body.reason_code };
}

/** Draft and press one proposal, as the person would in the browser. */
async function draftAndSend(f: GatewayFixture, taskId: string, changes?: Record<string, string>): Promise<Draft> {
  const sent = await draft(f, taskId, changes);
  const response = await press(f, sent.id, await signIn(f, HOA, sent.id));
  assert.equal(response.status, 303, await response.text());
  return sent;
}

test('cumulative: five one-task proposals in the window put the fifth at the lead and write nothing for it', async () => {
  await withGateway(async (f, h) => {
    const tasks = ['T-100', 'T-101', 'T-102', 'T-103', 'T-104'];
    for (const [index, task] of tasks.entries()) {
      const sent = await draft(f, task);
      if (index < 4) {
        assert.equal(sent.reasonCode, null, `proposal ${index + 1} is below the threshold: ${sent.text}`);
        assert.doesNotMatch(sent.text, /cần trưởng nhóm .* duyệt/);
      } else {
        assert.equal(sent.reasonCode, 'NEEDS_APPROVAL', 'the fifth draft says a lead must approve');
        assert.match(sent.text, /cần trưởng nhóm Vận hành duyệt/);
        assert.match(sent.text, /60 phút qua đã có các mục cùng việc này/);
      }

      const response = await press(f, sent.id, await signIn(f, HOA, sent.id));
      assert.equal(response.status, 303, await response.text());

      if (index < 4) {
        assert.equal(f.gateway.proposals.get(sent.id)?.status, 'confirmed');
        h.clock.at += MINUTE;
        continue;
      }

      const waiting = f.gateway.proposals.get(sent.id);
      assert.equal(waiting?.status, 'awaiting_approval', 'the fifth press waits for the lead instead of failing');
      assert.equal(waiting?.requiresApproval, true);
      assert.match(waiting?.approvalReason ?? '', /60 phút/);
      assert.equal(Date.parse(waiting?.approvalExpiresAt ?? '') - h.clock.at, 120 * MINUTE);
      assert.equal(f.gateway.commands.listByProposal(sent.id).length, 0, 'a waiting proposal creates no command');
      assert.equal(f.systems.writeCount(task), 0, 'nothing is written for the fifth task');
      assert.equal(f.gateway.proposals.get(sent.id)?.approval, null);

      const draftLine = f.gateway.trace
        .list()
        .find((line) => line.proposalId === sent.id && line.tool === 'propose_task_change');
      assert.equal(draftLine?.ruleId, 'task.change_task_assignee_or_due.staff.cumulative');
      const sendLine = f.gateway.trace.list().find((line) => line.tool === 'proposal_send' && line.proposalId === sent.id);
      assert.equal(sendLine?.ruleId, 'task.change_task_assignee_or_due.staff.cumulative');
      assert.equal(sendLine?.outcome, 'ok');
      assert.equal(sendLine?.reasonCode, null, 'waiting for a lead is not a refusal');

      const status = await f.call('get_request_status', { request_id: sent.id }, f.keyFor(HOA));
      assert.match(status.body.text, /đang chờ Trần Văn Quang duyệt/);
    }
  });
});

test('cumulative: two presses at the same time for the fourth and fifth proposal leave exactly one waiting', async () => {
  await withGateway(async (f) => {
    for (const task of ['T-100', 'T-101', 'T-102']) {
      const sent = await draftAndSend(f, task);
      assert.equal(f.gateway.proposals.get(sent.id)?.status, 'confirmed');
    }

    // Both drafts are made with three items committed. The presses overlap,
    // and the store decides inside one transaction, so the second press counts
    // the first one; which of the two waits does not depend on timing.
    const fourth = await draft(f, 'T-103');
    const fifth = await draft(f, 'T-104');
    assert.equal(fourth.reasonCode, null, 'three items are below the threshold');
    assert.equal(
      fifth.reasonCode,
      'NEEDS_APPROVAL',
      'the fourth draft, still waiting for its press, counts at draft time',
    );
    const fourthBrowser = await signIn(f, HOA, fourth.id);
    const fifthBrowser = await signIn(f, HOA, fifth.id);

    const [fourthPress, fifthPress] = await Promise.all([
      press(f, fourth.id, fourthBrowser),
      press(f, fifth.id, fifthBrowser),
    ]);
    assert.deepEqual([fourthPress.status, fifthPress.status], [303, 303], 'both presses are accepted');

    const proposals = [
      { id: fourth.id, task: 'T-103' },
      { id: fifth.id, task: 'T-104' },
    ].map((entry) => ({ ...entry, status: f.gateway.proposals.get(entry.id)?.status }));
    const waiting = proposals.filter((entry) => entry.status === 'awaiting_approval');
    const confirmed = proposals.filter((entry) => entry.status === 'confirmed');
    assert.equal(waiting.length, 1, `exactly one proposal waits: ${JSON.stringify(proposals)}`);
    assert.equal(confirmed.length, 1, `the other one writes: ${JSON.stringify(proposals)}`);

    const held = waiting[0];
    assert.ok(held !== undefined);
    assert.equal(f.gateway.commands.listByProposal(held.id).length, 0);
    assert.equal(f.systems.writeCount(held.task), 0);
    const sendLine = f.gateway.trace.list().find((line) => line.tool === 'proposal_send' && line.proposalId === held.id);
    assert.equal(sendLine?.ruleId, 'task.change_task_assignee_or_due.staff.cumulative');
    assert.equal(sendLine?.reasonCode, null);

    const written = confirmed[0];
    assert.ok(written !== undefined);
    assert.equal(f.gateway.commands.listByProposal(written.id).length, 1);
  });
});

test('cumulative: after the window passes the count starts again from zero', async () => {
  await withGateway(async (f, h) => {
    for (const task of ['T-100', 'T-101', 'T-102', 'T-103']) {
      await draftAndSend(f, task);
    }

    h.clock.at += 59 * MINUTE;
    const near = await draft(f, 'T-104');
    assert.equal(near.reasonCode, 'NEEDS_APPROVAL', 'four items are still inside the 60-minute window');

    h.clock.at += 2 * MINUTE;
    const after = await draft(f, 'T-105');
    assert.equal(after.reasonCode, null, 'the four old items are outside the window now');
    assert.doesNotMatch(after.text, /cần trưởng nhóm .* duyệt/);
    const response = await press(f, after.id, await signIn(f, HOA, after.id));
    assert.equal(response.status, 303);
    assert.equal(f.gateway.proposals.get(after.id)?.status, 'confirmed', 'the fresh count allows the press');
  });
});

test('cumulative: items a lead approved are never counted again', async () => {
  await withGateway(async (f) => {
    const batch = Array.from({ length: 5 }, (_, index) => `T-${100 + index}`);
    const answer = await f.call('propose_task_change', { task_ids: batch, changes: { assignee: 'NV-04' } }, f.keyFor(HOA));
    assert.equal(answer.status, 200, answer.body.text);
    assert.equal(answer.body.reason_code, 'NEEDS_APPROVAL');
    const batchId = linkOf(answer.body.text).id;

    const sent = await press(f, batchId, await signIn(f, HOA, batchId));
    assert.equal(sent.status, 303);
    assert.equal(f.gateway.proposals.get(batchId)?.status, 'awaiting_approval');

    const approved = await pressApproval(f, batchId, await signInForApproval(f, QUANG, batchId));
    assert.equal(approved.status, 303);
    assert.equal(f.gateway.proposals.get(batchId)?.approval?.decision, 'approve');

    const next = await draft(f, 'T-105');
    assert.equal(next.reasonCode, null, 'the approved five items do not push the next proposal over');
    assert.equal(f.gateway.proposals.get(next.id)?.requiresApproval, false);
    const response = await press(f, next.id, await signIn(f, HOA, next.id));
    assert.equal(response.status, 303);
    assert.equal(f.gateway.proposals.get(next.id)?.status, 'confirmed');
  });
});

test('cumulative: the count is per person and per action, not across both', async () => {
  await withGateway(async (f) => {
    // Four drafts that change the status, not the assignee. They count for
    // `change_task_status` only, and they are still waiting for their press.
    for (const task of ['T-100', 'T-101', 'T-102', 'T-103']) {
      const sent = await draft(f, task, { status: 'done' });
      assert.equal(sent.reasonCode, null, sent.text);
    }

    const assignee = await draft(f, 'T-104');
    assert.equal(assignee.reasonCode, null, 'another action does not count toward this one');

    // Another person's items do not count for chị Hoa either.
    for (const task of ['T-105', 'T-106', 'T-107', 'T-108']) {
      const sent = await draft(f, task, { assignee: 'NV-04' }, LAN);
      assert.equal(sent.reasonCode, null, sent.text);
    }
    const fresh = await draft(f, 'T-109');
    assert.equal(fresh.reasonCode, null, 'chị Lan items do not count for chị Hoa');
  });
});
