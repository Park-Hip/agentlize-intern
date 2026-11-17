import { startTasksServer } from './server.js';

try {
  const running = await startTasksServer();
  console.log(`[fake-tasks] listening on ${running.url}`);

  const shutdown = (): void => {
    void running.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(`[fake-tasks] shutdown failed: ${String(error)}`);
        process.exit(1);
      },
    );
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(`[fake-tasks] failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
