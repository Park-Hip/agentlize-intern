import { LOOPBACK_HOST, resolvePort, type ServiceName } from '@lab/shared';
import { z } from 'zod';

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

/** What the gateway needs from the two fake systems. Tests may replace it. */
export interface Systems {
  getEmployee(employeeId: string): Promise<EmployeeRecord | undefined>;
  findEmployees(search: EmployeeSearch): Promise<EmployeeRecord[]>;
  getTask(taskId: string): Promise<TaskRecord | undefined>;
  listTasks(search: TaskSearch): Promise<TaskRecord[]>;
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

function query(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') search.set(key, value);
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}
