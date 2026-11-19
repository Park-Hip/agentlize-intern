import { randomBytes } from 'node:crypto';
import type { GatewayDatabase } from '../database.js';
import type { Caller } from '../identity/index.js';
import {
  CHANGE_FIELDS,
  compareRecordIds,
  fingerprintOf,
  type ChangeField,
  type Changes,
} from './fingerprint.js';

/** A proposal lives this long. After it the page and the status tool say it has expired. */
export const PROPOSAL_TTL_MS = 30 * 60 * 1000;

export const PROPOSAL_STATUSES = ['awaiting_confirmation', 'confirmed', 'cancelled', 'expired'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_ID_PATTERN = /^dx-[0-9a-f]{16}$/;

/** The gateway refuses to start on a database from before change sets (ADR-0007 section 4). */
export const OLD_DATABASE_MESSAGE =
  'gateway.sqlite được tạo bởi một bản cũ, chưa có bảng mục của đề xuất. ' +
  'Hãy xoá thư mục dữ liệu (lab/.data, hoặc thư mục trong LAB_DATA_DIR) rồi khởi động lại; dữ liệu của Lab là giả lập.';

/** One record a proposal would change, with the values read when the proposal was drafted. */
export interface ProposalItem {
  /** 1 to N, in record-code order; also the position in the idempotency key. */
  readonly position: number;
  /** The registered adapter that owns the record, for example `task`. */
  readonly system: string;
  readonly recordType: string;
  readonly recordId: string;
  /** The record version read when the proposal was drafted. */
  readonly baseVersion: number;
  readonly previous: Changes;
  readonly changes: Changes;
}

export interface Proposal {
  readonly proposalId: string;
  readonly requester: string;
  readonly caller: Caller;
  /** The tool key that drafted this proposal. Checked again at Gửi, so revoking it blocks the write. */
  readonly draftedByKeyId: string | null;
  readonly tool: string;
  /** Every item of a proposal is of this one record type (ADR-0007 section 3.3). */
  readonly recordType: string;
  /** The change group the agent asked for, with only the fields at least one item changes. */
  readonly changes: Changes;
  /** True when the rule file says the item count needs a lead's approval before the write. */
  readonly requiresApproval: boolean;
  readonly items: readonly ProposalItem[];
  readonly fingerprint: string;
  readonly risk: 'normal';
  readonly policyVersion: number;
  readonly status: ProposalStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface NewProposalItem {
  readonly system: string;
  readonly recordType: string;
  readonly recordId: string;
  readonly baseVersion: number;
  readonly previous: Changes;
  readonly changes: Changes;
}

export interface NewProposal {
  readonly requester: string;
  readonly caller: Caller;
  readonly draftedByKeyId: string;
  readonly tool: string;
  readonly recordType: string;
  readonly changes: Changes;
  readonly requiresApproval: boolean;
  readonly policyVersion: number;
  readonly items: readonly NewProposalItem[];
}

export type Decision = 'confirm' | 'cancel';

export type DecideFailure = 'NOT_FOUND' | 'NOT_REQUESTER' | 'APPROVAL_EXPIRED' | 'APPROVAL_USED' | 'CONTENT_CHANGED';

export type DecideResult =
  | { readonly ok: true; readonly proposal: Proposal }
  | { readonly ok: false; readonly reason: DecideFailure; readonly proposal?: Proposal };

interface Row {
  proposal_id: string;
  requester: string;
  caller: Caller;
  drafted_by_key_id: string | null;
  tool: string;
  record_type: string;
  changes: string;
  requires_approval: number;
  fingerprint: string;
  risk: 'normal';
  policy_version: number;
  status: ProposalStatus;
  created_at: string;
  expires_at: string;
}

interface ItemRow {
  proposal_id: string;
  position: number;
  system: string;
  record_type: string;
  record_id: string;
  base_version: number;
  previous: string;
  changes: string;
}

const quoted = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

/** Keep only the four known fields, so a changed column can never carry something the task list does not take. */
function parseChanges(json: string): Changes {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const kept: Partial<Record<ChangeField, string>> = {};
  for (const field of CHANGE_FIELDS) {
    const value = raw[field];
    if (typeof value === 'string') kept[field] = value;
  }
  return kept;
}

function toItem(row: ItemRow): ProposalItem {
  return {
    position: row.position,
    system: row.system,
    recordType: row.record_type,
    recordId: row.record_id,
    baseVersion: row.base_version,
    previous: parseChanges(row.previous),
    changes: parseChanges(row.changes),
  };
}

function toProposal(row: Row, items: readonly ProposalItem[]): Proposal {
  return {
    proposalId: row.proposal_id,
    requester: row.requester,
    caller: row.caller,
    draftedByKeyId: row.drafted_by_key_id,
    tool: row.tool,
    recordType: row.record_type,
    changes: parseChanges(row.changes),
    requiresApproval: row.requires_approval === 1,
    items,
    fingerprint: row.fingerprint,
    risk: row.risk,
    policyVersion: row.policy_version,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/** What a person should be told right now: an unconfirmed proposal past its time is expired even if no one has looked since. */
export function effectiveStatus(proposal: Proposal, now: Date): ProposalStatus {
  if (proposal.status === 'awaiting_confirmation' && now.getTime() >= Date.parse(proposal.expiresAt)) return 'expired';
  return proposal.status;
}

/**
 * Owns the `proposals` and `proposal_items` tables (spec section 6, ADR-0007
 * section 3.3). A proposal is never edited: it is confirmed, cancelled or left
 * to expire, and each of those happens at most once.
 */
export class ProposalStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    // A table from before change sets cannot be migrated in place. The lab data
    // is simulated, so the operator deletes the folder and starts again.
    const existing = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'proposals'")
      .get() as { name: string } | undefined;
    if (existing !== undefined) {
      const columns = db.prepare("PRAGMA table_info('proposals')").all() as { name: string }[];
      if (!columns.some((column) => column.name === 'record_type')) {
        throw new Error(OLD_DATABASE_MESSAGE);
      }
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        proposal_id       TEXT PRIMARY KEY,
        requester         TEXT NOT NULL,
        caller            TEXT NOT NULL,
        drafted_by_key_id TEXT,
        tool              TEXT NOT NULL,
        record_type       TEXT NOT NULL,
        changes           TEXT NOT NULL,
        requires_approval INTEGER NOT NULL CHECK (requires_approval IN (0, 1)),
        fingerprint       TEXT NOT NULL,
        risk              TEXT NOT NULL CHECK (risk IN ('normal')),
        policy_version    INTEGER NOT NULL,
        status            TEXT NOT NULL CHECK (status IN (${quoted(PROPOSAL_STATUSES)})),
        created_at        TEXT NOT NULL,
        expires_at        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS proposals_requester ON proposals (requester);
      CREATE TABLE IF NOT EXISTS proposal_items (
        proposal_id TEXT NOT NULL REFERENCES proposals (proposal_id),
        position    INTEGER NOT NULL,
        system      TEXT NOT NULL,
        record_type TEXT NOT NULL,
        record_id   TEXT NOT NULL,
        base_version INTEGER NOT NULL,
        previous    TEXT NOT NULL,
        changes     TEXT NOT NULL,
        PRIMARY KEY (proposal_id, position),
        UNIQUE (proposal_id, record_id)
      );
      CREATE TABLE IF NOT EXISTS confirmations (
        seq         INTEGER PRIMARY KEY AUTOINCREMENT,
        proposal_id TEXT NOT NULL REFERENCES proposals (proposal_id),
        actor       TEXT NOT NULL,
        decision    TEXT NOT NULL CHECK (decision IN ('confirm', 'cancel')),
        fingerprint TEXT NOT NULL,
        at          TEXT NOT NULL
      );
    `);
  }

  /**
   * One proposal and all its items, in one transaction. Items are ordered by
   * record code and numbered from 1, so the same set always gets the same
   * positions and the same fingerprint.
   */
  create(input: NewProposal): Proposal {
    const createdAt = this.now();
    const orderedItems = [...input.items].sort((left, right) => compareRecordIds(left.recordId, right.recordId));
    const items: ProposalItem[] = orderedItems.map((item, index) => ({
      position: index + 1,
      system: item.system,
      recordType: item.recordType,
      recordId: item.recordId,
      baseVersion: item.baseVersion,
      previous: item.previous,
      changes: item.changes,
    }));

    const row: Row = {
      proposal_id: `dx-${randomBytes(8).toString('hex')}`,
      requester: input.requester,
      caller: input.caller,
      drafted_by_key_id: input.draftedByKeyId,
      tool: input.tool,
      record_type: input.recordType,
      changes: JSON.stringify(input.changes),
      requires_approval: input.requiresApproval ? 1 : 0,
      fingerprint: fingerprintOf(items),
      risk: 'normal',
      policy_version: input.policyVersion,
      status: 'awaiting_confirmation',
      created_at: createdAt.toISOString(),
      expires_at: new Date(createdAt.getTime() + PROPOSAL_TTL_MS).toISOString(),
    };

    this.db
      .transaction(() => {
        this.db
          .prepare(
            `INSERT INTO proposals (proposal_id, requester, caller, drafted_by_key_id, tool, record_type, changes,
                                    requires_approval, fingerprint, risk, policy_version, status, created_at, expires_at)
             VALUES (@proposal_id, @requester, @caller, @drafted_by_key_id, @tool, @record_type, @changes,
                     @requires_approval, @fingerprint, @risk, @policy_version, @status, @created_at, @expires_at)`,
          )
          .run(row);
        const insertItem = this.db.prepare(
          `INSERT INTO proposal_items (proposal_id, position, system, record_type, record_id, base_version, previous, changes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const item of items) {
          insertItem.run(
            row.proposal_id,
            item.position,
            item.system,
            item.recordType,
            item.recordId,
            item.baseVersion,
            JSON.stringify(item.previous),
            JSON.stringify(item.changes),
          );
        }
      })
      .immediate();

    return toProposal(row, items);
  }

  get(proposalId: string): Proposal | undefined {
    const row = this.db.prepare('SELECT * FROM proposals WHERE proposal_id = ?').get(proposalId) as Row | undefined;
    if (row === undefined) return undefined;
    const items = this.db
      .prepare('SELECT * FROM proposal_items WHERE proposal_id = ? ORDER BY position')
      .all(proposalId) as ItemRow[];
    return toProposal(row, items.map(toItem));
  }

  /**
   * One person confirms or cancels one proposal. It either happens whole or
   * not at all, and only from `awaiting_confirmation`, so a second press, a
   * press after the time, and a press by someone else all leave the proposal
   * as it was. The print is worked out again from the stored items: a row
   * changed by hand no longer matches and is refused.
   * `record` runs inside the same transaction once the change is made: if it
   * throws, the change is rolled back, so no step happens without its trace line.
   */
  decide(proposalId: string, actor: string, decision: Decision, record: (proposal: Proposal) => void): DecideResult {
    return this.db
      .transaction((): DecideResult => {
        const row = this.db.prepare('SELECT * FROM proposals WHERE proposal_id = ?').get(proposalId) as Row | undefined;
        if (row === undefined) return { ok: false, reason: 'NOT_FOUND' };
        const itemRows = this.db
          .prepare('SELECT * FROM proposal_items WHERE proposal_id = ? ORDER BY position')
          .all(proposalId) as ItemRow[];
        const proposal = toProposal(row, itemRows.map(toItem));
        if (proposal.requester !== actor) return { ok: false, reason: 'NOT_REQUESTER' };

        const now = this.now();
        if (proposal.status === 'confirmed' || proposal.status === 'cancelled') {
          return { ok: false, reason: 'APPROVAL_USED', proposal };
        }
        if (proposal.status === 'expired' || now.getTime() >= Date.parse(proposal.expiresAt)) {
          if (proposal.status !== 'expired') {
            this.db.prepare("UPDATE proposals SET status = 'expired' WHERE proposal_id = ?").run(proposalId);
          }
          return { ok: false, reason: 'APPROVAL_EXPIRED', proposal: { ...proposal, status: 'expired' } };
        }

        const print = fingerprintOf(proposal.items);
        if (print !== proposal.fingerprint) return { ok: false, reason: 'CONTENT_CHANGED', proposal };

        const status: ProposalStatus = decision === 'confirm' ? 'confirmed' : 'cancelled';
        // Conditional on the status: a second press (or a press racing the first) changes no row and loses.
        const changed = this.db
          .prepare("UPDATE proposals SET status = ? WHERE proposal_id = ? AND status = 'awaiting_confirmation'")
          .run(status, proposalId);
        if (changed.changes !== 1) return { ok: false, reason: 'APPROVAL_USED', proposal };
        this.db
          .prepare('INSERT INTO confirmations (proposal_id, actor, decision, fingerprint, at) VALUES (?, ?, ?, ?, ?)')
          .run(proposalId, actor, decision, print, now.toISOString());
        const decided = { ...proposal, status };
        record(decided);
        return { ok: true, proposal: decided };
      })
      .immediate();
  }
}
