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
import { ProbeLogger, redactHeaders, redactRawHeaders } from "./log.js";
import { createProbeServer, PROBE_VERSION, SERVER_NAME, TOOL_NAMES } from "./server.js";
import { hookTransport } from "./transport-log.js";

const MCP_PATHS = new Set(["/", "/mcp"]);
const MAX_BODY_BYTES = 4 * 1024 * 1024;

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

export interface HttpProbeHandle {
  port: number;
  publicBaseUrl: string;
  close: () => Promise<void>;
}

interface SessionRecord {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  ctx: ProbeContext;
}

type HeaderMap = Record<string, string | string[] | number | undefined>;

function headerValue(headers: IncomingMessage["headers"], name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function applyCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version");
  res.setHeader("Access-Control-Max-Age", "600");
  // The SDK transport writes its own headers; make sure CORS survives that write.
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = ((statusCode: number, ...args: unknown[]) => {
    if (!res.getHeader("Access-Control-Allow-Origin")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    return (originalWriteHead as (...inner: unknown[]) => ServerResponse)(statusCode, ...args);
  }) as typeof res.writeHead;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(body)}\n`);
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error(`body too large, limit ${MAX_BODY_BYTES} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

type AuthResult = {
  ok: boolean;
  reason: "no_auth_header" | "token_not_configured" | "bearer_ok" | "raw_token_ok" | "missing" | "mismatch";
  scheme: string | null;
};

function checkAuth(req: IncomingMessage, bearer: string | undefined): AuthResult {
  const raw = headerValue(req.headers, "authorization");
  if (!bearer) {
    return {
      ok: true,
      reason: raw ? "token_not_configured" : "no_auth_header",
      scheme: raw ? raw.split(/\s+/, 1)[0] ?? null : null,
    };
  }
  if (!raw) return { ok: false, reason: "missing", scheme: null };
  const scheme = raw.split(/\s+/, 1)[0] ?? null;
  if (raw === `Bearer ${bearer}`) return { ok: true, reason: "bearer_ok", scheme };
  if (raw === bearer) return { ok: true, reason: "raw_token_ok", scheme };
  return { ok: false, reason: "mismatch", scheme };
}

const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: light-dark(#f4f5f7, #101214); color: light-dark(#1b1d22, #e8eaed);
  }
  main { width: 100%; max-width: 680px; background: light-dark(#ffffff, #191c20);
    border: 1px solid light-dark(#e3e5e8, #2a2f36); border-radius: 14px; padding: 28px 28px 24px;
    box-shadow: 0 10px 30px light-dark(rgba(20, 24, 31, 0.08), rgba(0, 0, 0, 0.35)); }
  h1 { margin: 0 0 6px; font-size: 22px; line-height: 1.3; }
  p { margin: 10px 0; line-height: 1.55; }
  .sub { margin: 0 0 20px; color: light-dark(#5c636d, #a3abb5); font-size: 14px; }
  .badge { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px;
    padding: 6px 12px; font-size: 13px; font-weight: 600;
    background: light-dark(#e7f6ec, #123324); color: light-dark(#11673a, #74d9a0); }
  .dot { width: 18px; height: 18px; border-radius: 50%; background: light-dark(#17a05b, #4fd48a);
    display: inline-grid; place-items: center; color: white; font-size: 12px; }
  .mono { font-family: ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace; }
  .box { margin: 18px 0; padding: 14px 16px; border-radius: 10px;
    background: light-dark(#f6f7f9, #11151a); border: 1px solid light-dark(#e3e5e8, #262c34); }
  .warn { border-left: 4px solid light-dark(#e0a100, #f0c44c); padding-left: 14px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 18px; margin: 14px 0 0; font-size: 14px; }
  dt { color: light-dark(#5c636d, #a3abb5); }
  dd { margin: 0; overflow-wrap: anywhere; }
  a { color: light-dark(#0b64c9, #73b4ff); }
  code { font-size: 12.5px; overflow-wrap: anywhere; }
  .actions { margin-top: 22px; display: flex; flex-wrap: wrap; gap: 10px; }
  .actions a { text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 8px;
    padding: 9px 14px; border: 1px solid light-dark(#d7dbe0, #333b45);
    background: light-dark(#fafbfc, #1e232a); color: light-dark(#1b1d22, #e8eaed); }
  .actions a.primary { background: light-dark(#11673a, #2f9e63); border-color: transparent; color: #fff; }
  footer { margin-top: 22px; font-size: 12.5px; color: light-dark(#6b737e, #98a1ac); }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>
`;
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
    const method = req.method ?? "GET";
    let path = "/";
    let query = "";
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      path = url.pathname;
      query = url.search;
    } catch {
      path = req.url ?? "/";
    }
    const remoteAddress = req.socket.remoteAddress;
    const requestHeaders = req.headers as HeaderMap;

    logger.write({
      kind: "http_request",
      transport: "http",
      method,
      path,
      query,
      url: req.url ?? null,
      httpVersion: req.httpVersion,
      tls: Boolean((req.socket as Socket & { encrypted?: boolean }).encrypted),
      headers: redactHeaders(requestHeaders),
      rawHeaders: redactRawHeaders(req.rawHeaders),
      remoteAddress,
      remotePort: req.socket.remotePort ?? null,
      contentLength: req.headers["content-length"] ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      sessionIdHeader: headerValue(req.headers, "mcp-session-id") ?? null,
    });

    res.on("finish", () => {
      logger.write({
        kind: "http_response",
        method,
        path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        remoteAddress,
      });
    });
    res.on("close", () => {
      if (res.writableFinished) return;
      logger.write({
        kind: "http_client_disconnect",
        method,
        path,
        durationMs: Date.now() - startedAt,
        remoteAddress,
        sessionId: headerValue(req.headers, "mcp-session-id") ?? null,
        note: "Client đóng kết nối trước khi response hoàn tất.",
      });
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
