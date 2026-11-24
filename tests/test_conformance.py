"""Cross-runtime conformance tests verifying 100% parity between Node.js and Python CLIs & MCP servers."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def run_node(args: list[str], cwd: Path = REPO_ROOT, stdin_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(REPO_ROOT / "bin" / "dislop.mjs"), *args],
        cwd=cwd,
        input=stdin_text,
        capture_output=True,
        text=True,
    )


def run_py(args: list[str], cwd: Path = REPO_ROOT, stdin_text: str | None = None) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "PYTHONPATH": str(REPO_ROOT / "src")}
    return subprocess.run(
        ["python3", "-m", "dislop.cli", *args],
        cwd=cwd,
        env=env,
        input=stdin_text,
        capture_output=True,
        text=True,
    )


class ConformanceParityTests(unittest.TestCase):
    def test_pack_test_passes_in_both_runtimes(self) -> None:
        r_node = run_node(["pack-test"])
        r_py = run_py(["pack-test"])
        self.assertEqual(r_node.returncode, 0, r_node.stderr)
        self.assertEqual(r_py.returncode, 0, r_py.stderr)
        self.assertEqual(r_node.stdout.strip(), r_py.stdout.strip())

    def test_cjk_lorem_prefix_safety_and_empty_pptx_parity(self) -> None:
        # 1. CJK-adjacent lorem ipsum must fail identically in Node and Python
        cjk_lorem = "这是中文lorem ipsum示例\n"
        rn = run_node(["check", "-", "--stdin-filename", "x.md"], stdin_text=cjk_lorem)
        rp = run_py(["check", "-", "--stdin-filename", "x.md"], stdin_text=cjk_lorem)
        self.assertEqual(rn.returncode, 1)
        self.assertEqual(rp.returncode, 1)

        # 2. Production text starting with PPTX_ must NOT skip real checks
        sneaky = "PPTX_NOTES: Certainly! Here is [insert name]\n"
        rn2 = run_node(["check", "-", "--stdin-filename", "x.md"], stdin_text=sneaky)
        rp2 = run_py(["check", "-", "--stdin-filename", "x.md"], stdin_text=sneaky)
        self.assertEqual(rn2.returncode, 1)
        self.assertEqual(rp2.returncode, 1)

        # 3. Incomplete PPTX archive (missing slides) exits 2 in both runtimes
        with tempfile.TemporaryDirectory() as tmp:
            bad_pptx = Path(tmp) / "empty.pptx"
            with zipfile.ZipFile(bad_pptx, "w") as zf:
                zf.writestr("[Content_Types].xml", "<Types/>")
            bn = run_node(["check", str(bad_pptx)], cwd=Path(tmp))
            bp = run_py(["check", str(bad_pptx)], cwd=Path(tmp))
            self.assertEqual(bn.returncode, 2)
            self.assertEqual(bp.returncode, 2)

    def test_unicode_emoji_column_and_fingerprint_parity(self) -> None:
        sample = "😀 Section 2 delves into retry budgets.\n"
        r_node = run_node(["check", "-", "--stdin-filename", "emoji.md", "--json"], stdin_text=sample)
        r_py = run_py(["check", "-", "--stdin-filename", "emoji.md", "--json"], stdin_text=sample)
        j_node = json.loads(r_node.stdout)
        j_py = json.loads(r_py.stdout)
        self.assertEqual(len(j_node["findings"]), 1)
        self.assertEqual(len(j_py["findings"]), 1)
        self.assertEqual(j_node["findings"][0]["location"], j_py["findings"][0]["location"])
        self.assertEqual(j_node["findings"][0]["fingerprint"], j_py["findings"][0]["fingerprint"])

    def test_reordered_pptx_and_split_runs_parity_across_node_and_python(self) -> None:
        """Slide 1 in presentation order is stored in slide2.xml and contains split runs + autofit + word wall."""
        with tempfile.TemporaryDirectory() as tmp:
            pptx_path = Path(tmp) / "reordered.pptx"
            many_words = " ".join(["metric"] * 135)
            with zipfile.ZipFile(pptx_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr(
                    "ppt/presentation.xml",
                    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
                    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                    '<p:sldSz cx="9144000" cy="6858000"/>'
                    '<p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst>'
                    "</p:presentation>",
                )
                zf.writestr(
                    "ppt/_rels/presentation.xml.rels",
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                    '<Relationship Id="rId1" Target="slides/slide1.xml"/>'
                    '<Relationship Id="rId2" Target="slides/slide2.xml"/>'
                    "</Relationships>",
                )
                # slide2.xml is Slide 1 in presentation order!
                zf.writestr(
                    "ppt/slides/slide2.xml",
                    '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
                    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                    "<p:sp><p:nvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr>"
                    "<p:txBody><a:bodyPr><a:normAutofit fontScale=\"62000\"/></a:bodyPr>"
                    "<a:p><a:r><a:t>Overview</a:t></a:r></a:p></p:txBody></p:sp>"
                    "<p:sp>"
                    f"<p:txBody><a:p><a:r><a:t>[insert</a:t></a:r><a:r><a:t> owner] {many_words}</a:t></a:r></a:p></p:txBody></p:sp>"
                    "</p:sld>",
                )
                zf.writestr(
                    "ppt/slides/slide1.xml",
                    '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
                    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                    "<p:sp><p:txBody><a:p><a:r><a:t>Concise second slide.</a:t></a:r></a:p></p:txBody></p:sp>"
                    "</p:sld>",
                )

            r_node = run_node(["check", str(pptx_path), "--json"], cwd=Path(tmp))
            r_py = run_py(["check", str(pptx_path), "--json"], cwd=Path(tmp))
            self.assertEqual(r_node.returncode, 1)
            self.assertEqual(r_py.returncode, 1)

            j_node = json.loads(r_node.stdout)
            j_py = json.loads(r_py.stdout)
            node_rules = {(f["ruleId"], f["location"]) for f in j_node["findings"]}
            py_rules = {(f["ruleId"], f["location"]) for f in j_py["findings"]}
            self.assertEqual(node_rules, py_rules)
            self.assertIn(("unfilled-placeholder", "slide 1"), node_rules)
            self.assertIn(("slide-word-wall", "slide 1"), node_rules)
            self.assertIn(("slide-autofit-shrink", "slide 1"), node_rules)
            self.assertIn(("slide-weak-topic-title", "slide 1"), node_rules)

    def test_docx_markdown_leak_and_prose_slop_parity(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docx_path = Path(tmp) / "draft.docx"
            with zipfile.ZipFile(docx_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr(
                    "word/document.xml",
                    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                    "<w:body>"
                    "<w:p><w:r><w:t>Certainly! </w:t></w:r><w:r><w:t>Here is the update.</w:t></w:r></w:p>"
                    "<w:p><w:r><w:t>**Unrendered Bold**: </w:t></w:r><w:r><w:t>Ship on Friday.</w:t></w:r></w:p>"
                    "</w:body></w:document>",
                )
            r_node = run_node(["check", str(docx_path), "--json"], cwd=Path(tmp))
            r_py = run_py(["check", str(docx_path), "--json"], cwd=Path(tmp))
            self.assertEqual(r_node.returncode, 1)
            self.assertEqual(r_py.returncode, 1)
            n_ids = {f["ruleId"] for f in json.loads(r_node.stdout)["findings"]}
            p_ids = {f["ruleId"] for f in json.loads(r_py.stdout)["findings"]}
            self.assertEqual(n_ids, p_ids)
            self.assertIn("markdown-leak", n_ids)
            self.assertIn("chatbot-artifact", n_ids)

    def test_mcp_protocol_parity_and_input_validation(self) -> None:
        requests = "\n".join(
            [
                json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}),
                json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}),
                json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "dislop_check", "arguments": {}}}),
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 4,
                        "method": "tools/call",
                        "params": {
                            "name": "dislop_check",
                            "arguments": {
                                "text": "Certainly! Here is the update. It is worth noting that latency dropped.",
                                "filename": "note.md",
                                "lang": "en",
                            },
                        },
                    }
                ),
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 5,
                        "method": "tools/call",
                        "params": {
                            "name": "dislop_explain",
                            "arguments": {
                                "ruleId": "chatbot-artifact",
                                "lang": "zh",
                            },
                        },
                    }
                ),
            ]
        ) + "\n"

        r_node = run_node(["--mcp"], stdin_text=requests)
        r_py = run_py(["--mcp"], stdin_text=requests)
        node_msgs = [json.loads(line) for line in r_node.stdout.strip().splitlines()]
        py_msgs = [json.loads(line) for line in r_py.stdout.strip().splitlines()]

        self.assertEqual(node_msgs[0]["result"]["protocolVersion"], "2025-06-18")
        self.assertEqual(py_msgs[0]["result"]["protocolVersion"], "2025-06-18")
        node_tool_names = [t["name"] for t in node_msgs[1]["result"]["tools"]]
        py_tool_names = [t["name"] for t in py_msgs[1]["result"]["tools"]]
        self.assertEqual(
            node_tool_names,
            [
                "dislop_check",
                "dislop_verify",
                "dislop_rules",
                "dislop_voice_extract",
                "dislop_model_score",
                "dislop_model_status",
            ],
        )
        self.assertEqual(py_tool_names, node_tool_names)
        # Empty dislop_check must return isError=True
        self.assertTrue(node_msgs[2]["result"]["isError"])
        self.assertTrue(py_msgs[2]["result"]["isError"])
        # Valid dislop_check defaults to compact mode (no inline exemplar) with single-locale message filter
        n_chk = json.loads(node_msgs[3]["result"]["content"][0]["text"])
        p_chk = json.loads(node_msgs[3]["result"]["content"][0]["text"])
        self.assertEqual(n_chk, p_chk)
        self.assertNotIn("exemplar", n_chk["findings"][0])
        self.assertEqual(list(n_chk["findings"][0]["message"].keys()), ["en"])
        self.assertIn("explainHint", n_chk)
        # dislop_explain strips negative fixtures/regex internals and honors lang
        n_exp = json.loads(node_msgs[4]["result"]["content"][0]["text"])
        p_exp = json.loads(node_msgs[4]["result"]["content"][0]["text"])
        self.assertEqual(n_exp, p_exp)
        self.assertNotIn("fixtures", n_exp)
        self.assertNotIn("pattern", n_exp)
        self.assertEqual(list(n_exp["message"].keys()), ["zh"])

    def test_resources_and_stdin_parity(self):
        n_res = run_node(["resources", "--json"])
        p_res = run_py(["resources", "--json"])
        self.assertEqual(n_res.returncode, 0)
        self.assertEqual(p_res.returncode, 0)
        self.assertEqual(json.loads(n_res.stdout), json.loads(p_res.stdout))

        sample = "好的，以下是本周进展：延迟降到 120ms。"
        n_in = run_node(["check", "-", "--stdin-filename", "draft.md", "--format", "json"], stdin_text=sample)
        p_in = run_py(["check", "-", "--stdin-filename", "draft.md", "--format", "json"], stdin_text=sample)
        self.assertEqual(n_in.returncode, 1)
        self.assertEqual(p_in.returncode, 1)
        self.assertEqual(
            [f["ruleId"] for f in json.loads(n_in.stdout)["findings"]],
            [f["ruleId"] for f in json.loads(p_in.stdout)["findings"]],
        )

    def test_profile_flag_and_text_v2_rules_parity(self):
        sample = (
            "随着远程协作的不断深入，团队对文档同步提出了更高要求。"
            "为什么许多团队沟通依然缓慢？因为信息分散在不同渠道。\n\n"
            "在传输效率方面，新版本有效推动协同效率，持续优化交互体验，显著提升服务质量。\n\n"
            "在离线编辑方面，客户端完善本地冲突合并机制。\n\n"
            "在权限管控方面，系统细化多级只读策略。\n\n"
            "展望未来，我们将继续围绕办公场景携手开启协作新篇章。"
        )
        n_res = run_node(["check", "-", "--stdin-filename", "v2.md", "--profile", "--format", "json"], stdin_text=sample)
        p_res = run_py(["check", "-", "--stdin-filename", "v2.md", "--profile", "--format", "json"], stdin_text=sample)
        self.assertEqual(n_res.returncode, 0)
        self.assertEqual(p_res.returncode, 0)
        jn = json.loads(n_res.stdout)
        jp = json.loads(p_res.stdout)
        n_rules = sorted(f["ruleId"] for f in jn["findings"])
        p_rules = sorted(f["ruleId"] for f in jp["findings"])
        self.assertEqual(n_rules, p_rules)
        for expected_rule in ("cooccurrence-slop-cluster", "rhetorical-qa-cadence", "narrative-sandwich-frame", "template-skeleton-echo"):
            self.assertIn(expected_rule, n_rules)
        self.assertEqual(jn["profiles"], jp["profiles"])
        self.assertGreaterEqual(jn["profiles"][0]["profile"]["telemetryRisk"]["score"], 70)

    def test_adversarial_edge_cases_parity_and_linear_perf(self):
        # 1. CJK-adjacent ASCII word boundaries & multiword transition cluster parity
        for sample in [
            "试验robust方法可改善统计transformative指标。",
            "Furthermore, tests pass. Moreover, logs work. At the same time, latency holds.",
            "甲乙。甲甲乙。甲乙。甲乙。",
            "第一句。第二句。\r\n\r\n第三句。第四句。\r\n",
            "# Protocol\nThe service handles 400 requests per second.\n<!-- 100 200 300 -->",
            "<!-- dislop-quote-start -->\n为什么这样？因为模板。\n<!-- dislop-quote-end -->\n正文正常。",
        ]:
            n_res = run_node(["check", "-", "--stdin-filename", "edge.md", "--profile", "--format", "json"], stdin_text=sample)
            p_res = run_py(["check", "-", "--stdin-filename", "edge.md", "--profile", "--format", "json"], stdin_text=sample)
            jn = json.loads(n_res.stdout)
            jp = json.loads(p_res.stdout)
            self.assertEqual(jn["findings"], jp["findings"], f"Findings mismatch on: {sample!r}")
            self.assertEqual(jn["profiles"], jp["profiles"], f"Profile mismatch on: {sample!r}")

        # 2. Verify # Protocol + prose extracts 1 sentence & HTML comment adds 0 anchors
        md_res = json.loads(
            run_py(
                ["check", "-", "--stdin-filename", "proto.md", "--profile", "--format", "json"],
                stdin_text="# Protocol\nThe service handles 400 requests.\n<!-- 100 200 300 -->",
            ).stdout
        )
        prof = md_res["profiles"][0]["profile"]
        self.assertEqual(prof["sentenceCount"], 1)
        self.assertEqual(prof["concreteness"]["anchorCount"], 1)

        # 3. Linear-time guarantee on 8 KB unpunctuated soft line break (no quadratic regex stall)
        import time
        big_line = ("word " * 1650).strip() + "\n"
        t0 = time.perf_counter()
        r_big = run_py(["check", "-", "--stdin-filename", "big.md", "--profile", "--format", "json"], stdin_text=big_line)
        elapsed = time.perf_counter() - t0
        self.assertEqual(r_big.returncode, 0)
        self.assertLess(elapsed, 2.0, f"Quadratic stall detected: {elapsed:.2f}s")

    def test_voice_model_and_vertical_packs_parity(self) -> None:
        from dislop.engine import verify_revision

        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)
            # 1. `dislop verify` fails cleanly on missing files (exit 2) while verifying revisions
            vn_missing = run_node(["verify", "a.md", "b.md"], cwd=tdir)
            vp_missing = run_py(["verify", "a.md", "b.md"], cwd=tdir)
            self.assertEqual(vn_missing.returncode, 2)
            self.assertEqual(vp_missing.returncode, 2)

            before_txt = "好的，以下是上线说明。值得注意的是，故障恢复时间最多 45 秒，错误率不超过 0.05%，详见 https://dislop.com/docs 与 `--fail-on`。\n"
            after_ok_txt = "上线后故障恢复时间最多 45 秒，错误率不超过 0.05%，详见 https://dislop.com/docs 与 `--fail-on`。\n"
            after_drift_txt = "上线后故障恢复时间 45 秒，错误率 0.05%，详见 https://dislop.com/docs 与 `--fail-on`。\n"
            py_ok = verify_revision(before_txt, after_ok_txt, modality="markdown")
            py_bad = verify_revision(before_txt, after_drift_txt, modality="markdown")
            self.assertEqual(py_ok["status"], "preserved")
            self.assertEqual(py_bad["status"], "drifted")
            self.assertEqual(len(py_bad["qualifierDropped"]), 2)

            # 2. `dislop voice` offline deterministic profile parity (ZH & EN, including `-o` short flag)
            out_n = tdir / "voice_n.json"
            out_p = tdir / "voice_p.json"
            sample_voice = "上周五 21:30 切换灰度队列后，结算接口 P99 从 210ms 降到 42ms。周一把全量配置合入主干。\n\n灰度期间只出现过 1 次重试告警，原因是旧连接池没关干净。"
            voc_n = run_node(["voice", "-", "-o", str(out_n), "--lang", "zh", "--json"], stdin_text=sample_voice)
            voc_p = run_py(["voice", "-", "-o", str(out_p), "--lang", "zh", "--json"], stdin_text=sample_voice)
            self.assertEqual(voc_n.returncode, 0, voc_n.stderr)
            self.assertEqual(voc_p.returncode, 0, voc_p.stderr)
            self.assertEqual(json.loads(voc_n.stdout), json.loads(voc_p.stdout))
            self.assertEqual(json.loads(out_n.read_text("utf-8")), json.loads(out_p.read_text("utf-8")))

            # 3. `dislop model --no-loopback --json` hardware advisor schema & recommendation parity
            mod_n = run_node(["model", "--no-loopback", "--lang", "zh", "--json"])
            mod_p = run_py(["model", "--no-loopback", "--lang", "zh", "--json"])
            self.assertEqual(mod_n.returncode, 0, mod_n.stderr)
            self.assertEqual(mod_p.returncode, 0, mod_p.stderr)
            jn_mod = json.loads(mod_n.stdout)
            jp_mod = json.loads(mod_p.stdout)
            self.assertEqual(jn_mod["schema"], "dislop.local-model/1")
            self.assertEqual(jn_mod["builtinDeterministic"], jp_mod["builtinDeterministic"])
            self.assertEqual(jn_mod["recommendation"]["tier"], jp_mod["recommendation"]["tier"])
            self.assertEqual(jn_mod["recommendation"]["modelId"], jp_mod["recommendation"]["modelId"])

            # 4. MCP `dislop_voice_extract_offline`, `dislop_check` (`pack="auto"` + `patterns=True` + out-of-workspace containment), and `dislop_explain` on bank pattern
            mcp_reqs = "\n".join(
                [
                    json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}),
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": 2,
                            "method": "tools/call",
                            "params": {
                                "name": "dislop_voice_extract_offline",
                                "arguments": {
                                    "samples": ["Cut queue timeout from 30s to 5s on Tuesday. Zero retries fired overnight."],
                                    "lang": "en",
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
                                    "text": "首先，统一数据口径。\n\n其次，补齐回归脚本。\n\n最后，更新发布清单。",
                                    "pack": "auto",
                                    "patterns": True,
                                    "lang": "zh",
                                },
                            },
                        }
                    ),
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": 4,
                            "method": "tools/call",
                            "params": {
                                "name": "dislop_explain",
                                "arguments": {"ruleId": "discourse-marker-cluster", "lang": "zh"},
                            },
                        }
                    ),
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": 5,
                            "method": "tools/call",
                            "params": {
                                "name": "dislop_check",
                                "arguments": {"path": "../outside-nonexistent.md"},
                            },
                        }
                    ),
                ]
            ) + "\n"
            mn = [json.loads(line) for line in run_node(["--mcp"], stdin_text=mcp_reqs).stdout.strip().splitlines()]
            mp = [json.loads(line) for line in run_py(["--mcp"], stdin_text=mcp_reqs).stdout.strip().splitlines()]
            for idx in (1, 2, 3, 4):
                self.assertEqual(
                    json.loads(mn[idx]["result"]["content"][0]["text"]),
                    json.loads(mp[idx]["result"]["content"][0]["text"]),
                )
            self.assertTrue(mn[4]["result"]["isError"])
            self.assertIn("within the current workspace", json.loads(mn[4]["result"]["content"][0]["text"])["error"])

            # 5. Real OOXML `.pptx` `executive-deck` layout monotony + process title parity
            exec_pptx = tdir / "board.pptx"
            with zipfile.ZipFile(exec_pptx, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr(
                    "ppt/presentation.xml",
                    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
                    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                    "<p:sldIdLst>"
                    '<p:sldId id="256" r:id="rId1"/>'
                    '<p:sldId id="257" r:id="rId2"/>'
                    '<p:sldId id="258" r:id="rId3"/>'
                    '<p:sldId id="259" r:id="rId4"/>'
                    "</p:sldIdLst></p:presentation>",
                )
                zf.writestr(
                    "ppt/_rels/presentation.xml.rels",
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                    '<Relationship Id="rId1" Target="slides/slide1.xml"/>'
                    '<Relationship Id="rId2" Target="slides/slide2.xml"/>'
                    '<Relationship Id="rId3" Target="slides/slide3.xml"/>'
                    '<Relationship Id="rId4" Target="slides/slide4.xml"/>'
                    "</Relationships>",
                )
                for idx in range(1, 5):
                    title = "Analysis of Q3 Regional Churn" if idx == 1 else f"Q3 Region {idx} dropped churn by {idx}%"
                    zf.writestr(
                        f"ppt/slides/slide{idx}.xml",
                        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
                        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                        f'<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>{title}</a:t></a:r></a:p></p:txBody></p:sp>'
                        '<p:sp><p:txBody>'
                        '<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Point one</a:t></a:r></a:p>'
                        '<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Point two</a:t></a:r></a:p>'
                        '<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Point three</a:t></a:r></a:p>'
                        "</p:txBody></p:sp></p:sld>",
                    )
            en_exec = run_node(["check", str(exec_pptx), "--pack", "executive-deck", "--json"], cwd=tdir)
            ep_exec = run_py(["check", str(exec_pptx), "--pack", "executive-deck", "--json"], cwd=tdir)
            jn_exec = json.loads(en_exec.stdout)
            jp_exec = json.loads(ep_exec.stdout)
            n_hits = {(f["ruleId"], f["location"]) for f in jn_exec["findings"]}
            p_hits = {(f["ruleId"], f["location"]) for f in jp_exec["findings"]}
            self.assertEqual(n_hits, p_hits)
            self.assertIn(("slide-process-not-finding-title", "slide 1"), n_hits)
            self.assertIn(("pptx-layout-monotony", "slide 4"), n_hits)

    def test_sol_adversarial_audit_regressions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)

            # 1. Internal `verifyRevision` / `verify_revision` adversarial drift cases (unit swap, sign flip, 3-part semver, strict vs inclusive bound, sentence-end integer, CJK-attached numbers)
            from dislop.engine import verify_revision

            drift_pairs = [
                ("Latency is 10 ms.", "Latency is 10 seconds."),
                ("Margin moved -8%.", "Margin moved +8%."),
                ("Shipped v1.2.3 today.", "Shipped v1.2.4 today."),
                ("Supports at least 10 rows.", "Supports more than 10 rows."),
                ("We hired 25.", "We hired a new cohort."),
                ("时延从34%降至19%。", "时延从30%降至15%。"),
            ]
            js_verify_script = (
                "import { verifyRevision } from './src/core.mjs';\n"
                "const pairs = JSON.parse(process.argv[1]);\n"
                "console.log(JSON.stringify(pairs.map(([b, a]) => verifyRevision(b + '\\n', a + '\\n', { modality: 'markdown' }))));"
            )
            r_js_ver = subprocess.run(
                ["node", "--input-type=module", "-e", js_verify_script, json.dumps(drift_pairs)],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(r_js_ver.returncode, 0, r_js_ver.stderr)
            js_ledgers = json.loads(r_js_ver.stdout)
            for i, (b_txt, a_txt) in enumerate(drift_pairs):
                py_ledger = verify_revision(b_txt + "\n", a_txt + "\n", modality="markdown")
                self.assertEqual(js_ledgers[i]["status"], "drifted", f"Node missed drift on pair #{i}")
                self.assertEqual(py_ledger["status"], "drifted", f"Python missed drift on pair #{i}")
                self.assertEqual(js_ledgers[i], py_ledger, f"Ledger mismatch on pair #{i}")

            # 2. Multiplier probe: decimal baseline exempted, store/shop nouns not treated as `s` unit, fullwidth digit parity
            mult_cases = [
                ("Run is 3x faster, from 1.5 seconds to 0.5 seconds.", "regulated-comms", False),
                ("Run is 3x faster and serves 10 stores and 20 shops.", "regulated-comms", True),
                ("本轮改造后系统性能提升３倍。", "regulated-comms", True),
                ("## Analysis of Q3", "executive-deck", True),
                ("## Analysis of İstanbul Returns", "executive-deck", True),
                ("## 关于退款的分析 ##", "executive-deck", True),
            ]
            for sample, pack_id, should_hit in mult_cases:
                rn = run_node(["check", "-", "--stdin-filename", "x.md", "--pack", pack_id, "--json"], stdin_text=sample)
                rp = run_py(["check", "-", "--stdin-filename", "x.md", "--pack", pack_id, "--json"], stdin_text=sample)
                jn = json.loads(rn.stdout)
                jp = json.loads(rp.stdout)
                self.assertEqual(
                    [f["ruleId"] for f in jn["findings"]],
                    [f["ruleId"] for f in jp["findings"]],
                    f"Rule mismatch on {sample!r}",
                )
                self.assertEqual(len(jn["findings"]) > 0, should_hit, f"Unexpected hit={len(jn['findings'])>0} on {sample!r}")

            # 3. 25-word sentence half-up voice band rounding parity (`[16.3, 36.3]` in both JS and Python)
            twenty_five = " ".join(["word"] * 25) + "."
            vn = json.loads(run_node(["voice", "-", "--lang", "en", "--json"], stdin_text=twenty_five).stdout)
            vp = json.loads(run_py(["voice", "-", "--lang", "en", "--json"], stdin_text=twenty_five).stdout)
            self.assertEqual(vn, vp)
            self.assertEqual(vn["stylometrics"]["targetLengthBand"], [16.3, 36.3])

    def test_bom_emoji_crlf_and_error_contracts_parity(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)

            # 1. UTF-8 BOM parity across stdin and file with --pack auto --ml --patterns --profile
            bom_txt = "\ufeffCertainly! Here is a draft.\n"
            rn_bom = run_node(["check", "--pack", "auto", "--ml", "--patterns", "--profile", "--json", "-"], stdin_text=bom_txt)
            rp_bom = run_py(["check", "--pack", "auto", "--ml", "--patterns", "--profile", "--json", "-"], stdin_text=bom_txt)
            self.assertEqual(rn_bom.returncode, 1)
            self.assertEqual(rp_bom.returncode, 1)
            self.assertEqual(json.loads(rn_bom.stdout)["findings"], json.loads(rp_bom.stdout)["findings"])

            bom_file = tdir / "bom.md"
            bom_file.write_bytes(bom_txt.encode("utf-8"))
            rn_bf = run_node(["check", str(bom_file), "--json"], cwd=tdir)
            rp_bf = run_py(["check", str(bom_file), "--json"], cwd=tdir)
            self.assertEqual(rn_bf.returncode, 1)
            self.assertEqual(rp_bf.returncode, 1)
            self.assertEqual(json.loads(rn_bf.stdout)["findings"], json.loads(rp_bf.stdout)["findings"])

            # 2. Emoji codepoint span + CRLF file span parity
            emoji_lf = "🚀\n\nCertainly! Here is the draft."
            rn_em = json.loads(run_node(["check", "--json", "-"], stdin_text=emoji_lf).stdout)
            rp_em = json.loads(run_py(["check", "--json", "-"], stdin_text=emoji_lf).stdout)
            self.assertEqual(rn_em["findings"][0]["span"], {"start": 3, "end": 21})
            self.assertEqual(rn_em["findings"], rp_em["findings"])

            crlf_file = tdir / "crlf.md"
            crlf_file.write_bytes("🚀\r\n\r\nCertainly! Here is the draft.\r\n".encode("utf-8"))
            rn_crlf = json.loads(run_node(["check", "crlf.md", "--json"], cwd=tdir).stdout)
            rp_crlf = json.loads(run_py(["check", "crlf.md", "--json"], cwd=tdir).stdout)
            self.assertEqual(rn_crlf["findings"][0]["span"], {"start": 5, "end": 23})
            self.assertEqual(rn_crlf["findings"], rp_crlf["findings"])

            # 3. Malformed CLI error exits (exit 2, no stack trace)
            rn_bogus = run_node(["check", "--pack", "bogus", "-"], stdin_text="Draft\n")
            rp_bogus = run_py(["check", "--pack", "bogus", "-"], stdin_text="Draft\n")
            self.assertEqual(rn_bogus.returncode, 2)
            self.assertEqual(rp_bogus.returncode, 2)
            self.assertNotIn("Traceback", rp_bogus.stderr)
            self.assertNotIn("    at ", rn_bogus.stderr)

            bad_docx = tdir / "bad.docx"
            bad_docx.write_bytes(b"not a ZIP archive")
            self.assertEqual(run_node(["patterns", str(bad_docx), "--json"], cwd=tdir).returncode, 2)
            self.assertEqual(run_py(["patterns", str(bad_docx), "--json"], cwd=tdir).returncode, 2)

            fake_pdf = tdir / "draft.pdf"
            fake_pdf.write_bytes(b"%PDF-1.4\nPlain ASCII text\n")
            self.assertEqual(run_node(["patterns", str(fake_pdf), "--json"], cwd=tdir).returncode, 2)
            self.assertEqual(run_py(["patterns", str(fake_pdf), "--json"], cwd=tdir).returncode, 2)

            # 4. GitHub annotation property escaping + rule doc links (`sarif`, `github`, `catalog`)
            gh_fn = "Release,Notes:v1%draft.md"
            rn_gh = run_node(["check", "--format", "github", "--stdin-filename", gh_fn, "-"], stdin_text="Certainly! Here is a draft.\n")
            rp_gh = run_py(["check", "--format", "github", "--stdin-filename", gh_fn, "-"], stdin_text="Certainly! Here is a draft.\n")
            self.assertEqual(rn_gh.stdout, rp_gh.stdout)
            self.assertIn("file=Release%2CNotes%3Av1%25draft.md,line=1,col=1,title=chatbot-artifact::", rn_gh.stdout)
            self.assertIn("https://dislop.com/en/rules/chatbot-artifact/", rn_gh.stdout)

            rn_gh_zh = run_node(["check", "--lang", "zh", "--format", "github", "--stdin-filename", gh_fn, "-"], stdin_text="Certainly! Here is a draft.\n")
            rp_gh_zh = run_py(["check", "--lang", "zh", "--format", "github", "--stdin-filename", gh_fn, "-"], stdin_text="Certainly! Here is a draft.\n")
            self.assertEqual(rn_gh_zh.stdout, rp_gh_zh.stdout)
            self.assertIn("https://dislop.com/rules/chatbot-artifact/", rn_gh_zh.stdout)

            rn_sarif_en = json.loads(run_node(["check", "--format", "sarif", "--stdin-filename", "draft.md", "-"], stdin_text="Certainly! Here is a draft.\n").stdout)
            rp_sarif_en = json.loads(run_py(["check", "--format", "sarif", "--stdin-filename", "draft.md", "-"], stdin_text="Certainly! Here is a draft.\n").stdout)
            self.assertEqual(rn_sarif_en, rp_sarif_en)
            en_rule_uris = {r["id"]: r["helpUri"] for r in rn_sarif_en["runs"][0]["tool"]["driver"]["rules"]}
            self.assertEqual(en_rule_uris.get("chatbot-artifact"), "https://dislop.com/en/rules/chatbot-artifact/")

            rn_sarif_zh_rule = json.loads(
                run_node(["check", "--pack", "business-brief", "--lang", "en", "--format", "sarif", "--stdin-filename", "note.md", "-"], stdin_text="我们要以数据治理为抓手，持续赋能门店运营。\n").stdout
            )
            rp_sarif_zh_rule = json.loads(
                run_py(["check", "--pack", "business-brief", "--lang", "en", "--format", "sarif", "--stdin-filename", "note.md", "-"], stdin_text="我们要以数据治理为抓手，持续赋能门店运营。\n").stdout
            )
            self.assertEqual(rn_sarif_zh_rule, rp_sarif_zh_rule)
            zh_rule_uris = {r["id"]: r["helpUri"] for r in rn_sarif_zh_rule["runs"][0]["tool"]["driver"]["rules"]}
            self.assertEqual(zh_rule_uris.get("zh-bureaucratic-padding"), "https://dislop.com/rules/zh-bureaucratic-padding/")

            cat_n = json.loads(run_node(["catalog", "--json"]).stdout)
            cat_p = json.loads(run_py(["catalog", "--json"]).stdout)
            self.assertEqual(cat_n, cat_p)
            anchors = {e["id"]: e["anchorUrl"] for e in cat_n["items"]}
            self.assertEqual(anchors.get("chatbot-artifact"), "https://dislop.com/en/rules/chatbot-artifact/")
            self.assertEqual(anchors.get("zh-bureaucratic-padding"), "https://dislop.com/rules/zh-bureaucratic-padding/")

            # 5. `explain pocket-stealth-vapor` parity & `README.md --pack auto --ml` 0 findings
            ex_n = json.loads(run_node(["explain", "pocket-stealth-vapor", "--json"]).stdout)
            ex_p = json.loads(run_py(["explain", "pocket-stealth-vapor", "--json"]).stdout)
            self.assertEqual(ex_n, ex_p)
            rm_n = json.loads(run_node(["check", str(REPO_ROOT / "README.md"), "--pack", "auto", "--ml", "--json"]).stdout)
            rm_p = json.loads(run_py(["check", str(REPO_ROOT / "README.md"), "--pack", "auto", "--ml", "--json"]).stdout)
            self.assertEqual(rm_n["findings"], [])
            self.assertEqual(rm_p["findings"], [])

            # 6. MCP `dislop_explain(pocket-stealth-vapor)`, `verbosity: full` emoji span, and >15 voice sample limit
            mcp_batch = "\n".join(
                [
                    json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}),
                    json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "dislop_explain", "arguments": {"ruleId": "pocket-stealth-vapor"}}}),
                    json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "dislop_check", "arguments": {"text": emoji_lf, "verbosity": "full"}}}),
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": 4,
                            "method": "tools/call",
                            "params": {
                                "name": "dislop_voice_extract_offline",
                                "arguments": {"samples": [f"Sample {i} shipped on Tuesday." for i in range(16)]},
                            },
                        }
                    ),
                ]
            ) + "\n"
            mn2 = [json.loads(line) for line in run_node(["--mcp"], stdin_text=mcp_batch).stdout.strip().splitlines()]
            mp2 = [json.loads(line) for line in run_py(["--mcp"], stdin_text=mcp_batch).stdout.strip().splitlines()]
            for idx in (1, 2, 3):
                self.assertEqual(
                    json.loads(mn2[idx]["result"]["content"][0]["text"]),
                    json.loads(mp2[idx]["result"]["content"][0]["text"]),
                )
            self.assertTrue(mn2[3]["result"]["isError"])
            self.assertTrue(mp2[3]["result"]["isError"])

            # 7. MCP voice whitespace-only and non-string element rejection parity
            mcp_bad_voice = "\n".join(
                [
                    json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "dislop_voice_extract_offline", "arguments": {"samples": ["   \n\t "]}}}),
                    json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "dislop_voice_extract_offline", "arguments": {"samples": ["Valid line.", 123]}}}),
                ]
            ) + "\n"
            mn_bv = [json.loads(line) for line in run_node(["--mcp"], stdin_text=mcp_bad_voice).stdout.strip().splitlines()]
            mp_bv = [json.loads(line) for line in run_py(["--mcp"], stdin_text=mcp_bad_voice).stdout.strip().splitlines()]
            self.assertEqual(mn_bv, mp_bv)
            self.assertTrue(mn_bv[0]["result"]["isError"])
            self.assertTrue(mn_bv[1]["result"]["isError"])

            # 8. Large (> 64 KB) piped JSON output with leading emoji + 400 findings: zero truncation & O(N) span speed
            import time

            many_hits = "🚀\n\n" + "\n\n".join(["It's worth noting that exports are a game-changer for teams." for _ in range(200)]) + "\n"
            t0 = time.perf_counter()
            rn_many = run_node(["check", "--pack", "business-brief", "--json", "-"], stdin_text=many_hits)
            node_elapsed = time.perf_counter() - t0
            rp_many = run_py(["check", "--pack", "business-brief", "--json", "-"], stdin_text=many_hits)
            self.assertGreater(len(rn_many.stdout), 120_000)
            self.assertLess(node_elapsed, 2.0, f"Emoji span regression: {node_elapsed:.2f}s")
            jn_many = json.loads(rn_many.stdout)
            jp_many = json.loads(rp_many.stdout)
            self.assertEqual(len(jn_many["findings"]), 401)
            self.assertEqual(jn_many["findings"], jp_many["findings"])

    def test_verify_revision_negated_qualifier_polarity_parity(self) -> None:
        cases = [
            ("迁移期间一致率不低于 99.995%。", "迁移期间一致率低于 99.995%。", "drifted", "min_inc"),
            ("迁移期间一致率不低于 99.995%。", "迁移期间一致率至少 99.995%。", "preserved", "min_inc"),
            ("Retry budget allows 不少于 3 次 attempts.", "Retry budget allows 少于 3 次 attempts.", "drifted", "min_inc"),
            ("Contracted uptime is no less than 99.9%.", "Contracted uptime is less than 99.9%.", "drifted", "min_inc"),
            ("Contracted uptime is no less than 99.9%.", "Contracted uptime is at least 99.9%.", "preserved", "min_inc"),
            ("Queue keeps no fewer than 5 replicas.", "Queue keeps fewer than 5 replicas.", "drifted", "min_inc"),
        ]
        node_script = (
            "import { verifyRevision, extractProtectedFacts } from './src/core.mjs';\n"
            "const cases = JSON.parse(process.argv[1]);\n"
            "console.log(JSON.stringify(cases.map(([b, a]) => ({\n"
            "  bf: extractProtectedFacts(b),\n"
            "  vr: verifyRevision(b, a)\n"
            "}))));\n"
        )
        r_node = subprocess.run(
            ["node", "--input-type=module", "-e", node_script, json.dumps(cases)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(r_node.returncode, 0, r_node.stderr)
        node_out = json.loads(r_node.stdout)

        import sys
        sys.path.insert(0, str(REPO_ROOT / "src"))
        from dislop.engine import extract_protected_facts, verify_revision

        for idx, (before, after, exp_status, exp_q) in enumerate(cases):
            py_bf = extract_protected_facts(before)
            py_vr = verify_revision(before, after)
            self.assertEqual(node_out[idx]["bf"][0]["qualifier"], exp_q, f"Node qualifier mismatch for {before}")
            self.assertEqual(py_bf[0]["qualifier"], exp_q, f"Py qualifier mismatch for {before}")
            self.assertEqual(node_out[idx]["vr"]["status"], exp_status, f"Node status mismatch for {before} -> {after}")
            self.assertEqual(py_vr["status"], exp_status, f"Py status mismatch for {before} -> {after}")
            self.assertEqual(node_out[idx]["vr"]["retentionRate"], py_vr["retentionRate"])

    def test_visual_svg_image_pdf_parity(self) -> None:
        import struct
        import zlib

        def png_chunk(ctype: bytes, data: bytes) -> bytes:
            body = ctype + data
            return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

        def make_png(w: int, h: int, pixel_fn, text_chunks=None) -> bytes:
            raw = bytearray()
            for y in range(h):
                raw.append(0)
                for x in range(w):
                    r, g, b, a = pixel_fn(x, y)
                    raw.extend((r, g, b, a))
            chunks = [
                b"\x89PNG\r\n\x1a\n",
                png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)),
            ]
            for k, v in (text_chunks or []):
                chunks.append(png_chunk(b"tEXt", k.encode("latin1") + b"\x00" + v.encode("latin1")))
            chunks.append(png_chunk(b"IDAT", zlib.compress(bytes(raw))))
            chunks.append(png_chunk(b"IEND", b""))
            return b"".join(chunks)

        def make_jpeg_with_xmp(xmp_str: str) -> bytes:
            xmp = b"http://ns.adobe.com/xap/1.0/\x00" + xmp_str.encode("utf-8")
            app1 = b"\xff\xe1" + struct.pack(">H", len(xmp) + 2) + xmp
            sof0 = b"\xff\xc0" + struct.pack(">HBHHBBBB", 11, 8, 64, 64, 3, 1, 0x11, 0)
            return b"\xff\xd8" + app1 + sof0 + b"\xff\xd9"

        def make_pdf(pages, encrypted: bool = False) -> bytes:
            objs = []

            def add_obj(d: str, stream: bytes | None = None) -> int:
                objs.append((len(objs) + 1, d, stream))
                return len(objs)

            cat_n = add_obj("")
            pages_n = add_obj("")
            font_n = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
            page_nums = []
            for p in pages:
                lines = ["BT"]
                y = p.get("height", 540) - 48
                for size, txt in p.get("runs", []):
                    esc = txt.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
                    lines.append(f"/F1 {size} Tf 48 {y} Td ({esc}) Tj")
                    y -= 24
                lines.append("ET")
                raw = zlib.compress("\n".join(lines).encode("latin1"))
                c_n = add_obj(f"<< /Filter /FlateDecode /Length {len(raw)} >>", raw)
                w, h = p.get("width", 960), p.get("height", 540)
                p_n = add_obj(
                    f"<< /Type /Page /Parent {pages_n} 0 R /MediaBox [0 0 {w} {h}] "
                    f"/Resources << /Font << /F1 {font_n} 0 R >> >> /Contents {c_n} 0 R >>"
                )
                page_nums.append(p_n)
            objs[cat_n - 1] = (cat_n, f"<< /Type /Catalog /Pages {pages_n} 0 R >>", None)
            kids = " ".join(f"{n} 0 R" for n in page_nums)
            objs[pages_n - 1] = (pages_n, f"<< /Type /Pages /Kids [{kids}] /Count {len(page_nums)} >>", None)
            out = [b"%PDF-1.4\n"]
            for num, d, stream in objs:
                if stream is not None:
                    out.append(f"{num} 0 obj\n{d}\nstream\n".encode("latin1") + stream + b"\nendstream\nendobj\n")
                else:
                    out.append(f"{num} 0 obj\n{d}\nendobj\n".encode("latin1"))
            if encrypted:
                enc_n = add_obj("<< /Filter /Standard /V 2 /R 3 /Length 128 >>")
                out.append(f"{enc_n} 0 obj\n<< /Filter /Standard /V 2 /R 3 /Length 128 >>\nendobj\n".encode("latin1"))
                out.append(f"trailer\n<< /Root {cat_n} 0 R /Encrypt {enc_n} 0 R >>\n%%EOF\n".encode("latin1"))
            else:
                out.append(f"trailer\n<< /Root {cat_n} 0 R >>\n%%EOF\n".encode("latin1"))
            return b"".join(out)

        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)
            web_slop = tdir / "slop.html"
            web_slop.write_text(
                '<div class="blur-3xl rounded-full bg-indigo-500/30"></div>'
                '<h3>🚀 Deploy</h3><h3>✨ Smart</h3><h3>⚡ Fast</h3>'
                '<section><span>01</span><span>02</span><span>03</span></section>',
                encoding="utf-8",
            )
            svg_slop = tdir / "slop.svg"
            svg_slop.write_text(
                '<svg width="480" height="320"><defs><linearGradient id="g">'
                '<stop stop-color="#6366f1"/><stop stop-color="#ec4899"/></linearGradient></defs>'
                '<rect fill="url(#g)" width="480" height="320"/></svg>',
                encoding="utf-8",
            )
            svg_clean = tdir / "clean.svg"
            svg_clean.write_text(
                '<svg viewBox="0 0 400 200" width="400" height="200">'
                '<text x="20" y="40">Input</text><text x="20" y="88">Output</text></svg>',
                encoding="utf-8",
            )
            png_wf = tdir / "workflow.png"
            png_wf.write_bytes(
                make_png(
                    32,
                    32,
                    lambda x, y: (246, 247, 245, 255),
                    [("parameters", "hero banner\nNegative prompt: blurry\nSteps: 28, CFG scale: 7")],
                )
            )
            png_neon = tdir / "neon.png"
            png_neon.write_bytes(
                make_png(
                    64,
                    64,
                    lambda x, y: (11, 11, 20, 255) if y < 28 else (124, 58, 237, 255),
                )
            )
            png_clean = tdir / "paper.png"
            png_clean.write_bytes(make_png(32, 32, lambda x, y: (246, 247, 245, 255)))
            jpg_prov = tdir / "prov.jpg"
            jpg_prov.write_bytes(make_jpeg_with_xmp('<x:xmpmeta><rdf:Description dc:source="trainedAlgorithmicMedia"/></x:xmpmeta>'))

            wall = " ".join(f"w{i}" for i in range(130))
            pdf_slop = tdir / "slop-deck.pdf"
            pdf_slop.write_bytes(
                make_pdf(
                    [
                        {"width": 960, "height": 540, "runs": [(20, "**Bold** [TODO] " + wall)]},
                        {"width": 960, "height": 540, "runs": [(20, wall)]},
                        {"width": 960, "height": 540, "runs": [(20, wall)]},
                        {"width": 960, "height": 540, "runs": [(20, wall)]},
                        {"width": 960, "height": 540, "runs": [(20, wall)]},
                    ]
                )
            )
            pdf_clean = tdir / "report-clean.pdf"
            pdf_clean.write_bytes(
                make_pdf([{"width": 612, "height": 792, "runs": [(24, "Quarterly Ops Report"), (11, "Latency fell 18%.")]}])
            )
            pdf_enc = tdir / "locked.pdf"
            pdf_enc.write_bytes(make_pdf([{"width": 960, "height": 540, "runs": [(18, "Secret")]}], encrypted=True))

            expectations = [
                (web_slop, {"ui-glow-blob-chrome", "ui-emoji-icon-chrome", "ui-template-card-grid"}),
                (svg_slop, {"ui-ai-gradient", "svg-layout-slop"}),
                (svg_clean, set()),
                (png_wf, {"image-ai-workflow-residue"}),
                (png_neon, {"image-ai-palette-slop"}),
                (png_clean, set()),
                (jpg_prov, {"image-ai-workflow-residue"}),
                (pdf_slop, {"markdown-leak", "unfilled-placeholder", "slide-word-wall", "pdf-visual-layout-slop"}),
                (pdf_clean, set()),
            ]
            for target, required_rules in expectations:
                args = ["check", str(target), "--pack", "deck-and-ui", "--json"]
                jn = json.loads(run_node(args, cwd=tdir).stdout)
                jp = json.loads(run_py(args, cwd=tdir).stdout)
                self.assertEqual(jn["findings"], jp["findings"], f"Parity mismatch on {target.name}")
                got_rules = {f["ruleId"] for f in jn["findings"]}
                if not required_rules:
                    self.assertEqual(got_rules, set(), f"Unexpected findings on {target.name}: {got_rules}")
                else:
                    self.assertTrue(required_rules.issubset(got_rules), f"{target.name}: expected {required_rules}, got {got_rules}")

            # Verify encrypted PDF skips cleanly with exit code 2 across Node and Python
            rn_enc = run_node(["check", str(pdf_enc), "--pack", "deck-and-ui", "--json"], cwd=tdir)
            rp_enc = run_py(["check", str(pdf_enc), "--pack", "deck-and-ui", "--json"], cwd=tdir)
            self.assertEqual(rn_enc.returncode, 2)
            self.assertEqual(rp_enc.returncode, 2)
            jn_enc = json.loads(rn_enc.stdout)
            jp_enc = json.loads(rp_enc.stdout)
            self.assertEqual(jn_enc["findings"], [])
            self.assertEqual(jp_enc["findings"], [])
            self.assertEqual(len(jn_enc.get("skipped", [])), 1)
            self.assertEqual(jn_enc["skipped"], jp_enc["skipped"])

    def test_p0_changed_unicode_pdf_html_and_verify_revision_parity(self) -> None:
        import struct
        import zlib
        from dislop.engine import verify_revision

        def make_adv_pdf() -> bytes:
            # 1: Catalog, 2: Pages, 3: Page (uses ObjStm + ToUnicode + Type3 + ActualText),
            # 4: Type0 Font referencing ToUnicode stream 7, 5: ToUnicode CMap stream,
            # 6: Type3 Font with /Differences, 7: Content stream, 8: Empty ObjStm? No, put Page 2 obj in ObjStm!
            # Simpler: put an Info-like/Catalog or second Stream / Page in /ObjStm and verify compressed stream text is extracted!
            cmap = (
                "/CIDInit /ProcSet findresource begin\n"
                "12 dict begin\n"
                "begincmap\n"
                "2 beginbfchar\n"
                "<01> <6D4B>\n"
                "<02> <8BD5>\n"
                "endbfchar\n"
                "1 beginbfrange\n"
                "<10> <11> <6587>\n"
                "endbfrange\n"
                "endcmap\n"
            ).encode("latin1")
            actual_hex = "6D4B8BD562A5544A".encode("ascii")  # 测试报告
            # Page 1 content draws Type0 <0102>, Type3 <2021>, and ActualText span + ASCII
            content1 = (
                b"BT\n"
                b"/F1 12 Tf\n"
                b"1 0 0 1 72 720 Tm\n"
                b"<0102> Tj\n"
                b"/F3 12 Tf\n"
                b"0 -20 Td\n"
                b"(\x20\x21) Tj\n"
                b"/F1 12 Tf\n"
                b"1 0 0 1 72 660 Tm\n"
                b"<1011> Tj\n"
                b"ET\n"
                b"/Span <</ActualText <FEFF" + actual_hex + b">>> BDC BT /F2 12 Tf (ignored) Tj ET EMC\n"
                b"BT /F2 12 Tf 0 -20 Td (**LeakHeading** [TODO]) Tj ET\n"
            )
            dict8 = b"<< /Type /Metadata /Note (SyntheticObjStmText) >>"
            header8 = f"8 0 ".encode("latin1")
            objstm_raw = header8 + dict8
            objstm_comp = zlib.compress(objstm_raw)
            first_offset = len(header8)

            objs: list[bytes] = [
                b"<< /Type /Catalog /Pages 2 0 R /Metadata 8 0 R >>",
                b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 10 0 R /F3 6 0 R >> >> /Contents 7 0 R >>",
                b"<< /Type /Font /Subtype /Type0 /ToUnicode 5 0 R >>",
                f"<< /Length {len(cmap)} >>\nstream\n".encode("latin1") + cmap + b"\nendstream",
                b"<< /Type /Font /Subtype /Type3 /Encoding << /Type /Encoding /Differences [32 /A /B] >> >>",
                f"<< /Length {len(content1)} >>\nstream\n".encode("latin1") + content1 + b"\nendstream",
                b"PLACEHOLDER_IN_OBJSTM",
                f"<< /Type /ObjStm /N 1 /First {first_offset} /Length {len(objstm_comp)} /Filter /FlateDecode >>\nstream\n".encode("latin1") + objstm_comp + b"\nendstream",
                b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            ]
            # Remove placeholder object 8 from top-level xref and emit objects 1..7 and 9..10
            buf = bytearray(b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n")
            offsets: dict[int, int] = {}
            for idx, body in enumerate(objs, start=1):
                if idx == 8:
                    continue
                offsets[idx] = len(buf)
                buf.extend(f"{idx} 0 obj\n".encode("ascii") + body + b"\nendobj\n")
            xref_pos = len(buf)
            buf.extend(b"xref\n0 11\n0000000000 65535 f \n")
            for idx in range(1, 11):
                off = offsets.get(idx, 0)
                flag = b"n" if off else b"f"
                buf.extend(f"{off:010d} 00000 ".encode("ascii") + flag + b" \n")
            buf.extend(f"trailer\n<< /Size 11 /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii"))
            return bytes(buf)

        def make_unreadable_font_pdf() -> bytes:
            # PDF containing a /Font dictionary but empty Tj text so coverageWarnings triggers
            content = b"BT /F1 12 Tf 1 0 0 1 72 720 Tm () Tj ET\n"
            objs = [
                b"<< /Type /Catalog /Pages 2 0 R >>",
                b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
                b"<< /Type /Font /Subtype /Type3 /Name /F1 >>",
                f"<< /Length {len(content)} >>\nstream\n".encode("latin1") + content + b"\nendstream",
            ]
            buf = bytearray(b"%PDF-1.4\n")
            offsets = [0]
            for idx, body in enumerate(objs, start=1):
                offsets.append(len(buf))
                buf.extend(f"{idx} 0 obj\n".encode("ascii") + body + b"\nendobj\n")
            xref_pos = len(buf)
            buf.extend(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode("ascii"))
            for off in offsets[1:]:
                buf.extend(f"{off:010d} 00000 n \n".encode("ascii"))
            buf.extend(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii"))
            return bytes(buf)

        def make_tiny_png(r: int) -> bytes:
            def chunk(ctype: bytes, data: bytes) -> bytes:
                body = ctype + data
                return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
            raw = b"\x00" + bytes([r, 200, 200, 255]) * 4
            return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 4, 1, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)

            # 1. --changed with non-ASCII filename, deletion-only hunk, and binary file
            subprocess.run(["git", "init", "-q"], cwd=tdir, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tdir, check=True)
            subprocess.run(["git", "config", "user.name", "Test User"], cwd=tdir, check=True)
            zh_doc = tdir / "交付报告.md"
            del_doc = tdir / "cleanup.md"
            bin_png = tdir / "chart.png"
            zh_doc.write_text("Untouched line with 赋能 and 闭环.\n\nClean second line.\n", encoding="utf-8")
            del_doc.write_text("Clean opening.\n\nAs an AI language model, remove me.\n", encoding="utf-8")
            bin_png.write_bytes(make_tiny_png(120))
            subprocess.run(["git", "add", "."], cwd=tdir, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=tdir, check=True)

            # Modify only line 3 of 交付报告.md, delete line 3 of cleanup.md, modify binary file
            zh_doc.write_text("Untouched line with 赋能 and 闭环.\n\nCertainly! Here is the revised report [TODO].\n", encoding="utf-8")
            del_doc.write_text("Clean opening.\n", encoding="utf-8")
            bin_png.write_bytes(make_tiny_png(160))

            rn_chg = run_node(["check", "--changed", "HEAD", "--pack", "business-brief", "--json"], cwd=tdir)
            rp_chg = run_py(["check", "--changed", "HEAD", "--pack", "business-brief", "--json"], cwd=tdir)
            self.assertEqual(rn_chg.returncode, 1)
            self.assertEqual(rp_chg.returncode, 1)
            jn_chg = json.loads(rn_chg.stdout)
            jp_chg = json.loads(rp_chg.stdout)
            self.assertEqual(jn_chg["findings"], jp_chg["findings"])
            self.assertEqual(jn_chg["changedFilter"], jp_chg["changedFilter"])
            self.assertEqual({f["line"] for f in jn_chg["findings"]}, {3})
            self.assertTrue(all(f["file"].endswith("交付报告.md") for f in jn_chg["findings"]))

            # Deletion-only repo change should exit 0 with explicit changedFilter and 0 findings
            zh_doc.write_text("Untouched clean opening.\n\nClean second line.\n", encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=tdir, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "clean"], cwd=tdir, check=True)
            zh_doc.write_text("Untouched clean opening.\n", encoding="utf-8")
            rn_del = run_node(["check", "--changed", "HEAD", "--json"], cwd=tdir)
            rp_del = run_py(["check", "--changed", "HEAD", "--json"], cwd=tdir)
            self.assertEqual(rn_del.returncode, 0)
            self.assertEqual(rp_del.returncode, 0)
            self.assertEqual(json.loads(rn_del.stdout)["findings"], [])
            self.assertEqual(json.loads(rp_del.stdout)["findings"], [])

            # 2. PDF ToUnicode + Type3 Differences + ActualText + ObjStm + unreadable font coverageWarnings
            adv_pdf = tdir / "adv.pdf"
            adv_pdf.write_bytes(make_adv_pdf())
            rn_pdf = run_node(["check", str(adv_pdf), "--pack", "business-brief", "--json"], cwd=tdir)
            rp_pdf = run_py(["check", str(adv_pdf), "--pack", "business-brief", "--json"], cwd=tdir)
            jn_pdf = json.loads(rn_pdf.stdout)
            jp_pdf = json.loads(rp_pdf.stdout)
            self.assertEqual(jn_pdf["findings"], jp_pdf["findings"])
            pdf_rules = {f["ruleId"] for f in jn_pdf["findings"]}
            self.assertIn("markdown-leak", pdf_rules)
            self.assertIn("unfilled-placeholder", pdf_rules)

            # Verify decoded CJK ToUnicode/ActualText inside Node & Python extractors
            py_extract_script = (
                "import json; from dislop.engine import parse_pdf_bytes; "
                "d=parse_pdf_bytes(open(r'" + str(adv_pdf) + "','rb').read()); "
                "print(json.dumps({'text': '\\n'.join(p.get('text','') for p in d['pages']), 'hasCompressed': d['hasCompressedStreams'], 'hasFonts': d['hasFonts']}, ensure_ascii=False))"
            )
            js_extract_script = (
                "import fs from 'node:fs'; import { parsePdfBuffer } from './src/binary-node.mjs'; "
                "const d = parsePdfBuffer(fs.readFileSync(process.argv[1])); "
                "console.log(JSON.stringify({ text: d.pages.map(p => p.text || '').join('\\n'), hasCompressed: d.hasCompressedStreams, hasFonts: d.hasFonts }));"
            )
            ext_n = json.loads(subprocess.check_output(["node", "-e", js_extract_script, str(adv_pdf)], cwd=REPO_ROOT, text=True))
            ext_p = json.loads(subprocess.check_output(["python3", "-c", py_extract_script], cwd=REPO_ROOT, env={**os.environ, "PYTHONPATH": str(REPO_ROOT / "src")}, text=True))
            self.assertTrue(ext_n["hasCompressed"])
            self.assertEqual(ext_n["hasCompressed"], ext_p["hasCompressed"])
            self.assertTrue(ext_n["hasFonts"] and ext_p["hasFonts"])
            self.assertIn("测试", ext_n["text"])
            self.assertIn("测试", ext_p["text"])
            self.assertIn("报告", ext_n["text"])
            self.assertIn("报告", ext_p["text"])
            self.assertIn("AB", ext_n["text"])
            self.assertIn("AB", ext_p["text"])

            empty_font_pdf = tdir / "unreadable.pdf"
            empty_font_pdf.write_bytes(make_unreadable_font_pdf())
            jn_unr = json.loads(run_node(["check", str(empty_font_pdf), "--json"], cwd=tdir).stdout)
            jp_unr = json.loads(run_py(["check", str(empty_font_pdf), "--json"], cwd=tdir).stdout)
            self.assertEqual(jn_unr.get("coverageWarnings"), jp_unr.get("coverageWarnings"))
            self.assertTrue(any(w["code"] == "unreadable-pdf-text" for w in jn_unr.get("coverageWarnings", [])))

            # 3. HTML entities, block boundaries, SPA warning, auto-html-longform, and --profile --ml on HTML
            html_entities = tdir / "entities.html"
            html_entities.write_text(
                "<!doctype html><html><body>"
                "<p>Payload &gt;512K &amp; latency &lt;5ms; space&nbsp;kept.</p>"
                "<h2>Section One</h2><p>First short row.</p>"
                "<ul><li>Alpha</li><li>Beta</li></ul>"
                "<table><tr><td>Col A</td><td>Col B</td></tr></table>"
                "</body></html>\n",
                encoding="utf-8",
            )
            jn_he = json.loads(run_node(["check", str(html_entities), "--pack", "business-brief", "--json"], cwd=tdir).stdout)
            jp_he = json.loads(run_py(["check", str(html_entities), "--pack", "business-brief", "--json"], cwd=tdir).stdout)
            self.assertEqual(jn_he["findings"], jp_he["findings"])
            self.assertEqual(jn_he["findings"], [])

            long_prose_html = tdir / "article.html"
            long_body = "\n".join(f"<p>第 {i} 段通过实际压测把响应耗时从 18ms 降到 9ms，全面赋能团队高质量协同与核心链路全闭环升级，稳定服务日常交付流程。</p>" for i in range(1, 20))
            long_prose_html.write_text(f"<!doctype html><html><body><article><h1>技术复盘</h1>{long_body}</article></body></html>\n", encoding="utf-8")
            jn_lh = json.loads(run_node(["check", str(long_prose_html), "--pack", "auto", "--profile", "--ml", "--json"], cwd=tdir).stdout)
            jp_lh = json.loads(run_py(["check", str(long_prose_html), "--pack", "auto", "--profile", "--ml", "--json"], cwd=tdir).stdout)
            self.assertEqual(jn_lh["findings"], jp_lh["findings"])
            self.assertEqual(jn_lh["files"][0]["packSource"], "auto-html-longform")
            self.assertEqual(jn_lh["files"][0], jp_lh["files"][0])
            self.assertEqual(jn_lh["profiles"], jp_lh["profiles"])
            self.assertIsNotNone(jn_lh["profiles"][0].get("profile"))
            self.assertIsNotNone(jn_lh["profiles"][0].get("pocketModel"))

            spa_html = tdir / "spa.html"
            spa_payload = json.dumps({"items": [{"title": "x", "summary": "long json state"}] * 20})
            spa_html.write_text(f"<!doctype html><html><body><div id='root'></div><script type='application/json'>{spa_payload}</script></body></html>\n", encoding="utf-8")
            jn_spa = json.loads(run_node(["check", str(spa_html), "--json"], cwd=tdir).stdout)
            jp_spa = json.loads(run_py(["check", str(spa_html), "--json"], cwd=tdir).stdout)
            self.assertEqual(jn_spa.get("coverageWarnings"), jp_spa.get("coverageWarnings"))
            self.assertTrue(any(w["code"] == "spa-json-shell" for w in jn_spa.get("coverageWarnings", [])))

            # 4. verifyRevision parity: dates, 2-pass qualifiers, Chinese numerals, idiom guard
            src_rev = (
                "11/20 发布首版。\n"
                "11月20日 10:30 更新。\n"
                "截至 11/21 完成回归，共三个模块，实现零误报。\n"
                "这解决了一个问题。\n"
            ) + ("补充背景行。\n" * 10)
            rev_ok = (
                "11/20 发布首版。\n"
                "11月20日 10:30 更新。\n"
                "截至 11/21 完成回归，共三个模块，实现零误报。\n"
                "这解决了核心瓶颈。\n"
            )
            rev_bad = (
                "11/20 发布首版。\n"
                "11月20日 10:30 更新。\n"
                "11/21 完成回归，共四个模块，实现无误报。\n"
                "这解决了一个问题。\n"
            )
            js_ver_script = (
                "import { verifyRevision } from './src/core.mjs';"
                "const [s, ok, bad] = process.argv.slice(1);"
                "console.log(JSON.stringify({ ok: verifyRevision(s, ok), bad: verifyRevision(s, bad) }));"
            )
            vr_n = json.loads(subprocess.check_output(["node", "-e", js_ver_script, src_rev, rev_ok, rev_bad], cwd=REPO_ROOT, text=True))
            vr_p = {"ok": verify_revision(src_rev, rev_ok), "bad": verify_revision(src_rev, rev_bad)}
            self.assertEqual(vr_n, vr_p)
            self.assertEqual(vr_n["ok"]["status"], "preserved")
            self.assertEqual(vr_n["bad"]["status"], "drifted")
            self.assertTrue(any(item.get("canonical") == "3个" for item in vr_n["bad"]["missing"]))
            self.assertTrue(any("零" in str(item.get("raw", "")) for item in vr_n["bad"]["missing"]))
            self.assertTrue(any(item.get("canonical") == "11/21" for item in vr_n["bad"]["qualifierDropped"]))

    def test_tightened_new_rules_ui_probes_patterns_and_pocket_ml_parity(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)

            # 1. Mixed prose & rules parity: decimals/versions, zh-dev-jargon, zh-exclamation, zh-mega-sentence, unsourced-statistic, negation-pivot, semicolon, triad, skeleton, mention-vs-use
            prose_doc = tdir / "mixed-prose.md"
            prose_doc.write_text(
                "\n\n".join([
                    # Safe decimals/versions/tech lists/checklists/SLA/meta-mentions
                    "The release runs 3.02x faster on v0.5 benchmarks, scoring 83.64 across 0.80 thresholds. Latency dropped cleanly. Error rate stabilized.",
                    "包含缓存、队列、路由等模块。",
                    "We removed the buzzword `\"赋能\"` and old 套词 `\"抓手\"` during cleanup.",
                    "服务可用性 SLA 达到 99.9%，按合同条款执行。",
                    "1) Parse config; 2) Validate tokens; 3) Emit summary.",
                    # True positives for tightened & 4 new rules
                    "这不仅是一次版本升级，更是一次全面跃迁。问题不在工具，而在执行态度。",
                    "全链路实现全闭环、严禁越权，核心节点全量满血兜底上线。",
                    "今天全新版本终于正式上线了！生产力全面爆发！体验简直太棒了！大家都说好用！",
                    "为了保证每个工作节点在多轮自动核验之后依然能够稳定输出完全一致的结构化结论，并把所有上下文字段、中间状态标记、历史修订版本、分片校验码、异常回退路径、待办清单以及跨阶段依赖关系全部按顺序逐项核对完毕并写入本地持久化日志，我们在核心调度器里又专门补充了一整套前置检查逻辑，同时在每次状态切换和边界校验执行之前再次逐条确认全部内部约束条件以确保整个执行流程持续维持在一个高度清晰且有序的常规运行区间之内。",
                    "本次升级后系统效率提升42%，团队协作体验明显更好。",
                    "第一段：步骤说明细节。第二段补充。第三段补充。第四段补充。\n\n"
                    "第五段：步骤说明细节，同尾收束。\n\n"
                    "第六段：步骤说明细节，同尾收束。\n\n"
                    "第七段：步骤说明细节，同尾收束。",
                ]) + "\n",
                encoding="utf-8",
            )
            jn_p = json.loads(run_node(["check", str(prose_doc), "--pack", "business-brief", "--json"], cwd=tdir).stdout)
            jp_p = json.loads(run_py(["check", str(prose_doc), "--pack", "business-brief", "--json"], cwd=tdir).stdout)
            self.assertEqual(jn_p["findings"], jp_p["findings"])
            got_prose_rules = {f["ruleId"] for f in jn_p["findings"]}
            for expected in (
                "negation-pivot-frame",
                "zh-dev-jargon",
                "zh-exclamation",
                "zh-mega-sentence",
                "unsourced-statistic",
            ):
                self.assertIn(expected, got_prose_rules)
            # Decimals/versions must NOT trigger staccato-slogan-run; SLA 99.9% and meta-mention "赋能" on line 5 must NOT trigger
            line_map = {(f["ruleId"], f["line"]) for f in jn_p["findings"]}
            self.assertNotIn(("staccato-slogan-run", 1), line_map)
            self.assertNotIn(("unsourced-statistic", 7), line_map)

            # 2. UI probes parity: SVG pill <rect>, <style> box-in-box, clean pagination disabled button, clean <ol> numbered steps
            ui_html = tdir / "ui-checks.html"
            ui_html.write_text(
                "<!doctype html><html><head><style>\n"
                ".panel { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; }\n"
                "</style></head><body>\n"
                "<nav aria-label='pagination'><button disabled data-disabled='true'>Prev</button></nav>\n"
                "<ol class='steps'><li><span>01</span> Prepare</li><li><span>02</span> Build</li><li><span>03</span> Ship</li></ol>\n"
                "<div class='panel'><div class='panel'><div class='panel'>Nested</div></div></div>\n"
                "<svg width='420' height='80'>\n"
                "  <rect x='10' y='10' width='80' height='24' rx='12'/>\n"
                "  <rect x='100' y='10' width='80' height='24' rx='12'/>\n"
                "  <rect x='190' y='10' width='80' height='24' rx='12'/>\n"
                "  <rect x='280' y='10' width='80' height='24' rx='12'/>\n"
                "  <rect x='10' y='44' width='80' height='24' rx='12'/>\n"
                "  <rect x='100' y='44' width='80' height='24' rx='12'/>\n"
                "  <rect x='190' y='44' width='80' height='24' rx='12'/>\n"
                "</svg>\n"
                "</body></html>\n",
                encoding="utf-8",
            )
            jn_ui = json.loads(run_node(["check", str(ui_html), "--pack", "deck-and-ui", "--json"], cwd=tdir).stdout)
            jp_ui = json.loads(run_py(["check", str(ui_html), "--pack", "deck-and-ui", "--json"], cwd=tdir).stdout)
            self.assertEqual(jn_ui["findings"], jp_ui["findings"])
            ui_rules = {f["ruleId"] for f in jn_ui["findings"]}
            self.assertIn("ui-box-in-box", ui_rules)
            self.assertIn("ui-pill-soup", ui_rules)
            self.assertNotIn("ui-dead-control", ui_rules)
            self.assertNotIn("ui-template-card-grid", ui_rules)

            # 3. pattern_engine config.rules, allow, and dislop-ignore-next-line + proseFences parity
            cfg_dir = tdir / "cfg"
            cfg_dir.mkdir()
            (cfg_dir / ".disloprc.json").write_text(
                json.dumps({
                    "pack": "business-brief",
                    "rules": {"negation-pivot-frame": "off"},
                    "allow": ["全闭环"],
                    "proseFences": ["text"],
                }),
                encoding="utf-8",
            )
            pat_md = cfg_dir / "sample.md"
            pat_md.write_text(
                "```text\n"
                "这不是工具升级，而是工作方式升级。实现全闭环。\n"
                "```\n\n"
                "<!-- dislop-ignore-next-line negation-pivot-frame -->\n"
                "这不是工具升级，而是工作方式升级。\n",
                encoding="utf-8",
            )
            jn_pat = json.loads(run_node(["check", str(pat_md), "--patterns", "--json"], cwd=cfg_dir).stdout)
            jp_pat = json.loads(run_py(["check", str(pat_md), "--patterns", "--json"], cwd=cfg_dir).stdout)
            self.assertEqual(jn_pat["findings"], jp_pat["findings"])
            pat_rules = {f["ruleId"] for f in jn_pat["findings"]}
            self.assertNotIn("negation-pivot-frame", pat_rules)
            self.assertNotIn("zh-dev-jargon", pat_rules)

            # 4. Pocket ML YAML frontmatter mask, UI short-line stack suppression, and 0-flagged cap parity
            fm_md = cfg_dir / "frontmatter.md"
            fm_md.write_text(
                "---\ntitle: Release Note\ntags: [ops, build]\n---\n\n"
                "LABEL ONE\nLABEL TWO\nLABEL THREE\n\n"
                "The parser reads config.json and exits 0 when valid.\n",
                encoding="utf-8",
            )
            jn_ml = json.loads(run_node(["check", str(fm_md), "--ml", "--profile", "--json"], cwd=cfg_dir).stdout)
            jp_ml = json.loads(run_py(["check", str(fm_md), "--ml", "--profile", "--json"], cwd=cfg_dir).stdout)
            self.assertEqual(jn_ml["profiles"], jp_ml["profiles"])
            ml_obj = jn_ml["profiles"][0]["pocketModel"]
            self.assertIsNotNone(ml_obj)
            if ml_obj.get("paragraphs", []):
                if not ml_obj.get("flaggedParagraphs"):
                    self.assertNotEqual(ml_obj.get("documentRisk"), "high")

    def test_redteam_pdf_html_fact_ledger_cli_and_mcp_parity(self) -> None:
        # A. PDF Quartz Tm-scaled font sizes, pdfTeX TJ negative kerning spaces, nested ActualText & lazy bfrange
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            stream_body = (
                "/P << /ActualText <FEFF59165C42> >> BDC\n"
                "/P << /ActualText (inner) >> BDC (skip) Tj EMC\n"
                "EMC\n"
                "BT\n"
                "/F1 1 Tf\n"
                "12 0 0 12 72 720 Tm\n"
                "[(Hello) -250 (world)] TJ\n"
                "ET\n"
                "BT\n"
                "/F2 1 Tf\n"
                "12 0 0 12 72 680 Tm\n"
                "<00010002> Tj\n"
                "ET\n"
            ).encode("latin1")
            cmap_body = (
                "/CIDInit /ProcSet findresource begin\n"
                "12 dict begin\n"
                "begincmap\n"
                "1 begincodespacerange\n<0001> <00FF>\nendcodespacerange\n"
                "1 beginbfrange\n<0001> <00FF> <0041>\nendbfrange\n"
                "endcmap\n"
            ).encode("latin1")
            objs = [
                b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
                b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>\nendobj\n",
                b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>\nendobj\n",
                b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
                b"5 0 obj\n<< /Type /Font /Subtype /Type0 /ToUnicode 7 0 R >>\nendobj\n",
                b"6 0 obj\n<< /Length " + str(len(stream_body)).encode("ascii") + b" >>\nstream\n" + stream_body + b"\nendstream\nendobj\n",
                b"7 0 obj\n<< /Length " + str(len(cmap_body)).encode("ascii") + b" >>\nstream\n" + cmap_body + b"\nendstream\nendobj\n",
            ]
            pdf_parts = [b"%PDF-1.4\n"]
            offsets = [0]
            pos = len(pdf_parts[0])
            for o in objs:
                offsets.append(pos)
                pdf_parts.append(o)
                pos += len(o)
            xref_pos = pos
            xref_lines = [f"xref\n0 {len(objs) + 1}\n".encode("ascii"), b"0000000000 65535 f \n"]
            for off in offsets[1:]:
                xref_lines.append(f"{off:010d} 00000 n \n".encode("ascii"))
            pdf_bytes = b"".join(pdf_parts) + b"".join(xref_lines) + (
                f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii")
            )
            pdf_path = root / "quartz_tm.pdf"
            pdf_path.write_bytes(pdf_bytes)
            jn_pdf = json.loads(run_node(["check", str(pdf_path), "--format", "json"]).stdout)
            jp_pdf = json.loads(run_py(["check", str(pdf_path), "--format", "json"]).stdout)
            self.assertEqual(jn_pdf["findings"], jp_pdf["findings"])
            self.assertEqual(jn_pdf["checkedCount"], 1)
            self.assertEqual(jp_pdf["checkedCount"], 1)
            # Inherited MediaBox & Font + 12pt Tm-scaled text + ActualText + TJ kerning must inspect cleanly with no unreadable-pdf-text error
            self.assertEqual([f["ruleId"] for f in jn_pdf["findings"]], [])

            # B. HTML <pre> exclusion, CRLF parse_suppressions, <ol> semantic list exemption & exact UI attr bounds
            crlf_html = root / "sample.html"
            crlf_html.write_bytes((
                "<html><body>\r\n"
                "<pre>" + ("log line 123\r\n" * 60) + "</pre>\r\n"
                "<ol><li><span>01</span> First step</li><li><span>02</span> Second step</li><li><span>03</span> Third step</li></ol>\r\n"
                "<svg><rect width=\"20\" height=\"20\" data-rx=\"99\" rx=\"2\"></rect></svg>\r\n"
                "<p>Check &lt;script&gt;; and &gt;10ms latency on endpoint.</p>\r\n"
                "</body></html>\r\n"
            ).encode("utf-8"))
            jn_h = json.loads(run_node(["check", str(crlf_html), "--pack", "auto", "--format", "json"]).stdout)
            jp_h = json.loads(run_py(["check", str(crlf_html), "--pack", "auto", "--format", "json"]).stdout)
            self.assertEqual(jn_h["findings"], jp_h["findings"])
            self.assertEqual(jn_h["effectivePack"], jp_h["effectivePack"])
            self.assertEqual(jn_h["effectivePack"], "deck-and-ui")

            # C. Pocket ML BOM + trailing spaces YAML + UI short-line cap parity
            bom_md = root / "bom_ui.md"
            bom_md.write_bytes((
                "\ufeff---  \r\n"
                "title: Diagram\r\n"
                "--- \r\n\r\n"
                "INPUT NODE\r\nPROCESS STEP\r\nOUTPUT TARGET\r\n"
            ).encode("utf-8"))
            jn_bom = json.loads(run_node(["model", "score", str(bom_md), "--json"]).stdout)
            jp_bom = json.loads(run_py(["model", "score", str(bom_md), "--json"]).stdout)
            self.assertEqual(jn_bom, jp_bom)

            # D. CLI --changed: CJK path, +++ b/ inside hunk body, --, --changed=, ignored/unsupported files, multiline overlap
            repo = root / "repo"
            repo.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            cjk_file = repo / "交付报告.md"
            cjk_file.write_text(
                "Line 1 ok.\n\n- **First item**: a\n- **Second item**: b\n- **Third item**: c\n- **Fourth item**: d\n",
                encoding="utf-8",
            )
            (repo / "notes.json").write_text('{"k": 1}\n', encoding="utf-8")
            (repo / ".dislop.json").write_text('{"ignore": ["ignored/**"]}\n', encoding="utf-8")
            (repo / "ignored").mkdir()
            (repo / "ignored" / "skip.md").write_text("In addition, **First**: 1\n", encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=repo, check=True)
            cjk_file.write_text(
                "Line 1 ok.\n\n+++ b/fake.md\n\n- **First item**: a\n- **Second item**: b!\n- **Third item**: c\n- **Fourth item**: d\n",
                encoding="utf-8",
            )
            (repo / "notes.json").write_text('{"k": 2}\n', encoding="utf-8")
            (repo / "ignored" / "skip.md").write_text("In addition, **First**: 2\n", encoding="utf-8")
            rn_chg = run_node(["check", "--changed=", "--format", "json"], cwd=repo)
            rp_chg = run_py(["check", "--changed=", "--format", "json"], cwd=repo)
            self.assertEqual(rn_chg.returncode, rp_chg.returncode)
            self.assertEqual(rn_chg.returncode, 0)
            jn_chg = json.loads(rn_chg.stdout)
            jp_chg = json.loads(rp_chg.stdout)
            self.assertEqual(jn_chg["findings"], jp_chg["findings"])
            self.assertEqual(jn_chg["skipped"], [])
            self.assertEqual(jp_chg["skipped"], [])
            self.assertTrue(any(f["ruleId"] == "bold-lead-list-wall" for f in jn_chg["findings"]))

            # -- end-of-flags parity
            dash_file = repo / "-lead.md"
            dash_file.write_text("Clean note.\n", encoding="utf-8")
            rn_dash = run_node(["check", "--json", "--", str(dash_file)], cwd=repo)
            rp_dash = run_py(["check", "--json", "--", str(dash_file)], cwd=repo)
            self.assertEqual(rn_dash.returncode, 0)
            self.assertEqual(rp_dash.returncode, 0)

            # E. MCP null / array JSON-RPC -32600, profile=false low-prose-coverage, and symlink containment
            big_code_md = "```\n" + ("x = 1;\n" * 400) + "```\nShort note.\n"
            link_path = root / "repo_link.md"
            try:
                link_path.symlink_to(cjk_file)
            except OSError:
                link_path = None
            mcp_reqs = "\n".join([
                "null",
                "[1]",
                json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "dislop_check", "arguments": "bad"}}),
                json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "dislop_check", "arguments": {"text": big_code_md, "filename": "code.md", "profile": False}}}),
                json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "dislop_check", "arguments": {"path": str(cjk_file)}}}),
            ]) + "\n"
            rn_mcp = run_node(["--mcp"], cwd=repo, stdin_text=mcp_reqs)
            rp_mcp = run_py(["--mcp"], cwd=repo, stdin_text=mcp_reqs)
            self.assertEqual(rn_mcp.returncode, 0, rn_mcp.stderr)
            self.assertEqual(rp_mcp.returncode, 0, rp_mcp.stderr)
            n_lines = [json.loads(l) for l in rn_mcp.stdout.splitlines() if l.strip()]
            p_lines = [json.loads(l) for l in rp_mcp.stdout.splitlines() if l.strip()]
            self.assertEqual(len(n_lines), 5)
            self.assertEqual(len(p_lines), 5)
            self.assertEqual(n_lines[0]["error"]["code"], -32600)
            self.assertEqual(p_lines[0]["error"]["code"], -32600)
            self.assertEqual(n_lines[1]["error"]["code"], -32600)
            self.assertEqual(p_lines[1]["error"]["code"], -32600)
            self.assertEqual(n_lines[2]["error"]["code"], -32602)
            self.assertEqual(p_lines[2]["error"]["code"], -32602)
            n_cov = json.loads(n_lines[3]["result"]["content"][0]["text"])
            p_cov = json.loads(p_lines[3]["result"]["content"][0]["text"])
            self.assertNotIn("profile", n_cov)
            self.assertNotIn("profile", p_cov)
            self.assertEqual(n_cov["coverageWarnings"], p_cov["coverageWarnings"])
            self.assertTrue(any(w["code"] == "low-prose-coverage" for w in n_cov["coverageWarnings"]))
            n_path = json.loads(n_lines[4]["result"]["content"][0]["text"])
            p_path = json.loads(p_lines[4]["result"]["content"][0]["text"])
            self.assertEqual(n_path["checked"], True)
            self.assertEqual(p_path["checked"], True)

        # F. verifyRevision JS <-> Python parity (fullwidth, negated symmetric qualifier, compound ZH, RFC-3986 URL, ratio, terminal period date)
        vr_cases = [
            (
                "上限为 100ms，详见 https://example.com/a?x=1&y=2#top. 比例 3:1，共十二个步骤，最低 5 项，日期 2026-11-20。",
                "上限为 １００ms，详见 https://example.com/a?x=1&y=2#top. 比例 3:1，共12个步骤，不小于 5 项，日期 2026-11-20。",
                "preserved",
            ),
            (
                "延迟不大于 20ms，共三个模块。",
                "延迟不小于 20ms，共四个模块。",
                "drifted",
            ),
        ]
        node_vr_script = (
            'import fs from "node:fs"; '
            'import { verifyRevision } from "./src/core.mjs"; '
            'const cases = JSON.parse(fs.readFileSync(0, "utf8")); '
            'console.log(JSON.stringify(cases.map(([a, b]) => verifyRevision(a, b))));'
        )
        n_vr_proc = subprocess.run(
            ["node", "--input-type=module", "-e", node_vr_script],
            cwd=REPO_ROOT,
            input=json.dumps([[a, b] for a, b, _ in vr_cases]),
            capture_output=True,
            text=True,
            check=True,
        )
        n_vrs = json.loads(n_vr_proc.stdout)
        from dislop.engine import verify_revision as py_verify_revision
        for idx, (bef, aft, exp_status) in enumerate(vr_cases):
            py_vr = py_verify_revision(bef, aft)
            self.assertEqual(n_vrs[idx]["status"], exp_status)
            self.assertEqual(py_vr["status"], exp_status)
            self.assertEqual(n_vrs[idx], py_vr)

    def test_stage_b_verify_rubric_cross_check_and_anti_degradation_parity(self):
        import http.server
        import os
        import subprocess
        import sys
        import threading

        # 1. AI buzzword cluster vs grounded industry jargon parity
        grounded_doc = "主库异常时由 Redis 兜底，写入 wal.log 落盘，周五前合入 3 个 PR 收口并打通告警回调。\n"
        slop_jargon_doc = "我们将依托底层逻辑与顶层设计实现生态共赢，形成商业闭环并持续降本增效。\n"
        rn_grd = json.loads(run_node(["check", "-", "--stdin-filename", "ops.md", "--format", "json"], stdin_text=grounded_doc).stdout)
        rp_grd = json.loads(run_py(["check", "-", "--stdin-filename", "ops.md", "--format", "json"], stdin_text=grounded_doc).stdout)
        self.assertEqual([f["ruleId"] for f in rn_grd["findings"] if f["ruleId"] == "zh-dev-jargon"], [])
        self.assertEqual(rn_grd["findings"], rp_grd["findings"])

        rn_slop = json.loads(run_node(["check", "-", "--stdin-filename", "ops.md", "--format", "json"], stdin_text=slop_jargon_doc).stdout)
        rp_slop = json.loads(run_py(["check", "-", "--stdin-filename", "ops.md", "--format", "json"], stdin_text=slop_jargon_doc).stdout)
        self.assertEqual(rn_slop["findings"], rp_slop["findings"])
        self.assertTrue(any(f["ruleId"] == "zh-dev-jargon" for f in rn_slop["findings"]))

        # 2. Multi-layer AI-tic bank signals + 5-layer rubric file + fixStrategy + --deep/--compact
        tic_sample = (
            "The platform handles billing batches, highlighting the crucial role of operational readiness. "
            "On the one hand it improves throughput, on the other hand it depends on careful balance.\n\n"
            "随着协作深入，这个工具迈入新阶段，为后续协同奠定了坚实基础。"
            "这个方案有利有弊，具体取决于场景。\n"
        )
        rn_deep = json.loads(
            run_node(["check", "-", "--stdin-filename", "tics.md", "--deep", "--compact", "--format", "json"], stdin_text=tic_sample).stdout
        )
        rp_deep = json.loads(
            run_py(["check", "-", "--stdin-filename", "tics.md", "--deep", "--compact", "--format", "json"], stdin_text=tic_sample).stdout
        )
        self.assertEqual(rn_deep, rp_deep)
        self.assertIn("ruleMeta", rn_deep)
        self.assertTrue(all("fixStrategy" in f for f in rn_deep["findings"]))
        hit_rules = {f["ruleId"] for f in rn_deep["findings"]}
        self.assertIn("concession-symmetry-frame", hit_rules)
        self.assertIn("zh-ai-calque-cluster", hit_rules)

        rubric_data = json.loads((REPO_ROOT / "patterns" / "ai-tic-rubric.json").read_text(encoding="utf-8"))
        self.assertEqual([l["id"] for l in rubric_data["layers"]], ["lexical", "syntactic", "rhythm", "cognitive-framing", "rhetorical-stance"])

        # 3. Zone-aware --pack auto on mixed-prose HTML and Markdown with embedded SVG/HTML
        mixed_html = (
            "<html><head><style>.btn{border:1px solid #ccc;}</style></head><body>"
            "<div class='card'><p>首先，我们需要重构发布队列并在周四前合入主干代码。</p>"
            "<p>这不仅是一次例行升级，而是工程效率的全面飞跃，真正重塑研发体验。</p></div></body></html>"
        )
        rn_mhtml = json.loads(run_node(["check", "-", "--stdin-filename", "mixed.html", "--pack", "auto", "--format", "json"], stdin_text=mixed_html).stdout)
        rp_mhtml = json.loads(run_py(["check", "-", "--stdin-filename", "mixed.html", "--pack", "auto", "--format", "json"], stdin_text=mixed_html).stdout)
        self.assertEqual(rn_mhtml["effectivePack"], "business-brief+deck-and-ui")
        self.assertEqual(rn_mhtml["findings"], rp_mhtml["findings"])

        mixed_md = (
            "# Release Checklist\n\n"
            "We cut release v2.4 on Tuesday after verifying all 12 integration checks and queue metrics.\n\n"
            "All deployment notes stay in this document while team leads review the staging rollout.\n\n"
            "<div class=\"panel\">\n"
            "  <a href=\"#\" class=\"bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500\">Go</a>\n"
            "</div>\n"
        )
        rn_mmd = json.loads(run_node(["check", "-", "--stdin-filename", "mixed.md", "--pack", "auto", "--format", "json"], stdin_text=mixed_md).stdout)
        rp_mmd = json.loads(run_py(["check", "-", "--stdin-filename", "mixed.md", "--pack", "auto", "--format", "json"], stdin_text=mixed_md).stdout)
        self.assertTrue(rn_mmd["effectivePack"].endswith("+deck-and-ui"))
        self.assertEqual(rn_mmd["packSource"], "auto-mixed-ui")
        self.assertEqual(rn_mmd["effectivePack"], rp_mmd["effectivePack"])
        self.assertEqual(rn_mmd["findings"], rp_mmd["findings"])
        self.assertTrue(any(f["ruleId"] == "ui-dead-control" for f in rn_mmd["findings"]))

        # 4. `dislop verify` (--git, --keep, --strict, all 5 antiDegradation warnings) & layered config + voice discovery
        with tempfile.TemporaryDirectory() as tmp:
            tpath = Path(tmp)
            cfg_home = tpath / "user_cfg"
            cfg_home.mkdir()
            (cfg_home / "dislop").mkdir()
            (cfg_home / "dislop" / "config.json").write_text(
                json.dumps({"rules": {"bold-lead-list-wall": "off"}}), encoding="utf-8"
            )
            (cfg_home / "dislop" / "voice.json").write_text(
                json.dumps({"schema": "dislop.voice/1", "profile": {"tone": "crisp engineer", "sentenceHabits": ["short first"]}}),
                encoding="utf-8",
            )
            env_cfg = {**os.environ, "DISLOP_CONFIG_HOME": str(cfg_home / "dislop"), "DISLOP_TEST_MODE": "1"}

            repo = tpath / "repo"
            repo.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)

            target = repo / "post.md"
            before_post = (
                "我在上周把 API P99 延迟从 320ms 降到 115ms，主要靠 Redis 兜底和连接池复用。\n\n"
                "我们预计周四前切到全部 4 个节点，除非出现突发错误率上涨，否则不会回滚。\n"
            )
            target.write_text(before_post, encoding="utf-8")
            subprocess.run(["git", "add", "post.md"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "baseline"], cwd=repo, check=True)

            # Degraded revision hitting voice-perspective-erased, modality-drifted, secondary-slop-introduced, fact drop
            bad_after = "该团队完成了系统优化，全闭环地显著提升了整体效率。\n"
            target.write_text(bad_after, encoding="utf-8")
            vn_bad = subprocess.run(["node", str(REPO_ROOT / "bin" / "dislop.mjs"), "verify", "--git", "HEAD", "post.md", "--keep", "Redis,4", "--json"], cwd=repo, env=env_cfg, capture_output=True, text=True)
            vp_bad = subprocess.run([sys.executable, "-m", "dislop.cli", "verify", "--git", "HEAD", "post.md", "--keep", "Redis,4", "--json"], cwd=repo, env={**env_cfg, "PYTHONPATH": str(REPO_ROOT / "src")}, capture_output=True, text=True)
            self.assertEqual(vn_bad.returncode, 1)
            self.assertEqual(vp_bad.returncode, 1)
            jn_vbad = json.loads(vn_bad.stdout)
            jp_vbad = json.loads(vp_bad.stdout)
            self.assertEqual(jn_vbad["antiDegradation"], jp_vbad["antiDegradation"])
            warn_codes = {w["code"] for w in jn_vbad["antiDegradation"]["warnings"]}
            self.assertTrue({"voice-perspective-erased", "modality-drifted", "information-loss", "secondary-slop-introduced"}.issubset(warn_codes))
            self.assertEqual(jn_vbad["keepTerms"]["missing"], ["Redis", "4"])

            # Cadence-flattened & clean revision checks
            before_cadence = (
                "Patch v2 shipped. "
                "The background billing worker processes one hundred and forty records every minute without spilling temporary files onto local disk during peak traffic hours. "
                "Retries dropped cleanly. "
                "Engineers audited every shard queue across four availability zones before flipping the production canary switch on Tuesday.\n"
            )
            flat_after = (
                "The team deployed patch v2 yesterday. "
                "The worker handles one hundred records well. "
                "Local disk usage remained steady today. "
                "Retry metrics looked normal during rollout. "
                "Engineers monitored the shard queues carefully.\n"
            )
            bf_f = repo / "b_cad.md"
            af_f = repo / "a_cad.md"
            bf_f.write_text(before_cadence, encoding="utf-8")
            af_f.write_text(flat_after, encoding="utf-8")
            vn_cad = run_node(["verify", str(bf_f), str(af_f), "--strict", "--json"], cwd=repo)
            vp_cad = run_py(["verify", str(bf_f), str(af_f), "--strict", "--json"], cwd=repo)
            self.assertEqual(vn_cad.returncode, 1)
            self.assertEqual(vp_cad.returncode, 1)
            jn_cad = json.loads(vn_cad.stdout)
            self.assertEqual(jn_cad["antiDegradation"], json.loads(vp_cad.stdout)["antiDegradation"])
            self.assertIn("cadence-flattened", {w["code"] for w in jn_cad["antiDegradation"]["warnings"]})

            # 5. Offline review + local MCP dislop_verify / dislop_rules / dislop_voice_extract alias parity
            target.write_text(before_post, encoding="utf-8")
            rn_rev = subprocess.run(["node", str(REPO_ROOT / "bin" / "dislop.mjs"), "review", "post.md", "--offline", "--json"], cwd=repo, env=env_cfg, capture_output=True, text=True, check=True)
            rp_rev = subprocess.run([sys.executable, "-m", "dislop.cli", "review", "post.md", "--offline", "--json"], cwd=repo, env={**env_cfg, "PYTHONPATH": str(REPO_ROOT / "src")}, capture_output=True, text=True, check=True)
            jn_rev = json.loads(rn_rev.stdout)
            jp_rev = json.loads(rp_rev.stdout)
            self.assertEqual(jn_rev["crossCheck"], jp_rev["crossCheck"])
            self.assertEqual(jn_rev["rubricLayers"], jp_rev["rubricLayers"])
            self.assertEqual(jn_rev["voiceCard"], {"found": True, "scope": "user"})
            self.assertEqual(jn_rev["voiceCard"], jp_rev["voiceCard"])

            # BYOK loopback OpenAI mock server parity (verbatim grounding + anti-reslop + anti-fake-human + fact-drop downgrade)
            received_payloads = []

            class MockHandler(http.server.BaseHTTPRequestHandler):
                def log_message(self, *args):
                    pass

                def do_POST(self):
                    ln = int(self.headers.get("Content-Length", "0"))
                    received_payloads.append(json.loads(self.rfile.read(ln).decode("utf-8")))
                    resp_obj = {
                        "choices": [
                            {
                                "message": {
                                    "content": json.dumps(
                                        {
                                            "summary": "发现一处思维端水与一处数值风险。",
                                            "issues": [
                                                {
                                                    "quote": "我在上周把 API P99 延迟从 320ms 降到 115ms",
                                                    "ticLayer": "lexical",
                                                    "action": "edit",
                                                    "severity": "info",
                                                    "why": "drop test",
                                                    "replacement": "我在上周优化了 API 延迟",
                                                },
                                                {
                                                    "quote": "主要靠 Redis 兜底和连接池复用",
                                                    "ticLayer": "rhetorical-stance",
                                                    "action": "edit",
                                                    "severity": "info",
                                                    "why": "fake human slang must be blocked",
                                                    "replacement": "家人们，主要靠 Redis 兜底和连接池复用",
                                                },
                                                {
                                                    "quote": "预计周四前切到全部 4 个节点",
                                                    "ticLayer": "cognitive-framing",
                                                    "action": "rewrite",
                                                    "severity": "info",
                                                    "why": "明确写清灰度比例，避免模棱两可",
                                                    "instruction": "写出周四的具体时间窗口。",
                                                },
                                                {
                                                    "quote": "NOT_IN_SOURCE_QUOTE",
                                                    "ticLayer": "cognitive-framing",
                                                    "action": "edit",
                                                    "severity": "warning",
                                                    "why": "hallucinated",
                                                    "replacement": "ignored",
                                                },
                                            ],
                                        },
                                        ensure_ascii=False,
                                    )
                                }
                            }
                        ]
                    }
                    body = json.dumps(resp_obj, ensure_ascii=False).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)

            srv = http.server.HTTPServer(("127.0.0.1", 0), MockHandler)
            t = threading.Thread(target=srv.serve_forever, daemon=True)
            t.start()
            try:
                ep = f"http://127.0.0.1:{srv.server_address[1]}/v1"
                env_byok = {**env_cfg, "DISLOP_REVIEW_API_KEY": "test_dummy_key"}
                bn = subprocess.run(["node", str(REPO_ROOT / "bin" / "dislop.mjs"), "review", "post.md", "--endpoint", ep, "--lang", "zh", "--json"], cwd=repo, env=env_byok, capture_output=True, text=True, check=True)
                bp = subprocess.run([sys.executable, "-m", "dislop.cli", "review", "post.md", "--endpoint", ep, "--lang", "zh", "--json"], cwd=repo, env={**env_byok, "PYTHONPATH": str(REPO_ROOT / "src")}, capture_output=True, text=True, check=True)
                jbn = json.loads(bn.stdout)
                jbp = json.loads(bp.stdout)
                self.assertEqual(jbn["mode"], "byok-llm")
                self.assertEqual(jbn["issues"], jbp["issues"])
                # Issue 0 had numbers dropped -> downgraded from edit to rewrite; Issue 1 introduced fake-human slang -> filtered out; Issue 3 not verbatim -> filtered out
                self.assertEqual(len(jbn["issues"]), 2)
                self.assertEqual(jbn["issues"][0]["action"], "rewrite")
                self.assertEqual(jbn["issues"][1]["ticLayer"], "cognitive-framing")
                self.assertEqual(len(received_payloads), 2)
                self.assertIn("cognitive-framing", received_payloads[0]["messages"][1]["content"])
            finally:
                srv.shutdown()
                srv.server_close()

            # 6. Local MCP dislop_verify, dislop_rules, and dislop_voice_extract alias parity
            mcp_stage_b = "\n".join([
                json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}),
                json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "dislop_rules", "arguments": {"ruleId": "zh-dev-jargon", "lang": "zh"}}}),
                json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "dislop_verify", "arguments": {"before": "预计延迟 120ms。", "after": "延迟已经很快。"}}}),
                json.dumps({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "dislop_voice_extract", "arguments": {"samples": ["Cut timeout to 5s on Friday."], "lang": "en"}}}),
            ]) + "\n"
            rn_mb = run_node(["--mcp"], cwd=repo, stdin_text=mcp_stage_b)
            rp_mb = run_py(["--mcp"], cwd=repo, stdin_text=mcp_stage_b)
            mn_lines = [json.loads(l) for l in rn_mb.stdout.splitlines() if l.strip()]
            mp_lines = [json.loads(l) for l in rp_mb.stdout.splitlines() if l.strip()]
            for i in range(1, 4):
                self.assertEqual(json.loads(mn_lines[i]["result"]["content"][0]["text"]), json.loads(mp_lines[i]["result"]["content"][0]["text"]))
            ver_mcp = json.loads(mn_lines[2]["result"]["content"][0]["text"])
            self.assertFalse(ver_mcp["ok"])
            self.assertIn("modality-drifted", {w["code"] for w in ver_mcp["antiDegradation"]["warnings"]})

    def test_round_2_subsumption_confidence_floor_presentation_and_trim(self):
        # 1. zh-dev-jargon subsumes overlapping zh-bureaucratic-padding while standalone bureaucratic padding remains active
        overlap_doc = "我们将依托底层逻辑与顶层设计实现生态共赢，形成商业闭环并持续降本增效。\n"
        standalone_doc = "我们需要全面赋能一线销售团队。\n"
        rn_ov = json.loads(run_node(["check", "-", "--stdin-filename", "ov.md", "--format", "json"], stdin_text=overlap_doc).stdout)
        rp_ov = json.loads(run_py(["check", "-", "--stdin-filename", "ov.md", "--format", "json"], stdin_text=overlap_doc).stdout)
        self.assertEqual(rn_ov["findings"], rp_ov["findings"])
        ov_rules = [f["ruleId"] for f in rn_ov["findings"]]
        self.assertIn("zh-dev-jargon", ov_rules)
        self.assertNotIn("zh-bureaucratic-padding", ov_rules)

        rn_st = json.loads(run_node(["check", "-", "--stdin-filename", "st.md", "--format", "json"], stdin_text=standalone_doc).stdout)
        rp_st = json.loads(run_py(["check", "-", "--stdin-filename", "st.md", "--format", "json"], stdin_text=standalone_doc).stdout)
        self.assertEqual(rn_st["findings"], rp_st["findings"])
        self.assertIn("zh-bureaucratic-padding", [f["ruleId"] for f in rn_st["findings"]])

        # 2. Pocket Router confidence floor keeps ambiguous short Chinese briefs on business-brief while clear engineering docs route to engineering-spec
        ambig_brief = "随着远程协作普及，这个方案有利有弊，具体取决于业务场景。\n"
        eng_doc = "上周五把结算接口 P99 延迟从 210ms 降到 42ms，涉及 checkout.py 和 Redis 连接池，重试超时从 30s 调到 5s。\n"
        rn_am = json.loads(run_node(["check", "-", "--stdin-filename", "am.md", "--pack", "auto", "--format", "json"], stdin_text=ambig_brief).stdout)
        rp_am = json.loads(run_py(["check", "-", "--stdin-filename", "am.md", "--pack", "auto", "--format", "json"], stdin_text=ambig_brief).stdout)
        self.assertEqual(rn_am["effectivePack"], "business-brief")
        self.assertEqual(rn_am["packSource"], "auto-default-fallback")
        self.assertEqual(rn_am["effectivePack"], rp_am["effectivePack"])
        self.assertEqual(rn_am["packSource"], rp_am["packSource"])

        rn_eg = json.loads(run_node(["check", "-", "--stdin-filename", "eg.md", "--pack", "auto", "--format", "json"], stdin_text=eng_doc).stdout)
        rp_eg = json.loads(run_py(["check", "-", "--stdin-filename", "eg.md", "--pack", "auto", "--format", "json"], stdin_text=eng_doc).stdout)
        self.assertEqual(rn_eg["effectivePack"], "engineering-spec")
        self.assertEqual(rn_eg["packSource"], "auto-pocket-router")
        self.assertEqual(rn_eg["effectivePack"], rp_eg["effectivePack"])

        # 3. Pattern-bank deletionTest != message + review ZH single-language presentation + crossCheck bar parity
        rev_doc = (
            "好的，以下是为您整理的方案。\n\n"
            "随着行业快速发展，我们依托底层逻辑与顶层设计形成商业闭环并持续降本增效。这个方案有利有弊，具体取决于场景。\n"
        )
        pn_pat = json.loads(run_node(["check", "-", "--stdin-filename", "p.md", "--deep", "--format", "json"], stdin_text=rev_doc).stdout)
        pp_pat = json.loads(run_py(["check", "-", "--stdin-filename", "p.md", "--deep", "--format", "json"], stdin_text=rev_doc).stdout)
        self.assertEqual(pn_pat["findings"], pp_pat["findings"])
        pat_hits = [f for f in pn_pat["findings"] if f.get("source") == "pattern-library"]
        self.assertTrue(len(pat_hits) >= 1)
        for ph in pat_hits:
            self.assertIn("deletionTest", ph)
            self.assertNotEqual(ph["deletionTest"]["zh"], ph["message"]["zh"])

        rn_rev_txt = run_node(["review", "-", "--stdin-filename", "brief.md", "--offline", "--lang", "zh"], stdin_text=rev_doc)
        rp_rev_txt = run_py(["review", "-", "--stdin-filename", "brief.md", "--offline", "--lang", "zh"], stdin_text=rev_doc)
        self.assertEqual(rn_rev_txt.returncode, 0)
        self.assertEqual(rn_rev_txt.stdout, rp_rev_txt.stdout)
        self.assertIn("信号分布:", rn_rev_txt.stdout)
        self.assertIn("层级:", rn_rev_txt.stdout)
        self.assertIn("原因:", rn_rev_txt.stdout)
        self.assertNotIn("why:", rn_rev_txt.stdout)
        self.assertIn("改法:", rn_rev_txt.stdout)

        # 4. Single-language deduplicated ZH text check report parity (repeated rule prints why/fix only once)
        dup_doc = (
            "我们需要全面赋能研发团队。\n\n"
            "同时还要打造闭环加快产品上线。\n\n"
            "最后明确抓手推进项目落地。\n\n"
            "最终靠顶层设计保障执行。\n"
        )
        rn_chk_txt = run_node(["check", "-", "--stdin-filename", "dup.md", "--lang", "zh"], stdin_text=dup_doc)
        rp_chk_txt = run_py(["check", "-", "--stdin-filename", "dup.md", "--lang", "zh"], stdin_text=dup_doc)
        self.assertEqual(rn_chk_txt.stdout, rp_chk_txt.stdout)
        self.assertEqual(rn_chk_txt.stdout.count("原因:"), 1)
        self.assertIn("zh-bureaucratic-padding [改写]", rn_chk_txt.stdout)
        self.assertIn("按规则分布:", rn_chk_txt.stdout)
        self.assertIn("下一步:", rn_chk_txt.stdout)

        # 5. Short 1-sentence greeting removal does not falsely warn over-compressed
        from dislop.engine import verify_revision_bundle
        short_bef = "好的，以下是说明：延迟降到 120ms。"
        short_aft = "延迟降到 120ms。"
        res_short = verify_revision_bundle(short_bef, short_aft, modality="markdown")
        self.assertEqual(res_short["lengthCheck"]["status"], "ok")
        self.assertNotIn("over-compressed", {w["code"] for w in res_short["antiDegradation"]["warnings"]})

    def test_v083_verify_revision_and_chatbot_artifact_parity(self) -> None:
        from dislop.engine import verify_revision

        vr_pairs = [
            (
                "Guarantees 99.98% delivery inside 5 seconds.",
                "Delivers 99.98% of events within 5 seconds.",
                "preserved",
            ),
            (
                "Caused by a TTL setting of 3600 seconds on the resolver.",
                "Caused by a 3600-second DNS TTL setting on the resolver.",
                "preserved",
            ),
            (
                "Migrates 40-million-row archives in 12 minutes.\n- **Scale**: Handles 40 million rows.",
                "Migrates 40-million-row archives in 12 minutes.",
                "preserved",
            ),
            (
                "Migrates 40-million-row archives in 12 minutes.\n- **Scale**: Handles 40 million rows.",
                "Migrates 40-million-row archives in 5 minutes.",
                "drifted",
            ),
        ]
        js_script = (
            "import { verifyRevision } from './src/core.mjs';\n"
            "const pairs = JSON.parse(process.argv[1]);\n"
            "console.log(JSON.stringify(pairs.map(([b, a]) => verifyRevision(b, a, { modality: 'markdown' }))));\n"
        )
        r_js = subprocess.run(
            ["node", "--input-type=module", "-e", js_script, json.dumps([[b, a] for b, a, _ in vr_pairs])],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
        js_out = json.loads(r_js.stdout)
        for idx, (bef, aft, exp_status) in enumerate(vr_pairs):
            py_vr = verify_revision(bef, aft, modality="markdown")
            self.assertEqual(js_out[idx]["status"], exp_status, f"JS status mismatch on pair #{idx}")
            self.assertEqual(py_vr["status"], exp_status, f"Py status mismatch on pair #{idx}")
            self.assertEqual(js_out[idx], py_vr, f"JS/Py ledger mismatch on pair #{idx}")
            if exp_status == "preserved":
                self.assertEqual(py_vr["retentionRate"], 1)

        chat_samples = [
            "Certainly! Here it is: Exports finish in up to 12 minutes.\n",
            "Here's a polished version of your release note: deploys at 14:00 UTC.\n",
            "希望以上内容对您有所帮助，如需调整请随时告诉我。\n",
        ]
        for sample in chat_samples:
            rn = run_node(["check", "-", "--stdin-filename", "chat.md", "--json"], stdin_text=sample)
            rp = run_py(["check", "-", "--stdin-filename", "chat.md", "--json"], stdin_text=sample)
            jn = json.loads(rn.stdout)
            jp = json.loads(rp.stdout)
            self.assertEqual([f["ruleId"] for f in jn["findings"]], [f["ruleId"] for f in jp["findings"]])
            self.assertIn("chatbot-artifact", [f["ruleId"] for f in jn["findings"]])


if __name__ == "__main__":
    unittest.main()
