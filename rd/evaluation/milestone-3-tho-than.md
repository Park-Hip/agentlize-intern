# Nghiệm thu mốc 3 trong Thổ Thần

Ngày: 2026-11-20. Trạng thái: bản nháp; phần chạy máy đã xong, phiên kịch bản C trong Thổ Thần desktop chưa chạy.

## Đọc nhanh

- Vấn đề: chị Hoa cần chuyển 30 task của chị Lan sang anh Minh; việc này phải chờ anh Quang duyệt, và cổng phải ghi đủ 30 task dù bị tắt giữa chừng.
- Cách kiểm: chạy kịch bản C trong Thổ Thần desktop qua một đường hầm tạm, rồi đọc trang xác nhận, hộp chờ duyệt, tiến độ và vết.
- Phần đã xong: 420 phép thử tự động đều qua, gồm ba lần tắt cổng và một lần danh sách task tắt 20 giây; Q1 giữ phương án 1A (cổng tự giữ hàng đợi lệnh ghi).
- Phần còn lại: phiên chạy thật trong Thổ Thần desktop, ảnh, số credit trước và sau, và bản Thổ Thần đã dùng.
- Tiếp theo: người thực tập chạy mục 4 tới mục 12, điền các ô "Chưa chạy: điền sau phiên", rồi đóng #84.

## 1. Mốc 3 cần chứng minh gì

Mốc 3 đòi kịch bản C chạy trong Thổ Thần, phần sập giữa chừng của SR6 (không ghi trùng), SR4 (điểm dừng rủi ro), SR7 (vết xuyên suốt) và câu trả lời Q1 (sập giữa chừng, chạy lại có đủ?) ([spec, mục 9](../design/mvp-spec.md#9-bốn-mốc)).
Kịch bản C là chị Hoa nhờ AI chuyển toàn bộ 30 task đang mở của chị Lan sang anh Minh ([spec, mục 2.2](../design/mvp-spec.md#22-bốn-kịch-bản-phải-chạy-trong-thổ-thần)).
Đề xuất phải dừng ở bước duyệt, anh Quang bấm Duyệt trên trang của cổng, rồi cổng ghi từng task một và hiện tiến độ.
Phiên chạy thật chưa xảy ra, nên tài liệu này tách rõ hai phần: phần máy đã chạy ở mục 2 và phần chờ phiên ở mục 3 tới mục 12.
Mục 13 là nơi duy nhất điền kết quả phiên; mục nào còn "Chưa chạy: điền sau phiên" thì mốc 3 chưa đóng.

**Kết luận:** phần máy đã có bằng chứng, nhưng mốc 3 chỉ đóng khi mục 13 có đủ bằng chứng của phiên Thổ Thần desktop.

## 2. Phần đã chạy bằng máy

### 2.1. Toàn bộ phép thử

Chạy trong `lab/`:

```
npm run lint
npm test
```

Kết quả ngày 2026-11-19:

- `npm run lint`: không lỗi.
- `npm test`: build xong, in `# tests 420`, `# pass 420`, `# fail 0`, khoảng 45 giây (44,8 giây lần đầu, 46,5 giây lần chạy lại).
- Con số 420 gồm 337 nhóm cấp một và các phép thử con bên trong.

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

M5 là chỉ số độ phức tạp vận hành: số tiến trình, số file cấu hình, số bước cài và số chỗ phải sửa khi đổi một luật ([spec, mục 8.3](../design/mvp-spec.md#83-số-đo-đầu-tiên)).
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

Q1 hỏi: đang chuyển 30 task mà ứng dụng sập thì chạy lại có đủ và không trùng không ([câu hỏi kiểm chứng, A.1](../design/research-questions-and-validation-plan.md#a1-q1-sập-giữa-chừng)).
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

Làm đủ các việc dưới đây rồi mới mở đường hầm.
Mỗi ô "Đạt khi" là một điều kiện dừng: không đạt thì chưa chạy.

Credit là hạn mức trả tiền cho các câu hỏi trong Thổ Thần; mỗi câu hỏi trừ một ít.

| Việc | Cách làm | Đạt khi |
| --- | --- | --- |
| Bản mã mới | Trong `lab/`: `npm install`, `npm run lint`, `npm test` | Lint không lỗi, test in `# fail 0` |
| Dữ liệu sạch cho kịch bản C | Dừng mọi dịch vụ Lab, xoá thư mục `lab/.data` (toàn bộ là dữ liệu giả) | Chị Lan còn đúng 30 task đang mở là T-5 tới T-34 |
| Hạn mức còn đủ | Mở trang tài khoản Thổ Thần, ghi số credit trước phiên | Còn ít nhất 100 credit trước khi hỏi câu đầu tiên |
| Bản Thổ Thần đã dùng | Mở phần Giới thiệu hoặc Cài đặt của Thổ Thần desktop, ghi số bản dựng | Có số bản dựng để điền vào mục 13 |
| Chỗ lưu bằng chứng | Tạo `scratch/milestone-3/` cho log thô và ảnh chưa che | Log thô nằm ngoài git; tên ảnh theo mẫu `milestone-3-*.png` |
| Hai cửa sổ lệnh | Một cửa sổ chạy đường hầm, một cửa sổ chạy lệnh lấy khoá và đọc vết | Cả hai đang ở thư mục `lab/` |
| H12 (bản Thổ Thần 2026-11-18 có giữ hành vi MCP cũ không) | Không chạy lại trong phiên này, vì #73 tạm hoãn | Ghi rõ "không kiểm lại H12" vào mục 13 |

Xoá `lab/.data` là xoá dữ liệu giả của Lab, không phải dữ liệu thật.
Nếu cần giữ vết của phiên trước để đối chiếu, đổi `LAB_DATA_DIR` sang một thư mục khác thay vì xoá.
Log thô, ảnh chưa che và mọi thứ có khoá chỉ nằm trong `scratch/`.
Ảnh đã che khoá và email thật được commit cạnh tài liệu này.

Không dán khoá vào chat, vào file, vào ảnh chụp hay vào lịch sử lệnh.
Không chụp màn hình form đang mở, vì ô API Key hiện nguyên khoá.

**Kết luận:** chỉ mở phiên khi dữ liệu sạch, credit còn từ 100 trở lên, và đã biết bản Thổ Thần đang dùng.

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

Ghi giờ mở và credit trước khi hỏi câu đầu tiên vào mục 13.

**Kết luận:** địa chỉ in ra là đường công khai của cổng Lab, chỉ sống tối đa 45 phút, và chỉ dùng cho skill trong phiên này.

## 6. Cài skill trong Thổ Thần desktop

Skill (mục nối) là một mục trong phần cài đặt của Thổ Thần, nói cho trợ lý biết máy chủ công cụ ở đâu.

1. Mở phần cài đặt skill, thêm một skill kiểu Streamable HTTP (MCP, chuẩn chung để nhiều phần mềm gọi cùng bộ công cụ, qua HTTPS, mỗi lời gọi một request).

   | Ô trong form | Giá trị |
   | --- | --- |
   | Tên | `lab-gateway` (hoặc tên khác, ghi lại ở mục 13) |
   | Địa chỉ | `<địa chỉ in ở mục 5>/mcp`, phải có `/mcp` ở cuối |
   | Kiểu xác thực | API Key |
   | Khoá | Khoá `lab_` của chị Hoa (`NV-02`) |

2. Lưu, rồi bấm kiểm tra kết nối.
   Danh sách phải có đủ sáu tool: `find_employee`, `get_task`, `list_tasks`, `propose_task_change`, `propose_employee_change` và `get_request_status`.
   Không có tool nào xác nhận, duyệt hay ghi trực tiếp.
3. Không chụp màn hình form đang mở, vì ô API Key hiện nguyên khoá.
   Ảnh duy nhất được chụp ở bước này là danh sách tool sau khi lưu, nếu cần.
4. Nếu kiểm tra kết nối hỏng, xem mục 15 trước khi sửa gì.

Ghi số bản dựng Thổ Thần và tên skill vào mục 13.

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
| Số lần gọi `propose_task_change` | Chưa chạy: điền sau phiên |
| Nếu một lần: có đủ 30 mã T-5 tới T-34 không | Chưa chạy: điền sau phiên |
| Nếu nhiều lần: mỗi lần bao nhiêu mã, và lần đầu tiên chạm ngưỡng 5 là lần nào | Chưa chạy: điền sau phiên |
| Mã luật của lần soạn (`...staff.bulk` hay `...staff.cumulative`) | Chưa chạy: điền sau phiên |
| Bộ đếm tách nhỏ có bật không | Chưa chạy: điền sau phiên |
| Mã đề xuất `dx-...` | Chưa chạy: điền sau phiên |

Bộ đếm tách nhỏ (cumulative) là phép cộng các mục cùng loại việc, cùng người yêu cầu, trong 60 phút, để AI chia nhỏ thành nhiều lần gọi thì từ lần chạm ngưỡng vẫn phải chờ duyệt ([ADR-0007, mục 3.4](../../docs/adr/adr-0007-system-adapters-and-change-sets.md#34-chặn-tách-nhỏ-để-né-duyệt)).
Nếu trợ lý gọi một lần với 30 mã, mã luật trong vết là `task.change_task_assignee_or_due.staff.bulk`.
Nếu trợ lý gọi nhiều lần, lần sau có thể mang mã `task.change_task_assignee_or_due.staff.cumulative`.
Kịch bản C đạt khi cả 30 mục dừng ở bước duyệt, dù trợ lý gọi một lần với 30 mã hay chia thành nhiều lần gọi.
Nếu trợ lý gọi nhiều lần, bộ đếm tách nhỏ cộng các mục cùng việc trong 60 phút, nên các lần chạm ngưỡng vẫn phải chờ duyệt.
Số lần gọi và mã luật của từng lần được ghi ở mục 13.

Chụp toàn bộ khung trả lời, che email thật của tài khoản ở góc trên và che mọi khoá nếu tình cờ lọt vào khung.

**Kết luận:** dù trợ lý gọi một lần hay chia nhỏ, cả 30 mục phải dừng ở bước duyệt trước khi ghi; câu trả lời phải để link xác nhận trên một dòng riêng, và số lần gọi được ghi lại ở mục 13.

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

Ghi giờ bấm Gửi và nguyên văn băng trên trang vào mục 13.
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
Ghi giờ bấm Duyệt vào mục 13.

**Kết luận:** chỉ anh Quang, đúng vai trưởng nhóm cùng phòng và khác người yêu cầu, mở được và bấm được nút Duyệt.

## 10. Kịch bản C, bước 4: tiến độ tới 30 trên 30

Trang tự làm mới mỗi 2 giây khi còn mục đang chạy.
Đạt khi thấy băng tiến độ dạng "Đang chạy nền: đã chuyển 17 trên 30 mục" và cuối cùng là "Xong hết: đã ghi 30 trên 30 mục".
Nếu có mục phải gửi lại, trang hiện thêm cột "Lần gửi lại kế tiếp"; cột này chỉ hiện khi thật sự có mục đang chờ gửi lại.

Chụp hai ảnh: một ảnh lúc tiến độ còn dở, một ảnh lúc 30 trên 30.
Nếu không kịp chụp lúc dở, ghi rõ trong mục 13 là chỉ có ảnh cuối.

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
| Chị Hoa bấm Gửi | `proposal_send` | `web` | `ok` | `WEB.CONFIRM` |
| Anh Quang bấm Duyệt | `proposal_approve` | `web` | `ok` | `WEB.APPROVE` |
| 30 lệnh ghi | `write_command` | `web` | `ok` | `WRITE.SEND` |

Ba dòng đầu là ba bước của một đề xuất; 30 dòng cuối là một dòng cho mỗi task T-5 tới T-34.
Mỗi dòng ghi có mã chống ghi trùng `<mã đề xuất>:<vị trí>`, cột `tries` bằng 1, và cột `object` là mã task.
Tổng cộng 33 dòng cho một đề xuất đã ghi xong.

`npm run trace -- --task T-12` chỉ thấy dòng ghi của T-12, vì dòng soạn đề xuất mang đối tượng là mục đầu tiên T-5.
Muốn thấy cả chuỗi thì dùng `--proposal`, không dùng `--task`.

Chép nguyên bảng vết vào `scratch/milestone-3/trace.txt`, rồi chụp bảng đã che (nếu cần).
Bảng vết không có tên, email, số điện thoại hay khoá.

**Kết luận:** một đề xuất 30 mục để lại đúng 33 dòng vết, đủ chuỗi soạn, gửi, duyệt và 30 lần ghi.

## 12. Đóng phiên

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
6. Ghi credit sau cùng và số credit đã dùng vào mục 13.
   Nếu còn dưới 100 credit thì dừng và ghi rõ lý do.
7. Không xoá thư mục `lab/.data` nếu còn cần đối chiếu vết.

**Kết luận:** phiên chỉ đóng khi đường hầm tắt, ba dịch vụ tắt, skill trả về như cũ và khoá đã xoay.

## 13. Chỗ điền bằng chứng

Điền mọi ô dưới đây sau khi chạy.
Để trống ô nào là chưa nghiệm thu xong mục đó.
Không điền khoá, mật khẩu trang, địa chỉ đường hầm còn sống hay email thật.

| Bằng chứng | Giá trị | Nơi lưu |
| --- | --- | --- |
| Giờ mở phiên | Chưa chạy: điền sau phiên | `gateway.sqlite`, bảng `trace` |
| Bản Thổ Thần desktop đã dùng | Chưa chạy: điền sau phiên | Ảnh hoặc ghi chú trong `scratch/milestone-3/` |
| Credit trước phiên | Chưa chạy: điền sau phiên | Trang tài khoản Thổ Thần |
| Tên skill đã thêm (không chép địa chỉ đường hầm) | Chưa chạy: điền sau phiên | - |
| Ảnh câu trả lời của AI, đã che email thật | Chưa chạy: điền sau phiên | `milestone-3-ai-answer.png` |
| Số lần gọi `propose_task_change` và số mã mỗi lần | Chưa chạy: điền sau phiên | Bảng vết |
| Bộ đếm tách nhỏ có bật không, mã luật `.bulk` hay `.cumulative`, và từ lần gọi thứ mấy | Chưa chạy: điền sau phiên | Bảng vết |
| Mã đề xuất `dx-...` | Chưa chạy: điền sau phiên | - |
| Ảnh trang xác nhận của chị Hoa sau khi bấm Gửi | Chưa chạy: điền sau phiên | `milestone-3-hoa-confirm.png` |
| Ảnh hộp "Chờ tôi duyệt" của anh Quang | Chưa chạy: điền sau phiên | `milestone-3-cho-duyet.png` |
| Ảnh trang duyệt 30 mục trước khi bấm Duyệt | Chưa chạy: điền sau phiên | `milestone-3-quang-approval.png` |
| Ảnh tiến độ lúc còn dở và lúc 30 trên 30 | Chưa chạy: điền sau phiên | `milestone-3-progress.png` |
| Ảnh bảng vết theo `--proposal` | Chưa chạy: điền sau phiên | `milestone-3-trace.png` |
| Số dòng vết của đề xuất | Chưa chạy: điền sau phiên | `scratch/milestone-3/trace.txt` |
| Kết quả đối chiếu 30 task: `NV-04`, phiên bản 2, 30 lần ghi | Chưa chạy: điền sau phiên | `tasks.sqlite` |
| Credit sau phiên và số credit đã dùng | Chưa chạy: điền sau phiên | Trang tài khoản Thổ Thần |
| Giờ tắt phiên và số phút đã chạy | Chưa chạy: điền sau phiên | - |
| Kiểm tra sau khi tắt: `curl.exe` hỏng, không còn `cloudflared` | Chưa chạy: điền sau phiên | - |
| Xoay khoá và kiểm `npm run keys -- list` | Chưa chạy: điền sau phiên | - |
| H12 (#73) có được kiểm lại không | Không kiểm lại trong phiên này; #73 tạm hoãn | - |

Sau khi chạy, dán sáu ảnh đã che vào cuối mục này bằng `![Mô tả](tên-ảnh.png)`.
Ảnh nằm cạnh tài liệu và đi cùng commit; log thô ở `scratch/milestone-3/` thì không.
Kiểm tra lại từng ảnh trước khi `git add`: không có khoá, không có email thật, không có địa chỉ đường hầm còn sống.

**Kết luận:** bảng này là nơi duy nhất giữ bằng chứng của phiên; tài liệu chỉ giữ số, ảnh đã che và đường dẫn, không giữ khoá hay địa chỉ đường hầm.

## 14. Điều kiện đạt của mốc 3

Đánh dấu từng dòng sau khi đã có bằng chứng tương ứng.

- [x] `npm test` chạy 420 phép thử, 420 qua, 0 hỏng.
- [x] Ba lần tắt cổng ở ba thời điểm đều cho đủ 30 task, mỗi task đúng một lần ghi.
- [x] Danh sách task tắt 20 giây không làm cổng cần khởi động lại.
- [x] M5 của lõi `outbox.ts` là 267 dòng mã trên 319 dòng vật lý, đã ghi cách đếm.
- [x] Q1 giữ phương án 1A, với phạm vi chỉ là hàng đợi lệnh ghi trên hệ thống giả.
- [ ] Kịch bản C chạy trong Thổ Thần desktop: chị Hoa nhận đề xuất 30 mục và link xác nhận.
- [ ] Đề xuất 30 mục dừng chờ duyệt, dù trợ lý gọi một lần hay chia nhỏ, và chưa có task nào bị ghi trước khi anh Quang bấm Duyệt.
- [ ] Anh Quang thấy đề xuất trong hộp "Chờ tôi duyệt" và bấm Duyệt được.
- [ ] Tiến độ kết thúc ở 30 trên 30; 30 task T-5 tới T-34 có `NV-04`, phiên bản 2, mỗi task một lần ghi.
- [ ] Vết theo `--proposal` có đủ 33 dòng: soạn, gửi, duyệt và 30 lệnh ghi.
- [ ] Credit trước và sau phiên đã ghi; không còn dưới 100 credit.
- [ ] Sáu ảnh đã che khoá và email thật, nằm cạnh tài liệu.
- [ ] Đường hầm đã tắt, ba dịch vụ đã tắt, skill đã xoá và khoá đã xoay.
- [ ] Mục 13 ghi rõ H12 (#73) không được kiểm lại.

Nếu một dòng không đánh dấu được, #84 vẫn mở và ghi lý do vào phần cuối tài liệu này.
Sau khi đủ, cập nhật dòng mốc 3 ở [tổng hợp, mục 8](../findings.md#8-bước-tiếp-theo) và tick các ô trong #84.

**Kết luận:** mốc 3 chỉ đạt khi cả 14 dòng trên có bằng chứng, không chỉ khi trang tiến độ trông đúng.

## 15. Khi gặp lỗi

| Hiện tượng | Nguyên nhân thường gặp | Việc làm |
| --- | --- | --- |
| Trợ lý gọi `propose_task_change` 30 lần, mỗi lần một task | Mô hình không gộp, hoặc câu trả lời của `list_tasks` quá dài | Ghi lại số lần gọi và mã luật; cả hai trường hợp đều phải dừng ở bước duyệt. Không sửa mã trong phiên |
| Trợ lý nói task đã được chuyển | Mô hình viết lại câu của cổng | Mở trang xác nhận; trang của cổng là nguồn sự thật |
| Link xác nhận báo lỗi 1033 hoặc 530 | Đường hầm đã tắt hoặc cổng đã dừng | Mở phiên mới bằng `npm run tunnel`, rồi nhờ AI soạn lại |
| Trang đăng nhập từ chối mật khẩu | Dán khoá `lab_` thay vì mật khẩu trang `trang_`, hoặc mật khẩu đã bị thu hồi | Dùng mật khẩu trang mà `seed-keys` đã in; mất thì chạy `npm run keys -- page-password --employee <mã>` |
| Hộp "Chờ tôi duyệt" rỗng | Sai vai, sai phòng, người duyệt là người yêu cầu, hoặc đề xuất đã quá hạn | Kiểm bốn điều ở mục 9 |
| Trang duyệt báo `CONTENT_CHANGED` | Nội dung đề xuất không còn khớp dấu vân tay | Nhờ AI soạn lại; không sửa tay |
| Tiến độ dừng ở một số nhỏ | Hệ thống task tắt, hoặc một mục bị `TARGET_CHANGED` | Chờ cổng gửi lại; nếu vẫn dừng, đọc vết và cột Kết quả |
| Credit tụt nhanh hoặc còn dưới 100 | Trợ lý gọi tool nhiều lần | Dừng, ghi số credit, báo lại trước khi chạy tiếp |
| Hết 45 phút giữa lúc đang hỏi | Hẹn giờ tự tắt | Ghi giờ, đóng phiên, mở phiên mới; không nâng giới hạn quá 45 phút |

**Kết luận:** mọi lỗi dừng ở một trong bốn chỗ: khoá, địa chỉ, quyền duyệt, hoặc hệ thống đích; không sửa mã Lab trong lúc chạy nghiệm thu.

## 16. Việc tiếp theo

| Việc | Vì sao | Cách kiểm |
| --- | --- | --- |
| Chạy kịch bản C trong Thổ Thần desktop và điền mục 13 | Đây là phần còn lại của mốc 3 | Ảnh, vết và số credit như mục 7 tới mục 12 |
| Đóng [#84](https://github.com/Park-Hip/agentlize-intern/issues/84) sau khi mục 13 đủ | Issue chỉ đóng khi có bằng chứng phiên thật | Tick đủ 14 dòng ở mục 14 |
| Chạy lại H12 (#73) trước lần nghiệm thu sau | Bản Thổ Thần 2026-11-18 có thể đổi hành vi MCP | Cắm probe qua đường hầm, gọi `whoami` và `fake_write` |
| Đo M5 đầy đủ khi thêm hệ thống thứ ba | M5 không chỉ là dòng mã của một tệp | Đếm tiến trình, file cấu hình, bước cài và chỗ sửa luật |

**Kết luận:** mốc 3 còn đúng một việc lớn là phiên Thổ Thần desktop; phần máy và câu trả lời Q1 đã sẵn sàng để đối chiếu.
