import { fileURLToPath } from 'node:url';
import { Context } from '@temporalio/activity';
import { NativeConnection, Worker } from '@temporalio/worker';

const address = process.env.TEMPORAL_ADDRESS;
const taskQueue = process.env.TEMPORAL_TASK_QUEUE;
const controlUrl = process.env.LAB_TEMPORAL_CONTROL_URL;
const serviceKey = process.env.LAB_SERVICE_KEY;

if (!address || !taskQueue || !controlUrl || !serviceKey) {
  console.error('[temporal-worker] Temporal address, task queue, control URL and service key are required');
  process.exit(1);
}

/**
 * One activity call runs one gateway command through the host. The activity
 * does not hold business state: a retry asks the host again and the command's
 * fixed idempotency key decides whether the target system writes or replays.
 */
async function runCommand({ commandId }) {
  // A heartbeat makes a dead worker visible in seconds instead of waiting for the full activity timeout.
  const heartbeat = setInterval(() => Context.current().heartbeat(), 1_000);
  try {
    const response = await fetch(`${controlUrl}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lab-service-key': serviceKey },
      body: JSON.stringify({ commandId }),
      signal: AbortSignal.timeout(150_000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`the command host answered ${response.status}: ${JSON.stringify(body)}`);
    if (body.decision === 'retry') throw new Error(`command ${commandId} is not settled yet`);
    return body;
  } finally {
    clearInterval(heartbeat);
  }
}

const connection = await NativeConnection.connect({ address });
const worker = await Worker.create({
  connection,
  namespace: 'default',
  taskQueue,
  workflowsPath: fileURLToPath(new URL('./workflows.js', import.meta.url)),
  activities: { runCommand },
});

console.log('[temporal-worker] ready');
await worker.run();
