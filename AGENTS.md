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

## 2. Privacy & Testing Guardrails

- **Local-First Default**: Default routing (`routing: "local"`) performs zero network uploads. Ambient environment keys (`OPENAI_API_KEY`, etc.) must always pass through `src/runtime/privacy-gate.mjs`.
- **Offline Deterministic Tests**: All unit and integration tests (`npm test` via `node --test`) must run 100% offline using local mock servers or injected adapters—never live external LLM APIs.
- **Pending Website Extraction**: Do not modify `site/`, `content/`, or `awesome/` during CLI work until the website repo extraction in [docs/MIGRATION-TODO.md](./docs/MIGRATION-TODO.md) is completed.

## 3. Verification Commands

```bash
npm test
npm run dogfood
```
