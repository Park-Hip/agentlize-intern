import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DATA_DIR_ENV } from '@lab/shared';

export type GatewayDatabase = Database.Database;

export const GATEWAY_DB_FILE = 'gateway.sqlite';

/** lab/gateway/dist/ is two levels below lab/. */
const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `LAB_DATA_DIR` when set, otherwise `lab/.data` (git-ignored). */
export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[DATA_DIR_ENV];
  return resolve(configured !== undefined && configured.trim() !== '' ? configured : join(labRoot, '.data'));
}

export function openGatewayDatabase(dataDir: string = resolveDataDir()): GatewayDatabase {
  mkdirSync(dataDir, { recursive: true });
  return new Database(join(dataDir, GATEWAY_DB_FILE));
}
