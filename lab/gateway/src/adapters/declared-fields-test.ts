import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EMPLOYEE_ID_PATTERN } from '@lab/shared';
import { z } from 'zod';
import { refuse } from '../call.js';
import { StubSystems, startFixture, type GatewayFixture } from '../fixture.js';
import { createPolicyEngine, DEFAULT_RULES_PATH } from '../policy/index.js';
import { defineTool } from '../tools/read-tools.js';
import type { ToolResult } from '../tools/types.js';
import {
  actionOfField,
  actionPhrase,
  adapterOf,
  EMPLOYEE_ACTIONS,
  EMPLOYEE_FIELDS,
  recordValue,
  recordWord,
  type ActionSpec,
  type FieldSpec,
} from './index.js';

const BADGE_FIELD: FieldSpec = { name: 'badge', label: 'Huy hiệu' };
const BADGE_ACTION: ActionSpec = {
  name: 'edit_badge',
  label: 'Sửa huy hiệu',
  phrase: 'sửa huy hiệu của nhân viên',
  fields: ['badge'],
};

const BADGE_BEFORE = 'BẠC';
const BADGE_AFTER = 'VÀNG';

/** An in-memory directory that also declares a field and an action no other file in the gateway names. */
function badgeSystems(): StubSystems {
  const systems = new StubSystems({
    employee: {
      label: 'Đồng nghiệp',
      fields: [...EMPLOYEE_FIELDS, BADGE_FIELD],
      actions: [...EMPLOYEE_ACTIONS, BADGE_ACTION],
    },
  });
  systems.employees = systems.employees.map((person) =>
    person['employee_id'] === 'NV-04' ? { ...person, badge: BADGE_BEFORE } : person,
  );
  return systems;
}

interface RuleResource {
  read: Record<string, string>;
  fields: Record<string, string[]>;
  actions: Record<string, Record<string, unknown>>;
}

/** The shipped rule file plus one cell for the action the in-memory adapter declares. */
function rulesWithBadge(version = 2): string {
  const rules = JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as {
    version: number;
    resources: Record<string, RuleResource>;
  };
  const employee = rules.resources['employee'];
  assert.ok(employee !== undefined);
  for (const role of Object.keys(employee.read)) {
    employee.fields[role] = [...(employee.fields[role] ?? []), BADGE_FIELD.name];
  }
  employee.actions[BADGE_ACTION.name] = {
    intern: { effect: 'deny', scope: 'any' },
    staff: { effect: 'deny', scope: 'any' },
    lead: { effect: 'deny', scope: 'any' },
    hr: { effect: 'allow', scope: 'any' },
  };
  rules.version = version;
  return JSON.stringify(rules);
}

/** A tool written for the new business action, the way a real system's tool is written by hand. */
const proposeBadgeChange = defineTool(
  'propose_badge_change',
  'Soạn đề xuất đổi huy hiệu của một nhân viên.',
  'propose',
  z.strictObject({
    employee_id: z.string().trim().regex(EMPLOYEE_ID_PATTERN),
    badge: z.string().trim().min(1).max(30),
  }),
  async (context, args): Promise<ToolResult> => {
    const directory = adapterOf(context.adapters, 'employee');
    const employee = await directory.get(args.employee_id);
    if (employee === undefined) {
      return { status: 200, text: `Không tìm thấy ${args.employee_id}.`, reasonCode: null, outcome: 'not_found' };
    }

    const action = actionOfField(directory.actions, BADGE_FIELD.name);
    if (action === undefined) {
      return { status: 500, text: 'Bộ tiếp hợp chưa khai hành động sửa huy hiệu.', reasonCode: null, outcome: 'error' };
    }

    const decision = context.policy.decide({
      actor: { id: context.actor.employeeId, role: context.actor.role, department: context.actor.department },
      action,
      object: { kind: directory.type, department: String(employee[directory.ownerField]), taskCount: 1 },
      context: { scope: 'read_write', caller: context.actor.identity.caller },
    });
    if (decision.effect === 'deny') {
      const result = refuse(
        decision.reasonCode === 'POLICY_UNAVAILABLE' ? 'POLICY_UNAVAILABLE' : 'NOT_PERMITTED',
        decision.ruleId,
        `Bộ luật quyền không cho ${actionPhrase(directory, action)}.`,
      );
      return { ...result, objectId: args.employee_id, policyVersion: decision.policyVersion };
    }

    const previous = String(recordValue(employee, directory.fields, BADGE_FIELD.name) ?? '');
    const proposal = context.proposals.create({
      requester: context.actor.employeeId,
      caller: context.actor.identity.caller,
      draftedByKeyId: context.actor.identity.keyId,
      tool: 'propose_badge_change',
      recordType: directory.type,
      changes: { [BADGE_FIELD.name]: args.badge },
      requiresApproval: decision.effect === 'needs_approval',
      policyVersion: decision.policyVersion ?? 0,
      items: [
        {
          system: directory.type,
          recordType: directory.type,
          recordId: args.employee_id,
          baseVersion: Number(employee['version']),
          previous: { [BADGE_FIELD.name]: previous },
          changes: { [BADGE_FIELD.name]: args.badge },
        },
      ],
    });

    return {
      status: 200,
      text:
        `Đã soạn đề xuất ${proposal.proposalId} cho ${recordWord(directory)} ${args.employee_id}. Chưa có gì được ghi.\n` +
        `Link xác nhận:\n${context.publicBaseUrl}/xac-nhan/${proposal.proposalId}`,
      reasonCode: decision.effect === 'needs_approval' ? 'NEEDS_APPROVAL' : null,
      outcome: 'ok',
      proposalId: proposal.proposalId,
      objectId: args.employee_id,
      ruleId: decision.ruleId,
      policyVersion: decision.policyVersion,
    };
  },
);

function linkId(text: string): string {
  const link = text.split('\n').find((line) => /\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a confirmation link: ${text}`);
  return link.slice(link.lastIndexOf('/') + 1);
}

async function signIn(f: GatewayFixture, employeeId: string, proposalId: string): Promise<string> {
  const response = await fetch(`${f.gateway.url}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      employee: employeeId,
      password: f.pagePasswordFor(employeeId),
      next: `/xac-nhan/${proposalId}`,
    }).toString(),
  });
  assert.equal(response.status, 303);
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDone(f: GatewayFixture, proposalId: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const commands = f.gateway.commands.listByProposal(proposalId);
    if (commands.length === 1 && commands[0]?.status === 'done') return;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for the write: ${JSON.stringify(commands)}`);
    }
    await sleep(25);
  }
}

test('declared fields: an adapter adds a field and an action, and the same path drafts, shows and writes it', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-declared-fields-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const rulesPath = join(dir, 'rules.json');
  writeFileSync(rulesPath, rulesWithBadge());

  const systems = badgeSystems();
  const f = await startFixture({ systems, rulesPath, extraTools: [proposeBadgeChange] });
  t.after(() => f.close());

  // The rule file is valid for the registry that declares `edit_badge`, and a
  // typo for the shipped registry, which proves the schema reads the registry.
  const ownEngine = createPolicyEngine({ rulesPath, declarations: systems.adapters });
  const question = {
    actor: { id: 'NV-06', role: 'hr', department: 'Vận hành' },
    action: BADGE_ACTION.name,
    object: { kind: 'employee', department: 'Vận hành', taskCount: 1 },
    context: { scope: 'read_write', caller: 'test' },
  };
  assert.equal(ownEngine.decide(question).effect, 'allow');
  const shippedEngine = createPolicyEngine({ rulesPath });
  assert.equal(shippedEngine.decide(question).reasonCode, 'POLICY_UNAVAILABLE');

  const answer = await f.call(
    'propose_badge_change',
    { employee_id: 'NV-04', badge: BADGE_AFTER },
    f.keyFor('NV-06'),
  );
  assert.equal(answer.status, 200, answer.body.text);
  assert.equal(answer.body.reason_code, null);
  const proposalId = linkId(answer.body.text);

  const stored = f.gateway.proposals.get(proposalId);
  assert.ok(stored !== undefined);
  assert.deepEqual(stored.items[0]?.previous, { badge: BADGE_BEFORE }, 'the store keeps a field it does not name');
  assert.deepEqual(stored.items[0]?.changes, { badge: BADGE_AFTER });
  assert.equal(stored.changes['badge'], BADGE_AFTER);

  // The card prints the adapter's label for a field no page file names.
  const cookie = await signIn(f, 'NV-06', proposalId);
  const card = await fetch(`${f.gateway.url}/xac-nhan/${proposalId}`, { headers: { cookie } });
  assert.equal(card.status, 200);
  const html = await card.text();
  assert.match(html, /Huy hiệu/);
  assert.match(html, /BẠC/);
  assert.match(html, /VÀNG/);
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(csrf !== undefined, 'the card carries a CSRF token');

  const sent = await fetch(`${f.gateway.url}/xac-nhan/${proposalId}/gui`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf }).toString(),
  });
  assert.equal(sent.status, 303, await sent.text());

  await waitForDone(f, proposalId);
  const written = systems.employees.find((person) => person['employee_id'] === 'NV-04');
  assert.equal(written?.['badge'], BADGE_AFTER);
  assert.equal(written?.['version'], 2);

  // The status answer says the record type the adapter declares, not a word from a table in code.
  const status = await f.call('get_request_status', { request_id: proposalId }, f.keyFor('NV-06'));
  assert.equal(status.status, 200, status.body.text);
  assert.match(status.body.text, /cho đồng nghiệp NV-04/);
  assert.match(status.body.text, /đã ghi thay đổi vào đồng nghiệp NV-04/);
});
