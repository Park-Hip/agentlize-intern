import type {
  AuthorizationContext,
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
 */
export class AuthorizationRegistry {
  private readonly resolvers = new Map<AuthorizationKind, AuthorizationResolver>();

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
    return resolver.resolve(ref, context);
  }
}
