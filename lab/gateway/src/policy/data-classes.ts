/**
 * The two small vocabularies ADR-0010 adds to the rule file: how sensitive a
 * field is, and how much a client is trusted. Both are ordered lists because
 * "the ceiling is below this class" is a comparison, not a set membership.
 */

/** Five data classes, lowest first. The order is part of the contract (ADR-0010 section 3.1). */
export const DATA_CLASSES = [
  'aggregate_anonymous',
  'internal_general',
  'employee_personal',
  'customer_personal',
  'payment',
] as const;

export type DataClass = (typeof DATA_CLASSES)[number];

/** Three client classes. The class is a label; the effective limit is the profile's `ceiling`. */
export const CLIENT_CLASSES = ['appota_hosted', 'vendor_hosted', 'user_device'] as const;

export type ClientClass = (typeof CLIENT_CLASSES)[number];

const DATA_CLASS_RANK: Readonly<Record<DataClass, number>> = {
  aggregate_anonymous: 1,
  internal_general: 2,
  employee_personal: 3,
  customer_personal: 4,
  payment: 5,
};

/** How high a class sits, or null for a name no class uses. */
export function dataClassRank(value: string): number | null {
  return Object.hasOwn(DATA_CLASS_RANK, value) ? DATA_CLASS_RANK[value as DataClass] : null;
}

export function isDataClass(value: string): value is DataClass {
  return Object.hasOwn(DATA_CLASS_RANK, value);
}

export function isClientClass(value: string): value is ClientClass {
  return (CLIENT_CLASSES as readonly string[]).includes(value);
}

/** The lowest class, used for a client with no profile (ADR-0010 section 3.2). */
export const LOWEST_DATA_CLASS: DataClass = 'aggregate_anonymous';
