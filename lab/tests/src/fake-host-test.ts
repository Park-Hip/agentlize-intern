import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { LOOPBACK_HOST } from '@lab/shared';
import {
  FakeThoThanHost,
  fakeHostIdentity,
  HOST_PROTOCOL_VERSION,
  HOST_TIMEOUT_MS,
} from './fake-host.js';

interface SeenRequest {
  readonly method: string;
  readonly headers: IncomingHttpHeaders;
  /** `initialize`, `tools/list`, `tools/call`, or `DELETE` for the closing request. */
  readonly rpcMethod: string;
}

interface MockOptions {
  readonly initializeStatus?: number;
  readonly initializeDelayMs?: number;
}

interface MockGateway {
  readonly url: string;
  readonly requests: SeenRequest[];
  close(): Promise<void>;
}

/** A minimal `/mcp` answering the four requests the fake host makes. */
async function startMockGateway(options: MockOptions = {}): Promise<MockGateway> {
  const requests: SeenRequest[] = [];
  let sessions = 0;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw === '' ? null : (JSON.parse(raw) as Record<string, unknown>);
      const rpcMethod = typeof body?.['method'] === 'string' ? body['method'] : (req.method ?? 'GET');
      requests.push({ method: req.method ?? 'GET', headers: req.headers, rpcMethod });

      const sendJson = (status: number, payload: unknown, headers: Record<string, string> = {}): void => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
        res.end(JSON.stringify(payload));
      };

      if (req.method === 'DELETE') {
        sendJson(200, { status: 'closed' });
        return;
      }

      if (rpcMethod === 'initialize' && options.initializeDelayMs !== undefined) {
        await new Promise((done) => setTimeout(done, options.initializeDelayMs));
      }

      if (rpcMethod === 'initialize' && options.initializeStatus !== undefined && options.initializeStatus !== 200) {
        sendJson(
          options.initializeStatus,
          {
            jsonrpc: '2.0',
            id: body?.['id'] ?? null,
            error: {
              code: -32001,
              message: 'CHƯA THỰC HIỆN [KEY_INVALID] Khoá không hợp lệ, hoặc chủ khoá không có trong danh bạ.',
            },
          },
          { 'www-authenticate': 'Bearer realm="lab-gateway"' },
        );
        return;
      }

      const id = body?.['id'] ?? null;
      if (rpcMethod === 'initialize') {
        sessions += 1;
        sendJson(
          200,
          {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: HOST_PROTOCOL_VERSION,
              capabilities: { tools: {} },
              serverInfo: { name: 'mock-gateway', version: '0.0.0' },
            },
          },
          { 'mcp-session-id': `session-${sessions}` },
        );
        return;
      }

      if (rpcMethod === 'tools/list') {
        sendJson(200, {
          jsonrpc: '2.0',
          id,
          result: { tools: [{ name: 'find_employee' }, { name: 'get_task' }] },
        });
        return;
      }

      if (rpcMethod === 'tools/call') {
        sendJson(200, {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: 'Task T-12. Dữ liệu giả.' }],
            isError: false,
            _meta: { reason_code: null, trace_id: 'tr-mock' },
          },
        });
        return;
      }

      sendJson(404, { error: 'not_found' });
    })();
  });

  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(0, LOOPBACK_HOST, () => done());
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://${LOOPBACK_HOST}:${port}`,
    requests,
    close: () =>
      new Promise<void>((done, fail) => {
        server.closeAllConnections();
        server.close((error) => (error === undefined ? done() : fail(error)));
      }),
  };
}

test('fake host: every call opens a new session with the headers and timings of the real host', async (t) => {
  const mock = await startMockGateway();
  t.after(() => mock.close());

  const host = new FakeThoThanHost({ baseUrl: mock.url, key: 'lab_not-a-real-key', label: 'hoa' });
  const called = await host.call('get_task', { task_id: 'T-12' });
  const listed = await host.listTools();

  assert.deepEqual(
    mock.requests.map((request) => request.rpcMethod),
    ['initialize', 'tools/call', 'DELETE', 'initialize', 'tools/list', 'DELETE'],
    'each call opens initialize, makes one request, then closes its own session',
  );

  for (const request of mock.requests) {
    assert.equal(request.headers.authorization, 'Bearer lab_not-a-real-key');
    assert.equal(request.headers['user-agent'], 'node');
  }
  for (const request of mock.requests.filter((candidate) => candidate.method === 'POST')) {
    assert.match(String(request.headers['x-user-id']), /^user_[0-9a-f]{24}$/);
    assert.match(String(request.headers['x-agent-id']), /^agt_[0-9a-f]{24}$/);
    assert.match(String(request.headers['x-executor-id']), /^exe_[0-9a-f]{24}$/);
    assert.match(String(request.headers['x-user-email']), /^hoa@lab\.example$/);
  }

  const sessions = mock.requests.filter((request) => request.rpcMethod === 'initialize');
  assert.equal(sessions.length, 2, 'one initialize per call');
  const toolRequests = mock.requests.filter((request) => request.method === 'POST' && request.rpcMethod !== 'initialize');
  assert.equal(toolRequests.length, 2);
  assert.deepEqual(
    toolRequests.map((request) => request.headers['mcp-session-id']),
    ['session-1', 'session-2'],
    'each request carries the id of the session it just opened',
  );

  assert.equal(called.status, 200);
  assert.equal(called.text, 'Task T-12. Dữ liệu giả.');
  assert.equal(called.reasonCode, null);
  assert.equal(called.traceId, 'tr-mock');
  assert.equal(called.isError, false);
  assert.deepEqual(listed.toolNames, ['find_employee', 'get_task']);

  const timings = host.timings();
  assert.equal(timings.length, 2);
  for (const timing of timings) {
    assert.ok(timing.method === 'tools/call' || timing.method === 'tools/list');
    assert.equal(Number.isNaN(Date.parse(timing.openedAt)), false, 'the session open time is a date');
    for (const value of [timing.sessionMs, timing.callMs, timing.totalMs]) {
      assert.equal(typeof value, 'number');
      assert.ok(value >= 0);
    }
  }
  assert.equal(HOST_TIMEOUT_MS, 60_000, 'the host gives up at 60 seconds, as measured over stdio');

  const hoa = fakeHostIdentity('hoa');
  const nam = fakeHostIdentity('nam');
  assert.equal(hoa.userId.length, 29, 'user_ plus 24 characters');
  assert.notEqual(hoa.userId, nam.userId);
  assert.match(hoa.userEmail, /@lab\.example$/);
});

test('fake host: a refused initialize stops the call before any tool request', async (t) => {
  const mock = await startMockGateway({ initializeStatus: 401 });
  t.after(() => mock.close());

  const host = new FakeThoThanHost({ baseUrl: mock.url, key: 'lab_not-a-real-key' });
  const answer = await host.call('get_task', { task_id: 'T-12' });

  assert.equal(answer.status, 401);
  assert.match(answer.text, /^CHƯA THỰC HIỆN \[KEY_INVALID\]/);
  assert.equal(answer.reasonCode, 'KEY_INVALID');
  assert.equal(answer.isError, true);
  assert.deepEqual(mock.requests.map((request) => request.rpcMethod), ['initialize']);
  assert.equal(host.timings().length, 1);
  assert.equal(host.timings()[0]?.callMs, 0);
});

test('fake host: the 60 second cutoff is enforced, and a test can shorten it', async (t) => {
  const mock = await startMockGateway({ initializeDelayMs: 300 });
  t.after(() => mock.close());

  const host = new FakeThoThanHost({ baseUrl: mock.url, key: 'lab_not-a-real-key', timeoutMs: 25 });
  await assert.rejects(host.call('get_task', { task_id: 'T-12' }), /fake host host gave up after 25 ms/);
  assert.equal(host.timings().length, 0, 'an abandoned session leaves no timing');
});
