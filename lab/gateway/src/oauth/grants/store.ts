import { EMPLOYEE_ID_PATTERN } from '@lab/shared';
import type { GatewayDatabase } from '../../database.js';
import { hashLookup } from '../storage/hash.js';
import { ensureOAuthSchema, OAUTH_GRANT_TABLE, OAUTH_STATE_TABLE } from '../storage/schema.js';

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

  /**
   * Mark the grant revoked and every provider record of that grant revoked,
   * in one short transaction. Repeating the call keeps the first time and
   * still returns false the second time, because the grant row was already
   * revoked. The rows are not deleted, so a restart cannot restore them.
   */
  revoke(grantId: string): boolean {
    const hash = hashLookup(grantId);
    const now = this.now().toISOString();
    return this.db
      .transaction(() => {
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
        return changed;
      })
      .immediate() > 0;
  }
}
