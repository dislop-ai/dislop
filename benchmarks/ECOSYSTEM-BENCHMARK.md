# After De-Slopping, What Broke? Testing Four Anti-Slop Agent Skills on 30 Real Drafts

On 2026-11-23, we fetched the upstream `SKILL.md` prompts from `blader/humanizer` (`a32f244073`), `hardikpandya/stop-slop` (`8da1f03018`), `op7418/Humanizer-zh` (`f4518a8eab`), and `larashero3-dotcom/lieflat-less-ai-tone` (`fe77df00a2`) and ran them on 30 real editing tasks (`gemini-3.5-flash`, spend `$0.18886`, zero length truncations).

Standalone rewrite skills cleared obvious prose buzzwords fast, yet 27% to 60% of their edited outputs still failed post-edit checks because HTML dead links, `.pptx` layout defects, 2nd-order closing slogans, or numeric qualifiers slipped through. Adding a deterministic post-edit `dislop` check + single targeted fix raised clean pass rates by `+20.0` percentage points across all four tested skills without degrading clean human controls.

## 1. Benchmark Setup

The 30 tasks come from `dislop`'s open `revision-v1.json`, `revision-hard-v2.json`, and `skill-revision-ext-v1.json` suites (15 English, 15 Chinese):

1. Markdown briefs, API release notes, postmortems, essays, and landing copy (including 6 clean human-written controls marked `preserve` to test over-editing).
2. Split-run Microsoft Word OOXML (`word/document.xml`) and multi-slide PowerPoint (`.pptx`) payloads containing unrendered Markdown and overflow risks.
3. AI-generated HTML metric cards with nested border frames, prompt-echo badges (`"AI-Powered"`), and dead `href="#"` controls.

For every upstream skill, we tested two modes under identical prompts: running the skill's `SKILL.md` alone, and pairing that exact first output with one deterministic `dislop` check (`detRuleIds` plus lost/invented numeric fact checks from `verifyRevision`, never exposing hidden test assertions) before a single surgical fix pass. Two independent scripts (Node + Python) and a read-only cross-vendor audit (`codex`) verified 100% parity on all 180 scored rows.

## 2. Results Across 15 English & 15 Chinese Tasks

### English Track (`15` Tasks)

| Arm | No-Veto Rate | Clean All-Clear | Composite | Fact Retention | Fact-Drift Tasks | Core Errors | Style + Pattern Hits |
|---|---:|---:|---:|---:|---:|---:|---:|
| Raw source (`en::raw_source`) | 13/15 (86.7%) | 3/15 (20.0%) | 75.5 | 100.0% | 0 | 5 | 29 |
| `blader/humanizer` alone | 13/15 (86.7%) | 11/15 (73.3%) | 92.9 | 97.8% | 1 | 1 | 6 |
| `blader/humanizer` + `dislop` gate | 14/15 (93.3%) | **14/15 (93.3%)** | 97.3 | **100.0%** | **0** | **0** | 2 |
| `hardikpandya/stop-slop` alone | 14/15 (93.3%) | 10/15 (66.7%) | 93.9 | 99.2% | 1 | 2 | 3 |
| `hardikpandya/stop-slop` + `dislop` gate | **15/15 (100.0%)** | 13/15 (86.7%) | **99.5** | **100.0%** | **0** | **0** | **0** |
| `dislop` Skill + CLI | 13/15 (86.7%) | 13/15 (86.7%) | 96.1 | 98.7% | 1 | 0 | 2 |

### Chinese Track (`15` Tasks)

| Arm | No-Veto Rate | Clean All-Clear | Composite | Fact Retention | Fact-Drift Tasks | Core Errors | Style + Pattern Hits |
|---|---:|---:|---:|---:|---:|---:|---:|
| Raw source (`zh::raw_source`) | 13/15 (86.7%) | 3/15 (20.0%) | 74.2 | 100.0% | 0 | 5 | 33 |
| `op7418/Humanizer-zh` alone | 13/15 (86.7%) | 7/15 (46.7%) | 89.1 | 100.0% | 0 | 1 | 11 |
| `op7418/Humanizer-zh` + `dislop` gate | 13/15 (86.7%) | 10/15 (66.7%) | 94.9 | **100.0%** | **0** | **0** | 3 |
| `larashero3-dotcom/lieflat` alone | 13/15 (86.7%) | 6/15 (40.0%) | 82.8 | 93.3% | 1 | 1 | 12 |
| `larashero3-dotcom/lieflat` + `dislop` gate | 14/15 (93.3%) | 9/15 (60.0%) | 95.8 | **100.0%** | **0** | **0** | 3 |
| `dislop` Skill + CLI | **14/15 (93.3%)** | **13/15 (86.7%)** | **97.1** | **100.0%** | **0** | **0** | **2** |

All six clean-preservation controls (`preserve`, 3 EN + 3 ZH) passed with `0` over-edit failures across every arm.

## 3. Four Concrete Failure Modes Found in Raw Outputs

1. **Unrendered HTML and Office leftovers pass prose skills undetected**: On `rev-ui-02-en-metrics-card`, `humanizer` kept the dead `<a href="#">` control, `"AI-Powered · Zero Hallucination"` prompt badge, and 3-level nested borders untouched (`65/100`). On `rev-ui-01-zh-landing-card`, both `Humanizer-zh` and `lieflat` left an indigo-purple gradient and `<a href="#">` link intact. Pairing with `dislop` cleared every UI and `.pptx` `core` error (`0` remaining across all paired arms).

```html
<div class="border rounded-xl p-6"><div class="border rounded-lg p-4"><div class="border rounded p-3">
  <span class="eyebrow">AI-Powered · Zero Hallucination</span>
  <h3>p95 latency: 18 ms</h3>
  <a href="#">Open benchmark</a>
</div></div></div>
```

2. **Three-part semicolon pitches and closer aphorisms look clean to lexicon filters**: On `rev-en-02-homepage-pitch`, raw and rewritten prose still kept a three-clause semicolon pitch paired with a closer line (`59/100`):

```text
Hard defects get crossed out; cliché lines get a margin query; once you edit, we check every file again. It never rewrites for you. The pen stays in your hand.
```

3. **Numeric qualifiers get dropped during prose smoothing**: On `rev2-en-01-api-release`, `humanizer` dropped the `5 seconds` qualifier during cleanup (`qDrop:5 seconds`). On `rev-zh-03-tech-spec`, `lieflat` returned an empty output (`missing:8000 QPS`, score `0`), which the deterministic `dislop` gate caught and recovered to `90/100`.

4. **Hyphenation causes a reversible false alarm in `verifyRevision`**: On `rev2-en-02-postmortem` (`stop-slop` -> `"3600-second DNS TTL"`) and `rev-en-03-rfc-summary` (`dislop` -> `"40-million-row"`), the underlying number stayed present in text, yet strict numeric boundary tokenization flagged `"3600 seconds"` and `"40"`. We document that tokenizer edge case openly below.

## 4. Recommended Workflow: Keep Your Rewriter, Add a Gate

You do not need to abandon `humanizer`, `stop-slop`, `Humanizer-zh`, or `lieflat`. Keep whichever style skill matches your voice for first-pass drafting, then let a deterministic post-check catch leaked chat wrappers, HTML/Office defects, 2nd-order slogans, and dropped numbers:

```bash
# Check Markdown, HTML, DOCX, PPTX, or PDF offline (zero uploads)
npx --yes dislop check . --pack auto

# Compare edited text against git HEAD to catch dropped numbers or qualifiers
npx --yes dislop verify --git HEAD draft.md --strict
```

Or send one sentence to your coding agent (Claude Code, Codex, Cursor, or Gemini CLI) pointing to `https://dislop.com/llms.txt`. The agent selects Skill, local CLI, or Cloud MCP for your repo and checks existing files automatically.

## 5. Limitations & Honest Caveats

This run covers `30` tasks (`15` EN + `15` ZH) on a single model (`gemini-3.5-flash`) at low sample counts per domain; Wilson 95% confidence intervals on `15`-task rates are wide (for `14/15 = 93.3%`, `[70.2%, 98.8%]`). Evaluating upstream `SKILL.md` prompts without modifying them tests their default behavior as distributed on 2026-11-23. Paired arms reuse each competitor's pass-1 output plus one deterministic repair prompt to isolate gate impact. Finally, our numeric diff tokenizer flags hyphenated rewrites like `"40 million"` -> `"40-million-row"` or `"3600 seconds"` -> `"3600-second"`, explaining both `rev-en-03-rfc-summary` (`dislop_skill_cli`) and `rev2-en-02-postmortem` (`stop_slop`).
