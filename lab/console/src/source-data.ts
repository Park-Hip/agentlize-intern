import type { Employee } from './upstream.js';

/** 100 seeded tasks, 20 to a page: five pages, and a filtered list keeps the same step. */
export const TASK_PAGE_SIZE = 20;

export interface Paged<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

/** A page number from the URL; anything that is not a whole number above zero means the first page. */
export function parsePage(value: string | null): number {
  if (value === null) return 1;
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function paginate<T>(items: readonly T[], requestedPage: number, pageSize = TASK_PAGE_SIZE): Paged<T> {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pages);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pages, total: items.length };
}

/** Fields the lab knows, shown first and in this order; any other field follows alphabetically. */
const PREFERRED_EMPLOYEE_FIELDS = ['full_name', 'department', 'role', 'work_email', 'personal_phone', 'home_address'];

/**
 * The columns of the directory table come from the data, not from a fixed list,
 * so a field added through `POST /admin/add-field` appears with its own name
 * (ADR-0006 section 3.4).
 */
export function employeeColumns(employees: readonly Employee[]): readonly string[] {
  const present = new Set<string>();
  for (const employee of employees) {
    for (const key of Object.keys(employee.fields)) present.add(key);
  }
  const preferred = PREFERRED_EMPLOYEE_FIELDS.filter((key) => present.has(key));
  const rest = [...present].filter((key) => !PREFERRED_EMPLOYEE_FIELDS.includes(key)).sort((left, right) => left.localeCompare(right));
  return [...preferred, ...rest];
}

/** One stored value as text. An empty string is shown as such instead of disappearing from the cell. */
export function fieldText(value: unknown): string {
  if (value === undefined || value === null) return '(không có)';
  if (typeof value === 'string') return value === '' ? '(trống)' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '(không có)';
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  todo: 'Chưa làm',
  doing: 'Đang làm',
  done: 'Xong',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}
