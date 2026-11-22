import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from 'node:test';

export const SR_IDS = ['SR1', 'SR2', 'SR3', 'SR4', 'SR5', 'SR6', 'SR7', 'SR8'] as const;

export type SrId = (typeof SR_IDS)[number];

export interface Requirement {
  readonly name: string;
  readonly patterns: readonly string[];
}

export type SrMap = Readonly<Record<SrId, Requirement>>;

export interface TestOutcome {
  readonly file: string;
  readonly fullName: string;
  readonly testNumber: number;
  readonly passed: boolean;
}

interface RequirementRow {
  readonly id: SrId;
  readonly name: string;
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
}

const SKIP_DIRS = new Set(['node_modules', '.data', '.git']);

export const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Load and check `scripts/sr-map.json`; every input error names the field to fix. */
export function loadSrMap(path: string = join(labRoot, 'scripts', 'sr-map.json')): SrMap {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(raw)) throw new Error(`${path}: the map must be one JSON object`);

  const keys = Object.keys(raw);
  if (keys.length !== SR_IDS.length || !SR_IDS.every((id) => keys.includes(id))) {
    throw new Error(`${path}: the map must hold exactly ${SR_IDS.join(', ')}`);
  }

  const result = {} as Record<SrId, Requirement>;
  for (const id of SR_IDS) {
    const entry = raw[id];
    if (!isRecord(entry)) throw new Error(`${path}: ${id} must be an object`);

    const name = entry.name;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(`${path}: ${id}.name must be a non-empty string`);
    }

    const patterns = entry.patterns;
    if (!Array.isArray(patterns) || patterns.length === 0) {
      throw new Error(`${path}: ${id}.patterns must be a non-empty array`);
    }

    const clean: string[] = [];
    for (const pattern of patterns) {
      if (typeof pattern !== 'string' || pattern === '') {
        throw new Error(`${path}: ${id}.patterns must hold non-empty strings`);
      }
      try {
        new RegExp(pattern);
      } catch {
        throw new Error(`${path}: ${id} has an invalid pattern: ${pattern}`);
      }
      clean.push(pattern);
    }

    result[id] = { name, patterns: clean };
  }
  return result;
}

/** Every compiled test file, the same set `npm test` runs. */
export function collectTestFiles(root: string = labRoot): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('-test.js')) {
        files.push(join(dir, entry.name));
      }
    }
  };
  walk(root);
  return files.sort();
}

/** Run the compiled tests once and keep the full name of every result. */
export async function runTests(files: readonly string[]): Promise<TestOutcome[]> {
  const stacks = new Map<string, string[]>();
  const outcomes: TestOutcome[] = [];

  for await (const event of run({ files, concurrency: true })) {
    if (event.type === 'test:start') {
      const file = event.data.file ?? '';
      const stack = stacks.get(file) ?? [];
      stack.length = event.data.nesting;
      stack[event.data.nesting] = event.data.name;
      stacks.set(file, stack);
    } else if (event.type === 'test:pass' || event.type === 'test:fail') {
      const file = event.data.file ?? '';
      const stack = stacks.get(file) ?? [];
      const fullName = stack.length === 0 ? event.data.name : stack.slice(0, event.data.nesting + 1).join(' > ');
      outcomes.push({
        file,
        fullName,
        testNumber: event.data.testNumber,
        passed: event.type === 'test:pass' && event.data.skip === undefined && event.data.todo === undefined,
      });
    }
  }

  return outcomes;
}

function countByRequirement(map: SrMap, outcomes: readonly TestOutcome[]): RequirementRow[] {
  const rows = SR_IDS.map((id) => ({
    id,
    name: map[id].name,
    regexes: map[id].patterns.map((pattern) => new RegExp(pattern)),
    tests: 0,
    passed: 0,
    failed: 0,
  }));

  for (const outcome of outcomes) {
    for (const row of rows) {
      if (!row.regexes.some((regex) => regex.test(outcome.fullName))) continue;
      row.tests += 1;
      if (outcome.passed) row.passed += 1;
      else row.failed += 1;
    }
  }

  return rows.map(({ id, name, tests, passed, failed }) => ({ id, name, tests, passed, failed }));
}

function printTable(rows: readonly RequirementRow[]): void {
  const labels = rows.map((row) => `${row.id} (${row.name})`);
  const labelWidth = Math.max('Yêu cầu'.length, ...labels.map((label) => label.length));
  const countWidth = Math.max('Phép thử'.length, ...rows.map((row) => String(row.tests).length));

  console.log(`${'Yêu cầu'.padEnd(labelWidth)}  ${'Phép thử'.padStart(countWidth)}  ${'Đạt'.padStart(5)}  ${'Hỏng'.padStart(5)}`);
  console.log(`${'-'.repeat(labelWidth)}  ${'-'.repeat(countWidth)}  ${'-'.repeat(5)}  ${'-'.repeat(5)}`);
  for (const [index, row] of rows.entries()) {
    console.log(
      `${labels[index]?.padEnd(labelWidth) ?? ''}  ${String(row.tests).padStart(countWidth)}  ${String(row.passed).padStart(5)}  ${String(row.failed).padStart(5)}`,
    );
  }
}

/** Run the report; the returned number is the process exit code. */
export async function report(): Promise<number> {
  const map = loadSrMap();
  const files = collectTestFiles();
  if (files.length === 0) throw new Error(`${labRoot}: no compiled test file, run npm run build first`);

  const outcomes = await runTests(files);
  const rows = countByRequirement(map, outcomes);
  printTable(rows);

  const failedTests = outcomes.filter((outcome) => !outcome.passed);
  const emptyRows = rows.filter((row) => row.tests === 0);
  const failedRows = rows.filter((row) => row.failed > 0);

  console.log('');
  console.log(`Toàn bộ: ${outcomes.length} phép thử, ${outcomes.length - failedTests.length} đạt, ${failedTests.length} hỏng.`);

  for (const row of emptyRows) {
    console.log(`Yêu cầu ${row.id} không có phép thử nào khớp trong file ánh xạ.`);
  }

  if (failedTests.length > 0) {
    console.log('');
    console.log('Phép thử hỏng:');
    for (const outcome of failedTests) {
      console.log(`- ${outcome.fullName} (${relative(labRoot, outcome.file)})`);
    }
  }

  return emptyRows.length > 0 || failedRows.length > 0 || failedTests.length > 0 ? 1 : 0;
}

const enteredDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (enteredDirectly) {
  process.exitCode = await report();
}
