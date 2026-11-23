"""Round 3 tests: opt-in BYOK `dislop review` security invariants, mock server parity, OOXML extraction, and `dislop doctor`."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def run_node(
    args: list[str],
    cwd: Path = REPO_ROOT,
    stdin_text: str | None = None,
    env_extra: dict[str, str] | None = None,
) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    return subprocess.run(
        ["node", str(REPO_ROOT / "bin" / "dislop.mjs"), *args],
        cwd=str(cwd),
        input=stdin_text,
        capture_output=True,
        text=True,
        env=env,
    )


def run_py(
    args: list[str],
    cwd: Path = REPO_ROOT,
    stdin_text: str | None = None,
    env_extra: dict[str, str] | None = None,
) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT / "src")
    if env_extra:
        env.update(env_extra)
    return subprocess.run(
        [sys.executable, "-m", "dislop.cli", *args],
        cwd=str(cwd),
        input=stdin_text,
        capture_output=True,
        text=True,
        env=env,
    )


class _MockReviewServer:
    def __init__(self) -> None:
        self.requests: list[dict] = []
        self.mode = "ok"
        self.fail_on_call: int | None = None
        parent = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args) -> None:
                return

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length") or "0")
                raw = self.rfile.read(length).decode("utf-8", errors="replace")
                body = json.loads(raw)
                parent.requests.append({"path": self.path, "headers": dict(self.headers), "body": body})
                call_idx = len(parent.requests)

                if parent.mode == "redirect":
                    self.send_response(302)
                    self.send_header("Location", "http://127.0.0.1:9/evil")
                    self.end_headers()
                    return

                if parent.fail_on_call is not None and call_idx == parent.fail_on_call:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(b'{"error":"upstream failed"}')
                    return

                if parent.mode == "invalid_json":
                    payload = {"choices": [{"message": {"content": "not json at all"}}]}
                else:
                    user_msg = body["messages"][-1]["content"]
                    # Extract draft text between randomized delimiters
                    lines = user_msg.splitlines()
                    draft_body = "\n".join(lines[2:-1]) if len(lines) >= 4 else user_msg
                    quote = "game-changer for enterprise telemetry"
                    if quote not in draft_body:
                        quote = draft_body.strip().splitlines()[0][:40]
                    content_obj = {
                        "aiFlavorLevel": "high",
                        "summary": "Replace hype nouns with measured latency.",
                        "issues": [
                            {
                                "category": "cliche",
                                "severity": "error",  # Must clamp to warning
                                "quote": quote,
                                "why": "Stock promotional phrase lacks verifiable measurement.",
                                "fix": "State the actual latency delta without hype adjectives.",
                                **({"replacement": "tool for telemetry"} if parent.mode == "edits" else {}),
                            },
                            {
                                "category": "framing",
                                "severity": "info",
                                "quote": "nonexistent phantom sentence never in draft",
                                "why": "Hallucinated quote must be dropped.",
                                "fix": "Drop it.",
                            },
                            {
                                "category": "evidence",
                                "severity": "warning",
                                "quote": quote,
                                "why": "Should drop because fix invents 99.94% SLA.",
                                "fix": "Achieves 99.94% availability across shards.",
                            },
                        ],
                    }
                    payload = {"choices": [{"message": {"content": json.dumps(content_obj)}}]}

                encoded = json.dumps(payload).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

        self._srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self._srv.server_address[1]
        self.base_url = f"http://127.0.0.1:{self.port}/v1"
        self._thread = threading.Thread(target=self._srv.serve_forever, daemon=True)
        self._thread.start()

    def close(self) -> None:
        self._srv.shutdown()
        self._srv.server_close()


class ReviewAndDoctorTests(unittest.TestCase):
    def test_saved_review_apply_cross_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "notes.md"
            report_file = root / "report.json"
            original = "\ufeff😀\r\nCertainly! Here is one.\r\n\r\nCertainly! Here is two.\r\n"
            apply = ["apply", "--source-file", source.name, "--review-file", report_file.name]
            for reviewer, writer in ((run_node, run_py), (run_py, run_node)):
                with self.subTest(reviewer=reviewer.__name__):
                    source.write_bytes(original.encode())
                    source.chmod(0o640)
                    review = reviewer(["review", source.name, "--offline", "--json"], cwd=root)
                    self.assertEqual(review.returncode, 0, review.stderr)
                    report_file.write_text(review.stdout, encoding="utf-8")
                    edits = [item["edit"] for item in json.loads(review.stdout)["issues"] if "edit" in item]
                    self.assertEqual([edit["id"] for edit in edits], [1, 2])
                    for selection in (["--include", "2"], ["--all", "--exclude", "1"]):
                        source.write_bytes(original.encode())
                        result = writer([*apply, *selection], cwd=root)
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertEqual(source.read_bytes(), original.replace("Certainly! Here is two", " two").encode())
                        self.assertEqual(source.stat().st_mode & 0o777, 0o640)
                        retry = writer([*apply, *selection], cwd=root)
                        self.assertEqual(retry.returncode, 2)
                        self.assertIn("differs", retry.stderr)

    def test_apply_refuses_invalid_selection_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "notes.md"
            original = "Certainly! Here is the update.\n\nIt is worth noting that the update ships today.\n"
            source.write_bytes(original.encode())
            report = json.loads(run_node(["review", source.name, "--offline", "--json"], cwd=root).stdout)
            saved = root / "review.json"
            for fn in (run_py, run_node):
                args = ["apply", "--review-file", saved.name, "--source-file", source.name]
                saved.write_text(json.dumps(report), encoding="utf-8")
                for selection in ([], ["--include", "2"], ["--include", "99"], ["--exclude", "1"],
                                  ["--all", "--include", "1"], ["--include", "1,,2"]):
                    self.assertEqual(fn([*args, *selection], cwd=root).returncode, 2, selection)
                    self.assertEqual(source.read_bytes(), original.encode())
                for extra, error in ((dict(report["issues"][0]["edit"], id=2), "overlapping"),
                                     (dict(report["issues"][0]["edit"], id=2, start=12), "mismatch")):
                    bad = dict(report, issues=[report["issues"][0], {"edit": extra}])
                    saved.write_text(json.dumps(bad), encoding="utf-8")
                    result = fn([*args, "--all"], cwd=root)
                    self.assertEqual(result.returncode, 2)
                    self.assertIn(error, result.stderr)
                    self.assertEqual(source.read_bytes(), original.encode())
                del_digest = dict(report)
                del del_digest["sourceSha256"]
                saved.write_text(json.dumps(del_digest), encoding="utf-8")
                self.assertEqual(fn([*args, "--all"], cwd=root).returncode, 2)
                self.assertEqual(fn(["review", source.name, "--offline", "--interactive-apply"], cwd=root).returncode, 2)
                self.assertEqual(source.read_bytes(), original.encode())

    @unittest.skipUnless(shutil.which("vim"), "Vim is optional")
    def test_picker_revisit_confirm_and_cancel(self) -> None:
        # Use real Vim mappings in Ex mode so the test also works without a TTY.
        script = REPO_ROOT / "src" / "dislop" / "review-picker.vim"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            rows = [
                dict(id=1, why="Trim opener.", before="Note: ", after="", prefix="", suffix="Done."),
                dict(id=2, why="Provide a citation.", quote="Reported.", advice="Ask the author."),
                dict(id=3, why="Trim filler.", before="Clearly ", after="", prefix="", suffix="ready."),
            ]
            (root / "items.json").write_text(json.dumps(rows), encoding="utf-8")
            for keys, expected in ((r"yyykkn\<CR>", [3]), ("yq", None), (r"\<CR>", [])):
                result = subprocess.run(
                    ["vim", "-Nu", "NONE", "-i", "NONE", "-n", "-es", "-S", str(script),
                     "-c", f'execute "normal {keys}"'],
                    env={**os.environ, "DISLOP_PICKER_DIR": td}, capture_output=True, timeout=5)
                self.assertEqual(result.returncode, 0, result.stderr)
                output = root / "selected"
                if expected is None:
                    self.assertFalse(output.exists())
                else:
                    self.assertEqual(json.loads(output.read_text(encoding="utf-8")), expected)
                    output.unlink()

    @unittest.skipUnless(shutil.which("vim"), "Vim is optional")
    def test_picker_highlights_exact_spans_and_refreshes_on_navigation(self) -> None:
        script = REPO_ROOT / "src" / "dislop" / "review-picker.vim"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            rows = [
                dict(id=1, why="说明", before="旧\r\n词", after="新", prefix="😀旧 ", suffix=" 新"),
                dict(id=2, why="核实来源", quote="- 原文", advice="+ 建议"),
            ]
            (root / "items.json").write_text(json.dumps(rows), encoding="utf-8")
            snapshot = "call writefile([json_encode([getline(1,'$'), getmatches()])], $DISLOP_PICKER_DIR . '/screens', 'a')"
            subprocess.run(
                ["vim", "-Nu", "NONE", "-i", "NONE", "-n", "-es", "-S", str(script),
                 "-c", snapshot, "-c", "normal y", "-c", snapshot, "-c", "normal k", "-c", snapshot, "-c", "qall!"],
                env={**os.environ, "DISLOP_PICKER_DIR": td, "DISLOP_PICKER_LANG": "zh"}, check=True, timeout=5)
            screens = []
            for record in (root / "screens").read_text(encoding="utf-8").splitlines():
                lines, matches = json.loads(record)
                spans = {}
                for match in matches:
                    for key, pos in match.items():
                        if key.startswith("pos"):
                            text = lines[pos[0] - 1]
                            if len(pos) == 3:
                                start = pos[1] - 1
                                text = text.encode()[start:start + pos[2]].decode()
                            spans.setdefault(match["group"], []).append(text)
                screens.append(spans)
            edit, advice, accepted = screens
            self.assertEqual(edit["DislopRemoved"], ["-", "旧", "-", "词"])
            self.assertEqual(edit["DislopAdded"], ["+", "新"])
            self.assertEqual(advice["DislopLabel"], ["[建议]", "原因", "原文", "建议"])
            self.assertNotIn("DislopRemoved", advice)
            self.assertNotIn("DislopAdded", advice)
            self.assertIn("[已采纳]", accepted["DislopAdded"])

    def test_provider_replacements_and_advice(self) -> None:
        server = _MockReviewServer()
        try:
            with tempfile.TemporaryDirectory() as td:
                root = Path(td)
                source = root / "notes.md"
                quote = "game-changer for enterprise telemetry"
                for fn in (run_py, run_node):
                    for mode, original, applicable in (
                        ("edits", "😀\r\nA " + quote + ".", True),
                        ("edits", quote + " and " + quote + ".", False),
                        ("ok", quote + ".", False),
                    ):
                        server.mode = mode
                        source.write_bytes(original.encode())
                        res = fn(["review", source.name, "--provider", "local", "--base-url", server.base_url,
                                  "--json", "--fail-on", "never"], cwd=root)
                        self.assertEqual(res.returncode, 0, res.stderr)
                        report = json.loads(res.stdout)
                        self.assertEqual("edit" in report["findings"][0], applicable)
                        (root / "review.json").write_text(res.stdout, encoding="utf-8")
                        result = fn(["apply", "--all", "--review-file", "review.json",
                                     "--source-file", source.name], cwd=root)
                        self.assertEqual(result.returncode, 0, result.stderr)
                        expected = original.replace(quote, "tool for telemetry") if applicable else original
                        self.assertEqual(source.read_bytes(), expected.encode())
        finally:
            server.close()

    def test_security_and_consent_invariants(self) -> None:
        secret = "sk-test-secret-never-leak-98765"
        for fn in (run_node, run_py):
            # 1. Forbid --api-key / --token CLI flags
            r_key = fn(["review", "-", "--api-key", secret], stdin_text="Sample text.\n")
            self.assertEqual(r_key.returncode, 2)
            self.assertIn("forbidden", r_key.stderr.lower())

            r_tok = fn(["review", "-", f"--token={secret}"], stdin_text="Sample text.\n")
            self.assertEqual(r_tok.returncode, 2)

            # 2. Remote requires https://
            r_http = fn(
                ["review", "-", "--provider", "compatible", "--base-url", "http://api.example.com/v1", "--yes"],
                stdin_text="Sample text.\n",
                env_extra={"DISLOP_REVIEW_API_KEY": secret},
            )
            self.assertEqual(r_http.returncode, 2)
            self.assertIn("https://", r_http.stderr)

            # 3. Local rejects non-loopback host/IP before opening socket
            r_lan = fn(
                ["review", "-", "--provider", "local", "--base-url", "http://192.0.2.10:11434/v1"],
                stdin_text="Sample text.\n",
            )
            self.assertEqual(r_lan.returncode, 2)
            self.assertIn("loopback", r_lan.stderr.lower())

            # 4. Remote without --yes or DISLOP_ALLOW_REMOTE=1 refuses with destination notice
            r_no_consent = fn(
                ["review", "-", "--provider", "openai"],
                stdin_text="Sample text.\n",
                env_extra={"OPENAI_API_KEY": secret, "DISLOP_TEST_OFFLINE": "1"},
            )
            self.assertEqual(r_no_consent.returncode, 2)
            self.assertIn("--yes", r_no_consent.stderr)
            self.assertIn("api.openai.com", r_no_consent.stderr)

            # 5. Circuit breaker blocks remote even with --yes
            r_cb = fn(
                ["review", "-", "--provider", "openai", "--yes"],
                stdin_text="Sample text.\n",
                env_extra={"OPENAI_API_KEY": secret, "DISLOP_TEST_OFFLINE": "1"},
            )
            self.assertEqual(r_cb.returncode, 2)
            self.assertIn("circuit breaker", r_cb.stderr.lower())

            # 6. --dry-run succeeds cleanly without key leak or socket open
            r_dry = fn(
                ["review", "-", "--provider", "openai", "--dry-run", "--json"],
                stdin_text="Sample text.\n",
                env_extra={"OPENAI_API_KEY": secret},
            )
            self.assertEqual(r_dry.returncode, 0)
            self.assertNotIn(secret, r_dry.stdout)
            dry_j = json.loads(r_dry.stdout)
            self.assertTrue(dry_j["keyPresent"])
            self.assertEqual(dry_j["keySource"], "OPENAI_API_KEY")
            self.assertEqual(dry_j["headers"]["authorization"], "Bearer <REDACTED>")

    def test_loopback_mock_parity_validation_and_chunking(self) -> None:
        srv = _MockReviewServer()
        try:
            draft = "Our new caching engine is a game-changer for enterprise telemetry workloads."
            # Redirect must fail closed
            srv.mode = "redirect"
            for fn in (run_node, run_py):
                r_redir = fn(
                    ["review", "-", "--provider", "local", "--base-url", srv.base_url],
                    stdin_text=draft,
                    env_extra={"DISLOP_TEST_OFFLINE": "1"},
                )
                self.assertEqual(r_redir.returncode, 2)

            srv.mode = "ok"
            srv.requests.clear()
            rn = run_node(
                ["review", "-", "--provider", "local", "--base-url", srv.base_url, "--model", "mock-model", "--json"],
                stdin_text=draft,
                env_extra={"DISLOP_TEST_OFFLINE": "1"},
            )
            rp = run_py(
                ["review", "-", "--provider", "local", "--base-url", srv.base_url, "--model", "mock-model", "--json"],
                stdin_text=draft,
                env_extra={"DISLOP_TEST_OFFLINE": "1"},
            )
            self.assertEqual(rn.returncode, 1)
            self.assertEqual(rp.returncode, 1)
            self.assertIn(f"127.0.0.1:{srv.port}", rn.stderr)
            self.assertIn(f"127.0.0.1:{srv.port}", rp.stderr)

            jn = json.loads(rn.stdout)
            jp = json.loads(rp.stdout)
            self.assertEqual(jn, jp)
            self.assertEqual(jn["schema"], "dislop.review/1")
            self.assertEqual(len(jn["findings"]), 1)
            self.assertEqual(jn["findings"][0]["ruleId"], "review/cliche")
            self.assertEqual(jn["findings"][0]["severity"], "warning")  # Clamped from error
            self.assertEqual(jn["findings"][0]["confidence"], "medium")
            self.assertEqual(jn["rejected"], {"ungroundedQuote": 1, "inventedFact": 1, "malformed": 0})

            # Randomized delimiters differ per call
            self.assertEqual(len(srv.requests), 2)
            delims = []
            for req in srv.requests:
                self.assertEqual(req["body"]["temperature"], 0)
                first_delim_line = req["body"]["messages"][-1]["content"].splitlines()[1]
                self.assertTrue(first_delim_line.startswith("<<<DISLOP_DRAFT_"))
                delims.append(first_delim_line)
            self.assertNotEqual(delims[0], delims[1])

            # Agent format works on review
            rn_ag = run_node(
                ["review", "-", "--provider", "local", "--base-url", srv.base_url, "--format", "agent"],
                stdin_text=draft,
            )
            rp_ag = run_py(
                ["review", "-", "--provider", "local", "--base-url", srv.base_url, "--format", "agent"],
                stdin_text=draft,
            )
            self.assertEqual(rn_ag.stdout, rp_ag.stdout)
            self.assertIn("review/cliche", rn_ag.stdout)

            # Multi-chunk partial failure (chunk 1 ok, chunk 2 HTTP 500) must exit 2
            big_draft = (draft + "\n\n") * 220  # >12k chars -> 2 chunks
            srv.requests.clear()
            srv.fail_on_call = 2
            r_partial_n = run_node(["review", "-", "--provider", "local", "--base-url", srv.base_url], stdin_text=big_draft)
            srv.requests.clear()
            srv.fail_on_call = 2
            r_partial_p = run_py(["review", "-", "--provider", "local", "--base-url", srv.base_url], stdin_text=big_draft)
            self.assertEqual(r_partial_n.returncode, 2)
            self.assertEqual(r_partial_p.returncode, 2)
        finally:
            srv.close()

    def test_ooxml_review_extraction_and_notes_hidden_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pptx_path = root / "deck.pptx"
            with zipfile.ZipFile(pptx_path, "w") as zf:
                zf.writestr("[Content_Types].xml", "<Types/>")
                zf.writestr(
                    "ppt/presentation.xml",
                    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>',
                )
                zf.writestr(
                    "ppt/_rels/presentation.xml.rels",
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                    '<Relationship Id="rId1" Type="http://slide" Target="slides/slide1.xml"/>'
                    '<Relationship Id="rId2" Type="http://slide" Target="slides/slide2.xml"/>'
                    "</Relationships>",
                )
                zf.writestr(
                    "ppt/slides/slide1.xml",
                    '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Visible slide claim.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
                )
                zf.writestr(
                    "ppt/slides/_rels/slide1.xml.rels",
                    '<Relationships xmlns="urn:r"><Relationship Id="rIdN" Type="http://notes" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
                )
                zf.writestr(
                    "ppt/notesSlides/notesSlide1.xml",
                    '<p:notes xmlns:p="urn:p" xmlns:a="urn:a"><p:txBody><a:p><a:r><a:t>Private speaker note.</a:t></a:r></a:p></p:txBody></p:notes>',
                )
                zf.writestr(
                    "ppt/slides/slide2.xml",
                    '<p:sld show="0" xmlns:p="urn:p" xmlns:a="urn:a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Hidden slide text.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
                )

            for fn in (run_node, run_py):
                r_def = fn(["review", "deck.pptx", "--dry-run", "--json"], cwd=root)
                self.assertEqual(r_def.returncode, 0)
                prompt_def = json.loads(r_def.stdout)["requestBody"]["messages"][1]["content"]
                self.assertIn("Visible slide claim.", prompt_def)
                self.assertNotIn("Private speaker note.", prompt_def)
                self.assertNotIn("Hidden slide text.", prompt_def)

                r_inc = fn(["review", "deck.pptx", "--include-notes", "--include-hidden", "--dry-run", "--json"], cwd=root)
                self.assertEqual(r_inc.returncode, 0)
                prompt_inc = json.loads(r_inc.stdout)["requestBody"]["messages"][1]["content"]
                self.assertIn("Private speaker note.", prompt_inc)
                self.assertIn("Hidden slide text.", prompt_inc)

    def test_doctor_layers_no_secret_leak_and_offline_default(self) -> None:
        fake_secret = "sk-doctor-secret-value-never-print"
        env_extra = {
            "OPENAI_API_KEY": fake_secret,
            "DISLOP_TEST_OFFLINE": "1",
        }
        rn = run_node(["doctor", "--no-loopback", "--json"], env_extra=env_extra)
        rp = run_py(["doctor", "--no-loopback", "--json"], env_extra=env_extra)
        self.assertEqual(rn.returncode, 0)
        self.assertEqual(rp.returncode, 0)
        self.assertNotIn(fake_secret, rn.stdout)
        self.assertNotIn(fake_secret, rp.stdout)

        jn = json.loads(rn.stdout)
        jp = json.loads(rp.stdout)
        self.assertEqual(jn["schema"], "dislop.doctor/1")
        self.assertEqual(jp["schema"], "dislop.doctor/1")
        # Additive compatibility with model status keys
        for k in ("builtinDeterministic", "bundledModels", "recommendation", "localRunners", "layers"):
            self.assertIn(k, jn)
            self.assertIn(k, jp)
        self.assertEqual(jn["layers"]["skill"], jp["layers"]["skill"])
        self.assertTrue(jn["layers"]["skill"]["ready"])
        self.assertEqual(jn["layers"]["byokReview"], jp["layers"]["byokReview"])
        self.assertTrue(jn["layers"]["byokReview"]["providers"]["openai"]["keyPresent"])
        self.assertEqual(jn["layers"]["byokReview"]["providers"]["openai"]["keySource"], "OPENAI_API_KEY")
        self.assertFalse(jn["layers"]["officialCloudMcp"]["ping"]["checked"])

        # --online in test circuit breaker stays blocked cleanly
        r_on_n = json.loads(run_node(["doctor", "--no-loopback", "--online", "--json"], env_extra=env_extra).stdout)
        r_on_p = json.loads(run_py(["doctor", "--no-loopback", "--online", "--json"], env_extra=env_extra).stdout)
        self.assertFalse(r_on_n["layers"]["officialCloudMcp"]["ping"]["checked"])
        self.assertFalse(r_on_p["layers"]["officialCloudMcp"]["ping"]["checked"])
        self.assertIn("circuit breaker", r_on_n["layers"]["officialCloudMcp"]["ping"]["error"].lower())

        txt_on_n = run_node(["doctor", "--no-loopback", "--online"], env_extra=env_extra)
        txt_on_p = run_py(["doctor", "--no-loopback", "--online"], env_extra=env_extra)
        self.assertIn("blocked", txt_on_n.stdout.lower())
        self.assertIn("blocked", txt_on_p.stdout.lower())
        self.assertNotIn("pass --online", txt_on_n.stdout.lower())

    def test_key_isolation_proxy_bypass_and_secret_scrubbing(self) -> None:
        captured_headers: list[dict[str, str]] = []

        class _InspectHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: object) -> None:
                return

            def do_POST(self) -> None:
                length = int(self.headers.get("content-length") or 0)
                _ = self.rfile.read(length)
                hdrs = {k.lower(): v for k, v in self.headers.items()}
                captured_headers.append(hdrs)
                if self.path.endswith("/err/v1/chat/completions") or "/err" in self.path:
                    auth_echo = hdrs.get("authorization", "none")
                    self.send_response(401)
                    self.send_header("content-type", "text/plain")
                    self.end_headers()
                    self.wfile.write(f"unauthorized token={auth_echo}".encode("utf-8"))
                    return
                body = json.dumps(
                    {
                        "choices": [
                            {
                                "message": {
                                    "content": json.dumps(
                                        {
                                            "aiFlavorLevel": "low",
                                            "summary": "Plain summary.",
                                            "issues": [],
                                        }
                                    )
                                }
                            }
                        ]
                    }
                ).encode("utf-8")
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.end_headers()
                self.wfile.write(body)

        srv = ThreadingHTTPServer(("127.0.0.1", 0), _InspectHandler)
        th = threading.Thread(target=srv.serve_forever, daemon=True)
        th.start()
        port = srv.server_address[1]
        try:
            with tempfile.TemporaryDirectory() as td:
                p = Path(td)
                (p / "draft.md").write_text("We deployed two nodes in Madrid.\n", encoding="utf-8")

                # OPENAI_API_KEY must NEVER be sent to --provider local or --provider compatible
                env_iso = {
                    "OPENAI_API_KEY": "sk-openai-secret-9999",
                    "DISLOP_TEST_OFFLINE": "1",
                    "HTTP_PROXY": "http://127.0.0.1:9",
                    "HTTPS_PROXY": "http://127.0.0.1:9",
                }
                for runner in (run_node, run_py):
                    r = runner(
                        [
                            "review",
                            "draft.md",
                            "--provider",
                            "local",
                            "--base-url",
                            f"http://localhost:{port}/v1",
                            "--json",
                        ],
                        cwd=p,
                        env_extra=env_iso,
                    )
                    self.assertEqual(r.returncode, 0, msg=r.stderr)
                    self.assertNotIn("authorization", captured_headers[-1])

                    # Compatible rejects OPENAI_API_KEY fallback cleanly
                    rc_dry = runner(
                        [
                            "review",
                            "draft.md",
                            "--provider",
                            "compatible",
                            "--base-url",
                            "https://proxy.example.com/v1?api_key=leak-me",
                            "--dry-run",
                            "--json",
                        ],
                        cwd=p,
                        env_extra=env_iso,
                    )
                    self.assertEqual(rc_dry.returncode, 0, msg=rc_dry.stderr)
                    jd = json.loads(rc_dry.stdout)
                    self.assertFalse(jd["keyPresent"])
                    self.assertNotIn("leak-me", jd["endpointUrl"])
                    self.assertIn("v1/chat/completions", jd["endpointUrl"])

                    rc_run = runner(
                        [
                            "review",
                            "draft.md",
                            "--provider",
                            "compatible",
                            "--base-url",
                            "https://proxy.example.com/v1",
                            "--yes",
                        ],
                        cwd=p,
                        env_extra=env_iso,
                    )
                    self.assertEqual(rc_run.returncode, 2)
                    self.assertIn("DISLOP_REVIEW_API_KEY", rc_run.stderr)

                # DISLOP_LOCAL_API_KEY IS sent to local, and scrubbed from HTTP 401 errors
                env_local_err = {
                    "DISLOP_LOCAL_API_KEY": "sk-local-secret-7777",
                    "HTTP_PROXY": "http://127.0.0.1:9",
                }
                for runner in (run_node, run_py):
                    re_401 = runner(
                        [
                            "review",
                            "draft.md",
                            "--provider",
                            "local",
                            "--base-url",
                            f"http://127.0.0.1:{port}/err",
                        ],
                        cwd=p,
                        env_extra=env_local_err,
                    )
                    self.assertEqual(re_401.returncode, 2)
                    self.assertNotIn("sk-local-secret-7777", re_401.stderr)
                    self.assertIn("[REDACTED]", re_401.stderr)
        finally:
            srv.shutdown()
            srv.server_close()

    def test_redirect_refusal_two_servers_and_runner_discovery(self) -> None:
        target_hits = {"count": 0}

        class _TargetHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: object) -> None:
                return

            def do_GET(self) -> None:
                target_hits["count"] += 1
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"{}")

            def do_POST(self) -> None:
                target_hits["count"] += 1
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"{}")

        srv_b = ThreadingHTTPServer(("127.0.0.1", 0), _TargetHandler)
        threading.Thread(target=srv_b.serve_forever, daemon=True).start()
        port_b = srv_b.server_address[1]

        class _RedirectHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: object) -> None:
                return

            def _send_302(self) -> None:
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{port_b}/steal")
                self.end_headers()

            def do_GET(self) -> None:
                self._send_302()

            def do_POST(self) -> None:
                length = int(self.headers.get("content-length") or 0)
                _ = self.rfile.read(length)
                self._send_302()

        srv_a = ThreadingHTTPServer(("127.0.0.1", 0), _RedirectHandler)
        threading.Thread(target=srv_a.serve_forever, daemon=True).start()
        port_a = srv_a.server_address[1]
        try:
            with tempfile.TemporaryDirectory() as td:
                p = Path(td)
                (p / "draft.md").write_text("Some sample prose sentence for testing.", encoding="utf-8")
                for runner in (run_node, run_py):
                    res = runner(
                        [
                            "review",
                            "draft.md",
                            "--provider",
                            "local",
                            "--base-url",
                            f"http://127.0.0.1:{port_a}/v1",
                        ],
                        cwd=p,
                    )
                    self.assertEqual(res.returncode, 2)
                    self.assertIn("redirect", res.stderr.lower())

            # Python local_model._probe_loopback_json must also refuse 3xx redirects without hitting server B
            if str(REPO_ROOT / "src") not in sys.path:
                sys.path.insert(0, str(REPO_ROOT / "src"))
            from dislop.local_model import _probe_loopback_json

            self.assertIsNone(_probe_loopback_json(port_a, "/api/tags", timeout_sec=1.0))
            self.assertEqual(target_hits["count"], 0)
        finally:
            srv_a.shutdown()
            srv_a.server_close()
            srv_b.shutdown()
            srv_b.server_close()

    def test_forbid_policy_blocks_remote_upload_before_sending(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / ".dislop.local.json").write_text(
                json.dumps({"forbid": ["PROJECT-SECRET-ALPHA"]}),
                encoding="utf-8",
            )
            (p / "draft.md").write_text(
                "Line 1 clear.\nPROJECT-SECRET-ALPHA is confidential.\n",
                encoding="utf-8",
            )
            env_remote = {"OPENAI_API_KEY": "sk-dummy", "DISLOP_TEST_OFFLINE": "1"}
            for runner in (run_node, run_py):
                res = runner(
                    ["review", "draft.md", "--provider", "openai", "--yes"],
                    cwd=p,
                    env_extra=env_remote,
                )
                self.assertEqual(res.returncode, 2)
                self.assertIn("forbid", res.stderr.lower())
                self.assertNotIn("PROJECT-SECRET-ALPHA", res.stderr)

    def test_validation_hardening_and_cli_edge_cases(self) -> None:
        if str(REPO_ROOT / "src") not in sys.path:
            sys.path.insert(0, str(REPO_ROOT / "src"))
        from dislop.review_client import ReviewConfigError, validate_and_normalize_review_response

        chunk = '[Slide 2]\nWe run "seamless" builds in Europe.\nDuplicate sentence here.\nDuplicate sentence here.\n'
        # Non-array issues must raise ReviewConfigError (both Python & Node)
        with self.assertRaises(ReviewConfigError):
            validate_and_normalize_review_response(
                raw_content=json.dumps({"aiFlavorLevel": "low", "summary": "ok", "issues": "none"}),
                chunk_text=chunk,
                full_text=chunk,
            )

        # Guard invented date, code, slide number 2, short quote, why/summary facts; keep smart quotes + duplicate spans
        bad_and_good = {
            "aiFlavorLevel": "medium",
            "summary": "Planned release on 2026-05-01 looks rushed.",
            "issues": [
                {"category": "cliche", "severity": "warning", "quote": "a", "why": "Too short quote."},
                {
                    "category": "evidence",
                    "severity": "warning",
                    "quote": "We run \"seamless\" builds in Europe.",
                    "why": "Slide 2 claims too much.",
                    "fix": "Cite numbers.",
                },
                {
                    "category": "evidence",
                    "severity": "warning",
                    "quote": "We run \"seamless\" builds in Europe.",
                    "why": "Run `deploy_v2.sh` instead.",
                    "fix": "Rewrite.",
                },
                {
                    "category": "rhythm",
                    "severity": "warning",
                    "quote": "“seamless” builds",
                    "why": "Buzzword without evidence.",
                    "fix": "Use build time numbers.",
                },
                {
                    "category": "rhythm",
                    "severity": "warning",
                    "quote": "Duplicate sentence here.",
                    "why": "Repeated verbatim line.",
                    "fix": "Remove repetition.",
                },
                {
                    "category": "rhythm",
                    "severity": "warning",
                    "quote": "Duplicate sentence here.",
                    "why": "Second repeated line.",
                    "fix": "Remove second copy.",
                },
            ],
        }
        py_res = validate_and_normalize_review_response(
            raw_content=json.dumps(bad_and_good),
            chunk_text=chunk,
            full_text=chunk,
        )
        self.assertEqual(py_res["summary"], "")
        self.assertEqual(py_res["rejected"]["malformed"], 1)
        self.assertEqual(py_res["rejected"]["inventedFact"], 3)
        self.assertEqual(len(py_res["findings"]), 3)
        self.assertIsNotNone(py_res["findings"][0]["span"])
        self.assertNotEqual(py_res["findings"][1]["line"], py_res["findings"][2]["line"])

        # Same validation parity in Node via inline ESM check
        node_script = (
            'import { validateAndNormalizeReviewResponse } from "./src/review-client.mjs";'
            'const chunk = process.env.C;'
            'let threw = false;'
            'try { validateAndNormalizeReviewResponse({ rawContent: JSON.stringify({ aiFlavorLevel: "low", summary: "ok", issues: "none" }), chunkText: chunk, fullText: chunk }); } catch { threw = true; }'
            'const res = validateAndNormalizeReviewResponse({ rawContent: process.env.P, chunkText: chunk, fullText: chunk });'
            'console.log(JSON.stringify({ threw, res }));'
        )
        ns = subprocess.run(
            ["node", "--input-type=module", "-e", node_script],
            cwd=str(REPO_ROOT),
            env={**os.environ, "C": chunk, "P": json.dumps(bad_and_good)},
            capture_output=True,
            text=True,
            check=True,
        )
        js_out = json.loads(ns.stdout)
        self.assertTrue(js_out["threw"])
        self.assertEqual(js_out["res"]["summary"], "")
        self.assertEqual(js_out["res"]["rejected"], py_res["rejected"])
        self.assertEqual(len(js_out["res"]["findings"]), 3)
        self.assertIsNotNone(js_out["res"]["findings"][0]["span"])
        self.assertNotEqual(js_out["res"]["findings"][1]["line"], js_out["res"]["findings"][2]["line"])

        # CLI edge parity checks
        for runner in (run_node, run_py):
            bad_url = runner(["review", "-", "--provider", "local", "--base-url", "http://[bad", "--dry-run"], stdin_text="Hello world")
            self.assertEqual(bad_url.returncode, 2)
            bad_stdin = runner(["review", "-", "--stdin-filename", "deck.docx", "--dry-run"], stdin_text="Hello world")
            self.assertEqual(bad_stdin.returncode, 2)
            bad_doc = runner(["doctor", "extraarg"])
            self.assertEqual(bad_doc.returncode, 2)
            help_rev = runner(["help", "review"])
            self.assertEqual(help_rev.returncode, 0)

    def test_ooxml_hardening_docx_and_pptx(self) -> None:
        if str(REPO_ROOT / "src") not in sys.path:
            sys.path.insert(0, str(REPO_ROOT / "src"))
        from dislop.review_client import extract_ooxml_review_text

        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            doc_xml = (
                '<?xml version="1.0"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
                'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
                "<w:body>"
                "<w:p>"
                "<w:r><w:t>Lead</w:t><w:tab/><w:t>item</w:t><w:br/><w:t>Next line</w:t></w:r>"
                "<w:r><w:rPr><w:vanish/></w:rPr><w:t>SECRET_VANISH</w:t></w:r>"
                "<w:del><w:r><w:delText>DELETED</w:delText></w:r></w:del>"
                "<w:moveFrom><w:r><w:t>MOVED_FROM</w:t></w:r></w:moveFrom>"
                "<mc:Fallback><w:r><w:t>FALLBACK</w:t></w:r></mc:Fallback>"
                "<w:drawing><w:txbxContent><w:p><w:r><w:t>Inside textbox.</w:t></w:r></w:p></w:txbxContent></w:drawing>"
                "<w:r><w:t> After box outer tail.</w:t></w:r>"
                "</w:p>"
                "</w:body></w:document>"
            )
            entries_doc = {"word/document.xml": doc_xml}
            py_doc_clean = extract_ooxml_review_text(entries_doc, "docx")
            self.assertIn("Lead\titem\nNext line", py_doc_clean)
            self.assertIn("After box outer tail.", py_doc_clean)
            self.assertIn("Inside textbox.", py_doc_clean)
            self.assertNotIn("SECRET_VANISH", py_doc_clean)
            self.assertNotIn("MOVED_FROM", py_doc_clean)
            self.assertNotIn("FALLBACK", py_doc_clean)
            py_doc_inc = extract_ooxml_review_text(entries_doc, "docx", include_hidden=True)
            self.assertIn("SECRET_VANISH", py_doc_inc)

            long_attrs = " " + " ".join(f'xmlns:ns{i}="http://example.com/{i}"' for i in range(15))
            hidden_slide = f'<?xml version="1.0"?><p:sld{long_attrs} show=\'0\'><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Hidden late attr</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
            vis_slide = '<?xml version="1.0"?><p:sld show="1"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Visible slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
            note_xml = '<?xml version="1.0"?><p:notes><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Speaker detail.</a:t></a:r><a:fld type="slidenum"><a:t>99</a:t></a:fld></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>'
            entries_pptx = {
                "ppt/presentation.xml": '<p:presentation><p:sldIdLst><p:sldId r:id="rId1"/><p:sldId r:id="rId2"/></p:sldIdLst></p:presentation>',
                "ppt/_rels/presentation.xml.rels": '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
                "ppt/slides/slide1.xml": vis_slide,
                "ppt/slides/slide2.xml": hidden_slide,
                "ppt/slides/_rels/slide1.xml.rels": '<Relationships><Relationship Id="rIdN1" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
                "ppt/notesSlides/notesSlide1.xml": note_xml,
            }
            py_pptx = extract_ooxml_review_text(entries_pptx, "pptx", include_notes=True)
            self.assertIn("Visible slide", py_pptx)
            self.assertIn("Speaker detail.", py_pptx)
            self.assertNotIn("99", py_pptx)
            self.assertNotIn("Hidden late attr", py_pptx)

            # Verify identical OOXML extraction in Node
            js_ooxml_cmd = (
                'import { extractOoxmlReviewText } from "./src/review-client.mjs";'
                'console.log(JSON.stringify({'
                'doc: extractOoxmlReviewText(JSON.parse(process.env.D), "docx"),'
                'docInc: extractOoxmlReviewText(JSON.parse(process.env.D), "docx", { includeHidden: true }),'
                'pptx: extractOoxmlReviewText(JSON.parse(process.env.P), "pptx", { includeNotes: true })'
                '}));'
            )
            no_res = subprocess.run(
                ["node", "--input-type=module", "-e", js_ooxml_cmd],
                cwd=str(REPO_ROOT),
                env={**os.environ, "D": json.dumps(entries_doc), "P": json.dumps(entries_pptx)},
                capture_output=True,
                text=True,
                check=True,
            )
            jo = json.loads(no_res.stdout)
            self.assertEqual(jo["doc"], py_doc_clean)
            self.assertEqual(jo["docInc"], py_doc_inc)
            self.assertEqual(jo["pptx"], py_pptx)

    def test_codex_round3_b_regressions(self) -> None:
        if str(REPO_ROOT / "src") not in sys.path:
            sys.path.insert(0, str(REPO_ROOT / "src"))
        from dislop.review_client import (
            ReviewConfigError,
            _PinnedHTTPSConnection,
            extract_ooxml_review_text,
            resolve_provider_config,
            run_review_request,
            validate_and_normalize_review_response,
        )

        # 1. Suppressible comment or filename must NOT bypass remote forbid gate
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / ".dislop.local.json").write_text(json.dumps({"forbid": ["PROJECT-SECRET-ALPHA"]}), encoding="utf-8")
            (p / "suppressed.md").write_text(
                "<!-- dislop-ignore * -->\nPROJECT-SECRET-ALPHA leak attempt.\n", encoding="utf-8"
            )
            (p / "PROJECT-SECRET-ALPHA-notes.md").write_text("Clean prose inside filename match.\n", encoding="utf-8")
            env_remote = {"OPENAI_API_KEY": "sk-dummy", "DISLOP_TEST_OFFLINE": "1"}
            for target_file in ("suppressed.md", "PROJECT-SECRET-ALPHA-notes.md"):
                for runner in (run_node, run_py):
                    res = runner(["review", target_file, "--provider", "openai", "--yes"], cwd=p, env_extra=env_remote)
                    self.assertEqual(res.returncode, 2)
                    self.assertIn("forbid", res.stderr.lower())
                    self.assertNotIn("PROJECT-SECRET-ALPHA", res.stderr)

            # Zero-width lookahead forbid policy pattern must also block
            (p / ".dislop.local.json").write_text(json.dumps({"forbid": ["(?=SECRET_LOOKAHEAD)"]}), encoding="utf-8")
            (p / "lookahead.md").write_text("Contains SECRET_LOOKAHEAD inline.\n", encoding="utf-8")
            for runner in (run_node, run_py):
                rz = runner(["review", "lookahead.md", "--provider", "openai", "--yes"], cwd=p, env_extra=env_remote)
                self.assertEqual(rz.returncode, 2)
                self.assertIn("forbid", rz.stderr.lower())

        # 2. Exported local client rejects mismatched caller hostname & non-loopback IP URL
        with self.assertRaises(ReviewConfigError):
            run_review_request(
                endpoint_url="http://198.51.100.1/v1/chat/completions",
                is_local=True,
                hostname="127.0.0.1",
                model="m",
                api_key=None,
                system_prompt="s",
                user_prompt="u",
            )
        node_host_check = subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                (
                    'import { runReviewRequest } from "./src/review-client.mjs";'
                    'let failed = false;'
                    'try { await runReviewRequest({ endpointUrl: "http://198.51.100.1/v1/chat/completions", isLocal: true, hostname: "127.0.0.1", model: "m", apiKey: null, systemPrompt: "s", userPrompt: "u" }); } catch { failed = true; }'
                    'if (!failed) process.exit(1);'
                ),
            ],
            cwd=str(REPO_ROOT),
            check=True,
        )
        self.assertEqual(node_host_check.returncode, 0)

        # 3. Malformed URL error redacts custom query params + fragments; model quote redacts secret
        with self.assertRaises(ReviewConfigError) as ctx_url:
            resolve_provider_config(
                provider="local",
                base_url="http://[bad?custom_secret=topsecretval#fragsecret",
                allow_missing_key=True,
            )
        self.assertNotIn("topsecretval", str(ctx_url.exception))
        self.assertNotIn("fragsecret", str(ctx_url.exception))

        secret_txt = "Draft with secret sk-quote-leak-9999 embedded."
        q_py = validate_and_normalize_review_response(
            raw_content=json.dumps(
                {
                    "aiFlavorLevel": "medium",
                    "summary": "Clean.",
                    "issues": [
                        {
                            "category": "rhythm",
                            "severity": "warning",
                            "quote": "secret sk-quote-leak-9999 embedded.",
                            "why": "Weak.",
                            "fix": "Edit.",
                        }
                    ],
                }
            ),
            chunk_text=secret_txt,
            full_text=secret_txt,
            redact_secrets=["sk-quote-leak-9999"],
        )
        self.assertEqual(len(q_py["findings"]), 1)
        self.assertNotIn("sk-quote-leak-9999", q_py["findings"][0]["match"])
        self.assertNotIn("sk-quote-leak-9999", json.dumps(q_py["findings"][0]))

        # 4. Vanished outer run wrapping <w:txbxContent> (even after prior self-closing <w:rPr/>) hides nested textbox text
        vanished_box_doc = (
            '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
            "<w:p><w:r><w:rPr/><w:t>Visible lead.</w:t></w:r></w:p>"
            "<w:p>"
            "<w:r><w:rPr><w:vanish/></w:rPr><w:drawing><w:txbxContent><w:p><w:r><w:t>HIDDEN_BOX</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r>"
            "</w:p></w:body></w:document>"
        )
        py_vbox = extract_ooxml_review_text({"word/document.xml": vanished_box_doc}, "docx")
        self.assertIn("Visible lead.", py_vbox)
        self.assertNotIn("HIDDEN_BOX", py_vbox)
        py_vbox_inc = extract_ooxml_review_text({"word/document.xml": vanished_box_doc}, "docx", include_hidden=True)
        self.assertIn("HIDDEN_BOX", py_vbox_inc)

        # 5. CSS review blocks invented facts, and CRLF chunk 2 duplicate quote places on line 3 (not 1)
        css_res = validate_and_normalize_review_response(
            raw_content=json.dumps(
                {
                    "aiFlavorLevel": "medium",
                    "summary": "Ok.",
                    "issues": [
                        {
                            "category": "evidence",
                            "severity": "warning",
                            "quote": ".hero { color: red; }",
                            "why": "Too slow.",
                            "fix": "Target 42 ms by 2026-05-01.",
                        }
                    ],
                }
            ),
            chunk_text=".hero { color: red; }\n",
            full_text=".hero { color: red; }\n",
            modality="css",
        )
        self.assertEqual(css_res["rejected"]["inventedFact"], 1)
        self.assertEqual(len(css_res["findings"]), 0)

        crlf_full = "Repeated sentence.\r\nFiller line.\r\nRepeated sentence.\r\nTrailing target sentence.\r\n"
        chunk2_start = crlf_full.index("Repeated sentence.", 5)
        crlf_res = validate_and_normalize_review_response(
            raw_content=json.dumps(
                {
                    "aiFlavorLevel": "low",
                    "summary": "Ok.",
                    "issues": [
                        {
                            "category": "rhythm",
                            "severity": "info",
                            "quote": "Trailing target sentence.",
                            "why": "Weak end.",
                            "fix": "Trim end.",
                        },
                        {
                            "category": "rhythm",
                            "severity": "info",
                            "quote": "Repeated sentence.",
                            "why": "Repeated.",
                            "fix": "Trim.",
                        },
                    ],
                }
            ),
            chunk_text=crlf_full[chunk2_start:],
            full_text=crlf_full,
            chunk_start_offset=chunk2_start,
        )
        self.assertEqual(crlf_res["findings"][0]["line"], 4)
        self.assertEqual(crlf_res["findings"][1]["line"], 3)

        # Node parity check for #3, #4, #5
        node_parity_cmd = (
            'import { extractOoxmlReviewText, resolveProviderConfig, validateAndNormalizeReviewResponse } from "./src/review-client.mjs";'
            'let urlClean = false;'
            'try { resolveProviderConfig({ provider: "local", baseUrl: "http://[bad?custom_secret=topsecretval#fragsecret", allowMissingKey: true }); } catch (e) { urlClean = !e.message.includes("topsecretval") && !e.message.includes("fragsecret"); }'
            'const vboxClean = !extractOoxmlReviewText({ "word/document.xml": process.env.VD }, "docx").includes("HIDDEN_BOX");'
            'const cssRes = validateAndNormalizeReviewResponse({ rawContent: JSON.stringify({ aiFlavorLevel: "medium", summary: "Ok.", issues: [{ category: "evidence", severity: "warning", quote: ".hero { color: red; }", why: "Slow.", fix: "Target 42 ms by 2026-05-01." }] }), chunkText: ".hero { color: red; }\\n", fullText: ".hero { color: red; }\\n", modality: "css" });'
            'const crlfFull = "Repeated sentence.\\r\\nFiller line.\\r\\nRepeated sentence.\\r\\nTrailing target sentence.\\r\\n";'
            'const c2 = crlfFull.indexOf("Repeated sentence.", 5);'
            'const crlfRes = validateAndNormalizeReviewResponse({ rawContent: JSON.stringify({ aiFlavorLevel: "low", summary: "Ok.", issues: [{ category: "rhythm", severity: "info", quote: "Trailing target sentence.", why: "Weak end.", fix: "Trim end." }, { category: "rhythm", severity: "info", quote: "Repeated sentence.", why: "Repeated.", fix: "Trim." }] }), chunkText: crlfFull.slice(c2), fullText: crlfFull, chunkStartOffset: c2 });'
            'console.log(JSON.stringify({ urlClean, vboxClean, cssInv: cssRes.rejected.inventedFact, crlfLine0: crlfRes.findings[0].line, crlfLine1: crlfRes.findings[1].line }));'
        )
        np_out = json.loads(
            subprocess.run(
                ["node", "--input-type=module", "-e", node_parity_cmd],
                cwd=str(REPO_ROOT),
                env={**os.environ, "VD": vanished_box_doc},
                capture_output=True,
                text=True,
                check=True,
            ).stdout
        )
        self.assertTrue(np_out["urlClean"])
        self.assertTrue(np_out["vboxClean"])
        self.assertEqual(np_out["cssInv"], 1)
        self.assertEqual(np_out["crlfLine0"], 4)
        self.assertEqual(np_out["crlfLine1"], 3)

        # 6. Python _PinnedHTTPSConnection preserves TLS hostname while pinning loopback IP
        conn = _PinnedHTTPSConnection("127.0.0.1", "localhost", 8443, timeout=1.0)
        self.assertEqual(conn.host, "localhost")
        self.assertEqual(conn._pinned_ip, "127.0.0.1")

    def test_round5_codex_security_and_parity_regressions(self) -> None:
        if str(REPO_ROOT / "src") not in sys.path:
            sys.path.insert(0, str(REPO_ROOT / "src"))
        from dislop.review_client import (
            extract_ooxml_review_text,
            validate_and_normalize_review_response,
        )

        # 1. HTTP error body key straddling byte 240, non-JSON API response, non-JSON model content, and bad usage
        secret_tok = "CUSTOM_KEY_STRADDLE_9988776655"
        mode = {"kind": "http240"}

        class _LeakTrapHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: object) -> None:
                return

            def do_POST(self) -> None:
                _ = self.rfile.read(int(self.headers.get("content-length") or 0))
                if mode["kind"] == "http240":
                    pad = "x" * 230
                    body = f"{pad}{secret_tok} tail".encode("utf-8")
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(body)
                elif mode["kind"] == "badapijson":
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(f"not-json {secret_tok}".encode("utf-8"))
                elif mode["kind"] == "badmodeljson":
                    b = json.dumps({"choices": [{"message": {"content": f"{{{secret_tok}"}}]}).encode("utf-8")
                    self.send_response(200)
                    self.send_header("content-type", "application/json")
                    self.end_headers()
                    self.wfile.write(b)
                else:
                    b = json.dumps(
                        {
                            "usage": {
                                "prompt_tokens": "9" * 4300,
                                "completion_tokens": 1.5,
                                "total_tokens": 5,
                            },
                            "choices": [
                                {
                                    "message": {
                                        "content": json.dumps(
                                            {"aiFlavorLevel": "low", "summary": "Plain.", "issues": []}
                                        )
                                    }
                                }
                            ],
                        }
                    ).encode("utf-8")
                    self.send_response(200)
                    self.send_header("content-type", "application/json")
                    self.end_headers()
                    self.wfile.write(b)

        srv = ThreadingHTTPServer(("127.0.0.1", 0), _LeakTrapHandler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        port = srv.server_address[1]
        try:
            with tempfile.TemporaryDirectory() as td:
                p = Path(td)
                (p / "draft.md").write_text("Short sample text for testing.", encoding="utf-8")
                env_k = {"DISLOP_LOCAL_API_KEY": secret_tok}
                for kind in ("http240", "badapijson", "badmodeljson"):
                    mode["kind"] = kind
                    for runner in (run_node, run_py):
                        r = runner(
                            ["review", "draft.md", "--provider", "local", "--base-url", f"http://127.0.0.1:{port}/v1"],
                            cwd=p,
                            env_extra=env_k,
                        )
                        self.assertEqual(r.returncode, 2)
                        self.assertNotIn("CUSTOM_KEY", r.stderr)
                        self.assertNotIn("9988776655", r.stderr)

                mode["kind"] = "badusage"
                for runner in (run_node, run_py):
                    ru = runner(
                        ["review", "draft.md", "--provider", "local", "--base-url", f"http://127.0.0.1:{port}/v1", "--json"],
                        cwd=p,
                        env_extra=env_k,
                    )
                    self.assertEqual(ru.returncode, 0, msg=ru.stderr)
                    self.assertNotIn("CUSTOM_KEY", ru.stdout + ru.stderr)
                    self.assertEqual(json.loads(ru.stdout)["usage"], {"promptTokens": 0, "completionTokens": 0, "totalTokens": 5})
        finally:
            srv.shutdown()
            srv.server_close()

        # 2. Word XML namespace alias <α:vanish/> (Unicode NCName) hides nested textbox content
        ns_doc = (
            '<?xml version="1.0"?>'
            '<α:document xmlns:α="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><α:body>'
            "<α:p><α:r><α:t>Visible aliased.</α:t></α:r>"
            "<α:r><α:rPr><α:vanish/></α:rPr><w:drawing xmlns:w=\"http://schemas.openxmlformats.org/drawingml/2006/main\">"
            "<α:txbxContent><α:p><α:r><α:t>ALIASED_HIDDEN_BOX</α:t></α:r></α:p></α:txbxContent>"
            "</w:drawing></α:r></α:p>"
            "</α:body></α:document>"
        )
        self.assertEqual(extract_ooxml_review_text({"word/document.xml": ns_doc}, "docx"), "Visible aliased.")
        self.assertIn("ALIASED_HIDDEN_BOX", extract_ooxml_review_text({"word/document.xml": ns_doc}, "docx", include_hidden=True))

        # 3. Chunk boundary clamping & never splitting a CRLF pair across chunks
        from dislop.review_client import chunk_text_by_paragraphs

        crlf_split_txt = "1234567\r\nNext."
        py_crlf_chunks = chunk_text_by_paragraphs(crlf_split_txt, max_chars=8)
        self.assertFalse(py_crlf_chunks[0]["text"].endswith("\r"))
        self.assertEqual("".join(c["text"] for c in py_crlf_chunks), crlf_split_txt)

        full_2c = "Dup line.\nChunk one tail.\nChunk two head.\nDup line.\n"
        chunk_1 = "Dup line.\nChunk one tail.\n"
        c1_payload = json.dumps(
            {
                "aiFlavorLevel": "medium",
                "summary": "Ok.",
                "issues": [
                    {"category": "rhythm", "severity": "info", "quote": "Dup line.", "why": "First hit.", "fix": "Edit 1."},
                    {"category": "rhythm", "severity": "info", "quote": "Dup line.", "why": "Second hit.", "fix": "Edit 2."},
                ],
            }
        )
        py_c1 = validate_and_normalize_review_response(
            raw_content=c1_payload, chunk_text=chunk_1, full_text=full_2c, chunk_start_offset=0
        )
        self.assertTrue(all(f["line"] <= 2 for f in py_c1["findings"]))

        node_chk = subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                (
                    'import { chunkTextByParagraphs, extractOoxmlReviewText, validateAndNormalizeReviewResponse } from "./src/review-client.mjs";'
                    'const nsTxt = extractOoxmlReviewText({ "word/document.xml": process.env.NS }, "docx");'
                    'const res = validateAndNormalizeReviewResponse({ rawContent: process.env.C1P, chunkText: process.env.C1, fullText: process.env.F2, chunkStartOffset: 0 });'
                    'const cs = chunkTextByParagraphs("1234567\\r\\nNext.", 8);'
                    'console.log(JSON.stringify({ nsTxt, lines: res.findings.map(f => f.line), splitCr: cs[0].text.endsWith("\\r"), joined: cs.map(c => c.text).join("") }));'
                ),
            ],
            cwd=str(REPO_ROOT),
            env={**os.environ, "NS": ns_doc, "C1P": c1_payload, "C1": chunk_1, "F2": full_2c},
            capture_output=True,
            text=True,
            check=True,
        )
        np = json.loads(node_chk.stdout)
        self.assertEqual(np["nsTxt"], "Visible aliased.")
        self.assertTrue(all(ln <= 2 for ln in np["lines"]))
        self.assertFalse(np["splitCr"])
        self.assertEqual(np["joined"], crlf_split_txt)

        # 4. Zero-width forbid regex before supplementary Unicode emoji matches Node <-> Python cleanly (not 20 hits on line 1)
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / ".dislop.local.json").write_text(json.dumps({"forbid": ["^(?=.*SECRET)"]}), encoding="utf-8")
            (p / "emo.md").write_text("🚀 line one SECRET\nline two SECRET\n", encoding="utf-8")
            env_r = {"OPENAI_API_KEY": "sk-dummy", "DISLOP_TEST_OFFLINE": "1"}
            rn = run_node(["review", "emo.md", "--provider", "openai", "--yes"], cwd=p, env_extra=env_r)
            rp = run_py(["review", "emo.md", "--provider", "openai", "--yes"], cwd=p, env_extra=env_r)
            self.assertEqual(rn.returncode, 2)
            self.assertEqual(rp.returncode, 2)
            self.assertIn("matched 2 ", rn.stderr)
            self.assertIn("matched 2 ", rp.stderr)

        # 5. Local --dry-run does zero DNS lookup for hostname, but still rejects IP-literal non-loopback
        for runner in (run_node, run_py):
            ok_dr = runner(
                ["review", "-", "--provider", "local", "--base-url", "http://nonexistent-host.invalid:11434/v1", "--dry-run"],
                stdin_text="Draft body for dry run.",
            )
            self.assertEqual(ok_dr.returncode, 0, msg=ok_dr.stderr)
            bad_ip = runner(
                ["review", "-", "--provider", "local", "--base-url", "http://198.51.100.1:11434/v1", "--dry-run"],
                stdin_text="Draft body for dry run.",
            )
            self.assertEqual(bad_ip.returncode, 2)


if __name__ == "__main__":
    unittest.main()
