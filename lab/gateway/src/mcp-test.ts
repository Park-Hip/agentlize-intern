import assert from 'node:assert/strict';
import test from 'node:test';
import { REFUSAL_PREFIX } from '@lab/shared';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { startFixture, type GatewayFixture } from './fixture.js';

const HOA = 'NV-02';
const NHUNG = 'NV-06';
const GUEST = 'NV-99';
const HOST_USER = 'user_0123456789abcdef01234567';

async function withGateway(run: (f: GatewayFixture) => Promise<void>): Promise<void> {
  const f = await startFixture();
  try {
    await run(f);
  } finally {
    await f.close();
  }
}

const mcpUrl = (f: GatewayFixture): string => `${f.gateway.url}/mcp`;

/** Connect the SDK's own client, as a host would. */
async function connect(f: GatewayFixture, headers: Record<string, string>): Promise<Client> {
  const client = new Client({ name: 'lab-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl(f)), { requestInit: { headers } }));
  return client;
}

async function invoke(client: Client, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

/** One JSON-RPC request with fetch, to see the bytes and the headers a host sees. */
async function rpc(
  f: GatewayFixture,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Headers; json: unknown }> {
  const response = await fetch(mcpUrl(f), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, json: text === '' ? null : JSON.parse(text) };
}

const callTool = (name: string, args: unknown, id = 1): unknown => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, arguments: args },
});

function firstText(result: CallToolResult): string {
  const first = result.content[0];
  assert.equal(first?.type, 'text');
  return first.type === 'text' ? first.text : '';
}

test('mcp: tools/list is the same catalog as GET /v1/tools', async () => {
  await withGateway(async (f) => {
    const client = await connect(f, { authorization: `Bearer ${f.keyFor(HOA)}` });
    const listed = await client.listTools();
    await client.close();

    const rest = (await (await fetch(`${f.gateway.url}/v1/tools`)).json()) as {
      tools: { name: string; description: string; input_schema: unknown }[];
    };
    assert.deepEqual(
      listed.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })),
      rest.tools,
    );
    assert.deepEqual(rest.tools.map((tool) => tool.name), ['find_employee', 'get_task', 'list_tasks']);
  });
});

test('mcp: a call answers with the same text and reason code as the REST door, and the trace says which door', async () => {
  await withGateway(async (f) => {
    const key = f.keyFor(HOA);
    const client = await connect(f, { authorization: `Bearer ${key}` });
    const viaMcp = await invoke(client, 'get_task', { task_id: 'T-12' });
    const viaRest = await f.call('get_task', { task_id: 'T-12' }, key);
    await client.close();

    assert.equal(viaMcp.isError, false);
    assert.equal(firstText(viaMcp), viaRest.body.text);
    const meta = viaMcp['_meta'] as { reason_code: unknown; trace_id: string };
    assert.equal(meta.reason_code, viaRest.body.reason_code);

    const line = f.gateway.trace.list().find((row) => row.traceId === meta.trace_id);
    assert.ok(line !== undefined, 'the call left a trace line');
    assert.equal(line.entry, 'mcp');
    assert.equal(line.requester, HOA);
    assert.equal(line.tool, 'get_task');
    assert.equal(line.objectId, 'T-12');
    assert.equal(f.gateway.trace.list().find((row) => row.traceId === viaRest.body.trace_id)?.entry, 'http');
  });
});

test('mcp: the same field allowlist applies, so HR sees what staff does not', async () => {
  await withGateway(async (f) => {
    const staff = await connect(f, { authorization: `Bearer ${f.keyFor(HOA)}` });
    const hr = await connect(f, { authorization: `Bearer ${f.keyFor(NHUNG)}` });
    const asStaff = firstText(await invoke(staff, 'find_employee', { name: 'Minh' }));
    const asHr = firstText(await invoke(hr, 'find_employee', { name: 'Minh' }));
    await Promise.all([staff.close(), hr.close()]);

    assert.ok(!asStaff.includes('Số điện thoại cá nhân'));
    assert.ok(asHr.includes('Số điện thoại cá nhân: 0900 555 004'));
  });
});

test('mcp: a refusal inside a call is an error result carrying the code; "not found" is an answer', async () => {
  await withGateway(async (f) => {
    const guest = await connect(f, { authorization: `Bearer ${f.keyFor(GUEST)}` });
    const refused = await invoke(guest, 'find_employee', { name: 'Minh' });
    await guest.close();
    assert.equal(refused.isError, true);
    assert.ok(firstText(refused).startsWith(`${REFUSAL_PREFIX} [KEY_INVALID] `));
    assert.equal((refused['_meta'] as { reason_code: unknown }).reason_code, 'KEY_INVALID');

    const client = await connect(f, { authorization: `Bearer ${f.keyFor(HOA)}` });
    const missing = await invoke(client, 'get_task', { task_id: 'T-9999' });
    const badArgs = await invoke(client, 'get_task', { task_id: 'T-12', extra: 1 });
    const noTool = await invoke(client, 'confirm_update', {});
    await client.close();

    assert.equal(missing.isError, false);
    assert.equal(firstText(missing), 'Không tìm thấy task T-9999.');
    assert.equal(badArgs.isError, true);
    assert.match(firstText(badArgs), /^Tham số không hợp lệ: .*extra/);
    assert.equal(noTool.isError, true);
    assert.equal(firstText(noTool), 'Không có tool tên "confirm_update".');
  });
});

test('mcp: a missing, wrong or revoked key gets 401 with the refusal text, and each leaves a trace line', async () => {
  await withGateway(async (f) => {
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'lab-test', version: '0.0.0' } },
    };
    const issued = f.gateway.keys.issue({ employeeId: HOA, caller: 'test' });
    f.gateway.keys.revoke(issued.record.keyId);

    const cases: [string, Record<string, string>, string][] = [
      ['no key', {}, 'KEY_INVALID'],
      ['wrong key', { authorization: 'Bearer lab_not-a-real-key' }, 'KEY_INVALID'],
      ['revoked key', { authorization: `Bearer ${issued.rawKey}` }, 'KEY_REVOKED'],
    ];
    for (const [label, headers, code] of cases) {
      const answer = await rpc(f, initialize, headers);
      assert.equal(answer.status, 401, label);
      assert.match(answer.headers.get('www-authenticate') ?? '', /^Bearer/, label);
      const error = (answer.json as { error: { message: string } }).error;
      assert.ok(error.message.startsWith(`${REFUSAL_PREFIX} [${code}] `), label);
    }

    const lines = f.gateway.trace.list();
    assert.equal(lines.length, 3);
    assert.deepEqual(lines.map((line) => line.reasonCode).reverse(), ['KEY_INVALID', 'KEY_INVALID', 'KEY_REVOKED']);
    for (const line of lines) {
      assert.equal(line.entry, 'mcp');
      assert.equal(line.outcome, 'refused');
    }
  });
});

test('mcp: no session is kept; a call works with no initialize and with an invented session id', async () => {
  await withGateway(async (f) => {
    const headers = { authorization: `Bearer ${f.keyFor(HOA)}` };
    const init = await rpc(
      f,
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'lab-test', version: '0.0.0' } } },
      headers,
    );
    assert.equal(init.status, 200);
    assert.equal(init.headers.get('mcp-session-id'), null, 'the gateway hands out no session id');

    const cold = await rpc(f, callTool('get_task', { task_id: 'T-12' }), headers);
    assert.equal(cold.status, 200);
    assert.match(JSON.stringify(cold.json), /Task T-12/);

    const invented = await rpc(f, callTool('get_task', { task_id: 'T-12' }, 2), { ...headers, 'mcp-session-id': 'not-issued-by-anyone' });
    assert.equal(invented.status, 200);
    assert.match(JSON.stringify(invented.json), /Task T-12/);
  });
});

test('mcp: a revoked key stops the very next call, with no session to outlive it', async () => {
  await withGateway(async (f) => {
    const issued = f.gateway.keys.issue({ employeeId: HOA, caller: 'test' });
    const headers = { authorization: `Bearer ${issued.rawKey}` };
    assert.equal((await rpc(f, callTool('get_task', { task_id: 'T-12' }), headers)).status, 200);
    f.gateway.keys.revoke(issued.record.keyId);
    assert.equal((await rpc(f, callTool('get_task', { task_id: 'T-12' }, 2), headers)).status, 401);
  });
});

test('mcp: only POST is served, and a body that is not JSON is a parse error', async () => {
  await withGateway(async (f) => {
    const headers = { authorization: `Bearer ${f.keyFor(HOA)}`, accept: 'application/json, text/event-stream' };
    for (const method of ['GET', 'DELETE']) {
      const response = await fetch(mcpUrl(f), { method, headers });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get('allow'), 'POST');
    }
    const garbage = await rpc(f, '{not json', headers);
    assert.equal(garbage.status, 400);
    assert.equal((garbage.json as { error: { code: number } }).error.code, -32700);
  });
});

test('mcp: x-user-id goes to the trace masked like a key, on both doors, and decides nothing', async () => {
  await withGateway(async (f) => {
    const key = f.keyFor(HOA);
    const client = await connect(f, { authorization: `Bearer ${key}`, 'x-user-id': HOST_USER });
    await invoke(client, 'get_task', { task_id: 'T-12' });
    await client.close();

    await fetch(`${f.gateway.url}/v1/tools/get_task`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-user-id': HOST_USER },
      body: JSON.stringify({ task_id: 'T-12' }),
    });
    await f.call('get_task', { task_id: 'T-12' }, key);

    const masked = `${HOST_USER.slice(0, 6)}...(len=${HOST_USER.length})`;
    const lines = f.gateway.trace.list();
    assert.deepEqual(lines.map((line) => line.hostUser).reverse(), [masked, masked, null]);
    assert.deepEqual(new Set(lines.map((line) => line.outcome)), new Set(['ok']), 'a stranger x-user-id changes no answer');
    assert.ok(!JSON.stringify(lines).includes(HOST_USER), 'the raw value is never stored');

    // A different claimed user, same key: the person is still the key's person.
    const other = await rpc(f, callTool('get_task', { task_id: 'T-12' }), { authorization: `Bearer ${key}`, 'x-user-id': 'user_someoneelse' });
    assert.equal(other.status, 200);
    assert.equal(f.gateway.trace.list()[0]?.requester, HOA);
  });
});

test('mcp: when the trace line cannot be written, the call returns no answer', async () => {
  await withGateway(async (f) => {
    const key = f.keyFor(HOA);
    const original = f.gateway.trace.append.bind(f.gateway.trace);
    f.gateway.trace.append = () => {
      throw new Error('disk full');
    };
    try {
      const answer = await rpc(f, callTool('get_task', { task_id: 'T-12' }), { authorization: `Bearer ${key}` });
      const result = (answer.json as { result: { isError: boolean; content: { text: string }[] } }).result;
      assert.equal(result.isError, true);
      assert.ok(!result.content[0]?.text.includes('T-12'), 'no task data leaves without a trace line');
    } finally {
      f.gateway.trace.append = original;
    }
  });
});
