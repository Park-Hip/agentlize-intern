# Lark Task và Lark Contacts bảo đảm gì khi ghi

Ngày: 2026-11-24. Trạng thái: đã đọc tài liệu công khai cho Lark Task và Lark Contacts; ô chưa có nguồn giữ "Chưa kiểm" và có cách kiểm ở R3.

## Đọc nhanh

- Cổng phải biết mỗi phần mềm đích giữ lời hứa gì khi gửi lại, khi hai người sửa cùng lúc, hay khi câu trả lời bị mất.
- Với Lark Task, tạo việc có mã chống ghi trùng trong 5 phút, nhưng chỉ khi gửi lại bằng đúng khoá truy cập cũ.
- Sửa việc trên Lark Task không có mã chống ghi trùng và không có số phiên bản, nên gửi lại có thể ghi đè.
- Lark Task có chỗ gắn dấu trong việc và có sự kiện báo việc đổi, nhưng không có cách tìm việc theo dấu.
- Lark Contacts chỉ để đọc trong Lab, nên không có bảo đảm ghi; còn lại là đo cách đọc ngay sau khi ghi trên một công ty thử.

## 1. Câu hỏi và phạm vi

Bài này trả lời việc đọc API Lark của [spec ghi an toàn, mục 4](../design/write-safety-spec.md#4-kiểm-chứng-và-thứ-tự-làm), phần còn lại sau khi #142 đã trả lời Lark Base và token người dùng.
Câu hỏi: với Lark Task v2 và Lark Contacts, mỗi giao diện lập trình (API) ghi bảo đảm được gì?
Bốn thứ cần trả lời cho từng API: có mã chống ghi trùng (idempotency key) không, có số phiên bản (version) hay ghi có điều kiện (conditional write) không, có chỗ gắn dấu và tìm theo dấu không, và giới hạn tốc độ (rate limit) báo thời gian chờ thế nào.
Bài cũng trả lời API gọi bằng khoá ứng dụng hay khoá người dùng, cần quyền (scope) nào, mã trả về nào nghĩa là "đã làm", "chưa làm" hay "không biết", và có công ty thử (test company) không.

Phần Lark Base và token người dùng đã có câu trả lời ở [#142](https://github.com/Park-Hip/agentlize-intern/issues/142), nằm trong [PR #149](https://github.com/Park-Hip/agentlize-intern/pull/149), kiểm lại bằng [`rd/checks/open-problems.sh`](../checks/open-problems.sh).
Bài này không chép lại hai phần đó, chỉ trỏ tới chúng trong bảng ở mục 2.
Phần Lark Approval đã có trong bảng năng lực và không thuộc bài này.

Cách làm: chỉ đọc tài liệu công khai của Lark Open Platform, không đăng nhập, không gọi API thật, không dùng khoá hay dữ liệu thật.
Ngày đọc: 2026-11-24.

**Kết luận:** câu trả lời đủ để điền các ô Lark Task của bản khai năng lực bằng nguồn; ba ô còn lại giữ "Chưa kiểm" và có cách kiểm ở R3 (kiểm thử trên hệ thống thật).

## 2. Bảng API tới mức bảo đảm khi ghi

Bảng dưới là bản đồ ngắn; chi tiết và câu trích nằm ở mục 3 tới 5.
Cột "Mức bảo đảm" nói điều cổng được phép tin, không nói cách cổng nên xử lý.

| API | Việc Lab dùng | Mức bảo đảm khi ghi | Nguồn |
| --- | --- | --- | --- |
| `POST /task/v2/tasks` | Tạo task mới | Tối đa một task trong 5 phút, chỉ khi cùng một khoá truy cập và cùng `client_token`; quá hạn hay token mới thì có thể tạo task thứ hai; không có upsert | [Lark Task, tổng quan](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/overview.md), [tạo task](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/create.md) |
| `PATCH /task/v2/tasks/:task_guid` | Đổi hạn, tiêu đề, mô tả, trạng thái | Không có mã chống ghi trùng, không có số phiên bản hay `If-Match`; gửi lại là ghi đè lần nữa; `updated_at` chỉ để đọc | [Lark Task, sửa task](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/patch.md) |
| `POST /task/v2/tasks/:task_guid/add_members` | Giao task cho người | Có `client_token` như tạo task; thêm lại người đã có thì Lark bỏ qua | [Lark Task, thêm thành viên](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/add_members.md) |
| `POST /task/v2/tasks/:task_guid/remove_members` | Bỏ người phụ trách cũ | Không có `client_token`; bỏ người không còn trong task thì Lark bỏ qua, nên gửi lại an toàn về hiệu ứng | [Lark Task, bỏ thành viên](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/remove_members.md) |
| `DELETE /task/v2/tasks/:task_guid` | Bù trừ khi tạo nhầm | Không có mã chống ghi trùng; xoá lặp trả 404; task đã xoá không khôi phục được | [Lark Task, xoá task](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/delete.md) |
| `GET /contact/v3/users/:user_id` | Nguồn danh bạ | Chỉ đọc, không ghi; không áp dụng | [Lark Contacts, đọc người](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/contact-v3/user/get.md) |
| `GET /contact/v3/departments/:department_id` | Nguồn danh bạ | Chỉ đọc, không ghi; không áp dụng | [Lark Contacts, đọc phòng ban](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/contact-v3/department/get.md) |
| Lark Base, tạo và sửa bản ghi | Nguồn dữ liệu khác | Đã trả lời ở #142; xem issue và script kiểm, không chép lại | [#142](https://github.com/Park-Hip/agentlize-intern/issues/142), [PR #149](https://github.com/Park-Hip/agentlize-intern/pull/149), [`rd/checks/open-problems.sh`](../checks/open-problems.sh) |
| Token người dùng Lark | Cách gọi thay cho khoá ứng dụng | Đã trả lời ở #142; xem issue và script kiểm, không chép lại | [#142](https://github.com/Park-Hip/agentlize-intern/issues/142), [PR #149](https://github.com/Park-Hip/agentlize-intern/pull/149), [`rd/checks/open-problems.sh`](../checks/open-problems.sh) |

**Kết luận:** chỉ thao tác tạo task có một thời hạn chống ghi trùng dùng được; thao tác sửa không có gì để đích tự chặn ghi đè; Contacts không phải đích ghi.

## 3. Lark Task v2

### 3.1. Tạo task

Tạo task dùng `POST /task/v2/tasks`, giới hạn 10 lệnh mỗi giây, cần quyền `task:task:write`, và nhận cả `tenant_access_token` lẫn `user_access_token` (hai loại khoá truy cập: khoá ứng dụng và khoá người dùng).
Tài liệu viết:
> This api supports "idempotent invocation" by specifying `client_token` field.
`client_token` là chuỗi 10 tới 100 ký tự, không bắt buộc; có nó thì Lark lọc lệnh trùng.

Ba chi tiết quyết định cách cổng gửi lại:

1. **Thời hạn:** "If the api is actually successful, the idempotent behavior will last for 5 minutes."
   Nếu lần gọi thất bại, cùng `client_token` được coi là mới ngay.
2. **Phạm vi:** "Idempotent behaviors between different callers are isolated."
   Tài liệu giải thích: "After access_token A uses the `client_token` to call the api, access_token B uses the same `client_token` will not be considered as an idempotent call to access_token A".
   Vì vậy đổi token giữa hai lần gửi là mất khả năng nhận ra lệnh, dù còn trong 5 phút.
3. **Nội dung:** "The behavior of an api request that uses the same `client_token` but provides different parameters is undefined."
   Lark chỉ so mã, không so nội dung, nên cổng phải giữ nguyên nội dung khi gửi lại.

Khi hai lệnh cùng mã tới cùng lúc, tài liệu viết: "When concurrently initiating multiple requests with the same `client_token` and completely identical parameters, only the first request to reach the server will be processed; the remaining requests will be automatically rejected and will receive an error code of `code:1470422`."
Mã 1470422 đi kèm HTTP 500, nên cổng không được đọc riêng mã HTTP để kết luận "lỗi máy chủ".
Mã chống ghi trùng không phải mã bản ghi: "the `client_token` cannot be used as a resource ID."
Vì vậy tạo task không phải upsert, tức không có chuyện "có mã thì sửa, chưa có thì tạo".

**Kết luận:** tạo task chỉ an toàn khi gửi lại bằng đúng token cũ, đúng nội dung, trong 5 phút; quá 5 phút hay token mới thì phải tra hoặc chuyển người xem.

### 3.2. Sửa task

Sửa task dùng `PATCH /task/v2/tasks/:task_guid` (PATCH: sửa một phần), giới hạn 10 lệnh mỗi giây, cần quyền `task:task:write`, và nhận cả hai loại token.
Lệnh gửi `task` cùng `update_fields`; tài liệu viết: "To update a task, fill in all the field names to be updated in the `update_fields` field, and fill in the new value of the field to update in the `task` field."
Trường `updated_at` có trong câu trả lời: "updated_at | string | Last updated timestamp of the task (ms)".

Trang sửa task không có `client_token`, không có `If-Match`, và không có số phiên bản.
`updated_at` chỉ được trả về, không phải điều kiện ghi.
Vì vậy đây là ghi đè không điều kiện: cổng đọc bản ghi, so với lúc soạn, rồi gửi; khe giữa lúc đọc và lúc gửi vẫn còn.

Sửa task cũng không đổi được thành viên: "Task member/reminder/tasklist data cannot be updated by this api."
Muốn đổi người phụ trách phải dùng `add_members` và `remove_members`, mỗi lệnh giới hạn 100 lần mỗi phút.

**Kết luận:** sửa task không có bảo đảm nào từ phía đích; cổng chỉ có cách đọc lại trước khi gửi và chấp nhận khe còn lại, đúng như phương án A ở [các phương án thiết kế, mục 6](../design/write-safety-options.md#6-chống-ghi-đè-khi-đích-không-có-số-phiên-bản).

### 3.3. Giao task và bỏ người phụ trách

Giao task là `POST /task/v2/tasks/:task_guid/add_members`, có `client_token`: "Idempotent token. If provided, api supports idempotent invocation."
Thêm lại người đã có thì Lark bỏ qua: "If the member to be added is already in the task, it is automatically ignored."
Bỏ người là `POST /task/v2/tasks/:task_guid/remove_members`, không có `client_token`, nhưng bỏ người không còn trong task thì Lark bỏ qua: "if the member to be removed is not one of this task members, it will be automatically ignored."
Nhờ hai tính chất đó, đổi người phụ trách bằng "thêm người mới rồi bỏ người cũ" gửi lại được mà không tạo thêm thành viên.

Hồ sơ `lark-task` ở [kế hoạch đo, mục 3](../design/q3-measurement-plan.md#3-hệ-thống-đích-giả-khó-tính) đã mô phỏng đúng hai lời gọi này: công tắc thứ mười bật `add_members` và `remove_members`, còn PATCH có người phụ trách bị từ chối.
Nhờ vậy phép đo Q3 thấy được ca nguy hiểm của P31 (một việc nhiều lời gọi): mạng rớt giữa hai lời gọi, task còn hai người phụ trách, và cổng phải gửi lại cho tới khi chỉ còn người mới.
P31 vẫn nằm ngoài phạm vi cho việc đổi nhiều hệ thống hay bù trừ khi lời gọi sau thất bại hẳn, theo [các phương án thiết kế, mục 12](../design/write-safety-options.md#12-ngoài-phạm-vi-và-vì-sao).

**Kết luận:** giao task trên Lark thật là hai lời gọi, không phải PATCH; cả hai lời gọi đều gửi lại an toàn, và hồ sơ `lark-task` giờ mô phỏng chúng để kết quả Q3 đúng cho cả thao tác giao việc.

### 3.4. Dấu gắn trong task và tra kết quả

Lark Task có hai chỗ gắn dấu:

- **`extra`:** trường tự do đi kèm task, đặt được khi tạo và khi sửa, trả về khi đọc chi tiết và khi liệt kê.
  Tài liệu gọi đây là "Custom data that accompanies the task."
- **Trường tuỳ ý (custom field) kiểu `text`:** đặt được cho task, nhưng trường phải thuộc một danh sách task (tasklist).
  Tài liệu viết: "After defining a custom field in a tasklist, you can set the field value for the tasks in the tasklist."
  Tạo task chỉ đặt được trường của tasklist mà task được thêm vào, nên dùng cách này cần biết tasklist và quyền sửa tasklist.

Bài không thấy API tìm task theo `extra` hay theo trường tuỳ ý.
Tìm task là `POST /task/v2/tasks/search`, chỉ tìm theo từ khoá trong tên, liên kết, mã và mô tả: "Search for task information using task keywords, including task name, task link, task ID, and task description."
Bộ lọc của tìm task chỉ có người tạo, người phụ trách, trạng thái hoàn thành, hạn và người theo dõi.
Liệt kê task là `GET /task/v2/tasks`, chỉ trả task của chính người gọi.
> Currently, only tasks of "my_tasks" are supported.
`my_tasks` nghĩa là danh sách việc của chính người gọi.
Bộ lọc của liệt kê chỉ có trạng thái hoàn thành, và chỉ nhận `user_access_token`.
Danh sách task của một tasklist cũng chỉ lọc theo trạng thái và thời gian tạo, và không trả `extra` hay trường tuỳ ý.

Vì vậy dấu chỉ tra được theo hai cách:

1. Cổng đã biết mã task từ câu trả lời lúc tạo, rồi gọi `GET /task/v2/tasks/:task_guid`.
2. Cổng tạo task bằng token người dùng, task nằm trong "my_tasks" của người đó, rồi liệt kê và tự lọc `extra` ở phía cổng.

Cách 2 không dùng được cho task tạo bằng `tenant_access_token`, vì liệt kê task không nhận token ứng dụng.

**Kết luận:** dấu gắn được nhưng không tìm được; nếu mất câu trả lời lúc tạo và không biết mã task, cổng không có cách tra chắc chắn, nên chuyển "cần người xem".

### 3.5. Sự kiện khi task đổi

Lark Task có sự kiện `task.task.update_user_access_v2`, đẩy qua webhook (địa chỉ nhận tin báo từ ngoài), cần quyền `task:task:read`.
Sự kiện gồm tạo, xoá, đổi tiêu đề, đổi người phụ trách, đổi trạng thái, đổi mô tả, đổi người theo dõi, đổi nhắc hạn và đổi thời gian bắt đầu hay hạn.
Đăng ký bằng giao diện `POST /task/v2/task_v2/task_subscription`, giới hạn 10 lệnh mỗi giây.

Phạm vi đăng ký khác nhau theo danh tính:

- Danh tính ứng dụng nhận sự kiện của task do ứng dụng quản lý.
- Danh tính người dùng nhận sự kiện của task do người đó tạo, quản lý hoặc theo dõi.

Phần `event` của thân sự kiện chỉ có `event_types` và `task_guid`; bài không thấy trường người sửa, giá trị cũ hay giá trị mới trong mẫu sự kiện.
Muốn biết task đang thế nào, cổng vẫn phải gọi `GET /task/v2/tasks/:task_guid`.

Sự kiện chỉ dùng được nếu cổng mở một địa chỉ nhận tin từ ngoài.
Lab hôm nay không mở cửa nhận từ ngoài, nên dùng sự kiện là thêm một quyết định kiến trúc, không phải bật một công tắc.

**Kết luận:** sự kiện bỏ được vòng hỏi lại nhưng không thay được bước đọc task, và cần mở webhook; nó không sửa được giới hạn "không tìm theo dấu".

### 3.6. Giới hạn tốc độ

Giới hạn tốc độ của Lark áp cho từng API, từng ứng dụng và từng tenant (tenant: một công ty Lark riêng): "In general, frequency control strategy levels are applied on a per-API, per-application, and per-tenant basis."
Vì vậy nhiều người dùng chung một ứng dụng cùng chia một hạn mức, không phải mỗi token một hạn mức.

Các mức đã đọc:

| API | Giới hạn |
| --- | --- |
| Tạo, sửa, đọc, xoá task, đăng ký sự kiện | 10 lệnh mỗi giây |
| Thêm, bỏ thành viên | 100 lệnh mỗi phút |
| Liệt kê task, task của tasklist | 1000 lệnh mỗi phút và 50 lệnh mỗi giây |
| Tìm task | 100 lệnh mỗi phút |
| Đọc một người trong danh bạ | 1000 lệnh mỗi phút và 50 lệnh mỗi giây |
| Đọc một phòng ban | Trang không nêu; phải đo ở R3 |

Khi vượt hạn mức, Lark trả HTTP 429 (quá nhiều yêu cầu): "When the limit threshold is exceeded, Lark will respond with an HTTP status code 429, which restricts further operations from the client for a specific duration."
Thời gian chờ nằm trong header `x-ogw-ratelimit-reset` (header: phần đầu câu trả lời), đơn vị giây.
Tài liệu chỉ nêu `x-ogw-ratelimit-reset`, không nêu `Retry-After`.
Thân câu trả lời có mã `99991400` và câu "request trigger frequency limit".
Có API cũ trả HTTP 400 thay cho 429: "For some older versions of OpenAPIs, you may receive a slightly different HTTP response (HTTP status code 400)."

**Kết luận:** cổng phải đọc mã 99991400 trong thân và header `x-ogw-ratelimit-reset`, không chỉ nhìn HTTP 429; hạn mức chia theo ứng dụng và tenant, nên một hàng đợi nhiều người dùng sẽ chạm trần nhanh hơn.

### 3.7. Khoá gọi, quyền và dữ liệu

Task nhận cả hai loại khoá truy cập (access token): "Task API supports `tenant_access_token` and `user_access_token`."
Khoá ứng dụng (`tenant_access_token`) không có quyền đặc biệt: "has NO special privileges".
Nó chỉ làm việc với task do chính ứng dụng tạo: "perform CRUD operations on the task data created by the application".
Nó cũng không đọc được task của người khác hay ứng dụng khác: "cannot access the task data belonging to other users or other applications".
Nó không phải vai quản trị tenant.
Khoá người dùng (`user_access_token`) làm việc như chính người đó trên giao diện Lark.

Cả hai loại khoá đều hết hạn: "Both `tenant_access_token` and `user_access_token` have expiration. Normally, it is about 2 hours."
Đổi khoá là đổi phạm vi nhớ mã chống ghi trùng, nên cổng phải lưu khoá đã dùng cho lần gửi đầu nếu muốn gửi lại an toàn.

Quyền cần cho task:

- `task:task:write` cho tạo, sửa, thêm và bỏ thành viên, xoá.
- `task:task:read` cho đọc, liệt kê, tìm và đăng ký sự kiện.

Với danh bạ, quyền đọc ví dụ `contact:contact:readonly` hay `contact:contact.base:readonly`, cộng quyền từng trường như số điện thoại hay phòng ban.
Quyền dữ liệu còn phụ thuộc phạm vi danh bạ mà quản trị viên cấp cho ứng dụng; ngoài phạm vi đó, API trả lỗi 41050 hay 40004.

**Kết luận:** dùng khoá ứng dụng cho task do cổng tạo, dùng khoá người dùng khi việc phải mang danh người đó hay cần đường dẫn phòng ban đầy đủ; luôn lưu khoá của lần gửi đầu để gửi lại đúng phạm vi.

### 3.8. Bảng mã trả về

Bảng dưới xếp mã của Lark Task vào ba loại mà cổng cần: đã làm, chưa làm, không biết.

| Mã | Nghĩa theo tài liệu | Xếp loại |
| --- | --- | --- |
| 0 | Thành công | Đã làm |
| 1470400 | Tham số sai, ví dụ thiếu tiêu đề | Chưa làm |
| 1470403 | Thiếu quyền sửa hay đọc task | Chưa làm |
| 1470404 | Task không tồn tại hay đã bị xoá | Chưa làm |
| 1470422 | Gửi đồng thời cùng `client_token` | Không biết, vì lệnh kia có thể đã tạo task |
| 1470500 | Lỗi máy chủ | Không biết, vì task có thể đã được tạo hay đã sửa |
| 99991400 | Vượt giới hạn tốc độ | Chưa làm, chờ theo `x-ogw-ratelimit-reset` |
| 99991663 | Khoá ứng dụng không hợp lệ | Chưa làm, lấy khoá mới |
| 99991668 | Khoá người dùng không hợp lệ | Chưa làm, lấy khoá mới |
| 99991677 | Khoá đã hết hạn | Chưa làm, lấy khoá mới |
| 99991672 | Thiếu quyền | Chưa làm |

Hai điều dễ đọc sai:

- **1470422 là HTTP 500**, nhưng nghĩa là "đang chạy cùng mã", không phải lỗi máy chủ chung.
- **99991400 có thể là HTTP 400** ở API cũ, không phải 429.

**Kết luận:** bảng mã phải theo từng API và phải đọc mã trong thân; chỉ nhìn mã HTTP sẽ xếp 1470422 vào "không biết" đúng nhưng vì sai lý do, và có thể bỏ sót 99991400.

### 3.9. Công ty thử

Lark cho tạo công ty thử.
> Lark Open Platform provides the "Test Company and User" functionality.
Mỗi nhà phát triển tạo được tối đa 3 công ty thử, mỗi công ty tối đa 100 người: "Each developer can create up to 3 test companies, with a maximum of 100 users each."
Với ứng dụng tự xây, bản thử và bản chính là hai ứng dụng độc lập: "the test version and the official version are logically two independent applications."
Đổi quyền trong bản thử có hiệu lực ngay, không cần duyệt: "Changes in the test version, such as permissions and application information, will take effect immediately without review."
Công ty thử luôn ở gói cơ bản chưa xác thực: "The version of the test enterprise will not change with the Lark version of the current tenant and is fixed to the uncertified basic version."

**Kết luận:** R3 chạy được trên công ty thử mà không dùng dữ liệu thật; phải dùng `app_id` và `app_secret` của bản thử, và nhớ rằng công ty thử không phải tenant sản xuất.

## 4. Lark Contacts

### 4.1. Đọc người dùng

Đọc một người dùng là `GET /contact/v3/users/:user_id`, giới hạn 1000 lệnh mỗi phút và 50 lệnh mỗi giây.
API nhận cả `tenant_access_token` lẫn `user_access_token`, và cần một quyền đọc danh bạ như `contact:contact:readonly` hay `contact:contact.base:readonly`.
Trường nhạy cảm có quyền riêng, ví dụ số điện thoại cần `contact:user.phone:readonly`.

Khoá ứng dụng không trả đường dẫn phòng ban đầy đủ: "When using `tenant_access_token`, the field department_path of the response will not be returned."
Trường đó chỉ lấy được bằng danh tính người dùng: "This field can only be obtained by calling the interface through user identity (user_access_token)."
Nếu chỉ cần mã phòng ban và tên phòng ban, khoá ứng dụng đủ; nếu cần cả đường dẫn từ gốc, phải dùng khoá người dùng.

Lỗi đọc thường gặp: 41050 khi người dùng ngoài phạm vi danh bạ, 41012 khi mã người dùng sai, 40003 khi lỗi nội bộ.
Đây là lỗi đọc, không phải lỗi ghi; chúng không nói lệnh ghi nào đã chạy.

**Kết luận:** danh bạ là nguồn chỉ đọc; quyền theo trường và phạm vi danh bạ quyết định thấy gì, và đường dẫn phòng ban đầy đủ cần khoá người dùng.

### 4.2. Đọc phòng ban

Đọc một phòng ban là `GET /contact/v3/departments/:department_id`, nhận cả hai loại khoá và cần quyền đọc danh bạ.
Với khoá ứng dụng, ứng dụng phải có quyền danh bạ của phòng ban đó: "When using `tenant_access_token`, the app must have the contacts scope of the department to be queried."
Với khoá người dùng, người đó phải thấy được phòng ban: "When using `user_access_token`, you must have the visibility of the department to be queried."
Trang này không nêu giới hạn tốc độ riêng, nên R3 phải đo hoặc hỏi chủ dữ liệu.

Lỗi thường gặp: 40004 khi không có quyền phòng ban, 42008 khi tenant không hợp lệ, 40015 khi phòng ban không tồn tại.

**Kết luận:** đọc phòng ban cũng chỉ đọc; quyền theo phạm vi danh bạ là điều kiện thấy dữ liệu, và giới hạn tốc độ còn để R3 đo.

### 4.3. Vì sao Lark Contacts không có bảo đảm ghi

Lab chỉ dùng Lark Contacts để đọc danh bạ, không tạo hay sửa người dùng.
Vì vậy các dòng "mã chống ghi trùng", "số phiên bản" và "bảng mã trả về" của bản khai năng lực không áp dụng cho danh bạ.
Nếu sau này Lab ghi danh bạ, phải đọc lại tài liệu tạo và sửa người dùng, và mở một việc riêng.

**Kết luận:** Lark Contacts là nguồn đọc, không phải đích ghi; đừng điền các ô ghi của bản khai bằng suy đoán từ API đọc.

## 5. Điền bản khai năng lực ở mục 2

Bảng dưới ghi các ô đã đổi trong [các phương án thiết kế, mục 2](../design/write-safety-options.md#2-đích-mô-tả-năng-lực-ghi-của-nó-thế-nào).
Mỗi ô đổi đều có nguồn ở mục 3.

| Dòng | Cột | Trước | Sau |
| --- | --- | --- | --- |
| Nhớ mã chống ghi trùng | Lark Task, tạo | 300 giây sau khi thành công | 300 giây sau khi thành công, chỉ khi cùng token |
| Gặp lại mã | Lark Task, tạo | Trả kết quả cũ | Chỉ tạo một task; không nói trả kết quả cũ |
| Tạo theo khoá ngoài (upsert) | Lark Task, tạo | Chưa kiểm | Không |
| Bảng mã trả về | Lark Task, tạo | 1470422 là đang chạy cùng mã; phần còn lại chưa kiểm | 0 đã ghi; 1470422 không biết; 1470400/1470403/1470404 chưa làm; 1470500 không biết; 99991400 chưa làm |
| Bảng mã trả về | Lark Task, sửa | Chưa kiểm | 0 đã ghi; 1470400/1470403/1470404 chưa làm; 1470500 không biết; 99991400 chưa làm |
| Tra kết quả | Lark Task, tạo | Chưa kiểm | Theo bản ghi nếu biết guid; không có API tìm theo dấu hay client_token |
| Thu hồi được | Lark Task, tạo | Chưa kiểm | Bù trừ (xoá task) |
| Giới hạn tốc độ | Lark Task, tạo | Chưa kiểm | 10 lệnh/giây mỗi ứng dụng và tenant; header `x-ogw-ratelimit-reset` |
| Giới hạn tốc độ | Lark Task, sửa | Chưa kiểm | 10 lệnh/giây mỗi ứng dụng và tenant; header `x-ogw-ratelimit-reset` |

Các ô "Chưa kiểm" còn lại của Lark Task là đọc nhất quán sau khi ghi, lịch sử ghi theo người ghi và thời gian xử lý tối đa.
Đọc nhất quán sau khi ghi (read-after-write consistency) là đọc ngay sau khi ghi có thấy bản mới không.
Lịch sử ghi theo người ghi (audit history) là đọc được ai đã sửa bản ghi.
Thời gian xử lý tối đa (max processing time) là mốc mà sau đó lệnh chắc chắn đã xong hoặc đã bị huỷ.
Tài liệu không nêu ba điều này, nên mục 7 ghi cách kiểm bằng một lần thử ở R3.
Không điền ba ô đó bằng suy đoán.

**Kết luận:** mọi ô đã điền đều có nguồn; ba ô còn lại là đúng ba hành vi tài liệu không nói, nên giữ "Chưa kiểm" và đo ở R3.

## 6. Công tắc hồ sơ `lark-task` ở kế hoạch đo

Hồ sơ `lark-task` ở [kế hoạch đo, mục 3](../design/q3-measurement-plan.md#3-hệ-thống-đích-giả-khó-tính) đã đúng ở ba điểm: nhớ 300 giây, theo từng token, và token hết hạn.
Một điểm phải sửa: Lark Task không trả 409 khi cùng mã còn chạy, mà trả HTTP 500 kèm mã 1470422.
Vì vậy dòng hồ sơ phải ghi "trả 1470422 (HTTP 500) khi cùng mã còn chạy".

Hồ sơ này đã có công tắc thứ mười cho thao tác "đổi người phụ trách": khi bật, PATCH có người phụ trách bị từ chối, còn `add_members` và `remove_members` chạy đúng như mục 3.3.
Cổng có tuỳ chọn `patch` (mặc định, giữ hành vi cũ) hoặc `members` (thêm người mới trước rồi bỏ mọi người khác); lệnh khởi động và lệnh đo tự bật `members` khi chạy hồ sơ `lark-task`.
Nhờ vậy kết quả Q3 (cổng còn ghi an toàn không khi đích không hợp tác) đúng cho cả thao tác sửa task và thao tác giao việc.

**Kết luận:** sửa mã lỗi và thêm công tắc giao việc làm hồ sơ khớp tài liệu cho tạo, PATCH và giao việc; R3 chỉ còn kiểm lại trên Lark thật.

## 7. Cách kiểm ở R3

R3 chạy trên công ty thử ở mục 3.9, với dữ liệu giả, không dùng dữ liệu thật.
Mỗi phép kiểm dưới đây điền một ô "Chưa kiểm" hoặc xác nhận một ô đã điền.

| Điều cần biết | Vì sao chưa có nguồn | Cách kiểm ở R3 | Điều kiện đạt |
| --- | --- | --- | --- |
| Đọc nhất quán sau khi ghi | Tài liệu không nói đọc ngay có thấy bản mới không | Tạo 100 task rồi đọc ngay từng task; sửa 100 task rồi đọc ngay | Ghi lại số lần đọc thấy bản cũ; nếu có, ghi độ trễ lớn nhất |
| Lịch sử ghi theo người ghi | Tài liệu không nói ai đã sửa task | Tạo bằng người A, sửa bằng người B, rồi đọc chi tiết và sự kiện | Nếu không thấy người sửa, ghi "không"; nếu có, ghi trường nào |
| Thời gian xử lý tối đa | Tài liệu không nêu mốc xong | Đo từ lúc gửi tới lúc task thấy được, 100 lần tạo và 100 lần sửa | Báo phân vị 95 và lớn nhất, tính bằng giây |
| Tra kết quả bằng dấu | Không có API tìm theo `extra` hay trường tuỳ ý | Tạo task có `extra` là mã lệnh, rồi tìm và liệt kê | Ghi cách nào tìm được; nếu không, ghi "không" |
| Giao việc hai lời gọi | Hồ sơ `lark-task` đã mô phỏng hai lời gọi, còn cần kiểm trên Lark thật | Thêm người mới, bỏ người cũ, gửi lại cả hai | Không có thành viên trùng; ghi số lời gọi |
| Giới hạn tốc độ | Số trên tài liệu có thể đổi | Gửi 20 lệnh ghi mỗi giây tới khi nhận 429 | Đọc được `x-ogw-ratelimit-reset`; chờ đúng số giây rồi gửi lại thành công |
| Công ty thử | Cần kiểm cài đặt thật | Tạo công ty thử, cài ứng dụng bản thử, chạy một lệnh tạo task | Tạo được task mà không cần dữ liệu thật |

Ba ô "Chưa kiểm" của bản khai là ba dòng đầu của bảng này.
Các dòng còn lại kiểm những điều đã điền, để phát hiện tài liệu sai hay Lark đổi hành vi.

**Kết luận:** R3 điền được ba ô còn thiếu và kiểm lại các ô đã điền; không phép kiểm nào cần dữ liệu thật.

## 8. Kết luận

Lark Task là đích đầu tiên Lab nối, và nó tách làm hai loại thao tác:

- **Tạo task:** có mã chống ghi trùng 5 phút, theo từng token.
  Cổng gửi lại an toàn khi còn trong hạn, cùng token và cùng nội dung; quá hạn hay token mới thì phải tra hoặc chuyển "cần người xem".
- **Sửa task:** không có mã chống ghi trùng và không có số phiên bản.
  Cổng chỉ có cách đọc lại trước khi gửi, chấp nhận khe còn lại, và chuyển "cần người xem" khi không chắc.
- **Giao task:** là hai lời gọi, nhưng cả hai gửi lại an toàn; hồ sơ `lark-task` đã mô phỏng chúng cho phép đo.
- **Dấu gắn:** gắn được bằng `extra` hay trường tuỳ ý, nhưng không tìm được; nếu mất mã task thì phải chuyển người xem.
- **Sự kiện:** bỏ được vòng hỏi lại, nhưng cần mở webhook và vẫn phải đọc task.
- **Danh bạ:** chỉ đọc; quyền theo trường và phạm vi danh bạ là điều kiện thấy dữ liệu.

Ba ô còn "Chưa kiểm" là đọc nhất quán sau khi ghi, lịch sử ghi theo người ghi và thời gian xử lý tối đa.
R3 đo ba ô đó trên công ty thử trước khi viết bộ tiếp hợp Lark thật.

**Kết luận:** với Lark Task, phương án C ở [các phương án thiết kế, mục 3](../design/write-safety-options.md#3-không-rõ-lệnh-đã-chạy-chưa-thì-làm-gì) chỉ đứng vững nếu cổng lưu token của lần gửi đầu và biết mã task, hay gửi lại được trong 5 phút để lấy mã task; thiếu cả hai thì lệnh phải dừng ở "cần người xem".

## Tài liệu liên quan

- [Spec ghi an toàn](../design/write-safety-spec.md)
- [Các phương án thiết kế cho việc ghi vào hệ thống thật](../design/write-safety-options.md)
- [Kế hoạch đo Q3](../design/q3-measurement-plan.md)
- [Hệ thống nghiệp vụ thật khác hệ thống giả ở đâu](target-system-gaps.md)
- [`rd/checks/lark-open-api.sh`](../checks/lark-open-api.sh)
- [`rd/checks/open-problems.sh`](../checks/open-problems.sh)
