import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runTraceCli } from '../cli/trace.js';
import { openGatewayDatabase, openGatewayDatabaseReadOnly } from '../database.js';
import { startFixture, type GatewayFixture } from '../fixture.js';
import { TraceReader, TraceStore } from './trace-store.js';

const HOA = 'NV-02';
const NHUNG = 'NV-06';

interface ToolAnswer {
  readonly text: string;
  readonly reason_code: string | null;
  readonly trace_id: string;
}

async function callTool(
  f: GatewayFixture,
  tool: string,
  args: unknown,
  key: string,
  turn?: string,
): Promise<ToolAnswer> {
  const response = await fetch(`${f.gateway.url}/v1/tools/${tool}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(turn === undefined ? {} : { 'x-lab-turn': turn }),
    },
    body: JSON.stringify(args),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as ToolAnswer;
}

/** One JSON-RPC tool call, the way a host opens `/mcp`; `enableJsonResponse` makes the answer one JSON body. */
async function callMcp(f: GatewayFixture, tool: string, args: unknown, key: string, turn?: string): Promise<unknown> {
  const response = await fetch(`${f.gateway.url}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(turn === undefined ? {} : { 'x-lab-turn': turn }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

function reportUsage(f: GatewayFixture, key: string, body: unknown): Promise<Response> {
  return fetch(`${f.gateway.url}/v1/usage`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_USAGE = {
  turn_id: 'turn-hoa-cost',
  model: 'lab-test-model',
  input_tokens: 1200,
  output_tokens: 340,
  cost_usd: 0.0123,
};

test('usage: both doors write the turn code; a missing or malformed header leaves it empty', async () => {
  const f = await startFixture();
  try {
    const key = f.keyFor(HOA);

    const draft = await callTool(f, 'propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'NV-04' } }, key, 'turn-hoa-1');
    const mcp = await callMcp(f, 'get_task', { task_id: 'T-13' }, key, 'turn-mcp-1');
    const plain = await callTool(f, 'get_task', { task_id: 'T-13' }, key);
    const malformed = await callTool(f, 'get_task', { task_id: 'T-14' }, key, 'turn with spaces');

    const draftLine = f.gateway.trace.list({ traceId: draft.trace_id })[0];
    assert.equal(draftLine?.turnId, 'turn-hoa-1');
    assert.equal(draftLine?.usage, null, 'no cost has been reported for this turn yet');

    // The MCP answer carries a trace id in `_meta`; read the newest line with that turn instead of parsing the SDK shape.
    assert.match(JSON.stringify(mcp), /T-13/);
    const mcpLine = f.gateway.trace.list().find((row) => row.turnId === 'turn-mcp-1');
    assert.equal(mcpLine?.entry, 'mcp');
    assert.equal(mcpLine?.tool, 'get_task');

    assert.equal(f.gateway.trace.list({ traceId: plain.trace_id })[0]?.turnId, null);
    assert.equal(f.gateway.trace.list({ traceId: malformed.trace_id })[0]?.turnId, null);
  } finally {
    await f.close();
  }
});

test('usage: a reported turn shows tokens and money when T-12 is looked up, and another person cannot report for it', async () => {
  const f = await startFixture();
  try {
    const hoa = f.keyFor(HOA);
    const nhung = f.keyFor(NHUNG);

    const draft = await callTool(
      f,
      'propose_task_change',
      { task_ids: ['T-12'], changes: { assignee: 'NV-04' } },
      hoa,
      VALID_USAGE.turn_id,
    );
    assert.equal(f.gateway.trace.list({ traceId: draft.trace_id })[0]?.usage, null);

    const reported = await reportUsage(f, hoa, VALID_USAGE);
    assert.equal(reported.status, 201);
    const body = (await reported.json()) as Record<string, unknown>;
    assert.equal(body['turn_id'], VALID_USAGE.turn_id);
    assert.equal(body['input_tokens'], 1200);
    assert.equal(body['output_tokens'], 340);
    assert.equal(body['cost_usd'], 0.0123);
    assert.match(String(body['at']), /^\d{4}-\d{2}-\d{2}T/);

    const rows = f.gateway.trace.list({ task: 'T-12' });
    const line = rows.find((row) => row.traceId === draft.trace_id);
    assert.equal(line?.turnId, VALID_USAGE.turn_id);
    assert.equal(line?.usage?.inputTokens, 1200);
    assert.equal(line?.usage?.outputTokens, 340);
    assert.equal(line?.usage?.costUsd, 0.0123);
    assert.equal(line?.usage?.model, 'lab-test-model');

    const lines: string[] = [];
    runTraceCli(['--task', 'T-12'], f.gateway.trace, { out: (text) => lines.push(text) });
    const table = lines.join('\n');
    assert.match(table, /turn-hoa-cost/);
    assert.match(table, /\$0\.0123 \(1200 vào \/ 340 ra\) lab-test-model/);

    // A second turn owned by Hoa: Nhung's key has no call in it, so her report is refused.
    const second = await callTool(f, 'get_task', { task_id: 'T-13' }, hoa, 'turn-hoa-2');
    const refused = await reportUsage(f, nhung, { ...VALID_USAGE, turn_id: 'turn-hoa-2' });
    assert.equal(refused.status, 403);
    assert.equal((await refused.json() as { error: string }).error, 'turn_not_yours');
    assert.equal(f.gateway.trace.list({ traceId: second.trace_id })[0]?.usage, null);
    assert.equal(f.gateway.trace.usageOfTurn('turn-hoa-2'), undefined);

    assert.equal((await reportUsage(f, hoa, { ...VALID_USAGE, turn_id: 'turn-hoa-2' })).status, 201);
    assert.equal((await reportUsage(f, hoa, { ...VALID_USAGE, turn_id: 'turn-hoa-2', cost_usd: 9 })).status, 409);
    assert.equal(f.gateway.trace.usageOfTurn('turn-hoa-2')?.costUsd, 0.0123, 'the first report stands');

    // A turn no one called has no owner, so it cannot be reported either.
    const unknown = await reportUsage(f, hoa, { ...VALID_USAGE, turn_id: 'turn-nobody-called' });
    assert.equal(unknown.status, 403);
  } finally {
    await f.close();
  }
});

test('usage: the cost table only grows, keeps no conversation content, and refuses bad numbers', async () => {
  const f = await startFixture();
  try {
    const hoa = f.keyFor(HOA);
    await callTool(f, 'get_task', { task_id: 'T-12' }, hoa, 'turn-shape-1');

    const marker = 'Bí mật của khách hàng';
    const extra = await reportUsage(f, hoa, { ...VALID_USAGE, turn_id: 'turn-shape-1', prompt: marker });
    assert.equal(extra.status, 400);
    assert.match((await extra.json() as { message: string }).message, /prompt/);

    const negative = await reportUsage(f, hoa, { ...VALID_USAGE, turn_id: 'turn-shape-1', input_tokens: -1 });
    assert.equal(negative.status, 400);
    const spaced = await reportUsage(f, hoa, { ...VALID_USAGE, turn_id: 'turn-shape-1', model: 'một câu dài' });
    assert.equal(spaced.status, 400);
    assert.equal(f.gateway.trace.usageOfTurn('turn-shape-1'), undefined, 'a refused body writes no row');

    assert.equal((await reportUsage(f, hoa, { ...VALID_USAGE, turn_id: 'turn-shape-1' })).status, 201);

    const db = openGatewayDatabase(f.dir);
    try {
      const columns = (db.prepare('PRAGMA table_info(model_usage)').all() as { name: string }[]).map((row) => row.name);
      assert.deepEqual(columns, [
        'seq',
        'at',
        'turn_id',
        'requester',
        'caller',
        'model',
        'input_tokens',
        'output_tokens',
        'cost_usd',
      ]);
      const dump = JSON.stringify(db.prepare('SELECT * FROM model_usage').all());
      assert.ok(!dump.includes(marker), 'a rejected body leaves no content behind');
      assert.ok(!dump.includes('prompt') && !dump.includes('answer'), 'the table has no place for a conversation');
      assert.throws(() => db.prepare('UPDATE model_usage SET cost_usd = 0').run(), /append-only/);
      assert.throws(() => db.prepare('DELETE FROM model_usage').run(), /append-only/);
    } finally {
      db.close();
    }

    const noKey = await fetch(`${f.gateway.url}/v1/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_USAGE),
    });
    assert.equal(noKey.status, 401);
    assert.match(noKey.headers.get('www-authenticate') ?? '', /^Bearer/);
    assert.equal((await fetch(`${f.gateway.url}/v1/usage`)).status, 405);
  } finally {
    await f.close();
  }
});

test('usage: a cost reported once survives a restart and is still attached to its turn', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-usage-restart-'));
  const f = await startFixture({ dir });
  try {
    const hoa = f.keyFor(HOA);
    await callTool(f, 'get_task', { task_id: 'T-12' }, hoa, 'turn-restart-1');
    assert.equal((await reportUsage(f, hoa, { ...VALID_USAGE, turn_id: 'turn-restart-1' })).status, 201);
  } finally {
    await f.close();
  }

  const db = openGatewayDatabase(dir);
  try {
    const store = new TraceStore(db);
    assert.equal(store.usageOfTurn('turn-restart-1')?.costUsd, 0.0123);
    assert.equal(store.list().find((row) => row.turnId === 'turn-restart-1')?.usage?.model, 'lab-test-model');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usage: a database from before the turn column still reads, then gains both new pieces on the next gateway start', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-usage-old-'));
  try {
    const writer = openGatewayDatabase(dir);
    try {
      writer.exec(`
        CREATE TABLE trace (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, trace_id TEXT NOT NULL UNIQUE, at TEXT NOT NULL,
          requester TEXT, caller TEXT, entry TEXT NOT NULL, tool TEXT NOT NULL, object_id TEXT,
          outcome TEXT NOT NULL, reason_code TEXT, out_of_scope INTEGER NOT NULL, rule_id TEXT,
          policy_version INTEGER, duration_ms INTEGER NOT NULL
        );
        INSERT INTO trace (trace_id, at, requester, caller, entry, tool, outcome, out_of_scope, duration_ms)
        VALUES ('tr-0000000000000001', '2026-11-16T09:00:00.000Z', 'NV-02', 'test', 'http', 'get_task', 'ok', 0, 2);
      `);
    } finally {
      writer.close();
    }

    const reader = openGatewayDatabaseReadOnly(dir);
    try {
      const [row] = new TraceReader(reader).list();
      assert.equal(row?.turnId, null);
      assert.equal(row?.usage, null);
      assert.deepEqual(new TraceReader(reader).turnRequesters('turn-anything'), []);
      assert.equal(new TraceReader(reader).usageOfTurn('turn-anything'), undefined);
    } finally {
      reader.close();
    }

    const db = openGatewayDatabase(dir);
    try {
      const store = new TraceStore(db);
      const columns = (db.prepare('PRAGMA table_info(trace)').all() as { name: string }[]).map((column) => column.name);
      assert.ok(columns.includes('turn_id'));
      assert.ok(store.list()[0] !== undefined, 'the one old line survived the migration');
      store.appendUsage({
        turnId: 'turn-after-upgrade',
        requester: HOA,
        caller: 'test',
        model: 'lab-test-model',
        inputTokens: 1,
        outputTokens: 2,
        costUsd: 0.0001,
      });
      assert.equal(store.usageOfTurn('turn-after-upgrade')?.outputTokens, 2);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
