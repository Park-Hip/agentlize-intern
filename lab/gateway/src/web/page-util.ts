import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReasonCode } from '@lab/shared';
import { newTrail, writeTrace, type GatewayDeps } from '../call.js';
import type { ToolResult } from '../tools/types.js';
import { messagePage, PAGE_SECURITY_HEADERS } from './html.js';
import { SESSION_TTL_MS, type Session } from './session-store.js';

/** The single page that opens a session; every other page asks it first. */
export const LOGIN_PATH = '/dang-nhap';
export const COOKIE_NAME = 'lab_session';

/** After a login, `next` may only be one of our own pages (ADR-0008 section 3.1). */
export const NEXT_PATTERN = /^(?:\/cho-duyet|\/(?:xac-nhan|duyet)\/dx-[0-9a-f]{16})$/;

export const TRACE_UNAVAILABLE = 'Cổng không ghi được vết nên chưa làm gì. Hãy báo người vận hành Lab.';

export function sendHtml(
  res: ServerResponse,
  status: number,
  html: string,
  headers: Readonly<Record<string, string>> = {},
): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...PAGE_SECURITY_HEADERS,
    ...headers,
  });
  res.end(html);
}

export function redirect(res: ServerResponse, location: string, headers: Readonly<Record<string, string>> = {}): void {
  res.writeHead(303, { location, 'cache-control': 'no-store', ...headers });
  res.end();
}

export function refusalPage(res: ServerResponse, status: number, code: ReasonCode | null, sentence: string): void {
  const text = code === null ? sentence : `CHƯA THỰC HIỆN [${code}] ${sentence}`;
  sendHtml(res, status, messagePage(status === 404 ? 'Không tìm thấy' : 'Chưa thực hiện', text, 'bad'));
}

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

export function sessionCookie(deps: GatewayDeps, token: string): string {
  const secure = deps.publicBaseUrl().startsWith('https:') ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

/** A browser form from another site carries its own `Origin`; one from these pages carries ours. A call with none (curl, tests) passes. */
export function sameOrigin(deps: GatewayDeps, req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return host === req.headers.host || host === new URL(deps.publicBaseUrl()).host;
}

export function tokensEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function currentSession(deps: GatewayDeps, req: IncomingMessage): { token: string; session: Session } | undefined {
  const token = readCookie(req, COOKIE_NAME);
  if (token === undefined) return undefined;
  const session = deps.sessions.find(token);
  return session === undefined ? undefined : { token, session };
}

/** Where the login page sends a person back after they sign in. */
export function loginAddress(next: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

export interface Step {
  readonly tool: string;
  readonly requester: string | null;
  readonly caller: string | null;
  readonly taskId?: string | null;
  readonly proposalId?: string | null;
  readonly outcome: ToolResult['outcome'];
  readonly reasonCode: ReasonCode | null;
  readonly ruleId?: string | null;
  readonly policyVersion?: number | null;
}

/** One trace line for a page step. Throws `TraceUnavailableError` when it cannot be written. */
export function traceStep(deps: GatewayDeps, started: number, step: Step): void {
  const trail = newTrail();
  trail.tool = step.tool;
  trail.requester = step.requester;
  trail.caller = step.caller;
  writeTrace(
    deps,
    'web',
    trail,
    {
      status: 200,
      text: '',
      reasonCode: step.reasonCode,
      outcome: step.outcome,
      objectId: step.taskId ?? null,
      proposalId: step.proposalId ?? null,
      ruleId: step.ruleId ?? null,
      policyVersion: step.policyVersion ?? null,
    },
    null,
    started,
  );
}

export type SessionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'KEY_INVALID' | 'KEY_REVOKED'; readonly ruleId: string; readonly sentence: string };

/**
 * A page password revoked after the login ends the session at the next press,
 * for the confirmation page and the approval page alike (ADR-0008 section 3.1).
 */
export function verifySessionPassword(
  deps: GatewayDeps,
  active: { readonly token: string; readonly session: Session },
): SessionCheck {
  const password = deps.pagePasswords.findById(active.session.passwordId);
  if (password === undefined) {
    deps.sessions.end(active.token);
    return {
      ok: false,
      code: 'KEY_INVALID',
      ruleId: 'WEB.PASSWORD_INVALID',
      sentence: 'Mật khẩu trang của phiên không còn trong danh sách cấp. Hãy đăng nhập lại bằng mật khẩu trang.',
    };
  }
  if (password.revokedAt !== null) {
    deps.sessions.end(active.token);
    return {
      ok: false,
      code: 'KEY_REVOKED',
      ruleId: 'WEB.PASSWORD_REVOKED',
      sentence: 'Mật khẩu trang của bạn đã bị thu hồi nên phiên bị đóng. Hãy xin người quản lý Lab cấp mật khẩu trang mới.',
    };
  }
  return { ok: true };
}
