import { performance } from 'node:perf_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReasonCode } from '@lab/shared';
import {
  adapterOf,
  recordValue,
  recordWordOf,
  SystemUnavailableError,
  type RecordData,
  type ResourceAdapter,
} from '../adapters/index.js';
import type { GatewayDeps } from '../call.js';
import type { PersonRef } from '../policy/index.js';
import { formatMoment, itemLabel, itemRows, personLabel, traceObjectId } from '../proposals/card.js';
import {
  effectiveStatus,
  MAX_APPROVAL_REASON,
  PROPOSAL_ID_PATTERN,
  waitText,
  type Proposal,
} from '../proposals/index.js';
import { checkWrite } from '../writes/index.js';
import { readForm } from './form.js';
import { approvalInboxPage, approvalPage, messagePage, type ApprovalListItem, type CardItemView } from './html.js';
import {
  currentSession,
  loginAddress,
  redirect,
  refusalPage,
  sameOrigin,
  sendHtml,
  tokensEqual,
  traceStep,
  verifySessionPassword,
  type Step,
} from './page-util.js';

const INBOX_PATH = '/cho-duyet';
const APPROVAL_PATH = /^\/duyet\/([^/]+?)(?:\/(duyet|tu-choi))?$/;

type ApprovalAction = 'approve' | 'reject';

const STEP_TOOL: Readonly<Record<ApprovalAction, string>> = {
  approve: 'proposal_approve',
  reject: 'proposal_reject',
};

interface DirectoryView {
  readonly directory: ResourceAdapter;
  readonly people: readonly RecordData[];
  readonly refs: readonly PersonRef[];
}

/** The directory as the approval pages need it; undefined when it cannot be read. */
async function readDirectory(deps: GatewayDeps): Promise<DirectoryView | undefined> {
  const directory = adapterOf(deps.adapters, 'employee');
  try {
    const people = await directory.list({});
    const refs: PersonRef[] = [];
    for (const person of people) {
      const id = recordValue(person, directory.fields, 'id');
      const name = recordValue(person, directory.fields, 'name');
      if (id === undefined || name === undefined) continue;
      refs.push({
        id: String(id),
        name: String(name),
        role: String(person['role'] ?? ''),
        department: String(person['department'] ?? ''),
      });
    }
    return { directory, people, refs };
  } catch (error) {
    if (error instanceof SystemUnavailableError) return undefined;
    throw error;
  }
}

function mayApprove(deps: GatewayDeps, refs: readonly PersonRef[], requesterDepartment: string, employeeId: string): boolean {
  const decision = deps.policy.approversFor({ department: requesterDepartment }, refs);
  return decision.reasonCode !== 'POLICY_UNAVAILABLE' && decision.approvers.some((person) => person.id === employeeId);
}

function policyUnavailable(deps: GatewayDeps, refs: readonly PersonRef[], department: string): boolean {
  return deps.policy.approversFor({ department }, refs).reasonCode === 'POLICY_UNAVAILABLE';
}

/** How the summary says one field: its adapter label, lower case first, so a new field needs no edit here. */
function fieldPhrase(adapter: ResourceAdapter, field: string): string {
  const label = adapter.fields.find((candidate) => candidate.name === field)?.label ?? field;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** `task T-12` or `30 task`, the object the sentence is about. */
function targetOf(proposal: Proposal, adapters: readonly ResourceAdapter[]): string {
  const word = recordWordOf(adapters, proposal.recordType);
  const only = proposal.items[0];
  return proposal.items.length === 1 && only !== undefined
    ? `${word} ${itemLabel(only)}`
    : `${proposal.items.length} ${word}`;
}

/** True when every item changes exactly the same fields to the same values. */
function sameChanges(proposal: Proposal): boolean {
  const first = JSON.stringify(proposal.items[0]?.changes ?? {});
  return proposal.items.every((item) => JSON.stringify(item.changes) === first);
}

/** The new value as a person reads it; a long description is left out of the short line. */
async function valueOf(deps: GatewayDeps, field: string, value: string): Promise<string | null> {
  if (field === 'description') return null;
  if (field === 'assignee') return personLabel(deps.adapters, value);
  return value;
}

/**
 * One line that says what the proposal changes, for the lead's inbox:
 * `Đổi người phụ trách 30 task sang NV-04 Vũ Quốc Minh`, or a shorter
 * generic line when the items do not all carry the same change.
 */
async function summaryOf(deps: GatewayDeps, proposal: Proposal): Promise<string> {
  const adapter = adapterOf(deps.adapters, proposal.recordType);
  if (proposal.items.some((item) => item.kind === 'create')) {
    return `Tạo ${targetOf(proposal, deps.adapters)}`;
  }
  const fields = Object.keys(proposal.changes);
  if (fields.length === 0) return `Đổi ${targetOf(proposal, deps.adapters)}`;
  const phrases = fields.map((field) => fieldPhrase(adapter, field));
  if (!sameChanges(proposal)) {
    return `Đổi ${phrases.join(' và ')} cho ${targetOf(proposal, deps.adapters)}`;
  }

  const item = proposal.items[0];
  if (fields.length === 1) {
    const field = fields[0];
    if (field === undefined) return `Đổi ${targetOf(proposal, deps.adapters)}`;
    const value = item?.changes[field];
    const label = value === undefined ? null : await valueOf(deps, field, value);
    return label === null
      ? `Đổi ${phrases[0] ?? ''} ${targetOf(proposal, deps.adapters)}`
      : `Đổi ${phrases[0] ?? ''} ${targetOf(proposal, deps.adapters)} sang ${label}`;
  }

  const details: string[] = [];
  for (const field of fields) {
    const value = item?.changes[field];
    const label = value === undefined ? null : await valueOf(deps, field, value);
    const phrase = fieldPhrase(adapter, field);
    details.push(label === null ? phrase : `${phrase} sang ${label}`);
  }
  return `Đổi ${phrases.join(' và ')} của ${targetOf(proposal, deps.adapters)} (${details.join(', ')})`;
}

function deadlineOf(proposal: Proposal, now: Date): string {
  return proposal.approvalExpiresAt === null ? 'chưa bắt đầu' : formatMoment(new Date(proposal.approvalExpiresAt), now);
}

function callerOf(deps: GatewayDeps, proposal: Proposal): string {
  if (proposal.draftedByKeyId === null) return proposal.caller;
  return deps.keys.findById(proposal.draftedByKeyId)?.caller ?? proposal.caller;
}

async function itemsOf(deps: GatewayDeps, proposal: Proposal): Promise<CardItemView[]> {
  const commands = new Map(
    deps.commands.listByProposal(proposal.proposalId).map((command) => [command.position, command]),
  );
  return Promise.all(
    proposal.items.map(async (item) => ({
      position: item.position,
      recordId: itemLabel(item),
      rows: await itemRows(item, deps.adapters),
      command: commands.get(item.position),
    })),
  );
}

async function viewerLabel(deps: GatewayDeps, employeeId: string): Promise<string> {
  return personLabel(deps.adapters, employeeId);
}

/** The lead's inbox (ADR-0008 section 3.2): read only, and only the proposals this person may answer. */
async function handleInbox(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    return sendHtml(res, 405, messagePage('Không hỗ trợ', 'Hộp chờ duyệt chỉ để xem.', 'bad'), { allow: 'GET' });
  }
  const active = currentSession(deps, req);
  if (active === undefined) return redirect(res, loginAddress(INBOX_PATH));

  const directoryView = await readDirectory(deps);
  if (directoryView === undefined) {
    return refusalPage(
      res,
      502,
      'GATEWAY_UNAVAILABLE',
      'Cổng không đọc được danh bạ nên chưa mở được hộp chờ duyệt. Hãy thử lại sau, hoặc báo người vận hành Lab.',
    );
  }
  const viewer = directoryView.refs.find((person) => person.id === active.session.employeeId);
  if (viewer === undefined) {
    return refusalPage(res, 403, 'NOT_PERMITTED', 'Người của phiên không còn trong danh bạ nên không mở được hộp chờ duyệt.');
  }
  if (policyUnavailable(deps, directoryView.refs, viewer.department)) {
    return refusalPage(res, 503, 'POLICY_UNAVAILABLE', 'Cổng không đọc được bộ luật quyền nên chặn hộp chờ duyệt. Hãy báo người vận hành Lab.');
  }
  if (!mayApprove(deps, directoryView.refs, viewer.department, viewer.id)) {
    return refusalPage(
      res,
      403,
      'NOT_PERMITTED',
      'Vai của bạn không nằm trong danh sách người duyệt của file luật, nên bạn không có hộp chờ duyệt.',
    );
  }

  const items: ApprovalListItem[] = [];
  for (const proposal of deps.proposals.listAwaitingApproval()) {
    if (proposal.requester === viewer.id) continue;
    const requester = directoryView.refs.find((person) => person.id === proposal.requester);
    if (requester === undefined || !mayApprove(deps, directoryView.refs, requester.department, viewer.id)) continue;
    items.push({
      proposalId: proposal.proposalId,
      requesterLabel: `${requester.id} ${requester.name}`,
      summary: await summaryOf(deps, proposal),
      expiresAtLabel: deadlineOf(proposal, deps.now()),
      expired: effectiveStatus(proposal, deps.now()) === 'expired',
    });
  }

  const waitMinutes = deps.policy.approversFor({ department: viewer.department }, directoryView.refs).waitMinutes;
  sendHtml(
    res,
    200,
    approvalInboxPage({
      viewerLabel: await viewerLabel(deps, viewer.id),
      waitLabel: waitText(waitMinutes),
      items,
    }),
  );
}

/** The lead's page for one proposal, with the two buttons when it still waits. */
async function handleApprovalPage(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse, proposalId: string): Promise<void> {
  if (req.method !== 'GET') {
    return sendHtml(res, 405, messagePage('Không hỗ trợ', 'Trang duyệt chỉ để xem.', 'bad'), { allow: 'GET' });
  }
  const active = currentSession(deps, req);
  if (active === undefined) return redirect(res, loginAddress(`/duyet/${proposalId}`));

  const proposal = PROPOSAL_ID_PATTERN.test(proposalId) ? deps.proposals.get(proposalId) : undefined;
  if (proposal === undefined) return refusalPage(res, 404, null, `Không tìm thấy đề xuất ${proposalId}.`);

  const directoryView = await readDirectory(deps);
  if (directoryView === undefined) {
    return refusalPage(
      res,
      502,
      'GATEWAY_UNAVAILABLE',
      'Cổng không đọc được danh bạ nên chưa kiểm được người duyệt. Hãy thử lại sau, hoặc báo người vận hành Lab.',
    );
  }
  const viewer = directoryView.refs.find((person) => person.id === active.session.employeeId);
  const requester = directoryView.refs.find((person) => person.id === proposal.requester);
  if (viewer === undefined || requester === undefined) {
    return refusalPage(res, 403, 'NOT_PERMITTED', 'Người của phiên hoặc người yêu cầu không còn trong danh bạ nên không mở được trang duyệt.');
  }
  if (policyUnavailable(deps, directoryView.refs, requester.department)) {
    return refusalPage(res, 503, 'POLICY_UNAVAILABLE', 'Cổng không đọc được bộ luật quyền nên chặn trang duyệt. Hãy báo người vận hành Lab.');
  }
  const self = proposal.requester === viewer.id;
  if (!self && !mayApprove(deps, directoryView.refs, requester.department, viewer.id)) {
    return refusalPage(
      res,
      403,
      'NOT_PERMITTED',
      'Bạn không thuộc vai được duyệt đề xuất này, nên không mở được trang duyệt.',
    );
  }
  if (!self && proposal.approvalExpiresAt === null) {
    return refusalPage(res, 403, 'NOT_PERMITTED', 'Đề xuất chưa được người yêu cầu bấm Gửi nên chưa vào bước duyệt.');
  }

  const approval = proposal.approval;
  const approvalView =
    approval === null
      ? null
      : {
          actorLabel: await personLabel(deps.adapters, approval.actor),
          decision: approval.decision,
          reason: approval.reason,
        };
  const waitMinutes = deps.policy.approversFor({ department: requester.department }, directoryView.refs).waitMinutes;
  sendHtml(
    res,
    200,
    approvalPage({
      proposalId: proposal.proposalId,
      requesterLabel: `${requester.id} ${requester.name}`,
      summary: await summaryOf(deps, proposal),
      reason: proposal.approvalReason ?? 'Đề xuất này cần trưởng nhóm duyệt trước khi ghi.',
      expiresAtLabel:
        proposal.approvalExpiresAt === null ? null : formatMoment(new Date(proposal.approvalExpiresAt), deps.now()),
      waitLabel: waitText(waitMinutes),
      status: effectiveStatus(proposal, deps.now()),
      self,
      items: await itemsOf(deps, proposal),
      approval: approvalView,
      csrfToken: active.session.csrfToken,
    }),
  );
}

const REFUSAL: Readonly<Record<string, { status: number; code: ReasonCode | null; sentence: string }>> = {
  NOT_FOUND: { status: 404, code: null, sentence: 'Không tìm thấy đề xuất này.' },
  NOT_PERMITTED: {
    status: 403,
    code: 'NOT_PERMITTED',
    sentence: 'Bạn không phải người duyệt của đề xuất này, hoặc bộ luật không còn cho người yêu cầu làm việc này.',
  },
  SELF_APPROVAL: {
    status: 403,
    code: 'SELF_APPROVAL',
    sentence: 'Bạn là người yêu cầu nên không tự duyệt được. Hãy nhờ một trưởng nhóm khác cùng phòng.',
  },
  APPROVAL_EXPIRED: {
    status: 410,
    code: 'APPROVAL_EXPIRED',
    sentence: 'Đề xuất đã hết hạn chờ duyệt nên không ghi được. Người yêu cầu cần nhờ AI soạn lại.',
  },
  APPROVAL_USED: {
    status: 409,
    code: 'APPROVAL_USED',
    sentence: 'Đề xuất này đã được duyệt hoặc từ chối, và mỗi đề xuất chỉ có một lời duyệt.',
  },
  CONTENT_CHANGED: {
    status: 409,
    code: 'CONTENT_CHANGED',
    sentence: 'Nội dung đề xuất không còn khớp với lúc soạn nên cổng không duyệt. Hãy nhờ người yêu cầu soạn lại.',
  },
};

/** A press of Duyệt or Từ chối: checks, one transaction, then the page. */
async function handleApprovalPress(
  deps: GatewayDeps,
  req: IncomingMessage,
  res: ServerResponse,
  proposalId: string,
  action: ApprovalAction,
): Promise<void> {
  const started = performance.now();
  const tool = STEP_TOOL[action];
  if (req.method !== 'POST') {
    return sendHtml(res, 405, messagePage('Không hỗ trợ', 'Nút này chỉ nhận POST.', 'bad'), { allow: 'POST' });
  }
  const active = currentSession(deps, req);
  const proposal = PROPOSAL_ID_PATTERN.test(proposalId) ? deps.proposals.get(proposalId) : undefined;
  const refused = (status: number, code: ReasonCode | null, ruleId: string, sentence: string): void => {
    const trace: Step = {
      tool,
      requester: active?.session.employeeId ?? null,
      caller: proposal === undefined ? null : callerOf(deps, proposal),
      taskId: traceObjectId(proposal),
      proposalId: proposal?.proposalId ?? null,
      outcome: code !== null ? 'refused' : status === 404 ? 'not_found' : 'error',
      reasonCode: code,
      ruleId,
      policyVersion: proposal?.policyVersion ?? null,
    };
    traceStep(deps, started, trace);
    refusalPage(res, status, code, sentence);
  };

  if (!sameOrigin(deps, req)) {
    return refused(403, 'NOT_PERMITTED', 'WEB.ORIGIN', 'Yêu cầu đến từ một trang khác nên bị từ chối.');
  }
  if (active === undefined) {
    return refused(401, 'NOT_PERMITTED', 'WEB.NO_SESSION', 'Bạn chưa đăng nhập hoặc phiên đã hết. Hãy đăng nhập lại rồi mở lại trang duyệt.');
  }

  const form = await readForm(req);
  const csrf = form?.get('csrf') ?? '';
  if (form === undefined || !tokensEqual(csrf, active.session.csrfToken)) {
    return refused(403, 'NOT_PERMITTED', 'WEB.CSRF', 'Thiếu hoặc sai mã chống giả mạo. Hãy mở lại trang duyệt rồi bấm lại.');
  }
  const session = verifySessionPassword(deps, active);
  if (!session.ok) return refused(401, session.code, session.ruleId, session.sentence);

  if (proposal === undefined) return refused(404, null, 'WEB.NOT_FOUND', `Không tìm thấy đề xuất ${proposalId}.`);

  const directoryView = await readDirectory(deps);
  if (directoryView === undefined) {
    return refused(
      502,
      'GATEWAY_UNAVAILABLE',
      'WEB.SYSTEM.directory',
      'Cổng không đọc được danh bạ nên chưa kiểm được người duyệt và không ghi gì. Hãy thử lại sau.',
    );
  }
  const viewer = directoryView.refs.find((person) => person.id === active.session.employeeId);
  const requester = directoryView.refs.find((person) => person.id === proposal.requester);
  if (viewer === undefined || requester === undefined) {
    return refused(403, 'NOT_PERMITTED', 'WEB.NOT_IN_DIRECTORY', 'Người của phiên hoặc người yêu cầu không còn trong danh bạ nên không duyệt được.');
  }

  const reasonText = (form.get('reason') ?? '').trim();
  if (reasonText.length > MAX_APPROVAL_REASON) {
    const what = action === 'approve' ? 'Ghi chú khi duyệt' : 'Lý do từ chối';
    return refused(400, null, 'WEB.REASON_TOO_LONG', `${what} dài quá ${MAX_APPROVAL_REASON} ký tự nên chưa lưu gì. Hãy rút ngắn rồi bấm lại.`);
  }

  // The rule file, the directory and the target records are read again; `allowed`
  // runs inside the store's transaction, so a rule edited mid-press cannot pass.
  const recordsAdapter = adapterOf(deps.adapters, proposal.recordType);
  let currentRecords: (RecordData | undefined)[] = [];
  if (action === 'approve') {
    try {
      currentRecords = await Promise.all(
        proposal.items.map(async (item) => (item.kind === 'create' ? undefined : recordsAdapter.get(item.recordId))),
      );
    } catch (error) {
      if (!(error instanceof SystemUnavailableError)) throw error;
      return refused(
        502,
        'GATEWAY_UNAVAILABLE',
        `WEB.SYSTEM.${error.system}`,
        'Cổng không đọc được bản ghi đích nên chưa duyệt và chưa ghi gì. Hãy thử lại sau.',
      );
    }
  }
  const requesterRecord = directoryView.people.find(
    (person) => String(recordValue(person, directoryView.directory.fields, 'id')) === proposal.requester,
  );
  if (requesterRecord === undefined) {
    return refused(403, 'NOT_PERMITTED', 'WEB.NOT_IN_DIRECTORY', 'Người yêu cầu không còn trong danh bạ nên không duyệt được.');
  }

  let problem: string | undefined;
  const allowed = (): boolean => {
    const decision = deps.policy.approversFor({ department: requester.department }, directoryView.refs);
    if (decision.reasonCode === 'POLICY_UNAVAILABLE') {
      problem = 'Cổng không đọc được bộ luật quyền nên không duyệt. Hãy báo người vận hành Lab.';
      return false;
    }
    if (!decision.approvers.some((person) => person.id === viewer.id)) {
      problem = 'Bạn không còn thuộc vai được duyệt đề xuất này theo file luật hiện tại.';
      return false;
    }
    if (action === 'approve') {
      const key = proposal.draftedByKeyId === null ? undefined : deps.keys.findById(proposal.draftedByKeyId);
      const check = checkWrite({
        proposal,
        key,
        employee: requesterRecord,
        adapter: recordsAdapter,
        records: currentRecords,
        policy: deps.policy,
      });
      if (!check.ok) {
        problem = check.sentence;
        return false;
      }
    }
    return true;
  };

  const record = (decided: Proposal): void => {
    traceStep(deps, started, {
      tool,
      requester: viewer.id,
      caller: callerOf(deps, proposal),
      taskId: traceObjectId(decided),
      proposalId: decided.proposalId,
      outcome: 'ok',
      reasonCode: null,
      ruleId: action === 'approve' ? 'WEB.APPROVE' : 'WEB.REJECT',
      policyVersion: decided.policyVersion,
    });
    // Only an approval writes; the commands join this transaction, so a crash cannot separate them.
    if (action === 'approve') deps.commands.createForProposal(decided);
  };

  const note = reasonText === '' ? null : reasonText;
  const result =
    action === 'approve'
      ? deps.proposals.approve(proposal.proposalId, viewer.id, note, allowed, record)
      : deps.proposals.reject(proposal.proposalId, viewer.id, note, allowed, record);

  if (!result.ok) {
    const known = REFUSAL[result.reason];
    if (known === undefined) {
      return refused(500, null, `WEB.${result.reason}`, 'Cổng không xử lý được lời duyệt. Hãy báo người vận hành Lab.');
    }
    const sentence = result.reason === 'NOT_PERMITTED' && problem !== undefined ? problem : known.sentence;
    return refused(known.status, known.code, `WEB.${result.reason}`, sentence);
  }

  // The commands exist from the approval transaction; this only wakes the background loop and answers.
  if (action === 'approve') await deps.executor.execute(result.proposal);
  redirect(res, `/duyet/${result.proposal.proposalId}`);
}

/**
 * The two pages of the approval step. Returns false for a path that is not
 * one of them. Only the two buttons (POST) change anything, and only from a
 * session, with its CSRF token, of a person the rule file names as approver.
 */
export async function handleApprovalPages(
  deps: GatewayDeps,
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): Promise<boolean> {
  if (path === INBOX_PATH) {
    await handleInbox(deps, req, res);
    return true;
  }
  const match = APPROVAL_PATH.exec(path);
  if (match === null) return false;
  const proposalId = match[1] ?? '';
  const action = match[2];
  if (action === undefined) await handleApprovalPage(deps, req, res, proposalId);
  else await handleApprovalPress(deps, req, res, proposalId, action === 'duyet' ? 'approve' : 'reject');
  return true;
}
