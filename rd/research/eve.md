# Vercel eve và cách gắn vào công việc ở Appota

Ngày: 2026-11-19. Trạng thái: đọc bài công bố bản 1.0 và tài liệu trong kho mã xong; chưa chạy thử, chờ Kevin chọn hướng.

## Đọc nhanh

- eve là bộ khung mã nguồn mở của Vercel để lập trình viên tự dựng một trợ lý AI chạy trên máy chủ; bản chính thức ra ngày 17/11/2026.
  Nhân viên không cài eve; họ dùng trợ lý mà một đội đã dựng bằng eve.
- Điểm hợp với Appota nhất: trợ lý dựng bằng eve có thể ngồi ngay trong nhóm chat Lark, nơi nhân viên đang làm việc, nhờ bộ nối Lark do chính Lark phát hành.
- Với Lab, eve là ứng viên tốt cho trợ lý thứ hai dùng lại cùng công cụ ở mốc 4: nó gọi được cổng của Lab bằng khoá riêng của từng người, và không bị cắt sau 60 giây như Thổ Thần.
- eve không làm thay cổng: nút duyệt của eve chỉ là lời đồng ý trong chat, nên cổng vẫn tự giữ quyền, bước duyệt và việc chống ghi trùng.
- Tiếp theo: hỏi Kevin có muốn đi hướng Lark không, rồi dành nửa ngày chạy các phép kiểm ở mục 7; việc này cần một khoá gọi mô hình AI.

## 1. Câu hỏi nghiên cứu

Ngày 2026-11-19, Kevin giao tìm hiểu MausBot và eve trong tuần 3 (issue #92).
MausBot đã có [tài liệu riêng](mausbot.md); tài liệu này lo phần eve và đặt ba nơi gọi cạnh nhau.

Câu hỏi chính: eve gắn vào công việc hằng ngày của nhân viên Appota ở đâu, và gắn vào Lab ở đâu?

Nó tách thành sáu câu nhỏ:

1. eve là gì, ai làm, giấy phép và giá thế nào?
2. eve khác Thổ Thần và MausBot ở đâu, và đứng ở lớp nào trong hệ sinh thái AI của Appota?
3. Nhân viên Appota sẽ gặp một trợ lý dựng bằng eve ở chỗ nào trong ngày làm việc?
4. Lab dùng eve vào việc gì: nơi gọi thứ hai, đường vòng qua giới hạn 60 giây, hay mẫu thiết kế?
5. Khi làm nơi gọi (host), eve giúp hay cản tám yêu cầu SR1-SR8 của [PRD](../problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc) tới đâu?
6. Điều gì phải chạy thử mới biết, và chạy theo thứ tự nào?

Câu hỏi gắn với tiêu chí nghiệm thu "chứng minh Agent khác tái sử dụng được công cụ" ([tài liệu chương trình](../../docs/program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt), dòng 239) và với mốc 4 của [spec bản thử, mục 5.2](../design/mvp-spec.md#52-điểm-dừng).

**Kết luận:** tài liệu phải ra một đề xuất về vai trò của eve ở mốc 4 và ở Appota, kèm danh sách phép kiểm để biến đề xuất thành bằng chứng.

## 2. eve là gì

Mọi dòng dưới đây lấy từ [bài công bố bản 1.0](https://vercel.com/blog/eve-is-now-generally-available) và tài liệu trong kho [vercel/eve](https://github.com/vercel/eve), ghim ở commit `08034cd`.
Các câu trích được kiểm lại bằng `rd/checks/eve.sh`.

| Điều | Nội dung | Nguồn |
| --- | --- | --- |
| Sản phẩm | Bộ khung để viết agent bằng TypeScript: vòng lặp gọi mô hình, gọi công cụ và giao việc cho agent con, cộng các kênh chat, bộ nhớ, lịch chạy và vết. Bài công bố gọi nó là "the open-source framework for building production-ready agents". | Bài công bố |
| Ai làm | Vercel, công ty làm Next.js và nền tảng chạy web. | Bài công bố, chín tác giả |
| Mã nguồn | `vercel/eve`, tạo ngày 2026-06-16, khoảng 6 nghìn sao, giấy phép Apache 2.0 cho toàn bộ kho. | `gh api repos/vercel/eve`, ngày 2026-11-19 |
| Phát hành | Bản thử công khai từ tháng 6/2026, hơn 230 bản phát hành trong giai đoạn thử; 1.0 ngày 17/11; 1.1.0 ngày 18/11. | Bài công bố, `gh api .../releases` |
| Chạy ở đâu | Trên Vercel, hoặc tự cài như một dịch vụ Node: một tiến trình lưu phiên vào SQLite trên đĩa, nhiều bản sao thì lưu vào PostgreSQL. Cần Node 24 trở lên. | [Tự cài](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/guides/deployment/self-hosting/index.md), [nơi lưu phiên](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/guides/deployment/workflow-worlds.md), npm `eve@1.1.0` |
| Mô hình AI | Gọi qua cổng mô hình của Vercel (AI Gateway) hoặc thẳng tới nhà cung cấp qua thư viện AI SDK. Bài công bố không nêu danh sách mô hình. | Tự cài, mục "Configure model access" |
| Giá | Bộ khung miễn phí. Chạy trên Vercel thì trả tiền theo dịch vụ Vercel dùng tới; bài công bố không có bảng giá cho eve. Tiền gọi mô hình trả riêng. | Bài công bố |
| Kênh chat | Slack, Microsoft Teams, Discord, Telegram, GitHub, Linear, Twilio, web chat, iMessage; thêm mọi kênh có bộ nối Chat SDK, trong đó có Lark. | Bài công bố, [Chat SDK](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/channels/chat-sdk/index.mdx) |
| Nối công cụ | Ba cách: gọi server MCP của người khác qua địa chỉ web, gọi API mô tả bằng OpenAPI, hoặc tự viết công cụ. | [Kết nối](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/connections/index.mdx), [kết nối MCP](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/connections/mcp.mdx) |
| Duyệt | Mỗi công cụ hay mỗi kết nối chọn mức hỏi: không hỏi, hỏi lần đầu, hỏi mọi lần, để một mô hình nhỏ quyết định, hoặc luật tự viết. Nút duyệt hiện trong kênh chat; mặc định chỉ người yêu cầu được bấm. | [Người trong vòng lặp](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/tools/human-in-the-loop.md) |
| Chạy bền | Mỗi phiên là một quy trình bền (durable workflow): sập rồi chạy tiếp từ bước đã xong; chờ người duyệt được nhiều ngày mà không giữ máy chạy. | [Mô hình chạy](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/concepts/execution-model-and-durability.mdx) |
| Vết | Theo chuẩn OpenTelemetry; ghi lần gọi mô hình, gọi công cụ, gọi server MCP và quyết định duyệt. Hội thoại riêng ở bản chạy thật chỉ gửi siêu dữ liệu, không gửi nội dung. | Bài công bố, [bảo mật](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/concepts/security-model.md) |

Bộ nối Lark là gói `@larksuite/vercel-chat-adapter` 0.3.0 trên npm, giấy phép MIT, do tổ chức `larksuite` trên npm phát hành.
Đọc gói tải về cho thấy ba điều: bot nhận tin qua kết nối dài WebSocket nên không cần địa chỉ công khai để nhận tin; nút bấm hiện thành thẻ Lark và gọi ngược về bot; biểu mẫu nhập liệu chưa hỗ trợ (README của gói, mục "Interactive cards").

**Kết luận:** eve không phải một ứng dụng để nhân viên cài, mà là vật liệu để một đội lập trình dựng trợ lý của riêng mình.
Nó mã nguồn mở, tự cài được trên máy chủ công ty, và đã có đường vào Lark.

## 3. Ba nơi gọi đặt cạnh nhau

Nơi gọi (host) là phần mềm người dùng mở để nói chuyện với agent ([bảng thuật ngữ](../problem/glossary.md)).
Cột Thổ Thần lấy từ các lần đo ([tổng hợp phát hiện, mục 4](../findings.md#4-thổ-thần)); cột MausBot lấy từ [tài liệu MausBot](mausbot.md); cột eve lấy từ mục 2.

| Điều | Thổ Thần | MausBot | eve |
| --- | --- | --- | --- |
| Là gì | Ứng dụng chat AI của công ty | Ứng dụng desktop cá nhân, mỗi người một nhóm bot | Bộ khung để lập trình viên dựng trợ lý |
| Ai dựng, ai dùng | Đội Thổ Thần dựng; mọi nhân viên dùng | Supamaus dựng; người tự cài dùng | Một đội của Appota dựng; nhân viên dùng qua kênh chat |
| Nhân viên gặp nó ở đâu | Trong ứng dụng Thổ Thần (web, desktop, điện thoại) | Trong ứng dụng MausBot; Slack chỉ ở bản đám mây trả phí; không có Lark | Ở kênh được chọn: Lark, Slack, Teams, trang web riêng |
| Server công cụ biết ai đang hỏi không | Không; chỉ có header `x-user-id` chưa kiểm được nguồn | Không; khoá do người thêm server đặt | Kênh xác thực người nhắn bằng chữ ký của nền tảng; agent tự chọn khoá theo người đó |
| Duyệt trước khi ghi | Không hỏi | Có thẻ duyệt, nhưng mặc định toàn quyền | Có nút duyệt; chỉ là lời đồng ý, không đổi quyền |
| Việc dài | Cắt sau 60 giây | Không tự cắt | Chờ được nhiều ngày, sống qua lần khởi động lại |
| Cổng của Lab phải mở ra ngoài không | Phải, vì lời gọi đi từ máy chủ Thổ Thần | Không, nếu chạy cùng máy | Không, nếu eve chạy cùng mạng với cổng |
| Ai trả tiền mô hình | Credit Thổ Thần | Tài khoản AI cá nhân | Khoá mô hình của đội dựng |
| Phải viết mã không | Không | Không | Có, TypeScript |

### 3.1. eve ở lớp nào của hệ sinh thái Appota

Đặt theo [ngữ cảnh hệ sinh thái](../../docs/context/appota-ai-ecosystem.md), bản chép từ slide và chưa được Kevin xác nhận:

- **Thổ Thần (lớp thực thi).** eve trùng vai ở chạy agent, điều phối nhiều bước, bộ nhớ và vết.
  Khác ở chỗ eve là mã do đội mình giữ, còn Thổ Thần là sản phẩm có sẵn.
- **AgentLize (lớp điều khiển).** eve gần như không trùng: không có chợ skill, không có danh mục kết nối dùng chung, không có trang quản trị.
  MausBot thì trùng nhiều hơn ([MausBot, mục 3.1](mausbot.md#31-mausbot-có-gì-ở-từng-lớp)).
- **Kdata (hạ tầng).** Bản tự cài là một dịch vụ Node cộng PostgreSQL và Docker, đúng loại máy chủ Kdata đang vận hành.
- **Chủ dữ liệu.** eve chỉ chạm hệ thống nghiệp vụ qua công cụ và kết nối; khoá kết nối nằm phía máy chủ, không tới mô hình.

**Kết luận:** Thổ Thần và MausBot là ứng dụng cho người dùng cuối; eve là vật liệu để dựng một ứng dụng như thế, và nó đứng ở lớp thực thi cạnh Thổ Thần.
Câu hỏi đúng cho Appota vì vậy không phải "nhân viên có cài eve không", mà "có dựng trợ lý nào bằng eve không, và đặt nó ở kênh nào".

## 4. Gắn vào công việc hằng ngày của nhân viên Appota

Ba điều Lab biết về nơi nhân viên làm việc: Appota có hơn 400 nhân sự, Lark nằm trong danh sách hệ thống nghiệp vụ trên slide hệ sinh thái, và báo cáo tuần của Lab nộp qua Lark.
Lab chưa đo phòng nào dùng Lark vào việc gì, nên bảng dưới lấy ví dụ từ phòng Vận hành giả lập của Lab.

| Cách | Ví dụ | Cần gì | Ai quyết |
| --- | --- | --- | --- |
| E1. Trợ lý trong nhóm chat Lark | Trong nhóm Lark của phòng Vận hành, chị Hoa gõ "@Trợ lý chuyển T-12 cho anh Minh"; bot trả đề xuất và link duyệt ngay trong nhóm. | Một ứng dụng Lark tự dựng (self-built app) do quản trị Lark của Appota cấp; quyền đọc tin và nhận bấm thẻ; một khoá mô hình. | Quản trị Lark và Kevin |
| E2. Nhắc việc theo lịch | Sáng thứ Hai, bot gửi vào nhóm danh sách task quá hạn của phòng. | Như E1, cộng một danh tính dịch vụ cho cổng, vì việc chạy theo lịch không có người hỏi. | Chủ dữ liệu task |
| E3. Nghe ngầm trong kênh | Bot đọc mọi tin trong nhóm được chọn và tự đề xuất tạo task khi thấy ai đó nhờ việc. | Như E1; bot đọc mọi tin nhắn của nhóm. | Chủ nhóm chat; cần đồng ý về dữ liệu |
| E4. Thổ Thần giao việc dài cho eve | Chị Hoa gõ trong Thổ Thần "rà 100 task quá hạn và soạn đề xuất"; AI của Thổ Thần giao việc cho trợ lý eve rồi hỏi lại kết quả. | eve mở kênh MCP của nó (bốn công cụ bắt đầu, xem, trả lời, hủy); cổng của eve phải có địa chỉ công khai, vì Thổ Thần gọi từ máy chủ của nó. | Đội Thổ Thần |

E4 có hai giới hạn đã ghi trong tài liệu của eve.
Công cụ bắt đầu việc (`agent_start`) không chống gửi trùng, nên AI của Thổ Thần gửi lại thì thành hai việc.
AI của Thổ Thần phải tự hỏi lại kết quả nhiều lượt, mỗi lượt dưới 60 giây; giống giới hạn của đường Thổ Thần sai bot MausBot ([MausBot, mục 4.1](mausbot.md#41-giới-hạn-của-t2-thổ-thần-sai-bot-mausbot)).

**Kết luận:** E1 là đường ngắn nhất từ công cụ của Lab tới chỗ nhân viên đang làm việc, vì người dùng không phải mở thêm ứng dụng nào.
E1 cần Appota cấp một ứng dụng Lark và một khoá mô hình, nên Kevin quyết; E3 cần thêm đồng ý của chủ dữ liệu và không nên làm trong Lab.

## 5. Gắn vào Lab

### 5.1. Nơi gọi thứ hai cho mốc 4

Spec hiện ghi nơi gọi thứ hai là "trợ lý gọi hàm của Lab", một chương trình chat dòng lệnh tự viết ([spec, mục 6](../design/mvp-spec.md#6-kiến-trúc-tóm-tắt)).
Một trợ lý eve làm được cùng việc đó, theo hai lối vào của cổng:

- **Lối MCP:** một kết nối MCP trỏ tới `/mcp` của cổng ([cửa `/mcp`](../../lab/gateway/README.md#hai-cửa-vào)).
- **Lối gọi hàm:** năm công cụ tự viết, mỗi công cụ gọi `POST /v1/tools/<tên>` ([đường đọc của cổng](../../lab/gateway/README.md#một-lời-gọi-đi-qua-đâu)).

Cùng một trợ lý, cùng mô hình, chỉ đổi lối vào: đây là phép so MCP với gọi hàm sạch nhất mà Lab có thể dựng, vì mọi biến khác đứng yên.

| Tiêu chí | Chương trình chat tự viết | Trợ lý eve |
| --- | --- | --- |
| Thuyết phục người chấm về SR8 (dùng lại, quyền theo người) | Thấp hơn: Lab viết cả hai đầu nên dễ bị coi là may đo | Cao hơn: bộ khung của bên thứ ba gọi cổng mà cổng không sửa dòng nào |
| Gần công việc thật | Dòng lệnh, chỉ Lab dùng | Chạy được trong Lark (E1) |
| Đo M6 (công sức dùng lại) | Đo công sức viết một chương trình | Đo công sức gắn một bộ khung có sẵn, gần thực tế hơn |
| Phụ thuộc | Không thêm gì | Node 24 (Lab đang dùng Node 22.21), bộ khung mới ra hai ngày |
| Khoá mô hình | Cần | Cần |

### 5.2. Ai đổi người thành khoá

eve biết ai đang nhắn, nhưng cổng của Lab nhận người qua khoá `lab_` ([ADR-0005](../../docs/adr/adr-0005-requester-identity.md)).
Có hai cách nối hai điều này:

- **Cách A, eve giữ khoá của từng người.** Kết nối MCP dùng hàm chọn khoá theo người hỏi (`principalType: "user"`), đọc khoá của người đó từ kho khoá của eve.
  Cổng không đổi dòng nào; đổi lại, máy chủ eve giữ khoá của mọi người và trở thành nơi cần bảo vệ nhất.
- **Cách B, cổng tin eve báo tên người.** eve gọi bằng một khoá dịch vụ và gắn header nêu người hỏi; cổng chỉ nhận header này từ đúng khoá dịch vụ đó.
  eve đã có mẫu này giữa hai agent eve (`trustedForwarders`); với cổng của Lab, đây là thay đổi ADR-0005 và cần một ADR mới.

### 5.3. Duyệt vẫn nằm ở cổng

Tài liệu eve viết thẳng: "Approval is consent only."
Người bấm duyệt không đổi quyền của lời gọi; lời gọi vẫn chạy bằng danh tính và khoá của người yêu cầu.
Điều này khớp với thiết kế của Lab: lời duyệt có hiệu lực là lời bấm trên trang của cổng ([ADR-0008](../../docs/adr/adr-0008-approval-page-login.md)).
Năm công cụ của cổng chỉ đọc hoặc soạn đề xuất, không công cụ nào tự ghi, nên trợ lý eve có thể để mức "không hỏi" mà không mất an toàn.

eve còn một cách gửi danh tính người duyệt sang server công cụ trong một header riêng, chỉ cho đúng lời gọi đã được duyệt.
Về sau, đây có thể là đường để cổng nhận lời duyệt bấm trên thẻ Lark thay vì trên trang của cổng, với điều kiện thẻ khoá vào đúng dấu vân tay của đề xuất.
Lab chưa làm việc này trước khi mốc 3 xong.

### 5.4. Năm mẫu thiết kế khớp với Lab

1. **Duyệt chỉ là đồng ý.** Như mục 5.3.
2. **Một lượt chạy chỉ thuộc một người.** Trong nhóm chat chung, tin của người khác chờ lượt sau và chạy bằng danh tính của họ; khớp với cách cổng gắn mỗi lời gọi với một khoá.
3. **Không tin danh tính trong nội dung request.** Kênh chỉ nhận người từ chữ ký đã kiểm; cùng lý do cổng chưa dùng `x-user-id` để cấp quyền.
4. **Khoá kết nối không tới mô hình và không nằm trong phiên.** Cổng cũng giữ khoá dịch vụ của hai hệ thống giả ở phía mình.
5. **Bắt đầu việc không chống gửi trùng.** Chính eve để việc này cho phía gọi; đây là bằng chứng thêm rằng SR6 (không ghi trùng) phải nằm ở cổng.

**Kết luận:** eve là ứng viên mạnh hơn chương trình chat tự viết cho nơi gọi thứ hai, vì nó vừa là bằng chứng dùng lại do bên thứ ba làm, vừa so được hai lối vào trên cùng một trợ lý.
Đề xuất dùng eve ở mốc 4 theo cách A nếu phép kiểm KE1 tới KE5 ở mục 7 đạt, và ghi quyết định thành một ADR trước khi dựng.

## 6. Đối chiếu với tám yêu cầu SR1-SR8

Cả tám yêu cầu do cổng của Lab làm; bảng này chỉ hỏi nơi gọi giúp hay cản cổng.
Cột eve lấy từ tài liệu, chưa đo; mã phép kiểm ở mục 7.

| Yêu cầu | Thổ Thần (đã đo) | eve (theo tài liệu) | Hệ quả cho cổng | Kiểm bằng |
| --- | --- | --- | --- | --- |
| SR1 (danh tính và một cửa ghi) | Không gửi danh tính | Biết người nhắn qua kênh đã xác thực; gửi khoá riêng theo người hỏi | Cổng giữ nguyên cách nhận người qua khoá (cách A ở mục 5.2) | KE2 |
| SR2 (luật chạy được) | Không liên quan | Không liên quan | Luật nằm trong cổng | - |
| SR3 (phạm vi quyền) | Không liên quan | Kết quả MCP tới mô hình nguyên văn, không có bước lọc riêng | Cổng che trường trước khi trả, như hiện nay | KE1 |
| SR4 (điểm dừng rủi ro) | Không hỏi duyệt | Nút duyệt chỉ là lời đồng ý | Cổng tự giữ đề xuất và trang duyệt | KE3 |
| SR5 (không chắc thì chặn) | Lỗi vẫn có thể hiện dấu tích xanh | Kết quả có đánh dấu lỗi làm lời gọi thất bại kèm nội dung | Câu "CHƯA THỰC HIỆN" của cổng tới được mô hình | KE3 |
| SR6 (không ghi trùng) | Không tự gọi lại | Chạy lại từ bước đã xong sau khi sập; chưa rõ lời gọi đang dở có bị gọi lại không | Mã chống ghi trùng ở cổng đỡ trường hợp này | KE5 |
| SR7 (vết xuyên suốt) | Không có mã vết | Vết OpenTelemetry có lời gọi server MCP; chưa rõ có gửi mã vết sang server không | Cổng tự sinh mã vết; nếu eve gửi mã vết thì nối được hai bên | KE8 |
| SR8 (dùng lại, quyền theo người) | Nơi gọi thứ nhất | Gọi được cả MCP lẫn API thường | Ứng viên nơi gọi thứ hai (mục 5.1) | KE1, KE4 |

**Kết luận:** eve không cản yêu cầu nào và cũng không làm thay cổng yêu cầu nào; thiết kế cổng hiện tại đứng vững khi thêm eve.
Hai điểm chưa rõ là SR6 khi sập giữa lời gọi và SR7 khi nối vết, và cả hai kiểm được bằng phép chạy thử.

## 7. Những gì cần kiểm tra

Mọi phép kiểm chỉ dùng dữ liệu giả và khoá giả của Lab.
eve cần Node 24 nên chạy trong một thư mục riêng ngoài workspace `lab/`, không đổi phiên bản Node của Lab.
Cột "Ta đoán" là điều tài liệu nói; phép kiểm xác nhận hoặc bác nó.

| Mã | Câu hỏi | Cách kiểm | Ta đoán | Bằng chứng |
| --- | --- | --- | --- | --- |
| KE1 (nối `/mcp`) | Kết nối MCP của eve có nói chuyện được với cổng không giữ phiên, chỉ nhận `POST`? | Trợ lý eve chạy `eve dev`, kết nối tới `http://127.0.0.1:8790/mcp` bằng khoá chị Hoa; hỏi số điện thoại anh Minh | Được; eve hỏi phiên bản giao thức trước, cổng báo lỗi thì eve quay về bắt tay thường | Dòng vết của cổng, câu trả lời |
| KE2 (khoá theo người) | Hai người nhắn cùng trợ lý thì cổng có thấy hai khoá khác nhau không? | Kênh web của eve với hai tài khoản giả; hàm chọn khoá theo người | Hai dòng vết, một `NV-02`, một `NV-05` | Bảng vết |
| KE3 (từ chối và duyệt) | Nam xin chuyển T-12 thì trợ lý nói gì; chị Hoa thì có link duyệt không? | Chạy kịch bản A và B của mốc 2 | Nam thấy "CHƯA THỰC HIỆN"; chị Hoa thấy link trang của cổng | Ảnh, vết; số lần trợ lý báo sai vào M2 |
| KE4 (lối gọi hàm) | Cùng trợ lý, lối `POST /v1/tools` cho cùng kết quả với lối `/mcp` không? | Năm công cụ tự viết; chạy lại KE1 tới KE3 | Cùng kết quả | Thời gian và số token mỗi lối, cho M1 và M3 |
| KE5 (sập giữa chừng) | Tắt eve đúng lúc đang gọi công cụ soạn đề xuất thì khi chạy lại có gọi lần nữa không? | Dừng tiến trình giữa lời gọi `propose_task_change`, khởi động lại | Có thể gọi lại; cổng chỉ giữ một đề xuất | Số đề xuất trong cổng, số lời gọi trong vết |
| KE6 (Lark) | Bot eve có nhận tin, trả lời và hiện link duyệt trong một nhóm Lark không? | Một tài khoản Lark thử, không phải Lark của Appota; bot vào một nhóm có hai người | Được; nút trên thẻ gọi ngược về bot | Ảnh nhóm chat, vết |
| KE7 (Thổ Thần giao việc) | Thổ Thần desktop giao được một việc 3 phút cho eve và lấy được kết quả không? | Mở kênh MCP của eve qua đường hầm 45 phút; gõ trong Thổ Thần | AI của Thổ Thần phải hỏi lại nhiều lượt; có thể bỏ cuộc | Số lần hỏi lại, kết quả cuối |
| KE8 (mã vết) | eve có gửi mã vết (header `traceparent`) sang cổng không? | Ghi header của request trong KE1 | Chưa rõ | Header trong log của cổng |

**Kết luận:** KE1 tới KE5 trả lời câu hỏi của mốc 4 trong khoảng nửa ngày và chỉ cần một khoá mô hình.
KE6 cần một tài khoản Lark thử, KE7 cần một phiên đường hầm; cả hai chỉ chạy khi Kevin chọn E1 hoặc E4.

## 8. Rủi ro

- **Bộ khung còn rất mới.** Bản 1.0 mới hai ngày tuổi và đã có 1.1.0; khi tự cài, đổi phiên bản eve thì phiên đang dở không chạy tiếp được ([nơi lưu phiên](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/guides/deployment/workflow-worlds.md)). Mọi kết quả phải ghi số phiên bản đã đo.
- **Một số phần chỉ đủ trên Vercel.** Đăng nhập kết nối qua Vercel Connect, máy ảo cách ly và trang xem lượt chạy là dịch vụ Vercel; tự cài thì phải tự làm hoặc bỏ.
- **Dữ liệu ra khỏi công ty.** Nội dung chat tới nhà cung cấp mô hình, và tin Lark tới máy chủ eve; chạy trên Vercel thì dữ liệu nằm ở máy chủ nước ngoài. Lab chỉ dùng dữ liệu giả nên không vướng ranh giới dữ liệu.
- **Lệch khỏi việc chính.** Mốc 3 phải nghiệm thu đầu tuần 4; phép kiểm eve chỉ chạy sau đó, trong giới hạn nửa ngày.

**Kết luận:** không rủi ro nào chặn phép kiểm với dữ liệu giả; rủi ro thứ ba là lý do mọi bản dùng thật phải tự cài trên hạ tầng của Kdata.

## 9. Thứ tự làm

| Bước | Việc | Giới hạn thời gian | Bằng chứng xong |
| --- | --- | --- | --- |
| 1 | Hỏi Kevin: có muốn trợ lý trong Lark (E1) không, Appota có cấp được ứng dụng Lark thử và khoá mô hình không, và dùng eve làm nơi gọi thứ hai ở mốc 4 có được không | Cuối tuần 3 | Câu trả lời ghi vào mục 4 và mục 5 |
| 2 | Chạy KE1 tới KE5 với eve 1.1.0 | Nửa ngày, sau nghiệm thu mốc 3 | Cột eve ở mục 6 đổi thành "đã đo" |
| 3 | Viết ADR chọn nơi gọi thứ hai và cách đổi người thành khoá (mục 5.2) | Đầu tuần 4 | ADR mới trong `docs/adr/` |
| 4 | Chạy KE6 nếu Kevin chọn E1, KE7 nếu chọn E4 | Hai giờ mỗi phép | Ảnh và vết |

Kiểm lại các câu trích trong tài liệu này: `bash rd/checks/eve.sh`.

**Kết luận:** việc làm ngay là hỏi Kevin ba câu ở bước 1; phép chạy thử chờ mốc 3 xong để không chen vào việc chính.
