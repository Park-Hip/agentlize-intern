# AgentLize Next Gen AI 2026 - Track 01 (AI Platform & MCP)

R&D repository of the AI Operations Connector Lab: how an AI agent connects to, uses and coordinates business tools in a way that is safe, observable and reusable.
Program rules and how to work in this repo are in [AGENTS.md](AGENTS.md).

Owner of every artifact in this repo: Phạm Bách Hiệp. Mentor: Kevin.

## Where things are

| Step | Folder | Contents |
| --- | --- | --- |
| 00 Frame | [rd/00-frame](rd/00-frame) | [PRD - AI Platform](rd/00-frame/prd-ai-platform.md): problem, users, requirements SR1-SR8, [bảng thuật ngữ](rd/00-frame/glossary.md) |
| 01 Explore | [rd/01-explore](rd/01-explore) | [MCP overview](rd/01-explore/mcp-overview.md), [Appota cases](rd/01-explore/appota-cases.md), [AppotaPay skills](rd/01-explore/appotapay-skills.md), [real systems](rd/01-explore/real-system-architectures.md), [Tho Than platform](rd/01-explore/tho-than-platform.md), [five methods](rd/01-explore/five-methods) |
| 02 Compare | [rd/02-compare](rd/02-compare) | [Option comparison](rd/02-compare/option-comparison.md), [comparison framework](rd/02-compare/comparison-framework.md) |
| 03 Question | [rd/03-question](rd/03-question) | [Research questions and validation plan](rd/03-question/research-questions-and-validation-plan.md) |
| 04 Propose | [rd/04-propose](rd/04-propose) | [Solution candidates](rd/04-propose/solution-candidates.md) |
| 05-07 | not started | Build, Evaluate, Package |

Other places:

- [docs/program](docs/program): the official 8 week program text.
- [docs/context](docs/context): Appota AI ecosystem and track comparison.
- [submitted](submitted): PDFs already handed in.

## Commands

```
bash tools/render/render.sh rd/04-propose/solution-candidates.md   # PDF to dist/
python tools/check-docs.py                                          # links, em dash, file names
```
