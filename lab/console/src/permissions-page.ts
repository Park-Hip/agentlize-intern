import { TABLE_ACTIONS, esc } from '@lab/gateway';
import type { PolicyEffect } from '@lab/gateway';
import { banner, layout, type NavKey, type Notice } from './layout.js';
import {
  ACTION_LABEL,
  EFFECTS,
  EFFECT_LABEL,
  type DecisionForm,
  type DecisionOutcome,
  type PermissionsView,
} from './permissions.js';

const EFFECT_CLASS: Readonly<Record<PolicyEffect, string>> = {
  allow: 'ok',
  needs_approval: 'warn',
  deny: 'bad',
};

export interface DecisionView {
  readonly form: DecisionForm;
  readonly ran: boolean;
  readonly outcome: DecisionOutcome | undefined;
}

export interface PermissionsPageView extends PermissionsView {
  readonly csrfToken: string;
  readonly personas: readonly { employeeId: string; name: string; role: string; department: string }[];
  readonly decision: DecisionView;
  readonly notices: readonly Notice[];
  readonly savedVersion: number | undefined;
  readonly restoredVersion: number | undefined;
}

function effectOptions(selected: PolicyEffect): string {
  return EFFECTS.map(
    (effect) =>
      `<option value="${effect}"${effect === selected ? ' selected' : ''}>${esc(EFFECT_LABEL[effect])}</option>`,
  ).join('');
}

function matrix(view: PermissionsPageView): string {
  const head = view.roles.map((role) => `<th scope="col">${esc(role.label)}</th>`).join('');
  const body = TABLE_ACTIONS.map((action) => {
    const label = ACTION_LABEL[action];
    const cells = view.roles
      .map((role) => {
        const value = view.rules.roles[role.role]?.[action] ?? 'deny';
        return `<td data-label="${esc(role.label)}"><select name="cell.${esc(role.role)}.${esc(action)}" aria-label="${esc(label)} cho ${esc(role.label)}">${effectOptions(value)}</select></td>`;
      })
      .join('');
    return `<tr>
<th scope="row">${esc(label)}<span class="code">${esc(action)}</span></th>
${cells}
</tr>`;
  }).join('\n');

  return `<div class="table-wrap">
<table class="matrix">
<thead><tr><th scope="col">Hành động</th>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</div>`;
}

function fieldGrid(view: PermissionsPageView): string {
  const cards = view.roles
    .map((role) => {
      const checked = new Set(view.rules.employee_fields[role.role] ?? []);
      const rows = view.fields
        .map((field) => {
          const state = checked.has(field.field) ? ' checked' : '';
          const badge = field.declared ? '' : ' <span class="badge warn">chưa khai</span>';
          const sameName = field.label === field.field;
          const title = sameName ? `<code>${esc(field.field)}</code>` : esc(field.label);
          const names = sameName
            ? ''
            : `<br>${
                field.directoryKey === field.field
                  ? `<code>${esc(field.field)}</code>`
                  : `<code>${esc(field.field)}</code> <span class="muted">(danh bạ: <code>${esc(field.directoryKey)}</code>)</span>`
              }`;
          return `<label class="check">
<input type="checkbox" name="fields.${esc(role.role)}" value="${esc(field.field)}"${state}>
<span>${title}${badge}${names}</span>
</label>`;
        })
        .join('\n');
      return `<fieldset class="role-card">
<legend>${esc(role.label)}</legend>
${rows}
</fieldset>`;
    })
    .join('\n');

  return `<div class="role-grid">${cards}</div>`;
}

function taskFields(view: PermissionsPageView): string {
  const chips = view.taskFields
    .map((field) => `<li><span>${esc(field.label)}</span> <code>${esc(field.name)}</code></li>`)
    .join('');
  return `<ul class="chips">${chips}</ul>
<p class="meta">Cố định trong mã: <code>taskLine</code> và <code>taskDetail</code> của cổng quyết định trường nào AI thấy. Đưa trường của task vào file luật là một thay đổi schema riêng, chưa làm.</p>`;
}

function decisionBox(view: PermissionsPageView): string {
  const { form } = view.decision;
  const personas = view.personas
    .map(
      (persona) =>
        `<option value="${esc(persona.employeeId)}"${persona.employeeId === form.persona ? ' selected' : ''}>${esc(persona.name)} (${esc(persona.employeeId)}) - ${esc(persona.role)} - ${esc(persona.department)}</option>`,
    )
    .join('');
  const actions = Object.entries(ACTION_LABEL)
    .map(
      ([action, label]) =>
        `<option value="${esc(action)}"${action === form.action ? ' selected' : ''}>${esc(label)} (${esc(action)})</option>`,
    )
    .join('');
  const departments = ['Vận hành', 'Kinh doanh']
    .map(
      (department) =>
        `<option value="${esc(department)}"${department === form.department ? ' selected' : ''}>${esc(department)}</option>`,
    )
    .join('');
  const fields = view.fields
    .map(
      (field) =>
        `<option value="${esc(field.field)}"${field.field === form.field ? ' selected' : ''}>${esc(field.label)} (${esc(field.field)})</option>`,
    )
    .join('');

  const formHtml = `<form class="decide" method="get" action="/permissions">
<div class="decide-grid">
<div>
<label for="persona">Nhân vật</label>
<select id="persona" name="persona"${view.personas.length === 0 ? ' disabled' : ''}>${personas}</select>
</div>
<div>
<label for="action">Hành động</label>
<select id="action" name="action">${actions}</select>
</div>
<div>
<label for="object">Đối tượng</label>
<select id="object" name="object">
<option value="task"${form.objectKind === 'task' ? ' selected' : ''}>Task</option>
<option value="employee"${form.objectKind === 'employee' ? ' selected' : ''}>Nhân viên</option>
</select>
</div>
<div>
<label for="department">Phòng của task</label>
<select id="department" name="department">${departments}</select>
</div>
<div>
<label for="task_count">Số task một lệnh</label>
<input id="task_count" name="task_count" type="number" min="0" max="1000" step="1" value="${esc(form.taskCount)}">
</div>
<div>
<label for="field">Trường nhân viên</label>
<select id="field" name="field">${fields}</select>
</div>
</div>
<div class="actions">
<button type="submit"${view.personas.length === 0 ? ' disabled' : ''}>Thử quyết định</button>
</div>
</form>`;

  let result = '';
  if (view.decision.ran) {
    const outcome = view.decision.outcome;
    if (outcome === undefined) {
      result = banner('Chưa có câu trả lời.', 'bad');
    } else if (!outcome.ok) {
      result = banner(`Không hỏi được bộ luật: ${outcome.detail}`, 'bad');
    } else {
      const { decision, input } = outcome;
      const effectClass = EFFECT_CLASS[decision.effect];
      const version =
        decision.policyVersion === null ? 'không đọc được file luật' : `phiên bản ${decision.policyVersion}`;
      result = `<div class="result">
<p class="result-effect"><span class="badge ${effectClass}">${esc(EFFECT_LABEL[decision.effect])}</span></p>
<dl>
<dt>Mã lý do</dt><dd><code>${esc(decision.reasonCode)}</code></dd>
<dt>Mã luật</dt><dd><code>${esc(decision.ruleId)}</code></dd>
<dt>Phiên bản luật</dt><dd>${esc(version)}</dd>
<dt>Câu hỏi</dt><dd><code>${esc(input.actor.id)}</code> (${esc(input.actor.role)}, ${esc(input.actor.department)}), <code>${esc(input.action)}</code>, ${input.object.kind === 'task' ? 'task' : 'nhân viên'}${input.object.kind === 'task' ? ` ở phòng ${esc(input.object.department ?? '?')}, ${input.object.taskCount ?? 0} task` : ''}${input.action === 'read_employee_field' ? `, trường ${esc(input.object.field ?? '?')}` : ''}</dd>
</dl>
</div>`;
    }
  }

  return `<p class="meta">Hỏi bộ luật cổng đang áp bằng chính mã của cổng và đúng file luật đó. Không gọi tool và không đọc dữ liệu. Câu hỏi giả định khoá đủ quyền ghi; quyền đọc một trường chỉ phụ thuộc vai. Trường nhân viên chỉ dùng cho hành động "Xem một trường"; phòng và số task chỉ dùng cho đối tượng task.</p>
${formHtml}
${result}`;
}

/** The rule screen: one table for the cells, one checkbox group per role, and the decision question. */
export function permissionsPage(view: PermissionsPageView, active: NavKey): string {
  const saved =
    view.savedVersion === undefined
      ? ''
      : banner(`Đã lưu phiên bản ${view.savedVersion}. Lời gọi tiếp theo dùng luật mới, không cần khởi động lại cổng.`, 'ok');
  const restored =
    view.restoredVersion === undefined
      ? ''
      : banner(`Đã trả về bản gốc với phiên bản ${view.restoredVersion}, lớn hơn mọi bản đã có.`, 'ok');

  const selectCount = view.roles.length * TABLE_ACTIONS.length;

  const body = `<p class="sub">Sửa quyền của ${view.roles.length} vai trên cùng một file luật mà cổng đang đọc. Lưu xong, lời gọi tiếp theo, kể cả từ Thổ Thần, dùng luật mới. Không thêm vai hay hành động ở đây.</p>
${saved}
${restored}
<form method="post" action="/permissions">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<input type="hidden" name="version" value="${view.version}">
${view.fields.map((field) => `<input type="hidden" name="catalog" value="${esc(field.field)}">`).join('\n')}
<section class="panel">
<h2>Bảng vai và hành động</h2>
<p class="meta">Mỗi ô có ba lựa chọn: Được, Không được, Cần duyệt. Luật chặt nhất thắng: "không được" thắng "cần duyệt", "cần duyệt" thắng "được". Bảng rộng, vuốt ngang để xem đủ bốn vai.</p>
${matrix(view)}
<p class="meta">Đang áp <strong>phiên bản ${view.version}</strong> từ <code>${esc(view.file)}</code>. Lưu sẽ ghi phiên bản ${view.version + 1}; ${selectCount} ô được kiểm lại bằng schema của cổng.</p>
</section>
<section class="panel">
<h2>Trường nhân viên mỗi vai được xem</h2>
<p class="meta">Danh sách lấy từ bản ghi của danh bạ giả, đổi tên theo cách cổng đặt: <code>employee_id</code> hiện là <code>id</code>, <code>full_name</code> hiện là <code>name</code>. Trường mới thêm qua <code>/admin/add-field</code> tự hiện ở đây với nhãn "chưa khai". <code>version</code> không hiện vì đó là số phiên bản của bản ghi, không phải thông tin nhân viên.</p>
${fieldGrid(view)}
</section>
<section class="panel">
<h2>Ngưỡng hàng loạt</h2>
<label for="bulk_threshold">Một lệnh đổi từ bao nhiêu task thì tính là hàng loạt</label>
<input id="bulk_threshold" name="bulk_threshold" type="number" min="1" step="1" value="${view.bulkThreshold}" required>
<p class="meta">Số này áp cho mọi vai. Từ ngưỡng trở lên, ô <code>bulk_change</code> của vai cũng được xét và có thể làm câu trả lời chặt hơn.</p>
</section>
<section class="panel">
<h2>Trường của task</h2>
${taskFields(view)}
</section>
<div class="actions">
<button type="submit" name="action" value="save">Lưu phiên bản ${view.version + 1}</button>
<button type="submit" name="action" value="restore" class="secondary" formnovalidate>Về bản gốc</button>
</div>
<p class="meta">"Về bản gốc" chép nội dung <code>lab/gateway/policy/rules.json</code> và đặt phiên bản lớn hơn mọi bản đã có. Mỗi lần lưu còn giữ một bản <code>rules-history/v&lt;n&gt;.json</code> cạnh file luật.</p>
</form>
<section class="panel" id="thu-quyet-dinh">
<h2>Thử quyết định</h2>
${decisionBox(view)}
</section>`;

  return layout({ title: 'Quyền và trường', active, notices: view.notices, body });
}
