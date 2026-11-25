# dislop Product Brief

## Slogan

Cutting AI slop is real productivity.

## Positioning

**Pluggable Editorial & Artifact Linter.** Built on a Node.js (`>= 20`) micro-kernel for coding agents, office agents, CI pipelines, and human writers. Catches objective delivery defects and AI-sounding scaffolding across docs, web UI, slides, and Office documents before publication.

## Architectural Pillars

1. **Micro-Kernel + Multi-Modal Packs (`dislop/sdk`)**:
   - Core owns document coordinate parsing (`DocumentModel`), immutable safety invariants, the Dual Fact Gate, 3-Tier LLM routing, lossless coordinate patching, and CI exit-code arbitration.
   - Rules and modality probes live in pluggable Packs organized by scope/language and scenario (`packs/common/*`, `packs/en/*`, `packs/zh/*`), local `.mjs` modules, or zero-code `.pack.md` files.
2. **Dual-Track Taxonomy (`Defect` vs. `Suggestion`)**:
   - Editorial prose findings are `Suggestion`s (`strong | moderate | hint`) and never block CI (`Exit Code 0`).
   - Objective delivery bugs (placeholders, chatbot residue, broken links, raw Markdown leaks in `.docx`/`.pptx`) are `Defect`s (`error | warning`) emitted strictly by deterministic `pack.check()` hooks (`Exit Code 1` on unresolved `Defect: error`).
3. **Local-First Default with Optional Semantic Tiers**:
   - Runs locally with zero network uploads by default (`--engine local`), while prompting users and agents toward Tier 1 Official Cloud (`dislop login`), Tier 2 BYOK/Loopback (`--engine byok`), or Tier 3 Managed Local Models (`dislop model pull`) for deeper semantic review.
4. **High-Restraint Editorial Discipline & Strict Single-Language Purity**:
   - Built-in prose packs flag only zero-information scaffolding and self-contained syntactic AI tics—never nagging authors over ordinary abstract verbs when repository context is unavailable.
   - English and Chinese packs, prompts, and documentation stay strictly separated into single-language files and directory levels.

## Product Surfaces

1. **Agent Skills (`skills/`)**: Pure-Markdown genre reference cards read before drafting and paired with `dislop check --format agent` + `dislop verify`.
2. **Node.js CLI, SDK & Local MCP (`bin/dislop.mjs`, `bin/dislop-mcp.mjs`, `dislop/sdk`)**: Local-first checker, interactive `git add -p` hunk reviewer (`dislop fix`), batch safe fixer (`dislop fix --auto`), standalone Fact Gate verifier (`dislop verify`), and local stdio MCP server.
3. **Official Cloud Service (`dislop.com`)**: Hosted multi-model review and layout-preserving Office workflows (see [docs/MIGRATION-TODO.md](./docs/MIGRATION-TODO.md) for pending static-site extraction and API schema alignment).
