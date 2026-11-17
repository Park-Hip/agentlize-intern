#!/usr/bin/env bash
# Kiểm chéo nguồn cho rd/01-explore/tho-than-platform.md
# Mỗi dòng kiểm một câu trích hoặc một quan sát: mở URL, bỏ thẻ HTML, gộp khoảng trắng, so khớp nguyên văn.
# Năm hàm đặc biệt cho thứ không kiểm được bằng chuỗi trong body:
#   check_redirect: mã HTTP và vị trí Location
#   check_header:   header phản hồi
#   check_raw:      mã nguồn, so khớp nguyên văn không qua norm
#   check_absent:   mã nguồn, phải vắng một chuỗi
#   check_mcp:      bắt tay MCP initialize rồi tools/list bằng POST
# Cách chạy: bash rd/01-explore/checks/tho-than-platform.sh
# Ngày chạy đầu: 2026-11-13.
# Bổ sung 2026-11-17: 29 câu kiểm mã nguồn LobeHub 2.1.56 (L1-L29).

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

check_redirect() { # $1 url, $2 chuỗi phải có trong Location, $3 nhãn
  local loc
  loc=$(curl -s -o /dev/null -D - --max-time 30 -A "Mozilla/5.0" "$1" 2>/dev/null | grep -i '^location:' | tr -d '\r')
  case "$loc" in
    *"$2"*)
      printf 'PASS    | %s\n' "$3"
      PASS=$((PASS + 1))
      ;;
    *)
      printf 'MISS    | %-46s | loc=%s\n' "$3" "${loc:-none}"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

check_header() { # $1 url, $2 header chứa chuỗi này, $3 nhãn
  local hdr
  hdr=$(curl -s -o /dev/null -D - --max-time 30 -A "Mozilla/5.0" "$1" 2>/dev/null | tr -d '\r')
  case "$hdr" in
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

check_raw() { # $1 url, $2 chuỗi phải có trong mã nguồn, $3 nhãn
  local body
  body=$(curl -sL -g --compressed --max-time 45 -A "Mozilla/5.0" "$1" 2>/dev/null)
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

check_absent() { # $1 url, $2 chuỗi phải vắng, $3 nhãn
  local body
  body=$(curl -sL -g --compressed --max-time 45 -A "Mozilla/5.0" "$1" 2>/dev/null)
  if [ -z "$body" ]; then
    printf 'BLOCKED | %-46s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
    return
  fi
  case "$body" in
    *"$2"*)
      printf 'MISS    | %-46s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      ;;
    *)
      printf 'PASS    | %s\n' "$3"
      PASS=$((PASS + 1))
      ;;
  esac
}

check_mcp() { # $1 endpoint, $2 chuỗi phải có trong initialize, $3 tool phải có trong tools/list, $4 nhãn
  local init tools
  init=$(curl -s -X POST "$1" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "MCP-Protocol-Version: 2025-06-18" \
    --max-time 45 \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify-09","version":"1.0"}}}' 2>/dev/null)
  case "$init" in
    *"$2"*) ;;
    *)
      printf 'MISS    | %-46s | initialize không khớp\n' "$4"
      FAIL=$((FAIL + 1))
      return
      ;;
  esac
  tools=$(curl -s -X POST "$1" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    --max-time 45 \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' 2>/dev/null)
  case "$tools" in
    *"$3"*)
      printf 'PASS    | %s\n' "$4"
      PASS=$((PASS + 1))
      ;;
    *)
      printf 'MISS    | %-46s | tools/list không có %s\n' "$4" "$3"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

# --- S1 tới S4: thothan.appota.ai là một bản LobeHub, chạy trên Railway, sau đăng nhập ---
check "https://thothan.appota.ai/manifest.webmanifest" '"name":"Thổ Thần"' "S1 manifest name"
check "https://thothan.appota.ai/manifest.webmanifest" "work-and-lifestyle space to find, build, and collaborate with agent teams that grow with you" "S1 manifest description"
check "https://thothan.appota.ai/robots.txt" "Host: https://lobechat.com" "S2 robots Host lobechat.com"
check "https://thothan.appota.ai/robots.txt" "Disallow: /knowledge/*" "S2 robots knowledge path"
check_redirect "https://thothan.appota.ai/" "signin?callbackUrl" "S3 mọi route công khai đều đá về signin"
check_header "https://thothan.appota.ai/" "railway-hikari" "S4 chạy trên Railway"

# --- S5 tới S9: docs 2024 của docs-srd.appota.ai/tho-than ---
check "https://docs-srd.appota.ai/tho-than/gioi-thieu.md" "nền tảng phát triển app trò chuyện với trí thông minh AI" "S5 docs giới thiệu"
check "https://docs-srd.appota.ai/tho-than/gioi-thieu.md" "Đừng ngần ngại liên hệ với chúng tôi nếu bạn có thắc mắc hay muốn sử dụng thử" "S5 docs liên hệ"
# Ghi chú: địa chỉ liên hệ trong trang là <srd@appota.com>, hàm norm cắt mất vì trông giống thẻ HTML.
# Nên ô liên hệ kiểm bằng câu văn, còn địa chỉ email chép tay từ trang gốc ngày 2026-11-13.
check "https://docs-srd.appota.ai/tho-than/huong-dan/cong-cu.md" "hiện tại hỗ trợ các đặc tả OpenAPI / Swagger và Plugin OpenAI" "S6 docs công cụ"
check "https://docs-srd.appota.ai/tho-than/huong-dan/cong-cu.md" "Công cụ Tích hợp (Built-in) và Công cụ Tùy chỉnh (Custom Tools)" "S6 docs hai loại công cụ"
check "https://docs-srd.appota.ai/tho-than/huong-dan/application/workflow.md" "Chatflow" "S7 docs workflow"
check "https://docs-srd.appota.ai/tho-than/huong-dan/application/agent.md" "built-in tools and custom tools" "S8 docs agent tools"
check "https://docs-srd.appota.ai/tho-than/huong-dan/cong-cu/tich-hop-nhanh-cong-cu.md" "api/core/tools/provider/builtin/wikipedia/wikipedia.yaml" "S9 docs trỏ đường dẫn Dify"
check "https://docs-srd.appota.ai/tho-than/huong-dan/cong-cu/tich-hop-nhanh-cong-cu.md" "from core.tools.errors import ToolProviderCredentialValidationError" "S9 docs import của Dify"

# --- S10 tới S12: các đường dẫn đó là của Dify ---
check "https://raw.githubusercontent.com/langgenius/dify/0.15.3/api/core/tools/provider/builtin/wikipedia/wikipedia.yaml" "author: Dify" "S10 Dify wikipedia.yaml"
check "https://raw.githubusercontent.com/langgenius/dify/0.15.3/api/core/tools/errors.py" "class ToolProviderCredentialValidationError(ValueError)" "S11 Dify errors.py"

# --- S13, S14: sản phẩm thứ hai và thứ ba cùng tên ---
check "https://marketplace.visualstudio.com/items?itemName=ThothanCoding.thothan-code" "Configure models, providers, MCP servers, skills, and project rules" "S13 VS Code extension có MCP"
check "https://marketplace.visualstudio.com/items?itemName=ThothanCoding.thothan-code" "Appota AI's coding agent for Visual Studio Code" "S13 VS Code extension của Appota AI"

# --- S15, S16: LobeHub phía thượng nguồn ---
check "https://github.com/lobehub/lobehub/commit/85454c5" "support install sreamable http mcp server on web" "S15 LobeHub nhận MCP Streamable HTTP trên web"
check "https://github.com/lobehub/lobehub/discussions/7495" "MCP Tools 发现与调用" "S16 RFC 112 MCP của LobeHub"

# --- S17: MCP server thật của Appota ---
check_mcp "https://docs-srd.appota.ai/tho-than/~gitbook/mcp" '"title":"Thổ Thần MCP Server"' '"name":"searchDocumentation"' "S17 MCP server sống tại docs-srd"

# --- L1 tới L29: mã nguồn LobeHub 2.1.56, tag v2.1.56, commit eddb0c9 ---
LH="https://raw.githubusercontent.com/lobehub/lobehub/v2.1.56"

# Header danh tính trong LobeHub chỉ là X-lobe-user-id, dùng cho TTS/STT.
check_raw "$LH/packages/const/src/fetch.ts" "export const LOBE_USER_ID = 'X-lobe-user-id';" "L1 hằng header người dùng của LobeHub"
check_raw "$LH/src/services/_header.ts" "[LOBE_USER_ID]: state.user?.id || ''," "L2 header người dùng chỉ dùng cho TTS/STT"
check_raw "$LH/src/hooks/useTTS.ts" "createHeaderWithOpenAI" "L3 TTS dùng header người dùng"

# MCP client chỉ gửi header cấu hình và auth.
check_raw "$LH/src/libs/mcp/client.ts" "const headers: Record<string, string> = { ...params.headers };" "L4 MCP client chỉ nhận header cấu hình"
check_raw "$LH/src/libs/mcp/client.ts" "requestInit: { headers }," "L5 MCP client dùng đúng bộ header đó"
check_absent "$LH/src/libs/mcp/client.ts" "user-id" "L6 MCP client không có user-id"
check_raw "$LH/src/server/services/mcp/index.ts" "(mcpParams as any).headers = headers;" "L7 MCP service chuyển header cấu hình"
check_raw "$LH/src/server/routers/tools/mcp.ts" "input.headers," "L8 route MCP chuyển header thẳng"
check_raw "$LH/src/services/mcp.ts" "...connection.headers," "L9 chat gộp header của kết nối"
check_raw "$LH/src/services/mcp.ts" "...pluginSettings," "L10 chat gộp thêm cài đặt skill"

# OAuth2 chỉ là kiểu dữ liệu, form chưa có.
check_raw "$LH/src/libs/mcp/types.ts" "// --- Stage 2 & 3: OAuth 2.1 automated flow ---" "L11 OAuth2 MCP còn ở giai đoạn sau"
check_raw "$LH/src/features/PluginDevModal/MCPManifestForm/index.tsx" "value: 'bearer'," "L12 form MCP có API Key"
check_absent "$LH/src/features/PluginDevModal/MCPManifestForm/index.tsx" "oauth2" "L13 form MCP không có OAuth2"
check_raw "$LH/src/features/PluginDevModal/MCPManifestForm/index.tsx" "addButtonText={t('dev.mcp.headers.add')}" "L14 form MCP cho đặt header tự do"

# Lời gọi model có gửi user trong body.
check_raw "$LH/src/app/(backend)/webapi/chat/%5Bprovider%5D/route.ts" "user: userId," "L15 webapi gửi mã người dùng"
check_raw "$LH/src/server/modules/AgentRuntime/RuntimeExecutors.ts" "user: ctx.userId," "L16 agent runtime gửi mã người dùng"
check_raw "$LH/packages/model-runtime/src/core/openaiCompatibleFactory/index.ts" "...(chatCompletion?.noUserId ? {} : { user: options?.user })," "L17 OpenAI-compatible gửi trường user"
check_raw "$LH/packages/model-runtime/src/core/openaiCompatibleFactory/index.ts" "safety_identifier: options?.user," "L18 Responses API gửi safety_identifier"
check_raw "$LH/packages/model-runtime/src/core/anthropicCompatibleFactory/index.ts" "metadata: options?.user ? { user_id: options.user } : undefined," "L19 Anthropic gửi metadata.user_id"
check_raw "$LH/packages/model-runtime/src/providers/githubCopilot/index.ts" "metadata: options?.user ? { user_id: options.user } : undefined," "L20 GitHub Copilot Anthropic gửi metadata.user_id"
check_raw "$LH/packages/model-runtime/src/providers/cohere/index.ts" "noUserId: true," "L21 Cohere không gửi user"

# Bốn chế độ duyệt, headless bị ẩn.
check_raw "$LH/packages/types/src/tool/intervention.ts" "approvalMode: 'auto-run' | 'allow-list' | 'manual' | 'headless';" "L22 kiểu dữ liệu có headless"
check_raw "$LH/src/store/user/slices/settings/selectors/toolIntervention.ts" "// Filter out 'headless' mode as it's not user-selectable" "L23 selector ẩn headless"
check_absent "$LH/src/features/ChatInput/RuntimeConfig/ApprovalMode.tsx" "headless" "L24 menu duyệt không có headless"
check_raw "$LH/packages/agent-runtime/src/agents/GeneralChatAgent.ts" "if (approvalMode === 'headless') {" "L25 agent runtime xử lý headless"
check_raw "$LH/src/server/routers/lambda/aiAgent.ts" "userInterventionConfig: UserInterventionConfigSchema.optional()," "L26 API nhận cấu hình duyệt"
check_raw "$LH/src/server/services/aiAgent/index.ts" "userInterventionConfig = { approvalMode: 'headless' }," "L27 mặc định headless khi thiếu cấu hình"
check_raw "$LH/packages/agent-runtime/src/agents/GeneralChatAgent.ts" "const config = this.getToolInterventionConfig(toolCalling, state);" "L28 manual đọc chính sách của tool"
check_raw "$LH/src/server/services/mcp/index.ts" "parameters: item.inputSchema as ToolManifestSettings," "L29 tool MCP chỉ có tên, mô tả, schema"

echo
printf 'Tổng: %d PASS, %d MISS/BLOCKED\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
