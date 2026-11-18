# Bài học từ thị trường nền tảng AI 2026

Ngày: 2026-11-17. Trạng thái: rút từ khảo sát tài liệu của mười một sản phẩm; chưa chạy thử sản phẩm nào.

Bảng chấm đầy đủ, trích dẫn và nguồn nằm ở [khảo sát thị trường](market-landscape.md).
Bài này chỉ giữ điều Lab học được và điều Lab quyết định.

## Đọc nhanh

- Lab cần AI làm việc thay một người mà chỉ thấy và chỉ sửa phần người đó được phép, có người duyệt trước khi ghi, và không ghi hai lần.
- Lab đã đọc tài liệu của mười một sản phẩm bán năm 2026; không sản phẩm nào làm đủ.
- Từng mảnh khó đều đã có người làm: một sản phẩm khóa lời duyệt vào đúng nội dung, một sản phẩm che dữ liệu theo người hỏi. Chưa ai gộp hai việc đó với việc chống ghi hai lần.
- Lab tự dựng một cổng nhỏ làm đúng phần còn thiếu, chép cách làm đã có, và tránh ba lỗi thiết kế đã thấy ở sản phẩm khác.
- Tiếp theo: ghi quyết định "mua hay tự dựng" vào bản quyết định thiết kế đầu tiên, rồi chạy thử vài sản phẩm làm mốc so sánh khi đánh giá.

## 1. Thị trường bán gì

Không ai bán trọn bài toán của Lab.
Thị trường chia nó thành chín nhóm, mỗi nhóm làm tốt một tầng ([khảo sát, mục 2](market-landscape.md#2-bản-đồ-thị-trường)).

| Nhóm | Ví dụ | Lab lấy được gì |
| --- | --- | --- |
| Nền tảng agent của cloud | AWS AgentCore, Microsoft Agent 365, Google Agent Platform | Mẫu danh tính hai lớp và luật mặc định từ chối |
| Cổng MCP | Kong, Permit, Preloop, Cloudflare, Azure API Management | Mẫu "một cửa cho mọi tool", và bài học về cổng bị lách |
| Quản trị agent độc lập | Liyagent, C1, Execlave | Mẫu duyệt khóa nội dung và biên lai cho mỗi lần ghi |
| Danh tính và phân quyền | Entra Agent ID, Okta, Auth0, Cerbos, Oso | Mẫu xin duyệt trên thiết bị riêng, kèm nội dung cần duyệt |
| Uỷ quyền tool theo từng người | StackOne, Arcade, Composio, Pipedream | Mẫu che trường khi đọc và chặn trường khi ghi, theo người hỏi |
| Quy trình bền và bước duyệt | Temporal, Step Functions, UiPath Maestro | Cách giữ một lệnh chờ duyệt mà không tốn tài nguyên |
| Nền tảng tích hợp | Workato, Zapier, n8n | Không có gì cho đường ghi; chỉ là connector |
| Agent trong phần mềm nghiệp vụ | Salesforce Agentforce, Copilot Studio | Không dùng được; chỉ quản dữ liệu trong hệ của chính nó |
| Cổng model và quan sát | Portkey, LiteLLM, LangSmith | Cách đếm token và chi phí cho vết |

**Kết luận:** lớp kiểm soát đã thành hàng bán sẵn; Lab không cần chứng minh agent cần danh tính, luật và nhật ký.
Phần chưa ai đóng gói là ý nghĩa của một lần ghi.

## 2. Bảng chấm rút gọn

Mỗi sản phẩm được chấm theo tám yêu cầu của Lab ([PRD, mục 6](../../problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc)):
SR1 (danh tính và một cửa ghi), SR2 (luật chạy được), SR3 (phạm vi quyền), SR4 (điểm dừng rủi ro), SR5 (không chắc thì chặn), SR6 (không ghi trùng), SR7 (vết xuyên suốt), SR8 (dùng lại, quyền theo người).

Đ là tài liệu nêu đủ cơ chế, P là có một phần, K là không có hoặc làm ngược, ? là chưa thấy trong tài liệu.

| Sản phẩm | SR1 | SR2 | SR3 | SR4 | SR5 | SR6 | SR7 | SR8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Liyagent | Đ | Đ | P | **Đ** | P | P | Đ | Đ |
| AWS AgentCore | Đ | Đ | P | P | Đ | ? | P | Đ |
| Preloop | P | Đ | P | P | Đ | ? | Đ | P |
| Permit | Đ | P | P | P | Đ | ? | P | Đ |
| StackOne | P | Đ | **Đ** | ? | K | ? | P | Đ |
| Arcade | Đ | P | P | ? | P | ? | P | Đ |
| Microsoft Agent 365 và Foundry | Đ | P | P | P | P | ? | P | P |
| Google Agent Platform | P | P | P | ? | P | ? | P | P |
| Auth0 for AI Agents | P | P | P | P | ? | ? | ? | P |
| Kong AI MCP Proxy | P | K | K | K | K | ? | P | P |
| Temporal và Step Functions | K | K | K | P | K | P | P | K |

Ba điều bảng cho thấy:

- **Không hàng nào có tám dấu Đ.** Liyagent gần nhất, với năm.
- **Ba cột SR3, SR4, SR6 là chỗ trống.** SR3 chỉ có StackOne, SR4 chỉ có Liyagent, SR6 không có ai.
- **Hai sản phẩm giỏi nhất ở SR3 và SR4 lại thiếu đúng phần của nhau.** Ghép chúng thì có hai bảng quyền, hai sổ vết, và vẫn thiếu SR6.

**Kết luận:** mua sản phẩm nào, Lab vẫn phải tự làm phần gộp ba việc trên cùng một lần ghi.
Đó là lý do tự dựng một cổng nhỏ.

## 3. Bảy bài học

### 3.1. Phần kiểm soát cơ bản đã có mẫu, nên chép thay vì tự nghĩ

Ba mẫu xuất hiện ở hầu hết sản phẩm nghiêm túc.
Không có luật cho phép thì từ chối (AgentCore, Permit, Google).
Một lệnh cấm luôn thắng mọi lệnh cho phép (Cedar trong AgentCore và Liyagent, Tool Policies của StackOne).
Lỗi hoặc hết giờ thì coi như từ chối (Preloop, Permit).

**Hệ quả cho cổng:** bộ luật của Lab dùng đúng ba mẫu này và có phép thử cho từng mẫu.

### 3.2. Mọi sản phẩm nghiêm túc đều giữ hai lớp danh tính

Microsoft Entra ghi người dùng là "subject" và agent là "actor".
Liyagent ghi `on_behalf_of` và `run_as`; StackOne áp luật theo "thành viên" mà agent đang làm thay.
Nếu cổng chỉ biết agent, Nam (thực tập sinh) nhờ agent chuyển task T-12 vẫn thành công, và lịch sử chỉ ghi tên tài khoản của agent.

**Hệ quả cho cổng:** mỗi lệnh mang hai tên, người yêu cầu và agent thực hiện.
Trong Thổ Thần, cổng nhận ra người hỏi qua khóa riêng của từng người, vì Thổ Thần không tự gửi danh tính ([tổng hợp phát hiện, mục 4](../../findings.md#4-thổ-thần)).

### 3.3. Che dữ liệu theo người hỏi đã là tính năng bán được

StackOne tách quyền trên từng trường thành hai loại: cấm đọc thì trường bị che trong kết quả, cấm ghi thì lệnh đổi trường bị từ chối ([khảo sát, mục 4.2](market-landscape.md#42-stackone)).
Đây đúng hai phép thử của Lab: chị Hoa tra anh Minh không thấy số điện thoại cá nhân; Nam chỉ được sửa mô tả thì không đổi được người phụ trách.
Các sản phẩm khác chỉ lọc theo tool, theo tài liệu, hoặc che dữ liệu cá nhân theo loại, không theo người hỏi.

**Hệ quả cho cổng:** luật của Lab có hai loại quyền trên trường, "được đọc" và "được ghi", và áp theo người yêu cầu, không theo agent.

### 3.4. Lời duyệt phải khóa vào đúng nội dung và đi qua kênh agent không giả được

Liyagent gắn lời duyệt với dấu vân tay nội dung (digest: chuỗi ngắn tính từ nội dung, đổi một chữ là đổi theo), dùng một lần và có hạn.
Auth0 cho người duyệt xem đúng nội dung trên điện thoại riêng, nhưng tài liệu không nói lệnh ghi bị chặn nếu nội dung đổi sau khi duyệt.
Ví dụ: chị Hoa duyệt "chuyển T-12 cho anh Minh"; nếu lời duyệt không khóa nội dung, agent đổi người nhận thành Nam mà lệnh vẫn được ghi.
Nếu "duyệt" chỉ là một tool, agent có thể tự gọi tool đó để tự duyệt cho mình.

**Hệ quả cho cổng:** lời duyệt mang digest của nội dung, dùng một lần, có hạn.
Người duyệt bấm trên trang riêng của cổng, mở bằng link trong chat, vì Thổ Thần không có bước duyệt.

### 3.5. Chống ghi trùng không ai bán ở tầng agent

Liyagent chỉ chuyển mã chống ghi trùng (idempotency key) cho hệ đích; mã có tác dụng hay không là việc của hệ đích.
`clientToken` của AgentCore chỉ dùng khi tạo cổng; chính AWS khuyên khách tự sinh mã và tự kiểm kết quả cũ.
Temporal chạy lại đúng một bước, nhưng không biết hệ đích đã ghi hay chưa.
Ví dụ: mạng rớt ngay sau lệnh tạo task, agent gửi lại, danh sách có hai task giống nhau.

**Hệ quả cho cổng:** mỗi lệnh ghi có một mã riêng; gửi lại cùng mã thì nhận lại kết quả cũ.
Hệ thống giả lập của Lab được dựng để tôn trọng mã này, như PRD đã ghi.

### 3.6. Có cổng không có nghĩa là an toàn: ba lỗi thiết kế cần tránh

- **Mặc định cho qua.** Kong cho qua mọi lời gọi khi chưa cấu hình danh sách quyền; StackOne cho qua khi không có luật cấm nào khớp.
- **Lời gọi không mang danh tính người vẫn được phục vụ.** Ở StackOne, lời gọi bằng khóa chung của dự án không biết người hỏi, nên luật theo người không áp.
- **Còn đường đi vòng qua cổng.** Cloudflare cảnh báo người bị chặn vẫn gọi được server bằng địa chỉ trực tiếp.

**Hệ quả cho cổng:** mặc định từ chối; lời gọi không có người yêu cầu thì bị từ chối; hệ thống giả lập chỉ nhận lệnh đến từ cổng.

### 3.7. Biên lai của Liyagent cho sẵn cấu trúc của vết

Mỗi lần ghi của Liyagent để lại một biên lai: người yêu cầu, agent, người duyệt, digest, mã chống ghi trùng, kết quả và chi phí; các biên lai nối với nhau bằng hash.
Một lần tra như vậy trả lời được câu "ai dời hạn T-12, lúc nào, vì sao, tốn bao nhiêu".

**Hệ quả cho cổng:** vết của Lab dùng đúng danh sách trường này, cộng thêm số lần gửi lại.

**Kết luận của mục 3:** bài học 3.1 đến 3.3 nói Lab chép được gì, bài học 3.4 và 3.5 nói Lab phải tự làm gì, bài học 3.6 nói Lab không được làm gì.

## 4. Cổng của Lab trong một bảng

| Việc của cổng | Chép từ | Không làm như | Phép thử trong Lab |
| --- | --- | --- | --- |
| Biết ai đang yêu cầu | Entra, Liyagent, StackOne | StackOne với khóa chung của dự án | Nam nhờ chuyển T-12 bị từ chối, vết ghi tên Nam |
| Luật quyền | Cedar, CEL, StackOne | Kong khi chưa cấu hình | Tắt kho quyền thì lệnh sửa task bị chặn |
| Che và chặn theo trường | StackOne | Che dữ liệu cá nhân theo loại, không theo người | Chị Hoa không thấy số điện thoại cá nhân của anh Minh |
| Duyệt | Liyagent, Auth0 | AgentCore (duyệt là một tool), Auth0 (chưa thấy khóa nội dung lúc ghi) | Sửa hạn một task sau khi duyệt thì lời duyệt mất hiệu lực |
| Ghi một lần | Mẫu mã riêng cho mỗi lệnh của API thanh toán | Chạy lại bước mà không hỏi hệ đích | Cắt mạng sau lệnh tạo task, gửi lại, chỉ có một task |
| Một đường ghi duy nhất | Permit, AgentCore Gateway | Cloudflare khi server còn nhận lời gọi trực tiếp | Gọi thẳng hệ giả lập không qua cổng thì bị từ chối |
| Vết | Biên lai Liyagent, sổ vết nối hash của Preloop | Vết rời ở nhiều dịch vụ (AgentCore) | Một lần tra trả lời ai, lúc nào, vì sao, kết quả, chi phí |

**Kết luận:** cổng của Lab có bảy việc, việc nào cũng có mẫu để chép và một phép thử tự động.
Phần mới của Lab là gộp bảy việc trên cùng một đường ghi và đo nó.

## 5. Kết luận cho sau này

### 5.1. Mua hay tự dựng

Tự dựng khi cần bằng chứng, cần đo từng phần, hoặc cần so hai cách nối trên cùng một cửa.
Mua khi cần chạy thật nhanh, chấp nhận hộp đen, và chấp nhận ghép hai sản phẩm cho đủ che trường và duyệt.
Với Lab hôm nay, tự dựng thắng, vì mục tiêu là bằng chứng và so sánh, không phải đưa vào vận hành.

### 5.2. Khi nào MCP là lựa chọn sai

MCP định nghĩa cách tìm và gọi tool, không định nghĩa nghĩa vụ của một lần ghi.
Sản phẩm nào dựa vào cổng MCP để giữ an toàn đều phải thêm luật, duyệt và chống ghi trùng bên ngoài MCP.
Vì vậy MCP sai khi người ta kỳ vọng nó tự giữ lời hứa an toàn; nó đúng khi cần nhiều nơi gọi dùng lại cùng bộ tool.

### 5.3. Khi nào xem lại quyết định này

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| Một sản phẩm công bố đủ che trường theo người, duyệt khóa nội dung và chống ghi trùng | Chạy thử ngay với dữ liệu giả; nếu đạt tám phép thử, cân nhắc mua thay vì dựng tiếp |
| StackOne thêm bước duyệt, hoặc Liyagent thêm che trường theo người | Chấm lại sản phẩm đó; nó có thể thành mốc "mua" duy nhất cần so |
| Công ty chọn hẳn AWS hoặc Microsoft | Lấy danh tính và luật từ AgentCore hoặc Entra; cổng của Lab chỉ giữ duyệt, ghi một lần và vết |
| Thổ Thần thêm bước duyệt hoặc gửi danh tính người dùng | Bỏ phần tương ứng của cổng, dùng cơ chế của Thổ Thần, giữ phép thử |
| Mục tiêu đổi từ nghiên cứu sang vận hành | Chạy thử theo thứ tự Liyagent, StackOne, Preloop, Permit, AgentCore |

**Kết luận:** quyết định tự dựng đúng cho giai đoạn nghiên cứu, và có điều kiện rõ để xem lại.
Lần rà thị trường tiếp theo nên tìm đúng các tín hiệu trong bảng này.

## 6. Câu hỏi còn mở

Đọc tài liệu không trả lời được các câu dưới đây; mỗi câu cần một lần chạy với dữ liệu giả ([khảo sát, mục 7](market-landscape.md#7-giả-thuyết-kiểm-được)).

| Câu hỏi | Cách kiểm |
| --- | --- |
| Liyagent có thật sự chặn lời duyệt cũ khi nội dung đổi không? | Duyệt một đề xuất, sửa một trường, gửi lại |
| StackOne có che đúng trường theo người, và có để lọt khi gọi bằng khóa chung không? | Cấm đọc số điện thoại với nhóm của chị Hoa, gọi qua hai đường |
| Lời duyệt của Auth0 có dùng được cho một lệnh khác nội dung đã duyệt không? | Duyệt chuyển T-12 cho anh Minh, dùng lại để chuyển cho Nam |
| Chính sách thời gian của AgentCore có bị lách bằng phiên mới không? | Duyệt một lần, mở phiên mới, gọi lại lệnh ghi |

**Kết luận:** các câu này chạy ở bước đánh giá, sau khi bản thử của Lab chạy được.
Kết quả của chúng điền cột "mua" cạnh bản thử của Lab, không đổi quyết định dựng.
