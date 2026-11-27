# AgentLize Next Gen AI 2026 - Track 01 (AI Platform & MCP)

R&D repository of the AI Operations Connector Lab: how an AI agent connects to, uses and coordinates business tools in a way that is safe, observable and reusable.
Program rules and how to work in this repo are in [AGENTS.md](AGENTS.md).

Owner of every artifact in this repo: Phạm Bách Hiệp. Mentor: Kevin.

## Where things are

Start with [the prototype phases](docs/milestones.md): what each phase asked, what it concluded, and what is open now.

| Topic | Folder | Contents |
| --- | --- | --- |
| Problem | [rd/problem](rd/problem) | [PRD - AI Platform](rd/problem/prd-ai-platform.md): problem, users, requirements SR1-SR8; [bảng thuật ngữ](rd/problem/glossary.md); [mental model](rd/problem/track01-mental-model.html) |
| Outside research | [rd/research](rd/research) | [Market lessons](rd/research/market-lessons.md), [market landscape](rd/research/market-landscape.md), [option comparison](rd/research/option-comparison.md), [comparison framework](rd/research/comparison-framework.md), [five methods](rd/research/five-methods), [real systems](rd/research/real-system-architectures.md), [MCP overview](rd/research/mcp-overview.md) |
| Appota systems | [rd/appota](rd/appota) | [Thổ Thần platform](rd/appota/tho-than-platform.md), [MCP probe results in Thổ Thần](rd/appota/tho-than-mcp-probe.md), [Appota cases](rd/appota/appota-cases.md), [AppotaPay skills](rd/appota/appotapay-skills.md) |
| Design | [rd/design](rd/design) | [Prototype spec](rd/design/mvp-spec.md), [system map](rd/design/system-map.md) |
| Source checks | [rd/checks](rd/checks) | One script per document that re-opens the cited URLs |
| Host probe | [tools/mcp-probe](tools/mcp-probe) | Throwaway MCP server that recorded how Thổ Thần behaves as an MCP host ([README](tools/mcp-probe/README.md)) |
| Prototype | [lab](lab) | AI Operations Connector Lab: gateway, fake systems, `/mcp`, tests ([README](lab/README.md)) |
| Acceptance | [rd/evaluation](rd/evaluation) | [Milestone 1 runbook](rd/evaluation/milestone-1-tho-than.md) for the manual run in Thổ Thần |

Other places:

- [docs/program](docs/program): the official 8 week program text.
- [docs/context](docs/context): Appota AI ecosystem.
- [submitted](submitted): PDFs already handed in, [weekly reports](submitted/weekly-report) sent to Lark, and [weekly plans](submitted/weekly-plan).

## Commands

```
bash tools/render/render.sh docs/milestones.md   # PDF to dist/
python tools/check-docs.py                    # links, em dash, file names
```
