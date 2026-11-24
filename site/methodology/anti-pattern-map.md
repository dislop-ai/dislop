---
content-type: reference-data
version: 0.9.1
---

# Cross-Modality Anti-Pattern Map

`dislop` ships 65 structured anti-slop patterns across 6 dimensions in `v0.9.1` (53 built-in pack rules across 7 packs + 12 extended pattern-bank probes), plus an offline 14.6 KB Pocket ML scorer (`--ml`) for uniform-cadence vapor prose.

| Category | What It Covers | Shipped `v0.9.1` Offline Coverage |
|---|---|---|
| **AI Delivery Artifacts** | Obvious AI leftovers (`severity: error`) | `packs/core`: stray chatbot wrappers, unfilled placeholders, raw Markdown in DOCX/PPTX, dead `href="#"` placeholder controls |
| **Stock Lexicon & Default UI** | Filler words and default generator chrome | `en-cliche-lexicon`, `en-throat-clearing-opener`, `zh-bureaucratic-padding`, `ui-ai-gradient`, `ui-pill-soup`, `ui-box-in-box`, `ui-prompt-echo-badge`, plus pattern-bank probes `ui-glassmorphism-overuse` and `ui-accent-stripe-card` |
| **Cadence, Frames & Slide Layout** | Structural fallback after banning stock words | `negation-pivot-frame`, `staccato-slogan-run`, `zh-four-char-triad`, `semicolon-tricolon`, `rhetorical-qa-cadence`, `comma-chain-runon`, `narrative-sandwich-frame`, `template-skeleton-echo`, `low-burstiness-vapor`, `zh/en-essay-moralizing-ending`, `bold-lead-list-wall`, `excessive-em-dash-density`, `zh-halfwidth-punctuation`, slide word-walls/bullets/autofit/weak-titles, `pptx-layout-monotony`, and extended pattern-bank probes |
| **Domain Specs, Voice & Craft** | Engineering/regulated slop, personal cadence, and visual craft | `engineering-spec`, `regulated-comms`, and `executive-deck` packs; `SKILL.md` plain writing & UI rules; 31 print/type design references; `dislop voice` (`dislop.voice/1`) offline stylometrics; 14.6 KB `--ml` Pocket ML scorer; optional local small models (`dislop model`) |

## Coverage Honesty Principle

Uninspectable artifacts (corrupted archives, non-UTF-8 files) are reported explicitly as `[SKIP]` and exit `2` on single-file checks. `dislop` never reports an uninspected artifact as clean.
