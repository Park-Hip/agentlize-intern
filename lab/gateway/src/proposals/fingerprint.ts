import { createHash } from 'node:crypto';

/** The task fields a proposal may change. The names are the ones the task list takes in a PATCH. */
export const CHANGE_FIELDS = ['assignee', 'due', 'description', 'status'] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

/** The normalised content of a proposal: only the fields that differ from what the task list holds. */
export type Changes = Readonly<Partial<Record<ChangeField, string>>>;

export interface FingerprintInput {
  readonly taskId: string;
  readonly baseVersion: number;
  readonly changes: Changes;
}

/**
 * SHA-256 of the task, the version it was read at and the changes, with the
 * fields in a fixed order. The same content always gives the same print, so a
 * confirmation can be tied to exactly what the person saw.
 */
export function fingerprintOf(input: FingerprintInput): string {
  const ordered = CHANGE_FIELDS.flatMap((field) => {
    const value = input.changes[field];
    return value === undefined ? [] : [[field, value]];
  });
  return createHash('sha256')
    .update(JSON.stringify([input.taskId, input.baseVersion, ordered]), 'utf8')
    .digest('hex');
}
