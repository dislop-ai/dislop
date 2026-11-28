---
content-type: reference-data
version: 1.1.2
snapshot: 2026-11-26
---

# Roadmap

[简体中文](./roadmap.zh-CN.md) · [Product Brief](./methodology/product-brief.md)

Last updated: `2026-11-26` · Current baseline: `v1.1.2` (Node.js Micro-Kernel Linter · `dislop.com` live)

This roadmap tracks what `dislop` ships today, how we expand from coding agents and CI pipelines to office agents and human writers, and the open design questions we decide together in [GitHub Discussions](https://github.com/dislop-ai/dislop/discussions) or [Issues](https://github.com/dislop-ai/dislop/issues).

---

## 1. Where We Are (`v1.1.2` Shipped)

| Area | Shipped today | Key files |
|---|---|---|
| Micro-Kernel & SDK (`dislop/sdk`) | Zero-dependency Node.js (`>= 20.0.0`, ESM) 7-step linter kernel with walk-up `.dislop.json` `overrides`, declarative `.dislop/rules.json` rules, `extraPacks`, Dual-Track exit arbitration (`Defect` vs `Suggestion`), interactive hunk `dislop fix`, `dislop verify` Dual Fact Gate, `dislop packs lint` security validator, and opt-in local dev `dislop worklog` | `src/kernel/`, `src/runtime/`, `src/commands/`, `src/sdk/` |
| 11 Modular Packs | Strictly single-language separated stage-gated Packs (`common`, `en`, `zh` × `artifact-qa`, `prose`, `web-ui`, `slide-deck`) combining deterministic `scripts/*.mjs` checks and lazy-loaded `prompts/*.md` rules | `packs/`, `scripts/verify-packs-security.mjs` |
| Formats & Patching | `.md`, `.mdx`, `.txt`, `.html`, `.css`, `.jsx`, `.tsx`, `.svg`, `.docx`, `.pptx`, `.pdf` (incl. `FlateDecode`, `ASCII85Decode`, `ASCIIHexDecode`, `/ObjStm`, `/ToUnicode`, XObject form recursion, `/URI` links), and `.png`/`.jpg`/`.webp` (incl. lossless OOXML patching) | `src/document/`, `src/fact-gate/` |
| 3-Tier Local-First Routing | Offline deterministic checks + Tier 3 local Ollama (`dislop model pull`), Tier 2 BYOK (`--engine byok --provider openai\|anthropic\|gemini`), Tier 1 Official Cloud (`dislop login`), and local stdio MCP (`dislop mcp` / `dislop-mcp`) | `src/runtime/router.mjs`, `src/runtime/providers/`, `src/mcp/` |
| Website & Workbench | Single-domain `dislop.com/` native English root (`x-default`) + `/zh/` native Chinese subpath (`301` on legacy `/en/*`), offline tab workbench, bilingual guides, rule encyclopedia, and `/llms.txt` discovery | `site/` |
| Awesome Anti-Slop | 90 checked bilingual entries (`dislop.radar/2`), pure English `awesome/README.md`, pure Chinese `awesome/README.zh-CN.md`, and browser filters at `dislop.com/awesome/` and `dislop.com/zh/awesome/` | `docs/research/anti-slop-radar-index.json`, `awesome/` |
| Multi-surface manifests | Locked manifests across npm (`dislop`), Official MCP Registry (`io.github.dislop-ai/dislop`), 5 pure-Markdown Agent Skills (`skills/*`), Claude Code (`.claude-plugin/`), Codex (`.codex-plugin/`), Cursor (`.cursor-plugin/`), Gemini CLI (`gemini-extension.json`), GitHub Action (`action.yml`), and `.pre-commit-hooks.yaml` | `package.json`, `server.json`, `action.yml`, `.pre-commit-hooks.yaml` |

---

## 2. Active Tracks & Milestones

Tracks are split along clean directory boundaries so contributors can work in parallel.

Prioritization follows the design principle in [PRODUCT.md](./methodology/product-brief.md): agent-reusable interfaces, verification gates, and format-preserving Office pipelines come ahead of standalone manual-writing plugins.

### Track A — Public Package Registries & First 6 Marketplace Listings (Now)

Goal: finish account-side publishing so every install command resolves from public registries and get listed on the first marketplaces.

- [x] Ship single-source manifest generator (`scripts/sync_manifests.mjs`), automated Trusted Publishing release workflow (`.github/workflows/release.yml`), reusable GitHub Action (`action.yml`), and `pre-commit` hooks (`.pre-commit-hooks.yaml`).
- [x] Default local MCP `dislop_check` to `verbosity: "compact"`, expose the focused 7-tool stdio surface, strip negative test fixtures from `dislop_explain`, pass `claude plugin validate` and `codex plugin` install checks, and set GitHub repository crawler topics (`gemini-cli-extension`, `claude-code-plugin`, `agent-plugins`).
- [x] Publish `dislop` on npm and publish `server.json` live to `registry.modelcontextprotocol.io` (`io.github.dislop-ai/dislop`).
- [ ] Verify automatic indexing on `skills.sh` and `geminicli.com/extensions`, claim Smithery and Glama listings, and complete deferred manual store reviews for Anthropic (`claude.ai/directory/manage`) and OpenAI.

**Done when**: `npx --yes dislop check .`, `npx --yes dislop-mcp`, and `gemini extensions install` work straight from public registries, and the Official MCP Registry lists `io.github.dislop-ai/dislop` Official Cloud MCP (`https://dislop.com/mcp`).

### Track B — Dual-Published Editor Extension & Multi-Agent Fleet Orchestrators (Next)

Goal: ship one zero-dependency Web extension across both major VS Code registries and solve Git worktree handoff checks for parallel agent runners like Orca, Herdr, and Conductor.

- [x] Ship the Web-compatible extension `integrations/vscode/` around `src/core.mjs` (on-save/idle squiggles, hover before/trap/after cards, `Cmd+.` quick-ignore comments, automatic `mcpServerDefinitions` / `languageModelTools` registration, and `.vsix` attached to GitHub Releases).
- [x] Ship `integrations/antigravity/` (passing `agy plugin validate --strict` with zero warnings), `.cursor-plugin/plugin.json`, and parallel-fleet templates (`integrations/orca/orca.yaml`, `integrations/herdr/herdr-plugin.toml`, and 2-strike `integrations/hooks/dislop-gate.sh`).
- [ ] Configure publisher tokens for **VS Code Marketplace** and **Open VSX**, and submit Antigravity Partner Intake plus Cursor / Cline Marketplace PRs.

**Done when**: installing `.vsix` activates both human diagnostics and editor agent tools with zero manual JSON edits, and child Git worktrees inherit `.dislop.local.json` cleanly.

### Track C — Office Agents, Everyday Writers & Benchmark Expansion (Parallel)

Goal: expand beyond coding agent users to office agent workflows and anyone delivering docs, slides, or reports with AI while keeping reproducible benchmark coverage growing.

- [x] Ship `dislop-bench v2` (112 core detection samples + 154 multi-angle pattern samples at `100.0%` precision/recall, `0.0%` clean FPR, `100.0%` Node/Python parity, 18 end-to-end revision tasks at `18/18` all-clear, and 5-model live cloud comparisons in [benchmarks/REPORT.md](https://github.com/dislop-ai/dislop/blob/main/benchmarks/REPORT.md)) plus the 30-task 4-skill ecosystem benchmark ([benchmarks/ECOSYSTEM-BENCHMARK.md](https://github.com/dislop-ai/dislop/blob/main/benchmarks/ECOSYSTEM-BENCHMARK.md)).
- [ ] *(Lower priority / deferred)* Reuse `src/core.mjs` for standalone manual-writing extensions (**Obsidian Community Plugin** and **Raycast Store**) once cloud Office round-trip and `dislop_verify_edit` milestones land.
- [ ] Add longer real-world drafts and multi-slide executive `.pptx` benchmarks, reviewing store installs every two weeks.

**Done when**: `node scripts/run_benchmark.mjs --assert` stays green offline in CI and real-world longform plus multi-slide `.pptx` benchmarks are added; deferred manual-writing plugins are revisited after core Agent and Office cloud milestones land.

### Track D — `Awesome Anti-Slop` Maintenance & Split Threshold (Ongoing, Parallel)

Goal: keep the 90-entry directory accurate, neutral, and easy to filter in both English and Chinese without splitting focus.

- [x] Add GitHub Issue form templates for Awesome Anti-Slop submissions (`.github/ISSUE_TEMPLATE/awesome_submission.yml` with URL, category, locale, and one-sentence EN/ZH summaries).
- [x] Add scheduled link and GitHub repository health checks (`scripts/check_awesome_links.mjs` and weekly `.github/workflows/awesome-links.yml`).
- [ ] Keep `awesome/README.md`, `awesome/README.zh-CN.md`, and `https://dislop.com/awesome/` inside `dislop-ai/dislop` during early growth.
- [ ] **Split threshold**: spin out a standalone CC0-1.0 `dislop-ai/awesome-anti-slop` repository (`dislop.radar/3`) only once sustained external directory PRs reach `>= 5/month`, keeping `https://dislop.com/awesome/` canonical permanently.

### Track E — Hosted Cloud Review & Static Site Extraction (`dislop-cloud`)

- **Open source (`dislop-ai/dislop`, Apache-2.0)**:
  - Markdown `SKILL.md` and `./references/*.md`
  - Zero-dependency Node.js CLI, SDK, local stdio MCP, and `11` stage-gated Packs (`common/*`, `en/*`, `zh/*`)
  - Offline workbench, `Awesome Anti-Slop`, and `dislop-bench v3`
- **Closed source (`dislop-cloud`)**: Official Cloud MCP (`https://dislop.com/mcp`), multi-model pipelines, and format-preserving cloud `.docx` / `.pptx` workflows.

- [x] **Phase 0 (Live Hosted Cloud, Account Hub & Sign-In)**: `dislop-cloud` live at `https://dislop.com/mcp` and `/api/v1/*` with 30 free monthly credits and OAuth / OTP sign-in.
- [ ] **Align `dislop-cloud` with `dislop.report/1` & Extract Website**: Complete [MIGRATION-TODO.md](https://github.com/dislop-ai/dislop/blob/main/docs/MIGRATION-TODO.md) items to extract `site/`, `content/`, and `awesome/` and align hosted `/api/v1/review` with the micro-kernel `dislop.report/1` schema.

---

## 3. Open Questions for Discussion

These five design choices are open for co-maintainers and contributors to weigh in on:

1. **VS Code / Open VSX diagnostic cadence**: Should editor underlines update only on file save (`onSave`) by default, or after a `300ms` typing pause? Does live underlining distract during first-draft writing?
2. **Agent Hook blocking scope & circuit breaker**: Our default hook blocks only on `packs/core` `error` artifacts and yields to the human after 2 consecutive blocks on the same file. Should we also ship a strict preset that blocks `regulated-comms` superlatives?
3. **Orca / Conductor worktree shared files**: Beyond `.dislop.local.json`, should our `orca.yaml` template also symlink `.dislop.local/voice.json` into child worktrees by default?
4. **Code-comment & PR hygiene boundary**: Should `dislop` stay strictly focused on prose, docs, decks, and UI files inside PR diffs (leaving AST checks to Oxlint/ESLint/Ruff), or add an opt-in probe for boilerplate AI PR descriptions and empty docstrings?
5. **Obsidian plugin primary UI**: Do longform Obsidian writers prefer a side-pane rhythm & findings summary, or inline dashed underlines inside Live Preview?

---

## 4. How We Collaborate

Open design questions live in [GitHub Discussions](https://github.com/dislop-ai/dislop/discussions). Concrete tasks, false positives, and Awesome submissions live in [Issues](https://github.com/dislop-ai/dislop/issues) grouped by `track:*`, `area:*`, and `priority:*` labels across milestones (`v0.8.0`, `v0.9.0`, `v0.10.0`). Live task status stays in Issues (this roadmap updates on releases and major milestones so we avoid keeping two task lists).

Maintainers fast-forward push tiny fixes and releases directly to `main`, while feature work, rule changes, and cross-file edits go on short topic branches (`feat/...`, `fix/...`, `docs/...`) with `Closes #<number>` in the PR description. `.github/CODEOWNERS` routes PR review requests to maintainers (`@zhangxin840` and `@rayw000`), merged branches delete automatically, and `main` blocks force-pushes and branch deletion. Commercial billing and hosted cloud backend work stay separated in the private cloud repository.

- **Parallel-friendly file boundaries**:
  - Core probes & parity: `packs/`, `patterns/`, `src/core.mjs`, `src/dislop/`, `tests/test_conformance.py`
  - Marketplaces & editor integrations: `scripts/sync_manifests.mjs`, `plugin.json`, `integrations/`, `action.yml`
  - Website & Awesome directory: `docs/research/anti-slop-radar-index.json`, `scripts/build_site.mjs`, `site/`, `tests/test_site.mjs`
  - Benchmarks & docs: `benchmarks/`, `docs/`, `README*.md`, `ROADMAP*.md`
- **Hard guardrails (always on)**:
  - Zero external runtime dependencies in `src/core.mjs` and `src/dislop/` core checkers.
  - Zero external font CDNs, analytics, or third-party requests on `dislop.com` (`CSP: connect-src 'self'`; offline check stays 0-upload by default).
  - Visitor-facing copy follows [docs/brand-and-voice-guide.md](https://github.com/dislop-ai/dislop/blob/main/docs/brand-and-voice-guide.md) and keeps Chinese and English examples strictly separated.
- **Run one command before opening a PR or cutting a release** (platform publishing rules live in [docs/releasing.md](https://github.com/dislop-ai/dislop/blob/main/docs/releasing.md)):
  ```bash
  npm run release:check
  ```
