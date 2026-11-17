import { constants, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { RULES_PATH_ENV } from '@lab/shared';
import { DEFAULT_RULES_PATH } from './engine.js';

/** Name of the rule file inside the data folder. */
export const RULES_FILE = 'rules.json';

/**
 * Where the gateway reads the rules: `LAB_RULES_PATH` when set, otherwise
 * `<data folder>/rules.json` (ADR-0006 section 3.4). A relative value is
 * resolved from the folder the process was started in, like `LAB_DATA_DIR`.
 */
export function resolveRulesPath(dataDir: string, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[RULES_PATH_ENV];
  if (configured !== undefined && configured.trim() !== '') {
    return resolve(configured);
  }
  return join(dataDir, RULES_FILE);
}

/**
 * Put the committed rule file in place when the configured path has none, so a
 * fresh data folder works without a manual copy. An existing file is never
 * touched: it is the operator's copy and git stays clean.
 * Returns true only when this call wrote the file.
 */
export function seedRulesFile(rulesPath: string, sourcePath: string = DEFAULT_RULES_PATH): boolean {
  mkdirSync(dirname(rulesPath), { recursive: true });
  try {
    copyFileSync(sourcePath, rulesPath, constants.COPYFILE_EXCL);
    return true;
  } catch (error) {
    // The file appeared between the check and the copy, or it was already there.
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}
