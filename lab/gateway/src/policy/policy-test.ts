import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EMPLOYEE_CHANGEABLE, TASK_CHANGEABLE } from '../adapters/index.js';
import { createPolicyEngine, DEFAULT_RULES_PATH, RESOURCE_ACTIONS, RULE_IDS } from './index.js';
import type { PolicyEffect, PolicyEngine, PersonRef } from './index.js';

/*
 * The expected matrices below are typed from PRD section 3.2, not read from
 * rules.json, so a wrong cell in the file fails a test. Every role of every
 * record type is covered.
 */

type Role = 'intern' | 'staff' | 'lead' | 'hr';
type TaskAction = 'edit_task_description' | 'change_task_status' | 'change_task_assignee_or_due';
type EmployeeAction = 'edit_work_email';

const ROLES: readonly Role[] = ['intern', 'staff', 'lead', 'hr'];

const OWN_DEPARTMENT = 'operations';
const OTHER_DEPARTMENT = 'sales';

interface CellExpectation {
  readonly effect: PolicyEffect;
  readonly bulk: PolicyEffect;
  readonly scope: 'own_department' | 'any';
}

const TASK_MATRIX: Readonly<Record<TaskAction, Readonly<Record<Role, CellExpectation>>>> = {
  edit_task_description: {
    intern: { effect: 'allow', bulk: 'deny', scope: 'own_department' },
    staff: { effect: 'allow', bulk: 'needs_approval', scope: 'own_department' },
    lead: { effect: 'allow', bulk: 'allow', scope: 'own_department' },
    hr: { effect: 'allow', bulk: 'needs_approval', scope: 'own_department' },
  },
  change_task_status: {
    intern: { effect: 'allow', bulk: 'deny', scope: 'own_department' },
    staff: { effect: 'allow', bulk: 'needs_approval', scope: 'own_department' },
    lead: { effect: 'allow', bulk: 'allow', scope: 'own_department' },
    hr: { effect: 'allow', bulk: 'needs_approval', scope: 'own_department' },
  },
  change_task_assignee_or_due: {
    intern: { effect: 'deny', bulk: 'deny', scope: 'own_department' },
    staff: { effect: 'allow', bulk: 'needs_approval', scope: 'own_department' },
    lead: { effect: 'allow', bulk: 'allow', scope: 'own_department' },
    hr: { effect: 'allow', bulk: 'needs_approval', scope: 'own_department' },
  },
};

const EMPLOYEE_MATRIX: Readonly<Record<EmployeeAction, Readonly<Record<Role, CellExpectation>>>> = {
  edit_work_email: {
    intern: { effect: 'deny', bulk: 'deny', scope: 'any' },
    staff: { effect: 'deny', bulk: 'deny', scope: 'any' },
    lead: { effect: 'deny', bulk: 'deny', scope: 'any' },
    hr: { effect: 'allow', bulk: 'allow', scope: 'any' },
  },
};

const REASON_OF: Record<PolicyEffect, string> = {
  allow: 'ALLOWED',
  needs_approval: 'NEEDS_APPROVAL',
  deny: 'NOT_PERMITTED',
};

interface RulesJson {
  schema?: number;
  version?: number;
  approval?: {
    approver_roles?: string[];
    same_department?: boolean;
    wait_minutes?: number;
  };
  cumulative_window_minutes?: number;
  resources?: Record<string, ResourceJson>;
}

interface ResourceJson {
  bulk_threshold?: number;
  read?: Record<string, string>;
  fields?: Record<string, string[]>;
  actions?: Record<string, Record<string, { effect?: string; scope?: string; bulk?: string }>>;
}

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

function ownEmployee(): Record<string, unknown> {
  return { kind: 'employee', department: OWN_DEPARTMENT };
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

function shippedRules(): RulesJson {
  return JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as RulesJson;
}

function writeRules(path: string, rules: RulesJson): void {
  writeFileSync(path, JSON.stringify(rules, null, 2));
}

// 4 roles x 3 task actions: the cell itself, the bulk threshold and a record of another department.
for (const action of Object.keys(TASK_MATRIX) as TaskAction[]) {
  for (const role of ROLES) {
    const expected = TASK_MATRIX[action][role];

    test(`policy table: task ${action} / ${role} at one record -> ${expected.effect}`, () => {
      const decision = shipped.decide(inputOf(role, action, ownTask(1)));
      assert.equal(decision.effect, expected.effect);
      assert.equal(decision.reasonCode, REASON_OF[expected.effect]);
      assert.equal(decision.ruleId, `task.${action}.${role}`);
      assert.equal(decision.policyVersion, 1);
    });

    test(`policy table: task ${action} / ${role} at five records -> ${expected.bulk}`, () => {
      const decision = shipped.decide(inputOf(role, action, ownTask(5)));
      assert.equal(decision.effect, expected.bulk);
      assert.equal(decision.reasonCode, REASON_OF[expected.bulk]);
      const bulkRule = `task.${action}.${role}.bulk`;
      assert.equal(decision.ruleId, expected.bulk === expected.effect ? `task.${action}.${role}` : bulkRule);
    });

    test(`policy table: task ${action} / ${role} on another department -> deny`, () => {
      const decision = shipped.decide(inputOf(role, action, { kind: 'task', department: OTHER_DEPARTMENT, taskCount: 1 }));
      assert.equal(decision.effect, 'deny');
      assert.equal(decision.reasonCode, 'NOT_PERMITTED');
      assert.equal(decision.ruleId, `task.${action}.${role}.scope`);
    });
  }
}

// 4 roles x 1 employee action: the cell itself, the bulk threshold and a record of another department.
for (const role of ROLES) {
  const expected = EMPLOYEE_MATRIX.edit_work_email[role];

  test(`policy table: employee edit_work_email / ${role} -> ${expected.effect}`, () => {
    const decision = shipped.decide(inputOf(role, 'edit_work_email', ownEmployee()));
    assert.equal(decision.effect, expected.effect);
    assert.equal(decision.reasonCode, REASON_OF[expected.effect]);
    assert.equal(decision.ruleId, `employee.edit_work_email.${role}`);
  });

  test(`policy table: employee edit_work_email / ${role} on another department -> ${expected.effect}`, () => {
    const decision = shipped.decide(inputOf(role, 'edit_work_email', { kind: 'employee', department: OTHER_DEPARTMENT }));
    assert.equal(decision.effect, expected.effect);
    assert.equal(decision.ruleId, `employee.edit_work_email.${role}`);
  });

  test(`policy table: employee edit_work_email / ${role} at five records -> ${expected.bulk}`, () => {
    const decision = shipped.decide(inputOf(role, 'edit_work_email', { kind: 'employee', department: OWN_DEPARTMENT, taskCount: 5 }));
    assert.equal(decision.effect, expected.bulk);
    assert.equal(decision.ruleId, `employee.edit_work_email.${role}`);
  });
}

test('policy file: every cell of both record types is declared and matches the table', () => {
  const rules = shippedRules();
  const resources = rules.resources ?? {};
  assert.deepEqual(Object.keys(resources).sort(), ['employee', 'task']);

  for (const [type, matrix] of Object.entries({ task: TASK_MATRIX, employee: EMPLOYEE_MATRIX })) {
    const actions = resources[type]?.actions ?? {};
    assert.deepEqual(Object.keys(actions).sort(), Object.keys(matrix).sort(), type);
    for (const [action, expectations] of Object.entries(matrix)) {
      const cells = actions[action] ?? {};
      assert.deepEqual(Object.keys(cells).sort(), [...ROLES].sort(), `${type}.${action}`);
      for (const role of ROLES) {
        const cell = cells[role];
        const expected = expectations[role];
        assert.ok(cell !== undefined, `${type}.${action}.${role}`);
        assert.equal(cell.effect, expected.effect, `${type}.${action}.${role}.effect`);
        assert.equal(cell.scope, expected.scope, `${type}.${action}.${role}.scope`);
        assert.equal(cell.bulk ?? expected.effect, expected.bulk, `${type}.${action}.${role}.bulk`);
      }
    }
  }
});

test('policy file: the file declares read scope and fields for every role of every record type', () => {
  const rules = shippedRules();
  for (const [type, resource] of Object.entries(rules.resources ?? {})) {
    assert.deepEqual(Object.keys(resource.read ?? {}).sort(), [...ROLES].sort(), `${type}.read`);
    assert.deepEqual(Object.keys(resource.fields ?? {}).sort(), [...ROLES].sort(), `${type}.fields`);
  }
  const task = rules.resources?.['task'];
  const employee = rules.resources?.['employee'];
  for (const role of ROLES) {
    assert.equal(task?.read?.[role], 'own_department', `task read ${role}`);
    assert.equal(employee?.read?.[role], 'any', `employee read ${role}`);
    assert.deepEqual(task?.fields?.[role], ['id', 'title', 'description', 'department', 'assignee', 'status', 'due']);
  }
});

test('policy vocabulary: the schema actions are the actions the adapters declare', () => {
  assert.deepEqual([...new Set(Object.values(TASK_CHANGEABLE))].sort(), [...RESOURCE_ACTIONS.task].sort());
  assert.deepEqual([...new Set(Object.values(EMPLOYEE_CHANGEABLE))].sort(), [...RESOURCE_ACTIONS.employee].sort());
});

test('policy read: task reads are own department, employee reads are any department', () => {
  for (const role of ROLES) {
    const task = shipped.readScope(role, 'task');
    assert.equal(task.effect, 'allow');
    assert.equal(task.scope, 'own_department');
    assert.equal(task.ruleId, `task.read.${role}`);
    assert.equal(task.reasonCode, 'ALLOWED');

    const employee = shipped.readScope(role, 'employee');
    assert.equal(employee.effect, 'allow');
    assert.equal(employee.scope, 'any');
    assert.equal(employee.ruleId, `employee.read.${role}`);
  }
});

test('policy read: a record type the file does not declare is refused with .undeclared', () => {
  const decision = shipped.readScope('staff', 'invoice');
  assert.equal(decision.effect, 'deny');
  assert.equal(decision.reasonCode, 'NOT_PERMITTED');
  assert.equal(decision.ruleId, 'invoice.read.staff.undeclared');
  assert.equal(decision.scope, null);
});

test('policy fields: every role sees id, name, department, role and work email; only hr sees phone and address', () => {
  const common = ['id', 'name', 'department', 'role', 'work_email'];
  for (const role of ROLES) {
    const result = shipped.allowedFields(role);
    assert.equal(result.effect, 'allow');
    assert.equal(result.policyVersion, 1);
    assert.equal(result.ruleId, `employee.fields.${role}`);
    const expected = role === 'hr' ? [...common, 'personal_phone', 'home_address'] : common;
    assert.deepEqual([...result.fields].sort(), [...expected].sort(), role);
  }
});

test('policy fields: task fields use only the fields the rule file declares', () => {
  for (const role of ROLES) {
    const result = shipped.allowedFields(role, 'task');
    assert.equal(result.effect, 'allow');
    assert.equal(result.ruleId, `task.fields.${role}`);
    assert.deepEqual([...result.fields].sort(), ['assignee', 'department', 'description', 'due', 'id', 'status', 'title']);
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

test('policy approval: the file lists the roles, the department rule and the wait time, and returns eligible people', () => {
  const people: readonly PersonRef[] = [
    { id: 'NV-01', name: 'Quang', role: 'lead', department: OWN_DEPARTMENT },
    { id: 'NV-11', name: 'Hạnh', role: 'lead', department: OTHER_DEPARTMENT },
    { id: 'NV-06', name: 'Nhung', role: 'hr', department: OWN_DEPARTMENT },
  ];
  const decision = shipped.approversFor({ department: OWN_DEPARTMENT }, people);
  assert.equal(decision.effect, 'allow');
  assert.equal(decision.ruleId, 'approval');
  assert.deepEqual(decision.approverRoles, ['lead']);
  assert.equal(decision.sameDepartment, true);
  assert.equal(decision.waitMinutes, 120);
  assert.deepEqual(decision.approvers.map((person) => person.id), ['NV-01']);

  withRulesFile((path, engine) => {
    const rules = shippedRules();
    if (rules.approval !== undefined) {
      rules.approval.same_department = false;
      rules.approval.approver_roles = ['lead', 'hr'];
    }
    writeRules(path, rules);
    const open = engine.approversFor({ department: OWN_DEPARTMENT }, people);
    assert.deepEqual(open.approvers.map((person) => person.id), ['NV-01', 'NV-11', 'NV-06']);
  });
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
  assert.equal(shipped.decide(inputOf('lead', 'edit_work_email', ownTask(1))).ruleId, RULE_IDS.objectInvalid);
  assert.equal(shipped.decide(inputOf('lead', 'read_employee_field', { kind: 'employee' })).ruleId, RULE_IDS.objectInvalid);
  assert.equal(shipped.decide(inputOf('lead', 'edit_work_email', { kind: 'invoice' })).ruleId, RULE_IDS.objectInvalid);
});

test('policy scope: a read_only key turns every write cell into NOT_PERMITTED, for every role', () => {
  for (const role of ROLES) {
    for (const action of Object.keys(TASK_MATRIX) as TaskAction[]) {
      const decision = shipped.decide(inputOf(role, action, ownTask(1), { scope: 'read_only' }));
      assert.equal(decision.effect, 'deny', `${role} ${action}`);
      assert.equal(decision.reasonCode, 'NOT_PERMITTED');
      assert.equal(decision.ruleId, RULE_IDS.scopeReadOnly);
    }
    const directory = shipped.decide(inputOf(role, 'edit_work_email', ownEmployee(), { scope: 'read_only' }));
    assert.equal(directory.effect, 'deny');
    assert.equal(directory.ruleId, RULE_IDS.scopeReadOnly);
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

test('policy undeclared: a deleted cell refuses only that action, with .undeclared', () => {
  withRulesFile((path, engine) => {
    const rules = shippedRules();
    const cells = rules.resources?.['task']?.actions?.['change_task_status'];
    if (cells !== undefined) delete cells.staff;
    writeRules(path, rules);

    const refused = engine.decide(inputOf('staff', 'change_task_status', ownTask(1)));
    assert.equal(refused.effect, 'deny');
    assert.equal(refused.reasonCode, 'NOT_PERMITTED');
    assert.equal(refused.ruleId, 'task.change_task_status.staff.undeclared');

    assert.equal(engine.decide(inputOf('intern', 'change_task_status', ownTask(1))).effect, 'allow', 'another role is untouched');
    assert.equal(engine.decide(inputOf('staff', 'edit_task_description', ownTask(1))).effect, 'allow', 'another action is untouched');
  });
});

test('policy undeclared: a record type the file omits is refused, while the declared type still works', () => {
  withRulesFile((path, engine) => {
    const rules = shippedRules();
    delete rules.resources?.['task'];
    writeRules(path, rules);

    const task = engine.decide(inputOf('staff', 'change_task_status', ownTask(1)));
    assert.equal(task.effect, 'deny');
    assert.equal(task.ruleId, 'task.change_task_status.staff.undeclared');
    assert.equal(engine.readScope('staff', 'task').ruleId, 'task.read.staff.undeclared');
    assert.equal(engine.allowedFields('staff', 'task').ruleId, 'task.fields.staff.undeclared');
    assert.equal(engine.decide(inputOf('hr', 'edit_work_email', ownEmployee())).effect, 'allow');
  });
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
  assert.equal(engine.readScope('lead', 'task').reasonCode, 'POLICY_UNAVAILABLE');
  assert.equal(engine.approversFor({ department: OWN_DEPARTMENT }, []).reasonCode, 'POLICY_UNAVAILABLE');
});

test('policy unavailable: an old file without schema 2, a typo and a bad value refuse everything', () => {
  const rules = shippedRules();
  const oldSchema = structuredClone(rules);
  delete oldSchema.schema;
  const schemaOne = structuredClone(rules);
  schemaOne.schema = 1;

  const typoType = structuredClone(rules);
  if (typoType.resources !== undefined) typoType.resources['tsak'] = structuredClone(typoType.resources['task'] ?? {});
  const typoAction = structuredClone(rules);
  if (typoAction.resources?.['task']?.actions !== undefined) {
    typoAction.resources['task'].actions['chang_task_status'] = { intern: { effect: 'allow', scope: 'own_department' } };
  }
  const typoRole = structuredClone(rules);
  if (typoRole.resources?.['task']?.read !== undefined) typoRole.resources['task'].read['chef'] = 'own_department';
  const cellRole = structuredClone(rules);
  if (cellRole.resources?.['task']?.actions?.['change_task_status'] !== undefined) {
    cellRole.resources['task'].actions['change_task_status']['chef'] = { effect: 'allow', scope: 'own_department' };
  }

  const badEffect = structuredClone(rules);
  if (badEffect.resources?.['task']?.actions?.['change_task_status']?.lead !== undefined) {
    badEffect.resources['task'].actions['change_task_status'].lead.effect = 'maybe';
  }
  const allowWithoutScope = structuredClone(rules);
  if (allowWithoutScope.resources?.['task']?.actions?.['change_task_status']?.lead !== undefined) {
    delete allowWithoutScope.resources['task'].actions['change_task_status'].lead.scope;
  }
  const badScope = structuredClone(rules);
  if (badScope.resources?.['task']?.actions?.['change_task_status']?.lead !== undefined) {
    badScope.resources['task'].actions['change_task_status'].lead.scope = 'somewhere';
  }
  const unknownCellKey = structuredClone(rules);
  if (unknownCellKey.resources?.['task']?.actions?.['change_task_status']?.lead !== undefined) {
    Object.assign(unknownCellKey.resources['task'].actions['change_task_status'].lead, { note: 'x' });
  }
  const noApproval = structuredClone(rules);
  delete noApproval.approval;
  const badApprover = structuredClone(rules);
  if (badApprover.approval !== undefined) badApprover.approval.approver_roles = ['chef'];
  const noWindow = structuredClone(rules);
  delete noWindow.cumulative_window_minutes;
  const noResources = structuredClone(rules);
  noResources.resources = {};
  const zeroBulk = structuredClone(rules);
  if (zeroBulk.resources?.['task'] !== undefined) zeroBulk.resources['task'].bulk_threshold = 0;
  const roleMismatch = structuredClone(rules);
  if (roleMismatch.resources?.['employee']?.read !== undefined) delete roleMismatch.resources['employee'].read['intern'];

  const broken: Record<string, string> = {
    'empty file': '',
    'not JSON': '{ "schema": 2, ',
    'JSON null': 'null',
    'JSON array': '[]',
    'no schema': JSON.stringify(oldSchema),
    'schema one': JSON.stringify(schemaOne),
    'no version': JSON.stringify({ ...rules, version: undefined }),
    'version as text': JSON.stringify({ ...rules, version: '1' }),
    'version zero': JSON.stringify({ ...rules, version: 0 }),
    'typo record type': JSON.stringify(typoType),
    'typo action': JSON.stringify(typoAction),
    'typo role': JSON.stringify(typoRole),
    'cell for a role that does not exist': JSON.stringify(cellRole),
    'cell with an unknown effect': JSON.stringify(badEffect),
    'allow cell without a scope': JSON.stringify(allowWithoutScope),
    'cell with an unknown scope': JSON.stringify(badScope),
    'cell with an unknown key': JSON.stringify(unknownCellKey),
    'approval missing': JSON.stringify(noApproval),
    'approver role not in the file': JSON.stringify(badApprover),
    'cumulative window missing': JSON.stringify(noWindow),
    'no resources': JSON.stringify(noResources),
    'bulk threshold zero': JSON.stringify(zeroBulk),
    'role lists differ between record types': JSON.stringify(roleMismatch),
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
      assert.equal(engine.readScope('lead', 'task').reasonCode, 'POLICY_UNAVAILABLE', name);
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
    const cell = changed.resources?.['task']?.actions?.['edit_task_description']?.lead;
    if (cell !== undefined) cell.effect = 'deny';
    writeRules(path, changed);
    const afterChange = engine.decide(input);
    assert.equal(afterChange.effect, 'deny');
    assert.equal(afterChange.policyVersion, 2);

    rmSync(path);
    assert.equal(engine.decide(input).reasonCode, 'POLICY_UNAVAILABLE');
  });
});

test('policy rules file: the shipped file is valid, schema 2 and has the PRD threshold', () => {
  const rules = shippedRules();
  assert.equal(rules.schema, 2);
  assert.equal(rules.version, 1);
  assert.equal(rules.resources?.['task']?.bulk_threshold, 5);
  assert.equal(rules.cumulative_window_minutes, 60);
  assert.deepEqual(rules.approval, { approver_roles: ['lead'], same_department: true, wait_minutes: 120 });
});
