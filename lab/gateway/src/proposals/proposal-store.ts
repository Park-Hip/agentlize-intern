import { randomBytes } from 'node:crypto';
import type { ActionSpec } from '../adapters/types.js';
import type { GatewayDatabase } from '../database.js';
import type { Caller } from '../identity/index.js';
import { compareRecordIds, fingerprintOf, type Changes } from './fingerprint.js';

/** A proposal lives this long before its requester has pressed Gửi. After it the page and the status tool say it has expired. */
export const PROPOSAL_TTL_MS = 30 * 60 * 1000;

/** A rejected proposal keeps at most this much of the lead's sentence (ADR-0008 section 3.2). */
export const MAX_APPROVAL_REASON = 500;

export const PROPOSAL_STATUSES = [
  'awaiting_confirmation',
  'awaiting_approval',
  'confirmed',
  'cancelled',
  'rejected',
  'expired',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_ID_PATTERN = /^dx-[0-9a-f]{16}$/;

/** The gateway refuses to start on a database from before change sets or before the approval step (ADR-0007 section 4). */
export const OLD_DATABASE_MESSAGE =
  'gateway.sqlite được tạo bởi một bản cũ, chưa có bảng mục của đề xuất hoặc chưa có bước duyệt. ' +
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

/** One person's answer on the approval step: approve or reject, with the print it was given for. */
export interface Approval {
  readonly proposalId: string;
  readonly actor: string;
  readonly decision: 'approve' | 'reject';
  readonly fingerprint: string;
  /** The lead's sentence, kept for a rejection; null when there was none. */
  readonly reason: string | null;
  readonly at: string;
}

export interface Proposal {
  readonly proposalId: string;
  readonly requester: string;
  readonly caller: Caller;
  /** The tool key that drafted this proposal. Checked again at Gửi and at approval, so revoking it blocks the write. */
  readonly draftedByKeyId: string | null;
  readonly tool: string;
  /** Every item of a proposal is of this one record type (ADR-0007 section 3.3). */
  readonly recordType: string;
  /** The change group the agent asked for, with only the fields at least one item changes. */
  readonly changes: Changes;
  /** True when the rule file says the item count needs a lead's approval before the write. */
  readonly requiresApproval: boolean;
  /** Why the rule file requires approval, in words a person reads. Null when no approval is needed. */
  readonly approvalReason: string | null;
  /** When the lead's approval window ends. Null until the requester presses Gửi. */
  readonly approvalExpiresAt: string | null;
  /** The approval or rejection that settled this proposal, at most one. */
  readonly approval: Approval | null;
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
  /** The sentence the approval page shows when it explains why this needs a lead. */
  readonly approvalReason?: string | null;
  readonly policyVersion: number;
  readonly items: readonly NewProposalItem[];
}

export type Decision = 'confirm' | 'cancel';

export type DecideFailure =
  | 'NOT_FOUND'
  | 'NOT_REQUESTER'
  | 'NOT_PERMITTED'
  | 'POLICY_UNAVAILABLE'
  | 'SELF_APPROVAL'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_USED'
  | 'CONTENT_CHANGED';

/**
 * What a press of Gửi does, decided inside the transaction that moves the
 * proposal. A wait is not a refusal: the proposal goes to the lead's inbox
 * (ADR-0007 section 3.4).
 */
export type ConfirmRoute =
  | { readonly kind: 'write'; readonly ruleId: string; readonly policyVersion: number | null }
  | {
      readonly kind: 'wait';
      readonly approvalExpiresAt: Date;
      readonly approvalReason: string;
      readonly ruleId: string;
      readonly policyVersion: number | null;
    }
  | { readonly kind: 'refuse'; readonly reason: 'NOT_PERMITTED' | 'POLICY_UNAVAILABLE' };

/** What the cumulative count looks for: one person, one record type, one set of actions, one window. */
export interface BulkCountQuery {
  readonly requester: string;
  readonly recordType: string;
  /** Action name to the fields that carry it, as `actionFields` returns them. */
  readonly actions: Readonly<Record<string, readonly string[]>>;
  /** Start of the window; a proposal drafted before it does not count. */
  readonly since: Date;
  /**
   * Count proposals still waiting for their own press. The draft counts them,
   * so its answer warns early. The press does not: those items have not
   * committed to a write yet, and counting them would make two presses that
   * race both wait instead of one, so the second press counts the first.
   */
  readonly includeAwaitingPress: boolean;
  /** The proposal being pressed now, which must not count itself. */
  readonly excludeProposalId?: string;
}

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
  approval_reason: string | null;
  approval_expires_at: string | null;
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

interface ApprovalRow {
  proposal_id: string;
  actor: string;
  decision: 'approve' | 'reject';
  fingerprint: string;
  reason: string | null;
  at: string;
}

const quoted = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

/**
 * Keep every string field and drop everything else, so an adapter may declare
 * a field this file never heard of and a changed column can still never carry
 * a value of another type.
 */
function parseChanges(json: string): Changes {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const kept: Record<string, string> = {};
  for (const [field, value] of Object.entries(raw)) {
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

function toApproval(row: ApprovalRow | undefined): Approval | null {
  if (row === undefined) return null;
  return {
    proposalId: row.proposal_id,
    actor: row.actor,
    decision: row.decision,
    fingerprint: row.fingerprint,
    reason: row.reason,
    at: row.at,
  };
}

function toProposal(row: Row, items: readonly ProposalItem[], approval: Approval | null = null): Proposal {
  return {
    proposalId: row.proposal_id,
    requester: row.requester,
    caller: row.caller,
    draftedByKeyId: row.drafted_by_key_id,
    tool: row.tool,
    recordType: row.record_type,
    changes: parseChanges(row.changes),
    requiresApproval: row.requires_approval === 1,
    approvalReason: row.approval_reason,
    approvalExpiresAt: row.approval_expires_at,
    approval,
    items,
    fingerprint: row.fingerprint,
    risk: row.risk,
    policyVersion: row.policy_version,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/** What a person should be told right now: a waiting proposal past its time is expired even if no one has looked since. */
export function effectiveStatus(proposal: Proposal, now: Date): ProposalStatus {
  if (proposal.status === 'awaiting_confirmation' && now.getTime() >= Date.parse(proposal.expiresAt)) return 'expired';
  if (
    proposal.status === 'awaiting_approval' &&
    proposal.approvalExpiresAt !== null &&
    now.getTime() >= Date.parse(proposal.approvalExpiresAt)
  ) {
    return 'expired';
  }
  return proposal.status;
}

/**
 * For each action a change group asks for, every field of the adapter that
 * carries that action. The group names only the fields at least one item
 * changes, while the count must also recognise an earlier proposal that
 * changed a sibling field of the same action, for example `due` for an
 * assignee change (ADR-0007 section 3.4).
 */
export function actionFields(
  changes: Changes,
  actions: readonly ActionSpec[],
): Record<string, readonly string[]> {
  const groups: Record<string, readonly string[]> = {};
  for (const action of actions) {
    if (action.fields.some((field) => changes[field] !== undefined)) groups[action.name] = [...action.fields];
  }
  return groups;
}

/**
 * Owns the `proposals`, `proposal_items`, `confirmations` and `approvals`
 * tables (spec section 6, ADR-0007 section 3.3, ADR-0008 section 3.2). A
 * proposal is never edited: it is confirmed, sent for approval, approved,
 * rejected, cancelled or left to expire, and each of those happens at most
 * once.
 */
export class ProposalStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    // A table from before change sets or before the approval step cannot be
    // migrated in place. The lab data is simulated, so the operator deletes the
    // folder and starts again.
    const existing = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'proposals'")
      .get() as { name: string } | undefined;
    if (existing !== undefined) {
      const columns = db.prepare("PRAGMA table_info('proposals')").all() as { name: string }[];
      const names = new Set(columns.map((column) => column.name));
      if (!names.has('record_type') || !names.has('approval_expires_at')) {
        throw new Error(OLD_DATABASE_MESSAGE);
      }
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        proposal_id        TEXT PRIMARY KEY,
        requester          TEXT NOT NULL,
        caller             TEXT NOT NULL,
        drafted_by_key_id  TEXT,
        tool               TEXT NOT NULL,
        record_type        TEXT NOT NULL,
        changes            TEXT NOT NULL,
        requires_approval  INTEGER NOT NULL CHECK (requires_approval IN (0, 1)),
        approval_reason    TEXT,
        approval_expires_at TEXT,
        fingerprint        TEXT NOT NULL,
        risk               TEXT NOT NULL CHECK (risk IN ('normal')),
        policy_version     INTEGER NOT NULL,
        status             TEXT NOT NULL CHECK (status IN (${quoted(PROPOSAL_STATUSES)})),
        created_at         TEXT NOT NULL,
        expires_at         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS proposals_requester ON proposals (requester);
      CREATE INDEX IF NOT EXISTS proposals_status ON proposals (status);
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
        decision    TEXT NOT NULL CHECK (decision IN ('confirm', 'cancel', 'approve', 'reject')),
        fingerprint TEXT NOT NULL,
        reason      TEXT,
        at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS confirmations_proposal ON confirmations (proposal_id);
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
      approval_reason: input.approvalReason ?? null,
      approval_expires_at: null,
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
                                    requires_approval, approval_reason, approval_expires_at, fingerprint, risk,
                                    policy_version, status, created_at, expires_at)
             VALUES (@proposal_id, @requester, @caller, @drafted_by_key_id, @tool, @record_type, @changes,
                     @requires_approval, @approval_reason, @approval_expires_at, @fingerprint, @risk,
                     @policy_version, @status, @created_at, @expires_at)`,
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
    const approval = this.db
      .prepare(
        "SELECT * FROM confirmations WHERE proposal_id = ? AND decision IN ('approve', 'reject') ORDER BY seq DESC LIMIT 1",
      )
      .get(proposalId) as ApprovalRow | undefined;
    return toProposal(row, items.map(toItem), toApproval(approval));
  }

  /** Proposals a lead still has to answer, oldest deadline first; the pages filter by who may approve them. */
  listAwaitingApproval(): Proposal[] {
    const rows = this.db
      .prepare("SELECT proposal_id FROM proposals WHERE status = 'awaiting_approval' ORDER BY approval_expires_at, created_at")
      .all() as { proposal_id: string }[];
    return rows.flatMap((row) => {
      const proposal = this.get(row.proposal_id);
      return proposal === undefined ? [] : [proposal];
    });
  }

  /**
   * The items this person already has in flight for the same actions: proposals
   * drafted inside the window that wait for a lead or were confirmed without a
   * lead's approval, plus, when `includeAwaitingPress` is set, proposals still
   * waiting for their own press. Items a lead approved are never counted again,
   * and a proposal past the deadline of its stage no longer counts
   * (ADR-0007 section 3.4).
   */
  countTowardBulk(query: BulkCountQuery): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT p.changes AS changes,
                (SELECT COUNT(*) FROM proposal_items i WHERE i.proposal_id = p.proposal_id) AS item_count
         FROM proposals p
         WHERE p.requester = @requester
           AND p.record_type = @recordType
           AND p.created_at >= @since
           AND (
             p.status = 'confirmed'
             OR (p.status = 'awaiting_approval' AND p.approval_expires_at IS NOT NULL AND p.approval_expires_at > @now)
             OR (@includeAwaitingPress = 1 AND p.status = 'awaiting_confirmation' AND p.expires_at > @now)
           )
           AND (@excludeProposalId = '' OR p.proposal_id <> @excludeProposalId)
           AND NOT EXISTS (
             SELECT 1 FROM confirmations c
             WHERE c.proposal_id = p.proposal_id AND c.decision = 'approve'
           )`,
      )
      .all({
        requester: query.requester,
        recordType: query.recordType,
        since: query.since.toISOString(),
        now: this.now().toISOString(),
        includeAwaitingPress: query.includeAwaitingPress ? 1 : 0,
        excludeProposalId: query.excludeProposalId ?? '',
      }) as { changes: string; item_count: number }[];

    const totals: Record<string, number> = {};
    for (const action of Object.keys(query.actions)) totals[action] = 0;
    for (const row of rows) {
      const changes = parseChanges(row.changes);
      for (const [action, fields] of Object.entries(query.actions)) {
        if (fields.some((field) => changes[field] !== undefined)) {
          totals[action] = (totals[action] ?? 0) + row.item_count;
        }
      }
    }
    return totals;
  }

  /**
   * A lead approves a proposal that waits for approval. The checks the approval
   * decided on are done again here, in one transaction: the person may not be
   * the requester, the proposal still waits, its deadline has not passed, its
   * print still matches, and `allowed` says the rule file and directory still
   * permit this lead and this request. On success the proposal becomes
   * `confirmed`; the caller creates the write commands in `record`, inside the
   * same transaction.
   */
  approve(proposalId: string, actor: string, allowed: () => boolean, record: (proposal: Proposal) => void): DecideResult {
    return this.db
      .transaction((): DecideResult => {
        const row = this.db.prepare('SELECT * FROM proposals WHERE proposal_id = ?').get(proposalId) as Row | undefined;
        if (row === undefined) return { ok: false, reason: 'NOT_FOUND' };
        const proposal = toProposal(row, this.itemsOf(proposalId));
        if (proposal.requester === actor) return { ok: false, reason: 'SELF_APPROVAL', proposal };

        const waiting = this.usableApproval(proposal);
        if (!waiting.ok) return waiting;
        if (!allowed()) return { ok: false, reason: 'NOT_PERMITTED', proposal };

        const changed = this.db
          .prepare("UPDATE proposals SET status = 'confirmed' WHERE proposal_id = ? AND status = 'awaiting_approval'")
          .run(proposalId);
        if (changed.changes !== 1) return { ok: false, reason: 'APPROVAL_USED', proposal };
        this.recordApproval(proposalId, actor, 'approve', proposal.fingerprint, null, this.now());
        const decided = { ...proposal, status: 'confirmed' as const };
        record(decided);
        return { ok: true, proposal: decided };
      })
      .immediate();
  }

  /**
   * A lead rejects a proposal that waits for approval, with an optional
   * sentence of at most 500 characters. The same checks as `approve` apply,
   * but no write command is made.
   */
  reject(
    proposalId: string,
    actor: string,
    reason: string | null,
    allowed: () => boolean,
    record: (proposal: Proposal) => void,
  ): DecideResult {
    const text = reason === null ? null : reason.trim().slice(0, MAX_APPROVAL_REASON);
    return this.db
      .transaction((): DecideResult => {
        const row = this.db.prepare('SELECT * FROM proposals WHERE proposal_id = ?').get(proposalId) as Row | undefined;
        if (row === undefined) return { ok: false, reason: 'NOT_FOUND' };
        const proposal = toProposal(row, this.itemsOf(proposalId));
        if (proposal.requester === actor) return { ok: false, reason: 'SELF_APPROVAL', proposal };

        const waiting = this.usableApproval(proposal);
        if (!waiting.ok) return waiting;
        if (!allowed()) return { ok: false, reason: 'NOT_PERMITTED', proposal };

        const changed = this.db
          .prepare("UPDATE proposals SET status = 'rejected' WHERE proposal_id = ? AND status = 'awaiting_approval'")
          .run(proposalId);
        if (changed.changes !== 1) return { ok: false, reason: 'APPROVAL_USED', proposal };
        const now = this.now();
        this.recordApproval(proposalId, actor, 'reject', proposal.fingerprint, text, now);
        const decided = {
          ...proposal,
          status: 'rejected' as const,
          approval: {
            proposalId,
            actor,
            decision: 'reject' as const,
            fingerprint: proposal.fingerprint,
            reason: text,
            at: now.toISOString(),
          },
        };
        record(decided);
        return { ok: true, proposal: decided };
      })
      .immediate();
  }

  /**
   * One person confirms or cancels one proposal. It either happens whole or
   * not at all, and only from `awaiting_confirmation`, so a second press, a
   * press after the time, and a press by someone else all leave the proposal
   * as it was. The print is worked out again from the stored items: a row
   * changed by hand no longer matches and is refused.
   * `route` runs inside the same transaction, so the cumulative count it reads
   * and the status it decides cannot be split by a second press: of two
   * presses that race, the first changes the rows the second would count.
   * `record` runs inside the same transaction once the change is made: if it
   * throws, the change is rolled back, so no step happens without its trace line.
   */
  decide(
    proposalId: string,
    actor: string,
    decision: Decision,
    record: (proposal: Proposal) => void,
    route?: (proposal: Proposal) => ConfirmRoute,
  ): DecideResult {
    return this.db
      .transaction((): DecideResult => {
        const row = this.db.prepare('SELECT * FROM proposals WHERE proposal_id = ?').get(proposalId) as Row | undefined;
        if (row === undefined) return { ok: false, reason: 'NOT_FOUND' };
        const proposal = toProposal(row, this.itemsOf(proposalId));
        if (proposal.requester !== actor) return { ok: false, reason: 'NOT_REQUESTER' };

        const now = this.now();
        if (proposal.status !== 'awaiting_confirmation') {
          if (proposal.status === 'expired') return { ok: false, reason: 'APPROVAL_EXPIRED', proposal };
          return { ok: false, reason: 'APPROVAL_USED', proposal };
        }
        if (now.getTime() >= Date.parse(proposal.expiresAt)) {
          this.db.prepare("UPDATE proposals SET status = 'expired' WHERE proposal_id = ?").run(proposalId);
          return { ok: false, reason: 'APPROVAL_EXPIRED', proposal: { ...proposal, status: 'expired' } };
        }

        const print = fingerprintOf(proposal.items);
        if (print !== proposal.fingerprint) return { ok: false, reason: 'CONTENT_CHANGED', proposal };

        const plan = decision === 'confirm' ? route?.(proposal) : undefined;
        if (plan?.kind === 'refuse') return { ok: false, reason: plan.reason, proposal };

        const status: ProposalStatus =
          decision === 'cancel' ? 'cancelled' : plan?.kind === 'wait' ? 'awaiting_approval' : 'confirmed';
        const approvalExpiresAt = plan?.kind === 'wait' ? plan.approvalExpiresAt.toISOString() : null;
        const approvalReason = plan?.kind === 'wait' ? plan.approvalReason : proposal.approvalReason;
        // Conditional on the status: a second press (or a press racing the first) changes no row and loses.
        const changed = this.db
          .prepare(
            "UPDATE proposals SET status = ?, approval_expires_at = ?, approval_reason = ? WHERE proposal_id = ? AND status = 'awaiting_confirmation'",
          )
          .run(status, approvalExpiresAt, approvalReason, proposalId);
        if (changed.changes !== 1) return { ok: false, reason: 'APPROVAL_USED', proposal };
        this.recordConfirmation(proposalId, actor, decision, print, now);
        const decided = { ...proposal, status, approvalExpiresAt, approvalReason };
        record(decided);
        return { ok: true, proposal: decided };
      })
      .immediate();
  }

  /** The lines of one proposal, read inside a transaction or on their own. */
  private itemsOf(proposalId: string): ProposalItem[] {
    const rows = this.db
      .prepare('SELECT * FROM proposal_items WHERE proposal_id = ? ORDER BY position')
      .all(proposalId) as ItemRow[];
    return rows.map(toItem);
  }

  /**
   * The two conditions an approval can no longer meet: the proposal is past
   * its approval window or it has already been answered. Reading the status
   * here keeps `approve` and `reject` on the same rule.
   */
  private usableApproval(proposal: Proposal): DecideResult {
    const now = this.now();
    if (proposal.status !== 'awaiting_approval') {
      return { ok: false, reason: proposal.status === 'expired' ? 'APPROVAL_EXPIRED' : 'APPROVAL_USED', proposal };
    }
    if (proposal.approvalExpiresAt === null || now.getTime() >= Date.parse(proposal.approvalExpiresAt)) {
      this.db.prepare("UPDATE proposals SET status = 'expired' WHERE proposal_id = ?").run(proposal.proposalId);
      return { ok: false, reason: 'APPROVAL_EXPIRED', proposal: { ...proposal, status: 'expired' } };
    }
    const print = fingerprintOf(proposal.items);
    if (print !== proposal.fingerprint) return { ok: false, reason: 'CONTENT_CHANGED', proposal };
    return { ok: true, proposal };
  }

  private recordConfirmation(
    proposalId: string,
    actor: string,
    decision: Decision,
    print: string,
    at: Date,
  ): void {
    this.db
      .prepare('INSERT INTO confirmations (proposal_id, actor, decision, fingerprint, reason, at) VALUES (?, ?, ?, ?, NULL, ?)')
      .run(proposalId, actor, decision, print, at.toISOString());
  }

  private recordApproval(
    proposalId: string,
    actor: string,
    decision: 'approve' | 'reject',
    print: string,
    reason: string | null,
    at: Date,
  ): void {
    this.db
      .prepare('INSERT INTO confirmations (proposal_id, actor, decision, fingerprint, reason, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(proposalId, actor, decision, print, reason, at.toISOString());
  }
}
