import { dirname, join, resolve } from 'node:path';
import { labRoot } from '@lab/tests/process';
import { discoverScenarios, findScenario } from './discovery.js';
import { measureScenario } from './runner.js';
import { DEFAULT_TARGET, TARGET_NAMES, parseTargetName } from './targets/index.js';

const DEFAULT_RUNS = 100;
const MAX_RUNS = 100_000;

export interface ParsedArguments {
  readonly scenario: string | null;
  /** The raw `--target` value; undefined means the user did not pass it. */
  readonly target: string | undefined;
  readonly runs: number;
  readonly out: string | undefined;
  readonly help: boolean;
}

function readValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} needs a value`);
  }
  return value;
}

export function parseArguments(argv: readonly string[]): ParsedArguments {
  let scenario: string | null = null;
  let target: string | undefined;
  let runs = DEFAULT_RUNS;
  let out: string | undefined;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }

    const [option, inline] = argument.startsWith('--') ? argument.split('=', 2) : [argument, undefined];
    if (option === '--target') {
      target = inline ?? readValue(argv, index, '--target');
      if (inline === undefined) index += 1;
      if (target.trim() === '') throw new Error('--target must not be empty');
      continue;
    }
    if (option === '--runs') {
      const value = inline ?? readValue(argv, index, '--runs');
      if (inline === undefined) index += 1;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_RUNS) {
        throw new Error(`--runs must be a whole number from 1 to ${MAX_RUNS}, got "${value}"`);
      }
      runs = parsed;
      continue;
    }
    if (option === '--out') {
      out = inline ?? readValue(argv, index, '--out');
      if (inline === undefined) index += 1;
      if (out.trim() === '') throw new Error('--out must not be empty');
      continue;
    }
    if (option.startsWith('-')) throw new Error(`unknown option "${argument}"`);
    if (scenario !== null) throw new Error(`only one scenario name is allowed, got "${scenario}" and "${argument}"`);
    scenario = argument;
  }

  return { scenario, target, runs, out, help };
}

function shellArgument(value: string): string {
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

async function usage(): Promise<string> {
  const scenarios = await discoverScenarios();
  const lines = [
    'Usage: npm run measure -- <scenario> [--target <target>] [--runs N] [--out <folder>]',
    '',
    'Runs one measurement. --target picks the write target for a scenario that uses one;',
    'the default is gateway. Only a scenario that declares the shared stack builds it.',
    '--runs defaults to 100; --out defaults to rd/evaluation/results/.',
    '',
    `Targets: ${TARGET_NAMES.join(', ')}`,
    '',
    'Scenarios:',
    ...(scenarios.length === 0 ? ['  (none)'] : scenarios.map((scenario) => `  ${scenario.name}  ${scenario.description}`)),
  ];
  return lines.join('\n');
}

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArguments(argv);
  if (args.help || args.scenario === null) {
    console.log(await usage());
    return args.help ? 0 : 1;
  }

  // Check the target name before a scenario is loaded and before any process starts.
  const explicitTarget = args.target === undefined ? undefined : parseTargetName(args.target);
  const scenario = await findScenario(args.scenario);
  if (!scenario.needs.target && explicitTarget !== undefined) {
    throw new Error(
      `${scenario.name} does not run against a write target, so --target ${explicitTarget} is not allowed`,
    );
  }
  const target = scenario.needs.target ? (explicitTarget ?? DEFAULT_TARGET) : null;
  const repoRoot = dirname(labRoot);
  const outDir = args.out === undefined ? join(repoRoot, 'rd', 'evaluation', 'results') : resolve(args.out);
  const command = [
    'npm run measure --',
    scenario.name,
    ...(args.target === undefined ? [] : ['--target', shellArgument(args.target)]),
    '--runs',
    String(args.runs),
    ...(args.out === undefined ? [] : ['--out', shellArgument(args.out)]),
  ].join(' ');

  const outcome = await measureScenario(scenario, {
    runs: args.runs,
    target,
    outDir,
    repoRoot,
    command,
  });

  return outcome.failedCounters.length === 0 && outcome.failedTargets.length === 0 ? 0 : 1;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[measure] failed: ${message}`);
  process.exitCode = 1;
}
