import type { ServerResponse } from 'node:http';
import { EMPLOYEE_ID_PATTERN, PERSONAS } from '@lab/shared';
import { adapterOf, recordValue, SystemUnavailableError, type ResourceAdapter } from '../../adapters/index.js';
import type { GatewayDatabase } from '../../database.js';
import type { PagePasswordStore } from '../../identity/page-password-store.js';
import type { PolicyEngine } from '../../policy/index.js';
import { readForm } from '../../web/form.js';
import { INTERACTION_SECURITY_HEADERS, messagePage, type Tone } from '../../web/html.js';
import { originMatches } from '../../web/page-util.js';
import { OAUTH_INTERACTION_PREFIX } from '../discovery.js';
import type { OAuthInteractionContext, OAuthInteractionDetails, OAuthInteractionHandler } from '../interaction-types.js';
import type { OAuthClientRegistration } from '../provider.js';
import { OAuthPageCsrfStore } from './csrf-store.js';
import { consentPage, oauthLoginPage, type DataCeilingView, type ScopeView } from './pages.js';

/** A form token lives as long as the interaction it belongs to (oauth-plan section 6). */
export const INTERACTION_CSRF_TTL_MS = 60 * 60 * 1000;

/** One everyday word for each scope, so the consent page reads without the protocol in mind. */
const SCOPE_LABELS: Readonly<Record<string, { label: string; description: string }>> = {
  openid: { label: 'Xác nhận danh tính', description: 'Cho ứng dụng biết bạn đang dùng nhân vật giả nào.' },
  'mcp:read': { label: 'Đọc dữ liệu', description: 'Gọi các công cụ đọc của Lab, ví dụ tra danh bạ và xem task.' },
  'mcp:propose': {
    label: 'Soạn đề xuất',
    description: 'Soạn đề xuất thay đổi; chưa ghi gì cho tới khi bạn bấm Gửi và trưởng nhóm duyệt khi luật đòi.',
  },
};

const CLIENT_CLASS_LABELS: Readonly<Record<string, string>> = {
  appota_hosted: 'do Appota vận hành',
  vendor_hosted: 'do một hãng ngoài vận hành',
  user_device: 'chạy trên máy cá nhân',
};

const DATA_CLASS_LABELS: Readonly<Record<string, string>> = {
  aggregate_anonymous: 'số liệu tổng hợp ẩn danh',
  internal_general: 'dữ liệu nội bộ chung',
  employee_personal: 'dữ liệu cá nhân nhân viên',
  customer_personal: 'dữ liệu cá nhân khách hàng',
  payment: 'dữ liệu thanh toán',
};

const SCOPE_ORDER = ['openid', 'mcp:read', 'mcp:propose'] as const;

/** The people the login page offers: the six simulated characters of the lab. */
const LOGIN_PEOPLE = Object.values(PERSONAS).map((persona) => ({
  employeeId: persona.employeeId,
  fullName: persona.fullName,
}));

export interface OAuthInteractionPageOptions {
  readonly db: GatewayDatabase;
  /** The one store of page passwords; a `lab_` tool key is never looked up here (ADR-0008). */
  readonly pagePasswords: PagePasswordStore;
  readonly clients: readonly OAuthClientRegistration[];
  readonly adapters: readonly ResourceAdapter[];
  readonly policy: PolicyEngine;
  /** The address the pages are served on, compared against the `Origin` of every form post. */
  readonly issuer: string;
  /** Receives refusals only, never a password, a token, a code or a secret. */
  readonly log?: ((line: string) => void) | undefined;
}

interface PersonView {
  readonly label: string;
  readonly role: string | null;
}

function sortScopes(scopes: Iterable<string>): string[] {
  const rank = (scope: string): number => {
    const index = SCOPE_ORDER.indexOf(scope as (typeof SCOPE_ORDER)[number]);
    return index === -1 ? SCOPE_ORDER.length : index;
  };
  return [...new Set(scopes)].sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * The scopes the person is being asked to add: the OIDC scopes and the resource
 * scopes the provider reports as missing. Reading only the prompt details means
 * the page never trusts a `scope` the form could carry (issue #181).
 */
function scopesAsked(details: OAuthInteractionDetails): string[] {
  const collected = new Set<string>(stringArray(details.promptDetails['missingOIDCScope']));
  const resources = details.promptDetails['missingResourceScopes'];
  if (typeof resources === 'object' && resources !== null && !Array.isArray(resources)) {
    for (const list of Object.values(resources as Record<string, unknown>)) {
      for (const scope of stringArray(list)) collected.add(scope);
    }
  }
  if (collected.size === 0) {
    for (const scope of (details.params['scope'] ?? '').split(/\s+/)) {
      if (scope !== '') collected.add(scope);
    }
  }
  return sortScopes(collected);
}

function toScopeViews(scopes: readonly string[]): ScopeView[] {
  return scopes.map((scope) => {
    const known = SCOPE_LABELS[scope];
    return known === undefined
      ? { scope, label: scope, description: 'Phạm vi do ứng dụng khai; cổng chỉ cấp phạm vi đã biết.' }
      : { scope, label: known.label, description: known.description };
  });
}

function dataClassLabel(value: string | null): string {
  return value === null ? 'chưa rõ' : (DATA_CLASS_LABELS[value] ?? value);
}

/**
 * The simulated login and consent pages of the OAuth connection. It reads the
 * interaction the router resolved and writes the one page for it. Every value
 * the pages show comes from the server: the client from its registration, the
 * person from the signed-in session, the scopes from the prompt details and the
 * ceiling from the rule file. The forms carry only a CSRF token plus the
 * employee password or the allow/deny choice, so a client id, callback, scope,
 * resource or employee cannot be swapped from the browser (issue #181).
 */
export function createOAuthInteractionPages(options: OAuthInteractionPageOptions): OAuthInteractionHandler {
  const csrf = new OAuthPageCsrfStore(options.db);
  const log = options.log ?? (() => undefined);

  function send(res: ServerResponse, status: number, html: string): void {
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...INTERACTION_SECURITY_HEADERS,
    });
    res.end(html);
  }

  function refuse(res: ServerResponse, status: number, message: string, tone: Tone = 'bad'): void {
    send(res, status, messagePage('Chưa thực hiện', message, tone));
  }

  function actionFor(uid: string): string {
    return `${OAUTH_INTERACTION_PREFIX}${uid}`;
  }

  function loginPage(details: OAuthInteractionDetails, selected: string, error?: string): string {
    return oauthLoginPage({
      action: actionFor(details.uid),
      csrfToken: csrf.tokenFor(details.uid, INTERACTION_CSRF_TTL_MS),
      people: LOGIN_PEOPLE,
      selected,
      ...(error === undefined ? {} : { error }),
    });
  }

  async function personView(employeeId: string): Promise<PersonView> {
    try {
      const directory = adapterOf(options.adapters, 'employee');
      const record = await directory.get(employeeId);
      if (record === undefined) return { label: employeeId, role: null };
      const name = recordValue(record, directory.fields, 'name');
      const role = recordValue(record, directory.fields, 'role');
      return {
        label: typeof name === 'string' ? `${employeeId} ${name}` : employeeId,
        role: typeof role === 'string' ? role : null,
      };
    } catch (error) {
      if (!(error instanceof SystemUnavailableError)) throw error;
      return { label: employeeId, role: null };
    }
  }

  /**
   * The fields this person would see but the client ceiling removes, read from
   * the rule file. It names only the excluded fields, not the whole schema, so
   * the page states the ceiling without dumping every record's fields.
   */
  function ceilingView(client: OAuthClientRegistration, role: string | null): DataCeilingView {
    const clientClassLabel = CLIENT_CLASS_LABELS[client.caller] ?? client.caller;
    const employeeGate = options.policy.allowedFields(role ?? 'staff', 'employee', client.caller);
    if (role === null || !employeeGate.clientDeclared || employeeGate.ceiling === null) {
      return {
        clientClassLabel,
        ceilingLabel: dataClassLabel(employeeGate.ceiling),
        excludedFields: [],
        unavailable: true,
      };
    }

    const excluded = new Set<string>();
    for (const adapter of options.adapters) {
      const decision = options.policy.allowedFields(role, adapter.type, client.caller);
      for (const field of decision.droppedByClient) {
        excluded.add(adapter.fields.find((candidate) => candidate.name === field)?.label ?? field);
      }
    }
    return {
      clientClassLabel,
      ceilingLabel: dataClassLabel(employeeGate.ceiling),
      excludedFields: [...excluded],
      unavailable: false,
    };
  }

  async function handleLogin(context: OAuthInteractionContext): Promise<void> {
    const { req, res, details } = context;
    if (context.method === 'GET') {
      send(res, 200, loginPage(details, ''));
      return;
    }

    if (!originMatches(options.issuer, req)) {
      log('oauth interaction: login refused, the Origin does not match the gateway');
      refuse(res, 403, 'Yêu cầu đến từ một trang khác nên bị từ chối.');
      return;
    }
    const form = await readForm(req);
    if (form === undefined) {
      refuse(res, 400, 'Nội dung gửi lên không đọc được.');
      return;
    }
    if (!csrf.verify(details.uid, form.get('csrf') ?? '')) {
      log('oauth interaction: login refused, the CSRF token is missing or wrong');
      refuse(res, 403, 'Thiếu hoặc sai mã chống giả mạo. Hãy mở lại trang đăng nhập rồi thử lại.');
      return;
    }

    const employee = form.get('employee') ?? '';
    const password = form.get('password') ?? '';
    // Only a page password signs in here. A `lab_` tool key never matches a page password (ADR-0008).
    const record =
      EMPLOYEE_ID_PATTERN.test(employee) && password !== ''
        ? options.pagePasswords.findByRawPassword(password)
        : undefined;
    if (record === undefined || record.revokedAt !== null || record.employeeId !== employee) {
      send(
        res,
        401,
        loginPage(
          details,
          employee,
          'Mật khẩu trang không đúng với nhân vật này. Hãy kiểm tra lại, hoặc xin người quản lý Lab cấp mật khẩu trang mới.',
        ),
      );
      return;
    }

    // The form is spent once it opens a login, and the provider starts a fresh
    // session for that result, so a pre-set session cannot be fixed (resume.js).
    csrf.end(details.uid);
    await context.login(record.employeeId);
  }

  async function handleConsent(context: OAuthInteractionContext): Promise<void> {
    const { req, res, details } = context;
    const accountId = details.accountId;
    if (accountId === null) {
      refuse(res, 400, 'Phiên đăng nhập không còn. Hãy quay lại ứng dụng và bắt đầu kết nối lại.');
      return;
    }
    const client = options.clients.find((candidate) => candidate.clientId === details.clientId);
    if (client === undefined) {
      log('oauth interaction: consent refused, the client is not registered');
      refuse(res, 400, 'Cổng không nhận ra ứng dụng đang xin quyền.');
      return;
    }

    if (context.method === 'GET') {
      const person = await personView(accountId);
      send(
        res,
        200,
        consentPage({
          action: actionFor(details.uid),
          csrfToken: csrf.tokenFor(details.uid, INTERACTION_CSRF_TTL_MS),
          clientName: client.clientName,
          accountLabel: person.label,
          scopes: toScopeViews(scopesAsked(details)),
          ceiling: ceilingView(client, person.role),
        }),
      );
      return;
    }

    if (!originMatches(options.issuer, req)) {
      log('oauth interaction: consent refused, the Origin does not match the gateway');
      refuse(res, 403, 'Yêu cầu đến từ một trang khác nên bị từ chối.');
      return;
    }
    const form = await readForm(req);
    if (form === undefined) {
      refuse(res, 400, 'Nội dung gửi lên không đọc được.');
      return;
    }
    if (!csrf.verify(details.uid, form.get('csrf') ?? '')) {
      log('oauth interaction: consent refused, the CSRF token is missing or wrong');
      refuse(res, 403, 'Thiếu hoặc sai mã chống giả mạo. Hãy mở lại trang đồng ý rồi thử lại.');
      return;
    }

    const decision = form.get('decision');
    if (decision !== 'allow' && decision !== 'deny') {
      refuse(res, 400, 'Lựa chọn không hợp lệ. Hãy mở lại trang đồng ý rồi thử lại.');
      return;
    }
    csrf.end(details.uid);
    if (decision === 'deny') {
      // `access_denied` travels back to the client with the state and the issuer
      // the provider stored; no usable token follows (oauth-plan section 3).
      await context.deny('Người dùng từ chối kết nối ứng dụng.');
      return;
    }
    await context.approve();
  }

  return {
    async handle(context: OAuthInteractionContext): Promise<void> {
      if (context.details.prompt === 'login') {
        await handleLogin(context);
        return;
      }
      if (context.details.prompt === 'consent') {
        await handleConsent(context);
        return;
      }
      refuse(context.res, 501, 'Cổng chỉ xử lý đăng nhập và đồng ý kết nối.');
    },
  };
}
