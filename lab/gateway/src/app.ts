import type { IncomingMessage, ServerResponse } from 'node:http';
import { LOOPBACK_HOST, readJsonBody, sendJson, type RequestHandler, type ToolResponse } from '@lab/shared';
import { catalogEntries, performCall, TraceUnavailableError, type GatewayDeps } from './call.js';
import { handleMcp } from './mcp.js';
import { handleWeb } from './web/routes.js';

export type { GatewayDeps };

const TOOLS_PATH = '/v1/tools';
const TOOL_PATH = /^\/v1\/tools\/([A-Za-z0-9_]{1,64})$/;
const MCP_PATH = '/mcp';

async function handleToolCall(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse, name: string): Promise<void> {
  const authenticated = await deps.identity.authenticate(req.headers);
  try {
    const { result, traceId } = await performCall(deps, 'http', req.headers, authenticated, name, () => readJsonBody(req));
    const body: ToolResponse = { text: result.text, reason_code: result.reasonCode, trace_id: traceId };
    sendJson(res, result.status, body);
  } catch (error) {
    if (!(error instanceof TraceUnavailableError)) throw error;
    sendJson(res, 500, { error: 'trace_unavailable' });
  }
}

/**
 * The gateway's HTTP surface: the catalog, the tool calls, the `/mcp` door, the pages and a health check.
 * Everything a tool call does is in `performCall`; this function only routes.
 */
export function createGatewayHandler(deps: GatewayDeps): RequestHandler {
  const catalog = { tools: catalogEntries(deps.tools) };

  return async (req, res) => {
    const path = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`).pathname;
    const method = req.method ?? 'GET';

    if (path === '/health') {
      if (method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
      return sendJson(res, 200, { status: 'ok', service: 'gateway' });
    }

    // The catalog holds no data from any system, so it needs no key.
    if (path === TOOLS_PATH) {
      if (method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
      return sendJson(res, 200, catalog);
    }

    const toolMatch = TOOL_PATH.exec(path);
    if (toolMatch !== null) {
      if (method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' });
      return handleToolCall(deps, req, res, toolMatch[1] ?? '');
    }

    if (path === MCP_PATH) return handleMcp(deps, req, res);

    // The pages people open from a link: login, the confirmation card and its two buttons.
    if (await handleWeb(deps, req, res, path)) return;

    sendJson(res, 404, { error: 'not_found' });
  };
}
