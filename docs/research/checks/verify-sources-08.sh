#!/usr/bin/env bash
# Kiem cheo nguon cho docs/research/08-khao-sat-nam-phuong-phap-tich-hop.md
# Moi dong kiem mot cau trich: mo URL, bo the HTML, giai ma thuc the, gop khoang trang, so khop nguyen van.
# Cach chay: bash docs/research/checks/verify-sources-08.sh
# Ky vong: 68 PASS, 0 FAIL. Ngay chay dau: 2026-11-12.

set -u
PASS=0
FAIL=0
BODY=""
LAST=""

norm() {
  sed -e 's/<[^>]*>//g' | tr '\n\t' '  ' | sed \
      -e "s/&rsquo;/'/g" -e "s/&#39;/'/g" -e 's/&quot;/"/g' \
      -e 's/&amp;/\&/g' -e 's/&nbsp;/ /g' -e 's/&ndash;/-/g' \
      -e 's/  */ /g' -e 's/ ,/,/g'
}

check() { # $1 url, $2 cau trich, $3 nhan nguon
  if [ "$1" != "$LAST" ]; then
    BODY=$(curl -sL --compressed --max-time 60 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "$1" 2>/dev/null | norm)
    LAST="$1"
  fi
  if [ -z "$BODY" ]; then
    printf 'BLOCKED | %-30s | %s\n' "$3" "$1"
    FAIL=$((FAIL + 1))
    return
  fi
  case "$BODY" in
    " Access Denied"* | "Access Denied"*)
      printf 'BLOCKED | %-30s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      return
      ;;
  esac
  case "$BODY" in
    *"$2"*)
      printf 'PASS    | %s\n' "$3"
      PASS=$((PASS + 1))
      ;;
    *)
      printf 'MISS    | %-30s | %s\n' "$3" "$1"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

# --- E1 ---
check "https://www.anthropic.com/news/model-context-protocol" "a new standard for connecting AI assistants to the systems where data lives" "E1 cau 1"
check "https://www.anthropic.com/news/model-context-protocol" "MCP was created at Anthropic by David Soria Parra and Justin Spahr-Summers." "E1 cau 2"
check "https://www.anthropic.com/news/model-context-protocol" "Every new data source requires its own custom implementation, making truly connected systems difficult to scale." "E1 cau 3"

# --- E5 ---
check "https://www.jsonrpc.org/specification" "A rpc call is represented by sending a Request object to a Server" "E5 cau 1"
check "https://www.jsonrpc.org/specification" "This member is used to correlate the context between the two objects" "E5 cau 2"

# --- E2 ---
check "https://claude.com/resources/articles/what-is-model-context-protocol" "Recognizing this as a classic M×N problem where multiple applications need multiple integrations, David pitched building a protocol to solve this to Justin." "E2 cau 1"
check "https://claude.com/resources/articles/what-is-model-context-protocol" "They designed MCP based on the popular Language Server Protocol and open-sourced it in November 2024" "E2 cau 2"

# --- E3 ---
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "Tools in MCP are designed to be model-controlled" "E3 cau 1"
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "the protocol itself does not mandate any specific user interaction model" "E3 cau 2"
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "MCP has no protocol-level session" "E3 cau 3"
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "The protocol has no concept of a state handle" "E3 cau 4"
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "there SHOULD always be a human in the loop with the ability to deny tool invocations" "E3 cau 5"
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "Prompt for user confirmation on sensitive operations" "E3 cau 6"
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "Note that the JSON-RPC id MUST be different between the initial request and the retry" "E3 cau 7"
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "The set MAY vary by the authorization presented on the request" "E3 cau 8"
check "https://modelcontextprotocol.io/specification/2026-07-28/server/tools" "a handle is a name, not a capability" "E3 cau 9"

# --- E4 ---
check "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization" "A protected MCP server acts as an OAuth 2.1 resource server" "E4 cau 1"
check "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization" "MCP servers MUST NOT accept or transit any other tokens" "E4 cau 2"
check "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization" "Authorization is OPTIONAL for MCP implementations" "E4 cau 3"
check "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization" "implements a selected subset of their features" "E4 cau 4"

# --- E25 ---
check "https://modelcontextprotocol.io/specification/2026-07-28/changelog" "Make MCP stateless: remove the initialize/notifications/initialized handshake." "E25 cau 1"

# --- E6 ---
check "https://raw.githubusercontent.com/github/github-mcp-server/main/docs/policies-and-governance.md" "MCP traffic appears in standard GitHub audit logs as normal API calls" "E6 cau 1"
check "https://raw.githubusercontent.com/github/github-mcp-server/main/docs/policies-and-governance.md" "Users and apps cannot use an MCP server to access more resources than they could otherwise access normally via the API" "E6 cau 2"

# --- E8 ---
check "https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/function-calling" "The model generates function calls and structured arguments based on the functions you specify." "E8 cau 1"
check "https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/function-calling" "Your application executes the functions and returns the results to the model, so you remain in control of the actions taken." "E8 cau 2"
check "https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/function-calling" "When the model decides to call a function, it responds with a JSON object that includes the arguments for the function." "E8 cau 3"
check "https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/function-calling" "The JSON response might not always be valid so you need to add additional logic to your code to be able to handle errors." "E8 cau 4"

# --- E7 ---
check "https://arxiv.org/abs/2302.04761" "Submitted on 9 Feb 2023" "E7 cau 1"
check "https://arxiv.org/abs/2302.04761" "In this paper, we show that LMs can teach themselves to use external tools via simple APIs and achieve the best of both worlds." "E7 cau 2"

# --- E11 ---
check "https://docs.temporal.io/design-patterns/approval" "It uses Workflow Signals with custom input data to unblock Workflows, enabling approval processes, manual reviews, and decision gates in automated business processes." "E11 cau 1"

# --- E10 ---
check "https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html" "A task might need to wait for a human approval, integrate with a third party, or call legacy systems." "E10 cau 1"
check "https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html" "Callback tasks provide a way to pause a workflow until a task token is returned." "E10 cau 2"
check "https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html" "Service integrations that use the .sync or .waitForTaskToken patterns require additional IAM permissions." "E10 cau 3"

# --- E9 ---
check "https://www.uber.com/us/en/blog/open-source-orchestration-tool-cadence-overview/" "In 2017, we made Cadence an open source project" "E9 cau 1"
check "https://www.uber.com/us/en/blog/open-source-orchestration-tool-cadence-overview/" "To help our microservices work in harmony, we built Cadence, our orchestration engine" "E9 cau 2"
check "https://www.uber.com/us/en/blog/open-source-orchestration-tool-cadence-overview/" "He shows how Cadence synchronizes the eight standard steps in an Uber Eats workflow" "E9 cau 3"

# --- E13 ---
check "https://docs.temporal.io/activity-definition" "By design, completed Activities will not re-execute as part of a Workflow Replay" "E13 cau 1"
check "https://docs.temporal.io/activity-definition" "Temporal recommends that Activities be idempotent." "E13 cau 2"
check "https://docs.temporal.io/activity-definition" "If an Activity fails to report to the server at all, it will be retried." "E13 cau 3"

# --- E12 ---
check "https://docs.temporal.io/workflow-definition" "A Workflow Definition must be deterministic to support replay." "E12 cau 1"
check "https://docs.temporal.io/workflow-definition" "The Temporal Platform requires that Workflow Definitions be deterministic." "E12 cau 2"

# --- E14 ---
check "https://arxiv.org/abs/2210.03629" "we explore the use of LLMs to generate both reasoning traces and task-specific actions in an interleaved manner" "E14 cau 1"
check "https://arxiv.org/abs/2210.03629" "Submitted on 6 Oct 2022" "E14 cau 2"
check "https://arxiv.org/abs/2210.03629" "ReAct overcomes issues of hallucination and error propagation prevalent in chain-of-thought reasoning" "E14 cau 3"

# --- E17 ---
check "https://docs.langchain.com/oss/python/langchain/human-in-the-loop" "the review happens as the tool call starts, inside the tool-call middleware chain" "E17 cau 1"
check "https://docs.langchain.com/oss/python/langchain/human-in-the-loop" "Modify the tool arguments before execution." "E17 cau 2"
check "https://docs.langchain.com/oss/python/langchain/human-in-the-loop" "Answering them again runs those tools twice." "E17 cau 3"

# --- E18 ---
check "https://openai.github.io/openai-agents-python/handoffs/" "Handoffs are represented as tools to the LLM." "E18 cau 1"

# --- E15 ---
check "https://arxiv.org/abs/2308.08155" "Submitted on 16 Aug 2023" "E15 cau 1"
check "https://arxiv.org/abs/2308.08155" "AutoGen is an open-source framework that allows developers to build LLM applications via multiple agents that can converse with each other" "E15 cau 2"
check "https://arxiv.org/abs/2308.08155" "AutoGen serves as a generic infrastructure to build diverse applications of various complexities and LLM capacities." "E15 cau 3"

# --- E16 ---
check "https://docs.langchain.com/oss/python/langgraph/interrupts" "the checkpointer writes the exact graph state so you can resume later, even when in an error state" "E16 cau 1"

# --- E19 ---
check "https://openai.github.io/openai-agents-python/human_in_the_loop/" "Approval permits a tool call to execute; it does not guarantee exactly-once execution." "E19 cau 1"
check "https://openai.github.io/openai-agents-python/human_in_the_loop/" "Do not take the reviewer's identity from the approval request body." "E19 cau 2"
check "https://openai.github.io/openai-agents-python/human_in_the_loop/" "A different agent's function tool does not inherit a decision merely because the tool has the same name." "E19 cau 3"

# --- E20 ---
check "https://code.claude.com/docs/en/security" "When it needs to edit files, run tests, or execute commands, it asks you first" "E20 cau 1"

# --- E21 ---
check "https://docs.confluent.io/kafka/design/delivery-semantics.html" "If there is a system failure, messages are never lost, but they may be delivered more than once." "E21 cau 1"

# --- E22 ---
check "https://microservices.io/patterns/data/transactional-outbox.html" "As a result, a message consumer must be idempotent, perhaps by tracking the IDs of the messages that it has already processed." "E22 cau 1"
check "https://microservices.io/patterns/data/transactional-outbox.html" "The command must atomically update the database and send messages in order to avoid data inconsistencies and bugs." "E22 cau 2"
check "https://microservices.io/patterns/data/transactional-outbox.html" "A separate process then sends the messages to the message broker." "E22 cau 3"
check "https://microservices.io/patterns/data/transactional-outbox.html" "The Message relay might publish a message more than once." "E22 cau 4"
check "https://microservices.io/patterns/data/transactional-outbox.html" "A separate process then sends the messages to the message broker." "E22 cau 5"
check "https://microservices.io/patterns/data/transactional-outbox.html" "Messages must be sent to the message broker in the order they were sent by the service." "E22 cau 6"
check "https://microservices.io/patterns/data/transactional-outbox.html" "The Message relay might publish a message more than once." "E22 cau 7"

# --- E24 ---
check "https://raw.githubusercontent.com/cloudevents/spec/main/cloudevents/spec.md" "Events are everywhere. However, event producers tend to describe events differently." "E24 cau 1"
check "https://raw.githubusercontent.com/cloudevents/spec/main/cloudevents/spec.md" "The lack of a common way of describing events means developers are constantly re-learning how to consume events." "E24 cau 2"

# --- E23 ---
check "https://docs.stripe.com/api/idempotent_requests" "For API v1, all POST requests accept idempotency keys." "E23 cau 1"
check "https://docs.stripe.com/api/idempotent_requests" "For API v1, all POST requests accept idempotency keys." "E23 cau 2"

echo "----- PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
