import { OAuthConfigError } from './runtime-config.js';

/**
 * The paths this gateway publishes (ADR-0011 section 3.2 and oauth-plan
 * section 3). The issuer sits at the hostname root, so the two discovery
 * documents live at the root and every endpoint is a fixed path below it.
 */
export const OAUTH_AUTHORIZATION_PATH = '/oauth/auth';
export const OAUTH_TOKEN_PATH = '/oauth/token';
export const OAUTH_REVOCATION_PATH = '/oauth/token/revocation';
export const OAUTH_JWKS_PATH = '/oauth/jwks';
export const OAUTH_INTERACTION_PREFIX = '/interaction/';
export const AUTH_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';
export const OPENID_METADATA_PATH = '/.well-known/openid-configuration';
export const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource/mcp';
export const MCP_RESOURCE_PATH = '/mcp';

/** The one scope set the Lab issues: reading, proposing, and the OIDC login scope. Never `offline_access`. */
export const OAUTH_SCOPE_OPENID = 'openid';
export const OAUTH_SCOPE_READ = 'mcp:read';
export const OAUTH_SCOPE_PROPOSE = 'mcp:propose';
export const OAUTH_SCOPES = [OAUTH_SCOPE_OPENID, OAUTH_SCOPE_READ, OAUTH_SCOPE_PROPOSE] as const;

export interface OAuthEndpoints {
  /** Hostname root, with no path, query or fragment. */
  readonly issuer: string;
  /** The MCP address the access token is bound to, ending in `/mcp`. */
  readonly resource: string;
  readonly resourceMetadataUrl: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly revocationEndpoint: string;
  readonly jwksUri: string;
}

/**
 * Accept the configured issuer only at the root of a host. A path or a query
 * would change every published address, and the issue requires the root, so a
 * value that names one stops the gateway instead of being trimmed silently.
 */
export function resolveOAuthIssuer(configured: string | undefined, fallback: string): string {
  const input = configured === undefined || configured.trim() === '' ? fallback : configured.trim();
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new OAuthConfigError('OAuth issuer must be an http or https address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OAuthConfigError('OAuth issuer must be an http or https address');
  }
  if (url.username !== '' || url.password !== '') {
    throw new OAuthConfigError('OAuth issuer must not carry a user name or password');
  }
  if ((url.pathname !== '' && url.pathname !== '/') || url.search !== '' || url.hash !== '') {
    throw new OAuthConfigError('OAuth issuer must sit at the root of the host, with no path, query or fragment');
  }
  return url.origin;
}

/** Every address the two discovery documents and the tool door agree on. */
export function oauthEndpoints(issuer: string): OAuthEndpoints {
  const root = resolveOAuthIssuer(issuer, issuer);
  return {
    issuer: root,
    resource: `${root}${MCP_RESOURCE_PATH}`,
    resourceMetadataUrl: `${root}${PROTECTED_RESOURCE_PATH}`,
    authorizationEndpoint: `${root}${OAUTH_AUTHORIZATION_PATH}`,
    tokenEndpoint: `${root}${OAUTH_TOKEN_PATH}`,
    revocationEndpoint: `${root}${OAUTH_REVOCATION_PATH}`,
    jwksUri: `${root}${OAUTH_JWKS_PATH}`,
  };
}

/**
 * The protected resource metadata of RFC 9728. It names one resource, one
 * issuer and the two tool scopes; a client that reads it cannot mistake the
 * gateway for anything else.
 */
export function protectedResourceMetadata(endpoints: OAuthEndpoints): Record<string, unknown> {
  return {
    resource: endpoints.resource,
    authorization_servers: [endpoints.issuer],
    scopes_supported: [OAUTH_SCOPE_READ, OAUTH_SCOPE_PROPOSE],
    bearer_methods_supported: ['header'],
    resource_name: 'Lab MCP gateway',
  };
}

/** True when a `resource` parameter names exactly the MCP address, not a similar one. */
export function namesTheMcpResource(value: string | readonly string[] | undefined, endpoints: OAuthEndpoints): boolean {
  if (typeof value === 'string') return value === endpoints.resource;
  if (Array.isArray(value)) return value.length === 1 && value[0] === endpoints.resource;
  return false;
}
