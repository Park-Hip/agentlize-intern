import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runTraceCli, formatTraceTable } from '../cli/trace.js';
import { UsageError } from '../cli/keys.js';
import { GATEWAY_DB_FILE, openGatewayDatabase, openGatewayDatabaseReadOnly } from '../database.js';
import { SECRETS, startFixture } from '../fixture.js';
import { TraceReader, TraceStore, newTraceId, type TraceRecord } from './trace-store.js';

const sample: TraceRecord = {
  traceId: 'tr-0000000000000001',
  requester: 'NV-02',
  caller: 'test',
  entry: 'http',
  tool: 'get_task',
  objectId: 'T-12',
  outcome: 'ok',
  reasonCode: null,
  outOfScope: false,
  ruleId: 'READ_SCOPE.own_department',
  policyVersion: 1,
  hostUser: null,
  proposalId: null,
  durationMs: 3.4,
};

function memoryStore(): { store: TraceStore; close(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'lab-trace-'));
  const db = openGatewayDatabase(dir);
  return {
    store: new TraceStore(db, () => new Date('2026-11-17T09:00:00.000Z')),
    close: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('trace: new codes are unique and shaped like tr-<16 hex>', () => {
  const codes = new Set(Array.from({ length: 200 }, () => newTraceId()));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.match(code, /^tr-[0-9a-f]{16}$/);
});

test('trace: a line is stored with every field and read back', () => {
  const { store, close } = memoryStore();
  try {
    store.append(sample);
    const [row] = store.list();
    assert.deepEqual(row, {
      ...sample,
      turnId: null,
      grantId: null,
      idempotencyKey: null,
      attempts: null,
      droppedFields: 0,
      usage: null,
      at: '2026-11-17T09:00:00.000Z',
      durationMs: 3,
    });
    assert.equal(store.count(), 1);
  } finally {
    close();
  }
});

test('trace: one line is read back by its own code, and a missing code gives no line', () => {
  const { store, close } = memoryStore();
  try {
    store.append(sample);
    store.append({ ...sample, traceId: 'tr-0000000000000002', requester: 'NV-05' });

    const found = store.list({ traceId: 'tr-0000000000000002' });
    assert.equal(found.length, 1);
    assert.equal(found[0]?.requester, 'NV-05');
    assert.deepEqual(store.list({ traceId: 'tr-ffffffffffffffff' }), []);
  } finally {
    close();
  }
});

test('trace: the table only grows, because the database refuses UPDATE and DELETE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-trace-'));
  const db = openGatewayDatabase(dir);
  try {
    const store = new TraceStore(db);
    store.append(sample);

    assert.throws(() => db.prepare("UPDATE trace SET requester = 'NV-99'").run(), /append-only/);
    assert.throws(() => db.prepare('UPDATE trace SET outcome = ?').run('error'), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM trace').run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM trace WHERE trace_id = ?').run(sample.traceId), /append-only/);

    assert.equal(store.count(), 1);
    assert.equal(store.list()[0]?.requester, 'NV-02');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('trace: the same code cannot be written twice, and a bad outcome is refused', () => {
  const { store, close } = memoryStore();
  try {
    store.append(sample);
    assert.throws(() => store.append(sample), /UNIQUE/);
    assert.throws(() => store.append({ ...sample, traceId: 'tr-2', outcome: 'maybe' as never }), /CHECK/);
  } finally {
    close();
  }
});

test('trace: after real calls every call has one line and no line holds personal data or a key', async () => {
  const f = await startFixture();
  try {
    const hoaKey = f.keyFor('NV-02');
    const nhungKey = f.keyFor('NV-06');
    const calls = [
      f.call('find_employee', { name: 'Minh' }, hoaKey),
      f.call('find_employee', { name: SECRETS.phone }, hoaKey),
      f.call('find_employee', { department: 'Kinh doanh' }, nhungKey),
      f.call('get_task', { task_id: 'T-12' }, hoaKey),
      f.call('get_task', { task_id: 'T-70' }, hoaKey),
      f.call('list_tasks', { assignee: 'NV-03' }, hoaKey),
      f.call('list_tasks', {}, 'lab_wrong-key'),
    ];
    const answers = await Promise.all(calls);

    assert.equal(f.gateway.trace.count(), calls.length);
    assert.equal(new Set(answers.map((answer) => answer.body.trace_id)).size, calls.length);

    const db = openGatewayDatabase(f.dir);
    try {
      const dump = JSON.stringify(db.prepare('SELECT * FROM trace').all());
      const forbidden = [
        SECRETS.phone,
        SECRETS.address,
        SECRETS.salaryBand,
        '@lab.example',
        'Vũ Quốc Minh',
        'Minh',
        'Gọi lại khách hàng',
        hoaKey,
        nhungKey,
        'lab_wrong-key',
      ];
      for (const text of forbidden) assert.ok(!dump.includes(text), `the trace must not contain "${text}"`);
    } finally {
      db.close();
    }

    for (const row of f.gateway.trace.list()) {
      assert.equal(row.entry, 'http');
      assert.ok(Number.isInteger(row.durationMs) && row.durationMs >= 0);
      assert.match(row.at, /^\d{4}-\d{2}-\d{2}T/);
    }

    const byTool = (tool: string) => f.gateway.trace.list().filter((row) => row.tool === tool);
    assert.equal(byTool('find_employee').length, 3);
    assert.equal(byTool('find_employee')[0]?.ruleId, 'employee.fields.hr');
    assert.equal(byTool('find_employee')[0]?.policyVersion, 1);
    assert.equal(byTool('find_employee')[0]?.requester, 'NV-06');
    assert.equal(byTool('find_employee')[0]?.caller, 'test');

    const refused = f.gateway.trace.list().find((row) => row.reasonCode === 'KEY_INVALID');
    assert.equal(refused?.requester, null);
    assert.equal(refused?.outcome, 'refused');
  } finally {
    await f.close();
  }
});

test('trace: the table is made by the gateway and survives a restart of the database connection', async () => {
  const f = await startFixture();
  try {
    await f.call('get_task', { task_id: 'T-12' }, f.keyFor('NV-02'));
    const db = openGatewayDatabase(f.dir);
    try {
      const trace = new TraceStore(db);
      assert.equal(trace.count(), 1);
      assert.ok(GATEWAY_DB_FILE.endsWith('.sqlite'));
    } finally {
      db.close();
    }
  } finally {
    await f.close();
  }
});

test('trace: a table made before host_user existed gets the column and keeps its lines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-trace-old-'));
  const db = openGatewayDatabase(dir);
  try {
    db.exec(`
      CREATE TABLE trace (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, trace_id TEXT NOT NULL UNIQUE, at TEXT NOT NULL,
        requester TEXT, caller TEXT, entry TEXT NOT NULL, tool TEXT NOT NULL, object_id TEXT,
        outcome TEXT NOT NULL, reason_code TEXT, out_of_scope INTEGER NOT NULL, rule_id TEXT,
        policy_version INTEGER, duration_ms INTEGER NOT NULL
      );
      INSERT INTO trace (trace_id, at, requester, caller, entry, tool, outcome, out_of_scope, duration_ms)
      VALUES ('tr-0000000000000009', '2026-11-16T09:00:00.000Z', 'NV-02', 'test', 'http', 'get_task', 'ok', 0, 2);
    `);
    const store = new TraceStore(db);
    store.append({ ...sample, hostUser: 'user_0...(len=29)' });
    new TraceStore(db); // opening it again must not try to add the column twice
    const rows = store.list();
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.hostUser, 'user_0...(len=29)');
    assert.equal(rows[1]?.hostUser, null);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('trace: a table made before the web entry is copied, keeps every line and its numbering, and still refuses UPDATE and DELETE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-trace-web-'));
  const db = openGatewayDatabase(dir);
  try {
    db.exec(`
      CREATE TABLE trace (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, trace_id TEXT NOT NULL UNIQUE, at TEXT NOT NULL,
        requester TEXT, caller TEXT, entry TEXT NOT NULL CHECK (entry IN ('http', 'mcp')), tool TEXT NOT NULL, object_id TEXT,
        outcome TEXT NOT NULL, reason_code TEXT, out_of_scope INTEGER NOT NULL, rule_id TEXT,
        policy_version INTEGER, host_user TEXT, duration_ms INTEGER NOT NULL
      );
      CREATE INDEX trace_requester ON trace (requester);
      CREATE TRIGGER trace_no_update BEFORE UPDATE ON trace BEGIN SELECT RAISE(ABORT, 'trace is append-only'); END;
      INSERT INTO trace (seq, trace_id, at, requester, caller, entry, tool, outcome, out_of_scope, duration_ms)
      VALUES (7, 'tr-0000000000000007', '2026-11-16T09:00:00.000Z', 'NV-02', 'test', 'mcp', 'get_task', 'ok', 0, 2);
    `);
    const store = new TraceStore(db);
    store.append({ ...sample, entry: 'web', tool: 'proposal_send', proposalId: 'dx-0123456789abcdef' });
    new TraceStore(db); // opening it again must not copy it again

    const rows = store.list();
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.entry, 'web');
    assert.equal(rows[0]?.proposalId, 'dx-0123456789abcdef');
    assert.equal(rows[1]?.traceId, 'tr-0000000000000007');
    assert.equal(rows[1]?.entry, 'mcp');
    assert.equal(rows[1]?.proposalId, null);
    assert.equal((db.prepare('SELECT seq FROM trace ORDER BY seq').all() as { seq: number }[])[0]?.seq, 7);
    assert.throws(() => db.prepare("UPDATE trace SET tool = 'x'").run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM trace').run(), /append-only/);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('trace: the reader filters by proposal and door, and counts what it would show', () => {
  const { store, close } = memoryStore();
  try {
    const proposal = 'dx-0123456789abcdef';
    store.append({ ...sample, traceId: 'tr-0000000000000001', entry: 'http', proposalId: proposal });
    store.append({ ...sample, traceId: 'tr-0000000000000002', entry: 'web', tool: 'proposal_send', proposalId: proposal });
    store.append({ ...sample, traceId: 'tr-0000000000000003', entry: 'mcp', objectId: 'T-70' });

    assert.deepEqual(
      store.list({ proposal }).map((row) => row.traceId),
      ['tr-0000000000000002', 'tr-0000000000000001'],
    );
    assert.equal(store.list({ entry: 'mcp' }).length, 1);
    assert.equal(store.list({ entry: 'mcp' })[0]?.objectId, 'T-70');
    assert.equal(store.count({ proposal }), 2);
    assert.equal(store.count({ entry: 'http' }), 1);
    assert.equal(store.count(), 3);
    // The same filters reach the CLI, so a person can follow a chain without the console.
    const lines: string[] = [];
    runTraceCli(['--proposal', proposal, '--entry', 'web'], store, { out: (line) => lines.push(line) });
    assert.equal(lines.length, 2, 'header and one line');
    assert.match(lines[1] ?? '', /tr-0000000000000002/);
    assert.throws(() => runTraceCli(['--proposal', 'dx-nope'], store, { out: () => {} }), UsageError);
    assert.throws(() => runTraceCli(['--entry', 'ftp'], store, { out: () => {} }), UsageError);
  } finally {
    close();
  }
});

test('trace: the console opens the file read-only, and a missing file is an error, not an empty table', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-trace-readonly-'));
  try {
    const writer = openGatewayDatabase(dir);
    try {
      new TraceStore(writer, () => new Date('2026-11-18T10:00:00.000Z')).append(sample);
    } finally {
      writer.close();
    }

    const reader = openGatewayDatabaseReadOnly(dir);
    try {
      assert.equal(new TraceReader(reader).count(), 1);
      assert.throws(() => reader.exec('DROP TABLE trace'), /readonly/i);
      assert.throws(
        () =>
          reader
            .prepare(
              `INSERT INTO trace (trace_id, at, entry, tool, outcome, out_of_scope, duration_ms)
               VALUES ('tr-00000000000000ff', '2026-11-18T10:00:00.000Z', 'http', 'get_task', 'ok', 0, 1)`,
            )
            .run(),
        /readonly/i,
      );
    } finally {
      reader.close();
    }

    const missing = mkdtempSync(join(tmpdir(), 'lab-trace-missing-'));
    try {
      assert.throws(() => openGatewayDatabaseReadOnly(missing), /unable to open|CANTOPEN/i);
    } finally {
      rmSync(missing, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('trace cli: --employee and --task print a table, other input is a usage error', () => {
  const { store, close } = memoryStore();
  try {
    store.append(sample);
    store.append({ ...sample, traceId: 'tr-0000000000000002', requester: 'NV-05', objectId: 'T-70', outcome: 'not_found', reasonCode: 'NOT_PERMITTED', outOfScope: true });
    store.append({ ...sample, traceId: 'tr-0000000000000003', requester: null, caller: null, objectId: null, outcome: 'refused', reasonCode: 'KEY_INVALID', ruleId: 'IDENTITY.KEY_INVALID', policyVersion: null });

    const run = (...argv: string[]): string[] => {
      const lines: string[] = [];
      runTraceCli(argv, store, { out: (line) => lines.push(line) });
      return lines;
    };

    const byEmployee = run('--employee', 'NV-05');
    assert.equal(byEmployee.length, 2, 'header and one line');
    assert.match(byEmployee[0] ?? '', /^time\s+trace\s+requester\s+caller\s+entry\s+tool\s+object\s+outcome\s+reason\s+scope\s+rule\s+policy\s+host_user\s+proposal\s+grant\s+key\s+tries\s+ms\s+turn\s+cost$/);
    assert.match(byEmployee[1] ?? '', /tr-0000000000000002\s+NV-05\s+test\s+http\s+get_task\s+T-70\s+not_found\s+NOT_PERMITTED\s+out_of_scope\s+READ_SCOPE\.own_department\s+v1\s+-\s+-\s+-\s+-\s+-\s+3\s+-\s+chi phí: host không báo$/);

    const byTask = run('--task', 'T-12');
    assert.equal(byTask.length, 2);
    assert.match(byTask[1] ?? '', /tr-0000000000000001/);

    assert.equal(run().length, 4, 'no filter prints every line');
    assert.deepEqual(run('--employee', 'NV-77'), ['no trace lines']);
    assert.equal(run('--limit', '1').length, 2);

    assert.throws(() => run('--employee', 'minh'), UsageError);
    assert.throws(() => run('--task', 'twelve'), UsageError);
    assert.throws(() => run('--limit', '0'), UsageError);
    assert.throws(() => run('--phone', '1'), /Unknown option/);

    const table = formatTraceTable(store.list());
    const widths = new Set(table.map((line) => line.indexOf('tr-') === -1 ? -1 : line.indexOf('tr-')));
    widths.delete(-1);
    assert.equal(widths.size, 1, 'columns line up');
  } finally {
    close();
  }
});
