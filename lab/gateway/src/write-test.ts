import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { GATEWAY_DB_FILE } from './database.js';
import { StubSystems, startFixture, type GatewayFixture } from './fixture.js';
import { DEFAULT_RULES_PATH } from './policy/index.js';
import type { ProposalExecutor } from './proposals/index.js';
import type { WriteCommand } from './writes/index.js';

const HOA = 'NV-02';
const QUANG = 'NV-01';
const NAM = 'NV-05';
const MINUTE = 60_000;

interface Clock {
  at: number;
}

/** The clock moves by itself, so a retry wait costs real time but a test can still jump ahead. */
function harness(): { clock: Clock; now: () => Date } {
  const started = Date.now();
  const clock = { at: Date.parse('2026-11-17T09:00:00.000Z') };
  return { clock, now: () => new Date(clock.at + (Date.now() - started)) };
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
  const answer = await f.call('propose_task_change', { task_ids: [task], changes }, f.keyFor(employeeId));
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
): Promise<{ browser: Browser; response: Response; elapsedMs: number }> {
  const browser = await signIn(f, employeeId, proposalId);
  const started = Date.now();
  const response = await press(f, proposalId, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
  return { browser, response, elapsedMs: Date.now() - started };
}

/** Log in as a lead through the approval link and read the token from the approval page. */
async function signInForApproval(f: GatewayFixture, proposalId: string, employeeId = QUANG): Promise<Browser> {
  const { response, cookie } = await login(f, employeeId, f.pagePasswordFor(employeeId), `/duyet/${proposalId}`);
  assert.equal(response.status, 303);
  const page = await fetch(`${f.gateway.url}/duyet/${proposalId}`, { redirect: 'manual', headers: { cookie } });
  assert.equal(page.status, 200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
  assert.ok(csrf !== undefined, 'the approval page carries a CSRF token');
  return { cookie, csrf };
}

function pressApproval(
  f: GatewayFixture,
  proposalId: string,
  button: 'duyet' | 'tu-choi',
  browser: Browser,
  form: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${f.gateway.url}/duyet/${proposalId}/${button}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf, ...form }).toString(),
  });
}

/** Wait for the background loop to settle a proposal's commands. */
async function waitCommands(
  f: GatewayFixture,
  proposalId: string,
  count: number,
  done: (command: WriteCommand) => boolean = (command) => command.status === 'done' || command.status === 'failed',
): Promise<WriteCommand[]> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const commands = f.gateway.commands.listByProposal(proposalId);
    if (commands.length === count && commands.every(done)) return commands;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${count} settled commands: ${JSON.stringify(commands)}`);
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 25));
  }
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

test('write: Gửi answers at once, then writes once, and the command keeps its key, version, count and result', async () => {
  await withGateway(async (f) => {
    const id = await propose(f, HOA, { assignee: 'NV-04' });
    const { response, elapsedMs } = await pressConfirm(f, id);
    assert.equal(response.status, 303);
    assert.ok(elapsedMs < 1_000, `Gửi answered in ${elapsedMs} ms, before any system call`);

    const command = (await waitCommands(f, id, 1))[0];
    assert.ok(command !== undefined);
    assert.match(command.commandId, /^wc-[0-9a-f]{16}$/);
    assert.equal(command.proposalId, id);
    assert.equal(command.recordId, 'T-12');
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
    assert.match(html, /Đã ghi thay đổi vào T-12 ở lần gửi thứ 1/);
    assert.doesNotMatch(html, /<button/);
    assert.doesNotMatch(html, /Lần gửi lại kế tiếp/, 'a finished proposal has no retry column');
    assert.doesNotMatch(html, /Hạn duyệt lúc|Hết hạn lúc/, 'a finished proposal has no deadline line left');

    const status = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(status.body.text, /đã ghi thay đổi vào task T-12 ở lần gửi thứ 1/);
    assert.equal(status.body.reason_code, null);
    assert.equal(status.body.gateway_status, 'executed');

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
    const command = (await waitCommands(f, id, 1))[0];
    assert.ok(command !== undefined);
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

    const command = (await waitCommands(f, id, 1))[0];
    assert.ok(command !== undefined);
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
    assert.equal(status.body.deny_reason, 'stale_target');
    assert.equal(status.body.gateway_status, 'failed');

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

    const command = (await waitCommands(f, id, 1))[0];
    assert.ok(command !== undefined);
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
  const dir = mkdtempSync(join(tmpdir(), 'lab-write-restart-'));
  const systems = new StubSystems();
  let f = await startFixture({ dir, systems });
  try {
    systems.failBeforeCommit = 1_000;
    const id = await propose(f, HOA, { assignee: 'NV-04' });
    const { response } = await pressConfirm(f, id);
    assert.equal(response.status, 303);

    const unknown = await waitForCommand(
      () => f.gateway.commands.findByProposal(id),
      (command) => command.status === 'sent_unknown' && command.attempts >= 1,
      'the first send to come back with no answer',
    );
    assert.equal(systems.writeCount('T-12'), 0);

    const { html } = await openCard(f, id, await loginFor(f, HOA, id));
    assert.match(html, /chưa nhận được kết quả/);
    assert.match(html, /gửi lại với đúng mã cũ/);
    assert.match(html, /data-label="Lần gửi lại kế tiếp">\d{2}:\d{2}</, 'the card says when the next send is due');

    const status = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(status.body.text, /chưa nhận được kết quả/);
    assert.equal(status.body.gateway_status, 'executing');
    const unknownLine = f.gateway.trace.list().find((entry) => entry.tool === 'write_command');
    assert.equal(unknownLine?.outcome, 'error');
    assert.ok((unknownLine?.attempts ?? 0) >= 1);

    // Restart on the same data dir: the background loop picks every open command up with its old key.
    await f.close();
    systems.failBeforeCommit = 0;
    f = await startFixture({ dir, systems });

    const settled = await waitForCommand(
      () => f.gateway.commands.findByProposal(id),
      (command) => command.status === 'done',
      'the restarted gateway to settle the command',
    );
    assert.ok(settled.attempts > unknown.attempts, 'the restart sent the open command again');
    assert.equal(settled.idempotencyKey, `${id}:1`);
    assert.equal(systems.writeCount('T-12'), 1);

    const resumedLine = f.gateway.trace.list().find((entry) => entry.tool === 'write_command' && entry.ruleId === 'WRITE.RETRY');
    assert.equal(resumedLine?.outcome, 'ok');
    assert.equal(resumedLine?.idempotencyKey, `${id}:1`);
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('write: a command left not_sent by a crash is sent by the first round of the next start', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-write-not-sent-'));
  const systems = new StubSystems();
  const quiet: ProposalExecutor = { execute: () => Promise.resolve({ state: 'received' }) };
  let f = await startFixture({ dir, systems, executor: quiet });
  let id = '';
  try {
    id = await propose(f, HOA, { assignee: 'NV-04' });
    const { response } = await pressConfirm(f, id);
    assert.equal(response.status, 303);
    assert.equal(commandOf(f, id).status, 'not_sent', 'the quiet executor confirmed the proposal but sent nothing');
    assert.equal(systems.writeCount('T-12'), 0);
  } finally {
    await f.close();
  }

  try {
    f = await startFixture({ dir, systems });
    const settled = await waitForCommand(
      () => f.gateway.commands.findByProposal(id),
      (command) => command.status === 'done',
      'the first round to send the command left in not_sent',
    );
    assert.equal(settled.attempts, 1);
    assert.equal(systems.writeCount('T-12'), 1);
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

test('write: a three-item proposal makes one command per item, writes each once and lists each result', async () => {
  await withGateway(async (f) => {
    const answer = await f.call(
      'propose_task_change',
      { task_ids: ['T-12', 'T-13', 'T-14'], changes: { description: 'Mô tả chung.' } },
      f.keyFor(HOA),
    );
    assert.equal(answer.status, 200, answer.body.text);
    const id = linkOf(answer.body.text).id;
    const { response } = await pressConfirm(f, id);
    assert.equal(response.status, 303);

    const commands = await waitCommands(f, id, 3);
    assert.deepEqual(
      commands.map((command) => [command.position, command.recordId, command.idempotencyKey, command.status]),
      [
        [1, 'T-12', `${id}:1`, 'done'],
        [2, 'T-13', `${id}:2`, 'done'],
        [3, 'T-14', `${id}:3`, 'done'],
      ],
      'one command per position, each with its own key',
    );
    for (const task of ['T-12', 'T-13', 'T-14']) {
      assert.equal(f.systems.writeCount(task), 1, `${task} was written exactly once`);
    }

    const { html } = await openCard(f, id, await loginFor(f, HOA, id));
    assert.match(html, /Xong hết: đã ghi 3 trên 3 mục/);
    assert.match(html, /<td class="code" data-label="Mục">T-12<\/td>/);
    assert.match(html, /Đã ghi \(lần 1\)/);

    const status = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(status.body.text, /đã ghi 3 trên 3 mục/);
    assert.match(status.body.text, /T-12: đã ghi ở lần gửi thứ 1/);
    assert.equal(status.body.reason_code, null);
    assert.equal(status.body.gateway_status, 'executed');
  });
});

test('write: one changed task is skipped while the other items of the proposal are written', async () => {
  await withGateway(async (f) => {
    const answer = await f.call(
      'propose_task_change',
      { task_ids: ['T-12', 'T-13', 'T-14'], changes: { description: 'Mô tả chung.' } },
      f.keyFor(HOA),
    );
    const id = linkOf(answer.body.text).id;
    // Someone else changes T-12 while the proposal waits.
    f.systems.tasks = f.systems.tasks.map((task) =>
      task.id === 'T-12' ? { ...task, description: 'Người khác sửa', version: 2 } : task,
    );

    const { response } = await pressConfirm(f, id);
    assert.equal(response.status, 303);
    const commands = await waitCommands(f, id, 3);
    assert.deepEqual(commands.map((command) => command.status), ['failed', 'done', 'done']);
    assert.equal(commands[0]?.reasonCode, 'TARGET_CHANGED');
    assert.equal(f.systems.writeCount('T-12'), 0, 'the changed task is not overwritten');
    assert.equal(f.systems.writeCount('T-13'), 1);
    assert.equal(f.systems.writeCount('T-14'), 1);

    const { html } = await openCard(f, id, await loginFor(f, HOA, id));
    assert.match(html, /Xong một phần: đã ghi 2 trên 3 mục; 1 mục bị bỏ qua/);
    assert.match(html, /Bị bỏ qua \(TARGET_CHANGED\)/);

    const status = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.equal(status.body.reason_code, 'TARGET_CHANGED');
    assert.equal(status.body.gateway_status, 'failed');
    assert.match(status.body.text, /T-12: CHƯA THỰC HIỆN \[TARGET_CHANGED\]/);
    assert.match(status.body.text, /T-13: đã ghi ở lần gửi thứ 1/);
  });
});

test('write: a batch at the bulk threshold waits for the lead, then the approval writes every item once', async () => {
  await withGateway(async (f) => {
    const thirty = Array.from({ length: 30 }, (_, index) => `T-${100 + index}`);
    const answer = await f.call(
      'propose_task_change',
      { task_ids: thirty, changes: { assignee: 'NV-04' } },
      f.keyFor(HOA),
    );
    assert.equal(answer.body.reason_code, 'NEEDS_APPROVAL');
    const id = linkOf(answer.body.text).id;
    const draftLine = f.gateway.trace.list().find((line) => line.proposalId === id);
    assert.equal(draftLine?.ruleId, 'task.change_task_assignee_or_due.staff.bulk', 'the draft asked the rule with thirty items');

    const browser = await signIn(f, HOA, id);
    const card = await openCard(f, id, browser.cookie);
    assert.match(card.html, /cần trưởng nhóm duyệt/);

    const pressed = await press(f, id, 'gui', { cookie: browser.cookie }, { csrf: browser.csrf });
    assert.equal(pressed.status, 303);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_approval');
    assert.equal(f.gateway.commands.listByProposal(id).length, 0, 'waiting creates no command');
    assert.equal(f.systems.writeCount('T-100'), 0);
    const sendLine = f.gateway.trace.list().find((line) => line.tool === 'proposal_send');
    assert.equal(sendLine?.ruleId, 'task.change_task_assignee_or_due.staff.bulk', 'Gửi asked the rule with the same count');
    assert.equal(sendLine?.reasonCode, null, 'waiting for a lead is not a refusal');

    const status = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.equal(status.body.reason_code, null);
    assert.equal(status.body.gateway_status, 'pending');
    assert.match(status.body.text, /đang chờ Trần Văn Quang duyệt/);
    assert.match(status.body.text, /2 giờ/);

    const lead = await signInForApproval(f, id);
    const approvalPage = await fetch(`${f.gateway.url}/duyet/${id}`, { headers: { cookie: lead.cookie } });
    const approvalHtml = await approvalPage.text();
    assert.match(approvalHtml, /30 mục/);
    assert.match(approvalHtml, /Lý do cần duyệt: Đề xuất có 30 mục/);
    assert.match(approvalHtml, /Hạn duyệt/);

    const approved = await pressApproval(f, id, 'duyet', lead);
    assert.equal(approved.status, 303);
    assert.equal(approved.headers.get('location'), `/duyet/${id}`);
    assert.equal(f.gateway.proposals.get(id)?.status, 'confirmed');
    assert.equal(f.gateway.proposals.get(id)?.approval?.decision, 'approve');
    assert.equal(f.gateway.proposals.get(id)?.approval?.actor, QUANG);

    const commands = await waitCommands(f, id, 30);
    assert.ok(commands.every((command) => command.status === 'done'));
    assert.equal(f.systems.writeCount('T-100'), 1);
    const after = await f.call('get_request_status', { request_id: id }, f.keyFor(HOA));
    assert.match(after.body.text, /đã ghi 30 trên 30 mục/);
    assert.equal(after.body.gateway_status, 'executed');

    const again = await pressApproval(f, id, 'duyet', lead);
    assert.equal(again.status, 409);
    assert.match(await again.text(), /\[APPROVAL_USED\]/);
    assert.equal(f.gateway.commands.listByProposal(id).length, 30, 'the second press creates no second set');
  });
});

test('write: a gateway.sqlite from the old layout stops the gateway and says to delete the data folder', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-old-db-'));
  const db = new Database(join(dir, GATEWAY_DB_FILE));
  try {
    db.exec('CREATE TABLE proposals (proposal_id TEXT PRIMARY KEY, task_id TEXT NOT NULL)');
  } finally {
    db.close();
  }
  try {
    await assert.rejects(
      () => startFixture({ dir }),
      /xoá thư mục dữ liệu/,
      'the gateway refuses a database that predates change sets',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
