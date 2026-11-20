# Đích của phép đo

Một đích là một đường ghi mà phép đo chạy thử: dựng hệ thống, gửi một đề xuất đã được duyệt, tắt ngang, khởi động lại và đọc lịch sử ghi của danh sách task giả.
Phép đo `q1-outbox` và `m2-scenarios` chỉ gọi các phương thức dưới đây, nên một đích thứ hai, ví dụ bản đối chứng Temporal, thay được mà không sửa kịch bản.

## Giao diện

Mỗi đích hiện thực `WriteTarget` trong `types.ts`.

| Phương thức | Việc |
| --- | --- |
| `build()` | Dựng đích trên cổng mạng trống và thư mục dữ liệu tạm, sẵn sàng cho một lần chạy |
| `sendProposal(input)` | Soạn đề xuất, bấm Gửi, và duyệt bằng trưởng nhóm khi luật đòi; trả về mã đề xuất và nội dung task đọc trước lần ghi đầu |
| `crash()` | Tắt đích kiểu sập: không bắt tín hiệu, không đóng cơ sở dữ liệu |
| `restart()` | Khởi động lại trên đúng thư mục dữ liệu và cổng mạng cũ |
| `outageTasks(ms)` | Cho danh sách task ngừng `ms` rồi bật lại; đích vẫn chạy |
| `history(taskIds)` | Đọc số lần ghi thật và nội dung đang lưu của từng task |
| `status(proposalId)` | Đọc trạng thái một đề xuất qua khoá của người yêu cầu |
| `observe()` | Đọc bảng vết và bảng lệnh ghi, không sửa gì |
| `scanTrace()` | Đếm dòng vết chứa tên, số liên hệ hoặc khoá, thứ bảng vết không được giữ |
| `close()` | Dừng mọi tiến trình và xoá thư mục tạm |

`sendProposal` nhận thêm hai thứ tuỳ chọn:

- `draft`: hàm tự soạn đề xuất. Kịch bản M2 dùng nó để gửi lời gọi qua từng cửa vào và qua lỗi mạng cố ý. Mặc định là cửa `http`.
- `fault`: một lỗi cài trước khi bấm Gửi, gồm làm rơi phản hồi sau khi ghi, giữ một mục trước khi ghi, hoặc giữ một mục sau khi ghi.

`ProposalRun` trả lại `baseline` là nội dung 30 task trước lần ghi đầu, để kịch bản so nội dung cuối với thẻ duyệt.
`writesBeforeApproval` đếm lần ghi đã xảy ra sau khi bấm Gửi và trước khi trưởng nhóm duyệt; con số an toàn là 0.

## Chọn đích

Kịch bản đọc biến `LAB_MEASURE_TARGET`, mặc định `gateway`.
Lệnh đo hiện chỉ nhận `--runs` và `--out`, nên `--target` chưa đi qua được; khi lệnh đo mở thêm tham số đó, chỉ phần đọc tên đích trong `index.ts` phải đổi.

## Thêm một đích

1. Viết một lớp hiện thực `WriteTarget` trong thư mục này.
2. Thêm tên vào `TARGET_NAMES` và một hàm dựng vào `FACTORIES` trong `index.ts`.

Mỗi lần chạy dựng một đích mới, nên bảng lệnh ghi và bảng vết chỉ chứa đúng lần chạy đó.
Đích giữ khoá công cụ và mật khẩu trang trong bộ nhớ; không khoá nào, không nội dung task nào được ghi vào file kết quả.
