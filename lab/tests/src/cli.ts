import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { labRoot } from './process.js';

/** Run one gateway CLI against the data folder in `env`; asserts it exits 0. */
export function runCli(script: string, args: readonly string[], env: NodeJS.ProcessEnv): string {
  const result = spawnSync(process.execPath, [join(labRoot, 'gateway', 'dist', 'cli', script), ...args], {
    cwd: labRoot,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${script} failed: ${result.stderr}`);
  return result.stdout;
}

export interface SeededKey {
  readonly key: string;
  readonly keyId: string;
}

/** `seed-keys` prints `persona employee key_id key page_password_id page_password`; read one persona's key and key code. */
export function keyOf(table: string, persona: string): SeededKey {
  const line = table.split('\n').find((candidate) => candidate.startsWith(`${persona}  `));
  const cells = line?.trim().split(/\s+/);
  const key = cells?.[3];
  const keyId = cells?.[2];
  assert.ok(key !== undefined && key.startsWith('lab_'), `no key for ${persona}`);
  assert.ok(keyId !== undefined && keyId.startsWith('key-'), `no key code for ${persona}`);
  return { key, keyId };
}

export interface SeededPagePassword {
  readonly password: string;
  readonly passwordId: string;
}

/** Read one persona's page password and its code from the `seed-keys` table. */
export function pagePasswordOf(table: string, persona: string): SeededPagePassword {
  const line = table.split('\n').find((candidate) => candidate.startsWith(`${persona}  `));
  const cells = line?.trim().split(/\s+/);
  const password = cells?.[5];
  const passwordId = cells?.[4];
  assert.ok(password !== undefined && password.startsWith('trang_'), `no page password for ${persona}`);
  assert.ok(passwordId !== undefined && passwordId.startsWith('pwd-'), `no page password code for ${persona}`);
  return { password, passwordId };
}

/** A key the identity CLI just issued, for the revocation and read-only cases. */
export function issueKey(
  env: NodeJS.ProcessEnv,
  employee: string,
  scope?: 'full' | 'read_only',
  caller = 'tho-than-desktop',
): SeededKey {
  const args = ['issue', '--employee', employee, '--caller', caller];
  if (scope !== undefined) args.push('--scope', scope);
  const output = runCli('keys-main.js', args, env);
  const keyId = /^key_id:\s+(\S+)\r?$/m.exec(output)?.[1];
  const key = /^key:\s+(\S+)\r?$/m.exec(output)?.[1];
  assert.ok(keyId !== undefined && key !== undefined, `keys issue printed no key for ${employee}`);
  return { key, keyId };
}

export function traceTable(env: NodeJS.ProcessEnv, args: readonly string[] = []): string {
  return runCli('trace-main.js', ['--limit', '1000', ...args], env);
}
