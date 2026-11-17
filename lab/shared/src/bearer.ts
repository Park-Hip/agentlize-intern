import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER = /^Bearer +(\S+)$/i;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Check an `Authorization` header against the service key. Both sides are
 * hashed first so the comparison takes the same time whatever the input
 * length, and a wrong key leaks nothing about the right one.
 */
export function hasValidServiceKey(authorization: string | undefined, serviceKey: string): boolean {
  const match = BEARER.exec(authorization ?? '');
  if (match === null || match[1] === undefined) return false;
  return timingSafeEqual(digest(match[1]), digest(serviceKey));
}
