import { performance } from 'node:perf_hooks';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EMPLOYEE_ID_PATTERN, type ReasonCode } from '@lab/shared';
import { newTrail, TraceUnavailableError, writeTrace, type GatewayDeps } from '../call.js';
import { cardRows, formatClock, personLabel } from '../proposals/card.js';
import { effectiveStatus, PROPOSAL_ID_PATTERN, type Decision, type Proposal } from '../proposals/index.js';
import { SystemUnavailableError, type EmployeeRecord, type TaskRecord } from '../systems.js';
import type { KeyRecord } from '../identity/index.js';
import type { ToolResult } from '../tools/types.js';
import { checkWrite, type WriteRefusal } from '../writes/index.js';
import { cardPage, loginPage, messagePage, PAGE_SECURITY_HEADERS } from './html.js';
import { readForm } from './form.js';
import { SESSION_TTL_MS, type Session } from './session-store.js';

const LOGIN_PATH = '/dang-nhap';
const CARD_PATH = /^\/xac-nhan\/([^/]+?)(?:\/(gui|huy))?$/;
const COOKIE_NAME = 'lab_session';
/** `next` after a login may only be one of our own confirmation links. */
const NEXT_PATTERN = /^\/xac-nhan\/dx-[0-9a-f]{16}$/;

const TRACE_UNAVAILABLE = 'Cổng không ghi được vết nên chưa làm gì. Hãy báo người vận hành Lab.';

/** What each pressed button is called in the trace. */
const STEP_TOOL: Readonly<Record<Decision, string>> = { confirm: 'proposal_send', cancel: 'proposal_cancel' };

function sendHtml(res: ServerResponse, status: number, html: string, headers: Readonly<Record<string, string>> = {}): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...PAGE_SECURITY_HEADERS,
    ...headers,
  });
  res.end(html);
}

function redirect(res: ServerResponse, location: string, headers: Readonly<Record<string, string>> = {}): void {
  res.writeHead(303, { location, 'cache-control': 'no-store', ...headers });
  res.end();
}

function refusalPage(res: ServerResponse, status: number, code: ReasonCode | null, sentence: string): void {
  const text = code === null ? sentence : `CHƯA THỰC HIỆN [${code}] ${sentence}`;
  sendHtml(res, status, messagePage(status === 404 ? 'Không tìm thấy' : 'Chưa thực hiện', text, 'bad'));
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function sessionCookie(deps: GatewayDeps, token: string): string {
  const secure = deps.publicBaseUrl().startsWith('https:') ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

/** A browser form from another site carries its own `Origin`; one from these pages carries ours. A call with none (curl, tests) passes. */
function sameOrigin(deps: GatewayDeps, req: IncomingMessage): boolean {
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

function tokensEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function currentSession(deps: GatewayDeps, req: IncomingMessage): { token: string; session: Session } | undefined {
  const token = readCookie(req, COOKIE_NAME);
  if (token === undefined) return undefined;
  const session = deps.sessions.find(token);
  return session === undefined ? undefined : { token, session };
}

interface Step {
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
function traceStep(deps: GatewayDeps, started: number, step: Step): void {
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

function loginAddress(proposalId: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(`/xac-nhan/${proposalId}`)}`;
}

async function handleLogin(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET') {
    const next = new URL(req.url ?? '/', 'http://localhost').searchParams.get('next') ?? '';
    return sendHtml(res, 200, loginPage(NEXT_PATTERN.test(next) ? next : ''));
  }
  if (req.method !== 'POST') return sendHtml(res, 405, messagePage('Không hỗ trợ', 'Trang này nhận GET hoặc POST.', 'bad'), { allow: 'GET, POST' });
  if (!sameOrigin(deps, req)) return refusalPage(res, 403, null, 'Yêu cầu đến từ một trang khác nên bị từ chối.');

  const form = await readForm(req);
  if (form === undefined) return refusalPage(res, 400, null, 'Nội dung gửi lên không đọc được.');
  const employee = form.get('employee') ?? '';
  const key = form.get('key') ?? '';
  const nextValue = form.get('next') ?? '';
  const next = NEXT_PATTERN.test(nextValue) ? nextValue : '';

  // The key is checked like any call's key; the page only adds "is it this person's".
  const authenticated = EMPLOYEE_ID_PATTERN.test(employee) && key !== ''
    ? await deps.identity.authenticate({ authorization: `Bearer ${key}` })
    : undefined;
  if (authenticated === undefined || !authenticated.ok || authenticated.identity.employeeId !== employee) {
    return sendHtml(res, 401, loginPage(next, 'Khoá không đúng với nhân vật này. Hãy kiểm tra lại, hoặc xin người quản lý Lab cấp khoá.', employee));
  }

  const session = deps.sessions.create(employee, authenticated.identity.keyId);
  const cookie = { 'set-cookie': sessionCookie(deps, session.token) };
  if (next !== '') return redirect(res, next, cookie);
  return sendHtml(res, 200, messagePage('Đã đăng nhập giả lập', 'Phiên 15 phút đã mở. Hãy mở lại link xác nhận mà AI đưa cho bạn.', 'ok'), cookie);
}

async function handleCard(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse, proposalId: string): Promise<void> {
  if (req.method !== 'GET') return sendHtml(res, 405, messagePage('Không hỗ trợ', 'Trang này chỉ để xem.', 'bad'), { allow: 'GET' });

  const active = currentSession(deps, req);
  if (active === undefined) return redirect(res, loginAddress(proposalId));

  const proposal = PROPOSAL_ID_PATTERN.test(proposalId) ? deps.proposals.get(proposalId) : undefined;
  if (proposal === undefined) return refusalPage(res, 404, null, `Không tìm thấy đề xuất ${proposalId}.`);
  if (proposal.requester !== active.session.employeeId) {
    return refusalPage(res, 403, 'NOT_PERMITTED', 'Đề xuất này của người khác nên bạn không xem được. Hãy đăng nhập đúng nhân vật đã nhờ AI soạn.');
  }

  const rows = await cardRows(proposal, deps.systems);
  sendHtml(
    res,
    200,
    cardPage({
      proposalId: proposal.proposalId,
      taskId: proposal.taskId,
      requesterLabel: await personLabel(deps.systems, proposal.requester),
      rows,
      expiresAtLabel: formatClock(new Date(proposal.expiresAt)),
      status: effectiveStatus(proposal, deps.now()),
      csrfToken: active.session.csrfToken,
      command: deps.commands.findByProposal(proposal.proposalId),
    }),
  );
}

/** Why a press was not carried out: the code the trace keeps, the status and the sentence the person reads. */
const DECIDE_REFUSAL = {
  NOT_FOUND: { status: 404, code: null },
  NOT_REQUESTER: { status: 403, code: 'NOT_PERMITTED' },
  APPROVAL_EXPIRED: { status: 410, code: 'APPROVAL_EXPIRED' },
  APPROVAL_USED: { status: 409, code: 'APPROVAL_USED' },
  CONTENT_CHANGED: { status: 409, code: 'CONTENT_CHANGED' },
} as const satisfies Record<string, { status: number; code: ReasonCode | null }>;

const DECIDE_SENTENCE = {
  NOT_FOUND: 'Không tìm thấy đề xuất này.',
  NOT_REQUESTER: 'Chỉ người đã nhờ AI soạn đề xuất mới bấm được. Hãy đăng nhập đúng nhân vật.',
  APPROVAL_EXPIRED: 'Đề xuất đã hết hạn nên không gửi được. Hãy nhờ AI soạn lại.',
  APPROVAL_USED: 'Đề xuất này đã được gửi hoặc huỷ, và mỗi đề xuất chỉ bấm được một lần.',
  CONTENT_CHANGED: 'Nội dung đề xuất không còn khớp với lúc soạn nên cổng không gửi. Hãy nhờ AI soạn lại.',
} as const;

/**
 * The checks that depend on the key, the directory, the task list and the rule
 * file are done again here, right before the proposal is confirmed: any of them
 * may have changed since the draft. Time and content stay in the proposal
 * store, inside the transaction that changes the status.
 */
async function writeChecks(
  deps: GatewayDeps,
  proposal: Proposal,
  key: KeyRecord,
): Promise<{ ok: true } | { ok: false; check: WriteRefusal }> {
  let employee: EmployeeRecord | undefined;
  let task: TaskRecord | undefined;
  try {
    employee = await deps.systems.getEmployee(proposal.requester);
    task = await deps.systems.getTask(proposal.taskId);
  } catch (error) {
    if (!(error instanceof SystemUnavailableError)) throw error;
    return {
      ok: false,
      check: {
        ok: false,
        code: 'GATEWAY_UNAVAILABLE',
        status: 502,
        ruleId: `WEB.SYSTEM.${error.system}`,
        policyVersion: null,
        sentence: 'Cổng không nối được với danh bạ hoặc danh sách task nên chưa ghi. Hãy thử lại sau, hoặc báo người vận hành Lab.',
      },
    };
  }

  const check = checkWrite({ proposal, key, employee, task, policy: deps.policy });
  return check.ok ? { ok: true } : { ok: false, check };
}

async function handleDecision(
  deps: GatewayDeps,
  req: IncomingMessage,
  res: ServerResponse,
  proposalId: string,
  decision: Decision,
): Promise<void> {
  const started = performance.now();
  const tool = STEP_TOOL[decision];
  if (req.method !== 'POST') return sendHtml(res, 405, messagePage('Không hỗ trợ', 'Nút này chỉ nhận POST.', 'bad'), { allow: 'POST' });

  const active = currentSession(deps, req);
  const requester = active?.session.employeeId ?? null;
  const refused = (status: number, code: ReasonCode | null, ruleId: string, sentence: string, proposal?: Proposal): void => {
    traceStep(deps, started, {
      tool,
      requester,
      caller: callerOf(deps, active?.session),
      taskId: proposal?.taskId ?? null,
      proposalId: PROPOSAL_ID_PATTERN.test(proposalId) ? proposalId : null,
      outcome: code === null ? 'not_found' : 'refused',
      reasonCode: code,
      ruleId,
    });
    refusalPage(res, status, code, sentence);
  };

  if (!sameOrigin(deps, req)) {
    return refused(403, 'NOT_PERMITTED', 'WEB.ORIGIN', 'Yêu cầu đến từ một trang khác nên bị từ chối.');
  }
  if (active === undefined) {
    return refused(401, 'NOT_PERMITTED', 'WEB.NO_SESSION', 'Bạn chưa đăng nhập hoặc phiên đã hết. Hãy mở lại link xác nhận để đăng nhập giả lập.');
  }

  const form = await readForm(req);
  const csrf = form?.get('csrf') ?? '';
  if (form === undefined || !tokensEqual(csrf, active.session.csrfToken)) {
    return refused(403, 'NOT_PERMITTED', 'WEB.CSRF', 'Thiếu hoặc sai mã chống giả mạo. Hãy mở lại trang xác nhận rồi bấm lại.');
  }

  // A key revoked after the login ends the session at the next press.
  const key = deps.keys.findById(active.session.keyId);
  if (key === undefined) {
    deps.sessions.end(active.token);
    return refused(401, 'KEY_INVALID', 'WEB.KEY_INVALID', 'Khoá của phiên không còn trong danh sách cấp khoá. Hãy đăng nhập lại bằng khoá hợp lệ.');
  }
  if (key.revokedAt !== null) {
    deps.sessions.end(active.token);
    return refused(401, 'KEY_REVOKED', 'WEB.KEY_REVOKED', 'Khoá của bạn đã bị thu hồi nên phiên bị đóng. Hãy xin người quản lý Lab cấp khoá mới.');
  }

  // Pressing Gửi checks the key, the person, the rule file and the task again; only then does the proposal become confirmed.
  if (decision === 'confirm') {
    const proposal = PROPOSAL_ID_PATTERN.test(proposalId) ? deps.proposals.get(proposalId) : undefined;
    // Only a proposal still waiting for the press needs the second check; an expired or used one is answered by the store.
    if (proposal !== undefined && effectiveStatus(proposal, deps.now()) === 'awaiting_confirmation') {
      const checked = await writeChecks(deps, proposal, key);
      if (!checked.ok) {
        const { status, code, ruleId, policyVersion, sentence } = checked.check;
        traceStep(deps, started, {
          tool,
          requester,
          caller: key.caller,
          taskId: proposal.taskId,
          proposalId: proposal.proposalId,
          outcome: 'refused',
          reasonCode: code,
          ruleId,
          policyVersion,
        });
        return refusalPage(res, status, code, sentence);
      }
    }
  }

  const caller = key.caller;
  const result = deps.proposals.decide(proposalId, active.session.employeeId, decision, (decided) => {
    traceStep(deps, started, {
      tool,
      requester: decided.requester,
      caller,
      taskId: decided.taskId,
      proposalId: decided.proposalId,
      outcome: 'ok',
      reasonCode: null,
      ruleId: 'WEB.CONFIRM',
      policyVersion: decided.policyVersion,
    });
    // The command exists from the same transaction as the confirmation, so a crash cannot leave a confirmed proposal with no way to run.
    if (decision === 'confirm') deps.commands.createForProposal(decided);
  });

  if (!result.ok) {
    const { status, code } = DECIDE_REFUSAL[result.reason];
    return refused(status, code, `WEB.${result.reason}`, DECIDE_SENTENCE[result.reason], result.proposal);
  }

  if (decision === 'confirm') await deps.executor.execute(result.proposal);
  redirect(res, `/xac-nhan/${result.proposal.proposalId}`);
}

function callerOf(deps: GatewayDeps, session: Session | undefined): string | null {
  return session === undefined ? null : (deps.keys.findById(session.keyId)?.caller ?? null);
}

/**
 * The pages of the gateway: simulated login, the confirmation card and its two
 * buttons. Returns false for a path that is not one of them. Only the two
 * buttons (POST) change anything, and only from a session, with its CSRF token,
 * of the person who asked for the change.
 */
export async function handleWeb(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  try {
    if (path === LOGIN_PATH) {
      await handleLogin(deps, req, res);
      return true;
    }
    const match = CARD_PATH.exec(path);
    if (match === null) return false;
    const proposalId = match[1] ?? '';
    const action = match[2];
    if (action === undefined) await handleCard(deps, req, res, proposalId);
    else await handleDecision(deps, req, res, proposalId, action === 'gui' ? 'confirm' : 'cancel');
    return true;
  } catch (error) {
    if (!(error instanceof TraceUnavailableError)) throw error;
    if (!res.headersSent) sendHtml(res, 500, messagePage('Chưa thực hiện', TRACE_UNAVAILABLE, 'bad'));
    return true;
  }
}
