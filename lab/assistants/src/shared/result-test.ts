import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildAssistantSummary, readAssistantResult, writeAssistantResult, type AssistantSample } from './result.js';
import { findJob } from './jobs.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** `lab/assistants/dist/shared` -> the repository root. */
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

const SAMPLES: readonly AssistantSample[] = [
  {
    run: 1,
    job: 'lookup-minh-phone',
    door: 'mcp',
    persona: 'hoa',
    turn_id: 'turn-test-1',
    correct: true,
    grade_reason: 'phone_not_shown',
    stop_reason: 'answer',
    model_ms: 120.5,
    gateway_ms: 12,
    total_ms: 140,
    model_calls: 2,
    tool_calls: 1,
    input_tokens: 240,
    output_tokens: 36,
    cost_usd: 0.000029,
    usage_reported: true,
    tools: ['find_employee'],
    reason_codes: [null],
  },
  {
    run: 2,
    job: 'lookup-minh-phone',
    door: 'mcp',
    persona: 'hoa',
    turn_id: 'turn-test-2',
    correct: false,
    grade_reason: 'phone_leaked',
    stop_reason: 'answer',
    model_ms: 130.5,
    gateway_ms: 12,
    total_ms: 150,
    model_calls: 2,
    tool_calls: 1,
    input_tokens: 240,
    output_tokens: 36,
    cost_usd: 0.000029,
    usage_reported: true,
    tools: ['find_employee'],
    reason_codes: [null],
  },
];

test('result: the summary counts correct runs and reports p50, max and mean', () => {
  const summary = buildAssistantSummary(SAMPLES);
  assert.equal(summary.runs, 2);
  assert.equal(summary.correct_runs, 1);
  assert.deepEqual(summary.model_ms, { count: 2, p50_ms: 120.5, max_ms: 130.5, mean_ms: 125.5 });
  assert.deepEqual(summary.gateway_ms, { count: 2, p50_ms: 12, max_ms: 12, mean_ms: 12 });
  assert.equal(summary.input_tokens, 480);
  assert.equal(summary.output_tokens, 72);
  assert.equal(summary.cost_usd, 0.000058);
});

test('result: one write produces the summary and the gzipped samples, and readAssistantResult checks both', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'lab-assistant-result-'));
  const job = findJob('lookup-minh-phone');
  assert.ok(job !== undefined);
  try {
    const written = await writeAssistantResult({
      outDir,
      repoRoot: REPO_ROOT,
      command: 'npm run assistant -- --door mcp --job lookup-minh-phone --runs 2',
      model: 'deepseek-flash',
      door: 'mcp',
      job,
      runs: 2,
      samples: SAMPLES,
      now: new Date('2026-11-22T00:00:00Z'),
    });

    const name = basename(written.file);
    assert.match(name, /^\d{4}-\d{2}-\d{2}-assistant-mcp-lookup-minh-phone-[0-9a-f]{7}\.json$/);
    assert.equal(written.result.kind, 'assistant');
    assert.equal(written.result.summary.correct_runs, 1);
    assert.equal(written.result.samples_file.count, 2);
    assert.equal(written.result.environment.commit.length, 40);
    assert.match(written.result.samples_file.name, /\.samples\.ndjson\.gz$/);

    const loaded = await readAssistantResult(written.file);
    assert.equal(loaded.samples.length, 2);
    assert.equal(loaded.samples[0]?.grade_reason, 'phone_not_shown');
    assert.equal(loaded.samples[1]?.correct, false);

    const files = await readdir(outDir);
    assert.deepEqual(
      files.sort(),
      [basename(written.file), basename(written.samplesFile)].sort(),
    );

    await assert.rejects(
      writeAssistantResult({
        outDir,
        repoRoot: REPO_ROOT,
        command: 'again',
        model: 'deepseek-flash',
        door: 'mcp',
        job,
        runs: 2,
        samples: SAMPLES,
        now: new Date('2026-11-22T00:00:00Z'),
      }),
      /already exists/,
    );

    await assert.doesNotReject(
      writeAssistantResult({
        outDir,
        repoRoot: REPO_ROOT,
        command: 'again',
        model: 'deepseek-flash',
        door: 'mcp',
        job,
        runs: 2,
        samples: SAMPLES,
        now: new Date('2026-11-22T00:00:00Z'),
        force: true,
      }),
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
