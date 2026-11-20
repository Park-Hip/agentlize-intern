import type { TraceRow } from '@lab/gateway';
import type { TargetName } from './targets/index.js';

/** The five safety counters of spec section 7.5, in the order the report lists them. */
export const SAFETY_COUNTER_IDS = [
  'duplicate_writes',
  'lost_commands',
  'unauthorized_writes',
  'out_of_scope_fields',
  'personal_data_in_trace',
] as const;

export type SafetyCounterId = (typeof SAFETY_COUNTER_IDS)[number];

export const SAFETY_COUNTER_LABELS: Readonly<Record<SafetyCounterId, string>> = {
  duplicate_writes: 'Ghi trùng',
  lost_commands: 'Lệnh mất',
  unauthorized_writes: 'Ghi vượt quyền',
  out_of_scope_fields: 'Trường ngoài quyền',
  personal_data_in_trace: 'Dữ liệu cá nhân trong vết',
};

/**
 * One call. The response text is deliberately absent: it can hold a name or a
 * phone number, and a committed result file must never carry one.
 * `gateway_duration_ms` is the trace column `duration_ms`, filled after the
 * run; `client_ms` is the wall time around the call itself.
 */
export interface Sample {
  readonly door: string;
  readonly tool: string;
  readonly run: number;
  readonly client_ms: number;
  gateway_duration_ms: number | null;
  readonly trace_id: string | null;
  readonly status: number;
  readonly reason_code: string | null;
}

/**
 * A counter that must be zero when the measurement touches the behaviour it
 * watches. `applicable` says whether the measurement exercised that
 * behaviour; a `null` value on an inapplicable counter is a claim, not a zero.
 */
export interface SafetyCounter {
  readonly id: SafetyCounterId;
  readonly label: string;
  readonly applicable: boolean;
  readonly value: number | null;
  readonly detail: string;
}

/** The database view a scenario gets after it has made its calls. */
export interface LabObservation {
  /** Every trace line, newest first. */
  readonly trace: readonly TraceRow[];
  /** Rows in `write_commands`, which only a confirmed proposal creates. */
  readonly writeCommands: number;
}

export interface IssueKeyRequest {
  readonly employeeId: string;
  readonly caller?: string;
  readonly scope?: 'full' | 'read_only';
}

/**
 * What a scenario declares it needs before the runner starts anything.
 * A scenario that needs neither still gets `runs` and `log`.
 */
export interface ScenarioNeeds {
  /** The shared stack: gateway, fake directory, fake tasks, a data folder and a service key. */
  readonly stack: boolean;
  /** A write target chosen with `--target`; its name arrives in `context.target`. */
  readonly target: boolean;
}

/**
 * What a scenario may use. The stack fields exist only when the scenario
 * declares `needs.stack`; reading one otherwise stops the run with a clear
 * error. Everything is scoped to the private stack the runner built, so no
 * path or port points at `lab/.data`.
 */
export interface MeasureContext {
  /** How many measured calls per tool and door the user asked for. */
  readonly runs: number;
  /** The write target chosen with `--target`, or null when the scenario does not need one. */
  readonly target: TargetName | null;
  readonly services: {
    readonly gateway: string;
    readonly directory: string;
    readonly tasks: string;
  };
  readonly dataDir: string;
  /** The random key the gateway uses for the fake systems. Never write it to a result. */
  readonly serviceKey: string;
  /** Issue a synthetic tool key after the gateway has created its database. */
  issueKey(input: IssueKeyRequest): string;
  /** Read the trace and the write-command count without changing either. */
  observe(): LabObservation;
  log(message: string): void;
}

export type TargetMetric = 'client_ms' | 'gateway_duration_ms';

export type TargetScope =
  | { readonly kind: 'overall' }
  | { readonly kind: 'door'; readonly door: string }
  | { readonly kind: 'tool'; readonly tool: string }
  | { readonly kind: 'door_tool'; readonly door: string; readonly tool: string };

/**
 * A target the scenario wants the result to report. `enforced` is false for
 * the first baseline: a miss is shown, never turned into a failed command.
 */
export interface TargetRequest {
  readonly id: string;
  readonly description: string;
  readonly metric: TargetMetric;
  readonly threshold_ms: number;
  readonly scope: TargetScope;
  readonly enforced: boolean;
}

export interface ScenarioResult {
  readonly samples: readonly Sample[];
  readonly safety: readonly SafetyCounter[];
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly targets?: readonly TargetRequest[];
  readonly notes?: readonly string[];
}

/** The default export every file in `src/scenarios/` must provide. */
export interface Scenario {
  readonly name: string;
  readonly description: string;
  /** What the runner must build before `run` is called. */
  readonly needs: ScenarioNeeds;
  run(context: MeasureContext): Promise<ScenarioResult>;
}

export interface MetricSummary {
  readonly count: number;
  readonly p50_ms: number;
  readonly p95_ms: number;
  readonly max_ms: number;
  readonly min_ms: number;
  readonly mean_ms: number;
}

export interface GroupSummary {
  readonly client_ms: MetricSummary | null;
  readonly gateway_duration_ms: MetricSummary | null;
}

export interface MeasurementSummary {
  readonly overall: GroupSummary;
  readonly by_door: Readonly<Record<string, GroupSummary>>;
  readonly by_tool: Readonly<Record<string, GroupSummary>>;
  readonly by_door_tool: readonly (GroupSummary & { readonly door: string; readonly tool: string })[];
}

export interface MeasurementTarget {
  readonly id: string;
  readonly description: string;
  readonly metric: TargetMetric;
  readonly threshold_ms: number;
  readonly scope: TargetScope;
  readonly observed_ms: number | null;
  readonly met: boolean;
  readonly enforced: boolean;
}

/**
 * Where the raw samples live. The summary stays small enough to read on
 * GitHub; the gzip file holds every sample so anyone can recompute the summary.
 */
export interface SamplesFile {
  /** File name only, next to the summary file. */
  readonly name: string;
  readonly count: number;
  /** Lowercase hex sha256 of the gzip file, so a changed sample file is caught. */
  readonly sha256: string;
}

export interface MeasurementEnvironment {
  readonly commit: string;
  readonly commit_short: string;
  /** True when the worktree had a tracked or untracked change outside the output folder. */
  readonly dirty: boolean;
  readonly node: string;
  readonly os: {
    readonly platform: string;
    readonly release: string;
    readonly version: string;
    readonly arch: string;
  };
  readonly cpu: {
    readonly model: string;
    readonly count: number;
    readonly speed_mhz: number;
  };
  readonly memory_total_bytes: number;
  readonly timezone: string;
}

/** Schema 3 adds `write_target` and schema 4 adds `variant`; `readMeasurement` still opens both older files. */
export type MeasurementSchema = 2 | 3 | 4;

export const MEASUREMENT_SCHEMA: MeasurementSchema = 4;

export interface MeasurementResult {
  readonly schema: MeasurementSchema;
  readonly scenario: {
    readonly name: string;
    readonly description: string;
  };
  readonly generated_at: string;
  readonly command: string;
  readonly runs: number;
  readonly elapsed_seconds: number;
  /** The write target, or null when the scenario only needed the shared stack. Absent in schema 2. */
  readonly write_target?: TargetName | null;
  /** The variant chosen with `--variant`, or null when the run had none. Absent in schemas 2 and 3. */
  readonly variant?: string | null;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly environment: MeasurementEnvironment;
  readonly samples_file: SamplesFile;
  readonly summary: MeasurementSummary;
  readonly targets: readonly MeasurementTarget[];
  readonly safety: {
    readonly counters: readonly SafetyCounter[];
    readonly all_applicable_zero: boolean;
  };
  readonly notes: readonly string[];
}
