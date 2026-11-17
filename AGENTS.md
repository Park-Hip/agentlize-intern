# AGENTS.md

Guidance for agents working in this repository.

## 1. Context

R&D repository for **AgentLize Next Gen AI 2026** (Appota Group), an 8 week internship program starting 09/11/2026.

- Chosen track: **Track 01 - AI Platform & MCP**. The other two tracks are out of scope here.
- Central question: how can AI connect to, use and coordinate business tools and systems in a way that is safe, observable and reusable?
- Delivery vehicle: the **AI Operations Connector Lab** mini project. Two simulated systems (an employee directory and a task list), one agent that reads data, checks permission, proposes an update and only writes after confirmation, plus two integration approaches built side by side for comparison.

Authoritative sources:

- `docs/program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt`: extracted text for fast grep and citation.

Read the  TXT for the full acceptance criteria, the R&D framework and the week by week plan.

## 2. Current state

The repository holds the research documents plus the `lab/` scaffold for the POC, which currently runs three local services with health checks only.
`tools/mcp-probe` is a measurement tool, not part of the lab.

The company ecosystem the lab will eventually plug into is recorded in `docs/context/appota-ai-ecosystem.md` (AgentLize control plane, Thổ Thần AI execution plane, Kdata infrastructure, business data owners).
It is context for where the work lands, not a decision on stack or architecture, and it needs Kevin to confirm it.

Stack, architecture and MVP scope are recorded in ADR-0001 to ADR-0003 and the MVP spec.
Read them before adding business logic.

Setup, run and test commands are in section 6, together with the render and source-check commands.

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
The PDF is written to `dist/<name>.pdf` (git-ignored) unless an output path is given.

```
bash tools/render/render.sh rd/04-propose/solution-candidates.md
```

The render step drops the metadata line (date and status), so a handed-in PDF never carries it.
It then reads the PDF back with `pypdf` and fails if the line survived (`python -m pip install pypdf`, otherwise that check is skipped with a warning).

Check that every relative link in the docs resolves, no em dash slipped in, and file names follow section 8.
Run it before every commit.

```
python tools/check-docs.py
```

Re-run the source quote checks (they open the cited URLs, so they need network).

```
bash rd/00-frame/checks/prd-quotes.sh
bash rd/01-explore/checks/real-system-architectures.sh
bash rd/01-explore/checks/tho-than-platform.sh
```

### Lab POC

The lab is an npm workspace in `lab/`. It needs Node 22 or newer.
It starts three local services and has no business logic yet.

```
cd lab
npm install
npm run lint
npm test
npm start
```

`npm start` builds the workspace, generates a random service key when `LAB_SERVICE_KEY` is not set, starts the fake directory on 127.0.0.1:8791 and the fake task list on 127.0.0.1:8792, waits for both `/health` endpoints to return 200, then opens the gateway on 127.0.0.1:8790.
The key is passed to the three processes through the environment and is never printed.
Override the ports with `LAB_GATEWAY_PORT`, `LAB_DIRECTORY_PORT` and `LAB_TASKS_PORT`, and the data folder with `LAB_DATA_DIR`.
`npm test` builds, then runs every `*-test.js` file in the workspace, including a smoke test that starts the three services on temporary ports and checks `/health`.
`npm run lint` type-checks the whole workspace with `tsc --noEmit`.

### MCP probe for Thổ Thần

The probe in `tools/mcp-probe` records what Thổ Thần sends as an MCP host.
It gathers evidence for P1-P5 in `rd/appota/tho-than-mcp-probe.md`; it is not a lab component and does not decide architecture.
It uses local npm dependencies only and writes one JSON line per event to `scratch/mcp-probe/log-<timestamp>.jsonl` (git-ignored).
Requires Node 20+.

```
cd tools/mcp-probe
npm install
npm run build
node dist/index.js --stdio                     # stdio transport, the host spawns this
node dist/index.js --http --port 8787          # Streamable HTTP at http://localhost:8787/mcp
node dist/index.js --http --port 8787 --bearer <token>
npm run selftest                               # build, run both transports, assert the log lines
npm run summarize -- <log-file-or-directory>   # print the facts needed for the P1-P5 tables
```

The self-test must print a `SELFTEST PASSED: <n> checks` line.
Build, run and troubleshooting details are in `tools/mcp-probe/README.md`.

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
  Prefer the Vietnamese wording after that. Keep shared terms in `rd/00-frame/glossary.md` and reuse them across reports.
- **Codes always carry a name.** Write "SR6 (không ghi trùng)", never a bare "SR6". Do not use a code before the section that defines it.
- **One sentence, one idea.** Aim for at most about 25 words. Name who does what ("agent gửi lệnh", "người duyệt bấm duyệt"), and avoid abstract nouns as the subject.
- **No talking about the document itself.** Cut sentences such as "phần này không trả lời...", "đọc như giả thuyết", "sai phạm trù". Say the point directly.
- **Hedge once, not everywhere.** Inside the body, use "có thể" or "tùy" only when the condition is named.
- **One metadata line under the title.** Every report carries exactly one line, `Ngày: YYYY-MM-DD. Trạng thái: <một câu ngắn>.`, placed under the title and before the first section.
  `Ngày` is the day the content was last revised, not the day the file was touched.
  Do not add an owner, mentor, revision or version line: the intern owns every artifact, and git holds the history.
  `python tools/check-docs.py` rejects those lines, and the render step drops the metadata line so a PDF handed in never carries it.
- **Every section ends with "so what".** A conclusion, a decision, or a concrete next check. A section that only lists considerations is not finished.
- **One set of criteria across documents.** All comparisons and proposals judge against the same requirements (currently SR1-SR8 in `rd/00-frame/prd-ai-platform.md`). Do not invent a parallel list. If the set changes, update it at the source.
- **Readability check before submitting.** A non-technical reader should be able to read "Đọc nhanh" in 2 minutes and answer the three questions above. An engineer should be able to trace every claim to a source, a number or a test.

## 8. Repository layout and naming

```
README.md        map of the repo
AGENTS.md        this file
docs/
  program/       the official program document, read only
  context/       company context (ecosystem, track comparison)
  adr/           one file per decision: adr-0001-<slug>.md
rd/              the R&D work, one folder per step of section 3
  00-frame/      problem, users, requirements (PRD)
  01-explore/    surveys of existing solutions and real systems
  02-compare/    trade-off tables and selection criteria
  03-question/   open questions and testable hypotheses
  04-propose/    candidate solutions, the chosen approach
  05-build/ 06-evaluate/ 07-package/   created when the step starts
  <step>/checks/ scripts that re-verify claims made in that step
lab/             POC code, created after the first ADR
submitted/       PDFs handed in to the program, never edited afterwards
  weekly-report/ weekly reports sent to Lark: Markdown source and its PDF
tools/           render and doc-check scripts
dist/            generated PDFs (git-ignored)
scratch/         agent working files and raw captures (git-ignored)
```

Rules:

- Put a document in the folder of the step it belongs to. The step folder carries the order, so file names carry no number.
- File names are lowercase ASCII kebab-case with a short English slug, for example `option-comparison.md`. Content stays Vietnamese.
- Two exceptions allow a number or date: `adr-0001-<slug>.md` (never renumbered) and `YYYY-MM-DD-<slug>.pdf` in `submitted/` (the submission date).
  A weekly report keeps its Markdown source next to its PDF, both named `YYYY-MM-DD-week-<n>` after the Monday it is sent.
- No version or draft markers in file names (`v2`, `final`, `old`). Version history is git. A document that is replaced is deleted, not kept beside the new one.
- A summary page for a document sits next to it with the same slug (`appota-cases.md` and `appota-cases.html`).
- Every claim that rests on an external quote has a script in `<step>/checks/` that can re-verify it.
- Generated files are not committed, except a PDF that was handed in: copy it to `submitted/` at that moment.
