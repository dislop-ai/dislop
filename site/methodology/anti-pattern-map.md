---
content-type: reference-data
version: 1.1.2
---

# Cross-Modality Anti-Pattern Map

`dislop` (`v1.1.2`) runs `11` stage-gated modular Packs organized by scope/language and deliverable modality (`common/*`, `en/*`, `zh/*`), separating deterministic `Defect` guards (`scripts/*.mjs`, CI blocking) from high-restraint editorial `Suggestion` probes and prompts (`prompts/*.md`, never fail CI).

| Category | What It Covers | Shipped `v1.1.2` Offline Coverage |
|---|---|---|
| **Artifact QA (`common/artifact-qa`, `en/artifact-qa`, `zh/artifact-qa`)** | Objective delivery defects (`Defect: error | warning`) | Unfilled placeholders, stray chatbot wrappers & AI search citation tokens, local user home paths, unrendered Markdown syntax in `.docx`/`.pptx`/`.html`, dead `href="#"` controls, and shrunk OOXML `normAutofit` fonts |
| **Prose Craft (`en/prose`, `zh/prose`)** | Zero-information filler & syntactic AI shells (`Suggestion`) | Throat-clearing preambles, stock cliché lexicons, `"Not X, but Y"` contrast pivots, balanced three-clause semicolon pitches, rhetorical Q&A hooks, macro-trend openers, moralizing endings, and custom `.dislop/rules.json` term guards |
| **Web UI & Diagrams (`common/web-ui`)** | Stock AI template chrome (`Suggestion`) | Purple-pink neon gradients, ambient `blur-3xl` glow orbs, pill-badge walls, 3-level nested boxes, prompt-echo badges, missing `<svg viewBox>`, and unstripped image workflow metadata |
| **Slide Decks (`common/slide-deck`, `en/slide-deck`, `zh/slide-deck`)** | Executive decks & PDF layouts (`Defect` & `Suggestion`) | Slide word walls (`> 120` EN words / `> 280` ZH chars), `> 6` bullets per slide, process-label titles instead of takeaways, monotonous 4+ identical slide skeletons, and raster-only or sub-`9.5pt` landscape PDFs (incl. XObject form expansion) |

## Coverage Honesty Principle

Uninspectable artifacts (corrupted archives, non-UTF-8 files) are reported explicitly as skipped (`Exit 2` on single-file runs). `dislop` never reports an uninspected artifact as clean.
