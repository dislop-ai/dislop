"""Unit and cross-runtime parity tests for the AI-Slop Pattern Library & Multi-Angle Engine."""

from __future__ import annotations

import json
import os
import subprocess
import unittest
from pathlib import Path

from dislop.pattern_engine import analyze_pattern_profile, load_pattern_banks

REPO_ROOT = Path(__file__).resolve().parent.parent


def run_node(args: list[str], stdin_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(REPO_ROOT / "bin" / "dislop.mjs"), *args],
        cwd=REPO_ROOT,
        input=stdin_text,
        capture_output=True,
        text=True,
    )


def run_py(args: list[str], stdin_text: str | None = None) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "PYTHONPATH": str(REPO_ROOT / "src")}
    return subprocess.run(
        ["python3", "-m", "dislop.cli", *args],
        cwd=REPO_ROOT,
        env=env,
        input=stdin_text,
        capture_output=True,
        text=True,
    )


class PatternLibraryTests(unittest.TestCase):
    def test_pattern_library_schema_and_pack_linkage(self) -> None:
        proc = subprocess.run(
            ["node", str(REPO_ROOT / "scripts" / "pattern_lab.mjs"), "verify"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
        self.assertIn("65 patterns", proc.stdout)

    def test_catalog_cli_and_mcp_parity(self) -> None:
        rn = run_node(["catalog", "--query", "不是", "--json"])
        rp = run_py(["catalog", "--query", "不是", "--json"])
        self.assertEqual(rn.returncode, 0, rn.stderr)
        self.assertEqual(rp.returncode, 0, rp.stderr)
        jn = json.loads(rn.stdout)
        jp = json.loads(rp.stdout)
        self.assertEqual(jn, jp)
        self.assertEqual(jn["schema"], "dislop.catalog/1")
        self.assertTrue(any(item["id"] == "negation-pivot-frame" for item in jn["items"]))

        mcp_reqs = "\n".join(
            [
                json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}),
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {"name": "dislop_catalog", "arguments": {"dimension": "rhythm", "includeExemplars": False}},
                    }
                ),
            ]
        ) + "\n"
        mn = run_node(["--mcp"], stdin_text=mcp_reqs)
        mp = run_py(["--mcp"], stdin_text=mcp_reqs)
        n_payload = json.loads(json.loads(mn.stdout.strip().splitlines()[1])["result"]["content"][0]["text"])
        p_payload = json.loads(json.loads(mp.stdout.strip().splitlines()[1])["result"]["content"][0]["text"])
        self.assertEqual(n_payload, p_payload)
        self.assertGreaterEqual(n_payload["matched"], 4)

    def test_patterns_cli_exact_json_parity_across_angles(self) -> None:
        cases = [
            (
                "rhythm.md",
                "首先，统一数据口径。\n\n其次，补齐回归脚本。\n\n最后，更新发布清单。",
                "discourse-marker-cluster",
            ),
            (
                "calque.md",
                "在数字化转型的背景下，不可否认的是，缓存优化在系统稳定性中扮演着至关重要的角色。",
                "zh-ai-calque-cluster",
            ),
            (
                "stealth.md",
                "Additionally, clear observability plays a vital role in modern workflows. It delivers significant value for seamless collaboration.",
                "composite-multi-signal",
            ),
            (
                "glass.html",
                '<div class="backdrop-blur-md">A</div><div class="backdrop-blur-lg">B</div><div class="backdrop-blur-sm">C</div>',
                "ui-glassmorphism-overuse",
            ),
            (
                "gen2.html",
                '<section class="bg-[#faf8f5] rounded-2xl shadow-xl"><span class="uppercase tracking-widest">Intro</span><h2>Build <em>faster</em></h2><a style="color:#c45a3b">Go</a></section>',
                "ui-gen2-tasteful-slop",
            ),
            (
                "clean-facts.md",
                "此外，缓存预热对大促稳定性至关重要：上周 20:00 压测 12 台节点后，接口耗时从 180 毫秒降到 34 毫秒，错误率压在 0.05% 以下。",
                None,
            ),
        ]
        for filename, text, expected_rule in cases:
            rn = run_node(["patterns", "-", "--stdin-filename", filename, "--json"], stdin_text=text)
            rp = run_py(["patterns", "-", "--stdin-filename", filename, "--json"], stdin_text=text)
            self.assertEqual(rn.returncode, 0, rn.stderr)
            self.assertEqual(rp.returncode, 0, rp.stderr)
            jn = json.loads(rn.stdout)
            jp = json.loads(rp.stdout)
            self.assertEqual(jn, jp, f"Node/Python mismatch on {filename}")
            found_ids = [f["ruleId"] for f in jn["findings"]]
            if expected_rule:
                self.assertIn(expected_rule, found_ids, f"Missed {expected_rule} on {filename}")
            else:
                self.assertEqual(found_ids, [], f"Unexpected FP on {filename}: {found_ids}")

    def test_holdout_v2_unseen_adversarial_gate(self) -> None:
        banks = load_pattern_banks()
        holdout = json.loads((REPO_ROOT / "benchmarks" / "datasets" / "holdout-v2.json").read_text(encoding="utf-8"))
        for sample in holdout["samples"]:
            prof = analyze_pattern_profile(
                sample.get("text") or "",
                filename=sample.get("filename", "sample.md"),
                modality=sample.get("modality", "markdown"),
                banks=banks,
                ooxml=sample.get("ooxml"),
            )
            found = {f["ruleId"] for f in prof["findings"]}
            if sample["expected"] == "slop":
                for req in sample.get("expectedRuleIds", []):
                    self.assertIn(req, found, f"holdout-v2 missed {req} on {sample['id']}")
            else:
                self.assertEqual(found, set(), f"holdout-v2 false positive on {sample['id']}: {found}")


if __name__ == "__main__":
    unittest.main()
