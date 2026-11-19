import { randomBytes } from 'node:crypto';
import { EMPLOYEE_ID_PATTERN, KEY_PREFIX_LENGTH } from '@lab/shared';
import type { GatewayDatabase } from '../database.js';
import { hashKey, hashesEqual } from './key-store.js';

/** A page password opens the gateway pages and nothing else (ADR-0008 section 3.1). */
export const PAGE_PASSWORD_PREFIX = 'trang_';
const PAGE_PASSWORD_RANDOM_BYTES = 32;

export interface PagePasswordRecord {
  readonly passwordId: string;
  /** Hex SHA-256 of the raw page password. */
  readonly passwordHash: string;
  /** First six characters of the raw page password, safe to print. */
  readonly passwordPrefix: string;
  readonly employeeId: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface IssuedPagePassword {
  /** The raw page password. It exists only in this return value and is never stored. */
  readonly rawPassword: string;
  readonly record: PagePasswordRecord;
}

interface PagePasswordRow {
  password_id: string;
  password_hash: string;
  password_prefix: string;
  employee_id: string;
  created_at: string;
  revoked_at: string | null;
}

export function generateRawPagePassword(): string {
  return `${PAGE_PASSWORD_PREFIX}${randomBytes(PAGE_PASSWORD_RANDOM_BYTES).toString('base64url')}`;
}

function toRecord(row: PagePasswordRow): PagePasswordRecord {
  return {
    passwordId: row.password_id,
    passwordHash: row.password_hash,
    passwordPrefix: row.password_prefix,
    employeeId: row.employee_id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Owns the `page_passwords` table. It holds hashes and six-character prefixes
 * only, like `api_keys`, so the repository and the database keep no raw page
 * password. A page password is never accepted as a tool key: the identity
 * provider reads `api_keys` only.
 */
export class PagePasswordStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS page_passwords (
        password_id     TEXT PRIMARY KEY,
        password_hash   TEXT NOT NULL UNIQUE,
        password_prefix TEXT NOT NULL,
        employee_id     TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        revoked_at      TEXT
      )
    `);
  }

  issue(input: { readonly employeeId: string }): IssuedPagePassword {
    if (!EMPLOYEE_ID_PATTERN.test(input.employeeId)) {
      throw new Error(`employee code must look like NV-07, got "${input.employeeId}"`);
    }
    const rawPassword = generateRawPagePassword();
    const row: PagePasswordRow = {
      password_id: `pwd-${randomBytes(5).toString('hex')}`,
      password_hash: hashKey(rawPassword),
      password_prefix: rawPassword.slice(0, KEY_PREFIX_LENGTH),
      employee_id: input.employeeId,
      created_at: this.now().toISOString(),
      revoked_at: null,
    };
    this.db
      .prepare(
        `INSERT INTO page_passwords (password_id, password_hash, password_prefix, employee_id, created_at, revoked_at)
         VALUES (@password_id, @password_hash, @password_prefix, @employee_id, @created_at, @revoked_at)`,
      )
      .run(row);
    return { rawPassword, record: toRecord(row) };
  }

  /** Returns the record for this raw page password, or undefined. The stored hash is re-checked in constant time. */
  findByRawPassword(rawPassword: string): PagePasswordRecord | undefined {
    const hash = hashKey(rawPassword);
    const row = this.db.prepare('SELECT * FROM page_passwords WHERE password_hash = ?').get(hash) as
      | PagePasswordRow
      | undefined;
    if (row === undefined || !hashesEqual(row.password_hash, hash)) return undefined;
    return toRecord(row);
  }

  /** The record of a page password by its code, or undefined. A page asks this at every press. */
  findById(passwordId: string): PagePasswordRecord | undefined {
    const row = this.db.prepare('SELECT * FROM page_passwords WHERE password_id = ?').get(passwordId) as
      | PagePasswordRow
      | undefined;
    return row === undefined ? undefined : toRecord(row);
  }

  /** Revoke by code. Returns false when no such page password exists. Revoking twice keeps the first time. */
  revoke(passwordId: string): boolean {
    const result = this.db
      .prepare('UPDATE page_passwords SET revoked_at = COALESCE(revoked_at, ?) WHERE password_id = ?')
      .run(this.now().toISOString(), passwordId);
    return result.changes > 0;
  }

  /** Revoke every active page password of one person, so a reissued one replaces the old. */
  revokeActiveForEmployee(employeeId: string): number {
    return this.db
      .prepare('UPDATE page_passwords SET revoked_at = ? WHERE employee_id = ? AND revoked_at IS NULL')
      .run(this.now().toISOString(), employeeId).changes;
  }

  list(): PagePasswordRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM page_passwords ORDER BY created_at, password_id')
      .all() as PagePasswordRow[];
    return rows.map(toRecord);
  }
}
