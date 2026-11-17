import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DATA_DIR_ENV } from '@lab/shared';

export type GatewayDatabase = Database.Database;

export const GATEWAY_DB_FILE = 'gateway.sqlite';

/** How long a writer waits for the other process to release the lock before it gives up. */
export const BUSY_TIMEOUT_MS = 5_000;

/** lab/gateway/dist/ is two levels below lab/. */
const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `LAB_DATA_DIR` when set, otherwise `lab/.data` (git-ignored). */
export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[DATA_DIR_ENV];
  return resolve(configured !== undefined && configured.trim() !== '' ? configured : join(labRoot, '.data'));
}

/**
 * Open the gateway database with write-ahead logging and a lock wait, so the
 * console can read while the gateway writes (ADR-0006 section 3.6). WAL is
 * stored in the file, so it stays on for every later process that opens it.
 */
export function openGatewayDatabase(dataDir: string = resolveDataDir()): GatewayDatabase {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, GATEWAY_DB_FILE));
  try {
    const mode = db.pragma('journal_mode = WAL', { simple: true });
    if (mode !== 'wal') {
      throw new Error(`gateway database did not accept WAL journal mode (got ${String(mode)})`);
    }
    db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
