import type { GatewayDatabase } from '../../database.js';
import { hashLookup } from './hash.js';
import { OAUTH_STATE_TABLE } from './schema.js';

/**
 * Revoke every provider record that belongs to one grant, across every model,
 * and keep the rows as tombstones (ADR-0011 section 3.1). A restart reads the
 * same rows, so a revoked token never comes back.
 * The grant record itself is matched by its own id as well as by `grant_id`,
 * which is why revoking a grant also revokes the `Grant` model row.
 */
export function revokeStateByGrantId(
  db: GatewayDatabase,
  grantId: string,
  now: () => Date = () => new Date(),
): number {
  const hash = hashLookup(grantId);
  return db
    .prepare(
      `UPDATE ${OAUTH_STATE_TABLE}
       SET revoked_at = COALESCE(revoked_at, @now)
       WHERE grant_id_hash = @hash OR id_hash = @hash`,
    )
    .run({ hash, now: now().toISOString() }).changes;
}
