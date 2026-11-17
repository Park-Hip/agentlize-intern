import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import {
  DATA_DIR_ENV,
  DEPARTMENTS,
  EMPLOYEE_ID_PATTERN,
  PERSONAS,
  SERVICE_KEY_ENV,
  TEST_HOOKS_ENV,
  type PersonaName,
} from '@lab/shared';
import { startDirectory, type RunningDirectory } from './server.js';

interface Harness {
  readonly running: RunningDirectory;
  readonly key: string;
  readonly dataDir: string;
  call(
    path: string,
    init?: { method?: string; body?: unknown; rawBody?: string; key?: string | null },
  ): Promise<Response>;
}

interface Json {
  [field: string]: unknown;
}

async function start(
  t: TestContext,
  options: { hooks?: boolean; dataDir?: string; key?: string } = {},
): Promise<Harness> {
  const key = options.key ?? randomBytes(32).toString('base64url');
  const ownsDataDir = options.dataDir === undefined;
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), 'agentlize-directory-')));
  const env: NodeJS.ProcessEnv = {
    [SERVICE_KEY_ENV]: key,
    [DATA_DIR_ENV]: dataDir,
    ...(options.hooks === true ? { [TEST_HOOKS_ENV]: '1' } : {}),
  };

  const running = await startDirectory({ port: 0, env });
  t.after(async () => {
    await running.close();
    if (ownsDataDir) await rm(dataDir, { recursive: true, force: true });
  });

  return {
    running,
    key,
    dataDir,
    call(path, init = {}) {
      const presented = init.key === undefined ? key : init.key;
      return fetch(`${running.url}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          ...(presented === null ? {} : { authorization: `Bearer ${presented}` }),
          ...(init.body === undefined && init.rawBody === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.rawBody === undefined
          ? init.body === undefined
            ? {}
            : { body: JSON.stringify(init.body) }
          : { body: init.rawBody }),
      });
    },
  };
}

async function employees(response: Response): Promise<Json[]> {
  assert.equal(response.status, 200);
  const body = (await response.json()) as { employees: Json[] };
  return body.employees;
}

function ids(list: readonly Json[]): string[] {
  return list.map((employee) => String(employee['employee_id']));
}

test('directory: every path answers 401 without the service key, /health included', async (t) => {
  const { call, running } = await start(t, { hooks: true });

  const probes: ReadonlyArray<[string, string]> = [
    ['GET', '/health'],
    ['GET', '/employees'],
    ['GET', '/employees/NV-03'],
    ['PATCH', '/employees/NV-03'],
    ['POST', '/admin/reset'],
    ['POST', '/admin/add-field'],
    ['GET', '/nowhere'],
  ];

  for (const [method, path] of probes) {
    const missing = await call(path, { method, key: null });
    assert.equal(missing.status, 401, `${method} ${path} without a key`);
    assert.equal(missing.headers.get('www-authenticate'), 'Bearer');
    await missing.text();

    const wrong = await call(path, { method, key: 'not-the-service-key' });
    assert.equal(wrong.status, 401, `${method} ${path} with a wrong key`);
    await wrong.text();
  }

  const basic = await fetch(`${running.url}/employees`, { headers: { authorization: 'Basic abc' } });
  assert.equal(basic.status, 401);
  await basic.text();

  const health = await call('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'directory' });
});

test('directory: refuses to start without a service key', async () => {
  await assert.rejects(startDirectory({ port: 0, env: {} }), /LAB_SERVICE_KEY/);
});

test('directory: seed has 20 people in two departments with one lead each', async (t) => {
  const { call } = await start(t);
  const all = await employees(await call('/employees'));

  assert.equal(all.length, 20);
  assert.equal(new Set(ids(all)).size, 20);

  for (const employee of all) {
    assert.match(String(employee['employee_id']), EMPLOYEE_ID_PATTERN);
    assert.equal(employee['version'], 1);
    assert.match(String(employee['work_email']), /^[a-z.]+@lab\.example$/);
    assert.match(String(employee['personal_phone']), /^0900 555 0\d{2}$/);
    assert.ok(String(employee['home_address']).length > 0);
  }

  for (const department of DEPARTMENTS) {
    const members = all.filter((employee) => employee['department'] === department);
    assert.equal(members.length, 10, department);
    assert.equal(members.filter((employee) => employee['role'] === 'lead').length, 1, `${department} lead`);
  }
  assert.equal(all.filter((employee) => employee['role'] === 'hr').length, 1);
  assert.equal(new Set(all.map((employee) => employee['work_email'])).size, 20);
});

test('directory: the six personas keep the codes, departments and roles declared in shared', async (t) => {
  const { call } = await start(t);

  for (const name of Object.keys(PERSONAS) as PersonaName[]) {
    const persona = PERSONAS[name];
    const response = await call(`/employees/${persona.employeeId}`);
    assert.equal(response.status, 200, name);
    const body = (await response.json()) as Json;
    assert.equal(body['employee_id'], persona.employeeId);
    assert.equal(body['full_name'], persona.fullName);
    assert.equal(body['department'], persona.department);
    assert.equal(body['role'], persona.role);
  }
});

test('directory: finds people by name, ignoring case and accents, and by whole words', async (t) => {
  const { call } = await start(t);

  assert.deepEqual(ids(await employees(await call('/employees?name=Minh'))), [PERSONAS.minh.employeeId]);
  assert.deepEqual(ids(await employees(await call('/employees?name=MINH'))), [PERSONAS.minh.employeeId]);
  assert.deepEqual(ids(await employees(await call(`/employees?name=${encodeURIComponent('Vũ Quốc Minh')}`))), [
    PERSONAS.minh.employeeId,
  ]);
  assert.deepEqual(ids(await employees(await call('/employees?name=vu%20quoc'))), [PERSONAS.minh.employeeId]);

  // "Hoa" must find Hoa, not Lê Hoàng Nam or Hoàng Gia Bảo.
  assert.deepEqual(ids(await employees(await call('/employees?name=Hoa'))), [PERSONAS.hoa.employeeId]);
  assert.deepEqual(ids(await employees(await call('/employees?name=Zzz'))), []);
});

test('directory: filters by department, alone or together with a name', async (t) => {
  const { call } = await start(t);

  const sales = await employees(await call(`/employees?department=${encodeURIComponent('Kinh doanh')}`));
  assert.equal(sales.length, 10);
  assert.ok(sales.every((employee) => employee['department'] === 'Kinh doanh'));

  const operations = await employees(await call('/employees?department=van%20hanh'));
  assert.equal(operations.length, 10);

  assert.deepEqual(
    ids(await employees(await call(`/employees?name=Minh&department=${encodeURIComponent('Kinh doanh')}`))),
    [],
  );
  assert.deepEqual(
    ids(await employees(await call(`/employees?name=Minh&department=${encodeURIComponent('Vận hành')}`))),
    [PERSONAS.minh.employeeId],
  );
});

test('directory: a phone number fragment finds nobody, by name or as a filter', async (t) => {
  const { call } = await start(t);
  const minh = (await (await call(`/employees/${PERSONAS.minh.employeeId}`)).json()) as Json;
  const phone = String(minh['personal_phone']);
  const fragment = phone.slice(-6);

  assert.deepEqual(await employees(await call(`/employees?name=${encodeURIComponent(fragment)}`)), []);
  assert.deepEqual(await employees(await call(`/employees?name=${encodeURIComponent(phone)}`)), []);
  assert.deepEqual(await employees(await call(`/employees?department=${encodeURIComponent(fragment)}`)), []);

  for (const param of ['personal_phone', 'work_email', 'role', 'q']) {
    const response = await call(`/employees?${param}=${encodeURIComponent(fragment)}`);
    assert.equal(response.status, 400, `${param} is not a filter`);
    assert.equal(((await response.json()) as Json)['error'], 'unsupported_filter');
  }
});

test('directory: GET by code returns one employee, 404 for an unknown or malformed code', async (t) => {
  const { call } = await start(t);

  const found = await call('/employees/NV-06');
  assert.equal(found.status, 200);
  assert.equal(((await found.json()) as Json)['full_name'], PERSONAS.minh.fullName);

  for (const code of ['NV-99', 'nv-06', '%E0%A4%A', 'x']) {
    const response = await call(`/employees/${code}`);
    assert.equal(response.status, 404, code);
    assert.equal(((await response.json()) as Json)['error'], 'employee_not_found');
  }
});

test('directory: PATCH applies the change and raises the version by one', async (t) => {
  const { call } = await start(t);
  const code = PERSONAS.hoa.employeeId;

  const first = await call(`/employees/${code}`, {
    method: 'PATCH',
    body: { expected_version: 1, changes: { work_email: 'hoa.new@lab.example' } },
  });
  assert.equal(first.status, 200);
  const updated = (await first.json()) as Json;
  assert.equal(updated['version'], 2);
  assert.equal(updated['work_email'], 'hoa.new@lab.example');
  assert.equal(updated['full_name'], PERSONAS.hoa.fullName, 'fields not named stay as they were');

  const second = await call(`/employees/${code}`, {
    method: 'PATCH',
    body: { expected_version: 2, changes: { role: 'intern' } },
  });
  assert.equal(second.status, 200);
  assert.equal(((await second.json()) as Json)['version'], 3);

  const stored = (await (await call(`/employees/${code}`)).json()) as Json;
  assert.equal(stored['version'], 3);
  assert.equal(stored['role'], 'intern');
  assert.equal(stored['work_email'], 'hoa.new@lab.example');
});

test('directory: PATCH with a stale version answers 409 and changes nothing', async (t) => {
  const { call } = await start(t);
  const code = PERSONAS.lan.employeeId;
  const before = (await (await call(`/employees/${code}`)).json()) as Json;

  const ok = await call(`/employees/${code}`, {
    method: 'PATCH',
    body: { expected_version: 1, changes: { work_email: 'lan.one@lab.example' } },
  });
  assert.equal(ok.status, 200);

  const stale = await call(`/employees/${code}`, {
    method: 'PATCH',
    body: { expected_version: 1, changes: { work_email: 'lan.two@lab.example' } },
  });
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: 'version_conflict', current_version: 2 });

  const after = (await (await call(`/employees/${code}`)).json()) as Json;
  assert.equal(after['work_email'], 'lan.one@lab.example');
  assert.equal(after['version'], 2);
  assert.equal(before['version'], 1);
});

test('directory: PATCH refuses bad input and leaves the record alone', async (t) => {
  const { call } = await start(t);
  const code = PERSONAS.nam.employeeId;
  const patch = (body: unknown): Promise<Response> => call(`/employees/${code}`, { method: 'PATCH', body });

  const cases: ReadonlyArray<[string, unknown, number, string]> = [
    ['no version', { changes: { role: 'staff' } }, 400, 'invalid_body'],
    ['version zero', { expected_version: 0, changes: { role: 'staff' } }, 400, 'invalid_body'],
    ['no changes', { expected_version: 1, changes: {} }, 400, 'invalid_body'],
    ['extra top-level key', { expected_version: 1, changes: { role: 'staff' }, force: true }, 400, 'invalid_body'],
    ['bad role', { expected_version: 1, changes: { role: 'admin' } }, 400, 'invalid_value'],
    ['bad department', { expected_version: 1, changes: { department: 'Kế toán' } }, 400, 'invalid_value'],
    ['outside email', { expected_version: 1, changes: { work_email: 'nam@example.com' } }, 400, 'invalid_value'],
    ['unknown field', { expected_version: 1, changes: { salary: '1' } }, 400, 'unknown_field'],
    ['code is not editable', { expected_version: 1, changes: { employee_id: 'NV-50' } }, 400, 'unknown_field'],
    ['version is not editable', { expected_version: 1, changes: { version: '9' } }, 400, 'unknown_field'],
  ];

  for (const [label, body, status, error] of cases) {
    const response = await patch(body);
    assert.equal(response.status, status, label);
    assert.equal(((await response.json()) as Json)['error'], error, label);
  }

  const notJson = await call(`/employees/${code}`, { method: 'PATCH', rawBody: '{not json' });
  assert.equal(notJson.status, 400);
  assert.equal(((await notJson.json()) as Json)['error'], 'invalid_json');

  const missing = await call('/employees/NV-99', {
    method: 'PATCH',
    body: { expected_version: 1, changes: { role: 'staff' } },
  });
  assert.equal(missing.status, 404);

  const stored = (await (await call(`/employees/${code}`)).json()) as Json;
  assert.equal(stored['version'], 1);
  assert.equal(stored['role'], PERSONAS.nam.role);
});

test('directory: wrong methods answer 405 with an Allow header', async (t) => {
  const { call } = await start(t, { hooks: true });

  const cases: ReadonlyArray<[string, string, string]> = [
    ['POST', '/employees', 'GET'],
    ['DELETE', '/employees/NV-03', 'GET, PATCH'],
    ['GET', '/admin/reset', 'POST'],
    ['POST', '/health', 'GET'],
  ];
  for (const [method, path, allow] of cases) {
    const response = await call(path, { method });
    assert.equal(response.status, 405, `${method} ${path}`);
    assert.equal(response.headers.get('allow'), allow);
    await response.text();
  }
});

test('directory: the admin routes answer 404 when LAB_TEST_HOOKS is not 1', async (t) => {
  const { call } = await start(t);

  const reset = await call('/admin/reset', { method: 'POST' });
  assert.equal(reset.status, 404);
  await reset.text();

  const addField = await call('/admin/add-field', { method: 'POST', body: { field: 'badge', value: 'x' } });
  assert.equal(addField.status, 404);
  await addField.text();

  // Nothing changed.
  const all = await employees(await call('/employees'));
  assert.ok(all.every((employee) => employee['badge'] === undefined));

  // Any value other than "1" keeps the routes off.
  for (const value of ['0', 'true', '']) {
    const other = await startDirectory({
      port: 0,
      env: {
        [SERVICE_KEY_ENV]: 'k'.repeat(32),
        [DATA_DIR_ENV]: join(tmpdir(), 'agentlize-directory-flag'),
        [TEST_HOOKS_ENV]: value,
      },
      file: ':memory:',
    });
    t.after(() => other.close());
    const response = await fetch(`${other.url}/admin/reset`, {
      method: 'POST',
      headers: { authorization: `Bearer ${'k'.repeat(32)}` },
    });
    assert.equal(response.status, 404, `LAB_TEST_HOOKS=${JSON.stringify(value)}`);
    await response.text();
  }
});

test('directory: /admin/reset restores the seed and every version', async (t) => {
  const { call } = await start(t, { hooks: true });
  const code = PERSONAS.hoa.employeeId;

  const changed = await call(`/employees/${code}`, {
    method: 'PATCH',
    body: { expected_version: 1, changes: { role: 'intern', work_email: 'hoa.moved@lab.example' } },
  });
  assert.equal(changed.status, 200);
  await changed.text();
  const added = await call('/admin/add-field', { method: 'POST', body: { field: 'badge', value: 'x' } });
  assert.equal(added.status, 200);
  await added.text();

  const reset = await call('/admin/reset', { method: 'POST' });
  assert.equal(reset.status, 200);
  await reset.text();

  const hoa = (await (await call(`/employees/${code}`)).json()) as Json;
  assert.equal(hoa['version'], 1);
  assert.equal(hoa['role'], PERSONAS.hoa.role);
  assert.equal(hoa['work_email'], 'hoa.nguyen@lab.example');
  assert.equal(hoa['badge'], undefined);
  assert.equal((await employees(await call('/employees'))).length, 20);
});

test('directory: /admin/add-field adds one field to every employee and keeps old data', async (t) => {
  const { call } = await start(t, { hooks: true });

  const response = await call('/admin/add-field', { method: 'POST', body: { field: 'badge_color', value: 'xanh' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'added', field: 'badge_color', employees: 20 });

  const all = await employees(await call('/employees'));
  assert.equal(all.length, 20);
  assert.ok(all.every((employee) => employee['badge_color'] === 'xanh'));
  assert.ok(all.every((employee) => employee['version'] === 2), 'a changed document gets a new version');
  assert.ok(all.every((employee) => typeof employee['personal_phone'] === 'string'));

  // The new field is an ordinary field: PATCH can change it, a filter cannot use it.
  const patched = await call(`/employees/${PERSONAS.hoa.employeeId}`, {
    method: 'PATCH',
    body: { expected_version: 2, changes: { badge_color: 'đỏ' } },
  });
  assert.equal(patched.status, 200);
  assert.equal(((await patched.json()) as Json)['badge_color'], 'đỏ');

  const again = await call('/admin/add-field', { method: 'POST', body: { field: 'badge_color', value: 'x' } });
  assert.equal(again.status, 409);
  await again.text();

  for (const field of ['Bad Name', 'employee_id', 'version', '']) {
    const bad = await call('/admin/add-field', { method: 'POST', body: { field, value: 'x' } });
    assert.equal(bad.status, 400, JSON.stringify(field));
    await bad.text();
  }
});

test('directory: data survives a restart on the same file and lives in directory.sqlite', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-directory-keep-'));
  const key = randomBytes(32).toString('base64url');
  const code = PERSONAS.quang.employeeId;

  try {
    const first = await start(t, { dataDir, key });
    const patched = await first.call(`/employees/${code}`, {
      method: 'PATCH',
      body: { expected_version: 1, changes: { work_email: 'quang.kept@lab.example' } },
    });
    assert.equal(patched.status, 200);
    await patched.text();
    await first.running.close();

    const second = await start(t, { dataDir, key });
    const quang = (await (await second.call(`/employees/${code}`)).json()) as Json;
    assert.equal(quang['work_email'], 'quang.kept@lab.example');
    assert.equal(quang['version'], 2);
    await second.running.close();

    assert.ok((await readdir(dataDir)).includes('directory.sqlite'));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
