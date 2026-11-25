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
  /** How a page writes a stored value, for example `annual` -> `Phép năm`. */
  readonly values?: Readonly<Record<string, string>>;
}

/**
 * One rule action an adapter declares: the name the rule file uses, the label
 * the console shows, how a refusal says it, and the fields it changes
 * (ADR-0007 section 3.1). A changeable field is declared here and nowhere else.
 */
export interface ActionSpec {
  readonly name: string;
  /** The short label of the console table, for example `Sửa mô tả task`. */
  readonly label: string;
  /** The phrase a refusal sentence uses, for example `sửa mô tả task`. */
  readonly phrase: string;
  /** The fields this action changes, in the order a page shows them. */
  readonly fields: readonly string[];
}

/**
 * What one record type is and may change, without touching a system. The
 * registry, the rule schema and the console read this; the adapter class adds
 * the three calls that reach the system.
 */
export interface RecordDeclaration {
  /** The record type the rule file names, for example `task` or `employee`. */
  readonly type: string;
  /** The Vietnamese name a page or a sentence shows, for example `Task`. */
  readonly label: string;
  readonly fields: readonly FieldSpec[];
  /** The field holding the department that owns the record. */
  readonly ownerField: string;
  /**
   * The field holding the state a sentence may report after a create, for
   * example `status` on a leave request. Absent when the record has no state
   * worth naming.
   */
  readonly statusField?: string;
  /** The words a sentence uses for each value of `statusField`. */
  readonly statusLabels?: Readonly<Record<string, string>>;
  readonly actions: readonly ActionSpec[];
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
  /**
   * The values read when the proposal was drafted. A member change needs the
   * old assignee so a resend can repeat the remove call even after it landed.
   */
  readonly previous?: Readonly<Record<string, string | undefined>>;
}

/**
 * One new record as an adapter takes it. A create has no record code and no
 * version: the fixed key replaces the version for that operation, and the
 * target keeps the key on the row so the same request can be found again
 * (write-safety-options section 13 point 5).
 */
export interface AdapterCreate {
  readonly idempotencyKey: string;
  readonly changes: AdapterChanges;
}

/**
 * What the target system said about one write. `unavailable` means the answer
 * never arrived, so the write may or may not have happened; only a resend with
 * the same key can settle it.
 */
export type ApplyResult =
  | { readonly kind: 'written'; readonly record: RecordData; readonly version: number; readonly replayed: boolean }
  | { readonly kind: 'created'; readonly record: RecordData; readonly recordId: string; readonly replayed: boolean }
  | { readonly kind: 'conflict'; readonly currentVersion: number | null }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'rejected'; readonly status: number; readonly error: string }
  | { readonly kind: 'unavailable'; readonly detail: string };

/**
 * One business system as the gateway sees it. Every call to a system goes
 * through one of these; the tools and the write path never name a system
 * directly (ADR-0007 section 3.1).
 */
export interface ResourceAdapter extends RecordDeclaration {
  readonly idPattern: RegExp;
  get(id: string): Promise<RecordData | undefined>;
  list(filter: Filter): Promise<RecordData[]>;
  apply(write: AdapterWrite): Promise<ApplyResult>;
  /** Present only on a record type the source system lets a person create. */
  create?(write: AdapterCreate): Promise<ApplyResult>;
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

/** Every field some action changes, in declaration order and without repeats. */
export function changeableFields(actions: readonly ActionSpec[]): readonly string[] {
  const fields = new Set<string>();
  for (const action of actions) {
    for (const field of action.fields) fields.add(field);
  }
  return [...fields];
}

/** The action that changes one field, or undefined when the adapter does not declare it. */
export function actionOfField(actions: readonly ActionSpec[], field: string): string | undefined {
  return actions.find((action) => action.fields.includes(field))?.name;
}

/** How a refusal sentence says one action, or the action name when the adapter has no phrase. */
export function actionPhrase(declaration: RecordDeclaration, action: string): string {
  return declaration.actions.find((candidate) => candidate.name === action)?.phrase ?? action;
}

/** `Task` becomes `task` and `Nhân viên` becomes `nhân viên`, for the middle of a sentence. */
export function recordWord(declaration: RecordDeclaration | undefined): string {
  const label = declaration?.label;
  if (label === undefined || label === '') return 'bản ghi';
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** The record type name as a sentence says it, from the adapter the gateway registered. */
export function recordWordOf(declarations: readonly RecordDeclaration[], type: string): string {
  return recordWord(declarations.find((candidate) => candidate.type === type));
}
