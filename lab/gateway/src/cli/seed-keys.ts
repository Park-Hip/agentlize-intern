import { GUEST } from '@lab/shared';
import { KeyStore } from '../identity/key-store.js';
import { PagePasswordStore } from '../identity/page-password-store.js';
import { SEED_IDENTITIES } from '../identity/seed-identities.js';
import { CONSOLE_CALLER } from '../identity/types.js';
import type { CliIo } from './keys.js';

export { GUEST };

export interface SeedOptions {
  /** Revoke the active keys and page passwords of every persona first, then issue fresh ones. */
  readonly rotate?: boolean;
}

/**
 * Issue one tool key and one page password for each persona, including the
 * guest, and print the table. Raw values go to `io` only. Nothing writes them
 * to disk, so run it with the output on screen and copy what you need.
 */
export function seedKeys(
  store: KeyStore,
  pagePasswords: PagePasswordStore,
  io: CliIo,
  options: SeedOptions = {},
): void {
  const personaIds = new Set(SEED_IDENTITIES.map((identity) => identity.employeeId));
  // The console's keys are short-lived: it revokes them on exit or at the next
  // start. They must not block seeding while `npm start` keeps the console open.
  const activeKeys = store
    .list()
    .filter(
      (record) =>
        record.revokedAt === null && record.caller !== CONSOLE_CALLER && personaIds.has(record.employeeId),
    );
  const activePasswords = pagePasswords
    .list()
    .filter((record) => record.revokedAt === null && personaIds.has(record.employeeId));

  if (activeKeys.length > 0 || activePasswords.length > 0) {
    if (options.rotate !== true) {
      throw new Error(
        `${activeKeys.length} active persona keys and ${activePasswords.length} active page passwords already exist; ` +
          'their raw values cannot be shown again. Run with --rotate to revoke them and issue new ones.',
      );
    }
    for (const record of activeKeys) store.revoke(record.keyId);
    for (const employeeId of personaIds) pagePasswords.revokeActiveForEmployee(employeeId);
  }

  io.out(['persona', 'employee', 'key_id', 'key', 'page_password_id', 'page_password'].join('  '));
  for (const identity of SEED_IDENTITIES) {
    const issuedKey = store.issue({ employeeId: identity.employeeId, caller: 'tho-than-desktop' });
    const issuedPassword = pagePasswords.issue({ employeeId: identity.employeeId });
    io.out(
      [
        identity.name,
        identity.employeeId,
        issuedKey.record.keyId,
        issuedKey.rawKey,
        issuedPassword.record.passwordId,
        issuedPassword.rawPassword,
      ].join('  '),
    );
  }
  io.out('Keys and page passwords are shown once and are not stored. Copy the ones you need now.');
}
