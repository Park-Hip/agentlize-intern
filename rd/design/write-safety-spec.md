# Spec ghi an toàn vào hệ thống nghiệp vụ thật

Ngày: 2026-11-27. Trạng thái: vấn đề đã rõ và có bằng chứng; đã đọc nguồn ngoài; thiết kế còn là đề xuất, chờ số đo Q3 trước khi viết ADR-0009.

## Đọc nhanh

- Trợ lý AI của Lab chỉ soạn đề xuất; sau khi người duyệt, cổng của Lab gửi lệnh ghi sang phần mềm nghiệp vụ, như danh sách việc hay ví điện tử.
- Khi mạng chập chờn, cổng có lúc không biết lệnh đã được ghi hay chưa: gửi lại thì có thể làm hai lần, không gửi thì có thể mất việc đã duyệt.
- Trên phần mềm giả của Lab, cổng xử lý đúng chuyện này 300 trên 300 lần, vì phần mềm giả luôn nhận ra lệnh gửi lại; Lark Task chỉ nhận ra trong 5 phút, và không nhận ra lệnh sửa.
- Lab đã có vài cách sửa để so sánh, nhưng chưa chọn cách nào.
- Việc tiếp theo: đo cách làm hôm nay trên phần mềm giả bắt chước Lark Task để làm mốc, rồi mới chọn.

## Ai đọc file nào

Nội dung chi tiết nằm ở ba file riêng; file này chỉ giữ phần chung.

| Người đọc | Cần biết gì | Đọc |
| --- | --- | --- |
| Quản lý và người không làm kỹ thuật | Vấn đề là gì, có thật không, Lab làm gì tiếp | File này |
| Mentor duyệt hướng nghiên cứu | Câu hỏi, các phương án, cách đo, việc cần quyết | File này, [các phương án thiết kế](write-safety-options.md), [kế hoạch đo](q3-measurement-plan.md) |
| Chủ hệ thống nghiệp vụ và chủ dữ liệu, ví dụ người quản trị Lark của công ty | Cổng làm gì với hệ thống của mình, cần mình khai và cho phép gì | [Khảo sát hệ thống thật](../research/target-system-gaps.md), [các phương án thiết kế, mục 2](write-safety-options.md#2-đích-mô-tả-năng-lực-ghi-của-nó-thế-nào) |
| Kỹ sư làm cổng và bộ tiếp hợp, kể cả agent lập trình | Phương án, hệ thống giả, phép đo | [Các phương án thiết kế](write-safety-options.md), [kế hoạch đo](q3-measurement-plan.md) |

**Kết luận:** người cần nắm hướng đi chỉ cần file này; người làm bắt đầu từ các phương án thiết kế.

## 1. Vấn đề là gì

### 1.1. Một lệnh ghi đi qua những đâu

Lab dựng một cổng (gateway) đứng giữa trợ lý AI và các hệ thống nghiệp vụ.
Hệ thống nghiệp vụ là phần mềm giữ dữ liệu làm việc thật: danh bạ nhân viên, danh sách việc, ví điện tử, công cụ quản trị game.
Lab có hai hệ thống giả do Lab tự viết: danh bạ nhân viên và danh sách việc (task).

Ví dụ: chị Hoa nhờ trợ lý "giao task T-12 cho anh Minh".

1. Trợ lý đọc task T-12 qua cổng và soạn một đề xuất: đổi người phụ trách T-12 từ chị Lan sang anh Minh.
2. Chị Hoa xem đề xuất trên trang của cổng và bấm Gửi; nếu luật yêu cầu, anh Quang, trưởng nhóm, bấm duyệt.
3. Cổng gửi lệnh ghi qua mạng tới hệ thống danh sách việc.
4. Hệ thống danh sách việc ghi thay đổi và trả lời "đã ghi".
5. Cổng báo cho chị Hoa và trợ lý rằng việc đã xong.

Spec này bàn về bước 3 và bước 4.

### 1.2. Vì sao cổng có lúc không biết lệnh đã chạy chưa

Lệnh ghi và câu trả lời đều đi qua mạng, và mạng có thể hỏng bất kỳ lúc nào.
Khi cổng gửi lệnh mà không nhận được câu trả lời, có ba khả năng:

- Lệnh chưa tới hệ thống, nên chưa có gì được ghi.
- Lệnh đã tới và đã ghi, nhưng câu trả lời bị mất trên đường về.
- Lệnh đang ghi dở, và sẽ xong sau khi cổng đã thôi chờ.

Từ phía cổng, ba khả năng trông giống hệt nhau.
Người dùng ngân hàng gặp đúng chuyện này khi ứng dụng quay mãi rồi báo lỗi: không biết tiền đã chuyển chưa, bấm lại thì sợ chuyển hai lần.

Cổng chỉ có hai lựa chọn, và lựa chọn nào cũng có giá:

- **Gửi lại:** nếu lệnh đầu đã ghi, việc bị làm hai lần, ví dụ một task bị tạo hai lần.
- **Không gửi lại:** nếu lệnh đầu chưa tới, việc đã duyệt bị mất, hoặc bị báo "thất bại" dù thật ra đã xong.

### 1.3. Lab đang giải chuyện này thế nào

Lab dùng hai cơ chế, và cả hai cần hệ thống đích hợp tác.
Hệ thống đích là hệ thống nhận lệnh ghi.

- **Mã chống ghi trùng (idempotency key):** mỗi lệnh mang một mã cố định; hệ thống đích gặp lại mã đã thấy thì không làm lần nữa mà trả lại kết quả cũ.
  Giống mã đơn hàng: gửi lại cùng mã đơn thì cửa hàng biết đây là đơn cũ.
- **Số phiên bản (version):** mỗi bản ghi có một con số tăng lên sau mỗi lần sửa.
  Lệnh ghi mang số phiên bản lúc soạn; nếu số đã đổi, tức có người vừa sửa, hệ thống đích từ chối để không ghi đè.

Nhờ hai cơ chế này, khi không rõ kết quả, cổng cứ gửi lại với cùng mã tới khi có câu trả lời ([ADR-0007, mục 3.5](../../docs/adr/adr-0007-system-adapters-and-change-sets.md#35-hàng-đợi-lệnh-ghi-chạy-nền)).
Trong phép đo tắt cổng ở ba thời điểm, cổng đúng 300 trên 300 lần: không lệnh nào ghi hai lần hay bị mất ([giải thích số đo](../evaluation/measurements-explained.md)).

Nhưng hai hệ thống giả nhớ mọi mã mãi mãi, kiểm số phiên bản ở mọi lệnh và trả lời ngay kết quả cuối.
[ADR-0002, mục 3](../../docs/adr/adr-0002-safe-read-and-write.md#3-quyết-định-về-ghi) đã ghi rõ: bảo đảm "tối đa một lần" chỉ đúng vì hệ đích tôn trọng mã chống ghi trùng và số phiên bản.

**Kết luận:** câu hỏi không còn là cổng có đúng không, mà là cổng còn đúng không khi hệ thống đích không hợp tác như hệ thống giả.

## 2. Hệ thống thật khác hệ thống giả ở đâu

Lab rà tài liệu chính thức của Lark, Stripe, Meta và Google, và tìm thấy mười chỗ khác.
Chi tiết, lý do và bằng chứng của từng chỗ nằm ở [khảo sát hệ thống thật](../research/target-system-gaps.md).

| Khác biệt | Ví dụ có tài liệu | Cách làm hôm nay hỏng thế nào |
| --- | --- | --- |
| Không nhận ra lệnh gửi lại (P1) | Lark Task, lệnh sửa; Lark Approval báo lỗi thay vì trả kết quả cũ | Tạo hai lần; hoặc báo thất bại dù đã ghi |
| Chỉ nhớ mã một thời gian (P2) | Lark Task 5 phút và theo từng token, Stripe 24 giờ | Gửi lại sau hạn là làm lần hai |
| Kết quả cuối đến sau (P3) | Stripe ACH tới 4 ngày làm việc, chuyển tiền sau giờ chốt | Báo xong khi mới được nhận |
| Không có số phiên bản (P27) | Lark Task, lệnh sửa | Ghi đè thay đổi của người khác |
| Giới hạn tốc độ (P7) | Meta, Lark Approval | Bỏ lệnh đã duyệt |
| Chờ lâu thì người và quyền đổi (P4, P12, P30, P5) | Không do đích | Đề xuất trùng; ghi bằng quyền đã mất; ghi việc không còn cần |
| Mã trả về nhiều nghĩa (P28) | Stripe 409, Lark Task 1470422, Meta 613 | Báo "bị từ chối" dù lệnh đã ghi |
| Đọc thấy dữ liệu cũ (P8) | Chưa có tài liệu | Cách sửa có bước tra sẽ tra sai rồi ghi trùng |
| Kéo theo việc khác (P29) | Lark Task gửi thông báo cho người theo dõi | Gửi thừa thông báo |
| Một việc nhiều lời gọi (P31) | Lark Task, đính kèm file | Chưa gặp, vì Lab chỉ bày việc một lời gọi |

**Kết luận:** Lark Task, hệ thống thật đầu tiên Lab định nối, vướng ít nhất sáu trong mười chỗ; chưa có sự cố công khai nào do trợ lý AI gây ra, nhưng tài liệu của chính Lark Task mô tả đúng ca tạo trùng.

## 3. Các hướng sửa, chưa chốt

Cổng phải quyết chín chuyện; mỗi chuyện có hai tới năm phương án ở [các phương án thiết kế](write-safety-options.md).
Bảng dưới chỉ ghi phương án đang nghiêng về và điều sẽ quyết định; chưa phương án nào được chọn.

| Chuyện phải quyết | Đang nghiêng về | Điều sẽ quyết định |
| --- | --- | --- |
| Đích mô tả năng lực ghi thế nào | Mỗi đích có một bản khai dạng dữ liệu cho từng thao tác | Bản khai có đủ để mô tả Lark Task và hai đích ngoài Lark không |
| Không rõ lệnh đã chạy chưa thì làm gì | Gửi lại khi đích còn nhận ra lệnh, tra khi tra được, còn lại dừng chờ người | Phép đo so với cách hôm nay và với "gửi một lần" |
| "Đã nhận" khác "đã xong" | Thêm trạng thái "đã được nhận" và hỏi lại định kỳ | Số lượt gọi so với giới hạn tốc độ của đích |
| Ai đóng lệnh cổng không tự kết luận được | Một người vận hành, khác người yêu cầu và người duyệt | Số lệnh cần người xem mỗi ngày |
| Chống ghi đè khi đích không có số phiên bản | Đọc lại ngay trước khi gửi | Khe còn lại giữa lúc đọc và lúc ghi |
| Kiểm lại quyền trước khi gửi | Kiểm trước lần gửi đầu | Danh bạ thật cập nhật trễ bao lâu |
| Lệnh đã duyệt nhưng lỗi thời | Hạn thực thi cho từng hành động, cộng nút huỷ | Thời gian từ duyệt tới gửi khi đích giới hạn tốc độ |
| Đề xuất thành công một nửa | Tách trạng thái từng mục, soạn lại phần chưa xong bằng một nút | Có việc nào cần đổi hai hệ thống cùng lúc không |
| Hai đề xuất cho cùng một việc | Chặn bằng khoá ý định; hạ xuống cảnh báo nếu chặn nhầm nhiều | Tỉ lệ chặn nhầm trên bộ câu yêu cầu soạn độc lập |

Trước khi chọn, Lab đọc cách các hệ thống lớn đã giải cùng việc, như chuẩn IETF về mã chống ghi trùng, Temporal và AWS ([các phương án thiết kế, mục 11](write-safety-options.md#11-cần-đọc-gì-trước-khi-chọn)).

**Kết luận:** hướng chung là "không chắc thì dừng", nhưng mỗi chuyện chỉ được chốt khi có nguồn đọc và số đo ủng hộ.

## 4. Kiểm chứng và thứ tự làm

Câu hỏi nghiên cứu Q3: khi hệ thống đích không hợp tác, cổng cần thêm gì để vẫn không ghi trùng, không ghi đè và không mất lệnh, và mỗi thứ thêm vào tốn bao nhiêu?
Lab trả lời bằng phần mềm giả có mười công tắc bắt chước các khác biệt ở mục 2, và so ba cách: gửi một lần, cách hôm nay, và cách đang nghiêng.
Phép đo không dùng mô hình AI, chạy khoảng 13 giờ máy qua hai đêm ([kế hoạch đo](q3-measurement-plan.md)).

Thứ tự làm:

1. Dựng phần mềm giả khó tính và đo hai cách mốc; việc này không phụ thuộc thiết kế.
   Phần mềm giả đã có tám hồ sơ đích (#159); phép đo hai cách mốc đang chạy (#144).
2. Cùng lúc, đọc cách các hệ thống lớn giải từng chuyện ở mục 3.
   Đã xong: nguồn ngoài nằm trong [các phương án thiết kế](write-safety-options.md) (#158), API Lark nằm trong [Lark Open API](../research/lark-open-api.md) (#160).
3. Chọn phương án, viết ADR-0009, sửa cổng, đo cách mới.
4. Nối Lark Task trên một nhóm task thử, khi đủ ba điều kiện:
   - Chủ dữ liệu và mentor đồng ý bằng văn bản, theo [AGENTS.md, mục 5](../../AGENTS.md#5-data-boundary).
   - Bản khai năng lực của Lark Task không còn ô "Chưa kiểm", và khớp hồ sơ `lark-task` đã đo.
   - Cách mới đạt mọi ngưỡng ở [kế hoạch đo, mục 4.2](q3-measurement-plan.md#42-bộ-đếm-và-ngưỡng) trên hồ sơ đó.

**Kết luận:** Lab đo trước, chọn sau; hai cánh mốc chạy được ngay trong lúc chờ chọn thiết kế.

## Tài liệu liên quan

- [Khảo sát hệ thống thật](../research/target-system-gaps.md)
- [Các phương án thiết kế](write-safety-options.md)
- [Kế hoạch đo Q3](q3-measurement-plan.md)
- [Bảng thuật ngữ](../problem/glossary.md)
- [Danh mục vấn đề](../problem/open-problems.md)
- [Kế hoạch cập nhật hệ thống giả lập](simulation-update-plan.md)
- [Spec bản thử](../../archive/baseline/mvp-spec.md)
