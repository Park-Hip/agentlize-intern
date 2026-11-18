#!/usr/bin/env bash
# Kiểm chéo nguồn cho rd/research/market/market-landscape.md
# Mỗi dòng kiểm một câu trích: mở URL, bỏ thẻ HTML, gộp khoảng trắng, so khớp nguyên văn.
# Cách chạy: bash rd/checks/market-landscape.sh
# Kỳ vọng: toàn bộ PASS. Trang sản phẩm Microsoft Agent 365 (N22) trả lỗi với curl nên không có dòng kiểm.
# Ngày chạy đầu: 2026-11-16. Bổ sung StackOne, Arcade, Auth0 và trang chính các tên chỉ nhóm: 2026-11-17.

set -u
PASS=0
FAIL=0

check() { # $1 url, $2 câu trích, $3 nhãn nguồn
  local body
  body=$(curl -sL --compressed --max-time 45 -A "Mozilla/5.0" "$1" 2>/dev/null | tr -d '\000' | sed -e 's/<[^>]*>//g' | tr -s ' \n\t' ' ')
  if [ -z "$body" ]; then
    printf 'BLOCKED | %-42s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
    return
  fi
  case "$body" in
    *"$2"*)
      printf 'PASS    | %s\n' "$3"
      PASS=$((PASS + 1))
      ;;
    *)
      printf 'MISS    | %-42s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

# --- Liyagent ---
check "https://liyagent.com/docs/govern/trust-ledger" "Every agent write leaves a receipt bound to the approval digest" "N1 Liyagent receipt digest"
check "https://liyagent.com/docs/govern/trust-ledger" "idempotency_key" "N1 Liyagent idempotency key"
check "https://liyagent.com/docs/govern/trust-ledger" "on_behalf_of" "N1 Liyagent on_behalf_of"
check "https://liyagent.com/llms.txt" "and its record shows what it cost" "N28 Liyagent run trace cost"
check "https://liyagent.com/llms.txt" "over agents the customer already runs" "N28 Liyagent existing agents"
check "https://liyagent.com/docs/govern/permissions" "Each approval is single-use and expires" "N2 Liyagent approval TTL"
check "https://liyagent.com/docs/govern/access" "A forbid always wins over a permit" "N3 Liyagent forbid wins"
check "https://liyagent.com/pricing" "US\$99" "N4 Liyagent price"
check "https://liyagent.com/pricing" "source code is not part of any plan" "N4 Liyagent closed source"

# --- Preloop ---
check "https://preloop.ai/" "can inspect arguments, not just tool names" "N5 Preloop argument rules"
check "https://preloop.ai/" "hash-chained runtime audit trail" "N5 Preloop hash chain"
check "https://docs.preloop.ai/architecture/approvals/" "fail closed by default" "N6 Preloop fail closed"
check "https://docs.preloop.ai/architecture/approvals/" "deny is the safe default" "N6 Preloop deny default"
check "https://preloop.ai/pricing" "\$6,000/yr" "N7 Preloop self-host price"

# --- Permit ---
check "https://docs.permit.io/permit-mcp-gateway/" "each tool call is bound to one human and one agent" "N8 Permit two-layer identity"
check "https://docs.permit.io/permit-mcp-gateway/" "Deny by default" "N8 Permit deny default"
check "https://docs.permit.io/permit-mcp-gateway/human-in-the-loop/" "A timeout always rejects the request" "N9 Permit timeout rejects"
check "https://docs.permit.io/permit-mcp-gateway/human-in-the-loop/" "Human-in-the-loop approvals are available on" "N9 Permit HITL Enterprise"
check "https://www.permit.io/mcp-gateway/pricing" "starting /month" "N10 Permit price"

# --- AWS AgentCore ---
check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html" "single, secure endpoint" "N11 AgentCore single endpoint"
check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-core-concepts.html" "default-deny and forbid-wins" "N12 AgentCore default deny"
check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-core-concepts.html" "Dogwood is an open-source policy language" "N12 AgentCore Dogwood"
check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-temporal.html" "requiring an approval before an action" "N13 AgentCore temporal approval"
check "https://aws.amazon.com/bedrock/agentcore/pricing/" "0.000025" "N14 AgentCore policy price"
check "https://aws.amazon.com/bedrock/agentcore/pricing/" '$5/million' "N14 AgentCore tool call price"
check "https://aws.amazon.com/bedrock/agentcore/pricing/" '$25/million' "N14 AgentCore search price"
check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-create-api.html" "clientToken" "N15 AgentCore clientToken"
check "https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentrel06-bp04.html" "without idempotency it can produce duplicate side effects" "N16 AWS idempotency guidance"

# --- Google ---
check "https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/policies/semantic-governance-overview.md.txt" "probabilistic and can make mistakes" "N17 Google semantic probabilistic"
check "https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/policies/semantic-governance-overview.md.txt" "All other calls are denied" "N17 Google semantic deny"
check "https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/agent-gateway-overview.md.txt" "By default, all connections are blocked unless an explicit IAM policy grants access" "N18 Google gateway default block"
check "https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/agent-gateway-overview.md.txt" "Each Agent Gateway instance can govern up to 5,000 resources" "N18 Google gateway 5,000 resources"

check "https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/agent-identity-overview.md.txt" "based on the [SPIFFE standard]" "N19 Google SPIFFE identity"

# --- Microsoft ---
check "https://learn.microsoft.com/en-us/entra/agent-id/agent-identities" "The subject of the token is a user, while the actor is the agent identity" "N20 Entra subject and actor"
check "https://learn.microsoft.com/en-us/office365/servicedescriptions/microsoft-agent-365/microsoft-agent-365" "Control which tools" "N21 Agent 365 tool control"
check "https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/add-human-in-the-loop" "pause indefinitely" "N23 Foundry approval pause"

# --- Kong ---
check "https://developer.konghq.com/plugins/ai-mcp-proxy/" "Consumer and Consumer Group scoping is not supported" "N24 Kong no group scoping"
check "https://developer.konghq.com/plugins/ai-mcp-proxy/" "No ACL configuration" "N24 Kong no ACL allows"

# --- Workflow ---
check "https://docs.temporal.io/ai-cookbook/human-in-the-loop-python" "consumes no compute resources" "N25 Temporal wait free"
check "https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html" "wait for the task token" "N26 Step Functions task token"

# --- Auth0 for AI Agents ---
check "https://auth0.com/ai/docs/intro/asynchronous-authorization" "Auth0 implements asynchronous authorization using the Client-Initiated Backchannel Authentication (CIBA) with Rich Authorization Requests (RAR)" "N29 Auth0 CIBA with RAR"
check "https://auth0.com/ai/docs/intro/asynchronous-authorization" "Using RAR is optional for a CIBA flow" "N29 Auth0 RAR optional"
check "https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-initiated-backchannel-authentication-flow/user-authorization-with-ciba.md" "defaults to 300 seconds" "N30 Auth0 CIBA expiry"
check "https://auth0.com/ai/docs/intro/token-vault.md" "access external APIs on a user" "N31 Auth0 Token Vault on behalf"
check "https://auth0.com/ai/docs/intro/authorization-for-rag.md" "document-level access control" "N32 Auth0 FGA document level"

# --- Arcade ---
check "https://docs.arcade.dev/llms.txt" "per-action authorization at runtime" "N33 Arcade per-action authorization"
check "https://docs.arcade.dev/llms.txt" "on behalf of users" "N33 Arcade on behalf of users"
check "https://docs.arcade.dev/llms.txt" "Configure once and use any model, framework, and client" "N33 Arcade any client"
check "https://docs.arcade.dev/llms.txt" "OpenTelemetry audit logs" "N33 Arcade OTel audit"
check "https://docs.arcade.dev/en/operate/governance/contextual-access/how-hooks-work" "Use it to redact PII or filter content" "N34 Arcade post hook filter"
check "https://docs.arcade.dev/en/operate/governance/contextual-access/how-hooks-work" "Set the failure mode per hook configuration" "N34 Arcade failure mode"
check "https://docs.arcade.dev/en/operate/governance/contextual-access/how-hooks-work" "Fail open" "N34 Arcade fail open option"

# --- StackOne ---
check "https://docs.stackone.com/secure/policies.md" "on behalf of the member it acts for" "N35 StackOne per member"
check "https://docs.stackone.com/secure/policies.md" "Masks the field in responses." "N35 StackOne read field mask"
check "https://docs.stackone.com/secure/policies.md" "Refuses calls that would change the field." "N35 StackOne write field refuse"
check "https://docs.stackone.com/secure/policies.md" "A deny always wins" "N35 StackOne deny wins"
check "https://docs.stackone.com/secure/policies.md" "Value rules check the argument values a tool receives before it executes" "N35 StackOne value rules"
check "https://docs.stackone.com/secure/policies.md" "An allow rule restricts nothing" "N35 StackOne allow restricts nothing"
check "https://docs.stackone.com/secure/policies.md" "A call made with a project API key is memberless" "N35 StackOne memberless API key"
check "https://docs.stackone.com/secure/policies.md" "is returned unredacted" "N35 StackOne unscanned unredacted"
check "https://docs.stackone.com/secure/policies.md" "Records decisions in the logs" "N35 StackOne decision logs"
check "https://docs.stackone.com/secure/policies.md" "Tool Policies is only available on certain plans" "N35 StackOne plans"
check "https://docs.stackone.com/llms.txt" "Build, customize, test, and publish your own connectors" "N36 StackOne own connectors"
check "https://www.stackone.com/pricing/" '$600' "N36 StackOne Team price"

# --- Cloudflare ---
check "https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/" "bypass your Access policies" "N37 Cloudflare portal bypass"

# --- Trang chính của các tên chỉ nhóm (mục 8.2): chỉ kiểm trang mở được và có tên ---
check "https://learn.microsoft.com/en-us/azure/api-management/export-rest-mcp-server" "MCP server" "8.2 Azure API Management"
check "https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/" "MCP Gateway" "8.2 Docker MCP Gateway"
check "https://www.truefoundry.com/mcp-gateway" "MCP Gateway" "8.2 TrueFoundry"
check "https://github.com/IBM/mcp-context-forge" "ContextForge" "8.2 IBM ContextForge"
check "https://agentgateway.dev/" "agentgateway" "8.2 agentgateway"
check "https://c1.ai/news/press-release/c1-launches-agent-runtime-governance" "runtime governance" "8.2 C1"
check "https://execlave.com/" "Execlave" "8.2 Execlave"
check "https://assury.ai/" "Assury" "8.2 Assury"
check "https://www.okta.com/integrations/cross-app-access/" "Cross App Access" "8.2 Okta Cross App Access"
check "https://www.cerbos.dev/blog/mcp-authorization" "Cerbos" "8.2 Cerbos"
check "https://www.osohq.com/" "Oso makes your AI agents safe" "8.2 Oso"
check "https://docs.composio.dev/docs/authentication" "Authentication is always per user" "8.2 Composio"
check "https://pipedream.com/docs/connect" "Make requests on behalf of your users" "8.2 Pipedream Connect"
check "https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event" "waitForEvent" "8.2 Inngest"
check "https://restate.dev/" "Restate" "8.2 Restate"
check "https://www.uipath.com/platform/agentic-automation/agentic-orchestration" "Maestro" "8.2 UiPath Maestro"
check "https://docs.gotohuman.com/human-reviews" "posts the result back to your webhook" "8.2 gotoHuman"
# Trang HTML của PyPI chặn curl bằng trang thử thách; API JSON của cùng gói trả cùng mô tả.
check "https://pypi.org/pypi/humanlayer/json" "require_approval" "8.2 HumanLayer"
check "https://www.workato.com/" "Workato" "8.2 Workato"
check "https://zapier.com/mcp" "Zapier" "8.2 Zapier"
check "https://n8n.io/" "n8n" "8.2 n8n"
check "https://www.mulesoft.com/" "MuleSoft" "8.2 MuleSoft"
check "https://www.salesforce.com/agentforce/" "Agentforce" "8.2 Salesforce Agentforce"
check "https://learn.microsoft.com/en-us/microsoft-copilot-studio/fundamentals-what-is-copilot-studio" "Copilot Studio" "8.2 Copilot Studio"
check "https://portkey.ai/" "Portkey" "8.2 Portkey"
check "https://docs.litellm.ai/" "LiteLLM" "8.2 LiteLLM"
check "https://www.helicone.ai/" "Helicone" "8.2 Helicone"
check "https://www.langchain.com/langsmith" "LangSmith" "8.2 LangSmith"

printf '\nTổng: %d PASS, %d FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
