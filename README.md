# dislop

**Cutting AI slop is real productivity.**

`dislop` is a pluggable editorial and artifact linter built on a zero-dependency Node.js (`>= 20`) micro-kernel. It audits Markdown, plain text, HTML/CSS/JSX/TSX/SVG, Word (`.docx`), PowerPoint (`.pptx`), PDF, and raster images before publication, separating objective delivery **Defects** from non-blocking editorial **Suggestions**.

See [docs/architecture.md](./docs/architecture.md) for the full kernel lifecycle and security invariants, and [docs/MIGRATION-TODO.md](./docs/MIGRATION-TODO.md) for pending repository extraction items.

## Core Design

1. **Micro-Kernel + Stage-Gated Packs (`dislop/sdk`)**:
   - The kernel owns document coordinate parsing (`DocumentModel`), immutable safety and prompt-injection invariants, the Dual Post-LLM Fact Gate, 3-Tier LLM routing, lossless coordinate patching, and CI exit-code arbitration.
   - Rules live in modular Packs under `packs/<scope-or-lang>/<scenario>/{pack.json,scripts/,prompts/}` (`common/*` structural checks + `en/*` and `zh/*` language packs across `artifact-qa`, `prose`, `web-ui`, and `slide-deck`), where `scripts/` and `prompts/` are loaded lazily on demand.
2. **Dual-Track Taxonomy (`Defect` vs. `Suggestion`)**:
   - **Prose never breaks CI**: Editorial anti-slop findings are `Suggestion`s (`strong | moderate | hint`) and always return **Exit Code `0`** (mapped to `"note"` in SARIF).
   - **Objective delivery bugs fail CI**: Unfilled `[TODO]` placeholders, stray chatbot wrappers, broken local links, and raw Markdown leaked into `.docx`/`.pptx` are `Defect`s (`error | warning`) emitted strictly by deterministic `scripts/` hooks. Only unresolved `Defect: error` returns **Exit Code `1`**.
3. **Local-First Privacy with 3-Tier Semantic Upgrade**:
   - Runs locally with zero external uploads by default (`--engine local`), using deterministic Pack scripts plus an optional Tier 3 local model (`dislop model pull`).
   - Opt into `--engine auto`, `--engine cloud` (`dislop login`), or `--engine byok` (OpenAI-compatible, Anthropic, Gemini, local proxies, Ollama/vLLM) guarded by a first-run host consent gate (`privacy-gate.mjs`).
4. **Dual Post-LLM Fact & Anti-Injection Gate**:
   - Every proposed replacement is verified to preserve numbers, units, percentages, URLs, inline code spans, and proper nouns—while blocking fabricated numbers, injected URLs, or injected code spans and running custom `verifyFix()` hooks.

## Quick Start

```bash
# 1. Read-only check (local by default, zero network upload)
npx --yes dislop check README.md

# 2. Compact output for coding and writing agents
npx --yes dislop check docs/ --format agent

# 3. Interactive hunk-by-hunk review in terminal (y/n/e/p/a/A/s/u/q)
npx --yes dislop fix draft.md

# 4. Non-interactive batch cleanup of verified deterministic 'safe' items
npx --yes dislop fix draft.md --auto --backup

# 5. Verify a revised draft preserved all facts against git HEAD
npx --yes dislop verify --git HEAD draft.md
```

## CLI Reference

```text
dislop check <files/globs...> [options]     Read-only Dual-Track audit
dislop fix <files/globs...> [options]       Interactive TTY hunk loop, or batch safe fixes (--auto)
dislop verify <before> <after> [--json]     Verify edits preserved facts, units, links, and entities
dislop verify --git [ref] <file> [--json]   Verify working-tree edits against a Git revision
dislop init [--global] [--voice <glob>]     Initialize .dislop.json or ~/.config/dislop/config.json
dislop login [--token <dslp_*>]             Save Official Cloud credentials
dislop logout                               Remove Official Cloud credentials
dislop voice <extract|show|clear> [files]   Manage personal voice profile (voice.json)
dislop model <list|pull|rm> [name]          Manage Tier 3 local models
dislop packs [--json]                       List built-in multi-level Packs
dislop doctor [--json]                      Diagnose active routing tier, auth, config, and Packs
dislop mcp                                  Start local stdio MCP server (also `dislop-mcp`)
```

## Configuring an LLM Provider (`~/.config/dislop/config.json` or `.dislop.json`)

```json
{
  "routing": "byok",
  "activeProvider": "openai-default",
  "approvedHosts": ["api.openai.com"],
  "providers": {
    "openai-default": {
      "protocol": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "model": "gpt-4o-mini",
      "structuredOutput": "json_schema",
      "maxInputTokens": 16000
    },
    "local-ollama": {
      "protocol": "openai",
      "baseUrl": "http://127.0.0.1:11434/v1",
      "apiKey": "ollama",
      "model": "qwen2.5:7b",
      "structuredOutput": "json_object",
      "maxInputTokens": 8000
    }
  }
}
```

## Authoring Custom Packs

### Separated Pack Directory (`pack.json` + `scripts/` + `prompts/`)

- `pack.json`: declares `name`, `version`, `description`, `languages`, and `formats`.
- `scripts/index.mjs`: exports `definePackScripts({ check, verifyFix })` from `dislop/sdk` (loaded lazily in Step 3 / Step 5).
- `prompts/rules.md`: declares trigger conditions, false-positive boundaries, and fix suggestions in pure Markdown (loaded lazily in Step 4 only when an LLM engine is active).

### Single-File Zero-Code Markdown Pack (`academic-en.pack.md`)

```markdown
---
name: academic-en
languages: [en]
formats: [md, txt, docx]
rules:
  - id: throat-clearing
    priority: strong
  - id: vague-attribution
    priority: moderate
---

1. **throat-clearing**: Fires when a paragraph opens with a meta-announcement ("In this section, we will discuss...") whose scope is already established by the heading. Fix suggestion: remove the meta-announcement and open directly on the claim.
2. **vague-attribution**: Fires on unanchored authority claims ("Studies have shown", "Many experts argue") lacking a named source. Fix suggestion: cite the specific study, author, or empirical dataset.
```

Run it directly:

```bash
dislop check paper.md --pack ./academic-en.pack.md --engine byok
```

## License

[Apache-2.0](./LICENSE)
