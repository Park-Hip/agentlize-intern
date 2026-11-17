import { randomBytes } from 'node:crypto';
import type { GatewayDatabase } from '../database.js';
import type { Caller } from '../identity/index.js';
import { CHANGE_FIELDS, fingerprintOf, type ChangeField, type Changes } from './fingerprint.js';

/** A proposal lives this long. After it the page and the status tool say it has expired. */
export const PROPOSAL_TTL_MS = 30 * 60 * 1000;

export const PROPOSAL_STATUSES = ['awaiting_confirmation', 'confirmed', 'cancelled', 'expired'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_ID_PATTERN = /^dx-[0-9a-f]{16}$/;

export interface Proposal {
  readonly proposalId: string;
  readonly requester: string;
  readonly caller: Caller;
  readonly tool: string;
  readonly taskId: string;
  /** What will change. Only fields that differ from the task at the time of drafting. */
  readonly changes: Changes;
  /** The values of the same fields when the proposal was drafted, as the task list held them. */
  readonly previous: Changes;
  /** Version of the task when it was read; the write will have to find the task still at this version. */
  readonly baseVersion: number;
  readonly fingerprint: string;
  readonly risk: 'normal';
  readonly policyVersion: number;
  readonly status: ProposalStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface NewProposal {
  readonly requester: string;
  readonly caller: Caller;
  readonly tool: string;
  readonly taskId: string;
  readonly changes: Changes;
  readonly previous: Changes;
  readonly baseVersion: number;
  readonly policyVersion: number;
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
  tool: string;
  task_id: string;
  changes: string;
  previous: string;
  base_version: number;
  fingerprint: string;
  risk: 'normal';
  policy_version: number;
  status: ProposalStatus;
  created_at: string;
  expires_at: string;
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

function toProposal(row: Row): Proposal {
  return {
    proposalId: row.proposal_id,
    requester: row.requester,
    caller: row.caller,
    tool: row.tool,
    taskId: row.task_id,
    changes: parseChanges(row.changes),
    previous: parseChanges(row.previous),
    baseVersion: row.base_version,
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
 * Owns the `proposals` and `confirmations` tables (spec section 6). A proposal
 * is never edited: it is confirmed, cancelled or left to expire, and each of
 * those happens at most once.
 */
export class ProposalStore {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        proposal_id    TEXT PRIMARY KEY,
        requester      TEXT NOT NULL,
        caller         TEXT NOT NULL,
        tool           TEXT NOT NULL,
        task_id        TEXT NOT NULL,
        changes        TEXT NOT NULL,
        previous       TEXT NOT NULL,
        base_version   INTEGER NOT NULL,
        fingerprint    TEXT NOT NULL,
        risk           TEXT NOT NULL CHECK (risk IN ('normal')),
        policy_version INTEGER NOT NULL,
        status         TEXT NOT NULL CHECK (status IN (${quoted(PROPOSAL_STATUSES)})),
        created_at     TEXT NOT NULL,
        expires_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS proposals_requester ON proposals (requester);
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

  create(input: NewProposal): Proposal {
    const createdAt = this.now();
    const row: Row = {
      proposal_id: `dx-${randomBytes(8).toString('hex')}`,
      requester: input.requester,
      caller: input.caller,
      tool: input.tool,
      task_id: input.taskId,
      changes: JSON.stringify(input.changes),
      previous: JSON.stringify(input.previous),
      base_version: input.baseVersion,
      fingerprint: fingerprintOf({ taskId: input.taskId, baseVersion: input.baseVersion, changes: input.changes }),
      risk: 'normal',
      policy_version: input.policyVersion,
      status: 'awaiting_confirmation',
      created_at: createdAt.toISOString(),
      expires_at: new Date(createdAt.getTime() + PROPOSAL_TTL_MS).toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO proposals (proposal_id, requester, caller, tool, task_id, changes, previous, base_version,
                                fingerprint, risk, policy_version, status, created_at, expires_at)
         VALUES (@proposal_id, @requester, @caller, @tool, @task_id, @changes, @previous, @base_version,
                 @fingerprint, @risk, @policy_version, @status, @created_at, @expires_at)`,
      )
      .run(row);
    return toProposal(row);
  }

  get(proposalId: string): Proposal | undefined {
    const row = this.db.prepare('SELECT * FROM proposals WHERE proposal_id = ?').get(proposalId) as Row | undefined;
    return row === undefined ? undefined : toProposal(row);
  }

  /**
   * One person confirms or cancels one proposal. It either happens whole or
   * not at all, and only from `awaiting_confirmation`, so a second press, a
   * press after the time, and a press by someone else all leave the proposal
   * as it was. The print is worked out again from the stored content: a row
   * changed by hand no longer matches and is refused.
   * `record` runs inside the same transaction once the change is made: if it
   * throws, the change is rolled back, so no step happens without its trace line.
   */
  decide(proposalId: string, actor: string, decision: Decision, record: (proposal: Proposal) => void): DecideResult {
    return this.db.transaction((): DecideResult => {
      const row = this.db.prepare('SELECT * FROM proposals WHERE proposal_id = ?').get(proposalId) as Row | undefined;
      if (row === undefined) return { ok: false, reason: 'NOT_FOUND' };
      const proposal = toProposal(row);
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

      const print = fingerprintOf({ taskId: proposal.taskId, baseVersion: proposal.baseVersion, changes: proposal.changes });
      if (print !== proposal.fingerprint) return { ok: false, reason: 'CONTENT_CHANGED', proposal };

      const status: ProposalStatus = decision === 'confirm' ? 'confirmed' : 'cancelled';
      this.db.prepare('UPDATE proposals SET status = ? WHERE proposal_id = ?').run(status, proposalId);
      this.db
        .prepare('INSERT INTO confirmations (proposal_id, actor, decision, fingerprint, at) VALUES (?, ?, ?, ?, ?)')
        .run(proposalId, actor, decision, print, now.toISOString());
      const decided = { ...proposal, status };
      record(decided);
      return { ok: true, proposal: decided };
    }).immediate();
  }
}
