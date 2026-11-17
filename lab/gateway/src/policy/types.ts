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
  /** The rule that decided. Cells of the table are `<role>.<action>`; the fixed rules are listed in `engine.ts`. */
  readonly ruleId: string;
  /** Version of the rule file that was read for this decision; null when no file could be read. */
  readonly policyVersion: number | null;
}

/** The fields one role may receive. Empty whenever the engine is unsure. */
export interface FieldsDecision extends PolicyDecision {
  readonly fields: readonly string[];
}
