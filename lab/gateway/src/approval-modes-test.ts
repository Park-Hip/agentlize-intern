import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ResourceAdapter } from './adapters/index.js';
import { startFixture, type GatewayFixture } from './fixture.js';
import { APPROVER_MODES, DEFAULT_RULES_PATH, type ApproverMode } from './policy/index.js';
import { ownerDepartmentsOf, type Proposal, type ProposalExecutor } from './proposals/index.js';

const QUANG = 'NV-01';
const NHUNG = 'NV-06';
const MINH = 'NV-11';
const MAI = 'NV-12';
const BULK_TASKS = Array.from({ length: 30 }, (_, index) => `T-${100 + index}`);

interface Harness {
  readonly executed: Proposal[];
  readonly executor: ProposalExecutor;
}

function harness(): Harness {
  const executed: Proposal[] = [];
  return {
    executed,
    executor: {
      execute(proposal) {
        executed.push(proposal);
        return Promise.resolve({ state: 'received' });
      },
    },
  };
}

/** The base file with this mode on both record types the suite uses, and the actions waiting for a lead. */
function rulesFor(mode: ApproverMode): string {
  const rules = JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as {
    version: number;
    resources: Record<
      string,
      {
        approver?: string;
        actions: Record<string, Record<string, { effect?: string; scope?: string; bulk?: string }>>;
      }
    >;
  };
  rules.version = 2;
  const employee = rules.resources['employee'];
  const task = rules.resources['task'];
  if (employee !== undefined) {
    employee.approver = mode;
    const cell = employee.actions['edit_work_email']?.['hr'];
    if (cell !== undefined) {
      cell.effect = 'needs_approval';
      cell.scope = 'any';
    }
  }
  if (task !== undefined) {
    task.approver = mode;
    const lead = task.actions['change_task_assignee_or_due']?.['lead'];
    if (lead !== undefined) lead.bulk = 'needs_approval';
  }
  return JSON.stringify(rules, null, 2);
}

async function withGateway(
  mode: ApproverMode,
  run: (f: GatewayFixture, h: Harness) => Promise<void>,
): Promise<void> {
  const rulesDir = mkdtempSync(join(tmpdir(), 'lab-approval-mode-'));
  const rulesPath = join(rulesDir, 'rules.json');
  writeFileSync(rulesPath, rulesFor(mode));
  const h = harness();
  const f = await startFixture({ rulesPath, executor: h.executor });
  try {
    await run(f, h);
  } finally {
    await f.close();
    rmSync(rulesDir, { recursive: true, force: true });
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

async function login(f: GatewayFixture, employeeId: string, next: string): Promise<{ response: Response; cookie: string }> {
  const response = await fetch(`${f.gateway.url}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: employeeId, password: f.pagePasswordFor(employeeId), next }).toString(),
  });
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { response, cookie: setCookie.split(';')[0] ?? '' };
}

function csrfOf(html: string): string {
  const token = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(token !== undefined, 'the page carries a CSRF token');
  return token;
}

async function signIn(f: GatewayFixture, employeeId: string, proposalId: string): Promise<Browser> {
  const { response, cookie } = await login(f, employeeId, `/xac-nhan/${proposalId}`);
  assert.equal(response.status, 303);
  const card = await fetch(`${f.gateway.url}/xac-nhan/${proposalId}`, { headers: { cookie } });
  assert.equal(card.status, 200);
  return { cookie, csrf: csrfOf(await card.text()) };
}

async function signInForApproval(f: GatewayFixture, employeeId: string, proposalId: string): Promise<Browser> {
  const { response, cookie } = await login(f, employeeId, `/duyet/${proposalId}`);
  assert.equal(response.status, 303);
  const page = await fetch(`${f.gateway.url}/duyet/${proposalId}`, { headers: { cookie } });
  assert.equal(page.status, 200);
  const html = await page.text();
  const token =
    /name="csrf" value="([^"]+)"/.exec(html)?.[1] ??
    f.gateway.sessions.find(cookie.slice('lab_session='.length))?.csrfToken;
  assert.ok(token !== undefined, 'the page or its session carries a CSRF token');
  return { cookie, csrf: token };
}

function press(f: GatewayFixture, proposalId: string, browser: Browser): Promise<Response> {
  return fetch(`${f.gateway.url}/xac-nhan/${proposalId}/gui`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

function pressApproval(
  f: GatewayFixture,
  proposalId: string,
  button: 'duyet' | 'tu-choi',
  browser: Browser,
): Promise<Response> {
  return fetch(`${f.gateway.url}/duyet/${proposalId}/${button}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

/** Nhung asks to change the work email of Minh, who belongs to another department. */
async function waitingEmployeeProposal(f: GatewayFixture, email: string): Promise<{ id: string; text: string }> {
  const answer = await f.call('propose_employee_change', { employee_id: MINH, work_email: email }, f.keyFor(NHUNG));
  assert.equal(answer.status, 200, answer.body.text);
  assert.equal(answer.body.reason_code, 'NEEDS_APPROVAL');
  const { id } = linkOf(answer.body.text);
  const browser = await signIn(f, NHUNG, id);
  const sent = await press(f, id, browser);
  assert.equal(sent.status, 303, await sent.text());
  return { id, text: answer.body.text };
}

/** Quang asks for a thirty-task change that his own approval rule sends to a lead. */
async function waitingTaskProposal(f: GatewayFixture, actor: string): Promise<{ id: string; text: string }> {
  const answer = await f.call(
    'propose_task_change',
    { task_ids: BULK_TASKS, changes: { assignee: 'NV-04' } },
    f.keyFor(actor),
  );
  assert.equal(answer.status, 200, answer.body.text);
  assert.equal(answer.body.reason_code, 'NEEDS_APPROVAL');
  const { id } = linkOf(answer.body.text);
  const browser = await signIn(f, actor, id);
  const sent = await press(f, id, browser);
  assert.equal(sent.status, 303, await sent.text());
  return { id, text: answer.body.text };
}

test('approval mode owner_lead: the owner department comes from the adapter ownerField, and a create uses the requester department', async () => {
  const adapter: ResourceAdapter = {
    type: 'badge',
    label: 'Badge',
    idPattern: /^B-[0-9]+$/,
    fields: [],
    ownerField: 'cost_center',
    actions: [],
    get: (id) => Promise.resolve(id === 'B-1' ? { id, cost_center: 'Kinh doanh' } : undefined),
    list: () => Promise.resolve([]),
    apply: () => Promise.resolve({ kind: 'not_found' } as const),
  };

  const update = await ownerDepartmentsOf(
    [adapter],
    {
      recordType: 'badge',
      items: [
        { position: 1, system: 'badge', recordType: 'badge', recordId: 'B-1', baseVersion: 1, kind: 'update', previous: {}, changes: {} },
      ],
    },
    'Vận hành',
  );
  assert.deepEqual(update, ['Kinh doanh'], 'the field is cost_center, not a hard-coded department');

  const create = await ownerDepartmentsOf(
    [adapter],
    {
      recordType: 'badge',
      items: [
        { position: 1, system: 'badge', recordType: 'badge', recordId: '', baseVersion: 0, kind: 'create', previous: {}, changes: {} },
      ],
    },
    'Vận hành',
  );
  assert.deepEqual(create, ['Vận hành'], 'a create has no record yet, so the requester department answers');
});

for (const mode of APPROVER_MODES) {
  test(`approval mode ${mode}: the right lead approves, self approval is blocked, and a moved lead loses the proposal`, async () => {
    await withGateway(mode, async (f, h) => {
      const right = mode === 'requester_lead'
        ? { id: QUANG, name: 'Trần Văn Quang' }
        : { id: MAI, name: 'Hồ Thanh Mai' };
      const wrong = right.id === QUANG ? MAI : QUANG;

      // Who may approve: a cross-department email change names the right lead and only that lead sees it.
      const email = await waitingEmployeeProposal(f, 'minh.moi1@lab.example');
      assert.match(email.text, new RegExp(right.name), 'the propose answer names the lead the rule file picks');
      assert.doesNotMatch(email.text, new RegExp(right.id === QUANG ? 'Hồ Thanh Mai' : 'Trần Văn Quang'));

      const rightLogin = await login(f, right.id, '/cho-duyet');
      const rightInbox = await fetch(`${f.gateway.url}/cho-duyet`, { headers: { cookie: rightLogin.cookie } });
      assert.equal(rightInbox.status, 200);
      const rightHtml = await rightInbox.text();
      assert.ok(rightHtml.includes(email.id), 'the right lead sees the proposal');
      assert.ok(rightHtml.includes('NV-06 Phạm Thị Nhung'), 'and who asked');

      const wrongLogin = await login(f, wrong, '/cho-duyet');
      const wrongInbox = await fetch(`${f.gateway.url}/cho-duyet`, { headers: { cookie: wrongLogin.cookie } });
      assert.equal(wrongInbox.status, 200);
      assert.ok(!(await wrongInbox.text()).includes(email.id), 'the other department lead does not see it');

      const wrongPage = await fetch(`${f.gateway.url}/duyet/${email.id}`, { headers: { cookie: wrongLogin.cookie } });
      assert.equal(wrongPage.status, 403);

      const rightBrowser = await signInForApproval(f, right.id, email.id);
      const approved = await pressApproval(f, email.id, 'duyet', rightBrowser);
      assert.equal(approved.status, 303, await approved.text());
      assert.equal(f.gateway.proposals.get(email.id)?.status, 'confirmed');
      assert.equal(f.gateway.proposals.get(email.id)?.approval?.actor, right.id);
      assert.equal(f.gateway.commands.listByProposal(email.id).length, 1);
      assert.equal(h.executed.length, 1, 'the page only wakes the executor');

      // Self approval: the requester is a lead of the department that owns the tasks, in both modes.
      const self = await waitingTaskProposal(f, QUANG);
      const quangLogin = await login(f, QUANG, '/cho-duyet');
      const selfPage = await fetch(`${f.gateway.url}/duyet/${self.id}`, { headers: { cookie: quangLogin.cookie } });
      assert.equal(selfPage.status, 200);
      const selfHtml = await selfPage.text();
      assert.match(selfHtml, /Bạn là người yêu cầu nên không tự duyệt được/);
      assert.doesNotMatch(selfHtml, /<button/);

      const quangCsrf = f.gateway.sessions.find(quangLogin.cookie.slice('lab_session='.length))?.csrfToken ?? '';
      assert.ok(quangCsrf !== '');
      const refused = await pressApproval(f, self.id, 'duyet', { cookie: quangLogin.cookie, csrf: quangCsrf });
      assert.equal(refused.status, 403);
      assert.match(await refused.text(), /\[SELF_APPROVAL\]/);
      assert.equal(f.gateway.proposals.get(self.id)?.status, 'awaiting_approval');
      assert.equal(f.gateway.commands.listByProposal(self.id).length, 0);

      // A moved lead: the same person is no longer in the department the rule file names.
      const moved = await waitingEmployeeProposal(f, 'minh.moi2@lab.example');
      const movedBrowser = await signInForApproval(f, right.id, moved.id);
      const movedTo = right.id === QUANG ? 'Kinh doanh' : 'Vận hành';
      f.systems.employees = f.systems.employees.map((person) =>
        String(person['employee_id']) === right.id ? { ...person, department: movedTo } : person,
      );
      const afterMove = await fetch(`${f.gateway.url}/duyet/${moved.id}`, { headers: { cookie: movedBrowser.cookie } });
      assert.equal(afterMove.status, 403);
      const afterMovePress = await pressApproval(f, moved.id, 'duyet', movedBrowser);
      assert.equal(afterMovePress.status, 403);
      assert.match(await afterMovePress.text(), /\[NOT_PERMITTED\]/);
      assert.equal(f.gateway.proposals.get(moved.id)?.status, 'awaiting_approval');
      assert.equal(f.gateway.commands.listByProposal(moved.id).length, 0);
    });
  });
}
