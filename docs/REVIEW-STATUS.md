# Sổ đăng ký trạng thái review tài liệu

Mục đích: nói rõ tài liệu nào đã được con người đọc và xác nhận, tài liệu nào chỉ là bản nháp do agent soạn.

Mặc định hiện tại: **mọi tài liệu Markdown trong `docs/` là bản nháp chưa review, trừ dòng được đánh dấu `Đã review` trong bảng mục 2.**
Không dùng chúng làm nguồn học, không trích dẫn lại như dữ kiện, không ra quyết định dựa trên chúng, cho tới khi dòng tương ứng dưới đây được chuyển sang `Đã review`.

## 1. Cách đọc bảng này

- `Chưa review`: agent viết, chưa ai kiểm từng dòng. Số liệu, trích dẫn, tên nguồn và kết luận đều phải coi là giả thuyết.
- `Đang review`: có người đang đọc, vẫn chưa dùng được như dữ kiện.
- `Đã review`: người sở hữu đã đọc hết và xác nhận. Chỉ trạng thái này mới được trích dẫn.
- `Không hợp lệ`: tài liệu đã được đọc và bị kết luận sai phương pháp hoặc sai dữ kiện. Không dùng cho bất kỳ mục đích nào, kể cả làm nền cho bản sau. File giữ nguyên tại chỗ làm bản ghi, có cảnh báo ở đầu file trỏ tới bản thay thế. Nếu file đó về sau bị xóa khỏi worktree thì dòng chuyển sang `Đã xóa`, lý do bị loại vẫn giữ ở cột ghi chú.
- `Đã xóa`: file đã bị xóa khỏi worktree. Dòng ở lại để quyết định cũ không bị đọc như thể file còn đó, và không có liên kết vì đích không tồn tại. Ghi ngày, người xóa và nơi thay thế khi biết; không đoán.

Một tài liệu chỉ được coi là `Đã review` khi thỏa cả bốn điều:

1. Người review đọc hết file, không đọc lướt.
2. Mọi con số và mọi khẳng định về nguồn ngoài đã được mở lại nguồn gốc và khớp.
3. Mọi liên kết trong file mở được, hoặc đã bị xóa và ghi lý do.
4. Người review ghi tên và ngày vào bảng dưới.

## 2. Bảng trạng thái

| Tài liệu | Loại | Trạng thái | Người review | Ngày review | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| [`reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md`](reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md) | Bước 0 của khung R&D | Đang review | Phạm Bách Hiệp | 2026-11-11 | Bước 0, đứng trước bước 01 Explore: vấn đề, mô hình bảy thành phần, yêu cầu SR1-SR8, yếu tố M1-M6. Phần 1 và Phần 3 đã review ngày 11.11. Mục 0 viết lại thành bảng và Phần 2 viết lại theo cách cắt bảy thành phần ngày 2026-11-13, thêm mục 2.3 nguồn với chín phép kiểm khớp nguyên văn, cần đọc lại hai phần đó trước khi trích dẫn lại. Chưa khảo sát mô hình. |
| [`reports/bao-cao-mcp-2026-11-12.md`](reports/bao-cao-mcp-2026-11-12.md) | Báo cáo tổng hợp | Chưa review | - | - | Bản 0.1. Tổng hợp research MCP trong repo, đối chiếu lại với đặc tả 2026-07-28. Có nhãn bằng chứng, phần SR1-SR8, đo lường và câu hỏi mở. Chưa có số đo trên lab. |
| [`context/appota-ai-ecosystem.md`](context/appota-ai-ecosystem.md) | Ngữ cảnh nội bộ | Chưa review | - | - | Bản chép sơ đồ hệ sinh thái AI Appota (AgentLize - Thổ Thần AI - Kdata - Business) từ ảnh chụp 2026-11-09. Không phải đặc tả, không phải nguồn học. Phải kiểm với Kevin trước khi dùng. |
| [`research/01-appota-cases.md`](research/01-appota-cases.md) | Research note | Chưa review | - | - | Tình huống Appota dùng cho Track 01. Dài nhất, rủi ro sai cao nhất. Viết theo khung đánh giá cũ đã gỡ. |
| [`research/03-appotapay-skills.md`](research/03-appotapay-skills.md) | Research note | Chưa review | - | - | Gắn với một commit cụ thể của repo ngoài, phải kiểm lại revision. Viết theo khung đánh giá cũ đã gỡ. |
| `research/04-khao-sat-5-mo-hinh.md` | Research report | Đã xóa | Phạm Bách Hiệp | 2026-11-13 | Từng bị kết luận `Không hợp lệ`: sai đơn vị so sánh, đặt năm cơ chế khác tầng thành năm ứng viên ngang hàng, và đòi đo chi phí cùng độ phức tạp vận hành cho từng cơ chế. Không mở nguồn ngoài nào nên không có Research Finding. File đã bị xóa khỏi worktree, không còn bản ghi nội dung. Thay bằng `research/05-kien-truc-tich-hop-ai-operations.md`. |
| [`research/05-kien-truc-tich-hop-ai-operations.md`](research/05-kien-truc-tich-hop-ai-operations.md) | Research report | Chưa review | - | - | v0.3. Tài liệu độc lập về kiến trúc tích hợp: tám ràng buộc SR1-SR8, sáu đại lượng đo M1-M6, ba kiến trúc A, B, C kèm một lượt chạy cụ thể. Không có sổ nguồn, chưa đo, chưa chọn kiến trúc. Đã hoàn lại nguyên trạng sau khi bị sửa quá phạm vi ngày 2026-11-12. |
| [`research/so-do-giai-phap.md`](research/so-do-giai-phap.md) | Bản nháp sơ đồ | Chưa review | - | - | Ba ứng viên, luồng chung, bảng đối chiếu sơ bộ và câu hỏi kiểm chứng. Chưa triển khai, chưa đo, chưa chọn kiến trúc. |
| `research/06-cau-truc-tai-lieu-so-sanh-kien-truc.md` | Practice note | Đã xóa | - | - | Khung mục ngắn: sáu nhu cầu của người đọc, sáu mục tài liệu, năm mục cho mỗi mô hình (là gì, cho gì, không cho gì, tốn gì, khi nào dùng). Tách mô hình khỏi kiến trúc ứng viên. Không phải kết quả nghiên cứu, không chọn kiến trúc. File đã bị xóa khỏi worktree; chỉ còn lại phần mô tả trong dòng này. |
| [`research/07-kien-truc-ung-vien-tu-he-thong-that.md`](research/07-kien-truc-ung-vien-tu-he-thong-that.md) | Research report | Chưa review | - | - | v0.1. Kiến trúc thật của 44 hệ thống và đặc tả, 6 nhánh research song song, 65 nguồn, 51 lần kiểm chéo bằng script (50 khớp, 1 trang chặn). Năm tổ hợp kiến trúc P1 đến P5, bảy giả thuyết H1 đến H7. Không có số đo, không chọn kiến trúc. Nguồn S52 (Salesforce) bị loại. |
| [`research/08-khao-sat-nam-phuong-phap-tich-hop.md`](research/08-khao-sat-nam-phuong-phap-tich-hop.md) | Research note | Chưa review | - | - | v0.3. Đầu ra bước 01 Explore. Đủ năm phương pháp, mỗi phương pháp bảy ô; tách hai tầng phương pháp và tổ hợp kiến trúc. 25 nguồn, 68 câu trích kiểm chéo bằng `checks/verify-sources-08.sh`, 68 khớp. Thêm bảng SR1-SR8, định nghĩa ba mức, bốn phát hiện của bước 01, nguồn E25; bỏ tham chiếu file nội bộ để nộp độc lập. Sơ đồ SVG, render bằng `docs/render/render.sh`. Không có số đo, không chọn phương pháp. |
| [`research/10-tho-than-platform.md`](research/10-tho-than-platform.md) | Research note | Chưa review | - | - | v0.1. Nhận dạng bốn thực thể cùng tên "Thổ Thần": bản đổi nhãn của LobeHub 2.1.56 ở `thothan.appota.ai`, extension VS Code, bộ tài liệu 2024 của một nền tảng dạng Dify, và tên IP văn hoá. Có một MCP server sống đã bắt tay thật. 18 nguồn, 21 câu trích kiểm chéo bằng `checks/verify-sources-09.sh`, 21 khớp. Không đăng nhập được nên mọi kết luận về cấu hình đang bật đều để mở. Sổ trước đây trỏ tới `09-tho-than-platform.md`; liên kết nay theo tên file hiện có trong worktree. |
| [`research/09-bang-so-sanh-va-tieu-chi-lua-chon.md`](research/09-bang-so-sanh-va-tieu-chi-lua-chon.md) | Research report | Chưa review | - | - | v0.5. Đầu ra bước 02: mỗi mô hình 3.1 đến 3.5 có đoạn Cơ chế đặt trước bảy trục, Ưu viết theo "được gì, cho ai, ở quy mô nào", Nhược viết theo "mất gì, vỡ ở đâu trước", thêm 3.6 với năm ca sai, tiêu chí lựa chọn, bảng phủ SR1-SR8. Sáu dữ kiện từng bị bỏ đã trả lại: thêm server mới thay vì nhồi thêm tool, annotation không được tin, extension opt-in, tools/list thứ tự tất định để cache prompt, handoff và agent-as-tool, phản hồi idempotent khi start execution trùng tên. Năm nguồn mở song song; 49 nguồn, 17 nguồn mới E57-E73. Đã mở lại 32 mã cũ, sửa 5 chỗ lệch nguồn. Chưa có số đo, không chọn mô hình. |
| [`research/11-cau-hoi-va-gia-thuyet.md`](research/11-cau-hoi-va-gia-thuyet.md) | Research report | Không hợp lệ | Phạm Bách Hiệp | 2026-11-13 | v0.1. Đầu ra bước 03, viết ở tầng kiến trúc ghép chứ không theo năm phương pháp: bảy câu hỏi chặn ADR Q1-Q7, mười mối nối N1-N10, mười giả thuyết G1-G10, bảy ngưỡng đề xuất, năm chỗ vênh giữa các bản nháp. Sơ đồ SVG vẽ tay ở `research/assets/11-so-do-moi-noi.svg`. Không có số đo, không chọn tổ hợp. Người sở hữu kết luận chưa đạt ngày 2026-11-13: đánh dấu `Không hợp lệ`, không được tham khảo, không dùng làm nền cho bản sau. Lý do chi tiết chưa ghi trong sổ. Chưa có bản thay thế; bước 03 phải viết lại từ đầu. |
| [`research/12-de-xuat-mo-hinh-va-pham-vi-mvp.md`](research/12-de-xuat-mo-hinh-va-pham-vi-mvp.md) | Research report | Chưa review | - | - | v0.1. Khung rỗng cho bước 04 Propose: nền bằng chứng, bảng chấm P1-P5 theo C1-C6, bốn mục vì sao không chọn, ba hình, biên MVP, ánh xạ tiêu chí nghiệm thu. Không kế thừa gì từ file 11 vì file đó `Không hợp lệ`: câu hỏi chặn S1-S3, liên kết L1-L10, điều kiện lật định nghĩa lại tại chỗ. Mọi ô là `[chờ điền]`, không có quyết định, không có số, chưa có ADR. |
| [`rd-practices.md`](rd-practices.md) | Practice note | Chưa review | - | - | 16 practice R&D gom từ nguồn ngoài, kèm chỗ áp dụng trong repo và dấu hiệu vi phạm. Đã mở lại nguyên văn 11 trên 12 nguồn; S41 (Belton và Gear) không mở được vì paywall. Không phải kết quả nghiên cứu, không dùng để kết luận về kiến trúc. |

Không tính vào bảng: file tạm trong `.lavish/`, không phải tài liệu của repository.

### 2.1. Hai dòng `Đã xóa` ở trên

- `research/04-khao-sat-5-mo-hinh.md` và `research/06-cau-truc-tai-lieu-so-sanh-kien-truc.md` không còn trong worktree.
- Không có bản gốc để khôi phục: `git log` chỉ có một commit `Initial commit`, và toàn bộ `docs/` đang untracked.
- Hệ quả phải nhớ: khung năm mục cho mỗi mô hình giờ chỉ còn một dòng mô tả ở bảng trên, không còn bản đầy đủ. Bước Explore phải dựng lại khung, không được coi như đã có.
- Còn năm chỗ khác trỏ tới `04`, trong hai file đều chưa review: ba chỗ ở `reports/bao-cao-mcp-2026-11-12.md` và hai chỗ ở `rd-practices.md`. Đếm lại bằng `grep -rn 04-khao-sat --include="*.md" docs`. Không chỗ nào trong số đó được dẫn tới file đã xóa.

### 2.2. Dòng `Không hợp lệ` ở trên

- `research/11-cau-hoi-va-gia-thuyet.md` vẫn còn trong worktree, có cảnh báo `KHÔNG HỢP LỆ` ở đầu file.
- Không trích, không dùng làm nền cho bản sau, không dùng câu hỏi, mối nối hay ngưỡng nào trong file đó.
- Chưa có bản thay thế, nên bước 03 hiện không có đầu ra hợp lệ.
- Lý do chi tiết chưa được ghi; khi có, ghi vào cột ghi chú của dòng đó, không sửa nội dung file.

### 2.3. Khung cấu trúc bước 02 mới tạo

| Tài liệu | Loại | Trạng thái | Người review | Ngày review | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| [`research/09-khung-bang-so-sanh-va-tieu-chi-lua-chon.md`](research/09-khung-bang-so-sanh-va-tieu-chi-lua-chon.md) | Khung tài liệu bước 02 | Chưa review | - | - | Khung 0.1 ngày 2026-11-13, theo cấu trúc được người dùng chấp thuận trong hội thoại. Bảy mục, đủ bảy trục đánh giá, bảng tổng hợp, đối chiếu nhu cầu và tiêu chí lựa chọn. Chưa điền kết quả, chưa có nguồn nghiên cứu hay quyết định; không thay thế hoặc sửa bản nháp nội dung `09-bang-so-sanh-va-tieu-chi-lua-chon.md`. |

## 3. Khi review xong một file

Làm đúng ba bước, theo thứ tự:

1. Xóa khối cảnh báo `CHƯA REVIEW` ở đầu file đó.
2. Cập nhật dòng của file trong bảng mục 2: trạng thái, người review, ngày review.
3. Nếu file có mục "Trạng thái" riêng thì sửa luôn cho khớp, để hai chỗ không nói hai ý khác nhau.

Review một phần thì không xóa cảnh báo. Ghi vào cột ghi chú là đã review phần nào, và giữ nguyên trạng thái `Chưa review` cho tới khi xong cả file.

Khi xóa một tài liệu, làm hai bước:

1. Chuyển dòng của file sang `Đã xóa`, bỏ liên kết, giữ nguyên phần mô tả và lý do.
2. Ghi vào cột ghi chú nơi thay thế, và ghi rõ nếu không còn bản gốc.

## 4. Vì sao phải có sổ này

Các tài liệu trong `docs/` được viết nhanh để chốt hiểu biết, có số liệu và trích dẫn tự sinh.
Một con số sai hoặc một trích dẫn bịa sẽ đi vào báo cáo tuần và vào quyết định chọn mô hình, và rất khó phát hiện về sau vì nó nằm trong văn bản trông hoàn chỉnh.
Sổ này biến "trông có vẻ đúng" thành "đã có người xác nhận", và làm phần chưa xác nhận hiện ra rõ ràng thay vì bị đọc như sự thật.

## 5. Phạm vi

- Cảnh báo ở đầu file chỉ gắn cho tài liệu Markdown, theo đúng yêu cầu hiện tại.
- `docs/artifacts/*.html` và `docs/research/appota-test-matrix.csv` không có cảnh báo trong file, nhưng cùng trạng thái `Chưa review` vì được sinh từ chính các bản nháp trên. Không dùng chúng làm nguồn học hay trích dẫn.
- `docs/reports/*.pdf` và `R&D/*.pdf` là **bản render** của file Markdown cùng tên, không phải tài liệu riêng, không có trạng thái riêng: trạng thái của chúng bằng trạng thái của file nguồn. Sửa file Markdown thì phải render lại cả hai bằng `bash docs/render/render.sh <file.md> <out.pdf>`. Bản render của bước 0 tên là `buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.pdf` ở cả hai chỗ. Bản render cũ tên `bao-cao-nextgen-2026-11-11.pdf` đã bị xóa khỏi worktree khi file Markdown được đổi tên, nên không được trích nó như một bản riêng.
- `docs/research/checks/*.sh` là script kiểm nguồn, không phải tài liệu, nên không gắn cảnh báo. Kết quả của nó là bằng chứng cho `research/07` và `research/08`, nên cùng trạng thái `Chưa review`. Riêng `checks/verify-report-2.sh` là bằng chứng cho mục 2.3 của báo cáo chính thức, nên mức tin cậy của nó bằng mức tin cậy của mục đó.
- `docs/render/*` là script và stylesheet để render Markdown sang PDF, không phải tài liệu, nên không gắn cảnh báo.
- `docs/research/assets/*.svg` là hình của tài liệu Markdown tương ứng, cùng trạng thái với tài liệu đó, không gắn cảnh báo.
- `docs/program/*.pdf` và `*.txt` là nguồn gốc của chương trình, không phải bản nháp của agent. Không gắn cảnh báo, nhưng vẫn phải trích dẫn đúng trang khi dùng.
- `AGENTS.md` ở gốc repo là hướng dẫn vận hành cho agent, không phải tài liệu nghiên cứu. Không tính vào bảng.
- `.lavish/*.md` là file tạm ngoài repository. Không tính.
- `.research/compare/*.md` và `.research/compare/*.js` là đầu ra của từng lane research, nằm trong thư mục đã gitignore. Không tính vào bảng, nhưng nội dung của chúng đi vào `research/09`, nên mức tin cậy của chúng bằng mức tin cậy của `09`.
