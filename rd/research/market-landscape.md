# Thị trường nền tảng AI 2026: sản phẩm nào giải bài toán của Lab?

Ngày: 2026-11-17. Trạng thái: khảo sát qua tài liệu công bố, chưa chạy thử sản phẩm nào; giá là giá niêm yết.

Đây là hồ sơ bằng chứng: bảng chấm, trích dẫn và nguồn.
Bài học và kết luận rút gọn nằm ở [bài học từ thị trường](market-lessons.md); hướng đi chung nằm ở [tổng hợp phát hiện](../findings.md).

## Đọc nhanh

- Năm 2026 có ít nhất chín nhóm sản phẩm cùng bán một phần của việc "AI đề xuất, người duyệt, ghi an toàn".
- Trong mười một sản phẩm đã chấm, không sản phẩm nào đủ tám yêu cầu của Lab.
- Liyagent mạnh nhất về duyệt và lưu vết, StackOne mạnh nhất về che dữ liệu theo người hỏi; mỗi bên thiếu đúng phần bên kia làm tốt.
- Không sản phẩm nào gộp ba việc trên cùng một lần ghi: che dữ liệu theo người hỏi, duyệt gắn với đúng nội dung, và chống ghi trùng.
- Đề xuất: tự dựng một cổng mỏng làm đúng ba việc đó, chép mẫu thiết kế từ các sản phẩm này, và dùng sản phẩm làm mốc so sánh.

## 1. Câu hỏi và cách làm

Câu hỏi hẹp: sản phẩm nào đang bán trên thị trường giải bài toán của Lab, giải đến đâu, và có thay được bản dựng của Lab không.

Bài toán của Lab lấy từ [PRD, mục 6](../problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc): một agent đọc dữ liệu, kiểm quyền, đề xuất thay đổi, chỉ ghi sau khi người có quyền xác nhận, không ghi trùng khi gửi lại, và để lại một vết xuyên suốt.
Tám yêu cầu SR1-SR8 là thước đo, không phải danh sách tính năng.

Phạm vi: chín nhóm sản phẩm; mười một sản phẩm hoặc tổ hợp được chấm trong ma trận.
Các tên còn lại chỉ để chỉ nhóm; mỗi tên có một trang chính ở [mục 8.2](#82-trang-chính-của-các-tên-chỉ-nhóm) để tra, không dùng để kết luận cơ chế.
Không khảo sát toàn bộ thị trường, không xếp hạng nhà cung cấp, không mua hoặc dùng thử sản phẩm nào.

Lượt đọc đầu (2026-11-16) chấm tám sản phẩm.
Lượt rà ngày 2026-11-17 tìm chỗ sót và chấm thêm ba sản phẩm (StackOne, Arcade, Auth0 for AI Agents), vì chúng chạm đúng các câu kết luận của lượt đầu.

Cách chấm một ô:

| Mức | Nghĩa |
| --- | --- |
| Đ | Tài liệu chính thức nêu cơ chế đáp ứng phép thử của yêu cầu, khi triển khai đúng. |
| P | Có cơ chế giúp được một phần, nhưng thiếu ít nhất một điều kiện của phép thử. |
| K | Tài liệu nói rõ sản phẩm không có cơ chế đó, hoặc cơ chế làm ngược yêu cầu. |
| ? | Không tìm thấy trong lượt đọc này. Không có nghĩa là sản phẩm không có. |

Ba mức nguồn:

- **E1**: tài liệu chính thức, trang giá, đặc tả hoặc mã nguồn của sản phẩm.
- **E2**: trang sản phẩm, bài giới thiệu chính thức nhưng ở mức mô tả.
- **E3**: bài đánh giá, blog bên thứ ba. Chỉ dùng để tìm manh mối, không dùng để kết luận.

Mọi nhận định về cơ chế đều trỏ về một nguồn ở [mục 8](#8-nguồn); ô nào không có nguồn riêng thì dựa trên tài liệu của chính sản phẩm đó.
Script `rd/checks/market-landscape.sh` mở lại từng câu trích và in `PASS` hoặc `MISS`.

**Kết luận:** đây là khảo sát tài liệu, đủ để loại nhóm sản phẩm và chọn ứng viên chạy thử, không đủ để nói sản phẩm nào an toàn trong production.

## 2. Bản đồ thị trường

Thị trường không bán một sản phẩm giải trọn bài toán của Lab.
Nó chia bài toán thành chín nhóm, mỗi nhóm làm tốt một tầng.

| Nhóm | Ví dụ | Việc nhóm này làm sẵn | Chỗ dừng trước bài toán của Lab |
| --- | --- | --- | --- |
| Nền tảng agent của cloud | AWS Bedrock AgentCore, Google Gemini Enterprise Agent Platform, Microsoft Foundry và Agent 365 | Runtime, cổng tool, danh tính, chính sách, quan sát | Mạnh ở hạ tầng; bước duyệt người, chống ghi trùng và che trường vẫn là phần của khách hàng |
| Cổng MCP và cổng agent | Kong AI MCP Proxy, Permit MCP Gateway, Preloop, Azure API Management, Cloudflare MCP Server Portals, Docker MCP Gateway, TrueFoundry, IBM ContextForge, agentgateway | Một cửa cho tool, xác thực, phân quyền theo tool, nhật ký | Chỉ kiểm được lời gọi tool; không biết nghiệp vụ, không tự chặn ghi trùng; có cổng còn để lách được bằng cách gọi thẳng server [N37] |
| Nền tảng quản trị agent độc lập | Liyagent, C1, Execlave, Assury | Chính sách, duyệt người, nhật ký, công tắc dừng agent | Phần lớn mới, ít bằng chứng độc lập, phạm vi và giá khác nhau |
| Danh tính và phân quyền | Microsoft Entra Agent ID, Okta Cross App Access, Auth0 for AI Agents, Cerbos, Oso | Hai lớp danh tính, token ngắn hạn, đồng thuận, luật quyền tách khỏi code | Ứng dụng phải tự gọi; lọc theo bản ghi nhiều hơn theo trường; duyệt có hiện nội dung (Auth0) nhưng không khóa nội dung lúc ghi |
| Uỷ quyền tool theo từng người | Arcade, Composio, Pipedream Connect, StackOne | Mỗi người nối tài khoản của mình, token giữ ngoài model, kho tool có sẵn; StackOne che trường theo người hỏi | Chủ yếu nối phần mềm SaaS bên ngoài; chưa thấy duyệt người và chống ghi trùng |
| Quy trình bền và bước duyệt | Temporal, AWS Step Functions, Inngest, Restate, UiPath Maestro, gotoHuman, HumanLayer | Giữ chờ, chạy lại, gửi yêu cầu duyệt ra Slack, email hoặc hộp duyệt | Không kiểm quyền nghiệp vụ; không bảo đảm hệ đích ghi một lần; chưa thấy lời duyệt gắn dấu vân tay nội dung |
| Nền tảng tích hợp | Workato, Zapier, n8n, MuleSoft | Nối nhiều hệ thống, connector sẵn | Luồng thường chạy bằng kết nối do người dựng luồng cài sẵn, không theo người yêu cầu (chưa kiểm từng sản phẩm) |
| Agent trong phần mềm nghiệp vụ | Salesforce Agentforce, Microsoft Copilot Studio | Agent chạy cạnh dữ liệu và bảng quyền sẵn có của chính phần mềm đó | Chỉ quản dữ liệu trong hệ của mình; danh bạ và danh sách task của Lab nằm ngoài |
| Cổng model và quan sát | Portkey, LiteLLM, Helicone, LangSmith | Định tuyến model, đếm token, trace | Không phải cửa ghi vào hệ thống nghiệp vụ |

Các SDK agent như OpenAI Agents SDK, Claude Agent SDK, Google ADK và Microsoft Agent Framework nằm ở tầng runtime, đã khảo sát ở [kiến trúc hệ thống thật](real-system-architectures.md) [N27]; bài này không chấm lại.

Ba quan sát dẫn tới phần còn lại của bài:

1. **Lớp kiểm soát đã thành sản phẩm.** Không còn phải thuyết phục rằng agent cần danh tính, chính sách và nhật ký; thị trường đã bán ba thứ đó.
2. **Lớp ghi an toàn vẫn rời rạc.** Không nhóm nào nhận trách nhiệm cho toàn bộ chuỗi "đề xuất, duyệt đúng nội dung, ghi một lần, trả kết quả cũ khi gửi lại".
3. **Mỗi mảnh khó đã có một sản phẩm làm, nhưng ở nhóm khác nhau.** Duyệt theo nội dung nằm ở nhóm quản trị agent (Liyagent), che trường theo người nằm ở nhóm uỷ quyền tool (StackOne); cloud lớn mạnh ở danh tính và hạ tầng nhưng để phần ghi cho khách hàng.

**Kết luận:** bài toán của Lab nằm đúng chỗ giao nhau mà thị trường chưa đóng gói trọn; đây là lý do vẫn cần một bản dựng nhỏ, nhưng bản dựng phải so với sản phẩm, không được giả vờ rằng chưa ai làm.

## 3. Chấm theo tám yêu cầu

Tám yêu cầu lấy nguyên văn từ [PRD, mục 6](../problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc).
Mỗi ô trả lời một câu: nếu chỉ dùng sản phẩm này, phép thử của yêu cầu có tự đạt không.

### 3.1. Nhóm gần đủ

| Yêu cầu | Liyagent | Preloop | Permit | AWS AgentCore |
| --- | --- | --- | --- | --- |
| SR1 (danh tính và một cửa ghi) | Đ | P | Đ | Đ |
| SR2 (luật chạy được) | Đ | Đ | P | Đ |
| SR3 (phạm vi quyền) | P | P | P | P |
| SR4 (điểm dừng rủi ro) | Đ | P | P | P |
| SR5 (không chắc thì chặn) | P | Đ | Đ | Đ |
| SR6 (không ghi trùng) | P | ? | ? | ? |
| SR7 (vết xuyên suốt) | Đ | Đ | P | P |
| SR8 (dùng lại, quyền theo người) | Đ | P | Đ | Đ |

### 3.2. Nhóm uỷ quyền theo người

| Yêu cầu | StackOne | Arcade | Auth0 for AI Agents |
| --- | --- | --- | --- |
| SR1 (danh tính và một cửa ghi) | P | Đ | P |
| SR2 (luật chạy được) | Đ | P | P |
| SR3 (phạm vi quyền) | Đ | P | P |
| SR4 (điểm dừng rủi ro) | ? | ? | P |
| SR5 (không chắc thì chặn) | K | P | ? |
| SR6 (không ghi trùng) | ? | ? | ? |
| SR7 (vết xuyên suốt) | P | P | ? |
| SR8 (dùng lại, quyền theo người) | Đ | Đ | P |

### 3.3. Nhóm một lớp

| Yêu cầu | Microsoft Agent 365 và Foundry | Google Agent Platform | Kong AI MCP Proxy | Temporal và Step Functions |
| --- | --- | --- | --- | --- |
| SR1 (danh tính và một cửa ghi) | Đ | P | P | K |
| SR2 (luật chạy được) | P | P | K | K |
| SR3 (phạm vi quyền) | P | P | K | K |
| SR4 (điểm dừng rủi ro) | P | ? | K | P |
| SR5 (không chắc thì chặn) | P | P | K | K |
| SR6 (không ghi trùng) | ? | ? | ? | P |
| SR7 (vết xuyên suốt) | P | P | P | P |
| SR8 (dùng lại, quyền theo người) | P | P | P | K |

### 3.4. Đếm để so, không phải điểm chất lượng

| Sản phẩm | Đ | P | K | ? | Điểm mạnh | Điểm yếu |
| --- | --- | --- | --- | --- | --- | --- |
| Liyagent | 5 | 3 | 0 | 0 | SR1 (danh tính), SR4 (duyệt), SR7 (vết) | SR3 (trường dữ liệu), SR5 (mặc định từ chối), SR6 (phụ thuộc đích) |
| AWS AgentCore | 4 | 3 | 0 | 1 | SR1 (danh tính), SR2 (Cedar), SR5 (deny mặc định), SR8 (dùng lại) | SR4 (duyệt người), SR6 (ghi trùng) |
| Preloop | 3 | 4 | 0 | 1 | SR2 (luật), SR5 (fail-closed), SR7 (vết) | SR1 (người yêu cầu), SR6 (ghi trùng), SR8 (một phần) |
| Permit | 3 | 4 | 0 | 1 | SR1 (danh tính), SR5 (deny mặc định), SR8 (dùng lại) | SR4 (duyệt nội dung), SR6 (ghi trùng) |
| StackOne | 3 | 2 | 1 | 2 | SR2 (deny thắng, luật theo giá trị), SR3 (che trường), SR8 (theo người) | SR4 (duyệt), SR5 (mặc định cho qua), SR6 (ghi trùng) |
| Arcade | 2 | 4 | 0 | 2 | SR1 (OAuth từng người), SR8 (một lớp cho mọi client) | SR4 (duyệt), SR6 (ghi trùng); luật do khách tự viết |
| Microsoft Agent 365 | 1 | 6 | 0 | 1 | SR1 (danh tính), SR7 (vết một phần) | SR2 (luật theo tham số), SR6 (ghi trùng) |
| Google Agent Platform | 0 | 6 | 0 | 2 | SR5 (IAM chặn mặc định), SR7 (vết một phần) | SR4 (duyệt người), SR6 (ghi trùng) |
| Auth0 for AI Agents | 0 | 5 | 0 | 3 | SR4 (duyệt có nội dung, có hạn) | SR5, SR6, SR7 chưa thấy; không có cổng chung |
| Kong AI MCP Proxy | 0 | 3 | 4 | 1 | SR1 (consumer), SR8 (dùng lại một phần) | SR2, SR3, SR4, SR5, SR6 |
| Temporal và Step Functions | 0 | 3 | 5 | 0 | SR4 (chờ, [N25] [N26]), SR6 (chạy lại một phần), SR7 (lịch sử chạy) | SR1, SR2, SR3, SR5, SR8 |

### 3.5. Điều bảng cho thấy

- **Không cột nào có đủ tám dấu Đ.** Liyagent gần nhất với 5 dấu Đ và 3 dấu P.
- **SR3 (phạm vi quyền) có đúng một dấu Đ: StackOne.** Chính sách "Read a field" che một trường trong kết quả và "Write a field" từ chối lệnh đổi trường đó, theo từng người hoặc nhóm [N35]. Đây đúng hai phép thử của SR3: chị Hoa tra anh Minh không thấy số điện thoại cá nhân; Nam không đổi được người phụ trách task.
- **SR4 (điểm dừng rủi ro) vẫn chỉ có một dấu Đ: Liyagent.** Liyagent gắn lời duyệt với dấu vân tay nội dung (digest: chuỗi ngắn tính từ nội dung, đổi một chữ là đổi theo), dùng một lần và có hạn. Auth0 đứng thứ hai: người duyệt thấy đúng nội dung trên thiết bị riêng và yêu cầu có hạn, nhưng không có gì chặn lệnh ghi nếu nội dung đổi sau khi duyệt [N29] [N30].
- **SR6 (không ghi trùng) không có dấu Đ.** Liyagent là sản phẩm duy nhất trong lượt đọc này gửi và ghi lại `idempotency_key`, nhưng hiệu lực vẫn phụ thuộc hệ đích có tôn trọng khóa đó hay không. Đây đúng là giới hạn PRD đã ghi.
- **Sản phẩm mạnh SR3 lại yếu SR5.** StackOne mặc định cho qua khi không có luật cấm nào khớp ("An allow rule restricts nothing"), không áp chính sách theo người cho lời gọi bằng API key của dự án, và trả nguyên văn kết quả không quét được [N35]. Che trường mà mặc định cho qua thì chỉ an toàn khi mọi đường gọi đều đi qua phiên có danh tính người.
- **SR1, SR2, SR5 và SR8 đã được thị trường phủ tương đối tốt.** SR7 có hai sản phẩm đủ và phần còn lại chỉ một phần. Phần khó còn lại không phải danh tính hay chính sách, mà là ngữ nghĩa của lần ghi.
- **Với Temporal và Step Functions, dấu P ở SR6** nghĩa là engine bảo đảm bước chạy lại, không bảo đảm hệ đích ghi một lần.

**Kết luận:** thị trường đã bán sẵn lớp kiểm soát, và từng mảnh khó đều đã có một sản phẩm làm: SR3 ở StackOne, SR4 ở Liyagent.
Không sản phẩm nào gộp SR3 (che trường), SR4 (duyệt theo nội dung) và SR6 (chống ghi trùng ở đích) trên cùng một đường ghi.
Ghép hai sản phẩm thì có hai bảng quyền, hai sổ vết, và vẫn thiếu SR6.
Chống ghi trùng bằng mã riêng cho mỗi lệnh là mẫu quen thuộc của các API thanh toán, và PRD đã ghi đây là việc của hệ đích.
Đó đúng là cổng mỏng Lab dựng.

## 4. Những sản phẩm gần nhất

### 4.1. Liyagent

Liyagent là nền tảng agent có quản trị, chạy hosted, self-hosted hoặc phủ lên agent đã có.
Nó nhận MCP, OpenAPI, OData và A2A, và phủ được lên agent đã chạy ở nơi khác [N4] [N28].

**Giải gì.**

- **SR1 (danh tính và một cửa ghi):** biên lai ghi `on_behalf_of`, `run_as` và `invoker`, nên tách người yêu cầu khỏi bên thực hiện [N1].
- **SR2 (luật chạy được):** chính sách Cedar, và một lệnh `forbid` luôn thắng `permit` [N3].
- **SR4 (điểm dừng rủi ro):** mỗi lời duyệt gắn với `digest` của đúng phiên bản yêu cầu; lời duyệt dùng một lần và hết hạn; có chế độ bốn mắt và kiểm người duyệt có đủ quyền làm chính việc đó [N1] [N2].
- **SR6 (không ghi trùng):** biên lai ghi `idempotency_key` đã gửi cho hệ đích; khóa chỉ có hiệu lực nếu hệ đích tôn trọng nó [N1].
- **SR7 (vết xuyên suốt):** mỗi lần chạy có vết từng bước, chi phí, và một sổ biên lai nối bằng hash, xuất được gói ký để kiểm ngoại tuyến [N1] [N28].
- **SR8 (dùng lại, quyền theo người):** nhận MCP, OpenAPI, OData, A2A; agent của khách hoặc agent đã chạy ở nơi khác đăng ký vào cùng lớp quản trị [N28].

**Dừng ở đâu.**

- **SR3 (phạm vi quyền):** tài liệu nói Cedar trên tool, tài nguyên và tham số, nhưng không nêu cơ chế che trường trả về theo người yêu cầu.
- **SR5 (không chắc thì chặn):** có `forbid` thắng `permit`, nhưng lượt đọc này không thấy câu "mặc định từ chối" cho mọi trường hợp; cần kiểm khi chạy thử.
- **Mã nguồn:** bán theo subscription hoặc giấy phép; mã nguồn không nằm trong gói nào [N4]. Lab không đọc được ruột để dạy hoặc đo.

**Giá và quy mô.**
Team 99 USD mỗi agent mỗi tháng, gồm 2.000 lượt chạy mỗi agent, vượt thì 0,02 USD mỗi lượt; không tính theo người [N4].
Business và self-hosted báo giá riêng.
Sản phẩm mới, chưa có kiểm chứng độc lập.

**Kết luận:** đây là sản phẩm gần đủ nhất và là mốc để Lab so.
Nếu mục tiêu là đưa vào công ty, Liyagent đáng một buổi chạy thử với dữ liệu giả; nếu mục tiêu là nghiên cứu, nó là hộp đen không dùng làm nền được.

### 4.2. StackOne

StackOne là lớp nối agent với phần mềm SaaS (nhân sự, tuyển dụng, CRM...), có connector dựng sẵn và cho khách tự dựng connector riêng [N36].
Tool Policies là phần quản trị: chính sách áp lên "thành viên" mà agent đang làm thay, kiểm trước khi lời gọi tới hệ đích [N35].

**Giải gì.**

- **SR2 (luật chạy được):** một lệnh cấm luôn thắng ("A deny always wins"); luật theo giá trị kiểm tham số trước khi tool chạy, ví dụ chỉ cho trạng thái `Draft` hoặc `Submitted` [N35].
- **SR3 (phạm vi quyền):** "Read a field" che trường trong kết quả, "Write a field" từ chối lệnh đổi trường; áp theo người hoặc nhóm, có thể giới hạn theo connector hoặc tài khoản [N35]. Đây là cơ chế duy nhất trong lượt đọc này đạt đúng phép thử SR3.
- **SR8 (dùng lại, quyền theo người):** chính sách đi theo người qua các AI client nối vào StackOne, không phải sửa connector [N35].

**Dừng ở đâu.**

- **SR1 (danh tính và một cửa ghi):** chính sách chỉ áp khi biết người; lời gọi bằng API key của dự án là "memberless" và phải quản bằng cách khác [N35].
- **SR5 (không chắc thì chặn):** luật cho phép không giới hạn gì, nên không có luật cấm nào khớp thì lời gọi được qua; kết quả không quét được thì trả về chưa che [N35]. Đây là mặc định cho qua, ngược với SR5.
- **SR4 và SR6:** không thấy bước duyệt người hay khóa chống ghi trùng.
- **SR7 (vết xuyên suốt):** nhật ký ghi lại quyết định của chính sách [N35]; không thấy chi phí model trong cùng vết.

**Giá và quy mô.**
Gói Team 600 USD mỗi tháng; Tool Policies chỉ có ở một số gói [N35] [N36].

**Kết luận:** StackOne cho thấy che trường theo người hỏi đã là tính năng bán được, nên Lab chép mẫu "che khi đọc, từ chối khi ghi" thay vì tự nghĩ.
Nó không thay được cổng của Lab vì mặc định cho qua và không có duyệt.

### 4.3. Preloop

Preloop là bộ điều khiển agent mã nguồn mở Apache-2.0, tự chạy được.
Nó gộp tường lửa MCP, cổng model, chính sách bằng CEL, duyệt người và nhật ký trong một sản phẩm [N5].

**Giải gì.**

- **SR2 (luật chạy được):** luật CEL đọc được tham số, không chỉ tên tool [N5].
- **SR5 (không chắc thì chặn):** lỗi transport và hết thời gian chờ mặc định đóng; timeout là từ chối, không phải cho qua [N6].
- **SR7 (vết xuyên suốt):** mỗi hành động ghi tool, tham số, luật khớp, người duyệt, chi phí model và kết quả; có sổ vết nối hash [N5].
- **SR8 (dùng lại, quyền theo người):** bất kỳ agent MCP nào cũng đi qua được, có CLI tự cấu hình lại agent [N5]. Quyền theo người yêu cầu vẫn là phần thiếu, xem SR1.

**Dừng ở đâu.**

- **SR1 (danh tính và một cửa ghi):** định danh và ngân sách tính theo agent hoặc API key, không thấy mô hình hai lớp "người yêu cầu" và "agent thực hiện" như SR1 yêu cầu [N5].
- **SR4 (điểm dừng rủi ro):** yêu cầu duyệt giữ đúng tham số và có hạn, nhưng tài liệu không nêu digest của nội dung đã duyệt; một yêu cầu bị sửa có thể là một yêu cầu mới, chưa thấy cơ chế khóa nội dung.
- **SR6 (không ghi trùng):** không thấy khóa idempotency cho lời gọi tool; phần "durable callback receipts" là cho callback, không phải cho ghi nghiệp vụ.
- **SR3 (phạm vi quyền):** lọc tham số và che dữ liệu trong log, không phải che trường trả về theo quyền.

**Giá và quy mô.**
Bản OSS miễn phí; cloud từ 0 đến 350 USD mỗi tháng; self-host Business 6.000 USD mỗi năm cho tới 25 người dùng [N7].
Bản OSS chỉ một người vận hành, phù hợp Lab hơn là công ty.

**Kết luận:** đây là bản tham chiếu mã nguồn tốt nhất cho cổng và chính sách, và là ứng viên để Lab đọc cách làm fail-closed.
Nó không đủ cho SR1, SR6 và một phần SR8, nên không thể là lời giải trọn.

### 4.4. Permit MCP Gateway

Permit là sản phẩm phân quyền đã có trước MCP, nay có cổng MCP.
Cổng xác thực người đứng sau agent, kiểm từng lời gọi theo chính sách, xin đồng thuận và ghi nhật ký [N8].

**Giải gì.**

- **SR1 (danh tính và một cửa ghi):** mỗi lời gọi gắn với một người và một agent; người uỷ quyền bằng đồng thuận, quyền của agent không vượt quá quyền sống của người [N8].
- **SR5 (không chắc thì chặn):** mặc định từ chối; chưa cấp quyền thì chưa gọi được [N8].
- **SR8 (dùng lại, quyền theo người):** mọi client MCP trỏ vào một URL cổng, không phải sửa server [N8].

**Dừng ở đâu.**

- **SR2 (luật chạy được):** chính sách theo tool, mức tin cậy và vai; không thấy điều kiện theo tham số như "chỉ chuyển task của phòng mình".
- **SR4 (điểm dừng rủi ro):** duyệt người có, nhưng chỉ ở gói Enterprise, bật theo tool hoặc theo ngưỡng tin cậy; thẻ duyệt hiện đúng tham số, hết 5 phút thì từ chối [N9]. Không thấy digest nội dung, và "trusted agent bypass" cho phép bỏ qua duyệt [N9].
- **SR6 (không ghi trùng):** không thấy khóa idempotency.
- **SR7 (vết xuyên suốt):** nhật ký có người, agent, tool, quyết định; không thấy chi phí model.

**Giá và quy mô.**
Pro từ 25 USD mỗi tháng, tới 50.000 người dùng hoạt động; duyệt người, on-prem và SLA cao chỉ có ở Enterprise, báo giá riêng [N10].
Đây là mức giá của lớp danh tính, không phải của một lần ghi.

**Kết luận:** Permit trả lời tốt câu "ai được dùng tool nào", không trả lời câu "có được ghi đúng nội dung này không".
Nó là ứng viên cho SR1 và SR8, không phải cho SR4 và SR6.

### 4.5. AWS Bedrock AgentCore

AgentCore là bộ dịch vụ agent có quản trị của AWS.
Cổng Gateway gom tool, agent và model vào một đầu cuối; Policy dùng Cedar hoặc Dogwood (ngôn ngữ chính sách mã nguồn mở tương thích Cedar); Identity giữ danh tính; Observability xuất telemetry [N11] [N12].

**Giải gì.**

- **SR1 (danh tính và một cửa ghi):** danh tính lấy từ JWT hoặc IAM; khi đi qua Gateway, Runtime rồi Gateway, Workload Access Token giữ người gọi gốc qua các chặng [N13].
- **SR2 (luật chạy được):** chính sách Cedar/Dogwood, mặc định từ chối, `forbid` thắng `permit` [N12].
- **SR4 (điểm dừng rủi ro):** chính sách theo thời gian có thể đòi một hành động phê duyệt trước đó trong cùng phiên, khớp theo trường dữ liệu [N13].
- **SR5 (không chắc thì chặn):** mặc định từ chối là ngữ nghĩa của bộ luật [N12].
- **SR8 (dùng lại, quyền theo người):** đầu cuối MCP, client nào hỗ trợ MCP cũng gọi được, quyền theo người gọi [N11].

**Dừng ở đâu.**

- **SR4:** "phê duyệt" là một hành động tool trước đó, không phải màn hình duyệt cho người; không có digest nội dung, không có hạn của lời duyệt. Người duyệt vẫn phải tự dựng.
- **SR6 (không ghi trùng):** `clientToken` chỉ dùng khi tạo gateway, không phải mã chống ghi trùng cho lời gọi tool [N15]. AWS Well-Architected tự khuyên khách hàng tự sinh khóa idempotency và tự kiểm kết quả cũ [N16].
- **SR3 (phạm vi quyền):** chính sách đọc được tham số; che trường trả về phải làm bằng interceptor hoặc bộ nối, không phải cơ chế sẵn [N12].
- **SR7 (vết xuyên suốt):** có OTel và CloudWatch, nhưng phải tự nối danh tính người dùng, quyết định và chi phí thành một vết.
- **Giới hạn phiên:** tối đa 20 chính sách thời gian mỗi bộ luật, cửa sổ tối đa 24 giờ, nhiều chặng chỉ trong cùng account và region [N13].

**Giá và quy mô.**
5 USD mỗi triệu lần gọi tool, 25 USD mỗi triệu lần đánh giá chính sách, 25 USD mỗi triệu lần tìm tool [N14].
Ở quy mô Lab, chi phí gần bằng 0; ở quy mô công ty, cổng là dịch vụ chạy thật, có rate limit và quota.

**Kết luận:** AgentCore là nền móng mạnh nhất trong nhóm cloud, nhưng vẫn thiếu đúng hai thứ Lab cần tự làm: duyệt người có ràng buộc nội dung và chống ghi trùng ở đích.
Nó là lựa chọn tốt cho một công ty đã ở AWS, không phải lời giải trọn cho Lab.

### 4.6. Arcade và Auth0, hai cách uỷ quyền theo người

**Arcade** là lớp chạy tool cho agent, giữ OAuth của từng người và kiểm quyền ở từng hành động lúc chạy [N33].
Agent gọi tool thay người dùng bằng chính quyền của người đó, nên SR1 và SR8 đạt khi triển khai đúng [N33].
Phần quyết định nằm ở các hook: hook trước khi chạy cho phép, chặn hoặc sửa tham số; hook sau khi chạy sửa được kết quả, "Use it to redact PII or filter content" [N34].
Nhưng luật trong hook do khách tự viết và tự chạy, nên SR2 và SR3 chỉ đạt một phần.
Mỗi hook chọn được "Fail closed" hoặc "Fail open" khi webhook không trả lời [N34]; SR5 phụ thuộc cấu hình.
Nhật ký xuất qua OpenTelemetry [N33]; không thấy duyệt người và chống ghi trùng.

**Auth0 for AI Agents** đi từ phía danh tính.
Token Vault giữ token của từng người để agent gọi API bên ngoài thay người đó [N31]; Auth0 FGA kiểm quyền theo từng tài liệu trước khi đưa cho model [N32].
Điểm đáng chú ý là duyệt bất đồng bộ: agent gửi yêu cầu CIBA (luồng xin duyệt trên thiết bị riêng của người dùng) kèm RAR (mô tả có cấu trúc của đúng giao dịch cần duyệt) [N29].
Yêu cầu hết hạn sau 300 giây nếu không đặt khác [N30].
Nhưng RAR là tuỳ chọn ("Using RAR is optional for a CIBA flow"), và tài liệu không nói lệnh ghi bị chặn nếu nội dung đổi sau khi duyệt [N29].
Hệ đích phải tự so token với lệnh, nên SR4 chỉ đạt một phần.

**Kết luận:** cả hai giải tốt câu "agent đang làm thay ai" và cho Lab hai mẫu đáng chép: hook trước và sau lời gọi (Arcade), duyệt trên kênh riêng kèm nội dung có cấu trúc (Auth0).
Không cái nào là cửa ghi có duyệt và chống ghi trùng.

### 4.7. Microsoft và Google

Hai nhà này tiếp cận bài toán từ hai phía khác nhau.

**Microsoft** mạnh ở danh tính và quản trị agent.
Entra Agent ID tách người yêu cầu và agent: "The subject of the token is a user, while the actor is the agent identity" [N20].
Agent 365 là mặt phẳng quản trị: danh mục agent, gói quyền, điều kiện truy cập, nhật ký Purview, và điều khiển tool nào agent được dùng trong toàn tenant [N21].
Foundry có bước duyệt người ở mức ứng dụng: chuỗi `multi_turn_task` dừng vô hạn, người trả lời thì chạy tiếp [N23].
Nhưng quyền tool là theo tool, không theo tham số; duyệt không gắn digest; không thấy idempotency; theo trang sản phẩm, Agent 365 giá 15 USD mỗi người mỗi tháng, chưa gồm Foundry [N22].

**Google** mạnh ở danh tính agent và quan sát.
Agent Identity dùng SPIFFE, tách ba lớp: người dùng, agent, và uỷ quyền [N19].
Agent Gateway chặn mặc định mọi kết nối nếu chưa có chính sách IAM [N18].
Semantic governance viết luật bằng ngôn ngữ tự nhiên, nhưng chính tài liệu cảnh báo mô hình ngôn ngữ có thể sai: "LLMs are probabilistic and can make mistakes" [N17].
Không thấy bước duyệt người, không thấy idempotency, và phần lớn còn ở giai đoạn preview [N18].

**Kết luận:** cả hai đều đáng dùng nếu công ty đã ở hệ sinh thái tương ứng và cần danh tính, danh mục, nhật ký.
Cả hai đều không đủ cho một lần ghi nghiệp vụ có duyệt nội dung và chống ghi trùng.

### 4.8. Kong và Cloudflare, hai ví dụ về cổng thuần

Kong AI MCP Proxy chuyển API thành tool MCP, xác thực bằng plugin, phân quyền theo consumer và ghi audit [N24].
Nó làm tốt phần dùng lại của SR8: một cổng cho nhiều client MCP.
Nhưng ACL chỉ theo tool và consumer, không theo tham số; và tài liệu ghi rõ: không cấu hình ACL thì lời gọi được cho qua [N24].

Cloudflare MCP Server Portals gom nhiều server MCP sau một địa chỉ và ẩn hoặc hiện server theo chính sách Access.
Tài liệu cảnh báo người bị chặn vẫn gọi được server bằng URL trực tiếp, "and bypass your Access policies", trừ khi server tự dùng Access làm nơi xác thực [N37].

**Kết luận:** cổng MCP là hạ tầng cần, không phải lớp quyết định nghiệp vụ.
Cổng chỉ an toàn khi nó là đường duy nhất tới hệ đích; nếu còn đường gọi thẳng thì cổng chỉ là bảng chỉ đường.

## 5. Bốn trục của chương trình

Chương trình yêu cầu so chi phí, khả năng mở rộng, bảo mật và bảo trì.
Bảng dưới chỉ dùng số công bố; ô nào không có thì ghi rõ.
Ô giá Microsoft đọc từ trang sản phẩm, chưa tự kiểm bằng curl.

| Trục | Liyagent | Preloop | Permit | AWS AgentCore | StackOne | Microsoft Agent 365 | Google Agent Platform |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chi phí | 99 USD mỗi agent mỗi tháng, 2.000 lượt chạy, vượt 0,02 USD mỗi lượt; self-host báo giá | OSS miễn phí; cloud 0 đến 350 USD mỗi tháng; self-host 6.000 USD mỗi năm | Pro từ 25 USD mỗi tháng; duyệt người và on-prem chỉ Enterprise | 5 USD mỗi triệu lời gọi tool; 25 USD mỗi triệu lần đánh giá chính sách; runtime tính riêng | Team 600 USD mỗi tháng; Tool Policies theo gói | 15 USD mỗi người mỗi tháng, chưa gồm Foundry | Tính theo vCPU-giờ và lưu trữ; chưa có bảng giá riêng cho cổng trong lượt đọc này |
| Mở rộng | Nhiều bản sao sau bộ cân bằng tải; trần theo gói agent và lượt chạy | Tự chạy, trần do hạ tầng của khách | 50.000 người dùng hoạt động ở Pro; Enterprise không giới hạn | Serverless; rate limit theo target; 20 chính sách thời gian mỗi bộ luật | SaaS; tính theo credit mỗi lời gọi | Theo số người dùng, không theo agent | 5.000 tài nguyên mỗi cổng [N18]; phần lớn còn preview |
| Bảo mật | Cedar, digest, duyệt một lần, bốn mắt, sổ vết nối hash | CEL theo tham số, fail-closed, sổ vết nối hash; thiếu danh tính người yêu cầu | Người và agent tách rời, đồng thuận, deny mặc định; duyệt theo tool | Cedar, deny mặc định, WAT; thiếu duyệt người và idempotency | Che trường theo người, deny thắng; mặc định cho qua, lời gọi bằng API key không theo người | Entra hai lớp, Purview, điều kiện truy cập; thiếu luật theo tham số | SPIFFE, IAM chặn mặc định; luật ngôn ngữ tự nhiên không tất định |
| Bảo trì | Một nền tảng, hosted hoặc self-host; mã nguồn đóng | Tự vận hành; OSS; nhiều thành phần | SaaS hoặc on-prem; chính sách nằm ở Permit | Nhiều dịch vụ AWS; IAM; khóa vào AWS | SaaS; connector riêng phải dựng trên nền StackOne | Nhiều sản phẩm Microsoft; cấu hình phân tán | Nhiều dịch vụ Google; preview thay đổi |

**Đọc bảng này thế nào.**

- **Chi phí thấp nhất không phải là rẻ nhất.** AgentCore rẻ trên mỗi lời gọi nhưng cần người dựng và vận hành; Liyagent 99 USD mỗi agent nhưng gồm sẵn duyệt và sổ vết.
- **Mở rộng không phải nút thắt của Lab.** Ở quy mô 100 task và một agent, mọi lựa chọn đều đủ nhanh; chỉ sản phẩm phải chịu được 10 lần agent và 10 lần tool mới đáng bàn.
- **Bảo mật khác nhau ở chỗ ai giữ quyết định.** Sản phẩm càng đóng, càng khó chứng minh quyết định đúng; sản phẩm càng mở, càng nhiều việc vận hành.
- **Bảo trì là chi phí ẩn lớn nhất.** Mỗi sản phẩm thêm vào là một bảng quyền, một chỗ cấu hình và một chỗ có thể sai.

**Kết luận:** không có lựa chọn nào thắng mọi trục.
Liyagent thắng ở bảo mật của lần ghi nhưng thua ở minh bạch; StackOne thắng ở che dữ liệu nhưng mặc định cho qua; AgentCore thắng ở hạ tầng nhưng thua ở chi phí tích hợp; Preloop thắng ở tự chủ nhưng thua ở danh tính người yêu cầu.

## 6. Trả lời câu hỏi

### 6.1. Sản phẩm có giải bài toán của công ty không?

Có, nhưng theo ba nghĩa khác nhau.

- **Nếu công ty cần "ai được dùng tool nào"**, Permit hoặc AgentCore giải được phần lớn SR1, SR2, SR5, SR8, và có nhật ký cho SR7.
- **Nếu công ty cần "agent chỉ thấy đúng trường người hỏi được thấy"**, StackOne là sản phẩm duy nhất trong lượt đọc này công bố che trường và chặn ghi trường theo người, với điều kiện mọi lời gọi đi qua phiên có danh tính.
- **Nếu công ty cần "ghi an toàn có duyệt"**, Liyagent là sản phẩm duy nhất công bố gần đủ chuỗi: danh tính hai lớp, Cedar, digest, duyệt một lần, idempotency key, sổ vết nối hash.

Cần cả ba thì phải ghép ít nhất hai sản phẩm, và chưa đường ghép nào được kiểm chứng độc lập.
Liyagent và StackOne đều là sản phẩm hoặc tính năng mới; Permit thiếu SR4 và SR6; Preloop thiếu SR1, SR6 và một phần SR8; AgentCore để phần ghi cho khách hàng.

### 6.2. Sản phẩm có giải bài toán của Lab không?

Không.

Lý do chính nằm ở bài toán, không nằm ở việc Lab muốn tự làm.
Mục 3 cho thấy không sản phẩm nào đạt cả ba phép thử SR3 (che trường), SR4 (duyệt theo nội dung) và SR6 (không ghi trùng).
Ví dụ: dùng Liyagent thì chị Hoa tra anh Minh vẫn thấy số điện thoại cá nhân; dùng StackOne thì duyệt xong rồi sửa người nhận T-12 mà lệnh vẫn được ghi.
Mua sản phẩm nào thì vẫn phải tự viết phần còn thiếu.

Hai lý do phụ, đúng cho sản phẩm đóng như Liyagent, StackOne, AgentCore:

1. **Không đo được phần bên trong.** Hai chỉ số đo của PRD, M1 (thời gian) và M5 (độ phức tạp vận hành), cần tách thời gian của model, bộ luật và cổng. Sản phẩm chạy sẵn trên mây không cho số đó.
2. **Không so được hai cách nối.** Lab phải đặt gọi hàm trực tiếp và MCP cạnh nhau trên cùng một cửa. Một sản phẩm thường chỉ hỗ trợ một cách.

Preloop là ngoại lệ: mã nguồn mở theo giấy phép Apache-2.0, nên đọc và đo được.
Vì vậy ADR phải so ba đường, không phải hai: mua, dựng trên nền mã nguồn mở (Preloop, bộ luật Cedar), và tự dựng từ đầu.
Preloop thiếu SR1 (người yêu cầu) và SR6, đúng hai chỗ khó nhất, nên dựng trên nó vẫn phải viết lại phần lõi.

### 6.3. Vậy Lab nên làm gì?

Giữ kế hoạch tự dựng cổng, nhưng đổi cách định vị:

- **Dựng cổng mỏng, không dựng lại cả nền tảng.** Cổng chỉ làm bốn việc: kiểm quyền theo tham số và theo trường, kiểm lời duyệt theo nội dung, ghi một lần, ghi vết.
- **Mượn sáu mẫu thiết kế đã có tiền lệ:** danh tính hai lớp (Entra, Liyagent), luật tất định với lệnh cấm luôn thắng (Cedar, CEL, StackOne), che khi đọc và từ chối khi ghi theo trường (StackOne), duyệt gắn digest và dùng một lần (Liyagent), khóa idempotency ở đường ghi (PRD, AWS Well-Architected), sổ vết nối hash (Liyagent, Preloop).
- **Tránh ba phản mẫu đã thấy:** mặc định cho qua khi không có luật khớp (Kong, StackOne); lời gọi không mang danh tính người vẫn được phục vụ (StackOne); còn đường gọi thẳng server không qua cổng (Cloudflare).
- **Dùng sản phẩm làm mốc, không làm nền.** Chạy thử Liyagent, StackOne hoặc Preloop với dữ liệu giả để lấy một cột "mua" trong bảng so sánh, không đưa chúng vào đường ghi của Lab.
- **Thêm mục "mua hay dựng" vào ADR.** Câu trả lời không phải "luôn tự dựng"; câu trả lời là "tự dựng khi cần bằng chứng và so sánh; mua khi cần chạy thật nhanh và chấp nhận hộp đen".

Nếu mục tiêu đổi từ nghiên cứu sang triển khai, thứ tự chạy thử là: Liyagent (duyệt và vết), StackOne (che trường), Preloop (tự chủ, OSS), Permit (danh tính mạnh), AgentCore (nếu đã ở AWS).
Mỗi lần chạy thử dùng dữ liệu giả, không dùng dữ liệu thật, và chấm lại đúng tám phép thử.

### 6.4. Điều này có làm Lab mất giá trị không?

Không.
Nó làm Lab đổi loại giá trị.

Thị trường đã chứng minh bài toán là thật và lớp kiểm soát là cần.
Cái chưa có là bằng chứng so sánh hai cách nối, và một kết luận có số đo về việc khi nào MCP là sai.
Đó là phần Lab vẫn làm được mà không sản phẩm nào làm thay.

Một phát hiện phụ đáng giữ: **MCP là lựa chọn đúng cho tái sử dụng tool, nhưng sai nếu kỳ vọng nó tự kiểm quyền ghi.**
MCP định nghĩa cách tìm và gọi tool, không định nghĩa nghĩa vụ của một lần ghi.
Vì vậy kết luận "khi nào không nên dùng MCP" sẽ không phải "MCP chậm" hay "MCP đắt", mà là "MCP không phải lớp để giữ lời hứa an toàn".

**Kết luận:** giá trị của Lab chuyển từ "phát minh cổng" sang "đo và chứng minh cổng".
Đó là giá trị khó bị sản phẩm thay thế hơn.

## 7. Giả thuyết kiểm được

Mỗi giả thuyết dưới đây trả lời được bằng một lần chạy, không bằng đọc thêm tài liệu.

| Mã | Giả thuyết | Cách kiểm | Đạt khi |
| --- | --- | --- | --- |
| HM1 | Liyagent thật sự chặn lời duyệt cũ khi nội dung đổi | Dùng bản dùng thử, duyệt một đề xuất, sửa một trường, gửi lại | Lệnh bị từ chối với lỗi digest, không có bản ghi mới |
| HM2 | Preloop có thể mang danh tính người yêu cầu qua cổng | Cắm hai người dùng khác quyền vào cùng một agent, gọi cùng tool | Hai người nhận hai kết quả khác nhau theo quyền, không theo API key |
| HM3 | Chính sách thời gian của AgentCore bị lách bằng phiên mới | Duyệt một lần, mở phiên mới, gọi lại lệnh ghi | Lệnh bị chặn, hoặc đo được là lọt |
| HM4 | StackOne che đúng trường theo người, nhưng không che khi gọi bằng API key của dự án | Dựng connector giả cho danh bạ, cấm "Read a field" số điện thoại với nhóm của chị Hoa, gọi qua phiên AI và qua API key | Phiên AI che số điện thoại; lời gọi bằng API key trả hoặc không trả số đó, kèm log |
| HM5 | Ở quy mô Lab, chi phí mua thấp hơn chi phí dựng | Tính 1 agent, 100 lượt chạy, 2 tuần công | Mua rẻ hơn rõ, hoặc dựng rẻ hơn rõ, kèm số giờ công |
| HM6 | Token Auth0 xin bằng CIBA và RAR dùng được cho một lệnh khác nội dung đã duyệt | Duyệt chuyển T-12 cho anh Minh, dùng cùng token để chuyển T-12 cho Nam | Hệ đích từ chối, hoặc đo được là lọt nếu hệ đích không tự so |

HM1, HM3, HM4 và HM6 cho biết phần nào mua được, phần nào phải tự làm.
Kết quả của chúng không đổi quyết định dựng bản thử, vì mục 3 đã cho thấy không sản phẩm nào gộp SR3, SR4 và SR6.

**Kết luận:** không chạy giả thuyết nào trước khi dựng.
HM1, HM3, HM4 và HM6 chạy ở bước đánh giá, để lấy cột "mua" đặt cạnh bản thử của Lab.

## 8. Nguồn

Cột "tự kiểm" là `có` khi script `rd/checks/market-landscape.sh` mở lại URL và khớp nguyên văn ít nhất một câu dùng trong bài.
`chưa` nghĩa là script chưa mở lại và khớp câu trích, không có nghĩa trang sai.

### 8.1. Nguồn cho nhận định về cơ chế

| ID | Nguồn | Loại | URL | Tự kiểm |
| --- | --- | --- | --- | --- |
| N1 | Liyagent, trust ledger | Tài liệu | https://liyagent.com/docs/govern/trust-ledger | có |
| N2 | Liyagent, agent permissions | Tài liệu | https://liyagent.com/docs/govern/permissions | có |
| N3 | Liyagent, access | Tài liệu | https://liyagent.com/docs/govern/access | có |
| N4 | Liyagent, pricing | Trang giá | https://liyagent.com/pricing | có |
| N5 | Preloop, trang chính | Trang sản phẩm | https://preloop.ai/ | có |
| N6 | Preloop, approvals | Tài liệu | https://docs.preloop.ai/architecture/approvals/ | có |
| N7 | Preloop, pricing | Trang giá | https://preloop.ai/pricing | có |
| N8 | Permit MCP Gateway, docs | Tài liệu | https://docs.permit.io/permit-mcp-gateway/ | có |
| N9 | Permit, human-in-the-loop | Tài liệu | https://docs.permit.io/permit-mcp-gateway/human-in-the-loop/ | có |
| N10 | Permit, pricing | Trang giá | https://www.permit.io/mcp-gateway/pricing | có |
| N11 | AgentCore, gateway | Tài liệu | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html | có |
| N12 | AgentCore, policy core concepts | Tài liệu | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-core-concepts.html | có |
| N13 | AgentCore, temporal policies | Tài liệu | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-temporal.html | có |
| N14 | AgentCore, pricing | Trang giá | https://aws.amazon.com/bedrock/agentcore/pricing/ | có |
| N15 | AgentCore, create gateway | Tài liệu API | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-create-api.html | có |
| N16 | AWS Well-Architected, idempotency | Tài liệu kiến trúc | https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentrel06-bp04.html | có |
| N17 | Google, semantic governance | Tài liệu | https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/policies/semantic-governance-overview.md.txt | có |
| N18 | Google, Agent Gateway | Tài liệu | https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/agent-gateway-overview.md.txt | có |
| N19 | Google, Agent Identity auth models | Tài liệu | https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/agent-identity-overview.md.txt | có |
| N20 | Microsoft Entra, agent identities | Tài liệu | https://learn.microsoft.com/en-us/entra/agent-id/agent-identities | có |
| N21 | Microsoft Agent 365, service description | Tài liệu | https://learn.microsoft.com/en-us/office365/servicedescriptions/microsoft-agent-365/microsoft-agent-365 | có |
| N22 | Microsoft Agent 365, trang sản phẩm | Trang sản phẩm | https://www.microsoft.com/en-us/microsoft-agent-365 | chưa (trang trả lỗi 502 với curl) |
| N23 | Microsoft Foundry, human-in-the-loop | Tài liệu | https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/add-human-in-the-loop | có |
| N24 | Kong, AI MCP Proxy | Tài liệu | https://developer.konghq.com/plugins/ai-mcp-proxy/ | có |
| N25 | Temporal, human-in-the-loop cookbook | Tài liệu | https://docs.temporal.io/ai-cookbook/human-in-the-loop-python | có |
| N26 | AWS Step Functions, task token | Tài liệu | https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html | có |
| N27 | [Kiến trúc hệ thống thật](real-system-architectures.md) | Nội bộ | - | - |
| N28 | Liyagent, llms.txt | Tài liệu | https://liyagent.com/llms.txt | có |
| N29 | Auth0 for AI Agents, asynchronous authorization | Tài liệu | https://auth0.com/ai/docs/intro/asynchronous-authorization | có |
| N30 | Auth0, user authorization with CIBA | Tài liệu | https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-initiated-backchannel-authentication-flow/user-authorization-with-ciba.md | có |
| N31 | Auth0 for AI Agents, Token Vault | Tài liệu | https://auth0.com/ai/docs/intro/token-vault.md | có |
| N32 | Auth0 for AI Agents, authorization for RAG | Tài liệu | https://auth0.com/ai/docs/intro/authorization-for-rag.md | có |
| N33 | Arcade, chỉ mục tài liệu | Tài liệu | https://docs.arcade.dev/llms.txt | có |
| N34 | Arcade, how hooks work | Tài liệu | https://docs.arcade.dev/en/operate/governance/contextual-access/how-hooks-work | có |
| N35 | StackOne, Tool Policies | Tài liệu | https://docs.stackone.com/secure/policies.md | có |
| N36 | StackOne, chỉ mục tài liệu và trang giá | Tài liệu, trang giá | https://docs.stackone.com/llms.txt, https://www.stackone.com/pricing/ | có |
| N37 | Cloudflare, MCP server portals | Tài liệu | https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/ | có |

### 8.2. Trang chính của các tên chỉ nhóm

Các tên dưới đây chỉ dùng để chỉ nhóm ở mục 2.
Script chỉ kiểm rằng trang mở được và có tên sản phẩm, không kiểm cơ chế.

| Nhóm | Tên | Trang |
| --- | --- | --- |
| Cổng MCP | Azure API Management | https://learn.microsoft.com/en-us/azure/api-management/export-rest-mcp-server |
| Cổng MCP | Docker MCP Gateway | https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/ |
| Cổng MCP | TrueFoundry | https://www.truefoundry.com/mcp-gateway |
| Cổng MCP | IBM ContextForge | https://github.com/IBM/mcp-context-forge |
| Cổng MCP | agentgateway | https://agentgateway.dev/ |
| Quản trị agent | C1 | https://c1.ai/news/press-release/c1-launches-agent-runtime-governance |
| Quản trị agent | Execlave | https://execlave.com/ |
| Quản trị agent | Assury | https://assury.ai/ |
| Danh tính và phân quyền | Okta Cross App Access | https://www.okta.com/integrations/cross-app-access/ |
| Danh tính và phân quyền | Cerbos | https://www.cerbos.dev/blog/mcp-authorization |
| Danh tính và phân quyền | Oso | https://www.osohq.com/ |
| Uỷ quyền tool theo người | Composio | https://docs.composio.dev/docs/authentication |
| Uỷ quyền tool theo người | Pipedream Connect | https://pipedream.com/docs/connect |
| Quy trình và duyệt | Inngest | https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event |
| Quy trình và duyệt | Restate | https://restate.dev/ |
| Quy trình và duyệt | UiPath Maestro | https://www.uipath.com/platform/agentic-automation/agentic-orchestration |
| Quy trình và duyệt | gotoHuman | https://docs.gotohuman.com/human-reviews |
| Quy trình và duyệt | HumanLayer | https://pypi.org/project/humanlayer/ |
| Nền tảng tích hợp | Workato | https://www.workato.com/ |
| Nền tảng tích hợp | Zapier | https://zapier.com/mcp |
| Nền tảng tích hợp | n8n | https://n8n.io/ |
| Nền tảng tích hợp | MuleSoft | https://www.mulesoft.com/ |
| Agent trong phần mềm nghiệp vụ | Salesforce Agentforce | https://www.salesforce.com/agentforce/ |
| Agent trong phần mềm nghiệp vụ | Microsoft Copilot Studio | https://learn.microsoft.com/en-us/microsoft-copilot-studio/fundamentals-what-is-copilot-studio |
| Cổng model và quan sát | Portkey | https://portkey.ai/ |
| Cổng model và quan sát | LiteLLM | https://docs.litellm.ai/ |
| Cổng model và quan sát | Helicone | https://www.helicone.ai/ |
| Cổng model và quan sát | LangSmith | https://www.langchain.com/langsmith |

Giá và tên sản phẩm đọc ngày 2026-11-16, phần bổ sung đọc ngày 2026-11-17.
Một số sản phẩm đổi tên hoặc đổi gói rất nhanh; tên trong bài là tên tại ngày đọc.

## 9. Giới hạn

- **Chưa chạy thử sản phẩm nào.** Mọi ô Đ hoặc P là đọc tài liệu, không phải quan sát hành vi.
- **Không có kiểm chứng độc lập.** Liyagent và Tool Policies của StackOne đều mới; các sản phẩm còn lại cũng có thể có lỗi không nằm trong tài liệu.
- **Không đủ thị trường.** Mười một sản phẩm hoặc tổ hợp trong ma trận không đại diện cho toàn bộ thị trường.
- **Không thấy sản phẩm Việt Nam nào để chấm.** Lượt tìm ngày 2026-11-17 (FPT, Viettel, VNPT, MISA kèm "AI agent", "MCP") chỉ ra bài tổng quan thị trường, không ra tài liệu kỹ thuật về cổng MCP hay ghi có duyệt.
- **Không có tổng chi phí sở hữu.** Giá niêm yết chưa gồm công tích hợp, công vận hành, đào tạo, và chi phí rời bỏ.
- **Không có đánh giá pháp lý.** Bài không kết luận sản phẩm nào tuân thủ luật bảo vệ dữ liệu hay quy định nội bộ.
- **Không có so sánh hiệu năng.** Không có p50, p95 hay throughput; muốn có phải chạy trên cùng một bộ thử.

## 10. Việc tiếp theo

| Thứ tự | Việc | Xong khi |
| --- | --- | --- |
| 1 | Thêm mục "mua hay dựng" vào ADR-0001, so ba đường: mua, dựng trên nền mã nguồn mở, tự dựng | ADR nêu tiêu chí và lý do đường được chọn thắng |
| 2 | Dùng biên lai của Liyagent làm danh sách trường cho vết của Lab | Vết của Lab có đủ người yêu cầu, người duyệt, dấu vân tay nội dung, mã chống ghi trùng, chi phí |
| 3 | Dùng mô hình "Read a field" và "Write a field" của StackOne làm khung cho luật che trường của Lab, nhưng mặc định từ chối | Luật của Lab che số điện thoại cá nhân với chị Hoa và từ chối Nam đổi người phụ trách, có phép thử tự động |
| 4 | Đọc luồng duyệt và cách từ chối khi lỗi trong mã Preloop, tối đa nửa ngày, khi dựng phần duyệt | Điểm mượn được ghi vào [tổng hợp phát hiện](../findings.md) |
| 5 | Chạy HM1, HM3, HM4, HM6 với dữ liệu giả ở bước đánh giá | Mỗi giả thuyết có một kết quả và một lệnh chạy lại |
