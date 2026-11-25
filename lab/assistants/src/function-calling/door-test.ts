import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { PERSONAS } from '@lab/shared';
import { runConversation } from '../shared/conversation.js';
import { createFakeModel, type FakeStep } from '../shared/fake-model.js';
import { LAN_OPEN_TASKS, findJob } from '../shared/jobs.js';
import type { UsageReporter } from '../shared/usage.js';
import { createDoor } from './door.js';
import { TOOL_DECLARATIONS } from './tools.js';

/** Fake keys: they only prove the door carries the typist's own key, never a real credential. */
const HOA_KEY = 'lab_test_only_hoa_0123456789';
const NAM_KEY = 'lab_test_only_nam_0123456789';

const FIND_MINH_TEXT = [
  'Tìm thấy 1 nhân viên.',
  'Không hiện theo quyền của bạn: Số điện thoại cá nhân, Địa chỉ nhà.',
  '<<<DỮ LIỆU TỪ HỆ THỐNG>>>',
  'Mã: NV-04 | Tên: Vũ Quốc Minh | Phòng: Vận hành | Vai: staff | Email công việc: minh.vu@lab.example',
  '<<<HẾT DỮ LIỆU TỪ HỆ THỐNG>>>',
].join('\n');

const PROPOSE_T12_TEXT = [
  'Đã soạn đề xuất dx-0123456789abcdef cho task T-12. Chưa có gì được ghi vào task.',
  'Link xác nhận:',
  'http://127.0.0.1:8810/xac-nhan/dx-0123456789abcdef',
].join('\n');

const PROPOSE_BULK_TEXT = [
  'Đã soạn đề xuất dx-fedcba9876543210 cho 30 task. Chưa có gì được ghi vào task.',
  'Việc này cần trưởng nhóm Vận hành duyệt vì đề xuất có 30 mục, chạm ngưỡng duyệt hàng loạt.',
  'Link xác nhận:',
  'http://127.0.0.1:8810/xac-nhan/dx-fedcba9876543210',
].join('\n');

const NAM_REFUSAL_TEXT =
  'CHƯA THỰC HIỆN [NOT_PERMITTED] Bộ luật quyền không cho vai của bạn chuyển người phụ trách hoặc hạn của task. '
  + 'Hãy hỏi Trần Văn Quang, trưởng nhóm Vận hành.';

const SCRIPTS: Readonly<Record<string, readonly FakeStep[]>> = {
  'lookup-minh-phone': [
    { toolCalls: [{ name: 'find_employee', arguments: { name: 'Minh' } }] },
    { text: 'Anh Minh là Vũ Quốc Minh (NV-04), phòng Vận hành. Số điện thoại cá nhân không hiện theo quyền của bạn.' },
  ],
  'assign-t12-to-minh': [
    {
      toolCalls: [
        {
          name: 'propose_task_change',
          arguments: { task_ids: ['T-12'], changes: { assignee: 'NV-04', due: '2026-11-27' } },
        },
      ],
    },
    { text: 'Đã soạn đề xuất cho T-12, chưa ghi gì. Bạn mở link xác nhận và bấm Gửi.' },
  ],
  'reassign-lan-tasks': [
    { toolCalls: [{ name: 'list_tasks', arguments: { assignee: 'NV-03' } }] },
    { toolCalls: [{ name: 'propose_task_change', arguments: { task_ids: LAN_OPEN_TASKS, changes: { assignee: 'NV-04' } } }] },
    { text: 'Đã soạn đề xuất cho 30 task, chưa ghi gì. Việc này cần trưởng nhóm duyệt sau khi bạn bấm Gửi.' },
  ],
  'nam-assign-t12': [
    { toolCalls: [{ name: 'propose_task_change', arguments: { task_ids: ['T-12'], changes: { assignee: 'NV-04' } } }] },
    {
      text:
        'Bạn không có quyền chuyển người phụ trách task T-12 vì bộ luật quyền từ chối vai intern. '
        + 'Hãy hỏi anh Quang, trưởng nhóm Vận hành.',
    },
  ],
};

interface RecordedCall {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | undefined;
  readonly turnId: string | undefined;
  readonly contentType: string | undefined;
  readonly body: Readonly<Record<string, unknown>>;
}

interface FakeGateway {
  readonly url: string;
  readonly calls: RecordedCall[];
  close(): Promise<void>;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function answer(
  res: ServerResponse,
  status: number,
  text: string,
  reasonCode: string | null = null,
  traceId: string | null = 'trace-test',
): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ text, reason_code: reasonCode, trace_id: traceId }));
}

/** A stand-in for the gateway's plain API, so the test needs no stack and no key. */
async function startFakeGateway(): Promise<FakeGateway> {
  const calls: RecordedCall[] = [];
  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    let body: Readonly<Record<string, unknown>> = {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        body = parsed as Readonly<Record<string, unknown>>;
      }
    } catch {
      answer(res, 400, 'Nội dung gửi lên phải là JSON.');
      return;
    }

    const path = req.url ?? '';
    calls.push({
      method: req.method ?? '',
      path,
      authorization: firstHeader(req.headers.authorization),
      turnId: firstHeader(req.headers['x-lab-turn']),
      contentType: firstHeader(req.headers['content-type']),
      body,
    });

    if (req.method !== 'POST' || !path.startsWith('/v1/tools/')) {
      answer(res, 404, `Không có đường ${path}.`);
      return;
    }
    const name = path.slice('/v1/tools/'.length);
    if (name === 'find_employee') {
      answer(res, 200, FIND_MINH_TEXT);
      return;
    }
    if (name === 'list_tasks') {
      answer(res, 200, 'Có 30 task khớp.');
      return;
    }
    if (name === 'propose_task_change') {
      if (req.headers.authorization === `Bearer ${NAM_KEY}`) {
        answer(res, 403, NAM_REFUSAL_TEXT, 'NOT_PERMITTED');
        return;
      }
      const ids = body['task_ids'];
      if (Array.isArray(ids) && ids.length > 1) {
        answer(res, 200, PROPOSE_BULK_TEXT, 'NEEDS_APPROVAL');
        return;
      }
      answer(res, 200, PROPOSE_T12_TEXT);
      return;
    }
    answer(res, 404, `Không có tool tên "${name}".`);
  });

  await new Promise<void>((ready, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ready());
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object', 'the fake gateway must listen on a port');

  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    close: () =>
      new Promise<void>((done, fail) => {
        server.closeAllConnections();
        server.close((error) => (error === undefined ? done() : fail(error)));
      }),
  };
}

const USAGE: UsageReporter = {
  async report() {
    return { reported: true, status: 200 };
  },
};

function tickClock(): () => number {
  let tick = 0;
  return () => {
    tick += 5;
    return tick;
  };
}

const OFF_PEAK = () => new Date('2026-11-22T00:00:00Z');

test('function door: the fake model passes all four jobs over the hand-declared tools', async () => {
  const gateway = await startFakeGateway();
  try {
    for (const [jobId, script] of Object.entries(SCRIPTS)) {
      const job = findJob(jobId);
      assert.ok(job !== undefined, `${jobId} must exist`);
      const toolKey = job.persona === 'nam' ? NAM_KEY : HOA_KEY;
      const door = await createDoor({
        baseUrl: gateway.url,
        employeeId: PERSONAS[job.persona].employeeId,
        toolKey,
      });
      const turnId = `turn-test-${jobId}`;
      const before = gateway.calls.length;

      const outcome = await runConversation({
        job,
        turnId,
        model: createFakeModel({ steps: script }),
        door,
        usage: USAGE,
        now: tickClock(),
        nowDate: OFF_PEAK,
      });

      assert.equal(outcome.verdict.correct, true, `${jobId}: ${outcome.verdict.reason}`);
      assert.equal(outcome.usageReported, true, `${jobId} must report its cost`);
      assert.equal(outcome.record.stopReason, 'answer');

      const calls = gateway.calls.slice(before);
      assert.ok(calls.length > 0, `${jobId} must reach the gateway`);
      for (const call of calls) {
        assert.equal(call.method, 'POST');
        assert.ok(call.path.startsWith('/v1/tools/'), `${jobId} must call the plain API`);
        assert.equal(call.authorization, `Bearer ${toolKey}`);
        assert.equal(call.turnId, turnId, `${jobId} must send X-Lab-Turn on every call`);
        assert.match(call.contentType ?? '', /^application\/json/);
      }

      if (jobId === 'nam-assign-t12') {
        const refused = outcome.record.toolCalls.find((call) => call.name === 'propose_task_change');
        assert.ok(refused !== undefined, 'Nam must reach propose_task_change');
        assert.equal(refused.isError, true);
        assert.equal(refused.reasonCode, 'NOT_PERMITTED');
        assert.match(refused.text, /CHƯA THỰC HIỆN/);
        assert.match(refused.text, /Trần Văn Quang/);
        assert.match(outcome.record.finalAnswer, /không có quyền/i);
        assert.match(outcome.record.finalAnswer, /Quang/);
      }
    }
  } finally {
    await gateway.close();
  }
});

test('function door: the hand-declared catalog holds the seven gateway tools in order and needs no call', async () => {
  const gateway = await startFakeGateway();
  try {
    const door = await createDoor({ baseUrl: gateway.url, employeeId: 'NV-02', toolKey: HOA_KEY });
    const tools = await door.listTools();

    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        'find_employee',
        'get_task',
        'list_tasks',
        'propose_task_change',
        'get_request_status',
        'propose_employee_change',
        'propose_leave_request',
      ],
    );
    assert.equal(gateway.calls.length, 0, 'a declared catalog must not call the gateway');
    assert.equal(tools.length, TOOL_DECLARATIONS.length);

    for (const tool of tools) {
      assert.ok(tool.description.length > 20, `${tool.name} needs a Vietnamese description`);
      assert.equal((tool.inputSchema as { type?: unknown }).type, 'object');
    }

    const propose = tools.find((tool) => tool.name === 'propose_task_change');
    assert.ok(propose !== undefined);
    const schema = propose.inputSchema as { required?: readonly string[] };
    assert.deepEqual(schema.required, ['task_ids', 'changes']);
  } finally {
    await gateway.close();
  }
});

test('function door: a 403 refusal is an error, a 200 answer that needs approval is not', async () => {
  const gateway = await startFakeGateway();
  try {
    const hoa = await createDoor({ baseUrl: gateway.url, employeeId: 'NV-02', toolKey: HOA_KEY });
    const approval = await hoa.callTool({
      name: 'propose_task_change',
      args: { task_ids: ['T-12', 'T-13'], changes: { assignee: 'NV-04' } },
      turnId: 'turn-approval',
    });
    assert.equal(approval.isError, false);
    assert.equal(approval.reasonCode, 'NEEDS_APPROVAL');
    assert.equal(approval.traceId, 'trace-test');
    assert.ok(approval.durationMs >= 0);

    const nam = await createDoor({ baseUrl: gateway.url, employeeId: 'NV-05', toolKey: NAM_KEY });
    const refused = await nam.callTool({
      name: 'propose_task_change',
      args: { task_ids: ['T-12'], changes: { assignee: 'NV-04' } },
      turnId: 'turn-refused',
    });
    assert.equal(refused.isError, true);
    assert.equal(refused.reasonCode, 'NOT_PERMITTED');
    assert.match(refused.text, /Trần Văn Quang/);
  } finally {
    await gateway.close();
  }
});

test('function door: an unreachable gateway fails without carrying the key', async () => {
  const gateway = await startFakeGateway();
  const url = gateway.url;
  await gateway.close();

  const door = await createDoor({ baseUrl: url, employeeId: 'NV-02', toolKey: HOA_KEY });
  await assert.rejects(
    door.callTool({ name: 'find_employee', args: { name: 'Minh' }, turnId: 'turn-down' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /could not be reached/);
      assert.ok(!error.message.includes(HOA_KEY), 'the key must not travel with an error');
      return true;
    },
  );
});
