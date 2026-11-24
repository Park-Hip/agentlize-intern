# AGENTS.md

Guidance for agents working in this repository.

## 1. Context

R&D repository for **AgentLize Next Gen AI 2026** (Appota Group), an 8 week internship program starting 09/11/2026.

- Chosen track: **Track 01 - AI Platform & MCP**. The other two tracks are out of scope here.
- Central question: how can AI connect to, use and coordinate business tools and systems in a way that is safe, observable and reusable?
- Delivery vehicle: the **AI Operations Connector Lab** mini project. Two simulated systems (an employee directory and a task list), one agent that reads data, checks permission, proposes an update and only writes after confirmation, plus two integration approaches built side by side for comparison.

The authoritative source is `docs/program/Appota_AgentLize_Next_Gen_AI_RnD_8_Tuan_2026_Cap_Nhat.txt`, the program document as plain text.
Read it for the full acceptance criteria, the R&D framework and the week by week plan.

## 2. Current state

The research is done and summarized in `rd/findings.md`, which also records the Thổ Thần host facts (section 4) and the next steps (section 8).
The `lab/` prototype passed milestones 1-3 in Thổ Thần desktop; `lab/README.md` lists its packages and what each one does.
Thổ Thần web cannot enable a custom skill yet (#65), so acceptance runs in the desktop app only.
The two research questions of the prototype spec `rd/design/mvp-spec.md` are answered, with evidence in `rd/evaluation/`.
The next direction is the write-safety spec `rd/design/write-safety-spec.md`: writing safely into target systems less reliable than the fake ones, pending ADR-0009.
The plan for the current week is the last section of the latest file in `submitted/weekly-report/`.

Stack and architecture are recorded in ADR-0001 to ADR-0008 in `docs/adr/`, and the lab implements all of them.
Read the ADRs that touch an area before changing its business logic.

The company ecosystem the lab plugs into is recorded in `docs/context/appota-ai-ecosystem.md` (AgentLize control plane, Thổ Thần AI execution plane, Kdata infrastructure, business data owners).
It is context for where the work lands, not a decision on stack or architecture, and it needs Kevin to confirm it.

## 3. Way of working

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

Re-run the source quote checks, one script per document (they open the cited URLs, so they need network).

```
for f in rd/checks/*.sh; do bash "$f"; done
```

### Lab POC

The lab is an npm workspace in `lab/` and needs Node 22 or newer.

```
cd lab
npm install
npm run lint
npm test
npm run sr
npm start
```

`npm run lint` type-checks the workspace; `npm test` builds, then runs every `*-test.js` file, including a smoke test of the four services.
`npm run sr` runs the same tests once and prints one row per requirement SR1-SR8 from `lab/scripts/sr-map.json`; it exits 1 when a requirement has no test or a failing test.
`npm start` opens the gateway on 127.0.0.1:8790, the fake directory on 8791, the fake task list on 8792 and the console on 8793.
Run one package's tests with `npm test -w <folder>` (for example `npm test -w console`), or a subset with `npm test -w gateway -- --test-name-pattern policy`.
Runtime data lives in `lab/.data` (git-ignored); the gateway reads its live rules from `rules.json` there, so `lab/gateway/policy/rules.json` is only the base copy.

The other commands (keys and page passwords, trace, measure, assistant, tunnel) are listed in `lab/README.md`, and each package's own README explains its command.
Read them before changing the lab.
`npm run assistant` spends real model credit: it needs `LAB_MODEL_API_KEY`, refuses to run in Vietnamese peak hours without `--allow-peak`, and stops when the balance falls under 0.20 USD.
`npm run tunnel` exposes the gateway's `/mcp` for at most 45 minutes; the latest acceptance script that uses it is `rd/evaluation/milestone-3-tho-than.md`.

`tools/mcp-probe` is a throwaway MCP server that recorded how Thổ Thần behaves as an MCP host, not a lab component; see `tools/mcp-probe/README.md`.

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
  context/       company context and read-only copies of mentor documents
  adr/           one file per decision: adr-0001-<slug>.md
rd/              the R&D work, grouped by topic
  findings.md    what the research found and what we do next; start here
  problem/       problem, users, requirements SR1-SR8 (PRD), glossary, open problems
  research/      outside solutions: MCP, five integration models, real systems, market, comparison
  appota/        Appota's own systems: member company cases, AppotaPay skills, Thổ Thần
  design/        specs, system map and plans for the next build
  evaluation/    acceptance scripts and evaluation reports; measurement results in results/
  checks/        scripts that re-verify quoted claims, one per document: <doc-slug>.sh
lab/             prototype code
submitted/       PDFs handed in to the program, never edited afterwards
  weekly-report/ weekly reports sent to Lark: Markdown source and its PDF
  weekly-plan/   weekly plans sent to the mentor, named like weekly reports
tools/           render, doc-check and merge-check scripts, and the Thổ Thần MCP probe
dist/            generated PDFs (git-ignored)
scratch/         agent working files and raw captures (git-ignored)
```

Rules:

- Put a document in the folder of its topic. File names carry no number or step.
  Add a new topic folder only when it will hold at least two documents.
- New findings that change the direction go into `rd/findings.md`, and the detailed document links back to it.
- File names are lowercase ASCII kebab-case with a short English slug, for example `option-comparison.md`. Content stays Vietnamese.
- Files whose name GitHub fixes (`.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/`) keep that name.
- Three exceptions allow a number or date:
  - `adr-0001-<slug>.md`, never renumbered.
  - `YYYY-MM-DD-<slug>.pdf` in `submitted/`, the submission date.
    A weekly report or weekly plan keeps its Markdown source next to its PDF, both named `YYYY-MM-DD-week-<n>` after the Monday of its week.
  - A measurement result in `rd/evaluation/results/`: a `.json` summary and a matching `.samples.ndjson.gz`, both named with the measurement date first and the 7 character commit measured last, and written by the command itself.
    `npm run measure` writes `<YYYY-MM-DD>-<scenario>-<target>-<variant>-<commit>`, and `npm run assistant` writes `<YYYY-MM-DD>-assistant-<door>-<job>-<plan>-<commit>`; the target, variant and plan segments are dropped when absent.
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
- The last PR of an issue says `Closes #<n>`; earlier ones say `Refs #<n>`. A dependent chain of PRs can use GitHub stacked PRs (`gh stack`, installed with `gh extension install github/gh-stack`).
- After any PR merges, rebase every open branch on the new `main` and run `python tools/check-merge.py`.
  Resolve a conflict in favour of what already merged, and never keep two implementations of the same thing.
- Squash merge, after `python tools/check-docs.py`, `python tools/check-merge.py` and the relevant tests pass.
- An agent working an issue opens the PR and keeps its description current. It never merges its own PR; the intern reviews and merges.
