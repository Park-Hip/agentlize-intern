#!/usr/bin/env bash
# Kiểm chéo nguồn cho rd/research/target-system-gaps.md (hệ thống nghiệp vụ thật khác hệ thống giả ở đâu, và bằng chứng).
# Mỗi dòng kiểm một câu trích: mở URL, bỏ thẻ HTML, gộp khoảng trắng, so khớp nguyên văn.
# Cách chạy: bash rd/checks/target-system-gaps.sh
# Ngày chạy đầu: 2026-11-24.

set -u
PASS=0
FAIL=0

norm() { sed -e 's/<[^>]*>//g' | tr -s ' \n\t' ' '; }

check() { # $1 url, $2 câu trích, $3 nhãn nguồn
  local body
  body=$(curl -sL --compressed --max-time 45 -A "Mozilla/5.0" "$1" 2>/dev/null | norm)
  if [ -z "$body" ]; then
    printf 'BLOCKED | %-46s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
    return
  fi
  case "$body" in
    *"$2"*)
      printf 'PASS    | %s\n' "$3"
      PASS=$((PASS + 1))
      ;;
    *)
      printf 'MISS    | %-46s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

check_pdf() { # $1 url, $2 câu trích, $3 nhãn nguồn; cần python và pypdf
  local tmp
  tmp=$(mktemp)
  # Trang chặn máy (ví dụ tường lửa chống bot trả HTML 403) là BLOCKED, không phải MISS:
  # câu trích chưa được đọc, nên chưa thể nói là sai.
  if ! curl -sfL --max-time 60 -A "Mozilla/5.0" "$1" -o "$tmp" 2>/dev/null || [ "$(head -c 4 "$tmp")" != "%PDF" ]; then
    printf 'BLOCKED | %-46s | %s\n' "$3" "$1"; FAIL=$((FAIL + 1)); rm -f "$tmp"; return
  fi
  if python -I -c "import sys,re;from pypdf import PdfReader;t=' '.join(p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages);sys.exit(0 if sys.argv[2] in re.sub(r'\s+',' ',t) else 1)" "$tmp" "$2" 2>/dev/null; then
    printf 'PASS    | %s\n' "$3"; PASS=$((PASS + 1))
  else
    printf 'MISS    | %-46s | %s\n' "$3" "$1"; FAIL=$((FAIL + 1))
  fi
  rm -f "$tmp"
}

LARK_TASK="https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/overview.md"
LARK_APPROVAL="https://open.larksuite.com/document/server-docs/approval-v4/instance/create.md"

# Mục 1: công ty thành viên Appota
check "https://en.wikipedia.org/wiki/Appota_Corporation" "Gamota" "Wikipedia: Gamota"
check "https://en.wikipedia.org/wiki/Appota_Corporation" "AppotaPay" "Wikipedia: AppotaPay"
check "https://en.wikipedia.org/wiki/Appota_Corporation" "Adsota" "Wikipedia: Adsota"

# Mục 2: Lark Task
check "$LARK_TASK" "无法确定到底超时几次，创建了多少个多余的任务" "Lark Task: không biết đã tạo bao nhiêu task thừa"
check "$LARK_TASK" "目前支持幂等能力的接口包括" "Lark Task: chỉ vài thao tác có mã chống ghi trùng"
check "$LARK_TASK" "如果接口实际成功了，幂等行为会保持5分钟" "Lark Task: nhớ mã 5 phút"
check "$LARK_TASK" "不同调用者之间的幂等行为是隔离的" "Lark Task: nhớ mã theo người gọi"
check "$LARK_TASK" "code:1470422" "Lark Task: gửi đồng thời lỗi 1470422"
check "https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/task/patch.md" "字段中填写所有要修改的任务字段名" "Lark Task: sửa task chỉ gồm trường và giá trị"

# Mục 2 và 6: Lark Approval
check "$LARK_APPROVAL" "如果冲突则创建失败并返回错误码 60012" "Lark Approval: trùng uuid thì lỗi 60012"
check "$LARK_APPROVAL" "100 次/分钟" "Lark Approval: 100 lần mỗi phút"

# Mục 4: kết quả cuối đến sau
check "https://docs.stripe.com/payments/ach-direct-debit.md" "up to 4 business days" "Stripe ACH: tới 4 ngày làm việc"
check_pdf "https://www.indovinabank.com.vn/sites/default/files/2026-03/5.%20%C4%90i%E1%BB%81u%20kho%E1%BA%A3n%20%C4%91i%E1%BB%81u%20ki%E1%BB%87n%20IVB%20Biz%2B%C2%A0Chuy%E1%BB%83n%20ti%E1%BB%81n%20%28VIE%29.pdf" "sẽ được trích nợ ngay, nhưng lệnh chuyển tiền sẽ được xử lý vào ngày làm việc tiếp theo" "Indovina: sau giờ chốt xử lý ngày làm việc sau"
check "https://developer.android.com/google/play/billing/integrate" "must be done within three days so that the purchase isn" "Google Play: xác nhận trong 3 ngày"

# Mục 6: giới hạn tốc độ
check "https://developers.facebook.com/docs/marketing-api/overview/rate-limiting" "You can only change your ad set budget 4 times per hour." "Meta: đổi ngân sách 4 lần mỗi giờ"

# Mục 2 và 7: lệnh lặp và người dùng làm lại
TCB="https://vnbusiness.vn/ngan-hang/khach-hang-suyt-mat-tien-do-loi-internet-banking-1072540.html"
check "$TCB" "Thậm chí có khách hàng bị trừ tiền đến 2 lần dù chuyển khoản thành công 1 lần" "Techcombank: trừ tiền 2 lần"
check "$TCB" "tôi nhập mã OTP lần nữa thì hệ thống báo chuyển tiền thành công" "Techcombank: nhập lại OTP sau lỗi"
check "https://www.momo.vn/hoi-dap/su-co-va-khieu-nai-ctgr7/su-co-khi-nap-tien-hoac-rut-tien" "không cần thực hiện lại để tránh giao dịch lặp 2 lần" "MoMo: đừng làm lại giao dịch đang chờ"
check "https://uk.finance.yahoo.com/news/millions-natwest-customers-charged-twice-135801695.html" "It is understood that around 112,000 customers were affected by the glitch." "NatWest: khoảng 112.000 khách"
check "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html" "more than one copy of a message might be delivered" "SQS: giao nhiều hơn một bản"

# P2: đích quên mã sớm
check "https://docs.stripe.com/api/idempotent_requests" "We generate a new request if a key is reused after the original is pruned." "Stripe: mã cũ bị xoá thì thành lệnh mới"
check "https://developer.paypal.com/braintree/graphql/integration_guides/idempotency/" "DupeUnchangedN/A&gt; 30 days200 or 201New Transaction object" "Braintree: quá 30 ngày tạo giao dịch mới"

# P3: nhận chưa phải xong
check "https://docs.stripe.com/payments/ach-direct-debit.md" "to receive acknowledgement of success or failure" "Stripe ACH: tới 4 ngày mới biết kết quả"
check "https://www.momo.vn/hoi-dap/tai-khoan-bi-tru-tien-nhung-giao-dich-dang-cho-xu-ly" "xảy ra do dữ liệu giữa MoMo và ngân hàng chưa đồng bộ kịp thời" "MoMo: chờ xử lý vì chưa đồng bộ"

# Đối soát
check "https://www.nbcnews.com/business/business-news/synapse-bankruptcy-trustee-says-85-million-customer-savings-missing-fi-rcna156108" "had \$265 million in balances, while the banks themselves only had \$180 million" "Synapse: 265 triệu trên sổ, 180 triệu ở ngân hàng"

# P4: hai đề xuất cho cùng một việc
check "https://www.cfo.com/news/metric-of-the-month-detect-and-prevent-duplicate-or-erroneous-payments/" "nearly a full percentage point (0.8%) of their annual disbursements are duplicate or erroneous" "APQC: 0,8% tiền chi trùng hoặc sai"

# P5: thành công một nửa
check "https://developers.google.com/google-ads/api/docs/best-practices/partial-failures?hl=en" "allows successful operations within a request to be committed, while returning errors only for the operations that failed" "Google Ads: giữ thao tác đúng, báo lỗi thao tác hỏng"
check "https://developers.google.com/google-ads/api/docs/best-practices/partial-failures?hl=en" "To use partial failure, set the partialFailure parameter in the method request." "Google Ads: phải bật partial failure"

# P12: thẩm quyền đổi giữa duyệt và ghi
check "https://www.theregister.com/2020/08/26/former_cisco_engineer_aws_webex_teams/" "five months after leaving the manufacturer" "Cisco: vào hệ thống năm tháng sau khi nghỉ"
check "https://www.theregister.com/2020/08/26/former_cisco_engineer_aws_webex_teams/" "456 Cisco WebEx VMs" "Cisco: 456 máy ảo"
check "https://www.theregister.com/2022/04/06/ex-block-employee-takes-customer-data/" "these reports were accessed without permission after their employment ended" "Block: tải báo cáo sau khi nghỉ"
check "https://www.theregister.com/2022/04/06/ex-block-employee-takes-customer-data/" "circa 8.2 million current and former customers" "Block: 8,2 triệu khách"
check "https://cloud.google.com/blog/topics/threat-intelligence/data-theft-salesforce-instances-via-salesloft-drift" "Beginning as early as Aug. 8, 2025 through at least Aug. 18, 2025" "Salesloft Drift: token dùng từ 8 tới 18/8/2025"

# Mục 3, 8, 10 và 11: phạm vi nhớ mã theo token, mã trả về nhiều nghĩa, việc kéo theo, nhiều lời gọi
check "$LARK_TASK" "不会被看作是A调用的幂等调用" "Lark Task: token khác thì không nhận ra lệnh lặp"
check "$LARK_TASK" "都有过期时间。目前为约为2小时" "Lark Task: token hết hạn sau khoảng 2 giờ"
check "$LARK_TASK" "关注人可以收到来自任务变更的通知消息" "Lark Task: người theo dõi nhận thông báo khi task đổi"
check "https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/task-v2/attachment/upload.md" "/open-apis/task/v2/attachments/upload" "Lark Task: đính kèm là API riêng"
check "https://docs.stripe.com/error-low-level" "another request with the same key is still executing, wait and retry with that key and the same parameters" "Stripe: 409 khi lệnh cùng mã còn chạy"
check "https://developers.facebook.com/docs/marketing-api/overview/rate-limiting" "estimated_time_to_regain_access" "Meta: thời gian chờ trong header riêng"
check "https://developers.facebook.com/docs/marketing-api/overview/rate-limiting" "613, Error subcode: 1487632" "Meta: vượt giới hạn ngân sách báo bằng mã lỗi 613 và mã phụ"

printf '\n%d PASS, %d FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
