> Bản nháp v0.1 do agent soạn.
> Toàn bộ quan sát dưới đây làm ngày 2026-11-13, không đăng nhập, chỉ dùng dữ liệu công khai mà máy chủ trả về.
> Hai mươi mốt câu trích đã được kiểm chéo bằng script, kết quả 21 PASS, 0 MISS, 0 BLOCKED; lệnh và kết quả ghi ở mục 11.
> Không có số đo hiệu năng, không chọn kiến trúc, không phải ADR.

# Thổ Thần: cùng một cái tên, bốn thứ khác nhau

Owner: Phạm Bách Hiệp. Ngày: 2026-11-13. Revision: 0.1.

## 0. Câu hỏi

Câu hỏi của file này hẹp: khi repo này nói "chạy trên Thổ Thần AI", thực thể nào đang thực sự tồn tại, cái nào chạy thật, cái nào chỉ là tài liệu, và có chỗ nào cắm được một tool hoặc MCP server của lab vào hay không.

Nguồn gốc câu hỏi: [`../context/appota-ai-ecosystem.md`](../../docs/context/appota-ai-ecosystem.md) đặt Thổ Thần AI vào vai AI Execution Plane, nhưng ghi rõ đó là bản chép từ ảnh chụp chưa ai xác nhận.
Báo cáo MCP để mở ba câu hỏi đúng vào chỗ này: Tool/MCP Runtime đã có chưa, duyệt người trước khi ghi nằm ở đâu, và telemetry có đủ trường không.

Ngoài phạm vi: chọn nơi chạy cho lab, xếp hạng phương án, báo giá, đo độ trễ.

## 1. Cách làm

Trang đích là một ứng dụng một trang nằm sau đăng nhập, nên phần đọc nội dung phải đi vòng.
Sáu bước, tất cả chạy lại được:

1. Gọi thẳng `https://thothan.appota.ai/` bằng curl và đọc header phản hồi, `robots.txt`, `sitemap.xml`, `manifest.webmanifest`.
2. Đọc HTML tĩnh và toàn bộ 28 file JavaScript mà HTML đó nạp, để lấy chuỗi định danh, phiên bản và danh sách gói nội bộ.
3. Tải năm ảnh trong `screenshots/` của manifest và xem trực tiếp.
4. Đọc bộ tài liệu ở `docs-srd.appota.ai/tho-than`: `sitemap-pages.xml`, `llms.txt`, `llms-full.txt` (78.220 byte), và từng trang `.md`.
5. Gửi yêu cầu JSON-RPC vào endpoint MCP của bộ tài liệu để bắt tay và liệt kê tool.
6. Viết script `checks/tho-than-platform.sh` mở lại từng nguồn và so khớp nguyên văn câu trích, gồm một hàm riêng cho redirect, một cho header, một cho bắt tay MCP.

Không tạo tài khoản, không đăng nhập, không gửi dữ liệu nào vào hệ thống.

## 2. Kết quả gọn

Bốn thứ khác nhau đang mang tên "Thổ Thần".
Chỉ hai trong bốn là sản phẩm phần mềm đang chạy.
Không có thứ nào là đặc tả, và các tài liệu công khai đang mô tả một nền tảng đã bị thay bằng nền tảng khác.

| # | Thực thể | Ở đâu | Trạng thái | Là gì |
| --- | --- | --- | --- | --- |
| 1 | Thổ Thần web | `thothan.appota.ai` | Chạy, sau đăng nhập | Bản đổi nhãn của LobeHub 2.1.56, không phải mã của Appota |
| 2 | Thổ Thần Coding Agent | Visual Studio Marketplace, id `ThothanCoding.thothan-code` | Chạy | Coding agent riêng cho VS Code, khai báo được MCP server |
| 3 | Tài liệu Thổ Thần | `docs-srd.appota.ai/tho-than` | Còn mở, gần như đóng băng từ 2024-08 | Tài liệu của một nền tảng dạng Dify, không phải của thực thể 1 hay 2 |
| 4 | "Thổ Thần" như tên IP | Toàn công ty | - | Tên IP văn hoá của Appota, dùng cho cả sự kiện nội bộ; không phải nền tảng |

Ghi chú về dòng 4: tên "Thổ Thần" không phải tên riêng của nền tảng AI.
Đó là tên một IP văn hoá của Appota, ra mắt dạng tiểu thuyết fantasy tháng 12/2025, và cũng là tên một sự kiện nội bộ.
Vì vậy khi tìm nguồn về "Thổ Thần", phần lớn kết quả là về IP chứ không phải về nền tảng.
Việc này không ảnh hưởng kỹ thuật, nhưng làm nhiễu mọi lần tra cứu sau này.

## 3. Thổ Thần web: cái đang chạy

### 3.1 Nhận dạng

Đây là LobeHub, một dự án mã nguồn mở, được đổi nhãn chứ không phải viết lại.
Năm dấu vết độc lập:

| Dấu vết | Bằng chứng | Nguồn |
| --- | --- | --- |
| `robots.txt` vẫn là của LobeChat | `Host: https://lobechat.com`, và `Sitemap:` trỏ về `lobechat.com/sitemap-index.xml` | S2 |
| Route cũ tự chuyển sang route mới | `/discover` trả 308 về `/community`, `/chat` trả 308 về `/` | quan sát trực tiếp |
| Bundle chứa `package.json` của chính monorepo | `{"name":"@lobehub/lobehub","version":"2.1.56","repository":{"type":"git","url":"https://github.com/lobehub/lobehub.git"}}` | quan sát trực tiếp, mục 11 |
| Tên gói nội bộ | 90 tên gói `@lobechat/*`, gồm `@lobechat/agent-runtime`, `@lobechat/builtin-skills`, `@lobechat/observability-otel` | quan sát trực tiếp |
| Ảnh trong manifest | Năm ảnh `screenshots/shot-1..5.desktop.png` vẫn là ảnh tiếp thị gốc, còn chữ "LobeChat", còn chữ "LobeHub", còn quảng cáo "gpt-4-vision" | S1, xem trực tiếp |

Phần đã đổi nhãn: tên ứng dụng, mô tả, icon, logo SVG, dòng bản quyền, và thư mục emoji riêng `/emoji/thothan/`.

Mô tả trong manifest, nguyên văn: "Thổ Thần is a work-and-lifestyle space to find, build, and collaborate with agent teams that grow with you."
Trang đăng nhập hiển thị cùng câu đó dạng "Agent teammates that grow with you", kèm xác nhận "© 2026 Thổ Thần. All rights reserved."

Hai chỗ chưa dọn là `robots.txt` và bộ ảnh manifest.
Hệ quả thực tế: `robots.txt` của Appota đang chỉ đường sitemap sang tên miền của bên thứ ba, và bộ ảnh cài đặt ứng dụng trên thiết bị vẫn là ảnh của LobeChat.
Đây là lỗi nhãn hiệu nhìn thấy được từ ngoài, không phải lỗi chức năng.

### 3.2 Hạ tầng quan sát được

| Thuộc tính | Giá trị | Cách biết |
| --- | --- | --- |
| Nơi chạy | Railway, vùng `hkg1` (Hong Kong) | Header `Server: railway-hikari`, `x-railway-edge: hkg1`, `x-railway-request-id` |
| Chứng chỉ TLS | Let's Encrypt, `CN=thothan.appota.ai`, hết hạn 2026-12-16 | `openssl s_client` |
| Khung ứng dụng | Next.js App Router, chunk đóng gói bằng Turbopack | HTML và đường dẫn `/_next/static/chunks/` |
| Kiểm soát truy cập | Đã gọi thử 12 đường dẫn: 6 route giao diện và 6 route API. Toàn bộ route giao diện và 5 trên 6 route API trả 302 về `/signin?callbackUrl=...`; riêng `/api/agent` trả 405 vì chỉ nhận POST | Gọi thử từng đường dẫn |
| Chỉ mục tìm kiếm | `x-robots-tag: all` | Header phản hồi |
| Ngôn ngữ | Trang mặc định `lang="en"`; bundle có chuỗi `vi-VN` và bản dịch `vi` | HTML và bundle |
| Có app di động đi kèm | Bundle chứa `com.appotahub.mobile`, `mobileAuthCallback`, `Capacitor.Plugins.Browser`, `NativeGoogleSignIn` | Bundle |

Chi tiết đáng chú ý: `com.appotahub.mobile` cho thấy có một ứng dụng di động tên AppotaHub nhúng trang này qua Capacitor, và luồng đăng nhập có nhánh gọi sang ứng dụng đó.
Chi tiết này chưa được xác minh thêm vì không có thiết bị hay bản cài để kiểm.

### 3.3 Bề mặt tính năng đọc từ bundle

Không đăng nhập được nên phần này đọc từ tên gói nội bộ và chuỗi giao diện.
Đây là bằng chứng về việc mã có tồn tại trong bản triển khai, không phải bằng chứng tính năng đã được bật cho người dùng.

| Nhóm | Gói hoặc chuỗi tìm thấy | Nghĩa |
| --- | --- | --- |
| Runtime agent | `@lobechat/agent-runtime`, `@lobechat/agent-gateway-client`, `@lobechat/agent-tracing`, `@lobechat/agent-templates` | Có runtime agent, có dấu vết, có mẫu agent |
| Skill | `@lobechat/builtin-skills`, `builtin-tool-skills`, `builtin-tool-skill-store`, `builtin-tool-skill-maintainer` | Có cơ chế skill, chợ skill, và tool tự bảo trì skill |
| Công cụ dựng sẵn | `builtin-tool-agent-builder`, `agent-management`, `agent-marketplace`, `knowledge-base`, `memory`, `task`, `gtd`, `page-agent`, `notebook`, `department` | Rất rộng, vượt xa một giao diện chat |
| Thực thi mã và máy | `builtin-tool-cloud-sandbox`, `builtin-tool-code-workspace`, `builtin-tool-local-system`, `builtin-tool-claude-code`, `builtin-tool-device-controller`, `builtin-tool-remote-device`, `@lobechat/python-interpreter` | Chạy được lệnh và mã ở sandbox, máy cục bộ, thiết bị từ xa |
| Kênh trò chuyện | `@lobechat/chat-adapter-feishu`, `-line`, `-qq`, `-wechat` | Cắm được vào kênh nhắn tin ngoài |
| Đo lường | `@lobechat/observability-otel`, `@lobechat/agent-tracing` | Có OpenTelemetry trong mã |
| An toàn | `@lobechat/ssrf-safe-fetch`, `builtin-tool-creds` | Có chặn SSRF và có kho thông tin xác thực |

### 3.4 Cái không kiểm được vì không có tài khoản

Danh sách này phải giữ nguyên khi trích dẫn file này, để không ai đọc phần trên thành đặc tả.

- Model nào đang bật, nhà cung cấp nào, định tuyến ra sao.
- Có bật tính năng MCP hay không, và có bật chợ MCP hay không.
- Chính sách phân quyền theo vai, theo phòng ban, theo dữ liệu.
- Có duyệt người trước khi ghi hay không.
- Log và dấu vết được lưu bao lâu, lưu ở đâu.
- Chi phí, hạn mức, cách tính token.
- Nhà cung cấp đăng nhập thật sự được bật.

Không có mục nào ở trên được suy ra từ tên gói.

## 4. Tài liệu Thổ Thần: mô tả một nền tảng khác

Bộ tài liệu ở `docs-srd.appota.ai/tho-than` là GitBook, còn mở, nhưng đóng băng từ tháng 8/2024.
Mốc thời gian: `sitemap-pages.xml` cho thấy 18 trên 19 trang có `lastmod` trong tháng 8/2024, riêng trang tích hợp công cụ nâng cao được sửa ngày 2025-07-11; chính GitBook in "Last updated 2 years ago" ở chân trang giới thiệu.
Nội dung 19 trang: Thổ Thần Studio, tạo app chat, Model, nền tảng kiến thức, Thiết lập app, Agent, Workflow, nhật ký và chú thích, công cụ.

Nội dung đó không mô tả thực thể đang chạy ở mục 3.
Ba dấu vết cho thấy nó mô tả một nền tảng dựng trên Dify:

1. Trang hướng dẫn công cụ bảo người đọc tham khảo đường dẫn `api/core/tools/provider/builtin/wikipedia/wikipedia.yaml`.
2. Cùng trang đó đưa mã mẫu `from core.tools.errors import ToolProviderCredentialValidationError`.
3. Cả hai đường dẫn khớp nguyên văn với mã nguồn Dify phiên bản 0.15.3, không phải mã của Appota.

Ngoài ra thuật ngữ trong tài liệu là thuật ngữ của Dify: Chatflow, tạo ứng dụng từ DSL File, annotation, phân đoạn tài liệu, hai loại công cụ "Built-in" và "Custom".

Kết luận có thể đọc được từ đây: Appota đã đổi nền tảng giữa hai thế hệ, từ một bản Dify đổi nhãn năm 2024 sang một bản LobeHub đổi nhãn năm 2026, và chưa viết lại tài liệu.
Bản thân việc đổi nền tảng không phải vấn đề.
Vấn đề cho lab là: không có tài liệu công khai nào mô tả hệ thống đang chạy.

Chi tiết quan trọng nhất của mục này: trong 78.220 byte tài liệu, số lần xuất hiện của chuỗi "MCP" là 0.
Tài liệu cũng không có trang nào về API, khoá API, giới hạn tần suất, hay hợp đồng tích hợp.
Đường liên hệ duy nhất là một địa chỉ email của phòng R&D.

## 5. MCP: hai điểm nối đã kiểm chứng

Đây là phần liên quan trực tiếp nhất tới Track 01.

### 5.1 Một MCP server thật, đang sống, của Appota

Bộ tài liệu GitBook có endpoint MCP ở `https://docs-srd.appota.ai/tho-than/~gitbook/mcp`.
Tôi đã bắt tay thật bằng JSON-RPC, không phải suy đoán từ tài liệu.

Kết quả `initialize`:

```json
{"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},
 "serverInfo":{"name":"docs-srd.appota.ai/tho-than/~gitbook/mcp","title":"Thổ Thần MCP Server","version":"0.28.2"}},"jsonrpc":"2.0","id":1}
```

Kết quả `tools/list` có đúng ba tool:

| Tool | Việc | Ghi chú |
| --- | --- | --- |
| `searchDocumentation` | Tìm trong bộ tài liệu | `readOnlyHint: true` |
| `getPage` | Lấy toàn văn một trang theo URL | `readOnlyHint: true` |
| `sendFeedback` | Báo lỗi tài liệu | Ghi, nhưng chỉ ghi vào kênh phản hồi tài liệu |

Vận chuyển là Streamable HTTP, trả `text/event-stream`.
Endpoint chạy trên hạ tầng GitBook (Cloudflare và Vercel ở vùng `hkg1`), không phải do Appota tự dựng.

Đánh giá đúng giá trị: đây là MCP server thật đầu tiên của Appota mà tôi kiểm chứng được, nhưng nó chỉ đọc tài liệu.
Nó không chạm vào hệ thống nghiệp vụ nào, không có ghi vào danh bạ hay danh sách công việc, và không phải là Tool/MCP Runtime mà sơ đồ hệ sinh thái mô tả.
Nó là bằng chứng rằng tổ chức này đã có ít nhất một endpoint MCP công khai, không phải bằng chứng đã có runtime MCP cho nghiệp vụ.

### 5.2 LobeHub là MCP host, nên thực thể 1 có thể cắm được MCP server

Phía thượng nguồn, LobeHub đã làm MCP client từ RFC 112, và từ commit `85454c5` thì cài được MCP server Streamable HTTP ngay trên bản web, không cần bản desktop.
Cấu hình nhận ba dạng xác thực: không xác thực, bearer, và OAuth2.

Bản đang chạy là 2.1.56, tức sau mốc đó.
Trong bundle có tham chiếu `apps/mcp-gateway`, và `mcp-hello-world` chỉ nằm ở `devDependencies`, tức là công cụ kiểm thử của chính monorepo.

Hệ quả có thể dùng được ngay cho lab: nếu instance Thổ Thần web bật phần skill và MCP, thì một MCP server của lab cắm vào được như một skill, và người dùng có thể gọi tool của lab ngay trong giao diện chat của công ty.
Đây chỉ là điều kiện đủ về phía phần mềm; chưa xác minh được instance đã bật hay chưa.

### 5.3 Sản phẩm thứ hai cũng là MCP host

Trang Marketplace của extension VS Code ghi rõ một trong các tính năng: "Configure models, providers, MCP servers, skills, and project rules".
Nghĩa là cùng một tool của lab có thể được khai báo ở hai nơi khác nhau, bởi hai sản phẩm khác nhau, mà không cần viết lại.
Đây là chất liệu trực tiếp cho tiêu chí "agent thứ hai dùng lại cùng tool" trong phần định nghĩa hoàn thành của Track 01.

## 6. Đối chiếu với câu hỏi đang mở trong repo

| Câu hỏi đang mở | Trả lời sau lần khảo sát này | Mức tin cậy |
| --- | --- | --- |
| Trong sáu ô của Thổ Thần AI, ô nào đã chạy thật? | Chắc chắn có ô giao diện chat, agent runtime, skill, công cụ dựng sẵn, và một MCP host. Không xác minh được ô lớn hơn vì không có tài khoản. | Trung bình |
| Tool/MCP Runtime đã có chưa? | Có MCP host ở tầng sản phẩm, và có một MCP server chỉ đọc tài liệu. Chưa thấy runtime MCP cho nghiệp vụ. | Trung bình |
| Duyệt người trước khi ghi nằm ở đâu? | KHÔNG TÌM THẤY trong mọi nguồn công khai đã đọc. | - |
| Telemetry có đủ trường cho Value Intelligence? | Mã có OpenTelemetry. Chưa biết có bật và có trường nào. | Thấp |
| Lab đứng độc lập, hay là Tool/MCP Runtime cắm vào Thổ Thần, hay là lớp policy đứng trước runtime? | Chưa chọn. Nhưng lựa chọn thứ hai giờ có một đường cắm cụ thể để thử, thay vì là giả định. | - |

Ba câu hỏi trên không được trả lời bởi tài liệu.
Chúng chỉ trả lời được bằng một tài khoản thật, hoặc bằng một buổi hỏi trực tiếp người sở hữu sản phẩm.

## 7. Cảnh báo khi dùng tài liệu này

Ba điều dễ làm sai, ghi ra để người sau không mắc lại.

1. Không trích dẫn bộ tài liệu ở mục 4 như đặc tả của nền tảng đang chạy.
   Nó mô tả một bản Dify của năm 2024.
2. Không đọc mục 3.3 thành danh sách tính năng đã bật.
   Đó là bằng chứng mã có trong bản triển khai, không phải bằng chứng người dùng thấy được.
3. Không dùng "Thổ Thần" làm từ khoá duy nhất khi tra cứu.
   Tên đó trùng với một IP văn hoá và một sự kiện nội bộ, kết quả sẽ bị nhiễu.

## 8. Câu hỏi mở và giả thuyết kiểm được

Mỗi giả thuyết kèm cách kiểm và người có thể trả lời.

| ID | Giả thuyết | Cách kiểm | Ai trả lời được |
| --- | --- | --- | --- |
| H1 | Instance `thothan.appota.ai` bật tính năng skill và MCP cho người dùng | Đăng nhập, mở Cài đặt, tìm mục thêm MCP server tùy chỉnh; thử cắm một MCP server cục bộ | Người có tài khoản, Kevin |
| H2 | Có một Tool/MCP Runtime dùng chung cho nghiệp vụ, tách khỏi LobeHub | Hỏi trực tiếp; tìm tên miền nội bộ dạng `mcp.*` hoặc `gateway.*` | Kevin |
| H3 | Duyệt người trước khi ghi chưa tồn tại ở tầng nền tảng | Hỏi trực tiếp; nếu chưa có thì lab được phép đề xuất đặt ở runtime | Kevin |
| H4 | Bộ tài liệu 2024 đã bị bỏ, không còn người cập nhật | Gửi `sendFeedback` qua chính MCP server của tài liệu và xem có phản hồi | Phòng SRD, `srd@appota.com` |
| H5 | Ngôn ngữ mặc định của instance là tiếng Anh, tiếng Việt chỉ là bản dịch có sẵn | Kiểm sau khi đăng nhập, đổi ngôn ngữ, xem chất lượng bản dịch ở màn hình agent và skill | Người có tài khoản |
| H6 | App mobile AppotaHub nhúng chính trang này qua Capacitor, nên là cùng một phiên đăng nhập | Mở app, kiểm luồng `mobileAuthCallback` | Người có app |

H1 là giả thuyết quan trọng nhất.
Nó quyết định lựa chọn "lab là Tool/MCP Runtime cắm vào Thổ Thần" có phải là một thử nghiệm làm được trong tuần hay chỉ là một giả định trên giấy.

## 9. Giới hạn

- Không có tài khoản, nên toàn bộ mục 3.4 là khoảng trắng, không phải kết luận.
- Chưa mở được giao diện sau đăng nhập, nên chưa có ảnh chụp nào của sản phẩm thật, chỉ có ảnh tiếp thị của LobeChat.
- Chưa kiểm phiên bản Dify mà Appota dùng năm 2024; chỉ khẳng định đường dẫn và câu lệnh trong tài liệu khớp Dify 0.15.3.
- Chưa xác minh quan hệ giữa extension VS Code và nền tảng web; hai bên có thể dùng chung tài khoản hoặc không.
- Chưa đo gì. Không có số liệu độ trễ, độ ổn định hay chi phí.
- Con số phiên bản 2.1.56 đọc từ bundle có thể đổi sau mỗi lần triển khai, vì tên file chunk đổi theo bản dựng.

## 10. Sổ nguồn

Cột "khớp" là `có` khi script ở mục 11 mở lại URL ngày 2026-11-13 và so khớp nguyên văn câu trích dùng trong file này.

| ID | Nguồn | Loại | URL | Ngày | Khớp | Dùng ở |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Thổ Thần, manifest ứng dụng | Tệp cấu hình công khai | https://thothan.appota.ai/manifest.webmanifest | không có ngày | có | 2, 3.1 |
| S2 | Thổ Thần, robots.txt | Tệp cấu hình công khai | https://thothan.appota.ai/robots.txt | không có ngày | có | 3.1 |
| S3 | Thổ Thần, trang gốc và các route công khai | Quan sát trực tiếp | https://thothan.appota.ai/ | 2026-11-13 | có | 3.2 |
| S4 | Thổ Thần, header phản hồi | Quan sát trực tiếp | https://thothan.appota.ai/ | 2026-11-13 | có | 3.2 |
| S5 | Thổ Thần, Giới thiệu | Tài liệu chính thức | https://docs-srd.appota.ai/tho-than/gioi-thieu.md | cập nhật 2024-08 | có | 2, 4 |
| S6 | Thổ Thần, Công cụ | Tài liệu chính thức | https://docs-srd.appota.ai/tho-than/huong-dan/cong-cu.md | cập nhật 2024-08 | có | 4 |
| S7 | Thổ Thần, Workflow | Tài liệu chính thức | https://docs-srd.appota.ai/tho-than/huong-dan/application/workflow.md | cập nhật 2024-08 | có | 4 |
| S8 | Thổ Thần, Agent | Tài liệu chính thức | https://docs-srd.appota.ai/tho-than/huong-dan/application/agent.md | cập nhật 2024-08 | có | 4 |
| S9 | Thổ Thần, Tích hợp nhanh công cụ | Tài liệu chính thức | https://docs-srd.appota.ai/tho-than/huong-dan/cong-cu/tich-hop-nhanh-cong-cu.md | cập nhật 2024-08 | có | 4 |
| S10 | Dify 0.15.3, `wikipedia.yaml` | Mã nguồn | https://raw.githubusercontent.com/langgenius/dify/0.15.3/api/core/tools/provider/builtin/wikipedia/wikipedia.yaml | thẻ 0.15.3 | có | 4 |
| S11 | Dify 0.15.3, `errors.py` | Mã nguồn | https://raw.githubusercontent.com/langgenius/dify/0.15.3/api/core/tools/errors.py | thẻ 0.15.3 | có | 4 |
| S12 | Thổ Thần MCP Server, bắt tay `initialize` | Quan sát trực tiếp | https://docs-srd.appota.ai/tho-than/~gitbook/mcp | 2026-11-13 | có | 5.1 |
| S13 | Thổ Thần Coding Agent trên Marketplace | Trang sản phẩm | https://marketplace.visualstudio.com/items?itemName=ThothanCoding.thothan-code | không hiển thị ngày | có | 2, 5.3 |
| S14 | LobeHub, RFC 112 MCP | Thảo luận thiết kế | https://github.com/lobehub/lobehub/discussions/7495 | không hiển thị ngày | có | 5.2 |
| S15 | LobeHub, commit 85454c5 | Mã nguồn | https://github.com/lobehub/lobehub/commit/85454c5 | 2025-11-04 | có | 5.2 |
| S16 | LobeHub, kho mã nguồn | Mã nguồn | https://github.com/lobehub/lobehub | không có ngày | không kiểm trong script | 3.1 |
| S17 | Appota, Huyền Thoại Thổ Thần ra mắt | Bài đăng chính thức | https://vn.linkedin.com/posts/appota_appota-huyenthoaithothan-ipviet-activity-7403703635899293696-gKUR | 2025-12-08 | không kiểm trong script | 2 |
| S18 | Nhân Dân, Huyền thoại thổ thần | Báo | https://nhandan.vn/huyen-thoai-tho-than-dau-an-moi-cua-van-hoc-fantasy-viet-nam-post928299.html | 2025-12-05 | không kiểm trong script | 2 |

Ghi chú S16 tới S18: ba nguồn này chỉ dùng cho dòng 4 của bảng ở mục 2, tức phần nhận dạng tên, không dùng cho bất kỳ khẳng định kỹ thuật nào.
Chúng không nằm trong script vì hai trang LinkedIn và báo dễ chặn truy cập tự động.

Ghi chú về S12: endpoint MCP không phải tệp tĩnh, phải gửi POST đúng định dạng JSON-RPC mới trả lời.
GET vào cùng đường dẫn trả 405, nên một lần kiểm bằng trình duyệt sẽ cho kết quả sai.

## 11. Chạy lại

Kiểm chéo tự động:

```bash
bash rd/01-explore/checks/tho-than-platform.sh
```

Kết quả ngày 2026-11-13: 21 PASS, 0 MISS, 0 BLOCKED, mã thoát 0.

Đọc phiên bản LobeHub từ bundle, khi cần kiểm lại con số 2.1.56:

```bash
cd /tmp && curl -s -A "Mozilla/5.0" https://thothan.appota.ai/ -o thothan.html
grep -o '/_next/static/chunks/[a-zA-Z0-9_.-]*\.js' thothan.html | sort -u > chunklist.txt
mkdir -p chunks && while read -r c; do curl -s -A "Mozilla/5.0" "https://thothan.appota.ai$c" -o "chunks/$(basename $c)"; done < chunklist.txt
grep -ho '"name":"@lobehub/lobehub","version":"[^"]*"' chunks/*.js
```

Bắt tay MCP bằng tay, không cần client:

```bash
curl -s -X POST "https://docs-srd.appota.ai/tho-than/~gitbook/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}'
```

Lưu ý khi chạy lại: tên file chunk đổi sau mỗi lần triển khai, nên lệnh trên phải chạy nguyên cụm, không được giữ lại danh sách chunk cũ.
