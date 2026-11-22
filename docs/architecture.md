# Architecture (`v0.7.1`)

[简体中文](./architecture.zh-CN.md) · [Product Brief](../PRODUCT.md)

`dislop` is a **Linter for AI Slop** built around one shared rule manifest format (`schema: "dislop.pack/2"`). It combines vetted community anti-slop rules and corpus practices to help you (and your agent) catch and fix AI delivery artifacts, prose clichés, fallback slogans, rhythm defects, and template UI or slide chrome offline. It does not perform general security scanning, WCAG accessibility auditing, or PDF preflight.

## 1. Three-Layer Product Form & Boundaries

```text
Layer 1: Open-Source Pure-Markdown Skill (`skills/dislop/SKILL.md` + `./references/*.md`, 0 scripts, 0 network)
   └── Loads genre reference cards before drafting to prevent clichés, slogans, and template chrome
   │
   ▼
Layer 2: Open-Source Local CLI & Editor Plugins (`< 250 KB` tarball, 7 packs + 14.6 KB Pocket ML bundled, 0 uploads)
   ├── `dislop check [--pack <id|auto>] [--profile] [--ml] [--patterns]` -> AI artifacts + 6 vertical packs + 11 bank probes + stealth-vapor ML
   ├── `dislop patterns`                                                 -> Multi-angle extended pattern-bank scanner across 6 dimensions
   ├── `dislop voice`                                                    -> Deterministic offline personal style profile (`dislop.voice/1`)
   └── (Existing `--mcp` and optional `dislop model` modules remain in-repo pending real-world evaluation)
   │
   ▼
Layer 3: Closed-Source Official Cloud MCP & Web Workbench (`https://dislop.com/mcp`, `/api/v1/*`)
   └── Sign-in-gated multi-model genre review returning structured diagnostics for local agents, plus layout-preserving Office cleanup
```

`check` never modifies user files. It computes length-preserving masked views (`raw`, `prose`, `ui-text`) so code blocks, inline code, URLs, HTML tags, comments, and quoted specimens do not trigger prose false positives while line and Unicode codepoint column coordinates match the source 1:1.

## 2. Shared Engine & Runtime Parity

| Component | Path | Role |
|---|---|---|
| Shared JS Core | `src/core.mjs` | Pure ES module with zero `node:*` or DOM globals (`auditText`, `auditOoxmlEntries`, `analyzeTextProfile`, `extractVoiceProfileOffline`); shared by CLI, MCP, and `site/` |
| Extended Pattern Engine | `src/pattern-engine.mjs`, `src/dislop/pattern_engine.py`, `patterns/banks/*.json` | Multi-angle scanner executing 11 extended pattern-bank probes (`dislop patterns`, `dislop check --patterns`) with 100% Node/Python parity |
| Bundled Pocket ML Suite | `models/pocket-slop-v1.json`, `src/pocket-model.mjs`, `src/dislop/pocket_model.py` | Zero-dependency de-lexicalized INT8 N-gram LM + calibrated 24-feature linear attribution + 45-tree shallow GBDT + 5-domain pack router (`14.6 KB` gzip / `49.0 KB` raw, `< 0.5 ms` offline, `100.0%` F1 / `0.0%` Clean FPR on `stealth-vapor-v1`) |
| Hardware & Optional Local Models | `models/manifest.json`, `src/local-model.mjs`, `src/dislop/local_model.py` | Inspects RAM/disk budgets, manages optional `fast` (`0.6B`) / `balanced` (`1.7B`) / `quality` (`4B`) weights (`install` / SHA-256 `import` / `remove`), and runs loopback-only `deslop --local` with an internal numeric and qualifier retention guard during automated local rewrites |
| Node Binary Reader | `src/binary-node.mjs` | Zero-dependency ZIP central-directory reader (`zlib.inflateRawSync`) for `.docx`/`.pptx` |
| Node CLI & MCP | `bin/dislop.mjs`, `bin/dislop-mcp.mjs` | Offline CLI (`check [--pack <id|auto>] [--profile] [--ml] [--patterns] [--changed [ref]] [--staged] [--format text|json|sarif|github|md]`, `patterns`, `voice`, `model`, `setup`, `deslop --local`, `explain`, `packs`, `catalog`, `resources`, `pack-test`, `init`) and 7-tool local stdio MCP (`dislop_check`, `dislop_voice_extract_offline`, `dislop_model_score`, `dislop_model_status`, `dislop_explain`, `dislop_packs`, `dislop_catalog`) |
| Python Core, CLI & MCP | `src/dislop/{engine,pattern_engine,pocket_model,local_model,cli,mcp_server}.py` | Pure Python 3.10+ stdlib implementation kept in lockstep via 26 Python `unittest` tests across 4 modules (`test_conformance`, `test_engine`, `test_pattern_library`, `test_pocket_and_local_models`) |
| Multi-Surface Manifests & Editor Bundles | `scripts/sync_manifests.mjs`, `plugin.json`, `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.agents/plugins/`, `gemini-extension.json`, `integrations/{antigravity,vscode,orca,herdr,hooks}/`, `server.json`, `action.yml`, `.pre-commit-hooks.yaml` | Shared manifest generator and validator locking npm, PyPI, Official MCP Registry (`https://dislop.com/mcp`), Agent Plugins 1.0, Claude Code, Codex, Cursor, Antigravity, VS Code / Open VSX, and GitHub Action schemas |
| Rule Manifests & Pattern Library | `packs/*/pack.json`, `patterns/dimensions/*.json` | 7 built-in `dislop.pack/2` manifests (`core`, `business-brief`, `engineering-spec`, `regulated-comms`, `literary-essay`, `deck-and-ui`, `executive-deck` — 42 active rules, 160 fixtures: 83 hit + 77 clean) backed by 53 structured patterns across 6 dimensions & 7 angles (`42` pack-mapped + `11` extended pattern-bank rules) |
| Hosted Cloud Backend & Remote MCP | Private `dislop-cloud` (`https://dislop.com/mcp`, `/api/v1/*`) | Closed-source hosted LLM service (paid-tier zero-training model routing, hashed `dslp_*` account keys, 30 free monthly credits, re-checked `dislop_deslop` with numeric and qualifier verification, `dislop_review`, and `dislop_voice_extract`) |
| Anti-Slop Benchmark (`dislop-bench v2`) | `benchmarks/`, `scripts/run_benchmark.mjs`, `scripts/pattern_lab.mjs`, `scripts/run_text_paradigm_experiments.py` | 112 core detection samples + 154 multi-angle pattern samples (`100.0%` P/R/F1, `0.0%` Clean FPR, `100.0%` Node/Python parity) + 18 end-to-end revision tasks (`D1=45 / D2=20 / D3=25 / D4=10`), `--eval`, and blind A/B sheet export |
| Static Site Compiler | `scripts/build_site.mjs` | Zero-dependency compiler turning `src/core.mjs`, `packs/`, `skills/`, `docs/brand*`, `ROADMAP*.md`, and verified research JSON into `site/` and `awesome/README*.md` |
| Research & Ecosystem Corpus | `docs/research/` | Verified 87-entry Awesome Anti-Slop dataset (`dislop.radar/2`), 31 design/academic references, text methodology, 5-round pattern experiments, Pocket ML tiering, marketplace strategy, and Open-Core moat analysis |

## 3. Coverage Honesty & Exit Codes

Uninspected inputs never masquerade as clean:

- `0` — Completed inspection with zero findings at or above `--fail-on` (default `error`).
- `1` — One or more findings met or exceeded `--fail-on` (or stale suppressions under `--report-unused`).
- `2` — Invalid CLI flags, missing target path, or an explicitly requested file that could not be inspected (e.g., corrupted OOXML archive or non-UTF-8 text).

## 4. Official Static Site (`dislop.com`)

`site/` compiles to plain static files served over HTTPS at `https://dislop.com` (`Content-Security-Policy` locking `connect-src 'self'`, zero third-party font or analytics requests). Offline deterministic checking runs 100% locally in browser memory with zero network calls; same-origin `/api/v1/*` and `/mcp` routes proxy to the hosted `dislop-cloud` service only when the user explicitly clicks an AI action or connects a Remote MCP client. Both `dislop.com` and `/awesome/` default to Simplified Chinese (`zh-CN`) with one-click switching to native English (`en`), keeping all specimens, rule examples, and 87 directory summaries strictly separated by language:

- **For humans**: One-click "Copy for Agent" hero prompt, live 3-state Hero Proof Card, 3 shareable real before/after cases (`/#cases`), zero-upload browser workbench (`/#workbench`, with instant "Paste my draft" and post-test install/GitHub guidance), clear 5-way usage guide (`/#surfaces`), offline-filterable 87-entry Awesome Anti-Slop directory (`/awesome/`), and share/GitHub strip (`/#share`).
- **For external agents**: Technical endpoints and the 42-rule table stay folded cleanly in `<details>` while remaining 100% present in static HTML and served directly at `/llms.txt`, `/catalog.json`, `/index.md`, `/roadmap.md`, `/tasks/*.md`, `/methodology/*.md`, `/cases/*.md`, `/tools/*.md`, `/packs/*.md`, `/rules/*.md`, `/awesome/index.{json,md}`, and `/llms-full.txt`. Build-time assertions enforce byte budgets (`llms.txt <= 2,600 B`), valid links, zero leaked `fixtures.hit`, and stripped HTML comments / invisible Unicode characters.
