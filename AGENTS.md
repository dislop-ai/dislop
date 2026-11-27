# AGENTS.md

Guidelines for contributors and AI agents working in the `dislop` repository.

## 1. Architecture Boundaries

- **Micro-Kernel Purity (`src/kernel/`)**: Keep `src/kernel/` completely agnostic to specific prose clichés or UI template rules. All linguistic, UI, and slide rules belong inside modular Packs under `packs/<scope-or-lang>/<scenario>/{pack.json,scripts/,prompts/}` (`scripts/*.mjs` via `definePackScripts` for deterministic checks/gates, and `prompts/*.md` for lazy-loaded LLM instructions).
- **Dual-Track Enforcement**:
  - Only deterministic `pack.check(doc, ctx)` hooks may call `ctx.reportDefect(...)` (`error | warning`).
  - Prompt rules (`pack.resolvePrompt` and `.pack.md`) are structurally restricted to emit `Suggestion`s (`strong | moderate | hint`) and must never fail CI (`Exit Code 0`).
- **High-Restraint Default Packs**: Built-in prose packs (`packs/en/prose`, `packs/zh/prose`) must only flag zero-information filler (safe to delete) or self-contained syntactic AI shells—never ordinary domain claims that merely contain an abstract verb.
- **Strict Single-Language Separation**:
  - `src/`, `packs/common/`, `packs/en/`, `README.md`, and `PRODUCT.md` must stay strictly in English (no mixed Chinese specimen strings).
  - `packs/zh/` contains pure Chinese rules, prompts, and examples.

## 2. Zero AI Slop in Outbound Copy (Global Guiding Principle)

- **Plain, Direct Public Voice**: Every public-facing text in `dislop` (READMEs, documentation, CLI help, release notes, issues, PR comments, benchmark notes, and social posts or replies) must read like plain, direct engineering prose—never AI filler, sycophantic praise (`Great point!`, `Spot on!`), balanced marketing triads, rhetorical-question openers, pull-quote closers, or costumed editorial roleplay.
- **Voice Reference**: Follow [docs/brand-and-voice-guide.md](./docs/brand-and-voice-guide.md) and [docs/brand/voice.json](./docs/brand/voice.json).
- **Mandatory Pre-Flight Check**: Before shipping or posting outbound copy, run `node ./bin/dislop.mjs check <file> --no-llm --fail-on warning` and confirm **0 `Defect`s and 0 `Suggestion`s** (and run `dislop verify` after edits to confirm numbers, links, and quotes stay intact).

## 3. Privacy & Testing Guardrails

- **Local-First Default**: Default routing (`routing: "local"`) performs zero network uploads. Ambient environment keys (`OPENAI_API_KEY`, etc.) must always pass through `src/runtime/privacy-gate.mjs`.
- **Offline Deterministic Tests**: All unit and integration tests (`npm test` via `node --test`) must run 100% offline using local mock servers or injected adapters—never live external LLM APIs.
- **Pending Website Extraction**: Do not modify `site/`, `content/`, or `awesome/` during CLI work until the website repo extraction in [docs/MIGRATION-TODO.md](./docs/MIGRATION-TODO.md) is completed.

## 4. Verification Commands

```bash
npm test
npm run dogfood
```
