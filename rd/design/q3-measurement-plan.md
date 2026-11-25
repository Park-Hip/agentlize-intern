# Kế hoạch đo Q3: cổng còn ghi an toàn không khi đích không hợp tác

Ngày: 2026-11-24. Trạng thái: kế hoạch, chưa chạy; đo cách làm hôm nay trước, rồi mới đo các phương án thiết kế.

## Đọc nhanh

- Trên phần mềm giả của Lab, cổng gửi lệnh ghi đúng 300 trên 300 lần, vì phần mềm giả luôn nhận ra lệnh gửi lại.
- Lab sẽ dựng phần mềm giả "khó tính" bắt chước Lark Task và vài loại phần mềm khác, rồi đo lại.
- Phép đo so ba cách làm: gửi một lần rồi thôi, cách làm hôm nay, và cách đang được đề xuất.
- Mỗi cách được chấm bằng cùng bảy con số, như số lần ghi trùng và số việc phải dừng chờ người xem.
- Phép đo không dùng mô hình AI nên gần như không tốn tiền; chạy hết mất khoảng 13 giờ máy, qua hai đêm.

## 1. Vì sao đo

Cổng hôm nay đúng vì hai hệ thống giả nhớ mọi mã mãi mãi, kiểm số phiên bản ở mọi lệnh và trả lời ngay kết quả cuối ([spec ghi an toàn, mục 1](write-safety-spec.md#1-vấn-đề-là-gì)).
Hệ thống thật khác ở mười chỗ ([khảo sát hệ thống thật](../research/target-system-gaps.md)).
Các phương án sửa cổng nằm ở [các phương án thiết kế](write-safety-options.md), và chưa phương án nào được chọn.

**Kết luận:** phép đo này cho biết cách làm hôm nay hỏng ở đâu, và phương án nào sửa được với giá thấp nhất.

## 2. Câu hỏi nghiên cứu Q3

**Q3. Khi hệ thống đích không nhận ra lệnh lặp, chỉ nhớ mã một thời gian, báo kết quả muộn, không có số phiên bản, dùng mã trả về theo cách riêng, hoặc đọc thấy dữ liệu cũ, cổng cần thêm gì để vẫn không ghi trùng, không ghi đè và không mất lệnh, và mỗi thứ thêm vào tốn bao nhiêu?**

Q3 đủ hai điều kiện của một câu hỏi nghiên cứu theo [spec bản thử, mục 2](mvp-spec.md#2-hai-câu-hỏi-nghiên-cứu).
Lab chưa biết cách gửi lại hôm nay hỏng ở loại đích nào, và cái giá của cách an toàn hơn là bao nhiêu lệnh phải dừng chờ người.
Đáp án quyết định bộ tiếp hợp (adapter, phần mã nối cổng với một hệ thống) phải khai những gì, và cơ chế nào thành bắt buộc trong lõi cổng.

Các vấn đề trong phạm vi, với mã của [danh mục vấn đề](../problem/open-problems.md):

| Mã | Vấn đề | Lab hôm nay |
| --- | --- | --- |
| P1 | Không nhận ra lệnh gửi lại | Gửi lại cùng mã, đúng vì hệ thống giả lọc trùng |
| P2 | Hệ thống đích quên mã sớm hơn cổng gửi lại | Gửi lại không giới hạn; hệ thống giả nhớ mã mãi |
| P3 | Nhận lệnh chưa phải đã xong | Có bản ghi là xong |
| P4 | Hai đề xuất cho cùng một việc | Số phiên bản chặn với thao tác sửa; chưa có thao tác tạo mới |
| P5 | Đề xuất nhiều mục chỉ thành công một nửa | Trang tiến độ tách mục xong và mục bị từ chối |
| P7 | Giới hạn tốc độ | Lỗi 429 thành thất bại |
| P8 | Đọc ngay sau khi ghi thấy dữ liệu cũ | Không tra trước khi gửi lại, nên chưa bị ảnh hưởng |
| P12 | Thẩm quyền đổi giữa lúc duyệt và lúc ghi | Kiểm lúc bấm Gửi và lúc duyệt, không kiểm lúc gửi đi |
| P27 | Hệ thống đích không có số phiên bản | Hệ thống giả luôn có |
| P28 | Cùng một mã trả về mang nhiều nghĩa | Một bảng chung: 409 là dữ liệu đã đổi, 401 là bị từ chối |
| P29 | Lệnh ghi kéo theo việc khác ở đích | Không đếm |
| P30 | Lệnh đã duyệt nhưng đã lỗi thời | Không có hạn, không huỷ được sau khi duyệt |

P31 (một việc nhiều lời gọi) có trong phạm vi ở dạng hồ sơ `lark-task` gọi hai lời gọi thành viên; phần đổi nhiều hệ thống hay bù trừ khi lời gọi sau thất bại hẳn vẫn ngoài phạm vi, lý do ở [các phương án thiết kế, mục 12](write-safety-options.md#12-ngoài-phạm-vi-và-vì-sao).

Phép đo so ba cánh, tức ba cách xử lý cùng chạy trên cùng các hệ thống giả:

- **Gửi một lần:** gửi, chờ tối đa 20 giây, không gửi lại; không rõ kết quả thì báo thất bại.
  Đây là cách làm phổ biến khi không có hàng đợi.
- **Cách cũ:** hàng đợi hôm nay, gửi lại cùng mã không giới hạn.
- **Cách mới:** các phương án đang nghiêng ở [các phương án thiết kế](write-safety-options.md).
  Nếu một mục chọn phương án khác sau khi đọc thêm, cánh này đổi theo trước khi chạy.

Phương án "luôn dừng chờ người khi không rõ" không cần chạy riêng: số lệnh cần người xem của nó bằng số lần cánh cũ gặp kết quả không rõ, và nó không ghi trùng lần nào.
Con số đó là mốc trên cho cái giá "dừng chờ người" mà cách mới phải thấp hơn.

Bảy giả thuyết, mỗi giả thuyết có ngưỡng và có thể bị bác.
Giả thuyết 1 đến 3, 6 và 7 là dự đoán đọc từ mã; phép đo xác nhận chúng và đếm cái giá của cách mới.

1. **Gửi lại mù hỏng khi đích không nhận ra lệnh lặp (P1).**
   Với cách cũ, thao tác tạo mới bị ghi trùng ở mọi lần đích làm rơi câu trả lời; thao tác sửa trên đích kiểm phiên bản mà không lọc trùng bị báo thất bại dù đã ghi.
   Với cách mới, ghi trùng và báo sai đều bằng 0.
2. **Lời hứa chỉ đúng trong thời hạn nhớ mã (P2).**
   Với cách cũ, đích ngừng lâu hơn thời hạn nhớ mã thì thao tác tạo mới bị ghi trùng.
   Với cách mới, ghi trùng bằng 0, và mỗi lệnh quá hạn được tra kết quả hoặc chuyển "cần người xem".
3. **"Đã nhận" khác "đã xong" (P3).**
   Với cách cũ, mọi lệnh đích đã nhận rồi sau đó thất bại đều bị báo xong.
   Với cách mới, số đó bằng 0, và chỗ lệch được phát hiện trước khi hết thời gian chờ kết quả cuối mà hệ thống đã khai, cộng một lần tra.
4. **Đọc lại trước khi gửi giảm ghi đè khi đích không có số phiên bản (P27).**
   Khi người khác sửa cùng bản ghi trong lúc đề xuất chờ duyệt, cách cũ ghi đè ở mọi lần.
   Cách mới ghi đè ít hơn cách cũ ít nhất 10 lần; phần còn lọt là khe giữa lúc đọc lại và lúc ghi, và được báo thành số.
5. **Trợ lý soạn đề xuất trùng khi người dùng hỏi lại (P4).**
   Trong 20 cuộc hội thoại có kịch bản "hình như chưa được, làm lại giúp mình" sau khi đề xuất đầu đang chờ, trợ lý soạn đề xuất thứ hai cùng ý định ở ít nhất 1 cuộc.
   Nếu 0 trên 20, khoá ý định không cần cho mô hình đó, và kết quả được ghi lại thay vì bỏ cơ chế ([các phương án thiết kế, mục 10](write-safety-options.md#10-chặn-hai-đề-xuất-cho-cùng-một-việc)).
6. **Đọc mã trả về theo bảng chung báo sai (P28).**
   Với cách cũ, lệnh đã ghi mà lần gửi lại nhận 409 "đang chạy" hay 401 đều bị báo thất bại.
   Với cách mới, báo sai trạng thái và lệnh mất đều bằng 0, nhờ bảng mã trả về riêng của từng đích.
7. **Tra trên bản sao cũ làm ghi trùng (P8).**
   Trên đích đọc trễ, nếu cách mới tra ngay mà không chờ độ trễ đã khai, nó ghi trùng ở ít nhất một lần trong 100.
   Khi chờ đúng độ trễ đã khai, ghi trùng bằng 0.
   Giả thuyết này đo cái giá của dòng "đọc nhất quán" trong bản khai: thiếu dòng đó, cách mới tệ hơn cách cũ.

Kiểm lại quyền và hạn thực thi trước khi gửi (P12, P30) không phải giả thuyết: chúng là yêu cầu đúng sai, kiểm bằng phép thử ở mục 4.4.

**Kết luận:** nếu cách cũ đạt 0 ở mọi bộ đếm trên một hồ sơ đích, với mọi thao tác và mọi điểm gây lỗi áp dụng được, thì hồ sơ đó không cần cơ chế mới, và Lab giữ cách đơn giản hơn.

## 3. Hệ thống đích giả khó tính

Danh sách task giả đã có móc gây lỗi cho phép thử: làm rơi câu trả lời sau khi ghi, trả lời muộn, giữ lệnh trước khi ghi ([`fake-tasks/src/server.ts`](../../lab/fake-tasks/src/server.ts)).
Lần cập nhật này tách hành vi của nó thành mười công tắc, bật bằng cấu hình khi khởi động:

- Nhớ mã: mãi mãi; N giây; không nhớ.
- Phạm vi nhớ mã: theo khoá dịch vụ; theo từng token, token hết hạn sau N giây.
- Gặp lại mã: trả kết quả cũ; báo lỗi trùng; lệnh cùng mã đến khi lệnh đầu còn chạy thì chờ, hoặc trả 409 "đang chạy".
- Kiểm số phiên bản khi sửa: có; không.
- Kết quả cuối: ngay; đến sau, trả lời 200 kèm bản ghi ở trạng thái "đang xử lý".
- Giới hạn tốc độ: không; 429 kèm `Retry-After`; 429 kèm header riêng; 429 không báo gì và khoá thêm nếu bị gửi sớm.
- Độ trễ đọc: không; N giây.
- Việc kéo theo: không; một thông báo mỗi lần ghi; một thông báo chỉ khi giá trị đổi.
- Lịch sử ghi theo người ghi: có; không.
- Giao việc: sửa thẳng người phụ trách bằng PATCH; hoặc hai lời gọi thành viên, thêm người mới trước rồi bỏ người cũ.

Tám hồ sơ là tám tổ hợp đặt tên sẵn:

| Hồ sơ | Công tắc | Giống hệ thống nào | Vấn đề kiểm |
| --- | --- | --- | --- |
| `standard` | Nhớ mãi, trả kết quả cũ, kiểm phiên bản, kết quả ngay, có lịch sử | Hệ thống giả hôm nay | Mốc so sánh |
| `lark-task` | Tạo: nhớ 300 giây theo từng token, token hết hạn, trả 1470422 (HTTP 500) khi cùng mã còn chạy; sửa: không nhớ, không kiểm phiên bản; giao việc: hai lời gọi `add_members` và `remove_members`, PATCH có người phụ trách bị từ chối; thông báo mỗi lần ghi | Lark Task, theo tài liệu | P1, P2, P27, P28, P29, P31 |
| `lark-approval` | Tạo: nhớ mãi, báo lỗi trùng | Lark Approval, theo tài liệu | P1 dạng báo lỗi |
| `no-dedup` | Không nhớ; sửa vẫn kiểm phiên bản; không có lịch sử | Công cụ quản trị game, theo giả định | P1, lỗi báo thất bại dù đã ghi, kết luận sai sau xung đột |
| `short-memory` | Nhớ N giây, rút từ 24 giờ xuống vài giây khi đo | Cổng thanh toán nhớ mã 24 giờ như Stripe | P2 |
| `late-result` | Kết quả đến sau; một phần lệnh thất bại | Chuyển tiền sau giờ chốt, ghi nợ ACH | P3 |
| `rate-limited` | Như `standard`, cộng giới hạn tốc độ, ba cách báo thời gian chờ | Meta, Lark Approval | P7, P12, P30 |
| `stale-read` | Không nhớ mã, không kiểm phiên bản, đọc trễ N giây | Hệ thống đọc từ bản sao, theo giả định | P8 |

Thời gian chờ và tỉ lệ thất bại của `late-result`, và độ trễ của `stale-read`, là giả định cấu hình được, không lấy từ nguồn; giả thuyết 3 và 7 không phụ thuộc vào con số cụ thể.

Mỗi hồ sơ có bốn bộ đếm phía đích, không đọc từ cổng:

- Số lần mỗi thay đổi thật sự được áp vào bản ghi.
- Danh sách lần ghi kèm người ghi, để biết lệnh của cổng có ghi lên thay đổi của người khác không.
- Số thông báo phát ra cho mỗi thay đổi, để đếm việc kéo theo thừa.
- Số task đang có hơn một người phụ trách, để thấy trạng thái dở dang giữa hai lời gọi giao việc.

Các hồ sơ phủ theo hành vi, không theo tên hệ thống, nên một loại hệ thống được phủ khi mọi hành vi ghi của nó khớp một hồ sơ.
Bảng dưới cho thấy loại nào đã có hồ sơ và loại nào chưa:

| Loại hệ thống | Ví dụ | Hồ sơ gần nhất | Còn thiếu |
| --- | --- | --- | --- |
| Danh sách việc | Lark Task | `lark-task` | Ô "Chưa kiểm" của bản khai |
| Phiếu phê duyệt | Lark Approval | `lark-approval` | Tạo phiếu xong chưa phải được duyệt: kết quả nghiệp vụ đến sau, như P3 |
| Thanh toán, ví, hoàn tiền | Stripe, ngân hàng, AppotaPay | `short-memory`, `late-result` | Hệ thống nội bộ chưa có nguồn |
| Quảng cáo | Meta, Google Ads | `rate-limited` | Hạn mức theo ngày |
| Công cụ quản trị game | Gamota, theo giả định | `no-dedup` | Chưa có nguồn |
| Đơn nghỉ phép | Đơn nghỉ phép giả, U2 trong [kế hoạch cập nhật giả lập](simulation-update-plan.md) | Chưa có | Chờ U2 được duyệt |
| Bảng dữ liệu | Lark Base | Chưa có | Bước 0 của kế hoạch cập nhật giả lập trả lời Lark Base có ghi có điều kiện không |
| Tin nhắn và thông báo | Lark IM, SMS | Chưa có | Không thu hồi được (P6); cần đường duyệt chặt hơn trước khi nối |
| Kế toán, hoá đơn điện tử | Phần mềm hoá đơn | Chưa có | Không huỷ được, chỉ điều chỉnh (P6); kỳ đã khoá sổ |
| Hệ thống chỉ nhận file, hệ thống không có API | Hệ thống cũ | Ngoài phạm vi | P10 |

Kết quả của Q3 chỉ đúng cho các loại có hồ sơ; Lab không suy rộng sang các dòng "Chưa có".
Nếu một hệ thống thật có hành vi ngoài mười công tắc, thêm một công tắc trước khi viết bộ tiếp hợp cho nó.

**Kết luận:** hệ thống giả trở thành tài sản dùng lại được: một cổng khác có thể chạy chính các hồ sơ này để biết nó hỏng ở đâu, và bảng độ phủ nói rõ nó chưa kiểm được những loại nào.

## 4. Kế hoạch đo

### 4.1. Phép đo Q3 cho hàng đợi

Phép đo mới `q3-targets` chạy bằng `npm run measure`, không dùng mô hình, nên rẻ và chạy được giờ nào cũng được.
Mỗi lần chạy là một đề xuất 30 mục, như kịch bản C của bản thử.

Hai thao tác:

- **Sửa:** đặt người phụ trách, như hôm nay; hồ sơ `lark-task` chạy hai lời gọi thành viên cho phần người phụ trách.
- **Tạo:** tạo task mới, đóng vai thao tác không tự lọc trùng.

Cách cũ không có thao tác tạo; với thao tác tạo, "cách cũ" là mã mới với bản khai năng lực tắt, tức luôn gửi lại cùng mã.

Chín điểm gây lỗi:

1. Đích ghi xong rồi làm rơi câu trả lời.
2. Đích ghi xong sau khi cổng đã hết giờ chờ, có thể đúng lúc cổng đang tra.
3. Cổng sập sau khi gửi, trước khi lưu kết quả.
4. Đích ngừng lâu hơn thời hạn nhớ mã, rồi chạy lại.
5. Người khác sửa cùng bản ghi trong lúc đề xuất chờ duyệt.
6. Đích trả 429.
7. Token hết hạn giữa lần gửi đầu và lần gửi lại.
8. Lần gửi lại tới khi lần gửi đầu còn đang chạy ở đích.
9. Ghép 1 và 5: đích ghi xong, làm rơi câu trả lời, rồi người khác sửa cùng bản ghi trước lần gửi lại.

Mỗi hồ sơ chỉ chạy các điểm gây lỗi có ý nghĩa với nó:

| Hồ sơ | Thao tác | Điểm gây lỗi | Số ô |
| --- | --- | --- | --- |
| `standard` | Sửa | 1, 2, 3, 5 | 4 |
| `standard` | Tạo | 1, 2, 3 | 3 |
| `lark-task` | Sửa | 1, 2, 3, 5 | 4 |
| `lark-task` | Tạo | 1, 2, 3, 4, 7, 8 | 6 |
| `lark-approval` | Tạo | 1, 3 | 2 |
| `no-dedup` | Sửa | 1, 3, 5, 9 | 4 |
| `no-dedup` | Tạo | 1, 2, 3 | 3 |
| `short-memory` | Tạo | 4 | 1 |
| `late-result` | Tạo | Không gây lỗi thêm; đích tự trả kết quả muộn | 1 |
| `rate-limited` | Sửa | 6, mỗi cách báo thời gian chờ một ô | 3 |
| `stale-read` | Sửa | 1, 2, 5 | 3 |
| `stale-read` | Tạo | 1, 2 | 2 |

Tổng 36 ô cho mỗi cánh, 108 ô cho ba cánh.
Ô có thời điểm ngẫu nhiên (điểm gây lỗi 2 và 8, và hồ sơ `late-result`) chạy 100 lần; ô xác định chạy 10 lần, vì kết quả lặp lại y hệt.
Như vậy có 27 ô ngẫu nhiên và 81 ô xác định, tổng khoảng 3.500 lần chạy.
Phép đo `q1-outbox` cần khoảng 13 giây cho một lần chạy 30 mục ([giải thích số đo](../evaluation/measurements-explained.md)), nên toàn bộ cần khoảng 13 giờ máy, chạy qua hai đêm theo nhóm hồ sơ, không tốn tiền mô hình.

Tên kết quả ghi cả hồ sơ và cánh trong `--variant`, ví dụ `lark-task-new`, để hai cánh chạy cùng một commit không ghi đè file của nhau.

### 4.2. Bộ đếm và ngưỡng

| Bộ đếm | Định nghĩa | Cách mới phải đạt |
| --- | --- | --- |
| Ghi trùng | Một lệnh tạo được áp hơn một lần | 0 |
| Ghi đè mất | Lệnh của cổng ghi lên thay đổi của người khác mà cổng không biết | 0 khi đích kiểm phiên bản; khi không, ít hơn cách cũ ít nhất 10 lần |
| Lệnh mất | Mục đã duyệt, đích không ở trạng thái mong muốn, và cổng không còn định gửi mà không báo người | 0 |
| Báo sai trạng thái | Trạng thái cuối của cổng khác sự thật phía đích, gồm cả báo thất bại dù đã ghi | 0 |
| Lệnh treo | Sau 10 phút vẫn không ở trạng thái kết thúc, "đã được nhận" hay "cần người xem" | 0 |
| Cần người xem | Số mục cổng dừng chờ người | 0 với `standard` và mọi ô mà đích còn nhận ra lệnh; ô khác báo số cạnh cánh gửi một lần và mốc "luôn dừng chờ người" |
| Việc kéo theo thừa | Số thông báo phía đích trừ số thay đổi thật | Không lớn hơn cách cũ ở mọi ô; báo số |

Ngưỡng của bộ đếm "cần người xem" chặn cách lách "đẩy mọi thứ sang người xem", vì cách đó cũng cho bốn bộ đếm đầu bằng 0.
Số "cần người xem" ở các ô còn lại là cái giá của sự an toàn, và là câu trả lời cho vế "tốn bao nhiêu" của Q3.

### 4.3. Phép thử cho khoá ý định

- **Không mô hình:** hai đề xuất cùng ý định soạn song song và nối tiếp, cho cả đổi người phụ trách và tạo task; 0 cặp lọt qua.
- **Có mô hình:** trợ lý cửa MCP chạy 20 cuộc hội thoại theo kịch bản ở giả thuyết 5, ngoài giờ cao điểm; MCP là giao thức chuẩn để trợ lý gọi công cụ.
  Đếm số cuộc có đề xuất thứ hai cùng ý định đi tới chờ duyệt, với khoá ý định bật và tắt.
- **Chặn nhầm:** ít nhất 100 cặp việc hợp lệ khác nhau nhưng giống nhau, do một người không viết khoá ý định soạn.
  Báo tỉ lệ chặn nhầm kèm khoảng tin cậy 95%; cận trên phải dưới 5%.

### 4.4. Phép thử cho kiểm lại quyền và hạn thực thi

- 20 tình huống mất quyền cài sẵn trước lần gửi đầu, trên hồ sơ `rate-limited`: người yêu cầu bị xoá khỏi danh bạ, người duyệt chuyển phòng, luật bị siết; 0 lệnh lọt.
- File luật hỏng: lệnh chờ, không gửi, và chạy tiếp khi file được sửa.
- Lệnh đã gửi chưa rõ kết quả rồi mất quyền: không bao giờ bị báo thất bại vì quyền.
- Đích giới hạn tốc độ giữ lệnh quá hạn thực thi: mọi lệnh chưa gửi thành `EXECUTION_EXPIRED`, lệnh đã gửi thì không.
- Huỷ giữa chừng một đề xuất 30 mục: các mục chưa gửi thành `CANCELLED`, các mục đã gửi đi tiếp tới kết quả.
- Chi phí: danh bạ giả trả lời chậm 200 ms; báo thời gian thêm vào một đề xuất 30 mục, không đặt ngưỡng.

### 4.5. Giữ những gì đã có

Khoảng 420 phép thử hiện có và `npm run sr` phải vẫn xanh sau mỗi PR.
Phép đo `q1-outbox` chạy lại trên hồ sơ `standard` phải vẫn cho 300 trên 300.
Không thêm yêu cầu mới vào SR1-SR8; phép thử mới gắn vào `lab/scripts/sr-map.json` như sau:

- SR6 (không ghi trùng): hàng đợi chọn bước theo bản khai, gửi lại trong phạm vi nhớ mã, chờ độ trễ đọc, khoá ý định.
- SR5 (không chắc thì chặn): bản khai bắt buộc, trạng thái "cần người xem" kể cả cho mã trả về lạ, đọc lại trước khi gửi.
- SR1 (danh tính và một cửa ghi): kiểm lại quyền, hạn thực thi, huỷ lệnh chưa gửi.
- SR7 (vết xuyên suốt): đối soát và ba mức trạng thái.
- SR4 (điểm dừng rủi ro): khoá ý định.

**Kết luận:** cách mới đạt khi mọi bộ đếm đạt ngưỡng ở mọi ô, bảy giả thuyết có số, và các số cũ không đổi.

## 5. Rủi ro của phép đo

| Rủi ro | Cách giảm |
| --- | --- |
| Hồ sơ đích giả khác hệ thống thật | Lấy hành vi từ tài liệu công khai; điền ô "Chưa kiểm" bằng một lần thử trên Lark trước khi nối |
| Phép đo dài khoảng 13 giờ | Chạy qua hai đêm theo nhóm hồ sơ; ô xác định chỉ chạy 10 lần |
| Phương án thiết kế đổi sau khi đọc thêm | Đo cánh gửi một lần và cách cũ trước; hai cánh này không phụ thuộc phương án |
| Phần có mô hình bị khoá giờ cao điểm | Xếp lượt chạy ngoài 08:00-11:00 và 13:00-17:00 |

**Kết luận:** hai cánh mốc đo được ngay, kể cả khi thiết kế còn đổi; chỉ cánh cách mới phải chờ các phương án được chọn.

## Tài liệu liên quan

- [Spec ghi an toàn](write-safety-spec.md)
- [Các phương án thiết kế](write-safety-options.md)
- [Khảo sát hệ thống thật](../research/target-system-gaps.md)
- [Kế hoạch cập nhật hệ thống giả lập](simulation-update-plan.md)
- [Giải thích số đo](../evaluation/measurements-explained.md)
