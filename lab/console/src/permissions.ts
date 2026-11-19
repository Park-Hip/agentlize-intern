import { DEPARTMENTS, ROLES } from '@lab/shared';
import {
  ACTIONS,
  ADAPTER_DECLARATIONS,
  DIRECTORY_KEY,
  EMPLOYEE_FIELD_LABELS,
  READ_EMPLOYEE_FIELD,
  rulesSchema,
  TASK_FIELDS,
  type ActionCell,
  type PolicyAction,
  type PolicyDecision,
  type PolicyEffect,
  type PolicyInput,
  type ReadScope,
  type Rules,
} from '@lab/gateway';
import { roleLabel, type PersonaChoice } from './data.js';
import type { Employee } from './upstream.js';

/** The effect words the gateway's schema accepts, in the order the console offers them. */
export const EFFECTS = ['allow', 'deny', 'needs_approval'] as const;

export const EFFECT_LABEL: Readonly<Record<PolicyEffect, string>> = {
  allow: 'Được',
  deny: 'Không được',
  needs_approval: 'Cần duyệt',
};

/** How far a role may read a record type, in the order the console offers it. */
export const SCOPES = ['own_department', 'any'] as const;

export const SCOPE_LABEL: Readonly<Record<ReadScope, string>> = {
  own_department: 'Cùng phòng',
  any: 'Mọi phòng',
};

/** The record types the console draws, in the order the adapters declare them. */
export const RESOURCE_ORDER: readonly string[] = ADAPTER_DECLARATIONS.map((declaration) => declaration.type);

export const RESOURCE_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  ADAPTER_DECLARATIONS.map((declaration) => [declaration.type, declaration.label] as const),
);

/** The console labels, read from the adapters; the one read question is not an adapter action. */
export const ACTION_LABEL: Readonly<Record<string, string>> = {
  [READ_EMPLOYEE_FIELD]: 'Xem một trường của nhân viên',
  ...Object.fromEntries(
    ADAPTER_DECLARATIONS.flatMap((declaration) =>
      declaration.actions.map((action) => [action.name, action.label] as const),
    ),
  ),
};

/** The fields are named as the rule file names them; this is the reverse of the gateway map. */
const RULE_FIELD: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(DIRECTORY_KEY).map(([ruleName, directoryKey]) => [directoryKey, ruleName]),
);

function orderFields(fields: Iterable<string>): readonly string[] {
  const known = Object.keys(EMPLOYEE_FIELD_LABELS);
  const all = new Set(fields);
  const ordered = known.filter((field) => all.has(field));
  const extras = [...all].filter((field) => !known.includes(field)).sort((left, right) => left.localeCompare(right));
  return [...ordered, ...extras];
}

/** Every role the file declares, with the four known roles first and any other role after them. */
export function ruleRoles(rules: Rules): readonly string[] {
  const roles = new Set<string>();
  for (const resource of Object.values(rules.resources)) {
    for (const role of Object.keys(resource.read)) roles.add(role);
  }
  const known: readonly string[] = ROLES;
  return [
    ...known.filter((role) => roles.has(role)),
    ...[...roles].filter((role) => !known.includes(role)).sort((left, right) => left.localeCompare(right)),
  ];
}

/** The record types the file declares, in a stable order. */
export function resourceTypes(rules: Rules): readonly string[] {
  const types = Object.keys(rules.resources);
  return [
    ...RESOURCE_ORDER.filter((type) => types.includes(type)),
    ...types.filter((type) => !(RESOURCE_ORDER as readonly string[]).includes(type)).sort((left, right) => left.localeCompare(right)),
  ];
}

/** The actions the adapters declare for one record type; a typo in the file never reaches here. */
export function actionsOf(type: string): readonly string[] {
  return ADAPTER_DECLARATIONS.find((declaration) => declaration.type === type)?.actions.map((action) => action.name) ?? [];
}

/**
 * Rule field names the directory currently has, plus the ones the rule file
 * already uses. A rule field absent from the directory still has to render,
 * otherwise a save would silently drop it while the directory is down.
 */
export function knownRuleFields(rules: Rules, employees: readonly Employee[] | undefined): readonly string[] {
  const fields = new Set<string>();
  for (const list of Object.values(rules.resources['employee']?.fields ?? {})) {
    for (const field of list) fields.add(field);
  }
  for (const employee of employees ?? []) {
    // `Employee.fields` leaves out the code, which has its own column on the data screen, so it is added here.
    fields.add(RULE_FIELD['employee_id'] ?? 'employee_id');
    for (const key of Object.keys(employee.fields)) fields.add(RULE_FIELD[key] ?? key);
  }
  return orderFields(fields);
}

export interface FieldChoice {
  /** The name the rule file uses, for example `id` or `work_email`. */
  readonly field: string;
  /** The Vietnamese label the gateway prints, or the field code when it has none yet. */
  readonly label: string;
  /** The key the directory stores, shown so an engineer can match the two names. */
  readonly directoryKey: string;
  /** No role may see this field yet. The screen marks it "chưa khai". */
  readonly declared: boolean;
}

function declaredFields(rules: Rules, type: string): ReadonlySet<string> {
  const declared = new Set<string>();
  for (const list of Object.values(rules.resources[type]?.fields ?? {})) {
    for (const field of list) declared.add(field);
  }
  return declared;
}

export function fieldChoices(rules: Rules, fields: readonly string[]): readonly FieldChoice[] {
  const declared = declaredFields(rules, 'employee');
  return fields.map((field) => ({
    field,
    label: EMPLOYEE_FIELD_LABELS[field] ?? field,
    directoryKey: DIRECTORY_KEY[field] ?? field,
    declared: declared.has(field),
  }));
}

/** The task fields the screen offers, including the ones no role sees yet. */
export function taskFieldChoices(rules: Rules): readonly FieldChoice[] {
  const declared = declaredFields(rules, 'task');
  return TASK_FIELDS.filter((field) => field.name !== 'version').map((field) => ({
    field: field.name,
    label: field.label,
    directoryKey: field.name,
    declared: declared.has(field.name),
  }));
}

export interface RoleColumn {
  readonly role: string;
  readonly label: string;
}

export function roleColumns(rules: Rules): readonly RoleColumn[] {
  return ruleRoles(rules).map((role) => ({ role, label: roleLabel(role) }));
}

export interface ResourceView {
  readonly type: string;
  readonly label: string;
  readonly bulkThreshold: number;
  readonly actions: readonly string[];
}

export interface ApprovalView {
  readonly approverRoles: readonly string[];
  readonly sameDepartment: boolean;
  readonly waitMinutes: number;
}

export interface PermissionsView {
  readonly version: number;
  readonly file: string;
  readonly approval: ApprovalView;
  readonly cumulativeWindowMinutes: number;
  readonly roles: readonly RoleColumn[];
  readonly rules: Rules;
  readonly fields: readonly FieldChoice[];
  readonly taskFields: readonly FieldChoice[];
  readonly resources: readonly ResourceView[];
}

export function permissionsView(
  rules: Rules,
  fields: readonly FieldChoice[],
  file: string,
): PermissionsView {
  return {
    version: rules.version,
    file,
    approval: {
      approverRoles: rules.approval.approver_roles,
      sameDepartment: rules.approval.same_department,
      waitMinutes: rules.approval.wait_minutes,
    },
    cumulativeWindowMinutes: rules.cumulative_window_minutes,
    roles: roleColumns(rules),
    rules,
    fields,
    taskFields: taskFieldChoices(rules),
    resources: resourceTypes(rules).map((type) => ({
      type,
      label: RESOURCE_LABEL[type] ?? type,
      bulkThreshold: rules.resources[type]?.bulk_threshold ?? 0,
      actions: actionsOf(type),
    })),
  };
}

export type BuiltRules =
  | { readonly ok: true; readonly rules: Rules }
  | { readonly ok: false; readonly detail: string };

function effectOf(value: string | null): PolicyEffect | undefined {
  return value !== null && (EFFECTS as readonly string[]).includes(value) ? (value as PolicyEffect) : undefined;
}

function scopeOf(value: string | null): ReadScope | undefined {
  return value !== null && (SCOPES as readonly string[]).includes(value) ? (value as ReadScope) : undefined;
}

function positiveNumber(form: URLSearchParams, name: string): number {
  const text = (form.get(name) ?? '').trim();
  return /^[0-9]+$/.test(text) ? Number(text) : Number.NaN;
}

/**
 * Turn one submitted form into the next rule file. The role, record type and
 * action lists come from the file and from the adapters, never from the form,
 * so a tampered form cannot add a role or an action. Every value is checked
 * again by the gateway's schema before the file is written.
 */
export function rulesFromForm(
  current: Rules,
  form: URLSearchParams,
  fields: readonly string[],
): BuiltRules {
  const roles = ruleRoles(current);
  const resources: Record<
    string,
    {
      bulk_threshold: number;
      read: Record<string, ReadScope>;
      fields: Record<string, string[]>;
      actions: Record<string, Record<string, ActionCell>>;
    }
  > = {};

  for (const [type] of Object.entries(current.resources)) {
    const threshold = positiveNumber(form, `bulk_threshold.${type}`);
    if (!Number.isInteger(threshold) || threshold < 1) {
      return { ok: false, detail: `Ngưỡng hàng loạt của ${RESOURCE_LABEL[type] ?? type} phải là số nguyên từ 1.` };
    }

    const read: Record<string, ReadScope> = {};
    for (const role of roles) {
      const scope = scopeOf(form.get(`read.${type}.${role}`));
      if (scope === undefined) {
        return { ok: false, detail: `Thiếu hoặc sai phạm vi đọc cho ${type}.${role}.` };
      }
      read[role] = scope;
    }

    const declaration = ADAPTER_DECLARATIONS.find((candidate) => candidate.type === type);
    const catalog =
      type === 'employee'
        ? fields
        : declaration === undefined
          ? undefined
          : declaration.fields.filter((field) => field.name !== 'version').map((field) => field.name);
    const fieldLists: Record<string, string[]> = {};
    for (const role of roles) {
      const submitted = form.getAll(`fields.${type}.${role}`);
      if (catalog !== undefined) {
        for (const field of submitted) {
          if (!catalog.includes(field)) {
            return { ok: false, detail: `Trường ${field} không có trong danh sách trường của ${RESOURCE_LABEL[type] ?? type}.` };
          }
        }
        fieldLists[role] = catalog.filter((field) => submitted.includes(field));
      } else {
        fieldLists[role] = submitted;
      }
    }

    const actions: Record<string, Record<string, ActionCell>> = {};
    for (const action of actionsOf(type)) {
      const cells: Record<string, ActionCell> = {};
      for (const role of roles) {
        const prefix = `cell.${type}.${action}.${role}`;
        const effectRaw = form.get(`${prefix}.effect`) ?? '';
        if (effectRaw === '') continue;
        const effect = effectOf(effectRaw);
        if (effect === undefined) {
          return { ok: false, detail: `Thiếu hoặc sai lựa chọn cho ${type}.${action}.${role}.` };
        }

        let cell: ActionCell;
        const scope = scopeOf(form.get(`${prefix}.scope`));
        if (effect === 'deny') {
          cell = scope === undefined ? { effect } : { effect, scope };
        } else {
          if (scope === undefined) {
            return { ok: false, detail: `Thiếu hoặc sai phạm vi cho ${type}.${action}.${role}.` };
          }
          cell = { effect, scope };
        }

        const bulkRaw = form.get(`${prefix}.bulk`) ?? '';
        if (bulkRaw !== '') {
          const bulk = effectOf(bulkRaw);
          if (bulk === undefined) {
            return { ok: false, detail: `Thiếu hoặc sai hiệu lực hàng loạt cho ${type}.${action}.${role}.` };
          }
          cell = { ...cell, bulk };
        }
        cells[role] = cell;
      }
      actions[action] = cells;
    }

    resources[type] = { bulk_threshold: threshold, read, fields: fieldLists, actions };
  }

  const wantedApprovers = form.getAll('approver_roles');
  const approverRoles = roles.filter((role) => wantedApprovers.includes(role));
  if (approverRoles.length === 0) {
    return { ok: false, detail: 'Cần chọn ít nhất một vai được duyệt.' };
  }

  const waitMinutes = positiveNumber(form, 'approval_wait_minutes');
  if (!Number.isInteger(waitMinutes) || waitMinutes < 1) {
    return { ok: false, detail: 'Số phút chờ duyệt phải là số nguyên từ 1.' };
  }
  const windowMinutes = positiveNumber(form, 'cumulative_window_minutes');
  if (!Number.isInteger(windowMinutes) || windowMinutes < 1) {
    return { ok: false, detail: 'Cửa sổ đếm tách nhỏ phải là số nguyên từ 1.' };
  }

  const parsed = rulesSchema.safeParse({
    schema: 2,
    version: current.version + 1,
    approval: {
      approver_roles: approverRoles,
      same_department: form.get('approval_same_department') === 'true',
      wait_minutes: waitMinutes,
    },
    cumulative_window_minutes: windowMinutes,
    resources,
  });
  if (!parsed.success) {
    const where = parsed.error.issues.map((issue) => issue.path.join('.') || '(file)').join(', ');
    return { ok: false, detail: `Dữ liệu form không hợp lệ ở ${where}.` };
  }
  return { ok: true, rules: parsed.data };
}

/** What the decision form shows, kept as plain strings so a bad query can be echoed and explained. */
export interface DecisionForm {
  readonly persona: string;
  readonly action: string;
  readonly objectKind: 'task' | 'employee';
  readonly department: string;
  readonly taskCount: string;
  readonly field: string;
}

export function decisionForm(
  params: URLSearchParams,
  personas: readonly PersonaChoice[],
  fields: readonly string[],
): DecisionForm {
  return {
    persona: params.get('persona') ?? personas[0]?.employeeId ?? '',
    action: params.get('action') ?? 'change_task_status',
    objectKind: params.get('object') === 'employee' ? 'employee' : 'task',
    department: params.get('department') ?? DEPARTMENTS[0] ?? '',
    taskCount: params.get('task_count') ?? '1',
    field: params.get('field') ?? fields[0] ?? '',
  };
}

/** A decision question built from the console form, before the directory is asked for the actor. */
export interface DecisionRequest {
  readonly employeeId: string;
  readonly action: PolicyAction;
  readonly objectKind: 'task' | 'employee';
  readonly department: string;
  readonly taskCount: number;
  readonly field: string;
}

export type ParsedDecision =
  | { readonly ok: true; readonly request: DecisionRequest }
  | { readonly ok: false; readonly detail: string };

export function parseDecision(
  params: URLSearchParams,
  personas: readonly PersonaChoice[],
  fields: readonly string[],
): ParsedDecision {
  const employeeId = params.get('persona') ?? personas[0]?.employeeId ?? '';
  if (!personas.some((persona) => persona.employeeId === employeeId)) {
    return { ok: false, detail: `Không có nhân vật ${employeeId} trong danh bạ.` };
  }

  const action = params.get('action') ?? 'change_task_status';
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, detail: `Hành động ${action} không có trong bảng luật.` };
  }

  const objectKind = params.get('object') ?? 'task';
  if (objectKind !== 'task' && objectKind !== 'employee') {
    return { ok: false, detail: `Đối tượng ${objectKind} không hợp lệ.` };
  }

  const department = params.get('department') ?? DEPARTMENTS[0];
  if (!(DEPARTMENTS as readonly string[]).includes(department)) {
    return { ok: false, detail: `Phòng ${department} không có trong dữ liệu giả.` };
  }

  const countText = (params.get('task_count') ?? '1').trim();
  const taskCount = /^[0-9]+$/.test(countText) ? Number(countText) : Number.NaN;
  if (!Number.isInteger(taskCount) || taskCount > 1_000) {
    return { ok: false, detail: 'Số task phải là số nguyên từ 0 tới 1000.' };
  }

  const field = params.get('field') ?? fields[0] ?? '';
  if (!fields.includes(field)) {
    return { ok: false, detail: `Trường ${field} không có trong danh sách trường.` };
  }

  return {
    ok: true,
    request: { employeeId, action: action as PolicyAction, objectKind, department, taskCount, field },
  };
}

export type DecisionOutcome =
  | { readonly ok: true; readonly input: PolicyInput; readonly decision: PolicyDecision }
  | { readonly ok: false; readonly detail: string };

/**
 * Ask the gateway's own engine, reading the gateway's own rule file. No tool is
 * called and no system is read: this is the same question a write would ask,
 * answered before anyone sends it.
 */
export function runDecision(
  request: DecisionRequest,
  personas: readonly PersonaChoice[],
  decide: (input: unknown) => PolicyDecision,
): DecisionOutcome {
  const persona = personas.find((candidate) => candidate.employeeId === request.employeeId);
  if (persona === undefined) {
    return { ok: false, detail: `Không có nhân viên ${request.employeeId} trong danh bạ.` };
  }

  const input: PolicyInput = {
    actor: { id: persona.employeeId, role: persona.role, department: persona.department },
    action: request.action,
    object: {
      kind: request.objectKind,
      department: request.department,
      taskCount: request.taskCount,
      field: request.field,
    },
    context: { scope: 'read_write', caller: 'lab-console' },
  };

  return { ok: true, input, decision: decide(input) };
}
