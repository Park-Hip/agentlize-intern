import type { IncomingMessage, ServerResponse } from 'node:http';
import { BodyError, MAX_BODY_BYTES, sendJson } from '@lab/shared';
import type { GatewayDatabase } from '../database.js';
import type { InteractionResults, Provider } from 'oidc-provider';
import {
  AUTH_SERVER_METADATA_PATH,
  OAUTH_AUTHORIZATION_PATH,
  OAUTH_INTERACTION_PREFIX,
  OAUTH_JWKS_PATH,
  OAUTH_REVOCATION_PATH,
  OAUTH_TOKEN_PATH,
  OPENID_METADATA_PATH,
  PROTECTED_RESOURCE_PATH,
  namesTheMcpResource,
  protectedResourceMetadata,
  type OAuthEndpoints,
} from './discovery.js';
import type { GrantStore } from './grants/index.js';
import type { OAuthInteractionContext, OAuthInteractionDetails, OAuthInteractionHandler } from './interaction-types.js';
import type { OAuthAccessToken, OAuthTokenLookup } from './identity.js';
import { createOAuthProvider, type OAuthClientRegistration } from './provider.js';
import type { OAuthRuntimeConfig } from './runtime-config.js';

type FormParams = Record<string, string | string[]>;

interface BodyRequest extends IncomingMessage {
  body?: unknown;
}

/** The handler the gateway calls for one request, and the addresses it publishes. */
export interface OAuthSurface {
  readonly issuer: string;
  readonly resource: string;
  readonly resourceMetadataUrl: string;
  readonly provider: Provider;
  readonly grants: GrantStore;
  readonly clients: readonly OAuthClientRegistration[];
  readonly tokenLookup: OAuthTokenLookup;
  /** True when the request was an OAuth one and the answer is written. */
  handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean>;
}

export interface OAuthSurfaceOptions {
  readonly issuer: string;
  readonly db: GatewayDatabase;
  readonly config: OAuthRuntimeConfig;
  readonly clients?: readonly OAuthClientRegistration[] | undefined;
  /** Absent in production until the login and consent pages of issue #181 arrive. */
  readonly interaction?: OAuthInteractionHandler | undefined;
  readonly now?: (() => Date) | undefined;
  readonly log?: ((line: string) => void) | undefined;
}

function readAll(req: IncomingMessage): Promise<Buffer> {
  return (async () => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) throw new BodyError(413, 'body_too_large');
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  })();
}

/**
 * Read a form body before the provider sees it, so the router can refuse a
 * token request without the right `resource` before any code is exchanged.
 * The provider supports an upstream parser and reads `req.body` when the
 * stream is already drained.
 */
async function readForm(req: IncomingMessage): Promise<FormParams> {
  const text = (await readAll(req)).toString('utf8');
  const params: FormParams = {};
  for (const [name, value] of new URLSearchParams(text)) {
    const previous = params[name];
    if (previous === undefined) params[name] = value;
    else if (Array.isArray(previous)) previous.push(value);
    else params[name] = [previous, value];
  }
  (req as BodyRequest).body = params;
  Object.defineProperty(req, 'readable', { configurable: true, value: false });
  return params;
}

function queryParams(req: IncomingMessage): FormParams {
  const params: FormParams = {};
  for (const [name, value] of new URL(req.url ?? '/', 'http://lab.invalid').searchParams) {
    const previous = params[name];
    if (previous === undefined) params[name] = value;
    else if (Array.isArray(previous)) previous.push(value);
    else params[name] = [previous, value];
  }
  return params;
}

function invalidTarget(res: ServerResponse): void {
  sendJson(res, 400, {
    error: 'invalid_target',
    error_description: 'A request must name the /mcp resource; the gateway never guesses one.',
  });
}

function interactionKey(path: string): string | undefined {
  if (!path.startsWith(OAUTH_INTERACTION_PREFIX)) return undefined;
  const uid = path.slice(OAUTH_INTERACTION_PREFIX.length);
  return uid === '' || uid.includes('/') ? undefined : uid;
}

function stringParam(params: Readonly<Record<string, string>>, name: string): string | undefined {
  const value = params[name];
  return typeof value === 'string' ? value : undefined;
}

function detailArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : undefined;
}

function detailResourceScopes(value: unknown): Record<string, string[]> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const result: Record<string, string[]> = {};
  for (const [resource, scopes] of Object.entries(value as Record<string, unknown>)) {
    const list = detailArray(scopes);
    if (list === undefined) return undefined;
    result[resource] = list;
  }
  return result;
}

/**
 * Build the context a login or consent page receives. `approve` mirrors the
 * provider's own development submit handler: it adds the missing scopes to the
 * grant, stores it, and records the stable Lab grant that a proposal will
 * carry as its `AuthorizationRef`.
 */
function interactionContext(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  provider: Provider,
  grants: GrantStore,
  endpoints: OAuthEndpoints,
  details: Awaited<ReturnType<Provider['interactionDetails']>>,
): OAuthInteractionContext {
  const params = details.params as Record<string, string>;
  const prompt = details.prompt;
  const normalized: OAuthInteractionDetails = {
    uid: details.uid,
    prompt: prompt.name,
    promptDetails: prompt.details as Record<string, unknown>,
    params,
    clientId: stringParam(params, 'client_id') ?? '',
    accountId: details.session?.accountId ?? null,
    grantId: details.grantId ?? null,
  };

  const finish = async (
    result: Parameters<OAuthInteractionContext['finish']>[0],
    options?: { readonly mergeWithLastSubmission?: boolean },
  ): Promise<void> => {
    await provider.interactionFinished(
      req,
      res,
      result as InteractionResults,
      options === undefined ? {} : { mergeWithLastSubmission: options.mergeWithLastSubmission },
    );
  };

  const approve = async (): Promise<void> => {
    const accountId = normalized.accountId;
    if (accountId === null) throw new Error('consent needs a logged-in session');
    if (normalized.clientId === '') throw new Error('consent needs a client id');
    const existing = normalized.grantId === null ? undefined : await provider.Grant.find(normalized.grantId);
    const grant =
      existing ??
      new provider.Grant({ accountId, clientId: normalized.clientId });

    const missingScope = detailArray(normalized.promptDetails['missingOIDCScope']);
    if (missingScope !== undefined && missingScope.length > 0) grant.addOIDCScope(missingScope.join(' '));
    const missingClaims = detailArray(normalized.promptDetails['missingOIDCClaims']);
    if (missingClaims !== undefined && missingClaims.length > 0) grant.addOIDCClaims(missingClaims);
    const missingResources = detailResourceScopes(normalized.promptDetails['missingResourceScopes']);
    if (missingResources !== undefined) {
      for (const [resource, scopes] of Object.entries(missingResources)) grant.addResourceScope(resource, scopes.join(' '));
    }

    const grantId = await grant.save();
    const scope = [
      ...new Set(
        [grant.getOIDCScope(), grant.getResourceScope(endpoints.resource)]
          .flatMap((value) => value.split(/\s+/))
          .filter((value) => value !== ''),
      ),
    ].join(' ');
    if (grants.find(grantId) === undefined) {
      grants.create({ grantId, employeeId: accountId, clientId: normalized.clientId, scope });
    }
    await finish({ consent: { grantId } }, { mergeWithLastSubmission: true });
  };

  return {
    req,
    res,
    method: req.method ?? 'GET',
    path,
    details: normalized,
    finish,
    login: (accountId) => finish({ login: { accountId, remember: true } }, { mergeWithLastSubmission: false }),
    approve,
    deny: (description) =>
      finish(
        { error: 'access_denied', error_description: description ?? 'The person refused the connection' },
        { mergeWithLastSubmission: false },
      ),
  };
}

/**
 * The OAuth surface: two discovery documents, the protected resource
 * metadata, the provider's endpoints, and the interaction seam. It owns the
 * one resource check the provider does not make for a missing `resource`.
 */
export function createOAuthSurface(options: OAuthSurfaceOptions): OAuthSurface {
  const built = createOAuthProvider({
    issuer: options.issuer,
    db: options.db,
    config: options.config,
    ...(options.clients === undefined ? {} : { clients: options.clients }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.log === undefined ? {} : { log: options.log }),
  });
  const { provider, endpoints, clients, grants } = built;
  const callback = provider.callback();

  const tokenLookup: OAuthTokenLookup = {
    resource: endpoints.resource,
    async findToken(rawToken: string): Promise<OAuthAccessToken | undefined> {
      const token = await provider.AccessToken.find(rawToken);
      if (token === undefined) return undefined;
      return {
        grantId: token.grantId,
        clientId: token.clientId ?? '',
        accountId: token.accountId,
        scope: token.scope ?? '',
        audience: token.aud ?? [],
      };
    },
    findGrant: (grantId) => grants.find(grantId),
    findClient: (clientId) => clients.find((client) => client.clientId === clientId),
  };

  const handleInteraction = async (req: IncomingMessage, res: ServerResponse, path: string): Promise<void> => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET, POST' });
      return;
    }
    if (options.interaction === undefined) {
      // No page exists yet: refuse instead of enabling the provider's development views.
      sendJson(res, 503, {
        error: 'interaction_unavailable',
        error_description: 'This gateway has no login and consent page yet.',
      });
      return;
    }
    let details: Awaited<ReturnType<Provider['interactionDetails']>>;
    try {
      details = await provider.interactionDetails(req, res);
    } catch {
      sendJson(res, 400, { error: 'invalid_interaction' });
      return;
    }
    await options.interaction.handle(
      interactionContext(req, res, path, provider, grants, endpoints, details),
    );
  };

  const handle = async (req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> => {
    if (path === PROTECTED_RESOURCE_PATH) {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return true;
      }
      sendJson(res, 200, protectedResourceMetadata(endpoints));
      return true;
    }

    if (path === AUTH_SERVER_METADATA_PATH || path === OPENID_METADATA_PATH) {
      await callback(req, res);
      return true;
    }

    if (path === OAUTH_AUTHORIZATION_PATH) {
      // The library fills a missing resource instead of refusing it; the router refuses first.
      if (req.method === 'GET' && !namesTheMcpResource(queryParams(req)['resource'], endpoints)) {
        invalidTarget(res);
        return true;
      }
      await callback(req, res);
      return true;
    }
    if (path.startsWith(`${OAUTH_AUTHORIZATION_PATH}/`)) {
      // The resume step after login carries no parameters of its own.
      await callback(req, res);
      return true;
    }

    if (path === OAUTH_TOKEN_PATH) {
      if (req.method === 'POST') {
        let body: FormParams;
        try {
          body = await readForm(req);
        } catch (error) {
          if (!(error instanceof BodyError)) throw error;
          sendJson(res, error.status, { error: 'invalid_request', error_description: 'The token request body could not be read.' });
          return true;
        }
        if (!namesTheMcpResource(body['resource'], endpoints)) {
          invalidTarget(res);
          return true;
        }
      }
      await callback(req, res);
      return true;
    }

    if (path === OAUTH_REVOCATION_PATH || path === OAUTH_JWKS_PATH) {
      await callback(req, res);
      return true;
    }

    const interaction = interactionKey(path);
    if (interaction !== undefined) {
      await handleInteraction(req, res, path);
      return true;
    }

    return false;
  };

  return {
    issuer: endpoints.issuer,
    resource: endpoints.resource,
    resourceMetadataUrl: endpoints.resourceMetadataUrl,
    provider,
    grants,
    clients,
    tokenLookup,
    handle,
  };
}
