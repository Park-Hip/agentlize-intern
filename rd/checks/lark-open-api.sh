#!/usr/bin/env bash
# Kiểm nguồn cho rd/research/lark-open-api.md (Lark Task và Lark Contacts bảo đảm gì khi ghi).
# Mỗi dòng kiểm một câu trích: mở trang công khai, bỏ thẻ HTML, gộp khoảng trắng, so khớp nguyên văn.
# check_absent dùng cho điều phải vắng mặt, ví dụ chỗ chứng minh lệnh sửa không có client_token.
# Trang Lark trả bản tiếng Anh khi gửi Accept-Language, nên hàm check gửi header đó.
# Không cần đăng nhập, không dùng khoá hay tài khoản thật.
#
# Cách chạy: bash rd/checks/lark-open-api.sh
# Ngày chạy đầu: 2026-11-24.

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

TASK_OVERVIEW="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/overview.md"
TASK_CREATE="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/create.md"
TASK_PATCH="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/patch.md"
TASK_GET="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/get.md"
TASK_LIST="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/list.md"
TASK_SEARCH="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/search.md"
TASKLIST_TASKS="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/tasklist/tasks.md"
TASK_DELETE="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/delete.md"
TASK_ADD_MEMBERS="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/add_members.md"
TASK_REMOVE_MEMBERS="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/remove_members.md"
TASK_EVENT="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/events/update_user_access.md"
TASK_SUBSCRIPTION="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task_v2/task_subscription.md"
CUSTOM_FIELD="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/custom_field/custom-field-overview.md"
CONTACT_USER="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/contact-v3/user/get.md"
CONTACT_DEPT="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/contact-v3/department/get.md"
RATE_LIMIT="https://open.larksuite.com/document/ukTMukTMukTM/uUzN04SN3QjL1cDN.md"
ERRORS="https://open.larksuite.com/document/ukTMukTMukTM/ugjM14COyUjL4ITN.md"
TEST_COMPANY="https://open.larksuite.com/document/home/introduction-to-custom-app-development/testing-enterprise-and-personnel-functions.md"

# --- 3.1: tạo task, mã chống ghi trùng, thời hạn, phạm vi, nội dung ---
check "$TASK_CREATE" \
  'This api supports "idempotent invocation" by specifying `client_token` field.' \
  "3.1 tạo task nhận client_token"
check "$TASK_CREATE" \
  "Idempotent token. If provided triggers the dempotent behavior." \
  "3.1 client_token là mã chống ghi trùng"
check "$TASK_CREATE" \
  "Length range: \`10\` ～ \`100\` characters" \
  "3.1 client_token dài 10 tới 100 ký tự"
check "$TASK_OVERVIEW" \
  "The Lark Task system guarantees that, when using the same \`client_token\` for a request within a time period, no matter how many times it is called, only one task will be created." \
  "3.1 cùng client_token chỉ tạo một task"
check "$TASK_OVERVIEW" \
  "If the api is actually successful, the idempotent behavior will last for 5 minutes." \
  "3.1 nhớ mã 5 phút sau khi thành công"
check "$TASK_OVERVIEW" \
  "If the interface api fails, the same \`client_token\` will immediately be treated as a new token." \
  "3.1 lần gọi thất bại thì mã được coi là mới"
check "$TASK_OVERVIEW" \
  "Idempotent behaviors between different callers are isolated." \
  "3.1 nhớ mã tách theo người gọi"
check "$TASK_OVERVIEW" \
  "After access_token A uses the \`client_token\` to call the api, access_token B uses the same \`client_token\` will not be considered as an idempotent call to access_token A" \
  "3.1 token khác thì không nhận ra lệnh lặp"
check "$TASK_OVERVIEW" \
  "The behavior of an api request that uses the same \`client_token\` but provides different parameters is undefined." \
  "3.1 cùng mã khác nội dung là không xác định"
check "$TASK_OVERVIEW" \
  "it only checks the \`client_token\` to determine whether it is the same request in business semantics, but not check the all request parameters" \
  "3.1 Lark chỉ so mã, không so nội dung"
check "$TASK_OVERVIEW" \
  "When concurrently initiating multiple requests with the same \`client_token\` and completely identical parameters, only the first request to reach the server will be processed; the remaining requests will be automatically rejected and will receive an error code of \`code:1470422\`." \
  "3.1 gửi đồng thời cùng mã trả 1470422"
check "$TASK_OVERVIEW" \
  "the \`client_token\` cannot be used as a resource ID." \
  "3.1 client_token không phải mã bản ghi"
check "$TASK_OVERVIEW" \
  "Interfaces that currently support idempotent capabilities include:" \
  "3.1 chỉ một số API có chống ghi trùng"
check "$TASK_OVERVIEW" \
  "Supports adding, deleting, modifying, and querying tasks" \
  "2 task có thao tác xoá"

# --- 3.2: sửa task, không có mã chống ghi trùng, không có số phiên bản ---
check "$TASK_PATCH" \
  "To update a task, fill in all the field names to be updated in the \`update_fields\` field, and fill in the new value of the field to update in the \`task\` field." \
  "3.2 sửa task gửi update_fields và task"
check "$TASK_PATCH" \
  "updated_at | string | Last updated timestamp of the task (ms)" \
  "3.2 sửa task trả updated_at"
check "$TASK_PATCH" \
  "Task member/reminder/tasklist data cannot be updated by this api." \
  "3.2 sửa task không đổi được thành viên"
check_absent "$TASK_PATCH" \
  "client_token" \
  "3.2 sửa task không có client_token"
check_absent "$TASK_PATCH" \
  "If-Match" \
  "3.2 sửa task không có If-Match"

# --- 3.3: giao task và bỏ người phụ trách ---
check "$TASK_ADD_MEMBERS" \
  "Idempotent token. If provided, api supports idempotent invocation." \
  "3.3 thêm thành viên có client_token"
check "$TASK_ADD_MEMBERS" \
  "If the member to be added is already in the task, it is automatically ignored." \
  "3.3 thêm lại thành viên thì bỏ qua"
check "$TASK_ADD_MEMBERS" \
  "Rate Limit | [100 per minute]" \
  "3.3 thêm thành viên 100 lần mỗi phút"
check "$TASK_REMOVE_MEMBERS" \
  "if the member to be removed is not one of this task members, it will be automatically ignored." \
  "3.3 bỏ người không còn trong task thì bỏ qua"
check "$TASK_REMOVE_MEMBERS" \
  "Rate Limit | [100 per minute]" \
  "3.3 bỏ thành viên 100 lần mỗi phút"
check_absent "$TASK_REMOVE_MEMBERS" \
  "client_token" \
  "3.3 bỏ thành viên không có client_token"

# --- 3.4: dấu gắn và tra kết quả ---
check "$TASK_GET" \
  "extra | string | Custom data that accompanies the task." \
  "3.4 extra là dữ liệu đi kèm task"
check "$CUSTOM_FIELD" \
  "After defining a custom field in a tasklist, you can set the field value for the tasks in the tasklist." \
  "3.4 trường tuỳ ý đặt được cho task trong tasklist"
check "$CUSTOM_FIELD" \
  "text | Used to add customized text to tasks" \
  "3.4 trường tuỳ ý có kiểu text"
check "$TASK_SEARCH" \
  "Search for task information using task keywords, including task name, task link, task ID, and task description." \
  "3.4 tìm task chỉ theo từ khoá"
check "$TASK_LIST" \
  'Currently, only tasks of "my_tasks" are supported.' \
  "3.4 liệt kê task chỉ có my_tasks"
check "$TASK_LIST" \
  "Authorization | string | Yes | \`user_access_token\`" \
  "3.4 liệt kê task chỉ nhận token người dùng"
check "$TASK_LIST" \
  "extra | string | Custom data that accompanies the task." \
  "3.4 liệt kê task trả extra"
check_absent "$TASK_SEARCH" \
  "custom_fields" \
  "3.4 tìm task không lọc theo trường tuỳ ý"
check_absent "$TASK_SEARCH" \
  "extra" \
  "3.4 tìm task không lọc theo extra"
check_absent "$TASKLIST_TASKS" \
  "custom_fields" \
  "3.4 task của tasklist không trả trường tuỳ ý"
check_absent "$TASKLIST_TASKS" \
  "extra" \
  "3.4 task của tasklist không trả extra"

# --- 3.5: sự kiện khi task đổi ---
check "$TASK_EVENT" \
  "task.task.update_user_access_v2" \
  "3.5 sự kiện task.task.update_user_access_v2"
check "$TASK_EVENT" \
  "event_types" \
  "3.5 sự kiện có event_types"
check "$TASK_EVENT" \
  "task_guid" \
  "3.5 sự kiện có task_guid"
check "$TASK_EVENT" \
  "View task details(task:task:read)" \
  "3.5 sự kiện cần quyền task:task:read"
check "$TASK_SUBSCRIPTION" \
  "Using application identity, subscribe to change events for tasks currently managed by the application." \
  "3.5 đăng ký bằng danh tính ứng dụng"
check "$TASK_SUBSCRIPTION" \
  "Using user identity, subscribe to change events for tasks created, managed, or followed by the current user." \
  "3.5 đăng ký bằng danh tính người dùng"
check "$TASK_SUBSCRIPTION" \
  "Rate Limit | [10 per second]" \
  "3.5 đăng ký sự kiện 10 lần mỗi giây"

# --- 3.6: giới hạn tốc độ ---
check "$RATE_LIMIT" \
  "In general, frequency control strategy levels are applied on a per-API, per-application, and per-tenant basis." \
  "3.6 hạn mức theo API, ứng dụng và tenant"
check "$TASK_CREATE" \
  "Rate Limit | [10 per second]" \
  "3.6 tạo task 10 lần mỗi giây"
check "$TASK_PATCH" \
  "Rate Limit | [10 per second]" \
  "3.6 sửa task 10 lần mỗi giây"
check "$TASK_GET" \
  "Rate Limit | [10 per second]" \
  "3.6 đọc task 10 lần mỗi giây"
check "$TASK_DELETE" \
  "Rate Limit | [10 per second]" \
  "3.6 xoá task 10 lần mỗi giây"
check "$TASK_LIST" \
  "Rate Limit | [1000 per minute、50 per second]" \
  "3.6 liệt kê task 1000 lần mỗi phút, 50 lần mỗi giây"
check "$TASKLIST_TASKS" \
  "Rate Limit | [1000 per minute、50 per second]" \
  "3.6 task của tasklist 1000 lần mỗi phút, 50 lần mỗi giây"
check "$TASK_SEARCH" \
  "Rate Limit | [100 per minute]" \
  "3.6 tìm task 100 lần mỗi phút"
check "$RATE_LIMIT" \
  "When the limit threshold is exceeded, Lark will respond with an HTTP status code 429, which restricts further operations from the client for a specific duration." \
  "3.6 vượt hạn mức trả 429"
check "$RATE_LIMIT" \
  "x-ogw-ratelimit-reset" \
  "3.6 thời gian chờ trong x-ogw-ratelimit-reset"
check "$RATE_LIMIT" \
  "request trigger frequency limit" \
  "3.6 mã 99991400 là vượt hạn mức"
check "$RATE_LIMIT" \
  "For some older versions of OpenAPIs, you may receive a slightly different HTTP response (HTTP status code 400)." \
  "3.6 API cũ trả 400 thay cho 429"
check_absent "$RATE_LIMIT" \
  "Retry-After" \
  "3.6 tài liệu không nêu Retry-After"

# --- 3.7: khoá gọi, quyền, dữ liệu ---
check "$TASK_OVERVIEW" \
  "Task API supports \`tenant_access_token\` and \`user_access_token\`." \
  "3.7 task nhận khoá ứng dụng và khoá người"
check "$TASK_OVERVIEW" \
  "has NO special privileges" \
  "3.7 khoá ứng dụng không có quyền đặc biệt"
check "$TASK_OVERVIEW" \
  "perform CRUD operations on the task data created by the application" \
  "3.7 khoá ứng dụng chỉ làm việc với task của ứng dụng"
check "$TASK_OVERVIEW" \
  "cannot access the task data belonging to other users or other applications" \
  "3.7 khoá ứng dụng không đọc task của người khác"
check "$TASK_OVERVIEW" \
  "Both \`tenant_access_token\` and \`user_access_token\` have expiration. Normally, it is about 2 hours." \
  "3.7 cả hai khoá sống khoảng 2 giờ"
check "$TASK_CREATE" \
  "View, create, update, and delete task(task:task:write)" \
  "3.7 quyền task:task:write cho ghi"
check "$TASK_GET" \
  "View task details(task:task:read)" \
  "3.7 quyền task:task:read cho đọc"
check "$CONTACT_USER" \
  "Read contacts(contact:contact:readonly)" \
  "3.7 quyền đọc danh bạ"
check "$CONTACT_USER" \
  "Get basic information in contacts(contact:contact.base:readonly)" \
  "3.7 quyền đọc thông tin cơ bản"
check "$CONTACT_USER" \
  "Obtain user's mobile number(contact:user.phone:readonly)" \
  "3.7 quyền đọc số điện thoại"

# --- 3.8: bảng mã trả về ---
check "$TASK_CREATE" \
  "Concurrent api calls using the same client_token" \
  "3.8 1470422 là gửi đồng thời cùng mã"
check "$TASK_CREATE" \
  "1470422" \
  "3.8 mã 1470422"
check "$TASK_PATCH" \
  "1470400" \
  "3.8 mã 1470400 tham số sai"
check "$TASK_PATCH" \
  "1470403" \
  "3.8 mã 1470403 thiếu quyền"
check "$TASK_PATCH" \
  "1470404" \
  "3.8 mã 1470404 không thấy task"
check "$TASK_PATCH" \
  "1470500" \
  "3.8 mã 1470500 lỗi máy chủ"
check "$ERRORS" \
  "99991400 | request trigger frequency limit" \
  "3.8 mã 99991400 vượt hạn mức"
check "$ERRORS" \
  "99991663 | tenant token invalid" \
  "3.8 mã 99991663 khoá ứng dụng sai"
check "$ERRORS" \
  "99991668 | token invalid" \
  "3.8 mã 99991668 khoá người dùng sai"
check "$ERRORS" \
  "99991677 | token expire" \
  "3.8 mã 99991677 khoá hết hạn"
check "$ERRORS" \
  "99991672 | No permission" \
  "3.8 mã 99991672 thiếu quyền"

# --- 3.9: công ty thử ---
check "$TEST_COMPANY" \
  'Lark Open Platform provides the "Test Company and User" functionality' \
  "3.9 Lark có công ty thử"
check "$TEST_COMPANY" \
  "Each developer can create up to 3 test companies, with a maximum of 100 users each." \
  "3.9 tối đa 3 công ty thử, 100 người mỗi công ty"
check "$TEST_COMPANY" \
  "the test version and the official version are logically two independent applications" \
  "3.9 bản thử là ứng dụng độc lập"
check "$TEST_COMPANY" \
  "Changes in the test version, such as permissions and application information, will take effect immediately without review." \
  "3.9 đổi quyền bản thử không cần duyệt"
check "$TEST_COMPANY" \
  "The version of the test enterprise will not change with the Lark version of the current tenant and is fixed to the uncertified basic version." \
  "3.9 công ty thử ở gói cơ bản chưa xác thực"

# --- 4.1: đọc người dùng ---
check "$CONTACT_USER" \
  "Rate Limit | [1000 per minute、50 per second]" \
  "4.1 đọc người 1000 lần mỗi phút, 50 lần mỗi giây"
check "$CONTACT_USER" \
  "When using \`tenant_access_token\`, the field department_path of the response will not be returned." \
  "4.1 khoá ứng dụng không trả department_path"
check "$CONTACT_USER" \
  "This field can only be obtained by calling the interface through user identity (user_access_token)." \
  "4.1 department_path cần khoá người dùng"
check "$CONTACT_USER" \
  "41050" \
  "4.1 lỗi 41050 ngoài phạm vi danh bạ"
check "$CONTACT_USER" \
  "41012" \
  "4.1 lỗi 41012 mã người dùng sai"
check "$CONTACT_USER" \
  "40003" \
  "4.1 lỗi 40003 lỗi nội bộ"

# --- 4.2: đọc phòng ban ---
check "$CONTACT_DEPT" \
  "When using \`tenant_access_token\`, the app must have the contacts scope of the department to be queried." \
  "4.2 khoá ứng dụng cần quyền phòng ban"
check "$CONTACT_DEPT" \
  "When using \`user_access_token\`, you must have the visibility of the department to be queried." \
  "4.2 khoá người dùng cần thấy phòng ban"
check "$CONTACT_DEPT" \
  "Read Contacts as an app(contact:contact:readonly_as_app)" \
  "4.2 quyền đọc danh bạ bằng ứng dụng"
check "$CONTACT_DEPT" \
  "Read contacts(contact:contact:readonly)" \
  "4.2 quyền đọc danh bạ"
check "$CONTACT_DEPT" \
  "40004" \
  "4.2 lỗi 40004 không có quyền phòng ban"
check "$CONTACT_DEPT" \
  "42008" \
  "4.2 lỗi 42008 tenant không hợp lệ"
check "$CONTACT_DEPT" \
  "40015" \
  "4.2 lỗi 40015 phòng ban không tồn tại"
check_absent "$CONTACT_DEPT" \
  "Rate Limit" \
  "4.2 trang phòng ban không nêu giới hạn tốc độ"

# --- Bảng ở mục 2: xoá task không có mã chống ghi trùng ---
check "$TASK_DELETE" \
  "Tasks can no longer be restored after deletion." \
  "2 xoá task không khôi phục được"
check "$TASK_DELETE" \
  "404 | 1470404 | The task to delete does not exist or has been deleted." \
  "2 xoá lặp trả 1470404"
check_absent "$TASK_DELETE" \
  "client_token" \
  "2 xoá task không có client_token"

echo
printf 'Tổng: %d PASS, %d MISS/BLOCKED\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
