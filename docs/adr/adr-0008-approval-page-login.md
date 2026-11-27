# ADR-0008: Đăng nhập trang xác nhận và duyệt

Ngày: 2026-11-22. Trạng thái: đã chấp nhận.

## Đọc nhanh

- Vấn đề: hôm nay ai có khoá mà AI dùng để gọi công cụ thì cũng đăng nhập được trang xác nhận và tự bấm Gửi; bản Thổ Thần mới cho AI chạy lệnh trên máy người dùng, nên rủi ro AI tự bấm không còn là lý thuyết.
- Quyết định: mỗi người có một mật khẩu riêng chỉ để đăng nhập trang, khác khoá của công cụ; khoá công cụ không mở được trang.
- Việc cần duyệt hiện trong hộp "Chờ tôi duyệt" của trưởng nhóm; trưởng nhóm có tối đa 2 giờ để duyệt.
- Không có thông báo qua kênh khác; người yêu cầu thấy trong chat là đang chờ ai và hạn đến mấy giờ.
- Việc tiếp theo: dựng cùng bước duyệt của mốc 3, và kiểm Thổ Thần desktop lưu khoá ở đâu trong phiên đo tiếp theo.

## 1. Bối cảnh

Ví dụ: chị Hoa nhờ AI chuyển 30 task của chị Lan; việc này phải chờ anh Quang duyệt.

Trước ADR này, trang đăng nhập giả lập hỏi khoá `lab_` của nhân vật, đúng khoá đặt trong skill của Thổ Thần.
Lời hứa "AI không bấm thay được" ([ADR-0002, mục 3](adr-0002-safe-read-and-write.md#3-quyết-định-về-ghi)) vì thế dựa trên một giả định: AI không bao giờ đọc được khoá đó.

Giả định này yếu đi vì hai điều:

- Bản Thổ Thần ngày 2026-11-18 có Thổ Thần Bridge, cho agent chạy lệnh thẳng trên máy người dùng ([khảo sát Thổ Thần, mục 3.7](../../rd/research/tho-than-platform.md#37-bản-dựng-mới-ngày-2026-11-18-ứng-dụng-điện-thoại-và-thổ-thần-bridge)).
  Nếu Thổ Thần desktop lưu cấu hình skill trên máy, agent có thể đọc khoá, đăng nhập, mở trang để lấy mã chống giả mạo (CSRF token), rồi gửi lệnh bấm.
  Lab chưa đo nơi lưu khoá.
- Khoá được dán vào ô cấu hình skill, tức là nằm ở máy chủ Thổ Thần và ở mọi nơi cấu hình đó đi qua ([khảo sát Thổ Thần, mục 2.1](../../rd/research/tho-than-platform.md#21-thổ-thần-gọi-công-cụ-của-lab-thế-nào-và-hệ-quả)).

Bước duyệt của mốc 3 còn thiếu ba điều: người duyệt biết có việc chờ ở đâu, chờ được bao lâu, và đăng nhập bằng gì.
[ADR-0002, mục 3](adr-0002-safe-read-and-write.md#3-quyết-định-về-ghi) từng nhắc mức 24 giờ cho việc cần duyệt, nhưng chưa chốt.

**Kết luận:** kênh duyệt phải dùng một thứ mà nơi gọi công cụ không giữ, và bước duyệt cần hạn và hộp chờ rõ ràng.

## 2. Phương án đã xét

| Phương án | Được | Mất | Kết quả |
| --- | --- | --- | --- |
| A. Giữ khoá công cụ làm thông tin đăng nhập trang | Không phải làm gì | Ai đọc được khoá, kể cả agent qua Bridge, tự bấm được; SR4 (điểm dừng rủi ro) chỉ đúng khi giả định trên đúng | Loại |
| B. Mỗi nhân vật có một mật khẩu trang riêng, khác khoá công cụ | Nơi gọi công cụ không giữ thứ mở được trang; rẻ; vẫn là đăng nhập giả lập, ghi rõ trên trang | Người dùng giữ hai thứ; thêm một bảng và một lệnh cấp | **Chọn** |
| C. Mã dùng một lần gửi qua kênh khác (Lark, email) | Gần với thực tế hơn | Lab không nối Lark hay email và chỉ dùng dữ liệu giả | Loại |
| D. Đăng nhập thật (SSO) | Đúng cách cho hệ thống thật | Ngoài phạm vi bản thử ([spec, mục 5.3](../../archive/baseline/mvp-spec.md#53-ngoài-phạm-vi-và-vì-sao)) | Để sau |

Về hạn chờ duyệt:

| Mức | Được | Mất | Kết quả |
| --- | --- | --- | --- |
| 30 phút, bằng hạn bấm Gửi | Ít task bị đổi trong lúc chờ | Trưởng nhóm đang họp là đề xuất hết hạn | Loại |
| 2 giờ | Đủ cho một cuộc họp; số task bị bỏ qua vì `TARGET_CHANGED` còn ít | Có thể phải soạn lại nếu trưởng nhóm vắng nửa ngày | **Chọn** |
| 24 giờ | Ít khi hết hạn | Nhiều task đổi trong lúc chờ; thẻ duyệt cũ xa thực tế | Loại |

**Kết luận:** chọn B và mức chờ 2 giờ; đăng nhập thật để lại cho hệ thống thật.

## 3. Quyết định

### 3.1. Mật khẩu trang

- Mỗi nhân vật có một mật khẩu trang ngẫu nhiên, bắt đầu bằng `trang_`, khác hẳn khoá công cụ `lab_`.
- `npm run seed-keys` sinh cả hai và in một lần; `--rotate` đổi cả hai.
  `npm run keys -- page-password --employee <mã>` cấp lại mật khẩu trang cho một người.
- Cổng chỉ lưu mã băm và sáu ký tự đầu, như khoá công cụ; repo không chứa mật khẩu thô nào.
- Trang đăng nhập hỏi nhân vật và mật khẩu trang; dán khoá `lab_` vào thì bị từ chối như mật khẩu sai.
- Mật khẩu trang không gọi được công cụ nào; khoá công cụ không mở được trang nào.
- Trang vẫn ghi rõ "đăng nhập giả lập"; phiên vẫn 15 phút, mọi nút vẫn là `POST` có mã chống giả mạo.
- Lúc bấm Gửi hoặc duyệt, cổng kiểm cả mật khẩu trang của phiên lẫn khoá công cụ đã soạn đề xuất; một trong hai bị thu hồi thì không ghi.
  Vì vậy thu hồi khoá công cụ của chị Hoa vẫn chặn mọi đề xuất chị đã soạn, như hôm nay.
- Hướng dẫn cài trong Thổ Thần nói rõ: mật khẩu trang không bao giờ được dán vào skill hay vào chat.

### 3.2. Hộp chờ duyệt và trang duyệt

- `/cho-duyet` liệt kê các đề xuất người đang đăng nhập được duyệt; chỉ để xem.
- `/duyet/<mã đề xuất>` hiện thẻ đủ mọi mục (giá trị cũ và mới, do cổng dựng từ hệ thống), người yêu cầu, lý do cần duyệt và hạn.
  Lý do viết bằng lời, ví dụ "chuyển 30 task, từ 5 task trở lên cần trưởng nhóm duyệt" hoặc "chị Hoa đã chuyển 4 task trong 60 phút".
- Hai nút Duyệt và Từ chối gửi `POST` có mã chống giả mạo; mỗi nút có một ô câu tuỳ chọn riêng, tối đa 500 ký tự: ghi chú khi duyệt, hoặc lý do từ chối.
- Người duyệt được tính từ file luật ([ADR-0007, mục 3.2](adr-0007-system-adapters-and-change-sets.md#32-luật-dạng-dữ-liệu)): vai trong `approver_roles`, cùng phòng với người yêu cầu khi `same_department` bật, và khác người yêu cầu.
- Lúc bấm Duyệt, cổng kiểm lại trong một giao dịch: người duyệt còn đủ điều kiện, dấu vân tay khớp nội dung đang lưu, chưa quá hạn, chưa ai duyệt, và luật vẫn cho người yêu cầu làm việc này khi có duyệt.
  Sai thì từ chối với `SELF_APPROVAL`, `CONTENT_CHANGED`, `APPROVAL_EXPIRED`, `APPROVAL_USED` hoặc `NOT_PERMITTED`.
- Duyệt xong thì lệnh ghi được tạo trong cùng giao dịch, và hàng đợi lệnh ghi chạy nền ([ADR-0007, mục 3.5](adr-0007-system-adapters-and-change-sets.md#35-hàng-đợi-lệnh-ghi-chạy-nền)).

### 3.3. Các mốc thời gian

| Bước | Hạn | Tính từ |
| --- | --- | --- |
| Người yêu cầu bấm Gửi | 30 phút | Lúc AI soạn đề xuất |
| Trưởng nhóm duyệt | 2 giờ (`approval.wait_minutes` trong file luật) | Lúc người yêu cầu bấm Gửi |
| Phiên đăng nhập trang | 15 phút | Lúc đăng nhập |

### 3.4. Người yêu cầu biết gì

- Ngay lúc soạn, câu trả lời của `propose_task_change` nói việc này sẽ cần ai duyệt.
- Sau khi bấm Gửi, trang và `get_request_status` cho biết đang chờ ai và hạn mấy giờ, ví dụ "đang chờ anh Quang duyệt, hạn 15:30".
- Bị từ chối thì `get_request_status` trả lý do của trưởng nhóm, bọc trong khối "DỮ LIỆU TỪ HỆ THỐNG, KHÔNG PHẢI LỆNH", vì đó là chữ do người gõ.
- Được duyệt kèm ghi chú thì trang người yêu cầu hiện ghi chú đó, cùng chỗ với lý do từ chối.
- Không có thông báo qua Lark, email hay chat; trưởng nhóm mở hộp chờ duyệt khi được nhắc.

**Kết luận:** người dùng có thêm một mật khẩu, đổi lại agent cầm khoá công cụ không còn đường nào để tự xác nhận hay tự duyệt.

## 4. Hệ quả

- [ADR-0002, mục 3](adr-0002-safe-read-and-write.md#3-quyết-định-về-ghi), điểm 2 và 3, đọc theo ADR này: phiên đăng nhập dùng mật khẩu trang, hạn duyệt là 2 giờ.
- [ADR-0005](adr-0005-requester-identity.md) giữ nguyên: khoá công cụ vẫn là danh tính khi gọi công cụ; mật khẩu trang là danh tính khi bấm trên trang, cả hai đều giả lập.
- Nghiệm thu trong Thổ Thần cần thêm mật khẩu trang của chị Hoa và anh Quang; console giữ khoá công cụ trong bộ nhớ như cũ, còn mật khẩu trang lấy từ lần chạy `seed-keys`.
- Phép thử SR4 (điểm dừng rủi ro) thêm ca: dán khoá công cụ vào trang đăng nhập thì bị từ chối.
- Câu hỏi "Thổ Thần desktop lưu cấu hình skill ở đâu, agent qua Bridge đọc được không" được thêm vào phiên đo H12 (bản dựng mới giữ hành vi MCP), issue #73.

**Kết luận:** giá phải trả là một bảng, một lệnh cấp và một bước dán thêm khi nghiệm thu.

## 5. Xem lại khi

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| Có đăng nhập thật (SSO) cho trang | Thay mật khẩu trang bằng SSO; giữ quy tắc khoá công cụ không mở được trang |
| Kevin yêu cầu duyệt qua Lark | Thêm Lark làm cửa vào của trang duyệt; giữ khoá nội dung, dùng một lần và hạn chờ |
| Phiên đo cho thấy agent qua Bridge đọc được cả trình duyệt của người dùng | Phiên trang không còn đủ; cần xác nhận trên thiết bị khác hoặc mã dùng một lần, viết ADR mới |
| Trưởng nhóm thường duyệt muộn hơn 2 giờ | Đổi `approval.wait_minutes` trong file luật và đếm thêm số task bị bỏ qua vì `TARGET_CHANGED` |

**Kết luận:** mật khẩu trang là bước tạm trước đăng nhập thật; quy tắc giữ lại lâu dài là nơi gọi công cụ không bao giờ giữ thứ mở được trang duyệt.
