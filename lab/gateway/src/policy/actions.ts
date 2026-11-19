import type { PolicyDecision, PolicyEffect } from './types.js';
import type { TableAction } from './schema.js';

/** How an action is said in a refusal sentence. */
export const ACTION_PHRASE: Readonly<Record<TableAction, string>> = {
  edit_task_description: 'sửa mô tả task',
  change_task_status: 'đổi trạng thái task',
  change_task_assignee_or_due: 'đổi người phụ trách hoặc hạn của task',
  bulk_change: 'đổi hàng loạt task',
  edit_other_department_task: 'sửa task của phòng khác',
  edit_directory: 'sửa danh bạ',
};

/** Higher is stricter. Mirrors the engine: "no" beats "needs approval" beats "yes". */
const STRICTNESS: Readonly<Record<PolicyEffect, number>> = { allow: 0, needs_approval: 1, deny: 2 };

/**
 * The strictest of several policy answers. A broken rule file wins over
 * everything: the gateway must stop instead of using a half-read rule set.
 */
export function strictestOf(decisions: readonly PolicyDecision[]): PolicyDecision | undefined {
  let winner: PolicyDecision | undefined;
  for (const decision of decisions) {
    if (decision.reasonCode === 'POLICY_UNAVAILABLE') return decision;
    if (winner === undefined || STRICTNESS[decision.effect] > STRICTNESS[winner.effect]) winner = decision;
  }
  return winner;
}
