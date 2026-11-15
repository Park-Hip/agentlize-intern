# So sánh phương án

## 1. Bài toán và phạm vi

AI Operations Connector Lab dự kiến có hai hệ thống giả lập: danh bạ nhân viên và danh sách công việc.
Một agent cần đọc dữ liệu, kiểm tra quyền, đề xuất cập nhật và chỉ ghi sau khi được xác nhận.
Lab cũng cần so sánh hai cách tích hợp và chứng minh agent thứ hai có thể dùng lại công cụ.

Tài liệu này so sánh năm phương pháp cần khảo sát theo [chương trình R&D, trang 5-6](../program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt).
Chúng giải quyết những vai trò khác nhau, không nhất thiết là năm kiến trúc hoàn chỉnh thay thế nhau.
Ví dụ, một phương án có thể dùng MCP để cung cấp tool và dùng workflow để quản lý các bước chờ duyệt.

Các nhận định về mức phù hợp là phân tích để thảo luận, không phải kết quả benchmark.
Chưa có dữ liệu Lab để kết luận phương pháp nào nhanh hơn, rẻ hơn hoặc an toàn hơn.

## 2. Phân tích từng phương pháp

### 2.1. API / Function Calling

**Cơ chế:** Ứng dụng cung cấp định nghĩa function cho model.
Model có thể đề xuất gọi function cùng tham số; ứng dụng kiểm tra và thực thi lời gọi, sau đó trả kết quả về cho model.
Đây là ví dụ về [function calling của OpenAI](https://platform.openai.com/docs/guides/function-calling), không phải mô tả bắt buộc cho mọi nhà cung cấp.

**Vai trò trong Lab:** Ứng dụng có thể cho agent gọi các function đọc nhân viên và công việc, sau đó đề xuất cập nhật.
Đường gọi trực tiếp là một phương án đáng khảo sát khi so sánh với MCP.

**Trade-off:** Luồng thực thi nằm trong ứng dụng nên dễ xác định nơi chuyển lời gọi tới hệ thống nghiệp vụ.
Đổi lại, ứng dụng cần quản lý định nghĩa tool, chuyển đổi dữ liệu, xử lý lỗi và khả năng dùng lại khi thêm agent hoặc ứng dụng khác.
Mức công việc thực tế phụ thuộc cách tổ chức thư viện và các hệ thống được kết nối.

**Ranh giới:** Function call hợp lệ về định dạng không đồng nghĩa người yêu cầu có quyền thực hiện.
Ứng dụng hoặc hệ thống đích vẫn phải kiểm tra authorization, approval và các điều kiện ghi.

**Cần kiểm chứng:** Agent thứ hai có dùng lại cùng phần kết nối mà không cần sửa nó không?
Việc thay model hoặc API nghiệp vụ ảnh hưởng những phần nào?

### 2.2. MCP

**Cơ chế:** Ứng dụng AI sử dụng MCP client kết nối với MCP server.
Server có thể công bố danh sách tool để client tìm thấy, gọi là *tool discovery*, và nhận yêu cầu gọi tool.
Logic nghiệp vụ vẫn có thể nằm trong hệ thống phía sau server.

**Vai trò trong Lab:** MCP đáng khảo sát như một cách cung cấp bộ tool chung cho nhiều agent hoặc ứng dụng AI có client tương thích.
Nó có thể là một trong hai đường tích hợp được đem so sánh, nhưng chưa được chọn trong tài liệu này.

**Trade-off:** Hợp đồng giao tiếp chung tạo cơ sở cho khả năng liên thông và dùng lại.
Đổi lại, cần quản lý tính tương thích client/server, kết nối, danh tính và quyền truy cập.
Lợi ích dùng lại cụ thể cần được kiểm chứng với các client và tool thực tế.

**Ranh giới:** MCP không tự quyết định agent nào được sửa task nào.
Authorization theo người dùng và dữ liệu, approval, cùng việc chống ghi trùng vẫn cần được thiết kế và kiểm thử ở các thành phần phù hợp.

**Cần kiểm chứng:** Agent thứ hai có dùng lại tool mà không sửa connector không?
Hai agent có quyền khác nhau có bị giới hạn đúng khi gọi cùng tool không?

### 2.3. Workflow Engine

**Cơ chế:** Workflow engine quản lý trình tự và trạng thái các bước trong một quy trình.
Tùy sản phẩm và cấu hình, engine có thể hỗ trợ chờ kết quả bên ngoài, retry hoặc tiếp tục sau gián đoạn.

**Vai trò trong Lab:** Một workflow có thể biểu diễn luồng đọc dữ liệu, kiểm quyền, đề xuất thay đổi, chờ approval và ghi kết quả.
Nó đáng khảo sát nếu cần theo dõi trạng thái chờ hoặc phục hồi quy trình sau lỗi.

**Trade-off:** Các bước và trạng thái trở nên rõ ràng hơn, nhưng cần quản lý thêm định nghĩa workflow, cấu hình, lỗi và thành phần vận hành.
Lợi ích so với quản lý trạng thái trong ứng dụng cần được đánh giá theo nhu cầu thực tế.

**Ranh giới:** Một bước chờ không tự đảm bảo người duyệt đúng quyền hoặc nội dung ghi đúng với nội dung đã duyệt.
Retry ở tầng workflow cũng không tự đảm bảo hệ thống đích không ghi trùng.

**Cần kiểm chứng:** Sau khi khởi động lại hoặc nhận phản hồi duyệt lặp, quy trình có tiếp tục đúng và không tạo thêm thay đổi ngoài ý muốn không?

### 2.4. Agent Orchestration

**Cơ chế:** Orchestration quyết định agent hoặc tool nào tham gia và bước nào diễn ra tiếp theo.
Luồng điều phối có thể do code quy định, do model đề xuất hoặc kết hợp cả hai.

**Vai trò trong Lab:** Có thể dùng để phân việc, ví dụ một agent tìm thông tin nhân viên và một agent xử lý công việc.
Tuy nhiên, yêu cầu chứng minh agent thứ hai dùng lại tool không nhất thiết đồng nghĩa phải dùng hệ thống multi-agent phức tạp.

**Trade-off:** Phân vai có thể giúp tổ chức các nhiệm vụ khác nhau, nhưng thêm lời gọi model, dữ liệu trao đổi, đường lỗi và trường hợp cần kiểm thử.
Cần so sánh với một agent hoặc luồng cố định trên cùng tác vụ trước khi kết luận lợi ích.

**Ranh giới:** Phân vai bằng prompt không tự tạo ranh giới bảo mật.
Quyền và dữ liệu được chia sẻ giữa các agent cần được kiểm soát tại ứng dụng và tool.

**Cần kiểm chứng:** Phân vai có cải thiện kết quả đủ để bù độ phức tạp, latency và cost không?
Agent có nhận hoặc chuyển dữ liệu vượt quyền không?

### 2.5. Event-driven Integration

**Cơ chế:** Một thành phần phát sự kiện khi có thay đổi; một hoặc nhiều thành phần nhận sự kiện và xử lý theo trách nhiệm của mình.
Các bên phát và nhận không cần gọi trực tiếp từng chức năng của nhau cho mỗi phản ứng.

**Vai trò trong Lab:** Sau khi cập nhật task thành công, hệ thống có thể phát sự kiện để các thành phần khác ghi nhận hoặc gửi thông báo.
Đây là vai trò bổ sung, không phải cách thay thế bước approval trước khi ghi.

**Trade-off:** Có thể thêm bên nhận độc lập, nhưng cần quản lý định dạng sự kiện, theo dõi xử lý, retry và trường hợp xử lý trùng.
Khi có nhiều bên nhận, số lần xử lý và phần vận hành cũng có thể tăng.

**Ranh giới:** Việc gửi hoặc nhận sự kiện không tự chứng minh task đã được cập nhật thành công hoặc mọi bên nhận đã xử lý xong.
Quyền phát sự kiện cũng không tự chứng minh người yêu cầu có quyền sửa task.

**Cần kiểm chứng:** Nếu phát sự kiện thất bại sau khi ghi, hoặc cùng sự kiện được xử lý lại, hệ thống có nhận biết và phục hồi đúng không?

## 3. So sánh tổng hợp

### 3.1. Vai trò và trade-off

| Phương pháp | Vai trò chính | Điểm mạnh đáng khảo sát | Giới hạn chính |
| --- | --- | --- | --- |
| API / Function Calling | Model đề xuất gọi function; ứng dụng thực thi. | Đường gọi trực tiếp, ứng dụng kiểm soát việc thực thi. | Cần quản lý tích hợp và kiểm soát nghiệp vụ trong ứng dụng hoặc hệ thống đích. |
| MCP | Cung cấp giao diện chung để tìm và gọi tool. | Tạo cơ sở dùng lại tool giữa các client tương thích. | Cần quản lý tương thích và quyền; không thay logic nghiệp vụ. |
| Workflow Engine | Quản lý trình tự và trạng thái quy trình. | Hỗ trợ biểu diễn luồng nhiều bước, chờ và phục hồi tùy công cụ. | Thêm thành phần vận hành; không tự đảm bảo ghi không trùng. |
| Agent Orchestration | Điều phối agent, tool và các bước. | Hữu ích khi phân vai hoặc định tuyến thực sự cần thiết. | Tăng độ phức tạp và không tự cô lập quyền giữa các agent. |
| Event-driven Integration | Phát và xử lý sự kiện giữa các thành phần. | Nhiều bên có thể phản ứng độc lập với một thay đổi. | Cần xử lý retry, duplicate và theo dõi kết quả từng bên nhận. |

### 3.2. Các khía cạnh đánh giá

| Phương pháp | Khả năng mở rộng | Chi phí cần xem | Security | Maintainability |
| --- | --- | --- | --- | --- |
| API / Function Calling | Số tool, agent và tải lên hệ thống đích ảnh hưởng thế nào? | Lượt gọi model, hệ thống đích và hạ tầng ứng dụng. | Kiểm tra identity và authorization trước khi thực thi. | Thay API hoặc model ảnh hưởng function và phần chuyển đổi nào? |
| MCP | Thêm client hoặc tool có thực sự dùng lại được server không? | Lượt gọi model, kết nối, server và vận hành thực tế. | Bảo vệ kết nối và kiểm quyền theo hành động, dữ liệu. | Quản lý tương thích client/server và thay đổi tool. |
| Workflow Engine | Số quy trình chạy đồng thời và đang chờ ảnh hưởng thế nào? | Lượt chạy, thời gian hoặc bước xử lý tùy công cụ. | Kiểm quyền tại các bước và xác thực approval. | Cập nhật luồng, xử lý lỗi và theo dõi trạng thái. |
| Agent Orchestration | Thêm agent có tăng tải hoặc số bước phụ thuộc nhau không? | Lượt gọi model, lượng dữ liệu trao đổi và hạ tầng. | Giới hạn quyền và dữ liệu truyền giữa agent. | Bảo trì phân vai, luồng điều phối và kiểm thử. |
| Event-driven Integration | Thêm bên nhận ảnh hưởng lượng xử lý và độ trễ thế nào? | Số sự kiện, lượt gửi lại, lưu trữ và bên nhận. | Kiểm soát quyền phát, nhận và nội dung sự kiện. | Bảo trì định dạng sự kiện và xử lý lỗi hoặc gửi lại. |

Các khoản trên là những phần cần xem xét, không khẳng định mọi triển khai đều có đủ các khoản đó.

## 4. Tiêu chí lựa chọn và kiểm thử

Tiêu chí áp dụng cho toàn bộ phương án triển khai, không đòi từng phương pháp riêng lẻ tự đáp ứng tất cả.

1. **Identity và authorization:** Xác định người hoặc agent yêu cầu và kiểm quyền đối với hành động, bản ghi và dữ liệu liên quan.
2. **Approval:** Chỉ ghi khi có xác nhận hợp lệ cho đúng nội dung thay đổi; nếu quyền có thể thay đổi, kiểm tra lại trước khi ghi.
3. **Fail-closed:** Khi không xác định được quyền hoặc approval hợp lệ, không thực hiện ghi.
4. **Retry và idempotency:** Nếu đã ghi thành công nhưng bị timeout trước khi nhận phản hồi, chạy lại cùng yêu cầu không được tạo thêm hiệu ứng ngoài ý muốn.
5. **Observability:** Trace cần giúp xác định yêu cầu, quyết định, kết quả, lỗi và chi phí khi đo được, đồng thời tránh lộ dữ liệu không được phép.
6. **Reuse:** Agent thứ hai dùng lại connector nhưng không mặc nhiên thừa hưởng quyền hoặc approval của agent thứ nhất.

Các tiêu chí này cần được kiểm thử; việc chọn một giao thức hay framework không tự chứng minh chúng đã đạt.
Khi so sánh các phương án, ưu tiên độ đúng, sự đơn giản, độ vững chắc và khả năng bảo trì lâu dài thay vì chỉ giảm công sức ban đầu.

## 5. Nguồn đọc thêm

- [Chương trình R&D, trang 5-6](../program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt): framework, năm phương pháp và mục tiêu Lab.
- [OpenAI - Function calling](https://platform.openai.com/docs/guides/function-calling): ví dụ luồng model đề xuất gọi function và ứng dụng thực thi.
- [Model Context Protocol - Architecture](https://modelcontextprotocol.io/docs/learn/architecture): kiến trúc MCP client/server và các khả năng liên quan.
- [AWS - What is Step Functions?](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html): ví dụ về workflow engine.
- [OpenAI Agents SDK - Multi-agent](https://openai.github.io/openai-agents-python/multi_agent/): ví dụ về điều phối agent.
- [AWS - What is EventBridge?](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html): ví dụ về tích hợp theo sự kiện.

Các sản phẩm trên là ví dụ để đọc thêm, không đại diện cho mọi sản phẩm cùng nhóm và không phải lựa chọn đã được phê duyệt.
