#!/usr/bin/env bash
# Kiểm chéo nguồn cho archive/baseline/mausbot.md
# Mỗi dòng kiểm một câu trích: mở URL, bỏ thẻ HTML, gộp khoảng trắng, so khớp nguyên văn.
# Tài liệu trong kho mã được ghim vào một commit, nên câu trích không trôi khi kho thay đổi.
# Cách chạy: bash archive/baseline/checks/mausbot.sh
# Ngày chạy đầu: 2026-11-17.

set -u
PASS=0
FAIL=0

COMMIT=d01c7be498bfe7ee3c0963b169fb63fe531b1425
RAW="https://raw.githubusercontent.com/milind-soni/OpenMausBot/$COMMIT"
# Lần đọc lại ngày 2026-11-19 (bản 0.1.170), cho mục 3.3
COMMIT2=96acdd4bcd14b702288fcca25baf414f469cd4c1
RAW2="https://raw.githubusercontent.com/milind-soni/OpenMausBot/$COMMIT2"

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

# Trang công khai
check "https://mausbot.com/" "Bring your AI account or API key" "trang chủ: dùng tài khoản AI của người dùng"
check "https://mausbot.com/privacy" "Supamaus Software Private Limited" "chính sách riêng tư: công ty phát hành"
check "https://mausbot.com/privacy" "your conversations stay there" "chính sách riêng tư: hội thoại ở trên máy"
check "https://mausbot.com/pricing" "AI model usage isn" "bảng giá: tiền gọi mô hình AI không gồm trong gói"

# Mã nguồn
check "$RAW/LICENSE" "Apache License" "giấy phép Apache 2.0"
check "$RAW/LICENSING.md" 'Everything under `enterprise/` is source-available' "giấy phép: enterprise/ không phải mã mở"
check "$RAW/LICENSING.md" "so a product built on OpenMausBot needs its own name" "giấy phép: sản phẩm dựng lại phải đổi tên"
check "$RAW/enterprise/LICENSE" "Hosting for third parties, reselling, and white-labelling the product for third parties are permitted only under a written partner agreement" "giấy phép enterprise: đổi nhãn cần hợp đồng"
check "$RAW/enterprise/FEATURES" "budgets" "enterprise: giới hạn chi tiêu nằm trong phần đóng"
check "https://mausbot.com/enterprise" "The AI Harness SDK gives software companies the agent harness behind MausBot" "enterprise: nay bán bộ SDK, không công bố giá đổi nhãn"
check "https://mausbot.com/pricing" "For data kept in-house" "bảng giá: bản tự cài cho doanh nghiệp"
check "https://mausbot.com/pricing" "your bots in Slack" "bảng giá: Slack có ở gói đám mây"

# Gắn server MCP tự mang tới
check "$RAW/docs/custom-mcp-servers.md" "a local stdio server: the executable" "MCP: nhận server chạy trên máy (stdio)"
check "$RAW/docs/custom-mcp-servers.md" "Most servers speak **Streamable HTTP**" "MCP: nhận server qua địa chỉ web"
check "$RAW/docs/custom-mcp-servers.md" "Custom servers are never pre-approved" "MCP: server tự thêm không được duyệt sẵn"
check "$RAW/docs/custom-mcp-servers.md" "the connector adds no deadline of its own" "MCP: không tự cắt lời gọi công cụ"
check "$RAW/docs/custom-mcp-servers.md" "never proof of who called" "MCP: thông tin bot gọi chỉ là gợi ý"
check "$RAW/docs/custom-mcp-servers.md" "keeps that key as the Admin's own" "MCP: khoá của server dùng chung trong nhóm"
check "$RAW/docs/custom-mcp-servers.md" "only servers whose name or address is on the organization's approved list reach bots" "MCP: tổ chức giới hạn danh sách server"
check "$RAW/docs/custom-mcp-servers.md" "API-model bots take at most 128 tools in one turn" "MCP: tối đa 128 công cụ mỗi lượt"
check "$RAW/docs/custom-mcp-servers.md" "8,000 characters by default" "MCP: kết quả stdio rút gọn ở 8.000 ký tự"
check "$RAW/docs/custom-mcp-servers.md" "reaches the bot with its code and words" "MCP: lỗi của server tới bot kèm mã"

# Chỗ đứng trong hệ sinh thái Appota (mục 3)
check "$RAW/docs/org-library.md" "An organization's Admin can share packages" "thư viện tổ chức: Admin đẩy gói xuống máy"
check "$RAW/docs/org-library.md" "This runtime never talks to Admin" "thư viện tổ chức: danh mục đến từ dịch vụ Admin"
check "$RAW/enterprise/README.md" "The service's console, invitations, provider gateway and deployment automation are not shipped in this repository" "enterprise: dịch vụ Admin không có trong mã mở"
check "$RAW/docs/team-sharing.md" "every skill, as standard Agent Skills" "chia sẻ: skill theo chuẩn Agent Skills"
check "$RAW/docs/team-cloud.md" "Every app (a Composio toolkit) and MCP server has a scope" "nhóm: kết nối dùng chung hay riêng từng người"
check "$RAW/docs/team-cloud.md" "a routine, a webhook and a bot's own work act for nobody" "nhóm: việc chạy theo lịch không làm thay ai"
check "$RAW/docs/usage-caps.md" "They are part of every edition" "giới hạn chi tiêu có ở mọi bản"
check "$RAW/enterprise/FEATURES" "with scope mapping planned" "enterprise: đăng nhập tài khoản công ty mới là kế hoạch"
check "$RAW/docs/custom-engines.md" "any hosted compatible API is one entry" "mô hình: nhận mọi địa chỉ chuẩn OpenAI"
check "$RAW/docs/analytics.md" "The 24 apps Connected apps lists by default" "Composio: 24 ứng dụng dựng sẵn"
check "$RAW/docs/self-hosting.md" "runs one workspace per client on a single Linux server" "tự cài: nhiều workspace trên một máy chủ"
check "$RAW/docs/self-hosting.md" "Running on a container platform (Railway, Render, Kubernetes, Cloud Run)" "tự cài: Railway, Kubernetes"

# Mức duyệt
check "$RAW/docs/approval-levels.md" "Its default is Full access, and so is OpenMausBot's" "duyệt: mặc định là toàn quyền"
check "$RAW/docs/approval-levels.md" "This is an explicit standing grant for that exact bot" "duyệt: luôn cho phép gắn đúng bot và công cụ"
check "$RAW/docs/approval-levels.md" "It is not offered for create/update/delete" "duyệt: luôn cho phép không áp cho lệnh ghi"
check "$RAW/docs/approval-levels.md" "An approval only counts when the person gives it to the bot that acts." "duyệt: chỉ tính khi người bấm ở bot hành động"
check "$RAW/docs/approval-levels.md" "There is no signed-approval token that lets an outside page stand in for you." "duyệt: không có trang duyệt bên ngoài"

# Đường gọi từ ngoài vào MausBot
check "$RAW/docs/bot-api.md" "It has no shell, computer, browser, phone, connected apps, MCP servers or data tools" "Bot API: lời gọi ngoài không có server MCP"
check "$RAW/docs/mcp-server.md" "The v1 server intentionally cannot approve requests" "MCP server của MausBot: không duyệt hộ"
check "$RAW/docs/mcp-server.md" "returns the first send's receipt instead of a second message" "MCP server của MausBot: gửi lại không gửi trùng"
check "$RAW/scripts/mcp-server.ts" 'maximum: 120, description: "Maximum wait (default: 30 seconds)."' "MCP server của MausBot: chờ mặc định 30 giây, tối đa 120"

# Nhân viên gặp MausBot ở đâu (mục 3.3)
check "$RAW2/docs/team-slack.md" "One MausBot Slack app is installed per company" "Slack: một ứng dụng Slack cho cả công ty"
check "$RAW2/docs/team-slack.md" "Slack's events arrive at the Admin" "Slack: tin Slack đi qua dịch vụ Admin"
check "$RAW2/docs/team-slack.md" "Everywhere else (the desktop app, a self-hosted server) every route below answers 404" "Slack: bản desktop và tự cài không có Slack"

# Issue bảo mật #4716 và đăng nhập một lần (mục Vấn đề của MausBot, mục Bảy lớp)
check "https://github.com/milind-soni/OpenMausBot/issues/4716" "found no evidence of a backdoor, hidden destination or malicious code" "issue #4716: không thấy cửa sau, nhưng chưa giới hạn được dữ liệu"
check "https://github.com/milind-soni/OpenMausBot/issues/4716" "Analytics are on before any choice, with no organization control" "issue #4716: analytics bật trước khi người dùng chọn"
check "https://github.com/milind-soni/OpenMausBot/issues/4716" "Windows and AppImage updates have no signature check" "issue #4716: bản Windows không kiểm chữ ký"
check "$RAW/enterprise/README.md" "planned: nothing checks it yet" "đăng nhập: SSO mới là kế hoạch"

echo "----"
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
