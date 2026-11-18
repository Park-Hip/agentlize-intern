import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { EMPLOYEE_ID_PATTERN, KEY_PREFIX_LENGTH } from '@lab/shared';
import type { GatewayDatabase } from '../database.js';
import { CALLERS, SCOPES, isCaller, isScope, type Caller, type Scope } from './types.js';

export const KEY_PREFIX = 'lab_';
const KEY_RANDOM_BYTES = 32;

export interface KeyRecord {
  readonly keyId: string;
  /** Hex SHA-256 of the raw key. */
  readonly keyHash: string;
  /** First six characters of the raw key, safe to print. */
  readonly keyPrefix: string;
  readonly employeeId: string;
  readonly caller: Caller;
  readonly scope: Scope;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface IssueKeyInput {
  readonly employeeId: string;
  readonly caller: string;
  readonly scope?: string | undefined;
}

export interface IssuedKey {
  /** The raw key. It exists only in this return value and is never stored. */
  readonly rawKey: string;
  readonly record: KeyRecord;
}

interface KeyRow {
  key_id: string;
  key_hash: string;
  key_prefix: string;
  employee_id: string;
  caller: string;
  scope: string;
  created_at: string;
  revoked_at: string | null;
}

/** SHA-256 is enough because the key carries 256 random bits; there is nothing to brute-force. */
export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

/** Compare two hex digests without leaking where they differ. */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function generateRawKey(): string {
  return `${KEY_PREFIX}${randomBytes(KEY_RANDOM_BYTES).toString('base64url')}`;
}

function toRecord(row: KeyRow): KeyRecord {
  if (!isCaller(row.caller) || !isScope(row.scope)) {
    throw new Error(`key ${row.key_id} has an unknown caller or scope`);
  }
  return {
    keyId: row.key_id,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    employeeId: row.employee_id,
    caller: row.caller,
    scope: row.scope,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

const quoted = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

function createKeysSql(table: string): string {
  return `
    CREATE TABLE IF NOT EXISTS ${table} (
      key_id      TEXT PRIMARY KEY,
      key_hash    TEXT NOT NULL UNIQUE,
      key_prefix  TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      caller      TEXT NOT NULL CHECK (caller IN (${quoted(CALLERS)})),
      scope       TEXT NOT NULL CHECK (scope IN (${quoted(SCOPES)})),
      created_at  TEXT NOT NULL,
      revoked_at  TEXT
    )
  `;
}

/**
 * Owns the `api_keys` table. Holds hashes only, never a raw key.
 * The `caller` and `scope` checks are copied into the table, so a table made
 * before a caller existed is rebuilt once to accept it (same approach as the
 * trace table). Rows, and so every issued key, survive the rebuild.
 */
export class KeyStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    const existing = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'api_keys'")
      .get() as { sql: string } | undefined;
    if (existing === undefined) {
      db.exec(createKeysSql('api_keys'));
      return;
    }
    const known = [...CALLERS, ...SCOPES];
    if (known.some((value) => !existing.sql.includes(`'${value}'`))) this.rebuild();
  }

  /** Copy every key into a table whose checks know every caller and scope, keeping each key code. */
  private rebuild(): void {
    this.db.transaction(() => {
      this.db.exec('ALTER TABLE api_keys RENAME TO api_keys_before_caller');
      this.db.exec(createKeysSql('api_keys'));
      this.db.exec(`
        INSERT INTO api_keys (key_id, key_hash, key_prefix, employee_id, caller, scope, created_at, revoked_at)
        SELECT key_id, key_hash, key_prefix, employee_id, caller, scope, created_at, revoked_at
        FROM api_keys_before_caller;
        DROP TABLE api_keys_before_caller;
      `);
    })();
  }

  issue(input: IssueKeyInput): IssuedKey {
    if (!EMPLOYEE_ID_PATTERN.test(input.employeeId)) {
      throw new Error(`employee code must look like NV-07, got "${input.employeeId}"`);
    }
    if (!isCaller(input.caller)) {
      throw new Error(`caller must be one of ${CALLERS.join(', ')}, got "${input.caller}"`);
    }
    const scope = input.scope ?? 'full';
    if (!isScope(scope)) {
      throw new Error(`scope must be one of ${SCOPES.join(', ')}, got "${scope}"`);
    }

    const rawKey = generateRawKey();
    const row: KeyRow = {
      key_id: `key-${randomBytes(5).toString('hex')}`,
      key_hash: hashKey(rawKey),
      key_prefix: rawKey.slice(0, KEY_PREFIX_LENGTH),
      employee_id: input.employeeId,
      caller: input.caller,
      scope,
      created_at: this.now().toISOString(),
      revoked_at: null,
    };
    this.db
      .prepare(
        `INSERT INTO api_keys (key_id, key_hash, key_prefix, employee_id, caller, scope, created_at, revoked_at)
         VALUES (@key_id, @key_hash, @key_prefix, @employee_id, @caller, @scope, @created_at, @revoked_at)`,
      )
      .run(row);
    return { rawKey, record: toRecord(row) };
  }

  /** Returns the record for this raw key, or undefined. The stored hash is re-checked in constant time. */
  findByRawKey(rawKey: string): KeyRecord | undefined {
    const hash = hashKey(rawKey);
    const row = this.db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hash) as KeyRow | undefined;
    if (row === undefined || !hashesEqual(row.key_hash, hash)) return undefined;
    return toRecord(row);
  }

  /** The record of a key by its code, or undefined. A page asks this to see whether a login's key is still valid. */
  findById(keyId: string): KeyRecord | undefined {
    const row = this.db.prepare('SELECT * FROM api_keys WHERE key_id = ?').get(keyId) as KeyRow | undefined;
    return row === undefined ? undefined : toRecord(row);
  }

  /** Revoke by key code. Returns false when no such key exists. Revoking twice keeps the first time. */
  revoke(keyId: string): boolean {
    const result = this.db
      .prepare('UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE key_id = ?')
      .run(this.now().toISOString(), keyId);
    return result.changes > 0;
  }

  /**
   * Revoke every active key of one caller and return how many changed.
   * The console runs this at startup so a run killed sideways leaves no key
   * behind that still works (ADR-0006 section 3.3).
   */
  revokeActiveByCaller(caller: string): number {
    if (!isCaller(caller)) {
      throw new Error(`caller must be one of ${CALLERS.join(', ')}, got "${caller}"`);
    }
    return this.db
      .prepare('UPDATE api_keys SET revoked_at = ? WHERE caller = ? AND revoked_at IS NULL')
      .run(this.now().toISOString(), caller).changes;
  }

  list(): KeyRecord[] {
    const rows = this.db.prepare('SELECT * FROM api_keys ORDER BY created_at, key_id').all() as KeyRow[];
    return rows.map(toRecord);
  }
}
