# Thứ tự tìm hiểu cho spec ghi an toàn

Ngày: 2026-11-24. Trạng thái: kế hoạch, chưa bắt đầu việc nào; không việc nào phải chờ người khác trả lời.

File này liệt kê những gì phải tìm hiểu để chọn phương án trong [spec ghi an toàn](write-safety-spec.md), và làm theo thứ tự nào.
Mỗi việc có một câu hỏi, cách làm, giới hạn thời gian, nơi ghi kết quả và mục nó mở khoá.
Kết quả ghi vào tài liệu của chủ đề, rồi spec trỏ về đó.

Cột "Mở khoá" dùng tên ngắn: "Phương án" là [các phương án thiết kế](write-safety-options.md), "Đo" là [kế hoạch đo Q3](q3-measurement-plan.md).

## Đọc nhanh

- Có ba việc tìm hiểu, làm theo thứ tự phụ thuộc.
- Hai việc làm ngay và song song: đọc tài liệu của Lark về cách nó nhận lệnh ghi, và đọc cách các hệ thống lớn ghi an toàn.
- Việc thứ ba làm sau khi chọn thiết kế: cách kiểm thử trên một Lark thử.
- Không việc nào phải chờ người khác trả lời.
- Xong thì chọn phương án, viết quyết định kiến trúc mới và mở việc cho từng phần.

## 1. Cách sắp thứ tự

Hai quy tắc:

1. Việc không phụ thuộc ai làm trước.
2. Việc cần kiến trúc đã chốt, như kiểm thử trên hệ thống thật, làm sau cùng.

Mỗi việc có giới hạn thời gian.
Hết giờ mà chưa có câu trả lời thì ghi điều đã biết, điều chưa biết và cách kiểm tiếp, rồi chuyển việc sau.

**Kết luận:** thứ tự do phụ thuộc quyết định, không do việc nào dễ.

## 2. Bảng tổng

| Mã | Việc | Đợt | Phụ thuộc | Giới hạn | Mở khoá |
| --- | --- | --- | --- | --- | --- |
| R1 | API Lark: task, danh bạ, Base | 1 | Không | 1 ngày | Phương án 2, Đo 3 |
| R2 | Cách các hệ thống lớn ghi an toàn | 1 | Không | Nửa ngày mỗi nguồn, tối đa 3 ngày | Phương án 2 tới 10 |
| R3 | Kiểm thử trên hệ thống thật | 2 | R1, ADR-0009 | Nửa ngày | Đo 4, phép thử hợp đồng |

**Kết luận:** R1 điền bản khai năng lực mà mọi bộ tiếp hợp thật cần, R2 quyết định phương án nào được đo; cả hai không phụ thuộc ai nên làm ngay.

## 3. Đợt 1: làm ngay

### 3.1. R1. API Lark

Câu hỏi: hệ thống Lark nào làm được nguồn danh bạ và nguồn task, và nó bảo đảm được gì khi ghi?

Cách làm: đọc tài liệu Open API của Lark cho Contacts, Task và Base.
Mỗi API ghi:

- Có mã chống ghi trùng không, ví dụ `client_token`.
- Có số phiên bản hay cách phát hiện dữ liệu đã đổi không.
- Giới hạn tốc độ.
- Gọi bằng khoá của ứng dụng hay khoá của từng người; cần những quyền (scope) nào.
- Bảng mã trả về, và mã nào nghĩa là "chưa làm", "đã làm" hay "không biết".
- Có tenant thử, tức một Lark riêng để thử, để chạy phép thử không.

Đầu ra: `rd/research/lark-open-api.md`, kèm script kiểm câu trích trong `rd/checks/`.

Xong khi: mỗi dòng trên có câu trả lời kèm nguồn, và có bảng "API → mức bảo đảm khi ghi".

**Kết luận:** chưa có.

### 3.2. R2. Cách các hệ thống lớn ghi an toàn

Câu hỏi: với mỗi chuyện phải quyết ở [các phương án thiết kế](write-safety-options.md), hệ thống lớn đã chọn phương án nào, và vì sao?

Cách làm: đọc các nguồn công khai trong [các phương án thiết kế, mục 11](write-safety-options.md#11-cần-đọc-gì-trước-khi-chọn), mỗi nguồn nửa ngày.
Với mỗi nguồn ghi: nó ủng hộ phương án nào, nó cho thấy phương án nào còn thiếu, và nó có ca nào Lab chưa nghĩ tới.

Đầu ra: ghi thẳng vào mục tương ứng của [các phương án thiết kế](write-safety-options.md), kèm script kiểm câu trích `rd/checks/write-safety-options.sh`.

Xong khi: mỗi mục từ 2 tới 10 có ít nhất một nguồn ngoài, và cột "Đang nghiêng về" được giữ hay đổi kèm lý do.

**Kết luận:** chưa có.

## 4. Đợt 2: khi kiến trúc đã rõ

### 4.1. R3. Kiểm thử trên hệ thống thật

Câu hỏi: chạy lại SR1-SR8 (tám yêu cầu chung của PRD) trên một Lark thử thế nào, và phép thử hợp đồng hằng ngày cho bộ tiếp hợp Lark gồm những gì?

Đầu ra: [kế hoạch đo Q3, mục 4](q3-measurement-plan.md#4-kế-hoạch-đo).

**Kết luận:** chưa có.

## 5. Sau hai đợt

1. Cập nhật spec ghi an toàn và các tài liệu đi cùng bằng kết quả tìm hiểu, nhất là các ô "Chưa kiểm" của bản khai năng lực ở [các phương án thiết kế, mục 2](write-safety-options.md#2-đích-mô-tả-năng-lực-ghi-của-nó-thế-nào).
2. Viết ADR-0009, và ADR mới cho những ADR có điều kiện "xem lại" đã tới.
3. Mở issue theo từng thành phần.

**Kết luận:** spec chỉ đổi khi có kết quả tìm hiểu kèm nguồn.
