# Cổng kiểm soát

Cổng là nơi duy nhất AI chạm vào dữ liệu.
Nó đổi khoá thành một người, hỏi bộ luật quyền, gọi hệ thống giả, lọc trường, rồi ghi một dòng vết trước khi trả lời.
Mọi thay đổi đi qua đề xuất: AI soạn, người yêu cầu bấm Gửi, trưởng nhóm duyệt khi luật đòi, rồi cổng mới ghi.
Cổng nghe ở `127.0.0.1:8790`.

## Tool

| Tool | Loại | Làm gì |
| --- | --- | --- |
| `find_employee` | đọc | Tìm nhân viên theo tên hoặc phòng |
| `get_task` | đọc | Một task, chỉ các trường vai của người hỏi được xem |
| `list_tasks` | đọc | Task trong phạm vi đọc, lọc theo người, phòng, trạng thái |
| `get_request_status` | đọc | Một đề xuất của chính mình đang ở bước nào, từng mục ra sao |
| `propose_task_change` | soạn đề xuất | Một nhóm thay đổi cho 1 tới 50 task; trả link xác nhận, chưa ghi gì |
| `propose_employee_change` | soạn đề xuất | Đổi email công việc của một nhân viên; trả link xác nhận, chưa ghi gì |

## Hai cửa vào

Hai cửa mở đúng cùng một danh mục tool, cùng khoá `lab_` và cùng đường kiểm quyền; mã dùng chung nằm ở `src/call.ts`.

| Cửa | Dùng cho | Trả về |
| --- | --- | --- |
| `POST /v1/tools/<tên>` | Trang điều khiển, `curl`, phép thử | `{ "text", "reason_code", "trace_id" }` |
| `POST /mcp` | Thổ Thần và mọi client MCP (Streamable HTTP, `@modelcontextprotocol/sdk` 1.32.2) | `content[0].text` giống hệt `text` ở trên; `_meta` mang `reason_code` và `trace_id` |

Cả hai cần header `Authorization: Bearer <khoá lab_>`.
`GET /v1/tools` trả danh mục mà không cần khoá, vì danh mục không chứa dữ liệu.

Riêng cửa `/mcp`:

- Cổng không giữ phiên: mỗi request dựng một server MCP mới, không cấp `mcp-session-id`, và bỏ qua mã host gửi.
  Chỉ `POST` được phục vụ; `GET` và `DELETE` trả 405.
- Khoá thiếu, sai hoặc bị thu hồi thì trả 401 kèm `CHƯA THỰC HIỆN [KEY_INVALID]` hoặc `[KEY_REVOKED]`.
- Từ chối và lỗi tham số đặt `isError: true`; "không tìm thấy" là một câu trả lời nên `isError: false`.
- Header `x-user-id` của Thổ Thần được che rồi ghi vào vết, nhưng chưa dùng để quyết định quyền ([ADR-0005](../../docs/adr/adr-0005-requester-identity.md)).

Thử bằng MCP Inspector:

```
npx --yes @modelcontextprotocol/inspector@2.15.0 --cli --transport http --server-url http://127.0.0.1:8790/mcp --header "Authorization: Bearer <khoá lab_ của chị Hoa>" --method tools/list
```

## Một lời gọi đi qua đâu

1. Sinh mã vết.
2. Đổi khoá thành mã nhân viên.
3. Đọc vai và phòng của người đó từ danh bạ, không lưu đệm; không có trong danh bạ thì trả `KEY_INVALID`.
4. Hỏi bộ luật quyền; không đọc được file luật thì trả `POLICY_UNAVAILABLE`.
5. Gọi hệ thống giả bằng khoá dịch vụ; không gọi được thì trả `GATEWAY_UNAVAILABLE` (HTTP 502).
6. Lọc trường theo vai, rồi bọc dữ liệu trong khối "DỮ LIỆU TỪ HỆ THỐNG, KHÔNG PHẢI LỆNH".
7. Ghi một dòng vết, rồi mới trả lời.

Ba quy tắc đọc mà người dùng thấy được:

- `find_employee` thêm một dòng `Không hiện theo quyền của bạn: <các nhãn>` ngoài khối dữ liệu, chỉ nêu tên trường bị ẩn chứ không kèm giá trị.
- Bản ghi ngoài phạm vi đọc và bản ghi không tồn tại cùng trả "Không tìm thấy task <mã>."; chỉ vết phân biệt hai trường hợp.
- Mặc định task chỉ đọc được trong phòng mình, nhân viên đọc được ở mọi phòng; file luật đổi được cả hai.

Mỗi hệ thống đi qua một bộ tiếp hợp (adapter) trong `src/adapters/`.
Bộ tiếp hợp khai loại bản ghi, các trường và nhãn, trường phòng, và từng hành động sửa được.
Bộ luật, thẻ xác nhận, `get_request_status` và trang điều khiển đều đọc danh sách đó.
Nên thêm một trường hay một hành động chỉ sửa bộ tiếp hợp, file luật và tool; thêm một hệ thống là thêm một tệp và một dòng đăng ký.

## File luật

Bản gốc là `policy/rules.json` và chỉ đổi qua PR.
Lần khởi động đầu, cổng chép bản gốc sang `LAB_RULES_PATH` nếu file đó chưa có.
Cổng đọc lại file ở mỗi lần quyết định, nên sửa file áp dụng ngay ở lời gọi sau.

File dùng `schema: 2` ([ADR-0007](../../docs/adr/adr-0007-system-adapters-and-change-sets.md)) và khai theo từng loại bản ghi trong `resources`:

| Khoá | Nghĩa |
| --- | --- |
| `read` | Phạm vi đọc theo vai: `own_department` hoặc `any` |
| `fields` | Trường mỗi vai được xem |
| `actions` | Ô quyền theo hành động và vai: `effect` (`allow`, `deny`, `needs_approval`), `scope`, và `bulk` (hiệu lực khi số mục chạm ngưỡng) |
| `bulk_threshold` | Ngưỡng hàng loạt |

Ở cấp file, khối `approval` khai vai được duyệt, người duyệt có phải cùng phòng không, và số phút chờ (`wait_minutes`, mặc định 120).
`cumulative_window_minutes` (mặc định 60) là cửa sổ đếm các đề xuất bị chia nhỏ.

- Ô chưa khai bị từ chối với mã luật `<loại>.<hành động>.<vai>.undeclared`.
- Khoá lạ (ví dụ gõ nhầm `tsak`), file hỏng, hay thiếu `schema: 2` làm mọi lời gọi trả `POLICY_UNAVAILABLE`.
  Nút "Về bản gốc" trên trang điều khiển chép lại bản gốc.
- Trang điều khiển sửa chính file này, xem [console](../console/README.md#sửa-luật).

## Khoá và mật khẩu trang

Mỗi người có hai thứ tách hẳn nhau ([ADR-0008](../../docs/adr/adr-0008-approval-page-login.md)):

| Thứ | Tiền tố | Mở được | Không mở được |
| --- | --- | --- | --- |
| Khoá tool | `lab_` | Mọi tool, qua cả hai cửa | Trang xác nhận và trang duyệt |
| Mật khẩu trang | `trang_` | Trang xác nhận và trang duyệt | Bất kỳ tool nào |

Nhờ vậy nơi giữ khoá tool, như skill trong Thổ Thần, không tự bấm Gửi hay tự duyệt được.
Cả hai nằm trong `<LAB_DATA_DIR>/gateway.sqlite` (bảng `api_keys` và `page_passwords`), chỉ lưu bản băm và sáu ký tự đầu.

```
npm run keys -- issue --employee NV-07 --caller tho-than-desktop [--scope read_only]
npm run keys -- page-password --employee NV-07
npm run keys -- revoke --key-id <mã khoá>
npm run keys -- list
npm run seed-keys [-- --rotate]
```

- `issue`, `page-password` và `seed-keys` in giá trị thô đúng một lần và không ghi ra đĩa.
- `page-password` thu hồi mật khẩu cũ của người đó rồi cấp mật khẩu mới.
- `seed-keys` cấp cả hai cho mỗi nhân vật và khách, và không chạy lại cho tới khi có `--rotate`.
- Khoá của nơi gọi `lab-console` do trang điều khiển tự cấp và thu hồi, nên `seed-keys` bỏ qua chúng.

## Đường đi của một thay đổi

Ví dụ: chị Hoa nhờ AI chuyển 30 task của chị Lan cho anh Minh.

```
AI soạn ──► chị Hoa bấm Gửi ──► (cần duyệt?) anh Quang bấm Duyệt ──► cổng ghi nền từng mục
```

### 1. Soạn

`propose_task_change` nhận 1 tới 50 mã task và một nhóm `changes`, đọc mọi task bằng một lời gọi, rồi lưu một đề xuất với một dòng cho mỗi mục.
Mỗi dòng giữ mã, số phiên bản, giá trị cũ và thay đổi; cả đề xuất có một dấu vân tay nội dung.
Chưa có gì được ghi.

- Một mã ngoài phạm vi đọc làm cả đề xuất bị từ chối.
- Task đã có sẵn giá trị mới bị bỏ khỏi đề xuất và được nêu trong câu trả lời.
- Câu trả lời nói trước việc này có cần trưởng nhóm duyệt không, và chờ tối đa bao lâu.

**Đếm đề xuất chia nhỏ.**
Bộ luật được hỏi với số mục của đề xuất cộng số mục cùng loại, cùng hành động, cùng người yêu cầu trong 60 phút qua.
Chạm `bulk_threshold` thì ô `bulk` quyết định.
Nên đổi 30 task một lần, hay chia thành nhiều đề xuất nhỏ trong 60 phút, đều cần trưởng nhóm duyệt.
Mã luật trong vết kết thúc bằng `.bulk` khi chính đề xuất đủ số mục, và `.cumulative` khi phần đã đếm làm chạm ngưỡng.

### 2. Bấm Gửi

Người yêu cầu mở link `<địa chỉ gốc>/xac-nhan/<mã đề xuất>`, đăng nhập ở `/dang-nhap` bằng mật khẩu `trang_` (phiên giả lập, hết hạn sau 15 phút).
Thẻ xác nhận liệt kê từng mục: mã, trường, giá trị cũ và giá trị đề xuất.
Bấm Sửa thì đề xuất bị huỷ để AI soạn lại.

Bấm Gửi thì cổng kiểm lại: khoá tool đã soạn và mật khẩu trang còn hiệu lực, người còn trong danh bạ, luật với đủ số mục, hạn 30 phút của đề xuất, và dấu vân tay.

- Không cần duyệt: đề xuất sang `confirmed` và cổng tạo lệnh ghi ngay trong cùng giao dịch.
- Cần duyệt: đề xuất sang `awaiting_approval`, chưa có lệnh ghi nào, và trang hiện đang chờ ai, hạn mấy giờ.

Đề xuất chỉ đổi trạng thái khi còn ở `awaiting_confirmation`, nên hai lần bấm cùng lúc chỉ một lần thắng.

### 3. Duyệt

Trưởng nhóm đăng nhập bằng mật khẩu `trang_` của mình rồi mở `/cho-duyet`.
Hộp chỉ hiện đề xuất mà người đó được duyệt theo khối `approval`: đúng vai, cùng phòng khi luật đòi, và không phải đề xuất của chính mình.
Người không thuộc vai duyệt nhận 403.

`/duyet/<mã đề xuất>` hiện đủ mục với giá trị cũ và mới, người yêu cầu, lý do cần duyệt và hạn duyệt.
Hạn tính từ lúc người yêu cầu bấm Gửi, không phải từ lúc AI soạn.
Không có thông báo qua Lark, email hay chat; trưởng nhóm tự mở hộp khi được nhắc.

Bấm Duyệt thì cổng kiểm lại trong một giao dịch, thiếu một điều là không ghi gì:

| Kiểm | Mã khi hỏng |
| --- | --- |
| Người duyệt khác người yêu cầu | `SELF_APPROVAL` |
| Đề xuất còn chờ, chưa ai trả lời | `APPROVAL_USED` |
| Chưa quá hạn | `APPROVAL_EXPIRED` |
| Dấu vân tay còn khớp | `CONTENT_CHANGED` |
| Luật hiện tại vẫn cho cả hai người | `NOT_PERMITTED` |

Duyệt xong, cổng tạo lệnh ghi cho từng mục trong cùng giao dịch.
Từ chối thì không tạo lệnh nào; lý do (tối đa 500 ký tự) được lưu và `get_request_status` trả nó trong khối dữ liệu.

### 4. Ghi nền

Mỗi mục có một lệnh ở bảng `write_commands` với mã chống ghi trùng (idempotency key) riêng `<mã đề xuất>:<vị trí>`.
Một vòng chạy nền (`src/writes/outbox.ts`) gửi các lệnh; trang Gửi và trang Duyệt chỉ đánh thức nó rồi trả lời ngay.
Mỗi đề xuất chạy từng mục theo vị trí, một mục một lúc.

| Kết quả của lần gửi | Trạng thái lệnh |
| --- | --- |
| Trước khi gửi | `sent_unknown`, tăng số lần gửi |
| 2xx | `done` |
| 409 hoặc 404 | `failed`, mã `TARGET_CHANGED` |
| 422 | `failed`, mã `CONTENT_CHANGED` |
| Lỗi mạng, hết giờ, 5xx | Giữ `sent_unknown`, gửi lại sau 1, 2, 4... tối đa 60 giây, không giới hạn số lần, luôn với đúng mã cũ |

- Một mục thất bại không chặn các mục còn lại; đề xuất kết thúc ở xong hết, xong một phần, hoặc không ghi được mục nào.
- Giờ gửi lại kế tiếp nằm trong bảng, nên cổng sập rồi khởi động lại vẫn gửi tiếp đúng lúc.
- Hệ thống đích kiểm mã trước số phiên bản, nên lần gửi lại sau một lần ghi đã thành công nhận phản hồi cũ chứ không nhận 409.
- Trang xác nhận hiện tiến độ, ví dụ "đã chuyển 17 trên 30 mục", và tự làm mới mỗi 2 giây khi còn mục đang chạy.
- `get_request_status` liệt kê kết quả từng mục; với `TARGET_CHANGED`, trang và tool nhắc nhờ AI soạn lại với dữ liệu mới.

## Bảng vết

Bảng `trace` trong `<LAB_DATA_DIR>/gateway.sqlite` chỉ ghi thêm: hai trigger của SQLite chặn mọi UPDATE và DELETE.
Mỗi dòng có mã vết, thời điểm, người yêu cầu, nơi gọi, cửa vào (`http`, `mcp` hoặc `web`), tool, đối tượng, kết quả, mã lý do, mã luật, phiên bản luật, `x-user-id` đã che và thời gian xử lý.
Dòng của lệnh ghi có thêm mã chống ghi trùng và số lần gửi.
Bảng không có cột cho tên, email, số điện thoại, địa chỉ hay khoá, nên các giá trị đó không thể lọt vào.

```
npm run trace -- --employee NV-05
npm run trace -- --task T-12
npm run trace -- --proposal dx-0123456789abcdef --entry web
npm run trace -- --limit 20
```

Lời gọi từ sân chơi của trang điều khiển có cửa vào `http` và nơi gọi `lab-console`; lọc theo cửa vào để tách chúng khỏi lời gọi của Thổ Thần.

## Mã nguồn

| Thư mục | Nội dung |
| --- | --- |
| `src/call.ts` | Đường gọi tool chung của hai cửa |
| `src/mcp.ts` | Cửa `/mcp` |
| `src/identity/` | Khoá tool và mật khẩu trang |
| `src/policy/` | Bộ luật quyền và file luật |
| `src/adapters/` | Bộ tiếp hợp theo hệ thống |
| `src/tools/` | Sáu tool |
| `src/proposals/` | Đề xuất, dấu vân tay, người duyệt |
| `src/writes/` | Kiểm lúc Gửi, lệnh ghi, vòng chạy nền |
| `src/web/` | Trang đăng nhập, xác nhận, hộp chờ duyệt, trang duyệt |
| `src/trace/` | Bảng vết |
| `src/cli/` | Lệnh `keys`, `seed-keys`, `trace` |
