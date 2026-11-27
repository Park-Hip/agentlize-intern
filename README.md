# AgentLize Next Gen AI 2026 - Track 01 (AI Platform & MCP)

R&D repository of the AI Operations Connector Lab: how an AI agent connects to, uses and coordinates business tools in a way that is safe, observable and reusable.
Program rules and how to work in this repo are in [AGENTS.md](AGENTS.md).

Owner of every artifact in this repo: Phạm Bách Hiệp. Mentor: Kevin.

## Where things are

Start with [the prototype phases](docs/milestones.md): what each phase asked, what it concluded, and what is open now.

The current phase, writing safely into target systems such as Lark:

| Topic | Folder | Contents |
| --- | --- | --- |
| Problem | [rd/problem](rd/problem) | [PRD - AI Platform](rd/problem/prd-ai-platform.md): problem, users, requirements SR1-SR8; [bảng thuật ngữ](rd/problem/glossary.md); [open problems](rd/problem/open-problems.md) |
| Design | [rd/design](rd/design) | [Write-safety spec](rd/design/write-safety-spec.md) and its [options](rd/design/write-safety-options.md), [Q3 measurement plan](rd/design/q3-measurement-plan.md), [simulation update plan](rd/design/simulation-update-plan.md), [AgentLize gateway alignment](rd/design/agentlize-gateway-alignment.md) |
| Target systems | [rd/research](rd/research) | [Thổ Thần platform](rd/research/tho-than-platform.md), [Lark Open API](rd/research/lark-open-api.md), [target system gaps](rd/research/target-system-gaps.md) |
| Evaluation | [rd/evaluation](rd/evaluation) | [How the measurements work](rd/evaluation/measurements-explained.md), and the [results](rd/evaluation/results) of every phase |
| Source checks | [rd/checks](rd/checks) | One script per document that re-opens the cited URLs |
| Prototype | [lab](lab) | AI Operations Connector Lab: gateway, fake systems, `/mcp`, tests ([README](lab/README.md)) |

Closed phases:

- [archive/research](archive/research): choosing how to connect, the option comparison, the market survey, MCP overview, and the Thổ Thần probe.
- [archive/baseline](archive/baseline): the first prototype spec, the milestone 1-3 acceptance runs in Thổ Thần, and the Q2 report.

Other places:

- [docs/adr](docs/adr): one file per architecture decision.
- [docs/program](docs/program): the official 8 week program text.
- [docs/context](docs/context): Appota AI ecosystem.

Reports handed to the program are Lark docs; the repo keeps no copy.

## Commands

```
python tools/check-docs.py    # links, em dash, file names
python tools/check-merge.py   # conflicts with main and with open PRs
```
