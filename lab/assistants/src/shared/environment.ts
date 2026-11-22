import { execFileSync } from 'node:child_process';
import { arch, cpus, platform, release, totalmem, version } from 'node:os';
import { relative, resolve, sep } from 'node:path';

/** Everything a reader needs to judge whether two assistant runs are comparable. */
export interface AssistantEnvironment {
  readonly commit: string;
  readonly commit_short: string;
  /** True when a tracked or untracked change exists outside the output folder. */
  readonly dirty: boolean;
  readonly node: string;
  readonly os: {
    readonly platform: string;
    readonly release: string;
    readonly version: string;
    readonly arch: string;
  };
  readonly cpu: {
    readonly model: string;
    readonly count: number;
    readonly speed_mhz: number;
  };
  readonly memory_total_bytes: number;
  readonly timezone: string;
}

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

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
    if (statusCode.includes('R') || statusCode.includes('C')) index += 1;
    if (outputPrefix !== null && (path === outputPrefix || path.startsWith(`${outputPrefix}/`))) continue;
    return true;
  }

  return false;
}

/** The same provenance the measure command records, so both result files read alike. */
export function readEnvironment(repoRoot: string, outDir: string): AssistantEnvironment {
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
