/**
 * Read a probe log and print the facts a human needs to fill the P1-P5 tables
 * in rd/appota/tho-than-mcp-probe.md. No interpretation beyond explicit hints.
 *
 * Usage:
 *   node dist/summarize.js                     # newest log under scratch/mcp-probe
 *   node dist/summarize.js <file-or-directory>
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "./log.js";

type Entry = Record<string, any>;

function newestLogUnder(dir: string): string | null {
  const found: Array<{ file: string; mtime: number }> = [];
  const walk = (current: string): void => {
    let items: string[];
    try {
      items = readdirSync(current);
    } catch {
      return;
    }
    for (const name of items) {
      const full = join(current, name);
      let info;
      try {
        info = statSync(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) walk(full);
      else if (name.endsWith(".jsonl")) found.push({ file: full, mtime: info.mtimeMs });
    }
  };
  walk(dir);
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0]?.file ?? null;
}

function resolveLogs(arg: string | undefined): string[] {
  if (!arg) {
    const root = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), "scratch", "mcp-probe");
    const newest = newestLogUnder(root);
    if (!newest) throw new Error(`Không tìm thấy file log nào dưới ${root}. Chạy server trước.`);
    return [newest];
  }
  const target = resolve(arg);
  if (!existsSync(target)) throw new Error(`Không thấy đường dẫn: ${target}`);
  if (statSync(target).isDirectory()) {
    const files = readdirSync(target)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .map((name) => join(target, name));
    if (files.length === 0) throw new Error(`Thư mục không có file .jsonl: ${target}`);
    return files;
  }
  return [target];
}

function readAll(files: string[]): Entry[] {
  const out: Entry[] = [];
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as Entry);
      } catch {
        // Keep going: a truncated last line should not hide the rest.
      }
    }
  }
  return out;
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return map;
}

function printCounts(title: string, map: Map<string, number>): void {
  console.log(`\n${title}`);
  if (map.size === 0) {
    console.log("  (không có)");
    return;
  }
  for (const [key, value] of [...map.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(value).padStart(4)}  ${key}`);
  }
}

function headerNamesFromHttp(entries: Entry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== "http_request") continue;
    for (const [name, value] of Object.entries(entry.headers ?? {})) {
      if (value === undefined || value === null) continue;
      const lower = name.toLowerCase();
      if (lower === "host" || lower === "connection" || lower === "content-length" || lower === "accept-encoding") continue;
      map.set(lower, (map.get(lower) ?? 0) + 1);
    }
  }
  return map;
}

function short(value: unknown, max = 220): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function main(): void {
  const files = resolveLogs(process.argv[2]);
  const entries = readAll(files);
  if (entries.length === 0) throw new Error("Log rỗng.");

  const starts = entries.filter((entry) => entry.kind === "server_start");
  const ready = entries.filter((entry) => entry.kind === "server_ready");
  const httpRequests = entries.filter((entry) => entry.kind === "http_request");
  const httpResponses = entries.filter((entry) => entry.kind === "http_response");
  const incoming = entries.filter((entry) => entry.kind === "jsonrpc" && entry.direction === "in");
  const outgoing = entries.filter((entry) => entry.kind === "jsonrpc" && entry.direction === "out");
  const toolCalls = entries.filter((entry) => entry.kind === "tool_call");
  const toolResults = entries.filter((entry) => entry.kind === "tool_result");

  console.log("== Tổng quan ==");
  for (const file of files) console.log(`File log: ${file}`);
  for (const start of starts) {
    console.log(`Server bắt đầu: ${start.ts} | transport=${start.transport} | pid=${start.pid} | node=${start.node}`);
    console.log(`Cấu hình: ${short(start.config, 400)}`);
  }
  for (const item of ready) console.log(`Sẵn sàng: ${item.ts} | endpoint=${item.endpoint ?? "stdio"}`);
  console.log(`Số dòng log: ${entries.length}`);
  console.log(`HTTP: ${httpRequests.length} request, ${httpResponses.length} response`);
  console.log(`JSON-RPC: ${incoming.length} vào, ${outgoing.length} ra`);
  console.log(`Tool: ${toolCalls.length} lần gọi, ${toolResults.length} kết quả`);

  const sessions = entries.filter((entry) => entry.kind === "session_init");
  console.log("\n== Máy khách (P1, P2) ==");
  if (sessions.length === 0) {
    console.log("  (không có initialize trong log)");
  } else {
    for (const session of sessions) {
      console.log(
        `  session=${session.sessionId ?? "stdio"} | client=${short(session.clientInfo)} | protocol=${session.protocolVersion ?? "?"}`,
      );
      console.log(`    capabilities=${short(session.capabilities, 500)}`);
    }
  }
  printCounts(
    "Phiên theo clientInfo:",
    countBy(sessions, (session) => `${session.clientInfo?.name ?? "?"}@${session.clientInfo?.version ?? "?"}`),
  );

  console.log("\n== Danh tính quan sát được (P2) ==");
  const authEvents = entries.filter((entry) => entry.kind === "http_auth");
  printCounts("Kết quả kiểm Authorization:", countBy(authEvents, (entry) => `${entry.ok ? "nhận" : "từ chối"} | ${entry.reason}`));
  const headerCounts = headerNamesFromHttp(entries);
  const identityLike = [...headerCounts.keys()].filter((name) =>
    /(auth|cookie|session|user|email|trace|request-id|correlation|forwarded|origin|referer|user-agent)/.test(name),
  );
  console.log(`Header giống danh tính đã thấy: ${identityLike.length ? identityLike.join(", ") : "(không có)"}`);
  for (const name of ["authorization", "cookie", "x-user-id", "x-user-email", "x-forwarded-user", "x-forwarded-email"]) {
    if (headerCounts.has(name)) console.log(`  ${name}: có trong ${headerCounts.get(name)} request`);
  }
  const authSamples = entries
    .filter((entry) => entry.kind === "http_request" && entry.headers?.authorization)
    .map((entry) => entry.headers.authorization);
  if (authSamples.length) console.log(`  Giá trị Authorization đã che, ví dụ: ${authSamples[0]}`);
  const extraMeta = entries.filter((entry) => entry.kind === "extra_meta");
  console.log(`_meta có khóa lạ: ${extraMeta.length === 0 ? "(không có)" : ""}`);
  for (const entry of extraMeta) console.log(`  ${entry.method}: ${short(entry.meta, 300)}`);

  console.log("\n== Dấu vết và chi phí (P5) ==");
  const traceHeaders = new Set<string>();
  for (const entry of httpRequests) {
    for (const name of Object.keys(entry.headers ?? {})) {
      if (/^(traceparent|tracestate|baggage|x-request-id|x-correlation-id)$/i.test(name)) traceHeaders.add(name);
    }
  }
  const metaTrace = new Set<string>();
  for (const entry of incoming) {
    const meta = entry.message?.params?._meta;
    if (meta && typeof meta === "object") {
      for (const name of Object.keys(meta)) {
        if (/trace|request-id|correlation/i.test(name)) metaTrace.add(name);
      }
    }
  }
  console.log(`Header dấu vết: ${traceHeaders.size ? [...traceHeaders].join(", ") : "(không có)"}`);
  console.log(`_meta dấu vết: ${metaTrace.size ? [...metaTrace].join(", ") : "(không có)"}`);
  const costKeys = new Set<string>();
  for (const entry of entries) {
    const meta = entry.message?.params?._meta ?? entry.meta;
    if (meta && typeof meta === "object") {
      for (const name of Object.keys(meta)) {
        if (name === "progressToken") continue;
        if (/token|usage|cost|price/i.test(name)) costKeys.add(name);
      }
    }
  }
  console.log(`Khóa giống token/chi phí trong _meta: ${costKeys.size ? [...costKeys].join(", ") : "(không có)"}`);

  console.log("\n== Tool (P3, P4, P5) ==");
  printCounts("Số lần gọi theo tool:", countBy(toolCalls, (entry) => entry.tool));
  for (const call of toolCalls) {
    const result = toolResults.find((item) => item.requestId === call.requestId && (item.sessionId ?? null) === (call.sessionId ?? null));
    const flag = result?.isError ? " | isError=true" : "";
    console.log(
      `  ${call.ts} | ${call.tool} | request=${call.requestId} | session=${call.sessionId ?? "stdio"} | args=${short(call.arguments, 200)}${flag}`,
    );
  }

  const fakeWrites = toolCalls.filter((entry) => entry.tool === "fake_write");
  if (fakeWrites.length) {
    console.log("\nGhi giả lập (fake_write):");
    for (const call of fakeWrites) console.log(`  ${call.ts} | T-12? ${call.arguments?.taskId ?? "?"} -> ${call.arguments?.assignee ?? "?"}`);
  }

  const flaky = entries.filter((entry) => entry.kind === "flaky_attempt");
  if (flaky.length) {
    console.log("\nFlaky (P4):");
    const byKey = new Map<string, Entry[]>();
    for (const entry of flaky) {
      const list = byKey.get(entry.key) ?? [];
      list.push(entry);
      byKey.set(entry.key, list);
    }
    for (const [key, list] of byKey) {
      const gaps = list.slice(1).map((entry, index) => new Date(entry.ts).getTime() - new Date(list[index]!.ts).getTime());
      const gapText = gaps.length ? ` | cách nhau ${gaps.join(", ")} ms` : "";
      console.log(`  khóa=${key}: ${list.length} lần gọi${gapText}`);
      if (list.length > 1) console.log("    Gợi ý: khoảng cách ngắn là dấu hiệu host hoặc model tự gọi lại, nhưng log một mình không phân biệt được.");
    }
  }

  const slowStarts = entries.filter((entry) => entry.kind === "slow_start");
  if (slowStarts.length) {
    console.log("\nSlow (P4):");
    for (const start of slowStarts) {
      const end = entries.find(
        (entry) =>
          entry.kind === "slow_end" &&
          entry.requestId === start.requestId &&
          (entry.sessionId ?? null) === (start.sessionId ?? null),
      );
      const cancel = entries.find(
        (entry) =>
          entry.kind === "tool_cancelled" &&
          entry.requestId === start.requestId &&
          (entry.sessionId ?? null) === (start.sessionId ?? null),
      );
      const progress = entries.filter(
        (entry) =>
          entry.kind === "tool_progress" &&
          entry.requestId === start.requestId &&
          (entry.sessionId ?? null) === (start.sessionId ?? null),
      ).length;
      const status = end
        ? `${end.cancelled ? "bị hủy" : "xong"} sau ${end.elapsedMs} ms`
        : "CHƯA thấy kết thúc trong log (có thể còn đang chờ, host đã cắt, hoặc server đã dừng)";
      console.log(
        `  ${start.ts} | xin chờ ${start.seconds}s | progressToken=${start.progressToken ?? "không có"} | ${progress} thông báo tiến độ | ${status}`,
      );
      if (cancel) console.log(`    Hủy: ${cancel.ts} sau ${cancel.elapsedMs} ms, đã chờ ${cancel.waitedSeconds}s`);
    }
  }

  const disconnects = entries.filter((entry) => entry.kind === "http_client_disconnect");
  if (disconnects.length) {
    console.log("\nNgắt kết nối HTTP giữa chừng (P4):");
    for (const entry of disconnects) {
      console.log(`  ${entry.ts} | ${entry.method} ${entry.path} | session=${entry.sessionId ?? "?"} | kết nối mở ${entry.durationMs} ms rồi đóng`);
    }
  }

  const confirms = entries.filter((entry) => entry.kind === "ask_confirm_branch");
  if (confirms.length) {
    console.log("\nAsk_confirm (P3):");
    for (const entry of confirms) {
      const result = entries.find(
        (item) => item.kind === "ask_confirm_result" && item.requestId === entry.requestId,
      );
      console.log(
        `  ${entry.ts} | session=${entry.sessionId ?? "stdio"} | nhánh=${entry.branch} | capabilities=${short(entry.capabilities, 200)} | kết quả=${result ? short(result.action ?? result.error, 160) : "chưa thấy"}`,
      );
    }
  }

  const approvals = entries.filter((entry) => entry.kind === "approve_visit");
  if (approvals.length) {
    console.log("\nLượt bấm link duyệt (P3):");
    for (const entry of approvals) {
      console.log(`  ${entry.ts} | id=${entry.id} | UA=${short(entry.userAgent)} | referer=${short(entry.referer)}`);
    }
  }

  const structured = toolResults.filter((entry) => entry.tool === "structured");
  if (structured.length) {
    console.log("\nStructured (P5):");
    for (const entry of structured) console.log(`  ${entry.ts} | có structuredContent=${Boolean(entry.structuredContent)} | có content=${Boolean(entry.content)}`);
  }

  const errors = toolResults.filter((entry) => entry.isError === true);
  console.log(`\nKết quả isError=true: ${errors.length === 0 ? "(không có)" : ""}`);
  for (const entry of errors) console.log(`  ${entry.ts} | ${entry.tool} | request=${entry.requestId}`);

  printCounts("HTTP response theo mã trạng thái:", countBy(httpResponses, (entry) => String(entry.statusCode)));
  printCounts("Đường dẫn HTTP:", countBy(httpRequests, (entry) => `${entry.method} ${entry.path}`));
  printCounts("Sự kiện khác:", countBy(entries, (entry) => entry.kind));
}

try {
  main();
} catch (error) {
  console.error(`summarize: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
