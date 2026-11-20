/**
 * The variant of the run in progress, chosen with `--variant`. The runner
 * sets it before the scenario starts, because a scenario hands the target it
 * builds only a name; a target that cares reads the variant here.
 */
let current: string | null = null;

export function setMeasurementVariant(variant: string | null): void {
  current = variant;
}

export function measurementVariant(): string | null {
  return current;
}
