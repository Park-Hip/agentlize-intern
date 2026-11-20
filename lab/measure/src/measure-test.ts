import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { discoverScenarios } from './discovery.js';
import { readMeasurement } from './result.js';
import { percentile, summarize } from './stats.js';
import { SAFETY_COUNTER_IDS } from './types.js';

const MEASURE_DIR = fileURLToPath(new URL('..', import.meta.url));

test('measure: the scenario folder is the registry', async () => {
  const scenarios = await discoverScenarios();
  assert.ok(scenarios.some((scenario) => scenario.name === 'm1-gateway'));
  for (const scenario of scenarios) {
    assert.match(scenario.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(scenario.description.length > 0);
    assert.equal(typeof scenario.run, 'function');
  }
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
    const run = spawnSync(
      process.execPath,
      [join(MEASURE_DIR, 'dist', 'cli.js'), 'm1-gateway', '--runs', '2', '--out', outDir],
      {
        cwd: join(MEASURE_DIR, '..'),
        env: process.env,
        encoding: 'utf8',
        timeout: 300_000,
      },
    );
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
    assert.equal(result.schema, 2);
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
