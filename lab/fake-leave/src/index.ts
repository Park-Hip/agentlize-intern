import { startLeaveServer } from './server.js';

try {
  const running = await startLeaveServer();
  console.log(`[fake-leave] listening on ${running.url} (profile ${running.config.profile})`);

  const shutdown = (): void => {
    void running.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(`[fake-leave] shutdown failed: ${String(error)}`);
        process.exit(1);
      },
    );
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(`[fake-leave] failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
