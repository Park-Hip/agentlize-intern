import { GUEST, PERSONAS } from '@lab/shared';
import { ENTRIES, esc, type TraceRow } from '@lab/gateway';
import { layout, type NavKey, type Notice } from './layout.js';
import { clock, entryLabel, groupByProposal, outcomeLabel, type TraceGroup, type TraceQuery } from './trace-view.js';

export interface TraceView {
  readonly query: TraceQuery;
  readonly rows: readonly TraceRow[];
  /** How many lines match the filters, so the page can say it shows only the newest. */
  readonly total: number;
  readonly limit: number;
  readonly notices: readonly Notice[];
  /** Why the table could not be read; absent when it could. */
  readonly error: string | undefined;
}

const ORDERED_PERSONAS = Object.values(PERSONAS).sort((left, right) => left.employeeId.localeCompare(right.employeeId));

function personSelect(selected: string): string {
  const known = new Set<string>();
  const options = [`<option value="">Tất cả người gọi</option>`];
  for (const persona of ORDERED_PERSONAS) {
    known.add(persona.employeeId);
    options.push(
      `<option value="${esc(persona.employeeId)}"${persona.employeeId === selected ? ' selected' : ''}>${esc(persona.fullName)} (${esc(persona.employeeId)})</option>`,
    );
  }
  known.add(GUEST.employeeId);
  options.push(
    `<option value="${esc(GUEST.employeeId)}"${GUEST.employeeId === selected ? ' selected' : ''}>Khách (${esc(GUEST.employeeId)})</option>`,
  );
  // A key issued outside the six characters can still be searched by its code.
  if (selected !== '' && !known.has(selected)) {
    options.push(`<option value="${esc(selected)}" selected>${esc(selected)} (ngoài danh sách)</option>`);
  }
  return options.join('\n');
}

function entrySelect(selected: string): string {
  const options = [`<option value="">Mọi cửa vào</option>`];
  for (const entry of ENTRIES) {
    options.push(`<option value="${entry}"${entry === selected ? ' selected' : ''}>${esc(entryLabel(entry))} (${entry})</option>`);
  }
  return options.join('\n');
}

function filterForm(query: TraceQuery): string {
  return `<form class="filters" method="get" action="/trace">
<div class="field">
<label for="employee">Người gọi</label>
<select id="employee" name="employee">
${personSelect(query.typed.employee)}
</select>
</div>
<div class="field">
<label for="task">Task</label>
<input id="task" name="task" value="${esc(query.typed.task)}" placeholder="T-12">
</div>
<div class="field">
<label for="proposal">Đề xuất</label>
<input id="proposal" name="proposal" value="${esc(query.typed.proposal)}" placeholder="dx-...">
</div>
<div class="field">
<label for="entry">Cửa vào</label>
<select id="entry" name="entry">
${entrySelect(query.typed.entry)}
</select>
</div>
<div class="actions">
<button type="submit">Lọc</button>
<a href="/trace">Xoá lọc</a>
</div>
</form>`;
}

function outcomeBadge(row: TraceRow): string {
  const tone = row.outcome === 'ok' ? ' ok' : row.outcome === 'error' ? ' bad' : ' warn';
  const scope = row.outOfScope ? '<span class="detail">ngoài phạm vi</span>' : '';
  return `<span class="badge${tone}">${esc(outcomeLabel(row.outcome))}</span> <code>${esc(row.outcome)}</code>${scope}`;
}

/** Who asked and what about, kept under the tool so the table fits a laptop screen. */
function whoLine(row: TraceRow): string {
  const who = row.requester === null ? 'không rõ người gọi' : `người <code>${esc(row.requester)}</code>`;
  const what = row.objectId === null ? 'không có đối tượng' : `đối tượng <code>${esc(row.objectId)}</code>`;
  return `<small>${who} · ${what}</small>`;
}

function toolCell(row: TraceRow): string {
  const key = row.idempotencyKey ?? null;
  if (key === null) return `<code>${esc(row.tool)}</code>${whoLine(row)}`;
  const attempts = row.attempts === null || row.attempts === undefined ? '-' : String(row.attempts);
  return `<code>${esc(row.tool)}</code><small>khoá ghi <code>${esc(key)}</code>, lần gửi ${attempts}</small>${whoLine(row)}`;
}

function rowCells(row: TraceRow): string {
  return `<tr>
<td class="trace-when" data-label="Thời điểm"><time datetime="${esc(row.at)}">${esc(clock(row.at))}</time><small><code>${esc(row.traceId)}</code></small></td>
<td class="trace-caller" data-label="Nơi gọi">${row.caller === null ? '-' : `<code>${esc(row.caller)}</code>`}</td>
<td class="trace-entry" data-label="Cửa vào">${esc(entryLabel(row.entry))} <code>${esc(row.entry)}</code></td>
<td class="trace-tool" data-label="Tool">${toolCell(row)}</td>
<td data-label="Kết quả">${outcomeBadge(row)}</td>
<td data-label="Mã lý do">${row.reasonCode === null ? '-' : `<code>${esc(row.reasonCode)}</code>`}</td>
<td data-label="Mã luật">${row.ruleId === null ? '-' : `<code>${esc(row.ruleId)}</code>`}</td>
<td class="num" data-label="Phiên bản luật">${row.policyVersion === null ? '-' : `v${row.policyVersion}`}</td>
</tr>`;
}

function groupSummary(group: TraceGroup): string {
  const requester = group.rows.find((row) => row.requester !== null)?.requester;
  const objectId = group.rows.find((row) => row.objectId !== null)?.objectId;
  const parts = [requester, objectId === undefined ? undefined : `task ${objectId}`].filter(
    (part): part is string => part !== undefined,
  );
  return parts.length === 0 ? '' : `<span class="group-meta">${esc(parts.join(', '))}</span>`;
}

function groupPanel(group: TraceGroup): string {
  const title =
    group.proposalId === null ? 'Ngoài đề xuất' : `Đề xuất <code>${esc(group.proposalId)}</code>`;
  const note =
    group.proposalId === null
      ? '<p class="meta">Lời gọi đọc và lời gọi bị từ chối trước khi có đề xuất: không thuộc đề xuất nào.</p>'
      : '<p class="meta">Trong một đề xuất, dòng cũ nhất đứng trước, nên chuỗi đọc từ soạn sang xác nhận rồi ghi.</p>';
  return `<section class="panel trace-group">
<h2>${title} <span class="badge">${group.rows.length} dòng</span> ${groupSummary(group)}</h2>
<div class="table-wrap">
<table class="stack">
<thead><tr><th scope="col">Thời điểm</th><th scope="col">Nơi gọi</th><th scope="col">Cửa vào</th><th scope="col">Tool</th><th scope="col">Kết quả</th><th scope="col">Mã lý do</th><th scope="col">Mã luật</th><th scope="col">Phiên bản luật</th></tr></thead>
<tbody>
${group.rows.map(rowCells).join('\n')}
</tbody>
</table>
</div>
${note}
</section>`;
}

/** The table body the page and the refresh route share, so one rendering serves both. */
export function traceGroups(rows: readonly TraceRow[]): string {
  const groups = groupByProposal(rows);
  if (groups.length === 0) {
    return '<section class="panel"><p class="meta">Không có dòng vết nào khớp bộ lọc.</p></section>';
  }
  return groups.map(groupPanel).join('\n');
}

/**
 * A tiny enhancement, not a requirement: while the tab is visible the page
 * fetches the same table again and swaps it in. Every filter is a normal `GET`
 * form and the table is drawn by the server, so with JavaScript off the page
 * still filters and reads (ADR-0006 section 3.7).
 */
const REFRESH_SCRIPT = `(function () {
  var box = document.getElementById('trace-groups');
  var stamp = document.getElementById('trace-updated');
  if (!box || !window.fetch) return;
  var timer = null;
  function mark() {
    if (stamp) stamp.textContent = 'Cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN');
  }
  function refresh() {
    fetch(location.pathname.replace(/\\/$/, '') + '/rows' + location.search)
      .then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then(function (html) { box.innerHTML = html; mark(); })
      .catch(function () {});
  }
  function start() {
    if (timer === null) timer = setInterval(refresh, 5000);
  }
  function stop() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); return; }
    refresh();
    start();
  });
  mark();
  start();
})();`;

export function tracePage(view: TraceView, active: NavKey, nonce: string): string {
  const shown =
    view.error !== undefined
      ? `<section class="panel"><p class="meta">${esc(view.error)}</p></section>`
      : `<div id="trace-groups">
${traceGroups(view.rows)}
</div>`;

  const count =
    view.error !== undefined
      ? ''
      : view.total > view.rows.length
        ? `<p class="meta">Đang hiện ${view.rows.length} dòng mới nhất trong ${view.total} dòng khớp bộ lọc. Lọc theo task hay đề xuất để thấy dòng cũ hơn.</p>`
        : `<p class="meta">${view.rows.length} dòng khớp bộ lọc.</p>`;

  const body = `<p class="sub">Bảng vết của cổng, mở từ <code>gateway.sqlite</code> ở chế độ chỉ đọc. Lọc theo người, task, đề xuất và cửa vào; các dòng của một đề xuất nằm chung một nhóm để đọc thành chuỗi soạn, xác nhận, ghi (SR7).</p>
${filterForm(view.query)}
${count}
<p class="meta">Vết mới nhất trước. <span id="trace-updated"></span></p>
<noscript><p class="banner" role="status">Trang vẫn lọc và xem đầy đủ khi JavaScript tắt; chỉ phần tự làm mới là không chạy. Bấm Lọc để tải lại.</p></noscript>
${shown}`;

  return layout({
    title: 'Vết',
    active,
    notices: view.notices,
    body,
    script: { code: REFRESH_SCRIPT, nonce },
  });
}
