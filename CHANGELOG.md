# Changelog

All notable changes to `dislop` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

- Added `review --interactive-apply` and `apply --review-file … --source-file …` to the Node and Python CLIs. The Vim picker and saved JSON reviews support selective edits to UTF-8 source files.

## [0.8.1] - 2026-11-23

### Fixed
- **Strict YAML `SKILL.md` frontmatter**: Quoted the `description` value in `skills/dislop/SKILL.md` so `npx skills add` parses the skill cleanly under strict YAML rules, and stripped optional surrounding quotes when generating `.well-known/agent-skills/index.json` and running skill benchmarks.

## [0.8.0] - 2026-11-23

### Added
- **Scenario-aware anti-slop strategies (`--register`, `getScenarioStrategy`)**: Tailored cleanup, protection rules, and over-editing guardrails per writing scenario (`technical`, `official`, `argumentative`, `narrative`, `casual`, `marketing`, `deck-ui`) across `src/core.mjs`, `src/dislop/engine.py`, `dislop check/verify/review/deslop`, local stdio & hosted Cloud MCP, `skills/dislop/SKILL.md`, and the `dislop.com` workbench (`#register-select` + live strategy banner).
- **Opt-in BYOK `dislop review` & zero-network `dislop doctor`**: Added zero-dependency BYOK review clients (`src/review-client.mjs`, `src/dislop/review_client.py`) supporting OpenAI, Gemini, OpenRouter, custom endpoints, and loopback local servers with explicit `--yes` / `DISLOP_ALLOW_REMOTE=1` consent, `.dislop.local.json` `forbid` enforcement, quote grounding, and fact-invention filtering, plus `dislop doctor` to inspect CLI/Skill/MCP readiness offline.
- **Structured revisions, `--format agent`, & strict CLI ergonomics**: Added per-finding `confidence` and `revision` (`kind`, `scope`, `instruction`, `keep`, `avoid`), `--rule`, `--deep`, `-q/--quiet`, `--changed` disambiguation, unknown-flag spelling suggestions, `.gitignore` automation in `dislop init`, and compact deterministic `--format agent` output in Node and Python.
- **Bilingual static site, rule encyclopedia & GIF v2 visual suite**: Added static rule encyclopedia pages (`/rules/<id>/` and `/en/rules/<id>/`), 6 bilingual guides (`/guides/`, `/en/guides/`), offline workbench shareable links (`#share=v1.*`), direct `#try=<ruleId>` deep-links, GitHub slop-sample issue template, zero-dependency GIF87a/GIF89a LZW inspection, and 12 audited demo GIFs/WebPs/posters (`assets/demos/*-v2.*`).

### Changed
- **Scenario calibration & anti-degradation guardrails**: Skipped `template-skeleton-echo` and `cadence-flattened` on structured `technical`/`official` specs, downgraded `template-skeleton-echo` to `info` for `casual` notes and `low-burstiness-vapor` to `info` for `official` notices, added deterministic `register-drift` detection in `verifyRevisionBundle`, and tightened `chatbot-artifact`, `zh-bureaucratic-padding`, `unsourced-attribution`, `semicolon-tricolon`, and `literary-negation-pivot`.
- **Direct rule documentation links & Python speedup**: Pointed SARIF `helpUri`, `catalog` `anchorUrl`, and `--format github` annotations directly to `/rules/<id>/` or `/en/rules/<id>/`, and cached compiled rule regexes in `src/dislop/engine.py`.

## [0.7.1] - 2026-11-22

### Fixed

- **MCP Registry CI & status check**: Updated `.github/workflows/release.yml` to fetch the latest `mcp-publisher` release for Official MCP Registry OIDC audience compatibility, and updated `scripts/release.mjs --status` to query the Registry `v0.1` `versions/latest` endpoint.
- **npm OIDC Trusted Publishing & DCO**: Configured `publish-npm` in `.github/workflows/release.yml` for GitHub Actions OIDC Trusted Publishing with provenance and added DCO sign-off (`-s`) to automated release commits in `scripts/release.mjs`.

## [0.7.0] - 2026-11-22

### Changed

- **Three-layer product form alignment (`PRODUCT.md`)**: Clarified `dislop` into three non-overlapping layers: (1) an open-source pure-Markdown `Skill` (`skills/dislop/`, zero bundled scripts), (2) an open-source zero-dependency local `CLI` & editor plugins for fast deterministic checks in terminals, hooks, and CI, and (3) Official Cloud MCP (`https://dislop.com/mcp`) & Web Workbench for sign-in-gated multi-model genre review (`dislop_review` returning structured diagnostics for local agents to revise in project context).
- **Official Cloud MCP manifest consolidation**: Pointed `.mcp.json`, `mcp.json`, `gemini-extension.json`, `integrations/antigravity/mcp_config.json`, `server.json`, and the VS Code / Open VSX extension (`McpHttpServerDefinition`) cleanly to Official Cloud MCP (`https://dislop.com/mcp`), while keeping existing offline code intact until held-out evaluation completes.
- **Honest CLI zero-finding output**: Updated Node and Python CLI zero-hit text output from `dislop: ok` to `dislop: no known patterns found` (`dislop: 未发现已知模式` under `--lang zh`).
- **Contributor licensing & service notice (`CONTRIBUTING.md`)**: Added DCO sign-off (`git commit -s`) and explicit Apache-2.0 / official-service naming notice.

## [0.6.2] - 2026-11-22

### Added

- **Canonical Bilingual Product Brief (`PRODUCT.md`)**:
  - Defined positioning ("Linter for AI Slop."), three-stage audience rollout (coding agents, office agents, and everyone shipping AI-assisted work), three core selling points, and the bilingual one-sentence pitch as the single source of truth across docs and manifests.
  - Published the brief as a static agent endpoint (`/methodology/product-brief.md`) linked from `/llms.txt` and the `/methodology/index.md` catalog.
- **Bilingual Demo GIF & Poster Suite (`assets/demos/`)**:
  - Added 8 rendered demo GIFs and poster PNGs (`cli-check`, `workbench-live`, `ui-slop`, `proof-cycle` in Chinese and English) with reproducible capture scripts under `scripts/media/`.

### Changed

- **Cross-Surface Positioning & Manifest Alignment (`site/`, `scripts/sync_manifests.mjs`)**:
  - Aligned `README.md`, `README.zh-CN.md`, CLI help, VS Code / Herdr / Claude / Codex / Cursor / Gemini / Antigravity manifests, SVG banners, and `og-card` graphics with `PRODUCT.md` copy and current `npx --yes dislop` / `uvx dislop` commands.
  - Updated the `dislop.com` workbench and copy to present offline CLI/plugin privacy alongside optional Local vs. Cloud MCP switching in the browser.

### Fixed

- **Python 3.10 / 3.11 Compatibility & CI Matrix**:
  - Replaced nested same-quote f-strings in `src/dislop/engine.py` that failed with `SyntaxError` below Python 3.12 (`requires-python >=3.10`), and added a `python-compat` matrix job (Python 3.10 and 3.x) in `.github/workflows/ci.yml`.
- **Deterministic Probe & Exemplar Fixes**:
  - Exempted Markdown links from `unfilled-placeholder` across JS and Python cores, added Chinese and unprefixed greeting coverage to `chatbot-artifact`, and removed ungrounded numbers from the `eng-pr-diff-parrot` exemplar.
- **CI Release & Status Verification**:
  - Cleared `NODE_AUTH_TOKEN` and `NPM_CONFIG_USERCONFIG` before npm OIDC publishing in `.github/workflows/release.yml`, and updated `release:status` repository description checks to match `Linter for AI Slop`.

## [0.6.1] - 2026-11-22

### Added

- **Public Registry Onboarding & Official MCP Registry Listing**:
  - Published `dislop` live on **npm** (`https://www.npmjs.com/package/dislop`), **PyPI** (`https://pypi.org/project/dislop/`), and the **Official MCP Registry** (`io.github.dislop-ai/dislop` on `registry.modelcontextprotocol.io`, exposing both local `npx`/`uvx` `stdio` packages and hosted `https://dislop.com/mcp` `streamable-http`).
  - Switched default install snippets, VS Code / Cursor 1-click MCP deeplinks, `SKILL.md`, and `.mcp.json` / `mcp.json` manifests to fast public registry coordinates (`npx --yes dislop`, `uvx dislop`, `npm install -g dislop`, `pip install dislop`).
- **Editor & Multi-Agent Fleet Integrations (`integrations/` & `.cursor-plugin/`)**:
  - Added the Web-compatible **VS Code & Open VSX** extension (`integrations/vscode/`, bundling all 7 offline packs for squiggle diagnostics, hover before/trap/after cards, `Cmd+.` quick-ignore comments, and automatic `dislop.mcp` + `dislop_check_document` registration, attaching `dislop-<ver>.vsix` to GitHub Releases).
  - Added the validated **Antigravity** plugin bundle (`integrations/antigravity/`, passing `agy plugin validate --strict` with zero warnings), **Cursor** plugin manifest (`.cursor-plugin/plugin.json`), **Orca** / **Herdr** worktree templates (`integrations/orca/orca.yaml`, `integrations/herdr/herdr-plugin.toml`), and 2-strike Agent Hook gate (`integrations/hooks/dislop-gate.sh`).
- **Site Crawlability & GitHub Workflow Upgrades**:
  - Added `/robots.txt` and `/sitemap.xml` generation and tests in `scripts/build_site.mjs` and `tests/test_site.mjs`, upgraded GitHub Actions to Node 24 (`actions/checkout@v7`, `actions/setup-node@v7`, `actions/setup-python@v7`, `astral-sh/setup-uv@v7`), and added GitHub Issue/PR templates, `CODEOWNERS`, and weekly Awesome link health checks (`scripts/check_awesome_links.mjs`).

## [0.6.0] - 2026-11-22

### Added

- **Multi-Angle Text Probes & 5-Axis Telemetry (`--profile`)**:
  - Added multi-angle deterministic probes in both `src/core.mjs` and `src/dislop/engine.py` covering keyword co-occurrence clusters, semicolon tricolons, rhetorical Q&A cadence, 5-comma run-ons, macro narrative sandwiches, syntactic skeleton echoes, and low-burstiness vapor.
  - Added offline 5-axis statistical text telemetry (`analyzeTextProfile` via `--profile`) measuring burstiness CV, concreteness density, MATTR/entropy, punctuation cadence, and structural risk with 100% Node/Python parity.
- **53-Pattern Anti-Slop Catalog & Extended Pattern Engine (`patterns/`)**:
  - Added the structured 53-pattern catalog (`patterns/dimensions/*.json`, 6 dimensions, 7 detection angles) linking all 42 built-in pack rules plus 11 extended pattern-bank probes (`patterns/banks/*.json`) executed identically by `src/pattern-engine.mjs` and `src/dislop/pattern_engine.py` (`dislop patterns` and `dislop check --patterns`).
  - Added `dislop catalog` / `dislop search` CLI and `dislop_catalog` MCP search plus `scripts/pattern_lab.mjs` (`verify`, `ablation`, `dogfood`, `assert`) achieving `100.0%` P/R/F1 and `0.0%` Clean FPR across 154 benchmark samples (`benchmarks/PATTERN-BENCHMARK.md`).
- **7 Built-In Scenario & Vertical Packs (42 Rules, 160 Fixtures, Zero Network Downloads)**:
  - Expanded built-in `packs/` to 7 bundled offline packs (`core`, `business-brief`, `engineering-spec`, `regulated-comms`, `literary-essay`, `deck-and-ui`, `executive-deck`) totaling 42 active rules and 160 hit/clean fixture assertions (`83` hit + `77` clean).
  - Upgraded `skills/dislop/` with 4 local progressive-disclosure reference cards (`./references/{business-and-rfc,editorial-and-essay,web-ui-and-deck,regulated-and-precision}.md`, `0` network calls) and compact `< 2.5 KB` `SKILL.md` body.
  - Added offline deterministic voice profile extraction (`dislop voice` / MCP `dislop_voice_extract_offline`, `dislop.voice/1`) and expanded `dislop-bench v2` to 112 core detection samples and 18 end-to-end revision tasks (`raw_ai` `60.8` -> `naive_humanizer` `70.8` -> `dislop_clean` `100.0`).
- **Bundled `14.6 KB` Pocket ML & Hardware-Aware Optional Local Models**:
  - Bundled `models/pocket-slop-v1.json` (`14.6 KB` gzip / `49.0 KB` raw, zero dependencies, `< 0.5 ms`, `100.0%` F1 / `0.0%` Clean FPR on `stealth-vapor-v1`), powering `dislop check --ml`, `dislop model score`, and `--pack auto` domain routing across Node and Python.
  - Added `src/local-model.mjs` and `src/dislop/local_model.py` (`dislop model`, `dislop setup`, `dislop deslop --local`) inspecting system RAM, disk budgets, and `127.0.0.1` loopback runners for optional `0.6B` / `1.7B` / `4B` local models with SHA-256 offline import and an internal numeric and qualifier retention guard during automated local rewrites.
- **10 Locked Marketplace Manifests, Release Automation & Compact 7-Tool MCP**:
  - Added single-source manifest synchronization (`scripts/sync_manifests.mjs`) locking 10 distribution files (`plugin.json` + `mcp.json`, `.claude-plugin/{plugin,marketplace}.json`, `.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`, `skills/dislop/agents/openai.yaml`, `gemini-extension.json`, `.mcp.json`, and `server.json` declaring both local `stdio` and remote `https://dislop.com/mcp`).
  - Added `scripts/release.mjs`, reusable root GitHub Action (`action.yml`), `.pre-commit-hooks.yaml`, and OIDC release workflow (`.github/workflows/release.yml`), keeping npm tarball size at `187.5 KB` (`<= 300 KB` gate) and verifying 27 Python `unittest` suites across 4 modules.
  - Focused local stdio MCP (`bin/dislop.mjs` & `src/dislop/mcp_server.py`) to 7 offline tools (`dislop_check` supporting `pack` incl. `"auto"`, `profile`, `ml`, and `patterns`; `dislop_voice_extract_offline`; `dislop_model_score`; `dislop_model_status`; `dislop_explain`; `dislop_packs`; `dislop_catalog`) with default `verbosity: "compact"` and stripped negative fixtures.
- **Galley Workbench Polish (`dislop.com`)**:
  - Standardized the workbench around the 2-mark visual system (red solid `error` + blue dashed `warning`/`info`), added the 5-cell plain-language rhythm gauge, one-click wrapper stripping, dual offline/cloud voice extraction, pure EN/ZH `RULE_UI_META` across all 42 rules, and responsive `/awesome/` filtering with `?lang=en|zh`.

## [0.5.0] - 2026-11-21

### Changed

- **Workbench-First Site & Plain-Voice Copy Overhaul (`dislop.com`)**:
  - Restructured `https://dislop.com` as a human-first, agent-friendly anti-slop hub defaulting to Simplified Chinese (`zh-CN`) with native English (`en`) switching, zero language mixing, one-click "Copy for Agent" hero prompt, live 3-state Hero Proof Card, 3 before/after cases, instant browser workbench, 5-way usage guide, folded Agent technical endpoints (`/llms.txt`, `/catalog.json`, `/tasks/*.md`, `/rules/*.md`), and 87-entry `/awesome/` directory.
  - Rewrote visitor-facing copy across `dislop.com`, `README*.md`, `awesome/README*.md`, `docs/brand-and-voice-guide*.md`, `AGENTS.md`, CLI help strings, and SVG banners to drop 3-part semicolon pitches, pull-quote closers, and copy-editor roleplay.
  - Consolidated project milestones and open design questions into root [ROADMAP.md](./ROADMAP.md) & [ROADMAP.zh-CN.md](./ROADMAP.zh-CN.md).

## [0.4.1] - 2026-11-21

### Added

- Added a 16-sample real-world adversarial holdout suite (`benchmarks/datasets/holdout-v1.json`) expanding detection coverage to 64 samples with `100%` P/R/F1 and `100%` Node/Python parity, fixing 5 recall/FP blind spots in `chatbot-artifact`, `unfilled-placeholder`, and `negation-pivot-frame`.
- Added `/privacy.md` disclosing offline zero-upload boundaries vs. optional zero-training Google Gemini cloud endpoints, auto-detected `?lang=` / `navigator.language`, aligned the Pro (`$12/mo`, 1,500 credits) vs. PAYGO (`$10`, 800 credits) ladder, and enforced automated `JSON.parse()` checks on all Agent doc configs in `tests/test_site.mjs`.

## [0.4.0] - 2026-11-21

### Changed

- **Clean Open-Source vs. Closed-Source Cloud Split**:
  - Kept `dislop-ai/dislop` (Apache-2.0) strictly open-source, zero-LLM, and zero-network during checks (`SKILL.md`, Node/Python CLI, local stdio MCP, deterministic rules, `Awesome Anti-Slop`, and `dislop-bench`).
  - Moved the hosted LLM backend and Remote Streamable HTTP MCP (`/mcp`, `/api/v1/*`) into the private `dislop-cloud` repository (live at `https://dislop.com/mcp` with paid-tier zero-training Gemini routing, hashed `dslp_*` tokens, 5 anonymous web trial credits/day, 30 free monthly credits on signup, and global daily budget cap).
  - Upgraded `https://dislop.com` to `CSP: connect-src 'self'` (zero third-party fonts, analytics, or external hosts; offline checks stay zero-upload by default) with opt-in `AI Review` (`1 credit`) and self-healing `AI Rewrite` (`2 credits`) buttons in `#workbench`.

## [0.3.0] - 2026-11-21

### Changed

- **Focused Scope on Direct Anti-Slop Only**:
  - Removed features not directly tied to detecting AI slop: standalone `dislop verify` / MCP `dislop_verify` revision diffing, PDF structural/font/MediaBox preflight, Word tracked-changes/comments hygiene, local filesystem path scanning (`local-path-leak`), WCAG contrast/dark-mode linting (`ui-contrast-and-dark-inversion`), and SVG `<title>`/fallback-clipping linting (`svg-text-overflow-or-a11y`).
  - Narrowed the active catalog to 25 pure anti-slop rules across 4 packs (`core`, `business-brief`, `literary-essay`, `deck-and-ui`) and unified the official homepage on `https://dislop.com`.

### Added

- Added the initial offline benchmark suite (`dislop-bench v1`: 48 detection samples + 12 end-to-end revision tasks) in [benchmarks/README.md](./benchmarks/README.md) and [scripts/run_benchmark.mjs](./scripts/run_benchmark.mjs), plus the 5-model live comparison ([benchmarks/MODEL-COMPARISON.md](./benchmarks/MODEL-COMPARISON.md)) showing `+15.8` to `+22.3` composite lift over bare prompting.
- Added Claude Code plugin manifests (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`), brand guides ([docs/brand-and-voice-guide.md](./docs/brand-and-voice-guide.md)), and the 87-entry **Awesome Anti-Slop** directory ([awesome/README.md](./awesome/README.md)).

## [0.2.0] - 2026-11-21

### Added

- **Two-Tier Rule Architecture (`dislop.pack/2`)**:
  - Introduced `packs/core/pack.json` (`tier: "invariant"`, `severity: "error"`) alongside 3 initial genre packs (`business-brief`, `literary-essay`, `deck-and-ui`) totaling 29 rules with bilingual check questions, `bad -> trap -> good` exemplars, and 101 automated fixture assertions.
- **Cross-Modality Binary & Dual-Runtime Parity**:
  - Added zero-dependency Node.js (`src/core.mjs`, `src/binary-node.mjs`) and Python (`src/dislop/`) parsers for `.docx`, `.pptx` (true `p:sldIdLst` slide order, joined `<a:t>` runs, word walls, bullet caps, `normAutofit`), and early `.pdf` metadata checks (later removed in `v0.3.0`), plus `tests/test_conformance.py`, Git diff gating (`--changed`, `--staged`), SARIF 2.1.0 & GitHub PR annotation formatters, inline suppressions (`--report-unused`), and `dislop init`.
  - Added an early standalone revision verifier (later removed from the public CLI/MCP in `v0.3.0` to stay strictly scoped to anti-slop detection).
- **Galley Proof Design System & Browser Workbench (`site/`)**:
  - Authored `docs/design-system.md` & `docs/design-system.zh-CN.md`, adaptive light/dark SVG banners, the zero-upload browser workbench, and the 2026 anti-slop landscape study with 87 verified ecosystem entries.

## [0.1.0] - 2026-11-21

### Added

- Initial zero-dependency Node.js (`bin/dislop.mjs`, `bin/dislop-mcp.mjs`) and Python (`src/dislop/`) CLI and stdio MCP server implementations.
- First three modular rule packs (`business-brief`, `literary-essay`, `deck-and-ui`), brand mark (`assets/logo.svg`), bilingual `README` / `docs/architecture`, `CONTRIBUTING.md`, `server.json`, Apache-2.0 `LICENSE`, and GitHub Actions CI with self-dogfooding.

## [0.0.1] - 2026-11-21

### Added

- Repository bootstrap (`aec5d35`): initial `AGENTS.md`, `README.md`, `docs/architecture.md`, and `.gitignore`.
