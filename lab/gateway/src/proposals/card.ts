import { adapterOf, recordValue, SystemUnavailableError, type ResourceAdapter } from '../adapters/index.js';
import type { ChangeField } from './fingerprint.js';
import { CHANGE_FIELDS } from './fingerprint.js';
import type { ProposalItem } from './proposal-store.js';

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
 * The rows of one item, built from the values the gateway read at the time of
 * drafting and names read from the directory. Nothing here comes from words the
 * agent wrote about the proposal.
 */
export async function itemRows(item: ProposalItem, adapters: readonly ResourceAdapter[]): Promise<CardRow[]> {
  const adapter = adapterOf(adapters, item.recordType);
  const rows: CardRow[] = [];
  for (const field of CHANGE_FIELDS) {
    const after = item.changes[field];
    if (after === undefined) continue;
    const before = item.previous[field] ?? '';
    rows.push({
      label: labelOf(adapter, field),
      before: field === 'assignee' && before !== '' ? await personLabel(adapters, before) : before,
      after: field === 'assignee' ? await personLabel(adapters, after) : after,
    });
  }
  return rows;
}

function labelOf(adapter: ResourceAdapter, field: ChangeField): string {
  return adapter.fields.find((candidate) => candidate.name === field)?.label ?? field;
}

/** `HH:mm` in Vietnam time, so the person reads the time as the wall clock shows it. */
export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

const VIETNAM_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const VIETNAM_DATE = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * The same wall clock as `formatClock`, with the date added when the moment is
 * not today in Vietnam. A deadline that crosses midnight cannot be mistaken
 * for one earlier the same day.
 */
export function formatMoment(date: Date, now: Date = new Date()): string {
  const time = formatClock(date);
  return VIETNAM_DAY.format(date) === VIETNAM_DAY.format(now) ? time : `${time} ${VIETNAM_DATE.format(date)}`;
}
