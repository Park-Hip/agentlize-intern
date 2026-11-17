import { traceMain } from './trace.js';

process.exitCode = traceMain(process.argv.slice(2));
