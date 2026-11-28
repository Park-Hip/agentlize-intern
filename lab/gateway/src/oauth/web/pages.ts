import { esc, layout, personaOptions } from '../../web/html.js';

/** What one scope asks for, in the words a person reads on the consent page. */
export interface ScopeView {
  readonly scope: string;
  readonly label: string;
  readonly description: string;
}

/** The data the client may receive, derived from the rule file rather than the request. */
export interface DataCeilingView {
  readonly clientClassLabel: string;
  readonly ceilingLabel: string;
  /** The labelled fields the ceiling keeps from this client, such as the personal ones. */
  readonly excludedFields: readonly string[];
  /** True when the directory or rule file could not be read, so no ceiling is shown. */
  readonly unavailable: boolean;
}

export interface LoginPageView {
  readonly action: string;
  readonly csrfToken: string;
  readonly selected: string;
  readonly error?: string | undefined;
}

/**
 * The simulated sign-in for an OAuth connection. It says "Đăng nhập giả lập"
 * in the title and again in the sentence, so nobody mistakes it for a real
 * account, and it names only page passwords as the way in (ADR-0008).
 */
export function oauthLoginPage(view: LoginPageView): string {
  const error = view.error === undefined ? '' : `<div class="banner bad" role="alert">${esc(view.error)}</div>\n`;
  return layout(
    'Đăng nhập giả lập',
    `<h1>Đăng nhập giả lập</h1>
<p class="sub">Một ứng dụng đang xin phép gọi công cụ của Lab thay bạn. Chọn nhân vật và dán mật khẩu trang của nhân vật đó. Đây không phải đăng nhập thật: cổng chỉ kiểm mật khẩu trang đúng người rồi mở một phiên ngắn. Khoá công cụ <code>lab_</code> không mở được trang này.</p>
${error}<form class="panel" method="post" action="${esc(view.action)}">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<label for="employee">Nhân vật</label>
<select id="employee" name="employee" required>
${personaOptions(view.selected)}
</select>
<label for="password">Mật khẩu trang</label>
<input id="password" name="password" type="password" autocomplete="off" required placeholder="trang_...">
<button type="submit">Đăng nhập giả lập</button>
</form>
<p class="meta">Mật khẩu trang không bao giờ được dán vào skill, chat hay công cụ của AI.</p>`,
  );
}

export interface ConsentPageView {
  readonly action: string;
  readonly csrfToken: string;
  readonly clientName: string;
  readonly accountLabel: string;
  readonly scopes: readonly ScopeView[];
  readonly ceiling: DataCeilingView;
}

/**
 * The connection consent page. It names the client, the signed-in person, the
 * scopes asked for and the data ceiling the client sits under, then offers the
 * two buttons. Nothing here confirms a business change, and no token, code or
 * secret ever reaches this page (oauth-plan sections 2 and 6).
 */
export function consentPage(view: ConsentPageView): string {
  const scopes =
    view.scopes.length === 0
      ? '<tr><td colspan="2">Ứng dụng không xin phạm vi nào ngoài đăng nhập.</td></tr>'
      : view.scopes
          .map(
            (scope) =>
              `<tr><td class="code" data-label="Phạm vi"><code>${esc(scope.scope)}</code></td><td class="v" data-label="Nghĩa"><strong>${esc(scope.label)}</strong>. ${esc(scope.description)}</td></tr>`,
          )
          .join('\n');

  const ceilingBody = view.ceiling.unavailable
    ? '<p>Cổng chưa đọc được danh bạ nên chưa nêu được trần dữ liệu chi tiết. Trần vẫn áp dụng khi gọi công cụ.</p>'
    : view.ceiling.excludedFields.length === 0
      ? '<p>Với trần này, ứng dụng nhận được mọi trường mà vai của bạn được xem.</p>'
      : `<p>Ứng dụng không nhận được các trường sau vì vượt trần dữ liệu:</p>
<ul>
${view.ceiling.excludedFields.map((field) => `<li>${esc(field)}</li>`).join('\n')}
</ul>`;

  return layout(
    'Cho phép kết nối',
    `<h1>Cho phép kết nối</h1>
<p class="sub">Ứng dụng <strong>${esc(view.clientName)}</strong> xin phép gọi công cụ của Lab thay nhân vật <strong>${esc(view.accountLabel)}</strong>.</p>
<section class="panel">
<h2>Phạm vi xin cấp</h2>
<table>
<thead><tr><th scope="col">Phạm vi</th><th scope="col">Nghĩa</th></tr></thead>
<tbody>
${scopes}
</tbody>
</table>
</section>
<section class="panel">
<h2>Trần dữ liệu</h2>
<p>Ứng dụng thuộc lớp <strong>${esc(view.ceiling.clientClassLabel)}</strong> nên chỉ nhận được tối đa <strong>${esc(view.ceiling.ceilingLabel)}</strong>.</p>
${ceilingBody}
</section>
<div class="banner" role="status">Đồng ý chỉ mở quyền gọi công cụ. Không có thay đổi nghiệp vụ nào được ghi, và mọi lần ghi vẫn phải được bạn xác nhận rồi trưởng nhóm duyệt khi luật đòi.</div>
<div class="actions">
<form method="post" action="${esc(view.action)}">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<input type="hidden" name="decision" value="allow">
<button type="submit">Cho phép</button>
</form>
<form method="post" action="${esc(view.action)}">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<input type="hidden" name="decision" value="deny">
<button type="submit" class="secondary">Từ chối</button>
</form>
</div>
<p class="meta">Bấm Từ chối để trả lời ứng dụng rằng bạn không đồng ý; không có quyền nào được cấp.</p>`,
  );
}
