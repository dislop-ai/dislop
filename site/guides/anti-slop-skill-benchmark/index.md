---
content-type: reference-data
lang: en
updated: 2026-11-24
version: 0.9.1
---

# 4 Anti-Slop Agent Skills Tested on 30 Real Drafts (2026 Benchmark)

> Upfront disclosure: pass-rate scores use dislop's own deterministic packs. Across 30 drafts on gemini-3.5-flash, all four standalone Markdown skills left dead href="#" links in HTML cards, stop-slop left raw **Summary**: markdown and 62.5% text shrink inside .pptx XML, and 3 of 4 returned a three-semicolon pitch verbatim. Adding one dislop check pass lifted clean passes by +13.3 pp in English and +20.0 pp in Chinese with 0 fact drift.

On 2026-11-23, we ran the unmodified upstream `SKILL.md` prompts from four public anti-slop skills—`blader/humanizer` (`a32f244073`), `hardikpandya/stop-slop` (`8da1f03018`), `op7418/Humanizer-zh` (`f4518a8eab`), and `larashero3-dotcom/lieflat-less-ai-tone` (`fe77df00a2`)—on 30 drafts using `gemini-3.5-flash` (total run cost `$0.18886`, zero length truncations).

We state our scoring bias upfront: the pass-rate columns below use `dislop`'s own rule packs, which reflect what `dislop` checks. For that reason, look first at the four string-verifiable defects in the raw outputs before looking at aggregate scores.

## 1. Test Corpus and Setup

The 30 tasks span 15 English and 15 Chinese deliverables drawn from `dislop`'s public `revision-v1.json`, `revision-hard-v2.json`, and `skill-revision-ext-v1.json` suites:

1. **Work docs and essays**: API release notes, postmortems, technical specs, essays, and landing copy, plus 6 clean human-written controls (`preserve`, 3 EN + 3 ZH) to measure over-editing.
2. **Office XML**: Split-run Word (`word/document.xml`) and multi-slide PowerPoint (`.pptx`) extracts with unrendered Markdown and shrink risks.
3. **Web UI**: AI-generated HTML metric cards with 3-level nested borders, prompt-echo badges (`"AI-Powered"`), and dead `href="#"` links.

For each upstream skill, we tested two modes under identical task prompts: standalone `SKILL.md`, and taking that exact pass-1 output through one deterministic `dislop` check (`detRuleIds` plus lost/invented fact checks) before a single targeted fix pass. Both Node and Python verifiers (`node scripts/run_ecosystem_benchmark.mjs --rescore-saved` and `python3 benchmarks/verify_ecosystem_numbers.py`) checked 100% parity across all 180 scored rows.

## 2. English and Chinese Results (30 Tasks)

### English Track (`15` Tasks)

| Arm | No-Veto Rate | Clean All-Clear | Composite | Fact Retention | Fact-Drift Tasks | Core Errors | Style + Pattern Hits |
|---|---:|---:|---:|---:|---:|---:|---:|
| Raw source | 13/15 (86.7%) | 3/15 (20.0%) | 75.5 | 100.0% | 0 | 5 | 29 |
| `blader/humanizer` alone | 14/15 (93.3%) | 12/15 (80.0%) | 94.3 | 100.0% | 0 | 1 | 6 |
| `blader/humanizer` + `dislop` gate | 14/15 (93.3%) | **14/15 (93.3%)** | 97.3 | **100.0%** | **0** | **0** | 2 |
| `hardikpandya/stop-slop` alone | **15/15 (100.0%)** | 11/15 (73.3%) | 94.9 | 100.0% | 0 | 2 | 3 |
| `hardikpandya/stop-slop` + `dislop` gate | **15/15 (100.0%)** | 13/15 (86.7%) | **99.5** | **100.0%** | **0** | **0** | **0** |
| `dislop` Skill + CLI | 14/15 (93.3%) | **14/15 (93.3%)** | 97.3 | **100.0%** | **0** | **0** | 2 |

### Chinese Track (`15` Tasks)

| Arm | No-Veto Rate | Clean All-Clear | Composite | Fact Retention | Fact-Drift Tasks | Core Errors | Style + Pattern Hits |
|---|---:|---:|---:|---:|---:|---:|---:|
| Raw source | 13/15 (86.7%) | 3/15 (20.0%) | 74.2 | 100.0% | 0 | 5 | 33 |
| `op7418/Humanizer-zh` alone | 13/15 (86.7%) | 7/15 (46.7%) | 89.1 | 100.0% | 0 | 1 | 11 |
| `Humanizer-zh` + `dislop` gate | 13/15 (86.7%) | 10/15 (66.7%) | 94.9 | **100.0%** | **0** | **0** | 3 |
| `larashero3-dotcom/lieflat` alone | 13/15 (86.7%) | 6/15 (40.0%) | 82.8 | 93.3% | 1 | 1 | 12 |
| `lieflat` + `dislop` gate | **14/15 (93.3%)** | 9/15 (60.0%) | 95.8 | **100.0%** | **0** | **0** | 3 |
| `dislop` Skill + CLI | **14/15 (93.3%)** | **13/15 (86.7%)** | **97.1** | **100.0%** | **0** | **0** | **2** |

All 6 clean human controls (`preserve`, 3 EN + 3 ZH) passed with `0/6` over-edit failures across every arm.

## 3. Four Raw-String Defects That Slipped Past Standalone Skills

1. **Dead `href="#"` controls and slide XML leftovers stayed untouched**: Across all four standalone skills, HTML metric cards kept dead `<a href="#">` buttons (`4/4` arms). On `rev-pptx-02-en-exec-slide`, `stop-slop` left raw `**Summary**:` Markdown and `fontScale="62500"` (`62.5%` text shrink) inside `.pptx` XML. Pairing with `dislop` cleared `core` errors to `0` across every arm.

```html
<div class="border rounded-xl p-6"><div class="border rounded-lg p-4"><div class="border rounded p-3">
  <span class="eyebrow">AI-Powered · Zero Hallucination</span>
  <h3>p95 latency: 18 ms</h3>
  <a href="#">Open benchmark</a>
</div></div></div>
```

2. **Three-clause semicolon pitches bypassed banned-word checklists**: On `rev-en-02-homepage-pitch` (one of `dislop`'s own retired landing drafts), `humanizer`, `Humanizer-zh`, and `lieflat` returned the balanced three-semicolon pitch verbatim (`3/4` arms), while `stop-slop` kept `"You keep the pen."`:

```text
Hard defects get crossed out; cliché lines get a margin query; once you edit, we check every file again. It never rewrites for you. The pen stays in your hand.
```

3. **Extreme compression dropped an entire Chinese technical spec**: On `rev-zh-03-tech-spec`, standalone `lieflat` returned a zero-token empty output (`missing:8000 QPS`, score `0`). The post-edit `dislop` gate flagged the dropped number and recovered the draft to `90/100`.
4. **Honest verifier fixes (`v0.8.2` -> `v0.8.3`)**: Our first `v0.8.2` run raised three English `dislop verify` false alarms on valid edits (`"inside 5 seconds"` -> `"within 5 seconds"`, `"3600 seconds"` -> `"3600-second"`, and `"40 million rows"` -> `"40-million-row"`). `v0.8.3` fixed upper-bound synonym matching, hyphenated unit normalization, and duplicate span deduplication, bringing English fact-drift false alarms to `0`.

## 4. Recommended Workflow and Caveats

Keep whichever writing skill matches your taste for drafting, then run deterministic verification at the gate:

```bash
# 1. Check Markdown, HTML/JSX/SVG, DOCX, PPTX, or PDF offline (zero uploads)
npx --yes dislop check . --pack auto --format agent

# 2. Verify numbers, bounds, and qualifiers against git HEAD
npx --yes dislop verify --git HEAD draft.md --strict
```

**Caveats**: This run tests `30` tasks (`15` EN + `15` ZH) on a single model (`gemini-3.5-flash`). At `n = 15` per language, Wilson 95% confidence intervals are wide (`14/15 = 93.3%` spans `[70.2%, 98.8%]`). Upstream `SKILL.md` prompts were evaluated unmodified as published on 2026-11-23. See [ECOSYSTEM-BENCHMARK.md](https://github.com/dislop-ai/dislop/blob/main/benchmarks/ECOSYSTEM-BENCHMARK.md) for the raw run log.

## FAQ

### Why did standalone prose skills miss HTML dead links and PowerPoint XML leaks?

Prompt-only writing skills focus on prose vocabulary and sentence tone. When an agent edits HTML cards or OOXML runs, prompt rules rarely trigger on attribute strings like href="#", nested card borders, or raw asterisks inside slide XML.

### Does running dislop after humanizer or stop-slop alter numbers or over-edit clean human drafts?

Across all 30 benchmark tasks and 6 clean human-written controls, pairing a style skill with dislop check and dislop verify kept English fact retention at 100.0% with 0 over-edit failures on the clean controls.

### How can I reproduce or verify these numbers locally?

Clone the dislop repository and run node scripts/run_ecosystem_benchmark.mjs --rescore-saved followed by python3 benchmarks/verify_ecosystem_numbers.py to inspect all 180 scored rows offline.

## References

- [blader/humanizer (Agent Skill based on WP:AISIGNS)](https://github.com/blader/humanizer): 71,724 stars (2026-11-21 snapshot); translates Wikipedia's Signs of AI Writing into an agent editing skill with voice sample calibration.
- [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop): 19,097 stars (2026-11-21 snapshot); separates banned phrases, structural patterns, and before/after examples with a five-axis rubric.
- [vale-cli/vale: Syntax-aware linter for prose](https://github.com/vale-cli/vale): 6,413 stars (2026-11-21 snapshot); deterministic prose linter for Markdown, HTML, and AsciiDoc built around configurable YAML style rules.
- [Artificial Hivemind: The Open-Ended Homogeneity of Language Models (and Beyond) (NeurIPS 2025)](https://arxiv.org/abs/2510.22954): Using the Infinity-Chat dataset, demonstrated both intra-model repetition and inter-model homogeneity across different LLM families.
- [GEO: Generative Engine Optimization (Aggarwal et al., ACM KDD 2024)](https://arxiv.org/abs/2311.09735): Adding verifiable statistics, primary quotations, and clear inline citations raised generative-engine visibility by up to 40%, while keyword stuffing hurt.
