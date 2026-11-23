---
content-type: reference-data
version: 0.8.1
snapshot: 2026-11-21
---

# Roadmap

[简体中文](./roadmap.zh-CN.md) · [Product Brief](./PRODUCT.md)

Last updated: `2026-11-23` · Current baseline: `v0.8.1` (`dislop.com` live)

This roadmap tracks what `dislop` ships today, how we expand from coding agent users to office agent users (Claude Cowork, WorkBuddy, Qwen) and everyone delivering work with AI, and the open design questions we want to decide together. To pick up a track, push back on a rule threshold, or propose a new idea, start a thread in [GitHub Discussions](https://github.com/dislop-ai/dislop/discussions) or claim an [Issue](https://github.com/dislop-ai/dislop/issues).

---

## 1. Where We Are (`v0.8.0` Shipped)

| Area | Shipped today | Key files |
|---|---|---|
| Core engine & parity | Zero-dependency Node.js 20+ and Python 3.10+ engines passing 230 rule & register fixtures, scenario-aware strategies (`getScenarioStrategy` / `registerOverrides`), 65-pattern catalog checks, offline `extractVoiceProfileOffline`, and 66 Python `unittest` conformance, ergonomics, and security tests | `src/core.mjs`, `src/dislop/engine.py`, `src/review-client.mjs`, `tests/` |
| Built-in packs & local model advisor | All 7 scenario and vertical packs (`53` rules) bundled offline (`core`, `business-brief`, `engineering-spec`, `regulated-comms`, `literary-essay`, `deck-and-ui`, `executive-deck`), plus 12 extended pattern-bank probes (`--patterns`), a bundled `14.6 KB` gzip Pocket ML ensemble (`pocket-slop-v1`), and hardware-aware local model advisor (`dislop model`) | `packs/*/pack.json`, `patterns/`, `models/`, `src/local-model.mjs` |
| Formats | `.md`, `.mdx`, `.txt`, `.html`, `.css`, `.jsx`, `.tsx`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.docx`, `.pptx`, `.pdf` | `src/binary-node.mjs`, `src/dislop/engine.py` |
| Website & Workbench | Browser-language-matched `dislop.com` (`zh` & native `en`), 2 proof marks (red solid `error` + blue dashed `warning`/`info`), pack + register selectors with live scenario strategy guidance, 5-cell rhythm gauges, offline `#share=v1.*` links & `#try=<ruleId>` deep-links, bilingual guides & rule encyclopedia pages, and `/llms.txt` endpoints | `scripts/build_site.mjs`, `site/` |
| Awesome Anti-Slop | 90 checked bilingual entries (`dislop.radar/2`), pure English `awesome/README.md`, pure Chinese `awesome/README.zh-CN.md`, and browser filter at `dislop.com/awesome/` | `docs/research/anti-slop-radar-index.json`, `awesome/` |
| Multi-surface manifests & editor bundles | CI-locked manifests and bundles across npm (`dislop`), PyPI (`dislop`), Official MCP Registry (`io.github.dislop-ai/dislop` pointing to Official Cloud MCP `https://dislop.com/mcp`), pure-doc Agent Skill (`skills/dislop/` with 4 local reference cards + `agents/openai.yaml`), Claude Code (`.claude-plugin/`, ~130 always-on tokens), Codex (`.codex-plugin/` + `.agents/plugins/marketplace.json`), Cursor (`.cursor-plugin/`), Antigravity (`integrations/antigravity/`), VS Code / Open VSX Web extension (`integrations/vscode/`), GitHub Action (`action.yml`), and `.pre-commit-hooks.yaml` | `scripts/sync_manifests.mjs`, `integrations/`, `server.json`, `action.yml` |

---

## 2. Active Tracks & Milestones

Full ecosystem research and marketplace ranking live in [docs/research/universal-adaptation-and-marketplace-strategy.zh-CN.md](https://github.com/dislop-ai/dislop/blob/main/docs/research/universal-adaptation-and-marketplace-strategy.zh-CN.md). Tracks are split along clean directory boundaries so contributors can work in parallel.

### Track A — Public Package Registries & First 6 Marketplace Listings (Now)

Goal: finish account-side publishing so every install command resolves from public registries and get listed on the first marketplaces.

- [x] Ship single-source manifest generator (`scripts/sync_manifests.mjs`), automated Trusted Publishing release workflow (`.github/workflows/release.yml`), reusable GitHub Action (`action.yml`), and `pre-commit` hooks (`.pre-commit-hooks.yaml`).
- [x] Default local MCP `dislop_check` to `verbosity: "compact"`, expose the focused 7-tool stdio surface, strip negative test fixtures from `dislop_explain`, pass `claude plugin validate` and `codex plugin` install checks, and set GitHub repository crawler topics (`gemini-cli-extension`, `claude-code-plugin`, `agent-plugins`).
- [x] Publish `dislop` on npm and PyPI, flip default package coordinates via `node scripts/sync_manifests.mjs --channel registry`, and publish `server.json` live to `registry.modelcontextprotocol.io` (`io.github.dislop-ai/dislop`).
- [ ] Verify automatic indexing on `skills.sh` and `geminicli.com/extensions`, claim Smithery and Glama listings, and complete deferred manual store reviews for Anthropic (`claude.ai/directory/manage`) and OpenAI.

**Done when**: `npx dislop check .`, `uvx dislop check .`, and `gemini extensions install` work straight from public registries, and the Official MCP Registry lists `io.github.dislop-ai/dislop` Official Cloud MCP (`https://dislop.com/mcp`).

### Track B — Dual-Published Editor Extension & Multi-Agent Fleet Orchestrators (Next)

Goal: ship one zero-dependency Web extension across both major VS Code registries and solve Git worktree handoff checks for parallel agent runners like Orca, Herdr, and Conductor.

- [x] Ship the Web-compatible extension `integrations/vscode/` around `src/core.mjs` (on-save/idle squiggles, hover before/trap/after cards, `Cmd+.` quick-ignore comments, automatic `mcpServerDefinitions` / `languageModelTools` registration, and `.vsix` attached to GitHub Releases).
- [x] Ship `integrations/antigravity/` (passing `agy plugin validate --strict` with zero warnings), `.cursor-plugin/plugin.json`, and parallel-fleet templates (`integrations/orca/orca.yaml`, `integrations/herdr/herdr-plugin.toml`, and 2-strike `integrations/hooks/dislop-gate.sh`).
- [ ] Configure publisher tokens for **VS Code Marketplace** and **Open VSX**, and submit Antigravity Partner Intake plus Cursor / Cline Marketplace PRs.

**Done when**: installing `.vsix` activates both human diagnostics and editor agent tools with zero manual JSON edits, and child Git worktrees inherit `.dislop.local.json` cleanly.

### Track C — Office Agents, Everyday Writers & Benchmark Expansion (Parallel)

Goal: expand beyond coding agent users to office agent workflows and anyone delivering docs, slides, or reports with AI while keeping reproducible benchmark coverage growing.

- [x] Ship `dislop-bench v2`: 112 core detection samples + 154 multi-angle pattern samples (`100.0%` precision/recall, `0.0%` clean FPR, `100.0%` Node/Python parity), 18 end-to-end revision tasks (`18/18` all-clear), and 5-model live cloud comparisons ([benchmarks/REPORT.md](./benchmarks/REPORT.md)).
- [ ] Reuse `src/core.mjs` to publish an offline-first **Obsidian Community Plugin** and a **Raycast Store** extension (`Check Selected Text` / `Clean Clipboard Slop`).
- [ ] Add longer real-world drafts and multi-slide executive `.pptx` benchmarks, reviewing store installs every two weeks.

**Done when**: `node scripts/run_benchmark.mjs --assert` stays green offline in CI and both Obsidian and Raycast packages pass upstream automated checks.

### Track D — `Awesome Anti-Slop` Maintenance & Split Threshold (Ongoing, Parallel)

Goal: keep the 90-entry directory accurate, neutral, and easy to filter in both English and Chinese without splitting focus.

- [x] Add GitHub Issue form templates for Awesome Anti-Slop submissions (`.github/ISSUE_TEMPLATE/awesome_submission.yml` with URL, category, locale, and one-sentence EN/ZH summaries).
- [x] Add scheduled link and GitHub repository health checks (`scripts/check_awesome_links.mjs` and weekly `.github/workflows/awesome-links.yml`).
- [ ] Keep `awesome/README.md`, `awesome/README.zh-CN.md`, and `https://dislop.com/awesome/` inside `dislop-ai/dislop` during early growth.
- [ ] **Split threshold**: spin out a standalone CC0-1.0 `dislop-ai/awesome-anti-slop` repository (`dislop.radar/3`) only once sustained external directory PRs reach `>= 5/month`, keeping `https://dislop.com/awesome/` canonical permanently.

### Track E — Eval-Driven Genre Review & Closed-Source Cloud Capabilities (`v0.7.0+`)

Market pricing benchmarks, unit economics, and repair safety boundaries live in [docs/research/business-model-and-open-core.zh-CN.md](https://github.com/dislop-ai/dislop/blob/main/docs/research/business-model-and-open-core.zh-CN.md) and [docs/research/agent-repair-boundaries-eval-and-dehedging.zh-CN.md](https://github.com/dislop-ai/dislop/blob/main/docs/research/agent-repair-boundaries-eval-and-dehedging.zh-CN.md). **Evaluate before deleting**: existing offline rules, Pocket ML, and the Python engine stay intact until the real-world held-out eval decides what to trim.

- **Open source (`dislop-ai/dislop`, Apache-2.0)**:
  - Markdown `SKILL.md` and local `./references/*.md`
  - Zero-dependency CLI with 7 built-in packs (`53` rules), 65-pattern catalog, and `14.6 KB` Pocket ML
  - Offline workbench, `Awesome Anti-Slop`, open single-step prompts, and `dislop-bench v2`
- **Closed source (`dislop-cloud`)**: Official Cloud MCP (`https://dislop.com/mcp`), multi-model pipelines, and closed-source net-gain edit evaluation (`dislop_eval` / `dislop_verify_edit`).

- [x] **Phase 0 (Live Hosted Cloud & Sign-In Gate)**: `dislop-cloud` live at `https://dislop.com/mcp` and `/api/v1/*` with sign-in-gated 30 free monthly credits and Pro / PAYGO / Team waitlist; `v0.7.0` updates CLI zero-hit output to `"no known patterns found"` and points all MCP manifests to Official Cloud MCP.
- [ ] **Real-World Held-Out Eval Set & 4-Arm Blind Comparison**: Collect and label real Chinese/English passages across narrative, argumentative, official, and engineering prose, comparing offline checks, single open prompts, pure cloud LLM, and hybrid (deterministic priors + genre LLM + guardrails) pipelines before removing any code.
- [x] **Scenario-Aware `register` Routing + Structured `revision` + CLI BYOK `review` & `doctor`**: Shipped explicit `--register` (`technical`, `official`, `argumentative`, `narrative`, `casual`, `marketing`), `getScenarioStrategy`, `registerOverrides`, structured `edit`/`rewrite`/`ask` revision guidance with fact anchors and `register-drift` guards in `verify`, strict `--format agent` output, zero-network `dislop doctor`, and opt-in BYOK `dislop review` across Node and Python.
- [ ] **Closed-Source Cloud Net-Gain Edit Eval (`dislop_eval` / `dislop_verify_edit`) & Zero-Training Calibration**: Score `Before vs. After` edits on atomic fact precision/recall and swapped-order cross-provider pairwise checks, calibrating exclusively on private adversarial sets, synthetic damage fixtures, opt-in user error reports, and human gold-standard Kappa while keeping user drafts 0-training.
- [ ] **Regional Multi-Provider Routing & Format-Preserving `.docx` / `.pptx` Cleanup**: Route across regional paid model APIs that do not train on your text, and preserve Office styles, masters, numbers, and bounding qualifiers.
- [ ] **Visual Multimodal Audit & Team Brand Voice Libraries**: Headless screenshot rendering + VLM layout critique alongside shared `dislop.voice/1` team profiles.

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

Open design questions live in [GitHub Discussions](https://github.com/dislop-ai/dislop/discussions). Concrete tasks, false positives, and Awesome submissions live in [Issues](https://github.com/dislop-ai/dislop/issues) grouped by `track:*`, `area:*`, and `priority:*` labels across milestones (`v0.6.1`, `v0.7.0`, `v0.8.0`). Live task status stays in Issues (this roadmap updates on releases and major milestones so we avoid keeping two task lists).

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
