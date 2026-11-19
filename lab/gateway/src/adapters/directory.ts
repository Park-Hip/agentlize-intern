import { EMPLOYEE_ID_PATTERN } from '@lab/shared';
import { z } from 'zod';
import type { TableAction } from '../policy/schema.js';
import { HttpSystem, type HttpSystemOptions } from './http.js';
import type { AdapterWrite, ApplyResult, FieldSpec, Filter, ResourceAdapter } from './types.js';

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

/** A changeable employee field and the rule action it needs. */
export const EMPLOYEE_CHANGEABLE: Readonly<Record<string, TableAction>> = {
  work_email: 'edit_work_email',
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
  readonly type = 'employee';
  readonly idPattern = EMPLOYEE_ID_PATTERN;
  readonly fields = EMPLOYEE_FIELDS;
  readonly ownerField = 'department';
  readonly changeable = EMPLOYEE_CHANGEABLE;
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
