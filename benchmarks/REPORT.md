# dislop-bench v3 Report

Run date: 2026-11-28T02:43:07.793Z | Runtime: Node.js v24.21.0 | Kernel: v1.1.2 Micro-Kernel

## Summary Gates

| Gate | Actual | Status |
| :--- | :--- | :--- |
| Track A1 Defect Clean FPR === 0.0% | 0% (0/15) | PASS |
| Track A1 Defect Precision >= 98.0% | 100% | PASS |
| Track A1 Defect Recall >= 96.0% | 100% (20/20) | PASS |
| Track A2 Suggestion Clean FPR === 0.0% | 0% (0/23) | PASS |
| Track A2 Suggestion Recall >= 95.0% | 100% (28/28) | PASS |
| Semantic & Security Invariants === 100.0% | 100% (18/18) | PASS |
| Revision Tasks Fact Gate === 100.0% | 100% (18/18) | PASS |
| Revision Tasks Slop Clearance === 100.0% | 100% (0 remaining) | PASS |
| Adversarial Fact Gate Pairs === 100.0% | 100% (8/8) | PASS |
| fix --auto Lossless Round-Trips === 100.0% | 100% (4/4) | PASS |

## Suite Details

- **Multimodal Detection (`active-multimodal-v3.json`, 86 samples)**: Track A1 Defect Precision 100%, Recall 100%, Clean FPR 0%; Track A2 Suggestion Recall 100%, Clean FPR 0%.
- **Semantic & Security (`semantic-and-security-v3.json`, 18 cases)**: 18/18 (100%) passed prompt escaping, trust clamping, and anti-fabrication Fact Gate verification.
- **Revision & Fact Gate (`revision-and-factgate-v3.json`)**: 18/18 revision tasks preserved 100% of facts (`dislop_clean` cleared 19 -> 0 findings; `naive_humanizer` triggered 11 fact-integrity failures); 8/8 adversarial Fact Gate pairs passed; 4/4 `fix --auto` lossless round-trips passed.
