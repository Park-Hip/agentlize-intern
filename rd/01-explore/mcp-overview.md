> **BÁO CÁO TỔNG HỢP - KHÔNG PHẢI ADR.** Bản này do agent soạn.
> Các khẳng định kỹ thuật đã được mở lại đặc tả gốc và nguồn ngoài ghi ở mục 13, trừ phần có nhãn `[Nội bộ]`, `[Khuyến nghị]` hoặc `[Chưa xác minh]`.

# MCP: báo cáo tổng hợp cho Track 01 - AI Platform & MCP

**Owner:** Phạm Bách Hiệp.
**Mentor:** Kevin.
**Ngày:** 2026-11-12.
**Revision:** 0.1.
**Trạng thái:** bản nháp do agent soạn.

**Phạm vi:** tổng hợp những gì đã research về MCP trong repo, đối chiếu lại với đặc tả gốc, viết thành một tài liệu đọc được cho mentor.
**Không phải:** ADR, quyết định chọn stack, hoặc bản thay thế báo cáo chính thức ngày 11/11/2026.

## Mục lục

0. Cách đọc báo cáo
1. MCP giải quyết vấn đề gì
2. Kiến trúc và chủ sở hữu
3. Giao thức trên dây
4. Transport
5. Primitive và hợp đồng tool
6. Client, elicitation và MRTR
7. Auth và scope
8. Mô hình mối đe dọa
9. Kiểm thử và đo lường
10. Khi nào MCP là lựa chọn sai
11. Áp dụng vào lab
12. Việc tiếp theo
13. Nguồn
14. Nhật ký revision

## 0. Cách đọc báo cáo

### 0.1. Nhãn bằng chứng

Báo cáo dùng năm nhãn để người đọc biết một câu được kiểm đến đâu.

| Nhãn | Nghĩa | Cách kiểm |
| --- | --- | --- |
| `[Spec]` | Câu lấy từ đặc tả MCP 2026-07-28, JSON-RPC, JSON Schema, OAuth hoặc RFC. | Mở URL ở mục 13, đối chiếu đúng revision. |
| `[Số đo]` | Con số lấy từ nghiên cứu hoặc tài liệu vendor, có URL và ngày truy cập. | Mở lại nguồn, đọc đúng đoạn chứa số. |
| `[Khuyến nghị]` | Kết luận kỹ thuật do người viết tổng hợp, không phải câu chữ của đặc tả. | Kiểm bằng lập luận và thực nghiệm trên lab. |
| `[Nội bộ]` | Nội dung lấy từ bản nháp trong repo, không dùng làm bằng chứng. | Chỉ dùng như giả thuyết hoặc ghi chú thiết kế. |
| `[Chưa xác minh]` | Chưa mở được nguồn gốc hoặc phụ thuộc môi trường chưa kiểm. | Phải kiểm trước khi dùng trong quyết định. |

Mọi tài liệu Markdown trong `rd/` là bản nháp, trừ báo cáo chính thức ngày 11/11/2026.
Vì vậy báo cáo này không trích số liệu từ các bản nháp nội bộ như bằng chứng.
Các bản nháp chỉ được dùng để xác định câu hỏi, cấu trúc và những gì cần đối chiếu lại.

### 0.2. Mười điều cần nhớ

1. MCP là giao thức mở để một ứng dụng AI (host) khám phá và gọi năng lực ở một tiến trình khác (server) qua JSON-RPC 2.0. `[Spec]`
2. Revision hiện hành là 2026-07-28; revision này stateless, bỏ handshake `initialize`, bỏ session, và mang version cùng capability trong `_meta` của từng request. `[Spec]`
3. Ba primitive là tools, resources và prompts; ba thứ này khác nhau ở chỗ ai quyết định dùng: model, ứng dụng hay người dùng. `[Spec]`
4. MCP chuẩn hóa discovery, schema, transport và auth.
   Nó không chuẩn hóa quyền nghiệp vụ, phê duyệt, idempotency hay lòng tin. `[Spec]` + `[Khuyến nghị]`
5. MRTR là cơ chế chính thức để server hỏi thêm người dùng; đây là chỗ đặt bước phê duyệt trước khi ghi. `[Spec]`
6. Hai transport là stdio và Streamable HTTP; chúng gãy ở hai chỗ khác nhau, và cả hai đều không bảo đảm request sống sót khi kết nối đứt. `[Spec]`
7. Với HTTP, auth dựa trên OAuth 2.1, Protected Resource Metadata của RFC 9728 và resource indicator của RFC 8707; server phải kiểm audience và không được token passthrough. `[Spec]`
8. Tool description, annotation, resource và output đều là dữ liệu không tin cậy; annotation là gợi ý, không phải phân quyền. `[Spec]`
9. Chi phí thật của MCP nằm ở schema tool và kết quả tool trong context; nghiên cứu độc lập đo được output trung bình 4.431 token và cực đại 557.766 token trên 1.312 tool. `[Số đo]`
10. MCP là lựa chọn sai khi chỉ có một ứng dụng, một tool, quy trình cố định, cần exactly-once, không có owner vận hành, hoặc tool chỉ sống trong một process. `[Khuyến nghị]`

### 0.3. Đã tổng hợp từ đâu

| Nguồn nội bộ | Nội dung chính | Cách dùng trong báo cáo |
| --- | --- | --- |
| `rd/01-explore/mcp-technical-guide.html` | Sổ tay MCP 13 mục: kiến trúc, wire, transport, tool contract, MRTR, auth, bảo mật, test. | Dùng làm khung; các claim về giao thức đã đối chiếu lại với đặc tả, phần thiết kế lab giữ nhãn `[Nội bộ]` hoặc `[Khuyến nghị]`. |
| `rd/01-explore/mcp-request-flow.html` | Sequence diagram cho một yêu cầu ghi có phê duyệt và vị trí control plane. | Dùng cho mục 2 và mục 6. |
| `docs/research/04-khao-sat-5-mo-hinh.md` (đã xóa) | Định vị năm mô hình theo tầng và tiêu chí riêng từng tầng. | Dùng cho mục 1.3; bản nháp đã bị xóa khỏi worktree. |
| `rd/00-frame/prd-ai-platform.md` | Vấn đề trung tâm, SR1-SR8, M1-M6. | Dùng cho mục 11. |
| `.lavish/research/fc-lane-1-spec.md`, `fc-lane-2-practice.md`, `fc-lane-3-risk.md` | Ghi chú research về function calling, tool design và rủi ro. | Đối chiếu chéo mục 1.5 và mục 8; không phải tài liệu của repo. |
| `docs/context/appota-ai-ecosystem.md` | Sơ đồ hệ sinh thái AI Appota và các câu hỏi về Tool/MCP Runtime. | Dùng cho mục 11.3 và 11.4; chưa xác nhận với Kevin. |

Báo cáo không chép nguyên văn các bản nháp.
Các claim có nhãn `[Spec]` hoặc `[Số đo]` đã được mở lại nguồn gốc.
Các phần `[Nội bộ]` và `[Khuyến nghị]` vẫn là giả thuyết hoặc đề xuất, không phải bằng chứng. `[Khuyến nghị]`

## 1. MCP giải quyết vấn đề gì

### 1.1. Vấn đề N nhân M

Khi một ứng dụng AI cần dùng một hệ thống nghiệp vụ, có ba việc phải làm.
Việc thứ nhất là mô tả năng lực của hệ thống đó cho model.
Việc thứ hai là gọi đúng năng lực với đúng tham số.
Việc thứ ba là mang kết quả về cho model.

Nếu mỗi ứng dụng tự làm ba việc này, số tích hợp là N nhân M, với N là số ứng dụng và M là số hệ thống.
MCP biến bài toán đó thành N cộng M: mỗi hệ thống viết một server theo một hợp đồng chung, mỗi ứng dụng viết một client theo cùng hợp đồng đó. `[Spec]`

Điểm quan trọng là MCP không làm cho hệ thống nghiệp vụ trở nên có quyền hạn tốt hơn.
Nó chỉ làm cho việc mô tả và gọi năng lực có một hình dạng chung.
Phần quyết định ai được gọi, gọi với dữ liệu nào, có cần duyệt không, và gọi lại có ghi trùng không vẫn nằm ngoài giao thức. `[Khuyến nghị]`

### 1.2. MCP là gì và không là gì

| Câu hỏi | Trả lời | Nhãn |
| --- | --- | --- |
| MCP là gì? | Giao thức mở để host, client và server nói chuyện với nhau bằng JSON-RPC 2.0. | `[Spec]` |
| Ai điều khiển việc chọn tool? | Model, dựa trên mô tả và schema mà host đưa vào context. | `[Spec]` |
| MCP có phải agent framework? | Không. Planning, memory và chọn bước vẫn do host và model làm. | `[Khuyến nghị]` |
| MCP có phải workflow engine? | Không. MCP không định nghĩa thứ tự bước, retry hay version của workflow. | `[Khuyến nghị]` |
| MCP có phải security boundary? | Không. Đặc tả nói rõ nó không thể thực thi các nguyên tắc bảo mật ở tầng giao thức. | `[Spec]` |
| MCP có thay OpenAPI trong nội bộ không? | Không. OpenAPI mô tả API; MCP mô tả cách agent khám phá và gọi năng lực qua một host. | `[Khuyến nghị]` |
| MCP có bảo đảm ghi đúng một lần? | Không. Không có idempotency key hay giao dịch phân tán trong giao thức. | `[Spec]` |
| MCP có bảo đảm quyền nghiệp vụ? | Không. OAuth scope chỉ là một phần; quyền theo bản ghi và theo trường phải do server và control plane kiểm. | `[Khuyến nghị]` |

### 1.3. Vị trí trong năm mô hình của Track 01

Track 01 phải khảo sát năm mô hình trước khi chọn cách làm.
Năm mô hình này không cùng một tầng, nên không chấm điểm chung và không xếp hạng. `[Nội bộ]`

Cách phân tầng lấy từ báo cáo chính thức ngày 11/11/2026.
Các cột câu hỏi chi tiết lấy từ bản khảo sát chưa review `04-khao-sat-5-mo-hinh.md` (đã xóa), nên phải kiểm lại. `[Nội bộ]`

| Mô hình | Tầng | Trả lời câu hỏi | Không trả lời câu hỏi |
| --- | --- | --- | --- |
| API / Function Calling | Năng lực của model | Model chọn hàm nào với tham số gì, trong danh sách được đưa. | Ai được phép gọi hàm đó, và gọi hai lần có sinh hai bản ghi không. |
| MCP | Giao thức | Hai bên nói chuyện bằng hợp đồng nào để liệt kê và gọi tool. | Quyền nghiệp vụ nằm ở đâu, và có nên gọi hay không. |
| Workflow Engine | Tầng thực thi | Các bước chạy theo thứ tự nào, dừng ở đâu, chạy lại từ đâu. | Bước tiếp theo nên là gì khi chưa ai viết trước. |
| Agent Orchestration | Mẫu điều khiển | Chia việc thành mấy bước, gọi tool nào tiếp, khi nào thì dừng. | Quyền được kiểm ở đâu, và ai chịu trách nhiệm khi sai. |
| Event-driven Integration | Mẫu kích hoạt | Việc gì đã xảy ra, ai cần biết, có thứ tự không. | Có nên làm gì tiếp hay không. |

Kết luận của bảng này là MCP là một tầng, không phải toàn bộ hệ thống.
MCP có thể là cách tốt để chuẩn hóa lớp năng lực, nhưng không thay thế policy, approval, executor hay trace. `[Khuyến nghị]`

### 1.4. Vì sao Track 01 quan tâm

Track 01 có hai hệ thống mô phỏng và hai agent cần dùng lại cùng bộ tool.
Đây là điều kiện mà MCP có lợi thế: nhiều host, một bộ năng lực, tool có thể đổi độc lập với host. `[Nội bộ]`

Nhưng Track 01 cũng có tám yêu cầu SR1-SR8 về danh tính, quyền, phê duyệt, fail-closed, ghi an toàn, trace và tái dùng.
MCP không cung cấp sẵn các bảo đảm đó.
Vì vậy câu hỏi đúng không phải là "có nên dùng MCP không", mà là "MCP cung cấp phần nào, và phần còn lại phải dựng ở đâu". `[Nội bộ, báo cáo 11/11 đã review]`

### 1.5. MCP khác function calling ở đâu

Function calling là năng lực của model: model trả về tên hàm và tham số, ứng dụng thực thi hàm đó.
MCP là giao thức để ứng dụng đó khám phá và gọi năng lực ở một tiến trình khác. `[Spec]` + `[Khuyến nghị]`

| Khía cạnh | Function calling | MCP |
| --- | --- | --- |
| Nơi định nghĩa tool | Trong `tools` của từng request API. | Trong server, client lấy qua `tools/list`. |
| Khám phá động | Không có registry chuẩn; ứng dụng tự quản. | Có `tools/list`, pagination và thông báo thay đổi danh sách. |
| Tái dùng giữa nhiều host | Mỗi ứng dụng tự định nghĩa và tự thực thi. | Một server phục vụ nhiều client. |
| Trường mô tả | Tên, mô tả, JSON Schema tham số; một số vendor có `strict`; request có `tool_choice`. | Tên, mô tả, `inputSchema`, `outputSchema`, annotation, icon. |
| Transport | Do ứng dụng gọi API model quyết định. | JSON-RPC trên stdio hoặc Streamable HTTP. |
| Auth | Ứng dụng tự lo. | Có profile OAuth 2.1 cho HTTP, nhưng là tùy chọn. |
| Quyền nghiệp vụ, approval, idempotency | Không có. | Cũng không có. |
| Chi phí vận hành | Thấp hơn khi chỉ có một ứng dụng. | Thêm server, transport, auth, version và test. |

Điểm dễ đọc sai là "MCP chỉ khác function calling ở transport".
Ở lớp model nhìn thấy, hai bên gần như tương đương: tên, mô tả và JSON Schema. `[Khuyến nghị]`

Khác biệt quyết định nằm ở ba chỗ: khám phá động, `outputSchema` cộng annotation, và khả năng tách server khỏi host để nhiều client dùng lại. `[Spec]` + `[Khuyến nghị]`

Vì vậy MCP không thay thế function calling.
Host vẫn dùng function calling để model chọn tool, rồi client chuyển lựa chọn đó thành `tools/call` tới server. `[Khuyến nghị]`

## 2. Kiến trúc và chủ sở hữu

### 2.1. Bốn thành phần

MCP định nghĩa ba vai trong giao thức: host, client và server.
Track 01 thêm một lớp thứ tư nằm ngoài giao thức: control plane. `[Spec]` + `[Khuyến nghị]`

```text
Người dùng
   |
   v
Host: model, hội thoại, consent, chọn server/tool được phép dùng
   |
   |-- Client A (1:1) --> MCP server Danh bạ --> Nguồn dữ liệu danh bạ
   |-- Client B (1:1) --> MCP server Công việc --> Nguồn dữ liệu công việc
   |
   +--> Control plane: policy, approval, idempotency, trace, audit
        (nằm ngoài wire format, không phải một server bắt buộc)
```

Mỗi client nối đúng một server.
Host quản lý vòng đời client và quyết định server nào được dùng trong phiên.
Server sở hữu tool, resource, prompt và quyền truy cập hệ thống nghiệp vụ.
Control plane giữ các quyết định và bằng chứng bao quanh lời gọi. `[Spec]` + `[Khuyến nghị]`

### 2.2. Ai sở hữu cái gì

| Thành phần | Sở hữu | Không được làm |
| --- | --- | --- |
| Host | Model, hội thoại, consent, danh sách server và tool được phép dùng, giới hạn context cho từng server. | Không đẩy toàn bộ hội thoại cho mọi server; không coi tool description là instruction đáng tin. |
| Client | Đúng một kết nối tới một server; gắn version, capability và identity vào từng request. | Không chia sẻ token của server A cho server B; không tự sửa tham số trước khi gửi. |
| Server | Tool, resource, prompt và quyền truy cập hệ thống nghiệp vụ; kiểm authorization trên từng request. | Không tin tham số từ model; không ghi mà không có kiểm soát; không giữ credential dài hạn nếu dùng được token hẹp. |
| Control plane | Policy, approval, action registry, canonical hash, idempotency key, trace, audit. | Không nằm trong system prompt; không phụ thuộc vào việc model hứa sẽ làm đúng. |

### 2.3. Control plane không nằm trong giao thức

MCP chỉ là lớp vận chuyển context và hành động.
Nó không thay thế control plane. `[Khuyến nghị]`

MCP server vẫn gọi API nghiệp vụ như bình thường; đó là data plane.
Control plane là phần code quyết định và ghi nhận bao quanh lời gọi đó: ai được ghi, ai duyệt, đã ghi chưa, ai đã làm. `[Khuyến nghị]`

Không nên nhét logic agent vào API nghiệp vụ, vì API đó dùng chung cho web, mobile và dịch vụ khác.
Không nên để model tự quyết định "được ghi hay không", vì model là dữ liệu không tin cậy và bị prompt injection điều khiển được.
Quyết định đó phải được thực thi ngoài model, ở control plane. `[Khuyến nghị]`

### 2.4. Bốn cách hiện thực control plane

| Cách | Control plane nằm ở | Khi nào dùng |
| --- | --- | --- |
| Middleware in-process | Hàm bao quanh tool handler, cùng process server. | Lab: 0 server thêm, dễ test nhất. |
| Shared library | Package dùng chung cho nhiều MCP server. | Nhiều server cần cùng một policy. |
| Sidecar hoặc gateway | Process hoặc proxy riêng mà server gọi tới. | Cần chặn tập trung, không sửa từng server. |
| Service độc lập | Policy engine và approval service riêng. | Nhiều team, nhiều tenant, cần audit tập trung. |

Bảng này là khuyến nghị kỹ thuật, không phải yêu cầu của đặc tả.
Với lab, middleware in-process là lựa chọn ít hạ tầng nhất và vẫn chứng minh được luồng policy, approval, idempotency và trace. `[Nội bộ]`

## 3. Giao thức trên dây

### 3.1. JSON-RPC 2.0

MCP dùng JSON-RPC 2.0.
Mọi thứ là một message trên một kênh, không có URL kiểu REST và không có endpoint riêng cho từng tool. `[Spec]`

| Loại | Có `id` | Có phản hồi | Dùng cho |
| --- | --- | --- | --- |
| Request | Có, không được `null` | Có | `tools/call`, `resources/read`, `server/discover`. |
| Response | Cùng `id` | - | `result` hoặc `error`, không bao giờ cả hai. |
| Notification | Không | Không | `notifications/progress`, `notifications/cancelled`, `notifications/tools/list_changed`. |

Revision 2026-07-28 chỉ cho client gửi request và notification, server gửi response và notification.
Server không được gửi JSON-RPC request; tương tác server đến client đi qua MRTR. `[Spec]`

### 3.2. `_meta` và version

Mỗi request phải mang metadata của chính nó trong `_meta`.
Đây là hệ quả trực tiếp của việc bỏ session và handshake. `[Spec]`

| Khóa | Mức | Ý nghĩa |
| --- | --- | --- |
| `io.modelcontextprotocol/protocolVersion` | Bắt buộc | Version của request, ví dụ `"2026-07-28"`. |
| `io.modelcontextprotocol/clientCapabilities` | Bắt buộc | Client hỗ trợ gì; server không được dùng capability chưa khai báo. |
| `io.modelcontextprotocol/clientInfo` | Nên có | Tên và version client; chỉ để log và hiển thị. |
| `traceparent`, `tracestate`, `baggage` | Tùy chọn | Ngữ cảnh OpenTelemetry theo W3C Trace Context. |

Thiếu trường bắt buộc trong `_meta` thì request bị coi là malformed.
Server trả `-32602` và trên HTTP kèm `400 Bad Request`. `[Spec]`

Client có thể gọi `server/discover` trước để biết version và capability của server.
Server bắt buộc phải hiện thực `server/discover`. `[Spec]`

### 3.3. `resultType`

Mọi result phải có `resultType`.
Giá trị `"complete"` là kết quả cuối.
Giá trị `"input_required"` là kết quả trung gian, server cần thêm đầu vào từ client. `[Spec]`

Client gặp server cũ không có trường này thì phải coi như `"complete"`.
Đây là quy tắc tương thích ngược, không phải tùy chọn. `[Spec]`

### 3.4. Mã lỗi

| Mã | Tên | Dùng khi |
| --- | --- | --- |
| `-32602` | Invalid params | Tham số sai, thiếu trường bắt buộc, tool hoặc resource không tồn tại. |
| `-32601` | Method not found | Server không hỗ trợ method; trên HTTP thường đi kèm `404`. |
| `-32020` | HeaderMismatch | Header HTTP không khớp body, hoặc thiếu header bắt buộc; kèm `400`. |
| `-32021` | MissingRequiredClientCapability | Server cần capability mà client chưa khai báo; kèm `400`. |
| `-32022` | UnsupportedProtocolVersion | Version không được hỗ trợ; kèm danh sách `supported`. |
| `-32002` | Resource not found | Chỉ còn ở server cũ; client nên chấp nhận, server mới không được phát ra. |

### 3.5. Lỗi giao thức và lỗi thực thi

Lỗi giao thức là JSON-RPC `error`: request sai cấu trúc, tool không tồn tại, thiếu trường bắt buộc.
Model gần như không sửa được loại lỗi này. `[Spec]`

Lỗi thực thi là kết quả hợp lệ với `isError: true`: nghiệp vụ từ chối, downstream fail, dữ liệu không tồn tại.
Model có thể đọc và sửa loại lỗi này nếu thông điệp đủ rõ. `[Spec]`

Không trả stack trace, HTML hoặc lỗi rỗng cho model.
Trả một thông điệp ngắn, có gợi ý bước tiếp theo. `[Khuyến nghị]`

### 3.6. Stateless và tương thích legacy

Revision 2026-07-28 coi mỗi request là độc lập.
Server không được dựa vào request trước trên cùng kết nối để suy ra capability, version hay identity.
State cần sống qua nhiều request phải được đại diện bằng một handle tường minh do client gửi lại. `[Spec]`

`tools/list` có thể trả tập tool khác nhau theo authorization của từng request, nhưng không được khác theo connection. `[Spec]`

| Client | Server | Kết quả |
| --- | --- | --- |
| Modern | Modern | Chạy; lệch version thì retry với version chung. |
| Modern | Legacy | Fail hoặc xử lý sai ngữ nghĩa; trên stdio nên probe bằng `server/discover` trước. |
| Dual-era | Legacy | Chạy, nhưng phải tách state theo thế hệ. |
| Legacy | Modern | Fail; server hiện đại nên nêu version hỗ trợ trong lỗi trả về cho `initialize`. |

### 3.7. Hệ quả cho lab

Chốt một revision và ghi vào README, kèm version SDK.
Đừng đoán thế hệ server bằng cách thử `tools/call`.
Gửi `server/discover`, đọc lỗi, rồi mới quyết định fallback. `[Khuyến nghị]`

Nếu SDK chỉ hỗ trợ legacy, ghi rõ đó là quyết định có ý thức, không phải tai nạn.
Trộn hai mô hình trong cùng một server là nguồn gốc của những lỗi rất khó tái hiện. `[Khuyến nghị]`

## 4. Transport

### 4.1. stdio

Client khởi chạy server như một subprocess và nói chuyện qua `stdin` và `stdout`. `[Spec]`

Các yêu cầu của stdio:

- Mỗi message là một dòng JSON UTF-8; message không được chứa newline bên trong. `[Spec]`
- `stdout` chỉ chứa MCP message; không banner, không log, không stack trace. `[Spec]`
- Log đi ra `stderr`; client có thể capture, forward hoặc bỏ qua và không được coi `stderr` là lỗi. `[Spec]`
- Response có thể không theo thứ tự; client ghép theo `id`. `[Spec]`
- Process chính là connection; server crash thì mọi request đang bay mất, không có reconnect. `[Spec]`
- Server stdio chạy bằng quyền của user đang chạy host; phải pin version, kiểm hash, chạy trong container và không truyền secret qua argv. `[Khuyến nghị]`

Lỗi kinh điển của stdio là thư viện logging mặc định ghi ra `stdout`, hoặc framework in banner ra `stdout`.
Một dòng rác làm client parse fail cả kênh. `[Khuyến nghị]`

### 4.2. Streamable HTTP

Server expose một URL MCP duy nhất và chỉ nhận `POST`.
Không có `GET /tools`. `[Spec]`

Request có thể trả JSON ngay hoặc mở SSE scoped cho request đó để gửi progress rồi kết quả cuối.
Notification trả `202 Accepted` với body rỗng. `[Spec]`

Các header bắt buộc:

| Header | Khi nào | Giá trị |
| --- | --- | --- |
| `MCP-Protocol-Version` | Mọi POST request | Revision đang dùng, ví dụ `2026-07-28`. |
| `Mcp-Method` | Mọi request | Tên method, phải khớp `body.method`. |
| `Mcp-Name` | `tools/call`, `resources/read`, `prompts/get` | Tool name hoặc resource URI, phải khớp tham số trong body. |

Header lệch body thì server trả `400` kèm `-32020`.
Đừng retry mù, sửa client. `[Spec]`

Revision này bỏ session, bỏ `Mcp-Session-Id`, bỏ GET stream và bỏ khả năng resume SSE.
Mất stream là mất request; không có `Last-Event-ID`, không có replay.
Client phải gửi lại với `id` mới. `[Spec]`

Với SSE, đặt `X-Accel-Buffering: no` sau Nginx, tắt compression buffer ở proxy, và để timeout của load balancer dài hơn tool chậm nhất. `[Khuyến nghị]`

### 4.3. Chọn transport cho lab

| Bối cảnh | Chọn | Lý do |
| --- | --- | --- |
| Lab chạy một máy, hai server, một agent | stdio | Ít hạ tầng nhất, không cần OAuth, dễ chứng minh tool contract và MRTR. |
| Cần hai agent ở hai process cùng dùng một server | Streamable HTTP | Một instance, nhiều client, chứng minh tái sử dụng rõ hơn stdio. |
| Serverless, timeout ngắn | HTTP có điều kiện | Chỉ ổn nếu runtime stream được và tool ngắn; tool dài nên dùng tasks extension. |
| Hai agent trao đổi với nhau | Không phải MCP | Đó là bài toán agent-to-agent, không phải host-to-tool. |

Khuyến nghị thực dụng là bắt đầu bằng stdio để chốt tool contract và luồng phê duyệt.
Chỉ chuyển sang HTTP khi demo tái sử dụng cần hai process độc lập.
Đổi transport không được kéo theo thay đổi business logic. `[Khuyến nghị]`

### 4.4. Sáu lỗi vận hành điển hình

| Lỗi | Hậu quả | Cách chặn |
| --- | --- | --- |
| stdio in log ra `stdout` | Client parse fail cả kênh. | Cấu hình logger ra `stderr` từ dòng đầu; test parse từng dòng. |
| stdio pretty-print nhiều dòng | Message bị cắt thành nhiều dòng. | Serialize một dòng JSON, không xuống dòng. |
| Truyền secret qua argv | Secret hiện trong process list và log shell. | Dùng biến môi trường hoặc keychain. |
| Proxy buffer SSE | Client không nhận progress hoặc kết quả. | Tắt buffer, tăng timeout, test end-to-end. |
| Timeout ngắn hơn tool chậm nhất | Request bị cắt giữa chừng. | Đặt timeout theo tool chậm nhất; tool dài dùng tasks. |
| Header lệch body | `400` và `-32020`. | Sinh header từ cùng nguồn với body; không sửa tay. |

## 5. Primitive và hợp đồng tool

### 5.1. Ba primitive

| Primitive | Ai điều khiển | Dùng cho | Lab dùng không |
| --- | --- | --- | --- |
| Tools | Model | Hành động hoặc truy vấn có tham số, có thể có side effect. | Có, đây là phần chính. |
| Resources | Ứng dụng hoặc người dùng | Dữ liệu context: schema, tài liệu, bản ghi; thường read-only. | Tùy chọn, nếu cần chèn schema. |
| Prompts | Người dùng | Template hội thoại có tham số, do server tác giả. | Chưa cần. |

Ranh giới là: người dùng bấm chọn thì là prompt, ứng dụng tự chèn context thì là resource, model quyết định gọi thì là tool.
Một tính năng có thể dùng nhiều primitive, nhưng không nên gộp vào một tool `do_everything`. `[Khuyến nghị]`

### 5.2. Một định nghĩa tool

| Trường | Bắt buộc | Ghi chú thiết kế |
| --- | --- | --- |
| `name` | Có | Duy nhất trong server (SHOULD); 1-128 ký tự (SHOULD); động từ cộng đối tượng, ví dụ `get_employee`. |
| `title` | Không | Tên hiển thị cho người dùng. |
| `description` | Nên có | Đây là prompt surface; viết cho model đọc: khi nào dùng, khi nào không, hậu quả. |
| `inputSchema` | Có | JSON Schema object; mặc định 2020-12; nên đặt `additionalProperties: false`. |
| `outputSchema` | Không | Nếu có, `structuredContent` phải validate theo schema này. |
| `annotations` | Không | Gợi ý hành vi, không phải cơ chế bảo mật. |
| `icons` | Không | Metadata hiển thị; coi là dữ liệu không tin cậy. |

Tool không có tham số nên dùng `{"type": "object", "additionalProperties": false}`. `[Spec]`

`structuredContent` là dữ liệu do server tạo và không liên quan đến "structured outputs" của model.
Đây là điểm dễ nhầm khi so MCP với function calling. `[Spec]`

### 5.3. Annotation không phải phân quyền

| Annotation | Mặc định | Host nên làm gì |
| --- | --- | --- |
| `readOnlyHint` | `false` | Vẫn kiểm tra quyền đọc và rate limit. |
| `destructiveHint` | `true` | Mặc định cần approval; chỉ hạ mức khi policy nói rõ. |
| `idempotentHint` | `false` | Không thay thế idempotency key thật ở server. |
| `openWorldHint` | `true` | Tăng kiểm soát output, SSRF và exfiltration. |

Đặc tả yêu cầu client phải coi annotation là không tin cậy trừ khi server là server tin cậy.
Schema chính thức cũng ghi client không nên ra quyết định dùng tool dựa trên annotation từ server không tin cậy. `[Spec]`

Một server độc có thể khai `readOnlyHint: true` cho tool xóa dữ liệu.
Host chỉ nên dùng annotation làm metadata, kết hợp danh sách tool đã duyệt, version server và policy của tổ chức. `[Khuyến nghị]`

### 5.4. Kết quả và lỗi

Result chứa `content` và tùy chọn `structuredContent`.
Nếu tool có `outputSchema` thì server phải trả `structuredContent` đúng schema và client nên validate. `[Spec]`

Kèm thêm một text block JSON để tương thích client cũ, nhưng đừng coi đó là nguồn chính. `[Khuyến nghị]`

Lỗi giao thức dùng JSON-RPC `error`.
Lỗi thực thi dùng result với `isError: true`.
Hai loại này khác nhau về khả năng model tự sửa. `[Spec]`

### 5.5. Sáu nguyên tắc viết tool contract

| # | Nguyên tắc | Lý do |
| --- | --- | --- |
| 01 | Một tool, một ý định. | `manage_task` với `action` enum buộc model nhớ enum ngầm; tách thành `create_task`, `update_task_status`, `close_task`. |
| 02 | Tên theo động từ cộng đối tượng. | `get_employee` dễ hiểu hơn `emp_lookup`; thêm namespace nếu server có nhiều miền. |
| 03 | Description là prompt surface. | Nói rõ khi nào dùng, khi nào không, side effect, giới hạn, ví dụ. |
| 04 | Schema chặt. | Mỗi trường tự do là một vé cho hallucination; chặn tham số thừa ngay ở validate. |
| 05 | Output có cấu trúc. | Host validate, render và test được; đừng trả text tự do cho dữ liệu có schema. |
| 06 | Write phải idempotent. | Transport timeout, client retry, MRTR lặp; không có key thì sẽ ghi trùng. |

Sáu nguyên tắc này là khuyến nghị kỹ thuật, không phải yêu cầu bắt buộc của đặc tả.
Chúng nhất quán với tài liệu của các vendor về thiết kế tool. `[Khuyến nghị]`

### 5.6. Idempotency

MCP không có idempotency key ở tầng giao thức.
Đây là khoảng trống lớn nhất giữa MCP và yêu cầu SR6 của Track 01. `[Spec]`

Cách làm khuyến nghị:

1. Chuẩn hóa tham số: serialize với thứ tự key cố định, bỏ trường không ảnh hưởng kết quả, hash SHA-256.
2. Sinh khóa ổn định: `sha256(run_id + step_id + tool_name + canonical_json(args))`; không dùng thời gian hiện tại hay UUID mới cho mỗi lần retry.
3. Ghi nhận trước khi gọi downstream: insert với unique constraint; nếu khóa đã tồn tại thì đọc trạng thái thay vì chạy lại.
4. Lưu kết quả và trả lại: lần retry sau trả đúng result cũ, kèm cờ replay nếu cần.
5. TTL và dọn dẹp: giữ khóa đủ lâu để phủ mọi retry, ví dụ 24 giờ tới 7 ngày; xóa theo lô.

Bảng cần có: `key` (primary key), `principal`, `tool`, `args_hash`, `status` (`in_progress`, `completed`, `failed`), `result`, `created_at`, `expires_at`. `[Khuyến nghị]`

Khóa tồn tại nhưng `in_progress` thì trả lỗi tạm thời, không chạy song song hai lần ghi.
Khóa tồn tại với `args_hash` khác thì từ chối, vì client đang dùng lại khóa sai.
Khóa đã `completed` thì trả kết quả cũ. `[Khuyến nghị]`

Transaction không tự cứu bạn.
Một transaction bao gồm "gọi API bên ngoài" không rollback được nếu API đã thành công mà commit database thất bại.
Dùng outbox hoặc lưu trạng thái trước, gọi downstream, rồi cập nhật kết quả; chấp nhận có một cửa sổ cần job đối soát. `[Khuyến nghị]`

### 5.7. Ngân sách context

Mỗi định nghĩa tool chiếm token trong prompt.
Giữ mỗi server trong khoảng 5-20 tool, gộp theo miền nghiệp vụ. `[Khuyến nghị]`

Không có ngưỡng chung cho mọi model và mọi bộ tool.
Phải đo trên lab thay vì tin một con số tuyệt đối. `[Khuyến nghị]`

Tránh `execute_sql`, `http_request`, `run_shell`.
Nếu buộc phải có, giới hạn câu lệnh, domain, tham số và yêu cầu approval ở mức cao nhất. `[Khuyến nghị]`

## 6. Client, elicitation và MRTR

### 6.1. Capability của client

| Capability | Trạng thái | Dùng cho | Khuyến nghị cho lab |
| --- | --- | --- | --- |
| `elicitation` | Active | Server hỏi người dùng thêm dữ liệu hoặc xác nhận. | Bật; đây là chỗ hiển thị form xác nhận trước khi ghi. |
| `sampling` | Deprecated | Server nhờ client gọi model. | Không dùng; xử lý model ở host. |
| `roots` | Deprecated | Server hỏi client danh sách gốc file system. | Không dùng; truyền đường dẫn qua tham số tool. |
| `logging` | Deprecated | Server gửi log qua giao thức. | Dùng `stderr` hoặc OpenTelemetry. |
| `extensions` | Active | Tasks, apps, skills, auth nâng cao. | Chỉ bật extension đã đọc và đã test. |

Client khai báo capability trong `_meta` của từng request, không phải một lần lúc khởi tạo. `[Spec]`

### 6.2. Elicitation

Elicitation có hai mode.

| Mode | Dữ liệu | Dùng cho | Giới hạn |
| --- | --- | --- | --- |
| Form | Dữ liệu cấu trúc, không nhạy cảm | Tên, email, lựa chọn, xác nhận. | Schema phẳng, kiểu nguyên thủy; không hỏi mật khẩu, token, số thẻ, OTP. |
| URL | Việc nhạy cảm phải ra ngoài client | Thanh toán, OAuth, nhập secret. | Phải hiển thị domain thật, mở bằng trình duyệt hệ thống, không nhúng iframe. |

Ba luật bảo mật của elicitation:

1. Form mode không được hỏi mật khẩu, token, số thẻ, OTP hay bất kỳ secret nào. `[Spec]`
2. URL mode phải hiển thị domain thật, chặn scheme lạ, không cho server đổi URL sau khi người dùng đã xem. `[Spec]`
3. Câu trả lời phải gắn với đúng người, đúng phiên, có hạn, không tái sử dụng cho request khác. `[Khuyến nghị]`

Trong revision 2026, elicitation không còn là server-initiated request.
Server trả `input_required`, client hỏi người dùng rồi gọi lại. `[Spec]`

### 6.3. MRTR là chỗ đặt phê duyệt

MRTR là viết tắt của Multi Round-Trip Requests.
Đây là cơ chế biến "agent đề xuất" thành "người dùng xác nhận rồi mới ghi". `[Spec]`

Luồng cơ bản:

1. Client gửi request ban đầu, ví dụ `tools/call` cho tool cần xác nhận trước khi ghi.
2. Server trả `resultType: "input_required"` kèm `inputRequests` và `requestState`.
3. Client kiểm tra capability và hỏi người dùng; không hỗ trợ loại yêu cầu đó thì từ chối rõ ràng, không được bịa câu trả lời.
4. Client gọi lại với `id` mới, giữ nguyên method và tham số gốc, thêm `inputResponses` và `requestState`.
5. Server xác thực state và tiếp tục; trả `complete` hoặc thêm một vòng nữa.

Ví dụ rút gọn:

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "result": {
    "resultType": "input_required",
    "inputRequests": {
      "confirm-1": {
        "method": "elicitation/create",
        "params": {
          "mode": "form",
          "message": "Cập nhật task T-1042 sang trạng thái done?",
          "requestedSchema": {
            "type": "object",
            "properties": { "confirm": { "type": "boolean" } },
            "required": ["confirm"],
            "additionalProperties": false
          }
        }
      }
    },
    "requestState": "opaque-state-do-server-sinh-ra"
  }
}
```

MRTR chỉ hỗ trợ trên ba method: `tools/call`, `resources/read` và `prompts/get`.
Server không được gửi `InputRequiredResult` cho request khác. `[Spec]`

### 6.4. `requestState` là dữ liệu không tin cậy

`requestState` đi qua tay client và có thể bị sửa.
Đặc tả yêu cầu server coi nó là đầu vào do kẻ tấn công kiểm soát. `[Spec]`

Nếu `requestState` ảnh hưởng đến authorization, truy cập tài nguyên hoặc business logic, server phải bảo vệ tính toàn vẹn bằng HMAC hoặc AEAD và phải từ chối state không qua xác thực.
Chỉ được bỏ bảo vệ toàn vẹn khi việc sửa state không gây hậu quả gì tệ hơn request thất bại. `[Spec]`

Để chống replay, server nên đưa vào payload được bảo vệ: principal đã xác thực, TTL ngắn, và định danh request gốc hoặc digest của tham số.
Nếu một state phải được dùng đúng một lần, server phải tự thực thi invariant đó ở phía server. `[Spec]`

Client phải echo lại đúng giá trị `requestState`, không được inspect, parse, sửa hoặc giả định nội dung.
Nếu server không gửi `requestState`, client không được tự thêm vào. `[Spec]`

### 6.5. Giới hạn phải đặt

- Client đặt trần số vòng MRTR cho một request. `[Khuyến nghị]`
- Server đặt trần số `inputRequests` mỗi vòng và thời gian sống của `requestState`. `[Khuyến nghị]`
- Kết quả `input_required` không nên được cache. `[Khuyến nghị]`
- Vượt trần thì trả lỗi rõ ràng, đừng để agent quay vòng vô hạn. `[Khuyến nghị]`

## 7. Auth và scope

### 7.1. Auth là tùy chọn

Authorization là tùy chọn trong MCP.
Khi được hỗ trợ, server dùng HTTP nên theo đặc tả OAuth 2.1 của MCP.
Server dùng stdio không nên chạy luồng OAuth, mà lấy credential từ môi trường. `[Spec]`

Điều này có nghĩa MCP không tự sinh ra mô hình phân quyền.
Nó chỉ định nghĩa cách client và server tìm nhau, lấy token và kiểm token. `[Spec]`

### 7.2. Luồng HTTP

1. Gọi không token, nhận `401` với `WWW-Authenticate: Bearer resource_metadata="..."`, có thể kèm `scope`.
2. Đọc Protected Resource Metadata theo RFC 9728 tại `/.well-known/oauth-protected-resource`.
3. Đọc Authorization Server Metadata theo RFC 8414 hoặc OIDC Discovery.
4. Dùng Authorization Code cộng PKCE, gửi `resource` indicator theo RFC 8707, bảo vệ `state`, chỉ dùng redirect URI đã đăng ký.
5. Đổi code lấy token và gọi MCP; lặp lại `resource` ở token request.
6. Khi thiếu quyền, server trả scope cần thêm; client xin consent lại, không lặng lẽ dùng token cũ cho việc khác.

MCP server phải kiểm token được phát cho chính nó, theo audience.
Server không được chấp nhận token không được phát cho mình.
Nếu server gọi API upstream, nó phải dùng token riêng của upstream, không được chuyển tiếp token nhận từ client. `[Spec]`

### 7.3. Năm điểm dễ làm sai

| Điểm | Sai | Đúng |
| --- | --- | --- |
| Audience | Chấp nhận bất kỳ token hợp lệ nào do IdP cấp. | Kiểm tra `aud` khớp chính server mình; token cho API khác phải bị từ chối. |
| PKCE | Dùng `plain` hoặc bỏ qua vì là confidential client. | Dùng PKCE theo OAuth 2.1, với `S256`. |
| Resource indicator | Chỉ gửi ở authorization request. | Gửi ở cả authorization và token request. |
| Token passthrough | Chuyển nguyên token của client xuống API downstream. | Dùng credential riêng của server hoặc token exchange với scope hẹp. |
| Log và storage | Log header `Authorization`, lưu token trong localStorage. | Redact trước khi ghi; giữ token trong bộ nhớ tiến trình hoặc secure storage. |

### 7.4. Scope theo hành động

| Scope | Cho phép | Không cho phép |
| --- | --- | --- |
| `directory.read` | Đọc hồ sơ, tìm kiếm cơ bản. | Sửa, xóa, đọc trường nhạy cảm. |
| `directory.write` | Cập nhật trường được phép. | Tạo hoặc xóa nhân viên nếu không có scope riêng. |
| `tasks.read` | Đọc task trong phạm vi được cấp. | Đọc task của tenant khác. |
| `tasks.write` | Tạo và cập nhật task. | Duyệt hoặc đóng task của người khác. |
| `tasks.approve` | Phê duyệt hành động nhạy cảm. | Tự động cấp cho agent; chỉ người dùng mới có. |

Bảng này là ví dụ thiết kế cho lab, không phải scope chuẩn của MCP.
Đừng dùng một scope duy nhất kiểu `mcp` cho mọi thứ.
Scope càng rộng, token lộ càng nguy hiểm và step-up càng khó.
Với tool xóa, yêu cầu scope riêng và approval riêng. `[Khuyến nghị]`

### 7.5. stdio

Không truyền secret qua argv, vì process list và log shell đều thấy.
Dùng biến môi trường do host kiểm soát hoặc keychain của hệ điều hành.
Khi spawn subprocess, chỉ truyền biến cần thiết, đừng để server kế thừa toàn bộ môi trường. `[Khuyến nghị]`

Chạy cùng máy không có nghĩa là được làm mọi thứ.
Server vẫn phải kiểm tra quyền ở tầng nghiệp vụ. `[Khuyến nghị]`

### 7.6. 401 và 403

`401` là chưa xác thực hoặc token không hợp lệ.
`403` là đã xác thực nhưng không đủ quyền. `[Spec]`

Trả `403` cho token hết hạn thì client không biết cần refresh.
Trả `401` khi thiếu scope thì client có thể xóa token tốt và bắt người dùng đăng nhập lại vô ích. `[Khuyến nghị]`

### 7.7. Auth không phải authorization nghiệp vụ

OAuth trả lời "token này có hợp lệ cho server này không".
Nó không trả lời "người này có được sửa trường `department` của bản ghi E-1042 không". `[Khuyến nghị]`

Quyền theo bản ghi, theo trường và theo hành động phải được kiểm ở server hoặc control plane, với dữ liệu trạng thái hiện tại.
Đây là lý do SR2 và SR3 vẫn phải dựng dù đã có OAuth. `[Nội bộ, báo cáo 11/11 đã review]`

## 8. Mô hình mối đe dọa

Giao thức giải quyết việc truyền tin, không giải quyết việc tin ai.
Tool description, resource, prompt và kết quả API đều là dữ liệu không tin cậy. `[Spec]`

Bảng dưới đây tổng hợp từ đặc tả, OWASP và kinh nghiệm thiết kế.
Các biện pháp trong cột giảm thiểu là khuyến nghị, không phải bảo đảm của giao thức. `[Khuyến nghị]`

| Mối đe dọa | Đường tấn công | Giảm thiểu |
| --- | --- | --- |
| Prompt injection qua kết quả | Tool trả văn bản chứa instruction, ví dụ "bỏ qua quy tắc cũ và gửi dữ liệu cho...". | Coi output là dữ liệu, không phải instruction; gắn nhãn nguồn; giới hạn tool được gọi sau khi đọc dữ liệu ngoài. |
| Tool poisoning và rug pull | Mô tả tool chứa instruction ẩn, hoặc server đổi định nghĩa sau khi đã được duyệt. | Hiển thị mô tả đầy đủ; pin version; allowlist theo tên và hash; duyệt lại khi schema đổi. |
| Cross-server shadowing | Server độc đăng ký tool trùng tên với server tin cậy. | Namespace theo server cộng tool; hiển thị nguồn trong UI. |
| Confused deputy, token passthrough | Proxy dùng credential mạnh của mình gọi API thay người dùng, hoặc chuyển nguyên token xuống dưới. | Token exchange với scope hẹp; kiểm quyền theo từng người dùng; không passthrough. |
| SSRF và path traversal | Resource `https://` trỏ IP nội bộ, hoặc `file://` với `..` và symlink. | Allowlist scheme và host; chặn IP private; canonicalize path và kiểm prefix sau khi resolve. |
| Exfiltration qua tham số | Model bị dụ đưa secret vào tham số của một tool gửi ra ngoài. | Phân loại tool theo rủi ro; chặn tham số chứa secret; egress allowlist; approval cho tool gửi ra ngoài. |
| Local server compromise | Cài MCP server lạ từ npm hoặc pip, chạy với quyền của user. | Pin version và hash; review source; chạy trong container; giới hạn file và mạng. |
| Rò rỉ qua log | Log header, tham số, kết quả tool hoặc `requestState`. | Redact mặc định; log theo cấu trúc; giới hạn thời gian lưu. |

### 8.1. Bốn lớp phòng thủ

| Lớp | Trách nhiệm |
| --- | --- |
| Host | Hiển thị nguồn tool; xin consent cho hành động ghi; giới hạn tool theo phiên; validate output; không auto-execute. |
| Server | Kiểm authorization trên từng request; không tin tham số; giới hạn kích thước và thời gian; chống SSRF và path traversal; ghi audit. |
| Control plane | Policy theo người dùng và tool; approval gắn với hash tham số; idempotency; action registry; kill switch; audit xuyên server. |
| Platform | Network segmentation; egress proxy; secret manager; sandbox; WAF; rate limit; log tập trung; scan vulnerability. |

Không lớp nào thay thế được lớp nào.
MCP không phải lớp nào trong bốn lớp này; nó là giao thức nối chúng. `[Khuyến nghị]`

### 8.2. Checklist tối thiểu

- Phân loại tool: mỗi tool gắn nhãn read, write, destructive hoặc external; nhãn do con người duyệt, không chỉ do server khai. `[Khuyến nghị]`
- Approval cho write: consent gắn với hash tham số, có hạn và dùng một lần. `[Khuyến nghị]`
- Allowlist server: chỉ nối server đã duyệt, pin version, theo dõi thay đổi tool. `[Khuyến nghị]`
- Sandbox stdio: container hoặc process quyền tối thiểu, giới hạn file system và mạng. `[Khuyến nghị]`
- Token hẹp: scope theo hành động, TTL ngắn, đúng audience, không passthrough. `[Spec]` + `[Khuyến nghị]`
- Output không tin cậy: render an toàn, sanitize, không tự fetch resource link. `[Khuyến nghị]`
- Audit đầy đủ: ai gọi tool gì, hash tham số, kết quả, ai duyệt. `[Khuyến nghị]`

## 9. Kiểm thử và đo lường

### 9.1. Ba tầng test

| Tầng | Đo gì | Công cụ |
| --- | --- | --- |
| 1. Conformance | JSON-RPC, `_meta`, version, header, mã lỗi, `resultType`, MRTR. | Mock server và JSON thô. |
| 2. Tool contract | Schema, output, lỗi nghiệp vụ, idempotency, phân trang, giới hạn kích thước. | Test của sản phẩm, không chỉ của giao thức. |
| 3. E2E | Người dùng hỏi, host chọn tool, server trả kết quả, UI cập nhật. | Đo latency, chi phí, tỷ lệ thành công và hành vi khi lỗi. |

### 9.2. Ma trận tối thiểu

| Case | Kỳ vọng |
| --- | --- |
| Thiếu `_meta` bắt buộc | `-32602`, HTTP `400`. |
| Version không hỗ trợ | `-32022` kèm danh sách `supported`. |
| Header lệch body | `-32020`, HTTP `400`. |
| Tool không tồn tại | `-32602`, không phải `isError`. |
| Tham số sai schema hoặc tham số thừa | Bị từ chối với thông điệp sửa được. |
| Tool không tham số | Chấp nhận schema object rỗng. |
| Output đúng `outputSchema` | `structuredContent` validate được. |
| Nghiệp vụ từ chối | `isError: true`, không phải JSON-RPC error. |
| MRTR accept | Gọi lại với `id` mới, trả kết quả cuối. |
| MRTR decline hoặc cancel | Server dừng, không ghi gì. |
| MRTR state bị sửa | Từ chối, không khôi phục ngữ cảnh. |
| Write gọi lặp 3 lần | Một bản ghi thay đổi, hai lần trả kết quả cũ. |
| Quyền bị thu hồi giữa phiên | Request sau bị từ chối, cache không che. |
| stdio in log ra `stdout` | Client phát hiện và báo lỗi parse có kiểm soát. |

### 9.3. Đừng test chỉ qua SDK

SDK tự thêm `_meta`, tự retry, tự fallback và che mất chi tiết trên dây.
Giữ ít nhất một bộ test gửi JSON-RPC thô.
Nếu chỉ test qua SDK, bạn đang test SDK chứ không test server. `[Khuyến nghị]`

Test phải chạy được mà không cần model.
Tách phần giao thức và tool contract khỏi phần LLM.
Khi test đỏ, bạn biết lỗi ở đâu.
Khi chỉ có E2E với model, mọi thứ đều có thể được giải thích bằng "model hơi khó chịu". `[Khuyến nghị]`

### 9.4. Số phải đo

| Chỉ số | Cách đo | Vì sao |
| --- | --- | --- |
| Latency đọc và ghi | p50, p95 theo tool, cùng máy, cùng dữ liệu. | So sánh nhánh MCP với nhánh gọi API trực tiếp. |
| Tỷ lệ ghi trùng | Đếm bản ghi sau khi retry có chủ đích. | Bằng chứng idempotency hoạt động, không phải cảm nhận. |
| Tỷ lệ hoàn tất MRTR | Phần trăm request xong trong 3 vòng. | Thấp nghĩa là câu hỏi hoặc schema có vấn đề. |
| Chi phí token | Token của tool definition cộng kết quả mỗi lượt. | Tool list quá lớn làm tăng chi phí trước câu hỏi đầu tiên. |
| Công sức tích hợp | Số bước, số dòng cấu hình, thời gian debug một tool fail. | Đây là lợi ích chính của MCP, phải định lượng được. |

### 9.5. Bằng chứng đo được từ nguồn ngoài

- Microsoft Research khảo sát 1.470 MCP server sau lọc, chạy 2.443 tool call trên 1.312 tool khác nhau. `[Số đo]`
- Output trung bình của một tool là 4.431 token, median 98 token, cực đại 557.766 token; một số tool trả quá lớn làm tràn context. `[Số đo]`
- Có 775 tool trùng tên giữa các server; tên `search` xuất hiện ở 32 server khác nhau. `[Số đo]`
- LongFuncEval đo mức giảm hiệu năng 7% đến 85% khi số tool tăng, 7% đến 91% khi response dài hơn, và 13% đến 40% khi hội thoại nhiều lượt hơn. Đây là preprint, chưa peer review. `[Số đo]`
- Anthropic báo cáo một cấu hình 5 server với 58 tool tốn khoảng 55K token trước khi hội thoại bắt đầu, và từng thấy tool definition ăn 134K token trước khi tối ưu. Đây là số vendor tự công bố. `[Số đo]`
- Anthropic báo cáo Tool Search giảm từ khoảng 77K token xuống 8.7K token, tức khoảng 85%, và cải thiện eval nội bộ từ 49% lên 74% với Opus 4, từ 79.5% lên 88.1% với Opus 4.5. Đây là eval nội bộ, không tái lập được. `[Số đo]`
- MCP-Universe, benchmark chạy trên 11 MCP server thật, báo cáo success rate 43,72% cho GPT-5 và 33,33% cho Grok-4. Trang benchmark và abstract paper không thống nhất về model thứ ba, nên báo cáo này không trích model đó. Con số trên cho thấy MCP không tự làm model giỏi chọn tool hơn. `[Số đo]`

Các con số trên không cộng lại thành một điểm số.
Chúng trả lời những câu khác nhau: chi phí bề mặt tool, rủi ro trùng tên, độ chính xác khi đọc kết quả dài, và độ khó của bài toán chọn tool.
Trước khi dùng bất kỳ con số nào trong quyết định, phải đo lại trên lab. `[Khuyến nghị]`

## 10. Khi nào MCP là lựa chọn sai

MCP không thay thế function calling, OpenAPI, workflow engine hay event bus.
Nó giải quyết một lớp vấn đề cụ thể: nhiều host khám phá và gọi cùng một bộ năng lực theo một giao thức chung.
Nếu vấn đề của bạn không nằm ở lớp đó, MCP chỉ thêm một tầng phức tạp. `[Khuyến nghị]`

| Tình huống | Vì sao | Nên làm gì |
| --- | --- | --- |
| Một ứng dụng, một tool, không tái sử dụng | Thêm process, transport, auth và test mà không có lợi ích chia sẻ. | Gọi hàm trực tiếp hoặc function calling. |
| Quy trình cố định, cần audit từng bước | Model không nên quyết định thứ tự bước. | Workflow engine, model chỉ là một node. |
| Cần exactly-once hoặc giao dịch phân tán | MCP không cung cấp transaction; retry có thể ghi trùng. | Outbox, saga, idempotency ở tầng nghiệp vụ. |
| Serverless không stream, timeout ngắn | SSE và tool dài không phù hợp; MRTR cần state bền. | API đồng bộ ngắn, hoặc job queue và polling. |
| Không có ai vận hành server | MCP server là một dịch vụ có version, auth, log, sự cố. | Dùng API có sẵn, hoặc cam kết owner trước khi dựng. |
| Tool chỉ dùng trong một process, không ra mạng | Thêm giao thức và tiến trình là chi phí không cần thiết. | Gọi trực tiếp trong process. |
| Thứ cần tái dùng là kiến thức tích hợp, không phải năng lực | MCP vận chuyển năng lực; kiến thức có thể đóng gói kiểu khác. | Agent Skills hoặc tài liệu có cấu trúc, tùy bài toán. |

### 10.1. Bốn câu hỏi quyết định

1. Có hơn một host hoặc agent cần dùng tool này không?
   Nếu không, bắt đầu bằng function calling hoặc gọi trực tiếp. `[Khuyến nghị]`
2. Tool có thay đổi độc lập với host không?
   Nếu có, MCP giảm chi phí phát hành lại host. `[Khuyến nghị]`
3. Có owner, auth, log và test cho server không?
   Nếu không, đừng dựng; đó là một dịch vụ, không phải một file script. `[Khuyến nghị]`
4. Đã có baseline để đo chưa?
   Chưa có số thì chưa thể kết luận MCP tốt hơn; đo trước, chọn sau. `[Khuyến nghị]`

### 10.2. MCP thắng ở đâu

- Nhiều host, một bộ tool: agent trong chat, trong CI và trong app nội bộ cùng cần danh bạ và task list; một server tiết kiệm hơn nhiều lần tích hợp. `[Khuyến nghị]`
- Tool đổi độc lập với host: server thêm tool, đổi schema, phát `list_changed` mà không phải phát hành lại host. `[Spec]`
- Cần biên giới rõ để đo: tách server khỏi host tạo điều kiện sandbox, giới hạn quyền và cho một mốc để đo latency, chi phí, độ phức tạp. `[Khuyến nghị]`

### 10.3. Một quan sát nội bộ

Một bản nháp nội bộ chưa review ghi rằng AppotaPay công bố Agent Skills cho lập trình viên tích hợp thanh toán và không thấy MCP server trong repo công khai.
Nếu quan sát này đúng, nó là ví dụ cho trường hợp thứ cần tái dùng là kiến thức tích hợp, không phải một năng lực gọi được. `[Nội bộ, chưa review]`

Không dùng quan sát này để kết luận AppotaPay đã cân nhắc và loại MCP.
Nó chỉ là một dữ kiện cần kiểm lại trước khi dùng trong báo cáo chính thức. `[Nội bộ, chưa review]`

## 11. Áp dụng vào lab

### 11.1. Phạm vi lab

Lab dự kiến có hai hệ thống mô phỏng: danh bạ nhân viên và danh sách công việc.
Mỗi hệ thống là một MCP server với 3-5 tool.
Một host agent đọc dữ liệu, đề xuất cập nhật; control plane kiểm tra quyền; chỉ ghi sau khi người dùng xác nhận.
Một agent thứ hai dùng lại cùng bộ tool để chứng minh tái sử dụng.
Một nhánh gọi API trực tiếp được giữ làm baseline để so sánh. `[Nội bộ]`

### 11.2. SR1-SR8: MCP cung cấp gì, lab phải dựng gì

| Mã | MCP cung cấp | Lab phải dựng |
| --- | --- | --- |
| SR1 Danh tính và cửa ghi | Token OAuth và request metadata, nhưng MCP không định nghĩa danh tính người yêu cầu; token có thể là token người dùng hoặc token client. | Control plane ánh xạ token sang principal và gắn principal vào từng lời gọi; trace ghi đúng người yêu cầu, không chỉ tài khoản dịch vụ. |
| SR2 Luật chạy được | Không. Annotation là hint, không phải policy. | Policy engine kiểm ở server hoặc control plane; sửa prompt không làm đổi quyết định. |
| SR3 Phạm vi quyền | Tool schema chỉ ràng buộc hình dạng tham số. | Server lọc trường và bản ghi theo quyền; scope OAuth chỉ là một phần. |
| SR4 Điểm dừng rủi ro | MRTR cho phép dừng và hỏi lại; `requestState` có thể mang ngữ cảnh. | Hash tham số, TTL, nonce một lần, kiểm toàn vẹn state, lưu quyết định duyệt. |
| SR5 Fail-closed | Không có primitive fail-closed. | Policy mặc định từ chối khi không xác định được quyền; test trường hợp kho quyền không trả lời. |
| SR6 Không tạo hiệu ứng thứ hai | Không có idempotency key hay transaction. | Idempotency store, khóa ổn định, TTL, test replay; hệ thống nghiệp vụ phải tôn trọng khóa. |
| SR7 Trace xuyên suốt | `traceparent`, `tracestate`, `id` của request và tool call. | Trace thêm principal, quyết định policy, hash phê duyệt, kết quả và chi phí. |
| SR8 Tái dùng tách quyền | Một server phục vụ nhiều client; mỗi client có token và capability riêng. | Không chia sẻ token giữa hai agent; server không coi connection là identity; kiểm quyền theo từng request. |

Bảng này là lý do MCP không thể là toàn bộ câu trả lời cho Track 01.
MCP làm phần giao thức tốt hơn, nhưng tám bảo đảm vẫn phải có chủ. `[Khuyến nghị]`

### 11.3. Những gì báo cáo này không quyết

Báo cáo này không quyết stack, ngôn ngữ, framework, số server cuối cùng, transport cuối cùng, policy engine, nơi lưu idempotency hay thiết kế UI phê duyệt.
Những quyết định đó phải nằm trong ADR, sau khi khảo sát và so sánh đủ năm mô hình. `[Nội bộ]`

Báo cáo cũng không khẳng định lab sẽ chạy trên Thổ Thần AI.
Nếu lab nhắm cắm vào Thổ Thần, hợp đồng tool phải đăng ký được vào Integration Registry của AgentLize, và telemetry phải đủ trường cho Value Intelligence.
Đây là ràng buộc cần kiểm, không phải kết luận. `[Nội bộ, chưa xác nhận]`

### 11.4. Câu hỏi cần Kevin trả lời

1. Trong sáu ô của Thổ Thần AI, ô nào đã chạy thật, ô nào còn là kế hoạch?
   Riêng Tool/MCP Runtime đã có chưa? `[Nội bộ, chưa xác nhận]`
2. Nếu đã có MCP runtime, nó là MCP gateway dùng chung hay mỗi connector một server?
   Ai giữ danh sách tool? `[Nội bộ, chưa xác nhận]`
3. Policy của AgentLize có API truy vấn lúc chạy không, hay chính sách được nhúng vào cấu hình khi triển khai? `[Nội bộ, chưa xác nhận]`
4. Duyệt người trước khi ghi nằm ở đâu: AgentLize, Thổ Thần hay hệ thống nghiệp vụ?
   Nếu chưa có, lab có được phép đề xuất đặt ở runtime không? `[Nội bộ, chưa xác nhận]`
5. SDK MCP mà team dùng đang hỗ trợ revision 2026-07-28 hay chỉ legacy 2025-11-25? `[Chưa xác minh]`

### 11.5. Kết luận

MCP là ứng viên đáng thử trong lab vì bài toán có nhiều host, một bộ tool và yêu cầu tái sử dụng cho agent thứ hai.
Nhưng MCP chỉ giải quyết lớp giao thức; tám bảo đảm SR1-SR8 vẫn phải được dựng ở control plane và hệ thống nghiệp vụ. `[Khuyến nghị]`

Kết luận đúng chỉ có sau khi đo cùng một kịch bản qua hai nhánh MCP và gọi API trực tiếp.
Nếu số đo không cho thấy lợi ích rõ, kết luận đúng là "MCP chưa phù hợp ở giai đoạn này", không phải cố chứng minh ngược lại. `[Khuyến nghị]`

Đây là khuyến nghị để đưa vào ADR, không phải quyết định chọn mô hình. `[Nội bộ]`

## 12. Việc tiếp theo

| # | Việc | Đầu ra kiểm được |
| --- | --- | --- |
| 1 | Chốt revision MCP và version SDK. | README ghi revision, version SDK, transport mặc định. |
| 2 | Viết tool contract cho hai server mẫu. | `tools/list` trả schema; có test validate và test tham số sai. |
| 3 | Dựng MRTR approval với `requestState` được bảo vệ toàn vẹn. | Test accept, decline, sửa state, hết hạn, dùng lại state. |
| 4 | Dựng idempotency store và test replay. | Gọi lặp 3 lần chỉ một bản ghi thay đổi; log có khóa và kết quả cũ. |
| 5 | Dựng nhánh gọi API trực tiếp làm baseline. | Cùng kịch bản, cùng dữ liệu, đo latency và công sức tích hợp. |
| 6 | Chạy agent thứ hai dùng lại cùng server. | Không sửa server; log của hai agent trên cùng tool; quyền tách nhau. |
| 7 | Đo M1-M6 và viết kết luận. | Bảng số đo có lệnh chạy lại; kết luận đạt, không đạt hoặc không kết luận. |

Mỗi mục phải kèm một link, một con số hoặc một lệnh chạy lại được.
"Đang nghiên cứu" không phải kết quả.
"Đã test" không phải bằng chứng nếu không có log hoặc test case. `[Nội bộ]`

## 13. Nguồn

### 13.1. Nguồn gốc

| ID | Nguồn | Loại | URL | Dùng cho |
| --- | --- | --- | --- | --- |
| S1 | MCP Specification, bản `latest` trỏ 2026-07-28 | Spec | https://modelcontextprotocol.io/specification/latest | Kiến trúc, primitive, tuyên bố phạm vi. |
| S2 | Versioning and Compatibility | Spec | https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning | Stateless, `_meta`, modern/legacy, `server/discover`. |
| S3 | Transports overview | Spec | https://modelcontextprotocol.io/specification/2026-07-28/basic/transports | Message direction, request metadata, cancellation. |
| S4 | stdio transport | Spec | https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio | Framing, `stdout`/`stderr`, shutdown, restart. |
| S5 | Streamable HTTP transport | Spec | https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http | POST, SSE, header, `202`, không session, không resume. |
| S6 | Tools | Spec | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | Tool definition, schema, annotation, kết quả, lỗi, MRTR. |
| S7 | Multi Round-Trip Requests | Spec | https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr | `input_required`, `inputRequests`, `requestState`, method hỗ trợ. |
| S8 | Elicitation | Spec | https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation | Form mode, URL mode, capability, giới hạn bảo mật. |
| S9 | Authorization | Spec | https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization | OAuth 2.1, RFC 9728, RFC 8707, PKCE, audience. |
| S10 | Authorization Security Considerations | Spec | https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations | Token passthrough, token theft, confused deputy. |
| S11 | Key Changes | Spec | https://modelcontextprotocol.io/specification/2026-07-28/changelog | Thay đổi so với 2025-11-25, deprecation. |
| S12 | TypeScript schema 2026-07-28 | Spec | https://raw.githubusercontent.com/modelcontextprotocol/specification/main/schema/2026-07-28/schema.ts | Tool annotations và default value. |
| S13 | Security best practices | Docs | https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices | Token passthrough, confused deputy, thực hành bảo mật. |
| S14 | JSON-RPC 2.0 | Chuẩn | https://www.jsonrpc.org/specification | Request, response, notification, mã lỗi. |
| S15 | JSON Schema 2020-12 | Chuẩn | https://json-schema.org/draft/2020-12 | Schema của tool. |
| S16 | OAuth 2.1 draft | Chuẩn | https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/ | PKCE, authorization code. |
| S17 | RFC 9728 | Chuẩn | https://www.rfc-editor.org/rfc/rfc9728 | Protected Resource Metadata. |
| S18 | RFC 8707 | Chuẩn | https://www.rfc-editor.org/rfc/rfc8707 | Resource Indicators. |
| S19 | Microsoft Research, Tool-space interference in the MCP era | Nghiên cứu | https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/ | 1.470 server, 2.443 call, 1.312 tool, output token, trùng tên. |
| S20 | LongFuncEval, arXiv 2505.10570 | Preprint | https://arxiv.org/abs/2505.10570 | Mức giảm hiệu năng theo số tool, độ dài response, số lượt. |
| S21 | Anthropic, Advanced tool use | Blog vendor | https://www.anthropic.com/research/advanced-tool-use | Chi phí tool definition, Tool Search, eval nội bộ. |
| S22 | MCP-Universe | Benchmark | https://mcp-universe.github.io/usage.html | Success rate trên 11 MCP server thật. |
| S23 | OWASP LLM01 Prompt Injection | Tài liệu bảo mật | https://genai.owasp.org/llmrisk/llm01-prompt-injection/ | Prompt injection trực tiếp và gián tiếp. |
| S24 | OWASP LLM06 Excessive Agency | Tài liệu bảo mật | https://github.com/OWASP/www-project-top-10-for-large-language-model-applications/blob/main/2_0_vulns/LLM06_ExcessiveAgency.md | Complete mediation, quyền quá rộng. |

### 13.2. Tài liệu nội bộ đã dùng làm đầu vào

Các tài liệu dưới đây không phải bằng chứng.
Chúng được dùng để xác định câu hỏi, cấu trúc và những gì cần đối chiếu.

| Tài liệu | Trạng thái | Dùng cho |
| --- | --- | --- |
| [`../00-frame/prd-ai-platform.md`](../00-frame/prd-ai-platform.md) | Nguồn yêu cầu | SR1-SR8, vấn đề trung tâm, định nghĩa M1-M6. |
| [`mcp-technical-guide.html`](mcp-technical-guide.html) | Sổ tay | Cấu trúc sổ tay MCP, checklist, gợi ý thiết kế lab. |
| [`mcp-request-flow.html`](mcp-request-flow.html) | Sơ đồ | Luồng request và vị trí control plane. |
| `../research/04-khao-sat-5-mo-hinh.md` (đã xóa) | Đã xóa | Cách định vị năm mô hình theo tầng. |
| [`../../docs/context/appota-ai-ecosystem.md`](../../docs/context/appota-ai-ecosystem.md) | Ngữ cảnh | Câu hỏi mở về Tool/MCP Runtime và AgentLize. |
| `.lavish/research/fc-lane-1-spec.md`, `fc-lane-2-practice.md`, `fc-lane-3-risk.md` | File tạm, không tính vào repo | Ghi chú research về function calling, dùng để đối chiếu chéo. |

### 13.3. Điều chưa xác minh

- Chưa kiểm SDK nào đã hỗ trợ đầy đủ revision 2026-07-28; nhiều SDK vẫn có thể chỉ hỗ trợ legacy 2025-11-25. `[Chưa xác minh]`
- Chưa kiểm Tool/MCP Runtime của Thổ Thần AI có tồn tại và hỗ trợ giao thức này hay không. `[Chưa xác minh]`
- Chưa đo latency, chi phí và tỷ lệ ghi trùng trên lab; mọi ngưỡng số chưa chốt. `[Chưa xác minh]`
- Chưa kiểm quan sát về AppotaPay Agent Skills và việc không có MCP server công khai. `[Chưa xác minh]`
- Chưa kiểm xem policy của AgentLize có API truy vấn lúc chạy hay không. `[Chưa xác minh]`

## 14. Nhật ký revision

| Ngày | Người | Thay đổi | Trạng thái |
| --- | --- | --- | --- |
| 2026-11-12 | Agent (Pi) | Tạo bản 0.1: tổng hợp từ các bản nháp MCP trong repo, đối chiếu lại với đặc tả 2026-07-28, thêm phần SR1-SR8, đo lường, khi nào MCP sai và câu hỏi mở. | Chưa review |
