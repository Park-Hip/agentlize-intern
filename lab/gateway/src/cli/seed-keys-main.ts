import { parseArgs } from 'node:util';
import { openGatewayDatabase } from '../database.js';
import { KeyStore } from '../identity/key-store.js';
import { seedKeys } from './seed-keys.js';

const db = openGatewayDatabase();
try {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { rotate: { type: 'boolean' } }, strict: true });
  seedKeys(new KeyStore(db), { out: (line) => console.log(line) }, { rotate: values.rotate === true });
} catch (error) {
  console.error(`seed-keys: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  db.close();
}
