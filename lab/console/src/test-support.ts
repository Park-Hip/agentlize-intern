import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DATA_DIR_ENV,
  LOOPBACK_HOST,
  PORT_ENV,
  RULES_PATH_ENV,
  SERVICE_KEY_ENV,
  TEST_HOOKS_ENV,
  type ReasonCode,
} from '@lab/shared';
import {
  DEFAULT_RULES_PATH,
  hashKey,
  openGatewayDatabase,
  TraceStore,
  type GatewayDatabase,
  type TraceRecord,
} from '@lab/gateway';
import { startConsole } from './server.js';

/** A fresh key per test process; no key-like literal sits in the repository. */
export const SERVICE_KEY = randomBytes(32).toString('base64url');

export const TRACE_TIME = '2026-11-18T10:00:00.000Z';

/** The same 20 people the directory seeds, so a page test can name exact rows. */
export function employee(n: number): Record<string, unknown> {
  const code = String(n).padStart(2, '0');
  const operations = n <= 10;
  const fullName = n === 3 ? 'Đỗ <script>alert(1)</script> Lan' : `Nhân viên ${code}`;
  return {
    employee_id: `NV-${code}`,
    version: 1,
    full_name: fullName,
    department: operations ? 'Vận hành' : 'Kinh doanh',
    role: n === 1 || n === 11 ? 'lead' : n === 6 ? 'hr' : n === 5 || n === 9 || n === 18 || n === 20 ? 'intern' : 'staff',
    work_email: `nv${code}@lab.example`,
    personal_phone: `0900 555 ${code}`,
    home_address: `Số ${code} Đường Giả Định, Thành phố Thử Nghiệm`,
  };
}

export const EMPLOYEES = { employees: Array.from({ length: 20 }, (_, index) => employee(index + 1)) };

/**
 * The same directory after a field was added that the rule file does not know yet.
 * `badge_code` stands in for it, so the permission screen has a new field to list.
 */
export const EMPLOYEES_WITH_NEW_FIELD = {
  employees: EMPLOYEES.employees.map((person) =>
    person['employee_id'] === 'NV-04' ? { ...person, badge_code: 'BADGE-NV-04' } : person,
  ),
};

/** 60 tasks in Vận hành then 40 in Kinh doanh; the numbers never appear inside another task text. */
export const TASKS = {
  tasks: Array.from({ length: 100 }, (_, index) => {
    const n = index + 1;
    const operations = n <= 60;
    const code = String(((n + 9) % 10) + 1).padStart(2, '0');
    return {
      id: `T-${n}`,
      title: `Việc số ${n}`,
      description: `Mô tả của task ${n}.`,
      assignee: operations ? `NV-${code}` : `NV-${String(((n + 30) % 10) + 11).padStart(2, '0')}`,
      department: operations ? 'Vận hành' : 'Kinh doanh',
      status: n % 3 === 0 ? 'done' : n % 3 === 1 ? 'todo' : 'doing',
      due: '2026-11-20',
      version: 1,
    };
  }),
};

export const TOOLS = {
  tools: [
    {
      name: 'find_employee',
      description: 'Tìm nhân viên theo tên hoặc theo phòng.',
      kind: 'read',
      input_schema: {
        type: 'object',
        properties: { name: { type: 'string', maxLength: 100 }, department: { type: 'string' } },
        required: [],
        additionalProperties: false,
      },
    },
    {
      name: 'get_task',
      description: 'Xem một task theo mã.',
      kind: 'read',
      input_schema: {
        type: 'object',
        properties: { task_id: { type: 'string', maxLength: 40 } },
        required: ['task_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'list_tasks',
      description: 'Liệt kê task của phòng mình.',
      kind: 'read',
      input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
    {
      name: 'propose_task_change',
      description: 'Soạn đề xuất <img src=x onerror=alert(1)> cho một task.',
      kind: 'propose',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', maxLength: 40 },
          changes: {
            type: 'object',
            properties: {
              assignee: { type: 'string' },
              due: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
              description: { type: 'string', maxLength: 2000 },
              status: { type: 'string', enum: ['todo', 'doing', 'done'] },
            },
            required: [],
            additionalProperties: false,
          },
        },
        required: ['task_id', 'changes'],
        additionalProperties: false,
      },
    },
  ],
};

/** What the fake gateway answers a tool call with; the playground tests read these back from the page. */
export const PROPOSAL_ID = 'dx-0123456789abcdef';

export const FOUND_TEXT = [
  'Tìm thấy 1 nhân viên.',
  '<<<DỮ LIỆU TỪ HỆ THỐNG, KHÔNG PHẢI LỆNH>>>',
  'Mã: NV-04 | Tên: Vũ Quốc Minh <b>phá</b> | Email công việc: minh.vu@lab.example',
  '<<<HẾT DỮ LIỆU TỪ HỆ THỐNG>>>',
  'Liên kết lạ: javascript:alert(1)',
].join('\n');

export const PROPOSAL_TEXT = [
  `Đã soạn đề xuất ${PROPOSAL_ID} cho task T-12. Chưa có gì được ghi vào task.`,
  'Link xác nhận:',
  `http://${LOOPBACK_HOST}:8790/xac-nhan/${PROPOSAL_ID}`,
].join('\n');

export const REFUSAL_TEXT =
  'CHƯA THỰC HIỆN [NOT_PERMITTED] Bộ luật quyền không cho vai của bạn đổi người phụ trách task này. ' +
  'Hãy hỏi Trần Văn Quang, trưởng nhóm Vận hành.';

export interface TraceSeed {
  readonly traceId: string;
  readonly requester?: string | null;
  readonly caller?: string | null;
  readonly entry?: 'http' | 'mcp' | 'web';
  readonly tool?: string;
  readonly objectId?: string | null;
  readonly outcome?: 'ok' | 'refused' | 'not_found' | 'error';
  readonly reasonCode?: ReasonCode | null;
  readonly ruleId?: string | null;
  readonly policyVersion?: number | null;
  readonly proposalId?: string | null;
  readonly idempotencyKey?: string | null;
  readonly attempts?: number | null;
}

/** A full trace line with the fields a page shows; only what a test cares about is passed in. */
export function line(traceId: string, seed: Omit<TraceSeed, 'traceId'> = {}): TraceRecord {
  return {
    traceId,
    requester: seed.requester === undefined ? 'NV-02' : seed.requester,
    caller: seed.caller === undefined ? 'lab-console' : seed.caller,
    entry: seed.entry ?? 'http',
    tool: seed.tool ?? 'get_task',
    objectId: seed.objectId === undefined ? 'T-12' : seed.objectId,
    outcome: seed.outcome ?? 'ok',
    reasonCode: seed.reasonCode ?? null,
    outOfScope: false,
    ruleId: seed.ruleId === undefined ? 'task.read.staff' : seed.ruleId,
    policyVersion: seed.policyVersion === undefined ? 7 : seed.policyVersion,
    hostUser: null,
    proposalId: seed.proposalId ?? null,
    idempotencyKey: seed.idempotencyKey ?? null,
    attempts: seed.attempts ?? null,
    durationMs: 4,
  };
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export interface FakeServer {
  readonly port: number;
  close(): Promise<void>;
}

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK_HOST, resolve);
  });
  const address = server.address();
  if (address === null || typeof address !== 'object') throw new Error('temporary listener has no port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  return port;
}

export function listen(
  port: number,
  handler: (req: IncomingMessage, res: ServerResponse, path: string, url: URL) => void | Promise<void>,
): Promise<FakeServer> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    Promise.resolve(handler(req, res, url.pathname, url)).catch((error: unknown) => {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, () => {
      resolve({
        port,
        async close(): Promise<void> {
          server.closeAllConnections();
          await new Promise<void>((done, fail) => {
            server.close((error) => (error === undefined ? done() : fail(error)));
          });
        },
      });
    });
  });
}

export interface AdminCall {
  readonly system: 'directory' | 'tasks';
  readonly path: string;
  readonly body: string;
}

/** One tool call the fake gateway saw, with the person whose key the console sent. */
export interface ToolCall {
  readonly tool: string;
  readonly args: unknown;
  readonly employeeId: string | null;
  readonly caller: string | null;
}

export interface KeyRow {
  readonly key_id: string;
  readonly key_hash: string;
  readonly key_prefix: string;
  readonly employee_id: string;
  readonly caller: string;
  readonly scope: string;
  readonly created_at: string;
  readonly revoked_at: string | null;
}

export interface Fixture {
  readonly url: string;
  readonly port: number;
  readonly dataDir: string;
  readonly rulesPath: string;
  /** The environment the console started with, so a test can start a second one on the same files. */
  readonly env: NodeJS.ProcessEnv;
  readonly adminCalls: readonly AdminCall[];
  readonly toolCalls: readonly ToolCall[];
  /** Write lines into a real `gateway.sqlite`, then leave the file for the console to read. */
  appendTrace(lines: readonly TraceRecord[]): void;
  /** Every row of `api_keys`, oldest first. */
  keyRows(): readonly KeyRow[];
  /** Stop only the console, leaving the fake systems and the data folder for the test to inspect. */
  stopConsole(): Promise<void>;
  close(): Promise<void>;
}

export interface FixtureOptions {
  readonly gateway?: boolean;
  readonly directory?: boolean;
  readonly tasks?: boolean;
  readonly rulesText?: string;
  /** The body the fake directory answers `/employees` with, instead of the default 20 people. */
  readonly employees?: unknown;
  /** Pass the flag the fake systems get, so the console draws the test buttons. */
  readonly testHooks?: boolean;
}

export function rulesWithVersion(version: number): string {
  const rules = JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as Record<string, unknown>;
  rules['version'] = version;
  return JSON.stringify(rules);
}

export function seedTrace(dataDir: string, lines: readonly TraceRecord[]): void {
  const db = openGatewayDatabase(dataDir);
  try {
    const store = new TraceStore(db, () => new Date(TRACE_TIME));
    for (const trace of lines) store.append(trace);
  } finally {
    db.close();
  }
}

export async function startFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const dataDir = mkdtempSync(join(tmpdir(), 'lab-console-'));
  const rulesPath = join(dataDir, 'rules.json');
  writeFileSync(rulesPath, options.rulesText ?? rulesWithVersion(7));

  const [gatewayPort, directoryPort, tasksPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const servers: FakeServer[] = [];
  const adminCalls: AdminCall[] = [];
  const toolCalls: ToolCall[] = [];
  let db: GatewayDatabase | undefined;
  /** The gateway database the console also opens: the fake gateway reads keys there and writes its trace lines. */
  const database = (): GatewayDatabase => (db ??= openGatewayDatabase(dataDir));

  const personOf = (authorization: string | undefined): { employeeId: string | null; caller: string | null } => {
    const rawKey = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (rawKey === '') return { employeeId: null, caller: null };
    const row = database()
      .prepare('SELECT employee_id, caller FROM api_keys WHERE key_hash = ?')
      .get(hashKey(rawKey)) as { employee_id: string; caller: string } | undefined;
    return row === undefined ? { employeeId: null, caller: null } : { employeeId: row.employee_id, caller: row.caller };
  };

  if (options.gateway !== false) {
    servers.push(
      await listen(gatewayPort, async (req, res, path) => {
        if (path === '/health') return json(res, 200, { status: 'ok', service: 'gateway' });
        if (path === '/v1/tools') return json(res, 200, TOOLS);
        const match = /^\/v1\/tools\/([A-Za-z0-9_]+)$/.exec(path);
        if (match === null || req.method !== 'POST') return json(res, 404, { error: 'not_found' });

        let args: unknown;
        try {
          args = JSON.parse(await readBody(req)) as unknown;
        } catch {
          args = undefined;
        }
        const tool = match[1] ?? '';
        const person = personOf(req.headers.authorization);
        toolCalls.push({ tool, args, employeeId: person.employeeId, caller: person.caller });
        const traceId = `tr-${randomBytes(8).toString('hex')}`;
        const record = (): void => {
          new TraceStore(database()).append({
            ...line(traceId, {
              requester: person.employeeId,
              tool,
              objectId: tool === 'find_employee' ? null : 'T-12',
              ruleId: 'TEST.rule',
              policyVersion: 7,
              proposalId: tool === 'propose_task_change' ? PROPOSAL_ID : null,
            }),
            caller: person.caller,
          });
        };

        if (tool === 'find_employee') {
          record();
          return json(res, 200, { text: FOUND_TEXT, reason_code: null, trace_id: traceId });
        }
        if (tool === 'propose_task_change') {
          record();
          return json(res, 200, { text: PROPOSAL_TEXT, reason_code: null, trace_id: traceId });
        }
        if (tool === 'get_task') {
          return json(res, 403, { text: REFUSAL_TEXT, reason_code: 'NOT_PERMITTED', trace_id: traceId });
        }
        // list_tasks answers with a code whose line nobody writes, to prove the page survives a missing line.
        return json(res, 200, { text: 'Có 0 task khớp.', reason_code: null, trace_id: traceId });
      }),
    );
  }

  if (options.directory !== false) {
    servers.push(
      await listen(directoryPort, async (req, res, path, url) => {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(res, 401, { error: 'unauthorized' });
        if (path === '/admin/reset' && req.method === 'POST') {
          adminCalls.push({ system: 'directory', path, body: await readBody(req) });
          return json(res, 200, { status: 'reset' });
        }
        if (path === '/employees' && options.employees !== undefined) return json(res, 200, options.employees);
        if (path === '/employees') {
          const department = url.searchParams.get('department');
          const employees = EMPLOYEES.employees.filter((person) => department === null || person['department'] === department);
          return json(res, 200, { employees });
        }
        json(res, 200, { status: 'ok', service: 'directory' });
      }),
    );
  }

  if (options.tasks !== false) {
    servers.push(
      await listen(tasksPort, async (req, res, path, url) => {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(res, 401, { error: 'unauthorized' });
        if ((path === '/admin/reset' || path === '/admin/faults') && req.method === 'POST') {
          adminCalls.push({ system: 'tasks', path, body: await readBody(req) });
          return json(res, 200, { status: path === '/admin/reset' ? 'reset' : 'set' });
        }
        if (path === '/tasks') {
          const department = url.searchParams.get('department');
          const tasks = TASKS.tasks.filter((task) => department === null || task['department'] === department);
          return json(res, 200, { tasks });
        }
        if (path === '/health') return json(res, 200, { status: 'ok', service: 'tasks' });
        json(res, 404, { error: 'not_found' });
      }),
    );
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: SERVICE_KEY,
    [DATA_DIR_ENV]: dataDir,
    [RULES_PATH_ENV]: rulesPath,
    [PORT_ENV.gateway]: String(gatewayPort),
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
  };
  if (options.testHooks === true) env[TEST_HOOKS_ENV] = '1';

  const consoleService = await startConsole({ port: 0, env });
  let closed = false;

  return {
    url: consoleService.url,
    port: consoleService.port,
    dataDir,
    rulesPath,
    env,
    adminCalls,
    toolCalls,
    appendTrace(lines: readonly TraceRecord[]): void {
      seedTrace(dataDir, lines);
    },
    keyRows(): readonly KeyRow[] {
      return database().prepare('SELECT * FROM api_keys ORDER BY created_at, key_id').all() as KeyRow[];
    },
    stopConsole: () => consoleService.close(),
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await consoleService.close();
      await Promise.all(servers.map((server) => server.close()));
      db?.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export interface RawResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

export function rawGet(port: number, path: string, host: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request({ host: LOOPBACK_HOST, port, path, method: 'GET', headers: { host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** A browser form press: url-encoded body, plus whatever headers the case is about. */
export function rawPost(port: number, path: string, body: string, headers: Readonly<Record<string, string>>): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: LOOPBACK_HOST,
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': String(Buffer.byteLength(body)),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          text += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

export function csrfFrom(html: string): string {
  const match = /name="csrf" value="([^"]+)"/.exec(html);
  assert.ok(match?.[1] !== undefined, 'the page drew a csrf token');
  return match[1];
}

/** Post one form the way the browser does: own Origin, own Host, CSRF token in the body. */
export async function postForm(
  fixture: { readonly port: number },
  fields: Readonly<Record<string, string>> | URLSearchParams,
  options: { readonly origin?: string | null; readonly host?: string; readonly path?: string } = {},
): Promise<Response> {
  const params = fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  const origin = options.origin === undefined ? `http://${LOOPBACK_HOST}:${fixture.port}` : options.origin;
  if (origin !== null) headers['origin'] = origin;
  if (options.host !== undefined) headers['host'] = options.host;
  return fetch(`http://${LOOPBACK_HOST}:${fixture.port}${options.path ?? '/permissions'}`, {
    method: 'POST',
    headers,
    body: params.toString(),
    redirect: 'manual',
  });
}

/** Read the hidden fields a page put in its save form. */
export function hiddenFields(html: string): { csrf: string; version: string } {
  const csrf = /name="csrf" value="([^"]*)"/.exec(html)?.[1];
  const version = /name="version" value="([^"]*)"/.exec(html)?.[1];
  if (csrf === undefined || version === undefined) throw new Error('the page has no save form');
  return { csrf, version };
}

/** The field codes the save form carries as hidden catalogs, one catalog per record type. */
export interface FieldCatalog {
  readonly employee: readonly string[];
  readonly task: readonly string[];
}

/** Turn the rule file on disk into the fields a browser would submit, with the given edits. */
export function saveFields(
  rules: Record<string, unknown>,
  hidden: { csrf: string; version: string },
  catalog: FieldCatalog,
  edit: (fields: Map<string, string[]>) => void = () => undefined,
): URLSearchParams {
  const fields = new Map<string, string[]>();
  const add = (name: string, value: string): void => {
    const list = fields.get(name) ?? [];
    list.push(value);
    fields.set(name, list);
  };

  add('csrf', hidden.csrf);
  add('action', 'save');
  add('version', hidden.version);

  const resources = rules['resources'] as Record<
    string,
    {
      bulk_threshold: number;
      read: Record<string, string>;
      fields: Record<string, string[]>;
      actions: Record<string, Record<string, { effect: string; scope?: string; bulk?: string }>>;
    }
  >;
  for (const [type, resource] of Object.entries(resources)) {
    add(`bulk_threshold.${type}`, String(resource.bulk_threshold));
    for (const [role, scope] of Object.entries(resource.read)) add(`read.${type}.${role}`, scope);
    for (const [role, list] of Object.entries(resource.fields)) {
      for (const field of list) add(`fields.${type}.${role}`, field);
    }
    for (const [action, cells] of Object.entries(resource.actions)) {
      for (const [role, cell] of Object.entries(cells)) {
        const prefix = `cell.${type}.${action}.${role}`;
        add(`${prefix}.effect`, cell.effect);
        add(`${prefix}.scope`, cell.scope ?? 'own_department');
        add(`${prefix}.bulk`, cell.bulk ?? '');
      }
    }
  }

  const approval = rules['approval'] as { approver_roles: string[]; same_department: boolean; wait_minutes: number };
  for (const role of approval.approver_roles) add('approver_roles', role);
  if (approval.same_department) add('approval_same_department', 'true');
  add('approval_wait_minutes', String(approval.wait_minutes));
  add('cumulative_window_minutes', String(rules['cumulative_window_minutes']));

  for (const field of catalog.employee) add('catalog.employee', field);
  for (const field of catalog.task) add('catalog.task', field);

  edit(fields);

  const params = new URLSearchParams();
  for (const [name, values] of fields) for (const value of values) params.append(name, value);
  return params;
}

/** The field codes the save form carries as hidden catalogs. */
export function catalogOf(html: string): FieldCatalog {
  const read = (name: string): readonly string[] => [
    ...html.matchAll(new RegExp(`name="catalog\\.${name}" value="([^"]*)"`, 'g')),
  ].map((match) => match[1] ?? '');
  return { employee: read('employee'), task: read('task') };
}

export function readRules(rulesPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(rulesPath, 'utf8')) as Record<string, unknown>;
}
