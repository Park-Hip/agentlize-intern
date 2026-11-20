import { createServer } from 'node:http';
import { Client, Connection } from '@temporalio/client';
import { TasksAdapter } from '../../../gateway/dist/adapters/tasks.js';
import { startGateway } from '../../../gateway/dist/server.js';
import { createCommandRunner } from './command-runner.js';

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`${JSON.stringify(body)}\n`);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const address = process.env.TEMPORAL_ADDRESS;
const taskQueue = process.env.TEMPORAL_TASK_QUEUE;
const controlPort = Number(process.env.LAB_TEMPORAL_CONTROL_PORT);
const tasksPort = process.env.LAB_TASKS_PORT;
const serviceKey = process.env.LAB_SERVICE_KEY;

if (!address || !taskQueue || !Number.isInteger(controlPort) || !tasksPort || !serviceKey) {
  console.error('[temporal-host] Temporal address, task queue, control port, tasks port and service key are required');
  process.exit(1);
}

const connection = await Connection.connect({ address });
const client = new Client({ connection });
const adapter = new TasksAdapter({ url: `http://127.0.0.1:${tasksPort}`, serviceKey });

/** The seam the gateway already has: a confirmed proposal becomes one Temporal workflow. */
let running;
const executor = {
  async execute(proposal) {
    const commands = running.commands.listByProposal(proposal.proposalId);
    if (commands.length === 0) throw new Error(`proposal ${proposal.proposalId} has no write command`);
    const commandIds = commands.map((command) => command.commandId);
    try {
      await client.workflow.start('writeProposal', {
        taskQueue,
        workflowId: `proposal-${proposal.proposalId}`,
        args: [{ commandIds }],
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      });
    } catch (error) {
      // A second press must not start a second workflow for the same proposal.
      if (/already (started|running)/i.test(String(error))) return { state: 'received' };
      throw error;
    }
    return { state: 'received' };
  },
};

try {
  running = await startGateway({ executor });
} catch (error) {
  console.error(`[temporal-host] gateway failed to start: ${error instanceof Error ? error.message : String(error)}`);
  await connection.close();
  process.exit(1);
}

const runner = createCommandRunner({
  commands: running.commands,
  proposals: running.proposals,
  trace: running.trace,
  adapter,
});

const control = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/health' && req.method === 'GET') return sendJson(res, 200, { status: 'ok' });
  if (path !== '/command' || req.method !== 'POST') return sendJson(res, 404, { error: 'not_found' });
  if (req.headers['x-lab-service-key'] !== serviceKey) return sendJson(res, 401, { error: 'unauthorized' });

  readJson(req)
    .then((body) => {
      const commandId = typeof body?.commandId === 'string' ? body.commandId : '';
      if (commandId === '') return sendJson(res, 400, { error: 'commandId is required' });
      return runner.run(commandId).then((outcome) => sendJson(res, 200, outcome));
    })
    .catch((error) => {
      console.error(`[temporal-host] command request failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' });
      else res.destroy();
    });
});

await new Promise((resolve, reject) => {
  control.once('error', reject);
  control.listen(controlPort, '127.0.0.1', () => {
    control.off('error', reject);
    resolve();
  });
});

console.log('[temporal-host] gateway and command endpoint ready');

let stopping = false;
async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  await new Promise((resolve) => control.close(() => resolve()));
  try {
    await running.close();
  } finally {
    await connection.close();
    process.exit(code);
  }
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));
