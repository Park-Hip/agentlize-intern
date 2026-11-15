# AGENTS.md

Guidance for agents working in this repository.

## 1. Context

R&amp;D repository for **AgentLize Next Gen AI 2026** (Appota Group), an 8 week internship program starting 09/11/2026.

- Chosen track: **Track 01 - AI Platform &amp; MCP**. The other two tracks are out of scope here.
- Central question: how can AI connect to, use and coordinate business tools and systems in a way that is safe, observable and reusable?
- Delivery vehicle: the **AI Operations Connector Lab** mini project. Two simulated systems (an employee directory and a task list), one agent that reads data, checks permission, proposes an update and only writes after confirmation, plus two integration approaches built side by side for comparison.

Authoritative sources:

- `docs/program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt`: extracted text for fast grep and citation.

Read the  TXT for the full acceptance criteria, the R&amp;D framework and the week by week plan.

## 2. Current state

The repository holds documents only. There is no code yet.

The company ecosystem the lab will eventually plug into is recorded in `docs/context/appota-ai-ecosystem.md` (AgentLize control plane, Thổ Thần AI execution plane, Kdata infrastructure, business data owners).
It is context for where the work lands, not a decision on stack or architecture, and it needs Kevin to confirm it.

Stack, architecture and MVP scope are not decided. They must land in an ADR before any code is written.

When code arrives, add a real `## 6. Commands` section to this file with the actual setup, run and test commands. The render and source-check commands are already there.

## 3. Required way of working

The program forbids starting from "what should we code". The order is fixed:

1. **Explore**: survey at least 3 existing models or solutions, link the original sources.
2. **Compare**: table of tradeoffs covering cost, scalability, security and maintenance.
3. **Question**: name what is still unknown, turn assumptions into testable hypotheses.
4. **Propose**: pick the approach to try, explain why the alternatives lost, record an ADR.
5. **Build**: a small POC or MVP that runs, with run instructions.
6. **Evaluate**: baseline and test suite established before any claim of success.
7. **Package**: docs, test suite, demo, follow up backlog.

For Track 01, these five models must be surveyed before the approach is chosen: API/Function Calling, MCP, Workflow Engine, Agent Orchestration, Event driven Integration.

Do not skip steps 1 to 4, even when the request looks small.

## 4. Definition of done for Track 01

- A comparison of at least three architectural models exists before the approach is chosen.
- Permission checks, write operations, failures and reruns are tested, and a second agent is shown reusing the same tools.
- Latency, stability and cost (where measurable) are reported, together with a conclusion on when MCP is the wrong choice.

Three kinds of value must survive: Research Finding, Experimental Evidence, Reusable Asset.

Every artifact needs an owner, a definition of done and verifiable evidence.

## 5. Data boundary

- Use simulated data, public data, or sources that are explicitly permitted.
- Never put sensitive internal information, real credentials or customer data into the POC, logs, test fixtures or commits.

## 6. Commands

Render a Markdown document to A4 PDF. Requires Node/npx, Python 3, and Chrome or Edge.
The PDF is written next to the Markdown file unless an output path is given.

```
bash docs/render/render.sh docs/research/06-so-do-giai-phap.md
```

The step 01 source-check script (`docs/research/checks/verify-sources-08.sh`) is not in the working tree, so the 68 quote checks cannot be rerun until it is restored.

## 7. Writing conventions

- Never use an em dash. Use a plain hyphen.
- Every report carries evidence: a link, a number, or a command that can be rerun. "Currently researching" is not a result.

### 7.1. Two audiences, plain language

Every report has two readers: strong engineers, and readers who are not technical (managers, business owners, mentors from other tracks).
Write so the non-technical reader gets the point and the engineer loses nothing.

- **Open with a plain summary.** Each report starts with "Đọc nhanh": at most 5 short sentences or bullets that answer: what is the problem, what do we propose or conclude, what happens next.
  No codes (SR1, I1...), no acronyms, no English jargon in this part.
- **Technical depth goes after.** Codes, tables, sources and edge cases live in later sections. The plain summary must stay true without them.
- **Examples come from the Lab.** Use the employee directory and the task list (for example: assign task T-12 to an employee, change a task status, look up an employee's phone number).
  Use another domain (payments, refunds) only when the Lab cannot show the point, and say why.
- **Explain every term on first use** with one everyday sentence, keeping the English term in parentheses.
  Example: "chống ghi trùng (idempotency): gửi lại cùng một lệnh thì hệ thống không làm thêm lần nữa".
  Prefer the Vietnamese wording after that. Keep shared terms in `docs/glossary.md` and reuse them across reports.
- **Codes always carry a name.** Write "SR6 (không ghi trùng)", never a bare "SR6". Do not use a code before the section that defines it.
- **One sentence, one idea.** Aim for at most about 25 words. Name who does what ("agent gửi lệnh", "người duyệt bấm duyệt"), and avoid abstract nouns as the subject.
- **No talking about the document itself.** Cut sentences such as "phần này không trả lời...", "đọc như giả thuyết", "sai phạm trù". Say the point directly.
- **Hedge once, not everywhere.** Put the status (draft, not measured, not decided) on one line at the top. Inside the body, use "có thể" or "tùy" only when the condition is named.
- **Every section ends with "so what".** A conclusion, a decision, or a concrete next check. A section that only lists considerations is not finished.
- **One set of criteria across documents.** All comparisons and proposals judge against the same requirements (currently SR1-SR8 in `docs/reports/prd-ai-platform.md`). Do not invent a parallel list. If the set changes, update it at the source.
- **Readability check before submitting.** A non-technical reader should be able to read "Đọc nhanh" in 2 minutes and answer the three questions above. An engineer should be able to trace every claim to a source, a number or a test.