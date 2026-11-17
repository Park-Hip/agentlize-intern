# Lab - AI Operations Connector

Khung mã của bản thử: ba dịch vụ chạy trên máy, một lệnh khởi động và một lệnh chạy phép thử.
Hiện chỉ danh bạ giả có logic nghiệp vụ; các gói còn lại giữ chỗ cho phần dựng ở các mốc sau.

## Gói

| Gói | Vai trò |
| --- | --- |
| `shared` | Cổng mạng, mã lý do, câu từ chối, kiểu danh mục tool và phản hồi tool, sáu nhân vật cố định, kiểm khoá dịch vụ |
| `gateway` | Cổng kiểm soát, hiện chỉ có `GET /health` |
| `mcp-adapter` | Chỗ đặt chương trình nối stdio, chưa có tool |
| `fake-directory` | Danh bạ giả 20 nhân viên, xem mục Danh bạ giả |
| `fake-tasks` | Danh sách task giả, hiện chỉ có `GET /health` |
| `tests` | Phép thử `node:test`, gồm phép thử khói ba dịch vụ |

Thư viện dùng chung nằm ở `package.json` gốc của workspace, để cả ba dịch vụ chạy trên một lần cài và một phiên bản.

## Lệnh

```
npm install
npm run lint
npm test
npm start
```

`npm start` dựng mã, sinh khoá dịch vụ nếu chưa có `LAB_SERVICE_KEY`, chờ hai hệ thống giả trả `/health` rồi mới mở cổng.
Khoá dịch vụ chỉ nằm trong biến môi trường và không được in ra.

## Cổng và biến môi trường

| Dịch vụ | Cổng mặc định | Biến ghi đè |
| --- | --- | --- |
| Cổng | 8790 | `LAB_GATEWAY_PORT` |
| Danh bạ giả | 8791 | `LAB_DIRECTORY_PORT` |
| Task giả | 8792 | `LAB_TASKS_PORT` |

Mọi dịch vụ chỉ nghe ở `127.0.0.1`.
`LAB_DATA_DIR` đổi thư mục dữ liệu, mặc định là `lab/.data` và bị bỏ qua trong git.
`LAB_SERVICE_KEY` là khoá cổng dùng khi gọi hai hệ thống giả; `npm start` sinh khoá mới nếu biến này chưa có.
`LAB_TEST_HOOKS=1` bật các đường `/admin/*` của danh bạ giả; phép thử bật biến này, `npm start` không bật.

## Danh bạ giả

Danh bạ không kiểm quyền.
Nó chỉ trả lời ai mang khoá dịch vụ, nên chỉ cổng được gọi nó.
Mọi đường dẫn, kể cả `/health`, trả 401 khi thiếu hoặc sai `Authorization: Bearer <LAB_SERVICE_KEY>`.

Dữ liệu nạp cố định, không ngẫu nhiên: 20 người ở hai phòng Vận hành và Kinh doanh, mỗi phòng một trưởng nhóm.
Mỗi người có mã `NV-01` đến `NV-20`, họ tên, phòng, vai (`intern`, `staff`, `lead`, `hr`), email `@lab.example`, số điện thoại cá nhân giả và địa chỉ nhà giả.
Sáu nhân vật có mã cố định trong `shared/src/personas.ts`: anh Quang `NV-01`, chị Nhung `NV-02`, chị Hoa `NV-03`, Nam `NV-04`, chị Lan `NV-05`, anh Minh `NV-06`.
Dữ liệu lưu ở `LAB_DATA_DIR/directory.sqlite`, mỗi nhân viên là một tài liệu JSON cùng cột mã và số phiên bản, nên thêm trường không đổi bảng.

| Đường | Làm gì |
| --- | --- |
| `GET /employees?name=&department=` | Lọc theo đúng hai trường này; tham số khác trả 400. Tên khớp theo từ nguyên vẹn, không phân biệt hoa thường và dấu; phòng phải khớp cả cụm |
| `GET /employees/<mã>` | Một nhân viên, 404 nếu không có mã |
| `PATCH /employees/<mã>` | Thân `{"expected_version": 1, "changes": {"work_email": "..."}}`; trả 409 `version_conflict` khi số phiên bản đã đổi |
| `POST /admin/reset` | Nạp lại dữ liệu gốc, mọi phiên bản về 1 |
| `POST /admin/add-field` | Thân `{"field": "badge", "value": "x"}`; thêm một trường cho mọi nhân viên và tăng số phiên bản |

Hai đường `/admin/*` chỉ chạy khi `LAB_TEST_HOOKS=1`; khi biến tắt chúng trả 404.
Đổi email và hạ vai trong phép thử đi qua `PATCH` bình thường.

## Kiểm chứng

```
npm test
npm start
curl http://127.0.0.1:8790/health
```

`npm test` dựng mã rồi chạy mọi tệp `*-test.js` trong `*/dist/`.
`npm test -w fake-directory` chỉ chạy phép thử của danh bạ giả.
Phép thử khói mở ba dịch vụ trên cổng tạm, gọi `/health` của từng dịch vụ và kiểm khoá dịch vụ không xuất hiện trong log.
