import { startService } from '@lab/shared';

const SERVICE = 'gateway';

try {
  const running = await startService({ service: SERVICE });
  console.log(`[${SERVICE}] listening on ${running.url}`);

  const shutdown = (): void => {
    void running.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(`[${SERVICE}] shutdown failed: ${String(error)}`);
        process.exit(1);
      },
    );
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(`[${SERVICE}] failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
