# Architecture (`v0.8.1`)

[简体中文](./architecture.zh-CN.md) · [Product Brief](../PRODUCT.md)

`dislop` is a **Linter for AI Slop** built around one shared rule manifest format (`schema: "dislop.pack/2"`). It combines vetted community anti-slop rules and corpus practices to help you (and your agent) catch and fix AI delivery artifacts, prose clichés, fallback slogans, rhythm defects, and template UI, SVG, image, or slide/PDF chrome offline. It does not perform general security scanning, WCAG accessibility auditing, or generic PDF/X print preflight.

## 1. Three-Layer Product Form & Boundaries

```text
Layer 1: Open-Source Pure-Markdown Skill (`skills/dislop/SKILL.md` + `./references/*.md`, 0 scripts, 0 network)
   └── Loads genre reference cards + scenario strategy table before drafting to prevent clichés, slogans, and register drift
   │
   ▼
Layer 2: Open-Source Local CLI & Editor Plugins (`< 380 KB` tarball, 7 packs + 14.6 KB Pocket ML bundled, 0 uploads)
   ├── `dislop check [--pack <id|auto>] [--register <name>] [--deep] [--format text|json|agent|sarif|github|md]` -> Scenario-calibrated findings + structured revision advice + 5-axis telemetry
   ├── `dislop review`                                                   -> Opt-in BYOK or offline rubric review with quote grounding & injected scenario strategy
   ├── `dislop verify`                                                   -> Protected fact ledger, keep terms, cadence guard, and spoken/formal register-drift checks
   ├── `dislop patterns` / `voice` / `doctor`                            -> Extended pattern probes, personal style profile (`dislop.voice/1`), and zero-network setup audit
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
| Shared JS Core | `src/core.mjs` | Pure ES module with zero `node:*` or DOM globals (`auditText`, `auditOoxmlEntries`, `auditImageDocument`, `auditPdfDocument`, `analyzeTextProfile`, `getScenarioStrategy`, `resolveRegister`, `verifyRevisionBundle`, `extractVoiceProfileOffline`); shared by CLI, MCP, and `site/` |
| Extended Pattern Engine | `src/pattern-engine.mjs`, `src/dislop/pattern_engine.py`, `patterns/banks/*.json` | Multi-angle scanner executing 12 extended pattern-bank probes (`dislop patterns`, `dislop check --patterns`) with 100% Node/Python parity |
| Bundled Pocket ML Suite | `models/pocket-slop-v1.json`, `src/pocket-model.mjs`, `src/dislop/pocket_model.py` | Zero-dependency de-lexicalized INT8 N-gram LM + calibrated 24-feature linear attribution + 45-tree shallow GBDT + 5-domain pack router (`14.6 KB` gzip / `49.0 KB` raw, `< 0.5 ms` offline, `100.0%` F1 / `0.0%` Clean FPR on `stealth-vapor-v1`) |
| Hardware & Optional Local Models | `models/manifest.json`, `src/local-model.mjs`, `src/dislop/local_model.py` | Inspects RAM/disk budgets, manages optional `fast` (`0.6B`) / `balanced` (`1.7B`) / `quality` (`4B`) weights (`install` / SHA-256 `import` / `remove`), and runs loopback-only `deslop --local` with scenario-aware prompts and fact/unit retention guards |
| Node Binary Reader & BYOK Review | `src/binary-node.mjs`, `src/review-client.mjs` | Zero-dependency ZIP (`zlib.inflateRawSync`), PNG/JPEG/WebP/GIF (including LZW frame metrics), and PDF parsers, plus opt-in BYOK `dislop.review/1` client with secret scrubbing, quote grounding, and scenario strategies |
| Node CLI & MCP | `bin/dislop.mjs`, `bin/dislop-mcp.mjs` | Strict-validated offline CLI (`check [--pack <id|auto>] [--register <name>] [--rule <ids>] [-q] [--deep] [--compact] [--profile] [--ml] [--patterns] [--changed [ref]] [--staged] [--format text|json|agent|sarif|github|md]`, `verify [--register <name>]`, `review`, `doctor`, `patterns`, `voice`, `model`, `setup`, `deslop --local`, `explain`, `packs`, `catalog`, `resources`, `pack-test`, `init`), layered config (`~/.config/dislop/config.json` + `voice.json`), and local stdio MCP |
| Python Core, CLI & MCP | `src/dislop/{engine,pattern_engine,pocket_model,local_model,review_client,cli,mcp_server}.py` | Pure Python 3.10+ stdlib implementation kept in lockstep via 66 Python `unittest` conformance, ergonomics, register, BYOK security, and engine parity tests |
| Multi-Surface Manifests & Editor Bundles | `scripts/sync_manifests.mjs`, `plugin.json`, `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.agents/plugins/`, `gemini-extension.json`, `integrations/{antigravity,vscode,orca,herdr,hooks}/`, `server.json`, `action.yml`, `.pre-commit-hooks.yaml` | Shared manifest generator and validator locking npm, PyPI, Official MCP Registry (`https://dislop.com/mcp`), Agent Plugins 1.0, Claude Code, Codex, Cursor, Antigravity, VS Code / Open VSX, and GitHub Action schemas |
| Rule Manifests & Pattern Library | `packs/*/pack.json`, `patterns/dimensions/*.json`, `patterns/ai-tic-rubric.json` | 7 built-in `dislop.pack/2` manifests (`core`, `business-brief`, `engineering-spec`, `regulated-comms`, `literary-essay`, `deck-and-ui`, `executive-deck` — 53 active rules, 230 fixtures with per-register overrides) backed by 65 structured patterns across 6 dimensions & 7 angles (`53` pack-mapped + `12` extended pattern-bank rules) and the 5-layer AI-tic rubric |
| Hosted Cloud Backend & Remote MCP | Private `dislop-cloud` (`https://dislop.com/mcp`, `/api/v1/*`) | Closed-source hosted MCP v2 service exposing 10 tools (`dislop_check`, `dislop_verify`, `dislop_rules` at 0 credits without login; OAuth 2.1 or free `dslp_*` key for 30 free monthly credits on `dislop_review`, `dislop_deslop`, `dislop_office`, `dislop_visual_review`, `dislop_voice_extract`, `dislop_voice_manage`, `dislop_account`) backed by paid-tier Google Gemini API that does not train on user drafts |
| Anti-Slop Benchmark (`dislop-bench v2` + `visual-design-v1`) | `benchmarks/`, `scripts/run_benchmark.mjs`, `scripts/run_visual_benchmark.mjs`, `scripts/pattern_lab.mjs` | 112 core detection samples + 154 multi-angle pattern samples + 60 visual/UI/SVG/image/PDF samples (`100.0%` P/R/F1, `0.0%` Clean FPR, `100.0%` Node/Python parity) + 18 end-to-end revision tasks (`D1=45 / D2=20 / D3=25 / D4=10`), `--eval`, and blind A/B sheet export |
| Static Site Compiler & Content Layer | `scripts/build_site.mjs`, `scripts/lib/site_content.mjs`, `content/guides/*.md` | Zero-dependency compiler turning `src/core.mjs`, `packs/`, `skills/`, `content/guides/`, `docs/research/content-kb/sources.json`, `docs/brand*`, `ROADMAP*.md`, and `anti-slop-radar-index.json` into 119 static HTML pages (`/`, `/en/`, `/guides/`, `/en/guides/`, `/rules/`, `/en/rules/`, `/awesome/`, `/en/awesome/`), Atom feeds (`/feed.xml`, `/en/feed.xml`), JSON-LD `@graph`, reciprocal `hreflang`, explicit AI-search `robots.txt`, and `awesome/README*.md` |
| Research, Knowledge Base & Linguist Hygiene | `docs/research/`, `docs/research/content-kb/sources.json`, `.gitattributes` | Verified 90-entry Awesome Anti-Slop dataset (`dislop.radar/2`), 55 verified KB references (`dislop.kb/1`, excluded from npm/PyPI bundles via `tests/test_site.mjs`), Star growth research, and `.gitattributes` (`linguist-generated=true`) keeping primary GitHub repo language as JavaScript/Python |

## 3. Coverage Honesty & Exit Codes

Uninspected inputs never masquerade as clean:

- `0` — Completed inspection with zero findings at or above `--fail-on` (default `error`).
- `1` — One or more findings met or exceeded `--fail-on` (or stale suppressions under `--report-unused`).
- `2` — Invalid CLI flags, missing target path, or an explicitly requested file that could not be inspected (e.g., corrupted OOXML archive or non-UTF-8 text).

## 4. Official Static Site (`dislop.com`)

`site/` compiles to plain static files served over HTTPS at `https://dislop.com` (`Content-Security-Policy` locking `connect-src 'self'`, zero third-party font or analytics requests). Offline deterministic checking runs locally in browser memory with zero network calls; same-origin `/api/v1/*` and `/mcp` routes proxy to the hosted `dislop-cloud` service only when the user explicitly clicks an AI action or connects a Remote MCP client. Both `dislop.com` and `/awesome/` auto-detect the visitor's browser language (`navigator.languages`, never hardcoded to a single default) with a one-click manual toggle, keeping all specimens, rule examples, banners, and 90 directory summaries natively authored and strictly separated by language:

- **For humans**: One-click "Copy for Agent" hero prompt, live 3-state Hero Proof Card, 3 shareable before/after cases (`/#cases`), zero-upload browser workbench (`/#workbench`, with instant "Paste my draft", offline `#share=v1.*` compressed fragment links + `#try=<ruleId>` deep-links, and post-test install/GitHub guidance), clear 5-way usage guide (`/#surfaces`), 6 bilingual guides (`/guides/`, `/en/guides/`), 99 rule encyclopedia pages (`/rules/`, `/en/rules/` with edit notes & PR/chat citation copy), browser-filterable 90-entry Awesome Anti-Slop directory (`/awesome/`), and share/GitHub strip (`/#share`).
- **For external agents & crawlers**: Technical endpoints and the 53-rule table stay folded in `<details>` while remaining present in static HTML and served directly at `/.well-known/mcp/server-card.json`, `/.well-known/mcp.json`, `/.well-known/agent-skills/index.json`, `/llms.txt`, `/catalog.json`, `/index.md`, `/roadmap.md`, `/feed.xml`, `/en/feed.xml`, `/tasks/*.md`, `/methodology/*.md`, `/cases/*.md`, `/tools/*.md`, `/packs/*.md`, `/rules/*.md`, `/awesome/index.{json,md}`, and `/llms-full.txt`; `robots.txt` explicitly allows `Googlebot`, `Bingbot`, `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, and `PerplexityBot` while blocking `/api/` and `/mcp`. Build-time assertions enforce byte budgets (`llms.txt <= 2,600 B`, `sources.json <= 80 KB`), valid links, zero leaked `fixtures.hit`, stripped HTML comments / invisible Unicode characters, and language purity (`0` Chinese characters in `/en/**`).
