import { z } from 'zod';
import { HttpSystem, type HttpSystemOptions } from './http.js';
import type {
  ActionSpec,
  AdapterCreate,
  AdapterWrite,
  ApplyResult,
  FieldSpec,
  Filter,
  RecordDeclaration,
  ResourceAdapter,
} from './types.js';

/** A leave request code looks like `NP-1`; the source system never reuses one. */
export const LEAVE_ID_PATTERN = /^NP-[1-9][0-9]*$/;

export const LEAVE_TYPES = ['annual', 'sick', 'personal', 'unpaid'] as const;
export const LEAVE_STATUSES = ['pending', 'approved', 'rejected'] as const;

/**
 * The source system stores no version on a leave request: a create is new and
 * the fixed idempotency key is what makes a repeat safe (write-safety-options
 * section 13 point 5). `request_key` is that marker on the row.
 */
export const leaveSchema = z.object({
  code: z.string(),
  employee: z.string(),
  department: z.string(),
  leave_type: z.string(),
  from_date: z.string(),
  to_date: z.string(),
  reason: z.string(),
  note: z.string(),
  status: z.string(),
  request_key: z.string(),
  created_at: z.string(),
  decided_at: z.string(),
});
export type LeaveRecord = z.infer<typeof leaveSchema>;

/** The fields a page or an answer shows. `request_key` stays out of them. */
export const LEAVE_FIELDS = [
  { name: 'code', label: 'Mã đơn' },
  { name: 'employee', label: 'Nhân viên' },
  { name: 'department', label: 'Phòng' },
  { name: 'leave_type', label: 'Loại nghỉ', values: { annual: 'Phép năm', sick: 'Nghỉ ốm', personal: 'Việc riêng', unpaid: 'Không lương' } },
  { name: 'from_date', label: 'Từ ngày' },
  { name: 'to_date', label: 'Đến ngày' },
  { name: 'reason', label: 'Lý do' },
  { name: 'note', label: 'Nội dung' },
  { name: 'status', label: 'Trạng thái' },
  { name: 'created_at', label: 'Tạo lúc' },
  { name: 'decided_at', label: 'Quyết định lúc' },
] as const satisfies readonly FieldSpec[];

export type LeaveField = (typeof LEAVE_FIELDS)[number];

/** The one action a person may take on this system: ask for a new request. */
export const LEAVE_ACTIONS: readonly ActionSpec[] = [
  {
    name: 'create_leave_request',
    label: 'Tạo đơn nghỉ phép',
    phrase: 'tạo đơn nghỉ phép',
    fields: ['employee', 'leave_type', 'from_date', 'to_date', 'reason', 'note'],
  },
];

export const LEAVE_DECLARATION: RecordDeclaration = {
  type: 'leave',
  label: 'Đơn nghỉ phép',
  fields: LEAVE_FIELDS,
  ownerField: 'department',
  statusField: 'status',
  statusLabels: {
    pending: 'đang chờ quản lý duyệt',
    approved: 'đã được duyệt',
    rejected: 'bị từ chối',
  },
  actions: LEAVE_ACTIONS,
};

const leaveListSchema = z.object({ requests: z.array(leaveSchema) });

function query(filter: Filter, keys: readonly string[]): string {
  const search = new URLSearchParams();
  for (const key of keys) {
    const value = filter[key];
    if (value !== undefined) search.set(key, value);
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/**
 * The fake leave system as an adapter. It reads by code or by employee and
 * leave date, and its only write is a create: the source system has no update
 * route, because a request is withdrawn or decided there, not edited.
 */
export class LeaveAdapter implements ResourceAdapter {
  readonly type = LEAVE_DECLARATION.type;
  readonly label = LEAVE_DECLARATION.label;
  readonly idPattern = LEAVE_ID_PATTERN;
  readonly fields = LEAVE_DECLARATION.fields;
  readonly ownerField = LEAVE_DECLARATION.ownerField;
  readonly statusField = 'status';
  readonly statusLabels: Readonly<Record<string, string>> = {
    pending: 'đang chờ quản lý duyệt',
    approved: 'đã được duyệt',
    rejected: 'bị từ chối',
  };
  readonly actions = LEAVE_DECLARATION.actions;
  private readonly http: HttpSystem;

  constructor(options: HttpSystemOptions) {
    this.http = new HttpSystem('leave', options);
  }

  async get(id: string): Promise<LeaveRecord | undefined> {
    const body = await this.http.get(`/leave-requests/${encodeURIComponent(id)}`, [404]);
    return body === undefined ? undefined : this.http.parse(leaveSchema, body);
  }

  async list(filter: Filter): Promise<LeaveRecord[]> {
    const body = await this.http.get(`/leave-requests${query(filter, ['employee', 'date', 'status'])}`);
    return this.http.parse(leaveListSchema, body).requests;
  }

  /** A leave request is never edited in place; the rule file declares no update action. */
  apply(_write: AdapterWrite): Promise<ApplyResult> {
    return Promise.resolve({ kind: 'rejected', status: 405, error: 'updates_not_supported' });
  }

  create(write: AdapterCreate): Promise<ApplyResult> {
    return this.http.post(
      '/leave-requests',
      write.changes,
      write.idempotencyKey,
      (body) => {
        const request = leaveSchema.safeParse((body as { request?: unknown }).request);
        return request.success ? request.data : undefined;
      },
      (record) => (typeof record['code'] === 'string' ? record['code'] : undefined),
    );
  }
}
