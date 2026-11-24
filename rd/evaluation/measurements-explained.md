# Các phép đo của Lab: là gì, chạy thế nào, ra kết quả gì

Ngày: 2026-11-22. Trạng thái: giải thích các phép đo đã chạy ngày 2026-11-20; chi phí (M3) và công sức dùng lại (M6) chưa có phép đo riêng.

## Đọc nhanh

- Lab dựng một cổng kiểm soát đứng giữa AI và hai hệ thống giả, rồi cho máy tự gọi cổng hàng chục nghìn lần, có cố ý gây lỗi, để xem cổng có làm đúng không.
- Năm phép đo đã chạy: tốc độ, độ ổn định khi mạng lỗi, sập giữa lúc chuyển 30 task, chịu tải đông người, và độ phức tạp khi vận hành.
- Mọi lần chạy đều cho kết quả cuối đúng, không task nào bị ghi hai lần, không task nào bị sót, không dữ liệu cá nhân nào lọt vào nhật ký.
- Một mục tiêu không đạt: khi mười người gọi cùng lúc, cổng chậm đi bốn lần thay vì tối đa hai lần, dù vẫn nhanh hơn nhiều so với mức cho phép.
- Việc tiếp theo là đo chi phí AI và công sức nối thêm một trợ lý thứ hai, khi có trợ lý dùng mô hình AI thật.

## 1. Bối cảnh trong một phút

Lab là một bản thử nhỏ để trả lời câu hỏi: AI có thể đọc và sửa dữ liệu công ty một cách an toàn không.

Bản thử có bốn phần chạy trên một máy:

| Phần | Việc | Ví dụ đời thường |
| --- | --- | --- |
| Cổng kiểm soát (gateway) | Cửa duy nhất mọi lệnh đọc và ghi phải đi qua; kiểm quyền, ghi vết | Quầy lễ tân kiểm thẻ trước khi cho vào |
| Danh bạ giả (fake directory) | 20 nhân viên giả, có vai và phòng ban | Sổ nhân sự |
| Danh sách task giả (fake tasks) | 100 task giả, mỗi task có người phụ trách và trạng thái | Bảng giao việc |
| Trang điều khiển (console) | Trang cho người vận hành xem vết và luật | Màn hình của bảo vệ |

Các nhân vật giả dùng trong phép đo: chị Hoa (nhân viên), chị Lan (nghỉ ốm, có 30 task), anh Minh (nhận task), anh Quang (trưởng nhóm, người duyệt), chị Nhung (nhân sự), Nam (người không có quyền).

Một lần sửa dữ liệu đi qua năm bước:

1. AI gọi cổng để soạn đề xuất (proposal), ví dụ "chuyển T-12 sang anh Minh".
2. Cổng kiểm luật quyền và trả về một trang xác nhận.
3. Người yêu cầu bấm Gửi trên trang đó; AI không bấm thay được.
4. Nếu lệnh lớn, ví dụ 30 task, trưởng nhóm phải duyệt trước.
5. Lệnh vào hàng đợi ghi (outbox): một bảng lưu từng lệnh cần ghi; một vòng chạy nền gửi lần lượt từng lệnh sang danh sách task.

Bước 5 là chỗ dễ hỏng nhất: mạng có thể rớt, cổng có thể sập, phản hồi có thể mất.
Để gửi lại mà không ghi hai lần, mỗi lệnh mang một mã chống ghi trùng (idempotency key): gửi lại cùng mã thì danh sách task trả kết quả cũ, không làm thêm lần nữa.

**Kết luận:** các phép đo dưới đây kiểm chính chuỗi năm bước này, đặc biệt là bước 5 khi có sự cố.

## 2. Phép thử và phép đo khác nhau thế nào

Lab kiểm bản thử theo ba lớp.

| Lớp                       | Là gì                                                                                    | Lệnh                    | Trả lời câu hỏi                             |
| ------------------------- | ---------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
| Phép thử tự động (test)   | Mỗi phép thử chạy một tình huống một lần, so với đáp án biết trước, rồi báo đạt hay hỏng | `npm test`              | "Có chạy đúng không?"                       |
| Phép đo (measurement)     | Lặp cùng tình huống hàng trăm hay hàng nghìn lần, ghi lại số đo và số lần đúng           | `npm run measure`       | "Đúng bao nhiêu lần, nhanh cỡ nào, tốn gì?" |
| Nghiệm thu trong Thổ Thần | Người thật gõ yêu cầu trong Thổ Thần desktop, chụp màn hình, ghi mã vết                  | Chạy tay, theo kịch bản | "Có chạy trong phần mềm thật không?"        |

Ví dụ phân biệt: phép thử hỏi "tắt cổng giữa task 17 thì có đủ 30 task không" và chạy một lần.
Phép đo hỏi cùng câu đó nhưng chạy 100 lần, vì một lỗi hiếm có thể chỉ xuất hiện 1 lần trong 50.

Bộ phép thử tự động có 420 phép thử, đạt cả 420 ngày 2026-11-19 ([spec, mục 2.1](../design/mvp-spec.md#21-q1-lệnh-ghi-hàng-loạt-có-cần-workflow-engine-không)).
Ba phiên nghiệm thu trong Thổ Thần nằm ở [mốc 1](milestone-1-tho-than.md), [mốc 2](milestone-2-tho-than.md) và [mốc 3](milestone-3-tho-than.md).
Tài liệu này chỉ nói về lớp thứ hai, phép đo.

**Kết luận:** phép thử cho biết có lỗi hay không; phép đo cho biết lỗi hiếm tới đâu và hệ thống chạy ra sao khi lặp lại nhiều lần.

## 3. Khái niệm cần biết trước khi đọc số

### 3.1. Ba cửa vào

Cổng nhận lời gọi qua ba cửa vào (door).
Phép đo gọi qua cả ba để chắc rằng mọi cửa cho cùng kết quả.

| Cửa | Là gì |
| --- | --- |
| `http` | API thường: gửi một yêu cầu web tới cổng, như một trang web gọi máy chủ |
| `mcp-http` | MCP (Model Context Protocol): chuẩn chung để phần mềm AI gọi công cụ; cổng nói chuẩn này qua mạng |
| `tho-than-host` | Một chương trình giả làm máy chủ Thổ Thần: mở phiên MCP như Thổ Thần, gửi thêm thông tin danh tính, và bỏ cuộc sau 60 giây như Thổ Thần thật |

Cửa `tho-than-host` giúp Lab thử hành vi của Thổ Thần hàng trăm lần mà không tốn credit.

### 3.2. Hai loại thời gian

| Tên trong file | Đo từ đâu tới đâu | Ví dụ đời thường |
| --- | --- | --- |
| `gateway_duration_ms` | Thời gian cổng tự xử lý một lời gọi, lấy từ nhật ký của cổng | Thời gian nhân viên quầy xử lý hồ sơ |
| `client_ms` | Thời gian bên gọi chờ, tính cả đường mạng và các bước bên ngoài cổng | Thời gian từ lúc nộp hồ sơ tới lúc cầm kết quả trên tay |

Riêng phép đo M2 và Q1, `client_ms` tính trọn một lần chạy: dựng hệ thống mới, chạy tình huống, chờ ghi xong, rồi dọn dẹp.
Vì vậy con số đó là độ dài một lần thử nghiệm, không phải thời gian người dùng phải chờ.

Cổng ghi thời gian làm tròn tới mili giây (ms), nên 0 ms nghĩa là "dưới 1 ms", không phải "không tốn thời gian".

### 3.3. p50, p95, lớn nhất

Khi chạy 100 lần, thời gian mỗi lần một khác.
Lab không dùng trung bình vì vài lần rất chậm có thể kéo trung bình lên và che mất bức tranh thật.

- p50: sắp 100 lần từ nhanh tới chậm, lấy lần thứ 50. Một nửa số lần nhanh hơn con số này.
- p95: lấy lần thứ 95. Chỉ 5 lần trong 100 chậm hơn con số này; đây là trải nghiệm của người "kém may".
- Lớn nhất (max): lần chậm nhất.

Ví dụ: p50 là 3 ms và p95 là 7 ms nghĩa là đa số lời gọi xong trong 3 ms, và 95% xong trong 7 ms.

### 3.4. Gây lỗi cố ý

Lỗi thật hiếm và không chọn được lúc xảy ra, nên Lab tự gây lỗi đúng lúc cần (fault injection).
Danh sách task giả có một lối điều khiển riêng cho phép đo, nhận các lệnh như:

- Giữ một task lại vài giây trước khi ghi, để cổng có thể bị tắt đúng lúc đó.
- Giữ một task lại sau khi đã ghi nhưng trước khi trả lời, để tạo trường hợp "đã ghi mà cổng chưa biết".
- Ghi xong rồi cố ý không trả lời, như phản hồi bị rơi trên mạng.

Ngoài ra phép đo có thể tắt hẳn tiến trình cổng hoặc danh sách task, không cho đóng gọn gàng, giống mất điện.

Mỗi lần gây lỗi, phép đo còn kiểm xem lỗi có thật sự xảy ra đúng chỗ không (`point_missed`).
Nếu lỗi không chạm, lần chạy đó bị tính là hỏng, để không ai tưởng đã thử một tình huống mà thật ra chưa thử.

### 3.5. Năm bộ đếm an toàn

Mỗi file kết quả mang năm con số phải bằng 0, đã chốt trong [spec, mục 7.5](../design/mvp-spec.md#75-năm-con-số-phải-bằng-0):

| Bộ đếm | Nghĩa | Kiểm thế nào |
| --- | --- | --- |
| Ghi trùng (`duplicate_writes`) | Một task bị ghi nhiều hơn một lần | Đếm số lần ghi thật của từng task trong danh sách task giả |
| Lệnh mất (`lost_commands`) | Một task lẽ ra phải ghi mà không được ghi | Đếm task không có lần ghi nào sau khi đề xuất xong |
| Ghi vượt quyền (`unauthorized_writes`) | Ghi trước khi người yêu cầu bấm Gửi hoặc trước khi trưởng nhóm duyệt | So thời điểm ghi với thời điểm bấm Gửi và duyệt |
| Trường ngoài quyền (`out_of_scope_fields`) | Người không có quyền thấy số điện thoại cá nhân hay địa chỉ nhà | Quét mọi câu trả lời cổng gửi cho người vai nhân viên |
| Dữ liệu cá nhân trong vết (`personal_data_in_trace`) | Nhật ký của cổng chứa tên, email, số điện thoại, địa chỉ hay khoá | Quét từng dòng vết |

Khi một phép đo không chạm tới hành vi nào đó, bộ đếm ghi "không áp dụng" (`applicable: false`, `value: null`).
Ví dụ M1 không bấm Gửi, nên không có lệnh ghi nào để đếm ghi trùng.
"Không áp dụng" là lời khai rõ ràng, khác với "đã kiểm và bằng 0".

**Kết luận:** đọc một kết quả đo cần nhìn ba thứ: số lần đúng kết quả cuối, năm bộ đếm an toàn, và loại thời gian đang được báo.

## 4. Lệnh đo chạy thế nào

Mọi phép đo chạy bằng cùng một lệnh trong thư mục `lab/`:

```sh
cd lab
npm run measure -- <tên phép đo> --runs 100
```

Mỗi lần, lệnh đo làm bảy việc:

1. Dựng lại mã nguồn, để số đo luôn ứng với mã mới nhất.
2. Dựng một bộ dịch vụ riêng trên cổng mạng còn trống và một thư mục dữ liệu tạm.
   Phép đo không bao giờ đụng vào dữ liệu `lab/.data` của người đang dùng Lab.
3. Cấp khoá giả cho các nhân vật.
4. Chạy tình huống đủ số lần, có gây lỗi theo lịch đã định.
5. Đọc bảng vết và bảng lệnh ghi, tính năm bộ đếm an toàn.
6. Ghi hai file kết quả.
7. Tắt dịch vụ và xoá thư mục tạm.

Với M2 và Q1, bước 2 lặp lại ở mọi lần chạy: mỗi lần chạy có hệ thống mới tinh, nên lần trước không làm bẩn lần sau.

### 4.1. Hai file kết quả

Kết quả nằm trong `rd/evaluation/results/`, tên file theo mẫu `<ngày>-<phép đo>-<đích>-<commit>.json`.

| File | Nội dung |
| --- | --- |
| `.json` | Bản tóm tắt: lệnh đã chạy, máy đo, commit, p50, p95, năm bộ đếm, ghi chú |
| `.samples.ndjson.gz` | Toàn bộ số đo thô, mỗi dòng một lần gọi, nén lại |

Bản tóm tắt ghi mã băm SHA-256 của file thô.
Ai tải về cũng kiểm được file thô không bị sửa, và tự tính lại p50, p95 từ đó.

Bản tóm tắt cũng ghi máy đo: tất cả số trong tài liệu này đo trên cùng một laptop Windows 11, CPU Intel Core Ultra 5 225H 14 nhân, RAM 32 GB, Node 22.21.0, mã nguồn không có thay đổi chưa commit (`dirty: false`).

### 4.2. Ba luật để số đo không bị "chỉnh"

- Lệnh đo không ghi đè file cũ, trừ khi người chạy thêm `--force`.
- Nếu một bộ đếm an toàn khác 0, lệnh vẫn ghi file rồi báo hỏng, để lần đo xấu không bị giấu bằng cách chạy lại.
- Mục tiêu của từng chỉ số được chốt trong spec trước khi đo, để kết quả không kéo mục tiêu theo.

**Kết luận:** mỗi con số trong tài liệu này trỏ về một file có commit, máy đo và lệnh chạy lại được.

## 5. M1: cổng xử lý một lời gọi mất bao lâu

**Câu hỏi.**
Khi AI gọi một công cụ, cổng kiểm soát cộng thêm bao nhiêu thời gian?
Mục tiêu đặt trước: p95 không quá 50 ms.

**Cách làm.**
Phép đo gọi sáu công cụ qua ba cửa vào, mỗi cặp công cụ và cửa 100 lần, tổng cộng 1.800 lời gọi.

| Công cụ | Ai gọi | Gọi gì |
| --- | --- | --- |
| `find_employee` | Chị Hoa | Tìm "Minh" |
| `get_task` | Chị Hoa | Xem T-12 |
| `list_tasks` | Chị Hoa | Task đang làm của chị Lan |
| `get_request_status` | Chị Hoa | Trạng thái một đề xuất |
| `propose_task_change` | Chị Hoa | Đề xuất đánh dấu T-12 xong |
| `propose_employee_change` | Chị Nhung | Đề xuất đổi email công việc của anh Minh |

Phép đo chỉ soạn đề xuất, không bấm Gửi, nên không có gì bị ghi thật.
Hai vòng đầu là vòng khởi động, không tính, vì lần chạy đầu của chương trình luôn chậm hơn bình thường.
Thứ tự ba cửa được xoay vòng, để không cửa nào luôn đứng ngay sau một lệnh nặng.

**Kết quả** ([file](results/2026-11-20-m1-gateway-f4dbfe7.json), chạy 11,2 giây):

| Cửa | Cổng xử lý p50 | Cổng xử lý p95 | Bên gọi chờ p50 | Bên gọi chờ p95 |
| --- | --- | --- | --- | --- |
| `http` | 3 ms | 7 ms | 3,9 ms | 7,9 ms |
| `mcp-http` | 3 ms | 7 ms | 4,8 ms | 8,9 ms |
| `tho-than-host` | 3 ms | 7 ms | 6,4 ms | 10,5 ms |
| Cả ba | 3 ms | 7 ms | 5,1 ms | 9,5 ms |

Công cụ nặng nhất là `propose_task_change` (cổng p95 8 ms), vì nó kiểm luật, đếm số đề xuất gần đây và lưu đề xuất.
Công cụ nhẹ nhất là `get_request_status` (cổng p95 2 ms).

Năm bộ đếm: ghi vượt quyền 0, trường ngoài quyền 0, dữ liệu cá nhân trong vết 0; ghi trùng và lệnh mất không áp dụng.

**Đọc số thế nào.**
Cột "cổng xử lý" giống nhau ở cả ba cửa: cổng làm cùng một việc, bất kể lời gọi đến từ đâu.
Cột "bên gọi chờ" khác nhau vì mỗi cửa tốn thêm phần bọc riêng: MCP thêm khoảng 1 ms, phiên giả Thổ Thần thêm khoảng 2 ms.
Một câu trả lời của AI thường mất vài giây, nên 7 ms của cổng là phần rất nhỏ.

Một chi tiết dễ hiểu lầm: khi tổng số task trong các đề xuất cùng loại của một người chạm ngưỡng 5 trong 60 phút, `propose_task_change` trả `NEEDS_APPROVAL` (cần duyệt).
Đó là luật chặn việc chia nhỏ để né duyệt đang hoạt động đúng, và vẫn được tính là một lần gọi thành công.

**Kết luận:** cổng cộng thêm 7 ms ở p95, đạt mục tiêu 50 ms với khoảng cách lớn; ba cửa vào cho cùng thời gian xử lý ở cổng.

## 6. M2: mạng lỗi thì kết quả cuối có còn đúng không

**Câu hỏi.**
Khi mạng rớt, phản hồi bị mất hay danh sách task ngừng trả lời một lúc, bên gọi gửi lại; cuối cùng dữ liệu có đúng không, có bị ghi hai lần không?
Mục tiêu đặt trước: ít nhất 99/100 lần đúng kết quả cuối mỗi nhóm, 0 ghi trùng, 0 lệnh mất.

**Cách làm.**
Hai kịch bản, chạy qua ba cửa vào, mỗi cặp 100 lần, tổng cộng 600 lần chạy:

- Kịch bản A: chị Hoa chuyển T-12 sang anh Minh, một task, không cần duyệt.
- Kịch bản C: chị Hoa chuyển 30 task của chị Lan (T-5 tới T-34) sang anh Minh; anh Quang duyệt.

Mỗi lần chạy đi đủ chuỗi: soạn đề xuất, bấm Gửi, duyệt nếu cần, chờ hàng đợi ghi xong, rồi kiểm dữ liệu.
Trong 100 lần của mỗi nhóm, lỗi được gây theo lịch cố định:

| Lần | Lỗi cố ý | Mô phỏng chuyện gì |
| --- | --- | --- |
| 1-10 và 12-15 | Lời gọi soạn đề xuất tới một máy đóng kết nối ngay; bên gọi gửi lại | Mạng rớt lúc AI gọi cổng |
| 11 | Ở cửa `tho-than-host`: gọi tới một máy im lặng; Thổ Thần giả chờ đủ 60 giây, bỏ cuộc, rồi gửi lại. Ở hai cửa kia: như lần 1-10 | Thổ Thần cắt lời gọi sau 60 giây |
| 16-25 | Danh sách task ghi xong nhưng không trả lời | Phản hồi bị rơi trên đường về |
| 26-30 | Danh sách task ngừng trả lời 2 giây giữa chừng | Hệ thống đích bận hoặc khởi động lại |
| 31-100 | Không có lỗi | Ngày bình thường |

"Đúng kết quả cuối" nghĩa là: mọi task trong đề xuất đều về anh Minh, mỗi task được ghi đúng một lần, và số phiên bản của task tăng đúng 1.

**Kết quả** ([file](results/2026-11-20-m2-scenarios-gateway-7b7ae94.json), chạy 18 phút):

| Kịch bản | Cửa | Đúng kết quả cuối | Ghi trùng | Lệnh mất |
| --- | --- | --- | --- | --- |
| A, 1 task | `http` | 100/100 | 0 | 0 |
| A, 1 task | `mcp-http` | 100/100 | 0 | 0 |
| A, 1 task | `tho-than-host` | 100/100 | 0 | 0 |
| C, 30 task | `http` | 100/100 | 0 | 0 |
| C, 30 task | `mcp-http` | 100/100 | 0 | 0 |
| C, 30 task | `tho-than-host` | 100/100 | 0 | 0 |
| Tổng | | 600/600 | 0 | 0 |

Trong 600 lần đó, phép đo đã gây 90 lỗi mạng và 2 lần hết giờ 60 giây, và bên gọi đã gửi lại tổng cộng 210 lần.
Không lần gây lỗi nào trượt chỗ.
Phép đo quét 13.688 dòng vết: 0 dòng chứa dữ liệu cá nhân hay khoá; 0 lần ghi trước khi bấm Gửi hoặc trước khi duyệt.

Một lần chạy trọn vẹn mất khoảng 1,1 giây với kịch bản A và 1,4 giây với kịch bản C ở p50.
Phần lớn thời gian đó là dựng và dọn hệ thống, cộng chờ vòng chạy nền của hàng đợi ghi, vòng này thức dậy mỗi giây.
Lần chậm nhất, 61 giây, là lần hết giờ: Thổ Thần giả chờ đủ 60 giây trước khi gửi lại.

**Kết luận:** 600/600 lần đúng, 0 ghi trùng, 0 lệnh mất, đạt mục tiêu; gửi lại 210 lần không tạo ra lần ghi thừa nào, nhờ mã chống ghi trùng.

## 7. Q1: cổng sập giữa lúc chuyển 30 task thì sao

**Câu hỏi.**
Đây là câu hỏi nghiên cứu Q1 trong [spec, mục 2.1](../design/mvp-spec.md#21-q1-lệnh-ghi-hàng-loạt-có-cần-workflow-engine-không).
Chị Lan nghỉ ốm; chị Hoa nhờ AI chuyển 30 task của chị Lan sang anh Minh; anh Quang duyệt.
Cổng đang ghi dở thì sập.
Hàng đợi ghi do Lab tự viết có làm đủ 30 task mà không task nào bị ghi hai lần không?
Và nó có đơn giản hơn việc dùng một workflow engine không?

Workflow engine là loại phần mềm chuyên nhớ từng bước của một quy trình đã xong hay chưa, để chạy tiếp sau khi sập.
Lab chọn Temporal, một workflow engine mã nguồn mở phổ biến, làm bản đối chứng (baseline): cùng 30 task, cùng mã chống ghi trùng, chỉ khác phần nhớ tiến độ.
Không có bản đối chứng thì câu "dùng engine sẽ tốt hơn hay không" chỉ là đoán.

**Cách làm.**
Ba bước, mỗi bước 100 lần, chạy trên cả hai bản:

| Bước | Làm gì | Vì sao khó |
| --- | --- | --- |
| 1. Tắt ngang | Tắt hẳn cổng (với Temporal: tắt worker, phần chạy từng bước) ở một trong ba thời điểm, rồi bật lại trên cùng dữ liệu | Xem bên dưới |
| 2. Hệ thống đích ngừng | Danh sách task ngừng trả lời 20 giây ở giữa chừng, cổng không được khởi động lại | Cổng phải tự kiên nhẫn gửi lại, không cần người can thiệp |
| 3. Rơi phản hồi | Danh sách task ghi xong task đầu nhưng không trả lời | Cổng tưởng chưa ghi và gửi lại; lần gửi lại phải nhận kết quả cũ, không ghi thêm |

100 lần của bước 1 chia đều cho ba thời điểm tắt:

- Trước task đầu (34 lần): danh sách task giữ task 1 lại 5 giây chưa ghi, cổng bị tắt trong lúc đó.
- Giữa task 17 (33 lần): danh sách task đã ghi task 17 nhưng giữ câu trả lời lại; cổng bị tắt trước khi kịp đánh dấu "xong".
  Đây là tình huống khó nhất: task 17 đã ghi mà cổng không biết, nên khi bật lại cổng sẽ gửi lại task 17.
- Sau task 30 (33 lần): task cuối đã ghi, cổng bị tắt trước khi kịp đánh dấu.

Tắt ở đây là tắt cưỡng bức, không cho cổng dọn dẹp gì, giống rút điện.

**Kết quả** ([bản tự viết](results/2026-11-20-q1-outbox-gateway-7b7ae94.json), [bản Temporal](results/2026-11-20-q1-outbox-temporal-87d50f9.json)):

| Bước | Bản tự viết | Bản Temporal |
| --- | --- | --- |
| 1. Tắt ngang, trước task đầu | 34/34 | 34/34 |
| 1. Tắt ngang, giữa task 17 | 33/33 | 33/33 |
| 1. Tắt ngang, sau task 30 | 33/33 | 33/33 |
| 2. Hệ thống đích ngừng 20 giây | 100/100, không khởi động lại cổng | 100/100, không khởi động lại |
| 3. Rơi phản hồi | 100/100 | 100/100 |
| Tổng đúng kết quả cuối | 300/300 | 300/300 |
| Ghi trùng / lệnh mất / ghi vượt quyền | 0 / 0 / 0 | 0 / 0 / 0 |
| Dòng vết đã quét, chứa dữ liệu cá nhân | 23.153 dòng, 0 | 26.806 dòng, 0 |

Bản Temporal còn được thử thêm một biến thể: tắt cả máy chủ Temporal, không chỉ worker ([file](results/2026-11-20-q1-outbox-temporal-server-crash-aea48ad.json)).
Biến thể này chỉ chạy một lần mỗi bước và đạt 3/3, nên là bằng chứng yếu, chỉ cho biết cách làm này chạy được.

Thời gian một lần chạy không phải tiêu chí của Q1.
Bản tự viết mất khoảng 2 giây cho bước 1 và 33 giây cho bước 2, chủ yếu là 20 giây ngừng cố ý cộng thời gian chờ gửi lại.
Bản Temporal chậm hơn ở bước 1 (khoảng 12 tới 23 giây), một phần vì mỗi lần chạy phải dựng và tắt cả máy chủ Temporal.

**Kết luận:** cả hai bản đều 300/300, nên phần quyết định đúng sai là mã chống ghi trùng ở hệ thống đích, không phải việc nhớ tiến độ; Q1 vì vậy được trả lời bằng độ phức tạp ở M5.

## 8. M4: mười người gọi cùng lúc thì cổng chậm đi bao nhiêu

**Câu hỏi.**
Khi số người gọi tăng gấp 10, thời gian cổng xử lý tăng bao nhiêu lần?
Mục tiêu đặt trước: p95 của cổng tăng không quá 2 lần.

**Cách làm.**
Hai mức tải, mỗi mức 60 giây, qua cửa `http`:

- Gấp 1: một người gọi liên tục, gọi xong lời này mới gọi lời sau.
- Gấp 10: mười người gọi liên tục cùng lúc, mỗi người một khoá riêng.

Mỗi người gọi lặp một vòng 10 lời gọi: 3 lần tìm nhân viên, 3 lần liệt kê task, 3 lần xem task, 1 lần soạn đề xuất.
Tỉ lệ này mô phỏng thực tế: đọc nhiều, sửa ít.
Không đề xuất nào được bấm Gửi.

**Kết quả** ([file](results/2026-11-20-m4-load-6bd898d.json), chạy 2 phút):

| Mức | Số lời gọi trong 60 giây | Lời gọi mỗi giây | Lỗi | Cổng p50 | Cổng p95 | Bên gọi p95 |
| --- | --- | --- | --- | --- | --- | --- |
| Gấp 1 | 13.612 | 227 | 0 | 3 ms | 7 ms | 8,5 ms |
| Gấp 10 | 23.407 | 390 | 0 | 15 ms | 28 ms | 38,3 ms |
| Tỉ lệ gấp 10 / gấp 1 | | 1,7 lần | | | 4 lần | 4,5 lần |

Năm bộ đếm: 0 ghi vượt quyền; quét 10.405 câu trả lời tìm nhân viên của người vai nhân viên, 0 câu lộ số điện thoại cá nhân hay địa chỉ nhà; quét 37.027 dòng vết, 0 dòng chứa dữ liệu cá nhân.

**Đọc số thế nào.**
Mục tiêu "không quá 2 lần" không đạt: p95 của cổng tăng 4 lần, từ 7 ms lên 28 ms.
Số người gọi tăng 10 lần nhưng số lời gọi xử lý được mỗi giây chỉ tăng 1,7 lần.
Nghĩa là cổng, chạy trong một tiến trình trên một máy, đã gần hết sức; lời gọi phải xếp hàng chờ nhau, nên mỗi lời gọi lâu hơn.
Dù vậy 28 ms vẫn thấp hơn mức 50 ms của M1 gần một nửa, và không lời gọi nào lỗi trong hơn 37.000 lời gọi.

Mục tiêu này được đánh dấu "chỉ báo" từ trước, nên kết quả được ghi trung thực, không làm lệnh đo thất bại, và không bị sửa mục tiêu cho vừa số.

**Kết luận:** ở quy mô Lab, cổng chịu được mười người gọi liên tục mà không lỗi, nhưng chậm đi 4 lần; con số này không được suy rộng cho hàng trăm người dùng thật.

## 9. M5: vận hành mỗi cách phức tạp cỡ nào

**Câu hỏi.**
Q1 cho thấy cả hai cách đều đúng, nên câu hỏi còn lại là: cách nào ít việc cho người vận hành hơn?

**Cách làm.**
M5 là phép đếm, không phải phép chạy nhiều lần; một lần là đủ.
Phép đo đếm năm thứ:

| Đếm gì | Nghĩa |
| --- | --- |
| Dòng mã phần chạy tiếp | Số dòng mã chỉ dùng để nhớ tiến độ và chạy tiếp sau khi sập; không tính phần cổng hai bản dùng chung |
| Dịch vụ cần cho đường ghi | Số chương trình phải đang chạy thì lệnh ghi mới tới được danh sách task |
| File cấu hình | Số file người vận hành phải sửa để đổi hành vi lúc chạy |
| Bước cài trên máy mới | Số bước từ máy trống tới lúc chạy được |
| Bước sau khi sập | Số việc người vận hành phải làm để hệ thống chạy tiếp |

Mỗi con số trỏ về đúng dòng trong README nơi bước đó được viết, để ai cũng kiểm lại được.
Ngoài ra, phép đo đổi thật một ô luật, cho phép nhân viên chuyển task, từ "cho phép" sang "từ chối", rồi gọi cổng xem luật mới có được áp ngay không.

**Kết quả** ([bản tự viết](results/2026-11-20-m5-complexity-gateway-62e309e.json), [bản Temporal](results/2026-11-20-m5-complexity-temporal-87d50f9.json)):

| Đếm gì | Bản tự viết | Bản Temporal |
| --- | --- | --- |
| Dòng mã phần chạy tiếp | 2 file, 476 dòng mã | 4 file, 330 dòng mã |
| Dịch vụ cần cho đường ghi | 3: cổng, danh bạ, danh sách task | 5: thêm máy chủ Temporal và worker |
| File cấu hình | 1 (`rules.json`) | 1 (`rules.json`) |
| Bước cài trên máy mới | 4 | 4 |
| Bước sau khi sập | 1: chạy lại `npm start`, hàng đợi tự nhặt lệnh còn dở | 2: mở lại máy chủ Temporal nếu nó cũng tắt, rồi khởi động worker |
| Đổi một ô luật | Sửa 1 chỗ, cổng áp ngay | Sửa 1 chỗ, cổng áp ngay |

**Đọc số thế nào.**
Bản Temporal viết ít mã hơn khoảng 150 dòng, vì Temporal tự lo phần nhớ tiến độ và gửi lại.
Đổi lại, nó thêm hai chương trình phải chạy và theo dõi, và thêm một bước khi sập.
Với người vận hành, một chương trình thêm vào là thêm việc cài, nâng cấp, sao lưu và giám sát; dòng mã thì chỉ người viết phải đọc.

Bản Temporal được dựng trong nửa ngày, bằng máy chủ dành cho phát triển; Temporal chạy thật cần một cụm máy, nên độ phức tạp thật của nó còn cao hơn con số ở đây.

**Kết luận:** giữ hàng đợi ghi tự viết cho lệnh hàng loạt một bước như chuyển task; chỉ dùng workflow engine khi quy trình có nhiều bước nối nhau, chờ duyệt nhiều ngày, nhiều hệ thống, hoặc cần hoàn tác.

## 10. Hai chỉ số chưa đo

| Chỉ số | Vì sao chưa đo | Điều kiện để đo |
| --- | --- | --- |
| M3 (chi phí) | Năm phép đo trên gọi cổng trực tiếp, không qua mô hình AI, nên không tốn token. Cổng đã biết ghi chi phí mô hình vào vết, nhưng chưa có lượt chạy nào có mô hình để đo | Có trợ lý A và B dùng mô hình AI thật |
| M6 (công sức dùng lại) | Đo giờ công và số dòng mã khi nối thêm một trợ lý thứ hai, nên cần viết trợ lý đó trước | Trợ lý A (MCP) và B (gọi hàm) được viết, ghi giờ công ngay khi viết |

Cả hai thuộc câu hỏi nghiên cứu Q2 trong [spec, mục 2.2](../design/mvp-spec.md#22-q2-thêm-một-trợ-lý-thứ-hai-thì-mcp-tiết-kiệm-bao-nhiêu-công-so-với-gọi-hàm-và-phải-trả-giá-gì), và chờ khoá gọi mô hình AI.

**Kết luận:** bước tiếp theo là dựng trợ lý A và B, rồi chạy M1, M2, M3 cho lớp có mô hình và đếm M6.

## 11. Tổng hợp so với mục tiêu đã chốt trước

| Chỉ số | Mục tiêu | Kết quả | Đạt |
| --- | --- | --- | --- |
| M1 (thời gian) | Cổng p95 không quá 50 ms | 7 ms | Đạt |
| M2 (độ ổn định) | Ít nhất 99/100 mỗi nhóm; 0 ghi trùng, 0 lệnh mất | 600/600; 0; 0 | Đạt |
| Q1 bản tự viết | Đủ 30 task, không task nào ghi hai lần | 300/300; 0 ghi trùng; 0 lệnh mất | Đạt |
| M4 (mở rộng) | p95 của cổng tăng không quá 2 lần ở tải gấp 10 | Tăng 4 lần (7 ms lên 28 ms), 0 lỗi | Không đạt |
| M5 (độ phức tạp) | Đổi một luật chỉ sửa một chỗ | 1 chỗ ở cả hai bản | Đạt |
| M3 (chi phí) | 100% lần chạy có chi phí trong vết | Chưa đo | Chờ |
| M6 (công sức dùng lại) | 0 bộ tiếp hợp phải sửa; không quá 4 giờ công | Chưa đo | Chờ |
| Năm bộ đếm an toàn | Tất cả bằng 0 | Mọi bộ đếm áp dụng đều bằng 0, ở mọi file | Đạt |

**Kết luận:** lõi an toàn đạt mọi mục tiêu đã đo; điểm yếu duy nhất lộ ra là tốc độ khi đông người gọi, và hai chỉ số về AI còn chờ.

## 12. Số nào mang sang bản thật được

Bản thử giả lập nhiều thứ, nên không phải con số nào cũng đúng với hệ thống thật.
[Spec, mục 8](../design/mvp-spec.md#8-giả-định-và-giá-trị-của-kết-luận) chia kết luận làm ba loại:

| Loại | Ví dụ từ tài liệu này | Mang sang bản thật |
| --- | --- | --- |
| Cấu trúc: đúng hay sai | 0 ghi trùng khi có mã chống ghi trùng; engine không thay được mã đó | Có, nếu hệ thống thật cũng nhận mã chống ghi trùng |
| Chiều hướng: cách nào hơn | Temporal thêm dịch vụ và bước vận hành; cổng chậm đi khi đông người | Chiều hướng giữ được, độ lớn thì không |
| Con số tuyệt đối | 7 ms, 28 ms, 390 lời gọi mỗi giây | Không; chỉ dùng để so giữa các cách trong cùng bản thử |

Các giới hạn cần nhớ khi trích số:

- Danh sách task giả do Lab dựng nhận mã chống ghi trùng; Lark Task hay hệ thống nhân sự thật chưa được kiểm.
- Cổng chạy một tiến trình trên một máy; chạy nhiều máy cần thêm cơ chế để hai máy không cùng gửi một lệnh.
- Chỉ các loại lỗi Lab cố ý gây đã được thử: tắt ngang, ngừng 20 giây, rơi phản hồi, mạng rớt, hết giờ 60 giây.
- Dữ liệu chỉ có 20 nhân viên và 100 task.

**Kết luận:** khi trích một con số từ tài liệu này, ghi kèm loại của nó và giới hạn tương ứng.

## 13. Tự chạy lại

Cần Node 22 trở lên.
Mọi lệnh chạy trong `lab/` sau `npm install`.
Thêm `--out <thư mục>` để không đụng vào file đã commit, vì lệnh đo từ chối ghi đè.

| Phép đo | Lệnh | Thời gian khoảng |
| --- | --- | --- |
| M1 | `npm run measure -- m1-gateway --runs 100` | 11 giây |
| M2 | `npm run measure -- m2-scenarios --runs 100` | 18 phút |
| Q1 bản tự viết | `npm run measure -- q1-outbox --target gateway --runs 100` | 64 phút |
| Q1 bản Temporal | `npm run measure -- q1-outbox --target temporal --runs 100` | 95 phút |
| M4 | `npm run measure -- m4-load` | 2 phút |
| M5 bản tự viết | `npm run measure -- m5-complexity --target gateway` | 2 giây |
| M5 bản Temporal | `npm run measure -- m5-complexity --target temporal` | 5 giây |

Chạy thử nhanh với `--runs 2` trước khi chạy đủ 100 lần.
Bản Temporal cần cài thêm theo [README của bản đối chứng](../../lab/baselines/temporal/README.md).
Cách đọc file kết quả và cách thêm một phép đo mới nằm trong [README của lệnh đo](../../lab/measure/README.md).

**Kết luận:** mọi con số ở đây có thể chạy lại trên một máy cá nhân trong khoảng ba tiếng, không cần tài khoản hay credit nào.
