import { performance } from 'node:perf_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReasonCode } from '@lab/shared';
import type { GatewayDeps, OAuthConnectionSource } from '../../call.js';
import { personLabel } from '../../proposals/card.js';
import { layout, messagePage } from '../../web/html.js';
import { readForm } from '../../web/form.js';
import {
  currentSession,
  loginAddress,
  redirect,
  refusalPage,
  sameOrigin,
  sendHtml,
  tokensEqual,
  traceStep,
} from '../../web/page-util.js';
import { SCOPE_LABELS } from './handler.js';

/** The two addresses of the connection page: the list and the disconnect press. */
export const CONNECTIONS_PATH = '/ket-noi';
export const CONNECTIONS_REVOKE_PATH = /^\/ket-noi\/([^/]+?)\/ngat$/;

/** One grant as the connection page shows it: the client, its scopes and its two moments. */
export interface ConnectionView {
  readonly grantId: string;
  readonly clientName: string;
  readonly scopes: readonly string[];
  readonly createdAtLabel: string;
  readonly expiresAtLabel: string;
  readonly status: 'active' | 'revoked' | 'expired' | 'disabled';
}

/** The signed-in person's own grants, the two calls that read and revoke them, and the client names. */
export interface ConnectionSource extends OAuthConnectionSource {
  readonly clients: readonly { readonly clientId: string; readonly clientName: string }[];
}

const SCOPE_ORDER = ['openid', 'mcp:read', 'mcp:propose'] as const;

function sortScopes(scopes: Iterable<string>): string[] {
  const rank = (scope: string): number => {
    const index = SCOPE_ORDER.indexOf(scope as (typeof SCOPE_ORDER)[number]);
    return index === -1 ? SCOPE_ORDER.length : index;
  };
  return [...new Set(scopes)].sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}

/** `HH:mm dd/MM/yyyy` in Vietnam time, so a person reads the moment as the wall clock shows it. */
function momentLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(date);
}

function statusOf(
  grant: { readonly revokedAt: string | null; readonly expiresAt: string },
  disabled: boolean,
  now: Date,
): ConnectionView['status'] {
  if (grant.revokedAt !== null) return 'revoked';
  if (disabled) return 'disabled';
  return Date.parse(grant.expiresAt) <= now.getTime() ? 'expired' : 'active';
}

/** The connection page's own view of one grant; a client is named by its registration, never by the grant row. */
export function connectionsOf(source: ConnectionSource, employeeId: string, now: Date): ConnectionView[] {
  const names = new Map(source.clients.map((client) => [client.clientId, client.clientName]));
  return source.listByEmployee(employeeId).map((grant) => ({
    grantId: grant.grantId,
    clientName: names.get(grant.clientId) ?? grant.clientId,
    scopes: sortScopes(grant.scope.split(/\s+/).filter((scope) => scope !== '')),
    createdAtLabel: momentLabel(grant.createdAt),
    expiresAtLabel: momentLabel(grant.expiresAt),
    status: statusOf(grant, source.isClientDisabled(grant.clientId), now),
  }));
}

const STATUS_WORDS: Readonly<Record<ConnectionView['status'], string>> = {
  active: 'Đang kết nối',
  revoked: 'Đã ngắt',
  expired: 'Đã hết hạn',
  disabled: 'Ứng dụng đã tắt',
};

/**
 * The page lists the signed-in person's grants only, each with the client name,
 * the scopes in words and a disconnect button. Nothing it shows comes from a
 * request parameter: the person is the page session's and the grants are read
 * from the grant table by that person (issue #182). It uses the gateway's
 * shared layout, so its colours, type and small-screen rules are the same ones
 * every other page already has.
 */
export function connectionsPage(view: {
  readonly viewerLabel: string;
  readonly connections: readonly ConnectionView[];
  readonly csrfToken: string;
}): string {
  const rows =
    view.connections.length === 0
      ? '<section class="panel"><p>Bạn chưa kết nối ứng dụng nào. Khi một ứng dụng xin quyền gọi công cụ, kết nối đó hiện ở đây.</p></section>'
      : `<section class="panel">
<table>
<thead><tr><th scope="col">Ứng dụng</th><th scope="col">Phạm vi</th><th scope="col">Kết nối lúc</th><th scope="col">Hết hạn</th><th scope="col">Trạng thái</th><th scope="col">Ngắt</th></tr></thead>
<tbody>
${view.connections
  .map((connection) => {
    const scopes =
      connection.scopes.length === 0
        ? '(không có)'
        : connection.scopes
            .map((scope) => `${SCOPE_LABELS[scope]?.label ?? scope} (<code>${scope}</code>)`)
            .join(', ');
    const button =
      connection.status === 'active'
        ? `<form method="post" action="/ket-noi/${connection.grantId}/ngat">
<input type="hidden" name="csrf" value="${view.csrfToken}">
<button type="submit" class="danger">Ngắt kết nối</button>
</form>`
        : '<span class="meta">Không còn hiệu lực</span>';
    return `<tr>
<td data-label="Ứng dụng">${connection.clientName}<br><span class="meta grant-code"><code>${connection.grantId}</code></span></td>
<td class="v" data-label="Phạm vi">${scopes}</td>
<td class="nowrap" data-label="Kết nối lúc">${connection.createdAtLabel}</td>
<td class="nowrap" data-label="Hết hạn">${connection.expiresAtLabel}</td>
<td class="nowrap" data-label="Trạng thái"><strong>${STATUS_WORDS[connection.status]}</strong></td>
<td class="nowrap" data-label="Ngắt">${button}</td>
</tr>`;
  })
  .join('\n')}
</tbody>
</table>
</section>`;

  return layout(
    'Kết nối ứng dụng',
    `<h1>Kết nối ứng dụng</h1>
<p class="sub">Đăng nhập giả lập: ${view.viewerLabel}. Trang này chỉ hiện kết nối của nhân vật đang đăng nhập; ngắt một kết nối thì ứng dụng đó thôi gọi công cụ của Lab thay bạn.</p>
${rows}
<p class="meta">Ngắt kết nối thu hồi lần cấp quyền đó và mọi thẻ truy cập của nó. Một đề xuất đã soạn bằng kết nối đó sẽ không gửi, không duyệt hay ghi tiếp được; lệnh đã phát đi giữ nguyên kết quả thật. Kết nối lại tạo một lần cấp quyền mới, không mở lại đề xuất cũ.</p>`,
    undefined,
    true,
  );
}

/** `Nguyễn Thị Hoa (NV-02)`, the same person format the consent page prints. */
function viewerPhrase(employeeId: string, label: string): string {
  return label === employeeId ? employeeId : `${label} (${employeeId})`;
}

/** The name half of `NV-02 Nguyễn Thị Hoa`, or the code when the directory did not answer. */
function nameOf(label: string, employeeId: string): string {
  return label.startsWith(`${employeeId} `) ? label.slice(employeeId.length + 1) : employeeId;
}

/**
 * The two pages of the connection list. It reuses the gateway's page session
 * and page password, so a press carries the same CSRF token as every other
 * page button, and the grants come from the OAuth store filtered by the person
 * the session names. Returns false for a path that is not one of them.
 */
export async function handleConnections(
  deps: GatewayDeps,
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): Promise<boolean> {
  if (path !== CONNECTIONS_PATH) {
    const match = CONNECTIONS_REVOKE_PATH.exec(path);
    if (match === null) return false;
    await handleRevoke(deps, req, res, match[1] ?? '');
    return true;
  }
  await handleList(deps, req, res);
  return true;
}

async function handleList(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    return sendHtml(res, 405, messagePage('Không hỗ trợ', 'Trang kết nối chỉ để xem.', 'bad'), { allow: 'GET' });
  }
  const active = currentSession(deps, req);
  if (active === undefined) return redirect(res, loginAddress(CONNECTIONS_PATH));

  const surface = deps.oauth?.();
  const store = surface?.connections;
  if (store === undefined) {
    return refusalPage(res, 503, null, 'Cổng chưa mở phần OAuth nên chưa có kết nối nào để xem.');
  }
  const source: ConnectionSource = {
    clients: surface?.clients ?? [],
    listByEmployee: (employeeId) => store.listByEmployee(employeeId),
    revoke: (grantId) => store.revoke(grantId),
    isClientDisabled: (clientId) => store.isClientDisabled(clientId),
  };

  const viewer = active.session.employeeId;
  const label = await personLabel(deps.adapters, viewer);
  sendHtml(
    res,
    200,
    connectionsPage({
      viewerLabel: viewerPhrase(viewer, nameOf(label, viewer)),
      connections: connectionsOf(source, viewer, deps.now()),
      csrfToken: active.session.csrfToken,
    }),
  );
}

async function handleRevoke(
  deps: GatewayDeps,
  req: IncomingMessage,
  res: ServerResponse,
  grantId: string,
): Promise<void> {
  const started = performance.now();
  const refuseWith = (status: number, code: ReasonCode | null, ruleId: string, sentence: string, grant: string | null): void => {
    traceStep(deps, started, {
      tool: 'oauth_disconnect',
      requester: currentSession(deps, req)?.session.employeeId ?? null,
      caller: null,
      grantId: grant,
      outcome: code === null ? 'error' : 'refused',
      reasonCode: code,
      ruleId,
    });
    refusalPage(res, status, code, sentence);
  };

  if (req.method !== 'POST') {
    return sendHtml(res, 405, messagePage('Không hỗ trợ', 'Nút ngắt kết nối chỉ nhận POST.', 'bad'), { allow: 'POST' });
  }
  if (!sameOrigin(deps, req)) {
    return refuseWith(403, 'NOT_PERMITTED', 'WEB.ORIGIN', 'Yêu cầu đến từ một trang khác nên bị từ chối.', null);
  }
  const active = currentSession(deps, req);
  if (active === undefined) {
    return refuseWith(401, 'NOT_PERMITTED', 'WEB.NO_SESSION', 'Bạn chưa đăng nhập nên chưa ngắt được kết nối. Hãy đăng nhập lại.', null);
  }
  const form = await readForm(req);
  const csrf = form?.get('csrf') ?? '';
  if (form === undefined || !tokensEqual(csrf, active.session.csrfToken)) {
    return refuseWith(403, 'NOT_PERMITTED', 'WEB.CSRF', 'Thiếu hoặc sai mã chống giả mạo. Hãy mở lại trang kết nối rồi bấm lại.', null);
  }

  const surface = deps.oauth?.();
  const store = surface?.connections;
  if (store === undefined) {
    return refuseWith(503, null, 'OAUTH.UNAVAILABLE', 'Cổng chưa mở phần OAuth nên chưa ngắt được kết nối.', null);
  }

  // The page session names the person; the grant must belong to that person.
  // A grant of another person is answered like a missing one, and only the
  // trace tells them apart, so a client cannot revoke someone else's grant.
  const owned = store.listByEmployee(active.session.employeeId).some((grant) => grant.grantId === grantId);
  if (!owned) {
    return refuseWith(404, null, 'OAUTH.NOT_YOUR_GRANT', `Không tìm thấy kết nối ${grantId} của bạn.`, null);
  }

  const changed = store.revoke(grantId);
  traceStep(deps, started, {
    tool: 'oauth_disconnect',
    requester: active.session.employeeId,
    caller: null,
    grantId,
    outcome: 'ok',
    reasonCode: null,
    ruleId: changed ? 'OAUTH.DISCONNECT' : 'OAUTH.ALREADY_REVOKED',
  });
  redirect(res, CONNECTIONS_PATH);
}
