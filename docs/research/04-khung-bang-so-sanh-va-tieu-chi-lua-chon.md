> **CHƯA REVIEW - BÁO CÁO ĐÃ ĐIỀN NỘI DUNG, CHƯA CÓ KẾT QUẢ LAB.**
> Chấp thuận cấu trúc không thay cho review nội dung và bằng chứng.
> Sổ trạng thái dự kiến: `docs/REVIEW-STATUS.md`, hiện không có trong working tree tại thời điểm tổng hợp.

# Bước 02 - Bảng so sánh và tiêu chí lựa chọn

- Chủ sở hữu: Phạm Bách Hiệp.
- Mentor: Kevin.
- Ngày cập nhật: 2026-11-13.
- Phiên bản: 1.0.
- Trạng thái: hoàn thành nội dung nghiên cứu, chưa review, chưa đo lab, không phải ADR.
- Phạm vi: API/Function Calling, MCP, Workflow Engine, Agent Orchestration, Event-driven Integration.

**Kết luận tổng hợp của người viết: năm phương pháp giải quyết các vai trò khác nhau, không phải năm kiến trúc hoàn chỉnh thay thế ngang hàng.**
API/Function Calling nối quyết định gọi công cụ của model với code ứng dụng; MCP chuẩn hóa giao tiếp công cụ; workflow giữ tiến độ quy trình; orchestration phân vai và quyết định bước tiếp theo; event-driven phân phối sự kiện.
Tài liệu gốc cho thấy các cơ chế hỗ trợ kiểm soát và tái sử dụng, nhưng chưa chứng minh tổ hợp nào đạt yêu cầu của Lab.
Quyền nghiệp vụ, giới hạn dữ liệu, ràng buộc phê duyệt và chống hiệu ứng ghi thứ hai vẫn phải được thực thi và kiểm thử tại ranh giới ứng dụng/hệ thống đích.
Vì vậy, báo cáo xác định điều kiện cân nhắc và khoảng trống cần kiểm chứng, không chọn stack hay kiến trúc.

## Điều kiện hoàn thành

| Điều kiện | Trạng thái tại phiên bản 1.0 |
| --- | --- |
| Năm phương pháp có cơ chế, bảy trục so sánh và khoảng trống bằng chứng | Đã điền ở mục 3, chưa được con người duyệt. |
| Hai bảng tổng hợp truy được về phân tích chi tiết | Đã điền ở mục 4, không phải bảng xếp hạng thực nghiệm. |
| SR1-SR8 và M1-M6 dùng đúng phạm vi nguồn được phép | Đã đối chiếu Phần 3 của bước 0; không sử dụng Phần 2. |
| Có nguồn gốc, trích ngắn và giới hạn áp dụng | Có danh mục S01-S26 và bảng trích ở cuối; chưa chạy kiểm nguồn tự động cho báo cáo này. |
| Có tiêu chí lựa chọn và câu hỏi kiểm chứng | Đã điền, chưa chốt trọng số, ngưỡng mới hoặc phương án. |
| Review con người và bằng chứng chạy lab | **Chưa hoàn thành**, không được ghi là đã đạt nghiệm thu. |

## 1. Mục đích và phạm vi so sánh

### 1.1. Mục đích

Báo cáo hỗ trợ Hiệp và Kevin trả lời: mỗi phương pháp cung cấp gì cho bài toán kết nối AI với nghiệp vụ, phải bổ sung gì và điều kiện nào khiến nó đáng khảo sát.
Đây là đầu ra bước 02 Compare, sau Explore và trước Question/Propose; chương trình yêu cầu so sánh ưu/nhược, mở rộng, chi phí, bảo mật, bảo trì và độ phù hợp trước khi chọn phương án ([S01](../program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt), trang 5, dòng 151-197).
Không có quyết định stack, mã triển khai, ADR hoặc tuyên bố một kiến trúc thắng trong tài liệu này.

### 1.2. Bối cảnh và nguồn nhu cầu

AI Operations Connector Lab dùng hai hệ thống giả lập, một agent đọc dữ liệu, kiểm quyền, đề xuất cập nhật và chỉ thực hiện sau xác nhận; chương trình gợi ý dựng hai cách tích hợp để so sánh ([S01](../program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt), trang 6, dòng 203-240).
Nghiệm thu Track 01 yêu cầu kiểm thử quyền, ghi, lỗi, chạy lại, tái sử dụng bởi agent khác và báo cáo thời gian, ổn định, chi phí khi đo được, cùng điều kiện không nên dùng MCP.
Nhu cầu kỹ thuật dùng ở đây là SR1-SR8 và M1-M6 trong **Phần 3 đã review** của bước 0 ([S02](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md#phần-3---yêu-cầu-và-đánh-giá), dòng 203-253).
Toàn bộ file bước 0 vẫn ở trạng thái review một phần; báo cáo không dùng Phần 2 đang mở làm bằng chứng kiến trúc.
Ba ghi chú mới trong `research_notes/So sánh tích hợp AI/` là đầu vào tổng hợp và ghi nhận các lần mở nguồn ngày 2026-11-13, không phải tài liệu đã được mentor duyệt.
Không kế thừa số liệu, trích dẫn hoặc kết luận từ các bản nháp nghiên cứu cũ.

### 1.3. Đơn vị và giới hạn so sánh

| Phương pháp | Vai trò khảo sát | Ranh giới không được đánh đồng | Đại diện/nguồn |
| --- | --- | --- | --- |
| API/Function Calling | Model đề xuất hàm và arguments, ứng dụng dispatch tới nghiệp vụ | API bất kỳ không đồng nghĩa model chọn gọi API | OpenAI Function Calling, S03. |
| MCP | Hợp đồng host/client/server, discovery và gọi công cụ | Không thay policy, transaction hoặc backend | Đặc tả 2026-07-28, S04-S06. |
| Workflow Engine | Trình tự, trạng thái chờ và phục hồi quy trình | Workflow execution không đồng nghĩa business effect | AWS Step Functions, S07-S11. |
| Agent Orchestration | Routing, manager/specialist, handoff hoặc điều phối bằng code | Phân vai agent không tự cô lập quyền | OpenAI Agents SDK Python, S12-S18. |
| Event-driven Integration | Producer phát sự kiện, consumer phản hồi độc lập | Bus nhận sự kiện không chứng minh nghiệp vụ đã commit | Amazon EventBridge, S19-S25. |

Các đại diện dùng để kiểm tra cơ chế cụ thể, không đại diện toàn bộ sản phẩm cùng nhóm.
MCP chỉ được mô tả theo 2026-07-28; nguồn SDK/AWS là tài liệu sống ở ngày nghiên cứu, chưa ghim release hoặc snapshot.
Không khảo sát dữ liệu nội bộ thật, không dùng credentials thật và không đưa thông tin nhạy cảm vào fixture/log.

## 2. Tiêu chí và quy tắc đánh giá

### 2.1. Bảy trục đánh giá

| Trục | Câu hỏi dùng nhất quán |
| --- | --- |
| Ưu điểm | Cơ chế đem lại lợi ích gì, cho ai, với điều kiện nào? |
| Nhược điểm | Đổi lại trách nhiệm gì, đường lỗi nào xuất hiện trước? |
| Khả năng mở rộng | Tăng agent, tool, người dùng, concurrency hay fan-out thì nút thắt nào đổi? |
| Chi phí | Đếm đơn vị nào, khoản nào phát sinh và đâu là phần chưa đo? |
| Bảo mật | Ai xác thực, ai kiểm quyền theo đối tượng, ai chặn ghi và quản lý bí mật? |
| Bảo trì | Đổi schema, policy, version hoặc retry ảnh hưởng những thành phần nào? |
| Độ phù hợp | Đóng góp gì cho SR1-SR8 và tình huống nào không nên dùng ở vai trò đó? |

### 2.2. Quy tắc bằng chứng

**Cơ chế được tài liệu mô tả, khả năng của sản phẩm và kết quả chạy Lab là ba loại bằng chứng khác nhau.**
Phát biểu về nguồn ngoài có liên kết Sxx; nhận định tradeoff và điều kiện lựa chọn là suy luận của người viết từ các cơ chế đó.
`Chưa đo` nghĩa là chưa có thực nghiệm; `chưa xác minh` không được diễn giải thành sản phẩm không hỗ trợ.
Các MUST/SHOULD/OPTIONAL trong MCP giữ nguyên mức bắt buộc, không chuyển khuyến nghị thành bảo đảm triển khai.
Trích ngắn cuối báo cáo được lấy từ ba ghi chú đã mở nguồn, không phải kết quả một lượt kiểm tự động mới.
Không gán nhãn hiệu năng cao/thấp, tỷ lệ tiết kiệm hoặc thứ hạng bảo mật khi chưa có baseline chung.
Chi phí được ghi theo đơn vị và driver; không dùng đơn giá thay tổng chi phí một thay đổi thành công.
Không đưa giá tiền minh họa vì chưa cần thiết cho quyết định vai trò và chưa chốt cấu hình Lab.
Chất lượng, sự đơn giản, độ vững chắc, khả năng mở rộng và bảo trì dài hạn được ưu tiên hơn việc chỉ giảm công sức phát triển ban đầu.

### 2.3. Dữ liệu cần thu trước khi kết luận thực nghiệm

| Mã từ Phần 3 bước 0 | Dữ liệu/cách đo đã được yêu cầu | Trạng thái ở báo cáo này |
| --- | --- | --- |
| M1 - thời gian | p50/p95 qua 100 lần chạy, tách model, policy và các lớp trung gian thực có | Chưa đo; tách thêm thời gian chờ người duyệt để tránh so sai. |
| M2 - ổn định | 100 lần gồm lỗi mạng/timeout, đếm success, error, retry, duplicate | Chưa đo; gate nguồn là 0 duplicate, 0 lost. |
| M3 - chi phí | Token, giá model, thời gian hạ tầng chia số thay đổi thành công | Chưa đo; cần cấu hình và ngày giá. |
| M4 - mở rộng | Tăng số agent/tool 10 lần, đo throughput, p95 và lỗi | Chưa đo; không phải ngưỡng hiệu năng đạt. |
| M5 - vận hành | Đếm service, cấu hình, bước deploy và điểm sửa khi đổi policy | Chưa kiểm kê trên triển khai. |
| M6 - tái dùng | Người-giờ, dòng code, connector sửa khi thêm agent thứ hai | Chưa đo; gate nguồn là 0 connector phải sửa. |

Các con số 100 lần, tăng 10 lần và hai gate trên đến từ [S02, mục 3.2](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md#32-yếu-tố-đánh-giá), không phải ngưỡng mới do báo cáo đề xuất.
Các ngưỡng latency, success rate và cost vẫn để mở đến khi có baseline.

## 3. Phân tích từng phương pháp

### 3.1. API/Function Calling

**a. Cơ chế và vai trò.**
Trong hiện thực OpenAI, ứng dụng gửi định nghĩa function, model trả tool call, ứng dụng chạy code và gửi kết quả lại để model tiếp tục ([S03](https://platform.openai.com/docs/guides/function-calling), The tool calling flow).
Một API được gọi bằng code cố định không tự là function calling; phần đặc thù ở đây là model đề xuất tên công cụ và arguments, còn ứng dụng sở hữu thực thi.

**b. Ưu điểm - suy luận.**
Với một host và tập tool ổn định, đặt dispatch, chuyển đổi schema và xử lý lỗi trong ứng dụng giúp thấy rõ đường gọi nghiệp vụ.
Nhóm phát triển có thể giữ một hợp đồng tool nội bộ dùng chung, thay vì mặc định mỗi API tích hợp phải sao chép logic ([S03](https://platform.openai.com/docs/guides/function-calling), Formatting results).

**c. Nhược điểm - suy luận.**
Khi thêm host/model API khác hợp đồng, mapping schema, dispatch và lỗi có thể cần adapter mới; mức lặp lại phụ thuộc thư viện dùng chung thực tế.
Ứng dụng cũng phải tự giữ trạng thái chờ duyệt, timeout và khôi phục; vòng gọi model không tự cung cấp các bảo đảm nghiệp vụ đó ([S03](https://platform.openai.com/docs/guides/function-calling)).

**d. Khả năng mở rộng.**
Định nghĩa function chiếm context và billed input tokens trong OpenAI; tăng số tool làm xuất hiện bài toán kích thước schema và chất lượng chọn tool, không chỉ throughput backend.
Tài liệu khuyên đánh giá số function và có cơ chế tool search phù hợp model; đây không phải bằng chứng Lab đã scale ([S03](https://platform.openai.com/docs/guides/function-calling), Token Usage/Best practices).

**e. Chi phí.**
Đếm input/output tokens, số vòng model, tool/backend calls, compute-time, network và log của adapter thực có.
Định nghĩa function là một phần input tokens; chi phí trên một thay đổi thành công còn gồm lần lỗi/retry và các dịch vụ được gọi, **chưa đo tại Lab** ([S03](https://platform.openai.com/docs/guides/function-calling)).

**f. Bảo mật.**
`strict: true` của OpenAI ràng buộc sự phù hợp schema theo giới hạn tài liệu, không xác thực người gọi hoặc cấp quyền sửa task.
Ứng dụng phải lấy principal từ nguồn đáng tin, kiểm actor/action/resource tại nơi thực thi, lọc trường/bản ghi và buộc approval trước effect ([S03](https://platform.openai.com/docs/guides/function-calling), Strict mode; yêu cầu [S02, mục 3.1](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md#31-yêu-cầu-bắt-buộc)).

**g. Bảo trì - suy luận.**
Đổi API nghiệp vụ tác động adapter và test hợp đồng; đổi provider có thể tác động schema/dispatch, nhưng không nhất thiết phải đổi policy nếu tách trách nhiệm đúng.
Quy ước kết quả/lỗi phải được ổn định vì OpenAI cho ứng dụng quyết định nội dung kết quả, không áp một schema lỗi nghiệp vụ phổ quát ([S03](https://platform.openai.com/docs/guides/function-calling), Formatting results).

**h. Độ phù hợp - suy luận.**
Đáng khảo sát làm đường tích hợp trực tiếp để so reuse/control với MCP khi chỉ có một host, ít công cụ và không cần discovery liên host.
Không dùng riêng function calling để thay durable workflow hoặc hệ thống phân quyền; đóng góp chủ yếu là giao diện gọi tool cho SR1/SR2/SR8, không phải đã đạt các SR đó.

**i. Bằng chứng và điểm chưa xác minh.**
Nguồn đại diện là [S03](https://platform.openai.com/docs/guides/function-calling), không suy rộng strict/schema/tool search thành quy tắc của mọi nhà cung cấp.
Chưa có adapter, model, fixture hoặc số đo để khẳng định đường trực tiếp nhanh/rẻ hơn MCP; cần cùng policy, công cụ và workload khi thử.

### 3.2. MCP

**a. Cơ chế và vai trò.**
MCP 2026-07-28 dùng JSON-RPC theo host/client/server; host quản lý client và ranh giới bảo mật, server cung cấp capability như tools/resources/prompts ([S04](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).
Giao thức stateless, mỗi request tự mang version/capabilities; `tools/list` khám phá và `tools/call` gọi công cụ, không dùng mô tả protocol-level session của bản cũ ([S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

**b. Ưu điểm - suy luận.**
Hợp đồng discovery/call chung tạo cơ sở để nhiều host tương thích dùng lại một server; server vẫn có thể gọi API nghiệp vụ phía sau.
Phân trang/caching danh mục và phân biệt protocol error với tool execution error giúp định nghĩa rõ phần liên thông cần kiểm thử ([S04](https://modelcontextprotocol.io/specification/2026-07-28/architecture); [S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), Listing Tools/Error Handling).

**c. Nhược điểm - suy luận.**
Phải quản lý version/capability, transport, trust, credentials và liên thông client/server; không được suy ra giảm tích hợp theo công thức phổ quát `n*m` thành `n+m`.
UI confirmation không được protocol bắt buộc theo một mẫu duy nhất; extension tùy chọn không được coi là capability mặc định của mọi host/server ([S04](https://modelcontextprotocol.io/specification/2026-07-28/architecture); [S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), User Interaction Model).

**d. Khả năng mở rộng.**
`tools/list` hỗ trợ pagination/caching, danh sách có thể phụ thuộc authorization và SHOULD có thứ tự deterministic để hỗ trợ cache.
Stateless protocol không làm state nghiệp vụ hoặc backend tự scale; số host dùng lại, kích thước catalog, concurrency và quota đích cần đo riêng ([S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), Listing Tools/Stateful Tools).

**e. Chi phí.**
Đếm tokens/vòng model, calls discovery/call thực tế, server compute-time, bytes truyền, auth và logging; chỉ cộng những thành phần triển khai thực sự có.
Server có thể local hoặc remote nên không mặc định MCP luôn thêm một remote hop, luôn rẻ hơn hoặc luôn đắt hơn; **chi phí Lab chưa đo** ([S04](https://modelcontextprotocol.io/specification/2026-07-28/architecture)).

**f. Bảo mật.**
Authorization là OPTIONAL ở mức MCP; luồng authorization này có phạm vi HTTP, còn STDIO SHOULD NOT dùng luồng đó và dùng credentials từ environment theo tài liệu ([S06](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), Introduction/Protocol Requirements).
Khi áp dụng luồng HTTP, phải kiểm token/audience và quyền tương ứng; đó vẫn không tự định nghĩa policy ai sửa task nào.
Server MUST validate input, kiểm soát truy cập, rate limit và sanitize output; client SHOULD xác nhận thao tác nhạy cảm, còn annotations MUST coi là không đáng tin trừ trusted server ([S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), Security Considerations/Data Types).

**g. Bảo trì - suy luận.**
Phải test schema/version ở hai phía và phân biệt lỗi JSON-RPC với lỗi thực thi `isError`; `outputSchema` là tùy chọn, nếu có thì structured result phải phù hợp theo đặc tả.
State giữa các lần gọi cần handle tường minh; handle không tự cấp quyền, nên quyền phải được kiểm lại trên mỗi lần gọi khi áp dụng ([S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), Error Handling/Stateful Tools).

**h. Độ phù hợp - suy luận.**
Đáng khảo sát khi cần cùng tool contract cho agent/host thứ hai và muốn kiểm chứng discovery/liên thông, đặc biệt liên quan SR8.
Không nên dùng MCP chỉ vì nhãn chuẩn nếu không có nhu cầu liên thông, runtime đích chưa tương thích, hoặc mục tiêu thực sự là durable approval/transaction mà MCP không thay thế.

**i. Bằng chứng và điểm chưa xác minh.**
[S04-S06](https://modelcontextprotocol.io/specification/2026-07-28/architecture) chứng minh cơ chế và yêu cầu đặc tả, chưa chứng minh một SDK/host cụ thể tương thích 2026-07-28.
Chưa có test discovery theo quyền, confirmation cưỡng chế, revocation, duplicate-write hoặc reuse tách quyền; không gọi một triển khai là an toàn chỉ vì dùng MCP.

### 3.3. Workflow Engine

**a. Cơ chế và vai trò.**
Workflow giữ trạng thái và trình tự quy trình; Step Functions Standard là ví dụ durable execution có callback `.waitForTaskToken` cho dịch vụ hỗ trợ, còn Express chỉ hỗ trợ Request Response ([S07](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html); [S08](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)).
Đây là khả năng của Step Functions theo workflow type, không phải mặc định của mọi engine.

**b. Ưu điểm - suy luận.**
Khi đọc-check-propose-confirm-write có trình tự cố định và chờ người duyệt, state/callback giúp biểu diễn vị trí đang dừng và điều tra tiến độ.
Standard có execution history; sự rõ ràng này hữu ích cho recovery và SR7, chưa thay trace/audit nghiệp vụ xuyên hệ thống ([S07](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html)).

**c. Nhược điểm.**
Chọn Standard/Express ảnh hưởng thời lượng, callback, log và execution semantics; không đổi workflow type sau khi tạo theo tài liệu.
Dừng `.sync` chỉ cố hủy downstream theo best effort; downstream vẫn có thể chạy và phát sinh phí ([S07](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html); [S08](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)).

**d. Khả năng mở rộng.**
Step Functions có quota theo account/Region cho API/state transitions; Express không chịu cùng quota state transitions của Standard nhưng downstream không vì thế thành vô hạn.
Cần đo concurrency của execution, tác vụ đang chờ, policy store và hệ thống đích, không chỉ số workflow khởi chạy ([S10](https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html)).

**e. Chi phí.**
Standard tính state transitions gồm retry; Express tính requests và duration theo bộ nhớ, làm tròn duration 100 ms và memory theo khối 64 MB trong nguồn pricing.
Cộng dịch vụ gọi downstream, data transfer, log/storage thực có; đếm transitions/request, GB-second hoặc đơn vị provider quy định trước khi quy tiền, **Lab chưa đo** ([S09](https://aws.amazon.com/step-functions/pricing/)).

**f. Bảo mật.**
IAM scope cho resource tĩnh có thể hẹp; resource động qua input có thể khiến policy tự sinh dùng `Resource: "*"`, còn `.sync` cần quyền theo dõi/hủy bổ sung.
Callback token không thay quyền nghiệp vụ hoặc approval gắn hash/TTL; ứng dụng phải xác thực reviewer, kiểm tham số và kiểm quyền lại trước ghi ([S11](https://docs.aws.amazon.com/step-functions/latest/dg/service-integration-iam-templates.html); [S08](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)).

**g. Bảo trì - suy luận.**
Phải quản lý state-machine definition, IAM, retry/catch, callback và log; Express cần bật log để có lịch sử thực thi theo nguồn.
Kiểm cả đường mất event/polling vì thiếu IAM theo dõi có thể làm `.sync` kẹt dù đường thường chạy thành công ([S07](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html); [S11](https://docs.aws.amazon.com/step-functions/latest/dg/service-integration-iam-templates.html)).

**h. Độ phù hợp - suy luận.**
Đáng khảo sát khi cần giữ durable progress qua approval và khôi phục, hỗ trợ một phần SR4/SR7.
AWS gọi Standard là exactly-once workflow execution, nhưng retry state hoặc hai execution khác nhau vẫn có thể tạo lại effect; SR6 cần hợp đồng idempotency tại đích ([S07](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html); [S26](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)).

**i. Bằng chứng và điểm chưa xác minh.**
S07-S11 là bằng chứng của Step Functions; không kết luận mọi workflow có callback, quota hoặc cùng execution semantics.
Chưa có test token chờ, approval hết hạn, dừng downstream, mất response sau commit hoặc retry cùng ý định; chưa có lý do để chốt AWS.

### 3.4. Agent Orchestration

**a. Cơ chế và vai trò.**
Orchestration quyết định agent nào chạy và bước tiếp theo bằng model, code hoặc kết hợp; OpenAI Agents SDK minh họa manager gọi specialist qua `as_tool()` và handoff chuyển active agent ([S12](https://openai.github.io/openai-agents-python/multi_agent/)).
Agent-as-tool thường trả kết quả về manager, còn handoff không đồng nghĩa manager tự nhận lại điều khiển; tool guardrails không áp cho chính handoff ([S15](https://openai.github.io/openai-agents-python/handoffs/); [S18](https://openai.github.io/openai-agents-python/guardrails/)).

**b. Ưu điểm - suy luận.**
Phân specialist giúp chia nhiệm vụ theo năng lực; code orchestration giữ luồng rõ, model orchestration hỗ trợ routing mở khi cần.
Đại diện SDK có approval interruptions/pause-resume và trace/usage cho các bước, là primitive hữu ích chứ chưa phải toàn bộ kiểm soát của Lab ([S13](https://openai.github.io/openai-agents-python/human_in_the_loop/); [S14](https://openai.github.io/openai-agents-python/tracing/)).

**c. Nhược điểm - suy luận.**
Thêm agent làm tăng routing, lịch sử truyền tiếp và tình huống regression; flow cố định không tự hưởng lợi từ nhiều agent.
Handoff mặc định chuyển lịch sử, nested app context/approval có thể chia sẻ; phân vai trong prompt không hình thành isolation boundary ([S15](https://openai.github.io/openai-agents-python/handoffs/); [S17](https://openai.github.io/openai-agents-python/context/)).

**d. Khả năng mở rộng.**
SDK minh họa chạy tác vụ độc lập song song; điều đó không bỏ critical path manager-specialist-approval-write hoặc giới hạn state store.
Ví dụ approval server chỉ có store trong một event loop/process, không chứng minh horizontal scale cho production ([S12](https://openai.github.io/openai-agents-python/multi_agent/); [S13](https://openai.github.io/openai-agents-python/human_in_the_loop/)).

**e. Chi phí.**
Đếm model requests, input/output tokens từng agent, số handoff/vòng evaluator, runtime và snapshot/trace storage; SDK có usage tổng hợp nhưng provider có thể trả thiếu.
Delegation có thể thêm lượt gọi và lịch sử, song không được kết luận luôn đắt hơn vì decomposition cũng đổi model/context; **Lab chưa đo** ([S16](https://openai.github.io/openai-agents-python/usage/)).

**f. Bảo mật.**
Tool filters/`is_enabled` không authorize arguments hoặc tài nguyên; quyền phải kiểm ở tool/service, còn snapshot cần integrity/ownership trước deserialize.
Approval không bảo đảm exactly-once; tracing mặc định bật và `trace_include_sensitive_data=True`, nên phải kiểm dữ liệu export chứ không chỉ thêm redaction observer ([S17](https://openai.github.io/openai-agents-python/context/); [S13](https://openai.github.io/openai-agents-python/human_in_the_loop/); [S14](https://openai.github.io/openai-agents-python/tracing/)).

**g. Bảo trì - suy luận.**
Prompt chuyên biệt dễ giới hạn trách nhiệm từng agent nhưng thêm route/contract/eval; paused work cần version marker để phục hồi đúng agent/SDK definitions.
Trace giúp chẩn đoán đường chạy nhưng không tự là audit chống sửa, và usage cần tránh tính lặp qua checkpoint/resume ([S13](https://openai.github.io/openai-agents-python/human_in_the_loop/); [S14](https://openai.github.io/openai-agents-python/tracing/); [S16](https://openai.github.io/openai-agents-python/usage/)).

**h. Độ phù hợp - suy luận.**
Đáng khảo sát khi routing hoặc nhiều vai chuyên trách là nhu cầu thực, có thể nằm phía trên API/MCP tools.
Không thêm multi-agent chỉ để chứng minh SR8: agent thứ hai phải có quyền riêng khi gọi cùng lớp tích hợp, không chỉ là specialist dùng chung quyền manager ([S17](https://openai.github.io/openai-agents-python/context/); [S02, SR8](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md#31-yêu-cầu-bắt-buộc)).

**i. Bằng chứng và điểm chưa xác minh.**
S12-S18 chỉ thuộc một SDK, chưa ghim release; không suy rộng approval/tracing/guardrail semantics sang mọi framework.
Chưa có test handoff lọt dữ liệu, resume cạnh tranh, snapshot giả, thu hồi quyền hoặc chi phí agent; chưa chứng minh nhiều agent tốt hơn một flow cố định.

### 3.5. Event-driven Integration

**a. Cơ chế và vai trò.**
Producer phát sự kiện và consumer phản hồi độc lập; EventBridge bus định tuyến nhiều nguồn/nhiều đích, còn Pipes là một nguồn/một đích với xử lý tùy chọn ([S19](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html)).
Phải tách Custom Event Bus - Classic dùng rules/targets khỏi enhanced Custom mới dùng subscribers/retention, được pricing ghi ra mắt tháng 09/2026 ([S20](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html); [S24](https://aws.amazon.com/eventbridge/pricing/)).

**b. Ưu điểm - suy luận.**
Fan-out giúp audit/notification/consumer độc lập nhận thay đổi mà producer không điều phối từng consumer; Custom mới hỗ trợ retention và subscriber đọc lại theo cơ chế nguồn.
Đây là vai trò sau hoặc ngoài quy trình ghi, có thể kết hợp workflow, không phải approval gate thay thế ([S19](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html); [S20](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html)).

**c. Nhược điểm.**
Classic rule-target có thể bỏ event sau hết retry nếu không có DLQ; mặc định retriable delivery là tối đa 24 giờ và 185 lần theo nguồn, không gán mặc định đó cho Custom mới.
Custom mới có FIFO/UNORDERED, nhưng delivery lỗi có thể giữ các group của subscriber khi retry; FIFO với Lambda `EVENT` chỉ giữ thứ tự tới queue async, không bảo đảm ordered processing ([S21](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html); [S22](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html)).

**d. Khả năng mở rộng.**
Nhiều subscriber cho phép fan-out nhưng tăng số delivery và áp lực consumer; FIFO đánh đổi parallelism lấy thứ tự trong event group.
Không dùng quy mô subscriptions trong quảng bá/pricing làm throughput đã đo; cần đo backlog, tuổi event, retry và tốc độ commit từng consumer ([S22](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html); [S24](https://aws.amazon.com/eventbridge/pricing/)).

**e. Chi phí.**
Classic tính event theo khối 64 KB; Custom mới tính ingress/egress làm tròn 1 KB, thêm storage/evaluation khi cấu hình, và fan-out/retry egress có thể tăng lượng tính phí.
Đếm event/billed blocks hoặc bytes, delivery attempts, retention-time, consumer compute và log; không trộn hai loại bus vào một đơn giá USD/triệu calls, **Lab chưa đo** ([S24](https://aws.amazon.com/eventbridge/pricing/)).

**f. Bảo mật.**
Classic rule-target dùng execution role hoặc resource policy theo target; không khẳng định Lambda/SNS/SQS chỉ hỗ trợ một cách.
Custom mới có identity policy và chia sẻ cross-account qua RAM/resource policy; quyền publish/deliver không chứng minh người dùng được sửa task, nên consumer vẫn cần policy và approval hợp lệ ([S23](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html); [S25](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-access.html)).

**g. Bảo trì - suy luận.**
Phải quản lý event schema, correlation, retry/DLQ/redrive và consumer version; thêm consumer giảm nối trực tiếp nhưng không xóa trách nhiệm vận hành delivery.
Dedup publish của Custom mới có cửa sổ năm phút theo phạm vi nguồn và là exactly-once ingestion, không thay idempotent mutation ở đích hoặc an toàn khi replay muộn ([S20](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html); [S22](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html); [S26](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)).

**h. Độ phù hợp - suy luận.**
Đáng khảo sát cho `TaskUpdated` sau commit để thông báo/audit hoặc nhiều consumer xử lý độc lập.
Không coi bus đã nhận/giao event là kết quả task đã cập nhật; nếu cần xác nhận ghi tức thời phải theo dõi commit ở đích, không dùng delivery receipt thay kết quả nghiệp vụ ([S08](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html); [S26](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)).

**i. Bằng chứng và điểm chưa xác minh.**
S19-S25 chỉ minh họa EventBridge; chưa mở sâu retry policy của Custom mới nên không đưa mặc định retry cho subscribers.
Chưa có test duplicate/replay sau cửa sổ dedup, DLQ/redrive, policy bị thu hồi hoặc publish sau commit bị lỗi; chưa chứng minh không mất event giữa commit và publish.

## 4. Bảng so sánh tổng hợp

Các ô sau tóm tắt mục 3, là suy luận theo cơ chế chứ không phải điểm số hoặc kết quả benchmark.

### 4.1. Lợi ích, giới hạn và mức phù hợp

| Phương pháp | Ưu điểm chính | Nhược điểm chính | Phù hợp khi | Không phù hợp khi |
| --- | --- | --- | --- | --- |
| API/Function Calling | Vòng dispatch do app sở hữu | Adapter/schema/lỗi cần quản lý khi đổi host | Một host, tools ổn định, so đường trực tiếp | Muốn riêng nó giải quyết durable approval hoặc policy; mục 3.1, S03. |
| MCP | Contract discovery/call dùng chung | Version, trust, transport và liên thông cần test | Nhiều host tương thích cần reuse | Không cần liên thông hoặc host chưa tương thích; mục 3.2, S04-S06. |
| Workflow | Tiến độ và chờ duyệt tường minh | Khác biệt execution type, retry/downstream | Luồng cố định, cần durable wait/recovery | Chỉ cần gọi tool đơn giản hoặc tưởng execution là transaction; mục 3.3, S07-S11. |
| Orchestration | Chia specialist và routing | Thêm vòng gọi, history và contract | Nhiều vai thực sự cải thiện nhiệm vụ | Flow cố định chưa chứng minh lợi ích multi-agent; mục 3.4, S12-S18. |
| Event-driven | Fan-out, consumer độc lập | Delivery/replay/ordering cần vận hành | Thông báo thay đổi sau commit | Dùng bus thay approval hoặc commit receipt; mục 3.5, S19-S26. |

### 4.2. Các đánh đổi kỹ thuật

| Phương pháp | Khả năng mở rộng | Chi phí phát sinh | Bảo mật | Bảo trì |
| --- | --- | --- | --- | --- |
| API/Function Calling | Catalog/context, concurrency, quota đích | Tokens, rounds, calls, adapter compute/network | Schema không authorize; app kiểm quyền | Backend/provider mapping, test contract; mục 3.1. |
| MCP | Host reuse khác backend throughput; list có cache | Model, discovery/call, server/auth/log thực có | Auth optional, HTTP scoped; policy đích còn cần | Client/server version, schema, trust, errors; mục 3.2. |
| Workflow | Execution/state quotas, callback và đích | Standard transitions; Express requests/duration/memory | IAM khác quyền người dùng; callback không đủ SR4 | Definition, IAM, retry/catch, logs; mục 3.3. |
| Orchestration | Parallel phần độc lập, state store và critical path | Calls/tokens từng agent, history, snapshots | Shared context/handoff không cô lập quyền | Routes/prompts/evals, paused-state versions; mục 3.4. |
| Event-driven | Fan-out/backlog; FIFO giới hạn xử lý song song | Classic blocks khác Custom mới bytes/storage/egress | Publish/deliver khác quyền sửa bản ghi | Schema, retry/DLQ, consumer/replay; mục 3.5. |

Không ô nào chứng minh latency, độ ổn định hoặc tổng chi phí của Lab; các đại lượng đó vẫn theo M1-M6.

## 5. Đối chiếu với nhu cầu của hệ thống

Nguồn của từng SR dưới đây là [S02, Phần 3, mục 3.1, dòng 220-229](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md#31-yêu-cầu-bắt-buộc), không lấy từ Phần 2.
SR áp cho **tổ hợp triển khai**, không đòi từng phương pháp đứng riêng đáp ứng toàn bộ; hỗ trợ cơ chế không đồng nghĩa đã qua kiểm thử.

| Yêu cầu | Đóng góp của phương pháp | Trách nhiệm ứng dụng/hệ thống đích còn thiếu | Nguồn cơ chế và phép kiểm dự kiến |
| --- | --- | --- | --- |
| SR1 - danh tính và cửa ghi | API/MCP có điểm dispatch; orchestration có local context; workflow/event có ID execution/message | Một đường ghi cưỡng chế, principal từ session tin cậy, nối người-agent-call-effect; không lấy user ID do model tự khai | S03-S06, S14/S17; thử giả actor và đường ghi tắt đều bị chặn. |
| SR2 - luật chạy được | MCP yêu cầu access control; API tool/service có chỗ enforce; IAM giới hạn quyền hạ tầng | Policy thực thi theo actor/action/resource, không phụ thuộc prompt, tool visibility hoặc consent | S05/S06/S11/S17/S23; bỏ prompt quyền, gọi tool trực tiếp và qua handoff vẫn bị từ chối. |
| SR3 - phạm vi quyền | MCP list có thể phụ thuộc authorization; orchestration có context/history controls | Lọc row/field trước model/UI/log, kiểm đúng hành động và bản ghi; không chỉ ẩn tên tool | S05/S15/S17; tài khoản chỉ xem team A không thấy team B hoặc trường cấm qua summary/trace. |
| SR4 - điểm dừng rủi ro | Workflow callback, SDK approval pause/resume, MCP khuyến nghị confirmation | Approval server-side gắn actor/reviewer/action/hash tham số, expiry và version phù hợp; duyệt không mở rộng quyền | S05/S08/S13; sửa arguments sau duyệt, quá hạn hoặc dùng approval của run khác không được ghi. |
| SR5 - fail-closed | SDK có manual approval khi không đọc arguments an toàn; các lớp có đường trả lỗi | Không ghi khi identity/policy/approval thiếu, lỗi hoặc không xác định; không fallback sang quyền rộng | S05/S13/S18; ngắt kho quyền, giả snapshot hoặc timeout policy phải không có effect. |
| SR6 - không tạo hiệu ứng thứ hai | Workflow retry, SDK resume, bus retry/dedup là cơ chế vận chuyển/tiếp tục | Phân biệt chưa gọi với outcome unknown; key ý định ổn định, đích chặn trùng nguyên tử và trả kết quả cũ; reconcile trước retry không an toàn | S07/S13/S22/S26; timeout sau commit, double submit, concurrent resume, cùng key khác payload và replay muộn. |
| SR7 - trace xuyên suốt | SDK trace/usage, workflow history, API/MCP call/error, event correlation | Trace nối actor-decision-approval-effect-cost, giữ coverage và bảo vệ dữ liệu/secret; không xem trace là audit chống sửa sẵn | S03/S05/S07/S14/S16; truy được ai/vì sao/kết quả/chi phí kể cả resume, không lộ trường cấm. |
| SR8 - tái dùng tách quyền | MCP contract liên thông; API library chung; orchestration gọi lại tool từ agent khác | Agent thứ hai có context/quyền riêng, không copy connector hoặc thừa hưởng approval của agent trước | S03/S04/S13/S17; A được ghi, B chỉ đọc, B dùng cùng tool nhưng không ghi bằng approval/state của A. |

**Không có SR nào được đánh dấu đạt ở phiên bản này.**
Single-use approval, snapshot integrity và idempotent external effect là ba trách nhiệm riêng; làm đúng một lớp không chứng minh hai lớp còn lại ([S13](https://openai.github.io/openai-agents-python/human_in_the_loop/)).
Khóa nhận diện ý định phải đi cùng mutation một cách nguyên tử tại đích nếu muốn chống effect thứ hai; một lookup không thấy kết quả chưa đủ chứng minh retry an toàn ([S26](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/); [S13](https://openai.github.io/openai-agents-python/human_in_the_loop/)).

## 6. Tiêu chí lựa chọn

### 6.1. Điều kiện bắt buộc

Các gate áp cho phương án triển khai ở bước Propose/Evaluate sau này, không dùng để loại một cơ chế chỉ vì nó không phải toàn bộ hệ thống.

| Điều kiện | Nguồn yêu cầu | Cách kiểm tra | Hệ quả nếu không đáp ứng |
| --- | --- | --- | --- |
| Mọi ghi mang đúng actor và qua cửa thực thi kiểm soát | SR1 | Gọi trực tiếp/qua agent với principal không quyền; đối chiếu trace | Không đủ an toàn để cho phép ghi. |
| Quyền thi hành được và có row/field/action scope | SR2-SR3 | Bỏ prompt, thay record/field/action; xem cả output/history/log | Không được bù bằng prompt hoặc consent. |
| Risky write chỉ sau approval đúng nội dung còn hạn | SR4 | Đổi arguments/hash, hết hạn, dùng sai run/reviewer | Chặn ghi, yêu cầu quyết định hợp lệ mới. |
| Không biết quyền thì không ghi | SR5 | Policy timeout, identity thiếu, approval/snapshot lỗi | Chặn, không chuyển sang fallback có quyền rộng. |
| Retry không tạo effect thứ hai, outcome unknown được giữ rõ | SR6 | Mất response sau commit, retry song song và rerun cùng key | Chưa đạt điều kiện ghi an toàn; cần sửa hợp đồng đích/recovery. |
| Trace trả lời actor, quyết định, effect, chi phí | SR7 | Truy một run có lỗi/resume và so usage/log | Chưa đủ bằng chứng giải trình hoặc so sánh. |
| Agent thứ hai reuse cùng connector với quyền riêng | SR8 | Hai agent/quyền khác nhau, không sửa connector | Chưa chứng minh reusable asset an toàn. |

Gate 0 duplicate/0 lost của M2 và 0 connector sửa của M6 giữ đúng nguồn [S02, mục 3.2](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md#32-yếu-tố-đánh-giá); không tuyên bố đã qua chỉ vì có idempotency key hoặc interface dùng chung.

### 6.2. Tiêu chí phân biệt các phương án

Chỉ so tradeoff sau khi xác định cách đáp ứng gate; chưa có tổng điểm, trọng số hoặc ngưỡng thắng.

| Khi nhu cầu ưu tiên là | Cơ chế cần tìm | Phương pháp đáng khảo sát | Đánh đổi phải chấp nhận | Bằng chứng còn thiếu |
| --- | --- | --- | --- | --- |
| Một host, ít tool ổn định | Dispatch rõ, contract nội bộ tái dùng | API/Function Calling | Tự quản adapter/state/error | M1/M3/M6 với host thứ hai, mục 3.1. |
| Nhiều host cần cùng công cụ | Discovery/call interoperable | MCP | Version, credentials, trust và transport | Tương thích 2026-07-28 và reuse tách quyền, mục 3.2. |
| Chờ duyệt và phục hồi durable | Persistent progress, callback và retry kiểm soát | Workflow | State definitions, IAM/log và recovery | Approval binding, crash sau write, mục 3.3. |
| Nhiều vai/routing mở là nhu cầu thật | Manager/specialist hoặc handoff có giới hạn | Orchestration | Thêm history, routes, calls và eval | Lợi ích nhiệm vụ so một agent, isolation và usage, mục 3.4. |
| Nhiều consumer phản hồi thay đổi | Fan-out, retention/replay phù hợp | Event-driven | Eventual outcome, backlog và dedup scope | Không mất event, consumer idempotency và DLQ/redrive, mục 3.5. |

Với các phương án đủ gate, ưu tiên độ đúng, sự đơn giản của đường thực thi, độ vững chắc và khả năng bảo trì dài hạn; dùng M1-M6 để làm rõ đánh đổi thay vì coi công sức phát triển thấp là quyết định chính.
Chi phí cần cùng ranh giới: model + dịch vụ + hạ tầng + retry/log thực có trên số thay đổi thành công; thời gian người duyệt được báo riêng, không giấu trong latency công nghệ.
Đây là quy tắc đánh giá của người viết, chưa phải thiết kế baseline hoặc quyết định chọn công nghệ.

## 7. Kết luận so sánh và vấn đề còn mở

### 7.1. Khác biệt quan trọng - tổng hợp của người viết

**Finding 1: reuse giao diện và reuse quyền phải được đo riêng.**
MCP tạo hợp đồng chung, API cũng có thể dùng library chung, nhưng cả hai chỉ tạo reusable asset an toàn khi agent thứ hai bị giới hạn bởi quyền riêng, không thừa hưởng state/approval.
Tiền đề là mục 3.1/3.2/3.4 và SR8, không phải kết quả thử hai agent.

**Finding 2: có chỗ dừng không đồng nghĩa có approval đúng yêu cầu.**
MCP confirmation là khuyến nghị, workflow callback là điểm chờ, SDK approval là primitive; SR4 còn cần binding nội dung và thời hạn do ứng dụng cưỡng chế.
Tiền đề là mục 3.2-3.4 và SR4, chưa có bằng chứng implementation.

**Finding 3: bảo đảm ở tầng điều phối không tự lan xuống effect nghiệp vụ.**
Exactly-once workflow execution, approval resume và exactly-once ingestion nói về các ranh giới khác nhau; SR6 vẫn phụ thuộc key và xử lý nguyên tử/reconciliation tại đích.
Tiền đề là S07/S13/S22/S26; không khẳng định Lab đã chống ghi trùng.

**Finding 4: đơn vị chi phí quyết định cách so, không có một giá gọi chung cho năm phương pháp.**
Tokens/rounds, transitions, duration/memory và ingress/egress/fan-out phải quy về cùng workload và kết quả commit thành công trước khi kết luận kinh tế.
Tiền đề là mục 3, chưa có dữ liệu để xếp phương pháp rẻ nhất hoặc nhanh nhất.

### 7.2. Điều kiện cân nhắc hoặc loại khỏi một vai trò

Không nên dùng MCP làm câu trả lời cho transaction, durable approval hoặc quyền theo bản ghi, vì giao thức không thay trách nhiệm đó của ứng dụng/backend.
Nếu chỉ có một host, catalog ổn định và không có nhu cầu liên thông được kiểm chứng, hãy so lợi ích bổ sung với phần version/auth/vận hành thay vì mặc định MCP tốt hơn đường API trực tiếp.
Nếu host/SDK đích chưa tương thích 2026-07-28, chưa đủ cơ sở chọn MCP theo mô tả đặc tả trong báo cáo này; cần xác minh trước.
Không chọn workflow chỉ để tránh viết dispatch đơn giản; không thêm nhiều agent khi chưa chứng minh nhu cầu phân vai; không dùng event bus thay xác nhận commit hoặc approval gate.
Các điều kiện này loại cách sử dụng sai vai trò, không tuyên bố loại toàn bộ phương pháp khỏi mọi tổ hợp tương lai.

### 7.3. Câu hỏi chuyển sang bước 03

| Câu hỏi/giả thuyết cần kiểm | Khoảng trống bằng chứng | Ảnh hưởng lựa chọn | Cách kiểm chứng dự kiến, chưa thực hiện |
| --- | --- | --- | --- |
| H1: tool contract dùng lại qua agent/host thứ hai mà không sửa connector? | Chưa có host thứ hai, compatibility test | Giá trị thực của MCP/API reuse | Cùng fixture/policy, hai agent quyền khác; đếm sửa connector và M6. |
| H2: cùng gate an toàn, đường API và MCP khác latency/cost thế nào? | Chưa chốt model/transport/config | Tránh xếp hạng theo suy đoán | Giữ backend/tool/task như nhau, thu M1-M3; tách calls discovery và cache. |
| H3: quyền đổi sau approval có chặn effect? | Chưa có approval hash/TTL/revocation | Độ đúng SR2/SR4/SR5 | Thu hồi quyền, đổi arguments/record version và submit approval quá hạn. |
| H4: timeout sau commit có được xử lý không tạo effect thứ hai? | Đích chưa có atomic idempotency/reconcile | Khả năng đạt SR6 | Mất response, crash trước checkpoint, concurrent resume và cùng key khác payload. |
| H5: durable wait giảm lỗi recovery so state app thế nào? | Chưa có triển khai hoặc baseline | Vai trò workflow so phần tự quản | Tạm dừng, restart, callback lặp và hủy downstream; đối chiếu effect/trace. |
| H6: specialist cải thiện tác vụ đủ để bù vòng gọi/history? | Chưa có task set/eval chung | Có cần orchestration nhiều agent | So một agent với phân vai trên cùng task set; ghi quality, M1/M3 và dữ liệu lộ qua handoff. |
| H7: event sau commit có bị mất hoặc xử lý lại sai khi replay? | Chưa có hợp đồng commit-publish/consumer | Có nên thêm event-driven, dùng loại bus nào | Gây lỗi publish, hết retry, redrive/replay muộn; đo lost/duplicate/backlog. |
| H8: catalog/agent tăng 10 lần ảnh hưởng đâu? | Chưa có tải và SDK ghim version | Scale thực của từng lớp | Tăng dần tool/agent, đo M4, context, auth/store/backend và lỗi. |
| H9: trace đủ giải trình mà không lộ dữ liệu? | Chưa có retention/export/redaction policy | Khả năng đạt SR3/SR7 | Kiểm tool output, history, snapshot và exporter cả khi redaction lỗi. |

Chỉ sau Question và kiểm tra nền bằng chứng mới đề xuất phạm vi thử nghiệm/ADR; nghiên cứu này chưa tạo Experimental Evidence.
Giá trị hiện có là Research Finding về ranh giới cơ chế và bộ tiêu chí có thể tái dùng; Reusable Asset chạy được và kết quả nghiệm thu vẫn chờ các bước sau.

## Tài liệu tham khảo

### Danh mục nguồn

Ngày kiểm tra nguồn ngoài ghi nhận trong ba research notes là **2026-11-13**; đây là ngày truy cập, không phải ngày phát hành.
Các trang live chưa có snapshot/commit ghim; riêng MCP ghim phiên bản 2026-07-28.

| Mã | Tên và URL gốc | Phiên bản/phạm vi | Vị trí hỗ trợ |
| --- | --- | --- | --- |
| S01 | [Chương trình AgentLize R&D - TXT](../program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt), [PDF gốc](../program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.pdf) | Chương trình 2026, trang 5-6 | TXT dòng 151-240: Compare, năm phương pháp, Lab, nghiệm thu. |
| S02 | [Bước 0, Phần 3](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md#phần-3---yêu-cầu-và-đánh-giá) | Chỉ Phần 3 đã review; file tổng thể review một phần | Dòng 203-253: SR1-SR8, M1-M6; không dùng Phần 2. |
| S03 | [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling) | Live, đại diện OpenAI | Tool calling flow, Formatting results, Strict mode, Token Usage. |
| S04 | [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture) | 2026-07-28 | Core components, stateless, capabilities, design principles. |
| S05 | [MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) | 2026-07-28 | Listing/calling, schema, stateful tools, errors, security. |
| S06 | [MCP Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) | 2026-07-28, HTTP scoped | Introduction, requirements, token usage/error handling. |
| S07 | [Choosing workflow type](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html) | Live, Step Functions | Standard/Express semantics, duration, history. |
| S08 | [Service integration patterns](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) | Live, Step Functions | Request Response, sync, callback token và cancellation. |
| S09 | [Step Functions pricing](https://aws.amazon.com/step-functions/pricing/) | Live, không dùng đơn giá USD | Transitions, retry, requests, duration/memory. |
| S10 | [Step Functions quotas](https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html) | Live | Account/Region, API và state transitions. |
| S11 | [IAM policies for integrations](https://docs.aws.amazon.com/step-functions/latest/dg/service-integration-iam-templates.html) | Live | Static/dynamic resources, sync monitoring/cancel. |
| S12 | [Multi-agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/) | Live, Agents SDK Python | Code/LLM orchestration, manager/as-tool, handoff. |
| S13 | [Human in the loop](https://openai.github.io/openai-agents-python/human_in_the_loop/) | Live, Agents SDK Python | Interruptions, snapshot ownership, replay và external effects. |
| S14 | [Tracing](https://openai.github.io/openai-agents-python/tracing/) | Live, Agents SDK Python | Default tracing, sensitive data, exporter/redaction. |
| S15 | [Handoffs](https://openai.github.io/openai-agents-python/handoffs/) | Live, Agents SDK Python | Transfer, input/history filters, authorization hook. |
| S16 | [Usage](https://openai.github.io/openai-agents-python/usage/) | Live, Agents SDK Python | Request/token totals, per-run/per-request caveats. |
| S17 | [Context management](https://openai.github.io/openai-agents-python/context/) | Live, Agents SDK Python | Local context, shared state, tool filters vs authorization. |
| S18 | [Guardrails](https://openai.github.io/openai-agents-python/guardrails/) | Live, Agents SDK Python | Handoff/tool/input guardrail boundaries. |
| S19 | [What is EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html) | Live | Event architecture, bus/Pipes, Classic routing. |
| S20 | [Custom event buses](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html) | Live, Custom mới và Classic | Subscribers/retention khác rules/targets. |
| S21 | [Retry policy and DLQ](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html) | Live, Classic rule-target | Retry exhaustion, dropped events, DLQ. |
| S22 | [Ordering and deduplication](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html) | Live, Custom mới | FIFO/UNORDERED, Lambda handoff, dedup scope/window. |
| S23 | [EventBridge resource policies](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html) | Live, rule-target | Execution roles/resource policies theo target. |
| S24 | [EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/) | Live, phân biệt hai loại bus | September 2026, units ingress/egress/storage/evaluation. |
| S25 | [Custom bus access](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-access.html) | Live, Custom mới | Identity policy, cross-account RAM/resource policy. |
| S26 | [Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | AWS Builders' Library | Caller-provided request ID, timeout ambiguity, atomic mutation. |

### Trích ngắn và giới hạn khẳng định

Bảng này lưu **16 khẳng định có trích ngắn từ ghi chú nguồn**, không tuyên bố 16 phép kiểm tự động đã chạy hoặc đã khớp lại trong phiên tổng hợp.
Khi kiểm lại cần chuẩn hóa whitespace/formatting; nội dung trích không chứng minh triển khai Lab đáp ứng yêu cầu.

| Mã | Khẳng định được hỗ trợ | Trích ngắn nguyên văn | Nguồn/vị trí và giới hạn |
| --- | --- | --- | --- |
| Q01 | App thực thi function call | “Execute code on the application side with input from the tool call” | [S03](https://platform.openai.com/docs/guides/function-calling), tool flow; không nói model tự thực thi. |
| Q02 | Schema có chi phí context | “callable function definitions count against the model's context limit and are billed as input tokens.” | [S03](https://platform.openai.com/docs/guides/function-calling), Token Usage; phạm vi OpenAI. |
| Q03 | MCP bản này stateless | “MCP is a stateless protocol: every request is self-contained and carries its own protocol version and capabilities.” | [S04](https://modelcontextprotocol.io/specification/2026-07-28/architecture), mở đầu; không suy ra backend stateless. |
| Q04 | List có pagination/cache | “This operation supports pagination and caching.” | [S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), Listing Tools; không phải benchmark. |
| Q05 | Không có UI bắt buộc chung | “the protocol itself does not mandate any specific user interaction model.” | [S05](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), User Interaction Model; không bảo đảm confirmation. |
| Q06 | Authorization không bắt buộc chung | “Authorization is OPTIONAL for MCP implementations.” | [S06](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), Protocol Requirements. |
| Q07 | Luồng auth có phạm vi HTTP | “This specification defines the authorization flow for HTTP-based transports.” | [S06](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), Purpose and Scope. |
| Q08 | Exactly-once ở lớp workflow | “Exactly-once workflow execution” | [S07](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), Standard; không phải exactly-once effect. |
| Q09 | Express hạn chế integration pattern | “Express Workflows only support Request Response integrations.” | [S08](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html), phạm vi Step Functions. |
| Q10 | Retry được tính transitions | “You are charged for the total number of state transitions across all your state machines, including retries.” | [S09](https://aws.amazon.com/step-functions/pricing/), Standard; không phải tổng chi phí Lab. |
| Q11 | Orchestration nói về flow agent | “Orchestration refers to the flow of agents in your app.” | [S12](https://openai.github.io/openai-agents-python/multi_agent/), mở đầu. |
| Q12 | Approval không bảo đảm một lần | “Approval permits a tool call to execute; it does not guarantee exactly-once execution.” | [S13](https://openai.github.io/openai-agents-python/human_in_the_loop/), crash recovery. |
| Q13 | Trace mặc định bật | “Tracing is enabled by default.” | [S14](https://openai.github.io/openai-agents-python/tracing/), mở đầu; không đồng nghĩa không lộ dữ liệu. |
| Q14 | Classic dùng rules/targets | “Custom Event Bus - Classic routes events using rules and targets that you write.” | [S19](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html), Classic; không áp cho subscribers mới. |
| Q15 | Custom mới tách ordering/dedup | “Ordering is a property of a subscriber. Deduplication happens when you publish.” | [S22](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html); không bảo đảm business effect. |
| Q16 | Idempotency có request ID từ caller | “At Amazon, our preferred approach is to incorporate a unique caller-provided client request identifier into our API contract.” | [S26](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/); đích vẫn cần xử lý nguyên tử. |
