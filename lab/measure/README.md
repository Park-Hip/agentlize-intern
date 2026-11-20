# Lệnh đo

Gói `@lab/measure` chạy một phép đo, rồi ghi kết quả thành hai file: một bản tóm tắt nhỏ và một file mẫu nén, để báo cáo đánh giá trỏ tới.
Mỗi phép đo khai nó cần gì: cụm dịch vụ chung, hay chỉ tên đích ghi.
Cụm dịch vụ chung gồm cổng, danh bạ giả và danh sách task giả trên cổng mạng trống, dùng thư mục dữ liệu tạm, và không đọc `lab/.data`.
Lệnh đo chỉ dựng cụm đó khi phép đo khai cần; cụm bị dừng và thư mục tạm bị xoá khi phép đo xong.

## Chạy

```sh
cd lab
npm run measure -- m1-gateway
npm run measure -- q1-outbox --target gateway --runs 2
npm run measure -- q1-outbox --target temporal --variant server-crash --runs 1
npm run measure -- m1-gateway --runs 100 --out ../../rd/evaluation/results
```

- `--target <đích>` chọn đường ghi cho phép đo có dùng đích; mặc định `gateway`.
  Tên lạ làm lệnh dừng trước khi dựng gì và liệt kê các đích hợp lệ.
  Phép đo không dùng đích mà nhận `--target` thì báo lỗi rõ ràng.
- `--variant <tên>` gắn tên cho một lượt đo chạy cấu hình khác, ví dụ `server-crash`.
  Tên viết thường kebab-case, vào tên file kết quả ngay sau tên đích, và vào trường `variant` của bản tóm tắt.
  Đích có thể đọc biến thể: `temporal` nhận `server-crash` để bước sập tắt cả dev server, không chỉ worker.
- `--runs N` là số lần đo cho mỗi cặp tool và cửa vào; mặc định 100.
- `--out <thư mục>` là nơi ghi file kết quả; mặc định `rd/evaluation/results` ở gốc repo.
  Đường dẫn tương đối tính từ thư mục đang đứng.
- `--force` là cách duy nhất để ghi đè file kết quả đã có.
  Không có nó, lượt đo dừng trước khi chạy khi file đã tồn tại, nên hai lượt không bao giờ ghi đè nhau.
- Chạy không có tên phép đo hoặc với `--help` để xem danh sách phép đo và đích đang có.

Sau `npm install`, `npm run measure` dựng mã trước khi chạy, nên một lệnh là đủ.

## File kết quả

Mỗi lần đo ghi hai file cạnh nhau trong thư mục kết quả, cùng tiền tố `<YYYY-MM-DD>-<phép đo>-<đích>-<commit 7 ký tự>`.
Tên đích chỉ có khi phép đo dùng đích; tên biến thể từ `--variant` đứng ngay sau tên đích, hoặc sau tên phép đo khi phép đo không dùng đích.
Cùng một phép đo trên hai đích, hay hai biến thể trên cùng một đích, cho hai tên file khác nhau.
Lượt đo không bao giờ ghi đè: khi file đã tồn tại, lệnh dừng trước khi chạy và chỉ chạy lại khi có `--force`.

| File | Nội dung |
| --- | --- |
| `<tiền tố>.json` | File tóm tắt nhỏ, thụt lề, đọc được trên GitHub. Giữ mọi trường của kết quả, trừ `samples`. |
| `<tiền tố>.samples.ndjson.gz` | Toàn bộ mẫu thô, nén gzip, mỗi dòng một mẫu JSON không thụt lề (NDJSON), đúng thứ tự đã đo. |

Đây là ngoại lệ về tên file trong `AGENTS.md` mục 8, vì ngày đo và commit là một phần của bằng chứng.
Hai file được commit cùng thay đổi mà phép đo đo, để mọi con số trong báo cáo có một đường dẫn cụ thể.

| Khoá | Nội dung |
| --- | --- |
| `schema` | Phiên bản định dạng, hiện là `4`; `readMeasurement` vẫn đọc file schema `2` và `3` đã commit |
| `scenario` | Tên và mô tả phép đo |
| `generated_at` | Thời điểm ghi file, theo ISO 8601 |
| `command` | Lệnh đo có thể chạy lại |
| `runs` | Số lần đo mỗi cặp tool và cửa vào |
| `elapsed_seconds` | Thời gian chạy phép đo, không tính bước dựng mã |
| `write_target` | Đích ghi của lần đo, `null` khi phép đo chỉ dùng cụm chung; không có trong file schema `2` |
| `variant` | Tên biến thể từ `--variant`, `null` khi lượt đo không có; không có trong file schema `3` và cũ hơn |
| `parameters` | Cửa vào, tool, nhân vật, tham số gọi, cách đo và số vòng khởi động |
| `environment` | Commit, cờ có thay đổi chưa commit, hệ điều hành, CPU, RAM, bản Node, múi giờ |
| `samples_file` | Trỏ tới file mẫu: `name` là tên file cạnh bản tóm tắt, `count` là số mẫu, `sha256` là mã băm của file nén |
| `summary` | p50, p95, lớn nhất, nhỏ nhất, trung bình và số mẫu, theo tổng, theo cửa vào, theo tool, theo cặp cửa vào và tool |
| `targets` | Mục tiêu ban đầu kèm số quan sát và cờ đạt; `enforced: false` nghĩa là chỉ báo |
| `safety` | Năm bộ đếm an toàn, cờ đạt, và ghi chú |
| `notes` | Điều cần biết khi đọc số, ví dụ đề xuất trả `NEEDS_APPROVAL` sau ngưỡng hàng loạt |

Mỗi dòng trong file mẫu là một lần gọi: cửa vào, tool, số thứ tự, thời gian client, thời gian cổng, mã vết, trạng thái, mã lý do.
`sha256` là mã băm SHA-256 của đúng các byte trong file nén.
Ai tải cả hai file về cũng kiểm được file mẫu không bị sửa: băm file nén rồi so với `sha256` trong bản tóm tắt.

Gói `@lab/measure` xuất hàm `readMeasurement` để mở lại một kết quả:

```ts
import { readMeasurement } from '@lab/measure';

const { summary, samples } = await readMeasurement('rd/evaluation/results/2026-11-20-m1-gateway-f4dbfe7.json');
```

Hàm kiểm `sha256`, kiểm số mẫu, rồi trả bản tóm tắt và mảng mẫu đúng thứ tự đã đo.
Phép thử khói dùng hàm này để tính lại p50 và p95 từ mẫu và so với bản tóm tắt.

`client` là thời gian đo quanh một lời gọi ở phía client, gồm cả mở phiên giả lập của Thổ Thần ở cửa `tho-than-host`.
`gateway` lấy đúng cột `duration_ms` của bảng vết, nên phép đo không sửa gì trong phần vết.
Mẫu thô chỉ giữ số đo và mã vết.
Câu trả lời của tool không được ghi vào file, vì nó có thể chứa tên, email hay số điện thoại.
Khoá tool và khoá dịch vụ cũng không bao giờ được ghi vào file.

p50 và p95 dùng hạng gần nhất (nearest rank): sắp xếp mẫu tăng dần, p50 là mẫu thứ 50 trong 100 mẫu, p95 là mẫu thứ 95.
Nhờ vậy ai đọc file mẫu cũng tính lại được đúng con số trong bản tóm tắt.

Thời gian cổng được làm tròn về mili giây trong bảng vết, nên p50 có thể là 0 ms.
Con số đó là độ phân giải của bằng chứng hiện có, không phải thời gian cổng bằng không.

## Năm bộ đếm an toàn

Mỗi file kết quả mang đủ năm bộ đếm của spec mục 7.5.
Một bộ đếm có `applicable: false` và `value: null` khi phép đo không chạm tới hành vi đó.
Đó là một lời khai rõ ràng, không phải số 0 đã kiểm.

| Mã | Tên | Đo thế nào |
| --- | --- | --- |
| `duplicate_writes` | Ghi trùng | Đếm lệnh ghi bị gửi nhiều lần |
| `lost_commands` | Lệnh mất | Đếm lệnh ghi không tới hệ thống đích |
| `unauthorized_writes` | Ghi vượt quyền | Đếm lần ghi không có bước xác nhận hoặc không được phép |
| `out_of_scope_fields` | Trường ngoài quyền | Quét câu trả lời trả về cho vai không được xem trường đó |
| `personal_data_in_trace` | Dữ liệu cá nhân trong vết | Quét toàn bộ bảng vết cho tên, email, số điện thoại, địa chỉ và khoá |

`m1-gateway` chỉ đọc dữ liệu và soạn đề xuất, không bấm Gửi.
Vì vậy hai bộ đếm `duplicate_writes` và `lost_commands` không áp dụng, còn ba bộ đếm kia bằng 0 và có cách kiểm ghi trong `detail`.
Riêng `unauthorized_writes` kiểm bảng `write_commands`: bảng rỗng nghĩa là không lệnh ghi nào vượt qua bước xác nhận.

Nếu một bộ đếm áp dụng mà khác 0, lệnh đo vẫn ghi file kết quả rồi thoát với mã 1.
Bằng chứng của lần đo hỏng được giữ lại, và lỗi không bị giấu sau một lần chạy lại.

## Thêm một phép đo

Mỗi phép đo là một file trong `src/scenarios/`.
Lệnh đo tự tìm mọi file `.js` đã dựng trong thư mục đó, nên thêm phép đo không sửa file đăng ký nào.

File phải xuất mặc định một đối tượng có `name`, `description`, `needs` và `run(context)`.
Tên phải trùng tên file, viết thường và nối bằng dấu gạch ngang.
`needs` khai phép đo cần gì: `stack` dựng cụm dịch vụ chung, `target` nhận tên đích từ `--target` trong `context.target`.

```ts
import { performance } from 'node:perf_hooks';
import { safetyCounter } from '../safety.js';
import type { MeasureContext, Scenario, ScenarioResult } from '../types.js';

const scenario: Scenario = {
  name: 'my-measurement',
  description: 'Một câu nói phép đo trả lời câu hỏi gì.',
  needs: { stack: true, target: false },

  async run(context: MeasureContext): Promise<ScenarioResult> {
    const startedAt = performance.now();
    const answer = await fetch(`${context.services.gateway}/health`);
    await answer.text();
    const clientMs = performance.now() - startedAt;

    return {
      samples: [
        {
          door: 'health',
          tool: 'gateway-health',
          run: 1,
          client_ms: clientMs,
          gateway_duration_ms: null,
          trace_id: null,
          status: answer.status,
          reason_code: null,
        },
      ],
      safety: [
        safetyCounter('duplicate_writes', false, null, 'Phép đo không tạo lệnh ghi.'),
        safetyCounter('lost_commands', false, null, 'Phép đo không tạo lệnh ghi.'),
        safetyCounter('unauthorized_writes', false, null, 'Phép đo không tạo lệnh ghi.'),
        safetyCounter('out_of_scope_fields', false, null, 'Phép đo không đọc bản ghi nghiệp vụ.'),
        safetyCounter('personal_data_in_trace', false, null, 'Phép đo không đọc bảng vết.'),
      ],
      parameters: { sample: 'health endpoint' },
    };
  },
};

export default scenario;
```

`context` cung cấp:

| Thành phần | Việc |
| --- | --- |
| `runs` | Số lần đo mỗi nhóm mà người chạy yêu cầu |
| `target` | Tên đích từ `--target`, hoặc `null` khi phép đo khai `needs.target` là `false` |
| `services` | Địa chỉ `gateway`, `directory` và `tasks` của cụm riêng; chỉ có khi `needs.stack` là `true` |
| `dataDir` | Thư mục dữ liệu tạm của cụm; chỉ có khi `needs.stack` là `true` |
| `serviceKey` | Khoá dịch vụ ngẫu nhiên; không ghi vào kết quả; chỉ có khi `needs.stack` là `true` |
| `issueKey({ employeeId })` | Cấp khoá tool giả sau khi cổng đã tạo cơ sở dữ liệu; chỉ có khi `needs.stack` là `true` |
| `observe()` | Đọc bảng vết và đếm lệnh ghi mà không sửa gì; chỉ có khi `needs.stack` là `true` |
| `log(line)` | In tiến độ ra terminal |

Đọc một thành phần của cụm khi `needs.stack` là `false` sẽ dừng lần chạy với lỗi nói rõ phép đo chưa khai cần cụm.

`ScenarioResult` gồm `samples`, đủ năm `safety`, và tuỳ chọn `parameters`, `targets`, `notes`.
Mẫu phải có `client_ms` là số không âm.
Mỗi cặp `door`, `tool`, `run` phải xuất hiện đúng một lần, để không đếm trùng.
`gateway_duration_ms` để `null` nếu phép đo không đọc vết; bộ tóm tắt sẽ bỏ qua giá trị đó.

`targets` dùng `scope` là `overall`, `door`, `tool` hoặc `door_tool`.
Lệnh đo so p95 của chỉ số đó với ngưỡng và ghi `met`, nhưng chỉ làm lệnh thất bại khi `enforced` là `true`.
Mục tiêu đầu tiên đặt `enforced: false`.

## Phép đo `m1-gateway`

`m1-gateway` là chỉ số M1 của spec: thời gian cổng tự xử lý và thời gian phía client.
Phép đo gọi sáu tool qua ba cửa vào `http`, `mcp-http` và `tho-than-host`, mỗi cặp tool và cửa đúng `--runs` lần.
Thứ tự ba cửa xoay theo từng vòng, để không cửa nào luôn chạy ngay sau một lệnh ghi của đề xuất.
Hai vòng khởi động mỗi nhóm không được tính vào mẫu.
`find_employee`, `get_task`, `list_tasks` và `get_request_status` đọc bằng nhân vật chị Hoa.
`propose_task_change` soạn bằng chị Hoa, `propose_employee_change` soạn bằng chị Nhung vì chỉ vai nhân sự mới có quyền đổi email.
Không có đề xuất nào được bấm Gửi, nên không có lệnh ghi nào được tạo.

Sau khi tổng số mục cùng việc trong 60 phút chạm ngưỡng hàng loạt, `propose_task_change` trả `NEEDS_APPROVAL`.
Đó vẫn là câu trả lời thành công: đề xuất đã được tạo và chỉ chờ duyệt.
`propose_employee_change` không khai ngưỡng hàng loạt cho hành động email, nên trả `null`.
Mẫu đó được tính bình thường và mã lý do được ghi lại trong từng mẫu.

Mục tiêu `m1-gateway-p95-50ms` báo p95 thời gian cổng trên toàn bộ mẫu.
Con số này chỉ để báo ở lần đo đầu, không làm lệnh thất bại.

## Phép đo theo đích

`q1-outbox` và `m2-scenarios` khai `needs: { stack: false, target: true }`.
Mỗi lần chạy tự dựng một đích mới, nên lệnh đo không dựng thêm cụm chung.
Hai phép đo đọc tên đích từ `context.target`; mặc định là `gateway`, và tên đó được ghi vào `write_target` của file kết quả.
`m1-gateway` và `m4-load` khai `needs: { stack: true, target: false }`, nên chúng nhận cụm chung và từ chối `--target`.

Đích được dựng giữa lúc chạy nên đọc biến thể qua một bộ nhớ trong tiến trình lệnh đo, không qua `context`.
Riêng `temporal` dùng biến thể để chọn cách sập: mặc định tắt worker, còn `server-crash` tắt cả dev server; biến thể khác không đổi cách sập.
Biến thể vẫn vào tên file và bản tóm tắt ở mọi đích, kể cả khi đích không đọc nó.
