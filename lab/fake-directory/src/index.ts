import { startService } from '@lab/shared';

const SERVICE = 'directory';

try {
  const running = await startService({ service: SERVICE });
  console.log(`[fake-directory] listening on ${running.url}`);

  const shutdown = (): void => {
    void running.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(`[fake-directory] shutdown failed: ${String(error)}`);
        process.exit(1);
      },
    );
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(`[fake-directory] failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
