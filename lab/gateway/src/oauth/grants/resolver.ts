import type {
  AuthorizationContext,
  AuthorizationRef,
  AuthorizationResolution,
  AuthorizationResolver,
} from '../../authorization/index.js';
import type { Caller } from '../../identity/types.js';
import type { GrantStore } from './store.js';

/** The app is a device acting for the person; the gateway records it like any other caller. */
export const OAUTH_CALLER: Caller = 'user_device';

export function hasScope(scope: string, wanted: string): boolean {
  return scope.split(/\s+/).includes(wanted);
}

/**
 * Turns an `oauth` reference into a checked grant by looking the provider grant
 * id up in `oauth_grants`. It never looks at an access token id: the reference
 * a proposal carries is the durable grant, so a short token that expired does
 * not become a revoked grant (ADR-0011 section 3.1).
 *
 * The registry still applies the revoked and expiry checks to the answer, so a
 * grant whose deadline passed is refused even if this resolver returns it.
 */
export class GrantAuthorizationResolver implements AuthorizationResolver {
  readonly kind = 'oauth' as const;

  constructor(
    private readonly grants: GrantStore,
    private readonly caller: Caller = OAUTH_CALLER,
  ) {}

  resolve(ref: AuthorizationRef, _context: AuthorizationContext): AuthorizationResolution {
    if (ref.kind !== 'oauth') return { ok: false, reason: 'AUTHORIZATION_UNKNOWN' };
    const grant = this.grants.find(ref.id);
    if (grant === undefined) return { ok: false, reason: 'AUTHORIZATION_INVALID' };
    return {
      ok: true,
      grant: {
        ref,
        employeeId: grant.employeeId,
        caller: this.caller,
        // `mcp:propose` is the OAuth scope that allows writing; anything less is read-only.
        scope: hasScope(grant.scope, 'mcp:propose') ? 'full' : 'read_only',
        expiresAt: grant.expiresAt,
        status: grant.revokedAt === null ? 'active' : 'revoked',
      },
    };
  }
}
