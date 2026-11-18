# AgentLize Next Gen AI 2026 - Track 01 (AI Platform & MCP)

R&D repository of the AI Operations Connector Lab: how an AI agent connects to, uses and coordinates business tools in a way that is safe, observable and reusable.
Program rules and how to work in this repo are in [AGENTS.md](AGENTS.md).

Owner of every artifact in this repo: Phạm Bách Hiệp. Mentor: Kevin.

## Where things are

Start with [findings](rd/findings.md): what the research found, the lessons, and what we build next.
Decisions are in [docs/adr](docs/adr), and the prototype scope is in the [prototype spec](rd/design/mvp-spec.md).

| Topic | Folder | Entry point |
| --- | --- | --- |
| Problem | [rd/problem](rd/problem) | [PRD - AI Platform](rd/problem/prd-ai-platform.md): problem, users, requirements SR1-SR8; [glossary](rd/problem/glossary.md) |
| Outside research | [rd/research](rd/research) | [Five integration methods](rd/research/methods/option-comparison.md), [market lessons](rd/research/market/market-lessons.md), [real systems](rd/research/real-system-architectures.md), [MCP overview](rd/research/mcp-overview.md) |
| Appota systems | [rd/appota](rd/appota) | [Thổ Thần platform](rd/appota/tho-than-platform.md) and the [MCP probe results](rd/appota/tho-than-mcp-probe.md) |
| Design | [rd/design](rd/design) | [Prototype spec](rd/design/mvp-spec.md) and [system map](rd/design/system-map.md) |
| Decisions | [docs/adr](docs/adr) | One file per decision, starting at [ADR-0001](docs/adr/adr-0001-self-built-thin-gateway.md) |
| Prototype | [lab](lab) | Gateway, fake systems, `/mcp`, operator console, tests ([README](lab/README.md)) |
| Acceptance | [rd/evaluation](rd/evaluation) | Runs in Thổ Thần, one file per milestone, and the validation plan for Q1 and Q2 |
| Source checks | [rd/checks](rd/checks) | One script per document that re-opens the cited URLs |
| Host probe | [tools/mcp-probe](tools/mcp-probe) | Throwaway MCP server that recorded how Thổ Thần behaves as an MCP host ([README](tools/mcp-probe/README.md)) |

Other places:

- [docs/program](docs/program): the official 8 week program text.
- [docs/context](docs/context): Appota AI ecosystem.
- [submitted](submitted): PDFs already handed in, [weekly reports](submitted/weekly-report) sent to Lark, and [weekly plans](submitted/weekly-plan).

## Commands

```
bash tools/render/render.sh rd/findings.md   # PDF to dist/
python tools/check-docs.py                    # links, em dash, file names
```
