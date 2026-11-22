import { main } from './shared/command.js';

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  // The key is never part of our own errors; masking again keeps a provider error from carrying one.
  console.error(`[assistant] failed: ${message.replace(/\b(?:lab_|sk-)[A-Za-z0-9_-]{6,}/g, '***')}`);
  process.exitCode = 1;
}
