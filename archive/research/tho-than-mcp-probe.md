# Cắm MCP probe vào Thổ Thần: kịch bản đo P1-P5

Ngày: 2026-11-17. Trạng thái: đã chạy đủ năm câu hỏi, kiểm khoá riêng và đo đường HTTPS công khai (mục 4.8); còn thiếu tài khoản thứ hai và phép đo cổng đóng vai mô hình (mục 5.6).

## Đọc nhanh

- Nối qua địa chỉ HTTPS công khai thì chat gọi được công cụ trên cả web lẫn desktop; địa chỉ localhost chỉ chạy được ở Test connection.
- Lời gọi trong chat đi qua máy chủ Thổ Thần, và máy chủ gắn thêm mã người dùng, email, mã agent cùng mã nơi chạy.
- Khoá Bearer do người thêm skill đặt; phép đo chỉ dùng một tài khoản và một skill, nên chưa biết khoá riêng từng người hay dùng chung.
- App không hỏi duyệt trước khi ghi, kể cả ở chế độ duyệt tay, và không có biểu mẫu hỏi người dùng; link trong kết quả bấm được.
- Công cụ lỗi không được tự gọi lại; app cắt sau 60 giây; dữ liệu có cấu trúc và mã vết không hiện.

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

**Kết luận:** P2 (danh tính) và P3 (kênh duyệt) đã có kết quả, và cả hai đều thiếu ở host; vì vậy ADR-0001 phải giả định lab tự dựng danh tính và kênh duyệt, không chờ host làm sẵn.

## 2. Chuẩn bị

### 2.1. Dựng server và chạy tự kiểm tra

Chạy trong thư mục repo:

```bash
cd archive/research/mcp-probe
npm install
npm run build
npm run selftest
```

Kết quả đúng phải có một dòng dạng `SELFTEST PASSED: <số> checks`.
Nếu chưa đạt, dừng lại và báo lỗi nguyên văn, không chạy tiếp phần giao diện.

Hướng dẫn đầy đủ về build và tham số nằm ở [README của probe](mcp-probe/README.md).

### 2.2. Thêm server vào Thổ Thần

Các bước chi tiết nằm ở mục 6 của README.
Tóm tắt: mở Cài đặt, tìm mục MCP server, thêm server tùy chỉnh, chọn Streamable HTTP với URL `http://localhost:8787/mcp`, hoặc chọn stdio với command và args ở mục 3 của README.
Đặt tên `mcp-probe`, lưu, rồi bật server này cho agent đang dùng.
Danh sách đúng phải có 8 tool.
Nếu form chỉ có SSE, ghi lại làm bằng chứng P1 (giao thức và xác thực) và dừng, vì probe không chạy SSE cũ.

**Kết luận:** chỉ chuyển sang bước đo khi danh sách 8 tool hiện ra trong giao diện; nếu không hiện thì xử lý theo bảng lỗi ở mục 10 của README trước.

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
cd archive/research/mcp-probe
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
node archive/research/mcp-probe/dist/summarize.js scratch/mcp-probe/log-20261116-150000-123.jsonl
```

### 2.5. Chuẩn bị hai tài khoản cho P2 (danh tính)

Cần tài khoản A và tài khoản B, ví dụ tài khoản của bạn và một tài khoản thử của người khác.
Không nhập mật khẩu, token hay dữ liệu thật vào bất kỳ ô nào của probe.
Nếu không có tài khoản thứ hai, ghi rõ P2 (danh tính) chỉ có một mẫu và đánh dấu độ tin cậy trung bình.
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

Ghi lại: host có kết nối được không, có hiện 8 tool không, `protocolVersion` là gì.
Trong log, tìm dòng `session_init` đầu tiên và dòng `tool_call` đầu tiên.

### 4.2. Thử stdio

Dừng server HTTP.
Trong Thổ Thần, thêm MCP server kiểu stdio với command là đường dẫn tuyệt đối tới node và args gồm đường dẫn tuyệt đối tới `archive/research/mcp-probe/dist/index.js` rồi `--stdio`.
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
Đã thử ngày 2026-11-17, kết quả ở mục 4.8.

### 4.5. Ghi nhận OAuth2

Nếu form của Thổ Thần có lựa chọn OAuth2, hoặc host tự chuyển sang luồng đăng nhập khi gặp 401, ghi lại.
Probe không chạy máy chủ OAuth, nên mọi yêu cầu tới `/.well-known/...` sẽ trả 404 và được ghi thành dòng `well_known_probe`.
Đó là bằng chứng host có dò OAuth, không phải bằng chứng OAuth chạy được.
Probe cũng không quảng bá metadata OAuth trong header `WWW-Authenticate`, nên host có thể không thử.
Kết quả "không thấy" chỉ có nghĩa là chưa thử được, không phải host không hỗ trợ OAuth2.

### 4.6. Bảng kết quả P1 (giao thức và xác thực)

| Chế độ | Kết nối được? | `protocolVersion` trong log | Xác thực quan sát được | Bằng chứng (file:dòng) | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Streamable HTTP localhost, không bearer | Test connection: có. Chat: không, báo `fetch failed`, server không nhận request. | 2025-11-25 | Không có Authorization; `user-agent: node` | `log-20261116-194146-662.jsonl:12` (initialize), `:8-21` (Test connection), `:24` (7 tool); ảnh `p1-09`, `p1-11`, `p2-01`; log IPv6 `log-20261116-201053-131.jsonl` | Chat đi qua máy chủ Thổ Thần nên không tới localhost; xác nhận ngày 2026-11-17 ở mục 4.8. |
| stdio | Có, chat gọi được đủ 7 tool. | 2025-11-25 | Không có header (stdio). | `log-20261116-203102-671.jsonl:4` (initialize), `:8` (whoami); ảnh `p1-13`, `p2-02` | Mỗi lần gọi tool là một tiến trình mới, PID khác nhau. |
| Streamable HTTP localhost, bearer | Test connection: có, header `Bearer...(len=26)`. Chat: không tới server. | 2025-11-25 | Có `Authorization: Bearer`; khoá do người thêm skill đặt | `log-20261116-194146-662.jsonl:40-41`, `:55-56`, `:59-60`, `:74-75`; ảnh `h8-03` | Xem mục 5.5. |
| HTTPS từ xa qua tunnel | Có, ở Test connection và trong chat, cả web lẫn desktop. | 2025-11-25 | `Bearer...(len=39)`; log ghi `bearer_ok`; máy chủ Thổ Thần gắn `x-user-id`, `x-user-email`, `x-agent-id`, `x-executor-id` | `log-20261117-171748-473.jsonl:119` (desktop), `:139` (web); chi tiết ở mục 4.8 | Đo ngày 2026-11-17 qua tunnel tạm, đã đóng. |
| OAuth2 | Không có lựa chọn trong UI. | - | - | ảnh `p1-06` | UI chỉ có No auth và API Key. |

Kết quả P1 (giao thức và xác thực): H1 đúng, instance có mục MCP và cài được skill tùy chỉnh (ảnh `p1-01` đến `p1-08`).
Ngày 2026-11-16, HTTP Test connection chạy tại máy và liệt kê đủ 7 tool, nhưng lời gọi lúc chat không tới server.
Log HTTP chỉ có initialize và tools/list của Test connection, không có `tools/call`; log IPv6 cũng chỉ có 3 dòng khởi động.
Điều này khớp với lời gọi chat đi qua máy chủ Thổ Thần ở cloud, còn Test connection chạy cục bộ.
Ngày 2026-11-17, phép đo qua HTTPS công khai (mục 4.8) xác nhận đúng như vậy và cho chat gọi được tool.
Bearer đã thử ở cả Test connection và chat; OAuth2 chưa có lựa chọn trong giao diện.

### 4.7. Cách kết luận P1 (giao thức và xác thực)

Một chế độ được coi là chạy được khi log có `session_init` của host và ít nhất một `tool_call`.
Không coi là chạy được nếu chỉ thấy kết nối TCP mà không có initialize.
Nếu nhiều chế độ cùng chạy, ghi rõ chế độ nào dễ cấu hình nhất cho người dùng cuối.

**Kết luận:** ngày 2026-11-16, chế độ nối duy nhất gọi được tool trong chat là stdio.
HTTP localhost chỉ dùng được cho Test connection.
Ngày 2026-11-17, Streamable HTTP qua một địa chỉ HTTPS công khai gọi được trên cả web lẫn desktop (mục 4.8), nên giới hạn cũ không còn là giới hạn của giao thức.
Câu còn mở là địa chỉ công khai đó chạy ở đâu và ai trả tiền cho nó; OAuth2 vẫn chưa thử được.

### 4.8. Kết quả đo qua HTTPS công khai ngày 2026-11-17 (S1-S6)

Phép đo này nối probe qua một tunnel Cloudflare trong 6 phiên, rồi dùng skill `mcp-probe` trên Thổ Thần web và desktop.
Sáu câu S1-S6 mở rộng P1 (giao thức và xác thực) sang đường HTTPS công khai, và đồng thời cung cấp dữ liệu cho P2 (danh tính) và P3 (kênh duyệt).

| Mã | Câu hỏi | Kết quả | Bằng chứng (file:dòng) |
| --- | --- | --- | --- |
| S1 (Test connection qua URL công khai) | Test connection có tới probe không, request mang header gì? | Có. Với token đúng, probe nhận `POST /mcp` trả `202` rồi `200`, log ghi `bearer_ok`; sau đó Thổ Thần mở thêm `GET /mcp` cho luồng SSE, cũng `bearer_ok`. Form chỉ có No auth và API Key, không có OAuth2. | `log-20261117-152301-143.jsonl:9`, `:25`; `log-20261117-161011-154.jsonl:38`, `:41`; ảnh `s2-01-add-custom-mcp-form.png` |
| S2 (request tới từ đâu) | Request tới từ máy người dùng hay từ máy chủ Thổ Thần? | Từ máy chủ Thổ Thần. `remoteAddress` là `127.0.0.1` vì đi qua cloudflared; địa chỉ thật ở `cf-connecting-ip` là máy chủ Thổ Thần, `cf-ipcountry: SG`, `cf-ray` kết thúc `-SIN`. Máy người dùng có `cf-ipcountry: VN`. | `log-20261117-130339-240.jsonl:4` (từ máy người dùng, VN), `:17` (từ Thổ Thần, SG) |
| S3 (chat web gọi `whoami`) | Chat web gọi được tool không, có mang Bearer không? | Có. Sau khi bật skill `mcp-probe` (HTTP) thay cho `mcp-probe-stdio`, chat web gọi `whoami` được. Probe nhận `POST /mcp` từ máy chủ Thổ Thần ở Singapore, `user-agent: node`, `Authorization` dài 39 ký tự, `bearer_ok`, và `whoami` trả đủ dữ liệu. | `log-20261117-171748-473.jsonl:139` (`tool_call whoami`), `:140` (`tool_result`) |
| S4 (chat desktop với cùng skill HTTPS) | Chat desktop có chạy không, tới từ đâu? | Có. Chat desktop với cùng skill HTTP gọi `whoami` được; request cũng tới từ máy chủ Thổ Thần ở Singapore, `clientInfo.name: lobehub-mcp-client`, Bearer dài 39 ký tự, `bearer_ok`. Tức desktop cũng đi qua máy chủ Thổ Thần, không gọi thẳng từ máy. | `log-20261117-171748-473.jsonl:119` (`tool_call whoami`), `:120` (`tool_result`) |
| S5 (sai token) | Sai token thì giao diện báo gì, probe ghi gì? | Giao diện báo `Failed to fetch manifest: Streamable HTTP error: Error POSTing to endpoint: {"jsonrpc":"2.0","error":{"code":-32000,"message":"Unauthorized: mismatch..."}}`. Probe ghi `http_auth` với `reason: mismatch` và trả `401`; mỗi lần Test, Thổ Thần gửi 4 request liên tiếp, đều 401. | `log-20261117-130339-240.jsonl:18-19`, `:20-28`; `log-20261117-155510-994.jsonl:31-40`; ảnh `s2-02-web-wrong-token-error.png` |
| S6 (`fake_write` và `echo_link`) | Chế độ duyệt tay có hỏi trước khi ghi không, link có bấm được không? | `fake_write` chạy ngay, không hiện hộp duyệt, trên cả web lẫn desktop; kết quả là bản chạy thử và ghi rõ không có dữ liệu nào thay đổi. Giao diện hiện cả `Off` lẫn `Manual`, nên chưa biết cách bật chế độ duyệt đúng. Trước đó desktop có hỏi duyệt cho `mcp-probe-stdio`, tức host biết hỏi với một số tool, nhưng không hỏi với skill HTTP. `echo_link` trả link bấm được; bấm link mở trang duyệt của probe, request tới từ máy người dùng, không qua máy chủ Thổ Thần. | `log-20261117-171748-473.jsonl:158` (`tool_call fake_write`), `:169` và `:180` (`echo_link`), `:276` (`approve_visit`); `log-20261117-181600-811.jsonl:40` (`tool_call fake_write` trên desktop), `:42` (`tool_result`) |

Request `whoami` trong chat mang bộ header sau, rút từ trường `http.headers` của dòng `tool_call`.

| Header | Giá trị quan sát |
| --- | --- |
| `user-agent` | `node` |
| `authorization` | `Bearer...(len=39)` |
| `cf-connecting-ip` | địa chỉ của máy chủ Thổ Thần ở Singapore |
| `cf-ipcountry` | `SG` |
| `cf-ray` | kết thúc `-SIN` |
| `x-forwarded-for` | cùng địa chỉ |
| `x-user-id` | `user_` cộng 24 ký tự |
| `x-user-email` | email thật của tài khoản; không chép giá trị vào tài liệu |
| `x-agent-id` | `agt_...` |
| `x-executor-id` | trùng `x-user-id` |
| `mcp-session-id` | mã phiên Streamable HTTP |
| `mcp-protocol-version` | `2025-11-25` |

Nhóm Test connection có cùng bộ header máy chủ, nhưng không có `x-agent-id` và `x-executor-id`.
Bốn header danh tính không do LobeHub 2.1.56 sinh ra: [khảo sát Thổ Thần, mục 6.2](../../rd/research/tho-than-platform.md#62-lời-gọi-mcp-trong-chat-không-có-danh-tính-do-lobehub-đặt) đọc mã nguồn và thấy client chỉ gửi header do người dùng cấu hình.
Vì vậy các header này do máy chủ Thổ Thần gắn thêm.

Ba hệ quả cho P2 (danh tính) và P3 (kênh duyệt).

- Khoá Bearer do người thêm skill đặt, không phải Thổ Thần cấp riêng cho từng người.
  Phép đo chỉ dùng một tài khoản và một skill, nên chưa biết mỗi người giữ một khoá riêng hay cả tổ chức dùng chung một khoá.
  Câu hỏi này đã gửi Kevin.
- Ai có token gọi thẳng endpoint cũng tự đặt được `x-user-id`, nên header này chỉ đáng tin khi request chắc chắn đến từ máy chủ Thổ Thần, ví dụ nhờ chữ ký hoặc dải IP cố định (chưa kiểm).
  Vì vậy cổng của Lab vẫn tự kiểm khoá, và chỉ dùng `x-user-id` làm lớp thứ hai khi biết chắc nguồn gửi.
- Thổ Thần không có bước duyệt cho tool ghi qua HTTP, nên cổng của Lab phải tự hỏi duyệt trước khi ghi.

Sáu phiên tunnel của phép đo:

| Phiên | Giờ mở | Giờ tắt | Thời lượng |
| --- | --- | --- | --- |
| 1 | 13:01:55 | khoảng 14:40 | khoảng 98 phút |
| 2 | 13:39:00 | khoảng 14:58 | khoảng 79 phút |
| 3 | 15:22:09 | 15:53:42 | 31 phút |
| 4 | 15:54:40 | 17:01 | khoảng 66 phút |
| 5 | 17:17:16 | 18:01:07 | 44 phút |
| 6 | 18:15:01 | 18:22:04 | 7 phút |

Ba phiên 1, 2 và 4 vượt giới hạn 60 phút mỗi phiên; lần chạy sau cần hẹn giờ tắt trước.
Số credit không xem được ở chỗ nào mà không kèm email; menu tài khoản chỉ hiện 0 agent, 9 topic và 70 message.

**Kết luận:** H7 đúng: mọi lời gọi MCP qua HTTP trong chat web và chat desktop đều đi qua máy chủ Thổ Thần, nên cổng của Lab chỉ cần một địa chỉ HTTPS công khai, không phải cài trên máy từng người.
Khoá Bearer và header danh tính không đủ để chứng minh người gọi, nên cổng tự kiểm khoá và không tin `x-user-id` khi request có thể đến từ nơi khác.

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
| `clientInfo` (tên và phiên bản app) | `thothan-desktop-mcp-client` 1.0.0 | Chưa có tài khoản B | Không so sánh được | `log-20261116-203102-671.jsonl:4`, `log-20261116-194146-662.jsonl:12` |
| `capabilities` | `{}` | Chưa có | Không so sánh được | hai dòng trên |
| `protocolVersion` | 2025-11-25 | Chưa có | Không so sánh được | hai dòng trên |
| Header Authorization (đã che) | Không có | Chưa có | Không so sánh được | `log-20261116-194146-662.jsonl:5` (no_auth_header) |
| Header Cookie (đã che) | Không có ở client MCP; chỉ trình duyệt khi bấm link, đã che | Chưa có | Không so sánh được | `log-20261116-194146-662.jsonl:8` (không cookie), `:29-30` (cookie trình duyệt) |
| Header dạng `x-user-*`, `x-forwarded-*` | Không có | Chưa có | Không so sánh được | `log-20261116-194146-662.jsonl:12`, `log-20261116-203102-671.jsonl:4` |
| Địa chỉ nguồn (`remoteAddress`) | 127.0.0.1 khi HTTP Test connection; stdio không có | Chưa có | Không so sánh được | `log-20261116-194146-662.jsonl:8` |
| Mã phiên (`sessionId`) | HTTP có UUID; stdio là null | Chưa có | Không so sánh được | `log-20261116-194146-662.jsonl:12`, `log-20261116-203102-671.jsonl:4` |
| `_meta` của lần gọi tool | null | Chưa có | Không so sánh được | `log-20261116-203102-671.jsonl:8` |
| Trường lạ trong `_meta` (`extra_meta`) | Không có | Chưa có | Không so sánh được | không có dòng `extra_meta` trong log |

Kết quả P2 (danh tính): server chỉ thấy `clientInfo` là tên ứng dụng, không thấy tài khoản.
Không có Authorization, không có header người dùng, không có `_meta`.
Cookie chỉ xuất hiện ở lượt trình duyệt mở link duyệt, không phải ở client MCP.
Chưa có tài khoản B nên độ tin cậy trung bình; nếu có tài khoản thứ hai, chạy lại `whoami` để xác nhận hai tài khoản trông giống nhau.

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

### 5.5. Khoá riêng của từng người (H8)

Host không gửi danh tính, nên Lab thử đường thay thế: người thêm skill đặt một khoá riêng vào cấu hình skill.
Probe in các biến môi trường tên bắt đầu bằng `LAB_` vào trường `labEnv`, đã che còn 6 ký tự đầu cộng độ dài.
Khoá thử là giá trị giả lập, không phải bí mật.

| Đường thử | Có tới server không | Server thấy (đã che) | Đổi khoá có hiệu lực ngay? | Bằng chứng (file:dòng) |
| --- | --- | --- | --- | --- |
| stdio, biến môi trường `LAB_USER_KEY=hoa-thu-nghiem-0001` | Có, cả Test connection lẫn gọi trong chat | `hoa-th...(len=19)` | - | `log-20261116-215523-443.jsonl:1` (Test connection), `log-20261116-221252-985.jsonl:1` và `:9` (whoami); ảnh `h8-01`, `h8-02` |
| stdio, đổi thành `nam-thu-nghiem-0002` | Có | `nam-th...(len=19)` | Có, không mở lại app | `log-20261116-223302-578.jsonl:1`, `log-20261116-224038-918.jsonl:1` và `:9`; `h8-04-stdio-whoami-nam.json` |
| HTTP, kiểu xác thực "API Key" `hoa-thu-nghiem-0001` | Có, ở Test connection (chat qua HTTP vẫn `fetch failed`) | Header `authorization` = `Bearer...(len=26)`, tức `Bearer ` cộng khoá 19 ký tự | Chưa thử | `log-20261116-194146-662.jsonl:40-41`, `:55-56`, `:59-60`, `:74-75`; ảnh `h8-03` |

Form cài skill stdio ban đầu không hiện ô biến môi trường.
Pi thêm biến qua "Import JSON config" với khoá `env`; sau đó form hiện mục "MCP server env vars".
Đổi khoá có hiệu lực ngay vì mỗi lần gọi stdio là một tiến trình mới, đọc lại biến môi trường.
Ô "API Key" của HTTP thực chất gửi header chuẩn `Authorization: Bearer <khoá>`, không có `x-api-key`.

Chưa thử ở phép đo này: server từ chối khoá sai (probe HTTP chạy không `--bearer`), đổi khoá HTTP, và hai tài khoản khác nhau.
Phép đo HTTPS ngày 2026-11-17 đã thử khoá sai ở Test connection (mục 4.8, S5).
Khoá thử vẫn còn trong cấu hình hai skill `mcp-probe` và `mcp-probe-stdio`, cần xoá sau khi chốt.

**Kết luận:** server không nhận được danh tính người dùng từ phía client, nhưng khoá riêng do người thêm skill đặt thì tới được server qua cả hai đường.
Phép đo ngày 2026-11-17 cho thấy trong chat, máy chủ Thổ Thần gắn thêm `x-user-id`, `x-user-email`, `x-agent-id` và `x-executor-id` (mục 4.8).
Phép đo chỉ dùng một tài khoản và một skill, nên chưa biết khoá là riêng từng người hay dùng chung, và ai có token gọi thẳng endpoint cũng tự đặt được `x-user-id`.
Cổng của Lab cấp mỗi nhân vật giả một khoá riêng, tự kiểm khoá, thu hồi được và che khoá trong log; khoá chỉ chứng minh "người cài công cụ", không phải một lần đăng nhập.
Độ tin cậy của phần "host không gửi danh tính" vẫn trung bình vì chỉ có một tài khoản; báo Kevin vì đây là giới hạn của nền tảng.

### 5.6. Cổng đóng vai nhà cung cấp mô hình: lời gọi mô hình có danh tính không?

Đây là câu hỏi cho mô hình kiến trúc thứ ba: quản trị khai cổng là một nhà cung cấp mô hình trong Thổ Thần, và Thổ Thần gửi câu hỏi tới cổng như gửi tới một mô hình.
Nếu mỗi lời gọi mô hình mang theo danh tính người dùng, cách này giữ được quyền theo người.
Nếu không, nó lặp lại lỗi tài khoản dùng chung và không đáng dựng.

Chuẩn bị:

1. Mở một tunnel tới cổng 8787 như mục 4.4 và lấy địa chỉ HTTPS.
2. Chạy probe ở chế độ provider với một khoá thử và địa chỉ tunnel:
   ```bash
   node dist/index.js --openai-provider --port 8787 --bearer khoa-thu-nghiem --public-url https://ten-mien-tunnel.example
   ```
3. Trong Thổ Thần web, thêm nhà cung cấp mô hình kiểu OpenAI-compatible với base URL `https://<tên-miền-tunnel>/v1`, API key là khoá trên, model `mcp-probe-fixed`.
4. Đăng nhập tài khoản A, mở một chat mới dùng nhà cung cấp đó, gửi một câu, ví dụ `Xin chào, đây là dữ liệu giả lập.`
5. Nếu có tài khoản B, lặp lại bước 4 với tài khoản B mà không đổi cấu hình.
6. Đọc log:
   ```bash
   node archive/research/mcp-probe/dist/summarize.js scratch/mcp-probe/
   ```

Bảng cần điền:

| Trường | Ý nghĩa | Tài khoản A | Tài khoản B | Kết luận |
| --- | --- | --- | --- | --- |
| `openai_request.user` | trường `user` chuẩn của OpenAI, nếu host gửi | chưa đo | chưa đo | |
| `openai_request.userPresent` | host có gửi trường này không | chưa đo | chưa đo | |
| `identityHeaders.authorization` | khoá đã che, chỉ để biết host có gửi hay không | chưa đo | chưa đo | |
| `identityHeaders.x-user-id` | mã người dùng do máy chủ Thổ Thần gắn | chưa đo | chưa đo | |
| `identityHeaders.x-user-email` | email, không chép giá trị vào tài liệu | chưa đo | chưa đo | |
| `identityHeaders.x-agent-id` | mã agent | chưa đo | chưa đo | |
| `identityHeaders.x-executor-id` | mã nơi chạy | chưa đo | chưa đo | |

Cách kết luận:

- `user` hoặc `x-user-id` khác nhau giữa hai tài khoản: lời gọi mô hình có danh tính, đủ để đưa cách thứ ba vào phần so sánh ở bước đánh giá.
- Mọi trường giống nhau hoặc không có: cổng đóng vai mô hình lặp lại lỗi tài khoản dùng chung, dừng hướng này và ghi rõ trong ADR.

**Kết luận:** kết quả còn trống vì cần một phiên tunnel và tài khoản thứ hai.
Khi đo xong, điền bảng này và dẫn kết quả vào [khảo sát Thổ Thần, mục 6.3](../../rd/research/tho-than-platform.md#63-lời-gọi-model-có-danh-tính-nhưng-trong-body), nơi đang kết luận từ mã nguồn rằng lời gọi model có trường `user`.

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
| `whoami` có hỏi duyệt trước khi chạy? | Không | `p2-02`, `log-20261116-203102-671.jsonl:8` | Không có hộp thoại. |
| `fake_write` có hỏi duyệt trước khi chạy? | Không, cả Auto Approve lẫn Manual, cả topic mới | `p3-02`, `p3-03`; `log-20261116-203315-739.jsonl:8`, `log-20261116-203504-441.jsonl:8`, `log-20261116-203739-177.jsonl:8` | Tool chạy ngay, không có bước bấm duyệt. |
| Thời điểm `tool_call` so với lúc bấm duyệt | Không có bước bấm duyệt; `tool_call` ngay sau câu lệnh | các dòng trên | Không có mốc duyệt để so. |
| Tắt được duyệt trong cài đặt? | Có menu Auto Approve, Allow List, Manual, Bypass Security; Manual vẫn không hỏi | `p3-01`, `p3-03` | Manual không chặn MCP tool. |
| `ask_confirm` hiện biểu mẫu? | Không | `p3-04` | Trả về text "không hỗ trợ". |
| Nhánh elicitation trong log | `unsupported`, capabilities `{}` | `log-20261116-203857-876.jsonl:9` | Host không khai báo elicitation. |
| Link Markdown bấm được? | Có, chữ xanh, mở trình duyệt | `p3-05` | So với URL thô trong khối code. |
| Trang duyệt mở được? | Có, trang giả lập mở trong Zen | `p3-06` | Do probe HTTP ở cổng 8787 phục vụ. |
| `approve_visit` có User-Agent và Referer? | UA Firefox 159; Referer null; cookie đã che | `log-20261116-194146-662.jsonl:30` | Trình duyệt gửi cookie, không phải client MCP. |

Kết quả P3 (kênh duyệt): host không có điểm dừng trước tool ghi.
Auto Approve và Manual đều gọi `fake_write` ngay; thử lại trong topic mới vẫn vậy.
Tool card chỉ hiện tên và tham số, không cảnh báo `destructiveHint`.
`ask_confirm` nhận capabilities `{}` nên trả về nhánh unsupported, không có biểu mẫu.
Link Markdown bấm được và mở trang duyệt; `approve_visit` ghi UA Firefox, Referer null.

### 6.6. Cách kết luận P3 (kênh duyệt)

Một kênh duyệt chỉ được tính là có nếu nó chặn được lệnh trước khi tool chạy, không chỉ hiện thông báo sau khi chạy.
Link bấm được chứng minh khả năng hiển thị, không chứng minh đó là kênh duyệt an toàn.
Elicitation là kênh duyệt đúng nghĩa nếu host hiện biểu mẫu và chỉ gửi câu trả lời sau khi người dùng bấm gửi.

**Kết luận:** host không có kênh duyệt cho MCP tool.
Lab phải tự dựng cổng duyệt ngoài host cho SR4 (điểm dừng rủi ro); link Markdown chỉ là kênh hiển thị, không phải kênh duyệt an toàn.
Elicitation không dùng được vì host không khai báo và không hiện biểu mẫu.

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
Gọi tool slow của server mcp-probe với seconds=30 và báo tôi khi xong.
```

Bấm đồng hồ khi gửi câu lệnh.
Ghi lại thời điểm giao diện báo lỗi hoặc dừng chờ.
Trong log, tìm `slow_start` của lần đó.

Bốn kết quả có thể gặp:

- Có `slow_end` với `cancelled: false`: host chờ đủ số giây đã xin.
- Có `tool_cancelled`: host gửi yêu cầu hủy trước khi hết giờ.
- Có `http_client_disconnect`: host đóng kết nối HTTP giữa chừng.
- Không có `slow_end` và cũng không có hai dòng trên: có thể server vẫn đang chờ, hãy đợi thêm rồi xem lại.

Không kết luận vội khi mới thấy `slow_start`: nếu chưa đủ số giây đã xin, server vẫn đang chờ và chưa ghi `slow_end`.
`http_client_disconnect` có thể xuất hiện khi client đóng cả phiên, nên đọc kèm thời điểm `tool_cancelled` hoặc `slow_end` thay vì dùng một mình.

Kết quả đo cho thấy host cắt ở 60 giây; để xác nhận, thử thêm `seconds=60` và `seconds=120`.
Ghi lại cả thời gian chờ thực tế của giao diện, không chỉ giá trị trong tham số.

### 7.3. Kiểm tra nút dừng

Trong một lần gọi `slow` với `seconds=120`, bấm nút dừng của giao diện sau khoảng 10 giây.
Xem log có `notifications/cancelled` và `tool_cancelled` không.
Đối chiếu mốc hủy với mốc bấm dừng: nếu lệch nhiều thì nút dừng không gửi hủy ngay.
Nếu có hủy đúng lúc, host biết hủy đúng cách.
Nếu không, host chỉ bỏ mặc kết nối.

### 7.4. Bảng kết quả P4 (thử lại và thời gian chờ)

| Bài thử | Hành vi quan sát | Số lần hoặc số giây | Bằng chứng (file:dòng) | Ghi chú |
| --- | --- | --- | --- | --- |
| `flaky` lần 1 | `isError: true`, model không tự gọi lại | 1 lần | `log-20261116-204146-204.jsonl:9` (attempt 1), `:10` (isError true); `p4-01` | Model nói rõ không retry. |
| `flaky` có dặn đừng gọi lại | Dừng đúng như dặn, chỉ 1 lần | 1 lần | `log-20261116-205848-488.jsonl:9` (attempt 1), `:10` (isError true); `p4-09` | Key `thu-nghiem-2`. |
| `flaky` lần 2 cùng key | Vẫn attempt 1 vì tiến trình mới, `isError: true` | 1 lần | `log-20261116-204240-153.jsonl:9`; PID ở `:1`; `p4-02` | PID 38324 khác PID 4760 ở `log-20261116-204146-204.jsonl:1`. |
| `slow` 30 giây | Xong sau 30.278 giây, không timeout | 30 giây | `log-20261116-204458-659.jsonl:9-10`; `p4-03` | Không có progressToken. |
| `slow` 60 giây | Bị hủy ở 60.013 giây; UI hiện X đỏ, lượt chat treo đến khi bấm dừng | 60 giây | `log-20261116-204645-611.jsonl:11-13`; `p4-04`, `p4-06` | Host gửi `notifications/cancelled`. |
| `slow` 120 giây | Bị hủy ở 60.008 giây, cùng ngưỡng | 60 giây | `log-20261116-205049-979.jsonl:11-13`; `p4-07` | Ngưỡng cố định 60 giây. |
| Ngưỡng cắt gần đúng | 60 giây | 60 giây | hai dòng trên | 30 xong, 60 và 120 bị cắt ở 60. |
| Bấm nút dừng | UI "Interrupted" ngay; log chỉ nhận hủy ở 60.009 giây; tiến trình vẫn sống lúc 14 giây | 60 giây | `log-20261116-205304-745.jsonl:11-13`; `p4-08` | Nút dừng không hủy ngay. |
| Có `notifications/cancelled` | Có, ở mốc 60 giây; không có progress | - | các log trên | Không có `tool_progress`. |
| ProgressToken | Không có | 0 | `slow_start.progressToken=null` ở cả bốn lần | Host không gửi `_meta.progressToken`. |

Kết quả P4 (thử lại và thời gian chờ): host không tự gọi lại khi tool trả `isError`.
Mỗi lần gọi stdio là một tiến trình mới, nên bộ đếm `flaky` reset; vì vậy lần gọi lại cùng key vẫn là "lần 1".
Host cắt mọi tool ở 60 giây: `slow` 30 xong, `slow` 60 và 120 bị hủy ở khoảng 60 giây.
Lý do trong lệnh hủy là `MCP error -32001: Request timed out` (`log-20261116-205049-979.jsonl:10`).
Mã lỗi và con số 60 giây khớp với thời gian chờ mặc định của bộ thư viện MCP chính thức cho TypeScript, nên nhiều khả năng app chưa chỉnh giá trị này; cần đọc mã nguồn LobeHub để xác nhận.
Nút dừng chỉ đổi giao diện; log không nhận hủy cho đến mốc 60 giây.
Host không gửi progressToken.

### 7.5. Cách kết luận P4 (thử lại và thời gian chờ)

Ghi rõ "host tự gọi lại" hay "model tự gọi lại" hay "không ai gọi lại".
Ghi rõ ngưỡng cắt là bao nhiêu giây và host có gửi hủy hay không.
Không suy ra ngưỡng của mọi tool từ một lần đo; đây chỉ là mẫu đầu tiên.

Kết quả này chỉ nói về lỗi ở tầng tool (`isError`); lỗi mạng hoặc lỗi giao thức có thể được host xử lý khác.

**Kết luận:** lab phải có timeout riêng dưới 60 giây, mã chống ghi trùng cho SR6 (không ghi trùng), và không dựa vào state trong bộ nhớ vì mỗi lần gọi stdio là một tiến trình mới.
Không được dựa vào nút dừng của host để hủy tool.

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
| `structuredContent` | Không hiện; chỉ hiện text | Có | `p5-01`; `log-20261116-204407-340.jsonl:9` | Host nhận nhưng không hiển thị. |
| Text đi kèm | Hiện nguyên câu text | Có | `p5-01` | Không có bảng hay JSON. |
| `isError` | Không hiện rõ; tool card `flaky` vẫn có dấu check xanh, model tự giải thích | Có | `p4-01`; `log-20261116-204146-204.jsonl:10` | X đỏ của `slow` là timeout của host, không phải `isError` của server. |
| `traceparent` trong header | Không có | Không | `log-20261116-194146-662.jsonl:12` | Không có trong request của client. |
| `traceparent` trong `_meta` | Không có | Không | `log-20261116-194146-662.jsonl:12`, `:8` | Không có dòng `extra_meta`. |
| `x-request-id` hoặc tên tương tự | Không có | Không | các dòng trên | Không có `x-correlation-id`, `baggage`. |
| Số token trên giao diện | Không hiện; chỉ có "Deeply Thought" và thời gian | Không | `p4-01`, `p5-01` | Không có số token vào/ra. |
| Chi phí trên giao diện | Tài khoản tính credit (FREE 500/kỳ), không phải token | Không có trong log | ghi chú bàn giao P1-P5 | Không chụp Profile vì có email thật. |
| Khóa chi phí trong `_meta` | Không có | Không | không có `extra_meta` | Không có `usage`, `cost`, `token`. |

Kết quả P5 (hiển thị và dấu vết): `structuredContent` có trong log nhưng không hiện; giao diện chỉ hiện text.
`isError: true` của `flaky` không được đánh dấu lỗi; tool card vẫn có dấu check xanh.
Không có `traceparent`, `tracestate`, `x-request-id` trong header hay `_meta`.
Không có token hay chi phí trong log; tài khoản tính credit.

### 8.6. Cách kết luận P5 (hiển thị và dấu vết)

Hiển thị đẹp không thay thế dữ liệu đúng.
Điều cần biết là host có giữ nguyên `structuredContent` hay chỉ hiển thị text, và lỗi có phân biệt được với kết quả bình thường không.
Nếu không có mã vết, lab phải tự sinh mã vết ở cổng kiểm soát để đạt SR7 (vết xuyên suốt).

**Kết luận:** lab phải tự sinh mã vết ở cổng cho SR7 (vết xuyên suốt), không thể trông vào host.
Không nên dựa vào `structuredContent` để hiển thị, vì host không hiển thị nó cho người dùng; và phải tự phân biệt lỗi vì host không đánh dấu `isError`.

## 9. Bảng tổng hợp để bàn giao

Bảng này tổng hợp kết quả đã đo ngày 2026-11-16.

| Câu hỏi | Kết luận một dòng | Độ tin cậy | Bằng chứng chính |
| --- | --- | --- | --- |
| P1 (giao thức và xác thực) | Ngày 2026-11-16 chỉ stdio gọi tool được trong chat; ngày 2026-11-17, Streamable HTTP qua HTTPS công khai gọi được trên cả web lẫn desktop. | Cao | `log-20261116-194146-662.jsonl`, `log-20261116-201053-131.jsonl`, `log-20261117-171748-473.jsonl:119`, `:139` |
| P2 (danh tính) | Client không gửi danh tính, chỉ có `clientInfo` của app; trong chat, máy chủ Thổ Thần gắn `x-user-id`, `x-user-email`, `x-agent-id`, `x-executor-id`. Khoá riêng do người thêm skill đặt thì tới server, nhưng phép đo chưa phân biệt khoá riêng từng người với khoá dùng chung. | Trung bình (nguồn danh tính), cao (khoá tới server) | `log-20261116-203102-671.jsonl:4`, `log-20261116-224038-918.jsonl:1`, `log-20261117-171748-473.jsonl:139` |
| P3 (kênh duyệt) | Không hỏi duyệt cả Auto lẫn Manual; không elicitation; link bấm được. | Cao | `p3-01` đến `p3-06`, các log `203315`, `203504`, `203739`, `203857`, `203939` |
| P4 (thử lại và thời gian chờ) | Không auto retry; cắt ở 60 giây; mỗi call là process mới; nút dừng không hủy ngay. | Cao | `p4-01` đến `p4-09`, các log `204146`, `204240`, `204458`, `204645`, `205049`, `205304` |
| P5 (hiển thị và dấu vết) | `structuredContent` không hiện; `isError` không hiện rõ; không trace, không cost. | Trung bình | `p5-01`, `p4-01`, `log-20261116-204407-340.jsonl:9` |

Cách nối thứ ba (cổng đóng vai mô hình) có kịch bản riêng ở mục 5.6; chưa có kết quả nên chưa đưa vào bảng này.

Ba mức độ tin cậy:

- Cao: có log, có ảnh chụp, lặp lại được hai lần.
- Trung bình: có log nhưng chỉ một lần chạy.
- Thấp: chỉ có quan sát giao diện, không có log tương ứng.

**Kết luận:** kết quả đủ để sửa khảo sát Thổ Thần và viết ADR-0001.
Riêng P2 (danh tính) cần thêm tài khoản thứ hai nếu có, để nâng từ trung bình lên cao.

## 10. Sau khi chạy

Đã xong:

1. Cài và chạy được cả hai skill: `mcp-probe` (HTTP) và `mcp-probe-stdio`.
2. Chạy đủ năm câu hỏi P1-P5 (giao thức, danh tính, duyệt, thử lại, hiển thị) trên stdio, ghi log và ảnh vào `scratch/mcp-probe/`.
3. Ghi phát hiện HTTP chat `fetch failed` vào P1 (giao thức và xác thực), mục 4.6.
4. Điền bảng kết quả của năm câu hỏi và bảng tổng hợp mục 9.

5. Cập nhật [khảo sát Thổ Thần](../../rd/research/tho-than-platform.md) (mục 2.1, 3.4, 3.5 và 9).

Còn phải làm:

6. Báo Kevin: lời gọi chat đi qua máy chủ Thổ Thần đã xác nhận; cần hỏi người dùng thật ở web hay desktop, header danh tính có được máy chủ ký không, skill do từng người tự thêm hay chia sẻ cho cả tổ chức, và Lab có địa chỉ công khai lâu dài không.
7. Xoá `LAB_USER_KEY` khỏi skill `mcp-probe-stdio` và API Key khỏi skill `mcp-probe` khi không cần đo thêm (khoá riêng đã kiểm xong ở mục 5.5).
8. Nếu có tài khoản Thổ Thần thứ hai, chạy lại `whoami` bằng tài khoản đó để nâng độ tin cậy P2 (danh tính).
9. Chạy phép đo cổng đóng vai mô hình ở mục 5.6 qua tunnel trên Thổ Thần web, rồi điền bảng và câu trả lời.
10. Khi viết bản ghi quyết định về nơi chạy và danh tính, dẫn kết quả ở mục 4.8.
11. Giữ log và ảnh trong `scratch/`; không commit, không dán token hay dữ liệu thật lên kênh công khai.
12. Không gỡ skill khỏi tài khoản trừ khi người dùng yêu cầu.

**Kết luận:** bàn giao đủ khi người sau mở được đúng file log và ảnh, và biết đúng bốn việc còn thiếu: tài khoản thứ hai, một địa chỉ công khai lâu dài, thử khoá bị thu hồi, và phép đo cổng đóng vai mô hình.

## 11. Giới hạn của kịch bản này

- Kết quả gắn với phiên bản 2.1.56 tại thời điểm đo; bản triển khai sau có thể khác.
- Chỉ có một tài khoản Thổ Thần, nên P2 (danh tính) chưa so sánh được hai tài khoản.
- OAuth2 chưa thử được vì giao diện chỉ có No auth và API Key; bearer, API Key và HTTPS từ xa đã thử (mục 4.8 và 5.5).
- Lời gọi chat đi qua máy chủ Thổ Thần đã xác nhận bằng log ngày 2026-11-17 (mục 4.8), không còn là suy luận.
- Phép đo ngày 2026-11-17 chỉ dùng một tài khoản và một skill, nên chưa biết khoá là riêng từng người hay dùng chung, và chưa thử hai người cùng lúc.
- Log gốc của phép đo ngày 2026-11-17 nằm trong `scratch/` của worktree probe và đã bị xoá; mục 4.8 dẫn lại số dòng từ ghi chép thô, không mở lại log được.
- Kết luận "mỗi lần gọi stdio là một tiến trình mới" dựa trên PID khác nhau trong từng log, chưa đọc mã nguồn host.
- Lần bấm nút dừng chỉ chạy một lần; mốc hủy 60 giây khớp với timeout nên chưa tách được hoàn toàn khỏi timeout.
- Thông tin credit (FREE 500/kỳ) lấy từ bàn giao, không có ảnh vì trang Profile chứa email thật.
- Chỉ dùng dữ liệu giả lập, không đụng dữ liệu thật của công ty.
- Probe không chạy máy chủ OAuth và không chạy transport SSE cũ, nên không thử được hai chế độ đó.
- Chế độ provider chỉ trả một câu cố định và chỉ có hai endpoint, nên kết quả chỉ nói về danh tính trong lời gọi mô hình, không nói về chất lượng mô hình hay function calling.
- Chỉ có một máy và một mạng, chưa đo được ảnh hưởng của mạng chậm.
- Số lần chạy nhỏ, không dùng để nói về độ ổn định dài hạn.
- Việc phân biệt host tự gọi lại và model tự gọi lại cần quan sát giao diện, log một mình không đủ.

**Kết luận:** kết quả của kịch bản này là bằng chứng định tính cho quyết định thiết kế, chưa phải số đo hiệu năng hay chi phí.

## 12. Nguồn và công cụ

- Server, cách chạy và cách đọc log: [README của probe](mcp-probe/README.md), mục 5 cho chế độ nhà cung cấp mô hình.
- Mã tool và chú thích: `archive/research/mcp-probe/src/server.ts`.
- Mã chế độ provider: `archive/research/mcp-probe/src/openai.ts`.
- Bộ tự kiểm tra: `archive/research/mcp-probe/src/selftest.ts`.
- Đặc tả MCP, transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Đặc tả MCP, tools và annotations: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Đặc tả MCP, elicitation: https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
- [Khảo sát Thổ Thần](../../rd/research/tho-than-platform.md).
- [Các giai đoạn của bản thử](../../docs/milestones.md).

Bằng chứng đo, tất cả nằm trong `scratch/mcp-probe/` (đã git bỏ qua):

| Câu hỏi | Log chính | Ảnh chính |
| --- | --- | --- |
| P1 (giao thức và xác thực) | `log-20261116-194146-662.jsonl` (HTTP Test connection), `log-20261116-201053-131.jsonl` (thử IPv6) | `p1-09`, `p1-11`, `p1-12`, `p1-13`, `p1-14`, `p2-01` |
| S1-S6 (HTTPS công khai) | `log-20261117-152301-143.jsonl`, `log-20261117-161011-154.jsonl`, `log-20261117-171748-473.jsonl`, `log-20261117-181600-811.jsonl` | `s2-01-add-custom-mcp-form.png`, `s2-02-web-wrong-token-error.png` |
| P2 (danh tính) | `log-20261116-203102-671.jsonl` (whoami stdio), `log-20261116-194146-662.jsonl` (HTTP, cả API Key), `log-20261116-221252-985.jsonl` và `log-20261116-224038-918.jsonl` (khoá riêng stdio) | `p2-02`, `h8-01` đến `h8-04` |
| P3 (kênh duyệt) | `log-20261116-203315-739.jsonl`, `log-20261116-203504-441.jsonl`, `log-20261116-203739-177.jsonl`, `log-20261116-203857-876.jsonl`, `log-20261116-203939-773.jsonl`, `log-20261116-194146-662.jsonl` (approve) | `p3-01` đến `p3-06` |
| P4 (thử lại và thời gian chờ) | `log-20261116-204146-204.jsonl`, `log-20261116-204240-153.jsonl`, `log-20261116-204458-659.jsonl`, `log-20261116-204645-611.jsonl`, `log-20261116-205049-979.jsonl`, `log-20261116-205304-745.jsonl`, `log-20261116-205848-488.jsonl` | `p4-01` đến `p4-09` |
| P5 (hiển thị và dấu vết) | `log-20261116-204407-340.jsonl`, `log-20261116-204146-204.jsonl`, `log-20261116-194146-662.jsonl` | `p5-01`, `p4-01` |

**Kết luận:** mọi bằng chứng trong tài liệu này trỏ tới một file trong repo hoặc một trang đặc tả công khai, nên người sau mở lại được.
