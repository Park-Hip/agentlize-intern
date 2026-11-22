import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { LOOPBACK_HOST, PERSONAS, readJsonBody } from '@lab/shared';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { runConversation } from '../shared/conversation.js';
import { createFakeModel, TOOL_SPECS, type FakeStep } from '../shared/fake-model.js';
import { LAN_OPEN_TASKS, findJob } from '../shared/jobs.js';
import type { UsageReporter } from '../shared/usage.js';
import { createDoor } from './door.js';

/**
 * The MCP door against a fake gateway that speaks the real protocol
 * (issue #108). The fake server is built from the same SDK the gateway uses,
 * so the door meets `initialize`, `tools/list` and `tools/call` over
 * Streamable HTTP, without a process, a database or a network key.
 */

const HOA_KEY = 'lab_test_hoa_key';
const NAM_KEY = 'lab_test_nam_key';

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
  'http://127.0.0.1:8790/xac-nhan/dx-0123456789abcdef',
].join('\n');

const PROPOSE_BULK_TEXT = [
  'Đã soạn đề xuất dx-fedcba9876543210 cho 30 task. Chưa có gì được ghi vào task.',
  'Việc này cần trưởng nhóm Vận hành duyệt vì đề xuất có 30 mục, chạm ngưỡng duyệt hàng loạt.',
  'Link xác nhận:',
  'http://127.0.0.1:8790/xac-nhan/dx-fedcba9876543210',
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
    { text: 'Bạn không có quyền chuyển người phụ trách task T-12. Hãy hỏi anh Quang, trưởng nhóm Vận hành.' },
  ],
};

/** A tool only the fake server lists, to prove the catalog is not kept in the door. */
const EXTRA_TOOL: Tool = {
  name: 'fake_only',
  description: 'Công cụ chỉ có trên máy chủ giả.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

interface RecordedCall {
  readonly tool: string;
  readonly turnId: string | null;
  readonly authorization: string | null;
}

interface FakeGateway {
  /** The base address, without `/mcp`. */
  readonly url: string;
  calls(): readonly RecordedCall[];
  close(): Promise<void>;
}

interface AnswerOptions {
  readonly reasonCode?: string | null;
  readonly isError?: boolean;
}

function textResult(text: string, traceId: string, options: AnswerOptions = {}): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(options.isError === true ? { isError: true } : {}),
    _meta: { reason_code: options.reasonCode ?? null, trace_id: traceId },
  };
}

/** The answers the real gateway gives for the four jobs, with the key deciding the refusal. */
function answerFor(tool: string, args: Readonly<Record<string, unknown>>, authorization: string | null): CallToolResult {
  switch (tool) {
    case 'find_employee':
      return textResult(FIND_MINH_TEXT, 'trace-find');
    case 'list_tasks':
      return textResult('Có 34 task khớp.', 'trace-list');
    case 'fake_only':
      return textResult('Chỉ máy chủ giả mới có công cụ này.', 'trace-fake');
    case 'propose_task_change': {
      const ids = Array.isArray(args['task_ids']) ? args['task_ids'] : [];
      if (authorization === `Bearer ${NAM_KEY}`) {
        return textResult(NAM_REFUSAL_TEXT, 'trace-nam', { isError: true, reasonCode: 'NOT_PERMITTED' });
      }
      if (ids.length === LAN_OPEN_TASKS.length) {
        return textResult(PROPOSE_BULK_TEXT, 'trace-bulk', { reasonCode: 'NEEDS_APPROVAL' });
      }
      return textResult(PROPOSE_T12_TEXT, 'trace-t12');
    }
    default:
      return textResult(`CHƯA THỰC HIỆN [NOT_PERMITTED] Không có công cụ ${tool}.`, 'trace-unknown', {
        isError: true,
        reasonCode: 'NOT_PERMITTED',
      });
  }
}

/**
 * A stateless Streamable HTTP server shaped like the gateway: one MCP server
 * and one transport per POST, no session id, JSON answers.
 */
async function startFakeGateway(): Promise<FakeGateway> {
  const recorded: RecordedCall[] = [];

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(405, { allow: 'POST' });
      res.end();
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'bad body' } }));
      return;
    }

    const authorization = req.headers.authorization ?? null;
    const turnId = typeof req.headers['x-lab-turn'] === 'string' ? req.headers['x-lab-turn'] : null;
    const mcp = new McpServer({ name: 'lab-fake-gateway', version: '0.0.0' }, { capabilities: { tools: {} } });
    mcp.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [...TOOL_SPECS.map((spec) => ({
        name: spec.name,
        description: spec.description,
        inputSchema: spec.inputSchema as Tool['inputSchema'],
      })), EXTRA_TOOL],
    }));
    mcp.setRequestHandler(CallToolRequestSchema, (request): CallToolResult => {
      recorded.push({ tool: request.params.name, turnId, authorization });
      return answerFor(request.params.name, request.params.arguments ?? {}, authorization);
    });

    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    res.once('close', () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  const server = createServer((req, res) => {
    void handle(req, res);
  });
  await new Promise<void>((ready, fail) => {
    server.once('error', fail);
    server.listen(0, LOOPBACK_HOST, ready);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object', 'the fake gateway must bind a port');

  return {
    url: `http://${LOOPBACK_HOST}:${address.port}`,
    calls: () => recorded,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((done, fail) => {
        server.close((error) => (error === undefined ? done() : fail(error)));
      });
    },
  };
}

function noUsage(): UsageReporter {
  return {
    async report() {
      return { reported: true, status: 200 };
    },
  };
}

const OFF_PEAK = () => new Date('2026-11-22T00:00:00Z');

test('mcp door: the catalog comes from tools/list and each call carries its own turn code', async () => {
  const gateway = await startFakeGateway();
  try {
    const hoa = await createDoor({ baseUrl: gateway.url, employeeId: PERSONAS.hoa.employeeId, toolKey: HOA_KEY });

    const tools = await hoa.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [...TOOL_SPECS.map((tool) => tool.name), 'fake_only'],
      'the door must list what the server lists, including a tool the door never names',
    );
    assert.equal(tools[0]?.description, TOOL_SPECS[0]?.description, 'the description must pass through unchanged');
    assert.deepEqual(tools[0]?.inputSchema, TOOL_SPECS[0]?.inputSchema, 'the JSON Schema must pass through unchanged');

    const answer = await hoa.callTool({ name: 'find_employee', args: { name: 'Minh' }, turnId: 'turn-direct-one' });
    assert.equal(answer.text, FIND_MINH_TEXT);
    assert.equal(answer.reasonCode, null);
    assert.equal(answer.traceId, 'trace-find');
    assert.equal(answer.isError, false);
    assert.ok(answer.durationMs >= 0);

    const nam = await createDoor({ baseUrl: gateway.url, employeeId: PERSONAS.nam.employeeId, toolKey: NAM_KEY });
    const refused = await nam.callTool({
      name: 'propose_task_change',
      args: { task_ids: ['T-12'], changes: { assignee: 'NV-04' } },
      turnId: 'turn-direct-two',
    });
    assert.equal(refused.isError, true, 'a refusal must stay an error');
    assert.equal(refused.reasonCode, 'NOT_PERMITTED', 'the reason code must come from _meta');
    assert.match(refused.text, /^CHƯA THỰC HIỆN \[NOT_PERMITTED\]/);
    assert.match(refused.text, /Quang/, 'the refusal must name the person to ask');

    assert.deepEqual(
      gateway.calls().map((call) => call.turnId),
      ['turn-direct-one', 'turn-direct-two'],
      'each call must send its own X-Lab-Turn',
    );
    assert.deepEqual(
      gateway.calls().map((call) => call.authorization),
      [`Bearer ${HOA_KEY}`, `Bearer ${NAM_KEY}`],
      'each call must carry the key of the person who typed',
    );
  } finally {
    await gateway.close();
  }
});

test('mcp door: the fake model passes all four jobs and Nam hears the gateway refusal', async () => {
  const gateway = await startFakeGateway();
  try {
    for (const [jobId, script] of Object.entries(SCRIPTS)) {
      const job = findJob(jobId);
      assert.ok(job !== undefined, `${jobId} must exist`);
      const key = job.persona === 'nam' ? NAM_KEY : HOA_KEY;
      const door = await createDoor({
        baseUrl: gateway.url,
        employeeId: PERSONAS[job.persona].employeeId,
        toolKey: key,
      });
      const turnId = `turn-test-${jobId}`;
      const before = gateway.calls().length;

      const outcome = await runConversation({
        job,
        turnId,
        model: createFakeModel({ steps: script }),
        door,
        usage: noUsage(),
        nowDate: OFF_PEAK,
      });

      assert.equal(outcome.verdict.correct, true, `${jobId}: ${outcome.verdict.reason}`);
      assert.equal(outcome.record.stopReason, 'answer');
      assert.equal(outcome.usageReported, true, `${jobId} must report its cost`);
      const calls = gateway.calls().slice(before);
      assert.equal(calls.length, outcome.toolCalls, `${jobId} must reach the gateway once per model tool call`);
      assert.ok(calls.every((call) => call.turnId === turnId), `${jobId} must send X-Lab-Turn on every call`);
      assert.ok(
        calls.every((call) => call.authorization === `Bearer ${key}`),
        `${jobId} must use the key of ${job.persona}`,
      );
    }

    const namRefusal = gateway.calls().find((call) => call.authorization === `Bearer ${NAM_KEY}`);
    assert.equal(namRefusal?.tool, 'propose_task_change');
  } finally {
    await gateway.close();
  }
});
