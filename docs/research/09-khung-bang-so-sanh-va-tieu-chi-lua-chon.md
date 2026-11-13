> **CHƯA REVIEW - KHUNG TÀI LIỆU, CHƯA CÓ KẾT QUẢ SO SÁNH.**
> Cấu trúc theo đề xuất được người dùng chấp thuận trong hội thoại ngày 2026-11-13.
> Chấp thuận cấu trúc không thay cho review nội dung và bằng chứng.
> Trạng thái: [`../REVIEW-STATUS.md`](../REVIEW-STATUS.md).

# Bước 02 - Bảng so sánh và tiêu chí lựa chọn

- Chủ sở hữu: Phạm Bách Hiệp.
- Mentor: Kevin.
- Ngày tạo: 2026-11-13.
- Phiên bản: khung 0.1.
- Trạng thái: chưa review, chưa điền kết quả, không phải ADR.
- Phạm vi: API/Function Calling, MCP, Workflow Engine, Agent Orchestration, Event-driven Integration.

## Điều kiện hoàn thành

- Cả năm phương pháp được phân tích theo cùng khung ở mục 3, đủ bảy trục đánh giá.
- Mọi khẳng định về nguồn ngoài có dẫn chứng gốc và điều kiện áp dụng.
- Bảng tổng hợp truy được về phân tích chi tiết, không phát sinh nhận định mới.
- Yêu cầu dùng để đối chiếu đã được xác nhận và ghi nguồn cụ thể.
- Tiêu chí lựa chọn có cách kiểm tra; không tự đặt điểm, trọng số hoặc ngưỡng chưa thống nhất.
- Phần thiếu bằng chứng được ghi rõ và chuyển thành câu hỏi cho bước 03.
- Người review kiểm nội dung và nguồn theo quy tắc trong sổ trạng thái.

## 1. Mục đích và phạm vi so sánh

### 1.1. Mục đích

[Điền câu hỏi quyết định mà tài liệu hỗ trợ và người sử dụng kết quả.]

Đây là đầu ra của bước 02 Compare.
Tài liệu làm rõ đánh đổi và điều kiện lựa chọn, chưa chốt phương án hoặc thay thế ADR ở bước 04.

### 1.2. Bối cảnh và nhu cầu

[Điền bài toán, phạm vi hệ thống và nhu cầu đã xác nhận, kèm nguồn và trạng thái review.]

Không dùng bản nháp chưa review làm bằng chứng hoặc kế thừa số liệu và kết luận chưa kiểm tra.

### 1.3. Đơn vị và giới hạn so sánh

Năm phương pháp có thể đảm nhiệm những vai trò khác nhau và kết hợp với nhau.
Không mặc định chúng là năm kiến trúc hoàn chỉnh thay thế trực tiếp cho nhau.

| Phương pháp | Vai trò được khảo sát | Ranh giới cơ chế | Sản phẩm triển khai được xét, nếu có |
| --- | --- | --- | --- |
| API/Function Calling | [Điền] | [Điền] | [Điền] |
| MCP | [Điền] | [Điền] | [Điền] |
| Workflow Engine | [Điền] | [Điền] | [Điền] |
| Agent Orchestration | [Điền] | [Điền] | [Điền] |
| Event-driven Integration | [Điền] | [Điền] | [Điền] |

[Ghi phần ngoài phạm vi, giả định chung và điều kiện chưa xác minh.]

## 2. Tiêu chí và quy tắc đánh giá

### 2.1. Bảy trục đánh giá

| Tiêu chí | Câu hỏi cần trả lời |
| --- | --- |
| Ưu điểm | Đem lại lợi ích gì, cho ai, trong điều kiện nào? |
| Nhược điểm | Phải đánh đổi điều gì, giới hạn nào xuất hiện trước? |
| Khả năng mở rộng | Khi tăng số công cụ, hệ thống, agent hoặc lượt chạy, thành phần nào phải thay đổi và giới hạn nằm ở đâu? |
| Chi phí | Phát sinh khoản nào: hạ tầng, dịch vụ, lượt gọi mô hình, truyền dữ liệu và vận hành; đơn vị tính là gì? |
| Bảo mật | Hỗ trợ xác thực, phân quyền, quản lý bí mật và kiểm soát thao tác ghi bằng cơ chế nào; phần nào phải tự bổ sung? |
| Bảo trì | Thay đổi API/schema, nâng phiên bản, kiểm thử và truy vết lỗi ảnh hưởng đến đâu? |
| Độ phù hợp với nhu cầu | Hỗ trợ yêu cầu nào, cần bổ sung gì, không phù hợp trong trường hợp nào? |

### 2.2. Quy tắc bằng chứng

- Phân biệt cơ chế trong đặc tả, khả năng của sản phẩm triển khai và kết quả đo trên lab.
- Nhận xét theo cấu trúc: đặc điểm → hệ quả → điều kiện áp dụng → nguồn.
- Lập luận của người viết phải có tiền đề và được phân biệt với phát biểu của nguồn.
- Chưa đo thì ghi `Chưa đo`, không gán mức cao/thấp như kết quả thực nghiệm.
- Chưa xác minh thì ghi `Chưa xác minh`, không diễn giải thành không có hoặc không hỗ trợ.
- Khi dẫn giá, ghi sản phẩm, đơn vị tính, khu vực và ngày kiểm tra nếu có liên quan.
- Không dùng giá niêm yết thay cho tổng chi phí của một lượt chạy thực tế.
- Chi phí là một trục đánh giá, không mặc định quan trọng hơn chất lượng, độ đơn giản, độ vững chắc và khả năng bảo trì.

## 3. Phân tích từng phương pháp

Mỗi mục 3.1 đến 3.5 dùng đủ chín trường sau khi điền nội dung.

| Trường | Nội dung cần điền |
| --- | --- |
| a. Cơ chế và vai trò | Giải quyết việc gì, nằm ở đâu trong hệ thống, không đảm nhiệm việc gì |
| b. Ưu điểm | Lợi ích, đối tượng hưởng lợi và điều kiện áp dụng |
| c. Nhược điểm | Đánh đổi, giới hạn và tình huống thất bại |
| d. Khả năng mở rộng | Đại lượng tăng, thành phần phải đổi, giới hạn và nguồn |
| e. Chi phí | Khoản phát sinh, đơn vị tính, giả định và phần chưa đo |
| f. Bảo mật | Cơ chế sẵn có, trách nhiệm của bên triển khai và rủi ro còn lại |
| g. Bảo trì | Phạm vi ảnh hưởng của thay đổi, kiểm thử, nâng phiên bản và chẩn đoán lỗi |
| h. Độ phù hợp với nhu cầu | Yêu cầu được hỗ trợ, phần phải bổ sung và điều kiện không phù hợp |
| i. Bằng chứng và điểm chưa xác minh | Mã nguồn, lập luận, câu hỏi mở và cách kiểm chứng |

### 3.1. API/Function Calling

[Chưa điền nội dung a-i.]

### 3.2. MCP

[Chưa điền nội dung a-i.]

### 3.3. Workflow Engine

[Chưa điền nội dung a-i.]

### 3.4. Agent Orchestration

[Chưa điền nội dung a-i.]

### 3.5. Event-driven Integration

[Chưa điền nội dung a-i.]

## 4. Bảng so sánh tổng hợp

Chỉ tóm tắt phân tích ở mục 3 và dẫn về mục hoặc mã bằng chứng tương ứng.
Trong từng ô, ưu tiên ghi có gì, phải bổ sung gì và phụ thuộc gì thay cho nhãn tốt/kém.

### 4.1. Lợi ích, giới hạn và mức phù hợp

| Phương pháp | Ưu điểm chính | Nhược điểm chính | Phù hợp khi | Không phù hợp khi |
| --- | --- | --- | --- | --- |
| API/Function Calling | [Điền] | [Điền] | [Điền] | [Điền] |
| MCP | [Điền] | [Điền] | [Điền] | [Điền] |
| Workflow Engine | [Điền] | [Điền] | [Điền] | [Điền] |
| Agent Orchestration | [Điền] | [Điền] | [Điền] | [Điền] |
| Event-driven Integration | [Điền] | [Điền] | [Điền] | [Điền] |

### 4.2. Các đánh đổi kỹ thuật

| Phương pháp | Khả năng mở rộng | Chi phí phát sinh | Bảo mật | Bảo trì |
| --- | --- | --- | --- | --- |
| API/Function Calling | [Điền] | [Điền] | [Điền] | [Điền] |
| MCP | [Điền] | [Điền] | [Điền] | [Điền] |
| Workflow Engine | [Điền] | [Điền] | [Điền] | [Điền] |
| Agent Orchestration | [Điền] | [Điền] | [Điền] | [Điền] |
| Event-driven Integration | [Điền] | [Điền] | [Điền] | [Điền] |

## 5. Đối chiếu với nhu cầu của hệ thống

Chỉ điền yêu cầu từ nguồn đã xác nhận và đủ điều kiện sử dụng.
Phân biệt có cơ chế hỗ trợ, cần triển khai bổ sung và chưa đủ bằng chứng.
Không đồng nhất có hỗ trợ với đã đáp ứng.

| Yêu cầu đã xác nhận và nguồn | Phương pháp hỗ trợ và vai trò | Phần phải bổ sung | Bằng chứng | Điều cần kiểm chứng |
| --- | --- | --- | --- | --- |
| [Mã, nội dung, nguồn] | [Điền] | [Điền] | [Điền] | [Điền] |

## 6. Tiêu chí lựa chọn

### 6.1. Điều kiện bắt buộc

Điều kiện áp dụng cho phương án triển khai trong bối cảnh cụ thể, không mặc định áp dụng cho từng phương pháp đứng riêng.
Mỗi điều kiện phải gắn với yêu cầu đã xác nhận và có cách kiểm tra.

| Điều kiện | Xuất phát từ yêu cầu nào | Cách kiểm tra | Hệ quả nếu không đáp ứng |
| --- | --- | --- | --- |
| [Điền] | [Điền] | [Điền] | [Điền] |

### 6.2. Tiêu chí phân biệt các phương án

Dùng để cân nhắc các phương án đạt điều kiện bắt buộc.
Chưa đặt tổng điểm hoặc trọng số khi chưa thống nhất cơ sở chấm.
Nếu dùng điểm về sau, phải định nghĩa thang điểm và kiểm tra việc thay đổi trọng số có làm đảo kết luận hay không.

| Khi nhu cầu ưu tiên là | Cơ chế cần tìm | Phương pháp đáng xem xét | Đánh đổi phải chấp nhận | Bằng chứng còn thiếu |
| --- | --- | --- | --- | --- |
| [Điền] | [Điền] | [Điền] | [Điền] | [Điền] |

## 7. Kết luận so sánh và vấn đề còn mở

### 7.1. Khác biệt quan trọng

[Tổng hợp các khác biệt đã có bằng chứng, dẫn về mục 3-5.]

### 7.2. Điều kiện cân nhắc hoặc loại khỏi một vai trò

[Nêu điều kiện cụ thể, không tuyên bố một phương pháp thắng tuyệt đối hoặc chọn kiến trúc tại bước này.]

### 7.3. Câu hỏi chuyển sang bước 03

| Câu hỏi còn mở | Khoảng trống bằng chứng | Ảnh hưởng đến lựa chọn | Cách kiểm chứng dự kiến |
| --- | --- | --- | --- |
| [Điền] | [Điền] | [Điền] | [Điền] |

## Tài liệu tham khảo

Chưa có nguồn nghiên cứu được đưa vào khung này.
Bảng sau là mẫu ghi nguồn, không phải bằng chứng đã kiểm tra.

| Mã nguồn | Tên và URL gốc | Phiên bản/ngày công bố | Ngày kiểm tra | Nội dung hỗ trợ và vị trí trong nguồn |
| --- | --- | --- | --- | --- |
| [Điền] | [Điền] | [Điền] | [Điền] | [Điền] |
