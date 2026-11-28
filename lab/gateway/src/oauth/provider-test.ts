import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DATA_DIR_ENV, SERVICE_KEY_ENV } from '@lab/shared';
import { StubSystems } from '../fixture.js';
import { startGateway, type RunningGateway } from '../server.js';
import { oauthEndpoints, resolveOAuthIssuer } from './discovery.js';
import type { OAuthInteractionHandler } from './interaction-types.js';
import { DEFAULT_OAUTH_CLIENTS, type OAuthClientRegistration } from './provider.js';
import { loadOAuthRuntimeConfig, OAuthConfigError } from './runtime-config.js';

const HOA = 'NV-02';
const NAM = 'NV-05';
const SERVICE_KEY = 'test-service-key-0123456789abcdef';

interface OAuthFixture {
  readonly dir: string;
  readonly gateway: RunningGateway;
  readonly systems: StubSystems;
  readonly clients: readonly OAuthClientRegistration[];
  secret(clientId: string): string;
  close(): Promise<void>;
}

interface FixtureOptions {
  readonly now?: () => Date;
  /** `null` starts the gateway with no page at all, like production today. */
  readonly interaction?: OAuthInteractionHandler | null | undefined;
}

/**
 * The fake page of issue #181: it signs in one employee and approves the
 * connection, so a test can walk the real redirects without a browser. It is
 * injected per fixture and never exists in a production gateway.
 */
export function interactionFor(employeeId: string): OAuthInteractionHandler {
  return {
    async handle(context) {
      if (context.details.prompt === 'login') {
        await context.login(employeeId);
        return;
      }
      if (context.details.prompt === 'consent') {
        await context.approve();
        return;
      }
      throw new Error(`unexpected prompt ${context.details.prompt}`);
    },
  };
}

export const AUTO_INTERACTION: OAuthInteractionHandler = interactionFor(HOA);

async function startOAuthFixture(options: FixtureOptions = {}): Promise<OAuthFixture> {
  const dir = mkdtempSync(join(tmpdir(), 'lab-oauth-gateway-'));
  const systems = new StubSystems();
  // `null` asks for no page at all; the default (no `interaction` key) would
  // register the shipped login and consent pages of issue #181.
  const oauthOptions =
    options.interaction === null
      ? { interaction: null }
      : { interaction: options.interaction ?? AUTO_INTERACTION };
  const gateway = await startGateway({
    port: 0,
    env: { ...process.env, [SERVICE_KEY_ENV]: SERVICE_KEY, [DATA_DIR_ENV]: dir },
    adapters: systems.adapters,
    ...(options.now === undefined ? {} : { now: options.now }),
    oauth: oauthOptions,
  });
  const clients = gateway.oauth.clients;
  const config = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: clients.map((client) => client.clientId) });
  return {
    dir,
    gateway,
    systems,
    clients,
    secret: (clientId) => {
      const secret = config.clientSecrets[clientId];
      assert.ok(secret !== undefined, `a secret exists for ${clientId}`);
      return secret;
    },
    async close() {
      await gateway.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
}

async function withOAuth(options: FixtureOptions, run: (f: OAuthFixture) => Promise<void>): Promise<void> {
  const f = await startOAuthFixture(options);
  try {
    await run(f);
  } finally {
    await f.close();
  }
}

/** A cookie jar just big enough for the provider's interaction and session cookies. */
class CookieJar {
  private readonly values = new Map<string, string>();

  header(): string {
    return [...this.values.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  keep(response: Response): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    for (const line of headers.getSetCookie?.() ?? []) {
      const pair = line.split(';')[0] ?? '';
      const split = pair.indexOf('=');
      if (split > 0) this.values.set(pair.slice(0, split), pair.slice(split + 1));
    }
  }
}

interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

/** A readable prefix plus run-time randomness, so no literal here looks like a token. */
function pkce(): Pkce {
  const verifier = `verifier-${randomBytes(40).toString('base64url')}`;
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function state(): string {
  return `state-${randomBytes(12).toString('base64url')}`;
}

interface AuthorizationRequest {
  readonly clientId?: string;
  readonly redirectUri?: string;
  readonly scope?: string;
  readonly resource?: string | null;
  readonly challenge?: string | null;
  readonly method?: string | null;
  readonly verifier?: string;
}

interface AuthorizationAnswer {
  readonly status: number;
  readonly code?: string | undefined;
  readonly error?: string | undefined;
  readonly body?: Record<string, unknown> | undefined;
}

/**
 * Walk the authorization redirects with a cookie jar. The interaction handler
 * answers the login and consent prompts, so the only thing under test is the
 * protocol and the router.
 */
async function authorize(f: OAuthFixture, request: AuthorizationRequest = {}): Promise<AuthorizationAnswer> {
  const oauth = f.gateway.oauth;
  const client = f.clients[0];
  assert.ok(client !== undefined);
  const verifier = request.verifier === undefined ? pkce() : { verifier: request.verifier, challenge: '' };
  const challenge = request.challenge === undefined ? verifier.challenge : request.challenge;
  const redirectUri = request.redirectUri ?? client.redirectUris[0] ?? '';
  const url = new URL(`${oauth.issuer}/oauth/auth`);
  url.searchParams.set('client_id', request.clientId ?? client.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', request.scope ?? 'openid mcp:read mcp:propose');
  url.searchParams.set('redirect_uri', redirectUri);
  if (challenge !== null) url.searchParams.set('code_challenge', challenge);
  const method = request.method === undefined ? 'S256' : request.method;
  if (method !== null) url.searchParams.set('code_challenge_method', method);
  if (request.resource !== null) url.searchParams.set('resource', request.resource ?? oauth.resource);
  url.searchParams.set('state', state());

  const jar = new CookieJar();
  let next = url;
  for (let hop = 0; hop < 12; hop += 1) {
    const response = await fetch(next, { redirect: 'manual', headers: { cookie: jar.header() } });
    jar.keep(response);
    const location = response.headers.get('location');
    if (location === null) {
      const text = await response.text();
      const type = response.headers.get('content-type') ?? '';
      const body = text !== '' && type.includes('application/json')
        ? (JSON.parse(text) as Record<string, unknown>)
        : undefined;
      return { status: response.status, body };
    }
    if (location.startsWith(redirectUri)) {
      const answered = new URL(location);
      return {
        status: response.status,
        code: answered.searchParams.get('code') ?? undefined,
        error: answered.searchParams.get('error') ?? undefined,
      };
    }
    next = new URL(location, oauth.issuer);
  }
  throw new Error('the authorization flow did not end at the callback');
}

interface TokenAnswer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

async function exchange(
  f: OAuthFixture,
  options: {
    readonly code: string;
    readonly clientId?: string;
    readonly secret?: string | null;
    readonly redirectUri?: string;
    readonly verifier: string;
    readonly resource?: string | null;
  },
): Promise<TokenAnswer> {
  const oauth = f.gateway.oauth;
  const client = f.clients[0];
  assert.ok(client !== undefined);
  const clientId = options.clientId ?? client.clientId;
  const secret = options.secret === undefined ? f.secret(clientId) : options.secret;
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code,
    redirect_uri: options.redirectUri ?? client.redirectUris[0] ?? '',
    code_verifier: options.verifier,
  });
  if (options.resource !== null) form.set('resource', options.resource ?? oauth.resource);
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (secret !== null) headers['authorization'] = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;
  const response = await fetch(`${oauth.issuer}/oauth/token`, { method: 'POST', headers, body: form.toString() });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

interface Authorized {
  readonly token: string;
  readonly scope: string;
  readonly verifier: string;
  readonly grantId: string;
}

/** One complete code exchange, with the scopes the test asks for. */
async function tokenFor(f: OAuthFixture, scope = 'openid mcp:read mcp:propose'): Promise<Authorized> {
  const before = new Set(f.gateway.oauth.grants.list().map((candidate) => candidate.grantId));
  const verifier = pkce();
  const code = await authorize(f, { scope, challenge: verifier.challenge });
  assert.ok(code.code !== undefined, `the authorization request yields a code (${JSON.stringify(code)})`);
  const answer = await exchange(f, { code: code.code, verifier: verifier.verifier });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  const token = answer.body['access_token'];
  assert.equal(typeof token, 'string');
  const grant = f.gateway.oauth.grants.list().find((candidate) => !before.has(candidate.grantId));
  assert.ok(grant !== undefined, 'consent records its own stable grant');
  return { token: token as string, scope: String(answer.body['scope']), verifier: verifier.verifier, grantId: grant.grantId };
}

async function rpc(
  f: OAuthFixture,
  token: string | undefined,
  name: string,
  args: Record<string, unknown>,
): Promise<{ status: number; headers: Headers; json: Record<string, unknown> }> {
  const response = await fetch(`${f.gateway.url}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, json: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

test('oauth discovery: both documents publish one issuer, one endpoint set and one feature set', async () => {
  await withOAuth({}, async (f) => {
    const oauth = f.gateway.oauth;
    const authServer = (await (await fetch(`${oauth.issuer}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    const openid = (await (await fetch(`${oauth.issuer}/.well-known/openid-configuration`)).json()) as Record<string, unknown>;

    assert.deepEqual(openid, authServer, 'the two discovery documents are the same document');
    assert.equal(authServer['issuer'], oauth.issuer);
    assert.equal(oauth.issuer, f.gateway.url, 'the issuer sits at the root of the address the gateway listens on');
    assert.deepEqual(authServer['grant_types_supported'], ['authorization_code']);
    assert.deepEqual(authServer['response_types_supported'], ['code']);
    assert.deepEqual(authServer['code_challenge_methods_supported'], ['S256']);
    assert.deepEqual(authServer['token_endpoint_auth_methods_supported'], ['client_secret_basic']);
    assert.deepEqual(authServer['scopes_supported'], ['openid', 'mcp:read', 'mcp:propose']);

    for (const absent of [
      'registration_endpoint',
      'userinfo_endpoint',
      'introspection_endpoint',
      'device_authorization_endpoint',
      'end_session_endpoint',
    ]) {
      assert.equal(authServer[absent], undefined, `${absent} is not advertised`);
    }
    assert.ok(!(authServer['grant_types_supported'] as string[]).includes('refresh_token'));
    assert.ok(!(authServer['scopes_supported'] as string[]).includes('offline_access'));

    assert.equal(authServer['authorization_endpoint'], `${oauth.issuer}/oauth/auth`);
    assert.equal(authServer['token_endpoint'], `${oauth.issuer}/oauth/token`);
    assert.equal(authServer['revocation_endpoint'], `${oauth.issuer}/oauth/token/revocation`);
    assert.equal(authServer['jwks_uri'], `${oauth.issuer}/oauth/jwks`);
  });
});

test('oauth discovery: the protected resource metadata names /mcp and the one issuer', async () => {
  await withOAuth({}, async (f) => {
    const oauth = f.gateway.oauth;
    const resource = (await (await fetch(oauth.resourceMetadataUrl)).json()) as Record<string, unknown>;
    assert.equal(oauth.resourceMetadataUrl, `${oauth.issuer}/.well-known/oauth-protected-resource/mcp`);
    assert.equal(resource['resource'], `${oauth.issuer}/mcp`);
    assert.deepEqual(resource['authorization_servers'], [oauth.issuer]);
    assert.deepEqual(resource['scopes_supported'], ['mcp:read', 'mcp:propose']);
    assert.deepEqual(resource['bearer_methods_supported'], ['header']);

    const authServer = (await (await fetch(`${oauth.issuer}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    assert.equal(authServer['issuer'], (resource['authorization_servers'] as string[])[0]);
  });
});

test('oauth discovery: an issuer with a path is refused instead of silently trimmed', () => {
  assert.throws(
    () => resolveOAuthIssuer('https://lab.example/tenant', 'https://ignored.example'),
    OAuthConfigError,
  );
  assert.throws(() => oauthEndpoints('https://lab.example/?tenant=1'), OAuthConfigError);
  assert.equal(resolveOAuthIssuer(undefined, 'http://127.0.0.1:8790/'), 'http://127.0.0.1:8790');
});

test('oauth flow: a code with PKCE S256 becomes an opaque access token with no refresh', async () => {
  await withOAuth({}, async (f) => {
    const verifier = pkce();
    const code = await authorize(f, { challenge: verifier.challenge });
    assert.ok(code.code !== undefined, JSON.stringify(code));
    const answer = await exchange(f, { code: code.code, verifier: verifier.verifier });

    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body['token_type'], 'Bearer');
    assert.equal(answer.body['expires_in'], 3600);
    const token = answer.body['access_token'];
    assert.equal(typeof token, 'string');
    assert.ok((token as string).length >= 32);
    assert.ok(!(token as string).startsWith('lab_'), 'a token is not an old key');
    assert.equal(answer.body['refresh_token'], undefined, 'no refresh token is issued');
    assert.ok(!String(answer.body['scope']).includes('offline_access'));
    assert.equal(f.gateway.oauth.grants.list().length, 1, 'consent records one stable Lab grant');
  });
});

test('oauth flow: mcp:read reads and mcp:read+mcp:propose proposes as the token holder', async () => {
  await withOAuth({}, async (f) => {
    const { token } = await tokenFor(f);
    const read = await rpc(f, token, 'get_task', { task_id: 'T-12' });
    assert.equal(read.status, 200);
    assert.match(JSON.stringify(read.json), /Task T-12/);

    const propose = await rpc(f, token, 'propose_task_change', {
      task_ids: ['T-12'],
      changes: { status: 'done' },
    });
    assert.equal(propose.status, 200, JSON.stringify(propose.json));
    assert.match(JSON.stringify(propose.json), /dx-[0-9a-f]{16}/);

    const lines = f.gateway.trace.list();
    assert.deepEqual(
      lines.slice(0, 2).map((line) => [line.requester, line.caller, line.entry]),
      [
        [HOA, 'user_device', 'mcp'],
        [HOA, 'user_device', 'mcp'],
      ],
      'the person comes from the grant, the caller from the client registration',
    );
  });
});

test('oauth scope: offline_access is dropped, so no refresh token can appear', async () => {
  await withOAuth({}, async (f) => {
    const verifier = pkce();
    const code = await authorize(f, {
      scope: 'openid mcp:read offline_access',
      challenge: verifier.challenge,
    });
    assert.ok(code.code !== undefined, JSON.stringify(code));
    const answer = await exchange(f, { code: code.code, verifier: verifier.verifier });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body['refresh_token'], undefined);
    assert.ok(!String(answer.body['scope']).split(/\s+/).includes('offline_access'));

    const client = f.clients[0];
    assert.ok(client !== undefined);
    const refreshed = await fetch(`${f.gateway.oauth.issuer}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${client.clientId}:${f.secret(client.clientId)}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: 'none',
        resource: f.gateway.oauth.resource,
      }).toString(),
    });
    assert.equal(refreshed.status, 400);
    const error = String(((await refreshed.json()) as Record<string, unknown>)['error']);
    assert.ok(error === 'unsupported_grant_type' || error === 'invalid_grant', error);
  });
});

test('oauth scope: a full-scope token still cannot propose outside the person rights', async () => {
  await withOAuth({ interaction: interactionFor(NAM) }, async (f) => {
    const { token } = await tokenFor(f);
    const refused = await rpc(f, token, 'propose_task_change', {
      task_ids: ['T-12'],
      changes: { assignee: 'NV-04' },
    });
    assert.equal(refused.status, 200);
    const result = refused.json['result'] as { isError?: boolean; _meta?: { reason_code?: string } } | undefined;
    assert.equal(result?.isError, true);
    assert.equal(result?._meta?.reason_code, 'NOT_PERMITTED');
    assert.equal(f.systems.writeCount('T-12'), 0, 'the token adds no right the intern did not have');
    const line = f.gateway.trace.list().find((entry) => entry.tool === 'propose_task_change');
    assert.equal(line?.requester, NAM);
    assert.equal(line?.caller, 'user_device');
  });
});

test('oauth scope: a read-only token is refused a propose tool with 403 insufficient_scope', async () => {
  await withOAuth({}, async (f) => {
    const { token } = await tokenFor(f, 'openid mcp:read');
    const refused = await rpc(f, token, 'propose_task_change', {
      task_ids: ['T-12'],
      changes: { status: 'done' },
    });
    assert.equal(refused.status, 403);
    const challenge = refused.headers.get('www-authenticate') ?? '';
    assert.match(challenge, /error="insufficient_scope"/);
    assert.match(challenge, /scope="mcp:read mcp:propose"/);
    assert.match(challenge, /resource_metadata="/);
    const error = (refused.json as { error?: { data?: { reason_code?: string } } }).error;
    assert.equal(error?.data?.reason_code, 'NOT_PERMITTED');

    const read = await rpc(f, token, 'get_task', { task_id: 'T-12' });
    assert.equal(read.status, 200, 'the same token still reads');
  });
});

test('oauth scope: a propose-only token is refused a read tool', async () => {
  await withOAuth({}, async (f) => {
    const { token } = await tokenFor(f, 'openid mcp:propose');
    const refused = await rpc(f, token, 'get_task', { task_id: 'T-12' });
    assert.equal(refused.status, 403);
    assert.match(refused.headers.get('www-authenticate') ?? '', /scope="mcp:read"/);
  });
});

test('oauth resource: a missing or wrong resource is blocked at authorize and at token', async () => {
  await withOAuth({}, async (f) => {
    const missing = await authorize(f, { resource: null });
    assert.equal(missing.status, 400);
    assert.equal(missing.body?.['error'], 'invalid_target');
    assert.equal(missing.code, undefined);

    const wrong = await authorize(f, { resource: 'https://evil.example/mcp' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body?.['error'], 'invalid_target');
    assert.equal(wrong.code, undefined);

    const verifier = pkce();
    const code = await authorize(f, { challenge: verifier.challenge });
    assert.ok(code.code !== undefined);
    const noResource = await exchange(f, { code: code.code, verifier: verifier.verifier, resource: null });
    assert.equal(noResource.status, 400);
    assert.equal(noResource.body['error'], 'invalid_target');

    const wrongResource = await exchange(f, {
      code: code.code,
      verifier: verifier.verifier,
      resource: 'https://evil.example/mcp',
    });
    assert.equal(wrongResource.status, 400);
    assert.equal(wrongResource.body['error'], 'invalid_target');
  });
});

test('oauth client: only registered clients and their exact callbacks are accepted', async () => {
  await withOAuth({}, async (f) => {
    const unknown = await authorize(f, { clientId: 'lab-not-registered' });
    assert.equal(unknown.code, undefined);
    assert.ok(unknown.status >= 400 || unknown.error !== undefined);

    const otherRedirect = await authorize(f, { redirectUri: 'https://app-c.localhost:8797/callback' });
    assert.equal(otherRedirect.code, undefined);
    assert.ok(otherRedirect.status >= 400 || otherRedirect.error !== undefined);

    const verifier = pkce();
    const code = await authorize(f, { challenge: verifier.challenge });
    assert.ok(code.code !== undefined);

    const wrongSecret = await exchange(f, { code: code.code, verifier: verifier.verifier, secret: 'not-the-secret' });
    assert.equal(wrongSecret.status, 401);
    assert.equal(wrongSecret.body['error'], 'invalid_client');

    const second = f.clients[1];
    assert.ok(second !== undefined);
    const otherClient = await exchange(f, {
      code: code.code,
      verifier: verifier.verifier,
      clientId: second.clientId,
      secret: f.secret(second.clientId),
    });
    // Another registered client cannot spend a code issued to the first one.
    assert.ok(otherClient.status === 400 || otherClient.status === 401, JSON.stringify(otherClient.body));
    assert.ok(
      otherClient.body['error'] === 'invalid_grant' || otherClient.body['error'] === 'invalid_client',
      JSON.stringify(otherClient.body),
    );

    const changedCallback = await exchange(f, {
      code: code.code,
      verifier: verifier.verifier,
      redirectUri: second.redirectUris[0] ?? '',
    });
    assert.equal(changedCallback.status, 400);
    assert.equal(changedCallback.body['error'], 'invalid_grant');

    // The second registered client owns its own flow and its own grant.
    const secondVerifier = pkce();
    const secondRedirect = second.redirectUris[0] ?? '';
    const secondCode = await authorize(f, {
      clientId: second.clientId,
      redirectUri: secondRedirect,
      challenge: secondVerifier.challenge,
    });
    assert.ok(secondCode.code !== undefined, JSON.stringify(secondCode));
    const secondToken = await exchange(f, {
      code: secondCode.code,
      verifier: secondVerifier.verifier,
      clientId: second.clientId,
      redirectUri: secondRedirect,
    });
    assert.equal(secondToken.status, 200, JSON.stringify(secondToken.body));
    assert.equal(f.gateway.oauth.grants.list().length, 2, 'each client gets its own grant');
  });
});

test('oauth pkce: a missing challenge, a plain challenge or a wrong verifier is refused', async () => {
  await withOAuth({}, async (f) => {
    const noChallenge = await authorize(f, { challenge: null });
    assert.equal(noChallenge.code, undefined);

    const plain = await authorize(f, { method: 'plain' });
    assert.equal(plain.code, undefined);

    const verifier = pkce();
    const code = await authorize(f, { challenge: verifier.challenge });
    assert.ok(code.code !== undefined);
    const wrongVerifier = await exchange(f, {
      code: code.code,
      verifier: pkce().verifier,
    });
    assert.equal(wrongVerifier.status, 400);
    assert.equal(wrongVerifier.body['error'], 'invalid_grant');

    const missingVerifier = await exchange(f, { code: code.code, verifier: '' });
    assert.equal(missingVerifier.status, 400);
    assert.equal(missingVerifier.body['error'], 'invalid_grant');
  });
});

test('oauth time: an expired token and an expired code are refused by the fake clock', async () => {
  let clock = new Date('2026-11-28T10:00:00.000Z');
  await withOAuth({ now: () => clock }, async (f) => {
    const { token } = await tokenFor(f);
    assert.equal((await rpc(f, token, 'get_task', { task_id: 'T-12' })).status, 200);

    const grant = f.gateway.oauth.grants.list()[0];
    assert.ok(grant !== undefined);

    // The access token's hour passes; the grant's four hours do not.
    clock = new Date(clock.getTime() + 3601_000);
    const expired = await rpc(f, token, 'get_task', { task_id: 'T-12' });
    assert.equal(expired.status, 401);
    assert.match(expired.headers.get('www-authenticate') ?? '', /^Bearer /);
    assert.equal(f.gateway.oauth.grants.find(grant.grantId)?.revokedAt, null, 'the grant is not revoked');
    assert.equal(f.gateway.authorization.resolve({ kind: 'oauth', id: grant.grantId }, { resource: 'pages', door: 'web', accept: ['oauth'] }).ok, true);

    // A fresh connection works; its code then outlives its five minutes.
    const verifier = pkce();
    const code = await authorize(f, { challenge: verifier.challenge });
    assert.ok(code.code !== undefined);
    clock = new Date(clock.getTime() + 301_000);
    const late = await exchange(f, { code: code.code, verifier: verifier.verifier });
    assert.equal(late.status, 400);
    assert.equal(late.body['error'], 'invalid_grant');
  });
});

test('oauth revocation: a revoked token stops at once, and a revoked grant stops every token of it', async () => {
  await withOAuth({}, async (f) => {
    const first = await tokenFor(f);
    const second = await tokenFor(f);
    assert.equal(f.gateway.oauth.grants.list().length, 2, 'two connections make two grants');

    const client = f.clients[0];
    assert.ok(client !== undefined);
    const revoked = await fetch(`${f.gateway.oauth.issuer}/oauth/token/revocation`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${client.clientId}:${f.secret(client.clientId)}`).toString('base64')}`,
      },
      body: new URLSearchParams({ token: first.token }).toString(),
    });
    assert.equal(revoked.status, 200);
    assert.equal((await rpc(f, first.token, 'get_task', { task_id: 'T-12' })).status, 401);
    assert.equal((await rpc(f, second.token, 'get_task', { task_id: 'T-12' })).status, 200, 'the other grant is untouched');

    assert.equal(f.gateway.oauth.grants.revoke(second.grantId), true);
    assert.equal((await rpc(f, second.token, 'get_task', { task_id: 'T-12' })).status, 401);
  });
});

test('oauth doors: a token is refused at /v1/tools and /v1/usage, while lab_ keys keep working', async () => {
  await withOAuth({}, async (f) => {
    const { token } = await tokenFor(f);
    const tool = await fetch(`${f.gateway.url}/v1/tools/get_task`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ task_id: 'T-12' }),
    });
    assert.equal(tool.status, 401);
    assert.match(await tool.text(), /\[KEY_INVALID\]/);

    const usage = await fetch(`${f.gateway.url}/v1/usage`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ turn_id: 'turn-probe', model: 'lab-model', input_tokens: 1, output_tokens: 1, cost_usd: 0 }),
    });
    assert.equal(usage.status, 401);

    const key = f.gateway.keys.issue({ employeeId: HOA, caller: 'test' }).rawKey;
    const viaKey = await fetch(`${f.gateway.url}/v1/tools/get_task`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ task_id: 'T-12' }),
    });
    assert.equal(viaKey.status, 200, 'the legacy key path is unchanged');
    assert.equal((await rpc(f, key, 'get_task', { task_id: 'T-12' })).status, 200);

    // A value that looks like an old key is never retried as an OAuth token.
    const fakeKey = `lab_${randomBytes(8).toString('base64url')}`;
    const refused = await rpc(f, fakeKey, 'get_task', { task_id: 'T-12' });
    assert.equal(refused.status, 401);
  });
});

test('oauth 401: a missing or wrong token points at the protected resource metadata', async () => {
  await withOAuth({}, async (f) => {
    for (const token of [undefined, `wrong-${randomBytes(12).toString('base64url')}`]) {
      const refused = await rpc(f, token, 'get_task', { task_id: 'T-12' });
      assert.equal(refused.status, 401);
      const challenge = refused.headers.get('www-authenticate') ?? '';
      assert.match(challenge, /^Bearer /);
      assert.ok(challenge.includes(`resource_metadata="${f.gateway.oauth.resourceMetadataUrl}"`));
      assert.equal((refused.json as { error?: { data?: { reason_code?: string } } }).error?.data?.reason_code, 'KEY_INVALID');
    }
    const metadata = await fetch(f.gateway.oauth.resourceMetadataUrl);
    assert.equal(metadata.status, 200);
  });
});

test('oauth interaction: a gateway with no page refuses the interaction and never opens dev views', async () => {
  await withOAuth({ interaction: null }, async (f) => {
    const refused = await fetch(`${f.gateway.url}/interaction/any-uid`, { redirect: 'manual' });
    assert.equal(refused.status, 503);
    assert.equal(((await refused.json()) as Record<string, unknown>)['error'], 'interaction_unavailable');

    const request = await authorize(f, {});
    assert.equal(request.code, undefined, 'no code is issued without a page');
    assert.equal(f.gateway.oauth.grants.list().length, 0);
  });
});

test('oauth clients: the default registrations are the two confidential clients with one ceiling', () => {
  assert.equal(DEFAULT_OAUTH_CLIENTS.length, 2);
  const [first, second] = DEFAULT_OAUTH_CLIENTS;
  assert.ok(first !== undefined && second !== undefined);
  for (const client of DEFAULT_OAUTH_CLIENTS) {
    assert.equal(client.caller, 'user_device');
    assert.deepEqual(client.scopes, ['openid', 'mcp:read', 'mcp:propose']);
    assert.ok(client.redirectUris.every((uri) => uri.startsWith('https://')));
  }
  assert.notEqual(first.clientId, second.clientId);
  assert.notDeepEqual(first.redirectUris, second.redirectUris);
});
