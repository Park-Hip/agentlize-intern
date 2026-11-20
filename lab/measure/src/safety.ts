import {
  SAFETY_COUNTER_IDS,
  SAFETY_COUNTER_LABELS,
  type SafetyCounter,
  type SafetyCounterId,
  type ScenarioResult,
} from './types.js';

/** Build one counter with the shared label, so every result spells the five the same way. */
export function safetyCounter(
  id: SafetyCounterId,
  applicable: boolean,
  value: number | null,
  detail: string,
): SafetyCounter {
  return { id, label: SAFETY_COUNTER_LABELS[id], applicable, value, detail };
}

/**
 * Reject a scenario that forgets a counter, repeats one, or writes a value
 * whose shape contradicts `applicable`. The runner calls this before it
 * writes anything, so a malformed result never becomes evidence.
 */
export function assertSafetyCounters(result: ScenarioResult): void {
  const counters = result.safety;
  const ids = counters.map((counter) => counter.id);
  const unique = new Set(ids);

  if (counters.length !== SAFETY_COUNTER_IDS.length || unique.size !== SAFETY_COUNTER_IDS.length) {
    throw new Error(
      `safety must carry exactly one counter for each of ${SAFETY_COUNTER_IDS.join(', ')}; got ${ids.join(', ') || 'none'}`,
    );
  }

  for (const id of SAFETY_COUNTER_IDS) {
    if (!unique.has(id)) throw new Error(`safety is missing the counter ${id}`);
  }

  for (const counter of counters) {
    if (counter.applicable) {
      if (counter.value === null) throw new Error(`safety counter ${counter.id} is applicable but has no value`);
      if (!Number.isInteger(counter.value) || counter.value < 0) {
        throw new Error(`safety counter ${counter.id} must be a whole number of zero or more`);
      }
    } else if (counter.value !== null) {
      throw new Error(`safety counter ${counter.id} is not applicable, so its value must be null`);
    }
  }
}

export function allApplicableZero(counters: readonly SafetyCounter[]): boolean {
  return counters.every((counter) => !counter.applicable || counter.value === 0);
}
