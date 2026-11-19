import { createHash } from 'node:crypto';

/** The task fields a proposal may change. The names are the ones the task list takes in a PATCH. */
export const CHANGE_FIELDS = ['assignee', 'due', 'description', 'status'] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

/** The normalised content of one item: only the fields that differ from what the system holds. */
export type Changes = Readonly<Partial<Record<ChangeField, string>>>;

/** One item as the fingerprint sees it: the record that would change and what would change. */
export interface FingerprintItem {
  /** The registered adapter that owns the record, for example `task`. */
  readonly system: string;
  /** The record type the adapter declares. */
  readonly recordType: string;
  readonly recordId: string;
  /** The version read when the proposal was drafted. */
  readonly baseVersion: number;
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

function ordered(changes: Changes): readonly (readonly [ChangeField, string])[] {
  return CHANGE_FIELDS.flatMap((field) => {
    const value = changes[field];
    return value === undefined ? [] : [[field, value] as const];
  });
}

/**
 * SHA-256 of every item, sorted by record code, with the fields in a fixed
 * order. The same items always give the same print, whichever order the agent
 * sent them in, and changing one item always changes it (ADR-0007 section 3.3).
 */
export function fingerprintOf(items: readonly FingerprintItem[]): string {
  const sorted = [...items].sort((left, right) => compareRecordIds(left.recordId, right.recordId));
  const content = sorted.map((item) => [
    item.system,
    item.recordType,
    item.recordId,
    item.baseVersion,
    ordered(item.previous),
    ordered(item.changes),
  ]);
  return createHash('sha256').update(JSON.stringify(content), 'utf8').digest('hex');
}
