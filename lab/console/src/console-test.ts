import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DATA_DIR_ENV, LOOPBACK_HOST, PORT_ENV, RULES_PATH_ENV, SERVICE_KEY_ENV } from '@lab/shared';
import { DEFAULT_RULES_PATH } from '@lab/gateway';
import { startConsole } from './server.js';

const SERVICE_KEY = 'test-service-key-0123456789';

const EMPLOYEES = {
  employees: [
    { employee_id: 'NV-01', full_name: 'Trần Văn Quang', role: 'lead', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-02', full_name: 'Nguyễn Thị Hoa', role: 'staff', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-03', full_name: 'Đỗ <script>alert(1)</script> Lan', role: 'staff', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-04', full_name: 'Vũ Quốc Minh', role: 'staff', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-05', full_name: 'Lê Hoàng Nam', role: 'intern', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-06', full_name: 'Phạm Thị Nhung', role: 'hr', department: 'Vận hành', version: 1 },
    { employee_id: 'NV-07', full_name: 'Bùi Thanh Tâm', role: 'staff', department: 'Vận hành', version: 1 },
  ],
};

const TOOLS = {
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

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

interface FakeServer {
  readonly port: number;
  close(): Promise<void>;
}

async function freePort(): Promise<number> {
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

function listen(
  port: number,
  handler: (req: IncomingMessage, res: ServerResponse, path: string) => void,
): Promise<FakeServer> {
  const server: Server = createServer((req, res) => {
    handler(req, res, new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`).pathname);
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

interface Fixture {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

interface FixtureOptions {
  readonly gateway?: boolean;
  readonly directory?: boolean;
  readonly tasks?: boolean;
  readonly rulesText?: string;
}

function rulesWithVersion(version: number): string {
  const rules = JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as Record<string, unknown>;
  rules['version'] = version;
  return JSON.stringify(rules);
}

async function startFixture(options: FixtureOptions = {}): Promise<Fixture> {
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
        if (path === '/employees') return json(res, 200, EMPLOYEES);
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
    async close(): Promise<void> {
      await consoleService.close();
      await Promise.all(servers.map((server) => server.close()));
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

interface RawResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

function rawGet(port: number, path: string, host: string): Promise<RawResponse> {
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

test('console: overview shows the three services, the applied rule version and the seven identities', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  assert.equal(fixture.url, `http://${LOOPBACK_HOST}:${fixture.port}`);
  const response = await fetch(`${fixture.url}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

  const html = await response.text();
  assert.match(html, /<h1>Tổng quan<\/h1>/);
  assert.match(html, /Phiên bản 7/);
  assert.equal(html.match(/Đang chạy/g)?.length, 3);
  assert.match(html, /Trần Văn Quang/);
  assert.match(html, /Nguyễn Thị Hoa/);
  assert.match(html, /Đỗ &lt;script&gt;alert\(1\)&lt;\/script&gt; Lan/);
  assert.match(html, /NV-99/);
  assert.match(html, /Khách/);
  assert.match(html, /Không có trong danh bạ/);
  // Only the six characters and the guest, never the rest of the directory.
  assert.equal(html.includes('Bùi Thanh Tâm'), false);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes(SERVICE_KEY), false);
});

test('console: tool screen shows descriptions, parameters and the read or propose label', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/tools`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /find_employee/);
  assert.match(html, /propose_task_change/);
  assert.match(html, /Chỉ đọc/);
  assert.match(html, /Soạn đề xuất/);
  assert.match(html, /changes\.assignee/);
  assert.match(html, /data-label="Bắt buộc">Có/);
  assert.match(html, /data-label="Bắt buộc">Không/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes(SERVICE_KEY), false);
});

test('console: only 127.0.0.1 and localhost for the bound port pass the Host check', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const loopback = await rawGet(fixture.port, '/', `127.0.0.1:${fixture.port}`);
  assert.equal(loopback.status, 200);
  const localhost = await rawGet(fixture.port, '/tools', `localhost:${fixture.port}`);
  assert.equal(localhost.status, 200);

  const foreignName = await rawGet(fixture.port, '/', `evil.example:${fixture.port}`);
  assert.equal(foreignName.status, 403);
  assert.equal(foreignName.body.includes('Tổng quan'), false);
  const foreignPort = await rawGet(fixture.port, '/', '127.0.0.1:1');
  assert.equal(foreignPort.status, 403);
  const noPort = await rawGet(fixture.port, '/', '127.0.0.1');
  assert.equal(noPort.status, 403);
});

test('console: overview still opens when the directory is off and says so', async (t) => {
  const fixture = await startFixture({ directory: false });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Không đọc được danh bạ/);
  assert.match(html, /Danh bạ giả/);
  assert.match(html, /Chưa đọc được/);
  assert.match(html, /NV-01/);
  // The gateway and the task list are still reported as running.
  assert.equal(html.match(/Đang chạy/g)?.length, 2);
  assert.equal(html.match(/Không chạy/g)?.length, 1);
});

test('console: tool screen still opens when the gateway is off and says so', async (t) => {
  const fixture = await startFixture({ gateway: false });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/tools`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Cổng không chạy/);
  assert.match(html, /chưa đọc được danh mục tool/);
  assert.match(html, /<h1>Tool<\/h1>/);
});

test('console: overview still opens when the task list is off and says so', async (t) => {
  const fixture = await startFixture({ tasks: false });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Task giả/);
  assert.match(html, /Không chạy/);
  assert.match(html, /Trần Văn Quang/);
  assert.equal(html.match(/Đang chạy/g)?.length, 2);
  assert.equal(html.match(/Không chạy/g)?.length, 1);
});

test('console: a broken rule file is reported without hiding the rest of the page', async (t) => {
  const fixture = await startFixture({ rulesText: '{' });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /File luật không đọc được/);
  assert.match(html, /POLICY_UNAVAILABLE/);
  assert.match(html, /Trần Văn Quang/);
});
