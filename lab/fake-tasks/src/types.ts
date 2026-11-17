export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const DEPARTMENTS = ['Vận hành', 'Kinh doanh'] as const;

export type Department = (typeof DEPARTMENTS)[number];

/** The four fields a write may change. Everything else is fixed after seeding. */
export const CHANGEABLE_FIELDS = ['assignee', 'due', 'description', 'status'] as const;

export type ChangeableField = (typeof CHANGEABLE_FIELDS)[number];

export interface Task {
  /** `T-12`. Stable for the life of the data. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Employee code such as `NV-03`. The directory owns what the code means. */
  readonly assignee: string;
  readonly department: Department;
  readonly status: TaskStatus;
  /** Calendar date `YYYY-MM-DD`. */
  readonly due: string;
  /** Starts at 1 and grows by 1 on every committed write. */
  readonly version: number;
}

export type TaskChanges = Partial<Pick<Task, ChangeableField>>;
