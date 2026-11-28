# Kế hoạch cấp quyền truy cập công cụ cho Lab

Ngày: 2026-11-28. Trạng thái: đề xuất triển khai trên dữ liệu giả; phép thử thư viện đạt, chưa sửa mã chạy.

## Đọc nhanh

- Người dùng đăng nhập bằng nhân vật giả rồi cho ứng dụng thử quyền gọi công cụ của Lab.
- Lab tự cấp thẻ truy cập có thời hạn, nhận ra đúng người và cho phép ngắt kết nối.
- Người dùng vẫn phải xác nhận từng thay đổi; ứng dụng không được tự bấm duyệt.
- Đề xuất dùng thư viện có sẵn, thử qua trình duyệt trước và bổ sung tự gia hạn ở lần sau.
- Bước đầu là kiểm thư viện trong một ngày công; toàn bộ kế hoạch dự trù 6 tới 10 ngày công, chưa phải số đo.

## 1. Phạm vi và điều kiện bắt đầu

Người dùng đã chọn dữ liệu giả và Lab tự cấp token ngày 28/11/2026.
Phát hiện và so sánh ba thư viện nằm trong [nghiên cứu cấp quyền](../research/oauth-authorization.md).
Thuật ngữ chung nằm trong [bảng thuật ngữ](../problem/glossary.md).

Mốc đầu đề xuất dùng một ứng dụng thử của Lab với máy chủ riêng và trình duyệt thật.
Ứng dụng dùng kịch bản cố định để gọi công cụ, không gọi mô hình trả phí.
Mốc này chỉ chứng minh OAuth trong ứng dụng thử; chưa chứng minh MausBot hay client bên ngoài nối được.
Điều kiện nhận client bên ngoài được quyết định riêng ở mục 9.1, không mặc nhiên đạt sau khi hai ứng dụng thử chạy.
Thổ Thần là mốc tương thích tiếp theo, cần biết bản đang dùng có nối được một nhà cấp quyền riêng cho Lab hay không.
Nếu người dùng yêu cầu Thổ Thần ngay ở mốc đầu, phải đổi tiêu chí nghiệm thu và bổ sung phụ thuộc đó trước khi triển khai.

Lab chỉ thêm OAuth cho `/mcp` ở mốc này.
Hai cửa dùng khóa `lab_` vẫn phục vụ bộ kiểm hồi quy và các phiên nghiệm thu cũ.
Token cấp cho `/mcp` không tự được dùng ở `/v1/tools/*` hoặc `/v1/usage`.
Chưa thêm token hệ thống nguồn, đăng nhập công ty hay chợ công cụ.

Đây là kế hoạch mở rộng được đề xuất, không phải kết quả của phép đo Q3 hay điều kiện mới để đóng giai đoạn ghi an toàn.
Khi bắt đầu triển khai, tạo issue có người phụ trách và mốc tuần thực tế; ghi quyết định kiến trúc mới sau phép thử đầu.
Không dùng ADR-0009, vốn dành cho câu hỏi ghi an toàn.

**Kết luận:** có thể nghiên cứu và thử OAuth độc lập; giữ riêng bằng chứng của ứng dụng thử và bằng chứng từ Thổ Thần.

## 2. Kiến trúc đề xuất và luồng người dùng

Cổng Lab giữ máy chủ cấp quyền và công cụ trong cùng tiến trình, cùng SQLite.
Đề xuất thử `oidc-provider` `9.15.1`, gắn qua `callback()` của thư viện vào máy chủ Node hiện có.
Thư viện tự dùng các thành phần nội bộ của nó; Lab không cần chuyển toàn bộ bộ định tuyến sang framework khác.
Ghim phiên bản và kiểm Node 22 của Lab ở bước đầu, trước khi thêm phụ thuộc chính thức.

Cấu hình thử chỉ cho `responseTypes: ['code']`, ứng dụng khai `grant_types: ['authorization_code']` và bắt buộc PKCE.
Đặt `issueRefreshToken` luôn trả `false`; tắt tương tác phát triển mặc định, đăng ký động, `userinfo` và introspection.
Chỉ bật thu hồi token và ràng buộc tài nguyên cần cho công cụ.
Nối trang của Lab bằng `interactionDetails` và `interactionFinished`, không sửa mã nội bộ của thư viện.
Phải từ chối cả trường hợp thiếu `resource`, thay vì âm thầm điền một tài nguyên mặc định.

Ứng dụng thử là confidential client: máy chủ giữ bí mật ứng dụng và token, trình duyệt chỉ giữ phiên của ứng dụng.
Đăng ký trước hai mã ứng dụng có cùng trần dữ liệu để kiểm khả năng dùng lại.
Ứng dụng thứ hai phải khởi tạo phiên và kết nối độc lập, không chỉ đổi nhãn trên cùng một token.

Luồng chị Hoa chuyển T-12:

1. Chị Hoa bấm Kết nối Lab trên ứng dụng thử.
2. Máy chủ ứng dụng sinh `state`, bí mật PKCE và lưu lượt kết nối gắn với phiên trình duyệt.
3. Trình duyệt mở trang cấp quyền của Lab; chị Hoa đăng nhập bằng mật khẩu trang của nhân vật giả.
4. Lab hiện ứng dụng nào đang xin quyền, nhân vật nào đang dùng và được gọi những công cụ nào.
5. Chị Hoa bấm Cho phép; ứng dụng nhận mã ở địa chỉ quay về đã đăng ký.
6. Máy chủ ứng dụng kiểm `state`, `iss` rồi đổi mã lấy token; trình duyệt không nhận token.
7. Ứng dụng gọi MCP để tra danh bạ và soạn đề xuất chuyển T-12.
8. Chị Hoa mở trang xác nhận của Lab và bấm Gửi; trưởng nhóm duyệt khi luật yêu cầu.
9. Cổng kiểm lại quyền rồi chuyển lệnh sang hàng đợi hiện có.

Trang đồng ý không xác nhận bất kỳ thay đổi nghiệp vụ nào.
Mật khẩu `trang_` không đi qua máy chủ ứng dụng thử và token không được mở phiên duyệt.
Đăng nhập và đồng ý OAuth dùng trạng thái phía máy chủ; không nới `NEXT_PATTERN` thành một địa chỉ chuyển hướng tùy ý.

**Kết luận:** người dùng bỏ bước dán khóa công cụ, còn việc ghi tiếp tục có bước xác nhận riêng.

## 3. Hợp đồng giao thức tối thiểu

Mốc giao thức là MCP `2025-11-25`, phù hợp SDK `1.32.2` đang cài.
Không nâng SDK hoặc tuyên bố đạt bản mới nhất trong cùng thay đổi.
Thông tin máy chủ cấp quyền, gọi là metadata, phải phản ánh đúng cấu hình chạy.

| Thành phần | Hợp đồng đề xuất |
| --- | --- |
| Bên cấp quyền | Một `issuer` cố định cấu hình lúc chạy; không suy ra từ header `Host` của người gọi |
| Tài nguyên | Một địa chỉ HTTPS chuẩn kết thúc `/mcp`; bắt buộc đúng ở yêu cầu cấp mã và đổi mã |
| Thông tin tài nguyên | `GET /.well-known/oauth-protected-resource/mcp`, khai đúng bên cấp quyền và phạm vi |
| Thông tin cấp quyền | Bắt buộc công bố `/.well-known/oauth-authorization-server` và discovery của thư viện; cùng issuer, endpoint và tập tính năng thực sự hỗ trợ |
| Xin quyền | Chỉ nhận `response_type=code`, PKCE S256, ứng dụng đã đăng ký và địa chỉ quay về khớp chính xác |
| Đổi mã | Chỉ `authorization_code`, xác thực ứng dụng bằng `client_secret_basic`; kiểm thêm bí mật PKCE |
| Phạm vi | `mcp:read` để đọc; `mcp:propose` cho phép đề xuất khi có thêm `mcp:read`; quyền nghiệp vụ vẫn do luật quyết |
| Gia hạn | Chưa cấp refresh token; không khai luồng `refresh_token`, không nhận `offline_access` |
| Mã cấp quyền | 5 phút, dùng một lần; ràng buộc người, ứng dụng, tài nguyên, phạm vi và địa chỉ quay về |
| Token truy cập | Dạng opaque, 60 phút; kiểm hiệu lực, người còn tồn tại, ứng dụng, lần cấp quyền, tài nguyên và phạm vi |
| Lần cấp quyền | Tối đa 4 giờ; mỗi kết nối mới có mã mới; hạn đề xuất không vượt hạn lần cấp quyền |
| Từ chối quyền | `access_denied`, trả `state` và `iss` tới địa chỉ đã kiểm; không tạo token dùng được |
| Token sai | `401` và `WWW-Authenticate` chỉ tới thông tin tài nguyên; thiếu phạm vi trả `403` theo hợp đồng giao thức |
| Thu hồi token | Dùng endpoint revocation của thư viện, xác thực đúng ứng dụng sở hữu token |
| Ngắt kết nối | Trang quản lý kết nối có phiên người dùng và chống giả mạo; thu hồi cả lần cấp quyền và mọi token liên quan |

Đường dẫn cấp quyền, đổi mã và thu hồi lấy từ metadata đã cấu hình, không để ứng dụng tự đoán `/oauth/*`.
Chọn issuer ở gốc hostname để đường dẫn metadata trên không cần quy tắc chèn thêm đường dẫn tenant.
Nếu thư viện không thể công bố đúng tập tính năng tối thiểu thì bước thử chưa đạt.

Phạm vi hiệu lực là giao của quyền người dùng, phạm vi đã cho phép và trần dữ liệu ứng dụng.
Máy chủ lấy hồ sơ ứng dụng từ cấu hình đăng ký, không từ tham số do ứng dụng tự khai.
Hai phạm vi OAuth không bao gồm xác nhận, duyệt hay ghi trực tiếp.

**Kết luận:** chỉ mở một luồng cấp mã và một tài nguyên, nhưng kiểm đầy đủ ràng buộc giữa chúng.

## 4. Lưu trữ, danh tính và chuyển đổi dữ liệu

Lần cấp quyền ổn định được biểu diễn bằng `AuthorizationRef` có hai dạng: khóa cũ và lần cấp quyền OAuth.
Hai dạng cùng đi qua một bộ kiểm trước khi ghi.
Không tạo khóa `lab_` bí mật phía sau cho từng token OAuth.

| Dữ liệu | Nội dung tối thiểu |
| --- | --- |
| Cấu hình ứng dụng | Mã, tên, địa chỉ quay về, hồ sơ ứng dụng, phạm vi cho phép và trạng thái bật |
| Bí mật lúc chạy | Bí mật hai ứng dụng, khóa ký và bảo vệ cookie của thư viện, khóa mã hóa dữ liệu OAuth; giữ ngoài SQLite và ngoài git |
| Lần cấp quyền Lab | Mã ổn định, mã grant của thư viện, nhân viên, ứng dụng, phạm vi, lúc tạo, hết hạn và thu hồi |
| Mô hình thư viện | Loại mô hình, khóa tra cứu đã băm, nội dung mã hóa, hạn, dấu tiêu thụ và các chỉ mục cần tra theo grant hoặc phiên |
| Lượt kết nối ứng dụng | `state`, PKCE verifier, issuer dự kiến, phiên khởi tạo, hạn và dấu đã dùng; giữ phía máy chủ ứng dụng |
| Đề xuất | Dạng và mã `AuthorizationRef`, người yêu cầu, nội dung, thời hạn và dấu vân tay hiện có |
| Vết | Người, ứng dụng, mã lần cấp quyền, bước và kết quả; không lưu token, mã cấp quyền, verifier hay mật khẩu |

Với bộ lưu thư viện, chỉ băm khóa tra cứu là chưa đủ vì payload có thể chứa token trong `jti`.
Đề xuất mã hóa toàn bộ payload bằng AES-256-GCM, với số ngẫu nhiên mới cho mỗi lần ghi và định danh khóa.
Ràng buộc loại mô hình và khóa tra cứu vào dữ liệu kiểm tính toàn vẹn.
Mất hoặc sai khóa thì từ chối đọc trạng thái, không tự xóa rồi tạo phiên mới thay thế.
Giữ khóa qua lần khởi động lại; bản thử không hứa xoay khóa nóng hay chống người đã chiếm toàn bộ máy.

Thao tác `consume` phải cập nhật có điều kiện và từ chối lượt thứ hai trong giao dịch SQLite ngắn.
Lượt thứ hai phải ném lỗi; không chỉ trả `false`, vì thư viện không dùng giá trị trả về này để chặn.
Lưu dấu đã tiêu thụ đến hết hạn gốc; ghi cập nhật không được xóa dấu hay hồi sinh bản ghi đã thu hồi.
Không giữ giao dịch SQLite xuyên qua `await` của thư viện.
Thử sập sau tiêu thụ mã và trước lưu token: cho phép phải đăng nhập lại, nhưng không cho mã cũ hoạt động lần nữa.

Chuyển `draftedByKeyId` sang cặp dạng và mã tham chiếu bằng một migration có giao dịch.
Mọi đề xuất cũ giữ cùng mã khóa gốc và trạng thái; không tự biến thành lần cấp quyền OAuth.
Các hàng cũ không xác định được nguồn quyền tiếp tục bị chặn như hiện tại.
Giữ danh tính `caller` để luật trần dữ liệu và vết cũ vẫn có cùng ý nghĩa.

Lớp xác thực nhận thêm ngữ cảnh tài nguyên từ bộ định tuyến đã cấu hình.
Cửa MCP cho phép OAuth và khóa cũ; cửa HTTP cũ chỉ nhận khóa cũ ở mốc này.
Token OAuth sai không được thử lại như khóa cũ để đi vòng kiểm tài nguyên.

**Kết luận:** thay nguồn chứng minh quyền bằng một kiểu tham chiếu chung, giữ dữ liệu và hành vi khóa cũ qua migration.

## 5. Hết hạn, thu hồi và hàng đợi ghi

| Tình huống | Hành vi đề xuất |
| --- | --- |
| Token truy cập hết hạn | Chặn lời gọi công cụ mới; người dùng có thể kết nối lại |
| Đề xuất còn hạn, grant còn hiệu lực, token đã hết hạn | Người dùng vẫn xác nhận hoặc duyệt bằng phiên trang riêng |
| Thu hồi một token | Token đó ngừng gọi công cụ; hành vi ngắt cả kết nối phải dùng thao tác thu hồi grant rõ ràng |
| Ngắt kết nối, tắt ứng dụng hoặc grant hết hạn | Chặn gửi đề xuất, duyệt và các lần gửi lệnh mới chưa bắt đầu |
| Kết nối lại sau thu hồi | Tạo grant mới; không phục hồi đề xuất của grant cũ |
| Lệnh đã gửi khi quyền bị thu hồi | Giữ trạng thái và kết quả thực tế; không gọi là hủy thành công |
| Lệnh đã gửi, chưa rõ kết quả | Giữ chứng cứ và cơ chế xử lý theo spec ghi an toàn; không gửi thêm lệnh ghi chỉ để thử lại quyền |

Cổng kiểm người yêu cầu, grant, ứng dụng, phạm vi và luật hiện tại khi bấm Gửi hoặc duyệt.
Hàng đợi kiểm lại cùng nguồn quyền ngay trước mỗi lần phát lệnh ghi mới, kể cả lệnh chưa gửi được nhặt sau khởi động lại.
Quyết định ở thời điểm kiểm không thể rút lại một yêu cầu mạng đã phát đi.
Khi grant đã thu hồi mà một lệnh còn chưa rõ kết quả, dừng gửi lại thao tác ghi; chỉ đối chiếu kết quả nếu bộ tiếp hợp có cách đọc an toàn.
Không sửa kết luận về chống ghi trùng nếu chưa chạy bộ kiểm liên quan.

Thử bằng đồng hồ điều khiển được để kiểm token hết hạn sau 60 phút trong khi đề xuất và grant vẫn còn hạn.
Không bắt người kiểm thử chờ một giờ thật.

**Kết luận:** hết hạn token và thu hồi quyền là hai sự kiện khác nhau; mọi lệnh đã gửi vẫn phải được giải thích trung thực.

## 6. Trình duyệt, HTTPS và trải nghiệm thử

Ứng dụng thử và cổng phải khác hostname, không chỉ khác cổng mạng, để cookie của trang duyệt không tới ứng dụng thử.
Dự kiến dùng hai tên `.localhost` riêng và một chứng chỉ thử có đủ tên; chốt cách phân giải ở bước đầu.
Cổng và ứng dụng chỉ nghe loopback; nếu cần lớp kết thúc HTTPS cục bộ thì không mở ra mạng ngoài.
Mỗi URL, cổng và tài nguyên được cấu hình rõ; bộ định tuyến không tin tùy ý các header chuyển tiếp.

Kiểm thử tự động dùng CA thử trong thư mục tạm và cấu hình tin CA chỉ cho tiến trình Node, trình duyệt thử.
Không tự cài CA vào kho chứng chỉ hệ điều hành, không tắt kiểm chứng chỉ trên máy thật.
Nếu cách tin CA theo tiến trình chưa chạy được, ghi là điểm chặn của bước đầu thay vì đổi toàn bộ nghiệm thu sang HTTP.
Chế độ HTTP nếu có chỉ dành cho thử phát triển, không được tính là bằng chứng đạt mốc HTTPS.

Tên `.localhost` và cấu hình CA trên chỉ dành cho phép thử cục bộ đã kiểm soát.
Để nhận client chạy trong Docker, phải thử từ chính container của client, không lấy kết quả gọi trên máy chủ làm bằng chứng.
Chốt một địa chỉ HTTPS mà cả trình duyệt người dùng lẫn máy chủ client gọi tới được, với cùng issuer và tài nguyên chuẩn.
Nếu cần phân giải tên khác nhau giữa hai môi trường, chứng chỉ vẫn phải khớp hostname công bố.
Chọn mạng Docker chung hoặc địa chỉ máy chủ truy cập được; chỉ đổi hostname không làm dịch vụ nghe loopback thành dịch vụ nhận được từ container.
Nếu cần mở lớp HTTPS ra mạng thử, chỉ mở đúng lớp đó trên giao diện hoặc mạng đã chọn; các hệ thống giả phía sau vẫn giữ ranh giới hiện có.
Client và trình duyệt phải tin chuỗi chứng chỉ qua cấu hình môi trường thử, không bỏ kiểm TLS để lấy kết quả đạt.
Ghi cách dựng mạng và cấp CA vào hướng dẫn chạy lại trước khi công nhận mốc client bên ngoài.

Trang đăng nhập phải ghi rõ Đăng nhập giả lập.
Trang đồng ý hiển thị tên ứng dụng, nhân vật, phạm vi và hai nút Cho phép, Từ chối.
Sau đăng nhập tạo phiên mới; form đăng nhập, đồng ý và ngắt kết nối đều có bảo vệ chống giả mạo.
Không hiển thị token hay bí mật ứng dụng trên trang thành công, URL hoặc lỗi.
Vết mạng trong trình duyệt và ảnh chụp tự động cũng phải được kiểm trước khi lưu làm bằng chứng.

Kiểm màn hình rộng và rộng 390 pixel, thứ tự tab, nhãn ô nhập, vị trí focus và lỗi có thể hiểu được.
Dùng lại màu, chữ, thẻ và trạng thái sáng tối từ [giao diện gateway](../../lab/gateway/src/web/html.ts).

**Kết luận:** nghiệm thu phải đi qua chuyển hướng thật trong trình duyệt với hai phía được tách phiên rõ ràng.

## 7. Các phần việc nối tiếp và phạm vi ghi

Các phần dưới đây đã được chia thành issue dưới [issue cha #175](https://github.com/Park-Hip/agentlize-intern/issues/175).
Chạy nối tiếp vì cùng chạm các file nóng của gateway.
Một phần chỉ bắt đầu khi phần cung cấp giao diện dùng chung đã hoàn tất.

| Phần | Kết quả và cách kiểm | Phạm vi dự kiến |
| --- | --- | --- |
| Thử thư viện, tối đa 1 ngày | Cấp mã, đổi token, hai discovery nhất quán, không refresh, HTTPS trình duyệt, hai lượt đổi mã và tìm bí mật trong DB | Chỉ `scratch/oauth-probe/`; chưa đổi workspace |
| Nền quyền ổn định, 1 tới 2 ngày | Khóa cũ chạy qua `AuthorizationRef`; migration giữ đề xuất cũ; thu hồi chặn các bước ghi đã định nghĩa | Mới `gateway/src/authorization/`; sửa `identity/types.ts`, `call.ts`, `proposals/proposal-store.ts`, các `tools/propose-*.ts`, `writes/authorize.ts`, `writes/outbox.ts`, `web/routes.ts`, `web/approval-routes.ts`, `server.ts` |
| Máy chủ OAuth, 1 tới 2 ngày | Bộ lưu bền, hai ứng dụng đăng ký sẵn, grant, resource, scope và revocation hoạt động | Mới `gateway/src/oauth/`; sửa `app.ts`, `mcp.ts`, `server.ts`, `call.ts`, `lab/package.json`, lockfile qua npm |
| Trang và ứng dụng thử, 1 tới 2 ngày | Hoa kết nối và tra dữ liệu; Nam kết nối nhưng vẫn bị từ chối; ứng dụng không giữ mật khẩu trang | Mới `gateway/src/oauth/web/`, `lab/oauth-demo/`; sửa route OAuth đã có, workspace và script khởi động thử |
| Nghiệm thu và bàn giao, 2 tới 3 ngày | Chạy các tình huống mục 8, ghi số đo, cập nhật hướng dẫn và quyết định kiến trúc | Mới `tests/src/oauth-*.ts`, bộ kiểm trình duyệt và tài liệu kết quả; sửa `scripts/sr-map.json`, các README liên quan và ADR mới |

Các đường dẫn viết gọn trong bảng đều nằm dưới `lab/` nếu không ghi `scratch/`.
Danh sách file chính xác phải được chốt lại ở từng issue sau khi thử thư viện.
Đặc biệt không để hai PR cùng sửa `app.ts`, `server.ts`, `call.ts` hay danh sách xuất của gateway.

Tổng dự trù 6 tới 10 ngày công khi các phần thuận lợi, chưa gồm tích hợp Thổ Thần hay làm lại nếu bước thử không đạt.
Ước lượng này cũng chưa gồm hỗ trợ cách đăng ký mới hoặc cấu hình mạng cho MausBot.
Không cam kết cửa OAuth của Lab sẵn trước ngày 2 cho một phép thử bên ngoài.
Đây là ước lượng công sức, không phải thời gian chạy tự động của agent hay một cam kết lịch.
Tài liệu nghiên cứu không chứng minh giá thành vận hành; ghi số tiến trình, thời gian thêm và tài nguyên dùng ở lần nghiệm thu.

**Kết luận:** phần dùng chung về nguồn quyền phải đi trước OAuth và giao diện, để không có hai cách kiểm quyền cùng tồn tại.

### 7.1. Giao việc cho coding agent

Mỗi issue có một người phụ trách, mốc tuần, phạm vi ghi, điều kiện hoàn thành và cách kiểm chứng.
Nguồn kế hoạch và nghiên cứu được đưa lên GitHub qua [PR #176](https://github.com/Park-Hip/agentlize-intern/pull/176).
Agent đọc nguồn đã liên kết trước khi làm và giữ các thay đổi của mỗi issue trong PR riêng.

| Issue | Kết quả | Cần merge trước |
| --- | --- | --- |
| [#177](https://github.com/Park-Hip/agentlize-intern/issues/177) | Thử thư viện và chốt hợp đồng bằng bằng chứng trong một ngày công | Tài liệu nguồn |
| [#178](https://github.com/Park-Hip/agentlize-intern/issues/178) | Nền tham chiếu quyền ổn định, migration đề xuất và điểm kiểm trước khi ghi | #177 |
| [#179](https://github.com/Park-Hip/agentlize-intern/issues/179) | Bộ lưu mã hóa, tiêu thụ mã và grant bền | #178 |
| [#180](https://github.com/Park-Hip/agentlize-intern/issues/180) | Máy chủ OAuth, discovery và xác thực MCP theo tài nguyên | #179 |
| [#181](https://github.com/Park-Hip/agentlize-intern/issues/181) | Đăng nhập giả và đồng ý kết nối | #180 |
| [#182](https://github.com/Park-Hip/agentlize-intern/issues/182) | Thu hồi và kiểm quyền ở trang duyệt cùng hàng đợi | #181 |
| [#183](https://github.com/Park-Hip/agentlize-intern/issues/183) | Ứng dụng thử HTTPS, nhiều người trong cùng client và hai client độc lập | #182 |
| [#184](https://github.com/Park-Hip/agentlize-intern/issues/184) | Nghiệm thu trình duyệt, tám yêu cầu và báo cáo giới hạn | #183 |
| [#185](https://github.com/Park-Hip/agentlize-intern/issues/185) | Khảo sát cách đăng ký, callback và môi trường client ngoài trong bốn giờ kiểm ban đầu | Tài liệu nguồn; phạm vi tách khỏi #177 |
| [#186](https://github.com/Park-Hip/agentlize-intern/issues/186) | Triển khai đúng một cách đăng ký được chọn bằng bằng chứng | #184 và #185 |
| [#187](https://github.com/Park-Hip/agentlize-intern/issues/187) | Nghiệm thu client ngoài từ Docker qua HTTPS và thu hồi từng người | #186 |

Các mốc tuần là lịch dự kiến trong issue, không phải cam kết Lab sẵn trước ngày 2.
Chỉ #177 và #185 có thể bắt đầu song song sau tài liệu nguồn vì phạm vi ghi không giao nhau.
Chưa bắt đầu triển khai OAuth; trạng thái issue mở không phải bằng chứng tính năng đã đạt.

**Kết luận:** bắt đầu từ hai phép kiểm có giới hạn, rồi đi theo quan hệ phụ thuộc để không viết trùng phần dùng chung.

## 8. Nghiệm thu theo tám yêu cầu hiện có

Các tên yêu cầu lấy từ [PRD](../problem/prd-ai-platform.md#6-yêu-cầu-bắt-buộc), không tạo một bộ tiêu chí song song.

| Yêu cầu | Bằng chứng cần thu |
| --- | --- |
| SR1 (danh tính và một cửa ghi) | Hoa và Nam có token riêng; cùng một client giữ cả hai kết nối, gọi xen kẽ và đồng thời vẫn đúng người; mã người dùng tự khai không thay danh tính |
| SR2 (luật chạy được) | Bỏ lời nhắc trong kịch bản mà luật vẫn chặn; vai và phòng đổi trong danh bạ được áp ở lời gọi sau |
| SR3 (phạm vi quyền) | Chỉ đọc không soạn đề xuất; xin phạm vi chưa đăng ký bị từ chối; caller và trần dữ liệu không nâng qua tham số |
| SR4 (điểm dừng rủi ro) | Đồng ý OAuth không ghi T-12; token không mở phiên duyệt; luồng 30 task vẫn chờ Quang; hết hạn token khác thu hồi grant |
| SR5 (không chắc thì chặn) | Sai secret, PKCE, state, iss, redirect, resource, cookie hoặc dữ liệu lưu đều bị chặn; từ chối đồng ý không để lại quyền dùng được |
| SR6 (không ghi trùng) | Hai lượt đổi cùng mã có tối đa một lần cấp token; sập không hồi sinh mã; các phép thử ghi trùng cũ vẫn đạt |
| SR7 (vết xuyên suốt) | Nối được người, ứng dụng, grant, đề xuất, người duyệt và kết quả; DB và log không lộ token, mã, verifier hay mật khẩu thô |
| SR8 (dùng lại, quyền theo người) | Hai ứng dụng độc lập cùng trần gọi cùng bộ công cụ; cùng người có cùng kết quả quyền; không sửa bộ tiếp hợp nghiệp vụ |

Các phép thử vòng đời phải gồm token hết hạn, thu hồi token, ngắt grant, tắt ứng dụng, khởi động lại và kết nối lại.
Ứng dụng thử phải dùng cùng một `client_id` cho Hoa và Nam, với hai phiên và grant độc lập.
Thử Hoa liên kết trước, Nam liên kết sau, rồi Hoa hỏi lại để bắt lỗi lấy token người liên kết cuối.
Thử thu hồi Nam, kiểm Nam bị chặn trong khi Hoa vẫn gọi được; không đổi sang hai client để tránh bài toán bot dùng chung.
Đây là bằng chứng phía ứng dụng thử của Lab; khả năng MausBot giữ và chọn token theo người phải được kiểm riêng trên MausBot.
Kiểm cả thu hồi trước bấm Gửi, trước duyệt, sau xếp hàng và khi đã phát lệnh nhưng chưa nhận kết quả.
Chạy các lượt đồng thời có điều khiển, không dựa vào độ trễ ngẫu nhiên hay chờ thời gian thật.
Ảnh trình duyệt, kết quả máy chủ và dữ liệu đích phải kể cùng một câu chuyện.

Lệnh dự kiến sau triển khai, hiện chưa tồn tại nếu ghi là mới:

```text
cd lab
npm run lint
npm test
npm run sr
npm run test:oauth-browser     # mới, phải tạo trong phần nghiệm thu
```

Kết quả ghi số lần thử, số lỗi, độ trễ cấp quyền và lời gọi công cụ, số tiến trình thêm và chi phí mô hình bằng 0 nếu không gọi mô hình.
Không tự sinh file số đo theo quy ước commit nếu chưa có lệnh ghi đúng định dạng; dữ liệu thô thử đầu ở `scratch/`.
Sau khi qua ứng dụng thử mới ghi nhận riêng kết quả tương thích Thổ Thần, nếu thực hiện.

**Kết luận:** chỉ công nhận mốc OAuth khi hành trình người dùng và bộ kiểm hồi quy đều đạt, không dựa riêng vào đổi token thành công.

## 9. Điểm quyết định trước khi triển khai

Hai quyết định đã chốt là danh tính giả và Lab cấp token.
Các mặc định đề xuất là ứng dụng thử trước, không tự gia hạn, giữ cửa khóa cũ và dùng `oidc-provider` qua bước thử nhỏ.
Chưa có yêu cầu bắt buộc Thổ Thần ở mốc đầu; kế hoạch hiện dùng ứng dụng thử theo mặc định đề xuất.
Nếu người dùng chọn Thổ Thần, cập nhật kế hoạch theo phụ thuộc thực tế trước khi bắt đầu mã chạy.

Bước thử thư viện chỉ đạt khi chứng minh cấu hình tối thiểu, HTTPS, chống dùng lại mã, lưu bí mật đúng và khởi động lại an toàn.
Ngày 28/11/2026, phép thử trong `scratch/oauth-probe/` đã đạt 47/47 mục kiểm; quyết định dùng `oidc-provider` 9.15.1 được ghi tại [ADR-0011](../../docs/adr/adr-0011-lab-oauth-authorization.md).
Hai ràng buộc triển khai đi kèm: không ghi đè `issueRefreshToken`, và trang đồng ý không đặt `form-action 'self'` khi ứng dụng ở origin khác.
Nếu không đạt trong một ngày công, ghi điều không đạt và đối chiếu lại ba phương án trong nghiên cứu.
Không tự chuyển sang tự viết toàn bộ giao thức hay mở rộng sang đăng nhập công ty.

Người dùng có thể góp ý phạm vi và hành trình trước khi triển khai.
Chưa cần cung cấp tài khoản công ty, bí mật thật, máy chủ công khai hay ngân sách mô hình cho kế hoạch này.

**Kết luận:** mốc ứng dụng thử vẫn hợp lệ; nhận client bên ngoài cần thêm quyết định đăng ký, đường mạng và bằng chứng dưới đây.

### 9.1. Client bên ngoài đăng ký thế nào

Đăng ký trước (pre-registration) là Lab khai mã ứng dụng và địa chỉ quay về trước khi kết nối.
Tài liệu định danh ứng dụng (Client ID Metadata Document) là bản JSON ở URL HTTPS dùng làm `client_id`, khai địa chỉ quay về và cách xác thực.
Đăng ký động (Dynamic Client Registration) là API nhận yêu cầu tạo client mới lúc kết nối.
MCP `2025-11-25` khuyến nghị hỗ trợ tài liệu định danh ứng dụng; đăng ký động là tùy chọn, theo [nghiên cứu](../research/oauth-authorization.md#31-đăng-ký-client-bên-ngoài).

| Điều kiểm trên client và đúng bản cài | Quyết định cho Lab | Điều kiện đạt |
| --- | --- | --- |
| Nhập được mã ứng dụng, cách xác thực và callback cố định | Thêm client đăng ký trước ngoài hai client thử | Kiểm metadata, redirect, đổi mã và gọi MCP từ chính client đó |
| Dùng URL tài liệu định danh, không có đường nhập thông tin đăng ký trước phù hợp | Thử hỗ trợ Client ID Metadata Documents trong phần việc riêng | Kiểm cấu trúc, URL định danh khớp, danh sách callback, cách xác thực và giới hạn tải tài liệu |
| Chỉ dùng endpoint đăng ký động | Cân nhắc DCR trong phần việc riêng hoặc kết luận chưa tương thích | Không công bố endpoint đăng ký trước khi triển khai và kiểm hạn chế đăng ký |
| Chưa biết cách đăng ký hoặc không hỗ trợ cách nào hai bên cùng có | Giữ trạng thái chưa nối được | Thu ảnh cấu hình hoặc hành vi mạng; không đoán khả năng từ việc có nhãn OAuth |

Đối với MausBot, việc đầu tiên là kiểm có nhập được thông tin client và callback nào nó thực sự gửi.
Chỉ cấp client confidential khi bản cài giữ được bí mật ở máy chủ và hỗ trợ phương thức xác thực đã chọn.
Nếu cần public client, phải quyết định và thử riêng PKCE cùng hồ sơ dữ liệu phù hợp; mã client công khai không xác nhận độ tin cậy của nơi chạy.
Việc tải tài liệu định danh cần chặn truy cập địa chỉ nội bộ không được phép, giới hạn chuyển hướng và kích thước; không coi tài liệu đó là bằng chứng người dùng.

Mặc định hiện tại vẫn tắt DCR và không công bố `registration_endpoint`.
Chưa công bố `client_id_metadata_document_supported` cho tới khi nhánh tương ứng được triển khai và kiểm.
Đây là giới hạn tương thích được ghi rõ, không phải kết luận rằng đăng ký trước đáp ứng mọi client MCP.
Thêm client đăng ký trước là thay đổi cấu hình chỉ khi client thực sự hỗ trợ cách đó; hai cách còn lại phải cập nhật phạm vi và ước lượng.

**Kết luận:** chốt cách đăng ký bằng bằng chứng từ client cụ thể trước khi nhận việc tích hợp.

### 9.2. Mốc chuyển sang dùng Lab từ một gateway giả

Một phép thử bên ngoài cần bắt đầu sớm có thể dùng gateway giả độc lập, rồi chuyển sang Lab sau nghiệm thu.
Kết quả trên gateway giả chỉ chứng minh hành vi với bản giả, không được ghi thành kết quả của Lab.

Lab sẵn cho việc chuyển khi đủ các bằng chứng:

- Bộ nghiệm thu ứng dụng thử và kiểm hồi quy của Lab đạt.
- Client thật hoàn tất một cách đăng ký ở mục 9.1; cả hai metadata chỉ đúng issuer và endpoint.
- Container client và trình duyệt đều gọi HTTPS, tin CA và nhận đúng địa chỉ tài nguyên.
- Một client giữ riêng token Hoa và Nam; gọi xen kẽ, đồng thời và thu hồi Nam không ảnh hưởng Hoa.
- Các công cụ và nguồn giả của Lab đáp ứng hành vi phép thử; nếu khác tên hoặc cấu trúc thì chốt ánh xạ trước khi chấm.

**Kết luận:** chuyển theo bằng chứng tương thích, không chuyển theo một ngày lịch hoặc chỉ vì Lab đổi được token.
