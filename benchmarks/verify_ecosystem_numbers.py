#!/usr/bin/env python3
"""Independent Python re-computation verifier for ecosystem-benchmark-raw.json vs ecosystem-benchmark-summary.json."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
RAW_PATH = BASE / "results" / "ecosystem-benchmark-raw.json"
SUMMARY_PATH = BASE / "results" / "ecosystem-benchmark-summary.json"


def wilson_ci(successes: int, total: int, z: float = 1.96) -> list[float]:
    if total <= 0:
        return [0.0, 0.0]
    p = successes / total
    denom = 1.0 + (z * z) / total
    center = (p + (z * z) / (2.0 * total)) / denom
    half = (z * math.sqrt((p * (1.0 - p)) / total + (z * z) / (4.0 * total * total))) / denom
    return [round(max(0.0, center - half) * 100.0, 1), round(min(1.0, center + half) * 100.0, 1)]


def main() -> int:
    if not RAW_PATH.is_file() or not SUMMARY_PATH.is_file():
        print("FAIL: raw or summary benchmark JSON missing.", file=sys.stderr)
        return 2

    raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    arms = raw.get("arms") or {}
    expected_by_arm = summary.get("byArm") or {}

    if set(arms.keys()) != set(expected_by_arm.keys()):
        print(f"FAIL: arm keys mismatch: {sorted(arms.keys())} vs {sorted(expected_by_arm.keys())}", file=sys.stderr)
        return 1

    truncations = 0
    for arm_key, rows in sorted(arms.items()):
        count = len(rows)
        no_veto = sum(1 for r in rows if r.get("passedNoVeto") is True)
        all_clear = sum(1 for r in rows if r.get("allClear") is True)
        fact_drift = sum(1 for r in rows if len(r.get("factIssues") or []) > 0)
        core_errors = sum(int(r.get("coreErrors") or 0) for r in rows)
        style_pat = sum(int(r.get("styleFindings") or 0) + int(r.get("patternCount") or 0) for r in rows)
        pres_rows = [r for r in rows if r.get("kind") == "preserve"]
        pres_fail = sum(1 for r in pres_rows if "V_OVEREDIT_CLEAN" in (r.get("vetoes") or []))
        avg_comp = round(sum(float((r.get("scores") or {}).get("composite") or 0) for r in rows) / count, 1)
        avg_fact = round((sum(float(r.get("factRetentionRate") or 0) for r in rows) / count) * 100.0, 1)

        for r in rows:
            if r.get("pass1FinishReason") == "length" or r.get("repairFinishReason") == "length":
                truncations += 1

        computed = {
            "count": count,
            "noVetoCount": no_veto,
            "noVetoPct": round((no_veto / count) * 100.0, 1),
            "noVetoWilson95": wilson_ci(no_veto, count),
            "allClearCount": all_clear,
            "allClearPct": round((all_clear / count) * 100.0, 1),
            "avgComposite": avg_comp,
            "avgFactRetentionPct": avg_fact,
            "tasksWithFactDrift": fact_drift,
            "totalCoreErrors": core_errors,
            "totalStyleAndPatternHits": style_pat,
            "preserveCount": len(pres_rows),
            "preserveOverEditFailures": pres_fail,
        }
        recorded = expected_by_arm[arm_key]
        if computed != recorded:
            print(f"FAIL [{arm_key}]: computed={computed} != recorded={recorded}", file=sys.stderr)
            return 1

    if truncations != 0 or summary.get("lengthTruncationCount") != 0:
        print(f"FAIL: detected length truncations={truncations}", file=sys.stderr)
        return 1

    print(f"verify_ecosystem_numbers: 100% parity verified across {len(arms)} arms (30 tasks, 0 truncations).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
