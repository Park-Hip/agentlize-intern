#!/usr/bin/env bash
# Kiểm nguồn cho ba câu trả lời của bước 0 trong rd/design/simulation-update-plan.md,
# được ghi vào rd/problem/open-problems.md (mục 2.4 P4, mục 2.8 P9, mục 3.1 P12).
#
# Mỗi dòng mở một trang công khai, bỏ thẻ HTML, gộp khoảng trắng rồi so khớp nguyên văn.
# check_absent dùng cho tham số phải vắng mặt, ví dụ chỗ chứng minh lệnh sửa không có
# số phiên bản hay mã chống ghi trùng.
# Trang Lark trả bản tiếng Anh khi gửi Accept-Language, nên hàm check gửi header đó.
# Không cần đăng nhập, không dùng khoá hay tài khoản thật.
#
# Cách chạy: bash rd/checks/open-problems.sh
# Ngày chạy đầu: 2026-11-24; cập nhật 2026-11-25 cho câu trả lời ở P4, P9 và P12.

set -u
PASS=0
FAIL=0
UA="Mozilla/5.0"

norm() { sed -e 's/<[^>]*>//g' | tr -s ' \n\t' ' '; }

fetch() { # $1 url
  curl -sL --compressed --max-time 45 -A "$UA" -H "Accept-Language: en-US,en;q=0.9" "$1" 2>/dev/null
}

check() { # $1 url, $2 câu trích, $3 nhãn nguồn
  local body
  body=$(fetch "$1" | norm)
  if [ -z "$body" ]; then
    printf 'BLOCKED | %-58s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
    return
  fi
  case "$body" in
    *"$2"*)
      printf 'PASS    | %s\n' "$3"
      PASS=$((PASS + 1))
      ;;
    *)
      printf 'MISS    | %-58s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

check_absent() { # $1 url, $2 chuỗi phải vắng, $3 nhãn nguồn
  local body
  body=$(fetch "$1")
  if [ -z "$body" ]; then
    printf 'BLOCKED | %-58s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
    return
  fi
  case "$body" in
    *"$2"*)
      printf 'MISS    | %-58s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      ;;
    *)
      printf 'PASS    | %s\n' "$3"
      PASS=$((PASS + 1))
      ;;
  esac
}

BASE="https://open.larkoffice.com/document/server-docs/docs/bitable-v1/app-table-record"
TOKEN="https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token"
TOKEN_OLD="https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/authen-v1/oidc-refresh_access_token/create.md"
ACHECKIN="https://help.acheckin.vn/chuc-nang-cham-cong/quan-ly-va-theo-doi-don-bao-lam-them"
TOKEN_REFRESH="$TOKEN/refresh-user-access-token-v3.md"

# --- Q1: Lark Base có ghi có điều kiện hay mã chống ghi trùng? ---
# Tạo bản ghi: có mã chống ghi trùng.
check "$BASE/create.md" \
  "The format is a standard uuidv4, the unique identifier of the operation, used for idempotent update operations." \
  "Q1 tạo một bản ghi có client_token"
check "$BASE/create.md" \
  "This value is null to indicate that a new request will be initiated, and this value is non-null to indicate idempotent update operations." \
  "Q1 client_token đánh dấu lần gọi có thể lặp"
check "$BASE/create.md" \
  "Idempotent key conflict, you need to randomly generate an idempotent key" \
  "Q1 mã trùng trả lỗi 1255006"
check "$BASE/create.md" \
  "Same API requests are submitted repeatedly." \
  "Q1 gửi lặp yêu cầu trả lỗi 1254608"
check "$BASE/batch_create.md" \
  "The format is a standard uuidv4, the unique identifier of the operation, used for idempotent update operations." \
  "Q1 tạo nhiều bản ghi có client_token"
check "$BASE/create.md" \
  "tenant_access_token" \
  "Q1/R2 Base nhận khoá ứng dụng"
check "$BASE/create.md" \
  "user_access_token" \
  "Q1/R2 Base nhận khoá người"

# Sửa bản ghi: không có mã chống ghi trùng, không có điều kiện phiên bản.
check "$BASE/update.md" \
  "HTTP Method | PUT" \
  "Q1 sửa một bản ghi là PUT"
check "$BASE/update.md" \
  "record last modified timestamp" \
  "Q1 sửa bản ghi trả last_modified_time"
check "$BASE/update.md" \
  "The same data table does not support concurrent calls to the write interface" \
  "Q1 ghi đồng thời bị chặn ở mức bảng"
check_absent "$BASE/update.md" \
  "client_token" \
  "Q1 sửa một bản ghi không có client_token"
check_absent "$BASE/update.md" \
  "If-Match" \
  "Q1 sửa một bản ghi không có If-Match"
check_absent "$BASE/update.md" \
  "version" \
  "Q1 sửa một bản ghi không có số phiên bản"
check_absent "$BASE/update.md" \
  "etag" \
  "Q1 sửa một bản ghi không có etag"
check_absent "$BASE/batch_update.md" \
  "client_token" \
  "Q1 sửa nhiều bản ghi không có client_token"

# --- Q2: token người dùng Lark sống bao lâu và đổi mới thế nào? ---
check "$TOKEN/get-user-access-token-v3.md" \
  'The `refresh_token` can only be used once.' \
  "Q2 token làm mới chỉ dùng một lần"
check "$TOKEN/get-user-access-token-v3.md" \
  "rather than hardcoding the validity period" \
  "Q2 đọc expires_in thay vì viết cứng"
check "$TOKEN/get-user-access-token-v3.md" \
  '"expires_in": 7200' \
  "Q2 ví dụ token truy cập 7200 giây"
check "$TOKEN/get-user-access-token-v3.md" \
  '"refresh_token_expires_in": 604800' \
  "Q2 ví dụ token làm mới 604800 giây"
check "$TOKEN_REFRESH" \
  'The previous `refresh_token` will be invalidated immediately. The existing `user_access_token` is not affected and remains valid until its expiration time.' \
  "Q2 token làm mới cũ mất hiệu lực, token truy cập còn hạn vẫn dùng được"
check "$TOKEN_REFRESH" \
  "365 days after a user authorizes the application" \
  "Q2 sau 365 ngày phải xin cấp lại"
check "$TOKEN_REFRESH" \
  "The refresh token has been used. Please note that a refresh token can only be used once." \
  "Q2 dùng lại token làm mới trả lỗi 20073"
check "$TOKEN_REFRESH" \
  "The refresh token has been revoked. Please note that a refresh token can only be used once." \
  "Q2 token làm mới bị thu hồi trả lỗi 20064"
check "$TOKEN_REFRESH" \
  "The user status is invalid." \
  "Q2 tài liệu mới: trạng thái người dùng không hợp lệ trả lỗi 20066"
check "$TOKEN/get-user-access-token-v3.md" \
  '`refresh_token` and `refresh_token_expires_in` fields are only returned when the following permission is granted' \
  "Q2 token làm mới cần quyền offline_access"
check_absent "$TOKEN_REFRESH" \
  "token family" \
  "Q2 Lark không nói thu hồi cả họ token"
check_absent "$TOKEN_REFRESH" \
  "all tokens" \
  "Q2 Lark không nói thu hồi mọi token của người dùng"
check "$TOKEN_OLD" \
  "The maximum valid period of user_access_token is about 2 hours." \
  "Q2 tài liệu cũ: token truy cập khoảng 2 giờ"
check "$TOKEN_OLD" \
  "refresh_token valid period, unit: seconds, generally about 30 days" \
  "Q2 tài liệu cũ: token làm mới khoảng 30 ngày"
check "$TOKEN_OLD" \
  "If the old refresh_token is reused or the refresh_token has expired during the next refresh, this error will be reported." \
  "Q2 tài liệu cũ: dùng lại token làm mới trả lỗi 20038"
check "$TOKEN_OLD" \
  "User resigned" \
  "Q2 tài liệu cũ: người nghỉ việc trả lỗi 20021"
check "https://www.rfc-editor.org/rfc/rfc9700.txt" \
  "it will revoke the active refresh token." \
  "Q2 OAuth 2.1 chỉ đòi thu hồi token làm mới đang hoạt động"
check "https://www.rfc-editor.org/rfc/rfc9700.txt" \
  "The previous refresh token is invalidated" \
  "Q2 OAuth 2.1: token làm mới cũ bị vô hiệu"

# --- Q3: đơn nghỉ phép của ACheckin gồm trường nào và trạng thái nào? ---
# Bốn nhóm trường Email nhân viên, Chọn ngày, Lý do nghỉ, Nội dung lấy từ ảnh form
# trong trang quản lý đơn báo; script chỉ kiểm được câu văn, không đọc được ảnh.
check "$ACHECKIN.md" \
  "Khai báo tên lý do nghỉ. Ví dụ: Nghỉ phép, nghỉ không lương, đi công tác, nghỉ nửa ngày, xin làm muộn, xin về sớm,..." \
  "Q3 lý do nghỉ là danh mục công ty tự khai"
check "$ACHECKIN/huong-dan-bao-nghi.md" \
  "Chờ duyệt" \
  "Q3 trạng thái chờ duyệt"
check "$ACHECKIN/huong-dan-bao-nghi.md" \
  "Đồng ý" \
  "Q3 quản lý bấm đồng ý"
check "$ACHECKIN/huong-dan-bao-nghi.md" \
  "Từ chối" \
  "Q3 quản lý bấm từ chối"
check "$ACHECKIN/huong-dan-bao-nghi.md" \
  "Đã duyệt" \
  "Q3 lịch sử đơn đã duyệt"
check "$ACHECKIN/huong-dan-bao-nghi.md" \
  "điền thời gian, lý do nghỉ tới leader (quản lý) trực tiếp của mình" \
  "Q3 đơn nghỉ: thời gian, lý do, quản lý trực tiếp"
check "$ACHECKIN/huong-dan-bao-nghi.md" \
  "thu hồi đơn báo nghỉ khi leader chưa duyệt đơn và đơn vẫn chưa đến thời gian xin" \
  "Q3 thu hồi khi còn chờ duyệt và trước ngày nghỉ"
check "$ACHECKIN/huong-dan-bao-nghi.md" \
  "danh sách đơn hiển thị để" \
  "Q3 danh sách đơn chờ duyệt"
check "$ACHECKIN/huong-dan-bao-nghi.md" \
  "theo dõi lịch sử các đơn đã duyệt" \
  "Q3 lịch sử đơn đã duyệt"
check "$ACHECKIN.md" \
  "Nhập thông tin nhân viên thời gian và lý do nghỉ" \
  "Q3 quản lý tạo đơn hộ: nhân viên, thời gian, lý do"
check "$ACHECKIN.md" \
  "4 cấp duyệt" \
  "Q3 luồng duyệt tới 4 cấp"
check "$ACHECKIN.md" \
  "1 cấp duyệt" \
  "Q3 không bật luồng duyệt thì chỉ một cấp"
check "$ACHECKIN.md" \
  "nếu cấp trước từ chối đơn" \
  "Q3 cấp trước từ chối thì đơn bị từ chối"
check "$ACHECKIN.md" \
  "leader có thể duyệt đơn nghỉ trong vòng 30 ngày" \
  "Q3 hạn duyệt 30 ngày"
check "https://help.acheckin.vn/tinh-nang-moi-cap-nhat.md" \
  "thu hồi các loại đơn trên khi đơn ở trạng thái chờ duyệt" \
  "Q3 thu hồi khi đơn ở trạng thái chờ duyệt"

echo
printf 'Tổng: %d PASS, %d MISS/BLOCKED\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
