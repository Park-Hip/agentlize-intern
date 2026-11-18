import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEPARTMENTS, LOOPBACK_HOST, sendJson, type RequestHandler } from '@lab/shared';
import {
  esc,
  openGatewayDatabaseReadOnly,
  PAGE_SECURITY_HEADERS,
  readForm,
  TraceReader,
  type TraceFilter,
  type TraceRow,
} from '@lab/gateway';
import { personaRows, serviceStatuses, toolRows } from './data.js';
import { CsrfTokens, sameConsoleOrigin } from './csrf.js';
import type { Notice } from './layout.js';
import { dataPage } from './pages-data.js';
import { errorPage, overviewPage, toolsPage } from './pages.js';
import { traceGroups, tracePage } from './pages-trace.js';
import { paginate, parsePage } from './source-data.js';
import { parseTraceQuery, TRACE_LIMIT } from './trace-view.js';
import {
  fetchEmployees,
  fetchTasks,
  fetchTools,
  injectLostResponseFault,
  probe,
  readRuleInfo,
  resetDirectory,
  resetTasks,
  type Employee,
  type ServiceEndpoints,
} from './upstream.js';

export interface ConsoleDeps {
  readonly endpoints: ServiceEndpoints;
  readonly serviceKey: string;
  /** The same file the gateway reads; an edit applies to the next request. */
  readonly rulesPath: string;
  /** Holds `gateway.sqlite`; the trace screen opens the file there, read-only. */
  readonly dataDir: string;
  /** The same `LAB_TEST_HOOKS` value the fake systems got, so the buttons exist exactly when they work. */
  readonly testHooks: boolean;
}

/** Everything except the script source, which is added only on the page that has one. */
const BASE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

function cspWithScript(nonce: string): string {
  return `${BASE_CSP}; script-src 'nonce-${nonce}'; connect-src 'self'`;
}

interface HtmlOptions {
  /** The nonce the page's own script carries; its presence opens `script-src` for that value only. */
  readonly nonce?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

function sendHtml(res: ServerResponse, status: number, html: string, options: HtmlOptions = {}): void {
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...PAGE_SECURITY_HEADERS,
    ...(options.nonce === undefined ? {} : { 'content-security-policy': cspWithScript(options.nonce) }),
    ...options.headers,
  };
  res.writeHead(status, headers);
  res.end(html);
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(`${text}\n`);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { location, 'cache-control': 'no-store' });
  res.end();
}

/** A fresh nonce per response; the script tag carries the same value. */
function newNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * ADR-0006 section 3.1: only the two names a person types on this machine may
 * reach the console. A page on another site that rebinds DNS to 127.0.0.1
 * carries its own Host, so it stops here.
 */
function hostAllowed(req: IncomingMessage): boolean {
  const host = req.headers.host?.toLowerCase();
  const port = req.socket.localPort;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

async function sendOverview(deps: ConsoleDeps, res: ServerResponse): Promise<void> {
  const [gateway, directory, tasks] = await Promise.all([
    probe(deps.endpoints.gateway, deps.serviceKey),
    probe(deps.endpoints.directory, deps.serviceKey),
    probe(deps.endpoints.tasks, deps.serviceKey),
  ]);
  const outcomes = { gateway, directory, tasks };

  const notices: Notice[] = [];
  let employees: readonly Employee[] | undefined;
  if (!directory.ok) {
    notices.push({
      text: `Không đọc được danh bạ (${directory.detail}) nên bảng nhân vật chưa đầy đủ. Kiểm tra dịch vụ danh bạ và khoá dịch vụ.`,
      tone: 'bad',
    });
  } else {
    const fetched = await fetchEmployees(deps.endpoints.directory, deps.serviceKey);
    if (fetched.ok) {
      employees = fetched.employees;
    } else {
      notices.push({
        text: `Không đọc được danh sách nhân viên (${fetched.detail}) nên bảng nhân vật chưa đầy đủ.`,
        tone: 'bad',
      });
    }
  }

  sendHtml(
    res,
    200,
    overviewPage(
      {
        services: serviceStatuses(deps.endpoints, outcomes),
        rule: readRuleInfo(deps.rulesPath),
        personas: personaRows(employees),
        notices,
      },
      'overview',
    ),
  );
}

async function sendTools(deps: ConsoleDeps, res: ServerResponse): Promise<void> {
  const health = await probe(deps.endpoints.gateway, deps.serviceKey);
  if (!health.ok) {
    sendHtml(
      res,
      200,
      toolsPage(
        {
          tools: undefined,
          endpoints: deps.endpoints,
          notices: [
            {
              text: `Cổng không chạy (${health.detail}) nên chưa đọc được danh mục tool. Các màn hình khác vẫn mở được.`,
              tone: 'bad',
            },
          ],
        },
        'tools',
      ),
    );
    return;
  }

  const catalog = await fetchTools(deps.endpoints.gateway);
  if (!catalog.ok) {
    sendHtml(
      res,
      200,
      toolsPage(
        {
          tools: undefined,
          endpoints: deps.endpoints,
          notices: [{ text: `Không đọc được danh mục tool từ cổng (${catalog.detail}).`, tone: 'bad' }],
        },
        'tools',
      ),
    );
    return;
  }

  sendHtml(
    res,
    200,
    toolsPage({ tools: toolRows(catalog.tools), endpoints: deps.endpoints, notices: [] }, 'tools'),
  );
}

/** What each test action is called when it lands back on the page. */
const ACTION_DONE: ReadonlyMap<string, string> = new Map([
  ['/data/directory/reset', 'directory-reset'],
  ['/data/tasks/reset', 'tasks-reset'],
  ['/data/tasks/faults', 'tasks-faults'],
]);

const DONE_TEXT: Readonly<Record<string, string>> = {
  'directory-reset': 'Đã gửi lệnh đặt lại danh bạ.',
  'tasks-reset': 'Đã gửi lệnh đặt lại danh sách task.',
  'tasks-faults': 'Đã bật lỗi mất phản hồi cho lần ghi kế tiếp của task giả.',
};

/** The sentence after a test button, from a fixed list so nothing typed in the URL reaches the page. */
function doneNotice(done: string | null, ok: string | null): Notice | undefined {
  if (done === null) return undefined;
  const text = DONE_TEXT[done];
  if (text === undefined) return undefined;
  return ok === '1'
    ? { text, tone: 'ok' }
    : {
        text: `${text} Hệ thống giả không nhận lệnh: kiểm tra LAB_TEST_HOOKS của hệ thống đó có bật không.`,
        tone: 'bad',
      };
}

async function sendData(deps: ConsoleDeps, res: ServerResponse, url: URL, csrf: CsrfTokens): Promise<void> {
  const notices: Notice[] = [];

  const rawDepartment = url.searchParams.get('department');
  let department: string | undefined;
  if (rawDepartment !== null) {
    if ((DEPARTMENTS as readonly string[]).includes(rawDepartment)) {
      department = rawDepartment;
    } else {
      notices.push({ text: 'Phòng phải là Vận hành hoặc Kinh doanh, nên màn hình bỏ qua bộ lọc phòng.', tone: 'bad' });
    }
  }

  const done = doneNotice(url.searchParams.get('done'), url.searchParams.get('ok'));
  if (done !== undefined) notices.push(done);

  const [directory, tasks] = await Promise.all([
    fetchEmployees(deps.endpoints.directory, deps.serviceKey, department),
    fetchTasks(deps.endpoints.tasks, deps.serviceKey, department),
  ]);

  if (!directory.ok) {
    notices.push({
      text: `Không đọc được danh bạ (${directory.detail}) nên bảng nhân viên để trống. Kiểm tra dịch vụ danh bạ và khoá dịch vụ.`,
      tone: 'bad',
    });
  }
  if (!tasks.ok) {
    notices.push({
      text: `Không đọc được danh sách task (${tasks.detail}) nên bảng task để trống. Kiểm tra dịch vụ task và khoá dịch vụ.`,
      tone: 'bad',
    });
  }

  sendHtml(
    res,
    200,
    dataPage(
      {
        department,
        employees: directory.ok ? directory.employees : undefined,
        tasks: tasks.ok ? tasks.tasks : undefined,
        page: tasks.ok ? paginate(tasks.tasks, parsePage(url.searchParams.get('page'))) : undefined,
        notices,
        csrfToken: deps.testHooks ? csrf.issue() : undefined,
      },
      'data',
    ),
  );
}

/**
 * One press of a test button: the only `POST` of the console (ADR-0006 section
 * 3.1). It needs the feature flag, our own `Origin`, the token the page drew
 * and the service key the fake system asks for; a press never edits a record,
 * it calls the `/admin/*` route the fake system already has.
 */
async function handleDataAction(
  deps: ConsoleDeps,
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  csrf: CsrfTokens,
): Promise<void> {
  const done = ACTION_DONE.get(path);
  if (done === undefined) return;

  if (!deps.testHooks) {
    // The buttons are not drawn, and the route is not there either.
    sendHtml(res, 404, errorPage({ text: 'Nút này chỉ có khi LAB_TEST_HOOKS=1.' }, null));
    return;
  }
  if (req.method !== 'POST') {
    sendHtml(res, 405, errorPage({ text: 'Nút này chỉ nhận POST.' }, null), { headers: { allow: 'POST' } });
    return;
  }
  if (!sameConsoleOrigin(req.headers.origin, req.headers.host)) {
    sendHtml(res, 403, errorPage({ text: 'Yêu cầu đến từ một trang khác nên bị từ chối.' }, null));
    return;
  }

  const form = await readForm(req);
  const token = form?.get('csrf') ?? '';
  if (form === undefined || !csrf.check(token)) {
    sendHtml(
      res,
      403,
      errorPage({ text: 'Thiếu hoặc sai mã chống giả mạo. Hãy tải lại màn hình dữ liệu gốc rồi bấm lại.' }, null),
    );
    return;
  }

  const outcome =
    path === '/data/directory/reset'
      ? await resetDirectory(deps.endpoints.directory, deps.serviceKey)
      : path === '/data/tasks/reset'
        ? await resetTasks(deps.endpoints.tasks, deps.serviceKey)
        : await injectLostResponseFault(deps.endpoints.tasks, deps.serviceKey);

  redirect(res, `/data?done=${done}&ok=${outcome.ok ? '1' : '0'}`);
}

interface TraceRead {
  readonly rows: readonly TraceRow[];
  readonly total: number;
}

/** Open, read and close in one request, so the console keeps no handle on the gateway's file. */
function readTrace(dataDir: string, filter: TraceFilter): TraceRead {
  const db = openGatewayDatabaseReadOnly(dataDir);
  try {
    const reader = new TraceReader(db);
    return { rows: reader.list({ ...filter, limit: TRACE_LIMIT }), total: reader.count(filter) };
  } finally {
    db.close();
  }
}

function describeTraceFailure(error: unknown): string {
  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'SQLITE_CANTOPEN' || code === 'ENOENT') {
    return 'Chưa mở được gateway.sqlite vì file chưa có: cổng chưa chạy lần nào với thư mục dữ liệu này. Bảng vết để trống.';
  }
  if (message.includes('no such table')) {
    return 'gateway.sqlite chưa có bảng trace vì chưa lời gọi nào được ghi. Bảng vết để trống.';
  }
  return `Không đọc được bảng vết (${message}). Kiểm tra quyền đọc gateway.sqlite.`;
}

async function sendTrace(deps: ConsoleDeps, res: ServerResponse, url: URL): Promise<void> {
  const query = parseTraceQuery(url.searchParams);
  const notices: Notice[] = query.notices.map((text) => ({ text, tone: 'bad' }));
  let rows: readonly TraceRow[] = [];
  let total = 0;
  let error: string | undefined;
  try {
    const read = readTrace(deps.dataDir, query.filter);
    rows = read.rows;
    total = read.total;
  } catch (failure) {
    error = describeTraceFailure(failure);
  }

  const nonce = newNonce();
  sendHtml(res, 200, tracePage({ query, rows, total, limit: TRACE_LIMIT, notices, error }, 'trace', nonce), {
    nonce,
  });
}

/** The same table without the page around it, fetched by the page's own refresh loop. */
async function sendTraceRows(deps: ConsoleDeps, res: ServerResponse, url: URL): Promise<void> {
  const query = parseTraceQuery(url.searchParams);
  let rows: readonly TraceRow[] = [];
  let error: string | undefined;
  try {
    rows = readTrace(deps.dataDir, query.filter).rows;
  } catch (failure) {
    error = describeTraceFailure(failure);
  }
  sendHtml(
    res,
    200,
    error === undefined
      ? traceGroups(rows)
      : `<section class="panel"><p class="meta">${esc(error)}</p></section>`,
  );
}

/** The screens that answer GET and share the navigation. */
const PAGES = new Set(['/', '/tools', '/data', '/trace']);

/**
 * The console's routes. Every request first passes the Host check, including
 * `/health`. A failing page still returns a readable page with a banner, so one
 * broken service never hides the other data.
 */
export function createConsoleHandler(deps: ConsoleDeps): RequestHandler {
  const csrf = new CsrfTokens();

  return async (req, res) => {
    if (!hostAllowed(req)) {
      const port = req.socket.localPort;
      sendText(res, 403, `Trang điều khiển chỉ mở từ 127.0.0.1:${port} hoặc localhost:${port}.`);
      return;
    }

    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    // `/trace/` and `/trace` are the same page, so a copied address still works.
    const path = url.pathname === '/trace/' ? '/trace' : url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/health') {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      sendJson(res, 200, { status: 'ok', service: 'console' });
      return;
    }

    if (ACTION_DONE.has(path)) {
      await handleDataAction(deps, req, res, path, csrf);
      return;
    }

    if (path === '/trace/rows') {
      if (method !== 'GET') {
        sendHtml(res, 405, errorPage({ text: 'Bảng vết chỉ nhận GET.' }, null), { headers: { allow: 'GET' } });
        return;
      }
      await sendTraceRows(deps, res, url);
      return;
    }

    if (!PAGES.has(path)) {
      sendHtml(res, 404, errorPage({ text: `Không có màn hình ${path}. Chọn một mục trên thanh điều hướng.` }, null));
      return;
    }

    if (method !== 'GET') {
      sendHtml(res, 405, errorPage({ text: 'Màn hình này chỉ nhận GET.' }, null), { headers: { allow: 'GET' } });
      return;
    }

    try {
      if (path === '/') {
        await sendOverview(deps, res);
      } else if (path === '/tools') {
        await sendTools(deps, res);
      } else if (path === '/data') {
        await sendData(deps, res, url, csrf);
      } else {
        await sendTrace(deps, res, url);
      }
    } catch (error) {
      console.error(`[console] page failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) {
        sendHtml(res, 500, errorPage({ text: 'Trang gặp lỗi khi đọc dữ liệu. Hãy tải lại, hoặc báo người vận hành Lab.' }, null));
      } else {
        res.destroy();
      }
    }
  };
}
