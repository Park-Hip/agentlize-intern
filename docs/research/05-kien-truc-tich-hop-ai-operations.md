> **CHƯA REVIEW - KHÔNG TIN HOÀN TOÀN.** Bản này do agent soạn, chưa được Phạm Bách Hiệp review.
> Chưa đo gì, chưa có kết luận chọn kiến trúc.
> Trạng thái: [`../REVIEW-STATUS.md`](../REVIEW-STATUS.md).

# Kiến trúc tích hợp cho AI Operations - khung nghiên cứu

Owner: Phạm Bách Hiệp. Ngày: 2026-11-13.

File này nghiên cứu một câu hỏi hẹp: khi một agent phải đọc dữ liệu nghiệp vụ, kiểm quyền, đề xuất thay đổi và chỉ ghi sau khi có người xác nhận, thì nên lắp hệ thống theo kiến trúc nào.

Phạm vi: cách đo và ba kiến trúc ứng viên.
Ngoài phạm vi: chọn model, chọn ngôn ngữ, chọn nhà cung cấp hạ tầng.
Không phải ADR. Chưa chốt kiến trúc nào.

Miền dữ liệu dùng để nghiên cứu: hai hệ thống giả lập, một danh bạ nhân viên và một danh sách công việc.
Mọi thứ dưới đây viết cho miền đó, không giả định hệ thống thật nào.

## 1. Ràng buộc mà kiến trúc phải thỏa

Tám ràng buộc dưới đây là điều kiện đúng sai, không phải tiêu chí chấm điểm.
Chúng độc lập với việc chọn kiến trúc nào.

| Mã | Ràng buộc | Kiểm bằng |
| --- | --- | --- |
| SR1 | Mọi thay đổi đi qua một đường thực thi duy nhất, mang danh tính người yêu cầu, không phải danh tính dịch vụ | Trace ghi đúng người yêu cầu khi hai người dùng khác quyền cùng nhờ một agent |
| SR2 | Quyền được kiểm ở tầng thực thi, không bằng câu dặn trong prompt | Sửa hoặc xóa câu dặn quyền trong prompt, quyết định không đổi |
| SR3 | Quyền nói được phạm vi: trường nào, bản ghi nào, hành động nào | Agent chỉ nhận dữ liệu trong phạm vi; ngoài phạm vi bị từ chối |
| SR4 | Hành vi rủi ro cao có điểm dừng bắt buộc, gắn hash của đúng tham số, có thời hạn | Sửa tham số sau khi duyệt thì quyết định mất hiệu lực |
| SR5 | Khi không xác định được quyền thì từ chối, không cho qua | Kho quyền không trả lời, không có thay đổi nào được ghi |
| SR6 | Phân biệt "chưa gọi" với "gọi rồi nhưng chưa biết kết quả", retry không tạo bản ghi thứ hai | Cắt phản hồi sau khi ghi, retry, đếm bản ghi |
| SR7 | Một trace nối người yêu cầu, quyết định, thay đổi và chi phí | Một truy vấn trả lời được ai, lúc nào, vì sao, kết quả, chi phí |
| SR8 | Tái dùng lớp tích hợp tách khỏi tái dùng quyền | Agent thứ hai dùng lại lớp tích hợp nhưng không thừa hưởng quyền |

Không ràng buộc nào ở đây nhắc tới công nghệ.
Đó là chủ ý: công nghệ là câu trả lời, không phải yêu cầu.

## 2. Đo lường

Sáu đại lượng, không cộng thành một điểm vì khác đơn vị.
Mỗi số trong báo cáo phải truy được về một dòng ở đây và một lệnh chạy lại được.

| Mã | Đại lượng | Cách đo | Đơn vị |
| --- | --- | --- | --- |
| M1 | Độ trễ | 100 lần chạy, tách thời gian model, policy, executor, mạng | p50, p95 tính bằng ms |
| M2 | Độ ổn định | 100 lần chạy có lỗi mạng và timeout, đếm thành công, lỗi, retry, bản ghi trùng | Số đếm, tỉ lệ |
| M3 | Chi phí | Token vào ra nhân giá tại ngày đo, cộng thời gian hạ tầng, chia cho số lần ghi thành công | Tiền mỗi lần ghi thành công |
| M4 | Mở rộng | Tăng số tool từ 3 lên 30, đo p95 và tỉ lệ chọn sai hàm | p95 và tỉ lệ |
| M5 | Phức tạp vận hành | Đếm thành phần, file cấu hình, bước deploy, chỗ phải sửa khi đổi policy | Số đếm |
| M6 | Công sức tái dùng | Thêm agent thứ hai, đếm người-giờ, số dòng, số connector phải sửa | Người-giờ và số đếm |

## 3. Ba kiến trúc ứng viên

Mã A, B, C chỉ để tham chiếu, không hàm ý thứ hạng.
Cả ba dùng chung một executor và một kho policy, nên khác biệt đo được là khác biệt về kiến trúc, không phải về chất lượng mã.

### 3.1. A - executor tự viết

1. Người dùng nói trong client: "giao việc này cho người kia".
2. Client dựng danh sách hàm từ mã ứng dụng rồi gửi model.
3. Model trả về một lời gọi hàm kèm tham số.
4. Client gửi lời gọi cho executor, kèm danh tính người dùng.
5. Executor tra policy, thấy đây là hành vi cần duyệt, trả về bản nháp kèm hash tham số và hạn.
6. Người dùng xác nhận. Client gọi lại executor với hash và khoá idempotency.
7. Executor kiểm lại policy và hash, gọi hệ thống nghiệp vụ giả lập, ghi trace, trả kết quả.
8. Client trả kết quả cho model, model tóm tắt cho người dùng.

Ranh giới: executor là nơi duy nhất biết quyền và là nơi duy nhất được ghi.
Mã ứng dụng chỉ biết tên hàm.

### 3.2. B - MCP server cộng executor

Giống A từng bước, khác đúng một chỗ: bước 2 không đọc danh sách hàm từ mã ứng dụng mà liệt kê qua MCP server.

1. Bước 2 thay bằng: client kết nối MCP server, gọi `tools/list`, nhận danh mục tool kèm schema.
2. Bước 3 và sau đó giữ nguyên.
3. Lời gọi hàm đi qua MCP server tới cùng executor, hoặc executor nằm sau server.

Ranh giới: server sở hữu hợp đồng tool, executor vẫn sở hữu quyền và ghi.
Nếu quyền bị đẩy vào server thì SR8 hỏng, vì tái dùng lớp tích hợp sẽ kéo theo tái dùng quyền.

### 3.3. C - workflow engine cộng event

1. Người dùng tạo một run trên engine với tham số đầu vào.
2. Bước đọc: activity gọi danh bạ, engine ghi kết quả vào lịch sử run.
3. Bước đề xuất: activity gọi model, nhận đề xuất.
4. Bước duyệt: engine dừng, chờ tín hiệu từ người duyệt. Run nằm im, không giữ tiến trình.
5. Bước ghi: activity gọi executor với hash tham số đã duyệt.
6. Bước phát: engine phát event đã ghi xong cho consumer thứ hai.

Ranh giới: engine sở hữu thứ tự bước, trạng thái và điểm chờ. Executor vẫn sở hữu quyền và ghi.
Engine không biết quyền nghiệp vụ và không làm activity thành idempotent.
