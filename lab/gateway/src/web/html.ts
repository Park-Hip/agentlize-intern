import { PERSONAS } from '@lab/shared';
import { formatClock, type CardRow } from '../proposals/card.js';
import type { ProposalStatus } from '../proposals/index.js';
import type { WriteCommand } from '../writes/command-store.js';

/** Escape the five characters that can open a tag or leave an attribute. Every value that reaches a page goes through this. */
export function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * The headers every page of the lab sends: nothing loads from outside, nothing
 * can be framed, and the browser does not guess a content type. The console
 * sends the same set (ADR-0006 section 3.1).
 *
 * `same-origin` rather than `no-referrer`: Chrome sends `Origin: null` on a form
 * POST when the page says `no-referrer`, and the Origin check of the buttons and
 * the confirmation pages would then refuse every real browser. `same-origin`
 * still sends no referrer to another site, and the CSP already forbids loading
 * anything from one.
 */
export const PAGE_SECURITY_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
} as const;

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--panel:#fff;--text:#1b1f24;--muted:#5b6570;--line:#d8dde3;--accent:#0b5fff;--accent-text:#fff;--warn-bg:#fff4d6;--warn-line:#e3b341;--ok-bg:#e4f6e9;--ok-line:#3fa65f;--bad-bg:#fde8e8;--bad-line:#d65454}
@media (prefers-color-scheme:dark){:root{--bg:#14171a;--panel:#1d2126;--text:#e8ebee;--muted:#9aa5b1;--line:#343b43;--accent:#5b92ff;--accent-text:#0a0f1a;--warn-bg:#3a3017;--warn-line:#8a6d1c;--ok-bg:#172a1d;--ok-line:#2f7a47;--bad-bg:#3a1c1c;--bad-line:#9c3d3d}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:44rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.4rem;line-height:1.25;margin:0 0 .25rem}
h2{font-size:1.05rem;line-height:1.3;margin:0 0 .5rem}
.sub{color:var(--muted);margin:0 0 1.25rem}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:.6rem;padding:1rem 1.1rem;margin:0 0 1rem}
.banner{border:1px solid var(--warn-line);background:var(--warn-bg);border-radius:.6rem;padding:.6rem .9rem;margin:0 0 1rem;font-size:.95rem}
.banner.ok{border-color:var(--ok-line);background:var(--ok-bg)}
.banner.bad{border-color:var(--bad-line);background:var(--bad-bg)}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;vertical-align:top;padding:.5rem .6rem;border-bottom:1px solid var(--line)}
thead th{font-size:.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
tbody th{font-weight:600;color:var(--muted)}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
td.v{white-space:pre-wrap;overflow-wrap:anywhere}
td.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap}
@media (max-width:40rem){
thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
table,tbody,tr,th,td{display:block;width:auto}
tbody th{padding:.7rem 0 .15rem;border-bottom:0}
tbody td{padding:.1rem 0 .4rem;border-bottom:0}
tbody td::before{content:attr(data-label);display:block;font-size:.75rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
tbody tr{border-bottom:1px solid var(--line)}
tbody tr:last-child{border-bottom:0}
}
.meta{color:var(--muted);font-size:.9rem;margin:.75rem 0 0}
label{display:block;font-weight:600;margin:0 0 .25rem}
select,input[type=password],textarea{width:100%;font:inherit;padding:.55rem .6rem;border:1px solid var(--line);border-radius:.45rem;background:var(--bg);color:var(--text);margin:0 0 .9rem}
textarea{min-height:5rem;resize:vertical}
.actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:1rem 0 0}
.actions form{margin:0}
button{font:inherit;font-weight:600;padding:.6rem 1.2rem;border-radius:.45rem;border:1px solid var(--accent);background:var(--accent);color:var(--accent-text);cursor:pointer}
button.secondary{background:transparent;color:var(--accent)}
button.danger{border-color:var(--bad-line);background:transparent;color:var(--bad-line)}
button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
footer{color:var(--muted);font-size:.85rem;margin-top:1.5rem}
`;

export function layout(title: string, body: string, refreshSeconds?: number): string {
  const refresh = refreshSeconds === undefined ? '' : `<meta http-equiv="refresh" content="${refreshSeconds}">\n`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${refresh}<title>${esc(title)} - Lab kết nối</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
<footer>Lab kết nối AI: dữ liệu giả, chỉ chạy thử.</footer>
</main>
</body>
</html>
`;
}

export type Tone = 'info' | 'ok' | 'bad';

export function banner(text: string, tone: Tone): string {
  return `<div class="banner${tone === 'info' ? '' : ` ${tone}`}" role="${tone === 'bad' ? 'alert' : 'status'}">${esc(text)}</div>`;
}

/** A page that only says one thing: a refusal, an error or a finished step. */
export function messagePage(title: string, message: string, tone: Tone, link?: { href: string; label: string }): string {
  const next = link === undefined ? '' : `<p><a href="${esc(link.href)}">${esc(link.label)}</a></p>`;
  return layout(title, `<h1>${esc(title)}</h1>\n${banner(message, tone)}\n${next}`);
}

export function loginPage(next: string, error?: string, selected?: string): string {
  const options = Object.values(PERSONAS)
    .map((persona) => `<option value="${esc(persona.employeeId)}"${persona.employeeId === selected ? ' selected' : ''}>${esc(persona.fullName)} (${esc(persona.employeeId)})</option>`)
    .join('\n');
  return layout(
    'Đăng nhập giả lập',
    `<h1>Đăng nhập giả lập</h1>
<p class="sub">Chọn nhân vật và dán mật khẩu trang của nhân vật đó. Đây không phải đăng nhập thật: cổng chỉ kiểm mật khẩu trang đúng người rồi cấp một phiên 15 phút. Khoá công cụ <code>lab_</code> không mở được trang này.</p>
${error === undefined ? '' : banner(error, 'bad')}
<form class="panel" method="post" action="/dang-nhap">
<label for="employee">Nhân vật</label>
<select id="employee" name="employee" required>
${options}
</select>
<label for="password">Mật khẩu trang</label>
<input id="password" name="password" type="password" autocomplete="off" required placeholder="trang_...">
<input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Đăng nhập giả lập</button>
</form>
<p class="meta">Trưởng nhóm mở <a href="/cho-duyet">hộp Chờ tôi duyệt</a> sau khi đăng nhập.</p>`,
  );
}

/** One item of a proposal: its rows and, after a write starts, the result of its own write command. */
export interface CardItemView {
  readonly position: number;
  readonly recordId: string;
  readonly rows: readonly CardRow[];
  readonly command?: WriteCommand | undefined;
}

export interface CardView {
  readonly proposalId: string;
  readonly requesterLabel: string;
  readonly items: readonly CardItemView[];
  /** The deadline of the step the proposal is on: Gửi for a draft, the lead for a waiting one. */
  readonly expiresAtLabel: string;
  readonly status: ProposalStatus;
  readonly requiresApproval: boolean;
  /** `2 giờ`, from `approval.wait_minutes`. */
  readonly waitLabel: string;
  /** Names of the people the rule file lets approve this request now. */
  readonly approvers: readonly string[];
  readonly approvalExpiresAtLabel: string | null;
  readonly approval: { readonly actorLabel: string; readonly decision: 'approve' | 'reject'; readonly reason: string | null } | null;
  readonly csrfToken: string;
}

const STATUS_BANNER: Readonly<Record<'cancelled' | 'expired', { text: string; tone: Tone }>> = {
  cancelled: { text: 'Đề xuất đã bị huỷ. Hãy nhờ AI soạn lại với nội dung đã sửa.', tone: 'info' },
  expired: { text: 'CHƯA THỰC HIỆN [APPROVAL_EXPIRED] Đề xuất đã hết hạn. Hãy nhờ AI soạn lại.', tone: 'bad' },
};

/** What the page says about the write command: written, still unknown, or not carried out with the reason. */
const COMMAND_BANNER: Readonly<Record<string, { text: string; tone: Tone }>> = {
  TARGET_CHANGED: {
    text: 'CHƯA THỰC HIỆN [TARGET_CHANGED] Bản ghi đã bị người khác sửa sau khi đề xuất được soạn nên cổng không ghi. Hãy nhờ AI soạn lại với dữ liệu mới.',
    tone: 'bad',
  },
  CONTENT_CHANGED: {
    text: 'CHƯA THỰC HIỆN [CONTENT_CHANGED] Nội dung đề xuất không còn khớp với lúc soạn nên cổng không ghi. Hãy nhờ AI soạn lại.',
    tone: 'bad',
  },
  GATEWAY_UNAVAILABLE: {
    text: 'CHƯA THỰC HIỆN [GATEWAY_UNAVAILABLE] Hệ thống đích từ chối lệnh hoặc trả lời không đọc được nên cổng không ghi. Hãy báo người vận hành Lab.',
    tone: 'bad',
  },
};

function resultOf(item: CardItemView): string {
  const command = item.command;
  if (command === undefined || command.status === 'not_sent') return 'Chưa gửi';
  if (command.status === 'sent_unknown') return `Đang gửi lại (lần ${command.attempts})`;
  if (command.status === 'done') return `Đã ghi (lần ${command.attempts})`;
  return command.reasonCode === null ? 'Bị bỏ qua' : `Bị bỏ qua (${command.reasonCode})`;
}

/** The "lần gửi lại kế tiếp" cell: a clock time for a waiting send, and a word for the other states. */
function retryOf(item: CardItemView): string {
  const command = item.command;
  if (command === undefined || command.status === 'done' || command.status === 'failed') return '-';
  if (command.status === 'not_sent') return 'Ngay';
  if (command.nextAttemptAt === null) return 'Đang gửi';
  return formatClock(new Date(command.nextAttemptAt));
}

function confirmedBanner(
  items: readonly CardItemView[],
  approval: { readonly actorLabel: string; readonly decision: 'approve' | 'reject'; readonly reason: string | null } | null,
): { text: string; tone: Tone } {
  const total = items.length;
  const commands = items.map((item) => item.command);
  const done = commands.filter((command) => command?.status === 'done').length;
  const unknown = commands.filter((command) => command?.status === 'sent_unknown').length;
  const waiting = commands.filter((command) => command === undefined || command.status === 'not_sent').length;
  const approved = approval?.decision === 'approve' ? `${approval.actorLabel} đã duyệt. ` : '';

  if (waiting === total) {
    return { text: `${approved}Đã xác nhận đề xuất. Cổng chưa gửi lệnh ghi.`, tone: 'info' };
  }

  if (total === 1) {
    const item = items[0];
    const command = item?.command;
    if (item === undefined || command === undefined) {
      return { text: `${approved}Đã xác nhận đề xuất. Cổng chưa gửi lệnh ghi.`, tone: 'info' };
    }
    if (command.status === 'sent_unknown') {
      return {
        text: `${approved}Cổng đã gửi lệnh nhưng chưa nhận được kết quả. Cổng giữ lệnh và gửi lại với đúng mã cũ, nên bản ghi không bị ghi hai lần. Trang tự cập nhật khi có kết quả.`,
        tone: 'info',
      };
    }
    if (command.status === 'done') {
      return { text: `${approved}Đã ghi thay đổi vào ${item.recordId} ở lần gửi thứ ${command.attempts}.`, tone: 'ok' };
    }
    const known = command.reasonCode === null ? undefined : COMMAND_BANNER[command.reasonCode];
    return known ?? { text: 'Không ghi được: lệnh ghi không thành công. Cột Kết quả nói lý do. Hãy báo người vận hành Lab.', tone: 'bad' };
  }

  if (done === total) return { text: `${approved}Xong hết: đã ghi ${done} trên ${total} mục.`, tone: 'ok' };
  const skipped = total - done - unknown - waiting;
  if (unknown > 0 || waiting > 0) {
    const next = items.find((item) => item.command?.status === 'sent_unknown' && item.command.nextAttemptAt !== null);
    const when =
      next?.command?.nextAttemptAt == null
        ? ''
        : ` Lần gửi lại kế tiếp lúc ${formatClock(new Date(next.command.nextAttemptAt))}.`;
    const left = skipped > 0 ? ` ${skipped} mục bị bỏ qua.` : '';
    return {
      text: `${approved}Đang chạy nền: đã chuyển ${done} trên ${total} mục.${left}${when} Trang tự cập nhật mỗi 2 giây.`,
      tone: 'info',
    };
  }

  if (done > 0) {
    return {
      text: `${approved}Xong một phần: đã ghi ${done} trên ${total} mục; ${skipped} mục bị bỏ qua. Cột Kết quả nói lý do từng mục.`,
      tone: 'bad',
    };
  }
  return {
    text: `Không ghi được mục nào trong ${total} mục. Cột Kết quả nói lý do từng mục.`,
    tone: 'bad',
  };
}

/** The item table of a proposal; results and retry times appear once the write has started. */
export function itemsTable(items: readonly CardItemView[], showResults: boolean): string {
  if (!showResults) {
    const rows = items
      .flatMap((item) => {
        const itemRows = item.rows.length === 0 ? [{ label: '-', before: '', after: '' }] : item.rows;
        return itemRows.map(
          (row) =>
            `<tr><td class="code" data-label="Mục">${esc(item.recordId)}</td><th scope="row">${esc(row.label)}</th><td class="v" data-label="Hiện tại">${esc(row.before === '' ? '(trống)' : row.before)}</td><td class="v" data-label="Đề xuất">${esc(row.after)}</td></tr>`,
        );
      })
      .join('\n');
    return `<table>
<thead><tr><th scope="col">Mục</th><th scope="col">Trường</th><th scope="col">Hiện tại</th><th scope="col">Đề xuất</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
  }

  const rows = items
    .flatMap((item) => {
      // The retry column belongs to the item, so it spans the item's field rows.
      const itemRows = item.rows.length === 0 ? [{ label: '-', before: '', after: '' }] : item.rows;
      return itemRows.map((row, index) => {
        const retry =
          index === 0
            ? `<td class="v" rowspan="${itemRows.length}" data-label="Lần gửi lại kế tiếp">${esc(retryOf(item))}</td>`
            : '';
        return `<tr><td class="code" data-label="Mục">${esc(item.recordId)}</td><th scope="row">${esc(row.label)}</th><td class="v" data-label="Hiện tại">${esc(row.before === '' ? '(trống)' : row.before)}</td><td class="v" data-label="Đề xuất">${esc(row.after)}</td><td class="v" data-label="Kết quả">${esc(resultOf(item))}</td>${retry}</tr>`;
      });
    })
    .join('\n');

  return `<table>
<thead><tr><th scope="col">Mục</th><th scope="col">Trường</th><th scope="col">Hiện tại</th><th scope="col">Đề xuất</th><th scope="col">Kết quả</th><th scope="col">Lần gửi lại kế tiếp</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

/** `Nguyễn Thị Hoa hoặc Trần Văn Quang`, or the fallback when the directory named none. */
function approverList(names: readonly string[]): string {
  return names.length === 0 ? 'trưởng nhóm cùng phòng' : names.join(' hoặc ');
}

/** The confirmation card. Every value on it was read from the systems by the gateway, none is the agent's wording. */
export function cardPage(view: CardView): string {
  const count = view.items.length;
  const title = count === 1 ? `Xác nhận thay đổi ${view.items[0]?.recordId ?? ''}` : `Xác nhận thay đổi ${count} mục`;
  const pending = `<div class="actions">
<form method="post" action="/xac-nhan/${esc(view.proposalId)}/gui">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<button type="submit">Gửi</button>
</form>
<form method="post" action="/xac-nhan/${esc(view.proposalId)}/huy">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<button type="submit" class="secondary">Sửa (huỷ đề xuất này)</button>
</form>
</div>
<p class="meta">Bấm Gửi để cổng nhận lệnh. Bấm Sửa để huỷ đề xuất này; bạn nhờ AI soạn lại và sẽ nhận một link mới.</p>`;
  const requirement =
    view.status === 'awaiting_confirmation' && view.requiresApproval
      ? banner(
          `Việc này cần trưởng nhóm duyệt. Bấm Gửi để chuyển đề xuất sang hộp chờ duyệt; hạn duyệt là ${view.waitLabel} tính từ lúc bấm. Người duyệt: ${approverList(view.approvers)}.`,
          'info',
        )
      : '';
  const actions = view.status === 'awaiting_confirmation' ? pending : '';
  let result = '';
  if (view.status === 'awaiting_approval') {
    const deadline = view.approvalExpiresAtLabel === null ? '' : `, hạn ${view.approvalExpiresAtLabel}`;
    result = banner(`Đang chờ ${approverList(view.approvers)} duyệt${deadline}. Chưa có gì được ghi vào hệ thống.`, 'info');
  } else if (view.status === 'rejected') {
    const reason = view.approval?.reason;
    result = banner(
      `${view.approval?.actorLabel ?? 'Trưởng nhóm'} đã từ chối đề xuất này nên không có gì được ghi.${reason === null || reason === undefined ? '' : ` Lý do: ${reason}`} Hãy nhờ AI soạn lại nếu vẫn cần.`,
      'bad',
    );
  } else if (view.status === 'confirmed') {
    const info = confirmedBanner(view.items, view.approval);
    result = banner(info.text, info.tone);
  } else if (view.status !== 'awaiting_confirmation') {
    const info = STATUS_BANNER[view.status];
    result = banner(info.text, info.tone);
  }

  // While the background loop still has an item, the page reloads itself so the person sees the count move.
  const inProgress =
    view.status === 'confirmed' &&
    view.items.some((item) => item.command === undefined || item.command.status === 'not_sent' || item.command.status === 'sent_unknown');

  return layout(
    title,
    `<h1>${esc(title)}</h1>
<p class="sub">Người yêu cầu: ${esc(view.requesterLabel)}</p>
${requirement}${result}
<div class="panel">
${itemsTable(view.items, view.status === 'confirmed')}
<p class="meta">Mã đề xuất <code>${esc(view.proposalId)}</code>. ${esc(view.approvalExpiresAtLabel === null ? 'Hết hạn' : 'Hạn duyệt')} lúc ${esc(view.expiresAtLabel)}.</p>
</div>
${actions}`,
    inProgress ? 2 : undefined,
  );
}

/** One waiting proposal as the inbox lists it. */
export interface ApprovalListItem {
  readonly proposalId: string;
  readonly requesterLabel: string;
  readonly summary: string;
  readonly expiresAtLabel: string;
  readonly expired: boolean;
}

export interface ApprovalInboxView {
  readonly viewerLabel: string;
  readonly waitLabel: string;
  readonly items: readonly ApprovalListItem[];
}

/** The lead's inbox: the proposals this person may answer, newest deadline first. */
export function approvalInboxPage(view: ApprovalInboxView): string {
  const rows =
    view.items.length === 0
      ? ''
      : view.items
          .map(
            (item) => `<tr>
<td class="code" data-label="Đề xuất"><a href="/duyet/${esc(item.proposalId)}"><code>${esc(item.proposalId)}</code></a></td>
<td data-label="Người yêu cầu">${esc(item.requesterLabel)}</td>
<td data-label="Nội dung">${esc(item.summary)}</td>
<td data-label="Hạn duyệt">${esc(item.expiresAtLabel)}</td>
<td data-label="Trạng thái">${item.expired ? '<strong>Đã hết hạn</strong>' : 'Đang chờ'}</td>
</tr>`,
          )
          .join('\n');
  const body =
    view.items.length === 0
      ? '<section class="panel"><p>Không có đề xuất nào chờ bạn duyệt.</p></section>'
      : `<section class="panel">
<table>
<thead><tr><th scope="col">Đề xuất</th><th scope="col">Người yêu cầu</th><th scope="col">Nội dung</th><th scope="col">Hạn duyệt</th><th scope="col">Trạng thái</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</section>`;
  return layout(
    'Chờ tôi duyệt',
    `<h1>Chờ tôi duyệt</h1>
<p class="sub">Đăng nhập giả lập: ${esc(view.viewerLabel)}. Danh sách chỉ gồm đề xuất vai của bạn được duyệt; mỗi đề xuất có hạn ${esc(view.waitLabel)} tính từ lúc người yêu cầu bấm Gửi.</p>
${body}
<p class="meta">Không có thông báo qua Lark, email hay chat. Hộp này chỉ để xem; mọi lần duyệt đều là một lần bấm có mã chống giả mạo.</p>`,
  );
}

export interface ApprovalPageView {
  readonly proposalId: string;
  readonly requesterLabel: string;
  readonly reason: string;
  readonly expiresAtLabel: string | null;
  readonly waitLabel: string;
  readonly status: ProposalStatus;
  readonly self: boolean;
  readonly items: readonly CardItemView[];
  readonly approval: { readonly actorLabel: string; readonly decision: 'approve' | 'reject'; readonly reason: string | null } | null;
  readonly csrfToken: string;
}

/** The lead's page for one proposal: every item, who asked, why, the deadline and the two buttons. */
export function approvalPage(view: ApprovalPageView): string {
  const count = view.items.length;
  const title = count === 1 ? `Duyệt thay đổi ${view.items[0]?.recordId ?? ''}` : `Duyệt thay đổi ${count} mục`;
  let state: string;
  if (view.status === 'awaiting_approval') {
    if (view.self) {
      state = banner('Bạn là người yêu cầu nên không tự duyệt được. Hãy nhờ một trưởng nhóm khác cùng phòng.', 'bad');
    } else {
      state = `<div class="panel">
<div class="actions">
<form method="post" action="/duyet/${esc(view.proposalId)}/duyet">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<button type="submit">Duyệt</button>
</form>
</div>
<p class="meta">Duyệt xong thì cổng tạo lệnh ghi trong cùng giao dịch và gửi chúng ở chế độ nền. Từ chối thì không có gì được ghi và lý do của bạn hiện cho người yêu cầu.</p>
</div>
<form class="panel" method="post" action="/duyet/${esc(view.proposalId)}/tu-choi">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<h2>Từ chối đề xuất</h2>
<label for="reason">Lý do từ chối (tuỳ chọn, tối đa 500 ký tự)</label>
<textarea id="reason" name="reason" maxlength="500"></textarea>
<button type="submit" class="danger">Từ chối</button>
</form>`;
    }
  } else if (view.status === 'confirmed') {
    const info = confirmedBanner(view.items, view.approval);
    state = banner(info.text, info.tone);
  } else if (view.status === 'rejected') {
    const reason = view.approval?.reason;
    state = banner(
      `${view.approval?.actorLabel ?? 'Trưởng nhóm'} đã từ chối đề xuất này.${reason === null || reason === undefined ? '' : ` Lý do: ${reason}`}`,
      'bad',
    );
  } else if (view.status === 'expired') {
    state = banner('CHƯA THỰC HIỆN [APPROVAL_EXPIRED] Đề xuất đã hết hạn chờ duyệt nên không ghi được. Người yêu cầu cần nhờ AI soạn lại.', 'bad');
  } else if (view.status === 'cancelled') {
    state = banner('Người yêu cầu đã huỷ đề xuất này nên không còn gì để duyệt.', 'info');
  } else {
    state = banner('Đề xuất chưa được người yêu cầu bấm Gửi nên chưa vào bước duyệt.', 'info');
  }

  const inProgress =
    view.status === 'confirmed' &&
    view.items.some((item) => item.command === undefined || item.command.status === 'not_sent' || item.command.status === 'sent_unknown');
  const deadline =
    view.expiresAtLabel === null
      ? 'Đề xuất chưa vào bước duyệt.'
      : `${view.status === 'awaiting_approval' ? 'Hạn duyệt' : 'Hạn duyệt đã ghi'} lúc ${view.expiresAtLabel} (${view.waitLabel} tính từ lúc người yêu cầu bấm Gửi).`;

  return layout(
    title,
    `<h1>${esc(title)}</h1>
<p class="sub">Người yêu cầu: ${esc(view.requesterLabel)}</p>
<div class="banner" role="status">Lý do cần duyệt: ${esc(view.reason)}</div>
${state}
<div class="panel">
${itemsTable(view.items, view.status === 'confirmed')}
<p class="meta">Mã đề xuất <code>${esc(view.proposalId)}</code>. ${esc(deadline)}</p>
</div>`,
    inProgress ? 2 : undefined,
  );
}
