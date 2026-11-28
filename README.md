# dislop

English | [Chinese (zh-CN)](./README.zh-CN.md)

**Cutting AI slop is real productivity.**

`dislop` is a pluggable editorial and artifact linter built on a zero-dependency Node.js (`>= 20`) micro-kernel. It audits Markdown, plain text, HTML/CSS/JSX/TSX/SVG, Word (`.docx`), PowerPoint (`.pptx`), PDF, and raster images before publication, separating objective delivery **Defects** from non-blocking editorial **Suggestions**.

See [docs/architecture.md](./docs/architecture.md) for the full kernel lifecycle, [CONTRIBUTING.md](./CONTRIBUTING.md) for custom Pack authoring, [slop-samples/](./slop-samples/) for language-specific test samples (`en.md`, `zh-CN.md`), and [docs/MIGRATION-TODO.md](./docs/MIGRATION-TODO.md) for pending repository extraction items.

## Core Design

1. **Micro-Kernel + Stage-Gated Packs (`dislop/sdk`)**:
   - The kernel owns document coordinate parsing (`DocumentModel`), immutable safety and prompt-injection invariants, the Dual Post-LLM Fact Gate, 3-Tier LLM routing, lossless coordinate patching, and CI exit-code arbitration.
   - Rules live in modular Packs under `packs/<scope-or-lang>/<scenario>/{pack.json,scripts/,prompts/}` (`common/*` structural checks + `en/*` and `zh/*` language packs across `artifact-qa`, `prose`, `web-ui`, and `slide-deck`), where `scripts/` and `prompts/` are loaded lazily on demand.
2. **Dual-Track Taxonomy (`Defect` vs. `Suggestion`)**:
   - **Prose never breaks CI**: Editorial anti-slop findings are `Suggestion`s (`strong | moderate | hint`) and always return **Exit Code `0`** (mapped to `"note"` in SARIF).
   - **Objective delivery bugs fail CI**: Unfilled `[TODO]` placeholders, stray chatbot wrappers, broken local links, and raw Markdown leaked into `.docx`/`.pptx` are `Defect`s (`error | warning`) emitted strictly by deterministic `scripts/` hooks. Only unresolved `Defect: error` returns **Exit Code `1`**.
3. **Local-First Privacy with 3-Tier Semantic Upgrade**:
   - Runs locally with zero external uploads by default (`--engine local`), using deterministic Pack scripts plus an optional Tier 3 local model (`dislop model pull`, powered by [Ollama](https://ollama.com); if Ollama is not installed, `dislop` falls back to offline deterministic rules and notes how to install it).
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

## Execution Tiers on `slop-samples/en.md`

All outputs below were captured verbatim against [slop-samples/en.md](./slop-samples/en.md) (for Chinese anti-slop use cases on [slop-samples/zh-CN.md](./slop-samples/zh-CN.md), see [README.zh-CN.md](./README.zh-CN.md)).

### Baseline: Deterministic Script Packs (`--no-llm`, 0 tokens, offline)

Runs only Pack `scripts/` hooks (`prompts/` are never loaded). Catches objective delivery `DEFECT`s (`[oaicite:1]`, `[Company Name]`, `[TODO: ...]`, empty/dead links, assistant wrappers) and self-contained syntactic `SUGGESTION`s in milliseconds:

```bash
dislop check slop-samples/en.md --no-llm --format agent
```

```text
# dislop file=slop-samples/en.md engine=deterministic defects=8 suggestions=6
[P1-S1|L1] DEFECT(error,safe) en/artifact-qa/chatbot-artifact
  quote: "Certainly! Here is a polished draft of your Q3 database migration postmortem."
  reason: Conversational English assistant wrapper left in the deliverable; safe to delete.
  fix: DELETE
[P3-S2|L5] DEFECT(error,safe) common/artifact-qa/chatbot-citation-leak
  quote: "[oaicite:1]"
  reason: Internal AI search/citation token leaked into output text.
  fix: DELETE
[P3-S2|L5] DEFECT(error,manual) en/artifact-qa/unfilled-placeholder
  quote: "[Company Name]"
  reason: Unfilled English template placeholder or dummy Latin copy left in deliverable.
  prompt: Supply the real copy in place of '[Company Name]', or delete the unfinished sentence.
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/unfilled-placeholder
  quote: "[TODO: confirm incident owner]"
  reason: Unfilled developer or template token left in deliverable.
  prompt: Replace '[TODO: confirm incident owner]' with the real value before publishing, or remove the unfinished sentence.
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/empty-link-target
  quote: "[on-call runbook]()"
  reason: Link has an empty destination URL.
  prompt: Provide a valid destination URL or unwrap the link.
[P12-S1|L20] DEFECT(error,safe) en/artifact-qa/chatbot-artifact
  quote: "I hope this helps!"
  reason: Conversational English assistant wrapper left in the deliverable; safe to delete.
  fix: DELETE
[P12-S2|L20] DEFECT(error,safe) en/artifact-qa/chatbot-artifact
  quote: "Let me know if you'd like any further adjustments."
  reason: Conversational English assistant wrapper left in the deliverable; safe to delete.
  fix: DELETE
[P5-S2|L9] DEFECT(warning,manual) common/artifact-qa/placeholder-dead-link
  quote: "[incident timeline](#)"
  reason: Placeholder non-navigating link target '#'.
  prompt: Wire a real destination URL or use a <button type="button"> control.
[P3-S1|L5] SUGGESTION(strong,safe) en/prose/hollow-transition
  quote: "In today's rapidly evolving digital landscape, infrastructure reliability is a top priority."
  reason: Zero-information macro filler sentence; deleting it preserves all factual claims and causal links.
  fix: DELETE
[P4-S1|L7] SUGGESTION(strong,safe) en/prose/throat-clearing
  quote: "It is worth noting that PostgreSQL p95 query latency dropped from 142ms to 18ms across 4 read replicas in `{{cluster_region}}`."
  reason: Removes zero-information throat-clearing opener so the sentence opens directly on the claim.
  fix: "PostgreSQL p95 query latency dropped from 142ms to 18ms across 4 read replicas in `{{cluster_region}}`."
[P5-S1|L9] SUGGESTION(strong,review) en/prose/unprompted-negation
  quote: "This isn't just a configuration tweak — it's a new reliability baseline for our checkout pipeline."
  reason: Formulaic 'Not just X — it's Y' contrast shell; state the actual point directly without theatrical negation.
  fix: "It is a new reliability baseline for our checkout pipeline."
[P11-S1|L18] SUGGESTION(strong,safe) en/prose/hollow-transition
  quote: "Looking ahead, the possibilities are truly endless."
  reason: Zero-information macro filler sentence; deleting it preserves all factual claims and causal links.
  fix: DELETE
[P4-S2|L7] SUGGESTION(moderate,review) en/prose/rhetorical-self-qa
  quote: "Why does this matter?"
  reason: Removes mechanical assistant rhetorical bridge question so the answer states the point directly.
  fix: DELETE
[P6-S1|L11] SUGGESTION(hint,manual) en/prose/bold-lead-list-wall
  quote: "**Faster Failover**: Automated promotion finished in 9 seconds during chaos drills."
  reason: Four or more consecutive '**Label**: description' list items create a mechanical assistant list wall.
  prompt: Convert uniform bold-lead bullets into direct sentences or plain list items without bold title prefixes.
```

### Tier 1: Official Cloud (`--engine cloud`)

```bash
dislop login --token dslp_...
dislop check slop-samples/en.md --engine cloud --format agent
```

> **Status:** Official Cloud backend support for the `dislop.report/1` micro-kernel contract is currently under construction; sample output will be added once the hosted endpoint is live.

### Tier 2: BYOK / OpenAI-Compatible Endpoint (`--engine byok`)

Combines deterministic `DEFECT` detection with frontier semantic `SUGGESTION` analysis—catching unchosen `Option A / Option B` branches (`[P10-S1|L16]`), disguised prose placeholders (`Mention the Q3 error-budget burn rate here once SRE signs off` at `[P10-S3|L16]`), and implicit assistant handoffs (`Based on the notes you shared...` at `[P3-S2|L5]`):

```bash
dislop check slop-samples/en.md --engine byok --provider gemini --format agent
```

```text
# dislop file=slop-samples/en.md engine=byok:gemini-3.8-flash defects=8 suggestions=9
[P1-S1|L1] DEFECT(error,safe) en/artifact-qa/chatbot-artifact
  quote: "Certainly! Here is a polished draft of your Q3 database migration postmortem."
  reason: Conversational English assistant wrapper left in the deliverable; safe to delete.
  fix: DELETE
[P3-S2|L5] DEFECT(error,safe) common/artifact-qa/chatbot-citation-leak
  quote: "[oaicite:1]"
  reason: Internal AI search/citation token leaked into output text.
  fix: DELETE
[P3-S2|L5] DEFECT(error,manual) en/artifact-qa/unfilled-placeholder
  quote: "[Company Name]"
  reason: Unfilled English template placeholder or dummy Latin copy left in deliverable.
  prompt: Supply the real copy in place of '[Company Name]', or delete the unfinished sentence.
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/unfilled-placeholder
  quote: "[TODO: confirm incident owner]"
  reason: Unfilled developer or template token left in deliverable.
  prompt: Replace '[TODO: confirm incident owner]' with the real value before publishing, or remove the unfinished sentence.
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/empty-link-target
  quote: "[on-call runbook]()"
  reason: Link has an empty destination URL.
  prompt: Provide a valid destination URL or unwrap the link.
[P12-S1|L20] DEFECT(error,safe) en/artifact-qa/chatbot-artifact
  quote: "I hope this helps!"
  reason: Conversational English assistant wrapper left in the deliverable; safe to delete.
  fix: DELETE
[P12-S2|L20] DEFECT(error,safe) en/artifact-qa/chatbot-artifact
  quote: "Let me know if you'd like any further adjustments."
  reason: Conversational English assistant wrapper left in the deliverable; safe to delete.
  fix: DELETE
[P5-S2|L9] DEFECT(warning,manual) common/artifact-qa/placeholder-dead-link
  quote: "[incident timeline](#)"
  reason: Placeholder non-navigating link target '#'.
  prompt: Wire a real destination URL or use a <button type="button"> control.
[P3-S1|L5] SUGGESTION(strong,safe) en/prose/hollow-transition
  quote: "In today's rapidly evolving digital landscape, infrastructure reliability is a top priority."
  reason: Zero-information macro filler sentence; deleting it preserves all factual claims and causal links.
  fix: DELETE
[P3-S2|L5] SUGGESTION(strong,review) en/artifact-qa/implicit-assistant-framing
  quote: "Based on the notes you shared, I have organized the key findings for [Company Name] below [oaicite:1]."
  reason: Assistant handoff sentence explaining chatbot actions to the prompt author.
  fix: DELETE
[P4-S1|L7] SUGGESTION(strong,safe) en/prose/throat-clearing
  quote: "It is worth noting that PostgreSQL p95 query latency dropped from 142ms to 18ms across 4 read replicas in `{{cluster_region}}`."
  reason: Removes zero-information throat-clearing opener so the sentence opens directly on the claim.
  fix: "PostgreSQL p95 query latency dropped from 142ms to 18ms across 4 read replicas in `{{cluster_region}}`."
[P5-S1|L9] SUGGESTION(strong,review) en/prose/unprompted-negation
  quote: "This isn't just a configuration tweak — it's a new reliability baseline for our checkout pipeline."
  reason: Formulaic 'Not just X — it's Y' contrast shell; state the actual point directly without theatrical negation.
  fix: "It is a new reliability baseline for our checkout pipeline."
[P10-S1|L16] SUGGESTION(strong,manual) common/artifact-qa/unchosen-draft-options
  quote: "Option A: Roll out pooler settings to EU shards on Tuesday."
  reason: Inline text retains unchosen draft alternatives left over from drafting.
  prompt: Select either [Option A] or [Option B] and remove the unused alternative.
[P10-S3|L16] SUGGESTION(strong,manual) en/artifact-qa/disguised-placeholder-prose
  quote: "Mention the Q3 error-budget burn rate here once SRE signs off."
  reason: Prose note formulated as an author-facing reminder rather than published postmortem content.
  prompt: Insert the confirmed [Q3 error-budget burn rate percentage] from SRE, or remove the note.
[P11-S1|L18] SUGGESTION(strong,safe) en/prose/hollow-transition
  quote: "Looking ahead, the possibilities are truly endless."
  reason: Zero-information macro filler sentence; deleting it preserves all factual claims and causal links.
  fix: DELETE
[P4-S2|L7] SUGGESTION(moderate,review) en/prose/rhetorical-self-qa
  quote: "Why does this matter?"
  reason: Removes mechanical assistant rhetorical bridge question so the answer states the point directly.
  fix: DELETE
[P6-S1|L11] SUGGESTION(hint,manual) en/prose/bold-lead-list-wall
  quote: "**Faster Failover**: Automated promotion finished in 9 seconds during chaos drills."
  reason: Four or more consecutive '**Label**: description' list items create a mechanical assistant list wall.
  prompt: Convert uniform bold-lead bullets into direct sentences or plain list items without bold title prefixes.
```

### Tier 3: Managed Local Small Model (`--engine local`)

> **Prerequisite — [Ollama](https://ollama.com):** Tier 3 local semantic checks (`--engine local` LLM mode and `dislop model pull`) require **Ollama** installed and running locally (`http://127.0.0.1:11434/v1`). `dislop --help`, `dislop doctor`, `dislop model`, and `dislop check --engine local` automatically detect whether Ollama is missing or stopped and show installation instructions when needed.

Runs completely on-device via Ollama with zero external network traffic. Even when an ultra-small 1.5B model (`qwen2.5:1.5b`) produces noisy rule classifications on bullet items, `dislop` confines all LLM items strictly to `SUGGESTION` and downgrades unverified rewrites to `manual` so `dislop fix --auto` never corrupts technical metrics (use `qwen2.5-7b-instruct` for tighter local precision):

```bash
# Install and start Ollama (macOS Homebrew example; see https://ollama.com for Linux/Windows)
brew install ollama
ollama serve &

# Pull and register a Tier 3 model, then run local checks
dislop model pull qwen2.5-1.5b-instruct
dislop check slop-samples/en.md --engine local --format agent
```

```text
# dislop file=slop-samples/en.md engine=local:qwen2.5:1.5b defects=8 suggestions=20
[P1-S1|L1] DEFECT(error,safe) en/artifact-qa/chatbot-artifact
  quote: "Certainly! Here is a polished draft of your Q3 database migration postmortem."
  reason: Conversational English assistant wrapper left in the deliverable; safe to delete.
  fix: DELETE
[P3-S2|L5] DEFECT(error,safe) common/artifact-qa/chatbot-citation-leak
  quote: "[oaicite:1]"
  reason: Internal AI search/citation token leaked into output text.
  fix: DELETE
[P3-S2|L5] DEFECT(error,manual) en/artifact-qa/unfilled-placeholder
  quote: "[Company Name]"
  reason: Unfilled English template placeholder or dummy Latin copy left in deliverable.
  prompt: Supply the real copy in place of '[Company Name]', or delete the unfinished sentence.
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/unfilled-placeholder
  quote: "[TODO: confirm incident owner]"
  reason: Unfilled developer or template token left in deliverable.
  prompt: Replace '[TODO: confirm incident owner]' with the real value before publishing, or remove the unfinished sentence.
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/empty-link-target
  quote: "[on-call runbook]()"
  reason: Link has an empty destination URL.
  prompt: Provide a valid destination URL or unwrap the link.
[P12-S1|L20] DEFECT(error,safe) en/artifact-qa/chatbot-artifact
  quote: "I hope this helps!"
  reason: Conversational English assistant wrapper left in the deliverable; safe to delete.
  fix: DELETE
[P12-S2|L20] DEFECT(error,safe) en/artifact-qa/chatbot-artifact
  quote: "Let me know if you'd like any further adjustments."
  reason: Conversational English assistant wrapper left in the deliverable; safe to delete.
  fix: DELETE
[P5-S2|L9] DEFECT(warning,manual) common/artifact-qa/placeholder-dead-link
  quote: "[incident timeline](#)"
  reason: Placeholder non-navigating link target '#'.
  prompt: Wire a real destination URL or use a <button type="button"> control.
[P1-S1|L1] SUGGESTION(strong,review) common/artifact-qa/unchosen-draft-options
  quote: "Certainly!"
  reason: The phrase 'Certainly!' is redundant and does not add any value to the document.
  fix: DELETE
[P2-S1|L3] SUGGESTION(strong,manual) common/artifact-qa/meta-editing-note
  quote: "Q3 Storage Tier Migration Notes"
  reason: The note is a placeholder for future editorial work and does not belong in the published document.
  prompt: Remove the stray editorial meta-note.
[P3-S1|L5] SUGGESTION(strong,safe) en/prose/hollow-transition
  quote: "In today's rapidly evolving digital landscape, infrastructure reliability is a top priority."
  reason: Zero-information macro filler sentence; deleting it preserves all factual claims and causal links.
  fix: DELETE
[P3-S1|L5] SUGGESTION(strong,manual) en/artifact-qa/implicit-assistant-framing
  quote: "In today's rapidly evolving digital landscape, infrastructure reliability is a top priority."
  reason: The sentence is a placeholder for future editorial work and does not belong in the published document.
  prompt: Remove the assistant handoff sentence.
[P4-S1|L7] SUGGESTION(strong,safe) en/prose/throat-clearing
  quote: "It is worth noting that PostgreSQL p95 query latency dropped from 142ms to 18ms across 4 read replicas in `{{cluster_region}}`."
  reason: Removes zero-information throat-clearing opener so the sentence opens directly on the claim.
  fix: "PostgreSQL p95 query latency dropped from 142ms to 18ms across 4 read replicas in `{{cluster_region}}`."
[P4-S1|L7] SUGGESTION(strong,manual) en/artifact-qa/disguised-placeholder-prose
  quote: "It is worth noting that PostgreSQL p95 query latency dropped from 142ms to 18ms across 4 read replicas in `{{cluster_region}}`."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Replace the placeholder with the confirmed figure or link.
[P5-S1|L9] SUGGESTION(strong,review) en/prose/unprompted-negation
  quote: "This isn't just a configuration tweak — it's a new reliability baseline for our checkout pipeline."
  reason: Formulaic 'Not just X — it's Y' contrast shell; state the actual point directly without theatrical negation.
  fix: "It is a new reliability baseline for our checkout pipeline."
[P5-S1|L9] SUGGESTION(strong,manual) en/artifact-qa/synthetic-example-entity
  quote: "This isn't just a configuration tweak — it's a new reliability baseline for our checkout pipeline."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Replace the placeholder with the real organization or contact details.
[P6-S1|L11] SUGGESTION(strong,manual) en/prose/unprompted-negation
  quote: "**Faster Failover**: Automated promotion finished in 9 seconds during chaos drills."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Replace the placeholder with the confirmed figure or link.
[P7-S1|L12] SUGGESTION(strong,manual) en/prose/hollow-transition
  quote: "**Lower Memory**: Worker nodes stayed below 4.2GB RSS at peak load."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Replace the filler sentence with the concrete claim.
[P8-S1|L13] SUGGESTION(strong,manual) en/prose/throat-clearing
  quote: "**Cleaner Telemetry**: Slow-query logs now sample queries above 50ms."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Replace the filler sentence with the concrete claim.
[P9-S1|L14] SUGGESTION(strong,manual) en/prose/moralizing-closer
  quote: "**Simpler Rollbacks**: Snapshot restore scripts run from a single CLI flag."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Replace the filler sentence with the concrete claim.
[P11-S1|L18] SUGGESTION(strong,safe) en/prose/hollow-transition
  quote: "Looking ahead, the possibilities are truly endless."
  reason: Zero-information macro filler sentence; deleting it preserves all factual claims and causal links.
  fix: DELETE
[P4-S2|L7] SUGGESTION(moderate,review) en/prose/rhetorical-self-qa
  quote: "Why does this matter?"
  reason: Removes mechanical assistant rhetorical bridge question so the answer states the point directly.
  fix: DELETE
[P6-S1|L11] SUGGESTION(hint,manual) en/prose/bold-lead-list-wall
  quote: "**Faster Failover**: Automated promotion finished in 9 seconds during chaos drills."
  reason: Four or more consecutive '**Label**: description' list items create a mechanical assistant list wall.
  prompt: Convert uniform bold-lead bullets into direct sentences or plain list items without bold title prefixes.
[P10-S1|L16] SUGGESTION(hint,manual) en/prose/rhetorical-self-qa
  quote: "Option A: Roll out pooler settings to EU shards on Tuesday."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Merge the artificial question-and-answer pair into a single direct statement.
[P10-S2|L16] SUGGESTION(hint,manual) en/prose/rhetorical-self-qa
  quote: "/ Option B: Hold EU rollout until after the billing freeze."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Merge the artificial question-and-answer pair into a single direct statement.
[P10-S3|L16] SUGGESTION(hint,manual) en/prose/rhetorical-self-qa
  quote: "Mention the Q3 error-budget burn rate here once SRE signs off."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Merge the artificial question-and-answer pair into a single direct statement.
[P11-S1|L18] SUGGESTION(hint,manual) en/prose/rhetorical-self-qa
  quote: "Looking ahead, the possibilities are truly endless."
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Merge the artificial question-and-answer pair into a single direct statement.
[P12-S1|L20] SUGGESTION(hint,manual) en/prose/rhetorical-self-qa
  quote: "I hope this helps!"
  reason: The placeholder is a reminder to the writer and does not belong in the published document.
  prompt: Merge the artificial question-and-answer pair into a single direct statement.
```

## CLI Reference

```text
dislop check <files/globs... | -> [options] Read-only Dual-Track linter (`-` reads stdin with `--stdin-filename`; `--changed` / `--since <ref>` scans git diffs)
dislop fix <files/globs...> [options]       Interactive TTY hunk loop, or batch safe fixes (--auto)
dislop verify <before> <after> [--json]     Verify edits preserved facts, qualifiers, polarity, links, and metrics
dislop verify --git [ref] <file> [--json]   Verify working-tree edits against a Git revision
dislop init [--global] [--voice <glob>]     Initialize project .dislop.json or ~/.config/dislop/config.json
dislop login [--token <dslp_*>]             Save Official Cloud credentials
dislop logout                               Remove Official Cloud credentials
dislop voice <extract|show|clear> [files]   Manage personal voice profile (voice.json)
dislop model <list|pull|rm> [name]          Manage Tier 3 local models (requires Ollama)
dislop packs [list|lint <path>] [--json]    List built-in Packs or lint external .pack.md / Pack dirs
dislop doctor [--json]                      Diagnose active routing tier, Ollama status, auth, config, and Packs
dislop worklog <status|list|show|stats|reflect|clear>  Inspect local dev worklog & reflection summaries
dislop mcp                                  Start local stdio MCP server (also `dislop-mcp`)
```

Key flags: `--fail-on <none|error|warning>` controls Defect CI exit thresholds (Suggestions remain non-blocking at Exit `0`), `--stdin-filename <name>` sets stdin format, and `--changed` / `--since <ref>` scope checks to modified git files.

## Configuration Layering (`~/.config/dislop/config.json` vs `.dislop.json`)

Shared repo `.dislop.json` files are isolated under untrusted linter rules (`routing` limited to `"local"` or `"off"`, per-glob `overrides`, `extraPacks`, `rules`, `failOn`, `ignore`, and `voice.referenceFiles` inside the repo root). Put personal LLM backends and credentials ONLY in `~/.config/dislop/config.json` or an untracked `.dislop.local.json`:

```json
{
  "routing": "local",
  "ignore": [".private/**"],
  "failOn": "error",
  "overrides": [
    { "files": ["docs/**/*.md"], "packs": ["prose"] },
    { "files": ["site/**/*.html"], "packs": ["web-ui"] }
  ]
}
```

A `packs` list inside `overrides` replaces the scenario packs for matching files, while `common/artifact-qa` and the matching `en/artifact-qa` or `zh/artifact-qa` stay enabled (use `extraPacks` to append packs without replacing). Scans from a parent directory, `--changed`, and `--since` skip `.dislop/`; validate project packs with `dislop packs lint .dislop/<name>.pack.md`.

User config (`~/.config/dislop/config.json`) holds credentials & providers:

```json
{
  "routing": "byok",
  "activeProvider": "openai-default",
  "approvedHosts": ["api.openai.com"],
  "ignore": [".private/**"],
  "concurrency": 4,
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

## Contributing & Custom Packs

To build custom Packs (separated `pack.json` + `scripts/` + `prompts/`, single-file `<name>.pack.md` Markdown Packs, or programmatic `definePack()` plugins), see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[Apache-2.0](./LICENSE)
