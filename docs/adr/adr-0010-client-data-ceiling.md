# ADR-0010: Mức trần dữ liệu theo loại client

Ngày: 2026-11-24. Trạng thái: đã chấp nhận.

Quyết định 1 và 2 trong [tài liệu khớp cổng AgentLize, mục 2.1 và 2.2](../../rd/design/agentlize-gateway-alignment.md#21-mức-dữ-liệu-tối-đa-theo-loại-ứng-dụng).

## Đọc nhanh

- Vấn đề: cổng của công ty giới hạn mỗi loại ứng dụng AI (client) chỉ được nhận dữ liệu tới một mức nhạy cảm nhất định, gọi là mức trần (ceiling).
- Bản thử của Lab mới có quyền theo vai và phòng, nên chị Nhung bên nhân sự tra số điện thoại của anh Minh qua một ứng dụng chạy trên máy cá nhân vẫn thấy số đó.
- Quyết định: mỗi trường dữ liệu mang một lớp dữ liệu (data class); mỗi ứng dụng có một mức trần; cổng chỉ trả trường vừa được vai cho phép vừa nằm dưới trần.
- Ứng dụng không cộng thêm quyền, chỉ hạ trần; tên ứng dụng lấy từ bản ghi khoá, không lấy từ lời gọi.
- Việc tiếp theo: dựng lược đồ file luật, lõi chính sách, câu từ chối và phép thử; lời từ chối dùng chung tên với cổng của công ty.

## 1. Bối cảnh

Ví dụ xuyên suốt: chị Nhung bên nhân sự nhờ AI tra anh Minh để lấy số điện thoại.
Qua Thổ Thần, chị thấy số đó, vì Thổ Thần do Appota vận hành.
Qua một ứng dụng chạy trên máy cá nhân, chị không được thấy số đó, dù dùng cùng một khoá và cùng quyền nhân sự.

Hôm nay bản thử chỉ có một chiều quyền: vai và phòng.
`lab/gateway/policy/rules.json` khai trường được xem cho từng vai, và vai `hr` thấy `personal_phone` cùng `home_address`.
`lab/gateway/src/tools/read-tools.ts` trả đúng danh sách trường của vai rồi nêu tên các trường bị che.
`lab/gateway/src/identity/key-store.ts` gắn mỗi khoá với một tên nơi gọi như `tho-than-desktop` hay `fc-assistant`, nhưng `lab/gateway/src/policy/engine.ts` chưa dùng tên đó để quyết định.

Cổng của công ty có thêm ràng buộc này, ghi ở [tài liệu khớp, mục 2.1](../../rd/design/agentlize-gateway-alignment.md#21-mức-dữ-liệu-tối-đa-theo-loại-ứng-dụng).
Lab cần có cùng ràng buộc trước khi so kết quả, vì một ràng buộc của công ty không phải là một lựa chọn riêng của Lab.

**Kết luận:** quyền theo vai là điều kiện cần nhưng chưa đủ; phải thêm một chiều thứ hai là mức dữ liệu tối đa của ứng dụng đang gọi.

## 2. Phương án đã xét

| Phương án | Được | Mất | Kết quả |
| --- | --- | --- | --- |
| A. Giữ nguyên quyền theo vai và phòng | Không phải sửa gì | Trái ràng buộc của công ty; ứng dụng trên máy cá nhân vẫn thấy dữ liệu cá nhân | Loại |
| B. Ứng dụng cộng thêm quyền, hoặc thay quyền của vai | Một ứng dụng tin cậy làm việc nhanh hơn | Khoá bị lộ thì người giữ khoá vượt quyền của chính mình; trái ADR-0005 và SR8 (dùng lại, quyền theo người) | Loại |
| C. Ứng dụng chỉ hạ một mức trần; lớp gắn theo trường; hồ sơ ứng dụng nằm trong file luật; ứng dụng chưa khai nhận mức thấp nhất | Đúng ràng buộc của công ty; kiểm được bằng phép thử; luật vẫn là dữ liệu theo ADR-0007 | File luật to hơn; mỗi trường cần một lớp; màn hình luật của console phải giữ các khoá mới | **Chọn** |
| D. Lọc theo ứng dụng trong mã của từng tool đọc | Ít sửa file luật | Luật tách làm hai nơi; mỗi tool mới phải chép lại; console không thấy; trái ADR-0007 | Loại |
| E. Gắn một lớp cho cả loại bản ghi hoặc cả nguồn | Ít dòng trong file luật | Một trường nhạy cảm kéo cả bản ghi lên; ứng dụng máy cá nhân mất cả tiêu đề task chỉ để che một trường | Loại cho Lab; lớp của nguồn vẫn suy ra được |

Phương án C giữ nguyên mọi quyết định cũ: vai, phòng, phạm vi đọc, duyệt và danh tính.
Nó chỉ thêm một điều kiện hẹp hơn lên danh sách trường đã được vai cho phép.

**Kết luận:** chọn C; ứng dụng chỉ có quyền hạ trần, không bao giờ cộng quyền.

## 3. Quyết định

### 3.1. Năm lớp dữ liệu, thứ tự cố định

| Thứ tự | Lớp | Nghĩa đời thường | Ví dụ trong Lab |
| --- | --- | --- | --- |
| 1 | `aggregate_anonymous` | Số liệu tổng hợp không nêu tên ai | Một câu trả lời kiểu "phòng Vận hành có 8 người"; hôm nay chưa có trường nào thuộc lớp này |
| 2 | `internal_general` | Dữ liệu nội bộ, không phải dữ liệu cá nhân | Mã nhân viên, tên, phòng, vai, email công việc; mã, tiêu đề, mô tả, người phụ trách, trạng thái và hạn của task |
| 3 | `employee_personal` | Dữ liệu cá nhân của một nhân viên | Số điện thoại cá nhân và địa chỉ nhà trong danh bạ |
| 4 | `customer_personal` | Dữ liệu cá nhân của một khách hàng | Chưa có hệ thống khách hàng nào nối vào Lab; lớp để sẵn cho hệ thống thứ ba |
| 5 | `payment` | Dữ liệu thanh toán | Chưa có hệ thống thanh toán nào nối vào Lab; lớp để sẵn cho hệ thống thứ ba |

Thứ tự là một phần của hợp đồng: so sánh hai lớp chỉ dựa vào thứ tự, không dựa vào tên.
`aggregate_anonymous` là thấp nhất và `payment` là cao nhất.
Thêm một lớp mới chỉ được đặt ở đầu hoặc cuối thang; chèn vào giữa làm mọi mức trần phải xem lại.

Lớp gắn theo trường, không theo nguồn.
Lớp của một nguồn, khi cần báo cáo, là lớp cao nhất trong các trường của nguồn đó.
Lab suy ra lớp nguồn từ các trường và không khai riêng, đúng phần ngoài phạm vi của issue #154.

### 3.2. Hồ sơ ứng dụng trong file luật

File luật có thêm khối `clients`.
Mỗi mục là một tên ứng dụng, một lớp ứng dụng và một mức trần:

```json
{
  "clients": {
    "tho-than-desktop": { "class": "appota_hosted", "ceiling": "employee_personal" },
    "tho-than-web": { "class": "appota_hosted", "ceiling": "employee_personal" },
    "user_device": { "class": "user_device", "ceiling": "internal_general" }
  }
}
```

Ba lớp ứng dụng là `appota_hosted` (do Appota vận hành), `vendor_hosted` (do một hãng ngoài vận hành) và `user_device` (chạy trên máy cá nhân).
Lớp ứng dụng là nhãn để báo cáo và để chọn mức trần gợi ý; mức trần có hiệu lực là giá trị `ceiling` trong hồ sơ.
Vì vậy một chủ dữ liệu có thể hạ hoặc nâng mức trần của một ứng dụng mà không phải đổi lớp của nó.

File luật gốc khai sáu hồ sơ:

| Tên ứng dụng | Lớp ứng dụng | Mức trần | Vì sao |
| --- | --- | --- | --- |
| `tho-than-desktop` | `appota_hosted` | `employee_personal` | Ứng dụng desktop của công ty, dùng cho ví dụ xuyên suốt |
| `tho-than-web` | `appota_hosted` | `employee_personal` | Cùng ứng dụng của công ty trên web |
| `fc-assistant` | `appota_hosted` | `employee_personal` | Trợ lý gọi hàm của Lab, giữ nguyên hành vi cũ |
| `lab-console` | `appota_hosted` | `employee_personal` | Sân chơi của trang điều khiển, chỉ mở trên máy chạy cổng |
| `test` | `appota_hosted` | `employee_personal` | Bộ phép thử nghiệm thu, không phải một sản phẩm |
| `user_device` | `user_device` | `internal_general` | Ứng dụng trên máy cá nhân, dùng để thử ràng buộc mới |

Ứng dụng không khai trong bảng nhận mức thấp nhất của thang, tức `aggregate_anonymous`.
Hôm nay không trường nào thuộc lớp đó, nên ứng dụng chưa khai không nhận trường nào.
Đây là ý muốn theo SR5 (không chắc thì chặn), không phải một lỗi: người vận hành phải thêm hồ sơ trước khi một ứng dụng mới đọc được dữ liệu.

Khối `clients` thiếu hẳn được coi như bảng rỗng, nên mọi ứng dụng nhận mức thấp nhất.
Một tên lớp hoặc tên mức trần lạ làm cả file không hợp lệ, và mọi lời gọi bị từ chối với `POLICY_UNAVAILABLE`.
Lý do: một tên gõ sai là lỗi cấu hình, không phải một quyết định hạ quyền.

### 3.3. Trường trả về là giao của hai điều kiện

Mỗi loại bản ghi có thêm khối `data_classes`, gắn một lớp cho từng trường:

```json
{
  "resources": {
    "employee": {
      "data_classes": {
        "id": "internal_general",
        "name": "internal_general",
        "department": "internal_general",
        "role": "internal_general",
        "work_email": "internal_general",
        "personal_phone": "employee_personal",
        "home_address": "employee_personal"
      }
    }
  }
}
```

Trường được trả là giao của hai tập:
- Trường mà vai của người hỏi được xem, lấy từ `resources.<loại>.fields.<vai>`.
- Trường có lớp không vượt mức trần của ứng dụng đang gọi.

Thứ tự trường trong câu trả lời vẫn là thứ tự của danh sách vai.
Khối `data_classes` không thêm trường nào vào câu trả lời; nó chỉ bỏ bớt.

Trường thiếu lớp không được trả, kể cả khi vai được xem trường đó.
Trường đó được đếm riêng là "chưa khai lớp" và câu trả lời nêu tên nó với lý do chưa khai, khác với lý do vượt trần.
Một khoá trong `data_classes` mà bộ tiếp hợp không khai là lỗi gõ, làm cả file không hợp lệ.

File luật không đọc được thì `allowedFields` trả `POLICY_UNAVAILABLE` và không trả trường nào.
Đây là hành vi cũ của SR5 (không chắc thì chặn), không đổi.

Ứng dụng không đổi vai, phòng, phạm vi đọc, hiệu lực của hành động ghi hay bước duyệt.
Nó chỉ bỏ bớt trường, nên không có chuyện một khoá của ứng dụng máy cá nhân mở thêm quyền mà vai không có.

Đề xuất ghi cũng chịu điều kiện này.
`policy.decide` biết các trường của từng hành động từ bộ tiếp hợp, nên nếu một trường của hành động vượt trần thì cả hành động bị từ chối với `data_class_exceeds_client`.
Đề xuất không chứa giá trị cũ hay giá trị mới của trường vượt trần, nên thẻ xác nhận và bước ghi cũng không có trường đó.
Lần kiểm thứ hai lúc bấm Gửi dùng cùng phép kiểm, nên mức trần bị hạ sau khi soạn cũng chặn được lệnh ghi.

### 3.4. Tên ứng dụng lấy từ bản ghi khoá

Tên ứng dụng là `caller` trong bản ghi khoá, do người quản trị đặt lúc cấp khoá.
Cổng lấy tên đó từ `KeyRecord.caller`, đưa vào `Identity.caller` rồi vào `context.caller` của bộ luật.
Cổng không đọc tên ứng dụng từ body, từ header hay từ tham số của tool.
Header `x-user-id` vẫn chỉ là một lời khai được che rồi ghi vào vết, không phải đầu vào của quyết định, đúng ADR-0005.

Hai tên `tho-than-web` và `user_device` được thêm vào danh sách nơi gọi hợp lệ.
Bảng khoá tự dựng lại ràng buộc như khi thêm một nơi gọi trước đây, và khoá cũ vẫn dùng được.

Một người có thể giữ hai khoá với hai tên ứng dụng khác nhau và nhận hai mức trần khác nhau.
Mức trần đi theo khoá, không đi theo người.
Xoay khoá sang một tên ứng dụng khác thì lần gọi sau đã đổi mức trần.
Người giữ khoá không tự đổi được tên ứng dụng của khoá mình.

### 3.5. Lời từ chối và `deny_reason`

Câu trả lời của cổng có thêm trường `deny_reason`, dùng đúng ba tên của cổng công ty:

| Mã nội bộ của Lab | `deny_reason` | Khi nào |
| --- | --- | --- |
| `NOT_PERMITTED`, `NOT_FOUND` bị che vì ngoài phạm vi | `no_permission` | Vai, phòng, danh tính hoặc phạm vi không cho xem hay làm |
| Trường hoặc hành động vượt mức trần | `data_class_exceeds_client` | Ứng dụng không được nhận lớp dữ liệu đó |
| `TARGET_CHANGED` | `stale_target` | Bản ghi đã đổi hoặc đã mất từ lúc soạn |

Ba tên này là toàn bộ từ vựng của cổng, nên một lời từ chối khác như `KEY_INVALID`, `POLICY_UNAVAILABLE` hay `APPROVAL_EXPIRED` nhận `no_permission`.
Mã nội bộ `reason_code` giữ nguyên và nói rõ nguyên nhân thật; `deny_reason` chỉ là tên thêm ở lớp ngoài.
Phép thử và bảng vết tiếp tục so `reason_code`, không so câu chữ.

`deny_reason` có mặt ở cả hai cửa: trường cấp cao nhất trong JSON của `POST /v1/tools`, và `_meta` của câu trả lời MCP.
Trường này là `null` khi lời gọi thành công và không che gì.

Một câu trả lời đọc thành công nhưng bỏ trường vì vượt trần vẫn mang `deny_reason` là `data_class_exceeds_client`.
Trường hợp này không phải từ chối cả lời gọi, nhưng người đọc cần biết vì sao thiếu trường.
Một lần tìm không có ai khớp thì không phải từ chối, nên `deny_reason` là `null`.

### 3.6. Vết ghi tên ứng dụng và số trường bị bỏ

Bảng vết đã có cột `caller`, nên tên ứng dụng đã được ghi ở mỗi dòng.
ADR này thêm cột `dropped_fields`, một số nguyên đếm số tên trường bị bỏ vì vượt trần hoặc vì chưa khai lớp trong lần gọi đó.
Đếm theo tên trường, không theo số bản ghi: tìm mười nhân viên mà cùng bỏ `personal_phone` thì đếm là một.
Với một đề xuất bị từ chối vì trường vượt trần, đếm số trường của hành động bị chặn.
Vết không ghi tên trường và không ghi giá trị, chỉ ghi số, để không mang dữ liệu cá nhân vào sổ.

Dòng vết cũ trong cơ sở dữ liệu nhận giá trị 0 khi cột được thêm.
Cột `out_of_scope` giữ nghĩa cũ là bị che vì phạm vi; trường bị client bỏ dùng `dropped_fields` và `deny_reason`.

### 3.7. Màn hình luật của console

Màn hình luật đọc và ghi cả file qua `rulesSchema`, nên hai khối mới là một phần của lược đồ và phải sống qua một lần lưu.
Màn hình không được dựng một đối tượng luật mới từ các ô nó hiển thị; nó phải bắt đầu từ file đã đọc và chỉ thay những ô người vận hành sửa.
Sửa hồ sơ ứng dụng trên console nằm ngoài phạm vi issue #154; người vận hành sửa file hoặc bấm "về bản gốc".

### 3.8. SR8 (dùng lại, quyền theo người)

Câu trong PRD đổi từ "Nơi gọi không mang quyền riêng" thành "Nơi gọi không cộng quyền; mức trần của client chỉ hạ quyền".
Phép thử SR8 chạy hai nơi gọi có cùng mức trần và so câu trả lời; một nơi gọi có mức trần thấp hơn phải nhận ít trường hơn.
Phép thử cũ `policy scope: the caller carries no rights of its own` đổi thành phép thử "ứng dụng không bao giờ cộng quyền, và hạ trần đúng như bảng".
Không bộ tiếp hợp nào phải sửa, nên phần "dùng lại" của SR8 vẫn giữ nguyên.

**Kết luận:** ứng dụng chỉ hạ trần; tên ứng dụng do khoá quyết định; trường thiếu lớp hoặc file hỏng thì không trả; lời từ chối dùng chung ba tên với cổng công ty.

## 4. Hệ quả

- File luật to hơn: thêm khối `clients` và một khối `data_classes` cho mỗi loại bản ghi.
  File gốc là bản tham chiếu; file đang chạy trong `lab/.data` phải được cập nhật hoặc trả về bản gốc.
- Một file luật kiểu cũ thiếu hai khối vẫn đọc được, nhưng mọi ứng dụng nhận mức thấp nhất và mọi trường bị coi là chưa khai lớp, nên không có dữ liệu nào ra.
  Đây là hậu quả có chủ ý của SR5, không phải một lỗi im lặng: câu trả lời nêu tên trường bị bỏ và vết đếm chúng.
- Mọi nơi gọi đang dùng phải có hồ sơ, nếu không sẽ mất dữ liệu.
  Bản gốc khai `tho-than-desktop`, `tho-than-web`, `fc-assistant`, `lab-console`, `test` và `user_device` để giữ hành vi cũ và có một ứng dụng thử.
- Khoá `user_device` của chị Nhung đọc được dữ liệu nội bộ nhưng không đọc được số điện thoại hay địa chỉ nhà.
  Đây là bằng chứng nghiệm thu của issue #154, không phải một quyền mới.
- Bảng vết thêm một cột; cơ sở dữ liệu cũ được thêm cột với giá trị 0.
- Câu trả lời HTTP và MCP thêm một trường; bên gọi cũ bỏ qua trường lạ nên không phải sửa.
- Một trường bị gắn lớp quá thấp sẽ lọt tới ứng dụng có mức trần thấp.
  Cách sửa nằm ở một chỗ là `data_classes`, và chủ dữ liệu phải duyệt bảng lớp trước khi merge.
- Không thêm lời gọi mạng và không thêm bảng mới, nên độ trễ của một lần đọc gần như không đổi.
- `fc-assistant` và `test` được khai là `appota_hosted` để giữ hành vi cũ; đây là nhãn của Lab, không phải một tuyên bố về cách chúng chạy trong công ty.

**Kết luận:** cái giá là file luật to hơn và một lần cập nhật file đang chạy; đổi lại, ràng buộc của công ty được kiểm bằng dữ liệu và bằng phép thử.

## 5. Kiểm lại thế nào

| Điều cần đúng | Phép thử |
| --- | --- |
| Ứng dụng không cộng quyền | `policy scope: a client never adds a right and lowers the ceiling like the table`: intern qua mọi ứng dụng vẫn bị từ chối; staff qua mọi ứng dụng vẫn được; ứng dụng máy cá nhân không biến một ô `deny` thành `allow` |
| Hạ trần đúng bảng | Chị Nhung qua `tho-than-desktop` thấy số điện thoại; qua `user_device` không thấy, và câu trả lời nêu tên trường với lý do `data_class_exceeds_client` |
| Hai nơi gọi cùng mức trần | `SR8: two callers with the same ceiling get the same fields`: hai khoá khác tên nhưng cùng mức trần cho cùng câu trả lời |
| Trường thiếu lớp | Xoá `personal_phone` khỏi `data_classes` trong một file tạm: trường đó không ra, các trường khác vẫn ra, vết đếm 1 |
| File luật không đọc được | Các phép thử `policy unavailable` và `read: a rule file that cannot be read stops every tool` vẫn phải đạt: không trường nào ra |
| Ứng dụng chưa khai | Gọi bằng một tên không có trong `clients`: không nhận trường nào; `dropped_fields` bằng số trường của vai |
| Ghi trường vượt trần | Đổi lớp `work_email` thành `employee_personal` trong file tạm: chị Nhung qua `user_device` soạn `edit_work_email` bị từ chối với `data_class_exceeds_client`, không có đề xuất và không có lệnh ghi |
| `deny_reason` ở hai cửa | `NOT_PERMITTED` cho `no_permission`, `TARGET_CHANGED` cho `stale_target`, vượt trần cho `data_class_exceeds_client`; JSON của `/v1/tools` và `_meta` của `/mcp` cùng giá trị |
| Vết ghi tên ứng dụng và số trường | Dòng vết của lần gọi bằng `user_device` có `caller = 'user_device'` và `dropped_fields = 2` khi chị Nhung tra anh Minh |
| Console giữ khoá mới | Đọc một file có `clients` và `data_classes`, lưu qua màn hình luật, đọc lại: hai khối còn nguyên |
| SR8 trong PRD | Câu mới có mặt trong bảng yêu cầu; `lab/scripts/sr-map.json` có mẫu tên của hai phép thử mới |

**Kết luận:** mỗi lời hứa của ADR có một phép thử chạy lại được, và phép thử quan trọng nhất là hai khoá cùng mức trần cho cùng câu trả lời.

## 6. Xem lại khi

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| Chủ dữ liệu muốn một ứng dụng nhận ít hơn hoặc nhiều hơn bảng gốc | Sửa `ceiling` của hồ sơ đó trong file luật; không đổi lớp ứng dụng |
| Một ứng dụng cần nhận lớp `customer_personal` hoặc `payment` | Chủ dữ liệu duyệt, thêm trường và lớp tương ứng, rồi thêm phép thử cho ứng dụng đó |
| Một trường đổi mức nhạy cảm | Sửa `data_classes`, chạy lại phép thử hạ trần, ghi lý do trong PR |
| Nối hệ thống khách hàng hoặc thanh toán đầu tiên | Thêm loại bản ghi và trường, gán lớp, kiểm lại toàn bộ bảng trần |
| Có OAuth hoặc đăng ký ứng dụng động | Tên ứng dụng có thể đến từ token thay vì bản ghi khoá; viết ADR mới và giữ nguyên nguyên tắc không lấy từ request |
| Console cần sửa hồ sơ ứng dụng | Dựng màn hình sửa có kiểm lược đồ và lưu lịch sử như màn hình luật hiện nay |
| Thêm một lớp mới vào giữa thang | Không làm; đặt lớp mới ở đầu hoặc cuối, hoặc viết ADR đổi toàn bộ thang |
| Ứng dụng chưa khai làm hỏng việc thường ngày | Thêm hồ sơ cho ứng dụng đó; chỉ đổi mức mặc định nếu có ADR và có chủ dữ liệu duyệt |

**Kết luận:** chỗ dễ đổi nhất là mức trần của từng hồ sơ và bảng lớp của từng trường, cả hai đều nằm trong file luật chứ không nằm trong mã.

## Tài liệu liên quan

- [Khớp bản thử của Lab với AgentLize Gateway](../../rd/design/agentlize-gateway-alignment.md)
- [PRD AI Platform, SR8](../../rd/problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc)
- [ADR-0005, danh tính người yêu cầu](adr-0005-requester-identity.md)
- [ADR-0007, bộ tiếp hợp và luật dạng dữ liệu](adr-0007-system-adapters-and-change-sets.md)
- [Bảng thuật ngữ](../../rd/problem/glossary.md)
