import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ACTIONS,
  policyInputSchema,
  READ_EMPLOYEE_FIELD,
  RESOURCE_ACTIONS,
  rulesSchema,
} from './schema.js';
import type { PolicyAction, PolicyInput, ResourceType, Rules } from './schema.js';
import type {
  ApproversDecision,
  FieldsDecision,
  PersonRef,
  PolicyDecision,
  PolicyEffect,
  ReadDecision,
  WindowDecision,
} from './types.js';

/** `lab/gateway/policy/rules.json`, found from the compiled file at `dist/policy/engine.js`. */
export const DEFAULT_RULES_PATH = fileURLToPath(new URL('../../policy/rules.json', import.meta.url));

/**
 * Rule ids that are not cells of the file. A cell is named
 * `<type>.<action>.<role>`, with `.bulk`, `.scope` or `.undeclared` appended
 * when that condition decided instead of the bare cell.
 */
export const RULE_IDS = {
  unavailable: 'POLICY_UNAVAILABLE',
  inputInvalid: 'INPUT_INVALID',
  actionUnknown: 'ACTION_UNKNOWN',
  roleUnknown: 'ROLE_UNKNOWN',
  scopeReadOnly: 'SCOPE_READ_ONLY',
  objectInvalid: 'OBJECT_INVALID',
} as const;

/** Higher is stricter: "no" beats "needs approval", "needs approval" beats "yes". */
const STRICTNESS: Record<PolicyEffect, number> = { allow: 0, needs_approval: 1, deny: 2 };

interface Candidate {
  readonly effect: PolicyEffect;
  readonly ruleId: string;
}

export interface PolicyEngineOptions {
  /** Path of the rule file. The file is read again at every decision. */
  readonly rulesPath?: string;
  /** Replaceable so a test can make the read fail. */
  readonly readFile?: (path: string) => string;
}

/** One person as the approval question sees them; only these four values are used. */
export interface Requester {
  readonly department: string;
}

export interface PolicyEngine {
  /** Answer one write action. Never throws: any failure becomes `POLICY_UNAVAILABLE`. */
  decide(input: unknown): PolicyDecision;
  /** How far a role may read one record type, and the rule that says so. */
  readScope(role: string, type: string): ReadDecision;
  /** The fields one role may receive from one record type. Empty whenever the engine is unsure. */
  allowedFields(role: string, type?: string): FieldsDecision;
  /** How far back the bulk count looks, from `cumulative_window_minutes`. */
  cumulativeWindow(): WindowDecision;
  /** The people who may approve a request under the `approval` block. */
  approversFor(requester: Requester, people: readonly PersonRef[]): ApproversDecision;
}

/** The id of one cell of the table: `<type>.<action>.<role>`. */
export function actionRuleId(type: string, action: string, role: string): string {
  return `${type}.${action}.${role}`;
}

/** The rule that says how far one role reads one record type. */
export function readRuleId(type: string, role: string): string {
  return `${type}.read.${role}`;
}

/** The rule that lists the fields one role sees of one record type. */
export function fieldsRuleId(type: string, role: string): string {
  return `${type}.fields.${role}`;
}

function unavailable(): PolicyDecision {
  return {
    effect: 'deny',
    reasonCode: 'POLICY_UNAVAILABLE',
    ruleId: RULE_IDS.unavailable,
    policyVersion: null,
  };
}

function decisionOf(candidate: Candidate, policyVersion: number): PolicyDecision {
  const reasonCode =
    candidate.effect === 'allow' ? 'ALLOWED' : candidate.effect === 'needs_approval' ? 'NEEDS_APPROVAL' : 'NOT_PERMITTED';
  return { effect: candidate.effect, reasonCode, ruleId: candidate.ruleId, policyVersion };
}

function deny(ruleId: string, policyVersion: number): PolicyDecision {
  return decisionOf({ effect: 'deny', ruleId }, policyVersion);
}

/** Of several applicable rules the strictest wins; on a tie the earlier one is reported. */
function strictest(candidates: readonly Candidate[]): Candidate {
  let winner: Candidate | undefined;
  for (const candidate of candidates) {
    if (winner === undefined || STRICTNESS[candidate.effect] > STRICTNESS[winner.effect]) {
      winner = candidate;
    }
  }
  if (winner === undefined) {
    throw new Error('no rule applies');
  }
  return winner;
}

function isAction(value: string): value is PolicyAction {
  return (ACTIONS as readonly string[]).includes(value);
}

function rolesOf(rules: Rules): readonly string[] {
  const first = Object.keys(rules.resources)[0];
  const resource = first === undefined ? undefined : rules.resources[first];
  return resource === undefined ? [] : Object.keys(resource.read);
}

function evaluate(rules: Rules, input: PolicyInput): PolicyDecision {
  const version = rules.version;
  const { actor, object, context } = input;

  if (!isAction(input.action)) {
    return deny(RULE_IDS.actionUnknown, version);
  }
  const action = input.action;

  const roles = rolesOf(rules);
  if (!roles.includes(actor.role)) {
    return deny(RULE_IDS.roleUnknown, version);
  }

  if (action === READ_EMPLOYEE_FIELD) {
    if (object.kind !== 'employee' || object.field === undefined) {
      return deny(RULE_IDS.objectInvalid, version);
    }
    const resource = Object.hasOwn(rules.resources, 'employee') ? rules.resources['employee'] : undefined;
    const fields = resource?.fields[actor.role];
    if (fields === undefined) {
      return deny(`${fieldsRuleId('employee', actor.role)}.undeclared`, version);
    }
    const effect: PolicyEffect = fields.includes(object.field) ? 'allow' : 'deny';
    return decisionOf({ effect, ruleId: fieldsRuleId('employee', actor.role) }, version);
  }

  const type = object.kind;
  if (!Object.hasOwn(RESOURCE_ACTIONS, type)) {
    return deny(RULE_IDS.objectInvalid, version);
  }
  if (!(RESOURCE_ACTIONS[type as ResourceType] as readonly string[]).includes(action)) {
    return deny(RULE_IDS.objectInvalid, version);
  }

  if (context.scope === 'read_only') {
    return deny(RULE_IDS.scopeReadOnly, version);
  }

  const resource = Object.hasOwn(rules.resources, type) ? rules.resources[type] : undefined;
  const cell = resource?.actions[action]?.[actor.role];
  if (cell === undefined) {
    return deny(`${actionRuleId(type, action, actor.role)}.undeclared`, version);
  }

  const baseRule = actionRuleId(type, action, actor.role);

  // Scope is a condition of the cell, not an action of its own (ADR-0007 section 3.2).
  if (cell.scope === 'own_department') {
    if (object.department === undefined) {
      return deny(RULE_IDS.objectInvalid, version);
    }
    if (object.department !== actor.department) {
      return deny(`${baseRule}.scope`, version);
    }
  }

  const candidates: Candidate[] = [{ effect: cell.effect, ruleId: baseRule }];
  const bulkThreshold = resource?.bulk_threshold ?? 1;
  const ownItems = object.taskCount ?? 0;
  const carriedItems = object.carriedItems ?? 0;
  if (cell.bulk !== undefined && ownItems > 0 && ownItems + carriedItems >= bulkThreshold) {
    // Only this call's items make a batch. When the items already counted in
    // the window are what reaches the threshold, the rule says `.cumulative`
    // (ADR-0007 section 3.4).
    const suffix = ownItems >= bulkThreshold ? 'bulk' : 'cumulative';
    candidates.push({ effect: cell.bulk, ruleId: `${baseRule}.${suffix}` });
  }
  return decisionOf(strictest(candidates), version);
}

export function createPolicyEngine(options: PolicyEngineOptions = {}): PolicyEngine {
  const rulesPath = options.rulesPath ?? DEFAULT_RULES_PATH;
  const readFile = options.readFile ?? ((path: string): string => readFileSync(path, 'utf8'));

  /** Read, parse and check the file. Called once per decision so a broken file takes effect at once. */
  function loadRules(): Rules {
    const text = readFile(rulesPath).replace(/^﻿/, '');
    return rulesSchema.parse(JSON.parse(text));
  }

  return {
    decide(input: unknown): PolicyDecision {
      try {
        const rules = loadRules();
        const parsed = policyInputSchema.safeParse(input);
        if (!parsed.success) {
          return deny(RULE_IDS.inputInvalid, rules.version);
        }
        return evaluate(rules, parsed.data);
      } catch {
        return unavailable();
      }
    },

    readScope(role: string, type: string): ReadDecision {
      try {
        const rules = loadRules();
        if (!rolesOf(rules).includes(role)) {
          return { ...deny(RULE_IDS.roleUnknown, rules.version), scope: null };
        }
        const resource = Object.hasOwn(rules.resources, type) ? rules.resources[type] : undefined;
        const scope = resource?.read[role];
        if (scope === undefined) {
          return { ...deny(`${readRuleId(type, role)}.undeclared`, rules.version), scope: null };
        }
        return {
          ...decisionOf({ effect: 'allow', ruleId: readRuleId(type, role) }, rules.version),
          scope,
        };
      } catch {
        return { ...unavailable(), scope: null };
      }
    },

    allowedFields(role: string, type = 'employee'): FieldsDecision {
      try {
        const rules = loadRules();
        if (!rolesOf(rules).includes(role)) {
          return { ...deny(RULE_IDS.roleUnknown, rules.version), fields: [] };
        }
        const resource = Object.hasOwn(rules.resources, type) ? rules.resources[type] : undefined;
        const fields = resource?.fields[role];
        if (fields === undefined) {
          return { ...deny(`${fieldsRuleId(type, role)}.undeclared`, rules.version), fields: [] };
        }
        return {
          ...decisionOf({ effect: 'allow', ruleId: fieldsRuleId(type, role) }, rules.version),
          fields: [...fields],
        };
      } catch {
        return { ...unavailable(), fields: [] };
      }
    },

    cumulativeWindow(): WindowDecision {
      try {
        const rules = loadRules();
        return {
          ...decisionOf({ effect: 'allow', ruleId: 'cumulative_window_minutes' }, rules.version),
          minutes: rules.cumulative_window_minutes,
        };
      } catch {
        return { ...unavailable(), minutes: 0 };
      }
    },

    approversFor(requester: Requester, people: readonly PersonRef[]): ApproversDecision {
      try {
        const rules = loadRules();
        const { approver_roles: approverRoles, same_department: sameDepartment, wait_minutes: waitMinutes } = rules.approval;
        const approvers = people.filter(
          (person) => approverRoles.includes(person.role) && (!sameDepartment || person.department === requester.department),
        );
        return {
          ...decisionOf({ effect: 'allow', ruleId: 'approval' }, rules.version),
          approverRoles: [...approverRoles],
          sameDepartment,
          waitMinutes,
          approvers,
        };
      } catch {
        return {
          ...unavailable(),
          approverRoles: [],
          sameDepartment: true,
          waitMinutes: 0,
          approvers: [],
        };
      }
    },
  };
}
