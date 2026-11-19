# Danh bạ giả

Danh bạ 20 nhân viên giả, đứng thay cho hệ thống nhân sự thật.
Nó không kiểm quyền: nó chỉ trả lời ai mang khoá dịch vụ, nên chỉ cổng gọi được.
Mọi đường dẫn, kể cả `/health`, trả 401 khi thiếu hoặc sai `Authorization: Bearer <LAB_SERVICE_KEY>`.

## Dữ liệu

Dữ liệu nạp cố định, không ngẫu nhiên: 20 người ở hai phòng Vận hành và Kinh doanh, mỗi phòng một trưởng nhóm.
Mỗi người có mã `NV-01` đến `NV-20`, họ tên, phòng, vai (`intern`, `staff`, `lead`, `hr`), email `@lab.example`, số điện thoại cá nhân giả và địa chỉ nhà giả.

Sáu nhân vật dùng trong mọi kịch bản có mã cố định trong `shared/src/personas.ts`:

| Mã | Nhân vật |
| --- | --- |
| `NV-01` | anh Quang |
| `NV-02` | chị Hoa |
| `NV-03` | chị Lan |
| `NV-04` | anh Minh |
| `NV-05` | Nam |
| `NV-06` | chị Nhung |

Dữ liệu lưu ở `<LAB_DATA_DIR>/directory.sqlite`.
Mỗi nhân viên là một tài liệu JSON kèm mã và số phiên bản, nên thêm trường không phải đổi bảng.

## Đường

| Đường | Làm gì |
| --- | --- |
| `GET /employees?name=&department=` | Lọc theo hai trường này; tham số khác trả 400. Tên khớp theo từ nguyên vẹn, không phân biệt hoa thường và dấu; phòng phải khớp cả cụm |
| `GET /employees/<mã>` | Một nhân viên, hoặc 404 |
| `PATCH /employees/<mã>` | Ghi; cần header `Idempotency-Key` và thân `{"expected_version": 1, "changes": {"work_email": "..."}}` |

Một lần ghi được kiểm như [danh sách task giả](../fake-tasks/README.md#một-lần-ghi-được-kiểm-thế-nào): mã chống ghi trùng trước, số phiên bản sau.
Mã lỗi là 422 `idempotency_key_reused` và 409 `version_conflict`.

## Đường cho phép thử

Chỉ chạy khi `LAB_TEST_HOOKS=1`; khi biến tắt chúng trả 404.

| Đường | Làm gì |
| --- | --- |
| `POST /admin/reset` | Nạp lại dữ liệu gốc, mọi phiên bản về 1, xoá mã đã lưu và số đếm ghi |
| `POST /admin/add-field` | Thân `{"field": "badge", "value": "x"}`; thêm một trường cho mọi nhân viên |
| `GET /admin/write-count?employee=<mã>` | `{"employee", "count"}`: số lần ghi thật, không tính lần gửi lại |
