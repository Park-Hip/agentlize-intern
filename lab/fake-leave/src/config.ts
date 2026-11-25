import { LEAVE_DECISIONS, type LeaveDecision } from './types.js';

/**
 * The two source profiles the Lab needs for this system. `standard` remembers
 * a create key and replays the first answer; `no-dedup` forgets it, so a second
 * send with the same key creates a second request, which is the real bug the
 * create contract has to survive.
 */
export const LEAVE_PROFILES = ['standard', 'no-dedup'] as const;

export type LeaveProfile = (typeof LEAVE_PROFILES)[number];

export interface LeaveConfig {
  readonly profile: LeaveProfile;
  /** True when a repeated create key returns the first answer instead of a new row. */
  readonly dedupCreate: boolean;
  /** How long the source system's manager takes before deciding, in milliseconds. */
  readonly decisionDelayMs: number;
  /** What the manager decides after that delay. */
  readonly decision: LeaveDecision;
}

/** Five seconds is long enough to see "waiting for manager" on a demo page. */
export const DEFAULT_DECISION_DELAY_MS = 5_000;

/** One hour, so a test can still be short and a demo can be long. */
export const MAX_DECISION_DELAY_MS = 3_600_000;

export const PROFILE_ENV = 'LAB_LEAVE_PROFILE';
export const DECISION_DELAY_ENV = 'LAB_LEAVE_DECISION_DELAY_MS';
export const DECISION_ENV = 'LAB_LEAVE_DECISION';

function isProfile(value: string): value is LeaveProfile {
  return (LEAVE_PROFILES as readonly string[]).includes(value);
}

function isDecision(value: string): value is LeaveDecision {
  return (LEAVE_DECISIONS as readonly string[]).includes(value);
}

function readDelay(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DECISION_DELAY_MS;
  const delay = Number(raw);
  if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DECISION_DELAY_MS) {
    throw new Error(`${DECISION_DELAY_ENV} must be an integer between 0 and ${MAX_DECISION_DELAY_MS}, got "${raw}"`);
  }
  return delay;
}

function readDecision(raw: string | undefined): LeaveDecision {
  if (raw === undefined || raw.trim() === '') return 'approved';
  if (!isDecision(raw)) {
    throw new Error(`${DECISION_ENV} must be one of ${LEAVE_DECISIONS.join(', ')}, got "${raw}"`);
  }
  return raw;
}

/** Read the profile and the manager's behaviour from the environment. */
export function resolveLeaveConfig(env: NodeJS.ProcessEnv = process.env): LeaveConfig {
  const rawProfile = env[PROFILE_ENV];
  const profile = rawProfile === undefined || rawProfile.trim() === '' ? 'standard' : rawProfile;
  if (!isProfile(profile)) {
    throw new Error(`${PROFILE_ENV} must be one of ${LEAVE_PROFILES.join(', ')}, got "${profile}"`);
  }
  return {
    profile,
    dedupCreate: profile !== 'no-dedup',
    decisionDelayMs: readDelay(env[DECISION_DELAY_ENV]),
    decision: readDecision(env[DECISION_ENV]),
  };
}
