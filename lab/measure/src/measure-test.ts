import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { discoverScenarios } from './discovery.js';
import { readMeasurement } from './result.js';
import { measureScenario } from './runner.js';
import { safetyCounter } from './safety.js';
import { percentile, summarize } from './stats.js';
import { SAFETY_COUNTER_IDS, type Scenario } from './types.js';

const MEASURE_DIR = fileURLToPath(new URL('..', import.meta.url));

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, [join(MEASURE_DIR, 'dist', 'cli.js'), ...args], {
    cwd: join(MEASURE_DIR, '..'),
    env: process.env,
    encoding: 'utf8',
    timeout: 300_000,
  });
}

test('measure: the scenario folder is the registry', async () => {
  const scenarios = await discoverScenarios();
  assert.ok(scenarios.some((scenario) => scenario.name === 'm1-gateway'));
  for (const scenario of scenarios) {
    assert.match(scenario.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(scenario.description.length > 0);
    assert.equal(typeof scenario.run, 'function');
    assert.equal(typeof scenario.needs.stack, 'boolean');
    assert.equal(typeof scenario.needs.target, 'boolean');
  }

  const byName = new Map(scenarios.map((scenario) => [scenario.name, scenario]));
  assert.deepEqual(byName.get('m1-gateway')?.needs, { stack: true, target: false });
  assert.deepEqual(byName.get('m4-load')?.needs, { stack: true, target: false });
  assert.deepEqual(byName.get('q1-outbox')?.needs, { stack: false, target: true });
  assert.deepEqual(byName.get('m2-scenarios')?.needs, { stack: false, target: true });
});

test('measure: --target is parsed and an unknown name stops the command before anything starts', () => {
  const unknown = runCli(['q1-outbox', '--target', 'nosuch']);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /--target must be one of .*gateway.*, got "nosuch"/);
  assert.equal(unknown.stdout.trim(), '', 'no stack log and no result line');

  const empty = runCli(['q1-outbox', '--target=']);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /--target must not be empty/);

  const missing = runCli(['q1-outbox', '--target']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--target needs a value/);
});

test('measure: a scenario without a target rejects --target', () => {
  const rejected = runCli(['m1-gateway', '--target=gateway']);
  assert.equal(rejected.status, 1);
  assert.match(
    rejected.stderr,
    /m1-gateway does not run against a write target, so --target gateway is not allowed/,
  );
  assert.equal(rejected.stdout.trim(), '', 'the command stopped before it built the stack');
});

test('measure: --variant is parsed and a name that is not kebab-case stops the command', () => {
  const bad = runCli(['q1-outbox', '--variant', 'ServerCrash']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--variant must be a short kebab-case name/);
  assert.equal(bad.stdout.trim(), '', 'no stack log and no result line');

  const empty = runCli(['q1-outbox', '--variant=']);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /--variant must not be empty/);

  const missing = runCli(['q1-outbox', '--variant']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--variant needs a value/);

  const valued = runCli(['q1-outbox', '--force=yes']);
  assert.equal(valued.status, 1);
  assert.match(valued.stderr, /--force takes no value/);
});

test('measure: a target-only scenario builds no shared stack and records the target', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'agentlize-measure-target-only-'));
  let stackBuilds = 0;
  try {
    const scenario: Scenario = {
      name: 'probe-target-only',
      description: 'A probe that needs the write target and no shared stack.',
      needs: { stack: false, target: true },

      async run(context) {
        assert.equal(context.target, 'gateway');
        assert.throws(() => context.services, /did not declare that it needs the shared stack/);
        return {
          samples: [
            {
              door: 'probe',
              tool: 'probe',
              run: 1,
              client_ms: 1,
              gateway_duration_ms: null,
              trace_id: null,
              status: 200,
              reason_code: null,
            },
          ],
          safety: [
            safetyCounter('duplicate_writes', false, null, 'The probe writes nothing.'),
            safetyCounter('lost_commands', false, null, 'The probe writes nothing.'),
            safetyCounter('unauthorized_writes', false, null, 'The probe writes nothing.'),
            safetyCounter('out_of_scope_fields', false, null, 'The probe reads no business record.'),
            safetyCounter('personal_data_in_trace', false, null, 'The probe reads no trace table.'),
          ],
          parameters: { probe: true },
        };
      },
    };

    const outcome = await measureScenario(scenario, {
      runs: 1,
      target: 'gateway',
      variant: null,
      force: false,
      outDir,
      repoRoot: join(MEASURE_DIR, '..', '..'),
      command: 'npm run measure -- probe-target-only --target gateway --runs 1',
      startStack: async () => {
        stackBuilds += 1;
        throw new Error('a target-only scenario must not build the shared stack');
      },
      log: () => {},
    });

    assert.equal(stackBuilds, 0);
    assert.equal(outcome.result.schema, 4);
    assert.equal(outcome.result.write_target, 'gateway');
    assert.equal(outcome.result.variant, null);
    assert.deepEqual(outcome.result.parameters, { probe: true });
    assert.match(basename(outcome.file), /^\d{4}-\d{2}-\d{2}-probe-target-only-gateway-[0-9a-f]{7}\.json$/);
    assert.match(
      basename(outcome.samplesFile),
      /^\d{4}-\d{2}-\d{2}-probe-target-only-gateway-[0-9a-f]{7}\.samples\.ndjson\.gz$/,
    );
    const loaded = await readMeasurement(outcome.file);
    assert.equal(loaded.summary.write_target, 'gateway');
    assert.equal(loaded.summary.variant, null);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('measure: a variant gets its own file name and no run writes over an existing result', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'agentlize-measure-variant-'));
  try {
    const scenario: Scenario = {
      name: 'probe-variant',
      description: 'A probe that records one sample and builds nothing.',
      needs: { stack: false, target: true },

      async run(context) {
        assert.equal(context.target, 'gateway');
        return {
          samples: [
            {
              door: 'probe',
              tool: 'probe',
              run: 1,
              client_ms: 1,
              gateway_duration_ms: null,
              trace_id: null,
              status: 200,
              reason_code: null,
            },
          ],
          safety: [
            safetyCounter('duplicate_writes', false, null, 'The probe writes nothing.'),
            safetyCounter('lost_commands', false, null, 'The probe writes nothing.'),
            safetyCounter('unauthorized_writes', false, null, 'The probe writes nothing.'),
            safetyCounter('out_of_scope_fields', false, null, 'The probe reads no business record.'),
            safetyCounter('personal_data_in_trace', false, null, 'The probe reads no trace table.'),
          ],
        };
      },
    };

    const options = (variant: string | null, force: boolean) => ({
      runs: 1,
      target: 'gateway' as const,
      variant,
      force,
      outDir,
      repoRoot: join(MEASURE_DIR, '..', '..'),
      command: 'npm run measure -- probe-variant --target gateway --runs 1',
      log: () => {},
    });

    const first = await measureScenario(scenario, options(null, false));
    assert.match(basename(first.file), /^\d{4}-\d{2}-\d{2}-probe-variant-gateway-[0-9a-f]{7}\.json$/);
    assert.equal(first.result.variant, null);
    assert.equal((await readdir(outDir)).length, 2);

    // The same name again stops before a single run is made and writes nothing.
    await assert.rejects(measureScenario(scenario, options(null, false)), /already exists; pass --force/);
    assert.equal((await readdir(outDir)).length, 2, 'the blocked run wrote no file');

    // --force is the explicit way over the existing result.
    const forced = await measureScenario(scenario, options(null, true));
    assert.equal(basename(forced.file), basename(first.file));
    assert.equal((await readdir(outDir)).length, 2, 'force wrote over the same two files');

    // A variant run lands in its own file, named after the target, and is recorded.
    const varied = await measureScenario(scenario, options('short-outage', false));
    assert.match(basename(varied.file), /^\d{4}-\d{2}-\d{2}-probe-variant-gateway-short-outage-[0-9a-f]{7}\.json$/);
    assert.match(
      basename(varied.samplesFile),
      /^\d{4}-\d{2}-\d{2}-probe-variant-gateway-short-outage-[0-9a-f]{7}\.samples\.ndjson\.gz$/,
    );
    assert.equal(varied.result.variant, 'short-outage');
    assert.equal(varied.result.write_target, 'gateway');
    assert.equal((await readdir(outDir)).length, 4);
    const loaded = await readMeasurement(varied.file);
    assert.equal(loaded.summary.variant, 'short-outage');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('measure: readMeasurement still opens a schema 2 result from the repository', async () => {
  const file = join(
    MEASURE_DIR,
    '..',
    '..',
    'rd',
    'evaluation',
    'results',
    '2026-11-20-q1-outbox-gateway-7b7ae94.json',
  );
  const loaded = await readMeasurement(file);
  assert.equal(loaded.summary.schema, 2);
  assert.equal(loaded.summary.write_target, undefined);
  assert.equal(loaded.summary.variant, undefined);
  assert.ok(loaded.samples.length > 0);
});

test('measure: percentiles use the nearest rank stated in the README', () => {
  assert.equal(percentile([1, 2, 3, 4], 50), 2);
  assert.equal(percentile([1, 2, 3, 4], 95), 4);
  assert.deepEqual(summarize([2, 1]), {
    count: 2,
    p50_ms: 1,
    p95_ms: 2,
    max_ms: 2,
    min_ms: 1,
    mean_ms: 1.5,
  });
});

test('measure: m1-gateway writes a result for 2 runs of every tool and door', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'agentlize-measure-smoke-'));
  try {
    const run = runCli(['m1-gateway', '--runs', '2', '--out', outDir]);
    assert.equal(run.status, 0, `measure failed:\n${run.stdout}\n${run.stderr}\n${String(run.error)}`);

    const files = await readdir(outDir);
    assert.equal(files.length, 2, `expected a summary and a sample file, got ${files.join(', ')}`);
    const summaryName = files.find((file) => file.endsWith('.json')) ?? '';
    const samplesName = files.find((file) => file.endsWith('.samples.ndjson.gz')) ?? '';
    assert.match(summaryName, /^\d{4}-\d{2}-\d{2}-m1-gateway-[0-9a-f]{7}\.json$/);
    assert.match(samplesName, /^\d{4}-\d{2}-\d{2}-m1-gateway-[0-9a-f]{7}\.samples\.ndjson\.gz$/);
    assert.equal(
      samplesName.slice(0, -'.samples.ndjson.gz'.length),
      summaryName.slice(0, -'.json'.length),
    );

    const loaded = await readMeasurement(join(outDir, summaryName));
    const result = loaded.summary;
    const samples = loaded.samples;
    assert.equal(result.schema, 4);
    assert.equal(result.write_target, null);
    assert.equal(result.variant, null);
    assert.equal('samples' in result, false);
    assert.equal(result.samples_file.name, samplesName);
    assert.equal(result.samples_file.count, 2 * 6 * 3);
    assert.equal(
      result.samples_file.sha256,
      createHash('sha256').update(await readFile(join(outDir, samplesName))).digest('hex'),
    );
    assert.equal(result.scenario.name, 'm1-gateway');
    assert.equal(result.runs, 2);
    assert.match(result.command, /^npm run measure -- m1-gateway --runs 2 --out /);
    assert.ok(result.elapsed_seconds > 0);

    assert.equal(samples.length, 2 * 6 * 3);
    const groups = new Map<string, number>();
    for (const sample of samples) {
      groups.set(`${sample.door}/${sample.tool}`, (groups.get(`${sample.door}/${sample.tool}`) ?? 0) + 1);
      assert.ok(sample.client_ms >= 0);
      assert.equal(typeof sample.gateway_duration_ms, 'number');
      assert.match(sample.trace_id ?? '', /^tr-[0-9a-f]+$/);
      assert.equal(sample.status, 200);
      assert.ok(sample.reason_code === null || sample.reason_code === 'NEEDS_APPROVAL');
    }
    assert.equal(groups.size, 18);
    assert.ok([...groups.values()].every((count) => count === 2));

    const client = summarize(samples.map((sample) => sample.client_ms));
    const gateway = summarize(
      samples
        .map((sample) => sample.gateway_duration_ms)
        .filter((value): value is number => value !== null),
    );
    assert.deepEqual(result.summary.overall.client_ms, client);
    assert.deepEqual(result.summary.overall.gateway_duration_ms, gateway);
    assert.equal(result.summary.overall.client_ms?.p50_ms, client?.p50_ms);
    assert.equal(result.summary.overall.client_ms?.p95_ms, client?.p95_ms);
    assert.equal(result.summary.overall.client_ms?.count, 36);
    assert.equal(result.summary.overall.gateway_duration_ms?.count, 36);
    assert.equal(result.summary.by_door_tool.length, 18);

    assert.equal(result.safety.counters.length, 5);
    assert.deepEqual(
      result.safety.counters.map((counter) => counter.id).sort(),
      [...SAFETY_COUNTER_IDS].sort(),
    );
    assert.equal(result.safety.all_applicable_zero, true);
    for (const counter of result.safety.counters) {
      if (counter.applicable) assert.equal(counter.value, 0, counter.id);
      else assert.equal(counter.value, null, counter.id);
    }

    assert.match(result.environment.commit, /^[0-9a-f]{40}$/);
    assert.match(result.environment.commit_short, /^[0-9a-f]{7}$/);
    assert.equal(typeof result.environment.dirty, 'boolean');
    assert.match(result.environment.node, /^v\d+\./);
    assert.ok(result.environment.cpu.count > 0);
    assert.ok(result.environment.memory_total_bytes > 0);

    assert.equal(result.targets.length, 1);
    assert.equal(result.targets[0]?.id, 'm1-gateway-p95-50ms');
    assert.equal(result.targets[0]?.enforced, false);
    assert.equal(typeof result.targets[0]?.observed_ms, 'number');

    await writeFile(join(outDir, samplesName), gzipSync('[]\n'));
    await assert.rejects(readMeasurement(join(outDir, summaryName)), /sha256/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
