import { CONSOLE_CALLER, KeyStore, SEED_IDENTITIES } from '@lab/gateway';

/**
 * The keys the playground calls with (ADR-0006 section 3.3): one per persona
 * and one for the guest, issued for the `lab-console` caller. Raw keys live
 * only in this object, never on a page, in a log or on disk, and `stop()`
 * revokes every key this run issued.
 */
export class ConsoleKeyRing {
  readonly #rawKeys = new Map<string, string>();
  #keyIds: string[] = [];
  #started = false;
  #stopped = false;

  constructor(private readonly store: KeyStore) {}

  /**
   * Revoke what a previous run left active (it may have been killed sideways),
   * then issue one key per identity. Returns how many keys the ring now holds.
   */
  start(): number {
    if (this.#started) throw new Error('the console key ring has already been started');
    this.#started = true;
    this.store.revokeActiveByCaller(CONSOLE_CALLER);
    for (const identity of SEED_IDENTITIES) {
      const issued = this.store.issue({ employeeId: identity.employeeId, caller: CONSOLE_CALLER });
      this.#rawKeys.set(identity.employeeId, issued.rawKey);
      this.#keyIds.push(issued.record.keyId);
    }
    return this.#rawKeys.size;
  }

  /** The key of one persona, or undefined when this run did not issue one. */
  rawKeyFor(employeeId: string): string | undefined {
    return this.#rawKeys.get(employeeId);
  }

  /** Revoke the keys of this run and forget them. Idempotent, so a failed start can call it too. */
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    try {
      for (const keyId of this.#keyIds) this.store.revoke(keyId);
    } finally {
      this.#keyIds = [];
      this.#rawKeys.clear();
    }
  }
}
