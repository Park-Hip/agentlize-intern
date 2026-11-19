import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename } from 'node:path';
import { DEPARTMENTS, LOOPBACK_HOST, PERSONAS, sendJson, type RequestHandler } from '@lab/shared';
import {
  createPolicyEngine,
  DEFAULT_RULES_PATH,
  esc,
  openGatewayDatabaseReadOnly,
  PAGE_SECURITY_HEADERS,
  readForm,
  TraceReader,
  type PolicyDecision,
  type TraceFilter,
  type TraceRow,
} from '@lab/gateway';
import {
  personaChoices,
  personaRows,
  playgroundPersonas,
  serviceStatuses,
  toolRows,
  type PersonaOption,
} from './data.js';
import { CsrfTokens, sameConsoleOrigin } from './csrf.js';
import type { Notice } from './layout.js';
import { dataPage } from './pages-data.js';
import { errorPage, overviewPage, playgroundDownPage, playgroundPage, toolsPage } from './pages.js';
import { traceGroups, tracePage } from './pages-trace.js';
import { paginate, parsePage } from './source-data.js';
import { parseTraceQuery, TRACE_LIMIT } from './trace-view.js';
import {
  decisionForm,
  fieldChoices,
  knownRuleFields,
  parseDecision,
  permissionsView,
  runDecision,
  rulesFromForm,
  type DecisionOutcome,
  type FieldChoice,
} from './permissions.js';
import { brokenPermissionsPage, permissionsPage } from './permissions-page.js';
import { argsToFormValues, formFields, formValues, readArgs } from './schema-form.js';
import { scenarioByKey } from './scenarios.js';
import { historyVersions, loadRules, writeRules } from './rules.js';
import {
  callTool,
  confirmationLinkIn,
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
  type ToolEntry,
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
  /** Hands out the persona's key for one call. Raw keys never reach a page or a log. */
  readonly rawKeyFor: (employeeId: string) => string | undefined;
  /** The gateway's trace table. Only `list` is reachable from here: the console never appends a line. */
  readonly trace: Pick<TraceReader, 'list'>;
}

/** The person the playground opens on: the main character of scenario A. */
const DEFAULT_PERSONA = PERSONAS.hoa.employeeId;
const DEFAULT_TOOL = 'find_employee';

/** The console's own deps plus the gateway's decision function, bound to the same rule file. */
interface ConsoleContext extends ConsoleDeps {
  readonly decide: (input: unknown) => PolicyDecision;
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

function submittedVersion(form: URLSearchParams): number | undefined {
  const raw = form.get('version') ?? '';
  return /^[0-9]+$/.test(raw) ? Number(raw) : undefined;
}

async function sendPermissions(deps: ConsoleContext, csrf: CsrfTokens, url: URL, res: ServerResponse): Promise<void> {
  const loaded = loadRules(deps.rulesPath);
  if (!loaded.ok) {
    sendHtml(res, 200, brokenPermissionsPage(loaded.detail, csrf.issue()));
    return;
  }

  const notices: Notice[] = [];
  const fetched = await fetchEmployees(deps.endpoints.directory, deps.serviceKey);
  let employees: readonly Employee[] | undefined;
  if (fetched.ok) {
    employees = fetched.employees;
  } else {
    notices.push({
      text: `Không đọc được danh bạ (${fetched.detail}) nên danh sách trường có thể thiếu trường mới, và ô thử quyết định chưa dùng được. Bảng quyền vẫn sửa được với các trường đang có trong luật.`,
      tone: 'bad',
    });
  }

  const personas = personaChoices(employees ?? []);
  if (fetched.ok && personas.length === 0) {
    notices.push({
      text: 'Danh bạ không có nhân vật nào trong sáu nhân vật của kịch bản, nên chưa hỏi được bộ luật.',
      tone: 'bad',
    });
  }

  const fields = knownRuleFields(loaded.rules, employees);
  const choices: readonly FieldChoice[] = fieldChoices(loaded.rules, fields);

  const form = decisionForm(url.searchParams, personas, fields);
  let outcome: DecisionOutcome | undefined;
  const ran = url.searchParams.has('persona');
  if (ran) {
    const parsed = parseDecision(url.searchParams, personas, fields);
    outcome = parsed.ok ? runDecision(parsed.request, personas, deps.decide) : { ok: false, detail: parsed.detail };
  }

  const savedRaw = url.searchParams.get('saved');
  const restoredRaw = url.searchParams.get('restored');
  const savedVersion = savedRaw !== null && /^[1-9][0-9]*$/.test(savedRaw) ? Number(savedRaw) : undefined;
  const restoredVersion = restoredRaw !== null && /^[1-9][0-9]*$/.test(restoredRaw) ? Number(restoredRaw) : undefined;

  sendHtml(
    res,
    200,
    permissionsPage(
      {
        ...permissionsView(loaded.rules, choices, basename(deps.rulesPath)),
        csrfToken: csrf.issue(),
        personas,
        decision: { form, ran, outcome },
        notices,
        savedVersion,
        restoredVersion,
      },
      'permissions',
    ),
  );
}

async function handlePermissionsPost(
  deps: ConsoleDeps,
  csrf: CsrfTokens,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!sameConsoleOrigin(req.headers.origin, req.headers.host)) {
    sendHtml(
      res,
      403,
      errorPage({ text: 'Yêu cầu đến từ một trang khác nên bị từ chối. Mở lại trang Quyền và trường rồi gửi lại.' }, 'permissions'),
    );
    return;
  }

  const form = await readForm(req);
  if (form === undefined) {
    sendHtml(res, 400, errorPage({ text: 'Nội dung gửi lên không đọc được. Tải lại trang rồi thử lại.' }, 'permissions'));
    return;
  }
  if (!csrf.check(form.get('csrf') ?? '')) {
    sendHtml(
      res,
      403,
      errorPage({ text: 'Thiếu hoặc sai mã chống giả mạo. Tải lại trang Quyền và trường rồi gửi lại.' }, 'permissions'),
    );
    return;
  }

  const action = form.get('action');
  if (action !== 'save' && action !== 'restore') {
    sendHtml(res, 400, errorPage({ text: 'Thao tác không có trong trang này.' }, 'permissions'));
    return;
  }

  const version = submittedVersion(form);
  if (version === undefined) {
    sendHtml(res, 400, errorPage({ text: 'Thiếu số phiên bản của form. Tải lại trang rồi thử lại.' }, 'permissions'));
    return;
  }

  const current = loadRules(deps.rulesPath);

  if (action === 'save') {
    if (!current.ok) {
      sendHtml(
        res,
        409,
        errorPage(
          {
            text: `${current.detail} nên chưa lưu. Bấm "Về bản gốc" để chép lại bản gốc, hoặc sửa file bằng tay.`,
            link: { href: '/permissions', label: 'Tải lại trang' },
          },
          'permissions',
        ),
      );
      return;
    }
    if (current.rules.version !== version) {
      sendHtml(
        res,
        409,
        errorPage(
          {
            text: `Luật trên đĩa đã đổi: form mở ở phiên bản ${version}, trên đĩa là ${current.rules.version}. Chưa lưu gì. Tải lại trang rồi sửa lại.`,
            link: { href: '/permissions', label: 'Tải lại trang' },
          },
          'permissions',
        ),
      );
      return;
    }

    const catalog = form.getAll('catalog.employee');
    if (catalog.length === 0) {
      sendHtml(res, 400, errorPage({ text: 'Form thiếu danh sách trường. Tải lại trang rồi thử lại.' }, 'permissions'));
      return;
    }
    const built = rulesFromForm(current.rules, form, catalog);
    if (!built.ok) {
      // A broken form never reaches the file: the message names the field, the file keeps its bytes.
      sendHtml(
        res,
        400,
        errorPage(
          { text: `Chưa lưu: ${built.detail}`, link: { href: '/permissions', label: 'Tải lại trang' } },
          'permissions',
        ),
      );
      return;
    }
    try {
      writeRules(deps.rulesPath, built.rules);
      res.writeHead(303, { location: `/permissions?saved=${built.rules.version}`, 'cache-control': 'no-store' });
      res.end();
    } catch (error) {
      console.error(`[console] rule save failed: ${error instanceof Error ? error.message : String(error)}`);
      sendHtml(
        res,
        500,
        errorPage({ text: 'Không ghi được file luật. Chưa đổi gì. Hãy báo người vận hành Lab.' }, 'permissions'),
      );
    }
    return;
  }

  // Restore also works when the live file is broken, which is the case that needs it most.
  if (current.ok && current.rules.version !== version) {
    sendHtml(
      res,
      409,
      errorPage(
        {
          text: `Luật trên đĩa đã đổi: form mở ở phiên bản ${version}, trên đĩa là ${current.rules.version}. Chưa ghi gì. Tải lại trang rồi thử lại.`,
          link: { href: '/permissions', label: 'Tải lại trang' },
        },
        'permissions',
      ),
    );
    return;
  }

  const base = loadRules(DEFAULT_RULES_PATH);
  if (!base.ok) {
    sendHtml(res, 500, errorPage({ text: 'Bản gốc trong mã không đọc được. Hãy báo người vận hành Lab.' }, 'permissions'));
    return;
  }
  const highest = Math.max(current.ok ? current.rules.version : 0, ...historyVersions(deps.rulesPath));
  const restored = { ...base.rules, version: highest + 1 };
  try {
    writeRules(deps.rulesPath, restored);
    res.writeHead(303, { location: `/permissions?restored=${restored.version}`, 'cache-control': 'no-store' });
    res.end();
  } catch (error) {
    console.error(`[console] rule save failed: ${error instanceof Error ? error.message : String(error)}`);
    sendHtml(
      res,
      500,
      errorPage({ text: 'Không ghi được file luật. Chưa đổi gì. Hãy báo người vận hành Lab.' }, 'permissions'),
    );
  }
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

interface CallDraft {
  readonly persona: PersonaOption;
  readonly tool: ToolEntry;
  readonly rawKey: string;
  readonly args: Record<string, unknown>;
  readonly values: ReadonlyMap<string, string>;
}

type DraftResult =
  | { readonly ok: true; readonly draft: CallDraft }
  | { readonly ok: false; readonly status: number; readonly problem: string };

/**
 * What one press of "Gọi" asks for: either a fixed scenario or the fields of
 * the form. Both end with the persona's own key and the exact JSON arguments.
 */
function draftOf(
  scenarioKey: string | null,
  form: URLSearchParams,
  tools: readonly ToolEntry[],
  deps: ConsoleDeps,
): DraftResult {
  const personas = playgroundPersonas();

  if (scenarioKey !== null) {
    const scenario = scenarioByKey(scenarioKey);
    if (scenario === undefined) {
      return { ok: false, status: 400, problem: `Không có kịch bản "${scenarioKey}".` };
    }
    const tool = tools.find((candidate) => candidate.name === scenario.tool);
    if (tool === undefined) {
      return { ok: false, status: 409, problem: `Kịch bản này cần tool ${scenario.tool}, mà cổng không công bố tool đó.` };
    }
    const persona = personas.find((candidate) => candidate.employeeId === scenario.employeeId);
    const rawKey = deps.rawKeyFor(scenario.employeeId);
    if (persona === undefined || rawKey === undefined) {
      return { ok: false, status: 409, problem: `Console chưa có khoá cho ${scenario.employeeId}. Hãy khởi động lại console.` };
    }
    return {
      ok: true,
      draft: {
        persona,
        tool,
        rawKey,
        args: { ...scenario.args },
        values: argsToFormValues(formFields(tool.inputSchema), scenario.args),
      },
    };
  }

  const personaId = form.get('persona') ?? '';
  const toolName = form.get('tool') ?? '';
  const tool = tools.find((candidate) => candidate.name === toolName);
  if (tool === undefined) {
    return { ok: false, status: 400, problem: `Tool "${toolName}" không có trong danh mục của cổng.` };
  }
  const persona = personas.find((candidate) => candidate.employeeId === personaId);
  const rawKey = deps.rawKeyFor(personaId);
  if (persona === undefined || rawKey === undefined) {
    return { ok: false, status: 400, problem: `Nhân vật "${personaId}" không có trong danh sách nhận khoá.` };
  }

  const fields = formFields(tool.inputSchema);
  const args = readArgs(fields, form);
  if (!args.ok) return { ok: false, status: 400, problem: args.problem };
  return { ok: true, draft: { persona, tool, rawKey, args: args.args, values: formValues(fields, form) } };
}

function lockedPage(problem: string, res: ServerResponse): void {
  sendHtml(res, 200, playgroundDownPage(problem));
}

async function handlePlayground(
  deps: ConsoleDeps,
  csrf: CsrfTokens,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const catalog = await fetchTools(deps.endpoints.gateway);
  if (!catalog.ok) {
    lockedPage(
      `Cổng không đọc được danh mục tool (${catalog.detail}) nên sân chơi chưa mở được. Kiểm tra cổng rồi tải lại.`,
      res,
    );
    return;
  }
  const tools = catalog.tools;
  if (tools.length === 0) {
    lockedPage('Cổng không công bố tool nào nên sân chơi chưa mở được.', res);
    return;
  }

  if ((req.method ?? 'GET') === 'GET') {
    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    const personas = playgroundPersonas();
    const wantedPersona = url.searchParams.get('persona');
    const personaId = personas.some((persona) => persona.employeeId === wantedPersona)
      ? (wantedPersona ?? DEFAULT_PERSONA)
      : DEFAULT_PERSONA;
    const wantedTool = url.searchParams.get('tool');
    const tool =
      tools.find((candidate) => candidate.name === wantedTool) ??
      tools.find((candidate) => candidate.name === DEFAULT_TOOL) ??
      tools[0];
    if (tool === undefined) {
      lockedPage('Cổng không công bố tool nào nên sân chơi chưa mở được.', res);
      return;
    }
    sendHtml(
      res,
      200,
      playgroundPage(
        {
          personas,
          tools,
          personaId,
          tool,
          fields: formFields(tool.inputSchema),
          values: new Map<string, string>(),
          csrfToken: csrf.issue(),
          result: null,
        },
        'playground',
      ),
    );
    return;
  }

  if (!sameConsoleOrigin(req.headers.origin, req.headers.host)) {
    sendHtml(res, 403, errorPage({ text: 'Yêu cầu đến từ một trang khác nên bị từ chối.' }, 'playground'));
    return;
  }
  const form = await readForm(req);
  if (form === undefined) {
    sendHtml(res, 400, errorPage({ text: 'Nội dung gửi lên không đọc được.' }, 'playground'));
    return;
  }
  if (!csrf.check(form.get('csrf') ?? '')) {
    sendHtml(
      res,
      403,
      errorPage({ text: 'Thiếu hoặc sai mã chống giả mạo. Hãy tải lại sân chơi rồi bấm lại.' }, 'playground'),
    );
    return;
  }

  const drafted = draftOf(form.get('scenario'), form, tools, deps);
  if (!drafted.ok) {
    sendHtml(res, drafted.status, errorPage({ text: drafted.problem }, 'playground'));
    return;
  }

  const { persona, tool, rawKey, args, values } = drafted.draft;
  const call = await callTool(deps.endpoints.gateway, rawKey, tool.name, args);

  let trace: TraceRow | null = null;
  if (call.traceId !== null) {
    try {
      trace = deps.trace.list({ traceId: call.traceId, limit: 1 })[0] ?? null;
    } catch (error) {
      console.error(`[console] trace read failed: ${error instanceof Error ? error.message : String(error)}`);
      trace = null;
    }
  }

  sendHtml(
    res,
    200,
    playgroundPage(
      {
        personas: playgroundPersonas(),
        tools,
        personaId: persona.employeeId,
        tool,
        fields: formFields(tool.inputSchema),
        values,
        csrfToken: csrf.issue(),
        result: {
          personaLabel: persona.label,
          toolName: tool.name,
          call,
          trace,
          link: confirmationLinkIn(call.text) ?? null,
        },
      },
      'playground',
    ),
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
  const policy = createPolicyEngine({ rulesPath: deps.rulesPath });
  const context: ConsoleContext = { ...deps, decide: (input: unknown): PolicyDecision => policy.decide(input) };
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

    if (path === '/permissions') {
      if (method === 'GET') {
        try {
          await sendPermissions(context, csrf, url, res);
        } catch (error) {
          console.error(`[console] permission page failed: ${error instanceof Error ? error.message : String(error)}`);
          if (!res.headersSent) {
            sendHtml(res, 500, errorPage({ text: 'Trang gặp lỗi khi đọc luật hoặc danh bạ. Hãy tải lại.' }, 'permissions'));
          } else {
            res.destroy();
          }
        }
        return;
      }
      if (method === 'POST') {
        try {
          await handlePermissionsPost(deps, csrf, req, res);
        } catch (error) {
          console.error(`[console] permission save failed: ${error instanceof Error ? error.message : String(error)}`);
          if (!res.headersSent) {
            sendHtml(res, 500, errorPage({ text: 'Trang gặp lỗi khi lưu luật. Chưa đổi gì.' }, 'permissions'));
          } else {
            res.destroy();
          }
        }
        return;
      }
      sendHtml(res, 405, errorPage({ text: 'Màn hình này nhận GET và POST.' }, 'permissions'), { headers: { allow: 'GET, POST' } });
      return;
    }

    if (path === '/playground') {
      if (method !== 'GET' && method !== 'POST') {
        sendHtml(res, 405, errorPage({ text: 'Màn hình này nhận GET và POST.' }, 'playground'), {
          headers: { allow: 'GET, POST' },
        });
        return;
      }
      try {
        await handlePlayground(deps, csrf, req, res);
      } catch (error) {
        console.error(`[console] playground failed: ${error instanceof Error ? error.message : String(error)}`);
        if (!res.headersSent) {
          sendHtml(res, 500, errorPage({ text: 'Sân chơi gặp lỗi. Hãy tải lại, hoặc báo người vận hành Lab.' }, 'playground'));
        } else {
          res.destroy();
        }
      }
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
