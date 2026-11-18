import { GUEST, PERSONAS } from '@lab/shared';
import type { Employee, LabService, ProbeResult, RuleInfo, ServiceEndpoints, ToolEntry } from './upstream.js';

export interface PersonaRow {
  readonly employeeId: string;
  readonly name: string;
  readonly role: string;
  readonly department: string;
  readonly guest: boolean;
}

const ROLE_LABEL: Readonly<Record<string, string>> = {
  intern: 'Thực tập sinh',
  staff: 'Nhân viên',
  lead: 'Trưởng nhóm',
  hr: 'Nhân sự',
};

export function roleLabel(role: string | undefined): string {
  if (role === undefined) return '(trống)';
  const label = ROLE_LABEL[role];
  return label === undefined ? role : `${label} (${role})`;
}

function directoryField(value: string | undefined, directoryRead: boolean): string {
  if (value !== undefined) return value;
  return directoryRead ? 'Không có trong danh bạ' : 'Chưa đọc được';
}

/** The six fixed characters, ordered by code, then the guest who has no directory entry. */
const ORDERED_PERSONAS = Object.values(PERSONAS).sort((left, right) => left.employeeId.localeCompare(right.employeeId));

export function personaRows(employees: readonly Employee[] | undefined): readonly PersonaRow[] {
  const directoryRead = employees !== undefined;
  const byId = new Map((employees ?? []).map((employee) => [employee.employeeId, employee]));

  const rows = ORDERED_PERSONAS.map((persona): PersonaRow => {
    const employee = byId.get(persona.employeeId);
    return {
      employeeId: persona.employeeId,
      name: directoryField(employee?.fullName, directoryRead),
      role: employee?.role === undefined ? directoryField(undefined, directoryRead) : roleLabel(employee.role),
      department: directoryField(employee?.department, directoryRead),
      guest: false,
    };
  });

  rows.push({
    employeeId: GUEST.employeeId,
    name: 'Khách',
    role: 'Không có vai',
    department: 'Không có',
    guest: true,
  });
  return rows;
}

export interface PersonaChoice {
  readonly employeeId: string;
  readonly name: string;
  readonly role: string;
  readonly department: string;
}

/**
 * The six characters with the role and department the directory reports now.
 * The permission question must use the directory, not a copy of the persona
 * list, because a test can change a role there. A character missing from the
 * directory cannot be asked about: its role would be a guess.
 */
export function personaChoices(employees: readonly Employee[]): readonly PersonaChoice[] {
  const byId = new Map(employees.map((employee) => [employee.employeeId, employee]));
  const choices: PersonaChoice[] = [];
  for (const persona of ORDERED_PERSONAS) {
    const employee = byId.get(persona.employeeId);
    if (employee?.role === undefined || employee.department === undefined) continue;
    choices.push({
      employeeId: persona.employeeId,
      name: employee.fullName ?? persona.fullName,
      role: employee.role,
      department: employee.department,
    });
  }
  return choices;
}

export interface ServiceStatus {
  readonly label: string;
  readonly port: number;
  readonly ok: boolean;
  readonly detail: string;
}

export function serviceStatuses(
  endpoints: ServiceEndpoints,
  outcomes: Readonly<Record<LabService, ProbeResult>>,
): readonly ServiceStatus[] {
  return Object.values(endpoints).map((endpoint) => {
    const outcome = outcomes[endpoint.name];
    return {
      label: endpoint.label,
      port: endpoint.port,
      ok: outcome.ok,
      detail: outcome.ok ? 'Trả lời /health.' : `${outcome.detail}.`,
    };
  });
}

export interface ToolParamRow {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly nested: boolean;
}

export interface ToolRow {
  readonly name: string;
  readonly description: string;
  readonly kind: 'read' | 'propose';
  readonly params: readonly ToolParamRow[];
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requiredNames(schema: Readonly<Record<string, unknown>>): ReadonlySet<string> {
  const required = schema['required'];
  return new Set(Array.isArray(required) ? required.filter((value): value is string => typeof value === 'string') : []);
}

function typeOf(schema: unknown): string {
  const record = asRecord(schema);
  if (record === undefined) return 'không rõ';
  if (Array.isArray(record['enum'])) return 'enum';
  const type = record['type'];
  if (typeof type === 'string') return type;

  const alternatives = record['anyOf'] ?? record['oneOf'];
  if (Array.isArray(alternatives)) {
    const types = [...new Set(alternatives.map((alternative) => typeOf(alternative)))];
    return types.join(' | ');
  }
  return 'không rõ';
}

/** Top-level parameters plus the fields of a nested object, named `parent.child` so the row is unambiguous. */
export function paramsOf(inputSchema: Readonly<Record<string, unknown>>): readonly ToolParamRow[] {
  const properties = asRecord(inputSchema['properties']);
  if (properties === undefined) return [];

  const required = requiredNames(inputSchema);
  const rows: ToolParamRow[] = [];
  for (const [name, schema] of Object.entries(properties)) {
    rows.push({ name, type: typeOf(schema), required: required.has(name), nested: false });

    const record = asRecord(schema);
    const children = record === undefined ? undefined : asRecord(record['properties']);
    if (record === undefined || children === undefined) continue;
    const nestedRequired = requiredNames(record);
    for (const [childName, childSchema] of Object.entries(children)) {
      rows.push({
        name: `${name}.${childName}`,
        type: typeOf(childSchema),
        required: nestedRequired.has(childName),
        nested: true,
      });
    }
  }
  return rows;
}

export function toolRows(tools: readonly ToolEntry[]): readonly ToolRow[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    kind: tool.kind,
    params: paramsOf(tool.inputSchema),
  }));
}

export type RuleView = RuleInfo;
