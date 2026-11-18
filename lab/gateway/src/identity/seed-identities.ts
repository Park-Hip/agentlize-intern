import { GUEST, PERSONAS } from '@lab/shared';

/** Every identity that gets a key: the six named characters, then the guest. */
export const SEED_IDENTITIES: readonly { readonly name: string; readonly employeeId: string }[] = [
  ...Object.entries(PERSONAS).map(([name, persona]) => ({ name, employeeId: persona.employeeId })),
  GUEST,
];
