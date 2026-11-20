import { performance } from 'node:perf_hooks';
import { PERSONAS } from '@lab/shared';
import { DOORS, type Answer, type Door } from '@lab/tests/doors';
import { safetyCounter } from '../safety.js';
import { roundMs } from '../stats.js';
import type {
  MeasureContext,
  SafetyCounter,
  Sample,
  Scenario,
  ScenarioResult,
  TargetRequest,
} from '../types.js';

const PROPOSE_TASK_ARGS = { task_ids: ['T-12'], changes: { status: 'done' } } as const;
const PROPOSE_EMPLOYEE_ARGS = { employee_id: 'NV-04', work_email: 'minh.measure@lab.example' } as const;
const WARMUP_ROUNDS = 2;

interface ToolPlan {
  readonly tool: string;
  readonly employeeId: string;
  readonly args: (requestId: string) => unknown;
  /** Read answers from the staff persona must not carry an HR-only field value. */
  readonly scanForPersonalFields: boolean;
  /** A proposal past the bulk threshold answers NEEDS_APPROVAL and still succeeds. */
  readonly allowNeedsApproval: boolean;
}

const PLANS: readonly ToolPlan[] = [
  {
    tool: 'find_employee',
    employeeId: 'NV-02',
    args: () => ({ name: 'Minh' }),
    scanForPersonalFields: true,
    allowNeedsApproval: false,
  },
  {
    tool: 'get_task',
    employeeId: 'NV-02',
    args: () => ({ task_id: 'T-12' }),
    scanForPersonalFields: true,
    allowNeedsApproval: false,
  },
  {
    tool: 'list_tasks',
    employeeId: 'NV-02',
    args: () => ({ assignee: 'NV-03', status: 'doing' }),
    scanForPersonalFields: false,
    allowNeedsApproval: false,
  },
  {
    tool: 'get_request_status',
    employeeId: 'NV-02',
    args: (requestId) => ({ request_id: requestId }),
    scanForPersonalFields: false,
    allowNeedsApproval: true,
  },
  {
    tool: 'propose_task_change',
    employeeId: 'NV-02',
    args: () => PROPOSE_TASK_ARGS,
    scanForPersonalFields: false,
    allowNeedsApproval: true,
  },
  {
    tool: 'propose_employee_change',
    employeeId: 'NV-06',
    args: () => PROPOSE_EMPLOYEE_ARGS,
    scanForPersonalFields: false,
    allowNeedsApproval: true,
  },
];

/** Values only an HR reader may see, plus the fake values behind the labels. */
const STAFF_FORBIDDEN_MARKERS = [
  'Số điện thoại cá nhân: ',
  'Địa chỉ nhà: ',
  '0900 555',
  'Đường Giả Định',
];

function assertSuccessful(answer: Answer, label: string, allowNeedsApproval = false): void {
  const accepted =
    answer.reasonCode === null || (allowNeedsApproval && answer.reasonCode === 'NEEDS_APPROVAL');
  if (answer.status !== 200 || !accepted) {
    throw new Error(
      `${label}: expected one successful answer, got status ${answer.status} and reason ${String(answer.reasonCode)}`,
    );
  }
}

async function timedCall(
  door: Door,
  plan: ToolPlan,
  context: MeasureContext,
  key: string,
  requestId: string,
): Promise<{ answer: Answer; clientMs: number }> {
  const startedAt = performance.now();
  const answer = await door.call(context.services.gateway, plan.tool, plan.args(requestId), key);
  return { answer, clientMs: performance.now() - startedAt };
}

/** Rotate the starting door every round, so no door always follows the previous round's last call. */
function doorsForRun(run: number): readonly Door[] {
  const shift = (run - 1) % DOORS.length;
  return [...DOORS.slice(shift), ...DOORS.slice(0, shift)];
}

/**
 * M1: the gateway's own handling time (trace `duration_ms`) and the client
 * time for each of the six tools, through each of the three doors.
 * Every tool and door gets exactly `runs` measured calls; warmups are separate.
 */
const scenario: Scenario = {
  name: 'm1-gateway',
  description:
    'M1: sáu tool qua ba cửa vào, mỗi cặp tool và cửa lặp theo --runs, đo thời gian cổng tự xử lý và thời gian phía client.',

  async run(context: MeasureContext): Promise<ScenarioResult> {
    const keys = new Map<string, string>();
    for (const employeeId of new Set(PLANS.map((plan) => plan.employeeId))) {
      keys.set(employeeId, context.issueKey({ employeeId }));
    }
    const keyOf = (plan: ToolPlan): string => {
      const key = keys.get(plan.employeeId);
      if (key === undefined) throw new Error(`no key for ${plan.employeeId}`);
      return key;
    };

    // One proposal gives get_request_status a stable object to read for the whole run.
    const setupDoor = DOORS.find((door) => door.name === 'http');
    if (setupDoor === undefined) throw new Error('the http door is missing');
    const hoaKey = keys.get('NV-02');
    if (hoaKey === undefined) throw new Error('no key for NV-02');
    const setup = await setupDoor.call(
      context.services.gateway,
      'propose_task_change',
      PROPOSE_TASK_ARGS,
      hoaKey,
    );
    assertSuccessful(setup, 'setup proposal');
    const requestId = /dx-[0-9a-f]{16}/.exec(setup.text)?.[0];
    if (requestId === undefined) throw new Error('the setup proposal returned no proposal code');

    for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
      for (const plan of PLANS) {
        for (const door of DOORS) {
          const { answer } = await timedCall(door, plan, context, keyOf(plan), requestId);
          assertSuccessful(answer, `warmup ${door.name}/${plan.tool}`, plan.allowNeedsApproval);
        }
      }
    }

    const samples: Sample[] = [];
    let outOfScopeHits = 0;

    for (let run = 1; run <= context.runs; run += 1) {
      for (const plan of PLANS) {
        const key = keyOf(plan);
        for (const door of doorsForRun(run)) {
          const { answer, clientMs } = await timedCall(door, plan, context, key, requestId);
          assertSuccessful(answer, `${door.name}/${plan.tool} run ${run}`, plan.allowNeedsApproval);
          if (
            plan.scanForPersonalFields &&
            STAFF_FORBIDDEN_MARKERS.some((marker) => answer.text.includes(marker))
          ) {
            outOfScopeHits += 1;
          }
          samples.push({
            door: door.name,
            tool: plan.tool,
            run,
            client_ms: roundMs(clientMs),
            gateway_duration_ms: null,
            trace_id: answer.traceId,
            status: answer.status,
            reason_code: answer.reasonCode,
          });
        }
      }
      if (run % 10 === 0 || run === context.runs) {
        context.log(`[measure] m1-gateway: ${run}/${context.runs} rounds`);
      }
    }

    const observed = context.observe();
    const traceById = new Map(observed.trace.map((row) => [row.traceId, row]));
    const entryOf = new Map(DOORS.map((door) => [door.name, door.traceEntry]));

    for (const sample of samples) {
      if (sample.trace_id === null) {
        throw new Error(`${sample.door}/${sample.tool} run ${sample.run} returned no trace code`);
      }
      const row = traceById.get(sample.trace_id);
      if (row === undefined) {
        throw new Error(`${sample.door}/${sample.tool} run ${sample.run} has no trace line`);
      }
      if (row.entry !== entryOf.get(sample.door) || row.tool !== sample.tool || row.outcome !== 'ok') {
        throw new Error(
          `${sample.door}/${sample.tool} run ${sample.run} trace says entry=${row.entry}, tool=${row.tool}, outcome=${row.outcome}`,
        );
      }
      sample.gateway_duration_ms = row.durationMs;
    }

    const forbiddenInTrace = [
      ...Object.values(PERSONAS).map((persona) => persona.fullName),
      '0900 555',
      'Đường Giả Định',
      '@lab.example',
      ...keys.values(),
      context.serviceKey,
    ];
    const personalTraceHits = observed.trace.filter((row) => {
      const text = JSON.stringify(row);
      return forbiddenInTrace.some((marker) => text.includes(marker));
    }).length;

    const counters: SafetyCounter[] = [
      safetyCounter(
        'duplicate_writes',
        false,
        null,
        'Phép đo chỉ soạn đề xuất, không bấm Gửi, nên không có lệnh ghi nào để gửi hai lần.',
      ),
      safetyCounter(
        'lost_commands',
        false,
        null,
        'Không có lệnh ghi nào được tạo, nên không có lệnh nào bị mất.',
      ),
      safetyCounter(
        'unauthorized_writes',
        true,
        observed.writeCommands,
        observed.writeCommands === 0
          ? 'Bảng write_commands rỗng sau phép đo, nên không có lệnh ghi nào chạm hệ thống giả.'
          : `Bảng write_commands có ${observed.writeCommands} dòng sau một phép đo chỉ đọc, nghĩa là một lệnh ghi đã vượt qua bước xác nhận.`,
      ),
      safetyCounter(
        'out_of_scope_fields',
        true,
        outOfScopeHits,
        `Đã quét mọi câu trả lời find_employee và get_task của người đọc vai staff; ${outOfScopeHits} câu chứa số điện thoại cá nhân hoặc địa chỉ nhà.`,
      ),
      safetyCounter(
        'personal_data_in_trace',
        true,
        personalTraceHits,
        `Đã quét mọi dòng vết cho tên, email công việc, số điện thoại, địa chỉ nhà và khoá của phép đo; ${personalTraceHits} dòng chứa.`,
      ),
    ];

    const targets: TargetRequest[] = [
      {
        id: 'm1-gateway-p95-50ms',
        description:
          'Thời gian cổng tự xử lý p95 không quá 50 ms trên toàn bộ sáu tool và ba cửa vào; chỉ báo, không làm lệnh thất bại.',
        metric: 'gateway_duration_ms',
        threshold_ms: 50,
        scope: { kind: 'overall' },
        enforced: false,
      },
    ];

    return {
      samples,
      safety: counters,
      targets,
      notes: [
        'Sau khi tổng số mục cùng việc trong 60 phút chạm ngưỡng hàng loạt, propose_task_change trả NEEDS_APPROVAL và propose_employee_change trả null vì hành động email không khai ngưỡng hàng loạt; cả hai vẫn là câu trả lời thành công và được tính là một mẫu.',
      ],
      parameters: {
        doors: DOORS.map((door) => door.name),
        tools: PLANS.map((plan) => plan.tool),
        samples_per_tool_door: context.runs,
        warmup_rounds: WARMUP_ROUNDS,
        door_order: 'rotated each round; every tool sends to all three doors before the next tool',
        gateway_duration_source: 'trace.duration_ms',
        client_duration_source:
          'performance.now around Door.call, including the fake host session for the tho-than-host door',
        personas: Object.fromEntries(PLANS.map((plan) => [plan.tool, plan.employeeId])),
        arguments: {
          find_employee: { name: 'Minh' },
          get_task: { task_id: 'T-12' },
          list_tasks: { assignee: 'NV-03', status: 'doing' },
          get_request_status: 'proposal created during setup',
          propose_task_change: PROPOSE_TASK_ARGS,
          propose_employee_change: PROPOSE_EMPLOYEE_ARGS,
        },
      },
    };
  },
};

export default scenario;
