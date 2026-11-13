# AGENTS.md

Guidance for agents working in this repository.

## 1. Context

R&D repository for **AgentLize Next Gen AI 2026** (Appota Group), an 8 week internship program starting 09/11/2026.

- Owner: Pham Bach Hiep (Intern). Mentor: Kevin.
- Chosen track: **Track 01 - AI Platform & MCP**. The other two tracks are out of scope here.
- Central question: how can AI connect to, use and coordinate business tools and systems in a way that is safe, observable and reusable?
- Delivery vehicle: the **AI Operations Connector Lab** mini project. Two simulated systems (an employee directory and a task list), one agent that reads data, checks permission, proposes an update and only writes after confirmation, plus two integration approaches built side by side for comparison.

Authoritative sources:

- `docs/program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.pdf`: the authoritative original.
- `docs/program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt`: extracted text for fast grep and citation.

Read the PDF or TXT for the full acceptance criteria, the R&D framework and the week by week plan.

## 2. Current state

The repository holds documents only. There is no code yet.

The only document that has passed review is the step 0 artifact at `docs/reports/buoc-0-van-de-mo-hinh-he-thong-va-yeu-cau.md`.
It is back in review after Part 2 was rewritten, so treat Part 1 and Part 3 as reviewed and Part 2 as still open.
Every other Markdown document under `docs/` is an **unreviewed draft**.
Treat every number, quote and source claim in them as a hypothesis to verify, never as evidence.
The register, the review checklist and the exact rule for clearing a document live in `docs/REVIEW-STATUS.md`.
Do not cite an unreviewed document in a report, do not copy its numbers into a new document, and do not treat its conclusions as settled.

The company ecosystem the lab will eventually plug into is recorded in `docs/context/appota-ai-ecosystem.md` (AgentLize control plane, Thổ Thần AI execution plane, Kdata infrastructure, business data owners).
It is context for where the work lands, not a decision on stack or architecture, and it is itself an unreviewed draft until Kevin confirms it.

Stack, architecture and MVP scope are not decided. They must land in an ADR before any code is written.

Artifacts are named by their place in the framework: `buoc-0-` is the step before 01 Explore, and later steps carry their own number and name.
Step 0 holds the problem, the system model and the requirements, and does not replace any of the seven steps.
Handover copies of rendered documents go in `R&D/` under the same step-based name.

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

    bash docs/render/render.sh docs/research/08-khao-sat-nam-phuong-phap-tich-hop.md

Check every quote in the step 01 report against its source URL, 68 checks:

    bash docs/research/checks/verify-sources-08.sh

## 7. Writing conventions

- Never use an em dash. Use a plain hyphen.
- Every report carries evidence: a link, a number, or a command that can be rerun. "Currently researching" is not a result.