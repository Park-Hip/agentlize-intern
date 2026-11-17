import { PERSONAS } from '@lab/shared';
import type { CardRow } from '../proposals/card.js';
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
 */
export const PAGE_SECURITY_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
} as const;

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--panel:#fff;--text:#1b1f24;--muted:#5b6570;--line:#d8dde3;--accent:#0b5fff;--accent-text:#fff;--warn-bg:#fff4d6;--warn-line:#e3b341;--ok-bg:#e4f6e9;--ok-line:#3fa65f;--bad-bg:#fde8e8;--bad-line:#d65454}
@media (prefers-color-scheme:dark){:root{--bg:#14171a;--panel:#1d2126;--text:#e8ebee;--muted:#9aa5b1;--line:#343b43;--accent:#5b92ff;--accent-text:#0a0f1a;--warn-bg:#3a3017;--warn-line:#8a6d1c;--ok-bg:#172a1d;--ok-line:#2f7a47;--bad-bg:#3a1c1c;--bad-line:#9c3d3d}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:40rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.4rem;line-height:1.25;margin:0 0 .25rem}
.sub{color:var(--muted);margin:0 0 1.25rem}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:.6rem;padding:1rem 1.1rem;margin:0 0 1rem}
.banner{border:1px solid var(--warn-line);background:var(--warn-bg);border-radius:.6rem;padding:.6rem .9rem;margin:0 0 1rem;font-size:.95rem}
.banner.ok{border-color:var(--ok-line);background:var(--ok-bg)}
.banner.bad{border-color:var(--bad-line);background:var(--bad-bg)}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;vertical-align:top;padding:.5rem .6rem;border-bottom:1px solid var(--line)}
thead th{font-size:.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
tbody th{width:9rem;font-weight:600;color:var(--muted)}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
td.v{white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:34rem){
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
select,input[type=password]{width:100%;font:inherit;padding:.55rem .6rem;border:1px solid var(--line);border-radius:.45rem;background:var(--bg);color:var(--text);margin:0 0 .9rem}
.actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:1rem 0 0}
.actions form{margin:0}
button{font:inherit;font-weight:600;padding:.6rem 1.2rem;border-radius:.45rem;border:1px solid var(--accent);background:var(--accent);color:var(--accent-text);cursor:pointer}
button.secondary{background:transparent;color:var(--accent)}
button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
footer{color:var(--muted);font-size:.85rem;margin-top:1.5rem}
`;

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - Lab kết nối</title>
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

function banner(text: string, tone: Tone): string {
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
<p class="sub">Chọn nhân vật và dán khoá riêng của nhân vật đó. Đây không phải đăng nhập thật: cổng chỉ kiểm khoá đúng người rồi cấp một phiên 15 phút.</p>
${error === undefined ? '' : banner(error, 'bad')}
<form class="panel" method="post" action="/dang-nhap">
<label for="employee">Nhân vật</label>
<select id="employee" name="employee" required>
${options}
</select>
<label for="key">Khoá riêng</label>
<input id="key" name="key" type="password" autocomplete="off" required placeholder="lab_...">
<input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Đăng nhập giả lập</button>
</form>`,
  );
}

export interface CardView {
  readonly proposalId: string;
  readonly taskId: string;
  readonly requesterLabel: string;
  readonly rows: readonly CardRow[];
  readonly expiresAtLabel: string;
  readonly status: 'awaiting_confirmation' | 'confirmed' | 'cancelled' | 'expired';
  readonly csrfToken: string;
  /** The write command behind a confirmed proposal; absent for a proposal nobody has sent. */
  readonly command?: WriteCommand | undefined;
}

const STATUS_BANNER: Readonly<Record<'cancelled' | 'expired', { text: string; tone: Tone }>> = {
  cancelled: { text: 'Đề xuất đã bị huỷ. Hãy nhờ AI soạn lại với nội dung đã sửa.', tone: 'info' },
  expired: { text: 'CHƯA THỰC HIỆN [APPROVAL_EXPIRED] Đề xuất đã hết hạn. Hãy nhờ AI soạn lại.', tone: 'bad' },
};

/** What the page says about the write command: written, still unknown, or not carried out with the reason. */
const COMMAND_BANNER: Readonly<Record<string, { text: string; tone: Tone }>> = {
  TARGET_CHANGED: {
    text: 'CHƯA THỰC HIỆN [TARGET_CHANGED] Task đã bị người khác sửa sau khi đề xuất được soạn nên cổng không ghi. Hãy nhờ AI soạn lại với dữ liệu mới.',
    tone: 'bad',
  },
  CONTENT_CHANGED: {
    text: 'CHƯA THỰC HIỆN [CONTENT_CHANGED] Nội dung đề xuất không còn khớp với lúc soạn nên cổng không ghi. Hãy nhờ AI soạn lại.',
    tone: 'bad',
  },
  GATEWAY_UNAVAILABLE: {
    text: 'CHƯA THỰC HIỆN [GATEWAY_UNAVAILABLE] Danh sách task từ chối lệnh hoặc trả lời không đọc được nên cổng không ghi. Hãy báo người vận hành Lab.',
    tone: 'bad',
  },
};

function confirmedBanner(view: CardView): { text: string; tone: Tone } {
  const command = view.command;
  if (command === undefined || command.status === 'not_sent') {
    return { text: 'Đã xác nhận đề xuất. Cổng chưa gửi lệnh ghi.', tone: 'info' };
  }
  if (command.status === 'sent_unknown') {
    return {
      text: 'Cổng đã gửi lệnh nhưng chưa nhận được kết quả. Cổng giữ lệnh và gửi lại với đúng mã cũ, nên task không bị ghi hai lần. Hãy mở lại trang sau ít phút.',
      tone: 'info',
    };
  }
  if (command.status === 'done') {
    return { text: `Đã ghi thay đổi vào task ${view.taskId} ở lần gửi thứ ${command.attempts}.`, tone: 'ok' };
  }
  const known = command.reasonCode === null ? undefined : COMMAND_BANNER[command.reasonCode];
  return known ?? { text: 'CHƯA THỰC HIỆN Lệnh ghi không thành công. Hãy báo người vận hành Lab.', tone: 'bad' };
}

/** The confirmation card. Every value on it was read from the systems by the gateway, none is the agent's wording. */
export function cardPage(view: CardView): string {
  const rows = view.rows
    .map(
      (row) =>
        `<tr><th scope="row">${esc(row.label)}</th><td class="v" data-label="Hiện tại">${esc(row.before === '' ? '(trống)' : row.before)}</td><td class="v" data-label="Đề xuất">${esc(row.after)}</td></tr>`,
    )
    .join('\n');

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
  let state = pending;
  if (view.status !== 'awaiting_confirmation') {
    const info = view.status === 'confirmed' ? confirmedBanner(view) : STATUS_BANNER[view.status];
    state = banner(info.text, info.tone);
  }

  return layout(
    `Xác nhận thay đổi ${view.taskId}`,
    `<h1>Xác nhận thay đổi task ${esc(view.taskId)}</h1>
<p class="sub">Người yêu cầu: ${esc(view.requesterLabel)}</p>
<div class="panel">
<table>
<thead><tr><th scope="col">Trường</th><th scope="col">Hiện tại</th><th scope="col">Đề xuất</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p class="meta">Mã đề xuất <code>${esc(view.proposalId)}</code>. Hết hạn lúc ${esc(view.expiresAtLabel)}.</p>
</div>
${state}`,
  );
}
