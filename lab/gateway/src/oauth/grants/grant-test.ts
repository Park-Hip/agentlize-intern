import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AuthorizationRegistry, WEB_DOOR } from '../../authorization/index.js';
import { openGatewayDatabase, type GatewayDatabase } from '../../database.js';
import type { AdapterFactory } from 'oidc-provider';
import { loadOAuthRuntimeConfig, type OAuthRuntimeConfig } from '../runtime-config.js';
import { createOAuthAdapterFactory, hasOAuthState, OAUTH_STATE_TABLE } from '../storage/index.js';
import { GrantAuthorizationResolver, GrantStore, LAB_GRANT_TTL_MS, type LabGrant } from './index.js';

interface Setup {
  readonly dir: string;
  readonly db: GatewayDatabase;
  readonly config: OAuthRuntimeConfig;
  readonly factory: AdapterFactory;
  readonly grants: GrantStore;
  readonly registry: AuthorizationRegistry;
}

function setup(dir: string, now: () => Date = () => new Date()): Setup {
  const config = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
  const db = openGatewayDatabase(dir);
  const grants = new GrantStore(db, now);
  const registry = new AuthorizationRegistry(now);
  registry.register(new GrantAuthorizationResolver(grants));
  return { dir, db, config, factory: createOAuthAdapterFactory({ db, config }), grants, registry };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'lab-oauth-grant-'));
}

function remove(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function createGrant(grants: GrantStore, overrides: Partial<LabGrant> = {}): LabGrant {
  return grants.create({
    grantId: overrides.grantId ?? 'grant-hoa',
    employeeId: overrides.employeeId ?? 'NV-02',
    clientId: overrides.clientId ?? 'lab-demo',
    scope: overrides.scope ?? 'openid mcp:read mcp:propose',
  });
}

test('oauth grant: create stores the provider grant id, person, client, scope and a four-hour deadline', () => {
  const dir = tempDir();
  const now = new Date('2026-11-28T10:00:00.000Z');
  const s = setup(dir, () => now);
  try {
    const grant = createGrant(s.grants);
    assert.equal(grant.grantId, 'grant-hoa');
    assert.equal(grant.employeeId, 'NV-02');
    assert.equal(grant.clientId, 'lab-demo');
    assert.equal(grant.scope, 'openid mcp:read mcp:propose');
    assert.equal(grant.createdAt, now.toISOString());
    assert.equal(grant.expiresAt, new Date(now.getTime() + LAB_GRANT_TTL_MS).toISOString());
    assert.equal(LAB_GRANT_TTL_MS, 4 * 60 * 60 * 1000);
    assert.equal(grant.revokedAt, null);
    assert.deepEqual(s.grants.find('grant-hoa'), grant);
    assert.equal(hasOAuthState(s.db), true);
  } finally {
    s.db.close();
    remove(dir);
  }
});

test('oauth grant: the resolver maps a grant to its person and maps scopes to the gateway scope', () => {
  const dir = tempDir();
  const s = setup(dir);
  try {
    createGrant(s.grants, { grantId: 'grant-full' });
    createGrant(s.grants, { grantId: 'grant-read', scope: 'openid mcp:read' });

    const full = s.registry.resolve({ kind: 'oauth', id: 'grant-full' }, WEB_DOOR);
    assert.equal(full.ok, true);
    if (full.ok) {
      assert.equal(full.grant.employeeId, 'NV-02');
      assert.equal(full.grant.caller, 'user_device');
      assert.equal(full.grant.scope, 'full');
      assert.equal(full.grant.status, 'active');
      assert.deepEqual(full.grant.ref, { kind: 'oauth', id: 'grant-full' });
    }

    const read = s.registry.resolve({ kind: 'oauth', id: 'grant-read' }, WEB_DOOR);
    assert.equal(read.ok, true);
    if (read.ok) assert.equal(read.grant.scope, 'read_only');
  } finally {
    s.db.close();
    remove(dir);
  }
});

test('oauth grant: a token id is not a grant id, so resolving one never answers for the other', async () => {
  const dir = tempDir();
  const s = setup(dir);
  try {
    createGrant(s.grants, { grantId: 'grant-1' });
    await s.factory('AccessToken').upsert('tok-1', { jti: 'tok-1', grantId: 'grant-1' }, 3600);

    assert.equal(s.registry.resolve({ kind: 'oauth', id: 'grant-1' }, WEB_DOOR).ok, true);
    assert.deepEqual(s.registry.resolve({ kind: 'oauth', id: 'tok-1' }, WEB_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_INVALID',
    });
    assert.deepEqual(s.registry.resolve({ kind: 'oauth', id: 'grant-missing' }, WEB_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_INVALID',
    });
    assert.deepEqual(s.registry.resolve({ kind: 'key', id: 'grant-1' }, WEB_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_UNKNOWN',
    });
  } finally {
    s.db.close();
    remove(dir);
  }
});

test('oauth grant: revoking a grant blocks the resolver and every related token, and a restart does not revive them', async () => {
  const dir = tempDir();
  const s = setup(dir);
  try {
    createGrant(s.grants, { grantId: 'grant-hoa' });
    createGrant(s.grants, { grantId: 'grant-nam', employeeId: 'NV-05', clientId: 'lab-demo' });
    await s.factory('AccessToken').upsert('tok-hoa', { jti: 'tok-hoa', grantId: 'grant-hoa' }, 3600);
    await s.factory('AuthorizationCode').upsert('code-hoa', { jti: 'code-hoa', grantId: 'grant-hoa' }, 300);
    await s.factory('AccessToken').upsert('tok-nam', { jti: 'tok-nam', grantId: 'grant-nam' }, 3600);

    assert.equal(s.grants.revoke('grant-hoa'), true);
    assert.equal(s.grants.revoke('grant-hoa'), false, 'the second revocation keeps the first time');

    assert.deepEqual(s.registry.resolve({ kind: 'oauth', id: 'grant-hoa' }, WEB_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_REVOKED',
    });
    assert.equal(s.registry.resolve({ kind: 'oauth', id: 'grant-nam' }, WEB_DOOR).ok, true);
    assert.equal(await s.factory('AccessToken').find('tok-hoa'), undefined);
    assert.equal(await s.factory('AuthorizationCode').find('code-hoa'), undefined);
    assert.equal((await s.factory('AccessToken').find('tok-nam'))?.jti, 'tok-nam');
    const rows = s.db.prepare(`SELECT COUNT(*) AS total FROM ${OAUTH_STATE_TABLE}`).get() as { total: number };
    assert.equal(rows.total, 3, 'revoked rows stay as tombstones');
    s.db.close();

    const restarted = setup(dir);
    try {
      assert.deepEqual(restarted.registry.resolve({ kind: 'oauth', id: 'grant-hoa' }, WEB_DOOR), {
        ok: false,
        reason: 'AUTHORIZATION_REVOKED',
      });
      assert.equal(await restarted.factory('AccessToken').find('tok-hoa'), undefined);
      assert.equal((await restarted.factory('AccessToken').find('tok-nam'))?.jti, 'tok-nam');
      assert.equal(restarted.grants.find('grant-hoa')?.revokedAt !== null, true);
    } finally {
      restarted.db.close();
    }
  } finally {
    remove(dir);
  }
});

test('oauth grant: a grant past its deadline is refused as expired, never as revoked', () => {
  const dir = tempDir();
  let clock = new Date('2026-11-28T10:00:00.000Z');
  const s = setup(dir, () => clock);
  try {
    createGrant(s.grants, { grantId: 'grant-1' });
    assert.equal(s.registry.resolve({ kind: 'oauth', id: 'grant-1' }, WEB_DOOR).ok, true);

    clock = new Date(clock.getTime() + LAB_GRANT_TTL_MS + 1);
    assert.deepEqual(s.registry.resolve({ kind: 'oauth', id: 'grant-1' }, WEB_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_EXPIRED',
    });
  } finally {
    s.db.close();
    remove(dir);
  }
});

test('oauth grant: a grant is durable across a restart with the same runtime key', () => {
  const dir = tempDir();
  const first = setup(dir);
  try {
    const created = createGrant(first.grants, { grantId: 'grant-persist' });
    first.db.close();

    const second = setup(dir);
    assert.deepEqual(second.grants.find('grant-persist'), created);
    assert.equal(second.registry.resolve({ kind: 'oauth', id: 'grant-persist' }, WEB_DOOR).ok, true);
    second.db.close();
  } finally {
    remove(dir);
  }
});
