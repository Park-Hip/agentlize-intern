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
}

/** The fields one role may receive. Empty whenever the engine is unsure. */
export interface FieldsDecision extends PolicyDecision {
  readonly fields: readonly string[];
}

/** How far a role may read one record type; null when the file declares no answer. */
export interface ReadDecision extends PolicyDecision {
  readonly scope: 'own_department' | 'any' | null;
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
