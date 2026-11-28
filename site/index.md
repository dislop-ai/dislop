---
content-type: reference-data
version: 1.1.2
snapshot: 2026-11-26
---

# dislop — Cutting AI slop is real productivity.

A pluggable editorial and artifact linter built on a zero-dependency Node.js (`>= 20`) micro-kernel. It pairs `11` modular stage-gated Packs with Dual-Track CI enforcement (`Defect` vs. `Suggestion`), Dual Fact Gate verification (`dislop verify`), 3-Tier local-first routing (`local` / `byok` / `cloud`), and 90 curated anti-slop tools across docs, web UI, PDF, `.docx`, `.pptx`, and images.

- Product brief (EN/ZH): https://dislop.com/methodology/product-brief.md
- Runtime dependencies: 0 (pure-Markdown Skill and offline deterministic CLI run with zero uploads)
- Live browser workbench: https://dislop.com/#workbench (offline local checks + sign-in Cloud MCP mode, `CSP: connect-src 'self'`)
- Official Cloud MCP: https://dislop.com/mcp (0-credit `dislop_check`/`dislop_verify`/`dislop_rules` without login; sign in via https://dislop.com/#pricing for 30 free monthly credits)
- MCP Server Card: https://dislop.com/.well-known/mcp/server-card.json
- Agent Skills Index: https://dislop.com/.well-known/agent-skills/index.json
- Agent routing index: https://dislop.com/llms.txt
- Machine-readable catalog: https://dislop.com/catalog.json
- Awesome Anti-Slop (90 curated entries): https://dislop.com/awesome/

## Coverage & Honest Boundaries

| Target | Formats / Scope | Status |
|---|---|---|
| Writing, Specs, RFCs & Copy | `.md`, `.mdx`, `.txt` (`common/artifact-qa`, `en/prose`, `zh/prose`, custom `.dislop/rules.json`) | LIVE `v1.1.2` |
| Word, PowerPoint & Slides | `.docx`, `.pptx`, landscape `.pdf` (OOXML lossless patching, XObject PDF expansion, layout monotony & type scale) | LIVE `v1.1.2` |
| Web UI, SVG & Images | `.html`, `.css`, `.jsx`, `.tsx`, `.svg`, `.png`, `.jpg`, `.webp` (`data-dislop-ignore`, dead controls, workflow residue) | LIVE `v1.1.2` |
| Config, Overrides & Fact Gate | Walk-up `.dislop.json` `overrides`, `dislop fix`, `dislop verify`, `dislop packs lint` | LIVE `v1.1.2` |
| Local & Semantic Routing | 3-Tier `local` (Ollama `dislop model pull`), `byok`, `cloud` (`dislop login`), plus `dislop voice` | LIVE `v1.1.2` |
| Git Diffs & PRs | `--changed`, `--since <ref>`, `action.yml`, & SARIF 2.1.0 | LIVE (diff check) · Roadmap (code AST) |

## Rule Layers

1. **`Defect` (`error` / `warning`, `Exit Code 1`)**: Deterministic checks in `scripts/*.mjs` flagging leftover chatbot wrappers, unfilled placeholders, local user paths, raw Markdown pasted into `.docx`/`.pptx`, dead `href="#"` controls, and shrunk OOXML autofit text.
2. **`Suggestion` (`strong` / `moderate` / `hint`, `Exit Code 0`)**: High-restraint editorial probes and lazy-loaded prompts (`en/prose`, `zh/prose`, `en/slide-deck`, `zh/slide-deck`, `common/web-ui`) that never break CI builds while surfacing hollow framing and template chrome.

## Resource Pillars

- [Methodology](./methodology/index.md): Deletion Test, anti-pattern map, positive divergence, and visual design system.
- [Cases](./cases/index.md): `bad -> trap -> good` revision contrasts, repository self-dogfooding audit, and 31 non-mainstream design references.
- [Tools](./tools/index.md): Browser workbench, canonical `SKILL.md`, Plugin manifests, CLI, `dislop/sdk`, local stdio MCP, Hooks, and Cloud MCP.
- [Awesome Anti-Slop](./awesome/index.md): 90 verified anti-slop tools, standards, benchmarks, and policies (`dislop.radar/2`).
