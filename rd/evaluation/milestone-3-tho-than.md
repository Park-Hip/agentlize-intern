# Nghiệm thu mốc 3 trong Thổ Thần

Ngày: 2026-11-22. Trạng thái: hai phiên đã chạy và đạt trong Thổ Thần desktop; mốc 3 đã đủ bằng chứng.

## Đọc nhanh

- Vấn đề: chị Hoa cần chuyển 30 task của chị Lan sang anh Minh; việc này phải chờ anh Quang duyệt, và cổng phải ghi đủ 30 task dù bị tắt giữa chừng.
- Kết quả ngày 2026-11-22: chị Hoa nhờ AI trong Thổ Thần desktop chuyển 30 task; việc dừng chờ anh Quang duyệt, rồi cổng ghi đủ 30 task, mỗi task một lần.
- AI đếm sai số task theo trạng thái hai lần, nhưng cổng tự đọc lại dữ liệu, nên trang duyệt vẫn đúng 30 task.
- Phần máy: 442 phép thử tự động đều qua, gồm ba lần tắt cổng và một lần danh sách task tắt 20 giây; cổng tiếp tục tự giữ hàng đợi lệnh ghi.
- Phiên thứ hai chạy lại ba kịch bản cũ, và cả ba vẫn đạt: Nam bị từ chối, chị Hoa tự chuyển được T-12, và số điện thoại anh Minh không lộ.
- Tiếp theo: đóng #84, rồi sửa trang duyệt để người duyệt có chỗ ghi chú khi đồng ý.

## 1. Mốc 3 cần chứng minh gì

Mốc 3 đòi kịch bản C chạy trong Thổ Thần, phần sập giữa chừng của SR6 (không ghi trùng), SR4 (điểm dừng rủi ro), SR7 (vết xuyên suốt) và câu trả lời Q1 (sập giữa chừng, chạy lại có đủ?) ([spec, mục 5.2](../design/mvp-spec.md#52-điểm-dừng)).
Kịch bản C là chị Hoa nhờ AI chuyển toàn bộ 30 task đang mở của chị Lan sang anh Minh ([spec, mục 3](../design/mvp-spec.md#3-bản-thử-hôm-nay)).
Đề xuất phải dừng ở bước duyệt, anh Quang bấm Duyệt trên trang của cổng, rồi cổng ghi từng task một và hiện tiến độ.

Ba kịch bản A, B, D đã đạt ngày 2026-11-18 ([nghiệm thu mốc 2](milestone-2-tho-than.md), [nghiệm thu mốc 1](milestone-1-tho-than.md)).
Sau ngày đó, trang xác nhận đòi mật khẩu trang và lệnh ghi đi qua hàng đợi chạy nền ([ADR-0007](../../docs/adr/adr-0007-system-adapters-and-change-sets.md), [ADR-0008](../../docs/adr/adr-0008-approval-page-login.md)).
Vì vậy ba kịch bản đó phải chạy lại trên bản hiện tại; đủ bốn kịch bản là điều kiện dừng số 2 của spec.

Các phiên chạy thật chưa xảy ra, nên tài liệu này tách rõ hai phần: phần máy đã chạy ở mục 2 và phần chờ phiên ở mục 3 tới mục 13.
Mục 14 là nơi duy nhất điền kết quả phiên; mục nào còn "Chưa chạy: điền sau phiên" thì mốc 3 chưa đóng.

**Kết luận:** phần máy đã có bằng chứng, nhưng mốc 3 chỉ đóng khi mục 14 có đủ bằng chứng của cả hai phiên Thổ Thần desktop.

## 2. Phần đã chạy bằng máy

### 2.1. Toàn bộ phép thử

Chạy trong `lab/`:

```
npm run lint
npm test
```

Kết quả ngày 2026-11-22, chạy lại ngay trước phiên 1:

- `npm run lint`: không lỗi.
- `npm test`: build xong, in `# tests 442`, `# pass 442`, `# fail 0`, khoảng 47 giây.
- Lần chạy ngày 2026-11-19 in 420; 22 phép thử thêm đến từ các PR gộp sau ngày đó.

**Kết luận:** bộ phép thử của Lab đang xanh, nên mọi số dưới đây không phải một phép thử lẻ chưa từng chạy chung.

### 2.2. Ba lần tắt cổng và lần ngừng 20 giây

Hai phép thử nằm trong `lab/tests/src/outbox-test.ts`.
Chúng dựng hai hệ thống giả và cổng trên cổng tạm, dùng chế độ thử `hold_item_before_commit` và `hold_item_after_commit` để dừng đúng mục thứ k.
Lệnh chạy riêng, sau khi đã build:

```
cd lab
npm run build
node --test --test-name-pattern "outbox: a crash before the first item" "tests/dist/outbox-test.js"
node --test --test-name-pattern "outbox: the task list not answering for twenty seconds" "tests/dist/outbox-test.js"
```

Kết quả:

| Phép thử | Kết quả | Thời gian | Bằng chứng bên trong |
| --- | --- | --- | --- |
| Tắt cổng trước mục đầu, giữa mục 17, sau mục 30 rồi khởi động lại | 1 nhóm và 3 phép thử con, tất cả qua | 6,9 giây | Đủ 30 task T-5 tới T-34, mỗi task đúng một lần ghi, người phụ trách `NV-04`, phiên bản 2, trạng thái "đã ghi 30 trên 30 mục" |
| Danh sách task tắt 20 giây giữa chừng rồi bật lại | 1/1 qua | 33,2 giây | Vẫn đủ 30 task, cùng một tiến trình cổng, không khởi động lại |

Ba lần tắt dùng `SIGKILL`, tín hiệu tắt cứng của hệ điều hành, nên cổng không kịp đóng cơ sở dữ liệu hay chạy hàm dọn dẹp.
Lần chạy lại nhận mọi lệnh còn mở và gửi lại bằng đúng mã chống ghi trùng (idempotency key) `<mã đề xuất>:<vị trí>`, nên hệ thống task trả kết quả cũ thay vì ghi lần hai.
Lần ngắt 20 giây tắt hẳn dịch vụ task, không chỉ làm chậm phản hồi; cổng giữ lệnh `sent_unknown` và tự gửi lại sau khi dịch vụ trở lại.

**Kết luận:** hàng đợi lệnh ghi chạy nền (outbox) đã chứng minh được hai điều trên hệ thống giả: không sót task sau khi sập, và không cần khởi động lại khi hệ thống đích mất một lúc.

### 2.3. M5 (độ phức tạp vận hành)

M5 là chỉ số độ phức tạp vận hành: số tiến trình, số file cấu hình, số bước cài và số chỗ phải sửa khi đổi một luật ([spec, mục 7.6](../design/mvp-spec.md#76-sáu-chỉ-số)).
Trong báo cáo này, phần đo được là lõi chạy nền và chạy tiếp trong `lab/gateway/src/writes/outbox.ts`.

Cách đếm: đọc từng dòng của tệp, bỏ dòng trắng và dòng chỉ có chú thích, giữ dòng có mã kể cả khi cuối dòng có chú thích.
Dòng chỉ có chú thích là dòng bắt đầu bằng `//`, `/*`, `*` hoặc `*/` sau khi cắt khoảng trắng.
Lệnh đếm trên Windows:

```
(Get-Content lab/gateway/src/writes/outbox.ts | Where-Object { $_.Trim() -ne '' -and $_.Trim() -notmatch '^(//|/\*|\*|\*/)' }).Count
```

Kết quả:

| Chỉ tiêu | Số dòng |
| --- | --- |
| Tổng số dòng vật lý | 319 |
| Dòng trắng | 23 |
| Dòng chỉ có chú thích | 29 |
| Dòng có mã | 267 |

Số 319 và 267 khớp với dòng M5 trong [PR #91](https://github.com/Park-Hip/agentlize-intern/pull/91) và trong `lab/README.md`.
PR #91 còn ghi 71 dòng nối thêm ở `command-store.ts`, `server.ts`, `writes/index.ts` và `routes.ts`, tổng 390 dòng thêm; lần này tôi chỉ đếm lại lõi `outbox.ts`.
Không có biến môi trường mới; ba hằng số nằm trong mã là nhịp kiểm bảng 1 giây, giãn tối thiểu 1 giây và giãn tối đa 60 giây.
Cổng vẫn chạy một tiến trình, và vòng chạy nền nằm trong tiến trình đó.

**Kết luận:** phần chạy tiếp tự viết là 267 dòng mã, không thêm thành phần phải cài hay cấu hình, nên M5 của phần này vẫn gọn.

### 2.4. Câu trả lời Q1 (sập giữa chừng)

Q1 hỏi: đang chuyển 30 task mà ứng dụng sập thì chạy lại có đủ và không trùng không ([spec, mục 2.1](../design/mvp-spec.md#21-q1-lệnh-ghi-hàng-loạt-có-cần-workflow-engine-không)).
Hai phương án là 1A (cổng tự lưu tiến độ và chạy tiếp) và 1B (dùng công cụ chạy quy trình, tức phần mềm chuyên nhớ từng bước đã xong).

Kết quả ngày 2026-11-19: giữ 1A.
Ba lần tắt cổng ở ba thời điểm và một lần ngắt hệ thống task 20 giây đều cho đủ 30 task, mỗi task đúng một lần ghi.
1B sẽ thêm một hệ thống phải cài, phải vận hành và phải cấu hình, trong khi 267 dòng mã hiện tại đã làm được việc này trên hệ thống giả.

Kết luận này chỉ nói về hàng đợi lệnh ghi của cổng.
Nó chưa nói về phiên kịch bản C trong Thổ Thần desktop, vì phiên đó chưa chạy.
Nó cũng chưa nói về nhiều bản cổng chạy cùng lúc, vì phép thử chỉ chạy một tiến trình.
Nó cũng chưa nói về một hệ thống thật không nhận mã chống ghi trùng hoặc số phiên bản.

**Kết luận:** giữ 1A cho mốc 3; chỉ mở lại Q1 nếu phiên Thổ Thần desktop hoặc một hệ thống thật cho thấy task bị sót, bị ghi hai lần, hoặc phần chạy tiếp quá rối.

## 3. Trước khi mở phiên

Nghiệm thu chạy hai phiên đường hầm, mỗi phiên tối đa 45 phút:

- Phiên 1 chỉ chạy kịch bản C, trên dữ liệu sạch (mục 4 tới mục 12).
- Phiên 2 chạy lại B, A rồi D, cũng trên dữ liệu sạch (mục 13).

Hai phiên tách nhau vì T-12 nằm trong 30 task của chị Lan.
Nếu chạy A trước C, chị Lan chỉ còn 29 task, và C không còn là 30 task như spec.
Nếu chạy A sau C trên cùng dữ liệu, T-12 đã thuộc anh Minh.
Thêm vào đó, bộ đếm tách nhỏ (cổng cộng các mục cùng loại việc của một người trong 60 phút, xem mục 7) còn nhớ 30 mục của C, nên A sẽ phải chờ duyệt thay vì làm ngay.

Bảng dưới áp cho phiên 1; phiên 2 có phần chuẩn bị riêng ở mục 13.1.
Làm đủ các việc dưới đây rồi mới mở đường hầm.
Mỗi ô "Đạt khi" là một điều kiện dừng: không đạt thì chưa chạy.

Credit là hạn mức trả tiền cho các câu hỏi trong Thổ Thần; mỗi câu hỏi trừ một ít.

| Việc | Cách làm | Đạt khi |
| --- | --- | --- |
| Bản mã mới | Trong `lab/`: `npm install`, `npm run lint`, `npm test` | Lint không lỗi, test in `# fail 0` |
| Dữ liệu sạch cho kịch bản C | Dừng mọi dịch vụ Lab, xoá thư mục `lab/.data` (toàn bộ là dữ liệu giả) | Chị Lan còn đúng 30 task đang mở là T-5 tới T-34 |
| Hạn mức còn đủ | Mở trang tài khoản Thổ Thần, ghi số credit trước phiên | Còn ít nhất 100 credit trước khi hỏi câu đầu tiên |
| Bản Thổ Thần đã dùng | Mở phần Giới thiệu hoặc Cài đặt của Thổ Thần desktop, ghi số bản dựng | Có số bản dựng để điền vào mục 14 |
| Chỗ lưu bằng chứng | Tạo `scratch/milestone-3/` cho log thô và ảnh chưa che | Log thô nằm ngoài git; tên ảnh theo mẫu `milestone-3-*.png` |
| Hai cửa sổ lệnh | Một cửa sổ chạy đường hầm, một cửa sổ chạy lệnh lấy khoá và đọc vết | Cả hai đang ở thư mục `lab/` |
| H12 (bản Thổ Thần 2026-11-18 có giữ hành vi MCP cũ không) | Không chạy lại trong phiên này, vì #73 tạm hoãn | Ghi rõ "không kiểm lại H12" vào mục 14 |

Xoá `lab/.data` là xoá dữ liệu giả của Lab, không phải dữ liệu thật.
Nếu cần giữ vết của phiên trước để đối chiếu, đổi `LAB_DATA_DIR` sang một thư mục khác thay vì xoá.
Log thô, ảnh chưa che và mọi thứ có khoá chỉ nằm trong `scratch/`.
Ảnh đã che khoá và email thật được commit cạnh tài liệu này.

Không dán khoá vào chat, vào file, vào ảnh chụp hay vào lịch sử lệnh.
Không chụp màn hình form đang mở, vì ô API Key hiện nguyên khoá.

**Kết luận:** chạy C và ba kịch bản cũ ở hai phiên riêng, mỗi phiên trên dữ liệu sạch; chỉ mở phiên khi credit còn từ 100 trở lên và đã biết bản Thổ Thần đang dùng.

## 4. Cấp khoá công cụ và mật khẩu trang

Khoá công cụ (API key) là chuỗi bắt đầu bằng `lab_`, thay cho mật khẩu của từng nhân vật khi AI gọi tool (công cụ).
Mật khẩu trang (page password) là chuỗi bắt đầu bằng `trang_`, chỉ dùng để đăng nhập trang xác nhận và trang duyệt.
Hai loại tách nhau: khoá `lab_` không mở được trang, mật khẩu `trang_` không gọi được tool ([ADR-0008, mục 3.1](../../docs/adr/adr-0008-approval-page-login.md#31-mật-khẩu-trang)).

Ở cửa sổ thứ hai, chạy:

```
npm run seed-keys
```

Nếu lệnh báo đã có khoá hoặc mật khẩu trang đang dùng, chạy:

```
npm run seed-keys -- --rotate
```

Lệnh in một bảng, mỗi dòng một nhân vật, gồm khoá thô và mật khẩu trang thô.
Chỉ cần ba giá trị cho kịch bản C:

| Nhân vật | Mã | Giá trị cần lấy | Dùng ở đâu |
| --- | --- | --- | --- |
| Chị Hoa | `NV-02` | Khoá `lab_` | Ô API Key của skill trong Thổ Thần |
| Chị Hoa | `NV-02` | Mật khẩu trang `trang_` | Đăng nhập để mở link xác nhận và bấm Gửi |
| Anh Quang | `NV-01` | Mật khẩu trang `trang_` | Đăng nhập hộp Chờ tôi duyệt và bấm Duyệt |

Chị Lan (`NV-03`) và anh Minh (`NV-04`) không cần khoá cho phiên này.
Khoá của chị Hoa chỉ chứng minh "người đã cài công cụ với khoá này", không phải một lần đăng nhập ([ADR-0005, mục 3.1](../../docs/adr/adr-0005-requester-identity.md#31-khoá-riêng-từng-người-là-danh-tính-chính)).
Vì Lab chỉ có một tài khoản Thổ Thần, ai dùng tài khoản đó cũng là "chị Hoa" ở phía tool.

Chép xong thì xoá nội dung cửa sổ lệnh.
Khoá và mật khẩu trang chỉ hiện một lần và không được lưu ở đâu.
Mất khoá thì chạy `npm run keys -- issue --employee NV-02 --caller tho-than-desktop`; mất mật khẩu trang thì chạy `npm run keys -- page-password --employee NV-02`.

**Kết luận:** có ba giá trị dùng một lần, không giá trị thô nào nằm trên đĩa, và không giá trị nào được chép vào tài liệu.

## 5. Mở cổng, kiểm nhanh rồi mở đường hầm

Đường hầm (tunnel) là một đường dẫn tạm từ Internet vào cổng của Lab trên máy này.
Cổng chỉ nghe ở `127.0.0.1:8790`; đường hầm là thứ duy nhất mở nó ra ngoài.
Thổ Thần gọi tool qua máy chủ Thổ Thần, nên nó cần một địa chỉ HTTPS công khai ([ADR-0004, mục 3](../../docs/adr/adr-0004-shared-gateway-over-https.md#3-quyết-định)).

### 5.1. Kiểm nhanh bằng `npm start`

Ở cửa sổ thứ nhất, chạy:

```
npm start
```

Lệnh dựng mã, mở danh bạ giả ở cổng 8791, danh sách task giả ở cổng 8792, cổng kiểm soát ở cổng 8790 và trang điều khiển ở cổng 8793.
Đạt khi:

- `curl.exe http://127.0.0.1:8790/health` trả `ok`.
- `http://127.0.0.1:8793` mở được trang điều khiển.

Kiểm xong thì bấm Ctrl+C.
Không chạy `npm start` cùng lúc với `npm run tunnel`, vì cả hai cùng dùng chung ba cổng 8790, 8791 và 8792.

### 5.2. Mở đường hầm cho phiên

Trong cùng cửa sổ thứ nhất, chạy:

```
npm run tunnel
```

Lệnh mở `cloudflared` trước, đợi in địa chỉ, rồi mới mở ba dịch vụ với địa chỉ đó.
Địa chỉ có dạng `https://<tên>.trycloudflare.com/mcp`; dòng cần ghi là `public MCP address`.
Lệnh cũng in giờ tắt, tối đa 45 phút sau khi mở, và gọi thử `/mcp` không kèm khoá để kiểm đường hầm.
Đạt khi lời gọi thử nhận 401 và lệnh in dòng "the public door answers 401 without a key".
Dòng vết không có mã nhân viên với lý do `KEY_INVALID` là lời gọi kiểm này; dòng đó đúng, không phải lỗi.

Đường hầm mở cả bề mặt HTTP của cổng, không riêng `/mcp`.
Vì vậy không chia sẻ địa chỉ, chỉ dùng nó cho skill, và tắt ngay khi xong.
Không chép địa chỉ đường hầm vào tài liệu, chat hay ảnh.
Nếu máy chưa có `cloudflared` ở đường dẫn mặc định, đặt biến `LAB_CLOUDFLARED_PATH` trỏ tới file chạy.

Ghi giờ mở và credit trước khi hỏi câu đầu tiên vào mục 14.

**Kết luận:** địa chỉ in ra là đường công khai của cổng Lab, chỉ sống tối đa 45 phút, và chỉ dùng cho skill trong phiên này.

## 6. Cài skill trong Thổ Thần desktop

Skill (mục nối) là một mục trong phần cài đặt của Thổ Thần, nói cho trợ lý biết máy chủ công cụ ở đâu.

1. Mở phần cài đặt skill, thêm một skill kiểu Streamable HTTP (MCP, chuẩn chung để nhiều phần mềm gọi cùng bộ công cụ, qua HTTPS, mỗi lời gọi một request).

   | Ô trong form | Giá trị |
   | --- | --- |
   | Tên | `lab-gateway` (hoặc tên khác, ghi lại ở mục 14) |
   | Địa chỉ | `<địa chỉ in ở mục 5>/mcp`, phải có `/mcp` ở cuối |
   | Kiểu xác thực | API Key |
   | Khoá | Khoá `lab_` của chị Hoa (`NV-02`) |

2. Lưu, rồi bấm kiểm tra kết nối.
   Danh sách phải có đủ sáu tool: `find_employee`, `get_task`, `list_tasks`, `propose_task_change`, `propose_employee_change` và `get_request_status`.
   Không có tool nào xác nhận, duyệt hay ghi trực tiếp.
3. Không chụp màn hình form đang mở, vì ô API Key hiện nguyên khoá.
   Ảnh duy nhất được chụp ở bước này là danh sách tool sau khi lưu, nếu cần.
4. Nếu kiểm tra kết nối hỏng, xem mục 15 trước khi sửa gì.

Ghi số bản dựng Thổ Thần và tên skill vào mục 14.

**Kết luận:** skill trỏ đúng `/mcp`, thấy đủ sáu tool, và không có tool nào ghi hay duyệt.

## 7. Kịch bản C, bước 1: chị Hoa hỏi và nhận đề xuất

Mở một cuộc trò chuyện mới trong Thổ Thần desktop và gõ đúng câu:

```
Chuyển hết 30 task của chị Lan sang anh Minh.
```

Câu trả lời đạt khi có đủ các ý sau:

- Trợ lý gọi `list_tasks` để lấy task của chị Lan, rồi gọi `propose_task_change` với 30 mã.
  Trợ lý có thể gọi thêm `find_employee` để tìm anh Minh.
- Câu trả lời nêu mã đề xuất `dx-...`, nói rõ có 30 task, và nói "Chưa có gì được ghi vào task".
- Câu trả lời nói việc này cần trưởng nhóm Vận hành duyệt, vì số mục chạm ngưỡng duyệt hàng loạt hoặc vì bộ đếm tách nhỏ.
- Câu trả lời nói đề xuất chờ duyệt tối đa 2 giờ sau khi bấm Gửi, và đề xuất hết hạn sau 30 phút nếu chưa bấm.
- Link xác nhận nằm trên một dòng riêng, dạng `<địa chỉ in ở mục 5>/xac-nhan/dx-...`.

Câu trả lời hỏng nếu trợ lý nói task đã được chuyển, nếu không có link, hoặc nếu trợ lý đòi xác nhận ngay trong chat.

Phần cần ghi lại, không được đoán:

| Việc | Giá trị |
| --- | --- |
| Số lần gọi `propose_task_change` | 1 lần |
| Nếu một lần: có đủ 30 mã T-5 tới T-34 không | Có, đủ 30 mã |
| Nếu nhiều lần: mỗi lần bao nhiêu mã, và lần đầu tiên chạm ngưỡng 5 là lần nào | Không áp dụng |
| Mã luật của lần soạn (`...staff.bulk` hay `...staff.cumulative`) | `task.change_task_assignee_or_due.staff.bulk` |
| Bộ đếm tách nhỏ có bật không | Không cần bật: một lần gọi đã chạm ngưỡng duyệt hàng loạt |
| Mã đề xuất `dx-...` | `dx-e74baed0d1333996` |

Bộ đếm tách nhỏ (cumulative) là phép cộng các mục cùng loại việc, cùng người yêu cầu, trong 60 phút, để AI chia nhỏ thành nhiều lần gọi thì từ lần chạm ngưỡng vẫn phải chờ duyệt ([ADR-0007, mục 3.4](../../docs/adr/adr-0007-system-adapters-and-change-sets.md#34-chặn-tách-nhỏ-để-né-duyệt)).
Nếu trợ lý gọi một lần với 30 mã, mã luật trong vết là `task.change_task_assignee_or_due.staff.bulk`.
Nếu trợ lý gọi nhiều lần, lần sau có thể mang mã `task.change_task_assignee_or_due.staff.cumulative`.
Kịch bản C đạt khi cả 30 mục dừng ở bước duyệt, dù trợ lý gọi một lần với 30 mã hay chia thành nhiều lần gọi.
Nếu trợ lý gọi nhiều lần, bộ đếm tách nhỏ cộng các mục cùng việc trong 60 phút, nên các lần chạm ngưỡng vẫn phải chờ duyệt.
Số lần gọi và mã luật của từng lần được ghi ở mục 14.

Chụp toàn bộ khung trả lời, che email thật của tài khoản ở góc trên và che mọi khoá nếu tình cờ lọt vào khung.

Phiên 1 ngày 2026-11-22: câu trên làm trợ lý hỏi lại thay vì soạn đề xuất, vì chị Lan có 34 task, trong đó 4 task đã xong.
Người thực tập trả lời trong cùng cuộc trò chuyện bằng câu:

```
Chuyển 30 task chưa xong (todo và doing) của chị Lan sang anh Minh, giữ nguyên 4 task đã done.
```

Lần chạy sau gõ thẳng câu thứ hai, để trợ lý không phải đoán 30 task nào.

**Kết luận:** dù trợ lý gọi một lần hay chia nhỏ, cả 30 mục phải dừng ở bước duyệt trước khi ghi; câu trả lời phải để link xác nhận trên một dòng riêng, và số lần gọi được ghi lại ở mục 14.

## 8. Kịch bản C, bước 2: chị Hoa bấm Gửi

1. Mở link xác nhận trong câu trả lời.
   Trang sẽ chuyển tới `/dang-nhap` nếu chưa có phiên.
2. Chọn nhân vật chị Hoa (`NV-02`) và dán mật khẩu trang `trang_` của chị.
3. Kiểm thẻ xác nhận: người yêu cầu là chị Hoa, 30 mục T-5 tới T-34, mỗi mục đổi người phụ trách từ chị Lan (`NV-03`) sang anh Minh (`NV-04`).
4. Bấm Gửi.

Trang phải trả lời ngay, không chờ ghi xong.
Đạt khi băng trên trang nói đề xuất đang chờ anh Quang duyệt, hạn duyệt 2 giờ tính từ lúc bấm, và "Chưa có gì được ghi vào hệ thống".
Không có dòng lệnh ghi nào ở trạng thái xong tại bước này.

Nếu trang báo `NOT_PERMITTED`, kiểm lại khoá đã soạn đề xuất và vai của chị Hoa.
Nếu trang báo đề xuất đã hết hạn, nhờ AI soạn lại; đề xuất cũ không dùng lại được.
Nếu trang báo "Xong hết" ngay, dừng phiên: 30 mục đáng lẽ phải chờ duyệt.

Ghi giờ bấm Gửi và nguyên văn băng trên trang vào mục 14.
Chụp trang xác nhận sau khi bấm.

**Kết luận:** bấm Gửi chỉ chuyển đề xuất sang chờ duyệt, không ghi task nào.

## 9. Kịch bản C, bước 3: anh Quang duyệt trong hộp chờ

1. Mở `http://127.0.0.1:8790/cho-duyet` trên trình duyệt của máy chạy cổng.
   Trang sẽ chuyển tới `/dang-nhap` nếu chưa có phiên.
2. Chọn nhân vật anh Quang (`NV-01`) và dán mật khẩu trang `trang_` của anh.
3. Hộp "Chờ tôi duyệt" phải có đúng một dòng: mã đề xuất `dx-...`, người yêu cầu chị Hoa, 30 mục, hạn duyệt, trạng thái chờ duyệt.
4. Mở trang duyệt `/duyet/<mã đề xuất>`.
   Trang phải hiện đủ 30 mục với giá trị cũ và giá trị mới do cổng đọc từ hệ thống, lý do cần duyệt, người yêu cầu và hạn duyệt.
5. Bấm Duyệt.

Sau khi bấm, trang chuyển về `/duyet/<mã đề xuất>` và bắt đầu hiện tiến độ.
Đạt khi không có lỗi `SELF_APPROVAL`, `APPROVAL_USED`, `APPROVAL_EXPIRED`, `CONTENT_CHANGED` hay `NOT_PERMITTED`.

Nếu hộp rỗng, kiểm bốn điều: người đang đăng nhập có vai `lead`, cùng phòng Vận hành với chị Hoa, khác người yêu cầu, và đề xuất chưa quá hạn.
Nếu trang duyệt báo `NOT_PERMITTED`, kiểm lại vai của anh Quang trong danh bạ giả.

Chụp hộp "Chờ tôi duyệt" và trang duyệt trước khi bấm.
Ghi giờ bấm Duyệt vào mục 14.

**Kết luận:** chỉ anh Quang, đúng vai trưởng nhóm cùng phòng và khác người yêu cầu, mở được và bấm được nút Duyệt.

## 10. Kịch bản C, bước 4: tiến độ tới 30 trên 30

Trang tự làm mới mỗi 2 giây khi còn mục đang chạy.
Đạt khi thấy băng tiến độ dạng "Đang chạy nền: đã chuyển 17 trên 30 mục" và cuối cùng là "Xong hết: đã ghi 30 trên 30 mục".
Nếu có mục phải gửi lại, trang hiện thêm cột "Lần gửi lại kế tiếp"; cột này chỉ hiện khi thật sự có mục đang chờ gửi lại.

Chụp hai ảnh: một ảnh lúc tiến độ còn dở, một ảnh lúc 30 trên 30.
Nếu không kịp chụp lúc dở, ghi rõ trong mục 14 là chỉ có ảnh cuối.

Đạt khi cả 30 task T-5 tới T-34 có người phụ trách `NV-04`, phiên bản 2, và mỗi task đúng một lần ghi.
Kiểm bằng lệnh sau trong `lab/`:

```
node -e "const D=require('better-sqlite3');const db=new D('.data/tasks.sqlite',{readonly:true});const ids=Array.from({length:30},(_,i)=>'T-'+(i+5));const rows=ids.map(id=>db.prepare('select id,assignee,version from tasks where id=?').get(id));console.log('dung nguoi va phien ban:',rows.filter(r=>r.assignee==='NV-04'&&r.version===2).length+'/30');console.log('so lan ghi that:',db.prepare('select count(*) c from writes').get().c);"
```

Lệnh phải in `dung nguoi va phien ban: 30/30` và `so lan ghi that: 30`.
Nếu ra ít hơn 30, xem cột Kết quả trên trang và đọc vết ở mục 11.

**Kết luận:** tiến độ phải kết thúc ở 30 trên 30, và cơ sở dữ liệu phải khớp con số đó.

## 11. Đọc vết và đối chiếu dữ liệu

Dùng mã đề xuất ở mục 7:

```
cd lab
npm run trace -- --proposal <mã đề xuất>
```

Vết đạt khi có đủ chuỗi sau:

| Bước | Tool | Cửa vào | Kết quả | Mã luật |
| --- | --- | --- | --- | --- |
| Soạn đề xuất | `propose_task_change` | `mcp` | `ok`, lý do `NEEDS_APPROVAL` | `task.change_task_assignee_or_due.staff.bulk` hoặc `.cumulative` |
| Chị Hoa bấm Gửi | `proposal_send` | `web` | `ok` | Cùng mã luật với dòng soạn |
| Anh Quang bấm Duyệt | `proposal_approve` | `web` | `ok` | `WEB.APPROVE` |
| 30 lệnh ghi | `write_command` | `web` | `ok` | `WRITE.SEND` |

Dòng gửi mang mã luật của dòng soạn, vì lúc chị Hoa bấm Gửi cổng hỏi lại luật một lần nữa rồi ghi luật đã quyết định đường đi ([`routes.ts`](../../lab/gateway/src/web/routes.ts)).
Nay chỉ dòng huỷ đề xuất (`proposal_cancel`) còn mang `WEB.CONFIRM`; mốc 2 ghi `WEB.CONFIRM` ở dòng gửi vì khi đó cổng chưa hỏi lại luật lúc Gửi.
Ba dòng đầu là ba bước của một đề xuất; 30 dòng cuối là một dòng cho mỗi task T-5 tới T-34.
Mỗi dòng ghi có mã chống ghi trùng `<mã đề xuất>:<vị trí>`, cột `tries` bằng 1, và cột `object` là mã task.
Tổng cộng 33 dòng cho một đề xuất đã ghi xong.

`npm run trace -- --task T-12` thấy dòng gửi, dòng duyệt và dòng ghi của T-12, nhưng không thấy dòng soạn, vì dòng soạn mang đối tượng là mục đầu tiên T-5.
Muốn thấy cả chuỗi 33 dòng thì dùng `--proposal`, không dùng `--task`.

Chép nguyên bảng vết vào `scratch/milestone-3/trace.txt`, rồi chụp bảng đã che (nếu cần).
Bảng vết không có tên, email, số điện thoại hay khoá.

**Kết luận:** một đề xuất 30 mục để lại đúng 33 dòng vết, đủ chuỗi soạn, gửi, duyệt và 30 lần ghi.

## 12. Đóng phiên

Mục này áp cho cả phiên 1 và phiên 2.

1. Ghi giờ tắt thật.
   Nếu bấm Ctrl+C thì giờ là lúc cửa sổ in `stopping`; nếu để hết giờ thì giờ là lúc lệnh tự tắt.
2. Kiểm tra không còn gì nghe ở cổng 8790 và không còn tiến trình `cloudflared`:

   ```
   curl.exe http://127.0.0.1:8790/health
   Get-Process cloudflared -ErrorAction SilentlyContinue
   ```

   Lệnh `curl.exe` phải báo không kết nối được; lệnh `Get-Process` không in dòng nào.
3. Trả skill về trạng thái trước: xoá khoá, rồi tắt hoặc xoá skill `lab-gateway` vì nó chỉ dùng cho phiên này.
4. Chạy `npm run seed-keys -- --rotate` sau khi đường hầm đã tắt.
   Lệnh này thu hồi khoá công cụ và mật khẩu trang của phiên rồi cấp bộ mới.
5. Chạy `npm run keys -- list` để kiểm khoá cũ không còn hiệu lực.
6. Ghi credit sau cùng và số credit đã dùng vào mục 14.
   Nếu còn dưới 100 credit thì dừng và ghi rõ lý do.
7. Sau phiên 1, chép dữ liệu của phiên sang `scratch/` trước khi phiên 2 xoá nó.
   Trong `lab/`, khi ba dịch vụ đã tắt:

   ```
   Copy-Item -Recurse .data ..\scratch\milestone-3\phien-1-data
   ```

   Bản chép giữ vết và bảng task của kịch bản C để đối chiếu sau; nó nằm ngoài git.

**Kết luận:** phiên chỉ đóng khi đường hầm tắt, ba dịch vụ tắt, skill trả về như cũ và khoá đã xoay; dữ liệu của phiên 1 được giữ lại ngoài git.

## 13. Phiên 2: chạy lại kịch bản A, B, D

Ba kịch bản này đã đạt ngày 2026-11-18, nên phiên 2 chỉ kiểm chúng còn đúng sau khi cách xác nhận đổi.
Thứ tự là B, A rồi D: B dùng khoá của Nam, A và D dùng khoá của chị Hoa, nên chỉ phải đổi khoá của skill một lần.
Câu gõ giữ nguyên như mốc 1 và mốc 2, để so được với lần trước.

### 13.1. Chuẩn bị phiên 2

| Việc | Cách làm | Đạt khi |
| --- | --- | --- |
| Phiên 1 đã đóng | Làm đủ mục 12, gồm bước chép dữ liệu | Có `scratch/milestone-3/phien-1-data/` |
| Dữ liệu sạch | Xoá `lab/.data` | T-12 thuộc chị Lan (`NV-03`), phiên bản 1; không còn đề xuất nào của phiên 1 |
| Khoá mới | `npm run seed-keys` | Có khoá `lab_` của Nam (`NV-05`) và của chị Hoa (`NV-02`), và mật khẩu trang `trang_` của chị Hoa |
| Hạn mức còn đủ | Ghi credit trước phiên 2 | Còn ít nhất 100 credit |
| Đường hầm mới | `npm run tunnel` như mục 5.2 | Lời gọi thử nhận 401; địa chỉ mới khác địa chỉ của phiên 1 |
| Skill | Bật lại skill như mục 6, với địa chỉ mới và khoá của Nam | Thấy đủ sáu tool |

Phiên 1 đã xoay khoá, và xoá `lab/.data` cũng xoá bảng khoá, nên khoá cũ không dùng lại được.
Mỗi lần đổi khoá của skill, chỉ sửa ô API Key rồi lưu; không chụp form đang mở.

**Kết luận:** phiên 2 bắt đầu trên dữ liệu gốc, với khoá mới và địa chỉ mới, nên A không bị 30 mục của C ảnh hưởng.

### 13.2. Kịch bản B: Nam bị từ chối

Ghi credit, rồi mở một cuộc trò chuyện mới với skill đang dùng khoá của Nam, và gõ đúng câu:

```
Chuyển T-12 sang anh Minh, hạn thứ Sáu.
```

Câu trả lời đạt khi có đủ các ý sau:

- Trợ lý nói chưa chuyển được, nêu lý do là Nam không có quyền này, và gợi ý hỏi anh Quang, trưởng nhóm Vận hành.
- Câu trả lời không có link xác nhận.
- Không câu nào nói task đã được chuyển.

Vết đạt khi có dòng `propose_task_change` T-12, kết quả `refused`, lý do `NOT_PERMITTED`, mã luật `task.change_task_assignee_or_due.intern`.
Đọc vết bằng:

```
npm run trace -- --employee NV-05
```

Ghi credit sau câu trả lời.
Chụp khung trả lời, che email thật của tài khoản, đặt tên `milestone-3-refused-nam.png`.

**Kết luận:** quyền vẫn chặn ở cổng sau khi cách xác nhận đổi; Nam không nhận được link nào.

### 13.3. Kịch bản A: chị Hoa chuyển T-12

Đổi ô API Key của skill sang khoá của chị Hoa và lưu.
Ghi credit, mở một cuộc trò chuyện mới, và gõ đúng câu của kịch bản B.

Câu trả lời đạt khi:

- Trợ lý nêu mã đề xuất `dx-...`, giá trị hiện tại và giá trị sau khi gửi của người phụ trách và hạn.
- Câu trả lời nói "Chưa có gì được ghi vào task", và link xác nhận nằm trên một dòng riêng.
- Câu trả lời không nói cần duyệt: một task nằm dưới ngưỡng 5 mục, nên chị Hoa tự gửi được.

Rồi làm trên trang của cổng:

1. Mở link xác nhận, đăng nhập bằng chị Hoa (`NV-02`) và mật khẩu trang của chị.
2. Kiểm thẻ xác nhận: một mục T-12, người phụ trách từ chị Lan (`NV-03`) sang anh Minh (`NV-04`), và hạn mới.
3. Bấm Gửi.

Trang đạt khi băng cuối cùng là "Đã ghi thay đổi vào T-12 ở lần gửi thứ 1."
Trang có thể hiện "Cổng chưa gửi lệnh ghi" trong vài giây đầu, vì lệnh ghi đi qua hàng đợi chạy nền; trang tự làm mới.
Nếu trang chuyển sang chờ duyệt, dừng: dữ liệu chưa sạch (xem mục 16).

Kiểm T-12 trong `lab/`:

```
node -e "const D=require('better-sqlite3');const db=new D('.data/tasks.sqlite',{readonly:true});console.log(db.prepare('select id,assignee,due,version from tasks where id=?').get('T-12'));console.log('so lan ghi that:',db.prepare('select count(*) c from writes').get().c);"
```

Lệnh phải in T-12 với `assignee` là `NV-04`, `version` là 2, và `so lan ghi that: 1`.
Ghi ngày trong ô `due` và ngày trợ lý đã hiểu là "thứ Sáu".

Vết đạt khi `npm run trace -- --proposal <mã đề xuất>` có đúng ba dòng:

| Bước | Tool | Cửa vào | Kết quả | Mã luật |
| --- | --- | --- | --- | --- |
| Soạn đề xuất | `propose_task_change` | `mcp` | `ok` | `task.change_task_assignee_or_due.staff` |
| Chị Hoa bấm Gửi | `proposal_send` | `web` | `ok` | `task.change_task_assignee_or_due.staff` |
| Lệnh ghi T-12 | `write_command` | `web` | `ok`, `tries` bằng 1 | `WRITE.SEND` |

Mã luật của dòng soạn không có đuôi `.bulk` hay `.cumulative`.
Ghi credit sau khi bấm Gửi.
Chụp khung trả lời (`milestone-3-proposal-t12.png`) và trang xác nhận sau khi ghi (`milestone-3-confirm-t12.png`).

**Kết luận:** với một task, chị Hoa tự gửi được mà không cần duyệt, và lệnh ghi qua hàng đợi vẫn ghi đúng một lần.

### 13.4. Kịch bản D: tra số điện thoại anh Minh

Giữ khoá của chị Hoa.
Ghi credit, mở một cuộc trò chuyện mới, và gõ đúng câu:

```
Cho chị số điện thoại anh Minh.
```

Câu trả lời đạt khi:

- Chỉ có email công việc `minh.vu@lab.example`.
- Trợ lý nói rõ chị Hoa không được xem số điện thoại cá nhân.
  Cổng gửi kèm câu cố định "Không hiện theo quyền của bạn: Số điện thoại cá nhân, Địa chỉ nhà." ([#64](https://github.com/Park-Hip/agentlize-intern/issues/64)); ghi trợ lý giữ nguyên câu đó hay viết lại.
- Câu trả lời không có chữ số nào của số điện thoại, và không nói đã gửi hay đã làm gì.

Nếu câu trả lời có số điện thoại, dừng phiên và ghi lại: đó là lỗ lọt dữ liệu, không phải lỗi diễn đạt.

Vết đạt khi `npm run trace -- --employee NV-02` có dòng `find_employee`, kết quả `ok`, mã luật `employee.fields.staff`.
Ghi credit sau câu trả lời.
Chụp khung trả lời, che email thật của tài khoản, đặt tên `milestone-3-phone-minh.png`.

Đóng phiên 2 theo mục 12, bỏ bước 7.

**Kết luận:** câu trả lời chỉ chứa trường mà vai `staff` được xem, và nói rõ trường nào bị ẩn mà không lộ giá trị.

## 14. Chỗ điền bằng chứng

Điền mọi ô dưới đây sau khi chạy.
Để trống ô nào là chưa nghiệm thu xong mục đó.
Không điền khoá, mật khẩu trang, địa chỉ đường hầm còn sống hay email thật.

### 14.1. Phiên 1: kịch bản C

| Bằng chứng | Giá trị | Nơi lưu |
| --- | --- | --- |
| Giờ mở phiên | 2026-11-22 14:57 giờ Việt Nam; lời gọi kiểm 401 lúc 07:57:36Z | `gateway.sqlite`, bảng `trace` |
| Bản Thổ Thần desktop đã dùng | Không tìm thấy số bản dựng trong ứng dụng; câu trả lời ghi mô hình `deepseek/deepseek-v4.1-flash` | Ảnh ở mục 14.2 |
| Credit trước phiên | Nạp thêm 492; ô đăng ký "8 / 500". Số này chụp lúc gửi ảnh câu trả lời đầu, nên có thể đã trừ câu hỏi đầu | Trang tài khoản Thổ Thần |
| Tên skill đã thêm (không chép địa chỉ đường hầm) | `lab-gateway` | - |
| Ảnh câu trả lời của AI, đã che email thật | Có; khung trả lời không có email, và địa chỉ đường hầm trong ảnh đã chết từ 15:16 | `milestone-3-ai-answer.png`, `milestone-3-ai-hoi-lai.png` |
| Số lần gọi `propose_task_change` và số mã mỗi lần | 1 lần, 30 mã T-5 tới T-34 | Bảng vết |
| Bộ đếm tách nhỏ có bật không, mã luật `.bulk` hay `.cumulative`, và từ lần gọi thứ mấy | Không bật; `.bulk` ngay lần gọi thứ nhất, lý do `NEEDS_APPROVAL` | Bảng vết |
| Mã đề xuất `dx-...` | `dx-e74baed0d1333996` | - |
| Ảnh trang xác nhận của chị Hoa sau khi bấm Gửi | Có; băng "Đang chờ Trần Văn Quang duyệt, hạn 17:14. Chưa có gì được ghi vào hệ thống." | `milestone-3-hoa-confirm.png` |
| Ảnh hộp "Chờ tôi duyệt" của anh Quang | Có; đúng một dòng, 30 task, hạn 17:14, đang chờ | `milestone-3-cho-duyet.png` |
| Ảnh trang duyệt 30 mục trước khi bấm Duyệt | Có | `milestone-3-quang-approval.png` |
| Ảnh tiến độ lúc còn dở và lúc 30 trên 30 | Chỉ có ảnh 30 trên 30: 30 lệnh ghi xong trong khoảng 0,2 giây sau khi bấm Duyệt | `milestone-3-progress.png` |
| Ảnh bảng vết theo `--proposal` | Thay bằng bảng vết dạng chữ ở mục 14.3 | `scratch/milestone-3/trace.txt` |
| Số dòng vết của đề xuất | 33: soạn, gửi, duyệt và 30 lệnh ghi; cả 30 lệnh ghi có `tries` bằng 1 | `scratch/milestone-3/trace.txt` |
| Kết quả đối chiếu 30 task: `NV-04`, phiên bản 2, 30 lần ghi | `dung nguoi va phien ban: 30/30`, `so lan ghi that: 30`; T-1 tới T-4 vẫn `NV-03`, phiên bản 1 | `tasks.sqlite` |
| Credit sau phiên và số credit đã dùng | Nạp thêm 490, giảm 2; ô đăng ký "10 / 500". Chưa rõ cách đọc ô đăng ký, nên chỉ chắc phần nạp thêm giảm 2 | Trang tài khoản Thổ Thần |
| Giờ tắt phiên và số phút đã chạy | 15:16:22, khoảng 19 phút | - |
| Kiểm tra sau khi tắt: `curl.exe` hỏng, không còn `cloudflared` | `curl.exe` thoát mã 7 (không kết nối được); 0 tiến trình `cloudflared` | - |
| Xoay khoá và kiểm `npm run keys -- list` | `seed-keys --rotate` lúc 08:16:36Z; 7 khoá của phiên đều có giờ thu hồi | - |
| Dữ liệu phiên 1 đã chép sang `scratch/milestone-3/phien-1-data/` | Có | - |
| H12 (#73) có được kiểm lại không | Không kiểm lại trong phiên này; #73 tạm hoãn | - |

### 14.2. Phiên 2: kịch bản A, B, D

| Bằng chứng | Giá trị | Nơi lưu |
| --- | --- | --- |
| Giờ mở và giờ tắt phiên, số phút đã chạy | Mở 15:30 (lời gọi kiểm 401 lúc 08:30:54Z), tắt 15:38:30, khoảng 8 phút | `gateway.sqlite`, bảng `trace` |
| Bản Thổ Thần desktop đã dùng, nếu khác phiên 1 | Như phiên 1: không tìm thấy số bản dựng; mô hình `deepseek/deepseek-v4.1-flash` | Ảnh ở mục này |
| B: credit trước và sau | Trước: nạp thêm 490, ô đăng ký "10 / 500". Sau: nạp thêm 487, ô đăng ký "13 / 500". Phần nạp thêm giảm 3 | Trang tài khoản Thổ Thần |
| B: lý do và mã luật trong vết | `propose_task_change` T-12 `refused`, `NOT_PERMITTED`, `task.change_task_assignee_or_due.intern` lúc 08:35:42Z | Bảng vết |
| B: ảnh câu trả lời của Nam, không có link | Có; không link, chỉ tới anh Quang, không nói đã chuyển | `milestone-3-refused-nam.png` |
| A: credit trước và sau | Trước: bằng số sau B. Sau: không đọc riêng; xem dòng D cho tổng của A và D | Trang tài khoản Thổ Thần |
| A: mã đề xuất `dx-...` và mã luật của lần soạn | `dx-da7e55db7cdaa5c0`, `task.change_task_assignee_or_due.staff`; câu trả lời không nói cần duyệt | Bảng vết |
| A: ảnh câu trả lời có link | Có; địa chỉ đường hầm trong ảnh đã chết từ 15:38 | `milestone-3-proposal-t12.png` |
| A: ảnh trang xác nhận sau khi ghi | Có; băng "Đã ghi thay đổi vào T-12 ở lần gửi thứ 1." | `milestone-3-confirm-t12.png` |
| A: T-12 sau khi ghi (người phụ trách, hạn, phiên bản) và số lần ghi | `NV-04`, hạn 2026-11-27, phiên bản 2, `so lan ghi that: 1`; trợ lý hiểu "thứ Sáu" là thứ Sáu tuần này, 27/11, và tự nói hạn mới sớm hơn hạn cũ 2/12 | `tasks.sqlite` |
| A: số dòng vết theo `--proposal` | 3: soạn và gửi cùng mang `task.change_task_assignee_or_due.staff`, lệnh ghi `WRITE.SEND` với `tries` bằng 1; Gửi lúc 08:37:20.938Z, ghi xong 11 mili giây sau | `scratch/milestone-3/trace-a.txt` |
| D: credit trước và sau | Sau cả A và D: nạp thêm 481, ô đăng ký "19 / 500". Từ sau B tới đây phần nạp thêm giảm 6, là tổng của A và D | Trang tài khoản Thổ Thần |
| D: trợ lý giữ nguyên hay viết lại câu nêu trường bị ẩn | Viết lại: "số điện thoại cá nhân không hiển thị với quyền của bạn, cùng với địa chỉ nhà" | - |
| D: ảnh câu trả lời, chỉ có email công việc | Có; chỉ `minh.vu@lab.example`, không chữ số nào của số điện thoại | `milestone-3-phone-minh.png` |
| D: mã luật trong vết | `find_employee` `ok`, `employee.fields.staff` lúc 08:37:47Z | Bảng vết |
| Kiểm tra sau khi tắt, xoay khoá, skill đã xoá | `curl.exe` thoát mã 7, 0 tiến trình `cloudflared`; `seed-keys --rotate` lúc 08:38:44Z và hai khoá của phiên có giờ thu hồi; người thực tập đã xoá skill | - |

Credit cả hai phiên: phần nạp thêm giảm 2 ở kịch bản C (có thể chưa tính câu hỏi đầu), 3 ở B, và 6 cho A cộng D.
Ở cả bốn lần đọc, số bên trái của ô đăng ký tăng đúng bằng số nạp thêm giảm, nên tổng hai số luôn là 500.

Phiên 2 cho thấy hai điều nhỏ:

- Ở kịch bản B, trợ lý tự gọi `get_task` và `find_employee` trước khi soạn, nên Nam vẫn thấy thông tin T-12 mà vai thực tập được đọc; chỉ việc đổi bị chặn.
  Trợ lý còn đề nghị soạn đề xuất cho trường khác, đúng với bộ luật nhưng là gợi ý mà kịch bản không đòi.
- Ở kịch bản A, chị Hoa bấm Gửi và lệnh ghi xong 11 mili giây sau, nên băng "Cổng chưa gửi lệnh ghi" không kịp hiện.

![Kịch bản B: Nam bị từ chối, không có link](milestone-3-refused-nam.png)

![Kịch bản A: trợ lý soạn đề xuất cho T-12 và trả link xác nhận](milestone-3-proposal-t12.png)

![Kịch bản A: trang xác nhận sau khi ghi](milestone-3-confirm-t12.png)

![Kịch bản D: chỉ có email công việc, số điện thoại bị ẩn](milestone-3-phone-minh.png)

Ảnh của phiên 1 nằm ở mục 14.3, cùng bảng vết dạng chữ thay cho ảnh vết.
Ảnh nằm cạnh tài liệu và đi cùng commit; log thô ở `scratch/milestone-3/` thì không.
Kiểm tra lại từng ảnh trước khi `git add`: không có khoá, không có email thật, không có địa chỉ đường hầm còn sống.

### 14.3. Điều phiên 1 cho thấy

Vết của đề xuất, lấy bằng `npm run trace -- --proposal dx-e74baed0d1333996` (giờ UTC, rút gọn cột):

```
08:12:42.496Z  mcp  propose_task_change  T-5  ok  NEEDS_APPROVAL  task.change_task_assignee_or_due.staff.bulk
08:14:06.961Z  web  proposal_send        T-5  ok  -               task.change_task_assignee_or_due.staff.bulk
08:15:26.830Z  web  proposal_approve     T-5  ok  -               WEB.APPROVE
08:15:27.0..Z  web  write_command        30 dòng T-5 tới T-34, ok, WRITE.SEND, tries 1
```

Năm điều phiên này cho thấy:

1. Trợ lý đếm sai cả hai lần, dù `list_tasks` trả đúng dữ liệu.
   Lần đầu nó nói 8 task đã xong, 9 đang làm, 17 chưa làm; dữ liệu thật là 4, 10 và 20.
   Lần sau nó nói 9 đang làm và 21 chưa làm; dữ liệu thật là 10 và 20.
   Đề xuất vẫn đúng 30 task, vì trợ lý chỉ gửi mã task, còn cổng tự đọc lại giá trị hiện tại của từng task để dựng trang xác nhận và trang duyệt.
   Vì vậy người dùng phải tin số trên trang của cổng, không tin số trong câu chat.
2. Câu mẫu "chuyển hết 30 task" làm trợ lý hỏi lại, vì chị Lan có 34 task; câu thứ hai ở mục 7 là câu cho lần chạy sau.
3. Một lần gọi 30 mã đã chạm ngưỡng duyệt hàng loạt, nên bộ đếm tách nhỏ chưa được thử trên host thật.
4. Hàng đợi ghi chạy 30 lệnh trong khoảng 0,2 giây, nên không ai kịp thấy tiến độ dở trên hệ thống giả.
   Băng tiến độ chỉ có ích khi hệ thống đích chậm; phép thử ngắt 20 giây ở mục 2.2 mới là bằng chứng cho phần đó.
5. Trang duyệt chỉ có một ô chữ, là lý do từ chối.
   Người thực tập trong vai anh Quang gõ "ok luon em" vào ô đó rồi bấm Duyệt, vì không có chỗ ghi chú khi duyệt.
   Ô đó nằm trong form Từ chối, nên bấm Duyệt không gửi nó đi và dữ liệu không sai, nhưng giao diện dễ làm người duyệt hiểu nhầm.

Phiên này không tắt cổng giữa chừng, nên phần sập giữa chừng vẫn chỉ có bằng chứng ở mục 2.2.

![Câu hỏi đầu: trợ lý hỏi lại vì chị Lan có 34 task](milestone-3-ai-hoi-lai.png)

![Câu thứ hai: trợ lý soạn đề xuất 30 mục và trả link xác nhận](milestone-3-ai-answer.png)

![Trang xác nhận của chị Hoa sau khi bấm Gửi](milestone-3-hoa-confirm.png)

![Hộp Chờ tôi duyệt của anh Quang](milestone-3-cho-duyet.png)

![Trang duyệt 30 mục trước khi bấm Duyệt](milestone-3-quang-approval.png)

![Trang duyệt sau khi ghi xong 30 trên 30](milestone-3-progress.png)

**Kết luận:** hai bảng ở mục 14.1 và 14.2 là nơi duy nhất giữ bằng chứng của hai phiên, còn mục này giữ vết và ảnh của phiên 1; tài liệu không giữ khoá hay địa chỉ đường hầm còn sống.

## 15. Điều kiện đạt của mốc 3

Đánh dấu từng dòng sau khi đã có bằng chứng tương ứng.

Phần máy:

- [x] `npm test` chạy 442 phép thử, 442 qua, 0 hỏng.
- [x] Ba lần tắt cổng ở ba thời điểm đều cho đủ 30 task, mỗi task đúng một lần ghi.
- [x] Danh sách task tắt 20 giây không làm cổng cần khởi động lại.
- [x] M5 của lõi `outbox.ts` là 267 dòng mã trên 319 dòng vật lý, đã ghi cách đếm.
- [x] Q1 giữ phương án 1A, với phạm vi chỉ là hàng đợi lệnh ghi trên hệ thống giả.

Phiên 1, kịch bản C:

- [x] Kịch bản C chạy trong Thổ Thần desktop: chị Hoa nhận đề xuất 30 mục và link xác nhận.
- [x] Đề xuất 30 mục dừng chờ duyệt, dù trợ lý gọi một lần hay chia nhỏ, và chưa có task nào bị ghi trước khi anh Quang bấm Duyệt.
- [x] Anh Quang thấy đề xuất trong hộp "Chờ tôi duyệt" và bấm Duyệt được.
- [x] Tiến độ kết thúc ở 30 trên 30; 30 task T-5 tới T-34 có `NV-04`, phiên bản 2, mỗi task một lần ghi.
- [x] Vết theo `--proposal` có đủ 33 dòng: soạn, gửi, duyệt và 30 lệnh ghi.

Phiên 2, kịch bản A, B, D:

- [x] B: Nam bị từ chối với `NOT_PERMITTED`, được chỉ tới anh Quang, và không có link.
- [x] A: chị Hoa nhận đề xuất và link, bấm Gửi mà không cần duyệt, và T-12 có `NV-04`, phiên bản 2, đúng một lần ghi.
- [x] A: vết theo `--proposal` có đủ ba dòng: soạn, gửi và một lệnh ghi.
- [x] D: câu trả lời chỉ có email công việc, nói rõ số điện thoại cá nhân bị ẩn, và không có chữ số nào của số điện thoại.

Cả hai phiên:

- [x] Credit trước và sau từng kịch bản đã ghi, riêng A và D chỉ có tổng vì không đọc credit giữa hai kịch bản; không lúc nào còn dưới 100 credit.
- [x] Mười ảnh đã che khoá và email thật, nằm cạnh tài liệu.
- [x] Sau mỗi phiên, đường hầm đã tắt, ba dịch vụ đã tắt, skill đã xoá và khoá đã xoay.
- [x] Mục 14 ghi rõ H12 (#73) không được kiểm lại.

Nếu một dòng không đánh dấu được, #84 vẫn mở và ghi lý do vào phần cuối tài liệu này.
Sau khi đủ, cập nhật dòng mốc 3 ở [tổng hợp, mục 8](../findings.md#8-bước-tiếp-theo) và tick các ô trong #84.

**Kết luận:** mốc 3 chỉ đạt khi mọi dòng trên có bằng chứng, không chỉ khi trang tiến độ trông đúng.

## 16. Khi gặp lỗi

| Hiện tượng | Nguyên nhân thường gặp | Việc làm |
| --- | --- | --- |
| Trợ lý gọi `propose_task_change` 30 lần, mỗi lần một task | Mô hình không gộp, hoặc câu trả lời của `list_tasks` quá dài | Ghi lại số lần gọi và mã luật; cả hai trường hợp đều phải dừng ở bước duyệt. Không sửa mã trong phiên |
| Trợ lý nói task đã được chuyển | Mô hình viết lại câu của cổng | Mở trang xác nhận; trang của cổng là nguồn sự thật |
| Link xác nhận báo lỗi 1033 hoặc 530 | Đường hầm đã tắt hoặc cổng đã dừng | Mở phiên mới bằng `npm run tunnel`, rồi nhờ AI soạn lại |
| Trang đăng nhập từ chối mật khẩu | Dán khoá `lab_` thay vì mật khẩu trang `trang_`, hoặc mật khẩu đã bị thu hồi | Dùng mật khẩu trang mà `seed-keys` đã in; mất thì chạy `npm run keys -- page-password --employee <mã>` |
| Hộp "Chờ tôi duyệt" rỗng | Sai vai, sai phòng, người duyệt là người yêu cầu, hoặc đề xuất đã quá hạn | Kiểm bốn điều ở mục 9 |
| Trang duyệt báo `CONTENT_CHANGED` | Nội dung đề xuất không còn khớp dấu vân tay | Nhờ AI soạn lại; không sửa tay |
| Tiến độ dừng ở một số nhỏ | Hệ thống task tắt, hoặc một mục bị `TARGET_CHANGED` | Chờ cổng gửi lại; nếu vẫn dừng, đọc vết và cột Kết quả |
| Kịch bản A đòi chờ duyệt, mã luật `.cumulative` | A chạy trên dữ liệu còn đề xuất của kịch bản C | Đóng phiên, làm lại mục 13.1 từ bước xoá `lab/.data` |
| Đề xuất của A chỉ đổi hạn, không đổi người phụ trách | T-12 đã thuộc anh Minh, vì dữ liệu chưa sạch | Như dòng trên |
| Kịch bản D có số điện thoại | Cổng lọt trường bị cấm | Dừng phiên, chụp ảnh, mở issue `bug`; không chạy tiếp |
| Credit tụt nhanh hoặc còn dưới 100 | Trợ lý gọi tool nhiều lần | Dừng, ghi số credit, báo lại trước khi chạy tiếp |
| Hết 45 phút giữa lúc đang hỏi | Hẹn giờ tự tắt | Ghi giờ, đóng phiên, mở phiên mới; không nâng giới hạn quá 45 phút |

**Kết luận:** mọi lỗi dừng ở một trong năm chỗ: khoá, địa chỉ, quyền duyệt, dữ liệu chưa sạch, hoặc hệ thống đích; không sửa mã Lab trong lúc chạy nghiệm thu.

## 17. Việc tiếp theo

| Việc | Vì sao | Cách kiểm |
| --- | --- | --- |
| Thêm ô ghi chú khi duyệt, hoặc ghi rõ ô lý do chỉ dùng khi từ chối | Người duyệt gõ lời đồng ý vào ô lý do từ chối (mục 14.3) | Phép thử trang duyệt; người duyệt không còn gõ nhầm ô |
| Đóng [#84](https://github.com/Park-Hip/agentlize-intern/issues/84) | Mục 14 đã đủ và mục 15 đã tick mọi dòng | PR ghi `Closes #84` được merge |
| Chạy lại H12 (#73) trước lần nghiệm thu sau | Bản Thổ Thần 2026-11-18 có thể đổi hành vi MCP | Cắm probe qua đường hầm, gọi `whoami` và `fake_write` |
| Đo M5 đầy đủ khi thêm hệ thống thứ ba | M5 không chỉ là dòng mã của một tệp | Đếm tiến trình, file cấu hình, bước cài và chỗ sửa luật |

**Kết luận:** bốn kịch bản đã đạt trong Thổ Thần desktop trên bản hiện tại, nên mốc 3 đóng; việc còn lại là sửa giao diện trang duyệt và kiểm lại H12.
