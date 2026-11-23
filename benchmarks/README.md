# dislop Anti-Slop Benchmark (`dislop-bench v2`)

[简体中文](./README.zh-CN.md) · [Offline Baseline Report](./REPORT.md) · [Multi-Angle Pattern Benchmark](./PATTERN-BENCHMARK.md) · [Agent Skill Benchmark](./SKILL-BENCHMARK.md) · [Ecosystem Skill Benchmark (30 tasks)](./ECOSYSTEM-BENCHMARK.md) · [Live Model Comparison](./MODEL-COMPARISON.md)

This benchmark measures two concrete things offline, without subjective hand-waving:

1. **Detection quality (`Suite A`, 112 core samples = 48 v1 + 16 `holdout-v1` + 48 `text-hard-v2`; plus 154 samples in `PATTERN-BENCHMARK.md`)**: Precision, recall, clean false-positive rate (including adversarial near-misses), 2nd-order slogan trap recall, and exact Node.js vs. Python parity across rule findings, pattern-bank probes, and 5-axis statistical text profiles (`analyzeTextProfile`).
2. **End-to-end de-slop effectiveness (`Suite B`, 18 tasks = 12 `revision-v1` + 6 `revision-hard-v2` × 3 arms)**: Compares raw AI output, a naive humanizer rewrite, and a `dislop`-guided clean revision across 4 orthogonal dimensions (`D1=45 / D2=20 / D3=25 / D4=10`): deterministic multi-angle clearance (45 pts), 3rd-order structural hygiene (20 pts), key-number retention & prose coherence with zero hallucination (25 pts), and pure statistical rhythm & concreteness telemetry (10 pts). Current baseline: `raw_ai` `60.8` -> `naive_humanizer` `70.8` -> `dislop_clean` `100.0` (`18/18` all-clear).

All samples are original and released under `CC0-1.0`. Everything runs locally in under two seconds with zero external dependencies or API keys.

## Run locally

```bash
# Run Suite A (112 detection samples, Node + Python rule & profile parity) and Suite B (18 tasks)
node scripts/run_benchmark.mjs

# Enforce regression gates (exits 1 if precision, recall, FPR, parity, or composite drops)
node scripts/run_benchmark.mjs --assert

# Regenerate benchmarks/REPORT.md and benchmarks/results/latest.json
node scripts/run_benchmark.mjs --write-report

# Run the 154-sample multi-angle pattern benchmark and 53-pattern schema checks
node scripts/pattern_lab.mjs verify
node scripts/pattern_lab.mjs assert

# Evaluate the bundled 14.6 KB Pocket ML model on stealth-vapor-v1 + holdouts
PYTHONPATH=src python3 scripts/train_pocket_models.py --eval-only

# Run offline Agent Skill benchmark checks & card contamination lint
npm run bench:skill

# Compare 5 offline paradigms (legacy blacklists, stylometrics, TF-IDF/RF ML, multi-angle rules, hybrid telemetry)
PYTHONPATH=src python3 scripts/run_text_paradigm_experiments.py
```

## Benchmark your own model, Skill, or backend

Run any model, Skill, or hosted endpoint (for example `No Skill` vs. `dislop Skill` vs. `dislop-cloud /api/v1/deslop`) on the 18 source items across [datasets/revision-v1.json](./datasets/revision-v1.json) (12 tasks) and [datasets/revision-hard-v2.json](./datasets/revision-hard-v2.json) (6 multi-paragraph tasks), and save a `dislop.bench-run/1` JSON file:

```json
{
  "schema": "dislop.bench-run/1",
  "label": "model-ab-test",
  "arms": {
    "baseline_no_skill": {
      "rev-en-01-release-note": "..."
    },
    "with_dislop_skill": {
      "rev-en-01-release-note": "..."
    }
  }
}
```

Then score it and optionally export a randomized blind human A/B review sheet:

```bash
node scripts/run_benchmark.mjs --eval path/to/run.json
node scripts/run_benchmark.mjs --export-blind-sheet baseline_no_skill with_dislop_skill --input path/to/run.json
```

## Layout

- `datasets/detection-v1.json`: 48 cross-modality detection samples across ZH/EN briefs, essays, HTML/CSS UI, and PPTX slide decks.
- `datasets/holdout-v1.json`: 16 adversarial out-of-sample holdout cases (8 hard positives + 8 hard negatives).
- `datasets/text-hard-v2.json`: 48 hard clean-lexicon text samples testing keyword co-occurrence, punctuation cadence, narrative sandwich framing, syntactic skeleton repetition, and low-burstiness vapor.
- `datasets/pattern-challenge-v2.json`: 62 multi-angle pattern challenge samples (33 slop + 29 clean) across all 6 dimensions.
- `datasets/holdout-v2.json`: 28 unseen out-of-sample adversarial samples (14 slop + 14 clean) for pattern-library generalization.
- `datasets/stealth-vapor-v1.json`: 24 topic-matched 2–4 sentence bilingual paragraphs (12 stealth vapor + 12 grounded human prose) for Pocket ML evaluation.
- `datasets/revision-v1.json`: 12 end-to-end writing and design tasks comparing `raw_ai`, `naive_humanizer`, and `dislop_clean`.
- `datasets/revision-hard-v2.json`: 6 harder multi-paragraph clean-lexicon text revision tasks (3 ZH + 3 EN).
- `datasets/skill-routing-v1.json`: 32 bilingual Agent Skill trigger and reference-card routing cases.
- `datasets/skill-drafting-v1.json`: 12 green-field drafting tasks from structured notes with fact atoms and direction pairs.
- `datasets/skill-revision-ext-v1.json`: 12 extended revision and clean preservation tasks across `.docx`, vapor, postmortem, and regulated traps.
- `datasets/skill-holdout-v1.json`: 10 near-transfer holdout tasks spanning tracked-change `.docx`, multi-slide `.pptx`, CLI help copy, cross-language prompts, and essay length bounds.
- `REPORT.md`: Reproducible core benchmark report generated by `scripts/run_benchmark.mjs`.
- `PATTERN-BENCHMARK.md`: Reproducible 154-sample multi-angle pattern benchmark report generated by `scripts/pattern_lab.mjs`.
- `SKILL-BENCHMARK.md`: 4-arm Agent Skill benchmark report across routing, drafting, revision, clean preservation, holdout, and blind pairwise judging.
- `results/latest.json`: Machine-readable JSON output for automated tracking.
- `results/skill-benchmark-latest.json` & `results/skill-round-history.json`: Sanitized Round 1–5 Skill benchmark summaries.
