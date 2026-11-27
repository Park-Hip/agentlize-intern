# Lab - AI Operations Connector

Bản thử của Lab: một cổng kiểm soát đứng giữa AI và ba hệ thống giả (danh bạ nhân viên, danh sách task và đơn nghỉ phép).
AI đọc dữ liệu qua cổng, cổng kiểm quyền từng lời gọi, và chỉ ghi sau khi người yêu cầu bấm Gửi, cộng thêm trưởng nhóm duyệt khi luật đòi.
Thổ Thần nối vào cổng qua cửa `/mcp`; người vận hành theo dõi và chỉnh luật trên trang điều khiển.
Danh sách task giả chạy được tám hồ sơ đích đặt tên sẵn, từ `standard` giữ nguyên hành vi cũ tới các đích khó tính dùng cho phép đo Q3.
Hệ thống đơn nghỉ phép giả có hai hồ sơ: `standard` nhớ khoá tạo đơn, và `no-dedup` quên khoá đó để tái hiện lỗi tạo hai đơn.

```
Thổ Thần / client MCP ──► cổng :8790 ──► danh bạ giả :8791
                            ▲   │
trang điều khiển :8793 ─────┘   ├──────► task giả :8792
                                └──────► đơn nghỉ phép giả :8794
```

Cả năm dịch vụ chỉ nghe ở `127.0.0.1`.
Chỉ ba hệ thống giả giữ dữ liệu nghiệp vụ, và chỉ cổng có khoá để gọi chúng.

## Chạy lần đầu

Cần Node 22 trở lên.

```
npm install
npm start
```

`npm start` dựng mã, mở năm dịch vụ theo đúng thứ tự, và dừng cả năm khi bấm Ctrl+C.
Ở cửa sổ thứ hai, cấp khoá cho các nhân vật rồi thử một lời gọi:

```
npm run seed-keys
curl -s -X POST http://127.0.0.1:8790/v1/tools/find_employee -H "Authorization: Bearer <khoá lab_ của chị Hoa>" -H "Content-Type: application/json" -d '{"name":"Minh"}'
```

`seed-keys` in cho mỗi nhân vật hai thứ: khoá `lab_` để gọi tool, và mật khẩu `trang_` để mở trang xác nhận và trang duyệt của cổng.
Mở `http://127.0.0.1:8793` để xem trang điều khiển; sân chơi ở đó có sẵn sáu kịch bản mẫu.

## Gói

| Gói | Làm gì | Chi tiết |
| --- | --- | --- |
| `gateway` | Cổng kiểm soát: hai cửa vào, khoá, bộ luật quyền, đề xuất, duyệt, ghi, bảng vết | [gateway/README.md](gateway/README.md) |
| `console` | Trang điều khiển cho người vận hành | [console/README.md](console/README.md) |
| `fake-directory` | Danh bạ giả 20 nhân viên | [fake-directory/README.md](fake-directory/README.md) |
| `fake-tasks` | Danh sách task giả 100 task | [fake-tasks/README.md](fake-tasks/README.md) |
| `fake-leave` | Hệ thống đơn nghỉ phép giả: tạo đơn, chờ quản lý duyệt, tự chuyển trạng thái | [fake-leave/README.md](fake-leave/README.md) |
| `shared` | Mã dùng chung: cổng mạng, mã lý do, sáu nhân vật, kiểm và che khoá dịch vụ | `shared/src/` |
| `tests` | Phép thử nhiều dịch vụ: phép thử khói, nghiệm thu đọc và ghi, client giả Thổ Thần | `tests/src/` |
| `measure` | Lệnh đo chạy lại được: dựng cụm riêng, ghi mẫu thô và tóm tắt vào `rd/evaluation/results/` | [measure/README.md](measure/README.md) |
| `assistants` | Hai trợ lý của Q2: bộ việc, câu lệnh hệ thống, vòng hội thoại, mô hình giả và lệnh chạy | [assistants/README.md](assistants/README.md) |
| `scripts` | Lệnh `start`, `tunnel` và `sr` | `scripts/` |

Thư viện nằm ở `package.json` gốc, để mọi gói dùng chung một lần cài và một phiên bản.

## Lệnh

| Lệnh | Làm gì |
| --- | --- |
| `npm start` | Mở năm dịch vụ |
| `npm run lint` | Kiểm kiểu toàn workspace |
| `npm test` | Dựng mã rồi chạy mọi `*-test.js` |
| `npm test -w <gói>` | Chỉ chạy phép thử của một gói, ví dụ `npm test -w console` |
| `npm test -w gateway -- --test-name-pattern policy` | Chỉ chạy các phép thử có tên khớp |
| `npm run seed-keys [-- --rotate]` | Cấp khoá và mật khẩu trang cho sáu nhân vật và khách; `--rotate` thu hồi bộ cũ trước |
| `npm run keys -- <lệnh con>` | Quản lý khoá từng người, xem [khoá và mật khẩu trang](gateway/README.md#khoá-và-mật-khẩu-trang) |
| `npm run trace -- --task T-12` | Đọc bảng vết, xem [bảng vết](gateway/README.md#bảng-vết) |
| `npm run sr` | Dựng mã, chạy toàn bộ phép thử và in bảng tám yêu cầu SR1-SR8 |
| `npm run tunnel` | Mở cổng ra Internet cho một phiên nghiệm thu, xem mục dưới |

## Báo cáo tám yêu cầu

`npm run sr` dựng mã, chạy toàn bộ phép thử rồi in một bảng cho tám yêu cầu SR1-SR8.
Mỗi dòng ghi số phép thử, số đạt và số hỏng của yêu cầu đó.
Danh sách mẫu tên phép thử nằm trong [scripts/sr-map.json](scripts/sr-map.json), và `npm test` kiểm rằng mọi mẫu khớp ít nhất một tên phép thử trong mã nguồn.
Lệnh trả mã lỗi khi một yêu cầu không có phép thử nào, khi một phép thử hỏng, hoặc khi cả bộ phép thử có lỗi.

## Biến môi trường

| Biến | Mặc định | Việc |
| --- | --- | --- |
| `LAB_GATEWAY_PORT` | 8790 | Cổng mạng của cổng kiểm soát |
| `LAB_DIRECTORY_PORT` | 8791 | Cổng mạng của danh bạ giả |
| `LAB_TASKS_PORT` | 8792 | Cổng mạng của task giả |
| `LAB_TASKS_ASSIGNEE_MODE` | `patch` | Cách cổng đổi người phụ trách: `patch` sửa thẳng như cũ, `members` thêm người mới rồi bỏ người cũ bằng hai lời gọi; `npm start` và lệnh đo tự đặt `members` khi chạy hồ sơ `lark-task` |
| `LAB_LEAVE_PORT` | 8794 | Cổng mạng của hệ thống đơn nghỉ phép giả |
| `LAB_LEAVE_PROFILE` | `standard` | Hồ sơ đơn nghỉ phép: `standard` nhớ khoá tạo đơn, `no-dedup` quên khoá đó |
| `LAB_LEAVE_DECISION_DELAY_MS` | 5000 | Số mili giây quản lý nguồn chờ trước khi tự duyệt hoặc từ chối |
| `LAB_LEAVE_DECISION` | `approved` | Quyết định của quản lý nguồn sau khoảng chờ: `approved` hoặc `rejected` |
| `LAB_CONSOLE_PORT` | 8793 | Cổng mạng của trang điều khiển |
| `LAB_DATA_DIR` | `lab/.data` | Thư mục dữ liệu chạy, bị bỏ qua trong git |
| `LAB_RULES_PATH` | `<LAB_DATA_DIR>/rules.json` | File luật cổng đang áp, xem [file luật](gateway/README.md#file-luật) |
| `LAB_SERVICE_KEY` | `npm start` sinh khi chưa đặt | Khoá cổng dùng để gọi ba hệ thống giả; không bao giờ in ra |
| `LAB_PUBLIC_BASE_URL` | `http://127.0.0.1:<cổng>` | Địa chỉ gốc trong link xác nhận |
| `LAB_TEST_HOOKS` | tắt | `1` mở các đường `/admin/*` của ba hệ thống giả cho phép thử; `npm start` không bật |

Dữ liệu trong `lab/.data` là giả lập nên không có bộ chuyển đổi.
Khi cổng dừng lúc khởi động và nhắc cơ sở dữ liệu kiểu cũ, xoá thư mục đó rồi chạy lại.

## Đường hầm cho một phiên nghiệm thu

Thổ Thần web và desktop chỉ gọi được một địa chỉ HTTPS công khai ([ADR-0004](../docs/adr/adr-0004-shared-gateway-over-https.md#3-quyết-định)).
`npm run tunnel` mở một đường hầm Cloudflare tới cổng, đợi có địa chỉ `https://<tên>.trycloudflare.com`, rồi mới mở cổng và ba hệ thống giả với địa chỉ đó.
Nhờ vậy link xác nhận dùng địa chỉ công khai, và người ở máy khác vẫn mở được.

- Chỉ cổng đi qua đường hầm; ba hệ thống giả thì không, và trang điều khiển không được mở ([ADR-0006](../docs/adr/adr-0006-operator-console.md#31-vị-trí-và-ranh-giới)).
- Lệnh chỉ báo sẵn sàng khi gọi thử `/mcp` qua địa chỉ công khai mà không có khoá và nhận 401.
- Đường hầm tự tắt sau 45 phút, hoặc khi bấm Ctrl+C.
- Lệnh không nhận và không in khoá: lấy khoá bằng `npm run seed-keys` ở cửa sổ khác rồi dán vào ô API Key của skill.
- Đã đặt sẵn `LAB_PUBLIC_BASE_URL` thì lệnh giữ giá trị đó, hợp với đường hầm có tên riêng.

| Biến | Việc |
| --- | --- |
| `LAB_CLOUDFLARED_PATH` | Đường dẫn tới `cloudflared`; mặc định trên Windows là `C:\Program Files (x86)\cloudflared\cloudflared.exe`, nơi khác là `cloudflared` trong `PATH` |
| `LAB_TUNNEL_MINUTES` | Rút ngắn giới hạn, từ 1 tới 45 phút |

Sau phiên, tắt đường hầm, trả skill về như cũ và chạy `npm run seed-keys -- --rotate` để thu hồi khoá đã đi qua Internet.
Kịch bản từng bước nằm ở [nghiệm thu mốc 1](../archive/baseline/milestone-1-tho-than.md).
