import { createHash } from 'node:crypto';

/**
 * The normalised content of one item: only the fields that differ from what
 * the system holds. A field is any name an adapter declares as changeable, so
 * a new field needs no edit here (ADR-0007 section 3.6).
 */
export type Changes = Readonly<Partial<Record<string, string>>>;

/** A create has no record code yet; the store gives it a stable placeholder from this prefix. */
export const NEW_RECORD_ID = 'new';

/** One item either changes an existing record or asks the target to make a new one. */
export type ItemKind = 'update' | 'create';

/** One item as the fingerprint sees it: the record that would change and what would change. */
export interface FingerprintItem {
  /** The registered adapter that owns the record, for example `task`. */
  readonly system: string;
  /** The record type the adapter declares. */
  readonly recordType: string;
  readonly recordId: string;
  /** The version read when the proposal was drafted. */
  readonly baseVersion: number;
  /** Absent means `update`, so a caller from before create keeps its old print. */
  readonly kind?: ItemKind;
  readonly previous: Changes;
  readonly changes: Changes;
}

/**
 * Record codes in the order a person expects: T-2 before T-10, so the items of
 * a proposal read naturally and the same set of codes always sorts the same way.
 */
export function compareRecordIds(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
}

/** Every field of an item, in name order, so the same changes always hash the same way. */
function ordered(changes: Changes): readonly (readonly [string, string])[] {
  return Object.entries(changes)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .flatMap(([field, value]) => (value === undefined ? [] : [[field, value] as const]));
}

/**
 * SHA-256 of every item, sorted by record code, with the fields in name order.
 * The same items always give the same print, whichever order the agent sent
 * them in, and changing one item always changes it (ADR-0007 section 3.3).
 * An update keeps the print it had before the create contract, so a proposal
 * stored by an older build still matches; a create adds its kind to the print.
 */
export function fingerprintOf(items: readonly FingerprintItem[]): string {
  const sorted = [...items].sort((left, right) => compareRecordIds(left.recordId, right.recordId));
  const content = sorted.map((item) => {
    const fields = [
      item.system,
      item.recordType,
      item.recordId,
      item.baseVersion,
      ordered(item.previous),
      ordered(item.changes),
    ];
    return item.kind === 'create' ? ['create', ...fields] : fields;
  });
  return createHash('sha256').update(JSON.stringify(content), 'utf8').digest('hex');
}
