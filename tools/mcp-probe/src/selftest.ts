/**
 * Self-test for the MCP probe.
 *
 * Starts the server in both transports, connects with the official SDK client,
 * calls every tool, and asserts that the expected lines exist in the JSONL log.
 * Everything is simulated: no real account, no real data, no network beyond localhost.
 *
 * Run with: npm run selftest
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { findRepoRoot } from "./log.js";

type LogEntry = Record<string, any>;

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(HERE, "index.js");
const REPO_ROOT = findRepoRoot(HERE);
const STAMP = new Date().toISOString().replace(/[-:.]/g, "");
const LOG_ROOT = resolve(REPO_ROOT, "scratch", "mcp-probe", `selftest-${STAMP}`);
/** Simulated per-user key; the probe must only ever show it redacted. */
const LAB_KEY = "hoa-thu-nghiem-0001";
const EXPECTED_TOOLS = ["whoami", "echo_link", "fake_write", "ask_confirm", "flaky", "slow", "structured", "big_list"];

let checks = 0;
const spawned: ChildProcess[] = [];
const clients: Client[] = [];

function check(label: string, condition: unknown, detail?: string): void {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  checks += 1;
  console.log(`PASS ${label}`);
}

function logFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.startsWith("log-") && name.endsWith(".jsonl"))
    .sort()
    .map((name) => join(dir, name));
}

function rawLog(dir: string): string {
  const files = logFiles(dir);
  assert.ok(files.length > 0, `no log file in ${dir}`);
  return files.map((file) => readFileSync(file, "utf8")).join("");
}

function entries(dir: string): LogEntry[] {
  return rawLog(dir)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogEntry);
}

function resultText(result: any): string {
  const content = result?.content ?? [];
  return content.map((item: any) => item?.text ?? "").join("\n");
}

function callsOf(list: LogEntry[], tool: string): LogEntry[] {
  return list.filter((entry) => entry.kind === "tool_call" && entry.tool === tool);
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function freePort(): Promise<number> {
  return await new Promise<number>((done, fail) => {
    const server = createNetServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => done(port));
    });
  });
}

interface HttpServerHandle {
  baseUrl: string;
  stderr: () => string;
  stop: () => Promise<void>;
}

async function startHttpServer(logDir: string, extraArgs: string[] = []): Promise<HttpServerHandle> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [SERVER_ENTRY, "--http", "--port", String(port), "--log-dir", logDir, "--public-url", baseUrl, ...extraArgs],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  spawned.push(child);
  let stderr = "";
  child.stdout?.on("data", (chunk) => (stderr += String(chunk)));
  child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
  const exited = new Promise<number | null>((done) => child.once("exit", (code) => done(code)));
  let stopped = false;

  const deadline = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`HTTP server exited early:\n${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error(`HTTP server did not become ready:\n${stderr}`);
    await sleep(150);
  }

  return {
    baseUrl,
    stderr: () => stderr,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      child.kill();
      await Promise.race([exited, sleep(3000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    },
  };
}

function httpClient(baseUrl: string, headers?: Record<string, string>) {
  return new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: headers ? { headers } : undefined,
  });
}

async function expectRejects(label: string, promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    check(label, true);
    return;
  }
  check(label, false, "the call was expected to fail but succeeded");
}

async function main(): Promise<void> {
  mkdirSync(LOG_ROOT, { recursive: true });
  console.log("mcp-probe self-test");
  console.log(`server:  ${SERVER_ENTRY}`);
  console.log(`log root: ${LOG_ROOT}\n`);

  // ---------------------------------------------------------------- stdio
  console.log("[1/4] stdio transport, basic client");
  const stdioDir = join(LOG_ROOT, "stdio-basic");
  const stdioTransport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, "--stdio", "--log-dir", stdioDir],
    env: { ...getDefaultEnvironment(), LAB_USER_KEY: LAB_KEY },
    stderr: "pipe",
  });
  let stdioStderr = "";
  stdioTransport.stderr?.on("data", (chunk) => (stdioStderr += String(chunk)));
  const stdioClient = new Client({ name: "mcp-probe-selftest-stdio", version: "0.0.1" }, { capabilities: {} });
  clients.push(stdioClient);
  await Promise.race([
    stdioClient.connect(stdioTransport),
    sleep(15_000).then(() => {
      throw new Error(`stdio client did not connect:\n${stdioStderr}`);
    }),
  ]);
  check("stdio: client initialized", stdioClient.getServerVersion()?.name === "tho-than-mcp-probe");

  const tools = await stdioClient.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  check("stdio: tools/list returns every tool", JSON.stringify(toolNames) === JSON.stringify([...EXPECTED_TOOLS].sort()), toolNames.join(","));
  const fakeWrite = tools.tools.find((tool) => tool.name === "fake_write");
  check("stdio: fake_write is annotated destructive", fakeWrite?.annotations?.destructiveHint === true);
  check("stdio: whoami is annotated read-only", tools.tools.find((tool) => tool.name === "whoami")?.annotations?.readOnlyHint === true);

  const whoami = await stdioClient.callTool({ name: "whoami", arguments: {} });
  const whoamiText = resultText(whoami);
  check("stdio: whoami sees clientInfo sent by the host", whoamiText.includes("mcp-probe-selftest-stdio"));
  check("stdio: whoami reports the stdio transport", whoamiText.includes('"transport": "stdio"'));
  check("stdio: whoami reports LAB_ env vars redacted", whoamiText.includes('"LAB_USER_KEY": "hoa-th...(len=19)"'));
  check("stdio: whoami never shows the full LAB_ value", !whoamiText.includes(LAB_KEY));

  const echo = await stdioClient.callTool({ name: "echo_link", arguments: {} });
  const echoText = resultText(echo);
  const linkMatch = echoText.match(/\]\((http:\/\/localhost:8787\/approve\/[a-f0-9]+)\)/);
  check("stdio: echo_link returns a Markdown link", Boolean(linkMatch), echoText.slice(0, 200));
  check("stdio: echo_link also returns the raw URL", Boolean(linkMatch) && echoText.includes(linkMatch![1]));
  check("stdio: echo_link warns that the page needs --http", echoText.includes("--http"));

  const write = await stdioClient.callTool({ name: "fake_write", arguments: { taskId: "T-12", assignee: "Minh" } });
  const writeText = resultText(write);
  check("stdio: fake_write is a dry run", write.isError !== true && writeText.includes("GIẢ LẬP") && writeText.includes("T-12") && writeText.includes("Minh"));
  const unknownWrite = await stdioClient.callTool({ name: "fake_write", arguments: { taskId: "T-12", assignee: "Lan" } });
  check("stdio: fake_write rejects values outside the simulated directory", resultText(unknownWrite).includes("không có trong danh bạ giả lập"));

  const confirmUnsupported = await stdioClient.callTool({ name: "ask_confirm", arguments: {} });
  check("stdio: ask_confirm reports missing elicitation capability", resultText(confirmUnsupported).includes("không khai báo khả năng elicitation"));

  const flaky1 = await stdioClient.callTool({ name: "flaky", arguments: { key: "selftest-stdio" } });
  const flaky2 = await stdioClient.callTool({ name: "flaky", arguments: { key: "selftest-stdio" } });
  check("stdio: flaky fails the first time with isError", flaky1.isError === true && resultText(flaky1).includes("lần gọi 1"));
  check("stdio: flaky succeeds the second time", flaky2.isError !== true && resultText(flaky2).includes("lần gọi thứ 2"));

  const slow = await stdioClient.callTool({ name: "slow", arguments: { seconds: 2 } });
  check("stdio: slow waits and returns", resultText(slow).includes("Đã chờ xong 2 giây"));

  const structured = await stdioClient.callTool({ name: "structured", arguments: {} });
  const structuredContent = structured.structuredContent as Record<string, any> | undefined;
  check("stdio: structured returns structuredContent", structuredContent?.task?.id === "T-12" && structuredContent?.employee?.name === "Minh");
  check("stdio: structured returns text content too", resultText(structured).includes("Minh"));

  const bigList = await stdioClient.callTool({ name: "big_list", arguments: {} });
  const bigListText = resultText(bigList);
  const bigListData = JSON.parse(bigListText) as { count: number; tasks: Array<{ id: string }> };
  check("stdio: big_list returns 100 tasks by default", bigListData.count === 100 && bigListData.tasks.length === 100 && bigListData.tasks[99]?.id === "T-100");
  check("stdio: big_list is larger than 8,000 characters", bigListText.length > 8000, String(bigListText.length));

  await stdioClient.close();

  const stdioLog = entries(stdioDir);
  check("stdio: every tool call reached the server", EXPECTED_TOOLS.every((name) => callsOf(stdioLog, name).length > 0), EXPECTED_TOOLS.filter((name) => callsOf(stdioLog, name).length === 0).join(","));
  check("stdio: fake_write arguments are logged", callsOf(stdioLog, "fake_write")[0]?.arguments?.assignee === "Minh");
  check("stdio: the unmatched fake_write is logged as matched=false", stdioLog.some((entry) => entry.kind === "fake_write" && entry.matched === false));
  check("stdio: ask_confirm logs the unsupported branch", stdioLog.some((entry) => entry.kind === "ask_confirm_branch" && entry.branch === "unsupported"));
  check("stdio: flaky attempt 1 is logged", stdioLog.some((entry) => entry.kind === "flaky_attempt" && entry.key === "selftest-stdio" && entry.attempt === 1));
  check("stdio: flaky attempt 2 is logged", stdioLog.some((entry) => entry.kind === "flaky_attempt" && entry.key === "selftest-stdio" && entry.attempt === 2));
  check("stdio: slow logs start and end", stdioLog.some((entry) => entry.kind === "slow_start") && stdioLog.some((entry) => entry.kind === "slow_end" && entry.cancelled === false));
  check("stdio: structuredContent is logged", stdioLog.some((entry) => entry.kind === "tool_result" && entry.tool === "structured" && entry.structuredContent?.task?.id === "T-12"));
  check("stdio: initialize params are logged", stdioLog.some((entry) => entry.kind === "session_init" && entry.clientInfo?.name === "mcp-probe-selftest-stdio"));
  check("stdio: no HTTP request lines in a stdio log", !stdioLog.some((entry) => entry.kind === "http_request"));
  const allToolCallsLogged = stdioLog.filter((entry) => entry.kind === "tool_call").every((call) =>
    stdioLog.some(
      (entry) =>
        entry.kind === "jsonrpc" &&
        entry.direction === "in" &&
        entry.message?.method === "tools/call" &&
        entry.message?.id === call.requestId &&
        entry.message?.params?.name === call.tool,
    ),
  );
  check("stdio: every tool_call has its raw JSON-RPC request line", allToolCallsLogged);

  // ------------------------------------------------- stdio with elicitation
  console.log("\n[2/4] stdio transport, elicitation client");
  const elicitDir = join(LOG_ROOT, "stdio-elicit");
  const elicitTransport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, "--stdio", "--log-dir", elicitDir],
    stderr: "pipe",
  });
  const elicitClient = new Client(
    { name: "mcp-probe-selftest-elicit", version: "0.0.1" },
    { capabilities: { elicitation: { form: {} } } },
  );
  elicitClient.setRequestHandler(ElicitRequestSchema, async () => ({
    action: "accept" as const,
    content: { approve: true, note: "selftest accept" },
  }));
  clients.push(elicitClient);
  await elicitClient.connect(elicitTransport);
  const confirmSupported = await elicitClient.callTool({ name: "ask_confirm", arguments: {} });
  const confirmText = resultText(confirmSupported);
  check("stdio: ask_confirm receives an elicitation answer", confirmText.includes("action = accept") && confirmText.includes('"approve":true'));

  const progress: any[] = [];
  await elicitClient.callTool({ name: "slow", arguments: { seconds: 2 } }, undefined, {
    onprogress: (value) => progress.push(value),
  });
  check("stdio: slow sends progress notifications", progress.length >= 2 && progress.at(-1).progress === 2);

  const abortController = new AbortController();
  const cancelled = elicitClient
    .callTool({ name: "slow", arguments: { seconds: 30 } }, undefined, { signal: abortController.signal })
    .then(() => "finished")
    .catch(() => "aborted");
  await sleep(1200);
  abortController.abort();
  check("stdio: client abort stops the slow call locally", (await cancelled) === "aborted");
  await sleep(2500);
  await elicitClient.close();

  const elicitLog = entries(elicitDir);
  check("stdio: ask_confirm logs the elicitation branch", elicitLog.some((entry) => entry.kind === "ask_confirm_branch" && entry.branch === "elicitation_attempt"));
  check("stdio: ask_confirm logs the accept result", elicitLog.some((entry) => entry.kind === "ask_confirm_result" && entry.action === "accept"));
  check("stdio: slow progress is logged", elicitLog.some((entry) => entry.kind === "tool_progress" && entry.progress === 2));
  check("stdio: slow cancellation is logged", elicitLog.some((entry) => entry.kind === "tool_cancelled" && entry.seconds === 30));
  check("stdio: slow logs a cancelled end", elicitLog.some((entry) => entry.kind === "slow_end" && entry.cancelled === true));
  check("stdio: notifications/cancelled is logged as an incoming message", elicitLog.some((entry) => entry.kind === "jsonrpc" && entry.direction === "in" && entry.message?.method === "notifications/cancelled"));

  // ------------------------------------------------------- HTTP, no bearer
  console.log("\n[3/4] HTTP transport, no bearer configured");
  const httpDir = join(LOG_ROOT, "http-open");
  const httpServer = await startHttpServer(httpDir);
  const testToken = "probe-auth-token-1234567890";

  const health = await fetch(`${httpServer.baseUrl}/health`, {
    headers: { Authorization: `Bearer ${testToken}` },
  });
  check("http: /health answers 200", health.status === 200);
  check("http: CORS is permissive", health.headers.get("access-control-allow-origin") === "*");
  const preflight = await fetch(`${httpServer.baseUrl}/mcp`, {
    method: "OPTIONS",
    headers: { Origin: "https://thothan.appota.ai", "Access-Control-Request-Method": "POST" },
  });
  check("http: CORS preflight answers 204", preflight.status === 204);
  check("http: preflight allows Authorization and session headers", (preflight.headers.get("access-control-allow-headers") ?? "").includes("Mcp-Session-Id"));

  const httpBasic = new Client({ name: "mcp-probe-selftest-http", version: "0.0.1" }, { capabilities: {} });
  clients.push(httpBasic);
  await httpBasic.connect(httpClient(httpServer.baseUrl, { Authorization: `Bearer ${testToken}` }));
  check("http: client initialized with an arbitrary bearer accepted", httpBasic.getServerVersion()?.name === "tho-than-mcp-probe");

  const httpTools = await httpBasic.listTools();
  check("http: tools/list matches stdio", httpTools.tools.length === EXPECTED_TOOLS.length);

  const httpWho = await httpBasic.callTool({ name: "whoami", arguments: {} });
  const httpWhoText = resultText(httpWho);
  check("http: whoami sees HTTP headers and the session id", httpWhoText.includes('"method": "POST"') && httpWhoText.includes("mcp-session-id"));
  check("http: whoami reports the http transport", httpWhoText.includes('"transport": "http"'));

  for (const [name, args] of [
    ["echo_link", {}],
    ["fake_write", { taskId: "T-12", assignee: "Nam" }],
    ["ask_confirm", {}],
    ["structured", {}],
    ["big_list", { count: 3 }],
  ] as const) {
    const result = (await httpBasic.callTool({ name, arguments: args })) as any;
    check(`http: ${name} responds`, Array.isArray(result.content) && result.content.length > 0);
  }
  const httpFlaky1 = await httpBasic.callTool({ name: "flaky", arguments: { key: "selftest-http" } });
  const httpFlaky2 = await httpBasic.callTool({ name: "flaky", arguments: { key: "selftest-http" } });
  check("http: flaky retries are visible per key", httpFlaky1.isError === true && httpFlaky2.isError !== true);
  const httpSlow = await httpBasic.callTool({ name: "slow", arguments: { seconds: 2 } });
  check("http: slow responds", resultText(httpSlow).includes("Đã chờ xong 2 giây"));

  const httpEcho = await httpBasic.callTool({ name: "echo_link", arguments: {} });
  const approveUrl = resultText(httpEcho).match(/\((http[^)]+\/approve\/[a-f0-9]+)\)/)?.[1];
  check("http: echo_link uses the configured public URL", Boolean(approveUrl) && approveUrl!.startsWith(httpServer.baseUrl), approveUrl);
  const visit = await fetch(approveUrl!, { headers: { "x-probe-click": "selftest", "user-agent": "mcp-probe-selftest-browser" } });
  const visitHtml = await visit.text();
  check("http: approval page answers 200", visit.status === 200);
  check("http: approval page says it is simulated", visitHtml.includes("Đã ghi nhận lượt bấm duyệt") && visitHtml.includes("giả lập"));
  const approveId = approveUrl!.split("/").pop() ?? "";
  check("http: approval page shows the approval id", approveId.length > 0 && visitHtml.includes(approveId));

  await httpBasic.close();

  // A second session with elicitation support.
  const httpElicit = new Client(
    { name: "mcp-probe-selftest-http-elicit", version: "0.0.1" },
    { capabilities: { elicitation: { form: {} } } },
  );
  httpElicit.setRequestHandler(ElicitRequestSchema, async () => ({
    action: "accept" as const,
    content: { approve: true, note: "http selftest" },
  }));
  clients.push(httpElicit);
  await httpElicit.connect(httpClient(httpServer.baseUrl));
  const httpConfirm = await httpElicit.callTool({ name: "ask_confirm", arguments: {} });
  check("http: ask_confirm supports elicitation in a capable session", resultText(httpConfirm).includes("action = accept"));
  const httpProgress: any[] = [];
  await httpElicit.callTool({ name: "slow", arguments: { seconds: 2 } }, undefined, {
    onprogress: (value) => httpProgress.push(value),
  });
  check("http: slow sends progress in a capable session", httpProgress.length >= 2);
  await httpElicit.close();
  await httpServer.stop();

  const httpLog = entries(httpDir);
  const httpRaw = rawLog(httpDir);
  check("http: every HTTP request is logged with headers", httpLog.some((entry) => entry.kind === "http_request" && entry.path === "/health" && entry.headers?.host));
  check("http: MCP initialize is logged with its session id", httpLog.some((entry) => entry.kind === "session_open" && typeof entry.sessionId === "string"));
  check("http: a session was initialized", httpLog.some((entry) => entry.kind === "session_init" && entry.clientInfo?.name === "mcp-probe-selftest-http"));
  check("http: approve visit is logged with browser headers", httpLog.some((entry) => entry.kind === "approve_visit" && entry.headers?.["x-probe-click"] === "selftest"));
  check("http: Authorization is accepted when no token is configured", httpLog.some((entry) => entry.kind === "http_auth" && entry.ok === true && entry.reason === "token_not_configured"));
  check("http: Authorization is redacted to 6 characters and a length", httpRaw.includes("Bearer...(len=") && !httpRaw.includes(testToken));
  check("http: both sessions are logged", httpLog.filter((entry) => entry.kind === "session_open").length === 2);
  check("http: no bearer token appears in the log", !httpRaw.includes("probe-auth-token"));
  const httpToolCalls = httpLog.filter((entry) => entry.kind === "tool_call");
  const httpToolCallsCovered = httpToolCalls.every((call) =>
    httpLog.some(
      (entry) =>
        entry.kind === "jsonrpc" &&
        entry.direction === "in" &&
        entry.message?.method === "tools/call" &&
        entry.message?.id === call.requestId &&
        entry.message?.params?.name === call.tool &&
        (entry.sessionId ?? null) === (call.sessionId ?? null),
    ),
  );
  check("http: every tool_call has its raw JSON-RPC request line", httpToolCallsCovered);
  check("http: every tool was called over HTTP", EXPECTED_TOOLS.every((name) => callsOf(httpLog, name).length > 0), EXPECTED_TOOLS.filter((name) => callsOf(httpLog, name).length === 0).join(","));
  check("http: a 401 was not returned when no bearer is configured", !httpLog.some((entry) => entry.kind === "http_response" && entry.statusCode === 401));

  const summary = execFileSync(process.execPath, [join(HERE, "summarize.js"), httpDir], { encoding: "utf8" });
  check("summary: summarizer reads the HTTP log", summary.includes("== Tổng quan ==") && summary.includes("whoami") && summary.includes("Ghi giả lập"));

  // --------------------------------------------------------- HTTP, bearer
  console.log("\n[4/4] HTTP transport, bearer configured");
  const authDir = join(LOG_ROOT, "http-bearer");
  const secret = "selftest-secret-token";
  const authServer = await startHttpServer(authDir, ["--bearer", secret]);

  const unauth = await fetch(`${authServer.baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "unauth", version: "0" } } }),
  });
  check("http+bearer: unauthenticated initialize gets 401", unauth.status === 401);
  check("http+bearer: 401 carries a WWW-Authenticate header", (unauth.headers.get("www-authenticate") ?? "").includes("Bearer"));

  const noAuthClient = new Client({ name: "no-auth", version: "0.0.1" }, { capabilities: {} });
  clients.push(noAuthClient);
  await expectRejects("http+bearer: SDK client without a token fails", noAuthClient.connect(httpClient(authServer.baseUrl)));

  const wrongAuthClient = new Client({ name: "wrong-auth", version: "0.0.1" }, { capabilities: {} });
  clients.push(wrongAuthClient);
  await expectRejects(
    "http+bearer: SDK client with the wrong token fails",
    wrongAuthClient.connect(httpClient(authServer.baseUrl, { Authorization: "Bearer wrong-token" })),
  );

  const goodAuthClient = new Client({ name: "mcp-probe-selftest-bearer", version: "0.0.1" }, { capabilities: {} });
  clients.push(goodAuthClient);
  await goodAuthClient.connect(httpClient(authServer.baseUrl, { Authorization: `Bearer ${secret}` }));
  const goodWho = await goodAuthClient.callTool({ name: "whoami", arguments: {} });
  check("http+bearer: the correct token is accepted", resultText(goodWho).includes('"bearerRequired": true'));
  await goodAuthClient.close();
  await authServer.stop();

  const authLog = entries(authDir);
  const authRaw = rawLog(authDir);
  check("http+bearer: rejected requests are logged", authLog.some((entry) => entry.kind === "http_auth" && entry.ok === false));
  check("http+bearer: accepted request is logged as bearer_ok", authLog.some((entry) => entry.kind === "http_auth" && entry.ok === true && entry.reason === "bearer_ok"));
  check("http+bearer: the secret never appears in the log", !authRaw.includes(secret));
  check("http+bearer: the redacted Authorization string is present", authRaw.includes("Bearer...(len="));
  check("http+bearer: the 401 response is logged", authLog.some((entry) => entry.kind === "http_response" && entry.statusCode === 401));

  console.log(`\nSELFTEST PASSED: ${checks} checks`);
  console.log(`logs kept for inspection: ${LOG_ROOT}`);
}

main()
  .catch((error) => {
    console.error(`\nSELFTEST FAILED: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) console.error(error.stack);
    console.error(`logs: ${LOG_ROOT}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const client of clients) {
      try {
        await Promise.race([client.close(), sleep(2000)]);
      } catch {
        // Already closed or failed to connect.
      }
    }
    for (const child of spawned) {
      if (child.exitCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already gone.
        }
      }
    }
  });
