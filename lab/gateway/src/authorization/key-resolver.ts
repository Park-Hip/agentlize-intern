import type { KeyStore } from '../identity/key-store.js';
import type {
  AuthorizationContext,
  AuthorizationRef,
  AuthorizationResolution,
  AuthorizationResolver,
} from './types.js';

/**
 * The legacy form: a key id is resolved against the key store on every call,
 * so revoking a key blocks the very next draft, press, approval or send.
 * A key has no grant-level expiry; that clock does not exist for it.
 */
export class KeyAuthorizationResolver implements AuthorizationResolver {
  readonly kind = 'key' as const;

  constructor(private readonly keys: KeyStore) {}

  resolve(ref: AuthorizationRef, _context: AuthorizationContext): AuthorizationResolution {
    if (ref.kind !== 'key') return { ok: false, reason: 'AUTHORIZATION_UNKNOWN' };
    const record = this.keys.findById(ref.id);
    if (record === undefined) return { ok: false, reason: 'AUTHORIZATION_INVALID' };
    if (record.revokedAt !== null) return { ok: false, reason: 'AUTHORIZATION_REVOKED' };
    return {
      ok: true,
      grant: {
        ref,
        employeeId: record.employeeId,
        caller: record.caller,
        scope: record.scope,
        expiresAt: null,
        status: 'active',
      },
    };
  }
}
