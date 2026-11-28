# Tương thích client MCP bên ngoài: MausBot đăng ký thế nào

Ngày: 2026-11-28. Trạng thái: đã kiểm trên bản MausBot cài thật 0.1.184; đề xuất đăng ký trước, có một rào cản ở giữ đúng người.

## Đọc nhanh

- Câu hỏi: ứng dụng bên ngoài như MausBot có nối được vào cổng Lab không, và nối bằng cách nào.
- Đã kiểm bản MausBot cài trên máy, không chỉ đọc nhãn hỗ trợ công cụ.
- Bản này đăng ký động được, hoặc dùng mã ứng dụng đăng ký trước; nó không dùng được tài liệu định danh ứng dụng.
- Một điểm chặn thật: trên máy để bàn, một máy chủ chỉ giữ một lần đăng nhập, nên người thứ hai đăng nhập sẽ thay chỗ người thứ nhất.
- Việc tiếp theo: Lab thêm một ứng dụng đăng ký trước, và ghi rõ giới hạn một người trên mỗi máy cho tới khi kiểm lại.

## 1. Câu hỏi, phạm vi và cách kiểm

MausBot là ứng dụng agent tự cài, một client MCP bên ngoài mà Lab muốn nhận.
Câu hỏi: bản MausBot cụ thể dùng cách đăng ký nào, quay về địa chỉ nào, và có giữ kết nối riêng theo từng người không.
Phạm vi là chiều ứng dụng gọi vào cổng `/mcp` của Lab; chiều ngược lại không thuộc lần kiểm này.

Thời gian kiểm ban đầu giới hạn 4 giờ theo issue.
Lần này kiểm bản cài tại máy, đọc mã đi kèm bản cài và chạy chính mã đó với một máy chủ cấp quyền giả trên `127.0.0.1`.
Không cần tài khoản trả phí, không cần gói doanh nghiệp, không gọi mô hình nên chi phí bằng 0.

| Điều | Giá trị quan sát được |
| --- | --- |
| Bản cài | `OpenMausBot.exe`, FileVersion `0.1.184` |
| Mã đi kèm | `resources/server`, đọc được dạng ESM, không nén |
| Mốc nguồn để trích | tag `v0.1.184`, tức `aa64baefae8d94c5b032b4e0745b3d7fb7a07658` |
| Bản mới nhất đã xem | `v0.1.186` |
| Tệp OAuth của client | `server/mcp-oauth.js`, `mcp-oauth-discovery.js`, `mcp-oauth-store.js` |
| Tài khoản cần có | không, cho toàn bộ phép kiểm dưới đây |

Dữ liệu thô, lệnh chạy lại và mã băm của ba tệp nằm ở `scratch/oauth-client-compatibility/` (không commit).
Mã băm chứng minh phép kiểm chạy đúng mã trong bản cài, không phải một bản chép.

**Kết luận:** câu trả lời dưới đây dựa trên bản cài thật, nên dùng được làm bằng chứng cho issue #186.

## 2. Ba cách đăng ký, và bản này dùng cách nào

Đăng ký trước (pre-registration) là Lab khai mã ứng dụng và địa chỉ quay về trước khi kết nối.
Tài liệu định danh ứng dụng (Client ID Metadata Document) là một tệp JSON ở địa chỉ HTTPS, dùng chính địa chỉ đó làm mã ứng dụng.
Đăng ký động (Dynamic Client Registration) là ứng dụng tự xin một mã mới qua API lúc kết nối.

Bản cài 0.1.184 chỉ có hai đường: đăng ký động, hoặc dùng ứng dụng đã đăng ký trước.
Nó không đọc trường `client_id_metadata_document_supported` ở đâu cả, nên gặp máy chủ chỉ nhận tài liệu định danh thì dừng.

| Máy chủ cấp quyền công bố | Bản 0.1.184 làm gì | Quan sát |
| --- | --- | --- |
| Có `registration_endpoint` | Tự đăng ký một ứng dụng mới cho mỗi lượt đăng nhập | Đăng nhập được; hai người tạo hai mã ứng dụng |
| Chỉ có tài liệu định danh, không có đăng ký động | Dừng với lỗi `no-registration` | Không đăng nhập được |
| Chỉ nhận ứng dụng đăng ký trước | Dùng mã ứng dụng đã khai trong cấu hình | Đăng nhập được |

Với đường đăng ký động, ứng dụng xin đúng ba điều: loại `authorization_code` và `refresh_token`, kiểu trả `code`, và cách xác thực `none`.
Cách xác thực `none` nghĩa là nó tự nhận mình là ứng dụng công khai, không giữ bí mật.
Đó là điều hợp lý cho ứng dụng chạy trên máy người dùng, và cũng là điều Lab phải chấp nhận nếu muốn nhận client kiểu này.

Bản mới nhất 0.1.186 đã nhận ra trường tài liệu định danh, nhưng chỉ để báo rõ là chưa hỗ trợ.
Vì vậy kết luận "chưa dùng được tài liệu định danh" vẫn đúng ở bản mới nhất đã phát hành.

**Kết luận:** chọn đăng ký trước cho Lab; đăng ký động là đường dự phòng, tài liệu định danh chưa dùng được.

## 3. Địa chỉ quay về và nơi đổi token

Địa chỉ quay về của một ứng dụng đăng ký trước là một cổng cố định trên máy chạy MausBot: `http://127.0.0.1:<cổng>/mcp-oauth/callback`.
Cổng không cố định toàn cục mà tính từ địa chỉ máy chủ MCP, nên mỗi máy chủ có một cổng riêng.
Ba ví dụ tính được trên máy này:

| Địa chỉ máy chủ MCP | Địa chỉ quay về |
| --- | --- |
| `https://lab.example.test/mcp` | `http://127.0.0.1:35582/mcp-oauth/callback` |
| `https://127.0.0.1:8790/mcp` | `http://127.0.0.1:31472/mcp-oauth/callback` |
| `http://127.0.0.1:8790/mcp` | `http://127.0.0.1:20757/mcp-oauth/callback` |

Lab phải đăng ký đúng cổng đó trước, và MausBot hiện cổng cần đăng ký ngay trong màn hình cấu hình.
Nếu cổng đang bị chương trình khác giữ, lượt đăng nhập dừng và báo rõ, chứ không đổi sang cổng khác.

Token đổi ở phía máy chủ ứng dụng, không ở trình duyệt.
Trình duyệt chỉ mang mã cấp quyền về cổng trên; máy chủ MausBot đổi mã lấy token, rồi giữ token trong tệp riêng chỉ chủ máy đọc được.
Token không nằm trong tệp cấu hình chung và không trả ra qua API.

Với ứng dụng giữ bí mật, MausBot gửi bí mật bằng Basic ở đầu yêu cầu đổi token.
Với ứng dụng công khai, nó gửi mã ứng dụng trong thân yêu cầu và không có bí mật.
Cả hai trường hợp đều gửi kèm bí mật PKCE và địa chỉ tài nguyên, đúng hợp đồng ở [kế hoạch, mục 3](../design/oauth-plan.md#3-hợp-đồng-giao-thức-tối-thiểu).

**Kết luận:** Lab đăng ký trước đúng địa chỉ `127.0.0.1:<cổng>/mcp-oauth/callback`; đó là điều kiện cần để lượt đăng nhập đầu tiên chạy được.

## 4. Một người hay nhiều người trên cùng một máy

Đây là điểm chặn quan trọng nhất, và nó khác giữa bản để bàn và bản nhóm.

Trên một bản để bàn, mỗi tên máy chủ chỉ giữ một bản ghi đăng nhập.
Bản ghi đó chứa token, và lần đăng nhập sau ghi đè lần trước.
Kiểm bằng cách cho chị Hoa đăng nhập rồi anh Nam đăng nhập cùng một máy chủ: sau bước thứ hai, chỗ giữ token chỉ còn token của anh Nam.

| Bước | Token đang giữ cho máy chủ đó |
| --- | --- |
| Chị Hoa đăng nhập | `token-for-hoa` |
| Anh Nam đăng nhập | `token-for-nam` |
| Số bản ghi cho máy chủ | 1 |

Nghĩa là một client_id vẫn giữ được grant riêng của Hoa và của Nam ở phía Lab, nhưng MausBot để bàn không giữ nổi cả hai ở phía nó.
Muốn hai người cùng dùng thì phải hai máy, hoặc hai tên máy chủ trỏ tới hai địa chỉ khác nhau.

Bản nhóm thì khác: mỗi thành viên có một bộ quản lý đăng nhập riêng, lưu ở tệp riêng theo người.
Mã nguồn ghi rõ là "a manager of their own, so flows and tokens never meet another person's".
Điều này đúng cho bản nhóm chạy trên máy chủ, chưa kiểm bằng lần chạy thật vì cần một nhóm có tài khoản.

Điều này chạm thẳng vào SR1 (danh tính và một cửa ghi) và SR8 (dùng lại, quyền theo người).
Nếu Lab nhận một client để bàn cho nhiều người, hai người dùng chung một máy sẽ lẫn danh tính ở phía client.
Cổng vẫn đúng người theo token nhận được, nhưng client không còn giữ được token của cả hai.

**Kết luận:** một người trên mỗi bản để bàn; nhiều người chỉ khi dùng bản nhóm, và điều đó phải kiểm riêng trước khi hứa.

## 5. Mạng, TLS và cách đọc lỗi

Client chạy trong tiến trình MausBot, không phải trong trình duyệt, nên nó tự gọi mạng.
Vì vậy địa chỉ Lab phải tới được từ chính máy chạy MausBot, không chỉ từ trình duyệt của người dùng.

Một số điều kiện làm client từ chối ngay, không có màn hình đăng nhập để người dùng thấy:

| Điều kiện | Kết quả | Đọc ra là lỗi gì |
| --- | --- | --- |
| Máy chủ không trả về thông tin cấp quyền | Từ chối | Báo máy chủ không hỗ trợ đăng nhập OAuth |
| Thông tin cấp quyền thiếu PKCE S256 | Từ chối | Cùng câu báo trên, không nói rõ thiếu PKCE |
| Issuer trong thông tin khác địa chỉ đã hỏi | Từ chối | Cùng câu báo trên |
| Không kết nối được tới máy chủ | Từ chối | Cùng câu báo trên |

Điểm đáng chú ý: lỗi mạng và lỗi cấu hình đều ra cùng một câu "máy chủ này không hỗ trợ đăng nhập OAuth".
Vì vậy khi Lab chưa nối được, không thể đọc câu báo của MausBot để biết là lỗi DNS, lỗi TLS hay lỗi metadata.
Người kiểm phải tự tách ba lớp: gọi được địa chỉ chưa, chứng chỉ có tin không, rồi metadata có đúng không.

Về chứng chỉ: các lời gọi OAuth dùng `fetch` mặc định của Node, không nhận tệp CA riêng cho từng lời gọi.
Muốn tin một CA thử thì phải đặt biến môi trường cho cả tiến trình, ví dụ `NODE_EXTRA_CA_CERTS`.
Điều này chưa kiểm trên bản cài, nên ghi là chưa biết chứ không phải đã đạt.

**Kết luận:** địa chỉ Lab phải tới được từ máy chạy MausBot, và mọi lỗi trước khi đăng nhập đều ra một câu chung, nên phải tự tách lớp khi chẩn đoán.

## 6. Đề xuất: một phương án trước

Đề xuất đúng một phương án: **Lab thêm một ứng dụng đăng ký trước cho MausBot**, loại công khai, không bí mật.

Lý do chọn đường này:

- Bản cài 0.1.184 đăng nhập được bằng ứng dụng đăng ký trước, đã kiểm chạy thật.
- Đó là thay đổi cấu hình, không phải thêm endpoint mới, nên không mở thêm bề mặt tấn công.
- Nó hợp với mặc định hiện tại của Lab: đăng ký động vẫn tắt, và chưa công bố hỗ trợ tài liệu định danh, đúng [kế hoạch, mục 9.1](../design/oauth-plan.md#91-client-bên-ngoài-đăng-ký-thế-nào).
- Không phải triển khai CIMD hay DCR, nằm ngoài phạm vi issue này.

Mức trần hợp lý cho ứng dụng này là mức thấp nhất, tức lớp dữ liệu nội bộ chung, không gồm số điện thoại hay địa chỉ nhà.
Ứng dụng tự cài trên máy người dùng không đáng tin để nhận dữ liệu cá nhân, đúng [ADR-0010](../../docs/adr/adr-0010-client-data-ceiling.md).

Cấu hình Lab cần cho ứng dụng đó:

| Trường | Giá trị |
| --- | --- |
| Mã ứng dụng | một mã cố định, ví dụ `mausbot-desktop` |
| Địa chỉ quay về | `http://127.0.0.1:<cổng>/mcp-oauth/callback`, cổng tính từ địa chỉ `/mcp` của Lab |
| Cách xác thực | `none`, ứng dụng công khai, bắt buộc PKCE S256 |
| Phạm vi cho phép | `mcp:read` và `mcp:propose`, không có phạm vi ghi trực tiếp |
| Mức trần dữ liệu | mức thấp nhất, chỉ dữ liệu nội bộ chung |
| Kiểu client | công khai, không giữ bí mật |

Điều kiện đạt cho issue #186:

- Lượt đăng nhập từ bản MausBot cài thật hoàn tất, đổi được token, gọi được một công cụ đọc.
- Đăng nhập bằng cổng đã đăng ký đúng, sai cổng thì bị từ chối.
- Token chỉ dùng được cho `/mcp`, không dùng được cho cửa khóa cũ.

Rào cản phải ghi rõ, không giấu: mỗi bản để bàn chỉ giữ một người.
Muốn chứng minh hai người, phải dùng bản nhóm hoặc hai máy, và phải kiểm riêng.

**Kết luận:** chọn đăng ký trước, ứng dụng công khai, mức trần thấp nhất; đây là đường duy nhất vừa có bằng chứng chạy thật vừa nằm trong phạm vi.

## 7. Ma trận kiểm và điều còn thiếu

Ma trận dưới đây là phần Lab cần chạy ở issue #186 và #187.
Cột "Đã kiểm" nói lần này kiểm được tới đâu trên bản cài, không phải Lab đã đạt.

| Phép kiểm | Cách làm | Đã kiểm | Điều kiện đạt |
| --- | --- | --- | --- |
| Khám phá thông tin cấp quyền | Trỏ MausBot vào `/mcp` của Lab, xem có hiện nút Đăng nhập | Một phần, bằng máy chủ giả | Hiện nút Đăng nhập, không báo thiếu OAuth |
| Đăng ký trước đúng cổng | Điền mã ứng dụng và cổng đã đăng ký | Chưa, cần Lab chạy | Đổi được token, gọi được công cụ |
| Cổng sai bị từ chối | Cố tình đăng ký sai cổng | Chưa | Lượt đăng nhập dừng, không cấp token |
| PKCE bắt buộc | Bỏ `code_challenge` khỏi yêu cầu cấp mã | Chưa | Lab từ chối, đúng SR5 (không chắc thì chặn) |
| Tài nguyên đúng `/mcp` | Đổi `resource` sang địa chỉ khác | Chưa | Lab từ chối, token không dùng được ở cửa khác |
| Token theo người | Hoa và Nam đăng nhập | Đã kiểm trên client, thấy chặn | Trên bản nhóm: hai token riêng, thu hồi Nam không ảnh hưởng Hoa |
| Mạng từ máy client | Gọi từ chính máy hoặc container chạy MausBot | Chưa | Tới được HTTPS của Lab, tin đúng CA thử |
| Tin CA thử | Đặt `NODE_EXTRA_CA_CERTS` cho tiến trình | Chưa biết | Không tắt kiểm TLS mà vẫn đăng nhập được |
| Thu hồi | Ngắt kết nối trong MausBot | Chưa | Token bị thu hồi ở Lab, gọi công cụ bị chặn |

Ba điều chưa kiểm được trong 4 giờ, ghi lại thành rào cản cụ thể:

- **Lượt đăng nhập thật vào Lab**: Lab chưa có máy chủ cấp quyền; việc này thuộc #180 tới #184.
- **Tin CA thử trên máy chạy MausBot**: cần biết tiến trình nào gọi mạng và biến môi trường nào tới được nó.
- **Bản nhóm nhiều người**: cần một nhóm có tài khoản và máy chủ; không có trong môi trường hiện tại.

Những điều này không làm H1 trượt: chúng là việc của issue sau, không phải kết quả lần kiểm này.

**Kết luận:** phần đã có bằng chứng là đăng ký, callback và giới hạn một người; phần còn thiếu là lượt chạy thật với Lab và cấu hình CA.

## 8. Kiểm lại bằng chứng

Các trích dẫn nguồn ngoài được kiểm lại bằng một lệnh:

```bash
bash rd/checks/oauth-client-compatibility.sh
```

Script mở từng tệp đã ghim ở tag `v0.1.184` và tag `v0.1.186`, so khớp nguyên văn sau khi bỏ thẻ và gộp khoảng trắng.
Script kiểm câu chữ của nguồn, không kiểm một lượt đăng nhập thật.
Phép kiểm chạy thật nằm ở `scratch/oauth-client-compatibility/`, giữ lại để chạy lại khi cần.

Bản cài đổi rất nhanh, nên mọi kết luận ở đây gắn với số bản.
Bản 0.1.186 đã khác bản 0.1.184 ở phần nhận ra tài liệu định danh, nên phải đọc lại khi nâng bản.

**Kết luận:** kết quả gắn với bản 0.1.184; nâng bản thì chạy lại script và đọc lại mục 2 và mục 4 trước khi giữ kết luận.
