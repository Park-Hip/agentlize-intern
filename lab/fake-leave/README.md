# Hệ thống đơn nghỉ phép giả

Hệ thống giả thứ ba của Lab: nhân viên tạo đơn nghỉ phép, đơn nằm chờ quản lý trực tiếp duyệt, rồi tự chuyển sang đã duyệt hoặc bị từ chối sau một khoảng cấu hình.
Gói này bắt chước hệ thống nguồn ở mức đủ để thử hợp đồng ghi có thao tác tạo mới: không có số phiên bản, mỗi yêu cầu tạo mang một khoá cố định, và bản ghi giữ khoá đó làm dấu.

## Chạy

```
npm run build -w @lab/fake-leave
node fake-leave/dist/index.js
```

Dịch vụ đọc khoá dịch vụ từ `LAB_SERVICE_KEY` và dữ liệu từ `LAB_DATA_DIR`, giống hai hệ thống giả còn lại.
Mặc định nó mở ở `127.0.0.1:8794`; đổi bằng `LAB_LEAVE_PORT`.

Mọi đường đều cần `Authorization: Bearer <khoá dịch vụ>`, kể cả `/health`.

## Đường

| Đường | Việc |
| --- | --- |
| `POST /leave-requests` | Tạo một đơn. Cần header `Idempotency-Key`. Trả 201 và `{ request }` |
| `GET /leave-requests?employee=NV-04&date=2026-11-26` | Liệt kê đơn của một người có ngày nghỉ chứa ngày đã hỏi. Lọc thêm được `status` |
| `GET /leave-requests/:code` | Đọc một đơn theo mã, ví dụ `NP-1` |
| `GET /health` | Trả `{ status: "ok", service: "leave" }` |
| `GET /admin/created-count` | Chỉ khi `LAB_TEST_HOOKS=1`: số đơn hệ thống thật sự đã tạo |
| `POST /admin/reset` | Chỉ khi `LAB_TEST_HOOKS=1`: xoá mọi đơn và bộ nhớ khoá |

## Dữ liệu

Một đơn có các trường:

- `code`: mã đơn, dạng `NP-1`.
- `employee`: mã nhân viên, ví dụ `NV-04`.
- `department`: phòng của người xin nghỉ.
- `leave_type`: `annual`, `sick`, `personal` hoặc `unpaid`.
- `from_date`, `to_date`: ngày nghỉ, dạng `YYYY-MM-DD`; `to_date` không trước `from_date`.
- `reason`: lý do, tối đa 500 ký tự.
- `note`: nội dung thêm, tối đa 1000 ký tự, có thể rỗng.
- `status`: `pending`, `approved` hoặc `rejected`.
- `request_key`: khoá tạo đơn, giữ trên bản ghi làm dấu tra cứu.
- `created_at`, `decided_at`: thời điểm tạo và thời điểm quản lý quyết định.

Không có trường `version`.
Đơn mới luôn ở `pending`; quản lý nguồn quyết định sau `LAB_LEAVE_DECISION_DELAY_MS` mili giây.
Quyết định được ghi vào từng đơn lúc tạo, nên đổi biến môi trường sau đó không làm đổi các đơn đã có.
Việc chuyển trạng thái xảy ra ở lần đọc kế tiếp sau mốc quyết định, không cần tiến trình hẹn giờ riêng.

## Hồ sơ

| Hồ sơ | Bộ nhớ khoá tạo | Dùng cho |
| --- | --- | --- |
| `standard` | nhớ và trả lại đúng câu trả lời đầu tiên | hành vi bình thường, chống ghi trùng |
| `no-dedup` | quên khoá, tạo đơn mới cho mọi lần gửi | tái hiện lỗi một lần xin nghỉ thành hai đơn |

Đặt hồ sơ bằng `LAB_LEAVE_PROFILE`.
Hai biến còn lại là `LAB_LEAVE_DECISION_DELAY_MS` (mặc định 5000) và `LAB_LEAVE_DECISION` (`approved` hoặc `rejected`, mặc định `approved`).

## Phép thử

```
npm test -w @lab/fake-leave
```

Năm phép thử phủ: tạo đơn và đọc theo mã, theo người cùng ngày; khoá lặp trả lại đúng đơn cũ và bộ đếm vẫn là 1; hồ sơ `no-dedup` tạo hai đơn và bộ đếm là 2; quyết định của quản lý xuất hiện sau khoảng chờ; mọi đường từ chối khi thiếu khoá và bộ lọc lạ bị từ chối.

## Liên quan

- Hợp đồng ghi có thao tác tạo mới: `rd/design/write-safety-options.md`, mục 13 điểm 5.
- Bốn bước thêm một hệ thống: `docs/adr/adr-0007-system-adapters-and-change-sets.md`, mục 3.6.
- Bộ tiếp hợp của cổng: `lab/gateway/src/adapters/leave.ts`.
