#!/usr/bin/env bash
# Kiểm chéo nguồn cho rd/research/eve.md
# Mỗi dòng kiểm một câu trích: mở URL, bỏ thẻ HTML, gộp khoảng trắng, so khớp nguyên văn.
# Tài liệu trong kho mã được ghim vào một commit, nên câu trích không trôi khi kho thay đổi.
# Cách chạy: bash rd/checks/eve.sh
# Ngày chạy đầu: 2026-11-19.

set -u
PASS=0
FAIL=0

COMMIT=08034cde67d2c301c8c339f56db5d118cf14b74a
RAW="https://raw.githubusercontent.com/vercel/eve/$COMMIT"
BLOG="https://vercel.com/blog/eve-is-now-generally-available"
LARK="https://unpkg.com/@larksuite/vercel-chat-adapter@0.3.0"

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

# Bài công bố bản 1.0 (mục 2)
check "$BLOG" "the open-source framework for building production-ready agents" "công bố: bộ khung mã nguồn mở để dựng agent"
check "$BLOG" "from its last completed step after a crash" "công bố: chạy tiếp từ bước đã xong sau khi sập"
check "$BLOG" "Approvals appear as buttons that only the right person can answer" "công bố: nút duyệt chỉ người đúng bấm được"
check "$BLOG" "Private conversations in production send only metadata by default" "công bố: hội thoại riêng chỉ gửi siêu dữ liệu"
check "$BLOG" "For managed hosting, deploy your eve agent to Vercel" "công bố: chạy sẵn trên Vercel"

# Giấy phép, phiên bản, nơi chạy (mục 2)
check "$RAW/LICENSE" "Apache License" "giấy phép Apache 2.0"
check "https://registry.npmjs.org/eve/1.1.0" '"node":">=24"' "npm eve 1.1.0: cần Node 24"
check "$RAW/docs/guides/deployment/self-hosting/index.md" 'Set `AI_GATEWAY_API_KEY` to use a string model ID through the Vercel AI Gateway' "tự cài: mô hình qua AI Gateway hoặc nhà cung cấp"
check "$RAW/docs/guides/deployment/self-hosting/index.md" "PORT=3000 eve start --host 0.0.0.0" "tự cài: chạy như dịch vụ Node"
check "$RAW/docs/guides/deployment/workflow-worlds.md" "stores runs in PostgreSQL" "nơi lưu phiên: PostgreSQL cho nhiều bản sao"
check "$RAW/docs/guides/deployment/workflow-worlds.md" "Existing sessions cannot resume" "nơi lưu phiên: đổi phiên bản thì phiên cũ dừng"

# Kênh chat và Lark (mục 2, mục 4)
check "$RAW/docs/channels/chat-sdk/index.mdx" "eve owns sessions, streaming replies, typing indicators, and approvals." "Chat SDK: eve giữ phiên và duyệt"
check "$RAW/apps/docs/registry/channels/chat-sdk-lark.ts" "@larksuite/vercel-chat-adapter" "Chat SDK: mẫu kênh Lark"
check "https://registry.npmjs.org/@larksuite/vercel-chat-adapter/0.3.0" '"license":"MIT"' "bộ nối Lark: giấy phép MIT"
check "$LARK/README.md" "WebSocket long-connection event subscription" "bộ nối Lark: nhận tin qua kết nối dài"
check "$LARK/README.md" "Buttons and select menus call back into" "bộ nối Lark: nút trên thẻ gọi ngược về bot"
check "$LARK/README.md" "modals / form containers, input fields" "bộ nối Lark: chưa có biểu mẫu nhập liệu"

# Kênh MCP của eve (mục 4, E4)
check "$RAW/docs/channels/mcp.mdx" "Clients start and follow that work with four tools" "kênh MCP: bốn công cụ bắt đầu và theo dõi việc"
check "$RAW/docs/channels/mcp.mdx" "isn't idempotent" "kênh MCP: bắt đầu việc không chống gửi trùng"

# Kết nối MCP và danh tính (mục 5)
check "$RAW/docs/connections/mcp.mdx" "An MCP connection gives your agent the tools of a remote MCP server" "kết nối MCP: gọi server MCP của người khác"
check "$RAW/docs/connections/mcp.mdx" 'eve then uses `initialize` with the newest version both sides support' "kết nối MCP: quay về bắt tay thường"
check "$RAW/docs/connections/mcp.mdx" "MCP connections have no per-result transform" "kết nối MCP: kết quả tới mô hình không qua bước lọc"
check "$RAW/docs/connections/mcp.mdx" 'The server must list the identity this deployment authenticates as in `trustedForwarders`' "kết nối MCP: server phải tin nơi chuyển tên người"
check "$RAW/docs/connections/index.mdx" 'Use `principalType: "user"` for per-user tokens' "kết nối: khoá riêng theo người hỏi"
check "$RAW/docs/connections/index.mdx" "The approver's identity reaches only the requests of the call they approved." "kết nối: danh tính người duyệt chỉ đi theo lời gọi đã duyệt"

# Duyệt (mục 5.3)
check "$RAW/docs/tools/human-in-the-loop.md" "Approval is consent only." "duyệt: chỉ là lời đồng ý"
check "$RAW/docs/tools/human-in-the-loop.md" "By default, only the person whose turn requested a call can approve or cancel it." "duyệt: mặc định chỉ người yêu cầu bấm được"
check "$RAW/docs/tools/human-in-the-loop.md" "The wait survives process restarts, so it can last seconds or days." "duyệt: chờ sống qua khởi động lại"

# Mẫu bảo mật (mục 5.4)
check "$RAW/docs/concepts/security-model.md" "another person's message waits for the turn to end and then runs as their own turn" "bảo mật: một lượt chạy thuộc một người"
check "$RAW/docs/concepts/security-model.md" "Don't trust body-supplied identity." "bảo mật: không tin danh tính trong nội dung"
check "$RAW/docs/concepts/security-model.md" "never saves it in session state" "bảo mật: khoá kết nối không nằm trong phiên"

# Bản phát hành và issue mới (mục Vấn đề của eve)
check "https://registry.npmjs.org/eve/1.3.0" '"version":"1.3.0"' "npm eve 1.3.0: bản ngày 20/11"
check "https://github.com/vercel/eve/issues/1753" "generated channel can never reply" "issue #1753: kênh Lark không trả lời được"
check "https://github.com/vercel/eve/issues/3570" "fails every parked session" "issue #3570: nâng cấp làm hỏng việc đang chờ"
check "https://github.com/vercel/eve/issues/5841" "This call did not run" "issue #5841: lệnh đã chạy bị báo là chưa chạy"
check "https://github.com/vercel/eve/issues/6645" "Security audit trail" "issue #6645: chưa có vết kiểm toán an ninh"

echo "----"
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
