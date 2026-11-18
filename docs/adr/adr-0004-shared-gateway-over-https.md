# ADR-0004: Cổng chạy ở máy chủ chung, Thổ Thần nối qua HTTPS

Ngày: 2026-11-17. Trạng thái: đã chấp nhận.

Quyết định 2 trong [spec bản thử, mục 11](../../rd/design/mvp-spec.md#11-cần-chốt-trước-khi-dựng).

## Đọc nhanh

- Vấn đề: cổng của Lab chạy ở đâu, và Thổ Thần nối vào bằng đường nào, để người dùng ở web hay ở desktop đều dùng được.
- Quyết định: cổng chạy ở một máy chủ chung; Thổ Thần web và desktop cùng nối vào một địa chỉ web `/mcp` qua HTTPS.
  Chương trình nối chạy trên máy từng người (stdio) không làm nữa.
- Lý do: phép đo cho thấy chat web và chat desktop đều gọi công cụ từ máy chủ của Thổ Thần, không từ máy người dùng.
  Một địa chỉ phục vụ cả hai, và không phải cài gì trên từng máy.
  Người duyệt như anh Quang cũng phải thấy đề xuất của chị Hoa, nên đề xuất phải nằm ở một nơi chung.
- Giá phải trả: Lab cần một địa chỉ công khai để nghiệm thu.
  Trước mắt dùng đường hầm tạm (tunnel) có hẹn giờ tắt cho từng phiên; khi Kevin cho một máy chủ thật thì chuyển sang đó.
- Xem lại khi Kevin trả lời câu về thiết bị (U1) và địa chỉ công khai (U4).

## 1. Bối cảnh

Ví dụ xuyên suốt: chị Hoa nhờ AI chuyển T-12 sang anh Minh; anh Quang duyệt việc chuyển 30 task của chị Lan ([spec, mục 2](../../rd/design/mvp-spec.md#2-phạm-vi)).
Câu hỏi của ADR này: chị Hoa và anh Quang mở Thổ Thần ở máy của họ, vậy cổng đứng ở máy nào?

Những gì đã đo, ngày 2026-11-17, qua địa chỉ HTTPS công khai ([kịch bản đo, mục 4.8](../../rd/appota/tho-than-mcp-probe.md#48-kết-quả-đo-qua-https-công-khai-ngày-2026-11-17-s1-s6)):

| Điều đã đo | Dòng log | Độ tin cậy |
| --- | --- | --- |
| Chat web gọi `whoami` qua HTTPS; request tới từ máy chủ Thổ Thần ở Singapore, không từ máy người dùng (S3) | `log-20261117-171748-473.jsonl:139` | Cao |
| Chat desktop với cùng skill HTTP cũng tới từ máy chủ Thổ Thần, không gọi thẳng từ máy (S4) | `log-20261117-171748-473.jsonl:119` | Cao |
| Máy người dùng có `cf-ipcountry: VN`, máy chủ Thổ Thần có `SG`; hai nguồn tách bạch (S2) | `log-20261117-130339-240.jsonl:4`, `:17` | Cao |
| Form thêm skill HTTP chỉ có "No auth" và "API Key"; khoá do người thêm skill dán vào, tới được server (S1) | `log-20261117-152301-143.jsonl:9`, `:25` | Cao |
| Mỗi lời gọi trong chat mang bốn header do máy chủ Thổ Thần gắn, trong đó `x-user-id` dạng `user_` cộng 24 ký tự (S3) | `log-20261117-171748-473.jsonl:139` | Trung bình: một tài khoản, một skill |
| Qua stdio, server chỉ thấy tên ứng dụng, không thấy tài khoản (P2) | `log-20261116-203102-671.jsonl:4` | Cao |
| `fake_write` chạy ngay, không hộp duyệt; link `echo_link` bấm được và mở từ máy người dùng (S6) | `log-20261117-171748-473.jsonl:158`, `:169`, `:180`, `:276` | Cao |
| Thổ Thần cắt lời gọi sau 60 giây khi nối qua stdio (P4) | `log-20261116-204645-611.jsonl:11-13`, `log-20261116-205049-979.jsonl:11-13` | Cao cho stdio; chưa đo qua HTTPS |
| Ba trong sáu phiên tunnel chạy quá 60 phút vì không hẹn giờ tắt (phiên 1, 2 và 4) | bảng sáu phiên ở [mục 4.8](../../rd/appota/tho-than-mcp-probe.md#48-kết-quả-đo-qua-https-công-khai-ngày-2026-11-17-s1-s6) | Cao |

Log gốc của phép đo không nằm trong repo (thư mục `scratch/` bị bỏ qua trong git); số dòng ở đây lấy từ bảng ở kịch bản đo, như [ADR-0005](adr-0005-requester-identity.md#4-bằng-chứng-và-cách-kiểm-lại) đã làm.

Những ràng buộc từ chính thiết kế của Lab:

- Người duyệt phải khác người yêu cầu, và lời duyệt dùng một lần ([ADR-0002, mục 3](adr-0002-safe-read-and-write.md#3-quyết-định-về-ghi), điểm 3).
- Mọi trạng thái nằm ở cổng, không nằm ở chương trình nối ([spec, mục 3](../../rd/design/mvp-spec.md#3-thổ-thần-buộc-thiết-kế-phải-theo-những-gì)).
- Khoá riêng từng người, kiểm ở cổng, thu hồi được ([ADR-0005](adr-0005-requester-identity.md)).
- Cổng chỉ nghe ở `127.0.0.1` cho tới khi có ADR về nơi chạy ([ADR-0003, mục 2](adr-0003-technology-stack.md#2-quyết-định)); ADR này là ADR đó.

**Kết luận:** lời gọi trong chat, ở web lẫn desktop, đều đi qua máy chủ Thổ Thần; câu hỏi thật là cổng nằm ở đâu để máy chủ đó, và người duyệt, tới được.

## 2. Phương án đã xét

- **(a) Chương trình nối trên máy người dùng, cổng chạy cục bộ.**
  Thổ Thần desktop mở chương trình nối (stdio, mỗi lần gọi một tiến trình); chương trình nối gọi cổng chạy trên chính máy đó.
- **(b) Cổng ở máy chủ chung.**
  Thổ Thần web và desktop cùng gọi `https://<địa chỉ>/mcp`, giao thức Streamable HTTP (MCP qua HTTP, một request cho mỗi lời gọi).
- **(c) Cả hai.**
  Stdio cho desktop, `/mcp` cho web.
  Có hai cách hiểu: desktop dùng một cổng cục bộ riêng, hoặc chương trình nối gọi chính cổng chung.

| Tiêu chí | (a) stdio, cổng cục bộ | (b) cổng chung, `/mcp` | (c) cả hai |
| --- | --- | --- | --- |
| Thổ Thần web dùng được | Không: web gọi từ máy chủ Thổ Thần, không tới `localhost` (S2, S3) | Có (S3) | Có |
| Thổ Thần desktop dùng được | Có | Có (S4) | Có |
| Anh Quang thấy đề xuất của chị Hoa | Không, nếu hai người ở hai máy: mỗi máy một cổng, một file dữ liệu, một bảng khoá | Có: một nơi giữ đề xuất, khoá và vết | Chỉ khi cả hai đường trỏ về cùng một cổng |
| Cài trên mỗi máy | Node 22, mã đã build, đường dẫn repo, khối JSON có khoá ([spec, mục 7](../../rd/design/mvp-spec.md#7-cài-vào-thổ-thần)) | Không cài gì; thêm một skill với địa chỉ và khoá (S1) | Cả hai cách cài |
| Danh tính qua header của Thổ Thần | Không có: stdio không mang header (P2) | Có để dành cho lớp thứ hai của ADR-0005 (S3) | Chỉ ở `/mcp` |
| Cần địa chỉ công khai | Không | Có; tunnel tạm hoặc máy chủ thật | Có |
| Cổng ra Internet, khoá lộ nguy hơn | Không | Có | Có |
| Số đường phải giữ và phải thử | Một | Một | Hai |

**(a)** chạy được với đúng một người dùng trên một máy, và vì vậy là kế hoạch đầu của Lab: một tài khoản Thổ Thần, đổi nhân vật bằng cách đổi khoá.
Nó thua ở ba chỗ: không có web, mỗi máy giữ một bản trạng thái riêng nên người duyệt khác máy không thấy đề xuất, và phải cài trên từng máy.

**(b)** trả giá bằng một địa chỉ công khai.
Đổi lại, một đường phục vụ cả web lẫn desktop, và đề xuất, khoá, vết nằm ở một nơi.

**(c)** thua cả hai cách hiểu.
Nếu desktop dùng cổng cục bộ riêng thì có hai nơi giữ trạng thái và hai bộ khoá.
Nếu chương trình nối gọi cổng chung thì nó chỉ là đường vòng đi tới đúng chỗ mà `/mcp` đi thẳng, vì desktop gọi `/mcp` qua máy chủ Thổ Thần được (S4).
Cách hiểu sau còn buộc khoá của chương trình nối đi qua Internet tới `/v1/tools`, và [ADR-0005, mục 6](adr-0005-requester-identity.md#6-xem-lại-khi) đã ghi cách này buộc phải giới hạn kênh của khoá.

Điều chưa đo: thời gian chờ 60 giây mới đo qua stdio, chưa đo qua HTTPS.
Con số khớp với mức chờ mặc định của SDK MCP, nhưng chưa xác nhận trong mã LobeHub ([kịch bản đo, mục 7.4](../../rd/appota/tho-than-mcp-probe.md#74-bảng-kết-quả-p4-thử-lại-và-thời-gian-chờ)).
Vì vậy con số không phân biệt ba phương án, và ADR này không dùng nó làm lý do.

**Kết luận:** (b) là phương án duy nhất vừa phục vụ web và desktop bằng một đường, vừa cho người duyệt thấy đề xuất; giá của nó là một địa chỉ công khai.

## 3. Quyết định

Chọn (b): cổng ở một máy chủ chung, Thổ Thần web và desktop gọi `/mcp` qua HTTPS.

1. **Một cổng, một nơi giữ trạng thái.**
   Một tiến trình cổng, một bảng khoá, một sổ vết, một nơi giữ đề xuất.
   Hai hệ thống giả vẫn là hai dịch vụ riêng, chỉ nghe ở `127.0.0.1` của máy chạy cổng ([spec, mục 4.2](../../rd/design/mvp-spec.md#42-thành-phần)).
2. **Người dùng thêm một skill HTTP.**
   Địa chỉ `https://<địa chỉ>/mcp`, kiểu xác thực "API Key", dán khoá `lab_` của nhân vật ([ADR-0005, mục 3.1](adr-0005-requester-identity.md#31-khoá-riêng-từng-người-là-danh-tính-chính)).
   Không cài chương trình nào trên máy người dùng.
3. **`/mcp` không giữ trạng thái phiên.**
   Thổ Thần gửi kèm một mã phiên MCP (`mcp-session-id`, S3), nhưng cổng không dựa vào nó; mỗi lời gọi tự mang đủ khoá và đủ dữ liệu, mọi trạng thái nằm trong bảng của cổng.
4. **Cổng vẫn giữ `POST /v1/tools/<tên>`** cho trợ lý gọi hàm của Lab, nơi gọi thứ hai của SR8 (dùng lại, quyền theo người).
   Hai cửa dùng chung một danh mục tool và một bộ luật.
5. **Chương trình nối stdio không làm.**
   Issue #7 đóng ở trạng thái không làm; thư mục `lab/mcp-adapter` chỉ là bộ khung rỗng và bỏ đi cùng PR dựng `/mcp` (#15).
6. **Hai cách có địa chỉ công khai để nghiệm thu mốc 1:**

| Cách | Khi nào dùng | Quy trình | Giới hạn |
| --- | --- | --- | --- |
| Đường hầm tạm (tunnel), có hẹn giờ tắt cho từng phiên | Mặc định, bắt đầu ngay, không chờ ai | Mở `cloudflared tunnel --url http://127.0.0.1:8790`; đặt hẹn giờ tắt 45 phút ngay lúc mở; sửa địa chỉ của skill cho khớp phiên; hết phiên thì tắt tunnel, trả skill về trạng thái không xác thực, rồi chạy `npm run seed-keys -- --rotate` để khoá đã đi qua địa chỉ công khai bị thu hồi | Địa chỉ có thể đổi giữa các phiên; ba trong sáu phiên đã đo vượt 60 phút nên hẹn giờ là bắt buộc; cổng vẫn chỉ nghe ở `127.0.0.1`, tunnel là thứ mở ra ngoài |
| Máy chủ thật | Khi Kevin cho một máy (ví dụ trên hạ tầng Kdata) và địa chỉ lâu dài ([system-map, U4](../../rd/design/system-map.md#61-chỉ-người-trong-công-ty-trả-lời-được)) | Việc mở ra ngoài, TLS và nơi chạy nằm ở một issue riêng | Chờ câu trả lời của Kevin (#18); không chặn mốc 1 |

7. **Quy tắc cho mọi địa chỉ công khai.**
   Chỉ dữ liệu giả.
   Cổng không lưu email trong header `x-user-email`, và che `x-user-id` như che khoá khi ghi vết ([ADR-0005, mục 3.4](adr-0005-requester-identity.md#34-những-điều-cổng-không-bao-giờ-làm)).
   Khi mở ra ngoài, chỉ `/mcp` và các trang xác nhận, duyệt phải tới được từ Internet; `/health`, `/admin/*` và `/v1/tools` thì không.

**Kết luận:** một địa chỉ, một cổng, một skill HTTP cho mỗi người; Lab nghiệm thu bằng tunnel tạm và chuyển sang máy chủ thật khi có.

## 4. Hệ quả

- Mốc 1 nghiệm thu qua `/mcp` ở cả Thổ Thần web lẫn desktop, nên kịch bản D (tra cứu có lọc) chạy trên hai nơi gọi bằng cùng một cấu hình.
- Mỗi phiên nghiệm thu thêm các bước mở tunnel, sửa địa chỉ skill và xoay khoá; số bước này tính vào M5 (độ phức tạp vận hành).
- Cổng nằm trên Internet nên khoá bị lộ nguy hơn khi nó chỉ nghe ở `127.0.0.1`; khoá vẫn không phải đăng nhập, và báo cáo phải nói rõ ([ADR-0005, mục 5](adr-0005-requester-identity.md#5-hệ-quả)).
- Phép thử nghiệm thu đổi phần "client giả Thổ Thần" của [ADR-0003, mục 2](adr-0003-technology-stack.md#2-quyết-định): từ mở tiến trình con chạy chương trình nối, thành một client HTTP mở kết nối mới cho mỗi lời gọi và cắt ở 60 giây.
- M1 (thời gian) đo lời gọi qua `/mcp`; không còn phần thời gian mở tiến trình mới.
- Chưa đo: thời gian chờ 60 giây và độ trễ qua HTTPS.
  Mốc 1 chạy tool `slow` của probe qua cùng đường và ghi kết quả vào `rd/`; nếu mốc cắt khác 60 giây thì sửa thời gian chờ trong spec, không đổi vị trí của cổng.
- Việc theo sau, mở thành issue riêng:
  - Mở cổng ra ngoài: TLS, nơi chạy, chặn đường dẫn không được ra, giới hạn tốc độ, hẹn giờ tắt tunnel.
  - Chuyển module lưu trữ sang Postgres theo [ADR-0003, mục 5](adr-0003-technology-stack.md#5-xem-lại-khi); điều kiện kích hoạt ở đó là cổng phải chạy nhiều bản cùng lúc, nên issue nêu rõ một tiến trình với SQLite còn đủ hay không.
- Sửa issue #10 và #15 để mốc 1 nghiệm thu qua `/mcp`, và đóng #7 ở trạng thái không làm.
- [Spec bản thử](../../rd/design/mvp-spec.md) sửa theo: sơ đồ, cách cài, mục 11.

**Kết luận:** quyết định này bỏ một thành phần (chương trình nối) và thêm một việc vận hành (địa chỉ công khai); cả hai đều có issue và có số đo.

## 5. Xem lại khi

| Nếu điều này xảy ra | Thì làm gì |
| --- | --- |
| U4 (địa chỉ công khai): Kevin không cho mở địa chỉ công khai nào, kể cả tạm | Quay về (a): làm #7, cổng chạy trên máy Lab, nghiệm thu mốc 1 trên desktop với một tài khoản; Thổ Thần web và lớp header của ADR-0005 không kiểm được, và báo cáo phải ghi rõ |
| U4: Kevin cho một máy chủ chạy lâu dài | Bỏ tunnel; làm issue mở ngoài trên máy đó; chạy lại S3 và S4 qua địa chỉ cố định; xét Postgres |
| U4: Kevin chỉ cho tunnel tạm | Giữ quy trình ở mục 3; ghi số phiên và số bước vào M5 |
| U1 (thiết bị): người dùng thật ở web hoặc điện thoại | Không đổi quyết định; mốc 2 đo trên web trước, và chạy V7 (điện thoại) ở [system-map, mục 6.2](../../rd/design/system-map.md#62-lab-tự-kiểm-được) |
| U1: người dùng thật chỉ ở desktop và Kevin không cho địa chỉ công khai | Như dòng đầu: quay về (a) |
| Thổ Thần desktop đổi và gọi thẳng từ máy người dùng thay vì qua máy chủ Thổ Thần | Chạy lại S4; nếu đúng, (a) hoặc (c) có lại lý do |
| Phép đo `slow` qua HTTPS cho mốc cắt khác 60 giây, hoặc p95 của một lời gọi vượt mức dùng được (M1) | Sửa thời gian chờ trong spec; không đổi vị trí của cổng |
| Máy chủ Thổ Thần ký header danh tính hoặc gọi ra từ dải IP cố định | Thêm lọc nguồn ở lớp mở ngoài; xem lại [ADR-0005](adr-0005-requester-identity.md#6-xem-lại-khi) |
| Cổng phải chạy nhiều bản cùng lúc | Chuyển lưu trữ sang Postgres ([ADR-0003, mục 5](adr-0003-technology-stack.md#5-xem-lại-khi)) |

**Kết luận:** hai câu của Kevin, U1 và U4, quyết định chọn lại có cần không; cả hai đều trả lời được bằng một phép đo đã có cách chạy.
