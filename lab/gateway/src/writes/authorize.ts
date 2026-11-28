import { authorizationRefusal, type AuthorizationResolution } from '../authorization/index.js';
import { actionOfField, type RecordData, type ResourceAdapter } from '../adapters/index.js';
import { RULE_IDS, strictestOf, type PolicyDecision, type PolicyEngine } from '../policy/index.js';
import type { Proposal } from '../proposals/index.js';

/** The checks that must pass again at the moment a person presses Gửi (ADR-0002 section 3 point 4). */
export interface WriteCheckInput {
  readonly proposal: Proposal;
  /**
   * The source of authority resolved once, not a raw key: the same answer the
   * draft, the Gửi page, the approval page and the outbox use.
   */
  readonly authorization: AuthorizationResolution;
  /** The requester as the directory holds them now, never kept from the draft. */
  readonly employee: RecordData | undefined;
  /** The adapter of the record type the proposal changes, taken from the registry. */
  readonly adapter: ResourceAdapter;
  /** The records as they are now, in item order; every department is part of the policy question. */
  readonly records: readonly (RecordData | undefined)[];
  /** Items of the same action already counted in the cumulative window, by action name. */
  readonly carriedItems?: Readonly<Record<string, number>>;
  readonly policy: PolicyEngine;
}

export type WriteCheck =
  | {
      readonly ok: true;
      /** The rule file still says this request needs a lead before it is written. */
      readonly requiresApproval: boolean;
      readonly ruleId: string;
      readonly policyVersion: number | null;
    }
  | {
      readonly ok: false;
      readonly code: ReturnType<typeof authorizationRefusal>['code'];
      readonly status: number;
      readonly ruleId: string;
      readonly policyVersion: number | null;
      readonly sentence: string;
    };

/** The refusal half of a check, for callers that keep it apart from the allowed answer. */
export type WriteRefusal = Extract<WriteCheck, { ok: false }>;

function denied(
  code: WriteRefusal['code'],
  status: number,
  ruleId: string,
  sentence: string,
  policyVersion: number | null = null,
): WriteCheck {
  return { ok: false, code, status, ruleId, policyVersion, sentence };
}

/** `T-5, T-7`, in the order the proposal holds them. */
function codeList(proposal: Proposal, missing: readonly number[]): string {
  return missing.map((index) => proposal.items[index]?.recordId ?? '?').join(', ');
}

/**
 * The permission part of the second check: the source of authority still
 * stands, it still names the same person as the requester, that person is
 * still in the directory, the target system still holds every record, and the
 * rule file still allows every field the proposal changes. The rule is asked
 * with the real item count plus the items already counted in the window, so a
 * batch, or a split that reaches the bulk threshold, is judged the same way at
 * Gửi (ADR-0007 sections 3.3 and 3.4).
 * Time and content are checked by the proposal store in the same transaction.
 */
export function checkWrite(input: WriteCheckInput): WriteCheck {
  const { proposal, authorization, employee, adapter, records, carriedItems = {}, policy } = input;

  if (!authorization.ok) {
    const refusal = authorizationRefusal(authorization.reason);
    return denied(refusal.code, refusal.status, refusal.ruleId, refusal.sentence);
  }
  const grant = authorization.grant;

  if (grant.employeeId !== proposal.requester) {
    return denied('NOT_PERMITTED', 403, 'WRITE.NOT_REQUESTER', 'Đề xuất này của người khác nên bạn không gửi được. Hãy đăng nhập đúng nhân vật đã nhờ AI soạn.');
  }
  if (employee === undefined) {
    return denied('KEY_INVALID', 401, 'WRITE.NOT_IN_DIRECTORY', 'Người của khoá này không còn trong danh bạ nên cổng không ghi. Hãy hỏi người đã cấp khoá cho bạn.');
  }

  const role = employee['role'];
  const department = employee['department'];
  if (typeof role !== 'string' || typeof department !== 'string') {
    return denied('NOT_PERMITTED', 403, RULE_IDS.roleUnknown, 'Danh bạ không cho biết vai và phòng của bạn nên cổng không ghi. Hãy báo người quản lý danh bạ.');
  }

  const missing = proposal.items.flatMap((item, index) =>
    item.kind === 'update' && records[index] === undefined ? [index] : [],
  );
  if (missing.length > 0 || records.length !== proposal.items.length) {
    const codes = codeList(proposal, missing.length > 0 ? missing : proposal.items.map((_item, index) => index));
    return denied(
      'TARGET_CHANGED',
      409,
      'WRITE.RECORD_GONE',
      `Task ${codes} không còn trong danh sách task nên cổng không ghi. Hãy nhờ AI soạn lại.`,
    );
  }

  const actions = [
    ...new Set(
      Object.entries(proposal.changes).flatMap(([field]) => {
        const action = actionOfField(adapter.actions, field);
        return action === undefined ? [] : [action];
      }),
    ),
  ];
  const decisions: PolicyDecision[] = [];
  for (const [index, item] of proposal.items.entries()) {
    // A create has no record yet. The policy question is about the new record's
    // owner, which is the requester, so their department answers it.
    const recordDepartment =
      item.kind === 'create'
        ? department
        : String(records[index]?.[adapter.ownerField] ?? '');
    for (const action of actions) {
      decisions.push(
        policy.decide({
          actor: { id: grant.employeeId, role, department },
          action,
          object: {
            kind: adapter.type,
            department: recordDepartment,
            taskCount: proposal.items.length,
            carriedItems: carriedItems[action] ?? 0,
          },
          context: { scope: grant.scope === 'read_only' ? 'read_only' : 'read_write', caller: grant.caller },
        }),
      );
    }
  }
  const decision = strictestOf(decisions);
  if (decision === undefined) {
    return denied(
      'NOT_PERMITTED',
      403,
      RULE_IDS.inputInvalid,
      'Bộ luật quyền không cho vai hiện tại của bạn ghi thay đổi này nữa. Hãy hỏi trưởng nhóm phòng bạn.',
    );
  }
  if (decision.reasonCode === 'POLICY_UNAVAILABLE') {
    return denied(
      'POLICY_UNAVAILABLE',
      503,
      decision.ruleId,
      'Cổng không đọc được bộ luật quyền nên chặn mọi lệnh ghi. Hãy báo người vận hành Lab.',
      decision.policyVersion,
    );
  }
  if (decision.effect === 'deny') {
    return denied(
      'NOT_PERMITTED',
      403,
      decision.ruleId,
      'Bộ luật quyền không cho vai hiện tại của bạn ghi thay đổi này nữa. Hãy hỏi trưởng nhóm phòng bạn.',
      decision.policyVersion,
    );
  }

  // `needs_approval` is not a refusal any more: the press moves the proposal to
  // the lead's inbox, and approval writes it (ADR-0008 section 3.2).
  return {
    ok: true,
    requiresApproval: decision.effect === 'needs_approval',
    ruleId: decision.ruleId,
    policyVersion: decision.policyVersion,
  };
}
