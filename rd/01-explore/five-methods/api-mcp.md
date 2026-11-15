# API/Function Calling và MCP cho AI Operations Connector Lab

## 1. Cơ chế và ranh giới trách nhiệm khác nhau thế nào?

### Takeaway
Function calling là cơ chế để mô hình đề xuất tên hàm và tham số, còn ứng dụng thực thi; MCP là giao thức chuẩn hóa trao đổi giữa host/client/server, bao gồm khám phá và gọi tool.
Hai lớp có thể cùng xuất hiện trong một hệ thống, không phải hai sản phẩm loại trừ nhau ([OpenAI](https://platform.openai.com/docs/guides/function-calling); [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture); [MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

### Cited Findings
- Với function calling của OpenAI, ứng dụng gửi định nghĩa tool, nhận tool call, chạy code phía ứng dụng, gửi kết quả về mô hình rồi nhận câu trả lời hoặc tool call tiếp theo.
  JSON Schema mô tả tham số của function; hướng dẫn cũng phân biệt function tool với built-in tool và nêu built-in tool có thể truy cập MCP server ([OpenAI, How it works / The tool calling flow](https://platform.openai.com/docs/guides/function-calling)).
- MCP dùng JSON-RPC với kiến trúc host quản lý nhiều client, mỗi client tương ứng một server; server cung cấp tools, resources và prompts, có thể là tiến trình local hoặc dịch vụ remote.
  Bản đặc tả được mở là **2026-07-28**, mô tả giao thức stateless, request tự mang version và capabilities; không dùng mô tả vòng đời của phiên bản cũ để giải thích bản này ([MCP Architecture, Core Components / Capability Negotiation](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).
- `tools/list` khám phá tool, hỗ trợ pagination và caching; `tools/call` gọi tool bằng tên và arguments.
  `inputSchema` mô tả tham số; `outputSchema` là tùy chọn, và nếu có thì server MUST trả structured result phù hợp, client SHOULD kiểm tra ([MCP Tools, Protocol Messages / Data Types](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- MCP không quy định một kiểu UI duy nhất; khuyến nghị human-in-the-loop và confirmation là SHOULD, không phải bảo đảm mọi sản phẩm MCP đều thực hiện ([MCP Tools, User Interaction Model](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

**Trích ngắn để kiểm tra lại, mở trực tiếp ngày 2026-11-13:**
- O1: “Execute code on the application side with input from the tool call” ([OpenAI, The tool calling flow](https://platform.openai.com/docs/guides/function-calling)).
- M1: “MCP is a stateless protocol: every request is self-contained and carries its own protocol version and capabilities.” ([MCP Architecture, mở đầu](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).
- M2: “the protocol itself does not mandate any specific user interaction model.” ([MCP Tools, User Interaction Model](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

### Inferences
- Trong báo cáo, nên ghi “API/Function Calling trực tiếp” là hướng ứng dụng tự nối tool tới backend, và ghi rõ OpenAI chỉ là một hiện thực được khảo sát, không phải định nghĩa chung cho mọi nhà cung cấp.
  Không suy rộng giới hạn `strict`, schema hoặc tool search của OpenAI thành quy tắc chung của API hay MCP (suy luận từ [OpenAI](https://platform.openai.com/docs/guides/function-calling); [MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- Một MCP server vẫn có thể gọi API nghiệp vụ ở phía sau; MCP không thay thế employee directory, task API, transaction hay quy tắc cập nhật nghiệp vụ (suy luận từ [MCP Architecture, Servers](https://modelcontextprotocol.io/specification/2026-07-28/architecture); [MCP Tools, mở đầu](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

### Gaps
- Chưa kiểm tra tính tương thích của SDK, host hoặc sản phẩm cụ thể với bản MCP 2026-07-28.
- Chưa có quyết định stack, kiến trúc hay ADR; các ghi chú này chỉ phục vụ Explore/Compare.

## 2. Ưu nhược điểm, mở rộng, chi phí và bảo trì cần so sánh ra sao?

### Takeaway
Function calling trực tiếp làm rõ vòng điều khiển do ứng dụng sở hữu; MCP cung cấp một hợp đồng liên thông và discovery dùng chung.
Lợi ích tái sử dụng, latency và chi phí thực tế phải được thử trên các client, backend và workload cụ thể, không suy ra một công thức giảm tích hợp phổ quát từ giao thức ([OpenAI](https://platform.openai.com/docs/guides/function-calling); [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).

### Cited Findings
- **Chi phí context:** OpenAI nêu định nghĩa function được tính vào context và billed input tokens.
  Hướng dẫn khuyến nghị giữ ít function khả dụng ban đầu, đánh giá với số lượng khác nhau, hoặc dùng tool search để trì hoãn nạp tool khi phù hợp với model; đây là đặc tính của nền tảng được mở, không phải số đo cho lab ([OpenAI, Token Usage / Best practices](https://platform.openai.com/docs/guides/function-calling)).
- **Quy mô danh mục tool:** MCP hỗ trợ phân trang và caching khi liệt kê; thứ tự deterministic được SHOULD để cải thiện caching danh sách và prompt cache hit rate.
  Danh sách có thể phụ thuộc authorization trên request, vì vậy không được mặc định mọi người dùng có cùng danh mục ([MCP Tools, Capabilities / Listing Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- **Mở rộng trách nhiệm:** host giữ orchestration, security boundaries và context aggregation; server tập trung capability chuyên biệt.
  Đặc tả thiết kế hướng tới composability và phát triển độc lập của client/server, không cung cấp benchmark throughput hoặc bảo đảm năng lực của backend ([MCP Architecture, Host / Design Principles](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).
- **Bảo trì lỗi:** MCP phân biệt JSON-RPC protocol errors với tool execution errors qua `isError: true`, gồm lỗi API, validation và nghiệp vụ; client SHOULD chuyển lỗi thực thi tới model để tự điều chỉnh.
  OpenAI để ứng dụng định nghĩa nội dung kết quả, bao gồm JSON, error codes hoặc plain text ([MCP Tools, Error Handling](https://modelcontextprotocol.io/specification/2026-07-28/server/tools); [OpenAI, Formatting results](https://platform.openai.com/docs/guides/function-calling)).
- **State:** MCP 2026-07-28 không có protocol-level session; hướng dẫn non-normative đề nghị explicit handle cho state giữa các lần gọi.
  Handle của server có xác thực không tự là capability và nên được kiểm tra authorization ở mỗi lần gọi ([MCP Tools, Stateful Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

**Trích ngắn để kiểm tra lại:**
- O2: “callable function definitions count against the model's context limit and are billed as input tokens.” ([OpenAI, Token Usage](https://platform.openai.com/docs/guides/function-calling)).
- M3: “Shared protocol enables interoperability” ([MCP Architecture, Design Principles](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).
- M4: “This operation supports pagination and caching.” ([MCP Tools, Listing Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

### Inferences
- **API trực tiếp, ưu/nhược:** vòng gọi và cách map nghiệp vụ nằm trong ứng dụng nên dễ giữ kiểm soát trong một host cố định; ngược lại, khi thêm host/model API có hợp đồng khác, phần schema mapping, dispatch, lỗi và consent có thể cần thêm adapter hoặc thư viện chia sẻ.
  Đây là tradeoff thiết kế, không phải bằng chứng mọi triển khai API đều trùng lặp (suy luận từ [OpenAI, The tool calling flow / Formatting results](https://platform.openai.com/docs/guides/function-calling)).
- **MCP, ưu/nhược:** hợp đồng discovery/call dùng chung có thể giúp nhiều host tương thích tái sử dụng server; đổi lại cần quản lý version/capability, transport, credentials, trust và kiểm thử liên thông.
  Không khẳng định giảm từ `n*m` xuống `n+m`: mức giảm phụ thuộc mức dùng lại server, số host thực sự tương thích và các adapter/backend còn phải duy trì (suy luận từ [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture); [MCP Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
- **Các chiều scaling phải tách:** số host/agent dùng lại, số tool và kích thước schema, số request đồng thời, số người dùng/tenant, quota backend và state nghiệp vụ.
  Stateless ở tầng protocol không làm state/backend tự scale; discovery/caching cũng không bảo đảm model chọn tool tốt khi danh mục lớn (suy luận từ [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture); [MCP Tools, Stateful Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools); [OpenAI, Best practices](https://platform.openai.com/docs/guides/function-calling)).
- **Khung chi phí để đo:** model input/output, số vòng suy luận, tool/backend calls, compute/network cho adapter hoặc MCP server, auth, logging và vận hành.
  Chỉ tính phần phát sinh thực tế; không mặc định MCP luôn thêm một remote hop, luôn rẻ hơn, luôn đắt hơn hoặc được miễn phí vì là protocol (suy luận từ vòng gọi [OpenAI](https://platform.openai.com/docs/guides/function-calling) và server local/remote trong [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).

### Gaps
- Không có số đo latency, throughput, độ ổn định, giá hoặc tổng chi phí của lab trong các nguồn đã mở.
- Chưa xác định model, transport, triển khai auth và backend nên không đưa bảng giá, phần trăm tiết kiệm hoặc thứ hạng hiệu năng.

## 3. Bảo mật và độ phù hợp với lab cần kiểm chứng điều gì?

### Takeaway
Schema, metadata, transport authorization và xác nhận người dùng là các lớp khác nhau; không lớp nào tự thay thế kiểm tra quyền nghiệp vụ ở backend.
MCP có yêu cầu bảo mật rõ trong đặc tả nhưng authorization là tùy chọn ở mức giao thức, nên phải đánh giá triển khai thực thay vì gán sẵn nhãn “an toàn hơn” ([MCP Tools, Security Considerations](https://modelcontextprotocol.io/specification/2026-07-28/server/tools); [MCP Authorization, Purpose and Scope / Protocol Requirements](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).

### Cited Findings
- MCP authorization được định nghĩa ở transport level cho HTTP; authorization OPTIONAL, HTTP implementations SHOULD tuân theo đặc tả này khi hỗ trợ, còn STDIO SHOULD NOT dùng luồng đó và thay vào đó lấy credentials từ environment ([MCP Authorization, Introduction](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
- Khi áp dụng luồng authorization, token phải được gắn với intended audience, gửi trong header thay vì query string; server phải validate token, token hết hạn/không hợp lệ nhận HTTP 401, thiếu scope/quyền có cơ chế HTTP 403 và step-up authorization ([MCP Authorization, Resource Parameter Implementation / Access Token Usage / Error Handling](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
- MCP tool server MUST validate inputs, implement proper access controls, rate limit và sanitize outputs; client SHOULD xác nhận thao tác nhạy cảm, hiển thị input trước khi gọi, kiểm tra result, có timeout và audit logging ([MCP Tools, Security Considerations](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- Client MUST coi tool annotations là không đáng tin trừ khi chúng đến từ trusted server.
  OpenAI `strict: true` ràng buộc sự phù hợp function schema, với giới hạn schema được tài liệu nêu, không mô tả đó là cơ chế cấp quyền ([MCP Tools, Data Types / Tool](https://modelcontextprotocol.io/specification/2026-07-28/server/tools); [OpenAI, Strict mode](https://platform.openai.com/docs/guides/function-calling)).

**Trích ngắn để kiểm tra lại:**
- A1: “Authorization is **OPTIONAL** for MCP implementations.” ([MCP Authorization, Protocol Requirements](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
- A2: “This specification defines the authorization flow for HTTP-based transports.” ([MCP Authorization, Purpose and Scope](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
- M5: “clients **MUST** consider tool annotations to be untrusted unless they come from trusted servers.” ([MCP Tools, Data Types / Tool](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- O3: “Setting `strict` to `true` will ensure function calls reliably adhere to the function schema, instead of being best effort.” ([OpenAI, Strict mode](https://platform.openai.com/docs/guides/function-calling)).

### Inferences
- HTTP OAuth scope không tự định nghĩa policy “ai được sửa task nào/nhân viên nào”.
  Server có thể gắn scope vào logic nghiệp vụ, nhưng lab vẫn cần kiểm tra actor, đối tượng và hành động trên mỗi lần ghi; tham số đúng schema hay annotation khai báo read-only không phải giấy phép thực thi (suy luận từ phạm vi transport của [MCP Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) và access controls của [MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- **Phù hợp có điều kiện:** API trực tiếp là ứng viên cho baseline trong một host với tập tool ổn định; MCP là ứng viên khi câu hỏi nghiên cứu là khả năng dùng lại tool qua một agent/host khác.
  Nếu không có nhu cầu liên thông/discovery hoặc runtime đích không tương thích, giá trị bổ sung của MCP có thể không bù phần protocol/auth/vận hành; đây là giả thuyết cần thử, không phải chọn stack (suy luận từ [OpenAI](https://platform.openai.com/docs/guides/function-calling); [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).
- **Đề xuất kiểm chứng, chưa có kết quả:** chạy cùng fixture giả lập và cùng policy ở hai đường tích hợp; thử đọc, từ chối ghi không quyền, đề xuất sửa, người dùng từ chối/đồng ý, thay đổi quyền trước khi commit, timeout sau ghi, gọi lại và agent thứ hai dùng cùng tool.
  Tách test scope/token khỏi policy theo đối tượng, tách schema validation khỏi authorization, và đo cả duplicate-write khi retry; các test này là suy luận phục vụ lab từ những ranh giới nguồn mô tả, không phải test suite đã tồn tại ([MCP Tools, Error Handling / Security Considerations / Stateful Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools); [MCP Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization); [OpenAI, The tool calling flow](https://platform.openai.com/docs/guides/function-calling)).

### Gaps
- Chưa chứng minh triển khai nào thực sự enforce confirmation, policy theo bản ghi, chống ghi trùng hoặc audit đầy đủ.
- Chỉ dùng bốn nguồn gốc đã mở lại trực tiếp trong phiên này; không dùng repo draft làm evidence, không khảo sát sâu SDK/product, không kết luận kiến trúc thắng và không lập ADR.
- Owner: researcher API/MCP, bàn giao cho phiên điều phối; trạng thái: ghi chú nghiên cứu chưa được mentor review.
- Definition of done của ghi chú: có cơ chế, tradeoff, scaling, cost drivers, security, maintenance, suitability, giới hạn bằng chứng và trích ngắn gắn URL để kiểm tra lặp lại.
