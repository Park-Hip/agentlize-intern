import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATA_DIR_ENV, LOOPBACK_HOST, PORT_ENV, RULES_PATH_ENV, SERVICE_KEY_ENV } from '@lab/shared';
import { DEFAULT_RULES_PATH } from '@lab/gateway';
import { startConsole } from './server.js';

/** A fresh key per test process; no key-like literal sits in the repository. */
export const SERVICE_KEY = randomBytes(32).toString('base64url');

/** The directory fixture. `badge_code` stands in for a field added after the rule file was written. */
export const EMPLOYEES = {
  employees: [
    { employee_id: 'NV-01', full_name: 'Trần Văn Quang', role: 'lead', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-02', full_name: 'Nguyễn Thị Hoa', role: 'staff', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-03', full_name: 'Đỗ <script>alert(1)</script> Lan', role: 'staff', department: 'Vận hành', version: 1 },
    {
      employee_id: 'NV-04',
      full_name: 'Vũ Quốc Minh',
      role: 'staff',
      department: 'Vận hành',
      work_email: 'minh@lab.example',
      badge_code: 'BADGE-NV-04',
      version: 1,
    },
    { employee_id: 'NV-05', full_name: 'Lê Hoàng Nam', role: 'intern', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-06', full_name: 'Phạm Thị Nhung', role: 'hr', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-07', full_name: 'Bùi Thanh Tâm', role: 'staff', department: 'Vận hành', version: 1 },
  ],
};

export const TOOLS = {
  tools: [
    {
      name: 'find_employee',
      description: 'Tìm nhân viên theo tên hoặc theo phòng.',
      kind: 'read',
      input_schema: {
        type: 'object',
        properties: { name: { type: 'string' }, department: { type: 'string' } },
        required: [],
      },
    },
    {
      name: 'propose_task_change',
      description: 'Soạn đề xuất <img src=x onerror=alert(1)> cho một task.',
      kind: 'propose',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          changes: {
            type: 'object',
            properties: {
              assignee: { type: 'string' },
              due: { type: 'string' },
              status: { type: 'string', enum: ['todo', 'doing', 'done'] },
            },
            required: [],
          },
        },
        required: ['task_id', 'changes'],
      },
    },
  ],
};

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export interface FakeServer {
  readonly port: number;
  readonly paths: readonly string[];
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
  handler: (req: IncomingMessage, res: ServerResponse, path: string) => void,
): Promise<FakeServer> {
  const seen: string[] = [];
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`).pathname;
    seen.push(`${req.method ?? 'GET'} ${path}`);
    handler(req, res, path);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, () => {
      resolve({
        port,
        paths: seen,
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

export interface Fixture {
  readonly url: string;
  readonly port: number;
  readonly dataDir: string;
  readonly rulesPath: string;
  readonly fakeServers: readonly FakeServer[];
  close(): Promise<void>;
}

export interface FixtureOptions {
  readonly gateway?: boolean;
  readonly directory?: boolean;
  readonly tasks?: boolean;
  readonly rulesText?: string;
  readonly employees?: unknown;
}

export function rulesWithVersion(version: number): string {
  const rules = JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as Record<string, unknown>;
  rules['version'] = version;
  return JSON.stringify(rules);
}

export async function startFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const dataDir = mkdtempSync(join(tmpdir(), 'lab-console-'));
  const rulesPath = join(dataDir, 'rules.json');
  writeFileSync(rulesPath, options.rulesText ?? rulesWithVersion(7));

  const [gatewayPort, directoryPort, tasksPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const servers: FakeServer[] = [];

  if (options.gateway !== false) {
    servers.push(
      await listen(gatewayPort, (_req, res, path) => {
        if (path === '/health') return json(res, 200, { status: 'ok', service: 'gateway' });
        if (path === '/v1/tools') return json(res, 200, TOOLS);
        json(res, 404, { error: 'not_found' });
      }),
    );
  }

  if (options.directory !== false) {
    servers.push(
      await listen(directoryPort, (req, res, path) => {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(res, 401, { error: 'unauthorized' });
        if (path === '/employees') return json(res, 200, options.employees ?? EMPLOYEES);
        json(res, 200, { status: 'ok', service: 'directory' });
      }),
    );
  }

  if (options.tasks !== false) {
    servers.push(
      await listen(tasksPort, (req, res, path) => {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return json(res, 401, { error: 'unauthorized' });
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

  const consoleService = await startConsole({ port: 0, env });

  return {
    url: consoleService.url,
    port: consoleService.port,
    dataDir,
    rulesPath,
    fakeServers: servers,
    async close(): Promise<void> {
      await consoleService.close();
      await Promise.all(servers.map((server) => server.close()));
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

/** Post one form the way the browser does: own Origin, own Host, CSRF token in the body. */
export async function postForm(
  fixture: { readonly port: number },
  fields: Readonly<Record<string, string>> | URLSearchParams,
  options: { readonly origin?: string | null; readonly host?: string } = {},
): Promise<Response> {
  const params = fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  const origin = options.origin === undefined ? `http://${LOOPBACK_HOST}:${fixture.port}` : options.origin;
  if (origin !== null) headers['origin'] = origin;
  if (options.host !== undefined) headers['host'] = options.host;
  return fetch(`http://${LOOPBACK_HOST}:${fixture.port}/permissions`, {
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

/** Turn the rule file on disk into the fields a browser would submit, with the given edits. */
export function saveFields(
  rules: Record<string, unknown>,
  hidden: { csrf: string; version: string },
  catalog: readonly string[],
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
  add('bulk_threshold', String(rules['bulk_threshold']));

  const roles = rules['roles'] as Record<string, Record<string, string>>;
  for (const [role, cells] of Object.entries(roles)) {
    for (const [action, effect] of Object.entries(cells)) add(`cell.${role}.${action}`, effect);
  }

  const employeeFields = rules['employee_fields'] as Record<string, string[]>;
  for (const field of catalog) add('catalog', field);
  for (const [role, list] of Object.entries(employeeFields)) {
    for (const field of list) add(`fields.${role}`, field);
  }

  edit(fields);

  const params = new URLSearchParams();
  for (const [name, values] of fields) for (const value of values) params.append(name, value);
  return params;
}

/** The field codes the save form carries as a hidden catalog. */
export function catalogOf(html: string): readonly string[] {
  return [...html.matchAll(/name="catalog" value="([^"]*)"/g)].map((match) => match[1] ?? '');
}

export function readRules(rulesPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(rulesPath, 'utf8')) as Record<string, unknown>;
}
