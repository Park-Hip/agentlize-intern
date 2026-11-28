import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DATA_DIR_ENV, SERVICE_KEY_ENV } from '@lab/shared';
import { StubSystems } from '../fixture.js';
import { startGateway, type RunningGateway } from '../server.js';
import type { OAuthInteractionHandler } from './interaction-types.js';
import { loadOAuthRuntimeConfig } from './runtime-config.js';
import { Outbox } from '../writes/index.js';

const HOA = 'NV-02';
const NAM = 'NV-05';
const QUANG = 'NV-01';
const SERVICE_KEY = 'test-service-key-0123456789abcdef';
const THIRTY = Array.from({ length: 30 }, (_, index) => `T-${100 + index}`);

/** A page handler that signs in one person and approves the connection, like the shipped pages do at a click. */
interface Fixture {
  readonly dir: string;
  readonly gateway: RunningGateway;
  readonly systems: StubSystems;
  readonly secret: (clientId: string) => string;
  /** The person the next connection signs in as; the shipped production page asks a human instead. */
  who(employeeId: string): void;
  close(): Promise<void>;
}

/** Start the real gateway with the shipped OAuth provider, an auto-approving page and the stub systems. */
async function startOAuth(
  options: { readonly dir?: string; readonly systems?: StubSystems; readonly who?: string; readonly now?: () => Date } = {},
): Promise<Fixture> {
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), 'lab-oauth-revocation-'));
  const systems = options.systems ?? new StubSystems();
  const holder = { employeeId: options.who ?? HOA };
  const interaction: OAuthInteractionHandler = {
    async handle(context): Promise<void> {
      if (context.details.prompt === 'login') return context.login(holder.employeeId);
      if (context.details.prompt === 'consent') return context.approve();
      throw new Error(`unexpected prompt ${context.details.prompt}`);
    },
  };
  const gateway = await startGateway({
    port: 0,
    env: { ...process.env, [SERVICE_KEY_ENV]: SERVICE_KEY, [DATA_DIR_ENV]: dir },
    adapters: systems.adapters,
    oauth: { interaction },
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const config = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: gateway.oauth.clients.map((client) => client.clientId) });
  return {
    dir,
    gateway,
    systems,
    secret: (clientId) => {
      const secret = config.clientSecrets[clientId];
      assert.ok(secret !== undefined, `a secret exists for ${clientId}`);
      return secret;
    },
    who: (employeeId) => {
      holder.employeeId = employeeId;
    },
    async close() {
      await gateway.close();
      if (options.dir === undefined) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
}

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

function pkce(): { verifier: string; challenge: string } {
  const verifier = `verifier-${randomBytes(40).toString('base64url')}`;
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

interface Token {
  readonly token: string;
  readonly grantId: string;
  readonly clientId: string;
}

/** Walk the real authorize redirects with the auto page, then exchange the code for a token. */
async function connect(f: Fixture, clientIndex = 0): Promise<Token> {
  const oauth = f.gateway.oauth;
  const client = oauth.clients[clientIndex];
  assert.ok(client !== undefined);
  const redirectUri = client.redirectUris[0] ?? '';
  const verifier = pkce();
  const url = new URL(`${oauth.issuer}/oauth/auth`);
  url.searchParams.set('client_id', client.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid mcp:read mcp:propose');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', verifier.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('resource', oauth.resource);
  url.searchParams.set('state', `state-${randomBytes(8).toString('base64url')}`);

  const jar = new Jar();
  let next = url;
  let code = '';
  for (let hop = 0; hop < 12; hop += 1) {
    const response = await fetch(next, { redirect: 'manual', headers: { cookie: jar.header() } });
    jar.keep(response);
    const location = response.headers.get('location') ?? '';
    if (location.startsWith(redirectUri)) {
      code = new URL(location).searchParams.get('code') ?? '';
      break;
    }
    assert.notEqual(location, '', `a hop answered ${response.status} without a redirect`);
    next = new URL(location, oauth.issuer);
  }
  assert.notEqual(code, '', 'the flow ends with a code');

  const answer = await fetch(`${oauth.issuer}/oauth/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${client.clientId}:${f.secret(client.clientId)}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier.verifier,
      resource: oauth.resource,
    }).toString(),
  });
  const body = (await answer.json()) as Record<string, unknown>;
  assert.equal(answer.status, 200, JSON.stringify(body));
  const token = body['access_token'];
  assert.equal(typeof token, 'string');
  const grants = f.gateway.oauth.grants.list();
  const grant = grants[grants.length - 1];
  assert.ok(grant !== undefined);
  return { token: token as string, grantId: grant.grantId, clientId: client.clientId };
}

/** One JSON-RPC call to `/mcp` with a token. */
async function rpc(
  f: Fixture,
  token: string | undefined,
  name: string,
  args: Record<string, unknown>,
): Promise<{ status: number; text: string; json: Record<string, unknown> }> {
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
  const json = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { status: response.status, text: JSON.stringify(json), json };
}

/** The proposal id of a propose answer, from the confirmation link. */
function proposalOf(text: string): string {
  const link = text.split('\n').find((line) => /\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer carries a confirmation link: ${text}`);
  return link.slice(link.lastIndexOf('/') + 1);
}

/** Dial the revocation endpoint as one client. */
async function revokeToken(f: Fixture, token: string, clientId: string, secret?: string): Promise<Response> {
  return fetch(`${f.gateway.oauth.issuer}/oauth/token/revocation`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${clientId}:${secret ?? f.secret(clientId)}`).toString('base64')}`,
    },
    body: new URLSearchParams({ token }).toString(),
  });
}

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

async function signIn(f: Fixture, employeeId: string, next: string): Promise<Browser> {
  const response = await fetch(`${f.gateway.url}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: employeeId, password: f.gateway.pagePasswords.issue({ employeeId }).rawPassword, next }).toString(),
  });
  assert.equal(response.status, 303, await response.text());
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const page = await fetch(`${f.gateway.url}${next}`, { headers: { cookie } });
  const html = await page.text();
  assert.equal(page.status, 200, html);
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(csrf !== undefined, 'the page carries a CSRF token');
  return { cookie, csrf };
}

function post(f: Fixture, path: string, form: Record<string, string>, cookie: string): Promise<Response> {
  return fetch(`${f.gateway.url}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

test('oauth connections: the page lists only the signed-in person, and a press without the CSRF token is refused', async () => {
  const f = await startOAuth();
  try {
    const hoa = await connect(f);
    // A second person on the same client, so both grants exist side by side.
    f.who(NAM);
    const nam = await connect(f);
    assert.equal(f.gateway.oauth.grants.list().length, 2);

    const hoaPage = await signIn(f, HOA, '/ket-noi');
    const listed = await fetch(`${f.gateway.url}/ket-noi`, { headers: { cookie: hoaPage.cookie } });
    const html = await listed.text();
    assert.equal(listed.status, 200);
    assert.match(html, /Kết nối ứng dụng/);
    assert.ok(html.includes(hoa.grantId), 'lists the signed-in person grant');
    assert.ok(!html.includes(nam.grantId), 'never lists another person grant');
    assert.ok(html.includes(f.gateway.oauth.clients[0]?.clientName ?? ''), 'names the client from its registration');

    // A press with no CSRF token is refused and revokes nothing.
    const withoutCsrf = await post(f, `/ket-noi/${hoa.grantId}/ngat`, {}, hoaPage.cookie);
    assert.equal(withoutCsrf.status, 403);
    assert.match(await withoutCsrf.text(), /\[NOT_PERMITTED\]/);
    assert.equal(f.gateway.oauth.grants.find(hoa.grantId)?.revokedAt, null);
  } finally {
    await f.close();
  }
});

test('oauth connections: another person cannot disconnect a grant they do not hold', async () => {
  const f = await startOAuth();
  try {
    const hoa = await connect(f);
    // Nam has his own connection, so his page renders a form and a CSRF token.
    f.who(NAM);
    const nam = await connect(f);
    const namPage = await signIn(f, NAM, '/ket-noi');

    const attempt = await post(f, `/ket-noi/${hoa.grantId}/ngat`, { csrf: namPage.csrf }, namPage.cookie);
    assert.equal(attempt.status, 404);
    assert.equal(f.gateway.oauth.grants.find(hoa.grantId)?.revokedAt, null, 'the other person grant is untouched');
    assert.equal((await rpc(f, hoa.token, 'get_task', { task_id: 'T-12' })).status, 200, 'and its token still reads');
    assert.equal(f.gateway.oauth.grants.find(nam.grantId)?.revokedAt, null, 'the refused press revoked nothing at all');
  } finally {
    await f.close();
  }
});

test('oauth connections: disconnect revokes the grant and every token, while a token revocation leaves the grant', async () => {
  const f = await startOAuth();
  try {
    const first = await connect(f);
    const second = await connect(f);

    // The revocation endpoint: a client may revoke only its own token.
    const otherClient = f.gateway.oauth.clients[1];
    assert.ok(otherClient !== undefined);
    const foreign = await revokeToken(f, first.token, otherClient.clientId);
    assert.ok(foreign.status === 400 || foreign.status === 401, `a foreign client is refused, got ${foreign.status}`);

    const ownRevoke = await revokeToken(f, first.token, first.clientId);
    assert.equal(ownRevoke.status, 200);
    assert.equal((await rpc(f, first.token, 'get_task', { task_id: 'T-12' })).status, 401, 'the revoked token stops');
    assert.equal(f.gateway.oauth.grants.find(first.grantId)?.revokedAt, null, 'revoking a token is not revoking the grant');
    assert.equal((await rpc(f, second.token, 'get_task', { task_id: 'T-12' })).status, 200, 'the other grant is untouched');

    // A disconnect from the page revokes the grant and its remaining token.
    const page = await signIn(f, HOA, '/ket-noi');
    const pressed = await post(f, `/ket-noi/${second.grantId}/ngat`, { csrf: page.csrf }, page.cookie);
    assert.equal(pressed.status, 303);
    assert.notEqual(f.gateway.oauth.grants.find(second.grantId)?.revokedAt, null);
    assert.equal((await rpc(f, second.token, 'get_task', { task_id: 'T-12' })).status, 401);
  } finally {
    await f.close();
  }
});

test('oauth revocation: a revoked grant blocks Gửi before it and the lead approval after it, and a fresh grant does not revive the proposal', async () => {
  const f = await startOAuth();
  try {
    const { token, grantId } = await connect(f);
    const drafted = await rpc(f, token, 'propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } });
    assert.equal(drafted.status, 200, drafted.text);
    const id = proposalOf(String((drafted.json['result'] as { content?: { text?: string }[] }).content?.[0]?.text ?? ''));
    assert.deepEqual(f.gateway.proposals.get(id)?.authorization, { kind: 'oauth', id: grantId });

    f.gateway.oauth.grants.revoke(grantId);
    const browser = await signIn(f, HOA, `/xac-nhan/${id}`);
    const pressed = await post(f, `/xac-nhan/${id}/gui`, { csrf: browser.csrf }, browser.cookie);
    assert.equal(pressed.status, 401);
    assert.match(await pressed.text(), /\[KEY_REVOKED\]/);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
    assert.equal(f.gateway.commands.findByProposal(id), undefined, 'no command is made for a refused press');

    // A new connection for the same person is a new grant; the old proposal still points at the revoked one.
    const fresh = await connect(f);
    assert.notEqual(fresh.grantId, grantId);
    const again = await post(f, `/xac-nhan/${id}/gui`, { csrf: browser.csrf }, browser.cookie);
    assert.equal(again.status, 401);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
  } finally {
    await f.close();
  }
});

test('oauth revocation: revoking after Gửi blocks the lead approval and creates no command', async () => {
  const f = await startOAuth();
  try {
    const { token, grantId } = await connect(f);
    const drafted = await rpc(f, token, 'propose_task_change', { task_ids: THIRTY, changes: { assignee: 'NV-04' } });
    const id = proposalOf(String((drafted.json['result'] as { content?: { text?: string }[] }).content?.[0]?.text ?? ''));
    const hoaBrowser = await signIn(f, HOA, `/xac-nhan/${id}`);
    const sent = await post(f, `/xac-nhan/${id}/gui`, { csrf: hoaBrowser.csrf }, hoaBrowser.cookie);
    assert.equal(sent.status, 303, await sent.text());
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_approval');

    f.gateway.oauth.grants.revoke(grantId);
    const lead = await signIn(f, QUANG, `/duyet/${id}`);
    const approve = await post(f, `/duyet/${id}/duyet`, { csrf: lead.csrf }, lead.cookie);
    assert.equal(approve.status, 401);
    assert.match(await approve.text(), /\[KEY_REVOKED\]/);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_approval');
    assert.equal(f.gateway.commands.findByProposal(id), undefined);
    assert.equal(f.systems.writeCount('T-100'), 0);
  } finally {
    await f.close();
  }
});

test('oauth revocation: a command left not_sent is held after a revoke and after a restart, and never sent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-oauth-held-'));
  const systems = new StubSystems();
  let f = await startOAuth({ dir, systems });
  let id = '';
  try {
    const { token, grantId } = await connect(f);
    const drafted = await rpc(f, token, 'propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'NV-04' } });
    id = proposalOf(String((drafted.json['result'] as { content?: { text?: string }[] }).content?.[0]?.text ?? ''));
    // The quiet executor leaves the command at not_sent; the loop that follows is the real one.
    const confirm = await f.gateway.proposals.decide(id, HOA, 'confirm', (decided) => {
      f.gateway.commands.createForProposal(decided);
    });
    assert.equal(confirm.ok, true);
    assert.equal(f.gateway.commands.findByProposal(id)?.status, 'not_sent');
    f.gateway.oauth.grants.revoke(grantId);

    const outbox = new Outbox({
      commands: f.gateway.commands,
      proposals: f.gateway.proposals,
      adapters: systems.adapters,
      trace: f.gateway.trace,
      authorization: f.gateway.authorization,
      pollMs: 10,
      log: () => undefined,
    });
    outbox.start();
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 120));
    await outbox.close();

    assert.equal(f.gateway.commands.findByProposal(id)?.status, 'not_sent');
    assert.equal(f.gateway.commands.findByProposal(id)?.attempts, 0);
    assert.equal(systems.writeCount('T-12'), 0);
  } finally {
    await f.close();
  }

  // Restart on the same data: the grant is still revoked, so the first round still holds.
  try {
    f = await startOAuth({ dir, systems });
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 200));
    assert.equal(f.gateway.commands.findByProposal(id)?.status, 'not_sent');
    assert.equal(f.gateway.commands.findByProposal(id)?.attempts, 0);
    assert.equal(systems.writeCount('T-12'), 0);
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test('oauth revocation: a sent_unknown command keeps its evidence when the grant is revoked, and sends no more', async () => {
  const f = await startOAuth();
  try {
    const { token, grantId } = await connect(f);
    const drafted = await rpc(f, token, 'propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'NV-04' } });
    const id = proposalOf(String((drafted.json['result'] as { content?: { text?: string }[] }).content?.[0]?.text ?? ''));
    await f.gateway.proposals.decide(id, HOA, 'confirm', (decided) => {
      f.gateway.commands.createForProposal(decided);
    });
    const command = f.gateway.commands.findByProposal(id);
    assert.ok(command !== undefined);
    // The send left an unknown answer behind, then the grant was revoked.
    f.gateway.commands.markSent(command.commandId);
    const at = new Date(f.gateway.oauth.grants.find(grantId)?.createdAt ?? Date.now()).toISOString();
    f.gateway.commands.noteAttempt(
      command.commandId,
      JSON.stringify({ kind: 'unavailable', detail: 'the answer was lost (test)' }),
      new Date(Date.parse(at) + 60_000),
      () => undefined,
    );
    f.gateway.oauth.grants.revoke(grantId);

    const before = f.gateway.commands.findByProposal(id);
    assert.equal(before?.status, 'sent_unknown');
    assert.equal(before?.attempts, 1);

    const outbox = new Outbox({
      commands: f.gateway.commands,
      proposals: f.gateway.proposals,
      adapters: f.systems.adapters,
      trace: f.gateway.trace,
      authorization: f.gateway.authorization,
      pollMs: 10,
      log: () => undefined,
    });
    outbox.start();
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 120));
    await outbox.close();

    const after = f.gateway.commands.findByProposal(id);
    assert.equal(after?.status, 'sent_unknown', 'the unknown state is kept, never called cancelled');
    assert.equal(after?.attempts, 1, 'no second send was made');
    assert.match(after?.result ?? '', /answer was lost/, 'the evidence of the last attempt stays');
    assert.equal(f.systems.writeCount('T-12'), 0, 'the target never heard a second write');
  } finally {
    await f.close();
  }
});

test('oauth revocation: a disabled client is refused at the write boundary, like a revoked grant', async () => {
  const f = await startOAuth();
  try {
    const { token, grantId, clientId } = await connect(f);
    const drafted = await rpc(f, token, 'propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } });
    const id = proposalOf(String((drafted.json['result'] as { content?: { text?: string }[] }).content?.[0]?.text ?? ''));
    assert.equal(f.gateway.oauth.grants.disableClient(clientId), 1, 'disabling revokes the grants it holds');
    assert.equal(f.gateway.oauth.grants.isClientDisabled(clientId), true);

    // Every token of that client is refused, and the proposal cannot be pressed.
    assert.equal((await rpc(f, token, 'get_task', { task_id: 'T-12' })).status, 401);
    const browser = await signIn(f, HOA, `/xac-nhan/${id}`);
    const pressed = await post(f, `/xac-nhan/${id}/gui`, { csrf: browser.csrf }, browser.cookie);
    assert.equal(pressed.status, 401);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
    assert.equal(f.systems.writeCount('T-12'), 0);

    // Switching it back on does not revive the old grant; reconnecting makes a new one.
    f.gateway.oauth.grants.enableClient(clientId);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
    assert.equal(f.gateway.oauth.grants.find(grantId)?.revokedAt !== null, true);
  } finally {
    await f.close();
  }
});

test('oauth revocation: an expired token is refused while the grant it came from still stands', async () => {
  let clock = new Date('2026-11-28T10:00:00.000Z');
  const f = await startOAuth({ now: () => clock });
  try {
    const { token, grantId } = await connect(f);
    const drafted = await rpc(f, token, 'propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } });
    const id = proposalOf(String((drafted.json['result'] as { content?: { text?: string }[] }).content?.[0]?.text ?? ''));

    // The token's hour runs out; the grant's four hours do not.
    clock = new Date(clock.getTime() + 61 * 60 * 1000);
    assert.equal((await rpc(f, token, 'get_task', { task_id: 'T-12' })).status, 401, 'the token stops working');
    assert.equal(f.gateway.oauth.grants.find(grantId)?.revokedAt, null, 'an expired token is never read as a revoked grant');
    // The source the proposal carries still resolves, so the two clocks stay separate.
    const resolution = f.gateway.authorization.resolve({ kind: 'oauth', id: grantId }, { resource: 'pages', door: 'web', accept: ['oauth'] });
    assert.equal(resolution.ok, true, 'the grant still proves the proposal source');
    // The proposal is past its own 30-minute window, which is a different clock again.
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
  } finally {
    await f.close();
  }
});

test('oauth revocation: a proposal drafted with a valid token is pressed after the token is revoked but before the grant', async () => {
  const f = await startOAuth();
  try {
    // Two connections: revoking one token must not block a proposal drafted under another grant of the same person.
    const first = await connect(f);
    const second = await connect(f);
    const drafted = await rpc(f, first.token, 'propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } });
    const id = proposalOf(String((drafted.json['result'] as { content?: { text?: string }[] }).content?.[0]?.text ?? ''));

    // Revoke only the second token; the first grant still stands, so the press goes through.
    await revokeToken(f, second.token, second.clientId);
    assert.equal(f.gateway.oauth.grants.find(first.grantId)?.revokedAt, null);

    const browser = await signIn(f, HOA, `/xac-nhan/${id}`);
    const pressed = await post(f, `/xac-nhan/${id}/gui`, { csrf: browser.csrf }, browser.cookie);
    assert.equal(pressed.status, 303, await pressed.text());
    assert.equal(f.gateway.proposals.get(id)?.status, 'confirmed');

    const line = f.gateway.trace.list().find((entry) => entry.tool === 'proposal_send');
    assert.equal(line?.grantId, first.grantId, 'the send line names the grant the proposal carries');
  } finally {
    await f.close();
  }
});

test('oauth revocation: revoking Nam leaves Hoa in the same client working, and the trail names no secret', async () => {
  const f = await startOAuth();
  try {
    const hoa = await connect(f);
    // A second person on the same client, so the client holds both people side by side.
    f.who(NAM);
    const nam = await connect(f);
    assert.equal(f.gateway.oauth.grants.list().length, 2);
    assert.equal(f.gateway.oauth.grants.list()[0]?.clientId, f.gateway.oauth.grants.list()[1]?.clientId, 'one client holds both');

    f.gateway.oauth.grants.revoke(nam.grantId);
    assert.equal((await rpc(f, hoa.token, 'get_task', { task_id: 'T-12' })).status, 200, 'Hoa still reads after Nam is revoked');
    assert.equal(f.gateway.oauth.grants.find(hoa.grantId)?.revokedAt, null);

    // Trace: one row connects the person, the caller, the grant, the proposal and the result.
    const line = f.gateway.trace.list().find((entry) => entry.tool === 'get_task');
    assert.equal(line?.requester, HOA);
    assert.equal(line?.caller, 'user_device');
    assert.equal(line?.grantId, hoa.grantId);
    const stored = JSON.stringify(f.gateway.trace.list());
    assert.ok(!stored.includes(hoa.token), 'the raw token is never in the trail');
    assert.ok(!stored.includes(f.secret(hoa.clientId)), 'the client secret is never in the trail');
  } finally {
    await f.close();
  }
});
