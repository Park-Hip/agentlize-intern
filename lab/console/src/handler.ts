import type { IncomingMessage, ServerResponse } from 'node:http';
import { LOOPBACK_HOST, sendJson, type RequestHandler } from '@lab/shared';
import { PAGE_SECURITY_HEADERS } from '@lab/gateway';
import { personaRows, serviceStatuses, toolRows } from './data.js';
import type { Notice } from './layout.js';
import { errorPage, overviewPage, toolsPage } from './pages.js';
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
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...PAGE_SECURITY_HEADERS,
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
 * The console's four routes. Every request first passes the Host check,
 * including `/health`. A failing page still returns a readable page with a
 * banner, so one broken service never hides the other data.
 */
export function createConsoleHandler(deps: ConsoleDeps): RequestHandler {
  return async (req, res) => {
    if (!hostAllowed(req)) {
      const port = req.socket.localPort;
      sendText(res, 403, `Trang điều khiển chỉ mở từ 127.0.0.1:${port} hoặc localhost:${port}.`);
      return;
    }

    const path = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`).pathname;
    const method = req.method ?? 'GET';

    if (path === '/health') {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      sendJson(res, 200, { status: 'ok', service: 'console' });
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
