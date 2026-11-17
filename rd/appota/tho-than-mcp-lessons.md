# Thổ Thần khi AI gọi công cụ: bài học cho bản thử

Ngày: 2026-11-17. Trạng thái: đã đo đủ năm câu trên Thổ Thần desktop; còn thiếu tài khoản thứ hai và địa chỉ HTTPS từ xa.

Cách đo, bảng kết quả từng câu và dòng log cho mỗi kết luận nằm ở [báo cáo đo đầy đủ](tho-than-mcp-probe.md).
Bài này chỉ giữ điều Lab học được và điều Lab quyết định.

## Đọc nhanh

- Lab cần biết: khi AI trong Thổ Thần chuyển một việc cho nhân viên, Thổ Thần có biết ai đang hỏi và có hỏi lại trước khi làm không.
- Lab cắm một chương trình thử vào Thổ Thần desktop, chỉ dùng dữ liệu giả lập, và ghi lại mọi thứ Thổ Thần gửi sang.
- Câu trả lời là không cho cả hai câu. Thổ Thần còn cắt mọi việc sau 60 giây, không tự làm lại khi lỗi và không ghi vết.
- Vì vậy bản thử đặt mọi kiểm soát ở một cổng riêng của Lab. Người dùng bấm xác nhận trên trang của cổng, không phải trong khung chat.
- Tiếp theo: hỏi Kevin ba câu ở mục 5 và viết bản ghi quyết định đầu tiên; không câu nào chặn bản thử.

## 1. Lab đã đo gì

Bản thử của Lab chạy trong Thổ Thần, nên phải biết Thổ Thần thật sự làm gì, không đoán.
Lab viết một chương trình thử (probe) đóng vai máy chủ công cụ (MCP server): chương trình cung cấp các công cụ để AI gọi, ví dụ "chuyển task".
Probe có bảy công cụ giả, trong đó có một lệnh ghi giả "chuyển T-12 cho Minh", một công cụ cố ý báo lỗi và một công cụ chạy chậm theo số giây cho trước.
Mỗi lần Thổ Thần gọi, probe ghi một dòng log; mỗi kết quả còn có ảnh chụp màn hình.
Lab đo ngày 2026-11-16 trên Thổ Thần desktop 2.1.56, bằng một tài khoản.

| Mã | Câu hỏi | Quyết định phần nào của thiết kế |
| --- | --- | --- |
| P1 (cách nối) | Thổ Thần nối với server bằng đường nào? | Server của Lab chạy ở đâu |
| P2 (danh tính) | Server có biết ai đang hỏi không? | SR1 (danh tính và một cửa ghi) |
| P3 (kênh duyệt) | Thổ Thần có hỏi người dùng trước khi ghi không? | SR4 (điểm dừng rủi ro) |
| P4 (lỗi và thời gian chờ) | Có tự gọi lại khi lỗi không? Chờ được bao lâu? | SR6 (không ghi trùng) |
| P5 (hiển thị và vết) | Kết quả hiện ra sao? Có mã vết không? | SR7 (vết xuyên suốt) |

SR1-SR8 là tám yêu cầu bắt buộc trong [PRD của Lab](../problem/prd-ai-platform.md).

**Kết luận:** mỗi câu là một chỗ thiết kế có thể dựa vào Thổ Thần hoặc phải tự làm, và cả năm câu đã có câu trả lời kèm log.

## 2. Năm phát hiện

Độ tin cậy cao nghĩa là có log, có ảnh và lặp lại được.
Trung bình nghĩa là mới có một lần chạy hoặc một tài khoản.

| Câu hỏi | Thổ Thần làm gì | Lab phải làm gì | Tin cậy |
| --- | --- | --- | --- |
| P1 (cách nối) | Trong chat chỉ chạy được khi Thổ Thần tự mở chương trình trên máy người dùng (stdio). Nối qua địa chỉ web thì nút "Test connection" chạy, nhưng khi chat lại báo `fetch failed` và server không nhận gì. | Bản thử dùng stdio, qua một chương trình nối nhỏ chỉ chuyển lời gọi sang cổng. | Cao |
| P2 (danh tính) | Server chỉ thấy tên ứng dụng, không thấy tài khoản. Khoá riêng mà người dùng đặt vào cấu hình thì tới được server, và đổi khoá có hiệu lực ngay. | Mỗi nhân vật giả có một khoá riêng; cổng đổi khoá thành người hỏi, thu hồi được khoá và che khoá trong log. | Trung bình; cao với khoá riêng |
| P3 (kênh duyệt) | Lệnh "chuyển T-12 cho Minh" chạy ngay, kể cả ở chế độ duyệt tay. Không có biểu mẫu để server hỏi người dùng trong chat (elicitation). Link trong kết quả bấm được. | AI chỉ soạn đề xuất; người dùng xác nhận trên trang của cổng, mở bằng link. | Cao |
| P4 (lỗi và thời gian chờ) | Công cụ báo lỗi thì không ai tự gọi lại. Mọi lời gọi bị cắt ở 60 giây. Nút dừng không hủy ngay. Mỗi lần gọi là một chương trình mới, không nhớ gì từ lần trước. | Lời gọi công cụ không bao giờ ghi; mọi trạng thái lưu ở cổng. | Cao |
| P5 (hiển thị và vết) | Chỉ hiện chữ; dữ liệu có cấu trúc gửi kèm không hiện. Kết quả lỗi vẫn có dấu tích xanh. Không có mã vết, không có số token. | Lỗi và từ chối ghi rõ bằng chữ; cổng tự sinh mã vết. | Trung bình |

Ba con số đáng nhớ:

- 0 lần hỏi duyệt trong 3 lần chạy lệnh ghi giả: duyệt tự động, duyệt tay và một cuộc chat mới.
- 60 giây: việc 30 giây chạy xong; việc 60 giây và 120 giây đều bị cắt ở khoảng 60 giây.
- 1 lần gọi khi công cụ báo lỗi, cả khi có và không có lời dặn "đừng gọi lại".

**Kết luận:** Thổ Thần là nơi người dùng gõ yêu cầu và là đường chuyển lời gọi, không hơn.
Biết ai đang hỏi, hỏi duyệt trước khi ghi, chống ghi trùng và ghi vết: cả bốn việc nằm ở cổng của Lab.

## 3. Hệ quả cho bản thử đầu

### 3.1. Luồng chính

Ví dụ chị Hoa gõ "chuyển T-12 cho anh Minh":

1. AI của Thổ Thần gọi công cụ qua stdio. Chương trình nối đọc khoá của chị Hoa và chuyển lời gọi sang cổng.
2. Cổng nhận ra chị Hoa qua khoá, kiểm quyền và chỉ soạn đề xuất. Chưa có gì được ghi.
3. Cổng trả về một link xác nhận, và Thổ Thần hiện link đó trong chat.
4. Chị Hoa bấm link, xem lại đề xuất trên trang của cổng và bấm xác nhận. AI không bấm thay được.
5. Lúc đó cổng mới ghi vào danh sách task, kèm mã chống ghi trùng và mã vết.

Việc ghi không bao giờ xảy ra bên trong một lời gọi công cụ.
Nhờ vậy giới hạn 60 giây và việc thiếu bước duyệt của Thổ Thần không chạm tới phần ghi.

### 3.2. Ba điểm thực tế khi dựng

- **Cài đặt:** form cài stdio không hiện sẵn ô biến môi trường, nên phải cài bằng "Import JSON config". Đổi từ chị Hoa sang Nam chỉ cần đổi khoá, không phải mở lại ứng dụng.
- **Kiểm thử:** một client tự viết bắt chước đúng hai hành vi đã đo: mở chương trình mới cho mỗi lần gọi và cắt ở 60 giây. Thổ Thần chỉ dùng để nghiệm thu từng mốc, nên không tốn credit cho mỗi lần chạy thử.
- **Rủi ro chính:** AI của Thổ Thần tóm tắt kết quả và làm mất link xác nhận. Cách chặn là mô tả công cụ rõ bằng tiếng Việt, đặt link ở dòng riêng, và cho công cụ hỏi trạng thái trả lại link.

Việc dài như chuyển 30 task chạy nền ở cổng và trả về mã theo dõi, vì không lời gọi nào được quá 60 giây.

**Kết luận:** kiến trúc của bản thử đã rõ: chương trình nối stdio, cổng mỏng của Lab, trang xác nhận ngoài chat.
Chi tiết ở [spec bản thử](../design/mvp-spec.md).

## 4. Hệ quả cho dự án

- **Đủ bằng chứng để viết bản ghi quyết định (ADR) đầu tiên.** Hai câu từng chặn thiết kế là danh tính và kênh duyệt đã có lời đáp.
- **MCP chỉ mang lời gọi, không mang an toàn.** Trong Thổ Thần hiện tại, chuẩn MCP không cho biết ai đang hỏi và không có bước duyệt. Đây là bằng chứng đầu tiên, đo trên host thật, cho câu "khi nào MCP là lựa chọn sai" mà Track 01 phải trả lời ở cuối kỳ.
- **Cổng không phụ thuộc Thổ Thần.** Nếu sau này Thổ Thần chuyển được danh tính người dùng hoặc nối được bằng địa chỉ web, cổng giữ nguyên và chỉ đổi cách nối. Trợ lý AI thứ hai cũng dùng lại đúng cổng này cho SR8 (dùng lại, quyền theo người).
- **Ba giới hạn của nền tảng cần báo Kevin:** không chuyển danh tính người dùng, không có bước duyệt cho công cụ ghi, và nối bằng địa chỉ web thì lỗi khi chat.

**Kết luận:** phần đáng giá nhất của Lab nằm ở cổng chứ không ở Thổ Thần, nên mọi công sức đo và kiểm thử dồn vào cổng.

## 5. Còn thiếu và giới hạn

| Chưa biết | Cách trả lời | Chặn bản thử? |
| --- | --- | --- |
| Hai tài khoản có trông giống nhau ở phía server không | Chạy lại phép thử danh tính bằng tài khoản Thổ Thần thứ hai | Không, vì bản thử dùng khoá riêng |
| Vì sao nối bằng địa chỉ web thì chat lỗi | Đoán là lời gọi trong chat đi qua máy chủ Thổ Thần nên không tới được máy người dùng. Hỏi Kevin, rồi thử qua địa chỉ HTTPS công khai khi được phép | Không; chỉ chặn việc chạy cổng ở máy chủ chung |
| Server từ chối khoá sai thì chat hiện gì | Thử khi cổng có bước kiểm khoá | Không; thuộc phép thử của cổng ở mốc 1 |
| Đăng nhập ủy quyền (OAuth2) | Màn hình cấu hình chỉ có "không xác thực" và "khoá API"; hỏi Kevin có kế hoạch hỗ trợ không | Không |

Giới hạn chung: kết quả gắn với phiên bản 2.1.56, một máy, một tài khoản và số lần chạy nhỏ.
Đây là bằng chứng định tính cho thiết kế, chưa phải số đo hiệu năng hay chi phí.

Ba câu hỏi gửi Kevin:

1. Người dùng thật sẽ dùng Thổ Thần web hay desktop?
2. Thổ Thần có kế hoạch chuyển danh tính người dùng sang server MCP không?
3. Lab có được mở một địa chỉ HTTPS công khai tạm thời để thử bản web không?

**Kết luận:** không điểm nào còn thiếu chặn bản thử stdio.
Câu 1 và câu 3 chỉ quyết định có dời trọng tâm sang Thổ Thần web ở mốc 3 hay không ([tổng hợp phát hiện, mục 4](../findings.md#4-thổ-thần)).
