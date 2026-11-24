# Các phương án thiết kế cho việc ghi vào hệ thống thật

Ngày: 2026-11-24. Trạng thái: đề xuất, chưa chốt; mỗi quyết định có phương án đang nghiêng, chọn sau khi đọc thêm và đo, rồi mới viết ADR-0009.

## Đọc nhanh

- Để ghi an toàn vào phần mềm nghiệp vụ thật, cổng phải quyết chín chuyện, ví dụ: không rõ lệnh đã chạy chưa thì làm gì, và chặn người dùng nhờ làm lại một việc đang chờ thế nào.
- Mỗi chuyện có hai tới năm cách làm; tài liệu này đặt chúng cạnh nhau, kèm được gì và mất gì.
- Mỗi chuyện có một cách đang nghiêng về, nhưng chưa cách nào được chọn.
- Một cách chỉ được chọn khi có số đo trên phần mềm giả, hoặc khi đã đọc cách các hệ thống lớn làm cùng việc đó.
- Việc tiếp theo: đọc tài liệu công khai cho từng chuyện (mục 11), đo các cách trên phần mềm giả, rồi ghi lựa chọn vào một quyết định kiến trúc.

## 1. Cách chọn phương án

Vấn đề mà các phương án phải giải nằm ở [khảo sát hệ thống thật](../research/target-system-gaps.md), mỗi vấn đề mang một mã P.
Mỗi mục dưới đây theo cùng một khuôn:

- **Vấn đề:** mã P và tên.
- **Phương án:** bảng các cách làm, mỗi cách kèm được gì và mất gì.
- **Đang nghiêng về:** cách được mô tả chi tiết, vì nó là điểm xuất phát để đo; đây chưa phải lựa chọn.
- **Chưa biết:** điều phải trả lời trước khi chọn.
- **Cách quyết định:** phép đo, phép thử hay nguồn đọc nào chọn giữa các phương án.

Tiêu chí chọn là bộ yêu cầu chung SR1-SR8 trong [PRD](../problem/prd-ai-platform.md), đo bằng các bộ đếm ở [kế hoạch đo, mục 4.2](q3-measurement-plan.md#42-bộ-đếm-và-ngưỡng).
Khi hai phương án ngang nhau về an toàn, chọn phương án ít lệnh phải dừng chờ người hơn, rồi tới phương án đơn giản hơn.
ADR-0009 chỉ được viết sau khi mọi mục có lựa chọn kèm bằng chứng.

**Kết luận:** tài liệu này là danh sách việc phải quyết, không phải thiết kế đã quyết.

## 2. Đích mô tả năng lực ghi của nó thế nào

**Vấn đề:** P1 (không nhận ra lệnh gửi lại), P2 (đích quên mã sớm), P3 (nhận chưa phải xong), P7 (giới hạn tốc độ), P8 (đọc thấy dữ liệu cũ), P27 (không có số phiên bản), P28 (mã trả về nhiều nghĩa), P29 (việc kéo theo).
Cổng hôm nay giả định mọi đích giống hệ thống giả.

| Phương án | Được | Mất |
| --- | --- | --- |
| A. Bản khai năng lực dạng dữ liệu, cho từng thao tác, lõi cổng đọc và chọn cách xử lý | Một chỗ duy nhất để kiểm; luật đọc được; phép thử hợp đồng so được với đích | Bảng phải đủ chiều; khai sai thì lõi xử lý sai |
| B. Mỗi bộ tiếp hợp tự viết mã gửi lại và tra cứu riêng | Linh hoạt với đích lạ | Mỗi đích một cách, khó kiểm và khó dùng lại; lỗi an toàn nằm rải rác |
| C. Cổng tự dò năng lực lúc chạy, ví dụ gửi thử hai lần cùng mã | Không phụ thuộc lời khai | Gửi thử là ghi thật; nhiều năng lực không dò được, như thời hạn nhớ mã |
| D. Chỉ nhận đích có chống ghi trùng đầy đủ, từ chối đích khác | Đơn giản nhất | Loại Lark Task, đích đầu tiên Lab định nối |

**Đang nghiêng về A**, có phép thử hợp đồng hằng ngày để bắt lời khai sai: mỗi ngày gọi từng thao tác trên một bản ghi thử và so câu trả lời với bản khai, để biết sớm khi đích đổi API (P9).
Bộ tiếp hợp (adapter) là phần mã nối cổng với một hệ thống.
Hôm nay bộ tiếp hợp khai trường, phòng sở hữu và hành động ([`adapters/types.ts`](../../lab/gateway/src/adapters/types.ts)); bản khai năng lực thêm các dòng dưới.

| Dòng | Giá trị | Lark Task, tạo | Lark Task, sửa | Lark Approval, tạo phiếu |
| --- | --- | --- | --- | --- |
| Nhớ mã chống ghi trùng | Không; trong N giây; không hết hạn | 300 giây sau khi thành công | Không | Tài liệu không nêu hạn |
| Phạm vi nhớ mã | Theo khoá dịch vụ; theo từng chuỗi token, kèm tuổi thọ token; toàn doanh nghiệp | Theo từng chuỗi token; token sống khoảng 2 giờ | Không áp dụng | Toàn doanh nghiệp |
| Gặp lại mã | Trả kết quả cũ; báo lỗi trùng kèm mã lỗi; ghi mới | Trả kết quả cũ | Không áp dụng | Lỗi 60012 |
| Tạo theo khoá ngoài (upsert) | Có, theo trường nào; không | Chưa kiểm | Không áp dụng | Chưa kiểm |
| Kiểm số phiên bản | Có; không | Không áp dụng | Không | Không áp dụng |
| Bảng mã trả về | Mỗi mã của đích xếp vào một loại: đã ghi, chưa làm, bị từ chối, đang chạy cùng mã, chưa rõ | 1470422 là đang chạy cùng mã; phần còn lại chưa kiểm | Chưa kiểm | 60012 là đã ghi; phần còn lại chưa kiểm |
| Tra kết quả | Theo mã; theo dấu gắn trong bản ghi; theo bản ghi; không | Chưa kiểm | Theo bản ghi | Chưa kiểm |
| Đọc nhất quán sau khi ghi | Ngay; sau N giây; không biết | Chưa kiểm | Chưa kiểm | Chưa kiểm |
| Lịch sử ghi theo người ghi | Có; không | Chưa kiểm | Chưa kiểm | Không áp dụng |
| Thời gian xử lý tối đa | Số giây, hoặc không biết | Chưa kiểm | Chưa kiểm | Chưa kiểm |
| Kết quả cuối | Ngay khi trả lời; đến sau, chờ tối đa N giờ | Ngay | Ngay | Ngay |
| Thu hồi được | Đảo ngược; bù trừ; không thu hồi được | Chưa kiểm | Đảo ngược | Chưa kiểm |
| Việc kéo theo | Không; thông báo, cho ai; quy trình tự động | Thông báo cho người theo dõi | Thông báo cho người theo dõi | Chưa kiểm |
| Giới hạn tốc độ | Số lệnh, và cách báo thời gian chờ: `Retry-After`, header riêng, không báo | Chưa kiểm | Chưa kiểm | 100 lần mỗi phút |

Năm dòng cần giải thích thêm:

- **Thời gian xử lý tối đa** là mốc mà sau đó một lệnh chắc chắn đã xong hoặc đã bị huỷ ở hệ thống đích.
  Không biết mốc này thì việc tra kết quả không chắc, vì lệnh gốc có thể ghi xong ngay sau lúc tra.
- **Tạo theo khoá ngoài** là khi bên gọi tự đặt mã cho bản ghi mới, và đích tạo bản ghi nếu chưa có mã đó, sửa nếu đã có.
  Đích có năng lực này thì gửi lại lúc nào cũng an toàn, không cần nhớ mã chống ghi trùng.
- **Dấu gắn trong bản ghi** là mã lệnh của cổng, ghi vào một trường của bản ghi mới, ví dụ phần mô tả hay một trường tuỳ ý.
  Nhờ dấu này, cổng tra được "lệnh tạo này đã ra task nào chưa" khi đích không tra được theo mã chống ghi trùng.
- **Bảng mã trả về** thay bảng chung hôm nay trong [`http.ts`](../../lab/gateway/src/adapters/http.ts).
  Mã không có trong bảng thì lệnh dừng ở "cần người xem", kèm mã và câu trả lời, để người vận hành bổ sung bảng.
- **Đọc nhất quán sau khi ghi** cho biết cổng phải chờ bao lâu trước khi tin kết quả tra.
  "Không biết" thì cổng coi như không tra được.

Cổng từ chối đăng ký bộ tiếp hợp thiếu bản khai, theo tinh thần của SR5 (không chắc thì chặn).
Luật dạng dữ liệu đọc được dòng "Thu hồi được", nên có thể bắt mọi thao tác không thu hồi được phải chờ duyệt.

**Chưa biết:**

- Mười bốn dòng có đủ để mô tả mọi đích không; mới thử trên ba thao tác của Lark và trên Stripe, Meta qua tài liệu.
- Các ô "Chưa kiểm" của Lark Task, cần tài liệu và một lần thử trên ứng dụng Lark thử.
- Lời khai sai gây hại tới đâu, và phép thử hợp đồng bắt được loại sai nào.

**Cách quyết định:** điền bản khai cho Lark Task, Lark Approval và hai đích ngoài nhóm Lark (một cổng thanh toán, một API quảng cáo) chỉ từ tài liệu.
Nếu một đích cần hành vi ngoài bảng, ghi lại dòng thiếu; nếu từ hai đích trở lên cần mã riêng, phương án B thắng cho phần đó.

**Kết luận:** đây là quyết định nền; mọi mục sau đọc bản khai, nên mục này chốt trước.

## 3. Không rõ lệnh đã chạy chưa thì làm gì

**Vấn đề:** P1 (không nhận ra lệnh gửi lại), P2 (đích quên mã sớm), P8 (đọc thấy dữ liệu cũ), P28 (mã trả về nhiều nghĩa).

| Phương án | Được | Mất |
| --- | --- | --- |
| A. Gửi lại cùng mã không giới hạn (cách làm hôm nay) | Không mất lệnh khi đích lọc trùng | Ghi trùng khi đích không lọc trùng hay đã quên mã |
| B. Gửi một lần, không rõ thì báo thất bại | Không bao giờ ghi trùng do cổng | Báo sai "thất bại" khi lệnh đã ghi; người dùng làm lại tay và ghi trùng |
| C. Chọn bước theo bản khai: gửi lại khi đích còn nhận ra lệnh, tra khi tra được, còn lại dừng chờ người | An toàn theo từng đích; chỉ dừng khi thật sự không biết | Phức tạp nhất; đúng tới đâu tuỳ bản khai đúng tới đâu |
| D. Luôn dừng chờ người khi không rõ | Không bao giờ sai | Mọi lần mạng chập chờn đều thành việc tay |
| E. Luôn tra trước rồi mới gửi lại, kể cả khi đích còn nhớ mã | Ít tin vào thời hạn nhớ mã | Thêm một lần đọc; trên đích đọc trễ, tra sai dẫn tới ghi trùng (P8) |

**Đang nghiêng về C.**
Hôm nay hàng đợi có bốn trạng thái: chưa gửi, đã gửi chưa rõ kết quả, xong, thất bại ([`command-store.ts`](../../lab/gateway/src/writes/command-store.ts)).
Khi một lệnh chưa rõ kết quả, hàng đợi hỏi lần lượt ba câu, theo bản khai:

1. **Đích còn nhận ra lệnh này không?** Có khi thao tác là tạo theo khoá ngoài.
   Cũng có khi đích nhớ mã, lần gửi đầu còn trong thời hạn trừ một biên an toàn, và lần gửi lại dùng cùng phạm vi.
   Với đích nhớ mã theo từng token, lệnh lưu token của lần gửi đầu, và gửi lại bằng đúng token đó khi nó còn hạn; token đã hết hạn thì câu trả lời là "không".
2. **Đích có kiểm số phiên bản cho thao tác này không?**
3. **Có tra được kết quả không, và đã qua thời gian xử lý tối đa và độ trễ đọc chưa?**

| Còn nhận ra | Kiểm phiên bản | Tra được | Bước tiếp theo |
| --- | --- | --- | --- |
| Có | Bất kỳ | Bất kỳ | Gửi lại cùng mã; đích báo lỗi trùng thì coi là đã ghi và tra để lấy bản ghi |
| Không | Có | Theo bản ghi | Gửi lại cùng số phiên bản; nếu bị từ chối vì phiên bản đã đổi thì tra bản ghi, theo bảng dưới |
| Không | Không | Có | Chờ qua thời gian xử lý tối đa và độ trễ đọc, rồi tra; đã ghi thì xong; chắc chắn chưa ghi mới gửi lại; còn lại chuyển "cần người xem" |
| Không | Không | Không | Không gửi lại; chuyển "cần người xem" |

Dòng thứ hai sửa lỗi tiềm ẩn đọc từ mã: lệnh đã ghi không còn bị báo thất bại chỉ vì lần gửi lại thấy phiên bản đã tăng.
Khi tra sau xung đột phiên bản, có một ca dễ kết luận sai: lệnh của cổng đã ghi, rồi người khác sửa tiếp trước lần gửi lại.
Bản ghi khi đó mang giá trị khác, dù lệnh của cổng đã chạy.
Vì vậy cổng chỉ kết luận theo bảng sau:

| Kết quả tra | Lịch sử ghi theo người ghi | Kết luận |
| --- | --- | --- |
| Đúng giá trị mong muốn | Bất kỳ | Xong; nếu do người khác ghi, vết ghi "đích đã ở trạng thái mong muốn" |
| Khác giá trị mong muốn | Có, và thấy lần ghi của cổng | Xong, rồi bị người khác sửa; vết ghi cả hai lần |
| Khác giá trị mong muốn | Có, và không thấy lần ghi của cổng | `TARGET_CHANGED` |
| Khác giá trị mong muốn | Không có | Cần người xem |

Một nguyên tắc chung bao mọi dòng trên: lệnh đã có một lần gửi chưa rõ kết quả thì không bao giờ bị báo thất bại chỉ vì lần gửi sau bị từ chối.
Lần gửi sau bị từ chối chỉ chứng minh lần đó không ghi; lệnh đi tra, hoặc chuyển "cần người xem".

Các loại câu trả lời sau có luật riêng, đọc từ bảng mã trả về của đích:

- **Quá giới hạn tốc độ, như 429:** đích nói rõ chưa làm, nên đây không phải "chưa rõ kết quả".
  Cổng chờ đúng thời gian đích báo, theo cách đã khai: `Retry-After`, hay header riêng như của Meta.
  Đích không báo thì cổng chờ theo mức giãn dần đã khai, và không gửi trước mốc đó, vì có đích khoá thêm khi bị gửi sớm.
  Lần chờ này không tính vào số lần gửi lại.
- **Token hết hạn, như 401:** đích chưa làm.
  Cổng lấy token mới rồi gửi; nếu lệnh đã có lần gửi chưa rõ kết quả bằng token cũ, lần gửi bằng token mới đi lại bảng trên với câu 1 là "không".
- **Đang chạy cùng mã, như 409 của Stripe hay 1470422 của Lark Task:** chưa rõ kết quả.
  Cổng chờ rồi gửi lại cùng mã và cùng nội dung, khi đích còn nhận ra lệnh.
- **Lỗi trùng đã khai, như 60012 của Lark Approval:** coi là đã ghi.
- **Mã không có trong bảng:** cần người xem.

Phương án này giữ ghi chú của SR6 (không ghi trùng) trong [PRD](../problem/prd-ai-platform.md): bảo đảm "tối đa một lần", không phải "đúng một lần".
Khi phải chọn giữa ghi trùng và dừng chờ người, cổng dừng.

**Ví dụ:** lệnh tạo task trên Lark Task bị mất câu trả lời.
Trong 5 phút đầu, cổng gửi lại cùng mã và cùng token.
Quá 5 phút mà vẫn chưa rõ, cổng không gửi lại mù nữa, vì tạo lại có thể sinh task thứ hai.
Nó chờ qua thời gian xử lý tối đa và độ trễ đọc, rồi tìm task mang dấu là mã lệnh của mình: thấy thì xong, chắc chắn không có thì tạo lại.
Lark Task chưa được kiểm có chỗ giữ dấu hay không; nếu không, lệnh chuyển sang "cần người xem".

**Chưa biết:**

- **Lưu token của lần gửi đầu** để gửi lại trong phạm vi nhớ mã là một bí mật mới nằm trong kho lệnh.
  Cách khác là không lưu token, và coi mỗi lần làm mới token là mất khả năng nhận ra lệnh, rồi đi nhánh tra.
  Hai cách đổi an toàn của bí mật lấy số lệnh phải dừng chờ người; chưa có số nào cho cả hai.
- **Biên an toàn** trước khi hết thời hạn nhớ mã nên là bao nhiêu, khi đồng hồ của cổng và của đích lệch nhau.
- **Tra theo dấu** cần đích cho tìm bản ghi theo một trường tuỳ ý; Lark Task chưa kiểm.

**Cách quyết định:** phép đo Q3 so A, B và C trên cùng các hồ sơ đích giả ([kế hoạch đo, mục 4](q3-measurement-plan.md#4-kế-hoạch-đo)).
D tính được từ dữ liệu của cánh A mà không cần chạy thêm, nên làm mốc cho cái giá "dừng chờ người".
E chỉ khác C trên đích còn nhớ mã; nó được đo như một biến thể của C nếu phép đo cho thấy C gửi lại sai trong thời hạn nhớ mã.

**Kết luận:** C là phương án duy nhất có thể đúng trên cả Lark Task lẫn hệ thống giả, nhưng nó đặt cược vào bản khai đúng; phép đo phải cho thấy cái giá của nó thấp hơn D.

## 4. "Đã nhận" khác "đã xong": trạng thái và đối soát

**Vấn đề:** P3 (nhận chưa phải xong), P5 (thành công một nửa).

| Phương án | Được | Mất |
| --- | --- | --- |
| A. Thêm trạng thái "đã được nhận", cổng hỏi lại định kỳ (polling) tới kết quả cuối | Không cần đích gọi ngược; chạy được sau tường lửa | Tốn lượt gọi, có thể chạm giới hạn tốc độ (P7); biết kết quả muộn tới một chu kỳ |
| B. Thêm trạng thái "đã được nhận", đích báo ngược qua webhook | Biết ngay; không tốn lượt gọi | Cổng phải mở cửa nhận từ ngoài; tin báo cũng có thể mất hay trùng |
| C. Không theo dõi; chỉ báo "đích đã nhận" và để người dùng tự kiểm | Đơn giản | Không ai biết khi việc hỏng sau đó |

**Đang nghiêng về A**, vì cổng hiện không mở cửa nhận từ ngoài.

Lệnh ghi có thêm hai trạng thái:

- **Đã được nhận:** đích nhận lệnh nhưng kết quả cuối còn chờ.
- **Cần người xem:** cổng không tự kết luận được mà không liều ghi trùng, nên dừng và báo người vận hành.

| Từ | Tới | Ai hay cái gì chuyển |
| --- | --- | --- |
| Chưa gửi | Đã gửi chưa rõ kết quả | Hàng đợi, sau khi kiểm lại quyền (mục 7) |
| Chưa gửi | Thất bại `AUTHORITY_CHANGED` | Hàng đợi, khi không còn quyền |
| Chưa gửi | Thất bại `EXECUTION_EXPIRED` | Hàng đợi, khi quá hạn thực thi (mục 8) |
| Chưa gửi | Thất bại `CANCELLED` | Người yêu cầu hay người duyệt bấm huỷ (mục 8) |
| Đã gửi chưa rõ kết quả | Xong, thất bại, đã được nhận | Câu trả lời của đích, hay kết quả tra |
| Đã gửi chưa rõ kết quả | Cần người xem | Hàng đợi, theo bảng ở mục 3 |
| Đã được nhận | Xong, thất bại | Đối soát |
| Đã được nhận | Cần người xem | Đối soát, khi quá thời gian chờ kết quả cuối |
| Cần người xem | Xong, thất bại | Người vận hành, sau khi xem hệ thống đích |
| Cần người xem | Đã gửi chưa rõ kết quả | Người vận hành bấm gửi lại, chỉ khi bản khai cho thấy đích còn nhận ra lệnh |

Đối soát (reconciliation) theo phương án A:

- Lệnh "đã được nhận" được tra lại theo chu kỳ giãn dần, tối đa 5 phút một lần, tới khi đích báo xong hoặc thất bại.
- Quá thời gian chờ kết quả cuối đã khai thì lệnh chuyển "cần người xem".
- Trang tiến độ và `get_request_status` nói ba mức khác nhau: đã gửi, đã được nhận, đã xong.
- Mỗi lần tra ghi một dòng vết, nên tra vết T-12 cho biết lệnh được xác nhận xong lúc nào; điều này phục vụ SR7 (vết xuyên suốt).

Với đề xuất nhiều mục, các mục độc lập nhau ([ADR-0007, mục 3.3](../../docs/adr/adr-0007-system-adapters-and-change-sets.md#33-đề-xuất-nhiều-mục)):

- Mục ở "đã được nhận" hay "cần người xem" không giữ các mục sau; hàng đợi vẫn gửi theo thứ tự, nhưng chỉ chờ mục trước rời trạng thái "đã gửi chưa rõ kết quả".
- Đề xuất có thêm hai trạng thái tạm, "chờ kết quả cuối" và "chờ người xem", ngoài ba trạng thái kết thúc của ADR-0007.
- Đề xuất kết thúc khi mọi mục đã xong, thất bại, hoặc được người vận hành đóng.

**Ví dụ ở AppotaPay (giả định):** lệnh hoàn tiền nằm ở "đã được nhận" tới khi ngân hàng xác nhận.
Trong lúc đó, trợ lý trả lời nhân viên chăm sóc khách hàng "ngân hàng đã nhận lệnh, kết quả dự kiến vào ngày làm việc tiếp theo", không nói "đã hoàn tiền".

**Chưa biết:** chu kỳ hỏi lại tốn bao nhiêu lượt gọi so với giới hạn tốc độ của đích; Lark Task có sự kiện thay đổi task để dùng phương án B không.

**Cách quyết định:** đo số lượt gọi của đối soát trên hồ sơ `late-result` và `rate-limited`; nếu đối soát chiếm quá một phần mười hạn mức của đích, xem lại B.

**Kết luận:** thêm trạng thái là việc chắc phải làm; chỉ cách biết kết quả cuối còn phải chọn.

## 5. Ai đóng lệnh mà cổng không tự kết luận được

**Vấn đề:** mọi phương án ở mục 3 trừ A đều có lệnh dừng chờ người.

| Phương án | Được | Mất |
| --- | --- | --- |
| A. Một vai mới, người vận hành, khác người yêu cầu và người duyệt | Tách quyền: không ai tự đóng lệnh của mình | Cần thêm người; dễ thành nút cổ chai |
| B. Trả về người yêu cầu tự kiểm và đóng | Không cần thêm người | Người yêu cầu thường không có quyền xem hệ thống đích; tự đóng lệnh của mình |
| C. Người duyệt đóng | Đã quen việc | Người duyệt không phải người hiểu hệ thống đích |

**Đang nghiêng về A.**

- Người vận hành không được là người yêu cầu hay người duyệt của chính đề xuất đó.
- Trang điều khiển hiện mỗi lệnh "cần người xem" kèm từng lần gửi, câu trả lời của đích, kết quả các lần tra, và lý do cổng dừng.
- Người vận hành tìm bản ghi trên hệ thống đích; với lệnh tạo, tìm theo dấu gắn trong bản ghi, tức mã lệnh của cổng.
- Thấy thay đổi đã có thì đóng là "đã xong"; chắc chắn chưa có thì đóng là "không làm được", và người yêu cầu soạn lại nếu cần.
- Nút "gửi lại" chỉ mở khi bản khai ghi đích còn nhận ra lệnh này.
- Mỗi lần đóng bắt buộc ghi lý do vào vết; mã trả về lạ được ghi vào bảng mã trả về của bộ tiếp hợp, để lần sau cổng tự xử lý.
- Người vận hành không tự sửa bản ghi trên đích thay cho lệnh, vì khi đó vết của cổng và vết của đích lệch nhau.

**Chưa biết:** số lệnh "cần người xem" mỗi ngày; nếu quá nhiều, người vận hành sẽ bấm cho qua.

**Cách quyết định:** số "cần người xem" của phép đo Q3, tính trên 1.000 lệnh ghi; Lab chưa có số lệnh ghi mỗi ngày của người dùng thật để đổi ra số việc của một người.

**Kết luận:** chọn A nếu số lệnh cần xem đủ thấp để một người xử lý trong ngày; nếu không, phải giảm số đó ở mục 3 trước.

## 6. Chống ghi đè khi đích không có số phiên bản

**Vấn đề:** P27 (không có số phiên bản), P8 (đọc thấy dữ liệu cũ), P29 (việc kéo theo).

| Phương án | Được | Mất |
| --- | --- | --- |
| A. Đọc lại ngay trước khi gửi, so các trường liên quan với lúc soạn | Chặn phần lớn ghi đè; không cần đích hỗ trợ | Còn khe giữa lúc đọc và lúc ghi; khe rộng thêm trên đích đọc trễ |
| B. Ghi có điều kiện nếu đích hỗ trợ, như ETag và `If-Match` | Không còn khe | Lark Task sửa task không có; chỉ dùng được cho đích có |
| C. Ghi rồi đọc lại để phát hiện ghi đè, báo người | Thấy được mọi ghi đè đã xảy ra | Phát hiện sau khi đã hỏng |
| D. Chấp nhận ghi đè, chỉ ghi vết | Đơn giản | Xoá quyết định của người khác mà không ai biết |

**Đang nghiêng về A, cộng B khi bản khai cho thấy đích hỗ trợ ghi có điều kiện.**

- Ngay trước mỗi lần gửi một lệnh sửa, cổng đọc lại bản ghi và so các trường liên quan với giá trị lúc soạn.
- Khác thì lệnh thất bại `TARGET_CHANGED`, như hôm nay.
- Đã đúng giá trị mong muốn thì lệnh xong mà không cần gửi; điều này cũng tránh một thông báo thừa ở đích (P29).
- Vẫn còn một khe nhỏ giữa lúc đọc lại và lúc ghi.
- Trên đích đọc trễ, lần đọc lại không thấy thay đổi mới hơn độ trễ đã khai, nên khe rộng thêm đúng bằng độ trễ đó.

**Chưa biết:** khe còn lại lớn tới đâu trong thực tế; Lark Task có trường thời gian sửa cuối để so thay vì so từng trường không.

**Cách quyết định:** giả thuyết 4 của phép đo Q3 đo khe này ([kế hoạch đo, mục 2](q3-measurement-plan.md#2-câu-hỏi-nghiên-cứu-q3)); C có thể thêm sau A như một lớp phát hiện nếu khe không đủ nhỏ.

**Kết luận:** A là cách duy nhất dùng được với Lark Task hôm nay; phép đo cho biết nó đủ chưa.

## 7. Kiểm lại quyền trước khi gửi

**Vấn đề:** P12 (thẩm quyền đổi giữa lúc duyệt và lúc ghi).
Hôm nay cổng kiểm luật và danh bạ lúc bấm Gửi ([`web/routes.ts`](../../lab/gateway/src/web/routes.ts)) và lúc duyệt ([`proposal-store.ts`](../../lab/gateway/src/proposals/proposal-store.ts), hàm `approve`).
Hàng đợi không kiểm lại trước từng mục, đúng như [ADR-0007, mục 3.5](../../docs/adr/adr-0007-system-adapters-and-change-sets.md#35-hàng-đợi-lệnh-ghi-chạy-nền) đã chọn.

| Phương án | Được | Mất |
| --- | --- | --- |
| A. Kiểm lại ngay trước lần gửi đầu của mỗi lệnh | Khôi phục "kiểm hai lần" của ADR-0002; rẻ | Không chặn được nếu danh bạ chưa cập nhật |
| B. Kiểm trước mọi lần gửi, kể cả gửi lại | Chặt hơn | Lệnh đã gửi mà mất quyền thì không gửi lại được, dù có thể chưa ghi; tăng số "cần người xem" |
| C. Khi danh bạ hay luật đổi, cổng quét và dừng mọi lệnh chưa gửi bị ảnh hưởng | Chặn ngay khi đổi, không chờ tới lúc gửi | Cần nguồn sự kiện từ danh bạ; phức tạp hơn |
| D. Giữ như ADR-0007, dựa vào hạn thực thi ngắn | Không thêm gì | Lệnh vẫn chạy bằng quyền đã mất trong suốt hạn |

**Đang nghiêng về A.**

- Người yêu cầu còn trong danh bạ, và luật hiện hành còn cho phép thay đổi đó.
- Người duyệt, nếu có, còn trong danh bạ và còn được duyệt theo luật hiện hành.
- Không kiểm được, ví dụ file luật hỏng, thì lệnh chờ chứ không gửi; lệnh chưa gửi nên không có nguy cơ quá thời hạn nhớ mã.
- Không còn quyền thì lệnh thất bại `AUTHORITY_CHANGED`, và vết ghi luật nào đã đổi.

Lệnh đã gửi mà chưa rõ kết quả thì không bao giờ bị báo thất bại vì quyền, vì có thể nó đã ghi.
Nếu quyền đã mất, lệnh đó chỉ được tra kết quả, hoặc chuyển "cần người xem", không gửi lại.
Điều này khôi phục [ADR-0002, điểm 4](../../docs/adr/adr-0002-safe-read-and-write.md#3-quyết-định-về-ghi) ("kiểm luật hai lần, lúc soạn và lúc ghi"), mà ADR-0007 mục 3.5 đã thu hẹp.

**Chưa biết:** danh bạ thật cập nhật trễ bao lâu sau khi một người nghỉ hay chuyển phòng; nếu trễ hơn hạn thực thi, A không chặn được gì mà D chưa chặn.

**Cách quyết định:** phép thử ở [kế hoạch đo, mục 4.4](q3-measurement-plan.md#44-phép-thử-cho-kiểm-lại-quyền-và-hạn-thực-thi) kiểm A đúng; độ trễ của danh bạ thật cần hỏi chủ dữ liệu.

**Kết luận:** A rẻ và đúng hướng, nhưng giá trị của nó tuỳ độ trễ của danh bạ, điều Lab chưa biết.

## 8. Hạn thực thi và huỷ lệnh chưa gửi

**Vấn đề:** P30 (lệnh đã duyệt nhưng đã lỗi thời).
Hạn thực thi là thời gian tối đa từ lúc duyệt tới lúc gửi lần đầu, sau đó lệnh không còn được tin là đúng ý người yêu cầu.

| Phương án | Được | Mất |
| --- | --- | --- |
| A. Hạn cố định cho từng hành động trong file luật; quá hạn thì thất bại | Đơn giản; luật kiểm được | Một con số cho mọi tình huống |
| B. Người duyệt chọn hạn khi duyệt | Đúng ngữ cảnh | Thêm một quyết định cho người duyệt; dễ bị bỏ qua |
| C. Quá hạn thì hỏi lại người yêu cầu xác nhận, thay vì thất bại | Không mất việc vẫn còn cần | Thêm một bước người; xác nhận lại nhưng không đọc lại dữ liệu |
| D. Không hạn, chỉ cho huỷ tay | Không chặn nhầm | Lệnh lỗi thời vẫn chạy nếu không ai nhớ huỷ |

**Đang nghiêng về A, cộng nút huỷ.**

- File luật khai hạn thực thi cho từng hành động.
  Con số đầu tiên là giả định để đo, ví dụ 24 giờ cho đổi người phụ trách, và chỉnh khi có số liệu dùng thật.
- Ngay trước lần gửi đầu, cùng lúc kiểm lại quyền (mục 7), hàng đợi kiểm hạn; quá hạn thì lệnh thất bại `EXECUTION_EXPIRED`.
- Người yêu cầu soạn lại bằng nút ở mục 9 nếu vẫn cần; đề xuất mới đọc lại dữ liệu và đi lại qua luật và duyệt.
- Người yêu cầu hay người duyệt huỷ được mọi lệnh còn "chưa gửi" của đề xuất; lệnh thất bại `CANCELLED`, và vết ghi ai huỷ.
- Lệnh đã gửi thì không huỷ được bằng nút này, vì có thể nó đã ghi; muốn đảo ngược thì soạn đề xuất mới.

Hạn thực thi chỉ áp cho lần gửi đầu.
Lệnh đã gửi mà chưa rõ kết quả không bao giờ bị huỷ vì hết hạn, cùng lý do như ở mục 7.

**Chưa biết:** hạn hợp lý cho từng hành động; thao tác không thu hồi được có cần hạn ngắn hơn không.

**Cách quyết định:** thời gian từ duyệt tới gửi đo được trên hồ sơ `rate-limited`; con số đầu chỉ cần đủ dài để không chặn nhầm trong phép đo.

**Kết luận:** A cộng nút huỷ là mức tối thiểu; con số cụ thể đến từ số đo, không từ tài liệu này.

## 9. Đề xuất thành công một nửa

**Vấn đề:** P5 (thành công một nửa).
Mỗi đề xuất chỉ chứa một loại bản ghi, và các mục độc lập nhau.
Vì vậy "một nửa" trong Lab là 20 task đã chuyển và 10 task bị từ chối, không có mục nào phải hoàn tác.

| Phương án | Được | Mất |
| --- | --- | --- |
| A. Tách rõ trạng thái từng mục, và một nút soạn lại đề xuất cho các mục chưa xong | Rẻ; đề xuất mới đi lại qua luật và duyệt | Người dùng phải bấm thêm |
| B. Tất cả hoặc không: mục hỏng thì hoàn tác mục đã xong | Không có trạng thái nửa vời | Cần thao tác bù trừ cho từng hành động; có việc không hoàn tác được |
| C. Tự gửi lại mục bị từ chối | Không cần người | Mục bị từ chối thường bị từ chối vì lý do đúng |

**Đang nghiêng về A.**
Trang tiến độ và câu trả lời của trợ lý tách rõ mục xong, mục bị từ chối kèm lý do, mục chờ kết quả cuối và mục cần người xem.

**Cách quyết định:** B chỉ được xem lại khi có đề xuất cần đổi hai hệ thống cùng lúc (mục 12).

**Kết luận:** với các mục độc lập, A đủ.

## 10. Chặn hai đề xuất cho cùng một việc

**Vấn đề:** P4 (hai đề xuất cho cùng một việc).
Ý định nghiệp vụ (business intent) là việc người dùng muốn đạt, không phụ thuộc cách trợ lý diễn đạt: cùng loại việc, cùng bản ghi, cùng kết quả.

| Phương án | Được | Mất |
| --- | --- | --- |
| A. Khoá ý định do bộ tiếp hợp khai; cổng từ chối đề xuất cùng khoá đang mở | Chặn ở cổng, không tin vào mô hình | Chặn nhầm việc hợp lệ giống nhau; mỗi hành động phải khai khoá |
| B. Cổng cảnh báo trên trang xác nhận, người dùng bấm "vẫn làm" | Không chặn nhầm | Người dùng quen bấm qua cảnh báo |
| C. Trợ lý tự tra đề xuất đang mở trước khi soạn | Không cần khai khoá | Dựa vào mô hình; mô hình yếu bỏ qua bước tra |
| D. Không chặn, dựa vào người duyệt | Không thêm gì | Hai người duyệt khác nhau không thấy nhau |

**Đang nghiêng về A**, với khả năng hạ xuống B nếu tỉ lệ chặn nhầm cao.

- Mỗi hành động trong bộ tiếp hợp khai các trường tạo nên khoá ý định, ví dụ "đổi người phụ trách + mã task", hay "tạo task + tiêu đề đã chuẩn hoá + người nhận + hạn".
  Ở Gamota (giả định), khoá cho hoàn tiền sẽ là "hoàn tiền + mã giao dịch nạp gốc".
- Khi trợ lý soạn đề xuất, cổng tìm đề xuất có cùng khoá đang mở (đang soạn, chờ duyệt, đang ghi) hoặc vừa xong trong một khung thời gian khai trong file luật.
- Có thì cổng từ chối với mã lý do mới `DUPLICATE_INTENT` và trả link tới đề xuất cũ; người dùng huỷ đề xuất cũ nếu thật sự muốn làm lại.

Khoá ý định chặn hai *đề xuất* cho cùng một việc; nó không thay việc chống ghi trùng cho từng *lệnh*, vốn do mục 3 lo.

Để vấn đề này đo được, danh sách task giả có thêm thao tác **tạo task**, đóng vai mọi thao tác không tự lọc trùng như "cộng thêm N".
Lệnh tạo task ghi mã lệnh của cổng vào một trường của task mới, làm dấu cho việc tra ở mục 3.
Thao tác này đổi hợp đồng ghi của bộ tiếp hợp, vốn luôn có mã bản ghi và số phiên bản, nên phải ghi trong ADR-0009.

**Chưa biết:** trợ lý có thật sự soạn đề xuất trùng khi người dùng hỏi lại không; tỉ lệ chặn nhầm trên câu yêu cầu thật.

**Cách quyết định:** giả thuyết 5 và phép thử chặn nhầm ở [kế hoạch đo, mục 4.3](q3-measurement-plan.md#43-phép-thử-cho-khoá-ý-định).
Nếu trợ lý không soạn trùng ở 0 trên 20 cuộc, A vẫn giữ cho MausBot, vì bot chạy lại theo lịch không qua mô hình hội thoại.
Nếu cận trên của tỉ lệ chặn nhầm vượt 5%, chọn B.

**Kết luận:** chọn giữa chặn và cảnh báo do tỉ lệ chặn nhầm quyết định, không do sở thích.

## 11. Cần đọc gì trước khi chọn

Các phương án trên mới dựa vào tài liệu của Lark, Stripe, Meta và mã của Lab.
Chưa phương án nào được so với cách các hệ thống lớn đã giải cùng việc.
Bảng dưới liệt kê nguồn công khai cần đọc; mỗi câu trích sau này phải có kiểm chứng trong `rd/checks/`.

| Mục | Câu hỏi khi đọc | Nguồn cần đọc |
| --- | --- | --- |
| 2, 3 | Chuẩn nào đã định nghĩa cách báo "đang chạy cùng mã" và "mã dùng lại với nội dung khác" | Bản nháp IETF về header `Idempotency-Key` |
| 3 | Thư viện chống ghi trùng phía bên gọi lưu trạng thái "đang chạy" và hết hạn thế nào | Tiện ích idempotency của AWS Lambda Powertools; bài về gửi lại an toàn trong Amazon Builders' Library |
| 3 | Hệ thống chạy việc bền vững xử lý việc có hiệu ứng ngoài và gửi lại thế nào | Hướng dẫn về activity và retry của Temporal |
| 3 | Thiết kế API nên cho bên gọi đặt mã yêu cầu thế nào | Google AIP-155 (định danh yêu cầu); bài của Stripe về thiết kế API có chống ghi trùng |
| 3, 4 | Cách ghi lệnh và gửi đi tách nhau mà không mất lệnh | Mẫu transactional outbox và saga ở Azure Architecture Center |
| 6 | Ghi có điều kiện và mã báo điều kiện sai | RFC 9110, phần yêu cầu có điều kiện (`If-Match`, 412) |
| 7 | Quyền đổi giữa lúc kiểm và lúc dùng | Bài báo Zanzibar của Google, phần "new enemy problem" |
| 8 | Lệnh đã cho phép nhưng chưa thực hiện thì hết hạn thế nào | Thời hạn thu tiền của khoản đã giữ chỗ (authorization) ở Stripe |
| 2, 3, 4 | Lark Task có trường tuỳ ý cho dấu, có tìm theo trường đó, có sự kiện thay đổi task, có thời gian sửa cuối không | Tài liệu Lark Task v2 và một lần thử trên ứng dụng Lark thử |

Mỗi nguồn đọc xong ghi vào mục tương ứng ở trên: phương án nào nó ủng hộ, phương án nào nó cho thấy còn thiếu.
Giới hạn thời gian: nửa ngày cho mỗi dòng, theo [thứ tự tìm hiểu](write-safety-research-plan.md).

**Kết luận:** đọc trước, đo sau; một phương án đã có ở hệ thống lớn và được đo trên hồ sơ giả thì mới đủ để chốt.

## 12. Ngoài phạm vi và vì sao

| Việc | Vì sao chưa làm | Xem lại khi |
| --- | --- | --- |
| Trợ lý tự bấm duyệt khi chạy lệnh trên máy (P20) | Hướng khác trong danh mục; cần hộp cát, tức môi trường chạy cách ly, và mô hình mạnh hơn | Thổ Thần hay MausBot cho agent chạy lệnh trên máy người dùng |
| Cách bày công cụ và báo thành công giả (P18, P19) | Hướng khác; không thuộc câu hỏi ghi an toàn | Các phương án ở đây đã đo xong và còn thời gian |
| Tên tiếng Việt trùng (P23) | Hướng khác | Có người dùng thật và gặp tên trùng |
| Bù trừ giữa nhiều hệ thống | Mỗi đề xuất chỉ một loại bản ghi, các mục độc lập | Có việc cần đổi hai hệ thống trong một đề xuất, như thu hồi vật phẩm game rồi hoàn tiền vào ví |
| Nhận tin báo ngược (webhook) | Hỏi định kỳ đủ để biết kết quả cuối; xem mục 4 | Hệ thống thật chỉ báo kết quả qua webhook |
| Hệ thống chỉ nhận file (P10) | Chưa biết hệ thống nào sẽ nối dùng file | Có việc thật cần một hệ thống như vậy |
| Ghi bằng token của từng người (P9) | Lab ghi bằng khoá dịch vụ của cổng; xem [kế hoạch cập nhật giả lập](simulation-update-plan.md), U3 | Nối Lark Task, vì phạm vi nhớ mã của Lark Task tính theo token |
| Một việc nhiều lời gọi (P31) | Bộ tiếp hợp chỉ bày thao tác một lời gọi; các mục của đề xuất độc lập nhau | Có việc thật cần tạo task kèm file, hay việc khác mà lời gọi sau cần kết quả lời gọi trước |
| Đường duyệt chặt hơn cho thao tác không thu hồi được (P6) | Đổi người phụ trách và tạo task sửa lại được | Nối hệ thống tin nhắn, thanh toán hay hoá đơn |
| Vết phía đích (P16): Lark chỉ thấy ứng dụng của cổng, không thấy người yêu cầu và người duyệt | Vết của cổng đã nối đủ ba người; không làm sai trạng thái | Chủ dữ liệu yêu cầu đọc vết ngay trên Lark |
| Chạy nhiều bản cổng cùng lúc | Lab chỉ đo, chưa có người dùng; một tiến trình đủ | Tải vượt một tiến trình |

**Kết luận:** phạm vi giữ hẹp ở hàng đợi ghi và bộ tiếp hợp, để kết quả là số đo, không phải nhiều tính năng làm dở.

## 13. Nếu chọn các phương án đang nghiêng: ADR-0009 sẽ ghi gì

Mục này cho biết cái giá về kiến trúc nếu mọi mục giữ phương án đang nghiêng.
Một mục chọn khác thì dòng tương ứng đổi theo.

ADR-0009 sẽ ghi năm quyết định:

1. Bản khai năng lực là phần bắt buộc của bộ tiếp hợp, cho từng thao tác, gồm bảng mã trả về và độ trễ đọc; thiếu thì cổng không khởi động.
2. Hàng đợi có thêm trạng thái "đã được nhận" và "cần người xem", chọn bước gửi lại theo bản khai, coi 429 và 401 là "chưa làm", và không bao giờ kết luận thất bại từ một lần gửi lại bị từ chối.
3. Đề xuất có thêm hai trạng thái tạm, và người vận hành là vai đóng lệnh "cần người xem".
4. Hàng đợi kiểm lại quyền và hạn thực thi trước lần gửi đầu của mỗi lệnh, và lệnh chưa gửi huỷ được.
5. Hợp đồng ghi của bộ tiếp hợp có thêm thao tác tạo mới, không có mã bản ghi và số phiên bản; khoá ý định thay chỗ số phiên bản cho thao tác đó, dấu gắn trong bản ghi cho phép tra nó, và đọc lại trước khi gửi thay chỗ số phiên bản cho đích không có nó.

ADR-0009 khi đó thay các điểm sau:

| ADR | Điểm | Đổi thành |
| --- | --- | --- |
| ADR-0002 | Mục 3, điểm 5: hệ đích trả kết quả cũ khi gặp mã đã thấy | Hệ đích khai cách nó xử lý mã đã thấy |
| ADR-0002 | Mục 3, điểm 6: khi khởi động, gửi lại mọi lệnh chưa rõ kết quả với mã cũ | Khởi động cũng đi qua bảng ở mục 3 |
| ADR-0002 | Mục 3, câu "chỉ đúng vì hệ đích tôn trọng mã chống ghi trùng và số phiên bản" | Bảo đảm theo từng hồ sơ đích |
| ADR-0002 | Mục 4, hệ quả 1: hệ thống giả phải nhận mã và số phiên bản | Hệ thống đích phải có bản khai |
| ADR-0007 | Mục 3.5: gửi lại không giới hạn số lần | Gửi lại theo bản khai |
| ADR-0007 | Mục 3.5: đề xuất kết thúc ở một trong ba trạng thái | Thêm hai trạng thái tạm |
| ADR-0007 | Mục 3.5: không kiểm lại luật trước từng mục | Kiểm lại trước lần gửi đầu, khôi phục ADR-0002 điểm 4 |
| ADR-0007 | Mục 3.6, bước 1: hệ thống nhận mã chống ghi trùng và số phiên bản | Hệ thống có bản khai năng lực |
| ADR-0007 | Mục 4: thu hồi khoá sau khi duyệt không chặn được việc đang chạy nền | Chặn được lệnh chưa gửi |

Bảng thuật ngữ khi đó thêm tám từ: bản khai năng lực, ý định nghiệp vụ, đối soát, cần người xem, thời gian xử lý tối đa, bảng mã trả về, độ trễ đọc, hạn thực thi.

**Kết luận:** các phương án đang nghiêng thay chín điểm của ADR-0002 và ADR-0007; đó là lý do phải đo trước khi chọn.

## 14. Rủi ro của thiết kế

| Rủi ro | Cách giảm |
| --- | --- |
| Bản khai sai, ví dụ khai đích còn nhận ra lệnh khi thật ra không | Phép thử hợp đồng hằng ngày; ô "Chưa kiểm" chỉ được điền bằng một lần thử, không bằng suy đoán |
| Thêm trạng thái làm hỏng phần lõi đã ổn định | Đo cách cũ trước; các phép thử hiện có và phép đo `q1-outbox` chạy lại sau mỗi PR |
| Khoá ý định chặn nhầm việc hợp lệ | Đo tỉ lệ chặn nhầm; hạ xuống cảnh báo nếu vượt ngưỡng (mục 10) |
| "Cần người xem" xảy ra nhiều tới mức người vận hành bỏ qua | Báo số này như chỉ số chính; nếu cao, ưu tiên đích tra được kết quả |
| Lưu token trong kho lệnh làm lộ bí mật | Chọn giữa lưu token và đi nhánh tra bằng số đo (mục 3) |

**Kết luận:** rủi ro lớn nhất của thiết kế là bản khai sai, nên phép thử hợp đồng là điều kiện để nối đích thật, không phải việc thêm.

## Tài liệu liên quan

- [Spec ghi an toàn](write-safety-spec.md)
- [Khảo sát hệ thống thật](../research/target-system-gaps.md)
- [Kế hoạch đo Q3](q3-measurement-plan.md)
- [ADR-0002](../../docs/adr/adr-0002-safe-read-and-write.md), [ADR-0007](../../docs/adr/adr-0007-system-adapters-and-change-sets.md)
