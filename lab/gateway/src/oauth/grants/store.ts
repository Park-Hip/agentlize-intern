import { EMPLOYEE_ID_PATTERN } from '@lab/shared';
import type { GatewayDatabase } from '../../database.js';
import { hashLookup } from '../storage/hash.js';
import { ensureOAuthSchema, OAUTH_CLIENT_TABLE, OAUTH_GRANT_TABLE, OAUTH_STATE_TABLE } from '../storage/schema.js';

/** A Lab grant lasts four hours; the shorter access token does not end it (oauth-plan section 3). */
export const LAB_GRANT_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * The stable record of "this person let this client act for this scope". It is
 * the id a proposal carries, so an expired access token never reads as a
 * revoked grant, and a token id never reads as a grant id (ADR-0011 section 3.1).
 */
export interface LabGrant {
  /** The provider grant id. This is the id an `AuthorizationRef` of kind `oauth` carries. */
  readonly grantId: string;
  readonly employeeId: string;
  readonly clientId: string;
  /** Space-delimited scopes as issued, such as `openid mcp:read mcp:propose`. */
  readonly scope: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface CreateGrantInput {
  readonly grantId: string;
  readonly employeeId: string;
  readonly clientId: string;
  readonly scope: string | readonly string[];
}

interface GrantRow {
  grant_id: string;
  employee_id: string;
  client_id: string;
  scope: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

function joinScope(scope: string | readonly string[]): string {
  if (typeof scope === 'string') {
    const trimmed = scope.trim();
    if (trimmed.length === 0) throw new Error('a grant needs at least one scope');
    return trimmed.split(/\s+/).join(' ');
  }
  const parts = scope.map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) throw new Error('a grant needs at least one scope');
  return parts.join(' ');
}

function toGrant(row: GrantRow): LabGrant {
  return {
    grantId: row.grant_id,
    employeeId: row.employee_id,
    clientId: row.client_id,
    scope: row.scope,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Owns `oauth_grants`. Writing a grant is the one place the four-hour clock is
 * set. Revocation keeps the row, marks the grant, and marks every provider
 * record of the same grant in the same short transaction, so an access token,
 * a refresh record or an authorization code belonging to it stops reading as
 * live after a restart too.
 */
export class GrantStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    ensureOAuthSchema(db);
  }

  create(input: CreateGrantInput): LabGrant {
    if (typeof input.grantId !== 'string' || input.grantId.trim().length === 0) {
      throw new Error('a grant needs a provider grant id');
    }
    if (!EMPLOYEE_ID_PATTERN.test(input.employeeId)) {
      throw new Error(`employee code must look like NV-07, got "${input.employeeId}"`);
    }
    if (typeof input.clientId !== 'string' || input.clientId.trim().length === 0) {
      throw new Error('a grant needs a client id');
    }

    const createdAt = this.now();
    const row: GrantRow = {
      grant_id: input.grantId,
      employee_id: input.employeeId,
      client_id: input.clientId,
      scope: joinScope(input.scope),
      created_at: createdAt.toISOString(),
      expires_at: new Date(createdAt.getTime() + LAB_GRANT_TTL_MS).toISOString(),
      revoked_at: null,
    };
    this.db
      .prepare(
        `INSERT INTO ${OAUTH_GRANT_TABLE}
           (grant_id, employee_id, client_id, scope, created_at, expires_at, revoked_at)
         VALUES (@grant_id, @employee_id, @client_id, @scope, @created_at, @expires_at, @revoked_at)`,
      )
      .run(row);
    return toGrant(row);
  }

  find(grantId: string): LabGrant | undefined {
    const row = this.db
      .prepare(`SELECT * FROM ${OAUTH_GRANT_TABLE} WHERE grant_id = ?`)
      .get(grantId) as GrantRow | undefined;
    return row === undefined ? undefined : toGrant(row);
  }

  list(): LabGrant[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${OAUTH_GRANT_TABLE} ORDER BY created_at, grant_id`)
      .all() as GrantRow[];
    return rows.map(toGrant);
  }

  /** Every grant one person holds, newest first; the connections page lists these and no other person's. */
  listByEmployee(employeeId: string): LabGrant[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${OAUTH_GRANT_TABLE} WHERE employee_id = ? ORDER BY created_at DESC, grant_id`)
      .all(employeeId) as GrantRow[];
    return rows.map(toGrant);
  }

  /** Grants one person holds with one client, so revoking a client's grants spares the same person's other clients. */
  listByEmployeeAndClient(employeeId: string, clientId: string): LabGrant[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${OAUTH_GRANT_TABLE}
         WHERE employee_id = ? AND client_id = ?
         ORDER BY created_at DESC, grant_id`,
      )
      .all(employeeId, clientId) as GrantRow[];
    return rows.map(toGrant);
  }

  /** Every grant one client holds, across people; used when an operator switches a client off. */
  listByClient(clientId: string): LabGrant[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${OAUTH_GRANT_TABLE} WHERE client_id = ? ORDER BY created_at DESC, grant_id`)
      .all(clientId) as GrantRow[];
    return rows.map(toGrant);
  }

  /** True when the client is switched off; a disabled client is refused at the same boundary as a revoked grant. */
  isClientDisabled(clientId: string): boolean {
    const row = this.db
      .prepare(`SELECT disabled_at FROM ${OAUTH_CLIENT_TABLE} WHERE client_id = ?`)
      .get(clientId) as { disabled_at: string | null } | undefined;
    return row !== undefined && row.disabled_at !== null;
  }

  /**
   * Switch a client off and revoke every grant it holds in one short
   * transaction, so no token or proposal of that client keeps standing. A
   * repeat keeps the first moment and returns how many grants it changed.
   */
  disableClient(clientId: string): number {
    const now = this.now().toISOString();
    return this.db
      .transaction(() => {
        this.db
          .prepare(
            `INSERT INTO ${OAUTH_CLIENT_TABLE} (client_id, disabled_at) VALUES (@client_id, @now)
             ON CONFLICT(client_id) DO UPDATE SET disabled_at = COALESCE(${OAUTH_CLIENT_TABLE}.disabled_at, @now)`,
          )
          .run({ client_id: clientId, now });
        const grantIds = this.listByClient(clientId)
          .filter((grant) => grant.revokedAt === null)
          .map((grant) => grant.grantId);
        for (const grantId of grantIds) this.revokeWithin(grantId, now);
        return grantIds.length;
      })
      .immediate();
  }

  /** Switch a client back on. The grants it held before stay revoked; reconnecting makes new ones. */
  enableClient(clientId: string): void {
    this.db.prepare(`DELETE FROM ${OAUTH_CLIENT_TABLE} WHERE client_id = ?`).run(clientId);
  }

  /**
   * Mark the grant revoked and every provider record of that grant revoked,
   * in one short transaction. Repeating the call keeps the first time and
   * still returns false the second time, because the grant row was already
   * revoked. The rows are not deleted, so a restart cannot restore them.
   */
  revoke(grantId: string): boolean {
    const now = this.now().toISOString();
    return this.db
      .transaction(() => (this.revokeWithin(grantId, now) ? 1 : 0))
      .immediate() > 0;
  }

  /**
   * The revoking half of `revoke` and `disableClient`, run inside the caller's
   * transaction: mark the grant and every provider record keyed by it, keeping
   * the rows as tombstones so a restart cannot revive them. True when the
   * grant row was live.
   */
  private revokeWithin(grantId: string, now: string): boolean {
    const hash = hashLookup(grantId);
    const changed = this.db
      .prepare(
        `UPDATE ${OAUTH_GRANT_TABLE}
         SET revoked_at = @now
         WHERE grant_id = @grant_id AND revoked_at IS NULL`,
      )
      .run({ grant_id: grantId, now }).changes;
    this.db
      .prepare(
        `UPDATE ${OAUTH_STATE_TABLE}
         SET revoked_at = COALESCE(revoked_at, @now)
         WHERE grant_id_hash = @hash OR id_hash = @hash`,
      )
      .run({ hash, now });
    return changed > 0;
  }
}
