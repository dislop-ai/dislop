# What Survived After De-Slopping? Running Four Anti-Slop Agent Skills on 30 Drafts

On 2026-11-23, we fetched the upstream `SKILL.md` prompts from `blader/humanizer` (`a32f244073`), `hardikpandya/stop-slop` (`8da1f03018`), `op7418/Humanizer-zh` (`f4518a8eab`), and `larashero3-dotcom/lieflat-less-ai-tone` (`fe77df00a2`) and ran them on 30 editing tasks (`gemini-3.5-flash`, spend `$0.18886`, zero length truncations; raw outputs in `benchmarks/results/ecosystem-benchmark-raw.json`).

Note on scoring bias: the pass-rate columns in Section 2 use `dislop`'s own deterministic rule packs, which naturally favor `dislop`. Read the string-checkable raw outputs first: across all four standalone skills, every HTML task kept dead `<a href="#">` controls, `stop-slop` left raw `**Summary**:` Markdown inside `.pptx` XML, three of four skills returned our own old three-semicolon homepage pitch word for word, and `lieflat` returned a zero-token empty string on one technical spec. Pairing each skill's pass-1 output with a single `dislop` check raised clean pass rates by `+13.3` percentage points in English and `+20.0` percentage points in Chinese, with zero over-edit failures on six clean human controls.

## 1. Benchmark Setup

The 30 tasks come from `dislop`'s open `revision-v1.json`, `revision-hard-v2.json`, and `skill-revision-ext-v1.json` suites (15 English, 15 Chinese):

1. Markdown briefs, API release notes, postmortems, essays, and landing copy, including 6 clean human-written controls marked `preserve` to test over-editing.
2. Split-run Microsoft Word OOXML (`word/document.xml`) and multi-slide PowerPoint (`.pptx`) payloads containing unrendered Markdown and overflow risks.
3. AI-generated HTML metric cards with nested border frames, prompt-echo badges (`"AI-Powered"`), and dead `href="#"` controls.

For every upstream skill, we tested two modes under identical prompts: running the skill's `SKILL.md` alone, and pairing that exact first output with one deterministic `dislop` check (`detRuleIds` plus lost/invented numeric fact checks from `verifyRevision`, never exposing hidden test assertions) before a single targeted fix pass. Node and Python verifiers (`node scripts/run_ecosystem_benchmark.mjs --rescore-saved` and `python3 benchmarks/verify_ecosystem_numbers.py`) verified 100% parity across all 180 scored rows.

## 2. Results Across 15 English & 15 Chinese Tasks

### English Track (`15` Tasks)

| Arm | No-Veto Rate | Clean All-Clear | Composite | Fact Retention | Fact-Drift Tasks | Core Errors | Style + Pattern Hits |
|---|---:|---:|---:|---:|---:|---:|---:|
| Raw source (`en::raw_source`) | 13/15 (86.7%) | 3/15 (20.0%) | 75.5 | 100.0% | 0 | 5 | 29 |
| `blader/humanizer` alone | 14/15 (93.3%) | 12/15 (80.0%) | 94.3 | 100.0% | 0 | 1 | 6 |
| `blader/humanizer` + `dislop` gate | 14/15 (93.3%) | **14/15 (93.3%)** | 97.3 | **100.0%** | **0** | **0** | 2 |
| `hardikpandya/stop-slop` alone | **15/15 (100.0%)** | 11/15 (73.3%) | 94.9 | 100.0% | 0 | 2 | 3 |
| `hardikpandya/stop-slop` + `dislop` gate | **15/15 (100.0%)** | 13/15 (86.7%) | **99.5** | **100.0%** | **0** | **0** | **0** |
| `dislop` Skill + CLI | 14/15 (93.3%) | **14/15 (93.3%)** | 97.3 | **100.0%** | **0** | **0** | 2 |

### Chinese Track (`15` Tasks)

| Arm | No-Veto Rate | Clean All-Clear | Composite | Fact Retention | Fact-Drift Tasks | Core Errors | Style + Pattern Hits |
|---|---:|---:|---:|---:|---:|---:|---:|
| Raw source (`zh::raw_source`) | 13/15 (86.7%) | 3/15 (20.0%) | 74.2 | 100.0% | 0 | 5 | 33 |
| `op7418/Humanizer-zh` alone | 13/15 (86.7%) | 7/15 (46.7%) | 89.1 | 100.0% | 0 | 1 | 11 |
| `op7418/Humanizer-zh` + `dislop` gate | 13/15 (86.7%) | 10/15 (66.7%) | 94.9 | **100.0%** | **0** | **0** | 3 |
| `larashero3-dotcom/lieflat` alone | 13/15 (86.7%) | 6/15 (40.0%) | 82.8 | 93.3% | 1 | 1 | 12 |
| `larashero3-dotcom/lieflat` + `dislop` gate | **14/15 (93.3%)** | 9/15 (60.0%) | 95.8 | **100.0%** | **0** | **0** | 3 |
| `dislop` Skill + CLI | **14/15 (93.3%)** | **13/15 (86.7%)** | **97.1** | **100.0%** | **0** | **0** | **2** |

All six clean-preservation controls (`preserve`, 3 EN + 3 ZH) passed with `0` over-edit failures across every arm.

## 3. Four Verbatim Observations from the Raw Outputs

1. **HTML dead links and `.pptx` Markdown leftovers pass prose skills untouched**: On `rev-ui-02-en-metrics-card`, both `humanizer` and `stop-slop` left `<a href="#">` and 3-level nested borders in place; on `rev-pptx-02-en-exec-slide`, `stop-slop` left raw `**Summary**:` Markdown and `fontScale="62500"` (`62.5%` text shrink) inside slide XML. On `rev-ui-01-zh-landing-card`, both `Humanizer-zh` and `lieflat` kept the indigo-purple gradient, `"AI-Powered"` badge, and `<a href="#">` button. Pairing with `dislop` reduced `core` errors to `0` across every arm.

```html
<div class="border rounded-xl p-6"><div class="border rounded-lg p-4"><div class="border rounded p-3">
  <span class="eyebrow">AI-Powered · Zero Hallucination</span>
  <h3>p95 latency: 18 ms</h3>
  <a href="#">Open benchmark</a>
</div></div></div>
```

2. **Three-clause semicolon pitches and closing aphorisms slip past banned-word lists**: `rev-en-02-homepage-pitch` is an earlier draft of `dislop`'s own homepage pitch. `humanizer` returned it word for word (`59/100`), `Humanizer-zh` and `lieflat` returned the Chinese equivalent word for word, and `stop-slop` kept `"You keep the pen."`:

```text
Hard defects get crossed out; cliché lines get a margin query; once you edit, we check every file again. It never rewrites for you. The pen stays in your hand.
```

3. **Aggressive compression can drop an entire spec**: Both English skills preserved 100% of numbers across all 15 English tasks. On the Chinese technical spec `rev-zh-03-tech-spec`, standalone `lieflat` returned a zero-token empty response (`missing:8000 QPS`, score `0`), which the post-edit `dislop` gate caught and recovered to `90/100`.

4. **Self-correction receipt (`v0.8.2` -> `v0.8.3`)**: In our initial `v0.8.2` run, `verifyRevision` raised three false alarms on valid English rewrites: `humanizer` rewriting `"inside 5 seconds"` to `"within 5 seconds"` (`rev2-en-01-api-release`), `stop-slop` rewriting `"3600 seconds"` to `"3600-second"` (`rev2-en-02-postmortem`), and `dislop` tightening a repeated `"40 million rows"` summary bullet into one `"40-million-row"` line (`rev-en-03-rfc-summary`). `v0.8.3` adds `inside` to `max_inc`, normalizes hyphenated English unit compounds, and deduplicates repeated identical facts, bringing English fact-drift false alarms to `0` across all arms.

## 4. Recommended Workflow: Keep Your Rewriter, Add a Gate

You do not need to replace `humanizer`, `stop-slop`, `Humanizer-zh`, or `lieflat`. Keep whichever style skill fits your voice for first-pass drafting, then run a deterministic post-check to catch leaked chat wrappers, HTML/Office leftovers, closing slogans, and dropped numbers:

```bash
# Check Markdown, HTML, DOCX, PPTX, or PDF offline (zero uploads)
npx --yes dislop check . --pack auto

# Compare edited text against git HEAD to catch dropped numbers or qualifiers
npx --yes dislop verify --git HEAD draft.md --strict
```

Or send one sentence to your coding agent (Claude Code, Codex, Cursor, or Gemini CLI) pointing to `https://dislop.com/llms.txt`. The agent selects Skill, local CLI, or Cloud MCP for your repo and checks existing files automatically.

## 5. Limitations & Honest Caveats

This run covers `30` tasks (`15` EN + `15` ZH) on a single model (`gemini-3.5-flash`) at low sample counts per domain; Wilson 95% confidence intervals on `15`-task rates are wide (for `14/15 = 93.3%`, `[70.2%, 98.8%]`). Evaluating upstream `SKILL.md` prompts unmodified tests their default behavior as distributed on 2026-11-23. Paired arms reuse each competitor's pass-1 output plus one deterministic repair prompt to isolate gate impact.
