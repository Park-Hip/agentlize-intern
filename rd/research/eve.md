# eve

Ngày: 2026-11-21. Trạng thái: đọc tài liệu, mã nguồn và báo chí về MausBot và eve; chưa chạy thử cả hai trong môi trường của công ty.

## Đọc nhanh

- eve là bộ khung mã nguồn mở, miễn phí của Vercel để đội lập trình dựng trợ lý AI riêng cho công ty. Nhân viên không cài gì; họ nhắn trợ lý ngay trong nhóm chat.
- So với MausBot, trợ lý dựng bằng eve vào được Lark, biết ai đang nhắn qua tài khoản Lark, và chờ người duyệt nhiều ngày mà không mất việc đang làm.
- Đổi lại, công ty phải có một đội viết và giữ mã. Phần kiểm quyền và duyệt khi trợ lý ghi vào hệ thống nội bộ vẫn phải tự dựng, giống MausBot.
- eve mới ra bản chính thức ngày 17/11/2026 và đổi rất nhanh. Mẫu kết nối Lark hiện có lỗi: trợ lý nhận được tin nhưng không trả lời được, phải sửa trước khi dùng.
- Đề xuất: thử một trợ lý chỉ đọc trong một nhóm Lark thử với dữ liệu giả, rồi mới cho ghi qua bước duyệt. Song song, hỏi Lark về aily, nền tảng dựng trợ lý không cần viết mã của Lark, trước khi quyết tự dựng.

## eve là gì

eve là bộ khung để viết trợ lý AI bằng TypeScript. Nó lo sẵn vòng gọi mô hình AI, gọi công cụ, giao việc cho trợ lý con, kênh chat, bộ nhớ, lịch chạy và ghi vết. Đội lập trình viết phần riêng của công ty: trợ lý làm việc gì, được gọi công cụ nào, đặt ở kênh nào.

| Điều | Nội dung |
|-|-|
| Ai làm | Vercel, công ty làm Next.js và nền tảng chạy web. Kho mã vercel/eve tạo ngày 2026-06-16; ngày 2026-11-21 có khoảng 6 nghìn sao, 439 issue và 537 yêu cầu sửa mã đang mở. |
| Giấy phép | Apache 2.0 cho toàn bộ kho, dùng và sửa tự do. Không có phần nào khoá bản quyền. |
| Phát hành | Bản thử công khai từ tháng 6/2026, hơn 230 bản phát hành. Bản 1.0 ngày 17/11/2026; bản 1.3.0 ngày 20/11/2026. |
| Bộ não AI | Không có mô hình riêng. Gọi qua cổng mô hình của Vercel (AI Gateway) hoặc thẳng tới nhà cung cấp; tiền AI trả riêng. |
| Giá | Bộ khung miễn phí. Chạy trên Vercel thì trả theo dịch vụ Vercel dùng tới; bài công bố không có bảng giá riêng cho eve. Tự cài thì chỉ tốn máy chủ và tiền AI. |
| Chạy ở đâu | Trên Vercel, hoặc tự cài như một dịch vụ Node 24 trở lên. Một máy thì lưu phiên vào SQLite; nhiều máy thì lưu vào PostgreSQL. |

**Kết luận:** eve không phải ứng dụng để nhân viên cài, mà là vật liệu để công ty dựng trợ lý của riêng mình. Chi phí chính là người viết và giữ mã, không phải tiền bản quyền.

## Tích hợp nghĩa là gì

Tích hợp eve là công ty tự dựng một hoặc vài trợ lý, đặt trong Lark, nối hệ thống nội bộ, chạy bằng mô hình AI công ty trả tiền, cài trên máy chủ công ty và tuân theo luật của công ty. Khác MausBot, Lark là điểm bắt đầu chứ không phải bước cuối. Có ba mức, mức sau gồm mức trước.

| Mức | Nhân viên thấy gì | Lớp phải nối | Rủi ro |
|-|-|-|-|
| 1. Hỏi đáp trong Lark | Nhắn trợ lý trong một nhóm Lark; trợ lý trả lời từ tài liệu được phép, như quy trình nghỉ phép. | Đăng nhập (1), kênh chat (2), mô hình AI (4), hạ tầng (6) | Thấp |
| 2. Đọc dữ liệu theo quyền | Chị Hoa hỏi "task nào của phòng đang quá hạn"; trợ lý chỉ trả phần chị Hoa được xem. | Thêm dữ liệu nội bộ (3), quản trị (5) | Trung bình |
| 3. Ghi có duyệt | Chị Hoa gõ "chuyển T-12 cho anh Minh"; trợ lý soạn đề xuất, người có thẩm quyền duyệt rồi mới ghi. Sáng thứ Hai trợ lý tự gửi danh sách task quá hạn. | Thêm phân phối (7); luật duyệt và danh tính dịch vụ ở quản trị (5) | Cao |

**Kết luận:** mức 1 làm được ngay khi sửa xong kết nối Lark. Mức 2 và mức 3 cần cổng kiểm soát đứng trước hệ thống nội bộ, cùng loại cổng mà MausBot cần.

## Bảy lớp tích hợp

Dùng cùng bảy lớp với phần MausBot để so trên một thước đo. Cột "Có sẵn" đọc từ tài liệu trong mã nguồn (commit 08034cd) và các issue trên GitHub, chưa chạy thử.

| Lớp | eve có sẵn | Chỗ thiếu | Cách nối | Đánh giá |
|-|-|-|-|-|
| 1. Đăng nhập | Kênh chat nhận người nhắn từ chữ ký đã kiểm của nền tảng, không tin tên người ghi trong nội dung tin nhắn. Nhân viên dùng luôn tài khoản Lark. | Không có trang quản lý người dùng riêng; nghỉ việc thì phụ thuộc việc khoá tài khoản Lark. | Dựa vào tài khoản Lark của công ty; giới hạn người thấy bot bằng phạm vi ứng dụng Lark. | Sẵn qua Lark |
| 2. Kênh chat | Slack, Teams, Discord, Telegram, web chat có sẵn. Lark đi qua bộ nối chính thức của Lark (@larksuite/vercel-chat-adapter 0.3.0, MIT): nhận tin qua kết nối dài nên không cần địa chỉ công khai; nút bấm hiện thành thẻ Lark. | Mẫu kết nối Lark không gửi được câu trả lời (issue #1753, mở từ 2026-08-07). Thẻ Lark chưa có biểu mẫu nhập liệu. | Đội lập trình sửa đường gửi trả lời ([mục Sửa kết nối Lark](#sửa-kết-nối-lark)). | Phải sửa |
| 3. Dữ liệu nội bộ | Ba cách nối: server MCP (chuẩn chung để AI gọi công cụ), API mô tả bằng OpenAPI, công cụ tự viết. Khoá chọn được theo từng người hỏi; khoá nằm phía máy chủ, không tới mô hình. | Kết quả công cụ tới mô hình nguyên văn, không có bước lọc. Mỗi lời gọi MCP tốn sáu yêu cầu mạng (issue #2432). | Mọi hệ thống nội bộ đi qua một cổng kiểm soát; cổng che trường trước khi trả. Lark nối qua server MCP chính thức của Lark. | Cấu hình và một cổng |
| 4. Mô hình AI | Cổng mô hình của Vercel hoặc gọi thẳng nhà cung cấp; đổi mô hình bằng cấu hình. | Không có trần chi tiêu dựng sẵn. | Dùng khoá hoặc cổng mô hình của công ty; đặt trần ở phía nhà cung cấp. | Sẵn |
| 5. Quản trị | Mỗi công cụ chọn mức hỏi: không hỏi, hỏi lần đầu, hỏi mọi lần, để một mô hình nhỏ quyết, hoặc luật tự viết. Ghi vết theo chuẩn OpenTelemetry; hội thoại riêng chỉ gửi siêu dữ liệu. | "Approval is consent only": bấm duyệt không đổi quyền. Mặc định chỉ người yêu cầu được bấm, không phải trưởng nhóm. Chưa có vết kiểm toán an ninh (issue #6645). Không có trang quản trị. | Luật gốc, bước duyệt và vết đặt ở cổng kiểm soát. | Cấu hình và một cổng |
| 6. Hạ tầng | Dịch vụ Node cộng PostgreSQL và Docker; mỗi phiên là quy trình bền, sập rồi chạy tiếp từ bước đã xong. | Đăng nhập kết nối qua Vercel Connect, máy ảo cách ly và trang xem lượt chạy chỉ có trên Vercel. Có lỗi mở khi tự cài ([mục Vấn đề của eve ảnh hưởng tích hợp](#vấn-đề-của-eve-ảnh-hưởng-tích-hợp)). | Tự cài trên hạ tầng công ty; ghim phiên bản; kiểm sập và nâng cấp trước khi dùng thật. | Sẵn, phải kiểm |
| 7. Phân phối | Một trợ lý chung; nhân viên thêm bot vào nhóm Lark là dùng, không cài gì. | Thêm việc mới là sửa mã và triển khai lại; người không biết lập trình không tự thêm được. | Mỗi việc mới đi qua đội giữ mã, có kiểm thử trước khi triển khai. | Sẵn |

**Kết luận:** lớp 1, 4, 7 có sẵn; lớp 6 có sẵn nhưng phải kiểm. Lớp 3 và 5 cần cổng kiểm soát như MausBot. Lớp 2 là khoảng trống duy nhất thuộc về eve, và nhỏ hơn nhiều so với MausBot vì đã có bộ nối do Lark làm.

## Nhân viên dùng thế nào

Ví dụ lấy từ phòng Vận hành giả lập, với danh bạ nhân viên và danh sách task giả.

| Cách dùng | Ví dụ | Cần gì | Ai đồng ý |
|-|-|-|-|
| Hỏi trợ lý trong nhóm chat | Trong nhóm Lark của phòng, chị Hoa gõ "@Trợ lý chuyển T-12 cho anh Minh"; trợ lý trả đề xuất và link duyệt ngay trong nhóm. | Một ứng dụng Lark tự dựng do quản trị Lark cấp; quyền đọc tin và nhận bấm thẻ; một khoá mô hình. | Quản trị Lark |
| Nhắc việc theo lịch | Sáng thứ Hai, trợ lý gửi vào nhóm danh sách task quá hạn của phòng. | Như trên, cộng một danh tính dịch vụ có quyền hẹp, vì việc chạy theo lịch không có người hỏi. | Chủ dữ liệu task |
| Nghe trong kênh và tự đề xuất | Trợ lý đọc tin trong nhóm được chọn; thấy ai đó nhờ việc thì đề xuất tạo task. | Như trên. Một mô hình nhỏ đọc mọi tin của nhóm để lọc, nên mọi tin đều đi tới nhà cung cấp mô hình. | Chủ nhóm chat và chủ dữ liệu |

**Kết luận:** hỏi trợ lý trong nhóm chat là đường ngắn nhất tới chỗ nhân viên đang làm việc, vì không ai phải mở thêm ứng dụng. Nghe trong kênh chỉ nên bật sau khi chủ dữ liệu đồng ý.

## Khoảng trống phải tự làm và cách lấp

### Sửa kết nối Lark

- Lệnh tạo kênh Lark của eve sinh ra mã chỉ gửi trả lời được khi tin đến qua địa chỉ web (webhook). Bộ nối của Lark lại nhận tin qua kết nối dài, nên mọi câu trả lời đều lỗi (issue #1753).
- Issue mở từ 2026-08-07, cập nhật lần cuối 2026-09-06, chưa có bản sửa chính thức.
- Cách lấp: đội lập trình viết lại đường gửi trả lời, gửi thẳng qua API của Lark. Cách này chưa chạy thử.

**Kết luận:** việc sửa nhỏ, nhưng phải chạy thử trong một nhóm Lark thử trước khi hứa mức 1.

### Gắn người nhắn với quyền trong hệ thống

- eve biết người nhắn là ai trong Lark, nhưng hệ thống nội bộ cần biết người đó được làm gì.
- Cách A: eve giữ khoá riêng của từng người và gửi đúng khoá theo người hỏi. Hệ thống không phải đổi gì, nhưng máy chủ eve giữ khoá của mọi người và thành nơi cần bảo vệ nhất.
- Cách B: eve gọi bằng một khoá dịch vụ và báo kèm tên người hỏi; cổng kiểm soát chỉ tin tên này khi đến từ đúng khoá dịch vụ đó. eve đã dùng mẫu này giữa hai trợ lý eve với nhau.
- Việc chạy theo lịch không có người hỏi, nên dùng một danh tính dịch vụ có quyền hẹp.

**Kết luận:** chọn cách B khi có cổng kiểm soát, vì khoá của từng người không nằm rải trên máy chủ trợ lý.

### Kiểm quyền và duyệt khi trợ lý ghi vào hệ thống nội bộ

- Tài liệu eve viết thẳng "Approval is consent only": lời gọi vẫn chạy bằng danh tính của người yêu cầu, người bấm duyệt không thêm quyền.
- Mặc định chỉ người yêu cầu bấm được nút duyệt. Nam xin chuyển T-12 thì chính Nam tự duyệt, không phải trưởng nhóm.
- Nếu máy chủ sập ngay sau khi lệnh ghi đã chạy, eve có thể báo "This call did not run" (issue #5841). Mô hình tưởng chưa ghi và đề nghị làm lại, dẫn tới ghi hai lần.
- Cách lấp: cổng kiểm soát giữ đề xuất, cho đúng người có thẩm quyền duyệt, chống ghi trùng và ghi vết. Đây là cùng cổng ở [mục Kiểm quyền và duyệt khi bot ghi vào hệ thống nội bộ](mausbot.md#kiểm-quyền-và-duyệt-khi-bot-ghi-vào-hệ-thống-nội-bộ).

**Kết luận:** đây là khoảng trống quan trọng nhất. Công ty dựng cổng một lần và dùng chung cho cả eve, MausBot và mọi công cụ AI khác.

### Đội giữ mã

- Mỗi việc mới của trợ lý là mã TypeScript phải viết, kiểm thử và triển khai lại.
- eve đổi rất nhanh, nên đội phải theo dõi bản mới và nâng cấp có kiểm thử.

**Kết luận:** chỉ chọn eve khi công ty sẵn sàng giao trợ lý cho một đội cụ thể giữ lâu dài.

## Vấn đề của eve ảnh hưởng tích hợp

Nguồn là tài liệu và issue trên kho vercel/eve, đọc ngày 2026-11-21. Các lỗi dưới đây do người dùng báo, nhà làm chưa đóng.

| Vấn đề | Chi tiết | Chặn lớp | Xử lý |
|-|-|-|-|
| Đổi rất nhanh | Bốn bản phát hành trong bốn ngày, từ 1.0 (17/11) tới 1.3.0 (20/11); 439 issue và 537 yêu cầu sửa mã đang mở. | Mọi lớp | Ghim phiên bản, nâng cấp theo đợt có kiểm thử |
| Nâng cấp làm hỏng việc đang chờ | Tài liệu ghi: tự cài mà đổi phiên bản thì phiên đang dở không chạy tiếp được. Một người dùng mất 420 phiên sau khi nâng cấp (issue #3570). | 6 | Nâng cấp khi không còn việc chờ duyệt; báo trước cho người dùng |
| Sập giữa chừng khi tự cài | Trên PostgreSQL, lượt đang chạy khi máy sập có thể không bao giờ chạy tiếp (issue #535). Lệnh ghi đã chạy có thể bị báo là chưa chạy (issue #5841). | 5, 6 | Cổng chống ghi trùng; kiểm bằng phép tắt máy giữa lúc ghi |
| Một số phần chỉ có trên Vercel | Đăng nhập kết nối qua Vercel Connect, máy ảo cách ly và trang xem lượt chạy. | 3, 6 | Tự làm phần cần dùng, bỏ phần còn lại |
| Dữ liệu ra ngoài | Nội dung chat tới nhà cung cấp mô hình. Chạy trên Vercel thì dữ liệu nằm ở máy chủ nước ngoài. | 4, 6 | Tự cài trên hạ tầng công ty; chỉ dùng nhà cung cấp mô hình đã duyệt |
| Chưa có vết kiểm toán an ninh | Chưa có cách được hướng dẫn để gửi sự kiện an ninh sang hệ thống giám sát; lần xác thực bị từ chối chưa được ghi (issue #6645, mở 2026-11-19). | 5 | Tự ghi qua hook của eve; vết chính đặt ở cổng |

**Kết luận:** không vấn đề nào chặn một bản thử với dữ liệu giả. Hai vấn đề sập và nâng cấp chặn việc ghi thật, nên phải kiểm trước mức 3.

## Thị trường cho thấy giá trị ở đâu

Ba công ty đầu dùng eve, số liệu do Vercel công bố. Hai công ty sau dựng trợ lý trong Slack bằng công cụ khác, đưa vào để thấy giá trị của trợ lý trong kênh chat. Chưa số liệu nào được kiểm độc lập.

| Công ty | Trợ lý làm gì | Kết quả công bố | Người vẫn phải làm |
|-|-|-|-|
| Clay (eve) | Trợ lý dữ liệu trả lời câu hỏi của nhân viên trong Slack. | Sau hơn hai tháng, 30-40% công ty dùng hằng tuần. | Không nêu. |
| Rillet (eve) | Nhận yêu cầu của khách, viết đặc tả, kiểm thử thay đổi, mở yêu cầu sửa mã. | Tốc độ ra bản mới gấp ba trong ba tháng. | Người duyệt từng yêu cầu sửa mã. |
| Evisions (eve) | Chuyển trợ lý có sẵn sang eve. | Bớt 25 nghìn dòng mã, chi phí AI giảm một nửa, thời gian chạy cải thiện 66%. | Không nêu. |
| Salesforce (công cụ của Salesforce) | Trợ lý trong Slack trả lời và làm việc cho nhân viên; trợ lý hỗ trợ kỹ thuật nội bộ. | 86% nhân viên dùng; một trợ lý có khoảng 25 nghìn người dùng; trợ lý kỹ thuật xử lý hơn 64 nghìn yêu cầu, trả lại 17 nghìn giờ. | Rút kho kiến thức từ 2.000 bài xuống 600 bài đã kiểm. |
| Devolutions (tự viết) | Gõ một lệnh trong kênh sự cố là trợ lý soạn báo cáo sau sự cố, kéo ca hỗ trợ liên quan, đưa vào Jira; trợ lý pháp lý trả lời 10-15 câu hỏi tuân thủ về điều khoản nhà cung cấp. | Không công bố số. | Người quản lý sự cố duyệt báo cáo. |

**Kết luận:** giá trị rõ nhất là trợ lý trả lời câu hỏi về dữ liệu ngay trong kênh chat, tức mức 2. Khi trợ lý ghi, các công ty vẫn giữ người duyệt, đúng vai của cổng kiểm soát.

## Tự dựng hay dùng aily của Lark

Lark có aily, nền tảng dựng trợ lý cho doanh nghiệp. Theo bài của Feishu ngày 2025-11-26, dựng một trợ lý chỉ cần "配置人设（指令）、接入企业知识、添加业务系统 MCP" (đặt chỉ dẫn, nối kho kiến thức, thêm server MCP của hệ thống nghiệp vụ). Quyền đọc kiến thức trong Lark áp luôn cho trợ lý. Nguồn này là bản Feishu ở Trung Quốc; chưa xác nhận aily có trên gói Lark quốc tế của công ty.

| Điều | eve | aily |
|-|-|-|
| Ai dựng | Đội lập trình viết TypeScript. | Người nghiệp vụ cấu hình, kéo thả quy trình. |
| Quyền trên dữ liệu Lark | Tự làm qua cổng kiểm soát. | Kế thừa quyền của Lark. |
| Nối hệ thống nội bộ | MCP, OpenAPI, công cụ tự viết. | MCP. |
| Kênh | Lark, Slack, Teams, web và nhiều kênh khác. | Bot Lark, quầy hỗ trợ, trang web. |
| Dữ liệu và mô hình ở đâu | Tự cài trên máy chủ công ty; tự chọn nhà cung cấp mô hình. | Chưa rõ. |
| Việc dài, luật riêng | Chờ duyệt nhiều ngày; luật duyệt tự viết được. | Chưa rõ. |

**Kết luận:** hỏi Lark xem gói của công ty có aily không. Nếu có, aily hợp với mức 1 và mức 2 vì không cần viết mã. eve hợp khi cần dữ liệu ở lại máy chủ công ty, việc dài, luật duyệt riêng hoặc nhiều kênh ngoài Lark.

## eve và MausBot đặt cạnh nhau

| Điều | MausBot | eve |
|-|-|-|
| Là gì | Ứng dụng có sẵn, mỗi người một nhóm bot. | Bộ khung để dựng trợ lý chung. |
| Ai dựng, ai dùng | Nhà làm dựng; nhân viên tự cài và tự cấu hình bot. | Đội của công ty dựng; nhân viên chỉ nhắn. |
| Vào Lark | Không; phải tự viết cầu nối. | Có bộ nối của Lark; mẫu hiện phải sửa. |
| Biết ai đang nhắn | Không chắc: "never proof of who called". | Có, qua tài khoản Lark. |
| Duyệt | Năm mức, mặc định toàn quyền; người ngồi trước máy duyệt. | Từng công cụ chọn mức hỏi; duyệt chỉ là đồng ý. |
| Cần viết mã | Không. | Có. |
| Hợp với việc gì | Nhân viên tự động hóa việc lặp lại của riêng mình. | Trợ lý chung cho một phòng, ngay trong Lark. |

**Kết luận:** hai sản phẩm không loại trừ nhau. Cả hai cần cùng một cổng kiểm soát đứng trước hệ thống nội bộ, nên cổng là phần nên làm trước, bất kể chọn bên nào.

## Lộ trình

| Giai đoạn | Làm gì | Đi tiếp khi |
|-|-|-|
| 0. Kiểm kỹ thuật | Cài eve ghim phiên bản trên máy ảo cô lập, dữ liệu giả; sửa kết nối Lark trong một nhóm Lark thử; tắt máy giữa lúc ghi; nâng cấp phiên bản khi có việc đang chờ. | Trợ lý trả lời được trong nhóm thử; sập hay nâng cấp không làm mất việc và không ghi hai lần. |
| 1. Mức 1 | 3 đến 5 người hỏi đáp trên tài liệu được phép. Nếu Lark của công ty có aily, dựng cùng việc đó trên aily để so. | Trên 80% câu trả lời đúng; người thử dùng hằng tuần; biết nên chọn eve hay aily. |
| 2. Mức 2 | Nối danh bạ và danh sách task giả lập qua cổng kiểm soát; hai người hỏi cùng một câu. | Mỗi người chỉ thấy phần mình được xem; mỗi lời gọi gắn đúng người. |
| 3. Mức 3 | Cho trợ lý soạn đề xuất ghi, người có thẩm quyền duyệt qua cổng; bật nhắc việc theo lịch bằng danh tính dịch vụ. | Không lệnh ghi nào chạy khi chưa duyệt; gửi lại không ghi hai lần. Khi đó mới quyết dùng rộng. |

**Kết luận:** hết giai đoạn 3 là có đủ số liệu để quyết dùng rộng hay dừng. Giai đoạn 1 còn trả lời luôn câu tự dựng hay dùng aily.

## Nguồn

- [Vercel: Introducing eve 1.0](https://vercel.com/blog/eve-is-now-generally-available)
- [Vercel: eve](https://vercel.com/eve)
- [GitHub: vercel/eve](https://github.com/vercel/eve)
- [eve: Self-hosting](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/guides/deployment/self-hosting/index.md)
- [eve: Workflow worlds](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/guides/deployment/workflow-worlds.md)
- [eve: Chat SDK channel](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/channels/chat-sdk/index.mdx)
- [eve: Connections](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/connections/index.mdx)
- [eve: Human in the loop](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/tools/human-in-the-loop.md)
- [eve: Security model](https://github.com/vercel/eve/blob/08034cde67d2c301c8c339f56db5d118cf14b74a/docs/concepts/security-model.md)
- [eve issue #1753: Lark channel can never reply](https://github.com/vercel/eve/issues/1753)
- [eve issue #535: in-flight turn never resumed after crash](https://github.com/vercel/eve/issues/535)
- [eve issue #5841: applied call settled as did not run](https://github.com/vercel/eve/issues/5841)
- [eve issue #3570: upgrade fails parked sessions](https://github.com/vercel/eve/issues/3570)
- [eve issue #6645: security audit trail](https://github.com/vercel/eve/issues/6645)
- [eve issue #2432: six HTTP requests per MCP call](https://github.com/vercel/eve/issues/2432)
- [npm: @larksuite/vercel-chat-adapter](https://www.npmjs.com/package/@larksuite/vercel-chat-adapter)
- [Feishu: aily](https://www.feishu.cn/content/article/7576921890476788922)
- [Salesforce: Agentforce in Slack](https://www.salesforce.com/blog/linked-content/deploying-agentforce-in-slack-salesforces-journey-to-saving-over-500k-employee-hours-annually/)
- [Slack: Devolutions](https://slack.com/customer-stories/devolutions)
