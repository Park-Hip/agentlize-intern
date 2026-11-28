import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** The stored envelope version and shape: `enc:v1:<keyId>:<iv>:<tag>:<ciphertext>`. */
export const ENVELOPE_PREFIX = 'enc:v1:';
export const ENVELOPE_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface StateEncryptionKey {
  readonly keyId: string;
  /** Exactly 32 bytes. */
  readonly key: Buffer;
}

/** A stored payload that cannot be opened: wrong key, wrong AAD or a changed ciphertext. */
export class OAuthStateCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthStateCryptoError';
  }
}

/**
 * The extra authenticated data binds a row to its model and its hashed lookup
 * key. Moving a row to another model, or pointing it at another id, makes the
 * tag fail instead of returning someone else's payload.
 */
export function envelopeAad(model: string, idHash: string): Buffer {
  return Buffer.from(JSON.stringify({ model, id: idHash }), 'utf8');
}

/** Encrypt one payload with a fresh random nonce. The key id travels with it so a rotated key can be named. */
export function encryptState(key: StateEncryptionKey, model: string, idHash: string, payload: unknown): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.key, iv);
  cipher.setAAD(envelopeAad(model, idHash));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_PREFIX}${key.keyId}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

/**
 * Open one payload. Any failure throws a typed error with no payload in its
 * message; the adapter turns that into "not found" and leaves the row alone.
 */
export function decryptState(key: StateEncryptionKey, model: string, idHash: string, envelope: string): unknown {
  if (!envelope.startsWith(ENVELOPE_PREFIX)) throw new OAuthStateCryptoError('unknown envelope prefix');
  const parts = envelope.slice(ENVELOPE_PREFIX.length).split(':');
  if (parts.length !== 4) throw new OAuthStateCryptoError('malformed envelope');
  const [keyId, ivText, tagText, ciphertextText] = parts;
  if (keyId === undefined || ivText === undefined || tagText === undefined || ciphertextText === undefined) {
    throw new OAuthStateCryptoError('malformed envelope');
  }
  if (keyId !== key.keyId) throw new OAuthStateCryptoError('envelope was written with another key id');

  const iv = Buffer.from(ivText, 'base64url');
  const tag = Buffer.from(tagText, 'base64url');
  const ciphertext = Buffer.from(ciphertextText, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new OAuthStateCryptoError('malformed envelope');

  const decipher = createDecipheriv(ALGORITHM, key.key, iv);
  decipher.setAAD(envelopeAad(model, idHash));
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new OAuthStateCryptoError('ciphertext failed authentication');
  }
  try {
    return JSON.parse(plaintext.toString('utf8')) as unknown;
  } catch {
    throw new OAuthStateCryptoError('plaintext is not JSON');
  }
}
