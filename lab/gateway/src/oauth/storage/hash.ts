import { createHash } from 'node:crypto';

/**
 * The lookup key is stored as a digest so a row cannot be found from a value
 * an attacker reads out of the database (ADR-0011 section 3.1).
 * The raw id never appears in a column.
 */
export function hashLookup(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
