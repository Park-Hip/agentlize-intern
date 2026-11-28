import Provider, { errors, type ClientMetadata, type Configuration, type JWK } from 'oidc-provider';
import type { GatewayDatabase } from '../database.js';
import { isCaller, type Caller } from '../identity/types.js';
import {
  OAUTH_AUTHORIZATION_PATH,
  OAUTH_JWKS_PATH,
  OAUTH_REVOCATION_PATH,
  OAUTH_SCOPES,
  OAUTH_SCOPE_PROPOSE,
  OAUTH_SCOPE_READ,
  OAUTH_TOKEN_PATH,
  OAUTH_INTERACTION_PREFIX,
  oauthEndpoints,
  resolveOAuthIssuer,
  type OAuthEndpoints,
} from './discovery.js';
import { GrantStore } from './grants/index.js';
import { loadOAuthRuntimeConfig, OAuthConfigError, type OAuthRuntimeConfig } from './runtime-config.js';
import { createOAuthAdapterFactory } from './storage/index.js';

/** The authorization code lives five minutes; the access token one hour (oauth-plan section 3). */
export const OAUTH_CODE_TTL_SECONDS = 5 * 60;
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
/** The provider grant lives four hours, like the Lab grant that keeps a proposal's source of authority. */
export const OAUTH_GRANT_TTL_SECONDS = 4 * 60 * 60;
export const OAUTH_SESSION_TTL_SECONDS = 60 * 60;
export const OAUTH_INTERACTION_TTL_SECONDS = 60 * 60;

/**
 * One pre-registered confidential client. The Lab accepts no other client:
 * `caller` is the client profile the rule file gives its data ceiling, and a
 * request can never name or change it (ADR-0010 section 3.4).
 */
export interface OAuthClientRegistration {
  readonly clientId: string;
  readonly clientName: string;
  /** Exact callback addresses; a request must match one of them character for character. */
  readonly redirectUris: readonly string[];
  /** The profile name the rule file uses for this client's data ceiling. */
  readonly caller: Caller;
  /** The scopes this client may ask for, a subset of `OAUTH_SCOPES`. */
  readonly scopes: readonly string[];
}

/**
 * The two clients the first milestone registers. Both are confidential and
 * both map to `user_device`, so they share one data ceiling and prove that two
 * independent clients reuse the same tools (SR8).
 */
export const DEFAULT_OAUTH_CLIENTS: readonly OAuthClientRegistration[] = [
  {
    clientId: 'lab-demo-a',
    clientName: 'Lab demo client A',
    redirectUris: ['https://app-a.localhost:8795/callback'],
    caller: 'user_device',
    scopes: [...OAUTH_SCOPES],
  },
  {
    clientId: 'lab-demo-b',
    clientName: 'Lab demo client B',
    redirectUris: ['https://app-b.localhost:8796/callback'],
    caller: 'user_device',
    scopes: [...OAUTH_SCOPES],
  },
];

const ALLOWED_SCOPES: ReadonlySet<string> = new Set(OAUTH_SCOPES);

function checkRedirectUri(uri: string, clientId: string): void {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new OAuthConfigError(`OAuth client ${clientId} has a redirect URI that is not an address`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OAuthConfigError(`OAuth client ${clientId} has a redirect URI that is not http or https`);
  }
  if (url.hash !== '') {
    throw new OAuthConfigError(`OAuth client ${clientId} has a redirect URI with a fragment`);
  }
}

/** Reject a registration set the gateway cannot publish honestly, before a request ever arrives. */
export function checkClientRegistrations(clients: readonly OAuthClientRegistration[]): readonly OAuthClientRegistration[] {
  if (clients.length === 0) throw new OAuthConfigError('OAuth needs at least one registered client');
  const seen = new Set<string>();
  for (const client of clients) {
    if (client.clientId.trim() === '') throw new OAuthConfigError('OAuth client id must not be empty');
    if (seen.has(client.clientId)) throw new OAuthConfigError(`OAuth client ${client.clientId} is registered twice`);
    seen.add(client.clientId);
    if (client.redirectUris.length === 0) {
      throw new OAuthConfigError(`OAuth client ${client.clientId} needs at least one redirect URI`);
    }
    for (const uri of client.redirectUris) checkRedirectUri(uri, client.clientId);
    if (!isCaller(client.caller)) {
      throw new OAuthConfigError(`OAuth client ${client.clientId} has an unknown caller profile`);
    }
    if (client.scopes.length === 0) {
      throw new OAuthConfigError(`OAuth client ${client.clientId} needs at least one scope`);
    }
    for (const scope of client.scopes) {
      if (!ALLOWED_SCOPES.has(scope)) {
        throw new OAuthConfigError(`OAuth client ${client.clientId} asks for a scope the Lab does not issue`);
      }
    }
  }
  return clients;
}

/** The client metadata `oidc-provider` validates at startup. The secret never leaves the runtime key file. */
function clientMetadata(client: OAuthClientRegistration, config: OAuthRuntimeConfig): ClientMetadata {
  const secret = config.clientSecrets[client.clientId];
  if (secret === undefined || secret === '') {
    throw new OAuthConfigError(`OAuth key file has no client secret for ${client.clientId}`);
  }
  return {
    client_id: client.clientId,
    client_name: client.clientName,
    client_secret: secret,
    redirect_uris: [...client.redirectUris],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic',
    scope: client.scopes.join(' '),
  };
}

export interface OAuthProviderOptions {
  readonly issuer: string;
  readonly db: GatewayDatabase;
  readonly config: OAuthRuntimeConfig;
  /** Defaults to the two pre-registered clients; a test or a later issue may pass its own. */
  readonly clients?: readonly OAuthClientRegistration[] | undefined;
  readonly now?: (() => Date) | undefined;
  /** Receives state refusals only, never a token or a secret. */
  readonly log?: ((line: string) => void) | undefined;
}

export interface OAuthProviderResult {
  readonly provider: Provider;
  readonly endpoints: OAuthEndpoints;
  readonly clients: readonly OAuthClientRegistration[];
  readonly grants: GrantStore;
}

/**
 * Build the one authorization server of the Lab. It keeps every protocol
 * decision inside `oidc-provider` and passes the two Lab-specific
 * requirements through configuration: a fresh grant is required for every
 * connection, and no refresh token is ever issued because no client declares
 * the refresh grant and `issueRefreshToken` is left alone (ADR-0011 2).
 */
export function createOAuthProvider(options: OAuthProviderOptions): OAuthProviderResult {
  const endpoints = oauthEndpoints(options.issuer);
  const clients = checkClientRegistrations(options.clients ?? DEFAULT_OAUTH_CLIENTS);
  const now = options.now ?? ((): Date => new Date());
  const grants = new GrantStore(options.db, now);
  const secureCookies = endpoints.issuer.startsWith('https:');

  const configuration: Configuration = {
    adapter: createOAuthAdapterFactory({
      db: options.db,
      config: options.config,
      now,
      ...(options.log === undefined ? {} : { log: options.log }),
    }),
    clients: clients.map((client) => clientMetadata(client, options.config)),
    jwks: { keys: [options.config.signingKey as JWK] },
    cookies: {
      keys: [...options.config.cookieKeys],
      long: { httpOnly: true, sameSite: 'lax', secure: secureCookies, signed: true },
      short: { httpOnly: true, sameSite: 'lax', secure: secureCookies, signed: true },
    },
    routes: {
      authorization: OAUTH_AUTHORIZATION_PATH,
      token: OAUTH_TOKEN_PATH,
      revocation: OAUTH_REVOCATION_PATH,
      jwks: OAUTH_JWKS_PATH,
    },
    responseTypes: ['code'],
    clientAuthMethods: ['client_secret_basic'],
    pkce: { required: () => true },
    scopes: [...OAUTH_SCOPES],
    ttl: {
      AccessToken: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      AuthorizationCode: OAUTH_CODE_TTL_SECONDS,
      Grant: OAUTH_GRANT_TTL_SECONDS,
      IdToken: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      Interaction: OAUTH_INTERACTION_TTL_SECONDS,
      Session: OAUTH_SESSION_TTL_SECONDS,
    },
    formats: { bitsOfOpaqueRandomness: 256 },
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: false },
      clientIdMetadataDocument: { enabled: false },
      userinfo: { enabled: false },
      introspection: { enabled: false },
      revocation: { enabled: true },
      deviceFlow: { enabled: false },
      pushedAuthorizationRequests: { enabled: false },
      ciba: { enabled: false },
      dPoP: { enabled: false },
      clientCredentials: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      resourceIndicators: {
        enabled: true,
        // The Lab never fills a missing resource: a request without one is refused at the router.
        defaultResource: () => {
          throw new errors.InvalidTarget('a resource indicator is required');
        },
        getResourceServerInfo: (_ctx, resourceIndicator) => {
          if (resourceIndicator !== endpoints.resource) {
            throw new errors.InvalidTarget('the resource indicator is not this gateway');
          }
          return {
            audience: endpoints.resource,
            scope: `${OAUTH_SCOPE_READ} ${OAUTH_SCOPE_PROPOSE}`,
            accessTokenTTL: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
          };
        },
        useGrantedResource: () => false,
      },
    },
    interactions: {
      url: (_ctx, interaction) => `${OAUTH_INTERACTION_PREFIX}${interaction.uid}`,
    },
    findAccount: (_ctx, id) => ({
      accountId: id,
      claims: () => ({ sub: id }),
    }),
  };

  return { provider: new Provider(endpoints.issuer, configuration), endpoints, clients, grants };
}

export interface LoadOAuthKeysOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly dataDir: string;
  readonly clients?: readonly OAuthClientRegistration[] | undefined;
  readonly hasStoredState?: (() => boolean) | undefined;
  readonly now?: (() => Date) | undefined;
}

/** Read or create the runtime secrets for exactly these clients. */
export function loadOAuthKeys(options: LoadOAuthKeysOptions): OAuthRuntimeConfig {
  const clients = options.clients ?? DEFAULT_OAUTH_CLIENTS;
  return loadOAuthRuntimeConfig({
    dataDir: options.dataDir,
    clientIds: clients.map((client) => client.clientId),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.hasStoredState === undefined ? {} : { hasStoredState: options.hasStoredState }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

/** Points the issuer somewhere other than the address the gateway listens on, such as a tunnel address. */
export const OAUTH_ISSUER_ENV = 'LAB_OAUTH_ISSUER';

/** The issuer of this gateway: an explicit value, then the public address, then the address it listens on. */
export function configuredIssuer(env: NodeJS.ProcessEnv, fallbackUrl: string): string {
  const explicit = env[OAUTH_ISSUER_ENV]?.trim();
  if (explicit !== undefined && explicit !== '') return resolveOAuthIssuer(explicit, fallbackUrl);
  return resolveOAuthIssuer(env['LAB_PUBLIC_BASE_URL'], fallbackUrl);
}
