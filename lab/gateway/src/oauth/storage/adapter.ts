import type { Adapter, AdapterFactory, AdapterPayload } from 'oidc-provider';
import type { GatewayDatabase } from '../../database.js';
import type { OAuthRuntimeConfig } from '../runtime-config.js';
import { decryptState, encryptState, type StateEncryptionKey } from './crypto.js';
import { hashLookup } from './hash.js';
import { ensureOAuthSchema, OAUTH_STATE_TABLE } from './schema.js';

/**
 * A record the provider must not write: it was already consumed, or a grant
 * revocation left a tombstone. The provider never sees the raw id in the
 * message, so an error cannot leak a token or a code.
 */
export class OAuthStateError extends Error {
  constructor(readonly code: 'STATE_CONSUMED' | 'STATE_REVOKED' | 'STATE_ALREADY_CONSUMED', message: string) {
    super(message);
    this.name = 'OAuthStateError';
  }
}

interface StateRow {
  id_hash: string;
  payload: string;
  expires_at: string | null;
  consumed_at: string | null;
  revoked_at: string | null;
}

export interface EncryptedAdapterOptions {
  readonly db: GatewayDatabase;
  /** The `oidc-provider` model name, such as `AccessToken` or `AuthorizationCode`. */
  readonly model: string;
  readonly key: StateEncryptionKey;
  readonly now?: () => Date;
  /** Receives refusals only, never a payload, an id or a secret. */
  readonly log?: (line: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalHash(value: unknown): string | null {
  return typeof value === 'string' ? hashLookup(value) : null;
}

const COLUMNS = 'id_hash, payload, expires_at, consumed_at, revoked_at';

/**
 * The persistent adapter from ADR-0011 section 3.1. Every provider record is
 * stored encrypted; the lookup key is hashed; consumption is one conditional
 * update; and revocation leaves the row behind as a tombstone.
 *
 * Every method is synchronous SQL under an async signature, so no SQLite
 * transaction is ever held across an `await` of the library.
 */
export class EncryptedAdapter implements Adapter {
  private readonly db: GatewayDatabase;
  private readonly model: string;
  private readonly key: StateEncryptionKey;
  private readonly now: () => Date;
  private readonly log: (line: string) => void;

  constructor(options: EncryptedAdapterOptions) {
    this.db = options.db;
    this.model = options.model;
    this.key = options.key;
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? (() => undefined);
    if (this.model.length === 0) throw new Error('an adapter needs a model name');
    if (this.key.key.length !== 32) throw new Error('the state encryption key must be 32 bytes');
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const idHash = hashLookup(id);
    const row = {
      model: this.model,
      id_hash: idHash,
      uid_hash: optionalHash(payload.uid),
      user_code_hash: optionalHash(payload.userCode),
      grant_id_hash: optionalHash(payload.grantId),
      payload: encryptState(this.key, this.model, idHash, payload),
      expires_at: this.expiresAt(expiresIn, payload),
      created_at: this.now().toISOString(),
    };

    this.db
      .transaction(() => {
        const existing = this.db
          .prepare(`SELECT consumed_at, revoked_at FROM ${OAUTH_STATE_TABLE} WHERE model = @model AND id_hash = @id_hash`)
          .get({ model: this.model, id_hash: idHash }) as
          | { consumed_at: string | null; revoked_at: string | null }
          | undefined;
        if (existing?.consumed_at !== null && existing?.consumed_at !== undefined) {
          throw new OAuthStateError('STATE_CONSUMED', 'refusing to overwrite a consumed OAuth state record');
        }
        if (existing?.revoked_at !== null && existing?.revoked_at !== undefined) {
          throw new OAuthStateError('STATE_REVOKED', 'refusing to overwrite a revoked OAuth state record');
        }
        this.db
          .prepare(
            `INSERT INTO ${OAUTH_STATE_TABLE}
               (model, id_hash, uid_hash, user_code_hash, grant_id_hash, payload, expires_at, created_at)
             VALUES (@model, @id_hash, @uid_hash, @user_code_hash, @grant_id_hash, @payload, @expires_at, @created_at)
             ON CONFLICT(model, id_hash) DO UPDATE SET
               uid_hash       = excluded.uid_hash,
               user_code_hash = excluded.user_code_hash,
               grant_id_hash  = excluded.grant_id_hash,
               payload        = excluded.payload,
               expires_at     = excluded.expires_at`,
          )
          .run(row);
      })
      .immediate();
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM ${OAUTH_STATE_TABLE} WHERE model = @model AND id_hash = @id_hash`)
      .get({ model: this.model, id_hash: hashLookup(id) }) as StateRow | undefined;
    return this.open(row);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this.findLive('uid_hash', uid);
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    return this.findLive('user_code_hash', userCode);
  }

  /**
   * One conditional update. When no row changes, the code was already used,
   * revoked or expired, so the caller must fail instead of issuing a second
   * token. This is the check that makes two simultaneous exchanges safe.
   */
  async consume(id: string): Promise<void> {
    const now = this.now().toISOString();
    const changes = this.db
      .transaction(() =>
        this.db
          .prepare(
            `UPDATE ${OAUTH_STATE_TABLE}
             SET consumed_at = @now
             WHERE model = @model AND id_hash = @id_hash
               AND consumed_at IS NULL AND revoked_at IS NULL
               AND (expires_at IS NULL OR expires_at > @now)`,
          )
          .run({ model: this.model, id_hash: hashLookup(id), now }).changes,
      )
      .immediate();
    if (changes === 0) {
      throw new OAuthStateError('STATE_ALREADY_CONSUMED', 'this OAuth state record was already consumed or is no longer valid');
    }
  }

  async destroy(id: string): Promise<void> {
    this.db
      .prepare(`DELETE FROM ${OAUTH_STATE_TABLE} WHERE model = @model AND id_hash = @id_hash`)
      .run({ model: this.model, id_hash: hashLookup(id) });
  }

  /** Mark every record of this model that belongs to the grant; keep the rows. */
  async revokeByGrantId(grantId: string): Promise<void> {
    const hash = hashLookup(grantId);
    this.db
      .prepare(
        `UPDATE ${OAUTH_STATE_TABLE}
         SET revoked_at = COALESCE(revoked_at, @now)
         WHERE model = @model AND (grant_id_hash = @hash OR id_hash = @hash)`,
      )
      .run({ model: this.model, hash, now: this.now().toISOString() });
  }

  private findLive(column: 'uid_hash' | 'user_code_hash', value: string): AdapterPayload | undefined {
    const row = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM ${OAUTH_STATE_TABLE}
         WHERE model = @model AND ${column} = @hash
           AND consumed_at IS NULL AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > @now)
         ORDER BY created_at DESC, id_hash DESC
         LIMIT 1`,
      )
      .get({ model: this.model, hash: hashLookup(value), now: this.now().toISOString() }) as StateRow | undefined;
    return this.open(row);
  }

  /**
   * A tombstoned, expired, tampered or wrongly-keyed row reads as missing.
   * The row is left in place, so a later restart reads the same refusal.
   */
  private open(row: StateRow | undefined): AdapterPayload | undefined {
    if (row === undefined) return undefined;
    if (row.consumed_at !== null || row.revoked_at !== null) return undefined;
    if (row.expires_at !== null) {
      const expiresAt = Date.parse(row.expires_at);
      if (Number.isNaN(expiresAt) || expiresAt <= this.now().getTime()) return undefined;
    }
    try {
      const payload = decryptState(this.key, this.model, row.id_hash, row.payload);
      return isRecord(payload) ? (payload as AdapterPayload) : undefined;
    } catch (error) {
      this.log(`oauth-state ${this.model} refused: ${error instanceof Error ? error.message : 'unreadable record'}`);
      return undefined;
    }
  }

  private expiresAt(expiresIn: number | undefined, payload: AdapterPayload): string | null {
    if (typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0) {
      return new Date(this.now().getTime() + expiresIn * 1000).toISOString();
    }
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      return new Date(payload.exp * 1000).toISOString();
    }
    return null;
  }
}

export interface OAuthAdapterFactoryOptions {
  readonly db: GatewayDatabase;
  readonly config: Pick<OAuthRuntimeConfig, 'keyId' | 'encryptionKey'>;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}

/**
 * The factory `oidc-provider` asks for: `adapter(modelName)`. All models share
 * one database and one encryption key, so a grant revocation reaches each of
 * them through the same hashed grant id.
 */
export function createOAuthAdapterFactory(options: OAuthAdapterFactoryOptions): AdapterFactory {
  ensureOAuthSchema(options.db);
  const key: StateEncryptionKey = { keyId: options.config.keyId, key: options.config.encryptionKey };
  return (model: string) =>
    new EncryptedAdapter({
      db: options.db,
      model,
      key,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.log === undefined ? {} : { log: options.log }),
    });
}
