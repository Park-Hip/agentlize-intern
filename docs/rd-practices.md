> **CHƯA REVIEW - KHÔNG TIN HOÀN TOÀN.** Bản này do agent soạn, chưa được Phạm Bách Hiệp review.
> Coi mọi khẳng định về nguồn ngoài trong đây là giả thuyết phải mở lại kiểm.
> Trạng thái: [`REVIEW-STATUS.md`](REVIEW-STATUS.md).

# Practices cho R&D: nguồn ngoài và cách áp dụng ở đây

Owner: Phạm Bách Hiệp. Mentor: Kevin. Ngày: 2026-11-13. Revision: 0.1.
Mục đích: gom các practice R&D đã đọc được từ nguồn ngoài, kèm chỗ áp dụng cụ thể trong repo này và dấu hiệu khi bị vi phạm.
Đây là tài liệu cách làm việc, không phải kết quả nghiên cứu.
Không dùng file này để kết luận về mô hình, kiến trúc hay stack.

Cách dùng:

- Trước khi viết một báo cáo mới, đọc bảng 1 để chọn cách trình bày.
- Trước khi gửi review, chạy checklist ở mục 4.
- Khi thấy mình đang làm khác một dòng trong bảng 1, ghi lý do vào nhật ký của báo cáo đó.
- Mọi dòng có nguồn phải mở lại được. Dòng ghi "nội bộ" là quy ước của dự án, không phải nguồn ngoài.

---

## 1. Mười sáu practice

| # | Practice | Nguồn | Áp dụng ở đây | Dấu hiệu vi phạm |
| --- | --- | --- | --- | --- |
| P1 | Tiêu chí chấm phải phân biệt được; bỏ tiêu chí mà mọi phương án đều đạt hoặc đều không | S36 | Bảng tiêu chí riêng từng tầng, mục 2.2 của `research/04-khao-sat-5-mo-hinh.md` | Hai phương án khác bản chất bị chấm bằng cùng một bộ tiêu chí |
| P2 | Mỗi concern một viewpoint, không dùng một thang chung cho nhiều concern | S40 | Năm nhóm tiêu chí F, P, E, O, V, không có thang chung | Một bảng điểm duy nhất cho năm thứ khác tầng |
| P3 | Đánh giá kiến trúc bằng rủi ro và điểm đánh đổi, không bằng điểm tổng | S35 | Ma trận `own`/`hint`/`.` ở mục 2.4, danh sách bảo đảm không có chủ ở 4.2 | Kết luận dạng "mô hình X được 1.6 trên 5" |
| P4 | Điểm chỉ có nghĩa trong một use case; không gộp thành chỉ số xếp hạng | S36 | Thực nghiệm C1 so C2 ở mục 6.1, không có bảng xếp hạng | Có bảng xếp hạng năm mô hình |
| P5 | Ghi đánh đổi bằng đơn vị tự nhiên của từng thành phần, không cộng các đại lượng khác đơn vị | nội bộ | Bảng đánh đổi bốn chiều ở mục 2.3 | Cộng ms với số dòng code thành một số |
| P6 | Thứ hạng có thể đảo khi thêm hoặc bớt phương án | S41, chưa mở | Không xếp hạng, chỉ so cặp C1 và C2 | Tin vào thứ hạng khi khoảng điểm hẹp |
| P7 | Một quyết định một ADR, một hai trang, có Consequences gồm cả mặt xấu | S34 | Mục 5.5, và thư mục `docs/adr/` khi có ADR đầu tiên | Quyết định nằm rải trong báo cáo dài, không có mục Consequences |
| P8 | Tài liệu dài không ai đọc và không được cập nhật | S34 | Ngân sách 400 dòng cho thân bài của báo cáo 5 tầng | File phình qua nhiều vòng mà không ai đọc lại |
| P9 | Progressive disclosure: khái niệm mới xuất hiện gần chỗ dùng, chi tiết sau | S45 | Mục 0 một trang, phụ lục A-D là phần tra cứu | Định nghĩa và ngoại lệ nhồi trước phần chính |
| P10 | Tách loại tài liệu theo nhu cầu người đọc: học, làm, tra cứu, hiểu | S38 | Báo cáo 5 tầng là explanation cộng reference, không phải how-to chạy lab | Trộn hướng dẫn chạy với lập luận và với bảng tra cứu |
| P11 | Định nghĩa steady state đo được, so nhóm đối chứng với nhóm thực nghiệm | S39 | C1 là đối chứng, C2 là thực nghiệm, mọi thứ khác giữ nguyên | Đổi hai biến cùng lúc rồi quy công cho một biến |
| P12 | Tiêu chí đạt phải lập trước khi chạy test | S43 | Cột "Ngưỡng đặt trước" ở mục 6.1 | Ngưỡng xuất hiện sau khi đã có số |
| P13 | Không dùng cùng một dữ liệu để vừa sinh vừa kiểm giả thuyết | S42 | Ghi ngưỡng vào file trước lần chạy đầu | Xem kết quả rồi chọn lại giả thuyết |
| P14 | Test không đánh giá được thì ghi rõ lý do; không xóa kết quả âm | S43 | Ba trạng thái đạt, không đạt, không kết luận ở mục 6.4 | Chỉ báo cáo ca đạt |
| P15 | Artifact phải chạy lại được: một lệnh ra số, có môi trường và phiên bản | S44 | Mục 6.4, và mục Commands trong `AGENTS.md` khi có code | Báo cáo có số nhưng không có lệnh tạo ra số đó |
| P16 | Ghi rõ nguồn nào chưa mở được, không trộn với nguồn đã kiểm | nội bộ | Cột "đã mở" ở Phụ lục A của báo cáo 5 tầng | URL nằm trong bảng nguồn nhưng chưa ai mở |

---

## 2. Nguyên văn nguồn chốt

Mỗi dòng là một trích dẫn nguyên văn đã mở, để người review khỏi phải đọc lại toàn bộ nguồn.

| ID | Trích nguyên văn |
| --- | --- |
| S34 | "The whole document should be one or two pages long." và "Nobody ever reads large documents." |
| S35 | "The risks/non-risks, sensitivity points, and tradeoffs are gathered together in three separate lists." |
| S36 | "remove the assessment of important (but ever-present) baseline functionality" và "not weighted or normalized again to produce the simple indexed ranking" |
| S37 | "The rings indicate our recommendation for using that technology or technique." |
| S38 | Bốn loại tài liệu: tutorial, how-to guide, reference, explanation |
| S39 | "defining 'steady state' as some measurable output of a system that indicates normal behavior" |
| S40 | "Viewpoints framing those Concerns" |
| S42 | "the same data cannot be used to generate and test a hypothesis" |
| S43 | "Criteria for a successful test are established before the test." và "If a test cannot be evaluated, capture that fact and the reasons for it." |
| S44 | Artifact chỉ đạt khi "documented, consistent, complete, exercisable" |
| S45 | "Disclose information progressively" và "Readers are more likely to be receptive to longer documents that progressively disclose new information to them when they need it." |
| S41 | Chưa mở được, paywall. Không dùng làm bằng chứng. |

---

## 3. Việc cụ thể còn phải làm

| Việc | Ở đâu | Xong khi |
| --- | --- | --- |
| Điền bốn thẻ còn lại | Mục 3.2-3.5 của báo cáo 5 tầng | Mỗi thẻ đủ tám slot S1-S8 theo khuôn 3.0, không slot nào bỏ trống |
| Chốt cột Control plane | Mục 2.4 | Mỗi dòng SR có đúng một `own`, hoặc ghi `chưa có chủ` |
| Viết danh sách bảo đảm không có chủ | Mục 4.2 | Mỗi dòng có nơi dựng và một kiểm tra ở 6.2 |
| Chốt ngưỡng mọi giả thuyết | Mục 6.1 | Mỗi giả thuyết có ngưỡng số và có ngày đặt trước ngày chạy |
| Viết ADR đầu tiên | `docs/adr/0001-*.md` | Một trang, đủ Context, Decision, Alternatives, Consequences |
| Thêm mục Commands | `AGENTS.md` mục 6 | Có lệnh setup, chạy, test đã chạy được ít nhất một lần |

---

## 4. Checklist trước khi gửi review

- [ ] Mỗi khẳng định về nguồn ngoài có ID trong sổ nguồn, và ID đó đã mở.
- [ ] Nguồn chưa mở được ghi rõ là chưa mở, không nằm chung với nguồn đã kiểm.
- [ ] Không có bảng xếp hạng hay điểm tổng giữa các phương án khác bản chất.
- [ ] Mỗi bảng chấm chỉ dùng tiêu chí của chính đối tượng đang chấm.
- [ ] Mọi số đo chưa chạy ghi `chưa đo`, không ghi `0`, không suy đoán.
- [ ] Mỗi số đo đã chạy có lệnh tạo ra nó.
- [ ] Ngưỡng đạt ghi trước lần chạy, không sửa sau khi thấy số.
- [ ] Kết quả âm và kết quả không kết luận vẫn còn trong tài liệu.
- [ ] Thân bài không vượt ngân sách độ dài đã đặt.
- [ ] Đã cập nhật dòng của file trong `REVIEW-STATUS.md`.

---

## 5. Không áp dụng nguyên xi

Nguồn ngoài viết cho bối cảnh lớn hơn lab tám tuần. Dưới đây là bản rút, và lý do.

| Practice gốc | Vì sao không áp dụng nguyên xi | Bản dùng ở đây |
| --- | --- | --- |
| ATAM là hội thảo nhiều người, nhiều ngày | Lab có một người làm, một mentor review | Liệt kê rủi ro và điểm đánh đổi trên giấy, không tổ chức hội thảo |
| Preregistration công khai trên OSF | Không có dữ liệu người, không cần registry | Ghi ngưỡng vào file trước khi chạy, kèm ngày |
| Artifact evaluation có reviewer độc lập chạy lại | Chưa có code, chưa có reviewer ngoài | Một lệnh chạy ra số, ghi môi trường và phiên bản |
| Diátaxis đủ bốn loại tài liệu | Lab chưa có tutorial hay how-to ổn định | Chỉ dùng explanation và reference, thêm how-to khi có code |
| Technology Radar bốn vòng xuất bản định kỳ | Không xuất bản radar | Mượn tên vòng làm nhãn khuyến nghị, không mượn quy trình |

---

## Phụ lục A. Sổ nguồn

Mười hai nguồn dưới đây được dùng cho bảng 1. Cột "đã mở" ghi đúng thực tế, không ghi theo mong muốn.

| ID | Nguồn | Loại | URL | Đã mở | Dùng cho |
| --- | --- | --- | --- | --- | --- |
| S34 | Nygard, Documenting Architecture Decisions | Analysis, 2011-11-15 | https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions | Có, đọc nguyên văn | P7, P8 |
| S35 | SEI, ATAM: Method for Architecture Evaluation | Report, CMU/SEI-2000-TR-004 | https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf | Có, đọc nguyên văn | P3 |
| S36 | Gartner, How Products and Services Are Evaluated in Critical Capabilities | Docs, bản PDF công bố | https://emt.gartnerweb.com/ngw/globalassets/en/research/documents/products-services-evaluated-gartner-critical-capabilities.pdf | Có, đọc nguyên văn | P1, P4 |
| S37 | Thoughtworks Technology Radar FAQ | Docs, Vol 35 | https://www.thoughtworks.com/radar/faq | Có, đọc nguyên văn | Nhãn khuyến nghị |
| S38 | Diátaxis, The map | Docs | https://diataxis.fr/map/ | Có, đọc nguyên văn | P10 |
| S39 | Principles of Chaos Engineering | Docs, cập nhật 2019-03 | https://principlesofchaos.org/ | Có, đọc nguyên văn | P11 |
| S40 | ISO/IEC/IEEE 42010, Conceptual Model | Spec, ấn bản 2022 | http://www.iso-architecture.org/42010/cm/ | Có, đọc nguyên văn | P2 |
| S41 | Belton và Gear, On a short-coming of Saaty's method | Paper, Omega 11(3), 1983 | https://doi.org/10.1016/0305-0483(83)90047-6 | **Không, paywall** | P6, chỉ ghi nhận |
| S42 | Center for Open Science, Preregistration | Docs | https://www.cos.io/initiatives/prereg | Có, đọc nguyên văn | P13 |
| S43 | NASA, SWE-068 Evaluate Test Results | Handbook, bản D | https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695451/SWE-068+-+Evaluate+Test+Results | Có, đọc nguyên văn | P12, P14 |
| S44 | cTuning, Artifact Reviewing Guide | Docs, V20201122 | https://ctuning.org/ae/reviewing-20201122.html | Có, đọc nguyên văn | P15 |
| S45 | Google, Organizing large documents | Docs | https://developers.google.com/tech-writing/two/large-docs | Có, đọc nguyên văn | P9 |

Ghi chú: trang S45 chỉ nói về progressive disclosure, không nói về việc đưa tài liệu tham chiếu ra phụ lục.
Quy ước tách phụ lục ở đây dựa trên P10 và P8, không dựa trên S45.

## Nhật ký revision

| Ngày | Người | Thay đổi | Trạng thái |
| --- | --- | --- | --- |
| 2026-11-13 | Agent (Pi) | Tạo file, gom 16 practice từ bốn lane nghiên cứu, kiểm lại nguyên văn 11/12 nguồn | Chưa review |
| 2026-11-13 | Agent (Pi) | Sửa hai dòng ở mục 3 cho khớp khung 8 slot của `research/04-khao-sat-5-mo-hinh.md` v0.3 (bản 0.2 đã xóa) | Chưa review |
