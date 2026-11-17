> Bản này do agent soạn từ sáu nhánh research song song.
> Mọi câu trích đều có URL trong mục 8, nhưng chỉ những dòng ghi `có` ở cột "tự kiểm" mới được tôi mở lại và khớp nguyên văn.
> Trong 65 nguồn, 47 nguồn đã được mở lại; 1 trang bị chặn và bị loại khỏi kết luận.
> Chưa có số đo nào trên lab, chưa chọn kiến trúc, không phải ADR.

# Kiến trúc ứng viên rút từ hệ thống thật

Ngày: 2026-11-12. Trạng thái: bản nháp do agent soạn.

Câu hỏi của file này hẹp: khi một agent phải đọc dữ liệu nghiệp vụ, kiểm quyền, đề xuất thay đổi và chỉ ghi sau khi có người xác nhận, thì các hệ thống đã chạy thật chia trách nhiệm đó cho những thành phần nào?

Phạm vi: kiến trúc của hệ thống thật và các tổ hợp kiến trúc rút ra từ đó.
Ngoài phạm vi: chọn sản phẩm, chọn model, đo hiệu năng, viết ADR.

File này không thay thế `05-kien-truc-tich-hop-ai-operations.md`, đã bị xóa khỏi worktree.
File 05 cũ giữ vai trò khung đo (tám ràng buộc, sáu đại lượng M1-M6).
File này bổ sung thứ mà 05 thiếu: trục so sánh lấy từ hệ thống thật, không lấy từ suy luận.

## 1. Cách làm

Sáu nhánh research chạy song song, mỗi nhánh một tầng của bài toán.
Mỗi nhánh bị ràng buộc sáu luật: chỉ nguồn gốc, mỗi khẳng định phải có URL mở được, trích tối đa 25 từ giữ nguyên tiếng Anh, không suy kiến trúc từ tên sản phẩm, không bịa số, ghi rõ "không tìm thấy".

| Nhánh | Tầng | Số mục khảo sát |
| --- | --- | --- |
| 1 | MCP làm lớp connector | 8 |
| 2 | Agent runtime có vòng lặp tool và điểm duyệt | 6 |
| 3 | Durable execution và workflow engine | 6 |
| 4 | Event-driven và chống tác dụng phụ lặp | 10 |
| 5 | Nền tảng connector doanh nghiệp và định danh | 9 |
| 6 | Kiến trúc tham chiếu đã được sản phẩm hoá | 5 |

Tôi kiểm chéo lại 51 câu và khẳng định trọng yếu bằng `curl` cộng so khớp chuỗi, không tin bản tóm tắt của nhánh.
Kết quả: 50 khớp nguyên văn, 1 trang trả về `Access Denied` và bị loại khỏi mọi kết luận (Salesforce, S52).
Lệnh kiểm nằm ở `../checks/real-system-architectures.sh`; chạy lại bằng `bash rd/checks/real-system-architectures.sh`.

Ba điều cố ý không làm:

- Không chấm điểm các hệ thống. Chúng giải bài toán khác nhau, không cùng đơn vị.
- Không coi "không tìm thấy" là "không tồn tại". Đó là giới hạn của lượt đọc này.
- Không suy ra hiệu năng. Không có số đo nào trong file này.

## 2. Hệ thống thật tách bài toán thành bảy thành phần

Đọc 44 mục, mẫu hình lặp lại nhiều nhất là: mỗi câu hỏi khác nhau có một thành phần riêng trả lời nó.

| # | Thành phần | Sở hữu quyết định gì | Hệ thống thật đã tách riêng thành phần này | Thiếu thì hỏng ở đâu |
| --- | --- | --- | --- | --- |
| 1 | Runtime agent | Vòng lặp tool, chỗ dừng, state của lần dừng | OpenAI Agents SDK, MAF, Google ADK, Claude Agent SDK | Không có chỗ chèn bước duyệt (SR4) |
| 2 | Connector | Hợp đồng tool, schema tham số, validate input | MCP server, Kong AI MCP Proxy, Cloudflare | Agent đoán tham số, lỗi vào tận hệ nguồn |
| 3 | Gateway, tức điểm thực thi (PEP) | Cho hay không cho request đi tiếp, và đi tới đâu | AgentCore Gateway, Google Agent Gateway, Kong, ContextForge | Không có chỗ duy nhất để chặn (SR1, SR3) |
| 4 | Policy engine, tức điểm phán quyết (PDP) | Quyết định theo tham số, mặc định từ chối | AgentCore Policy, Google semantic governance | Quyền nằm rải trong prompt hoặc trong code tool (SR2) |
| 5 | Identity | Ai là chủ thể, ai là bên đang hành động | Entra Agent ID, RFC 8693, SPIFFE | Không phân biệt người nhờ với dịch vụ ghi (SR1) |
| 6 | Registry | Đích nào được phép gọi | Google Agent Registry, Azure API Center | Agent gọi được endpoint không ai duyệt |
| 7 | Observability | Bằng chứng: ai, tool nào, tham số nào, chi phí | AgentCore Observability, OTel GenAI semconv | Không dựng lại được một quyết định (SR7) |

Ba hệ thống tiến gần nhất tới mô hình bảy thành phần là Amazon Bedrock AgentCore, Gemini Enterprise Agent Platform và Microsoft Foundry Agent Service.
Hai hệ đầu đủ bảy thành phần ở mức tài liệu công bố; Foundry đạt 5 trên 7, thiếu policy engine dạng ngôn ngữ và thiếu tuyên bố gateway là đường duy nhất.

Điểm đáng chú ý: cả ba đều là sản phẩm của nhà cung cấp cloud, ra đời sau bài toán, không phải một chuẩn mở.
Điểm đáng chú ý: cả ba đều là sản phẩm của nhà cung cấp cloud, không phải một chuẩn mở.
Chuẩn mở MCP chỉ phủ thành phần 2, và không định nghĩa gì cho thành phần 3, 4, 5.

## 3. Bốn phát hiện có bằng chứng

### 3.1. Không hệ thống nào đóng gói "đề xuất, duyệt, ghi" thành một primitive

Đây là phát hiện trung tâm, và nó đúng cho cả 12 hệ thống dưới đây.

| Hệ thống | Cơ chế dừng để duyệt | State của lần chờ ở đâu | Chống ghi trùng khi retry | Ràng buộc tham số sau khi duyệt |
| --- | --- | --- | --- | --- |
| OpenAI Agents SDK | `needs_approval` chặn giữa vòng lặp | `RunState` do ứng dụng serialize và tự lưu | Không có. "does not guarantee exactly-once execution" | Không có |
| Microsoft Agent Framework | Kết thúc run, trả yêu cầu duyệt như một content | `AgentSession`, và checkpoint của workflow | Không có | Binding theo id request, không theo hash |
| Google ADK | Bọc lời gọi gốc vào `adk_request_confirmation` | Event history của session | Không. Tool "may run more than once" | Khớp theo `function_call_id` |
| Claude Agent SDK | Sáu bước rule, hook, mode, rồi `canUseTool` | Transcript JSONL trên đĩa | Không có | Tool chạy đúng input đã duyệt trong cùng process |
| n8n | Workflow dừng, gửi yêu cầu qua channel | Bản ghi thực thi của instance | Không có | Hiển thị tool và tham số, không khoá |
| Temporal | `wait_condition` chờ signal | Event history của workflow | Activity phải tự idempotent | Không có |
| AWS Step Functions | Task token | Execution state của Standard workflow | Chỉ đúng một lần nếu không bật Retry | Không có |
| Inngest | `step.waitForEvent` | Kết quả step đã memoize | Không. "A step does not make an external action exactly once." | Không có |
| Restate | Awakeable một lần | Journal | Dedupe theo idempotency key ở biên | Không có |
| Airflow | State `awaiting_input` | Metadata của scheduler | Không có | Chọn trong danh sách `options` |
| AgentCore Policy | Không có bước duyệt người | Không áp dụng | Không áp dụng | Có, điều kiện trên tham số lúc gọi |
| Google semantic governance | Không có bước duyệt người | Không áp dụng | Không áp dụng | Có, ràng buộc ngôn ngữ tự nhiên trên tham số |

Hai kết luận rút ra:

1. Cơ chế duyệt của mọi hệ thống đều là "dừng và khớp lại theo id", không phải "dừng và ràng buộc theo nội dung".
   Không hệ thống nào trong 12 hệ thống có hash hoặc chữ ký trên tham số tại thời điểm duyệt.
2. Chống ghi trùng không đi kèm cơ chế duyệt ở bất kỳ hệ thống nào.
   Nó chỉ có ở tầng thấp hơn: idempotency key ở HTTP, outbox ở DB, hoặc dedupe theo id sự kiện ở consumer.

Điều này có nghĩa ràng buộc SR4 của file 05 cũ, "hash của đúng tham số", không mua được từ sản phẩm.
Nó phải nằm trong executor do lab tự viết, và đây là một trong ít chỗ lab thật sự phải tự làm.

### 3.2. Nơi duyệt và nơi kiểm quyền là hai chỗ khác nhau, và gateway không phải chỗ duyệt

Bằng chứng rõ nhất đến từ Microsoft Foundry Toolbox, với một câu tự thừa nhận giới hạn của chính sản phẩm:

> The MCP endpoint doesn't block tools/call. Enforcement is entirely the agent runtime's responsibility. (S59)

Cùng mô hình đó ở các hệ khác:

| Hệ thống | Nơi ra quyết định | Có bước duyệt người ở đó không |
| --- | --- | --- |
| AgentCore | Policy engine sau Gateway, mặc định từ chối | Không |
| Google Agent Gateway | Gateway gọi policy engine, verdict ALLOW hoặc DENY | Không |
| Kong AI MCP Proxy | ACL theo Consumer, trả 403 trước khi forward | Không |
| GitHub MCP Server | API GitHub, theo quyền của token | Không, chỉ có cờ read-only |
| Atlassian Rovo MCP | Ba lớp scope, permission group, quyền người dùng | Có nhãn risk tier, không phải cổng chặn |
| Stripe MCP | Scope của key và cờ admin | Chỉ nhãn "Human confirmation" trên vài tool |

Hệ quả cho thiết kế: policy engine và bước duyệt là hai cơ chế bù trừ nhau, không thay thế nhau.
Policy chặn được cái sai kể cả khi không ai ngồi đó; duyệt người bắt được cái đúng quy định nhưng sai ý định.
Kiến trúc nào chỉ có một trong hai đều để lọt một lớp lỗi.

### 3.3. Connector lớn đều phó mặc quyền cho hệ nguồn, connector chỉ thu hẹp bề mặt

GitHub nói thẳng điều này trong tài liệu chính sách của MCP server:

> Users and apps cannot use an MCP server to access more resources than they could otherwise access normally via the API. (S8)

Ba cách thu hẹp bề mặt, khác nhau về bản chất:

| Cách | Ví dụ | Giới hạn cần biết |
| --- | --- | --- |
| Công tắc đọc/ghi cứng | GitHub `--read-only`, Atlassian tắt nhóm `delete_jira` | Chỉ hai mức, không theo bản ghi |
| Lọc danh mục tool theo danh tính | MCP 2026-07-28 cho `tools/list` khác nhau theo token, Kong lọc theo ACL | GitHub bỏ lọc khi không đọc được scope của token |
| Tách kênh theo mức rủi ro | Atlassian `executeRead`, `executeWrite`, `executeDestructive` | Vẫn là một cổng, chỉ khác tên |

Điểm yếu có bằng chứng: Kong ghi rõ "Consumer and Consumer Group scoping is not supported in any mode" (S6), nghĩa là ACL chỉ tới mức từng consumer, không tới mức nhóm.
GitHub ghi rõ token fine-grained và token của GitHub App "don't support scope detection and show all tools" (S9), nên bề mặt tool không thu hẹp theo quyền như quảng cáo.
Và MCP tool annotations là hint, không phải ràng buộc thi hành: "Every property is a hint." (S3)

### 3.4. Định danh hai lớp là mẫu hình trưởng thành nhất, và nó giải đúng SR1

Câu ngắn nhất mô tả mẫu hình này:

> The subject of the token is a user, while the actor is the agent identity. (S49)

Bốn hệ thống độc lập cùng làm một việc: tách "ai chịu trách nhiệm" khỏi "ai đang chạy".

| Hệ thống | Cách biểu diễn |
| --- | --- |
| Entra Agent ID | `sub` là người, actor là agent identity, blueprint giữ credential |
| RFC 8693 | `act` lồng nhau, `may_act` giới hạn ai được làm actor |
| Google Agent Gateway | SPIFFE ID cho từng agent, log ghi cả người và agent |
| Atlassian Rovo agent | Chọn account của người dùng hoặc account riêng của agent |

Ngược lại, Zapier MCP và Workato đều dùng credential của một account uỷ quyền cho mọi lần chạy, nên mọi người dùng chung server chia sẻ nguyên quyền của account đó.
Đó là lựa chọn hợp lý cho sản phẩm đại chúng, nhưng là điều SR8 của lab cấm.

## 4. Năm tổ hợp kiến trúc ứng viên

Mã P1 đến P5 chỉ để tham chiếu, không hàm ý thứ hạng.
Cả năm đều là tổ hợp có tiền lệ thật, không phải mô hình đề xuất trên giấy.

Mỗi tổ hợp trả lời cùng một câu: quyết định "cho ghi" nằm ở đâu.

### P1. Runtime gate, duyệt trong vòng lặp agent

Luồng: agent đọc dữ liệu, model trả lời gọi tool, runtime thấy tool cần duyệt, runtime dừng và trả một yêu cầu duyệt kèm id, ứng dụng hỏi người, người duyệt, ứng dụng resume đúng lần chạy đó, tool chạy trong process ứng dụng, runtime ghi trace.

- Quyền quyết định: runtime.
- Tiền lệ: OpenAI Agents SDK, MAF, Google ADK, Claude Agent SDK.
- Mạnh: ít thành phần nhất, không cần thêm dịch vụ, độ trễ thấp.
- Yếu: quyền nằm trong code ứng dụng nên agent thứ hai phải tự dựng lại cổng; state chờ phụ thuộc storage do ứng dụng tự lo; không có ràng buộc tham số.
- Hỏng ở đâu: nếu tool gọi thẳng API nghiệp vụ, không có chỗ nào chặn lần gọi thứ hai do retry.

### P2. Gateway cộng policy engine, quyết định theo tham số

Luồng: mọi lời gọi tool đi qua gateway; gateway là điểm thực thi duy nhất; policy engine nhận principal, tool, tham số rồi trả permit hoặc forbid; mặc định từ chối; forbid thắng permit; log verdict.

- Quyền quyết định: policy engine, không phải agent, không phải server tool.
- Tiền lệ: AgentCore Policy, Google semantic governance, Kong ACL, ContextForge.
- Mạnh: chặn được theo tham số, không phụ thuộc prompt, áp được cho mọi agent cùng lúc.
- Yếu: không có bước duyệt người; policy là code cần test riêng; một số sản phẩm không cho policy theo nhóm (Kong).
- Hỏng ở đâu: nếu agent còn đường gọi trực tiếp không qua gateway thì mô hình mất hiệu lực, và cả Azure lẫn AWS đều không tuyên bố đường trực tiếp bị chặn.

### P3. Durable workflow, duyệt là dữ liệu

Luồng: engine tạo run; bước đọc là activity; bước đề xuất gọi model; engine dừng chờ một signal hoặc token; người duyệt gửi signal; engine chạy bước ghi; bước ghi idempotent theo run id; engine phát event sau khi ghi.

- Quyền quyết định: không thành phần nào trong engine. Người viết workflow tự kiểm người duyệt.
- Tiền lệ: Temporal, Step Functions, Inngest, Restate, Airflow, Prefect.
- Mạnh: chờ được ngày hoặc tuần mà không giữ process; chạy lại có kết luận rõ; chi phí chờ gần bằng không.
- Yếu: engine không biết quyền nghiệp vụ; activity phải tự idempotent; replay gặp model không tất định cần tách riêng.
- Hỏng ở đâu: nếu để model sinh lại đề xuất ở lần chạy sau thì tham số đã duyệt và tham số được ghi khác nhau.

### P4. Nền tảng connector, credential tập trung

Luồng: agent gọi tool theo tên; nền tảng giữ credential của hệ đích; tool chạy dưới connection của account; admin bật tắt theo workspace; audit theo từng lần chạy.

- Quyền quyết định: account uỷ quyền connection, cộng công tắc của admin.
- Tiền lệ: Zapier MCP, Workato, n8n, Atlassian agent account.
- Mạnh: agent không cầm bí mật; thêm hệ đích nhanh; người dùng không phải cấp key.
- Yếu: biên quyền bằng biên quyền của account, nên hai agent dùng chung connector là chia sẻ quyền; khó kiểm chứng bên trong.
- Hỏng ở đâu: chính chỗ SR8 cấm. Zapier ghi rõ server access không cho người khác chạy tool thay người dùng, nhưng đó là ràng buộc của sản phẩm, không phải của kiến trúc lab.

### P5. Chuỗi uỷ quyền hai danh tính

Luồng: người dùng lấy token; token được đổi ở mỗi hop qua token exchange; hop sau vẫn mang principal gốc cộng actor; hệ đích ghi log cả hai; gateway kiểm cả hai.

- Quyền quyết định: hệ đích, dựa trên danh tính còn nguyên vẹn qua các hop.
- Tiền lệ: Entra Agent ID, RFC 8693, Google SPIFFE, AgentCore Identity.
- Mạnh: giải đúng SR1 và SR7, không phải hy sinh quyền người để lấy tiện.
- Yếu: cần identity provider thật; debug khó vì một hành động có nhiều danh tính; lab dùng dữ liệu giả lập nên phải tự dựng.
- Hỏng ở đâu: nếu một hop dùng credential dịch vụ thay vì token uỷ quyền, chuỗi đứt và mọi tầng sau mất thông tin người yêu cầu.

### 4.1. Quan hệ với ba kiến trúc A, B, C của file 05 cũ

Đối chiếu thẳng:

| File 05 cũ | Thực chất là gì theo file này |
| --- | --- |
| A, executor tự viết | P1, và không có tầng policy riêng |
| B, MCP server cộng executor | P1 với bước liệt kê tool đổi từ mã ứng dụng sang `tools/list` |
| C, workflow engine cộng event | P3 |

Nghĩa là A và B khác nhau đúng một biến: công cụ được phát hiện thế nào.
Chúng không khác nhau ở chỗ ai quyết định cho ghi, nên so A với B không trả lời được SR1, SR2, SR4, SR5.
Trục quyết định theo bằng chứng ở mục 3 là: nơi đặt cổng duyệt, nơi đặt phán quyết, và danh tính được mang theo kiểu gì.

Đề nghị giữ nguyên file 05 cũ làm khung đo, và dùng P1 đến P5 làm đơn vị so sánh khi viết ADR.
Việc này không sửa file 05 cũ.

## 5. So sánh tradeoff

Bốn cột theo yêu cầu của chương trình: chi phí, mở rộng, bảo mật, bảo trì.
Ô nào không có số công bố thì ghi rõ, không ước lượng.

| | P1 runtime gate | P2 gateway cộng policy | P3 durable workflow | P4 connector platform | P5 hai danh tính |
| --- | --- | --- | --- | --- | --- |
| Chi phí | Không phí nền tảng, chỉ token và storage state | Không có giá trên mỗi lần gọi được công bố (AgentCore, Google, Kong) | Có giá công khai: Temporal 50 USD mỗi triệu action, Step Functions 0,000025 USD mỗi state transition, Inngest 99 USD cho 1 triệu execution, Restate 100 nghìn action miễn phí | Không có giá trên mỗi tool call được công bố; tính theo task, seat hoặc self-host | Không có giá riêng, nằm trong giá identity provider |
| Chờ lâu | Giữ state, không giữ process nếu tự lưu | Không áp dụng | Rẻ nhất, không tính compute khi chờ | Không áp dụng | Không áp dụng |
| Mở rộng | Theo số lần chạy agent; state store là chỗ nghẽn | Gateway là điểm nghẽn duy nhất; Google giới hạn 5.000 resource mỗi gateway | Engine scale ngang; trần thời lượng: Standard 1 năm, Inngest 30 tới 366 ngày tùy gói | Hạn mức theo workspace: Workato 500 shared connection, Zapier 75 tới 500 task mỗi run | Theo identity provider |
| Bảo mật | Quyền trong code ứng dụng, sửa prompt không đổi quyết định nhưng sửa code thì có | Mặc định từ chối, forbid thắng permit, kiểm được tham số | Không kiểm quyền, phải tự đặt cổng trước activity ghi | Biên quyền bằng account uỷ quyền, hai agent chia sẻ quyền | Đúng nhất: người và agent tách rời, log cả hai |
| Bảo trì | Ít thành phần, đổi policy là sửa code và deploy agent | Thêm một ngôn ngữ policy phải test, thêm một dịch vụ phải vận hành | Thêm engine, thêm khái niệm versioning khi đang có run chờ | Ít việc nhất cho người dùng, nhiều bí mật nhất ở một chỗ | Thêm cấu hình token exchange ở mỗi hop |
| Chống ghi trùng | Không có sẵn | Không áp dụng, gateway không giữ trạng thái ghi | Activity phải tự lo, engine chỉ đảm bảo chạy lại đúng | Không có sẵn | Không áp dụng |
| Rủi ro chính | Agent thứ hai dựng lại cổng và dựng sai | Agent có đường vòng ngoài gateway | Tham số được sinh lại sau khi duyệt | Quyền bị chia sẻ theo connector | Cấu hình sai một hop là mất danh tính người |

Ghi chú về chi phí: mọi đơn giá trên là giá niêm yết đọc ngày 2026-11-12, chưa gồm chiết khấu và chưa gồm chi phí vận hành người.
Bốn mốc giá đã được mở lại và khớp nguyên văn: S26, S29, S32 và trang giá Restate.
Không có sản phẩm nào trong nhóm P2 công bố giá trên mỗi lần đánh giá policy, nên chi phí của tầng này hiện là ẩn số.

## 6. Điều chưa biết và giả thuyết kiểm được

Mỗi giả thuyết dưới đây phải trả lời được bằng một lần chạy trong lab, không bằng đọc thêm tài liệu.

| Mã | Giả thuyết | Cách kiểm | Đạt khi |
| --- | --- | --- | --- |
| H1 | Duyệt mà không ràng buộc tham số thì tham số bị sửa vẫn ghi được | Duyệt một đề xuất, sửa tham số trước khi executor chạy, đếm bản ghi | Có ít nhất một bản ghi mang tham số chưa từng được duyệt |
| H2 | Policy theo tham số chặn được hành vi sai kể cả khi prompt bị viết lại | Xóa câu dặn quyền trong prompt, chạy lại bộ test quyền | Không quyết định nào đổi |
| H3 | Khoá idempotency đặt ở executor chống trùng tốt hơn đặt ở client | Cắt phản hồi sau khi ghi, retry 10 lần, đếm bản ghi | Đúng một bản ghi, ở mọi lần chạy |
| H4 | Hai agent dùng chung một connector có credential tĩnh sẽ thừa hưởng quyền của nhau | Cho agent B không có quyền gọi tool mà agent A đã dùng | B bị từ chối, hoặc ta đo được là B lọt |
| H5 | Chờ duyệt bằng durable workflow rẻ hơn giữ process khi thời gian chờ vượt vài phút | Tính chi phí 1.000 lần chờ 24 giờ theo giá niêm yết, so với giữ máy | Chênh lệch lớn hơn sai số cấu hình |
| H6 | Thêm gateway và policy làm tăng p95 nhưng không làm tăng tỉ lệ chọn sai hàm | Đo M1 và M4 của file 05 cũ trên cùng bộ 30 tool, có và không có tầng policy | Chênh lệch p95 nằm trong ngưỡng đặt trước ngày chạy |
| H7 | Không thể đạt SR7 bằng chuẩn OTel mặc định vì thiếu định danh người dùng cuối | Dựng một trace đầy đủ rồi thử trả lời "ai đã yêu cầu" chỉ bằng attribute chuẩn | Trả lời được, hoặc phải thêm attribute tự định nghĩa |

H7 là giả thuyết đáng kiểm nhất trước khi viết ADR, vì nó quyết định SR7 có cần thành phần thứ tám hay không.
Cơ sở: trong đặc tả OTel GenAI, span `gen_ai.execute_tool` có `gen_ai.tool.call.arguments` là tuỳ chọn và không có attribute nào mang danh tính người dùng cuối trong danh mục đã đọc (S65).

## 7. Khuyến nghị sơ bộ, chưa phải ADR

Tổ hợp đáng thử trong lab, xếp theo thứ tự xây:

1. Executor tự viết, làm đúng một việc: kiểm policy, kiểm hash tham số đã duyệt, ghi, và giữ khoá idempotency. Đây là nơi duy nhất được ghi.
2. Policy engine tối giản đọc từ file cấu hình, không nhúng vào prompt và không nhúng vào tool. Trả lời hai câu: ai được gọi tool nào, và với tham số trong khoảng nào.
3. Cổng duyệt mang hash của tham số, hạn dùng, và id người duyệt. P1 hoặc P3 đều gắn được, miễn là hash nằm ở executor.
4. Danh tính hai lớp ngay từ bản giả lập: một người yêu cầu, một bên hành động, để SR1 và SR8 kiểm được bằng test chứ không bằng lập luận.
5. Trace tự định nghĩa thêm trường người yêu cầu, vì chuẩn OTel không có trường đó.

Vì sao ba hướng khác thua ở giai đoạn này:

- P4 thua vì nó che mất đúng phần lab cần nhìn: quyền và điểm ghi nằm sau một sản phẩm đóng.
- P2 một mình thua vì không có bước duyệt người, và tiêu chí nghiệm thu của chương trình yêu cầu duyệt trước khi ghi.
- P1 một mình thua vì state và retry sẽ tự viết lại, trong khi P3 đã có sẵn và đo được chi phí.

Điều gì sẽ lật khuyến nghị này:

- Nếu H6 cho thấy tầng policy làm p95 vượt ngưỡng đã đặt, bỏ policy engine, giữ policy trong executor.
- Nếu H7 trả lời được bằng attribute chuẩn, bỏ trường tự định nghĩa và dùng OTel thuần.
- Nếu H5 cho thấy chờ bằng ghi state rẻ tương đương, bỏ engine để giảm số thành phần.

## 8. Sổ nguồn

Cột "tự kiểm" là `có` khi tôi đã mở lại URL ngày 2026-11-12 và khớp nguyên văn ít nhất một câu dùng trong file này.
`chưa` nghĩa là nhánh research đã mở, tôi chưa mở lại, nên độ tin thấp hơn một bậc.

| ID | Nguồn | Loại | URL | Tự kiểm |
| --- | --- | --- | --- | --- |
| S1 | MCP, authorization | Đặc tả | https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization | có |
| S2 | MCP, tools 2026-07-28 | Đặc tả | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | có |
| S3 | MCP blog, tool annotations | Blog chính thức | https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/ | có |
| S4 | Docker MCP Gateway | Tài liệu | https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/ | có |
| S5 | Cloudflare remote MCP server | Tài liệu | https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/ | có |
| S6 | Kong AI MCP Proxy | Tài liệu | https://developer.konghq.com/plugins/ai-mcp-proxy/ | có |
| S7 | IBM ContextForge, architecture | Tài liệu | https://ibm.github.io/mcp-context-forge/architecture/ | có |
| S8 | GitHub MCP, policies | Mã nguồn | https://raw.githubusercontent.com/github/github-mcp-server/main/docs/policies-and-governance.md | có |
| S9 | GitHub MCP, scope filtering | Mã nguồn | https://raw.githubusercontent.com/github/github-mcp-server/main/docs/scope-filtering.md | có |
| S10 | Atlassian Rovo MCP, tools | Tài liệu | https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/ | có |
| S11 | Stripe MCP | Tài liệu | https://docs.stripe.com/mcp | có |
| S12 | OpenAI Agents SDK, HITL | Tài liệu | https://openai.github.io/openai-agents-python/human_in_the_loop/ | có |
| S13 | OpenAI Plugins, security | Tài liệu | https://developers.openai.com/plugins/guides/security-privacy | chưa |
| S14 | Claude Agent SDK, permissions | Tài liệu | https://code.claude.com/docs/en/agent-sdk/permissions | có |
| S15 | Claude Code, hooks | Tài liệu | https://code.claude.com/docs/en/agent-sdk/hooks | chưa |
| S16 | Microsoft Agent Framework, tool approval | Tài liệu | https://learn.microsoft.com/en-us/agent-framework/agents/tools/tool-approval | có |
| S17 | Microsoft Agent Framework, HITL workflow | Tài liệu | https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop | có |
| S18 | MAF, ADR 0006 user approval | Tài liệu kiến trúc | https://github.com/microsoft/agent-framework/blob/main/docs/decisions/0006-userapproval.md | chưa |
| S19 | Google ADK, confirmation | Tài liệu | https://adk.dev/tools-custom/confirmation/ | có |
| S20 | Google ADK, resume | Tài liệu | https://adk.dev/runtime/resume/ | có |
| S21 | A2A specification | Đặc tả | https://a2a-protocol.org/latest/specification/ | chưa |
| S22 | Temporal, workflow definition | Tài liệu | https://docs.temporal.io/workflow-definition | chưa |
| S23 | Temporal, activity definition | Tài liệu | https://docs.temporal.io/activity-definition | chưa |
| S24 | Temporal, HITL cookbook | Tài liệu | https://docs.temporal.io/ai-cookbook/human-in-the-loop-python | có |
| S25 | Temporal, approval pattern | Tài liệu | https://docs.temporal.io/design-patterns/approval | chưa |
| S26 | Temporal, pricing | Trang giá | https://temporal.io/pricing | có |
| S27 | Step Functions, connect to resource | Tài liệu | https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html | có |
| S28 | Step Functions, standard và express | Tài liệu | https://docs.aws.amazon.com/step-functions/latest/dg/concepts-standard-vs-express.html | có |
| S29 | Step Functions, pricing | Trang giá | https://aws.amazon.com/step-functions/pricing/ | có |
| S30 | Inngest, cách function chạy | Tài liệu | https://www.inngest.com/docs/learn/how-functions-are-executed | có |
| S31 | Inngest, durable primitives | Tài liệu | https://www.inngest.com/docs/durable-execution/primitives | có |
| S32 | Inngest, pricing | Trang giá | https://www.inngest.com/pricing | có |
| S33 | Restate, durable execution | Tài liệu | https://docs.restate.dev/concepts/durable_execution | có |
| S34 | Airflow, HITL | Tài liệu | https://airflow.apache.org/docs/apache-airflow/stable/tutorial/hitl.html | có |
| S35 | Prefect, flow runs | Tài liệu API | https://reference.prefect.io/prefect/flow_runs/ | chưa |
| S36 | Transactional outbox | Mẫu thiết kế | https://microservices.io/patterns/data/transactional-outbox.html | chưa |
| S37 | Debezium outbox event router | Tài liệu | https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html | có |
| S38 | CloudEvents spec | Đặc tả | https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | có |
| S39 | IETF Idempotency-Key, draft 08 | Tài liệu | https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/ | có |
| S40 | Stripe, idempotent requests | Tài liệu | https://docs.stripe.com/api/idempotent_requests | có |
| S41 | Kafka, design | Tài liệu kiến trúc | https://kafka.apache.org/44/design/design/ | có |
| S42 | GitHub webhooks, failed deliveries | Tài liệu | https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries | có |
| S43 | OTel, messaging spans | Đặc tả | https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/ | chưa |
| S44 | Zapier MCP, cách connection hoạt động | Tài liệu | https://docs.zapier.com/mcp/overview/how-connections-work | có |
| S45 | AI by Zapier, migrate từ Agents | Tài liệu | https://help.zapier.com/hc/en-us/articles/47402591569805-Migrating-from-Agents-to-AI-by-Zapier | chưa |
| S46 | Workato, connections | Tài liệu | https://docs.workato.com/en/connections | có |
| S47 | n8n, HITL cho tool | Tài liệu | https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools | có |
| S48 | Atlassian, Rovo agent accounts | Tài liệu | https://support.atlassian.com/studio/docs/understand-rovo-agent-accounts/ | chưa |
| S49 | Microsoft Entra, agent identities | Tài liệu | https://learn.microsoft.com/en-us/entra/agent-id/agent-identities | có |
| S50 | RFC 8693, token exchange | Đặc tả | https://www.rfc-editor.org/rfc/rfc8693.html | có |
| S51 | SPIFFE, SPIRE concepts | Tài liệu | https://spiffe.io/docs/latest/spire-about/spire-concepts/ | có |
| S52 | Salesforce, Agentforce trust | Tài liệu kiến trúc | https://architect.salesforce.com/docs/architect/well-architected/guide/agentic-enterprise-trust | không, trang trả về Access Denied |
| S53 | AgentCore, gateway | Tài liệu | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html | chưa |
| S54 | AgentCore, policy getting started | Tài liệu | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-getting-started.html | có |
| S55 | AgentCore, policy core concepts | Tài liệu | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-core-concepts.html | có |
| S56 | AgentCore, policy session và identity | Tài liệu | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html | có |
| S57 | AgentCore, identity | Tài liệu | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity.html | chưa |
| S58 | AgentCore, observability | Tài liệu | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability.html | chưa |
| S59 | Microsoft Foundry, toolbox | Tài liệu | https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/toolbox | có |
| S60 | Microsoft Foundry, agent identity | Tài liệu | https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/agent-identity | chưa |
| S61 | Google, Agent Gateway | Tài liệu | https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/agent-gateway-overview.md.txt | có |
| S62 | Google, semantic governance | Tài liệu | https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/policies/semantic-governance-overview.md.txt | có |
| S63 | Azure API Center, MCP registry | Tài liệu | https://learn.microsoft.com/en-us/azure/api-center/register-discover-mcp-server | có |
| S64 | Microsoft, agent orchestration patterns | Tài liệu kiến trúc | https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns | chưa |
| S65 | OTel GenAI, execute tool span | Đặc tả | https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/execute-tool.md | có |

Ghi chú phiên bản MCP: trang `specification/latest` ngày 2026-11-12 trả về bản `2026-07-28`.
Trong danh sách phiên bản có nhắc `2026-11-09`, nhưng đường dẫn changelog của bản đó trả về Page Not Found, nên file này chỉ dùng `2026-07-28`.

Ghi chú S52: nhánh research báo có đọc được trang Salesforce và trích vài câu về `running user` và `masking`.
Tôi mở lại thì nhận `Access Denied`, nên toàn bộ phần Salesforce bị loại khỏi mục 2 đến mục 7.
Đây là ví dụ cụ thể cho lý do phải có cột "tự kiểm".

## 9. Giới hạn

- Không có số đo nào. Mọi so sánh chi phí là số học trên giá niêm yết, không phải chi phí thật của lab.
- Sáu nhánh research chạy song song nên có thể cùng bỏ sót một hệ thống quan trọng, đặc biệt các hệ nội bộ không công bố kiến trúc.
- 17 trong 65 nguồn chưa được tôi mở lại. Các kết luận ở mục 3 không dựa vào những nguồn đó, nhưng bảng ở mục 6 thì có thể.
- Chuẩn OTel GenAI còn ở trạng thái phát triển, nên kết luận về SR7 chỉ đúng cho bản đặc tả đọc ngày 2026-11-12.
- Một số sản phẩm đã đổi tên trong thời gian khảo sát (Vertex AI Agent Engine thành Gemini Enterprise Agent Platform, Apps SDK thành Plugins, Zapier Agents thành AI by Zapier). Tên trong file này là tên tại ngày đọc.

## 10. Việc tiếp theo

| Thứ tự | Việc | Xong khi |
| --- | --- | --- |
| 1 | Chốt ngưỡng đạt cho H1, H3, H4, H6 trước lần chạy đầu | Có ngày đặt ngưỡng, sớm hơn ngày chạy |
| 2 | Dựng executor có hash tham số và khoá idempotency | Một lệnh chạy lại cho cùng kết quả |
| 3 | Dựng policy engine tối giản đọc từ file, có test riêng | Sửa prompt không đổi quyết định, sửa policy thì đổi |
| 4 | Chạy H1 đến H7, ghi số | Mỗi số truy được về một lệnh |
| 5 | Viết ADR chọn P, kèm lý do các P khác thua | Mỗi lựa chọn trỏ được về một số đo, không trỏ về tài liệu |
| 6 | Cập nhật file 05 cũ nếu trục so sánh thay đổi | Có ghi chú revision trong file 05 cũ |
