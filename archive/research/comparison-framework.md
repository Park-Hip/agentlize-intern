# Khung so sánh năm cách nối: phụ lục bằng chứng

Ngày: 2026-11-18. Trạng thái: phụ lục bằng chứng của [so sánh phương án](option-comparison.md); cách làm đã chốt ở ADR-0001 tới ADR-0003, chưa có số đo của Lab.

**Nhận định tổng hợp: năm phương pháp giải quyết những vai trò khác nhau, không phải năm kiến trúc hoàn chỉnh thay thế ngang hàng.**
API/Function Calling kết nối quyết định gọi tool của model với code ứng dụng; MCP chuẩn hóa giao tiếp công cụ; workflow giữ tiến độ; orchestration phân vai và điều khiển; event-driven phân phối sự kiện.
Các nguồn cho thấy những cơ chế hỗ trợ an toàn và tái sử dụng, nhưng chưa chứng minh một tổ hợp nào đạt yêu cầu Lab.
Quyền nghiệp vụ, giới hạn dữ liệu, ràng buộc phê duyệt và chống hiệu ứng ghi thứ hai vẫn cần thực thi, kiểm thử tại ứng dụng và hệ thống đích.
Báo cáo xác định điều kiện lựa chọn và câu hỏi kiểm chứng, không tuyên bố phương pháp thắng.

## Điều kiện hoàn thành

| Điều kiện | Trạng thái phiên bản 1.0 |
| --- | --- |
| Phân tích đủ năm phương pháp, cơ chế và bảy trục | Đã điền mục 3. |
| Hai bảng tổng hợp truy về phân tích | Đã điền mục 4; không phải benchmark. |
| Đối chiếu nhu cầu đã xác nhận | Dùng SR1-SR8 và M1-M6 của [PRD](../../rd/problem/prd-ai-platform.md). |
| Có nguồn gốc và trích ngắn | Có danh mục S01-S26, bảng 16 trích ngắn; chưa chạy kiểm nguồn tự động. |
| Có tiêu chí và câu hỏi mở | Đã điền mục 6-7; không đặt trọng số hoặc ngưỡng mới. |
| Thử nghiệm và nghiệm thu | Chưa có; cần lab. |

## 1. Mục đích và phạm vi so sánh

### 1.1. Mục đích

Báo cáo giúp Hiệp và Kevin trả lời mỗi phương pháp cung cấp gì, phải bổ sung gì và trong điều kiện nào đáng khảo sát.
Báo cáo chỉ so sánh; câu hỏi kiểm chứng và quyết định nằm ở bản kế hoạch kiểm chứng và các ADR.
Chương trình yêu cầu so sánh ưu/nhược, mở rộng, chi phí, bảo mật, bảo trì và độ phù hợp trước khi chọn phương án ([S01](../../docs/program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt), trang 5, dòng 151-197).

### 1.2. Đơn vị so sánh

| Phương pháp | Vai trò | Không thay thế | Đại diện |
| --- | --- | --- | --- |
| API/Function Calling | Model đề xuất tên tool/arguments, app dispatch | Policy, durable state, transaction | OpenAI, S03. |
| MCP | Contract host/client/server, discovery/call | Backend nghiệp vụ, quyền theo bản ghi | Đặc tả 2026-07-28, S04-S06. |
| Workflow Engine | Trình tự, chờ và phục hồi quy trình | Idempotent effect ở hệ thống đích | Step Functions, S07-S11. |
| Agent Orchestration | Routing, manager/specialist, handoff | Isolation quyền hoặc an toàn của tool | Agents SDK Python, S12-S18. |
| Event-driven Integration | Producer/consumer và fan-out | Approval hoặc xác nhận commit | EventBridge, S19-S25. |

Các sản phẩm chỉ là đại diện minh họa, không bảo đảm chung của cả nhóm.
MCP chỉ dùng bản 2026-07-28; các trang SDK/AWS là tài liệu sống chưa ghim release/snapshot.
Không có code, ADR, lựa chọn stack, dữ liệu thật hoặc credentials thật trong phạm vi này.

## 2. Tiêu chí và quy tắc đánh giá

### 2.1. Bảy trục nhất quán

| Trục | Câu hỏi |
| --- | --- |
| Ưu điểm | Cơ chế đem lại gì, cho ai, trong điều kiện nào? |
| Nhược điểm | Đánh đổi gì, đường lỗi nào dễ xuất hiện? |
| Mở rộng | Tăng agent, tool, tenant, concurrency hoặc fan-out ảnh hưởng đâu? |
| Chi phí | Đếm đơn vị nào, driver nào làm tăng tổng? |
| Bảo mật | Ai xác thực, kiểm quyền, chặn ghi và quản lý bí mật? |
| Bảo trì | Đổi schema, API, policy hoặc version ảnh hưởng thành phần nào? |
| Phù hợp | Đóng góp SR nào, còn thiếu gì, khi nào sai vai trò? |

### 2.2. Quy tắc bằng chứng

**Đặc tả, khả năng sản phẩm và kết quả Lab là ba loại bằng chứng riêng.**
Nhận xét tradeoff và điều kiện lựa chọn là suy luận của người viết từ nguồn được dẫn, không phải số đo.
`Chưa đo` nghĩa là chưa thực nghiệm; `chưa xác minh` không có nghĩa không hỗ trợ.
MUST/SHOULD/OPTIONAL của MCP giữ nguyên mức bắt buộc, không biến khuyến nghị thành bảo đảm.
Trích ngắn được lấy từ ghi chú đã mở nguồn, không phải lượt kiểm tự động mới.
Không gán điểm bảo mật, thứ hạng latency hoặc phần trăm tiết kiệm khi chưa có baseline chung.
Chi phí ghi theo đơn vị và driver; không lấy đơn giá thay tổng chi phí một thay đổi thành công.
Không đưa giá tiền ví dụ vì chưa chốt cấu hình Lab và chưa cần thiết cho quyết định vai trò.
Ưu tiên chất lượng, đơn giản, vững chắc, mở rộng và bảo trì dài hạn hơn giảm công sức phát triển ban đầu.

### 2.3. Đại lượng cần đo

| Mã trong PRD | Cách đo nguồn yêu cầu | Trạng thái |
| --- | --- | --- |
| M1 - latency | p50/p95 qua 100 lần; tách model, policy, gateway thực có | Chưa đo; báo riêng chờ người duyệt. |
| M2 - ổn định | 100 lần gồm lỗi mạng/timeout; success/error/retry/duplicate | Chưa đo; gate nguồn: 0 duplicate, 0 lost. |
| M3 - chi phí | Tokens, giá model, thời gian hạ tầng / thay đổi thành công | Chưa đo, chưa có cấu hình/ngày giá. |
| M4 - mở rộng | Agent/tool tăng 10 lần; throughput, p95, lỗi | Chưa đo, không phải ngưỡng đạt. |
| M5 - vận hành | Service, cấu hình, deploy steps, điểm sửa policy | Chưa kiểm kê triển khai. |
| M6 - tái dùng | Người-giờ, dòng code, connector phải sửa khi thêm agent | Chưa đo; gate nguồn: 0 connector sửa. |

100 lần, tăng 10 lần và hai gate trên là từ [S02, mục 7.3](../../rd/problem/prd-ai-platform.md#73-sáu-chỉ-số-đo), không phải ngưỡng mới.
Latency, success rate và cost mục tiêu vẫn chờ baseline.

## 3. Phân tích từng phương pháp

### 3.1. API/Function Calling

**a. Cơ chế và vai trò.**
OpenAI mô tả ứng dụng gửi định nghĩa function, nhận tool call từ model, chạy code rồi gửi kết quả lại ([S03](https://platform.openai.com/docs/guides/function-calling), tool calling flow).
API được gọi bằng code cố định không tự là function calling; điểm khác là model đề xuất công cụ/arguments, còn app thực thi.

**b. Ưu điểm - suy luận.**
Một host với tool ổn định có thể giữ dispatch, schema mapping và lỗi trong vòng điều khiển rõ ràng của ứng dụng.
App có thể dùng library tool chung, không mặc định mỗi tích hợp API đều phải sao chép logic (S03).

**c. Nhược điểm - suy luận.**
Host/model API khác hợp đồng có thể cần adapter mới cho schema, dispatch và error mapping.
Vòng gọi model không tự cung cấp trạng thái chờ duyệt, recovery hoặc idempotency cho nghiệp vụ (S03).

**d. Mở rộng.**
Trong OpenAI, định nghĩa function chiếm context và billed input tokens; danh mục lớn làm tăng context và bài toán chọn tool.
Tài liệu khuyên đánh giá số function và dùng tool search khi phù hợp model; không chứng minh Lab đã scale ([S03](https://platform.openai.com/docs/guides/function-calling), Token Usage/Best practices).

**e. Chi phí.**
Đếm input/output tokens, vòng model, tool/backend calls, adapter compute-time, network và log thực có.
Tính cả lỗi/retry vào chi phí trên thay đổi thành công; **Lab chưa đo** (S03).

**f. Bảo mật.**
`strict: true` ràng buộc function schema theo giới hạn OpenAI, không xác thực actor hay cấp quyền sửa task.
App phải kiểm actor/action/resource, lọc row/field và buộc approval tại nơi thực thi ([S03](https://platform.openai.com/docs/guides/function-calling), Strict mode; [S02, SR1-SR5](../../rd/problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc)).

**g. Bảo trì - suy luận.**
API nghiệp vụ đổi thì adapter/test contract đổi; provider đổi có thể ảnh hưởng schema/dispatch, không nhất thiết policy nếu tách tốt.
App cần quy ước lỗi ổn định vì tài liệu cho app quyết định nội dung kết quả ([S03](https://platform.openai.com/docs/guides/function-calling), Formatting results).

**h. Phù hợp - suy luận.**
Đáng khảo sát cho một host, ít tool ổn định và đường trực tiếp so với MCP.
Không dùng riêng function calling để thay durable workflow hoặc policy; có điểm dispatch hỗ trợ SR1/SR2/SR8 không có nghĩa đã đạt.

**i. Bằng chứng và khoảng trống.**
S03 là hiện thực OpenAI, không định nghĩa strict/tool search cho mọi provider.
Chưa có adapter, fixture hoặc số đo để nói nhanh/rẻ hơn MCP; phép so cần cùng policy, backend và nhiệm vụ.

### 3.2. MCP

**a. Cơ chế và vai trò.**
MCP dùng JSON-RPC theo host/client/server; server cung cấp tools/resources/prompts, host giữ điều phối và ranh giới bảo mật ([S04](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).
Bản 2026-07-28 stateless, request tự mang version/capabilities; `tools/list` khám phá, `tools/call` gọi công cụ, không mô tả protocol-level session của bản cũ ([S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

**b. Ưu điểm - suy luận.**
Contract discovery/call chung tạo cơ sở cho host tương thích tái sử dụng server vẫn gọi API nghiệp vụ phía sau.
Pagination/cache và phân biệt protocol errors với tool execution errors giúp xác định rõ hợp đồng liên thông cần test (S04-S05).

**c. Nhược điểm - suy luận.**
Cần quản lý version/capability, transport, trust và credentials; không suy ra công thức giảm tích hợp phổ quát `n*m` thành `n+m`.
Protocol không bắt buộc một UI confirmation; extension tùy chọn không được xem là capability mặc định của mọi triển khai ([S04](https://modelcontextprotocol.io/specification/2026-07-28/architecture); [S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), User Interaction Model).

**d. Mở rộng.**
`tools/list` có pagination/cache; catalog có thể phụ thuộc authorization, thứ tự deterministic là SHOULD để hỗ trợ cache.
Stateless protocol không làm backend/state nghiệp vụ tự scale; cần đo riêng host reuse, catalog, concurrency, tenant và quota đích ([S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), Listing/Stateful Tools).

**e. Chi phí.**
Đếm tokens/vòng model, discovery/call thực tế, server compute-time, bytes, auth và log thực có.
Server local hoặc remote nên không mặc định thêm remote hop, luôn rẻ hơn hoặc đắt hơn; **Lab chưa đo** (S04).

**f. Bảo mật.**
Authorization OPTIONAL ở mức giao thức; luồng đặc tả có phạm vi HTTP, còn STDIO SHOULD NOT dùng luồng đó và lấy credentials từ environment theo nguồn ([S06](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
Khi dùng HTTP auth cần validate token/audience/quyền tương ứng, nhưng vẫn phải có policy ai được sửa task nào.
Server MUST validate input, access control, rate limit, sanitize output; client SHOULD xác nhận thao tác nhạy cảm và MUST không tin annotations trừ trusted server ([S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), Security/Data Types).

**g. Bảo trì - suy luận.**
Test version/schema hai phía và lỗi `isError`; `outputSchema` tùy chọn, nếu có structured result phải phù hợp theo đặc tả.
State liên lần gọi cần handle tường minh; handle không tự cấp quyền nên vẫn kiểm authorization trên từng lần gọi (S05).

**h. Phù hợp - suy luận.**
Đáng khảo sát khi agent/host thứ hai cần cùng contract và discovery, liên quan SR8.
Không nên dùng chỉ vì nhãn chuẩn khi không cần liên thông, runtime chưa tương thích hoặc nhu cầu thật là transaction/durable approval.

**i. Bằng chứng và khoảng trống.**
S04-S06 là đặc tả, chưa chứng minh SDK/host cụ thể tương thích 2026-07-28.
Chưa thử confirmation cưỡng chế, quyền theo catalog, revocation, ghi trùng hoặc reuse với quyền theo người.

### 3.3. Workflow Engine

**a. Cơ chế và vai trò.**
Workflow giữ trạng thái/trình tự; Step Functions Standard minh họa durable progress và callback `.waitForTaskToken` cho tích hợp hỗ trợ, Express chỉ Request Response ([S07](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html); [S08](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)).
Không gán các khả năng này cho mọi engine.

**b. Ưu điểm - suy luận.**
Flow đọc-check-propose-confirm-write cố định có thể biểu diễn rõ chỗ chờ và tiến độ phục hồi.
Standard có execution history hữu ích cho điều tra/SR7, chưa thay audit nghiệp vụ xuyên hệ thống (S07).

**c. Nhược điểm.**
Standard/Express khác thời lượng, callback, log, execution semantics; type không đổi sau tạo theo nguồn.
Dừng `.sync` chỉ best-effort cancel downstream, tác vụ đích vẫn có thể chạy và phát sinh phí (S07-S08).

**d. Mở rộng.**
Có quota API/state transitions theo account/Region; Express không chịu cùng quota transitions Standard không làm downstream vô hạn.
Cần đo execution concurrency, tác vụ chờ, policy store và đích ([S10](https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html)).

**e. Chi phí.**
Standard tính transitions gồm retry; Express tính requests và duration theo memory, làm tròn 100 ms và memory theo khối 64 MB ở nguồn pricing.
Đếm thêm downstream, data transfer và logs/storage thực có; **Lab chưa đo** ([S09](https://aws.amazon.com/step-functions/pricing/)).

**f. Bảo mật.**
Resource tĩnh giúp IAM hẹp; resource động có thể làm policy tự sinh dùng `Resource: "*"`, `.sync` cần quyền theo dõi/hủy.
Callback token không thay quyền nghiệp vụ hoặc approval hash/TTL; app xác thực reviewer và kiểm quyền trước effect ([S11](https://docs.aws.amazon.com/step-functions/latest/dg/service-integration-iam-templates.html); S08).

**g. Bảo trì - suy luận.**
Cần quản definition, IAM, retry/catch, callback và logs; Express phải cấu hình log cho lịch sử thực thi.
Test cả polling khi thiếu event vì thiếu quyền theo dõi có thể làm `.sync` kẹt dù đường thường thành công (S07/S11).

**h. Phù hợp - suy luận.**
Đáng khảo sát khi cần durable approval wait/recovery, đóng góp một phần SR4/SR7.
Exactly-once workflow execution của Standard không chứng minh effect một lần: retry state/hai executions vẫn cần idempotency tại đích ([S07](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html); [S26](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)).

**i. Bằng chứng và khoảng trống.**
S07-S11 chỉ là Step Functions, không đủ chốt AWS hoặc kết luận mọi engine giống nhau.
Chưa thử approval hết hạn, callback lặp, dừng downstream, crash/timeout sau commit hoặc recovery.

### 3.4. Agent Orchestration

**a. Cơ chế và vai trò.**
Orchestration chọn agent và bước tiếp theo bằng code/model/kết hợp; SDK minh họa manager gọi specialist `as_tool()` hoặc handoff chuyển active agent ([S12](https://openai.github.io/openai-agents-python/multi_agent/)).
Handoff không đồng nghĩa luôn trả quyền về manager; tool guardrails không áp cho chính handoff ([S15](https://openai.github.io/openai-agents-python/handoffs/); [S18](https://openai.github.io/openai-agents-python/guardrails/)).

**b. Ưu điểm - suy luận.**
Specialist chia trách nhiệm; code giữ flow dễ kiểm soát, model routing hữu ích khi nhiệm vụ mở.
SDK có approval pause/resume, tracing và usage làm primitive hỗ trợ, chưa phải kiểm soát Lab đầy đủ ([S13](https://openai.github.io/openai-agents-python/human_in_the_loop/); [S14](https://openai.github.io/openai-agents-python/tracing/)).

**c. Nhược điểm - suy luận.**
Thêm agent tăng routes, history truyền tiếp và regression cases; flow cố định không tự hưởng lợi từ multi-agent.
Handoff mặc định mang lịch sử, nested context/approval có thể chia sẻ nên phân vai không là isolation boundary (S15/S17).

**d. Mở rộng.**
Song song giúp tác vụ độc lập nhưng không xóa critical path manager-specialist-approval-write hoặc giới hạn state store.
Ví dụ approval server chỉ có store một event loop/process, không chứng minh horizontal scale (S12/S13).

**e. Chi phí.**
Đếm model requests/tokens từng agent, handoffs/evaluator rounds, runtime, snapshot và trace storage.
SDK có usage nhưng provider có thể trả thiếu; delegation thêm calls/history không có nghĩa luôn đắt hơn vì model/context cũng đổi; **Lab chưa đo** ([S16](https://openai.github.io/openai-agents-python/usage/)).

**f. Bảo mật.**
Tool filters/`is_enabled` không authorize arguments/resource; snapshot cần integrity/ownership trước deserialize và approval không bảo đảm exactly-once (S13/S17).
Tracing mặc định bật, `trace_include_sensitive_data=True`; phải kiểm exporter và redaction failure chứ không chỉ thêm observer ([S14](https://openai.github.io/openai-agents-python/tracing/)).

**g. Bảo trì - suy luận.**
Prompt nhỏ hơn nhưng routes/contracts/evals tăng; paused work cần version marker phù hợp agent/SDK definitions.
Trace không tự là audit chống sửa; usage khi resume phải tránh tính lặp checkpoint totals (S13/S14/S16).

**h. Phù hợp - suy luận.**
Đáng khảo sát khi phân vai/routing thực sự cần thiết, có thể nằm phía trên API hoặc MCP tools.
SR8 không cần nhiều agent: một agent gọi từ hai nơi, quyền lấy theo người yêu cầu; chia vai specialist và manager không tự tách quyền ([S17](https://openai.github.io/openai-agents-python/context/); S02).

**i. Bằng chứng và khoảng trống.**
S12-S18 là một SDK chưa ghim release, không phổ quát hóa approval/guardrail/tracing semantics.
Chưa thử handoff lọt dữ liệu, snapshot giả, resume cạnh tranh, thu hồi quyền hoặc lợi ích task quality so một agent.

### 3.5. Event-driven Integration

**a. Cơ chế và vai trò.**
Producer phát sự kiện, consumer phản hồi độc lập; EventBridge bus là nhiều nguồn/nhiều đích, Pipes một nguồn/một đích ([S19](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html)).
Classic dùng rules/targets khác Custom mới dùng subscribers/retention; pricing ghi enhanced Custom ra mắt tháng 09/2026 ([S20](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html); [S24](https://aws.amazon.com/eventbridge/pricing/)).

**b. Ưu điểm - suy luận.**
Fan-out cho audit/notification/consumer độc lập, producer không trực tiếp điều phối từng consumer.
Custom mới có retention/subscriber đọc lại; event-driven có thể kết hợp workflow, không thay approval gate (S19/S20).

**c. Nhược điểm.**
Classic retriable rule-target mặc định tối đa 24 giờ/185 lần; hết retry có thể bỏ event nếu không cấu hình DLQ, không áp mặc định này cho Custom mới ([S21](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html)).
Custom mới có FIFO/UNORDERED; delivery lỗi có thể giữ các group trên subscriber, Lambda `EVENT` chỉ giữ thứ tự tới queue async chứ chưa ordered processing ([S22](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html)).

**d. Mở rộng.**
Fan-out tăng deliveries và áp lực consumer; FIFO đánh đổi parallelism lấy thứ tự trong group.
Quy mô subscriptions quảng bá không phải throughput Lab; cần backlog, tuổi event, retry và commit rate từng consumer (S22/S24).

**e. Chi phí.**
Classic tính event theo khối 64 KB; Custom mới ingress/egress làm tròn 1 KB, thêm storage/evaluation khi có và fan-out/retry egress.
Đếm billed blocks/bytes, deliveries, retention-time, consumer compute/log; không trộn hai loại bus vào một đơn giá calls, **Lab chưa đo** ([S24](https://aws.amazon.com/eventbridge/pricing/)).

**f. Bảo mật.**
Classic role hoặc resource policy tùy target; Lambda/SNS/SQS không bị giới hạn chỉ một cách theo ghi chú nguồn.
Custom mới dùng identity policy, cross-account RAM/resource policy; quyền publish/deliver vẫn khác quyền người dùng sửa task ([S23](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html); [S25](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-access.html)).

**g. Bảo trì - suy luận.**
Quản schema, correlation, retry/DLQ/redrive và consumer versions; tách producer không xóa vận hành delivery.
Dedup publish Custom mới có cửa sổ năm phút/phạm vi nguồn, là exactly-once ingestion chứ không idempotent business mutation hoặc replay an toàn vô hạn (S22/S26).

**h. Phù hợp - suy luận.**
Đáng khảo sát cho `TaskUpdated` sau commit để nhiều consumer phản hồi độc lập.
Bus nhận/giao event không chứng minh task đã commit; cần kết quả đích nếu muốn xác nhận nghiệp vụ ([S08](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html); S26).

**i. Bằng chứng và khoảng trống.**
S19-S25 chỉ minh họa EventBridge; chưa khảo sát sâu retry Custom mới, không gán mặc định Classic cho subscribers.
Chưa thử replay muộn, DLQ/redrive, quyền thu hồi hoặc mất publish sau commit; chưa chứng minh không mất event tại ranh giới đó.

## 4. Bảng so sánh tổng hợp

Các bảng tóm tắt mục 3, không bổ sung xếp hạng hoặc kết quả thực nghiệm.

### 4.1. Lợi ích, giới hạn và mức phù hợp

| Phương pháp | Ưu điểm | Nhược điểm | Phù hợp khi | Không phù hợp khi |
| --- | --- | --- | --- | --- |
| API/FC | App giữ dispatch rõ | Mapping/state/error tự quản | Một host, tool ổn định | Dùng riêng nó thay durable approval/policy; 3.1, S03. |
| MCP | Contract discovery/call chung | Version/trust/transport cần test | Nhiều host tương thích reuse | Không cần liên thông hoặc runtime chưa tương thích; 3.2, S04-S06. |
| Workflow | Tiến độ/chờ rõ | Execution type/retry/downstream | Luồng cố định, durable recovery | Tưởng execution là transaction; 3.3, S07-S11. |
| Orchestration | Specialist/routing | Calls/history/routes tăng | Nhiều vai có lợi ích thực | Flow cố định chưa cần multi-agent; 3.4, S12-S18. |
| Event-driven | Fan-out/consumer độc lập | Delivery/replay/order vận hành thêm | Phản hồi thay đổi sau commit | Thay approval/commit receipt; 3.5, S19-S26. |

### 4.2. Đánh đổi kỹ thuật

| Phương pháp | Mở rộng | Chi phí driver | Bảo mật | Bảo trì |
| --- | --- | --- | --- | --- |
| API/FC | Catalog/context, backend quota | Tokens/rounds/calls/compute | Schema không cấp quyền | Mapping/test contract; 3.1. |
| MCP | Host reuse khác backend scale | Model/discovery/server/auth/log | Auth optional, HTTP scoped | Version/schema/trust/errors; 3.2. |
| Workflow | Execution/state quotas, đích | Transitions hoặc requests/duration/memory | IAM khác quyền người dùng | Definition/IAM/retry/callback; 3.3. |
| Orchestration | Parallel phần độc lập, critical path | Calls/tokens/history/snapshots | Shared context không isolation | Routes/prompts/evals/state version; 3.4. |
| Event-driven | Fan-out/backlog/FIFO | Blocks hoặc bytes/storage/egress | Publish khác quyền sửa task | Schema/DLQ/replay/consumer; 3.5. |

Mọi tổng chi phí, throughput, latency và độ ổn định Lab vẫn chưa đo.

## 5. Đối chiếu với nhu cầu của hệ thống

Từng yêu cầu dưới đây lấy từ [S02, mục 6](../../rd/problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc).
SR áp cho tổ hợp, không đòi từng cơ chế đứng riêng đáp ứng tất cả; **chưa SR nào được đánh dấu đạt**.

| Yêu cầu | Đóng góp cơ chế | App/hệ thống đích còn phải làm | Nguồn và phép kiểm chưa thực hiện |
| --- | --- | --- | --- |
| SR1 - danh tính/cửa ghi | API/MCP dispatch, SDK context, execution/message IDs | Một cửa ghi cưỡng chế, principal đáng tin, nối người-agent-call-effect | S03-S06/S14/S17; giả actor/gọi đường tắt phải bị chặn. |
| SR2 - luật chạy được | MCP access control, tool/service enforcement, IAM hạ tầng | Policy actor/action/resource không phụ thuộc prompt/ẩn tool/consent | S05/S11/S17/S23; bỏ prompt, gọi trực tiếp/handoff vẫn bị từ chối. |
| SR3 - phạm vi quyền | Catalog theo quyền, context/history controls | Lọc row/field trước model/UI/log, giới hạn action/record | S05/S15/S17; team A không thấy team B/trường cấm qua cả summary/trace. |
| SR4 - điểm dừng rủi ro | Workflow callback, SDK approval, MCP confirmation SHOULD | Server approval gắn hash tham số, expiry, actor/reviewer/action và version phù hợp | S05/S08/S13; đổi arguments, quá hạn/sai run không được ghi. |
| SR5 - fail-closed | Đường lỗi, SDK manual approval khi arguments không đọc an toàn | Không effect khi identity/policy/approval thiếu hoặc không xác định | S05/S13/S18; policy timeout/snapshot giả không ghi, không fallback quyền rộng. |
| SR6 - không effect thứ hai | Retry/resume/dedup ở các lớp khác nhau | Phân biệt chưa gọi/unknown, key ý định ổn định, atomic dedup/mutation, kết quả cũ hoặc reconcile | S07/S13/S22/S26; mất response sau commit, concurrent retry, key cũ payload mới, replay muộn. |
| SR7 - trace xuyên suốt | SDK trace/usage, workflow history, call/error/correlation | Nối actor-decision-approval-effect-cost, giữ coverage và bảo vệ dữ liệu | S03/S05/S07/S14/S16; truy ai/vì sao/kết quả/chi phí sau resume, không lộ trường cấm. |
| SR8 - dùng lại, quyền theo người | MCP contract, API library, nhiều nơi gọi cùng tool | Nơi gọi không mang quyền riêng, không copy connector, không mang approval sang phiên khác | S03/S04/S13/S17; cùng người cho cùng kết quả ở hai nơi gọi. |

Snapshot integrity, consumption single-use và idempotent external effect là ba trách nhiệm riêng; đúng một lớp chưa chứng minh hai lớp kia ([S13](https://openai.github.io/openai-agents-python/human_in_the_loop/)).
Key và mutation cần nguyên tử tại đích nếu muốn chống effect thứ hai; lookup không thấy kết quả chưa đủ chứng minh retry an toàn ([S26](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/); S13).

## 6. Tiêu chí lựa chọn

### 6.1. Điều kiện bắt buộc

Gate áp cho phương án triển khai sau này, không loại một cơ chế vì nó không phải toàn bộ hệ thống.

| Điều kiện | Yêu cầu | Kiểm tra | Nếu thiếu |
| --- | --- | --- | --- |
| Đúng actor và cửa ghi kiểm soát | SR1 | Giả principal, gọi trực tiếp và đối chiếu trace | Chưa an toàn để ghi. |
| Luật thực thi, row/field/action scope | SR2-SR3 | Bỏ prompt, đổi record/field/action, xem output/log | Không bù bằng prompt hoặc consent. |
| Approval đúng nội dung còn hạn | SR4 | Đổi hash/arguments, quá hạn, sai reviewer/run | Chặn, cần quyết định hợp lệ mới. |
| Không biết quyền thì không ghi | SR5 | Policy timeout, thiếu identity, snapshot lỗi | Không fallback quyền rộng. |
| Retry không effect thứ hai | SR6 | Mất response sau commit, double submit/resume | Sửa hợp đồng đích/recovery trước. |
| Trace nối quyết định-effect-cost | SR7 | Run có lỗi/resume, đối chiếu usage | Chưa đủ giải trình/đánh giá. |
| Nơi gọi thứ hai reuse | SR8 | Quyền theo người ở cả hai nơi, không sửa connector | Chưa có reusable asset an toàn. |

M2 gate 0 duplicate/0 lost và M6 gate 0 connector sửa giữ đúng [S02, mục 7.3](../../rd/problem/prd-ai-platform.md#73-sáu-chỉ-số-đo), không tuyên bố đạt chỉ vì có key/interface.

### 6.2. Tiêu chí phân biệt

Chưa có tổng điểm, trọng số hoặc ngưỡng thắng; chỉ cân tradeoff sau khi xác định cách đáp ứng gate.

| Nhu cầu ưu tiên | Cơ chế cần | Đáng khảo sát | Đánh đổi | Bằng chứng thiếu |
| --- | --- | --- | --- | --- |
| Một host, tool ổn định | Dispatch/contract nội bộ | API/FC | Adapter/state/lỗi tự quản | M1/M3/M6, host thứ hai. |
| Nhiều host reuse | Discovery/call liên thông | MCP | Version/auth/trust | Tương thích 2026-07-28, quyền riêng. |
| Chờ duyệt/recovery durable | Persistent progress/callback | Workflow | Definitions/IAM/log/retry | Hash/TTL, crash sau write. |
| Nhiều vai/routing mở | Manager/specialist/handoff | Orchestration | Calls/history/evals | Quality so một agent, isolation/usage. |
| Consumer độc lập | Fan-out/retention/replay | Event-driven | Backlog/delivery/dedup scope | Không lost, consumer idempotency, redrive. |

Ưu tiên độ đúng, đơn giản, vững chắc và bảo trì; M1-M6 làm rõ đánh đổi, không coi ít giờ phát triển nhất là chiến thắng.
Chi phí phải cùng ranh giới model/dịch vụ/hạ tầng/retry/log trên thay đổi thành công; báo riêng chờ người duyệt.
Đây là quy tắc đánh giá của người viết, chưa phải quyết định baseline hay stack.

## 7. Kết luận so sánh và vấn đề còn mở

### 7.1. Phát hiện - tổng hợp của người viết

**Finding 1: reuse giao diện khác reuse quyền.**
MCP contract và API library đều có thể tái dùng, nhưng SR8 đòi nơi gọi thứ hai không cầm khóa quyền riêng và vẫn qua cùng cổng.
Tiền đề là mục 3.1/3.2/3.4 và SR8, chưa có thử nghiệm hai nơi gọi.

**Finding 2: có điểm dừng chưa phải approval đúng SR4.**
Confirmation SHOULD, workflow callback và SDK approval là primitive khác nhau; hash/TTL và binding actor/action vẫn cần app cưỡng chế.
Tiền đề là mục 3.2-3.4, chưa có implementation đạt.

**Finding 3: bảo đảm điều phối không tự lan xuống effect nghiệp vụ.**
Exactly-once workflow execution, resume và exactly-once ingestion không thay atomic idempotency/reconciliation tại đích.
Tiền đề S07/S13/S22/S26, không khẳng định Lab đã chống ghi trùng.

**Finding 4: đơn vị chi phí quyết định cách so.**
Tokens/rounds, transitions, duration/memory và ingress/egress phải quy về workload/kết quả commit chung.
Chưa có dữ liệu xếp phương pháp nhanh/rẻ nhất.

### 7.2. Điều kiện cân nhắc hoặc loại khỏi một vai trò

Không dùng MCP làm đáp án cho transaction, durable approval hoặc quyền theo bản ghi: protocol không thay backend/app làm việc đó.
Một host, catalog ổn định, không cần liên thông thì giá trị bổ sung phải được chứng minh so với version/auth/vận hành, không mặc định MCP tốt hơn API.
Host/SDK chưa tương thích 2026-07-28 thì chưa đủ cơ sở chọn theo đặc tả báo cáo này.
Không thêm workflow chỉ để dispatch đơn giản, multi-agent khi chưa cần phân vai, hoặc event bus thay approval/commit receipt.
Đây là loại cách sử dụng sai vai trò, không loại phương pháp khỏi mọi tổ hợp.

### 7.3. Câu hỏi chuyển sang kiểm chứng

| Câu hỏi/giả thuyết | Thiếu bằng chứng | Ảnh hưởng | Kiểm dự kiến, chưa chạy |
| --- | --- | --- | --- |
| H1: nơi gọi thứ hai reuse không sửa connector? | Compatibility/quyền theo người | Giá trị API/MCP | Cùng fixtures/policy, đo M6. |
| H2: API/MCP khác latency/cost thế nào khi cùng gate? | Model/transport/config | Tránh đoán thứ hạng | Cùng task/backend, M1-M3, tách discovery/cache. |
| H3: đổi quyền sau approval chặn effect? | Hash/TTL/revocation | SR2/SR4/SR5 | Thu hồi quyền, đổi args/version, approval quá hạn. |
| H4: timeout sau commit không effect thứ hai? | Atomic dedup/reconcile | SR6 | Mất response, crash trước checkpoint, concurrent retry, key cũ payload khác. |
| H5: durable wait cải thiện recovery? | State app/workflow baseline | Vai trò workflow | Restart, callback lặp, hủy downstream, so effect/trace. |
| H6: specialist cải thiện nhiệm vụ đủ bù calls/history? | Task set/eval chung | Có cần multi-agent | So một agent/phân vai, quality/M1/M3, dữ liệu handoff. |
| H7: event sau commit có lost hoặc replay sai? | Commit-publish/consumer contract | Có cần event, loại bus | Publish lỗi, retry exhaustion, DLQ/redrive, replay muộn. |
| H8: agent/tool tăng 10 lần nghẽn đâu? | Tải và SDK ghim version | M4 | Đo p95/throughput/errors/context/store/backend. |
| H9: trace đủ mà không lộ dữ liệu? | Export/retention/redaction policy | SR3/SR7 | Kiểm output/history/snapshot/export cả khi redaction lỗi. |

Sau Question mới có cơ sở đề xuất phạm vi thử/ADR; báo cáo chưa tạo Experimental Evidence.
Research Finding hiện có là ranh giới và tradeoff cơ chế; reusable asset chạy được và nghiệm thu còn chờ.

## Tài liệu tham khảo

### Danh mục nguồn

Ngày truy cập nguồn ngoài được ba ghi chú ghi nhận là 2026-11-13, không phải ngày phát hành.
Nguồn live chưa có snapshot/commit; MCP ghim 2026-07-28.

| Mã | Nguồn gốc | Phiên bản/phạm vi và vị trí |
| --- | --- | --- |
| S01 | [Chương trình TXT](../../docs/program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt) | Trang 5-6, dòng 151-240; Compare/Track 01/Lab/nghiệm thu. |
| S02 | [PRD, mục 6 và 7.3](../../rd/problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc) | Chỉ dùng phần yêu cầu SR1-SR8 và chỉ số M1-M6; không dùng phụ lục thiết kế. |
| S03 | [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling) | Live; tool flow, strict, formatting, token usage. |
| S04 | [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture) | 2026-07-28; components/stateless/capabilities/design. |
| S05 | [MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) | 2026-07-28; list/call/schema/state/errors/security. |
| S06 | [MCP Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) | 2026-07-28; optional, HTTP scope, token/audience. |
| S07 | [Choosing workflow type](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html) | Live; Standard/Express/history/semantics. |
| S08 | [Integration patterns](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) | Live; request response/sync/callback/cancel. |
| S09 | [Step Functions pricing](https://aws.amazon.com/step-functions/pricing/) | Live; transitions/retry/request/duration/memory, không dùng giá USD. |
| S10 | [Step Functions quotas](https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html) | Live; API/state transitions/account/Region. |
| S11 | [Integration IAM](https://docs.aws.amazon.com/step-functions/latest/dg/service-integration-iam-templates.html) | Live; static/dynamic resource, monitoring/cancel. |
| S12 | [Multi-agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/) | Live SDK Python; manager/as-tool/handoff/code/LLM. |
| S13 | [Human in the loop](https://openai.github.io/openai-agents-python/human_in_the_loop/) | Live SDK; interruptions/snapshot ownership/replay/effects. |
| S14 | [Tracing](https://openai.github.io/openai-agents-python/tracing/) | Live SDK; defaults/sensitive data/exporter/redaction. |
| S15 | [Handoffs](https://openai.github.io/openai-agents-python/handoffs/) | Live SDK; transfer/history/filters/hooks. |
| S16 | [Usage](https://openai.github.io/openai-agents-python/usage/) | Live SDK; request/token totals, per-run caveats. |
| S17 | [Context](https://openai.github.io/openai-agents-python/context/) | Live SDK; local/shared state, filters vs authorization. |
| S18 | [Guardrails](https://openai.github.io/openai-agents-python/guardrails/) | Live SDK; input/tool/handoff boundaries. |
| S19 | [What is EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html) | Live; architecture/bus/Pipes/Classic. |
| S20 | [Custom buses](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html) | Live; mới subscribers/retention khác Classic. |
| S21 | [Retry policy](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html) | Live; Classic rule-target, exhaustion/DLQ. |
| S22 | [Ordering/dedup](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html) | Live; Custom mới, FIFO/Lambda/window/scope. |
| S23 | [Resource policies](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html) | Live; role/resource policy theo target. |
| S24 | [EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/) | Live; enhanced September 2026, units, không dùng giá USD. |
| S25 | [Custom bus access](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-access.html) | Live; identity policy/RAM/cross-account. |
| S26 | [Idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | Builders' Library; caller request ID, timeout ambiguity, atomic mutation. |

### Trích ngắn kiểm tra được

16 trích dưới đây lấy từ ghi chú nguồn, **không phải 16 phép kiểm tự động đã chạy trong phiên tổng hợp**.
Khi kiểm lại cần chuẩn hóa formatting/whitespace; quote không chứng minh implementation đạt.

| Mã | Khẳng định | Trích ngắn nguyên văn | Nguồn/vị trí và giới hạn |
| --- | --- | --- | --- |
| Q01 | App chạy tool | “Execute code on the application side with input from the tool call” | [S03](https://platform.openai.com/docs/guides/function-calling), tool flow; model không tự chạy. |
| Q02 | Schema tốn context | “callable function definitions count against the model's context limit and are billed as input tokens.” | [S03](https://platform.openai.com/docs/guides/function-calling), Token Usage; phạm vi OpenAI. |
| Q03 | MCP stateless | “MCP is a stateless protocol: every request is self-contained and carries its own protocol version and capabilities.” | [S04](https://modelcontextprotocol.io/specification/2026-07-28/architecture), mở đầu; không nói backend stateless. |
| Q04 | List có cache | “This operation supports pagination and caching.” | [S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), Listing Tools; không là benchmark. |
| Q05 | UI không quy định chung | “the protocol itself does not mandate any specific user interaction model.” | [S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), User Interaction Model. |
| Q06 | Auth optional | “Authorization is OPTIONAL for MCP implementations.” | [S06](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), Protocol Requirements. |
| Q07 | Auth HTTP scoped | “This specification defines the authorization flow for HTTP-based transports.” | [S06](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), Purpose and Scope. |
| Q08 | Workflow semantics | “Exactly-once workflow execution” | [S07](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), Standard; không là business effect. |
| Q09 | Express pattern | “Express Workflows only support Request Response integrations.” | [S08](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html); riêng sản phẩm. |
| Q10 | Retry tính transitions | “You are charged for the total number of state transitions across all your state machines, including retries.” | [S09](https://aws.amazon.com/step-functions/pricing/), Standard; không là TCO Lab. |
| Q11 | Orchestration là flow | “Orchestration refers to the flow of agents in your app.” | [S12](https://openai.github.io/openai-agents-python/multi_agent/), mở đầu. |
| Q12 | Approval không exactly-once | “Approval permits a tool call to execute; it does not guarantee exactly-once execution.” | [S13](https://openai.github.io/openai-agents-python/human_in_the_loop/), crash recovery. |
| Q13 | Trace mặc định bật | “Tracing is enabled by default.” | [S14](https://openai.github.io/openai-agents-python/tracing/), mở đầu; không bảo đảm an toàn dữ liệu. |
| Q14 | Classic rules/targets | “Custom Event Bus - Classic routes events using rules and targets that you write.” | [S19](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html); không áp subscribers mới. |
| Q15 | Ordering/dedup khác tầng | “Ordering is a property of a subscriber. Deduplication happens when you publish.” | [S22](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html); không là business effect. |
| Q16 | Key do caller cấp | “At Amazon, our preferred approach is to incorporate a unique caller-provided client request identifier into our API contract.” | [S26](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/); vẫn cần atomic mutation. |
