# ADR-0005: Danh tính người yêu cầu

Ngày: 2026-11-17. Trạng thái: đã chấp nhận.

Quyết định 3 trong [spec bản thử, mục 6](../../rd/design/mvp-spec.md#6-kiến-trúc-tóm-tắt).

## Đọc nhanh

- Vấn đề: AI trong Thổ Thần có thể gọi công cụ thay nhiều người, nhưng cổng chưa có cách chắc chắn biết ai đang nhờ.
- Quyết định: mỗi người một khoá riêng, gửi kèm mọi lời gọi; cổng đổi khoá thành mã nhân viên, kiểm ở mỗi lần gọi và thu hồi được.
- Lời gọi chat qua HTTPS có kèm mã tài khoản của người dùng, nhưng phiên đo mới thấy nó ở một tài khoản và chưa chứng minh người dùng không tự đặt được.
- Vì vậy bản thử không dùng mã tài khoản để cấp quyền; cách dùng nó làm lớp kiểm thứ hai được ghi sẵn với ba điều kiện, và chỉ bật khi cả ba đều đúng.
- Việc tiếp theo: hỏi Kevin về chữ ký, dải IP và cách chia sẻ skill, chạy hai phép kiểm về ghi đè và tách phiên, rồi mới mở issue cho lớp thứ hai.

## 1. Bối cảnh

Ví dụ xuyên suốt: chị Hoa nhờ AI chuyển T-12 sang anh Minh, Nam gõ đúng câu đó, và anh Quang duyệt việc chuyển 30 task ([spec, mục 3](../../rd/design/mvp-spec.md#3-bản-thử-hôm-nay)).
Cổng phải trả lời đúng một câu: ai đang yêu cầu?
Nếu trả lời sai, SR1 (danh tính và một cửa ghi) sai theo: một người mượn quyền của người khác, và vết chỉ ghi tên tài khoản dịch vụ ([PRD, mục 6](../../rd/problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc)).

Những gì đã đo hoặc đọc được:

- Qua stdio, máy chủ MCP chỉ thấy tên ứng dụng, không thấy tài khoản; khoá riêng đặt trong cấu hình skill thì tới được máy chủ, và đổi khoá có hiệu lực ở lần gọi sau ([kịch bản đo, mục 5.5](../../rd/appota/tho-than-mcp-probe.md#55-khoá-riêng-của-từng-người-h8)).
- Qua HTTPS công khai, chat web và chat desktop đều gọi tool qua máy chủ Thổ Thần ở Singapore, không phải từ máy người dùng ([kịch bản đo, mục 4.8](../../rd/appota/tho-than-mcp-probe.md#48-kết-quả-đo-qua-https-công-khai-ngày-2026-11-17-s1-s6), S2 tới S4).
- Lời gọi tới cổng mang thêm bốn header: `x-user-id` dạng `user_` cộng 24 ký tự, `x-user-email`, `x-agent-id` và `x-executor-id` ([khảo sát Thổ Thần, mục 3.6](../../rd/appota/tho-than-platform.md#36-phép-đo-https-công-khai-2026-11-17)).
- Mã LobeHub 2.1.56, bản gốc của Thổ Thần web, không gắn bốn header này: lời gọi MCP trong chat chỉ mang header do người dùng cấu hình và khoá xác thực, và form cho người dùng tự thêm header bất kỳ ([khảo sát Thổ Thần, mục 6.2](../../rd/appota/tho-than-platform.md#62-lời-gọi-mcp-trong-chat-không-có-danh-tính-do-lobehub-đặt)).
- Vì vậy bốn header đến từ phần Appota thêm vào, từ một proxy, hoặc từ một bản chạy khác tag công khai; chưa đọc được mã đó.
- Phiên đo chỉ có một tài khoản và một skill; chưa biết hai tài khoản có mã khác nhau không, và chưa biết máy chủ Thổ Thần ghi đè hay nối thêm header người dùng tự đặt ([khảo sát Thổ Thần, mục 9](../../rd/appota/tho-than-platform.md#9-câu-hỏi-mở-và-giả-thuyết-kiểm-được), H9 và H10).
- Log gốc của phiên đo không còn trên máy; cái còn lại là bảng tóm tắt có số dòng, nên độ tin cậy của phần header là trung bình ([khảo sát Thổ Thần, mục 3.6](../../rd/appota/tho-than-platform.md#36-phép-đo-https-công-khai-2026-11-17)).

Một điều kiện nữa chưa biết, và nó quyết định mô hình có dùng được trong thực tế hay không: skill do từng người tự thêm, hay quản trị viên chia sẻ một skill cho cả tổ chức ([tổng hợp phát hiện, mục 6](../../rd/findings.md#6-câu-hỏi-còn-mở)).
Nếu cả tổ chức dùng chung một skill và một khoá, khoá không nói được ai đang hỏi.

**Kết luận:** thứ duy nhất Lab chứng minh được hôm nay là khoá riêng tới được cổng và đổi được theo từng người; mã tài khoản của Thổ Thần là một lời khai chưa kiểm chứng, không phải một bằng chứng danh tính.

## 2. Phương án đã xét

| Phương án | Được | Mất | Kết quả |
| --- | --- | --- | --- |
| A. Dùng `x-user-id` làm danh tính chính | Không phải cấp khoá; mỗi người có sẵn một mã tài khoản | Ai có token gọi thẳng endpoint cũng tự đặt được header; LobeHub không bảo đảm header; mới đo một tài khoản; không có bảng nối | Loại |
| B. Chỉ dùng khoá riêng từng người | Chứng minh được hôm nay; thu hồi được; không phụ thuộc Thổ Thần; chạy được cả stdio lẫn HTTPS | Khoá bị lộ hoặc dùng trên máy chung thì người khác thành người sở hữu khoá; không phải một lần đăng nhập | **Chọn** |
| C. Khoá cộng `x-user-id` bắt buộc ngay | Chặn được người khác dùng khoá của chị Hoa trong Thổ Thần, nếu header đáng tin | Ba điều kiện chưa đạt; stdio không có header nên phải miễn trừ; dễ từ chối oan; tạo cảm giác an toàn không có thật | Loại cho bản thử |
| D. Khoá cộng `x-user-id` làm lớp thứ hai, bật sau khi đủ điều kiện | Giữ chỗ nối; chỉ có thể từ chối, không cấp thêm quyền; không chặn mốc 1 | Phải thêm bảng nối, mã lý do và phép thử khi bật; chưa dùng được hôm nay | Để dành, ghi điều kiện ở mục 3 |
| E. Chờ OAuth hoặc header có chữ ký | Đúng hướng dài hạn; danh tính do nền tảng cấp, không do người dùng đặt | Thổ Thần chưa có OAuth cho MCP; Lab không điều khiển được | Để sau, hỏi Kevin |

Hai phương án A và C cùng dựa vào một giả định: header `x-user-id` luôn đúng và không giả được.
Giả định đó chưa có bằng chứng.
Phương án B không cần giả định đó.
Phương án D không dùng header hôm nay, nhưng chuẩn bị chỗ nối để không phải viết lại phần danh tính khi giả định đó được chứng minh.

**Kết luận:** chọn B cho bản thử; D là đường mở rộng có điều kiện, không phải quyết định hôm nay.

## 3. Quyết định

Khoá riêng từng người là danh tính duy nhất của bản thử.
`x-user-id` không được dùng để cấp quyền trong bản thử, kể cả làm lớp kiểm thứ hai.
Lớp thứ hai chỉ được bật khi ba điều kiện ở mục 3.3 đều đạt, và khi đó nó chỉ có thể từ chối, không thể cấp quyền.

### 3.1. Khoá riêng từng người là danh tính chính

- Cổng cấp cho mỗi người một khoá dạng `lab_` cộng 32 byte ngẫu nhiên, mã hoá base64url.
- Cổng chỉ lưu mã băm SHA-256, so sánh thời gian hằng, và chỉ in 6 ký tự đầu trong log ([ADR-0003, mục 2](adr-0003-technology-stack.md#2-quyết-định)).
- Bảng khoá giữ mã khoá, mã băm, sáu ký tự đầu, mã nhân viên, nơi gọi, phạm vi, lúc tạo và lúc thu hồi ([spec, mục 6](../../rd/design/mvp-spec.md#6-kiến-trúc-tóm-tắt)).
- Mỗi lần gọi, cổng đổi khoá thành mã nhân viên và kiểm lại khoá; không có nguồn danh tính nào khác.
- Khoá đi trong `Authorization: Bearer`.
  Chương trình nối stdio đọc `LAB_USER_KEY`; ô "API Key" của Thổ Thần gửi cùng header đó ([kịch bản đo, mục 5.5](../../rd/appota/tho-than-mcp-probe.md#55-khoá-riêng-của-từng-người-h8)).
- Cổng không nhận mã nhân viên, email hay vai do người gọi tự khai trong body hay header.
  Vai và phòng đọc từ danh bạ ở mỗi lần gọi.
- Khoá chứng minh "người đang giữ khoá", không phải một lần đăng nhập.
  Ai dùng máy đó cũng là người sở hữu khoá; đây là giới hạn đã ghi ở [spec, mục 8](../../rd/design/mvp-spec.md#8-giả-định-và-giá-trị-của-kết-luận).
- Thu hồi khoá có hiệu lực ở lần gọi sau.
  Mọi khoá của một người bị lộ phải thu hồi được; đây là lý do khoá là cách chính, không phải header.

Điều kiện vận hành đi kèm: mỗi người phải có cấu hình skill riêng, vì khoá nằm trong cấu hình skill.
Nếu quản trị viên chia sẻ một skill và một khoá cho cả tổ chức, khoá không còn nói được ai đang hỏi.
Khi đó mô hình này sai, và phải chờ một danh tính do nền tảng cấp (mục 3.5).

### 3.2. `x-user-id` không được dùng để cấp quyền trong bản thử

Không dùng, kể cả làm lớp kiểm thứ hai, vì ba điều kiện của [khảo sát Thổ Thần, mục 6.5](../../rd/appota/tho-than-platform.md#65-hệ-quả-cho-adr-0005) đều chưa đạt:

1. **Ghi đè ở mọi lời gọi trong chat.**
   H9 chưa chạy; form skill cho người dùng tự thêm header; chưa biết máy chủ Thổ Thần ghi đè hay nối thêm.
   Nếu nối thêm, người dùng gửi được hai giá trị, và cổng không có cách biết giá trị nào là thật.
2. **Chỉ cổng nhận lời gọi từ máy chủ Thổ Thần.**
   Chưa có chữ ký, chưa có dải IP cố định, và ai có token gọi thẳng endpoint cũng tự đặt được `x-user-id`.
   Header chỉ đáng tin khi lời gọi chắc chắn đi qua máy chủ Thổ Thần.
3. **Có bảng nối mã tài khoản với mã nhân viên ở phía máy chủ.**
   Chưa có bảng này; phiên đo chỉ có một tài khoản, nên chưa biết mã tài khoản có ổn định và tách theo người không (H10).

Dùng header hôm nay sẽ có một trong hai kết quả xấu:

- Nếu bắt buộc header, đường stdio không có header nên phải miễn trừ, và đường HTTPS có thể từ chối oan khi header thiếu.
- Nếu chỉ kiểm khi có header, kẻ tấn công chỉ cần bỏ header để rơi về đường khoá; lớp thứ hai không có tác dụng.

Một lý do nữa: phiên đo chỉ có một tài khoản.
Một mẫu bằng một tài khoản không nói được mã tài khoản là duy nhất theo người, không đổi theo phiên, và không trùng giữa hai người.

Khảo sát Thổ Thần, [mục 6.5](../../rd/appota/tho-than-platform.md#65-hệ-quả-cho-adr-0005) đề nghị bỏ `x-user-id` khỏi ADR nếu thiếu một điều.
Quyết định này không dùng nó để cấp quyền.
Hợp đồng ở mục 3.3 chỉ là điều kiện xem lại, không có hiệu lực cho tới khi cả ba điều kiện đạt.

**Kết luận:** `x-user-id` là một lời khai có ích để kiểm sau, không phải một chứng chỉ dùng để cấp quyền hôm nay.

### 3.3. Hợp đồng của lớp thứ hai, khi và chỉ khi đủ ba điều kiện

Mục này ghi sẵn hình dạng để lần xem lại không phải thiết kế lại.
Nó không phải việc của mốc 1.

**Điều kiện 1: máy chủ Thổ Thần ghi đè, ở mọi lời gọi `tools/call` trong chat.**
Phép kiểm H9: thêm `x-user-id: spoof-test` vào header của skill, gọi `whoami`, xem cổng nhận một giá trị của Thổ Thần hay hai giá trị.
Phép kiểm H10: hai tài khoản cùng skill, so `x-user-id` và `mcp-session-id`.
Điều kiện đạt khi mỗi lời gọi có đúng một `x-user-id`, giá trị là của tài khoản đang đăng nhập, và giá trị đó khác nhau giữa hai tài khoản.

**Điều kiện 2: cổng biết lời gọi đến từ máy chủ Thổ Thần.**
Có ít nhất một trong ba cách: dải IP gọi ra cố định, chữ ký trên header, hoặc một kênh riêng chỉ máy chủ Thổ Thần dùng được.
Nếu không có cách nào, người có khoá gọi thẳng endpoint và tự đặt `x-user-id` sẽ bỏ qua lớp thứ hai.
Khi đó lớp thứ hai chỉ bắt được người khác dùng khoá của chị Hoa bên trong Thổ Thần, không phải toàn bộ rủi ro mất khoá.

**Điều kiện 3: có bảng nối ở phía máy chủ.**
Bảng `platform_accounts` giữ mã tài khoản Thổ Thần, mã nhân viên, lúc tạo và lúc thu hồi.
Mã tài khoản là khoá tra; mã nhân viên là giá trị.
Không dùng email làm khoá tra, vì email đổi được, là dữ liệu cá nhân, và spec đã chốt nhận người theo mã nhân viên.
Bảng do một lệnh quản trị nạp và thu hồi; mã tài khoản thật không nằm trong repo, chỉ truyền lúc chạy.

Khi cả ba điều kiện đạt, lớp thứ hai là một cài đặt `IdentityProvider` thứ hai, tên `ThoThanAccountIdentity`, bọc `ApiKeyIdentity`:

1. Gọi `ApiKeyIdentity` trước.
   Khoá sai hoặc bị thu hồi thì trả lỗi của khoá; không đọc header.
2. Đọc đúng một giá trị `x-user-id` từ header thô.
   Không có: `IDENTITY_MISSING`.
   Có nhiều hơn một, hoặc giá trị chứa dấu phẩy do hai header bị gộp: `IDENTITY_AMBIGUOUS`.
3. Tra bảng `platform_accounts`.
   Không có hoặc đã thu hồi: `IDENTITY_UNKNOWN`.
4. So mã nhân viên của bảng với mã nhân viên của khoá.
   Khác nhau: `IDENTITY_MISMATCH`.
5. Khớp: trả danh tính lấy từ khoá, kèm dấu `account_verified` trong vết.
   Không trả mã tài khoản ra kết quả tool.

Bốn mã mới vào bảng [mã lý do trong `lab/shared`](../../lab/shared/src/reasons.ts) khi lớp này được bật.

Lớp thứ hai chỉ được **từ chối**, không bao giờ **cấp quyền**.
Nó không đổi mã nhân viên, vai hay phạm vi; nó chỉ nói "khoá này và tài khoản này có khớp không".
Vì vậy một header giả không mở thêm quyền, và một header đúng cũng không thay được khoá.

Cổng chọn cài đặt nào cho từng cửa bằng cấu hình, không bằng sự có mặt của header.
Không có chuyện thiếu header thì tự rơi về chỉ kiểm khoá; đó là một đường hạ cấp mà người gọi điều khiển được.
Khi lớp này bật, lời gọi `tools/call` ở cửa `/mcp` thiếu header bị từ chối, không được chạy tiếp.

Lớp này chỉ áp cho lời gọi `tools/call` ở cửa `/mcp`; cửa `/v1/tools` dùng `ApiKeyIdentity` và chỉ nhận khoá của chương trình nối và trợ lý gọi hàm.
Lời gọi `initialize` và `tools/list` không cần danh tính, vì không đụng dữ liệu nghiệp vụ.

Mỗi khoá ghi kênh được dùng, để khoá web không gọi được `/v1/tools`.
Nếu ADR-0004 đặt cổng ở máy chủ chung và chương trình nối stdio gọi `/v1/tools` qua Internet, việc giới hạn kênh này là bắt buộc.
Nếu không, người có khoá web gọi `/v1/tools` để bỏ qua lớp thứ hai.
Điều này phải làm cùng lúc với lớp thứ hai, không để sau.

### 3.4. Những điều cổng không bao giờ làm

- Không dùng `x-user-email` làm danh tính.
  Email đổi được, là dữ liệu cá nhân, và không phải mã nhân viên.
- Không dùng `x-agent-id` hay `x-executor-id` làm danh tính người dùng.
  Hai giá trị này có thể là danh tính của agent hoặc của một lần chạy, không phải người đang ngồi trước màn hình.
- Không cho header quyết định vai, phòng hay phạm vi.
  Vai và phòng luôn đọc từ danh bạ theo mã nhân viên lấy từ khoá.
- Không ghi khoá thô, email hay mã tài khoản vào log ứng dụng.
  Vết chỉ ghi mã khoá và kết quả kiểm; mã tài khoản chỉ nằm trong bảng nối và vết, không ra kết quả tool.

### 3.5. Khi tổ chức dùng chung một skill

Nếu Kevin trả lời rằng quản trị viên chia sẻ một skill cho cả tổ chức, mô hình khoá riêng từng người không chạy được trong thực tế.
Một khoá dùng chung không nói được ai đang hỏi, và lớp thứ hai chưa đủ tin để thay thế.
Khi đó có hai đường, và cả hai cần một ADR mới:

- Mỗi người vẫn tự thêm một skill với khoá của mình, nếu Thổ Thần cho phép.
- Hoặc dùng một khoá chung cho cả tổ chức, và để nền tảng cấp một danh tính có chữ ký cho từng lời gọi; khi đó danh tính chính là header, không phải khoá.

Bản thử không chọn đường nào trong hai đường này, vì chưa có câu trả lời của Kevin.

**Kết luận:** bản thử dùng khoá riêng từng người làm danh tính duy nhất; mã tài khoản của Thổ Thần chỉ được dùng làm lớp kiểm thứ hai sau khi H9, H10 và hai điều kiện về nguồn gọi và bảng nối đều đạt.

## 4. Bằng chứng và cách kiểm lại

| Điều đang dựa vào | Bằng chứng | Độ tin cậy | Cách kiểm lại |
| --- | --- | --- | --- |
| Chat web và desktop gọi tool qua máy chủ Thổ Thần | S2 tới S4: địa chỉ nguồn ở Singapore, `cf-ipcountry: SG`, `clientInfo` của desktop là `lobehub-mcp-client`; `log-20261117-171748-473.jsonl:139` (web), `:119` (desktop) ([kịch bản đo, mục 4.8](../../rd/appota/tho-than-mcp-probe.md#48-kết-quả-đo-qua-https-công-khai-ngày-2026-11-17-s1-s6)) | Cao | Mở tunnel, chạy probe, gọi `whoami`, đọc `cf-connecting-ip` |
| Lời gọi chat có `x-user-id`, `x-user-email`, `x-agent-id`, `x-executor-id` | S3 và S4; `log-20261117-171748-473.jsonl:139`, bảng header ở [kịch bản đo, mục 4.8](../../rd/appota/tho-than-mcp-probe.md#48-kết-quả-đo-qua-https-công-khai-ngày-2026-11-17-s1-s6) | Trung bình: một tài khoản, log gốc không còn | Chạy lại S3, S4 với hai tài khoản; đọc `http.headers` |
| LobeHub 2.1.56 không gắn bốn header này | Đọc mã ở [khảo sát Thổ Thần, mục 6.2](../../rd/appota/tho-than-platform.md#62-lời-gọi-mcp-trong-chat-không-có-danh-tính-do-lobehub-đặt); 29 câu kiểm L1 tới L29 trong [script kiểm chéo](../../rd/checks/tho-than-platform.sh) | Cao | `bash rd/checks/tho-than-platform.sh` |
| Ai có token cũng tự đặt được `x-user-id` | Header do người dùng cấu hình; không có chữ ký, chưa có dải IP cố định ([khảo sát Thổ Thần, mục 6.5](../../rd/appota/tho-than-platform.md#65-hệ-quả-cho-adr-0005)) | Cao về cơ chế; chưa đo một lời gọi giả | Gửi header giả trong skill, gọi `whoami`, xem cổng nhận gì (H9) |
| Hai tài khoản có mã khác nhau | Chưa đo; H10 mới là giả thuyết ([khảo sát Thổ Thần, mục 9](../../rd/appota/tho-than-platform.md#9-câu-hỏi-mở-và-giả-thuyết-kiểm-được)) | Thấp | Hai tài khoản cùng skill, so `x-user-id` và `mcp-session-id` |
| Khoá riêng tới được cổng và đổi được | H8: stdio, HTTP `localhost`, đổi khoá có hiệu lực ở lần gọi sau ([kịch bản đo, mục 5.5](../../rd/appota/tho-than-mcp-probe.md#55-khoá-riêng-của-từng-người-h8)) | Cao | Chạy lại H8 trong `tools/mcp-probe` |

Log gốc của phiên đo không còn trên máy, chỉ còn bảng tóm tắt có số dòng ([khảo sát Thổ Thần, mục 3.6](../../rd/appota/tho-than-platform.md#36-phép-đo-https-công-khai-2026-11-17)).
Vì vậy ADR dựa vào bảng tóm tắt, không dựa vào log gốc.
Độ tin cậy của phần header vì thế là trung bình, và đó là một lý do nữa để không dùng header làm danh tính.

**Kết luận:** bằng chứng đủ cho quyết định "khoá là danh tính chính"; không đủ cho bất kỳ quyết định nào dựa vào `x-user-id`.

## 5. Hệ quả

- Mốc 1 và mốc 2 không bị chặn: cổng chỉ cần bảng khoá, không cần bảng nối, mã lý do mới hay lệnh quản trị mới.
- SR1 (danh tính và một cửa ghi) đạt cho bản thử: mọi đề xuất và mọi vết mang mã nhân viên lấy từ khoá, không phải từ tài khoản dịch vụ.
- Khoá không phải một lần đăng nhập.
  Một khoá bị lộ hoặc một máy dùng chung làm người khác thành người sở hữu khoá cho tới khi thu hồi; báo cáo phải nói rõ.
- Mô hình phụ thuộc vào việc mỗi người có cấu hình skill riêng.
  Nếu Kevin nói skill được chia sẻ cho cả tổ chức, mô hình phải đổi; đó là rủi ro lớn nhất của quyết định này.
- Lớp thứ hai không được dựng bây giờ, nên không có bảng nối, không có bốn mã lý do mới, và không có phép thử cho header.
  Đây là một khoảng trống đã biết, không phải một bảo đảm ngầm.
- Khi đủ điều kiện, chi phí thêm là một cài đặt `IdentityProvider` thứ hai, một bảng, một lệnh quản trị và bốn phép thử; phần khoá và phần quyền không đổi.
- Đường dài hạn vẫn là để nền tảng cấp danh tính có chữ ký (OAuth hoặc token), vì khi đó cổng không phải giữ một bảng nối do con người bảo trì.

**Kết luận:** quyết định này không thêm việc cho bản thử, nhưng nói rõ giá phải trả nếu tổ chức dùng skill chung hoặc nếu sau này muốn dùng header.

## 6. Xem lại khi

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| Kevin nói skill do quản trị viên chia sẻ cho cả tổ chức | Mô hình khoá riêng từng người không dùng được trong thực tế; chọn giữa skill riêng từng người và danh tính có chữ ký do nền tảng cấp; viết ADR mới |
| H9 cho thấy máy chủ Thổ Thần nối thêm thay vì ghi đè, hoặc người dùng gửi được hai giá trị | Không bật lớp thứ hai; báo Kevin; giữ khoá là danh tính duy nhất |
| H9 và H10 đạt: một giá trị, đúng tài khoản, hai tài khoản khác nhau | Chuyển sang điều kiện 2 và 3; chưa bật vội |
| Có dải IP cố định, chữ ký header hoặc kênh riêng cho máy chủ Thổ Thần | Điều kiện 2 đạt; thêm kiểm nguồn gọi và giới hạn kênh của khoá |
| Không có cách nào phân biệt lời gọi của Thổ Thần với lời gọi trực tiếp | Lớp thứ hai chỉ bắt được dùng khoá của người khác bên trong Thổ Thần; cân nhắc xem có đáng làm không, và đừng gọi nó là ranh giới an ninh |
| Có bảng nối mã tài khoản với mã nhân viên, và bảng đó bảo trì được | Điều kiện 3 đạt; mở issue cho `ThoThanAccountIdentity`, bảng nối, bốn mã lý do và bốn phép thử |
| Thổ Thần thêm OAuth, token có chữ ký hoặc header do nền tảng ký | Bỏ lớp thứ hai và bỏ khoá cho đường đó; dùng danh tính nền tảng cấp; giữ khoá cho nơi gọi không qua Thổ Thần |
| Mã tài khoản đổi hoặc bị cấp lại cho người khác | Thu hồi dòng cũ trong bảng nối; từ chối cho tới khi nối lại |
| ADR-0004 đặt cổng ở máy chủ chung và chương trình nối stdio gọi `/v1/tools` qua Internet | Giới hạn khoá web ở kênh `/mcp`, hoặc giữ chương trình nối ở máy người dùng; nếu không, lớp thứ hai bị bỏ qua qua `/v1/tools` |

**Kết luận:** ba điều kiện của lớp thứ hai là ba dòng trong bảng này; dòng nào cũng kiểm được, nên lần xem lại không phải đoán.
