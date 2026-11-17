import type { KeyStore } from './key-store.js';
import type { IdentityHeaders, IdentityProvider, IdentityResult } from './types.js';

const BEARER = /^Bearer[ \t]+(\S+)$/i;

/** Pull the raw key out of the `Authorization` header, or undefined when it is missing or malformed. */
export function readBearerKey(headers: IdentityHeaders): string | undefined {
  const header = headers['authorization'];
  const value = Array.isArray(header) ? (header.length === 1 ? header[0] : undefined) : header;
  if (value === undefined) return undefined;
  return BEARER.exec(value.trim())?.[1];
}

/**
 * Turns a per-person Bearer key into an employee code. The store is read on
 * every call, so a revocation applies to the very next request.
 */
export class ApiKeyIdentity implements IdentityProvider {
  constructor(private readonly keys: KeyStore) {}

  authenticate(headers: IdentityHeaders): Promise<IdentityResult> {
    const rawKey = readBearerKey(headers);
    if (rawKey === undefined) return Promise.resolve({ ok: false, reason: 'KEY_INVALID' });

    const record = this.keys.findByRawKey(rawKey);
    if (record === undefined) return Promise.resolve({ ok: false, reason: 'KEY_INVALID' });
    if (record.revokedAt !== null) return Promise.resolve({ ok: false, reason: 'KEY_REVOKED' });

    return Promise.resolve({
      ok: true,
      identity: {
        employeeId: record.employeeId,
        caller: record.caller,
        scope: record.scope,
        keyId: record.keyId,
      },
    });
  }
}
