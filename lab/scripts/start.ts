import { startStack, type LabStack } from './stack.js';

let stack: LabStack | null = null;
let stopping = false;

async function shutdown(exitCode: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (exitCode === 0) {
    console.log('[start] stopping services');
  }
  await stack?.stop();
  process.exit(exitCode);
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));

try {
  stack = await startStack({ onUnexpectedExit: () => void shutdown(1) });
  console.log('[start] all services ready, press Ctrl+C to stop');
} catch (cause) {
  console.error(`[start] failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  await stack?.stop();
  process.exit(1);
}
