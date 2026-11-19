import { esc, type TraceRow } from '@lab/gateway';
import type { PersonaOption, PersonaRow, RuleView, ServiceStatus, ToolRow } from './data.js';
import { banner, layout, type NavKey, type Notice } from './layout.js';
import { SCENARIOS, type Scenario } from './scenarios.js';
import { formFieldName, type FormField } from './schema-form.js';
import type { ServiceEndpoints, ToolCallResult, ToolEntry } from './upstream.js';

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

export interface PlaygroundResult {
  readonly personaLabel: string;
  readonly toolName: string;
  readonly call: ToolCallResult;
  /** The trace line of this call, read from the gateway's table; null when it could not be read. */
  readonly trace: TraceRow | null;
  /** The clickable confirmation link found in the answer, if there is one. */
  readonly link: string | null;
}

export interface PlaygroundView {
  readonly personas: readonly PersonaOption[];
  readonly tools: readonly ToolEntry[];
  readonly personaId: string;
  readonly tool: ToolEntry;
  readonly fields: readonly FormField[];
  readonly values: ReadonlyMap<string, string>;
  readonly csrfToken: string;
  readonly result: PlaygroundResult | null;
}

function option(value: string, label: string, selected: string): string {
  return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
}

function fieldId(field: FormField): string {
  return `f-${field.path.replaceAll('.', '-')}`;
}

function labelOf(field: FormField): string {
  const required = field.required ? ' <span class="req">bắt buộc</span>' : '';
  return `<label for="${esc(fieldId(field))}">${esc(field.name)}${required}</label>`;
}

/** One input whose kind follows the JSON schema type, so a date looks like a date and an enum becomes a select. */
function controlOf(field: FormField, values: ReadonlyMap<string, string>): string {
  const id = esc(fieldId(field));
  const name = esc(formFieldName(field));
  const value = values.get(field.path) ?? '';
  const required = field.required ? ' required' : '';
  const maxLength = field.maxLength === null ? '' : ` maxlength="${field.maxLength}"`;

  if (field.kind === 'enum') {
    const blank = field.required ? '<option value="">(chọn)</option>' : '<option value="">(không gửi)</option>';
    const choices = field.enumValues.map((choice) => option(choice, choice, value)).join('');
    return `<select id="${id}" name="${name}"${required}>${blank}${choices}</select>`;
  }
  if (field.kind === 'boolean') {
    const blank = field.required ? '' : '<option value="">(không gửi)</option>';
    return `<select id="${id}" name="${name}"${required}>${blank}${option('true', 'true', value)}${option('false', 'false', value)}</select>`;
  }
  if (field.kind === 'integer') {
    return `<input id="${id}" name="${name}" type="number" step="1" value="${esc(value)}"${required}>`;
  }
  if (field.kind === 'number') {
    return `<input id="${id}" name="${name}" type="number" step="any" value="${esc(value)}"${required}>`;
  }
  if (field.date) {
    return `<input id="${id}" name="${name}" type="date" value="${esc(value)}"${required}>`;
  }
  if (field.long) {
    return `<textarea id="${id}" name="${name}" rows="3"${maxLength}${required}>${esc(value)}</textarea>`;
  }
  return `<input id="${id}" name="${name}" type="text" value="${esc(value)}"${maxLength}${required}>`;
}

function fieldOf(field: FormField, values: ReadonlyMap<string, string>): string {
  if (field.kind === 'object') {
    const required = field.required ? ' <span class="req">bắt buộc</span>' : '';
    return `<fieldset class="fieldset">
<legend>${esc(field.name)}${required}</legend>
<div class="form-grid">
${field.children.map((child) => fieldOf(child, values)).join('\n')}
</div>
</fieldset>`;
  }
  const hint = field.date ? '<span class="hint">Gửi dạng YYYY-MM-DD</span>' : '';
  return `<div class="field">
${labelOf(field)}
${controlOf(field, values)}
${hint}
</div>`;
}

function chooserPanel(view: PlaygroundView): string {
  const personas = view.personas
    .map((persona) => option(persona.employeeId, persona.label, view.personaId))
    .join('\n');
  const tools = view.tools
    .map((tool) =>
      option(tool.name, `${tool.name} - ${tool.kind === 'propose' ? 'soạn đề xuất' : 'chỉ đọc'}`, view.tool.name),
    )
    .join('\n');
  return `<section class="panel">
<h2>Chọn nhân vật và tool</h2>
<form method="get" action="/playground">
<div class="form-grid">
<div class="field"><label for="persona">Nhân vật</label><select id="persona" name="persona">${personas}</select></div>
<div class="field"><label for="tool">Tool</label><select id="tool" name="tool">${tools}</select></div>
</div>
<div class="actions form-actions"><button type="submit" class="secondary">Mở form gọi</button></div>
</form>
</section>`;
}

function scenarioCard(scenario: Scenario, csrfToken: string): string {
  return `<form class="scenario" method="post" action="/playground">
<input type="hidden" name="csrf" value="${esc(csrfToken)}">
<input type="hidden" name="scenario" value="${esc(scenario.key)}">
<h3>${esc(scenario.title)}</h3>
<p>${esc(scenario.summary)}</p>
<button type="submit" class="secondary" aria-label="Chạy: ${esc(scenario.title)}">Chạy</button>
</form>`;
}

function scenariosPanel(csrfToken: string): string {
  return `<section class="panel">
<h2>Kịch bản mẫu</h2>
<p class="meta">Mỗi nút gọi đúng tool với đúng nhân vật và tham số đã cài. Kết quả hiện ở trên cùng, kèm dòng vết và link xác nhận nếu có.</p>
<div class="scenario-grid">
${SCENARIOS.map((scenario) => scenarioCard(scenario, csrfToken)).join('\n')}
</div>
</section>`;
}

function callPanel(view: PlaygroundView, personaLabel: string): string {
  const fields =
    view.fields.length === 0
      ? '<p class="meta">Tool này không có tham số; gửi đi là một object rỗng.</p>'
      : `<div class="form-grid">
${view.fields.map((field) => fieldOf(field, view.values)).join('\n')}
</div>`;
  return `<section class="panel">
<h2 class="plain">Gọi <code>${esc(view.tool.name)}</code> dưới tên ${esc(personaLabel)}</h2>
<p class="description">${esc(view.tool.description)}</p>
<form method="post" action="/playground">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<input type="hidden" name="persona" value="${esc(view.personaId)}">
<input type="hidden" name="tool" value="${esc(view.tool.name)}">
${fields}
<div class="actions form-actions"><button type="submit">Gọi qua cổng</button></div>
</form>
</section>`;
}

function traceTable(trace: TraceRow | null, traceId: string | null): string {
  if (trace === null) {
    const which = traceId === null ? '' : ` <code>${esc(traceId)}</code>`;
    return `<p class="meta">Chưa đọc được dòng vết${which} trong bảng trace. Cổng có thể chưa ghi, hoặc mã vết không có trong cơ sở dữ liệu.</p>`;
  }
  const rows: readonly (readonly [string, string])[] = [
    ['Mã vết', trace.traceId],
    ['Thời điểm', trace.at],
    ['Nơi gọi', trace.caller ?? '-'],
    ['Cửa vào', trace.entry],
    ['Người hỏi', trace.requester ?? '-'],
    ['Tool', trace.tool],
    ['Đối tượng', trace.objectId ?? '-'],
    ['Kết quả', trace.outcome],
    ['Mã lý do', trace.reasonCode ?? '-'],
    ['Ngoài phạm vi', trace.outOfScope ? 'Có' : 'Không'],
    ['Mã luật', trace.ruleId ?? '-'],
    ['Phiên bản luật', trace.policyVersion === null ? '-' : `v${trace.policyVersion}`],
    ['Đề xuất', trace.proposalId ?? '-'],
    ['Thời gian cổng đo', `${trace.durationMs} ms`],
  ];
  return `<div class="table-wrap">
<table class="kv">
<tbody>
${rows.map(([label, value]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`).join('\n')}
</tbody>
</table>
</div>`;
}

function resultPanel(result: PlaygroundResult): string {
  const { call } = result;
  const status =
    call.status === null
      ? '<span class="badge bad">Không gọi được</span>'
      : `<span class="badge ${call.status >= 200 && call.status < 300 ? 'ok' : 'bad'}">HTTP ${call.status}</span>`;
  const problem = call.problem === null ? '' : banner(call.problem, 'bad');
  const text =
    call.text === ''
      ? '<p class="meta">Cổng không trả nội dung nào.</p>'
      : `<pre class="verbatim">${esc(call.text)}</pre>`;
  const link =
    result.link === null
      ? ''
      : `<div class="actions form-actions"><a class="btn" href="${esc(result.link)}">Mở thẻ xác nhận</a></div>
<p class="link"><code>${esc(result.link)}</code></p>
<p class="meta">Link mở trang của cổng và hỏi mật khẩu trang của nhân vật. Console không giữ mật khẩu trang, nên hãy dùng mật khẩu <code>trang_</code> mà <code>npm run seed-keys</code> đã in; khoá công cụ <code>lab_</code> không mở được trang này.</p>`;

  return `<section class="panel call-result">
<h2>Kết quả</h2>
<p class="meta">${esc(result.personaLabel)} gọi <code>${esc(result.toolName)}</code>.</p>
<div class="chips">
${status}
<span class="chip">Mã lý do: <strong>${esc(call.reasonCode ?? '-')}</strong></span>
<span class="chip">Thời gian: <strong>${call.elapsedMs} ms</strong></span>
<span class="chip">Mã vết: <code>${esc(call.traceId ?? '-')}</code></span>
</div>
${problem}
<h3>Nguyên văn chữ AI nhận</h3>
${text}
${link}
<h3>Dòng vết của lời gọi này</h3>
${traceTable(result.trace, call.traceId)}
</section>`;
}

/**
 * The playground: choose a persona and a tool, fill the form built from the
 * tool's own schema, and see exactly what the gateway answers (ADR-0006 3.2,
 * 3.3). Every value on the page goes through `esc`.
 */
export function playgroundPage(view: PlaygroundView, active: NavKey): string {
  const personaLabel = view.personas.find((persona) => persona.employeeId === view.personaId)?.label ?? view.personaId;
  const body = `<p class="sub">Mỗi lời gọi đi qua cổng bằng khoá riêng của nhân vật, nên kết quả đúng như AI trong Thổ Thần nhận. Sân chơi chỉ gọi khi bạn bấm, không tự gọi thay AI.</p>
${view.result === null ? '' : resultPanel(view.result)}
${chooserPanel(view)}
${callPanel(view, personaLabel)}
${scenariosPanel(view.csrfToken)}`;

  return layout({ title: 'Sân chơi', active, notices: [], body });
}

/**
 * The playground before the gateway answers: the form comes from the gateway
 * catalog, so without it there is nothing to show. The page says what is
 * missing instead of rendering an empty form that cannot work.
 */
export function playgroundDownPage(text: string): string {
  return layout({
    title: 'Sân chơi',
    active: 'playground',
    notices: [{ text, tone: 'bad' }],
    body: '<p class="sub">Sân chơi cần cổng để đọc danh mục tool và gọi thử. Khi cổng chạy lại, tải lại trang này.</p>',
  });
}

export interface ErrorView {
  readonly text: string;
  readonly link?: { readonly href: string; readonly label: string };
}

export function errorPage(view: ErrorView, active: NavKey | null): string {
  const link =
    view.link === undefined ? '' : `<p><a href="${esc(view.link.href)}">${esc(view.link.label)}</a></p>`;
  return layout({ title: 'Lỗi', active, notices: [], body: `${banner(view.text, 'bad')}\n${link}` });
}
