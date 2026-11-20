import type { IncomingMessage, ServerResponse } from 'node:http';
import { BodyError, readJsonBody, refusalMessage, sendJson } from '@lab/shared';
import type { ZodError } from 'zod';
import type { GatewayDeps } from '../call.js';
import { usageInputSchema, type UsageInput, type UsageRow } from './usage-store.js';

/**
 * `POST /v1/usage`: the assistant reports what one conversation turn cost.
 * The gateway never calls a model, so it cannot know the price; it only checks
 * who is reporting, that the turn has a traced call by that person, and that
 * the body carries numbers and a model name and nothing else.
 */

const KEY_SENTENCE: Readonly<Record<'KEY_INVALID' | 'KEY_REVOKED', string>> = {
  KEY_INVALID: 'Khoá không hợp lệ, hoặc chủ khoá không có trong danh bạ. Hãy hỏi người đã cấp khoá cho bạn.',
  KEY_REVOKED: 'Khoá này đã bị thu hồi. Hãy xin người quản lý Lab cấp khoá mới.',
};

const TURN_NOT_YOURS =
  'Lượt này không có lời gọi nào mang mã nhân viên của bạn, nên cổng không nhận chi phí. ' +
  'Hãy gửi header X-Lab-Turn ở mỗi lời gọi trong lượt, rồi báo chi phí với cùng mã lượt.';

const ALREADY_REPORTED =
  'Lượt này đã có chi phí được báo. Bảng chi phí chỉ ghi thêm nên cổng không sửa dòng cũ.';

function describeInputProblem(error: ZodError): string {
  const parts = error.issues.map((issue) => {
    if (issue.code === 'unrecognized_keys') return `trường không có trong lệnh: ${issue.keys.join(', ')}`;
    return issue.path.length > 0 ? `trường ${issue.path.join('.')} sai` : issue.message;
  });
  return `Nội dung báo chi phí không hợp lệ: ${parts.join('; ')}.`;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  return error instanceof Error && error.message.includes('UNIQUE constraint failed: model_usage.turn_id');
}

function usageBody(row: UsageRow): Record<string, unknown> {
  return {
    turn_id: row.turnId,
    model: row.model,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    cost_usd: row.costUsd,
    at: row.at,
  };
}

export async function handleUsage(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const authenticated = await deps.identity.authenticate(req.headers);
  if (!authenticated.ok) {
    const reason = authenticated.reason;
    sendJson(
      res,
      401,
      {
        error: reason.toLowerCase(),
        reason_code: reason,
        message: refusalMessage(reason, KEY_SENTENCE[reason]),
      },
      { 'www-authenticate': 'Bearer realm="lab-gateway"' },
    );
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (!(error instanceof BodyError)) throw error;
    const message = error.code === 'body_too_large' ? 'Nội dung gửi lên quá lớn.' : 'Nội dung gửi lên phải là JSON.';
    sendJson(res, error.status, { error: error.code, message });
    return;
  }

  const parsed = usageInputSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid_usage', message: describeInputProblem(parsed.error) });
    return;
  }
  const input: UsageInput = parsed.data;

  // A turn belongs to the person whose calls it holds. A key that made no call
  // in that turn, or a turn shared with someone else, cannot report for it.
  const requester = authenticated.identity.employeeId;
  const owners = deps.trace.turnRequesters(input.turn_id);
  const mine = owners.includes(requester);
  const foreign = owners.some((owner) => owner !== null && owner !== requester);
  if (!mine || foreign) {
    sendJson(res, 403, { error: 'turn_not_yours', message: TURN_NOT_YOURS });
    return;
  }

  if (deps.trace.usageOfTurn(input.turn_id) !== undefined) {
    sendJson(res, 409, { error: 'usage_already_reported', message: ALREADY_REPORTED });
    return;
  }

  try {
    const row = deps.trace.appendUsage({
      turnId: input.turn_id,
      requester,
      caller: authenticated.identity.caller,
      model: input.model,
      inputTokens: input.input_tokens,
      outputTokens: input.output_tokens,
      costUsd: input.cost_usd,
    });
    sendJson(res, 201, usageBody(row));
  } catch (error) {
    if (isUniqueViolation(error)) {
      sendJson(res, 409, { error: 'usage_already_reported', message: ALREADY_REPORTED });
      return;
    }
    // The body is never logged: it is the caller's numbers, and an error must not leak them.
    console.error(`[gateway] usage write failed: ${error instanceof Error ? error.message : String(error)}`);
    sendJson(res, 500, {
      error: 'usage_unavailable',
      message: 'Cổng không ghi được chi phí. Hãy báo người vận hành Lab.',
    });
  }
}
