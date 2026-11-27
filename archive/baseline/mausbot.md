# MausBot

Ngày: 2026-11-21. Trạng thái: đọc tài liệu, mã nguồn và báo chí về MausBot và eve; chưa chạy thử cả hai trong môi trường của công ty.

## Đọc nhanh

- MausBot là ứng dụng miễn phí, mã nguồn mở, cho mỗi nhân viên một nhóm "nhân viên AI" tự làm việc lặp lại theo lịch.
- Tích hợp ở đây là cho nhân viên dùng MausBot với tài khoản, kênh chat Lark, dữ liệu, mô hình AI và luật của công ty. Việc này gồm bảy lớp.
- Bốn lớp nối được ngay bằng cấu hình: mô hình AI, hạ tầng, dữ liệu nội bộ, phân phối bot. Ba lớp phải tự làm hoặc chờ nhà làm: chat trong Lark, đăng nhập bằng tài khoản công ty, và kiểm quyền, duyệt khi bot ghi vào hệ thống nội bộ.
- MausBot có vài điểm bảo mật phải xử lý trước, nổi bật là bot được toàn quyền ngay từ đầu và ứng dụng tự cập nhật.
- Đề xuất: kiểm bảo mật trước, thử với 3 đến 5 người trên dữ liệu được phép, rồi mới nối hệ thống nội bộ.

## MausBot là gì

MausBot là ứng dụng chat trên máy tính, điện thoại và máy chủ tự cài. Mỗi "bot" giữ một việc, có chỉ dẫn, bộ nhớ, lịch chạy, máy tính và trình duyệt riêng. Bot tự làm theo lịch hoặc khi có sự kiện, và nhiều bot phối hợp được với nhau.

| Điều | Nội dung |
|-|-|
| Ai làm | Supamaus Software Private Limited (Ấn Độ). Kho mã OpenMausBot tạo ngày 2026-08-11; ngày 2026-11-20 có khoảng 26 nghìn sao, 1.161 issue đang mở. |
| Bộ não AI | Không có mô hình riêng. Bot chạy bằng Claude Code, Codex, Grok, Cursor, OpenCode... hoặc khoá API; tiền AI trả riêng cho nhà cung cấp. |
| Giấy phép | Phần lõi Apache 2.0, dùng và sửa tự do. Thư mục enterprise (trang quản trị, trần chi tiêu cả công ty, đăng nhập công ty) cần khoá bản quyền. |
| Giá | Tự cài bản mã mở: miễn phí. Business tự cài: 299 USD/tháng cho 20 người. Bản trên mây của nhà làm: 15 tới 99 USD/tháng mỗi người. Giá đọc ngày 2026-11-20. |

**Kết luận:** MausBot là nơi nhân viên giao việc cho AI. Nó không giữ dữ liệu nghiệp vụ, nên giá trị phụ thuộc vào việc nối được tới hệ thống của công ty.

## Tích hợp nghĩa là gì

Tích hợp là để nhân viên dùng MausBot như một công cụ của công ty: đăng nhập bằng tài khoản công ty, gọi bot trong Lark, bot đọc và ghi dữ liệu nội bộ, chạy bằng mô hình AI công ty trả tiền, và tuân theo luật của công ty. Có ba mức, mức sau gồm mức trước.

| Mức | Nhân viên thấy gì | Lớp phải nối | Rủi ro |
|-|-|-|-|
| 1. Dùng riêng | App MausBot trên máy chủ công ty; bot làm việc trên dữ liệu công khai, như theo dõi trang giá của đối thủ. | Mô hình AI (4), hạ tầng (6) | Thấp |
| 2. Nối dữ liệu | Bot đọc danh bạ, danh sách task, Lark Base; đề xuất chuyển task T-12 cho anh Minh và chỉ ghi khi người có quyền duyệt. | Thêm dữ liệu nội bộ (3), quản trị (5) | Trung bình |
| 3. Nằm trong Lark | Nhân viên nhắn bot ngay trong chat Lark, đăng nhập bằng tài khoản công ty. | Thêm đăng nhập (1), kênh chat (2), phân phối (7) | Cao |

**Kết luận:** mức 1 và mức 2 làm được với MausBot hôm nay. Mức 3 phụ thuộc vào phần công ty phải tự viết và phần nhà làm chưa giao.

## Bảy lớp tích hợp

Cột "Có sẵn" đọc từ tài liệu trong mã nguồn (commit d01c7be), chưa chạy thử.

| Lớp | MausBot có sẵn | Chỗ thiếu | Cách nối | Đánh giá |
|-|-|-|-|-|
| 1. Đăng nhập | Máy chủ tự cài cho đăng nhập bằng mã email, theo danh sách hoặc cả tên miền; gửi mã qua máy chủ thư của công ty được. Vai trò Admin và Member. | Chưa có đăng nhập một lần (SSO): "planned: nothing checks it yet". Không đăng nhập bằng Lark. | Giới hạn theo tên miền công ty, gửi mã qua thư công ty; chờ SSO. | Chờ nhà làm |
| 2. Kênh chat | App máy tính, app điện thoại. Slack chỉ chạy qua dịch vụ Admin của nhà làm; máy chủ tự cài trả lỗi 404 cho mọi đường Slack. | Không có Lark. | Tự viết cầu nối Lark ([mục Lark làm kênh chat](#lark-làm-kênh-chat)). | Tự làm |
| 3. Dữ liệu nội bộ | Server MCP (chuẩn chung để AI gọi công cụ) qua stdio và HTTP; danh sách server được duyệt; khoá "từng người" trên máy chủ nhóm; Composio cho Gmail, Slack, HubSpot; trình duyệt tự đăng nhập. | Server không biết chắc ai đang gọi: "never proof of who called". Không có công cụ Lark dựng sẵn. | Mọi hệ thống nội bộ đi qua một cổng kiểm soát; mỗi nhân viên một khoá riêng; Lark nối qua server MCP chính thức của Lark ([mục Lark làm kênh chat](#lark-làm-kênh-chat)). | Cấu hình và một cổng |
| 4. Mô hình AI | Một khoá API chung cho cả máy chủ, hoặc mọi cổng theo chuẩn OpenAI; sổ chi phí theo bot và mô hình. | Codex luôn đòi tài khoản ChatGPT cá nhân. | Trỏ mọi bot tới khoá hoặc cổng mô hình của công ty; cấm tài khoản AI cá nhân. | Sẵn |
| 5. Quản trị | Năm mức duyệt, trần chi tiêu theo bot, nhật ký Activity cho thao tác quản trị, trang People có chi phí từng người. | Mặc định Toàn quyền; chưa ép được mức duyệt cho cả công ty; người bấm duyệt là người ngồi trước máy, không phải người có thẩm quyền. | Luật gốc đặt ở cổng kiểm soát; quy định mức "Hỏi" cho mọi bot có công cụ ghi. | Cấu hình và một cổng |
| 6. Hạ tầng | Docker, Kubernetes, bộ cài một lệnh cho Ubuntu; nhiều workspace tách biệt trên một máy; sao lưu thư mục dữ liệu. | Dịch vụ trung gian của nhà làm và analytics bật sẵn; bot đọc được tệp chứa khoá. | Tự cài trên hạ tầng công ty; tắt dịch vụ trung gian; OMB_LOOPBACK_TRUST=service. | Sẵn |
| 7. Phân phối bot | Gói mẫu cả nhóm bot trong một tệp Markdown; skill theo chuẩn SKILL.md; thư viện tổ chức. | Thư viện tổ chức cần dịch vụ Admin của nhà làm, dịch vụ này không có trong mã mở. | Kho gói nội bộ trên Git hoặc Lark Drive, cài bằng tay hoặc bằng dòng lệnh. | Sẵn |

**Kết luận:** lớp 4, 6, 7 nối được bằng cấu hình. Lớp 3 và 5 cần thêm một cổng kiểm soát đứng trước hệ thống nội bộ. Lớp 1 và 2 là hai khoảng trống thật.

## Ba khoảng trống và cách lấp

### Lark làm kênh chat

- MausBot không hỗ trợ Lark. Kênh chat công ty duy nhất là Slack, và chỉ chạy qua dịch vụ Admin của nhà làm.
- Ở Slack, dịch vụ Admin mở một phiên riêng cho đúng người gửi, nên bot làm việc với quyền của người đó. Cầu nối Lark phải làm được điều tương tự.
- Hai đường vào có sẵn để cầu nối dùng: dòng lệnh điều khiển máy chủ (headless CLI) và Bot API. Lời gọi qua Bot API thì bot không có công cụ nào: "no shell, computer, browser, phone, connected apps, MCP servers or data tools".
- Vì vậy cầu nối phải gắn mỗi người gửi Lark với một phiên MausBot của đúng người đó. Tài liệu chưa nói cách làm việc này trên máy chủ tự cài.

**Kết luận:** chat trong Lark là việc tự viết, độ khó chưa rõ. Cần chạy thử trước khi hứa mức 3.

### Đăng nhập bằng tài khoản công ty

- Đăng nhập một lần qua nhà cung cấp danh tính (OIDC) nằm trong phần enterprise và mới là kế hoạch; bản Business ghi "coming soon".
- Tạm thời, máy chủ tự cài cho đăng nhập bằng mã gửi qua email, giới hạn theo tên miền công ty; nghỉ việc thì xoá khỏi danh sách bằng tay.

**Kết luận:** đủ cho giai đoạn thử; dùng rộng thì cần nhà làm cam kết ngày giao SSO.

### Kiểm quyền và duyệt khi bot ghi vào hệ thống nội bộ

- MausBot gửi kèm tên bot, nhưng đó "never proof of who called". Máy chủ nhóm mặc định dùng một khoá chung cho cả nhóm, và việc chạy theo lịch "act for nobody".
- Thẻ duyệt của MausBot hỏi người ngồi trước máy, không hỏi người có thẩm quyền như trưởng nhóm.
- Lark có server MCP chính thức (gói @larksuiteoapi/lark-mcp, bản 0.5.1, còn beta, cập nhật lần cuối ngày 2025-08-12). Nó chạy bằng danh tính ứng dụng hoặc danh tính từng người qua đăng nhập ủy quyền (OAuth).
- Cách lấp: một cổng kiểm soát đứng trước mọi hệ thống nội bộ. Cổng đổi khoá thành người, kiểm quyền, giữ đề xuất chờ người có thẩm quyền duyệt, chống ghi trùng và ghi vết. Việc chạy theo lịch dùng một danh tính dịch vụ có quyền hẹp.

**Kết luận:** đây là khoảng trống quan trọng nhất của mức 2. Nó không phụ thuộc nhà làm: công ty tự dựng cổng, và cổng dùng lại được cho mọi công cụ AI khác.

## Vấn đề của MausBot ảnh hưởng tích hợp

Nguồn chính là issue #4716 trên GitHub. Một nhóm đánh giá MausBot để dùng trên máy có dữ liệu kinh doanh nhạy cảm, bằng cách đọc mã, không chạy ứng dụng. Họ "found no evidence of a backdoor, hidden destination or malicious code", nhưng công ty chưa thể giới hạn dữ liệu chỉ đi tới dịch vụ đã duyệt. Ngày 2026-11-21 issue vẫn mở, nhà làm chưa trả lời.

| Vấn đề | Chi tiết | Chặn lớp | Xử lý |
|-|-|-|-|
| Toàn quyền mặc định, không cách ly | Bot đọc email hay trang web có câu lệnh cài cắm (prompt injection) có thể đọc khoá trên máy và gửi ra ngoài. | 5 | Đặt mức Hỏi từng bot; chưa ép chung được |
| Dữ liệu ứng dụng kết nối đi qua dịch vụ của nhà làm | Mặc định, lời gọi Gmail, Drive, Slack đi qua một dịch vụ trên tên miền cá nhân của nhà làm, dùng một khoá chung cho mọi người dùng. | 3, 6 | Khoá Composio riêng hoặc OMB_COMPOSIO_BROKER=off |
| Tự cập nhật, không ghim phiên bản | Bản desktop tự tải và cài bản mới mỗi giờ; bản Windows không kiểm chữ ký. | 6 | Dùng máy chủ tự cài; máy chủ không tự cập nhật |
| Bản trên mây của nhà làm | Tự cho mượn thư mục nhà và chép tệp .env; Admin của nhà làm mở được phiên quản trị mà khách không duyệt. | 6 | Không dùng bản trên mây |
| Máy chủ dùng chung | Người được chat với bot có thể mượn bot chạy ở mức Toàn quyền; bot đọc được tệp cấu hình chứa khoá. | 1, 6 | OMB_LOOPBACK_TRUST=service; khoá quan trọng để ở cổng, không để trên máy chủ |
| Analytics bật sẵn | Số liệu dùng gửi đi trước khi người dùng chọn; tổ chức không tắt chung được. | 6 | Chặn ở tường lửa, kiểm bằng phép đo mạng |
| Đổi rất nhanh | Ba tháng tuổi, khoảng 200 commit mỗi ngày, năm bản phát hành trong ba ngày 17 đến 19/11; phần lớn mã do một người viết. | Mọi lớp | Ghim phiên bản, nâng cấp mỗi tháng có kiểm thử |

**Kết luận:** tự cài máy chủ và tắt dịch vụ trung gian xử lý được phần lớn vấn đề. Hai điểm còn lại phải chờ nhà làm: ép mức duyệt cho cả công ty và SSO.

## Thị trường cho thấy giá trị ở đâu

MausBot chưa có doanh nghiệp nào công bố kết quả. Grok Bot của xAI, sản phẩm MausBot tự nhận là bản thay thế mở, đã có số liệu ở đúng mức 2 (bot nối dữ liệu nội bộ). Số liệu do xAI hoặc khách của xAI công bố, chưa ai kiểm độc lập.

| Bộ phận | Bot làm gì | Kết quả công bố | Người vẫn phải làm |
|-|-|-|-|
| Kế toán (nội bộ xAI) | Năm bot: mở tài khoản, xuất hóa đơn, hỗ trợ thanh toán, đối soát, thu nợ. | Hóa đơn từ khoảng 24 giờ xuống vài phút; đối soát từ 3-4 giờ xuống khoảng 30 phút. | Hoàn tiền cần người có thẩm quyền duyệt. |
| Hỗ trợ khách (nội bộ xAI) | Trả lời phiếu hỗ trợ. | Lượng phiếu tăng 175% không tuyển thêm; 0,20-0,30 USD mỗi phiếu. | Ban đầu mọi lệnh ghi phải duyệt. |
| Kinh doanh (nội bộ xAI) | Nghiên cứu khách qua đêm, soạn thư, báo giá. | Không công bố số. | Nhân viên không tự duyệt chiết khấu của mình được. |
| Bảo hiểm (Harper) | Bot dùng chung xử lý hợp đồng bảo hiểm. | Dựng trong 24 giờ, tiết kiệm cho khách hơn 120.000 USD (lời CEO Harper). | Không nêu. |

Sản phẩm cùng loại OpenClaw cho thấy mặt trái: một skill độc âm thầm gửi dữ liệu ra ngoài (Cisco, 28/1/2026), và bản 2.0 tắt sẵn cách ly và bước duyệt (The Register, 31/8/2026).

**Kết luận:** giá trị đến từ việc lặp lại có quy trình, nối vào dữ liệu nội bộ, với người có thẩm quyền duyệt ở điểm rủi ro. Đó đúng là mức 2 cộng cổng kiểm soát; dừng ở mức 1 thì giá trị thấp.

## Lộ trình

| Giai đoạn | Làm gì | Đi tiếp khi |
|-|-|-|
| 0. Kiểm bảo mật | Cài máy chủ trong máy ảo cô lập, dữ liệu giả; tắt dịch vụ trung gian; ghi lại toàn bộ kết nối mạng; gửi email chứa câu lệnh cài cắm cho bot. | Chỉ còn kết nối tới địa chỉ đã duyệt; ở mức Hỏi, bot không làm gì ra ngoài khi chưa duyệt. |
| 1. Mức 1 | 3 đến 5 người, 2 việc trên dữ liệu công khai; đo thời gian tiết kiệm, số lần phải sửa, chi phí AI mỗi việc. | Tiết kiệm trên 50% thời gian, dưới 10% kết quả phải sửa. |
| 2. Mức 2 | Nối danh bạ, danh sách task giả lập và một bảng Lark Base thử qua cổng kiểm soát; hai người dùng chung một bot. | Mỗi lệnh gắn đúng người; không lệnh ghi nào chạy khi chưa duyệt; gửi lại không ghi hai lần. |
| 3. Thử cầu nối Lark | Bot Lark nhận tin trong một nhóm thử, chuyển vào MausBot, trả lời lại. | Giữ đúng người gửi; độ trễ chấp nhận được. Khi đó mới quyết mức 3. |

**Kết luận:** hết giai đoạn 3 là có đủ số liệu để quyết dùng rộng hay dừng. Mỗi giai đoạn có điểm dừng, nên dừng sớm không tốn thêm.

## Nguồn

- [MausBot: trang chủ](https://mausbot.com/)
- [MausBot: bảng giá](https://mausbot.com/pricing)
- [OpenMausBot issue #4716: Security and Privacy Issues](https://github.com/milind-soni/OpenMausBot/issues/4716)
- [OpenMausBot: Self-hosting](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/self-hosting.md)
- [OpenMausBot: Slack for Team Clouds](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/team-slack.md)
- [OpenMausBot: Bot API](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/bot-api.md)
- [OpenMausBot: Run from scripts and CI](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/headless-cli.md)
- [OpenMausBot: Custom MCP servers](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/custom-mcp-servers.md)
- [OpenMausBot: Bring your own engine](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/custom-engines.md)
- [OpenMausBot: Composio](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/composio.md)
- [OpenMausBot: Approval levels](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/approval-levels.md)
- [OpenMausBot: Team Cloud](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/team-cloud.md)
- [OpenMausBot: Organization library](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/docs/org-library.md)
- [OpenMausBot: Enterprise features](https://github.com/milind-soni/OpenMausBot/blob/d01c7be498bfe7ee3c0963b169fb63fe531b1425/enterprise/FEATURES)
- [Lark: lark-openapi-mcp](https://github.com/larksuite/lark-openapi-mcp)
- [xAI: Grok Bot for Enterprise](https://x.ai/news/grok-bot-for-enterprise)
- [TeslaNorth: Grok Bots handling the books](https://teslanorth.com/2026/11/18/grok-bot-accounting-team-spacexsi/)
- [Zappiq: Grok Bot use cases](https://zappiqai.com/blog/grok-bot-use-cases)
- [CellCog: Grok Team Bots](https://cellcog.ai/blog/grok-team-bots/)
- [Cisco: Personal AI agents like OpenClaw](https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare)
- [The Register: OpenClaw 2.0 security](https://www.theregister.com/ai-and-ml/2026/08/31/openclaw-20-pours-glitter-on-slow-burning-security-dumpster-fire/5293492)
