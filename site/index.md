---
content-type: reference-data
version: 0.8.2
snapshot: 2026-11-21
---

# dislop — Cutting AI slop is real productivity.

A dedicated linter for AI slop. It brings together vetted community rules, corpus findings, and 90 curated tools to help you (and your agent) catch and fix AI-sounding text and template layouts in docs, web UI, and slides. Connects in one command to coding agents (Codex, Claude Code, Antigravity, Cursor), office agents (Claude Cowork, WorkBuddy, Qwen), and editors, and can run completely offline locally.

- Product brief (EN/ZH): https://dislop.com/methodology/product-brief.md
- Runtime dependencies: 0 (pure-Markdown Skill and local CLI run offline with zero uploads)
- Live browser workbench: https://dislop.com/#workbench (offline local checks + sign-in Cloud MCP mode, `CSP: connect-src 'self'`)
- Official Cloud MCP: https://dislop.com/mcp (0-credit `dislop_check`/`dislop_verify`/`dislop_rules` without login; sign in via https://dislop.com/#pricing for 30 free monthly credits on AI tools)
- MCP Server Card: https://dislop.com/.well-known/mcp/server-card.json
- Agent Skills Index: https://dislop.com/.well-known/agent-skills/index.json
- Agent routing index: https://dislop.com/llms.txt
- Machine-readable catalog: https://dislop.com/catalog.json
- Awesome Anti-Slop (90 curated entries): https://dislop.com/awesome/

## Coverage & Honest Boundaries

| Target | Formats / Scope | Status |
|---|---|---|
| Writing, Specs, RFCs & Copy | `.md`, `.mdx`, `.txt` (EN & ZH, 7 built-in packs, 65 patterns across 6 dimensions) | LIVE `v0.8.2` |
| Word, PowerPoint & Slides | `.docx`, `.pptx`, landscape `.pdf` (incl. layout monotony, raster decks & type scale) | LIVE `v0.8.2` |
| Web UI, SVG & Images | `.html`, `.css`, `.jsx`, `.tsx`, `.svg`, `.png`, `.jpg`, `.webp` | LIVE `v0.8.2` |
| Offline Voice & Pocket ML | `dislop voice` (`dislop.voice/1`) & 14.6 KB `--ml` stealth-vapor scorer | LIVE `v0.8.2` |
| Optional Local Small Models | `dislop model` hardware-aware advisor (`0.6B` / `1.7B` / `4B`) | LIVE `v0.8.2` |
| Git Diffs & PRs | `--changed` / `--staged` & SARIF 2.1.0 | LIVE (diff check) · Roadmap (code AST) |

## Rule Layers

1. **AI Delivery Artifacts (`packs/core`, `error`)**: stray chatbot wrappers, unfilled placeholders, raw Markdown pasted into Word/PPT/PDF, and dead `href="#"` placeholder controls.
2. **Built-in Scenario Packs (`warning` / `info`)**: `business-brief`, `engineering-spec`, `regulated-comms`, `literary-essay`, `deck-and-ui`, and `executive-deck` (53 built-in pack rules across 7 bundled packs, plus 12 extended pattern-bank probes for 65 structured patterns across 6 dimensions), each pairing a check question with `bad -> trap -> good` examples.

## Resource Pillars

- [Methodology](./methodology/index.md): Deletion Test, anti-pattern map, positive divergence, and visual design system.
- [Cases](./cases/index.md): `bad -> trap -> good` revision contrasts, repository self-dogfooding audit, and 31 non-mainstream design references.
- [Tools](./tools/index.md): Browser workbench, canonical `SKILL.md`, Claude Code Plugin (`.claude-plugin/`), CLI, MCP, Hooks, and SDK.
- [Awesome Anti-Slop](./awesome/index.md): 90 verified anti-slop tools, standards, benchmarks, and policies (`dislop.radar/2`).
