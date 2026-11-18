# MausBot và cách tích hợp với Thổ Thần

Ngày: 2026-11-17. Trạng thái: đọc tài liệu và mã nguồn xong, đã đặt MausBot vào bản đồ hệ sinh thái Appota; chưa chạy phép kiểm tra nào, chờ Kevin chọn hướng.

## Đọc nhanh

- MausBot là ứng dụng mã nguồn mở trên máy tính, cho mỗi người một nhóm trợ lý AI chạy bằng tài khoản AI của chính họ.
- Trong hệ sinh thái Appota, nó đứng cùng chỗ với Thổ Thần desktop: nơi nhân viên giao việc cho AI. Nó còn tự mang luật duyệt, danh mục công cụ và giới hạn chi tiêu, vốn là việc của AgentLize.
- Cách tích hợp có ích nhất là cho Thổ Thần và MausBot cùng dùng một bộ công cụ của Lab, để luật và lịch sử nằm một chỗ.
- Thổ Thần sai được bot MausBot nhưng bị cắt sau 60 giây; chép mã MausBot vào Thổ Thần thì vướng phần phải mua và mã đổi gần 200 lần mỗi ngày.
- Tiếp theo: hỏi Kevin chọn hướng nào, rồi chạy các phép kiểm tra ở mục 6 theo đúng hướng đó, tối đa một ngày.

## 1. Câu hỏi nghiên cứu

Câu hỏi chính: MausBot nối với Thổ Thần và với bộ công cụ của Lab theo cách nào, mỗi cách được gì và mất gì, và có nên làm không.

Nó tách thành sáu câu nhỏ:

1. MausBot là gì, ai làm, dùng giấy phép nào?
2. MausBot đứng ở đâu trong hệ sinh thái AI của Appota, và nối vào đó ở những chỗ nào?
3. Có những cách tích hợp với Thổ Thần nào, cách nào chạy được?
4. Khi làm nơi chạy trợ lý AI (host), MausBot đáp ứng tám yêu cầu SR1-SR8 của [PRD](../problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc) tới đâu, so với Thổ Thần?
5. Điều gì đã biết từ tài liệu, điều gì phải chạy thử mới biết?
6. Lab nên làm gì, theo thứ tự nào, trong bao lâu?

Câu hỏi này gắn với tiêu chí nghiệm thu của Track 01: "chứng minh Agent khác tái sử dụng được công cụ" ([tài liệu chương trình](../../docs/program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt), dòng 239).

**Kết luận:** nghiên cứu này phải ra một quyết định về vai trò của MausBot, kèm bằng chứng chạy thật, không chỉ một bản mô tả sản phẩm.

## 2. MausBot là gì

| Điều | Nội dung | Nguồn |
| --- | --- | --- |
| Sản phẩm | Ứng dụng desktop (Windows, macOS, Linux) và app điện thoại để điều khiển từ xa. Mỗi bot chạy bằng một trình AI có sẵn trên máy (Claude Code, Codex, Grok, Cursor...) hoặc khoá API. | [mausbot.com](https://mausbot.com/), [tài liệu](https://docs.openmausbot.com/docs) |
| Ai làm | Supamaus Software Private Limited; commit ghi múi giờ +05:30 (Ấn Độ). | [chính sách riêng tư](https://mausbot.com/privacy) |
| Mã nguồn | [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot), tạo ngày 2026-08-11, khoảng 24 nghìn sao, hơn 100 người đóng góp. | GitHub, ngày 2026-11-17 |
| Tốc độ đổi | 5.793 commit trong 30 ngày tới 2026-11-17, gần 200 commit mỗi ngày; ba bản phát hành trong hai ngày 15 và 16/11. | `gh api search/commits`, `gh api .../releases` |
| Giấy phép | Phần lõi Apache 2.0. Thư mục `enterprise/` có giấy phép riêng, phải mua khi dùng thật. Tên "MausBot" là nhãn hiệu. | [LICENSING.md](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/LICENSING.md) |
| Giá | Bản desktop miễn phí. Bản trên máy chủ của họ từ 15 USD/tháng; bản nhóm tự cài 299 USD/tháng; gói đổi nhãn từ 1.000 USD/tháng cộng 5.000 USD phí cài đặt. Tiền gọi mô hình AI người dùng tự trả. | [bảng giá](https://mausbot.com/pricing), [enterprise](https://mausbot.com/enterprise) |
| Dữ liệu | Bản desktop giữ hội thoại trên máy. Nội dung chat vẫn được gửi tới nhà cung cấp AI mà người dùng chọn. | [chính sách riêng tư](https://mausbot.com/privacy) |
| Bản trên máy Lab | 0.1.165, chạy ở cổng `8799`; máy có sẵn `claude` và `codex`. | `GET http://127.0.0.1:8799/api/health`, ngày 2026-11-17 |

MausBot không phải chatbot cho khách hàng (kiểu Zalo, Messenger).
Nó là một nơi để người trong công ty giao việc cho AI, giống Thổ Thần desktop.

**Kết luận:** MausBot và Thổ Thần cùng là nơi chạy trợ lý AI, nên tích hợp nghĩa là hai nơi này dùng chung công cụ, gọi nhau, hoặc gộp mã.

## 3. Chỗ đứng trong hệ sinh thái Appota

Một slide nội bộ chia hệ sinh thái AI của Appota thành bốn lớp ([ngữ cảnh hệ sinh thái](../../docs/context/appota-ai-ecosystem.md)):

- **AgentLize** đặt luật, giữ danh mục công cụ và tài sản AI, đo giá trị (lớp điều khiển, control plane).
- **Thổ Thần AI** chạy agent, gọi mô hình và gọi công cụ (lớp thực thi, execution plane).
- **Kdata** giữ máy chủ, khoá bí mật và mạng.
- **Các phòng ban** giữ dữ liệu và hệ thống nghiệp vụ (HRM, Lark, CRM, ERP).

Slide đó là bản chép từ ảnh và chưa được Kevin xác nhận, nên bảng dưới là cách đặt thử, chưa phải sơ đồ đã chốt.

### 3.1. MausBot có gì ở từng lớp

Cột "MausBot tự có" lấy từ tài liệu trong kho mã, ghim ở commit `d01c7be`; các câu trích được kiểm lại bằng `rd/checks/mausbot.sh`.

| Lớp và việc slide giao | MausBot tự có | Quan hệ với Appota |
| --- | --- | --- |
| AgentLize: chợ và quản lý tài sản AI (Marketplace Skill/Agent) | Thư viện tổ chức: Admin đẩy gói bot và skill xuống máy nhân viên, mỗi gói đóng dấu mã băm ([org-library](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/org-library.md)). Bot chia sẻ được dưới dạng thư mục mẫu; skill viết theo chuẩn chung Agent Skills (`SKILL.md`) ([team-sharing](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/team-sharing.md)). | Trùng vai. Thư viện chỉ nhận danh mục từ dịch vụ Admin của MausBot, và dịch vụ đó không nằm trong mã mở. |
| AgentLize: danh mục kết nối (API/MCP, connector) | Admin tổ chức giữ danh sách server MCP được duyệt; bot chỉ thấy server có tên trong danh sách. Ở máy chủ nhóm, mỗi kết nối chọn dùng chung cho cả nhóm hay riêng từng người ([team-cloud](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/team-cloud.md)). | Trùng vai. Danh sách nằm trong MausBot, không đọc từ AgentLize. |
| AgentLize: quản trị (chính sách, phê duyệt, kiểm toán) | Mức duyệt cho từng bot; giới hạn chi tiêu theo ngày và tháng cho từng bot ở mọi bản ([usage-caps](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/usage-caps.md)). Trang quản trị và giới hạn chi tiêu cả workspace thuộc bản trả tiền; đăng nhập bằng tài khoản công ty (SSO) mới là kế hoạch ([enterprise](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/enterprise/README.md)). | Trùng một phần. Thiếu đúng thứ slide coi là gốc: đăng nhập bằng tài khoản `@appota.com`. |
| AgentLize: đo giá trị (Value Intelligence) | Sổ chi phí theo bot và mô hình trên trang Usage, xuất được CSV. | Nguồn số liệu thô, không phải nơi đo giá trị. |
| Thổ Thần: chạy agent, điều phối, bộ nhớ | Bot chạy bằng trình AI cài trên máy (Claude Code, Codex...), chạy theo lịch, giao việc cho bot khác, có bộ nhớ riêng. | Trùng vai với Thổ Thần desktop. Khác Thổ Thần web: Thổ Thần web chạy trên máy chủ, không điều khiển được máy người dùng. |
| Thổ Thần: cổng mô hình (Model Gateway) | Không có cổng; chỉ gọi ra. Nhận mọi địa chỉ theo chuẩn OpenAI (OpenAI-compatible) ([custom-engines](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/custom-engines.md)). | Bổ sung được: MausBot có thể gọi mô hình qua cổng của công ty, nếu cổng đó mở cho bên ngoài. |
| Thổ Thần: gọi công cụ (Tool/MCP Runtime) | Gọi server MCP qua stdio và địa chỉ web, và 24 ứng dụng SaaS dựng sẵn qua Composio (Slack, Gmail, Jira...). | Trùng vai, nhưng cùng chuẩn MCP nên dùng chung được một bộ công cụ. |
| Kdata: máy chủ, khoá bí mật, mạng | Bản máy chủ tự cài bằng Docker, Kubernetes hay Railway; một máy chủ chạy được nhiều workspace tách nhau ([self-hosting](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/self-hosting.md)). Khoá lưu trong tệp cấu hình của MausBot. | Kdata chạy được máy chủ nhóm; khoá thì nằm ngoài kho khoá chung, trái nguyên tắc "nền tảng AI không tự giữ khoá". |
| Phòng ban giữ dữ liệu (HRM, Lark, CRM) | Không chạm thẳng; chỉ tới qua server MCP hoặc Composio. Nội dung chat đi tới nhà cung cấp AI mà người dùng chọn. | Chủ dữ liệu phải đồng ý cho dữ liệu đi qua nhà cung cấp AI đó, ngoài tài khoản Thổ Thần. |

**Kết luận:** MausBot nằm ở lớp thực thi, cạnh Thổ Thần desktop: một nơi chạy agent trên máy nhân viên hoặc trên máy chủ của nhóm.
Nó mang theo một lớp điều khiển thu nhỏ (danh mục, duyệt, giới hạn chi tiêu), và lớp này trùng vai với AgentLize.
Nếu công ty dùng MausBot, AgentLize phải là nơi quyết định, còn phần điều khiển của MausBot chỉ được làm theo, không được thành nguồn luật thứ hai.

### 3.2. Nối vào hệ thống ở đâu

Bốn mối nối, xếp theo giá trị cho Appota:

| Mối nối | Làm gì | Ví dụ trong Lab | Điều kiện | Ai quyết |
| --- | --- | --- | --- | --- |
| N1. Một cửa công cụ | Thổ Thần và MausBot cùng gọi một server MCP của Lab; danh sách server được duyệt của MausBot chỉ chứa server này. | Chị Hoa chuyển T-12 từ Thổ Thần hay từ MausBot đều đi qua cùng cổng, cùng luật, cùng vết. | Cổng nhận người qua khoá riêng, như đã làm với Thổ Thần. | Lab; đây là T1 ở mục 4. |
| N2. Khoá riêng từng người trong nhóm | Ở máy chủ nhóm (Team Cloud), Admin đặt server của Lab ở chế độ "từng người"; mỗi thành viên tự nhập khoá của mình. | Nam và chị Hoa dùng chung bot Vận hành, nhưng cổng thấy hai khoá khác nhau và từ chối Nam. | Cần gói nhóm trả phí. Việc chạy theo lịch "không làm thay ai", nên cổng cần một danh tính dịch vụ riêng cho bot. | Kevin, vì tốn phí. |
| N3. Một cổng mô hình | MausBot gọi mô hình qua cổng mô hình của công ty thay vì tài khoản AI cá nhân. | Mọi lượt chat trong MausBot tính chi phí về một nơi. | Thổ Thần phải mở cổng mô hình theo chuẩn OpenAI ra ngoài; hiện chưa thấy API công khai nào. | Đội Thổ Thần. |
| N4. Một kho skill | Skill viết theo chuẩn Agent Skills dùng được ở cả hai nơi; AgentLize giữ bản gốc. | Skill "tra danh bạ" viết một lần, nạp vào cả Thổ Thần và MausBot. | Cần biết Thổ Thần nhận skill ở định dạng nào. | AgentLize. |

Đồng bộ thẳng danh mục AgentLize sang thư viện tổ chức của MausBot thì khó hơn nhiều, vì phải dựng lại dịch vụ Admin mà MausBot không công bố mã.

**Kết luận:** mối nối rẻ nhất và đáng giá nhất là N1, đúng phần Lab đang dựng.
N2 vá chỗ yếu về danh tính (SR1) của MausBot nhưng cần gói trả phí; N3 và N4 tùy câu trả lời của đội Thổ Thần và AgentLize.

## 4. Bốn cách tích hợp

| Cách | Ví dụ | Chạy được không (theo tài liệu) | Giá trị cho Lab |
| --- | --- | --- | --- |
| T1. Dùng chung bộ công cụ Lab | Chị Hoa gõ "chuyển T-12 cho anh Minh" trong Thổ Thần hoặc trong MausBot; cả hai gọi cùng một server MCP của Lab. | Được. MausBot nhận server stdio và server qua địa chỉ web. | Cao. Đây chính là phép thử "agent thứ hai dùng lại cùng công cụ" và SR8 (dùng lại, quyền theo người). |
| T2. Thổ Thần sai bot MausBot | Chị Hoa gõ trong Thổ Thần "nhờ bot Vận hành soạn danh sách task quá hạn"; AI của Thổ Thần gửi việc sang MausBot và chờ kết quả. | Được một chiều, kèm bốn giới hạn ở mục 4.1. Chiều ngược lại không được, vì Thổ Thần không có API công khai. | Thấp. Một AI sai một AI khác, không giúp nhận người, duyệt hay chống ghi trùng. |
| T3. Chép mã MausBot vào Thổ Thần | Đội Thổ Thần lấy một phần mã MausBot, ví dụ thẻ duyệt, đưa vào sản phẩm. | Hợp pháp với phần lõi Apache 2.0. Công sức tùy phần được chọn. | Không thuộc Lab; là quyết định sản phẩm của đội Thổ Thần. |
| T4. Mua gói đổi nhãn | Appota trả Supamaus để chạy MausBot dưới tên của mình. | Cần hợp đồng đối tác. | Không thuộc Lab; Lab chỉ góp số đo từ T1. |

### 4.1. Giới hạn của T2 (Thổ Thần sai bot MausBot)

MausBot desktop kèm sẵn một server MCP chạy kiểu stdio, với công cụ gửi việc cho bot (`send_bot_message`) và chờ bot làm xong (`wait_for_conversation`) ([tài liệu](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/mcp-server.md)).
Thổ Thần desktop chạy được server stdio trong chat ([tổng hợp phát hiện, mục 4](../findings.md#4-thổ-thần)).
Cấu hình dán vào Thổ Thần qua "Import JSON config"; khoá lấy bằng cách ghép đôi (pairing) trong MausBot:

```json
{
  "mcpServers": {
    "openmausbot": {
      "command": "%LOCALAPPDATA%\\Programs\\OpenMausBot\\OpenMausBot.exe",
      "args": ["%LOCALAPPDATA%\\Programs\\OpenMausBot\\resources\\server\\mcp-server.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1", "OMB_PORT": "8799", "OPENMAUSBOT_TOKEN": "<khoá ghép đôi>" }
    }
  }
}
```

| Giới hạn | Vì sao | Cách chịu |
| --- | --- | --- |
| Việc dài bị cắt | Thổ Thần cắt mọi lệnh sau 60 giây; lệnh chờ của MausBot mặc định 30 giây, tối đa 120 giây | AI gọi chờ với `timeout_seconds` dưới 50, hết giờ thì gọi chờ lại |
| Không duyệt được trong Thổ Thần | Server MCP của MausBot "cannot approve requests"; bot cần duyệt thì dừng ở trạng thái `needs-user` | Người dùng mở app MausBot để bấm duyệt |
| Hai tài khoản AI | Bot MausBot chạy bằng tài khoản AI riêng, ngoài tài khoản Thổ Thần | Tốn thêm tiền; dữ liệu đi qua thêm một nhà cung cấp AI |
| Chỉ trên một máy | Server stdio nói chuyện với MausBot ở `127.0.0.1` | Mỗi người tự cài cả hai ứng dụng |

Chiều MausBot gọi vào từ ngoài cũng hẹp: lời gọi qua [Bot API](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/bot-api.md) "has no shell, computer, browser, phone, connected apps, MCP servers or data tools".

### 4.2. Giấy phép và bảo trì của T3 và T4

- **Phần lõi Apache 2.0.** Được chép, sửa, gộp vào sản phẩm đóng và bán, miễn là giữ tệp `LICENSE` và `NOTICE` và ghi rõ chỗ đã sửa.
- **Phần `enterprise/` không phải mã mở.** Nó gồm đổi nhãn (`whitelabel`), trang quản trị (`admin`), giới hạn chi tiêu (`budgets`), tính tiền theo mô hình (`billing`) và đăng nhập bằng tài khoản công ty (`sso`, chưa làm xong).
  Chạy thật cần khoá bản quyền; đổi nhãn hay cung cấp cho bên thứ ba cần hợp đồng đối tác ([enterprise/LICENSE](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/enterprise/LICENSE)).
- **Không được dùng tên.** Sản phẩm dựng trên mã này phải đặt tên khác.
- **Kiến trúc khác nhau.** Thổ Thần là LobeHub đổi nhãn, bản web chạy trên máy chủ. Phần đáng giá nhất của MausBot là điều khiển trình AI cài trên máy người dùng, nên chỉ hợp với Thổ Thần desktop.
- **Bản chép sẽ tụt lại nhanh.** Với gần 200 commit mỗi ngày, một bản tách riêng phải tự gánh mọi bản sửa lỗi bảo mật.

**Kết luận:** Lab chỉ làm T1, vì đó là cách duy nhất phục vụ thẳng tiêu chí nghiệm thu.
T2 làm được nhưng ít giá trị; T3 và T4 là quyết định sản phẩm, cần Kevin nói rõ muốn tính năng nào của MausBot trước khi ai đó đọc sâu.

## 5. Đối chiếu với tám yêu cầu SR1-SR8

Cột Thổ Thần lấy từ lần đo ngày 2026-11-16 ([kịch bản đo](../appota/tho-than-mcp-probe.md#9-bảng-tổng-hợp-để-bàn-giao)).
Cột MausBot lấy từ tài liệu và mã nguồn, chưa đo; mã phép kiểm tra ở mục 6.
Cả tám yêu cầu do cổng của Lab làm; bảng này chỉ hỏi nơi chạy giúp hay cản cổng.

| Yêu cầu | Thổ Thần (đã đo) | MausBot (theo tài liệu) | Hệ quả cho cổng | Kiểm bằng |
| --- | --- | --- | --- | --- |
| SR1 (danh tính và một cửa ghi) | Không gửi danh tính; khoá riêng mỗi người tới được server. | Không gửi danh tính. Trường `_meta` ghi bot nào gọi nhưng "never proof of who called". Server do Admin nhóm thêm thì mặc định cả nhóm dùng chung một khoá; Admin đổi được sang chế độ "từng người". | Cổng nhận người qua khoá riêng trên cả hai nơi; trong nhóm MausBot, server của Lab phải ở chế độ "từng người" (mục 3.2, N2). | K2, K3, K20 |
| SR2 (luật chạy được) | Không liên quan nơi chạy. | Không liên quan nơi chạy. | Luật nằm trong cổng. | - |
| SR3 (phạm vi quyền) | Không liên quan nơi chạy. | Kết quả quá 8.000 ký tự từ server stdio bị rút gọn trước khi tới AI. | Cổng che trường trước khi trả; việc rút gọn của MausBot không phải là che. | K10 |
| SR4 (điểm dừng rủi ro) | Không hỏi duyệt trước khi ghi. | Có thẻ Cho phép/Từ chối ở mức "Hỏi", nhưng mặc định là toàn quyền và không hỏi. Người bấm là người ngồi trước máy, không phải người có quyền duyệt. | Cổng tự giữ đề xuất và trang duyệt, không tin bước duyệt của nơi chạy. | K4, K5, K6 |
| SR5 (không chắc thì chặn) | Kết quả lỗi vẫn có dấu tích xanh. | Lỗi của server tới AI kèm mã và nội dung. | Cổng ghi lỗi rõ trong chữ; hai nơi chạy cần cùng một cách viết lỗi. | K9 |
| SR6 (không ghi trùng) | Không tự gọi lại; mỗi lần gọi là tiến trình mới. | Không tự đặt hạn cho lời gọi công cụ. Server MCP của MausBot tự có mã `send_id` chống gửi trùng. | Cổng giữ mã lệnh; cần đo xem AI trong MausBot có tự gọi lại không. | K7, K8, K15 |
| SR7 (vết xuyên suốt) | Không có mã vết, không có số token. | Chưa rõ; tài liệu không nói về mã vết gửi sang server. | Cổng tự sinh mã vết. | K9 |
| SR8 (dùng lại, quyền theo người) | Nơi gọi thứ nhất. | Nhận nguyên khối cấu hình `mcpServers`, chạy được bằng Claude và Codex. | Ứng viên tốt cho nơi gọi thứ hai, và cho cả nơi gọi thứ ba bằng một trình AI khác. | K11 |

**Kết luận:** MausBot không cản yêu cầu nào và cũng không làm thay cổng yêu cầu nào.
Thiết kế cổng hiện tại (tự nhận người qua khoá, tự giữ lời duyệt, tự chống ghi trùng, tự sinh mã vết) đứng vững trên cả hai nơi chạy.

## 6. Những gì cần kiểm tra

Mọi phép kiểm tra chỉ dùng dữ liệu và khoá giả, vì mọi câu chat đi qua tài khoản Claude hoặc Codex của người chạy.
Nhóm A và B dùng `tools/mcp-probe` có sẵn, với các công cụ `whoami`, `fake_write`, `ask_confirm`, `slow`, `flaky`, `structured`, `echo_link`.
Cột "Ta đoán" là điều tài liệu nói; phép kiểm tra xác nhận hoặc bác nó.

### 6.1. Nhóm A: MausBot làm nơi chạy bộ công cụ Lab (T1)

Chạy lại năm câu P1-P5 của [kịch bản đo Thổ Thần](../appota/tho-than-mcp-probe.md) để hai cột ở mục 5 so được với nhau.

| Mã | Câu hỏi | Cách kiểm | Ta đoán | Bằng chứng |
| --- | --- | --- | --- | --- |
| K1 (cách nối) | MausBot nối được bằng stdio, địa chỉ web trên máy và khoá bearer không? | Thêm probe kiểu stdio; chạy probe ở chế độ HTTP có khoá bearer giả rồi thêm server URL; gọi `whoami` từng cách | Cả ba chạy được trong chat | Log probe, ảnh chụp màn hình |
| K2 (danh tính) | Server nhận được gì về người hỏi? | Gọi `whoami`; đọc `clientInfo`, header, `_meta` | Chỉ có tên ứng dụng, không có người | Dòng `initialize` và `tools/call` trong log |
| K3 (khoá riêng) | Khoá `LAB_USER_KEY` mỗi người đặt có tới server không, đổi khoá có hiệu lực ngay không? | Đặt khoá, gọi `whoami`, đổi khoá, gọi lại | Tới được; đổi khoá có hiệu lực ở lượt sau | Trường `labEnv` trong log |
| K4 (duyệt ở mức Hỏi) | Có thẻ Cho phép/Từ chối trước `fake_write` không? | Bot ở mức "Ask", nhờ chuyển T-12 cho Minh | Có thẻ | Ảnh thẻ, log không có `tools/call` khi bấm Từ chối |
| K5 (duyệt ở mức mặc định) | Ở mức toàn quyền, `fake_write` có chạy không hỏi không? | Đổi bot sang "Full access", lặp lại K4 | Chạy không hỏi | Log có `tools/call` mà không có thẻ |
| K6 (biểu mẫu hỏi người dùng) | MausBot có hiện biểu mẫu hỏi người dùng (elicitation) không? | Gọi `ask_confirm` | Chưa rõ, tài liệu không nói | Log `elicitation/create`, ảnh |
| K7 (thời gian chờ) | Lời gọi dài có bị cắt không, cắt ở đâu? | Gọi `slow` 90 giây rồi 300 giây | Không cắt ở 60 giây | Thời điểm trong log |
| K8 (tự gọi lại) | Công cụ báo lỗi thì AI có tự gọi lại không? | Gọi `flaky key=a`, đếm số lần gọi | Tùy trình AI | Số dòng `tools/call` cùng khoá |
| K9 (hiển thị và vết) | Dữ liệu có cấu trúc, lỗi và link hiện ra sao; có mã vết, số token không? | Gọi `structured`, `echo_link`, một lệnh lỗi | Lỗi hiện kèm mã; mã vết chưa rõ | Ảnh, header trong log |
| K10 (kết quả lớn) | Kết quả trên 8.000 ký tự có bị rút gọn không? | Thêm vào probe một công cụ trả danh sách khoảng 100 task giả, rồi gọi nó | Bị rút gọn, kèm công cụ `query_result` | Ảnh, log |
| K11 (agent thứ hai) | Một bot Codex có gọi cùng server mà không sửa server không? | Tạo bot Codex, lặp lại K2 và K4 | Được | Log có `clientInfo` khác nhau, cùng kết quả |

### 6.2. Nhóm B: Thổ Thần sai bot MausBot (T2)

Chỉ chạy khi Kevin quan tâm T2.

| Mã | Câu hỏi | Cách kiểm | Ta đoán | Bằng chứng |
| --- | --- | --- | --- | --- |
| K12 (cắm vào Thổ Thần) | Thổ Thần desktop chạy được server MCP của MausBot không? | Ghép đôi lấy khoá, dán cấu hình ở mục 4.1, gõ "liệt kê bot MausBot" | Được | Ảnh danh sách bot trong Thổ Thần |
| K13 (việc ngắn) | Việc dưới 60 giây có trả kết quả về Thổ Thần không? | Nhờ bot làm một việc ngắn trên dữ liệu giả | Được | Ảnh, nhật ký hội thoại trong MausBot |
| K14 (việc dài) | Việc trên 60 giây có lấy được kết quả bằng cách chờ nhiều lượt không? | Nhờ bot làm việc khoảng 3 phút | AI của Thổ Thần phải tự gọi chờ lại; có thể bỏ cuộc | Số lần gọi chờ, kết quả cuối |
| K15 (gửi trùng) | Gửi lại cùng `send_id` có tạo tin thứ hai không? | Gọi `send_bot_message` hai lần cùng mã | Không | Hội thoại chỉ có một tin |
| K16 (bot cần duyệt) | Bot dừng chờ duyệt thì Thổ Thần hiện gì? | Bot ở mức "Ask", nhờ việc cần ghi tệp | Thổ Thần nhận `needs-user`, người dùng phải mở MausBot | Ảnh hai bên |

### 6.3. Nhóm C: Đưa MausBot vào Thổ Thần (T3, T4)

Chỉ làm khi Kevin muốn đi hướng này; không cần chạy thử.

| Mã | Câu hỏi | Cách kiểm | Bằng chứng |
| --- | --- | --- | --- |
| K17 (tính năng cần) | Thổ Thần muốn tính năng nào của MausBot: bot chạy nền theo lịch, AI điều khiển máy tính, nhóm bot giao việc cho nhau, thẻ duyệt? | Hỏi Kevin | Câu trả lời ghi vào mục 4 |
| K18 (phần mở hay đóng) | Tính năng đó nằm trong phần lõi hay trong `enterprise/`? | Đọc mã đúng tính năng đó và `enterprise/FEATURES` | Danh sách tệp và giấy phép từng tệp |
| K19 (pháp lý) | Appota có được dùng phần đó trong Thổ Thần không? | Gửi `LICENSE`, `LICENSING.md`, `enterprise/LICENSE`, `NOTICE` cho bộ phận pháp lý | Ý kiến bằng văn bản |

### 6.4. Nhóm D: MausBot trong hệ sinh thái Appota (N2, N3, N4)

Chỉ làm khi Kevin muốn MausBot dùng cho cả nhóm, không chỉ trên một máy.

| Mã | Câu hỏi | Cách kiểm | Ta đoán | Bằng chứng |
| --- | --- | --- | --- | --- |
| K20 (khoá theo người trong nhóm) | Ở máy chủ nhóm, server của Lab đặt chế độ "từng người" thì cổng có thấy khoá riêng của từng thành viên không? Việc chạy theo lịch dùng khoá nào? | Hai thành viên giả, mỗi người một khoá; cùng gọi `whoami` qua một bot chung; thêm một việc chạy theo lịch gọi `whoami` | Hai khoá khác nhau; việc chạy theo lịch không có khoá người nào | Trường `labEnv` hoặc header trong log probe |
| K21 (cổng mô hình) | Thổ Thần có cổng mô hình theo chuẩn OpenAI mà công cụ ngoài gọi được không? | Hỏi Kevin hoặc đội Thổ Thần | Chưa rõ; chưa thấy API công khai | Câu trả lời ghi vào mục 3.2 |
| K22 (định dạng skill) | Thổ Thần nhận skill ở định dạng nào, có đọc được `SKILL.md` không? | Hỏi đội Thổ Thần; thử nạp một skill giả | Chưa rõ | Câu trả lời ghi vào mục 3.2 |

**Kết luận:** nhóm A trả lời được câu hỏi của Lab trong khoảng nửa ngày, và kết quả có ích dù Kevin chọn hướng nào.
Nhóm B mất khoảng hai giờ; nhóm C không tốn thời gian chạy thử nhưng phụ thuộc người khác.
Nhóm D gồm một phép chạy cần gói nhóm trả phí và hai câu hỏi cho đội Thổ Thần.

## 7. Mẫu thiết kế đáng chép

MausBot là mã nguồn mở và đã gặp đúng các vấn đề của Lab.
Bốn mẫu khớp với [bài học từ thị trường](market/market-lessons.md):

1. **Chữ không phải là lời duyệt.** Mọi dòng bot đọc được gắn nhãn nguồn; dòng từ bot khác, webhook hay ứng dụng ngoài chỉ là thông tin, kể cả khi ghi "đã duyệt".
2. **"Luôn cho phép" chỉ cho lệnh đọc.** Quyền nhớ sẵn gắn đúng bot, đúng server, đúng công cụ, và mất khi cấu hình server đổi; lệnh tạo, sửa, xoá luôn hỏi lại.
3. **Gửi lại không gửi trùng.** Lệnh gửi tin nhận một mã `send_id`; gửi lại cùng mã thì trả biên nhận cũ.
   Đây là chống ghi trùng (idempotency) ở mức tin nhắn, cùng ý với SR6 (không ghi trùng).
4. **Kết quả lớn bị giữ lại phía host.** Host chỉ cho AI xem hình dạng dữ liệu và vài dòng đầu, rồi cho một công cụ hỏi tiếp phần cần.

**Kết luận:** mẫu 1 và 2 đã nằm trong thiết kế cổng; mẫu 3 xác nhận cách làm SR6; mẫu 4 ghi lại để xem khi công cụ tra cứu trả về danh sách dài.

## 8. Rủi ro

- **Sản phẩm còn rất mới và đổi rất nhanh.** Kho mã ba tháng tuổi, gần 200 commit mỗi ngày; hành vi có thể khác tài liệu, nên mọi kết luận phải ghi số phiên bản đã đo.
- **Dữ liệu đi qua nhà cung cấp AI.** Mọi câu chat gửi tới trình AI người dùng chọn; Lab chỉ dùng dữ liệu giả lập, nên không vướng ranh giới dữ liệu.
- **Mặc định toàn quyền.** Ai cài MausBot mà không đổi mức duyệt thì bot gọi công cụ ghi không hỏi.
- **Lệch khỏi việc chính.** [Tổng hợp phát hiện, mục 5.3](../findings.md#53-không-làm-bây-giờ) chốt không đọc sâu thêm hệ thống ngoài; nghiên cứu này phải giữ giới hạn một ngày.

**Kết luận:** không rủi ro nào chặn nhóm A với dữ liệu giả; rủi ro thứ ba củng cố quyết định duyệt ở cổng, rủi ro thứ tư đặt giới hạn thời gian.

## 9. Thứ tự làm

| Bước | Việc | Giới hạn thời gian | Bằng chứng xong |
| --- | --- | --- | --- |
| 1 | Hỏi Kevin muốn hướng nào trong T1-T4, nếu là T3 hay T4 thì muốn tính năng nào (K17), và có muốn dùng MausBot cho cả nhóm không; hỏi đội Thổ Thần K21 và K22 | Đầu tuần 2, cùng lúc báo ba điểm về Thổ Thần | Câu trả lời ghi vào mục 3.2 và mục 4 |
| 2 | Chạy nhóm A (K1-K11) trên MausBot 0.1.165 | Nửa ngày | Log trong `scratch/mcp-probe/`, cột MausBot ở mục 5 đổi thành "đã đo" |
| 3 | Chạy nhóm B (K12-K16) nếu Kevin chọn T2 | Hai giờ | Ảnh và log, bảng ở mục 4.1 đổi thành "đã đo" |
| 4 | Làm nhóm C (K18-K19) nếu Kevin chọn T3 hoặc T4 | Không quá nửa ngày đọc mã; phần pháp lý do người khác | Danh sách tệp và ý kiến pháp lý |
| 5 | Chạy K20 nếu Kevin chọn dùng cho cả nhóm và có gói nhóm | Hai giờ | Log probe có hai khoá khác nhau |
| 6 | Khi bản thử của Lab chạy được trong Thổ Thần, chạy ba kịch bản ở [tổng hợp phát hiện, mục 5.2](../findings.md#52-phạm-vi-bản-thử) trong MausBot | Tuần 3-4 | Bằng chứng "agent thứ hai dùng lại cùng công cụ" |

Kiểm lại các câu trích trong tài liệu này: `bash rd/checks/mausbot.sh`.

**Kết luận:** việc làm ngay là hỏi Kevin và chạy nhóm A; mọi việc khác chờ câu trả lời của Kevin.
