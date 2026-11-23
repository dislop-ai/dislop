"""Round 2 tests: --register resolution precedence, registerOverrides, confidence, structured revision, and --format agent."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def run_node(
    args: list[str],
    cwd: Path = REPO_ROOT,
    stdin_text: str | None = None,
) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(REPO_ROOT / "bin" / "dislop.mjs"), *args],
        cwd=str(cwd),
        input=stdin_text,
        capture_output=True,
        text=True,
    )


def run_py(
    args: list[str],
    cwd: Path = REPO_ROOT,
    stdin_text: str | None = None,
) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT / "src")
    return subprocess.run(
        [sys.executable, "-m", "dislop.cli", *args],
        cwd=str(cwd),
        input=stdin_text,
        capture_output=True,
        text=True,
        env=env,
    )


class RegisterAndRevisionTests(unittest.TestCase):
    def test_register_precedence_and_invalid_flag(self) -> None:
        # Invalid --register must fail cleanly with exit 2 in both runtimes
        for fn in (run_node, run_py):
            bad = fn(["check", "--register", "academic", "-"], stdin_text="Clean sentence.\n")
            self.assertEqual(bad.returncode, 2)
            self.assertIn("invalid --register", bad.stderr.lower())

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            docs_dir = root / "docs"
            docs_dir.mkdir(parents=True)
            cfg = {
                "pack": "business-brief",
                "register": "marketing",
                "overrides": [{"files": ["docs/**/*.md"], "register": "official"}],
            }
            (root / ".dislop.json").write_text(json.dumps(cfg), encoding="utf-8")

            # Frontmatter overrides config override
            fm_file = docs_dir / "essay.md"
            fm_file.write_text(
                "---\nregister: narrative\ndislop_register: argumentative\n---\n\n真正的自由不是想做什么就做什么，而是清楚边界之后的主动选择。\n",
                encoding="utf-8",
            )
            # No frontmatter -> config override (official)
            ov_file = docs_dir / "notice.md"
            ov_file.write_text("我们要持续赋能门店运营。\n", encoding="utf-8")
            # Unknown YAML frontmatter register value ignored gracefully -> falls back to top-level config (marketing)
            top_file = root / "landing.md"
            top_file.write_text("---\nregister: blogpost\n---\n\nSignals drop. Photos vanish. Trust dies.\n", encoding="utf-8")

            for fn in (run_node, run_py):
                r_fm = fn(["check", "docs/essay.md", "--json"], cwd=root)
                j_fm = json.loads(r_fm.stdout)
                self.assertEqual(j_fm["context"], {"register": "argumentative", "registerSource": "frontmatter"})
                self.assertEqual(j_fm["findings"][0]["severity"], "info")
                self.assertEqual(j_fm["findings"][0]["confidence"], "low")

                # Explicit CLI flag beats frontmatter
                r_flag = fn(["check", "docs/essay.md", "--register", "official", "--json"], cwd=root)
                j_flag = json.loads(r_flag.stdout)
                self.assertEqual(j_flag["context"], {"register": "official", "registerSource": "flag"})
                self.assertEqual(j_flag["findings"][0]["severity"], "warning")

                r_ov = fn(["check", "docs/notice.md", "--json"], cwd=root)
                j_ov = json.loads(r_ov.stdout)
                self.assertEqual(j_ov["context"], {"register": "official", "registerSource": "config"})
                self.assertEqual(j_ov["findings"][0]["severity"], "info")

                r_top = fn(["check", "landing.md", "--json"], cwd=root)
                j_top = json.loads(r_top.stdout)
                self.assertEqual(j_top["context"], {"register": "marketing", "registerSource": "config"})
                self.assertEqual(j_top["findings"][0]["severity"], "info")

    def test_argumentative_dialectic_vs_default(self) -> None:
        sample = "真正的自由不是想做什么就做什么，而是清楚边界之后的主动选择。\n"
        rn_def = run_node(["check", "-", "--fail-on", "warning", "--json"], stdin_text=sample)
        rp_def = run_py(["check", "-", "--fail-on", "warning", "--json"], stdin_text=sample)
        self.assertEqual(rn_def.returncode, 1)
        self.assertEqual(rp_def.returncode, 1)
        jn_def = json.loads(rn_def.stdout)
        jp_def = json.loads(rp_def.stdout)
        self.assertEqual(jn_def, jp_def)
        self.assertEqual(jn_def["findings"][0]["severity"], "warning")
        self.assertEqual(jn_def["findings"][0]["confidence"], "medium")

        rn_arg = run_node(["check", "-", "--register", "argumentative", "--fail-on", "warning", "--json"], stdin_text=sample)
        rp_arg = run_py(["check", "-", "--register", "argumentative", "--fail-on", "warning", "--json"], stdin_text=sample)
        self.assertEqual(rn_arg.returncode, 0)
        self.assertEqual(rp_arg.returncode, 0)
        jn_arg = json.loads(rn_arg.stdout)
        jp_arg = json.loads(rp_arg.stdout)
        self.assertEqual(jn_arg, jp_arg)
        self.assertEqual(jn_arg["context"], {"register": "argumentative", "registerSource": "flag"})
        self.assertEqual(jn_arg["findings"][0]["severity"], "info")
        self.assertEqual(jn_arg["findings"][0]["confidence"], "low")

    def test_technical_skips_low_burstiness_and_pocket_ml_but_core_never_downgrades(self) -> None:
        vapor = (
            "The platform delivers consistent performance across diverse enterprise workflows. "
            "Teams maintain clear visibility into ongoing operational priorities. "
            "Stakeholders receive timely updates regarding strategic project milestones. "
            "Automated processes reduce repetitive overhead for busy specialists. "
            "Flexible configurations support evolving organizational requirements smoothly. "
            "Reliable infrastructure sustains long-term confidence among partner teams.\n\n"
            "Sure, here's the rewritten section with [TBD] owner and clearer details.\n"
        )
        rn_def = run_node(["check", "-", "--ml", "--json"], stdin_text=vapor)
        rp_def = run_py(["check", "-", "--ml", "--json"], stdin_text=vapor)
        self.assertEqual(rn_def.returncode, 1)
        self.assertEqual(rp_def.returncode, 1)
        ids_def = {f["ruleId"] for f in json.loads(rn_def.stdout)["findings"]}
        self.assertIn("low-burstiness-vapor", ids_def)
        self.assertIn("chatbot-artifact", ids_def)
        self.assertIn("unfilled-placeholder", ids_def)

        rn_tech = run_node(["check", "-", "--ml", "--register", "technical", "--json"], stdin_text=vapor)
        rp_tech = run_py(["check", "-", "--ml", "--register", "technical", "--json"], stdin_text=vapor)
        jn_tech = json.loads(rn_tech.stdout)
        jp_tech = json.loads(rp_tech.stdout)
        self.assertEqual(jn_tech, jp_tech)
        ids_tech = {f["ruleId"] for f in jn_tech["findings"]}
        self.assertNotIn("low-burstiness-vapor", ids_tech)
        self.assertNotIn("pocket-stealth-vapor", ids_tech)
        # Core invariant rules never downgrade
        core_hits = [f for f in jn_tech["findings"] if f["tier"] == "invariant"]
        self.assertTrue(len(core_hits) >= 2)
        for ch in core_hits:
            self.assertEqual(ch["severity"], "error")
            self.assertEqual(ch["confidence"], "high")

    def test_revision_keep_scoped_and_config_rule_lock(self) -> None:
        doc = (
            "Unrelated paragraph cites 999 ms and 42 shards before any issue.\n\n"
            "It is worth noting that CSV exports take up to 12 minutes for 500,000 rows using `worker_pool`.\n"
        )
        rn = run_node(["check", "-", "--json"], stdin_text=doc)
        rp = run_py(["check", "-", "--json"], stdin_text=doc)
        jn = json.loads(rn.stdout)
        jp = json.loads(rp.stdout)
        self.assertEqual(jn, jp)
        f0 = jn["findings"][0]
        self.assertEqual(f0["revision"]["kind"], "delete")
        self.assertEqual(f0["revision"]["scope"], "span")
        keep = f0["revision"]["keep"]
        self.assertIn("`worker_pool`", keep)
        self.assertIn("up to 12 minutes", keep)
        self.assertIn("500,000 rows", keep)
        self.assertNotIn("999 ms", keep)
        self.assertNotIn("42", keep)

        # User explicit config rule override should not be overwritten by registerOverrides
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".dislop.json").write_text(
                json.dumps({"rules": {"negation-pivot-frame": "error"}}),
                encoding="utf-8",
            )
            (root / "a.md").write_text("这不是工具，而是底气。\n", encoding="utf-8")
            rn_l = json.loads(run_node(["check", "a.md", "--register", "argumentative", "--json"], cwd=root).stdout)
            rp_l = json.loads(run_py(["check", "a.md", "--register", "argumentative", "--json"], cwd=root).stdout)
            self.assertEqual(rn_l, rp_l)
            self.assertEqual(rn_l["findings"][0]["severity"], "error")

    def test_agent_format_parity_sorting_cap_and_zh_purity(self) -> None:
        # Build >32 findings (mix of info, warning, error) to test sorting & 30-item cap
        lines = []
        for i in range(18):
            lines.append(f"Draft item alpha-{i} is a game-changer for enterprise telemetry.\n")
        for _ in range(16):
            lines.append("Draft item note [TBD] owner before release.\n")
        sample = "\n".join(lines)

        rn_en = run_node(["check", "-", "--format", "agent"], stdin_text=sample)
        rp_en = run_py(["check", "-", "--format", "agent"], stdin_text=sample)
        self.assertEqual(rn_en.returncode, 1)
        self.assertEqual(rp_en.returncode, 1)
        self.assertEqual(rn_en.stdout, rp_en.stdout)
        en_lines = rn_en.stdout.strip().splitlines()
        self.assertIn("findings=35", en_lines[0])
        # Error findings sorted before info findings
        self.assertTrue(en_lines[1].startswith("[error]"))
        self.assertIn("... +5 more findings (use --format json for full list)", en_lines[-1])
        # No keep= suffix when no facts exist
        self.assertNotIn("| keep=", en_lines[1])

        rn_zh = run_node(["check", "-", "--format", "agent", "--lang", "zh", "--register", "official"], stdin_text="我们要全面赋能并关注 [TBD] 模块（延迟 20 ms）。\n")
        rp_zh = run_py(["check", "-", "--format", "agent", "--lang", "zh", "--register", "official"], stdin_text="我们要全面赋能并关注 [TBD] 模块（延迟 20 ms）。\n")
        self.assertEqual(rn_zh.stdout, rp_zh.stdout)
        self.assertIn("[硬伤]", rn_zh.stdout)
        self.assertIn("[提示]", rn_zh.stdout)
        self.assertIn("语体=公文·参数", rn_zh.stdout)
        self.assertIn("保留=20 ms", rn_zh.stdout)
        self.assertNotIn("finding", rn_zh.stdout)
        self.assertNotIn("confidence", rn_zh.stdout)

        # Quiet filters info/warning when fail-on is error
        rn_q = run_node(["check", "-", "--format", "agent", "--quiet", "--fail-on", "error"], stdin_text="我们要全面赋能业务，预算控制在 50 万元。\n")
        rp_q = run_py(["check", "-", "--format", "agent", "--quiet", "--fail-on", "error"], stdin_text="我们要全面赋能业务，预算控制在 50 万元。\n")
        self.assertEqual(rn_q.returncode, 0)
        self.assertEqual(rn_q.stdout, "")
        self.assertEqual(rp_q.stdout, "")

    def test_mcp_register_and_compact_revision_parity(self) -> None:
        reqs = "\n".join(
            [
                json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}),
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {
                            "name": "dislop_check",
                            "arguments": {
                                "text": "真正的自由不是想做什么就做什么，而是清楚边界之后的主动选择。",
                                "register": "argumentative",
                                "lang": "zh",
                            },
                        },
                    }
                ),
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 3,
                        "method": "tools/call",
                        "params": {
                            "name": "dislop_check",
                            "arguments": {
                                "text": "Clean text.",
                                "register": "bogus",
                            },
                        },
                    }
                ),
            ]
        ) + "\n"
        rn = run_node(["--mcp"], stdin_text=reqs)
        rp = run_py(["--mcp"], stdin_text=reqs)
        self.assertEqual(rn.returncode, 0)
        self.assertEqual(rp.returncode, 0)
        n_msgs = [json.loads(line) for line in rn.stdout.strip().splitlines()]
        p_msgs = [json.loads(line) for line in rp.stdout.strip().splitlines()]
        self.assertEqual(n_msgs[0], p_msgs[0])
        n_payload = json.loads(n_msgs[1]["result"]["content"][0]["text"])
        p_payload = json.loads(p_msgs[1]["result"]["content"][0]["text"])
        self.assertEqual(n_payload["context"], p_payload["context"])
        self.assertEqual(n_payload["findings"], p_payload["findings"])
        payload = n_payload
        self.assertEqual(payload["context"], {"register": "argumentative", "registerSource": "flag"})
        self.assertEqual(payload["findings"][0]["severity"], "info")
        self.assertEqual(payload["findings"][0]["confidence"], "low")
        self.assertIn("revision", payload["findings"][0])
        self.assertEqual(list(payload["findings"][0]["revision"]["instruction"].keys()), ["zh"])
        self.assertNotIn("exemplar", payload["findings"][0])
        self.assertTrue(n_msgs[2]["result"]["isError"])
        self.assertTrue(p_msgs[2]["result"]["isError"])

        # Regression guard: MCP dislop_check with ml=True and default register must succeed cleanly
        ml_req = json.dumps({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "dislop_check",
                "arguments": {
                    "text": "During ongoing collaboration across multiple business stakeholders, teams maintain steady alignment on strategic workflows while balancing delivery milestones across 14 regional offices.",
                    "ml": True,
                },
            },
        }) + "\n"
        rn_ml = json.loads(run_node(["--mcp"], stdin_text=ml_req).stdout.strip())
        rp_ml = json.loads(run_py(["--mcp"], stdin_text=ml_req).stdout.strip())
        self.assertFalse(rn_ml["result"].get("isError", False))
        self.assertFalse(rp_ml["result"].get("isError", False))
        n_ml_pay = json.loads(rn_ml["result"]["content"][0]["text"])
        p_ml_pay = json.loads(rp_ml["result"]["content"][0]["text"])
        self.assertEqual(n_ml_pay["context"], p_ml_pay["context"])
        self.assertEqual(n_ml_pay["findings"], p_ml_pay["findings"])

    def test_round2_codex_and_opus_regressions_parity(self) -> None:
        # 1. --patterns and --deep MUST NOT reintroduce low-burstiness-vapor under --register technical
        vapor_rep = "The system provides flexible options that adapt to various operational needs across projects smoothly.\n" * 5
        for fn in (run_node, run_py):
            r_deep = fn(["check", "-", "--pack", "business-brief", "--deep", "--register", "technical", "--fail-on", "info", "--rule", "low-burstiness-vapor", "--json"], stdin_text=vapor_rep)
            self.assertEqual(r_deep.returncode, 0)
            self.assertEqual(json.loads(r_deep.stdout)["findings"], [])

        # 2. revision.keep unclipped past 240 chars, preserves units/bounds/dates/code dots, & full-para ML keep
        long_sent = (
            "It is worth noting that "
            + "very steady operational padding across distributed tenant replicas " * 4
            + "for `api.v2` telemetry costs 50 万元, completes in 45 秒内, caps at 不超过 200 毫秒, runs at least 3x faster on Nov 22, 2026 ($1.2M), and handles 🚀 up to 500,000 rows."
        )
        rn_k = run_node(["check", "-", "--json"], stdin_text=long_sent)
        rp_k = run_py(["check", "-", "--json"], stdin_text=long_sent)
        self.assertEqual(rn_k.stdout, rp_k.stdout)
        keep_items = json.loads(rn_k.stdout)["findings"][0]["revision"]["keep"]
        for expected in ("`api.v2`", "50 万元", "45 秒内", "不超过 200 毫秒", "at least 3x", "Nov 22, 2026"):
            self.assertIn(expected, keep_items, f"Missing expected keep token {expected!r} in {keep_items}")

        # Exact trailing long sentence case without 6-item cap hiding end facts
        tail_sent = (
            "It is worth noting that "
            + "distributed archive replication checkpoints run smoothly in production queues " * 4
            + "handling 🚀 `api.v2` exports for up to 500,000 rows."
        )
        rn_tail = json.loads(run_node(["check", "-", "--json"], stdin_text=tail_sent).stdout)
        rp_tail = json.loads(run_py(["check", "-", "--json"], stdin_text=tail_sent).stdout)
        self.assertEqual(rn_tail, rp_tail)
        self.assertEqual(rn_tail["findings"][0]["revision"]["keep"], ["`api.v2`", "up to 500,000 rows"])

        # 3. Full-paragraph Pocket ML keep past 120-char excerpt
        stealth = (
            "During ongoing collaboration across multiple business stakeholders, teams maintain steady alignment on strategic workflows while balancing delivery milestones across 14 regional offices."
        )
        ml_n = json.loads(run_node(["check", "-", "--ml", "--json"], stdin_text=stealth).stdout)
        ml_p = json.loads(run_py(["check", "-", "--ml", "--json"], stdin_text=stealth).stdout)
        self.assertEqual(ml_n, ml_p)
        if ml_n["findings"]:
            self.assertIn("14", ml_n["findings"][0]["revision"]["keep"])

        # 4. --report-unused with dislop-ignore-next-line targeting register-skipped rule exits 0
        sup_doc = "<!-- dislop-ignore-next-line low-burstiness-vapor -- intentional -->\n" + vapor_rep
        for fn in (run_node, run_py):
            rs = fn(["check", "-", "--register", "technical", "--report-unused", "--fail-on", "warning"], stdin_text=sup_doc)
            self.assertEqual(rs.returncode, 0, rs.stderr or rs.stdout)

        # 5. Frontmatter edge cases: nested & block scalar ignored, trailing-space closing --- honored, typo dislop_register errors
        nested_fm = "---\nmeta:\n  register: official\nnotes: |\n  register: official\n---   \n我们要持续赋能。\n"
        self.assertEqual(json.loads(run_node(["check", "-", "--json"], stdin_text=nested_fm).stdout)["context"]["register"], "unspecified")
        self.assertEqual(json.loads(run_py(["check", "-", "--json"], stdin_text=nested_fm).stdout)["context"]["register"], "unspecified")

        trail_fm = "---   \nregister: official\n---   \n我们要持续赋能。\n"
        rn_tr = json.loads(run_node(["check", "-", "--json"], stdin_text=trail_fm).stdout)
        rp_tr = json.loads(run_py(["check", "-", "--json"], stdin_text=trail_fm).stdout)
        self.assertEqual(rn_tr["context"], {"register": "official", "registerSource": "frontmatter"})
        self.assertEqual(rn_tr, rp_tr)

        bad_fm = "---\ndislop_register: argumentitive\n---\nClean text.\n"
        self.assertEqual(run_node(["check", "-"], stdin_text=bad_fm).returncode, 2)
        self.assertEqual(run_py(["check", "-"], stdin_text=bad_fm).returncode, 2)

        # 6. Load-time config validation, array register rejection in MCP & .docx archive
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            import zipfile
            with zipfile.ZipFile(root / "sample.docx", "w") as zf:
                zf.writestr("[Content_Types].xml", "<Types/>")
                zf.writestr("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Clean.</w:t></w:r></w:p></w:body></w:document>")
            (root / ".dislop.json").write_text(json.dumps({"overrides": [{"files": ["other/**"], "register": ["official"]}]}), encoding="utf-8")
            self.assertEqual(run_node(["check", "sample.docx"], cwd=root).returncode, 2)
            self.assertEqual(run_py(["check", "sample.docx"], cwd=root).returncode, 2)

            (root / ".dislop.json").write_text(json.dumps({"register": "typo"}), encoding="utf-8")
            mcp_call = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "dislop_check", "arguments": {"path": "sample.docx"}}}) + "\n"
            rn_mcp = json.loads(run_node(["--mcp"], cwd=root, stdin_text=mcp_call).stdout.strip())
            rp_mcp = json.loads(run_py(["--mcp"], cwd=root, stdin_text=mcp_call).stdout.strip())
            self.assertTrue(rn_mcp["result"]["isError"])
            self.assertTrue(rp_mcp["result"]["isError"])

            # Array register at MCP boundary must error in both
            (root / ".dislop.json").unlink()
            mcp_arr = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "dislop_check", "arguments": {"text": "Clean.", "register": ["technical"]}}}) + "\n"
            self.assertTrue(json.loads(run_node(["--mcp"], cwd=root, stdin_text=mcp_arr).stdout.strip())["result"]["isError"])
            self.assertTrue(json.loads(run_py(["--mcp"], cwd=root, stdin_text=mcp_arr).stdout.strip())["result"]["isError"])

        # 7. Skipped file under --format agent --lang zh never says 通过
        rn_skip = run_node(["check", "package.json", "--format", "agent", "--lang", "zh"])
        rp_skip = run_py(["check", "package.json", "--format", "agent", "--lang", "zh"])
        self.assertEqual(rn_skip.returncode, 2)
        self.assertEqual(rp_skip.returncode, 2)
        self.assertEqual(rn_skip.stdout, rp_skip.stdout)
        self.assertIn("未完成", rn_skip.stdout)
        self.assertNotIn("通过", rn_skip.stdout)
        self.assertIn("不支持的文件扩展名", rn_skip.stdout)

    def test_scenario_strategy_parity_and_pack_defaults(self) -> None:
        from dislop.engine import get_scenario_strategy

        cases = [
            ("engineering-spec", "unspecified", "technical"),
            ("regulated-comms", "unspecified", "official"),
            ("literary-essay", "unspecified", "narrative"),
            ("deck-and-ui", "unspecified", "deck-ui"),
            ("executive-deck", "unspecified", "deck-ui"),
            ("business-brief", "unspecified", "argumentative"),
            ("business-brief", "casual", "casual"),
            ("business-brief", "marketing", "marketing"),
            ("engineering-spec", "casual", "casual"),
        ]
        node_probe = (
            'import("./src/core.mjs").then(({ getScenarioStrategy }) => {'
            "  const cases = JSON.parse(process.argv[1]);"
            "  console.log(JSON.stringify(cases.map(([packId, register]) => getScenarioStrategy({ packId, register }))));"
            "});"
        )
        res = subprocess.run(
            ["node", "-e", node_probe, json.dumps([[p, r] for p, r, _ in cases])],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=True,
        )
        node_strategies = json.loads(res.stdout)
        py_strategies = [get_scenario_strategy(pack_id=p, register=r) for p, r, _ in cases]
        self.assertEqual(node_strategies, py_strategies)
        for (_, _, expected_id), strat in zip(cases, py_strategies):
            self.assertEqual(strat["id"], expected_id)
            for key in ("label", "cut", "protect", "avoid"):
                self.assertIn("en", strat[key])
                self.assertIn("zh", strat[key])

    def test_scenario_overrides_template_echo_and_official_burstiness(self) -> None:
        echo_doc = (
            "## 1. 背景\n\n此处说明接口结构。\n\n"
            "## 2. 边界\n\n此处说明参数范围。\n\n"
            "## 3. 验收\n\n此处说明校验脚本。\n\n"
            "规则同上，按此流程执行。\n\n"
            "规则同上，按此流程执行。\n"
        )
        rn_tech = json.loads(run_node(["check", "-", "--pack", "business-brief", "--register", "technical", "--json"], stdin_text=echo_doc).stdout)
        rp_tech = json.loads(run_py(["check", "-", "--pack", "business-brief", "--register", "technical", "--json"], stdin_text=echo_doc).stdout)
        self.assertEqual(rn_tech["findings"], rp_tech["findings"])
        self.assertNotIn("template-skeleton-echo", [f["ruleId"] for f in rn_tech["findings"]])

        casual_echo = "周末整理家里闲置，顺手出几件。\n\n顺丰到付，非偏远包邮，当天发。\n\n顺丰到付，非偏远包邮，当天发。\n"
        rn_cas = json.loads(run_node(["check", "-", "--pack", "business-brief", "--register", "casual", "--json"], stdin_text=casual_echo).stdout)
        rp_cas = json.loads(run_py(["check", "-", "--pack", "business-brief", "--register", "casual", "--json"], stdin_text=casual_echo).stdout)
        self.assertEqual(rn_cas["findings"], rp_cas["findings"])
        echo_hits = [f for f in rn_cas["findings"] if f["ruleId"] == "template-skeleton-echo"]
        if echo_hits:
            self.assertEqual(echo_hits[0]["severity"], "info")

        official_uniform = (
            "本通告适用于全体驻场与外包运营团队执行日常巡检。\n"
            "各站点须于每日九时前完成设备状态核对与异常登记。\n"
            "未按时提交核验记录的班组将由值班主管复核确认。\n"
            "相关巡检表单与留档记录应至少保存九十个自然日。\n"
            "如遇突发故障应第一时间上报值班台并保留现场日志。\n"
        )
        rn_off = json.loads(run_node(["check", "-", "--pack", "business-brief", "--register", "official", "--json"], stdin_text=official_uniform).stdout)
        rp_off = json.loads(run_py(["check", "-", "--pack", "business-brief", "--register", "official", "--json"], stdin_text=official_uniform).stdout)
        self.assertEqual(rn_off["findings"], rp_off["findings"])
        vapor_off = [f for f in rn_off["findings"] if f["ruleId"] == "low-burstiness-vapor"]
        if vapor_off:
            self.assertEqual(vapor_off[0]["severity"], "info")

    def test_verify_register_drift_and_technical_cadence_guard(self) -> None:
        bef_casual = "咱自己收的工具，只出这一套。"
        aft_stiff = "个人闲置工具，仅出这一套，略有使用痕迹。"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bef_p = root / "before.md"
            aft_p = root / "after.md"
            bef_p.write_text(bef_casual, encoding="utf-8")
            aft_p.write_text(aft_stiff, encoding="utf-8")

            vn = json.loads(run_node(["verify", str(bef_p), str(aft_p), "--register", "casual", "--strict", "--json"]).stdout)
            vp = json.loads(run_py(["verify", str(bef_p), str(aft_p), "--register", "casual", "--strict", "--json"]).stdout)
            self.assertEqual(vn["antiDegradation"], vp["antiDegradation"])
            self.assertFalse(vn["ok"])
            self.assertIn("register-drift", [w["code"] for w in vn["antiDegradation"]["warnings"]])

            # Technical cadence uniformity should NOT trigger cadence-flattened
            bef_tech = (
                "Check the gateway timeout setting first.\n"
                "Verify every upstream node returns HTTP 200 within 15 ms under synthetic load across all three availability zones.\n"
                "Restart worker now.\n"
                "Compare median queue latency before and after draining stale connections across every regional cluster.\n"
            )
            aft_tech = (
                "Check the gateway timeout configuration value across active worker nodes.\n"
                "Verify every upstream node returns HTTP 200 within 15 ms during testing.\n"
                "Restart the stuck queue worker process after draining current jobs cleanly.\n"
                "Compare median queue latency metrics before and after draining stale sockets.\n"
            )
            (root / "t_bef.md").write_text(bef_tech, encoding="utf-8")
            (root / "t_aft.md").write_text(aft_tech, encoding="utf-8")
            vtn = json.loads(run_node(["verify", str(root / "t_bef.md"), str(root / "t_aft.md"), "--register", "technical", "--json"]).stdout)
            vtp = json.loads(run_py(["verify", str(root / "t_bef.md"), str(root / "t_aft.md"), "--register", "technical", "--json"]).stdout)
            self.assertEqual(vtn["antiDegradation"], vtp["antiDegradation"])
            self.assertNotIn("cadence-flattened", [w["code"] for w in vtn["antiDegradation"]["warnings"]])

            # MCP dislop_verify accepts register and preserves parity
            mcp_req = json.dumps({
                "jsonrpc": "2.0",
                "id": 9,
                "method": "tools/call",
                "params": {
                    "name": "dislop_verify",
                    "arguments": {
                        "before": bef_casual,
                        "after": aft_stiff,
                        "register": "casual",
                        "strict": True,
                    },
                },
            }) + "\n"
            mn = json.loads(json.loads(run_node(["--mcp"], cwd=root, stdin_text=mcp_req).stdout.strip())["result"]["content"][0]["text"])
            mp = json.loads(json.loads(run_py(["--mcp"], cwd=root, stdin_text=mcp_req).stdout.strip())["result"]["content"][0]["text"])
            self.assertEqual(mn["antiDegradation"], mp["antiDegradation"])
            self.assertFalse(mn["ok"])
            self.assertIn("register-drift", [w["code"] for w in mn["antiDegradation"]["warnings"]])

    def test_review_and_deslop_prompts_inject_scenario_strategy(self) -> None:
        draft = "咱自己收的相机，只出这一台，1200元不单拆。"
        pr_n = json.loads(run_node(["review", "-", "--print-prompt", "--register", "casual", "--lang", "zh", "--json"], stdin_text=draft).stdout)
        pr_p = json.loads(run_py(["review", "-", "--print-prompt", "--register", "casual", "--lang", "zh", "--json"], stdin_text=draft).stdout)
        self.assertIn("scenarioStrategy=casual", pr_n["systemPrompt"])
        self.assertIn("scenarioStrategy=casual", pr_p["systemPrompt"])
        self.assertIn("绝不为了规避重复把口语改成生硬书面腔", pr_n["systemPrompt"])
        self.assertIn("绝不为了规避重复把口语改成生硬书面腔", pr_p["systemPrompt"])

        # Rubric offline review exposes resolved register & scenarioStrategy
        rb_n = json.loads(run_node(["review", "-", "--offline", "--register", "technical", "--json"], stdin_text="This API returns 200 OK in 5 ms.").stdout)
        rb_p = json.loads(run_py(["review", "-", "--offline", "--register", "technical", "--json"], stdin_text="This API returns 200 OK in 5 ms.").stdout)
        self.assertEqual(rb_n["register"], "technical")
        self.assertEqual(rb_n["scenarioStrategy"], "technical")
        self.assertEqual(rb_p["register"], "technical")
        self.assertEqual(rb_p["scenarioStrategy"], "technical")


if __name__ == "__main__":
    unittest.main()
