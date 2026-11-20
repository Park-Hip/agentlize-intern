import { parseArgs } from 'node:util';
import { EMPLOYEE_ID_PATTERN } from '@lab/shared';
import { openGatewayDatabase } from '../database.js';
import { PROPOSAL_ID_PATTERN } from '../proposals/proposal-store.js';
import { ENTRIES, TraceStore, type TraceEntry, type TraceRow } from '../trace/trace-store.js';
import { UsageError, type CliIo } from './keys.js';

const USAGE = [
  'Usage:',
  '  npm run trace -- --employee <NV-xx>   calls made by one employee',
  '  npm run trace -- --task <T-n>         lines about one task, with every line of the proposal that contains it',
  '  npm run trace -- --proposal <dx-...>  steps of one proposal',
  '  npm run trace -- --entry <http|mcp|web>  calls from one door',
  '  npm run trace -- --limit <n>          show at most n lines (default 200)',
].join('\n');

const COLUMNS = ['time', 'trace', 'requester', 'caller', 'entry', 'tool', 'object', 'outcome', 'reason', 'scope', 'rule', 'policy', 'host_user', 'proposal', 'key', 'tries', 'ms'] as const;

function cells(row: TraceRow): string[] {
  return [
    row.at,
    row.traceId,
    row.requester ?? '-',
    row.caller ?? '-',
    row.entry,
    row.tool,
    row.objectId ?? '-',
    row.outcome,
    row.reasonCode ?? '-',
    row.outOfScope ? 'out_of_scope' : '-',
    row.ruleId ?? '-',
    row.policyVersion === null ? '-' : `v${row.policyVersion}`,
    row.hostUser ?? '-',
    row.proposalId ?? '-',
    row.idempotencyKey ?? '-',
    row.attempts === null ? '-' : String(row.attempts),
    String(row.durationMs),
  ];
}

/** Lay the lines out as an aligned table, header first. */
export function formatTraceTable(rows: readonly TraceRow[]): string[] {
  const table = [[...COLUMNS], ...rows.map(cells)];
  const widths = COLUMNS.map((_, index) => Math.max(...table.map((line) => (line[index] ?? '').length)));
  return table.map((line) => line.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  ').trimEnd());
}

export function runTraceCli(argv: readonly string[], store: TraceStore, io: CliIo): void {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      employee: { type: 'string' },
      task: { type: 'string' },
      proposal: { type: 'string' },
      entry: { type: 'string' },
      limit: { type: 'string' },
    },
    strict: true,
  });

  if (values.employee !== undefined && !EMPLOYEE_ID_PATTERN.test(values.employee)) {
    throw new UsageError(`employee code must look like NV-07, got "${values.employee}"`);
  }
  if (values.task !== undefined && !/^T-[1-9][0-9]*$/.test(values.task)) {
    throw new UsageError(`task code must look like T-12, got "${values.task}"`);
  }
  if (values.proposal !== undefined && !PROPOSAL_ID_PATTERN.test(values.proposal)) {
    throw new UsageError(`proposal code must look like dx-0123456789abcdef, got "${values.proposal}"`);
  }
  if (values.entry !== undefined && !(ENTRIES as readonly string[]).includes(values.entry)) {
    throw new UsageError(`entry must be one of ${ENTRIES.join(', ')}, got "${values.entry}"`);
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new UsageError(`limit must be a positive whole number, got "${values.limit}"`);
  }

  const rows = store.list({
    ...(values.employee === undefined ? {} : { employee: values.employee }),
    ...(values.task === undefined ? {} : { task: values.task }),
    ...(values.proposal === undefined ? {} : { proposal: values.proposal }),
    ...(values.entry === undefined ? {} : { entry: values.entry as TraceEntry }),
    ...(limit === undefined ? {} : { limit }),
  });
  if (rows.length === 0) {
    io.out('no trace lines');
    return;
  }
  for (const line of formatTraceTable(rows)) io.out(line);
}

export function traceMain(argv: readonly string[]): number {
  const db = openGatewayDatabase();
  try {
    runTraceCli(argv, new TraceStore(db), { out: (line) => console.log(line) });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`trace: ${message}`);
    const code = (error as { code?: unknown }).code;
    if (error instanceof UsageError || (typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS'))) {
      console.error(USAGE);
    }
    return 1;
  } finally {
    db.close();
  }
}
