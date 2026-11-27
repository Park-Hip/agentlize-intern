# Kế hoạch cập nhật hệ thống giả lập và phép thử

Ngày: 2026-11-27. Trạng thái: bước 0, U2, U4 và U5 đã xong; U1 đang đo (#144); U3 chờ #146 và ADR-0009.

## Đọc nhanh

- Hai hệ thống giả của Lab dễ tính hơn hệ thống thật ở bốn chỗ, nên các phép thử đang đo cổng trong điều kiện thuận lợi hơn thực tế.
- Kế hoạch có năm cập nhật, cộng một bước đọc tài liệu trước khi làm.
- Ba cập nhật đầu có giá trị cao nhất: đo thêm cách "gửi một lần, không gửi lại"; thêm một hệ thống đơn nghỉ phép giả; cho cổng ghi bằng quyền của chính người yêu cầu.
- Mục tiêu là giả lập đủ để lỗi thật xuất hiện, không phải chép hệ thống thật; mỗi hành vi giả lập phải có nguồn công khai.
- Spec ghi an toàn đã nhận cánh "gửi một lần" và phép đo ghi đè; mỗi cập nhật còn lại thành một issue.

## 1. Vì sao cần cập nhật

[Spec ghi an toàn](write-safety-spec.md) đo xem cổng có còn không ghi trùng, không mất lệnh khi hệ thống đích không chắc chắn hay không.
Các hồ sơ hệ thống đích ở [kế hoạch đo Q3, mục 3](q3-measurement-plan.md#3-hệ-thống-đích-giả-khó-tính) đã thêm những thói xấu về lọc trùng và kết quả muộn.
Rà lại cả hai hệ thống giả, vẫn còn bốn giả định dễ tính mà hệ thống thật không bảo đảm:

| Giả định hôm nay | Hệ thống thật | Hậu quả cho phép thử |
| --- | --- | --- |
| Cổng luôn gửi lại lệnh chưa rõ kết quả | Nhiều cổng chỉ gửi một lần khi người duyệt bấm, rồi chờ có giới hạn | Q3 không so được "gửi lại" với "không gửi lại", nên không chứng minh được gửi lại đáng làm |
| Mọi lệnh ghi là sửa một bản ghi đã có, có số phiên bản | Nhân viên còn tạo mới (đơn nghỉ phép, phiếu, task), và bản ghi mới không có phiên bản để so | P4 (hai đề xuất cho cùng một việc) không gây hại trong Lab, nên không đo được |
| Cổng ghi bằng khoá dịch vụ của chính nó | Cổng thường ghi bằng token của người yêu cầu; token hết hạn, được đổi mới, và bị thu hồi khi người đó nghỉ việc | P12 (thẩm quyền đổi giữa duyệt và ghi) chỉ thử được bằng cách sửa file luật, không thử được mất token |
| Hệ thống đích luôn kiểm số phiên bản | Bảng tính và bảng dữ liệu thường cho ghi đè không điều kiện | Không đo được lần ghi đè mất thay đổi của người khác |

Một khác biệt nữa không phải là giả định sai, nhưng làm phép thử về duyệt hẹp lại.
Người duyệt luôn là trưởng phòng của người yêu cầu, trong khi nhiều nơi để chủ dữ liệu duyệt.

**Kết luận:** hệ thống giả hiện chỉ tái hiện được một phần những gì có thể hỏng; bốn giả định trên phải được bỏ trước khi kết quả Q3 đáng tin.

## 2. Nguyên tắc

1. **Giả lập đủ, không giống hệt.** Mỗi cập nhật chỉ thêm đúng hành vi làm lộ ra một vấn đề trong [danh mục vấn đề](../problem/open-problems.md).
2. **Hành vi có nguồn.** Mỗi hành vi giả lập trỏ về tài liệu công khai của hệ thống thật cùng loại; hành vi không có nguồn ghi rõ là giả định.
3. **Không làm hỏng số đã đo.** Hồ sơ đích `standard` giữ nguyên, nên `q1-outbox` vẫn phải cho 300/300 và `npm run sr` vẫn xanh.
4. **Mỗi cập nhật thêm một thứ đo được:** một cánh đo, một hồ sơ đích, hoặc một bộ đếm; không thêm tính năng cho người dùng cuối.
5. **Bật tắt được.** Hành vi mới bật bằng cấu hình khi khởi động, để mỗi phép đo chọn đúng điều kiện nó cần.

**Kết luận:** một cập nhật không làm lộ ra vấn đề nào trong danh mục thì không làm.

## 3. Bước 0: đọc tài liệu trước khi làm

Ba cập nhật dựa trên hành vi của hệ thống thật mà Lab chưa kiểm trực tiếp.
Bước này đọc tài liệu và ghi kết quả vào [danh mục vấn đề](../problem/open-problems.md), kèm script kiểm câu trích trong `rd/checks/`.

| Câu hỏi | Nguồn cần đọc | Cập nhật phụ thuộc |
| --- | --- | --- |
| Lark Base có cách ghi có điều kiện (số phiên bản, thời điểm sửa cuối) hay chỉ ghi đè? Có mã chống ghi trùng khi tạo bản ghi không? | Open API của Lark Base | U4 |
| Token người dùng Lark sống bao lâu, đổi mới thế nào, và token làm mới cũ còn dùng được không? | Tài liệu xác thực của Lark ([lấy token](https://open.larkoffice.com/document/authentication-management/access-token/get-user-access-token.md), [làm mới token](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/authen-v1/oidc-refresh_access_token/create.md)) | U3 |
| Đơn nghỉ phép của ACheckin gồm những trường nào và đi qua những trạng thái nào? | Trang giới thiệu công khai của ACheckin; nếu không có, ghi là giả định | U2 |

**Kết luận:** bước 0 giới hạn nửa ngày; câu nào không có nguồn thì cập nhật tương ứng dùng giả định được ghi rõ, không dừng lại.

## 4. Năm cập nhật

### 4.1. U1. Cánh đo "gửi một lần, không gửi lại"

**Làm gì.**
Thêm cánh thứ ba cho phép đo `q3-targets` ở [kế hoạch đo Q3, mục 4.1](q3-measurement-plan.md#41-phép-đo-q3-cho-hàng-đợi).
Ở cánh này, hàng đợi gửi mỗi mục đúng một lần, chờ tối đa 20 giây, rồi đánh dấu thất bại nếu không có câu trả lời.
Hai cánh đã có giữ nguyên: gửi lại mù (cách cũ) và gửi lại theo bản khai năng lực (cách mới).

**Vì sao.**

- Không gửi lại là cách đơn giản nhất để giữ lời hứa "tối đa một lần" của SR6 (không ghi trùng), vì không có lần gửi thứ hai thì không thể ghi trùng.
- Cách này phổ biến ở những cổng thực thi ngay khi người duyệt bấm, không có hàng đợi chạy nền.
  Các bộ máy chạy bền như Temporal hay Inngest chỉ hứa "ít nhất một lần" với tác động ra ngoài ([tổng hợp](https://cadenya.com/other-content/retries-and-idempotency-for-agent-tool-calls)), nên không dùng chúng thì "một lần rồi thôi" là lựa chọn mặc định.
- Thiếu cánh này, Q3 chỉ so hai cách cùng gửi lại, nên không trả lời được câu "gửi lại có đáng không".
- Giá của việc không gửi lại không hiện trong các bộ đếm hôm nay: lệnh đã ghi nhưng bị báo thất bại, và người dùng tạo lại một lệnh đã chạy.

**Vấn đề kiểm:** P1 (không biết lệnh đã chạy chưa), P4 (hai đề xuất cho cùng một việc), vì người dùng thấy "thất bại" sẽ nhờ trợ lý làm lại.

**Thêm hai bộ đếm** vào bảng ở [kế hoạch đo Q3, mục 4.2](q3-measurement-plan.md#42-bộ-đếm-và-ngưỡng):

- Báo thất bại dù đã ghi: cổng báo thất bại, bộ đếm phía đích bằng 1.
- Kẹt ở trạng thái đang chạy: sau 10 phút mục vẫn ở "đã gửi, chưa rõ kết quả".

**Mã chạm tới:** một tuỳ chọn của hàng đợi ([`outbox.ts`](../../lab/gateway/src/writes/outbox.ts)) chỉ phép đo dùng, và kịch bản đo trong `lab/measure/src/scenarios/`.

**Xong khi:** `q3-targets` chạy đủ ba cánh trên mọi hồ sơ, và file kết quả có hai bộ đếm mới.

**Rủi ro:** một tuỳ chọn chỉ để đo nằm trong mã cổng; giữ nó ngoài cấu hình mà người vận hành thấy.

### 4.2. U2. Hệ thống đơn nghỉ phép giả

**Làm gì.**
Thêm hệ thống giả thứ ba, đơn nghỉ phép, theo bốn bước của [ADR-0007, mục 3.6](../../docs/adr/adr-0007-system-adapters-and-change-sets.md#36-thêm-một-hệ-thống-nghiệp-vụ).
Hệ thống có ba hành vi:

- Tạo đơn: loại nghỉ, từ ngày, tới ngày, lý do; không có số phiên bản.
- Đơn mới ở trạng thái "chờ quản lý duyệt", rồi sang "đã duyệt" hoặc "bị từ chối" sau một khoảng cấu hình được, mô phỏng quy trình duyệt riêng của hệ thống nguồn.
- Tra đơn theo mã đơn, và theo người cùng ngày nghỉ.

Lọc trùng theo mã khi tạo đơn bật tắt được, để chạy trên cả hồ sơ `standard` và `no-dedup`.

Cập nhật này thay việc thêm "tạo task" vào danh sách task giả ở [các phương án thiết kế, mục 10](write-safety-options.md#10-chặn-hai-đề-xuất-cho-cùng-một-việc).

**Vì sao.**

- Hai hệ thống giả hôm nay chỉ có thao tác sửa bản ghi có phiên bản.
  Thao tác tạo mới là chỗ số phiên bản không bảo vệ được, nên là nơi P4 gây hại thật.
- Đơn nghỉ phép có quy trình duyệt riêng ở hệ thống nguồn, nên "đã tạo đơn" khác "đã được nghỉ".
  Đây là P3 (nhận chưa phải xong) xuất hiện tự nhiên, không phải một hồ sơ dựng tay.
- ACheckin, sản phẩm quản trị nhân sự của Appota, có chấm công, đơn nghỉ phép và làm thêm giờ cho hơn 3.500 doanh nghiệp ([Báo Đầu tư](https://baodautu.vn/appota-tan-cong-vao-thi-truong-chuyen-doi-so-d148231.html), [Doanh nhân Plus](https://doanhnhanplus.vn/giai-phap-quan-tri-nhan-su-acheckin-duoc-nhan-danh-hieu-sao-khue-2021-549723.html)).
  "Xin nghỉ chiều mai" là việc nhân viên dễ nhờ trợ lý nhất, nên hợp làm ví dụ.
- ADR-0007 đã lấy đúng đơn nghỉ phép làm ví dụ hệ thống thứ ba.
  Làm thật lần này kiểm lại lời hứa "thêm hệ thống không sửa lõi" với một thao tác mà hợp đồng ghi hiện tại chưa có, nên cũng là bằng chứng cho điểm 4 của ADR-0009.

**Ví dụ.**
Anh Minh nhờ trợ lý "xin nghỉ chiều thứ Sáu"; mạng chập chờn, anh hỏi lại.
Không có khoá ý định, anh Minh có hai đơn cùng chờ quản lý duyệt.
Trợ lý báo "đã xin nghỉ" ngay khi tạo đơn, trong khi đơn còn chờ duyệt.

**Vấn đề kiểm:** P3, P4, và lời hứa mở rộng của ADR-0007.

**Mã chạm tới:** gói mới `lab/fake-leave/`, bộ tiếp hợp mới trong `lab/gateway/src/adapters/`, file luật gốc.
Thêm một dịch vụ chạm các file nóng: danh sách dịch vụ và cổng mạng trong [`ports.ts`](../../lab/shared/src/ports.ts), danh sách workspace và lệnh dựng trong `lab/package.json`, lệnh khởi động, cụm dịch vụ của lệnh đo, phép thử khói, và dòng trạng thái của `lab/README.md`.
Vì vậy U2 đi một mình, không chạy song song với PR nào khác chạm các file đó.

**Xong khi:** trợ lý soạn được đề xuất xin nghỉ qua cổng; phép thử chứng minh `proposals/`, `writes/` và `web/` không phải sửa cho riêng đơn nghỉ phép, ngoài phần đổi hợp đồng ghi cho thao tác tạo mới.

**Rủi ro:** cách đơn nghỉ phép thật chạy trong ACheckin là giả định; giữ hệ thống giả ở mức hành vi chung của mọi đơn có duyệt.

### 4.3. U3. Ghi bằng token của chính người yêu cầu

**Làm gì.**
Cho hệ thống giả một chế độ đòi token của từng người thay cho khoá dịch vụ, kèm một nơi cấp token giả:

- Token truy cập sống ngắn, rút xuống vài giây khi đo.
- Token làm mới đổi mới sau mỗi lần dùng; gửi lại token làm mới cũ thì mọi token của người đó bị thu hồi.
- Thu hồi toàn bộ token của một người khi người đó rời danh bạ, mô phỏng nghỉ việc.
- Hệ thống đích tự kiểm quyền theo người cầm token, độc lập với luật của cổng.

Cổng có một chỗ giữ token của từng người cho từng hệ thống, và hàng đợi lấy token của người yêu cầu ngay trước mỗi lần gửi.

**Vì sao.**

- Hôm nay hệ thống đích chỉ thấy khoá của cổng, nên nó không bao giờ từ chối vì người yêu cầu, và nhật ký của nó không biết ai thật sự ghi (P16).
- Khi cổng ghi bằng token của người yêu cầu, hai nguồn lỗi mới xuất hiện giữa lúc duyệt và lúc ghi: token hết hạn hoặc bị thu hồi, và quyền ở hệ thống đích khác quyền ở cổng.
- Lark là ví dụ công khai: token người dùng sống khoảng 2 giờ, token làm mới khoảng 30 ngày, và token làm mới cũ không dùng lại được sau khi đã đổi ([Lark](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/authen-v1/oidc-refresh_access_token/create.md)).
- Đặc tả MCP cấm chuyển thẳng token mà trợ lý gửi cho cổng xuống hệ thống phía sau ([MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices)), nên cổng phải tự giữ token riêng cho từng hệ thống.
  Đó chính là thành phần mà hôm nay Lab không có để thử.

**Phép thử:**

- Token của người yêu cầu hết hạn giữa lúc duyệt và lúc gửi: cổng làm mới rồi gửi, không ghi trùng.
- Hai lệnh của cùng một người cùng làm mới token: chỉ một lần làm mới, không bị thu hồi cả họ token.
- Người yêu cầu nghỉ việc khi lệnh còn trong hàng đợi: lệnh thất bại với lý do rõ ràng, không gửi lại mãi.
- Cổng cho phép nhưng hệ thống đích từ chối vì người đó không có quyền ở đó: lệnh thất bại, vết ghi cả hai quyết định.

**Vấn đề kiểm:** P12 (thẩm quyền đổi giữa duyệt và ghi), P9 (token hết hạn và làm mới cùng lúc), P16 (nhật ký nguồn không biết ai ghi).
Trong danh mục, P9 đang xếp thấp vì "Lab chưa có token người dùng"; cập nhật này nâng nó vào phạm vi.

**Mã chạm tới:** chế độ xác thực của hệ thống giả, nơi cấp token giả, phần gọi hệ thống trong [`adapters/http.ts`](../../lab/gateway/src/adapters/http.ts), một bảng token trong cơ sở dữ liệu của cổng.
Token giả cũng không được vào vết hay log, theo [AGENTS.md, mục 5](../../AGENTS.md#5-data-boundary).

**Xong khi:** bốn phép thử trên đạt trên hồ sơ `standard` và `rate-limited`.

**Rủi ro:** đây là thay đổi lớn nhất về kiến trúc; nó đổi danh tính mà cổng dùng khi ghi, nên cần ghi vào ADR-0009 hoặc một ADR riêng trước khi làm.
Giữ khoá dịch vụ làm chế độ mặc định để các phép thử cũ không đổi.

### 4.4. U4. Hồ sơ hệ thống đích không có số phiên bản

**Làm gì.**
Thêm công tắc "không kiểm số phiên bản" vào [kế hoạch đo Q3, mục 3](q3-measurement-plan.md#3-hệ-thống-đích-giả-khó-tính); hồ sơ `lark-task` bật công tắc này cho lệnh sửa, vì lệnh sửa của Lark Task không có số phiên bản.
So ba cách cổng tự bù: không kiểm, kiểm lúc duyệt, và đọc lại để so ngay trước khi gửi.
Một "người dùng khác" giả sửa cùng bản ghi vào thời điểm ngẫu nhiên.

**Vì sao.**

- Số phiên bản là thứ hôm nay chặn ghi đè mất thay đổi của người khác, và chặn đề xuất trùng gây hại với thao tác đặt giá trị.
- Bảng tính và bảng dữ liệu, loại hệ thống nhân viên hay nhờ trợ lý sửa, thường cho ghi đè không điều kiện; Lark Base cần kiểm ở bước 0.
- Khi đích không kiểm phiên bản, cổng chỉ còn cách đọc, so rồi ghi, và vẫn hở một khoảng giữa lúc so và lúc ghi; khoảng đó lớn tới đâu thì phải đo.

**Bộ đếm mới:** ghi đè mất, tức thay đổi của "người dùng khác" bị lệnh của cổng xoá mà không ai được báo.

**Vấn đề kiểm:** P4, và lỗi "kiểm một lúc, dùng lúc khác" ở bước kiểm bản ghi.

**Mã chạm tới:** hồ sơ mới trong danh sách task giả, kịch bản đo.

**Xong khi:** có số ghi đè mất cho ba cách bù, mỗi cách 100 lần.

**Rủi ro:** nếu bước 0 thấy Lark Base có ghi có điều kiện, hồ sơ này vẫn giữ cho các hệ thống khác nhưng hạ ưu tiên.

### 4.5. U5. Chọn người duyệt theo chủ dữ liệu

**Làm gì.**
Cho file luật chọn một trong hai cách tìm người duyệt cho từng loại bản ghi:

- Trưởng phòng của người yêu cầu, như hôm nay ([`approvers.ts`](../../lab/gateway/src/proposals/approvers.ts)).
- Trưởng phòng sở hữu bản ghi, đọc từ trường phòng mà bộ tiếp hợp đã khai (`ownerField` trong [`adapters/types.ts`](../../lab/gateway/src/adapters/types.ts)).

**Vì sao.**

- Hai cách đều có trong thực tế, và chúng cho người duyệt khác nhau khi thay đổi chạm dữ liệu của phòng khác.
  Ví dụ: chị Nhung (vai nhân sự, phòng Vận hành) sửa email công việc của một nhân viên phòng Kinh doanh; người hiểu dữ liệu đó là trưởng phòng Kinh doanh, không phải anh Quang.
- Sau U2, Lab có cả hai trường hợp cùng lúc: đơn nghỉ phép do quản lý của người xin nghỉ duyệt, còn sửa danh bạ nên do chủ dữ liệu duyệt.
- Phép thử về duyệt và tách nhiệm vụ (P13) chỉ có giá trị dùng lại khi chạy được trên cả hai cách.

**Vấn đề kiểm:** P13 (tách biệt nhiệm vụ), P12.

**Mã chạm tới:** lược đồ file luật, `approvers.ts`, màn hình luật của console.

**Xong khi:** cùng một bộ phép thử về duyệt chạy với cả hai cách và cho kết quả đúng với từng cách.

**Rủi ro:** thấp; thay đổi nằm trong file luật.

**Kết luận mục 4:** U1, U2 và U3 trả lời các câu mà Q3 hôm nay không trả lời được; U4 và U5 mở rộng phép thử đã có.

## 5. Không làm và vì sao

| Việc | Vì sao không làm |
| --- | --- |
| Đổi cấu trúc lỗi trả về cho giống một sản phẩm cụ thể | Không làm lộ ra vấn đề nào trong danh mục; phép thử chấm theo trạng thái hệ thống, không theo câu chữ của lỗi |
| Một công cụ soạn đề xuất tổng quát kiểu "nguồn, thao tác, tham số" | Thuộc hướng cách bày công cụ, chưa chọn |
| Chuyển sang Postgres và chạy nhiều bản cổng | Lab chỉ đo, chưa có người dùng; một tiến trình đủ, như [các phương án thiết kế, mục 12](write-safety-options.md#12-ngoài-phạm-vi-và-vì-sao) đã ghi |
| Đăng nhập OAuth cho trợ lý, chợ skill, lớp dữ liệu theo loại trợ lý | Không chạm đường ghi mà Q3 đo |
| Chép hành vi của một hệ thống thật tới từng mã lỗi | Trái nguyên tắc "giả lập đủ"; làm chậm mà không thêm vấn đề mới |

**Kết luận:** kế hoạch giữ ở đường ghi; mọi thứ khác chỉ làm khi một hướng khác được chọn.

## 6. Thứ tự và ảnh hưởng tới spec

### 6.1. Thứ tự

| Thứ tự | Việc | Phụ thuộc | Vì sao đứng ở đây | Tình trạng |
| --- | --- | --- | --- | --- |
| 1 | Bước 0 | Không | Ba cập nhật cần câu trả lời của nó | Xong, #168 |
| 2 | U1 | Các hồ sơ đích của spec | Rẻ nhất, dùng lại toàn bộ phép đo | Đang đo, #144 |
| 3 | U2 | Bước 0 | Mở khoá P3 và P4 thật; chạm file nóng nên đi một mình | Xong, #164 |
| 4 | U3 | Bước 0, ADR-0009 | Lớn nhất, cần quyết định kiến trúc trước | Chờ, #146 |
| 5 | U4 | Bước 0 | Độc lập, nhỏ | Công tắc đã có trong hồ sơ `lark-task` (#159); số đo nằm trong #144 |
| 6 | U5 | U2 | Có giá trị nhất khi đã có đơn nghỉ phép | Xong, #165 |

U4 và U5 chạy song song được với U3 vì không chung file.
Mỗi cập nhật là một issue `feature` với phạm vi file ghi ở mục 4, theo [AGENTS.md, mục 9](../../AGENTS.md#9-issues-and-pull-requests).

### 6.2. Những chỗ spec ghi an toàn phải đổi

Cột "Mục" chỉ mục trong [kế hoạch đo Q3](q3-measurement-plan.md) ("Đo") hay [các phương án thiết kế](write-safety-options.md) ("Phương án").

| Mục | Đổi gì | Do cập nhật | Tình trạng |
| --- | --- | --- | --- |
| Đo 2, 4 | Thêm cánh "gửi một lần" và hai bộ đếm: báo thất bại dù đã ghi, kẹt ở đang chạy | U1 | Đã đưa vào spec, trong bộ đếm "báo sai trạng thái" và "lệnh treo" |
| Đo 2, 3, 4 | Thêm công tắc không kiểm số phiên bản, đọc lại trước khi gửi, bộ đếm ghi đè mất | U4 | Đã đưa vào spec, giả thuyết 4 |
| Phương án 10 | Thao tác tạo mới chuyển từ "tạo task" sang "tạo đơn nghỉ phép" | U2 | Chưa; spec giữ "tạo task" tới khi U2 được duyệt |
| Đo 2, 3 | Thêm một giả thuyết về token hết hạn và bị thu hồi, và chế độ token theo người | U3 | Một phần: spec đã thêm công tắc token hết hạn và điểm gây lỗi 7; chế độ token theo người vẫn ở ngoài phạm vi, trong [các phương án thiết kế, mục 12](write-safety-options.md#12-ngoài-phạm-vi-và-vì-sao) |
| Phương án 13 | ADR-0009 thêm quyết định về danh tính khi ghi, hoặc trỏ tới một ADR riêng | U3 | Chưa |

**Kết luận:** U1 và U4 đã vào spec; U2, U3 và U5 chỉ đổi spec sau khi được duyệt, để hai tài liệu không nói hai điều khác nhau.

## 7. Đã trả lời và điểm còn mở

Ba câu của bước 0 đã có câu trả lời công khai, ghi trong [danh mục vấn đề](../problem/open-problems.md):

| Câu hỏi | Kết luận ngắn | Chỗ ghi |
| --- | --- | --- |
| Lark Base có ghi có điều kiện không? | Không. Lệnh sửa chỉ ghi đè; chỉ lệnh tạo có mã chống ghi trùng. | [P4](../problem/open-problems.md#24-p4-hai-đề-xuất-cho-cùng-một-việc) |
| Token người dùng Lark sống bao lâu và đổi mới thế nào? | Thẻ truy cập khoảng 2 giờ, token làm mới 7 ngày theo tài liệu hiện hành; token làm mới cũ mất hiệu lực ngay. | [P9](../problem/open-problems.md#281-câu-trả-lời-cho-p9-token-người-dùng-lark) |
| Đơn nghỉ ACheckin có trường và trạng thái nào? | Thời gian, lý do nghỉ (danh mục cấu hình), nội dung; chờ duyệt, đã duyệt, từ chối, có đường thu hồi. | [P12](../problem/open-problems.md#311-câu-trả-lời-cho-u2-hệ-thống-đơn-nghỉ-phép-giả-đơn-nghỉ-phép-acheckin) |

Hệ quả cho kế hoạch:

- U4 (hồ sơ đích không có số phiên bản) giữ nguyên: hồ sơ `no-version` đúng với Lark Base, và #147 đã đóng.
- U3 (ghi bằng token của người yêu cầu) lấy mặc định 7200 giây cho thẻ truy cập và 604800 giây cho token làm mới, đọc từ cấu hình.
  Hành vi thu hồi cả họ token khi dùng lại token cũ là giả định mạnh hơn Lark và RFC 9700 (hướng dẫn bảo mật tốt nhất cho OAuth 2.0), phải ghi rõ trong tài liệu của nơi cấp token.
- U2 (hệ thống đơn nghỉ phép giả) đã merge ở #145.
  `lab/fake-leave` khớp lõi và ba trạng thái chính, nhưng khác lược đồ (schema) công khai ở bốn điểm: `leave_type` cố định bốn giá trị, có thêm trường `reason` chữ tự do, không có đường thu hồi, không mô phỏng một tới bốn cấp duyệt.
  Không sửa `lab/` trong việc này; các khác biệt là giả định đã biết.

Điểm còn mở:

- Ngưỡng 20 giây chờ ở U1 là số chọn để đo, nằm dưới mức Thổ Thần cắt lời gọi ở 60 giây ([khảo sát Thổ Thần, mục 2.1](../research/tho-than-platform.md#21-thổ-thần-gọi-công-cụ-của-lab-thế-nào-và-hệ-quả)); kết quả phải báo kèm ngưỡng này.
- Chưa có nguồn công khai cho lược đồ bên trong của ACheckin (mã đơn, phòng, khoá chống ghi trùng); các trường đó là giả định của Lab, không phải của ACheckin.

**Kết luận:** bước 0 không còn chặn U2, U3 và U4; U3 (ghi bằng token của người yêu cầu) còn chờ U1 #144 merge, và các khác biệt của `lab/fake-leave` được ghi lại thay vì sửa lặng lẽ.
