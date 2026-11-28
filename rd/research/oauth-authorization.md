# Cấp quyền truy cập công cụ trên dữ liệu giả

Ngày: 2026-11-28. Trạng thái: đã khảo sát chuẩn và ba thư viện; phép thử `oidc-provider` 9.15.1 đạt 47/47 mục kiểm, chốt thư viện và ghi ADR-0011.

## Đọc nhanh

- Hôm nay người dùng phải nhận rồi dán khóa riêng để trợ lý gọi công cụ của Lab.
- Lab có thể tự cấp quyền sau khi người dùng đăng nhập bằng nhân vật giả và bấm đồng ý.
- Nên dùng thư viện chuyên xử lý cấp quyền, giữ dữ liệu giả và bước người thật xác nhận từng thay đổi.
- Bản đầu chưa cần tự gia hạn quyền truy cập hay nối tài khoản công ty.
- Phép thử thư viện đã chạy trên trình duyệt thật và đạt toàn bộ mục kiểm; việc tiếp theo là dựng mã chính theo [kế hoạch](../design/oauth-plan.md).

## 1. Câu hỏi, phạm vi và cách nghiên cứu

Ngày 28/11, người dùng chọn hai điều: chỉ dùng dữ liệu giả và để Lab tự cấp token truy cập.
OAuth là cách người dùng cho một ứng dụng quyền gọi hệ thống khác mà không đưa mật khẩu cho ứng dụng đó.
Token truy cập (access token) là chuỗi bí mật ứng dụng gửi kèm lời gọi để dùng quyền đã được cấp.
Token này khác đơn vị tính lượng chữ của mô hình, cũng thường gọi là token.

Câu hỏi nghiên cứu: thêm cơ chế đó vào Lab thế nào để giữ nguyên quyền theo người, bước duyệt và khả năng chạy lại?
Phạm vi là ứng dụng gọi cổng Lab qua MCP, chuẩn chung để ứng dụng gọi công cụ.
Việc Lab gọi hệ thống nghiệp vụ bằng tài khoản người dùng là chặng khác, chưa nằm trong đề xuất này.

Đợt khảo sát đọc chuẩn chính thức, ba thư viện và mã đang cài trong Lab.
Phép thử triển khai đầu tiên được giới hạn một ngày công; hết hạn phải ghi kết quả trước khi mở rộng.
Phép thử đã chạy trong `scratch/oauth-probe/`, không nằm trong mã Lab; chưa có máy chủ OAuth trong `lab/` và chưa có nghiệm thu tính năng.

**Kết luận:** phép thử đã chứng minh thư viện chạy được trong `scratch/`; `lab/` vẫn chưa có máy chủ OAuth và chưa có nghiệm thu tính năng.

## 2. Những chỗ trong Lab phải đổi

| Bằng chứng trong mã | Hệ quả cho thiết kế |
| --- | --- |
| [`IdentityProvider`](../../lab/gateway/src/identity/types.ts) đã tách việc nhận ra người gọi khỏi công cụ | Có thể thêm cách xác thực mà không viết lại từng công cụ |
| [`ApiKeyIdentity`](../../lab/gateway/src/identity/api-key-identity.ts) trả cả người, nơi gọi, phạm vi và mã khóa | OAuth phải cung cấp đủ bốn ý nghĩa, không chỉ một mã nhân viên |
| [`ProposalStore`](../../lab/gateway/src/proposals/proposal-store.ts) lưu `draftedByKeyId` | Đề xuất cần tham chiếu lần cấp quyền ổn định thay vì một token ngắn hạn |
| [`checkWrite`](../../lab/gateway/src/writes/authorize.ts) và các [trang duyệt](../../lab/gateway/src/web/approval-routes.ts) đọc lại khóa gốc | Phải đổi các điểm kiểm trước khi cho đề xuất OAuth ghi dữ liệu |
| [`SessionStore`](../../lab/gateway/src/web/session-store.ts) dùng mật khẩu trang và phiên riêng | Token công cụ tiếp tục không đăng nhập hay bấm duyệt được |
| [`NEXT_PATTERN`](../../lab/gateway/src/web/page-util.ts) chỉ nhận các trang xác nhận và duyệt đã biết | Không nới thành địa chỉ quay về tùy ý; lưu lượt đăng nhập OAuth ở phía máy chủ |
| [`Outbox`](../../lab/gateway/src/writes/outbox.ts) có trạng thái đã gửi nhưng chưa rõ kết quả | Thu hồi quyền không được xóa dấu vết hay gọi một lệnh đã gửi là chưa thực hiện |
| [`app.ts`](../../lab/gateway/src/app.ts) dùng cùng lớp xác thực cho hai cửa | Token cấp cho `/mcp` phải bị từ chối ở cửa HTTP khác nếu chưa được cấp cho cửa đó |

Các ranh giới hiện hành nằm trong [ADR-0005 về danh tính](../../docs/adr/adr-0005-requester-identity.md), [ADR-0008 về đăng nhập trang duyệt](../../docs/adr/adr-0008-approval-page-login.md) và [ADR-0010 về trần dữ liệu](../../docs/adr/adr-0010-client-data-ceiling.md).
OAuth là thay đổi kiến trúc được đề xuất, chưa thay thế các quyết định đã chấp nhận.

**Kết luận:** phần đáng chú ý nhất là vòng đời quyền của đề xuất, không phải riêng trang đăng nhập.

## 3. Những yêu cầu chuẩn cho bản tối giản

Máy chủ cấp quyền (authorization server) nhận đăng nhập, hỏi đồng ý và cấp token.
Máy chủ công cụ (resource server) kiểm token trước khi trả dữ liệu.
Lab giữ cả hai vai trong cùng tiến trình, nên chưa cần một dịch vụ kiểm token riêng.

Ứng dụng đã đăng ký (client) có mã cố định và địa chỉ quay về đã khai trước.
Bản thử dùng ứng dụng có máy chủ riêng giữ bí mật ứng dụng, gọi là confidential client.
Mã ứng dụng công khai không tự chứng minh ứng dụng đó đáng tin để nhận trần dữ liệu cao.

Luồng mã cấp quyền (authorization code) trả một mã ngắn hạn qua trình duyệt, rồi đổi mã lấy token ở phía máy chủ.
PKCE giữ thêm một bí mật cho mỗi lượt, khiến người chỉ đánh cắp mã không đổi được token.
Ứng dụng còn kiểm mã liên kết lượt đăng nhập (`state`) và bên cấp kết quả (`iss`).

| Điểm cần giữ | Nguồn công khai và cách áp dụng |
| --- | --- |
| Đúng phiên bản giao thức | SDK `1.32.2` đang cài khai phiên bản MCP `2025-11-25`; dùng [bản đặc tả đó](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) làm mốc nghiệm thu |
| Khai ứng dụng trước | Hợp lệ với ứng dụng thử do Lab kiểm soát; client bên ngoài cần kiểm cách đăng ký ở mục 3.1 |
| Tìm được nơi cấp quyền | Công bố thông tin máy chủ cấp quyền và tài nguyên được bảo vệ; phản hồi `401` chỉ tới thông tin này |
| Đúng tài nguyên nhận token | Cả yêu cầu cấp mã và đổi mã mang `resource`; token chỉ dùng cho địa chỉ `/mcp` chuẩn đã cấu hình |
| Chống lấy cắp và dùng lại mã | Giữ PKCE S256, ràng buộc người, ứng dụng, địa chỉ quay về, phạm vi và thời hạn; kiểm đồng thời hai lượt đổi mã |
| Không bắt buộc gia hạn tự động | [RFC 6749, mục 1.5](https://www.rfc-editor.org/rfc/rfc6749.html#section-1.5) cho phép không cấp refresh token; thông tin công bố phải phản ánh đúng |
| Kiểm bên cấp kết quả | [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207.html) quy định kiểm `iss`; ứng dụng kiểm cả kết quả lỗi |
| Đường truyền bảo vệ thông tin | Dùng HTTPS cho máy chủ cấp quyền và ứng dụng web thử; ngoại lệ địa chỉ quay về trên máy cá nhân trong [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html) dành cho ứng dụng native |
| Thu hồi quyền rõ ràng | [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009.html) cung cấp thao tác thu hồi token; ngắt cả kết nối là hành vi bổ sung phải định nghĩa riêng |

Refresh token là bí mật dài hạn dùng để xin token truy cập mới.
Bản đầu đề xuất không cấp loại này và không nhận `offline_access`.
[RFC 9700, mục 4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14) cũng yêu cầu đánh giá trước khi cấp bí mật dài hạn đó.

Thời hạn mã 5 phút, token 60 phút và lần cấp quyền 4 giờ là tham số thử nghiệm đề xuất của Lab.
Đây không phải các con số mà chuẩn bắt buộc.

**Kết luận:** có thể giảm số tính năng, nhưng vẫn phải giữ ràng buộc token, bảo vệ mã và tách quyền công cụ khỏi quyền duyệt.

### 3.1. Đăng ký client bên ngoài

Đăng ký trước (pre-registration) phù hợp khi Lab và ứng dụng đã thống nhất mã ứng dụng và địa chỉ quay về.
Hai client thử của Lab đáp ứng điều kiện đó, nhưng không đại diện cho khả năng cấu hình của MausBot.

Tài liệu định danh ứng dụng (Client ID Metadata Document) là bản JSON tại URL HTTPS dùng làm `client_id`.
Tài liệu khai tên ứng dụng, địa chỉ quay về và cách xác thực; máy chủ cấp quyền phải kiểm các thông tin này.
Đăng ký động (Dynamic Client Registration) dùng một API để tạo client lúc kết nối.

[MCP `2025-11-25`, phần đăng ký client](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#client-registration-approaches) khuyến nghị cả client và máy chủ hỗ trợ tài liệu định danh ứng dụng.
Đăng ký động là tùy chọn.
Client ưu tiên thông tin đăng ký trước nếu có; khi không có, nó cần một cách đăng ký mà hai phía cùng hỗ trợ.
Không thể suy ra MausBot nhập được bí mật ứng dụng hoặc dùng được callback cố định chỉ từ việc hỗ trợ MCP.

Bản thử hiện chỉ khai `authorization_code` và `client_secret_basic` cho hai client do Lab quản lý.
Muốn nhận một client ngoài cần kiểm đúng bản cài, xác định cách đăng ký, phương thức xác thực và callback trước.
Một mã client dùng được cho nhiều người; mỗi người vẫn phải có token và grant riêng.

Metadata OAuth tại `/.well-known/oauth-authorization-server` được bổ sung thành hợp đồng bắt buộc của Lab.
Discovery OpenID Connect vẫn giữ để client dùng được cả hai cách, với cùng issuer và cùng cấu hình tính năng.
Đây là mục tiêu tương thích bổ sung, không phải tuyên bố mọi client MCP cũ chắc chắn kết nối được.

**Kết luận:** bản tối giản hợp lệ trong phạm vi ứng dụng thử; tương thích client bên ngoài phải được quyết định và nghiệm thu riêng.

## 4. So sánh ba cách triển khai

Bộ tiêu chí vẫn là [tám yêu cầu của PRD](../problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc).
Các điểm trực tiếp ở đây là SR1 (danh tính và một cửa ghi), SR3 (phạm vi quyền), SR4 (điểm dừng rủi ro), SR5 (không chắc thì chặn), SR7 (vết xuyên suốt) và SR8 (dùng lại, quyền theo người).
SR2 (luật chạy được) và SR6 (không ghi trùng) phải tiếp tục đạt bộ kiểm hồi quy.

| Cách | Phần thư viện xử lý | Phần Lab vẫn phải làm và điểm cần cân nhắc |
| --- | --- | --- |
| Bộ hỗ trợ cấp quyền trong SDK MCP `1.32.2` | Bộ định tuyến, kiểm yêu cầu và kiểm PKCE | Lab tự làm lưu trữ, đăng nhập, đồng ý, vòng đời mã và thu hồi; bộ định tuyến mặc định công bố cả gia hạn token |
| `@node-oauth/oauth2-server` `5.3.1` | Các luồng OAuth qua giao diện mô hình lưu trữ, không bắt buộc Express | Lab bổ sung thông tin khám phá, ràng buộc tài nguyên và `iss`; phải kiểm riêng xác thực ứng dụng khi có PKCE và việc không cấp refresh token |
| `oidc-provider` `9.15.1` | Máy chủ cấp quyền có quản lý tương tác, PKCE, tài nguyên và thông tin khám phá | Lab viết bộ lưu SQLite, trang đăng nhập giả, trang đồng ý và cầu nối tới danh tính công cụ; cần khóa cấu hình để chỉ mở phạm vi thử |

Các phiên bản trên là mốc khảo sát, không phải chỉ dẫn tự nâng mọi gói lên bản mới nhất.
Nguồn bộ hỗ trợ MCP là [mã đúng phiên bản](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/1.32.2/src/server/auth/router.ts).
Tài liệu [nhánh phát triển hiện tại](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/authorization.md) đã đóng băng phần hỗ trợ máy chủ cấp quyền; đây là rủi ro bảo trì cần tính đến.

Ở `@node-oauth/oauth2-server`, [bộ xử lý token](https://raw.githubusercontent.com/node-oauth/node-oauth2-server/v5.3.1/lib/handlers/token-handler.js) có nhánh PKCE ảnh hưởng yêu cầu bí mật ứng dụng.
[Luồng cấp mã](https://raw.githubusercontent.com/node-oauth/node-oauth2-server/v5.3.1/lib/grant-types/authorization-code-grant-type.js) gọi thu hồi mã trước khi lưu token.
Không được giả định các lời gọi bất đồng bộ đó tự nằm trong một giao dịch SQLite.

`oidc-provider` hỗ trợ gắn vào máy chủ Node qua [giao diện callback và cấu hình](https://github.com/panva/node-oidc-provider/tree/v9.15.1/docs).
Khả năng đăng nhập chuẩn OpenID Connect đi kèm thư viện không buộc Lab mở thêm tính năng đó cho ứng dụng thử.
Chỉ yêu cầu phạm vi công cụ, không yêu cầu `openid` hay token đăng nhập.

**Kết luận:** đề xuất thử `oidc-provider` trước để giảm phần giao thức Lab tự duy trì; lựa chọn cuối cùng cần bằng chứng ở bước thử nhỏ.

## 5. Phát hiện quan trọng về lưu bí mật và vòng đời quyền

Token dạng chuỗi ngẫu nhiên (opaque token) không cho ứng dụng tự đọc nội dung.
Ở `oidc-provider`, [mã định dạng opaque](https://raw.githubusercontent.com/panva/node-oidc-provider/v9.15.1/lib/models/formats/opaque.js) dùng `jti` làm giá trị token.
[Mô hình gốc](https://raw.githubusercontent.com/panva/node-oidc-provider/v9.15.1/lib/models/base_model.js) cũng đưa trường này vào dữ liệu lưu.
Vì vậy chỉ băm khóa tra cứu mà lưu nguyên nội dung JSON vẫn có thể để token thô trong SQLite.

Đề xuất băm mã tra cứu và mã hóa có kiểm tra tính toàn vẹn cho toàn bộ nội dung lưu của thư viện.
Khóa giải mã nằm ngoài cơ sở dữ liệu, trong cấu hình bí mật lúc chạy.
Đây là lưu trữ có thể giải mã, khác cơ chế chỉ lưu bản băm của khóa `lab_` hiện tại.
Phép thử phải tìm token thật trong cả cơ sở dữ liệu, tệp ghi trước của SQLite và nhật ký.

Bộ lưu mẫu của thư viện yêu cầu thao tác [tiêu thụ mã và thu hồi theo lần cấp quyền](https://raw.githubusercontent.com/panva/node-oidc-provider/v9.15.1/example/my_adapter.js).
Tiêu thụ mã phải có điều kiện trong một giao dịch ngắn; hai người đổi cùng mã không được cùng thành công.
Lỗi sau khi mã đã bị tiêu thụ có thể buộc người dùng kết nối lại.
Không hứa khôi phục mã đã dùng hay bảo đảm luôn trả token thành công sau mọi lần sập.

Lần cấp quyền (authorization grant) là bản ghi ổn định cho việc một người cho một ứng dụng dùng một phạm vi quyền.
Token hết hạn chỉ chặn lời gọi công cụ mới.
Thu hồi lần cấp quyền chặn cả đề xuất còn chờ và các lệnh chưa gửi; kết nối lại tạo lần cấp quyền mới.
Thay đổi này phải giữ trạng thái lệnh đã gửi và cách xử lý kết quả chưa rõ trong [spec ghi an toàn](../design/write-safety-spec.md).

**Kết luận:** phép thử đầu phải chứng minh lưu bí mật đúng và tiêu thụ mã an toàn trước khi nối tới luồng ghi.

## 6. Bằng chứng, giới hạn và bước tiếp theo

Kiểm nguồn công khai và các phát hiện trên phiên bản SDK đang cài:

```bash
bash rd/checks/oauth-authorization.sh
```

Script kiểm mệnh đề nguồn và dấu hiệu cấu trúc mã, không kiểm tính đúng đắn của một máy chủ OAuth.
Ngày 28/11/2026, cả 16 mục kiểm đều đạt trên máy Lab, gồm 15 nguồn công khai và một kiểm SDK đang cài.
Mục kiểm MCP bao gồm khuyến nghị đăng ký client và hai cách khám phá máy chủ cấp quyền.
Phép thử hành vi nằm ở mục 7 và chạy bằng một lệnh riêng; hai loại kiểm này không thay thế nhau.
Việc đăng nhập nhân vật giả chỉ chứng minh luồng cấp quyền chạy đúng; nó chưa chứng minh danh tính nhân viên công ty.
Thử bằng ứng dụng của Lab cũng chưa chứng minh Thổ Thần tương thích.

**Kết luận:** kiểm nguồn và kiểm hành vi cùng đạt; đây là cơ sở chốt thư viện, không phải nghiệm thu tính năng trong `lab/` hay tương thích Thổ Thần.

## 7. Kết quả phép thử `oidc-provider` 9.15.1

### 7.1. Cách chạy lại

```bash
cd scratch/oauth-probe
npm install
npm run probe
```

Phép thử tự sinh khóa lưu trữ, chứng chỉ TLS, mật khẩu trang và bí mật ứng dụng lúc chạy.
Nó không đọc biến môi trường, không dùng bí mật thật và không gọi mô hình.
Mỗi lần chạy tạo `.runtime/run-<thời điểm>/` chứa DB, khóa, log và bằng chứng.
`scratch/` đã bị git bỏ qua nên không có mã hay dữ liệu thử nào đi vào commit.
Mã nguồn thử nằm ở `probe.mjs` và `src/`, gồm adapter, cấu hình máy cấp quyền, trang đăng nhập và đồng ý, ứng dụng thử và điểm cuối MCP tối giản.

### 7.2. Phiên bản và môi trường

| Thành phần | Phiên bản hoặc giá trị |
| --- | --- |
| Node | 22.21.0 |
| `oidc-provider` | 9.15.1 |
| `better-sqlite3` | 13.2.0 |
| `playwright-core` | 1.56.1 |
| Trình duyệt | Chrome cài trên máy, chạy headless |
| Máy chủ | Chỉ nghe `127.0.0.1`, hai cổng ngẫu nhiên cho máy cấp quyền và ứng dụng thử |
| Dữ liệu | Danh bạ giả hai nhân viên, nhân vật Hoa, không có dữ liệu thật |

### 7.3. Số lần chạy và kết quả

Lần chạy cuối có 6 lượt trình duyệt thật, 7 lượt đổi mã và 47 mục kiểm.
Cả 47 mục kiểm đều đạt, không có mục nào bị bỏ qua.
Lượt trình duyệt đầu mất 475 ms; lượt đổi mã đầu mất 18 ms.
Đây là số đo trên máy Lab, không phải cam kết độ trễ.

| Nhóm kiểm | Số mục | Kết quả chính |
| --- | --- | --- |
| Metadata và tài nguyên | 18 | Hai metadata giống nhau ở issuer, endpoint, grant, response type, scope, PKCE và cách xác thực; chỉ `authorization_code`; không `refresh_token`, không `offline_access`; metadata tài nguyên trỏ đúng issuer và `/mcp` |
| Luồng trình duyệt và MCP | 10 | Đăng nhập Hoa giả, đồng ý, chuyển hướng HTTPS thật có `iss`, đổi mã bằng confidential client và PKCE S256, token opaque 3600 giây, gọi `directory_lookup` trả bản ghi giả; thiếu token nhận `401` kèm `WWW-Authenticate` |
| Chặn trường hợp sai | 8 | Thiếu `resource` bị chặn; `resource` lạ bị chặn ở cấp mã và đổi mã; sai client secret nhận `invalid_client`; sai verifier nhận `invalid_grant`; grant `refresh_token` bị từ chối; `offline_access` không vào grant hay token |
| Đồng thời và sập | 7 | Hai lượt đổi cùng mã cho tối đa một token; hai tiến trình tranh `consume` có đúng một bên thắng; sập sau `consume` không hồi sinh mã; khởi động lại không hồi sinh token đã thu hồi; ghi đè bản ghi đã thu hồi bị từ chối |
| Lưu trữ và bí mật | 4 | Mọi payload dùng envelope `enc:v1:`; không có `jti` dạng chữ; không tìm thấy token, mã, verifier, client secret, mật khẩu trang hay khóa trong DB, WAL, SHM và log |

### 7.4. Hợp đồng chốt cho các issue sau

Adapter là một factory nhận tên mô hình, vì `oidc-provider` tạo `new Adapter(modelName)` cho từng mô hình.
Mỗi mô hình có một kết nối SQLite riêng trong bản thử.

| Thành phần | Hợp đồng |
| --- | --- |
| `upsert(id, payload, expiresIn)` | Băm khóa tra cứu; mã hóa toàn bộ payload; ghi `model`, `uid` và `userCode` đã băm cùng `grantId` đã băm; từ chối ghi đè bản ghi đã tiêu thụ hoặc đã thu hồi |
| `find(id)` | Băm `id`, giải mã payload, từ chối nếu hết hạn, đã tiêu thụ hoặc đã thu hồi; sai khóa hoặc sai dữ liệu kiểm toàn vẹn thì trả `undefined`, không xóa |
| `findByUid(uid)` và `findByUserCode(code)` | Tra theo cột băm tương ứng, cùng điều kiện còn hiệu lực |
| `consume(id)` | Một câu `UPDATE` có điều kiện trong giao dịch ngắn; trả về 0 hàng thì ném lỗi, không trả `false` |
| `destroy(id)` | Xóa đúng hàng theo khóa băm |
| `revokeByGrantId(grantId)` | Đặt `revoked = 1` cho mọi hàng cùng mô hình và cùng `grantId` đã băm; giữ hàng lại |

Payload lưu dạng `enc:v1:<keyId>:<iv>:<tag>:<ciphertext>`.
Mã hóa AES-256-GCM với IV 12 byte ngẫu nhiên cho mỗi lần ghi.
Dữ liệu kiểm toàn vẹn là JSON của `model` và khóa tra cứu đã băm, nên hoán đổi hàng giữa hai mô hình sẽ hỏng thẻ xác thực.
Khóa 32 byte nằm ở thư mục `keys/`, tách khỏi thư mục `db/`, và được giữ qua lần khởi động lại.

Cấu hình máy cấp quyền đã chốt:

| Trường | Giá trị |
| --- | --- |
| `issuer` | Một địa chỉ HTTPS cố định lúc chạy, không suy ra từ header |
| Client | Một client confidential, `grant_types: ['authorization_code']`, `response_types: ['code']`, `client_secret_basic` |
| `responseTypes` | Chỉ `code` |
| `clientAuthMethods` | Chỉ `client_secret_basic` |
| `pkce.required` | Luôn đúng; thư viện chỉ hỗ trợ S256 |
| `scopes` | `openid`, `mcp:read`, `mcp:propose`; không `offline_access` |
| Refresh | Không ghi đè `issueRefreshToken`; client không có grant refresh nên không bao giờ cấp |
| Resource | Bật `resourceIndicators`; `defaultResource` ném `InvalidTarget`; `getResourceServerInfo` chỉ nhận đúng `/mcp` và trả scope cùng TTL 3600 |
| TTL | Mã 300 giây, token 3600 giây, grant 4 giờ, phiên 1 giờ |
| Tương tác | `interactions.url` trả `/interaction/<uid>`; trang của Lab gọi `interactionDetails` và `interactionFinished` |
| Cookie | Khóa sinh lúc chạy; `httpOnly`, `SameSite=Lax`, `Secure` |
| JWKS | Khóa ký RS256 sinh lúc chạy, không nằm trong repo |

Hợp đồng tương tác:

- Đăng nhập trả `{ login: { accountId, remember: true } }` với `mergeWithLastSubmission: false`.
- Đồng ý đọc `details.prompt.details.missingOIDCScope` và `missingResourceScopes`, thêm vào grant, rồi trả `{ consent: { grantId } }` với `mergeWithLastSubmission: true`.
- Từ chối trả `{ error: 'access_denied' }` với `mergeWithLastSubmission: false`.
- Mỗi form có một mã chống giả mạo giữ phía máy chủ theo `uid`.
- Trang không hiện token, mã cấp quyền, verifier hay bí mật ứng dụng.

Hợp đồng HTTPS:

- Một chứng chỉ tự ký có `SAN` gồm `localhost` và `127.0.0.1`, sinh lúc chạy.
- Máy cấp quyền và ứng dụng thử dùng chung chứng chỉ nhưng khác cổng.
- Chrome tin đúng khóa công khai của chứng chỉ qua `--ignore-certificate-errors-spki-list`; không tắt kiểm chứng chỉ toàn cục.
- Client Node gửi `ca` cho từng yêu cầu; không cài CA vào kho chứng chỉ hệ điều hành.
- `redirect_uri` khớp chính xác địa chỉ đã đăng ký; ứng dụng kiểm `state` và `iss` trước khi nhận mã.

### 7.5. Phát hiện và giới hạn

- `oidc-provider` 9.15.1 thêm `refresh_token` vào `grant_types_supported` khi `issueRefreshToken` khác hàm mặc định, kể cả khi hàm đó luôn trả `false`.
  Vì vậy không ghi đè hàm này; chặn refresh bằng grant của client và bằng việc không khai `offline_access`.
  Script nguồn có thêm một mục kiểm cho hành vi này.
- Đặt `Content-Security-Policy: form-action 'self'` trên trang đồng ý làm Chrome hủy chuyển hướng sang ứng dụng ở cổng khác, với `net::ERR_ABORTED`.
  Bỏ `form-action` thì luồng chạy đúng; trang thật phải khai cả địa chỉ quay về hoặc bỏ chỉ thị này.
- Thư viện không tự từ chối yêu cầu thiếu `resource`; nó lọc bớt scope và đi tiếp.
  Lab phải kiểm `resource` ở bộ định tuyến và cho `defaultResource` ném `InvalidTarget`.
- Thư viện bỏ qua `offline_access` chưa đăng ký thay vì trả `invalid_scope`.
  Vì vậy phép kiểm đúng là token cuối không có `refresh_token` và scope không chứa `offline_access`, không phải chờ một mã lỗi.
- Điểm cuối MCP trong phép thử là JSON-RPC tối giản, không phải giao vận của SDK MCP.
- Phép thử chạy một tiến trình cho luồng HTTP; bằng chứng tranh chấp DB đến từ hai tiến trình gọi thẳng adapter.
- Chưa kiểm điểm cuối thu hồi qua HTTP; mới kiểm `revokeByGrantId` ở adapter và khởi động lại.
- Chưa có client thứ hai, chưa có đăng ký client bên ngoài, chưa có refresh token và chưa có xác thực nhiều người trong cùng client.
- Phép thử dùng cùng hostname khác cổng; tách hostname như kế hoạch mục 6 để lại cho issue nghiệm thu ứng dụng thử.

### 7.6. Kết luận

`oidc-provider` 9.15.1 đáp ứng luồng cấp mã tối thiểu, hai metadata nhất quán, resource bắt buộc, PKCE S256, không refresh và hợp đồng lưu trữ mã hóa.
Quyết định dùng thư viện này được ghi ở [ADR-0011](../../docs/adr/adr-0011-lab-oauth-authorization.md).
Issue sau dùng đúng hợp đồng ở mục 7.4, không tạo một biến thể cấu hình thứ hai.
Phép thử không chứng minh tương thích client bên ngoài hay Thổ Thần; hai mốc đó vẫn cần bằng chứng riêng.
