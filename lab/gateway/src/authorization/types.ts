import type { Caller, Scope } from '../identity/types.js';

/**
 * The two durable sources of authority a proposal can carry (oauth-plan
 * section 4). A `key` is the legacy per-person `lab_` key; an `oauth` grant is
 * a Lab-issued authorization that is never backed by a hidden `lab_` key.
 */
export const AUTHORIZATION_KINDS = ['key', 'oauth'] as const;
export type AuthorizationKind = (typeof AUTHORIZATION_KINDS)[number];

export function isAuthorizationKind(value: string): value is AuthorizationKind {
  return (AUTHORIZATION_KINDS as readonly string[]).includes(value);
}

/**
 * What a proposal was written with. It is a reference, not a token: a short
 * access token can expire while the grant behind it stays valid.
 */
export type AuthorizationRef =
  | { readonly kind: 'key'; readonly id: string }
  | { readonly kind: 'oauth'; readonly id: string };

export type AuthorizationFailure =
  | 'AUTHORIZATION_INVALID'
  | 'AUTHORIZATION_REVOKED'
  | 'AUTHORIZATION_EXPIRED'
  | 'AUTHORIZATION_UNKNOWN'
  /** The client behind a grant is switched off; it is refused at the same boundary as a revocation. */
  | 'AUTHORIZATION_CLIENT_DISABLED';

/** What a resolver knows after checking a reference: person, caller, scope, status and the grant's own expiry. */
export interface AuthorizationGrant {
  readonly ref: AuthorizationRef;
  readonly employeeId: string;
  readonly caller: Caller;
  readonly scope: Scope;
  /** When this grant stops standing on its own. Null means it has no expiry of its own. */
  readonly expiresAt: string | null;
  readonly status: 'active' | 'revoked';
}

export type AuthorizationResolution =
  | { readonly ok: true; readonly grant: AuthorizationGrant }
  | { readonly ok: false; readonly reason: AuthorizationFailure };

/**
 * What a door lets through. `accept` is explicit, so a door whose OAuth
 * provider is not registered refuses by default instead of falling back to a
 * key. `resource` names the address or surface the call is for.
 */
export interface AuthorizationContext {
  readonly resource: string;
  readonly door: 'http' | 'mcp' | 'web' | 'outbox' | 'usage';
  readonly accept: readonly AuthorizationKind[];
}

/**
 * The extension point. A provider registers one resolver per kind; the
 * gateway asks the registry, never a hard-coded branch. The key resolver
 * ships today; an OAuth provider registers `oauth` when it exists.
 */
export interface AuthorizationResolver {
  readonly kind: AuthorizationKind;
  resolve(ref: AuthorizationRef, context: AuthorizationContext): AuthorizationResolution;
}

export const HTTP_DOOR: AuthorizationContext = { resource: '/v1/tools', door: 'http', accept: ['key'] };
export const USAGE_DOOR: AuthorizationContext = { resource: '/v1/usage', door: 'usage', accept: ['key'] };
export const MCP_DOOR: AuthorizationContext = { resource: '/mcp', door: 'mcp', accept: ['key', 'oauth'] };
export const WEB_DOOR: AuthorizationContext = { resource: 'pages', door: 'web', accept: ['key', 'oauth'] };
export const OUTBOX_DOOR: AuthorizationContext = { resource: 'outbox', door: 'outbox', accept: ['key', 'oauth'] };

/** The context an identity provider assumes when a caller does not name one. Keys are the only shipped form. */
export const DEFAULT_DOOR: AuthorizationContext = { resource: 'default', door: 'http', accept: ['key'] };

export function sameAuthorizationRef(
  left: AuthorizationRef | null,
  right: AuthorizationRef | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.kind === right.kind && left.id === right.id;
}
