import { EMPLOYEE_DECLARATION } from './directory.js';
import { TASK_DECLARATION } from './tasks.js';
import type { RecordDeclaration } from './types.js';

/**
 * The record types the gateway ships with, in the order the pages show them.
 * A new system adds one declaration here; everything downstream reads it
 * (ADR-0007 sections 3.1 and 3.6).
 */
export const ADAPTER_DECLARATIONS: readonly RecordDeclaration[] = [TASK_DECLARATION, EMPLOYEE_DECLARATION];

/** The action names of each record type, from the adapters that declare them. */
export function actionsByType(
  declarations: readonly RecordDeclaration[],
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    declarations.map((declaration) => [declaration.type, declaration.actions.map((action) => action.name)]),
  );
}
