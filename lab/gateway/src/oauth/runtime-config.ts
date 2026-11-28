import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { resolveDataDir } from '../database.js';

/** Points the OAuth key file somewhere other than `<data dir>/oauth-keys/keys.json`. */
export const OAUTH_KEY_FILE_ENV = 'LAB_OAUTH_KEY_FILE';

export const OAUTH_ENCRYPTION_KEY_BYTES = 32;
export const OAUTH_KEY_FILE_VERSION = 1;
export const OAUTH_KEY_DIR_NAME = 'oauth-keys';
export const OAUTH_KEY_FILE_NAME = 'keys.json';

/**
 * A configuration problem that must stop the gateway instead of being papered
 * over. The message never carries a key, a secret or a stored payload.
 */
export class OAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthConfigError';
  }
}

/**
 * The secrets the OAuth side needs, loaded from a file outside SQLite and git
 * (ADR-0011 section 3.1). `encryptionKey` protects every stored provider
 * payload, `cookieKeys` and `signingKey` protect the provider's cookies and
 * tokens, and `clientSecrets` authenticate the registered clients.
 */
export interface OAuthRuntimeConfig {
  /** Identifies the encryption key; every stored envelope names it. */
  readonly keyId: string;
  /** Exactly 32 bytes for AES-256-GCM. */
  readonly encryptionKey: Buffer;
  readonly cookieKeys: readonly string[];
  readonly signingKey: Readonly<Record<string, unknown>>;
  readonly clientSecrets: Readonly<Record<string, string>>;
  /** `generated` means this call created the file, so the caller knows not to expect it next time. */
  readonly source: 'file' | 'generated';
  readonly path: string;
}

export interface LoadRuntimeConfigOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Defaults to the gateway data dir. */
  readonly dataDir?: string;
  /** Overrides the path, for a test that keeps its keys in its own temp dir. */
  readonly keyFilePath?: string;
  /** A secret is generated for each of these when the file is created; an existing file must hold them all. */
  readonly clientIds?: readonly string[];
  /**
   * True when the gateway database already holds OAuth state. A missing key
   * file then stops the gateway instead of generating a replacement that
   * would silently orphan every stored record.
   */
  readonly hasStoredState?: () => boolean;
  readonly now?: () => Date;
}

interface KeyFile {
  readonly version: number;
  readonly keyId: string;
  readonly encryptionKey: string;
  readonly cookieKeys: readonly string[];
  readonly signingKey: Readonly<Record<string, unknown>>;
  readonly clientSecrets: Readonly<Record<string, string>>;
  readonly createdAt: string;
}

/** Where the key file lives: the env value, else `<data dir>/oauth-keys/keys.json`. */
export function resolveKeyFilePath(options: LoadRuntimeConfigOptions = {}): string {
  const env = options.env ?? process.env;
  const configured = env[OAUTH_KEY_FILE_ENV]?.trim();
  if (configured !== undefined && configured !== '') return resolve(configured);
  const dataDir = options.dataDir ?? resolveDataDir(env);
  return join(dataDir, OAUTH_KEY_DIR_NAME, OAUTH_KEY_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** The key id ends up inside the envelope, so a colon or whitespace would break it. */
function validKeyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\s:]/.test(value);
}

function decodeEncryptionKey(text: string): Buffer | undefined {
  const key = Buffer.from(text, 'base64');
  return key.length === OAUTH_ENCRYPTION_KEY_BYTES ? key : undefined;
}

function checkKeyFile(value: unknown, path: string, clientIds: readonly string[]): KeyFile {
  if (!isRecord(value)) throw new OAuthConfigError(`OAuth key file ${path} must hold a JSON object`);
  if (value['version'] !== OAUTH_KEY_FILE_VERSION) {
    throw new OAuthConfigError(`OAuth key file ${path} has an unsupported version`);
  }
  if (!validKeyId(value['keyId'])) throw new OAuthConfigError(`OAuth key file ${path} has no usable key id`);
  if (typeof value['encryptionKey'] !== 'string' || decodeEncryptionKey(value['encryptionKey']) === undefined) {
    throw new OAuthConfigError(
      `OAuth key file ${path} must hold a base64 encryption key of ${OAUTH_ENCRYPTION_KEY_BYTES} bytes`,
    );
  }
  const cookieKeys = value['cookieKeys'];
  if (!Array.isArray(cookieKeys) || cookieKeys.length === 0 || !cookieKeys.every(nonEmptyString)) {
    throw new OAuthConfigError(`OAuth key file ${path} must hold at least one cookie key`);
  }
  if (!isRecord(value['signingKey']) || !nonEmptyString(value['signingKey']['kty'])) {
    throw new OAuthConfigError(`OAuth key file ${path} has no usable signing key`);
  }
  if (!isRecord(value['clientSecrets']) || !Object.values(value['clientSecrets']).every(nonEmptyString)) {
    throw new OAuthConfigError(`OAuth key file ${path} has no usable client secret map`);
  }
  const clientSecrets = value['clientSecrets'] as Record<string, string>;
  for (const clientId of clientIds) {
    if (!nonEmptyString(clientSecrets[clientId])) {
      throw new OAuthConfigError(
        `OAuth key file ${path} has no client secret for ${clientId}; it will not be generated in place`,
      );
    }
  }
  return {
    version: OAUTH_KEY_FILE_VERSION,
    keyId: value['keyId'],
    encryptionKey: value['encryptionKey'],
    cookieKeys: [...cookieKeys],
    signingKey: { ...(value['signingKey'] as Record<string, unknown>) },
    clientSecrets: { ...clientSecrets },
    createdAt: nonEmptyString(value['createdAt']) ? value['createdAt'] : '',
  };
}

function generateKeyFile(clientIds: readonly string[], now: () => Date): KeyFile {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const clientSecrets: Record<string, string> = {};
  for (const clientId of clientIds) clientSecrets[clientId] = randomBytes(32).toString('base64url');
  return {
    version: OAUTH_KEY_FILE_VERSION,
    keyId: `ok-${randomBytes(4).toString('hex')}`,
    encryptionKey: randomBytes(OAUTH_ENCRYPTION_KEY_BYTES).toString('base64'),
    cookieKeys: [randomBytes(32).toString('base64url')],
    signingKey: privateKey.export({ format: 'jwk' }) as Record<string, unknown>,
    clientSecrets,
    createdAt: now().toISOString(),
  };
}

/** Write with an owner-only mode, through a temp file so a crash never leaves half a key file. */
function writeKeyFile(path: string, file: KeyFile): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function toConfig(file: KeyFile, path: string, source: OAuthRuntimeConfig['source']): OAuthRuntimeConfig {
  const encryptionKey = decodeEncryptionKey(file.encryptionKey);
  if (encryptionKey === undefined) throw new OAuthConfigError(`OAuth key file ${path} lost its encryption key`);
  return {
    keyId: file.keyId,
    encryptionKey,
    cookieKeys: [...file.cookieKeys],
    signingKey: { ...file.signingKey },
    clientSecrets: { ...file.clientSecrets },
    source,
    path,
  };
}

/**
 * Load the runtime secrets, or create them once when there is nothing to
 * protect yet. Existing state plus a missing or broken file is a hard stop:
 * generating a new key would make every stored provider record unreadable
 * without saying so.
 */
export function loadOAuthRuntimeConfig(options: LoadRuntimeConfigOptions = {}): OAuthRuntimeConfig {
  const path = resolveKeyFilePath(options);
  const clientIds = options.clientIds ?? [];
  const now = options.now ?? (() => new Date());

  if (!existsSync(path)) {
    if (options.hasStoredState?.() === true) {
      throw new OAuthConfigError(
        `OAuth key file ${path} is missing while the database holds OAuth state; refusing to generate a replacement key`,
      );
    }
    const file = generateKeyFile(clientIds, now);
    writeKeyFile(path, file);
    return toConfig(file, path, 'generated');
  }

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new OAuthConfigError(`OAuth key file ${path} could not be read`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OAuthConfigError(`OAuth key file ${path} is not valid JSON`);
  }
  return toConfig(checkKeyFile(parsed, path, clientIds), path, 'file');
}
