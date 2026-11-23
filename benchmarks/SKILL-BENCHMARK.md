# Agent Skill Benchmark (`dislop-skill-bench v1`)

[Benchmark Home](./README.md) · [Latest JSON](./results/skill-benchmark-latest.json) · [Round History (R1–R5)](./results/skill-round-history.json) · [Optimization Notes (ZH)](../docs/research/skill-optimization-5-rounds.zh-CN.md)

`dislop-skill-bench v1` tests whether `skills/dislop/SKILL.md` and its 8 language-separated reference cards trigger accurately, route cross-language and multi-surface prompts to the right card, prevent factual drift or hallucinated filler across drafting and revision, and avoid rewriting already-clean human text. Across two live models (`gemini-3.5-flash` with thinking enabled and `qwen3.8-flash` non-thinking), the redesigned 8-card Skill reached **100.0% trigger F1** and **100.0% reference-card accuracy** (`0.0%` false-positive rate; 95% Wilson CI `[94.3%, 100.0%]`) compared with `88.0%` F1 / `61.9%` card accuracy on Gemini and `97.6%` F1 / `76.2%` card accuracy on Qwen for the pre-redesign v0.7.1 baseline (`skill_v0`).

## 1. Benchmark Design

The offline assertion suite runs locally (`npm run bench:skill`) with network calls blocked by default (`DISLOP_TEST_MODE=1`). Live model evaluations compare four arms under identical prompts:

1. `no_skill`: Target model alone, with no Skill instructions.
2. `skill_v0`: Baseline v0.7.1 Skill (`SKILL.md` 644 body tokens + 4 English reference cards).
3. `skill_cand`: Redesigned Markdown-only Skill (`SKILL.md` 748 body tokens + 8 English/Chinese cards in `skills/dislop/references/`).
4. `skill_cli`: Candidate Skill paired with a one-step automated repair loop fed only deterministic `dislop check` / `verifyRevision` findings.

Each live run spans four tracks (40 generation tasks + 64 routing decisions at 2 repeats per case):

- **Routing (`datasets/skill-routing-v1.json`, 32 cases × 2 repeats = 64 decisions)**: 21 positive triggers across Coding agents (README, RFC, PR, postmortem, CLI help/errors, UI HTML/JSX), Office agents (`.docx`, `.pptx`, external notices, essays), cross-language prompts, and GPTZero boundary requests, paired with 11 non-slop negative controls (SQL, unit tests, commit messages, YAML CI, verbatim legal copying, literal translation, algorithm debugging, NPV math, verbatim transcripts, `awk`, spelling-only checks).
- **Green-Field Drafting (`datasets/skill-drafting-v1.json`, 12 tasks)**: Structured notes in Chinese and English requiring exact preservation of numbers, bounds, owners, verbatim code/file strings, and `from X to Y` direction.
- **Targeted Revision & Clean Preservation (`datasets/revision-hard-v2.json` + `datasets/skill-revision-ext-v1.json`, 18 tasks)**: Includes 12 de-slopping tasks (stealth filler, split-run `.docx` XML, shallow postmortems, regulated claims) and 6 clean preservation tasks (`preserve`) where over-editing clean prose or altering legitimate domain usage (`leverage`) fails.
- **Near-Transfer Holdout v2 (`datasets/skill-holdout-v1.json`, 10 tasks)**: Adds tracked-change `.docx` (`<w:ins>` / `<w:del>`), multi-slide `.pptx`, CLI help/errors, cross-language instructions, `projected` modality notices with `forbidden` phrasing, essay length bounds (`ho-zh-05` >= 180 non-whitespace chars; `ho-en-05` >= 85 words), and model-chosen card loading during generation on `ho-zh-03` and `ho-en-02`.

Scoring applies hard vetoes first (broken XML/HTML, tool-name echo, missing/altered numbers or polarity, forbidden strings, language mixing, 2nd/3rd-order AI patterns, degenerate compression, `preserve` edit distance > 20%), alongside five weighted automated components totaling 100 (`D1=35` rule/pattern cleanliness, `D2=20` replacement-pattern freedom, `D3=25` fact retention, `D4=10` rhythm and concreteness, `D5=10` format and restraint).

## 2. Token Economy

| Metric | Baseline `skill_v0` (4 EN cards) | Candidate `skill_cand` (8 EN/ZH cards) |
|---|---|---|
| YAML frontmatter loaded at startup | 245 B / ~62 tok | 461 B / ~116 tok |
| `SKILL.md` body on trigger | 2,575 B / ~644 tok | 2,991 B / ~748 tok |
| Reference card count & avg size | 4 cards / ~477 tok | 8 cards / ~780 tok |
| Largest single card | 525 tok | 1,108 tok (`work-docs.zh-CN.md`) |

Splitting `.md` and `.zh-CN.md` cards keeps each loaded task small (~748 + ~780 tokens on demand) while isolating language-specific rules and removing JSON MCP setup boilerplate and promotional numbers from `SKILL.md`.

## 3. Round 5 Results (Automated Suite + Length Rescore)

Numbers below come from `round5-rescored.json` (total API spend `$0.19716`, `0` length truncations across 320 generated outputs, `0` bare tool-echo failures, after updating `ho-zh-05` `minChars=180` and `ho-en-05` `minWords=85` and running `--rescore`):

| Model :: Arm | Trigger F1 | Pos Card Acc | Neg FPR | Trigger Acc 95% Wilson CI | Draft (NoVeto) | Revision (NoVeto) | Preserve (NoVeto) | Holdout v2 (NoVeto) | Overall (NoVeto / AllClear / Facts) |
|---|---|---|---|---|---|---|---|---|---|
| `gemini-3.5-flash :: no_skill` | — | — | — | — | 96.5 (88.2%) | 87.4 (86.7%) | 100.0 (100.0%) | 98.7 (90.0%) | 93.8 (90.0% / 70.0% / 37/40) |
| `gemini-3.5-flash :: skill_v0` | 88.0% | 61.9% | 0.0% | [75.4%, 92.4%] | 96.0 (82.4%) | 100.0 (100.0%) | 100.0 (100.0%) | 98.1 (90.0%) | 98.3 (92.5% / 85.0% / 37/40) |
| `gemini-3.5-flash :: skill_cand` | **100.0%** | **100.0%** | **0.0%** | **[94.3%, 100.0%]** | **98.5 (94.1%)** | 97.8 (93.3%) | **100.0 (100.0%)** | 98.6 (90.0%) | **98.5 (95.0% / 85.0% / 39/40)** |
| `gemini-3.5-flash :: skill_cli` | — | — | — | — | 99.4 (94.1%) | 99.3 (100.0%) | 100.0 (100.0%) | 99.4 (90.0%) | 99.5 (97.5% / 90.0% / 39/40) |
| `qwen3.8-flash :: no_skill` | — | — | — | — | 95.1 (76.5%) | 82.6 (73.3%) | 96.4 (75.0%) | 95.6 (70.0%) | 90.7 (75.0% / 52.5% / 32/40) |
| `qwen3.8-flash :: skill_v0` | 97.6% | 76.2% | 0.0% | [89.3%, 99.1%] | 93.9 (82.4%) | 96.7 (80.0%) | 98.3 (75.0%) | 91.1 (60.0%) | 95.8 (80.0% / 65.0% / 34/40) |
| `qwen3.8-flash :: skill_cand` | **100.0%** | **100.0%** | **0.0%** | **[94.3%, 100.0%]** | **97.6 (88.2%)** | **99.2 (93.3%)** | **99.0 (87.5%)** | **96.5 (80.0%)** | **98.5 (90.0% / 82.5% / 37/40)** |
| `qwen3.8-flash :: skill_cli` | — | — | — | — | 97.8 (88.2%) | 98.9 (100.0%) | 99.0 (87.5%) | 96.5 (80.0%) | 98.5 (92.5% / 82.5% / 38/40) |

On the two live tasks where the agent picked its own card before generating (`ho-zh-03` English prompt over Chinese text, `ho-en-02` CLI help copy), both Gemini and Qwen chose the intended card and scored `100/100` with zero vetoes.

> **Chronology note on final card hygiene edits**: After Round 5 live runs finished, blind review flagged 5 reference-card Contrast examples (`office.md`, `office.zh-CN.md`, `web-ui.md`, `web-ui.zh-CN.md`, `work-docs.md`) where the clean example still added words not in the original sentence, plus an instruction wording overlap in `essay.zh-CN.md`. Those 6 card lines were tightened offline to enforce zero invented facts, and `npm test`, `npm run bench:skill` (with `instruction` fields included in the contamination scan), and `dislop check skills/dislop/ --fail-on info` passed (`0` findings). Live Round 5 generations reflect the version immediately before that wording trim.

## 4. Cross-Vendor Blind Pairwise Review

Non-tie candidate pairs (plus 25% stratified AB/BA reverse-orientation checks) were evaluated blindly by an independent cross-vendor judge (Opus) checking ten veto classes (fact mutation, invented details, modal drift, dropped atoms, new AI slop, verbatim breaks, language leaks, ignored instructions, broken markup, and > 20% `preserve` edits) first:

| Round & Comparison | Total Pairs (Unique) | `skill_cand` Wins | Comparator Wins | Ties | Gemini (`cand-comp-tie`) | Qwen (`cand-comp-tie`) | Swap Consistency |
|---|---|---|---|---|---|---|---|
| Round 3 (`skill_v0` vs `skill_cand`, Holdout v1) | 30 (24) | **20** | 4 | 6 | 9–1–5 | 11–3–1 | **6/6** |
| Round 3 (`no_skill` vs `skill_cand`, Holdout v1) | 26 (20) | **23** | 1 | 2 | 11–0–2 | 12–1–0 | **6/6** |
| Round 5 (`skill_v0` vs `skill_cand`, Holdout v2) | 30 (24) | **13** | 8 | 9 | 4–5–6 | 9–3–3 | **6/6** |
| Round 5 (`no_skill` vs `skill_cand`, Holdout v2) | 26 (20) | **18** | 4 | 4 | 7–3–3 | 11–1–1 | **6/6** |

In Round 3, `skill_cand` dominated both comparators cleanly except for a bare `dislop_check` tool echo by `qwen3.8-flash` caused by unconditional Section 4 tool wording. Fixing Section 4 eliminated tool echoes across all 320 outputs in Rounds 4 and 5, while Holdout v2 introduced stricter essay length floors (`180` non-whitespace Chinese characters, `85` English words), tracked-change XML, and verbatim `leverage` preservation that exposed minor length shortfalls on `ho-zh-05` (`168 < 180` chars) and prose rewrites around the preserved quote on `ho-en-04`.

## 5. Limitations & Honest Caveats

Every benchmark number above should be read alongside its structural measurement limits:

- Automated composite scores miss invented prose. Invented causes, mechanisms, benefits, or scene details often score `100` in automated metrics, so report readers should lead with **NoVeto%** and cross-vendor **blind pairwise wins** rather than raw composite averages.
- Holdout length checks count non-whitespace characters (`minChars=180` on `ho-zh-05`) and words (`minWords=85` on `ho-en-05`), while upper word bounds (`300`, `150`, `120`, `90`) and core development essays do not enforce automated length cutoffs.
- `checkVerbatimBindingsForbidden` matches `forbidden` phrases as plain substrings, so even a disclaimer containing `"guarantees"` (such as `"rather than guarantees"`) still triggers `V_FORBIDDEN`.
- On `preserve` tasks containing a fixed quotation (`ho-en-04`), that untouched quote raises whole-text `editSim` so adjacent rewrites can still clear the `0.80` floor (for example `0.851`).
- Holdout v2 measures near transfer rather than strict out-of-distribution generalization because four of its ten tasks (`ho-zh-02`, `ho-zh-03`, `ho-en-04`, and part of `ho-zh-04`) reuse development templates or traps and were authored alongside card iterations.
- `checkCardContamination` scans same-language 8-character Chinese and 5-word English n-grams across `SKILL.md` and `references/*.md` against `source`, `sourceFacts`, and `instruction` fields, without checking `verbatim`/`forbidden` arrays, routing prompts, frontmatter, or cross-language theme parallels.
- Blind packets omit `filename` (so entities grounded only in `filename`, such as `redis-postmortem.md`, look ungrounded to a blind reader), include both baseline comparisons against one shared candidate arm with one judge per round, and treat keeping versus merging clean `.docx` split XML runs as a tie.
- Small samples apply to routing (`32` cases, Wilson 95% CI `[94.3%, 100.0%]`) and holdout (`10` tasks per model, too small for significance claims on `holdout` alone). Model-chosen card loading during generation ran live on `ho-zh-03` and `ho-en-02`, while the remaining 38 tasks fixed the expected card to isolate drafting and revision quality from routing variance.

## 6. Run Locally

```bash
# Offline regression & card contamination check (no API keys, network locked)
npm run bench:skill

# Plan API calls and budget without sending requests
node scripts/run_skill_benchmark.mjs --dry-run

# Live 4-arm benchmark (requires GEMINI_API_KEY and DASHSCOPE_API_KEY)
node scripts/run_skill_benchmark.mjs --live --arms no_skill,skill_v0,skill_cand,skill_cli --models gemini-3.5-flash,qwen3.8-flash --max-usd 1.5 --out scratch/skill-run.json

# Export stratified non-tie blind comparison packet with 25% AB/BA swap verification
node scripts/run_skill_benchmark.mjs --blind-export skill_v0 skill_cand --input scratch/skill-run.json --out scratch/blind-pack
```
