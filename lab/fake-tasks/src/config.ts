import { z } from 'zod';

/**
 * The nine switches of the Q3 measurement plan, grouped as a resolved
 * configuration. A profile is one named combination of these values, so
 * adding a target behaviour never means adding a branch in the server.
 *
 * The create and update idempotency switches are set separately because
 * real systems do not deduplicate both operations: Lark Task accepts a key
 * on create and has none on patch.
 */
export const IDEMPOTENCY_MEMORY = ['forever', 'seconds', 'none'] as const;
export type IdempotencyMemory = (typeof IDEMPOTENCY_MEMORY)[number];

export const IDEMPOTENCY_SCOPES = ['service_key', 'token'] as const;
export type IdempotencyScope = (typeof IDEMPOTENCY_SCOPES)[number];

export const REPEAT_MODES = ['replay', 'duplicate_error', 'wait', 'conflict', 'conflict_1470422'] as const;
export type RepeatMode = (typeof REPEAT_MODES)[number];

export const FINAL_RESULT_MODES = ['immediate', 'late'] as const;
export type FinalResultMode = (typeof FINAL_RESULT_MODES)[number];

export const RATE_LIMIT_MODES = ['none', 'retry_after', 'custom_header', 'silent'] as const;
export type RateLimitMode = (typeof RATE_LIMIT_MODES)[number];

export const NOTIFICATION_MODES = ['none', 'every_write', 'on_change'] as const;
export type NotificationMode = (typeof NOTIFICATION_MODES)[number];

export interface IdempotencySwitch {
  /** How long a saved key is remembered after the write is accepted. */
  readonly memory: IdempotencyMemory;
  /** Lifetime in seconds when `memory` is `seconds`. */
  readonly memorySeconds: number;
  /** Which caller identity the key belongs to. */
  readonly scope: IdempotencyScope;
  /** Access token lifetime in seconds when `scope` is `token`. */
  readonly tokenSeconds: number;
  /** What a repeat of a remembered key answers. */
  readonly repeat: RepeatMode;
}

export interface TargetConfig {
  readonly idempotency: {
    readonly create: IdempotencySwitch;
    readonly update: IdempotencySwitch;
  };
  /** Whether a patch checks `expected_version`. */
  readonly versionCheck: boolean;
  /** Whether the caller hears the final result at once or only later. */
  readonly finalResult: {
    readonly mode: FinalResultMode;
    /** Delay before a late result is applied or failed, in milliseconds. */
    readonly delayMs: number;
    /** Every Nth late write fails. 0 means none fail. */
    readonly failureEvery: number;
  };
  readonly rateLimit: {
    readonly mode: RateLimitMode;
    readonly maxRequests: number;
    readonly windowMs: number;
    readonly retryAfterSeconds: number;
    /** Extra block added when a silent 429 is retried too early. */
    readonly extraBlockSeconds: number;
  };
  /** How long a read lags behind the last applied write, in milliseconds. */
  readonly readDelayMs: number;
  readonly notifications: NotificationMode;
  /** Whether the target exposes the actor of each write. */
  readonly writeHistory: boolean;
}

export const PROFILE_ENV = 'LAB_TASKS_PROFILE';
export const SWITCHES_ENV = 'LAB_TASKS_SWITCHES';

const MAX_SECONDS = 2_592_000;
const MAX_DELAY_MS = 3_600_000;

const standard: TargetConfig = {
  idempotency: {
    create: { memory: 'forever', memorySeconds: 0, scope: 'service_key', tokenSeconds: 7_200, repeat: 'replay' },
    update: { memory: 'forever', memorySeconds: 0, scope: 'service_key', tokenSeconds: 7_200, repeat: 'replay' },
  },
  versionCheck: true,
  finalResult: { mode: 'immediate', delayMs: 1_000, failureEvery: 0 },
  rateLimit: { mode: 'none', maxRequests: 2, windowMs: 1_000, retryAfterSeconds: 1, extraBlockSeconds: 2 },
  readDelayMs: 0,
  notifications: 'none',
  writeHistory: true,
};

const larkTask: TargetConfig = {
  ...standard,
  idempotency: {
    create: { memory: 'seconds', memorySeconds: 300, scope: 'token', tokenSeconds: 7_200, repeat: 'conflict_1470422' },
    update: { memory: 'none', memorySeconds: 0, scope: 'service_key', tokenSeconds: 7_200, repeat: 'replay' },
  },
  versionCheck: false,
  notifications: 'every_write',
};

const larkApproval: TargetConfig = {
  ...standard,
  idempotency: {
    create: { memory: 'forever', memorySeconds: 0, scope: 'service_key', tokenSeconds: 7_200, repeat: 'duplicate_error' },
    update: { memory: 'forever', memorySeconds: 0, scope: 'service_key', tokenSeconds: 7_200, repeat: 'duplicate_error' },
  },
};

const noDedup: TargetConfig = {
  ...standard,
  idempotency: {
    create: { memory: 'none', memorySeconds: 0, scope: 'service_key', tokenSeconds: 7_200, repeat: 'replay' },
    update: { memory: 'none', memorySeconds: 0, scope: 'service_key', tokenSeconds: 7_200, repeat: 'replay' },
  },
  writeHistory: false,
};

const shortMemory: TargetConfig = {
  ...standard,
  idempotency: {
    create: { memory: 'seconds', memorySeconds: 86_400, scope: 'service_key', tokenSeconds: 7_200, repeat: 'replay' },
    update: { memory: 'seconds', memorySeconds: 86_400, scope: 'service_key', tokenSeconds: 7_200, repeat: 'replay' },
  },
};

const lateResult: TargetConfig = {
  ...standard,
  finalResult: { mode: 'late', delayMs: 1_000, failureEvery: 3 },
};

const rateLimited: TargetConfig = {
  ...standard,
  rateLimit: { mode: 'retry_after', maxRequests: 2, windowMs: 1_000, retryAfterSeconds: 1, extraBlockSeconds: 2 },
};

const staleRead: TargetConfig = {
  ...standard,
  idempotency: {
    create: { memory: 'none', memorySeconds: 0, scope: 'service_key', tokenSeconds: 7_200, repeat: 'replay' },
    update: { memory: 'none', memorySeconds: 0, scope: 'service_key', tokenSeconds: 7_200, repeat: 'replay' },
  },
  versionCheck: false,
  readDelayMs: 1_000,
};

export const PROFILE_NAMES = [
  'standard',
  'lark-task',
  'lark-approval',
  'no-dedup',
  'short-memory',
  'late-result',
  'rate-limited',
  'stale-read',
] as const;

export type ProfileName = (typeof PROFILE_NAMES)[number];

export const PROFILES = {
  standard,
  'lark-task': larkTask,
  'lark-approval': larkApproval,
  'no-dedup': noDedup,
  'short-memory': shortMemory,
  'late-result': lateResult,
  'rate-limited': rateLimited,
  'stale-read': staleRead,
} as const satisfies Readonly<Record<ProfileName, TargetConfig>>;

export interface ResolvedTargetConfig {
  readonly profile: ProfileName;
  readonly config: TargetConfig;
}

const idempotencyOverrideSchema = z.strictObject({
  memory: z.enum(IDEMPOTENCY_MEMORY).optional(),
  memorySeconds: z.number().int().min(1).max(MAX_SECONDS).optional(),
  scope: z.enum(IDEMPOTENCY_SCOPES).optional(),
  tokenSeconds: z.number().int().min(1).max(MAX_SECONDS).optional(),
  repeat: z.enum(REPEAT_MODES).optional(),
});

const overrideSchema = z.strictObject({
  idempotency: z
    .strictObject({
      create: idempotencyOverrideSchema.optional(),
      update: idempotencyOverrideSchema.optional(),
    })
    .optional(),
  versionCheck: z.boolean().optional(),
  finalResult: z
    .strictObject({
      mode: z.enum(FINAL_RESULT_MODES).optional(),
      delayMs: z.number().int().min(0).max(MAX_DELAY_MS).optional(),
      failureEvery: z.number().int().min(0).max(1_000).optional(),
    })
    .optional(),
  rateLimit: z
    .strictObject({
      mode: z.enum(RATE_LIMIT_MODES).optional(),
      maxRequests: z.number().int().min(1).max(10_000).optional(),
      windowMs: z.number().int().min(1).max(MAX_DELAY_MS).optional(),
      retryAfterSeconds: z.number().int().min(1).max(3_600).optional(),
      extraBlockSeconds: z.number().int().min(0).max(3_600).optional(),
    })
    .optional(),
  readDelayMs: z.number().int().min(0).max(MAX_DELAY_MS).optional(),
  notifications: z.enum(NOTIFICATION_MODES).optional(),
  writeHistory: z.boolean().optional(),
});

type ConfigOverride = z.infer<typeof overrideSchema>;
type IdempotencyOverride = z.infer<typeof idempotencyOverrideSchema>;

function mergeIdempotency(base: IdempotencySwitch, override: IdempotencyOverride | undefined): IdempotencySwitch {
  if (override === undefined) return base;
  return {
    memory: override.memory ?? base.memory,
    memorySeconds: override.memorySeconds ?? base.memorySeconds,
    scope: override.scope ?? base.scope,
    tokenSeconds: override.tokenSeconds ?? base.tokenSeconds,
    repeat: override.repeat ?? base.repeat,
  };
}

function mergeConfig(base: TargetConfig, override: ConfigOverride): TargetConfig {
  const idempotency = override.idempotency;
  const finalResult = override.finalResult;
  const rateLimit = override.rateLimit;
  return {
    idempotency: {
      create: mergeIdempotency(base.idempotency.create, idempotency?.create),
      update: mergeIdempotency(base.idempotency.update, idempotency?.update),
    },
    versionCheck: override.versionCheck ?? base.versionCheck,
    finalResult: {
      mode: finalResult?.mode ?? base.finalResult.mode,
      delayMs: finalResult?.delayMs ?? base.finalResult.delayMs,
      failureEvery: finalResult?.failureEvery ?? base.finalResult.failureEvery,
    },
    rateLimit: {
      mode: rateLimit?.mode ?? base.rateLimit.mode,
      maxRequests: rateLimit?.maxRequests ?? base.rateLimit.maxRequests,
      windowMs: rateLimit?.windowMs ?? base.rateLimit.windowMs,
      retryAfterSeconds: rateLimit?.retryAfterSeconds ?? base.rateLimit.retryAfterSeconds,
      extraBlockSeconds: rateLimit?.extraBlockSeconds ?? base.rateLimit.extraBlockSeconds,
    },
    readDelayMs: override.readDelayMs ?? base.readDelayMs,
    notifications: override.notifications ?? base.notifications,
    writeHistory: override.writeHistory ?? base.writeHistory,
  };
}

export function isProfileName(value: string): value is ProfileName {
  return (PROFILE_NAMES as readonly string[]).includes(value);
}

function detailOf(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'switches'}: ${issue.message}`)
    .join('; ');
}

/**
 * Read the startup configuration. `LAB_TASKS_PROFILE` picks a named
 * combination; `LAB_TASKS_SWITCHES` is a JSON object that overrides single
 * switches on top of it. An unknown profile or an invalid override stops the
 * service before it listens, so a measurement never runs on half a profile.
 */
export function readTargetConfig(env: NodeJS.ProcessEnv = process.env): ResolvedTargetConfig {
  const rawProfile = env[PROFILE_ENV]?.trim();
  const profile = rawProfile === undefined || rawProfile === '' ? 'standard' : rawProfile;
  if (!isProfileName(profile)) {
    throw new Error(`${PROFILE_ENV} must be one of ${PROFILE_NAMES.join(', ')}; got "${profile}"`);
  }

  const rawSwitches = env[SWITCHES_ENV]?.trim();
  let override: ConfigOverride = {};
  if (rawSwitches !== undefined && rawSwitches !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawSwitches);
    } catch {
      throw new Error(`${SWITCHES_ENV} must be a JSON object`);
    }
    const result = overrideSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`${SWITCHES_ENV} is invalid: ${detailOf(result.error)}`);
    }
    override = result.data;
  }

  return { profile, config: mergeConfig(PROFILES[profile], override) };
}
