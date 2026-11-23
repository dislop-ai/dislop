"""Unit tests for the Python dislop engine."""

from __future__ import annotations

import json
import struct
import subprocess
import unittest
from pathlib import Path

from dislop.engine import (
    audit_image_document,
    audit_text,
    load_all_packs,
    parse_image_bytes,
    resolve_effective_pack,
)

ROOT = Path(__file__).resolve().parents[1]


def _make_test_gif(
    width: int,
    height: int,
    palette: list[tuple[int, int, int]],
    pixel_fn,
    comment: str | None = None,
) -> bytes:
    """Build a minimal valid GIF89a using literal-only LZW codes (pure Python stdlib)."""
    pal = list(palette) + [(0, 0, 0)] * max(0, 4 - len(palette))
    pal_bytes = b"".join(bytes(c) for c in pal[:4])
    out = bytearray(b"GIF89a")
    out += struct.pack("<HHBBB", width, height, 0x81, 0, 0)  # GCT 4 colors (2^(1+1))
    out += pal_bytes

    if comment:
        cbytes = comment.encode("utf-8")
        out += b"\x21\xfe"
        for i in range(0, len(cbytes), 255):
            chunk = cbytes[i : i + 255]
            out.append(len(chunk))
            out += chunk
        out.append(0)

    out += b"\x2c" + struct.pack("<HHHHB", 0, 0, width, height, 0)
    min_code_size = 2
    out.append(min_code_size)

    # Emit 3-bit codes (clear=4, eoi=5, literals=0..3), resetting with clear every 2 pixels
    # Wait: after 2 literals next_code=7; clear keeps code_size=3 forever!
    codes = [4]
    cnt = 0
    for y in range(height):
        for x in range(width):
            codes.append(pixel_fn(x, y) & 0x03)
            cnt += 1
            if cnt == 2:
                codes.append(4)
                cnt = 0
    codes.append(5)

    bit_buf = 0
    bit_count = 0
    lzw = bytearray()
    for code in codes:
        bit_buf |= code << bit_count
        bit_count += 3
        while bit_count >= 8:
            lzw.append(bit_buf & 0xFF)
            bit_buf >>= 8
            bit_count -= 8
    if bit_count > 0:
        lzw.append(bit_buf & 0xFF)

    for i in range(0, len(lzw), 255):
        chunk = lzw[i : i + 255]
        out.append(len(chunk))
        out += chunk
    out.append(0)
    out.append(0x3B)
    return bytes(out)


class DislopEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.packs = load_all_packs()

    def test_core_artifacts_apply_across_all_packs(self) -> None:
        brief = resolve_effective_pack("business-brief", self.packs)
        ui = resolve_effective_pack("deck-and-ui", self.packs)

        r1 = audit_text("Contact [insert owner] today.", filename="a.md", pack=brief)
        self.assertTrue(any(f["ruleId"] == "unfilled-placeholder" for f in r1["findings"]))

        r2 = audit_text('<a href="#">Download report</a>', filename="b.html", pack=ui)
        self.assertTrue(any(f["ruleId"] == "ui-dead-control" for f in r2["findings"]))

    def test_second_order_slop_caught_and_false_positives_spared(self) -> None:
        brief = resolve_effective_pack("business-brief", self.packs)
        hit = audit_text(
            "Signals drop. Photos vanish. Trust dies.\n这不是工具，而是底气。\n系统实现了精准高效、安全可靠、灵活易用的目标。",
            filename="slop.md",
            pack=brief,
        )
        rule_ids = {f["ruleId"] for f in hit["findings"]}
        self.assertIn("staccato-slogan-run", rule_ids)
        self.assertIn("negation-pivot-frame", rule_ids)
        self.assertIn("zh-four-char-triad", rule_ids)

        clean = audit_text(
            "The museum lent a 16th-century wool tapestry.\n"
            "Run the Delve debugger to inspect stacks.\n"
            "默认超时不是 30 秒，而是 300 秒；测试员抓手机拍照。\n"
            "试点覆盖北京大学、清华大学、复旦大学。\n"
            "他推开木门——屋里炉火未灭。🚀",
            filename="clean.md",
            pack=brief,
        )
        self.assertEqual(clean["findings"], [])

    def test_masking_and_inline_suppression(self) -> None:
        brief = resolve_effective_pack("business-brief", self.packs)
        doc = (
            "<!-- It is worth noting that comments are invisible -->\n"
            "```md\n"
            "It is worth noting that fenced code is exempt.\n"
            "```\n"
            "<!-- dislop-ignore-next-line en-throat-clearing-opener -- deliberate quote -->\n"
            "It is worth noting that backups run every 6 hours.\n"
            "<!-- dislop-ignore-next-line zh-bureaucratic-padding -- unused directive -->\n"
            "Plain clean sentence.\n"
        )
        res = audit_text(doc, filename="masked.md", pack=brief)
        self.assertEqual(res["findings"], [])
        self.assertEqual(len(res["unusedSuppressions"]), 1)
        self.assertEqual(res["unusedSuppressions"][0]["line"], 7)

    def test_ui_slop_chrome_and_clean_html(self) -> None:
        ui = resolve_effective_pack("deck-and-ui", self.packs)
        bad_html = """
        <div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
          <span class="badge">AI-Powered</span>
          <a href="#">Download</a>
        </div>
        """
        r_bad = audit_text(bad_html, filename="bad.html", modality="html", pack=ui)
        rule_ids = {f["ruleId"] for f in r_bad["findings"]}
        self.assertIn("ui-ai-gradient", rule_ids)
        self.assertIn("ui-prompt-echo-badge", rule_ids)
        self.assertIn("ui-dead-control", rule_ids)

        good_html = """
        <div class="surface-card">
          <a href="./report.html">Download report</a>
        </div>
        """
        r_good = audit_text(good_html, filename="good.html", modality="html", pack=ui)
        self.assertEqual(r_good["findings"], [])

    def test_gif_parsing_and_node_parity(self) -> None:
        ui = resolve_effective_pack("deck-and-ui", self.packs)

        clean_gif = _make_test_gif(
            64,
            64,
            [(246, 247, 245), (20, 23, 26), (240, 68, 56), (255, 255, 255)],
            lambda x, y: 1 if (16 <= x < 48 and 28 <= y < 32) else 0,
        )
        wf_gif = _make_test_gif(
            64,
            64,
            [(246, 247, 245), (20, 23, 26), (240, 68, 56), (255, 255, 255)],
            lambda x, y: 0,
            comment="masterpiece, neon glow\nNegative prompt: blurry\nSteps: 28, Sampler: Euler a, CFG scale: 7",
        )
        slop_gif = _make_test_gif(
            64,
            64,
            [(11, 11, 20), (139, 92, 246), (236, 72, 153), (255, 255, 255)],
            lambda x, y: 1 if y < 32 else 2,
        )

        self.assertEqual(audit_image_document(parse_image_bytes(clean_gif), filename="clean.gif", pack=ui)["findings"], [])
        wf_ids = {f["ruleId"] for f in audit_image_document(parse_image_bytes(wf_gif), filename="wf.gif", pack=ui)["findings"]}
        self.assertIn("image-ai-workflow-residue", wf_ids)
        slop_ids = {f["ruleId"] for f in audit_image_document(parse_image_bytes(slop_gif), filename="slop.gif", pack=ui)["findings"]}
        self.assertIn("image-ai-palette-slop", slop_ids)

        real_gif = ROOT / "assets" / "demos" / "proof-cycle-zh-v2.gif"
        if real_gif.exists():
            raw = real_gif.read_bytes()
            py_parsed = parse_image_bytes(raw)
            py_res = audit_image_document(py_parsed, filename="proof-cycle-zh-v2.gif", pack=ui)
            self.assertEqual(py_res["findings"], [])

            node_cmd = (
                'import fs from "node:fs"; '
                'import { parseImageBuffer } from "./src/binary-node.mjs"; '
                f'console.log(JSON.stringify(parseImageBuffer(fs.readFileSync({json.dumps(str(real_gif))}))));'
            )
            node_out = subprocess.check_output(["node", "-e", node_cmd], cwd=ROOT, text=True)
            self.assertEqual(py_parsed, json.loads(node_out))


if __name__ == "__main__":
    unittest.main()
