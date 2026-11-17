import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { LOOPBACK_HOST, resolvePort } from '@lab/shared';
import { rulesSchema } from '@lab/gateway';
import { z } from 'zod';

/** A call to another lab process stops here, so one slow service cannot hold a page open for long. */
export const UPSTREAM_TIMEOUT_MS = 2_000;

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
  readonly fullName: string | undefined;
  readonly role: string | undefined;
  readonly department: string | undefined;
}

export type EmployeeResult =
  | { readonly ok: true; readonly employees: readonly Employee[] }
  | { readonly ok: false; readonly detail: string };

/** The whole directory in one call: the console then keeps the six characters and the guest. */
export async function fetchEmployees(endpoint: ServiceEndpoint, serviceKey: string): Promise<EmployeeResult> {
  const result = await get(`${endpoint.url}/employees`, { authorization: `Bearer ${serviceKey}` });
  if (!result.ok) return result;

  const parsed = employeesSchema.safeParse(result.body);
  if (!parsed.success) return { ok: false, detail: 'Danh sách nhân viên không đúng định dạng' };
  return {
    ok: true,
    employees: parsed.data.employees.map((employee) => ({
      employeeId: employee.employee_id,
      fullName: employee.full_name,
      role: employee.role,
      department: employee.department,
    })),
  };
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

export type RuleInfo =
  | { readonly ok: true; readonly version: number; readonly file: string }
  | { readonly ok: false; readonly file: string; readonly detail: string };

/**
 * Read the version the gateway is applying. The engine reads the file on every
 * decision, so the console reads it on every request too instead of caching it.
 */
export function readRuleInfo(rulesPath: string): RuleInfo {
  const file = basename(rulesPath);
  try {
    const text = readFileSync(rulesPath, 'utf8').replace(/^\uFEFF/, '');
    const rules = rulesSchema.parse(JSON.parse(text) as unknown);
    return { ok: true, version: rules.version, file };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return {
      ok: false,
      file,
      detail: missing ? 'Chưa có file luật' : 'File luật không đọc được hoặc không đúng schema',
    };
  }
}
