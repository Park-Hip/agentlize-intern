import { adapterOf, recordValue, SystemUnavailableError, type ResourceAdapter } from '../adapters/index.js';
import type { ChangeField } from './fingerprint.js';
import { CHANGE_FIELDS } from './fingerprint.js';
import type { Proposal } from './proposal-store.js';

/** One line of a proposal card: what the field held when the proposal was drafted and what it would become. */
export interface CardRow {
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

/** `NV-04 Vũ Quốc Minh`, the name read from the directory now; just the code when the directory does not answer. */
export async function personLabel(adapters: readonly ResourceAdapter[], employeeId: string): Promise<string> {
  try {
    const directory = adapterOf(adapters, 'employee');
    const employee = await directory.get(employeeId);
    const name = employee === undefined ? undefined : recordValue(employee, directory.fields, 'name');
    return typeof name === 'string' ? `${employeeId} ${name}` : employeeId;
  } catch (error) {
    if (error instanceof SystemUnavailableError) return employeeId;
    throw error;
  }
}

/**
 * The rows of a card, built from the values the gateway read at the time of
 * drafting and names read from the directory. Nothing here comes from words the
 * agent wrote about the proposal.
 */
export async function cardRows(proposal: Proposal, adapters: readonly ResourceAdapter[]): Promise<CardRow[]> {
  const tasks = adapterOf(adapters, 'task');
  const rows: CardRow[] = [];
  for (const field of CHANGE_FIELDS) {
    const after = proposal.changes[field];
    if (after === undefined) continue;
    const before = proposal.previous[field] ?? '';
    rows.push({
      label: labelOf(tasks, field),
      before: field === 'assignee' && before !== '' ? await personLabel(adapters, before) : before,
      after: field === 'assignee' ? await personLabel(adapters, after) : after,
    });
  }
  return rows;
}

function labelOf(adapter: ResourceAdapter, field: ChangeField): string {
  return adapter.fields.find((candidate) => candidate.name === field)?.label ?? field;
}

/** `HH:mm` in Vietnam time, so the person reads the deadline as the wall clock shows it. */
export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
