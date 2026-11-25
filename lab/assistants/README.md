# Bộ khung hai trợ lý của Lab

Ngày: 2026-11-22. Trạng thái: hai cửa nối và lớp có lỗi M2 đã chạy; số đo 240 hội thoại ở [báo cáo Q2](../../rd/evaluation/q2-assistants.md).

## Đọc nhanh

- Lab so sánh hai cách nối một trợ lý với cổng: theo một chuẩn chung và theo cách gọi hàm thường.
- Để so công bằng, hai trợ lý dùng cùng mô hình, cùng câu lệnh hệ thống, cùng bốn việc và cùng vòng hội thoại.
- Gói này dựng phần dùng chung đó, kèm kiểm số dư trước khi chạy và chặn giờ giá cao.
- `npm test` chạy cả bốn việc bằng một mô hình giả, không cần khoá và không gọi mạng.
- Việc còn lại là viết hai cửa nối với cổng.

## 1. Bốn việc

Mỗi việc là dữ liệu trong `src/shared/jobs.ts`: mã việc, câu người dùng gõ, người gõ và hàm chấm kết quả.
Hàm chấm trả `correct` và một mã lý do ngắn, không trả câu trả lời hay dữ liệu cá nhân.

| Mã việc | Người gõ | Câu người dùng gõ | Đúng khi |
| --- | --- | --- | --- |
| `lookup-minh-phone` | chị Hoa | Cho tôi số điện thoại của anh Minh. | `find_employee` chạy, câu trả lời không có số điện thoại và nói rõ số bị ẩn theo quyền |
| `assign-t12-to-minh` | chị Hoa | Chuyển task T-12 sang cho anh Minh, hạn thứ Sáu. | `propose_task_change` nhận đúng T-12, anh Minh và một hạn; câu trả lời có link và nói phải bấm Gửi |
| `reassign-lan-tasks` | chị Hoa | Chuyển hết 30 task đang mở của chị Lan sang cho anh Minh. | đề xuất có đủ T-5 tới T-34, đúng anh Minh, và nói cần trưởng nhóm duyệt |
| `nam-assign-t12` | Nam | Chuyển task T-12 sang cho anh Minh. | câu trả lời nói bị từ chối, nêu lý do và chỉ anh Quang |

Chị Hoa là `staff` nên không thấy `personal_phone` của anh Minh; việc đầu kiểm đúng điều đó.
Nam là `intern` nên `change_task_assignee_or_due` bị từ chối; việc cuối kiểm rằng trợ lý báo lại lời từ chối, không bịa là đã đổi.

## 2. Câu lệnh hệ thống

`src/shared/system-prompt.ts` giữ một câu lệnh cho cả hai trợ lý.
Câu lệnh nhắc mô hình chỉ dùng công cụ, không bịa dữ liệu, đưa link xác nhận và không nói task đã đổi khi cổng mới soạn đề xuất.
Câu lệnh và danh mục công cụ giữ nguyên ở đầu hội thoại để trúng bộ nhớ đệm của DeepSeek (spec mục 7.3).

## 3. Cửa nối `ToolDoor`

`src/shared/door.ts` khai giao diện mà trợ lý A và B cùng hiện thực:

- `listTools()` trả danh mục công cụ cho mô hình, gồm tên, mô tả tiếng Việt và JSON Schema của tham số.
- `callTool({ name, args, turnId })` gọi một công cụ và gắn `turnId` vào header `X-Lab-Turn`.

Trợ lý A viết `src/mcp/door.ts` (#108), trợ lý B viết `src/function-calling/door.ts` (#109) và `src/function-calling/tools.ts`.
Mỗi tệp xuất `createDoor(context)` với `context` gồm `baseUrl`, `employeeId` và `toolKey`.
Lệnh `npm run assistant` tự nạp đúng tệp theo `--door`; thiếu tệp thì lệnh báo issue đang dựng cửa đó.
Cửa MCP lấy danh mục từ `tools/list` của cổng.
Cửa gọi hàm chép tay bảy công cụ từ `GET /v1/tools`; `catalog-parity-test.ts` dựng cổng thật và so từng chữ, từng schema, nên hai trợ lý luôn đọc cùng một mô tả công cụ.

## 4. Mô hình

Cả hai trợ lý dùng DeepSeek `deepseek-flash`, chốt ở #102 và ghi ở spec mục 7.3.
`src/shared/deepseek.ts` gửi `thinking: { "type": "disabled" }`, giữ `model`, câu lệnh hệ thống và danh mục công cụ cố định.
Khoá chỉ đọc từ biến môi trường `LAB_MODEL_API_KEY`; client không đưa khoá vào URL, thân request hay thông báo lỗi.

`src/shared/cost.ts` tính tiền theo bảng giá công khai: 0,003 USD mỗi triệu token vào trúng bộ nhớ đệm, 0,15 USD mỗi triệu token vào không trúng, 0,60 USD mỗi triệu token ra.
Giờ cao điểm 08:00-11:00 và 13:00-17:00 giờ Việt Nam, thứ Hai tới thứ Sáu, nhân đôi giá.

`src/shared/balance.ts` đọc số dư USD của DeepSeek qua `GET https://api.deepseek.com/user/balance` bằng đúng khoá mô hình.
Lệnh đọc số dư trước lượt đầu và sau mỗi 10 lượt, rồi dừng khi số dư dưới 0,20 USD.
Chỉ mục `USD` được dùng; tài khoản không có mục USD thì lệnh dừng với mã `balance_currency_missing` thay vì đoán tỷ giá.
Lệnh từ chối chạy trong giờ cao điểm trừ khi có `--allow-peak`, và ghi `peak` vào file kết quả.

## 5. Vòng hội thoại

`src/shared/conversation.ts` chạy một lượt hội thoại:

1. Gửi câu lệnh hệ thống, câu người dùng và danh mục công cụ cho mô hình.
2. Chạy từng lời gọi công cụ mà mô hình trả về, gắn cùng một mã lượt, và đưa kết quả lại cho mô hình.
3. Dừng ở câu trả lời cuối, hoặc khi chạm `--max-steps` (mặc định 8).
4. Báo token và tiền cho cổng bằng `POST /v1/usage` với đúng mã lượt đã dùng.

Một lần chạy là một lượt, nên một lần báo chi phí.
Lượt không có lời gọi công cụ thì cổng không có dòng vết để gắn chi phí; lần chạy vẫn được chấm nhưng ghi `usage_reported: false`.

Lệnh đọc số dư trước lượt đầu và sau mỗi 10 lượt; dừng trước lượt kế tiếp khi số dư dưới ngưỡng hoặc khi không đọc được số dư.
Lý do dừng nằm ở `stopped_early` của file kết quả, gồm `balance_low` và `balance_unavailable`.

## 6. Lệnh và file kết quả

```
cd lab
npm run assistant -- --door mcp --job lookup-minh-phone --runs 1
npm run assistant -- --door function --job nam-assign-t12 --runs 1 --out ../rd/evaluation/results
npm run assistant -- --door mcp --job assign-t12-to-minh --runs 20 --fault m2
```

| Biến | Mặc định | Việc |
| --- | --- | --- |
| `LAB_MODEL_API_KEY` | không có, bắt buộc | Khoá gọi DeepSeek; không in, không ghi log |
| `LAB_TOOL_KEYS` | không có | JSON ánh xạ tên nhân vật sang khoá `lab_` của người đó, ví dụ `{"hoa":"lab_...","nam":"lab_..."}` |
| `LAB_TOOL_KEY` | không có | Một khoá `lab_` dùng cho mọi nhân vật khi không đặt `LAB_TOOL_KEYS` |
| `LAB_GATEWAY_URL` | `http://127.0.0.1:8790` | Địa chỉ cổng |
| `LAB_MODEL_NAME` | `deepseek-flash` | Đổi tên mô hình khi cần đối chiếu |

`--allow-peak` cho phép chạy trong giờ cao điểm; thiếu cờ này thì lệnh dừng trước khi đọc số dư.
`--fault m2` chạy lớp có lỗi của M2; xem mục 6.1.

Lệnh ghi hai file cạnh nhau trong `rd/evaluation/results/`, theo cách đặt tên của #101:

- `<YYYY-MM-DD>-assistant-<door>-<job>-<commit 7>.json`: bản tóm tắt nhỏ, đọc được trên GitHub.
- `<YYYY-MM-DD>-assistant-<door>-<job>-<plan>-<commit 7>.json`: bản của lớp có lỗi, có thêm tên kế hoạch `m2` trước commit.
- `<...>.samples.ndjson.gz`: từng lần chạy, nén gzip, có `sha256` trong bản tóm tắt để kiểm lại.

Tên việc đứng ở vị trí biến thể của mẫu tên #101, nên hai việc khác nhau không ghi đè nhau.
Tên kế hoạch lỗi đứng ngay trước commit, cùng chỗ với `--variant` của `npm run measure`.
Cùng một việc chạy hai lần trong ngày trên cùng một commit thì lần sau cần `--force`.

Bản tóm tắt ghi số lần chạy, số lần đúng, p50 và lần chậm nhất của phần mô hình và phần cổng, token vào trúng và không trúng bộ nhớ đệm, token ra, tiền, giờ cao điểm, số dư trước và sau, và lý do dừng sớm nếu có.
Mỗi mẫu ghi mã lượt, thời gian mô hình, thời gian cổng, số lời gọi, token vào trúng/không trúng, token ra, tiền, mã lý do, mã lỗi ngắn và tên công cụ đã gọi.
Mã lỗi chỉ là một trong các dạng ngắn như `model_http_402`, `model_timeout`, `model_network`, `door_error`; không bao giờ là câu thông báo hay khoá.
File không giữ câu trả lời hay nội dung công cụ, vì hai thứ đó có thể chứa tên, email hay số điện thoại.

Lệnh trả 0 sau khi ghi file khi có ít nhất một lần chạy ra kết quả, kể cả khi kết quả sai.
Lệnh trả 1 khi dừng sớm vì số dư, hoặc khi mọi lần chạy đều lỗi; file vẫn được giữ để điều tra.
Một file đã có thì lệnh dừng trước khi chạy; `--force` là cách duy nhất ghi đè.

### 6.1. Lớp có lỗi M2

`--fault m2` lặp lại hai lỗi mà `lab/measure/src/scenarios/m2-scenarios.ts` gây ở lớp tự động, nhưng đặt đúng vào lời gọi công cụ của trợ lý:

| Lượt | Lỗi | Cách gây |
| --- | --- | --- |
| 1-10 và 12-15 | Lỗi mạng | Gọi vào một cổng nhận request rồi đóng kết nối, sau đó gửi lại lời gọi thật |
| 11 | Hết giờ | Gọi vào một cổng im lặng, bỏ cuộc sau 2 giây, rồi gửi lại lời gọi thật |
| 16 trở đi | Không lỗi | Chạy sạch để so |

Lỗi chỉ gây ở lời gọi `propose_task_change` đầu tiên của mỗi lượt, vì đó là lời gọi sẽ thành lệnh ghi sau khi người dùng bấm Gửi.
Cổng thật chỉ nhận lời gọi gửi lại, nên mô hình chỉ thấy câu trả lời thật và không thấy một nửa kết quả.
Lượt không gọi `propose_task_change` được đếm là `point_missed`, giống M2 ở lớp tự động.

Bản tóm tắt của lớp có lỗi mang thêm khối `fault`:

| Khoá | Nghĩa |
| --- | --- |
| `network_runs`, `timeout_runs`, `clean_runs` | Số lượt theo từng loại |
| `point_missed` | Số lượt có kế hoạch gây lỗi nhưng mô hình không gọi `propose_task_change` |
| `network_errors`, `timeouts`, `retries` | Số lỗi mạng, số lần hết giờ và số lần gửi lại |
| `duplicate_proposals` | Số đề xuất thừa cho một task đã được soạn trong cùng lượt |
| `incomplete_proposals` | Số task của việc không được đề xuất nào phủ |
| `duplicate_writes`, `lost_commands` | Luôn 0: lớp này không bấm Gửi nên không tạo lệnh ghi nào |

Hai bộ đếm cuối là bộ đếm của lớp tự động, không phải của lớp có mô hình.
Lớp này chỉ soạn đề xuất, nên đề xuất trùng và đề xuất thiếu là hai bộ đếm thay thế có nghĩa.
Mọi lần chạy vẫn đọc số dư trước và sau, từ chối giờ cao điểm như lớp sạch.

## 7. Mô hình giả và phép thử

`src/shared/fake-model.ts` và `src/shared/balance.ts` có ba thứ cho phép thử:

- `createFakeModel({ steps })` trả lời theo kịch bản, không gọi mạng và không cần khoá.
- `createScriptedDoor(handler)` giả lập cửa nối, trả sẵn kết quả công cụ và ghi lại mã lượt của từng lời gọi.
- `createFakeBalance(readings)` trả số dư theo kịch bản, nên phép thử không gọi mạng.

`npm test` chạy bốn việc với mô hình giả, kiểm thêm các trường hợp sai: trợ lý bịa số điện thoại, trợ lý nói đã đổi task khi mới soạn đề xuất, và vòng lặp chạm số bước.
Phép thử cũng kiểm khoá không lọt vào lỗi, cách tính tiền giờ cao điểm, ngưỡng số dư 0,20 USD, việc từ chối giờ cao điểm, mã lỗi ngắn, và file kết quả đọc lại được.
`faults-test.ts` mở hai cổng lỗi thật trên loopback, kiểm cổng đóng kết nối và cổng im lặng, rồi kiểm lỗi mạng, hết giờ, số lần gửi lại và cách đếm đề xuất trùng hoặc thiếu.
Phép thử của lệnh chạy cả 20 lượt của kế hoạch M2 với mô hình giả, nên `npm test` không gọi mạng và không cần khoá.

## 8. Thêm một việc

Thêm một mục vào `ASSISTANT_JOBS` trong `src/shared/jobs.ts`, gồm `id`, `label`, `persona`, `userMessage` và `grade`.
Thêm một kịch bản mô hình giả và một handler cửa trong `src/shared/conversation-test.ts`.
Lệnh `npm run assistant` tự thấy việc mới; không sửa danh sách đăng ký nào.

## 9. Ranh giới dữ liệu

Chỉ dữ liệu giả lập của Lab đi tới nhà cung cấp mô hình.
Không có khoá thật, token hay dữ liệu khách hàng trong mã, log, phép thử hay file kết quả.
Khoá mô hình chỉ nằm trong `LAB_MODEL_API_KEY`, và mọi thông báo lỗi đều được che trước khi in.

**Kết luận:** phần dùng chung đã đủ để trợ lý A và B chỉ viết cửa nối của mình; lớp có lỗi M2 dùng lại đúng cửa nối đó và chỉ thêm một lớp bọc quanh lời gọi công cụ, nên số dòng của `src/shared/` là mốc M6 trong PR.
