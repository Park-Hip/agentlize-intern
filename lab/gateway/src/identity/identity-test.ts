import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DATA_DIR_ENV, KEY_PREFIX_LENGTH, maskKey } from '@lab/shared';
import { runKeysCli, UsageError } from '../cli/keys.js';
import { SEED_IDENTITIES, seedKeys } from '../cli/seed-keys.js';
import { GATEWAY_DB_FILE, openGatewayDatabase, resolveDataDir } from '../database.js';
import {
  ApiKeyIdentity,
  KeyStore,
  hashKey,
  hashesEqual,
  readBearerKey,
  type IdentityProvider,
} from './index.js';

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'cli');
const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lab-identity-'));
  tempDirs.push(dir);
  return dir;
}

interface Fixture {
  readonly dir: string;
  readonly store: KeyStore;
  readonly provider: IdentityProvider;
  close(): void;
}

function fixture(): Fixture {
  const dir = tempDir();
  const db = openGatewayDatabase(dir);
  const store = new KeyStore(db);
  return { dir, store, provider: new ApiKeyIdentity(store), close: () => db.close() };
}

const bearer = (key: string): { authorization: string } => ({ authorization: `Bearer ${key}` });

test('identity: an issued key is recognised as exactly its owner', async () => {
  const f = fixture();
  const hoa = f.store.issue({ employeeId: 'NV-07', caller: 'tho-than-desktop' });
  const nam = f.store.issue({ employeeId: 'NV-12', caller: 'fc-assistant', scope: 'read_only' });

  assert.deepEqual(await f.provider.authenticate(bearer(hoa.rawKey)), {
    ok: true,
    identity: { employeeId: 'NV-07', caller: 'tho-than-desktop', scope: 'full', keyId: hoa.record.keyId },
  });
  assert.deepEqual(await f.provider.authenticate(bearer(nam.rawKey)), {
    ok: true,
    identity: { employeeId: 'NV-12', caller: 'fc-assistant', scope: 'read_only', keyId: nam.record.keyId },
  });
  f.close();
});

test('identity: the result carries no role or department', async () => {
  const f = fixture();
  const issued = f.store.issue({ employeeId: 'NV-07', caller: 'test' });
  const result = await f.provider.authenticate(bearer(issued.rawKey));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(Object.keys(result.identity).sort(), ['caller', 'employeeId', 'keyId', 'scope']);
  f.close();
});

test('identity: a wrong, missing or malformed key gives KEY_INVALID', async () => {
  const f = fixture();
  const issued = f.store.issue({ employeeId: 'NV-07', caller: 'test' });
  const tampered = `${issued.rawKey.slice(0, -1)}${issued.rawKey.endsWith('A') ? 'B' : 'A'}`;

  for (const headers of [
    bearer(tampered),
    bearer('lab_not-a-real-key'),
    bearer(''),
    {},
    { authorization: issued.rawKey },
    { authorization: `Basic ${issued.rawKey}` },
    { authorization: [`Bearer ${issued.rawKey}`, `Bearer ${issued.rawKey}`] },
    { authorization: undefined },
  ]) {
    assert.deepEqual(await f.provider.authenticate(headers), { ok: false, reason: 'KEY_INVALID' });
  }
  f.close();
});

test('identity: a revoked key gives KEY_REVOKED on the very next call and spares other keys', async () => {
  const f = fixture();
  const hoa = f.store.issue({ employeeId: 'NV-07', caller: 'tho-than-desktop' });
  const hoaSecond = f.store.issue({ employeeId: 'NV-07', caller: 'test' });

  assert.equal((await f.provider.authenticate(bearer(hoa.rawKey))).ok, true);
  assert.equal(f.store.revoke(hoa.record.keyId), true);

  assert.deepEqual(await f.provider.authenticate(bearer(hoa.rawKey)), { ok: false, reason: 'KEY_REVOKED' });
  assert.equal((await f.provider.authenticate(bearer(hoaSecond.rawKey))).ok, true);
  f.close();
});

test('identity: revoking twice keeps the first time, and an unknown key code is reported', () => {
  const dir = tempDir();
  const db = openGatewayDatabase(dir);
  const times = [new Date('2026-11-17T10:00:00Z'), new Date('2026-11-17T11:00:00Z'), new Date('2026-11-17T12:00:00Z')];
  const store = new KeyStore(db, () => times.shift() ?? new Date('2026-11-18T00:00:00Z'));

  const issued = store.issue({ employeeId: 'NV-07', caller: 'test' });
  assert.equal(store.revoke(issued.record.keyId), true);
  assert.equal(store.revoke(issued.record.keyId), true);
  assert.equal(store.list()[0]?.revokedAt, '2026-11-17T11:00:00.000Z');
  assert.equal(store.revoke('key-does-not-exist'), false);
  db.close();
});

test('identity: a key is lab_ plus 32 random bytes in base64url', () => {
  const f = fixture();
  const keys = Array.from({ length: 20 }, () => f.store.issue({ employeeId: 'NV-07', caller: 'test' }).rawKey);

  for (const key of keys) {
    assert.match(key, /^lab_[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(key.slice(4), 'base64url').length, 32);
  }
  assert.equal(new Set(keys).size, keys.length);
  f.close();
});

test('identity: the key table holds the columns the spec lists and rejects bad values', () => {
  const f = fixture();
  const issued = f.store.issue({ employeeId: 'NV-07', caller: 'test', scope: 'read_only' });

  assert.equal(issued.record.keyHash, hashKey(issued.rawKey));
  assert.equal(issued.record.keyPrefix, issued.rawKey.slice(0, KEY_PREFIX_LENGTH));
  assert.equal(issued.record.revokedAt, null);
  assert.match(issued.record.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  assert.throws(() => f.store.issue({ employeeId: 'NV-07', caller: 'laptop' }), /caller must be one of/);
  assert.throws(() => f.store.issue({ employeeId: 'NV-07', caller: 'test', scope: 'admin' }), /scope must be one of/);
  assert.throws(() => f.store.issue({ employeeId: 'hoa@lab.example', caller: 'test' }), /employee code/);
  f.close();
});

test('identity: hashes compare in constant time and reject different lengths', () => {
  const a = hashKey('lab_a');
  assert.equal(hashesEqual(a, hashKey('lab_a')), true);
  assert.equal(hashesEqual(a, hashKey('lab_b')), false);
  assert.equal(hashesEqual(a, a.slice(0, -2)), false);
});

test('identity: readBearerKey accepts one Bearer header in any letter case', () => {
  assert.equal(readBearerKey({ authorization: 'Bearer abc' }), 'abc');
  assert.equal(readBearerKey({ authorization: 'bearer   abc ' }), 'abc');
  assert.equal(readBearerKey({ authorization: 'Bearer a b' }), undefined);
  assert.equal(readBearerKey({}), undefined);
});

test('identity: scanning the SQLite files finds the hash but never a raw key', () => {
  const f = fixture();
  const rawKeys = SEED_IDENTITIES.map(
    (identity) => f.store.issue({ employeeId: identity.employeeId, caller: 'tho-than-desktop' }).rawKey,
  );
  const sample = f.store.issue({ employeeId: 'NV-07', caller: 'test' });
  f.store.revoke(sample.record.keyId);
  f.close();

  const files = readdirSync(f.dir);
  assert.ok(files.includes(GATEWAY_DB_FILE));
  for (const file of files) {
    const bytes = readFileSync(join(f.dir, file));
    for (const rawKey of [...rawKeys, sample.rawKey]) {
      assert.equal(bytes.includes(Buffer.from(rawKey, 'utf8')), false, `${file} holds a raw key`);
      assert.equal(bytes.includes(Buffer.from(rawKey.slice(4), 'utf8')), false, `${file} holds the key body`);
    }
  }
  assert.equal(readFileSync(join(f.dir, GATEWAY_DB_FILE)).includes(Buffer.from(sample.record.keyHash)), true);
});

test('identity: the shared mask shows six characters and the length, nothing more', () => {
  const key = 'lab_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE';
  assert.equal(maskKey(key), `lab_Ab...(len=${key.length})`);
  assert.equal(maskKey('short'), '***...(len=5)');
  assert.equal(maskKey('12345678'), '***...(len=8)');
  assert.equal(maskKey('123456789'), '123456...(len=9)');
  assert.equal(maskKey(key).includes(key.slice(KEY_PREFIX_LENGTH)), false);
});

test('identity: the keys command prints a raw key once and list shows only six characters', () => {
  const f = fixture();
  const lines: string[] = [];
  const io = { out: (line: string): void => void lines.push(line) };

  runKeysCli(['issue', '--employee', 'NV-07', '--caller', 'tho-than-desktop'], f.store, io);
  const rawKey = /^key: {6}(\S+)$/m.exec(lines.join('\n'))?.[1] ?? '';
  assert.ok(rawKey.startsWith('lab_'));
  assert.equal(lines.join('\n').split(rawKey).length - 1, 1, 'raw key printed more than once');
  assert.equal(lines.join('\n').includes(maskKey(rawKey)), true);

  lines.length = 0;
  runKeysCli(['list'], f.store, io);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.includes(rawKey), false);
  assert.match(lines[0] ?? '', new RegExp(`${rawKey.slice(0, KEY_PREFIX_LENGTH)}\\.\\.\\.`));
  assert.match(lines[0] ?? '', /NV-07 {2}tho-than-desktop {2}full/);

  const keyId = f.store.list()[0]?.keyId ?? '';
  lines.length = 0;
  runKeysCli(['revoke', '--key-id', keyId], f.store, io);
  assert.deepEqual(lines, [`revoked ${keyId}`]);
  runKeysCli(['list'], f.store, io);
  assert.match(lines[1] ?? '', /revoked 20\d\d-/);

  assert.throws(() => runKeysCli(['revoke', '--key-id', 'key-nope'], f.store, io), UsageError);
  assert.throws(() => runKeysCli(['issue', '--employee', 'NV-07'], f.store, io), UsageError);
  assert.throws(() => runKeysCli(['frobnicate'], f.store, io), UsageError);
  f.close();
});

test('identity: the npm keys command end to end leaves no raw key on disk or in list output', () => {
  const dir = tempDir();
  const env = { ...process.env, [DATA_DIR_ENV]: dir };
  const run = (...args: string[]): { status: number | null; stdout: string; stderr: string } => {
    const result = spawnSync(process.execPath, [join(cliDir, 'keys-main.js'), ...args], { env, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  const issued = run('issue', '--employee', 'NV-07', '--caller', 'test', '--scope', 'read_only');
  assert.equal(issued.status, 0, issued.stderr);
  const rawKey = /^key: {6}(\S+)$/m.exec(issued.stdout)?.[1] ?? '';
  assert.match(rawKey, /^lab_[A-Za-z0-9_-]{43}$/);
  assert.equal(resolveDataDir(env), dir);

  const listed = run('list');
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout.includes(rawKey), false);
  assert.match(listed.stdout, /read_only/);

  const keyId = /^key_id: {3}(\S+)$/m.exec(issued.stdout)?.[1] ?? '';
  assert.equal(run('revoke', '--key-id', keyId).status, 0);
  assert.match(run('list').stdout, /revoked/);

  const bad = run('issue', '--employee', 'NV-07', '--caller', 'laptop');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /caller must be one of/);
  assert.equal(bad.stdout.includes('lab_'), false);

  for (const file of readdirSync(dir)) {
    assert.equal(readFileSync(join(dir, file)).includes(Buffer.from(rawKey)), false, `${file} holds the raw key`);
  }
});

test('identity: seed-keys issues one key per persona plus the guest, once, and rotates on request', async () => {
  const f = fixture();
  const lines: string[] = [];
  const io = { out: (line: string): void => void lines.push(line) };

  seedKeys(f.store, io);
  const rows = lines.filter((line) => line.includes('lab_'));
  assert.equal(rows.length, 7);
  assert.equal(SEED_IDENTITIES.length, 7);
  assert.ok(SEED_IDENTITIES.some((identity) => identity.name === 'khach'));
  assert.equal(new Set(f.store.list().map((record) => record.employeeId)).size, 7);

  const printed = new Map<string, string>();
  for (const row of rows) {
    const [slug, , , key] = row.split('  ');
    printed.set(slug ?? '', key ?? '');
  }
  for (const identity of SEED_IDENTITIES) {
    const result = await f.provider.authenticate(bearer(printed.get(identity.name) ?? ''));
    assert.equal(result.ok && result.identity.employeeId, identity.employeeId);
  }

  assert.throws(() => seedKeys(f.store, io), /--rotate/);
  assert.equal(f.store.list().length, 7);

  seedKeys(f.store, { out: () => undefined }, { rotate: true });
  assert.deepEqual(await f.provider.authenticate(bearer(printed.get('hoa') ?? '')), {
    ok: false,
    reason: 'KEY_REVOKED',
  });
  assert.equal(f.store.list().length, 14);
  f.close();
});

test('identity: a provider can be swapped without touching its callers', async () => {
  const fixed: IdentityProvider = {
    authenticate: () =>
      Promise.resolve({
        ok: true,
        identity: { employeeId: 'NV-03', caller: 'test', scope: 'full', keyId: 'key-fixed' },
      }),
  };
  const who = async (provider: IdentityProvider): Promise<string | undefined> => {
    const result = await provider.authenticate({});
    return result.ok ? result.identity.employeeId : undefined;
  };
  assert.equal(await who(fixed), 'NV-03');
});
