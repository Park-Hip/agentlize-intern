# Bước 03 - Câu hỏi nghiên cứu và kế hoạch kiểm chứng

- Chủ sở hữu: Phạm Bách Hiệp.
- Mentor: Kevin.
- Phiên bản: 0.2.
- Ngày cập nhật: 2026-11-14.
- Vị trí: bước 03 Question, sau Compare và trước Propose.
- Phạm vi: AI Operations Connector Lab với danh bạ nhân viên và danh sách công việc giả lập.
- Trạng thái: cấu trúc sửa lại đã được người sở hữu duyệt trong hội thoại; nội dung phiên bản này chưa review.

> **CHƯA REVIEW NỘI DUNG.**
> Đây là kế hoạch kiểm chứng, không phải kết quả thực nghiệm, quyết định chọn kiến trúc hay bộ test đã chạy.

## 1. Mục đích và cách sử dụng

Bước Compare đã khảo sát các phương pháp tích hợp và chỉ ra những đánh đổi cần cân nhắc.
Bước Question chuyển các khoảng trống quan trọng thành câu hỏi có thể kiểm chứng, để bước Propose chọn được phương án thử và nói rõ vì sao chưa chọn phương án khác.

Tài liệu này tập trung vào năm quyết định:

1. Hai agent sẽ dùng chung công cụ qua API trực tiếp và MCP như thế nào?
2. Quyền đọc và ghi cần được kiểm tra ở đâu?
3. Cần giữ trạng thái chờ xác nhận như thế nào, và có cần workflow engine không?
4. Xử lý thế nào khi không biết một yêu cầu ghi đã thành công hay chưa?
5. Cần bằng chứng gì để giải thích một lần chạy?

Mỗi câu hỏi dưới đây có giả thuyết, phương án đối chứng, kịch bản đại diện và cách dùng kết quả.
Các kịch bản là thiết kế phép thử, không khẳng định hệ thống đã có hay đã đáp ứng.
Danh sách test case chi tiết, dữ liệu đầu vào cụ thể, lệnh chạy và kết quả sẽ được xây dựng sau khi chọn phạm vi POC.

**Cách chuyển sang Propose:** có thể đề xuất một tổ hợp để thử trước khi có số đo lab.
ADR cần phân biệt bằng chứng đã có với giả định chưa kiểm, nêu phép thử tiếp theo và điều kiện xem xét lại quyết định.
Không xem mọi phương pháp là các kiến trúc hoàn chỉnh thay thế ngang hàng: một tổ hợp có thể dùng nhiều phương pháp cho những vai trò khác nhau.

## 2. Năm câu hỏi ưu tiên

### Q1. Nếu thêm một agent thứ hai, dùng API trực tiếp hay MCP giúp hai agent dùng chung công cụ như thế nào?

**Vì sao cần trả lời?**
Lab cần so sánh hai hướng tích hợp và kiểm tra khả năng agent thứ hai dùng lại công cụ mà không thừa hưởng quyền của agent thứ nhất.
Propose cần nói rõ mỗi hướng được thử để trả lời điều gì, thay vì mặc định MCP có lợi hơn.

**Giả thuyết cần kiểm.**
Trong cấu hình được chọn cho lab, agent thứ hai có thể dùng lại connector và hợp đồng công cụ qua MCP mà không phải sửa connector, đồng thời vẫn có quyền riêng.
API trực tiếp cũng có thể tái sử dụng connector qua thư viện hoặc adapter dùng chung; mức thay đổi của hai hướng cần được quan sát, không đoán trước.

**So sánh với phương án nào?**
So phương án MCP với API trực tiếp có sử dụng lớp tích hợp chung.
Giữ tương đương hai hệ thống giả lập, chức năng, chính sách quyền, bộ kiểm thử hợp đồng và nhiệm vụ của hai agent.
Ghi rõ host, SDK và phiên bản được chọn, vì kết quả phụ thuộc vào chúng.

**Thử như thế nào?**
Agent thứ nhất đọc danh bạ và đề xuất cập nhật công việc trong phạm vi quyền.
Thêm agent thứ hai có nhu cầu đọc và quyền riêng, sau đó cho agent này dùng lại công cụ và thử thao tác ghi mà nó không được phép thực hiện.
Chạy cùng bộ kiểm thử hợp đồng cho cả hai agent, với kết quả quyền kỳ vọng tương ứng.

**Quan sát và kết luận thế nào?**
- Ghi thành phần nào giữ nguyên, thành phần nào phải thêm cấu hình, sửa mã hoặc sao chép; kiểm bằng danh mục thành phần và thay đổi thực tế.
- Đối chiếu kết quả đọc, ghi và từ chối của hai agent với quyền của từng agent.
- Giả thuyết được ủng hộ trong phạm vi thử nếu connector không phải sửa, agent thứ hai vượt bộ kiểm thử và không thừa hưởng quyền của agent thứ nhất.
- Nếu phải sửa connector hoặc agent thứ hai thừa hưởng quyền trái phép, giả thuyết bị bác bỏ trong phạm vi cấu hình đó.
- Nếu chưa chạy đủ hai hướng hoặc chưa kiểm được quyền riêng, kết luận là chưa đủ bằng chứng.

**Kết quả ảnh hưởng quyết định nào?**
Nếu cả hai hướng tái sử dụng tương đương, chưa có cơ sở chọn MCP chỉ vì reuse.
Nếu một hướng cần thay đổi ít hoặc dễ quản lý hơn trong điều kiện tương đương, ghi nhận khác biệt cùng chi phí vận hành, khả năng tương thích và kết quả an toàn để cân nhắc trong ADR.
Kết quả với hai agent và các host đã chọn không tự chứng minh khả năng liên thông với mọi runtime.

### Q2. Hệ thống cần kiểm tra những gì trước khi cho agent đọc hoặc thay đổi dữ liệu?

**Vì sao cần trả lời?**
Sơ đồ giải pháp và phạm vi MVP phải chỉ ra nơi hệ thống kiểm danh tính, quyền và phạm vi dữ liệu.
Không thể coi một câu dặn trong prompt hoặc việc ẩn công cụ là bằng chứng rằng một thao tác trái quyền đã bị chặn.

**Giả thuyết cần kiểm.**
Với cả API trực tiếp và MCP, nếu quyền được kiểm tại điểm thực thi do ứng dụng kiểm soát, người và agent chỉ đọc hoặc ghi trong phạm vi được cấp.
Khi không xác định được quyền, hệ thống không cho truy cập dữ liệu được bảo vệ và không ghi.

**So sánh với phương án nào?**
Đối chiếu hai hướng tích hợp với cùng bảng quyền kỳ vọng, cùng dữ liệu và cùng điều kiện kiểm.
Trong mỗi hướng, so kết quả khi có và khi bỏ câu dặn về quyền khỏi prompt; quyết định thực thi không được phụ thuộc vào câu dặn đó.

**Thử như thế nào?**
Cho một người có quyền và một người không có quyền yêu cầu agent đọc danh bạ và cập nhật công việc.
Thử yêu cầu dữ liệu ngoài phạm vi, gọi trực tiếp đường công cụ và giả lập tình huống bộ kiểm quyền không trả lời.
Kiểm cả dữ liệu trả về cho agent lẫn thay đổi tại hệ thống nghiệp vụ.

**Quan sát và kết luận thế nào?**
- Lưu quyền kỳ vọng, quyết định thực tế, dữ liệu trả về và trạng thái nghiệp vụ trước/sau.
- Giả thuyết được ủng hộ trong phạm vi thử nếu yêu cầu hợp lệ được thực hiện đúng, còn yêu cầu trái quyền hoặc không xác định được quyền bị chặn mà không lộ dữ liệu ngoài phạm vi hoặc tạo thay đổi.
- Một trường hợp vượt quyền, lộ dữ liệu hoặc thay đổi quyết định chỉ vì bỏ câu dặn là phản ví dụ bác bỏ giả thuyết.
- Nếu không quan sát được một đường truy cập hoặc không đối chiếu được dữ liệu đã trả, phần đó chưa đủ bằng chứng.

**Kết quả ảnh hưởng quyết định nào?**
Nếu có đường đi tắt hoặc quyền chỉ được kiểm trong prompt, Propose phải bổ sung điểm cưỡng chế và giới hạn đường truy cập trước khi cho phép ghi trong MVP.
Nếu hai hướng đều đạt các ca đã thử, lựa chọn giữa chúng cần dựa thêm vào những tiêu chí khác, không suy rằng một giao thức tự bảo đảm phân quyền.
Các ca này không thay thế kiểm toán bảo mật toàn diện.

### Q3. Khi phải chờ người dùng xác nhận, ứng dụng tự quản lý trạng thái đã đủ hay cần workflow engine?

**Vì sao cần trả lời?**
Agent phải đề xuất thay đổi và chỉ ghi sau khi có xác nhận hợp lệ.
Propose cần quyết định cách thể hiện bước chờ và phục hồi trong sơ đồ, đồng thời giải thích có cần workflow engine trong MVP hay chưa.

**Giả thuyết cần kiểm.**
Một luồng do ứng dụng quản lý, có lưu trạng thái bền vững, có thể chờ xác nhận và tiếp tục sau khi khởi động lại mà không ghi trước khi được duyệt hoặc ghi sai nội dung đã duyệt.
Nếu cách này không đáp ứng nhu cầu phục hồi và vận hành của lab, workflow engine có thể là phương án đáng khảo sát thêm.

**So sánh với phương án nào?**
Baseline là ứng dụng tự quản lý luồng và lưu trạng thái bền vững.
Đối chứng, nếu được đưa vào phạm vi thử, là một workflow engine cụ thể được chọn sau; hai phương án dùng cùng nghiệp vụ, quyền và điều kiện xác nhận.
Không chỉ so workflow với một biến lưu tạm trong bộ nhớ rồi kết luận workflow là cần thiết.

**Thử như thế nào?**
Một người có quyền yêu cầu cập nhật công việc, hệ thống tạo đề xuất và dừng chờ.
Thử tiếp tục khi chưa xác nhận, sau khi xác nhận hợp lệ, sau khi nội dung đề xuất thay đổi hoặc quyền bị thu hồi, và sau khi ứng dụng khởi động lại trong lúc chờ.

**Quan sát và kết luận thế nào?**
- Đối chiếu nội dung người duyệt nhìn thấy, quyết định xác nhận và thay đổi thực tế ở hệ thống nghiệp vụ.
- Ghi trạng thái trước/sau khi khởi động lại và việc kiểm quyền trước khi ghi.
- Giả thuyết được ủng hộ trong phạm vi thử nếu chưa xác nhận thì không ghi, xác nhận hợp lệ dẫn tới đúng thay đổi, còn xác nhận sai nội dung, hết hạn hoặc quyền đã bị thu hồi không dẫn tới ghi.
- Ghi trước xác nhận, ghi khác nội dung đã duyệt hoặc phục hồi sai làm giả thuyết bị bác bỏ; thiếu bằng chứng về trạng thái sau restart là chưa đủ để kết luận.

**Kết quả ảnh hưởng quyết định nào?**
Nếu ứng dụng tự quản lý đạt các điều kiện và đủ dễ vận hành cho phạm vi lab, chưa cần thêm workflow chỉ vì có bước chờ.
Nếu không đạt, cần xem xét bổ sung cơ chế lưu/phục hồi hoặc thử workflow engine và giải thích đánh đổi trong ADR.
Một engine giúp giữ tiến độ không tự thay thế việc kiểm quyền hay chống ghi trùng ở hệ thống nghiệp vụ.

### Q4. Nếu yêu cầu ghi bị timeout, làm sao biết có thể thử lại mà không tạo thay đổi hai lần?

**Vì sao cần trả lời?**
Timeout không cho biết chắc yêu cầu chưa đến đích hay đã được ghi nhưng mất phản hồi.
Propose cần xác định hệ thống nghiệp vụ phải hỗ trợ gì và MVP sẽ làm gì khi kết quả chưa rõ.

**Giả thuyết cần kiểm.**
Nếu hệ thống đích giả lập hỗ trợ nhận diện cùng một ý định ghi và xử lý lặp an toàn, việc thử lại sau khi mất phản hồi không tạo hiệu ứng ghi thứ hai.
Khi không xác định được kết quả một cách an toàn, hệ thống giữ trạng thái chưa rõ thay vì báo thành công hoặc tự coi đó là một yêu cầu mới.

**So sánh với phương án nào?**
So hai hướng API trực tiếp và MCP trên cùng backend giả lập có hợp đồng chống ghi trùng và cùng kịch bản lỗi.
Có thể dùng một cấu hình thiếu hỗ trợ chống trùng làm đối chứng âm để kiểm tra phép thử có phát hiện rủi ro hay không, nhưng không dùng khác biệt backend để kết luận giao thức nào an toàn hơn.

**Thử như thế nào?**
Cho agent gửi một thay đổi đã được phép và xác nhận.
Giả lập timeout trước khi hệ thống đích nhận yêu cầu, rồi ở một lượt khác cho hệ thống đích ghi thành công nhưng làm mất phản hồi.
Thử lại cùng ý định và kiểm cả trường hợp chưa thể xác định kết quả sau timeout.

**Quan sát và kết luận thế nào?**
- Đối chiếu mã ý định, các lần gửi, kết quả trả về và sổ thay đổi của backend.
- Đếm số hiệu ứng ghi thực tế, không chỉ nhìn giá trị cuối vì hai lần ghi cùng giá trị có thể trông giống một lần ghi.
- Giả thuyết được ủng hộ trong phạm vi hợp đồng đã thử nếu mỗi ý định tạo tối đa một hiệu ứng, không báo thành công sai và các trường hợp chưa rõ được ghi nhận để xử lý tiếp.
- Một hiệu ứng ghi thứ hai hoặc tự gửi yêu cầu mới khi chưa biết kết quả cũ là phản ví dụ; thiếu sổ thay đổi đáng tin cậy là chưa đủ bằng chứng.
- Trạng thái chưa rõ có thể an toàn tạm thời nhưng chưa phải nghiệp vụ đã hoàn tất; cần theo dõi riêng và đối soát.

**Kết quả ảnh hưởng quyết định nào?**
Nếu backend không cung cấp hợp đồng đủ an toàn, Propose phải thay đổi hợp đồng, bổ sung cách đối soát hoặc giới hạn khả năng ghi của MVP.
Không chọn MCP hay workflow với kỳ vọng rằng chúng tự giải quyết việc backend ghi trùng.
Kết quả chỉ áp dụng cho backend và thời hạn lưu thông tin chống trùng đã được thử; không chứng minh exactly-once cho toàn hệ thống.

### Q5. Sau một lần chạy, cần lưu bằng chứng gì để giải thích ai yêu cầu, vì sao được phép hoặc bị từ chối, và dữ liệu đã đổi chưa?

**Vì sao cần trả lời?**
Sơ đồ và phạm vi MVP phải có cách quan sát kết quả, không chỉ có đường gọi công cụ.
Nếu không nối được người yêu cầu, quyết định và thay đổi thực tế, khó đánh giá an toàn hoặc giải thích lỗi sau đó.

**Giả thuyết cần kiểm.**
Một bộ trace và bằng chứng tối thiểu có thể giúp người không tham gia chạy xác định đúng người yêu cầu, agent, hành động, quyết định quyền, trạng thái xác nhận và kết quả nghiệp vụ.
Chi phí đo được được ghi cùng lần chạy; phần chưa đo được được đánh dấu là chưa biết, không ghi thành bằng không.

**So sánh với phương án nào?**
Xem thông tin có sẵn từ từng hướng tích hợp trước, sau đó ghi riêng những trường ứng dụng phải bổ sung để trả lời cùng bộ câu hỏi.
Reviewer chỉ dùng bằng chứng được cấp quyền và không nhận lời giải thích từ người chạy trước khi đối chiếu.

**Thử như thế nào?**
Chọn một lần đọc hợp lệ, một lần bị từ chối, một lần chờ hoặc đã xác nhận và một lần timeout rồi thử lại.
Đưa mã tra cứu và bằng chứng liên quan cho reviewer; yêu cầu họ giải thích kết quả, sau đó đối chiếu với trạng thái nghiệp vụ và quyết định quyền đã ghi nhận.

**Quan sát và kết luận thế nào?**
- Ghi reviewer trả lời đúng, sai hay không xác định được đối với từng thông tin bắt buộc.
- Kiểm trace và đầu ra cho từng vai để phát hiện dữ liệu giả lập ngoài phạm vi quyền bị lộ.
- Giả thuyết được ủng hộ trong phạm vi thử nếu reviewer giải thích đúng các thông tin áp dụng, đối chiếu được kết quả thực tế và không thấy dữ liệu ngoài quyền.
- Trace dẫn tới kết luận sai hoặc lộ dữ liệu là phản ví dụ; thiếu bằng chứng hoặc thiếu thông tin chi phí cần thiết là chưa đủ để kết luận đầy đủ.

**Kết quả ảnh hưởng quyết định nào?**
Nếu trace mặc định chưa đủ, Propose phải bổ sung trường hoặc điểm thu bằng chứng vào sơ đồ và phạm vi MVP.
Nếu chỉ giải thích được bằng cách để lộ dữ liệu ngoài quyền, cần sửa cách thu và cấp quyền xem trace.
Một lượt review trên dữ liệu giả lập chưa chứng minh trace chống sửa hoặc đáp ứng mọi yêu cầu vận hành thực tế.

## 3. Các tình huống cần được bao phủ

Bảng này là danh sách kiểm phạm vi, không phải danh sách test case hoàn chỉnh.
Khi thiết kế POC, mỗi dòng sẽ được chuyển thành các ca cụ thể phù hợp với kiến trúc đã đề xuất.

| Tình huống | Cần quan sát tối thiểu | Câu hỏi liên quan |
| --- | --- | --- |
| Người có quyền và không có quyền yêu cầu đọc/ghi | Dữ liệu trong phạm vi được trả đúng; truy cập trái quyền bị chặn. | Q2 |
| Chưa xác nhận, xác nhận hợp lệ hoặc xác nhận không còn hợp lệ | Chưa có xác nhận hợp lệ thì không ghi; nội dung ghi khớp đề xuất đã duyệt. | Q3 |
| Quyền không xác định hoặc bị thu hồi | Không cho truy cập được bảo vệ hoặc ghi khi không xác định được quyền; kiểm lại trước ghi. | Q2, Q3 |
| Timeout trước ghi hoặc mất phản hồi sau ghi | Phân biệt kết quả đã biết và chưa rõ; thử lại không tạo hiệu ứng thứ hai. | Q4 |
| Agent thứ hai sử dụng lại công cụ | Thành phần giữ nguyên/thay đổi; bộ kiểm thử và quyền riêng của agent thứ hai. | Q1 |
| Thành công, từ chối, chờ xác nhận và lỗi | Trace nối được người yêu cầu, quyết định và kết quả; không lộ dữ liệu ngoài quyền. | Q5 |

## 4. Cách đo và sử dụng bằng chứng

Tuần 1 cần thiết kế cách đo, chưa cần có số đo.
Các chỉ số dưới đây nối trực tiếp với [Bước 0, mục 3.2](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md#32-yếu-tố-đánh-giá).

| Đại lượng | Cách đo dự kiến | Cách sử dụng |
| --- | --- | --- |
| An toàn và tính đúng | Đối chiếu kết quả thực tế với quyền, xác nhận và trạng thái nghiệp vụ kỳ vọng. | Một trường hợp ghi trái quyền, chưa xác nhận mà ghi hoặc ghi trùng là phản ví dụ cần xử lý, không được bù bằng tốc độ tốt hơn. |
| Tái sử dụng - M6 | Ghi connector, hợp đồng và thành phần giữ nguyên hoặc thay đổi khi thêm agent thứ hai; đo thời gian và lượng sửa đổi. | Gate của bước 0 là không phải sửa connector; không chỉ nhìn số dòng code để kết luận khả năng bảo trì. |
| Thời gian - M1 | Đo thời gian đầu-cuối và, khi thu được, tách phần model, kiểm quyền và tích hợp; theo bước 0, báo p50/p95 qua 100 lần. | So cùng nhiệm vụ và cấu hình tương đương; báo riêng thời gian chờ người xác nhận. |
| Độ ổn định - M2 | Theo bước 0, chạy 100 lần có lỗi mạng/timeout; đếm thành công, lỗi, retry, ghi trùng và yêu cầu bị mất. | Gate là 0 duplicate và 0 lost trong phạm vi phép thử; kết quả chưa rõ phải theo dõi riêng, không tính là thành công. |
| Chi phí - M3 | Ghi token, chi phí model và hạ tầng đo được, bao gồm retry; chia theo số thay đổi thành công. | Ghi nguồn giá, thời điểm và phần chưa đo được; không kết luận chi phí tổng nếu thiếu thành phần quan trọng. |
| Khả năng vận hành - M5 | Kiểm kê service, cấu hình, bước triển khai và điểm cần sửa khi đổi policy. | Dùng để giải thích đánh đổi, không mặc định ít thành phần là an toàn hoặc dễ bảo trì hơn. |
| Khả năng mở rộng - M4 | Theo bước 0, đo throughput, latency và lỗi khi tăng số agent hoặc tool. | Chưa cần chạy trong lượt ưu tiên đầu; kết quả hai agent không chứng minh khả năng chịu tải lớn. |

Trước lượt đánh giá, cần ghi rõ phương án, phiên bản, dữ liệu giả lập, chính sách quyền, cấu hình, lịch lỗi và cách xác định một thay đổi thành công.
Hai phương án chỉ được so về latency hoặc chi phí khi cùng phạm vi chức năng, dữ liệu và điều kiện an toàn.
Ngưỡng latency, chi phí và tỷ lệ thành công chưa được đặt tại đây; cần baseline trước khi đề xuất ngưỡng.
Đối với từng câu hỏi, bằng chứng tối thiểu là kết quả thực tế, điều kiện chạy và liên kết tới dữ liệu hoặc báo cáo cho phép đối chiếu.
Một bộ thử hữu hạn chỉ hỗ trợ kết luận trong phạm vi đã thử, không chứng minh không có lỗi trong mọi tình huống.

## 5. Đầu vào cho bước 04 Propose

| Đầu ra hoặc quyết định ở Propose | Câu hỏi liên quan | Cần ghi gì nếu chưa có kết quả lab? |
| --- | --- | --- |
| Chọn hai hướng tích hợp để thử | Q1 | Mô tả API trực tiếp và MCP sẽ được đặt cạnh nhau thế nào; chưa kết luận hướng nào tái sử dụng tốt hơn. |
| Giải thích vì sao chưa chọn hoặc chưa đưa phương án khác vào MVP | Q1-Q5 | Ghi phương án, vai trò, lý do hiện tại, đánh đổi và điều kiện xem xét lại; không loại toàn bộ một phương pháp chỉ vì thiếu một khả năng ngoài vai trò của nó. |
| Sơ đồ giải pháp | Q2-Q5 | Vẽ trách nhiệm kiểm quyền, chờ xác nhận, ghi và thu bằng chứng; đánh dấu phần còn là giả định. |
| Phạm vi MVP | Q1-Q5 | Nêu công cụ, hai agent, hành vi đọc/ghi, giới hạn an toàn và phần chưa làm; không hứa khả năng chưa thể kiểm. |
| Có đưa workflow engine vào MVP không? | Q3 | Nêu phương án quản lý trạng thái được đề xuất, lý do và phép thử phục hồi khiến quyết định có thể thay đổi. |
| Hợp đồng ghi với hệ thống đích | Q4 | Ghi yêu cầu xử lý retry, trạng thái chưa rõ và giới hạn nếu backend chưa hỗ trợ. |
| Trace tối thiểu | Q5 | Liệt kê thông tin cần nối và cách kiểm người review có giải thích được kết quả hay không. |
| ADR | Q1-Q5 | Ghi quyết định thử nghiệm, các lựa chọn thay thế, cơ sở hiện có, giả định, đánh đổi, phép kiểm tiếp theo và điều kiện mở lại. |

**Agent orchestration và event-driven:** agent thứ hai trong Q1 dùng để kiểm tái sử dụng và quyền riêng, không tự tạo nhu cầu dùng manager/specialist hoặc handoff.
Tương tự, một nhu cầu ghi công việc không tự tạo nhu cầu dùng event bus.
Propose cần nêu rõ nếu chưa đưa các phương pháp này vào MVP, lý do và điều kiện xem xét lại; đó không phải kết luận chúng kém trong mọi bối cảnh.
Nếu sau này đề xuất thêm phân vai hoặc phát sự kiện sau ghi, cần bổ sung câu hỏi và phép thử phù hợp với vai trò mới.

## 6. Điều kiện hoàn thành Doc 3

- Mỗi câu hỏi chỉ ra điều cần biết và quyết định ở Propose bị tác động.
- Mỗi giả thuyết có thể được ủng hộ, bị bác bỏ hoặc để ở trạng thái chưa đủ bằng chứng.
- Mỗi kịch bản có đối chứng, điều cần quan sát và giới hạn kết luận.
- Các tình huống quyền, đọc/ghi, xác nhận, timeout/retry, agent thứ hai và trace đều được bao phủ.
- Không ghi kết quả thực nghiệm, số đo hoặc quyết định kiến trúc như thể chúng đã tồn tại.
- Người phụ trách và mentor có thể dùng tài liệu này để thống nhất điều gì cần kiểm trước hoặc sau ADR thử nghiệm.

## Tài liệu đầu vào

1. [Bước 02 - Bảng so sánh và tiêu chí lựa chọn](07-khung-bang-so-sanh-va-tieu-chi-lua-chon.md): cơ sở về vai trò, đánh đổi và câu hỏi mở; không phải kết quả lab.
2. [Bước 0 - Phần 3: Yêu cầu và đánh giá](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md#phần-3---yêu-cầu-và-đánh-giá): yêu cầu SR1-SR8 và cách đo M1-M6; không dùng Phần 2 đang chờ review làm kiến trúc bắt buộc.
3. [Sổ trạng thái review](../REVIEW-STATUS.md): trạng thái của các tài liệu trong repository.
4. Yêu cầu và hướng sửa được người sở hữu duyệt trong hội thoại ngày 2026-11-14: phạm vi Doc 3, cách trình bày và mối liên hệ với Propose.

Các giả thuyết và kịch bản mới trong tài liệu này là đề xuất cần review và kiểm chứng, không phải bằng chứng đã thu được.
