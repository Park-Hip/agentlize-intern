#!/usr/bin/env bash
# Kiểm chéo nguồn cho rd/design/write-safety-options.md (các phương án ghi an toàn và nguồn ngoài).
# Mỗi dòng kiểm một câu trích: mở URL, bỏ thẻ HTML, gộp khoảng trắng, so khớp nguyên văn.
# Bài Zanzibar là PDF, đọc bằng pypdf.
# Cách chạy: bash rd/checks/write-safety-options.sh
# Ngày chạy đầu: 2026-11-24.

set -u
PASS=0
FAIL=0

norm() { sed -e 's/<[^>]*>//g' | tr -s ' \n\t' ' '; }

check() { # $1 url, $2 câu trích, $3 nhãn nguồn
  local body
  body=$(curl -sL --compressed --max-time 45 -A "Mozilla/5.0" "$1" 2>/dev/null | norm)
  if [ -z "$body" ]; then
    printf 'BLOCKED | %-52s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
    return
  fi
  case "$body" in
    *"$2"*)
      printf 'PASS    | %s\n' "$3"
      PASS=$((PASS + 1))
      ;;
    *)
      printf 'MISS    | %-52s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

check_pdf() { # $1 url, $2 câu trích, $3 nhãn nguồn; cần python và pypdf
  local tmp
  tmp=$(mktemp)
  if ! curl -sfL --max-time 60 -A "Mozilla/5.0" "$1" -o "$tmp" 2>/dev/null || [ "$(head -c 4 "$tmp")" != "%PDF" ]; then
    printf 'BLOCKED | %-52s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
    rm -f "$tmp"
    return
  fi
  if python -I -c "import sys,re;from pypdf import PdfReader;t=' '.join(p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages);sys.exit(0 if sys.argv[2] in re.sub(r'\s+',' ',t) else 1)" "$tmp" "$2" 2>/dev/null; then
    printf 'PASS    | %s\n' "$3"
    PASS=$((PASS + 1))
  else
    printf 'MISS    | %-52s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
  fi
  rm -f "$tmp"
}

IETF="https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-09.txt"
POWERTOOLS="https://docs.powertools.aws.dev/lambda/python/latest/utilities/idempotency/"
BUILDERS="https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/"
TEMPORAL_ACT="https://docs.temporal.io/activity-execution"
TEMPORAL_RETRY="https://docs.temporal.io/encyclopedia/retry-policies"
AIP155="https://google.aip.dev/155"
STRIPE_BLOG="https://stripe.com/blog/idempotency"
AZURE_OUTBOX="https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos"
AZURE_SAGA="https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/saga/saga"
RFC9110="https://www.rfc-editor.org/rfc/rfc9110.html"
STRIPE_AUTH="https://docs.stripe.com/payments/place-a-hold-on-a-payment-method"
ZANZIBAR="https://www.usenix.org/system/files/atc19-pang.pdf"

# Mục 2: bản khai năng lực
check "$IETF" "The resource SHOULD define such expiration policy and publish it in the documentation." "Mục 2, IETF: đích công bố hạn nhớ mã"
check "$BUILDERS" "the idempotent token and all mutating operations related to servicing the request must meet the properties for an atomic, consistent, isolated, and durable (ACID) operation." "Mục 2, Builders: mã và hiệu ứng cùng giao dịch"
check "$AIP155" "APIs may choose any reasonable timeframe for honoring request IDs." "Mục 2, AIP-155: đích chọn hạn nhớ mã"

# Mục 3: không rõ lệnh đã chạy chưa
check "$IETF" "the resource SHOULD reply with an HTTP 409 status code" "Mục 3, IETF: 409 khi lệnh cùng mã đang chạy"
check "$IETF" "the resource SHOULD reply with an HTTP 422 status code" "Mục 3, IETF: 422 khi khoá dùng lại với nội dung khác"
check "$POWERTOOLS" "By default, we expire idempotency records after an hour" "Mục 3, Powertools: mặc định nhớ một giờ"
check "$POWERTOOLS" "If saving the response fails after it was serialized, we keep the record, as the write could have landed." "Mục 3, Powertools: giữ bản ghi khi có thể đã ghi"
check "$AZURE_OUTBOX" "When you save the business object and its events within the same database transaction, the system guarantees no data loss." "Mục 3, Outbox: lưu việc và sự kiện cùng giao dịch"
check "$AZURE_OUTBOX" "The transaction either commits everything or rolls back everything if an error occurs." "Mục 3, Outbox: tất cả hoặc không"
check "$BUILDERS" "it is safest to assume that the customer intended a different outcome" "Mục 3, Builders: cùng mã khác tham số là ý định khác"
check "$TEMPORAL_RETRY" "Temporal provides guidance around idempotence of Activity code with the expectation that Activities will need to re-execute upon failure" "Mục 3, Temporal: activity phải chịu chạy lại"
check "$STRIPE_BLOG" "state is recovered and the call is continued." "Mục 3, Stripe: khôi phục trạng thái rồi chạy tiếp"
check "$AIP155" "it is permissible to substitute the historical success response with a similar response that reflects more current data." "Mục 3, AIP-155: trả trạng thái hiện tại"

# Mục 4: đã nhận khác đã xong
check "$RFC9110" "The 202 (Accepted) status code indicates that the request has been accepted for processing, but the processing has not been completed." "Mục 4, RFC 9110: 202 là nhận, chưa xong"
check "$RFC9110" "There is no facility in HTTP for re-sending a status code from an asynchronous operation." "Mục 4, RFC 9110: không có kênh báo lại bất đồng bộ"
check "$TEMPORAL_ACT" "When an external system has the final result of a computation that is started by an Activity" "Mục 4, Temporal: kết quả cuối đến từ hệ thống ngoài"

# Mục 5: ai đóng lệnh cần người xem
check "$TEMPORAL_RETRY" "it is better to surface them than to retry them." "Mục 5, Temporal: lỗi vĩnh viễn thì báo ra"
check "$TEMPORAL_ACT" "consider an external process that is waiting for a human to review something and respond" "Mục 5, Temporal: chờ người xem xét"
check "$AZURE_SAGA" "Monitoring and tracking the workflow of a saga are essential tasks to maintain operational oversight." "Mục 5, Saga: cần theo dõi để vận hành"

# Mục 6: chống ghi đè
check "$RFC9110" "to prevent accidental overwrites when multiple user agents might be acting in parallel on the same resource" "Mục 6, RFC 9110: chống ghi đè"
check "$RFC9110" "An origin server that evaluates an If-Match condition MUST NOT perform the requested method if the condition evaluates to false." "Mục 6, RFC 9110: If-Match sai thì không ghi"
check "$RFC9110" "An origin server MUST use the strong comparison function when comparing entity tags for If-Match" "Mục 6, RFC 9110: phải so sánh mạnh"
check "$RFC9110" "the origin server MAY respond with a 2xx (Successful) status code" "Mục 6, RFC 9110: 2xx khi lệnh đã áp dụng"

# Mục 7: kiểm lại quyền
check_pdf "$ZANZIBAR" "ACL checks must respect the order in which users modify ACLs and object contents" "Mục 7, Zanzibar: kiểm quyền phải theo thứ tự cập nhật"
check_pdf "$ZANZIBAR" "Zanzibar must provide two key consistency properties: external consistency" "Mục 7, Zanzibar: cần nhất quán ngoài"

# Mục 8: hạn thực thi
check "$STRIPE_AUTH" "You need to capture the funds before the authorization expires." "Mục 8, Stripe: phải thu tiền trước khi hết hạn"
check "$STRIPE_AUTH" "If the authorization expires before you capture the funds, the funds are released and the payment status changes to canceled." "Mục 8, Stripe: hết hạn thì nhả tiền"
check "$STRIPE_AUTH" "The exact authorization window is 4 days and 18 hours" "Mục 8, Stripe: cửa sổ chính xác 4 ngày 18 giờ"
check "$STRIPE_AUTH" "Only some payment methods support separate authorization and capture." "Mục 8, Stripe: chỉ vài kênh giữ được quyền"

# Mục 9: đề xuất thành công một nửa
check "$AZURE_SAGA" "The system must handle transient failures effectively and ensure idempotence" "Mục 9, Saga: phải chịu lỗi tạm thời và chống trùng"
check "$AZURE_SAGA" "Compensating transactions might not always succeed, which can leave the system in an inconsistent state." "Mục 9, Saga: bù trừ có thể thất bại"
check "$AZURE_SAGA" "Irreversible or noncompensable transactions can't be undone or retried." "Mục 9, Saga: có việc không hoàn tác được"

# Mục 10: chặn hai đề xuất cho cùng một việc
check "$IETF" "An idempotency key is a unique value generated by the client which the resource uses to recognize subsequent retries of the same request." "Mục 10, IETF: khoá gắn với một lần gửi"
check "$AIP155" "Providing a request ID must guarantee idempotency." "Mục 10, AIP-155: request ID chỉ chống trùng một lần gửi"
check "$IETF" "A resource MAY define what makes a key unique, and clients sending requests to that resource need to generate keys accordingly." "Mục 10, IETF: đích được định nghĩa khoá"

printf '\n%d PASS, %d FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
