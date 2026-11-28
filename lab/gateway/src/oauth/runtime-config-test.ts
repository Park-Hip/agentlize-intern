import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  loadOAuthRuntimeConfig,
  OAUTH_ENCRYPTION_KEY_BYTES,
  OAUTH_KEY_FILE_ENV,
  OAuthConfigError,
  resolveKeyFilePath,
} from './runtime-config.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'lab-oauth-config-'));
}

function remove(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

test('runtime config: a first start generates every secret outside the database file', () => {
  const dir = tempDir();
  try {
    const config = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo', 'lab-demo-two'] });
    assert.equal(config.source, 'generated');
    assert.match(config.keyId, /^ok-[0-9a-f]+$/);
    assert.equal(config.encryptionKey.length, OAUTH_ENCRYPTION_KEY_BYTES);
    assert.ok(config.cookieKeys.length >= 1);
    assert.equal(typeof config.signingKey['kty'], 'string');
    assert.equal(typeof config.clientSecrets['lab-demo'], 'string');
    assert.equal(typeof config.clientSecrets['lab-demo-two'], 'string');
    assert.equal(config.path, join(dir, 'oauth-keys', 'keys.json'));
    assert.equal(config.path.endsWith('gateway.sqlite'), false);
    assert.equal(existsSync(config.path), true);
  } finally {
    remove(dir);
  }
});

test('runtime config: a restart reads the same key and the same client secrets, without regenerating', () => {
  const dir = tempDir();
  try {
    const first = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
    const second = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
    assert.equal(second.source, 'file');
    assert.equal(second.keyId, first.keyId);
    assert.deepEqual(second.encryptionKey, first.encryptionKey);
    assert.deepEqual(second.cookieKeys, first.cookieKeys);
    assert.deepEqual(second.signingKey, first.signingKey);
    assert.deepEqual(second.clientSecrets, first.clientSecrets);
  } finally {
    remove(dir);
  }
});

test('runtime config: stored state without a key file stops instead of generating a replacement', () => {
  const dir = tempDir();
  try {
    const path = resolveKeyFilePath({ dataDir: dir });
    assert.throws(
      () => loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'], hasStoredState: () => true }),
      (error: unknown) => error instanceof OAuthConfigError && /refusing to generate a replacement key/.test(error.message),
    );
    assert.equal(existsSync(path), false, 'no replacement file was written');
  } finally {
    remove(dir);
  }
});

test('runtime config: a broken file is refused and left untouched', () => {
  const dir = tempDir();
  try {
    const first = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
    const broken = '{ this is not json';
    writeFileSync(first.path, broken, 'utf8');

    assert.throws(
      () => loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] }),
      (error: unknown) => error instanceof OAuthConfigError && /not valid JSON/.test(error.message),
    );
    assert.equal(readFileSync(first.path, 'utf8'), broken, 'the file was not rewritten');
  } finally {
    remove(dir);
  }
});

test('runtime config: a missing client secret is refused, not generated in place', () => {
  const dir = tempDir();
  try {
    loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
    assert.throws(
      () => loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo', 'lab-demo-two'] }),
      (error: unknown) => error instanceof OAuthConfigError && /no client secret for lab-demo-two/.test(error.message),
    );
  } finally {
    remove(dir);
  }
});

test('runtime config: an encryption key of the wrong size is refused', () => {
  const dir = tempDir();
  try {
    const first = loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] });
    const text = JSON.parse(readFileSync(first.path, 'utf8')) as Record<string, unknown>;
    writeFileSync(first.path, JSON.stringify({ ...text, encryptionKey: Buffer.from('short').toString('base64') }), 'utf8');
    assert.throws(
      () => loadOAuthRuntimeConfig({ dataDir: dir, clientIds: ['lab-demo'] }),
      (error: unknown) => error instanceof OAuthConfigError && /32 bytes/.test(error.message),
    );
  } finally {
    remove(dir);
  }
});

test('runtime config: the environment can move the key file away from the data dir', () => {
  const dir = tempDir();
  try {
    const custom = join(dir, 'private', 'oauth.json');
    const env = { [OAUTH_KEY_FILE_ENV]: custom } as unknown as NodeJS.ProcessEnv;
    assert.equal(resolveKeyFilePath({ env, dataDir: join(dir, 'data') }), custom);
    const config = loadOAuthRuntimeConfig({ env, dataDir: join(dir, 'data'), clientIds: ['lab-demo'] });
    assert.equal(config.path, custom);
    assert.equal(existsSync(custom), true);
  } finally {
    remove(dir);
  }
});
