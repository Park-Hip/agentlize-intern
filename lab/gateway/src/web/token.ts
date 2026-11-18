import { timingSafeEqual } from 'node:crypto';

/** Compare two tokens without letting their length or first differing byte change the time taken. */
export function tokensEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
