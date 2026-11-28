import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DATA_DIR_ENV,
  PORT_ENV,
  RULES_PATH_ENV,
  SERVICE_KEY_ENV,
  TEST_HOOKS_ENV,
} from '@lab/shared';
import { issueKey, keyOf, pagePasswordOf, runCli, traceTable } from './cli.js';
import { DOORS, type Answer } from './doors.js';
import { freePorts, killChild, labRoot, spawnBuiltService, stopChild, waitForHealth, type SpawnedService } from './process.js';

const HOA = 'NV-02';
const DEFAULT_RULES = join(labRoot, 'gateway', 'policy', 'rules.json');

interface ProposalAnswer {
  readonly id: string;
  readonly text: string;
}

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

interface TaskView {
  readonly id: string;
  readonly assignee: string;
  readonly status: string;
  readonly description: string;
  readonly department: string;
  readonly version: number;
}

function proposalOf(text: string): ProposalAnswer {
  const link = text.split('\n').find((line) => /^http:\/\/127\.0\.0\.1:\d+\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a confirmation link: ${text}`);
  return { id: link.slice(link.lastIndexOf('/') + 1), text };
}

async function signInAs(base: string, employeeId: string, password: string, next: string): Promise<Browser> {
  const login = await fetch(`${base}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: employeeId, password, next }).toString(),
  });
  assert.equal(login.status, 303);
  return { cookie: (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '', csrf: '' };
}

async function signIn(base: string, password: string, proposalId: string): Promise<Browser> {
  const browser = await signInAs(base, HOA, password, `/xac-nhan/${proposalId}`);
  const card = await fetch(`${base}/xac-nhan/${proposalId}`, { headers: { cookie: browser.cookie } });
  assert.equal(card.status, 200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await card.text())?.[1];
  assert.ok(csrf !== undefined, 'the card carries a CSRF token');
  return { cookie: browser.cookie, csrf };
}

/** Log in as a lead and read the token from the approval page. */
async function signInForApproval(
  base: string,
  employeeId: string,
  password: string,
  proposalId: string,
): Promise<Browser> {
  const browser = await signInAs(base, employeeId, password, `/duyet/${proposalId}`);
  const page = await fetch(`${base}/duyet/${proposalId}`, { headers: { cookie: browser.cookie } });
  const html = await page.text();
  assert.equal(page.status, 200, html);
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(csrf !== undefined, 'the approval page carries a CSRF token');
  return { cookie: browser.cookie, csrf };
}

function press(base: string, proposalId: string, browser: Browser): Promise<Response> {
  return fetch(`${base}/xac-nhan/${proposalId}/gui`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

/** Sửa: cancel a draft that a later subtest would otherwise count toward the threshold. */
function cancel(base: string, proposalId: string, browser: Browser): Promise<Response> {
  return fetch(`${base}/xac-nhan/${proposalId}/huy`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

function pressApproval(
  base: string,
  proposalId: string,
  button: 'duyet' | 'tu-choi',
  browser: Browser,
  form: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${base}/duyet/${proposalId}/${button}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf, ...form }).toString(),
  });
}

/** Keep polling until a read returns a value, or fail with the reason the wait mattered. */
async function eventually<T>(what: string, read: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The two refusals compared across doors at the end: same question, same words. */
interface DoorRefusals {
  readonly sr1: string;
  readonly sr2: string;
}

const refusalsByDoor = new Map<string, DoorRefusals>();

for (const door of DOORS) {
  test(`gateway write path (${door.name}): one task, one write, and a refusal for every rule`, async (t) => {
    const serviceKey = randomBytes(32).toString('base64url');
    const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-write-'));
    const rulesDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-rules-'));
    const rulesPath = join(rulesDir, 'rules.json');
    await copyFile(DEFAULT_RULES, rulesPath);

    const [directoryPort, tasksPort, gatewayPort] = await freePorts(3);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      [SERVICE_KEY_ENV]: serviceKey,
      [DATA_DIR_ENV]: dataDir,
      [RULES_PATH_ENV]: rulesPath,
      [TEST_HOOKS_ENV]: '1',
      [PORT_ENV.directory]: String(directoryPort),
      [PORT_ENV.tasks]: String(tasksPort),
      [PORT_ENV.gateway]: String(gatewayPort),
    };

    const started: SpawnedService[] = [];
    t.after(async () => {
      await Promise.all(started.map((service) => stopChild(service.child)));
      await rm(dataDir, { recursive: true, force: true });
      await rm(rulesDir, { recursive: true, force: true });
    });

    const directory = spawnBuiltService('fake-directory', env);
    const tasks = spawnBuiltService('fake-tasks', env);
    started.push(directory, tasks);
    await waitForHealth(directory, directoryPort ?? 0, serviceKey);
    await waitForHealth(tasks, tasksPort ?? 0, serviceKey);

    const startGateway = async (): Promise<SpawnedService> => {
      const spawned = spawnBuiltService('gateway', env);
      started.push(spawned);
      await waitForHealth(spawned, gatewayPort ?? 0, serviceKey);
      return spawned;
    };
    let gateway = await startGateway();

    const base = `http://127.0.0.1:${gatewayPort}`;
    const directoryUrl = `http://127.0.0.1:${directoryPort}`;
    const tasksUrl = `http://127.0.0.1:${tasksPort}`;
    const serviceHeaders = { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };

    // Keys come from the identity module through its CLI; no raw key is written in this file.
    const keys = runCli('seed-keys-main.js', [], env);
    const hoa = keyOf(keys, 'hoa').key;
    const hoaPagePassword = pagePasswordOf(keys, 'hoa').password;
    const quangPagePassword = pagePasswordOf(keys, 'quang').password;
    const nam = keyOf(keys, 'nam').key;
    const nhung = keyOf(keys, 'nhung').key;

    const call = (tool: string, args: unknown, key: string): Promise<Answer> => door.call(base, tool, args, key);

    const draft = async (taskId: string, changes: Record<string, string>, key = hoa): Promise<ProposalAnswer> => {
      const answer = await call('propose_task_change', { task_ids: [taskId], changes }, key);
      assert.equal(answer.reasonCode, null, answer.text);
      return proposalOf(answer.text);
    };

    const cardOf = async (proposalId: string, browser: Browser): Promise<string> => {
      const response = await fetch(`${base}/xac-nhan/${proposalId}`, { headers: { cookie: browser.cookie } });
      assert.equal(response.status, 200);
      return response.text();
    };

    const taskOf = async (taskId: string): Promise<TaskView> => {
      const response = await fetch(`${tasksUrl}/tasks/${taskId}`, { headers: serviceHeaders });
      assert.equal(response.status, 200);
      return (await response.json()) as TaskView;
    };

    const writeCount = async (taskId: string): Promise<number> => {
      const response = await fetch(`${tasksUrl}/admin/write-count?task=${taskId}`, { headers: serviceHeaders });
      assert.equal(response.status, 200);
      return ((await response.json()) as { count: number }).count;
    };

    /** Wait until the background loop has really written a task, or failed it, before reading the card. */
    const waitWritten = (taskId: string, count = 1): Promise<number> =>
      eventually(
        `${taskId} to have ${count} committed writes`,
        async () => {
          const current = await writeCount(taskId);
          return current === count ? current : undefined;
        },
        20_000,
      );

    const setFault = async (fault: Record<string, unknown>): Promise<void> => {
      const response = await fetch(`${tasksUrl}/admin/faults`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify(fault),
      });
      assert.equal(response.status, 200, await response.text());
    };

    const directPatch = (taskId: string, changes: Record<string, string>, expectedVersion: number, key: string): Promise<Response> =>
      fetch(`${tasksUrl}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { ...serviceHeaders, 'idempotency-key': key },
        body: JSON.stringify({ changes, expected_version: expectedVersion }),
      });

    /** Change one person's role in the directory, as a transfer would. */
    const setRole = async (employeeId: string, role: string): Promise<void> => {
      const current = (await (await fetch(`${directoryUrl}/employees/${employeeId}`, { headers: serviceHeaders })).json()) as {
        version: number;
      };
      const response = await fetch(`${directoryUrl}/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { ...serviceHeaders, 'idempotency-key': `test-role-${employeeId}-${current.version}` },
        body: JSON.stringify({ expected_version: current.version, changes: { role } }),
      });
      assert.equal(response.status, 200, await response.text());
    };

    await t.test('SR1: Nam cannot move T-12, the refusal names anh Quang, and the trace keeps Nam', async () => {
      const answer = await call('propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'NV-04' } }, nam);
      assert.equal(answer.reasonCode, 'NOT_PERMITTED');
      assert.match(answer.text, /^CHƯA THỰC HIỆN \[NOT_PERMITTED\] /);
      assert.ok(answer.text.includes('Trần Văn Quang'), 'the refusal says who to ask');
      assert.ok(!answer.text.includes('/xac-nhan/'), 'a refused draft returns no link');
      assert.equal(await writeCount('T-12'), 0);

      const trace = traceTable(env, ['--employee', 'NV-05']);
      assert.match(
        trace,
        new RegExp(
          String.raw`NV-05\s+tho-than-desktop\s+${door.traceEntry}\s+propose_task_change\s+T-12\s+refused\s+NOT_PERMITTED\s+-\s+task\.change_task_assignee_or_due\.intern`,
        ),
        'the trace names Nam and the rule the policy engine applied',
      );

      refusalsByDoor.set(door.name, { ...(refusalsByDoor.get(door.name) ?? { sr2: '' }), sr1: answer.text });
    });

    await t.test('SR2: a sales task is not found, and a role lowered before Gửi writes nothing', async () => {
      const sales = await call('propose_task_change', { task_ids: ['T-100'], changes: { description: 'Mô tả mới' } }, hoa);
      assert.equal(sales.reasonCode, null);
      assert.equal(sales.text, 'Không tìm thấy task T-100.');
      assert.equal(await writeCount('T-100'), 0);

      const salesTrace = traceTable(env, ['--task', 'T-100']);
      assert.match(
        salesTrace,
        new RegExp(
          String.raw`NV-02\s+tho-than-desktop\s+${door.traceEntry}\s+propose_task_change\s+T-100\s+not_found\s+NOT_PERMITTED\s+out_of_scope\s+task\.read\.staff`,
        ),
        'only the trace can tell a foreign task from a missing one',
      );

      const proposal = await draft('T-12', { assignee: 'NV-04' });
      const browser = await signIn(base, hoaPagePassword, proposal.id);
      await setRole(HOA, 'intern');

      const sent = await press(base, proposal.id, browser);
      assert.equal(sent.status, 403);
      assert.match(await sent.text(), /CHƯA THỰC HIỆN \[NOT_PERMITTED\] /);
      assert.equal(await writeCount('T-12'), 0, 'the lowered role never reaches the task list');

      const status = await call('get_request_status', { request_id: proposal.id }, hoa);
      assert.equal(status.reasonCode, null);
      assert.match(status.text, /đang chờ người yêu cầu bấm Gửi/, 'a refused press leaves the proposal unconfirmed');

      const trace = traceTable(env, ['--task', 'T-12']);
      assert.match(
        trace,
        new RegExp(
          String.raw`NV-02\s+tho-than-desktop\s+web\s+proposal_send\s+T-12\s+refused\s+NOT_PERMITTED\s+-\s+task\.change_task_assignee_or_due\.intern`,
        ),
        'the press is checked again against the role the directory holds now',
      );

      await setRole(HOA, 'staff');

      // Sửa the refused draft, so it does not count toward a later bulk check.
      const cancelled = await cancel(base, proposal.id, browser);
      assert.equal(cancelled.status, 303, await cancelled.text());
      const cancelledStatus = await call('get_request_status', { request_id: proposal.id }, hoa);
      assert.match(cancelledStatus.text, /đã bấm Sửa/);

      refusalsByDoor.set(door.name, { ...(refusalsByDoor.get(door.name) ?? { sr1: '' }), sr2: sales.text });
    });

    await t.test('SR3: Nam edits a description but not an assignee, and a read-only key cannot draft', async () => {
      const description = await call(
        'propose_task_change',
        { task_ids: ['T-12'], changes: { description: 'Gọi lại khách hàng X trước 17 giờ.' } },
        nam,
      );
      assert.equal(description.reasonCode, null);
      assert.match(description.text, /^Đã soạn đề xuất dx-/);
      proposalOf(description.text);
      assert.equal(await writeCount('T-12'), 0, 'a draft writes nothing');

      const assignee = await call('propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'NV-04' } }, nam);
      assert.equal(assignee.reasonCode, 'NOT_PERMITTED');
      assert.match(assignee.text, /^CHƯA THỰC HIỆN \[NOT_PERMITTED\] /);

      const fullKey = await call('propose_task_change', { task_ids: ['T-13'], changes: { assignee: 'NV-04' } }, nhung);
      assert.equal(fullKey.reasonCode, null, 'HR with a full key can change the assignee of a Vận hành task');
      proposalOf(fullKey.text);

      const readOnly = issueKey(env, 'NV-06', 'read_only');
      const readOnlyAnswer = await call(
        'propose_task_change',
        { task_ids: ['T-13'], changes: { assignee: 'NV-04' } },
        readOnly.key,
      );
      assert.equal(readOnlyAnswer.reasonCode, 'NOT_PERMITTED');
      assert.match(readOnlyAnswer.text, /^CHƯA THỰC HIỆN \[NOT_PERMITTED\] /);
      assert.match(readOnlyAnswer.text, /chỉ để đọc/, 'the sentence explains the declared scope');
      assert.ok(!readOnlyAnswer.text.includes('/xac-nhan/'));
      assert.equal(await writeCount('T-13'), 0);

      const trace = traceTable(env, ['--employee', 'NV-06']);
      assert.match(
        trace,
        /propose_task_change\s+T-13\s+ok\s+-\s+-\s+task\.change_task_assignee_or_due\.hr/,
        'the full key drafts',
      );
      assert.match(
        trace,
        /propose_task_change\s+T-13\s+refused\s+NOT_PERMITTED\s+-\s+SCOPE_READ_ONLY/,
        'the read-only key is refused by the scope rule, not by the role',
      );
    });

    await t.test('bulk: thirty codes stop at the lead, and the approval writes each of them once', async () => {
      // T-5 to T-34 are the thirty open tasks of chị Lan (NV-03) in the fake task list.
      const lanTasks = Array.from({ length: 30 }, (_, index) => `T-${index + 5}`);
      const answer = await call('propose_task_change', { task_ids: lanTasks, changes: { assignee: 'NV-04' } }, hoa);
      assert.equal(answer.status, 200, answer.text);
      assert.equal(answer.reasonCode, 'NEEDS_APPROVAL', 'thirty items reach the bulk threshold');
      assert.match(answer.text, /cho 30 task/);
      assert.match(answer.text, /cần trưởng nhóm Vận hành duyệt/);
      assert.match(answer.text, /30 mục/);
      const proposal = proposalOf(answer.text);
      assert.equal((answer.text.match(/^T-\d+: /gm) ?? []).length, 30, 'the card text lists every item');

      // Thirty items are already drafted and waiting for the press, so three
      // more reach the threshold by the cumulative count, not by their own size.
      const three = await call('propose_task_change', { task_ids: lanTasks.slice(0, 3), changes: { assignee: 'NV-04' } }, hoa);
      assert.equal(three.status, 200, three.text);
      assert.equal(three.reasonCode, 'NEEDS_APPROVAL', 'three more items while thirty wait still need the lead');
      assert.match(three.text, /60 phút qua đã có các mục cùng việc này/);
      const threeProposal = proposalOf(three.text);

      assert.equal(await writeCount('T-5'), 0, 'a draft writes nothing');
      assert.equal(await writeCount('T-34'), 0, 'a draft writes nothing');

      const browser = await signIn(base, hoaPagePassword, proposal.id);
      const pressed = await press(base, proposal.id, browser);
      assert.equal(pressed.status, 303, 'Gửi moves the proposal to the lead');
      assert.equal(await writeCount('T-5'), 0, 'a batch that waits for approval writes nothing');
      assert.match(
        traceTable(env, ['--task', 'T-5']),
        /proposal_send\s+T-5\s+ok\s+-\s+-\s+task\.change_task_assignee_or_due\.staff\.bulk/,
        'Gửi asked the rule with the same thirty items',
      );

      const waiting = await call('get_request_status', { request_id: proposal.id }, hoa);
      assert.match(waiting.text, /đang chờ Trần Văn Quang duyệt/, 'chat says who is deciding');
      assert.match(waiting.text, /2 giờ/, 'and for how long');

      // The requester is not an approver, so her inbox refuses her.
      const hoaInbox = await fetch(`${base}/cho-duyet`, { headers: { cookie: browser.cookie } });
      assert.equal(hoaInbox.status, 403);

      // Quang's inbox lists exactly the proposal his department and role may decide.
      const quang = await signInAs(base, 'NV-01', quangPagePassword, '/cho-duyet');
      const inbox = await fetch(`${base}/cho-duyet`, { headers: { cookie: quang.cookie } });
      assert.equal(inbox.status, 200);
      assert.ok((await inbox.text()).includes(proposal.id), 'the lead sees the waiting proposal');

      const lead = await signInForApproval(base, 'NV-01', quangPagePassword, proposal.id);
      const page = await fetch(`${base}/duyet/${proposal.id}`, { headers: { cookie: lead.cookie } });
      const pageHtml = await page.text();
      assert.equal(page.status, 200);
      assert.match(pageHtml, /30 mục/);
      assert.match(pageHtml, /Lý do cần duyệt/);

      const approved = await pressApproval(base, proposal.id, 'duyet', lead);
      assert.equal(approved.status, 303);
      for (const task of lanTasks) {
        await waitWritten(task);
        assert.equal(await writeCount(task), 1, `${task} was written exactly once after approval`);
      }
      assert.match(traceTable(env, ['--proposal', proposal.id]), /proposal_approve\s+T-5\s+ok/, 'the approval is in the chain');

      const again = await pressApproval(base, proposal.id, 'duyet', lead);
      assert.equal(again.status, 409);
      assert.match(await again.text(), /\[APPROVAL_USED\]/);

      // Sửa the three-item draft too, so a later subtest starts from a clear count.
      const threeBrowser = await signIn(base, hoaPagePassword, threeProposal.id);
      const threeCancelled = await cancel(base, threeProposal.id, threeBrowser);
      assert.equal(threeCancelled.status, 303, await threeCancelled.text());

      // Later subtests start from the seeded task list again; this run changed thirty of its tasks.
      const reset = await fetch(`${tasksUrl}/admin/reset`, { method: 'POST', headers: serviceHeaders });
      assert.equal(reset.status, 200, await reset.text());
    });

    await t.test('bulk: one sales code refuses the whole proposal and names exactly that code', async () => {
      const mixed = await call(
        'propose_task_change',
        { task_ids: ['T-5', 'T-6', 'T-100'], changes: { assignee: 'NV-04' } },
        hoa,
      );
      assert.equal(mixed.reasonCode, null);
      assert.equal(mixed.text, 'Không tìm thấy task T-100.');
      assert.equal(mixed.text.includes('/xac-nhan/'), false, 'a refused proposal returns no link');
      assert.equal(await writeCount('T-5'), 0);
      assert.match(
        traceTable(env, ['--task', 'T-100']),
        new RegExp(
          String.raw`NV-02\s+tho-than-desktop\s+${door.traceEntry}\s+propose_task_change\s+T-100\s+not_found\s+NOT_PERMITTED\s+out_of_scope\s+task\.read\.staff`,
        ),
        'only the trace tells a foreign code from a missing one',
      );
    });

    await t.test('bulk: Gửi writes each of three items once, and the card and status list every item', async () => {
      const three = ['T-5', 'T-6', 'T-7'];
      const answer = await call('propose_task_change', { task_ids: three, changes: { assignee: 'NV-04' } }, hoa);
      assert.equal(answer.reasonCode, null, answer.text);
      const proposal = proposalOf(answer.text);
      const browser = await signIn(base, hoaPagePassword, proposal.id);

      const pressed = await press(base, proposal.id, browser);
      assert.equal(pressed.status, 303);
      for (const task of three) {
        await waitWritten(task, 1);
        assert.equal(await writeCount(task), 1, `${task} was written exactly once`);
        assert.equal((await taskOf(task)).assignee, 'NV-04');
      }

      const card = await cardOf(proposal.id, browser);
      assert.match(card, /Xong hết: đã ghi 3 trên 3 mục/);
      for (const task of three) assert.ok(card.includes(`data-label="Mục">${task}<`), `the card names ${task}`);

      const status = await call('get_request_status', { request_id: proposal.id }, hoa);
      assert.equal(status.reasonCode, null);
      assert.match(status.text, /đã ghi 3 trên 3 mục/);
      for (const [index, task] of three.entries()) {
        assert.match(status.text, new RegExp(`${task}: đã ghi ở lần gửi thứ 1`), 'the status names each item result');
        assert.match(
          traceTable(env, ['--task', task]),
          new RegExp(String.raw`write_command\s+${task}\s+ok\s+-\s+\S+\s+WRITE\.SEND\s+v1\s+-\s+${proposal.id}\s+-\s+${proposal.id}:${index + 1}\s+1`),
          `${task} used its own position in the idempotency key`,
        );
      }
    });

    await t.test('SR5: a broken rule file stops every draft and press, and a changed task is not overwritten', async () => {
      const waiting = await draft('T-12', { assignee: 'NV-04' });
      const browser = await signIn(base, hoaPagePassword, waiting.id);

      await writeFile(rulesPath, '{"version": 1, "roles":');

      const blocked = await call('propose_task_change', { task_ids: ['T-13'], changes: { description: 'Mô tả mới' } }, hoa);
      assert.equal(blocked.reasonCode, 'POLICY_UNAVAILABLE');
      assert.match(blocked.text, /^CHƯA THỰC HIỆN \[POLICY_UNAVAILABLE\] /);

      const sent = await press(base, waiting.id, browser);
      assert.equal(sent.status, 503);
      assert.match(await sent.text(), /CHƯA THỰC HIỆN \[POLICY_UNAVAILABLE\] /);
      assert.equal(await writeCount('T-12'), 0, 'no rule file means no write');

      const blockedTrace = traceTable(env);
      assert.match(blockedTrace, /propose_task_change\s+-\s+refused\s+POLICY_UNAVAILABLE/);
      assert.match(
        blockedTrace,
        /proposal_send\s+T-12\s+refused\s+POLICY_UNAVAILABLE\s+-\s+POLICY_UNAVAILABLE/,
        'the press is refused before a command is created',
      );

      // Sửa the draft the broken rule file blocked, so the next draft starts from the same count.
      const blockedCancelled = await cancel(base, waiting.id, browser);
      assert.equal(blockedCancelled.status, 303, await blockedCancelled.text());

      await copyFile(DEFAULT_RULES, rulesPath);

      const waitingForTarget = await draft('T-12', { assignee: 'NV-04' });
      const secondBrowser = await signIn(base, hoaPagePassword, waitingForTarget.id);

      // Someone else finishes T-12 while the proposal waits.
      const direct = await directPatch('T-12', { status: 'done' }, 1, 'e2e-direct-write-T-12:1');
      assert.equal(direct.status, 200, await direct.text());
      assert.equal(await writeCount('T-12'), 1, 'only the direct write committed');

      const pressed = await press(base, waitingForTarget.id, secondBrowser);
      assert.equal(pressed.status, 303);
      const failedSoon = await eventually('the changed task to be refused', async () => {
        const answer = await call('get_request_status', { request_id: waitingForTarget.id }, hoa);
        return answer.reasonCode === 'TARGET_CHANGED' ? answer : undefined;
      });
      assert.equal(failedSoon.reasonCode, 'TARGET_CHANGED');
      assert.equal(await writeCount('T-12'), 1, 'the gateway did not write over the other change');

      const task = await taskOf('T-12');
      assert.equal(task.status, 'done');
      assert.equal(task.assignee, 'NV-03');
      assert.equal(task.version, 2);

      const status = await call('get_request_status', { request_id: waitingForTarget.id }, hoa);
      assert.equal(status.reasonCode, 'TARGET_CHANGED');
      assert.match(status.text, /\[TARGET_CHANGED\]/);
      assert.match(status.text, /nhờ AI soạn lại/);

      const card = await cardOf(waitingForTarget.id, secondBrowser);
      assert.match(card, /\[TARGET_CHANGED\]/);
      assert.match(card, /nhờ AI soạn lại/);

      const trace = traceTable(env, ['--task', 'T-12']);
      assert.match(trace, /write_command\s+T-12\s+refused\s+TARGET_CHANGED/);
    });

    await t.test('SR6: a lost answer is one write, and a retry reads the old result', async () => {
      const proposal = await draft('T-19', { status: 'done' });
      const browser = await signIn(base, hoaPagePassword, proposal.id);

      // The next committed write is answered by closing the connection: the gateway cannot know it landed.
      await setFault({ mode: 'drop_response_after_commit', count: 1 });

      const sent = await press(base, proposal.id, browser);
      assert.equal(sent.status, 303);

      const settled = await eventually('the retry to settle the lost answer', async () => {
        const answer = await call('get_request_status', { request_id: proposal.id }, hoa);
        return /đã ghi thay đổi vào task T-19 ở lần gửi thứ 2/.test(answer.text) ? answer : undefined;
      });
      assert.equal(await writeCount('T-19'), 1, 'exactly one committed write, replays excluded');
      const task = await taskOf('T-19');
      assert.equal(task.status, 'done');
      assert.equal(task.version, 2, 'one write bumps the version one step');

      const status = await call('get_request_status', { request_id: proposal.id }, hoa);
      assert.match(settled.text, /đã ghi thay đổi vào task T-19 ở lần gửi thứ 2/);
      assert.equal(status.reasonCode, null);

      const card = await cardOf(proposal.id, browser);
      assert.match(card, /Đã ghi thay đổi vào T-19 ở lần gửi thứ 2/);

      const trace = traceTable(env, ['--task', 'T-19']);
      assert.match(
        trace,
        new RegExp(
          String.raw`write_command\s+T-19\s+ok\s+-\s+\S+\s+WRITE\.RETRY\s+v1\s+-\s+${proposal.id}\s+-\s+${proposal.id}:1\s+2`,
        ),
        'the retry used the old key and the fake task replayed its stored answer',
      );
    });

    await t.test('SR6: two presses at once commit one write', async () => {
      const proposal = await draft('T-20', { status: 'done' });
      const browser = await signIn(base, hoaPagePassword, proposal.id);

      const [first, second] = await Promise.all([press(base, proposal.id, browser), press(base, proposal.id, browser)]);
      const statuses = [first.status, second.status].sort((a, b) => a - b);
      assert.deepEqual(statuses, [303, 409], 'one press wins, the other is told the proposal was used');
      const loser = first.status === 409 ? first : second;
      assert.match(await loser.text(), /\[APPROVAL_USED\]/);

      const done = await eventually('the winning press to write T-20', async () => {
        const answer = await call('get_request_status', { request_id: proposal.id }, hoa);
        return /đã ghi thay đổi vào task T-20 ở lần gửi thứ 1/.test(answer.text) ? answer : undefined;
      });
      assert.match(done.text, /đã ghi thay đổi vào task T-20 ở lần gửi thứ 1/);
      assert.equal(await writeCount('T-20'), 1, 'two presses, one committed write');
      const task = await taskOf('T-20');
      assert.equal(task.status, 'done');
      assert.equal(task.version, 2);

      const status = await call('get_request_status', { request_id: proposal.id }, hoa);
      assert.match(status.text, /đã ghi thay đổi vào task T-20 ở lần gửi thứ 1/);
    });

    await t.test('SR6: a gateway stopped after sending resumes once and writes once', async () => {
      const proposal = await draft('T-21', { status: 'done' });
      const browser = await signIn(base, hoaPagePassword, proposal.id);

      // The write commits, then its answer is held open so the gateway can be killed before reading it.
      await setFault({ mode: 'delay_response_after_commit', count: 1, delay_ms: 2_000 });

      const inFlight = press(base, proposal.id, browser).catch(() => undefined);

      await eventually('the command to be sent and the task to be written', async () => {
        const status = await call('get_request_status', { request_id: proposal.id }, hoa);
        if (!status.text.includes('chưa nhận được kết quả')) return undefined;
        return (await writeCount('T-21')) === 1 ? true : undefined;
      });

      await killChild(gateway.child);
      await inFlight;

      gateway = await startGateway();

      const resumed = await eventually('the restarted gateway to settle the command', async () => {
        const status = await call('get_request_status', { request_id: proposal.id }, hoa);
        return status.text.includes('đã ghi thay đổi vào task T-21 ở lần gửi thứ 2') ? status : undefined;
      });
      assert.equal(resumed.reasonCode, null);

      assert.equal(await writeCount('T-21'), 1, 'the restart sent the old key again and the fake task replayed');
      const task = await taskOf('T-21');
      assert.equal(task.status, 'done');
      assert.equal(task.version, 2);

      const trace = traceTable(env, ['--task', 'T-21']);
      assert.match(trace, /write_command\s+T-21\s+ok\s+-\s+\S+\s+WRITE\.RETRY\s+v1\s+-\s+\S+\s+-\s+\S+:1\s+2/);
    });
  });
}

test('gateway write path: the three doors refuse the same write in the same words', () => {
  const first = refusalsByDoor.get('http');
  assert.ok(first !== undefined, 'the http door ran');
  for (const door of DOORS) {
    assert.deepEqual(refusalsByDoor.get(door.name), first, `${door.name} refused in the same words`);
  }
  assert.match(first.sr1, /^CHƯA THỰC HIỆN \[NOT_PERMITTED\] /);
  assert.equal(first.sr2, 'Không tìm thấy task T-100.');
});
