import { EMPLOYEE_ID_PATTERN } from '@lab/shared';
import {
  ENTRIES,
  formatUsd,
  PROPOSAL_ID_PATTERN,
  type TraceEntry,
  type TraceFilter,
  type TraceOutcome,
  type TraceRow,
} from '@lab/gateway';

/** The page shows the newest lines; a filter is how an operator reaches older ones. */
export const TRACE_LIMIT = 200;

const TASK_ID = /^T-[1-9][0-9]*$/;

export interface TraceTyped {
  readonly employee: string;
  readonly task: string;
  readonly proposal: string;
  readonly entry: string;
}

export interface TraceQuery {
  /** What the form shows, exactly as typed, so a mistake stays visible. */
  readonly typed: TraceTyped;
  /** What the reader uses: a value that does not parse is dropped, never sent to SQL. */
  readonly filter: TraceFilter;
  readonly notices: readonly string[];
}

/**
 * Read the four filters of the trace screen. An invalid value is dropped with
 * one sentence instead of failing the page, so the operator keeps seeing the
 * other filters and the table (ADR-0006 section 3.6).
 */
export function parseTraceQuery(params: URLSearchParams): TraceQuery {
  const typed: TraceTyped = {
    employee: (params.get('employee') ?? '').trim(),
    task: (params.get('task') ?? '').trim(),
    proposal: (params.get('proposal') ?? '').trim(),
    entry: (params.get('entry') ?? '').trim(),
  };
  const notices: string[] = [];
  const filter: { employee?: string; task?: string; proposal?: string; entry?: TraceEntry } = {};

  if (typed.employee !== '') {
    if (EMPLOYEE_ID_PATTERN.test(typed.employee)) filter.employee = typed.employee;
    else notices.push('Mã nhân viên phải có dạng NV-07, nên màn hình bỏ qua bộ lọc theo người.');
  }
  if (typed.task !== '') {
    if (TASK_ID.test(typed.task)) filter.task = typed.task;
    else notices.push('Mã task phải có dạng T-12, nên màn hình bỏ qua bộ lọc theo task.');
  }
  if (typed.proposal !== '') {
    if (PROPOSAL_ID_PATTERN.test(typed.proposal)) filter.proposal = typed.proposal;
    else notices.push('Mã đề xuất phải có dạng dx-0123456789abcdef, nên màn hình bỏ qua bộ lọc theo đề xuất.');
  }
  if (typed.entry !== '') {
    if ((ENTRIES as readonly string[]).includes(typed.entry)) filter.entry = typed.entry as TraceEntry;
    else notices.push('Cửa vào phải là http, mcp hoặc web, nên màn hình bỏ qua bộ lọc đó.');
  }
  return { typed, filter, notices };
}

export interface TraceGroup {
  /** `null` for the lines that belong to no proposal. */
  readonly proposalId: string | null;
  readonly rows: readonly TraceRow[];
  /** How many of the lines are sends of a write command, so a group shows the writes of one proposal. */
  readonly writeCommands: number;
}

/**
 * Group the newest-first list by proposal. Inside a proposal the lines read
 * oldest first, so the chain runs soạn, xác nhận, ghi; the groups themselves
 * follow the newest line. Lines with no proposal come last.
 */
export function groupByProposal(rows: readonly TraceRow[]): readonly TraceGroup[] {
  const byProposal = new Map<string, TraceRow[]>();
  const loose: TraceRow[] = [];
  for (const row of rows) {
    const proposalId = row.proposalId ?? null;
    if (proposalId === null) {
      loose.push(row);
      continue;
    }
    const group = byProposal.get(proposalId);
    if (group === undefined) byProposal.set(proposalId, [row]);
    else group.push(row);
  }

  const groups: TraceGroup[] = [];
  for (const [proposalId, proposalRows] of byProposal) {
    groups.push({
      proposalId,
      rows: [...proposalRows].reverse(),
      writeCommands: proposalRows.filter((row) => row.tool === 'write_command').length,
    });
  }
  if (loose.length > 0) {
    groups.push({ proposalId: null, rows: loose, writeCommands: loose.filter((row) => row.tool === 'write_command').length });
  }
  return groups;
}

const ENTRY_LABEL: Readonly<Record<TraceEntry, string>> = {
  http: 'Gọi HTTP',
  mcp: 'Cửa MCP',
  web: 'Trang cổng',
};

export function entryLabel(entry: TraceEntry): string {
  return ENTRY_LABEL[entry];
}

const OUTCOME_LABEL: Readonly<Record<TraceOutcome, string>> = {
  ok: 'Xong',
  refused: 'Bị từ chối',
  not_found: 'Không thấy',
  error: 'Lỗi',
};

export function outcomeLabel(outcome: TraceOutcome): string {
  return OUTCOME_LABEL[outcome];
}

/**
 * The cost of the line's conversation turn, as one plain sentence. The three
 * cases are distinct: the host gave no turn code, it gave one the assistant has
 * not reported yet, or the numbers are there. The page escapes this text.
 */
export function usageLabel(row: TraceRow): string {
  if (row.turnId === null) return 'chi phí: host không báo';
  if (row.usage === null) return 'chi phí: chưa báo';
  const usage = row.usage;
  return `chi phí: ${formatUsd(usage.costUsd)} (${usage.inputTokens} vào / ${usage.outputTokens} ra, ${usage.model})`;
}

/**
 * `2026-11-18T10:22:31.123Z` as `2026-11-18 10:22:31Z`: the trace is written in
 * UTC, and keeping the `Z` means two people comparing screens read one time.
 */
export function clock(at: string): string {
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) return at;
  return `${new Date(parsed).toISOString().slice(0, 19).replace('T', ' ')}Z`;
}
