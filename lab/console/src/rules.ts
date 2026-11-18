import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rulesSchema, type Rules } from '@lab/gateway';

/** Written beside the rule file on every save, one file per applied version (ADR-0006 section 3.4). */
export const RULES_HISTORY_DIR = 'rules-history';

const HISTORY_FILE = /^v([1-9][0-9]*)\.json$/;

export type LoadedRules =
  | { readonly ok: true; readonly rules: Rules }
  | { readonly ok: false; readonly detail: string };

/**
 * Read the rule file the gateway is applying. The engine reads it at every
 * decision, so the console never caches it either: an edit on disk applies to
 * the next page and the next tool call.
 */
export function loadRules(rulesPath: string): LoadedRules {
  try {
    const text = readFileSync(rulesPath, 'utf8').replace(/^\uFEFF/, '');
    return { ok: true, rules: rulesSchema.parse(JSON.parse(text) as unknown) };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return {
      ok: false,
      detail: missing ? 'Chưa có file luật' : 'File luật không đọc được hoặc không đúng schema',
    };
  }
}

/** Versions that already have a history file, so a restore can pick one above all of them. */
export function historyVersions(rulesPath: string): readonly number[] {
  let entries: readonly string[];
  try {
    entries = readdirSync(join(dirname(rulesPath), RULES_HISTORY_DIR));
  } catch {
    return [];
  }

  const versions: number[] = [];
  for (const entry of entries) {
    const match = HISTORY_FILE.exec(entry);
    if (match !== null) versions.push(Number(match[1]));
  }
  return versions;
}

/**
 * Write one rule version: check the schema, put the new file in place with a
 * rename, and keep the same bytes as `rules-history/v<n>.json`. The history
 * copy is laid down first, so a rule file that exists always has its version
 * in the history. A failure leaves the previous rule file untouched.
 */
export function writeRules(rulesPath: string, rules: Rules): void {
  // The console never writes a file that the gateway's own schema rejects.
  const checked = rulesSchema.parse(rules);
  const text = `${JSON.stringify(checked, null, 2)}\n`;

  const folder = dirname(rulesPath);
  const historyFolder = join(folder, RULES_HISTORY_DIR);
  mkdirSync(historyFolder, { recursive: true });

  const stamp = `${process.pid}-${randomBytes(6).toString('hex')}`;
  const nextPath = join(folder, `.rules-${stamp}.tmp`);
  const historyNext = join(historyFolder, `.v${checked.version}-${stamp}.tmp`);
  const historyPath = join(historyFolder, `v${checked.version}.json`);
  const historyExisted = existsSync(historyPath);

  writeFileSync(nextPath, text, 'utf8');
  try {
    writeFileSync(historyNext, text, 'utf8');
    renameSync(historyNext, historyPath);
  } catch (error) {
    rmSync(nextPath, { force: true });
    rmSync(historyNext, { force: true });
    throw error;
  }

  try {
    renameSync(nextPath, rulesPath);
  } catch (error) {
    rmSync(nextPath, { force: true });
    // A history entry without an applied version would explain a version that never existed.
    if (!historyExisted) rmSync(historyPath, { force: true });
    throw error;
  }
}
