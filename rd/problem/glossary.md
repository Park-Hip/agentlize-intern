# Bảng thuật ngữ

Ngày: 2026-11-19. Trạng thái: bảng thuật ngữ dùng chung, cập nhật khi có thuật ngữ mới.

Thuật ngữ dùng chung cho mọi tài liệu trong repo.
Trong bài viết, ưu tiên tên tiếng Việt; tên tiếng Anh để trong ngoặc ở lần dùng đầu.

| Tiếng Việt                  | Tiếng Anh                          | Nghĩa đời thường                                                                                       |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Agent                       | Agent                              | Chương trình AI nhận yêu cầu bằng lời rồi tự gọi công cụ để làm việc.                                  |
| Tool                        | Tool                               | Một chức năng agent được phép gọi, ví dụ "tìm nhân viên" hay "cập nhật task".                          |
| Prompt                      | Prompt                             | Đoạn chữ hướng dẫn gửi kèm cho AI. AI có thể hiểu sai hoặc bỏ qua nó.                                   |
| Bộ nối                      | Connector                          | Phần code đứng giữa agent và hệ thống nghiệp vụ, nhận lời gọi tool rồi gọi hệ thống thật.              |
| Bộ tiếp hợp hệ thống        | System adapter                     | Phần code của cổng nói chuyện với một hệ thống nghiệp vụ: bản ghi có trường nào, đọc và ghi thế nào.   |
| Mô tả tool                  | Tool contract, schema              | Tên tool, các tham số và kiểu dữ liệu của từng tham số.                                                |
| Cổng kiểm soát              | Gateway, PEP                       | Cửa duy nhất mọi lệnh đọc và ghi phải đi qua; nơi thực thi luật quyền.                                 |
| Bộ luật quyền               | Policy engine, PDP                 | Nơi trả lời "cho phép, từ chối, hay cần duyệt" cho từng lệnh.                                          |
| Danh mục tool               | Registry                           | Danh sách tool đang có, mô tả của chúng và nơi chúng được phép gọi tới.                                |
| Danh tính                   | Identity                           | Thông tin cho biết ai đang yêu cầu (subject) và bên nào đang thực hiện (actor).                        |
| Duyệt                       | Approval                           | Một người có quyền xác nhận trước khi lệnh rủi ro cao được ghi.                                        |
| Dấu vân tay nội dung        | Hash, digest                       | Một chuỗi ngắn tính từ nội dung lệnh; nội dung đổi một chữ thì dấu vân tay đổi theo.                   |
| Không chắc thì chặn         | Fail-closed                        | Khi không xác định được quyền, hệ thống từ chối thay vì cho qua.                                       |
| Gửi lại                     | Retry                              | Gửi lại một lệnh khi lần trước không nhận được phản hồi.                                               |
| Chống ghi trùng             | Idempotency                        | Gửi lại cùng một lệnh thì hệ thống không làm thêm lần nữa, chỉ trả lại kết quả cũ.                     |
| Hàng đợi lệnh ghi           | Outbox                             | Bảng các lệnh ghi đã được duyệt; một vòng chạy nền gửi từng lệnh và gửi lại khi chưa rõ kết quả.       |
| Vết xuyên suốt              | Trace                              | Chuỗi bản ghi nối người yêu cầu, quyết định, thay đổi và chi phí của cùng một yêu cầu.                 |
| Sổ ghi vết                  | Observability                      | Thành phần thu và lưu các vết xuyên suốt.                                                              |
| Lần đo đầu tiên             | Baseline                           | Kết quả đo trên cách làm đơn giản nhất, dùng làm mốc so sánh.                                          |
| p50, p95                    | p50, p95 latency                   | Thời gian mà 50% (hoặc 95%) số lần chạy nhanh hơn.                                                     |
| Tốc độ xử lý                | Throughput                         | Số yêu cầu xử lý được mỗi giây.                                                                        |
| Token                       | Token                              | Đơn vị tính lượng chữ model đọc và viết, cũng là đơn vị tính tiền.                                     |
| Tài khoản dịch vụ           | Service account                    | Tài khoản cấp cho một chương trình, không cho người, ví dụ `svc-agent`.                                |
| Quyền thực tế               | Effective permission               | Quyền của người yêu cầu khi agent làm thay; nếu tác vụ tự khai báo phạm vi hẹp hơn thì lấy phần chung. |
| Nơi gọi                     | Host                               | Phần mềm người dùng mở để nói chuyện với agent, ví dụ khung chat Thổ Thần hay một công cụ lập trình.  |
| Trang điều khiển            | Console                            | Trang chỉ mở trên máy chạy cổng, để người vận hành xem tool, sửa quyền, gọi thử và xem vết.          |
| Sân chơi                    | Playground                         | Màn hình của trang điều khiển để chọn một nhân vật, gọi thử một tool và xem đúng câu trả lời AI nhận. |
