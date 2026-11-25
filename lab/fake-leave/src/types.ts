import type { Department } from '@lab/shared';

/** The leave reasons the source system offers in its list. */
export const LEAVE_TYPES = ['annual', 'sick', 'personal', 'unpaid'] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** What the source system's own manager approval flow can decide. */
export const LEAVE_DECISIONS = ['approved', 'rejected'] as const;

export type LeaveDecision = (typeof LEAVE_DECISIONS)[number];

/**
 * One leave request as the source system stores it. It deliberately has no
 * version: a create is new, and the gateway's create contract replaces the
 * version with the idempotency key.
 */
export interface LeaveRequest {
  /** `NP-1`. Stable for the life of the row. */
  readonly code: string;
  readonly employee: string;
  readonly department: Department;
  readonly leave_type: LeaveType;
  /** Calendar date `YYYY-MM-DD`. */
  readonly from_date: string;
  /** Calendar date `YYYY-MM-DD`, never before `from_date`. */
  readonly to_date: string;
  readonly reason: string;
  readonly note: string;
  readonly status: LeaveStatus;
  /** The key that created the row, kept as the marker the create contract asks for. */
  readonly request_key: string;
  readonly created_at: string;
  /** Empty while the request is still waiting for the manager. */
  readonly decided_at: string;
}

/** The fields a read may return, in the order a page shows them. */
export const LEAVE_FIELDS = [
  'code',
  'employee',
  'department',
  'leave_type',
  'from_date',
  'to_date',
  'reason',
  'note',
  'status',
  'created_at',
  'decided_at',
] as const;

export type LeaveField = (typeof LEAVE_FIELDS)[number];
