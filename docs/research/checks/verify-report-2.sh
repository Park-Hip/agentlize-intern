#!/usr/bin/env bash
# Kiểm nguồn cho mục 2.3 của docs/reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md.
#
# Mỗi dòng kiểm một câu trích trong báo cáo bằng cách tải trang gốc và so khớp
# nguyên văn (không phân biệt hoa thường). In MATCH hoặc NOMATCH cho từng câu.
#
# Chạy: bash docs/research/checks/verify-report-2.sh
# Cần: curl, grep. Không cần đăng nhập.

set -u

pass=0
fail=0

check() {
  local url="$1"
  local needle="$2"
  local label="$3"
  local body

  body=$(curl -sL --max-time 30 -A "Mozilla/5.0" "$url" 2>/dev/null)

  if printf '%s' "$body" | grep -Fqi -- "$needle"; then
    echo "MATCH   | $label"
    pass=$((pass + 1))
  else
    echo "NOMATCH | $label | $url"
    fail=$((fail + 1))
  fi
}

check "https://openai.github.io/openai-agents-python/human_in_the_loop/" \
  "needs_approval" \
  "1 runtime agent: needs_approval"

check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" \
  "MUST" \
  "2 connector: tools/list"

check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html" \
  "single, secure endpoint" \
  "3 gateway: single secure endpoint"

check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-core-concepts.html" \
  "evaluates all applicable policies against the request to determine whether to allow or deny access" \
  "4 policy engine: evaluate per invocation"

check "https://learn.microsoft.com/en-us/entra/agent-id/agent-identities" \
  "The subject of the token is a user, while the actor is the agent identity." \
  "5 identity: subject user, actor agent"

check "https://www.rfc-editor.org/rfc/rfc8693.html" \
  '"may_act" (Authorized Actor) Claim' \
  "5 identity: RFC 8693 may_act"

check "https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/agent-gateway-overview.md.txt" \
  "By default, all connections are blocked unless an explicit IAM policy grants access." \
  "6 registry: approved tools and endpoints, default blocked"

check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability.html" \
  "OpenTelemetry (OTEL)-compatible format" \
  "7 observability: OTel compatible"

check "https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/execute-tool.md" \
  "gen_ai.tool.call.arguments" \
  "7 observability: tool arguments attribute"

echo
echo "Kết quả: $pass khớp, $fail không khớp."
[ "$fail" -eq 0 ]
