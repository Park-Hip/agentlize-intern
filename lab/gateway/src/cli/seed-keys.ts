import { GUEST } from '@lab/shared';
import { KeyStore } from '../identity/key-store.js';
import { SEED_IDENTITIES } from '../identity/seed-identities.js';
import { CONSOLE_CALLER } from '../identity/types.js';
import type { CliIo } from './keys.js';

export { GUEST };

export interface SeedOptions {
  /** Revoke the active keys of every persona first, then issue fresh ones. */
  readonly rotate?: boolean;
}

/**
 * Issue one key for each persona, including the guest, and print the table.
 * Raw keys go to `io` only. Nothing writes them to disk, so run it with the
 * output on screen and copy what you need.
 */
export function seedKeys(store: KeyStore, io: CliIo, options: SeedOptions = {}): void {
  const personaIds = new Set(SEED_IDENTITIES.map((identity) => identity.employeeId));
  // The console's keys are short-lived: it revokes them on exit or at the next
  // start. They must not block seeding while `npm start` keeps the console open.
  const active = store
    .list()
    .filter(
      (record) =>
        record.revokedAt === null && record.caller !== CONSOLE_CALLER && personaIds.has(record.employeeId),
    );

  if (active.length > 0) {
    if (options.rotate !== true) {
      throw new Error(
        `${active.length} active persona keys already exist; their raw keys cannot be shown again. ` +
          'Run with --rotate to revoke them and issue new ones.',
      );
    }
    for (const record of active) store.revoke(record.keyId);
  }

  io.out(['persona', 'employee', 'key_id', 'key'].join('  '));
  for (const identity of SEED_IDENTITIES) {
    const issued = store.issue({ employeeId: identity.employeeId, caller: 'tho-than-desktop' });
    io.out([identity.name, identity.employeeId, issued.record.keyId, issued.rawKey].join('  '));
  }
  io.out('Keys are shown once and are not stored. Copy the ones you need now.');
}
