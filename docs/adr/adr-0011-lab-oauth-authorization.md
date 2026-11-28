# ADR-0011: Dùng `oidc-provider` cho máy cấp quyền của Lab

Ngày: 2026-11-28. Trạng thái: đã chấp nhận.

Kết quả phép thử ở [nghiên cứu cấp quyền, mục 7](../../rd/research/oauth-authorization.md#7-kết-quả-phép-thử-oidc-provider-9151).

## Đọc nhanh

- Vấn đề: Lab cần tự cấp quyền gọi công cụ cho một ứng dụng, nhưng không nên tự viết toàn bộ giao thức OAuth.
- Phép thử đã chạy một luồng trình duyệt thật với `oidc-provider` 9.15.1 và đạt cả 47 mục kiểm.
- Quyết định: dùng thư viện này với một hợp đồng cố định về adapter, grant, trang tương tác và HTTPS.
- Bản thử không cấp refresh token, không nhận `offline_access` và không mở đăng ký client động.
- Việc tiếp theo: dựng phần quyền ổn định và máy chủ OAuth trong `lab/` theo đúng hợp đồng này.

## 1. Bối cảnh

Lab đã có danh tính bằng khóa `lab_` ([ADR-0005](adr-0005-requester-identity.md)) và đăng nhập trang duyệt bằng mật khẩu trang ([ADR-0008](adr-0008-approval-page-login.md)).
Kế hoạch [cấp quyền truy cập công cụ](../../rd/design/oauth-plan.md) đề xuất thêm OAuth cho cửa `/mcp`, chỉ trên dữ liệu giả.
Ba thư viện đã được khảo sát; `oidc-provider` được chọn để thử trước vì nó giữ phần lớn giao thức.
Phép thử nằm ngoài `lab/`, trong `scratch/oauth-probe/`, và không thay mã chạy.

Phép thử trả lời câu hỏi: thư viện đã chọn có đáp ứng toàn bộ luồng cấp quyền và lưu bền tối thiểu không.
Kết quả đầy đủ ở [nghiên cứu, mục 7](../../rd/research/oauth-authorization.md#7-kết-quả-phép-thử-oidc-provider-9151).
Tóm tắt: 47/47 mục kiểm đạt, gồm 6 lượt trình duyệt thật, 7 lượt đổi mã, kiểm đồng thời, kiểm sập và tìm bí mật thô trong DB, WAL và log.

**Kết luận:** thư viện đáp ứng mức tối thiểu; có đủ bằng chứng để chốt thay vì tự viết giao thức.

## 2. Phương án đã xét

| Phương án | Được | Mất | Kết quả |
| --- | --- | --- | --- |
| Tự viết toàn bộ OAuth | Không thêm phụ thuộc | Phải tự làm PKCE, discovery, mã, token, thu hồi và mọi lỗi giao thức | Loại |
| Bộ hỗ trợ cấp quyền trong SDK MCP 1.32.2 | Cùng bộ SDK đang cài | Lab vẫn tự làm lưu trữ, đăng nhập, đồng ý và vòng đời; bộ định tuyến mặc định công bố cả refresh | Loại cho mốc này |
| `@node-oauth/oauth2-server` 5.3.1 | Gọn, qua giao diện mô hình lưu trữ | Lab tự bổ sung discovery, resource và `iss`; phải kiểm riêng PKCE và việc không cấp refresh | Để dự phòng |
| `oidc-provider` 9.15.1 | Có sẵn PKCE, resource, discovery, tương tác và thu hồi | Lab viết adapter, trang đăng nhập giả, trang đồng ý và cầu nối danh tính | **Chọn** |

Phép thử cho thấy cái giá của `oidc-provider` là một adapter mã hóa và hai trang tương tác, không phải viết lại giao thức.
Hai phát hiện cần nhớ nằm ở [nghiên cứu, mục 7.5](../../rd/research/oauth-authorization.md#75-phát-hiện-và-giới-hạn).
Thứ nhất, không ghi đè `issueRefreshToken` vì thư viện sẽ công bố `refresh_token` dù hàm luôn trả `false`.
Thứ hai, trang đồng ý không đặt `form-action 'self'` nếu ứng dụng ở origin khác, vì Chrome hủy chuyển hướng.

**Kết luận:** chọn `oidc-provider`; hai phát hiện trên là điều kiện bắt buộc khi dựng mã chính.

## 3. Quyết định

Dùng `oidc-provider` 9.15.1 làm máy cấp quyền, gắn vào máy chủ `node:http` hiện có qua `callback()`.
Cấu hình chỉ mở luồng mã cấp quyền và một tài nguyên `/mcp`.

### 3.1. Adapter lưu trữ

Adapter là một factory nhận tên mô hình; mỗi mô hình có một kết nối SQLite riêng.
Hợp đồng gồm `upsert`, `find`, `findByUid`, `findByUserCode`, `consume`, `destroy` và `revokeByGrantId`.
Khóa tra cứu được băm trước khi ghi.
Toàn bộ payload được mã hóa AES-256-GCM với IV mới cho mỗi lần ghi.
Dữ liệu kiểm toàn vẹn gắn tên mô hình và khóa tra cứu đã băm, nên hoán đổi hàng giữa hai mô hình sẽ hỏng thẻ xác thực.
Khóa 32 byte nằm ngoài thư mục DB và được giữ qua lần khởi động lại.

`consume` là một câu cập nhật có điều kiện và ném lỗi khi không cập nhật được hàng nào, vì thư viện không dùng giá trị trả về để chặn.
`upsert` từ chối ghi đè bản ghi đã tiêu thụ hoặc đã thu hồi.
`revokeByGrantId` đặt dấu thu hồi và giữ hàng lại để lần khởi động sau không hồi sinh token.

### 3.2. Cấu hình máy cấp quyền

Chỉ `authorization_code` và `response_types: ['code']`.
Client confidential xác thực bằng `client_secret_basic`.
PKCE bắt buộc, thư viện chỉ hỗ trợ S256.
Phạm vi là `openid`, `mcp:read`, `mcp:propose`; không có `offline_access`.
Không ghi đè `issueRefreshToken`; client không có grant refresh nên không bao giờ cấp token loại này.
Bật `resourceIndicators`; `defaultResource` ném `InvalidTarget` và `getResourceServerInfo` chỉ nhận đúng địa chỉ `/mcp`.
Bộ định tuyến của Lab kiểm thêm `resource` ở yêu cầu cấp mã và yêu cầu đổi mã, vì thư viện không tự từ chối khi thiếu tham số này.
Tắt đăng ký động, `userinfo`, introspection, device flow và các luồng không dùng.

### 3.3. Trang tương tác

Trang đăng nhập và đồng ý do Lab dựng, dùng `interactionDetails` và `interactionFinished`.
Đăng nhập trả `login` với `mergeWithLastSubmission: false`.
Đồng ý thêm `missingOIDCScope` và `missingResourceScopes` vào grant rồi trả `consent` với `mergeWithLastSubmission: true`.
Từ chối trả `error: access_denied`.
Mỗi form có mã chống giả mạo giữ phía máy chủ.
Trang không hiện token, mã cấp quyền, verifier hay bí mật ứng dụng.

### 3.4. HTTPS và chia origin

Dùng một chứng chỉ tự ký có `SAN` gồm `localhost` và `127.0.0.1`, sinh lúc chạy.
Máy cấp quyền và ứng dụng thử dùng chung chứng chỉ nhưng khác cổng trong bản thử.
Chrome tin đúng khóa công khai của chứng chỉ bằng `--ignore-certificate-errors-spki-list`; không tắt kiểm chứng chỉ toàn cục.
Client Node gửi `ca` cho từng yêu cầu và không cài CA vào kho chứng chỉ hệ điều hành.
Mốc nghiệm thu ứng dụng thử sẽ tách hostname; quyết định này không thay đổi hợp đồng chứng chỉ.

**Kết luận:** một hợp đồng duy nhất cho adapter, cấu hình grant, trang tương tác và HTTPS; các issue sau dùng lại, không tạo biến thể thứ hai.

## 4. Hệ quả

- `lab/package.json` sẽ thêm `oidc-provider` 9.15.1 khi dựng máy chủ OAuth; phép thử không sửa workspace.
- Gateway phải có thêm một thư mục mã cho OAuth và một adapter SQLite theo hợp đồng ở mục 3.1.
- Khóa mã hóa và bí mật ứng dụng phải sinh lúc chạy và nằm ngoài DB, ngoài git; không có bí mật thật trong repo.
- Hai trang tương tác phải dựng theo mục 3.3 và kiểm bằng trình duyệt thật, không chỉ bằng lời gọi HTTP.
- Phép thử chưa kiểm điểm cuối thu hồi qua HTTP, chưa có client thứ hai và chưa có refresh; các issue sau phải bổ sung bằng chứng tương ứng.
- Không thay đổi ADR-0009 về ghi an toàn; quyết định này chỉ nói về cấp quyền.
- Không thay đổi danh tính bằng khóa `lab_` cho các cửa cũ; OAuth chỉ áp cho `/mcp` ở mốc này.

**Kết luận:** chi phí là một adapter, hai trang và một khóa lúc chạy; đổi lại Lab không tự duy trì giao thức OAuth.

## 5. Kiểm lại thế nào

Chạy lại phép thử hành vi:

```bash
cd scratch/oauth-probe
npm install
npm run probe
```

Lần chạy cuối đạt 47/47 mục kiểm, với bằng chứng ở `.runtime/run-<thời điểm>/evidence/report.json`.
Kiểm lại các mệnh đề nguồn:

```bash
bash rd/checks/oauth-authorization.sh
```

Script có 16 mục, gồm mục mới về việc ghi đè `issueRefreshToken` làm công bố `refresh_token`.
Hai loại kiểm này độc lập: script nguồn không chạy máy chủ, phép thử hành vi không thay thế kiểm nguồn.

**Kết luận:** mỗi lời hứa của ADR có một lệnh chạy lại được; kết quả nằm ngoài repo và không chứa bí mật.

## 6. Xem lại khi

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| `oidc-provider` đổi cách công bố grant hoặc bỏ `resourceIndicators` | Chạy lại phép thử; nếu không đạt, xem lại `@node-oauth/oauth2-server` theo mục 2 |
| Cần cấp refresh token có kiểm soát | Viết ADR mới, đánh giá rủi ro theo RFC 9700 và thêm phép thử thu hồi, xoay token |
| Cần nhận client bên ngoài | Quyết định cách đăng ký ở issue riêng; không mở đăng ký động chỉ vì tiện |
| Cần tách hostname thật cho ứng dụng thử | Giữ nguyên hợp đồng chứng chỉ; chỉ đổi `SAN` và cấu hình mạng |
| Phát hiện thêm hành vi của thư viện làm sai hợp đồng | Ghi vào nghiên cứu mục 7.5 và thêm mục kiểm nguồn tương ứng |
| Có yêu cầu lưu token qua nhiều tiến trình hoặc nhiều máy | Xem lại lựa chọn SQLite và khóa lúc chạy; có thể chuyển sang kho khóa chung |

**Kết luận:** đường thay thế rõ ràng là quay lại `@node-oauth/oauth2-server`, nên quyết định này không khóa Lab vào một thư viện duy nhất.

## Tài liệu liên quan

- [Nghiên cứu cấp quyền truy cập công cụ](../../rd/research/oauth-authorization.md)
- [Kế hoạch cấp quyền cho Lab](../../rd/design/oauth-plan.md)
- [ADR-0005, danh tính người yêu cầu](adr-0005-requester-identity.md)
- [ADR-0008, đăng nhập trang xác nhận và duyệt](adr-0008-approval-page-login.md)
- [ADR-0010, mức trần dữ liệu theo loại client](adr-0010-client-data-ceiling.md)
- [Bảng thuật ngữ](../../rd/problem/glossary.md)
