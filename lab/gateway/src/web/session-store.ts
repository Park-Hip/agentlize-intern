import { createHash, randomBytes } from 'node:crypto';
import type { GatewayDatabase } from '../database.js';

/** A simulated login lasts this long. */
export const SESSION_TTL_MS = 15 * 60 * 1000;

export interface Session {
  readonly employeeId: string;
  /** The page password the person used at login. Checked again at every press, so a revoked one ends the session. */
  readonly passwordId: string;
  /** The token every POST form must carry. It exists only for this session. */
  readonly csrfToken: string;
  readonly expiresAt: string;
}

export interface NewSession extends Session {
  /** The cookie value. Shown once; the table keeps only its hash. */
  readonly token: string;
}

interface Row {
  employee_id: string;
  password_id: string;
  csrf_token: string;
  expires_at: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Owns the `sessions` table: short logins for the pages, never for the tools.
 * A table made before page passwords has a `key_id` column and no
 * `password_id`; it is dropped and recreated because a 15-minute login cannot
 * be reused under the new rule, and keeping it would mean keeping a key that
 * opens the pages.
 */
export class SessionStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    const columns = db.prepare("PRAGMA table_info('sessions')").all() as { name: string }[];
    if (columns.length > 0 && !columns.some((column) => column.name === 'password_id')) {
      db.exec('DROP TABLE sessions');
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash  TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        password_id TEXT NOT NULL,
        csrf_token  TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL
      )
    `);
  }

  create(employeeId: string, passwordId: string): NewSession {
    const now = this.now();
    // Old rows go when a new one comes, so the table does not grow without bound.
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());

    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    this.db
      .prepare(
        'INSERT INTO sessions (token_hash, employee_id, password_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(hashToken(token), employeeId, passwordId, csrfToken, now.toISOString(), expiresAt);
    return { token, employeeId, passwordId, csrfToken, expiresAt };
  }

  /** The live session behind a cookie value, or undefined when it is unknown or has run out. */
  find(token: string): Session | undefined {
    const row = this.db
      .prepare('SELECT employee_id, password_id, csrf_token, expires_at FROM sessions WHERE token_hash = ?')
      .get(hashToken(token)) as Row | undefined;
    if (row === undefined || this.now().getTime() >= Date.parse(row.expires_at)) return undefined;
    return { employeeId: row.employee_id, passwordId: row.password_id, csrfToken: row.csrf_token, expiresAt: row.expires_at };
  }

  end(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
}
