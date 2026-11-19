import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { REFUSAL_PREFIX } from '@lab/shared';
import { INJECTED_DESCRIPTION, SECRETS, startFixture, type GatewayFixture } from './fixture.js';
import { BLOCK_END, BLOCK_REPLACEMENT, BLOCK_START, wrapSystemData } from './tools/block.js';
import { MAX_ROWS } from './tools/read-tools.js';

const HOA = 'NV-02';
const NAM = 'NV-05';
const NHUNG = 'NV-06';
const GUEST = 'NV-99';

async function withGateway(run: (f: GatewayFixture) => Promise<void>): Promise<void> {
  const f = await startFixture();
  try {
    await run(f);
  } finally {
    await f.close();
  }
}

test('read: the catalog lists the three read tools and the two proposal tools, in Vietnamese, with no tool that writes or confirms', async () => {
  await withGateway(async (f) => {
    const response = await fetch(`${f.gateway.url}/v1/tools`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      tools: {
        name: string;
        description: string;
        kind: string;
        input_schema: { properties: Record<string, unknown> };
      }[];
    };

    assert.deepEqual(body.tools.map((tool) => tool.name), ['find_employee', 'get_task', 'list_tasks', 'propose_task_change', 'get_request_status']);
    // Only propose_task_change drafts a change; get_request_status reads a proposal like the other read tools.
    assert.deepEqual(
      Object.fromEntries(body.tools.map((tool) => [tool.name, tool.kind])),
      {
        find_employee: 'read',
        get_task: 'read',
        list_tasks: 'read',
        propose_task_change: 'propose',
        get_request_status: 'read',
      },
    );
    for (const tool of body.tools) {
      assert.ok(tool.description.length > 40, `${tool.name} needs a real description`);
      assert.match(tool.description, /[ăâđêôơư]/i, `${tool.name} description is Vietnamese`);
      assert.ok(tool.input_schema.properties !== undefined, `${tool.name} publishes its parameters`);
      assert.doesNotMatch(tool.name, /confirm|approve|write|update|set_|delete|assign|send/);
    }
    assert.deepEqual(Object.keys(body.tools[0]?.input_schema.properties ?? {}).sort(), ['department', 'name']);
  });
});

test('read: find_employee returns only the fields declared for the role of the asker', async () => {
  await withGateway(async (f) => {
    const hoa = await f.call('find_employee', { name: 'Minh' }, f.keyFor(HOA));
    assert.equal(hoa.status, 200);
    assert.equal(hoa.body.reason_code, null);
    assert.match(hoa.body.trace_id, /^tr-[0-9a-f]{16}$/);
    assert.match(hoa.body.text, /Mã: NV-04 \| Tên: Vũ Quốc Minh \| Phòng: Vận hành \| Vai: staff \| Email công việc: nv-04@lab\.example/);
    assert.match(hoa.body.text, /NV-11/, 'both people called Minh are found, in both departments');
    for (const secret of Object.values(SECRETS)) {
      assert.ok(!hoa.body.text.includes(secret), `staff must not receive ${secret}`);
    }

    // The same question from HR adds the two personal fields and still not the undeclared one.
    const nhung = await f.call('find_employee', { name: 'Minh' }, f.keyFor(NHUNG));
    assert.ok(nhung.body.text.includes(SECRETS.phone));
    assert.ok(nhung.body.text.includes(SECRETS.address));
    assert.ok(!nhung.body.text.includes(SECRETS.salaryBand), 'a field the rules never declare does not leave the gateway');
  });
});

test('read: find_employee names the labelled fields hidden from the asker, outside the data block', async () => {
  await withGateway(async (f) => {
    const line = 'Không hiện theo quyền của bạn: Số điện thoại cá nhân, Địa chỉ nhà.';
    for (const [persona, employeeId] of [
      ['Nam (intern)', NAM],
      ['Hoa (staff)', HOA],
    ] as const) {
      const answer = await f.call('find_employee', { name: 'Minh' }, f.keyFor(employeeId));
      assert.equal(answer.status, 200, persona);

      const lines = answer.body.text.split('\n');
      assert.equal(lines.filter((candidate) => candidate === line).length, 1, persona);
      assert.ok(lines.indexOf(line) < lines.indexOf(BLOCK_START), `${persona}: the line sits outside and before the block`);
      assert.ok(!line.includes(SECRETS.phone) && !line.includes(SECRETS.address), 'the line names fields, never values');
    }

    // hr may see every labelled field, so there is nothing to hide and no line.
    const hr = await f.call('find_employee', { name: 'Minh' }, f.keyFor(NHUNG));
    assert.equal(hr.status, 200);
    assert.ok(!hr.body.text.includes('Không hiện theo quyền của bạn'), 'a role that sees every labelled field gets no line');

    // "not found" keeps its old answer, with no line.
    const missing = await f.call('find_employee', { name: 'Không Có Ai' }, f.keyFor(HOA));
    assert.equal(missing.body.text, 'Không tìm thấy nhân viên nào khớp.');
  });
});

test('read: removing work_email from staff changes the hidden line on the next call, without a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-hidden-line-'));
  const rulesPath = join(dir, 'rules.json');
  const base = JSON.parse(readFileSync(new URL('../policy/rules.json', import.meta.url), 'utf8')) as {
    version: number;
    resources: { employee: { fields: Record<string, string[]> } };
  };
  writeFileSync(rulesPath, JSON.stringify(base, null, 2));
  const f = await startFixture({ rulesPath });
  try {
    const key = f.keyFor(HOA);
    const before = await f.call('find_employee', { name: 'Minh' }, key);
    assert.match(before.body.text, /Không hiện theo quyền của bạn: Số điện thoại cá nhân, Địa chỉ nhà\./);
    assert.match(before.body.text, /Email công việc: nv-04@lab\.example/);

    base.version = 2;
    base.resources.employee.fields['staff'] = (base.resources.employee.fields['staff'] ?? []).filter((field) => field !== 'work_email');
    writeFileSync(rulesPath, JSON.stringify(base, null, 2));

    const after = await f.call('find_employee', { name: 'Minh' }, key);
    assert.match(after.body.text, /Không hiện theo quyền của bạn: Email công việc, Số điện thoại cá nhân, Địa chỉ nhà\./);
    assert.doesNotMatch(after.body.text, /Email công việc: /, 'the value of the hidden field is gone');
    assert.ok(!after.body.text.includes('@lab.example'), 'no email of any employee leaves the gateway');
    assert.equal(f.gateway.trace.list({ employee: HOA })[0]?.policyVersion, 2, 'the new rule applied at once');
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read: a field new to the directory with no label is never named and never leaves the gateway', async () => {
  await withGateway(async (f) => {
    for (const record of f.systems.employees) {
      Object.assign(record, { badge_code: `BADGE-${String(record['employee_id'])}` });
    }

    for (const [persona, employeeId] of [
      ['Nam (intern)', NAM],
      ['Hoa (staff)', HOA],
      ['Nhung (hr)', NHUNG],
    ] as const) {
      const answer = await f.call('find_employee', { name: 'Minh' }, f.keyFor(employeeId));
      assert.equal(answer.status, 200, persona);
      assert.ok(!answer.body.text.includes('badge_code'), `${persona} must not see the field name`);
      assert.ok(!answer.body.text.includes('BADGE-'), `${persona} must not see a value`);
      assert.ok(!answer.body.text.includes('salary_band'), `${persona} must not see the unlabelled fixture field`);
      assert.ok(!answer.body.text.includes(SECRETS.salaryBand), `${persona} must not see its value`);
    }

    // The line of the two roles stays the same: only labelled fields can be named there.
    const staff = await f.call('find_employee', { name: 'Minh' }, f.keyFor(HOA));
    assert.match(staff.body.text, /Không hiện theo quyền của bạn: Số điện thoại cá nhân, Địa chỉ nhà\./);
    const hr = await f.call('find_employee', { name: 'Minh' }, f.keyFor(NHUNG));
    assert.ok(!hr.body.text.includes('Không hiện theo quyền của bạn'), 'no line mentions a field with no label');
  });
});

test('read: find_employee matches on name and department only and forwards nothing else', async () => {
  await withGateway(async (f) => {
    const key = f.keyFor(HOA);

    const byDepartment = await f.call('find_employee', { department: 'kinh doanh' }, key);
    assert.match(byDepartment.body.text, /Tìm thấy 2 nhân viên/);
    assert.match(byDepartment.body.text, /NV-11/);
    assert.ok(!byDepartment.body.text.includes('NV-04'));

    // A phone number, an email or a made-up parameter is not a search key, and the directory is never asked.
    const searchesBefore = f.systems.employeeSearches.length;
    for (const args of [{ personal_phone: '0900 555' }, { work_email: 'nv-04@lab.example' }, { name: 'Minh', limit: 1 }, {}]) {
      const refused = await f.call('find_employee', args, key);
      assert.equal(refused.status, 400, JSON.stringify(args));
      assert.equal(refused.body.reason_code, null);
    }
    assert.equal(f.systems.employeeSearches.length, searchesBefore);

    // Typing a phone number into `name` finds nobody, because the directory compares names only.
    const viaName = await f.call('find_employee', { name: '0900 555 004' }, key);
    assert.equal(viaName.body.text, 'Không tìm thấy nhân viên nào khớp.');
  });
});

test('read: get_task shows a task of the own department, wrapped as system data', async () => {
  await withGateway(async (f) => {
    const answer = await f.call('get_task', { task_id: 'T-12' }, f.keyFor(HOA));
    assert.equal(answer.status, 200);
    assert.equal(answer.body.reason_code, null);
    assert.match(answer.body.text, /^Task T-12\./);
    assert.ok(answer.body.text.includes('Gọi lại khách hàng X'));

    const lines = answer.body.text.split('\n');
    assert.equal(lines.filter((line) => line === BLOCK_START).length, 1);
    assert.equal(lines.filter((line) => line === BLOCK_END).length, 1);
    assert.equal(lines.at(-1), BLOCK_END, 'nothing follows the closing mark');
    assert.ok(lines.indexOf(BLOCK_START) < lines.findIndex((line) => line.startsWith('Mã: T-12')));
  });
});

test('read: removing a task field from staff changes the next get_task answer, without a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-task-fields-'));
  const rulesPath = join(dir, 'rules.json');
  const base = JSON.parse(readFileSync(new URL('../policy/rules.json', import.meta.url), 'utf8')) as {
    version: number;
    resources: { task: { fields: Record<string, string[]> } };
  };
  writeFileSync(rulesPath, JSON.stringify(base, null, 2));
  const f = await startFixture({ rulesPath });
  try {
    const key = f.keyFor(HOA);
    const before = await f.call('get_task', { task_id: 'T-12' }, key);
    assert.match(before.body.text, /Mô tả: Mô tả việc số 12/);

    base.version = 2;
    base.resources.task.fields['staff'] = (base.resources.task.fields['staff'] ?? []).filter((field) => field !== 'description');
    writeFileSync(rulesPath, JSON.stringify(base, null, 2));

    const after = await f.call('get_task', { task_id: 'T-12' }, key);
    assert.match(after.body.text, /^Task T-12\./);
    assert.match(after.body.text, /Tiêu đề: Gọi lại khách hàng X/);
    assert.doesNotMatch(after.body.text, /Mô tả: /, 'the hidden field label is gone');
    assert.ok(!after.body.text.includes('Mô tả việc số 12'), 'the hidden value does not leak');
    assert.equal(f.gateway.trace.list({ employee: HOA })[0]?.policyVersion, 2, 'the new rule applied at once');
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read: task read scope comes from the rule file, so any lets staff read another department', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-task-scope-'));
  const rulesPath = join(dir, 'rules.json');
  const base = JSON.parse(readFileSync(new URL('../policy/rules.json', import.meta.url), 'utf8')) as {
    version: number;
    resources: { task: { read: Record<string, string> } };
  };
  writeFileSync(rulesPath, JSON.stringify(base, null, 2));
  const f = await startFixture({ rulesPath });
  try {
    const key = f.keyFor(HOA);
    assert.equal((await f.call('get_task', { task_id: 'T-70' }, key)).body.text, 'Không tìm thấy task T-70.');

    base.version = 2;
    base.resources.task.read['staff'] = 'any';
    writeFileSync(rulesPath, JSON.stringify(base, null, 2));

    const answer = await f.call('get_task', { task_id: 'T-70' }, key);
    assert.match(answer.body.text, /^Task T-70\./);
    const row = f.gateway.trace.list({ employee: HOA })[0];
    assert.equal(row?.ruleId, 'task.read.staff');
    assert.equal(row?.policyVersion, 2);
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read: a task of another department and a missing task get the same answer, and the trace tells them apart', async () => {
  await withGateway(async (f) => {
    const nam = f.keyFor(NAM);
    const outside = await f.call('get_task', { task_id: 'T-70' }, nam);
    const missing = await f.call('get_task', { task_id: 'T-9999' }, nam);

    assert.equal(outside.status, 200);
    assert.equal(outside.status, missing.status);
    assert.equal(outside.body.text, 'Không tìm thấy task T-70.');
    assert.equal(missing.body.text, 'Không tìm thấy task T-9999.');
    assert.equal(outside.body.reason_code, null);
    assert.equal(missing.body.reason_code, null);

    const [outsideLine, missingLine] = [outside, missing].map((answer) => {
      const row = f.gateway.trace.list().find((line) => line.traceId === answer.body.trace_id);
      assert.ok(row, 'every call leaves a trace line');
      return row;
    });
    assert.equal(outsideLine?.outcome, 'not_found');
    assert.equal(outsideLine?.outOfScope, true);
    assert.equal(outsideLine?.reasonCode, 'NOT_PERMITTED');
    assert.equal(outsideLine?.objectId, 'T-70');
    assert.equal(missingLine?.outcome, 'not_found');
    assert.equal(missingLine?.outOfScope, false);
    assert.equal(missingLine?.reasonCode, null);
  });
});

test('read: a code that cannot be a task code is not found and is not stored in the trace', async () => {
  await withGateway(async (f) => {
    const answer = await f.call('get_task', { task_id: "T-1'; DROP TABLE trace; --" }, f.keyFor(HOA));
    assert.equal(answer.status, 200);
    assert.match(answer.body.text, /^Không tìm thấy task /);
    const row = f.gateway.trace.list()[0];
    assert.equal(row?.objectId, null);
  });
});

test('read: list_tasks stays inside the own department and applies the filters', async () => {
  await withGateway(async (f) => {
    const key = f.keyFor(HOA);

    const lan = await f.call('list_tasks', { assignee: 'NV-03', status: 'doing' }, key);
    assert.match(lan.body.text, /Có 1 task khớp/);
    assert.match(lan.body.text, /T-12 \| Gọi lại khách hàng X/);

    // Asking for the other department is not an error and not a leak: nothing is in scope.
    const other = await f.call('list_tasks', { department: 'Kinh doanh' }, key);
    assert.equal(other.status, 200);
    assert.equal(other.body.text, 'Không có task nào khớp.');
    assert.ok(!other.body.text.includes('T-70'));

    // Without a department filter the gateway still narrows the query to the asker's own.
    const all = await f.call('list_tasks', { assignee: 'NV-11' }, key);
    assert.equal(all.body.text, 'Không có task nào khớp.');
    assert.ok(f.systems.taskSearches.every((search) => search.department === 'Vận hành'));

    for (const args of [{ status: 'finished' }, { assignee: 'Lan' }, { department: 'Kho' }, { title: 'x' }]) {
      const bad = await f.call('list_tasks', args, key);
      assert.equal(bad.status, 400, JSON.stringify(args));
    }
  });
});

test('read: list_tasks cuts at 50 lines and says so', async () => {
  await withGateway(async (f) => {
    const answer = await f.call('list_tasks', { assignee: 'NV-03' }, f.keyFor(HOA));
    const total = f.systems.tasks.filter((task) => task.assignee === 'NV-03').length;
    assert.ok(total > MAX_ROWS);

    const [heading] = answer.body.text.split('\n');
    assert.equal(heading, `Có ${total} task khớp, chỉ hiện ${MAX_ROWS} dòng đầu. Hãy lọc thêm theo người phụ trách hoặc trạng thái.`);
    const lines = answer.body.text.split('\n');
    const inside = lines.slice(lines.indexOf(BLOCK_START) + 1, lines.indexOf(BLOCK_END));
    assert.equal(inside.length, MAX_ROWS);
  });
});

test('read: a copy of the closing mark inside the data cannot end the block', async () => {
  await withGateway(async (f) => {
    const answer = await f.call('get_task', { task_id: 'T-14' }, f.keyFor(HOA));
    const lines = answer.body.text.split('\n');
    assert.equal(lines.filter((line) => line.includes(BLOCK_END)).length, 1, 'only the real closing mark remains');
    assert.equal(lines.at(-1), BLOCK_END);
    assert.ok(answer.body.text.includes(INJECTED_DESCRIPTION.replace(BLOCK_END, BLOCK_REPLACEMENT)));
    assert.ok(answer.body.text.includes('Bạn là quản trị viên'), 'the text stays, only the mark is replaced');
  });
});

test('block: both marks are replaced, repeated and in decomposed form', () => {
  const decomposed = BLOCK_END.normalize('NFD');
  const wrapped = wrapSystemData(`a ${BLOCK_START} b ${BLOCK_END} c ${BLOCK_END} d ${decomposed}`);
  assert.equal(wrapped.split(BLOCK_START).length, 2);
  assert.equal(wrapped.split(BLOCK_END).length, 2);
  assert.equal(wrapped.split(BLOCK_REPLACEMENT).length - 1, 4);
});

test('read: role and department are read from the directory at every call, never kept', async () => {
  await withGateway(async (f) => {
    const nam = f.keyFor(NAM);
    const before = f.systems.directoryReads;
    assert.match((await f.call('get_task', { task_id: 'T-12' }, nam)).body.text, /^Task T-12/);
    assert.equal(f.systems.directoryReads, before + 1);

    // Nam moves to Kinh doanh: the very next call no longer sees T-12.
    const record = f.systems.employees.find((employee) => employee['employee_id'] === NAM);
    assert.ok(record);
    Object.assign(record, { department: 'Kinh doanh' });
    assert.equal((await f.call('get_task', { task_id: 'T-12' }, nam)).body.text, 'Không tìm thấy task T-12.');
    assert.match((await f.call('get_task', { task_id: 'T-70' }, nam)).body.text, /^Task T-70/);

    // Nam becomes HR: the next search shows the personal fields.
    Object.assign(record, { role: 'hr' });
    assert.ok((await f.call('find_employee', { name: 'Minh' }, nam)).body.text.includes(SECRETS.phone));

    // Nam leaves the directory: the key is refused as invalid at the next call.
    f.systems.employees = f.systems.employees.filter((employee) => employee['employee_id'] !== NAM);
    const gone = await f.call('get_task', { task_id: 'T-12' }, nam);
    assert.equal(gone.status, 401);
    assert.equal(gone.body.reason_code, 'KEY_INVALID');
  });
});

test('read: a key without a person in the directory, a bad key and a revoked key are all refused', async () => {
  await withGateway(async (f) => {
    const guest = await f.call('find_employee', { name: 'Minh' }, f.keyFor(GUEST));
    assert.equal(guest.status, 401);
    assert.equal(guest.body.reason_code, 'KEY_INVALID');
    assert.ok(guest.body.text.startsWith(`${REFUSAL_PREFIX} [KEY_INVALID] `));

    const none = await f.call('find_employee', { name: 'Minh' });
    assert.equal(none.body.reason_code, 'KEY_INVALID');
    const wrong = await f.call('find_employee', { name: 'Minh' }, 'lab_not-a-real-key');
    assert.equal(wrong.body.reason_code, 'KEY_INVALID');

    const issued = f.gateway.keys.issue({ employeeId: HOA, caller: 'test' });
    f.gateway.keys.revoke(issued.record.keyId);
    const revoked = await f.call('find_employee', { name: 'Minh' }, issued.rawKey);
    assert.equal(revoked.status, 401);
    assert.equal(revoked.body.reason_code, 'KEY_REVOKED');
    assert.ok(revoked.body.text.startsWith(`${REFUSAL_PREFIX} [KEY_REVOKED] `));

    // No refusal carries any data.
    for (const answer of [guest, none, wrong, revoked]) {
      assert.ok(!answer.body.text.includes('NV-04'));
    }
  });
});

test('read: a key declared read_only can read', async () => {
  await withGateway(async (f) => {
    const answer = await f.call('get_task', { task_id: 'T-12' }, f.keyFor(HOA, 'read_only'));
    assert.match(answer.body.text, /^Task T-12/);
  });
});

test('read: an unknown tool is a 404 for a known key and a refusal for an unknown one', async () => {
  await withGateway(async (f) => {
    const known = await f.call('confirm_proposal', {}, f.keyFor(HOA));
    assert.equal(known.status, 404);
    assert.equal(known.body.reason_code, null);

    // Without a key the gateway does not even say which tool names exist.
    const unknown = await f.call('confirm_proposal', {});
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.reason_code, 'KEY_INVALID');

    const response = await fetch(`${f.gateway.url}/v1/tools/get_task`);
    assert.equal(response.status, 405);
  });
});

test('read: a rule file that cannot be read stops every tool, and the next call recovers when it is fixed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-rules-'));
  const rulesPath = join(dir, 'rules.json');
  writeFileSync(rulesPath, '{ not json');
  const f = await startFixture({ rulesPath });
  try {
    const key = f.keyFor(HOA);
    for (const [tool, args] of [
      ['find_employee', { name: 'Minh' }],
      ['get_task', { task_id: 'T-12' }],
      ['list_tasks', {}],
    ] as const) {
      const answer = await f.call(tool, args, key);
      assert.equal(answer.status, 503, tool);
      assert.equal(answer.body.reason_code, 'POLICY_UNAVAILABLE');
      assert.ok(!answer.body.text.includes('NV-04'));
      assert.ok(!answer.body.text.includes('T-12 |'));
    }
    const row = f.gateway.trace.list()[0];
    assert.equal(row?.reasonCode, 'POLICY_UNAVAILABLE');
    assert.equal(row?.policyVersion, null);

    const good = readFileSync(new URL('../policy/rules.json', import.meta.url), 'utf8');
    writeFileSync(rulesPath, good);
    assert.match((await f.call('get_task', { task_id: 'T-12' }, key)).body.text, /^Task T-12/);
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read: a typo in a record type stops every tool with POLICY_UNAVAILABLE', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-rules-typo-'));
  const rulesPath = join(dir, 'rules.json');
  const rules = JSON.parse(readFileSync(new URL('../policy/rules.json', import.meta.url), 'utf8')) as {
    resources: Record<string, unknown>;
  };
  rules.resources['tsak'] = rules.resources['task'];
  writeFileSync(rulesPath, JSON.stringify(rules, null, 2));
  const f = await startFixture({ rulesPath });
  try {
    const key = f.keyFor(HOA);
    for (const [tool, args] of [
      ['find_employee', { name: 'Minh' }],
      ['get_task', { task_id: 'T-12' }],
      ['list_tasks', {}],
    ] as const) {
      const answer = await f.call(tool, args, key);
      assert.equal(answer.status, 503, tool);
      assert.equal(answer.body.reason_code, 'POLICY_UNAVAILABLE', tool);
      assert.equal(f.gateway.trace.list()[0]?.policyVersion, null, tool);
    }
    const propose = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } }, key);
    assert.equal(propose.status, 503);
    assert.equal(propose.body.reason_code, 'POLICY_UNAVAILABLE');
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read: a system that does not answer gives GATEWAY_UNAVAILABLE, never half an answer', async () => {
  await withGateway(async (f) => {
    const key = f.keyFor(HOA);

    f.systems.down = 'tasks';
    const tasksDown = await f.call('list_tasks', {}, key);
    assert.equal(tasksDown.status, 502);
    assert.equal(tasksDown.body.reason_code, 'GATEWAY_UNAVAILABLE');
    assert.ok(tasksDown.body.text.startsWith(`${REFUSAL_PREFIX} [GATEWAY_UNAVAILABLE] `));
    // The directory is still up, so the same key can still search people.
    assert.match((await f.call('find_employee', { name: 'Minh' }, key)).body.text, /NV-04/);

    f.systems.down = 'directory';
    const directoryDown = await f.call('find_employee', { name: 'Minh' }, key);
    assert.equal(directoryDown.body.reason_code, 'GATEWAY_UNAVAILABLE');

    const row = f.gateway.trace.list()[0];
    assert.equal(row?.reasonCode, 'GATEWAY_UNAVAILABLE');
    assert.equal(row?.outcome, 'refused');
  });
});
