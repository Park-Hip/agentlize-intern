import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DATA_DIR_ENV, KEY_PREFIX_LENGTH } from '@lab/shared';
import { runKeysCli, UsageError } from '../cli/keys.js';
import { seedKeys } from '../cli/seed-keys.js';
import { GATEWAY_DB_FILE, openGatewayDatabase } from '../database.js';
import { KeyStore, hashKey } from './key-store.js';
import { PAGE_PASSWORD_PREFIX, PagePasswordStore } from './page-password-store.js';

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'cli');
const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lab-page-password-'));
  tempDirs.push(dir);
  return dir;
}

interface Fixture {
  readonly dir: string;
  readonly keys: KeyStore;
  readonly pagePasswords: PagePasswordStore;
  close(): void;
}

function fixture(): Fixture {
  const dir = tempDir();
  const db = openGatewayDatabase(dir);
  return {
    dir,
    keys: new KeyStore(db),
    pagePasswords: new PagePasswordStore(db),
    close: () => db.close(),
  };
}

test('page password: a raw password is trang_ plus 32 random bytes, and only its hash and prefix are stored', () => {
  const f = fixture();
  const issued = f.pagePasswords.issue({ employeeId: 'NV-07' });

  assert.match(issued.rawPassword, /^trang_[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(issued.rawPassword.slice(PAGE_PASSWORD_PREFIX.length), 'base64url').length, 32);
  assert.equal(issued.record.passwordHash, hashKey(issued.rawPassword));
  assert.equal(issued.record.passwordPrefix, issued.rawPassword.slice(0, KEY_PREFIX_LENGTH));
  assert.equal(issued.record.employeeId, 'NV-07');
  assert.equal(issued.record.revokedAt, null);
  assert.match(issued.record.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(f.pagePasswords.findByRawPassword(issued.rawPassword)?.passwordId, issued.record.passwordId);
  assert.deepEqual(
    f.pagePasswords.findByRawPassword(`${issued.rawPassword.slice(0, -1)}${issued.rawPassword.endsWith('A') ? 'B' : 'A'}`),
    undefined,
  );
  assert.equal(f.pagePasswords.findByRawPassword(`lab_${issued.rawPassword.slice(PAGE_PASSWORD_PREFIX.length)}`), undefined);
  assert.throws(() => f.pagePasswords.issue({ employeeId: 'hoa@lab.example' }), /employee code/);
  f.close();
});

test('page password: revoking twice keeps the first time, and reissuing revokes the old password of that person', () => {
  const f = fixture();
  const first = f.pagePasswords.issue({ employeeId: 'NV-02' });
  const other = f.pagePasswords.issue({ employeeId: 'NV-03' });

  assert.equal(f.pagePasswords.revoke(first.record.passwordId), true);
  assert.equal(f.pagePasswords.revoke(first.record.passwordId), true);
  assert.notEqual(f.pagePasswords.findById(first.record.passwordId)?.revokedAt, null);
  assert.equal(f.pagePasswords.findById(other.record.passwordId)?.revokedAt, null);
  assert.equal(f.pagePasswords.revoke('pwd-does-not-exist'), false);

  const second = f.pagePasswords.issue({ employeeId: 'NV-02' });
  assert.equal(f.pagePasswords.revokeActiveForEmployee('NV-02'), 1);
  assert.notEqual(f.pagePasswords.findById(second.record.passwordId)?.revokedAt, null);
  assert.equal(f.pagePasswords.findById(other.record.passwordId)?.revokedAt, null);
  f.close();
});

test('page password: the SQLite files hold the hash but never a raw page password', () => {
  const f = fixture();
  const issued = f.pagePasswords.issue({ employeeId: 'NV-07' });
  f.close();

  for (const file of readdirSync(f.dir)) {
    const bytes = readFileSync(join(f.dir, file));
    assert.equal(bytes.includes(Buffer.from(issued.rawPassword, 'utf8')), false, `${file} holds a raw page password`);
    assert.equal(
      bytes.includes(Buffer.from(issued.rawPassword.slice(PAGE_PASSWORD_PREFIX.length), 'utf8')),
      false,
      `${file} holds the page password body`,
    );
  }
  assert.equal(
    readFileSync(join(f.dir, GATEWAY_DB_FILE)).includes(Buffer.from(issued.record.passwordHash)),
    true,
  );
});

test('page password: the keys command prints it once, shows it in no list, and replaces the previous one', () => {
  const f = fixture();
  const lines: string[] = [];
  const io = { out: (line: string): void => void lines.push(line) };

  runKeysCli(['page-password', '--employee', 'NV-07'], f.keys, f.pagePasswords, io);
  const first = /^password: {4}(\S+)$/m.exec(lines.join('\n'))?.[1] ?? '';
  assert.match(first, /^trang_[A-Za-z0-9_-]{43}$/);
  assert.equal(lines.join('\n').split(first).length - 1, 1, 'raw page password printed more than once');

  lines.length = 0;
  runKeysCli(['page-password', '--employee', 'NV-07'], f.keys, f.pagePasswords, io);
  const second = /^password: {4}(\S+)$/m.exec(lines.join('\n'))?.[1] ?? '';
  assert.notEqual(second, first);
  assert.notEqual(f.pagePasswords.findByRawPassword(first)?.revokedAt, null);
  assert.equal(f.pagePasswords.findByRawPassword(second)?.revokedAt, null);

  lines.length = 0;
  runKeysCli(['list'], f.keys, f.pagePasswords, io);
  assert.equal(lines.join('\n').includes(first), false);
  assert.equal(lines.join('\n').includes(second), false);

  assert.throws(() => runKeysCli(['page-password'], f.keys, f.pagePasswords, io), UsageError);
  f.close();
});

test('page password: the npm command ends to end and leaves no raw page password on disk', () => {
  const dir = tempDir();
  const env = { ...process.env, [DATA_DIR_ENV]: dir };
  const run = (...args: string[]): { status: number | null; stdout: string; stderr: string } => {
    const result = spawnSync(process.execPath, [join(cliDir, 'keys-main.js'), ...args], { env, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  const issued = run('page-password', '--employee', 'NV-07');
  assert.equal(issued.status, 0, issued.stderr);
  const rawPassword = /^password: {4}(\S+)$/m.exec(issued.stdout)?.[1] ?? '';
  assert.match(rawPassword, /^trang_[A-Za-z0-9_-]{43}$/);
  const passwordId = /^password_id: (\S+)$/m.exec(issued.stdout)?.[1] ?? '';
  assert.match(passwordId, /^pwd-[0-9a-f]{10}$/);

  const reissued = run('page-password', '--employee', 'NV-07');
  assert.equal(reissued.status, 0, reissued.stderr);
  assert.match(reissued.stdout, /Revoked 1 active page password/);

  for (const file of readdirSync(dir)) {
    assert.equal(readFileSync(join(dir, file)).includes(Buffer.from(rawPassword)), false, `${file} holds the raw page password`);
  }
});

test('page password: seed-keys prints both values, refuses a second run, and rotates both', () => {
  const f = fixture();
  const lines: string[] = [];
  const io = { out: (line: string): void => void lines.push(line) };

  seedKeys(f.keys, f.pagePasswords, io);
  const row = lines.find((line) => line.startsWith('hoa  ')) ?? '';
  const cells = row.split('  ');
  const rawKey = cells[3] ?? '';
  const rawPassword = cells[5] ?? '';
  assert.match(rawKey, /^lab_/);
  assert.match(rawPassword, /^trang_/);
  assert.equal(f.keys.findByRawKey(rawKey)?.employeeId, 'NV-02');
  assert.equal(f.pagePasswords.findByRawPassword(rawPassword)?.employeeId, 'NV-02');

  assert.throws(() => seedKeys(f.keys, f.pagePasswords, io), /--rotate/);
  seedKeys(f.keys, f.pagePasswords, { out: () => undefined }, { rotate: true });
  assert.equal(f.keys.findByRawKey(rawKey)?.revokedAt === null, false);
  assert.notEqual(f.pagePasswords.findByRawPassword(rawPassword)?.revokedAt, null);
  f.close();
});
