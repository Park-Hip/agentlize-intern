import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPolicyEngine, DEFAULT_RULES_PATH, RULE_IDS } from './index.js';
import type { PolicyEffect, PolicyEngine } from './index.js';

/*
 * The expected table below is typed from PRD section 3.2, not read from
 * rules.json, so a wrong cell in the file fails a test.
 */

type Role = 'intern' | 'staff' | 'lead' | 'hr';

const ROLES: readonly Role[] = ['intern', 'staff', 'lead', 'hr'];

const OWN_DEPARTMENT = 'operations';
const OTHER_DEPARTMENT = 'sales';

interface Column {
  readonly name: string;
  readonly action: string;
  readonly object: Record<string, unknown>;
  readonly expected: Record<Role, PolicyEffect>;
}

const COLUMNS: readonly Column[] = [
  {
    name: 'read work email',
    action: 'read_employee_field',
    object: { kind: 'employee', field: 'work_email' },
    expected: { intern: 'allow', staff: 'allow', lead: 'allow', hr: 'allow' },
  },
  {
    name: 'read personal phone',
    action: 'read_employee_field',
    object: { kind: 'employee', field: 'personal_phone' },
    expected: { intern: 'deny', staff: 'deny', lead: 'deny', hr: 'allow' },
  },
  {
    name: 'read home address',
    action: 'read_employee_field',
    object: { kind: 'employee', field: 'home_address' },
    expected: { intern: 'deny', staff: 'deny', lead: 'deny', hr: 'allow' },
  },
  {
    name: 'edit own-department task description',
    action: 'edit_task_description',
    object: { kind: 'task', department: OWN_DEPARTMENT, taskCount: 1 },
    expected: { intern: 'allow', staff: 'allow', lead: 'allow', hr: 'allow' },
  },
  {
    name: 'change own-department task status',
    action: 'change_task_status',
    object: { kind: 'task', department: OWN_DEPARTMENT, taskCount: 1 },
    expected: { intern: 'allow', staff: 'allow', lead: 'allow', hr: 'allow' },
  },
  {
    name: 'change assignee or due date of own-department task',
    action: 'change_task_assignee_or_due',
    object: { kind: 'task', department: OWN_DEPARTMENT, taskCount: 1 },
    expected: { intern: 'deny', staff: 'allow', lead: 'allow', hr: 'allow' },
  },
  {
    name: 'bulk change',
    action: 'bulk_change',
    object: { kind: 'task', department: OWN_DEPARTMENT, taskCount: 30 },
    expected: { intern: 'deny', staff: 'needs_approval', lead: 'allow', hr: 'needs_approval' },
  },
  {
    name: 'edit other-department task',
    action: 'edit_other_department_task',
    object: { kind: 'task', department: OTHER_DEPARTMENT, taskCount: 1 },
    expected: { intern: 'deny', staff: 'deny', lead: 'deny', hr: 'deny' },
  },
  {
    name: 'edit directory',
    action: 'edit_directory',
    object: { kind: 'employee' },
    expected: { intern: 'deny', staff: 'deny', lead: 'deny', hr: 'allow' },
  },
];

const REASON_OF: Record<PolicyEffect, string> = {
  allow: 'ALLOWED',
  needs_approval: 'NEEDS_APPROVAL',
  deny: 'NOT_PERMITTED',
};

function actorOf(role: string): Record<string, unknown> {
  return { id: `NV-${role}`, role, department: OWN_DEPARTMENT };
}

function inputOf(
  role: string,
  action: string,
  object: Record<string, unknown>,
  context: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    actor: actorOf(role),
    action,
    object,
    context: { scope: 'read_write', caller: 'tho-than-desktop', ...context },
  };
}

function ownTask(taskCount: number): Record<string, unknown> {
  return { kind: 'task', department: OWN_DEPARTMENT, taskCount };
}

const shipped = createPolicyEngine();

/** A temporary rule file that a test can break and repair. */
function withRulesFile(body: (path: string, engine: PolicyEngine) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'lab-policy-'));
  try {
    const path = join(dir, 'rules.json');
    writeFileSync(path, readFileSync(DEFAULT_RULES_PATH, 'utf8'));
    body(path, createPolicyEngine({ rulesPath: path }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function shippedRules(): Record<string, unknown> {
  return JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as Record<string, unknown>;
}

// 4 roles x 9 columns: the 7 columns of PRD 3.2 (the read column split into email, phone and address)
// plus the status column.
for (const column of COLUMNS) {
  for (const role of ROLES) {
    const expected = column.expected[role];
    test(`policy table: ${role} / ${column.name} -> ${expected}`, () => {
      const decision = shipped.decide(inputOf(role, column.action, column.object));
      assert.equal(decision.effect, expected);
      assert.equal(decision.reasonCode, REASON_OF[expected]);
      assert.equal(decision.policyVersion, 1);
      assert.ok(decision.ruleId.length > 0);
    });
  }
}

test('policy table: 7 PRD columns plus status, 4 roles each', () => {
  // Reading phone and address are two probes of one PRD column, so 9 probes cover 8 columns.
  assert.equal(COLUMNS.length, 9);
  assert.equal(ROLES.length * COLUMNS.length, 36);
  const probes = new Set(COLUMNS.map((column) => `${column.action}:${String(column.object.field ?? '')}`));
  assert.equal(probes.size, COLUMNS.length);
});

test('policy table: the rule id names the cell that decided', () => {
  assert.equal(shipped.decide(inputOf('intern', 'change_task_assignee_or_due', ownTask(1))).ruleId, 'intern.change_task_assignee_or_due');
  assert.equal(shipped.decide(inputOf('hr', 'edit_directory', { kind: 'employee' })).ruleId, 'hr.edit_directory');
  assert.equal(shipped.decide(inputOf('hr', 'read_employee_field', { kind: 'employee', field: 'home_address' })).ruleId, 'employee_fields.hr');
});

test('policy combine: a task of another department needs the other-department cell, whatever the action', () => {
  for (const role of ROLES) {
    for (const action of ['edit_task_description', 'change_task_status', 'change_task_assignee_or_due']) {
      const decision = shipped.decide(inputOf(role, action, { kind: 'task', department: OTHER_DEPARTMENT, taskCount: 1 }));
      assert.equal(decision.effect, 'deny', `${role} ${action}`);
      assert.equal(decision.reasonCode, 'NOT_PERMITTED');
      // The first rule of the strictest effect is reported: the action's own cell, then the other-department cell.
      assert.equal(decision.ruleId.startsWith(`${role}.`), true);
    }
  }
});

test('policy combine: five tasks is bulk, four is not', () => {
  const four = shipped.decide(inputOf('staff', 'change_task_assignee_or_due', ownTask(4)));
  assert.equal(four.effect, 'allow');
  const five = shipped.decide(inputOf('staff', 'change_task_assignee_or_due', ownTask(5)));
  assert.equal(five.effect, 'needs_approval');
  assert.equal(five.reasonCode, 'NEEDS_APPROVAL');
  assert.equal(five.ruleId, 'staff.bulk_change');
  assert.equal(shipped.decide(inputOf('lead', 'change_task_assignee_or_due', ownTask(30))).effect, 'allow');
});

test('policy combine: bulk also stops an intern from editing five descriptions', () => {
  assert.equal(shipped.decide(inputOf('intern', 'edit_task_description', ownTask(4))).effect, 'allow');
  assert.equal(shipped.decide(inputOf('intern', 'edit_task_description', ownTask(5))).effect, 'deny');
});

test('policy combine: "no" beats "needs approval", "needs approval" beats "yes"', () => {
  // hr: bulk needs approval, other department is no -> no.
  const crossDepartment = shipped.decide(inputOf('hr', 'bulk_change', { kind: 'task', department: OTHER_DEPARTMENT, taskCount: 30 }));
  assert.equal(crossDepartment.effect, 'deny');
  assert.equal(crossDepartment.ruleId, 'hr.edit_other_department_task');
  // staff: assignee is yes, bulk needs approval -> needs approval.
  assert.equal(shipped.decide(inputOf('staff', 'change_task_assignee_or_due', ownTask(30))).effect, 'needs_approval');
  // intern: assignee is no, bulk is no -> no, reported on the first rule in order.
  assert.equal(shipped.decide(inputOf('intern', 'change_task_assignee_or_due', ownTask(30))).ruleId, 'intern.change_task_assignee_or_due');
});

test('policy default: unknown action, unknown role and unknown field are refused', () => {
  const unknownAction = shipped.decide(inputOf('lead', 'delete_everything', ownTask(1)));
  assert.equal(unknownAction.effect, 'deny');
  assert.equal(unknownAction.reasonCode, 'NOT_PERMITTED');
  assert.equal(unknownAction.ruleId, RULE_IDS.actionUnknown);

  for (const role of ['guest', '', 'constructor', '__proto__', 'LEAD']) {
    const decision = shipped.decide(inputOf(role, 'read_employee_field', { kind: 'employee', field: 'work_email' }));
    assert.equal(decision.effect, 'deny', `role "${role}"`);
    assert.equal(decision.reasonCode === 'NOT_PERMITTED' || decision.reasonCode === 'POLICY_UNAVAILABLE', true);
  }
  assert.equal(shipped.decide(inputOf('guest', 'read_employee_field', { kind: 'employee', field: 'work_email' })).ruleId, RULE_IDS.roleUnknown);
});

test('policy default: a field that is not listed is never returned, even a field added to the directory later', () => {
  for (const role of ROLES) {
    for (const field of ['salary', 'national_id', 'Work_Email', 'work_email ', '']) {
      const decision = shipped.decide(inputOf(role, 'read_employee_field', { kind: 'employee', field }));
      assert.equal(decision.effect, 'deny', `${role} ${JSON.stringify(field)}`);
    }
  }
});

test('policy default: a malformed question is refused, not guessed', () => {
  const valid = inputOf('lead', 'edit_task_description', ownTask(1));
  const broken: unknown[] = [
    null,
    undefined,
    'edit_task_description',
    {},
    { ...valid, actor: undefined },
    { ...valid, object: undefined },
    { ...valid, context: undefined },
    { ...valid, context: { scope: 'admin', caller: 'x' } },
    { ...valid, context: { caller: 'x' } },
    { ...valid, object: ownTask(-1) },
    { ...valid, object: ownTask(1.5) },
    { ...valid, object: { kind: 'task', taskCount: 1 } },
    { ...valid, object: { kind: 'employee' } },
    { ...valid, extra: true },
  ];
  for (const input of broken) {
    const decision = shipped.decide(input);
    assert.equal(decision.effect, 'deny', JSON.stringify(input));
    assert.equal(decision.reasonCode === 'NOT_PERMITTED', true, JSON.stringify(input));
    assert.equal(decision.policyVersion, 1);
  }
  assert.equal(shipped.decide(null).ruleId, RULE_IDS.inputInvalid);
  assert.equal(shipped.decide(inputOf('lead', 'edit_directory', ownTask(1))).ruleId, RULE_IDS.objectInvalid);
  assert.equal(shipped.decide(inputOf('lead', 'read_employee_field', { kind: 'employee' })).ruleId, RULE_IDS.objectInvalid);
});

test('policy scope: a read_only key turns every write action into NOT_PERMITTED, for every role', () => {
  const writeColumns = COLUMNS.filter((column) => column.action !== 'read_employee_field');
  for (const column of writeColumns) {
    for (const role of ROLES) {
      const decision = shipped.decide(inputOf(role, column.action, column.object, { scope: 'read_only' }));
      assert.equal(decision.effect, 'deny', `${role} ${column.name}`);
      assert.equal(decision.reasonCode, 'NOT_PERMITTED');
      assert.equal(decision.ruleId, RULE_IDS.scopeReadOnly);
    }
  }
});

test('policy scope: a read_only key still reads what the role may read, and nothing more', () => {
  const email = inputOf('hr', 'read_employee_field', { kind: 'employee', field: 'work_email' }, { scope: 'read_only' });
  assert.equal(shipped.decide(email).effect, 'allow');
  const phone = inputOf('lead', 'read_employee_field', { kind: 'employee', field: 'personal_phone' }, { scope: 'read_only' });
  assert.equal(shipped.decide(phone).effect, 'deny');
});

test('policy scope: the caller carries no rights of its own', () => {
  for (const caller of ['tho-than-desktop', 'tho-than-web', 'function-calling-assistant', 'unknown-caller']) {
    const decision = shipped.decide(inputOf('intern', 'change_task_assignee_or_due', ownTask(1), { caller }));
    assert.equal(decision.effect, 'deny', caller);
    assert.equal(shipped.decide(inputOf('staff', 'change_task_assignee_or_due', ownTask(1), { caller })).effect, 'allow', caller);
  }
});

test('policy fields: every role sees id, name, department, role and work email; only hr sees phone and address', () => {
  const common = ['id', 'name', 'department', 'role', 'work_email'];
  for (const role of ROLES) {
    const result = shipped.allowedFields(role);
    assert.equal(result.effect, 'allow');
    assert.equal(result.policyVersion, 1);
    const expected = role === 'hr' ? [...common, 'personal_phone', 'home_address'] : common;
    assert.deepEqual([...result.fields].sort(), [...expected].sort(), role);
  }
});

test('policy fields: an unknown role gets no field at all', () => {
  for (const role of ['guest', '', 'constructor', '__proto__']) {
    const result = shipped.allowedFields(role);
    assert.equal(result.effect, 'deny');
    assert.deepEqual(result.fields, []);
  }
});

test('policy fields: the list handed out cannot be used to change the rules', () => {
  const first = shipped.allowedFields('intern');
  (first.fields as string[]).push('personal_phone');
  assert.equal(shipped.allowedFields('intern').fields.includes('personal_phone'), false);
});

test('policy unavailable: a missing file refuses everything', () => {
  const engine = createPolicyEngine({ rulesPath: join(tmpdir(), 'lab-policy-does-not-exist', 'rules.json') });
  const decision = engine.decide(inputOf('lead', 'read_employee_field', { kind: 'employee', field: 'work_email' }));
  assert.equal(decision.effect, 'deny');
  assert.equal(decision.reasonCode, 'POLICY_UNAVAILABLE');
  assert.equal(decision.ruleId, RULE_IDS.unavailable);
  assert.equal(decision.policyVersion, null);
  const fields = engine.allowedFields('lead');
  assert.equal(fields.reasonCode, 'POLICY_UNAVAILABLE');
  assert.deepEqual(fields.fields, []);
});

test('policy unavailable: broken JSON, wrong structure and wrong values refuse everything', () => {
  const rules = shippedRules();
  const roles = rules.roles as Record<string, Record<string, unknown>>;
  const withoutCell = structuredClone(roles);
  delete (withoutCell.lead as Record<string, unknown>).bulk_change;
  const withExtraAction = structuredClone(roles);
  (withExtraAction.lead as Record<string, unknown>).delete_everything = 'allow';
  const withBadEffect = structuredClone(roles);
  (withBadEffect.lead as Record<string, unknown>).bulk_change = 'maybe';
  const { employee_fields: fieldLists, ...withoutFields } = rules;

  const broken: Record<string, string> = {
    'empty file': '',
    'not JSON': '{ "version": 1, ',
    'JSON null': 'null',
    'JSON array': '[]',
    'no version': JSON.stringify({ ...rules, version: undefined }),
    'version as text': JSON.stringify({ ...rules, version: '1' }),
    'version zero': JSON.stringify({ ...rules, version: 0 }),
    'bulk threshold missing': JSON.stringify({ ...rules, bulk_threshold: undefined }),
    'bulk threshold zero': JSON.stringify({ ...rules, bulk_threshold: 0 }),
    'cell missing': JSON.stringify({ ...rules, roles: withoutCell }),
    'cell for an unknown action': JSON.stringify({ ...rules, roles: withExtraAction }),
    'cell with an unknown effect': JSON.stringify({ ...rules, roles: withBadEffect }),
    'no roles': JSON.stringify({ ...rules, roles: {} }),
    'field lists missing': JSON.stringify(withoutFields),
    'field list for a role that does not exist': JSON.stringify({ ...rules, employee_fields: { ...(fieldLists as object), ghost: ['id'] } }),
    'role without a field list': JSON.stringify({ ...rules, employee_fields: { intern: ['id'] } }),
    'unknown top-level key': JSON.stringify({ ...rules, note: 'x' }),
  };

  const input = inputOf('lead', 'edit_task_description', ownTask(1));
  withRulesFile((path, engine) => {
    for (const [name, text] of Object.entries(broken)) {
      writeFileSync(path, text);
      const decision = engine.decide(input);
      assert.equal(decision.effect, 'deny', name);
      assert.equal(decision.reasonCode, 'POLICY_UNAVAILABLE', name);
      assert.equal(decision.policyVersion, null, name);
      assert.equal(engine.allowedFields('lead').reasonCode, 'POLICY_UNAVAILABLE', name);
    }
  });
});

test('policy unavailable: a file saved with a byte order mark is still read', () => {
  withRulesFile((path, engine) => {
    writeFileSync(path, '﻿' + readFileSync(DEFAULT_RULES_PATH, 'utf8'));
    assert.equal(engine.decide(inputOf('lead', 'edit_task_description', ownTask(1))).effect, 'allow');
  });
});

test('policy unavailable: a module that throws refuses instead of throwing', () => {
  const readFails = createPolicyEngine({
    readFile: () => {
      throw new Error('disk on fire');
    },
  });
  const decision = readFails.decide(inputOf('lead', 'edit_task_description', ownTask(1)));
  assert.equal(decision.reasonCode, 'POLICY_UNAVAILABLE');
  assert.equal(readFails.allowedFields('lead').reasonCode, 'POLICY_UNAVAILABLE');

  const hostile = {
    get actor(): never {
      throw new Error('getter exploded');
    },
  };
  const hostileDecision = shipped.decide(hostile);
  assert.equal(hostileDecision.effect, 'deny');
  assert.equal(hostileDecision.reasonCode, 'POLICY_UNAVAILABLE');
});

test('policy unavailable: the file is read again at every decision', () => {
  withRulesFile((path, engine) => {
    const input = inputOf('lead', 'edit_task_description', ownTask(1));
    assert.equal(engine.decide(input).effect, 'allow');

    const original = readFileSync(path, 'utf8');
    writeFileSync(path, '{ broken');
    assert.equal(engine.decide(input).reasonCode, 'POLICY_UNAVAILABLE');

    writeFileSync(path, original);
    assert.equal(engine.decide(input).effect, 'allow');

    const changed = shippedRules();
    changed.version = 2;
    (changed.roles as Record<string, Record<string, string>>).lead!.edit_task_description = 'deny';
    writeFileSync(path, JSON.stringify(changed));
    const afterChange = engine.decide(input);
    assert.equal(afterChange.effect, 'deny');
    assert.equal(afterChange.policyVersion, 2);

    rmSync(path);
    assert.equal(engine.decide(input).reasonCode, 'POLICY_UNAVAILABLE');
  });
});

test('policy rules file: the shipped file is valid, versioned and has the PRD threshold', () => {
  const rules = shippedRules();
  assert.equal(rules.version, 1);
  assert.equal(rules.bulk_threshold, 5);
  assert.deepEqual(Object.keys(rules.roles as object).sort(), [...ROLES].sort());
});
