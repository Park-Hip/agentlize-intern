import { LOOPBACK_HOST, resolvePort, type ServiceName } from '@lab/shared';
import { z } from 'zod';
import type { Changes } from './proposals/fingerprint.js';

/** A fake system did not answer in a way the gateway can use. */
export class SystemUnavailableError extends Error {
  constructor(
    readonly system: 'directory' | 'tasks',
    detail: string,
  ) {
    super(`${system}: ${detail}`);
  }
}

/** One employee as the directory returns it: the code, the version and the stored fields. */
export type EmployeeRecord = Readonly<Record<string, string | number>>;

const employeeSchema = z.record(z.string(), z.union([z.string(), z.number()]));
const employeeListSchema = z.object({ employees: z.array(employeeSchema) });

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
const taskListSchema = z.object({ tasks: z.array(taskSchema) });

export interface EmployeeSearch {
  readonly name?: string | undefined;
  readonly department?: string | undefined;
}

export interface TaskSearch {
  readonly assignee?: string | undefined;
  readonly department?: string | undefined;
  readonly status?: string | undefined;
}

/** One write as the task list takes it: the four changeable fields, the version seen and one fixed key. */
export interface TaskPatch {
  readonly taskId: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly changes: Changes;
}

/**
 * What the task list said about one write. `unavailable` means the answer never
 * arrived, so the write may or may not have happened; only a resend with the
 * same key can settle it.
 */
export type TaskPatchResult =
  | { readonly kind: 'written'; readonly task: TaskRecord; readonly replayed: boolean }
  | { readonly kind: 'conflict'; readonly currentVersion: number | null }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'rejected'; readonly status: number; readonly error: string }
  | { readonly kind: 'unavailable'; readonly detail: string };

/** What the gateway needs from the two fake systems. Tests may replace it. */
export interface Systems {
  getEmployee(employeeId: string): Promise<EmployeeRecord | undefined>;
  findEmployees(search: EmployeeSearch): Promise<EmployeeRecord[]>;
  getTask(taskId: string): Promise<TaskRecord | undefined>;
  listTasks(search: TaskSearch): Promise<TaskRecord[]>;
  patchTask(input: TaskPatch): Promise<TaskPatchResult>;
}

export interface HttpSystemsOptions {
  readonly directoryUrl: string;
  readonly tasksUrl: string;
  /** The shared secret of the three services. Sent as a Bearer key and never logged. */
  readonly serviceKey: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

/** Calls to the fake systems stop after this long, well inside the host's 60 second cut. */
export const DEFAULT_SYSTEM_TIMEOUT_MS = 5_000;

export function systemUrl(service: ServiceName, env: NodeJS.ProcessEnv = process.env): string {
  return `http://${LOOPBACK_HOST}:${resolvePort(service, env)}`;
}

/** Reads the two fake systems over HTTP with the service key. Nothing is cached. */
export class HttpSystems implements Systems {
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(private readonly options: HttpSystemsOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_SYSTEM_TIMEOUT_MS;
    this.doFetch = options.fetch ?? fetch;
  }

  async getEmployee(employeeId: string): Promise<EmployeeRecord | undefined> {
    const body = await this.get('directory', `/employees/${encodeURIComponent(employeeId)}`, [404]);
    return body === undefined ? undefined : this.parse('directory', employeeSchema, body);
  }

  async findEmployees(search: EmployeeSearch): Promise<EmployeeRecord[]> {
    const body = await this.get('directory', `/employees${query(search)}`);
    return this.parse('directory', employeeListSchema, body).employees;
  }

  async getTask(taskId: string): Promise<TaskRecord | undefined> {
    const body = await this.get('tasks', `/tasks/${encodeURIComponent(taskId)}`, [404]);
    return body === undefined ? undefined : this.parse('tasks', taskSchema, body);
  }

  async listTasks(search: TaskSearch): Promise<TaskRecord[]> {
    const body = await this.get('tasks', `/tasks${query(search)}`);
    return this.parse('tasks', taskListSchema, body).tasks;
  }

  /**
   * One PATCH with the fixed key. A dropped connection, a timeout or a 5xx
   * answer is `unavailable`: the gateway must keep the command and try again
   * with the same key rather than guess.
   */
  async patchTask(input: TaskPatch): Promise<TaskPatchResult> {
    let response: Response;
    let text: string;
    try {
      response = await this.doFetch(`${this.options.tasksUrl}/tasks/${encodeURIComponent(input.taskId)}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${this.options.serviceKey}`,
          'content-type': 'application/json',
          'idempotency-key': input.idempotencyKey,
        },
        body: JSON.stringify({ changes: input.changes, expected_version: input.expectedVersion }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'error';
      return { kind: 'unavailable', detail: `request failed (${reason})` };
    }

    if (response.status === 409) {
      let currentVersion: number | null = null;
      try {
        const body = JSON.parse(text) as { current_version?: unknown };
        if (typeof body.current_version === 'number') currentVersion = body.current_version;
      } catch {
        // The conflict is still a conflict; the version is only extra detail.
      }
      return { kind: 'conflict', currentVersion };
    }
    if (response.status === 404) return { kind: 'not_found' };
    if (response.status >= 500) return { kind: 'unavailable', detail: `HTTP ${response.status}` };
    if (response.status < 200 || response.status >= 300) {
      return { kind: 'rejected', status: response.status, error: errorText(text) };
    }

    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return { kind: 'unavailable', detail: 'reply is not JSON' };
    }
    const task = taskSchema.safeParse((body as { task?: unknown }).task);
    if (!task.success) return { kind: 'unavailable', detail: 'reply has an unexpected shape' };
    return { kind: 'written', task: task.data, replayed: response.headers.get('idempotent-replayed') === 'true' };
  }

  /** Returns the JSON body, or undefined for a status listed in `absent`. Anything else that is not 200 throws. */
  private async get(system: 'directory' | 'tasks', path: string, absent: readonly number[] = []): Promise<unknown> {
    const base = system === 'directory' ? this.options.directoryUrl : this.options.tasksUrl;
    let response: Response;
    let text: string;
    try {
      response = await this.doFetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${this.options.serviceKey}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'error';
      throw new SystemUnavailableError(system, `request failed (${reason})`);
    }

    if (absent.includes(response.status)) return undefined;
    if (response.status !== 200) throw new SystemUnavailableError(system, `HTTP ${response.status}`);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new SystemUnavailableError(system, 'reply is not JSON');
    }
  }

  private parse<S extends z.ZodType>(system: 'directory' | 'tasks', schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new SystemUnavailableError(system, 'reply has an unexpected shape');
    return parsed.data;
  }
}

/** The `error` field of a refusal from the task list, for the command's saved result. */
function errorText(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : 'unexpected_reply';
  } catch {
    return 'unexpected_reply';
  }
}

function query(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') search.set(key, value);
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}
