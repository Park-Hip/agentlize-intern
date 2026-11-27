import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElicitResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { z } from "zod";
import type { ProbeContext } from "./context.js";
import { labEnv, identityHeaders, redactHeaders } from "./log.js";
import { PROBE_VERSION, SERVER_NAME } from "./meta.js";

export const TOOL_NAMES = [
  "whoami",
  "echo_link",
  "fake_write",
  "ask_confirm",
  "flaky",
  "slow",
  "structured",
  "big_list",
] as const;

/** Default size of big_list: large enough to pass the 8,000 character budget MausBot puts on stdio results. */
export const BIG_LIST_DEFAULT_COUNT = 100;

/** Simulated task list for big_list. Deterministic, so two hosts see the same bytes. */
export function simulatedTasks(count: number) {
  const people = ["Hoa", "Nam", "Minh", "Quang"];
  const statuses = ["todo", "doing", "done"] as const;
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      id: `T-${String(n).padStart(3, "0")}`,
      title: `Task giả lập số ${n}`,
      status: statuses[n % statuses.length],
      assignee: people[n % people.length],
      department: n % 2 === 0 ? "Vận hành" : "Kinh doanh",
      due: `2026-12-${String((n % 28) + 1).padStart(2, "0")}`,
    };
  });
}

/**
 * Simulated directory. Only fictional employees from the Lab brief, and the
 * .invalid TLD makes it impossible to reach a real mailbox by accident.
 */
const EMPLOYEES: Record<
  string,
  { id: string; name: string; role: string; department: string; email: string; phone: string }
> = {
  Hoa: {
    id: "E-01",
    name: "Hoa",
    role: "Trưởng phòng Vận hành",
    department: "Vận hành",
    email: "hoa@example.invalid",
    phone: "0900 000 001",
  },
  Nam: {
    id: "E-02",
    name: "Nam",
    role: "Nhân viên Vận hành",
    department: "Vận hành",
    email: "nam@example.invalid",
    phone: "0900 000 002",
  },
  Minh: {
    id: "E-03",
    name: "Minh",
    role: "Nhân viên Kinh doanh",
    department: "Kinh doanh",
    email: "minh@example.invalid",
    phone: "0900 000 003",
  },
  Quang: {
    id: "E-04",
    name: "Quang",
    role: "Trưởng phòng Kinh doanh",
    department: "Kinh doanh",
    email: "quang@example.invalid",
    phone: "0900 000 004",
  },
};

const TASK = {
  id: "T-12",
  title: "Chuẩn bị báo giá quý 4",
  status: "doing" as const,
  assignee: "Hoa",
  department: "Kinh doanh",
  due: "2026-11-20",
};

/** Attempt counters survive HTTP session restarts inside one process, so retries stay visible. */
const flakyAttempts = new Map<string, number>();

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

function firstHeader(
  headers: Record<string, string | string[] | number | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function currentHeaders(ctx: ProbeContext, extra: Extra) {
  return (
    (extra.requestInfo?.headers as Record<string, string | string[] | number | undefined> | undefined) ??
    ctx.lastHttp?.headers
  );
}

function httpSnapshot(ctx: ProbeContext, extra: Extra): Record<string, unknown> | null {
  const headers = currentHeaders(ctx, extra);
  if (!headers) return null;
  return {
    method: ctx.lastHttp?.method ?? null,
    path: ctx.lastHttp?.path ?? null,
    url: extra.requestInfo?.url?.toString() ?? null,
    remoteAddress: ctx.lastHttp?.remoteAddress ?? null,
    headers: redactHeaders(headers),
    rawHeaderNames: Object.keys(headers),
  };
}

function traceSnapshot(ctx: ProbeContext, extra: Extra): Record<string, unknown> {
  const headers = currentHeaders(ctx, extra);
  const meta = (extra._meta ?? {}) as Record<string, unknown>;
  const names = ["traceparent", "tracestate", "baggage", "x-request-id", "x-correlation-id"];
  const fromHeaders: Record<string, unknown> = {};
  const fromMeta: Record<string, unknown> = {};
  for (const name of names) {
    const headerValue = firstHeader(headers, name);
    if (headerValue !== undefined) fromHeaders[name] = headerValue;
    if (meta[name] !== undefined) fromMeta[name] = meta[name];
  }
  return { fromHeaders, fromMeta, metaKeys: Object.keys(meta) };
}

function logToolCall(ctx: ProbeContext, tool: string, args: unknown, extra: Extra): void {
  ctx.logger.write({
    kind: "tool_call",
    tool,
    arguments: args,
    requestId: extra.requestId,
    sessionId: extra.sessionId ?? ctx.sessionId ?? null,
    meta: extra._meta ?? null,
    http: httpSnapshot(ctx, extra),
    clientInfo: (ctx.initializeParams as { clientInfo?: unknown } | undefined)?.clientInfo ?? null,
  });
}

function logToolResult(ctx: ProbeContext, tool: string, extra: Extra, startedAt: number, result: CallToolResult): void {
  ctx.logger.write({
    kind: "tool_result",
    tool,
    requestId: extra.requestId,
    sessionId: extra.sessionId ?? ctx.sessionId ?? null,
    durationMs: Date.now() - startedAt,
    isError: result.isError === true,
    content: result.content,
    structuredContent: result.structuredContent ?? null,
  });
}

/** Resolve true when the full delay elapsed, false when the request was cancelled. */
function sleepStep(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(completed);
    };
    const timer = setTimeout(() => finish(true), ms);
    const onAbort = () => finish(false);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createProbeServer(ctx: ProbeContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: PROBE_VERSION, title: "Thổ Thần MCP probe" },
    {
      capabilities: { tools: {} },
      instructions:
        "Server thử nghiệm để đo cách Thổ Thần làm MCP host. Mọi dữ liệu là giả lập, không có dữ liệu thật và không có thay đổi nào được ghi.",
    },
  );

  server.registerTool(
    "whoami",
    {
      title: "Cho biết server thấy gì về người gọi",
      description:
        "Trả về mọi thông tin server nhận được về người gọi trong phiên và yêu cầu hiện tại: headers, tham số initialize, _meta và mã phiên. Đây là dữ liệu giả lập.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (extra: Extra) => {
      const startedAt = Date.now();
      logToolCall(ctx, "whoami", {}, extra);
      const headers = currentHeaders(ctx, extra);
      const redacted = redactHeaders(headers);
      const snapshot = {
        note: "Giao thức MCP không mang danh tính người dùng. Đây là toàn bộ thông tin server nhận được, không suy đoán thêm.",
        server: {
          name: SERVER_NAME,
          version: PROBE_VERSION,
          transport: ctx.transport,
          pid: process.pid,
          startedAt: new Date(ctx.startedAt).toISOString(),
          uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
          logFile: ctx.logger.file.split(/[\/]/).pop() ?? ctx.logger.file,
        },
        session: {
          sessionId: extra.sessionId ?? ctx.sessionId ?? null,
          bearerRequired: ctx.bearerRequired,
          simulatedUsers: Object.keys(EMPLOYEES),
        },
        client: {
          clientInfo: server.server.getClientVersion() ?? null,
          capabilities: server.server.getClientCapabilities() ?? null,
          initializeParams: ctx.initializeParams ?? null,
        },
        request: {
          requestId: extra.requestId,
          meta: extra._meta ?? null,
          progressToken: (extra._meta as { progressToken?: unknown } | undefined)?.progressToken ?? null,
        },
        http: httpSnapshot(ctx, extra),
        identityHeaders: identityHeaders(redacted),
        labEnv: labEnv(),
        trace: traceSnapshot(ctx, extra),
        simulatedData: {
          task: TASK,
          employees: EMPLOYEES,
          warning: "Toàn bộ tên, email và số điện thoại là dữ liệu giả lập.",
        },
      };
      const result: CallToolResult = {
        content: [
          {
            type: "text",
            text: "Ảnh chụp những gì server nhận được về người gọi (dữ liệu giả lập). JSON ở khối bên dưới.",
          },
          { type: "text", text: "```json\n" + JSON.stringify(snapshot, null, 2) + "\n```" },
        ],
      };
      logToolResult(ctx, "whoami", extra, startedAt, result);
      return result;
    },
  );

  server.registerTool(
    "echo_link",
    {
      title: "Trả về một link bấm được và một URL thô",
      description:
        "Trả về Markdown có link bấm được tới trang duyệt giả lập, kèm một URL thô để so sánh cách host hiển thị. Mỗi lượt bấm được ghi vào log.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (extra: Extra) => {
      const startedAt = Date.now();
      logToolCall(ctx, "echo_link", {}, extra);
      const id = randomBytes(5).toString("hex");
      const url = `${ctx.publicBaseUrl.replace(/\/+$/, "")}/approve/${id}`;
      const lines = [
        "Trang duyệt giả lập cho task T-12 (không có dữ liệu thật, không thay đổi gì).",
        "",
        `Bấm vào đây: [Duyệt chuyển T-12 cho Minh](${url})`,
        "",
        "Đường dẫn thô để so sánh:",
        url,
        "",
        ctx.transport === "http"
          ? "Mỗi lượt bấm vào link sẽ được ghi vào log với đầy đủ header của trình duyệt."
          : "Server đang chạy stdio, nên link chỉ mở được khi bật thêm chế độ --http.",
      ];
      ctx.logger.write({ kind: "echo_link", id, url, transport: ctx.transport });
      const result = textResult(lines.join("\n"));
      logToolResult(ctx, "echo_link", extra, startedAt, result);
      return result;
    },
  );

  server.registerTool(
    "fake_write",
    {
      title: "Ghi giả lập: chuyển task T-12",
      description:
        "Giả vờ chuyển task T-12 sang một nhân viên trong danh bạ giả lập. Không thay đổi dữ liệu nào. Tool được khai báo destructiveHint để đo kênh duyệt của host.",
      inputSchema: {
        taskId: z.string().default("T-12").describe("Mã task giả lập, mặc định T-12."),
        assignee: z
          .string()
          .default("Minh")
          .describe("Người nhận giả lập: Hoa, Nam, Minh hoặc Quang."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args, extra: Extra) => {
      const startedAt = Date.now();
      logToolCall(ctx, "fake_write", args, extra);
      const assignee = EMPLOYEES[args.assignee];
      const callId = randomBytes(4).toString("hex");
      const knownTask = args.taskId === TASK.id;
      if (!knownTask || !assignee) {
        const result = textResult(
          [
            "GIẢ LẬP (dry run): không có dữ liệu nào thay đổi.",
            `Không mô phỏng được: task "${args.taskId}" ${knownTask ? "có" : "không có"} trong dữ liệu giả lập.`,
            `Người nhận "${args.assignee}" ${assignee ? "có" : "không có"} trong danh bạ giả lập.`,
            "Danh bạ giả lập chỉ có Hoa, Nam, Minh, Quang; task giả lập chỉ có T-12.",
            `Mã lần gọi: ${callId}. Lần gọi vẫn được ghi vào log để đo P3 (kênh duyệt).`,
          ].join("\n"),
        );
        ctx.logger.write({
          kind: "fake_write",
          callId,
          taskId: args.taskId,
          assignee: args.assignee,
          matched: false,
          changed: false,
          note: "dry run, giá trị ngoài dữ liệu giả lập",
        });
        logToolResult(ctx, "fake_write", extra, startedAt, result);
        return result;
      }
      const lines = [
        "GIẢ LẬP (dry run): không có dữ liệu nào thay đổi.",
        "",
        `Đề xuất: chuyển task ${args.taskId} cho ${args.assignee}${assignee ? ` (${assignee.role}, phòng ${assignee.department})` : " (không có trong danh bạ giả lập)"}.`,
        `Trạng thái trước: ${TASK.title}, phụ trách ${TASK.assignee}, hạn ${TASK.due}.`,
        `Trạng thái sau (giả lập): phụ trách ${args.assignee}.`,
        `Mã lần gọi: ${callId}.`,
        "",
        "Tool này khai báo destructiveHint: true. Nếu host hỏi xác nhận trước khi gọi, đó là bằng chứng cho P3.",
      ];
      const result = textResult(lines.join("\n"));
      ctx.logger.write({
        kind: "fake_write",
        callId,
        taskId: args.taskId,
        assignee: args.assignee,
        matched: true,
        changed: false,
        note: "dry run",
      });
      logToolResult(ctx, "fake_write", extra, startedAt, result);
      return result;
    },
  );

  server.registerTool(
    "ask_confirm",
    {
      title: "Hỏi xác nhận qua elicitation/create",
      description:
        "Gọi elicitation/create khi client khai báo khả năng elicitation, ngược lại trả về câu trả lời nói rõ host không hỗ trợ. Log ghi lại nhánh nào đã chạy.",
      inputSchema: {
        taskId: z.string().default("T-12"),
        assignee: z.string().default("Minh"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args, extra: Extra) => {
      const startedAt = Date.now();
      logToolCall(ctx, "ask_confirm", args, extra);
      const capabilities = server.server.getClientCapabilities() ?? null;
      const declaresElicitation = Boolean(capabilities && capabilities.elicitation);
      ctx.logger.write({
        kind: "ask_confirm_branch",
        branch: declaresElicitation ? "elicitation_attempt" : "unsupported",
        capabilities,
        requestId: extra.requestId,
        sessionId: extra.sessionId ?? ctx.sessionId ?? null,
      });

      if (!declaresElicitation) {
        const result = textResult(
          [
            "Host không khai báo khả năng elicitation, nên server không hỏi được người dùng.",
            "Đây là bằng chứng cho P3: host chưa hỗ trợ elicitation/create, hoặc chưa bật.",
          ].join("\n"),
        );
        logToolResult(ctx, "ask_confirm", extra, startedAt, result);
        return result;
      }

      try {
        const elicitationResult = await extra.sendRequest(
          {
            method: "elicitation/create",
            params: {
              mode: "form",
              message: `Xác nhận chuyển task ${args.taskId} cho ${args.assignee}? Đây là đề xuất giả lập, không có dữ liệu thật.`,
              requestedSchema: {
                type: "object",
                properties: {
                  approve: {
                    type: "boolean",
                    title: `Duyệt chuyển ${args.taskId} cho ${args.assignee}`,
                    description: "Chọn ô này rồi bấm gửi để duyệt đề xuất giả lập.",
                    default: false,
                  },
                  note: {
                    type: "string",
                    title: "Ghi chú (không bắt buộc)",
                    description: "Ghi chú này chỉ được ghi vào log, không gửi đi đâu.",
                  },
                },
                required: ["approve"],
              },
            },
          },
          ElicitResultSchema,
          { timeout: 120_000 },
        );
        ctx.logger.write({
          kind: "ask_confirm_result",
          branch: "elicitation",
          action: elicitationResult.action,
          content: elicitationResult.content ?? null,
          requestId: extra.requestId,
        });
        const lines = [
          `Host đã trả lời elicitation/create: action = ${elicitationResult.action}.`,
          `Nội dung người dùng gửi: ${JSON.stringify(elicitationResult.content ?? null)}.`,
          "Không có thay đổi nào được ghi.",
        ];
        const result = textResult(lines.join("\n"));
        logToolResult(ctx, "ask_confirm", extra, startedAt, result);
        return result;
      } catch (error) {
        ctx.logger.write({
          kind: "ask_confirm_result",
          branch: "elicitation_error",
          error: String(error),
          requestId: extra.requestId,
        });
        const result = textResult(
          [
            "Host khai báo hỗ trợ elicitation, nhưng yêu cầu elicitation/create thất bại.",
            `Lỗi: ${String(error)}`,
            "Đây vẫn là bằng chứng cho P3: khai báo và hành vi thực tế không khớp.",
          ].join("\n"),
        );
        logToolResult(ctx, "ask_confirm", extra, startedAt, result);
        return result;
      }
    },
  );

  server.registerTool(
    "flaky",
    {
      title: "Lỗi lần đầu, thành công lần sau",
      description:
        "Lần gọi đầu tiên cho mỗi giá trị key trả về isError: true, các lần sau thành công. Dùng để xem host hoặc model có tự gọi lại không.",
      inputSchema: {
        key: z
          .string()
          .default("t-12")
          .describe("Khóa đếm số lần thử. Đổi khóa thì bộ đếm bắt đầu lại."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args, extra: Extra) => {
      const startedAt = Date.now();
      logToolCall(ctx, "flaky", args, extra);
      const attempt = (flakyAttempts.get(args.key) ?? 0) + 1;
      flakyAttempts.set(args.key, attempt);
      ctx.logger.write({
        kind: "flaky_attempt",
        key: args.key,
        attempt,
        requestId: extra.requestId,
        sessionId: extra.sessionId ?? ctx.sessionId ?? null,
      });

      if (attempt === 1) {
        const result = textResult(
          [
            `Lỗi giả lập cho khóa "${args.key}" ở lần gọi 1.`,
            "Đây là isError: true ở tầng tool, không phải lỗi giao thức.",
            "Nếu host tự gọi lại, log sẽ có lần gọi 2 với cùng khóa.",
          ].join("\n"),
          true,
        );
        logToolResult(ctx, "flaky", extra, startedAt, result);
        return result;
      }

      const result = textResult(
        [
          `Thành công ở lần gọi thứ ${attempt} cho khóa "${args.key}".`,
          "Không còn lỗi giả lập. Số lần gọi trước đó nằm trong log.",
        ].join("\n"),
      );
      logToolResult(ctx, "flaky", extra, startedAt, result);
      return result;
    },
  );

  server.registerTool(
    "slow",
    {
      title: "Chờ N giây và gửi tiến độ",
      description:
        "Chờ N giây (tối đa 300) và gửi thông báo tiến độ nếu client có gửi progressToken. Log ghi lúc bắt đầu, kết thúc và hủy.",
      inputSchema: {
        seconds: z
          .number()
          .int()
          .min(0)
          .max(300)
          .default(5)
          .describe("Số giây cần chờ, từ 0 đến 300."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, extra: Extra) => {
      const startedAt = Date.now();
      const seconds = args.seconds;
      const progressToken = (extra._meta as { progressToken?: string | number } | undefined)?.progressToken;
      logToolCall(ctx, "slow", args, extra);
      ctx.logger.write({
        kind: "slow_start",
        seconds,
        progressToken: progressToken ?? null,
        requestId: extra.requestId,
        sessionId: extra.sessionId ?? ctx.sessionId ?? null,
      });

      let waited = 0;
      let cancelled = false;
      const onAbort = () => {
        if (cancelled) return;
        cancelled = true;
        ctx.logger.write({
          kind: "tool_cancelled",
          tool: "slow",
          waitedSeconds: waited,
          seconds,
          elapsedMs: Date.now() - startedAt,
          requestId: extra.requestId,
          sessionId: extra.sessionId ?? ctx.sessionId ?? null,
        });
      };
      extra.signal.addEventListener("abort", onAbort, { once: true });

      for (let step = 1; step <= seconds; step += 1) {
        const completed = await sleepStep(1000, extra.signal);
        if (!completed) {
          cancelled = true;
          break;
        }
        waited = step;
        if (progressToken !== undefined) {
          try {
            await extra.sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: waited,
                total: seconds,
                message: `Đã chờ ${waited}/${seconds} giây`,
              },
            });
            ctx.logger.write({
              kind: "tool_progress",
              tool: "slow",
              progress: waited,
              total: seconds,
              progressToken,
              requestId: extra.requestId,
              sessionId: extra.sessionId ?? ctx.sessionId ?? null,
            });
          } catch (error) {
            ctx.logger.write({
              kind: "tool_progress_error",
              tool: "slow",
              error: String(error),
              requestId: extra.requestId,
              sessionId: extra.sessionId ?? ctx.sessionId ?? null,
            });
          }
        }
      }
      extra.signal.removeEventListener("abort", onAbort);

      ctx.logger.write({
        kind: "slow_end",
        seconds,
        waitedSeconds: waited,
        cancelled,
        elapsedMs: Date.now() - startedAt,
        requestId: extra.requestId,
        sessionId: extra.sessionId ?? ctx.sessionId ?? null,
      });

      const result = textResult(
        cancelled
          ? `Đã dừng sau ${waited} giây vì client gửi notifications/cancelled.`
          : `Đã chờ xong ${seconds} giây. Không có thay đổi nào được ghi.`,
      );
      logToolResult(ctx, "slow", extra, startedAt, result);
      return result;
    },
  );

  server.registerTool(
    "structured",
    {
      title: "Trả về structuredContent kèm text",
      description:
        "Trả về cả text và structuredContent có outputSchema, để xem host hiển thị dữ liệu có cấu trúc như thế nào. Dữ liệu giả lập.",
      outputSchema: {
        employee: z.object({
          id: z.string(),
          name: z.string(),
          role: z.string(),
          department: z.string(),
          email: z.string(),
          phone: z.string(),
        }),
        task: z.object({
          id: z.string(),
          title: z.string(),
          status: z.enum(["todo", "doing", "done"]),
          assignee: z.string(),
          department: z.string(),
          due: z.string(),
        }),
        generatedAt: z.string(),
        simulated: z.boolean(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (extra: Extra) => {
      const startedAt = Date.now();
      logToolCall(ctx, "structured", {}, extra);
      const data = {
        employee: EMPLOYEES.Minh,
        task: TASK,
        generatedAt: new Date().toISOString(),
        simulated: true,
      };
      const result: CallToolResult = {
        content: [
          {
            type: "text",
            text: `Nhân viên giả lập: ${data.employee.name}, phòng ${data.employee.department}. Task ${data.task.id}: ${data.task.title}.`,
          },
        ],
        structuredContent: data,
      };
      logToolResult(ctx, "structured", extra, startedAt, result);
      return result;
    },
  );

  server.registerTool(
    "big_list",
    {
      title: "Trả về một danh sách task giả lập dài",
      description:
        "Trả về danh sách task giả lập dạng JSON, mặc định 100 task (khoảng 15.000 ký tự), để xem host có cắt, rút gọn hay giữ lại kết quả lớn không. Dữ liệu giả lập.",
      inputSchema: {
        count: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .default(BIG_LIST_DEFAULT_COUNT)
          .describe("Số task giả lập cần trả về, từ 1 đến 1000."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, extra: Extra) => {
      const startedAt = Date.now();
      logToolCall(ctx, "big_list", args, extra);
      const text = JSON.stringify({ simulated: true, count: args.count, tasks: simulatedTasks(args.count) });
      ctx.logger.write({ kind: "big_list", count: args.count, characters: text.length });
      const result = textResult(text);
      logToolResult(ctx, "big_list", extra, startedAt, result);
      return result;
    },
  );

  return server;
}
