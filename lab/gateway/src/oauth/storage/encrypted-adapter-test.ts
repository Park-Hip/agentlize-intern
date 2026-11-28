import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import type { AdapterFactory, AdapterPayload } from 'oidc-provider';
import { GATEWAY_DB_FILE, openGatewayDatabase, type GatewayDatabase } from '../../database.js';
import { loadOAuthRuntimeConfig, type OAuthRuntimeConfig } from '../runtime-config.js';
import {
  createOAuthAdapterFactory,
  decryptState,
  hashLookup,
  OAuthStateCryptoError,
  OAuthStateError,
  revokeStateByGrantId,
  OAUTH_STATE_TABLE,
} from './index.js';

interface Store {
  readonly dir: string;
  readonly db: GatewayDatabase;
  readonly config: OAuthRuntimeConfig;
  readonly factory: AdapterFactory;
}

function store(dir: string): Store {
  const config = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
  const db = openGatewayDatabase(dir);
  return { dir, db, config, factory: createOAuthAdapterFactory({ db, config }) };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'lab-oauth-state-'));
}

function remove(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

interface StoredRow {
  id_hash: string;
  payload: string;
  expires_at: string | null;
  consumed_at: string | null;
  revoked_at: string | null;
}

function row(db: GatewayDatabase, model: string, id: string): StoredRow {
  const found = db
    .prepare(`SELECT id_hash, payload, expires_at, consumed_at, revoked_at FROM ${OAUTH_STATE_TABLE} WHERE model = ? AND id_hash = ?`)
    .get(model, hashLookup(id)) as StoredRow | undefined;
  assert.ok(found !== undefined, `a row for ${model} ${id} exists`);
  return found;
}

function rowCount(db: GatewayDatabase): number {
  return (db.prepare(`SELECT COUNT(*) AS total FROM ${OAUTH_STATE_TABLE}`).get() as { total: number }).total;
}

function envelopePart(payload: string, index: number): string {
  const parts = payload.split(':');
  const part = parts[index];
  assert.ok(part !== undefined, `envelope has part ${index}`);
  return part;
}

function flipCiphertext(payload: string): string {
  const parts = payload.split(':');
  const ciphertext = parts[5];
  assert.ok(ciphertext !== undefined && ciphertext.length > 4, 'the envelope has a ciphertext');
  const chars = [...ciphertext];
  const middle = Math.floor(chars.length / 2);
  chars[middle] = chars[middle] === 'A' ? 'B' : 'A';
  parts[5] = chars.join('');
  return parts.join(':');
}

const wait = (ms: number): Promise<void> => new Promise((resolveWait) => setTimeout(resolveWait, ms));

/** A readable prefix plus run-time randomness, so no literal in this file looks like a real secret. */
function fakeSecret(prefix: string): string {
  return `${prefix}-${randomBytes(12).toString('base64url')}`;
}

test('oauth storage: a record is found by id, uid and user code, and an unknown id is missing', async () => {
  const dir = tempDir();
  const s = store(dir);
  try {
    const tokens = s.factory('AccessToken');
    const payload: AdapterPayload = {
      jti: 'tok-1',
      grantId: 'grant-1',
      accountId: 'NV-02',
      uid: 'uid-hoa',
      userCode: 'code-hoa',
    };
    await tokens.upsert('tok-1', payload, 3600);

    assert.deepEqual(await tokens.find('tok-1'), payload);
    assert.deepEqual(await tokens.findByUid('uid-hoa'), payload);
    assert.deepEqual(await tokens.findByUserCode('code-hoa'), payload);
    assert.equal(await tokens.find('tok-missing'), undefined);
    assert.equal(await tokens.findByUid('uid-missing'), undefined);
  } finally {
    s.db.close();
    remove(dir);
  }
});

test('oauth storage: the row holds a hashed id and an encrypted payload, never the raw token', async () => {
  const dir = tempDir();
  const s = store(dir);
  try {
    const rawToken = fakeSecret('raw-access-token');
    const rawCode = fakeSecret('raw-authorization-code');
    const tokens = s.factory('AccessToken');
    const codes = s.factory('AuthorizationCode');
    await tokens.upsert('tok-secret', { jti: rawToken, grantId: 'grant-1', accountId: 'NV-02' }, 3600);
    await codes.upsert('code-secret', { jti: rawCode, grantId: 'grant-1', accountId: 'NV-02' }, 300);

    const stored = row(s.db, 'AccessToken', 'tok-secret');
    assert.equal(stored.id_hash, hashLookup('tok-secret'));
    assert.notEqual(stored.id_hash, 'tok-secret');
    assert.match(stored.payload, /^enc:v1:/);
    assert.equal(stored.payload.includes(rawToken), false);
    assert.equal(stored.payload.includes('"jti"'), false);
    assert.equal(row(s.db, 'AuthorizationCode', 'code-secret').payload.includes(rawCode), false);

    // A fresh nonce for every write: the same record encrypted again carries a different IV and tag.
    await tokens.upsert('tok-secret', { jti: rawToken, grantId: 'grant-1', accountId: 'NV-02' }, 3600);
    const again = row(s.db, 'AccessToken', 'tok-secret');
    assert.notEqual(envelopePart(stored.payload, 3), envelopePart(again.payload, 3), 'the IV changes');
    assert.notEqual(envelopePart(stored.payload, 4), envelopePart(again.payload, 4), 'the tag changes');
    assert.equal(envelopePart(again.payload, 2), s.config.keyId, 'the envelope names the key id');
  } finally {
    s.db.close();
    remove(dir);
  }
});

test('oauth storage: the authenticated data binds model and lookup key, so a moved row does not open', async () => {
  const dir = tempDir();
  const s = store(dir);
  try {
    await s.factory('AccessToken').upsert('tok-1', { jti: 'tok-1', grantId: 'grant-1' }, 3600);
    const stored = row(s.db, 'AccessToken', 'tok-1');
    const key = { keyId: s.config.keyId, key: s.config.encryptionKey };

    assert.throws(() => decryptState(key, 'RefreshToken', stored.id_hash, stored.payload), OAuthStateCryptoError);
    assert.throws(() => decryptState(key, 'AccessToken', hashLookup('tok-2'), stored.payload), OAuthStateCryptoError);

    // A copied payload under another model is refused by the adapter and left in place.
    s.db
      .prepare(
        `INSERT INTO ${OAUTH_STATE_TABLE} (model, id_hash, payload, created_at) VALUES ('RefreshToken', ?, ?, ?)`,
      )
      .run(stored.id_hash, stored.payload, new Date().toISOString());
    assert.equal(await s.factory('RefreshToken').find('tok-1'), undefined);
    assert.equal(rowCount(s.db), 2);
  } finally {
    s.db.close();
    remove(dir);
  }
});

test('oauth storage: a changed ciphertext or tag is refused and the row is kept', async () => {
  const dir = tempDir();
  const s = store(dir);
  const logs: string[] = [];
  try {
    const config = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
    const logged = createOAuthAdapterFactory({ db: s.db, config, log: (line) => logs.push(line) })('AccessToken');
    const rawToken = fakeSecret('tampered-token');
    await logged.upsert('tok-1', { jti: rawToken, grantId: 'grant-1' }, 3600);

    const stored = row(s.db, 'AccessToken', 'tok-1');
    s.db
      .prepare(`UPDATE ${OAUTH_STATE_TABLE} SET payload = ? WHERE model = 'AccessToken' AND id_hash = ?`)
      .run(flipCiphertext(stored.payload), stored.id_hash);

    assert.equal(await logged.find('tok-1'), undefined);
    assert.equal(rowCount(s.db), 1, 'a refused row is not deleted');
    assert.equal(logs.length, 1);
    assert.match(logs[0] ?? '', /refused/);
    assert.equal(logs.join('\n').includes(rawToken), false, 'the log never carries the raw token');
  } finally {
    s.db.close();
    remove(dir);
  }
});

test('oauth storage: the same key reopens after a restart, and a different key reads nothing', async () => {
  const dir = tempDir();
  const otherDir = tempDir();
  try {
    const first = store(dir);
    await first.factory('AccessToken').upsert('tok-1', { jti: 'tok-1', grantId: 'grant-1' }, 3600);
    first.db.close();

    // Same directory, so the key file is read again: the stored record opens.
    const same = store(dir);
    assert.equal(same.config.source, 'file');
    assert.deepEqual(same.config.encryptionKey, first.config.encryptionKey);
    assert.equal((await same.factory('AccessToken').find('tok-1'))?.jti, 'tok-1');

    // A valid but different key, on the same database: nothing decrypts and nothing is deleted.
    const wrong = loadOAuthRuntimeConfig({ dataDir: otherDir, clientIds: ['lab-demo'] });
    assert.notEqual(wrong.keyId, same.config.keyId);
    const wrongFactory = createOAuthAdapterFactory({ db: same.db, config: wrong });
    assert.equal(await wrongFactory('AccessToken').find('tok-1'), undefined);
    assert.equal(rowCount(same.db), 1);
    same.db.close();
  } finally {
    remove(dir);
    remove(otherDir);
  }
});

test('oauth storage: consume wins once, refuses the second time and never clears its tombstone', async () => {
  const dir = tempDir();
  const s = store(dir);
  try {
    const codes = s.factory('AuthorizationCode');
    await codes.upsert('code-1', { jti: 'code-1', grantId: 'grant-1' }, 300);

    await codes.consume('code-1');
    assert.equal(await codes.find('code-1'), undefined);

    await assert.rejects(
      codes.consume('code-1'),
      (error: unknown) => error instanceof OAuthStateError && error.code === 'STATE_ALREADY_CONSUMED',
    );
    await assert.rejects(
      codes.upsert('code-1', { jti: 'code-1', grantId: 'grant-1' }, 300),
      (error: unknown) => error instanceof OAuthStateError && error.code === 'STATE_CONSUMED',
    );
    assert.equal(row(s.db, 'AuthorizationCode', 'code-1').consumed_at !== null, true);

    // destroy removes the row, so a later record with the same id is a new record, not a revival.
    const tokens = s.factory('AccessToken');
    await tokens.upsert('tok-1', { jti: 'tok-1', grantId: 'grant-1' }, 60);
    await tokens.destroy('tok-1');
    assert.equal(await tokens.find('tok-1'), undefined);
    await tokens.upsert('tok-1', { jti: 'tok-1b', grantId: 'grant-1' }, 60);
    assert.equal((await tokens.find('tok-1'))?.jti, 'tok-1b');
  } finally {
    s.db.close();
    remove(dir);
  }
});

test('oauth storage: revoking a grant kills every related record and survives a restart', async () => {
  const dir = tempDir();
  const s = store(dir);
  try {
    const tokens = s.factory('AccessToken');
    const refresh = s.factory('RefreshToken');
    const codes = s.factory('AuthorizationCode');
    const grants = s.factory('Grant');
    await tokens.upsert('tok-1', { jti: 'tok-1', grantId: 'grant-x' }, 3600);
    await refresh.upsert('refresh-1', { jti: 'refresh-1', grantId: 'grant-x' }, 86400);
    await codes.upsert('code-1', { jti: 'code-1', grantId: 'grant-x' }, 300);
    await grants.upsert('grant-x', { jti: 'grant-x' }, 14400);
    await tokens.upsert('tok-2', { jti: 'tok-2', grantId: 'grant-y' }, 3600);

    // The provider calls each adapter; one grant-scoped call from the grant side reaches every model.
    await tokens.revokeByGrantId('grant-x');
    await refresh.revokeByGrantId('grant-x');
    await codes.revokeByGrantId('grant-x');
    await grants.revokeByGrantId('grant-x');
    assert.equal(revokeStateByGrantId(s.db, 'grant-x'), 4, 'every remaining row was already revoked');

    for (const [factory, id] of [
      [tokens, 'tok-1'],
      [refresh, 'refresh-1'],
      [codes, 'code-1'],
      [grants, 'grant-x'],
    ] as const) {
      assert.equal(await factory.find(id), undefined, `${id} is refused`);
    }
    await assert.rejects(
      tokens.upsert('tok-1', { jti: 'tok-1', grantId: 'grant-x' }, 3600),
      (error: unknown) => error instanceof OAuthStateError && error.code === 'STATE_REVOKED',
    );
    assert.equal((await tokens.find('tok-2'))?.jti, 'tok-2', 'another grant is untouched');
    s.db.close();

    const restarted = store(dir);
    assert.equal(await restarted.factory('AccessToken').find('tok-1'), undefined);
    assert.equal(await restarted.factory('AuthorizationCode').find('code-1'), undefined);
    assert.equal((await restarted.factory('AccessToken').find('tok-2'))?.jti, 'tok-2');
    assert.equal(rowCount(restarted.db), 5, 'revoked rows stay as tombstones');
    restarted.db.close();
  } finally {
    remove(dir);
  }
});

test('oauth storage: an expired record reads as missing, and the row is kept', async () => {
  const dir = tempDir();
  const config = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
  const db = openGatewayDatabase(dir);
  let clock = new Date('2026-11-28T10:00:00.000Z');
  try {
    const tokens = createOAuthAdapterFactory({ db, config, now: () => clock })('AccessToken');
    await tokens.upsert('tok-1', { jti: 'tok-1', grantId: 'grant-1' }, 60);
    assert.equal((await tokens.find('tok-1'))?.jti, 'tok-1');

    clock = new Date('2026-11-28T10:01:01.000Z');
    assert.equal(await tokens.find('tok-1'), undefined);
    assert.equal(rowCount(db), 1);
  } finally {
    db.close();
    remove(dir);
  }
});

test('oauth storage: two SQLite connections consuming at once leave exactly one winner', async () => {
  const dir = tempDir();
  const s = store(dir);
  const workers: Worker[] = [];
  try {
    await s.factory('AuthorizationCode').upsert('code-race', { jti: 'code-race', grantId: 'grant-1' }, 300);
    const idHash = hashLookup('code-race');
    const dbPath = join(dir, GATEWAY_DB_FILE);
    const modulePath = createRequire(import.meta.url).resolve('better-sqlite3');
    const barrierBuffer = new SharedArrayBuffer(8);
    const barrier = new Int32Array(barrierBuffer);

    const script = `
      const { parentPort, workerData } = require('node:worker_threads');
      const Database = require(workerData.modulePath);
      const barrier = new Int32Array(workerData.barrierBuffer);
      const db = new Database(workerData.dbPath);
      db.pragma('busy_timeout = 5000');
      Atomics.add(barrier, 0, 1);
      Atomics.notify(barrier, 0);
      while (Atomics.load(barrier, 1) === 0) Atomics.wait(barrier, 1, 0);
      let message;
      try {
        const now = new Date().toISOString();
        const result = db.prepare(
          "UPDATE oauth_state SET consumed_at = ? WHERE model = ? AND id_hash = ? AND consumed_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)"
        ).run(now, workerData.model, workerData.idHash, now);
        message = { changes: result.changes };
      } catch (error) {
        message = { error: String(error && error.message ? error.message : error) };
      } finally {
        db.close();
      }
      parentPort.postMessage(message);
    `;

    const messages = [0, 1].map(
      () =>
        new Promise<{ changes?: number; error?: string }>((resolveMessage, rejectMessage) => {
          const worker = new Worker(script, {
            eval: true,
            workerData: { modulePath, dbPath, barrierBuffer, model: 'AuthorizationCode', idHash },
          });
          workers.push(worker);
          worker.once('message', resolveMessage);
          worker.once('error', rejectMessage);
        }),
    );

    const deadline = Date.now() + 5000;
    while (Atomics.load(barrier, 0) < 2) {
      if (Date.now() > deadline) throw new Error('workers did not reach the barrier');
      await wait(5);
    }
    Atomics.store(barrier, 1, 1);
    Atomics.notify(barrier, 1, 2);

    const results = await Promise.all(messages);
    assert.deepEqual(results.map((result) => result.changes ?? result.error).sort(), [0, 1]);
    assert.equal(row(s.db, 'AuthorizationCode', 'code-race').consumed_at !== null, true);
    assert.equal(await s.factory('AuthorizationCode').find('code-race'), undefined);
  } finally {
    for (const worker of workers) await worker.terminate();
    s.db.close();
    remove(dir);
  }
});

test('oauth storage: a crash after consume leaves the code dead and no token behind', async () => {
  const dir = tempDir();
  try {
    const first = store(dir);
    const codes = first.factory('AuthorizationCode');
    await codes.upsert('code-1', { jti: 'code-1', grantId: 'grant-1' }, 300);
    await codes.consume('code-1');
    // The process stops here, before the token exchange writes anything.
    first.db.close();

    const restarted = store(dir);
    assert.equal(await restarted.factory('AccessToken').find('tok-from-code-1'), undefined);
    assert.equal(await restarted.factory('AuthorizationCode').find('code-1'), undefined);
    await assert.rejects(
      restarted.factory('AuthorizationCode').consume('code-1'),
      (error: unknown) => error instanceof OAuthStateError && error.code === 'STATE_ALREADY_CONSUMED',
    );
    await assert.rejects(
      restarted.factory('AuthorizationCode').upsert('code-1', { jti: 'code-1', grantId: 'grant-1' }, 300),
      (error: unknown) => error instanceof OAuthStateError && error.code === 'STATE_CONSUMED',
    );

    // The store still works for a new exchange after the restart.
    await restarted.factory('AccessToken').upsert('tok-new', { jti: 'tok-new', grantId: 'grant-new' }, 3600);
    assert.equal((await restarted.factory('AccessToken').find('tok-new'))?.jti, 'tok-new');
    restarted.db.close();
  } finally {
    remove(dir);
  }
});

test('oauth storage: no raw token, code or verifier reaches the database, WAL or the log', async () => {
  const dir = tempDir();
  const logs: string[] = [];
  try {
    const config = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
    const db = openGatewayDatabase(dir);
    const factory = createOAuthAdapterFactory({ db, config, log: (line) => logs.push(line) });
    const rawToken = fakeSecret('raw-token');
    const rawCode = fakeSecret('raw-code');
    const rawVerifier = fakeSecret('raw-verifier');
    const rawSecret = fakeSecret('raw-client-secret');

    await factory('AccessToken').upsert(
      'tok-1',
      { jti: rawToken, grantId: 'grant-1', clientId: 'lab-demo', codeChallenge: rawVerifier, extra: { clientSecret: rawSecret } },
      3600,
    );
    await factory('AuthorizationCode').upsert('code-1', { jti: rawCode, grantId: 'grant-1', codeChallenge: rawVerifier }, 300);

    // Force a refusal so the log has a line, then prove the line carries no secret.
    const stored = row(db, 'AccessToken', 'tok-1');
    db.prepare(`UPDATE ${OAUTH_STATE_TABLE} SET payload = ? WHERE model = 'AccessToken' AND id_hash = ?`).run(
      flipCiphertext(stored.payload),
      stored.id_hash,
    );
    assert.equal(await factory('AccessToken').find('tok-1'), undefined);
    assert.equal(logs.length, 1);

    db.pragma('wal_checkpoint(TRUNCATE)');
    const secrets = [rawToken, rawCode, rawVerifier, rawSecret];
    const files = readdirSync(dir).filter((name) => name.startsWith(GATEWAY_DB_FILE));
    assert.ok(files.includes(GATEWAY_DB_FILE), 'the database file exists');
    for (const name of files) {
      const bytes = readFileSync(join(dir, name));
      for (const secret of secrets) {
        assert.equal(bytes.includes(Buffer.from(secret, 'utf8')), false, `${name} must not contain a generated secret`);
      }
    }
    const keyFile = readFileSync(config.path, 'utf8');
    for (const secret of secrets) assert.equal(keyFile.includes(secret), false, 'the key file holds no token');
    for (const secret of secrets) assert.equal(logs.join('\n').includes(secret), false, 'the log holds no token');
    db.close();
  } finally {
    remove(dir);
  }
});
