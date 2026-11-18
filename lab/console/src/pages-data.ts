import { DEPARTMENTS } from '@lab/shared';
import { esc } from '@lab/gateway';
import type { Employee, TaskRecord } from './upstream.js';
import { employeeColumns, fieldText, statusLabel, type Paged } from './source-data.js';
import { layout, type NavKey, type Notice } from './layout.js';

export interface DataView {
  /** `undefined` shows both departments. */
  readonly department: string | undefined;
  /** `undefined` means the system could not be read, not that it holds nothing. */
  readonly employees: readonly Employee[] | undefined;
  readonly tasks: readonly TaskRecord[] | undefined;
  readonly page: Paged<TaskRecord> | undefined;
  readonly notices: readonly Notice[];
  /** Only a page that drew the test buttons has one; without `LAB_TEST_HOOKS` there is none. */
  readonly csrfToken: string | undefined;
}

function dataHref(department: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (department !== undefined) params.set('department', department);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query === '' ? '/data' : `/data?${query}`;
}

function departmentFilter(department: string | undefined): string {
  const options = [
    `<option value=""${department === undefined ? ' selected' : ''}>Cả hai phòng</option>`,
    ...DEPARTMENTS.map(
      (name) => `<option value="${esc(name)}"${department === name ? ' selected' : ''}>${esc(name)}</option>`,
    ),
  ].join('\n');
  return `<form class="filters" method="get" action="/data">
<div class="field">
<label for="department">Phòng</label>
<select id="department" name="department">
${options}
</select>
</div>
<div class="actions">
<button type="submit">Lọc</button>
<a href="/data">Xoá lọc</a>
</div>
</form>`;
}

function employeeTable(employees: readonly Employee[]): string {
  if (employees.length === 0) return '<p class="meta">Không có nhân viên nào khớp bộ lọc.</p>';

  const columns = employeeColumns(employees);
  const head = columns.map((key) => `<th scope="col"><code>${esc(key)}</code></th>`).join('');
  const rows = employees
    .map((employee) => {
      const cells = columns
        .map((key) => {
          const narrow =
            key === 'department' || key === 'role' || key === 'work_email' || key === 'personal_phone';
          return `<td class="raw-cell${narrow ? ' nowrap' : ''}" data-label="${esc(key)}">${esc(fieldText(employee.fields[key]))}</td>`;
        })
        .join('');
      return `<tr>
<th scope="row"><code>${esc(employee.employeeId)}</code></th>
<td class="num" data-label="Phiên bản">${employee.version === undefined ? '-' : employee.version}</td>
${cells}
</tr>`;
    })
    .join('\n');

  return `<div class="table-wrap">
<table class="stack raw-table">
<thead><tr><th scope="col">Mã</th><th scope="col">Phiên bản</th>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
<p class="meta">${employees.length} nhân viên. Cột là tên trường đúng như danh bạ lưu, nên một trường thêm bằng <code>POST /admin/add-field</code> cũng hiện ở đây.</p>`;
}

function statusBadge(status: string): string {
  const tone = status === 'done' ? ' ok' : status === 'doing' ? ' warn' : '';
  return `<span class="badge${tone}">${esc(statusLabel(status))}</span> <code>${esc(status)}</code>`;
}

function taskTable(page: Paged<TaskRecord>): string {
  if (page.total === 0) return '<p class="meta">Không có task nào khớp bộ lọc.</p>';

  const rows = page.items
    .map(
      (task) => `<tr>
<th scope="row"><code>${esc(task.id)}</code></th>
<td class="raw-cell" data-label="Tiêu đề">${esc(task.title)}
<details><summary>Mô tả</summary><p>${esc(task.description)}</p></details>
</td>
<td data-label="Người phụ trách"><code>${esc(task.assignee)}</code></td>
<td data-label="Phòng">${esc(task.department)}</td>
<td data-label="Trạng thái">${statusBadge(task.status)}</td>
<td class="num" data-label="Hạn">${esc(task.due)}</td>
<td class="num" data-label="Phiên bản">${task.version}</td>
</tr>`,
    )
    .join('\n');

  return `<div class="table-wrap">
<table class="stack raw-table">
<thead><tr><th scope="col">Mã</th><th scope="col">Tiêu đề</th><th scope="col">Người phụ trách</th><th scope="col">Phòng</th><th scope="col">Trạng thái</th><th scope="col">Hạn</th><th scope="col">Phiên bản</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
}

function pager(page: Paged<TaskRecord>, department: string | undefined): string {
  const links: string[] = [];
  for (let number = 1; number <= page.pages; number += 1) {
    links.push(
      number === page.page
        ? `<span aria-current="page">${number}</span>`
        : `<a href="${esc(dataHref(department, number))}">${number}</a>`,
    );
  }
  return `<nav class="pager" aria-label="Phân trang task">
${links.join('\n')}
<span class="count">Trang ${page.page}/${page.pages}, ${page.total} task.</span>
</nav>`;
}

/**
 * The buttons that exist only for tests (ADR-0006 section 3.5). They call the
 * `/admin/*` routes the fake systems already have, never a business route.
 */
function testHooksPanel(csrfToken: string): string {
  const token = `<input type="hidden" name="csrf" value="${esc(csrfToken)}">`;
  return `<section class="panel wide">
<h2>Nút dùng cho phép thử</h2>
<p class="meta">Chỉ hiện khi <code>LAB_TEST_HOOKS=1</code>. Mỗi nút gọi một đường <code>/admin/*</code> có sẵn của hệ thống giả: đặt lại dữ liệu, hoặc cho lần ghi kế tiếp mất phản hồi để cổng phải gửi lại với đúng mã chống ghi trùng.</p>
<div class="actions">
<form method="post" action="/data/directory/reset">
${token}
<button type="submit">Đặt lại danh bạ về dữ liệu gốc</button>
</form>
<form method="post" action="/data/tasks/reset">
${token}
<button type="submit">Đặt lại task về dữ liệu gốc</button>
</form>
<form method="post" action="/data/tasks/faults">
${token}
<button type="submit">Gây lỗi mất phản hồi sau khi ghi</button>
</form>
</div>
</section>`;
}

/**
 * The source data screen: the two fake systems exactly as they store, read with
 * the service key. There is no control that changes a record, because every
 * business change goes through the gateway (ADR-0006 section 3.5).
 */
export function dataPage(view: DataView, active: NavKey): string {
  const directory =
    view.employees === undefined
      ? '<p class="meta">Chưa đọc được danh bạ nên bảng nhân viên để trống.</p>'
      : employeeTable(view.employees);
  const tasks =
    view.tasks === undefined || view.page === undefined
      ? '<p class="meta">Chưa đọc được danh sách task nên bảng task để trống.</p>'
      : `${taskTable(view.page)}
${view.page.total === 0 ? '' : pager(view.page, view.department)}`;

  const body = `<p class="sub">Bảng nhân viên và bảng task đúng như hai hệ thống giả đang lưu, đọc bằng khoá dịch vụ. Trang này không có nút sửa bản ghi: mọi thay đổi nghiệp vụ đi qua cổng.</p>
<p class="operator-view"><strong>Góc nhìn người vận hành, AI không thấy thế này.</strong> AI chỉ thấy phần cổng trả về sau khi lọc trường và phạm vi phòng. Bảng ở đây là để đối chiếu, không phải một tool.</p>
${departmentFilter(view.department)}
<section class="panel wide">
<h2>Danh bạ giả</h2>
${directory}
</section>
<section class="panel wide">
<h2>Task giả</h2>
<p class="meta">Trường của task cố định trong mã nên màn hình chỉ hiện, không cho sửa. 100 task nạp cố định, 20 task mỗi trang; đổi phòng thì số trang tính lại theo danh sách đã lọc.</p>
${tasks}
</section>
${view.csrfToken === undefined ? '' : testHooksPanel(view.csrfToken)}`;

  return layout({ title: 'Dữ liệu gốc', active, notices: view.notices, body });
}
