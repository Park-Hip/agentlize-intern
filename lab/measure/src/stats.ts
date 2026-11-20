import type { GroupSummary, MeasurementSummary, MetricSummary, Sample } from './types.js';

/** Three decimals keep a microsecond-level client time readable in a committed file. */
export function roundMs(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Nearest-rank percentile: for 100 values, p50 is the 50th and p95 is the 95th.
 * The method is stated in `lab/measure/README.md`, so another machine can use
 * the raw samples and get the same number.
 */
export function percentile(sorted: readonly number[], percent: number): number {
  if (sorted.length === 0) throw new Error('percentile needs at least one value');
  const rank = Math.ceil((percent / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? 0;
}

/** p50, p95, the largest and the number of values; also min and mean for context. */
export function summarize(values: readonly number[]): MetricSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    p50_ms: roundMs(percentile(sorted, 50)),
    p95_ms: roundMs(percentile(sorted, 95)),
    max_ms: roundMs(sorted[sorted.length - 1] ?? 0),
    min_ms: roundMs(sorted[0] ?? 0),
    mean_ms: roundMs(total / sorted.length),
  };
}

function groupSummary(samples: readonly Sample[]): GroupSummary {
  return {
    client_ms: summarize(samples.map((sample) => sample.client_ms)),
    gateway_duration_ms: summarize(
      samples
        .map((sample) => sample.gateway_duration_ms)
        .filter((value): value is number => value !== null),
    ),
  };
}

function groupsBy(samples: readonly Sample[], key: (sample: Sample) => string): Map<string, Sample[]> {
  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const name = key(sample);
    const group = groups.get(name);
    if (group === undefined) groups.set(name, [sample]);
    else group.push(sample);
  }
  return groups;
}

/** Every view the report may need, computed once from the raw samples. */
export function buildSummary(samples: readonly Sample[]): MeasurementSummary {
  const byDoor = groupsBy(samples, (sample) => sample.door);
  const byTool = groupsBy(samples, (sample) => sample.tool);
  const byDoorTool = groupsBy(samples, (sample) => `${sample.door}\u0000${sample.tool}`);

  return {
    overall: groupSummary(samples),
    by_door: Object.fromEntries([...byDoor].map(([door, group]) => [door, groupSummary(group)])),
    by_tool: Object.fromEntries([...byTool].map(([tool, group]) => [tool, groupSummary(group)])),
    by_door_tool: [...byDoorTool.values()].map((group) => ({
      door: group[0]?.door ?? '',
      tool: group[0]?.tool ?? '',
      ...groupSummary(group),
    })),
  };
}
