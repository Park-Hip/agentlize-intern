import type { ReasonCode } from '@lab/shared';
import type { RecordData, ResourceAdapter } from '../adapters/index.js';
import type { KeyRecord } from '../identity/index.js';
import { RULE_IDS, strictestOf, type PolicyDecision, type PolicyEngine } from '../policy/index.js';
import { CHANGE_FIELDS, type Proposal } from '../proposals/index.js';

/** The checks that must pass again at the moment a person presses Gửi (ADR-0002 section 3 point 4). */
export interface WriteCheckInput {
  readonly proposal: Proposal;
  readonly key: KeyRecord | undefined;
  /** The key's person, read from the directory now, never kept from the draft. */
  readonly employee: RecordData | undefined;
  /** The adapter of the record type the proposal changes, taken from the registry. */
  readonly adapter: ResourceAdapter;
  /** The records as they are now, in item order; every department is part of the policy question. */
  readonly records: readonly (RecordData | undefined)[];
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
      readonly code: ReasonCode;
      readonly status: number;
      readonly ruleId: string;
      readonly policyVersion: number | null;
      readonly sentence: string;
    };

/** The refusal half of a check, for callers that keep it apart from the allowed answer. */
export type WriteRefusal = Extract<WriteCheck, { ok: false }>;

function denied(
  code: ReasonCode,
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
 * The permission part of the second check: the key still belongs to the same
 * person, that person is still in the directory, the target system still holds
 * every record, and the rule file still allows every field the proposal
 * changes. The rule is asked with the real item count, so a batch that reaches
 * the bulk threshold is judged as a batch at Gửi too (ADR-0007 section 3.3).
 * Time and content are checked by the proposal store in the same transaction.
 */
export function checkWrite(input: WriteCheckInput): WriteCheck {
  const { proposal, key, employee, adapter, records, policy } = input;

  if (key === undefined) {
    return denied('KEY_INVALID', 401, 'WRITE.KEY_INVALID', 'Khoá của phiên không còn trong danh sách cấp khoá nên cổng không ghi. Hãy đăng nhập lại bằng khoá hợp lệ.');
  }
  if (key.revokedAt !== null) {
    return denied('KEY_REVOKED', 401, 'WRITE.KEY_REVOKED', 'Khoá của bạn đã bị thu hồi nên cổng không ghi. Hãy xin người quản lý Lab cấp khoá mới.');
  }
  if (key.employeeId !== proposal.requester) {
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

  const missing = proposal.items.flatMap((_item, index) => (records[index] === undefined ? [index] : []));
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
      CHANGE_FIELDS.flatMap((field) => {
        if (proposal.changes[field] === undefined) return [];
        const action = adapter.changeable[field];
        return action === undefined ? [] : [action];
      }),
    ),
  ];
  const decisions: PolicyDecision[] = [];
  for (const record of records) {
    if (record === undefined) continue;
    for (const action of actions) {
      decisions.push(
        policy.decide({
          actor: { id: key.employeeId, role, department },
          action,
          object: {
            kind: adapter.type,
            department: String(record[adapter.ownerField]),
            taskCount: proposal.items.length,
          },
          context: { scope: key.scope === 'read_only' ? 'read_only' : 'read_write', caller: key.caller },
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
