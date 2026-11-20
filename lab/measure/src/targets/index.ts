import { GatewayTarget } from './gateway.js';
import type { WriteTarget } from './types.js';

/** The targets a scenario may name. A new target adds one name and one factory. */
export const TARGET_NAMES = ['gateway'] as const;
export type TargetName = (typeof TARGET_NAMES)[number];

export const DEFAULT_TARGET: TargetName = 'gateway';

const FACTORIES: Readonly<Record<TargetName, () => WriteTarget>> = {
  gateway: () => new GatewayTarget(),
};

/** Read and check the name the user passed to `--target`. An unknown name lists the valid ones. */
export function parseTargetName(value: string): TargetName {
  const name = value.trim();
  if (!(TARGET_NAMES as readonly string[]).includes(name)) {
    throw new Error(`--target must be one of ${TARGET_NAMES.join(', ')}, got "${value}"`);
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
