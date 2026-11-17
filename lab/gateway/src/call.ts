import { performance } from 'node:perf_hooks';
import { BodyError, maskKey, refusalMessage, type ReasonCode } from '@lab/shared';
import { z } from 'zod';
import type { IdentityHeaders, IdentityProvider, IdentityResult } from './identity/index.js';
import { RULE_IDS, type PolicyEngine } from './policy/index.js';
import { SystemUnavailableError, type Systems } from './systems.js';
import type { RegisteredTool, ToolResult } from './tools/types.js';
import { newTraceId, type TraceEntry, type TraceStore } from './trace/index.js';

/**
 * The part of a tool call that does not depend on the door it came through.
 * `POST /v1/tools/<name>` and `/mcp` both end here, so they share the catalog,
 * the permission checks, the answers and the trace line (SR8).
 */

export const UNKNOWN_TOOL = '(unknown)';

/** The header a host such as Thổ Thần attaches. Only ever written to the trace, masked. */
export const HOST_USER_HEADER = 'x-user-id';

export interface GatewayDeps {
  readonly identity: IdentityProvider;
  readonly policy: PolicyEngine;
  readonly systems: Systems;
  readonly trace: TraceStore;
  readonly tools: readonly RegisteredTool[];
}

/** What the trace line needs besides the tool's own result. Filled in as the call learns it, so a failure midway keeps what is known. */
export interface Trail {
  tool: string;
  requester: string | null;
  caller: string | null;
}

export function newTrail(): Trail {
  return { tool: UNKNOWN_TOOL, requester: null, caller: null };
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

export function refuse(code: ReasonCode, ruleId: string): ToolResult {
  return {
    status: REFUSAL_STATUS[code] ?? 403,
    text: refusalMessage(code, REFUSAL_SENTENCE[code] ?? 'Cổng từ chối yêu cầu này.'),
    reasonCode: code,
    outcome: 'refused',
    ruleId,
  };
}

/** A bad request is not a refusal of policy: no reason code, and the sentence says what to fix. */
export function badRequest(status: number, sentence: string): ToolResult {
  return { status, text: sentence, reasonCode: null, outcome: 'error' };
}

function describeInputProblem(error: z.ZodError): string {
  const parts = error.issues.map((issue) => {
    if (issue.code === 'unrecognized_keys') return `tham số không có trong tool: ${issue.keys.join(', ')}`;
    return issue.path.length > 0 ? `tham số ${issue.path.join('.')} sai` : issue.message;
  });
  return `Tham số không hợp lệ: ${parts.join('; ')}.`;
}

/**
 * Check one call and run it. `readArgs` supplies the arguments only after the
 * key and the tool name have passed, so a refused call never reads a body.
 */
async function answerCall(
  deps: GatewayDeps,
  authenticated: IdentityResult,
  toolName: string,
  readArgs: () => Promise<unknown>,
  trail: Trail,
): Promise<ToolResult> {
  if (!authenticated.ok) return refuse(authenticated.reason, `IDENTITY.${authenticated.reason}`);
  const { identity } = authenticated;
  trail.requester = identity.employeeId;
  trail.caller = identity.caller;

  const tool = deps.tools.find((candidate) => candidate.name === toolName);
  if (tool === undefined) {
    return badRequest(404, `Không có tool tên "${toolName}".`);
  }
  trail.tool = tool.name;

  let args: unknown;
  try {
    args = await readArgs();
  } catch (error) {
    if (error instanceof BodyError) {
      const sentence = error.code === 'body_too_large' ? 'Nội dung gửi lên quá lớn.' : 'Nội dung gửi lên phải là JSON.';
      return badRequest(error.status, sentence);
    }
    throw error;
  }

  const parsed = tool.inputSchema.safeParse(args);
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

async function answerSafely(
  deps: GatewayDeps,
  authenticated: IdentityResult,
  toolName: string,
  readArgs: () => Promise<unknown>,
  trail: Trail,
): Promise<ToolResult> {
  try {
    return await answerCall(deps, authenticated, toolName, readArgs, trail);
  } catch (error) {
    if (error instanceof SystemUnavailableError) return refuse('GATEWAY_UNAVAILABLE', `SYSTEM.${error.system}`);
    console.error(`[gateway] tool call failed: ${error instanceof Error ? error.message : String(error)}`);
    return badRequest(500, 'Cổng gặp lỗi nội bộ. Hãy báo người vận hành Lab kèm mã vết.');
  }
}

/** The `x-user-id` of a request, masked like a key; null when the host sent none. */
export function maskedHostUser(headers: IdentityHeaders): string | null {
  const header = headers[HOST_USER_HEADER];
  const value = (Array.isArray(header) ? header[0] : header)?.trim();
  return value === undefined || value === '' ? null : maskKey(value);
}

export interface CallOutcome {
  readonly result: ToolResult;
  readonly traceId: string;
}

/** Thrown when the trace line cannot be written: the answer is then not returned (SR7). */
export class TraceUnavailableError extends Error {
  constructor() {
    super('trace_unavailable');
  }
}

/** Append the trace line for one call. Every door writes it before the answer leaves. */
export function writeTrace(
  deps: GatewayDeps,
  entry: TraceEntry,
  trail: Trail,
  result: ToolResult,
  hostUser: string | null,
  startedAt: number,
): string {
  const traceId = newTraceId();
  try {
    deps.trace.append({
      traceId,
      requester: trail.requester,
      caller: trail.caller,
      entry,
      tool: trail.tool,
      objectId: result.objectId ?? null,
      outcome: result.outcome,
      reasonCode: result.traceReasonCode !== undefined ? result.traceReasonCode : result.reasonCode,
      outOfScope: result.outOfScope ?? false,
      ruleId: result.ruleId ?? null,
      policyVersion: result.policyVersion ?? null,
      hostUser,
      durationMs: performance.now() - startedAt,
    });
  } catch (error) {
    console.error(`[gateway] trace write failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new TraceUnavailableError();
  }
  return traceId;
}

/**
 * One whole call for a door: check, run, trace. `authenticated` is the result
 * of the key lookup the door already made for this request.
 * Throws `TraceUnavailableError` when the line cannot be written.
 */
export async function performCall(
  deps: GatewayDeps,
  entry: TraceEntry,
  headers: IdentityHeaders,
  authenticated: IdentityResult,
  toolName: string,
  readArgs: () => Promise<unknown>,
): Promise<CallOutcome> {
  const started = performance.now();
  const trail = newTrail();
  const result = await answerSafely(deps, authenticated, toolName, readArgs, trail);
  const traceId = writeTrace(deps, entry, trail, result, maskedHostUser(headers), started);
  return { result, traceId };
}

/** One catalog entry as the gateway publishes it. `/v1/tools` shows it as is; `/mcp` renames `input_schema`. */
export interface CatalogEntry {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
}

export function catalogEntries(tools: readonly RegisteredTool[]): readonly CatalogEntry[] {
  return tools.map((tool) => {
    const { $schema: _ignored, ...schema } = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
    return { name: tool.name, description: tool.description, input_schema: schema };
  });
}
