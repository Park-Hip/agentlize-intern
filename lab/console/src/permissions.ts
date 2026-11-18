import { DEPARTMENTS, ROLES } from '@lab/shared';
import {
  ACTIONS,
  DIRECTORY_KEY,
  EMPLOYEE_FIELD_LABELS,
  TABLE_ACTIONS,
  rulesSchema,
  type PolicyAction,
  type PolicyDecision,
  type PolicyEffect,
  type PolicyInput,
  type Rules,
  type TableAction,
  type TaskField,
  TASK_FIELDS,
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

export const ACTION_LABEL: Readonly<Record<PolicyAction, string>> = {
  read_employee_field: 'Xem một trường của nhân viên',
  edit_task_description: 'Sửa mô tả task',
  change_task_status: 'Đổi trạng thái task',
  change_task_assignee_or_due: 'Đổi người phụ trách hoặc hạn',
  bulk_change: 'Đổi hàng loạt task',
  edit_other_department_task: 'Sửa task của phòng khác',
  edit_directory: 'Sửa danh bạ',
};

/** The fields are named as the rule file names them; this is the reverse of the gateway map. */
const RULE_FIELD: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(DIRECTORY_KEY).map(([ruleName, directoryKey]) => [directoryKey, ruleName]),
);

/** A record's revision counter is not an employee field, so it never appears in the permission table. */
const NOT_A_FIELD = new Set(['version']);

function orderFields(fields: Iterable<string>): readonly string[] {
  const known = Object.keys(EMPLOYEE_FIELD_LABELS);
  const all = new Set(fields);
  const ordered = known.filter((field) => all.has(field));
  const extras = [...all].filter((field) => !known.includes(field)).sort((left, right) => left.localeCompare(right));
  return [...ordered, ...extras];
}

/**
 * Rule field names the directory currently has, plus the ones the rule file
 * already uses. A rule field absent from the directory still has to render,
 * otherwise a save would silently drop it while the directory is down.
 */
export function knownRuleFields(rules: Rules, employees: readonly Employee[] | undefined): readonly string[] {
  const fields = new Set<string>();
  for (const role of Object.keys(rules.employee_fields)) {
    for (const field of rules.employee_fields[role] ?? []) fields.add(field);
  }
  for (const employee of employees ?? []) {
    for (const key of Object.keys(employee.fields)) {
      if (!NOT_A_FIELD.has(key)) fields.add(RULE_FIELD[key] ?? key);
    }
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

export function fieldChoices(
  rules: Rules,
  fields: readonly string[],
): readonly FieldChoice[] {
  const roles = Object.keys(rules.employee_fields);
  return fields.map((field) => ({
    field,
    label: EMPLOYEE_FIELD_LABELS[field] ?? field,
    directoryKey: DIRECTORY_KEY[field] ?? field,
    declared: roles.some((role) => (rules.employee_fields[role] ?? []).includes(field)),
  }));
}

export interface RoleColumn {
  readonly role: string;
  readonly label: string;
}

export function roleColumns(rules: Rules): readonly RoleColumn[] {
  const known: readonly string[] = ROLES;
  const roles = Object.keys(rules.roles);
  const ordered = [
    ...known.filter((role) => roles.includes(role)),
    ...roles.filter((role) => !known.includes(role)).sort((left, right) => left.localeCompare(right)),
  ];
  return ordered.map((role) => ({ role, label: roleLabel(role) }));
}

export interface PermissionsView {
  readonly version: number;
  readonly file: string;
  readonly bulkThreshold: number;
  readonly roles: readonly RoleColumn[];
  readonly rules: Rules;
  readonly fields: readonly FieldChoice[];
  readonly taskFields: readonly TaskField[];
}

export function permissionsView(
  rules: Rules,
  fields: readonly FieldChoice[],
  file: string,
): PermissionsView {
  return {
    version: rules.version,
    file,
    bulkThreshold: rules.bulk_threshold,
    roles: roleColumns(rules),
    rules,
    fields,
    taskFields: TASK_FIELDS,
  };
}

export type BuiltRules =
  | { readonly ok: true; readonly rules: Rules }
  | { readonly ok: false; readonly detail: string };

function effectOf(value: string | null): PolicyEffect | undefined {
  return value !== null && (EFFECTS as readonly string[]).includes(value) ? (value as PolicyEffect) : undefined;
}

/**
 * Turn one submitted form into the next rule file. The role and action lists
 * come from the file that is on disk, never from the form, so a tampered form
 * cannot add a role or an action. Every value is checked again by the gateway's
 * schema before the file is written.
 */
export function rulesFromForm(
  current: Rules,
  form: URLSearchParams,
  fields: readonly string[],
): BuiltRules {
  const thresholdText = (form.get('bulk_threshold') ?? '').trim();
  const threshold = /^[0-9]+$/.test(thresholdText) ? Number(thresholdText) : Number.NaN;

  const roles: Record<string, Record<TableAction, PolicyEffect>> = {};
  const employeeFields: Record<string, string[]> = {};

  for (const role of Object.keys(current.roles)) {
    const cells = {} as Record<TableAction, PolicyEffect>;
    for (const action of TABLE_ACTIONS) {
      const effect = effectOf(form.get(`cell.${role}.${action}`));
      if (effect === undefined) {
        return { ok: false, detail: `Thiếu hoặc sai lựa chọn cho ${role}.${action}.` };
      }
      cells[action] = effect;
    }
    roles[role] = cells;

    const submitted = form.getAll(`fields.${role}`);
    for (const field of submitted) {
      if (!fields.includes(field)) {
        return { ok: false, detail: `Trường ${field} không có trong danh sách trường đang hiện.` };
      }
    }
    employeeFields[role] = fields.filter((field) => submitted.includes(field));
  }

  const parsed = rulesSchema.safeParse({
    version: current.version + 1,
    bulk_threshold: threshold,
    roles,
    employee_fields: employeeFields,
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
