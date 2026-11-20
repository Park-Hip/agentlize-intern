import { GatewayTarget } from './gateway.js';
import type { WriteTarget } from './types.js';

/** The targets a scenario may name. A new target adds one name and one factory. */
export const TARGET_NAMES = ['gateway'] as const;
export type TargetName = (typeof TARGET_NAMES)[number];

export const DEFAULT_TARGET: TargetName = 'gateway';

/** The scenario reads the target from this variable because the measure CLI does not parse `--target` yet. */
export const TARGET_ENV = 'LAB_MEASURE_TARGET';

const FACTORIES: Readonly<Record<TargetName, () => WriteTarget>> = {
  gateway: () => new GatewayTarget(),
};

/** Read and check the target name. An unknown name stops the run before it builds anything. */
export function resolveTargetName(env: NodeJS.ProcessEnv = process.env): TargetName {
  const configured = env[TARGET_ENV]?.trim();
  const name = configured === undefined || configured === '' ? DEFAULT_TARGET : configured;
  if (!(TARGET_NAMES as readonly string[]).includes(name)) {
    throw new Error(`${TARGET_ENV} must be one of ${TARGET_NAMES.join(', ')}, got "${name}"`);
  }
  return name as TargetName;
}

export function createTarget(name: TargetName): WriteTarget {
  return FACTORIES[name]();
}

export { proposalDraftOf } from './gateway.js';
export type {
  DraftContext,
  DraftFunction,
  ProposalDraft,
  ProposalRun,
  ProposalStatus,
  SendProposalInput,
  TargetCommand,
  TargetFault,
  TargetObservation,
  TaskSnapshot,
  WriteTarget,
} from './types.js';
