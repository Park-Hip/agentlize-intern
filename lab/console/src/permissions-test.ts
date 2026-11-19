import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_RULES_PATH } from '@lab/gateway';
import {
  EMPLOYEES_WITH_NEW_FIELD,
  SERVICE_KEY,
  catalogOf,
  hiddenFields,
  postForm,
  readRules,
  rulesWithVersion,
  saveFields,
  startFixture as startBaseFixture,
  type Fixture,
  type FixtureOptions,
} from './test-support.js';

/** Every case here starts from a directory that already has a field the rule file does not know. */
function startFixture(options: FixtureOptions = {}): Promise<Fixture> {
  return startBaseFixture({ employees: EMPLOYEES_WITH_NEW_FIELD, ...options });
}

interface ResourceShape {
  bulk_threshold: number;
  read: Record<string, string>;
  fields: Record<string, string[]>;
  actions: Record<string, Record<string, { effect: string; scope?: string; bulk?: string }>>;
}

function resourcesOf(rules: Record<string, unknown>): Record<string, ResourceShape> {
  return rules['resources'] as Record<string, ResourceShape>;
}

function checkbox(html: string, type: string, role: string, field: string): RegExpMatchArray | null {
  return new RegExp(`<input type="checkbox" name="fields\\.${type}\\.${role}" value="${field}"( checked)?>`).exec(html);
}

function removeField(list: Map<string, string[]>, name: string, value: string): void {
  const values = list.get(name) ?? [];
  const next = values.filter((candidate) => candidate !== value);
  if (next.length === 0) list.delete(name);
  else list.set(name, next);
}

function addField(list: Map<string, string[]>, name: string, value: string): void {
  const values = list.get(name) ?? [];
  if (!values.includes(value)) values.push(value);
  list.set(name, values);
}

function setField(list: Map<string, string[]>, name: string, value: string): void {
  list.set(name, [value]);
}

test('permissions: the screen shows one table per record type, every cell in three parts, and editable task fields', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/permissions`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  const html = await response.text();

  assert.match(html, /<h1>Quyền và trường<\/h1>/);
  assert.match(html, /<h2>Task<\/h2>/);
  assert.match(html, /<h2>Nhân viên<\/h2>/);

  // Three task actions and one employee action, four roles, three selects per cell.
  assert.equal(html.match(/name="cell\./g)?.length, 48);
  assert.equal(html.match(/name="cell\.task\.change_task_status\.staff\.effect"/g)?.length, 1);
  assert.equal(html.match(/name="cell\.employee\.edit_directory\.hr\.effect"/g)?.length, 1);
  assert.equal(html.match(/name="read\./g)?.length, 8, 'one read select per role and record type');

  const staffStatus = new RegExp(
    '<select name="cell\\.task\\.change_task_status\\.staff\\.effect"[^>]*>(.*?)</select>',
    's',
  ).exec(html)?.[1];
  assert.ok(staffStatus !== undefined);
  assert.match(staffStatus, /<option value="allow" selected>Được<\/option>/);
  assert.match(staffStatus, /<option value="deny">Không được<\/option>/);
  assert.match(staffStatus, /<option value="needs_approval">Cần duyệt<\/option>/);
  assert.match(staffStatus, /<option value="">chưa khai<\/option>/);

  // The bulk threshold is one number per record type.
  assert.match(html, /name="bulk_threshold\.task" type="number" min="1" step="1" value="5"/);
  assert.match(html, /name="bulk_threshold\.employee" type="number" min="1" step="1" value="5"/);

  // A field added to the directory after the rule file has no role yet: it is shown and marked.
  assert.match(html, /badge_code/);
  assert.match(html, /chưa khai/);
  const badge = checkbox(html, 'employee', 'staff', 'badge_code');
  assert.ok(badge !== null, 'the new field has a checkbox');
  assert.equal(badge[1], undefined, 'the new field starts unchecked');

  // Rule names are shown with the directory name they map to.
  assert.match(html, /employee_id<\/code>/);
  assert.match(html, /full_name<\/code>/);
  assert.match(html, /name="fields\.employee\.staff" value="work_email" checked/);
  assert.match(html, /name="fields\.employee\.hr" value="personal_phone" checked/);
  assert.equal(html.match(/name="fields\.employee\.staff" value="personal_phone" checked/g), null);

  // Task fields are editable now, with their own catalog.
  assert.match(html, /<h3>Trường của task mỗi vai được xem<\/h3>/);
  assert.match(html, /name="fields\.task\.staff" value="title" checked/);
  assert.match(html, /name="fields\.task\.hr" value="description" checked/);
  assert.match(html, /name="catalog\.task" value="description"/);
  assert.equal(html.includes('Cố định trong mã'), false);

  // The approval block and the cumulative window are part of the form.
  assert.match(html, /name="approver_roles" value="lead" checked/);
  assert.match(html, /name="approval_same_department" value="true" checked/);
  assert.match(html, /name="approval_wait_minutes" type="number" min="1" step="1" value="120"/);
  assert.match(html, /name="cumulative_window_minutes" type="number" min="1" step="1" value="60"/);

  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes(SERVICE_KEY), false);
  assert.equal(html.includes('name="csrf" value=""'), false);

  // One save form holds both buttons, so a restore is not a second nested form.
  assert.equal(html.match(/<form method="post" action="\/permissions">/g)?.length, 1);
  assert.match(html, /value="restore" class="secondary" formnovalidate/);
});

test('permissions: a valid save writes the next version and keeps a history copy', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/permissions`)).text();
  const hidden = hiddenFields(page);
  assert.equal(hidden.version, '7');
  const before = readRules(fixture.rulesPath);
  const params = saveFields(before, hidden, catalogOf(page), (fields) => {
    removeField(fields, 'fields.employee.staff', 'work_email');
  });

  const response = await postForm(fixture, params);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/permissions?saved=8');
  assert.equal(await response.text(), '');

  const after = readRules(fixture.rulesPath);
  assert.equal(after['version'], 8);
  const staff = resourcesOf(after)['employee']?.fields['staff'];
  const beforeStaff = resourcesOf(before)['employee']?.fields['staff'];
  assert.ok(staff !== undefined && beforeStaff !== undefined);
  assert.equal(staff.includes('work_email'), false);
  assert.deepEqual(staff, beforeStaff.filter((field) => field !== 'work_email'));
  // Another role keeps the field, and every cell is untouched.
  assert.ok((resourcesOf(after)['employee']?.fields['hr'] ?? []).includes('work_email'));
  assert.deepEqual(resourcesOf(after)['task']?.actions, resourcesOf(before)['task']?.actions);
  assert.deepEqual(resourcesOf(after)['employee']?.actions, resourcesOf(before)['employee']?.actions);

  const history = readFileSync(join(fixture.dataDir, 'rules-history', 'v8.json'), 'utf8');
  assert.deepEqual(JSON.parse(history) as unknown, after);

  const reloaded = await (await fetch(`${fixture.url}/permissions?saved=8`)).text();
  assert.match(reloaded, /Đã lưu phiên bản 8/);
  assert.match(reloaded, /Đang áp <strong>phiên bản 8<\/strong>/);
  assert.ok(checkbox(reloaded, 'employee', 'staff', 'work_email') !== null);
  assert.equal(checkbox(reloaded, 'employee', 'staff', 'work_email')?.[1], undefined, 'the save is on the page');
  assert.match(reloaded, /name="fields\.employee\.hr" value="work_email" checked/);
});

test('permissions: a save changes task fields and a cell, and leaves everything else alone', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/permissions`)).text();
  const hidden = hiddenFields(page);
  const before = readRules(fixture.rulesPath);
  const params = saveFields(before, hidden, catalogOf(page), (fields) => {
    removeField(fields, 'fields.task.staff', 'description');
    setField(fields, 'cell.task.change_task_status.staff.bulk', 'allow');
  });

  const response = await postForm(fixture, params);
  assert.equal(response.status, 303);

  const after = readRules(fixture.rulesPath);
  assert.equal(resourcesOf(after)['task']?.fields['staff']?.includes('description'), false);
  assert.equal(resourcesOf(after)['task']?.actions['change_task_status']?.['staff']?.bulk, 'allow');
  assert.equal(resourcesOf(after)['task']?.fields['lead']?.includes('description'), true);
});

test('permissions: a broken form never reaches the file', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/permissions`)).text();
  const hidden = hiddenFields(page);
  const catalog = catalogOf(page);
  const before = readRules(fixture.rulesPath);
  const bytes = readFileSync(fixture.rulesPath, 'utf8');

  const cases: { name: string; edit: (fields: Map<string, string[]>) => void }[] = [
    {
      name: 'effect outside the three choices',
      edit: (fields) => setField(fields, 'cell.task.change_task_status.staff.effect', 'maybe'),
    },
    {
      name: 'threshold below one',
      edit: (fields) => setField(fields, 'bulk_threshold.task', '0'),
    },
    {
      name: 'field outside the page catalog',
      edit: (fields) => addField(fields, 'fields.employee.staff', 'not_a_field'),
    },
    {
      name: 'task field outside the adapter catalog',
      edit: (fields) => addField(fields, 'fields.task.staff', 'not_a_task_field'),
    },
    {
      name: 'no approver role',
      edit: (fields) => {
        fields.delete('approver_roles');
      },
    },
  ];

  for (const item of cases) {
    const params = saveFields(before, hidden, catalog, item.edit);
    const response = await postForm(fixture, params);
    assert.equal(response.status, 400, item.name);
    const html = await response.text();
    assert.match(html, /Chưa lưu:/, item.name);
    assert.equal(readFileSync(fixture.rulesPath, 'utf8'), bytes, `${item.name} leaves the file byte for byte`);
  }

  assert.throws(() => readFileSync(join(fixture.dataDir, 'rules-history', 'v8.json')), /ENOENT/);
});

test('permissions: two saves from one page, the second is refused and names both versions', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/permissions`)).text();
  const hidden = hiddenFields(page);
  const before = readRules(fixture.rulesPath);
  const catalog = catalogOf(page);

  const first = await postForm(
    fixture,
    saveFields(before, hidden, catalog, (fields) => removeField(fields, 'fields.employee.staff', 'work_email')),
  );
  assert.equal(first.status, 303);

  const second = await postForm(
    fixture,
    saveFields(before, hidden, catalog, (fields) => {
      setField(fields, 'bulk_threshold.task', '9');
      removeField(fields, 'fields.employee.hr', 'work_email');
    }),
  );
  assert.equal(second.status, 409);
  const html = await second.text();
  assert.match(html, /form mở ở phiên bản 7, trên đĩa là 8/);
  assert.match(html, /Tải lại trang/);

  const after = readRules(fixture.rulesPath);
  assert.equal(after['version'], 8);
  assert.equal(resourcesOf(after)['task']?.bulk_threshold, 5);
  const staff = resourcesOf(after)['employee']?.fields['staff'] ?? [];
  assert.equal(staff.includes('work_email'), false);
  const hr = resourcesOf(after)['employee']?.fields['hr'] ?? [];
  assert.ok(hr.includes('work_email'), 'the refused save changed nothing');
});

test('permissions: restore writes the base content above every version on disk', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  mkdirSync(join(fixture.dataDir, 'rules-history'), { recursive: true });
  writeFileSync(join(fixture.dataDir, 'rules-history', 'v8.json'), rulesWithVersion(8));
  writeFileSync(join(fixture.dataDir, 'rules-history', 'v9.json'), rulesWithVersion(9));

  // Make the live file differ from the base copy, so the restore has something visible to undo.
  const changed = readRules(fixture.rulesPath);
  const staff = resourcesOf(changed)['employee']?.fields['staff'] ?? [];
  resourcesOf(changed)['employee']!.fields['staff'] = staff.filter((field) => field !== 'work_email');
  writeFileSync(fixture.rulesPath, JSON.stringify(changed, null, 2));

  const page = await (await fetch(`${fixture.url}/permissions`)).text();
  const hidden = hiddenFields(page);
  assert.equal(hidden.version, '7');

  const response = await postForm(fixture, {
    csrf: hidden.csrf,
    action: 'restore',
    version: hidden.version,
  });
  assert.equal(response.status, 303, await response.text());
  assert.equal(response.headers.get('location'), '/permissions?restored=10');

  const base = JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as Record<string, unknown>;
  const restored = readRules(fixture.rulesPath);
  assert.deepEqual(restored, { ...base, version: 10 });
  const history = JSON.parse(readFileSync(join(fixture.dataDir, 'rules-history', 'v10.json'), 'utf8')) as unknown;
  assert.deepEqual(history, restored);
});

test('permissions: a save without the token or the console origin is refused before the file is read', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/permissions`)).text();
  const hidden = hiddenFields(page);
  const before = readRules(fixture.rulesPath);
  const catalog = catalogOf(page);
  const bytes = readFileSync(fixture.rulesPath, 'utf8');

  const wrongToken = saveFields(before, { ...hidden, csrf: 'not-the-token' }, catalog);
  const tokenResponse = await postForm(fixture, wrongToken);
  assert.equal(tokenResponse.status, 403);
  assert.match(await tokenResponse.text(), /mã chống giả mạo/);

  const noOrigin = await postForm(fixture, saveFields(before, hidden, catalog), { origin: null });
  assert.equal(noOrigin.status, 403);
  assert.match(await noOrigin.text(), /trang khác/);

  const foreign = await postForm(fixture, saveFields(before, hidden, catalog), { origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);

  assert.equal(readFileSync(fixture.rulesPath, 'utf8'), bytes);
});

test('permissions: the decision box uses the gateway engine without calling a tool', async (t) => {
  // No gateway at all: a decision still answers, which proves it does not call one.
  const fixture = await startFixture({ gateway: false });
  t.after(() => fixture.close());

  const query = new URLSearchParams({
    persona: 'NV-02',
    action: 'read_employee_field',
    object: 'employee',
    department: 'Vận hành',
    task_count: '1',
    field: 'work_email',
  });
  const allowed = await (await fetch(`${fixture.url}/permissions?${query.toString()}`)).text();
  assert.match(allowed, /<span class="badge ok">Được<\/span>/);
  assert.match(allowed, /<code>ALLOWED<\/code>/);
  assert.match(allowed, /<code>employee\.fields\.staff<\/code>/);
  assert.match(allowed, /phiên bản 7/);

  query.set('field', 'personal_phone');
  const refused = await (await fetch(`${fixture.url}/permissions?${query.toString()}`)).text();
  assert.match(refused, /<span class="badge bad">Không được<\/span>/);
  assert.match(refused, /<code>NOT_PERMITTED<\/code>/);

  query.set('action', 'change_task_assignee_or_due');
  query.set('object', 'task');
  query.set('department', 'Kinh doanh');
  query.set('field', 'work_email');
  const otherDepartment = await (await fetch(`${fixture.url}/permissions?${query.toString()}`)).text();
  assert.match(otherDepartment, /<code>task\.change_task_assignee_or_due\.staff\.scope<\/code>/);
  assert.match(otherDepartment, /<span class="badge bad">Không được<\/span>/);

  // The number in the form feeds the bulk threshold: four records pass, five need approval.
  query.set('action', 'change_task_status');
  query.set('department', 'Vận hành');
  query.set('task_count', '4');
  const belowThreshold = await (await fetch(`${fixture.url}/permissions?${query.toString()}`)).text();
  assert.match(belowThreshold, /<span class="badge ok">Được<\/span>/);
  query.set('task_count', '5');
  const atThreshold = await (await fetch(`${fixture.url}/permissions?${query.toString()}`)).text();
  assert.match(atThreshold, /<span class="badge warn">Cần duyệt<\/span>/);
  assert.match(atThreshold, /<code>task\.change_task_status\.staff\.bulk<\/code>/);

  query.set('persona', 'NV-01');
  const leadBulk = await (await fetch(`${fixture.url}/permissions?${query.toString()}`)).text();
  assert.match(leadBulk, /<span class="badge ok">Được<\/span>/);
  assert.match(leadBulk, /<code>task\.change_task_status\.lead<\/code>/);

  // A query the engine cannot accept is explained, never a 500.
  query.set('action', 'bulk_change');
  const bad = await fetch(`${fixture.url}/permissions?${query.toString()}`);
  assert.equal(bad.status, 200);
  assert.match(await bad.text(), /Không hỏi được bộ luật/);

  for (const response of [allowed, refused, otherDepartment, atThreshold, leadBulk]) {
    assert.equal(response.includes(SERVICE_KEY), false);
    assert.equal(response.includes('<script>'), false);
  }
});

test('permissions: a cell missing from the file shows as "chưa khai" and a save can declare it', async (t) => {
  const rules = JSON.parse(rulesWithVersion(7)) as {
    resources: Record<string, { actions: Record<string, Record<string, unknown>> }>;
  };
  const taskCells = rules.resources['task']?.actions['change_task_status'] ?? {};
  delete taskCells['staff'];

  const fixture = await startFixture({ rulesText: JSON.stringify(rules) });
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/permissions`)).text();
  assert.match(page, /chưa khai/);
  const effectSelect = new RegExp(
    '<select name="cell\\.task\\.change_task_status\\.staff\\.effect"[^>]*>(.*?)</select>',
    's',
  ).exec(page)?.[1];
  assert.ok(effectSelect !== undefined);
  assert.match(effectSelect, /<option value="" selected>chưa khai<\/option>/);

  // An untouched save keeps the cell undeclared.
  const hidden = hiddenFields(page);
  const unchanged = await postForm(fixture, saveFields(readRules(fixture.rulesPath), hidden, catalogOf(page)));
  assert.equal(unchanged.status, 303);
  const afterUnchanged = readRules(fixture.rulesPath);
  assert.equal(afterUnchanged['version'], 8);
  assert.equal(
    (afterUnchanged['resources'] as Record<string, { actions: Record<string, Record<string, unknown>> }>)['task']?.actions[
      'change_task_status'
    ]?.['staff'],
    undefined,
  );

  // Setting the missing cell declares it in the next version.
  const declared = await postForm(
    fixture,
    saveFields(readRules(fixture.rulesPath), hiddenFields(await (await fetch(`${fixture.url}/permissions`)).text()), catalogOf(page), (fields) => {
      setField(fields, 'cell.task.change_task_status.staff.effect', 'allow');
      setField(fields, 'cell.task.change_task_status.staff.scope', 'own_department');
      setField(fields, 'cell.task.change_task_status.staff.bulk', 'needs_approval');
    }),
  );
  assert.equal(declared.status, 303);
  const afterDeclared = readRules(fixture.rulesPath);
  assert.equal(
    (afterDeclared['resources'] as Record<string, { actions: Record<string, Record<string, { effect: string }>> }>)['task']
      ?.actions['change_task_status']?.['staff']?.effect,
    'allow',
  );
});

test('permissions: a save works while the directory is off and keeps the rule fields', async (t) => {
  const fixture = await startFixture({ directory: false });
  t.after(() => fixture.close());

  const page = await (await fetch(`${fixture.url}/permissions`)).text();
  const hidden = hiddenFields(page);
  const before = readRules(fixture.rulesPath);
  const params = saveFields(before, hidden, catalogOf(page), (fields) => {
    removeField(fields, 'fields.employee.staff', 'work_email');
  });

  const response = await postForm(fixture, params);
  assert.equal(response.status, 303);
  const after = readRules(fixture.rulesPath);
  assert.equal(after['version'], 8);
  const staff = resourcesOf(after)['employee']?.fields['staff'] ?? [];
  assert.equal(staff.includes('work_email'), false);
  assert.ok((resourcesOf(after)['employee']?.fields['hr'] ?? []).includes('personal_phone'));
});

test('permissions: a broken live rule file is reported and can be restored from the page', async (t) => {
  const fixture = await startFixture({ rulesText: '{' });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/permissions`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /File luật không đọc được/);
  assert.match(html, /value="restore"/);
  assert.match(html, /name="csrf" value="[^"]+"/);
  assert.equal(html.includes('Bảng vai và hành động'), false);

  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
  const restored = await postForm(fixture, { csrf, action: 'restore', version: '0' });
  assert.equal(restored.status, 303, await restored.text());
  assert.equal(restored.headers.get('location'), '/permissions?restored=1');
  const base = JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as Record<string, unknown>;
  assert.deepEqual(readRules(fixture.rulesPath), base);

  const reloaded = await (await fetch(`${fixture.url}/permissions`)).text();
  assert.match(reloaded, /Bảng vai và hành động|Quyền/);
  assert.match(reloaded, /name="cell\.task\.change_task_status\.staff\.effect"/);
});

test('permissions: an old rule file without schema 2 is reported and can be restored', async (t) => {
  const old = JSON.parse(rulesWithVersion(7)) as Record<string, unknown>;
  delete old['schema'];
  const fixture = await startFixture({ rulesText: JSON.stringify(old) });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/permissions`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /File luật không đọc được/);
  assert.match(html, /value="restore"/);

  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
  const restored = await postForm(fixture, { csrf, action: 'restore', version: '0' });
  assert.equal(restored.status, 303, await restored.text());
  assert.equal(readRules(fixture.rulesPath)['schema'], 2);
});

test('permissions: the screen still opens when the directory is off and keeps the rule fields', async (t) => {
  const fixture = await startFixture({ directory: false });
  t.after(() => fixture.close());

  const response = await fetch(`${fixture.url}/permissions`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Không đọc được danh bạ/);
  assert.match(html, /vẫn sửa được/);
  // The seven employee fields in the rule file are still rendered, so a save cannot drop them.
  for (const field of ['id', 'name', 'department', 'role', 'work_email', 'personal_phone', 'home_address']) {
    assert.match(html, new RegExp(`name="catalog\\.employee" value="${field}"`));
  }
  assert.match(html, /<button type="submit" name="action" value="save">Lưu phiên bản 8<\/button>/);
  assert.match(html, /Thử quyết định/);
  assert.match(html, /<button type="submit" disabled>Thử quyết định<\/button>/);
});

test('permissions: a role name from the file is escaped like every other value', async (t) => {
  const rules = JSON.parse(rulesWithVersion(7)) as {
    approval: { approver_roles: string[] };
    resources: Record<
      string,
      {
        read: Record<string, string>;
        fields: Record<string, string[]>;
        actions: Record<string, Record<string, unknown>>;
      }
    >;
  };
  const evil = 'staff<script>alert(1)</script>';
  for (const resource of Object.values(rules.resources)) {
    resource.read = { [evil]: 'own_department' };
    resource.fields = { [evil]: ['id', 'name'] };
    for (const cells of Object.values(resource.actions)) {
      const first = Object.values(cells)[0] ?? { effect: 'deny' };
      for (const role of Object.keys(cells)) delete cells[role];
      cells[evil] = first;
    }
  }
  rules.approval.approver_roles = [evil];

  const fixture = await startFixture({ rulesText: JSON.stringify(rules) });
  t.after(() => fixture.close());

  const html = await (await fetch(`${fixture.url}/permissions`)).text();
  assert.match(html, /staff&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes(SERVICE_KEY), false);
});
