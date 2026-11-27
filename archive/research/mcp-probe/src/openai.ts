import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { Socket } from "node:net";
import { basename } from "node:path";
import {
  applyCors,
  beginHttpExchange,
  checkAuth,
  escapeHtml,
  page,
  readBody,
  sendHtml,
  sendJson,
  type HttpHandle,
} from "./http-common.js";
import { identityHeaders, redactHeaders } from "./log.js";
import type { ProbeLogger } from "./log.js";
import { PROBE_VERSION, SERVER_NAME } from "./meta.js";

/** The single model the provider advertises. The host may ask for any id; we echo it back. */
export const PROVIDER_MODEL_ID = "mcp-probe-fixed";

/** One fixed answer for every prompt: the probe is measuring identity, not model quality. */
export const PROVIDER_FIXED_REPLY =
  "Đây là câu trả lời cố định của mcp-probe, không có mô hình nào được gọi. " +
  "Mở file log của probe để xem lời gọi này mang trường user và header danh tính nào.";

/** Split the fixed answer into small SSE deltas so the host can render it as a stream. */
const STREAM_CHUNK_CHARS = 24;
const STREAM_CHUNK_DELAY_MS = 15;
/** A host may paste a long conversation; keep the log line bounded and flag the cut. */
const MAX_BODY_LOG_CHARS = 4000;

const MODEL_OBJECT_CREATED = Math.floor(Date.now() / 1000);

export interface OpenAiProviderOptions {
  host: string;
  port: number;
  bearer?: string;
  publicUrl?: string;
  tlsCert?: string;
  tlsKey?: string;
  logger: ProbeLogger;
  startedAt: number;
}

interface ChatBody {
  model?: unknown;
  messages?: unknown;
  stream?: unknown;
  stream_options?: unknown;
  user?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
}

function openAiError(
  res: ServerResponse,
  status: number,
  message: string,
  code: string | null = null,
  type = "invalid_request_error",
): void {
  sendJson(res, status, {
    error: {
      message,
      type,
      param: null,
      code,
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function splitForStream(text: string): string[] {
  const chars = Array.from(text);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += STREAM_CHUNK_CHARS) {
    chunks.push(chars.slice(index, index + STREAM_CHUNK_CHARS).join(""));
  }
  return chunks;
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
      return "";
    })
    .join("");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Usage is zero because no model ran; we still send the field for client compatibility. */
const ZERO_USAGE = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

function indexPage(options: OpenAiProviderOptions, publicBaseUrl: string): string {
  return page(
    "MCP probe - nhà cung cấp mô hình kiểu OpenAI",
    `<span class="badge"><span class="dot">✓</span>Provider đang chạy</span>
     <h1>MCP probe: giả làm nhà cung cấp mô hình</h1>
     <p class="sub">Bản thử để đo xem Thổ Thần có gửi danh tính người dùng kèm lời gọi mô hình hay không. Không có mô hình thật.</p>
     <dl>
       <dt>Base URL</dt><dd class="mono">${escapeHtml(publicBaseUrl)}/v1</dd>
       <dt>Model</dt><dd class="mono">${escapeHtml(PROVIDER_MODEL_ID)}</dd>
       <dt>Chat</dt><dd class="mono">POST /v1/chat/completions</dd>
       <dt>Danh sách model</dt><dd class="mono">GET /v1/models</dd>
       <dt>Bearer</dt><dd>${options.bearer ? "bắt buộc" : "không bắt buộc, mọi Authorization đều được nhận và ghi log"}</dd>
       <dt>File log</dt><dd class="mono">${escapeHtml(basename(options.logger.file))}</dd>
     </dl>
     <div class="box warn">
       <p><strong>Câu trả lời là cố định.</strong> Probe không gọi mô hình nào và không tính chi phí.</p>
       <p>Mỗi lời gọi ghi một dòng <code>openai_request</code> với trường <code>user</code>, các header danh tính và phần đầu của body.</p>
     </div>
     <div class="actions">
       <a class="primary" href="/health">/health</a>
     </div>
     <footer>Chạy <code>npm run selftest</code> để kiểm tra mode này mà không cần host.</footer>`,
  );
}

/**
 * A small OpenAI-compatible provider used as a measurement point:
 * - GET /v1/models and GET /v1/models/<id>
 * - POST /v1/chat/completions, both one-shot and SSE streaming
 * It never calls a real model and always returns the same answer.
 */
export async function startOpenAiProvider(options: OpenAiProviderOptions): Promise<HttpHandle> {
  const { logger } = options;
  const protocol = options.tlsCert ? "https" : "http";
  const loopbackHosts = new Set(["0.0.0.0", "::", "127.0.0.1", "::1"]);
  const displayHost = loopbackHosts.has(options.host) ? "localhost" : options.host;
  const localBaseUrl = `${protocol}://${displayHost}:${options.port}`;
  let publicBaseUrl = (options.publicUrl ?? localBaseUrl).replace(/\/+$/, "");
  const sockets = new Set<Socket>();

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const startedAt = Date.now();
    applyCors(res);
    const { method, path, remoteAddress, requestHeaders } = beginHttpExchange(req, res, logger, startedAt, {
      mode: "openai-provider",
    });

    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (path === "/health" && method === "GET") {
      sendJson(res, 200, {
        ok: true,
        server: SERVER_NAME,
        version: PROBE_VERSION,
        mode: "openai-provider",
        model: PROVIDER_MODEL_ID,
        endpoints: ["GET /v1/models", "POST /v1/chat/completions", "GET /health"],
        publicBaseUrl,
        uptimeSeconds: Math.round((Date.now() - options.startedAt) / 1000),
        bearerRequired: Boolean(options.bearer),
        logFile: basename(logger.file),
      });
      return;
    }

    if (path === "/" && method === "GET") {
      sendHtml(res, 200, indexPage(options, publicBaseUrl));
      return;
    }

    const isModelsPath = path === "/v1/models" || path.startsWith("/v1/models/");
    const isChatPath = path === "/v1/chat/completions";
    if (!isModelsPath && !isChatPath) {
      openAiError(res, 404, `Không có endpoint ${method} ${path}. Chỉ có /v1/models và /v1/chat/completions.`, "not_found");
      return;
    }

    const auth = checkAuth(req, options.bearer);
    logger.write({
      kind: "http_auth",
      transport: "http",
      mode: "openai-provider",
      method,
      path,
      ok: auth.ok,
      reason: auth.reason,
      scheme: auth.scheme,
      authorization: req.headers.authorization
        ? redactHeaders({ authorization: req.headers.authorization }).authorization
        : null,
      remoteAddress,
    });
    if (!auth.ok) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="mcp-probe"');
      openAiError(res, 401, `Unauthorized: ${auth.reason}. Gửi header Authorization: Bearer <token>.`, "invalid_api_key");
      return;
    }

    if (isModelsPath) {
      if (method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        openAiError(res, 405, "GET only.", "method_not_allowed");
        return;
      }
      const requestedId = path.startsWith("/v1/models/") ? safeDecode(path.slice("/v1/models/".length)) : "";
      if (requestedId && requestedId !== PROVIDER_MODEL_ID) {
        openAiError(res, 404, `Không có model "${requestedId}".`, "model_not_found");
        return;
      }
      const model = {
        id: PROVIDER_MODEL_ID,
        object: "model",
        created: MODEL_OBJECT_CREATED,
        owned_by: "mcp-probe",
      };
      if (requestedId) {
        sendJson(res, 200, model);
      } else {
        sendJson(res, 200, { object: "list", data: [model] });
      }
      return;
    }

    if (method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      openAiError(res, 405, "POST only.", "method_not_allowed");
      return;
    }

    let raw: string;
    let parsed: unknown;
    try {
      raw = await readBody(req);
      parsed = raw.trim() ? JSON.parse(raw) : {};
    } catch (error) {
      logger.write({ kind: "openai_body_error", path, method, error: String(error) });
      openAiError(res, 400, `Body không đọc được: ${String(error)}`, "invalid_body");
      return;
    }
    const body = asRecord(parsed);
    if (!body) {
      openAiError(res, 400, "Body phải là một JSON object.", "invalid_body");
      return;
    }
    const chat = body as ChatBody;
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const stream = chat.stream === true;
    const streamOptions = asRecord(chat.stream_options);
    const includeUsage = streamOptions?.include_usage === true;
    const requestedModel = typeof chat.model === "string" && chat.model.trim() ? chat.model : PROVIDER_MODEL_ID;
    const userPresent = Object.hasOwn(chat, "user");
    const messageChars = messages.reduce((total, message) => total + messageText(message).length, 0);

    logger.write({
      kind: "openai_request",
      transport: "http",
      mode: "openai-provider",
      endpoint: path,
      method,
      remoteAddress,
      model: requestedModel,
      stream,
      includeUsage,
      user: userPresent ? chat.user : null,
      userPresent,
      userType: userPresent ? typeof chat.user : "missing",
      metadata: chat.metadata ?? null,
      identityHeaders: identityHeaders(redactHeaders(requestHeaders)),
      messageCount: Array.isArray(chat.messages) ? messages.length : null,
      messageRoles: messages.slice(0, 20).map((message) => {
        const record = asRecord(message);
        return typeof record?.role === "string" ? record.role : "?";
      }),
      messageChars,
      bodyBytes: Buffer.byteLength(raw, "utf8"),
      bodyPreview: raw.length > MAX_BODY_LOG_CHARS ? raw.slice(0, MAX_BODY_LOG_CHARS) : raw,
      bodyTruncated: raw.length > MAX_BODY_LOG_CHARS,
    });

    const id = `chatcmpl-probe-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    if (!stream) {
      sendJson(res, 200, {
        id,
        object: "chat.completion",
        created,
        model: requestedModel,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: PROVIDER_FIXED_REPLY, refusal: null },
            logprobs: null,
            finish_reason: "stop",
          },
        ],
        usage: ZERO_USAGE,
        system_fingerprint: "mcp-probe",
      });
      logger.write({
        kind: "openai_response",
        mode: "openai-provider",
        endpoint: path,
        stream: false,
        model: requestedModel,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        chunks: 0,
        replyChars: PROVIDER_FIXED_REPLY.length,
        completed: true,
      });
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (payload: unknown): void => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    const chunk = (delta: Record<string, unknown>, finishReason: string | null = null, choicesLength = 1) => ({
      id,
      object: "chat.completion.chunk",
      created,
      model: requestedModel,
      system_fingerprint: "mcp-probe",
      choices:
        choicesLength === 0
          ? []
          : [
              {
                index: 0,
                delta,
                logprobs: null,
                finish_reason: finishReason,
              },
            ],
    });

    let chunksWritten = 1;
    let streamFinished = false;
    sendEvent(chunk({ role: "assistant", content: "" }));
    for (const piece of splitForStream(PROVIDER_FIXED_REPLY)) {
      if (res.writableEnded || res.destroyed) break;
      await sleep(STREAM_CHUNK_DELAY_MS);
      sendEvent(chunk({ content: piece }));
      chunksWritten += 1;
    }
    if (!res.writableEnded && !res.destroyed) {
      sendEvent(chunk({}, "stop"));
      chunksWritten += 1;
      if (includeUsage) {
        sendEvent({ ...chunk({}, null, 0), usage: ZERO_USAGE });
        chunksWritten += 1;
      }
      res.write("data: [DONE]\n\n");
      res.end();
      streamFinished = true;
    }

    logger.write({
      kind: "openai_response",
      mode: "openai-provider",
      endpoint: path,
      stream: true,
      model: requestedModel,
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      chunks: chunksWritten,
      replyChars: PROVIDER_FIXED_REPLY.length,
      completed: streamFinished,
      includeUsage,
    });
  };

  const httpServer: HttpServer = options.tlsCert && options.tlsKey
    ? (createHttpsServer(
        { cert: readFileSync(options.tlsCert), key: readFileSync(options.tlsKey) },
        (req, res) => void handler(req, res),
      ) as unknown as HttpServer)
    : createHttpServer((req, res) => void handler(req, res));

  httpServer.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  httpServer.on("clientError", (error, socket) => {
    logger.write({ kind: "http_client_error", mode: "openai-provider", error: String(error) });
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, options.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address();
  const actualPort = address && typeof address === "object" ? address.port : options.port;
  if (!options.publicUrl) publicBaseUrl = `${protocol}://${displayHost}:${actualPort}`;
  logger.write({
    kind: "http_listening",
    transport: "http",
    mode: "openai-provider",
    protocol,
    host: options.host,
    port: actualPort,
    endpoint: `${publicBaseUrl}/v1/chat/completions`,
    model: PROVIDER_MODEL_ID,
    publicBaseUrl,
    bearerRequired: Boolean(options.bearer),
  });
  process.stderr.write(`[mcp-probe] provider on ${publicBaseUrl}/v1\n`);
  process.stderr.write(`[mcp-probe] health: ${publicBaseUrl}/health\n`);

  return {
    port: actualPort,
    publicBaseUrl,
    close: async () => {
      logger.write({ kind: "http_closing", mode: "openai-provider" });
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
        setTimeout(resolve, 1500).unref();
      });
    },
  };
}
