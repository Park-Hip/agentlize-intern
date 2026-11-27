# Các giai đoạn của bản thử

Ngày: 2026-11-27. Trạng thái: hai giai đoạn đã đóng; giai đoạn ghi an toàn đang làm.

## Đọc nhanh

- Lab làm theo từng giai đoạn: mỗi giai đoạn trả lời một câu hỏi, rồi đóng lại.
- Giai đoạn đầu chọn cách nối AI với hệ thống: Lab tự dựng một cổng kiểm soát mỏng đứng giữa AI và hệ thống.
- Giai đoạn hai dựng bản thử đầu, chạy nó trong Thổ Thần và đo; các con số đó là mốc so sánh cho mọi bản sau.
- Giai đoạn ba, đang làm, giữ cho cổng ghi đúng một lần vào phần mềm thật như Lark, vốn kém tin cậy hơn phần mềm giả.
- Mỗi giai đoạn đã đóng có một nhãn trong lịch sử mã, nên mở lại được đúng tài liệu và mã của lúc đó.

## Cách dùng

| Giai đoạn | Thời gian | Câu hỏi | Nhãn git |
| --- | --- | --- | --- |
| [Chọn cách nối](#1-giai-đoạn-research-chọn-cách-nối) | tới 2026-11-17 | Nối AI với hệ thống của công ty bằng cách nào | `research` |
| [Bản thử đầu và số đo mốc](#2-giai-đoạn-baseline-bản-thử-đầu-và-số-đo-mốc) | 2026-11-17 tới 2026-11-22 | Cổng tự viết có đủ an toàn khi sập giữa chừng không; nối qua chuẩn chung tiết kiệm bao nhiêu công | `baseline` |
| [Ghi an toàn vào hệ thống thật](#3-giai-đoạn-write-safety-ghi-an-toàn-vào-hệ-thống-thật) | từ 2026-11-24 | Cổng còn ghi đúng một lần không khi hệ thống đích không hợp tác | chưa gắn |

Nhãn git (tag) là tên đặt cho một commit, để quay lại đúng trạng thái repo lúc đó.
Đọc một tài liệu như lúc giai đoạn đóng:

```
git show baseline:rd/problem/prd-ai-platform.md
```

Mở cả repo lúc đó, gồm cả mã của bản thử:

```
git switch --detach baseline
```

Khi một giai đoạn đóng, người làm gắn nhãn vào commit cuối của giai đoạn, đẩy nhãn lên GitHub và thêm một mục vào file này.
Tài liệu chỉ giai đoạn đó dùng chuyển vào `archive/<giai-đoạn>/` và giữ nguyên nội dung; tài liệu giai đoạn sau còn dùng thì ở lại `rd/`.

**Kết luận:** `rd/` chỉ chứa tài liệu của giai đoạn đang làm; muốn biết PRD hay spec nói gì ở giai đoạn trước thì mở nhãn của giai đoạn đó, không chép thêm bản cũ vào repo.

## 1. Giai đoạn `research`: chọn cách nối

Câu hỏi: nối AI với các hệ thống của công ty bằng cách nào để an toàn, theo dõi được và dùng lại được.

Lab bắt đầu từ một tình huống.
Chị Hoa nhờ AI chuyển task T-12 của chị Lan sang anh Minh, và AI làm được vì chạy bằng một tài khoản sửa được mọi task.
Nam, thực tập sinh không có quyền này, gõ đúng câu đó thì AI cũng làm, và lịch sử chỉ ghi tên tài khoản của AI.
[PRD](../rd/problem/prd-ai-platform.md) biến vấn đề này thành tám yêu cầu SR1 tới SR8, mỗi yêu cầu có một phép thử.

Kết quả:

- Năm cách nối không thay thế nhau mà ghép được với nhau, và không cách nào tự biết ai đang yêu cầu hay tự chặn ghi hai lần ([so sánh phương án](../archive/research/option-comparison.md)).
- Mười một sản phẩm trên thị trường không sản phẩm nào đạt đủ tám yêu cầu ([khảo sát thị trường](../archive/research/market-landscape.md), [bài học từ thị trường](../archive/research/market-lessons.md)).
  Mua sản phẩm nào thì Lab vẫn phải tự viết phần gộp SR3 (phạm vi quyền), SR4 (điểm dừng rủi ro) và SR6 (không ghi trùng).
- Thổ Thần gọi được công cụ của Lab, nhưng không hỏi duyệt trước khi ghi, không cho biết chắc ai đang hỏi và cắt mọi lời gọi sau 60 giây ([khảo sát Thổ Thần, mục 2.1](../rd/research/tho-than-platform.md#21-thổ-thần-gọi-công-cụ-của-lab-thế-nào-và-hệ-quả)).

Quyết định: [ADR-0001](adr/adr-0001-self-built-thin-gateway.md) tới [ADR-0006](adr/adr-0006-operator-console.md).
Lab tự dựng một cổng mỏng, cắm vào Thổ Thần qua MCP trên HTTPS, nhận ra người hỏi bằng khoá riêng của từng người, và đặt trang duyệt ở cổng.

Nhãn `research` trỏ tới commit `c02a86b`, commit ghi ADR-0006.
Tài liệu của giai đoạn này nằm trong [archive/research](../archive/research).

**Kết luận:** cổng kiểm soát là phần chính của Lab; cách nối công cụ được chọn bằng số đo, không bằng đọc tài liệu.

## 2. Giai đoạn `baseline`: bản thử đầu và số đo mốc

Câu hỏi, theo [spec bản thử](../archive/baseline/mvp-spec.md):

- Q1 (sập giữa lúc ghi hàng loạt): đang chuyển 30 task mà hệ thống sập, hàng đợi lệnh ghi tự viết có đủ an toàn không, hay phải dùng một phần mềm chuyên chạy quy trình (workflow engine).
- Q2 (chuẩn chung hay gọi hàm): thêm một trợ lý thứ hai thì nối qua MCP tiết kiệm bao nhiêu công so với gọi hàm, và phải trả giá gì.

Kết quả trong Thổ Thần desktop:

- Ngày 2026-11-18, mốc 1 và mốc 2 đạt: chị Hoa tra cứu chỉ thấy phần được xem, chuyển được T-12 sau khi bấm duyệt, và Nam bị từ chối ([nghiệm thu mốc 1](../archive/baseline/milestone-1-tho-than.md), [nghiệm thu mốc 2](../archive/baseline/milestone-2-tho-than.md)).
- Lab dựng lại phần lõi theo [ADR-0007](adr/adr-0007-system-adapters-and-change-sets.md) và [ADR-0008](adr/adr-0008-approval-page-login.md), để nối thêm hệ thống mà không sửa lõi.
- Ngày 2026-11-22, mốc 3 đạt: việc chuyển 30 task dừng chờ trưởng nhóm duyệt, rồi cổng ghi đủ 30 task, mỗi task một lần ([nghiệm thu mốc 3](../archive/baseline/milestone-3-tho-than.md)).
- Thổ Thần web chưa bật được skill tùy chỉnh (#65), nên mọi lần nghiệm thu chạy trên bản desktop.

Kết quả đo:

- Q1: hàng đợi tự viết và bản đối chứng Temporal cùng đạt 300 trên 300 lần, không ghi trùng, không mất lệnh.
  Bản tự viết cần 3 dịch vụ và 1 bước sau khi sập; bản Temporal cần 5 dịch vụ và 2 bước.
  Vì vậy Lab giữ hàng đợi tự viết; phần mềm chạy quy trình chỉ đáng dùng khi quy trình có nhiều bước hay chờ duyệt nhiều ngày ([giải thích phép đo](../rd/evaluation/measurements-explained.md)).
  Kết luận này chỉ đúng trên hệ thống giả, một máy; phiên trong Thổ Thần chưa tắt cổng giữa chừng.
- Q2: cửa MCP viết 127 dòng, cửa gọi hàm 250 dòng; phần cổng của MCP chậm hơn 5 tới 26 mili giây mỗi hội thoại; tiền gần bằng; 231 trên 240 hội thoại đúng ở cả hai cửa ([báo cáo Q2](../archive/baseline/q2-assistants.md)).
  Vì vậy Lab dùng MCP khi có từ hai nơi gọi trở lên; MCP chỉ mang lời gọi, không mang an toàn.

Số đo mốc là các file `2026-11-20-*` và `2026-11-22-*` trong [kết quả đo](../rd/evaluation/results).
Tên mỗi file mang commit được đo, nên số đo của giai đoạn sau so được với đúng bản này.

Nhãn `baseline` trỏ tới commit `c37c2e4`, commit ghi báo cáo Q2.
Tài liệu của giai đoạn này nằm trong [archive/baseline](../archive/baseline).

**Kết luận:** mọi bản sau phải giữ được không ghi trùng, không mất lệnh và tám yêu cầu, và được so với các số đo trên.

## 3. Giai đoạn `write-safety`: ghi an toàn vào hệ thống thật

Câu hỏi: Q3 (đích không hợp tác), tức là cổng còn ghi đúng một lần không khi hệ thống đích không nhận ra lệnh gửi lại.
Phần mềm giả của Lab luôn nhận ra lệnh gửi lại; Lark Task chỉ nhận ra trong 5 phút, và không nhận ra lệnh sửa ([spec ghi an toàn](../rd/design/write-safety-spec.md)).

Đã có:

- Vấn đề, các phương án và kế hoạch đo: [spec ghi an toàn](../rd/design/write-safety-spec.md), [các phương án thiết kế](../rd/design/write-safety-options.md), [kế hoạch đo Q3](../rd/design/q3-measurement-plan.md), [kế hoạch cập nhật hệ thống giả](../rd/design/simulation-update-plan.md).
- Hệ thống thật khác hệ thống giả ở mười chỗ ([khảo sát hệ thống thật](../rd/research/target-system-gaps.md), [Lark Open API](../rd/research/lark-open-api.md)).
- [ADR-0010](adr/adr-0010-client-data-ceiling.md): mỗi loại ứng dụng AI chỉ nhận dữ liệu tới một mức nhạy cảm, cho khớp với cổng của công ty ([khớp cổng AgentLize](../rd/design/agentlize-gateway-alignment.md)).
- Hệ thống đơn nghỉ phép giả, luật chọn người duyệt theo chủ việc hay trưởng nhóm của người yêu cầu, và chuyển task bằng hai lời gọi thành viên của Lark (#164, #165, #169).

Còn lại:

- Đo cách "gửi một lần" và cách làm hôm nay trên các hệ thống đích khó tính (#144).
- Ghi vào hệ thống giả bằng quyền của chính người yêu cầu (#146).
- Chọn phương án, rồi ghi ADR-0009.

Giai đoạn đóng khi ADR-0009 được chấp nhận và số đo Q3 nằm trong [kết quả đo](../rd/evaluation/results); lúc đó gắn nhãn `write-safety`.

**Kết luận:** việc của tuần này là chạy xong phép đo Q3, vì phương án nào cũng phải chọn bằng số đo đó.
