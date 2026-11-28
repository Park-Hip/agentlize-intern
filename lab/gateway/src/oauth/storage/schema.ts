import type { GatewayDatabase } from '../../database.js';

export const OAUTH_STATE_TABLE = 'oauth_state';
export const OAUTH_GRANT_TABLE = 'oauth_grants';

/**
 * The two tables the OAuth side owns. Both live in the gateway database, so a
 * restart reopens the same file and the same records (ADR-0011 section 3.1).
 * `oauth_state` holds one row per provider model record; `oauth_grants` holds
 * the stable Lab grant that outlives an access token.
 */
export function ensureOAuthSchema(db: GatewayDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${OAUTH_STATE_TABLE} (
      model          TEXT NOT NULL,
      id_hash        TEXT NOT NULL,
      uid_hash       TEXT,
      user_code_hash TEXT,
      grant_id_hash  TEXT,
      payload        TEXT NOT NULL,
      expires_at     TEXT,
      consumed_at    TEXT,
      revoked_at     TEXT,
      created_at     TEXT NOT NULL,
      PRIMARY KEY (model, id_hash)
    );

    CREATE INDEX IF NOT EXISTS oauth_state_grant ON ${OAUTH_STATE_TABLE} (model, grant_id_hash);
    CREATE INDEX IF NOT EXISTS oauth_state_uid ON ${OAUTH_STATE_TABLE} (model, uid_hash);
    CREATE INDEX IF NOT EXISTS oauth_state_user_code ON ${OAUTH_STATE_TABLE} (model, user_code_hash);

    CREATE TABLE IF NOT EXISTS ${OAUTH_GRANT_TABLE} (
      grant_id    TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      client_id   TEXT NOT NULL,
      scope       TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      revoked_at  TEXT
    );
  `);
}

/**
 * True when the database already holds OAuth records. Startup uses it to
 * refuse generating a fresh key that would orphan them (ADR-0011 section 3.1).
 */
export function hasOAuthState(db: GatewayDatabase): boolean {
  const table = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(OAUTH_STATE_TABLE) as { present: number } | undefined;
  if (table === undefined) return false;
  const state = db.prepare(`SELECT COUNT(*) AS total FROM ${OAUTH_STATE_TABLE}`).get() as { total: number };
  if (state.total > 0) return true;
  const grantTable = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(OAUTH_GRANT_TABLE) as { present: number } | undefined;
  if (grantTable === undefined) return false;
  const grants = db.prepare(`SELECT COUNT(*) AS total FROM ${OAUTH_GRANT_TABLE}`).get() as { total: number };
  return grants.total > 0;
}
