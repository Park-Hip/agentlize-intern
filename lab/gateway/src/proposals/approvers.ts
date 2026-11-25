import {
  adapterOf,
  recordValue,
  SystemUnavailableError,
  type RecordData,
  type ResourceAdapter,
} from '../adapters/index.js';
import type { ApproverMode, PersonRef, PolicyEngine } from '../policy/index.js';
import type { Proposal } from './proposal-store.js';

/** Who may approve one request, and how long they have, as the rule file answers now. */
export interface ApprovalRoster {
  /** The rule file's answer. The requester is never part of it: nobody approves their own request. */
  readonly approvers: readonly PersonRef[];
  /** `approval.wait_minutes` of the rule file, 120 by default (ADR-0008 section 3.3). */
  readonly waitMinutes: number;
  readonly policyVersion: number | null;
  readonly unavailable: boolean;
  /** Whether this record type asks the requester's lead or the record owner's lead. */
  readonly approverMode: ApproverMode;
  /** The departments whose lead answers; one entry for `requester_lead`, one per owner for `owner_lead`. */
  readonly departments: readonly string[];
}

/** One approval question: who may approve this record type for this requester. */
export interface ApprovalTarget {
  readonly employeeId: string;
  /** The requester's own department, read from the directory. */
  readonly department: string;
  /** The record type the rule file names, for example `employee` or `leave`. */
  readonly recordType: string;
  /**
   * The departments that own the records. A create has no record yet, so its
   * caller passes the requester department, as the write check does.
   */
  readonly ownerDepartments?: readonly string[];
}

/** One person as the approval question needs them; only the four values the rule reads are kept. */
export function personRefs(people: readonly RecordData[], directory: ResourceAdapter): PersonRef[] {
  const refs: PersonRef[] = [];
  for (const person of people) {
    const id = recordValue(person, directory.fields, 'id');
    const name = recordValue(person, directory.fields, 'name');
    if (id === undefined || name === undefined) continue;
    refs.push({
      id: String(id),
      name: String(name),
      role: String(person['role'] ?? ''),
      department: String(person['department'] ?? ''),
    });
  }
  return refs;
}

function uniqueDepartments(departments: readonly string[], fallback: string): readonly string[] {
  const unique = [...new Set(departments.filter((department) => department !== ''))];
  return unique.length > 0 ? unique : [fallback];
}

/**
 * The people the rule file lets approve this request, from a directory list
 * the caller already holds. The one place that turns a record type, a
 * requester and the owner departments into an approver list: it asks the rule
 * for the mode, reads the owner departments through the adapter, and removes
 * the requester so a lead who sends a request still has someone else approve it.
 */
export function rosterOf(
  policy: PolicyEngine,
  people: readonly PersonRef[],
  target: ApprovalTarget,
): ApprovalRoster {
  const settings = policy.approversFor({ department: target.department, kind: target.recordType }, []);
  if (settings.reasonCode === 'POLICY_UNAVAILABLE') {
    return {
      approvers: [],
      waitMinutes: settings.waitMinutes,
      policyVersion: settings.policyVersion,
      unavailable: true,
      approverMode: settings.approverMode,
      departments: [],
    };
  }

  const departments =
    settings.approverMode === 'owner_lead'
      ? uniqueDepartments(target.ownerDepartments ?? [], target.department)
      : [target.department];

  const byId = new Map<string, PersonRef>();
  for (const department of departments) {
    const decision = policy.approversFor(
      { department: target.department, kind: target.recordType, ownerDepartment: department },
      people,
    );
    if (decision.reasonCode === 'POLICY_UNAVAILABLE') {
      return {
        approvers: [],
        waitMinutes: decision.waitMinutes,
        policyVersion: decision.policyVersion,
        unavailable: true,
        approverMode: decision.approverMode,
        departments: [],
      };
    }
    for (const person of decision.approvers) {
      if (person.id !== target.employeeId) byId.set(person.id, person);
    }
  }

  return {
    approvers: [...byId.values()],
    waitMinutes: settings.waitMinutes,
    policyVersion: settings.policyVersion,
    unavailable: false,
    approverMode: settings.approverMode,
    departments,
  };
}

/**
 * The same question, with the directory read here. A directory that does not
 * answer leaves the roster empty, as a person who cannot be checked cannot be
 * named; the wait still comes from the rule file.
 */
export async function approvalRoster(
  adapters: readonly ResourceAdapter[],
  policy: PolicyEngine,
  target: ApprovalTarget,
): Promise<ApprovalRoster> {
  const directory = adapterOf(adapters, 'employee');
  let people: readonly RecordData[] = [];
  try {
    people = await directory.list({});
  } catch (error) {
    if (!(error instanceof SystemUnavailableError)) throw error;
  }
  return rosterOf(policy, personRefs(people, directory), target);
}

/**
 * The departments that own the records of one proposal. A create has no
 * record yet, so the requester department answers, exactly as the write check
 * does (`writes/authorize.ts`). The field name comes from the adapter's
 * `ownerField`, never from a constant here.
 */
export async function ownerDepartmentsOf(
  adapters: readonly ResourceAdapter[],
  proposal: Pick<Proposal, 'recordType' | 'items'>,
  requesterDepartment: string,
  records: readonly (RecordData | undefined)[] = [],
): Promise<readonly string[]> {
  const adapter = adapterOf(adapters, proposal.recordType);
  const departments: string[] = [];
  for (const [index, item] of proposal.items.entries()) {
    if (item.kind === 'create') {
      departments.push(requesterDepartment);
      continue;
    }
    const record = records[index] ?? (await adapter.get(item.recordId));
    const owner = record === undefined ? undefined : record[adapter.ownerField];
    departments.push(owner === undefined || owner === '' ? requesterDepartment : String(owner));
  }
  return uniqueDepartments(departments, requesterDepartment);
}

/** The one place the approval pages ask: the roster of one stored proposal. */
export async function proposalRoster(
  adapters: readonly ResourceAdapter[],
  policy: PolicyEngine,
  people: readonly PersonRef[],
  proposal: Pick<Proposal, 'recordType' | 'items'>,
  requester: { readonly employeeId: string; readonly department: string },
  records: readonly (RecordData | undefined)[] = [],
): Promise<ApprovalRoster> {
  // Only the owner-lead mode needs the target records; a requester-lead question is answered from the rule file.
  const settings = policy.approversFor({ department: requester.department, kind: proposal.recordType }, []);
  const ownerDepartments =
    settings.reasonCode !== 'POLICY_UNAVAILABLE' && settings.approverMode === 'owner_lead'
      ? await ownerDepartmentsOf(adapters, proposal, requester.department, records)
      : [requester.department];
  return rosterOf(policy, people, {
    employeeId: requester.employeeId,
    department: requester.department,
    recordType: proposal.recordType,
    ownerDepartments,
  });
}

/** `2 giờ`, `30 phút`, or `1 giờ 30 phút`, for a sentence a person reads. */
export function waitText(minutes: number): string {
  if (minutes <= 0) return 'không giới hạn';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} phút`;
  if (rest === 0) return `${hours} giờ`;
  return `${hours} giờ ${rest} phút`;
}

/** `Vận hành`, or `Vận hành và Kinh doanh` when the items have two owners. */
export function approverDepartmentText(roster: ApprovalRoster): string {
  return roster.departments.length > 0 ? roster.departments.join(' và ') : 'cùng phòng';
}

/** Who to ask, in one sentence, when the roster is known. */
export function approverSentence(roster: ApprovalRoster): string {
  if (!roster.unavailable && roster.approvers.length > 0) {
    return `Người duyệt: ${roster.approvers.map((person) => person.name).join(' hoặc ')}.`;
  }
  return `Người duyệt: trưởng nhóm ${approverDepartmentText(roster)}.`;
}
