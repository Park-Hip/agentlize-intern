import type { DenyReason } from '@lab/shared';
import type { ClientClass, DataClass } from './data-classes.js';

/** What the policy engine decides. `needs_approval` stops the command until a lead approves. */
export type PolicyEffect = 'allow' | 'deny' | 'needs_approval';

/**
 * Why the engine decided so. `ALLOWED` is the only code that is not a refusal;
 * the others are the codes of spec section 4.4 that the policy can produce.
 */
export type PolicyReason = 'ALLOWED' | 'NOT_PERMITTED' | 'NEEDS_APPROVAL' | 'POLICY_UNAVAILABLE';

/** The answer to one question. Tests compare `effect`, `reasonCode` and `ruleId`, never sentences. */
export interface PolicyDecision {
  readonly effect: PolicyEffect;
  readonly reasonCode: PolicyReason;
  /** The rule that decided, for example `task.change_task_status.staff`. */
  readonly ruleId: string;
  /** Version of the rule file that was read for this decision; null when no file could be read. */
  readonly policyVersion: number | null;
  /**
   * The gateway's name for a refusal (ADR-0010 section 3.5). Null when the
   * action is allowed or waiting for approval, because neither is a denial.
   */
  readonly denyReason: DenyReason | null;
}

/**
 * The fields one role may receive under one client's ceiling. `fields` is the
 * intersection; the two dropped lists keep the reason apart so the answer can
 * name a field once, with the gate that removed it (ADR-0010 section 3.3).
 */
export interface FieldsDecision extends PolicyDecision {
  readonly fields: readonly string[];
  /** Fields the role allows but the client ceiling removes. */
  readonly droppedByClient: readonly string[];
  /** Fields the role allows but the file gives no class. */
  readonly droppedUnclassified: readonly string[];
  /** The client name from the key record, echoed for the trace and the tests. */
  readonly client: string;
  readonly clientClass: ClientClass | null;
  /** The effective ceiling; null only when no rule file could be read. */
  readonly ceiling: DataClass | null;
  /** False when the client has no profile and therefore receives the lowest class. */
  readonly clientDeclared: boolean;
}

/** How far a role may read one record type; null when the file declares no answer. */
export interface ReadDecision extends PolicyDecision {
  readonly scope: 'own_department' | 'any' | null;
}

/** How far back the bulk count looks; 0 whenever the engine cannot read the file. */
export interface WindowDecision extends PolicyDecision {
  readonly minutes: number;
}

/** How many proposals one person may leave waiting; 0 whenever the engine cannot read the file. */
export interface PendingLimitDecision extends PolicyDecision {
  readonly limit: number;
}

/** One person the directory knows, as the approval question needs them. */
export interface PersonRef {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly department: string;
}

/** The approval rules plus the people who may approve this request. */
export interface ApproversDecision extends PolicyDecision {
  readonly approverRoles: readonly string[];
  readonly sameDepartment: boolean;
  readonly waitMinutes: number;
  readonly approvers: readonly PersonRef[];
}
