import { performance } from 'node:perf_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EMPLOYEE_ID_PATTERN, type ReasonCode } from '@lab/shared';
import { adapterOf, SystemUnavailableError, type RecordData } from '../adapters/index.js';
import { TraceUnavailableError, type GatewayDeps } from '../call.js';
import type { KeyRecord } from '../identity/index.js';
import { formatMoment, itemLabel, itemRows, personLabel, traceObjectId } from '../proposals/card.js';
import {
  actionFields,
  approvalRoster,
  effectiveStatus,
  PROPOSAL_ID_PATTERN,
  waitText,
  type ConfirmRoute,
  type DecideFailure,
  type Decision,
  type Proposal,
} from '../proposals/index.js';
import { checkWrite, type WriteRefusal } from '../writes/index.js';
import { handleApprovalPages } from './approval-routes.js';
import { readForm } from './form.js';
import { cardPage, loginPage, messagePage } from './html.js';
import {
  currentSession,
  LOGIN_PATH,
  loginAddress,
  NEXT_PATTERN,
  redirect,
  refusalPage,
  sameOrigin,
  sendHtml,
  sessionCookie,
  tokensEqual,
  traceStep,
  TRACE_UNAVAILABLE,
  verifySessionPassword,
} from './page-util.js';

const CARD_PATH = /^\/xac-nhan\/([^/]+?)(?:\/(gui|huy))?$/;

/** What each pressed button is called in the trace. */
const STEP_TOOL: Readonly<Record<Decision, string>> = { confirm: 'proposal_send', cancel: 'proposal_cancel' };

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
  const password = form.get('password') ?? '';
  const nextValue = form.get('next') ?? '';
  const next = NEXT_PATTERN.test(nextValue) ? nextValue : '';

  // A tool key is never looked up here, so a lab_ key is refused exactly like a wrong page password.
  const record = EMPLOYEE_ID_PATTERN.test(employee) && password !== ''
    ? deps.pagePasswords.findByRawPassword(password)
    : undefined;
  if (record === undefined || record.revokedAt !== null || record.employeeId !== employee) {
    return sendHtml(
      res,
      401,
      loginPage(
        next,
        'Mật khẩu trang không đúng với nhân vật này. Hãy kiểm tra lại, hoặc xin người quản lý Lab cấp mật khẩu trang mới.',
        employee,
      ),
    );
  }

  const session = deps.sessions.create(employee, record.passwordId);
  const cookie = { 'set-cookie': sessionCookie(deps, session.token) };
  if (next !== '') return redirect(res, next, cookie);
  return sendHtml(
    res,
    200,
    messagePage(
      'Đã đăng nhập giả lập',
      'Phiên 15 phút đã mở. Hãy mở lại link xác nhận mà AI đưa cho bạn, hoặc mở hộp Chờ tôi duyệt.',
      'ok',
      { href: '/cho-duyet', label: 'Mở hộp Chờ tôi duyệt' },
    ),
    cookie,
  );
}

/** The deadline of the step a proposal is on, and the rules that decide who approves it. */
async function approvalView(deps: GatewayDeps, proposal: Proposal): Promise<{
  readonly waitLabel: string;
  readonly approvers: readonly string[];
  readonly approvalExpiresAtLabel: string | null;
  readonly approval: { readonly actorLabel: string; readonly decision: 'approve' | 'reject'; readonly reason: string | null } | null;
}> {
  let department = '';
  try {
    const directory = adapterOf(deps.adapters, 'employee');
    const requester = await directory.get(proposal.requester);
    department = requester === undefined ? '' : String(requester[directory.ownerField] ?? '');
  } catch (error) {
    if (!(error instanceof SystemUnavailableError)) throw error;
  }
  const roster = await approvalRoster(deps.adapters, deps.policy, { employeeId: proposal.requester, department });
  const approval = proposal.approval;
  return {
    waitLabel: roster.waitMinutes > 0 ? waitText(roster.waitMinutes) : 'theo file luật',
    approvers: roster.approvers.map((person) => person.name),
    approvalExpiresAtLabel:
      proposal.approvalExpiresAt === null ? null : formatMoment(new Date(proposal.approvalExpiresAt), deps.now()),
    approval:
      approval === null
        ? null
        : {
            actorLabel: await personLabel(deps.adapters, approval.actor),
            decision: approval.decision,
            reason: approval.reason,
          },
  };
}

async function handleCard(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse, proposalId: string): Promise<void> {
  if (req.method !== 'GET') return sendHtml(res, 405, messagePage('Không hỗ trợ', 'Trang này chỉ để xem.', 'bad'), { allow: 'GET' });

  const active = currentSession(deps, req);
  if (active === undefined) return redirect(res, loginAddress(`/xac-nhan/${proposalId}`));

  const proposal = PROPOSAL_ID_PATTERN.test(proposalId) ? deps.proposals.get(proposalId) : undefined;
  if (proposal === undefined) return refusalPage(res, 404, null, `Không tìm thấy đề xuất ${proposalId}.`);
  if (proposal.requester !== active.session.employeeId) {
    return refusalPage(res, 403, 'NOT_PERMITTED', 'Đề xuất này của người khác nên bạn không xem được. Hãy đăng nhập đúng nhân vật đã nhờ AI soạn.');
  }

  const commands = new Map(
    deps.commands.listByProposal(proposal.proposalId).map((command) => [command.position, command]),
  );
  const items = await Promise.all(
    proposal.items.map(async (item) => ({
      position: item.position,
      recordId: itemLabel(item),
      rows: await itemRows(item, deps.adapters),
      command: commands.get(item.position),
    })),
  );
  const status = effectiveStatus(proposal, deps.now());
  const approval = await approvalView(deps, proposal);
  const deadline =
    proposal.approvalExpiresAt === null
      ? formatMoment(new Date(proposal.expiresAt), deps.now())
      : (approval.approvalExpiresAtLabel ?? formatMoment(new Date(proposal.approvalExpiresAt), deps.now()));
  sendHtml(
    res,
    200,
    cardPage({
      proposalId: proposal.proposalId,
      requesterLabel: await personLabel(deps.adapters, proposal.requester),
      items,
      expiresAtLabel: deadline,
      status,
      requiresApproval: proposal.requiresApproval,
      waitLabel: approval.waitLabel,
      approvers: approval.approvers,
      approvalExpiresAtLabel: approval.approvalExpiresAtLabel,
      approval: approval.approval,
      csrfToken: active.session.csrfToken,
    }),
  );
}

/** Why a press was not carried out: the code the trace keeps, the status and the sentence the person reads. */
const DECIDE_REFUSAL: Readonly<Record<DecideFailure, { readonly status: number; readonly code: ReasonCode | null }>> = {
  NOT_FOUND: { status: 404, code: null },
  NOT_REQUESTER: { status: 403, code: 'NOT_PERMITTED' },
  NOT_PERMITTED: { status: 403, code: 'NOT_PERMITTED' },
  POLICY_UNAVAILABLE: { status: 503, code: 'POLICY_UNAVAILABLE' },
  SELF_APPROVAL: { status: 403, code: 'SELF_APPROVAL' },
  APPROVAL_EXPIRED: { status: 410, code: 'APPROVAL_EXPIRED' },
  APPROVAL_USED: { status: 409, code: 'APPROVAL_USED' },
  CONTENT_CHANGED: { status: 409, code: 'CONTENT_CHANGED' },
};

const DECIDE_SENTENCE: Readonly<Record<DecideFailure, string>> = {
  NOT_FOUND: 'Không tìm thấy đề xuất này.',
  NOT_REQUESTER: 'Chỉ người đã nhờ AI soạn đề xuất mới bấm được. Hãy đăng nhập đúng nhân vật.',
  NOT_PERMITTED: 'Bộ luật quyền không còn cho bạn gửi đề xuất này. Hãy hỏi trưởng nhóm phòng bạn.',
  POLICY_UNAVAILABLE: 'Cổng không đọc được bộ luật quyền nên chưa gửi. Hãy báo người vận hành Lab.',
  SELF_APPROVAL: 'Bạn là người yêu cầu nên không tự duyệt được.',
  APPROVAL_EXPIRED: 'Đề xuất đã hết hạn nên không gửi được. Hãy nhờ AI soạn lại.',
  APPROVAL_USED: 'Đề xuất này đã được gửi hoặc huỷ, và mỗi đề xuất chỉ bấm được một lần.',
  CONTENT_CHANGED: 'Nội dung đề xuất không còn khớp với lúc soạn nên cổng không gửi. Hãy nhờ AI soạn lại.',
};

interface WriteCheckOk {
  readonly ok: true;
  readonly department: string;
  readonly ruleId: string;
  readonly policyVersion: number | null;
  /** The requester as the directory holds them now, reused by the recheck inside the press transaction. */
  readonly employee: RecordData;
  /** The target records read now, in item order, reused by the recheck inside the press transaction. */
  readonly records: readonly (RecordData | undefined)[];
  /** The start of the cumulative window, fixed for this press. */
  readonly since: Date;
  /** Length of that window, kept for the approval sentence in the same press. */
  readonly windowMinutes: number;
}

/** The items this person already has in flight for the actions of this proposal. */
function carriedFor(deps: GatewayDeps, proposal: Proposal, since: Date): Record<string, number> {
  const adapter = adapterOf(deps.adapters, proposal.recordType);
  return deps.proposals.countTowardBulk({
    requester: proposal.requester,
    recordType: proposal.recordType,
    actions: actionFields(proposal.changes, adapter.actions),
    since,
    includeAwaitingPress: false,
    excludeProposalId: proposal.proposalId,
  });
}

/**
 * The checks that depend on the key, the directory, the task list and the rule
 * file are done again here, right before the proposal is confirmed: any of them
 * may have changed since the draft. The cumulative count is read here for the
 * answer; the store reads it again inside the transaction that changes the
 * status, so two presses cannot both pass with the same count. Time and content
 * stay in the proposal store.
 */
async function writeChecks(
  deps: GatewayDeps,
  proposal: Proposal,
  key: KeyRecord,
): Promise<WriteCheckOk | { ok: false; check: WriteRefusal }> {
  const directory = adapterOf(deps.adapters, 'employee');
  const records = adapterOf(deps.adapters, proposal.recordType);
  let employee: RecordData | undefined;
  let current: (RecordData | undefined)[];
  try {
    employee = await directory.get(proposal.requester);
    current = await Promise.all(
      proposal.items.map(async (item) => (item.kind === 'create' ? undefined : records.get(item.recordId))),
    );
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
        sentence: 'Cổng không nối được với danh bạ hoặc hệ thống nguồn nên chưa ghi. Hãy thử lại sau, hoặc báo người vận hành Lab.',
      },
    };
  }

  const windowMinutes = deps.policy.cumulativeWindow().minutes;
  const since = new Date(deps.now().getTime() - windowMinutes * 60_000);
  const check = checkWrite({
    proposal,
    key,
    employee,
    adapter: records,
    records: current,
    carriedItems: carriedFor(deps, proposal, since),
    policy: deps.policy,
  });
  if (!check.ok) return { ok: false, check };
  // `checkWrite` already refuses a missing employee; this keeps the value narrowed for the caller.
  if (employee === undefined) {
    return {
      ok: false,
      check: {
        ok: false,
        code: 'KEY_INVALID',
        status: 401,
        ruleId: 'WRITE.NOT_IN_DIRECTORY',
        policyVersion: check.policyVersion,
        sentence: 'Người của khoá này không còn trong danh bạ nên cổng không ghi. Hãy hỏi người đã cấp khoá cho bạn.',
      },
    };
  }
  return {
    ok: true,
    department: String(employee[directory.ownerField] ?? ''),
    ruleId: check.ruleId,
    policyVersion: check.policyVersion,
    employee,
    records: current,
    since,
    windowMinutes,
  };
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
      caller: callerOfProposal(deps, proposalId),
      taskId: traceObjectId(proposal),
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

  // A page password revoked after the login ends the session at the next press.
  const session = verifySessionPassword(deps, active);
  if (!session.ok) return refused(401, session.code, session.ruleId, session.sentence);

  // Pressing Gửi checks both credentials, the person, the rule file and the task again; only then does the proposal move.
  if (decision === 'confirm') {
    const proposal = PROPOSAL_ID_PATTERN.test(proposalId) ? deps.proposals.get(proposalId) : undefined;
    // Only a proposal still waiting for the press needs the second check; an expired or used one is answered by the store.
    if (proposal !== undefined && effectiveStatus(proposal, deps.now()) === 'awaiting_confirmation') {
      if (proposal.draftedByKeyId === null) {
        traceStep(deps, started, {
          tool,
          requester,
          caller: proposal.caller,
          taskId: traceObjectId(proposal),
          proposalId: proposal.proposalId,
          outcome: 'refused',
          reasonCode: 'KEY_INVALID',
          ruleId: 'WEB.DRAFT_KEY_MISSING',
        });
        return refusalPage(
          res,
          401,
          'KEY_INVALID',
          'Đề xuất này được soạn trước khi cổng lưu khoá đã soạn nên cổng không kiểm được khoá và không ghi. Hãy nhờ AI soạn lại.',
        );
      }
      const draftedKey = deps.keys.findById(proposal.draftedByKeyId);
      if (draftedKey === undefined) {
        traceStep(deps, started, {
          tool,
          requester,
          caller: proposal.caller,
          taskId: traceObjectId(proposal),
          proposalId: proposal.proposalId,
          outcome: 'refused',
          reasonCode: 'KEY_INVALID',
          ruleId: 'WEB.DRAFT_KEY_INVALID',
        });
        return refusalPage(
          res,
          401,
          'KEY_INVALID',
          'Khoá đã soạn đề xuất không còn trong danh sách cấp khoá nên cổng không ghi. Hãy nhờ AI soạn lại bằng một khoá còn hiệu lực.',
        );
      }

      const checked = await writeChecks(deps, proposal, draftedKey);
      if (!checked.ok) {
        const { status, code, ruleId, policyVersion, sentence } = checked.check;
        traceStep(deps, started, {
          tool,
          requester,
          caller: draftedKey.caller,
          taskId: traceObjectId(proposal),
          proposalId: proposal.proposalId,
          outcome: 'refused',
          reasonCode: code,
          ruleId,
          policyVersion,
        });
        return refusalPage(res, status, code, sentence);
      }

      // The rule is asked again inside the store transaction, with the items
      // already counted in the window, so two presses cannot both pass under
      // the threshold. A press that now needs a lead waits instead of failing
      // (ADR-0007 section 3.4).
      let routed: ConfirmRoute | undefined;
      const sent = deps.proposals.decide(
        proposal.proposalId,
        active.session.employeeId,
        'confirm',
        (decided) => {
          traceStep(deps, started, {
            tool,
            requester: decided.requester,
            caller: draftedKey.caller,
            taskId: traceObjectId(decided),
            proposalId: decided.proposalId,
            outcome: 'ok',
            reasonCode: null,
            ruleId: routed !== undefined && routed.kind !== 'refuse' ? routed.ruleId : checked.ruleId,
            policyVersion: routed !== undefined && routed.kind !== 'refuse' ? routed.policyVersion : checked.policyVersion,
          });
          // The command exists from the same transaction as the confirmation; a press that waits for a lead creates none.
          if (decided.status === 'confirmed') deps.commands.createForProposal(decided);
        },
        (stored) => {
          const recheck = checkWrite({
            proposal: stored,
            key: draftedKey,
            employee: checked.employee,
            adapter: adapterOf(deps.adapters, stored.recordType),
            records: checked.records,
            carriedItems: carriedFor(deps, stored, checked.since),
            policy: deps.policy,
          });
          if (!recheck.ok) {
            routed = {
              kind: 'refuse',
              reason: recheck.code === 'POLICY_UNAVAILABLE' ? 'POLICY_UNAVAILABLE' : 'NOT_PERMITTED',
            };
            return routed;
          }
          if (!recheck.requiresApproval) {
            routed = { kind: 'write', ruleId: recheck.ruleId, policyVersion: recheck.policyVersion };
            return routed;
          }
          const waitMinutes = deps.policy.approversFor({ department: checked.department }, []).waitMinutes;
          if (waitMinutes <= 0) {
            routed = { kind: 'refuse', reason: 'POLICY_UNAVAILABLE' };
            return routed;
          }
          routed = {
            kind: 'wait',
            approvalExpiresAt: new Date(deps.now().getTime() + waitMinutes * 60_000),
            approvalReason: recheck.ruleId.endsWith('.cumulative')
              ? `Đề xuất có ${stored.items.length} mục, cộng với các mục cùng việc đã đếm trong ${checked.windowMinutes} phút qua nên cần trưởng nhóm duyệt trước khi ghi.`
              : recheck.ruleId.endsWith('.bulk')
                ? `Đề xuất có ${stored.items.length} mục, chạm ngưỡng duyệt hàng loạt nên cần trưởng nhóm duyệt trước khi ghi.`
                : (stored.approvalReason ?? 'Đề xuất này cần trưởng nhóm duyệt trước khi ghi.'),
            ruleId: recheck.ruleId,
            policyVersion: recheck.policyVersion,
          };
          return routed;
        },
      );
      if (!sent.ok) {
        const { status, code } = DECIDE_REFUSAL[sent.reason];
        const ruleId = routed !== undefined && routed.kind !== 'refuse' ? routed.ruleId : `WEB.${sent.reason}`;
        return refused(status, code, ruleId, DECIDE_SENTENCE[sent.reason], sent.proposal);
      }
      // A waiting proposal has no command; only a confirmed one wakes the background loop.
      if (sent.proposal.status === 'confirmed') await deps.executor.execute(sent.proposal);
      return redirect(res, `/xac-nhan/${sent.proposal.proposalId}`);
    }
  }

  const caller = callerOfProposal(deps, proposalId);
  const result = deps.proposals.decide(proposalId, active.session.employeeId, decision, (decided) => {
    traceStep(deps, started, {
      tool,
      requester: decided.requester,
      caller,
      taskId: traceObjectId(decided),
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

  // The commands already exist from the confirmation transaction; this only wakes the background loop and answers.
  if (decision === 'confirm') await deps.executor.execute(result.proposal);
  redirect(res, `/xac-nhan/${result.proposal.proposalId}`);
}

/** The caller of the key that drafted the proposal, kept on the proposal so a page step still names it. */
function callerOfProposal(deps: GatewayDeps, proposalId: string): string | null {
  if (!PROPOSAL_ID_PATTERN.test(proposalId)) return null;
  const proposal = deps.proposals.get(proposalId);
  if (proposal === undefined) return null;
  if (proposal.draftedByKeyId === null) return proposal.caller;
  return deps.keys.findById(proposal.draftedByKeyId)?.caller ?? proposal.caller;
}

/**
 * The pages of the gateway: simulated login, the confirmation card and its two
 * buttons, the lead's inbox and the approval page. Returns false for a path
 * that is not one of them. Only a button (POST) changes anything, and only
 * from a session, with its CSRF token, of the person the page is for.
 */
export async function handleWeb(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  try {
    if (path === LOGIN_PATH) {
      await handleLogin(deps, req, res);
      return true;
    }
    const match = CARD_PATH.exec(path);
    if (match !== null) {
      const proposalId = match[1] ?? '';
      const action = match[2];
      if (action === undefined) await handleCard(deps, req, res, proposalId);
      else await handleDecision(deps, req, res, proposalId, action === 'gui' ? 'confirm' : 'cancel');
      return true;
    }
    return await handleApprovalPages(deps, req, res, path);
  } catch (error) {
    if (!(error instanceof TraceUnavailableError)) throw error;
    if (!res.headersSent) sendHtml(res, 500, messagePage('Chưa thực hiện', TRACE_UNAVAILABLE, 'bad'));
    return true;
  }
}
