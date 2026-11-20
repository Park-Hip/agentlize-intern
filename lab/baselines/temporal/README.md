# Bản đối chứng Temporal cho hàng đợi ghi

Gói này dựng lại đúng một phần của cổng: hàng đợi lệnh ghi 30 task.
Cổng vẫn giữ đề xuất, bước duyệt, bộ luật quyền và bảng vết.
Phần chạy nền tự viết trong `lab/gateway/src/writes/outbox.ts` được thay bằng một workflow Temporal, mỗi task một activity.
Gói nằm ngoài workspace của `lab/`, nên `npm start` và `npm test` của lab không chạy nó.

## Đọc nhanh

- Đây là bản đối chứng cho Q1 (sập giữa chừng): cùng 30 task, cùng bộ tiếp hợp task giả, cùng mã chống ghi trùng, nhưng Temporal giữ tiến độ thay cho vòng chạy nền tự viết.
- Cổng vẫn là nơi soạn đề xuất, bấm Gửi, duyệt và ghi vết; chỉ phần gửi lệnh ghi đổi sang workflow.
- Mỗi lần đo dựng một Temporal dev server riêng trên cổng mạng trống và thư mục dữ liệu tạm, rồi xoá khi xong.
- Cách chạy lại: `npm run measure -- q1-outbox --target temporal --runs 100` và `npm run measure -- m5-complexity --target temporal`.
- Kết quả và kết luận Q1 nằm trong `rd/evaluation/results/` và `rd/findings.md`.

## Yêu cầu

Cần Node 22 trở lên.
Cần lab đã cài và dựng mã, vì host và activity dùng lại mã đã dựng của cổng:

```
cd lab
npm install
npm run build
```

Rồi cài gói này:

```
cd lab/baselines/temporal
npm install
```

## Cài Temporal CLI

Có hai cách, không cài vào hệ thống.

**Cách 1: đã có `temporal` trên PATH.**
Kiểm bằng `temporal --version`.
Lệnh đo tự tìm `temporal` trên PATH trước.

**Cách 2: tải bản phát hành chính thức vào `scratch/temporal/`.**
`scratch/` đã bị bỏ qua trong git, nên không có file nhị phân nào vào commit.
Ví dụ trên Windows, PowerShell:

```
New-Item -ItemType Directory -Force scratch/temporal
Invoke-WebRequest `
  -Uri https://github.com/temporalio/cli/releases/download/v1.10.1/temporal_cli_1.10.1_windows_amd64.zip `
  -OutFile scratch/temporal/temporal_cli_1.10.1_windows_amd64.zip
Expand-Archive scratch/temporal/temporal_cli_1.10.1_windows_amd64.zip -DestinationPath scratch/temporal -Force
scratch/temporal/temporal.exe --version
```

Trên Linux hoặc macOS, tải đúng gói `linux_amd64`, `darwin_amd64` hoặc `darwin_arm64`, rồi giải nén vào `scratch/temporal/`.
Lệnh đo tìm `scratch/temporal/temporal.exe` trên Windows và `scratch/temporal/temporal` trên hệ khác.
Đặt biến `LAB_TEMPORAL_CLI` khi file nằm ở chỗ khác.

Không cần chạy `temporal server start-dev` bằng tay cho lệnh đo: đích `temporal` tự mở dev server với `--db-filename` trong thư mục tạm.

## Chạy tay

Ba tiến trình, mở ở ba cửa sổ, sau khi đã cài:

```
cd lab/baselines/temporal
temporal server start-dev --headless --port 7233 --db-filename .data/temporal.db
```

```
cd lab/baselines/temporal
npm run host
```

```
cd lab/baselines/temporal
npm run worker
```

`host` mở cổng thật ở cổng mạng lấy từ biến môi trường của lab, rồi mở một cổng điều khiển nội bộ cho worker.
Worker gọi cổng điều khiển đó, mỗi lần một lệnh ghi.
Biến bắt buộc nằm trong `src/host.js` và `src/worker.js`; lệnh đo tự đặt hết.

## Chạy phép đo

Từ `lab/`, sau khi đã cài gói này:

```
npm run measure -- q1-outbox --target temporal --runs 100
npm run measure -- m5-complexity --target temporal
```

Phép đo thứ nhất chạy ba bước sập, mỗi bước 100 lần.
Phép đo thứ hai đếm phần chạy tiếp, số dịch vụ, số file cấu hình, số bước cài và thử đổi một ô luật.
Cùng phép đo thứ nhất với `--variant server-crash --runs 1` tắt cả dev server trong bước sập, mỗi bước một lần; xem mục Tắt ngang.

## Tắt ngang

`crash()` mặc định tắt worker bằng `SIGKILL`, không đóng gì.
Workflow vẫn nằm trên Temporal dev server, nên worker khởi động lại thì workflow chạy tiếp từ đúng activity đang dở.
Chạy lệnh đo với `--variant server-crash` để tắt cả worker lẫn dev server trong một lượt; dev server mở lại trên cùng `--db-filename` nên workflow còn nguyên.

## Thành phần

| Thành phần | Việc | Bắt buộc cho đường ghi |
| --- | --- | --- |
| `temporal` | Temporal dev server giữ workflow và vị trí từng bước | Có |
| `worker` | Chạy activity, mỗi activity một lệnh ghi | Có |
| `gateway` | Đề xuất, bấm Gửi, duyệt, bảng lệnh ghi và bảng vết | Có |
| `directory` | Danh bạ giả, nơi cổng đọc vai và phòng của người yêu cầu | Có |
| `tasks` | Danh sách task giả, nơi lệnh ghi đáp xuống | Có |

## File

| File | Việc |
| --- | --- |
| `src/workflows.js` | Workflow `writeProposal`: đi qua danh sách lệnh theo vị trí, mỗi lệnh một activity |
| `src/worker.js` | Worker Temporal và activity `runCommand`, gọi host qua HTTP nội bộ |
| `src/host.js` | Mở cổng với `startGateway({ executor })`, nối đề xuất đã duyệt sang workflow, mở cổng điều khiển |
| `src/command-runner.js` | Chạy một lệnh ghi: cùng bảng `write_commands`, cùng mã chống ghi trùng, cùng bộ tiếp hợp task |

## Khác gì bản tự viết

- Bản tự viết giữ tiến độ trong bảng `write_commands` và một vòng `setInterval` trong tiến trình cổng.
- Bản Temporal giữ tiến độ trong workflow; bảng `write_commands` vẫn là nguồn sự thật cho trạng thái từng lệnh và cho `get_request_status`.
- Cả hai dùng cùng mã chống ghi trùng `<mã đề xuất>:<vị trí>` và cùng lớp `TasksAdapter`, nên danh sách task giả chỉ ghi một lần cho mỗi key.
- Bản Temporal thêm hai tiến trình (dev server và worker) và một cú pháp workflow; đổi lại, việc chạy tiếp sau khi worker chết không cần vòng quét lại.

## Người dựng

Một coding agent dựng gói này dưới sự giám sát của intern.
Intern đã từng dùng Temporal trước đây hay chưa là câu hỏi để intern trả lời khi review PR.

## Kết quả

- [Q1 Temporal](../../../rd/evaluation/results/2026-11-20-q1-outbox-temporal-87d50f9.json): 300/300 lần đúng kết quả cuối, 0 ghi trùng, 0 lệnh mất; bước 1 chia 100 lần cho ba thời điểm tắt, mỗi thời điểm đều đạt.
- [Q1 Temporal, lượt tắt cả máy chủ](../../../rd/evaluation/results/2026-11-20-q1-outbox-temporal-server-crash-aea48ad.json): 3/3 lần đúng kết quả cuối, 0 ghi trùng, 0 lệnh mất, chạy bằng `npm run measure -- q1-outbox --target temporal --variant server-crash --runs 1`.
- [M5 Temporal](../../../rd/evaluation/results/2026-11-20-m5-complexity-temporal-87d50f9.json): 4 file, 384 dòng vật lý và 330 dòng mã; 5 dịch vụ cần cho đường ghi, 4 bước cài, 2 bước sau khi sập, đổi một ô luật vẫn 1 chỗ.
- [M5 bản tự viết](../../../rd/evaluation/results/2026-11-20-m5-complexity-gateway-62e309e.json): 2 file, 587 dòng vật lý và 476 dòng mã; 3 dịch vụ cần cho đường ghi, 4 bước cài, 1 bước sau khi sập, đổi một ô luật 1 chỗ.

Lượt tắt cả máy chủ trước đây không commit được vì trùng tên file với lượt 100 lần ở trên.
Tên file kết quả nay có thêm tên đích và tên biến thể, nên hai lượt không còn có thể ghi đè nhau.

Kết luận Q1 nằm trong `rd/design/mvp-spec.md` mục 2.1 và `rd/findings.md`.
