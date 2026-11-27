# ADR-0003: Công nghệ dựng bản thử

Ngày: 2026-11-17. Trạng thái: đã chấp nhận.

Quyết định 5 trong [spec bản thử, mục 6](../../archive/baseline/mvp-spec.md#6-kiến-trúc-tóm-tắt).

## Đọc nhanh

- Vấn đề: chọn ngôn ngữ, nơi lưu dữ liệu, cách viết bộ luật quyền và cách chia mã, sao cho bản thử chạy bằng một lệnh và kiểm được bằng một lệnh.
- Quyết định: TypeScript trên Node 22, cùng bộ công cụ MCP chính thức mà chương trình đo của Lab đã dùng.
- Dữ liệu lưu trong SQLite qua thư viện `better-sqlite3`; cổng và hai hệ thống giả là ba dịch vụ riêng trên máy.
- Bộ luật quyền do Lab tự viết, đọc một file luật dạng bảng có số phiên bản.
- Xem lại khi cổng phải chạy nhiều bản cùng lúc trên một máy chủ chung, hoặc khi luật lớn tới mức người không viết code cần sửa.

## 1. Bối cảnh

- Chương trình đo `archive/research/mcp-probe` viết bằng TypeScript, dùng SDK MCP chính thức `@modelcontextprotocol/sdk` 1.32.2 và máy chủ HTTP có sẵn của Node; giới hạn 60 giây của Thổ Thần đã được đo trên đúng bộ này.
- Máy của Lab chạy Node 22.21.
- Cổng giữ dữ liệu trong SQLite ([hướng dẫn cổng](../../lab/gateway/README.md)), hai hệ thống giả tách thành dịch vụ riêng ([spec, mục 6](../../archive/baseline/mvp-spec.md#6-kiến-trúc-tóm-tắt)), và một bộ luật quyền theo ma trận của [PRD, mục 3.2](../../rd/problem/prd-ai-platform.md#32-ai-được-làm-gì).
- Phép đo HTTPS ngày 2026-11-17 cho thấy cổng có thể phải chạy ở một máy chủ chung; ADR về nơi chạy và cách nối sẽ chốt sau khi đo xong lời gọi trong chat.

**Kết luận:** dùng lại đúng bộ công cụ đã đo trên Thổ Thần là cách ít rủi ro nhất.

## 2. Quyết định

| Hạng mục | Chọn | Lý do |
| --- | --- | --- |
| Ngôn ngữ, nền chạy | TypeScript, Node 22 trở lên | Trùng với probe và SDK MCP chính thức |
| Giao thức MCP | `@modelcontextprotocol/sdk` 1.32.2, cùng bản với probe | Hành vi với Thổ Thần đã đo trên bản này |
| Máy chủ HTTP | Máy chủ `node:http` có sẵn, một bộ định tuyến nhỏ tự viết | Dùng lại mã truyền tải của probe; khoảng mười đường dẫn không cần framework |
| Lưu dữ liệu | SQLite qua `better-sqlite3`, mỗi dịch vụ một file | Bản ổn định; ngày 2026-11-17 cài trên máy Lab mất 3 giây, có sẵn bản dựng cho Windows, không phải biên dịch |
| Bộ luật quyền | Tự viết: file luật JSON có số phiên bản, kiểm cấu trúc bằng `zod`, trả quyết định kèm mã lý do và mã luật | Ma trận nhỏ (sáu nhân vật, vài hành động); phép thử theo từng ô dễ viết |
| Trang xác nhận, duyệt, tra vết | HTML do cổng dựng, không dùng framework giao diện; mọi giá trị được thoát ký tự | Ba trang, ít trạng thái; không thêm bước build |
| Chia mã | `lab/` là một npm workspace: `shared`, `gateway`, `fake-directory`, `fake-tasks`, `tests` | Ranh giới mã trùng ranh giới tiến trình; mã lý do và kiểu dữ liệu dùng chung nằm ở `shared` |
| Cổng mạng | Cổng 8790, danh bạ giả 8791, task giả 8792, chỉ nghe ở `127.0.0.1` | Không mở ra ngoài khi chưa có ADR về nơi chạy |
| Khoá | Khoá người dùng dạng `lab_` cộng 32 byte ngẫu nhiên; lưu mã băm SHA-256; so sánh thời gian hằng; log chỉ hiện 6 ký tự đầu. Khoá dịch vụ của cổng sinh lúc khởi tạo, chỉ nằm trong biến môi trường | Khoá đủ dài nên băm một lần là đủ; repo không chứa khoá thô |
| Phép thử | `node:test` có sẵn, chạy trên mã đã build; một client giả Thổ Thần mở tiến trình mới cho mỗi lần gọi và cắt ở 60 giây | Không thêm công cụ; client giả lấy từ cách probe tự kiểm |
| Lệnh | Một lệnh khởi động cả ba dịch vụ, một lệnh chạy toàn bộ phép thử; ghi vào [AGENTS.md, mục 6](../../AGENTS.md#6-commands) khi có mã | Đúng điều kiện của [spec, mục 5.2](../../archive/baseline/mvp-spec.md#52-điểm-dừng) |

Mã truy cập SQLite nằm sau một module lưu trữ nhỏ, để đổi thư viện hay đổi sang Postgres không chạm tới phần còn lại.

**Kết luận:** mọi lựa chọn đều là bộ công cụ đã chạy trên máy Lab, và mỗi lựa chọn dễ thay nằm sau một ranh giới module.

## 3. Phương án đã xét

| Hạng mục | Phương án khác | Vì sao không chọn |
| --- | --- | --- |
| Lưu dữ liệu | `node:sqlite` có sẵn trong Node | Chạy được trên máy Lab, nhưng Node 22 còn gắn nhãn thử nghiệm và in cảnh báo mỗi lần chạy; API có thể đổi |
| Lưu dữ liệu | Postgres | Thêm một dịch vụ phải cài khi bản thử chỉ chạy một bản trên một máy |
| Bộ luật quyền | OPA (ngôn ngữ Rego) | Thêm một tiến trình hoặc gói WebAssembly và một ngôn ngữ mới cho một ma trận nhỏ |
| Bộ luật quyền | Cedar | Hợp nhất nếu luật lớn lên; giao diện quyết định của Lab giữ cùng hình dạng (ai, làm gì, trên gì, bối cảnh) để thay được |
| Máy chủ HTTP | Hono hoặc Express | Thêm một lớp giữa SDK MCP và máy chủ HTTP mà probe không cần |
| Phép thử | Vitest | Thêm một công cụ khi `node:test` đủ dùng |
| Ngôn ngữ | Python | Phải viết lại phần MCP đã đo, và đo lại giới hạn 60 giây trên SDK khác |

**Kết luận:** các phương án bị loại đều thêm một thứ phải vận hành mà bản thử chưa cần.

## 4. Hệ quả

- Lab có một thư viện biên dịch sẵn (`better-sqlite3`); máy nào không có bản dựng sẵn thì phải cài công cụ biên dịch.
- Ba dịch vụ phải khởi động đúng thứ tự; lệnh khởi động chờ hai hệ thống giả sẵn sàng rồi mới mở cổng.
- Mỗi ô của ma trận quyền là một phép thử; đổi luật là đổi file JSON, tăng số phiên bản, và chạy lại phép thử.

**Kết luận:** chi phí vận hành của bản thử là ba tiến trình và một file luật, đủ nhỏ để đo M5 (độ phức tạp vận hành).

## 5. Xem lại khi

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| ADR về nơi chạy chọn một máy chủ chung, và cổng phải chạy nhiều bản cùng lúc | Chuyển module lưu trữ sang Postgres |
| Luật vượt khoảng 50 dòng, hoặc người không viết code cần sửa luật | Thay bộ luật tự viết bằng Cedar, giữ nguyên giao diện quyết định và bộ phép thử |
| `node:sqlite` hết nhãn thử nghiệm trong bản Node Lab dùng | Cân nhắc bỏ thư viện biên dịch sẵn |

**Kết luận:** mỗi lựa chọn có đường thay rõ ràng, nên chọn cái đơn giản nhất bây giờ không khoá Lab về sau.
