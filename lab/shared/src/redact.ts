/** How many leading characters of a key a log may show. */
export const KEY_PREFIX_LENGTH = 6;

/** Keys this short or shorter are hidden completely, so the prefix is not most of the key. */
const FULLY_HIDDEN_MAX_LENGTH = 8;

/**
 * The one way every log, trace and error prints a key: the first six
 * characters plus the length, for example `lab_k3...(len=47)`.
 * Same shape as the MCP probe, so lab logs and probe logs read alike.
 * Never log a key any other way.
 */
export function maskKey(value: string): string {
  if (value.length <= FULLY_HIDDEN_MAX_LENGTH) return `***...(len=${value.length})`;
  return `${value.slice(0, KEY_PREFIX_LENGTH)}...(len=${value.length})`;
}
