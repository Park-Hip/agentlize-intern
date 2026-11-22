import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SR_IDS, labRoot, loadSrMap } from './sr.js';

interface ParsedString {
  readonly value: string;
  readonly end: number;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '0': '\0',
  'n': '\n',
  'r': '\r',
  't': '\t',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '`': '`',
};

const SKIP_DIRS = new Set(['node_modules', 'dist', '.data', '.git']);

function decodeEscape(char: string): string {
  return ESCAPES[char] ?? char;
}

function readQuoted(source: string, start: number): ParsedString | undefined {
  const quote = source[start];
  if (quote !== "'" && quote !== '"') return undefined;

  let value = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === undefined) return undefined;
    if (char === '\\') {
      const next = source[index + 1];
      if (next === undefined) return undefined;
      value += decodeEscape(next);
      index += 1;
      continue;
    }
    if (char === quote) return { value, end: index + 1 };
    if (char === '\n' || char === '\r') return undefined;
    value += char;
  }
  return undefined;
}

function readTemplate(source: string, start: number): ParsedString | undefined {
  let value = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === undefined) return undefined;
    if (char === '\\') {
      const next = source[index + 1];
      if (next === undefined) return undefined;
      value += decodeEscape(next);
      index += 1;
      continue;
    }
    if (char === '`') return { value, end: index + 1 };
    if (char === '$' && source[index + 1] === '{') {
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        const inner = source[index];
        if (inner === '{') depth += 1;
        else if (inner === '}') depth -= 1;
        index += 1;
      }
      value += '.*';
      index -= 1;
      continue;
    }
    value += char;
  }
  return undefined;
}

/** Every name a `test(...)` or `t.test(...)` call declares, with `${...}` read as `.*`. */
function declarationNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/\btest\s*\(/g)) {
    let index = (match.index ?? 0) + match[0].length;
    while (index < source.length && /\s/.test(source[index] ?? '')) index += 1;
    const first = source[index];
    const parsed = first === '`' ? readTemplate(source, index) : readQuoted(source, index);
    if (parsed !== undefined && parsed.value !== '') names.push(parsed.value);
  }
  return names;
}

function collectTestSources(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('-test.ts')) {
        files.push(join(dir, entry.name));
      }
    }
  };
  walk(root);
  return files;
}

test('sr map: every requirement pattern matches at least one declared test', () => {
  const map = loadSrMap();
  assert.deepEqual(Object.keys(map), [...SR_IDS]);

  const declared = new Set<string>();
  for (const file of collectTestSources(labRoot)) {
    for (const name of declarationNames(readFileSync(file, 'utf8'))) declared.add(name);
  }
  assert.ok(declared.size > 0, 'the scan must find at least one test declaration');

  for (const id of SR_IDS) {
    const patterns = map[id].patterns;
    assert.ok(patterns.length > 0, `${id} must declare at least one pattern`);

    for (const pattern of patterns) {
      const regex = (() => {
        try {
          return new RegExp(pattern);
        } catch {
          assert.fail(`${id} has an invalid pattern: ${pattern}`);
        }
      })();
      assert.ok(
        [...declared].some((name) => regex.test(name)),
        `${id} pattern matches no declared test: ${pattern}`,
      );
    }
  }
});
