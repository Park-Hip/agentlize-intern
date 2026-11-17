<!--
Tiêu đề: câu mệnh lệnh ngắn bằng tiếng Anh, giống commit message (ví dụ "Add employee lookup tool").
PR cuối của một issue ghi "Closes #12". PR giữa chừng ghi "Refs #12".
-->

Closes #

## Đọc nhanh

<!-- 1-3 câu: PR đổi gì và vì sao. -->

## Thay đổi

-

## Cách kiểm chứng

<!-- Lệnh đã chạy và kết quả. Với bug: test hỏng trước khi sửa, qua sau khi sửa. -->

## Rủi ro và việc còn lại

<!-- Điều reviewer cần để ý, việc tách sang issue khác. Không có thì ghi "Không". -->

## Checklist

- [ ] `python tools/check-docs.py` báo 0 problem(s).
- [ ] Test liên quan đã chạy và qua, lệnh ghi ở mục trên.
- [ ] Không có dữ liệu thật, khóa, token hay dữ liệu khách hàng trong code, log, fixture hay commit.
- [ ] Lệnh chạy thay đổi thì `AGENTS.md` mục 6 đã cập nhật.
- [ ] Kết quả đổi hướng thì `rd/findings.md` đã cập nhật.
