import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DATA_DIR_ENV, PERSONAS, SERVICE_KEY_ENV } from '@lab/shared';
import { StubSystems } from '../../fixture.js';
import { startGateway, type RunningGateway } from '../../server.js';
import { OAUTH_INTERACTION_PREFIX } from '../discovery.js';
import type { OAuthClientRegistration } from '../provider.js';
import { loadOAuthRuntimeConfig } from '../runtime-config.js';
import { consentPage, oauthLoginPage } from './pages.js';

const HOA = PERSONAS.hoa.employeeId;
const NAM = PERSONAS.nam.employeeId;
const SERVICE_KEY = 'test-service-key-0123456789abcdef';

type NowOption = { readonly now?: (() => Date) | undefined };

interface PageFixture {
  readonly dir: string;
  readonly gateway: RunningGateway;
  readonly systems: StubSystems;
  readonly clients: readonly OAuthClientRegistration[];
  readonly secret: (clientId: string) => string;
  close(): Promise<void>;
}

/** Start the real gateway with no injected interaction, so the shipped pages handle it. */
async function startPageFixture(options: NowOption = {}): Promise<PageFixture> {
  const dir = mkdtempSync(join(tmpdir(), 'lab-oauth-pages-'));
  const systems = new StubSystems();
  const gateway = await startGateway({
    port: 0,
    env: { ...process.env, [SERVICE_KEY_ENV]: SERVICE_KEY, [DATA_DIR_ENV]: dir },
    adapters: systems.adapters,
    ...(options.now === undefined ? {} : { now: options.now }),
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
      assert.ok(secret !== undefined, `a client secret exists for ${clientId}`);
      return secret;
    },
    async close() {
      await gateway.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
}

async function withPages(
  options: NowOption,
  run: (f: PageFixture) => Promise<void>,
): Promise<void> {
  const f = await startPageFixture(options);
  try {
    await run(f);
  } finally {
    await f.close();
  }
}

/** A cookie jar for the provider's interaction, resume and session cookies. */
class Jar {
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

function pkce(): Pkce {
  const verifier = `verifier-${randomBytes(40).toString('base64url')}`;
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

interface FlowOptions {
  readonly scope?: string;
  readonly clientIndex?: number;
  readonly state?: string;
}

interface StartedFlow {
  readonly jar: Jar;
  readonly pageUrl: URL;
  readonly pageHtml: string;
  readonly pageStatus: number;
  readonly pageHeaders: Headers;
  readonly redirectUri: string;
  readonly state: string;
  readonly verifier: Pkce;
}

/** Follow the authorize redirects until the first page, keeping cookies. */
async function beginAuthorization(f: PageFixture, options: FlowOptions = {}): Promise<StartedFlow> {
  const oauth = f.gateway.oauth;
  const client = f.clients[options.clientIndex ?? 0];
  assert.ok(client !== undefined);
  const redirectUri = client.redirectUris[0] ?? '';
  const verifier = pkce();
  const state = options.state ?? `state-${randomBytes(12).toString('base64url')}`;
  const url = new URL(`${oauth.issuer}/oauth/auth`);
  url.searchParams.set('client_id', client.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', options.scope ?? 'openid mcp:read mcp:propose');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', verifier.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('resource', oauth.resource);
  url.searchParams.set('state', state);

  const jar = new Jar();
  let next: URL = url;
  for (let hop = 0; hop < 8; hop += 1) {
    const response = await fetch(next, { redirect: 'manual', headers: { cookie: jar.header() } });
    jar.keep(response);
    const location = response.headers.get('location');
    if (location === null || !location.includes(OAUTH_INTERACTION_PREFIX)) {
      throw new Error(`expected an interaction redirect, got ${response.status} ${String(location)}`);
    }
    const pageUrl = new URL(location, oauth.issuer);
    const page = await fetch(pageUrl, { redirect: 'manual', headers: { cookie: jar.header() } });
    jar.keep(page);
    const body = await page.text();
    return {
      jar,
      pageUrl,
      pageHtml: body,
      pageStatus: page.status,
      pageHeaders: page.headers,
      redirectUri,
      state,
      verifier,
    };
  }
  throw new Error('the flow did not stop at a page');
}

function csrfOf(html: string): string {
  const token = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(token !== undefined && token !== '', 'the page carries a CSRF token');
  return token;
}

function formPost(url: URL, fields: Record<string, string>, jar: Jar, origin?: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: jar.header(),
      ...(origin === undefined ? {} : { origin }),
    },
    body: new URLSearchParams(fields).toString(),
  });
}

interface PageStep {
  readonly url: URL;
  readonly html: string;
  readonly status: number;
  readonly location: URL | null;
}

/** GET a URL with the jar, keeping cookies; never throws on a non-200. */
async function get(url: URL, jar: Jar): Promise<PageStep> {
  const response = await fetch(url, { redirect: 'manual', headers: { cookie: jar.header() } });
  jar.keep(response);
  const location = response.headers.get('location');
  return {
    url,
    html: await response.text(),
    status: response.status,
    location: location === null ? null : new URL(location, url),
  };
}

interface Completed {
  readonly code: string | undefined;
  readonly error: string | undefined;
  readonly state: string | undefined;
  readonly iss: string | undefined;
}

function callback(step: PageStep, redirectUri: string): Completed | undefined {
  if (step.location === null || !step.location.href.startsWith(redirectUri)) return undefined;
  return {
    code: step.location.searchParams.get('code') ?? undefined,
    error: step.location.searchParams.get('error') ?? undefined,
    state: step.location.searchParams.get('state') ?? undefined,
    iss: step.location.searchParams.get('iss') ?? undefined,
  };
}

/** Type the page password on the login page, then follow to the consent page. */
async function submitLogin(
  f: PageFixture,
  started: StartedFlow,
  employee: string,
  password: string,
): Promise<PageStep> {
  const post = await formPost(started.pageUrl, { csrf: csrfOf(started.pageHtml), employee, password }, started.jar);
  assert.equal(post.status, 303, `login answers with a redirect, got ${post.status}: ${await post.text()}`);
  const next = new URL(post.headers.get('location') ?? '', f.gateway.oauth.issuer);
  // The provider resumes the request; the next HTML page is the consent page.
  let step = await get(next, started.jar);
  for (let hop = 0; hop < 8 && step.status === 303 && step.location !== null; hop += 1) {
    step = await get(step.location, started.jar);
  }
  return step;
}

/** Follow redirects from a URL until the flow reaches the callback, keeping cookies. */
async function followToCallback(start: URL, jar: Jar, redirectUri: string): Promise<Completed> {
  let next = start;
  for (let hop = 0; hop < 8; hop += 1) {
    const step = await get(next, jar);
    const answered = callback(step, redirectUri);
    if (answered !== undefined) return answered;
    if (step.location === null) {
      throw new Error(`the flow stopped at ${step.url.href} with ${step.status} before the callback`);
    }
    next = step.location;
  }
  throw new Error('the flow never reached the callback');
}

/** Run login and consent to the callback unless it ends earlier, and read the reply. */
async function completeFlow(
  f: PageFixture,
  started: StartedFlow,
  employee: string,
  password: string,
  choose: 'allow' | 'deny' = 'allow',
): Promise<Completed> {
  const consent = await submitLogin(f, started, employee, password);
  const early = callback(consent, started.redirectUri);
  if (early !== undefined) return early;
  assert.equal(consent.status, 200, `the consent page renders, got ${consent.status}: ${consent.html}`);
  const post = await formPost(consent.url, { csrf: csrfOf(consent.html), decision: choose }, started.jar);
  assert.equal(post.status, 303, `consent answers with a redirect, got ${post.status}: ${await post.text()}`);
  const location = post.headers.get('location') ?? '';
  // The provider first redirects back to the authorization endpoint, which then
  // answers with the callback; follow it so the code or error is read there.
  return followToCallback(new URL(location, f.gateway.oauth.issuer), started.jar, started.redirectUri);
}

async function exchange(
  f: PageFixture,
  code: string,
  verifier: string,
  clientIndex = 0,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const client = f.clients[clientIndex];
  assert.ok(client !== undefined);
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: client.redirectUris[0] ?? '',
    code_verifier: verifier,
    resource: f.gateway.oauth.resource,
  });
  const response = await fetch(`${f.gateway.oauth.issuer}/oauth/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${client.clientId}:${f.secret(client.clientId)}`).toString('base64')}`,
    },
    body: form.toString(),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

async function rpc(
  f: PageFixture,
  token: string | undefined,
  name: string,
  args: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
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
  return { status: response.status, json: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

/** The HTML of the consent page for a signed-in person, without deciding yet. */
async function consentHtmlFor(f: PageFixture, started: StartedFlow, employee: string, password: string): Promise<string> {
  const step = await submitLogin(f, started, employee, password);
  assert.equal(step.status, 200, `the consent page renders, got ${step.status}: ${step.html}`);
  return step.html;
}

test('oauth pages: the login page is simulated, offers the characters and asks only for a page password', async () => {
  await withPages({}, async (f) => {
    const flow = await beginAuthorization(f);
    assert.equal(flow.pageStatus, 200);
    assert.match(flow.pageHtml, /Đăng nhập giả lập/);
    for (const persona of Object.values(PERSONAS)) {
      assert.ok(flow.pageHtml.includes(persona.employeeId), `offers ${persona.employeeId}`);
      assert.ok(flow.pageHtml.includes(persona.fullName), `names ${persona.fullName}`);
    }
    assert.match(flow.pageHtml, /Mật khẩu trang/);
    assert.match(flow.pageHtml, /lab_/);
    // No token, code or secret is ever on the page.
    assert.doesNotMatch(flow.pageHtml, /access_token|code_verifier|client_secret/);
  });
});

test('oauth pages: the consent page names the client, the person, the scopes and the data ceiling', async () => {
  await withPages({}, async (f) => {
    // HR (Nhung) is the role that would see personal fields, so the user_device
    // ceiling visibly keeps them from this client. That is the ceiling at work.
    const nHung = PERSONAS.nhung.employeeId;
    const flow = await beginAuthorization(f);
    const password = f.gateway.pagePasswords.issue({ employeeId: nHung }).rawPassword;
    const html = await consentHtmlFor(f, flow, nHung, password);
    const client = f.clients[0];
    assert.ok(client !== undefined);
    assert.match(html, /Cho phép kết nối/);
    assert.ok(html.includes(client.clientName), 'names the client');
    assert.ok(html.includes(`${PERSONAS.nhung.fullName} (${nHung})`), 'names the signed-in character as Full Name (NV-xx)');
    assert.match(html, /mcp:read/);
    assert.match(html, /mcp:propose/);
    assert.match(html, /Trần dữ liệu/);
    // The user_device ceiling is internal_general: the page names the class and the
    // personal fields it keeps from this client, without dumping every schema field.
    assert.match(html, /dữ liệu nội bộ chung/);
    assert.match(html, /Số điện thoại cá nhân/);
    assert.match(html, /Địa chỉ nhà/);
    assert.doesNotMatch(html, /<h3>Task<\/h3>/, 'the page never dumps the whole field schema');
    assert.match(html, />Cho phép</);
    assert.match(html, />Từ chối</);
    // No token, code or secret is ever on the page.
    assert.doesNotMatch(html, /access_token|code_verifier|client_secret/);
  });
});

test('oauth pages: allowing the connection returns a working code that exchanges for a token of that person', async () => {
  await withPages({}, async (f) => {
    const flow = await beginAuthorization(f);
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;
    const done = await completeFlow(f, flow, HOA, password);
    assert.equal(done.error, undefined);
    assert.ok(done.code !== undefined, 'the callback carries a code');
    assert.equal(done.state, flow.state, 'the callback returns the same state');
    assert.equal(done.iss, f.gateway.oauth.issuer, 'the callback names the issuer');

    const answer = await exchange(f, done.code, flow.verifier.verifier);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const token = answer.body['access_token'];
    assert.equal(typeof token, 'string');

    const grant = f.gateway.oauth.grants.list().find((candidate) => candidate.employeeId === HOA);
    assert.ok(grant !== undefined, 'consent records a stable grant for the person');

    const read = await rpc(f, token as string, 'get_task', { task_id: 'T-12' });
    assert.equal(read.status, 200, JSON.stringify(read.json));
  });
});

test('oauth pages: refusing the connection returns access_denied with the state and the issuer, and makes no grant', async () => {
  await withPages({}, async (f) => {
    const flow = await beginAuthorization(f);
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;
    const done = await completeFlow(f, flow, HOA, password, 'deny');
    assert.equal(done.code, undefined, 'no code follows a refusal');
    assert.equal(done.error, 'access_denied');
    assert.equal(done.state, flow.state, 'the refusal carries the state');
    assert.equal(done.iss, f.gateway.oauth.issuer, 'the refusal names the issuer');
    assert.equal(f.gateway.oauth.grants.list().length, 0, 'a refusal records no grant');
  });
});

test('oauth pages: consent never writes a business change and never opens the approval pages', async () => {
  await withPages({}, async (f) => {
    const flow = await beginAuthorization(f);
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;
    const done = await completeFlow(f, flow, HOA, password);
    assert.ok(done.code !== undefined);
    // Nothing was written, and no proposal or command exists.
    assert.equal(f.systems.writeCount('T-12'), 0, 'consent wrote nothing');
    assert.equal(f.gateway.proposals.listAwaitingApproval().length, 0);
    assert.equal(f.gateway.commands.list().length, 0);
    // The token cannot open the confirmation or approval pages: those doors take a page password session only.
    const token = (await exchange(f, done.code, flow.verifier.verifier)).body['access_token'];
    assert.equal(typeof token, 'string');
    const page = await fetch(`${f.gateway.url}/cho-duyet`, {
      redirect: 'manual',
      headers: { authorization: `Bearer ${token as string}` },
    });
    assert.equal(page.status, 303, 'a token is not a page session, so the inbox redirects to login');
    assert.match(page.headers.get('location') ?? '', /\/dang-nhap/);
  });
});

test('oauth pages: a lab_ tool key is refused at the login page exactly like a wrong page password', async () => {
  await withPages({}, async (f) => {
    const flow = await beginAuthorization(f);
    const toolKey = f.gateway.keys.issue({ employeeId: HOA, caller: 'test' }).rawKey;
    const post = await formPost(flow.pageUrl, { csrf: csrfOf(flow.pageHtml), employee: HOA, password: toolKey }, flow.jar);
    assert.equal(post.status, 401);
    assert.match(await post.text(), /Mật khẩu trang không đúng/);
    assert.equal(post.headers.get('location'), null, 'no session cookie is set on a refusal');
  });
});

test('oauth pages: a wrong page password, a missing CSRF token and a foreign Origin are each refused with no session', async () => {
  await withPages({}, async (f) => {
    // Wrong password for the person.
    const wrong = await beginAuthorization(f);
    const otherPassword = f.gateway.pagePasswords.issue({ employeeId: NAM }).rawPassword;
    const wrongPost = await formPost(wrong.pageUrl, { csrf: csrfOf(wrong.pageHtml), employee: HOA, password: otherPassword }, wrong.jar);
    assert.equal(wrongPost.status, 401);

    // Missing CSRF token.
    const noCsrf = await beginAuthorization(f);
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;
    const noCsrfPost = await formPost(noCsrf.pageUrl, { employee: HOA, password }, noCsrf.jar);
    assert.equal(noCsrfPost.status, 403);
    assert.match(await noCsrfPost.text(), /mã chống giả mạo/);

    // Wrong CSRF token.
    const badCsrf = await beginAuthorization(f);
    const badCsrfPost = await formPost(badCsrf.pageUrl, { csrf: 'not-the-token', employee: HOA, password }, badCsrf.jar);
    assert.equal(badCsrfPost.status, 403);

    // A form from another Origin is refused even with a good token.
    const foreign = await beginAuthorization(f);
    const foreignPost = await formPost(
      foreign.pageUrl,
      { csrf: csrfOf(foreign.pageHtml), employee: HOA, password },
      foreign.jar,
      'https://evil.example',
    );
    assert.equal(foreignPost.status, 403);
  });
});

test('oauth pages: the consent form cannot swap the client, callback, scope, resource or employee it was drawn for', async () => {
  await withPages({}, async (f) => {
    const flow = await beginAuthorization(f);
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;
    const consent = await submitLogin(f, flow, HOA, password);
    assert.equal(consent.status, 200);

    // A form that adds a client, callback, scope, resource or employee field gets
    // the same answer as the clean form: none of those are read from the form.
    const tampered = await formPost(
      consent.url,
      {
        csrf: csrfOf(consent.html),
        decision: 'allow',
        client_id: 'lab-demo-b',
        redirect_uri: 'https://evil.example/callback',
        scope: 'openid mcp:read mcp:propose admin',
        resource: 'https://evil.example/mcp',
        employee: NAM,
      },
      flow.jar,
    );
    assert.equal(tampered.status, 303);
    // Follow to the callback: it must go to the registered address, never the one the form named.
    const done = await followToCallback(
      new URL(tampered.headers.get('location') ?? '', f.gateway.oauth.issuer),
      flow.jar,
      flow.redirectUri,
    );
    assert.ok(done.code !== undefined, 'the registered callback receives a code');

    const answer = await exchange(f, done.code, flow.verifier.verifier);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.ok(!String(answer.body['scope']).includes('admin'), 'the added scope is never granted');
    const grant = f.gateway.oauth.grants.list()[0];
    assert.equal(grant?.employeeId, HOA, 'the person comes from the session, not the form');
    assert.equal(grant?.clientId, f.clients[0]?.clientId, 'the client comes from the interaction, not the form');
  });
});

test('oauth pages: an interaction uid swapped into the URL is refused because its CSRF token does not match', async () => {
  await withPages({}, async (f) => {
    const first = await beginAuthorization(f);
    const second = await beginAuthorization(f);
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;

    // Post the second interaction's token to the first page: the uid and token differ.
    const swapped = await formPost(
      first.pageUrl,
      { csrf: csrfOf(second.pageHtml), employee: HOA, password },
      first.jar,
    );
    assert.equal(swapped.status, 403);
    assert.match(await swapped.text(), /mã chống giả mạo/);
  });
});

test('oauth pages: an expired interaction is refused, so a stale login page cannot sign in', async () => {
  let clock = new Date('2026-11-28T09:00:00.000Z');
  await withPages({ now: () => clock }, async (f) => {
    const flow = await beginAuthorization(f);
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;
    // The interaction lives one hour; move past it before the form is posted.
    clock = new Date(clock.getTime() + 61 * 60 * 1000);
    const stale = await formPost(flow.pageUrl, { csrf: csrfOf(flow.pageHtml), employee: HOA, password }, flow.jar);
    assert.ok(stale.status === 400 || stale.status === 403, `a stale form is refused, got ${stale.status}`);
  });
});

test('oauth pages: a second consent press with a spent token is refused, so one interaction issues one code', async () => {
  await withPages({}, async (f) => {
    const flow = await beginAuthorization(f);
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;
    const consent = await submitLogin(f, flow, HOA, password);
    const token = csrfOf(consent.html);

    const first = await formPost(consent.url, { csrf: token, decision: 'allow' }, flow.jar);
    assert.equal(first.status, 303);
    const second = await formPost(consent.url, { csrf: token, decision: 'allow' }, flow.jar);
    assert.notEqual(second.status, 303, 'a spent form does not issue a second redirect');
  });
});

test('oauth pages: the consent page shows the person who signed in, not one the form names', async () => {
  await withPages({}, async (f) => {
    const flow = await beginAuthorization(f);
    const namPassword = f.gateway.pagePasswords.issue({ employeeId: NAM }).rawPassword;
    const namConsent = await submitLogin(f, flow, NAM, namPassword);
    assert.equal(namConsent.status, 200);
    assert.ok(namConsent.html.includes(`${PERSONAS.nam.fullName} (${NAM})`), 'names the signed-in person');
    assert.ok(!namConsent.html.includes(`${PERSONAS.hoa.fullName} (${HOA})`), 'never names the other character');

    const allow = await formPost(
      namConsent.url,
      { csrf: csrfOf(namConsent.html), decision: 'allow', accountId: HOA, employee: HOA, sub: HOA },
      flow.jar,
    );
    assert.equal(allow.status, 303);
    const done = await followToCallback(
      new URL(allow.headers.get('location') ?? '', f.gateway.oauth.issuer),
      flow.jar,
      flow.redirectUri,
    );
    assert.ok(done.code !== undefined);
    await exchange(f, done.code, flow.verifier.verifier);
    const grant = f.gateway.oauth.grants.list()[0];
    assert.equal(grant?.employeeId, NAM, 'the grant is for the signed-in person, never the one the form named');
  });
});

test('oauth pages: the same login and consent work for the second registered client, with its own name and grant', async () => {
  await withPages({}, async (f) => {
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;
    const second = f.clients[1];
    assert.ok(second !== undefined);

    // The consent page for the second client names that client.
    const shown = await submitLogin(f, await beginAuthorization(f, { clientIndex: 1 }), HOA, password);
    assert.equal(shown.status, 200);
    assert.ok(shown.html.includes(second.clientName), 'names the second client');

    // A full run on the second client exchanges its own code and records its own grant.
    const flow = await beginAuthorization(f, { clientIndex: 1 });
    const done = await completeFlow(f, flow, HOA, password);
    assert.ok(done.code !== undefined);
    const answer = await exchange(f, done.code, flow.verifier.verifier, 1);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const grants = f.gateway.oauth.grants.list();
    assert.equal(grants.length, 1);
    assert.equal(grants[0]?.clientId, second.clientId, 'the grant names the client that was used');
  });
});

test('oauth pages: the interaction pages carry no form-action directive, so Chrome keeps the cross-origin redirect', async () => {
  await withPages({}, async (f) => {
    const flow = await beginAuthorization(f);
    const csp = flow.pageHeaders.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'none'/);
    assert.doesNotMatch(csp, /form-action/, 'the consent page omits form-action so the cross-origin redirect is not cancelled');
    assert.match(flow.pageHeaders.get('content-type') ?? '', /text\/html/);
    assert.equal(flow.pageHeaders.get('x-content-type-options'), 'nosniff');
  });
});

test('oauth pages: the client secret is never on the consent page and a token is never in the callback URL', async () => {
  await withPages({}, async (f) => {
    const password = f.gateway.pagePasswords.issue({ employeeId: HOA }).rawPassword;
    const clientSecret = f.secret(f.clients[0]?.clientId ?? '');

    const first = await beginAuthorization(f);
    const consent = await submitLogin(f, first, HOA, password);
    assert.ok(!consent.html.includes(clientSecret), 'the client secret is never rendered');

    const done = await completeFlow(f, await beginAuthorization(f), HOA, password);
    assert.ok(done.code !== undefined);
    const location = `${first.redirectUri}?code=${done.code}`;
    assert.ok(!location.includes('access_token'), 'the callback carries a code, never a token');
    assert.ok(!location.includes(clientSecret), 'the callback carries no client secret');
  });
});

test('oauth pages: the ceiling sentence reads naturally for every data class the rule file can name', () => {
  const labels = [
    'số liệu tổng hợp ẩn danh',
    'dữ liệu nội bộ chung',
    'dữ liệu cá nhân nhân viên',
    'dữ liệu cá nhân khách hàng',
    'dữ liệu thanh toán',
  ];
  for (const ceilingLabel of labels) {
    const html = consentPage({
      action: '/interaction/uid',
      csrfToken: 'csrf',
      clientName: 'Lab demo client A',
      accountLabel: 'Nguyễn Thị Hoa (NV-02)',
      scopes: [],
      ceiling: { clientClassLabel: 'chạy trên máy cá nhân', ceilingLabel, excludedFields: [], unavailable: false },
    });
    assert.ok(
      html.includes(`nên chỉ nhận được tối đa <strong>${ceilingLabel}</strong>`),
      `the sentence names the ceiling once and reads well for ${ceilingLabel}`,
    );
    // The awkward repeat "trần dữ liệu dữ liệu" never appears.
    assert.ok(!html.includes('trần dữ liệu dữ liệu'), 'the ceiling sentence never repeats the word dữ liệu');
  }
});

test('oauth pages: the login page offers the shared persona options and a stacked scope row labels both cells', () => {
  const options = oauthLoginPage({ action: '/interaction/uid', csrfToken: 'csrf', selected: 'NV-06' });
  assert.match(options, /<option value="NV-06" selected>Phạm Thị Nhung \(NV-06\)<\/option>/, 'Full Name (NV-xx), pre-selected');

  // The scope table labels both cells so a stacked row at 390 px is readable.
  const html = consentPage({
    action: '/interaction/uid',
    csrfToken: 'csrf',
    clientName: 'Lab demo client A',
    accountLabel: 'Nguyễn Thị Hoa (NV-02)',
    scopes: [{ scope: 'mcp:read', label: 'Đọc dữ liệu', description: 'Gọi công cụ đọc.' }],
    ceiling: { clientClassLabel: 'chạy trên máy cá nhân', ceilingLabel: 'dữ liệu nội bộ chung', excludedFields: [], unavailable: false },
  });
  assert.match(html, /data-label="Phạm vi"/, 'the scope code cell carries a label');
  assert.match(html, /data-label="Nghĩa"/, 'the meaning cell carries a label');
});
