import { esc } from '@lab/gateway';

export type NavKey = 'overview' | 'tools' | 'permissions' | 'playground' | 'data' | 'trace';

export type Tone = 'info' | 'ok' | 'bad';

export interface Notice {
  readonly text: string;
  readonly tone: Tone;
}

interface NavItem {
  readonly key: NavKey;
  readonly label: string;
  readonly href?: string;
}

const NAV: readonly NavItem[] = [
  { key: 'overview', label: 'Tổng quan', href: '/' },
  { key: 'tools', label: 'Tool', href: '/tools' },
  { key: 'permissions', label: 'Quyền và trường' },
  { key: 'playground', label: 'Sân chơi' },
  { key: 'data', label: 'Dữ liệu gốc', href: '/data' },
  { key: 'trace', label: 'Vết', href: '/trace' },
];

const STYLE = `
:root{color-scheme:light dark;--bg:#f3f5f8;--panel:#fff;--text:#161b22;--muted:#596573;--line:#d8dee6;--accent:#0b5fff;--accent-text:#fff;--nav-bg:#101826;--nav-text:#eaf0fb;--nav-muted:#98a6bd;--warn-bg:#fff4d6;--warn-line:#d8a11f;--warn-text:#6b4b00;--ok-bg:#e4f6e9;--ok-line:#3fa65f;--ok-text:#1c6b38;--bad-bg:#fde8e8;--bad-line:#d65454;--bad-text:#8c2020}
@media (prefers-color-scheme:dark){:root{--bg:#12161a;--panel:#1c2127;--text:#e9edf2;--muted:#9ca8b6;--line:#333b45;--accent:#5b92ff;--accent-text:#0a0f1a;--nav-bg:#0a0f16;--nav-text:#e8eefc;--nav-muted:#94a2b8;--warn-bg:#392f16;--warn-line:#8a6d1c;--warn-text:#f1d58a;--ok-bg:#172a1d;--ok-line:#2f7a47;--ok-text:#9fe0b4;--bad-bg:#3a1c1c;--bad-line:#9c3d3d;--bad-text:#f3b4b4}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
.skip{position:absolute;left:-999px;top:0;background:var(--panel);color:var(--text);padding:.6rem .8rem;z-index:10}
.skip:focus{left:.5rem;top:.5rem}
.top{background:var(--nav-bg);color:var(--nav-text);border-bottom:1px solid #00000033}
.top-inner{max-width:76rem;margin:0 auto;padding:.85rem 1rem .65rem;display:flex;flex-wrap:wrap;gap:.6rem 1.25rem;align-items:center}
.brand{display:flex;flex-direction:column;line-height:1.2;color:inherit;text-decoration:none;font-weight:750;font-size:1.08rem}
.brand span{color:var(--nav-muted);font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.top nav{display:flex;flex-wrap:wrap;gap:.2rem;flex:1 1 100%}
@media (min-width:56rem){.top nav{flex:1 1 auto;justify-content:flex-end}}
.nav-link{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .65rem;border-radius:.45rem;color:var(--nav-text);text-decoration:none;font-size:.92rem;white-space:nowrap}
.nav-link:hover{background:#ffffff1a}
.nav-link[aria-current=page]{background:#fff;color:#101826;font-weight:750}
.nav-link.disabled{color:var(--nav-muted)}
.soon{font-size:.6rem;text-transform:uppercase;letter-spacing:.05em;border:1px solid currentColor;border-radius:999px;padding:.03rem .34rem;opacity:.85}
main{max-width:76rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.55rem;line-height:1.25;margin:0 0 .3rem}
h2{font-size:1.08rem;line-height:1.35;margin:0 0 .8rem;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.sub{color:var(--muted);margin:0 0 1.25rem;max-width:62rem}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:.7rem;padding:1rem 1.1rem;margin:0 0 1rem;box-shadow:0 1px 2px #0000000a}
.grid{display:grid;grid-template-columns:1fr;gap:1rem}
.grid .panel{margin:0}
@media (min-width:62rem){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.grid .wide{grid-column:1/-1}}
.banner{border:1px solid var(--warn-line);background:var(--warn-bg);color:var(--warn-text);border-radius:.55rem;padding:.65rem .9rem;margin:0 0 1rem;font-size:.95rem}
.banner.ok{border-color:var(--ok-line);background:var(--ok-bg);color:var(--ok-text)}
.banner.bad{border-color:var(--bad-line);background:var(--bad-bg);color:var(--bad-text)}
.panel .banner{margin:.3rem 0 0}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;vertical-align:top;padding:.52rem .6rem;border-bottom:1px solid var(--line)}
thead th{font-size:.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
tbody th{font-weight:650}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
td.num,th.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.badge{display:inline-block;border:1px solid;border-radius:999px;padding:.1rem .5rem;font-size:.76rem;font-weight:750;white-space:nowrap}
.badge.ok{color:var(--ok-text);background:var(--ok-bg);border-color:var(--ok-line)}
.badge.warn{color:var(--warn-text);background:var(--warn-bg);border-color:var(--warn-line)}
.badge.bad{color:var(--bad-text);background:var(--bad-bg);border-color:var(--bad-line)}
.state{font-weight:750}
.state.ok{color:var(--ok-text)}
.state.bad{color:var(--bad-text)}
.muted{color:var(--muted)}
.meta{color:var(--muted);font-size:.88rem;margin:.7rem 0 0}
.detail{display:block;color:var(--muted);font-size:.85rem;margin:.2rem 0 0}
.version{font-size:1.35rem;font-weight:750;margin:.1rem 0 .4rem}
.tool{padding:1rem 1.1rem}
.tool h2{margin-bottom:.2rem}
.tool .description{margin:.2rem 0 .9rem;max-width:68rem}
.params{font-size:.93rem}
.params th.nested{padding-left:1.4rem;font-weight:500;color:var(--muted)}
.params th.nested code{color:var(--text)}
.required{font-weight:650}
.guest{color:var(--muted);font-size:.82rem;display:block;margin:.15rem 0 0}
.operator-view{border-left:3px solid var(--accent);padding:.15rem 0 .15rem .7rem;margin:0 0 1rem;color:var(--muted);max-width:62rem}
.operator-view strong{color:var(--text)}
.filters{display:flex;flex-wrap:wrap;gap:.75rem 1rem;align-items:flex-end;background:var(--panel);border:1px solid var(--line);border-radius:.7rem;padding:.85rem 1rem;margin:0 0 1rem}
.filters .field{display:flex;flex-direction:column;gap:.2rem;min-width:9rem}
.filters label{font-size:.72rem;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.filters input,.filters select{font:inherit;padding:.45rem .55rem;border:1px solid var(--line);border-radius:.45rem;background:var(--bg);color:var(--text);min-width:9rem}
.filters .actions{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
button{font:inherit;font-weight:650;padding:.5rem 1rem;border-radius:.45rem;border:1px solid var(--accent);background:var(--accent);color:var(--accent-text);cursor:pointer}
button.secondary{background:transparent;color:var(--accent)}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.actions{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.actions form{margin:0}
.pager{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;margin:.9rem 0 0;font-size:.9rem}
.pager a,.pager span{padding:.2rem .6rem;border:1px solid var(--line);border-radius:.4rem;color:var(--accent);text-decoration:none}
.pager span[aria-current=page]{background:var(--accent);border-color:var(--accent);color:var(--accent-text);font-weight:750}
.pager .count{color:var(--muted);border:0;padding-left:0}
.raw-cell{overflow-wrap:anywhere;max-width:26rem}
.raw-cell code{font-size:.85em}
.raw-table{min-width:64rem}
.raw-table tbody th{white-space:nowrap}
.raw-table td.nowrap{white-space:nowrap}
.trace-group thead th{white-space:nowrap}
.trace-group small{display:block;color:var(--muted);font-size:.8rem;margin:.15rem 0 0}
.trace-group small code{font-size:.95em}
.trace-when time{white-space:nowrap}
.trace-group h2{justify-content:flex-start}
.trace-group .badge{font-weight:650}
.group-meta{color:var(--muted);font-size:.85rem;font-weight:500}
details summary{cursor:pointer;color:var(--accent);font-size:.9rem}
details p{margin:.3rem 0 0;overflow-wrap:anywhere}
footer{max-width:76rem;margin:0 auto;padding:0 1rem 2.5rem;color:var(--muted);font-size:.85rem}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
@media (max-width:46rem){
.raw-table{min-width:0}
.stack thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.stack,.stack tbody,.stack tr,.stack th,.stack td{display:block;width:auto}
.stack tr{border-bottom:1px solid var(--line);padding:.45rem 0}
.stack tr:last-child{border-bottom:0}
.stack th,.stack td{border-bottom:0;padding:.14rem 0}
.stack th[scope=row]{padding-top:.25rem;font-size:1.02rem}
.stack td::before{content:attr(data-label);display:block;font-size:.7rem;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
}
`;

export function banner(text: string, tone: Tone = 'bad'): string {
  const role = tone === 'bad' ? 'alert' : 'status';
  return `<div class="banner${tone === 'info' ? '' : ` ${tone}`}" role="${role}">${esc(text)}</div>`;
}

export function layout(options: {
  readonly title: string;
  readonly active: NavKey | null;
  readonly notices: readonly Notice[];
  readonly body: string;
  /** A page's own plain JavaScript, with the nonce the response allows in its content security policy. */
  readonly script?: { readonly code: string; readonly nonce: string };
}): string {
  const items = NAV.map((item) => {
    if (item.href === undefined) {
      return `<span class="nav-link disabled" aria-disabled="true" title="Chưa có trong bản này">${esc(item.label)} <span class="soon">sắp có</span></span>`;
    }
    const current = item.key === options.active ? ' aria-current="page"' : '';
    return `<a class="nav-link" href="${esc(item.href)}"${current}>${esc(item.label)}</a>`;
  }).join('\n');

  const notices = options.notices.map((notice) => banner(notice.text, notice.tone)).join('\n');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(options.title)} - Lab kết nối</title>
<style>${STYLE}</style>
</head>
<body>
<a class="skip" href="#main">Bỏ qua điều hướng</a>
<header class="top">
<div class="top-inner">
<a class="brand" href="/">Lab kết nối<span>Trang điều khiển</span></a>
<nav aria-label="Sáu màn hình">
${items}
</nav>
</div>
</header>
<main id="main">
<h1>${esc(options.title)}</h1>
${notices}
${options.body}
</main>
<footer>Dữ liệu giả, chỉ chạy trên máy này. Không mở trang điều khiển qua đường hầm hay địa chỉ công khai.</footer>
${options.script === undefined ? '' : `<script nonce="${esc(options.script.nonce)}">${options.script.code}</script>`}
</body>
</html>
`;
}
