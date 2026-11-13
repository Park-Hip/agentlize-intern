> **CHƯA REVIEW - KHÔNG TIN HOÀN TOÀN.** Bản nháp do agent soạn từ năm lane research song song, chưa được Phạm Bách Hiệp review.
> Mọi số tiền và mọi câu trích đều có URL trong mục 8. Bản 0.5 mở lại toàn bộ 32 nguồn cũ và 17 nguồn mới ngày 2026-11-13; năm chỗ lệch nguồn đã sửa và ghi ở mục 9.
> Chưa có số đo nào trên lab. Không chọn mô hình nào. Không phải ADR.
> Trạng thái: [`../REVIEW-STATUS.md`](../REVIEW-STATUS.md).

# Bước 02 - Bảng so sánh và tiêu chí lựa chọn

Owner: Phạm Bách Hiệp.  
Mentor: Kevin.  
Ngày: 2026-11-13.  
Revision 0.5.  
Trạng thái: bản nháp, chưa review, không phải ADR.

Đây là đầu ra của bước 02 trong bảy bước của chương trình: so sánh ưu/nhược, khả năng mở rộng, chi phí, bảo mật, bảo trì và độ phù hợp với nhu cầu, kèm so sánh năm mô hình và tiêu chí lựa chọn.
Phạm vi: năm mô hình mà đề bài Track 01 bắt buộc khảo sát trước.
Ngoài phạm vi: chọn mô hình, xếp hạng, báo giá, đo hiệu năng, viết ADR.
Không mô hình nào bị chọn hay bị loại trong file này.
Bước 04 mới làm việc đó.

Đầu vào:

- Năm báo cáo lane trong `.research/09-rewrite/`, mỗi file một mô hình, không thuộc repo và không được trích dẫn như tài liệu của repo.
- [`08-khao-sat-nam-phuong-phap-tich-hop.md`](08-khao-sat-nam-phuong-phap-tich-hop.md), bản nháp chưa review, dùng để đối chiếu chứ không dùng làm bằng chứng.
- [`../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md`](../reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md), bước 0 của khung, cung cấp SR1-SR8 và M1-M6.

## 0. Cách đọc

### 0.1. Tám mục của mỗi mô hình, và câu hỏi của từng mục

Mỗi mô hình có một đoạn **Cơ chế** đặt trước bảy trục.
Cơ chế là chỗ trả lời mô hình giải bài toán gì và đại lượng nào đổi khi số hệ thống hoặc số tool tăng.
Thiếu đoạn này thì bảy trục không có mốc để so, và ưu/nhược biến thành danh sách câu trích.

| Mục | Câu hỏi | Bằng chứng hợp lệ | Không tính là bằng chứng |
| --- | --- | --- | --- |
| Cơ chế | Mô hình giải bài toán gì, bằng cách nào, đại lượng nào đổi khi số hệ thống hoặc số tool tăng, và mô hình không giải bài toán gì | Trang nêu mục đích, trang kiến trúc, lập luận có tiền đề | Một câu MUST rời khỏi ngữ cảnh |
| Ưu | Được gì, cho ai, ở quy mô nào | Trang nêu mục đích, số đo, lập luận từ cơ chế | Nghĩa vụ của người viết server, câu SHOULD trong đặc tả |
| Nhược | Mất gì, vỡ ở đâu trước, khi nào vỡ | Giới hạn có số, điều kiện biên, ca vỡ | Câu "thiếu tính năng" chung chung |
| Mở rộng | Cái gì tăng, chặn ở đâu, có số công bố không | Số công bố, bảng giới hạn | Ước lượng không nguồn |
| Chi phí | Đơn vị giá là gì, tiền mỗi lần ghi thành công là bao nhiêu | Bảng giá, đơn vị tính, số đo | Giá niêm yết thay cho số đo |
| Bảo mật | Ai được làm gì, bằng chứng nằm ở đâu, thiếu thì ai dựng | Đặc tả xác thực, mô hình quyền | Câu SHOULD không kèm cơ chế |
| Bảo trì | Bao nhiêu thành phần phải chạy, đổi một luật quyền thì sửa mấy chỗ | Số đếm được, tài liệu vận hành | Cảm nhận về độ phức tạp |
| Phù hợp nhu cầu | SR nào có sẵn, SR nào chỉ một phần, phần thiếu là gì | Bảng phủ SR, câu trích | Điểm số hoặc xếp hạng |

Mục Ưu không phải chỗ liệt kê nghĩa vụ của đặc tả.
Ví dụ: MCP bắt server dùng OAuth 2.1 và cấm token passthrough là nghĩa vụ của người viết server.
Ưu của người chọn MCP là một server phục vụ nhiều client, và số connector đổi từ n nhân m thành n cộng m.
Hai câu đó khác nhau, và bản 0.4 đã lẫn.

### 0.2. Bốn nhãn bằng chứng

- `có số`: có con số công bố, đã mở trang gốc trong ngày 2026-11-13.
- `có câu trích`: có câu chữ nguyên văn trên trang đã mở.
- `suy từ thiết kế`: kết luận của người viết từ cấu trúc của mô hình, có nêu tiền đề, không phải câu chữ của nguồn.
- `KHÔNG CÓ SỐ CÔNG BỐ`: đã tìm và không có, kèm ngày kiểm, và không được thay bằng ước lượng.

Nhãn `suy từ thiết kế` là chỗ dành cho lập luận.
Nó đủ để viết trục Ưu và Nhược, vì hai trục đó hỏi về hệ quả chứ không hỏi về câu chữ.
Nó không đủ để chấm điểm ở bước 04, vì điểm cần số đo hoặc cơ chế kiểm được.

Một câu không có mã nguồn không có nghĩa là câu dẫn.
Nếu câu đó là một khẳng định về nguồn ngoài thì phải có mã.
Nếu câu đó là lập luận của người viết thì phải gắn nhãn `suy từ thiết kế`.
Không được để lập luận mạnh nhất trôi vào câu dẫn không nhãn.

Một ô ghi `không nói tới` nghĩa là nguồn gốc của mô hình đó không định nghĩa khái niệm ấy.
Nó không có nghĩa là không thể làm được, mà nghĩa là phải dựng thêm, và phần dựng thêm đó không thuộc mô hình.

### 0.3. Quy tắc đọc mã nguồn

Mục 3 gắn mã nguồn dạng `E24` ở những câu mang số liệu, mức bắt buộc hoặc tên cơ chế, tra ở mục 8.
Các câu dẫn và câu diễn giải lại một dữ kiện vừa nêu thì không gắn mã.
Vì vậy một mục con không có mã nguồn không có nghĩa là không có nguồn: dòng "Nguồn của mục này" ở đầu mỗi mục 3.x nêu khoảng mã nguồn cho cả mục.

Bản 0.4 đã qua một lượt kiểm bằng chứng độc lập: 21 khẳng định chịu tải nhất được mở lại nguồn, kết quả 16 khớp, 5 lệch, 0 không mở được.
Năm chỗ lệch đã sửa tại chỗ và ghi lại ở mục 9.
Bản 0.5 mở lại toàn bộ 32 mã cũ và mở thêm 17 mã mới.
Năm chỗ lệch mới được sửa và ghi ở mục 9.
Lượt kiểm đó không thay cho việc anh Hiệp review, và không nâng file này lên trạng thái đã review.

## 1. Đơn vị so sánh

Bảng này là kết quả quan trọng nhất của bước 01 và là điều kiện để bước 02 không sai phạm trù.
Năm mô hình không đo bằng cùng một đơn vị.

| Mô hình | Đơn vị so sánh | Đơn vị giá | Hệ quả cho cách so sánh |
| --- | --- | --- | --- |
| API / Function Calling | Một tool call, gồm một yêu cầu gọi hàm và một lượt trả kết quả về model (E24) | Token, tính trên một triệu token vào và ra (E27, E29, E30) | Không có đơn giá theo lời gọi, nên chi phí một lần ghi phụ thuộc độ dài prompt, không phụ thuộc số lần gọi |
| MCP | Một message JSON-RPC `tools/call` mang `name` và `arguments` (E35) | Không có đơn giá ở tầng giao thức; chi phí nằm ở hạ tầng server và token hai đầu (E31) | Không thể điền cột chi phí từ nguồn gốc, chỉ đo được trong lab |
| Workflow Engine | Một lần chạy, bên trong là các state transition (E38, E40) | State transition, request, GB-second, execution, hoặc action (E38, E40, E73) | Đơn giá rẻ và đo được, nhưng không quy ra được tiền mỗi lần ghi thành công |
| Agent Orchestration | Một bước trong vòng lặp agent, tức một lần gọi model kèm quyết định chọn tool (E44, E47) | Token nhân với số bước, cộng phí runtime nếu chạy trên nền tảng quản lý (E29, E47) | Số bước không tất định, nên chi phí mỗi lần ghi là một khoảng, không phải một số |
| Event-driven Integration | Một event được phát, và một state transition ở phía consumer (E51, E53) | Broker instance-hour, GB-month, GB data-in, hoặc request trên một triệu (E56, E55) | Một lần ghi có thể sinh nhiều event, nên chi phí tỉ lệ với số event chứ không với số bản ghi |

Ba hệ quả trực tiếp:

1. So năm mô hình trên một điểm số duy nhất là sai đơn vị, và đó là lỗi đã làm file `04` bị kết luận không hợp lệ và bị xóa.
2. Cột chi phí chỉ so được sau khi quy về cùng một đơn vị là tiền mỗi lần ghi thành công, và đơn vị đó chỉ có được bằng đo, không có được bằng đọc bảng giá.
3. Cột mở rộng phải đọc theo giới hạn cứng có công bố của từng mô hình, vì mỗi mô hình bị chặn ở một chỗ khác nhau.

## 2. Tiêu chí lựa chọn

Phần này do người viết đặt, không lấy từ nguồn ngoài.
Nó phải được chốt trước khi chấm, và không được sửa sau khi thấy kết quả.

### 2.1. Tách cổng khỏi điểm

Có hai loại tiêu chí, và trộn chúng là lỗi phạm trù:

- **Cổng (đúng/sai):** SR1 đến SR8, áp lên **tổ hợp được chọn** chứ không áp lên từng mô hình riêng lẻ.
- **Điểm (so sánh được):** sáu tiêu chí ở mục 2.2, dùng để xếp thứ tự các tổ hợp đều đã qua cổng.

Báo cáo chính thức ngày 11/11/2026 đã cảnh báo đúng điều này: áp SR1-SR8 trực tiếp lên từng mô hình rồi loại khi thiếu một tiêu chí là sai phạm trù, vì gần như chắc chắn không mô hình nào qua.
Bảng ở mục 5 xác nhận điều đó bằng số: không mô hình nào có quá một ô `cung cấp sẵn`.

### 2.2. Sáu tiêu chí chấm điểm, theo thứ tự ưu tiên cố định

Thứ tự dưới đây là thứ tự quyết định, không phải danh sách tùy chọn.
Tiêu chí đứng trước thắng khi hai tổ hợp lệch nhau ở hai tiêu chí khác chiều.

| Mã | Tiêu chí | Câu hỏi | Đo bằng | Ứng với trục của chương trình |
| --- | --- | --- | --- | --- |
| C1 | Kiểm soát và bằng chứng | Sau khi ghép, còn bao nhiêu phần của SR1 đến SR5 và SR7 phải tự dựng, và dựng sai thì có nhìn thấy không | Số ô `không nói tới` cộng số phần phải tự viết, đếm trên bảng mục 5, cộng kết quả test quyền | Bảo mật |
| C2 | Chi phí mỗi lần ghi thành công | Một thay đổi được ghi hết bao nhiêu tiền, gồm cả phần phải chờ người duyệt | M3 của báo cáo 11/11, đo trên lab, không dùng giá niêm yết | Chi phí |
| C3 | Bảo trì | Đổi một luật quyền thì phải sửa mấy chỗ, và có bao nhiêu thành phần phải chạy | M5 cộng số thành phần đếm được ở các mục Bảo trì của mục 3.1 đến 3.5 | Bảo trì |
| C4 | Mở rộng | Từ 3 lên 30 tool thì cái gì vỡ trước, và có chạm giới hạn cứng có công bố không | M4, cộng các mục Mở rộng của mục 3.1 đến 3.5 | Khả năng mở rộng |
| C5 | Tái dùng tách khỏi quyền | Agent thứ hai dùng lại lớp tích hợp mà không thừa hưởng quyền, tốn bao nhiêu công | M6, cộng SR8 | Độ phù hợp với nhu cầu |
| C6 | Năng lực còn thiếu phải tự dựng | Mô hình mang lại sẵn được gì mà không mô hình nào khác trong tổ hợp bù được | Số ô `cung cấp sẵn` và `một phần` ở mục 5 | Ưu và nhược |

Điều kiện sàn, không cho điểm, không dùng để xếp hạng:

- M2 phải có 0 bản ghi trùng và 0 bản ghi mất, và đây là cổng chứ không phải điểm.
- M1 p95 chỉ dùng làm ngưỡng sàn, chốt sau khi có baseline; vượt ngưỡng thì loại tổ hợp, không trừ điểm.

Lý do đặt C1 trước C2: bài toán của Track 01 là ghi có kiểm soát, nên một tổ hợp rẻ mà không chứng minh được ai đã duyệt thì không dùng được, trong khi tổ hợp đắt mà chứng minh được vẫn dùng được ở quy mô lab.

### 2.3. Thang chấm

Mỗi tiêu chí chấm trên thang ba mức, và mỗi mức phải trỏ được về một dòng bằng chứng:

| Mức | Nghĩa | Điều kiện bắt buộc |
| --- | --- | --- |
| 2 | Có sẵn và kiểm được | Có câu trích hoặc một lần chạy chứng minh |
| 1 | Có một phần, phần còn lại tự dựng | Ghi rõ phần tự dựng là gì và tốn bao nhiêu |
| 0 | Phải tự dựng toàn bộ | Ghi rõ không có khái niệm này trong nguồn gốc |
| chưa chấm | Chưa có số công bố hoặc chưa đo | Không được quy thành 0, vì 0 là một khẳng định |

Ô `chưa chấm` không bị tính là 0 và không bị tính là 1, và nó ở lại trong bảng cho tới khi bước 06 đo được.
Một tổ hợp có nhiều ô `chưa chấm` không vì thế mà thắng; nó chỉ kém chắc chắn hơn.

### 2.4. Quy tắc loại

1. Tổ hợp vi phạm một ô cổng SR nào thì bị loại, và phải ghi rõ ô nào, bằng test nào.
2. Một mô hình đơn lẻ **không** bị loại vì thiếu SR, theo đúng cảnh báo ở mục 2.1.
3. Một mô hình đơn lẻ chỉ bị loại khi nó không mang lại năng lực nào mà bốn mô hình còn lại không bù được, và phải ghi rõ năng lực đó là gì.
4. Loại vì chi phí chỉ được làm sau khi có M3 đo được, vì giá niêm yết không đủ để loại.
5. Loại vì giới hạn cứng chỉ được làm khi giới hạn đó thấp hơn nhu cầu của lab, và phải nêu con số cùng mã nguồn.

### 2.5. Quy tắc hòa

Khi hai tổ hợp bằng điểm ở mọi tiêu chí:

1. Tổ hợp ít thành phần hơn thắng, vì C3 là bảo trì và ít thành phần là ít chỗ sai.
2. Nếu vẫn hòa, tổ hợp có ít ô `chưa chấm` hơn thắng, vì nó đo được nhiều hơn.
3. Nếu vẫn hòa, ghi lại là hòa và để bước 04 quyết bằng lập luận, có ghi lý do.

### 2.6. Điều gì làm đổi tiêu chí

Tiêu chí đổi được, nhưng chỉ khi có bằng chứng mới và phải ghi vào nhật ký revision:

- Nếu baseline cho thấy M1 vượt ngưỡng sàn ở mọi tổ hợp, hạ C1 xuống sau C2 và ghi lý do.
- Nếu M3 cho thấy chi phí hạ tầng chiếm hơn một nửa, đổi đơn vị đo sang tiền mỗi lần chạy thay vì mỗi lần ghi.
- Nếu bước 03 trả lời được câu Q6 của file 08 về chỗ đặt SR4, thêm một tiêu chí con vào C1.

### 2.7. Điều cấm

- Không đặt cột kỳ vọng trước khi có baseline.
- Không dùng giá niêm yết thay cho M3.
- Không cho điểm một ô `KHÔNG CÓ SỐ CÔNG BỐ`.
- Không cộng điểm của năm mô hình thành một bảng xếp hạng duy nhất.
- Không trích file `07` hay `08` như bằng chứng, vì cả hai chưa review.

## 3. So sánh sáu trục, mỗi mô hình một mục, mỗi trục một mục con

Bản 0.2 gộp năm mô hình vào năm cột của một bảng.
Bản 0.3 đổi sang một mục cho mỗi mô hình.
Bản 0.4 tách mỗi trục thành một mục con và viết lại phần chữ để mỗi ý đứng riêng một dòng.
Bản 0.5 thêm mục Cơ chế đặt trước bảy trục, viết lại Ưu và Nhược theo câu hỏi của trục, và thêm mục 3.6 nêu ca mà mô hình là lựa chọn sai.

Ba lý do cho cách trình bày hiện tại:

1. Đơn vị: năm mô hình không cùng đơn vị so sánh (mục 1), nên một bảng ngang năm cột mời người đọc so từng dòng như so cùng một đại lượng.
2. Độ đọc: mỗi ô của bảng cũ đã là một đoạn văn dài, nên cột hẹp làm câu trích và mã nguồn khó đọc trên bản in A4.
3. Độ dài ý: một trục của một mô hình thường có ba đến sáu ý riêng, và gộp chúng vào một ô làm ý yếu lẫn với ý mạnh.

Tám mục con cố định, cùng thứ tự ở cả năm mục: Cơ chế, Ưu, Nhược, Mở rộng, Chi phí, Bảo mật, Bảo trì, Phù hợp nhu cầu.
Ưu và Nhược là hai vế của cùng một trục, nên cách gọi "sáu trục" giữ nguyên.
Mục Phù hợp nhu cầu lặp lại kết quả của bảng phủ SR ở mục 5, để đọc một mục là đủ cho một mô hình.
Nghĩa chính xác của ba mức `cung cấp sẵn`, `một phần`, `không nói tới` còn chờ chốt ở bước 03, xem việc 3 ở mục 10.
Mỗi mục mở đầu bằng đơn vị so sánh và đơn vị giá của chính mô hình đó, lấy từ mục 1.
Chỉ hai mục con dùng bảng, là Mở rộng và Chi phí, và chỉ khi các giá trị trong bảng cùng đại lượng.
Không mục nào dưới đây chứa kết luận chọn, xếp hạng hay điểm số.

### 3.1. API / Function Calling

Đơn vị so sánh: một tool call, gồm một yêu cầu gọi hàm và một lượt trả kết quả về model (E24).
Đơn vị giá: token, nên chi phí một lần ghi phụ thuộc độ dài prompt chứ không phụ thuộc số lần gọi (E27, E29, E30).
Nguồn của mục này: E24 đến E30, E61.

#### 3.1.0. Cơ chế

Function calling giải đúng một bài toán: làm cho ý định gọi một hành động có thật đi ra khỏi model dưới dạng có cấu trúc, để mã ứng dụng chạy hành động đó.
Model không nhận quyền chạy code; nó phát ra một yêu cầu gồm tên hàm và tham số JSON rồi dừng, theo đúng câu của Anthropic: "The model never runs anything on its own. It emits a structured request, your code" (E25, `có câu trích`).
Cách làm là khai báo schema JSON cho từng hàm trong tham số `tools` của mỗi request, model chọn hàm, ứng dụng chạy hàm và gửi kết quả về bằng `function_call_output` hoặc `tool_result`, lặp tới khi `stop_reason` khác `tool_use` (E24, E25).
Khi số hệ thống tăng, mỗi cặp ứng dụng và hệ thống vẫn là một schema riêng cộng một handler riêng, nên công sức là n nhân m chứ không phải n cộng m; đây là `suy từ thiết kế` với tiền đề là đặc tả chỉ có đơn vị khai báo là từng hàm, và không có tầng đăng ký trung gian nào để gộp nhiều hệ thống thành một đơn vị.
Khi số tool tăng, mỗi schema nằm trong ngữ cảnh của mọi lượt và bị tính như token vào, nên chi phí và độ chính xác chịu áp lực trước khi chạm bất kỳ giới hạn cứng nào: "callable function definitions count against the model's context limit and are billed as input tokens" (E24, `có câu trích`).
Tool search xuất hiện đúng vì áp lực đó, và nó đổi cấu trúc chi phí mỗi lượt từ "toàn bộ schema nạp sẵn" thành "tên và mô tả của mọi thứ có thể tìm" cộng thêm ít nhất một bước tìm (E28, `có câu trích`).
Mô hình này không giải bốn bài toán còn lại: không có danh tính người yêu cầu, không có phạm vi quyền, không có khóa chống trùng, không có điểm dừng chờ người duyệt, nên cả bốn đều rơi vào mã ứng dụng (E24, E25, `suy từ thiết kế`).
Nói gọn: nó là hợp đồng giữa model và mã mình, không phải tầng thực thi, không phải tầng quyết định quyền, và không phải tầng bằng chứng.

#### 3.1.1. Ưu

- **Được gì:** hợp đồng đã có hình dạng cố định nên phần lập trình quanh nó ngắn; **Cho ai:** U3; **Quy mô:** một ứng dụng và một ít tool, không phải dựng thêm thành phần nào ngoài API key, SDK và một handler cho mỗi hệ thống (E24).
- **Được gì:** quyền chạy đúng thứ tự mình muốn, vì ứng dụng là bên gọi hệ thống nghiệp vụ; **Cho ai:** U3 và U2; **Quy mô:** lab, chèn một lần là xong cho mọi tool vì mọi tool đi qua cùng một chỗ gọi (E25).
- **Được gì:** một hình dạng lời gọi dùng lại được trên ba nhà cung cấp, nên không phải viết lại lớp gọi tool khi đổi nhà cung cấp; **Cho ai:** U3; **Quy mô:** một lớp tích hợp dùng cho vài agent (E24, E25, E26).
- **Được gì:** tham số có cấu trúc thay vì văn bản tự do, nên U4 kiểm được tham số trước khi chạy; **Cho ai:** U4; **Quy mô:** mọi quy mô, vì chuỗi kiểm không phụ thuộc số tool (E26).
- **Được gì:** đường ngắn nhất từ một yêu cầu tới một thay đổi có thật; **Cho ai:** U1; **Quy mô:** một yêu cầu một hành động, vì không có thành phần trung gian nào phải khởi động trước khi tool chạy (E24).
- **Được gì:** lớp tích hợp là mã thường, nên U5 dùng lại bằng cách gọi cùng handler; **Cho ai:** U5; **Quy mô:** hai agent, chi phí thêm gần như bằng không, nhưng phần quyền của agent thứ hai thì không đi kèm (E24, `suy từ thiết kế`).
- **Được gì:** chi phí giải thích được theo token chứ không theo lời gọi; **Cho ai:** U4 khi cần đối soát; **Quy mô:** mọi quy mô, vì mỗi lượt có số token vào ra đo được (E27, E29, E30).

#### 3.1.2. Nhược

- **Mất gì:** vòng lặp, vì model chỉ phát một yêu cầu rồi dừng; **Vỡ ở đâu trước:** lần chạy đầu tiên có nhiều hơn một bước, nếu chưa viết vòng lặp (E24, E25).
- **Mất gì:** độ trễ, vì mỗi lời gọi là ít nhất một lượt khứ hồi; **Vỡ ở đâu trước:** p95 khi một yêu cầu cần vài bước, trước cả khi tool nào hỏng (E25).
- **Mất gì:** phần quyền, vì đặc tả không có chủ thể và không có phạm vi; **Vỡ ở đâu trước:** handler đầu tiên mà người viết quên kiểm, và vỡ nhanh hơn khi số tool tăng vì mỗi handler là một chỗ kiểm riêng (`suy từ thiết kế`).
- **Mất gì:** khả năng chống trùng, vì lời gọi chỉ có `call_id`, `name` và `arguments`; **Vỡ ở đâu trước:** ca retry sau khi mất phản hồi, đúng ca mà SR6 nhắm tới (E24).
- **Mất gì:** độ chính xác khi số tool tăng, trước khi có lỗi cứng; **Vỡ ở đâu trước:** khoảng 20 tool với OpenAI và 10 đến 20 tool với Google, nơi triệu chứng là gọi sai hàm và điền sai tham số chứ không phải lỗi 500 (E24, E26).
- **Mất gì:** tính êm khi schema phức tạp, vì Gemini từ chối cả request bằng `400 INVALID_ARGUMENT` khi độ phức tạp gộp vượt giới hạn; **Vỡ ở đâu trước:** lúc thêm tool nhiều tham số hoặc nhiều enum (E26).
- **Mất gì:** điểm dừng bền, vì đặc tả không có primitive chờ người duyệt; **Vỡ ở đâu trước:** khi tiến trình chết giữa lúc chờ, hoặc khi người duyệt bấm duyệt sau khi tham số đã đổi (`suy từ thiết kế`).

#### 3.1.3. Mở rộng

Mở rộng ở mô hình này là chuyện số tool và số lượt trong một vòng lặp.

- Không có số tool tối đa công bố như một giới hạn cứng (`KHÔNG CÓ SỐ CÔNG BỐ`, 2026-11-13), vì cả ba trang đã mở không nêu trần cứng nào cho số hàm trong một request.
- Có ba con số mềm, không phải trần cứng, và cả ba cùng đại lượng là số tool được khuyến nghị trong một lượt.

| Nguồn | Số tool khuyến nghị | Mức ràng buộc |
| --- | --- | --- |
| OpenAI, đầu một lượt (E24) | ít hơn 20 | mềm, "just a soft suggestion" |
| Google, tập tool đang bật (E26) | 10 đến 20 | mềm, nằm trong thực hành tốt |
| OpenAI, mỗi namespace (E28) | ít hơn 10 | mềm, để tiết kiệm token và giữ hiệu năng |

- Tool search chỉ có trên một số model: "In the Responses API, only `gpt-5.4` and later models support `tool_search`" (E28, `có câu trích`).
- Vòng lặp phía server của Anthropic có giới hạn, vượt thì trả `pause_turn` (E25).
- Trần thật ở Gemini là độ phức tạp schema chứ không phải số tool, và vượt thì trả `400 INVALID_ARGUMENT` (E26).
- Khi số hệ thống tăng, số tích hợp là n nhân m, và không có cơ chế nào trong đặc tả làm nó thành n cộng m (`suy từ thiết kế`).

#### 3.1.4. Chi phí

Chi phí ở mô hình này chỉ có số theo token, nên mức giá dưới đây đều tính trên một triệu token.

- gpt-6.1-sol: 2,00 USD mỗi triệu token vào và 10,00 USD mỗi triệu token ra (E27).
- Claude Sonnet 5: cùng mức 2,00 USD mỗi triệu token vào và 10,00 USD mỗi triệu token ra (E29).
- Gemini 3.1 Flash Lite ở bậc Standard: 0,25 USD mỗi triệu token vào (E30).
- Gemini 3.1 Flash Lite ở bậc Batch và Flex: 0,125 USD mỗi triệu token vào (E30).
- Định nghĩa hàm được tính như token vào, nên thêm tool là thêm tiền ở mọi lượt chứ không chỉ ở lượt gọi tool (E24).
- Không có đơn giá theo lời gọi tool trên cả ba bảng giá, nên tiền mỗi lần ghi thành công vẫn `KHÔNG CÓ SỐ CÔNG BỐ` (2026-11-13).

#### 3.1.5. Bảo mật

Bảo mật ở mô hình này không nằm trong đặc tả lời gọi hàm mà nằm ở phía ứng dụng.

- Model không chạy gì, nên mọi kiểm soát phải đặt ở ứng dụng (E25).
- Đặc tả không có danh tính người yêu cầu, cũng không có phạm vi quyền (E24).
- Tool search làm tập tool khả dụng thay đổi lúc chạy (E28).
- Không có tài liệu chống prompt injection trong các trang đã mở (`KHÔNG CÓ SỐ CÔNG BỐ`, 2026-11-13).
- Khi thiếu tham số bắt buộc, model có thể tự suy một giá trị hợp lý thay vì hỏi lại, nên validate trước khi ghi là bắt buộc (E61).
- Cơ chế hẹp duy nhất ở tầng tập tool là `tool_choice` với `allowed_tools`: nó giới hạn tập hàm được gọi trong lượt, nhưng không nói ai được gọi hàm đó (E24, `suy từ thiết kế`).

#### 3.1.6. Bảo trì

Bảo trì ở mô hình này dồn vào mã ứng dụng và SDK, vì không có thành phần trung gian nào phải vận hành.

- Không có server phải vận hành, chỉ có SDK và một API key.
- Đổi schema tool là đổi mã ứng dụng, không phải một bước cấu hình trung tâm (`suy từ thiết kế`).
- Nâng lên tool search ràng buộc vào phiên bản model (E28).
- Ba nhóm tool theo nơi thực thi, nên gỡ lỗi phải nắm cả ba đường (E25).
- Đếm thành phần: endpoint của nhà cung cấp, API key, SDK hoặc HTTP client, tiến trình ứng dụng, cộng m handler; bốn thành phần cộng m handler, và không có server nào của mình phải chạy (`suy từ thiết kế`).
- Đổi một luật quyền: nếu đặt phép kiểm ở một chỗ trong vòng lặp thì là một chỗ, nhưng nếu kiểm trong từng handler thì là m chỗ, và cách thứ hai là cách mà cấu trúc schema dễ dẫn tới (`suy từ thiết kế`).

#### 3.1.7. Phù hợp nhu cầu

Mức cao nhất mô hình này đạt được là `một phần`, ở SR3, SR6 và SR8.

- `cung cấp sẵn`: không có SR nào.
- `một phần`: SR3 phạm vi theo trường và bản ghi, SR6 chống ghi trùng, và SR8 tái dùng tách khỏi quyền.
- Phần còn thiếu của SR6 là khóa chống trùng, vì mô hình không có idempotency key (E24).
- `không nói tới`: SR1, SR2, SR4, SR5 và SR7.
- SR2 gần lên `một phần` nhờ `tool_choice` với `allowed_tools`, nhưng cơ chế đó chỉ giới hạn tập hàm chứ không nói ai được gọi, nên vẫn giữ `không nói tới` (E24, `suy từ thiết kế`).

### 3.2. MCP

Đơn vị so sánh: một message JSON-RPC `tools/call` mang `name` và `arguments` (E35).
Đơn vị giá: không có ở tầng giao thức; chi phí nằm ở hạ tầng server và token hai đầu (E31).
Nguồn của mục này: E31 đến E35, E57 đến E60.

#### 3.2.0. Cơ chế

MCP giải bài toán nối nhiều ứng dụng AI với nhiều hệ thống nguồn bằng một giao thức chung, thay vì mỗi cặp ứng dụng và hệ thống phải có một connector riêng.
Cách làm là tách vai rõ: host tạo đúng một client cho mỗi server, server tự khai báo phiên bản và năng lực qua `server/discover`, rồi nhận lời gọi bằng JSON-RPC 2.0 với `tools/call` mang `name` và `arguments` (E59, E35).
Khi số hệ thống tăng thêm một, đại lượng tăng là số server và số client bên trong host, còn hợp đồng giữa client và server không đổi, nên công tích hợp cộng thêm một lần thay vì nhân với số ứng dụng.
Đây là chỗ đổi n nhân m thành n cộng m: một server cho mỗi hệ thống, một client cho mỗi cặp host và server, và mọi client nói cùng giao thức dùng lại được server đó (E57, E58, E59, `suy từ thiết kế`).
Chuẩn hóa schema là cơ chế đi kèm: `inputSchema` và `outputSchema` là JSON Schema, nên cùng một server phục vụ nhiều client mà không phải viết lại hợp đồng cho từng client (E35).
Khi số tool trong một server tăng, đại lượng tăng là mảng tool đưa vào ngữ cảnh model, và chính chỗ đó sinh ra phân trang `cursor`, cache bằng `ttlMs` và `cacheScope`, progressive discovery, và va chạm tên khi host gộp nhiều server (E35, E59).
MCP không giải bài toán quyết định: không có policy engine, không có điểm dừng duyệt gắn hash tham số, không có khóa idempotency cho `tools/call`, và không có state handle ở tầng giao thức (E35, E59, `có câu trích` cho câu "The protocol has no concept of a state handle").
Ranh giới đó do tài liệu kiến trúc nói thẳng: "MCP focuses solely on the protocol for context exchange" và "it does not dictate how AI applications use LLMs or manage the provided context" (E59, `có câu trích`).

#### 3.2.1. Ưu

- **Được gì:** một lần viết server, nhiều client dùng lại mà không phải viết lại lớp tích hợp; **Cho ai:** U3 là chính, U5 hưởng trực tiếp; **Quy mô:** nhiều client trên một hệ thống, vì server HTTP thường phục vụ nhiều client (E57, E59).
- **Được gì:** đổi số connector từ n nhân m thành n cộng m; **Cho ai:** U3; **Quy mô:** nhiều hệ thống nhân nhiều client; ở lab 2 hệ thống và 1 client thì 2 cộng 1 lớn hơn 2 nhân 1, tức lợi ích gần bằng không và mô hình còn đắt hơn vì phải chạy thêm tiến trình server (E58, `suy từ thiết kế`).
- **Được gì:** hợp đồng dữ liệu chuẩn hóa thay vì hợp đồng riêng cho từng client, vì `inputSchema` và `outputSchema` là JSON Schema; **Cho ai:** U3 viết một lần, U4 có chỗ kiểm; **Quy mô:** số client tăng thì số hợp đồng phải viết không tăng theo (E35).
- **Được gì:** quyền tách khỏi kết nối, nên client thứ hai dùng lại server mà không thừa hưởng quyền của client thứ nhất; **Cho ai:** U5 và U4; **Quy mô:** nhiều client và nhiều người dùng trên cùng một server, vì mỗi request mang credential riêng và danh sách tool có thể lọc theo quyền của người gọi (E33, E35).
- **Được gì:** danh sách tool có tín hiệu thay đổi và có hạn cache, nên host không phải hỏi lại liên tục; **Cho ai:** U1 thấy ít độ trễ hơn, U4 thấy được lúc nào danh sách đã cũ; **Quy mô:** nhiều server, vì `ttlMs` và `cacheScope` có trên kết quả `tools/list` (E32, E35).
- **Được gì:** năng lực mới đi qua extension thay vì làm phình lõi; **Cho ai:** U3, khi cần Tasks hay Apps mà không muốn chờ revision lõi; **Quy mô:** nhiều client và nhiều server cùng lúc, nhưng chỉ khi hai bên cùng bật cùng một extension (E60).
- **Được gì:** trace đi xuyên qua `_meta` bằng `traceparent`, `tracestate`, `baggage`; **Cho ai:** U4, khi phải dựng lại một lời gọi đã đi qua nhiều server; **Quy mô:** nhiều server trong một trace (E32).

#### 3.2.2. Nhược

- **Mất gì:** khả năng "viết một lần rồi quên", vì mỗi revision lõi là một lần đồng bộ hai đầu; **Vỡ ở đâu trước:** client cũ gặp server mới, hoặc ngược lại. **Khi nào vỡ:** ngay khi nâng revision, vì 2026-07-28 bỏ `initialize`, bỏ `Mcp-Session-Id` và đổi mã lỗi (E32).
- **Mất gì:** phục hồi lời gọi đang bay khi stream đứt; **Vỡ ở đâu trước:** các lời gọi ghi, nơi gửi lại không vô hại. **Khi nào vỡ:** mạng chập chờn hoặc proxy cắt kết nối, vì "A broken response stream loses the in-flight request; clients MUST re-issue it as a new request with a new request ID" (E32).
- **Mất gì:** quyền tin vào mô tả hành vi của tool; **Vỡ ở đâu trước:** server bên thứ ba hoặc server bị chiếm. **Khi nào vỡ:** khi host lấy `annotations` làm luật duyệt, vì "clients MUST consider tool annotations to be untrusted unless they come from trusted servers" (E35).
- **Mất gì:** biểu đạt quyền theo trường và theo bản ghi; **Vỡ ở đâu trước:** yêu cầu "chỉ được sửa trường lương của bản ghi cùng phòng ban". **Khi nào vỡ:** khi audit hỏi ai được sửa trường nào, vì scope là chuỗi phẳng do server định nghĩa (E33, `suy từ thiết kế`).
- **Mất gì:** chống ghi trùng ở tầng giao thức; **Vỡ ở đâu trước:** bước ghi khi client tự retry sau timeout. **Khi nào vỡ:** khi mạng chậm hơn timeout, vì `tools/call` không có trường khóa idempotency (E35, `suy từ thiết kế`).
- **Mất gì:** một mức năng lực chung giữa các client; **Vỡ ở đâu trước:** client không bật extension mà server cần. **Khi nào vỡ:** khi thiết kế dựa vào Tasks hay Apps, vì "Extensions are always disabled by default and require explicit opt-in from the developer, at every stage" (E60).
- **Mất gì:** ngữ cảnh cho model khi số server tăng; **Vỡ ở đâu trước:** cửa sổ ngữ cảnh, rồi tới độ chính xác chọn tool. **Khi nào vỡ:** khi host gộp nhiều server, vì tên tool chỉ duy nhất trong một server và client gộp nhiều server có thể gặp va chạm tên (E35, E59).

#### 3.2.3. Mở rộng

Mở rộng của MCP đọc qua những gì đặc tả quy định cho việc liệt kê và đặt tên tool, và qua những gì đặc tả không đặt trần.

- `tools/list` phân trang bằng cursor, có `ttlMs` và `cacheScope` (E35).
- Tên tool SHOULD dài 1 đến 128 ký tự (E35).
- Tên tool SHOULD duy nhất trong một server, không phải duy nhất toàn hệ (E35).
- Số tool, số bước hay thời lượng tối đa đều `KHÔNG CÓ SỐ CÔNG BỐ` (2026-11-13).
- Server SHOULD trả tool theo thứ tự tất định, và lý do được nêu rõ là để client cache danh sách và tăng tỉ lệ cache prompt (E35).
- Khi host gộp nhiều server, tên tool có thể trùng, nên client hoặc proxy SHOULD tự đặt chiến lược phân biệt, ví dụ thêm tiền tố tên server; `serverInfo` name không được bảo đảm duy nhất nên SHOULD NOT dùng để phân biệt (E35).
- Tập tool trả về cho một client có thể khác nhau theo quyền, nên trục mở rộng không chỉ là số tool mà còn là số tổ hợp quyền nhìn thấy các tập tool khác nhau (E35).
- Khi số server nhiều, tài liệu client khuyên chuyển sang progressive discovery với ngưỡng theo phần trăm cửa sổ ngữ cảnh, ví dụ 1 phần trăm đến 5 phần trăm (E59).
- Extension là opt-in và tắt mặc định, nên số năng lực mà một client thấy được phụ thuộc cấu hình của client, không chỉ số server được bật (E60).
- Thêm hoặc bớt định nghĩa tool giữa cuộc hội thoại làm mất cache prefix, nên tài liệu khuyên nối thêm định nghĩa sau điểm cắt cache thay vì sắp xếp lại mảng `tools` (E59).

#### 3.2.4. Chi phí

Chi phí của MCP không có đơn giá ở tầng giao thức, nên mục này chỉ ghi được chỗ chi phí thật sự phát sinh.

- Không có bảng giá và không có free tier (E31).
- Không có đơn giá cho một lần gọi tool (E31, E35).
- Chi phí thật nằm ở hạ tầng server và token hai đầu.
- Định nghĩa tool nằm trong ngữ cảnh model, nên chi phí token tăng theo số tool và số server được bật; nạp tất cả định nghĩa tool làm tốn token, tăng độ trễ và giảm hiệu năng model (E59).
- Thứ tự tất định của `tools/list` không làm giảm giá, nhưng nó là điều kiện để cache prompt hoạt động, nên nó đổi số token bị tính lại khi danh sách tool không đổi (E35).
- Không có số: tiền mỗi lần ghi thành công, tiền mỗi `tools/call`, tiền hạ tầng một server, p50 và p95 độ trễ; tất cả là `KHÔNG CÓ SỐ CÔNG BỐ` tại ngày 2026-11-13, và phải đo ở bước 06.

#### 3.2.5. Bảo mật

Bảo mật của MCP nằm ở giao thức xác thực, ở ràng buộc token và ở mã lỗi trả về.

- OAuth 2.1 với PKCE và metadata discovery khi bật HTTP (E33).
- Server là OAuth resource server, client là OAuth client, hai vai tách rõ (E33).
- Resource indicator theo RFC 8707 là bắt buộc, nên token buộc vào đúng server đích (E33).
- Server phải từ chối token không phát hành cho chính nó: "MCP servers MUST NOT accept or transit any other tokens" (E33), và "MCP servers MUST NOT accept any tokens that were not explicitly issued for the MCP server" (E34).
- Token passthrough bị cấm ở mức MUST NOT, vì nó làm mất khả năng quy trách nhiệm và mất audit trail (E34).
- Annotation của tool không được tin: "clients MUST consider tool annotations to be untrusted unless they come from trusted servers" (E35).
- Không định nghĩa fail-closed ở tầng policy, chỉ có mã 401, 403, 400 và `insufficient_scope` (E33).
- Scope do server tự định nghĩa, không theo trường hay bản ghi; scope có thể được tính động từ tham số request, nhưng vẫn không có ngữ pháp scope theo trường (E33, `suy từ thiết kế`).
- Phần phải dựng thêm: host dựng consent UI, điểm duyệt, sandbox và log kiểm toán; server dựng kiểm quyền theo từng lời gọi, gắn handle vào người dùng, validate input và rate limit (E34, E35).

#### 3.2.6. Bảo trì

Bảo trì của MCP là bám revision, vì mỗi revision đổi những gì server và client phải làm.

- 2026-07-28 bỏ session, bỏ handshake, đổi mã lỗi (E32).
- Đã có một lần phá vỡ tương thích giữa 2025-11-25 và 2026-07-28, nên phải chạy song song hai revision (E32).
- Có cơ chế feature lifecycle và deprecation, với cửa sổ deprecation tối thiểu 12 tháng (E32).
- Số bước cấu hình tối thiểu `KHÔNG CÓ SỐ CÔNG BỐ` (2026-11-13).
- Đếm thành phần phải chạy cho lab 2 hệ thống: 1 host, 2 client trong host, 2 server, 1 authorization server, cộng SDK ở mỗi đầu; tối thiểu 6 thành phần, chưa tính egress proxy nếu chặn SSRF (`suy từ thiết kế`).
- Đổi một luật quyền chạm 5 chỗ: scope trả về, lọc `tools/list`, cộng scope ở client, audience của token, và hàm kiểm trong tool handler; chỉ hai chỗ đầu thuộc giao thức (E33, E35, `suy từ thiết kế`).
- Extension có ba giai đoạn Experimental, Beta và Stable; extension ở Beta có thể đổi phá vỡ, còn extension Stable thì bất biến trong một revision lõi (E60).
- Nghĩa vụ mới trên mọi đường gọi: vì không còn handshake, mỗi request phải tự mang `protocolVersion` và `clientCapabilities` trong `_meta` (E32, E59).
- Extension có ba giai đoạn Experimental, Beta và Stable; extension ở Beta có thể đổi phá vỡ, còn extension Stable thì bất biến trong một revision lõi, và mọi extension tắt mặc định (E60).

#### 3.2.7. Phù hợp nhu cầu

Mức cao nhất MCP đạt được là `cung cấp sẵn`, và chỉ ở SR8.

- `cung cấp sẵn`: SR8.
- `một phần`: SR1, SR2, SR3, SR5 và SR7.
- Phần còn thiếu của năm yêu cầu đó là: danh tính người yêu cầu trong luồng ghi, quyền kiểm ở tầng thực thi, phạm vi theo trường và bản ghi, quy tắc từ chối khi không xác định, và trace đủ để dựng lại.
- `không nói tới`: SR4 và SR6.
- SR6 giữ `không nói tới` vì giao thức không định nghĩa khóa chống trùng cho `tools/call`; server tự cấp handle và tự chống trùng, nhưng cơ chế đó thuộc server chứ không thuộc giao thức (E32, E35).
- SR3 giữ `một phần` vì scope có thể tính động từ tham số request nhưng vẫn không có ngữ pháp scope theo trường hay bản ghi (E33).
- SR7 giữ `một phần` vì E32 có quy ước truyền trace context qua `_meta`, nhưng đó là quy ước ghi tài liệu, không phải bảo đảm (E32).

### 3.3. Workflow Engine

Đơn vị so sánh: một lần chạy, bên trong là các state transition (E38, E40).
Đơn vị giá: state transition, request, GB-second, execution, hoặc action (E38, E40, E73).
Nguồn của mục này: E36 đến E43, E62 đến E65, E71, E73.

#### 3.3.0. Cơ chế

Workflow engine giải bài toán thời gian và phục hồi của một quy trình nhiều bước: giữ trạng thái qua một khoảng chờ có thể dài hàng ngày, và chạy tiếp đúng chỗ đã dừng sau khi tiến trình chết.
Cách làm là tách đôi mã: phần quyết định nằm trong workflow và phải tất định, mọi lời gọi ra ngoài được đẩy vào activity, và nền tảng ghi từng command cùng event tương ứng vào một Event History có thứ tự, nên durable execution nghĩa là trạng thái sống ngoài tiến trình chứ không nằm trong bộ nhớ của nó (E36, E65).
Khi chết, một worker khác đọc Event History, chạy lại mã quyết định để dựng lại biến cục bộ rồi đi tiếp; replay chỉ chạy lại phần quyết định, còn kết quả của các lời gọi ra ngoài lấy từ lịch sử chứ không gọi lại (E36, E65).
Điểm chờ người duyệt là một lời gọi chờ điều kiện trong workflow: mã treo ở đó, một handler nhận signal đổi trạng thái để điều kiện thành đúng, và workflow đi tiếp, nên không phải dựng bộ lập lịch hay vòng poll nào (E37, E65).
Signal không mang danh tính người yêu cầu vì payload của nó là một cấu trúc dữ liệu do người gọi tự định nghĩa, và lời gọi còn trả về khi server nhận chứ không chờ workflow xử lý (E37, `suy từ thiết kế`).
Khi số hệ thống tăng, đại lượng đổi là số activity trong một definition, không phải số khung chạy: thêm một hệ thống là thêm một activity hoặc một state, còn nền tảng vẫn là một (E36, E62, `suy từ thiết kế`).
Khi số bước hoặc thời lượng tăng, ba đại lượng bị chặn là tiền, kích thước lịch sử và trần thời lượng của dịch vụ đang dùng; khi số tool tăng thì không đại lượng nào của mô hình đổi, vì mô hình không có bước chọn tool, không có khái niệm quyền theo trường và bản ghi, và không tự gắn danh tính người yêu cầu vào lần chạy (E39, E40, E71, `suy từ thiết kế`).

#### 3.3.1. Ưu

- **Được gì:** một điểm chờ hạng nhất thay vì một bộ lập lịch tự dựng, vì workflow treo ở điều kiện chờ và chỉ đi tiếp khi handler nhận signal; **Cho ai:** U2; **Quy mô:** một lượt chờ tính bằng ngày tới tháng, không phải một lượt hỏi đáp ngắn (E37).
- **Được gì:** một bản ghi có thứ tự của mọi việc đã xảy ra, kèm activity nào lỗi và lỗi gì; **Cho ai:** U4; **Quy mô:** dựng lại đường đi của một lần ghi trong cửa sổ lưu giữ; AWS Standard giữ 90 ngày còn Express thì không ghi lịch sử chạy (E39, E65).
- **Được gì:** thêm một hệ thống bằng cách thêm một activity hoặc một state, không thêm thành phần phải vận hành; **Cho ai:** U3; **Quy mô:** từ 3 lên 30 hệ thống vẫn là một khung chạy với 30 bước (E36, E62, `suy từ thiết kế`).
- **Được gì:** không phải tự viết retry, timeout và heartbeat cho từng lời gọi, vì chúng là cấu hình của activity chứ không phải mã; **Cho ai:** U3; **Quy mô:** phần xử lý lỗi không nhân lên theo số hệ thống (E65).
- **Được gì:** người yêu cầu không phải gửi lại yêu cầu khi tiến trình chết hoặc khi phải chờ dài, vì lần chạy đã nhận thì chạy tới cùng; **Cho ai:** U1; **Quy mô:** quy trình nhiều bước, có chờ (E65).
- **Được gì:** với AWS Standard, start trùng tên và trùng input trả lại đúng phản hồi của lần trước thay vì tạo lần chạy thứ hai, nên bản ghi kiểm tra không bị đôi ở tầng start; **Cho ai:** U4; **Quy mô:** mọi lần start có tên nghiệp vụ, với điều kiện tên chỉ được tái dùng sau 90 ngày kể từ khi lần chạy đóng (E63).
- **Được gì:** agent thứ hai dùng lại cùng một Workflow Type với một Workflow Id khác, không phải viết lại lớp tích hợp; **Cho ai:** U5; **Quy mô:** nhiều lần chạy trên cùng một definition (E36, E64).

#### 3.3.2. Nhược

- **Mất gì:** tự do viết mã, vì mọi lời gọi ra ngoài phải thành activity và mọi nhánh phụ thuộc thời gian hay số ngẫu nhiên phải đi qua API của SDK; **Vỡ ở đâu trước:** lời gọi API hoặc truy vấn cơ sở dữ liệu viết trực tiếp trong workflow, tức ở lần replay đầu tiên (E36).
- **Mất gì:** quyền sửa definition tùy ý khi đang có lần chạy, vì đổi thứ tự command làm lần chạy đang mở trả lỗi non-deterministic; **Vỡ ở đâu trước:** những lần chạy sống lâu nhất, và vỡ đúng lúc deploy (E36).
- **Mất gì:** tín hiệu "đã xử lý" ở phía người gửi signal, vì lời gọi trả về khi server nhận, không chờ workflow xử lý; **Vỡ ở đâu trước:** màn hình duyệt khi worker đang chết hoặc task queue đang nghẽn (E37).
- **Mất gì:** tính đúng một lần ở Express bất đồng bộ, vì mỗi bước chạy ít nhất một lần nên có thể chạy hai lần; **Vỡ ở đâu trước:** bước ghi không idempotent, và vỡ mỗi khi có retry (E39).
- **Mất gì:** chống trùng ở tầng tác dụng phụ, vì idempotent của StartExecution chỉ so tên và input ở tầng start; **Vỡ ở đâu trước:** hai lần chạy khác tên cùng ghi một bản ghi vẫn lọt; gửi lại với tham số đã sửa thì tên trùng mà input khác và API trả 400 (E63, `suy từ thiết kế`).
- **Mất gì:** chống trùng trên Express, vì StartExecution không idempotent với Express; **Vỡ ở đâu trước:** mỗi lần gửi lại start tạo thêm một lần chạy (E63).
- **Mất gì:** chỗ chứa khi quy trình dài, vì lịch sử chặn ở 51.200 event hoặc 50 MB và phải Continue-As-New; **Vỡ ở đâu trước:** vòng lặp nhiều bước, không vỡ ở quy trình vài bước (E71, E64).
- **Mất gì:** thời gian chờ người trên Express, vì trần 5 phút; **Vỡ ở đâu trước:** một lượt chờ duyệt vượt 5 phút là vỡ hẳn chứ không phải chậm (E39).

#### 3.3.3. Mở rộng

Trục này đọc giới hạn cứng mà từng dịch vụ công bố, trước hết là trần thời lượng trong bảng dưới.

| Dịch vụ | Trần thời lượng | Nguồn |
| --- | --- | --- |
| AWS Step Functions Standard | Tối đa 1 năm | E39 |
| AWS Step Functions Express | Tối đa 5 phút | E39 |
| Inngest, theo gói | 30, 90, 366 ngày | E40 |

- AWS giữ history của lần chạy 90 ngày (E39).
- AWS ghi rõ lịch sử Express không được Step Functions thu thập, phải bật log CloudWatch (E39).
- Inngest cho 5, 100, 500 bước song song theo gói (E40).
- Inngest ghi "Maximum run length" là tổng thời gian sống của một function run, gồm cả sleep và wait, nên trần này tính cả thời gian chờ người duyệt (E40).
- Temporal `KHÔNG CÓ SỐ CÔNG BỐ` cho trần thời lượng, vì trang timeout cũ trả 404 và trang timeout hiện hành chỉ nói người dùng tự đặt timeout, không nêu trần của nền tảng (E43).
- Event History của Temporal chặn ở 51.200 event hoặc 50 MB, cảnh báo từ 10.240 event hoặc 10 MB (E71).
- Số activity, child workflow, signal hoặc yêu cầu hủy còn dở trong một lần chạy chặn ở 2.000 cho mỗi loại (E71).
- Kích thước input của một lần start trên AWS chặn ở 262.144 byte, và tên lần chạy dài 1 đến 80 ký tự (E63).
- Số tool tối đa `KHÔNG CÓ SỐ CÔNG BỐ`, vì tool không phải khái niệm của mô hình (E36, E62, E65).

#### 3.3.4. Chi phí

Chi phí của mô hình này tính trên đơn vị bên trong lần chạy, và bảng dưới gom bốn mức giá theo dịch vụ và gói.

| Dịch vụ và gói | Mức giá | Nguồn |
| --- | --- | --- |
| AWS Step Functions Standard | 0,000025 USD mỗi state transition | E38 |
| AWS Step Functions Express | 1,00 USD mỗi triệu request | E38 |
| Inngest Pro | 99 USD gồm 1 triệu execution | E40 |
| Inngest Business | 499 USD gồm 10 triệu execution | E40 |

- AWS Standard có free tier 4.000 mỗi tháng (E38).
- Express cộng thêm 0,00001667 USD mỗi GB-second ngoài phần request (E38).
- Temporal Cloud tính theo action: 50 USD mỗi triệu action ở bậc Pay-As-You-Go, 25 USD mỗi triệu action ở bậc giảm giá tự phục vụ; lưu trữ 0,042 USD mỗi GB-giờ cho active storage (E73).
- Gói Business của Temporal Cloud khởi điểm 500 USD mỗi tháng, gồm 2,5 triệu action và 2,5 GB active storage (E73).
- AWS tính thêm một state transition cho mỗi lần retry, nên lỗi làm tăng tiền chứ không chỉ làm tăng thời gian (E38).
- Tiền mỗi lần ghi thành công vẫn `KHÔNG CÓ SỐ CÔNG BỐ` cho cả mô hình, vì giá tính theo bước, action hoặc request chứ không theo bản ghi (E38, E40, E73).

#### 3.3.5. Bảo mật

Bảo mật ở mô hình này là chuyện nó có khái niệm nào để hỏi ai được làm gì trên bản ghi nào, và câu trả lời có nằm lại trong lịch sử chạy không.

- Không có khái niệm kiểm quyền theo trường và bản ghi (E36, `suy từ thiết kế`).
- Khái niệm trung tâm của mô hình chỉ là state, transition, activity và signal (E36, E62, `suy từ thiết kế`).
- Execution history không ghi quyết định phân quyền: nó ghi command và event, không có loại event nào cho một quyết định cho phép hay từ chối theo bản ghi (E39, E65, `suy từ thiết kế`).
- Signal không mang danh tính người yêu cầu (E37, `suy từ thiết kế`).
- Định nghĩa user task của BPMN vẫn chưa trích được, vì bản PDF chỉ trích xuất được 100 trang đầu trên 532 hoặc 538 trang, còn mục 10.3.4 nằm ở trang 163 (E41, E42).
- Workflow Id là định danh nghiệp vụ lưu dạng văn bản thuần, không đi qua payload codec, và hiện trong Web UI, CLI, Event History cùng system log; tài liệu cấm đưa dữ liệu nhạy cảm, bí mật hoặc PII vào đó (E64).
- không được lấy email hay mã nhân viên của người duyệt làm Workflow Id hay làm tên signal, vì hai chỗ đó đều bị ghi vào lịch sử (E64, `suy từ thiết kế`).
- Update có validator chạy trước khi ghi History và có thể từ chối bằng cách ném lỗi, nhưng validator không được phép `async`, nên không dùng nó để đọc cơ sở dữ liệu kiểm quyền được (E37).
- Cơ chế có sẵn: điểm chờ, ghi lịch sử, chống trùng ở tầng start, và một hook từ chối Update.
- Cơ chế không có: gắn danh tính đã xác thực vào lần chạy, kiểm quyền theo bản ghi, ghi quyết định phân quyền thành event, và từ chối khi không xác định được.
- Ai phải dựng phần thiếu: ứng dụng, tức U3, phải dựng binding danh tính, đặt phép kiểm quyền trong activity, quyết định đưa gì vào Workflow Id và payload signal, và tự chọn cách ghi lại quyết định đó (E65, `suy từ thiết kế`).

#### 3.3.6. Bảo trì

Bảo trì ở mô hình này xoay quanh việc định nghĩa workflow đổi trong khi vẫn còn lần chạy đang mở.

- Cần quy trình versioning và replay test, vì đổi thứ tự command làm lần chạy đang mở gặp lỗi non-deterministic (E36).
- Kiểu workflow của AWS không sửa được sau khi tạo (E39).
- Hai ngữ nghĩa exactly-once và at-least-once phải giám sát khác nhau (E39).
- Số thành phần tối thiểu của cụm Temporal `KHÔNG CÓ SỐ CÔNG BỐ` (E43).
- Đếm thành phần phải chạy, theo ba lựa chọn: AWS Step Functions là 0 thành phần tự vận hành, Inngest Cloud là 0 hạ tầng, Temporal tự dựng là nhiều nhất (E62, E40).
- Temporal tự dựng có 4 service phải chạy là Frontend, History, Matching và Worker Service, cộng một lớp lưu trữ chọn trong Cassandra, MySQL, PostgreSQL hoặc SQLite, cộng Elasticsearch nếu cần Visibility nâng cao (E65).
- Chỗ phải sửa khi đổi một luật quyền: luật đó nằm trong workflow definition hoặc trong activity, nên số chỗ sửa bằng số definition có nhúng luật ấy, nhân với số version đang chạy song song, vì mỗi lần chạy bị ghim vào version worker đã khởi động nó (E65, `suy từ thiết kế`).
- Loại nâng cấp gây vỡ: đổi thứ tự command, đổi kiểu hoặc ID của child workflow và activity, đổi thời lượng timer từ hoặc về 0, và đổi việc dùng API sinh command mà không patch (E36).
- Nâng cấp SDK không làm vỡ lần chạy đang mở nếu dùng Worker Versioning, vì cơ chế đó ghim mỗi lần chạy vào version worker đã khởi động nó; không dùng thì phải patch (E65, E36).

#### 3.3.7. Phù hợp nhu cầu

Mức cao nhất mô hình này đạt được là `một phần`, ở SR1, SR2, SR4, SR6, SR7 và SR8.

- `cung cấp sẵn`: không có SR nào.
- `một phần`: SR1, SR2, SR4, SR6, SR7 và SR8.
- `không nói tới`: SR3 và SR5.
- SR1 `một phần`: Workflow Id là định danh nghiệp vụ cho lần chạy, không phải danh tính người yêu cầu, và payload signal không có trường danh tính đã xác thực (E64, E37).
- SR2 `một phần`: có một chỗ để đặt phép kiểm, là activity, nhưng mô hình không có điểm quyết định quyền nào của riêng nó, nên kiểm tra xong thì không có event nào ghi lại kết quả (E65, `suy từ thiết kế`).
- SR4 `một phần`: có điểm dừng thật, gồm signal, điều kiện chờ và task token của AWS, nhưng không có cơ chế nào buộc điểm dừng đó gắn với hash của tham số đã duyệt (E37, E62).
- SR6 `một phần`: có chống trùng ở tầng start, gồm idempotent của StartExecution với Standard và ràng buộc tối đa một lần chạy mở cho mỗi Workflow Id của Temporal; phần tác dụng phụ bên trong activity thì không được bảo vệ (E63, E64).
- SR7 `một phần`: Event History đủ chi tiết để dựng lại, nhưng bị chặn ở 51.200 event hoặc 50 MB và AWS chỉ giữ 90 ngày, còn Express thì không có lịch sử chạy (E71, E39).
- SR8 `một phần`: definition dùng lại được cho agent thứ hai qua một Workflow Id khác, nhưng quyền không tách khỏi definition, nên agent thứ hai thừa hưởng đúng những gì definition làm (E36, `suy từ thiết kế`).
- Phần còn thiếu phải dựng: binding danh tính người yêu cầu, kiểm quyền theo trường và bản ghi, hash tham số ở điểm dừng, chống trùng ở tầng tác dụng phụ, và quy tắc từ chối khi không xác định.
- So với bản 0.4: không ô nào đổi mức, và ô duy nhất có lý do đổi là SR6, từ chỗ bản 0.4 chỉ nói chống trùng thuộc loại `một phần` mà không có cơ chế, nay có hai cơ chế cụ thể ở tầng start; mức vẫn là `một phần` vì cả hai đều dừng ở tầng start (E63, E64).

### 3.4. Agent Orchestration

Đơn vị so sánh: một bước trong vòng lặp agent, tức một lần gọi model kèm quyết định chọn tool (E44, E47).
Đơn vị giá: token nhân với số bước, cộng phí runtime nếu chạy trên nền tảng quản lý (E29, E47, E50).
Nguồn của mục này: E29, E44 đến E48, E50, E66 đến E68.

#### 3.4.0. Cơ chế

Mô hình này giải bài toán điều phối một tác vụ mà đường đi không biết trước: thay vì người viết mã chốt thứ tự bước, model tự quyết bước kế tiếp sau mỗi kết quả tool trả về, trong một vòng lặp model-tool do framework chạy (E45, E47).
Vòng lặp đó gồm bốn hành động cố định: gọi model với ngữ cảnh hiện tại, đọc output, nếu model yêu cầu gọi tool thì chạy tool rồi nối kết quả vào ngữ cảnh, và lặp lại cho tới khi model trả về output không còn lời gọi tool nào (E45, E47).
Trạng thái giữa các lượt là toàn bộ lịch sử message cộng các item tool đã chạy, nên mỗi lượt sau nhìn thấy mọi lượt trước; ở OpenAI Agents SDK trạng thái của một lần chạy đang dừng tuần tự hóa được thành `RunState` rồi khôi phục, còn ở Claude Agent SDK trạng thái gắn với session và nối lại được qua session ID (E44, E48).
Đại lượng đổi khi số hệ thống tăng là số bước và số lần ghi trạng thái: thêm một hệ thống thường kéo theo ít nhất một bước tra cứu và một bước ghi, mỗi bước là một lần gọi model tính tiền theo token (E47, E29).
Đại lượng đổi khi số tool tăng là kích thước phần schema tool trong ngữ cảnh của mọi lượt, vì mỗi tool là một định nghĩa schema được gửi lại ở mỗi lần gọi model; tài liệu của chính framework nói tool search tồn tại để giảm token schema và không phơi toàn bộ tool ngay từ đầu (E67).
Khi số agent tăng, đại lượng đổi là số định nghĩa phải giữ, mỗi định nghĩa gồm một prompt riêng và một tập tool riêng, và có hai cách tái dùng: handoff chuyển quyền điều khiển kèm toàn bộ lịch sử hội thoại, còn agent-as-tool gọi agent khác như một tool mà không bàn giao quyền điều khiển (E66, E67).
Mô hình này không giải bài toán quyền và không giải bài toán đúng một lần: nó không có khái niệm quyền theo trường và theo bản ghi ở bất kỳ tầng nào, và tài liệu HITL nói thẳng là một lời gọi đã được duyệt vẫn không được bảo đảm chạy đúng một lần (E44, `có câu trích`).

#### 3.4.1. Ưu

- **Được gì:** người yêu cầu không phải biết trước thứ tự bước, vì model tự chọn bước kế tiếp; **Cho ai:** U1; **Quy mô:** tác vụ nhiều bước, đường đi không cố định (E45, E68).
- **Được gì:** không phải tự viết máy trạng thái, vì framework lo phần gọi model, chạy tool, nối kết quả và kiểm điều kiện dừng; **Cho ai:** U3; **Quy mô:** từ một agent một tool tới nhiều agent chuyên môn (E45, E47).
- **Được gì:** điểm dừng nằm giữa vòng lặp, không chỉ trước hoặc sau cả lần chạy, vì quy tắc duyệt gắn vào chính tool và lần chạy khôi phục tiếp từ chỗ đã dừng; **Cho ai:** U2; **Quy mô:** nhiều bước, có ít nhất một bước ghi cần người xác nhận (E44).
- **Được gì:** duyệt được từng phần, vì mục đã duyệt thì chạy tiếp còn mục chưa duyệt vẫn nằm trong danh sách chờ; **Cho ai:** U2; **Quy mô:** một lần chạy có nhiều lời gọi cần duyệt (E44).
- **Được gì:** agent thứ hai dùng lại năng lực của một agent chuyên môn mà không kéo theo lịch sử hội thoại, vì agent-as-tool chạy agent bị gọi thành một lần chạy lồng; **Cho ai:** U5; **Quy mô:** nhiều agent chuyên môn, mỗi agent một tập tool (E67).
- **Được gì:** hai mức bàn giao để chọn: handoff khi muốn agent đích tiếp quản hội thoại, agent-as-tool khi muốn agent cha giữ quyền điều phối và chỉ nhận kết quả; **Cho ai:** U3; **Quy mô:** cùng một tập agent chuyên môn phục vụ nhiều luồng khác nhau (E66, E67).
- **Được gì:** số liệu theo từng bước thay vì chỉ một con số cuối, vì SDK phát token usage theo từng bước và tổng theo lần chạy; **Cho ai:** U4; **Quy mô:** mọi lần chạy có từ hai bước trở lên (E48).

#### 3.4.2. Nhược

- **Mất gì:** tính tất định của đường đi, vì cùng một input có thể ra số bước khác nhau; **Vỡ ở đâu trước:** không chốt trước được chi phí và độ trễ của một lần ghi (`suy từ thiết kế`, tiền đề là vòng lặp ở E45 và E47 không đặt số bước cố định).
- **Mất gì:** khôi phục sạch sau khi dừng, vì node chạy lại từ đầu node nơi gọi `interrupt`; **Vỡ ở đâu trước:** mọi tác dụng phụ đã xảy ra trước điểm dừng có thể lặp lại (E46).
- **Mất gì:** đúng một lần, vì duyệt chỉ cho phép lời gọi chạy chứ không bảo đảm chạy đúng một lần; **Vỡ ở đâu trước:** tiến trình chết trước khi lưu trạng thái, hoặc khôi phục từ ảnh chụp cũ chạy lại tool (E44).
- **Mất gì:** giới hạn vòng lặp, vì không đặt giới hạn thì vòng lặp chạy tới khi model tự dừng; **Vỡ ở đâu trước:** prompt mở, nơi lần chạy có thể rất lâu (E47).
- **Mất gì:** chi phí chốt trước ngay cả khi đã đặt trần, vì trần ngân sách được so sau khi câu trả lời đã về; **Vỡ ở đâu trước:** lần chạy có thể vượt trần đúng bằng chi phí của câu trả lời đó, cộng phần các agent con còn đang chạy (E47).
- **Mất gì:** kiểm soát dữ liệu khi bàn giao, vì handoff chuyển cả lịch sử hội thoại và việc nén lịch sử không che dữ liệu nhạy cảm; **Vỡ ở đâu trước:** tham số và kết quả tool vẫn có thể nằm trong bản tóm tắt gửi cho agent đích (E66).
- **Mất gì:** tách quyền theo agent, vì quyết định duyệt "luôn đồng ý" cho shell và apply_patch không gắn theo agent; **Vỡ ở đâu trước:** sau một handoff, quyết định đó có thể áp cho tool cùng tên của agent khác dù executor khác quyền (E44).

#### 3.4.3. Mở rộng

Mở rộng ở mô hình này đọc qua giới hạn cứng của vòng lặp và của phiên.

- `max_turns` có giá trị mặc định, và đặt `None` để tắt (E45).
- Claude Agent SDK mặc định không giới hạn cả hai tham số (E47).
- Phiên websocket của Responses API bị chặn 60 phút (E45).
- Số tool tối đa `KHÔNG CÓ SỐ CÔNG BỐ` (2026-11-13).
- Số agent tối đa `KHÔNG CÓ SỐ CÔNG BỐ` (2026-11-13).
- LangGraph ghi trạng thái rồi chờ vô hạn cho tới khi được đánh thức, và lần đánh thức phải dùng đúng `thread_id` của lần dừng trước (E46).
- Tool search của OpenAI cho phép hoãn phần schema tool tới lúc chạy, và tài liệu khuyến nghị giữ mỗi namespace dưới 10 hàm như một quy tắc ngón tay cái, không phải giới hạn cứng (E67).

#### 3.4.4. Chi phí

Tầng điều phối không có bảng giá riêng, nên chi phí của mô hình này là chi phí token nhân với số bước.
Số bước do model quyết, nên kết quả là một khoảng chứ không phải một con số.

- Không có đơn giá riêng cho tầng điều phối (E29).
- Chi phí một lần chạy bằng giá token nhân với số bước của chính lần chạy đó (E29).
- Claude Sonnet 5: 2,00 USD mỗi triệu token vào và 10,00 USD mỗi triệu token ra (E29).
- Claude Opus 5: 5,00 USD mỗi triệu token vào và 25,00 USD mỗi triệu token ra (E29).
- Đọc cache bằng 0,1 lần giá vào; ghi cache 5 phút bằng 1,25 lần, ghi cache 1 giờ bằng 2 lần giá vào (E29).
- Trang giá OpenAI trả 403 ở lượt mở đầu, nên bảng giá ở đây không lặp lại; mức giá của nhà cung cấp này nằm ở E27 (E48).
- Bảng giá AgentCore mở được nhưng không trích xuất được thành văn bản ở lượt đầu (E50); bản 0.5 không dùng số AgentCore vì tầng điều phối không có đơn giá riêng.
- Tiền mỗi lần ghi thành công của mô hình này `KHÔNG CÓ SỐ CÔNG BỐ` (2026-11-13), vì số bước không tất định.
- Số bước trung bình của một lần ghi danh bạ hay một lần cập nhật công việc `KHÔNG CÓ SỐ CÔNG BỐ` (2026-11-13); phải đo ở bước 06.

#### 3.4.5. Bảo mật

Kiểm soát ở mô hình này đi qua điểm dừng chờ duyệt và trạng thái lưu giữa hai lượt.
Phần còn lại là những gì tài liệu khuyến nghị ứng dụng tự làm.

- Quy tắc duyệt viết dạng hàm, và fail closed khi không đọc được tham số (E44).
- Tài liệu khuyến nghị lưu trạng thái phía server, xác thực người duyệt và chặn resume lại cùng một lần chạy (E44).
- Ba việc này chỉ ở mức khuyến nghị, không phải ràng buộc cứng của framework (E44).
- Mục này không mô tả phạm vi quyền theo trường hay bản ghi (E44).
- Duyệt không bảo đảm đúng một lần: "Approval permits a tool call to execute; it does not guarantee exactly-once execution" (E44).
- Khóa idempotency ở đích là việc của ứng dụng; tài liệu còn nói nếu đích không có cơ chế đó thì phải đối soát trước khi thử lại (E44).
- Handoff chuyển cả lịch sử hội thoại và việc nén lịch sử không che dữ liệu nhạy cảm (E66).
- Quyết định duyệt "luôn đồng ý" cho shell và apply_patch không gắn theo agent, nên sau một handoff nó có thể áp cho tool cùng tên của agent khác (E44).
- Phần phải dựng thêm: kiểm quyền theo trường và bản ghi, khóa chống trùng ở đích, và phép kiểm danh tính người duyệt ở phía server (E44, `suy từ thiết kế`).

#### 3.4.6. Bảo trì

Bảo trì ở mô hình này tách làm hai phần: phần framework nâng cấp và phần ứng dụng tự giữ.
Phần ứng dụng tự giữ là những quyết định mà framework không đặt sẵn.

- Framework lo vòng lặp, chuyển agent, tuần tự hóa trạng thái và nâng cấp định dạng message (E44, E45).
- Ứng dụng phải tự đặt giới hạn cho vòng lặp (E45, E47).
- Ứng dụng phải tự chọn tool nào cần duyệt và ai duyệt (E44).
- Ứng dụng phải tự quyết trạng thái dừng lưu ở đâu (E44).
- Nâng cấp framework có thể làm lệch số liệu chi phí, vì bảng giá được đóng gói lúc build và bản SDK không nhận ra model mới thì tính sai (E48).
- Nâng cấp framework có thể làm ảnh chụp trạng thái cũ không đọc được, nên tài liệu khuyến nghị lưu kèm một mốc phiên bản của định nghĩa agent hoặc của SDK (E44).
- Đổi model, đổi prompt hoặc đổi định nghĩa tool đều là loại nâng cấp gây vỡ ảnh chụp trạng thái (E44).
- Đếm thành phần: tiến trình chạy SDK, API của nhà cung cấp model, kho lưu trạng thái dừng, điểm nhận quyết định duyệt, nguồn tool, và nguồn trace nếu bật; sáu thành phần, và không có số tối thiểu nào được công bố (`suy từ thiết kế`).
- Đổi một luật quyền chạm bốn chỗ: định nghĩa tool nơi gắn `needs_approval`, cấu hình lần chạy nơi gắn guardrail, mã `on_handoff`, và mã phía server nhận quyết định duyệt (E44, E45, E66).

#### 3.4.7. Phù hợp nhu cầu

Mức cao nhất mô hình này đạt được là `một phần`, ở SR1, SR2, SR4, SR5, SR6, SR7 và SR8.

- `cung cấp sẵn`: không có SR nào.
- `một phần`: SR1, SR2, SR4, SR5, SR6, SR7 và SR8.
- Phần ứng dụng phải tự dựng là những quyết định thuộc ứng dụng: đặt giới hạn, chọn tool nào cần duyệt, ai duyệt, trạng thái dừng lưu ở đâu (E45, E47).
- `không nói tới`: SR3, tức phạm vi quyền theo trường và bản ghi.
- SR1 và SR2 giữ `một phần`, vì nguồn chỉ có quy tắc duyệt fail closed chứ không có danh tính người yêu cầu và không có kiểm quyền ở tầng thực thi (E44).
- SR4 giữ `một phần`, vì điểm dừng gắn theo id lời gọi tool và theo tham số đã parse, không gắn theo hash nội dung tham số (E44).
- SR5 giữ `một phần`, vì fail closed chỉ đúng cho việc đọc tham số, không đúng cho việc xác định quyền (E44).
- SR6 giữ `một phần`, vì duyệt không bảo đảm đúng một lần và khóa idempotency phải do ứng dụng gắn ở đích (E44).
- SR7 giữ `một phần`, vì có trace theo từng bước và trạng thái tuần tự hóa được, nhưng quyết định duyệt có nằm lại trong trace hay không là việc của ứng dụng (E44, E48).
- SR8 giữ `một phần`, dù bằng chứng mạnh hơn: có hai cơ chế tái dùng rõ ràng là handoff và agent-as-tool, nhưng quyền không tách theo agent, vì lần chạy lồng thừa hưởng `run_config` của lần ngoài và quyết định duyệt shell dùng chung qua các agent (E45, E44, E66, E67).
- SR3 giữ `không nói tới`, vì bộ lọc lịch sử của handoff lọc nội dung hội thoại chứ không phải quyền theo trường và bản ghi (E66).

### 3.5. Event-driven Integration

Đơn vị so sánh: một event được phát, và một state transition ở phía consumer (E51, E53).
Đơn vị giá: broker instance-hour, GB-month, GB data-in, hoặc request trên một triệu (E56, E55).
Nguồn của mục này: E51 đến E56, E69, E70, E72.

#### 3.5.0. Cơ chế

Mô hình này giải bài toán giữ dữ liệu nhất quán giữa nhiều hệ khi không dùng được giao dịch phân tán, bằng cách mỗi hệ phát một event mô tả việc nó vừa làm và các hệ khác tự đăng ký nhận, để cuối cùng dữ liệu nhất quán chứ không nhất quán tức thời (E69).
Đường truyền là publish/subscribe: bên phát ghi event vào topic hoặc queue rồi thôi, bên nhận tự giữ vị trí đọc của riêng nó trong log, và vị trí đó là một offset trên từng partition chứ không phải một con trỏ chung toàn hệ (E51, E72).
Chỗ dễ vỡ nhất là ranh giới giữa ghi cơ sở dữ liệu và phát event, nên mô hình đưa vào transactional outbox: message được ghi vào cùng một giao dịch với bản ghi nghiệp vụ, và một tiến trình riêng là message relay đọc bảng outbox rồi phát đi (E52).
Để nhiều bên đọc hiểu cùng một event, định dạng event được tách khỏi giao thức qua CloudEvents với bốn thuộc tính bắt buộc là `id`, `source`, `type`, `specversion`, và hợp đồng dữ liệu được đăng ký tập trung ở Schema Registry để kiểm tương thích khi schema tiến hoá (E53, E70).
Khi số hệ tăng, số cặp tích hợp đi từ n nhân m xuống n cộng m, vì mỗi hệ chỉ cần nối vào broker một lần; đây là `suy từ thiết kế` với tiền đề là bên phát không biết bên nhận, và tiền đề đó có câu trích trên trang Kafka: "producers and consumers are fully decoupled and agnostic of each other" (E72).
Khi số tool tăng, mô hình không đổi theo số tool mà theo số loại event và số consumer của mỗi loại: thêm một tool phát event mới là thêm một event type và một schema phải đăng ký, còn đại lượng thật sự làm tăng chi phí là số event, số partition và thời gian lưu, không phải số bản ghi nghiệp vụ (E56, E70, `suy từ thiết kế`).
Mô hình này không giải bốn việc: không mang danh tính người yêu cầu trong event vì `source` là bối cảnh nơi sự kiện xảy ra chứ không phải người dùng cuối (E53), không có kiểm quyền nghiệp vụ ở tầng nào (E69), không có phản hồi đồng bộ cho người gọi, và không có điểm dừng chờ người duyệt trước khi ghi.

#### 3.5.1. Ưu

- **Được gì:** thêm một consumer mới không phải sửa producer, nên chi phí tích hợp tăng tuyến tính theo số hệ chứ không tăng theo số cặp; **Cho ai:** U3; **Quy mô:** khi có ít nhất hai producer và hai consumer, tức từ bốn cặp tích hợp trở lên, vì dưới ngưỡng đó lợi ích tách rời chưa bù được chi phí dựng broker (E69, E72, `suy từ thiết kế`).
- **Được gì:** phát lại được log từ một offset bất kỳ, nên dựng lại được trạng thái tại một thời điểm để đối chiếu; **Cho ai:** U4; **Quy mô:** khi cần đối chiếu lịch sử trên nhiều tháng, vì thời gian lưu là cấu hình theo từng topic (E51).
- **Được gì:** bỏ được giao dịch phân tán hai pha giữa cơ sở dữ liệu và broker, tức bỏ một phụ thuộc hạ tầng và bỏ một lớp lỗi; **Cho ai:** U3, gián tiếp U4; **Quy mô:** hệ đã có cơ sở dữ liệu giao dịch, ở mọi quy mô (E52).
- **Được gì:** hợp đồng dữ liệu được kiểm tương thích tập trung, nên nhiều consumer đọc cùng một event mà không vỡ khi producer đổi schema; **Cho ai:** U3; **Quy mô:** từ ba consumer trở lên trên cùng một event type, hoặc khi consumer do nhóm khác viết (E70).
- **Được gì:** thao tác lặp lại an toàn trong một cửa sổ thời gian xác định, nhờ deduplication ID ở broker và idempotency key ở tầng API; **Cho ai:** U1 khi bấm lại, U2 khi duyệt lại; **Quy mô:** chỉ trong cửa sổ 5 phút với SQS FIFO và tối thiểu 24 giờ với khóa của Stripe, nên chỉ dùng được cho retry ngắn (E55, E54).
- **Được gì:** event mang đủ khung để trace là `id`, `source`, `type`, `time`, và `subject` định danh đối tượng, nên bên nhận lọc và đối chiếu được mà không phải giải mã payload; **Cho ai:** U4, và U5 khi cần lọc theo đối tượng; **Quy mô:** nhiều event type và nhiều consumer lọc khác nhau (E53).

#### 3.5.2. Nhược

- **Mất gì:** câu trả lời đồng bộ cho người gọi, nên người gọi không biết kết quả cuối cùng của thao tác mình vừa yêu cầu; **Vỡ ở đâu trước:** U1 khi cần thấy kết quả trong cùng một lượt, trước cả khi hệ chạy chậm.
- **Mất gì:** nhất quán tức thời, vì dữ liệu chỉ nhất quán sau một khoảng trễ; **Vỡ ở đâu trước:** consumer đọc ngay sau khi producer ghi, vì consumer thấy trạng thái cũ (E69).
- **Mất gì:** bảo đảm không trùng, vì message relay có thể chết sau khi đã phát nhưng trước khi ghi nhận là đã phát; **Vỡ ở đâu trước:** consumer chưa idempotent, đúng lúc relay hoặc broker restart (E52).
- **Mất gì:** chống trùng dài hạn, vì cửa sổ của SQS FIFO chỉ 5 phút và cơ chế này chỉ có ở FIFO queue; **Vỡ ở đâu trước:** consumer khi retry đến muộn hơn 5 phút hoặc khi replay từ log cũ (E55).
- **Mất gì:** thứ tự toàn cục, vì thứ tự chỉ được bảo đảm trong một topic-partition; **Vỡ ở đâu trước:** hai event của cùng một bản ghi rơi vào hai partition khác nhau và bị hai consumer xử lý lệch thứ tự (E72).
- **Mất gì:** danh tính người yêu cầu, vì `source` là bối cảnh nơi sự kiện xảy ra và có thể gồm nhiều producer; **Vỡ ở đâu trước:** U4 khi cần chứng minh ai đã yêu cầu và ai đã duyệt một thay đổi (E53).
- **Mất gì:** đúng một lần theo mặc định, vì Kafka mặc định là at-least-once; muốn exactly-once phải bật transactional producer và cấu hình consumer cho phù hợp, còn isolation mặc định vẫn để lộ message của transaction đã huỷ; **Vỡ ở đâu trước:** consumer đọc chéo transaction (E51).

#### 3.5.3. Mở rộng

Mở rộng của mô hình này đọc qua các giới hạn đến từ bốn thành phần khác nhau là broker, cửa sổ chống trùng, định dạng event và schema; bốn thành phần đó không cùng đại lượng, nên mỗi dòng dưới đây đọc riêng.
Giới hạn của CloudEvents tách làm hai dòng vì hai vế có mức bắt buộc khác nhau.

- Thứ tự chỉ được bảo đảm trong một partition, không phải trên toàn topic (E72).
- SQS FIFO chống trùng trong cửa sổ 5 phút (E55).
- Khóa idempotency của Stripe dài tối đa 255 ký tự và được giữ tối thiểu 24 giờ (E54).
- CloudEvents quy định bên trung gian MUST chuyển tiếp event từ 64 KiB trở xuống (E53).
- CloudEvents quy định consumer SHOULD nhận được event ít nhất 64 KiB (E53).
- CloudEvents bắt buộc bốn thuộc tính `id`, `source`, `type`, `specversion`; `source` cộng `id` phải duy nhất cho mỗi event phân biệt, và consumer MAY coi hai event cùng `source` và `id` là bản trùng (E53).
- Schema Registry không phải thành phần mặc định của broker: nó là một REST service riêng cộng bộ serializer/deserializer cắm vào client (E70).
- Không có số công bố cho số event type tối đa, số consumer tối đa trên một topic, hay thời gian lưu mặc định của topic (`KHÔNG CÓ SỐ CÔNG BỐ`, 2026-11-13).

#### 3.5.4. Chi phí

Chi phí của mô hình này tính theo đơn vị hạ tầng, nên ba mức giá dưới đây không cùng đại lượng.
Ba mức giá này cùng lấy từ trang giá MSK (E56).

| Đơn vị tính | Mức giá | Nguồn |
| --- | --- | --- |
| Broker instance-hour với kafka.m7g.large | 0,204 USD mỗi giờ | E56 |
| Lưu trữ | 0,10 USD mỗi GB-month | E56 |
| Data-in với Express broker | 0,01 USD mỗi GB | E56 |

- Giá SQS FIFO `KHÔNG CÓ SỐ CÔNG BỐ` (2026-11-13), vì trang đã mở là trang kỹ thuật, không phải trang giá (E55).
- Giá Schema Registry `KHÔNG CÓ SỐ CÔNG BỐ` (2026-11-13), vì trang đã mở chỉ nêu tên gói Essentials và Advanced, không nêu đơn giá (E70).
- Tiền mỗi lần ghi thành công `KHÔNG CÓ SỐ CÔNG BỐ` cho cả mô hình, vì một lần ghi có thể sinh nhiều event và chi phí phụ thuộc thời gian lưu cùng số partition.

#### 3.5.5. Bảo mật

Bảo mật của mô hình này nằm ở những gì event mang theo và ở vòng đời của khóa idempotency.

- `source` là bối cảnh nơi sự kiện xảy ra, không phải người dùng cuối (E53).
- Stripe khuyến không dùng dữ liệu nhạy cảm làm khóa idempotency (E54).
- SQS vẫn theo dõi deduplication ID sau khi message đã nhận và xóa (E55).
- Mô hình không định nghĩa kiểm quyền nghiệp vụ (E53, E69).
- CloudEvents nói thẳng là thông tin nhạy cảm SHOULD NOT được mang trong context attribute, vì producer, consumer và bên trung gian đều MAY đọc và ghi log context attribute (E53).
- Đặc tả CloudEvents đẩy phần mã hoá payload ra ngoài phạm vi: cơ chế mã hoá là thoả thuận giữa producer và consumer (E53).
- `type` được đặc tả nêu là dùng cho routing, observability và policy enforcement, nhưng không có cơ chế nào bắt buộc phải thực thi policy đó (E53).
- Phần phải dựng thêm: một extension attribute mang danh tính người yêu cầu và người duyệt, ACL trên topic, quyền cho relay, và mã hoá payload nếu payload chứa dữ liệu nhạy cảm (E52, E53).

#### 3.5.6. Bảo trì

Bảo trì của mô hình này là bảo trì đường truyền: thêm thành phần, thêm quyết định phải bảo trì, và thêm trạng thái phải giám sát.

- Sáu thành phần tối thiểu: sender, database, message outbox, message relay, message broker, và consumer có khả năng idempotent (E52).
- Bảy thành phần nếu cần nhiều consumer đọc cùng event mà không vỡ khi schema đổi, vì thêm Schema Registry gồm một REST service và bộ serializer/deserializer (E70).
- Bản 0.4 ghi "ít nhất bốn thành phần" theo danh sách broker, bảng outbox, message relay và consumer giữ offset; E52 liệt kê bốn participant là sender, database, message outbox và message relay, nên đếm đủ phải là sáu, và con số bốn được giữ lại như số participant của pattern (E52).
- Outbox có hai cách hiện thực, nên có thêm một quyết định phải bảo trì (E52).
- Consumer phải tự làm idempotent (E52).
- Phải theo dõi offset và transaction state (E51).
- Phải theo dõi độ trễ của message relay so với thời điểm commit, vì đây là chỗ sinh ra cả mất lẫn trùng (E52).
- Chỗ phải sửa khi đổi một luật quyền: ACL trên broker hoặc queue, mỗi consumer một chỗ, schema nếu luật mới cần thêm trường, và chế độ tương thích của Schema Registry; đổi luật quyền là việc phân tán theo số consumer, không phải một việc một chỗ (E52, E53, E70, `suy từ thiết kế`).
- Loại nâng cấp gây vỡ: đổi schema theo hướng không tương thích, đổi `specversion`, bật `read_committed` trên consumer, và nâng CloudEvents từ bản nháp 1.0.3-wip lên bản phát hành (E70, E53, E51).

#### 3.5.7. Phù hợp nhu cầu

Mức cao nhất mô hình này đạt được là `cung cấp sẵn`, ở SR8.

- `cung cấp sẵn`: SR8.
- `một phần`: SR4, SR6 và SR7.
- `không nói tới`: SR1, SR2, SR3 và SR5.
- SR8 đạt `cung cấp sẵn` vì định dạng event tách hẳn khỏi giao thức và bên nhận tự đăng ký nhận, nên một agent thứ hai đọc cùng event stream mà không thừa hưởng danh tính của agent thứ nhất (E53, E69).
- SR4 chỉ `một phần`: bảng outbox là chỗ giữ được một đề xuất thay đổi một cách bền vững trước khi phát, nhưng mô hình không có tác nhân duyệt và không có cơ chế buộc đề xuất với một hash của tham số (E52, `suy từ thiết kế`).
- SR6 `một phần`: có ba cơ chế chống trùng thật là deduplication ID 5 phút ở SQS FIFO, khóa idempotency 255 ký tự giữ tối thiểu 24 giờ ở Stripe, và yêu cầu consumer tự idempotent ở outbox; nhưng cả ba đều có điều kiện, nên không đạt `cung cấp sẵn` (E55, E54, E52).
- SR7 `một phần`: event có `id`, `source`, `type`, `time` và log giữ offset nên dựng lại được chuỗi sự kiện, nhưng thiếu danh tính người yêu cầu và thiếu bản ghi duyệt, nên không dựng lại được ai đã cho phép (E53, E51).
- SR1 `không nói tới`: `source` là bối cảnh nơi sự kiện xảy ra, không phải người dùng cuối, và đặc tả không có thuộc tính nào cho người yêu cầu (E53).
- SR2 `không nói tới`: trang mục đích của event-driven architecture không nói tới xác thực hay phân quyền (E69); `type` chỉ được nêu là dùng cho policy enforcement mà không có cơ chế thực thi (E53).
- SR3 `không nói tới`: `subject` định danh đối tượng nhưng không phải phạm vi quyền, và đặc tả không nói quyền theo trường (E53).
- SR5 `không nói tới`: đặc tả để consumer tự quyết khi gặp tính năng nó không hỗ trợ, kể cả "no action or generating an error", tức không có quy tắc từ chối mặc định (E53).

### 3.6. Năm ca mà mô hình là lựa chọn sai

Mỗi ca dưới đây giải thích bằng cơ chế, không so sánh với mô hình khác và không xếp hạng.
Một ca sai không làm mô hình bị loại; nó chỉ cho biết mô hình không trả lời câu hỏi nào.

#### 3.6.1. API / Function Calling

Function calling là lựa chọn sai khi nhiều ứng dụng cùng cần nhiều hệ thống, vì mỗi cặp ứng dụng và hệ thống là một schema cộng một handler, nên chi phí tăng theo tích chứ không theo tổng, và không có chỗ nào trong đặc tả để gộp (E24, `suy từ thiết kế`).
Nó cũng là lựa chọn sai khi điểm dừng chờ người duyệt phải sống lâu hơn tiến trình: mô hình chỉ phát một yêu cầu rồi dừng, còn state của lần chờ không có chỗ chứa trong đặc tả (E25, `suy từ thiết kế`).
Và nó là lựa chọn sai khi cần chống ghi trùng ở mức hệ thống nghiệp vụ, vì lời gọi không mang khóa idempotency, nên sau khi mạng đứt thì ứng dụng không có cách nào chứng minh với hệ thống đích rằng lần thứ hai là cùng một việc (E24).
Cuối cùng, nó là lựa chọn sai khi bộ tool lớn và thay đổi theo từng người dùng: schema nạp sẵn bị tính token ở mọi lượt, còn tool search thì chỉ có trên một số model và vẫn bắt model thấy tên và mô tả của mọi thứ có thể tìm (E24, E28).

#### 3.6.2. MCP

Ca sai thứ nhất là một ứng dụng nội bộ gọi đúng một API nội bộ: ở đó n bằng 1 và m bằng 1, nên n cộng m là 2 còn n nhân m là 1, tức mô hình không tiết kiệm được connector nào mà còn phải chạy thêm một tiến trình server, thêm một authorization server và thêm nghĩa vụ bám revision (E57, E58, `suy từ thiết kế`).
Ca sai thứ hai là bài toán quyết định và phê duyệt: nếu câu hỏi là ai được duyệt thay đổi nào và bằng chứng duyệt nằm ở đâu, thì giao thức không có policy engine, không có điểm dừng gắn hash tham số, và con người trong vòng lặp chỉ là SHOULD, nên chọn MCP là chọn đúng chỗ không có cơ chế (E35, E59).
Ca sai thứ ba là khi yêu cầu chống ghi trùng ở tầng giao thức: `tools/call` không có trường khóa idempotency, nên mọi bảo đảm phải nằm ở server và không được thừa hưởng từ giao thức (E35).
Ca sai thứ tư là khi quyền phải diễn đạt theo trường hoặc theo bản ghi: scope là chuỗi phẳng do server định nghĩa, nên mô hình không mang sẵn ngữ nghĩa đó và mọi thứ phải viết trong tool handler (E33).

#### 3.6.3. Workflow Engine

Một yêu cầu ngắn mà model phải tự chọn tool là ca sai, vì mô hình không có bước chọn tool nên người viết phải mã hóa mọi nhánh chọn vào definition, và cái nhận được chỉ là một lần chạy một bước cùng toàn bộ máy móc lịch sử, replay và điểm chờ (E36, E62).
Một quyết định quyền theo trường và bản ghi cũng là ca sai, vì đơn vị của mô hình là state và transition, không có chỗ nào đánh giá luật theo bản ghi rồi ghi kết quả thành event, nên luật nằm trong activity và không được hưởng bảo đảm replay hay chống trùng của mô hình (E65, `suy từ thiết kế`).
Ca sai thứ ba là tác dụng phụ nằm ngoài workflow, ví dụ người dùng sửa thẳng danh sách công việc hoặc một job khác ghi cùng trường, vì chống trùng của mô hình chỉ áp cho lần start mà nó nhận nên nó không thấy và không chặn được lần ghi đó (E63).
Ca sai thứ tư là một lượt duyệt phải trả lời trong vài giây và người gửi phải chắc chắn đã xử lý, vì signal trả về khi server nhận còn Update thì phải chờ worker nhận, nên không có đường nào bảo đảm đã xử lý trong một ngưỡng ngắn ở phía người gửi (E37).
Ca sai thứ năm là một quy trình một bước nhưng chờ duyệt lâu hơn 5 phút: chọn Express thì vỡ vì trần 5 phút, chọn Standard thì mỗi lượt chờ vẫn tốn state transition (E39, E38).

#### 3.6.4. Agent Orchestration

Mô hình này là lựa chọn sai khi quy trình đã biết thứ tự và phải phát lại được: nếu mỗi bước đã xác định và cần chạy lại đúng chuỗi đó để điều tra sự cố, thì việc để model chọn bước kế tiếp làm mất chính thứ tự cần phát lại, và thứ được lưu lại là lịch sử hội thoại chứ không phải một chuỗi quyết định kiểm được (E45, E46).
Mô hình này cũng là lựa chọn sai khi cần đúng một lần cho một ghi nghiệp vụ: cơ chế duyệt chỉ cho phép chạy chứ không bảo đảm chạy một lần, nên nếu hệ thống đích không có khóa idempotency thì mô hình không tự bù được, và tài liệu nói phải đối soát với đích trước khi thử lại (E44).
Mô hình này là lựa chọn sai khi phải chốt chi phí trước khi chạy: trần ngân sách chỉ được so sau khi câu trả lời về, lại cộng thêm phần agent con còn đang chạy, nên một cam kết "không quá X" không giữ được (E47).
Mô hình này là lựa chọn sai khi đối tượng ghi có phân quyền theo trường và bản ghi: mô hình không có khái niệm đó ở tầng nào, nên nếu câu hỏi chính là "ai được sửa trường nào của bản ghi nào" thì phần lớn công việc nằm ngoài mô hình và không được tính là đã có (E44, `suy từ thiết kế`).

#### 3.6.5. Event-driven Integration

Ca sai thứ nhất: người dùng bấm lưu và cần biết ngay thao tác đã thành công hay chưa trong cùng lượt, vì mô hình này chỉ trả về sau khi event đã được phát chứ không sau khi consumer đã xử lý, nên không có câu trả lời đồng bộ để trả lại (E69).
Ca sai thứ hai: cần chặn một thay đổi để người có thẩm quyền duyệt trước khi ghi, vì outbox chỉ bảo đảm message được phát nếu giao dịch commit, chứ không phải một cổng duyệt đứng trước giao dịch, và event không mang danh tính người duyệt (E52, E53).
Ca sai thứ ba: chỉ có đúng một consumer cho một producer, vì khi đó n cộng m bằng 2 và không có lợi ích tách rời nào để bù cho sáu thành phần phải chạy thêm (E52).
Ca sai thứ tư: cần thứ tự trên toàn bộ topic chứ không chỉ trong một topic-partition, vì bảo đảm thứ tự chỉ đúng trong phạm vi một partition, và ép tất cả về một partition thì mất khả năng đọc song song (E72, `suy từ thiết kế`).
Ca sai thứ năm: cần chống trùng lâu hơn 5 phút với SQS FIFO, vì ngoài cửa sổ 5 phút message trùng ID vẫn được giao bình thường, nên mô hình tự nhận đã chống trùng trong khi thực tế thì không (E55).

### 3.7. Ba điều đọc chéo năm mục

Ba điều dưới đây chỉ đếm trên tám mục của mục 3.1 đến 3.5, không thêm dữ kiện mới:

1. **Bảo mật:** chỉ MCP có mục Bảo mật nói về giao thức xác thực, với OAuth 2.1, PKCE và resource indicator (E33); bốn mô hình còn lại hoặc đặt toàn bộ phần quyền ở ứng dụng, hoặc không định nghĩa kiểm quyền nghiệp vụ ở tầng nào; nhưng phần MCP có chỉ là xác thực ở tầng vận chuyển, vì annotation của tool không được tin và giao thức không có policy engine (E35, E59).
2. **Bảo trì:** cả năm mô hình đều nêu được số thành phần phải chạy; event-driven nhiều nhất với sáu thành phần, bảy nếu dùng Schema Registry (E52, E70); MCP cần sáu thành phần cho lab 2 hệ thống (E59, E33, `suy từ thiết kế`); workflow tự dựng Temporal cần bốn service cộng lớp lưu trữ (E65); API/FC cần bốn thành phần cộng m handler (E24, E25, `suy từ thiết kế`); orchestration cần sáu thành phần, nhưng không có số tối thiểu công bố (E44, E45, `suy từ thiết kế`).
3. **Chi phí:** chỉ workflow engine có đơn giá cho đúng đơn vị công việc của chính nó, là 0,000025 USD mỗi state transition (E38), và Temporal Cloud có 50 USD mỗi triệu action (E73); bốn mô hình còn lại có đơn giá cho một đại lượng khác, và MCP không có đơn giá nào (E31, E35); tiền mỗi lần ghi thành công thì cả năm mục đều không có, và đó là lý do mục 4 tồn tại.

Ba điều trên đọc trên bản 0.5.
Bản 0.4 chỉ có một mô hình nêu số thành phần, nên câu 2 đã đổi cách viết nhưng không thêm dữ kiện ngoài tám mục.

## 4. Chi phí quy về một đơn vị

Bảng này không phải bảng tính tiền mà chỉ nói đơn vị nào có số và đơn vị nào không.

| Mô hình | Đơn vị có giá công bố | Mức giá đã đọc ngày 2026-11-13 | Tiền mỗi lần ghi thành công |
| --- | --- | --- | --- |
| API / Function Calling | Triệu token vào và ra | 2,00 và 10,00 USD với gpt-6.1-sol ở bậc chuẩn; 0,10 USD cho đầu vào cache; 0,25 USD với Gemini 3.1 Flash Lite ở bậc Standard, 0,125 USD ở bậc Batch và Flex (E27, E30) | `KHÔNG CÓ SỐ CÔNG BỐ`, vì phụ thuộc độ dài prompt |
| MCP | Không có | Không có bảng giá, không có free tier (E31) | `KHÔNG CÓ SỐ CÔNG BỐ` |
| Workflow Engine | State transition, request, GB-second, execution, action | 0,000025 USD mỗi transition; 1,00 USD mỗi triệu request Express; 99 USD gồm 1 triệu execution; 50 USD mỗi triệu action với Temporal Cloud (E38, E40, E73) | `KHÔNG CÓ SỐ CÔNG BỐ`, vì giá tính theo bước chứ không theo bản ghi |
| Agent Orchestration | Triệu token, nhân số bước | 2,00 và 10,00 USD với Sonnet 5; 5,00 và 25,00 USD với Opus 5; cache đọc 0,1 lần (E29) | `KHÔNG CÓ SỐ CÔNG BỐ`, vì số bước không tất định |
| Event-driven | Instance-hour, GB-month, GB, request | 0,204 USD mỗi giờ; 0,10 USD mỗi GB-month; 0,01 USD mỗi GB (E56) | `KHÔNG CÓ SỐ CÔNG BỐ`, vì một lần ghi sinh nhiều event |

Kết luận của bảng này: trục chi phí ở mục 3 **chưa hoàn thành được**, và đó là trạng thái đúng của bước 02, không phải thiếu sót.
Điền số vào cột đó bằng cách ước lượng từ giá niêm yết là vi phạm chính quy tắc mà file này đặt ra ở mục 2.7.
M3 chỉ có sau khi lab chạy, tức bước 06.

## 5. Phủ SR1 đến SR8

Bảng dưới tổng hợp từ năm báo cáo lane, và chi tiết lý do ở mục Phù hợp nhu cầu của từng mục 3.x.

| SR | API / Function Calling | MCP | Workflow Engine | Agent Orchestration | Event-driven |
| --- | --- | --- | --- | --- | --- |
| SR1 một đường ghi, danh tính người yêu cầu | không nói tới | một phần | một phần | một phần | không nói tới |
| SR2 quyền kiểm ở tầng thực thi | không nói tới | một phần | một phần | một phần | không nói tới |
| SR3 phạm vi theo trường và bản ghi | một phần | một phần | không nói tới | không nói tới | không nói tới |
| SR4 điểm dừng gắn hash tham số | không nói tới | không nói tới | một phần | một phần | một phần |
| SR5 không xác định thì từ chối | không nói tới | một phần | không nói tới | một phần | không nói tới |
| SR6 chống ghi trùng | một phần | không nói tới | một phần | một phần | một phần |
| SR7 trace đủ để dựng lại | không nói tới | một phần | một phần | một phần | một phần |
| SR8 tái dùng tách khỏi quyền | một phần | cung cấp sẵn | một phần | một phần | cung cấp sẵn |

Ba điều đọc ra từ bảng, và cả ba đều là dữ kiện cho bước 03 và 04, không phải kết luận chọn:

1. Không mô hình nào có quá một ô `cung cấp sẵn`, và ô đó luôn là SR8; nghĩa là tái dùng tách khỏi quyền là thứ cả năm mô hình đều chạm tới, còn kiểm soát ghi thì không mô hình nào mang sẵn.
2. Ba năng lực không thay thế nhau: danh tính và quyền ở MCP, điểm dừng ở workflow engine và agent orchestration, chống trùng ở event-driven và workflow Standard; không có cột nào phủ cả ba.
3. SR4 vẫn là ô yếu nhất: chỉ ba mô hình ở mức `một phần`, và cả ba đều dựng điểm dừng theo id của lời gọi, không theo nội dung tham số.

Một ghi chú về SR6 của MCP: ô này giữ ở mức `không nói tới` vì giao thức không định nghĩa khóa chống trùng cho `tools/call`.
Điều đó không có nghĩa là MCP không có cơ chế chống trùng nào: cùng revision 2026-07-28 quy định server tự cấp handle, có mục State Handle Hijacking, và extension Tasks có handle bền (E32, E35).
Cơ chế đó thuộc server, không thuộc giao thức, nên nó không nâng mức phủ SR6 mà chỉ đổi chỗ phải dựng.

Hai ghi chú mới, cả hai không đổi ô nào:

- SR6 của workflow engine nay có hai cơ chế cụ thể ở tầng start là idempotent của StartExecution với Standard và ràng buộc một lần chạy mở cho mỗi Workflow Id của Temporal, nhưng cả hai dừng ở tầng start nên vẫn là `một phần` (E63, E64).
- SR8 của agent orchestration nay có hai cơ chế tái dùng rõ ràng là handoff và agent-as-tool, nhưng quyền không tách theo agent nên vẫn là `một phần` (E66, E67, E44).

### 5.1. Đối chiếu với file 08

File 08 chưa review, nên dùng để đối chiếu trạng thái chứ không phải để khớp, và không phải bằng chứng.

| Ô | File 08 | Bảng mục 5 | Xử lý |
| --- | --- | --- | --- |
| SR2 của agent orchestration | `có` | `một phần` | Giữ `một phần`, vì nguồn chỉ nói quy tắc duyệt fail closed, không nói kiểm quyền (E44) |
| SR5 của agent orchestration | `có` | `một phần` | Giữ `một phần`, cùng lý do |
| SR8 của event-driven | `một phần` | `cung cấp sẵn` | Giữ `cung cấp sẵn`, vì định dạng event tách hẳn khỏi giao thức (E53) |

Ba chỗ lệch trên không phải lỗi số học, mà là khác nhau ở việc đọc "một phần" nghĩa là gì.
Vì file 08 chưa review, cả ba chỗ để bước 03 chốt lại định nghĩa ba mức, chứ không tự sửa file 08.

## 6. Ba câu bước 02 được phép kết luận

1. **Không mô hình nào tự nó là câu trả lời:** không cột nào phủ đủ SR1 đến SR8, và ô mạnh nhất của mỗi mô hình nằm ở một năng lực khác nhau: MCP nối và chuẩn hóa hợp đồng, workflow giữ trạng thái và chờ, orchestration quyết bước, event lan truyền thay đổi, function calling là hợp đồng giữa model và mã; vì vậy tổ hợp là bắt buộc, không phải lựa chọn thẩm mỹ.
2. **Cột chi phí chưa so được:** năm đơn vị giá khác nhau, và đơn vị cần dùng là tiền mỗi lần ghi thành công thì chưa nguồn nào công bố; bảng ở mục 4 ghi rõ chỗ trống thay vì lấp bằng ước lượng.
3. **Điều kiện để một mô hình bị loại ở bước 04 đã rõ:** chỉ loại khi thiếu một năng lực mà không mô hình nào khác bù được, hoặc khi chạm giới hạn cứng thấp hơn nhu cầu lab, và mọi lý do loại phải kèm một mục con của mục 3 hoặc một dòng của mục 5.

Điều bước 02 **không** được nói là chọn mô hình nào, vì câu đó thuộc bước 04, sau khi bước 03 trả lời các câu hỏi ở mục 7.

## 7. Ô trống chuyển sang bước 03 và 06

| Ô trống | Vì sao trống | Trả lời bằng |
| --- | --- | --- |
| M3, tiền mỗi lần ghi thành công, cả năm mô hình | Không nguồn nào công bố, và đơn vị giá khác nhau | Đo trên lab ở bước 06, cùng một tác vụ, cùng một bộ dữ liệu |
| M1 p50 và p95, cả năm mô hình | Không có số đo hiệu năng trong tài liệu chính thức | Đo tại chỗ, tách thời gian model, policy, executor |
| Ba chỗ lệch với file 08 ở mục 5.1 | File 08 chưa review và định nghĩa ba mức chưa chốt | Chốt định nghĩa ba mức ở bước 03, rồi sửa cả hai bên |
| Giá SQS FIFO | Trang đã mở là trang kỹ thuật, không phải trang giá | Mở trang giá SQS trước bước 04 |
| Giá Schema Registry | Trang đã mở chỉ nêu tên gói, không nêu đơn giá | Mở trang giá Confluent trước bước 04 |
| Câu định nghĩa user task của BPMN 2.0 | Bản PDF chỉ trích xuất được một phần | Mở bản HTML của mục 10.3.4 |
| Trần thời lượng một lần chạy của Temporal | Trang timeout trả 404 | Tìm trang khác cùng nội dung, hoặc ghi là không xác minh được |
| Cách gắn danh tính người yêu cầu vào event | Chưa mô hình nào định nghĩa, và định dạng mở rộng chưa chốt | Thiết kế một extension attribute, rồi kiểm ở bước 05 |
| Nghĩa của "30 tool" khi đo M4 | Chưa chốt là 30 tool, 30 event type hay 30 topic | Chốt trước lần chạy đầu, ghi ngày chốt |
| Số bước trung bình của một lần ghi | Không nguồn nào công bố, và phụ thuộc tác vụ | Đo ở bước 06 cùng M3 |

Hai ô đã đóng trong bản 0.5:

- Chi phí Temporal Cloud: đã mở được trang giá ngày 2026-11-13, số nằm ở E73.
- Giá OpenAI trong lane orchestration: trang mở lại được, mức giá nằm ở E27; câu 403 cũ giữ lại như một sự kiện của lượt mở trước.

## 8. Sổ nguồn

Cột "Vai" cho biết nguồn thuộc loại quy phạm, mục đích hay cả hai.
Nguồn quy phạm nói cơ chế bắt buộc hoặc hành vi chính xác.
Nguồn mục đích nói vì sao mô hình tồn tại, ai được gì, và đánh đổi ở đâu.
Cột "Kiểm" ghi kết quả mở lại ngày 2026-11-13.
Mọi dòng trong bảng dưới đây đều mở ngày 2026-11-13; chỗ mở được một phần hoặc không mở được thì ghi ngay trong cột Kiểm.

| ID | Nguồn | Vai | URL | Câu trích | Kiểm |
| --- | --- | --- | --- | --- | --- |
| E24 | Function calling, OpenAI | Quy phạm | https://developers.openai.com/api/docs/guides/function-calling | "A function is a specific kind of tool, defined by a JSON schema." | mở được, khớp |
| E25 | How tool use works, Anthropic | Quy phạm | https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works | "The model never runs anything on its own. It emits a structured request, your code" | mở được, khớp |
| E26 | Function calling, Gemini API | Quy phạm | https://ai.google.dev/gemini-api/docs/function-calling | "Instead of generating text responses, the model determines when to call specific functions" | mở được, khớp |
| E27 | Pricing, OpenAI API | Mục đích | https://developers.openai.com/api/docs/pricing | "Prices per 1M tokens." | mở được, khớp |
| E28 | Tool search, OpenAI | Quy phạm | https://developers.openai.com/api/docs/guides/tools-tool-search | "Tool search allows the model to dynamically search for and load tools into the model's context as needed." | mở được, khớp |
| E29 | Model pricing, Anthropic | Mục đích | https://platform.claude.com/docs/en/about-claude/pricing | "All prices are in USD." | mở được, khớp |
| E30 | Gemini Developer API pricing | Mục đích | https://ai.google.dev/gemini-api/docs/pricing | "Paid Tier, per 1M tokens in USD" | mở được, khớp |
| E31 | Specification, revision 2026-07-28 | Quy phạm | https://modelcontextprotocol.io/specification/2026-07-28 | "While MCP itself cannot enforce these security principles at the protocol level" | mở được, khớp |
| E32 | Key Changes, changelog 2026-07-28 | Quy phạm | https://modelcontextprotocol.io/specification/2026-07-28/changelog | "A broken response stream loses the in-flight request; clients MUST re-issue it as a new request with a new request ID" | mở được, khớp |
| E33 | Authorization | Quy phạm | https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization | "MCP servers MUST NOT accept or transit any other tokens." | mở được, khớp |
| E34 | Security Best Practices | Quy phạm | https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices | "MCP servers MUST NOT accept any tokens that were not explicitly issued for the MCP server." | mở được, khớp |
| E35 | Tools | Quy phạm | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | "The protocol has no concept of a state handle" | mở được, khớp, câu non-normative |
| E36 | Temporal Workflow Definition | Quy phạm | https://docs.temporal.io/workflow-definition | "it makes the same Workflow API calls in the same sequence, given the same input" | mở được, khớp |
| E37 | Temporal, message passing Python SDK | Quy phạm | https://docs.temporal.io/develop/python/message-passing | "The call returns when the server accepts the Signal; it does not wait for the Signal to be delivered to the Workflow Execution." | mở được, khớp |
| E38 | AWS Step Functions Pricing | Mục đích | https://aws.amazon.com/step-functions/pricing/ | "Step Functions counts a state transition each time a step of your workflow is executed" | mở được, khớp |
| E39 | AWS, choosing workflow type | Quy phạm | https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html | "Standard Workflows follow an exactly-once model, where your tasks and states are never run more than once" | mở được, khớp |
| E40 | Inngest Pricing | Mục đích | https://www.inngest.com/pricing | "A single durable function run or step execution" | mở được, khớp |
| E41 | OMG BPMN 2.0, bản PDF | Quy phạm | https://www.omg.org/spec/BPMN/2.0/PDF/ | KHÔNG TRÍCH ĐƯỢC, bản trích xuất chỉ có 100 trên 538 trang | mở được một phần |
| E42 | OMG BPMN 2.0.2, bản PDF | Quy phạm | https://www.omg.org/spec/BPMN/2.0.2/PDF | "10.3.4 Human Interactions" | mở được một phần, câu trích là dòng mục lục trang 163 |
| E43 | Temporal, workflow execution timeouts | Quy phạm | https://docs.temporal.io/workflow-execution/timeouts | Trang trả 404, không mở được | không |
| E44 | Human-in-the-loop, OpenAI Agents SDK | Quy phạm | https://openai.github.io/openai-agents-python/human_in_the_loop/ | "Tools declare when they need approval, run results surface pending approvals as interruptions" | mở được, khớp |
| E45 | Running agents, OpenAI Agents SDK | Quy phạm | https://openai.github.io/openai-agents-python/running_agents/ | "If we exceed the max_turns passed, we raise a MaxTurnsExceeded exception" | mở được, khớp |
| E46 | Interrupts, LangGraph | Quy phạm | https://docs.langchain.com/oss/python/langgraph/interrupts | "The node restarts from the beginning of the node where the interrupt was called when resumed" | mở được, khớp |
| E47 | How the agent loop works, Claude Agent SDK | Quy phạm | https://code.claude.com/docs/en/agent-sdk/agent-loop | "Without limits, the loop runs until Claude finishes on its own" | mở được, khớp |
| E48 | Track cost and usage, Claude Agent SDK | Quy phạm | https://code.claude.com/docs/en/agent-sdk/cost-tracking | "client-side estimates, not authoritative billing data" | mở được, khớp |
| E50 | Amazon Bedrock AgentCore Pricing | Mục đích | https://aws.amazon.com/bedrock/agentcore/pricing/ | "flexible, consumption-based pricing with no upfront commitments" | mở được, khớp |
| E51 | Kafka Message Delivery Guarantees, Confluent | Quy phạm | https://docs.confluent.io/kafka/design/delivery-semantics.html | "At least once: This means messages are delivered one or more times" | mở được, khớp |
| E52 | Pattern: Transactional outbox | Quy phạm | https://microservices.io/patterns/data/transactional-outbox.html | "first store the message in the database as part of the transaction" | mở được, khớp |
| E53 | CloudEvents specification | Quy phạm | https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | "MUST include context attributes designated as REQUIRED" | mở được, khớp, bản nháp 1.0.3-wip |
| E54 | Idempotent requests, Stripe API | Quy phạm | https://docs.stripe.com/api/idempotent_requests | "Idempotency keys are up to 255 characters long" | mở được, khớp |
| E55 | Message deduplication ID, Amazon SQS | Quy phạm | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html | "within a 5-minute deduplication window, only one instance of a message" | mở được, khớp |
| E56 | Managed Apache Kafka, Amazon MSK pricing | Mục đích | https://aws.amazon.com/msk/pricing/ | "0.204 (price per hour for a kafka.m7g.large)" | mở được, khớp |
| E57 | What is MCP, MCP docs | Mục đích | https://modelcontextprotocol.io/docs/getting-started/intro | "MCP (Model Context Protocol) is an open-source standard for connecting AI applications to external systems." | mở được, khớp |
| E58 | Introducing the Model Context Protocol, Anthropic | Mục đích | https://www.anthropic.com/news/model-context-protocol | "Every new data source requires its own custom implementation, making truly connected systems difficult to scale." | mở được, khớp |
| E59 | Architecture overview, MCP docs | Quy phạm mô tả | https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture | "MCP focuses solely on the protocol for context exchange" | mở được, khớp |
| E60 | Extensions Overview, MCP docs | Quy phạm | https://modelcontextprotocol.io/extensions/overview | "Extensions are always disabled by default and require explicit opt-in from the developer, at every stage." | mở được, khớp |
| E61 | Tool use overview, Anthropic | Mục đích | https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview | "Tool use (also called function calling) lets Claude call functions that you define or that Anthropic provides." | mở được, khớp |
| E62 | What is AWS Step Functions | Mục đích | https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html | "Each step in a workflow is called a state." | mở được, khớp |
| E63 | StartExecution, Step Functions API | Quy phạm | https://docs.aws.amazon.com/step-functions/latest/apireference/API_StartExecution.html | "StartExecution is idempotent for STANDARD workflows." | mở được, khớp |
| E64 | Workflow Id and Run Id, Temporal | Quy phạm | https://docs.temporal.io/workflow-execution/workflowid-runid | "Temporal guarantees that there can be at most one Workflow Execution with a given ID running at any point in time" | mở được, khớp |
| E65 | Understanding Temporal | Mục đích | https://docs.temporal.io/evaluate/understanding-temporal | "Temporal runs your application code as a Durable Execution." | mở được, khớp |
| E66 | Handoffs, OpenAI Agents SDK | Quy phạm | https://openai.github.io/openai-agents-python/handoffs/ | "Handoffs are represented as tools to the LLM." | mở được, khớp |
| E67 | Tools, OpenAI Agents SDK | Quy phạm | https://openai.github.io/openai-agents-python/tools/ | "Agents as tools: expose an agent as a callable tool without a full handoff." | mở được, khớp |
| E68 | Building effective agents, Anthropic | Mục đích | https://www.anthropic.com/engineering/building-effective-agents | "Workflows are systems where LLMs and tools are orchestrated through predefined code paths." | mở được, khớp, bài đã cũ |
| E69 | Pattern: Event-driven architecture | Mục đích | https://microservices.io/patterns/data/event-driven-architecture.html | "Use an event-driven, eventually consistent approach." | mở được, khớp |
| E70 | Schema Registry, Confluent | Quy phạm | https://docs.confluent.io/platform/current/schema-registry/index.html | "Schema Registry provides a centralized repository for managing and validating schemas for topic message data" | mở được, khớp |
| E71 | Workflow execution limits, Temporal | Quy phạm | https://docs.temporal.io/workflow-execution/limits | "the Workflow Execution's Event History is limited to 51,200 Events or 50 MB and will warn you after 10,240 Events or 10 MB" | mở được, khớp |
| E72 | Kafka Introduction, Apache | Mục đích | https://kafka.apache.org/intro | "producers and consumers are fully decoupled and agnostic of each other" | mở được, khớp |
| E73 | Temporal Pricing | Mục đích | https://temporal.io/pricing | "Starting at $50 per million actions" | mở được, khớp |

Mã E49 được bỏ trống một cách có chủ ý, vì nó trùng URL với E29 và đã gộp vào E29.
Tổng: 49 nguồn, trong đó 17 nguồn mới E57 đến E73, 2 nguồn mở được một phần E41 và E42, 1 nguồn trả 404 E43.
Riêng E53 được kiểm trên bản raw của cùng tệp, vì trang GitHub HTML không phải lúc nào cũng trả nội dung khi mở tự động.

### 8.1. Câu trích bổ sung cho các dữ kiện chịu tải

| ID | URL | Câu trích | Dùng cho |
| --- | --- | --- | --- |
| E24 | https://developers.openai.com/api/docs/guides/function-calling | "callable function definitions count against the model's context limit and are billed as input tokens" | Cơ chế và Chi phí của 3.1 |
| E24 | https://developers.openai.com/api/docs/guides/function-calling | "Aim for fewer than 20 functions available at the start of a turn at any one time, though this is just a soft suggestion" | Mở rộng của 3.1 |
| E25 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works | "Every tool call is at least one extra round trip" | Nhược của 3.1 |
| E26 | https://ai.google.dev/gemini-api/docs/function-calling | "Keep active set to 10-20 tools maximum" | Mở rộng của 3.1 |
| E26 | https://ai.google.dev/gemini-api/docs/function-calling | "the API rejects the request with a 400 INVALID_ARGUMENT error" | Nhược của 3.1 |
| E28 | https://developers.openai.com/api/docs/guides/tools-tool-search | "In the Responses API, only gpt-5.4 and later models support tool_search" | Mở rộng của 3.1 |
| E32 | https://modelcontextprotocol.io/specification/2026-07-28/changelog | "Remove protocol-level sessions and the Mcp-Session-Id header from the Streamable HTTP transport." | Bảo trì của 3.2 |
| E33 | https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization | "MCP clients MUST implement Resource Indicators for OAuth 2.0 as defined in [RFC 8707]" | Bảo mật của 3.2 |
| E33 | https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations | "MCP clients MUST implement PKCE according to [OAuth 2.1 Section 7.5.2]" | Bảo mật của 3.2, trang con của E33 |
| E35 | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | "clients MUST consider tool annotations to be untrusted unless they come from trusted servers." | Bảo mật của 3.2 |
| E35 | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | "Servers SHOULD return tools in a deterministic order" | Mở rộng của 3.2 |
| E35 | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | "Deterministic ordering enables clients to reliably cache the tool list and improves LLM prompt cache hit rates" | Chi phí của 3.2 |
| E35 | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | "Tool names SHOULD be between 1 and 128 characters in length (inclusive)." | Mở rộng của 3.2 |
| E35 | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | "Tool names SHOULD be unique within a server." | Mở rộng của 3.2 |
| E35 | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | "Clients or proxies that aggregate tools from multiple servers MAY encounter naming collisions" | Mở rộng của 3.2 |
| E35 | https://modelcontextprotocol.io/specification/2026-07-28/server/tools | "The set MAY vary by the authorization presented on the request" | Mở rộng của 3.2 |
| E57 | https://modelcontextprotocol.io/docs/getting-started/intro | "making it easy to build once and integrate everywhere" | Ưu của 3.2 |
| E58 | https://www.anthropic.com/news/model-context-protocol | "Instead of maintaining separate connectors for each data source, developers can now build against a standard protocol." | Ưu của 3.2 |
| E59 | https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture | "The MCP host accomplishes this by creating one MCP client for each MCP server." | Cơ chế của 3.2 |
| E59 | https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture | "remote MCP servers that use the Streamable HTTP transport will typically serve many MCP clients" | Ưu của 3.2 |
| E59 | https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture | "Clients that federate many servers can use progressive tool discovery rather than loading every tool upfront." | Mở rộng của 3.2 |
| E59 | https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices | "Implement a threshold as a percentage of the context window. For example, 1%-5%." | Mở rộng của 3.2, trang phụ của E59 |
| E59 | https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices | "Append newly discovered definitions after the cache breakpoint rather than re-sorting the tools array" | Mở rộng của 3.2, trang phụ của E59 |
| E59 | https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices | "wastes tokens, increases latency, and degrades model performance" | Chi phí của 3.2, trang phụ của E59 |
| E71 | https://docs.temporal.io/workflow-execution/limits | "Temporal enforces a maximum number of incomplete Activities, Child Workflows, Signals, or Cancellation requests per Workflow Execution (by default, 2,000 for each type of operation)" | Mở rộng của 3.3 |
| E73 | https://temporal.io/pricing | "Self service down to $25 per million actions" | Chi phí của 3.3 |
| E73 | https://temporal.io/pricing | "Business Starting at $500/month" | Chi phí của 3.3 |
| E39 | https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html | "Standard Workflows are ideal for long-running (up to one year)" | Mở rộng của 3.3 |
| E39 | https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html | "They can run for up to five minutes." | Mở rộng của 3.3 |
| E39 | https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html | "Execution history is not captured by Step Functions." | Mở rộng của 3.3, cột Express |
| E44 | https://openai.github.io/openai-agents-python/human_in_the_loop/ | "Approval permits a tool call to execute; it does not guarantee exactly-once execution." | Bảo mật của 3.4 |
| E44 | https://openai.github.io/openai-agents-python/human_in_the_loop/ | "Persistent shell and file-edit decisions are not agent-scoped" | Nhược của 3.4 |
| E45 | https://openai.github.io/openai-agents-python/running_agents/ | "The service processes one response at a time on each websocket connection and limits a connection to 60 minutes." | Mở rộng của 3.4 |
| E46 | https://docs.langchain.com/oss/python/langgraph/interrupts | "Graph waits indefinitely until you resume execution with a response" | Mở rộng của 3.4 |
| E47 | https://code.claude.com/docs/en/agent-sdk/agent-loop | "Spend can therefore pass the cap by up to the cost of that one response" | Nhược của 3.4 |
| E51 | https://docs.confluent.io/kafka/design/delivery-semantics.html | "For the default isolation level, read_uncommitted, all messages, even ones in aborted transactions, are visible to consumers." | Nhược của 3.5 |
| E51 | https://docs.confluent.io/kafka/design/delivery-semantics.html | "Kafka supports exactly-once delivery in Kafka Streams and uses transactional producers and consumers to provide exactly-once delivery when transferring and processing data between Kafka topics." | Ưu của 3.5 |
| E52 | https://microservices.io/patterns/data/transactional-outbox.html | "It might, for example, crash after publishing a message but before recording the fact that it has done so." | Nhược của 3.5 |
| E52 | https://microservices.io/patterns/data/transactional-outbox.html | "a message consumer must be idempotent" | Bảo trì của 3.5 |
| E53 | https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | "Sensitive information SHOULD NOT be carried or represented in context attributes." | Bảo mật của 3.5 |
| E53 | https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | "Intermediaries MUST forward events of a size of 64 KiB or less." | Mở rộng của 3.5 |
| E53 | https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | "Consumers SHOULD accept events of a size of at least 64 KiB." | Mở rộng của 3.5 |
| E53 | https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | "The source is the context in which the occurrence happened." | Bảo mật của 3.5 |
| E54 | https://docs.stripe.com/api/idempotent_requests | "For API v1, you can remove keys from the system automatically after they're at least 24 hours old." | Mở rộng của 3.5 |
| E55 | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html | "Amazon SQS continues tracking the deduplication ID even after the message has been received and deleted." | Bảo mật của 3.5 |
| E56 | https://aws.amazon.com/msk/pricing/ | "0.10 (the price per GB-month in US East region)" | Chi phí của 3.5 |
| E56 | https://aws.amazon.com/msk/pricing/ | "0.01 (price per GB of data ingested)" | Chi phí của 3.5 |
| E62 | https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html | "Call a service with a task token, and have Step Functions wait until the task token returns with a callback." | Phù hợp nhu cầu của 3.3 |
| E63 | https://docs.aws.amazon.com/step-functions/latest/apireference/API_StartExecution.html | "If the execution is closed or if the input is different, it returns a 400 ExecutionAlreadyExists error. You can reuse the name 90 days after it closes." | Nhược của 3.3 |
| E63 | https://docs.aws.amazon.com/step-functions/latest/apireference/API_StartExecution.html | "StartExecution isn't idempotent for EXPRESS workflows." | Nhược của 3.3 |
| E64 | https://docs.temporal.io/workflow-execution/workflowid-runid | "Do not include sensitive data, secrets, or personally identifiable information (PII) as a Workflow Id." | Bảo mật của 3.3 |
| E65 | https://docs.temporal.io/evaluate/understanding-temporal | "replays the Workflow code against it to rebuild local state, and continues from the point of failure" | Cơ chế của 3.3 |
| E66 | https://openai.github.io/openai-agents-python/handoffs/ | "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history." | Bảo mật của 3.4 |
| E66 | https://openai.github.io/openai-agents-python/handoffs/ | "Nested handoff history changes how the transcript is represented; it does not redact sensitive data." | Bảo mật của 3.4 |
| E67 | https://openai.github.io/openai-agents-python/tools/ | "the parent run's conversation state is not inherited automatically" | Ưu của 3.4 |
| E67 | https://openai.github.io/openai-agents-python/tools/ | "As a rule of thumb, keep each namespace fairly small, ideally fewer than 10 functions." | Mở rộng của 3.4 |
| E68 | https://www.anthropic.com/engineering/building-effective-agents | "Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage" | Cơ chế của 3.4 |
| E68 | https://www.anthropic.com/engineering/building-effective-agents | "Agentic systems often trade latency and cost for better task performance" | Ưu và Nhược của 3.4 |
| E69 | https://microservices.io/patterns/data/event-driven-architecture.html | "The programming model is more complex" | Nhược của 3.5 |
| E70 | https://docs.confluent.io/platform/current/schema-registry/index.html | "Compatibility checking of schemas between producers and consumers" | Ưu của 3.5 |
| E70 | https://docs.confluent.io/platform/current/schema-registry/index.html | "A REST service for validating, storing, and retrieving Avro, JSON Schema, and Protobuf schemas" | Bảo trì của 3.5 |
| E72 | https://kafka.apache.org/intro | "Kafka guarantees that any consumer of a given topic-partition will always read that partition's events in exactly the same order as they were written." | Mở rộng của 3.5 |
| E73 | https://temporal.io/pricing | "$0.042/GBhr Active Storage" | Chi phí của 3.3 |

## 9. Giới hạn

- Chưa có số đo nào trên lab, nên mọi ô M1 đến M6 trong file này để trống hoặc ghi `chưa chấm`.
- Năm lane chạy độc lập và không đọc file của nhau, nên cùng một nguồn có thể được hai lane mở với hai kết luận khác nhau; chỗ đã thấy lệch được ghi ở mục 5.1 và mục 7.
- Lượt kiểm độc lập ở bản 0.2 ghi nhận lane MCP khi đó không ghi lại việc mở trang nào trong cột "tự kiểm"; năm nguồn E31 đến E35 đã được lượt kiểm độc lập mở lại và khớp câu trích, nhưng chính lượt đó bắt được hai chỗ dùng sai: câu về state handle bị dùng như kết luận ở tầng giao thức, và tên tool 1 đến 128 ký tự là SHOULD chứ không phải giới hạn cứng; cả hai đã sửa ở bản 0.2, và một trong hai ảnh hưởng tới cách đọc SR6 của MCP ở mục 5.
- Lượt kiểm độc lập tìm được 5 chỗ lệch trên 21 khẳng định; ngoài hai chỗ ở lane MCP, ba chỗ còn lại là giá Gemini 3.1 Flash Lite lấy nhầm bậc Batch, Express bị gộp chung hai ngữ nghĩa đồng bộ và bất đồng bộ, và ngưỡng 64 KiB của CloudEvents bị ghi là không có số; cả ba đã sửa, và tỉ lệ lệch này là lý do không được dùng file này làm bằng chứng cho ADR trước khi review.
- Năm mục so sánh ở mục 3 dựa trên các trang mở ngày 2026-11-13, và giá cùng revision thay đổi, nên mọi số phải đọc lại tại ngày đo.
- Năm lane của bản 0.5 đều viết bằng tiếng Việt có dấu; bản tổng hợp giữ nguyên nội dung số từ lane, không sửa.
- File `07` và `08` chưa review nên không được dùng làm bằng chứng trong bất kỳ mục con nào của mục 3, mục 4 và mục 5.

Năm chỗ lệch nguồn mới, đã sửa trong bản 0.5:

1. E31 từng được dẫn cho cơ chế feature lifecycle và deprecation; nội dung đó nằm ở E32, mục Governance, với cửa sổ deprecation tối thiểu 12 tháng.
2. Bảng lỗi của E33 có ba mã 401, 403 và 400; bản 0.4 chỉ ghi 401 và 403, nay thêm 400.
3. Câu "thứ tự chỉ trong một partition" từng được dẫn E51; E51 không nói câu đó, nên nay dẫn E72.
4. Câu "exactly-once trong một partition" làm mô hình yếu hơn nguồn; E51 nói exactly-once giữa các topic bằng transactional producer và consumer được cấu hình đúng, nên nay viết lại theo E51.
5. Danh sách "ít nhất bốn thành phần" của event-driven từng gán cho E52; E52 liệt kê bốn participant là sender, database, message outbox và message relay, nên đếm đủ là sáu thành phần, và con số bốn được giữ lại như số participant của pattern.

Hai chỗ lệch thời điểm, không phải lỗi nội dung:

- Trang giá OpenAI trả 403 ở lượt mở đầu trong lane orchestration, nay mở được; mức giá nằm ở E27.
- Bảng giá AgentCore mở được nhưng không trích xuất được ở lượt đầu, nay trích xuất được; bản 0.5 không dùng số AgentCore vì tầng điều phối không có đơn giá riêng.

## 10. Việc tiếp theo

| Thứ tự | Việc | Xong khi |
| --- | --- | --- |
| 1 | Review file này, bắt đầu từ mục 3.1 đến 3.7 và mục 5 | Anh Hiệp đọc hết, mọi liên kết mở được |
| 2 | Chốt câu chữ về chống trùng của MCP cho báo cáo MCP | Báo cáo MCP không còn viết MCP thiếu cơ chế chống trùng, mà viết rõ cơ chế đó thuộc server |
| 3 | Chốt định nghĩa ba mức `cung cấp sẵn`, `một phần`, `không nói tới` | Có định nghĩa bằng một câu, ghi ngày, áp cho cả file 08 |
| 4 | Chốt nghĩa của "30 tool" trước lần đo M4 | Có ngày chốt sớm hơn ngày chạy đầu |
| 5 | Mở lại các ô trống về giá ở mục 7 | Mỗi ô có số hoặc có ghi `KHÔNG CÓ SỐ CÔNG BỐ` kèm ngày |
| 6 | Chuyển bảng mục 5 sang bước 03 làm dữ kiện cho câu Q6 | Mỗi câu hỏi ở bước 03 trỏ được về một dòng của mục 5 |
| 7 | Kiểm lại hai câu đã sửa về event-driven với nguồn gốc | Câu exactly-once và câu thứ tự khớp nguyên văn E51 và E72 |

## Nhật ký revision

| Ngày | Người | Thay đổi | Trạng thái |
| --- | --- | --- | --- |
| 2026-11-13 | Agent (Pi) | Tạo file. Năm lane research song song, mỗi lane một mô hình, ghi vào `.research/compare/`. Tổng hợp thành mục 3, 4, 5, 8. Mục 1, 2, 6, 7, 9, 10 do agent viết. Chưa có số đo, không chọn mô hình | Chưa review |
| 2026-11-13 | Agent (Pi) | v0.2. Sau lượt kiểm bằng chứng độc lập 21 khẳng định, sửa 5 chỗ: giá Gemini 3.1 Flash Lite lấy nhầm bậc Batch, câu về state handle của MCP bị dùng sai tầng, ngưỡng 64 KiB của CloudEvents bị ghi là không có số, Express đồng bộ và bất đồng bộ bị gộp, tên tool là SHOULD chứ không phải giới hạn cứng. Thêm ghi chú SR6 của MCP và mục kết quả lượt kiểm ở mục 9 | Chưa review |
| 2026-11-13 | Agent (Pi) | v0.3. Đổi mục 3 từ một bảng năm cột sang một mục cho mỗi mô hình (3.1 đến 3.5), giữ nguyên bảy dòng, câu chữ và mã nguồn. Thêm mục 3.6 đọc chéo ba trục. Cập nhật các chỗ trỏ tới mục 3 ở C3, C4, mục 6, mục 9 và mục 10 | Chưa review |
| 2026-11-13 | Agent (Pi) | v0.4. Tách bảy trục của mỗi mô hình thành bảy mục con (3.x.1 đến 3.x.7), viết lại phần chữ để mỗi ý một dòng. Không thêm dữ kiện, không đổi mã nguồn, không bỏ mức bắt buộc hay nhãn `KHÔNG CÓ SỐ CÔNG BỐ`. Bỏ bảng hai cột, chỉ còn ba bảng thật ở mục 3.3.3, 3.3.4 và 3.5.4. Giảm mật độ trích dẫn: mã nguồn chỉ gắn ở câu mang số liệu, mức bắt buộc hoặc tên cơ chế. Cập nhật mục 0, C3, C4, 3.6, mục 6 và mục 9 theo cách gọi mới. Sửa một chỗ lệch có từ bản 0.2: mục 3.1.7 bỏ sót SR8, trong khi bảng phủ ở mục 5 ghi SR8 ở mức `một phần`, nay đã khớp | Chưa review |
| 2026-11-13 | Agent (Pi) | v0.5. Viết lại để một người đọc ra quyết định. Thêm mục 3.x.0 Cơ chế trước bảy trục, định nghĩa bảy trục và bốn nhãn bằng chứng ở mục 0, viết lại Ưu theo "được gì, cho ai, ở quy mô nào", viết lại Nhược theo "mất gì, vỡ ở đâu trước", thêm mục 3.6 với năm ca sai, đổi mục 3.6 cũ thành 3.7. Trả lại sáu dữ kiện: thêm server mới thay vì nhồi thêm tool, annotation không được tin, extension opt-in, tools/list thứ tự tất định để cache prompt, handoff và agent-as-tool, phản hồi idempotent khi start execution trùng tên. Thêm 17 nguồn E57 đến E73. Sửa năm chỗ lệch nguồn ở mục 9. Giữ toàn bộ mã E24 đến E56 và toàn bộ con số của bản 0.4; không mã nào bị bỏ | Chưa review |
