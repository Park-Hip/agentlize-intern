/**
 * What a second package may import from `@lab/gateway` (ADR-0006 section 3.4):
 * one rule engine, one rule schema, one key store, one escape function and one
 * trace reader, so the console never copies them.
 *
 * The gateway process itself starts at `dist/index.js`; this module has no side
 * effects, so importing it never opens a socket or a database.
 */
export { BUSY_TIMEOUT_MS, GATEWAY_DB_FILE, openGatewayDatabase, resolveDataDir } from './database.js';
export type { GatewayDatabase } from './database.js';
export * from './identity/index.js';
export * from './policy/index.js';
export * from './trace/index.js';
export { esc } from './web/html.js';
