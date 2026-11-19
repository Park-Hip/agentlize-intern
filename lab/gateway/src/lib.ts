/**
 * What a second package may import from `@lab/gateway` (ADR-0006 section 3.4):
 * one rule engine, one rule schema, one key store, one list of the identities
 * that get a key, one escape function, one trace reader and the database
 * openers, so the console never copies them.
 *
 * The gateway process itself starts at `dist/index.js`; this module has no side
 * effects, so importing it never opens a socket or a database.
 */
export {
  BUSY_TIMEOUT_MS,
  GATEWAY_DB_FILE,
  openGatewayDatabase,
  openGatewayDatabaseReadOnly,
  resolveDataDir,
} from './database.js';
export type { GatewayDatabase } from './database.js';
export * from './identity/index.js';
export * from './policy/index.js';
export * from './trace/index.js';
export { PROPOSAL_ID_PATTERN } from './proposals/proposal-store.js';
export { DIRECTORY_KEY, EMPLOYEE_FIELD_LABELS } from './adapters/directory.js';
export { TASK_FIELDS } from './adapters/tasks.js';
export type { TaskField } from './adapters/tasks.js';
export { esc, PAGE_SECURITY_HEADERS } from './web/html.js';
export { readForm } from './web/form.js';
