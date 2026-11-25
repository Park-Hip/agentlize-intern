import { z } from 'zod';
import { HttpSystem, type HttpSystemOptions } from './http.js';
import type {
  ActionSpec,
  AdapterWrite,
  ApplyResult,
  FieldSpec,
  Filter,
  RecordData,
  RecordDeclaration,
  ResourceAdapter,
} from './types.js';

/** The task list only ever holds codes of this shape. */
export const TASK_ID_PATTERN = /^T-[1-9][0-9]*$/;
export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;

/** How the gateway changes a task assignee: one PATCH, or Lark's two member calls. */
export const TASK_ASSIGNEE_MODES = ['patch', 'members'] as const;
export type TaskAssigneeMode = (typeof TASK_ASSIGNEE_MODES)[number];
export const TASK_ASSIGNEE_MODE_ENV = 'LAB_TASKS_ASSIGNEE_MODE';

/** Read the documented option; an unknown value stops the gateway instead of guessing. */
export function readTaskAssigneeMode(env: NodeJS.ProcessEnv = process.env): TaskAssigneeMode {
  const raw = env[TASK_ASSIGNEE_MODE_ENV]?.trim();
  if (raw === undefined || raw === '') return 'patch';
  if ((TASK_ASSIGNEE_MODES as readonly string[]).includes(raw)) return raw as TaskAssigneeMode;
  throw new Error(`${TASK_ASSIGNEE_MODE_ENV} must be one of ${TASK_ASSIGNEE_MODES.join(', ')}; got "${raw}"`);
}

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
 * The same task plus the member list, read only when the gateway must remove
 * the other members. It never leaves the adapter, so a page or a rule keeps
 * seeing the old eight fields.
 */
const taskWithMembersSchema = taskSchema.extend({ assignees: z.array(z.string()).optional() });
type TaskWithMembers = z.infer<typeof taskWithMembersSchema>;

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

export interface TasksAdapterOptions extends HttpSystemOptions {
  /** `patch` keeps the old path; `members` uses add_members then remove_members. */
  readonly assigneeMode?: TaskAssigneeMode;
}

/** The task list as an adapter: reads by code or by filter, one PATCH or Lark's two member calls. */
export class TasksAdapter implements ResourceAdapter {
  readonly type = TASK_DECLARATION.type;
  readonly label = TASK_DECLARATION.label;
  readonly idPattern = TASK_ID_PATTERN;
  readonly fields = TASK_DECLARATION.fields;
  readonly ownerField = TASK_DECLARATION.ownerField;
  readonly actions = TASK_DECLARATION.actions;
  private readonly http: HttpSystem;
  private readonly assigneeMode: TaskAssigneeMode;

  constructor(options: TasksAdapterOptions) {
    this.http = new HttpSystem('tasks', options);
    this.assigneeMode = options.assigneeMode ?? 'patch';
  }

  async get(id: string): Promise<TaskRecord | undefined> {
    const body = await this.http.get(`/tasks/${encodeURIComponent(id)}`, [404]);
    return body === undefined ? undefined : this.http.parse(taskSchema, body);
  }

  /** The task with its full member list; only the reassign path needs it. */
  private async readWithMembers(id: string): Promise<TaskWithMembers | undefined> {
    const body = await this.http.get(`/tasks/${encodeURIComponent(id)}`, [404]);
    return body === undefined ? undefined : this.http.parse(taskWithMembersSchema, body);
  }

  async list(filter: Filter): Promise<TaskRecord[]> {
    const body = await this.http.get(`/tasks${query(filter, ['assignee', 'department', 'status'])}`);
    return this.http.parse(taskListSchema, body).tasks;
  }

  apply(write: AdapterWrite): Promise<ApplyResult> {
    const assignee = write.changes['assignee'];
    if (this.assigneeMode === 'members' && assignee !== undefined) {
      return this.reassign(write, assignee);
    }
    return this.patch(write, write.changes);
  }

  private patch(write: AdapterWrite, changes: AdapterWrite['changes']): Promise<ApplyResult> {
    return this.http.patch(
      `/tasks/${encodeURIComponent(write.id)}`,
      { changes, expected_version: write.expectedVersion },
      write.idempotencyKey,
      taskOf,
    );
  }

  /**
   * Lark Task's reassignment. Add the new member first with the command key,
   * then remove every other member: the Lab model is one assignee per task, so
   * "every other member" is exactly what reassigning means here. A due change
   * in the same item still goes through PATCH, before the member calls, so a
   * refused due leaves the members untouched.
   */
  private async reassign(write: AdapterWrite, assignee: string): Promise<ApplyResult> {
    const current = await this.readWithMembers(write.id);
    if (current === undefined) return { kind: 'not_found' };
    // A resend after a remove that landed sees only the new member, so there is
    // nothing left to remove; a resend after an add sees both and removes the
    // old one. Reading the current list is enough for both cases.
    const otherMembers = (current.assignees ?? [current.assignee]).filter((member) => member !== assignee);

    const due = write.changes['due'];
    if (due !== undefined) {
      const patched = await this.patch(write, { due });
      if (patched.kind !== 'written') return patched;
    }

    const added = await this.http.post(
      `/tasks/${encodeURIComponent(write.id)}/add_members`,
      { members: [assignee] },
      write.idempotencyKey,
      taskOf,
      taskIdOf,
    );
    if (added.kind !== 'created') return added;

    for (const member of otherMembers) {
      const removed = await this.http.post(
        `/tasks/${encodeURIComponent(write.id)}/remove_members`,
        { members: [member] },
        undefined,
        taskOf,
        taskIdOf,
      );
      if (removed.kind !== 'created') return removed;
    }

    const final = await this.get(write.id);
    if (final === undefined) return { kind: 'not_found' };
    return { kind: 'written', record: final, version: final.version, replayed: added.replayed };
  }
}

function taskOf(body: unknown): TaskRecord | undefined {
  const task = taskSchema.safeParse((body as { task?: unknown }).task);
  return task.success ? task.data : undefined;
}

function taskIdOf(record: RecordData): string | undefined {
  return typeof record['id'] === 'string' ? record['id'] : undefined;
}
