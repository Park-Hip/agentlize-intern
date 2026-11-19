import {
  adapterOf,
  recordValue,
  SystemUnavailableError,
  type RecordData,
  type ResourceAdapter,
} from '../adapters/index.js';
import type { PersonRef, PolicyEngine } from '../policy/index.js';

/** Who may approve one request, and how long they have, as the rule file answers now. */
export interface ApprovalRoster {
  /** The rule file's answer. The requester is never part of it: nobody approves their own request. */
  readonly approvers: readonly PersonRef[];
  /** `approval.wait_minutes` of the rule file, 120 by default (ADR-0008 section 3.3). */
  readonly waitMinutes: number;
  readonly policyVersion: number | null;
  readonly unavailable: boolean;
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

/** The directory as the approval question sees it, for callers that already hold the list. */
export function approverRefs(
  policy: PolicyEngine,
  people: readonly RecordData[],
  directory: ResourceAdapter,
  requesterDepartment: string,
): { readonly approvers: readonly PersonRef[]; readonly unavailable: boolean } {
  const decision = policy.approversFor({ department: requesterDepartment }, personRefs(people, directory));
  return {
    approvers: decision.approvers,
    unavailable: decision.reasonCode === 'POLICY_UNAVAILABLE',
  };
}

/**
 * The people the rule file lets approve this request, read from the directory.
 * The rule decides which roles count and whether they must share the
 * requester's department; the directory only supplies the people. The
 * requester is removed from the list, so a lead who sends a request still has
 * someone else approve it.
 */
export async function approvalRoster(
  adapters: readonly ResourceAdapter[],
  policy: PolicyEngine,
  requester: { readonly employeeId: string; readonly department: string },
): Promise<ApprovalRoster> {
  // The wait comes from the rule file even when the directory is down.
  const settings = policy.approversFor({ department: requester.department }, []);
  if (settings.reasonCode === 'POLICY_UNAVAILABLE') {
    return { approvers: [], waitMinutes: settings.waitMinutes, policyVersion: settings.policyVersion, unavailable: true };
  }

  const directory = adapterOf(adapters, 'employee');
  let people: readonly RecordData[] = [];
  try {
    people = await directory.list({});
  } catch (error) {
    if (!(error instanceof SystemUnavailableError)) throw error;
  }
  const decision = policy.approversFor({ department: requester.department }, personRefs(people, directory));
  return {
    approvers: decision.approvers.filter((person) => person.id !== requester.employeeId),
    waitMinutes: decision.waitMinutes,
    policyVersion: decision.policyVersion,
    unavailable: decision.reasonCode === 'POLICY_UNAVAILABLE',
  };
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

/** Who to ask, in one sentence, when the roster is known. */
export function approverSentence(roster: ApprovalRoster): string {
  if (!roster.unavailable && roster.approvers.length > 0) {
    return `Người duyệt: ${roster.approvers.map((person) => person.name).join(' hoặc ')}.`;
  }
  return 'Người duyệt: trưởng nhóm cùng phòng.';
}
