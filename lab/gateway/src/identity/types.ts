import type { AuthorizationContext, AuthorizationRef } from '../authorization/types.js';

/**
 * The operator console's caller name (ADR-0006 section 3.3). Its keys live only
 * in the console's memory: issued at startup, revoked when it exits, and swept
 * at the next start if a crash left some active.
 */
export const CONSOLE_CALLER = 'lab-console';

/** Where a call comes from. The key is bound to one of these when issued. */
export const CALLERS = [
  'tho-than-desktop',
  'tho-than-web',
  'fc-assistant',
  CONSOLE_CALLER,
  'test',
  'user_device',
] as const;
export type Caller = (typeof CALLERS)[number];

/** What the key owner declared up front. `read_only` keys never write. */
export const SCOPES = ['full', 'read_only'] as const;
export type Scope = (typeof SCOPES)[number];

export type IdentityFailure = 'KEY_INVALID' | 'KEY_REVOKED';

/**
 * Who is asking. Only the employee code comes from the module; role and
 * department are read from the directory by the gateway on every call, so a
 * role change takes effect without touching any key.
 */
export interface Identity {
  readonly employeeId: string;
  readonly caller: Caller;
  readonly scope: Scope;
  /**
   * The durable source that proved this call: the presented key today, a Lab
   * grant once OAuth exists. A proposal keeps this reference, so an expired
   * access token does not become a revoked grant later.
   */
  readonly authorization: AuthorizationRef;
  /**
   * The exact scopes an OAuth access token carried. Absent for a legacy key;
   * the `/mcp` door reads it to answer `insufficient_scope` for a tool the
   * token was not granted.
   */
  readonly oauthScopes?: readonly string[];
}

export type IdentityResult =
  | { readonly ok: true; readonly identity: Identity }
  | { readonly ok: false; readonly reason: IdentityFailure };

/** The request headers a provider may read. Node's `IncomingHttpHeaders` fits. */
export type IdentityHeaders = Readonly<Record<string, string | string[] | undefined>>;

/**
 * The replaceable seam. The first implementation reads a Bearer key
 * (`ApiKeyIdentity`); a later one reads a Lab OAuth token instead.
 * A door passes its context explicitly, so a provider knows which resource and
 * which authentication forms the door accepts instead of guessing.
 * It is async so an implementation can call out without changing callers.
 */
export interface IdentityProvider {
  authenticate(headers: IdentityHeaders, context?: AuthorizationContext): Promise<IdentityResult>;
}

export function isCaller(value: string): value is Caller {
  return (CALLERS as readonly string[]).includes(value);
}

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}
