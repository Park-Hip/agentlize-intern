# Đo Q2: hai trợ lý, hai cửa nối

Ngày: 2026-11-22. Trạng thái: đã chạy 240 hội thoại thật, chọn kết luận Q2 và ghi vào spec.

## Đọc nhanh

- Lab so hai cách nối một trợ lý với bộ công cụ: theo một chuẩn chung và theo cách gọi hàm thường.
- Cách theo chuẩn chung viết 127 dòng; cách gọi hàm viết 95 dòng nối nhưng phải chép thêm 155 dòng mô tả công cụ, tổng 250 dòng.
- Phần cổng của cách theo chuẩn chung chậm hơn 5 tới 26 mili giây mỗi hội thoại, còn tổng thời gian do mô hình chi phối nên chênh lệch không theo một chiều.
- Trong 240 hội thoại, hai cách đúng 231; cả 9 lần sai là mô hình đọc dữ liệu rồi không soạn đề xuất.
- Kết luận: dùng chuẩn chung khi có từ hai trợ lý trở lên, kể cả cùng một nhóm viết; chuẩn chung chỉ mang lời gọi, không mang an toàn.

## 1. Câu hỏi và cách đo

Q2 hỏi: thêm một trợ lý thứ hai thì nối qua MCP tiết kiệm bao nhiêu công so với gọi hàm, và đổi lại chậm hơn, kém ổn định hơn hay đắt hơn bao nhiêu ([spec, mục 2.2](../design/mvp-spec.md#22-q2-thêm-một-trợ-lý-thứ-hai-thì-mcp-tiết-kiệm-bao-nhiêu-công-so-với-gọi-hàm-và-phải-trả-giá-gì)).

MCP (Model Context Protocol) là một chuẩn chung để nhiều phần mềm gọi cùng một bộ công cụ: công cụ viết một lần, phần mềm nào hỗ trợ MCP cũng đọc được danh mục và gọi được.
Gọi hàm (function calling) là cách mỗi trợ lý tự khai báo công cụ cho mô hình rồi tự gọi API của cổng.

Hai trợ lý của Lab dùng cùng một cổng, cùng sáu công cụ, cùng bộ luật quyền, cùng mô hình `deepseek-flash`, cùng câu lệnh hệ thống và cùng bốn việc:

| Mã việc | Người gõ | Câu người dùng gõ |
| --- | --- | --- |
| `lookup-minh-phone` | chị Hoa | Cho tôi số điện thoại của anh Minh. |
| `assign-t12-to-minh` | chị Hoa | Chuyển task T-12 sang cho anh Minh, hạn thứ Sáu. |
| `reassign-lan-tasks` | chị Hoa | Chuyển hết 30 task đang mở của chị Lan sang cho anh Minh. |
| `nam-assign-t12` | Nam | Chuyển task T-12 sang cho anh Minh. |

Trợ lý A đi qua MCP, trợ lý B đi qua gọi hàm ([cửa MCP](../../lab/assistants/src/mcp/door.ts), [cửa gọi hàm](../../lab/assistants/src/function-calling/door.ts)).
Hai cửa đọc cùng một danh mục công cụ: A lấy từ `tools/list` của cổng, B chép tay từ `GET /v1/tools`, và `catalog-parity-test.ts` giữ hai bản giống từng chữ, từng schema ([phép thử canh lệch](../../lab/assistants/src/function-calling/catalog-parity-test.ts)).

Hai lớp chạy:

- **Lớp sạch:** 4 việc × 2 cửa × 20 lần = 160 hội thoại, không gây lỗi.
- **Lớp có lỗi:** việc chuyển T-12 và việc chuyển 30 task, mỗi cửa 20 lần = 80 hội thoại, có lỗi mạng và hết giờ ở lời gọi công cụ như M2 (độ ổn định) của lớp tự động.

Mỗi nhóm chạy trên một cụm riêng ở cổng 8850-8853, một thư mục dữ liệu tạm và một bộ khoá mới, nên bộ đếm duyệt hàng loạt trong 60 phút không mang sang nhóm sau.
Mọi lần chạy ngoài giờ cao điểm, không dùng `--allow-peak`, và lệnh đọc số dư DeepSeek trước khi chạy rồi dừng khi dưới 0,20 USD.
Mỗi lần chạy ghi một file tóm tắt và một file mẫu nén, tên theo commit `ef00f76`; bản tóm tắt giữ `sha256` của file mẫu.

Bốn chỉ số của Q2 được đọc như sau:

- **M1 (thời gian):** p50 và lần chậm nhất của phần mô hình, phần cổng và tổng, cho từng việc và từng cửa.
- **M2 (độ ổn định):** số lần đúng kết quả cuối, số lỗi mạng, số lần hết giờ, số lần gửi lại, số lần ghi trùng và số lệnh mất.
- **M3 (chi phí):** token vào, token trúng bộ nhớ đệm, token ra, tiền, và tiền cho mỗi lần đúng.
- **M6 (công sức dùng lại):** giờ công, dòng mã, file cổng phải sửa, thứ tự viết.

**Kết luận:** hai cửa nhận cùng một mô hình, cùng một câu lệnh và cùng một danh mục công cụ, nên khác biệt còn lại chỉ có thể đến từ cách nối hoặc từ dao động của mô hình.

## 2. Việc của Nam: lần sai còn lại

Lần chạy sau #138 ghi ba lần mỗi cửa cho việc Nam chuyển T-12: cửa MCP đúng 3/3 ([kết quả MCP](results/2026-11-22-assistant-mcp-nam-assign-t12-be0069a.json)), cửa gọi hàm đúng 2/3 ([kết quả gọi hàm](results/2026-11-22-assistant-function-nam-assign-t12-be0069a.json)).
Mẫu sai có mã lý do `refusal_not_reported` và chỉ gọi `find_employee`, không gọi `propose_task_change`.
File kết quả không giữ câu trả lời cuối, vì câu trả lời có thể chứa tên hay số điện thoại, nên câu của lần sai đó không còn.

Để xem câu trả lời, một script tạm trong `scratch/` chạy lại việc Nam qua cửa gọi hàm với mô hình thật và in câu trả lời ra terminal, không ghi vào file và không commit.
Ba đợt chạy tay 6, 10 và 20 lần cho 36 câu trả lời mới; cả 36 lần đều đúng, lần nào cũng gọi `propose_task_change`, nhận `NOT_PERMITTED` và nêu anh Quang.
Ba đợt chạy tay không commit, vì đây là bước xem câu trả lời chứ không phải số đo.
Cộng với 40 lần đo ở mục 3, việc Nam không lặp lại lỗi cũ trong 76 lần chạy mới.

Hàm chấm cũng được siết thêm một chỗ: câu trả lời phải dựa trên một đề xuất mà cổng đã từ chối, không chấp nhận câu mô hình tự đoán là không có quyền ([`jobs.ts`](../../lab/assistants/src/shared/jobs.ts), [`jobs-test.ts`](../../lab/assistants/src/shared/jobs-test.ts)).
Đây là sửa hàm chấm cho đúng ý "cần lời từ chối từ cổng", không phải chỉnh để lần sai cũ thành đúng; lần sai cũ vẫn sai với hàm chấm mới.

**Kết luận:** lần sai còn lại là lỗi của mô hình (đọc nhân viên rồi trả lời mà không hỏi cổng), không phải lỗi của hàm chấm; ghi nguyên trạng, không đổi mô hình, câu lệnh hệ thống hay mô tả công cụ để tăng điểm.

## 3. Lớp sạch: 160 hội thoại

Bảng dưới là 8 nhóm, mỗi nhóm 20 hội thoại, đo trên commit `ef00f76`.
Cột "Đúng" mở file kết quả của nhóm đó.

| Việc | Cửa | Đúng | Mô hình p50 / chậm nhất (ms) | Cổng p50 / chậm nhất (ms) | Tổng p50 / chậm nhất (ms) |
| --- | --- | --- | --- | --- | --- |
| Tra số điện thoại anh Minh | MCP | [20/20](results/2026-11-22-assistant-mcp-lookup-minh-phone-ef00f76.json) | 1821,8 / 2479,7 | 11,6 / 36,9 | 1840,8 / 2501,2 |
| Tra số điện thoại anh Minh | Gọi hàm | [20/20](results/2026-11-22-assistant-function-lookup-minh-phone-ef00f76.json) | 1912,1 / 2712,4 | 6,1 / 28,8 | 1919,1 / 2723,1 |
| Chuyển T-12 cho anh Minh | MCP | [17/20](results/2026-11-22-assistant-mcp-assign-t12-to-minh-ef00f76.json) | 3432,9 / 4373,5 | 39,7 / 75,9 | 3487,6 / 4426,8 |
| Chuyển T-12 cho anh Minh | Gọi hàm | [20/20](results/2026-11-22-assistant-function-assign-t12-to-minh-ef00f76.json) | 3450,9 / 4677,1 | 26,5 / 63,3 | 3482,6 / 4703,5 |
| Chuyển 30 task của chị Lan | MCP | [18/20](results/2026-11-22-assistant-mcp-reassign-lan-tasks-ef00f76.json) | 5104,1 / 5800,7 | 102,7 / 136,6 | 5212,8 / 5940,7 |
| Chuyển 30 task của chị Lan | Gọi hàm | [20/20](results/2026-11-22-assistant-function-reassign-lan-tasks-ef00f76.json) | 5224,4 / 6117,0 | 76,6 / 125,2 | 5300,0 / 6199,6 |
| Nam chuyển T-12 (bị từ chối) | MCP | [20/20](results/2026-11-22-assistant-mcp-nam-assign-t12-ef00f76.json) | 3055,1 / 3863,1 | 37,4 / 82,6 | 3102,8 / 3906,1 |
| Nam chuyển T-12 (bị từ chối) | Gọi hàm | [20/20](results/2026-11-22-assistant-function-nam-assign-t12-ef00f76.json) | 2529,5 / 3140,3 | 22,8 / 59,5 | 2555,2 / 3167,2 |

Tổng lớp sạch: 155/160 lần đúng; cửa MCP 75/80, cửa gọi hàm 80/80.
Năm lần sai đều ở cửa MCP, đều là `missing_propose`, và mẫu cho thấy mô hình đã gọi `find_employee`, `get_task` hoặc `list_tasks` rồi trả lời mà không gọi `propose_task_change`.
Không có lần nào cửa trả lỗi (`door_error`), không có lần nào lộ số điện thoại, không có lần nào nói đã đổi task khi cổng mới soạn đề xuất.

Năm lần sai đó không giải thích được bằng dữ liệu mô hình thấy.
Danh mục của hai cửa giống nhau từng chữ và từng schema ([phép thử canh lệch](../../lab/assistants/src/function-calling/catalog-parity-test.ts)).
Người review đã kiểm trên một cụm riêng ở commit `2dd0aeb`: danh mục mà mỗi cửa đưa cho mô hình giống nhau từng byte khi tuần tự hóa.
Sáu công cụ đứng cùng thứ tự `find_employee`, `get_task`, `list_tasks`, `propose_task_change`, `get_request_status`, `propose_employee_change`, với cùng mô tả và cùng schema.
Comment trên PR #131 cũng ghi rằng văn bản trả lời, mã lý do và cờ lỗi của cổng giống nhau giữa hai cửa ([comment PR #131](https://github.com/Park-Hip/agentlize-intern/pull/131#issuecomment-7076738438)).
Vì vậy dữ liệu mô hình nhận là như nhau.

Khoảng cách độ đúng không nhỏ: cộng lớp sạch ở trên với lớp có lỗi ở mục 4, cửa MCP sai 8/120 và cửa gọi hàm sai 1/120.
Kiểm định Fisher chính xác hai phía cho 8/120 so với 1/120 ra p khoảng 0,036; riêng lớp sạch 5/80 so với 0/80 ra p khoảng 0,059.
Đây là mức biên, không phải chênh lệch không đáng kể, nên báo cáo ghi nguyên trạng thay vì nói hai cửa ngang nhau.
Với dữ liệu mô hình giống nhau, phần còn lại là dao động lấy mẫu của mô hình.
Cách xác nhận là chạy mẫu lớn hơn, ví dụ 100 lần mỗi việc mỗi cửa cho hai việc đổi task.
Đó là việc kiểm tra tiếp theo, báo cáo này không chạy mẫu đó.

Về M1 (thời gian), phần mô hình chiếm 97,9% tới 99,6% tổng thời gian.
Phần cổng p50 của cửa MCP cao hơn cửa gọi hàm 5,5 ms ở việc tra cứu, 13,2 ms ở việc chuyển T-12, 26,1 ms ở việc chuyển 30 task và 14,6 ms ở việc Nam.
Tổng p50 chênh lệch từ -4,1% tới +21,4% và đổi dấu giữa các việc, vì thời gian mô hình thay đổi nhiều hơn phần cổng.
Con số cổng ở đây là tổng các lời gọi trong một hội thoại, không phải một lời gọi; M1 của lớp tự động đo từng lời gọi và đã có p95 dưới 50 ms ([M1 lớp tự động](results/2026-11-20-m1-gateway-f4dbfe7.json)).

**Kết luận:** hai cửa cho cùng kết quả khi mô hình gọi đúng công cụ; lỗi còn lại là mô hình bỏ bước soạn đề xuất, không phải cửa nối trả sai.
Khoảng cách 8/120 so với 1/120 là mức biên, cần mẫu lớn hơn để xác nhận, và không có lần nào cửa trả sai.
Phần cổng của MCP chậm hơn nhưng chỉ vài chục mili giây, không phải nguồn chênh lệch thời gian của người dùng.

## 4. Lớp có lỗi: 80 hội thoại

Lớp này lặp hai lỗi mà `m2-scenarios.ts` gây ở lớp tự động, đặt đúng vào lời gọi `propose_task_change` đầu tiên của mỗi hội thoại ([kịch bản M2](../../lab/measure/src/scenarios/m2-scenarios.ts)):

- Lượt 1-10 và 12-15: gọi vào một cổng nhận request rồi đóng kết nối, sau đó gửi lại lời gọi thật.
- Lượt 11: gọi vào một cổng im lặng, bỏ cuộc sau 2 giây, rồi gửi lại lời gọi thật.
- Lượt 16-20: không lỗi.

Cổng thật chỉ nhận lời gọi gửi lại, nên mô hình chỉ thấy câu trả lời thật và không thấy một nửa kết quả.
Lượt nào mô hình không gọi `propose_task_change` thì không có lời gọi để gây lỗi; lượt đó được đếm là "bỏ bước", không phải lỗi mạng.

| Việc | Cửa | Đúng cuối | Lỗi mạng | Hết giờ | Gửi lại | Bỏ bước | Đề xuất trùng | Đề xuất thiếu | Ghi trùng | Lệnh mất |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chuyển T-12 cho anh Minh | MCP | [17/20](results/2026-11-22-assistant-mcp-assign-t12-to-minh-m2-ef00f76.json) | 12 | 0 | 12 | 3 | 0 | 0 | 0 | 0 |
| Chuyển T-12 cho anh Minh | Gọi hàm | [19/20](results/2026-11-22-assistant-function-assign-t12-to-minh-m2-ef00f76.json) | 13 | 1 | 14 | 1 | 0 | 0 | 0 | 0 |
| Chuyển 30 task của chị Lan | Gọi hàm | [20/20](results/2026-11-22-assistant-function-reassign-lan-tasks-m2-ef00f76.json) | 14 | 1 | 15 | 0 | 0 | 0 | 0 | 0 |
| Chuyển 30 task của chị Lan | MCP | [20/20](results/2026-11-22-assistant-mcp-reassign-lan-tasks-m2-ef00f76.json) | 14 | 1 | 15 | 0 | 0 | 0 | 0 | 0 |

Lớp có lỗi đúng 76/80 lần, gồm 1 lần ở cửa gọi hàm và 3 lần ở cửa MCP; cả 4 lần sai đều là `missing_propose`.
Cả bốn lần sai đều là mô hình không gọi `propose_task_change`, nên không có lời gọi để gây lỗi; bốn lần đó được đếm là bỏ bước, không phải lỗi mạng hay lỗi cửa.
Đã gây thật 56 lỗi, gồm 53 lỗi mạng và 3 lần hết giờ, và gửi lại đủ 56 lần; không lần nào sai sau khi lỗi đã được gây.
Năm lượt sạch cuối mỗi nhóm đúng 5/5, nên lỗi mạng và hết giờ không để lại hiệu ứng kéo dài.
Cộng hai lớp, hai cửa đúng 231/240; cửa MCP 112/120 và cửa gọi hàm 119/120; cả 9 lần sai đều là mô hình bỏ bước, không có lần nào cửa trả sai.

Bộ đếm "ghi trùng" và "lệnh mất" bằng 0 vì lớp này chỉ soạn đề xuất và không bấm Gửi; không có lệnh ghi nào được tạo.
Bộ đếm có nghĩa ở lớp này là "đề xuất trùng" và "đề xuất thiếu", và cả hai đều bằng 0: không task nào bị soạn hai lần trong một hội thoại, không task nào trong 30 task bị bỏ khỏi đề xuất khi mô hình đã soạn.
Lỗi gửi lại không tạo thêm đề xuất vì lần gửi đầu chỉ chạm cổng lỗi, chưa chạm cổng thật.

**Kết luận:** một lỗi mạng hay hết giờ ở lời gọi công cụ, rồi gửi lại, không tạo đề xuất trùng và không làm mất task; nguồn sai còn lại vẫn là mô hình bỏ bước, không phải lớp có lỗi.

## 5. M3 (chi phí): token và tiền

| Việc | Cửa | Token vào | Trúng đệm | Token ra | Tiền (USD) | Tiền mỗi lần đúng | Tiền mỗi task đổi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tra số điện thoại anh Minh | MCP | 113.250 | 92,7% | 2.853 | 0,003271 | 0,000164 | - |
| Tra số điện thoại anh Minh | Gọi hàm | 113.299 | 92,6% | 3.180 | 0,003474 | 0,000174 | - |
| Chuyển T-12 cho anh Minh | MCP | 178.840 | 91,2% | 8.549 | 0,007983 | 0,000470 | 0,000470 |
| Chuyển T-12 cho anh Minh | Gọi hàm | 190.143 | 90,8% | 9.795 | 0,009018 | 0,000451 | 0,000451 |
| Chuyển 30 task của chị Lan | MCP | 331.977 | 82,0% | 14.395 | 0,018392 | 0,001022 | 0,000034 |
| Chuyển 30 task của chị Lan | Gọi hàm | 349.904 | 83,3% | 14.753 | 0,018492 | 0,000925 | 0,000031 |
| Nam chuyển T-12 (bị từ chối) | MCP | 189.915 | 93,1% | 6.357 | 0,006318 | 0,000316 | - |
| Nam chuyển T-12 (bị từ chối) | Gọi hàm | 192.676 | 93,7% | 5.867 | 0,005891 | 0,000295 | - |

Tám dòng này dùng đúng tám file kết quả ở bảng mục 3.
Token vào trúng bộ nhớ đệm 82% tới 94% vì câu lệnh hệ thống và danh mục công cụ giữ nguyên ở đầu mỗi hội thoại.
Việc chuyển 30 task rẻ nhất cho mỗi task đổi vì một đề xuất phủ 30 task, còn việc chuyển T-12 phải trả tiền cho cả hội thoại để đổi một task.
Tiền mỗi lần đúng của cửa MCP cao hơn ở việc chuyển 30 task vì mẫu có 2 lần sai, và mỗi lần sai vẫn tốn tiền mà không đổi được task nào.

**Kết luận:** hai cửa tốn gần bằng nhau cho cùng một việc; chênh lệch đến từ độ dài câu trả lời của mô hình và từ số lần sai, không từ giao thức. MCP không đắt hơn đáng kể, nhưng cũng không rẻ hơn.

## 6. M6 (công sức dùng lại)

| Mục | MCP (trợ lý A) | Gọi hàm (trợ lý B) |
| --- | --- | --- |
| Dòng mã phần nối | 127 dòng, 92 dòng mã ([`door.ts`](../../lab/assistants/src/mcp/door.ts)) | 250 dòng, 222 dòng mã ([`door.ts`](../../lab/assistants/src/function-calling/door.ts), [`tools.ts`](../../lab/assistants/src/function-calling/tools.ts)) |
| Phép thử của phần nối | 308 dòng | 331 dòng, thêm phép thử canh lệch danh mục |
| Giờ công | 16 phút ([PR #131](https://github.com/Park-Hip/agentlize-intern/pull/131)) | 13 phút ([PR #132](https://github.com/Park-Hip/agentlize-intern/pull/132)) |
| File cổng phải sửa | 0 | 0 |
| Bộ tiếp hợp phải sửa | 0 | 0 |
| File dùng chung phải sửa | 0 | 0 |
| Thứ tự viết | Song song sau bộ khung chung `f99add3` | Song song sau bộ khung chung `f99add3` |

Bộ khung chung có 1.925 dòng mã trong 14 tệp ([PR #128](https://github.com/Park-Hip/agentlize-intern/pull/128)); cả hai trợ lý dùng lại, nên không tính vào phần nối của bên nào.
Cửa gọi hàm có phần nối ngắn hơn (95 dòng so với 127 dòng), nhưng cộng thêm 155 dòng chép danh mục thì tổng dài hơn 250 so với 127.
Hai trợ lý được viết song song bởi hai agent riêng, cùng bắt đầu sau bộ khung chung, nên không bên nào học được từ bên kia.
Giờ công của lần dựng đầu gần nhau (16 phút và 13 phút); khác biệt bền vững nằm ở dòng mã và ở chỗ B phải chép lại danh mục công cụ.

Ước tính từ hai lần dựng, nếu thêm trợ lý thứ hai sau khi đã có trợ lý thứ nhất:

- Theo MCP: 127 dòng, không phải chép danh mục, cổng đổi mô tả thì trợ lý mới tự thấy.
- Theo gọi hàm: 250 dòng, trong đó 155 dòng chép danh mục; mỗi lần cổng đổi mô tả phải sửa bản chép và chạy lại phép thử canh lệch.

Để so công bằng, #137 phải sửa 3 file của cổng (49 dòng thêm, 2 dòng bớt) và đưa hai câu hướng dẫn vào mô tả công cụ, rồi cập nhật bản chép của B ([PR #137](https://github.com/Park-Hip/agentlize-intern/pull/137)).
Đó là chi phí một lần để hai cửa đọc cùng một chữ, không tính cho cửa nào.

Lớp có lỗi thêm 277 dòng dùng chung (206 dòng mã) và 261 dòng phép thử, không sửa cổng ([`faults.ts`](../../lab/assistants/src/shared/faults.ts)).
Lớp này dùng lại đúng cửa nối của hai trợ lý, nên không làm lệch phép so.

**Kết luận:** MCP tiết kiệm khoảng một nửa tổng dòng phải viết cho trợ lý, nhờ không phải chép danh mục; giờ công của lần dựng đầu gần nhau, nên khoản tiết kiệm hiện rõ ở trợ lý thứ hai và ở phần bảo trì.

## 7. Hai điều ảnh hưởng tới so sánh

**Thứ nhất, cửa MCP mở một kết nối mới cho mỗi lời gọi.**
Cửa MCP gọi `initialize`, `tools/call` rồi đóng, nên cột thời gian cổng gồm cả bắt tay.
Trên cùng máy, bắt tay khoảng 5 tới 15 ms một lời gọi; comment trên PR #131 ghi khoảng 30 ms so với 8-12 ms của cửa gọi hàm trong một lần đo khác ([comment PR #131](https://github.com/Park-Hip/agentlize-intern/pull/131#issuecomment-7076738438)).
Vì vậy không so trực tiếp cột "Cổng" của hai cửa như thời gian xử lý thuần của cổng; phần chênh lệch là của giao thức.

**Thứ hai, cửa gọi hàm từng được chỉnh mô tả công cụ trước #136.**
Lần chạy thật đầu cho A đúng 1/4 và B đúng 4/4, nhưng khi kiểm cùng lời gọi thì hai cửa trả cùng văn bản, mã lý do và cờ lỗi; khác biệt nằm ở mô tả công cụ của B, được chỉnh sau khi xem mô hình thật ([comment PR #131](https://github.com/Park-Hip/agentlize-intern/pull/131#issuecomment-7076738438)).
#137 đưa hai câu hướng dẫn vào mô tả của cổng để A, B và Thổ Thần cùng đọc một chữ, và `catalog-parity-test.ts` giữ bản chép của B khớp từng chữ ([PR #137](https://github.com/Park-Hip/agentlize-intern/pull/137)).
Số đo trong báo cáo này chạy sau #137, nên hai cửa đọc cùng một danh mục; nếu đọc lại số cũ 1/4 và 4/4 như số của cửa nối thì sai.

**Kết luận:** đọc cột "Cổng" với bắt tay trong đầu, và đọc độ đúng với điều kiện hai danh mục đã giống nhau; phần còn lại mới là khác biệt của cách nối.

## 8. Kết luận Q2

Bảng kết luận ở [spec, mục 2.2](../design/mvp-spec.md#22-q2-thêm-một-trợ-lý-thứ-hai-thì-mcp-tiết-kiệm-bao-nhiêu-công-so-với-gọi-hàm-và-phải-trả-giá-gì) có hai dòng.
Báo cáo chọn **dòng thứ nhất**: "MCP ít công hơn rõ, không chậm hơn và không đắt hơn đáng kể", nên "Dùng MCP khi có từ hai nơi gọi trở lên, kể cả khi cùng một nhóm viết".

Các số đỡ và điểm phải cân nhắc:

- M6: cửa MCP 127 dòng so với 250 dòng của cửa gọi hàm, và không phải chép danh mục; ước tính trợ lý thứ hai theo MCP nhẹ hơn khoảng một nửa.
- M1: phần cổng của MCP chậm hơn 5 tới 26 ms mỗi hội thoại, khoảng 0,3% tới 0,5% tổng thời gian; tổng thời gian do mô hình chi phối và chênh lệch không theo một chiều.
- M3: tiền gần bằng nhau; chênh lệch đến từ độ dài câu trả lời và số lần sai, không từ giao thức.
- M2: 0 ghi trùng, 0 lệnh mất, 0 đề xuất trùng, 0 đề xuất thiếu khi mô hình soạn đủ; lỗi mạng và hết giờ không tạo thêm đề xuất.
- Độ đúng: MCP sai 8/120, gọi hàm sai 1/120, p khoảng 0,036; dữ liệu mô hình nhận giống nhau, nên phần còn lại là dao động lấy mẫu và cần mẫu lớn hơn để xác nhận.

Điều này chỉ đúng khi có từ hai nơi gọi.
Nếu chỉ có một trợ lý và không có kế hoạch thêm trợ lý thứ hai, cửa gọi hàm có ít thành phần giao thức hơn: một request HTTP, không bắt tay, không phiên MCP; khi đó MCP là sai lựa chọn vì thêm một giao thức mà không có nơi gọi thứ hai để chia sẻ.
MCP cũng là sai lựa chọn khi phần mềm đích không nói MCP.
Ngược lại, khi danh mục công cụ đổi thường xuyên, MCP có lợi thế vì trợ lý mới tự thấy mô tả mới, còn cửa gọi hàm phải chép lại.

**MCP chỉ mang lời gọi, không mang an toàn.**
Quyền theo vai, bước duyệt, danh tính người hỏi và vết xuyên suốt vẫn nằm ở cổng; MCP không thêm bước duyệt, không xác thực người dùng và không cắt được một lời gọi sai.
Trong Thổ Thần, MCP còn không cho cổng biết chắc ai đang hỏi và cắt mọi lời gọi sau 60 giây ([tổng hợp phát hiện, mục 4](../findings.md#4-thổ-thần)).

**Kết luận:** chọn dòng thứ nhất cho trường hợp có từ hai nơi gọi; giữ toàn bộ phần an toàn ở cổng, vì MCP chỉ là đường vận chuyển lời gọi.
Khoảng cách độ đúng 8/120 so với 1/120 là mức biên, cần mẫu lớn hơn để xác nhận, không đủ để đổi dòng.

## 9. Giới hạn

Các số trên đúng trong điều kiện của Lab:

- Một mô hình `deepseek-flash`, một máy, một cổng, sáu công cụ và dữ liệu giả.
- 20 lần mỗi việc mỗi cửa ở lớp sạch; 20 lần mỗi việc đổi task mỗi cửa ở lớp có lỗi; mẫu nhỏ nên chỉ thấy chênh lệch lớn.
- Cửa gọi hàm chép danh mục bằng tay; một nhóm khác có thể sinh danh mục tự động và giảm phần chênh lệch dòng mã.
- Thổ Thần chưa chạy cùng bộ việc trong báo cáo này; dòng Thổ Thần của Q2 là việc chạy tay riêng.
- Lỗi cố ý chỉ gồm mất phản hồi mạng và hết giờ ở lời gọi công cụ; lỗi thật còn có quá tải, lỗi mơ hồ và chậm dần.
- Số dư DeepSeek hiển thị hai chữ số thập phân, nên số dư trước và sau chỉ là mốc; tổng tiền chính xác nằm trong từng file kết quả.

**Kết luận:** chiều hướng "MCP nhẹ hơn cho trợ lý thứ hai, không đắt hơn đáng kể, nhưng không mang an toàn" mang sang bản thật; các con số tuyệt đối về thời gian và tiền thì không.

## 10. Chạy lại

Dựng cụm riêng và cấp khoá, làm lại cho mỗi nhóm:

```
cd lab
LAB_GATEWAY_PORT=8850 LAB_DIRECTORY_PORT=8851 LAB_TASKS_PORT=8852 LAB_CONSOLE_PORT=8853 \
LAB_DATA_DIR=<thư mục tạm> node dist/scripts/start.js

# cửa sổ khác, cùng LAB_DATA_DIR
npm run seed-keys
```

Chạy một nhóm sạch, ví dụ việc tra cứu qua cửa MCP:

```
LAB_GATEWAY_URL=http://127.0.0.1:8850 \
LAB_TOOL_KEYS='{"hoa":"lab_...","nam":"lab_..."}' \
LAB_MODEL_API_KEY=... \
npm run assistant -- --door mcp --job lookup-minh-phone --runs 20
```

Chạy một nhóm có lỗi, ví dụ việc chuyển T-12 qua cửa gọi hàm:

```
LAB_GATEWAY_URL=http://127.0.0.1:8850 \
LAB_TOOL_KEYS='{"hoa":"lab_...","nam":"lab_..."}' \
LAB_MODEL_API_KEY=... \
npm run assistant -- --door function --job assign-t12-to-minh --runs 20 --fault m2
```

Lặp cho bốn việc và hai cửa ở lớp sạch, và cho hai việc đổi task ở lớp có lỗi.
Xoá thư mục dữ liệu trước mỗi nhóm để bộ đếm duyệt hàng loạt trong 60 phút trở về 0.
Mỗi lệnh ghi một cặp file trong `rd/evaluation/results/`, tên có commit và có thêm `m2` ở lớp có lỗi; bản tóm tắt giữ `sha256` của file mẫu để kiểm lại.

**Kết luận:** mọi con số trong báo cáo này chạy lại được bằng các lệnh trên và mở lại được từ file kết quả tương ứng.
