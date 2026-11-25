import { DirectoryAdapter } from './directory.js';
import { LeaveAdapter } from './leave.js';
import { TasksAdapter } from './tasks.js';
import type { ResourceAdapter } from './types.js';

/**
 * The system adapters: one entry per record type, in one list.
 * Tools, pages and the write path read this list and never name a system
 * directly (ADR-0007 section 3.1).
 */
export * from './types.js';
export { DEFAULT_SYSTEM_TIMEOUT_MS, HttpSystem, SystemUnavailableError, systemUrl } from './http.js';
export { ADAPTER_DECLARATIONS, actionsByType } from './registry.js';
export {
  DIRECTORY_KEY,
  DirectoryAdapter,
  EMPLOYEE_ACTIONS,
  EMPLOYEE_DECLARATION,
  EMPLOYEE_FIELD_LABELS,
  EMPLOYEE_FIELDS,
} from './directory.js';
export type { EmployeeRecord } from './directory.js';
export {
  TASK_ACTIONS,
  TASK_DECLARATION,
  TASK_FIELDS,
  TASK_ID_PATTERN,
  TASK_STATUSES,
  TasksAdapter,
  taskSchema,
} from './tasks.js';
export type { TaskField, TaskRecord } from './tasks.js';
export {
  LEAVE_ACTIONS,
  LEAVE_DECLARATION,
  LEAVE_FIELDS,
  LEAVE_ID_PATTERN,
  LEAVE_STATUSES,
  LEAVE_TYPES,
  LeaveAdapter,
  leaveSchema,
} from './leave.js';
export type { LeaveField, LeaveRecord } from './leave.js';

export interface HttpAdaptersOptions {
  readonly directoryUrl: string;
  readonly tasksUrl: string;
  readonly leaveUrl: string;
  readonly serviceKey: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

/** The registry the gateway starts with: one HTTP adapter for each fake system. */
export function createHttpAdapters(options: HttpAdaptersOptions): readonly ResourceAdapter[] {
  const shared = {
    serviceKey: options.serviceKey,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  };
  return [
    new TasksAdapter({ url: options.tasksUrl, ...shared }),
    new LeaveAdapter({ url: options.leaveUrl, ...shared }),
    new DirectoryAdapter({ url: options.directoryUrl, ...shared }),
  ];
}

/** The adapter for one record type. Throws when the registry has none, because that is a wiring bug. */
export function adapterOf(adapters: readonly ResourceAdapter[], type: string): ResourceAdapter {
  const adapter = adapters.find((candidate) => candidate.type === type);
  if (adapter === undefined) throw new Error(`no adapter for record type "${type}"`);
  return adapter;
}
