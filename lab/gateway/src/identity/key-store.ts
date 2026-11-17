import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { KEY_PREFIX_LENGTH } from '@lab/shared';
import type { GatewayDatabase } from '../database.js';
import { CALLERS, SCOPES, isCaller, isScope, type Caller, type Scope } from './types.js';

export const KEY_PREFIX = 'lab_';
const KEY_RANDOM_BYTES = 32;
const EMPLOYEE_ID_PATTERN = /^NV-\d{2,}$/;

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

/** Owns the `api_keys` table. Holds hashes only, never a raw key. */
export class KeyStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        key_id      TEXT PRIMARY KEY,
        key_hash    TEXT NOT NULL UNIQUE,
        key_prefix  TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        caller      TEXT NOT NULL CHECK (caller IN (${quoted(CALLERS)})),
        scope       TEXT NOT NULL CHECK (scope IN (${quoted(SCOPES)})),
        created_at  TEXT NOT NULL,
        revoked_at  TEXT
      )
    `);
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

  /** Revoke by key code. Returns false when no such key exists. Revoking twice keeps the first time. */
  revoke(keyId: string): boolean {
    const result = this.db
      .prepare('UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE key_id = ?')
      .run(this.now().toISOString(), keyId);
    return result.changes > 0;
  }

  list(): KeyRecord[] {
    const rows = this.db.prepare('SELECT * FROM api_keys ORDER BY created_at, key_id').all() as KeyRow[];
    return rows.map(toRecord);
  }
}
