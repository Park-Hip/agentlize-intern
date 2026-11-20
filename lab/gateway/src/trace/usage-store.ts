import { z } from 'zod';
import type { GatewayDatabase } from '../database.js';

/**
 * The optional header a host sends on every tool call of one conversation turn.
 * The gateway only ever reads it; it never decides a permission.
 */
export const TURN_HEADER = 'x-lab-turn';

/**
 * A turn code is an opaque identifier, never a sentence: letters, digits and
 * `- . _ : / @`, 1 to 64 characters. This is the one place a host can name a
 * turn, and the gateway stores it as is, so it must not carry conversation content.
 */
const TURN_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,63}$/;

export function isTurnId(value: string): boolean {
  return value.length > 0 && value.length <= 64 && TURN_ID.test(value) && value.trim() === value;
}

/**
 * A model name is an identifier such as `gpt-4o-mini` or `claude-sonnet-4-5`.
 * Keeping it to this alphabet means the only free text in the cost table cannot
 * become a place to store a question or an answer.
 */
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,119}$/;

export function isModelName(value: string): boolean {
  return value.length > 0 && value.length <= 120 && MODEL_NAME.test(value) && value.trim() === value;
}

/** A turn cannot be longer than this; a typo should not become a huge row. */
export const MAX_TOKENS = 100_000_000;

/** A single turn costing more than this is a mistake, not a cost. */
export const MAX_COST_USD = 1_000_000;

/** What the assistant reports after one conversation turn. */
export interface UsageRecord {
  readonly turnId: string;
  readonly requester: string;
  readonly caller: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface UsageRow extends UsageRecord {
  readonly at: string;
}

/** The body of `POST /v1/usage`, in the snake case the caller sends. */
export const usageInputSchema = z.strictObject({
  turn_id: z
    .string()
    .refine(isTurnId, 'mã lượt phải gồm chữ, số và - . _ : / @, tối đa 64 ký tự')
    .describe('Mã lượt hội thoại, cùng giá trị với header X-Lab-Turn.'),
  model: z
    .string()
    .refine(isModelName, 'tên mô hình phải là một mã, tối đa 120 ký tự')
    .describe('Tên mô hình đã dùng, ví dụ gpt-4o-mini.'),
  input_tokens: z.number().int().min(0).max(MAX_TOKENS),
  output_tokens: z.number().int().min(0).max(MAX_TOKENS),
  cost_usd: z.number().min(0).max(MAX_COST_USD),
});

export type UsageInput = z.infer<typeof usageInputSchema>;

/** The turn header of one request, or null when it is absent, duplicated or malformed. */
export function readTurnId(headers: Readonly<Record<string, string | string[] | undefined>>): string | null {
  const header = headers[TURN_HEADER];
  // Two spellings of one header arrive as an array. The gateway cannot know which is meant, so it stores none.
  if (typeof header !== 'string') return null;
  const value = header.trim();
  return isTurnId(value) ? value : null;
}

interface UsageDbRow {
  at: string;
  turn_id: string;
  requester: string;
  caller: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

const CREATE_USAGE_SQL = `
  CREATE TABLE IF NOT EXISTS model_usage (
    seq           INTEGER PRIMARY KEY AUTOINCREMENT,
    at            TEXT NOT NULL,
    turn_id       TEXT NOT NULL UNIQUE,
    requester     TEXT NOT NULL,
    caller        TEXT NOT NULL,
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
    cost_usd      REAL NOT NULL CHECK (cost_usd >= 0)
  );
`;

/** One cost per turn, and two triggers that abort every UPDATE and DELETE, as on the trace. */
const USAGE_GUARDS_SQL = `
  CREATE INDEX IF NOT EXISTS model_usage_requester ON model_usage (requester);
  CREATE TRIGGER IF NOT EXISTS model_usage_no_update BEFORE UPDATE ON model_usage
  BEGIN SELECT RAISE(ABORT, 'model usage is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS model_usage_no_delete BEFORE DELETE ON model_usage
  BEGIN SELECT RAISE(ABORT, 'model usage is append-only'); END;
`;

function toUsageRow(row: UsageDbRow): UsageRow {
  return {
    at: row.at,
    turnId: row.turn_id,
    requester: row.requester,
    caller: row.caller,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd,
  };
}

/** `12.5` as `$12.5`, `0.0123` as `$0.0123`, `0` as `$0`; six decimals is enough for one turn. */
export function formatUsd(value: number): string {
  const fixed = value.toFixed(6);
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '');
  return `$${trimmed === '' ? '0' : trimmed}`;
}

/**
 * Reads the cost table. The console opens the gateway database read-only and
 * uses this class, so the query lives once beside the writer (ADR-0006 3.6).
 * A database from before this table simply has no costs, never an error.
 */
export class UsageReader {
  constructor(protected readonly db: GatewayDatabase) {}

  hasTable(): boolean {
    return (
      this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'model_usage'").get() !== undefined
    );
  }

  /** Every cost row for the given turns, keyed by turn. */
  forTurns(turnIds: readonly string[]): Map<string, UsageRow> {
    const found = new Map<string, UsageRow>();
    if (turnIds.length === 0 || !this.hasTable()) return found;

    const params: Record<string, string> = {};
    const names = turnIds.map((turnId, index) => {
      const name = `t${index}`;
      params[name] = turnId;
      return `@${name}`;
    });
    const rows = this.db
      .prepare(`SELECT * FROM model_usage WHERE turn_id IN (${names.join(', ')})`)
      .all(params) as UsageDbRow[];
    for (const row of rows) found.set(row.turn_id, toUsageRow(row));
    return found;
  }

  ofTurn(turnId: string): UsageRow | undefined {
    if (!this.hasTable()) return undefined;
    const row = this.db.prepare('SELECT * FROM model_usage WHERE turn_id = @turnId').get({ turnId }) as
      | UsageDbRow
      | undefined;
    return row === undefined ? undefined : toUsageRow(row);
  }
}

/**
 * Owns `model_usage`, the cost the assistant reports. The gateway never calls a
 * model, so it cannot know a price; it stores the numbers the caller sends and
 * nothing else. One row per turn: a second report is refused, not summed, so a
 * retry cannot double count.
 */
export class UsageStore extends UsageReader {
  constructor(
    db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    super(db);
    db.exec(CREATE_USAGE_SQL);
    db.exec(USAGE_GUARDS_SQL);
  }

  append(record: UsageRecord): UsageRow {
    const at = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO model_usage (at, turn_id, requester, caller, model, input_tokens, output_tokens, cost_usd)
         VALUES (@at, @turn_id, @requester, @caller, @model, @input_tokens, @output_tokens, @cost_usd)`,
      )
      .run({
        at,
        turn_id: record.turnId,
        requester: record.requester,
        caller: record.caller,
        model: record.model,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        cost_usd: record.costUsd,
      });
    return { ...record, at };
  }
}
