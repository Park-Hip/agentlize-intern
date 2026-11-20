# Tổng hợp phát hiện - AI Operations Connector Lab

Ngày: 2026-11-20. Trạng thái: bản thử của Lab đã chạy trong Thổ Thần desktop cho tra cứu có lọc và ghi một task; hàng đợi ghi tự viết và bản đối chứng Temporal cùng đạt 300/300 lần, nên Q1 giữ 1A; phiên kịch bản C trong Thổ Thần desktop còn chờ; bản web tạm hoãn vì không bật được skill.

Đây là điểm vào của phần nghiên cứu.
Mỗi mục tóm tắt một nhóm tài liệu và trỏ về bản chi tiết.
Mọi người và dữ liệu trong ví dụ đều là giả lập.

## Đọc nhanh

- AI hôm nay làm việc bằng một tài khoản quyền rộng, nên ai nhờ được AI cũng mượn được quyền đó.
- Lab đã khảo sát năm cách nối AI với hệ thống và mười một sản phẩm trên thị trường; không cái nào giải trọn.
  Phần còn trống là gộp ba việc trong một lần ghi: che dữ liệu theo người hỏi, duyệt đúng nội dung, và không ghi hai lần.
- Đề xuất: tự dựng một cổng mỏng làm ba việc đó, chép các mẫu thiết kế đã có, và cắm thẳng vào Thổ Thần.
- Lần cắm thử cho thấy AI trong Thổ Thần gọi được công cụ của Lab, nhưng không hỏi duyệt trước khi ghi và cắt mọi lệnh sau 60 giây.
  Đọc mã nguồn xác nhận hộp duyệt của Thổ Thần chỉ là tính năng giao diện, không phải lớp bảo vệ.
  Lời gọi trong chat đi qua máy chủ Thổ Thần, cả trên web lẫn desktop; máy chủ gắn thêm mã người dùng, nhưng khoá do người thêm skill đặt nên chưa biết có riêng từng người không.
- Bản thử đã chạy trong Thổ Thần bản cài trên máy: chị Hoa tra cứu chỉ thấy đúng phần được xem, và chuyển được một việc sau khi bấm duyệt; Nam bị từ chối.
- Đọc lại mã cho thấy cổng mới chỉ biết sửa từng việc một; Lab dựng lại phần lõi để nối thêm hệ thống không phải sửa lõi, và để chuyển nhiều việc dùng chung một công cụ.
- Phần lõi đã dựng lại; hàng đợi ghi tự chạy tiếp và bản đối chứng Temporal cùng đạt 300/300 lần, không ghi trùng, không mất lệnh, nên Q1 giữ phương án 1A; engine chỉ đáng dùng khi quy trình nhiều bước.
- Tiếp theo: chạy kịch bản C trong Thổ Thần desktop để xác nhận trên host thật, rồi mới đóng mốc 3.

## 1. Vấn đề

Chị Hoa ở phòng Vận hành đang họp ngoài văn phòng thì chị Lan báo nghỉ ốm.
Task T-12 "Gọi lại khách hàng X" của chị Lan cần chuyển gấp sang anh Minh, hạn thứ Sáu.

Nhờ người làm hộ thì chậm.
Nhờ AI thì nhanh, vì AI chạy bằng tài khoản `svc-agent` sửa được mọi task.
Nhưng Nam, thực tập sinh không được chuyển task, gõ đúng câu đó thì AI cũng làm, và lịch sử chỉ ghi `svc-agent`.

**Kết luận:** quyền đang gắn với tài khoản bấm nút, không gắn với người thật sự yêu cầu ([PRD, mục 1.2](problem/prd-ai-platform.md#12-nguyên-nhân-gốc)).
PRD biến điều này thành tám yêu cầu SR1-SR8, mỗi yêu cầu có một phép thử ([PRD, mục 6](problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc)).

## 2. Năm cách nối AI với hệ thống

Lab đã khảo sát năm cách: gọi hàm (function calling), MCP (chuẩn chung để nhiều phần mềm gọi cùng bộ công cụ), công cụ chạy quy trình (workflow engine), điều phối agent (agent orchestration) và tích hợp theo sự kiện (event-driven).
Chi tiết ở [so sánh phương án](research/option-comparison.md) và [ba ghi chú nguồn cho năm cách](research/five-methods).

Ba phát hiện:

- **Năm cách không thay thế nhau mà ghép được với nhau.** Ví dụ khi chuyển T-12: gọi hàm để AI sửa task, công cụ chạy quy trình để giữ lệnh đang chờ duyệt, sự kiện để báo người nhận việc.
- **Không cách nào tự biết ai đang yêu cầu và người đó được làm gì.** Không cách nào tự chặn việc ghi hai lần khi lệnh bị gửi lại.
- **Đọc tài liệu không phân định được gọi hàm hay MCP tốt hơn.** Muốn biết phải đo trên cùng một việc.

**Kết luận:** phần chính của Lab là cổng kiểm soát tự dựng; cách nối công cụ được chọn bằng số đo, không bằng đọc tài liệu.

## 3. Thị trường 2026

Lab đã chấm mười một sản phẩm theo tám yêu cầu, chỉ qua tài liệu công bố, chưa chạy thử sản phẩm nào.
Bảng chấm và 93 câu trích kiểm lại được ở [khảo sát thị trường](research/market-landscape.md).
Bảy bài học, bảng việc của cổng và điều kiện xem lại quyết định ở [bài học từ thị trường](research/market-lessons.md).

Không sản phẩm nào đạt đủ tám yêu cầu; Liyagent gần nhất với 5 đạt.
Mỗi mảnh khó chỉ có một sản phẩm làm: StackOne che trường theo người hỏi, Liyagent khóa lời duyệt vào đúng nội dung, và không ai chống ghi trùng ở hệ đích.

Ba điều mang sang thiết kế:

1. **Chép phần kiểm soát cơ bản.** Mặc định từ chối, lệnh cấm luôn thắng, lỗi hay hết giờ thì từ chối, hai lớp danh tính, che khi đọc và chặn khi ghi theo từng trường.
2. **Tự làm phần gộp trên cùng một đường ghi.** Đó là SR3 (phạm vi quyền), SR4 (điểm dừng rủi ro) và SR6 (không ghi trùng); lời duyệt phải đi qua một kênh mà agent không tự bấm được.
3. **Tránh ba lỗi đã thấy.** Mặc định cho qua (Kong, StackOne), lời gọi không mang danh tính người vẫn được phục vụ (StackOne), và còn đường gọi thẳng không qua cổng (Cloudflare).

**Kết luận:** mua sản phẩm nào thì Lab vẫn phải tự viết phần gộp SR3, SR4 và SR6, nên tự dựng một cổng mỏng là đúng.
Sản phẩm dùng làm mốc "mua" ở bước đánh giá, không làm nền cho bản thử.
Preloop là mã nguồn mở nên đọc được, nhưng thiếu đúng SR1 (người yêu cầu) và SR6, nên dựng trên nó vẫn phải viết lại phần lõi ([khảo sát thị trường, mục 6.2](research/market-landscape.md#62-sản-phẩm-có-giải-bài-toán-của-lab-không)).

### 3.1. MausBot và eve, hai nơi gọi Kevin giao xem ở tuần 3

Ngày 2026-11-19, Kevin giao tìm hiểu MausBot và eve, bộ khung dựng agent của Vercel vừa ra bản 1.0 ([MausBot](research/mausbot.md), [eve](research/eve.md)).
Cả hai là nơi gọi, không phải cổng: không cái nào làm thay SR3 (phạm vi quyền), SR4 (điểm dừng rủi ro) hay SR6 (không ghi trùng), nên thiết kế cổng không đổi.

| | MausBot | eve |
| --- | --- | --- |
| Là gì | Ứng dụng desktop cá nhân, chạy bằng tài khoản AI của từng người | Bộ khung để một đội lập trình dựng trợ lý chạy trên máy chủ |
| Nhân viên Appota gặp ở đâu | Trên máy của người tự cài; không có Lark | Trong nhóm chat Lark, nhờ bộ nối Lark do Lark phát hành |
| Vai trò trong Lab | Nơi gọi thêm cho người đã dùng Claude Code hay Codex (T1) | Ứng viên nơi gọi thứ hai ở mốc 4, so được lối MCP với lối gọi hàm trên cùng một trợ lý |

**Kết luận:** eve gần công việc hằng ngày của nhân viên hơn MausBot, vì nó vào được Lark.
Đề xuất dùng eve làm nơi gọi thứ hai ở mốc 4 thay chương trình chat tự viết, nếu năm phép kiểm đầu ở [eve, mục 7](research/eve.md#7-những-gì-cần-kiểm-tra) đạt; quyết định ghi thành ADR trước khi dựng.

## 4. Thổ Thần

Bốn thứ khác nhau mang tên "Thổ Thần"; chỉ hai là phần mềm đang chạy ([khảo sát Thổ Thần](appota/tho-than-platform.md)).
Thổ Thần web là bản đổi nhãn của LobeHub 2.1.56, và bản này nhận được MCP server.
Bản dựng ngày 2026-11-18 giữ nền đó nhưng thêm ứng dụng điện thoại và Thổ Thần Bridge, cho agent chạy lệnh thẳng trên máy tính người dùng mà không qua MCP; hành vi MCP trên bản mới chưa đo lại ([mục 3.7](appota/tho-than-platform.md#37-bản-dựng-mới-ngày-2026-11-18-ứng-dụng-điện-thoại-và-thổ-thần-bridge)).

Ngày 2026-11-16, Lab cắm một server MCP thử (probe) vào Thổ Thần desktop bằng tài khoản của Lab, chỉ với dữ liệu giả lập.
Server ghi lại mọi thứ Thổ Thần gửi sang; log, ảnh chụp và cách chạy lại ở [kịch bản đo](appota/tho-than-mcp-probe.md), tóm tắt ở [khảo sát Thổ Thần, mục 3.5](appota/tho-than-platform.md#35-lần-cắm-mcp-thử-bằng-tài-khoản-2026-11-16).

Ngày 2026-11-17, Lab làm thêm hai việc ([khảo sát Thổ Thần](appota/tho-than-platform.md)).
Một là đo lại qua địa chỉ HTTPS công khai trên Thổ Thần web và desktop ([mục 3.6](appota/tho-than-platform.md#36-phép-đo-https-công-khai-2026-11-17)); đây là phép đo khác lần 2026-11-16.
Hai là đọc mã nguồn LobeHub 2.1.56 phần gọi MCP, gọi mô hình và duyệt công cụ ([mục 6](appota/tho-than-platform.md#6-đọc-mã-lobehub-2156-danh-tính-và-duyệt-công-cụ)).

| Điều cần biết | Thổ Thần làm gì | Hệ quả cho Lab |
| --- | --- | --- |
| Nối bằng cách nào | Chat gọi được tool qua cả stdio và Streamable HTTP. HTTP chỉ chạy khi server có địa chỉ HTTPS công khai: nối tới `localhost` báo lỗi `fetch failed`, vì lời gọi đi qua máy chủ Thổ Thần ([kịch bản đo, mục 4.8](appota/tho-than-mcp-probe.md#48-kết-quả-đo-qua-https-công-khai-ngày-2026-11-17-s1-s6)). | Cổng chạy ở một máy chủ chung và Thổ Thần web lẫn desktop gọi `/mcp` qua HTTPS; không có chương trình nối stdio ([ADR-0004](../docs/adr/adr-0004-shared-gateway-over-https.md)). Cần một địa chỉ công khai: đường hầm tạm cho tới khi Kevin cho máy chủ thật. |
| Danh tính | Qua stdio, server chỉ thấy tên ứng dụng, không thấy tài khoản. Qua HTTPS công khai, máy chủ Thổ Thần gắn thêm bốn header mang mã và email người dùng (đo 2026-11-17, một tài khoản). Mã LobeHub 2.1.56 không gắn các header này, nên đó là phần Appota thêm; chưa biết Thổ Thần ghi đè hay nối thêm header người dùng tự đặt ([mục 3.6](appota/tho-than-platform.md#36-phép-đo-https-công-khai-2026-11-17), [mục 6.2](appota/tho-than-platform.md#62-lời-gọi-mcp-trong-chat-không-có-danh-tính-do-lobehub-đặt)). Màn hình cấu hình chỉ có "không xác thực" và "khoá API", không có đăng nhập ủy quyền (OAuth2). Khoá Bearer do người thêm skill đặt và tới được server; phép đo chỉ dùng một tài khoản và một skill nên chưa biết khoá riêng từng người hay dùng chung. Ai có token gọi thẳng endpoint cũng tự đặt được `x-user-id`. | Cổng cấp và tự kiểm khoá riêng cho từng người, nhận ra người hỏi qua khoá đó. Đổi khoá có hiệu lực ở lần gọi sau, không cần mở lại ứng dụng. Header của Thổ Thần chỉ làm lớp kiểm thứ hai, và chỉ khi H9 (ghi đè `x-user-id`) và H10 (phiên tách theo người dùng) đúng ([mục 6.5](appota/tho-than-platform.md#65-hệ-quả-cho-adr-0005)). |
| Danh tính trong lời gọi tới mô hình | Mã LobeHub gửi mã người dùng thô trong nội dung lời gọi: `user`, `safety_identifier` hoặc `metadata.user_id`, tuỳ nhà cung cấp. Chỉ đọc mã, chưa đo ([mục 6.3](appota/tho-than-platform.md#63-lời-gọi-model-có-danh-tính-nhưng-trong-body)). | Không coi lời gọi tới mô hình là ẩn danh khi đưa dữ liệu vào chat. |
| Duyệt | Không hỏi trước khi gọi công cụ ghi, kể cả ở chế độ duyệt tay. Mã giải thích vì sao: công cụ MCP không khai báo chính sách duyệt (`humanIntervention`), nên chế độ tay vẫn cho chạy. Ngoài ba chế độ hiện trên giao diện còn một chế độ ẩn `headless`, API nhận và là mặc định khi lời gọi không gửi cấu hình ([mục 6.4](appota/tho-than-platform.md#64-bốn-chế-độ-duyệt-ba-chế-độ-hiện-trên-giao-diện)). Không có biểu mẫu hỏi người dùng (elicitation). Link trong kết quả bấm được và mở trình duyệt. | Cổng không được dựa vào hộp duyệt của Thổ Thần: tự kiểm quyền và tự chặn ghi. Duyệt nằm ở trang riêng của cổng, mở bằng link; khớp [bài học về kênh duyệt](research/market-lessons.md#34-lời-duyệt-phải-khóa-vào-đúng-nội-dung-và-đi-qua-kênh-agent-không-giả-được). |
| Gọi lại và thời gian chờ | Không tự gọi lại khi công cụ báo lỗi. Cắt mọi lệnh sau 60 giây, và nút dừng không hủy ngay. Mỗi lần gọi là một tiến trình mới. | Công cụ phải trả lời dưới 60 giây; việc dài như chuyển 30 task chạy nền và trả mã theo dõi. Mọi trạng thái lưu ở cổng, không giữ trong bộ nhớ. |
| Hiển thị và vết | Không hiện dữ liệu có cấu trúc. Kết quả lỗi của probe vẫn có dấu tích xanh; lời từ chối của cổng Lab, có đánh dấu lỗi (`isError`), hiện dấu cảnh báo "1 failed" trên desktop ([nghiệm thu mốc 2, mục 2](evaluation/milestone-2-tho-than.md#2-kịch-bản-b-nam-bị-từ-chối)). Không có mã vết, không có số token. | Kết quả viết bằng chữ dễ đọc, lỗi ghi rõ trong chữ. Cổng tự sinh mã vết cho SR7 (vết xuyên suốt). |

Độ tin cậy: cao với duyệt, thời gian chờ, đường đi của khoá và việc lời gọi đi qua máy chủ Thổ Thần (có log, ảnh, lặp lại, thêm đọc mã); trung bình với nguồn gốc header danh tính và việc chia sẻ khoá, vì mới có một tài khoản, một skill và log gốc của phép đo HTTPS không còn trên máy đo, chỉ còn bản tóm tắt ([khảo sát Thổ Thần, mục 3.6](appota/tho-than-platform.md#36-phép-đo-https-công-khai-2026-11-17)).
Lỗi `fetch failed` ở `localhost` đã có lời giải thích khớp phép đo: lời gọi trong chat đi qua máy chủ Thổ Thần nên không tới được máy người dùng, còn địa chỉ công khai thì tới được.

**Kết luận:** Thổ Thần là nơi chạy bản thử, và đã chạy được qua cả stdio lẫn Streamable HTTP có địa chỉ công khai.
MCP chỉ mang lời gọi, không mang an toàn: trong Thổ Thần, chuẩn này không cho biết ai đang hỏi và không có bước duyệt; đây là bằng chứng đầu tiên trên host thật cho câu "khi nào MCP là lựa chọn sai".
Hai câu chặn thiết kế đã có lời đáp: Thổ Thần không có bước duyệt đáng tin, và không có danh tính người dùng mà Lab kiểm chứng được, nên cổng của Lab làm cả hai.
Việc duyệt không thể giao cho Thổ Thần: công cụ MCP không khai báo chính sách duyệt, và còn một chế độ ẩn cho chạy không hỏi; H11 kiểm xem API có chạy được công cụ ghi mà không hỏi không.
Việc danh tính cũng vậy: header `x-user-id` do Thổ Thần gắn chỉ là lớp kiểm thứ hai, và chỉ dùng được sau khi H9 (ghi đè `x-user-id`) và H10 (phiên tách theo người dùng) có kết quả ([khảo sát Thổ Thần, mục 9](appota/tho-than-platform.md#9-câu-hỏi-mở-và-giả-thuyết-kiểm-được)).
Bản thử cấp mỗi nhân vật giả một khoá riêng và ghi rõ đây là giả lập.
Khoá chỉ chứng minh "người cài công cụ này", không phải một lần đăng nhập; vì vậy cổng tự kiểm khoá, thu hồi được khoá, và che khoá trong log.
Ô biến môi trường của stdio không hiện sẵn trong form cài; người dùng phải thêm qua "Import JSON config", nên hướng dẫn cài của Lab phải ghi rõ bước này.
Bốn điểm cần báo Kevin: người dùng thật ở web hay desktop, header danh tính có được máy chủ ký không, skill do từng người thêm hay chia sẻ cho cả tổ chức, và Lab có địa chỉ công khai lâu dài không.

## 5. Làm gì bây giờ

Mục tiêu: trong Thổ Thần, chị Hoa gõ "chuyển T-12 cho anh Minh".
AI đề xuất, người có quyền duyệt ở chỗ AI không tự bấm được, hệ thống ghi đúng một lần và để lại vết.
Tám phép thử SR1-SR8 chạy tự động.

### 5.1. Cách làm

| Phần | Bản thử đầu | Vì sao |
| --- | --- | --- |
| Cổng kiểm soát: danh tính, luật quyền, lọc trường, duyệt, chống ghi trùng, vết | Lab tự dựng, chép mẫu ở mục 3 | Không sản phẩm nào làm trọn SR3, SR4, SR6 |
| Nối công cụ | MCP trước, vì đó là đường cắm vào Thổ Thần; gọi hàm thêm sau trên cùng cổng | Hai cách vẫn được đo cạnh nhau, chỉ đổi thứ tự dựng |
| Cắm vào Thổ Thần | Cổng chạy ở một máy chủ chung; Thổ Thần gọi `/mcp` qua HTTPS và cổng giữ mọi trạng thái | Chat web và desktop đều gọi từ máy chủ Thổ Thần, nên một địa chỉ phục vụ cả hai; người duyệt thấy đề xuất ở một nơi ([ADR-0004](../docs/adr/adr-0004-shared-gateway-over-https.md)) |
| Chờ duyệt | Cổng tự lưu đề xuất đang chờ; người duyệt bấm trên trang của cổng, mở bằng link trong chat | Thổ Thần không có bước duyệt (mục 4); ít thành phần; xem lại theo Q1 ở mục 6 |
| Điều phối agent, sự kiện | Chưa thêm | Chưa yêu cầu nào cần |

### 5.2. Phạm vi bản thử

Dữ liệu giả gồm danh bạ khoảng 20 nhân viên và khoảng 100 task của hai phòng Vận hành và Kinh doanh ([PRD, mục 3.3](problem/prd-ai-platform.md#33-phạm-vi-thử)).
Ba kịch bản phải chạy được trong Thổ Thần:

1. Chị Hoa nhờ AI chuyển T-12 sang anh Minh, xem đề xuất, bấm duyệt, và task được chuyển.
2. Nam gõ đúng câu đó thì bị từ chối, kèm lý do và người cần hỏi.
3. Chị Hoa tra anh Minh thì không thấy số điện thoại cá nhân.

Chuyển 30 task cần anh Quang duyệt là kịch bản thứ tư, làm khi ba kịch bản đầu đã chạy.

### 5.3. Không làm bây giờ

- **Không đọc sâu thêm hệ thống ngoài.** Chỉ đọc mã Preloop phần luồng duyệt và cách từ chối khi lỗi, tối đa nửa ngày, đúng lúc dựng phần duyệt.
- **Không chạy thử Liyagent hay AgentCore.** Hai việc này tốn tiền và thời gian, không đổi quyết định dựng; chúng thuộc bước đánh giá.

**Kết luận:** mọi việc trong tuần phục vụ một bản thử chạy được trong Thổ Thần; nghiên cứu chỉ làm khi bản thử hỏi tới.

## 6. Câu hỏi còn mở

| Câu hỏi | Ta đoán | Trả lời bằng | Khi nào |
| --- | --- | --- | --- |
| Khoá là riêng từng người hay cả tổ chức dùng chung? | Chưa biết, vì phép đo chỉ dùng một tài khoản và một skill | Hỏi Kevin; thử hai tài khoản cùng một skill | Tuần 2, không chặn mốc 1 |
| Máy chủ Thổ Thần có ký header danh tính và gọi ra từ dải IP cố định không? | Chưa biết; header `x-user-id` hiện có thể do người gọi tự đặt | Hỏi Kevin; thử gửi header giả và so IP gọi ra | Tuần 2, quyết định cách dùng `x-user-id` |
| Hai tài khoản có trông giống nhau ở phía server không? | Giống nhau | Chạy lại `whoami` bằng tài khoản thứ hai | Khi có tài khoản thứ hai |
| Q1. Sập giữa lúc chuyển 30 task: chạy lại có đủ, không trùng? | Cổng tự viết làm được, nếu mỗi task có mã riêng và tiến độ lưu sau mỗi task | Đã đạt trên phép thử tự động và bản đối chứng Temporal: mỗi bản 300/300 lần, 0 ghi trùng, 0 lệnh mất; xem [Q1 tự viết](evaluation/results/2026-11-20-q1-outbox-gateway-7b7ae94.json) và [Q1 Temporal](evaluation/results/2026-11-20-q1-outbox-temporal-87d50f9.json) | Xong phần máy 2026-11-20; phiên kịch bản C trong Thổ Thần desktop còn chờ |
| Q2. MCP tiết kiệm bao nhiêu công so với gọi hàm? | Gần bằng nhau khi Lab viết cả hai nơi gọi | Thêm trợ lý AI thứ hai cho từng cách, đếm giờ công | Bước đánh giá |
| Nhân viên thật dùng Thổ Thần trên điện thoại, web hay desktop? | Điện thoại hoặc web, vì PRD Skill Studio thiết kế cho điện thoại trước; khi đó stdio không tới được người dùng thật | Hỏi Kevin; mở thử app điện thoại | Tuần 2, quyết định cách nối từ mốc 2 |
| Hook của AgentLize chạy ở đâu, và danh tính người dùng đi tiếp tới cổng thế nào? | Chưa ai dựng; nếu có, Hook chạy trong Thổ Thần vì chỉ ở đó có phiên đăng nhập. Mã LobeHub 2.1.56 không gắn danh tính vào lời gọi MCP, nhưng Thổ Thần có gắn header ở đường HTTPS | Hỏi Kevin; mã LobeHub đã đọc ([mục 6.2](appota/tho-than-platform.md#62-lời-gọi-mcp-trong-chat-không-có-danh-tính-do-lobehub-đặt)), phần còn lại là H9 | Tuần 2, không chặn mốc 1 |
| H9 (ghi đè `x-user-id`): Thổ Thần ghi đè header `x-user-id` người dùng tự đặt, hay nối thêm? | Ghi đè; chưa chứng minh | Thêm header `x-user-id: spoof-test` vào skill, gọi `whoami`, xem probe nhận giá trị nào | Trước khi bật lớp thứ hai của ADR-0005 |
| H10 (phiên tách theo người dùng): hai người cùng cấu hình có chung phiên MCP không? | Không chung; chưa chứng minh | Hai tài khoản cùng skill, so `mcp-session-id` và `x-user-id` | Trước khi bật lớp thứ hai của ADR-0005; cần tài khoản thứ hai |
| H11 (`execAgent` mặc định không hỏi duyệt): gọi `execAgent` không kèm cấu hình duyệt có chạy công cụ ghi mà không hỏi không? | Có, vì mã mặc định `headless`; mới đọc mã, chưa đo | Gọi API với công cụ ghi giả lập, xem có bản ghi chờ duyệt không | Khi đo kênh duyệt của Thổ Thần, cần Kevin |
| H12 (bản dựng mới giữ hành vi MCP): bản Thổ Thần ra ngày 2026-11-18 có còn gắn header danh tính, còn chạy không hỏi và còn cắt ở 60 giây không? | Còn, vì nền vẫn là LobeHub 2.1.56; chỗ chọn chế độ duyệt đã không còn hiện trên bản web | Cắm probe qua đường hầm vào Thổ Thần desktop, gọi `whoami` và `fake_write` | Phiên đường hầm tiếp theo, trước mọi lần nghiệm thu mới |

Q1 đã có bằng chứng tự động trong [nghiệm thu mốc 3, mục 2](evaluation/milestone-3-tho-than.md#2-phần-đã-chạy-bằng-máy) và [bản đối chứng Temporal](evaluation/results/2026-11-20-q1-outbox-temporal-87d50f9.json).
Hai bản cùng đạt 300/300 lần đúng kết quả cuối, 0 ghi trùng, 0 lệnh mất.
Bản tự viết có 2 file và 3 dịch vụ cần cho đường ghi, 1 bước sau khi sập; bản Temporal có 4 file, 5 dịch vụ và 2 bước sau khi sập ([M5 tự viết](evaluation/results/2026-11-20-m5-complexity-gateway-62e309e.json), [M5 Temporal](evaluation/results/2026-11-20-m5-complexity-temporal-87d50f9.json)).
Vì vậy giữ 1A cho lệnh hàng loạt một bước; engine chỉ đáng dùng khi quy trình có nhiều bước nối nhau, chờ duyệt nhiều ngày, nhiều hệ thống hoặc cần hoàn tác.
Kết luận này chỉ nói về hàng đợi lệnh ghi trên hệ thống giả, một máy; phiên kịch bản C trong Thổ Thần desktop chưa chạy, nên chưa nói gì về host thật.

Q1 và Q2 chi tiết ở [spec bản thử, mục 2.1](design/mvp-spec.md#21-q1-lệnh-ghi-hàng-loạt-có-cần-workflow-engine-không).
Bốn câu H9 tới H12 chi tiết ở [khảo sát Thổ Thần, mục 9](appota/tho-than-platform.md#9-câu-hỏi-mở-và-giả-thuyết-kiểm-được).
Hai câu về thiết bị và Hook, cùng mọi mối nối giữa Appota, AgentLize, Thổ Thần, MausBot và Lab ở [bản đồ hệ thống](design/system-map.md).

Hai câu chặn thiết kế ở bản trước (danh tính, kênh duyệt) đã có lời đáp ở mục 4; câu khoá riêng hay dùng chung vẫn mở.

**Kết luận:** Q1 giữ phương án 1A trên hệ thống giả sau khi so với bản Temporal: cả hai đều 0 sót, 0 trùng, còn bản tự viết ít dịch vụ và ít bước vận hành hơn; kết luận cuối vẫn chờ phiên host thật, và không câu nào còn chặn việc viết ADR; câu chia sẻ khoá quyết định mô hình khoá có dùng được trong thực tế không, còn câu nguồn header quyết định có bật lớp kiểm thứ hai không.

## 7. Đo thế nào là thành công

- **Điều kiện đạt:** tám phép thử của PRD đạt trên cả hai cách nối ([PRD, mục 7](problem/prd-ai-platform.md#7-bàn-giao-và-cách-đo)).
- **Năm con số bằng 0:** ghi trùng, lệnh mất, ghi vượt quyền, lộ trường ngoài quyền, lộ dữ liệu cá nhân.
- **Sáu chỉ số so hai cách:** thời gian, độ ổn định, chi phí, mở rộng, độ phức tạp vận hành, công sức dùng lại.

**Kết luận:** bộ phép thử dựng cùng bản thử; mục tiêu của sáu chỉ số chốt sau lần đo đầu tiên (baseline).

## 8. Bước tiếp theo

| Khi nào | Việc | Bằng chứng xong |
| --- | --- | --- |
| Xong 2026-11-16 | Cắm một MCP server thử vào Thổ Thần desktop, trả lời câu danh tính và câu kênh duyệt | [Kịch bản đo](appota/tho-than-mcp-probe.md), [khảo sát Thổ Thần, mục 3.5](appota/tho-than-platform.md#35-lần-cắm-mcp-thử-bằng-tài-khoản-2026-11-16) |
| Xong 2026-11-16 | Kiểm khoá riêng mỗi người qua stdio và khoá API | [Kịch bản đo, mục 5.5](appota/tho-than-mcp-probe.md#55-khoá-riêng-của-từng-người-h8) |
| Xong 2026-11-17 | Đo qua HTTPS công khai và đọc mã LobeHub 2.1.56 về danh tính và duyệt | [Khảo sát Thổ Thần, mục 3.6](appota/tho-than-platform.md#36-phép-đo-https-công-khai-2026-11-17) và [mục 6](appota/tho-than-platform.md#6-đọc-mã-lobehub-2156-danh-tính-và-duyệt-công-cụ) |
| Đóng 2026-11-18, chưa có trả lời | Báo Kevin bốn điểm ở mục 4 (#18); xoá khoá thử khỏi cấu hình hai skill thử | Bốn điểm vẫn mở ở mục 6; câu trả lời của Kevin, khi có, ghi vào mục 4 |
| Xong 2026-11-17 | Viết các ADR đầu (cổng mỏng, đọc và ghi an toàn, công nghệ, cổng chung qua HTTPS, danh tính người hỏi, trang điều khiển) và spec bản thử | [ADR-0001](../docs/adr/adr-0001-self-built-thin-gateway.md) tới [ADR-0006](../docs/adr/adr-0006-operator-console.md), [spec bản thử](design/mvp-spec.md) |
| Xong 2026-11-18, bản desktop | Dựng hai hệ thống giả lập, cổng kiểm soát và MCP server; mốc 1 (tra cứu có lọc, đổi khoá đổi người trong vết) và mốc 2 (chị Hoa ghi T-12 sau khi bấm Gửi, Nam bị từ chối, câu lừa trong T-13 không được làm theo) | [Nghiệm thu mốc 1, mục 12](evaluation/milestone-1-tho-than.md#12-phiên-2026-11-18-việc-còn-mở), [nghiệm thu mốc 2](evaluation/milestone-2-tho-than.md), [báo cáo cổng kiểm quyền](evaluation/permission-gateway-tho-than.md) |
| Xong 2026-11-18 | Link xác nhận dùng địa chỉ đường hầm (#63); cổng nói rõ trường bị ẩn theo quyền (#64) | Phép thử máy đạt; chưa chạy lại trong Thổ Thần |
| Hoãn | Tìm vì sao Thổ Thần web không bật được skill (#65) | Làm lại khi Thổ Thần web bật được skill tùy chỉnh; tới lúc đó nghiệm thu chỉ dùng bản desktop |
| Hoãn H12 theo #73; phiên đường hầm sau | Chạy lại #63 và #64 trong Thổ Thần; rồi H9 và H10 trước khi bật lớp kiểm thứ hai của ADR-0005; H11 phục vụ kênh duyệt (mục 6) | Kết quả ghi vào cột cuối của bảng H trong [khảo sát Thổ Thần, mục 9](appota/tho-than-platform.md#9-câu-hỏi-mở-và-giả-thuyết-kiểm-được) |
| Tuần 3 | Dựng lại lõi theo [ADR-0007](../docs/adr/adr-0007-system-adapters-and-change-sets.md) (bộ tiếp hợp theo hệ thống, luật dạng dữ liệu, đề xuất nhiều mục, hàng đợi lệnh ghi, chặn tách nhỏ) và [ADR-0008](../docs/adr/adr-0008-approval-page-login.md) (mật khẩu trang riêng, hộp chờ duyệt, hạn duyệt 2 giờ) | Phép thử ở ADR-0007 mục 5 đạt; sửa danh bạ đi qua đường ghi chung |
| Xong phần máy 2026-11-19 | Phép thử sập và ngắt 20 giây cho hàng đợi lệnh ghi; Q1 giữ 1A | [Nghiệm thu mốc 3, mục 2](evaluation/milestone-3-tho-than.md#2-phần-đã-chạy-bằng-máy) |
| Đầu tuần 4, còn phiên host | Kịch bản 30 task trong Thổ Thần desktop, điền bằng chứng và đóng #84 | [Nghiệm thu mốc 3, mục 13](evaluation/milestone-3-tho-than.md#13-chỗ-điền-bằng-chứng) |
| Cuối tuần 3 | Hỏi Kevin ba câu về eve: trợ lý trong Lark, ứng dụng Lark thử và khoá mô hình, eve làm nơi gọi thứ hai (#92) | Câu trả lời ghi vào [eve, mục 9](research/eve.md#9-thứ-tự-làm) |
| Tuần 4 | Thêm cửa gọi hàm, đo lần đầu; nếu Kevin đồng ý thì chạy phép kiểm eve KE1-KE5 và viết ADR chọn nơi gọi thứ hai | Số đo baseline |
| Tuần 5-6 | Đánh giá, trả lời Q2, chạy thử sản phẩm làm cột "mua" | Báo cáo có mục "khi nào không nên dùng MCP" |

## 9. Tài liệu chi tiết

- [PRD](problem/prd-ai-platform.md) và [bảng thuật ngữ](problem/glossary.md): bài toán, người dùng, tám yêu cầu, sáu chỉ số.
- [Khảo sát thị trường](research/market-landscape.md): mười một sản phẩm chấm theo tám yêu cầu, kèm nguồn.
- [Bài học từ thị trường](research/market-lessons.md): bảy bài học, việc của cổng, và khi nào xem lại quyết định tự dựng.
- [So sánh phương án](research/option-comparison.md) và [khung so sánh chi tiết](research/comparison-framework.md): năm cách nối.
- [Kiến trúc hệ thống thật](research/real-system-architectures.md) và [tổng quan MCP](research/mcp-overview.md).
- [MausBot](research/mausbot.md): ứng dụng agent mã nguồn mở, ứng viên nơi chạy thứ hai cho bộ công cụ của Lab; đứng ở lớp thực thi cạnh Thổ Thần desktop và trùng vai một phần với AgentLize.
- [eve](research/eve.md): bộ khung dựng agent của Vercel; vào được Lark, ứng viên nơi gọi thứ hai ở mốc 4.
- [Khảo sát Thổ Thần](appota/tho-than-platform.md), [kịch bản đo MCP trong Thổ Thần](appota/tho-than-mcp-probe.md), [tình huống Appota](appota/appota-cases.md), [skill của AppotaPay](appota/appotapay-skills.md).
- [Spec bản thử đầu](design/mvp-spec.md): bản thử chứng minh gì, kiến trúc, phép thử và bốn mốc.
- [Bản đồ hệ thống](design/system-map.md) và [bản vẽ](design/system-map.html): năm mảnh ghép nối với nhau thế nào, mối nối nào đã đo, điều gì chưa biết và cách kiểm.
- [Spec bản thử, mục 2](design/mvp-spec.md#2-hai-câu-hỏi-nghiên-cứu): Q1 (sập giữa chừng) và Q2 (MCP tiết kiệm bao nhiêu công), cách thử và đối chứng.
- [Báo cáo cổng kiểm quyền trong Thổ Thần](evaluation/permission-gateway-tho-than.md), [nghiệm thu mốc 1](evaluation/milestone-1-tho-than.md), [nghiệm thu mốc 2](evaluation/milestone-2-tho-than.md) và [nghiệm thu mốc 3](evaluation/milestone-3-tho-than.md): bản thử chạy trong Thổ Thần desktop, bằng chứng và số đo đầu tiên.
