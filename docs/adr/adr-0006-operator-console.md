# ADR-0006: Trang điều khiển của Lab

Ngày: 2026-11-17. Trạng thái: đề xuất, chấp nhận khi được merge.

## Đọc nhanh

- Vấn đề: muốn biết bản thử làm được gì, đổi quyền của một người, hay thử một câu hỏi, hiện phải đọc mã, gõ lệnh hoặc tốn credit Thổ Thần.
- Quyết định: thêm một trang điều khiển chạy trên máy chạy cổng, chỉ mở được từ chính máy đó.
- Trên trang, người vận hành xem các công cụ, sửa quyền và các trường được xem, gọi thử công cụ dưới tên từng nhân vật, xem dữ liệu gốc và vết.
- Mọi lần gọi thử vẫn đi qua cổng thật, nên cái trang hiện ra đúng là cái AI trong Thổ Thần nhận.
- Việc tiếp theo: dựng theo năm issue con; việc này không chặn mốc 1 và mốc 2.

## 1. Bối cảnh

Ví dụ: anh Quang muốn xem chị Hoa tra anh Minh thì thấy những trường nào, rồi thử bỏ trường email khỏi vai nhân viên.
Hôm nay việc đó cần năm bước rời nhau:

- Danh mục tool: gọi `GET /v1/tools`, đọc JSON.
- Quyền và trường: sửa tay `lab/gateway/policy/rules.json`, file đã commit; mỗi lần thử đổi quyền làm bẩn git.
- Thử một câu: hỏi trong Thổ Thần, mà gói FREE chỉ có 500 credit và [spec, mục 8.1](../../rd/design/mvp-spec.md#81-ba-lớp-kiểm-thử) chỉ chạy lớp này khi nghiệm thu một mốc; hoặc tự viết `curl` với khoá.
- Vết: `npm run trace`, chỉ lọc theo người hoặc theo task.
- Dữ liệu của hai hệ thống giả: chỉ đọc được bằng API có khoá dịch vụ.

Mentor hay quản lý không xem được bản thử nếu không có người gõ lệnh hộ.
[Spec, mục 4.1](../../rd/design/mvp-spec.md#41-sơ-đồ) hứa một trang tra vết của cổng, nhưng trang đó chưa có issue.

Ba điều làm việc này rẻ hơn vẻ ngoài:

- Bộ luật quyền đọc lại file luật ở mỗi lần quyết định (`lab/gateway/src/policy/engine.ts`), nên luật mới áp ngay ở lời gọi sau, không cần khởi động lại cổng.
- Bảng khoá đã có nơi gọi và thu hồi theo mã khoá ([ADR-0005, mục 3.1](adr-0005-requester-identity.md#31-khoá-riêng-từng-người-là-danh-tính-chính)), nên một nơi gọi mới không cần cơ chế danh tính mới.
- Mỗi dòng vết đã ghi phiên bản luật đã quyết định nó.

**Kết luận:** thiếu một chỗ để nhìn và chơi với bản thử mà không đọc mã, không gõ lệnh và không tốn credit; phần lõi để làm chỗ đó đã có sẵn trong cổng.

## 2. Phương án đã xét

| Phương án | Được | Mất | Kết quả |
| --- | --- | --- | --- |
| A. Thêm trang quản trị vào cổng | Một tiến trình; dùng thẳng các bảng của cổng | Cổng có địa chỉ công khai khi nghiệm thu ([ADR-0004](adr-0004-shared-gateway-over-https.md)); trang sửa luật nằm sau cùng cửa với `/mcp`; phải thêm đăng nhập quản trị; một lỗi định tuyến là mở quyền sửa luật ra Internet | Loại |
| B. Dịch vụ riêng, chỉ nghe `127.0.0.1`, gọi cổng như một nơi gọi | Không địa chỉ công khai nào trỏ tới; bề mặt công khai của cổng không lớn thêm; lời gọi thử đi đúng đường của Thổ Thần | Thêm một tiến trình; hai tiến trình cùng mở file SQLite của cổng | **Chọn** |
| C. Chỉ thêm lệnh dòng lệnh | Ít mã nhất | Người không kỹ thuật không dùng được; không có cái nhìn tổng thể | Loại |
| D. Dùng công cụ có sẵn: MCP Inspector, trình xem SQLite | Không phải viết | Inspector thấy tool nhưng không thấy quyền, vết hay dữ liệu gốc, và đổi nhân vật phải dán lại khoá; trình xem SQLite cho sửa thẳng bảng vết | Loại; MCP Inspector vẫn dùng khi gỡ lỗi `/mcp` |

Phương án A rẻ hơn B một tiến trình, nhưng đổi lấy một rủi ro không sửa được bằng phép thử: trang có quyền sửa luật của mọi người nằm trên cùng địa chỉ công khai với `/mcp`.
Phương án B giữ ranh giới đó bằng mạng, không bằng mã.

**Kết luận:** chọn B.

## 3. Quyết định

### 3.1. Vị trí và ranh giới

- Trang điều khiển (console) là gói `lab/console`, tiến trình thứ tư, nghe `127.0.0.1:8793`; đổi cổng bằng `LAB_CONSOLE_PORT`.
  `npm start` chạy nó sau cổng.
- Console chạy cùng máy với cổng và không bao giờ được đưa qua đường hầm hay địa chỉ công khai.
  Khi cổng lên máy chủ thật, người vận hành mở console bằng chuyển cổng SSH (`ssh -L 8793:127.0.0.1:8793 <máy chủ>`).
- Console từ chối mọi request có header `Host` khác `127.0.0.1:<cổng>` và `localhost:<cổng>`, để một trang web lạ không gọi được nó qua đổi DNS (DNS rebinding).
- Mọi `POST` cần mã chống giả mạo (CSRF token) và `Origin` trùng với chính console; trang không cho nhúng vào trang khác và không tải gì từ bên ngoài, giống các trang của cổng.
- Console không có đăng nhập: ai ngồi trước máy chạy cổng là người vận hành.
  Đây là giới hạn của Lab, ghi rõ trong báo cáo.
- Demo cho mentor bằng chia sẻ màn hình.

### 3.2. Sáu màn hình

| Màn hình | Xem hoặc làm được gì | Lấy từ |
| --- | --- | --- |
| Tổng quan | Ba dịch vụ có đang chạy không; phiên bản luật đang áp; sáu nhân vật và khách, kèm vai và phòng | `/health`, danh sách nhân vật, file luật |
| Tool | Từng tool: mô tả AI thấy, tham số, tool chỉ đọc hay soạn đề xuất | `GET /v1/tools`, cùng nguồn với `/mcp` |
| Quyền và trường | Bảng vai × hành động, mỗi ô chọn "được", "không được" hoặc "cần duyệt"; ngưỡng hàng loạt; các trường nhân viên mỗi vai được xem; ô "thử quyết định" cho một người, một hành động, một đối tượng, trả kết quả kèm mã luật | File luật, bộ luật quyền của cổng |
| Sân chơi | Chọn nhân vật, chọn tool, điền tham số, gọi; thấy nguyên văn chữ AI nhận, mã lý do, dòng vết và link xác nhận; nút chạy sẵn các kịch bản mẫu | `POST /v1/tools/<tên>` của cổng |
| Dữ liệu gốc | Bảng nhân viên và bảng task như hai hệ thống giả đang lưu, ghi rõ "góc nhìn người vận hành, AI không thấy thế này"; nút đặt lại dữ liệu và gây lỗi | API của hai hệ thống giả |
| Vết | Lọc theo người, task, đề xuất, cửa vào; gom theo đề xuất để thấy chuỗi soạn, xác nhận, ghi; tự làm mới | Bảng `trace` |

Các kịch bản mẫu của sân chơi là kịch bản A, B và D của [spec, mục 2.2](../../rd/design/mvp-spec.md#22-bốn-kịch-bản-phải-chạy-trong-thổ-thần), câu lệnh cài trong mô tả T-12, và một câu hỏi ngoài phạm vi.
Kịch bản C (duyệt 30 task) vào sân chơi khi mốc 3 có phần duyệt.

### 3.3. Gọi thử đi qua cổng thật

- Khi khởi động, console thu hồi mọi khoá còn hiệu lực của nơi gọi `lab-console`, phòng lần chạy trước bị tắt ngang.
- Sau đó console cấp một khoá cho mỗi nhân vật và cho khách, nơi gọi `lab-console`.
  Khoá thô chỉ nằm trong bộ nhớ của console, không ra trang, log hay đĩa; khi tắt, console thu hồi chúng.
- Sân chơi gọi `POST /v1/tools/<tên>` của cổng bằng khoá của nhân vật đang chọn.
  Console không gọi thẳng bộ luật hay hai hệ thống giả khi gọi thử.
- Vì vậy cái sân chơi hiện ra đi qua cùng danh tính, cùng luật, cùng lọc trường và cùng vết với một lời gọi từ Thổ Thần.
- Vết tách được hai nguồn nhờ cột nơi gọi; khi tính số đo của báo cáo, lọc theo nơi gọi.
- Sân chơi không thay trợ lý gọi hàm của SR8 (dùng lại, quyền theo người), vì không có model nào tự chọn tool.
  Khi trợ lý gọi hàm có ở mốc 4, sân chơi thêm khung chat dùng trợ lý đó, như một nơi gọi nữa của cùng cổng.

### 3.4. Sửa quyền và trường

- `lab/gateway/policy/rules.json` thành bản gốc, chỉ đổi qua PR.
- Cổng đọc luật từ `LAB_RULES_PATH`, mặc định `<thư mục dữ liệu>/rules.json`.
  Khi file đó chưa có, cổng chép bản gốc sang lúc khởi động.
  Phép thử vẫn truyền đường dẫn luật riêng.
- Console kiểm file mới bằng đúng schema và đúng bộ luật của cổng, nhập từ gói `@lab/gateway`, không chép mã.
  Console không bao giờ ghi một file chưa qua schema; nếu file vẫn hỏng vì lý do khác, cổng từ chối mọi lệnh ghi với `POLICY_UNAVAILABLE`, theo SR5 (không chắc thì chặn).
- Mỗi lần lưu, console tăng `version` thêm 1, ghi ra file tạm rồi đổi tên, và giữ một bản `rules-history/v<n>.json`.
  Nhờ vậy mọi dòng vết tra lại được đúng luật đã quyết định nó.
- Nếu phiên bản trên đĩa khác phiên bản lúc mở form, console từ chối lưu và yêu cầu tải lại, để hai người sửa cùng lúc không ghi đè nhau.
- Nút "về bản gốc" chép nội dung bản gốc nhưng đặt `version` lớn hơn mọi bản đã có, để phiên bản luôn tăng.
- Danh sách trường để tích chọn lấy từ chính danh bạ giả, nên trường mới thêm qua `/admin/add-field` tự hiện ra với trạng thái "chưa khai".
- Console chỉ đổi giá trị trong bảng; không thêm vai hay hành động mới, vì hai danh sách này cố định trong mã.
- Trường của task cố định trong mã (`taskLine` trong `lab/gateway/src/tools/read-tools.ts`), nên console chỉ hiện chúng, không cho sửa.
  Đưa trường của task vào file luật là một thay đổi schema riêng, chưa làm.

### 3.5. Dữ liệu gốc

- Console đọc hai hệ thống giả bằng khoá dịch vụ, chỉ để xem.
- Không có nút sửa bản ghi; mọi thay đổi dữ liệu nghiệp vụ đi qua cổng.
- Nút đặt lại dữ liệu và nút gây lỗi "mất phản hồi sau khi ghi" chỉ hiện khi `LAB_TEST_HOOKS=1`, và dùng các đường `/admin/*` có sẵn.

### 3.6. Vết

- Console ghi vào đúng một bảng của cổng, `api_keys`, qua mã quản lý khoá của cổng; các bảng khác mở chỉ đọc.
- Cả cổng và console bật chế độ ghi nhật ký trước (WAL) và thời gian chờ khoá của SQLite, để đọc không chặn ghi.
- Tra vết chuyển từ trang của cổng sang console.
  Tra vết là việc của người vận hành và người kiểm tra, không phải của người dùng cuối, nên bề mặt công khai của cổng chỉ còn `/mcp`, đăng nhập, xác nhận và duyệt.
  SR7 (vết xuyên suốt) được kiểm trên console và bằng `npm run trace`.

### 3.7. Công nghệ

Theo [ADR-0003](adr-0003-technology-stack.md): TypeScript trên Node 22, `node:http`, HTML do server dựng, mọi giá trị qua cùng hàm thoát ký tự của cổng.
Chỉ thêm một ít JavaScript thuần để bảng vết tự làm mới; không framework, không bước build mới.
Phép thử dùng `node:test` trên mã đã build; các màn hình có form còn được kiểm bằng trình duyệt thật và chụp màn hình.

**Kết luận:** console là một nơi gọi nữa của cổng, cộng quyền sửa một file luật trên máy chạy cổng; nó không mở thêm đường nào ra Internet.

## 4. Hệ quả

- `npm start` chạy bốn tiến trình thay vì ba.
- Cổng đổi hai chỗ: đọc luật từ `LAB_RULES_PATH`, và bật WAL cho `gateway.sqlite`.
- [Spec, mục 4.1 và 4.2](../../rd/design/mvp-spec.md#4-kiến-trúc) đổi theo: cổng phục vụ trang đăng nhập, xác nhận và duyệt; tra vết nằm ở console.
  Dòng "Trang xác nhận, duyệt, tra vết" trong [ADR-0003, mục 2](adr-0003-technology-stack.md#2-quyết-định) đọc theo ADR này.
- Ai có quyền vào máy chạy cổng thì sửa được luật của mọi người; với Lab đây là chấp nhận được, với hệ thống thật thì không.
- Sửa luật không có bước duyệt; dấu vết duy nhất là phiên bản tăng và bản `rules-history/v<n>.json`.
- Sân chơi tạo đề xuất và dòng vết thật trong cổng; dọn chúng bằng cách xoá thư mục dữ liệu, như hôm nay.
- Mốc 1 và mốc 2 không phụ thuộc vào console; console giúp nghiệm thu và demo hai mốc đó dễ hơn.

**Kết luận:** giá phải trả là một tiến trình và một quyền quản trị không đăng nhập, cả hai chỉ chạm tới máy chạy cổng.

## 5. Xem lại khi

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| Mentor hay Kevin cần tự mở console từ xa | Thêm đăng nhập quản trị riêng và viết ADR mới; không đưa console qua đường hầm của cổng |
| Cổng lên máy chủ thật mà người vận hành không có SSH | Cần một API quản trị luật trên cổng, có xác thực riêng; viết ADR mới |
| Cần sửa trường của task hoặc thêm vai, thêm hành động từ console | Đổi schema file luật trước, ghi vào spec, rồi mới mở rộng console |
| Sửa luật cần người duyệt hoặc cần biết ai sửa | Ghi mỗi lần lưu luật vào vết, kèm người vận hành; khi đó console cần đăng nhập |
| Trợ lý gọi hàm của mốc 4 xong | Thêm khung chat vào sân chơi, gọi cổng như một nơi gọi |

**Kết luận:** mọi lý do để mở console ra ngoài máy đều cần đăng nhập quản trị trước, nên đều cần một ADR mới.
