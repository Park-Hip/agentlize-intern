import { EMPLOYEE_ID_PATTERN } from '@lab/shared';
import { z } from 'zod';
import { HttpSystem, type HttpSystemOptions } from './http.js';
import type {
  ActionSpec,
  AdapterWrite,
  ApplyResult,
  FieldSpec,
  Filter,
  RecordDeclaration,
  ResourceAdapter,
} from './types.js';

/** One employee as the directory returns it: the code, the version and the stored fields. */
export type EmployeeRecord = Readonly<Record<string, string | number>>;

/**
 * The fields of an employee with the label a page or an answer shows.
 * `key` is the name the directory stores the field under, which is not always
 * the name the rule file uses.
 */
export const EMPLOYEE_FIELDS = [
  { name: 'id', label: 'Mã', key: 'employee_id' },
  { name: 'name', label: 'Tên', key: 'full_name' },
  { name: 'department', label: 'Phòng' },
  { name: 'role', label: 'Vai' },
  { name: 'work_email', label: 'Email công việc' },
  { name: 'personal_phone', label: 'Số điện thoại cá nhân' },
  { name: 'home_address', label: 'Địa chỉ nhà' },
] as const satisfies readonly FieldSpec[];

/** Rule files name employee fields `id` and `name`; the directory stores `employee_id` and `full_name`. */
export const DIRECTORY_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  EMPLOYEE_FIELDS.flatMap((field) => ('key' in field ? [[field.name, field.key] as const] : [])),
);

/** What each rule field is called on a page. A field new to the directory has no label and keeps its code. */
export const EMPLOYEE_FIELD_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  EMPLOYEE_FIELDS.map((field) => [field.name, field.label] as const),
);

/**
 * The rule actions of an employee and the fields each one changes. A new
 * changeable field is added here, with its action, and nowhere else in the
 * gateway (ADR-0007 sections 3.1 and 3.6).
 */
export const EMPLOYEE_ACTIONS: readonly ActionSpec[] = [
  {
    name: 'edit_work_email',
    label: 'Sửa email công việc',
    phrase: 'sửa email công việc của nhân viên',
    fields: ['work_email'],
  },
];

export const EMPLOYEE_DECLARATION: RecordDeclaration = {
  type: 'employee',
  label: 'Nhân viên',
  fields: EMPLOYEE_FIELDS,
  ownerField: 'department',
  actions: EMPLOYEE_ACTIONS,
};

const employeeSchema = z.record(z.string(), z.union([z.string(), z.number()]));
const employeeListSchema = z.object({ employees: z.array(employeeSchema) });

function query(filter: Filter, keys: readonly string[]): string {
  const search = new URLSearchParams();
  for (const key of keys) {
    const value = filter[key];
    if (value !== undefined) search.set(key, value);
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/** The fake directory as an adapter: reads by code or by name and department. */
export class DirectoryAdapter implements ResourceAdapter {
  readonly type = EMPLOYEE_DECLARATION.type;
  readonly label = EMPLOYEE_DECLARATION.label;
  readonly idPattern = EMPLOYEE_ID_PATTERN;
  readonly fields = EMPLOYEE_DECLARATION.fields;
  readonly ownerField = EMPLOYEE_DECLARATION.ownerField;
  readonly actions = EMPLOYEE_DECLARATION.actions;
  private readonly http: HttpSystem;

  constructor(options: HttpSystemOptions) {
    this.http = new HttpSystem('directory', options);
  }

  async get(id: string): Promise<EmployeeRecord | undefined> {
    const body = await this.http.get(`/employees/${encodeURIComponent(id)}`, [404]);
    return body === undefined ? undefined : this.http.parse(employeeSchema, body);
  }

  async list(filter: Filter): Promise<EmployeeRecord[]> {
    const body = await this.http.get(`/employees${query(filter, ['name', 'department'])}`);
    return this.http.parse(employeeListSchema, body).employees;
  }

  apply(write: AdapterWrite): Promise<ApplyResult> {
    return this.http.patch(
      `/employees/${encodeURIComponent(write.id)}`,
      { expected_version: write.expectedVersion, changes: write.changes },
      write.idempotencyKey,
      (body) => {
        const employee = employeeSchema.safeParse(body);
        return employee.success ? employee.data : undefined;
      },
    );
  }
}
