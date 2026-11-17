# Lab - AI Operations Connector

Khung mã của bản thử: ba dịch vụ chạy trên máy, một lệnh khởi động và một lệnh chạy phép thử.
Chưa có logic nghiệp vụ nào; các gói giữ chỗ cho phần dựng ở các mốc sau.

## Gói

| Gói | Vai trò |
| --- | --- |
| `shared` | Cổng mạng, mã lý do, câu từ chối, kiểu danh mục tool và phản hồi tool |
| `gateway` | Cổng kiểm soát, hiện chỉ có `GET /health` |
| `mcp-adapter` | Chỗ đặt chương trình nối stdio, chưa có tool |
| `fake-directory` | Danh bạ giả, hiện chỉ có `GET /health` |
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

## Kiểm chứng

```
npm test
npm start
curl http://127.0.0.1:8790/health
```

`npm test` dựng mã rồi chạy mọi tệp `*-test.js` trong `*/dist/`.
Phép thử khói mở ba dịch vụ trên cổng tạm, gọi `/health` của từng dịch vụ và kiểm khoá dịch vụ không xuất hiện trong log.
