# Trang điều khiển

Trang cho người vận hành: xem bốn dịch vụ có chạy không, sửa luật quyền, gọi thử tool, xem dữ liệu gốc và đọc vết.
Mở `http://127.0.0.1:8793` sau `npm start`.

## Sáu màn hình

| Màn hình | Cho thấy |
| --- | --- |
| Tổng quan | `/health` của bốn dịch vụ, phiên bản file luật, sáu nhân vật và khách |
| Tool | Danh mục tool của cổng: mô tả, tham số, nhãn "Chỉ đọc" hay "Soạn đề xuất" |
| Quyền và trường | Vai nào được làm gì, xem trường nào, ai duyệt; ô thử quyết định |
| Sân chơi | Gọi một tool qua cổng dưới tên một nhân vật, xem nguyên văn câu trả lời |
| Dữ liệu gốc | Dữ liệu đúng như ba hệ thống giả đang lưu, góc nhìn mà AI không có |
| Vết | Bảng vết của cổng, lọc theo người, task, đề xuất, cửa vào; tự làm mới mỗi 5 giây |

Trang không có nút sửa bản ghi: mọi thay đổi nghiệp vụ đi qua cổng.
Màn hình Vết gom mọi dòng của một đề xuất thành một nhóm, nên đọc được một mạch từ soạn, gửi, duyệt tới từng lệnh ghi.
Một dịch vụ tắt thì trang vẫn mở, và dòng của dịch vụ đó báo "Không chạy" kèm lý do.

## Sửa luật

Màn hình Quyền và trường sửa chính file mà cổng đang đọc (`LAB_RULES_PATH`), nên lời gọi kế tiếp dùng luật mới.

- Mỗi loại bản ghi có một bảng riêng: mỗi ô chọn hiệu lực, phạm vi và hiệu lực khi hàng loạt; kèm ngưỡng hàng loạt và các trường mỗi vai được xem.
- Khối duyệt (ai duyệt, có phải cùng phòng, chờ bao lâu) và cửa sổ đếm đề xuất chia nhỏ nằm ở cuối trang.
- Lưu kiểm cả form bằng `rulesSchema` của `@lab/gateway`; form hỏng bị từ chối trước khi chạm vào file.
- Mỗi lần lưu tăng `version` thêm 1 và giữ bản đó ở `rules-history/v<n>.json` cạnh file luật.
- Form nhớ phiên bản lúc mở; file đã bị đổi ở nơi khác thì lần lưu bị từ chối, và trang yêu cầu tải lại.
- "Về bản gốc" chép `gateway/policy/rules.json` với phiên bản lớn hơn mọi bản đã có.
  Nút này vẫn dùng được khi file đang hỏng, vì đó là lúc cần nhất.
- Trường nhân viên mới thêm vào danh bạ mà chưa có trong luật hiện nhãn "chưa khai".
- Ô "thử quyết định" hỏi chính bộ luật của cổng, không gọi tool và không đọc dữ liệu.
  Nó dùng `GET`, nên link kết quả chia sẻ được.

## Sân chơi

Form sinh từ danh mục tool của cổng, nên tool mới tự hiện mà không phải sửa trang.
Console gọi `POST /v1/tools/<tên>` của cổng bằng khoá của nhân vật đang chọn, rồi hiện nguyên văn câu trả lời, mã HTTP, mã lý do, thời gian, dòng vết và link xác nhận nếu có.

Sáu kịch bản mẫu:

| Kịch bản | Gọi gì | Kết quả mong đợi |
| --- | --- | --- |
| A. Chị Hoa chuyển T-12 | `propose_task_change` dưới tên chị Hoa | Đề xuất và link xác nhận |
| B. Nam gõ đúng câu đó | cùng tool, dưới tên Nam | `NOT_PERMITTED`, nêu anh Quang |
| C. Chị Hoa chuyển 30 task của chị Lan | `propose_task_change` với T-5 tới T-34 | Đề xuất 30 mục, `NEEDS_APPROVAL` và link xác nhận |
| D. Chị Hoa tra anh Minh | `find_employee` dưới tên chị Hoa | Email công việc, không có số điện thoại cá nhân |
| Câu lệnh cài trong T-13 | `get_task` T-13 | Câu lệnh nằm trong khối dữ liệu có nhãn |
| Task của phòng khác | `get_task` T-61 dưới tên chị Hoa | "Không tìm thấy", vết ghi ngoài phạm vi |

Kịch bản A và C chỉ soạn đề xuất khi task còn ở trạng thái ban đầu.
Sau một lần ghi, xoá `lab/.data` rồi chạy lại để thấy đề xuất mới.

Link xác nhận mở trang của cổng và hỏi mật khẩu trang của nhân vật.
Console không giữ mật khẩu trang, nên hãy dùng mật khẩu `trang_` mà `npm run seed-keys` đã in.

**Khoá của sân chơi.**
Lúc khởi động, console thu hồi mọi khoá cũ của nơi gọi `lab-console`, rồi cấp một khoá tool mới cho mỗi nhân vật và khách.
Khoá thô chỉ nằm trong bộ nhớ; khi console tắt, nó thu hồi các khoá đó.
Nếu console bị giết ngang, lần khởi động sau thu hồi khoá cũ trước khi cấp khoá mới.

## Ba nút thử lỗi

Khi `LAB_TEST_HOOKS=1`, màn hình Dữ liệu gốc có thêm ba nút: đặt lại danh bạ, đặt lại task, và làm mất phản hồi sau khi ghi.
Khi biến tắt, ba nút không hiện và các đường `/admin/*` phía sau trả 404.

## An toàn của trang

- Console chỉ nghe `127.0.0.1`.
  Request có `Host` khác `127.0.0.1:<cổng>` hay `localhost:<cổng>` nhận 403, nên một trang lạ đổi DNS về máy này cũng không gọi được.
- Mọi `POST` cần mã chống giả mạo (CSRF token) do console cấp cho trang, hết hạn sau 30 phút, và header `Origin` đúng địa chỉ console.
  Thiếu một trong hai thì trả 403 trước khi làm gì khác.
- Console đọc `gateway.sqlite` ở chế độ chỉ đọc và đóng file sau mỗi request.
