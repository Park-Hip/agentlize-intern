import type {
  AuthorizationContext,
  AuthorizationGrant,
  AuthorizationKind,
  AuthorizationRef,
  AuthorizationResolution,
  AuthorizationResolver,
} from './types.js';

/**
 * One place that turns an `AuthorizationRef` into a checked grant. The
 * registry is the extension point: a provider adds a resolver for its kind and
 * no other code learns about it. A kind with no resolver, or a reference this
 * door does not accept, is refused as unknown rather than falling back.
 *
 * The registry, not each resolver, enforces the two checks that must never be
 * forgotten: a revoked grant and a grant whose own deadline has passed. A
 * provider that answers `ok: true` with either still gets a refusal here.
 */
export class AuthorizationRegistry {
  private readonly resolvers = new Map<AuthorizationKind, AuthorizationResolver>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  register(resolver: AuthorizationResolver): void {
    this.resolvers.set(resolver.kind, resolver);
  }

  has(kind: AuthorizationKind): boolean {
    return this.resolvers.has(kind);
  }

  resolve(ref: AuthorizationRef | null, context: AuthorizationContext): AuthorizationResolution {
    if (ref === null) return { ok: false, reason: 'AUTHORIZATION_UNKNOWN' };
    if (!context.accept.includes(ref.kind)) return { ok: false, reason: 'AUTHORIZATION_UNKNOWN' };
    const resolver = this.resolvers.get(ref.kind);
    if (resolver === undefined) return { ok: false, reason: 'AUTHORIZATION_UNKNOWN' };

    const resolution = resolver.resolve(ref, context);
    if (!resolution.ok) return resolution;
    return this.checkGrant(resolution.grant);
  }

  /** The shared post-check a resolver cannot skip, whatever kind it serves. */
  private checkGrant(grant: AuthorizationGrant): AuthorizationResolution {
    if (grant.status === 'revoked') return { ok: false, reason: 'AUTHORIZATION_REVOKED' };
    if (grant.expiresAt !== null) {
      const expiresAt = Date.parse(grant.expiresAt);
      // A deadline that cannot be read is not a valid grant, so it is refused like an expired one.
      if (Number.isNaN(expiresAt) || expiresAt <= this.now().getTime()) {
        return { ok: false, reason: 'AUTHORIZATION_EXPIRED' };
      }
    }
    return { ok: true, grant };
  }
}
