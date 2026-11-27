# Thổ Thần: cùng một cái tên, bốn thứ khác nhau

Ngày: 2026-11-27. Trạng thái: khảo sát công khai ngày 2026-11-13, cắm MCP thử bằng tài khoản ngày 2026-11-16 (mục 3.5), đo HTTPS công khai và đọc mã LobeHub 2.1.56 ngày 2026-11-17 (mục 3.6 và 6), đọc bản dựng mới ngày 2026-11-18 và xem giao diện sau đăng nhập ngày 2026-11-19 (mục 3.7); hành vi khi gọi công cụ của Lab và hệ quả gộp ở mục 2.1.

## Đọc nhanh

- "Thổ Thần" là bốn thứ khác nhau; bản web đang chạy là LobeHub 2.1.56 đổi nhãn, không phải mã của Appota.
- Lần cắm thử bằng tài khoản cho thấy công cụ của Lab chạy được trong chat: qua stdio trên máy người dùng, và qua một địa chỉ HTTPS công khai (mục 3.6).
- Mã LobeHub 2.1.56 không tự gắn danh tính người dùng vào lời gọi công cụ, nhưng phép đo HTTPS thấy máy chủ Thổ Thần gắn thêm header danh tính; chưa biết người dùng có giả được không.
- Mã LobeHub có một chế độ duyệt bị ẩn cho phép công cụ chạy mà không hỏi; lời gọi tới nhà cung cấp mô hình có gửi mã người dùng.
- Ngày 2026-11-18, Appota ra bản web mới cùng ứng dụng điện thoại và Thổ Thần Bridge, một ứng dụng cho chat trên điện thoại chạy lệnh trên máy tính; nền vẫn là LobeHub 2.1.56 (mục 3.7).
- Vì vậy cổng của Lab phải tự kiểm danh tính và tự chặn ghi, không dựa vào phần mềm chat.

## 0. Câu hỏi

Câu hỏi của file này hẹp: khi repo này nói "chạy trên Thổ Thần AI", thực thể nào đang thực sự tồn tại, cái nào chạy thật, cái nào chỉ là tài liệu, và có chỗ nào cắm được một tool hoặc MCP server của lab vào hay không.

Câu hỏi thứ hai, thêm ngày 2026-11-17: mã LobeHub 2.1.56 có gắn danh tính người dùng vào lời gọi MCP trong chat và lời gọi tới nhà cung cấp mô hình không, và có chế độ duyệt công cụ nào bị ẩn không.

Nguồn gốc câu hỏi: [`../context/appota-ai-ecosystem.md`](../../docs/context/appota-ai-ecosystem.md) đặt Thổ Thần AI vào vai AI Execution Plane, nhưng ghi rõ đó là bản chép từ ảnh chụp chưa ai xác nhận.
Báo cáo MCP để mở ba câu hỏi đúng vào chỗ này: Tool/MCP Runtime đã có chưa, duyệt người trước khi ghi nằm ở đâu, và telemetry có đủ trường không.

Ngoài phạm vi: chọn nơi chạy cho lab, xếp hạng phương án, báo giá, đo độ trễ.

## 1. Cách làm

Trang đích là một ứng dụng một trang nằm sau đăng nhập, nên phần đọc nội dung phải đi vòng.
Bảy bước, tất cả chạy lại được:

1. Gọi thẳng `https://thothan.appota.ai/` bằng curl và đọc header phản hồi, `robots.txt`, `sitemap.xml`, `manifest.webmanifest`.
2. Đọc HTML tĩnh và toàn bộ 28 file JavaScript mà HTML đó nạp, để lấy chuỗi định danh, phiên bản và danh sách gói nội bộ.
3. Tải năm ảnh trong `screenshots/` của manifest và xem trực tiếp.
4. Đọc bộ tài liệu ở `docs-srd.appota.ai/tho-than`: `sitemap-pages.xml`, `llms.txt`, `llms-full.txt` (78.220 byte), và từng trang `.md`.
5. Gửi yêu cầu JSON-RPC vào endpoint MCP của bộ tài liệu để bắt tay và liệt kê tool.
6. Viết script `rd/checks/tho-than-platform.sh` mở lại từng nguồn và so khớp nguyên văn câu trích, gồm hàm riêng cho redirect, header, bắt tay MCP và mã nguồn.
7. Tải tarball tag `v2.1.56` của LobeHub, đọc các tệp MCP client, MCP service, model runtime và chế độ duyệt; ghi đường dẫn và số dòng, không chép mã.

Bảy bước trên không tạo tài khoản, không đăng nhập, không gửi dữ liệu nào vào hệ thống.
Lần cắm thử ở mục 3.5 dùng tài khoản thật của lab nhưng chỉ dữ liệu giả lập; chi tiết và bằng chứng ở [kịch bản đo MCP](tho-than-mcp-probe.md).
Không có số đo hiệu năng và không chọn kiến trúc.

## 2. Kết quả gọn

Bốn thứ khác nhau đang mang tên "Thổ Thần".
Chỉ hai trong bốn là sản phẩm phần mềm đang chạy.
Không có thứ nào là đặc tả, và các tài liệu công khai đang mô tả một nền tảng đã bị thay bằng nền tảng khác.

| # | Thực thể | Ở đâu | Trạng thái | Là gì |
| --- | --- | --- | --- | --- |
| 1 | Thổ Thần web | `thothan.appota.ai`, cùng ứng dụng iOS (TestFlight) và Thổ Thần Bridge cho máy tính, giới thiệu ở `thothan.ai` | Chạy, sau đăng nhập | Bản đổi nhãn của LobeHub 2.1.56, không phải mã của Appota; ứng dụng điện thoại và Bridge dùng chung tài khoản (mục 3.7) |
| 2 | Thổ Thần Coding Agent | Visual Studio Marketplace, id `ThothanCoding.thothan-code` | Chạy | Coding agent riêng cho VS Code, khai báo được MCP server |
| 3 | Tài liệu Thổ Thần | `docs-srd.appota.ai/tho-than` | Còn mở, gần như đóng băng từ 2024-08 | Tài liệu của một nền tảng dạng Dify, không phải của thực thể 1 hay 2 |
| 4 | "Thổ Thần" như tên IP | Toàn công ty | - | Tên IP văn hoá của Appota, dùng cho cả sự kiện nội bộ; không phải nền tảng |

Ghi chú về dòng 4: tên "Thổ Thần" không phải tên riêng của nền tảng AI.
Đó là tên một IP văn hoá của Appota, ra mắt dạng tiểu thuyết fantasy tháng 12/2025, và cũng là tên một sự kiện nội bộ.
Vì vậy khi tìm nguồn về "Thổ Thần", phần lớn kết quả là về IP chứ không phải về nền tảng.
Việc này không ảnh hưởng kỹ thuật, nhưng làm nhiễu mọi lần tra cứu sau này.

### 2.1 Thổ Thần gọi công cụ của Lab thế nào, và hệ quả

Bảng này gộp lần cắm thử ngày 2026-11-16 (mục 3.5), phép đo HTTPS ngày 2026-11-17 (mục 3.6) và phần đọc mã LobeHub 2.1.56 (mục 6).
Cột cuối là việc cổng của Lab phải tự làm vì Thổ Thần không làm.

| Điều cần biết | Thổ Thần làm gì | Hệ quả cho Lab |
| --- | --- | --- |
| Nối bằng cách nào | Chat gọi được công cụ qua cả stdio và Streamable HTTP. HTTP chỉ chạy khi server có địa chỉ HTTPS công khai: nối tới `localhost` báo lỗi `fetch failed`, vì lời gọi đi qua máy chủ Thổ Thần ([kịch bản đo, mục 4.8](tho-than-mcp-probe.md#48-kết-quả-đo-qua-https-công-khai-ngày-2026-11-17-s1-s6)). | Cổng chạy ở một máy chủ chung và Thổ Thần web lẫn desktop gọi `/mcp` qua HTTPS; không có chương trình nối stdio ([ADR-0004](../../docs/adr/adr-0004-shared-gateway-over-https.md)). Cần một địa chỉ công khai: đường hầm tạm cho tới khi Kevin cho máy chủ thật. |
| Danh tính | Qua stdio, server chỉ thấy tên ứng dụng, không thấy tài khoản. Qua HTTPS công khai, máy chủ Thổ Thần gắn thêm bốn header mang mã và email người dùng (đo 2026-11-17, một tài khoản). Mã LobeHub 2.1.56 không gắn các header này, nên đó là phần Appota thêm; chưa biết Thổ Thần ghi đè hay nối thêm header người dùng tự đặt (mục 3.6, mục 6.2). Màn hình cấu hình chỉ có "không xác thực" và "khoá API", không có đăng nhập ủy quyền (OAuth2). Khoá Bearer do người thêm skill đặt và tới được server; phép đo chỉ dùng một tài khoản và một skill nên chưa biết khoá riêng từng người hay dùng chung. Ai có token gọi thẳng endpoint cũng tự đặt được `x-user-id`. | Cổng cấp và tự kiểm khoá riêng cho từng người, nhận ra người hỏi qua khoá đó. Đổi khoá có hiệu lực ở lần gọi sau, không cần mở lại ứng dụng. Header của Thổ Thần chỉ làm lớp kiểm thứ hai, và chỉ khi H9 (ghi đè `x-user-id`) và H10 (phiên tách theo người dùng) đúng (mục 6.5). |
| Danh tính trong lời gọi tới mô hình | Mã LobeHub gửi mã người dùng thô trong nội dung lời gọi: `user`, `safety_identifier` hoặc `metadata.user_id`, tuỳ nhà cung cấp. Chỉ đọc mã, chưa đo (mục 6.3). | Không coi lời gọi tới mô hình là ẩn danh khi đưa dữ liệu vào chat. |
| Duyệt | Không hỏi trước khi gọi công cụ ghi, kể cả ở chế độ duyệt tay. Mã giải thích vì sao: công cụ MCP không khai báo chính sách duyệt (`humanIntervention`), nên chế độ tay vẫn cho chạy. Ngoài ba chế độ hiện trên giao diện còn một chế độ ẩn `headless`, API nhận và là mặc định khi lời gọi không gửi cấu hình (mục 6.4). Không có biểu mẫu hỏi người dùng (elicitation). Link trong kết quả bấm được và mở trình duyệt. | Cổng không được dựa vào hộp duyệt của Thổ Thần: tự kiểm quyền và tự chặn ghi. Duyệt nằm ở trang riêng của cổng, mở bằng link; khớp [bài học về kênh duyệt](../research/market-lessons.md#34-lời-duyệt-phải-khóa-vào-đúng-nội-dung-và-đi-qua-kênh-agent-không-giả-được). |
| Gọi lại và thời gian chờ | Không tự gọi lại khi công cụ báo lỗi. Cắt mọi lệnh sau 60 giây, và nút dừng không hủy ngay. Mỗi lần gọi là một tiến trình mới. | Công cụ phải trả lời dưới 60 giây; việc dài như chuyển 30 task chạy nền và trả mã theo dõi. Mọi trạng thái lưu ở cổng, không giữ trong bộ nhớ. |
| Hiển thị và vết | Không hiện dữ liệu có cấu trúc. Kết quả lỗi của probe vẫn có dấu tích xanh; lời từ chối của cổng Lab, có đánh dấu lỗi (`isError`), hiện dấu cảnh báo "1 failed" trên desktop ([nghiệm thu mốc 2, mục 2](../evaluation/milestone-2-tho-than.md#2-kịch-bản-b-nam-bị-từ-chối)). Không có mã vết, không có số token. | Kết quả viết bằng chữ dễ đọc, lỗi ghi rõ trong chữ. Cổng tự sinh mã vết cho SR7 (vết xuyên suốt). |

Độ tin cậy cao với duyệt, thời gian chờ, đường đi của khoá và việc lời gọi đi qua máy chủ Thổ Thần, vì có log, ảnh, lần lặp lại và phần đọc mã.
Độ tin cậy trung bình với nguồn gốc header danh tính và việc chia sẻ khoá: mới có một tài khoản, một skill, và log gốc của phép đo HTTPS chỉ còn bản tóm tắt (mục 3.6).

**Kết luận:** MCP chỉ mang lời gọi, không mang an toàn.
Trong Thổ Thần, chuẩn này không cho biết ai đang hỏi và không có bước duyệt đáng tin, nên cổng của Lab tự làm cả hai.
Khoá chỉ chứng minh "người cài công cụ này", không phải một lần đăng nhập; vì vậy cổng tự kiểm khoá, thu hồi được khoá, và che khoá trong log.
Header `x-user-id` chỉ thành lớp kiểm thứ hai sau khi H9 và H10 có kết quả (mục 9).
Ô biến môi trường của stdio không hiện sẵn trong form cài; người dùng phải thêm qua "Import JSON config", nên hướng dẫn cài của Lab phải ghi rõ bước này.

## 3. Thổ Thần web: cái đang chạy

### 3.1 Nhận dạng

Đây là LobeHub, một dự án mã nguồn mở, được đổi nhãn chứ không phải viết lại.
Năm dấu vết độc lập:

| Dấu vết | Bằng chứng | Nguồn |
| --- | --- | --- |
| `robots.txt` vẫn là của LobeChat | `Host: https://lobechat.com`, và `Sitemap:` trỏ về `lobechat.com/sitemap-index.xml` | S2 |
| Route cũ tự chuyển sang route mới | `/discover` trả 308 về `/community`, `/chat` trả 308 về `/` | quan sát trực tiếp |
| Bundle chứa `package.json` của chính monorepo | `{"name":"@lobehub/lobehub","version":"2.1.56","repository":{"type":"git","url":"https://github.com/lobehub/lobehub.git"}}` | quan sát trực tiếp, mục 12 |
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

Chi tiết đáng chú ý: `com.appotahub.mobile` cho thấy có một ứng dụng di động tên AppotaHub nhúng trang này qua Capacitor (khung đóng gói trang web thành ứng dụng điện thoại), và luồng đăng nhập có nhánh gọi sang ứng dụng đó.
Ngày 2026-11-18, trang `thothan.ai` xác nhận ứng dụng này tồn tại và đang thử nghiệm trên iOS (mục 3.7); chưa cài thử trên thiết bị.

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

### 3.4 Cái không kiểm được khi chưa có tài khoản, và trạng thái sau lần cắm thử

Danh sách này phải giữ nguyên khi trích dẫn file này, để không ai đọc mục 3.3 thành đặc tả.
Cột phải ghi những gì lần cắm thử ngày 2026-11-16 trả lời được (mục 3.5).

| Điều chưa biết | Sau lần cắm thử |
| --- | --- |
| Model nào đang bật, nhà cung cấp nào, định tuyến ra sao | Chưa kiểm. |
| Có bật tính năng MCP hay không, có chợ MCP hay không | Có: bản desktop có Skill Store và nút thêm MCP server tùy chỉnh. |
| Chính sách phân quyền theo vai, theo phòng ban, theo dữ liệu | Chưa kiểm; server MCP không nhận được thông tin nào về người dùng. |
| Có duyệt người trước khi ghi hay không | Không có với MCP tool, kể cả ở chế độ duyệt tay. |
| Log và dấu vết lưu bao lâu, ở đâu | Chưa kiểm; host không gửi mã vết nào sang server MCP. |
| Chi phí, hạn mức, cách tính token | Tài khoản tính theo credit, gói FREE 500 credit mỗi kỳ; giao diện chat không hiện số token. |
| Nhà cung cấp đăng nhập thật sự được bật | Chưa kiểm. |

Không có mục nào ở trên được suy ra từ tên gói.

**Kết luận:** lần cắm thử trả lời được ba trên bảy điều chưa biết; bốn điều còn lại cần hỏi người sở hữu sản phẩm.

### 3.5 Lần cắm MCP thử bằng tài khoản (2026-11-16)

Lab cắm một server MCP thử (probe) vào Thổ Thần desktop, gọi bảy tool giả lập và ghi lại mọi thứ host gửi sang.
Server, log và ảnh chụp nằm ở [kịch bản đo MCP](tho-than-mcp-probe.md); bảng dưới chỉ giữ phần ảnh hưởng thiết kế.

| Câu hỏi | Quan sát | Bằng chứng trong kịch bản đo |
| --- | --- | --- |
| Thêm server ở đâu | Cài đặt > Integration > Skill Store > Add > "Add Custom MCP Skill"; có nhập cấu hình JSON | Mục 4.6, ảnh `p1-01` đến `p1-08` |
| Kiểu nối | Streamable HTTP (không hỗ trợ SSE) và stdio (lệnh, tham số, biến môi trường) | Mục 4.6 |
| Xác thực | Chỉ "No auth" và "API Key", thêm mục HTTP Headers; không có OAuth2 | Mục 4.6, ảnh `p1-06`, `p1-07` |
| Gọi tool trong chat qua HTTP localhost | Thất bại, báo `fetch failed`; server không nhận lệnh nào, dù nút Test connection vẫn thành công | Mục 4.6, ảnh `p1-11`, `p1-12` |
| Gọi tool trong chat qua stdio | Chạy được cả bảy tool; mỗi lần gọi app mở một tiến trình mới | Mục 4.6 và 7.4 |
| Server biết gì về người gọi | Chỉ tên app `thothan-desktop-mcp-client` 1.0.0; không token, không header người dùng, không `_meta` | Mục 5.3 |
| Khoá riêng người dùng tự đặt | Tới được server: biến môi trường với stdio (thêm qua "Import JSON config"), header `Authorization: Bearer` với kiểu "API Key"; đổi khoá có hiệu lực ngay | Mục 5.5, ảnh `h8-01` đến `h8-03` |
| Duyệt trước khi ghi | Không hỏi ở cả hai chế độ đã thử là Auto Approve và Manual; tool đánh dấu nguy hiểm vẫn chạy ngay. Allow List và Bypass Security chưa thử. | Mục 6.5, ảnh `p3-01` đến `p3-03` |
| Biểu mẫu hỏi người dùng (elicitation) | Không hỗ trợ: app khai báo khả năng rỗng `{}` | Mục 6.5 |
| Link trong kết quả tool | Bấm được, mở trình duyệt mặc định | Mục 6.5, ảnh `p3-05`, `p3-06` |
| Tự gọi lại khi tool lỗi | Không | Mục 7.4 |
| Thời gian chờ | Cắt ở 60 giây với lỗi `-32001 Request timed out`; nút dừng chỉ đổi giao diện, tiến trình vẫn chạy tới mốc 60 giây | Mục 7.4 |
| Dữ liệu có cấu trúc, cờ lỗi | `structuredContent` không hiện; kết quả `isError` vẫn có dấu tích xanh | Mục 8.5 |
| Mã vết, chi phí | Không có `traceparent` hay mã yêu cầu; không có token hay chi phí trong giao thức | Mục 8.5 |

Lần đo chỉ có một tài khoản và một máy, nên kết luận về danh tính có độ tin cậy trung bình.
Lời giải thích cho lỗi `fetch failed` (lời gọi trong chat đi qua máy chủ của Thổ Thần nên không tới được localhost) vẫn là giả thuyết, cần Kevin xác nhận.

**Kết luận:** Thổ Thần chạy được tool của lab ngay hôm nay, nhưng chỉ qua stdio trên máy người dùng.
Host không cho biết ai đang hỏi, không chặn lệnh ghi và cắt mọi lệnh sau 60 giây, nên cả ba việc này thuộc về cổng của lab.
Cổng nhận ra người hỏi bằng khoá riêng mà mỗi người đặt vào cấu hình skill.
Kết luận này chỉ đúng cho hai đường đã thử ở lần đo này: stdio và HTTP tới `localhost`.
Một ngày sau, Lab đo thêm đường HTTPS công khai và thấy kết quả khác về danh tính (mục 3.6).

### 3.6 Phép đo HTTPS công khai (2026-11-17)

Ngày 2026-11-17, Lab đo lần thứ hai: đưa probe ra một địa chỉ HTTPS công khai bằng đường hầm tạm (tunnel, cloudflared), rồi cắm vào Thổ Thần web và Thổ Thần desktop.
Đây là phép đo khác mục 3.5.
Bảng dưới nêu chỗ khác nhau và vì sao hai kết quả không mâu thuẫn.

| Điều so sánh | Mục 3.5 (2026-11-16) | Phép đo HTTPS (2026-11-17) |
| --- | --- | --- |
| Ứng dụng | Thổ Thần desktop | Thổ Thần web và Thổ Thần desktop |
| Cách nối | stdio, và HTTP tới `localhost` | Streamable HTTP tới địa chỉ HTTPS công khai, xác thực kiểu "API Key" (Bearer) |
| Lời gọi trong chat tới server | stdio: tiến trình chạy trên máy người dùng. HTTP `localhost`: không tới được, báo `fetch failed`. | Tới được, qua máy chủ của Thổ Thần (địa chỉ nguồn ở Singapore), cả web lẫn desktop |
| Công cụ gọi | Bảy công cụ, trong đó `whoami` | `whoami` và `fake_write` trong chat; Test connection |
| Header danh tính server nhận | Không có (stdio không có header) | `x-user-id`, `x-user-email`, `x-agent-id`, `x-executor-id` |
| Tên client trong `initialize` | `thothan-desktop-mcp-client` | `lobehub-mcp-client` (desktop qua HTTP) |

Header danh tính là phần mới.
Với stdio, lời gọi không đi qua máy chủ của Thổ Thần nên không có header nào để gắn.
Với HTTP, lời gọi đi qua máy chủ của Thổ Thần, và máy chủ gắn thêm bốn header trên.
Ở lời gọi `whoami` trong chat web, `x-user-id` có dạng `user_` cộng 24 ký tự và `x-executor-id` trùng `x-user-id`.
Ở Test connection chỉ có `x-user-id` và `x-user-email`, không có `x-agent-id` và `x-executor-id`.

Ba điều mà phép đo này không cho biết.

- Máy chủ Thổ Thần ghi đè hay nối thêm header người dùng tự đặt: chưa gửi header giả, nên đây là H9 (ghi đè `x-user-id`) ở mục 9.
- Hai tài khoản có thấy `x-user-id` khác nhau không: chỉ đo một tài khoản, nên đây là H10 (phiên tách theo người dùng).
- Khoá Bearer là của riêng từng người hay dùng chung: chỉ có một tài khoản và một skill, nên chưa kết luận được. Kết luận "khoá riêng từng người tới được server" ở mục 3.5 vẫn đứng, vì nó đo trên stdio và `Authorization` của HTTP localhost.

Bằng chứng và cách chạy lại.

- Probe ghi `log-20261117-171748-473.jsonl`: dòng 139 là `tool_call whoami` từ chat web, dòng 119 là `whoami` từ chat desktop, dòng 158 là `fake_write`.
  Test connection nằm ở `log-20261117-130339-240.jsonl:17`.
- Các log này nằm trong `scratch/mcp-probe/` của máy đo (git-ignored), và không tìm thấy trên máy đo khi kiểm lại ngày 2026-11-17.
  Cái còn lại là bản tóm tắt bảng S1 tới S6 của phiên đo, đã che email; email thật không được chép vào repo.
  Vì vậy độ tin cậy của phép đo này là trung bình: có số dòng log và bản tóm tắt, chưa có log gốc để đối chiếu.
- Chạy lại: mở đường hầm HTTPS tới probe (`node dist/index.js --http --port 8787 --bearer <token tạm> --public-url <địa chỉ đường hầm>`, [kịch bản đo, mục 4.4](tho-than-mcp-probe.md#44-thử-https-từ-xa)), cắm vào Thổ Thần, gọi `whoami`, rồi `npm run summarize -- <file log>` trong `tools/mcp-probe` để đọc các header.

**Kết luận:** hai phép đo bổ sung cho nhau, không mâu thuẫn.
Trên stdio, Thổ Thần không cho server biết ai đang hỏi; trên HTTP công khai, máy chủ Thổ Thần gắn danh tính vào lời gọi.
Danh tính này chỉ dùng được cho cổng sau khi H9 và H10 đúng; trước đó khoá riêng từng người vẫn là cách chính.

### 3.7 Bản dựng mới ngày 2026-11-18: ứng dụng điện thoại và Thổ Thần Bridge

Ngày 2026-11-18, giao diện bản web đổi.
Câu hỏi: nền tảng có đổi không, và thay đổi có chạm tới các kết luận về MCP ở mục 3.5, 3.6 và 6 không.
Cách làm: đọc lại trang công khai bằng curl, so với khảo sát ngày 2026-11-13, đọc trang giới thiệu mới `thothan.ai`, rồi chạy lại script ở mục 12.

Nền tảng không đổi.

| Điều kiểm | Quan sát ngày 2026-11-18 | Nguồn |
| --- | --- | --- |
| Phiên bản LobeHub | `/api/version` trả `{"version":"2.1.56"}`; bundle vẫn chứa `@lobehub/lobehub` 2.1.56. Bản gốc LobeHub cùng ngày đã là 2.3.4. | S24, mục 12 |
| Thời điểm triển khai | 27 trên 28 tệp của trang đăng nhập có `last-modified: Wed, 18 Nov 2026 14:19:59 GMT`; tệp còn lại mang mốc 2026-11-17 10:21 GMT | Header phản hồi, mục 12 |
| Script kiểm chéo | Mọi câu kiểm cũ vẫn PASS, gồm manifest, `robots.txt` và chuyển hướng về `/signin` | Mục 12 |

Số phiên bản giữ nguyên trong khi bản dựng mới, nên Appota đang sửa trên bản tách riêng (fork) của mình, không theo bản gốc lên 2.2 hay 2.3.

Phần đổi là giao diện và các kênh dùng mới.

| Thay đổi | Chi tiết | Nguồn |
| --- | --- | --- |
| Trang đăng nhập mới | Linh vật, video nền `/auth/login-background-loop.mp4`, dải thẻ kỹ năng ("Create presentations", "Recurring reports"...). Dòng bản quyền đổi từ "© 2026 Thổ Thần" sang "© 2026 APPOTA CORP. All rights reserved." | S25, ảnh chụp ngày 2026-11-18 |
| Trang giới thiệu `thothan.ai` | "Trợ lý AI trên điện thoại"; nút "Thử trên web" dẫn về `thothan.appota.ai` | S20 |
| Ứng dụng điện thoại | iOS phát hành thử qua Apple TestFlight; Google Play ghi "Sắp có" | S20 |
| Thổ Thần Bridge | Ứng dụng cho macOS và Windows, bộ cài đặt ngày 2026-11-15. Người dùng quét mã QR từ mục "Thiết bị" trong chat trên điện thoại để ghép máy. Sau đó Thổ Thần tìm và sửa tệp, chạy lệnh, và khi bật điều khiển màn hình thì chụp màn hình, bấm chuột, gõ phím trên máy đó. | S20 |
| Chính sách và điều khoản | Cập nhật ngày 16/11/2026, áp dụng cho iOS, Android, web, Bridge và `thothan.ai`; nhắc tới Google Drive, Apple Health, lịch, danh bạ và gói trả phí | S21, S22 |

Cấu hình công khai của máy chủ (`config.getGlobalConfig`, đọc được mà không đăng nhập) cho thêm ba điều.
Trước ngày này Lab chưa đọc trang cấu hình đó, nên không biết mục nào là mới.

- Có địa chỉ `agentGatewayUrl: https://agent-gateway.appota.ai`; `/health` của địa chỉ đó trả `OK`.
- Tính năng giao việc cho agent (`enableAgentTask`) và Klavis (`enableKlavis`, dịch vụ MCP dựng sẵn) đang bật.
- Mô hình mặc định là `deepseek/deepseek-v4.1-flash` qua nhà cung cấp `takaai`; OpenRouter cũng bật.

Ngày 2026-11-19, Lab xem giao diện bản web mới bằng tài khoản của Lab, chỉ mở menu để đọc, không bật tắt gì và không gửi tin nhắn.

| Chỗ xem | Quan sát ngày 2026-11-19 | So với trước |
| --- | --- | --- |
| Thanh bên | New chat, Library, Artifacts, Assistants, Contacts, Tasks, Departments, Community | Bố cục mới |
| Cài đặt | General, Billing (Subscription, Payment Management, Referral), Agent (Provider, Service Model, Integration, Memory), System; tài khoản Free có 500 credit mỗi kỳ và hạn mức ảnh, âm thanh, video theo tháng | Thêm mục thanh toán và hạn mức |
| Cài đặt > Integration | Khoảng 40 skill dựng sẵn của Appota, các kết nối Lark và Google, hai skill tùy chỉnh của Lab (`lab-gateway`, `mcp-probe-stdio`) vẫn còn | Skill tùy chỉnh cài trước đó không mất |
| Add > "Add Custom MCP Skill" | Streamable HTTP ("Web and desktop compatible") hoặc STDIO ("STDIO only available on desktop"); xác thực "No auth" hoặc "API Key"; HTTP Headers; phải Test connection trước khi cài | Giống mục 3.5 |
| Menu "+" trong ô chat | Attachments, Conversation (Mode: Web search, Deep Research cho gói trả phí, nén ngữ cảnh tự động), Tools (Skills, Integrations, Social accounts), Agent (Devices) | Bố cục mới |
| "+" > Integrations | `lab-gateway` hiện và đang bật cho agent mặc định; `mcp-probe-stdio` hiện nhưng tắt | Skill MCP tùy chỉnh giờ nằm trong Integrations, không nằm trong Skills |
| "+" > Devices | "Pair a computer and choose the device to use in chats. Device permissions still apply."; ô nhập mã ghép từ Thổ Thần Bridge | Mới; bản web cũng ghép được Bridge, không chỉ điện thoại |
| Chế độ duyệt công cụ | Không thấy chữ "Approval", "Auto Approve" hay "Manual" trong trang chat; nút cạnh micro chỉ chọn mức suy luận (Off, Light, Standard, Deep, Maximum) | Mục 3.5 có Auto Approve và Manual trên bản desktop; bản web mới không còn hiện chỗ chọn |

Bảng này chỉ cho thấy chỗ cắm skill MCP của Lab vẫn còn và đang bật.
Nó chưa cho biết lời gọi tool có còn mang bốn header danh tính, còn chạy không hỏi và còn bị cắt ở 60 giây không; phần đó cần một lần gọi thật (H12).

Bridge là bản đóng gói của phần "thiết bị từ xa" đã thấy trong bundle ở mục 3.3 (`builtin-tool-remote-device`, `builtin-tool-device-controller`).
Với Lab, đó là một đường thứ hai để agent của Thổ Thần làm việc ngoài chat: agent chạy lệnh thẳng trên máy người dùng, không qua MCP.
Trang giới thiệu không nhắc tới bước duyệt trước mỗi lệnh; điều khoản ghi người dùng "chịu trách nhiệm chọn đúng tài khoản, thiết bị và phạm vi truy cập".

**Kết luận:** bản dựng ngày 2026-11-18 mở thêm kênh dùng (điện thoại, Bridge) trên cùng nền LobeHub 2.1.56, không đổi nền tảng.
Các kết luận về MCP ở mục 3.5, 3.6 và 6 vẫn đứng về mặt mã, nhưng đã đo trên bản dựng cũ; H12 ở mục 9 kiểm lại chúng trên bản mới.
Bridge củng cố hướng hiện tại: nền tảng mở rộng quyền chạy lệnh nhanh hơn lớp duyệt, nên cổng của Lab vẫn phải tự chặn ghi.

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
Mã có ba dạng xác thực: không xác thực, bearer, và OAuth2.
Form hiện chỉ cho chọn hai dạng đầu; mục 6.2 nói rõ.
Bản desktop của Thổ Thần đo ngày 2026-11-16 cũng chỉ hiện "No auth" và "API Key", không có OAuth2 (mục 3.5).

Bản đang chạy là 2.1.56, tức sau mốc đó.
Trong bundle có tham chiếu `apps/mcp-gateway`, và `mcp-hello-world` chỉ nằm ở `devDependencies`, tức là công cụ kiểm thử của chính monorepo.

Hệ quả có thể dùng được ngay cho lab: nếu instance Thổ Thần web bật phần skill và MCP, thì một MCP server của lab cắm vào được như một skill, và người dùng có thể gọi tool của lab ngay trong giao diện chat của công ty.
Đây chỉ là điều kiện đủ về phía phần mềm.
Lần cắm thử ở mục 3.5 xác nhận bản desktop đã bật phần này, nhưng trong chat chỉ gọi được server stdio.

### 5.3 Sản phẩm thứ hai cũng là MCP host

Trang Marketplace của extension VS Code ghi rõ một trong các tính năng: "Configure models, providers, MCP servers, skills, and project rules".
Nghĩa là cùng một tool của lab có thể được khai báo ở hai nơi khác nhau, bởi hai sản phẩm khác nhau, mà không cần viết lại.
Đây là chất liệu trực tiếp cho tiêu chí "agent thứ hai dùng lại cùng tool" trong phần định nghĩa hoàn thành của Track 01.

## 6. Đọc mã LobeHub 2.1.56: danh tính và duyệt công cụ

### 6.1. Phạm vi đọc

Câu hỏi: LobeHub 2.1.56 có tự gắn danh tính người dùng vào lời gọi MCP trong chat và lời gọi tới nhà cung cấp mô hình không, và có chế độ duyệt công cụ nào bị ẩn không.

Cách làm: tải tarball của tag `v2.1.56`, commit `eddb0c991bb8263928ad304cf9c340a6cadd7e90`, phát hành ngày 2026-05-01, rồi đọc các tệp nêu trong mục này.
Không chạy LobeHub, không đăng nhập, không sửa mã.
Mọi đường dẫn tính từ gốc kho mã nguồn LobeHub.

### 6.2. Lời gọi MCP trong chat: không có danh tính do LobeHub đặt

**Trả lời: không.**
LobeHub 2.1.56 chỉ gửi header do người dùng cấu hình cho skill, cộng thêm khoá xác thực nếu có.
Nó không thêm `x-user-id`, `x-user-email`, `x-agent-id` hay `x-executor-id`.
Trong mã có một header danh tính duy nhất, `X-lobe-user-id`, nhưng chỉ dùng cho đọc văn bản thành tiếng và nghe thành văn bản, không dùng cho MCP (`packages/const/src/fetch.ts:3`, `src/services/_header.ts:19`, `src/hooks/useTTS.ts:41`, `src/features/ChatInput/ActionBar/STT/openai.tsx:47`).

| Câu hỏi | Trả lời | Tệp và dòng |
| --- | --- | --- |
| Header của lời gọi MCP lấy từ đâu? | Từ `params.headers`, tức cấu hình của skill. Sau đó client thêm `Authorization` nếu có bearer hoặc OAuth2 token. | `src/libs/mcp/client.ts:170-201` |
| Chat khác Test connection ở đâu? | Chat gộp thêm `pluginSettings` vào header. Test connection chỉ dùng header của kết nối. Cả hai đều do người dùng đặt. | `src/services/mcp.ts:68-78`, `src/store/tool/slices/mcpStore/action.ts:735-787` |
| Máy chủ LobeHub có thay header bằng danh tính thật không? | Không. Route chỉ chuyển `input.headers` và `input.auth` xuống client MCP. | `src/server/routers/tools/mcp.ts:78-88`, `src/server/services/mcp/index.ts:349-389` |
| Có trường `_meta` mang danh tính trên lời gọi không? | Không. `_meta` chỉ có trong kiểu dữ liệu kết quả. `meta` trong route là dữ liệu báo cáo cho chợ skill, không nằm trong JSON-RPC gửi tới MCP server. | `src/libs/mcp/client.ts:379-386`, `src/libs/mcp/types.ts:36-95`, `src/server/routers/tools/mcp.ts:46-64` |
| Có đăng nhập uỷ quyền OAuth cho MCP không? | Chưa có luồng cho skill tự thêm. Kiểu dữ liệu có `oauth2` và ghi chú "Stage 2 & 3", nhưng form chỉ cho "No auth" và "API Key". | `src/libs/mcp/types.ts:104-134`, `src/features/PluginDevModal/MCPManifestForm/index.tsx:210-239` |
| Người dùng có tự đặt header bất kỳ không? | Có. Mục Advanced Headers nhận cặp khoá-giá trị. Vì vậy `x-user-id` là giá trị người dùng gửi được, trừ khi máy chủ ghi đè. | `src/features/PluginDevModal/MCPManifestForm/index.tsx:240-248` |

Ba kết luận rút ra.

1. Header `x-user-id` thấy trong phép đo HTTPS ngày 2026-11-17 (mục 3.6: Thổ Thần web, đường hầm HTTPS, lời gọi `whoami` trong chat, `log-20261117-171748-473.jsonl:139`) không do LobeHub 2.1.56 sinh ra.
   Phép đo đó cũng thấy `x-user-email`, `x-agent-id` và `x-executor-id`, đúng ba tên mà mã 2.1.56 không gắn.
   Vậy header phải đến từ phần Appota thêm vào, hoặc từ proxy đứng trước, hoặc từ bản chạy khác tag công khai; chưa đọc được mã đó.
   Phép đo ngày 2026-11-16 (mục 3.5) không thấy header nào vì chạy qua stdio, không đi qua máy chủ Thổ Thần.
2. LobeHub không phải nơi bảo đảm header này.
   Nếu Thổ Thần thêm header sau khi đã gộp header người dùng và ghi đè giá trị trùng, thì mới tin được.
   Nếu chỉ nối thêm, người dùng có thể gửi hai giá trị hoặc gửi giá trị giả.
3. Client MCP được nhớ theo tham số kết nối, không theo người dùng (`src/server/services/mcp/index.ts:284-301` và `:331-347`).
   Nếu danh tính được thêm vào tham số, mỗi người có client riêng.
   Nếu danh tính được thêm ở tầng transport dùng chung, phiên có thể bị chia sẻ giữa những người dùng cùng cấu hình.
   Phép đo chưa kiểm trường hợp hai người dùng.

### 6.3. Lời gọi model: có danh tính, nhưng trong body

**Trả lời: có, với phần lớn nhà cung cấp.**
LobeHub gửi mã người dùng nội bộ trong trường `user` của OpenAI-compatible, `safety_identifier` của Responses API, và `metadata.user_id` của Anthropic-compatible.
Giá trị là `userId` thô lấy từ phiên đăng nhập, không băm.

| Đường gọi | Trường gửi đi | Tệp và dòng |
| --- | --- | --- |
| Chat qua webapi | `user` | `src/app/(backend)/webapi/chat/[provider]/route.ts:34-37` |
| Chat qua agent runtime | `user` | `src/server/modules/AgentRuntime/RuntimeExecutors.ts:727-823` |
| OpenAI-compatible | `user` | `packages/model-runtime/src/core/openaiCompatibleFactory/index.ts:483-491` |
| OpenAI Responses | `safety_identifier` | `packages/model-runtime/src/core/openaiCompatibleFactory/index.ts:1097-1119` |
| Anthropic-compatible | `metadata.user_id` | `packages/model-runtime/src/core/anthropicCompatibleFactory/index.ts:492-496` |
| GitHub Copilot dùng Anthropic | `metadata.user_id` | `packages/model-runtime/src/providers/githubCopilot/index.ts:208` |
| Cohere, Mistral, Spark | không gửi, vì `noUserId: true` | `packages/model-runtime/src/providers/cohere/index.ts:39`, `packages/model-runtime/src/providers/mistral/index.ts:39`, `packages/model-runtime/src/providers/spark/index.ts:52` |
| Header trace | chỉ `LOBE_CHAT_TRACE_ID` và `LOBE_CHAT_OBSERVATION_ID`, không có mã người dùng | `src/server/modules/ModelRuntime/trace.ts:46-54` |

Hai hệ quả.

- Đây là mã nội bộ, không phải email, nhưng vẫn là định danh ổn định và nhà cung cấp model thấy được.
  Lab không được giả định lời gọi model là ẩn danh.
- Nếu cắm probe làm nhà cung cấp OpenAI-compatible, probe sẽ thấy trường `user` trong body.
  Đây là cách kiểm lại kết luận này mà không cần đọc mã.

### 6.4. Bốn chế độ duyệt, ba chế độ hiện trên giao diện

**Trả lời: có một chế độ bị ẩn, tên là `headless`.**

| Chế độ | Hiện trên giao diện | Hành vi | Tệp và dòng |
| --- | --- | --- | --- |
| `auto-run` | Có | Chạy mọi tool, trừ tool bị chính sách "always"; tool đó vẫn hỏi. | `packages/agent-runtime/src/agents/GeneralChatAgent.ts:212-222` |
| `allow-list` | Có | Chỉ chạy tool trong danh sách, còn lại hỏi; tool "always" vẫn hỏi. | `packages/agent-runtime/src/agents/GeneralChatAgent.ts:234-242` |
| `manual` | Có | Theo chính sách của từng tool; tool không khai báo thì chạy. | `packages/agent-runtime/src/agents/GeneralChatAgent.ts:244-255` |
| `headless` | Không | Chạy mọi tool, kể cả tool có chính sách "always" riêng; chỉ tool bị blacklist an ninh toàn cục mới bị bỏ qua im lặng. | `packages/agent-runtime/src/agents/GeneralChatAgent.ts:169-178` |

Năm điểm cần đọc kỹ.

- Giao diện chỉ dựng menu cho ba chế độ đầu (`src/features/ChatInput/RuntimeConfig/ApprovalMode.tsx:56-110`).
  Selector còn ghi rõ `headless` không cho người dùng chọn (`src/store/user/slices/settings/selectors/toolIntervention.ts:5-16`).
- Schema API nhận `headless` (`packages/types/src/tool/intervention.ts:124-150`), và route `execAgent` nhận `userInterventionConfig` tuỳ chọn (`src/server/routers/lambda/aiAgent.ts:186-191`).
- Nếu client không gửi cấu hình, `AiAgentService.execAgent` mặc định `headless` (`src/server/services/aiAgent/index.ts:266`).
  Nghĩa là một lời gọi hợp lệ có thể chạy tool mà không hỏi ai.
- Trong `headless`, tool bị blacklist an ninh toàn cục không được hỏi mà bị bỏ qua (`packages/agent-runtime/src/agents/GeneralChatAgent.ts:170-178`).
  Tool có chính sách "always" riêng vẫn chạy, vì nhánh `headless` được kiểm tra trước chính sách của tool.
  `auto-run` thì vẫn hỏi cả hai loại.
- Chế độ `manual` không có nghĩa là mọi tool đều hỏi.
  Nó đọc chính sách `humanIntervention` của tool.
  Tool MCP do LobeHub khám phá chỉ có tên, mô tả và schema, không có trường này (`src/server/services/mcp/index.ts:489-496`).
  Vì vậy `fake_write` chạy ngay trong chế độ Manual, đúng như các phép đo ở mục 3.5 và 3.6.

Kết luận cho Lab: hộp duyệt của LobeHub là tính năng giao diện, không phải ranh giới an ninh.
Cổng của Lab phải tự kiểm danh tính, tự kiểm quyền và tự chặn ghi.

### 6.5. Hệ quả cho ADR-0005

- Khoá riêng từng người vẫn là cách chính.
  LobeHub 2.1.56 không cung cấp danh tính đáng tin cho lời gọi MCP.
- `x-user-id` của Thổ Thần chỉ dùng làm lớp thứ hai khi cả ba điều đúng.
  Một, Thổ Thần ghi đè header người dùng trên mọi lời gọi.
  Hai, cổng của Lab chỉ nhận lời gọi từ Thổ Thần.
  Ba, bảng nối `x-user-id` với mã nhân viên nằm ở phía máy chủ.
- Chưa có điều nào được chứng minh.
  Phép đo HTTPS ngày 2026-11-17 (mục 3.6) chỉ thấy header có mặt trong lời gọi chat, chưa thử gửi header giả và chưa thử hai tài khoản.
- Nếu thiếu một điều, ADR-0005 không được dùng `x-user-id` để cấp quyền.
  Khi đó khoá riêng là cách duy nhất, và cổng phải chặn gọi trực tiếp.
- Việc duyệt ghi cũng không thể giao cho LobeHub.
  Cổng phải giữ đề xuất, kiểm lại nội dung và chỉ ghi sau xác nhận, đúng SR1 (danh tính và một cửa ghi) và SR6 (không ghi trùng).

Hai phép kiểm còn thiếu cho danh tính nằm ở mục 9, H9 và H10; H11 kiểm kênh duyệt.

## 7. Đối chiếu với câu hỏi đang mở trong repo

| Câu hỏi đang mở | Trả lời sau lần khảo sát này | Mức tin cậy |
| --- | --- | --- |
| Trong sáu ô của Thổ Thần AI, ô nào đã chạy thật? | Chắc chắn có ô giao diện chat, agent runtime, skill, công cụ dựng sẵn, và một MCP host. Không xác minh được ô lớn hơn vì không có tài khoản. | Trung bình |
| Tool/MCP Runtime đã có chưa? | Có MCP host ở tầng sản phẩm, và có một MCP server chỉ đọc tài liệu. Chưa thấy runtime MCP cho nghiệp vụ. | Trung bình |
| Duyệt người trước khi ghi nằm ở đâu? | Có ở tầng agent runtime, nhưng không phải ranh giới an ninh. Lần cắm thử thấy tool ghi chạy ngay kể cả ở chế độ Manual (mục 3.5); mã giải thích vì sao: tool MCP không khai báo chính sách duyệt, và chế độ `headless` bị ẩn là mặc định khi thiếu cấu hình (mục 6.4). | Cao |
| Lời gọi MCP trong chat có mang danh tính do LobeHub gắn không? | Không. Chỉ có header cấu hình và khoá xác thực. `x-user-id` thấy trong phép đo HTTPS ngày 2026-11-17 (mục 3.6) không do mã 2.1.56 gắn, nên là phần Appota thêm; chưa chứng minh được ghi đè. | Cao |
| Lời gọi model có mang danh tính người dùng không? | Có, trong body: `user`, `safety_identifier`, hoặc `metadata.user_id`, tuỳ nhà cung cấp. Giá trị là mã người dùng thô. | Cao |
| Có chế độ duyệt công cụ nào bị ẩn không? | Có: `headless`, không hiện trong menu, API nhận, và là mặc định khi thiếu cấu hình. | Cao |
| Telemetry có đủ trường cho Value Intelligence? | Mã có OpenTelemetry, nhưng host không gửi mã vết nào sang server MCP (mục 3.5). Chưa biết phía Thổ Thần lưu gì. | Trung bình |
| Lab đứng độc lập, hay là Tool/MCP Runtime cắm vào Thổ Thần, hay là lớp policy đứng trước runtime? | Chưa chọn. Lựa chọn thứ hai đã chạy được qua stdio (mục 3.5); ADR-0001 sẽ chốt. | - |

Lần cắm thử trả lời được câu duyệt và một phần câu telemetry; mã nguồn LobeHub trả lời ba câu về danh tính và chế độ duyệt.
Câu Tool/MCP Runtime dùng chung và câu telemetry phía nền tảng chỉ trả lời được bằng một buổi hỏi trực tiếp người sở hữu sản phẩm.
Việc còn lại trên instance thật là H1 ở bản web, H7, và H9 tới H11 ở mục 9.

**Kết luận:** lab không chờ nền tảng làm duyệt hay vết; cổng của lab tự làm, và báo Kevin đây là khoảng trống của nền tảng.

## 8. Cảnh báo khi dùng tài liệu này

Bốn điều dễ làm sai, ghi ra để người sau không mắc lại.

1. Không trích dẫn bộ tài liệu ở mục 4 như đặc tả của nền tảng đang chạy.
   Nó mô tả một bản Dify của năm 2024.
2. Không đọc mục 3.3 thành danh sách tính năng đã bật.
   Đó là bằng chứng mã có trong bản triển khai, không phải bằng chứng người dùng thấy được.
3. Không dùng "Thổ Thần" làm từ khoá duy nhất khi tra cứu.
   Tên đó trùng với một IP văn hoá và một sự kiện nội bộ, kết quả sẽ bị nhiễu.
4. Không đọc chế độ "Manual" là mọi công cụ đều hỏi duyệt.
   Tool MCP không có chính sách duyệt, nên chạy ngay; chế độ duyệt của host không phải lớp bảo vệ ghi.

## 9. Câu hỏi mở và giả thuyết kiểm được

Mỗi giả thuyết kèm cách kiểm và người có thể trả lời.

| ID | Giả thuyết | Cách kiểm | Ai trả lời được | Kết quả đến 2026-11-19 |
| --- | --- | --- | --- | --- |
| H1 | Instance `thothan.appota.ai` bật tính năng skill và MCP cho người dùng | Đăng nhập, mở Cài đặt, tìm mục thêm MCP server tùy chỉnh; thử cắm một MCP server cục bộ | Người có tài khoản, Kevin | Đúng ở cả hai bản: cắm được. Desktop 2026-11-16: trong chat chỉ stdio chạy (mục 3.5). Web và desktop 2026-11-17: HTTPS công khai chạy (mục 3.6). |
| H2 | Có một Tool/MCP Runtime dùng chung cho nghiệp vụ, tách khỏi LobeHub | Hỏi trực tiếp; tìm tên miền nội bộ dạng `mcp.*` hoặc `gateway.*` | Kevin | Chưa kiểm. |
| H3 | Duyệt người trước khi ghi chưa tồn tại ở tầng nền tảng | Hỏi trực tiếp; nếu chưa có thì lab được phép đề xuất đặt ở runtime | Kevin | Đúng ở tầng MCP tool: không có bước duyệt, kể cả chế độ Manual (mục 3.5). Mã ở mục 6.4 giải thích: tool MCP không khai báo chính sách duyệt. Cần Kevin xác nhận không có cơ chế khác. |
| H4 | Bộ tài liệu 2024 đã bị bỏ, không còn người cập nhật | Gửi `sendFeedback` qua chính MCP server của tài liệu và xem có phản hồi | Phòng SRD, `srd@appota.com` | Chưa kiểm. |
| H5 | Ngôn ngữ mặc định của instance là tiếng Anh, tiếng Việt chỉ là bản dịch có sẵn | Kiểm sau khi đăng nhập, đổi ngôn ngữ, xem chất lượng bản dịch ở màn hình agent và skill | Người có tài khoản | Một phần: giao diện desktop hiện tiếng Anh; chưa đổi ngôn ngữ. |
| H6 | App mobile AppotaHub nhúng chính trang này qua Capacitor, nên là cùng một phiên đăng nhập | Mở app, kiểm luồng `mobileAuthCallback` | Người có app | Một phần: `thothan.ai` xác nhận app iOS qua TestFlight, và Bridge đăng nhập bằng cùng tài khoản (mục 3.7); chưa cài thử. |
| H7 | Lời gọi tool trong chat qua HTTP đi qua máy chủ Thổ Thần, nên server phải có địa chỉ công khai | Hỏi Kevin; hoặc mở tunnel HTTPS khi được phép rồi gọi lại | Kevin | Đúng: lỗi `fetch failed` ở localhost (mục 3.5), và địa chỉ công khai gọi được từ máy chủ Thổ Thần ở cả web lẫn desktop (mục 3.6). |
| H8 | Khoá riêng của từng người (API Key hoặc biến môi trường stdio) tới được server, nên dùng được để biết ai đang hỏi | Cài lại skill stdio với `LAB_USER_KEY`, gọi `whoami`, xem trường `labEnv` | Người có tài khoản | Đúng: khoá tới server qua biến môi trường stdio và qua `Authorization: Bearer` của kiểu "API Key"; đổi khoá có hiệu lực ngay ([kịch bản đo, mục 5.5](tho-than-mcp-probe.md#55-khoá-riêng-của-từng-người-h8)). |
| H9 | Thổ Thần ghi đè header `x-user-id` người dùng gửi, không nối thêm | Thêm header `x-user-id: spoof-test` vào skill, gọi `whoami`, xem probe nhận giá trị nào; nếu thấy giá trị đánh dấu hoặc hai giá trị thì H9 sai | Người có tài khoản, Kevin | Chưa kiểm. Phép đo HTTPS (mục 3.6) mới thấy header có mặt, chưa gửi header giả. |
| H10 | Phiên MCP tách theo người dùng, không dùng chung cho hai người cùng cấu hình | Hai tài khoản cùng skill URL, so `mcp-session-id` và `x-user-id`; nếu chung phiên hoặc sai người thì H10 sai | Người có hai tài khoản | Chưa kiểm. |
| H11 | Gọi `execAgent` không kèm cấu hình duyệt sẽ chạy tool ghi mà không hỏi | Gọi API với tool ghi giả lập, xem có bản ghi chờ duyệt không; chỉ dùng dữ liệu giả lập | Người có quyền gọi API, Kevin | Chưa kiểm; mã ở mục 6.4 cho thấy mặc định là `headless`. |
| H12 | Bản dựng ngày 2026-11-18 giữ nguyên hành vi MCP đã đo: thêm skill ở cùng chỗ, bốn header danh tính, không hỏi duyệt, cắt ở 60 giây | Đăng nhập bản web mới, tìm chỗ thêm skill MCP, cắm probe qua đường hầm HTTPS, gọi `whoami` và `fake_write`; nếu một trong bốn điểm khác thì H12 sai | Người có tài khoản | Một phần (2026-11-19): chỗ thêm skill MCP giữ nguyên, `lab-gateway` vẫn bật; chỗ chọn chế độ duyệt không còn hiện trên bản web. Header, duyệt và 60 giây chưa gọi thật. |

H1 đã đúng, nên "lab là Tool/MCP Runtime cắm vào Thổ Thần" là một thử nghiệm làm được ngay.

H9 và H10 quyết định ADR-0005 có dùng được `x-user-id` làm lớp kiểm thứ hai hay không; H11 quyết định kênh duyệt.

**Kết luận:** H1, H3 và H8 đã đúng, đủ để viết ADR; H7 là giả thuyết mở quan trọng nhất, vì nó quyết định cổng có chạy được ở máy chủ chung hay chỉ qua stdio trên máy người dùng.

## 10. Giới hạn

- Mục 3.1 đến 3.3 viết khi chưa có tài khoản; lần cắm thử ở mục 3.5 chỉ dùng bản desktop; bản web chỉ thử ở phép đo HTTPS mục 3.6.
- Hai lần đo dùng một tài khoản và một máy; ảnh chụp sản phẩm thật nằm trong `scratch/` của máy đo, không đưa vào repo.
- Chưa kiểm phiên bản Dify mà Appota dùng năm 2024; chỉ khẳng định đường dẫn và câu lệnh trong tài liệu khớp Dify 0.15.3.
- Chưa xác minh quan hệ giữa extension VS Code và nền tảng web; hai bên có thể dùng chung tài khoản hoặc không.
- Chưa đo hiệu năng. Ngưỡng 60 giây ở mục 3.5 là hành vi của host, không phải số đo độ trễ, độ ổn định hay chi phí.
- Con số phiên bản 2.1.56 đọc từ bundle có thể đổi sau mỗi lần triển khai, vì tên file chunk đổi theo bản dựng.
- Mục 3.7 xem giao diện sau đăng nhập bằng một tài khoản Free, chỉ đọc menu; chưa gọi tool trên bản dựng mới, chưa cài ứng dụng iOS và chưa cài Bridge.
- Mục 6 chỉ đọc mã nguồn công khai của LobeHub, không đọc mã Thổ Thần đang chạy.
  Không biết header được thêm ở tầng ứng dụng hay ở proxy, và không biết nó ghi đè hay nối thêm.
- Chưa chạy LobeHub và chưa gọi thử API `execAgent`.
  Kết luận về chế độ ẩn là đọc mã, chưa đo trên instance.
- Tag `v2.1.56` phát hành ngày 2026-05-01.
  Số 2.1.56 đọc từ bundle khớp tag, nhưng không chứng minh bản chạy giống hệt mã công khai.
- Log gốc của phép đo HTTPS (mục 3.6) không tìm thấy trên máy đo; chỉ còn bản tóm tắt phiên đo.
- Chưa kiểm hai người dùng cùng lúc, nên chưa biết phiên MCP có tách theo người hay không.
- Chưa gọi thử nhà cung cấp model thật.
  Chỉ đọc đường mã; một số provider có thể bỏ trường `user` hoặc từ chối trường đó.

## 11. Sổ nguồn

Cột "khớp" là `có` khi script ở mục 12 mở lại URL (S1 tới S19 ngày 2026-11-17, S20 tới S25 ngày 2026-11-18) và so khớp nguyên văn câu trích dùng trong file này.

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
| S19 | LobeHub 2.1.56, mã nguồn | Mã nguồn | https://github.com/lobehub/lobehub/tree/v2.1.56 | 2026-05-01, commit `eddb0c9` | có, 29 câu kiểm L1-L29 | 6 |
| S20 | Thổ Thần, trang giới thiệu | Trang sản phẩm | https://thothan.ai/ | không hiển thị ngày | có | 2, 3.7 |
| S21 | Thổ Thần, chính sách quyền riêng tư | Văn bản pháp lý | https://thothan.ai/privacy.html | 2026-11-16 | có | 3.7 |
| S22 | Thổ Thần, điều khoản sử dụng | Văn bản pháp lý | https://thothan.ai/terms.html | 2026-11-16 | có | 3.7 |
| S23 | Thổ Thần, cấu hình công khai của máy chủ | Quan sát trực tiếp | https://thothan.appota.ai/trpc/lambda/config.getGlobalConfig | 2026-11-18 | có | 3.7 |
| S24 | Thổ Thần, phiên bản máy chủ | Quan sát trực tiếp | https://thothan.appota.ai/api/version | 2026-11-18 | có | 3.7 |
| S25 | Thổ Thần, video nền trang đăng nhập | Quan sát trực tiếp | https://thothan.appota.ai/auth/login-background-loop.mp4 | 2026-11-18 | có | 3.7 |

Ghi chú S16 tới S18: ba nguồn này chỉ dùng cho dòng 4 của bảng ở mục 2, tức phần nhận dạng tên, không dùng cho bất kỳ khẳng định kỹ thuật nào.
Chúng không nằm trong script vì hai trang LinkedIn và báo dễ chặn truy cập tự động.

Ghi chú S19: mục 6 đọc từng tệp con của tag này.
Script mở lại từng tệp bằng địa chỉ `https://raw.githubusercontent.com/lobehub/lobehub/v2.1.56/<đường dẫn>`, không tải cả cây.

Ghi chú về S12: endpoint MCP không phải tệp tĩnh, phải gửi POST đúng định dạng JSON-RPC mới trả lời.
GET vào cùng đường dẫn trả 405, nên một lần kiểm bằng trình duyệt sẽ cho kết quả sai.

## 12. Chạy lại

Kiểm chéo tự động:

```bash
bash rd/checks/tho-than-platform.sh
```

Kết quả ngày 2026-11-17: 50 PASS, 0 MISS, 0 BLOCKED, mã thoát 0.
Kết quả ngày 2026-11-18, sau khi thêm S20 tới S25: 66 PASS, 0 MISS, 0 BLOCKED, mã thoát 0.

Đọc phiên bản và thời điểm triển khai của bản dựng đang chạy (mục 3.7):

```bash
curl -s https://thothan.appota.ai/api/version
curl -sI "https://thothan.appota.ai$(curl -s https://thothan.appota.ai/signin | grep -o '/_next/static/chunks/[a-zA-Z0-9_.-]*\.js' | head -1)" | grep -i last-modified
```

Kiểm lại tag và commit của LobeHub 2.1.56:

```bash
git ls-remote https://github.com/lobehub/lobehub 'refs/tags/v2.1.56*'
```

Kết quả ngày 2026-11-17: tag object `b9cd900b2c2510c2a248ea105c02254b2ec98431`, commit `eddb0c991bb8263928ad304cf9c340a6cadd7e90`.

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
