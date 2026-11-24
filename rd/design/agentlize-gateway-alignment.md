# Khớp bản thử của Lab với AgentLize Gateway

Ngày: 2026-11-24. Trạng thái: đề xuất, chưa làm; ba issue theo dõi, liệt kê ở mục 6.

## Đọc nhanh

- AgentLize Gateway là cổng thật của công ty, nơi các trợ lý AI đọc dữ liệu và tạo lệnh ghi; Lab là bản thử nghiên cứu cùng bài toán đó.
- Hai bên đã giống nhau ở những điểm chính: quyền theo từng người, AI chỉ soạn bản nháp, người duyệt bấm trên trang của cổng.
- Lab thiếu một ràng buộc của công ty: mỗi loại ứng dụng AI chỉ được nhận dữ liệu tới một mức nhạy cảm nhất định.
- Lab sẽ thêm ràng buộc đó, dùng chung tên mã từ chối và tên trạng thái với cổng thật, và cho chủ dữ liệu duyệt.
- Những phần cổng thật đã làm, như đăng nhập, chợ kỹ năng và két giữ khoá, Lab không làm lại; Lab giữ bản gần đúng để kết quả vẫn áp được.

## 1. Vì sao cần khớp

Nguồn so sánh là đặc tả AgentLize Gateway bản 1.1 ngày 23/11/2026, tài liệu nội bộ do mentor chia sẻ.
Repo là public, nên không giữ bản chép của đặc tả; tài liệu này chỉ nêu các ràng buộc ở mức khái niệm, không chép địa chỉ, mã ứng dụng hay tên người.

Lab cần khớp vì hai lẽ.
Một, kết quả của Lab, nhất là [spec ghi an toàn](write-safety-spec.md), chỉ có ích khi đọc được bằng ngôn ngữ của cổng thật.
Hai, một ràng buộc công ty đặt ra thì không phải ràng buộc Lab tự nghĩ, nên bản thử phải có nó trước khi so kết quả.

Hai bên đã giống nhau ở bốn điểm:

| Điểm | AgentLize Gateway | Lab |
| --- | --- | --- |
| Quyền theo từng người, không theo ứng dụng | Có | Có, SR8 (dùng lại, quyền theo người) |
| AI chỉ soạn bản nháp, không ghi thẳng | `action_draft` | `propose_task_change`, `propose_employee_change` |
| Duyệt trên trang của cổng, không trong khung chat | Trang duyệt | Trang xác nhận và trang duyệt, [ADR-0008](../../docs/adr/adr-0008-approval-page-login.md) |
| Mã chống ghi trùng gửi kèm lệnh ghi | Một mã cho mỗi bản nháp | Một mã cho mỗi mục của đề xuất |

**Kết luận:** không cần viết lại phần nào của bản thử; chỉ thêm một ràng buộc còn thiếu và đổi tên gọi ở chỗ hai bên nói chuyện với nhau.

## 2. Sửa gì trong bản thử

| # | Sửa gì | Lab làm gần đúng thế nào | Issue |
| --- | --- | --- | --- |
| 1 | Mức dữ liệu tối đa theo loại ứng dụng | Mỗi trường mang một trong năm lớp dữ liệu; file luật có bảng hồ sơ ứng dụng, mỗi hồ sơ một mức trần | #154 |
| 2 | Tên mã từ chối | Giữ mã nội bộ, thêm trường `deny_reason` theo tên của cổng thật | #154 |
| 3 | Tên trạng thái lệnh ghi | Giữ trạng thái nội bộ, trả thêm tên trạng thái của cổng thật; thêm tên công cụ `action_status` | #155 |
| 4 | Chủ dữ liệu duyệt | File luật chọn người duyệt là trưởng phòng sở hữu bản ghi | #148 |
| 5 | Đánh dấu văn bản tự do | Mô tả task mang cờ `untrusted_content`; văn bản quá dài bị cắt và gắn `truncated` | #155 |
| 6 | Giới hạn bản nháp đang chờ | Tối đa 20 đề xuất đang chờ cho mỗi người, đặt trong file luật | #155 |

### 2.1. Mức dữ liệu tối đa theo loại ứng dụng

Lớp dữ liệu (data class) cho biết dữ liệu nhạy cảm tới đâu.
Năm lớp, từ thấp tới cao: số liệu tổng hợp ẩn danh (`aggregate_anonymous`), nội bộ chung (`internal_general`), cá nhân nhân viên (`employee_personal`), cá nhân khách hàng (`customer_personal`), thanh toán (`payment`).

Hồ sơ ứng dụng (client profile) khai một loại ứng dụng AI được nối thế nào, gồm lớp ứng dụng và mức dữ liệu tối đa.
Ba lớp ứng dụng: do Appota vận hành (`appota_hosted`, như Thổ Thần), do hãng ngoài vận hành (`vendor_hosted`, như ChatGPT), và chạy trên máy cá nhân (`user_device`, như Claude Code).
Mức trần mặc định giảm dần theo thứ tự đó.

Lab áp ràng buộc này như sau:

- Ứng dụng không cộng quyền; nó chỉ hạ trần. Trường được trả là giao của trường vai trò cho phép và trường có lớp không vượt trần.
- Tên ứng dụng lấy từ bản ghi khoá do người quản trị cấp, không lấy từ request, nên người cầm khoá không tự nâng mức được.
- Ứng dụng không khai trong file luật nhận mức thấp nhất, theo SR5 (không chắc thì chặn).
- Trường bị bỏ vì vượt trần được nêu tên kèm lý do riêng, khác lý do che theo vai trò.

Ví dụ: chị Nhung (nhân sự) tra số điện thoại cá nhân của anh Minh.
Qua Thổ Thần, chị thấy số đó, vì lớp `employee_personal` nằm dưới trần của Thổ Thần.
Qua một ứng dụng chạy trên máy cá nhân, số đó bị bỏ với lý do `data_class_exceeds_client`.

Thay đổi này chạm SR8 (dùng lại, quyền theo người): câu "nơi gọi không mang quyền riêng" đổi thành "nơi gọi không cộng quyền; mức trần chỉ hạ quyền".
Phép thử SR8 vẫn chạy hai nơi gọi, nhưng chọn hai nơi gọi cùng mức trần.

### 2.2. Tên mã từ chối

| Mã của Lab | `deny_reason` của cổng thật |
| --- | --- |
| `NOT_PERMITTED`, `NOT_FOUND` | `no_permission` (cố ý không phân biệt "không có" với "không được xem") |
| Vượt mức trần (mới) | `data_class_exceeds_client` |
| `TARGET_CHANGED` | `stale_target` |

Lab giữ mã nội bộ vì phép thử và bảng vết đang dùng chúng; `deny_reason` chỉ là tên thêm ở câu trả lời.

### 2.3. Chủ dữ liệu duyệt

Cổng thật cho chủ dữ liệu (data owner) duyệt các thao tác cần thêm một người.
Lab hôm nay luôn cho trưởng phòng của người yêu cầu duyệt.
Hai cách khác nhau khi một thay đổi chạm dữ liệu của phòng khác; #148 cho file luật chọn cách cho từng loại bản ghi.

**Kết luận:** mục 1 và 2 làm trước vì là ràng buộc của công ty; mục 3 tới 6 nhỏ và chỉ đổi tên hay thêm tham số.

## 3. Luồng ghi: chỗ Lab nối vào cổng thật nhiều nhất

Theo đặc tả, cổng thật kiểm bản ghi chưa đổi lúc duyệt, chuyển bản nháp sang "đang thực thi", rồi gọi hệ thống nguồn với mã chống ghi trùng là mã bản nháp.
Bản nháp kết thúc ở "đã thực thi" hoặc "thất bại"; không có trạng thái "không rõ kết quả".

Trạng thái của hai bên ánh xạ như sau:

| Lab | Cổng thật |
| --- | --- |
| Chờ người yêu cầu bấm Gửi (`awaiting_confirmation`), chờ duyệt (`awaiting_approval`) | `pending` |
| Đã duyệt, lệnh đang trong hàng đợi | `executing` |
| Lệnh ghi xong | `executed` |
| Lệnh ghi thất bại | `failed` |
| Bị từ chối, hết hạn | `rejected`, `expired` |

Hạn 30 phút của Lab cho bước người yêu cầu bấm Gửi trùng với hạn 30 phút của cổng thật khi chỉ người tạo duyệt.

Cách cổng thật gửi lệnh gần với cánh "gửi một lần" trong [kế hoạch đo Q3](q3-measurement-plan.md#2-câu-hỏi-nghiên-cứu-q3).
Đặc tả không nói cổng thật có gửi lại hay không, nên Lab chỉ coi là "gần với", không coi là "giống".
Ba lỗ mà spec ghi an toàn đo cũng có thể có ở luồng này:

- Hệ thống nguồn không lọc trùng theo mã, thì mã bản nháp không chặn được ghi hai lần.
- Hệ thống nguồn báo "đã nhận" trước khi xong, thì "đã thực thi" có thể sai.
- Bản ghi đổi sau lúc duyệt nhưng trước lúc gửi, thì kiểm lúc duyệt không thấy.

**Kết luận:** kết quả của phép đo Q3 trên cánh "gửi một lần" là đóng góp trực tiếp nhất của Lab cho luồng ghi của cổng thật.

## 4. Khớp về ý, khác về chi tiết

| Cổng thật | Lab | Khác thế nào |
| --- | --- | --- |
| Token OAuth của một người với một ứng dụng | Khoá `lab_` gắn một nhân viên và một tên ứng dụng | Cùng ý nghĩa, khác cách cấp; Lab không có trang đăng nhập và đồng ý |
| Nhóm theo phòng (namespace); nguồn riêng phòng, dùng chung, công khai | Phòng ban; phạm vi đọc trong phòng hoặc mọi phòng | Lab không có nguồn công khai cho người chưa đăng nhập |
| Nguồn đã đăng ký: cột kèm vai trò được xem, lọc dòng | Luật theo loại bản ghi: trường theo vai trò, phạm vi đọc | Cổng thật thay giá trị bằng `"***"` và liệt kê ở `masked_fields`; Lab bỏ trường và nêu bằng một câu |
| Lớp dữ liệu theo nguồn | Lớp dữ liệu theo trường | Lab chi tiết hơn; lớp của nguồn bằng lớp cao nhất của các trường |
| Một mã chống ghi trùng cho mỗi bản nháp | Một mã cho mỗi mục, dạng `<mã đề xuất>:<vị trí>` | Lab chi tiết hơn, hợp với đề xuất nhiều mục |
| Bản nháp cần chủ dữ liệu chờ tối đa 24 giờ | Chờ duyệt tối đa 120 phút | Chỉ khác tham số trong file luật |
| Nhật ký chỉ lưu metadata, giữ 180 ngày | Bảng vết lưu đủ để làm bằng chứng | Lab cố ý lưu nhiều hơn vì mọi dữ liệu là giả |

**Kết luận:** mỗi chỗ gần đúng đều giữ nguyên ý của cổng thật, nên kết luận rút ra trên Lab không đổi khi áp vào cổng thật.

## 5. Ngoài phạm vi

| Phần của cổng thật | Vì sao Lab không làm |
| --- | --- |
| Đăng nhập OAuth 2.1 qua Lark, làm mới và xoay token, trang đồng ý | Cổng thật đã làm; khoá của Lab đóng vai token |
| Két giữ token hệ thống nguồn, liên kết tài khoản nguồn | Cùng việc với U3 (ghi bằng token của người yêu cầu, #146) đang hoãn; Lab ghi bằng khoá dịch vụ |
| Chợ kỹ năng, kiểm và duyệt kỹ năng, chạy script trong sandbox, thư viện kỹ năng | Không thuộc câu hỏi Track 01 mà Lab đang trả lời |
| Công cụ tìm và mô tả nguồn, công cụ sinh theo nguồn | Công cụ của Lab viết riêng cho từng việc, giữ đúng ý của bề mặt công cụ mở rộng |
| Cổng chạy cả vòng agent và trả lời như một mô hình AI | Phương án dự phòng của cổng thật; #17 còn chờ đo xem cách nối này có mang danh tính người dùng không |
| Duyệt trên thẻ Lark, thu hồi quyền theo sự kiện nghỉ việc của Lark | Cổng thật cũng chưa duyệt trên thẻ; Lab thử nghỉ việc bằng cách xoá người khỏi danh bạ giả |
| Postgres, chạy nhiều bản, mã hoá khi lưu, sao lưu, giới hạn tốc độ theo người | Việc vận hành sản phẩm, không phải câu hỏi nghiên cứu |
| Nối ACheckin thật | Lab chỉ dùng dữ liệu giả lập hoặc công khai |

**Kết luận:** Lab không làm lại phần nào cổng thật đã chạy; Lab chỉ giữ những gì cần để đo an toàn khi đọc và ghi.

## 6. Thứ tự làm

| Thứ tự | Issue | Vì sao đứng ở đây |
| --- | --- | --- |
| 1 | #154: mức trần dữ liệu theo ứng dụng và `deny_reason` | Ràng buộc của công ty; cần ADR-0010 trước phần mã |
| 2 | #148: chủ dữ liệu duyệt | Cùng sửa file luật và lõi chính sách với #154 |
| 3 | #155: tên trạng thái, cờ văn bản tự do, giới hạn bản nháp | Nhỏ, đi sau hai issue trên vì chung file luật |

Ba issue này sửa đường đọc và luật duyệt, không chung file với #151 (hồ sơ đích khó tính), nên chạy song song được với spec ghi an toàn.

**Kết luận:** sau ba issue, Lab và cổng thật dùng chung ràng buộc, chung tên mã và chung tên trạng thái; phần còn lại là khác biệt có chủ ý, đã ghi ở mục 4 và 5.

## Tài liệu liên quan

- [Spec ghi an toàn](write-safety-spec.md)
- [Kế hoạch đo Q3](q3-measurement-plan.md)
- [PRD AI Platform](../problem/prd-ai-platform.md)
- [Hệ sinh thái AI của Appota](../../docs/context/appota-ai-ecosystem.md)
- [ADR-0005, danh tính người yêu cầu](../../docs/adr/adr-0005-requester-identity.md)
- [ADR-0008, trang duyệt](../../docs/adr/adr-0008-approval-page-login.md)
- [Bảng thuật ngữ](../problem/glossary.md)
