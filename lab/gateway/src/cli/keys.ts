import { parseArgs } from 'node:util';
import { maskKey } from '@lab/shared';
import { openGatewayDatabase } from '../database.js';
import { KeyStore, type KeyRecord } from '../identity/key-store.js';
import { PagePasswordStore } from '../identity/page-password-store.js';
import { CALLERS, SCOPES } from '../identity/types.js';

const USAGE = [
  'Usage:',
  '  npm run keys -- issue --employee <NV-xx> --caller <caller> [--scope full|read_only]',
  '  npm run keys -- page-password --employee <NV-xx>',
  '  npm run keys -- revoke --key-id <key-id>',
  '  npm run keys -- list',
  `Callers: ${CALLERS.join(', ')}`,
  `Scopes: ${SCOPES.join(', ')}`,
].join('\n');

export interface CliIo {
  out(line: string): void;
}

export class UsageError extends Error {}

/** Never prints a raw key except in `issue`, once. `list` shows only the six-character prefix. */
export function formatKeyRow(record: KeyRecord): string {
  const status = record.revokedAt === null ? 'active' : `revoked ${record.revokedAt}`;
  return [
    record.keyId,
    `${record.keyPrefix}...`,
    record.employeeId,
    record.caller,
    record.scope,
    `created ${record.createdAt}`,
    status,
  ].join('  ');
}

export function runKeysCli(
  argv: readonly string[],
  store: KeyStore,
  pagePasswords: PagePasswordStore,
  io: CliIo,
): void {
  const [command, ...rest] = argv;

  switch (command) {
    case 'issue': {
      const { values } = parseArgs({
        args: [...rest],
        options: {
          employee: { type: 'string' },
          caller: { type: 'string' },
          scope: { type: 'string' },
        },
        strict: true,
      });
      if (values.employee === undefined || values.caller === undefined) {
        throw new UsageError('issue needs --employee and --caller');
      }
      const issued = store.issue({ employeeId: values.employee, caller: values.caller, scope: values.scope });
      io.out(`key_id:   ${issued.record.keyId}`);
      io.out(`employee: ${issued.record.employeeId}`);
      io.out(`caller:   ${issued.record.caller}`);
      io.out(`scope:    ${issued.record.scope}`);
      io.out(`key:      ${issued.rawKey}`);
      io.out(`This key is shown once and is not stored (log form: ${maskKey(issued.rawKey)}).`);
      return;
    }
    case 'page-password': {
      const { values } = parseArgs({ args: [...rest], options: { employee: { type: 'string' } }, strict: true });
      if (values.employee === undefined) throw new UsageError('page-password needs --employee');
      const revoked = pagePasswords.revokeActiveForEmployee(values.employee);
      const issued = pagePasswords.issue({ employeeId: values.employee });
      io.out(`password_id: ${issued.record.passwordId}`);
      io.out(`employee:    ${issued.record.employeeId}`);
      io.out(`password:    ${issued.rawPassword}`);
      if (revoked > 0) io.out(`Revoked ${revoked} active page password(s) of ${issued.record.employeeId} first.`);
      io.out(
        `This page password is shown once and is not stored (log form: ${maskKey(issued.rawPassword)}). ` +
          'It opens the gateway pages only; it never calls a tool.',
      );
      return;
    }
    case 'revoke': {
      const { values } = parseArgs({ args: [...rest], options: { 'key-id': { type: 'string' } }, strict: true });
      const keyId = values['key-id'];
      if (keyId === undefined) throw new UsageError('revoke needs --key-id');
      if (!store.revoke(keyId)) throw new UsageError(`no key with code ${keyId}`);
      io.out(`revoked ${keyId}`);
      return;
    }
    case 'list': {
      parseArgs({ args: [...rest], options: {}, strict: true });
      const records = store.list();
      if (records.length === 0) io.out('no keys');
      for (const record of records) io.out(formatKeyRow(record));
      return;
    }
    default:
      throw new UsageError(command === undefined ? 'missing command' : `unknown command "${command}"`);
  }
}

export function keysMain(argv: readonly string[]): number {
  const db = openGatewayDatabase();
  try {
    runKeysCli(argv, new KeyStore(db), new PagePasswordStore(db), { out: (line) => console.log(line) });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`keys: ${message}`);
    const code = (error as { code?: unknown }).code;
    if (error instanceof UsageError || (typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS'))) {
      console.error(USAGE);
    }
    return 1;
  } finally {
    db.close();
  }
}
