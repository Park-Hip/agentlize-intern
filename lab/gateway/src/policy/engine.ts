import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACTIONS, policyInputSchema, rulesSchema } from './schema.js';
import type { PolicyAction, PolicyInput, Rules, TableAction } from './schema.js';
import type { FieldsDecision, PolicyDecision, PolicyEffect } from './types.js';

/** `lab/gateway/policy/rules.json`, found from the compiled file at `dist/policy/engine.js`. */
export const DEFAULT_RULES_PATH = fileURLToPath(new URL('../../policy/rules.json', import.meta.url));

/**
 * Rule ids that are not cells of the table. A cell is named `<role>.<action>`
 * and the field lists `employee_fields.<role>`.
 */
export const RULE_IDS = {
  unavailable: 'POLICY_UNAVAILABLE',
  inputInvalid: 'INPUT_INVALID',
  actionUnknown: 'ACTION_UNKNOWN',
  roleUnknown: 'ROLE_UNKNOWN',
  scopeReadOnly: 'SCOPE_READ_ONLY',
  objectInvalid: 'OBJECT_INVALID',
} as const;

/** A key that declared `read_only` makes every one of these a refusal, whatever the role says. */
const WRITE_ACTIONS: ReadonlySet<PolicyAction> = new Set<PolicyAction>([
  'edit_task_description',
  'change_task_status',
  'change_task_assignee_or_due',
  'bulk_change',
  'edit_other_department_task',
  'edit_directory',
]);

/** Actions on a task that also depend on the department that owns the task and on how many tasks change. */
const TASK_ACTIONS: ReadonlySet<PolicyAction> = new Set<PolicyAction>([
  'edit_task_description',
  'change_task_status',
  'change_task_assignee_or_due',
  'bulk_change',
]);

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

export interface PolicyEngine {
  /** Answer one question. Never throws: any failure becomes `POLICY_UNAVAILABLE`. */
  decide(input: unknown): PolicyDecision;
  /** The employee fields one role may receive. Empty whenever the engine is unsure. */
  allowedFields(role: string): FieldsDecision;
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

function evaluate(rules: Rules, input: PolicyInput): PolicyDecision {
  const version = rules.version;
  const { actor, object, context } = input;

  if (!isAction(input.action)) {
    return deny(RULE_IDS.actionUnknown, version);
  }
  const action = input.action;

  const cells = Object.hasOwn(rules.roles, actor.role) ? rules.roles[actor.role] : undefined;
  const fields = Object.hasOwn(rules.employee_fields, actor.role) ? rules.employee_fields[actor.role] : undefined;
  if (cells === undefined || fields === undefined) {
    return deny(RULE_IDS.roleUnknown, version);
  }

  if (action === 'read_employee_field') {
    if (object.kind !== 'employee' || object.field === undefined) {
      return deny(RULE_IDS.objectInvalid, version);
    }
    const effect: PolicyEffect = fields.includes(object.field) ? 'allow' : 'deny';
    return decisionOf({ effect, ruleId: `employee_fields.${actor.role}` }, version);
  }

  if (WRITE_ACTIONS.has(action) && context.scope === 'read_only') {
    return deny(RULE_IDS.scopeReadOnly, version);
  }

  const tableAction: TableAction = action;
  const candidates: Candidate[] = [{ effect: cells[tableAction], ruleId: `${actor.role}.${tableAction}` }];

  if (tableAction === 'edit_directory') {
    if (object.kind !== 'employee') {
      return deny(RULE_IDS.objectInvalid, version);
    }
  } else {
    if (object.kind !== 'task') {
      return deny(RULE_IDS.objectInvalid, version);
    }
    if (TASK_ACTIONS.has(tableAction)) {
      // A task whose department is unknown cannot be shown to be the actor's own.
      if (object.department === undefined) {
        return deny(RULE_IDS.objectInvalid, version);
      }
      if (object.department !== actor.department) {
        candidates.push({
          effect: cells.edit_other_department_task,
          ruleId: `${actor.role}.edit_other_department_task`,
        });
      }
      if (tableAction !== 'bulk_change' && (object.taskCount ?? 0) >= rules.bulk_threshold) {
        candidates.push({ effect: cells.bulk_change, ruleId: `${actor.role}.bulk_change` });
      }
    }
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

    allowedFields(role: string): FieldsDecision {
      try {
        const rules = loadRules();
        const fields = Object.hasOwn(rules.employee_fields, role) ? rules.employee_fields[role] : undefined;
        if (fields === undefined) {
          return { ...deny(RULE_IDS.roleUnknown, rules.version), fields: [] };
        }
        return {
          ...decisionOf({ effect: 'allow', ruleId: `employee_fields.${role}` }, rules.version),
          fields: [...fields],
        };
      } catch {
        return { ...unavailable(), fields: [] };
      }
    },
  };
}
