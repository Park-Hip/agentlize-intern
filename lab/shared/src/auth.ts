import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER_PREFIX = 'Bearer ';

/**
 * Check an `Authorization` header against the service key.
 * Both sides are hashed first so the comparison takes the same time for any
 * input length, and the key never appears in an error or a log line.
 */
export function bearerKeyMatches(header: string | undefined, key: string): boolean {
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
    return false;
  }
  const presented = createHash('sha256').update(header.slice(BEARER_PREFIX.length)).digest();
  const expected = createHash('sha256').update(key).digest();
  return timingSafeEqual(presented, expected);
}
