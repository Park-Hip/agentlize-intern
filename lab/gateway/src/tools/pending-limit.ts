import { refusalMessage } from '@lab/shared';
import { denyReasonFor } from '../policy/index.js';
import {
  PendingLimitError,
  type NewProposal,
  type Proposal,
  type ProposalStore,
} from '../proposals/index.js';
import type { ToolResult } from './types.js';

/** The rule id a refusal at the pending cap leaves in the trace. */
export const PENDING_LIMIT_RULE_ID = 'PROPOSALS.pending_limit';

/** A refusal with its own code, so a host can tell the cap apart from a permission refusal. */
export function pendingLimitRefusal(limit: number): ToolResult {
  return {
    status: 429,
    text: refusalMessage(
      'PENDING_LIMIT',
      `Bạn đang có ${limit} đề xuất chờ xử lý, chạm giới hạn của bộ luật quyền. Hãy gửi hoặc huỷ bớt một đề xuất rồi soạn lại.`,
    ),
    reasonCode: 'PENDING_LIMIT',
    outcome: 'refused',
    ruleId: PENDING_LIMIT_RULE_ID,
    denyReason: denyReasonFor('PENDING_LIMIT', PENDING_LIMIT_RULE_ID),
  };
}

export type PendingDraft =
  | { readonly ok: true; readonly proposal: Proposal }
  | { readonly ok: false; readonly result: ToolResult };

/**
 * Draft a proposal under the rule file's pending cap. The count and the insert
 * share one transaction inside the store, so two calls that race cannot both
 * take the last free slot. Both propose tools go through here, so neither can
 * forget the cap.
 */
export function draftWithinPendingLimit(
  proposals: ProposalStore,
  input: NewProposal,
  limit: number,
): PendingDraft {
  try {
    return { ok: true, proposal: proposals.create(input, limit) };
  } catch (error) {
    if (error instanceof PendingLimitError) return { ok: false, result: pendingLimitRefusal(error.limit) };
    throw error;
  }
}
