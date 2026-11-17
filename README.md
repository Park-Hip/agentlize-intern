# AgentLize Next Gen AI 2026 - Track 01 (AI Platform & MCP)

R&D repository of the AI Operations Connector Lab: how an AI agent connects to, uses and coordinates business tools in a way that is safe, observable and reusable.
Program rules and how to work in this repo are in [AGENTS.md](AGENTS.md).

Owner of every artifact in this repo: Phạm Bách Hiệp. Mentor: Kevin.

## Where things are

| Topic | Folder | Contents |
| --- | --- | --- |
| Problem | [rd/problem](rd/problem) | [PRD - AI Platform](rd/problem/prd-ai-platform.md): problem, users, requirements SR1-SR8; [bảng thuật ngữ](rd/problem/glossary.md); [mental model](rd/problem/track01-mental-model.html) |
| Outside research | [rd/research](rd/research) | [option comparison](rd/research/option-comparison.md), [comparison framework](rd/research/comparison-framework.md), [five methods](rd/research/five-methods), [real systems](rd/research/real-system-architectures.md), [MCP overview](rd/research/mcp-overview.md) |
| Appota systems | [rd/appota](rd/appota) | [Thổ Thần platform](rd/appota/tho-than-platform.md), [MCP probe results in Thổ Thần](rd/appota/tho-than-mcp-probe.md), [Appota cases](rd/appota/appota-cases.md), [AppotaPay skills](rd/appota/appotapay-skills.md) |
| Design | [rd/design](rd/design) | [Solution candidates](rd/design/solution-candidates.md), [research questions and validation plan](rd/design/research-questions-and-validation-plan.md) |
| Source checks | [rd/checks](rd/checks) | One script per document that re-opens the cited URLs |
| Host probe | [tools/mcp-probe](tools/mcp-probe) | Throwaway MCP server that recorded how Thổ Thần behaves as an MCP host ([README](tools/mcp-probe/README.md)) |
| Prototype | not started | `lab/`, after ADR-0001 |

Other places:

- [docs/program](docs/program): the official 8 week program text.
- [docs/context](docs/context): Appota AI ecosystem and track comparison.
- [submitted](submitted): PDFs already handed in, and [weekly reports](submitted/weekly-report) sent to Lark.

## Commands

```
bash tools/render/render.sh rd/design/solution-candidates.md   # PDF to dist/
python tools/check-docs.py                                     # links, em dash, file names
```
