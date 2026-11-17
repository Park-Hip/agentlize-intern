# ADR-0001: Lab tự dựng một cổng kiểm soát mỏng

Ngày: 2026-11-17. Trạng thái: đề xuất, chấp nhận khi được merge.

Quyết định 1 trong [spec bản thử, mục 11](../../rd/design/mvp-spec.md#11-cần-chốt-trước-khi-dựng).

## Đọc nhanh

- Vấn đề: AI hôm nay làm việc bằng một tài khoản quyền rộng, nên ai nhờ được AI cũng mượn được quyền đó.
- Quyết định: Lab tự dựng một cổng mỏng đứng giữa AI và hai hệ thống giả, quyết định theo đúng người đang hỏi.
- Lab chép các mẫu thiết kế đã có trên thị trường, nhưng không dựng trên sản phẩm nào, không dựa vào Thổ Thần, và không nhập vào hệ thống của ai khác.
- Sản phẩm trên thị trường chỉ dùng làm mốc "mua" để so ở bước đánh giá.
- Xem lại khi có sản phẩm làm đủ ba việc khó trên cùng một lần ghi, hoặc khi phần chạy tiếp sau sập tự viết quá rối.

## 1. Bối cảnh

Bài toán và tám yêu cầu SR1-SR8 nằm ở [PRD, mục 6](../../rd/problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc).
Ba việc khó nhất phải xảy ra trên cùng một lần ghi: SR3 (phạm vi quyền), SR4 (điểm dừng rủi ro) và SR6 (không ghi trùng).

Bằng chứng đã có:

- Mười một sản phẩm chấm theo tám yêu cầu, không sản phẩm nào đạt đủ; mỗi mảnh khó chỉ một sản phẩm làm, và không ai chống ghi trùng ở hệ đích ([tổng hợp phát hiện, mục 3](../../rd/findings.md#3-thị-trường-2026)).
- Preloop là mã nguồn mở nhưng thiếu đúng SR1 (danh tính) và SR6, nên dựng trên nó vẫn phải viết lại phần lõi ([khảo sát thị trường, mục 6.2](../../rd/research/market-landscape.md#62-sản-phẩm-có-giải-bài-toán-của-lab-không)).
- Thổ Thần không hỏi duyệt trước khi ghi và cắt lời gọi sau 60 giây ([tổng hợp phát hiện, mục 4](../../rd/findings.md#4-thổ-thần)).
- Thổ Thần chưa cho Lab một danh tính người dùng kiểm chứng được.
  Nối trên máy (stdio), server chỉ thấy tên ứng dụng, không thấy tài khoản.
  Nối qua địa chỉ HTTPS công khai, máy chủ Thổ Thần gắn thêm header `x-user-id` và `x-user-email`, nhưng mới đo một tài khoản, và ai có khoá gọi thẳng địa chỉ của server cũng tự đặt được `x-user-id` ([tổng hợp phát hiện, mục 4](../../rd/findings.md#4-thổ-thần), [khảo sát Thổ Thần, mục 3.6](../../rd/appota/tho-than-platform.md#36-phép-đo-https-công-khai-2026-11-17)).

Mục tiêu của Lab là bằng chứng chạy lại được và số đo so sánh, không phải đưa vào vận hành.

**Kết luận:** không có thứ gì có sẵn làm được ba việc khó trên cùng một lần ghi, và Lab cần đo từng phần, nên câu hỏi chỉ còn là dựng trên nền nào.

## 2. Phương án đã xét

| Phương án | Được | Mất | Kết quả |
| --- | --- | --- | --- |
| A. Mua hoặc dùng một sản phẩm (Liyagent, StackOne, Kong) làm nền | Có sẵn một phần kiểm soát | Vẫn phải tự viết phần gộp SR3, SR4, SR6; hộp đen, khó đo từng phần | Loại; giữ làm mốc "mua" khi đánh giá |
| B. Dựng trên Preloop (mã nguồn mở) | Đọc được mã, có luồng duyệt | Thiếu SR1 và SR6, tức phần lõi | Loại; chỉ đọc mã luồng duyệt khi dựng phần duyệt, tối đa nửa ngày |
| C. Dựa vào tính năng của Thổ Thần | Không phải dựng | Không có duyệt cho tool (đã đo); danh tính chỉ có qua header HTTPS chưa kiểm chứng | Loại |
| D. Dựng trên công cụ chạy quy trình (workflow engine) | Chạy tiếp sau sập có sẵn | Thêm một hệ thống phải vận hành, khi chưa biết có cần không | Để dành; xem lại theo Q1 |
| E. Tự dựng một cổng mỏng | Kiểm soát đủ tám yêu cầu; đo được từng phần; không phụ thuộc nơi gọi | Tự viết và tự giữ mã; an toàn của mã tự viết chỉ dựa vào phép thử | **Chọn** |

**Kết luận:** phương án E là cách duy nhất cho Lab vừa đủ tám yêu cầu vừa đo được từng phần.

## 3. Quyết định

Lab tự dựng một cổng kiểm soát mỏng, theo [spec bản thử](../../rd/design/mvp-spec.md).

- Mọi lời gọi của AI tới hai hệ thống giả đi qua cổng; hai hệ thống giả chỉ nhận lời gọi từ cổng.
- Cổng chép các mẫu đã có: mặc định từ chối, lệnh cấm luôn thắng, lỗi hay hết giờ thì từ chối, hai lớp danh tính, che khi đọc và chặn khi ghi theo từng trường ([bài học từ thị trường](../../rd/research/market-lessons.md)).
- Cổng tự làm phần gộp SR3, SR4, SR6 trên cùng một đường ghi ([ADR-0002](adr-0002-safe-read-and-write.md)).
- Cổng không phụ thuộc nơi gọi: Thổ Thần, trợ lý gọi hàm của Lab hay MausBot đều chỉ là cửa vào mỏng.
- Phần chạy tiếp sau sập do Lab tự viết; công cụ chạy quy trình chỉ được thêm khi Q1 cho thấy phần đó quá rối.

**Kết luận:** Lab dựng, và mọi quyết định thiết kế của cổng là của Lab.

## 4. Hệ quả

- Lab giữ toàn bộ mã của cổng, nên bộ phép thử SR1-SR8 là điều kiện bắt buộc trước mọi khẳng định về an toàn.
- Mỗi mảnh của cổng đo được riêng: thời gian của bộ luật quyền, của cửa vào, của lệnh ghi.
- Kết quả của Lab so được với sản phẩm trên thị trường bằng cùng tám phép thử.
- Lab chịu chi phí tự viết phần chạy tiếp sau sập; Q1 đo xem chi phí đó có đáng không.

**Kết luận:** cái giá của việc tự dựng là phải có phép thử trước, và cái giá đó đã nằm trong spec.

## 5. Xem lại khi

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| Q1 cho thấy phần chạy tiếp tự viết sót, trùng hoặc quá rối | Viết ADR mới cho công cụ chạy quy trình ([Q1](../../rd/design/research-questions-and-validation-plan.md#21-q1-đang-chuyển-30-task-thì-ứng-dụng-sập-chạy-lại-có-đủ-và-không-trùng-không)) |
| Một sản phẩm công bố đủ che trường theo người, duyệt khoá nội dung và chống ghi trùng | Chạy tám phép thử của Lab vào sản phẩm đó với dữ liệu giả |
| Thổ Thần thêm bước duyệt, hoặc header danh tính qua HTTPS vượt qua H9 (ghi đè `x-user-id`) và H10 (phiên tách theo người dùng) ([khảo sát Thổ Thần, mục 9](../../rd/appota/tho-than-platform.md#9-câu-hỏi-mở-và-giả-thuyết-kiểm-được)) | Dùng header làm lớp kiểm thứ hai hoặc bỏ phần tương ứng của cổng; giữ phép thử |
| Mục tiêu đổi từ nghiên cứu sang vận hành | Chạy thử sản phẩm theo [bài học từ thị trường, mục 5.3](../../rd/research/market-lessons.md#53-khi-nào-xem-lại-quyết-định-này) |

**Kết luận:** quyết định đúng cho giai đoạn nghiên cứu, và có tín hiệu rõ để xem lại.
