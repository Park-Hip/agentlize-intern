import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  KeyStore,
  PagePasswordStore,
  openGatewayDatabase,
  openGatewayDatabaseReadOnly,
  PROPOSAL_ID_PATTERN,
  TraceReader,
} from '@lab/gateway';
import {
  DATA_DIR_ENV,
  LOOPBACK_HOST,
  PERSONAS,
  PORT_ENV,
  PUBLIC_BASE_URL_ENV,
  RULES_PATH_ENV,
  SERVICE_KEY_ENV,
  TEST_HOOKS_ENV,
} from '@lab/shared';
import { DOORS, type Answer } from '@lab/tests/doors';
import {
  freePorts,
  killChild,
  spawnBuiltService,
  stopChild,
  waitForHealth,
  type SpawnedService,
} from '@lab/tests/process';
import type {
  DraftContext,
  ProposalDraft,
  ProposalRun,
  ProposalStatus,
  SendProposalInput,
  TargetCommand,
  TargetFault,
  TargetObservation,
  TaskSnapshot,
  WriteTarget,
} from './types.js';

const FETCH_TIMEOUT_MS = 15_000;
const SERVICE = 'gateway';

interface Stack {
  readonly gatewayDir: string;
  readonly systemsDir: string;
  readonly serviceKey: string;
  readonly directoryPort: number;
  readonly tasksPort: number;
  readonly gatewayPort: number;
  readonly gatewayUrl: string;
  readonly tasksUrl: string;
  readonly gatewayEnv: NodeJS.ProcessEnv;
  readonly systemsEnv: NodeJS.ProcessEnv;
  readonly serviceHeaders: Readonly<Record<string, string>>;
  readonly hoaKey: string;
  readonly hoaPassword: string;
  readonly quangPassword: string;
}

/** The proposal code a `propose_task_change` answer carries, or a clear refusal. */
export function proposalDraftOf(answer: Answer): ProposalDraft {
  const accepted = answer.reasonCode === null || answer.reasonCode === 'NEEDS_APPROVAL';
  if (answer.status !== 200 || !accepted) {
    throw new Error(
      `propose_task_change answered status ${answer.status} and reason ${String(answer.reasonCode)}`,
    );
  }
  const match = /dx-[0-9a-f]{16}/.exec(answer.text);
  if (match === null) throw new Error('propose_task_change returned no proposal code');
  return { proposalId: match[0], needsApproval: answer.reasonCode === 'NEEDS_APPROVAL' };
}

function responseText(response: Response): Promise<string> {
  return response.text();
}

/**
 * The gateway target: the gateway, the fake directory and the fake task list on
 * free ports and a temporary data folder. One target serves one run, so a
 * crash, a restart and the write history all belong to that run alone.
 */
export class GatewayTarget implements WriteTarget {
  readonly name = SERVICE;

  private stack: Stack | undefined;
  private services: SpawnedService[] = [];
  private gateway: SpawnedService | undefined;
  private tasks: SpawnedService | undefined;
  private restartCount = 0;

  get restarts(): number {
    return this.restartCount;
  }

  async build(): Promise<void> {
    if (this.stack !== undefined) throw new Error('the gateway target is already built');

    const ports = await freePorts(3);
    const directoryPort = ports[0];
    const tasksPort = ports[1];
    const gatewayPort = ports[2];
    if (directoryPort === undefined || tasksPort === undefined || gatewayPort === undefined) {
      throw new Error('could not reserve three loopback ports for the gateway target');
    }

    const gatewayDir = await mkdtemp(join(tmpdir(), 'agentlize-measure-target-gateway-'));
    const systemsDir = await mkdtemp(join(tmpdir(), 'agentlize-measure-target-systems-'));
    const serviceKey = randomBytes(32).toString('base64url');
    const gatewayUrl = `http://${LOOPBACK_HOST}:${gatewayPort}`;
    const commonEnv: NodeJS.ProcessEnv = {
      ...process.env,
      [SERVICE_KEY_ENV]: serviceKey,
      [TEST_HOOKS_ENV]: '1',
      [PORT_ENV.directory]: String(directoryPort),
      [PORT_ENV.tasks]: String(tasksPort),
      [PORT_ENV.gateway]: String(gatewayPort),
    };
    const gatewayEnv: NodeJS.ProcessEnv = {
      ...commonEnv,
      [DATA_DIR_ENV]: gatewayDir,
      [RULES_PATH_ENV]: join(gatewayDir, 'rules.json'),
      [PUBLIC_BASE_URL_ENV]: gatewayUrl,
    };
    const systemsEnv: NodeJS.ProcessEnv = {
      ...commonEnv,
      [DATA_DIR_ENV]: systemsDir,
    };

    try {
      const directory = spawnBuiltService('fake-directory', systemsEnv);
      this.services.push(directory);
      await waitForHealth(directory, directoryPort, serviceKey);

      const tasks = spawnBuiltService('fake-tasks', systemsEnv);
      this.services.push(tasks);
      this.tasks = tasks;
      await waitForHealth(tasks, tasksPort, serviceKey);

      const gateway = spawnBuiltService('gateway', gatewayEnv);
      this.services.push(gateway);
      this.gateway = gateway;
      await waitForHealth(gateway, gatewayPort, serviceKey);

      const db = openGatewayDatabase(gatewayDir);
      let hoaKey: string;
      let hoaPassword: string;
      let quangPassword: string;
      try {
        hoaKey = new KeyStore(db).issue({
          employeeId: PERSONAS.hoa.employeeId,
          caller: 'tho-than-desktop',
        }).rawKey;
        const pagePasswords = new PagePasswordStore(db);
        hoaPassword = pagePasswords.issue({ employeeId: PERSONAS.hoa.employeeId }).rawPassword;
        quangPassword = pagePasswords.issue({ employeeId: PERSONAS.quang.employeeId }).rawPassword;
      } finally {
        db.close();
      }

      this.stack = {
        gatewayDir,
        systemsDir,
        serviceKey,
        directoryPort,
        tasksPort,
        gatewayPort,
        gatewayUrl,
        tasksUrl: `http://${LOOPBACK_HOST}:${tasksPort}`,
        gatewayEnv,
        systemsEnv,
        serviceHeaders: {
          authorization: `Bearer ${serviceKey}`,
          'content-type': 'application/json',
        },
        hoaKey,
        hoaPassword,
        quangPassword,
      };
    } catch (error) {
      await this.close();
      await rm(gatewayDir, { recursive: true, force: true });
      await rm(systemsDir, { recursive: true, force: true });
      throw error;
    }
  }

  async sendProposal(input: SendProposalInput): Promise<ProposalRun> {
    const stack = this.requireStack();
    const draft = input.draft ?? ((context, taskIds, changes) => this.draftThroughHttp(context, taskIds, changes));

    const handle = await draft(
      { gateway: stack.gatewayUrl, key: stack.hoaKey },
      input.taskIds,
      input.changes,
    );
    if (!PROPOSAL_ID_PATTERN.test(handle.proposalId)) {
      throw new Error(`the draft returned an invalid proposal code "${handle.proposalId}"`);
    }

    const baseline = await this.history(input.taskIds);
    const alreadyWritten = baseline.filter((item) => item.writes !== 0);
    if (alreadyWritten.length > 0) {
      throw new Error(`the task list already held writes for ${alreadyWritten.map((item) => item.taskId).join(', ')}`);
    }

    if (input.fault !== undefined) await this.armFault(input.fault);
    await this.pressSend(handle.proposalId, stack.hoaPassword);

    let writesBeforeApproval = 0;
    if (handle.needsApproval) {
      writesBeforeApproval = (await this.history(input.taskIds)).reduce((sum, item) => sum + item.writes, 0);
      await this.pressApproval(handle.proposalId, stack.quangPassword);
    }

    return {
      proposalId: handle.proposalId,
      items: input.taskIds.length,
      needsApproval: handle.needsApproval,
      baseline,
      writesBeforeApproval,
    };
  }

  async crash(): Promise<void> {
    const gateway = this.gateway;
    if (gateway === undefined) return;
    this.gateway = undefined;
    await killChild(gateway.child);
  }

  async restart(): Promise<void> {
    const stack = this.requireStack();
    if (this.gateway !== undefined) throw new Error('the gateway is still running');

    const gateway = spawnBuiltService('gateway', stack.gatewayEnv);
    this.services.push(gateway);
    await waitForHealth(gateway, stack.gatewayPort, stack.serviceKey);
    this.gateway = gateway;
    this.restartCount += 1;
  }

  async outageTasks(ms: number): Promise<void> {
    const stack = this.requireStack();
    if (!Number.isInteger(ms) || ms < 0) throw new Error(`the outage length must be a whole number of ms, got ${ms}`);
    const tasks = this.tasks;
    if (tasks === undefined) throw new Error('the task list is not running');

    this.tasks = undefined;
    await killChild(tasks.child);
    await sleep(ms);

    const restarted = spawnBuiltService('fake-tasks', stack.systemsEnv);
    this.services.push(restarted);
    await waitForHealth(restarted, stack.tasksPort, stack.serviceKey);
    this.tasks = restarted;
  }

  async history(taskIds: readonly string[]): Promise<readonly TaskSnapshot[]> {
    const stack = this.requireStack();
    return Promise.all(
      taskIds.map(async (taskId) => {
        const encoded = encodeURIComponent(taskId);
        const [countResponse, taskResponse] = await Promise.all([
          fetch(`${stack.tasksUrl}/admin/write-count?task=${encoded}`, {
            headers: stack.serviceHeaders,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          }),
          fetch(`${stack.tasksUrl}/tasks/${encoded}`, {
            headers: stack.serviceHeaders,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          }),
        ]);
        if (!countResponse.ok) {
          throw new Error(`write-count for ${taskId} answered ${countResponse.status}`);
        }
        if (!taskResponse.ok) throw new Error(`task ${taskId} answered ${taskResponse.status}`);

        const count = (await countResponse.json()) as { count: number };
        const content = (await taskResponse.json()) as Record<string, unknown>;
        const version = content['version'];
        if (typeof version !== 'number') throw new Error(`task ${taskId} carries no numeric version`);
        return { taskId, writes: count.count, version, content };
      }),
    );
  }

  async status(proposalId: string): Promise<ProposalStatus> {
    const stack = this.requireStack();
    const response = await fetch(`${stack.gatewayUrl}/v1/tools/get_request_status`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${stack.hoaKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ request_id: proposalId }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const body = (await response.json()) as { text: string; reason_code: string | null };
    return { status: response.status, text: body.text, reasonCode: body.reason_code };
  }

  observe(): TargetObservation {
    const stack = this.requireStack();
    const db = openGatewayDatabaseReadOnly(stack.gatewayDir);
    try {
      const trace = new TraceReader(db).list({ limit: 1_000_000 });
      const total = db.prepare('SELECT COUNT(*) AS total FROM write_commands').get() as { total: number };
      const commands = db
        .prepare('SELECT position, status, attempts FROM write_commands ORDER BY position')
        .all() as TargetCommand[];
      return { trace, writeCommands: total.total, commands };
    } finally {
      db.close();
    }
  }

  scanTrace(): { readonly rows: number; readonly hits: number } {
    const stack = this.stack;
    if (stack === undefined) return { rows: 0, hits: 0 };
    const observation = this.observe();
    const markers = [
      ...Object.values(PERSONAS).map((persona) => persona.fullName),
      '0900 555',
      'Đường Giả Định',
      '@lab.example',
      stack.hoaKey,
      stack.hoaPassword,
      stack.quangPassword,
      stack.serviceKey,
    ].filter((marker) => marker !== '');

    let hits = 0;
    for (const row of observation.trace) {
      const text = JSON.stringify(row);
      if (markers.some((marker) => text.includes(marker))) hits += 1;
    }
    return { rows: observation.trace.length, hits };
  }

  async close(): Promise<void> {
    const stack = this.stack;
    this.stack = undefined;
    for (const service of [...this.services].reverse()) {
      try {
        await stopChild(service.child);
      } catch {
        // A process that is already gone must not stop the cleanup.
      }
    }
    this.services = [];
    this.gateway = undefined;
    this.tasks = undefined;
    if (stack !== undefined) {
      await rm(stack.gatewayDir, { recursive: true, force: true });
      await rm(stack.systemsDir, { recursive: true, force: true });
    }
  }

  private requireStack(): Stack {
    if (this.stack === undefined) throw new Error('the gateway target is not built');
    return this.stack;
  }

  private async draftThroughHttp(
    context: DraftContext,
    taskIds: readonly string[],
    changes: Readonly<Record<string, string>>,
  ): Promise<ProposalDraft> {
    const door = DOORS.find((candidate) => candidate.name === 'http');
    if (door === undefined) throw new Error('the http door is missing');
    const answer = await door.call(
      context.gateway,
      'propose_task_change',
      { task_ids: taskIds, changes },
      context.key,
    );
    return proposalDraftOf(answer);
  }

  private async armFault(fault: TargetFault): Promise<void> {
    const stack = this.requireStack();
    const body =
      fault.kind === 'drop-answer-after-commit'
        ? { mode: 'drop_response_after_commit', count: fault.count }
        : fault.kind === 'hold-before-commit'
          ? { mode: 'hold_item_before_commit', position: fault.position, delay_ms: fault.delayMs }
          : { mode: 'hold_item_after_commit', position: fault.position, delay_ms: fault.delayMs };
    const response = await fetch(`${stack.tasksUrl}/admin/faults`, {
      method: 'POST',
      headers: stack.serviceHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`the task list refused the fault with status ${response.status}`);
    }
    await responseText(response);
  }

  private async pressSend(proposalId: string, password: string): Promise<void> {
    const stack = this.requireStack();
    const cookie = await this.login(PERSONAS.hoa.employeeId, password, `/xac-nhan/${proposalId}`);
    const card = await fetch(`${stack.gatewayUrl}/xac-nhan/${proposalId}`, {
      headers: { cookie },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (card.status !== 200) throw new Error(`the confirmation card answered ${card.status}`);
    const csrf = /name="csrf" value="([^"]+)"/.exec(await card.text())?.[1];
    if (csrf === undefined) throw new Error('the confirmation card carries no CSRF token');

    const sent = await fetch(`${stack.gatewayUrl}/xac-nhan/${proposalId}/gui`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf }).toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (sent.status !== 303) throw new Error(`Gửi answered ${sent.status}`);
    await responseText(sent);
  }

  private async pressApproval(proposalId: string, password: string): Promise<void> {
    const stack = this.requireStack();
    const cookie = await this.login(PERSONAS.quang.employeeId, password, `/duyet/${proposalId}`);
    const page = await fetch(`${stack.gatewayUrl}/duyet/${proposalId}`, {
      headers: { cookie },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (page.status !== 200) throw new Error(`the approval page answered ${page.status}`);
    const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
    if (csrf === undefined) throw new Error('the approval page carries no CSRF token');

    const approved = await fetch(`${stack.gatewayUrl}/duyet/${proposalId}/duyet`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf }).toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (approved.status !== 303) throw new Error(`Duyệt answered ${approved.status}`);
    await responseText(approved);
  }

  private async login(employeeId: string, password: string, next: string): Promise<string> {
    const stack = this.requireStack();
    const login = await fetch(`${stack.gatewayUrl}/dang-nhap`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ employee: employeeId, password, next }).toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (login.status !== 303) throw new Error(`page login for ${employeeId} answered ${login.status}`);
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    await responseText(login);
    if (cookie === '') throw new Error(`page login for ${employeeId} returned no session cookie`);
    return cookie;
  }
}
