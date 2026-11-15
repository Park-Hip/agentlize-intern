# Workflow Engine và Event-driven Integration cho AI Operations Connector Lab

Ngày kiểm tra: 2026-11-13.
Owner: phiên nghiên cứu Workflow/Event được giao bởi phiên tổng hợp; người phụ trách artifact của Lab: Phạm Bách Hiệp.
Trạng thái: ghi chú nghiên cứu để tổng hợp, chưa phải quyết định kiến trúc hoặc kết quả thực nghiệm.
Definition of done: đủ bảy trục so sánh, nguồn gốc đã mở trực tiếp, phân biệt loại workflow và loại bus, không suy diễn bảo đảm ghi nghiệp vụ từ bảo đảm thực thi.
Phạm vi: AWS Step Functions và Amazon EventBridge là ví dụ cụ thể để kiểm tra mô hình, không đại diện mọi workflow engine hoặc event broker.
Không dùng bản thảo chưa duyệt trong repository làm bằng chứng.

## 1. Mô hình giải quyết việc gì và bảo đảm thực thi đến đâu?

### Takeaway

Workflow engine giữ trình tự và trạng thái của một quy trình; event-driven integration kết nối thành phần qua việc phát và nhận sự kiện.
Hai cách có thể kết hợp, không phải hai lựa chọn loại trừ nhau: Step Functions có thể được kích hoạt bởi EventBridge và có tích hợp EventBridge trong workflow. [S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), [S2](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)

### Cited Findings

- Step Functions Standard phù hợp quy trình durable, chạy tối đa một năm; lịch sử có thể truy xuất đến 90 ngày sau khi kết thúc.
  Standard được AWS mô tả là exactly-once workflow execution, nhưng task/state có thể chạy lại nếu khai báo `Retry`. [S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html)
- Asynchronous Express là at-least-once workflow execution; Synchronous Express là at-most-once workflow execution.
  Express tối đa năm phút, không tự quản lý idempotency như Standard và cần bật CloudWatch Logs để có lịch sử thực thi. [S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html)
- Standard hỗ trợ Request Response, `.sync` và `.waitForTaskToken` tùy dịch vụ; Express chỉ hỗ trợ Request Response.
  Callback task có thể đợi phê duyệt của người dùng; task token phải được trả bởi principal trong cùng AWS account.
  Request Response chỉ đợi phản hồi HTTP, không đồng nghĩa công việc downstream đã hoàn tất. [S2](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)
- Dừng workflow `.sync` chỉ kéo theo nỗ lực hủy tác vụ theo best effort; dịch vụ downstream vẫn có thể tiếp tục chạy và phát sinh phí. [S2](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)
- EventBridge mô tả kiến trúc hướng sự kiện là các thành phần loosely coupled phát và phản hồi sự kiện.
  Bus định tuyến nhiều nguồn tới nhiều đích; Pipes dành cho một nguồn tới một đích với xử lý tùy chọn. [S4](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html)
- Tài liệu hiện hành phân biệt Custom Event Bus mới, dùng subscribers và retention, với Custom Event Bus - Classic, dùng rules và targets.
  Pricing ghi bản enhanced Custom ra mắt tháng 09/2026; không được trộn giá hoặc delivery semantics giữa hai loại. [S5](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html), [S7](https://aws.amazon.com/eventbridge/pricing/)
- Với giao nhận rule-target của Classic, mặc định lỗi retriable được thử lại trong 24 giờ và tối đa 185 lần, exponential backoff và jitter.
  Khi hết retry mà vẫn không giao được thì sự kiện bị bỏ; DLQ là cấu hình cần thêm để thu nhận sự kiện giao thất bại.
  Đây là phạm vi rule-target của Classic, không phải mặc định chung cho subscriber của Custom mới. [S6](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html), [S5](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html)
- Custom mới có subscriber `UNORDERED` hoặc `FIFO`; FIFO giữ thứ tự trong event group.
  Một delivery thất bại có thể giữ lại mọi group trên subscriber trong lúc retry, không chỉ group của sự kiện lỗi.
  Với Lambda `EVENT`, thứ tự chỉ bảo đảm đến bước bàn giao vào hàng đợi async của Lambda; tài liệu yêu cầu `REQUEST_RESPONSE` nếu muốn ordered processing. [S12](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html)
- Custom mới hỗ trợ deduplication khi publish bằng content hoặc `DeduplicationId`, trong cửa sổ năm phút và phạm vi account/group được tài liệu quy định.
  Tài liệu gọi đó là exactly-once ingestion, không phải giao dịch ghi nghiệp vụ xuyên mọi hệ thống. [S12](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html)
- AWS Builders' Library chỉ rõ timeout có thể khiến bên gọi không biết tài nguyên đã được tạo hay chưa.
  Cách AWS ưu tiên là client request identifier do caller cấp; ghi token và mutation liên quan phải atomic để tránh ghi dữ liệu nhưng chưa ghi token hoặc ngược lại. [S11](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)

### Inferences

- Không diễn giải exactly-once của Standard hoặc at-most-once của Synchronous Express thành bảo đảm at-most-once business side effect.
  Đây là bảo đảm ở lớp workflow; retry task, hai execution do hai request nghiệp vụ, retry bên SDK, hoặc đích đã commit nhưng mất response vẫn cần hợp đồng tại đích. [Cơ sở S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), [S11](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- Đề xuất giả thuyết an toàn để Lab kiểm thử: mỗi thao tác ghi đã duyệt mang một idempotency key ổn định, giữ nguyên qua retry/rerun/replay của cùng ý định; bên nhận lưu key cùng thay đổi nghiệp vụ một cách atomic nếu có thể.
  Cùng key nhưng payload khác phải bị từ chối thay vì âm thầm ghi ý định mới; TTL của key phải xét cửa sổ retry/replay chứ không mặc nhiên lấy cửa sổ dedup năm phút của bus. [Cơ sở S11](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/), [S12](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html)
- Sự kiện đã được bus nhận hoặc đã giao cho target không nên được trình bày là bằng chứng task list đã cập nhật thành công.
  Lab cần quan sát kết quả commit ở đích và liên kết nó với request nghiệp vụ. [Cơ sở S2](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html), [S11](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)

### Gaps

- Chưa đo duplicate write, latency hoặc tỷ lệ thành công trong Lab.
- Chưa xác định API của task list có hỗ trợ atomic idempotency hoặc conditional update không.
- Không mở sâu retry policy của Custom mới; không gán con số 24 giờ/185 lần hoặc bất kỳ mặc định retry mới nào cho nó.

## 2. So sánh theo đủ bảy trục để đưa vào báo cáo

### Takeaway

Workflow nổi bật khi trình tự, trạng thái chờ và kiểm toán là trung tâm; event-driven nổi bật khi cần phân phối thay đổi cho các consumer độc lập.
Nhận định phù hợp dưới đây là suy luận có điều kiện từ tài liệu, không phải lựa chọn stack hay kết quả benchmark. [S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), [S4](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html)

### Cited Findings

| Trục | Workflow Engine: Step Functions | Event-driven Integration: EventBridge |
| --- | --- | --- |
| 1. Ưu điểm | Trạng thái bền vững, lịch sử thực thi của Standard, chờ callback cho human approval giúp biểu diễn tiến độ quy trình rõ ràng. [S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), [S2](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) | Tách producer/consumer, định tuyến nhiều nguồn tới nhiều đích; Custom mới thêm retention và subscriber có thể pause/resume, bắt đầu từ quá khứ. [S4](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html), [S5](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html) |
| 2. Nhược điểm | Khác biệt Standard/Express ảnh hưởng duration, callback và log; workflow type không sửa được sau khi tạo; việc dừng `.sync` không bảo đảm hủy downstream. [S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), [S2](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) | Classic có thể bỏ event sau hết retry nếu không có DLQ; FIFO của Custom mới có rủi ro một delivery lỗi giữ các group khác của subscriber; dedup publish chỉ trong cửa sổ quy định. [S6](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html), [S12](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html) |
| 3. Khả năng mở rộng | Có quota theo account/Region cho API và state transitions; Express không bị quota state transitions như Standard nhưng không có nghĩa mọi API hay downstream đều vô hạn; tài khoản mới có quota state transitions thấp hơn. [S9](https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html) | Bus phù hợp nhiều nguồn/nhiều đích; pricing mô tả Custom mới ở quy mô 10.000+ subscriptions, nhưng đó không phải throughput đã đo; UNORDERED song song hóa delivery, FIFO đánh đổi thứ tự với việc chờ retry. [S4](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html), [S7](https://aws.amazon.com/eventbridge/pricing/), [S12](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html) |
| 4. Chi phí | Standard tính state transitions gồm retry; Express tính requests và duration theo bộ nhớ, duration làm tròn 100 ms và bộ nhớ theo khối 64 MB; còn phí dịch vụ được gọi và data transfer. [S3](https://aws.amazon.com/step-functions/pricing/) | Classic tính event theo khối 64 KB; Custom mới tính ingress/egress theo dữ liệu làm tròn 1 KB, cộng storage và evaluation khi cấu hình; retry egress và fan-out xuất hiện trong ví dụ tính phí của Custom mới; API destinations có phí riêng. [S7](https://aws.amazon.com/eventbridge/pricing/) |
| 5. Bảo mật | Static resource giúp IAM scope hẹp; resource động qua input có thể làm policy tự sinh thành `Resource: "*"`; `.sync` cần quyền theo dõi/hủy bổ sung; callback token không thay thế kiểm tra quyền nghiệp vụ. [S10](https://docs.aws.amazon.com/step-functions/latest/dg/service-integration-iam-templates.html), [S2](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) | Rule-target cần đúng execution role hoặc resource policy theo loại target; Lambda/SNS/SQS hiện hỗ trợ cả hai, không được khẳng định chỉ resource policy; Custom mới dùng identity policy và hỗ trợ chia sẻ cross-account qua RAM hoặc resource policy. [S8](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html), [S13](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-access.html) |
| 6. Bảo trì | Standard có execution history hỗ trợ điều tra; Express cần cấu hình log; IAM polling thiếu có thể làm `.sync` bị kẹt dù đường event thường thành công, nên phải kiểm tra cả nhánh lỗi. [S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), [S10](https://docs.aws.amazon.com/step-functions/latest/dg/service-integration-iam-templates.html) | Phải cấu hình và vận hành retry/DLQ cho Classic; Custom mới có khác biệt subscriber, ordering và dedup cần quản lý rõ thay vì tái sử dụng giả định Classic; producer/consumer có thể được tách nhưng không loại bỏ trách nhiệm vận hành delivery. [S5](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html), [S6](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html), [S12](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html) |
| 7. Tình huống phù hợp | Suy luận: quy trình đọc dữ liệu, kiểm tra quyền, đề xuất, chờ phê duyệt rồi mới ghi phù hợp để khảo sát khả năng state/callback; không có bằng chứng rằng phải chọn AWS hoặc Standard. [Cơ sở S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), [S2](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) | Suy luận: phát `TaskUpdated` sau commit cho audit/notification/consumer độc lập là ca khảo sát tự nhiên; không dùng bus đơn thuần thay cho approval gate hoặc xác nhận cập nhật đồng bộ. [Cơ sở S4](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html), [S11](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) |

### Inferences

- Chi phí không thể so bằng một con số USD/triệu lần gọi chung: hai phía có đơn vị tính khác nhau và còn downstream, log, lưu trữ, retry, fan-out.
  Nếu đưa giá minh họa vào báo cáo: ví dụ Standard trên pricing ghi US East (N. Virginia) là 0,000025 USD/state transition và 4.000 transitions miễn phí mỗi tháng; ví dụ Classic ghi custom ingress 1 USD/triệu events với mỗi event không quá 64 KB; đây là giá ví dụ trên nguồn, không phải chi phí Lab hay giá mọi Region. [S3](https://aws.amazon.com/step-functions/pricing/), [S7](https://aws.amazon.com/eventbridge/pricing/)
- Đối với Lab, tách quyền hạ tầng gọi dịch vụ khỏi quyền người dùng được sửa task cụ thể.
  IAM execution role hoặc quyền publish không tự chứng minh người dùng đã duyệt đúng nội dung ghi; cần kiểm thử ở ranh giới nghiệp vụ thay vì xem có role hợp lệ là đủ. [Cơ sở S8](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html), [S10](https://docs.aws.amazon.com/step-functions/latest/dg/service-integration-iam-templates.html)
- Bài kiểm thử đề xuất, chưa thực hiện: mất response sau commit, duplicate request cùng key, rerun cùng ý định, cùng key khác payload, replay sau cửa sổ dedup, quyền bị thu hồi trước ghi, phê duyệt hết hạn, target lỗi tới hết retry và redrive DLQ.
  Các bài này nhắm trực tiếp các rủi ro timeout/idempotency, token chờ và delivery failure đã được nguồn chỉ ra. [Cơ sở S2](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html), [S6](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html), [S11](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)

### Gaps

- Không có số đo throughput, p50/p95 latency, stability hoặc tổng chi phí cho workload của Lab.
- Chưa có Region, event size distribution, fan-out, tỷ lệ retry, retention, log volume hoặc số state transitions thực tế để lập dự toán.
- Chưa có bằng chứng thực nghiệm về công sức bảo trì; bảng chỉ mô tả các trách nhiệm kỹ thuật được suy ra từ hành vi nguồn.

## 3. Trích dẫn ngắn nào có thể kiểm chứng và điểm nào cần giữ thận trọng?

### Takeaway

Các quote sau được sao từ những trang gốc đã mở trong phiên này.
Chúng dùng để kiểm tra nguồn tái lập, không được mở rộng phạm vi từ workflow sang giao dịch nghiệp vụ hoặc từ Classic sang Custom mới.

### Cited Findings

| ID | Quote nguyên văn ngắn | URL gốc đã mở |
| --- | --- | --- |
| Q1 | `Exactly-once workflow execution` | https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html |
| Q2 | `At-most-once workflow execution` | https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html |
| Q3 | `Express Workflows only support Request Response integrations.` | https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html |
| Q4 | `The tokens won't work if you send them from principals in a different AWS account.` | https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html |
| Q5 | `You are charged for the total number of state transitions across all your state machines, including retries.` | https://aws.amazon.com/step-functions/pricing/ |
| Q6 | `Custom Event Bus - Classic routes events using rules and targets that you write.` | https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html |
| Q7 | `If an event isn't delivered after all retry attempts are exhausted, the event is dropped and EventBridge doesn't continue to process it.` | https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html |
| Q8 | `an enhanced Custom event bus launched in September 2026` | https://aws.amazon.com/eventbridge/pricing/ |
| Q9 | `Ordering is a property of a subscriber. Deduplication happens when you publish.` | https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html |
| Q10 | `At Amazon, our preferred approach is to incorporate a unique caller-provided client request identifier into our API contract.` | https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/ |

### Inferences

- Khi kiểm tra quote từ HTML phải loại thẻ hoặc normalize khoảng trắng; Q6 có chữ liên kết trong câu nên tìm raw HTML nguyên chuỗi có thể không khớp dù câu hiển thị đúng.
- Đối với tổng hợp, ưu tiên diễn đạt “AWS mô tả exactly-once workflow execution” thay vì “workflow bảo đảm chỉ ghi một lần”. [S1](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html), [S11](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- Không viết “EventBridge không có ordering” một cách tuyệt đối vì Custom mới có FIFO theo group; cũng không viết “EventBridge dedup nên không cần idempotency” vì dedup publish có cửa sổ/phạm vi và không thay thế atomic mutation tại đích. [S12](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html), [S11](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)

### Gaps

- Các trang live có thể thay đổi sau ngày kiểm tra; ghi chú này không chứa snapshot/hash của toàn bộ nguồn.
- Chưa xác minh ngày phát hành của mọi tính năng ngoài mốc September 2026 được pricing ghi rõ.
- Không suy rộng kết luận từ một nhà cung cấp sang mọi workflow engine hay broker.
