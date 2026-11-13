> **CHƯA REVIEW - KHÔNG TIN HOÀN TOÀN.** Khung rỗng do agent dựng ngày 2026-11-13, chưa có nội dung quyết định.
> Mọi ô `[chờ điền]` là chỗ trống, không phải số 0 và không phải kết luận.
> File này không kế thừa số hiệu, câu hỏi hay giả thuyết nào từ `research/11-cau-hoi-va-gia-thuyet.md`, vì file đó đang ở trạng thái `Không hợp lệ` trong sổ review ngày 2026-11-13.
> Chưa chọn tổ hợp nào, chưa có số đo, chưa phải ADR.
> Trạng thái: [`../REVIEW-STATUS.md`](../REVIEW-STATUS.md).

# Bước 04 - Đề xuất mô hình thử nghiệm và phạm vi MVP

Owner: Phạm Bách Hiệp. Mentor: Kevin.
Ngày: 2026-11-13. Revision 0.1.
Trạng thái: khung rỗng, chưa review, chưa phải ADR.

Đây là đầu ra của bước 04 trong bảy bước của chương trình.
Nguyên văn yêu cầu: "Chọn mô hình thử nghiệm; giải thích vì sao không chọn phương án còn lại. Sơ đồ giải pháp, phạm vi MVP, Architecture Decision Record."

Bốn đầu ra đó ánh xạ vào bốn phần của file này, cộng một tệp riêng:

| Đầu ra bắt buộc | Nằm ở | Xong khi |
| --- | --- | --- |
| Chọn mô hình thử nghiệm | Mục 4 | Một câu quyết định, có mã tổ hợp, có ngày |
| Vì sao không chọn phương án còn lại | Mục 5 | Bốn mục, mỗi mục có năng lực thiếu, neo, và điều kiện sống lại |
| Sơ đồ giải pháp | Mục 6 | Ba hình, có mã liên kết, không có nét vẽ không tên |
| Phạm vi MVP | Mục 7 | Mỗi dòng có mã test hoặc lý do loại |
| Architecture Decision Record | Mục 4 cộng tệp `ADR-0001-lop-dieu-khien-ghi.md` | ADR ở trạng thái `Proposed`, có mục "điều gì làm lật" |

Phạm vi: chọn tổ hợp để thử, vẽ sơ đồ, chốt biên MVP, và ghi ADR.
Ngoài phạm vi: số đo, baseline, tuyên bố thành công, mã nguồn, chọn model, chọn nhà cung cấp hạ tầng.
Không số nào trong file này được là số đoán.
Không khẳng định nào về nguồn ngoài được không có mã nguồn.

Đầu vào, tất cả đều là bản nháp chưa review:

- [`../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md`](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md): SR1-SR8 và M1-M6 ở Phần 3 đã review; bảy thành phần và U1-U5 ở Phần 2 đang mở lại.
- [`08-khao-sat-nam-phuong-phap-tich-hop.md`](08-khao-sat-nam-phuong-phap-tich-hop.md): năm phương pháp, bản đồ hai tầng.
- [`09-bang-so-sanh-va-tieu-chi-lua-chon.md`](09-bang-so-sanh-va-tieu-chi-lua-chon.md): sáu trục, C1-C6, quy tắc loại, bảng phủ SR, năm ca sai.
- `07-kien-truc-ung-vien-tu-he-thong-that.md`: tên P1-P5 và ánh xạ A, B, C. Chưa review, chỉ dùng để đặt tên tổ hợp.

Không dùng làm đầu vào: `research/11-cau-hoi-va-gia-thuyet.md`.
Sổ review ghi ngày 2026-11-13: `Không hợp lệ`, không được tham khảo, không được dùng làm nền cho bản sau, và bước 03 phải viết lại từ đầu.
Vì vậy mọi câu hỏi chặn, mọi liên kết và mọi điều kiện lật trong file này được định nghĩa lại tại chỗ, chỉ dựa vào SR1-SR8, M1-M6 và file 09.

## 0. Tóm tắt

| Việc | Mục |
| --- | --- |
| Chốt nền bằng chứng và điều kiện vào, kể cả chỗ trống do bước 03 bị loại | 1 |
| Chốt đơn vị quyết định và hai lớp của nó | 2 |
| Chấm năm tổ hợp, cho phép ô `chưa chấm` | 3 |
| Một câu quyết định, ba quyết định chờ spike | 4 |
| Bốn mục vì sao không chọn | 5 |
| Ba sơ đồ và bảng mười liên kết | 6 |
| Biên MVP, tool, quyền, trace, bộ test | 7 |
| Chưa làm: chưa đo, chưa có mã, chưa chốt Accepted | 8, 9 |

### 0.1. Cách đọc

Ruột của mỗi mục là một luật ngắn, rồi đến bảng để điền.
Ô `[chờ điền]` nghĩa là chưa có dữ kiện.
Theo quy tắc ở file 09 mục 2.3, ô chưa có dữ kiện không được quy thành 0, vì 0 là một khẳng định.

Ba nhãn dùng trong cả file:

- `quyết định`: câu chốt, có ngày, có người. Sửa được nhưng phải vào nhật ký revision.
- `giả thuyết`: phát biểu chưa kiểm, phải kèm phép thử và điều kiện bác ngay trong dòng đó.
- `chờ spike`: quyết định đã biết là chưa đủ dữ kiện, có hạn và có điều kiện lật.

Số hiệu trong file này không mượn của file khác:

- `S1` đến `S3`: quyết định chờ spike, định nghĩa ở mục 4.3.
- `L1` đến `L10`: liên kết giữa hai thành phần, định nghĩa ở mục 6.4.
- `T-`: mã test, định nghĩa ở mục 7.7.

### 0.2. Vì sao bước 04 không được chốt `Accepted`

Bước 04 chỉ ra quyết định để thử, và bước 05 mới dựng thứ để kiểm nó.
Ba quyết định ở mục 4.3 là ba chỗ không thể chốt bằng đọc tài liệu, nên ADR-0001 ra ở trạng thái `Proposed`, và `ADR-0002` sau spike sẽ xác nhận hoặc thay thế.
File này không được viết chữ `Accepted` ở bất kỳ đâu.

Điều kiện thứ hai: bước 03 hiện không có đầu ra hợp lệ.
Mục 1.4 nêu hai cách hợp lệ để đi tiếp, và không có cách thứ ba.
Cách thứ nhất là chờ bước 03 có bản thay thế.
Cách thứ hai là người sở hữu chấp thuận dẫn lại các câu hỏi chặn tại chỗ trong file này, với điều kiện mỗi câu có phép thử và điều kiện bác ngay từ đầu.

## 1. Nền bằng chứng và điều kiện vào

Luật: bước 04 chỉ được chấm khi biết rõ cái gì đã kiểm và cái gì còn là giả thuyết.
Không chấm trên một nền chưa xác nhận mà không nói ra.

### 1.1. Trạng thái các tài liệu đầu vào

| Tài liệu | Trạng thái trong sổ | Dùng được như dữ kiện | Dùng làm gì trong file này |
| --- | --- | --- | --- |
| Bước 0 | Đang review, Phần 2 mở | Phần 1 và Phần 3 | Nguồn của SR1-SR8, M1-M6, U1-U5 |
| 08 | Chưa review | Không | Bản đồ phương pháp, đọc để đặt tên |
| 09 | Chưa review | Không | C1-C6, quy tắc loại, bảng phủ SR, năm ca sai |
| 07 | Chưa review | Không | Tên P1-P5 và ánh xạ A, B, C |
| 11 | Không hợp lệ | Không, kể cả làm nền | Không dùng. Xem đầu file và mục 1.4 |

### 1.2. Ba script kiểm nguồn

| Script | Phủ gì | Số phép kiểm | Kết quả | Ngày chạy | Chỗ lệch đã ghi |
| --- | --- | --- | --- | --- | --- |
| `checks/verify-sources-08.sh` | 68 câu trích của file 08 | 68 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| `checks/verify-sources-09.sh` | 21 câu trích của file 09 | 21 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| `checks/verify-report-2.sh` | 9 phép kiểm mục 2.3 của bước 0 | 9 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |

Kết luận của mục này là một câu đúng/sai: hoặc cả ba script khớp, hoặc file ghi rõ dòng nào lệch và dòng đó không được dùng để chấm.

### 1.3. Sáu chỗ vênh phải chốt trước khi chấm

Luật: mỗi dòng đóng bằng một câu, một ngày, và tên người chốt.
Chưa đóng dòng nào thì mục 3 không được chấm.

| # | Chỗ vênh | Nguồn | Câu chốt | Ngày | Người chốt |
| --- | --- | --- | --- | --- | --- |
| 1 | Nghĩa của ba mức `cung cấp sẵn`, `một phần`, `không nói tới`: ba ô lệch giữa 08 và 09 | 09 mục 5.1 | `[chờ điền]` | | |
| 2 | Nghĩa của "30 tool" khi đo M4 | 09 mục 7 | `[chờ điền]` | | |
| 3 | Đơn vị quyết định dùng P1-P5, không dùng A, B, C | 07 mục 4.1 | `[chờ điền]` | | |
| 4 | Duyệt `chưa chấm` là hợp lệ, không bị tính là 0 | 09 mục 2.3 | `[chờ điền]` | | |
| 5 | Điều kiện sàn M1, M2 chốt trước lần chạy đầu | 09 mục 2.2 | `[chờ điền]` | | |
| 6 | Bước 03 đi theo cách nào ở mục 1.4 | Sổ review, dòng 11 | `[chờ điền]` | | |

### 1.4. Cổng vào G0

Mục 1 xong khi cả bốn điều đúng:

1. Mục 1.1 nêu rõ tài liệu nào chỉ dùng để tham chiếu và tài liệu nào bị loại.
2. Mục 1.2 có kết quả của cả ba script, kèm ngày.
3. Mục 1.3 không còn dòng nào để trống ở cột "Câu chốt".
4. Có một trong hai quyết định sau, ghi kèm ngày và người:

| Cách đi tiếp | Điều kiện | Ai chấp thuận | Ngày |
| --- | --- | --- | --- |
| A. Chờ bước 03 có bản thay thế hợp lệ, rồi mới chấm | Bản thay thế có câu hỏi chặn, phép thử và điều kiện bác | `[chờ điền]` | |
| B. Dẫn lại câu hỏi chặn tại chỗ trong file này | Mỗi câu ở mục 4.3 có phép thử, điều kiện bác, và hạn | `[chờ điền]` | |

## 2. Đơn vị quyết định

Luật: bước 04 quyết định ở tầng tổ hợp, và tách một tổ hợp thành hai lớp.
Chấm điểm ở tầng phương pháp là sai đơn vị, đã chốt ở file 09 mục 1.

### 2.1. Vì sao ở tầng tổ hợp

`[chờ điền: đoạn 4 đến 6 câu, neo vào bảng phủ SR mục 5 file 09, nêu không cột nào có quá một ô cung cấp sẵn]`

### 2.2. Hai lớp của một quyết định

Luật: một lớp được chọn, một lớp được so sánh.

| Lớp | Câu hỏi | Số lựa chọn | Vì sao tách |
| --- | --- | --- | --- |
| Lớp điều khiển ghi | Ai được ghi, ghi khi nào, bằng chứng ở đâu | Một | Đây là câu của SR1 đến SR7, và đề bài bắt chọn một |
| Lớp hợp đồng tool | Công cụ được phát hiện và mô tả thế nào | Hai, chạy song song | Đề bài bắt dựng hai cách tích hợp để so sánh công sức, kiểm soát, độ tin cậy |

Neo cho cách tách này: file 07 mục 4.1 ghi A và B khác nhau đúng một biến là công cụ được phát hiện thế nào, nên so A với B không trả lời được SR1, SR2, SR4, SR5.

### 2.3. Năm tổ hợp và ánh xạ

| Mã | Tên | Quyết định "cho ghi" nằm ở đâu | Ánh xạ file 05 | Trạng thái trong bước 04 |
| --- | --- | --- | --- | --- |
| P1 | Runtime gate | Runtime | A, B | `[chờ điền]` |
| P2 | Gateway cộng policy engine | Policy engine | Không có | `[chờ điền]` |
| P3 | Durable workflow | Người viết workflow | C | `[chờ điền]` |
| P4 | Nền tảng connector | Account uỷ quyền cộng công tắc admin | Không có | `[chờ điền]` |
| P5 | Hai danh tính | Hệ đích | Không có | `[chờ điền]` |

### 2.4. Năm biến mà quyết định phải trả lời

| Biến | Câu hỏi | Giá trị được chọn | Neo |
| --- | --- | --- | --- |
| V1 | Cổng ghi đặt ở đâu | `[chờ điền]` | SR1 |
| V2 | Phán quyết đặt ở đâu | `[chờ điền]` | SR2, SR5 |
| V3 | Chuỗi danh tính mang theo kiểu gì | `[chờ điền]` | SR1, SR7 |
| V4 | Hợp đồng tool do ai sở hữu | `[chờ điền]` | SR8 |
| V5 | State của lần chờ nằm ở đâu | `[chờ điền]` | SR4, SR6 |

## 3. Bảng chấm

Luật: cổng trước, điểm sau. Cổng áp lên tổ hợp, không áp lên từng phương pháp.

### 3.1. Cổng SR1-SR8

| SR | Tiêu chí kiểm | Mã test | Tổ hợp được chọn | Bằng chứng |
| --- | --- | --- | --- | --- |
| SR1 | Người không có quyền bị từ chối, trace ghi đúng người yêu cầu | `T-SR1` | `[chờ điền]` | `[chờ điền]` |
| SR2 | Xóa câu dặn quyền trong prompt, quyết định không đổi | `T-SR2` | `[chờ điền]` | `[chờ điền]` |
| SR3 | 0 trường ngoài phạm vi ở điểm agent nhận | `T-SR3` | `[chờ điền]` | `[chờ điền]` |
| SR4 | Sửa tham số sau khi duyệt thì quyết định mất hiệu lực | `T-SR4` | `[chờ điền]` | `[chờ điền]` |
| SR5 | Kho quyền không trả lời thì không có thay đổi nào được ghi | `T-SR5` | `[chờ điền]` | `[chờ điền]` |
| SR6 | Retry sau khi mất phản hồi không tạo bản ghi thứ hai | `T-SR6` | `[chờ điền]` | `[chờ điền]` |
| SR7 | Một trace trả lời được ai, lúc nào, vì sao, kết quả, chi phí | `T-SR7` | `[chờ điền]` | `[chờ điền]` |
| SR8 | Agent thứ hai dùng lại tool, không thừa hưởng quyền | `T-SR8` | `[chờ điền]` | `[chờ điền]` |

### 3.2. Sáu tiêu chí chấm

| Mã | Tiêu chí | Đo bằng | Mức 2 | Mức 1 | Mức 0 | `chưa chấm` |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Kiểm soát và bằng chứng | Số ô phải tự dựng ở mục 5 file 09, cộng kết quả test quyền | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| C2 | Chi phí mỗi lần ghi thành công | M3, đo ở bước 06 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| C3 | Bảo trì | M5 cộng số thành phần | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| C4 | Mở rộng | M4 cộng giới hạn cứng có công bố | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| C5 | Tái dùng tách khỏi quyền | M6 cộng SR8 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| C6 | Năng lực còn thiếu phải tự dựng | Số ô `cung cấp sẵn` và `một phần` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |

### 3.3. Bảng chấm năm tổ hợp

| Tổ hợp | C1 | C2 | C3 | C4 | C5 | C6 | Số ô `chưa chấm` | Cổng SR | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | |
| P2 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | |
| P3 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | |
| P4 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | |
| P5 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | |

### 3.4. Quy tắc loại và quy tắc hòa

Luật: chép nguyên quy tắc của file 09 mục 2.4 và 2.5 vào đây, không diễn giải lại.
Mỗi lần dùng một quy tắc để loại, ghi mã quy tắc và dòng bằng chứng.

| Lần loại hoặc hòa | Quy tắc | Dòng bằng chứng | Kết quả |
| --- | --- | --- | --- |
| `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |

### 3.5. Điều kiện sàn

| Đại lượng | Ngưỡng | Chốt ngày | Ai chốt | Áp lên |
| --- | --- | --- | --- | --- |
| M2 số bản ghi trùng và mất | 0 và 0 | | | Tổ hợp được chọn |
| M1 p95 | Chốt sau khi có baseline, theo 09 mục 2.2 | | | Tổ hợp được chọn |

### 3.6. Điều cấm khi chấm

- Không quy ô `chưa chấm` thành 0 hoặc 1.
- Không dùng giá niêm yết thay cho M3.
- Không cộng điểm năm tổ hợp thành một bảng xếp hạng duy nhất.
- Không chấm bằng trích dẫn từ file chưa review hoặc file `Không hợp lệ`.
- Không sửa tiêu chí sau khi đã thấy kết quả, trừ khi vào nhật ký revision.

## 4. Quyết định

Luật: mỗi mục dưới đây chỉ một câu quyết định, có mã neo.
Không có câu "nhìn chung là tốt hơn".

### 4.1. Quyết định

`[chờ điền: một câu, nêu tổ hợp được chọn, lớp nào giữ, lớp nào làm đối chứng, cái gì hoãn]`

### 4.2. Phạm vi áp dụng

| Được áp dụng cho | Không được áp dụng cho |
| --- | --- |
| `[chờ điền]` | `[chờ điền]` |

### 4.3. Ba quyết định chờ spike

Luật: mỗi dòng có hạn và điều kiện lật, và mỗi dòng trỏ về một ràng buộc SR của bước 0 Phần 3 đã review.
Không dòng nào được để trống hạn.

| Mã | Quyết định chờ | Ràng buộc | Phép thử | Điều kiện bác | Hạn |
| --- | --- | --- | --- | --- | --- |
| S1 | Nơi đặt điểm dừng gắn hash tham số | SR4 | Hai bản dựng nhỏ, cùng bộ tám test SR; đếm thành phần phải chạy | Một bản qua toàn bộ SR1-SR8 với ít thành phần hơn | `[chờ điền]` |
| S2 | Nội dung payload duyệt, gồm dạng dữ liệu đem hash và tiền điều kiện bản ghi | SR4 | 20 biến thể serialize tương đương; sửa tham số sau duyệt; đổi trạng thái bản ghi giữa duyệt và ghi | 20 biến thể cho đúng một hash, và hai nhánh sau bị chặn 100 trên 100 | `[chờ điền]` |
| S3 | Đường vòng ngoài cổng ghi | SR1 | Client thứ hai gọi thẳng endpoint ghi; agent thứ hai không có quyền dùng chung connector; tool mới chưa có luật policy | Cả ba bị từ chối, mỗi lần có một dòng trace đọc được | `[chờ điền]` |

### 4.4. Điều gì làm lật quyết định

Luật: chỉ ghi những điều có phép thử nằm trong ba mục S1 đến S3, cộng điều kiện sàn ở mục 3.5.
Không mở thêm giả thuyết mới ở bước 04, vì đó là việc của bước 03.

| Nếu kết quả này | Quyết định đổi thành |
| --- | --- |
| S1 cho thấy cổng đặt trong vòng lặp agent vẫn qua toàn bộ SR1-SR8 | `[chờ điền]` |
| S1 cho thấy không bản dựng nào qua SR4 | `[chờ điền]` |
| S2 cho thấy phải thêm tiền điều kiện vào payload duyệt | `[chờ điền]` |
| S3 cho thấy có đường vòng ghi được | `[chờ điền]` |
| M2 khác 0 bản ghi trùng hoặc 0 bản ghi mất | `[chờ điền]` |
| M1 p95 vượt ngưỡng sàn đã chốt | `[chờ điền]` |

## 5. Vì sao không chọn bốn phương án còn lại

Luật: mỗi mục có đúng ba phần, cùng thứ tự.
Phần 1 nói năng lực nào thiếu, neo vào một mục của file 09 hoặc file 07.
Phần 2 nói phương án đó còn được giữ ở tầng nào, nếu có.
Phần 3 nói điều gì làm nó sống lại.
Cấm viết "không phù hợp" mà không nêu cơ chế.

### 5.1. API / Function Calling

1. Năng lực thiếu: `[chờ điền]`
2. Còn được giữ ở tầng: `[chờ điền]`
3. Sống lại khi: `[chờ điền]`

### 5.2. MCP

1. Năng lực thiếu: `[chờ điền]`
2. Còn được giữ ở tầng: `[chờ điền]`
3. Sống lại khi: `[chờ điền]`

### 5.3. Workflow Engine

1. Năng lực thiếu: `[chờ điền]`
2. Còn được giữ ở tầng: `[chờ điền]`
3. Sống lại khi: `[chờ điền]`

### 5.4. Agent Orchestration

1. Năng lực thiếu: `[chờ điền]`
2. Còn được giữ ở tầng: `[chờ điền]`
3. Sống lại khi: `[chờ điền]`

### 5.5. Event-driven Integration

1. Năng lực thiếu: `[chờ điền]`
2. Còn được giữ ở tầng: `[chờ điền]`
3. Sống lại khi: `[chờ điền]`

### 5.6. Bảng tổng

| Phương pháp | Vai | Neo | Trigger sống lại |
| --- | --- | --- | --- |
| API / Function Calling | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| MCP | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| Workflow Engine | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| Agent Orchestration | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| Event-driven | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |

## 6. Sơ đồ giải pháp

Luật: ba hình, mỗi hình một câu hỏi.
Hình không có chú thích thì không tính là bằng chứng.
Mã liên kết `L1` đến `L10` do file này định nghĩa, không lấy từ tài liệu khác, vì bản duy nhất từng đặt tên cho chúng đang ở trạng thái `Không hợp lệ`.

### 6.1. Hình 1, kiến trúc được chọn và biên kiểm soát

![Kiến trúc được chọn](assets/12-kien-truc-duoc-chon.svg)

Câu hỏi của hình: quyết định nào do ai sở hữu, và biên "hệ đích không tin được" nằm ở đâu.
Chú thích phải có: vị trí hash, hạn dùng, khoá idempotency, ba danh tính, chỗ ghi trace.

`[chờ điền: 5 đến 8 dòng giải thích]`

### 6.2. Hình 2, hai nhánh A và B

![Hai nhánh tích hợp](assets/12-hai-nhanh-tich-hop.svg)

Câu hỏi của hình: hai nhánh khác nhau đúng biến nào, và biến đó có chạm vào quyết định ghi không.
Chú thích phải nói rõ phần nào dùng chung, phần nào khác.

`[chờ điền: 5 đến 8 dòng giải thích]`

### 6.3. Hình 3, trình tự một lần ghi có duyệt

![Trình tự một lần ghi](assets/12-trinh-tu-mot-lan-ghi.svg)

Câu hỏi của hình: cái gì được kiểm lại sau khi duyệt, và cái gì xảy ra khi phản hồi bị cắt.
Chú thích phải có nhánh retry và nhánh từ chối.

`[chờ điền: 5 đến 8 dòng giải thích]`

### 6.4. Bảng mười liên kết

| Mã | Từ | Tới | Ai sở hữu hợp đồng | Hợp đồng gồm gì | Test |
| --- | --- | --- | --- | --- | --- |
| L1 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L1` |
| L2 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L2` |
| L3 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L3` |
| L4 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L4` |
| L5 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L5` |
| L6 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L6` |
| L7 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L7` |
| L8 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L8` |
| L9 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L9` |
| L10 | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `T-L10` |

## 7. Phạm vi MVP

Luật: mỗi dòng trong MVP phải trỏ được về một mã test hoặc một mã SR.
Dòng nào không trỏ được thì cắt khỏi MVP, không để lại với ý "làm nếu còn thời gian".

### 7.1. Ranh giới trong và ngoài

| Trong MVP v0.1 | Mã test | Ngoài MVP | Vì sao loại |
| --- | --- | --- | --- |
| `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |

### 7.2. Hai hệ giả lập và danh mục tool

| Hệ | Tool | Đọc hay ghi | Mức rủi ro | Trường trả về | Có tôn trọng khoá chống trùng |
| --- | --- | --- | --- | --- | --- |
| Danh bạ | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |
| Công việc | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |

Ghi chú bắt buộc: theo SR6 của bước 0, một trong hai hệ phải cố tình không tôn trọng khoá, vì SR6 chỉ đúng khi hệ đích tôn trọng khoá và lab viết cả hai hệ.
Không có hệ đó thì test SR6 chỉ đạt một cách giả tạo.

### 7.3. Ba hồ sơ quyền

| Hồ sơ | Đọc được | Ghi được | Duyệt được | Dùng cho test nào |
| --- | --- | --- | --- | --- |
| `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |

### 7.4. Dữ liệu mẫu và dữ liệu cấm

- Dữ liệu mẫu: `[chờ điền: số bản ghi, trường, không có dữ liệu thật]`
- Dữ liệu cấm: theo `AGENTS.md` mục 5, không dùng dữ liệu thật, không credential thật, không dữ liệu khách hàng.

### 7.5. Màn hình duyệt tối thiểu

| Trường phải hiện | Vì sao | Neo |
| --- | --- | --- |
| Ai yêu cầu | `[chờ điền]` | U2 |
| Đổi gì, trên bản ghi nào | `[chờ điền]` | U2, SR3 |
| Vì sao | `[chờ điền]` | U2 |
| Hạn của quyết định duyệt | `[chờ điền]` | SR4 |
| Nút duyệt và nút từ chối | `[chờ điền]` | SR4 |

### 7.6. Trace tối thiểu

| Trường | Kiểu | Bắt buộc | Trả lời câu nào của U4 |
| --- | --- | --- | --- |
| `[chờ điền]` | `[chờ điền]` | `[chờ điền]` | `[chờ điền]` |

Điều kiện: năm câu của U4 phải trả lời được chỉ bằng một trace, không mở nguồn thứ hai.

### 7.7. Bộ test

| Nhóm | Mã | Số test | Chạy ở đâu | Đo cái gì |
| --- | --- | --- | --- | --- |
| Tám ràng buộc | `T-SR1` đến `T-SR8` | 8 | `[chờ điền]` | Đúng hoặc sai |
| Mười liên kết | `T-L1` đến `T-L10` | `[chờ điền]` | `[chờ điền]` | Hợp đồng giữa hai thành phần |
| Sáu đại lượng | `T-M1` đến `T-M6` | 6 | `[chờ điền]` | Số đo, chỉ chạy ở bước 06 |

### 7.8. Ánh xạ tiêu chí nghiệm thu của đề bài

| Tiêu chí nghiệm thu | Mã test | Trạng thái |
| --- | --- | --- |
| Bảng so sánh ít nhất ba mô hình kiến trúc trước khi chốt | Mục 3, mục 5 | `[chờ điền]` |
| Kiểm thử phân quyền | `T-SR1`, `T-SR2`, `T-SR3`, `T-SR5` | `[chờ điền]` |
| Kiểm thử thao tác ghi | `T-SR4`, `T-SR6` | `[chờ điền]` |
| Kiểm thử lỗi và chạy lại | `T-SR6`, `T-M2` | `[chờ điền]` |
| Agent thứ hai tái sử dụng công cụ | `T-SR8`, `T-L10` | `[chờ điền]` |
| Số liệu thời gian, độ ổn định, chi phí | `T-M1`, `T-M2`, `T-M3` | Hoãn sang bước 06 |
| Kết luận khi nào không nên dùng MCP | Mục 5.2 | `[chờ điền]` |

### 7.9. Thứ tự build bàn giao cho bước 05

| # | Việc | Xong khi | Trả lời mục nào |
| --- | --- | --- | --- |
| 1 | `[chờ điền]` | `[chờ điền]` | S1 |
| 2 | `[chờ điền]` | `[chờ điền]` | S2 |
| 3 | `[chờ điền]` | `[chờ điền]` | S3 |
| 4 | `[chờ điền]` | `[chờ điền]` | SR3 |
| 5 | `[chờ điền]` | `[chờ điền]` | SR6 |
| 6 | `[chờ điền]` | `[chờ điền]` | SR7 |

## 8. Những gì file này cố ý không làm

| Không làm | Vì sao |
| --- | --- |
| Ghi số đo hoặc baseline | Bước 06 mới đo, và số chưa đo không được xuất hiện ở bước 04 |
| Viết chữ `Accepted` cho ADR | Ba quyết định S1 đến S3 chưa có log, xem mục 0.2 |
| Kế thừa Q1-Q7, N1-N10, G1-G10 của file 11 | File 11 bị kết luận `Không hợp lệ` ngày 2026-11-13 |
| Viết lại bước 03 | Bước 03 thuộc người sở hữu; file này chỉ nêu cách đi tiếp ở mục 1.4 |
| Chọn model, ngôn ngữ, nhà cung cấp hạ tầng | Ngoài phạm vi Track 01 |
| Mở rộng MVP sang đa tổ chức | Ngoài phạm vi MVP, chưa có nguồn nào yêu cầu |
| Sửa file 07, 08, 09 | Không sửa file chưa review từ trong file này |

## 9. Giới hạn của file này

- `[chờ điền: 4 đến 6 dòng, nêu cái gì chưa kiểm, nghi ngờ nào còn mở]`
- Bảng chấm ở mục 3 có thể còn ô `chưa chấm` sau khi hoàn thành, và đó là trạng thái hợp lệ.
- Ba hình ở mục 6 là bản vẽ của người viết, chưa được kiểm bằng lần chạy nào.
- File này không thay bước 03. Nếu đi theo cách A ở mục 1.4 thì mục 4.3 sẽ lấy câu hỏi từ bản thay thế, không giữ số hiệu S1 đến S3.

## 10. Việc tiếp theo

| Thứ tự | Việc | Xong khi | Chặn ai |
| --- | --- | --- | --- |
| 1 | Chốt cách đi tiếp ở mục 1.4 | Có ngày, có người chấp thuận | Toàn bộ mục 4 |
| 2 | Chạy ba script kiểm nguồn, điền mục 1.2 | Có ba dòng kết quả kèm ngày | Mục 3 |
| 3 | Chốt sáu chỗ vênh ở mục 1.3 | Không còn ô trống ở cột câu chốt | Mục 3 |
| 4 | Điền bảng chấm mục 3.3 | Không ô nào bị quy thành 0 | Mục 4 |
| 5 | Viết mục 4 và mục 5 | Mỗi mục một câu quyết định, có neo | ADR-0001 |
| 6 | Vẽ ba hình mục 6 | Ba tệp SVG mở được trên A4 | Review |
| 7 | Chốt phạm vi mục 7 | Mọi dòng có mã test | Bước 05 |
| 8 | Review với Kevin | Có ý kiến ghi nguyên văn và ngày | Bước 05 |

## Nhật ký revision

| Ngày | Người | Thay đổi | Trạng thái |
| --- | --- | --- | --- |
| 2026-11-13 | Agent (Pi) | Dựng khung rỗng: mục lục, bảng, cổng, quy tắc. Không kế thừa file 11 vì file đó bị kết luận `Không hợp lệ`; câu hỏi chặn, liên kết và điều kiện lật định nghĩa lại tại chỗ. Không có quyết định, không có số | Chưa review |
