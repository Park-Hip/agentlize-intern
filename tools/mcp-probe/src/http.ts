import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { Socket } from "node:net";
import { basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { ProbeContext } from "./context.js";
import {
  applyCors,
  beginHttpExchange,
  checkAuth,
  escapeHtml,
  headerValue,
  page,
  readBody,
  sendHtml,
  sendJson,
  type HttpHandle,
} from "./http-common.js";
import { ProbeLogger, redactHeaders } from "./log.js";
import { PROBE_VERSION, SERVER_NAME } from "./meta.js";
import { createProbeServer, TOOL_NAMES } from "./server.js";
import { hookTransport } from "./transport-log.js";

const MCP_PATHS = new Set(["/", "/mcp"]);

export interface HttpProbeOptions {
  host: string;
  port: number;
  bearer?: string;
  publicUrl?: string;
  tlsCert?: string;
  tlsKey?: string;
  logger: ProbeLogger;
  startedAt: number;
}

export type HttpProbeHandle = HttpHandle;

interface SessionRecord {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  ctx: ProbeContext;
}

function approvePage(id: string, req: IncomingMessage, loggedAt: string): string {
  const displayed = {
    "User-Agent": req.headers["user-agent"] ?? "(không có)",
    Referer: req.headers.referer ?? "(không có)",
    Origin: req.headers.origin ?? "(không có)",
    Accept: req.headers.accept ?? "(không có)",
    "X-Forwarded-For": req.headers["x-forwarded-for"] ?? "(không có)",
    "Sec-Fetch-Site": req.headers["sec-fetch-site"] ?? "(không có)",
  };
  const rows = Object.entries(displayed)
    .map(([name, value]) => `<dt>${escapeHtml(name)}</dt><dd class="mono">${escapeHtml(value)}</dd>`)
    .join("");
  return page(
    "Đã ghi nhận lượt bấm duyệt",
    `<span class="badge"><span class="dot">✓</span>Đã ghi vào log</span>
     <h1>Đã ghi nhận lượt bấm duyệt</h1>
     <p class="sub">Mã lượt duyệt: <span class="mono">${escapeHtml(id)}</span> - lúc ${escapeHtml(loggedAt)} (UTC)</p>
     <div class="box warn">
       <p><strong>Đây là trang giả lập của MCP probe.</strong></p>
       <p>Không có task nào bị chuyển, không có dữ liệu nào bị thay đổi.
       Chỉ có một dòng log được ghi thêm để chứng minh link này mở được từ giao diện chat.</p>
     </div>
     <p>Header mà trình duyệt gửi kèm:</p>
     <dl>${rows}</dl>
     <div class="actions">
       <a class="primary" href="/">Về trang chủ của probe</a>
       <a href="/health">Xem trạng thái server</a>
     </div>
     <footer>Quay lại cửa sổ chat và nói đã bấm xong để agent ghi lại kết quả P3.
     Toàn bộ header, kể cả Authorization đã che, nằm trong file log của server.</footer>`,
  );
}

function indexPage(opts: HttpProbeOptions, sessionCount: number, publicBaseUrl: string): string {
  const tools = TOOL_NAMES.map((name) => `<li class="mono">${escapeHtml(name)}</li>`).join("");
  return page(
    "MCP probe đang chạy",
    `<span class="badge"><span class="dot">✓</span>Server đang chạy</span>
     <h1>MCP probe cho Thổ Thần</h1>
     <p class="sub">Bản thử để đo cách host gửi yêu cầu, không phải hệ thống thật. Mọi dữ liệu là giả lập.</p>
     <dl>
       <dt>Endpoint MCP</dt><dd class="mono">${escapeHtml(publicBaseUrl)}/mcp</dd>
       <dt>Transport</dt><dd>Streamable HTTP (stateful)</dd>
       <dt>Phiên đang mở</dt><dd>${sessionCount}</dd>
       <dt>Bearer</dt><dd>${opts.bearer ? "bắt buộc" : "không bắt buộc, mọi Authorization đều được nhận và ghi log"}</dd>
       <dt>File log</dt><dd class="mono">${escapeHtml(basename(opts.logger.file))}</dd>
     </dl>
     <div class="box">
       <p><strong>Tool đang bật</strong></p>
       <ul>${tools}</ul>
     </div>
     <div class="actions">
       <a class="primary" href="/approve/demo">Mở thử trang duyệt</a>
       <a href="/health">/health</a>
     </div>
     <footer>Chạy <code>npm run selftest</code> để kiểm tra server mà không cần host.
     Xem <code>README.md</code> để biết cách cắm vào Thổ Thần desktop.</footer>`,
  );
}

/**
 * Start the Streamable HTTP host.
 * Routes:
 *   POST/GET/DELETE /mcp (and / for POST) -> MCP
 *   GET /health                           -> JSON status, no auth
 *   GET /approve/<id>                     -> simulated approval page, no auth
 *   GET /                                 -> human index page
 */
export async function startHttpProbe(options: HttpProbeOptions): Promise<HttpProbeHandle> {
  const { logger } = options;
  const protocol = options.tlsCert ? "https" : "http";
  const loopbackHosts = new Set(["0.0.0.0", "::", "127.0.0.1", "::1"]);
  const displayHost = loopbackHosts.has(options.host) ? "localhost" : options.host;
  const publicBaseUrl = (options.publicUrl ?? `${protocol}://${displayHost}:${options.port}`).replace(/\/+$/, "");
  const sessions = new Map<string, SessionRecord>();
  const sockets = new Set<Socket>();

  const baseContext = (lastHttp?: ProbeContext["lastHttp"]): ProbeContext => ({
    transport: "http",
    logger,
    publicBaseUrl,
    bearerRequired: Boolean(options.bearer),
    startedAt: options.startedAt,
    lastHttp,
  });

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const startedAt = Date.now();
    applyCors(res);
    const { method, path, remoteAddress, requestHeaders } = beginHttpExchange(req, res, logger, startedAt);

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
        transport: "http",
        endpoint: "/mcp",
        publicBaseUrl,
        uptimeSeconds: Math.round((Date.now() - options.startedAt) / 1000),
        bearerRequired: Boolean(options.bearer),
        activeSessions: sessions.size,
        tools: TOOL_NAMES,
        logFile: basename(logger.file),
      });
      return;
    }

    if (path === "/" && method === "GET") {
      sendHtml(res, 200, indexPage(options, sessions.size, publicBaseUrl));
      return;
    }

    const approveMatch = path.match(/^\/approve\/([A-Za-z0-9_-]{1,64})$/);
    if (approveMatch && method === "GET") {
      const id = approveMatch[1] ?? "";
      const loggedAt = new Date().toISOString();
      logger.write({
        kind: "approve_visit",
        id,
        loggedAt,
        transport: "http",
        headers: redactHeaders(requestHeaders),
        remoteAddress,
        userAgent: req.headers["user-agent"] ?? null,
        referer: req.headers.referer ?? null,
      });
      sendHtml(res, 200, approvePage(id, req, loggedAt));
      return;
    }

    if (path.startsWith("/.well-known/")) {
      logger.write({
        kind: "well_known_probe",
        path,
        method,
        transport: "http",
        note: "Host đang dò metadata OAuth/OIDC. Probe không chạy OAuth server.",
        headers: redactHeaders(requestHeaders),
      });
      sendJson(res, 404, {
        error: "not_found",
        message: "MCP probe không cung cấp metadata OAuth. Chỉ hỗ trợ không xác thực hoặc bearer.",
      });
      return;
    }

    if (!MCP_PATHS.has(path)) {
      sendJson(res, 404, {
        error: "not_found",
        message: "Đường dẫn hợp lệ: /mcp, /health, /approve/<id>, /.",
      });
      return;
    }
    const auth = checkAuth(req, options.bearer);
    logger.write({
      kind: "http_auth",
      transport: "http",
      method,
      path,
      ok: auth.ok,
      reason: auth.reason,
      scheme: auth.scheme,
      authorization: req.headers.authorization ? redactHeaders({ authorization: req.headers.authorization }).authorization : null,
      remoteAddress,
    });
    if (!auth.ok) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="mcp-probe"');
      sendJson(res, 401, {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: `Unauthorized: ${auth.reason}. Cấu hình header Authorization: Bearer <token>.`,
        },
        id: null,
      });
      return;
    }

    const sessionIdHeader = headerValue(req.headers, "mcp-session-id");
    if (sessionIdHeader) {
      const record = sessions.get(sessionIdHeader);
      if (!record) {
        logger.write({
          kind: "session_unknown",
          sessionId: sessionIdHeader,
          method,
          path,
          note: "Host gửi mcp-session-id không tồn tại, có thể server đã khởi động lại.",
        });
        sendJson(res, 404, {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found. Initialize again." },
          id: null,
        });
        return;
      }
      record.ctx.lastHttp = {
        method,
        path,
        remoteAddress,
        headers: requestHeaders,
      };
      try {
        await record.transport.handleRequest(req, res);
      } catch (error) {
        logger.write({ kind: "http_error", path, method, error: String(error) });
        if (!res.headersSent) sendJson(res, 500, { error: "internal_error", message: String(error) });
      }
      return;
    }

    if (method !== "POST") {
      sendJson(res, 400, {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: missing Mcp-Session-Id. POST an initialize request first.",
        },
        id: null,
      });
      return;
    }

    let body: unknown;
    try {
      const raw = await readBody(req);
      body = raw.trim() ? JSON.parse(raw) : undefined;
    } catch (error) {
      logger.write({ kind: "http_body_error", path, method, error: String(error) });
      sendJson(res, 400, {
        jsonrpc: "2.0",
        error: { code: -32700, message: `Parse error: ${String(error)}` },
        id: null,
      });
      return;
    }

    if (!isInitializeRequest(body)) {
      logger.write({
        kind: "session_missing",
        method,
        path,
        bodyPreview: JSON.stringify(body).slice(0, 500),
        note: "POST không phải initialize và không có mcp-session-id. Host có thể không giữ session id.",
      });
      sendJson(res, 400, {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: missing Mcp-Session-Id and body is not an initialize request.",
        },
        id: null,
      });
      return;
    }

    const sessionCtx = baseContext({
      method,
      path,
      remoteAddress,
      headers: requestHeaders,
    });
    sessionCtx.initializeParams = (body as { params?: unknown }).params ?? null;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessionCtx.sessionId = sessionId;
        sessions.set(sessionId, { server, transport, ctx: sessionCtx });
        logger.write({
          kind: "session_open",
          transport: "http",
          sessionId,
          clientInfo: (sessionCtx.initializeParams as { clientInfo?: unknown } | undefined)?.clientInfo ?? null,
          protocolVersion:
            (sessionCtx.initializeParams as { protocolVersion?: unknown } | undefined)?.protocolVersion ?? null,
          activeSessions: sessions.size,
        });
      },
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
        logger.write({ kind: "session_close", transport: "http", sessionId, activeSessions: sessions.size });
      },
    });
    const server = createProbeServer(sessionCtx);
    await server.connect(transport);
    hookTransport(transport, sessionCtx);
    const originalOnClose = transport.onclose;
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) sessions.delete(sessionId);
      logger.write({
        kind: "transport_close",
        transport: "http",
        sessionId: sessionId ?? null,
        activeSessions: sessions.size,
      });
      originalOnClose?.();
    };

    try {
      await transport.handleRequest(req, res, body);
    } catch (error) {
      logger.write({ kind: "http_error", path, method, error: String(error) });
      if (!res.headersSent) sendJson(res, 500, { error: "internal_error", message: String(error) });
    }
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
    logger.write({ kind: "http_client_error", error: String(error) });
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
  logger.write({
    kind: "http_listening",
    transport: "http",
    protocol,
    host: options.host,
    port: actualPort,
    endpoint: `${publicBaseUrl}/mcp`,
    publicBaseUrl,
    bearerRequired: Boolean(options.bearer),
  });
  process.stderr.write(`[mcp-probe] listening on ${publicBaseUrl}/mcp\n`);
  process.stderr.write(`[mcp-probe] health: ${publicBaseUrl}/health\n`);

  return {
    port: actualPort,
    publicBaseUrl,
    close: async () => {
      logger.write({ kind: "http_closing", activeSessions: sessions.size });
      for (const [, record] of sessions) {
        try {
          await record.server.close();
        } catch (error) {
          logger.write({ kind: "http_close_error", scope: "server", error: String(error) });
        }
        try {
          await record.transport.close();
        } catch (error) {
          logger.write({ kind: "http_close_error", scope: "transport", error: String(error) });
        }
      }
      sessions.clear();
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
        setTimeout(resolve, 1500).unref();
      });
    },
  };
}
