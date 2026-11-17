import { PERSONAS } from '@lab/shared';
import { KeyStore } from '../identity/key-store.js';
import type { CliIo } from './keys.js';

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
  const personaIds = new Set(PERSONAS.map((persona) => persona.employeeId));
  const active = store.list().filter((record) => record.revokedAt === null && personaIds.has(record.employeeId));

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
  for (const persona of PERSONAS) {
    const issued = store.issue({ employeeId: persona.employeeId, caller: 'tho-than-desktop' });
    io.out([persona.slug, persona.employeeId, issued.record.keyId, issued.rawKey].join('  '));
  }
  io.out('Keys are shown once and are not stored. Copy the ones you need now.');
}
