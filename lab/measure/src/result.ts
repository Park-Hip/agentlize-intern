import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { MeasurementResult, Sample } from './types.js';

export interface LoadedMeasurement {
  readonly summary: MeasurementResult;
  /** The samples in the order they were measured. */
  readonly samples: readonly Sample[];
}

function checksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Reopen one result: read the small summary, verify the gzip file against the
 * sha256 recorded in the summary, then return the samples in their original
 * order. A changed or truncated sample file fails here, not in a report.
 */
export async function readMeasurement(summaryFile: string): Promise<LoadedMeasurement> {
  const summary = JSON.parse(await readFile(summaryFile, 'utf8')) as MeasurementResult;
  if (summary.schema !== 2 && summary.schema !== 3 && summary.schema !== 4) {
    throw new Error(`${summaryFile}: unsupported result schema ${String(summary.schema)}`);
  }
  const reference = summary.samples_file;
  if (reference === undefined) throw new Error(`${summaryFile}: summary has no samples_file`);
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
  return { summary, samples: lines.map((line) => JSON.parse(line) as Sample) };
}
