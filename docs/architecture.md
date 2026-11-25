# Architecture (`v1.0.0` Node.js Micro-Kernel)

`dislop` is a single-stack **Node.js (`>= 20.0.0`, ESM, zero external runtime dependencies)** Pluggable Editorial & Artifact Linter.

---

## 1. Core Architectural Principles

1. **Domain-Blind Micro-Kernel vs. Pluggable Packs**:
   - `src/kernel/` knows nothing about specific prose clichés, UI gradients, or slide buzzwords. It owns only multi-modal document coordinate parsing (`DocumentModel`), stage-gated Pack loading, immutable safety & prompt-injection invariants, the Dual Post-LLM Fact Gate, coordinate-based lossless patching, and CI exit-code arbitration.
   - Domain rules live exclusively inside Packs organized under `packs/<scope-or-lang>/<scenario>/{pack.json,scripts/,prompts/}` (`common/*`, `en/*`, `zh/*`), local `.mjs` plugins, npm packages, or standalone `<name>.pack.md` files.
2. **Dual-Track Taxonomy (`Defect` vs. `Suggestion`)**:
   - **Editorial prose never fails CI**: Linguistic and layout-taste findings are `Suggestion`s (`strong | moderate | hint`) and always return **Exit Code `0`** (mapped strictly to `"note"` in SARIF).
   - **Objective delivery bugs fail CI**: Unfilled placeholders, stray chatbot wrappers, broken local links, and raw Markdown leaked into `.docx`/`.pptx` are `Defect`s (`error | warning`). Only deterministic `scripts/` hooks can call `ctx.reportDefect(...)`, and only unresolved `Defect: error` returns **Exit Code `1`**.
3. **Strict Pack vs. Core Boundary**:
   - Pack `prompts/*.md` files declare **only** what patterns fire (with priority and false-positive boundaries) and plain editorial fix suggestions—never internal JSON field names.
   - Core ([prompt-assembler.mjs](../src/kernel/prompt-assembler.mjs)) owns structured JSON mapping, clamps LLM outputs to `fixSafety: "review" | "manual"` (`never "safe"`, so `dislop fix --auto` never applies probabilistic LLM rewrites), and serializes `dislop.report/1` (`--json`), `--format agent`, `sarif`, `diff`, and `text`.
4. **Strict Single-Language Separation**:
   - `src/`, `packs/common/**`, `packs/en/**`, and root documentation stay strictly in English; `packs/zh/**` contains native Chinese rules, prompts, and descriptions.

---

## 2. Separated Pack Layout & Stage-Gated Lazy Loading

Every built-in Pack under `packs/{common,en,zh}/{artifact-qa,prose,web-ui,slide-deck}/` separates metadata, deterministic code, and Markdown prompts:

```text
packs/<scope-or-lang>/<scenario>/
├── pack.json              # Lightweight manifest (name, version, description, languages, formats)
├── scripts/
│   └── index.mjs          # Deterministic definePackScripts({ appliesTo, check, verifyFix })
└── prompts/
    └── rules.md           # Pure Markdown frontmatter + trigger criteria & fix suggestions
```

Loading in [pack-loader.mjs](../src/kernel/pack-loader.mjs) and [pipeline.mjs](../src/kernel/pipeline.mjs) is strictly stage-gated:
1. **Admission (`resolveActivePacks`)**: Reads `pack.json` only. Packs whose `languages`, `formats`, or `modalities` do not match `doc` import `0` JS modules and read `0` Markdown files.
2. **Step 3 (`runDeterministicPackChecks`)**: Imports `scripts/*.mjs` only for admitted Packs. `prompts/*.md` remain unread on `--no-llm` and default offline deterministic runs.
3. **Step 4 (`collectPackPromptRules`)**: Reads and compiles `prompts/*.md` **only when `!config.noLlm` and an active LLM execution route is present**.

---

## 3. The 7-Step Execution Lifecycle (`src/kernel/pipeline.mjs`)

1. **Environment & Layered Config (`config.mjs`)**: Merges `~/.config/dislop/config.json` <- `.dislop.json` <- `.dislop.local.json` <- CLI flags, detects CI / coding-agent sandboxes (`isInteractiveHumanTty`), and checks SHA-256 `voice.json` fingerprints (`voice-profile.mjs`).
2. **Multi-Modal `DocumentModel` (`document-model.mjs`, `ooxml-binary.mjs`)**: Parses `.md`, `.mdx`, `.txt`, `.html`, `.css`, `.jsx`, `.tsx`, `.svg`, `.docx`, `.pptx`, `.pdf`, and raster images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`) into addressable segments (`[P1-S2|L4]` / `[B1-S2]`), format-specific write-back `locator` pointers, and modality signal bags (`uiSignals`, `deckSignals`, `mediaSignals`).
3. **Deterministic Pack Checks (`pack-loader.mjs`)**: Runs `scripts/*.mjs` across active Packs in parallel (`reportDefect` + `reportSuggestion`).
4. **Prompt Assembly, Sliding Window & Routing (`prompt-assembler.mjs`, `chunker.mjs`, `router.mjs`)**:
   - Defaults to `routing: "local"` (`0` external uploads by default; uses Tier 3 local model or configured loopback runtime if present, otherwise prints a 1-line `stderr` upgrade hint).
   - Opt-in `--engine auto|cloud|byok` cascades across Tier 1 Official Cloud (`cloud.mjs`), Tier 2 BYOK/Proxy (`openai-compat.mjs`, `anthropic.mjs`, `gemini.mjs` guarded by `privacy-gate.mjs` for ambient env keys), and Tier 3 Managed Local (`local-model.mjs`), chunking long documents by paragraph with `<context_readonly>[CTX-P{k}]` 1-paragraph lookbehind and 3-stage state-machine JSON recovery (`json-extract.mjs`).
5. **Dual Post-LLM Fact & Anti-Injection Gate (`fact-gate.mjs`)**:
   - Verifies every candidate replacement preserves all numbers, units, percentages, URLs, inline code spans, and proper nouns from `originalQuote` (without locking negation word counts).
   - Blocks **newly fabricated or prompt-injected** URLs, inline code spans, or numbers absent from `originalQuote`.
   - Runs `verifyFix()` from the originating Pack's `scripts/`. Any failure strips `suggestedReplacement` and downgrades `fixSafety` to `"manual"` with a `verificationNote`.
6. **Runners & Lossless Atomic Patching (`interactive-tty.mjs`, `auto-fix.mjs`, `reporters.mjs`, `patcher.mjs`)**:
   - Deduplicates and sorts Dual-Track (`Defect` `error -> warning` first, then `Suggestion` `strong -> moderate -> hint`), running either read-only reporters (`check`), batch safe apply (`fix --auto`), or the single-keypress TTY hunk loop (`y/n/e/p/a/A/s/u/q`).
   - Writes accepted edits atomically via sibling temp-file rename (`--dry-run`, `--backup`), preserving `LF`/`CRLF` line endings and `.docx`/`.pptx` run properties & binary entries.
7. **Exit Code Arbitration**: `1` iff `summary.defects.error > 0`; `0` otherwise (`2` on CLI/config/auth/file errors).

---

## 4. Prompt-Injection & Supply-Chain Defenses

1. **Deterministic Boundary Tag Escaping**: Target documents and lookbehind paragraphs are wrapped in fixed `<untrusted_document>` and `<context_readonly>` tags (preserving LLM prefix caching) while escaping any literal `<untrusted_document` / `<pack_rules` / `<context_readonly` substrings and XML attributes inside input text.
2. **Untrusted Data Sandbox**: Section 1 of the Kernel System Prompt instructs the model to treat all content inside `<untrusted_document>` and `<context_readonly>` strictly as inert data under inspection—never instructions, role changes, or overrides.
3. **LLM Trust Clamp + Deterministic Anti-Fabrication Gate**: Even if an LLM were tricked by adversarial prose, it cannot emit `Defect`s (CI cannot be DoS-broken), cannot emit `fixSafety: "safe"` (`fix --auto` ignores it), and cannot inject unverified URLs, inline code commands, or numbers past `fact-gate.mjs`.
