import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { GATEWAY_DB_FILE } from './database.js';
import { StubSystems, startFixture, type GatewayFixture } from './fixture.js';
import { DEFAULT_RULES_PATH } from './policy/index.js';
import type { WriteCommand } from './writes/index.js';

const HOA = 'NV-02';
const NAM = 'NV-05';
const MINUTE = 60_000;
/** One try plus the retries the executor allows. */
const ATTEMPTS_PER_ROUND = 4;

interface Clock {
  at: number;
}

function harness(): { clock: Clock; now: () => Date } {
  const clock = { at: Date.parse('2026-11-17T09:00:00.000Z') };
  return { clock, now: () => new Date(clock.at) };
}

async function withGateway(
  run: (f: GatewayFixture, h: { clock: Clock; now: () => Date }) => Promise<void>,
  options: { systems?: StubSystems; dir?: string; rulesPath?: string } = {},
): Promise<void> {
  const h = harness();
  const f = await startFixture({ now: h.now, ...options });
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

async function login(
  f: GatewayFixture,
  employeeId: string,
  password: string,
  next: string,
): Promise<{ response: Response; cookie: string }> {
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

/** Log in and follow the card link, without expecting buttons: a sent or expired card has none. */
async function loginFor(f: GatewayFixture, employeeId: string, proposalId: string): Promise<string> {
  const { response, cookie } = await login(f, employeeId, f.pagePasswordFor(employeeId), `/xac-nhan/${proposalId}`);
  assert.equal(response.status, 303);
  return cookie;
}

async function signIn(f: GatewayFixture, employeeId: string, proposalId: string): Promise<Browser> {
  const cookie = await loginFor(f, employeeId, proposalId);
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

async function propose(f: GatewayFixture, employeeId: string, changes: Record<string, string>, task = 'T-12'): Promise<string> {
  const answer = await f.call('propose_task_change', { task_id: task, changes }, f.keyFor(employeeId));
  assert.equal(answer.status, 200, answer.body.text);
  return linkOf(answer.body.text).id;
}

function commandOf(f: GatewayFixture, proposalId: string): WriteCommand {
  const command = f.gateway.commands.findByProposal(proposalId);
  assert.ok(command !== undefined, 'the confirmed proposal has one write command');
  return command;
}

async function pressConfirm(
  f: GatewayFixture,
  proposalId: string,
  employeeId = HOA,
): Promise<{ browser: Browser; response: Response }> {
  const browser = await signIn(f, employeeId, proposalId);
  const response = await press(f, proposalId, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
  return { browser, response };
}

async function waitForCommand(
  read: () => WriteCommand | undefined,
  done: (command: WriteCommand) => boolean,
  what: string,
): Promise<WriteCommand> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const command = read();
    if (command !== undefined && done(command)) return command;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 25));
  }
}

test('write: Gửi writes once, and the command keeps its key, version, count and result', async () => {
  await withGateway(async (f) => {
    const id = await propose(f, HOA, { assignee: 'NV-04' });
    const { response } = await pressConfirm(f, id);
    assert.equal(response.status, 303);

    const command = commandOf(f, id);
    assert.match(command.commandId, /^wc-[0-9a-f]{16}$/);
    assert.equal(command.proposalId, id);
    assert.equal(command.taskId, 'T-12');
    assert.equal(command.position, 1);
    assert.equal(command.idempotencyKey, `${id}:1`);
    assert.equal(command.expectedVersion, 1);
    assert.equal(command.status, 'done');
    assert.equal(command.attempts, 1);
    assert.equal(command.reasonCode, null);
    assert.deepEqual(JSON.parse(command.result ?? '{}'), { kind: 'written', status: 200, replayed: false, version: 2 });

    assert.equal(f.systems.writeCount('T-12'), 1);
    const task = f.systems.tasks.find((candidate) => candidate.id === 'T-12');
    assert.equal(task?.assignee, 'NV-04');
    assert.equal(task?.version, 2);

    const { html } = await openCard(f, id, await loginFor(f, HOA, id));
    assert.match(html, /Đã ghi thay đổi vào task T-12 ở lần gửi thứ 1/);
    assert.doesNotMatch(html, /<button/);

    const status = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(status.body.text, /đã ghi thay đổi vào task T-12 ở lần gửi thứ 1/);
    assert.equal(status.body.reason_code, null);

    const line = f.gateway.trace.list().find((entry) => entry.tool === 'write_command');
    assert.equal(line?.outcome, 'ok');
    assert.equal(line?.reasonCode, null);
    assert.equal(line?.idempotencyKey, `${id}:1`);
    assert.equal(line?.attempts, 1);
    assert.equal(line?.proposalId, id);
    assert.equal(line?.objectId, 'T-12');
    assert.equal(line?.requester, HOA);
  });
});

test('write: two presses at the same time make one command and one write', async () => {
  await withGateway(async (f) => {
    const id = await propose(f, HOA, { assignee: 'NV-04' });
    const browser = await signIn(f, HOA, id);

    const [first, second] = await Promise.all([
      press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf }),
      press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf }),
    ]);
    assert.deepEqual([first.status, second.status].sort((a, b) => a - b), [303, 409]);
    const refused = first.status === 409 ? first : second;
    assert.match(await refused.text(), /\[APPROVAL_USED\]/);

    assert.equal(f.gateway.commands.list().length, 1);
    const command = commandOf(f, id);
    assert.equal(command.status, 'done');
    assert.equal(command.attempts, 1);
    assert.equal(f.systems.writeCount('T-12'), 1);
    assert.equal(f.systems.patchCalls.length, 1);
  });
});

test('write: a role lowered after the draft is refused at Gửi with NOT_PERMITTED, and nothing is written', async () => {
  await withGateway(async (f) => {
    const id = await propose(f, HOA, { assignee: 'NV-04' });
    // Chị Hoa becomes an intern: an intern may change a status but not an assignee.
    f.systems.employees = f.systems.employees.map((employee) =>
      employee['employee_id'] === HOA ? { ...employee, role: 'intern' } : employee,
    );

    const { response } = await pressConfirm(f, id);
    assert.equal(response.status, 403);
    assert.match(await response.text(), /\[NOT_PERMITTED\]/);

    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation', 'the proposal stays open');
    assert.equal(f.gateway.commands.findByProposal(id), undefined, 'no command is made for a refused press');
    assert.equal(f.systems.writeCount('T-12'), 0);

    const line = f.gateway.trace.list().find((entry) => entry.tool === 'proposal_send');
    assert.equal(line?.outcome, 'refused');
    assert.equal(line?.reasonCode, 'NOT_PERMITTED');
    assert.equal(line?.ruleId, 'task.change_task_assignee_or_due.intern');
  });
});

test('write: a drafting key removed or a person gone from the directory is KEY_INVALID at Gửi', async () => {
  await withGateway(async (f) => {
    const id = await propose(f, HOA, { status: 'done' });
    const browser = await signIn(f, HOA, id);
    const draftedByKeyId = f.gateway.proposals.get(id)?.draftedByKeyId ?? '';
    assert.notEqual(draftedByKeyId, '');

    const db = new Database(join(f.dir, GATEWAY_DB_FILE));
    try {
      db.prepare('DELETE FROM api_keys WHERE key_id = ?').run(draftedByKeyId);
    } finally {
      db.close();
    }

    const response = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(response.status, 401);
    assert.match(await response.text(), /\[KEY_INVALID\]/);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
    assert.equal(f.systems.writeCount('T-12'), 0);
  });

  await withGateway(async (f) => {
    const id = await propose(f, HOA, { status: 'done' });
    const browser = await signIn(f, HOA, id);
    f.systems.employees = f.systems.employees.filter((employee) => employee['employee_id'] !== HOA);

    const response = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(response.status, 401);
    assert.match(await response.text(), /\[KEY_INVALID\]/);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
  });
});

test('write: a broken rule file at Gửi refuses with POLICY_UNAVAILABLE and leaves the proposal open', async () => {
  const rulesDir = mkdtempSync(join(tmpdir(), 'lab-write-rules-'));
  const rulesPath = join(rulesDir, 'rules.json');
  writeFileSync(rulesPath, readFileSync(DEFAULT_RULES_PATH, 'utf8'));
  try {
    await withGateway(
      async (f) => {
        const id = await propose(f, HOA, { status: 'done' });
        const browser = await signIn(f, HOA, id);
        writeFileSync(rulesPath, '{ not json');

        const response = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
        assert.equal(response.status, 503);
        assert.match(await response.text(), /\[POLICY_UNAVAILABLE\]/);
        assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
        assert.equal(f.systems.writeCount('T-12'), 0);
      },
      { rulesPath },
    );
  } finally {
    rmSync(rulesDir, { recursive: true, force: true });
  }
});

test('write: a task changed after the draft fails with TARGET_CHANGED and keeps the other change', async () => {
  await withGateway(async (f) => {
    const id = await propose(f, HOA, { assignee: 'NV-04' });
    // Someone else finishes T-12 while the proposal waits.
    f.systems.tasks = f.systems.tasks.map((task) => (task.id === 'T-12' ? { ...task, status: 'done', version: 2 } : task));

    const { browser, response } = await pressConfirm(f, id);
    assert.equal(response.status, 303);

    const command = commandOf(f, id);
    assert.equal(command.status, 'failed');
    assert.equal(command.reasonCode, 'TARGET_CHANGED');
    assert.equal(command.attempts, 1);
    assert.deepEqual(JSON.parse(command.result ?? '{}'), { kind: 'target_changed', status: 409, currentVersion: 2 });
    assert.equal(f.systems.writeCount('T-12'), 0);

    const task = f.systems.tasks.find((candidate) => candidate.id === 'T-12');
    assert.equal(task?.assignee, 'NV-03', 'the gateway did not overwrite the other change');
    assert.equal(task?.status, 'done');
    assert.equal(task?.version, 2);

    const { html } = await openCard(f, id, browser.cookie);
    assert.match(html, /\[TARGET_CHANGED\]/);
    assert.match(html, /nhờ AI soạn lại/);

    const status = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(status.body.text, /\[TARGET_CHANGED\]/);
    assert.match(status.body.text, /nhờ AI soạn lại/);
    assert.equal(status.body.reason_code, 'TARGET_CHANGED');

    const line = f.gateway.trace.list().find((entry) => entry.tool === 'write_command');
    assert.equal(line?.outcome, 'refused');
    assert.equal(line?.reasonCode, 'TARGET_CHANGED');
    assert.equal(line?.attempts, 1);
  });
});

test('write: an answer lost after the write is sent again with the same key and lands once', async () => {
  await withGateway(async (f) => {
    f.systems.dropAfterCommit = 1;
    const id = await propose(f, HOA, { assignee: 'NV-04' });
    const { response } = await pressConfirm(f, id);
    assert.equal(response.status, 303);

    const command = commandOf(f, id);
    assert.equal(command.status, 'done');
    assert.equal(command.attempts, 2, 'the first answer was lost, the second was the replay');
    assert.equal(f.systems.writeCount('T-12'), 1);
    assert.equal(f.systems.tasks.find((task) => task.id === 'T-12')?.version, 2);

    assert.equal(f.systems.patchCalls.length, 2);
    assert.equal(f.systems.patchCalls[0]?.idempotencyKey, `${id}:1`);
    assert.equal(f.systems.patchCalls[1]?.idempotencyKey, `${id}:1`);
    assert.equal(f.systems.patchCalls[0]?.expectedVersion, 1);
    assert.equal(f.systems.patchCalls[1]?.expectedVersion, 1);

    const line = f.gateway.trace.list().find((entry) => entry.tool === 'write_command');
    assert.equal(line?.outcome, 'ok');
    assert.equal(line?.attempts, 2);
  });
});

test('write: with no answer the command stays sent_unknown, and the next start settles it with the old key', async () => {
  const clock = { at: Date.parse('2026-11-17T09:00:00.000Z') };
  const dir = mkdtempSync(join(tmpdir(), 'lab-write-restart-'));
  const systems = new StubSystems();
  let f = await startFixture({ dir, systems, now: () => new Date(clock.at) });
  try {
    systems.failBeforeCommit = 50;
    const id = await propose(f, HOA, { assignee: 'NV-04' });
    const { response } = await pressConfirm(f, id);
    assert.equal(response.status, 303);

    const unknown = commandOf(f, id);
    assert.equal(unknown.status, 'sent_unknown');
    assert.equal(unknown.attempts, ATTEMPTS_PER_ROUND);
    assert.equal(systems.writeCount('T-12'), 0);

    const { html } = await openCard(f, id, await loginFor(f, HOA, id));
    assert.match(html, /chưa nhận được kết quả/);
    assert.match(html, /gửi lại với đúng mã cũ/);

    const status = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(status.body.text, /chưa nhận được kết quả/);
    const unknownLine = f.gateway.trace.list().find((entry) => entry.tool === 'write_command');
    assert.equal(unknownLine?.outcome, 'error');
    assert.equal(unknownLine?.attempts, ATTEMPTS_PER_ROUND);

    // Restart on the same data dir: the gateway must resend every open command with its old key.
    await f.close();
    systems.failBeforeCommit = 0;
    f = await startFixture({ dir, systems, now: () => new Date(clock.at) });

    const settled = await waitForCommand(
      () => f.gateway.commands.findByProposal(id),
      (command) => command.status === 'done',
      'the restarted gateway to settle the command',
    );
    assert.equal(settled.attempts, ATTEMPTS_PER_ROUND + 1);
    assert.equal(settled.idempotencyKey, `${id}:1`);
    assert.equal(systems.writeCount('T-12'), 1);

    const resumedLine = f.gateway.trace.list().find((entry) => entry.tool === 'write_command' && entry.ruleId === 'WRITE.RESUME');
    assert.equal(resumedLine?.outcome, 'ok');
    assert.equal(resumedLine?.attempts, ATTEMPTS_PER_ROUND + 1);
    assert.equal(resumedLine?.idempotencyKey, `${id}:1`);
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('write: a task that disappeared between the draft and the press is refused before anything is confirmed', async () => {
  await withGateway(async (f) => {
    const id = await propose(f, HOA, { assignee: 'NV-04' });
    f.systems.tasks = f.systems.tasks.filter((task) => task.id !== 'T-12');

    const { response } = await pressConfirm(f, id);
    assert.equal(response.status, 409);
    assert.match(await response.text(), /\[TARGET_CHANGED\]/);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
    assert.equal(f.gateway.commands.findByProposal(id), undefined);
    assert.equal(f.systems.writeCount('T-12'), 0);
  });
});

test('write: a proposal that expired after the draft is refused with APPROVAL_EXPIRED and never sent', async () => {
  await withGateway(async (f, h) => {
    const id = await propose(f, NAM, { status: 'done' });
    h.clock.at += 20 * MINUTE;
    const browser = await signIn(f, NAM, id);
    h.clock.at += 11 * MINUTE;

    const response = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(response.status, 410);
    assert.match(await response.text(), /\[APPROVAL_EXPIRED\]/);
    assert.equal(f.gateway.proposals.get(id)?.status, 'expired');
    assert.equal(f.gateway.commands.findByProposal(id), undefined);
    assert.equal(f.systems.writeCount('T-12'), 0);
  });
});
