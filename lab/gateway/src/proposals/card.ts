import { adapterOf, recordValue, SystemUnavailableError, type ResourceAdapter } from '../adapters/index.js';
import type { Proposal, ProposalItem } from './proposal-store.js';

/** One line of a proposal card: what the field held when the proposal was drafted and what it would become. */
export interface CardRow {
  readonly label: string;
  readonly before: string;
  readonly after: string;
  /** True for a create: there is nothing before, and a page says so in words. */
  readonly create?: boolean;
}

/**
 * The code a page shows for an item. A create has no code until the target
 * answers, so it is called "mới" and the write result carries the real code.
 */
export function itemLabel(item: ProposalItem): string {
  return item.kind === 'create' ? 'mới' : item.recordId;
}

/**
 * The record a trace line can name before the write: a create has no code yet,
 * so it names none, and the write line later carries the code the target gave.
 */
export function traceObjectId(proposal: Proposal | undefined): string | null {
  const item = proposal?.items[0];
  return item === undefined || item.kind === 'create' ? null : item.recordId;
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
 * agent wrote about the proposal. Fields are shown in the order the adapter
 * declares them, so an adapter's new field appears without an edit here.
 */
export async function itemRows(item: ProposalItem, adapters: readonly ResourceAdapter[]): Promise<CardRow[]> {
  const adapter = adapterOf(adapters, item.recordType);
  const changed = Object.keys(item.changes);
  const declared = adapter.fields.map((field) => field.name);
  const order = [
    ...declared.filter((field) => changed.includes(field)),
    ...changed.filter((field) => !declared.includes(field)),
  ];

  const rows: CardRow[] = [];
  for (const field of order) {
    const after = item.changes[field];
    if (after === undefined) continue;
    const spec = adapter.fields.find((candidate) => candidate.name === field);
    const before = item.previous[field] ?? '';
    const personField = field === 'assignee' || field === 'employee';
    rows.push({
      label: labelOf(adapter, field),
      before: personField && before !== '' ? await personLabel(adapters, before) : (spec?.values?.[before] ?? before),
      after: personField ? await personLabel(adapters, after) : (spec?.values?.[after] ?? after),
      ...(item.kind === 'create' ? { create: true } : {}),
    });
  }
  return rows;
}

function labelOf(adapter: ResourceAdapter, field: string): string {
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
