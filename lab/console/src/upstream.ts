import { basename } from 'node:path';
import { performance } from 'node:perf_hooks';
import { LOOPBACK_HOST, resolvePort, toolResponseSchema } from '@lab/shared';
import { z } from 'zod';
import { loadRules } from './rules.js';

/** A call to another lab process stops here, so one slow service cannot hold a page open for long. */
export const UPSTREAM_TIMEOUT_MS = 2_000;

/** A tool call may read a proposal, a task and the directory, so it gets longer than a status read. */
export const TOOL_CALL_TIMEOUT_MS = 15_000;

/** The three services the overview reports on and the tool screen reads. */
export type LabService = 'gateway' | 'directory' | 'tasks';

export interface ServiceEndpoint {
  readonly name: LabService;
  readonly label: string;
  readonly port: number;
  readonly url: string;
}

export type ServiceEndpoints = Readonly<Record<LabService, ServiceEndpoint>>;

function endpoint(name: LabService, label: string, env: NodeJS.ProcessEnv): ServiceEndpoint {
  const port = resolvePort(name, env);
  return { name, label, port, url: `http://${LOOPBACK_HOST}:${port}` };
}

/** Addresses come from the same port variables the start script passes to every process. */
export function serviceEndpoints(env: NodeJS.ProcessEnv): ServiceEndpoints {
  return {
    gateway: endpoint('gateway', 'Cổng', env),
    directory: endpoint('directory', 'Danh bạ giả', env),
    tasks: endpoint('tasks', 'Task giả', env),
  };
}

export type ProbeResult = { readonly ok: true } | { readonly ok: false; readonly detail: string };

export type Fetched = { readonly ok: true; readonly body: unknown } | { readonly ok: false; readonly detail: string };

function describe(error: unknown): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return `Không trả lời trong ${UPSTREAM_TIMEOUT_MS / 1_000} giây`;
  }
  return 'Không nối được';
}

async function get(url: string, headers: Readonly<Record<string, string>>): Promise<Fetched> {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    try {
      return { ok: true, body: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, detail: 'Trả lời không phải JSON' };
    }
  } catch (error) {
    return { ok: false, detail: describe(error) };
  }
}

const healthSchema = z.object({ status: z.literal('ok'), service: z.string() });

/**
 * A health check proves both that the port answers and that the process there
 * is the one the console expects. The service key is sent to every service,
 * because the fake systems reject even `/health` without it.
 */
export async function probe(endpoint: ServiceEndpoint, serviceKey: string): Promise<ProbeResult> {
  const result = await get(`${endpoint.url}/health`, { authorization: `Bearer ${serviceKey}` });
  if (!result.ok) return result;

  const parsed = healthSchema.safeParse(result.body);
  if (!parsed.success || parsed.data.service !== endpoint.name) {
    return { ok: false, detail: 'Trả lời không đúng dịch vụ' };
  }
  return { ok: true };
}

const employeeSchema = z
  .object({
    employee_id: z.string(),
    full_name: z.string().optional(),
    role: z.string().optional(),
    department: z.string().optional(),
  })
  .catchall(z.unknown());

const employeesSchema = z.object({ employees: z.array(employeeSchema) }).catchall(z.unknown());

export interface Employee {
  readonly employeeId: string;
  readonly version: number | undefined;
  readonly fullName: string | undefined;
  readonly role: string | undefined;
  readonly department: string | undefined;
  /** Every field the directory stores, keyed as the system sends it, for the raw data screen. */
  readonly fields: Readonly<Record<string, unknown>>;
}

export type EmployeeResult =
  | { readonly ok: true; readonly employees: readonly Employee[] }
  | { readonly ok: false; readonly detail: string };

/** Every field of one employee except the code and the version, which get their own columns. */
function fieldsOf(employee: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(employee)) {
    if (key !== 'employee_id' && key !== 'version') fields[key] = value;
  }
  return fields;
}

/** The whole directory in one call, optionally narrowed to one department by the service. */
export async function fetchEmployees(
  endpoint: ServiceEndpoint,
  serviceKey: string,
  department?: string,
): Promise<EmployeeResult> {
  const query = department === undefined ? '' : `?department=${encodeURIComponent(department)}`;
  const result = await get(`${endpoint.url}/employees${query}`, { authorization: `Bearer ${serviceKey}` });
  if (!result.ok) return result;

  const parsed = employeesSchema.safeParse(result.body);
  if (!parsed.success) return { ok: false, detail: 'Danh sách nhân viên không đúng định dạng' };
  return {
    ok: true,
    employees: parsed.data.employees.map((employee) => ({
      employeeId: employee.employee_id,
      version: typeof employee['version'] === 'number' ? employee['version'] : undefined,
      fullName: employee.full_name,
      role: employee.role,
      department: employee.department,
      fields: fieldsOf(employee),
    })),
  };
}

const taskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    assignee: z.string(),
    department: z.string(),
    status: z.string(),
    due: z.string(),
    version: z.number(),
  })
  .catchall(z.unknown());

const tasksSchema = z.object({ tasks: z.array(taskSchema) }).catchall(z.unknown());

export interface TaskRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly assignee: string;
  readonly department: string;
  readonly status: string;
  readonly due: string;
  readonly version: number;
}

export type TasksResult =
  | { readonly ok: true; readonly tasks: readonly TaskRecord[] }
  | { readonly ok: false; readonly detail: string };

/** The task list in one call; the page does the paging over the 100 seeded tasks. */
export async function fetchTasks(
  endpoint: ServiceEndpoint,
  serviceKey: string,
  department?: string,
): Promise<TasksResult> {
  const query = department === undefined ? '' : `?department=${encodeURIComponent(department)}`;
  const result = await get(`${endpoint.url}/tasks${query}`, { authorization: `Bearer ${serviceKey}` });
  if (!result.ok) return result;

  const parsed = tasksSchema.safeParse(result.body);
  if (!parsed.success) return { ok: false, detail: 'Danh sách task không đúng định dạng' };
  return {
    ok: true,
    tasks: parsed.data.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      assignee: task.assignee,
      department: task.department,
      status: task.status,
      due: task.due,
      version: task.version,
    })),
  };
}

export type ActionOutcome = { readonly ok: true } | { readonly ok: false; readonly detail: string };

/** A `POST` to a fake system's `/admin/*` route; the response body says nothing the page needs. */
async function post(
  endpoint: ServiceEndpoint,
  serviceKey: string,
  path: string,
  body?: unknown,
): Promise<ActionOutcome> {
  const headers: Record<string, string> = { authorization: `Bearer ${serviceKey}` };
  const init: RequestInit = {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(`${endpoint.url}${path}`, init);
    await response.text();
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: describe(error) };
  }
}

/** `POST /admin/reset` of the directory: every person back to the seed and version 1. */
export function resetDirectory(endpoint: ServiceEndpoint, serviceKey: string): Promise<ActionOutcome> {
  return post(endpoint, serviceKey, '/admin/reset');
}

/** `POST /admin/reset` of the task list: the 100 seeded tasks, saved keys and write counts cleared. */
export function resetTasks(endpoint: ServiceEndpoint, serviceKey: string): Promise<ActionOutcome> {
  return post(endpoint, serviceKey, '/admin/reset');
}

/**
 * `POST /admin/faults` of the task list: the next committed write closes the
 * connection instead of answering, so the gateway has to send it again with the
 * same idempotency key (the lost answer case of SR6).
 */
export function injectLostResponseFault(endpoint: ServiceEndpoint, serviceKey: string): Promise<ActionOutcome> {
  return post(endpoint, serviceKey, '/admin/faults', { mode: 'drop_response_after_commit', count: 1 });
}

const toolSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    kind: z.enum(['read', 'propose']),
    input_schema: z.record(z.string(), z.unknown()),
  })
  .catchall(z.unknown());

const toolsSchema = z.object({ tools: z.array(toolSchema) }).catchall(z.unknown());

export interface ToolEntry {
  readonly name: string;
  readonly description: string;
  readonly kind: 'read' | 'propose';
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export type CatalogResult =
  | { readonly ok: true; readonly tools: readonly ToolEntry[] }
  | { readonly ok: false; readonly detail: string };

/** The catalog is the same one `/mcp` publishes; the gateway needs no key for it. */
export async function fetchTools(endpoint: ServiceEndpoint): Promise<CatalogResult> {
  const result = await get(`${endpoint.url}/v1/tools`, {});
  if (!result.ok) return result;

  const parsed = toolsSchema.safeParse(result.body);
  if (!parsed.success) return { ok: false, detail: 'Danh mục tool không đúng định dạng' };
  return {
    ok: true,
    tools: parsed.data.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      kind: tool.kind,
      inputSchema: tool.input_schema,
    })),
  };
}

export interface ToolCallResult {
  /** The HTTP status of the gateway, or null when the request never got an answer. */
  readonly status: number | null;
  /** Exactly the text the gateway returned: this is what the AI receives. */
  readonly text: string;
  readonly reasonCode: string | null;
  readonly traceId: string | null;
  readonly elapsedMs: number;
  /** A transport or shape problem the console detected; null when the gateway answered in its own shape. */
  readonly problem: string | null;
}

function callFailure(problem: string, started: number): ToolCallResult {
  return {
    status: null,
    text: '',
    reasonCode: null,
    traceId: null,
    elapsedMs: Math.round(performance.now() - started),
    problem,
  };
}

/**
 * Call `POST /v1/tools/<name>` of the gateway with the persona's key, exactly as
 * the function-calling assistant does (ADR-0006 section 3.3). The console never
 * calls the rule engine or the fake systems for a playground call.
 */
export async function callTool(
  endpoint: ServiceEndpoint,
  rawKey: string,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<ToolCallResult> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(`${endpoint.url}/v1/tools/${encodeURIComponent(tool)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${rawKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(TOOL_CALL_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return callFailure(
      timedOut
        ? `Cổng không trả lời trong ${TOOL_CALL_TIMEOUT_MS / 1_000} giây.`
        : 'Không nối được tới cổng. Hãy kiểm tra cổng có đang chạy.',
      started,
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch {
    return callFailure('Cổng đóng kết nối trước khi trả đủ nội dung.', started);
  }
  const elapsedMs = Math.round(performance.now() - started);

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    parsed = undefined;
  }
  const answer = toolResponseSchema.safeParse(parsed);
  if (!answer.success) {
    return {
      status: response.status,
      text: body,
      reasonCode: null,
      traceId: null,
      elapsedMs,
      problem: 'Cổng trả lời không đúng dạng { text, reason_code, trace_id }.',
    };
  }
  return {
    status: response.status,
    text: answer.data.text,
    reasonCode: answer.data.reason_code,
    traceId: answer.data.trace_id,
    elapsedMs,
    problem: null,
  };
}

const CONFIRMATION_LINK = /https?:\/\/[^\s<>"'()]+/gu;

/**
 * The confirmation link inside a tool answer, if there is one. Only an http or
 * https address whose path is a confirmation page becomes clickable, so data in
 * an answer can never turn into a `javascript:` link.
 */
export function confirmationLinkIn(text: string): string | undefined {
  for (const match of text.matchAll(CONFIRMATION_LINK)) {
    const candidate = match[0];
    try {
      const url = new URL(candidate);
      if (url.pathname.startsWith('/xac-nhan/') && url.pathname.length > '/xac-nhan/'.length) return candidate;
    } catch {
      // Not a URL: keep looking.
    }
  }
  return undefined;
}

export type RuleInfo =
  | { readonly ok: true; readonly version: number; readonly file: string }
  | { readonly ok: false; readonly file: string; readonly detail: string };

/**
 * Read the version the gateway is applying. The engine reads the file on every
 * decision, so the console reads it on every request too instead of caching it.
 */
export function readRuleInfo(rulesPath: string): RuleInfo {
  const file = basename(rulesPath);
  const loaded = loadRules(rulesPath);
  return loaded.ok ? { ok: true, version: loaded.rules.version, file } : { ok: false, file, detail: loaded.detail };
}
