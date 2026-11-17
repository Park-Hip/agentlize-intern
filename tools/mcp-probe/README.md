# MCP probe cho Thổ Thần

Đây là một MCP server dùng một lần, mục đích duy nhất là ghi lại những gì Thổ Thần gửi sang khi gọi tool.
Nó không phải hệ thống thật, không phải ADR, và không chọn kiến trúc cho lab.
Toàn bộ dữ liệu là giả lập: Hoa, Nam, Minh, Quang và task T-12.
Không có tên thật, không có email thật, không có token thật.

## Đọc nhanh

- Cắm server này vào Thổ Thần desktop để trả lời năm câu hỏi P1-P5 (giao thức, danh tính, duyệt, thử lại, hiển thị) trong runbook `rd/appota/tho-than-mcp-probe.md`.
- Chạy được hai kiểu: stdio (host tự spawn) và Streamable HTTP trên localhost.
- Mọi request HTTP và mọi thông điệp JSON-RPC được ghi thành một dòng JSON trong `scratch/mcp-probe/log-<timestamp>.jsonl`.
- Giá trị Authorization được che còn 6 ký tự đầu cộng độ dài, không bao giờ ghi nguyên token.
- Tự kiểm tra bằng `npm run selftest`; lần chạy gần nhất đạt toàn bộ kiểm tra.

## 1. Cần gì

- Node 20 trở lên, npm đi kèm.
- Chạy lệnh trong thư mục `tools/mcp-probe`.
- Mọi thư viện nằm trong `devDependencies` hoặc `dependencies` cục bộ, không cài gì toàn máy.

## 2. Cài và build

```bash
cd tools/mcp-probe
npm install
npm run build
```

Lệnh build dùng TypeScript cục bộ và ghi kết quả vào `dist/`.
`node_modules/` và `dist/` đã nằm trong `.gitignore` của thư mục này.

## 3. Chạy transport stdio

Host sẽ tự spawn tiến trình này, nên khi thử bằng tay chỉ cần thấy nó khởi động rồi thoát.

```bash
node dist/index.js --stdio
```

Đường dẫn log được in ra stderr ngay khi khởi động.
Không viết gì ra stdout ngoài giao thức MCP, vì stdout là kênh của giao thức.
Khi cắm vào Thổ Thần, cấu hình như sau:

| Trường | Giá trị |
| --- | --- |
| Kiểu | stdio |
| Command | đường dẫn tuyệt đối tới node, lấy bằng `node -p "process.execPath"` |
| Args | đường dẫn tuyệt đối tới `tools/mcp-probe/dist/index.js`, rồi `--stdio` |
| Working directory | thư mục repo, hoặc `tools/mcp-probe` |

Ví dụ args trên Windows:

```
C:\duong-dan-toi-repo\tools\mcp-probe\dist\index.js --stdio
```

Nếu host không cho tách args, hãy dùng một script `.cmd` gọi đúng hai phần trên.

Biến môi trường có tên bắt đầu bằng `LAB_` được in trong kết quả `whoami` (trường `labEnv`) và trong dòng `server_start`, ở dạng đã che như Authorization.
Dùng nó để kiểm một khoá riêng của từng người có tới được server không, ví dụ đặt `LAB_USER_KEY=hoa-thu-nghiem-0001` trong ô biến môi trường của form stdio.
Probe không đọc biến môi trường nào khác, nên không lộ môi trường của máy.

## 4. Chạy transport Streamable HTTP

```bash
node dist/index.js --http --port 8787
```

Các đường dẫn có sẵn:

| Đường dẫn | Việc gì |
| --- | --- |
| `http://localhost:8787/mcp` | endpoint MCP cho host |
| `http://localhost:8787/health` | JSON trạng thái, không cần xác thực |
| `http://localhost:8787/approve/<id>` | trang duyệt giả lập, mỗi lượt bấm ghi một dòng log |
| `http://localhost:8787/` | trang chủ nhỏ cho người đọc |

Mặc định server chỉ nghe trên `127.0.0.1`.
Đổi địa chỉ bằng `--host 0.0.0.0` khi chạy sau tunnel, và luôn đặt token trong trường hợp đó.

### 4.1. Chế độ bearer

```bash
node dist/index.js --http --port 8787 --bearer doi-mot-token
```

Host phải gửi header `Authorization: Bearer doi-mot-token`.
Sai hoặc thiếu token thì server trả `401` kèm `WWW-Authenticate: Bearer`.
Probe cũng nhận token trần nếu form của host gửi thiếu chữ `Bearer`, để dễ thử; log ghi lại dạng đã gửi.

Không đặt `--bearer` thì mọi header Authorization đều được nhận và ghi log ở dạng đã che.
Đây là chủ ý: cần biết host có gửi token hay không, kể cả khi token đó không được kiểm.

### 4.2. HTTPS và tunnel

Server có thể tự chạy HTTPS nếu có chứng chỉ:

```bash
node dist/index.js --http --port 8787 --tls-cert cert.pem --tls-key key.pem
```

Đã thử chế độ này với chứng chỉ tự ký trên Node 22.21.0.
Nếu Thổ Thần không nhận chứng chỉ tự ký thì dùng tunnel để có chứng chỉ hợp lệ.
Cách nhanh hơn để có URL HTTPS công khai là dùng tunnel, ví dụ Cloudflare Tunnel hoặc ngrok.
Khi đó phải truyền `--public-url` để tool `echo_link` trả về đúng địa chỉ mà trình duyệt mở được:

```bash
cloudflared tunnel --url http://localhost:8787
node dist/index.js --http --port 8787 --bearer doi-mot-token --public-url https://ten-mien-tunnel.example
```

Chỉ mở tunnel khi đã đặt `--bearer` và chỉ dùng cho buổi thử.
Trang `/approve/<id>` cố ý không đòi xác thực, vì link duyệt được bấm từ giao diện chat.

### 4.3. Toàn bộ tham số

| Tham số | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `--stdio` | - | giao thức qua stdin/stdout |
| `--http` | - | Streamable HTTP |
| `--port <n>` | 8787 | cổng HTTP |
| `--host <addr>` | 127.0.0.1 | địa chỉ nghe |
| `--bearer <token>` | không có | bắt buộc bearer token |
| `--public-url <url>` | tự suy ra | địa chỉ dùng trong link của `echo_link` |
| `--log-dir <dir>` | `<repo>/scratch/mcp-probe` | nơi ghi log |
| `--tls-cert <file>` | không có | chứng chỉ HTTPS |
| `--tls-key <file>` | không có | khóa HTTPS |
| `-h`, `--help` | - | in hướng dẫn |

## 5. Thêm server vào Thổ Thần desktop

Phần này do người dùng giao diện làm, agent không mở được app.
Các nhãn menu có thể khác nhau giữa các bản LobeHub, nên hãy tìm mục có chữ MCP.
Phiên bản Thổ Thần đang dùng là bản đổi nhãn của LobeHub 2.1.56.

1. Mở Thổ Thần desktop và vào Cài đặt.
2. Tìm mục MCP server, thường nằm trong nhóm công cụ, plugin hoặc agent.
3. Bấm thêm MCP server tùy chỉnh.
4. Chọn Streamable HTTP và nhập `http://localhost:8787/mcp`, hoặc chọn stdio và nhập command cùng args ở mục 3.
5. Đặt tên `mcp-probe`, lưu lại, rồi chờ danh sách tool hiện ra.
6. Danh sách đúng phải có 8 tool: `whoami`, `echo_link`, `fake_write`, `ask_confirm`, `flaky`, `slow`, `structured`, `big_list`.
7. Bật MCP server này cho agent hoặc cuộc chat sẽ dùng, vì LobeHub thường chỉ gắn công cụ vào chat sau khi bật.
8. Gõ thử: `Gọi tool whoami của MCP server mcp-probe và in nguyên văn kết quả.`

Nếu danh sách tool không hiện, xem log và bảng lỗi thường gặp ở mục 9.
Nếu form chỉ có SSE mà không có Streamable HTTP, ghi lại làm bằng chứng P1, vì probe này không chạy transport SSE cũ.

## 6. Tám tool và câu hỏi chúng trả lời

| Tool | Annotation | Việc làm | Câu hỏi |
| --- | --- | --- | --- |
| `whoami` | readOnlyHint | trả về headers, clientInfo, capabilities, `_meta`, mã phiên | P2 |
| `echo_link` | readOnlyHint | trả về link Markdown bấm được và một URL thô | P3 |
| `fake_write` | destructiveHint | giả vờ chuyển T-12, không đổi dữ liệu, ghi tham số | P3 |
| `ask_confirm` | readOnlyHint | gọi `elicitation/create` nếu client khai báo, ngược lại nói rõ không hỗ trợ | P3 |
| `flaky` | readOnlyHint | lần đầu trả `isError: true`, lần sau thành công, đếm số lần | P4 |
| `slow` | readOnlyHint | chờ N giây, gửi tiến độ nếu có progressToken, ghi lúc hủy | P4 |
| `structured` | readOnlyHint | trả cả text và `structuredContent` có `outputSchema` | P5 |
| `big_list` | readOnlyHint | trả danh sách task giả dạng JSON, mặc định 100 task, khoảng 15.000 ký tự | P5, K10 (kết quả lớn) ở [MausBot](../../rd/research/mausbot.md) |

Mọi mô tả tool bằng tiếng Việt để thấy host hiển thị chúng thế nào.
Tên tool giữ tiếng Anh để dễ gọi và dễ grep trong log.

## 7. Log

Mặc định log nằm ở `scratch/mcp-probe/log-<timestamp>.jsonl` của repo, bất kể host spawn tiến trình ở thư mục nào.
Mỗi dòng là một JSON object độc lập, không xuống dòng bên trong.
Dòng đầu là `server_start` chứa cấu hình đã lược bỏ token.
Các loại dòng chính:

| `kind` | Nội dung |
| --- | --- |
| `http_request` | method, path, toàn bộ header, rawHeaders, địa chỉ nguồn, TLS, User-Agent |
| `http_response` | mã trạng thái và thời gian xử lý |
| `http_auth` | kết quả kiểm Authorization, lý do nhận hoặc từ chối |
| `jsonrpc` | một thông điệp vào hoặc ra, kèm `direction`, `message`, `sessionId` |
| `session_init` | tham số initialize đầy đủ: clientInfo, capabilities, protocolVersion |
| `session_open` | mã phiên Streamable HTTP vừa được cấp |
| `tool_call` | tool, tham số, `requestId`, `_meta`, headers của request |
| `tool_result` | kết quả, `isError`, `structuredContent`, thời gian chạy |
| `flaky_attempt` | khóa và số lần gọi, dùng để thấy retry |
| `slow_start`, `slow_end`, `tool_progress`, `tool_cancelled` | vòng đời của `slow` |
| `ask_confirm_branch`, `ask_confirm_result` | nhánh elicitation và câu trả lời |
| `approve_visit` | một lượt bấm link duyệt, kèm User-Agent và Referer |
| `extra_meta` | khóa lạ trong `_meta`, ví dụ dấu vết hoặc thông tin chi phí |

Giá trị của `authorization`, `proxy-authorization`, `cookie`, `set-cookie` và `x-api-key` được thay bằng 6 ký tự đầu cộng độ dài, ví dụ `Bearer...(len=34)`.
Giá trị ngắn hơn hoặc bằng 8 ký tự bị che hoàn toàn.
Không có token nào được ghi nguyên văn; self-test kiểm tra đúng điều này.

Log nằm trong `scratch/`, thư mục đã được git bỏ qua.
Đừng commit log và đừng dán log lên kênh công khai nếu host có gửi header lạ.

## 8. Đọc log nhanh

Lệnh tóm tắt đọc file log mới nhất dưới `scratch/mcp-probe`:

```bash
npm run summarize
```

Hoặc trỏ vào một file hay một thư mục cụ thể:

```bash
node dist/summarize.js ../../scratch/mcp-probe/log-20261116-145212-526.jsonl
node dist/summarize.js ../../scratch/mcp-probe/
```

Kết quả tóm tắt gồm: phiên và clientInfo, header giống danh tính, dấu vết, số lần gọi từng tool, số lần `flaky`, vòng đời `slow`, nhánh `ask_confirm`, lượt bấm link duyệt và các kết quả `isError`.
Đây chỉ là số liệu thô để điền bảng trong runbook, không phải kết luận.

Theo dõi trực tiếp:

```bash
tail -f ../../scratch/mcp-probe/log-*.jsonl
```

## 9. Tự kiểm tra

```bash
npm run selftest
```

Script này build lại, chạy server ở cả hai transport, nối bằng SDK client chính thức, gọi đủ 7 tool và kiểm tra từng dòng log.
Nó cũng thử client có và không có khai báo elicitation, tiến độ, hủy giữa chừng, CORS, chế độ bearer và việc che token.
Kết quả đúng phải có một dòng dạng:

```
SELFTEST PASSED: <số> checks
```

Log của lần tự kiểm tra được giữ lại dưới `scratch/mcp-probe/selftest-<timestamp>/` để xem lại.
Có thể xóa các thư mục này bất cứ lúc nào.

Kiểm tra thêm bằng MCP Inspector CLI, đây là một client thứ hai độc lập:

```bash
npx --yes @modelcontextprotocol/inspector@2.15.0 --cli --method tools/list node dist/index.js --stdio
npx --yes @modelcontextprotocol/inspector@2.15.0 --cli --transport http --server-url http://127.0.0.1:8787/mcp --method tools/list
```

Lần chạy đã kiểm chứng với Inspector 2.15.0 trên Node 22.21.0.
npm có thể in cảnh báo engine vì Inspector khai báo Node mới hơn, nhưng CLI vẫn chạy.

### 9.1. Lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Host báo không kết nối được | sai đường dẫn tuyệt đối tới node hoặc `dist/index.js` | chạy lại lệnh bằng tay, xem stderr |
| 401 | đang bật `--bearer` nhưng host chưa có token | nhập đúng `Bearer <token>` hoặc bỏ `--bearer` cho buổi thử |
| 400 missing Mcp-Session-Id | host không giữ session id giữa các request | ghi lại làm bằng chứng P1, thử lại từ đầu |
| 404 session not found | server đã khởi động lại giữa phiên | khởi động lại host hoặc tạo phiên mới |
| 406 | host gửi `Accept` không đúng chuẩn Streamable HTTP | ghi lại làm bằng chứng P1 |
| Trình duyệt báo CORS | gọi từ bản web, không phải desktop | probe đã bật CORS; kiểm tra lại URL và mixed content |
| Trình duyệt không gửi cookie | CORS đang để `*`, không đi với credentials | ghi lại làm bằng chứng P1, thử bản desktop |
| Không thấy file log | host spawn ở thư mục khác, hoặc không có quyền ghi | mặc định log ở `scratch/mcp-probe` của repo; nếu vẫn không thấy thì truyền `--log-dir` tuyệt đối trong args |

## 10. Giới hạn

- Đây là đồ nghề để đo, không phải mẫu để đưa vào sản phẩm.
- Không có xác thực cho trang `/approve`, không có OAuth server, không có lưu trữ bền vững.
- Phiên Streamable HTTP nằm trong bộ nhớ, nên khởi động lại server là mất phiên.
- Không chạy transport SSE cũ, nên nếu host chỉ có SSE thì đó là một phát hiện P1.
- Không đo độ trễ chuẩn, không đo chi phí token; nó chỉ ghi lại những gì host gửi.
- Không quyết định kiến trúc, không thay thế ADR-0001.
- Khi không đặt `--bearer`, bất kỳ trang web nào trên máy cũng có thể gọi endpoint localhost, nên chỉ chạy trong lúc đo.
- Log có thể chứa header do host gửi; giữ trong `scratch/` và không dán công khai.

## 11. Nguồn

- Đặc tả MCP, transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Đặc tả MCP, tools và annotations: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Đặc tả MCP, elicitation: https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
- TypeScript SDK chính thức: https://github.com/modelcontextprotocol/typescript-sdk
- LobeHub, nền tảng gốc của Thổ Thần: https://github.com/lobehub/lobehub
