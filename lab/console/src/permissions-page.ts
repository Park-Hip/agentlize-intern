import { esc } from '@lab/gateway';
import type { PolicyEffect, ReadScope } from '@lab/gateway';
import { banner, layout, type NavKey, type Notice } from './layout.js';
import {
  ACTION_LABEL,
  EFFECTS,
  EFFECT_LABEL,
  SCOPES,
  SCOPE_LABEL,
  type DecisionForm,
  type DecisionOutcome,
  type FieldChoice,
  type PermissionsView,
  type ResourceView,
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

function effectOptions(selected: PolicyEffect | undefined): string {
  const unknown = `<option value=""${selected === undefined ? ' selected' : ''}>chưa khai</option>`;
  return (
    unknown +
    EFFECTS.map(
      (effect) => `<option value="${effect}"${effect === selected ? ' selected' : ''}>${esc(EFFECT_LABEL[effect])}</option>`,
    ).join('')
  );
}

function scopeOptions(selected: ReadScope): string {
  return SCOPES.map(
    (scope) => `<option value="${scope}"${scope === selected ? ' selected' : ''}>${esc(SCOPE_LABEL[scope])}</option>`,
  ).join('');
}

function bulkOptions(selected: PolicyEffect | undefined): string {
  const inherit = `<option value=""${selected === undefined ? ' selected' : ''}>Theo hiệu lực</option>`;
  return (
    inherit +
    EFFECTS.map(
      (effect) => `<option value="${effect}"${effect === selected ? ' selected' : ''}>${esc(EFFECT_LABEL[effect])}</option>`,
    ).join('')
  );
}

function readRow(view: PermissionsPageView, resource: ResourceView): string {
  const cells = view.roles
    .map((role) => {
      const scope = view.rules.resources[resource.type]?.read[role.role] ?? 'own_department';
      return `<td data-label="${esc(role.label)}"><select name="read.${esc(resource.type)}.${esc(role.role)}" aria-label="Phạm vi đọc ${esc(resource.label)} cho ${esc(role.label)}">${scopeOptions(scope)}</select></td>`;
    })
    .join('');
  return `<tr>
<th scope="row">Phạm vi đọc <span class="code">${esc(resource.type)}.read</span></th>
${cells}
</tr>`;
}

function actionRow(view: PermissionsPageView, resource: ResourceView, action: ResourceView['actions'][number]): string {
  const cells = view.roles
    .map((role) => {
      const cell = view.rules.resources[resource.type]?.actions[action]?.[role.role];
      const name = `cell.${resource.type}.${action}.${role.role}`;
      const label = ACTION_LABEL[action] ?? action;
      const badge = cell === undefined ? ' <span class="badge warn">chưa khai</span>' : '';
      return `<td data-label="${esc(role.label)}">
<span class="code">Hiệu lực</span>
<select name="${esc(name)}.effect" aria-label="${esc(label)} cho ${esc(role.label)}: hiệu lực">${effectOptions(cell?.effect)}</select>
<span class="code">Phạm vi</span>
<select name="${esc(name)}.scope" aria-label="${esc(label)} cho ${esc(role.label)}: phạm vi">${scopeOptions(cell?.scope ?? 'own_department')}</select>
<span class="code">Hàng loạt</span>
<select name="${esc(name)}.bulk" aria-label="${esc(label)} cho ${esc(role.label)}: hàng loạt">${bulkOptions(cell?.bulk)}</select>
${badge}
</td>`;
    })
    .join('');
  return `<tr>
<th scope="row">${esc(ACTION_LABEL[action] ?? action)}<span class="code">${esc(action)}</span></th>
${cells}
</tr>`;
}

function matrix(view: PermissionsPageView, resource: ResourceView): string {
  const head = view.roles.map((role) => `<th scope="col">${esc(role.label)}</th>`).join('');
  const body = [readRow(view, resource), ...resource.actions.map((action) => actionRow(view, resource, action))].join('\n');

  return `<div class="table-wrap">
<table class="matrix">
<thead><tr><th scope="col">Quyền</th>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</div>`;
}

function fieldGrid(view: PermissionsPageView, type: string, choices: readonly FieldChoice[]): string {
  const cards = view.roles
    .map((role) => {
      const checked = new Set(view.rules.resources[type]?.fields[role.role] ?? []);
      const rows = choices
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
<input type="checkbox" name="fields.${esc(type)}.${esc(role.role)}" value="${esc(field.field)}"${state}>
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

function resourcePanel(view: PermissionsPageView, resource: ResourceView): string {
  const choices = resource.type === 'employee' ? view.fields : view.taskFields;
  const thresholdName = `bulk_threshold.${resource.type}`;
  const thresholdId = `bulk_threshold_${resource.type}`;
  return `<section class="panel">
<h2>${esc(resource.label)}</h2>
<p class="meta">Mỗi ô khai ba thứ: hiệu lực, phạm vi và hiệu lực khi số mục chạm ngưỡng hàng loạt. "Chưa khai" nghĩa là hành động đó bị từ chối với mã luật <code>&lt;loại&gt;.&lt;hành động&gt;.&lt;vai&gt;.undeclared</code>.</p>
${matrix(view, resource)}
<label for="${esc(thresholdId)}">Một lệnh đổi từ bao nhiêu ${esc(resource.label.toLowerCase())} thì tính là hàng loạt</label>
<input id="${esc(thresholdId)}" name="${esc(thresholdName)}" type="number" min="1" step="1" value="${resource.bulkThreshold}" required>
<h3>Trường của ${esc(resource.label.toLowerCase())} mỗi vai được xem</h3>
${fieldGrid(view, resource.type, choices)}
</section>`;
}

function approvalPanel(view: PermissionsPageView): string {
  const roles = view.roles
    .map(
      (role) =>
        `<label class="check"><input type="checkbox" name="approver_roles" value="${esc(role.role)}"${
          view.approval.approverRoles.includes(role.role) ? ' checked' : ''
        }><span>${esc(role.label)}</span></label>`,
    )
    .join('\n');
  return `<section class="panel">
<h2>Duyệt và đếm tách nhỏ</h2>
<fieldset class="role-card">
<legend>Vai được duyệt</legend>
${roles}
</fieldset>
<label class="check"><input type="checkbox" name="approval_same_department" value="true"${
    view.approval.sameDepartment ? ' checked' : ''
  }><span>Người duyệt phải cùng phòng với người yêu cầu</span></label>
<label for="approval_wait_minutes">Số phút chờ duyệt tối đa</label>
<input id="approval_wait_minutes" name="approval_wait_minutes" type="number" min="1" step="1" value="${view.approval.waitMinutes}" required>
<label for="cumulative_window_minutes">Cửa sổ đếm tách nhỏ, tính bằng phút</label>
<input id="cumulative_window_minutes" name="cumulative_window_minutes" type="number" min="1" step="1" value="${view.cumulativeWindowMinutes}" required>
<p class="meta">Bản này mới đọc khối duyệt và cửa sổ đếm; bước duyệt trên trang và việc đếm tách nhỏ là việc của mốc sau. Bộ luật vẫn trả danh sách người duyệt đủ điều kiện cho tool soạn đề xuất.</p>
</section>`;
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
<label for="department">Phòng của bản ghi</label>
<select id="department" name="department">${departments}</select>
</div>
<div>
<label for="task_count">Số bản ghi một lệnh</label>
<input id="task_count" name="task_count" type="number" min="0" max="1000" step="1" value="${esc(form.taskCount)}">
</div>
<div>
<label for="field">Trường nhân viên</label>
<select id="field" name="field">${fields}</select>
</div>
</div>
<div class="actions rule-actions">
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
<dt>Câu hỏi</dt><dd><code>${esc(input.actor.id)}</code> (${esc(input.actor.role)}, ${esc(input.actor.department)}), <code>${esc(input.action)}</code>, ${input.object.kind === 'task' ? 'task' : 'nhân viên'}${input.object.kind === 'task' ? ` ở phòng ${esc(input.object.department ?? '?')}, ${input.object.taskCount ?? 0} bản ghi` : ''}${input.action === 'read_employee_field' ? `, trường ${esc(input.object.field ?? '?')}` : ''}</dd>
</dl>
</div>`;
    }
  }

  return `<p class="meta">Hỏi bộ luật cổng đang áp bằng chính mã của cổng và đúng file luật đó. Không gọi tool và không đọc dữ liệu. Câu hỏi giả định khoá đủ quyền ghi; quyền đọc một trường chỉ phụ thuộc vai. Trường nhân viên chỉ dùng cho hành động "Xem một trường"; phòng và số bản ghi chỉ dùng cho đối tượng task.</p>
${formHtml}
${result}`;
}

/** The page shown when the live rule file cannot be read: only the restore button still works. */
export function brokenPermissionsPage(detail: string, csrfToken: string): string {
  const body = `${banner(`${detail}. File luật không đọc được nên chưa sửa được ô nào. Bấm "Về bản gốc" để chép lại bản gốc trong mã.`, 'bad')}
<form method="post" action="/permissions">
<input type="hidden" name="csrf" value="${esc(csrfToken)}">
<input type="hidden" name="version" value="0">
<div class="actions rule-actions">
<button type="submit" name="action" value="restore">Về bản gốc</button>
</div>
</form>
<p class="meta">Bản gốc là <code>lab/gateway/policy/rules.json</code>. Bản đang có sẽ bị thay; tải lại trang sau khi chép để sửa tiếp.</p>`;
  return layout({ title: 'Quyền và trường', active: 'permissions', notices: [], body });
}

/** The rule screen: one table per record type, one checkbox group per role and resource, and the decision question. */
export function permissionsPage(view: PermissionsPageView, active: NavKey): string {
  const saved =
    view.savedVersion === undefined
      ? ''
      : banner(`Đã lưu phiên bản ${view.savedVersion}. Lời gọi tiếp theo dùng luật mới, không cần khởi động lại cổng.`, 'ok');
  const restored =
    view.restoredVersion === undefined
      ? ''
      : banner(`Đã trả về bản gốc với phiên bản ${view.restoredVersion}, lớn hơn mọi bản đã có.`, 'ok');

  const selectCount = view.resources.reduce(
    (total, resource) => total + view.roles.length * (1 + resource.actions.length * 3),
    0,
  );

  const body = `<p class="sub">Sửa quyền của ${view.roles.length} vai trên ${view.resources.length} loại bản ghi trong cùng một file luật mà cổng đang đọc. Lưu xong, lời gọi tiếp theo, kể cả từ Thổ Thần, dùng luật mới. Không thêm vai hay hành động ở đây.</p>
${saved}
${restored}
<form method="post" action="/permissions">
<input type="hidden" name="csrf" value="${esc(view.csrfToken)}">
<input type="hidden" name="version" value="${view.version}">
${view.fields.map((field) => `<input type="hidden" name="catalog.employee" value="${esc(field.field)}">`).join('\n')}
${view.taskFields.map((field) => `<input type="hidden" name="catalog.task" value="${esc(field.field)}">`).join('\n')}
${view.resources.map((resource) => resourcePanel(view, resource)).join('\n')}
${approvalPanel(view)}
<div class="actions rule-actions">
<button type="submit" name="action" value="save">Lưu phiên bản ${view.version + 1}</button>
<button type="submit" name="action" value="restore" class="secondary" formnovalidate>Về bản gốc</button>
</div>
<p class="meta">Đang áp <strong>phiên bản ${view.version}</strong> từ <code>${esc(view.file)}</code>. Lưu sẽ ghi phiên bản ${view.version + 1}; ${selectCount} ô được kiểm lại bằng schema của cổng. "Về bản gốc" chép nội dung <code>lab/gateway/policy/rules.json</code> và đặt phiên bản lớn hơn mọi bản đã có. Mỗi lần lưu còn giữ một bản <code>rules-history/v&lt;n&gt;.json</code> cạnh file luật.</p>
</form>
<section class="panel" id="thu-quyet-dinh">
<h2>Thử quyết định</h2>
${decisionBox(view)}
</section>`;

  return layout({ title: 'Quyền và trường', active, notices: view.notices, body });
}
