import type { AuthorizationContext, AuthorizationRef } from './types.js';
import type { AuthorizationRegistry } from './registry.js';

/** The two fields of a proposal the caller question needs; kept narrow so no module has to import the whole proposal. */
export interface ProposalCallerSource {
  readonly authorization: AuthorizationRef | null;
  readonly caller: string;
}

/**
 * The one place a page asks which caller a proposal belongs to. It goes
 * through the registry, so a key and a grant answer the same way. When the
 * source no longer resolves, the caller recorded at draft time is still the
 * honest answer for a trace line.
 */
export function callerOfAuthorization(
  registry: AuthorizationRegistry,
  proposal: ProposalCallerSource,
  context: AuthorizationContext,
): string {
  const resolution = registry.resolve(proposal.authorization, context);
  return resolution.ok ? resolution.grant.caller : proposal.caller;
}
