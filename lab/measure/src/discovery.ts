import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Scenario } from './types.js';

/** `dist/scenarios` next to the compiled CLI; discovery runs after `tsc`. */
export const SCENARIO_DIR = join(dirname(fileURLToPath(import.meta.url)), 'scenarios');

const SCENARIO_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isScenario(value: unknown): value is Scenario {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { name?: unknown; description?: unknown; run?: unknown };
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.run === 'function'
  );
}

/**
 * Import every `.js` file in `src/scenarios/` once it is compiled. Adding a
 * measurement is adding a file: no registry, no import list, no switch.
 */
export async function discoverScenarios(): Promise<Scenario[]> {
  const entries = await readdir(SCENARIO_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('-test.js'))
    .map((entry) => entry.name)
    .sort();

  const scenarios: Scenario[] = [];
  for (const file of files) {
    const module = (await import(pathToFileURL(join(SCENARIO_DIR, file)).href)) as { default?: unknown };
    if (!isScenario(module.default)) {
      throw new Error(`scenario ${file} must default-export { name, description, run(context) }`);
    }
    const expectedName = file.slice(0, -'.js'.length);
    if (!SCENARIO_NAME.test(expectedName)) {
      throw new Error(`scenario file ${file} must be lowercase kebab-case`);
    }
    if (module.default.name !== expectedName) {
      throw new Error(`scenario ${file} exports name "${module.default.name}", expected "${expectedName}"`);
    }
    scenarios.push(module.default);
  }

  return scenarios;
}

export async function findScenario(name: string): Promise<Scenario> {
  const scenarios = await discoverScenarios();
  const scenario = scenarios.find((candidate) => candidate.name === name);
  if (scenario === undefined) {
    const names = scenarios.map((candidate) => candidate.name).join(', ') || 'none';
    throw new Error(`unknown scenario "${name}"; available: ${names}`);
  }
  return scenario;
}
