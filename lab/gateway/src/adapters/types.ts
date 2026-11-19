import type { TableAction } from '../policy/schema.js';

/** One business record as an adapter returns it: its code, its version and the stored fields. */
export type RecordData = Readonly<Record<string, string | number>>;

/**
 * One field an adapter declares: the name the rule file uses, the Vietnamese
 * label a page or an answer shows, and the key in the stored record when the
 * system stores it under another name.
 */
export interface FieldSpec {
  readonly name: string;
  readonly label: string;
  readonly key?: string;
}

/** A search as a tool passes it: each adapter reads only the keys it knows. */
export type Filter = Readonly<Record<string, string | undefined>>;

/** The fields a write changes, by the name the target system takes. */
export type AdapterChanges = Readonly<Record<string, string | undefined>>;

/** One write as an adapter takes it: the record, the version seen and one fixed key. */
export interface AdapterWrite {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly changes: AdapterChanges;
}

/**
 * What the target system said about one write. `unavailable` means the answer
 * never arrived, so the write may or may not have happened; only a resend with
 * the same key can settle it.
 */
export type ApplyResult =
  | { readonly kind: 'written'; readonly record: RecordData; readonly version: number; readonly replayed: boolean }
  | { readonly kind: 'conflict'; readonly currentVersion: number | null }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'rejected'; readonly status: number; readonly error: string }
  | { readonly kind: 'unavailable'; readonly detail: string };

/**
 * One business system as the gateway sees it. Every call to a system goes
 * through one of these; the tools and the write path never name a system
 * directly (ADR-0007 section 3.1).
 */
export interface ResourceAdapter {
  /** The record type the adapter serves, for example `task` or `employee`. */
  readonly type: string;
  readonly idPattern: RegExp;
  readonly fields: readonly FieldSpec[];
  /** The field holding the department that owns the record. */
  readonly ownerField: string;
  /** A changeable field and the rule action it needs. */
  readonly changeable: Readonly<Record<string, TableAction>>;
  get(id: string): Promise<RecordData | undefined>;
  list(filter: Filter): Promise<RecordData[]>;
  apply(write: AdapterWrite): Promise<ApplyResult>;
}

/** The value of a named field as the adapter stores it. */
export function recordValue(
  record: RecordData,
  fields: readonly FieldSpec[],
  name: string,
): string | number | undefined {
  const field = fields.find((candidate) => candidate.name === name);
  return field === undefined ? undefined : record[field.key ?? field.name];
}
