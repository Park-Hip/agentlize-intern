import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readEnvironment, type AssistantEnvironment } from './environment.js';
import type { AssistantJob } from './jobs.js';

/**
 * One run of one job. It carries timings, tokens and the verdict, but never a
 * final answer or a tool result: those can hold a name or a phone number
 * (measure README, "Câu trả lời của tool không được ghi vào file").
 */
export interface AssistantSample {
  readonly run: number;
  readonly job: string;
  readonly door: string;
  readonly persona: string;
  /** The `X-Lab-Turn` code sent with every tool call of this run. */
  readonly turn_id: string;
  readonly correct: boolean;
  /** A short code such as `proposal_drafted`, never free text with data. */
  readonly grade_reason: string;
  readonly stop_reason: 'answer' | 'max_steps' | 'error';
  readonly model_ms: number;
  readonly gateway_ms: number;
  readonly total_ms: number;
  readonly model_calls: number;
  readonly tool_calls: number;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_usd: number;
  readonly usage_reported: boolean;
  readonly tools: readonly string[];
  readonly reason_codes: readonly (string | null)[];
}

/** p50 uses nearest rank, the same rule the measure command states. */
export interface Metric {
  readonly count: number;
  readonly p50_ms: number;
  readonly max_ms: number;
  readonly mean_ms: number;
}

export interface AssistantSummary {
  readonly runs: number;
  readonly correct_runs: number;
  readonly model_ms: Metric;
  readonly gateway_ms: Metric;
  readonly total_ms: Metric;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_usd: number;
}

export interface AssistantResult {
  readonly schema: 1;
  readonly kind: 'assistant';
  readonly generated_at: string;
  readonly command: string;
  readonly model: string;
  readonly door: string;
  readonly job: {
    readonly id: string;
    readonly label: string;
    readonly persona: string;
    readonly user_message: string;
  };
  readonly runs: number;
  readonly environment: AssistantEnvironment;
  readonly samples_file: {
    readonly name: string;
    readonly count: number;
    readonly sha256: string;
  };
  readonly summary: AssistantSummary;
  readonly notes: readonly string[];
}

export interface WriteAssistantResultOptions {
  readonly outDir: string;
  readonly repoRoot: string;
  readonly command: string;
  readonly model: string;
  readonly door: string;
  readonly job: AssistantJob;
  readonly runs: number;
  readonly samples: readonly AssistantSample[];
  readonly notes?: readonly string[];
  readonly force?: boolean;
  readonly now?: Date;
}

export interface AssistantResultOutcome {
  readonly file: string;
  readonly samplesFile: string;
  readonly result: AssistantResult;
  /** Repo-relative path for a log line; falls back to the absolute path. */
  readonly shownFile: string;
}

export function metricOf(values: readonly number[]): Metric {
  if (values.length === 0) return { count: 0, p50_ms: 0, max_ms: 0, mean_ms: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.ceil(sorted.length * 0.5) - 1);
  const p50 = sorted[rank] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  return {
    count: sorted.length,
    p50_ms: roundMs(p50),
    max_ms: roundMs(max),
    mean_ms: roundMs(mean),
  };
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function buildAssistantSummary(samples: readonly AssistantSample[]): AssistantSummary {
  return {
    runs: samples.length,
    correct_runs: samples.filter((sample) => sample.correct).length,
    model_ms: metricOf(samples.map((sample) => sample.model_ms)),
    gateway_ms: metricOf(samples.map((sample) => sample.gateway_ms)),
    total_ms: metricOf(samples.map((sample) => sample.total_ms)),
    input_tokens: samples.reduce((total, sample) => total + sample.input_tokens, 0),
    output_tokens: samples.reduce((total, sample) => total + sample.output_tokens, 0),
    cost_usd: roundUsd(samples.reduce((total, sample) => total + sample.cost_usd, 0)),
  };
}

function localDate(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function checksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Write the small summary and the gzipped samples, named the way issue #101
 * names a measurement result: date, kind, door, job and commit. An existing
 * file stops the run unless `--force` is set.
 */
export async function writeAssistantResult(
  options: WriteAssistantResultOptions,
): Promise<AssistantResultOutcome> {
  const environment = readEnvironment(options.repoRoot, options.outDir);
  const prefix = [
    localDate(options.now ?? new Date()),
    'assistant',
    options.door,
    options.job.id,
    environment.commit_short,
  ].join('-');
  const file = join(options.outDir, `${prefix}.json`);
  const samplesFile = join(options.outDir, `${prefix}.samples.ndjson.gz`);
  const shownFile = relative(options.repoRoot, file) || file;
  const shownSamplesFile = relative(options.repoRoot, samplesFile) || samplesFile;

  if (!options.force && (existsSync(file) || existsSync(samplesFile))) {
    throw new Error(`the result file ${shownFile} or ${shownSamplesFile} already exists; pass --force to write over it`);
  }

  const ndjson = options.samples.map((sample) => `${JSON.stringify(sample)}\n`).join('');
  const compressed = gzipSync(Buffer.from(ndjson, 'utf8'));
  const result: AssistantResult = {
    schema: 1,
    kind: 'assistant',
    generated_at: new Date().toISOString(),
    command: options.command,
    model: options.model,
    door: options.door,
    job: {
      id: options.job.id,
      label: options.job.label,
      persona: options.job.persona,
      user_message: options.job.userMessage,
    },
    runs: options.runs,
    environment,
    samples_file: {
      name: basename(samplesFile),
      count: options.samples.length,
      sha256: checksum(compressed),
    },
    summary: buildAssistantSummary(options.samples),
    notes: options.notes ?? [],
  };

  await mkdir(options.outDir, { recursive: true });
  await writeFile(samplesFile, compressed);
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  return { file, samplesFile, result, shownFile };
}

export interface LoadedAssistantResult {
  readonly summary: AssistantResult;
  readonly samples: readonly AssistantSample[];
}

/**
 * Reopen one result: read the summary, check the gzip file against the
 * recorded sha256, then return the samples in order. A changed or truncated
 * file fails here, not in a report.
 */
export async function readAssistantResult(summaryFile: string): Promise<LoadedAssistantResult> {
  const summary = JSON.parse(await readFile(summaryFile, 'utf8')) as AssistantResult;
  if (summary.schema !== 1 || summary.kind !== 'assistant') {
    throw new Error(`${summaryFile}: not an assistant result schema 1`);
  }
  const reference = summary.samples_file;
  if (basename(reference.name) !== reference.name) {
    throw new Error(`${summaryFile}: the sample file must sit next to the summary`);
  }

  const compressed = await readFile(join(dirname(summaryFile), reference.name));
  const actual = checksum(compressed);
  if (actual !== reference.sha256) {
    throw new Error(`${reference.name}: sha256 ${actual} does not match the summary ${reference.sha256}`);
  }

  const lines = gunzipSync(compressed).toString('utf8').split('\n').filter((line) => line !== '');
  if (lines.length !== reference.count) {
    throw new Error(`${reference.name}: ${lines.length} samples, summary says ${reference.count}`);
  }
  return { summary, samples: lines.map((line) => JSON.parse(line) as AssistantSample) };
}
