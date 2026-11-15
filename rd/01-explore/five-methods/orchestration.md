# Agent Orchestration - ghi chú nguồn cho bước Compare

## 1. Cơ chế là gì và bằng chứng nào thực sự thuộc SDK?

### Takeaway

Agent orchestration điều phối agent nào chạy, theo thứ tự nào và ai quyết định bước tiếp theo; có thể do LLM quyết định, do code quyết định, hoặc kết hợp hai cách [O1](https://openai.github.io/openai-agents-python/multi_agent/).
Đây là lớp điều phối, không tự thay thế giao diện công cụ, bộ thực thi phân quyền hay cơ chế chống ghi trùng; các API cụ thể dưới đây là bằng chứng về OpenAI Agents SDK Python, không phải bảo đảm của mọi hệ orchestration [O1](https://openai.github.io/openai-agents-python/multi_agent/), [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).

- Ngày nghiên cứu: 2026-11-13.
- Owner ghi chú: researcher Agent Orchestration; người tổng hợp và người duyệt báo cáo được session cha xác định.
- Trạng thái: ghi chú nghiên cứu chưa duyệt, phục vụ Compare, không phải ADR hay đề xuất chọn stack.
- Definition of done: cơ chế, bảy trục so sánh, SR1-SR8, giới hạn và trích dẫn nguyên văn đều có nguồn gốc đã mở; không có số đo lab giả định.
- Phương pháp: mở trực tiếp bảy trang tài liệu gốc của nhà phát triển; không dùng draft trong repository làm chứng cứ.
- Giới hạn thời gian: URL là tài liệu sống tại lần truy cập, không phải bản phát hành SDK hay commit đã ghim.

### Cited Findings

- **Hai cách điều phối:** LLM có thể lên kế hoạch và chọn tool/handoff; code có thể phân loại bằng structured outputs, nối agent tuần tự, chạy vòng evaluator hoặc chạy tác vụ độc lập song song [O1](https://openai.github.io/openai-agents-python/multi_agent/).
- **Agent-as-tool:** manager giữ quyền điều phối hội thoại và gọi specialist qua `Agent.as_tool()`; phù hợp về mặt pattern khi specialist giải quyết một phần việc có giới hạn rồi trả kết quả cho manager [O1](https://openai.github.io/openai-agents-python/multi_agent/).
- **Handoff:** triage chuyển hội thoại sang specialist, specialist trở thành active agent cho phần còn lại của lượt; không đồng nghĩa manager gọi specialist rồi luôn nhận lại quyền điều phối [O1](https://openai.github.io/openai-agents-python/multi_agent/).
- **Cùng biểu diễn bằng tool không có nghĩa cùng ngữ nghĩa:** handoff được biểu diễn thành tool cho LLM nhưng đi qua pipeline handoff; tool guardrails không áp dụng cho chính lời gọi handoff [O4](https://openai.github.io/openai-agents-python/handoffs/), [O7](https://openai.github.io/openai-agents-python/guardrails/).
- **Local context:** app có thể truyền UID, dependencies và policy helper qua `RunContextWrapper.context`; context này không được gửi trực tiếp đến LLM, nhưng derived wrappers trong một run chia sẻ app context, approval state và usage, kể cả nested agent-as-tool theo mặc định [O6](https://openai.github.io/openai-agents-python/context/).
- **Approval pause/resume:** tool khai báo approval, runner phát `interruptions`, app dùng `RunState` để approve/reject và resume từ top-level agent ban đầu; approval có thể xuất hiện sau handoff hoặc trong nested agent-as-tool [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- **Không tự xác thực snapshot:** `RunState.from_json()` và `from_string()` khôi phục state nhưng không xác thực snapshot hoặc người gửi; tài liệu yêu cầu trusted storage hoặc ứng dụng xác minh đầy đủ integrity và ownership trước deserialize [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- **Không tự bảo đảm external effects:** tài liệu nêu rõ approval không bảo đảm exactly-once; crash sau tác động bên ngoài nhưng trước lưu state có thể khiến resume thực thi lại [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).

### Inferences

- **Suy luận, không phải tính năng được bảo đảm:** orchestration có thể nằm phía trên API/function tools hoặc MCP tools, nên khi so sánh cần tách lợi ích điều phối nhiều agent khỏi lợi ích của giao thức tích hợp [O1](https://openai.github.io/openai-agents-python/multi_agent/), [O6](https://openai.github.io/openai-agents-python/context/).
- **Minh họa đường chạy lab, không chọn kiến trúc:** user đã xác thực -> orchestrator -> tool đọc employee/task -> đề xuất thay đổi -> bộ kiểm quyền và approval phía server -> write tool -> hệ thống đích -> kết quả và audit.
  Sơ đồ này chỉ dùng để xác định nơi cần kiểm chứng, không khẳng định SDK cung cấp toàn bộ các chốt kiểm soát [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/), [O6](https://openai.github.io/openai-agents-python/context/).
- **Giới hạn phạm vi:** dùng hai agent không tự chứng minh khả năng tái sử dụng an toàn, vì context/approval có thể được chia sẻ và handoff có thể truyền lịch sử sang agent tiếp theo [O4](https://openai.github.io/openai-agents-python/handoffs/), [O6](https://openai.github.io/openai-agents-python/context/).

### Gaps

- Chưa chạy POC, chưa ghim phiên bản SDK, chưa kiểm tra các tính năng tài liệu bằng E2E.
- Không có bằng chứng rằng mọi framework orchestration hỗ trợ `RunState`, cùng phạm vi approval, hay tracing mặc định tương tự.

## 2. Bảy trục so sánh và mức đáp ứng SR1-SR8 là gì?

### Takeaway

Điểm mạnh có bằng chứng của đại diện SDK là composition, pause/resume và trace/usage; phân quyền tài nguyên, giới hạn dữ liệu, ràng buộc approval và chống tác động trùng vẫn cần thiết kế thực thi riêng [O1](https://openai.github.io/openai-agents-python/multi_agent/), [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/), [O3](https://openai.github.io/openai-agents-python/tracing/), [O6](https://openai.github.io/openai-agents-python/context/).
Các đánh giá tradeoff bên dưới là suy luận có điều kiện từ cơ chế, không phải kết quả đo lab hay kết luận chọn mô hình.

### Cited Findings

#### Trục 1 - Chi phí

- SDK ghi số request LLM, input/output/total tokens và per-request usage; totals bao gồm model calls tạo tool calls hoặc handoffs [O5](https://openai.github.io/openai-agents-python/usage/).
- Provider/adapters có thể không trả usage đầy đủ; session lưu lịch sử nhưng mỗi run có usage riêng, và lịch sử có thể được gửi lại làm input ở lượt sau [O5](https://openai.github.io/openai-agents-python/usage/).
- SDK có trace dashboard được mô tả là miễn phí, nhưng không thể suy ra tổng chi phí orchestration bằng không vì model calls và hạ tầng có cơ chế chi phí riêng [O3](https://openai.github.io/openai-agents-python/tracing/), [O5](https://openai.github.io/openai-agents-python/usage/).

#### Trục 2 - Khả năng mở rộng và độ trễ

- Tài liệu mô tả chạy agent song song bằng `asyncio.gather` cho công việc độc lập; điều phối bằng code được mô tả là dễ dự đoán hơn về tốc độ, chi phí và hiệu năng so với giao toàn bộ luồng cho LLM [O1](https://openai.github.io/openai-agents-python/multi_agent/).
- Ví dụ approval server chính thức chỉ có store giới hạn trong một event loop của một process; production còn phải cung cấp authentication, storage và recovery, nên ví dụ đó không chứng minh horizontal scale [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).

#### Trục 3 - Bảo mật và phân quyền

- `is_enabled`/tool filters giới hạn capability được đưa cho model nhưng không authorize các giá trị arguments hoặc tài nguyên mà model chọn; protected operations phải được kiểm quyền tại nơi thực thi thích hợp [O6](https://openai.github.io/openai-agents-python/context/).
- Với handoff có parsed fields, tài liệu yêu cầu kiểm tra ở đầu `on_handoff` trước side effects, và raise nếu không được phép; chỉ return bình thường thì transfer tiếp tục [O4](https://openai.github.io/openai-agents-python/handoffs/).
- Handoff mặc định cho agent tiếp theo thấy lịch sử trước đó; nested history không phải redaction, và remove structured tool items không loại bỏ nội dung đã sao chép vào ordinary messages [O4](https://openai.github.io/openai-agents-python/handoffs/).
- Với server-managed conversation history, handoff input filters không được hỗ trợ; nếu cần agent sau không thừa hưởng lịch sử đó, tài liệu yêu cầu run riêng với input được chọn và không tái dùng conversation/previous-response ID cũ [O4](https://openai.github.io/openai-agents-python/handoffs/).

#### Trục 4 - Bảo trì và tiến hóa

- SDK hỗ trợ chia agent chuyên trách và phối hợp manager/handoff, đồng thời tài liệu nhấn mạnh monitoring, prompt iteration và evals [O1](https://openai.github.io/openai-agents-python/multi_agent/).
- Pending approvals cần lưu version marker của agent definitions hoặc SDK để deserialize theo code path tương thích khi model, prompt hoặc tool definitions thay đổi [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).

#### Trục 5 - Độ tin cậy, lỗi và chạy lại

- Callable approval policy không được gọi khi SDK không thể đọc arguments an toàn; runner yêu cầu manual approval thay vì tự chạy trong các trường hợp được tài liệu liệt kê [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- Approval không đồng bộ nguyên tử tác động hệ thống đích với lưu run state; cần stable idempotency key và hệ thống đích chặn trùng nguyên tử hoặc authoritative reconciliation trước retry [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- Khi outcome chưa rõ, tài liệu yêu cầu ghi unknown và tránh automatic replay; một ordinary lookup không thấy kết quả chưa đủ chứng minh retry an toàn [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).

#### Trục 6 - Quan sát và kiểm toán

- SDK trace generations, tool calls, handoffs, guardrails và custom events; spans có start/end timestamps, trace ID và parent ID [O3](https://openai.github.io/openai-agents-python/tracing/).
- Tracing mặc định bật và `trace_include_sensitive_data` mặc định `True`; generation/function spans có thể chứa input/output nhạy cảm [O3](https://openai.github.io/openai-agents-python/tracing/).
- `add_trace_processor()` vẫn giữ exporter mặc định; một redaction processor đứng trước exporter không bảo đảm chặn dữ liệu khi nó lỗi vì các processors là observers độc lập [O3](https://openai.github.io/openai-agents-python/tracing/).
- Khi xuất trace phụ thuộc redaction thành công, tài liệu hướng dẫn thay default processors, đặt redaction và delivery trong cùng exporter do app kiểm soát, và bỏ batch nếu redaction thất bại [O3](https://openai.github.io/openai-agents-python/tracing/).

#### Trục 7 - Tái sử dụng và khả năng kết hợp

- Manager có thể gọi nhiều specialist như tools và specialist sau handoff cũng có thể gọi agent khác như tool; hai pattern có thể kết hợp [O1](https://openai.github.io/openai-agents-python/multi_agent/).
- Trong một run, nested agent-as-tool không có isolated app state mặc định; khả năng composition không đồng nghĩa quyền thực thi được tách biệt [O6](https://openai.github.io/openai-agents-python/context/).
- Sticky approval của function tool được scoped theo agent, nhưng local shell/apply-patch sticky decisions khớp tool type/name chứ không owning agent hoặc executor; có thể áp dụng sang agent khác dù quyền executor khác nhau [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).

### Inferences

#### Tradeoff phục vụ bảng Compare

- **Chi phí:** delegation/evaluator loops có thể thêm model calls và truyền lại lịch sử, nhưng không được mặc định kết luận luôn đắt hơn vì decomposition cũng có thể thay đổi model/context; cần đo usage và tính theo đơn giá provider cụ thể [O1](https://openai.github.io/openai-agents-python/multi_agent/), [O5](https://openai.github.io/openai-agents-python/usage/).
- **Scale/latency:** parallelism giúp phần độc lập nhưng không xóa critical path của chuỗi manager -> specialist -> approval -> write; throughput của state store và hệ thống đích phải đo riêng [O1](https://openai.github.io/openai-agents-python/multi_agent/), [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- **Security:** số ranh giới truyền dữ liệu và quyết định tăng khi thêm agent; giữ nguyên policy enforcement tại tool/service có giá trị hơn việc chỉ thêm prompt cấm hoặc ẩn tool [O4](https://openai.github.io/openai-agents-python/handoffs/), [O6](https://openai.github.io/openai-agents-python/context/).
- **Maintenance:** specialization có thể giảm trách nhiệm của từng prompt nhưng tăng contracts, routes, regression scenarios và versioning cho paused work; không nên chấm điểm bảo trì chỉ theo số dòng code [O1](https://openai.github.io/openai-agents-python/multi_agent/), [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- **Reliability:** durable pause là khả năng tiếp tục tính toán, không phải transaction coordinator cho employee/task systems [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- **Observability:** trace giúp truy nguyên execution path nhưng chưa phải audit bảo mật chống sửa; cần kiểm thử coverage, retention và quyền đọc log riêng, không đưa employee rows hoặc secret vào trace metadata tùy tiện [O3](https://openai.github.io/openai-agents-python/tracing/).
- **Reuse:** agent thứ hai gọi cùng tool/service dưới context quyền khác mới kiểm tra được reuse thực chất; gọi lại specialist với shared quyền manager chưa đủ [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/), [O6](https://openai.github.io/openai-agents-python/context/).

#### Ánh xạ yêu cầu và phép kiểm chứng, không phải thiết kế đã chốt

- **SR1 - identity và execution path:** local context có chỗ chứa UID, nhưng app phải lấy identity từ authenticated session và gắn actor, delegated agent, run/call và tool execution vào audit đáng tin cậy.
  Test: agent/arguments tự khai user khác không được thay principal; trace chỉ ra đường manager/as-tool hoặc handoff mà không xem `agent.name` là bằng chứng xác thực [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/), [O3](https://openai.github.io/openai-agents-python/tracing/), [O6](https://openai.github.io/openai-agents-python/context/).
- **SR2 - enforceable authorization:** kiểm quyền trong write/read implementation hoặc service đích, không chỉ `is_enabled`, prompt, JSON schema hoặc lời đồng ý của reviewer.
  Test: gọi trực tiếp tool, gọi sau handoff và gọi qua nested specialist đều bị từ chối nếu principal không có quyền; quyền bị thu hồi sau approval cũng cần được kiểm tra lại trước effect [O4](https://openai.github.io/openai-agents-python/handoffs/), [O6](https://openai.github.io/openai-agents-python/context/).
- **SR3 - rows/fields:** lọc row và field trước khi dữ liệu ra khỏi service và trước khi đưa vào model/approval UI; handoff filtering chỉ là lớp hạn chế truyền tiếp, không thay row-level authorization.
  Test: agent chỉ được xem team A không nhận row team B; trường cấm không xuất hiện trong tool output, forwarded history, summary hoặc trace [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/), [O4](https://openai.github.io/openai-agents-python/handoffs/), [O6](https://openai.github.io/openai-agents-python/context/).
- **SR4 - approval ràng buộc hash và TTL:** SDK có per-call approval nhưng các trang đã mở không chứng minh một cơ chế tổng quát tự ràng buộc canonical action hash và thời hạn theo yêu cầu lab.
  Phần app cần kiểm chứng: approval record phía server liên kết principal, reviewer, run/action, target, canonical arguments hash, resource version, expiry và trạng thái single-use; hash nhận diện nội dung không tự xác thực toàn snapshot.
  Test: sửa arguments/target sau duyệt, submit approval quá hạn, dùng approval cho run/người khác hoặc duyệt lại sau thay version đều không ghi [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- **SR5 - fail closed:** callable approval có fail-closed behavior cụ thể ở lớp đọc arguments, không có nghĩa toàn bộ lab tự fail closed.
  Test: policy service timeout, identity thiếu, snapshot sai integrity, approval thiếu/hết hạn hoặc malformed input đều không có effect; không đổi lỗi auth thành fallback tool có quyền rộng hơn.
  Agent input guardrail chạy parallel mặc định có thể để tool chạy trước cancellation, nên không dùng nó làm chốt auth duy nhất [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/), [O7](https://openai.github.io/openai-agents-python/guardrails/).
- **SR6 - idempotent effects:** cần stable logical-action key cùng tham số không đổi giữa retries, được hệ thống đích chặn duplicate nguyên tử; single-use approval và idempotent external effect là hai vấn đề khác nhau.
  Test: hai concurrent resumes, double submit, timeout sau write và crash trước checkpoint không tạo effect thứ hai; nếu không reconcile được thì ghi unknown, không replay tự động [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- **SR7 - trace và cost:** ghi latency riêng cho model/tool/approval wait, request counts, token usage, retry và effect outcome với correlation IDs an toàn; chuyển usage thành tiền chỉ khi có provider/model/pricing và ngày giá tương ứng.
  Test: run có nested specialist và resume được tính usage không double-count cumulative checkpoint totals; trace vẫn đủ liên kết nhưng không lộ rows/fields bị cấm, token/secret hoặc raw approval payload [O3](https://openai.github.io/openai-agents-python/tracing/), [O5](https://openai.github.io/openai-agents-python/usage/).
- **SR8 - agent thứ hai tái sử dụng với quyền riêng:** chạy cùng tool contract với identity/quyền khác và chứng minh không phải copy tool hoặc thừa hưởng quyền manager; shared context không mặc định là isolation boundary.
  Test: agent A được ghi, B chỉ đọc; B vẫn dùng được read tool nhưng không ghi nhờ approval/state của A; kiểm tra cụ thể sticky decisions nếu dùng shell/apply-patch vì SDK cảnh báo scope không theo owning agent [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/), [O6](https://openai.github.io/openai-agents-python/context/).

#### Snapshot và chống replay cần phân biệt ba lớp

- **Integrity/ownership:** complete snapshot ở trusted server storage; reviewer chỉ nhận authorized display details và opaque decision IDs; deserialize chỉ state do server sở hữu, không nhận snapshot thay thế từ client [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- **Consumption:** server xác thực reviewer từ session, authorize reviewer đối với stored run và pending call, kiểm decision IDs/booleans rồi dùng atomic owner-checked transition để concurrent/replayed submits không resume cùng snapshot hai lần [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).
- **Effect recovery:** kể cả consumption đúng, crash vẫn có thể nằm giữa external write và checkpoint; idempotency/reconciliation ở đích vẫn cần để xử lý retry hợp lệ [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/).

### Gaps

- Chưa có số liệu cost, latency p50/p95, concurrency, failure rate hoặc kết quả phân quyền của AI Operations Connector Lab.
- Chưa chứng minh implementation cho canonicalization/hash, TTL, revocation, row/field rules, transaction/idempotency hay audit integrity.
- Bảy trục ở đây là cost, scale/latency, security, maintenance, reliability, observability, reuse; nếu report cha dùng nhãn khác cần ánh xạ nội dung, không xem bộ nhãn này là trích từ tiêu chí gốc.

## 3. Trích dẫn nào có thể kiểm tra lặp lại và giới hạn kết luận là gì?

### Takeaway

Trích dẫn dưới đây ngắn, nguyên văn tiếng Anh và gắn URL/section để người tổng hợp kiểm tra lại trực tiếp.
Chúng chứng minh nội dung tài liệu đã mở, không thay thế kiểm thử thực nghiệm hay bảo đảm bảo mật của sản phẩm lab.

### Cited Findings

1. O1, phần mở đầu: "Orchestration refers to the flow of agents in your app." [Nguồn](https://openai.github.io/openai-agents-python/multi_agent/).
2. O4, phần mở đầu: "Handoffs are represented as tools to the LLM." [Nguồn](https://openai.github.io/openai-agents-python/handoffs/).
3. O4, Input filters: "Handoffs stay within a single run." [Nguồn](https://openai.github.io/openai-agents-python/handoffs/).
4. O2, Keep approval state on the server: "A schema check or a tool-call fingerprint does not authenticate a snapshot." [Nguồn](https://openai.github.io/openai-agents-python/human_in_the_loop/).
5. O2, Keep approval state on the server: "Possession of a run ID or decision ID is not authorization." [Nguồn](https://openai.github.io/openai-agents-python/human_in_the_loop/).
6. O2, Recovering after a crash: "Approval permits a tool call to execute; it does not guarantee exactly-once execution." [Nguồn](https://openai.github.io/openai-agents-python/human_in_the_loop/).
7. O3, phần mở đầu: "Tracing is enabled by default." [Nguồn](https://openai.github.io/openai-agents-python/tracing/).
8. O3, Sensitive data: "By default, `trace_include_sensitive_data` is `True`." [Nguồn](https://openai.github.io/openai-agents-python/tracing/).
9. O5, Accessing usage from a run: "Usage is aggregated across all model calls during the run, including model calls that produce tool calls or handoffs." [Nguồn](https://openai.github.io/openai-agents-python/usage/).
10. O7, Workflow boundaries: "Input guardrails run only for the first agent in the chain." [Nguồn](https://openai.github.io/openai-agents-python/guardrails/).

Các cụm có inline code/bold khi kiểm tra bằng script nên so trên rendered text hoặc chuẩn hóa Markdown/HTML formatting và whitespace trước khi so khớp.
Mốc truy cập của mọi nguồn trong file: 2026-11-13; không khẳng định đây là timestamp phát hành của nguồn.

### Inferences

- **Câu tổng hợp có thể dùng ở Compare:** Agent Orchestration hỗ trợ phân vai và điều phối bằng model hoặc code; đại diện OpenAI Agents SDK cung cấp manager-as-tool, handoff, approval pause/resume và trace/usage, nhưng các primitive này không tự bảo đảm authorization, cô lập dữ liệu, approval binding hay idempotent effects [O1](https://openai.github.io/openai-agents-python/multi_agent/), [O2](https://openai.github.io/openai-agents-python/human_in_the_loop/), [O3](https://openai.github.io/openai-agents-python/tracing/), [O6](https://openai.github.io/openai-agents-python/context/).
- **Điều kiện phù hợp về cơ chế, chưa chọn dùng:** đáng đưa vào so sánh khi cần nhiều vai trò chuyên trách hoặc luồng mở cần routing; nếu lab chỉ cần một read-check-propose-confirm-write flow cố định thì lợi ích của nhiều agent phải được chứng minh thay vì giả định [O1](https://openai.github.io/openai-agents-python/multi_agent/).
- **Không chốt stack:** không có bằng chứng ở ghi chú này để xếp orchestration thắng MCP/API/workflow/event-driven; chúng có thể ở các lớp khác nhau và cần cùng baseline trước khi so kết quả [O1](https://openai.github.io/openai-agents-python/multi_agent/), [O6](https://openai.github.io/openai-agents-python/context/).

### Gaps

- Nguồn đều thuộc một SDK; đủ cho đại diện minh họa, không đủ kết luận phổ quát rằng mọi framework có cùng guardrails/approval/tracing semantics.
- Chưa mở versioned source permalink hay lưu bản snapshot nguồn; khi cần repeatability lâu dài phải bổ sung version/commit và bản nguồn được phép lưu.
- Không đưa con số pricing, benchmark hoặc tỷ lệ thành công vì chưa có phép đo lab và chưa có cấu hình provider/model được chốt.
