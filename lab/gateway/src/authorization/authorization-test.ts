import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { ApiKeyIdentity } from '../identity/api-key-identity.js';
import { KeyStore } from '../identity/key-store.js';
import { CommandStore } from '../writes/command-store.js';
import { ProposalStore } from '../proposals/proposal-store.js';
import {
  AuthorizationRegistry,
  createAuthorizationRegistry,
  HTTP_DOOR,
  KeyAuthorizationResolver,
  MCP_DOOR,
  WEB_DOOR,
  type AuthorizationResolver,
} from './index.js';

/** A registry with a stand-in OAuth provider, so the seam is exercised without a real server. */
class FakeGrantResolver implements AuthorizationResolver {
  readonly kind = 'oauth' as const;

  resolve(ref: Parameters<AuthorizationResolver['resolve']>[0]) {
    if (ref.kind !== 'oauth') return { ok: false as const, reason: 'AUTHORIZATION_UNKNOWN' as const };
    if (ref.id === 'grant-active') {
      return {
        ok: true as const,
        grant: {
          ref,
          employeeId: 'NV-02',
          caller: 'test' as const,
          scope: 'full' as const,
          expiresAt: null,
          status: 'active' as const,
        },
      };
    }
    if (ref.id === 'grant-revoked') return { ok: false as const, reason: 'AUTHORIZATION_REVOKED' as const };
    if (ref.id === 'grant-expired') return { ok: false as const, reason: 'AUTHORIZATION_EXPIRED' as const };
    return { ok: false as const, reason: 'AUTHORIZATION_INVALID' as const };
  }
}

function tempDb(): { dir: string; db: Database.Database } {
  const dir = mkdtempSync(join(tmpdir(), 'lab-authorization-'));
  return { dir, db: new Database(join(dir, 'gateway.sqlite')) };
}

test('authorization: a key resolves to its person, and an unknown or revoked key is refused', () => {
  const { dir, db } = tempDb();
  try {
    const keys = new KeyStore(db);
    const resolver = new KeyAuthorizationResolver(keys);
    const issued = keys.issue({ employeeId: 'NV-02', caller: 'test' });

    const active = resolver.resolve({ kind: 'key', id: issued.record.keyId }, HTTP_DOOR);
    assert.equal(active.ok, true);
    if (active.ok) {
      assert.equal(active.grant.employeeId, 'NV-02');
      assert.equal(active.grant.caller, 'test');
      assert.equal(active.grant.scope, 'full');
      assert.equal(active.grant.expiresAt, null, 'a key has no grant-level expiry');
    }

    assert.deepEqual(resolver.resolve({ kind: 'key', id: 'key-missing' }, HTTP_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_INVALID',
    });

    keys.revoke(issued.record.keyId);
    assert.deepEqual(resolver.resolve({ kind: 'key', id: issued.record.keyId }, HTTP_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_REVOKED',
    });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('authorization: a door with no provider for a kind refuses it instead of falling back', () => {
  const { dir, db } = tempDb();
  try {
    const registry = createAuthorizationRegistry(new KeyStore(db));
    assert.deepEqual(registry.resolve({ kind: 'oauth', id: 'grant-active' }, MCP_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_UNKNOWN',
    });

    // An HTTP door names one resource and accepts only keys, even after a provider registers.
    registry.register(new FakeGrantResolver());
    assert.deepEqual(registry.resolve({ kind: 'oauth', id: 'grant-active' }, HTTP_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_UNKNOWN',
    });
    assert.equal(registry.resolve({ kind: 'oauth', id: 'grant-active' }, MCP_DOOR).ok, true);
    assert.deepEqual(registry.resolve({ kind: 'oauth', id: 'grant-revoked' }, WEB_DOOR), {
      ok: false,
      reason: 'AUTHORIZATION_REVOKED',
    });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A provider that says yes even when its own grant is already dead, to prove the registry checks again. */
function yesResolver(status: 'active' | 'revoked', expiresAt: string | null): AuthorizationResolver {
  return {
    kind: 'oauth',
    resolve: (ref) => ({
      ok: true,
      grant: { ref, employeeId: 'NV-02', caller: 'test', scope: 'full', expiresAt, status },
    }),
  };
}

test('authorization: the registry refuses a revoked or expired grant even when a resolver says yes', () => {
  const registry = new AuthorizationRegistry(() => new Date('2026-11-28T10:00:00.000Z'));
  const grant = { kind: 'oauth' as const, id: 'grant-x' };

  registry.register(yesResolver('revoked', null));
  assert.deepEqual(registry.resolve(grant, MCP_DOOR), { ok: false, reason: 'AUTHORIZATION_REVOKED' });

  registry.register(yesResolver('active', '2026-11-28T09:59:59.000Z'));
  assert.deepEqual(registry.resolve(grant, MCP_DOOR), { ok: false, reason: 'AUTHORIZATION_EXPIRED' });

  registry.register(yesResolver('active', '2026-11-28T10:00:00.000Z'));
  assert.deepEqual(registry.resolve(grant, MCP_DOOR), { ok: false, reason: 'AUTHORIZATION_EXPIRED' }, 'the deadline is inclusive');

  registry.register(yesResolver('active', '2026-11-28T10:00:01.000Z'));
  assert.equal(registry.resolve(grant, MCP_DOOR).ok, true);

  registry.register(yesResolver('active', null));
  assert.equal(registry.resolve(grant, MCP_DOOR).ok, true, 'a grant with no deadline of its own stays valid');
});

test('authorization: a grant deadline that cannot be read is refused, not trusted', () => {
  const registry = new AuthorizationRegistry(() => new Date('2026-11-28T10:00:00.000Z'));
  registry.register(yesResolver('active', 'not-a-date'));
  assert.deepEqual(registry.resolve({ kind: 'oauth', id: 'grant-x' }, MCP_DOOR), {
    ok: false,
    reason: 'AUTHORIZATION_EXPIRED',
  });
});

test('identity: a door that accepts only grants refuses a Bearer key before reading it', async () => {
  const { dir, db } = tempDb();
  try {
    const keys = new KeyStore(db);
    const issued = keys.issue({ employeeId: 'NV-02', caller: 'test' });
    const provider = new ApiKeyIdentity(keys);
    const grantOnly = { resource: '/oauth', door: 'mcp' as const, accept: ['oauth' as const] };
    assert.deepEqual(await provider.authenticate({ authorization: `Bearer ${issued.rawKey}` }, grantOnly), {
      ok: false,
      reason: 'KEY_INVALID',
    });
    assert.equal((await provider.authenticate({ authorization: `Bearer ${issued.rawKey}` }, HTTP_DOOR)).ok, true);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/** The proposals table as it looked before the source of authority carried a kind. */
const LEGACY_PROPOSALS = `
  CREATE TABLE proposals (
    proposal_id        TEXT PRIMARY KEY,
    requester          TEXT NOT NULL,
    caller             TEXT NOT NULL,
    drafted_by_key_id  TEXT,
    tool               TEXT NOT NULL,
    record_type        TEXT NOT NULL,
    changes            TEXT NOT NULL,
    requires_approval  INTEGER NOT NULL,
    approval_reason    TEXT,
    approval_expires_at TEXT,
    fingerprint        TEXT NOT NULL,
    risk               TEXT NOT NULL,
    policy_version     INTEGER NOT NULL,
    status             TEXT NOT NULL,
    created_at         TEXT NOT NULL,
    expires_at         TEXT NOT NULL
  );
  CREATE TABLE proposal_items (
    proposal_id TEXT NOT NULL,
    position    INTEGER NOT NULL,
    system      TEXT NOT NULL,
    record_type TEXT NOT NULL,
    record_id   TEXT NOT NULL,
    base_version INTEGER NOT NULL,
    previous    TEXT NOT NULL,
    changes     TEXT NOT NULL,
    PRIMARY KEY (proposal_id, position)
  );
`;

test('migration: every old proposal keeps its data and its key becomes a key source', () => {
  const { dir, db } = tempDb();
  try {
    db.exec(LEGACY_PROPOSALS);
    const expiresAt = '2026-11-17T09:30:00.000Z';
    const fingerprint = 'a'.repeat(64);
    const insert = db.prepare(
      `INSERT INTO proposals (proposal_id, requester, caller, drafted_by_key_id, tool, record_type, changes,
                              requires_approval, approval_reason, approval_expires_at, fingerprint, risk,
                              policy_version, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run(
      'dx-0000000000000001', 'NV-02', 'tho-than-desktop', 'key-0123456789abcdef', 'propose_task_change', 'task',
      '{"assignee":"NV-04"}', 1, 'bulk', '2026-11-17T11:00:00.000Z', fingerprint, 'normal', 3,
      'awaiting_approval', '2026-11-17T09:00:00.000Z', expiresAt,
    );
    insert.run(
      'dx-0000000000000002', 'NV-03', 'fc-assistant', null, 'propose_task_change', 'task',
      '{"status":"done"}', 0, null, null, fingerprint, 'normal', 3,
      'awaiting_confirmation', '2026-11-17T09:00:00.000Z', expiresAt,
    );
    db.prepare(
      `INSERT INTO proposal_items (proposal_id, position, system, record_type, record_id, base_version, previous, changes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('dx-0000000000000001', 1, 'task', 'task', 'T-12', 1, '{"assignee":"NV-03"}', '{"assignee":"NV-04"}');

    const proposals = new ProposalStore(db);
    const migrated = proposals.get('dx-0000000000000001');
    assert.ok(migrated !== undefined);
    assert.deepEqual(migrated.authorization, { kind: 'key', id: 'key-0123456789abcdef' });
    assert.equal(migrated.requester, 'NV-02');
    assert.equal(migrated.status, 'awaiting_approval');
    assert.deepEqual(migrated.changes, { assignee: 'NV-04' });
    assert.equal(migrated.fingerprint, fingerprint);
    assert.equal(migrated.approvalExpiresAt, '2026-11-17T11:00:00.000Z');
    assert.equal(migrated.expiresAt, expiresAt);
    assert.deepEqual(migrated.items.map((item) => [item.position, item.recordId]), [[1, 'T-12']]);

    // The idempotency key is still derived from the same proposal code and position.
    const commands = new CommandStore(db);
    assert.equal(commands.createForProposal(migrated)[0]?.idempotencyKey, 'dx-0000000000000001:1');

    // A row with no recorded key has no source, so every step can refuse it instead of guessing one.
    assert.equal(proposals.get('dx-0000000000000002')?.authorization, null);
    const unresolved = createAuthorizationRegistry(new KeyStore(db)).resolve(null, WEB_DOOR);
    assert.deepEqual(unresolved, { ok: false, reason: 'AUTHORIZATION_UNKNOWN' });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
