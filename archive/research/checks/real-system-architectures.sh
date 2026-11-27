#!/usr/bin/env bash
# Kiểm chéo nguồn cho archive/research/real-system-architectures.md
# Mỗi dòng kiểm một câu trích: mở URL, bỏ thẻ HTML, gộp khoảng trắng, so khớp nguyên văn.
# Cách chạy: bash archive/research/checks/real-system-architectures.sh
# Kỳ vọng: 50 PASS, 1 BLOCKED (S52, Salesforce trả Access Denied).
# Ngày chạy đầu: 2026-11-12.

set -u
PASS=0
FAIL=0

check() { # $1 url, $2 câu trích, $3 nhãn nguồn
  local body
  body=$(curl -sL --compressed --max-time 45 -A "Mozilla/5.0" "$1" 2>/dev/null | sed -e 's/<[^>]*>//g' | tr -s ' \n\t' ' ')
  if [ -z "$body" ]; then
    printf 'BLOCKED | %-34s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
    return
  fi
  case "$body" in
    " Access Denied"* | "Access Denied"*)
      printf 'BLOCKED | %-34s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      return
      ;;
  esac
  case "$body" in
    *"$2"*)
      printf 'PASS    | %s\n' "$3"
      PASS=$((PASS + 1))
      ;;
    *)
      printf 'MISS    | %-34s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

# --- Nhánh 1: MCP làm lớp connector ---
check "https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization" "MUST NOT pass through the token" "S1 MCP no token passthrough"
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "MAY vary by the authorization presented on the request" "S2 MCP tools vary by authz"
check "https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/" "injects any required credentials" "S4 Docker gateway creds"
check "https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/" "OAuthResourceServer" "S5 Cloudflare resource server"
check "https://developer.konghq.com/plugins/ai-mcp-proxy/" "used for ACL checks" "S6 Kong ACL checks"
check "https://developer.konghq.com/plugins/ai-mcp-proxy/" "scoping is not supported in any mode" "S6 Kong no group scoping"
check "https://ibm.github.io/mcp-context-forge/architecture/" "authoritative for auth" "S7 ContextForge auth owner"
check "https://raw.githubusercontent.com/github/github-mcp-server/main/docs/policies-and-governance.md" "more resources than they could otherwise access normally via the API" "S8 GitHub no escalation"
check "https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/" "executeRead, executeWrite, or executeDestructive" "S10 Atlassian risk tiers"
check "https://docs.stripe.com/mcp" "Human confirmation" "S11 Stripe human confirmation"

check "https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/" "Every property is a hint" "S3 MCP annotations are hints"
check "https://raw.githubusercontent.com/github/github-mcp-server/main/docs/scope-filtering.md" "don't support scope detection and show all tools" "S9 GitHub scope filter gaps"

# --- Nhánh 2: runtime agent ---
check "https://openai.github.io/openai-agents-python/human_in_the_loop/" "does not guarantee exactly-once execution" "S12 OpenAI approval not exactly-once"
check "https://code.claude.com/docs/en/agent-sdk/permissions" "without calling canUseTool" "S14 Claude pre-approved bypass"
check "https://code.claude.com/docs/en/agent-sdk/permissions" "denied this way even in bypassPermissions" "S14 Claude deny wins"
check "https://learn.microsoft.com/en-us/agent-framework/agents/tools/tool-approval" "matches a pending approval request recorded in the same AgentSession" "S16 MAF session binding"
check "https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop" "pending requests" "S17 MAF checkpoint"
check "https://adk.dev/tools-custom/confirmation/" "function_call_id" "S19 ADK confirmation id"
check "https://adk.dev/runtime/resume/" "may run more than once" "S20 ADK at-least-once tools"

# --- Nhánh 3: durable execution ---
check "https://docs.temporal.io/ai-cookbook/human-in-the-loop-python" "consumes no compute resources" "S24 Temporal wait costs nothing"
check "https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html" "wait for the task token" "S27 SFN callback token"
check "https://docs.aws.amazon.com/step-functions/latest/dg/concepts-standard-vs-express.html" "exactly-once model, where your tasks and states are never run more than once" "S28 SFN exactly-once"
check "https://www.inngest.com/docs/learn/how-functions-are-executed" "memoization" "S30 Inngest memoization"
check "https://www.inngest.com/docs/durable-execution/primitives" "does not make an external action exactly once" "S31 Inngest step not exactly-once"
check "https://docs.restate.dev/concepts/durable_execution" "deduplicated" "S33 Restate dedupe"
check "https://airflow.apache.org/docs/apache-airflow/stable/tutorial/hitl.html" "awaiting_input" "S34 Airflow HITL state"

# --- Nhánh 4: event-driven ---
check "https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html" "remove duplicate messages" "S37 Debezium outbox id"
check "https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md" "identical" "S38 CloudEvents duplicate pair"
check "https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/" "idempotency key is a unique value" "S39 IETF idem key"
check "https://docs.stripe.com/api/idempotent_requests" "compares incoming parameters" "S40 Stripe param compare"
check "https://kafka.apache.org/44/design/design/" "deduplicates messages using a sequence number" "S41 Kafka idempotent producer"
check "https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries" "does not automatically redeliver" "S42 GitHub no auto retry"

# --- Nhánh 5: connector và định danh ---
check "https://docs.zapier.com/mcp/overview/how-connections-work" "Zapier holds the app credentials" "S44 Zapier holds creds"
check "https://docs.workato.com/en/connections" "re-used across recipes" "S46 Workato shared connection"
check "https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools" "approval request" "S47 n8n HITL"
check "https://learn.microsoft.com/en-us/entra/agent-id/agent-identities" "The subject of the token is a user, while the actor is the agent identity" "S49 Entra subject vs actor"
check "https://www.rfc-editor.org/rfc/rfc8693.html" "may_act" "S50 RFC 8693 may_act"
check "https://spiffe.io/docs/latest/spire-about/spire-concepts/" "node and workload attestation" "S51 SPIRE attestation"
check "https://architect.salesforce.com/docs/architect/well-architected/guide/agentic-enterprise-trust" "running user" "S52 Salesforce (dự kiến BLOCKED)"

# --- Nhánh 6: kiến trúc tham chiếu ---
check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-getting-started.html" "intercepts all requests at the gateway boundary" "S54 AgentCore policy intercepts"
check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-core-concepts.html" "enforces default-deny and forbid-wins semantics" "S55 AgentCore default deny"
check "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html" "propagates the session and caller identity" "S56 AgentCore identity propagation"
check "https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/toolbox" "The MCP endpoint doesn't block tools/call" "S59 Foundry gateway not enforcer"
check "https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/agent-gateway-overview.md.txt" "Agent Gateway is the governance and security enforcement layer" "S61 Google gateway PEP"
check "https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/policies/semantic-governance-overview.md.txt" "policy engine" "S62 Google policy engine"
check "https://learn.microsoft.com/en-us/azure/api-center/register-discover-mcp-server" "model context protocol" "S63 Azure API Center registry"
check "https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/execute-tool.md" "gen_ai.tool.call.arguments" "S65 OTel tool args opt-in"

# --- Giá niêm yết dùng ở bảng tradeoff, mục 5 ---
check "https://temporal.io/pricing" "per million Actions" "S26 Temporal giá action"
check "https://aws.amazon.com/step-functions/pricing/" "0.000025" "S29 Step Functions giá transition"
check "https://www.inngest.com/pricing" "99/mo" "S32 Inngest giá gói"
check "https://www.restate.dev/pricing" "100k durable actions per month" "Giá Restate, không nằm trong sổ nguồn"

printf '\nPASS %d | BLOCKED %d\n' "$PASS" "$FAIL"
