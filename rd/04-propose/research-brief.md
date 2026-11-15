# Research brief - AI Operations Connector Lab

Ngày: 2026-11-15. Trạng thái: tóm tắt tuần 1 cho buổi pitch, chưa chốt bản ghi quyết định và phạm vi bản chạy nhỏ nhất.

Tóm tắt [PRD](../00-frame/prd-ai-platform.md), [so sánh phương án](../02-compare/option-comparison.md) và [câu hỏi kiểm chứng](../03-question/research-questions-and-validation-plan.md).
Mọi người và dữ liệu đều là giả lập.

## Đọc nhanh

- AI hôm nay chạy bằng một tài khoản quyền rộng, nên ai nói chuyện được với AI cũng mượn được quyền đó.
- Không cách nối AI phổ biến nào tự kiểm quyền theo người yêu cầu hay tự chặn việc ghi hai lần.
- Đề xuất: tự dựng một cửa kiểm soát chung, rồi đo hai cách nối công cụ đặt cạnh nhau.
- Còn hai câu hỏi mở, nhưng cả hai đều có cách trả lời và không cản việc chốt cách làm.
- Tiếp theo: chốt cách làm và phạm vi bản thử trong tuần 2, rồi mới dựng.

## 1. Vấn đề

Chị Hoa ở phòng Vận hành đang họp ngoài văn phòng thì chị Lan báo nghỉ ốm.
Task T-12 "Gọi lại khách hàng X" của chị Lan cần chuyển gấp sang anh Minh, hạn thứ Sáu.

Nhờ người làm hộ thì chậm.
Nhờ AI thì nhanh, vì AI chạy bằng tài khoản `svc-agent` sửa được mọi task.
Nhưng Nam, thực tập sinh không được chuyển task, gõ đúng câu đó thì AI cũng làm, và lịch sử chỉ ghi `svc-agent`.

**Gốc vấn đề: quyền đang gắn với tài khoản bấm nút, không gắn với người thật sự yêu cầu** ([PRD, mục 1.2](../00-frame/prd-ai-platform.md#12-nguyên-nhân-gốc)).

**Kết luận:** Lab cần một cách để AI làm việc nhanh mà quyền vẫn theo đúng người yêu cầu.
PRD biến điều này thành tám yêu cầu, mỗi yêu cầu có một phép thử, ví dụ Nam nhờ chuyển T-12 thì bị từ chối ([PRD, mục 6](../00-frame/prd-ai-platform.md#6-yêu-cầu-bắt-buộc)).

## 2. Khảo sát cho thấy gì

Lab đã khảo sát năm cách nối AI với hệ thống: gọi hàm (function calling), MCP (chuẩn chung để nhiều phần mềm gọi cùng bộ công cụ), công cụ chạy quy trình (workflow engine), điều phối agent (agent orchestration) và tích hợp theo sự kiện (event-driven).
Ba phát hiện chính ([so sánh phương án, mục 2-3](../02-compare/option-comparison.md#3-mỗi-cách-đáp-ứng-tám-yêu-cầu-đến-đâu)):

- Không cách nào làm sẵn ba thứ trả lời gốc vấn đề: biết ai đang yêu cầu, kiểm quyền của người đó, và một cửa duy nhất cho mọi lần ghi.
- Không cách nào tự chặn được việc ghi hai lần khi gửi lại, hay tự chặn khi không xác định được quyền.
- Bảng so sánh không phân định được gọi hàm hay MCP tốt hơn; muốn biết phải đo trên cùng một việc.

**Kết luận:** phần chính của Lab là cửa kiểm soát tự dựng; cách nối công cụ được chọn bằng số đo, không bằng đọc tài liệu.

## 3. Đề xuất cần chốt

Chưa chốt; sau buổi pitch thành bản ghi quyết định (ADR) và đặc tả bản chạy nhỏ nhất (MVP spec).
Nguồn: [so sánh phương án, mục 4](../02-compare/option-comparison.md#4-ghép-thế-nào-để-tự-dựng-ít-nhất); phạm vi và ngoài phạm vi ở [PRD, mục 3.3](../00-frame/prd-ai-platform.md#33-phạm-vi-thử) và [mục 8.2](../00-frame/prd-ai-platform.md#82-ngoài-phạm-vi).
Phụ thuộc ([PRD, mục 8.1](../00-frame/prd-ai-platform.md#81-đã-có-và-cần-làm)): Kevin xác nhận chạy Lab độc lập trước Thổ Thần; ngân sách gọi model để đo chi phí.

### 3.1. Cách làm đề xuất

| Phần | Bản thử đầu | Vì sao |
| --- | --- | --- |
| Cửa kiểm soát, luật quyền, danh tính, vết, chống ghi trùng | Lab tự dựng | Không cách nào làm sẵn |
| Nối công cụ | Gọi hàm và MCP đặt cạnh nhau, cùng cửa kiểm soát, cùng bộ phép thử | Để số đo quyết định |
| Chờ duyệt | Ứng dụng tự lưu đề xuất đang chờ | Ít thành phần; xem lại theo Q1 |
| Điều phối agent, sự kiện | Chưa thêm | Chưa yêu cầu nào cần |

### 3.2. Phạm vi bản thử dự kiến

Dữ liệu giả gồm danh bạ khoảng 20 nhân viên và khoảng 100 task của hai phòng Vận hành và Kinh doanh.
Ba kịch bản đầu tiên phải chạy được, mỗi kịch bản để lại một vết ghi ai yêu cầu, ai duyệt, đổi gì, tốn bao nhiêu:

1. Chị Hoa nhờ AI chuyển T-12 sang anh Minh, xem thẻ đề xuất, bấm Gửi, và task được chuyển.
2. Nam gõ đúng câu đó thì bị từ chối, kèm lý do và người cần hỏi.
3. Chị Hoa nhờ chuyển 30 task của chị Lan; lệnh dừng lại chờ anh Quang duyệt.

**Kết luận:** nếu hai mục trên được chấp nhận, ADR và MVP spec viết được ngay.

## 4. Hai câu hỏi còn mở

| Câu hỏi | Ta đoán | Thử thế nào | Bác bỏ khi | Vì sao không cản việc chốt |
| --- | --- | --- | --- | --- |
| Q1. Sập giữa lúc chuyển 30 task: chạy lại có đủ, không trùng? | Ứng dụng tự viết làm được, nếu mỗi task có mã riêng và tiến độ lưu sau mỗi task | Tắt ứng dụng ở ba thời điểm, chạy lại, đếm task | Thiếu task, task chuyển hai lần, hoặc phần chạy tiếp quá rối | Có phương án mặc định; nếu sai thì thêm công cụ chạy quy trình, phần khác giữ nguyên |
| Q2. MCP tiết kiệm bao nhiêu công so với gọi hàm? | Gần bằng nhau khi Lab viết cả hai nơi gọi | Thêm trợ lý AI thứ hai cho từng cách, đếm giờ công | MCP ít công hơn rõ mà không chậm hay đắt hơn đáng kể | Lab dựng cả hai cách; câu này chỉ quyết định kết luận "khi nào không nên dùng MCP" |

**Kết luận:** Q1 trả lời khi dựng bản thử, Q2 ở bước đánh giá ([câu hỏi kiểm chứng](../03-question/research-questions-and-validation-plan.md#1-hai-câu-hỏi)).

## 5. Đo thế nào là thành công

- **Điều kiện đạt:** tám phép thử của PRD đạt trên cả hai cách nối ([PRD, mục 7](../00-frame/prd-ai-platform.md#7-bàn-giao-và-cách-đo)).
- **Năm con số bằng 0:** ghi trùng, lệnh mất, ghi vượt quyền, lộ trường ngoài quyền, lộ dữ liệu cá nhân.
- **Sáu chỉ số so hai cách:** thời gian, độ ổn định, chi phí, mở rộng, độ phức tạp vận hành, công sức dùng lại.

**Kết luận:** bộ phép thử dựng trước; mục tiêu chính thức của sáu chỉ số chốt sau lần đo đầu tiên (baseline).

## 6. Bước tiếp theo

| Khi nào | Việc | Bằng chứng xong |
| --- | --- | --- |
| Đầu tuần 2 | Viết ADR từ mục 3.1 | `docs/adr/adr-0001-<slug>.md` |
| Tuần 2 | Viết MVP spec từ mục 3.2; dựng hai hệ thống giả lập và bộ phép thử | Bộ phép thử chạy được, phần lớn còn trượt |
| Tuần 3-4 | Dựng cửa kiểm soát và hai cách nối; trả lời Q1; đo lần đầu | Ba kịch bản ở 3.2 chạy được; số đo baseline |
| Tuần 5-6 | Đánh giá, trả lời Q2 | Báo cáo có mục "khi nào không nên dùng MCP" |
