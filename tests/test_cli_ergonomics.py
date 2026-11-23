"""Round 1 CLI ergonomics, strict flag parsing, brand-voice formatting, and Node/Python parity tests."""

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
    stdin_bytes: bytes | str | None = None,
    env_extra: dict[str, str] | None = None,
) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    is_bytes = isinstance(stdin_bytes, bytes)
    return subprocess.run(
        ["node", str(REPO_ROOT / "bin" / "dislop.mjs"), *args],
        cwd=str(cwd),
        input=stdin_bytes,
        capture_output=True,
        text=not is_bytes,
        env=env,
    )


def run_py(
    args: list[str],
    cwd: Path = REPO_ROOT,
    stdin_bytes: bytes | str | None = None,
    env_extra: dict[str, str] | None = None,
) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT / "src")
    if env_extra:
        env.update(env_extra)
    is_bytes = isinstance(stdin_bytes, bytes)
    return subprocess.run(
        [sys.executable, "-m", "dislop.cli", *args],
        cwd=str(cwd),
        input=stdin_bytes,
        capture_output=True,
        text=not is_bytes,
        env=env,
    )


class CliErgonomicsTests(unittest.TestCase):
    def test_unknown_flag_rejected_and_suggested(self) -> None:
        rn = run_node(["check", "--failon", "warning", "-"], stdin_bytes="Clean text.\n")
        rp = run_py(["check", "--failon", "warning", "-"], stdin_bytes="Clean text.\n")
        self.assertEqual(rn.returncode, 2)
        self.assertEqual(rp.returncode, 2)
        self.assertIn("--fail-on", rn.stderr)

        rn2 = run_node(["check", "--profle", "README.md"])
        rp2 = run_py(["check", "--profle", "README.md"])
        self.assertEqual(rn2.returncode, 2)
        self.assertEqual(rp2.returncode, 2)

    def test_subcommand_help_and_grouped_top_help(self) -> None:
        top_n = run_node(["--help"])
        top_p = run_py(["--help"])
        self.assertEqual(top_n.returncode, 0)
        self.assertEqual(top_p.returncode, 0)
        self.assertIn("Check & fix", top_n.stdout)
        self.assertIn("Exit codes:", top_n.stdout)
        self.assertEqual(top_n.stdout.strip(), top_p.stdout.strip())

        for sub in ("check", "packs", "explain", "voice", "catalog"):
            hn = run_node([sub, "--help"])
            hp = run_py([sub, "--help"])
            self.assertEqual(hn.returncode, 0, f"Node help failed for {sub}")
            self.assertEqual(hp.returncode, 0, f"Python help failed for {sub}")
            self.assertIn("usage:", hn.stdout.lower())
            self.assertIn("usage:", hp.stdout.lower())
            self.assertIn(sub, hn.stdout.lower())

        hn_alias = run_node(["help", "packs"])
        hp_alias = run_py(["help", "packs"])
        self.assertEqual(hn_alias.returncode, 0)
        self.assertEqual(hp_alias.returncode, 0)
        self.assertIn("packs", hn_alias.stdout.lower())

    def test_changed_disambiguation_with_file_arg(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)
            subprocess.run(["git", "init"], cwd=tdir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tdir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=tdir, check=True, capture_output=True)
            f = tdir / "draft.md"
            f.write_text("Initial clean draft.\n", encoding="utf-8")
            subprocess.run(["git", "add", "draft.md"], cwd=tdir, check=True, capture_output=True)
            subprocess.run(["git", "commit", "-m", "init"], cwd=tdir, check=True, capture_output=True)

            # Modify draft.md with an AI artifact; `check --changed draft.md` must NOT consume `draft.md` as ref!
            f.write_text("Certainly! Here is the updated draft.\n", encoding="utf-8")
            rn = run_node(["check", "--changed", "draft.md", "--json"], cwd=tdir)
            rp = run_py(["check", "--changed", "draft.md", "--json"], cwd=tdir)
            self.assertEqual(rn.returncode, 1, rn.stderr)
            self.assertEqual(rp.returncode, 1, rp.stderr)
            jn = json.loads(rn.stdout)
            jp = json.loads(rp.stdout)
            self.assertEqual(jn["checkedCount"], 1)
            self.assertEqual(jp["checkedCount"], 1)
            self.assertEqual(jn["findings"][0]["ruleId"], "chatbot-artifact")
            self.assertEqual(jn["findings"], jp["findings"])

    def test_malformed_and_missing_config_exit_2_without_stacktrace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.dislop.json"
            bad.write_text("{ invalid json", encoding="utf-8")
            arr = Path(tmp) / "arr.dislop.json"
            arr.write_text("[1, 2, 3]", encoding="utf-8")

            for cfg_arg in (str(bad), str(arr), str(Path(tmp) / "missing.json")):
                rn = run_node(["check", "--config", cfg_arg, "-"], stdin_bytes="Clean.\n")
                rp = run_py(["check", "--config", cfg_arg, "-"], stdin_bytes="Clean.\n")
                self.assertEqual(rn.returncode, 2)
                self.assertEqual(rp.returncode, 2)
                self.assertNotIn("SyntaxError:", rn.stderr)
                self.assertNotIn("    at ", rn.stderr)
                self.assertNotIn("Traceback", rp.stderr)

    def test_stdin_binary_rejection_and_html_autodetect(self) -> None:
        fake_zip = b"PK\x03\x04\x14\x00\x00\x00\x08\x00"
        rn_bin = run_node(["check", "-"], stdin_bytes=fake_zip)
        rp_bin = run_py(["check", "-"], stdin_bytes=fake_zip)
        self.assertEqual(rn_bin.returncode, 2)
        self.assertEqual(rp_bin.returncode, 2)
        self.assertIn("binary ZIP/OOXML", rn_bin.stderr.decode("utf-8"))
        self.assertIn("binary ZIP/OOXML", rp_bin.stderr.decode("utf-8"))

        html_doc = '<!DOCTYPE html><html><body><a href="#">Read</a></body></html>\n'
        rn_html = run_node(["check", "-", "--json"], stdin_bytes=html_doc)
        rp_html = run_py(["check", "-", "--json"], stdin_bytes=html_doc)
        self.assertEqual(rn_html.returncode, 1)
        self.assertEqual(rp_html.returncode, 1)
        jn = json.loads(rn_html.stdout)
        jp = json.loads(rp_html.stdout)
        self.assertEqual(jn["findings"][0]["modality"], "html")
        self.assertEqual(jn["findings"][0]["ruleId"], "ui-dead-control")
        self.assertEqual(jn["findings"], jp["findings"])

    def test_pure_zh_and_en_brand_voice_formatting_parity(self) -> None:
        zh_sample = "好的，以下是本周进展。值得注意的是，这次改造全面赋能运维团队。\n"
        rn = run_node(["check", "-", "--stdin-filename", "note.md", "--profile", "--lang", "zh"], stdin_bytes=zh_sample, env_extra={"NO_COLOR": "1"})
        rp = run_py(["check", "-", "--stdin-filename", "note.md", "--profile", "--lang", "zh"], stdin_bytes=zh_sample, env_extra={"NO_COLOR": "1"})
        self.assertEqual(rn.returncode, 1)
        self.assertEqual(rp.returncode, 1)
        self.assertEqual(rn.stdout, rp.stdout)
        for bad_en in ("finding(s)", "file(s)", "[WARNING]", "[ERROR]", "match:", "why:", "test:", "[PROFILE]", "signals=none"):
            self.assertNotIn(bad_en, rn.stdout, f"ZH output leaked English token: {bad_en}")
        for expected_zh in ("[硬伤]", "[提醒]", "原文:", "原因:", "改法:", "[统计]", "硬伤", "提醒"):
            self.assertIn(expected_zh, rn.stdout)

        en_sample = "Certainly! Here is the update.\n"
        rn_en = run_node(["check", "-", "--stdin-filename", "note.md", "--lang", "en"], stdin_bytes=en_sample, env_extra={"NO_COLOR": "1"})
        rp_en = run_py(["check", "-", "--stdin-filename", "note.md", "--lang", "en"], stdin_bytes=en_sample, env_extra={"NO_COLOR": "1"})
        self.assertEqual(rn_en.stdout, rp_en.stdout)
        self.assertIn("1 finding (1 error) across 1 file", rn_en.stdout)
        self.assertNotIn("finding(s)", rn_en.stdout)
        self.assertNotIn("file(s)", rn_en.stdout)

    def test_deep_quiet_rule_and_color_flags_parity(self) -> None:
        stealth = (
            "在实际推进跨团队协作的过程中，建立清晰的信息同步节奏往往能够减少不必要的沟通损耗。"
            "当各个环节的职责边界更加明确之后，研发与产品团队可以把更多精力投入到核心体验的打磨之中，让日常迭代保持平稳有序的推进状态。"
        )
        rn_deep = run_node(["check", "-", "--deep", "--json"], stdin_bytes=stealth)
        rp_deep = run_py(["check", "-", "--deep", "--json"], stdin_bytes=stealth)
        self.assertEqual(rn_deep.returncode, 0)
        self.assertEqual(rp_deep.returncode, 0)
        jn = json.loads(rn_deep.stdout)
        jp = json.loads(rp_deep.stdout)
        self.assertEqual(jn["findings"], jp["findings"])
        self.assertEqual(jn["profiles"], jp["profiles"])
        self.assertTrue(any(f["ruleId"] == "pocket-stealth-vapor" for f in jn["findings"]))

        # --quiet omits below --fail-on and prints nothing on pass
        rn_q = run_node(["check", "-", "--deep", "--quiet"], stdin_bytes=stealth)
        rp_q = run_py(["check", "-", "--deep", "--quiet"], stdin_bytes=stealth)
        self.assertEqual(rn_q.returncode, 0)
        self.assertEqual(rp_q.returncode, 0)
        self.assertEqual(rn_q.stdout.strip(), "")
        self.assertEqual(rp_q.stdout.strip(), "")

        # --rule filter
        mixed = "Certainly! Here is the note. It is worth noting that latency is 12ms.\n"
        rn_r = run_node(["check", "-", "--rule", "en-throat-clearing-opener", "--json"], stdin_bytes=mixed)
        rp_r = run_py(["check", "-", "--rule", "en-throat-clearing-opener", "--json"], stdin_bytes=mixed)
        self.assertEqual(rn_r.returncode, 0)
        self.assertEqual(rp_r.returncode, 0)
        self.assertEqual([f["ruleId"] for f in json.loads(rn_r.stdout)["findings"]], ["en-throat-clearing-opener"])
        self.assertEqual(json.loads(rn_r.stdout)["findings"], json.loads(rp_r.stdout)["findings"])

        # FORCE_COLOR applies to text only, never to json
        rn_col = run_node(["check", "-", "--lang", "zh"], stdin_bytes="Certainly! Here is a note.\n", env_extra={"FORCE_COLOR": "1"})
        rn_jcol = run_node(["check", "-", "--json"], stdin_bytes="Certainly! Here is a note.\n", env_extra={"FORCE_COLOR": "1"})
        self.assertIn("\x1b[31m", rn_col.stdout)
        self.assertNotIn("\x1b[", rn_jcol.stdout)

    def test_init_creates_gitignore_inside_git_repo(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)
            subprocess.run(["git", "init"], cwd=tdir, check=True, capture_output=True)
            rn = run_node(["init"], cwd=tdir)
            self.assertEqual(rn.returncode, 0, rn.stderr)
            self.assertTrue((tdir / ".dislop.json").is_file())
            self.assertTrue((tdir / ".gitignore").is_file())
            self.assertIn(".dislop.local.json", (tdir / ".gitignore").read_text(encoding="utf-8"))

    def test_codex_round1_regressions_parity(self) -> None:
        # 1. String flag must not swallow next flag (`--rule --bogus`), and unknown rule ID exits 2
        for args in (
            ["check", "-", "--rule", "--bogus"],
            ["check", "-", "--rule", "chatbot-artifcat"],
            ["check", "--help", "--bogus"],
            ["help", "badcmd"],
            ["check", "--dee", "-"],
        ):
            rn = run_node(args, stdin_bytes="Certainly! Here is the update.\n")
            rp = run_py(args, stdin_bytes="Certainly! Here is the update.\n")
            self.assertEqual(rn.returncode, rp.returncode, f"rc mismatch on {args}: node={rn.returncode} py={rp.returncode}")
            expected_rc = 0 if "--help" in args else 2
            self.assertEqual(rn.returncode, expected_rc, f"unexpected rc on {args}: {rn.stderr}")

        # 2. Leading Unicode whitespace (U+3000 / U+00A0) before chatbot wrapper matches identically in Node & Python
        for ws in ("\u3000", "\u00a0"):
            sample = f"{ws}Certainly! Here is the update.\n"
            rn = run_node(["check", "-", "--json"], stdin_bytes=sample)
            rp = run_py(["check", "-", "--json"], stdin_bytes=sample)
            self.assertEqual(rn.returncode, 1)
            self.assertEqual(rp.returncode, 1)
            self.assertEqual(json.loads(rn.stdout)["findings"], json.loads(rp.stdout)["findings"])

        # 3. BOM-prefixed HTML on stdin auto-detects html modality in both runtimes
        bom_html = '\ufeff<html><body><a href="#">Read</a></body></html>\n'
        rn_bh = run_node(["check", "-", "--json"], stdin_bytes=bom_html)
        rp_bh = run_py(["check", "-", "--json"], stdin_bytes=bom_html)
        self.assertEqual(rn_bh.returncode, 1)
        self.assertEqual(rp_bh.returncode, 1)
        self.assertEqual(json.loads(rn_bh.stdout)["findings"][0]["modality"], "html")
        self.assertEqual(json.loads(rn_bh.stdout)["findings"], json.loads(rp_bh.stdout)["findings"])

        # 4. Non-string failOn in config exits 2 cleanly without TypeError; Node MCP survives malformed config
        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)
            cfg = tdir / ".dislop.json"
            cfg.write_text('{"failOn": {}}', encoding="utf-8")
            rn_bad_fo = run_node(["check", "-"], cwd=tdir, stdin_bytes="Clean.\n")
            rp_bad_fo = run_py(["check", "-"], cwd=tdir, stdin_bytes="Clean.\n")
            self.assertEqual(rn_bad_fo.returncode, 2)
            self.assertEqual(rp_bad_fo.returncode, 2)
            self.assertNotIn("Traceback", rp_bad_fo.stderr)

            cfg.write_text("{ malformed", encoding="utf-8")
            mcp_reqs = "\n".join([
                json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}),
                json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "dislop_check", "arguments": {"text": "Clean."}}}),
                json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "dislop_packs", "arguments": {}}}),
            ]) + "\n"
            mn = run_node(["--mcp"], cwd=tdir, stdin_bytes=mcp_reqs)
            mp = run_py(["--mcp"], cwd=tdir, stdin_bytes=mcp_reqs)
            self.assertEqual(mn.returncode, 0)
            self.assertEqual(mp.returncode, 0)
            n_lines = [json.loads(l) for l in mn.stdout.strip().splitlines()]
            p_lines = [json.loads(l) for l in mp.stdout.strip().splitlines()]
            self.assertTrue(n_lines[1]["result"]["isError"])
            self.assertTrue(p_lines[1]["result"]["isError"])
            self.assertFalse(n_lines[2]["result"]["isError"])
            self.assertFalse(p_lines[2]["result"]["isError"])

        # 5. `--quiet=true` across json & text formats, plus localized ZH profile signals
        rn_qjson = run_node(["check", "-", "--quiet=true", "--json"], stdin_bytes="It is worth noting that latency is 5ms.\n")
        rp_qjson = run_py(["check", "-", "--quiet=true", "--json"], stdin_bytes="It is worth noting that latency is 5ms.\n")
        self.assertEqual(json.loads(rn_qjson.stdout)["findings"], [])
        self.assertEqual(json.loads(rp_qjson.stdout)["findings"], [])

        rn_prof_zh = run_node(["check", "-", "--profile", "--lang", "zh"], stdin_bytes="Line one.\nLine two.\nLine three.\n", env_extra={"NO_COLOR": "1"})
        rp_prof_zh = run_py(["check", "-", "--profile", "--lang", "zh"], stdin_bytes="Line one.\nLine two.\nLine three.\n", env_extra={"NO_COLOR": "1"})
        self.assertEqual(rn_prof_zh.stdout, rp_prof_zh.stdout)
        self.assertNotIn("zero-concrete-anchors", rn_prof_zh.stdout)
        self.assertIn("缺乏具体锚点", rn_prof_zh.stdout)

        # 6. Intermixed positional files around `--changed` + empty `--changed=`
        rn_inter = run_node(["check", "README.md", "--changed", "README.zh-CN.md", "--json"])
        rp_inter = run_py(["check", "README.md", "--changed", "README.zh-CN.md", "--json"])
        self.assertEqual(rn_inter.returncode, rp_inter.returncode)
        self.assertEqual(json.loads(rn_inter.stdout), json.loads(rp_inter.stdout))


if __name__ == "__main__":
    unittest.main()
