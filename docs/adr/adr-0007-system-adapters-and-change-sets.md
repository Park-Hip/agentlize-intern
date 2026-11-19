# ADR-0007: Bộ tiếp hợp theo hệ thống, luật dạng dữ liệu và đề xuất nhiều mục

Ngày: 2026-11-19. Trạng thái: đã chấp nhận.

## Đọc nhanh

- Vấn đề: cổng hiện chỉ biết sửa task từng cái một; muốn nối thêm một hệ thống nghiệp vụ thì phải sửa khoảng mười file lõi, và việc chuyển 30 task cần một công cụ riêng mà nhân viên bình thường không nghĩ tới.
- Quyết định: mỗi hệ thống được nối qua một mảnh riêng tự khai báo dữ liệu của nó; luật quyền viết thành dữ liệu theo từng loại bản ghi; một đề xuất chứa được nhiều bản ghi.
- Chị Hoa chuyển một task hay 30 task đều dùng cùng công cụ "đổi task"; cổng tự tính khi nào cần trưởng nhóm duyệt, kể cả khi AI chia nhỏ thành nhiều lần.
- Việc ghi chạy nền sau khi người bấm, tự gửi lại khi mạng chập chờn, và chạy tiếp được sau khi cổng sập.
- Việc tiếp theo: dựng theo các issue ở mục 4, rồi mới làm kịch bản chuyển 30 task.

## 1. Bối cảnh

Ví dụ: chị Hoa gõ "chuyển hết task của chị Lan sang anh Minh".
Theo [spec, mục 4.3](../../rd/design/mvp-spec.md#43-danh-mục-tool) bản cũ, AI phải chọn đúng một tool riêng là `propose_bulk_reassign`.
Nếu AI gọi `propose_task_change` 30 lần, mỗi lần một task, thì không lần nào chạm ngưỡng 5 task, và việc chuyển 30 task chạy mà không ai duyệt.

Đọc lại mã cổng ngày 2026-11-19 cho thấy phần khung đã chung, nhưng đường ghi và bộ luật gắn cứng vào task:

| Phần | Hiện trạng | Chỗ trong mã |
| --- | --- | --- |
| Danh tính, cửa `/mcp`, `POST /v1/tools`, danh mục tool, vết | Chung; thêm một tool đọc là thêm một file và một dòng | `lab/gateway/src/server.ts` |
| Hành động trong luật | Sáu hành động cố định trong mã; mỗi vai phải khai đủ đúng sáu ô | `lab/gateway/src/policy/schema.ts` |
| "Phòng khác" và "hàng loạt" | Là điều kiện, nhưng được viết thành hai hành động riêng và chỉ áp cho task | `lab/gateway/src/policy/engine.ts` |
| Phạm vi đọc task | Nằm trong mã của tool, không qua bộ luật | `lab/gateway/src/tools/read-tools.ts` |
| Trường của task | Cố định trong mã; chỉ trường nhân viên nằm trong file luật | `lab/gateway/src/tools/read-tools.ts` |
| Đề xuất, dấu vân tay, lệnh ghi, bộ thực thi, trang xác nhận | Mỗi đề xuất một `taskId`, bốn trường của task, chỉ gọi `patchTask` | `lab/gateway/src/proposals/`, `lab/gateway/src/writes/` |
| Lối gọi hệ thống giả | Một interface `Systems` gộp danh bạ và task | `lab/gateway/src/systems.ts` |
| Gửi lại lệnh chưa rõ kết quả | Chỉ khi cổng khởi động lại; trang xác nhận chờ ghi xong mới trả lời | `lab/gateway/src/server.ts`, `lab/gateway/src/web/routes.ts` |
| Người duyệt | Nhận ra bằng chuỗi `'lead'` trong mã | `lab/gateway/src/tools/propose-tools.ts` |

Track 01 đòi một tài sản dùng lại được (Reusable Asset).
Một cổng chỉ sửa được task không phải tài sản đó.

**Kết luận:** thiếu ba thứ: một chỗ cắm cho từng hệ thống, một bộ luật không biết trước có những hệ thống nào, và một đề xuất chứa được nhiều bản ghi.

## 2. Phương án đã xét

| Phương án | Được | Mất | Kết quả |
| --- | --- | --- | --- |
| A. Giữ nguyên, thêm `propose_bulk_reassign` như spec cũ | Ít mã nhất | AI chia nhỏ là né được duyệt; mỗi hệ thống mới lại cần tool hàng loạt và hành động giả riêng; đường ghi bị chép | Loại |
| B. Chỉ cho đề xuất nhiều task, giữ đường ghi gắn với task | Giải được kịch bản 30 task | Hệ thống thứ hai vẫn phải chép đường ghi; luật vẫn không mở rộng được | Loại |
| C. Bộ tiếp hợp theo hệ thống, luật dạng dữ liệu, đề xuất nhiều mục, hàng đợi lệnh ghi | Thêm hệ thống không sửa lõi; một tool cho một việc nghiệp vụ; duyệt tính theo tác động thật | Phải viết lại bộ luật, bảng đề xuất và màn hình luật của console | **Chọn** |
| D. Sinh tool tự động từ khai báo của hệ thống (kiểu "CRUD qua MCP") | Ít tool phải viết tay | Mô tả tool do máy sinh làm AI chọn sai; mỗi việc nghiệp vụ cần câu mô tả tiếng Việt riêng; lộ cấu trúc dữ liệu cho AI | Loại |

Phương án C tốn khoảng một tuần hơn A, nhưng A và B đều để lại một lỗ hổng duyệt và một đường ghi phải chép cho mỗi hệ thống mới.

**Kết luận:** chọn C; tool vẫn viết tay cho từng việc nghiệp vụ, còn mọi thứ phía sau tool dùng chung.

## 3. Quyết định

### 3.1. Bộ tiếp hợp hệ thống

Bộ tiếp hợp hệ thống (system adapter) là phần mã của cổng nói chuyện với một hệ thống nghiệp vụ.
Mỗi bộ tiếp hợp là một module trong `lab/gateway/src/adapters/` và khai báo các loại bản ghi của hệ thống đó:

```ts
interface ActionSpec {
  readonly name: string;                 // 'change_task_assignee_or_due', tên hành động trong file luật
  readonly label: string;                // 'Đổi người phụ trách hoặc hạn', nhãn trên console
  readonly phrase: string;               // 'đổi người phụ trách hoặc hạn của task', câu từ chối
  readonly fields: readonly string[];    // ['assignee', 'due'], các trường hành động này sửa
}

interface ResourceAdapter {
  readonly type: string;                       // 'task', 'employee'
  readonly label: string;                      // 'Task', 'Nhân viên'
  readonly idPattern: RegExp;
  readonly fields: readonly FieldSpec[];       // tên, nhãn tiếng Việt, khóa trong hệ thống
  readonly ownerField: string;                 // trường cho biết bản ghi thuộc phòng nào, ví dụ 'department'
  readonly actions: readonly ActionSpec[];     // hành động của loại bản ghi, kèm trường sửa được
  get(id: string): Promise<RecordData | undefined>;
  list(filter: Filter): Promise<RecordData[]>;
  apply(write: { id: string; idempotencyKey: string; expectedVersion: number; changes: Changes }): Promise<ApplyResult>;
}
```

- `ApplyResult` giữ năm kết quả của `TaskPatchResult` hôm nay: đã ghi, xung đột phiên bản, không có bản ghi, bị từ chối, không rõ kết quả.
- Trường sửa được suy ra từ `actions`, không khai riêng, nên thêm một trường chỉ là thêm nó vào một hành động của bộ tiếp hợp.
- Bộ luật, thẻ xác nhận, câu trả lời `get_request_status` và console đọc tên hành động cùng nhãn từ đây, không giữ bảng riêng.
- Hệ thống đích phải nhận mã chống ghi trùng và số phiên bản, đúng điều kiện ở [ADR-0002, mục 4](adr-0002-safe-read-and-write.md#4-hệ-quả).
  Danh bạ giả hiện chưa nhận mã chống ghi trùng, nên phải thêm trước khi nối vào đường ghi chung.
- Interface `Systems` bị bỏ; tool và đường ghi lấy bộ tiếp hợp từ một danh sách đăng ký duy nhất.
- Tool vẫn viết tay, mỗi file một việc nghiệp vụ, và dùng chung một hàm soạn đề xuất.

### 3.2. Luật dạng dữ liệu

File luật đổi sang dạng `schema: 2`, khai theo từng loại bản ghi.
Mỗi ô là một vai với một hành động, gồm hiệu lực, phạm vi và hiệu lực khi hàng loạt:

```json
{
  "schema": 2,
  "version": 1,
  "approval": { "approver_roles": ["lead"], "same_department": true, "wait_minutes": 120 },
  "cumulative_window_minutes": 60,
  "resources": {
    "task": {
      "bulk_threshold": 5,
      "read": { "intern": "own_department", "staff": "own_department", "lead": "own_department", "hr": "own_department" },
      "fields": { "staff": ["id", "title", "description", "department", "assignee", "status", "due"] },
      "actions": {
        "change_task_assignee_or_due": {
          "intern": { "effect": "deny" },
          "staff": { "effect": "allow", "scope": "own_department", "bulk": "needs_approval" },
          "lead": { "effect": "allow", "scope": "own_department", "bulk": "allow" },
          "hr": { "effect": "allow", "scope": "own_department", "bulk": "needs_approval" }
        }
      }
    }
  }
}
```

Đoạn trên chỉ là trích; file thật khai đủ mọi vai, cả loại `employee` và hành động `edit_work_email`.

- **Phạm vi là điều kiện, không phải hành động.**
  `scope` nhận `own_department` hoặc `any`; bản ghi có `ownerField` khác phòng của người hỏi thì ô đó thành "không được".
  Hai hành động giả `edit_other_department_task` và `bulk_change` bị bỏ.
- **Hàng loạt là điều kiện của từng ô.**
  Khi số mục chạm `bulk_threshold` của loại bản ghi, ô dùng hiệu lực `bulk` thay cho `effect`, và lấy cái chặt hơn.
- **Phạm vi đọc và trường được xem nằm trong luật** cho mọi loại bản ghi, kể cả task.
  Đọc ngoài phạm vi vẫn trả "không tìm thấy" như [ADR-0002, mục 2](adr-0002-safe-read-and-write.md#2-quyết-định-về-đọc).
- **Người duyệt nằm trong luật:** vai nào duyệt, có phải cùng phòng với người yêu cầu không, chờ tối đa bao lâu.
  Cách duyệt trên trang ghi ở [ADR-0008](adr-0008-approval-page-login.md).
- **Ô chưa khai là "không được".**
  Bộ tiếp hợp mới thêm hành động mà file luật chưa có ô thì hành động đó bị từ chối, kèm mã luật `<loại>.<hành động>.<vai>.undeclared`, và console hiện "chưa khai".
  Khoá trong file mà không bộ tiếp hợp nào khai (gõ sai tên) làm cả file hỏng, và mọi lệnh bị từ chối với `POLICY_UNAVAILABLE`, theo SR5 (không chắc thì chặn).
  Cổng dựng schema của file luật từ danh sách đăng ký bộ tiếp hợp mà nó đang chạy, nên danh sách đó là nguồn duy nhất của tên hành động hợp lệ.
- **File kiểu cũ không được tự đổi.**
  Cổng gặp file `rules.json` không có `schema: 2` thì coi như file hỏng; người vận hành bấm "về bản gốc" trên console.
  Dữ liệu của Lab là giả lập nên không viết bộ chuyển đổi.

### 3.3. Đề xuất nhiều mục

- Một đề xuất gồm N mục; mỗi mục là `{hệ thống, loại bản ghi, mã, phiên bản lúc đọc, giá trị cũ, thay đổi}`.
  Đề xuất một task là trường hợp N bằng 1.
- Mọi mục trong một đề xuất cùng loại bản ghi và cùng nhóm thay đổi; trộn loại khác nhau thì phải tách đề xuất.
- Dấu vân tay tính trên danh sách mục đã sắp theo mã, nên đổi một mục hay thứ tự gửi lên đều đổi dấu vân tay.
- Mỗi mục là một lệnh ghi với mã chống ghi trùng `<mã đề xuất>:<vị trí>`, như [ADR-0002, mục 3](adr-0002-safe-read-and-write.md#3-quyết-định-về-ghi) đã định.
- `propose_task_change` nhận `task_ids` (từ 1 tới 50 mã) cùng một nhóm `changes`; tham số `task_id` cũ bị bỏ.
  Mô tả tool dặn AI gộp mọi task cùng thay đổi vào một lần gọi, sau khi lấy mã bằng `list_tasks`.
- Mã nằm ngoài phạm vi đọc làm cả đề xuất bị từ chối với câu "không tìm thấy" cho đúng các mã đó; task đã có sẵn giá trị mới thì bị bỏ khỏi đề xuất và được liệt kê.
- Lúc soạn, cổng đọc mọi mục bằng một lời gọi danh sách khi bộ tiếp hợp cho phép, để 50 mục vẫn trả lời xa dưới giới hạn 60 giây của Thổ Thần.
- `propose_bulk_reassign` không được dựng.

### 3.4. Chặn tách nhỏ để né duyệt

- Cổng đếm số mục cùng loại bản ghi, cùng hành động, do cùng người yêu cầu, trong `cumulative_window_minutes` (60 phút).
  Chỉ đếm mục của các đề xuất đang chờ bấm, đã bấm hoặc đã ghi mà chưa qua duyệt; mục đã được trưởng nhóm duyệt không bị đếm lại.
- Số mục của đề xuất mới cộng số đã đếm chạm `bulk_threshold` thì ô dùng hiệu lực `bulk`, giống một lệnh hàng loạt.
- Cổng tính lúc soạn, để AI báo trước cho người dùng, và tính lại lúc bấm Gửi trong cùng giao dịch đổi trạng thái, để hai lần bấm cùng lúc không cùng lọt.
- Khi lần tính lúc bấm Gửi cho ra "cần duyệt", đề xuất chuyển sang chờ duyệt thay vì bị từ chối, nên chị Hoa không phải soạn lại.
- Mã luật trong vết là `<loại>.<hành động>.<vai>.cumulative`, để phân biệt với hàng loạt trong một lần gọi.

### 3.5. Hàng đợi lệnh ghi chạy nền

Hàng đợi lệnh ghi (outbox) là bảng lệnh ghi đã có, cộng một vòng chạy nền trong tiến trình cổng.

- Lệnh ghi được tạo ở trạng thái "chưa gửi" trong cùng giao dịch với bước làm đề xuất chạy được: bấm Gửi khi không cần duyệt, hoặc trưởng nhóm bấm duyệt.
- Vòng chạy nền được đánh thức ngay sau giao dịch đó, và tự kiểm bảng mỗi giây phòng khi bỏ lỡ.
- Mỗi đề xuất chạy từng mục theo vị trí, một mục một lúc; trạng thái lưu trước và sau mỗi lần gửi, như hôm nay.
- Lệnh "đã gửi, chưa biết kết quả" được gửi lại với cùng mã, giãn dần từ 1 giây tới tối đa 60 giây, không giới hạn số lần; trang và `get_request_status` nói rõ "đang gửi lại".
- Khi khởi động, vòng chạy nền nhận mọi lệnh còn mở; hàm `resume()` chỉ chạy lúc khởi động bị bỏ.
- Trang xác nhận và trang duyệt trả lời ngay sau giao dịch, rồi hiện tiến độ, ví dụ "đã chuyển 17 trên 30".
- Đề xuất kết thúc ở một trong ba trạng thái: xong hết, xong một phần (có mục bị `TARGET_CHANGED`), hoặc không ghi được mục nào.
- Vòng chạy nền không kiểm lại luật trước từng mục; luật đã được kiểm lúc bấm Gửi và lúc duyệt, trên đúng nội dung có dấu vân tay.
- Cổng chạy một tiến trình duy nhất; chạy nhiều bản cổng cùng lúc cần thêm cột giữ chỗ cho lệnh, ghi ở mục 6.

Đây là phương án 1A của Q1 (sập giữa chừng) trong [câu hỏi kiểm chứng](../../rd/design/research-questions-and-validation-plan.md#a1-q1-sập-giữa-chừng); phép thử tắt cổng ở ba thời điểm kiểm nó.

### 3.6. Thêm một hệ thống nghiệp vụ

Sau ADR này, thêm một hệ thống, ví dụ đơn nghỉ phép, gồm bốn bước:

1. Hệ thống nhận mã chống ghi trùng và số phiên bản ở mỗi lệnh ghi.
2. Viết một bộ tiếp hợp trong `lab/gateway/src/adapters/`, khai loại bản ghi, nhãn tiếng Việt, trường, trường phòng và từng hành động (tên trong luật, nhãn, câu từ chối, các trường hành động sửa), rồi thêm nó vào danh sách đăng ký.
3. Khai phạm vi đọc, trường được xem và các ô của những hành động đó cho loại bản ghi mới trong file luật.
4. Viết tool cho từng việc nghiệp vụ, mỗi tool một file, và thêm ca của loại bản ghi mới vào bảng phép thử nghiệm thu.

Không phải sửa danh tính, cửa `/mcp`, lõi bộ luật, bảng đề xuất, hàng đợi lệnh ghi, các trang, thẻ xác nhận, câu trả lời `get_request_status`, vết hay console.
Bộ luật kiểm tra tên hành động theo danh sách đăng ký, còn thẻ xác nhận, câu trả lời trạng thái và console đọc nhãn từ bộ tiếp hợp.
Bằng chứng là danh bạ: chị Nhung sửa email công việc của một nhân viên qua `propose_employee_change`, đi đúng đường ghi của task.
Phép thử `lab/gateway/src/adapters/declared-fields-test.ts` thêm trường `badge` và hành động `edit_badge` vào bộ tiếp hợp danh bạ trong bộ nhớ, rồi soạn và ghi được trường đó mà không sửa `proposals/`, `policy/schema.ts`, `web/` hay `console/`.

**Kết luận:** lõi của cổng không còn biết tới task; task và danh bạ chỉ là hai bộ tiếp hợp.

## 4. Hệ quả

- Kịch bản C (chuyển 30 task cần duyệt) đi qua `propose_task_change` với 30 mã; danh mục tool không có tool hàng loạt.
- Mã đã dựng bị viết lại ở bộ luật, bảng đề xuất, bộ thực thi và màn hình luật của console; phép thử của mốc 1 và mốc 2 đổi theo tham số `task_ids`.
- Bảng đề xuất đổi cấu trúc; cổng gặp `gateway.sqlite` kiểu cũ thì dừng và báo người vận hành xoá thư mục dữ liệu, vì dữ liệu là giả lập.
- Console hiện và sửa được trường của task; dòng "trường của task cố định trong mã" ở [ADR-0006, mục 3.4](adr-0006-operator-console.md#34-sửa-quyền-và-trường) đọc theo ADR này.
  Danh sách loại bản ghi, hành động và nhãn của chúng đến từ mã của bộ tiếp hợp, nên console vẫn không thêm được hành động mới.
- Một trưởng nhóm bị thu hồi khoá sau khi duyệt không chặn được việc đang chạy nền; thu hồi chỉ có hiệu lực với lần bấm sau.
- Mốc 3 trễ khoảng một tuần, sang đầu tuần 4 ([spec, mục 9](../../rd/design/mvp-spec.md#9-bốn-mốc)).
- Các issue dựng: bộ tiếp hợp; luật dạng dữ liệu và màn hình luật; đề xuất nhiều mục; hàng đợi lệnh ghi; chặn tách nhỏ; sửa danh bạ qua đường ghi chung; phép thử mốc 3.

**Kết luận:** giá phải trả là một tuần viết lại phần lõi; đổi lại, kịch bản 30 task không có lỗ hổng duyệt và hệ thống thứ ba không chạm vào lõi.

## 5. Kiểm lại thế nào

| Điều cần đúng | Phép thử |
| --- | --- |
| Thêm loại bản ghi không sửa lõi | PR thêm `propose_employee_change` không sửa file nào trong `proposals/`, `writes/`, `policy/engine.ts`, `web/` hay `mcp.ts` |
| Bộ tiếp hợp tự khai trường sửa được và nhãn hành động | Phép thử thêm trường `badge` và hành động `edit_badge` vào bộ tiếp hợp danh bạ trong bộ nhớ: soạn và ghi được trường đó mà không sửa `proposals/`, `policy/schema.ts`, `web/` hay `console/` |
| Chia nhỏ không né được duyệt | Chị Hoa soạn và bấm Gửi 5 đề xuất một task trong 60 phút: đề xuất thứ 5 chờ duyệt; 0 lần ghi cho đề xuất đó trước khi anh Quang duyệt |
| Ô chưa khai là "không được" | Xoá một ô khỏi file luật: hành động đó bị từ chối với mã luật `.undeclared`; các hành động khác vẫn chạy |
| Tên gõ sai làm file hỏng | Thêm loại bản ghi `tsak` vào file luật: mọi lệnh bị từ chối với `POLICY_UNAVAILABLE` |
| Hàng đợi chạy tiếp sau sập | Tắt cổng trước mục đầu, giữa mục 17 và sau mục cuối trước khi báo kết quả: đủ 30 task, mỗi task đúng một lần ghi |
| Mất mạng không làm treo lệnh tới lần khởi động sau | Hệ thống task không trả lời 20 giây giữa chừng: cổng không khởi động lại mà vẫn chuyển đủ 30 task |

**Kết luận:** mỗi lời hứa của ADR có một phép thử tự động; phép thử đầu tiên kiểm chính câu "không sửa lõi".

## 6. Xem lại khi

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| Một hệ thống thật không nhận mã chống ghi trùng hoặc số phiên bản | Viết ADR cho lớp tiếp hợp yếu hơn, như [ADR-0002, mục 5](adr-0002-safe-read-and-write.md#5-xem-lại-khi) đã ghi |
| Cần chạy nhiều bản cổng cùng lúc | Thêm cột giữ chỗ có hạn cho lệnh ghi trong hàng đợi |
| Một việc cần đổi nhiều loại bản ghi cùng lúc (ví dụ chuyển task kèm đổi phòng nhân viên) | Xem lại quy tắc một loại bản ghi mỗi đề xuất |
| Luật cần điều kiện ngoài phòng, ví dụ theo dự án hay theo giờ | Xem lại cách khai `scope`, cân nhắc ngôn ngữ luật có sẵn như Cedar |
| Đếm theo cửa sổ 60 phút chặn nhầm việc thường ngày | Đổi `cumulative_window_minutes` trong file luật trước, rồi mới xem lại cách đếm |

**Kết luận:** các điểm dễ đổi nhất là cách khai phạm vi và cách đếm tách nhỏ, cả hai đều nằm trong file luật chứ không nằm trong mã.
