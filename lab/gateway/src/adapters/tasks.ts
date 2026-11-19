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

/** The task list only ever holds codes of this shape. */
export const TASK_ID_PATTERN = /^T-[1-9][0-9]*$/;
export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;

/** Only these task fields are ever read; a field added to the task list later is dropped here. */
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  assignee: z.string(),
  department: z.string(),
  status: z.string(),
  due: z.string(),
  version: z.number(),
});
export type TaskRecord = z.infer<typeof taskSchema>;

/**
 * The fields of a task with the label a page or an answer shows.
 * Change it in the same commit that changes `taskLine` or `taskDetail`.
 */
export const TASK_FIELDS = [
  { name: 'id', label: 'Mã' },
  { name: 'title', label: 'Tiêu đề' },
  { name: 'description', label: 'Mô tả' },
  { name: 'department', label: 'Phòng' },
  { name: 'assignee', label: 'Người phụ trách' },
  { name: 'status', label: 'Trạng thái' },
  { name: 'due', label: 'Hạn' },
  { name: 'version', label: 'Phiên bản' },
] as const satisfies readonly FieldSpec[];

export type TaskField = (typeof TASK_FIELDS)[number];

/**
 * The rule actions of a task and the fields each one changes. The adapter
 * declares them once: the rule schema, the console, the confirmation card and
 * the refusal sentences read this list (ADR-0007 sections 3.1 and 3.2).
 */
export const TASK_ACTIONS: readonly ActionSpec[] = [
  {
    name: 'edit_task_description',
    label: 'Sửa mô tả task',
    phrase: 'sửa mô tả task',
    fields: ['description'],
  },
  {
    name: 'change_task_status',
    label: 'Đổi trạng thái task',
    phrase: 'đổi trạng thái task',
    fields: ['status'],
  },
  {
    name: 'change_task_assignee_or_due',
    label: 'Đổi người phụ trách hoặc hạn',
    phrase: 'đổi người phụ trách hoặc hạn của task',
    fields: ['assignee', 'due'],
  },
];

export const TASK_DECLARATION: RecordDeclaration = {
  type: 'task',
  label: 'Task',
  fields: TASK_FIELDS,
  ownerField: 'department',
  actions: TASK_ACTIONS,
};

const taskListSchema = z.object({ tasks: z.array(taskSchema) });

function query(filter: Filter, keys: readonly string[]): string {
  const search = new URLSearchParams();
  for (const key of keys) {
    const value = filter[key];
    if (value !== undefined) search.set(key, value);
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/** The fake task list as an adapter: reads by code or by filter, one versioned PATCH. */
export class TasksAdapter implements ResourceAdapter {
  readonly type = TASK_DECLARATION.type;
  readonly label = TASK_DECLARATION.label;
  readonly idPattern = TASK_ID_PATTERN;
  readonly fields = TASK_DECLARATION.fields;
  readonly ownerField = TASK_DECLARATION.ownerField;
  readonly actions = TASK_DECLARATION.actions;
  private readonly http: HttpSystem;

  constructor(options: HttpSystemOptions) {
    this.http = new HttpSystem('tasks', options);
  }

  async get(id: string): Promise<TaskRecord | undefined> {
    const body = await this.http.get(`/tasks/${encodeURIComponent(id)}`, [404]);
    return body === undefined ? undefined : this.http.parse(taskSchema, body);
  }

  async list(filter: Filter): Promise<TaskRecord[]> {
    const body = await this.http.get(`/tasks${query(filter, ['assignee', 'department', 'status'])}`);
    return this.http.parse(taskListSchema, body).tasks;
  }

  apply(write: AdapterWrite): Promise<ApplyResult> {
    return this.http.patch(
      `/tasks/${encodeURIComponent(write.id)}`,
      { changes: write.changes, expected_version: write.expectedVersion },
      write.idempotencyKey,
      (body) => {
        const task = taskSchema.safeParse((body as { task?: unknown }).task);
        return task.success ? task.data : undefined;
      },
    );
  }
}
