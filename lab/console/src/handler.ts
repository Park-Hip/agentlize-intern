import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename } from 'node:path';
import { LOOPBACK_HOST, sendJson, type RequestHandler } from '@lab/shared';
import {
  DEFAULT_RULES_PATH,
  PAGE_SECURITY_HEADERS,
  createPolicyEngine,
  readForm,
  tokensEqual,
  type PolicyDecision,
} from '@lab/gateway';
import { personaChoices, personaRows, serviceStatuses, toolRows } from './data.js';
import type { Notice } from './layout.js';
import { errorPage, overviewPage, toolsPage } from './pages.js';
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
import { permissionsPage } from './permissions-page.js';
import { historyVersions, loadRules, writeRules } from './rules.js';
import {
  fetchEmployees,
  fetchTools,
  probe,
  readRuleInfo,
  type Employee,
  type ServiceEndpoints,
} from './upstream.js';

export interface ConsoleDeps {
  readonly endpoints: ServiceEndpoints;
  readonly serviceKey: string;
  /** The same file the gateway reads; an edit applies to the next request. */
  readonly rulesPath: string;
  /** One token per console process, checked on every POST beside the Origin header. */
  readonly csrfToken: string;
}

/** The console's own deps plus the gateway's decision function, bound to the same rule file. */
interface ConsoleContext extends ConsoleDeps {
  readonly decide: (input: unknown) => PolicyDecision;
}

function sendHtml(
  res: ServerResponse,
  status: number,
  html: string,
  headers: Readonly<Record<string, string>> = {},
): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...PAGE_SECURITY_HEADERS,
    ...headers,
  });
  res.end(html);
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(`${text}\n`);
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

/**
 * A browser form carries the address of the page that sent it. The console
 * only accepts its own, so a page on another site cannot post even if it reads
 * the token from a form it cannot embed (ADR-0006 section 3.1).
 */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin?.toLowerCase();
  const host = req.headers.host?.toLowerCase();
  return origin !== undefined && host !== undefined && origin === `http://${host}`;
}

function submittedVersion(form: URLSearchParams): number | undefined {
  const raw = form.get('version') ?? '';
  return /^[1-9][0-9]*$/.test(raw) ? Number(raw) : undefined;
}

async function sendPermissions(deps: ConsoleContext, url: URL, res: ServerResponse): Promise<void> {
  const loaded = loadRules(deps.rulesPath);
  if (!loaded.ok) {
    sendHtml(
      res,
      200,
      errorPage(
        {
          text: `${loaded.detail}. Chưa sửa được từ trang này. Sửa file bằng tay, hoặc chuyển nó đi rồi khởi động lại cổng để cổng chép bản gốc.`,
          link: { href: '/', label: 'Về tổng quan' },
        },
        'permissions',
      ),
    );
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
        csrfToken: deps.csrfToken,
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

async function handlePermissionsPost(deps: ConsoleDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!sameOrigin(req)) {
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
  if (!tokensEqual(form.get('csrf') ?? '', deps.csrfToken)) {
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
  if (!current.ok) {
    sendHtml(
      res,
      409,
      errorPage(
        {
          text: `${current.detail} nên chưa lưu. Không ghi đè một file không đọc được.`,
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

  try {
    if (action === 'save') {
      const catalog = form.getAll('catalog');
      if (catalog.length === 0) {
        sendHtml(
          res,
          400,
          errorPage({ text: 'Form thiếu danh sách trường. Tải lại trang rồi thử lại.' }, 'permissions'),
        );
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
      writeRules(deps.rulesPath, built.rules);
      res.writeHead(303, { location: `/permissions?saved=${built.rules.version}`, 'cache-control': 'no-store' });
      res.end();
      return;
    }

    const base = loadRules(DEFAULT_RULES_PATH);
    if (!base.ok) {
      sendHtml(res, 500, errorPage({ text: 'Bản gốc trong mã không đọc được. Hãy báo người vận hành Lab.' }, 'permissions'));
      return;
    }
    const highest = Math.max(current.rules.version, ...historyVersions(deps.rulesPath));
    const restored = { ...base.rules, version: highest + 1 };
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
 * The console's routes. Every request first passes the Host check, including
 * `/health`. A failing page still returns a readable page with a banner, so one
 * broken service never hides the other data.
 */
export function createConsoleHandler(deps: ConsoleDeps): RequestHandler {
  const policy = createPolicyEngine({ rulesPath: deps.rulesPath });
  const context: ConsoleContext = { ...deps, decide: (input: unknown): PolicyDecision => policy.decide(input) };

  return async (req, res) => {
    if (!hostAllowed(req)) {
      const port = req.socket.localPort;
      sendText(res, 403, `Trang điều khiển chỉ mở từ 127.0.0.1:${port} hoặc localhost:${port}.`);
      return;
    }

    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    const path = url.pathname;
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
          await sendPermissions(context, url, res);
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
          await handlePermissionsPost(deps, req, res);
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
      sendHtml(res, 405, errorPage({ text: 'Màn hình này nhận GET và POST.' }, 'permissions'), { allow: 'GET, POST' });
      return;
    }

    if (path !== '/' && path !== '/tools') {
      sendHtml(res, 404, errorPage({ text: `Không có màn hình ${path}. Chọn một mục trên thanh điều hướng.` }, null));
      return;
    }

    if (method !== 'GET') {
      sendHtml(res, 405, errorPage({ text: 'Màn hình này chỉ nhận GET.' }, null));
      return;
    }

    try {
      if (path === '/') await sendOverview(deps, res);
      else await sendTools(deps, res);
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
