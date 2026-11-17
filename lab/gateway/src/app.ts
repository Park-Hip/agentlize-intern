import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import {
  BodyError,
  LOOPBACK_HOST,
  readJsonBody,
  refusalMessage,
  sendJson,
  type ReasonCode,
  type RequestHandler,
  type ToolResponse,
} from '@lab/shared';
import { z } from 'zod';
import type { IdentityProvider } from './identity/index.js';
import { RULE_IDS, type PolicyEngine } from './policy/index.js';
import { SystemUnavailableError, type Systems } from './systems.js';
import type { RegisteredTool, ToolResult } from './tools/types.js';
import { newTraceId, type TraceStore } from './trace/index.js';

export const UNKNOWN_TOOL = '(unknown)';

const TOOLS_PATH = '/v1/tools';
const TOOL_PATH = /^\/v1\/tools\/([A-Za-z0-9_]{1,64})$/;

export interface GatewayDeps {
  readonly identity: IdentityProvider;
  readonly policy: PolicyEngine;
  readonly systems: Systems;
  readonly trace: TraceStore;
  readonly tools: readonly RegisteredTool[];
}

/** What the trace line needs besides the tool's own result. Filled in as the call learns it, so a failure midway keeps what is known. */
interface Trail {
  tool: string;
  requester: string | null;
  caller: string | null;
}

const REFUSAL_STATUS: Readonly<Partial<Record<ReasonCode, number>>> = {
  KEY_INVALID: 401,
  KEY_REVOKED: 401,
  NOT_PERMITTED: 403,
  POLICY_UNAVAILABLE: 503,
  GATEWAY_UNAVAILABLE: 502,
};

const REFUSAL_SENTENCE: Readonly<Partial<Record<ReasonCode, string>>> = {
  KEY_INVALID: 'Khoá không hợp lệ, hoặc chủ khoá không có trong danh bạ. Hãy hỏi người đã cấp khoá cho bạn.',
  KEY_REVOKED: 'Khoá này đã bị thu hồi. Hãy xin người quản lý Lab cấp khoá mới.',
  NOT_PERMITTED: 'Vai của bạn chưa được khai trong bộ luật quyền nên cổng không trả gì. Hãy hỏi người quản lý bộ luật quyền.',
  POLICY_UNAVAILABLE: 'Cổng không đọc được bộ luật quyền nên chặn mọi yêu cầu. Hãy báo người vận hành Lab.',
  GATEWAY_UNAVAILABLE: 'Cổng không nối được với danh bạ hoặc danh sách task. Hãy thử lại sau, hoặc báo người vận hành Lab.',
};

function refuse(code: ReasonCode, ruleId: string): ToolResult {
  return {
    status: REFUSAL_STATUS[code] ?? 403,
    text: refusalMessage(code, REFUSAL_SENTENCE[code] ?? 'Cổng từ chối yêu cầu này.'),
    reasonCode: code,
    outcome: 'refused',
    ruleId,
  };
}

/** A bad request is not a refusal of policy: no reason code, and the sentence says what to fix. */
function badRequest(status: number, sentence: string): ToolResult {
  return { status, text: sentence, reasonCode: null, outcome: 'error' };
}

function describeInputProblem(error: z.ZodError): string {
  const parts = error.issues.map((issue) => {
    if (issue.code === 'unrecognized_keys') return `tham số không có trong tool: ${issue.keys.join(', ')}`;
    return issue.path.length > 0 ? `tham số ${issue.path.join('.')} sai` : issue.message;
  });
  return `Tham số không hợp lệ: ${parts.join('; ')}.`;
}

async function answerCall(deps: GatewayDeps, req: IncomingMessage, toolName: string, trail: Trail): Promise<ToolResult> {
  const authenticated = await deps.identity.authenticate(req.headers);
  if (!authenticated.ok) return refuse(authenticated.reason, `IDENTITY.${authenticated.reason}`);
  const { identity } = authenticated;
  trail.requester = identity.employeeId;
  trail.caller = identity.caller;

  const tool = deps.tools.find((candidate) => candidate.name === toolName);
  if (tool === undefined) {
    return badRequest(404, `Không có tool tên "${toolName}".`);
  }
  trail.tool = tool.name;

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error instanceof BodyError) {
      const sentence = error.code === 'body_too_large' ? 'Nội dung gửi lên quá lớn.' : 'Nội dung gửi lên phải là JSON.';
      return badRequest(error.status, sentence);
    }
    throw error;
  }

  const parsed = tool.inputSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(400, describeInputProblem(parsed.error));
  }

  // Role and department are read from the directory on every call, never kept: a transfer applies at once.
  const employee = await deps.systems.getEmployee(identity.employeeId);
  if (employee === undefined) {
    return refuse('KEY_INVALID', 'IDENTITY.NOT_IN_DIRECTORY');
  }
  const role = employee['role'];
  const department = employee['department'];
  if (typeof role !== 'string' || typeof department !== 'string') {
    return refuse('NOT_PERMITTED', RULE_IDS.roleUnknown);
  }

  // Also the gate for task reads: no readable rule file or no entry for the role means no answer at all.
  const rules = deps.policy.allowedFields(role);
  if (rules.effect !== 'allow') {
    const code = rules.reasonCode === 'POLICY_UNAVAILABLE' ? 'POLICY_UNAVAILABLE' : 'NOT_PERMITTED';
    return { ...refuse(code, rules.ruleId), policyVersion: rules.policyVersion };
  }

  return tool.run(
    { actor: { identity, employeeId: identity.employeeId, role, department }, systems: deps.systems, rules },
    parsed.data,
  );
}

async function answerSafely(deps: GatewayDeps, req: IncomingMessage, toolName: string, trail: Trail): Promise<ToolResult> {
  try {
    return await answerCall(deps, req, toolName, trail);
  } catch (error) {
    if (error instanceof SystemUnavailableError) return refuse('GATEWAY_UNAVAILABLE', `SYSTEM.${error.system}`);
    console.error(`[gateway] tool call failed: ${error instanceof Error ? error.message : String(error)}`);
    return badRequest(500, 'Cổng gặp lỗi nội bộ. Hãy báo người vận hành Lab kèm mã vết.');
  }
}

async function handleToolCall(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse, name: string): Promise<void> {
  const started = performance.now();
  const traceId = newTraceId();
  const trail: Trail = { tool: UNKNOWN_TOOL, requester: null, caller: null };
  const result = await answerSafely(deps, req, name, trail);

  // The line is written before the answer leaves. If it cannot be written, nothing is returned (SR7).
  try {
    deps.trace.append({
      traceId,
      requester: trail.requester,
      caller: trail.caller,
      entry: 'http',
      tool: trail.tool,
      objectId: result.objectId ?? null,
      outcome: result.outcome,
      reasonCode: result.traceReasonCode !== undefined ? result.traceReasonCode : result.reasonCode,
      outOfScope: result.outOfScope ?? false,
      ruleId: result.ruleId ?? null,
      policyVersion: result.policyVersion ?? null,
      durationMs: performance.now() - started,
    });
  } catch (error) {
    console.error(`[gateway] trace write failed: ${error instanceof Error ? error.message : String(error)}`);
    sendJson(res, 500, { error: 'trace_unavailable' });
    return;
  }

  const body: ToolResponse = { text: result.text, reason_code: result.reasonCode, trace_id: traceId };
  sendJson(res, result.status, body);
}

function catalogBody(tools: readonly RegisteredTool[]): unknown {
  return {
    tools: tools.map((tool) => {
      const { $schema: _ignored, ...schema } = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
      return { name: tool.name, description: tool.description, input_schema: schema };
    }),
  };
}

/**
 * The gateway's HTTP surface: the catalog, the tool calls and a health check.
 * Everything a tool call does is in `answerCall`; this function only routes.
 */
export function createGatewayHandler(deps: GatewayDeps): RequestHandler {
  const catalog = catalogBody(deps.tools);

  return async (req, res) => {
    const path = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`).pathname;
    const method = req.method ?? 'GET';

    if (path === '/health') {
      if (method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
      return sendJson(res, 200, { status: 'ok', service: 'gateway' });
    }

    // The catalog holds no data from any system, so it needs no key.
    if (path === TOOLS_PATH) {
      if (method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
      return sendJson(res, 200, catalog);
    }

    const toolMatch = TOOL_PATH.exec(path);
    if (toolMatch !== null) {
      if (method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' });
      return handleToolCall(deps, req, res, toolMatch[1] ?? '');
    }

    sendJson(res, 404, { error: 'not_found' });
  };
}
