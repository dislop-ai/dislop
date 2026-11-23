<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/banner-dark.svg">
    <img src="./assets/banner-light.svg" alt="dislop — Cutting AI slop is real productivity." width="100%">
  </picture>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="https://dislop.com">Try it at dislop.com</a> ·
  <a href="https://dislop.com/en/guides/">Guides</a> ·
  <a href="https://dislop.com/en/rules/">Rule Catalog</a> ·
  <a href="./awesome/README.md">Awesome Anti-Slop</a> ·
  <a href="https://www.npmjs.com/package/dislop">npm</a> ·
  <a href="https://pypi.org/project/dislop/">PyPI</a> ·
  <a href="https://x.com/dislop_ai">X (@dislop_ai)</a> ·
  <a href="./LICENSE">Apache-2.0</a>
</p>

**Cutting AI slop is real productivity.** `dislop` is a linter for AI slop. It catches AI-sounding text and template layouts in docs, web pages, and slides before you send them. Its rules come from vetted community projects and corpus findings, and the repo keeps a list of 90 related tools.

It comes in three parts:

- **Markdown-only Skill**: genre reference cards with zero scripts.
- **Open-source CLI & editor plugins**: offline checks across Markdown, HTML/CSS/JSX/SVG, PNG/JPEG/WebP/GIF, Word, PowerPoint, and PDF slides.
- **Official Cloud MCP & Web Workbench** (`https://dislop.com/mcp`): multi-model review by genre without local setup.

Here is a short launch note straight from a model:

```text
Certainly! Here is the launch note. It's worth noting that exports are a game-changer, finishing in up to 12 minutes for workspaces above 500,000 rows.
```

`dislop check launch-note.md` flags three things:

```text
[ERROR]   launch-note.md:1:1   chatbot-artifact           "Certainly! Here is"
[WARNING] launch-note.md:1:37  en-throat-clearing-opener  "It's worth noting that"
[INFO]    launch-note.md:1:75  en-cliche-lexicon          "game-changer"
```

If you rewrite it into a second-order AI slogan (`This isn't just an upgrade — it's a new standard.`), running `dislop check` catches that too. Clean it up into plain prose and `dislop check` exits `0`.

<p align="center">
  <img src="./assets/demos/proof-cycle-en-v2.gif" alt="dislop checking a launch note across 3 states: flagging chatbot artifact and filler, catching a second-order slogan, and passing with exit 0" width="840">
</p>

It inspects Markdown, plain text, HTML/CSS/JSX/SVG, PNG/JPEG/WebP/GIF images, Word (`.docx`), PowerPoint (`.pptx`), and PDF slides (`.pdf`). The open-source CLI and local plugins run offline with zero uploads, bundling all **7 built-in packs (`53` rules)** and extended structural checks. Zero hits only means no known pattern matched—it does not prove deep content quality.

For hosted review, sign in at [dislop.com](https://dislop.com) or connect Official Cloud MCP (`https://dislop.com/mcp`): `dislop_review` returns structured issues and edit guidance for your local agent to revise in project context.

## Quick start

### Node.js 20+ (npm, zero dependencies, all 7 packs bundled offline)

```bash
# 1. Check the current folder (exits 1 on core AI artifact errors; prints cliché warnings)
npx --yes dislop check .

# 2. Inspect a rule's check question and Before / Fallback / Clean examples
npx --yes dislop explain negation-pivot-frame

# 3. Check only lines changed against main and emit GitHub PR annotations
npx --yes dislop check --changed origin/main --format github
```

<details>
<summary>More CLI commands (deep checks, review, verify, personal style, Python)</summary>

```bash
# Deep inspection (auto-routed pack + scenario register + rhythm stats + Pocket ML + pattern banks, compact JSON)
npx --yes dislop check draft.md --pack auto --register argumentative --deep --profile --compact --json

# Multi-signal BYOK review, scenario-aware anti-degradation check, three-layer doctor, and offline voice card
npx --yes dislop review draft.md --register casual
npx --yes dislop verify --git HEAD draft.md --register casual
npx --yes dislop doctor
npx --yes dislop voice my-notes.md

# Python 3.10+ (PyPI, zero dependencies)
uvx dislop check quarterly-review.pptx
pip install dislop && dislop check .
```

</details>

<p align="center">
  <img src="./assets/demos/cli-check-en-v2.gif" alt="dislop CLI offline check failing with exit code 1 on draft and passing with exit code 0 after cleanup" width="840">
</p>

### Apply review suggestions

Open the Vim picker for a local draft, or save a JSON review and apply selected edits later.

```sh
dislop review draft.md --offline --interactive-apply
dislop review draft.md --offline --json > review.json
dislop apply --review-file review.json --source-file draft.md --include 2,5
```

Use the `edit.id` values in your report. To apply every available edit except one, use `--all --exclude 3`. In Vim, move with `j`/`k` or the arrow keys, accept with `y`, reject with `n`, and press Enter to write your choices. Press `q` to discard them. Items that need a source or a writer’s judgment appear as advice. Batch apply runs without Vim. Both commands apply edits to supported UTF-8 text files, including Markdown and HTML. If the file has changed since review, generate a fresh report.

## AI artifacts vs. style warnings

Auto-rewriters often trade one AI cliché for another or flatten your voice into a generic template. Flat banned-word lists also cause false alarms on ordinary nouns (`Delve` debugger, `wool tapestry`).

`dislop` splits its 53 rules across 7 bundled packs into two layers:

1. **AI delivery artifacts (`packs/core/`, `severity: error`, always on)**: Clear leftovers from AI generation—stray chatbot greetings (`Certainly! Here is...`, `[oaicite:1]`), unfilled `[insert ...]` / `{{var}}` / `[TBD]` placeholders, raw Markdown asterisks pasted unrendered into `.docx`/`.pptx`, and dead `<a href="#">` placeholder buttons.
2. **Built-in scenario & vertical packs (`warning` / `info`, advisory by default, 0 network downloads)**: `business-brief`, `engineering-spec` (PR diff parrots, shallow root causes, unowned action items), `regulated-comms` (unsubstantiated superlatives, unanchored `"10x faster"` multipliers), `literary-essay`, `deck-and-ui`, and `executive-deck` (process-only slide titles, 4+ consecutive identical slide skeletons). Each rule includes a check question, before / still sounds like AI / after examples, and automated hit/clean tests.

## What it reads

Both the Node.js CLI (`bin/dislop.mjs`) and the Python CLI (`src/dislop/`) run with zero external runtime dependencies and pass the same conformance suite (`tests/test_conformance.py`).

| What you bring | Extensions | What `dislop` catches | Known boundary |
|---|---|---|---|
| Drafts & docs | `.md`, `.mdx`, `.txt` | AI artifacts + throat-clearing openers, `"Not X, but Y"` pivots, staccato slogan runs, bureaucratic padding, four-character triads, moralizing endings, unsourced claims, bold-lead bullet walls, em-dash overuse, half-width CJK punctuation | Code blocks, inline code, URLs, blockquotes, and `dislop-quote` blocks are masked for style rules |
| Web pages, SVG & UI | `.html`, `.css`, `.jsx`, `.tsx`, `.svg` | Dead `<a href="#">` placeholder links, unexplained `<button disabled>`, purple-pink AI gradients (incl. SVG gradients), `blur-3xl` glow orbs, pulsing dots, emoji chrome, icon-tile grids, fake window dots, `01/02/03` kickers, pill soup, 3-level nested boxes, missing `viewBox`, overlapping `<text>`, orphaned `<defs>` | Static per-file inspection; runtime DOM state still needs browser tests |
| Raster images | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` | Unstripped A1111/ComfyUI workflow prompt parameters (`warning`), C2PA/IPTC AI provenance tags (`info`, keeping required legal disclosures), and PNG/GIF dark-neon purple or plastic oversaturated palette heuristics | Pixel heuristics require uncompressed 8-bit PNG (`>= 64x64`) or GIF frame 0 (`>= 64x64`); JPEG/WebP inspect metadata only |
| Word | `.docx` | Joined `<w:t>` runs, raw Markdown asterisks pasted from chat, and prose slop rules (`para N`) | Reports paragraph number rather than rendered page number |
| PowerPoint & PDF | `.pptx`, `.pdf` | Slide order (`p:sldIdLst`), raw Markdown, landscape slide word-walls (`> 120` words / `> 280` Han chars), bullet caps (`> 6`), `<a:normAutofit>` shrink (`< 80%`), generic/process titles, layout monotony, multi-page raster-only PDFs, collapsed type scales (`< 1.2x` or `< 9.5pt`), purple RGB shadings | Portrait PDFs exempt from slide rules; encrypted PDFs report `[SKIP]` honestly; not a generic PDF/X print preflight |

<table>
  <tr>
    <td width="50%" align="center">
      <img src="./assets/demos/workbench-live-en-v2.gif" alt="dislop.com offline browser workbench checking original draft, 2nd-order slop, and clean copy" width="100%"><br>
      <sub>Offline browser workbench in action</sub>
    </td>
    <td width="50%" align="center">
      <img src="./assets/demos/ui-slop-en-v2.gif" alt="Auditing AI gradient, pill wall, and dead href='#' control before switching to a plain 1px sheet" width="100%"><br>
      <sub>UI template slop audit before and after</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="./assets/demos/deck-office-en-v2.gif" alt="dislop auditing quarterly-review.pptx for raw markdown leaks, word walls, 68% autofit shrink, and process titles" width="840"><br>
      <sub>PowerPoint (.pptx) audit: raw markdown, word walls, autofit shrink, and process titles</sub>
    </td>
  </tr>
</table>

## Guides, Rule Catalog & Awesome Anti-Slop

Beyond the CLI, this repository compiles into a full reference library at `dislop.com`:

- **[Rule Catalog (53 rules)](https://dislop.com/en/rules/)**: Every built-in rule with its Deletion Test question, Before / Fallback / Clean examples, and one-line citation links for PR reviews.
- **[Practical Guides](https://dislop.com/en/guides/)**: [What is AI slop](https://dislop.com/en/guides/what-is-ai-slop/) · [Remove AI slop from writing](https://dislop.com/en/guides/remove-ai-slop-writing/) · [Fix AI slop in web UI](https://dislop.com/en/guides/fix-ai-slop-web-ui/) · [Clean up PPTX & DOCX](https://dislop.com/en/guides/deslop-pptx-docx/) · [Agent, CLI & CI setup](https://dislop.com/en/guides/agent-cli-mcp-tutorial/) · [Linter vs. detector vs. skill](https://dislop.com/en/guides/linter-vs-detector-vs-skill/).
- **[Awesome Anti-Slop (90 tools)](./awesome/README.md)** ([Chinese edition](./awesome/README.zh-CN.md) · [Interactive web filter](https://dislop.com/en/awesome/)): Verified linters, writing skills, UI rules, PR policies, and papers ([index.json](https://dislop.com/awesome/index.json) · [index.md](https://dislop.com/awesome/index.md)).
- **Submit a sample**: Found a classic AI-slop phrase, template card, or messy slide? [Submit a redacted sample](https://github.com/dislop-ai/dislop/issues/new?template=slop_sample.yml) so it can inform future fixtures.

## Use it across agents, editors, and CI

| Surface | One-liner or 1-click install | What you get |
|---|---|---|
| **Any AI chat** | Paste: `Read https://dislop.com/llms.txt and apply its anti-slop rules and checks before delivering my next draft.` | Zero install; reads the `~2.4 KB` index, task guides (`/tasks/*.md`), or atomic rule cards (`/rules/<id>.md`) |
| **Agent Skill (75+ hosts)** | `npx skills add dislop-ai/dislop` | Installs pure-Markdown [skills/dislop/SKILL.md](./skills/dislop/SKILL.md) + 4 local reference cards (`0` bundled scripts, `0` network calls); guides local CLI checks when a shell exists |
| **Claude Code Plugin** | `/plugin marketplace add dislop-ai/dislop` then `/plugin install dislop@dislop-ai` | Bundles pure-doc Skill + Official Cloud MCP connection (`~130` always-on tokens) |
| **OpenAI Codex Plugin** | `codex plugin marketplace add dislop-ai/dislop` then `codex plugin add dislop@dislop-ai` | Ships native UI card metadata ([openai.yaml](./skills/dislop/agents/openai.yaml)) and `$dislop` trigger |
| **Gemini CLI Extension** | `gemini extensions install https://github.com/dislop-ai/dislop` | Connects Official Cloud MCP `https://dislop.com/mcp` via [gemini-extension.json](./gemini-extension.json) |
| **Official MCP Registry** | Search `io.github.dislop-ai/dislop` on `registry.modelcontextprotocol.io` | Lists the Official Cloud MCP endpoint `https://dislop.com/mcp` (Streamable HTTP) |
| **VS Code / Cursor 1-Click MCP** | [Install in VS Code (Cloud MCP)](https://vscode.dev/redirect/mcp/install?name=dislop&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fdislop.com%2Fmcp%22%7D) · [Install in Cursor (Cloud MCP)](cursor://anysphere.cursor-deeplink/mcp/install?name=dislop&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHBzOi8vZGlzbG9wLmNvbS9tY3AifQ==) | Opens the editor's native confirmation dialog without manual JSON edits |
| **GitHub Action / `pre-commit`** | Reference `uses: dislop-ai/dislop@main` ([action.yml](./action.yml) and [.pre-commit-hooks.yaml](./.pre-commit-hooks.yaml)) | Gates modified lines in PRs with inline annotations or SARIF 2.1.0 |

<p align="center">
  <img src="./assets/demos/agent-workflow-en-v2.gif" alt="Coding Agent and CI loop: reading pure-Markdown SKILL.md, gating PR diff with exit code 1, and passing dislop verify" width="840"><br>
  <sub>Agent + CI closed loop: Skill before drafting, diff gate before commit, verify after edits</sub>
</p>

### Connect Official Cloud MCP (`Claude Code`, `Codex`, `Cursor`, `WorkBuddy`, `Claude Cowork`)

```json
{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "https://dislop.com/mcp",
      "headers": {
        "Authorization": "Bearer dslp_your_token_here"
      }
    }
  }
}
```

Official Cloud MCP (`https://dislop.com/mcp`, auto-discovery card at `https://dislop.com/.well-known/mcp/server-card.json`) exposes `dislop_check`, `dislop_verify`, and `dislop_rules` at 0 credits without login. Signing in via OAuth 2.1 or claiming a free Bearer key at [dislop.com](https://dislop.com/#cloud-token-box) unlocks 30 monthly credits for `dislop_review` (1 credit), `dislop_deslop` (2 credits), `dislop_office` (2–3 credits for `.docx`/`.pptx`), `dislop_visual_review` (2 credits), and `dislop_voice_extract` (2 credits).

## Configure it, or overrule it

Settings load in order from `~/.config/dislop/config.json` (plus optional personal style card `voice.json`), project `.dislop.json`, and Git-ignored `.dislop.local.json`. Run `dislop init` to create `.dislop.json`:

```json
{
  "failOn": "error",
  "ignore": ["vendor/**", "dist/**"],
  "overrides": [
    { "files": ["docs/**/*.md"], "pack": "business-brief" },
    { "files": ["essays/**/*.md"], "pack": "literary-essay" },
    { "files": ["site/**/*.{html,css,svg}"], "pack": "deck-and-ui" }
  ],
  "allow": ["Delve", "Bayeux Tapestry"],
  "rules": {
    "bold-lead-list-wall": "info"
  }
}
```

For a narrow one-off exception, add a reason above the line (`--report-unused` flags stale comments):

```markdown
<!-- dislop-ignore-next-line en-cliche-lexicon -- quoting vendor press release verbatim -->
```

### Install once locally (true air-gapped / fast hooks)

```bash
# Node.js 20+ (published on npm, < 250 KB tarball, zero network after install)
npm install -g dislop
dislop check .

# Or Python 3.10+ (published on PyPI, zero external dependencies)
pip install dislop
dislop check .
```

### Open-Source Local (`Skill` + `CLI`) vs. Official Cloud (`dislop.com/mcp`)

- **Open Source (`dislop-ai/dislop`, Apache-2.0)**: Pure-Markdown `SKILL.md` + local `./references/*.md` (no bundled scripts), zero-dependency Node/Python CLI (`check`, `patterns`, `voice`, `explain`, `packs`, `catalog`, `resources`), all 7 built-in packs (`53` rules) + 65-pattern catalog (`patterns/`), bundled `14.6 KB` gzip (`49.0 KB` raw) Pocket ML ensemble (`models/pocket-slop-v1.json`, `< 0.5 ms`, `100.0%` F1 / `0.0%` Clean FPR on `stealth-vapor-v1`), `Awesome Anti-Slop`, and `dislop-bench v2` + `visual-design-v1`. `check` / `patterns` / `voice` make `0` network calls so private drafts never leave your machine (existing `--mcp` and optional local-model modules stay in-repo during real-world evaluation).
- **Official Cloud MCP & Web Workbench (`https://dislop.com/mcp`, `https://dislop.com/?lang=en#pricing`)**: Closed-source hosted backend calling paid-tier Google Gemini endpoints that do not train on your text (no draft storage or text logging; see [privacy.md](https://dislop.com/privacy.md)). Deterministic `dislop_check`, `dislop_verify`, and `dislop_rules` run at 0 credits without login; OAuth 2.1 or a free key unlocks **30 monthly credits** for `dislop_review` (1 credit), `dislop_deslop` (2 credits), `dislop_office` (2–3 credits), `dislop_visual_review` (2 credits), and `dislop_voice_extract` (2 credits, `dislop.voice/1`), with early-access waitlists for Pro (`$12/mo`, 1,500 credits), PAYGO (`$10 / 800 credits`), and Team (`$29/seat/mo`).

## Anti-slop benchmark (`dislop-bench v2`)

Run the full offline benchmark (`112` cross-modality detection samples across Node & Python + `18` end-to-end writing and design tasks comparing raw AI, naive humanizers, and `dislop`-guided revisions):

```bash
node scripts/run_benchmark.mjs --assert
```

Latest baseline on our own benchmark ([benchmarks/REPORT.md](./benchmarks/REPORT.md) and [benchmarks/PATTERN-BENCHMARK.md](./benchmarks/PATTERN-BENCHMARK.md)):

- **Core Detection (`Suite A`, 112 samples = 48 v1 + 16 `holdout-v1` + 48 `text-hard-v2`)**: Precision `100.0%` · Recall `100.0%` · Clean FPR `0.0%` · Adversarial Near-Miss FPR `0.0%` · 2nd-Order Trap Recall `100.0%` · Node/Python Rule & Statistical Profile Parity `100.0%`.
- **Multi-Angle Pattern Benchmark (`154` samples = 48 + 16 + 62 `pattern-challenge-v2` + 28 `holdout-v2`)**: Precision `100.0%` · Recall `100.0%` · F1 `100.0%` · Clean FPR `0.0%` · Node/Python Parity `100.0%`.
- **Bundled Pocket ML (`stealth-vapor-v1`, 24 paired samples; 36 blind eval with holdouts)**: `14.6 KB` gzip (`49.0 KB` raw), `< 0.5 ms`, `100.0%` F1, `0.0%` Clean FPR.
- **End-to-End Revision (`Suite B`, 18 tasks = 12 `revision-v1` + 6 `revision-hard-v2`, weights `D1=45 / D2=20 / D3=25 / D4=10`)**: `raw_ai` **60.8 / 100** → `naive_humanizer` **70.8 / 100** (doubles 3rd-order slop and drops or invents numbers) → reference edits written to `dislop`'s rules **100.0 / 100** (`18/18` all-clear).
- **Live 5-model comparison ([benchmarks/MODEL-COMPARISON.md](./benchmarks/MODEL-COMPARISON.md))**: Across `Gemini 3.1/3.5 Flash-Lite`, `Gemini 3.5/3.8 Flash`, and `Qwen 3.8 Flash`, bare prompts averaged `76.0–84.2 / 100` (`2/10–4/10` all-clear on the 10-task `revision-v1` live subset), while the `dislop` re-checked cloud pipeline lifted every model by **+15.8 to +22.3 points** (`97.0–100.0 / 100`, `8/10–10/10` all-clear; `Gemini 3.1 Flash-Lite` reached `98.5 / 100` in `1.2s` at `~$0.09 / 1k calls`).

See [benchmarks/README.md](./benchmarks/README.md) to score your own model, Skill, or cloud endpoint (`--eval`) or export randomized blind human A/B review sheets (`--export-blind-sheet`).

## dislop checks dislop

GitHub Actions CI runs `dislop pack-test` (164 fixture assertions in both Node and Python), 26 Python `unittest` conformance and engine tests across 4 modules (`test_conformance`, `test_engine`, `test_pattern_library`, `test_pocket_and_local_models`), pattern catalog checks (`node scripts/pattern_lab.mjs verify` and `assert`), and site checks (`tests/test_site.mjs`). It also runs `dislop check . --fail-on warning` across this repository's docs, `awesome/`, and `site/`.

## Docs & layout

- [Product Brief](./PRODUCT.md) · [Brand & Voice Guide](./docs/brand-and-voice-guide.md) ([zh-CN](./docs/brand-and-voice-guide.zh-CN.md))
- [Architecture](./docs/architecture.md) ([zh-CN](./docs/architecture.zh-CN.md)) · [Design System](./docs/design-system.md) ([zh-CN](./docs/design-system.zh-CN.md))
- [Roadmap](./ROADMAP.md) ([zh-CN](./ROADMAP.zh-CN.md)) · [Releasing](./docs/releasing.md) · [Contributing](./CONTRIBUTING.md) · [Research Index](./docs/research/README.md) · [Changelog](./CHANGELOG.md)

```text
dislop/
├── .agents/plugins/   # OpenAI Codex marketplace manifest (marketplace.json)
├── .claude-plugin/    # Claude Code plugin & marketplace manifests (pure-doc Skill + Official Cloud MCP)
├── .codex-plugin/     # OpenAI Codex native plugin manifest & UI card metadata
├── plugin.json        # Agent Plugins 1.0 portable manifest (paired with root mcp.json)
├── gemini-extension.json # Gemini CLI Extension Gallery manifest
├── server.json        # Official MCP Registry manifest (Official Cloud HTTP MCP)
├── action.yml         # Reusable GitHub Marketplace incremental check Action
├── awesome/           # Awesome Anti-Slop (README.md & README.zh-CN.md, 90 entries)
├── benchmarks/        # Offline anti-slop benchmark datasets (CC0-1.0) & reproducible reports
├── bin/               # Node.js CLI (dislop.mjs) and compatibility launcher (dislop-mcp.mjs)
├── src/
│   ├── core.mjs       # Zero-dep ES module shared by Node CLI, MCP, and browser workbench
│   ├── pattern-engine.mjs # Multi-angle 12-probe extended pattern-bank scanner
│   ├── pocket-model.mjs# Bundled 14.6 KB gzip zero-dep Pocket ML ensemble & domain pack router
│   ├── local-model.mjs# Hardware-aware optional local small-model advisor (Node.js)
│   ├── binary-node.mjs# Zero-dep ZIP, PNG/JPEG/WebP/GIF, and PDF reader for Node.js
│   └── dislop/        # Zero-dep Python 3.10+ engine, pattern scanner, local-model advisor, CLI, and MCP
├── packs/             # Declarative dislop.pack/2 manifests (7 built-in packs, 53 rules, 214 fixtures)
├── patterns/          # Structured 65-pattern anti-slop catalog across 6 dimensions & 7 angles
├── skills/dislop/     # Cross-host Agent Skill (SKILL.md + local ./references/ + openai.yaml)
├── tests/             # 26 Python unittest tests, Node/Python conformance, and site tests
├── scripts/           # Manifest lockstep sync (sync_manifests.mjs), site compiler & benchmarks
├── site/              # Compiled dislop.com workbench, /awesome/, and /llms.txt pages
├── assets/            # Logo mark, light/dark banners, and 1200x630 social preview card
└── docs/              # Brand guide, architecture, design system, roadmap, and research
```

## License

[Apache License 2.0](./LICENSE)

<!-- mcp-name: io.github.dislop-ai/dislop -->
