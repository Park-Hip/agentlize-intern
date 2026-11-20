import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import {
  KeyStore,
  openGatewayDatabase,
  openGatewayDatabaseReadOnly,
  TraceReader,
} from '@lab/gateway';
import { readEnvironment } from './environment.js';
import { allApplicableZero, assertSafetyCounters } from './safety.js';
import { buildSummary, roundMs } from './stats.js';
import { startMeasureStack, type MeasureStack } from './stack.js';
import type {
  GroupSummary,
  LabObservation,
  MeasureContext,
  MeasurementResult,
  MeasurementTarget,
  Scenario,
  ScenarioResult,
  TargetRequest,
  TargetScope,
} from './types.js';

export interface MeasureOptions {
  readonly runs: number;
  readonly outDir: string;
  readonly repoRoot: string;
  readonly command: string;
  readonly log?: (line: string) => void;
}

export interface MeasureOutcome {
  /** The small summary, the file a report cites. */
  readonly file: string;
  /** The gzipped NDJSON samples next to the summary. */
  readonly samplesFile: string;
  readonly result: MeasurementResult;
  /** Applicable counters that came back above zero. Empty means every checked counter is zero. */
  readonly failedCounters: readonly string[];
  /** Targets with `enforced: true` that missed their threshold. Empty means no enforced target failed. */
  readonly failedTargets: readonly string[];
}

function localDate(now: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function createContext(stack: MeasureStack, runs: number, log: (line: string) => void): MeasureContext {
  return {
    runs,
    services: stack.services,
    dataDir: stack.dataDir,
    serviceKey: stack.serviceKey,
    issueKey(input) {
      const db = openGatewayDatabase(stack.dataDir);
      try {
        const issued = new KeyStore(db).issue({
          employeeId: input.employeeId,
          caller: input.caller ?? 'tho-than-desktop',
          scope: input.scope,
        });
        return issued.rawKey;
      } finally {
        db.close();
      }
    },
    observe(): LabObservation {
      const db = openGatewayDatabaseReadOnly(stack.dataDir);
      try {
        const trace = new TraceReader(db).list({ limit: 1_000_000 });
        const table = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'write_commands'")
          .get() as { name: string } | undefined;
        const row =
          table === undefined
            ? ({ total: 0 } as const)
            : (db.prepare('SELECT COUNT(*) AS total FROM write_commands').get() as { total: number });
        return { trace, writeCommands: row.total };
      } finally {
        db.close();
      }
    },
    log,
  };
}

function assertSamples(result: ScenarioResult): void {
  if (result.samples.length === 0) throw new Error('the scenario returned no samples');
  const seen = new Set<string>();

  for (const sample of result.samples) {
    if (sample.door.trim() === '' || sample.tool.trim() === '') {
      throw new Error('every sample needs a door and a tool');
    }
    if (!Number.isInteger(sample.run) || sample.run < 1) {
      throw new Error(`sample ${sample.door}/${sample.tool} has an invalid run number ${sample.run}`);
    }
    if (!Number.isFinite(sample.client_ms) || sample.client_ms < 0) {
      throw new Error(`sample ${sample.door}/${sample.tool}#${sample.run} has an invalid client time`);
    }
    const key = `${sample.door}\u0000${sample.tool}\u0000${sample.run}`;
    if (seen.has(key)) throw new Error(`sample ${sample.door}/${sample.tool}#${sample.run} appears twice`);
    seen.add(key);
  }
}

function groupForScope(
  summary: MeasurementResult['summary'],
  scope: TargetScope,
): GroupSummary | null {
  switch (scope.kind) {
    case 'overall':
      return summary.overall;
    case 'door':
      return summary.by_door[scope.door] ?? null;
    case 'tool':
      return summary.by_tool[scope.tool] ?? null;
    case 'door_tool': {
      const group = summary.by_door_tool.find(
        (candidate) => candidate.door === scope.door && candidate.tool === scope.tool,
      );
      return group ?? null;
    }
  }
}

function resolveTargets(
  targets: readonly TargetRequest[],
  summary: MeasurementResult['summary'],
): MeasurementTarget[] {
  return targets.map((target) => {
    const group = groupForScope(summary, target.scope);
    if (group === null) {
      throw new Error(`target ${target.id} points at a scope that has no samples`);
    }
    const observed = group[target.metric]?.p95_ms ?? null;
    return {
      id: target.id,
      description: target.description,
      metric: target.metric,
      threshold_ms: target.threshold_ms,
      scope: target.scope,
      observed_ms: observed,
      met: observed !== null && observed <= target.threshold_ms,
      enforced: target.enforced,
    };
  });
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
}

/**
 * Build the private stack, run one scenario, stop everything and write one
 * result file. The runner owns provenance, statistics and the file; a scenario
 * only knows how to make calls and check its own safety counters.
 */
export async function measureScenario(scenario: Scenario, options: MeasureOptions): Promise<MeasureOutcome> {
  const log = options.log ?? ((line: string) => console.log(line));
  const environment = readEnvironment(options.repoRoot, options.outDir);
  const startedAt = performance.now();
  const stack = await startMeasureStack();
  let outcome: ScenarioResult;

  log(`[measure] ${scenario.name}: stack on ${stack.services.gateway}, data ${stack.dataDir}`);

  try {
    outcome = await scenario.run(createContext(stack, options.runs, log));
  } catch (cause) {
    const logs = stack.output().slice(-4_000);
    throw new Error(`${scenario.name} failed: ${errorMessage(cause)}\n${logs}`, { cause });
  } finally {
    await stack.stop();
  }

  assertSamples(outcome);
  assertSafetyCounters(outcome);

  const elapsedSeconds = Math.round((performance.now() - startedAt) / 100) / 10;
  const summary = buildSummary(outcome.samples);
  const targets = resolveTargets(outcome.targets ?? [], summary);
  const appliedCounters = outcome.safety.filter((counter) => counter.applicable);
  const failedCounters = appliedCounters.filter((counter) => counter.value !== 0).map((counter) => counter.id);
  const failedTargets = targets.filter((target) => target.enforced && !target.met).map((target) => target.id);
  const allZero = allApplicableZero(outcome.safety);

  const prefix = `${localDate()}-${scenario.name}-${environment.commit_short}`;
  const file = join(options.outDir, `${prefix}.json`);
  const samplesFile = join(options.outDir, `${prefix}.samples.ndjson.gz`);
  const ndjson = outcome.samples.map((sample) => `${JSON.stringify(sample)}\n`).join('');
  const compressed = gzipSync(Buffer.from(ndjson, 'utf8'));
  const sha256 = createHash('sha256').update(compressed).digest('hex');

  const result: MeasurementResult = {
    schema: 2,
    scenario: { name: scenario.name, description: scenario.description },
    generated_at: new Date().toISOString(),
    command: options.command,
    runs: options.runs,
    elapsed_seconds: elapsedSeconds,
    parameters: outcome.parameters ?? {},
    environment,
    samples_file: {
      name: basename(samplesFile),
      count: outcome.samples.length,
      sha256,
    },
    summary,
    targets,
    safety: { counters: outcome.safety, all_applicable_zero: allZero },
    notes: outcome.notes ?? [],
  };

  await mkdir(options.outDir, { recursive: true });
  await writeFile(samplesFile, compressed);
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const shownFile = relative(options.repoRoot, file) || file;
  const shownSamplesFile = relative(options.repoRoot, samplesFile) || samplesFile;
  const gateway = summary.overall.gateway_duration_ms;
  const client = summary.overall.client_ms;
  log(`[measure] ${outcome.samples.length} samples, ${elapsedSeconds} s`);
  if (gateway !== null) {
    log(
      `[measure] gateway p50 ${gateway.p50_ms} ms, p95 ${gateway.p95_ms} ms, max ${gateway.max_ms} ms`,
    );
  }
  if (client !== null) {
    log(`[measure] client p50 ${roundMs(client.p50_ms)} ms, p95 ${client.p95_ms} ms, max ${client.max_ms} ms`);
  }
  for (const target of targets) {
    const state = target.met ? 'met' : 'missed';
    log(
      `[measure] target ${target.id}: ${state} (${String(target.observed_ms)} ms vs ${target.threshold_ms} ms, report only)`,
    );
  }
  if (failedCounters.length > 0) {
    log(`[measure] safety counters above zero: ${failedCounters.join(', ')}`);
  }
  if (failedTargets.length > 0) {
    log(`[measure] enforced targets missed: ${failedTargets.join(', ')}`);
  }
  log(`[measure] wrote ${shownFile} and ${shownSamplesFile}${environment.dirty ? ' (worktree dirty at measurement time)' : ''}`);

  return { file, samplesFile, result, failedCounters, failedTargets };
}
