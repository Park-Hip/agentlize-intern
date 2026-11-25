import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LeaveAdapter, leaveSchema } from './leave.js';

const RECORD = {
  code: 'NP-7',
  employee: 'NV-04',
  department: 'Vận hành',
  leave_type: 'annual',
  from_date: '2026-11-26',
  to_date: '2026-11-27',
  reason: 'Việc gia đình',
  note: 'Về quê',
  status: 'pending',
  request_key: 'dx-1:1',
  created_at: '2026-11-17T09:00:00.000Z',
  decided_at: '',
} as const;

interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function jsonResponse(body: unknown, status = 201, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function called(calls: readonly Call[], index: number): Call {
  const call = calls[index];
  assert.ok(call !== undefined, `call ${index} was made`);
  return call;
}

function headersOf(call: Call): Record<string, string> {
  return call.init?.headers as Record<string, string>;
}

test('leave adapter: a create posts the fixed key and returns the new code', async () => {
  const calls: Call[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return jsonResponse({ request: RECORD });
  };
  const adapter = new LeaveAdapter({ url: 'http://127.0.0.1:1', serviceKey: 'test-key', fetch: fakeFetch });

  const result = await adapter.create({
    idempotencyKey: 'dx-1:1',
    changes: {
      employee: 'NV-04',
      leave_type: 'annual',
      from_date: '2026-11-26',
      to_date: '2026-11-27',
      reason: 'Việc gia đình',
      note: 'Về quê',
    },
  });

  assert.deepEqual(result, { kind: 'created', record: RECORD, recordId: 'NP-7', replayed: false });
  const call = called(calls, 0);
  assert.equal(call.init?.method, 'POST');
  assert.equal(call.url, 'http://127.0.0.1:1/leave-requests');
  assert.equal(headersOf(call)['idempotency-key'], 'dx-1:1');
  assert.equal(headersOf(call).authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(String(call.init?.body)), {
    employee: 'NV-04',
    leave_type: 'annual',
    from_date: '2026-11-26',
    to_date: '2026-11-27',
    reason: 'Việc gia đình',
    note: 'Về quê',
  });
});

test('leave adapter: a replay says so and reads by code, by person and day, and never updates', async () => {
  const calls: Call[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const url = new URL(String(input));
    if (url.pathname === '/leave-requests/NP-7') return jsonResponse(RECORD, 200);
    if (url.pathname === '/leave-requests' && init?.method !== 'POST') {
      return jsonResponse({ requests: [RECORD] }, 200);
    }
    return jsonResponse({ request: RECORD }, 201, { 'idempotent-replayed': 'true' });
  };
  const adapter = new LeaveAdapter({ url: 'http://127.0.0.1:1', serviceKey: 'test-key', fetch: fakeFetch });

  const record = await adapter.get('NP-7');
  assert.deepEqual(record, RECORD);
  assert.equal(leaveSchema.safeParse(record).success, true);

  const listed = await adapter.list({ employee: 'NV-04', date: '2026-11-26', status: 'pending' });
  assert.deepEqual(listed, [RECORD]);
  const listCall = called(calls, 1);
  assert.equal(
    listCall.url,
    'http://127.0.0.1:1/leave-requests?employee=NV-04&date=2026-11-26&status=pending',
  );

  const replayed = await adapter.create({ idempotencyKey: 'dx-1:1', changes: { employee: 'NV-04' } });
  assert.equal(replayed.kind, 'created');
  assert.equal(replayed.kind === 'created' ? replayed.replayed : false, true);

  const update = await adapter.apply({
    id: 'NP-7',
    idempotencyKey: 'dx-1:1',
    expectedVersion: 1,
    changes: { reason: 'Khác' },
  });
  assert.deepEqual(update, { kind: 'rejected', status: 405, error: 'updates_not_supported' });
});

test('leave adapter: a missing request is undefined and an unknown reply is unavailable', async () => {
  const fakeFetch: typeof fetch = async (input) => {
    const url = new URL(String(input));
    return url.pathname === '/leave-requests/NP-99'
      ? jsonResponse({ error: 'leave_request_not_found' }, 404)
      : jsonResponse({ unexpected: true }, 200);
  };
  const adapter = new LeaveAdapter({ url: 'http://127.0.0.1:1', serviceKey: 'test-key', fetch: fakeFetch });

  assert.equal(await adapter.get('NP-99'), undefined);
  const result = await adapter.create({ idempotencyKey: 'dx-2:1', changes: { employee: 'NV-04' } });
  assert.deepEqual(result, { kind: 'unavailable', detail: 'reply has an unexpected shape' });
});

/**
 * The promise issue #145 checks: a new create system touches the adapter, its
 * registration, the rule file and its own tool. The change-set core, the write
 * path and the pages only learned the generic `create` contract, so no file
 * there may name this system.
 */
test('create contract: proposals, writes and web never name the leave system', async () => {
  const source = fileURLToPath(new URL('../../src/', import.meta.url));
  const forbidden = /nghỉ phép|NP-[0-9]|['"]leave['"]|leave-requests/i;
  for (const folder of ['proposals', 'writes', 'web']) {
    const dir = join(source, folder);
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const text = await readFile(join(dir, entry.name), 'utf8');
      assert.doesNotMatch(text, forbidden, `${folder}/${entry.name} must not name the leave system`);
    }
  }
});
