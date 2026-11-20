import { execFileSync } from 'node:child_process';
import { arch, cpus, platform, release, totalmem, version } from 'node:os';
import { relative, resolve, sep } from 'node:path';
import type { MeasurementEnvironment } from './types.js';

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

/**
 * True when a change exists outside the folder the run writes its result to.
 * The result file of this run is not source, so it must not mark the run dirty.
 * Git reports untracked files only, never ignored build output.
 */
function isDirty(repoRoot: string, outDir: string): boolean {
  const status = execFileSync(
    'git',
    ['-C', repoRoot, 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { encoding: 'utf8' },
  );
  const entries = status.split('\0').filter((entry) => entry !== '');
  const outRelative = relative(repoRoot, resolve(outDir)).split(sep).join('/');
  const outputPrefix =
    outRelative !== '' && outRelative !== '..' && !outRelative.startsWith('../') ? outRelative : null;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? '';
    const statusCode = entry.slice(0, 2);
    const path = entry.slice(3).split(sep).join('/');
    // A rename or copy puts the original path in the next NUL-separated entry.
    if (statusCode.includes('R') || statusCode.includes('C')) index += 1;
    if (outputPrefix !== null && (path === outputPrefix || path.startsWith(`${outputPrefix}/`))) continue;
    return true;
  }

  return false;
}

/** Everything a reader needs to judge whether two result files are comparable. */
export function readEnvironment(repoRoot: string, outDir: string): MeasurementEnvironment {
  const commit = git(repoRoot, ['rev-parse', 'HEAD']);
  const commitShort = git(repoRoot, ['rev-parse', '--short=7', 'HEAD']);
  const firstCpu = cpus()[0];

  return {
    commit,
    commit_short: commitShort,
    dirty: isDirty(repoRoot, outDir),
    node: process.version,
    os: {
      platform: platform(),
      release: release(),
      version: version(),
      arch: arch(),
    },
    cpu: {
      model: firstCpu?.model.trim() ?? 'unknown',
      count: cpus().length,
      speed_mhz: firstCpu?.speed ?? 0,
    },
    memory_total_bytes: totalmem(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
