import { EMPLOYEE_ID_PATTERN } from '@lab/shared';
import { DEFAULT_DOOR, type AuthorizationContext } from '../authorization/types.js';
import { ApiKeyIdentity, readBearerKey } from '../identity/api-key-identity.js';
import { KEY_PREFIX, type KeyStore } from '../identity/key-store.js';
import type { IdentityHeaders, IdentityProvider, IdentityResult } from '../identity/types.js';
import { OAUTH_SCOPE_PROPOSE } from './discovery.js';
import { hasScope, type LabGrant } from './grants/index.js';
import type { OAuthClientRegistration } from './provider.js';

/** One opaque access token as the provider stored it, reduced to what the MCP door checks. */
export interface OAuthAccessToken {
  readonly grantId: string;
  readonly clientId: string;
  readonly accountId: string;
  readonly scope: string;
  /** The audience the token was issued for; must name this gateway's `/mcp`. */
  readonly audience: string | readonly string[];
}

/**
 * The narrow view the identity needs from the running provider. Keeping it an
 * interface lets a test drive the identity without a live authorization server.
 */
export interface OAuthTokenLookup {
  readonly resource: string;
  findToken(rawToken: string): Promise<OAuthAccessToken | undefined>;
  findGrant(grantId: string): LabGrant | undefined;
  findClient(clientId: string): OAuthClientRegistration | undefined;
}

function hasEmployeeCode(value: string): boolean {
  return EMPLOYEE_ID_PATTERN.test(value);
}

function namesResource(audience: string | readonly string[], resource: string): boolean {
  return typeof audience === 'string' ? audience === resource : audience.includes(resource);
}

/** Every scope the token carries must sit inside the grant it was issued from. */
function withinGrant(tokenScope: string, grantScope: string): boolean {
  const granted = new Set(grantScope.split(/\s+/).filter((scope) => scope !== ''));
  return tokenScope
    .split(/\s+/)
    .filter((scope) => scope !== '')
    .every((scope) => granted.has(scope));
}

const INVALID: IdentityResult = { ok: false, reason: 'KEY_INVALID' };

/**
 * Turns an opaque access token into a person by checking the token, its grant,
 * its client, its employee code, its resource and its scope, in that order
 * (issue #180). A failure is refused as an invalid key rather than retried as
 * one, so a token can never fall back to the old key path. The caller comes
 * from the client registration, never from the request.
 */
export class OAuthTokenIdentity implements IdentityProvider {
  constructor(
    private readonly lookup: () => OAuthTokenLookup | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async authenticate(headers: IdentityHeaders, context: AuthorizationContext = DEFAULT_DOOR): Promise<IdentityResult> {
    if (!context.accept.includes('oauth')) return INVALID;

    const rawToken = readBearerKey(headers);
    if (rawToken === undefined) return INVALID;

    const lookup = this.lookup();
    if (lookup === undefined) return INVALID;

    const token = await lookup.findToken(rawToken);
    if (token === undefined) return INVALID;
    if (token.grantId === '' || token.clientId === '' || !hasEmployeeCode(token.accountId)) return INVALID;

    const grant = lookup.findGrant(token.grantId);
    if (grant === undefined) return INVALID;
    if (grant.revokedAt !== null) return { ok: false, reason: 'KEY_REVOKED' };
    if (Date.parse(grant.expiresAt) <= this.now().getTime()) return INVALID;

    if (grant.clientId !== token.clientId || grant.employeeId !== token.accountId) return INVALID;

    const client = lookup.findClient(token.clientId);
    if (client === undefined) return INVALID;

    if (!namesResource(token.audience, lookup.resource)) return INVALID;
    if (!withinGrant(token.scope, grant.scope)) return INVALID;

    return {
      ok: true,
      identity: {
        employeeId: grant.employeeId,
        // The client registration names the profile; the token request cannot.
        caller: client.caller,
        scope: hasScope(grant.scope, OAUTH_SCOPE_PROPOSE) ? 'full' : 'read_only',
        authorization: { kind: 'oauth', id: grant.grantId },
        oauthScopes: token.scope.split(/\s+/).filter((scope) => scope !== ''),
      },
    };
  }
}

/**
 * The MCP door accepts a legacy `lab_` key and an OAuth token. A value that
 * starts with the key prefix is only ever a key; every other value is only
 * ever a token. Neither form is retried as the other one, so a wrong token
 * cannot become a key lookup.
 */
export function createGatewayIdentity(
  keys: KeyStore,
  lookup: () => OAuthTokenLookup | undefined,
  now: () => Date = () => new Date(),
): IdentityProvider {
  const keyIdentity = new ApiKeyIdentity(keys);
  const tokenIdentity = new OAuthTokenIdentity(lookup, now);
  return {
    authenticate(headers: IdentityHeaders, context: AuthorizationContext = DEFAULT_DOOR): Promise<IdentityResult> {
      const raw = readBearerKey(headers);
      if (raw !== undefined && !raw.startsWith(KEY_PREFIX) && context.accept.includes('oauth')) {
        return tokenIdentity.authenticate(headers, context);
      }
      return keyIdentity.authenticate(headers, context);
    },
  };
}
