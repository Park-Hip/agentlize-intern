/**
 * The ten refusal codes from spec section 4.4, in the order the spec lists
 * them. Tests compare codes, never sentences.
 */
export const POLICY_REASON_CODES = [
  'KEY_INVALID',
  'KEY_REVOKED',
  'NOT_PERMITTED',
  'NEEDS_APPROVAL',
  'POLICY_UNAVAILABLE',
  'TARGET_CHANGED',
  'CONTENT_CHANGED',
  'APPROVAL_EXPIRED',
  'APPROVAL_USED',
  'SELF_APPROVAL',
] as const;

/** The adapter adds this code when the gateway cannot be reached at all. */
export const GATEWAY_UNAVAILABLE = 'GATEWAY_UNAVAILABLE' as const;

/**
 * The Lab's own code for a person who already has the maximum number of
 * proposals waiting. The gateway alignment document names the limit but not a
 * code, so the Lab names its own refusal rather than borrowing one.
 */
export const PENDING_LIMIT = 'PENDING_LIMIT' as const;

export const REASON_CODES = [...POLICY_REASON_CODES, GATEWAY_UNAVAILABLE, PENDING_LIMIT] as const;

export type PolicyReasonCode = (typeof POLICY_REASON_CODES)[number];

export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * The three denial names the AgentLize gateway puts on a refusal (ADR-0010
 * section 3.5). They are a second name at the edge: the internal `reason_code`
 * keeps the precise cause.
 */
export const DENY_REASONS = ['no_permission', 'data_class_exceeds_client', 'stale_target'] as const;

export type DenyReason = (typeof DENY_REASONS)[number];

/** Fixed prefix for every refusal, so a host can recognise it without parsing. */
export const REFUSAL_PREFIX = 'CHƯA THỰC HIỆN' as const;

/**
 * Build the one-line refusal text: `CHƯA THỰC HIỆN [<MÃ>] <câu>`.
 * Whitespace is collapsed so a multi-line sentence cannot break the block a
 * host renders.
 */
export function refusalMessage(code: ReasonCode, sentence: string): string {
  const normalized = sentence.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new Error('A refusal needs one Vietnamese sentence explaining why and who to ask');
  }
  return `${REFUSAL_PREFIX} [${code}] ${normalized}`;
}
