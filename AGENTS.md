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

The research phase is done and summarized in `rd/findings.md`: the five integration models, real systems and the 2026 market were surveyed, and no product covers the Lab's problem end to end.
The `lab/` prototype runs a gateway, two fake systems and an operator console; `lab/README.md` lists what each one already does.
`tools/mcp-probe` recorded how Thổ Thần behaves as an MCP host; its results are in `rd/appota/tho-than-mcp-probe.md`.
The current goal is a first prototype that plugs into Thổ Thần AI as an MCP server: the intern has a Thổ Thần account, and both the web and desktop apps connect to MCP servers.
Host facts that constrain the design are summarized in `rd/findings.md` section 4: chat can call tools over stdio or over Streamable HTTP when the server has a public HTTPS address, chat calls in both web and desktop go through the Thổ Thần server, the host attaches identity headers but the Bearer key is set by whoever adds the skill, there is no approval step, and calls are cut at 60 seconds.

The company ecosystem the lab plugs into is recorded in `docs/context/appota-ai-ecosystem.md` (AgentLize control plane, Thổ Thần AI execution plane, Kdata infrastructure, business data owners).
It is context for where the work lands, not a decision on stack or architecture, and it needs Kevin to confirm it.

Stack, architecture and prototype scope are recorded in ADR-0001 to ADR-0008 and the prototype spec.
ADR-0007 (system adapters, rules as data, multi-item proposals, write outbox) and ADR-0008 (page password, approval inbox) replace the task-only write path before milestone 3.
Read them before adding business logic.

Setup, run and test commands are in section 6.

## 3. Way of working

The program's R&D framework (explore, compare, question, propose, build, evaluate, package) is no longer the folder layout or a fixed gate order.
Explore, compare, question and propose are done; their results live in `rd/findings.md`.

What still applies:

- **Prototype first, in the real host.** Build the smallest thing that runs inside Thổ Thần, then measure it.
- **Evidence before claims.** A baseline and a test suite exist before any claim of success.
- **Research on demand.** Read an outside system only to answer a question the prototype raises, with a time box, and record what was learned in `rd/findings.md` or the document it changes.
- **Package at the end.** Docs, test suite, demo, follow up backlog.

## 4. Definition of done for Track 01

- A comparison of at least three architectural models exists before the approach is chosen.
- Permission checks, write operations, failures and reruns are tested, and a second agent is shown reusing the same tools.
- Latency, stability and cost (where measurable) are reported, together with a conclusion on when MCP is the wrong choice.

Three kinds of value must survive: Research Finding, Experimental Evidence, Reusable Asset.

Every artifact needs an owner, a definition of done and verifiable evidence.

## 5. Data boundary

- Use simulated data, public data, or sources that are explicitly permitted.
- Never put sensitive internal information, real credentials or customer data into the POC, logs, test fixtures or commits.
- Never mention a colleague's R&D (their prototypes, documents or results) in docs, ADRs, issues, PRs or commits.
  Every design choice stands on the Lab's own evidence: the program document, public sources, the Lab's probes and tests, or the mentor's review.

## 6. Commands

Render a Markdown document to A4 PDF. Requires Node/npx, Python 3, and Chrome or Edge.
The PDF is written to `dist/<name>.pdf` (git-ignored) unless an output path is given.

```
bash tools/render/render.sh rd/findings.md
```

The render step drops the metadata line (date and status), so a handed-in PDF never carries it.
It then reads the PDF back with `pypdf` and fails if the line survived (`python -m pip install pypdf`, otherwise that check is skipped with a warning).

Check that every relative link in the docs resolves, no em dash slipped in, and file names follow section 8.
Run it before every commit.

```
python tools/check-docs.py
```

Check that the branch still merges into `main`, and list the open pull requests that edit the same files.
Run it before opening a PR and after every rebase.
It exits 1 on a conflict with `main`, and prints a conflict with another open PR as a warning, because that one blocks whichever PR merges second.

```
python tools/check-merge.py
```

Re-run the source quote checks (they open the cited URLs, so they need network).

```
bash rd/checks/prd-ai-platform.sh
bash rd/checks/real-system-architectures.sh
bash rd/checks/tho-than-platform.sh
bash rd/checks/market-landscape.sh
bash rd/checks/mausbot.sh
bash rd/checks/eve.sh
```

### Lab POC

The lab is an npm workspace in `lab/` and needs Node 22 or newer.
`lab/README.md` covers running the lab, the commands and the environment variables; each package's own README (`lab/gateway/README.md`, `lab/console/README.md`, `lab/fake-directory/README.md`, `lab/fake-tasks/README.md`, `lab/measure/README.md`) covers how that service or command behaves.
Read them before changing the lab.

```
cd lab
npm install
npm run lint
npm test
npm run sr
npm start
```

`npm run lint` type-checks the workspace; `npm test` builds, then runs every `*-test.js` file, including a smoke test of the four services.
`npm run sr` builds, runs the same tests once and prints one row per requirement SR1-SR8 with its test, pass and fail counts, using `lab/scripts/sr-map.json`; it exits 1 when a requirement has no test or a failing test.
`npm start` opens the gateway on 127.0.0.1:8790, the fake directory on 8791, the fake task list on 8792 and the console on 8793.
Run one package's tests with `npm test -w <folder>` (for example `npm test -w console`), or a subset with `npm test -w gateway -- --test-name-pattern policy`.
Runtime data lives in `lab/.data` (git-ignored); the gateway reads its live rules from `rules.json` there, so `lab/gateway/policy/rules.json` is only the base copy.

```
npm run seed-keys [-- --rotate]
npm run keys -- issue --employee NV-07 --caller tho-than-desktop [--scope read_only]
npm run keys -- page-password --employee NV-07
npm run keys -- list
npm run trace -- --task T-12
```

`seed-keys` prints one tool key `lab_` and one page password `trang_` per persona; `--rotate` replaces both.
The page password opens the gateway pages only, never a tool, and `page-password` replaces the previous one of that person.

Measure one scenario against a private stack on free ports and a temporary data folder, or against a write target chosen with `--target` (default `gateway`).
Only a scenario that declares the shared stack builds it.
The command writes a small summary and a gzipped sample file with the environment and the safety counters; `--runs` defaults to 100 and `--out` defaults to `rd/evaluation/results/`.
Scenarios are files in `lab/measure/src/scenarios/`; adding one does not edit a registry.
`lab/measure/README.md` covers the result format, the five safety counters and how to add a scenario.

```
npm run measure -- m1-gateway --runs 100
npm run measure -- q1-outbox --target gateway --runs 2
```

### Assistant cho Q2

`npm run assistant -- --door <mcp|function> --job <việc> --runs N` chạy một việc của Q2 qua một cửa nối và ghi kết quả vào `rd/evaluation/results/`.
`--door` chọn `mcp` (#108) hoặc `function` (#109); phần dùng chung nằm ở `lab/assistants/src/shared/`.
`--job` chọn một trong bốn việc, `--runs` mặc định 1, `--max-steps` mặc định 8.
Lệnh đọc số dư USD của DeepSeek trước khi chạy và sau mỗi 10 lượt; dừng khi dưới 0,20 USD.
Trong giờ cao điểm 08:00-11:00 và 13:00-17:00 giờ Việt Nam, thứ Hai tới thứ Sáu, lệnh từ chối chạy nếu thiếu `--allow-peak`.
Kết quả ghi số dư trước và sau, giờ cao điểm, và lý do dừng sớm nếu có.
Khoá mô hình chỉ đọc từ `LAB_MODEL_API_KEY`, không in ra log; `npm test` dùng mô hình giả nên không cần khoá và không gọi mạng.
`lab/assistants/README.md` mô tả biến môi trường, bốn việc, định dạng kết quả và cách thêm một việc.

```
npm run assistant -- --door mcp --job lookup-minh-phone --runs 1
```

### Tunnel for one acceptance session

`npm run tunnel` (in `lab/`) exposes only the gateway's `/mcp` through a Cloudflare quick tunnel for at most 45 minutes.
The step by step acceptance script is `rd/evaluation/milestone-1-tho-than.md`.

### MCP probe for Thổ Thần

`tools/mcp-probe` is a throwaway MCP server that recorded what Thổ Thần sends as an MCP host; it is not a lab component.
Its modes, options and log format are in `tools/mcp-probe/README.md`.

```
cd tools/mcp-probe
npm install
npm run selftest   # must print SELFTEST PASSED: <n> checks
```

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
  Prefer the Vietnamese wording after that. Keep shared terms in `rd/problem/glossary.md` and reuse them across reports.
- **Codes always carry a name.** Write "SR6 (không ghi trùng)", never a bare "SR6". Do not use a code before the section that defines it.
- **One sentence, one idea.** Aim for at most about 25 words. Name who does what ("agent gửi lệnh", "người duyệt bấm duyệt"), and avoid abstract nouns as the subject.
- **No talking about the document itself.** Cut sentences such as "phần này không trả lời...", "đọc như giả thuyết", "sai phạm trù". Say the point directly.
- **Hedge once, not everywhere.** Inside the body, use "có thể" or "tùy" only when the condition is named.
- **One metadata line under the title.** Every report carries exactly one line, `Ngày: YYYY-MM-DD. Trạng thái: <một câu ngắn>.`, placed under the title and before the first section.
  `Ngày` is the day the content was last revised, not the day the file was touched.
  Do not add an owner, mentor, revision or version line: the intern owns every artifact, and git holds the history.
  `python tools/check-docs.py` rejects those lines, and the render step drops the metadata line so a PDF handed in never carries it.
- **Every section ends with "so what".** A conclusion, a decision, or a concrete next check. A section that only lists considerations is not finished.
- **One set of criteria across documents.** All comparisons and proposals judge against the same requirements (currently SR1-SR8 in `rd/problem/prd-ai-platform.md`). Do not invent a parallel list. If the set changes, update it at the source.
- **Readability check before submitting.** A non-technical reader should be able to read "Đọc nhanh" in 2 minutes and answer the three questions above. An engineer should be able to trace every claim to a source, a number or a test.

## 8. Repository layout and naming

```
.github/         issue forms and the pull request template, see section 9
README.md        map of the repo
AGENTS.md        this file
docs/
  program/       the official program document, read only
  context/       company context (ecosystem, track comparison)
  adr/           one file per decision: adr-0001-<slug>.md
rd/              the R&D work, grouped by topic
  findings.md    what the research found and what we do next; start here
  problem/       problem, users, requirements SR1-SR8 (PRD), glossary
  research/      outside solutions: MCP, five integration models, real systems, market, comparison
  appota/        Appota's own systems: member company cases, AppotaPay skills, Thổ Thần
  design/        solution candidates, open questions and how to test them
  checks/        scripts that re-verify quoted claims, one per document: <doc-slug>.sh
lab/             prototype code, created after the first ADR
submitted/       PDFs handed in to the program, never edited afterwards
  weekly-report/ weekly reports sent to Lark: Markdown source and its PDF
  weekly-plan/   weekly plans sent to the mentor, named like weekly reports
tools/           render, doc-check and merge-check scripts
dist/            generated PDFs (git-ignored)
scratch/         agent working files and raw captures (git-ignored)
```

Rules:

- Put a document in the folder of its topic. File names carry no number or step.
  Add a new topic folder only when it will hold at least two documents; evaluation reports go in `rd/evaluation/` and measurement results in `rd/evaluation/results/`.
- New findings that change the direction go into `rd/findings.md`, and the detailed document links back to it.
- File names are lowercase ASCII kebab-case with a short English slug, for example `option-comparison.md`. Content stays Vietnamese.
- Files whose name GitHub fixes (`.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/`) keep that name.
- Three exceptions allow a number or date: `adr-0001-<slug>.md` (never renumbered), `YYYY-MM-DD-<slug>.pdf` in `submitted/` (the submission date), and `rd/evaluation/results/<YYYY-MM-DD>-<scenario>-<target>-<commit 7>.json` with its matching `<YYYY-MM-DD>-<scenario>-<target>-<commit 7>.samples.ndjson.gz`, where a measurement without a target drops the `<target>` segment and an optional `--variant` name sits just before the commit (the measurement date and the commit measured, written by `npm run measure`).
  A weekly report or weekly plan keeps its Markdown source next to its PDF, both named `YYYY-MM-DD-week-<n>` after the Monday of its week.
- No version or draft markers in file names (`v2`, `final`, `old`). Version history is git. A document that is replaced is deleted, not kept beside the new one.
- A summary page for a document sits next to it with the same slug (`appota-cases.md` and `appota-cases.html`).
- Every claim that rests on an external quote has a script in `rd/checks/`, named after its document, that can re-verify it.
- Generated files are not committed, except a PDF that was handed in (copy it to `submitted/` at that moment) and a measurement result in `rd/evaluation/results/` (commit it with the change it measures).

## 9. Issues and pull requests

The remote is `Park-Hip/agentlize-intern` on GitHub.
Plans and decisions live in the repo (ADR, spec, `rd/findings.md`); issues track the work and link to them.

Issues:

- One issue per outcome, with a definition of done and a way to verify it. Use the forms in `.github/ISSUE_TEMPLATE/`: `feature`, `bug`, `research`, `task`.
- Break a large outcome into a checklist inside the issue, or into sub-issues when a step needs its own discussion or PR.
- Skip the issue for a change that fits in one small PR and about an hour of work. The PR description is then the record.
- A `research` issue names the question, the time box and the document the answer goes into (section 3).
- Each issue has one assignee and belongs to the milestone of its week (`Tuần 3`), so the weekly report can list closed issues and merged PRs as evidence.
- An issue is also a prompt for a coding agent. Write it so a person or an agent can act on it without asking, and keep section 5 data out of it.

Parallel work:

- Two issues run at the same time only when their write scopes do not overlap: the files each one creates or edits, listed in the issue form.
  When they overlap, run them one after the other, or stack the second branch on the first.
- A shared piece that several issues need (the CSRF check of a form, an export of `@lab/gateway`, a page header) is its own issue and merges first.
  A rule written under "Quy ước chung" does not deliver the code: when the code does not exist yet, the issues that need it depend on the issue that builds it.
- Hot files are the files every feature of an area has to edit: a router, the navigation, a shared test file, an export list such as `lab/gateway/src/lib.ts`, and the status lines of `AGENTS.md` and `lab/README.md`.
  At most one open PR edits a hot file at a time.
  When every new feature must edit the same hot file, give the area an extension point in its own PR, so a feature arrives as new files.
- Docs that describe the current state point to where features live instead of listing each feature, so two features never edit the same sentence.

Branches and pull requests:

- Do not push to `main`. Branch from it as `<issue>-<slug>` (for example `12-employee-lookup`, the name GitHub's "Create a branch" gives) and keep the branch short-lived.
- One purpose per PR, small enough to review in one sitting. Use `.github/pull_request_template.md`.
- PR titles follow the commit style: a short imperative English sentence.
- The last PR of an issue says `Closes #<n>`; earlier ones say `Refs #<n>`. A dependent chain of PRs can use GitHub stacked PRs (`gh stack`).
- After any PR merges, rebase every open branch on the new `main` and run `python tools/check-merge.py`.
  Resolve a conflict in favour of what already merged, and never keep two implementations of the same thing.
- Squash merge, after `python tools/check-docs.py`, `python tools/check-merge.py` and the relevant tests pass.
- An agent working an issue opens the PR and keeps its description current. It never merges its own PR; the intern reviews and merges.

One-time setup of the labels the forms use:

```
gh label create feature --color a2eeef --description "Kết quả kiểm chứng được"
gh label create task --color c5def5 --description "Việc nhỏ, thường là việc con"
gh label create research --color d876e3 --description "Câu hỏi có giới hạn thời gian"
```
