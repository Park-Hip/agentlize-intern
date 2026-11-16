# Cắm MCP probe vào Thổ Thần: kịch bản đo P1-P5

Ngày: 2026-11-16. Trạng thái: bản chờ chạy, chưa có kết quả; phần giao diện phải do người có tài khoản Thổ Thần làm.

## Đọc nhanh

- Vấn đề: trước khi chốt kiến trúc, ta phải biết Thổ Thần gửi gì sang công cụ, có hỏi người duyệt không, có tự gọi lại khi lỗi không và hiển thị kết quả ra sao.
- Cách làm: một server thử nghiệm nhỏ ghi lại mọi thứ, cắm vào Thổ Thần desktop, rồi chạy năm kịch bản đo.
- Phần của agent đã xong: server, bộ tự kiểm tra và cách đọc log.
- Phần của người dùng: cắm server vào giao diện, bấm đúng các bước, điền bảng kết quả và lưu ảnh chụp.
- Kết quả dùng để sửa khảo sát Thổ Thần và viết bản ghi quyết định, chưa dùng để chốt kiến trúc ngay.

## 1. Năm câu hỏi và lý do phải đo

Bản thử của lab chỉ đáng tin khi biết Thổ Thần thật sự làm gì ở vai trò máy chủ công cụ (MCP host).
Năm câu dưới đây chặn thiết kế, nên phải trả lời bằng quan sát chứ không bằng suy đoán.

Một số từ được dùng lại trong cả tài liệu:

- tool (công cụ): một hàm mà server cung cấp để AI gọi.
- stdio: host tự mở tiến trình server và nói chuyện qua stdin/stdout.
- Streamable HTTP: gửi JSON-RPC qua HTTP, có mã phiên.
- bearer: gửi kèm token trong header Authorization.
- OAuth2: đăng nhập ủy quyền qua một máy chủ xác thực riêng.
- elicitation: server hỏi người dùng ngay trong chat bằng một biểu mẫu.
- isError: cờ báo kết quả của tool là lỗi.
- structuredContent: dữ liệu có cấu trúc gửi kèm kết quả.
- _meta: trường phụ trong mỗi yêu cầu, dùng cho dấu vết và tiến độ.

| Mã | Câu hỏi | Vì sao chặn thiết kế |
| --- | --- | --- |
| P1 (giao thức và xác thực) | Thổ Thần nhận stdio, Streamable HTTP trên localhost, hay URL HTTPS từ xa? Nhận xác thực nào: không, bearer, OAuth2? | Quyết định server của lab chạy ở đâu và mở cổng nào. |
| P2 (danh tính người gọi) | Server nhận được gì về người dùng: header, mã phiên, tham số initialize, `_meta`? Hai tài khoản khác nhau có khác nhau không? | Nếu không có danh tính thì lab phải tự cấp danh tính giả và ghi rõ là giả lập. |
| P3 (kênh duyệt) | Host có hỏi trước khi gọi tool `destructiveHint` không? Người dùng tắt được không? Có hỗ trợ `elicitation/create` không? Link Markdown có bấm được không? | Quyết định chỗ đặt điểm dừng rủi ro cho SR4 (điểm dừng rủi ro). |
| P4 (thử lại và thời gian chờ) | Host hoặc model có tự gọi lại khi tool lỗi không? Một tool chạy được bao lâu trước khi host cắt? | Quyết định cách viết tool dài và cách chống ghi trùng cho SR6 (không ghi trùng). |
| P5 (hiển thị và dấu vết) | `isError` và `structuredContent` hiện ra sao? Có `traceparent` hoặc mã vết không? Có thông tin token hoặc chi phí không? | Quyết định phần vết cho SR7 (vết xuyên suốt) và cách trả kết quả cho người dùng. |

SR1-SR8 là tám yêu cầu bắt buộc trong PRD của lab.
Phép đo này không thay đổi tám yêu cầu, chỉ cho biết Thổ Thần làm sẵn được phần nào.

**Kết luận:** nếu chưa có kết quả cho P2 (danh tính) và P3 (kênh duyệt) thì chưa được viết ADR-0001.

## 2. Chuẩn bị

### 2.1. Dựng server và chạy tự kiểm tra

Chạy trong thư mục repo:

```bash
cd tools/mcp-probe
npm install
npm run build
npm run selftest
```

Kết quả đúng phải có một dòng dạng `SELFTEST PASSED: <số> checks`.
Nếu chưa đạt, dừng lại và báo lỗi nguyên văn, không chạy tiếp phần giao diện.

Hướng dẫn đầy đủ về build và tham số nằm ở [README của probe](../../tools/mcp-probe/README.md).

### 2.2. Thêm server vào Thổ Thần

Các bước chi tiết nằm ở mục 5 của README.
Tóm tắt: mở Cài đặt, tìm mục MCP server, thêm server tùy chỉnh, chọn Streamable HTTP với URL `http://localhost:8787/mcp`, hoặc chọn stdio với command và args ở mục 3 của README.
Đặt tên `mcp-probe`, lưu, rồi bật server này cho agent đang dùng.
Danh sách đúng phải có 7 tool.
Nếu form chỉ có SSE, ghi lại làm bằng chứng P1 (giao thức và xác thực) và dừng, vì probe không chạy SSE cũ.

**Kết luận:** chỉ chuyển sang bước đo khi danh sách 7 tool hiện ra trong giao diện; nếu không hiện thì xử lý theo bảng lỗi ở mục 9 của README trước.

### 2.3. Chọn thứ tự thử

Thứ tự dưới đây giúp phát hiện lỗi sớm và ít phải sửa cấu hình nhất.

| Thứ tự | Chế độ | Vì sao thử trước |
| --- | --- | --- |
| 1 | Streamable HTTP, không bearer | Dễ thấy header và session id nhất. |
| 2 | stdio | Kiểm tra đường spawn tiến trình, khác hoàn toàn HTTP. |
| 3 | Streamable HTTP có bearer | Kiểm tra xem host có gửi token không. |
| 4 | HTTPS từ xa qua tunnel | Kiểm tra chế độ URL công khai, gần với triển khai thật. |
| 5 | OAuth2 | Chỉ ghi nhận host có đòi hay không; probe không chạy máy chủ OAuth. |

Không cần làm cả năm nếu host không cho chọn chế độ đó.
Nhưng phải ghi rõ chế độ nào chưa thử được và vì sao.

### 2.4. Bật chế độ ghi log

Mở một cửa sổ terminal riêng tại thư mục repo và chạy server:

```bash
cd tools/mcp-probe
node dist/index.js --http --port 8787
```

Terminal sẽ in ra đường dẫn file log, ví dụ `scratch/mcp-probe/log-20261116-150000-123.jsonl`.
Giữ terminal này mở trong suốt buổi đo.
Mỗi lần đổi chế độ, dừng server bằng `Ctrl+C` rồi chạy lại với tham số mới.

Các lệnh đọc log dưới đây chạy trong một terminal thứ hai, tại thư mục repo.
Liệt kê log mới nhất:

```bash
ls -t scratch/mcp-probe/log-*.jsonl | head -1
```

Tóm tắt nhanh một file log:

```bash
node tools/mcp-probe/dist/summarize.js scratch/mcp-probe/log-20261116-150000-123.jsonl
```

### 2.5. Chuẩn bị hai tài khoản cho P2 (danh tính)

Cần tài khoản A và tài khoản B, ví dụ tài khoản của bạn và một tài khoản thử của người khác.
Không nhập mật khẩu, token hay dữ liệu thật vào bất kỳ ô nào của probe.
Nếu không có tài khoản thứ hai, ghi rõ P2 (danh tính) chỉ có một mẫu và đánh dấu độ tin cậy thấp.
Không tự tạo tài khoản giả trên hệ thống công ty khi chưa được phép.

### 2.6. Cách ghi bằng chứng

Mỗi kết quả phải kèm một tham chiếu dạng `tên-file-log:dòng`, ví dụ `log-20261116-150000-123.jsonl:42`.
Lấy số dòng bằng:

```bash
grep -n '"kind":"session_init"' scratch/mcp-probe/log-20261116-150000-123.jsonl
```

Lưu ảnh chụp màn hình vào `scratch/mcp-probe/evidence/` và đặt tên theo câu hỏi, ví dụ `p3-hop-thoai-duyet.png`.
Thư mục `scratch/` đã được git bỏ qua, nên ảnh và log không vào commit.

**Kết luận:** buổi đo chỉ bắt đầu khi `npm run selftest` đạt và đã xác định được file log đang ghi.

## 3. Đọc log: năm loại dòng quan trọng nhất

Mỗi dòng là một JSON object, có trường `ts` theo giờ UTC.
Giờ máy là giờ Việt Nam, nên cộng 7 giờ để đối chiếu, hoặc dùng chính `ts` trong log khi so thứ tự.

| `kind` | Trả lời câu nào | Cần xem trường nào |
| --- | --- | --- |
| `http_request` | P1 (giao thức), P2 (danh tính), P5 (hiển thị) | `method`, `path`, `headers` (đã che Authorization), `remoteAddress`, `userAgent` |
| `session_init` | P1 (giao thức), P2 (danh tính) | `clientInfo`, `capabilities`, `protocolVersion`, `sessionId` |
| `tool_call` | P2 (danh tính), P3 (kênh duyệt), P4 (thử lại) | `tool`, `arguments`, `requestId`, `meta`, `http.headers` |
| `tool_result` | P3 (kênh duyệt), P5 (hiển thị) | `isError`, `content`, `structuredContent` |
| `flaky_attempt` | P4 (thử lại) | `key`, `attempt`, `ts` của từng lần |
| `slow_start`, `slow_end`, `tool_cancelled` | P4 (thử lại) | `seconds`, `elapsedMs`, `cancelled` |
| `http_client_disconnect` | P4 (thử lại) | `method`, `path`, `durationMs`, `sessionId` |
| `ask_confirm_branch`, `ask_confirm_result` | P3 (kênh duyệt) | `branch`, `action`, `content` |
| `approve_visit` | P3 (kênh duyệt) | `id`, `userAgent`, `referer`, `ts` |
| `extra_meta` | P2 (danh tính), P5 (hiển thị) | `method`, `meta` |
| `well_known_probe` | P1 (giao thức) | `path` của các đường dẫn `/.well-known/...` |
| `http_auth` | P1 (giao thức), P2 (danh tính) | `ok`, `reason`, `scheme` |

Giá trị Authorization bị che còn 6 ký tự đầu cộng độ dài, ví dụ `Bearer...(len=34)`.
Nhìn vào đó vẫn biết host có gửi token hay không, nhưng không đọc được token.
Cookie và `x-api-key` cũng bị che theo cùng quy tắc.

Dòng `jsonrpc` ghi cả thông điệp vào và ra.
Dòng `direction: "in"` là những gì host gửi; dòng `direction: "out"` là những gì server trả.
Đây là bằng chứng gốc khi cần đối chiếu với những gì giao diện hiển thị.

**Kết luận:** chỉ cần `http_request`, `session_init`, `tool_call`, `tool_result` và các dòng sự kiện của tool là đủ trả lời cả năm câu hỏi.

## 4. P1 (giao thức và xác thực): host nối bằng đường nào?

### 4.1. Thử Streamable HTTP trên localhost

Chạy server không bearer:

```bash
node dist/index.js --http --port 8787
```

Trong Thổ Thần desktop, thêm MCP server kiểu Streamable HTTP với URL `http://localhost:8787/mcp`.
Bật server này cho agent đang dùng.
Gõ đúng câu:

```
Gọi tool whoami của server mcp-probe và in nguyên văn kết quả JSON.
```

Ghi lại: host có kết nối được không, có hiện 7 tool không, `protocolVersion` là gì.
Trong log, tìm dòng `session_init` đầu tiên và dòng `tool_call` đầu tiên.

### 4.2. Thử stdio

Dừng server HTTP.
Trong Thổ Thần, thêm MCP server kiểu stdio với command là đường dẫn tuyệt đối tới node và args gồm đường dẫn tuyệt đối tới `tools/mcp-probe/dist/index.js` rồi `--stdio`.
Lấy đường dẫn node bằng:

```bash
node -p "process.execPath"
```

Khởi động lại app nếu giao diện không nhận cấu hình mới.
Gõ lại đúng câu hỏi whoami ở trên.
Ghi lại: app có spawn được tiến trình không, tool có hiện không, log mới có được tạo không.

### 4.3. Thử bearer

Chạy lại HTTP với token:

```bash
node dist/index.js --http --port 8787 --bearer token-thu-nghiem
```

Trong cấu hình MCP server của Thổ Thần, nhập token `token-thu-nghiem` nếu form có ô auth hoặc header.
Gõ lại câu whoami.
Sau đó thử cố ý sai token một lần để xem thông báo lỗi của host, rồi sửa lại.

Điều cần phân biệt:

- Host gửi `Authorization: Bearer ...` mà không cần cấu hình gì thêm: bằng chứng host tự sinh token hoặc dùng phiên của nó.
- Host chỉ gửi khi ta nhập token: bằng chứng host hỗ trợ bearer nhưng cần người dùng cấu hình.
- Host không có ô nhập token và trả 401: bằng chứng host chỉ hỗ trợ chế độ không xác thực hoặc OAuth2.

### 4.4. Thử HTTPS từ xa

Chạy tunnel tới cổng 8787, ví dụ:

```bash
cloudflared tunnel --url http://localhost:8787
```

Chạy server với địa chỉ công khai để tool `echo_link` trả đúng link:

```bash
node dist/index.js --http --port 8787 --bearer token-thu-nghiem --public-url https://ten-mien-tunnel.example
```

Thêm URL `https://ten-mien-tunnel.example/mcp` vào Thổ Thần và gõ lại câu whoami.
Nếu tổ chức không cho tunnel ra ngoài, ghi rõ chưa thử được chế độ này.

### 4.5. Ghi nhận OAuth2

Nếu form của Thổ Thần có lựa chọn OAuth2, hoặc host tự chuyển sang luồng đăng nhập khi gặp 401, ghi lại.
Probe không chạy máy chủ OAuth, nên mọi yêu cầu tới `/.well-known/...` sẽ trả 404 và được ghi thành dòng `well_known_probe`.
Đó là bằng chứng host có dò OAuth, không phải bằng chứng OAuth chạy được.
Probe cũng không quảng bá metadata OAuth trong header `WWW-Authenticate`, nên host có thể không thử.
Kết quả "không thấy" chỉ có nghĩa là chưa thử được, không phải host không hỗ trợ OAuth2.

### 4.6. Bảng kết quả P1 (giao thức và xác thực)

| Chế độ | Kết nối được? | `protocolVersion` trong log | Xác thực quan sát được | Bằng chứng (file:dòng) | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Streamable HTTP localhost, không bearer |  |  |  |  |  |
| stdio |  |  |  |  |  |
| Streamable HTTP localhost, bearer |  |  |  |  |  |
| HTTPS từ xa qua tunnel |  |  |  |  |  |
| OAuth2 |  |  |  |  |  |

### 4.7. Cách kết luận P1 (giao thức và xác thực)

Một chế độ được coi là chạy được khi log có `session_init` của host và ít nhất một `tool_call`.
Không coi là chạy được nếu chỉ thấy kết nối TCP mà không có initialize.
Nếu nhiều chế độ cùng chạy, ghi rõ chế độ nào dễ cấu hình nhất cho người dùng cuối.

**Kết luận:** chưa chốt được chế độ nối cho lab cho đến khi bảng 4.6 có ít nhất một dòng có bằng chứng `session_init` và `tool_call`.

## 5. P2 (danh tính): server biết gì về người đang yêu cầu?

### 5.1. Lấy ảnh chụp từ tài khoản A

Đang đăng nhập tài khoản A, gõ:

```
Gọi tool whoami của server mcp-probe và in nguyên văn kết quả JSON.
```

Lưu ảnh chụp kết quả trong chat.
Trong log, tìm dòng `tool_call` của `whoami` và dòng `http_request` tương ứng.

### 5.2. Lấy ảnh chụp từ tài khoản B

Đăng xuất tài khoản A, đăng nhập tài khoản B, rồi gõ lại đúng câu trên.
Không đổi cấu hình server giữa hai lần, để so sánh chỉ khác ở tài khoản.
Nếu phải khởi động lại app, ghi lại vì mã phiên sẽ đổi.

### 5.3. So sánh từng trường

| Trường | Tài khoản A | Tài khoản B | Giống nhau? | Bằng chứng (file:dòng) |
| --- | --- | --- | --- | --- |
| `clientInfo` (tên và phiên bản app) |  |  |  |  |
| `capabilities` |  |  |  |  |
| `protocolVersion` |  |  |  |  |
| Header Authorization (đã che) |  |  |  |  |
| Header Cookie (đã che) |  |  |  |  |
| Header dạng `x-user-*`, `x-forwarded-*` |  |  |  |  |
| Địa chỉ nguồn (`remoteAddress`) |  |  |  |  |
| Mã phiên (`sessionId`) |  |  |  |  |
| `_meta` của lần gọi tool |  |  |  |  |
| Trường lạ trong `_meta` (`extra_meta`) |  |  |  |  |

### 5.4. Cách đọc kết quả

MCP không có trường chuẩn nào cho danh tính người dùng.
`clientInfo` là tên và phiên bản ứng dụng, không phải tên người dùng, nên không được tính là danh tính.
Nếu host không gửi header người dùng, mọi tài khoản sẽ trông giống nhau ở phía server.
Nếu host có gửi, đó là header của tầng HTTP, không phải của giao thức MCP.
Server không thể kiểm chứng header đó là thật hay do client tự đặt, nên phải ghi rõ mức tin cậy.

Ba khả năng và cách ghi:

- Không có trường nào khác nhau: kết luận "server không nhận được danh tính người dùng".
- Có header khác nhau nhưng không rõ nghĩa: kết luận "có tín hiệu danh tính, cần hỏi Kevin hoặc đội nền tảng".
- Có mã người dùng rõ ràng và ổn định: kết luận "có thể dùng làm danh tính, nhưng cần xác minh nguồn".

Không dùng ảnh chụp màn hình làm bằng chứng duy nhất.
Luôn kèm dòng log và tên trường cụ thể.

**Kết luận:** nếu bảng 5.3 không có dòng nào khác nhau giữa hai tài khoản thì lab phải cấp danh tính giả cho từng nhân vật và ghi rõ đây là giả lập, đúng như phương án dự phòng trong `rd/findings.md`.

## 6. P3 (kênh duyệt): host có hỏi trước khi ghi?

### 6.1. Kiểm tra duyệt trước khi gọi tool nguy hiểm

Chạy server HTTP và cấu hình host như mục 4.1.
Gõ đúng câu:

```
Dùng tool fake_write của server mcp-probe để chuyển task T-12 cho Minh. Đây là dữ liệu giả lập.
```

Quan sát thứ tự:

1. Giao diện có hiện hộp thoại xác nhận trước khi tool chạy không?
2. Nếu có, bấm duyệt và ghi lại giờ bấm.
3. Nếu không, tool chạy ngay và log có `tool_call` ngay sau câu lệnh.

Đối chiếu giờ bấm với `ts` của dòng `tool_call`.
Nếu `tool_call` xuất hiện trước khi bấm duyệt thì hộp thoại đó chỉ là thông báo sau khi chạy, không phải điểm dừng thật.
Nếu model tự hỏi lại trong chat thì đó là hành vi của model, không phải kênh duyệt của host; chỉ tính hộp thoại hoặc bước xác nhận do ứng dụng hiện ra.
Nếu model từ chối gọi tool và log không có `tool_call`, ghi là "model từ chối", không ghi là "host không duyệt".

Để biết host có dựa vào `destructiveHint` hay chỉ hỏi chung cho mọi tool, gọi thêm một tool chỉ đọc:

```
Gọi tool whoami của server mcp-probe và cho tôi biết kết quả.
```

Nếu `whoami` cũng bị hỏi duyệt thì hộp thoại là cơ chế chung, không phải do annotation `destructiveHint`.

### 6.2. Kiểm tra người dùng có tắt được duyệt

Mở phần cài đặt của MCP server hoặc cài đặt an toàn của agent, tìm mục xác nhận trước khi gọi tool.
Nếu có, tắt đi, chạy lại câu `fake_write` ở trên, rồi ghi lại kết quả.
Bật lại như cũ sau khi thử.
Nếu không tìm thấy mục này, ghi rõ "không thấy tùy chọn tắt" thay vì suy đoán.

### 6.3. Kiểm tra elicitation

Gõ đúng câu:

```
Gọi tool ask_confirm của server mcp-probe và làm theo biểu mẫu hiện ra.
```

Quan sát:

- Có biểu mẫu với ô chọn duyệt và ô ghi chú không?
- Biểu mẫu hiện trong chat hay trong một cửa sổ riêng?
- Bấm gửi xong, kết quả trong chat là gì?

Trong log, tìm `ask_confirm_branch` và `ask_confirm_result`.
Nhánh `unsupported` nghĩa là host không khai báo khả năng elicitation.
Nhánh `elicitation_attempt` kèm `action = accept` nghĩa là host có biểu mẫu và người dùng đã gửi.
Nhánh `elicitation_error` nghĩa là host khai báo nhưng thực tế không chạy được.

### 6.4. Kiểm tra link Markdown

Gõ đúng câu:

```
Gọi tool echo_link của server mcp-probe. Sau đó bấm vào link đầu tiên trong kết quả.
```

Quan sát:

- Dòng có link hiện chữ màu xanh hoặc con trỏ đổi thành bàn tay không?
- Bấm vào có mở trình duyệt tới trang duyệt giả lập không?
- URL thô ở dòng dưới có bấm được không, hay chỉ là chữ?

Mỗi lượt bấm tạo một dòng `approve_visit` với User-Agent và Referer của trình duyệt.
Nếu link bấm được nhưng trang không mở, ghi rõ lỗi của trình duyệt.

### 6.5. Bảng kết quả P3 (kênh duyệt)

| Bài thử | Kết quả quan sát | Bằng chứng (file:dòng) | Ghi chú |
| --- | --- | --- | --- |
| `whoami` có hỏi duyệt trước khi chạy? |  |  |  |
| `fake_write` có hỏi duyệt trước khi chạy? |  |  |  |
| Thời điểm `tool_call` so với lúc bấm duyệt |  |  |  |
| Tắt được duyệt trong cài đặt? |  |  |  |
| `ask_confirm` hiện biểu mẫu? |  |  |  |
| Nhánh elicitation trong log |  |  |  |
| Link Markdown bấm được? |  |  |  |
| Trang duyệt mở được? |  |  |  |
| `approve_visit` có User-Agent và Referer? |  |  |  |

### 6.6. Cách kết luận P3 (kênh duyệt)

Một kênh duyệt chỉ được tính là có nếu nó chặn được lệnh trước khi tool chạy, không chỉ hiện thông báo sau khi chạy.
Link bấm được chứng minh khả năng hiển thị, không chứng minh đó là kênh duyệt an toàn.
Elicitation là kênh duyệt đúng nghĩa nếu host hiện biểu mẫu và chỉ gửi câu trả lời sau khi người dùng bấm gửi.

**Kết luận:** nếu host không có điểm dừng trước `fake_write` và cũng không hỗ trợ elicitation thì lab phải tự dựng kênh duyệt ngoài host, rồi ghi lại bằng chứng này cho SR4 (điểm dừng rủi ro).

## 7. P4 (thử lại và thời gian chờ): host có tự gọi lại, và cắt sau bao lâu?

### 7.1. Kiểm tra tự gọi lại

Gõ đúng câu:

```
Gọi tool flaky của server mcp-probe với key là thu-nghiem-1 và cho tôi biết kết quả.
```

Quan sát trong chat:

- Có một thông báo lỗi rồi dừng?
- Có thêm một lượt trả lời hoặc một lần gọi lại mà không ai bấm gì?
- Có nút thử lại không?

Trong log, đếm số dòng `flaky_attempt` có cùng `key`.
Hai lần cách nhau vài mili giây thường là host gọi lại; hai lần cách nhau vài giây kèm lời giải thích thường là model tự quyết định gọi lại.
Log một mình không phân biệt được hai trường hợp, nên phải ghi kèm quan sát giao diện.
Nếu lần gọi lại dùng `key` khác, ghi lại vì đó là model tự đổi tham số, không phải host gọi lại cùng một lệnh.

Lần thứ hai, dùng câu có ràng buộc để tách hai trường hợp:

```
Gọi tool flaky của server mcp-probe với key là thu-nghiem-2. Nếu lỗi thì dừng lại và báo tôi, đừng gọi lại.
```

Nếu host vẫn gọi lại dù đã dặn dừng, đó là bằng chứng mạnh cho việc host tự thử lại.
Nếu model dừng đúng như dặn, ghi nhận là chưa thấy host tự thử lại.

### 7.2. Kiểm tra thời gian chờ

Gõ đúng câu:

```
Gọi tool slow của server mcp-probe với seconds=300 và báo tôi khi xong.
```

Bấm đồng hồ khi gửi câu lệnh.
Ghi lại thời điểm giao diện báo lỗi hoặc dừng chờ.
Trong log, tìm `slow_start` của lần đó.

Bốn kết quả có thể gặp:

- Có `slow_end` với `cancelled: false`: host chờ đủ 300 giây.
- Có `tool_cancelled`: host gửi yêu cầu hủy trước khi hết giờ.
- Có `http_client_disconnect`: host đóng kết nối HTTP giữa chừng.
- Không có `slow_end` và cũng không có hai dòng trên: có thể server vẫn đang chờ, hãy đợi thêm rồi xem lại.

Không kết luận vội khi mới thấy `slow_start`: nếu chưa đủ số giây đã xin, server vẫn đang chờ và chưa ghi `slow_end`.
`http_client_disconnect` có thể xuất hiện khi client đóng cả phiên, nên đọc kèm thời điểm `tool_cancelled` hoặc `slow_end` thay vì dùng một mình.

Nếu 300 giây quá lâu, thử lại với `seconds=30`, rồi `seconds=60`, để tìm ngưỡng gần đúng.
Ghi lại cả thời gian chờ thực tế của giao diện, không chỉ giá trị trong tham số.

### 7.3. Kiểm tra nút dừng

Trong một lần gọi `slow` với `seconds=300`, bấm nút dừng của giao diện sau khoảng 10 giây.
Xem log có `notifications/cancelled` và `tool_cancelled` không.
Nếu có, host biết hủy đúng cách.
Nếu không, host chỉ bỏ mặc kết nối.

### 7.4. Bảng kết quả P4 (thử lại và thời gian chờ)

| Bài thử | Hành vi quan sát | Số lần hoặc số giây | Bằng chứng (file:dòng) | Ghi chú |
| --- | --- | --- | --- | --- |
| `flaky` lần 1 |  |  |  |  |
| `flaky` có dặn đừng gọi lại |  |  |  |  |
| `slow` 300 giây |  |  |  |  |
| Ngưỡng cắt gần đúng |  |  |  |  |
| Bấm nút dừng |  |  |  |  |
| Có `notifications/cancelled` |  |  |  |  |

### 7.5. Cách kết luận P4 (thử lại và thời gian chờ)

Ghi rõ "host tự gọi lại" hay "model tự gọi lại" hay "không ai gọi lại".
Ghi rõ ngưỡng cắt là bao nhiêu giây và host có gửi hủy hay không.
Không suy ra ngưỡng của mọi tool từ một lần đo; đây chỉ là mẫu đầu tiên.

Kết quả này chỉ nói về lỗi ở tầng tool (`isError`); lỗi mạng hoặc lỗi giao thức có thể được host xử lý khác.

**Kết luận:** nếu host tự gọi lại tool lỗi thì mọi tool ghi dữ liệu của lab phải có mã chống ghi trùng ở phía server, vì host có thể gửi cùng một lệnh hai lần.

## 8. P5 (hiển thị và dấu vết): kết quả hiện ra sao và có vết không?

### 8.1. Kiểm tra structuredContent

Gõ đúng câu:

```
Gọi tool structured của server mcp-probe và cho tôi xem kết quả.
```

Quan sát:

- Host hiện JSON có cấu trúc, bảng, hay chỉ hiện đoạn text?
- Có nút mở rộng hoặc thu gọn không?
- Có hiện cả text lẫn dữ liệu có cấu trúc không?

Trong log, dòng `tool_result` của `structured` có cả `content` và `structuredContent`.
Đối chiếu đúng những trường đó với những gì giao diện hiển thị.

### 8.2. Kiểm tra isError

Chạy lại `flaky` với một key mới, ví dụ `hien-thi-loi`.
Quan sát cách giao diện hiển thị lỗi: màu đỏ, biểu tượng, nút thử lại, hay chỉ là chữ thường.
So sánh với cách một lỗi mạng hoặc lỗi gọi tool khác hiển thị, nếu có.

### 8.3. Kiểm tra dấu vết

Xem log:

```bash
grep -n '"kind":"http_request"' scratch/mcp-probe/log-20261116-150000-123.jsonl | head -5
grep -n '"kind":"extra_meta"' scratch/mcp-probe/log-20261116-150000-123.jsonl
```

Tìm các tên `traceparent`, `tracestate`, `baggage`, `x-request-id`, `x-correlation-id` trong header và trong `_meta`.
Nếu có, ghi lại dạng giá trị, không cần chép toàn bộ mã vết vào báo cáo.
Nếu không có, ghi rõ "không thấy dấu vết" thay vì kết luận nền tảng không có telemetry.

### 8.4. Kiểm tra thông tin token và chi phí

Xem giao diện chat có hiện số token vào hoặc ra, chi phí, hay thời gian xử lý không.
Xem thêm trong log các khóa `_meta` có chữ `token`, `usage`, `cost`.
Nếu host gửi, dòng `extra_meta` sẽ chứa chúng.
Nếu chỉ có `progressToken`, đó là tiến độ công việc, không phải chi phí.
Số token trên giao diện thường do nhà cung cấp model trả về, không phải do MCP server; ghi rõ nguồn nếu thấy.

### 8.5. Bảng kết quả P5 (hiển thị và dấu vết)

| Nội dung | Cách host hiển thị | Có trong log? | Bằng chứng (file:dòng) | Ghi chú |
| --- | --- | --- | --- | --- |
| `structuredContent` |  |  |  |  |
| Text đi kèm |  |  |  |  |
| `isError` |  |  |  |  |
| `traceparent` trong header |  |  |  |  |
| `traceparent` trong `_meta` |  |  |  |  |
| `x-request-id` hoặc tên tương tự |  |  |  |  |
| Số token trên giao diện |  |  |  |  |
| Chi phí trên giao diện |  |  |  |  |
| Khóa chi phí trong `_meta` |  |  |  |  |

### 8.6. Cách kết luận P5 (hiển thị và dấu vết)

Hiển thị đẹp không thay thế dữ liệu đúng.
Điều cần biết là host có giữ nguyên `structuredContent` hay chỉ hiển thị text, và lỗi có phân biệt được với kết quả bình thường không.
Nếu không có mã vết, lab phải tự sinh mã vết ở cổng kiểm soát để đạt SR7 (vết xuyên suốt).

**Kết luận:** nếu host không gửi và không hiển thị mã vết thì phần vết của lab phải bắt đầu từ cổng, không thể trông vào host.

## 9. Bảng tổng hợp để bàn giao

Điền bảng này sau khi chạy xong, mỗi dòng một câu kết luận ngắn.

| Câu hỏi | Kết luận một dòng | Độ tin cậy | Bằng chứng chính |
| --- | --- | --- | --- |
| P1 (giao thức và xác thực) |  |  |  |
| P2 (danh tính) |  |  |  |
| P3 (kênh duyệt) |  |  |  |
| P4 (thử lại và thời gian chờ) |  |  |  |
| P5 (hiển thị và dấu vết) |  |  |  |

Ba mức độ tin cậy:

- Cao: có log, có ảnh chụp, lặp lại được hai lần.
- Trung bình: có log nhưng chỉ một lần chạy.
- Thấp: chỉ có quan sát giao diện, không có log tương ứng.

**Kết luận:** chỉ những dòng có mức tin cậy cao hoặc trung bình mới được dùng để sửa khảo sát Thổ Thần và viết ADR-0001.

## 10. Sau khi chạy

1. Cập nhật mục 3.4 và mục 8 của `rd/appota/tho-than-platform.md` bằng kết quả thật, kèm tham chiếu log, đặc biệt giả thuyết H1.
2. Ghi lại chế độ nối đã dùng và chế độ chưa thử được.
3. Nếu P2 (danh tính) cho kết quả "không có danh tính", báo Kevin và ghi vào phần giả định của lab.
4. Nếu P3 (kênh duyệt) cho kết quả "không có điểm dừng", đưa kết luận đó vào phần lý do của ADR-0001.
5. Chỉ sau đó mới viết ADR-0001.
6. Giữ log và ảnh trong `scratch/`; không commit, không dán token hay dữ liệu thật lên kênh công khai.

Nếu giao diện chặn ở bước nào, ghi đúng lỗi và dừng, không tự suy ra kết quả.
Một kết quả "chưa thử được" vẫn có giá trị hơn một kết luận đoán.

**Kết luận:** bằng chứng của buổi đo phải đủ để người khác mở lại đúng file log và đọc đúng dòng, không cần hỏi lại người chạy.

## 11. Giới hạn của kịch bản này

- Agent không mở được giao diện Thổ Thần, nên mọi kết quả của năm câu hỏi phải do người dùng điền.
- Kết quả gắn với phiên bản 2.1.56 tại thời điểm đo; bản triển khai sau có thể khác.
- Chỉ dùng dữ liệu giả lập, không đụng dữ liệu thật của công ty.
- Probe không chạy máy chủ OAuth và không chạy transport SSE cũ, nên không thử được hai chế độ đó.
- Chỉ có một máy và một mạng, chưa đo được ảnh hưởng của mạng chậm.
- Số lần chạy nhỏ, không dùng để nói về độ ổn định dài hạn.
- Việc phân biệt host tự gọi lại và model tự gọi lại cần quan sát giao diện, log một mình không đủ.

**Kết luận:** kết quả của kịch bản này là bằng chứng định tính cho quyết định thiết kế, chưa phải số đo hiệu năng hay chi phí.

## 12. Nguồn và công cụ

- Server, cách chạy và cách đọc log: [README của probe](../../tools/mcp-probe/README.md).
- Mã tool và chú thích: `tools/mcp-probe/src/server.ts`.
- Bộ tự kiểm tra: `tools/mcp-probe/src/selftest.ts`.
- Đặc tả MCP, transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Đặc tả MCP, tools và annotations: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Đặc tả MCP, elicitation: https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
- Khảo sát Thổ Thần (bản trong nhánh chính): `rd/appota/tho-than-platform.md`.
- Tổng hợp phát hiện (bản trong nhánh chính): `rd/findings.md`.

**Kết luận:** mọi bằng chứng trong tài liệu này trỏ tới một file trong repo hoặc một trang đặc tả công khai, nên người sau mở lại được.
