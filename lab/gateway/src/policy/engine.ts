import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ADAPTER_DECLARATIONS } from '../adapters/registry.js';
import type { RecordDeclaration } from '../adapters/types.js';
import { DATA_CLASS_RULE_SUFFIX, exceedsCeiling, LOWEST_DATA_CLASS } from './data-classes.js';
import type { ClientClass, DataClass } from './data-classes.js';
import { denyReasonFor } from './deny-reason.js';
import {
  createRulesSchema,
  policyInputSchema,
  READ_EMPLOYEE_FIELD,
} from './schema.js';
import type { PolicyInput, Rules } from './schema.js';
import type {
  ApproverMode,
  ApproversDecision,
  FieldsDecision,
  PendingLimitDecision,
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

/** The actions and their writable fields, from the adapters of a running gateway. */
interface Vocabulary {
  readonly all: ReadonlySet<string>;
  readonly byType: ReadonlyMap<string, ReadonlySet<string>>;
  /** `<record type>` -> `<action>` -> the fields that action changes. */
  readonly fieldsByAction: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
}

function vocabularyOf(declarations: readonly RecordDeclaration[]): Vocabulary {
  const byType = new Map<string, ReadonlySet<string>>();
  const fieldsByAction = new Map<string, ReadonlyMap<string, readonly string[]>>();
  const all = new Set<string>([READ_EMPLOYEE_FIELD]);
  for (const declaration of declarations) {
    const actions = new Map<string, readonly string[]>();
    for (const action of declaration.actions) {
      actions.set(action.name, action.fields);
      all.add(action.name);
    }
    byType.set(declaration.type, new Set(actions.keys()));
    fieldsByAction.set(declaration.type, actions);
  }
  return { all, byType, fieldsByAction };
}

export interface PolicyEngineOptions {
  /** Path of the rule file. The file is read again at every decision. */
  readonly rulesPath?: string;
  /**
   * The adapter registry the gateway runs with. A test that registers an
   * adapter with a new action passes it here, so the rule file may name that
   * action without editing the schema (ADR-0007 section 3.2).
   */
  readonly declarations?: readonly RecordDeclaration[];
  /** Replaceable so a test can make the read fail. */
  readonly readFile?: (path: string) => string;
}

/** One person as the approval question sees them; only these values are used. */
export interface Requester {
  /** The requester's own department, always known from the directory. */
  readonly department: string;
  /** The record type the request changes; absent means no type, so the requester's lead answers. */
  readonly kind?: string;
  /** The department that owns the record, read through the adapter's `ownerField`. */
  readonly ownerDepartment?: string;
}

export interface PolicyEngine {
  /** Answer one write action. Never throws: any failure becomes `POLICY_UNAVAILABLE`. */
  decide(input: unknown): PolicyDecision;
  /** How far a role may read one record type, and the rule that says so. */
  readScope(role: string, type: string): ReadDecision;
  /**
   * The fields one role may receive from one record type through one client.
   * Empty whenever the engine is unsure, and the two dropped lists keep the
   * role gate separate from the client ceiling (ADR-0010 section 3.3).
   */
  allowedFields(role: string, type: string, caller: string): FieldsDecision;
  /** How far back the bulk count looks, from `cumulative_window_minutes`. */
  cumulativeWindow(): WindowDecision;
  /** How many proposals one person may leave waiting, from `pending_limit`. */
  pendingLimit(): PendingLimitDecision;
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

/** One client as the rule file describes it; an absent profile is the lowest class, not an error. */
interface ClientChoice {
  readonly name: string;
  readonly clientClass: ClientClass | null;
  readonly ceiling: DataClass;
  readonly declared: boolean;
}

function clientChoice(rules: Rules, caller: string): ClientChoice {
  const profile = Object.hasOwn(rules.clients, caller) ? rules.clients[caller] : undefined;
  return profile === undefined
    ? { name: caller, clientClass: null, ceiling: LOWEST_DATA_CLASS, declared: false }
    : { name: caller, clientClass: profile.class, ceiling: profile.ceiling, declared: true };
}

function dataClassOf(resource: Rules['resources'][string] | undefined, field: string): DataClass | null {
  if (resource === undefined || !Object.hasOwn(resource.data_classes, field)) return null;
  return resource.data_classes[field] ?? null;
}

function unavailable(): PolicyDecision {
  return {
    effect: 'deny',
    reasonCode: 'POLICY_UNAVAILABLE',
    ruleId: RULE_IDS.unavailable,
    policyVersion: null,
    denyReason: denyReasonFor('POLICY_UNAVAILABLE', null),
  };
}

function decisionOf(candidate: Candidate, policyVersion: number): PolicyDecision {
  const reasonCode =
    candidate.effect === 'allow' ? 'ALLOWED' : candidate.effect === 'needs_approval' ? 'NEEDS_APPROVAL' : 'NOT_PERMITTED';
  return {
    effect: candidate.effect,
    reasonCode,
    ruleId: candidate.ruleId,
    policyVersion,
    denyReason: denyReasonFor(reasonCode === 'ALLOWED' ? null : reasonCode, candidate.ruleId),
  };
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

function rolesOf(rules: Rules): readonly string[] {
  const first = Object.keys(rules.resources)[0];
  const resource = first === undefined ? undefined : rules.resources[first];
  return resource === undefined ? [] : Object.keys(resource.read);
}

function evaluate(rules: Rules, input: PolicyInput, vocabulary: Vocabulary): PolicyDecision {
  const version = rules.version;
  const { actor, object, context } = input;
  const client = clientChoice(rules, context.caller);

  if (!vocabulary.all.has(input.action)) {
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
    if (!fields.includes(object.field)) {
      return deny(fieldsRuleId('employee', actor.role), version);
    }
    const dataClass = dataClassOf(resource, object.field);
    if (dataClass === null) {
      return deny(`${fieldsRuleId('employee', actor.role)}.data_class_undeclared`, version);
    }
    if (exceedsCeiling(dataClass, client.ceiling)) {
      return deny(`${fieldsRuleId('employee', actor.role)}${DATA_CLASS_RULE_SUFFIX}`, version);
    }
    return decisionOf({ effect: 'allow', ruleId: fieldsRuleId('employee', actor.role) }, version);
  }

  const type = object.kind;
  const known = vocabulary.byType.get(type);
  if (known === undefined || !known.has(action)) {
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

  // A client that may not receive a field may not write it either (ADR-0010
  // section 3.3). A cell the role already denies keeps its role reason, so a
  // client can never turn a "no" into a data-class answer.
  if (cell.effect !== 'deny') {
    const actionFields = vocabulary.fieldsByAction.get(type)?.get(action) ?? [];
    for (const field of actionFields) {
      const dataClass = dataClassOf(resource, field);
      if (dataClass === null) {
        return deny(`${baseRule}.data_class_undeclared`, version);
      }
      if (exceedsCeiling(dataClass, client.ceiling)) {
        return deny(`${baseRule}${DATA_CLASS_RULE_SUFFIX}`, version);
      }
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
  const declarations = options.declarations ?? ADAPTER_DECLARATIONS;
  const schema = createRulesSchema(declarations);
  const vocabulary = vocabularyOf(declarations);

  /** Read, parse and check the file. Called once per decision so a broken file takes effect at once. */
  function loadRules(): Rules {
    const text = readFile(rulesPath).replace(/^﻿/, '');
    return schema.parse(JSON.parse(text));
  }

  return {
    decide(input: unknown): PolicyDecision {
      try {
        const rules = loadRules();
        const parsed = policyInputSchema.safeParse(input);
        if (!parsed.success) {
          return deny(RULE_IDS.inputInvalid, rules.version);
        }
        return evaluate(rules, parsed.data, vocabulary);
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

    allowedFields(role: string, type: string, caller: string): FieldsDecision {
      const client = { name: caller, clientClass: null, ceiling: null, declared: false } as const;
      const empty = {
        fields: [],
        droppedByClient: [],
        droppedUnclassified: [],
        client: client.name,
        clientClass: client.clientClass,
        ceiling: client.ceiling,
        clientDeclared: client.declared,
      } as const;
      try {
        const rules = loadRules();
        const chosen = clientChoice(rules, caller);
        const withClient = {
          client: chosen.name,
          clientClass: chosen.clientClass,
          ceiling: chosen.ceiling,
          clientDeclared: chosen.declared,
        } as const;

        if (!rolesOf(rules).includes(role)) {
          return { ...deny(RULE_IDS.roleUnknown, rules.version), ...empty, ...withClient };
        }
        const resource = Object.hasOwn(rules.resources, type) ? rules.resources[type] : undefined;
        const fields = resource?.fields[role];
        if (fields === undefined) {
          return { ...deny(`${fieldsRuleId(type, role)}.undeclared`, rules.version), ...empty, ...withClient };
        }

        const visible: string[] = [];
        const droppedByClient: string[] = [];
        const droppedUnclassified: string[] = [];
        for (const field of fields) {
          const dataClass = dataClassOf(resource, field);
          if (dataClass === null) {
            droppedUnclassified.push(field);
          } else if (exceedsCeiling(dataClass, chosen.ceiling)) {
            droppedByClient.push(field);
          } else {
            visible.push(field);
          }
        }

        return {
          ...decisionOf({ effect: 'allow', ruleId: fieldsRuleId(type, role) }, rules.version),
          fields: visible,
          droppedByClient,
          droppedUnclassified,
          ...withClient,
        };
      } catch {
        return { ...unavailable(), ...empty };
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

    pendingLimit(): PendingLimitDecision {
      try {
        const rules = loadRules();
        return {
          ...decisionOf({ effect: 'allow', ruleId: 'pending_limit' }, rules.version),
          limit: rules.pending_limit,
        };
      } catch {
        return { ...unavailable(), limit: 0 };
      }
    },

    approversFor(requester: Requester, people: readonly PersonRef[]): ApproversDecision {
      try {
        const rules = loadRules();
        const { approver_roles: approverRoles, same_department: sameDepartment, wait_minutes: waitMinutes } = rules.approval;
        // A file from before `approver` keeps the requester-lead answer (issue #148).
        const resource =
          requester.kind !== undefined && Object.hasOwn(rules.resources, requester.kind)
            ? rules.resources[requester.kind]
            : undefined;
        const approverMode: ApproverMode = resource?.approver ?? 'requester_lead';
        const department =
          approverMode === 'owner_lead' ? (requester.ownerDepartment ?? requester.department) : requester.department;
        const approvers = people.filter(
          (person) => approverRoles.includes(person.role) && (!sameDepartment || person.department === department),
        );
        return {
          ...decisionOf({ effect: 'allow', ruleId: 'approval' }, rules.version),
          approverRoles: [...approverRoles],
          sameDepartment,
          waitMinutes,
          approverMode,
          department,
          approvers,
        };
      } catch {
        return {
          ...unavailable(),
          approverRoles: [],
          sameDepartment: true,
          waitMinutes: 0,
          approverMode: 'requester_lead',
          department: '',
          approvers: [],
        };
      }
    },
  };
}
