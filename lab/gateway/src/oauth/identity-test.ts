import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HTTP_DOOR, MCP_DOOR } from '../authorization/index.js';
import { openGatewayDatabase, type GatewayDatabase } from '../database.js';
import { KeyStore } from '../identity/index.js';
import type { LabGrant } from './grants/index.js';
import {
  createGatewayIdentity,
  OAuthTokenIdentity,
  type OAuthAccessToken,
  type OAuthTokenLookup,
} from './identity.js';
import type { OAuthClientRegistration } from './provider.js';

const RESOURCE = 'http://127.0.0.1:8790/mcp';
const GRANT_ID = 'grant-hoa';
const SCOPE = 'openid mcp:read mcp:propose';

function client(overrides: Partial<OAuthClientRegistration> = {}): OAuthClientRegistration {
  return {
    clientId: 'lab-demo-a',
    clientName: 'Lab demo client A',
    redirectUris: ['https://app-a.localhost:8795/callback'],
    caller: 'user_device',
    scopes: ['openid', 'mcp:read', 'mcp:propose'],
    ...overrides,
  };
}

function grant(overrides: Partial<LabGrant> = {}): LabGrant {
  return {
    grantId: GRANT_ID,
    employeeId: 'NV-02',
    clientId: 'lab-demo-a',
    scope: SCOPE,
    createdAt: '2026-11-28T10:00:00.000Z',
    expiresAt: '2026-11-28T14:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

function token(overrides: Partial<OAuthAccessToken> = {}): OAuthAccessToken {
  return {
    grantId: GRANT_ID,
    clientId: 'lab-demo-a',
    accountId: 'NV-02',
    scope: SCOPE,
    audience: RESOURCE,
    ...overrides,
  };
}

interface FakeLookup {
  readonly lookup: OAuthTokenLookup;
  token?: OAuthAccessToken | undefined;
  grant?: LabGrant | undefined;
  client?: OAuthClientRegistration | undefined;
}

function fakeLookup(overrides: { token?: OAuthAccessToken; grant?: LabGrant; client?: OAuthClientRegistration } = {}): FakeLookup {
  const state: FakeLookup = {
    token: overrides.token ?? token(),
    grant: overrides.grant ?? grant(),
    client: overrides.client ?? client(),
    lookup: {
      resource: RESOURCE,
      findToken: async (raw) => (raw === 'raw-token' ? state.token : undefined),
      findGrant: (id) => (state.grant !== undefined && state.grant.grantId === id ? state.grant : undefined),
      findClient: (id) => (state.client !== undefined && state.client.clientId === id ? state.client : undefined),
      isClientDisabled: () => false,
    },
  };
  return state;
}

function headers(raw: string): Record<string, string> {
  return { authorization: `Bearer ${raw}` };
}

function identityFor(state: FakeLookup, now?: () => Date): OAuthTokenIdentity {
  return new OAuthTokenIdentity(() => state.lookup, now);
}

test('oauth identity: a valid token becomes its person, its registered caller and its exact scopes', async () => {
  const state = fakeLookup();
  const result = await identityFor(state).authenticate(headers('raw-token'), MCP_DOOR);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.identity.employeeId, 'NV-02');
  assert.equal(result.identity.caller, 'user_device');
  assert.equal(result.identity.scope, 'full');
  assert.deepEqual(result.identity.authorization, { kind: 'oauth', id: GRANT_ID });
  assert.deepEqual(result.identity.oauthScopes, ['openid', 'mcp:read', 'mcp:propose']);
});

test('oauth identity: the caller comes from the registration, and a read-only grant is read_only', async () => {
  const state = fakeLookup({
    grant: grant({ scope: 'openid mcp:read' }),
    token: token({ scope: 'openid mcp:read' }),
    client: client({ caller: 'tho-than-desktop' }),
  });
  const result = await identityFor(state).authenticate(headers('raw-token'), MCP_DOOR);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.identity.caller, 'tho-than-desktop');
  assert.equal(result.identity.scope, 'read_only');
});

test('oauth identity: a missing token, a token id as a grant or a refused door is KEY_INVALID', async () => {
  const state = fakeLookup();
  assert.deepEqual(await identityFor(state).authenticate(headers('other-token'), MCP_DOOR), {
    ok: false,
    reason: 'KEY_INVALID',
  });
  assert.deepEqual(await identityFor(state).authenticate(headers('raw-token'), HTTP_DOOR), {
    ok: false,
    reason: 'KEY_INVALID',
  });
  assert.deepEqual(await identityFor(state).authenticate({}, MCP_DOOR), { ok: false, reason: 'KEY_INVALID' });

  // No lookup means the surface has not started; nothing is accepted.
  const notStarted = new OAuthTokenIdentity(() => undefined);
  assert.deepEqual(await notStarted.authenticate(headers('raw-token'), MCP_DOOR), {
    ok: false,
    reason: 'KEY_INVALID',
  });
});

test('oauth identity: a revoked grant is KEY_REVOKED, an expired grant is KEY_INVALID', async () => {
  const revoked = fakeLookup({ grant: grant({ revokedAt: '2026-11-28T11:00:00.000Z' }) });
  assert.deepEqual(await identityFor(revoked).authenticate(headers('raw-token'), MCP_DOOR), {
    ok: false,
    reason: 'KEY_REVOKED',
  });

  const expired = fakeLookup();
  const clock = (): Date => new Date('2026-11-28T14:00:01.000Z');
  assert.deepEqual(await identityFor(expired, clock).authenticate(headers('raw-token'), MCP_DOOR), {
    ok: false,
    reason: 'KEY_INVALID',
  });
});

test('oauth identity: a grant that does not match the token person, client or scopes is refused', async () => {
  const otherPerson = fakeLookup({ grant: grant({ employeeId: 'NV-05' }) });
  assert.equal((await identityFor(otherPerson).authenticate(headers('raw-token'), MCP_DOOR)).ok, false);

  const otherClient = fakeLookup({ grant: grant({ clientId: 'lab-demo-b' }) });
  assert.equal((await identityFor(otherClient).authenticate(headers('raw-token'), MCP_DOOR)).ok, false);

  const moreScope = fakeLookup({ token: token({ scope: 'openid mcp:read mcp:propose mcp:admin' }) });
  assert.equal((await identityFor(moreScope).authenticate(headers('raw-token'), MCP_DOOR)).ok, false);

  const noRegistration = fakeLookup();
  noRegistration.client = undefined;
  assert.equal((await identityFor(noRegistration).authenticate(headers('raw-token'), MCP_DOOR)).ok, false);
});

test('oauth identity: a token issued for another resource or another employee code is refused', async () => {
  const wrongResource = fakeLookup({ token: token({ audience: 'https://other.example/mcp' }) });
  assert.deepEqual(await identityFor(wrongResource).authenticate(headers('raw-token'), MCP_DOOR), {
    ok: false,
    reason: 'KEY_INVALID',
  });

  const wrongCode = fakeLookup({ token: token({ accountId: 'not-an-employee' }) });
  assert.deepEqual(await identityFor(wrongCode).authenticate(headers('raw-token'), MCP_DOOR), {
    ok: false,
    reason: 'KEY_INVALID',
  });
});

test('oauth identity: the MCP door routes a lab_ key to the key store and everything else to the token', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-oauth-identity-'));
  let db: GatewayDatabase | undefined;
  try {
    db = openGatewayDatabase(dir);
    const keys = new KeyStore(db);
    const issued = keys.issue({ employeeId: 'NV-02', caller: 'test' });
    const fakeToken = `opaque-${randomBytes(12).toString('base64url')}`;
    const state = fakeLookup({ token: token() });

    const identity = createGatewayIdentity(keys, () => ({
      ...state.lookup,
      findToken: async (raw) => (raw === fakeToken ? state.token : undefined),
    }));

    const viaKey = await identity.authenticate(headers(issued.rawKey), MCP_DOOR);
    assert.equal(viaKey.ok, true);
    if (viaKey.ok) assert.deepEqual(viaKey.identity.authorization, { kind: 'key', id: issued.record.keyId });

    const viaToken = await identity.authenticate(headers(fakeToken), MCP_DOOR);
    assert.equal(viaToken.ok, true);
    if (viaToken.ok) assert.equal(viaToken.identity.authorization.kind, 'oauth');

    // The HTTP door accepts only keys, so a valid token there is invalid rather than retried.
    assert.deepEqual(await identity.authenticate(headers(fakeToken), HTTP_DOOR), {
      ok: false,
      reason: 'KEY_INVALID',
    });

    const wrongKey = `lab_${randomBytes(12).toString('base64url')}`;
    assert.deepEqual(await identity.authenticate(headers(wrongKey), MCP_DOOR), {
      ok: false,
      reason: 'KEY_INVALID',
    });
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
