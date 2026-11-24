import type { DenyReason, ReasonCode } from '@lab/shared';
import { DATA_CLASS_RULE_SUFFIX } from './data-classes.js';

/**
 * The one place an internal refusal becomes the gateway's name (ADR-0010
 * section 3.5). A rule id with the data-class suffix is the specific cause,
 * `TARGET_CHANGED` is a stale target, and everything else is the catch-all.
 * Engine, tool answers and both doors all call this function, so a future
 * reason cannot be named one way in one place and another way in another.
 */
export function denyReasonFor(code: ReasonCode | null, ruleId: string | null): DenyReason | null {
  if (code === null || code === 'NEEDS_APPROVAL') return null;
  if (ruleId !== null && ruleId.endsWith(DATA_CLASS_RULE_SUFFIX)) return 'data_class_exceeds_client';
  if (code === 'TARGET_CHANGED') return 'stale_target';
  return 'no_permission';
}

/**
 * The name for a successful read that withheld fields, or null when it
 * withheld none. A ceiling drop is the specific cause; a field hidden by the
 * role is the catch-all. The strings live here with the other names.
 */
export function withheldFieldsReason(droppedByClient: boolean, hidden: boolean): DenyReason | null {
  if (droppedByClient) return 'data_class_exceeds_client';
  return hidden ? 'no_permission' : null;
}
