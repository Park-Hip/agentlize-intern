import { esc } from '@lab/gateway';
import type { PersonaRow, RuleView, ServiceStatus, ToolRow } from './data.js';
import { banner, layout, type NavKey, type Notice } from './layout.js';
import type { ServiceEndpoints } from './upstream.js';

export interface OverviewView {
  readonly services: readonly ServiceStatus[];
  readonly rule: RuleView;
  readonly personas: readonly PersonaRow[];
  readonly notices: readonly Notice[];
}

function serviceRows(services: readonly ServiceStatus[]): string {
  return services
    .map(
      (service) => `<tr>
<th scope="row">${esc(service.label)}</th>
<td class="num" data-label="Cổng">${service.port}</td>
<td data-label="Trạng thái"><span class="state ${service.ok ? 'ok' : 'bad'}">${service.ok ? 'Đang chạy' : 'Không chạy'}</span><span class="detail">${esc(service.detail)}</span></td>
</tr>`,
    )
    .join('\n');
}

function rulePanel(rule: RuleView): string {
  if (rule.ok) {
    return `<p class="version">Phiên bản ${rule.version}</p>
<p class="meta">Đọc từ <code>${esc(rule.file)}</code>. Cổng đọc lại file này ở mỗi lần quyết định, nên bản sửa áp dụng ngay ở lời gọi sau mà không cần khởi động lại.</p>`;
  }
  return `${banner(`${rule.detail}. Cổng từ chối mọi lời gọi với POLICY_UNAVAILABLE cho tới khi file luật đọc được.`, 'bad')}
<p class="meta">File đang đọc: <code>${esc(rule.file)}</code>.</p>`;
}

function personaRows(personas: readonly PersonaRow[]): string {
  return personas
    .map(
      (persona) => `<tr>
<td data-label="Tên">${esc(persona.name)}${persona.guest ? '<span class="guest">Không có trong danh bạ; khoá hợp lệ nhưng mọi lời gọi bị từ chối.</span>' : ''}</td>
<td class="num" data-label="Mã"><code>${esc(persona.employeeId)}</code></td>
<td data-label="Vai">${esc(persona.role)}</td>
<td data-label="Phòng">${esc(persona.department)}</td>
</tr>`,
    )
    .join('\n');
}

/** The overview: are the three services alive, which rules are applied, and who can call the lab. */
export function overviewPage(view: OverviewView, active: NavKey): string {
  const body = `<p class="sub">Trạng thái của ba dịch vụ, phiên bản luật cổng đang áp, và bảy danh tính nhận khoá: sáu nhân vật cố định cùng khách.</p>
<div class="grid">
<section class="panel">
<h2>Ba dịch vụ</h2>
<div class="table-wrap">
<table class="stack">
<thead><tr><th scope="col">Dịch vụ</th><th scope="col">Cổng</th><th scope="col">Trạng thái</th></tr></thead>
<tbody>
${serviceRows(view.services)}
</tbody>
</table>
</div>
</section>
<section class="panel">
<h2>Luật đang áp</h2>
${rulePanel(view.rule)}
</section>
<section class="panel wide">
<h2>Sáu nhân vật và khách</h2>
<p class="meta">Đọc từ danh bạ giả bằng khoá dịch vụ. Bảng chỉ giữ sáu nhân vật của kịch bản và khách, không liệt kê cả danh bạ.</p>
<div class="table-wrap">
<table class="stack">
<thead><tr><th scope="col">Tên</th><th scope="col">Mã</th><th scope="col">Vai</th><th scope="col">Phòng</th></tr></thead>
<tbody>
${personaRows(view.personas)}
</tbody>
</table>
</div>
</section>
</div>`;

  return layout({ title: 'Tổng quan', active, notices: view.notices, body });
}

export interface ToolsView {
  readonly tools: readonly ToolRow[] | undefined;
  readonly endpoints: ServiceEndpoints;
  readonly notices: readonly Notice[];
}

function kindBadge(kind: ToolRow['kind']): string {
  return kind === 'propose'
    ? '<span class="badge warn">Soạn đề xuất</span>'
    : '<span class="badge ok">Chỉ đọc</span>';
}

function paramRows(tool: ToolRow): string {
  if (tool.params.length === 0) return '';
  const rows = tool.params
    .map(
      (param) => `<tr>
<th scope="row"${param.nested ? ' class="nested"' : ''}><code>${esc(param.name)}</code></th>
<td data-label="Kiểu"><code>${esc(param.type)}</code></td>
<td class="required" data-label="Bắt buộc">${param.required ? 'Có' : 'Không'}</td>
</tr>`,
    )
    .join('\n');
  return `<div class="table-wrap">
<table class="stack params">
<thead><tr><th scope="col">Tham số</th><th scope="col">Kiểu</th><th scope="col">Bắt buộc</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
}

function toolCard(tool: ToolRow): string {
  return `<section class="panel tool">
<h2><code>${esc(tool.name)}</code> ${kindBadge(tool.kind)}</h2>
<p class="description">${esc(tool.description)}</p>
${tool.params.length === 0 ? '<p class="meta">Tool này không có tham số.</p>' : paramRows(tool)}
</section>`;
}

/** The tool screen: exactly the catalog the gateway publishes for `/mcp`, with its parameters. */
export function toolsPage(view: ToolsView, active: NavKey): string {
  const body = `<p class="sub">Danh mục lấy từ <code>GET ${esc(view.endpoints.gateway.url)}/v1/tools</code>, cùng nguồn với cửa <code>/mcp</code>. Chỉ đọc không đổi dữ liệu; soạn đề xuất tạo một đề xuất chờ người bấm Gửi, chưa ghi gì.</p>
${
  view.tools === undefined
    ? ''
    : `<p class="meta">${view.tools.length} tool. Tham số của object con được ghi dưới dạng <code>cha.con</code>.</p>
${view.tools.map(toolCard).join('\n')}`
}`;

  return layout({ title: 'Tool', active, notices: view.notices, body });
}

export interface ErrorView {
  readonly text: string;
}

export function errorPage(view: ErrorView, active: NavKey | null): string {
  return layout({ title: 'Lỗi', active, notices: [], body: banner(view.text, 'bad') });
}
