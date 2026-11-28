import { randomBytes } from 'node:crypto';
import type { GatewayDatabase } from '../../database.js';
import { tokensEqual } from '../../web/page-util.js';
import { hashLookup } from '../storage/hash.js';

/**
 * The form token of one interaction, kept on the server like the page
 * sessions keep theirs. It is keyed by the interaction `uid` and never appears
 * in a URL; a form from another site cannot read it, and a swapped uid gets a
 * different token (issue #181).
 */
const TABLE = 'oauth_page_csrf';
const TOKEN_BYTES = 32;

interface CsrfRow {
  csrf_token: string;
  expires_at: string;
}

export class OAuthPageCsrfStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        uid_hash   TEXT PRIMARY KEY,
        csrf_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);
  }

  /** The token of this interaction: the live one, or a fresh token when none is live. */
  tokenFor(uid: string, ttlMs: number): string {
    const hash = hashLookup(uid);
    const now = this.now();
    // Old rows go so the table does not grow without bound, as the session table does.
    this.db.prepare(`DELETE FROM ${TABLE} WHERE expires_at <= ?`).run(now.toISOString());

    const row = this.db
      .prepare(`SELECT csrf_token, expires_at FROM ${TABLE} WHERE uid_hash = ?`)
      .get(hash) as CsrfRow | undefined;
    if (row !== undefined && Date.parse(row.expires_at) > now.getTime()) return row.csrf_token;

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    this.db
      .prepare(
        `INSERT INTO ${TABLE} (uid_hash, csrf_token, created_at, expires_at)
         VALUES (@uid_hash, @csrf_token, @created_at, @expires_at)
         ON CONFLICT(uid_hash) DO UPDATE SET
           csrf_token = excluded.csrf_token,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`,
      )
      .run({
        uid_hash: hash,
        csrf_token: token,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlMs).toISOString(),
      });
    return token;
  }

  /** True only for the live token of this uid, compared in constant time. */
  verify(uid: string, token: string): boolean {
    if (token === '') return false;
    const row = this.db
      .prepare(`SELECT csrf_token, expires_at FROM ${TABLE} WHERE uid_hash = ?`)
      .get(hashLookup(uid)) as CsrfRow | undefined;
    if (row === undefined || Date.parse(row.expires_at) <= this.now().getTime()) return false;
    return tokensEqual(row.csrf_token, token);
  }

  end(uid: string): void {
    this.db.prepare(`DELETE FROM ${TABLE} WHERE uid_hash = ?`).run(hashLookup(uid));
  }
}
