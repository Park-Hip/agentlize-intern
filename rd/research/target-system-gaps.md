# Hệ thống nghiệp vụ thật khác hệ thống giả ở đâu

Ngày: 2026-11-24. Trạng thái: khảo sát tài liệu xong cho mười khác biệt; P8 (đọc thấy dữ liệu cũ) chưa có bằng chứng cho Lark.

## Đọc nhanh

- Hai phần mềm giả của Lab luôn nhận ra lệnh gửi lại, luôn báo kết quả ngay và luôn chặn ghi đè; phần mềm thật thì không.
- Tài liệu này liệt kê mười chỗ phần mềm thật khác phần mềm giả, mỗi chỗ kèm lý do, hậu quả với cổng hôm nay và bằng chứng.
- Lark Task, phần mềm thật đầu tiên Lab định nối, vướng ít nhất sáu trong mười chỗ.
- Chưa có sự cố công khai nào do trợ lý AI gây ra; bằng chứng mạnh nhất là tài liệu chính thức của Lark Task.
- Kết quả này là đầu vào cho [các phương án thiết kế](../design/write-safety-options.md) và [kế hoạch đo](../design/q3-measurement-plan.md).

## 1. Cách đọc

Hệ thống thật không cố tình làm khó; mỗi khác biệt dưới đây có lý do kỹ thuật hay nghiệp vụ.
Mỗi khác biệt mang mã trong [danh mục vấn đề](../problem/open-problems.md), để đối chiếu với các tài liệu khác.
Cách cổng gửi lệnh ghi hôm nay, và vì sao nó đúng trên hệ thống giả, nằm ở [spec ghi an toàn, mục 1](../design/write-safety-spec.md#1-vấn-đề-là-gì).

Ví dụ về các công ty thành viên Appota giúp hình dung mức thiệt hại.
Tên công ty và mảng kinh doanh lấy từ nguồn công khai ([Wikipedia](https://en.wikipedia.org/wiki/Appota_Corporation)).
Cách các hệ thống nội bộ của họ chạy là giả định để minh hoạ, chưa được xác nhận với công ty nào.
Ví dụ về Lark, Stripe, Google và Meta lấy từ tài liệu chính thức của họ.

Mỗi mục kết thúc bằng mức bằng chứng, theo ba mức:

- **Đã xảy ra:** có sự cố công khai, có ngày và có quy mô thiệt hại.
- **Có trong tài liệu:** nhà cung cấp tự mô tả hành vi này trong tài liệu chính thức, nhưng Lab chưa thấy sự cố công khai.
- **Chỉ có tương tự:** chưa có bằng chứng trực tiếp, chỉ có hiện tượng gần giống.

Mọi câu trích được kiểm lại bằng [`rd/checks/target-system-gaps.sh`](../checks/target-system-gaps.sh).

**Kết luận:** mỗi mục tách rõ điều tài liệu nói, điều Lab suy ra từ mã, và điều chưa chứng minh.

## 2. Không nhận ra lệnh gửi lại (P1)

- **Là gì:** hệ thống không có mã chống ghi trùng, hoặc chỉ có ở vài thao tác.
- **Vì sao:** nhớ mã tốn chỗ và công sức; nhiều công cụ nội bộ được viết cho người bấm tay, không cho máy tự gửi lại.
  Lark Task chỉ nhận mã chống ghi trùng ở ba thao tác: tạo task, tạo task con và thêm thành viên ([Lark Task](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/overview.md)).
  Lệnh sửa task chỉ gồm danh sách trường cần đổi và giá trị mới ([Lark Task, sửa task](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/patch.md)).
- **Hậu quả với cách làm hôm nay:**
  - Với thao tác tạo mới hay "cộng thêm N", cổng gửi lại là làm hai lần.
  - Với thao tác sửa có kiểm số phiên bản, lần gửi lại bị từ chối vì phiên bản đã đổi, và cổng đánh dấu lệnh thất bại với mã `TARGET_CHANGED` dù nó đã ghi ([`outbox.ts`](../../lab/gateway/src/writes/outbox.ts), nhánh `conflict`).
    Lỗi này đọc từ mã, chưa có phép thử tái hiện.
- **Ví dụ:** chính tài liệu Lark Task kể ca này: lần gọi tạo task đầu bị quá giờ, bên gọi gọi lại, và Lark có hai task, một task không bao giờ đóng được.
  Ở Gamota (giả định), công cụ quản trị game chỉ nhận "cộng thêm 500 kim cương"; máy chủ cộng xong nhưng câu trả lời bị mất, cổng gửi lại, và người chơi nhận 1.000 kim cương.

**Một dạng khác: nhận ra lệnh lặp nhưng báo lỗi thay vì trả kết quả cũ.**
Với hệ thống đó, mã chống ghi trùng là ràng buộc "mỗi mã một bản ghi", không phải cơ chế phát lại câu trả lời.
Tạo phiếu phê duyệt Lark với mã `uuid` đã dùng thì thất bại với lỗi 60012 ([Lark Approval](https://open.larksuite.com/document/server-docs/approval-v4/instance/create.md)).
Cổng hôm nay coi mọi lỗi khác 409, 404 và 5xx là bị từ chối ([`http.ts`](../../lab/gateway/src/adapters/http.ts)).
Phiếu đã được tạo, nhưng cổng báo "thất bại", và người dùng có thể nhờ trợ lý tạo phiếu lần nữa.

**Bằng chứng: có trong tài liệu.**

- Tài liệu Lark Task viết thêm: khi hệ thống tải nặng, bên gọi không biết đã quá giờ bao nhiêu lần và đã tạo bao nhiêu task thừa.
- Amazon SQS, dịch vụ hàng đợi tin nhắn của AWS, ghi rõ một tin có thể được giao nhiều hơn một bản ([AWS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html)).
- Tháng 5/2022, khoảng 112.000 khách NatWest thấy giao dịch thẻ bị ghi hai lần ([Yahoo Finance](https://uk.finance.yahoo.com/news/millions-natwest-customers-charged-twice-135801695.html)).

Chưa chứng minh: bài về NatWest không nêu nguyên nhân là gửi lại.
Lab chưa thấy sự cố công khai nào do trợ lý AI gửi lại lệnh gây ra; các bài viết về trợ lý ghi trùng mà Lab tìm được đều là chuyện kể hoặc ví dụ tự dựng.

**Kết luận:** gửi lại cùng mã chỉ an toàn trên thao tác mà đích tự lọc trùng; với Lark Task, đó là ba thao tác.

## 3. Chỉ nhớ mã một thời gian (P2)

- **Là gì:** hệ thống có lọc trùng, nhưng quên mã sau một thời hạn; gửi lại sau hạn thì thành lệnh mới.
- **Vì sao:** nhớ mã mãi thì bảng mã lớn không ngừng, nên mỗi nhà cung cấp chọn một thời hạn.
  Thời hạn khác nhau rất xa:
  - Lark Task nhớ mã 5 phút sau khi lệnh tạo thành công, và chỉ nhận ra lệnh lặp khi cùng một token truy cập gửi ([Lark Task](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/overview.md)).
    Tài liệu nói rõ: token A gửi một mã, rồi token B gửi lại đúng mã đó, thì Lark coi là lệnh mới.
    Token truy cập của Lark hết hạn sau khoảng 2 giờ, nên cổng lấy token mới giữa hai lần gửi cũng làm Lark quên mã, kể cả trong 5 phút.
  - Stripe xoá mã khi mã đã ít nhất 24 giờ tuổi, và mã gửi lại sau đó thành một lệnh mới ([Stripe](https://docs.stripe.com/api/idempotent_requests)).
  - Braintree của PayPal coi là trùng trong 30 ngày; quá 30 ngày thì tạo giao dịch mới ([Braintree](https://developer.paypal.com/braintree/graphql/integration_guides/idempotency/)).
- **Hậu quả với cách làm hôm nay:** cổng gửi lại không giới hạn số lần, giãn dần từ 1 giây tới 60 giây một lần.
  Với Lark Task, lần gửi lại thứ mười đã quá 5 phút, và từ đó mỗi lần gửi lại có thể tạo thêm một task.
  Cổng cũng không nhớ lần gửi đầu dùng token nào, nên không biết lần gửi lại còn nằm trong phạm vi nhớ mã hay không.
- **Ví dụ ở AppotaPay (giả định):** lệnh hoàn tiền qua cổng thanh toán của một đối tác xếp hàng tối thứ Sáu, đối tác bảo trì tới sáng thứ Hai.
  Cổng gửi lại sau 60 giờ với cùng mã, nhưng đối tác chỉ nhớ mã 24 giờ nên coi đây là lệnh mới và hoàn tiền lần hai.

**Bằng chứng: có trong tài liệu**, ở cả ba nhà cung cấp trên.
Chưa chứng minh: chưa có sự cố công khai; thiệt hại phụ thuộc hệ thống đích ngừng bao lâu.

**Kết luận:** lời hứa "gửi lại cùng mã thì an toàn" có hạn dùng và có phạm vi, và cả hai khác nhau theo từng đích.

## 4. Nhận lệnh nhưng kết quả cuối đến sau (P3)

- **Là gì:** hệ thống trả lời ngay rằng đã nhận lệnh, nhưng việc thật xong hay hỏng sau vài giờ hay vài ngày.
- **Vì sao:** tiền đi qua nhiều bên, và ngân hàng quyết toán theo đợt.
  - Ghi nợ tài khoản ngân hàng Mỹ (ACH) qua Stripe có thể mất tới 4 ngày làm việc mới biết thành công hay thất bại ([Stripe](https://docs.stripe.com/payments/ach-direct-debit.md)).
  - Ở Indovina Bank, lệnh chuyển tiền lập sau giờ chốt hay vào ngày nghỉ bị trích nợ ngay, nhưng được xử lý vào ngày làm việc tiếp theo ([Indovina Bank](https://www.indovinabank.com.vn/sites/default/files/2026-03/5.%20%C4%90i%E1%BB%81u%20kho%E1%BA%A3n%20%C4%91i%E1%BB%81u%20ki%E1%BB%87n%20IVB%20Biz%2B%C2%A0Chuy%E1%BB%83n%20ti%E1%BB%81n%20%28VIE%29.pdf)).
  - Google Play yêu cầu game xác nhận giao dịch trong 3 ngày; quá hạn thì Google tự hoàn tiền và thu lại vật phẩm ([Google Play](https://developer.android.com/google/play/billing/integrate)).
- **Hậu quả với cách làm hôm nay:** cổng coi mọi câu trả lời có bản ghi và số phiên bản là "đã ghi" ([`http.ts`](../../lab/gateway/src/adapters/http.ts)), nên trợ lý báo "đã xong" khi việc mới được nhận.
- **Ví dụ ở AppotaPay (giả định):** ngân hàng nhận lệnh hoàn tiền lúc 18 giờ thứ Sáu, sau giờ chốt.
  Trợ lý báo khách "đã hoàn tiền" ngay, trong khi tiền chỉ đi vào thứ Hai, hoặc bị trả lại nếu tài khoản nhận sai.

**Bằng chứng: có trong tài liệu**, ở ba nguồn trên.
MoMo giải thích tiền đã bị trừ mà giao dịch "đang chờ xử lý" là do dữ liệu giữa MoMo và ngân hàng chưa đồng bộ kịp thời ([MoMo](https://www.momo.vn/hoi-dap/tai-khoan-bi-tru-tien-nhung-giao-dich-dang-cho-xu-ly)).
Chưa chứng minh: chưa có số về tỉ lệ lệnh nằm ở trạng thái chờ.

**Đối soát: đã xảy ra.**
Đối soát (reconciliation) là định kỳ so sổ của mình với sổ của bên kia để tìm chỗ lệch.
Năm 2024, khi Synapse phá sản, khách của các công ty dùng Synapse có 265 triệu USD trên sổ, còn các ngân hàng đối tác chỉ giữ 180 triệu ([NBC News](https://www.nbcnews.com/business/business-news/synapse-bankruptcy-trustee-says-85-million-customer-savings-missing-fi-rcna156108)).
Chưa chứng minh: vụ này là sổ của bên trung gian lệch với ngân hàng, không phải lệnh ghi của trợ lý; nó cho thấy giá của việc không đối soát, không cho thấy tần suất.

**Kết luận:** "đích đã nhận" và "việc đã xong" là hai sự kiện khác nhau; với thanh toán, khoảng cách giữa chúng tính bằng ngày.

## 5. Không có số phiên bản (P27)

- **Là gì:** lệnh sửa chỉ nói "đặt trường này thành giá trị này", không kèm số phiên bản để hệ thống kiểm có ai vừa sửa không.
- **Vì sao:** nhiều API được thiết kế cho người sửa tay, nơi người thấy ngay màn hình mới nhất.
  Lệnh sửa task của Lark Task là một ví dụ ([Lark Task, sửa task](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/patch.md)).
- **Hậu quả với cách làm hôm nay:** cổng chống ghi đè bằng số phiên bản ([ADR-0002, điểm 7](../../docs/adr/adr-0002-safe-read-and-write.md#3-quyết-định-về-ghi)).
  Không có số đó, lệnh của cổng ghi lặng lẽ lên thay đổi của người khác.
- **Ví dụ trong Lab:** đề xuất giao T-12 cho anh Minh chờ duyệt 20 phút.
  Trong lúc đó anh Quang đã tự giao T-12 cho chị Lan qua Lark; khi đề xuất được duyệt, lệnh của cổng xoá quyết định của anh Quang.

**Bằng chứng: có trong tài liệu**, ở trang sửa task của Lark Task.

**Kết luận:** với Lark Task, cổng không thể dựa vào đích để chặn ghi đè.

## 6. Giới hạn tốc độ (P7)

- **Là gì:** hệ thống chỉ nhận một số lệnh trong một khoảng thời gian, và trả lỗi 429 (quá nhiều yêu cầu) khi vượt.
- **Vì sao:** để một khách hàng không làm chậm cả hệ thống.
  Meta chỉ cho đổi ngân sách một nhóm quảng cáo 4 lần mỗi giờ; vượt thì nhóm đó bị chặn đổi ngân sách trong một giờ ([Meta](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting)).
  Lark giới hạn tạo phiếu phê duyệt 100 lần mỗi phút ([Lark Approval](https://open.larksuite.com/document/server-docs/approval-v4/instance/create.md)).
- **Cách hệ thống báo phải chờ bao lâu cũng khác nhau:** có hệ thống gửi kèm `Retry-After`, tức số giây phải chờ.
  Meta không dùng `Retry-After` mà ghi thời gian chờ vào trường `estimated_time_to_regain_access` của một header riêng ([Meta](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting)).
  Có hệ thống không báo gì, và có hệ thống phạt bằng cách khoá thêm nếu bên gọi gửi lại quá sớm.
- **Hậu quả với cách làm hôm nay:** cổng coi lỗi 429 là bị từ chối hẳn ([`http.ts`](../../lab/gateway/src/adapters/http.ts)), nên lệnh đã duyệt bị bỏ thay vì chờ rồi gửi.
- **Ví dụ ở Adsota (giả định):** một quy tắc tự động đã đổi ngân sách của 30 nhóm quảng cáo 4 lần trong giờ.
  Đề xuất tăng ngân sách 30 nhóm đó, vừa được duyệt, bị Meta chặn; cổng báo cả 30 mục thất bại thay vì chờ sang giờ sau.

**Bằng chứng: có trong tài liệu**, ở Meta và Lark Approval.

**Kết luận:** 429 nghĩa là "chưa làm, chờ rồi gửi", không phải "bị từ chối"; và mỗi đích báo thời gian chờ theo cách riêng.

## 7. Chờ lâu thì con người và quyền cũng đổi (P4, P12, P30, P5)

Bốn vấn đề sau không do hệ thống đích gây ra, nhưng xấu đi khi lệnh phải chờ lâu vì các lý do ở trên.

- **Hai đề xuất cho cùng một việc (P4):** không thấy kết quả, người dùng hỏi lại trợ lý; trợ lý soạn đề xuất mới với mã mới, nên mã chống ghi trùng không chặn được.
  Ở Gamota (giả định), nhân viên chăm sóc khách hàng hỏi lại sau khi việc hoàn tiền bị gián đoạn; hai trưởng ca mỗi người duyệt một đề xuất, và người chơi được hoàn hai lần.
- **Thẩm quyền đổi giữa lúc duyệt và lúc ghi (P12):** lệnh nằm chờ càng lâu, người duyệt càng có thể đã đổi việc khi lệnh chạy.
  Cổng kiểm quyền lúc bấm Gửi và lúc duyệt, không kiểm lúc gửi đi.
- **Lệnh đã duyệt nhưng đã lỗi thời (P30):** anh Quang duyệt "giao T-12 cho anh Minh" chiều thứ Sáu, nhưng danh sách việc bảo trì tới sáng thứ Hai.
  Tới lúc gửi, T-12 đã bị đóng, hoặc chị Hoa không còn muốn đổi nữa.
  Hôm nay lệnh đã duyệt không có hạn, và người yêu cầu chỉ huỷ được đề xuất trước khi duyệt ([`proposal-store.ts`](../../lab/gateway/src/proposals/proposal-store.ts)).
- **Thành công một nửa (P5):** một đề xuất 30 mục có 20 mục xong và 10 mục bị từ chối.
  Lab đã tách mục xong và mục bị từ chối trên trang tiến độ; còn thiếu cách báo mục đang chờ kết quả cuối hay chờ người xem.

**Bằng chứng cho P4: có trong tài liệu, ở người dùng.**

- MoMo dặn khách không làm lại giao dịch đang chờ xử lý "để tránh giao dịch lặp 2 lần" ([MoMo](https://www.momo.vn/hoi-dap/su-co-va-khieu-nai-ctgr7/su-co-khi-nap-tien-hoac-rut-tien)).
- Một khách Techcombank kể với báo chí rằng ngày 24/8/2020, mã OTP báo lỗi, anh nhập lại, rồi bị trừ tiền hai lần ([VnBusiness](https://vnbusiness.vn/ngan-hang/khach-hang-suyt-mat-tien-do-loi-internet-banking-1072540.html)).
- Ở phòng kế toán, khảo sát APQC cho thấy cả nhóm làm tốt nhất vẫn có khoảng 0,8% tiền chi ra bị trùng hoặc sai ([CFO.com](https://www.cfo.com/news/metric-of-the-month-detect-and-prevent-duplicate-or-erroneous-payments/)).

Chưa chứng minh: vụ Techcombank là lời kể của một người, ngân hàng chưa xác nhận nguyên nhân.
Số APQC gộp cả trả sai người và sai số tiền.
Chưa có số công khai về trợ lý AI soạn hai đề xuất trùng.

**Bằng chứng cho P12: chỉ có tương tự.**

- Một kỹ sư nghỉ Cisco tháng 4/2018; năm tháng sau, anh ta vẫn vào được hệ thống AWS của Cisco và xoá 456 máy ảo của WebEx Teams ([The Register](https://www.theregister.com/2020/08/26/former_cisco_engineer_aws_webex_teams/)).
- Ngày 10/12/2021, một người đã nghỉ việc ở Block tải báo cáo của Cash App Investing; Block phải báo cho khoảng 8,2 triệu khách ([The Register](https://www.theregister.com/2022/04/06/ex-block-employee-takes-customer-data/)).
- Từ 8 tới 18/8/2025, token OAuth của ứng dụng Salesloft Drift bị lấy và vẫn dùng được để đọc dữ liệu Salesforce của khách, tới khi bị thu hồi ([Google](https://cloud.google.com/blog/topics/threat-intelligence/data-theft-salesforce-instances-via-salesloft-drift)).

Chưa chứng minh: cả ba là quyền chưa bị gỡ sau khi nghỉ việc, hoặc token bị đánh cắp.
Kiểm lại quyền ở cổng đọc cùng danh bạ, nên không chặn được hai vụ đầu nếu danh bạ chưa cập nhật.
Lab chưa thấy sự cố công khai nào về lệnh đã duyệt vẫn chạy sau khi người duyệt đổi việc.

**Bằng chứng cho P5: có trong tài liệu.**
API Google Ads giữ lại các thao tác hợp lệ và chỉ báo lỗi cho thao tác hỏng, khi bên gọi bật chế độ thành công một phần (partial failure) ([Google](https://developers.google.com/google-ads/api/docs/best-practices/partial-failures?hl=en)).
Chưa chứng minh: chế độ mặc định của Google Ads là tất cả hoặc không; thiệt hại khi hai bước nằm ở hai hệ thống khác nhau vẫn là giả định.

**Bằng chứng cho P30:** Lab chưa tìm nguồn ngoài; vấn đề đọc từ mã của cổng.

**Kết luận:** thời gian chờ là thứ nhân lên rủi ro; mọi cách làm lệnh chờ lâu hơn đều phải tính tới bốn vấn đề này.

## 8. Cùng một mã trả về mang nhiều nghĩa (P28)

- **Là gì:** mã trả về (status code) là con số hệ thống đích gửi kèm câu trả lời, ví dụ 409 hay 401.
  Mỗi hệ thống dùng cùng một con số cho những chuyện khác nhau, và có mã lỗi riêng trong thân câu trả lời.
- **Vì sao:** chuẩn HTTP chỉ quy định nghĩa chung; nghĩa cụ thể do từng nhà cung cấp chọn.
  - Ở hệ thống giả của Lab, 409 nghĩa là số phiên bản đã đổi.
  - Ở Stripe, 409 có thể nghĩa là một lệnh cùng mã chống ghi trùng còn đang chạy; Stripe dặn chờ rồi gửi lại cùng mã và cùng nội dung ([Stripe](https://docs.stripe.com/error-low-level)).
  - Ở Lark Task, hai lệnh cùng mã đến cùng lúc thì lệnh sau nhận lỗi 1470422 ([Lark Task](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/overview.md)).
  - Meta báo vượt giới hạn đổi ngân sách bằng mã lỗi riêng 613 kèm mã phụ 1487632, không chỉ bằng mã HTTP ([Meta](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting)).
  - Mã 401 nghĩa là token hết hạn: hệ thống chưa làm gì, giống 429.
- **Hậu quả với cách làm hôm nay:** cổng đọc mã trả về theo một bảng chung ([`http.ts`](../../lab/gateway/src/adapters/http.ts)).
  - Mọi 409 thành `TARGET_CHANGED`, nên lệnh còn đang ghi bị báo "dữ liệu đã đổi".
  - Mọi 401 và 403 thành "bị từ chối", nên lệnh đã duyệt bị bỏ chỉ vì token hết hạn.
  - Lần gửi lại bị từ chối làm lệnh thành thất bại, dù lần gửi trước có thể đã ghi; lỗi tiềm ẩn ở mục 2 là một ca của lỗi chung này.
- **Ví dụ trong Lab:** cổng gửi lệnh giao T-12, câu trả lời bị mất, rồi token hết hạn.
  Lần gửi lại nhận 401, và chị Hoa thấy "thất bại" trong khi T-12 đã thuộc anh Minh.

**Bằng chứng: có trong tài liệu**, ở Stripe, Lark Task và Meta.
Chưa chứng minh: chưa có sự cố công khai nào cho hành vi này.

**Kết luận:** một bảng mã trả về chung cho mọi đích sẽ đọc sai ít nhất ba nhà cung cấp đã kiểm.

## 9. Đọc ngay sau khi ghi thấy dữ liệu cũ (P8)

- **Là gì:** hệ thống ghi xong, nhưng lệnh đọc ngay sau đó vẫn thấy bản cũ trong vài giây.
- **Vì sao:** hệ thống lớn giữ nhiều bản sao dữ liệu để đọc nhanh, và bản sao cập nhật sau bản chính.
- **Hậu quả với cách làm hôm nay:** cổng không tra trước khi gửi lại, nên chưa bị ảnh hưởng.
  Mọi phương án thiết kế có bước "tra rồi mới gửi lại" thì bị ảnh hưởng: tra thấy "chưa ghi" là gửi lại.
  Nếu lần tra đọc phải bản sao cũ, cổng gửi lại một lệnh đã ghi, và ghi trùng.
- **Ví dụ trong Lab:** cổng tạo task "Báo cáo tuần 48" rồi mất câu trả lời.
  Cổng tra sau 1 giây, bản sao chưa có task đó, và cổng tạo task thứ hai.

**Bằng chứng: chưa có cho Lark.**
Lab chưa tìm thấy tài liệu Lark Task nói đọc ngay sau khi ghi có thấy bản mới hay không, nên chưa chứng minh được cả chiều có lẫn chiều không.

**Kết luận:** một lần thử trên Lark, tạo rồi đọc ngay 100 lần, phải trả lời câu này trước khi chọn phương án dựa vào tra kết quả.

## 10. Một lệnh ghi kéo theo việc khác ở đích (P29)

- **Là gì:** ngoài việc đổi bản ghi, hệ thống đích còn gửi thông báo hay chạy quy trình tự động mỗi khi có thay đổi.
- **Vì sao:** người dùng cần biết khi việc của họ đổi.
  Ở Lark Task, người theo dõi một task nhận được thông báo khi task thay đổi ([Lark Task](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/overview.md)).
- **Hậu quả:** chống ghi trùng chỉ giữ bản ghi đúng; một lần gửi thừa vẫn có thể gửi thêm thông báo, và thông báo không gọi về được (P6).
  Bộ đếm phía đích của Lab hôm nay chỉ đếm thay đổi của bản ghi.
- **Ví dụ trong Lab:** cổng gửi lại lệnh giao T-12 ba lần; T-12 vẫn đúng, nhưng anh Minh nhận ba tin "bạn được giao T-12".

**Bằng chứng: có trong tài liệu.**
Chưa chứng minh: tài liệu Lark chỉ nói người theo dõi nhận thông báo, không nói người được giao có nhận không.

**Kết luận:** "không ghi trùng" phải được đếm cả ở việc kéo theo, không chỉ ở bản ghi.

## 11. Một việc cần nhiều lời gọi (P31)

- **Là gì:** một việc người dùng nhờ phải gọi hệ thống đích nhiều lần, và lần sau cần kết quả của lần trước.
- **Vì sao:** API chia việc thành các bước nhỏ.
  Ở Lark Task, đính kèm file là một API riêng, và cần mã của task đã tạo ([Lark Task, đính kèm](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/attachment/upload.md)).
- **Hậu quả:** lệnh tạo xong mà lệnh đính kèm hỏng là thành công một nửa ngay trong một mục.
  Gửi lại cả việc thì tạo task thứ hai.
  Lab hôm nay coi mỗi mục là một lời gọi, và các mục độc lập nhau ([ADR-0007, mục 3.3](../../docs/adr/adr-0007-system-adapters-and-change-sets.md#33-đề-xuất-nhiều-mục)), nên chưa gặp ca này.

**Bằng chứng: có trong tài liệu**, ở trang đính kèm của Lark Task.

**Kết luận:** chưa chặn phép đo Q3, vì Lab chỉ bày việc một lời gọi; sẽ chặn ngay khi cần tạo task kèm file.

## 12. Tóm tắt

| Khác biệt | Hệ thống thật có tài liệu | Cách làm hôm nay hỏng thế nào | Mức bằng chứng |
| --- | --- | --- | --- |
| Không nhận ra lệnh gửi lại (P1) | Lark Task, lệnh sửa | Tạo hai lần; hoặc báo thất bại dù đã ghi | Có trong tài liệu |
| Báo lỗi khi gặp lệnh lặp (dạng của P1) | Lark Approval | Báo thất bại dù phiếu đã tạo | Có trong tài liệu |
| Chỉ nhớ mã một thời gian (P2) | Lark Task 5 phút và theo từng token, Stripe 24 giờ, Braintree 30 ngày | Gửi lại sau hạn, hay bằng token mới, là làm lần hai | Có trong tài liệu |
| Kết quả cuối đến sau (P3) | Stripe ACH, Indovina Bank, Google Play | Báo xong khi mới được nhận | Có trong tài liệu; đối soát đã xảy ra |
| Không có số phiên bản (P27) | Lark Task, lệnh sửa | Ghi đè thay đổi của người khác | Có trong tài liệu |
| Giới hạn tốc độ (P7) | Meta, Lark Approval | Bỏ lệnh đã duyệt | Có trong tài liệu |
| Chờ lâu: đề xuất trùng, quyền đổi, lệnh lỗi thời, thành công một nửa (P4, P12, P30, P5) | Không do đích | Ghi hai lần; ghi bằng quyền đã mất; ghi việc không còn cần | P4, P5 có trong tài liệu; P12 chỉ có tương tự |
| Mã trả về nhiều nghĩa (P28) | Stripe 409, Lark Task 1470422, Meta 613 | Báo "dữ liệu đã đổi" hay "bị từ chối" dù lệnh đã ghi | Có trong tài liệu |
| Đọc thấy dữ liệu cũ (P8) | Chưa có tài liệu | Phương án có bước tra sẽ tra sai rồi ghi trùng | Chưa có |
| Kéo theo việc khác (P29) | Lark Task, thông báo cho người theo dõi | Gửi thừa thông báo | Có trong tài liệu |
| Một việc nhiều lời gọi (P31) | Lark Task, đính kèm | Chưa gặp, vì Lab chỉ bày việc một lời gọi | Có trong tài liệu |

**Kết luận:** Lark Task vướng ít nhất sáu trong mười khác biệt; nối nó bằng cách làm hôm nay sẽ tạo task trùng, báo sai, ghi đè và bỏ lệnh đã duyệt.
Không vấn đề nào có sự cố công khai do trợ lý AI gây ra, và chỉ đối soát có sự cố công khai với quy mô rõ.
Bằng chứng mạnh nhất là tài liệu của chính Lark Task: nó mô tả đúng ca tạo trùng, thời hạn nhớ mã 5 phút theo từng token, và lệnh sửa không có số phiên bản.

## Tài liệu liên quan

- [Spec ghi an toàn](../design/write-safety-spec.md)
- [Các phương án thiết kế](../design/write-safety-options.md)
- [Danh mục vấn đề](../problem/open-problems.md)
