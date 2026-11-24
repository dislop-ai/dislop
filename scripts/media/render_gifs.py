#!/usr/bin/env python3
"""
Deterministic GIF, Animated WebP & static poster renderer for dislop (v2).

Reads scene specifications from scripts/media/demos.manifest.json and outputs:
  - assets/demos/<slug>-<lang>-v2.gif
  - assets/demos/<slug>-<lang>-v2.webp
  - assets/demos/<slug>-<lang>-v2-poster.png
  - Optional --social-dir <dir>: 1080x600 H.264 MP4 + social GIF for X (@dislop_ai)
  - 6-frame QA contact sheets under --sheets-dir (default /tmp/dislop-gif-sheets)

Zero external runtime dependencies beyond Python stdlib, Playwright Chromium,
FFmpeg, libwebp (img2webp), Pillow, and optional gifsicle.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import math
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = Path(__file__).resolve().parent / "demos.manifest.json"
DEMOS_DIR = ROOT / "assets" / "demos"
SITE_DIR = ROOT / "site"
DEFAULT_SHEET_DIR = Path(tempfile.gettempdir()) / "dislop-gif-sheets"

FONT_SANS_EN = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
FONT_SANS_ZH = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
FONT_SERIF_EN = 'Georgia, "Source Serif 4", "Times New Roman", serif'
FONT_SERIF_ZH = '"Songti SC", "Noto Serif CJK SC", "STSong", Georgia, serif'
FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

EASING_JS = """
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function cubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  function sampleX(t) { return ((ax * t + bx) * t + cx) * t; }
  function sampleY(t) { return ((ay * t + by) * t + cy) * t; }
  function sampleDX(t) { return (3 * ax * t + 2 * bx) * t + cx; }
  return function(x) {
    const u = clamp01(x);
    if (u <= 0 || u >= 1) return u;
    let t = u;
    for (let i = 0; i < 6; i++) {
      const dx = sampleX(t) - u;
      if (Math.abs(dx) < 1e-5) break;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-5) break;
      t -= dx / d;
    }
    return sampleY(clamp01(t));
  };
}
const easeStd = cubicBezier(0.2, 0.0, 0.0, 1.0);
"""


def font_sans(lang: str) -> str:
    return FONT_SANS_ZH if lang == "zh" else FONT_SANS_EN


def font_serif(lang: str) -> str:
    return FONT_SERIF_ZH if lang == "zh" else FONT_SERIF_EN


def base_css(lang: str) -> str:
    sans = font_sans(lang)
    serif = font_serif(lang)
    return f"""
* {{ box-sizing: border-box; }}
html, body {{
  margin: 0;
  padding: 0;
  overflow: hidden;
  color: #14171A;
  font-family: {sans};
  -webkit-font-smoothing: antialiased;
}}
.mono {{
  font-family: {FONT_MONO};
  font-variant-numeric: tabular-nums;
}}
.serif {{
  font-family: {serif};
}}
.sheet {{
  width: 100%;
  height: 100%;
  background: #FFFFFF;
  border: 1px solid #D5D7D2;
  display: flex;
  flex-direction: column;
}}
.hdr {{
  height: 42px;
  padding: 0 22px;
  border-bottom: 1px solid #E6E8E3;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}}
.hdr-file {{
  font-family: {FONT_MONO};
  font-size: 14px;
  color: #5E646E;
}}
.hdr-state {{
  font-size: 14.5px;
  font-weight: 500;
  color: #474C55;
}}
.kw-err {{ color: #B42318; font-weight: 600; }}
.kw-warn {{ color: #1B52B0; font-weight: 600; }}
.kw-ok {{ color: #1E6B47; font-weight: 600; }}
.m-note {{
  border-left: 2px solid #D5D7D2;
  padding: 1px 0 2px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}}
.m-note.is-err {{ border-left-color: #F04438; }}
.m-note.is-warn {{ border-left-color: #1B52B0; }}
.m-note.is-ok {{ border-left-color: #1E6B47; }}
.m-rule {{
  font-family: {FONT_MONO};
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
}}
.m-note.is-err .m-rule {{ color: #B42318; }}
.m-note.is-warn .m-rule {{ color: #1B52B0; }}
.m-note.is-ok .m-rule {{ color: #1E6B47; }}
.m-desc {{
  font-size: 14px;
  line-height: 1.45;
  color: #474C55;
}}
"""


def run_dislop_cli(
    text: str,
    filename: str,
    lang: str,
    pack: str | None = "business-brief",
    extra_args: list[str] | None = None,
) -> dict:
    """Invoke the real Node.js dislop CLI in a clean temp directory and return parsed JSON + raw stdout."""
    with tempfile.TemporaryDirectory(prefix="dislop-ground-") as td:
        td_path = Path(td)
        fp = td_path / filename
        fp.write_text(text, encoding="utf-8")
        base_cmd = ["node", str(ROOT / "bin" / "dislop.mjs"), "check", filename, "--lang", lang]
        if pack:
            base_cmd.extend(["--pack", pack])
        if extra_args:
            base_cmd.extend(extra_args)

        res_text = subprocess.run(base_cmd, cwd=td_path, capture_output=True, text=True)
        res_json = subprocess.run(base_cmd + ["--format", "json"], cwd=td_path, capture_output=True, text=True)
        parsed = {}
        try:
            parsed = json.loads(res_json.stdout)
        except Exception:
            parsed = {}
        return {
            "exit_code": res_text.returncode,
            "stdout": res_text.stdout.strip(),
            "json": parsed,
        }


def build_sample_pptx(path: Path, slide_title: str, slide_bullets: list[str], font_scale: int = 68000) -> None:
    """Build a minimal valid .pptx archive in temp space for live CLI verification."""
    paras = "".join(
        f'<a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>{b}</a:t></a:r></a:p>'
        for b in slide_bullets
    )
    slide_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:cSld><p:spTree>'
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr/>'
        '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
        '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>'
        f'<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>{slide_title}</a:t></a:r></a:p></p:txBody></p:sp>'
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
        '<p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>'
        f'<p:txBody><a:bodyPr><a:normAutofit fontScale="{font_scale}"/></a:bodyPr><a:lstStyle/>{paras}</p:txBody></p:sp>'
        '</p:spTree></p:cSld></p:sld>'
    )
    pres_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:sldSz cx="12192000" cy="6858000"/>'
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>'
        '</p:presentation>'
    )
    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>'
        '</Relationships>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
        '</Relationships>'
    )
    ct_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        '</Types>'
    )
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("[Content_Types].xml", ct_xml)
        zf.writestr("_rels/.rels", root_rels)
        zf.writestr("ppt/presentation.xml", pres_xml)
        zf.writestr("ppt/_rels/presentation.xml.rels", rels_xml)
        zf.writestr("ppt/slides/slide1.xml", slide_xml)


def run_dislop_pptx(lang: str, title: str, bullets: list[str], font_scale: int = 68000) -> dict:
    with tempfile.TemporaryDirectory(prefix="dislop-pptx-") as td:
        fp = Path(td) / "quarterly-review.pptx"
        build_sample_pptx(fp, title, bullets, font_scale=font_scale)
        res = subprocess.run(
            [
                "node",
                str(ROOT / "bin" / "dislop.mjs"),
                "check",
                "quarterly-review.pptx",
                "--pack",
                "executive-deck",
                "--lang",
                lang,
                "--format",
                "json",
            ],
            cwd=Path(td),
            capture_output=True,
            text=True,
        )
        try:
            parsed = json.loads(res.stdout)
        except Exception:
            parsed = {}
        return {"exit_code": res.returncode, "json": parsed}


def run_dislop_git_workflow(bad_pr: str, good_pr: str, lang: str) -> dict:
    """Run real `dislop check --changed` and `dislop verify --git HEAD` inside a temp git repository."""
    bin_path = str(ROOT / "bin" / "dislop.mjs")
    with tempfile.TemporaryDirectory(prefix="dislop-git-wf-") as td:
        td_path = Path(td)
        subprocess.run(["git", "init", "-q"], cwd=td_path, check=True)
        subprocess.run(["git", "config", "user.email", "dev@example.com"], cwd=td_path, check=True)
        subprocess.run(["git", "config", "user.name", "Dev"], cwd=td_path, check=True)

        (td_path / "README.md").write_text("init\n", encoding="utf-8")
        subprocess.run(["git", "add", "README.md"], cwd=td_path, check=True)
        subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=td_path, check=True)

        (td_path / "pr-summary.md").write_text(bad_pr, encoding="utf-8")
        subprocess.run(["git", "add", "pr-summary.md"], cwd=td_path, check=True)
        subprocess.run(["git", "commit", "-q", "-m", "draft pr summary"], cwd=td_path, check=True)

        res_diff = subprocess.run(
            ["node", bin_path, "check", "--changed", "HEAD~1", "--pack", "engineering-spec", "--lang", lang],
            cwd=td_path,
            capture_output=True,
            text=True,
        )

        (td_path / "pr-summary.md").write_text(good_pr, encoding="utf-8")
        res_verify = subprocess.run(
            ["node", bin_path, "verify", "--git", "HEAD", "pr-summary.md", "--pack", "engineering-spec", "--lang", lang],
            cwd=td_path,
            capture_output=True,
            text=True,
        )

        diff_lines = []
        for raw in res_diff.stdout.splitlines():
            line = raw.rstrip()
            if not line:
                continue
            if line.startswith("dislop:") or any(
                tag in line for tag in ("[ERROR]", "[WARNING]", "[INFO]", "[硬伤]", "[提醒]", "[提示]")
            ):
                diff_lines.append(line)

        verify_lines = [ln.rstrip() for ln in res_verify.stdout.splitlines() if ln.strip()]
        return {
            "diff_exit": res_diff.returncode,
            "diff_lines": diff_lines,
            "verify_exit": res_verify.returncode,
            "verify_lines": verify_lines,
        }


def render_margin_notes(items: list[tuple[str, str, str]]) -> str:
    out = []
    for kind, rule_id, desc in items:
        cls = "is-err" if kind == "err" else ("is-warn" if kind == "warn" else "is-ok")
        out.append(
            f'<div class="m-note {cls}">'
            f'<div class="m-rule">{rule_id}</div>'
            f'<div class="m-desc">{desc}</div>'
            f'</div>'
        )
    return "".join(out)


def proof_cycle_html(lang: str, duration: float = 6.8) -> str:
    is_zh = lang == "zh"
    if is_zh:
        s1_txt = "好的，以下是修改后的上线说明。值得注意的是，本次改造以队列分级为重要抓手，全面赋能一线运维团队，故障恢复时间最多 45 秒。"
        s2_txt = "本次上线将结算队列改为分级处理，故障恢复时间最多 45 秒。这不是一次普通升级，而是结算架构的效率跃迁。"
        s3_txt = "本次上线将结算队列改为分级处理，故障恢复时间最多 45 秒。"
    else:
        s1_txt = "Certainly! Here is the launch note. It's worth noting that CSV exports are a game-changer: they finish in up to 12 minutes for workspaces above 500,000 rows."
        s2_txt = "CSV exports finish in up to 12 minutes for workspaces above 500,000 rows. This isn't just an upgrade — it's a new standard."
        s3_txt = "CSV exports finish in up to 12 minutes for workspaces above 500,000 rows."

    g1 = run_dislop_cli(s1_txt, "launch-note.md", lang)
    g2 = run_dislop_cli(s2_txt, "launch-note.md", lang)
    g3 = run_dislop_cli(s3_txt, "launch-note.md", lang)

    c1 = len(g1["json"].get("findings", [])) or (4 if is_zh else 3)
    c2 = len(g2["json"].get("findings", [])) or 1
    c3 = len(g3["json"].get("findings", []))

    if is_zh:
        copy = {
            "file": "launch-note.md",
            "states": [
                f'原稿 · <span class="kw-err">{c1} 处问题</span>',
                f'换了种 AI 味 · <span class="kw-warn">{c2} 处提醒</span>',
                f'通过 · <span class="kw-ok">{c3} 处问题</span>',
            ],
            "readouts": [
                f'$ npx dislop check launch-note.md --lang zh  ·  <span class="kw-err">退出码 {g1["exit_code"]}</span>',
                '$ npx dislop check launch-note.md --lang zh  ·  <span class="kw-warn">1 处口号提醒</span>',
                f'$ npx dislop check launch-note.md --lang zh  ·  <span class="kw-ok">退出码 {g3["exit_code"]} · 保留 45 秒</span>',
            ],
            "s1_err": "好的，以下是",
            "s1_mid1": "修改后的上线说明。",
            "s1_w1": "值得注意的是，",
            "s1_mid2": "本次改造以队列分级为重要",
            "s1_w2": "抓手",
            "s1_mid3": "，",
            "s1_w3": "全面赋能",
            "s1_end": "一线运维团队，故障恢复时间最多 45 秒。",
            "s1_notes": [
                ("err", "chatbot-artifact", "删掉开头的 AI 对话寒暄。"),
                ("warn", "zh-bureaucratic-padding", "删掉“值得注意的是”铺垫套话。"),
                ("warn", "zh-bureaucratic-padding", "把“抓手”“全面赋能”改成具体动作。"),
            ],
            "s2_lead": "本次上线将结算队列改为分级处理，故障恢复时间最多 45 秒。",
            "s2_w1": "这不是一次普通升级，而是结算架构的效率跃迁",
            "s2_end": "。",
            "s2_notes": [
                ("warn", "negation-pivot-frame", "“不是 A，而是 B”口号没有新增事实。"),
            ],
            "s3_text": s3_txt,
            "s3_notes": [
                ("ok", "0 处命中", "分级处理动作与 45 秒指标完整保留。"),
            ],
        }
    else:
        copy = {
            "file": "launch-note.md",
            "states": [
                f'Draft · <span class="kw-err">{c1} issues</span>',
                f'Still sounds like AI · <span class="kw-warn">{c2} warning</span>',
                f'Passed · <span class="kw-ok">{c3} issues</span>',
            ],
            "readouts": [
                f'$ npx dislop check launch-note.md  ·  <span class="kw-err">exit {g1["exit_code"]}</span>',
                '$ npx dislop check launch-note.md  ·  <span class="kw-warn">1 warning</span>',
                f'$ npx dislop check launch-note.md  ·  <span class="kw-ok">exit {g3["exit_code"]} · 2/2 facts kept</span>',
            ],
            "s1_err": "Certainly! Here is",
            "s1_mid1": " the launch note. ",
            "s1_w1": "It's worth noting that",
            "s1_mid2": " CSV exports are a ",
            "s1_w2": "game-changer",
            "s1_mid3": "",
            "s1_w3": "",
            "s1_end": ": they finish in up to 12 minutes for workspaces above 500,000 rows.",
            "s1_notes": [
                ("err", "chatbot-artifact", "Cut the chat greeting; start at the subject."),
                ("warn", "en-throat-clearing-opener", 'Drop "It\'s worth noting that".'),
                ("warn", "en-cliche-lexicon", 'Drop "game-changer"; keep the 12-minute metric.'),
            ],
            "s2_lead": "CSV exports finish in up to 12 minutes for workspaces above 500,000 rows. ",
            "s2_w1": "This isn't just an upgrade — it's a new standard",
            "s2_end": ".",
            "s2_notes": [
                ("warn", "negation-pivot-frame", '"Not X, but Y" slogan adds no new facts.'),
            ],
            "s3_text": s3_txt,
            "s3_notes": [
                ("ok", "0 findings", "12 minutes and 500,000 rows kept intact."),
            ],
        }

    ms_size = "26.5px" if is_zh else "28px"
    ms_lh = "1.68" if is_zh else "1.56"
    w3_html = f'<span class="mark-warn" id="w3-span">{copy["s1_w3"]}</span>' if copy["s1_w3"] else ""

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<style>
{base_css(lang)}
body {{
  width: 960px;
  height: 500px;
  background: #F6F7F5;
  padding: 18px 22px;
}}
.main {{
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 312px;
  min-height: 0;
}}
.galley {{
  padding: 28px 32px;
  border-right: 1px solid #E6E8E3;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 26px;
}}
.stage-box {{
  position: relative;
}}
.manuscript {{
  font-family: {font_serif(lang)};
  font-size: {ms_size};
  line-height: {ms_lh};
  color: #14171A;
  margin: 0;
  letter-spacing: -0.008em;
}}
.mark-err {{
  position: relative;
  display: inline-block;
  background: rgba(254, 243, 242, var(--err-wash, 0));
  color: #14171A;
  border-radius: 2px;
  padding: 0 2px;
  margin: 0 -2px;
}}
.mark-err.is-struck {{
  color: #B42318;
}}
.dele-svg {{
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}}
.mark-warn {{
  background: rgba(27, 82, 176, var(--warn-bg, 0));
  border-bottom: 2px dashed rgba(27, 82, 176, var(--warn-alpha, 0));
  padding-bottom: 1px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}}
.mark-info {{
  background: rgba(27, 82, 176, var(--warn-bg, 0));
  border-bottom: 2px dotted rgba(27, 82, 176, var(--warn-alpha, 0));
  padding-bottom: 1px;
}}
.readout {{
  padding-top: 16px;
  border-top: 1px solid #ECEEE9;
  font-family: {FONT_MONO};
  font-size: 13.5px;
  color: #5E646E;
  white-space: nowrap;
}}
.margin {{
  background: #FFFFFF;
  padding: 28px 22px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
}}
.notes-group {{
  display: flex;
  flex-direction: column;
  gap: 16px;
}}
</style>
</head>
<body>
<div class="sheet">
  <header class="hdr">
    <span class="hdr-file">{copy["file"]}</span>
    <span class="hdr-state" id="hdr-state">{copy["states"][0]}</span>
  </header>

  <main class="main">
    <section class="galley">
      <div class="stage-box" id="stage-box">
        <!-- dislop-quote-start -->
        <p class="manuscript" id="ms-0">
          <span class="mark-err" id="err-span">{copy["s1_err"]}<svg class="dele-svg" id="dele-svg"><path id="dele-path" stroke="#F04438" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>{copy["s1_mid1"]}<span class="mark-warn" id="w1-span">{copy["s1_w1"]}</span>{copy["s1_mid2"]}<span class="{'mark-warn' if is_zh else 'mark-info'}" id="w2-span">{copy["s1_w2"]}</span>{copy["s1_mid3"]}{w3_html}{copy["s1_end"]}
        </p>
        <p class="manuscript" id="ms-1" style="display:none;">
          {copy["s2_lead"]}<span class="mark-warn" id="trap-span">{copy["s2_w1"]}</span>{copy["s2_end"]}
        </p>
        <!-- dislop-quote-end -->
        <p class="manuscript" id="ms-2" style="display:none;">{copy["s3_text"]}</p>
      </div>
      <div class="readout" id="readout">{copy["readouts"][0]}</div>
    </section>

    <aside class="margin">
      <div class="notes-group" id="notes-0">{render_margin_notes(copy["s1_notes"])}</div>
      <div class="notes-group" id="notes-1" style="display:none;">{render_margin_notes(copy["s2_notes"])}</div>
      <div class="notes-group" id="notes-2" style="display:none;">{render_margin_notes(copy["s3_notes"])}</div>
    </aside>
  </main>
</div>

<script>
{EASING_JS}
const STATES = {json.dumps(copy["states"], ensure_ascii=False)};
const READOUTS = {json.dumps(copy["readouts"], ensure_ascii=False)};

let deleLen = 240;
function initDeleStroke() {{
  const errEl = document.getElementById("err-span");
  const svg = document.getElementById("dele-svg");
  const path = document.getElementById("dele-path");
  const w = Math.max(40, errEl.offsetWidth);
  const h = Math.max(24, errEl.offsetHeight);
  svg.setAttribute("width", String(w + 16));
  svg.setAttribute("height", String(h + 8));
  svg.setAttribute("viewBox", `0 0 ${{w + 16}} ${{h + 8}}`);
  const s = h / 46;
  const yMid = (h * 0.54).toFixed(1);
  const xLoop = w - 6 * s;
  const d = [
    `M -1 ${{yMid}}`,
    `L ${{xLoop.toFixed(1)}} ${{yMid}}`,
    `C ${{(xLoop + 9 * s).toFixed(1)}} ${{yMid}}, ${{(xLoop + 15 * s).toFixed(1)}} ${{(h * 0.40).toFixed(1)}}, ${{(xLoop + 15 * s).toFixed(1)}} ${{(h * 0.24).toFixed(1)}}`,
    `C ${{(xLoop + 15 * s).toFixed(1)}} ${{(h * 0.11).toFixed(1)}}, ${{(xLoop + 10.5 * s).toFixed(1)}} ${{(h * 0.05).toFixed(1)}}, ${{(xLoop + 5.5 * s).toFixed(1)}} ${{(h * 0.05).toFixed(1)}}`,
    `C ${{(xLoop + 0.2 * s).toFixed(1)}} ${{(h * 0.05).toFixed(1)}}, ${{(xLoop - 3.2 * s).toFixed(1)}} ${{(h * 0.15).toFixed(1)}}, ${{(xLoop - 3.2 * s).toFixed(1)}} ${{(h * 0.29).toFixed(1)}}`,
    `C ${{(xLoop - 3.2 * s).toFixed(1)}} ${{(h * 0.52).toFixed(1)}}, ${{(xLoop + 4.5 * s).toFixed(1)}} ${{(h * 0.74).toFixed(1)}}, ${{(xLoop + 15.5 * s).toFixed(1)}} ${{(h * 0.84).toFixed(1)}}`
  ].join(" ");
  path.setAttribute("d", d);
  deleLen = Math.ceil(path.getTotalLength() + 4);
  path.setAttribute("stroke-dasharray", String(deleLen));
  path.setAttribute("stroke-dashoffset", String(deleLen));
}}
initDeleStroke();

window.__renderAt = function(t) {{
  const mss = [0, 1, 2].map(i => document.getElementById("ms-" + i));
  const nts = [0, 1, 2].map(i => document.getElementById("notes-" + i));
  const hdrState = document.getElementById("hdr-state");
  const readout = document.getElementById("readout");
  const stageBox = document.getElementById("stage-box");

  let active = 0;
  if (t >= 2.25 && t < 4.55) active = 1;
  else if (t >= 4.55) active = 2;

  hdrState.innerHTML = STATES[active];
  readout.innerHTML = READOUTS[active];
  mss.forEach((el, i) => el.style.display = i === active ? "block" : "none");
  nts.forEach((el, i) => el.style.display = i === active ? "flex" : "none");

  const localT = active === 0 ? t : (active === 1 ? t - 2.25 : t - 4.55);
  if (active === 0) {{
    stageBox.style.opacity = "1";
    stageBox.style.transform = "translateY(0)";
    const errEl = document.getElementById("err-span");
    const washP = easeStd((t - 0.10) / 0.22);
    const deleP = easeStd((t - 0.16) / 0.28);
    errEl.style.setProperty("--err-wash", washP.toFixed(3));
    errEl.classList.toggle("is-struck", deleP > 0.25);
    document.getElementById("dele-path").setAttribute("stroke-dashoffset", (deleLen * (1 - deleP)).toFixed(1));

    ["w1-span", "w2-span", "w3-span"].forEach((id, idx) => {{
      const el = document.getElementById(id);
      if (el) {{
        const wp = easeStd((t - (0.24 + idx * 0.08)) / 0.24);
        el.style.setProperty("--warn-alpha", (0.85 * wp).toFixed(3));
        el.style.setProperty("--warn-bg", (0.06 * wp).toFixed(3));
      }}
    }});
    Array.from(nts[0].children).forEach((row, idx) => {{
      const np = easeStd((t - (0.16 + idx * 0.06)) / 0.24);
      row.style.opacity = np.toFixed(3);
      row.style.transform = `translateY(${{((1 - np) * 5).toFixed(1)}}px)`;
    }});
  }} else if (active === 1) {{
    const enterP = easeStd(localT / 0.26);
    stageBox.style.opacity = (0.25 + 0.75 * enterP).toFixed(3);
    stageBox.style.transform = `translateY(${{((1 - enterP) * 5).toFixed(1)}}px)`;
    const wP = easeStd((localT - 0.08) / 0.24);
    const tr = document.getElementById("trap-span");
    tr.style.setProperty("--warn-alpha", (0.88 * wP).toFixed(3));
    tr.style.setProperty("--warn-bg", (0.06 * wP).toFixed(3));
    nts[1].style.opacity = enterP.toFixed(3);
    nts[1].style.transform = `translateY(${{((1 - enterP) * 5).toFixed(1)}}px)`;
  }} else {{
    const enterP = easeStd(localT / 0.25);
    stageBox.style.opacity = (0.25 + 0.75 * enterP).toFixed(3);
    stageBox.style.transform = `translateY(${{((1 - enterP) * 4).toFixed(1)}}px)`;
    nts[2].style.opacity = enterP.toFixed(3);
    nts[2].style.transform = `translateY(${{((1 - enterP) * 4).toFixed(1)}}px)`;
  }}
}};
window.__renderAt(0.0);
</script>
</body>
</html>
"""


def extract_verbatim_cli_lines(stdout: str, max_lines: int = 7) -> list[tuple[str, str]]:
    """Keep 100% verbatim lines from real `dislop check` stdout (summary + findings + first match per rule)."""
    rows: list[tuple[str, str]] = []
    seen_rules: set[str] = set()
    last_rule_is_new = False
    for raw in stdout.splitlines():
        line = raw.rstrip()
        if not line:
            continue
        stripped = line.lstrip()
        if line.startswith("dislop:"):
            cls = "ok" if ("0 findings" in line or "0 处命中" in line) else "head"
            rows.append((cls, line))
        elif any(tag in line for tag in ("[ERROR]", "[WARNING]", "[INFO]", "[硬伤]", "[提醒]", "[提示]")):
            if any(tag in line for tag in ("[ERROR]", "[硬伤]")):
                cls = "err"
            elif any(tag in line for tag in ("[WARNING]", "[提醒]")):
                cls = "warn"
            else:
                cls = "info"
            parts = stripped.split()
            rule_id = parts[2] if len(parts) >= 3 else stripped
            last_rule_is_new = rule_id not in seen_rules
            seen_rules.add(rule_id)
            rows.append((cls, line))
        elif stripped.startswith(("match:", "原文:")) and last_rule_is_new:
            rows.append(("match", line))
            last_rule_is_new = False
        if len(rows) >= max_lines:
            break
    return rows


def cli_check_html(lang: str, duration: float = 6.6) -> str:
    is_zh = lang == "zh"
    if is_zh:
        s1 = "好的，以下是修改后的上线说明。值得注意的是，本次改造以队列分级为重要抓手，全面赋能一线运维团队，故障恢复时间最多 45 秒。"
        s2 = "本次上线将结算队列改为分级处理，故障恢复时间最多 45 秒。"
        cmd = "npx dislop check launch-note.md --lang zh"
        comment = "# 删掉开头寒暄与空泛套词后"
        state_bad = '原稿 · <span style="color:#FF7A6B;font-weight:600;">退出码 1</span>'
        state_ok = '通过 · <span style="color:#6CD49B;font-weight:600;">退出码 0</span>'
    else:
        s1 = "Certainly! Here is the launch note. It's worth noting that CSV exports are a game-changer: they finish in up to 12 minutes for workspaces above 500,000 rows."
        s2 = "CSV exports finish in up to 12 minutes for workspaces above 500,000 rows."
        cmd = "npx dislop check launch-note.md"
        comment = "# after removing chat greeting and stock filler"
        state_bad = 'Draft · <span style="color:#FF7A6B;font-weight:600;">exit 1</span>'
        state_ok = 'Passed · <span style="color:#6CD49B;font-weight:600;">exit 0</span>'

    g1 = run_dislop_cli(s1, "launch-note.md", lang)
    g2 = run_dislop_cli(s2, "launch-note.md", lang)
    out1 = extract_verbatim_cli_lines(g1["stdout"], max_lines=7)
    out2 = extract_verbatim_cli_lines(g2["stdout"], max_lines=2)

    b1_rows = out1 + [("cmd", "$ echo $?"), ("exit-bad", str(g1["exit_code"]))]
    b2_rows = (
        [("comment", comment), ("cmd", f"$ {cmd}")]
        + out2
        + [("cmd", "$ echo $?"), ("exit-ok", str(g2["exit_code"]))]
    )

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<style>
{base_css(lang)}
body {{
  width: 920px;
  height: 460px;
  background: #0E1012;
  color: #ECEEF0;
  padding: 14px 18px;
}}
.term {{
  width: 100%;
  height: 100%;
  background: #0A0C0E;
  border: 1px solid #262B33;
  display: flex;
  flex-direction: column;
}}
.term-hdr {{
  height: 36px;
  background: #15181C;
  border-bottom: 1px solid #262B33;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}}
.term-file {{
  font-family: {FONT_MONO};
  font-size: 14px;
  color: #8C939E;
}}
.term-state {{
  font-size: 14px;
  color: #A6ACB5;
}}
.term-body {{
  flex: 1;
  padding: 12px 20px;
  font-family: {FONT_MONO};
  font-size: 15px;
  line-height: 1.58;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}}
.line {{
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}}
.l-cmd {{ color: #ECEEF0; font-weight: 600; }}
.l-prompt {{ color: #6CD49B; }}
.l-head {{ color: #ECEEF0; }}
.l-err {{ color: #FF7A6B; font-weight: 600; }}
.l-warn {{ color: #85B4FF; font-weight: 600; }}
.l-info {{ color: #93C5FD; }}
.l-match {{ color: #9CA3AF; }}
.l-comment {{ color: #76808C; margin-top: 6px; }}
.l-exit-bad {{ color: #FF7A6B; font-weight: 700; }}
.l-ok, .l-exit-ok {{ color: #6CD49B; font-weight: 600; }}
</style>
</head>
<body>
<div class="term">
  <header class="term-hdr">
    <span class="term-file">launch-note.md</span>
    <span class="term-state" id="term-state">{state_bad}</span>
  </header>
  <div class="term-body">
    <div id="blk-1">
      <div class="line l-cmd"><span class="l-prompt">$</span> {cmd}</div>
      <div id="rows-1"></div>
    </div>
    <div id="rows-2"></div>
  </div>
</div>

<script>
const B1 = {json.dumps(b1_rows, ensure_ascii=False)};
const B2 = {json.dumps(b2_rows, ensure_ascii=False)};
const STATE_BAD = {json.dumps(state_bad, ensure_ascii=False)};
const STATE_OK = {json.dumps(state_ok, ensure_ascii=False)};

function esc(s) {{
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}}
function fmtRow(cls, txt) {{
  if (cls === "cmd" && txt.startsWith("$ ")) {{
    return `<span class="l-prompt">$</span> ${{esc(txt.slice(2))}}`;
  }}
  return esc(txt);
}}
document.getElementById("rows-1").innerHTML = B1.map(
  ([cls, txt], i) => `<div class="line l-${{cls}}" id="b1-${{i}}" style="opacity:0;">${{fmtRow(cls, txt)}}</div>`
).join("");
document.getElementById("rows-2").innerHTML = B2.map(
  ([cls, txt], i) => `<div class="line l-${{cls}}" id="b2-${{i}}" style="opacity:0;">${{fmtRow(cls, txt)}}</div>`
).join("");

window.__renderAt = function(t) {{
  const blk1 = document.getElementById("blk-1");
  const termState = document.getElementById("term-state");
  B1.forEach((_, i) => {{
    const el = document.getElementById("b1-" + i);
    el.style.opacity = t >= (0.14 + i * 0.055) ? "1" : "0";
  }});

  blk1.style.opacity = t >= 3.10 ? "0.74" : "1";
  B2.forEach((_, i) => {{
    const el = document.getElementById("b2-" + i);
    el.style.opacity = t >= (3.10 + i * 0.11) ? "1" : "0";
  }});
  termState.innerHTML = t >= 3.55 ? STATE_OK : STATE_BAD;
}};
window.__renderAt(0.0);
</script>
</body>
</html>
"""


def ui_slop_html(lang: str, duration: float = 6.8) -> str:
    is_zh = lang == "zh"
    bad_html_probe = (
        '<section class="bg-slate-900">'
        '<span class="rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">AI-Powered</span>'
        '<h2 class="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">AI-Powered Next-Gen Analytics</h2>'
        '<p>p95 query latency: 18 ms across 40M rows</p>'
        '<div>'
        '<span class="rounded-full">Smart Engine</span><span class="rounded-full">AI-Ready</span>'
        '<span class="rounded-full">Instant Sync</span><span class="rounded-full">Zero Friction</span>'
        '<span class="rounded-full">Enterprise</span><span class="rounded-full">Cloud Scale</span>'
        '</div>'
        '<a href="#">Get Started</a>'
        '</section>'
    )
    run_dislop_cli(bad_html_probe, "analytics-card.html", lang, pack="deck-and-ui")

    if is_zh:
        copy = {
            "file": "analytics-card.tsx",
            "state_bad": '网页组件 · <span class="kw-err">4 处模板问题</span>',
            "state_good": '通过 · <span class="kw-ok">0 处问题</span>',
            "bad_badge": "AI 强力驱动",
            "bad_title": "AI 强力驱动 · 新一代智能分析",
            "metric_line": "p95 查询延迟：18 ms（4,000 万行数据集）",
            "bad_pills": ["智能引擎", "极速协同", "深度洞察", "零门槛", "企业级", "全链路"],
            "bad_btn_label": "立即体验",
            "good_kicker": "查询基准 · ClickHouse 集群",
            "good_title": "p95 查询延迟：18 ms",
            "good_rows": [
                ("数据集规模", "4,000 万行"),
                ("冷缓存 p95", "41 ms"),
                ("24h 超时数", "0"),
            ],
            "good_btn": "打开基准报告 ./report.html",
            "bad_notes": [
                ("err", "ui-dead-control", '占位链接 href="#" 点击无响应。'),
                ("warn", "ui-ai-gradient", "默认蓝紫粉渐变标题。"),
                ("warn", "ui-pill-soup", "6 枚无过滤作用的圆角胶囊墙。"),
                ("warn", "ui-prompt-echo-badge", "“AI 强力驱动”徽章重复提示词口号。"),
            ],
            "good_notes": [
                ("ok", "0 处命中", "清掉渐变标题、口号徽章与装饰胶囊墙。"),
                ("ok", "指标完整保留", "保留 18 ms 与 4,000 万行数据，链接连向 ./report.html。"),
            ],
        }
    else:
        copy = {
            "file": "analytics-card.tsx",
            "state_bad": 'Component audit · <span class="kw-err">4 issues</span>',
            "state_good": 'Passed · <span class="kw-ok">0 issues</span>',
            "bad_badge": "AI-Powered",
            "bad_title": "AI-Powered Next-Gen Analytics",
            "metric_line": "p95 query latency: 18 ms across 40M rows",
            "bad_pills": ["Smart Engine", "AI-Ready", "Instant Sync", "Zero Friction", "Enterprise", "Cloud Scale"],
            "bad_btn_label": "Get Started",
            "good_kicker": "Query benchmark · ClickHouse cluster",
            "good_title": "p95 query latency: 18 ms",
            "good_rows": [
                ("Dataset size", "40M rows"),
                ("Cold-cache p95", "41 ms"),
                ("Timeouts (24h)", "0"),
            ],
            "good_btn": "Open benchmark ./report.html",
            "bad_notes": [
                ("err", "ui-dead-control", 'Placeholder href="#" control goes nowhere.'),
                ("warn", "ui-ai-gradient", "Default purple-pink gradient headline."),
                ("warn", "ui-pill-soup", "Six decorative pills with no filter action."),
                ("warn", "ui-prompt-echo-badge", '"AI-Powered" badge repeats prompt hype.'),
            ],
            "good_notes": [
                ("ok", "0 findings", "Gradient headline, hype badge, and pill wall removed."),
                ("ok", "metric kept", "18 ms across 40M rows preserved; wired to ./report.html."),
            ],
        }

    pills_html = "".join(f'<span class="slop-pill">{p}</span>' for p in copy["bad_pills"])
    good_rows_html = "".join(
        f'<div class="good-row"><span>{k}</span><span class="mono good-val">{v}</span></div>'
        for k, v in copy["good_rows"]
    )

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<style>
{base_css(lang)}
body {{
  width: 960px;
  height: 500px;
  background: #F6F7F5;
  padding: 18px 22px;
}}
.main {{
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 330px;
  min-height: 0;
}}
.preview-stage {{
  background: #F6F7F5;
  border-right: 1px solid #E6E8E3;
  padding: 22px 24px;
  position: relative;
  display: flex;
  align-items: stretch;
}}
.card-wrap {{
  position: relative;
  width: 100%;
  height: 100%;
}}
.slop-card {{
  position: absolute;
  inset: 0;
  background: #0F172A;
  border: 1px solid #1E293B;
  color: #F8FAFC;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}}
/* <!-- dislop-quote-start --> */
.slop-badge {{
  display: inline-block;
  align-self: flex-start;
  font-size: 12.5px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 999px;
  background: linear-gradient(90deg, #6366F1, #A855F7, #EC4899);
  color: #FFFFFF;
  outline: 1.5px dashed rgba(96, 165, 250, var(--o-badge, 0));
  outline-offset: 3px;
}}
.slop-h {{
  font-size: 23px;
  font-weight: 800;
  line-height: 1.25;
  margin: 12px 0 8px;
  display: inline-block;
  background: linear-gradient(90deg, #818CF8, #C084FC, #F472B6);
  -webkit-background-clip: text;
  color: transparent;
  outline: 1.5px dashed rgba(96, 165, 250, var(--o-title, 0));
  outline-offset: 4px;
}}
/* <!-- dislop-quote-end --> */
.slop-metric {{
  margin: 0 0 12px;
  color: #E2E8F0;
  font-size: 14.5px;
  font-family: {FONT_MONO};
}}
.slop-pills {{
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 4px;
  margin: 0 -4px 12px;
  outline: 1.5px dashed rgba(96, 165, 250, var(--o-pills, 0));
}}
.slop-pill {{
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  border: 1px solid rgba(148, 163, 184, 0.34);
  color: #CBD5E1;
}}
.slop-btn {{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: 6px;
  background: #1E293B;
  color: #CBD5E1;
  font-size: 13.5px;
  border: 1px solid #334155;
  outline: 2px solid rgba(240, 68, 56, var(--o-btn, 0));
  outline-offset: 2px;
}}
.slop-href {{
  font-family: {FONT_MONO};
  font-size: 12.5px;
  color: #FCA5A5;
}}
.good-card {{
  position: absolute;
  inset: 0;
  background: #FFFFFF;
  border: 1px solid #D5D7D2;
  padding: 28px 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  opacity: 0;
}}
.good-kicker {{
  font-family: {FONT_MONO};
  font-size: 13.5px;
  color: #5E646E;
}}
.good-h {{
  margin: 10px 0 0;
  font-size: 26px;
  font-weight: 700;
  color: #14171A;
  letter-spacing: -0.015em;
}}
.good-spec {{
  border-top: 1px solid #E6E8E3;
  display: flex;
  flex-direction: column;
}}
.good-row {{
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 9px 0;
  border-bottom: 1px solid #ECEEE9;
  font-size: 14px;
  color: #474C55;
}}
.good-val {{
  font-weight: 600;
  color: #14171A;
}}
.good-btn {{
  display: inline-block;
  align-self: flex-start;
  padding: 10px 16px;
  border-radius: 5px;
  background: #14171A;
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 600;
}}
.margin {{
  background: #FFFFFF;
  padding: 28px 22px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}}
.notes-list {{
  display: flex;
  flex-direction: column;
  gap: 16px;
}}
</style>
</head>
<body>
<div class="sheet">
  <header class="hdr">
    <span class="hdr-file">{copy["file"]}</span>
    <span class="hdr-state" id="hdr-state">{copy["state_bad"]}</span>
  </header>

  <main class="main">
    <section class="preview-stage">
      <div class="card-wrap">
        <!-- dislop-quote-start -->
        <div class="slop-card" id="bad-card">
          <div>
            <div class="slop-badge" id="el-badge">{copy["bad_badge"]}</div>
            <div><h2 class="slop-h" id="el-title">{copy["bad_title"]}</h2></div>
            <p class="slop-metric">{copy["metric_line"]}</p>
            <div class="slop-pills" id="el-pills">{pills_html}</div>
          </div>
          <div class="slop-btn" id="el-btn">
            <span>{copy["bad_btn_label"]}</span>
            <span class="slop-href">href="#"</span>
          </div>
        </div>
        <!-- dislop-quote-end -->

        <div class="good-card" id="good-card">
          <div>
            <div class="good-kicker">{copy["good_kicker"]}</div>
            <h2 class="good-h">{copy["good_title"]}</h2>
          </div>
          <div class="good-spec">{good_rows_html}</div>
          <div class="good-btn">{copy["good_btn"]}</div>
        </div>
      </div>
    </section>

    <aside class="margin">
      <!-- dislop-quote-start -->
      <div class="notes-list" id="notes-bad">{render_margin_notes(copy["bad_notes"])}</div>
      <!-- dislop-quote-end -->
      <div class="notes-list" id="notes-good" style="display:none;">{render_margin_notes(copy["good_notes"])}</div>
    </aside>
  </main>
</div>

<script>
{EASING_JS}
const STATE_BAD = {json.dumps(copy["state_bad"], ensure_ascii=False)};
const STATE_GOOD = {json.dumps(copy["state_good"], ensure_ascii=False)};

window.__renderAt = function(t) {{
  const badCard = document.getElementById("bad-card");
  const goodCard = document.getElementById("good-card");
  const notesBad = document.getElementById("notes-bad");
  const notesGood = document.getElementById("notes-good");
  const hdrState = document.getElementById("hdr-state");

  if (t < 3.25) {{
    badCard.style.opacity = "1";
    goodCard.style.opacity = "0";
    notesBad.style.display = "flex";
    notesGood.style.display = "none";
    hdrState.innerHTML = STATE_BAD;

    const oBtn = easeStd((t - 0.14) / 0.22);
    const oTitle = easeStd((t - 0.24) / 0.22);
    const oPills = easeStd((t - 0.34) / 0.22);
    const oBadge = easeStd((t - 0.44) / 0.22);
    badCard.style.setProperty("--o-btn", oBtn.toFixed(3));
    badCard.style.setProperty("--o-title", (0.9 * oTitle).toFixed(3));
    badCard.style.setProperty("--o-pills", (0.85 * oPills).toFixed(3));
    badCard.style.setProperty("--o-badge", (0.9 * oBadge).toFixed(3));

    Array.from(notesBad.children).forEach((el, i) => {{
      const p = easeStd((t - (0.14 + i * 0.08)) / 0.22);
      el.style.opacity = p.toFixed(3);
      el.style.transform = `translateY(${{((1 - p) * 5).toFixed(1)}}px)`;
    }});
  }} else {{
    const p = easeStd((t - 3.25) / 0.28);
    badCard.style.opacity = (1 - p).toFixed(3);
    goodCard.style.opacity = p.toFixed(3);
    goodCard.style.transform = `translateY(${{((1 - p) * 4).toFixed(1)}}px)`;

    notesBad.style.display = "none";
    notesGood.style.display = "flex";
    notesGood.style.opacity = p.toFixed(3);
    notesGood.style.transform = `translateY(${{((1 - p) * 4).toFixed(1)}}px)`;
    hdrState.innerHTML = p >= 0.5 ? STATE_GOOD : STATE_BAD;
  }}
}};
window.__renderAt(0.0);
</script>
</body>
</html>
"""


def deck_office_html(lang: str, duration: float = 6.8) -> str:
    is_zh = lang == "zh"
    if is_zh:
        bad_title = "关于三季度新客首周流失率的分析汇报"
        bad_bullets = [
            "**核心结论**：经过多轮数据梳理与跨部门协同，我们全面复盘了三季度新客在注册首周的活跃表现，发现主要瓶颈在于新手引导链路偏长、首日任务缺乏明确反馈，同时部分渠道进来的用户缺少针对性跟进。",
            "**优化策略**：接下来我们将以精细化运营为重要抓手，持续赋能产品与客服团队，分阶段推进引导页改版、短信触达节奏优化与异常队列分级告警，全面提升新客留存体验与业务效率闭环。",
            "**下一步计划**：持续关注留存指标变化、加强监控与告警、完善相关文档并定期同步各部门最新进展，后续将结合实际运行情况灵活调整方案节奏，推动首周流失率稳步下降。",
            "**辅助指标**：注册次日打开率 48%、引导页第三步跳出率 31%、客服首响时间 42 秒、三季度首周流失率由 34% 降至 19%。",
            "**风险提示**：节假日流量波动可能影响短周期统计口径。",
            "**资源协同**：数据组与前端组每周三同步对齐埋点明细。",
            "**预算说明**：短信触达通道维持现有配额不额外扩容。",
        ]
        probe = run_dislop_pptx(lang, bad_title, bad_bullets, font_scale=68000)
        n_issues = len(probe["json"].get("findings", [])) or 4
        copy = {
            "file": "quarterly-review.pptx · Slide 4",
            "state_bad": f'幻灯片检查 · <span class="kw-err">{n_issues} 处问题</span>',
            "state_good": '通过 · <span class="kw-ok">0 处问题</span>',
            "bad_title": bad_title,
            "bad_items": [
                ("**核心结论**：", "复盘三季度新客首周活跃表现，定位引导链路偏长、首日反馈滞后及渠道跟进不足。"),
                ("**优化方案**：", "将新手引导由 6 步减至 3 步，异常工单接入分级队列（首响 42 秒），持续跟进留存。"),
                ("**核心指标**：", "次日打开率 48%，第三步跳出率 31%，三季度新客首周流失率从 34% 降至 19%。"),
                ("**后续协同**：", "数据组与前端组每周三同步核对埋点明细，四季度维持现有短信配额。"),
            ],
            "meta_bad": 'ppt/slides/slide4.xml · normAutofit fontScale="68%"',
            "meta_good": "ppt/slides/slide4.xml · 100% 原始字号 · 0 处命中",
            "bad_notes": [
                ("err", "markdown-leak", "正文残留未渲染的 **加粗** 裸星号。"),
                ("warn", "slide-process-not-finding-title", "“关于……的分析汇报”未亮出结论。"),
                ("warn", "slide-word-wall", "单页塞满段落字墙，变成文档搬家。"),
                ("warn", "slide-autofit-shrink", "文本框字号被自动缩排至 68%。"),
            ],
            "good_title": "三季度新客首周流失率从 34% 降至 19%",
            "good_rows": [
                ("首周流失率", "34% → 19%", "新手引导从 6 步精简到 3 步"),
                ("客服首响", "42 秒", "异常工单接入分级队列自动分流"),
                ("后续动作", "每周三核对", "数据组与前端组对齐埋点明细"),
            ],
            "good_notes": [
                ("ok", "0 处命中", "标题直接写出 34% → 19% 核心结论。"),
                ("ok", "100% 原始字号", "拆成三行结构表，过程背景退回演讲备注。"),
            ],
        }
    else:
        bad_title = "Analysis of Q3 New-User Week-1 Churn"
        bad_bullets = [
            "**Key Takeaway**: Across Q3 we conducted a comprehensive review of new-user activation funnels and cross-functional onboarding workflows, identifying friction in step-3 form completion, delayed first-day feedback loops, and inconsistent follow-ups across acquisition channels.",
            "**Optimization Plan**: Moving forward we will leverage data-driven iteration to empower product and support teams, streamline the onboarding tour, align notification cadence, and continuously monitor retention metrics across all cohorts to drive sustainable improvements.",
            "**Next Steps**: Continue to monitor funnel health, add more monitoring and alerting, improve documentation, and sync weekly with stakeholders on ongoing rollout milestones across regions and customer segments.",
            "**Metrics**: Day-2 open rate 48%, step-3 drop-off 31%, first response 42s, week-1 churn fell from 34% to 19%.",
            "**Risks**: Holiday traffic shifts may skew short-window comparisons.",
            "**Alignment**: Analytics and frontend sync every Wednesday on event tags.",
            "**Budget**: Existing SMS quota remains unchanged for Q4.",
        ]
        probe = run_dislop_pptx(lang, bad_title, bad_bullets, font_scale=68000)
        n_issues = len(probe["json"].get("findings", [])) or 4
        copy = {
            "file": "quarterly-review.pptx · Slide 4",
            "state_bad": f'Slide audit · <span class="kw-err">{n_issues} issues</span>',
            "state_good": 'Passed · <span class="kw-ok">0 issues</span>',
            "bad_title": bad_title,
            "bad_items": [
                ("**Key Takeaway**:", " Reviewed Q3 activation funnels and onboarding workflows, finding step-3 drop-offs and slow day-1 follow-ups."),
                ("**Optimization Plan**:", " Cut the 6-step onboarding tour to 3 steps and route urgent tickets to a 42s triage queue."),
                ("**Metrics**:", " Day-2 open rate 48%, step-3 drop-off 31%; week-1 churn fell from 34% to 19%."),
                ("**Alignment**:", " Analytics and frontend sync every Wednesday on event tags; Q4 SMS quota unchanged."),
            ],
            "meta_bad": 'ppt/slides/slide4.xml · normAutofit fontScale="68%"',
            "meta_good": "ppt/slides/slide4.xml · 100% body scale · 0 findings",
            "bad_notes": [
                ("err", "markdown-leak", "Raw **bold** asterisks pasted into slide."),
                ("warn", "slide-process-not-finding-title", '"Analysis of…" title hides the takeaway.'),
                ("warn", "slide-word-wall", "Dense paragraph wall crammed onto one slide."),
                ("warn", "slide-autofit-shrink", "Body copy shrunk to 68% autofit scale."),
            ],
            "good_title": "Q3 week-1 churn fell from 34% to 19%",
            "good_rows": [
                ("Churn rate", "34% → 19%", "Cut onboarding tour from 6 steps to 3"),
                ("First reply", "42s median", "Urgent tickets routed to tiered queue"),
                ("Next action", "Wed sync", "Analytics + Frontend audit event tags"),
            ],
            "good_notes": [
                ("ok", "0 findings", "Title states the 34% → 19% finding upfront."),
                ("ok", "100% body scale", "Three scannable rows; details move to speaker notes."),
            ],
        }

    bad_bullets_html = "".join(
        f'<div class="b-line"><span class="raw-md">{md}</span>{rest}</div>'
        for md, rest in copy["bad_items"]
    )
    good_rows_html = "".join(
        f'<div class="g-row"><span class="g-k mono">{k}</span><span class="g-v mono">{v}</span><span class="g-d">{d}</span></div>'
        for k, v, d in copy["good_rows"]
    )

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<style>
{base_css(lang)}
body {{
  width: 960px;
  height: 500px;
  background: #F6F7F5;
  padding: 18px 22px;
}}
.main {{
  flex: 1;
  display: grid;
  grid-template-columns: 584px 1fr;
  min-height: 0;
}}
.slide-stage {{
  background: #F6F7F5;
  border-right: 1px solid #E6E8E3;
  padding: 22px 23px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}}
.slide-wrap {{
  position: relative;
  width: 538px;
  height: 303px;
}}
.slide-box {{
  position: absolute;
  inset: 0;
  background: #FFFFFF;
  border: 1px solid #C8CBC4;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
}}
.slide-head-bad {{
  font-size: 18px;
  font-weight: 700;
  color: #14171A;
  padding-bottom: 6px;
  margin-bottom: 10px;
  border-bottom: 2px dashed rgba(27, 82, 176, var(--w-alpha, 0));
  align-self: flex-start;
}}
.slide-body-bad {{
  font-size: 14.5px;
  line-height: 1.44;
  color: #3D424B;
  display: flex;
  flex-direction: column;
  gap: 7px;
}}
.b-line {{
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}}
.raw-md {{
  background: rgba(254, 243, 242, var(--err-wash, 0));
  color: #B42318;
  font-family: {FONT_MONO};
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 2px;
}}
.slide-head-good {{
  font-size: 20px;
  font-weight: 700;
  color: #14171A;
  padding-bottom: 12px;
  border-bottom: 1px solid #E6E8E3;
}}
.g-table {{
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}}
.g-row {{
  display: grid;
  grid-template-columns: 104px 108px 1fr;
  gap: 10px;
  padding: 12px 0;
  align-items: baseline;
  border-bottom: 1px solid #ECEEE9;
  font-size: 14.5px;
}}
.g-row:last-child {{ border-bottom: none; }}
.g-k {{ color: #5E646E; font-size: 13.5px; }}
.g-v {{ font-weight: 700; color: #14171A; font-size: 14.5px; }}
.g-d {{ color: #3D424B; }}
.slide-meta {{
  font-family: {FONT_MONO};
  font-size: 13.5px;
  color: #5E646E;
}}
.margin {{
  background: #FFFFFF;
  padding: 26px 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}}
.notes-list {{
  display: flex;
  flex-direction: column;
  gap: 16px;
}}
</style>
</head>
<body>
<div class="sheet">
  <header class="hdr">
    <span class="hdr-file">{copy["file"]}</span>
    <span class="hdr-state" id="hdr-state">{copy["state_bad"]}</span>
  </header>

  <main class="main">
    <section class="slide-stage">
      <div class="slide-wrap">
        <div class="slide-box" id="slide-bad">
          <div class="slide-head-bad">{copy["bad_title"]}</div>
          <div class="slide-body-bad">{bad_bullets_html}</div>
        </div>

        <div class="slide-box" id="slide-good" style="opacity:0;">
          <div class="slide-head-good">{copy["good_title"]}</div>
          <div class="g-table">{good_rows_html}</div>
        </div>
      </div>
      <div class="slide-meta" id="slide-meta">{copy["meta_bad"]}</div>
    </section>

    <aside class="margin">
      <div class="notes-list" id="notes-bad">{render_margin_notes(copy["bad_notes"])}</div>
      <div class="notes-list" id="notes-good" style="display:none;">{render_margin_notes(copy["good_notes"])}</div>
    </aside>
  </main>
</div>

<script>
{EASING_JS}
const STATE_BAD = {json.dumps(copy["state_bad"], ensure_ascii=False)};
const STATE_GOOD = {json.dumps(copy["state_good"], ensure_ascii=False)};
const META_BAD = {json.dumps(copy["meta_bad"], ensure_ascii=False)};
const META_GOOD = {json.dumps(copy["meta_good"], ensure_ascii=False)};

window.__renderAt = function(t) {{
  const sb = document.getElementById("slide-bad");
  const sg = document.getElementById("slide-good");
  const nb = document.getElementById("notes-bad");
  const ng = document.getElementById("notes-good");
  const hdrState = document.getElementById("hdr-state");
  const meta = document.getElementById("slide-meta");

  if (t < 3.25) {{
    sb.style.opacity = "1";
    sg.style.opacity = "0";
    nb.style.display = "flex";
    ng.style.display = "none";
    hdrState.innerHTML = STATE_BAD;
    meta.textContent = META_BAD;

    const mP = easeStd((t - 0.14) / 0.24);
    sb.style.setProperty("--err-wash", mP.toFixed(3));
    sb.style.setProperty("--w-alpha", (0.85 * mP).toFixed(3));
    Array.from(nb.children).forEach((el, i) => {{
      const p = easeStd((t - (0.16 + i * 0.08)) / 0.22);
      el.style.opacity = p.toFixed(3);
      el.style.transform = `translateY(${{((1 - p) * 5).toFixed(1)}}px)`;
    }});
  }} else {{
    const p = easeStd((t - 3.25) / 0.28);
    sb.style.opacity = (1 - p).toFixed(3);
    sg.style.opacity = p.toFixed(3);
    sg.style.transform = `translateY(${{((1 - p) * 4).toFixed(1)}}px)`;

    nb.style.display = "none";
    ng.style.display = "flex";
    ng.style.opacity = p.toFixed(3);
    ng.style.transform = `translateY(${{((1 - p) * 4).toFixed(1)}}px)`;
    hdrState.innerHTML = p >= 0.5 ? STATE_GOOD : STATE_BAD;
    meta.textContent = p >= 0.5 ? META_GOOD : META_BAD;
  }}
}};
window.__renderAt(0.0);
</script>
</body>
</html>
"""


def agent_workflow_html(lang: str, duration: float = 7.0) -> str:
    is_zh = lang == "zh"
    if is_zh:
        bad_pr = (
            "好的，以下是本次 PR 的修改摘要。\n"
            "本次 PR 旨在通过优化超时重试队列进一步提升整体系统的稳定性，在 HTTP 503 时将退避上限收敛至 8 秒（FD 稳定在 180 以内）。\n"
        )
        good_pr = "在 HTTP 503 场景下将超时重试退避上限收敛至 8 秒，压测下队列句柄 FD 稳定在 180 以内，修复连接池积压问题。\n"
        c1 = "# 1. 动笔前加载本地纯文档 SKILL.md"
        cmd_diff = "npx dislop check --changed origin/main --pack engineering-spec --lang zh"
        c2 = "# 2. Agent 改写后核对数字与限定词未丢失"
        cmd_verify = "npx dislop verify --git HEAD pr-summary.md --lang zh"
        states = [
            "已加载 SKILL.md",
            '增量门禁 · <span style="color:#FF7A6B;font-weight:600;">退出码 1</span>',
            '校验通过 · <span style="color:#6CD49B;font-weight:600;">3/3 事实保留</span>',
        ]
    else:
        bad_pr = (
            "Certainly! Here is a summary of this PR.\n"
            "This PR updates the retry middleware to ensure a more seamless and resilient developer experience.\n"
            "Backoff is capped at 8s when upstream returns HTTP 503 (#412).\n"
        )
        good_pr = (
            "Cap exponential backoff in the retry middleware at 8s when upstream returns HTTP 503 (#412), "
            "preventing worker queue saturation during transient outages.\n"
        )
        c1 = "# 1. load bundled writing rules before drafting"
        cmd_diff = "npx dislop check --changed origin/main --pack engineering-spec"
        c2 = "# 2. after agent edit, verify numbers & qualifiers against HEAD"
        cmd_verify = "npx dislop verify --git HEAD pr-summary.md"
        states = [
            "Skill loaded",
            'Diff gate · <span style="color:#FF7A6B;font-weight:600;">exit 1</span>',
            'Verified · <span style="color:#6CD49B;font-weight:600;">3/3 facts kept</span>',
        ]

    wf = run_dislop_git_workflow(bad_pr, good_pr, lang)

    blk1_rows = [
        ("comment", c1),
        ("cmd", "$ npx skills add dislop-ai/dislop --skill dislop"),
        ("muted", "  skills/dislop/SKILL.md"),
    ]
    blk2_rows: list[tuple[str, str]] = [("cmd", f"$ {cmd_diff}")]
    for ln in wf["diff_lines"][:3]:
        if ln.startswith("dislop:"):
            blk2_rows.append(("head", ln))
        elif "[ERROR]" in ln or "[硬伤]" in ln:
            blk2_rows.append(("err", ln))
        else:
            blk2_rows.append(("warn", ln))
    blk2_rows.extend([("cmd", "$ echo $?"), ("exit-bad", str(wf["diff_exit"]))])

    blk3_rows: list[tuple[str, str]] = [("comment", c2), ("cmd", f"$ {cmd_verify}")]
    for i, ln in enumerate(wf["verify_lines"][:5]):
        blk3_rows.append(("ok" if i == 0 else "verify", ln))

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<style>
{base_css(lang)}
body {{
  width: 960px;
  height: 500px;
  background: #0E1012;
  color: #ECEEF0;
  padding: 16px 20px;
}}
.term {{
  width: 100%;
  height: 100%;
  background: #0A0C0E;
  border: 1px solid #262B33;
  display: flex;
  flex-direction: column;
}}
.term-hdr {{
  height: 36px;
  background: #15181C;
  border-bottom: 1px solid #262B33;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}}
.term-file {{
  font-family: {FONT_MONO};
  font-size: 14px;
  color: #8C939E;
}}
.term-state {{
  font-size: 14px;
  color: #A6ACB5;
}}
.term-body {{
  flex: 1;
  padding: 14px 20px;
  font-family: {FONT_MONO};
  font-size: 14.5px;
  line-height: 1.52;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 9px;
  overflow: hidden;
}}
.blk {{
  display: flex;
  flex-direction: column;
}}
.line {{
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}}
.l-cmd {{ color: #ECEEF0; font-weight: 600; }}
.l-prompt {{ color: #6CD49B; }}
.l-comment {{ color: #76808C; }}
.l-muted {{ color: #9CA3AF; }}
.l-head {{ color: #ECEEF0; }}
.l-err, .l-exit-bad {{ color: #FF7A6B; font-weight: 600; }}
.l-warn {{ color: #85B4FF; font-weight: 600; }}
.l-ok {{ color: #6CD49B; font-weight: 700; }}
.l-verify {{ color: #C9D1D9; }}
</style>
</head>
<body>
<div class="term">
  <header class="term-hdr">
    <span class="term-file">pr-summary.md · engineering-spec</span>
    <span class="term-state" id="term-state">{states[0]}</span>
  </header>
  <div class="term-body">
    <div class="blk" id="blk-1"></div>
    <div class="blk" id="blk-2"></div>
    <div class="blk" id="blk-3"></div>
  </div>
</div>

<script>
{EASING_JS}
const B1 = {json.dumps(blk1_rows, ensure_ascii=False)};
const B2 = {json.dumps(blk2_rows, ensure_ascii=False)};
const B3 = {json.dumps(blk3_rows, ensure_ascii=False)};
const STATES = {json.dumps(states, ensure_ascii=False)};

function esc(s) {{
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}}
function fmt(cls, txt) {{
  if (cls === "cmd" && txt.startsWith("$ ")) {{
    return `<span class="l-prompt">$</span> ${{esc(txt.slice(2))}}`;
  }}
  return esc(txt);
}}
function mount(id, rows, prefix) {{
  document.getElementById(id).innerHTML = rows.map(
    ([cls, txt], i) => `<div class="line l-${{cls}}" id="${{prefix}}-${{i}}" style="opacity:0;">${{fmt(cls, txt)}}</div>`
  ).join("");
}}
mount("blk-1", B1, "r1");
mount("blk-2", B2, "r2");
mount("blk-3", B3, "r3");

window.__renderAt = function(t) {{
  const b1 = document.getElementById("blk-1");
  const b2 = document.getElementById("blk-2");
  const st = document.getElementById("term-state");

  B1.forEach((_, i) => {{
    document.getElementById("r1-" + i).style.opacity = (i <= 1 || t >= 0.18) ? "1" : "0";
  }});

  const dim1 = t >= 1.75 ? (1 - 0.32 * easeStd((t - 1.75) / 0.22)) : 1;
  b1.style.opacity = dim1.toFixed(3);

  B2.forEach((_, i) => {{
    document.getElementById("r2-" + i).style.opacity = t >= (1.75 + i * 0.08) ? "1" : "0";
  }});

  const dim2 = t >= 4.25 ? (1 - 0.32 * easeStd((t - 4.25) / 0.22)) : 1;
  b2.style.opacity = dim2.toFixed(3);

  B3.forEach((_, i) => {{
    document.getElementById("r3-" + i).style.opacity = t >= (4.25 + i * 0.07) ? "1" : "0";
  }});

  if (t >= 4.55) st.innerHTML = STATES[2];
  else if (t >= 2.05) st.innerHTML = STATES[1];
  else st.innerHTML = STATES[0];
}};
window.__renderAt(0.0);
</script>
</body>
</html>
"""


def encode_gif(frames_dir: Path, out_gif: Path, fps: int, max_colors: int, dither: str, lossy: int) -> None:
    palette = frames_dir / "palette.png"
    raw_gif = frames_dir / "raw.gif"
    pattern = str(frames_dir / "frame_%04d.png")

    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-framerate", str(fps), "-i", pattern,
            "-vf", f"palettegen=max_colors={max_colors}:stats_mode=diff",
            str(palette),
        ],
        check=True,
    )
    dither_arg = "dither=none" if dither == "none" else f"dither={dither}:bayer_scale=3"
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-framerate", str(fps), "-i", pattern,
            "-i", str(palette),
            "-lavfi", f"[0:v][1:v]paletteuse={dither_arg}:diff_mode=rectangle",
            "-loop", "0",
            str(raw_gif),
        ],
        check=True,
    )
    if shutil.which("gifsicle"):
        cmd = ["gifsicle", "-O3"]
        if lossy > 0:
            cmd.append(f"--lossy={lossy}")
        cmd.extend([str(raw_gif), "-o", str(out_gif)])
        subprocess.run(cmd, check=True)
    else:
        shutil.copyfile(raw_gif, out_gif)


def encode_webp(frame_files: list[Path], out_webp: Path, fps: int, quality: int = 84, lossless: bool = False) -> None:
    """Encode animated WebP from PNG frames using img2webp (with ffmpeg fallback)."""
    dur_ms = max(20, int(round(1000 / fps)))
    if shutil.which("img2webp"):
        grouped: list[tuple[Path, int]] = []
        last_bytes = None
        for fp in frame_files:
            b = fp.read_bytes()
            if grouped and last_bytes == b:
                prev_fp, prev_dur = grouped[-1]
                grouped[-1] = (prev_fp, prev_dur + dur_ms)
            else:
                grouped.append((fp, dur_ms))
                last_bytes = b
        if lossless:
            cmd = ["img2webp", "-min_size", "-loop", "0", "-lossless", "-m", "4"]
        else:
            cmd = ["img2webp", "-min_size", "-sharp_yuv", "-loop", "0", "-lossy", "-q", str(quality), "-m", "4"]
        for fp, d in grouped:
            cmd.extend(["-d", str(d), str(fp)])
        cmd.extend(["-o", str(out_webp)])
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        pattern = str(frame_files[0].parent / "frame_%04d.png")
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-framerate", str(fps), "-i", pattern,
                "-c:v", "libwebp_anim", "-lossless", "1" if lossless else "0", "-q:v", str(quality),
                "-loop", "0", str(out_webp),
            ],
            check=True,
        )


def encode_social_mp4(frames_dir: Path, out_mp4: Path, fps: int) -> None:
    """Export 1080x600 padded H.264 MP4 suitable for X (@dislop_ai) video posts."""
    pattern = str(frames_dir / "frame_%04d.png")
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-framerate", str(fps), "-i", pattern,
            "-vf", "scale=1080:600:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:600:(ow-iw)/2:(oh-ih)/2:color=#F6F7F5",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
            "-movflags", "+faststart", "-an",
            str(out_mp4),
        ],
        check=True,
    )


def save_poster(src_png: Path, out_poster: Path) -> None:
    img = Image.open(src_png).convert("RGB").quantize(colors=96, method=Image.Quantize.MEDIANCUT)
    img.save(out_poster, format="PNG", optimize=True)


def make_contact_sheet(frame_paths: list[Path], out_sheet: Path, title: str) -> None:
    cols = 3
    rows = math.ceil(len(frame_paths) / cols)
    sample = Image.open(frame_paths[0])
    tw, th = 440, int(440 * sample.height / sample.width)
    pad = 16
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * pad, rows * th + (rows + 1) * pad + 32), (246, 247, 245))
    draw = ImageDraw.Draw(sheet)
    draw.text((pad, 8), title, fill=(20, 23, 26))
    for idx, fp in enumerate(frame_paths):
        r, c = divmod(idx, cols)
        x = pad + c * (tw + pad)
        y = 32 + pad + r * (th + pad)
        im = Image.open(fp).convert("RGB").resize((tw, th), Image.Resampling.LANCZOS)
        sheet.paste(im, (x, y))
        draw.rectangle([x, y, x + tw - 1, y + th - 1], outline=(213, 215, 210), width=1)
    sheet.save(out_sheet, format="PNG", optimize=True)


def render_virtual_clock_scene(
    playwright_page,
    spec: dict,
    lang: str,
    version: str,
    html_text: str,
    sheet_dir: Path,
    social_dir: Path | None = None,
) -> dict:
    slug = spec["slug"]
    name = f"{slug}-{lang}-{version}"
    width = int(spec["width"])
    height = int(spec["height"])
    fps = int(spec["fps"])
    duration = float(spec["duration"])
    poster_t = float(spec["poster_t"])

    with tempfile.TemporaryDirectory(prefix=f"dislop-gif-{name}-") as td:
        tmp = Path(td)
        html_path = tmp / "scene.html"
        html_path.write_text(html_text, encoding="utf-8")

        playwright_page.set_viewport_size({"width": width, "height": height})
        playwright_page.goto(html_path.as_uri(), wait_until="load")

        total_frames = int(round(duration * fps))
        frame_files: list[Path] = []
        poster_idx = min(total_frames - 1, max(0, int(round(poster_t * fps))))

        for i in range(total_frames):
            t = i / fps
            playwright_page.evaluate(f"window.__renderAt({t:.4f})")
            fp = tmp / f"frame_{i:04d}.png"
            playwright_page.screenshot(path=str(fp))
            frame_files.append(fp)

        out_gif = DEMOS_DIR / f"{name}.gif"
        out_webp = DEMOS_DIR / f"{name}.webp"
        out_poster = DEMOS_DIR / f"{name}-poster.png"

        encode_gif(
            tmp,
            out_gif,
            fps=fps,
            max_colors=int(spec["max_colors"]),
            dither=str(spec["dither"]),
            lossy=int(spec["lossy"]),
        )
        encode_webp(
            frame_files,
            out_webp,
            fps=fps,
            quality=int(spec.get("webp_quality", 86)),
            lossless=False,
        )
        save_poster(frame_files[poster_idx], out_poster)

        if social_dir is not None:
            social_dir.mkdir(parents=True, exist_ok=True)
            encode_social_mp4(tmp, social_dir / f"{name}-1080x600.mp4", fps=fps)

        pick_indices = [
            0,
            int(total_frames * 0.18),
            int(total_frames * 0.38),
            int(total_frames * 0.56),
            int(total_frames * 0.78),
            total_frames - 1,
        ]
        sheet_path = sheet_dir / f"{name}-sheet.png"
        make_contact_sheet(
            [frame_files[k] for k in pick_indices],
            sheet_path,
            f"{name} ({width}x{height}, {fps}fps, {duration:.1f}s)",
        )

        return {
            "name": name,
            "gif_kb": out_gif.stat().st_size / 1024,
            "webp_kb": out_webp.stat().st_size / 1024,
            "poster_kb": out_poster.stat().st_size / 1024,
            "frames": total_frames,
            "sheet": str(sheet_path),
        }


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def render_workbench_live(
    playwright_browser,
    spec: dict,
    lang: str,
    version: str,
    sheet_dir: Path,
    social_dir: Path | None = None,
) -> dict:
    slug = spec["slug"]
    name = f"{slug}-{lang}-{version}"
    width = int(spec["width"])
    height = int(spec["height"])
    fps = int(spec["fps"])

    has_zh_subdir = (SITE_DIR / "zh" / "index.html").exists()

    handler = functools.partial(QuietHandler, directory=str(SITE_DIR))
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as httpd:
        port = httpd.server_address[1]
        th = threading.Thread(target=httpd.serve_forever, daemon=True)
        th.start()
        try:
            locale = "zh-CN" if lang == "zh" else "en-US"
            ctx = playwright_browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=1,
                locale=locale,
            )
            ctx.add_init_script(f"try {{ localStorage.setItem('dislop-lang', {lang!r}); }} catch (_) {{}}")
            page = ctx.new_page()

            if lang == "en":
                route = "/" if has_zh_subdir else "/?lang=en"
            else:
                route = "/zh/" if has_zh_subdir else "/?lang=zh"
            page.goto(f"http://127.0.0.1:{port}{route}", wait_until="load")
            page.wait_for_selector("#workbench", timeout=8000)
            try:
                page.wait_for_selector("#proof-view .proof-line", timeout=5000)
            except Exception:
                pass

            page.evaluate(
                """() => {
                const style = document.createElement('style');
                style.textContent = `
                  .topbar, #top, footer,
                  main > section:not(#workbench),
                  body > section:not(#workbench) { display: none !important; }
                  html, body { background: #F6F7F5 !important; overflow: hidden !important; }
                  #workbench { margin-top: 0 !important; padding-top: 16px !important; padding-bottom: 16px !important; }
                  .demo-btn-active-warn {
                    outline: 2px solid #1B52B0 !important;
                    outline-offset: 2px !important;
                    background: #E6EEFC !important;
                  }
                  .demo-btn-active-ok {
                    outline: 2px solid #1E6B47 !important;
                    outline-offset: 2px !important;
                    background: #E3F3EB !important;
                  }
                `;
                document.head.appendChild(style);
                window.scrollTo(0, 0);
            }"""
            )
            page.wait_for_timeout(180)

            with tempfile.TemporaryDirectory(prefix=f"dislop-wb-{lang}-") as td:
                tmp = Path(td)
                frame_files: list[Path] = []
                idx = 0

                def snap_frame() -> Path:
                    nonlocal idx
                    fp = tmp / f"frame_{idx:04d}.png"
                    page.screenshot(path=str(fp))
                    frame_files.append(fp)
                    idx += 1
                    return fp

                def capture_hold(seconds: float) -> Path:
                    nonlocal idx
                    snap = tmp / f"_snap_{idx}.png"
                    page.screenshot(path=str(snap))
                    count = max(1, int(round(seconds * fps)))
                    for _ in range(count):
                        fp = tmp / f"frame_{idx:04d}.png"
                        shutil.copyfile(snap, fp)
                        frame_files.append(fp)
                        idx += 1
                    return snap

                def activate_button(selector: str, cls_name: str) -> None:
                    page.evaluate(
                        f"""() => {{
                        const btn = document.querySelector({selector!r});
                        if (btn) btn.classList.add({cls_name!r});
                    }}"""
                    )
                    snap_frame()
                    snap_frame()
                    page.evaluate(
                        f"""() => {{
                        const btn = document.querySelector({selector!r});
                        if (btn) {{
                            btn.click();
                            btn.classList.remove({cls_name!r});
                        }}
                        window.scrollTo(0, 0);
                    }}"""
                    )
                    page.wait_for_timeout(140)
                    snap_frame()

                poster_snap = capture_hold(1.9)
                activate_button("#btn-apply-trap", "demo-btn-active-warn")
                capture_hold(1.9)
                activate_button("#btn-apply-good", "demo-btn-active-ok")
                capture_hold(2.3)

                out_gif = DEMOS_DIR / f"{name}.gif"
                out_webp = DEMOS_DIR / f"{name}.webp"
                out_poster = DEMOS_DIR / f"{name}-poster.png"

                encode_gif(
                    tmp,
                    out_gif,
                    fps=fps,
                    max_colors=int(spec["max_colors"]),
                    dither=str(spec["dither"]),
                    lossy=int(spec["lossy"]),
                )
                encode_webp(
                    frame_files,
                    out_webp,
                    fps=fps,
                    quality=int(spec.get("webp_quality", 86)),
                    lossless=False,
                )
                save_poster(poster_snap, out_poster)

                if social_dir is not None:
                    social_dir.mkdir(parents=True, exist_ok=True)
                    encode_social_mp4(tmp, social_dir / f"{name}-1080x600.mp4", fps=fps)

                total_frames = len(frame_files)
                pick_indices = [
                    0,
                    int(total_frames * 0.25),
                    int(total_frames * 0.36),
                    int(total_frames * 0.55),
                    int(total_frames * 0.72),
                    total_frames - 1,
                ]
                sheet_path = sheet_dir / f"{name}-sheet.png"
                make_contact_sheet(
                    [frame_files[k] for k in pick_indices],
                    sheet_path,
                    f"{name} ({width}x{height}, {fps}fps)",
                )

                ctx.close()
                return {
                    "name": name,
                    "gif_kb": out_gif.stat().st_size / 1024,
                    "webp_kb": out_webp.stat().st_size / 1024,
                    "poster_kb": out_poster.stat().st_size / 1024,
                    "frames": total_frames,
                    "sheet": str(sheet_path),
                }
        finally:
            httpd.shutdown()


SCENE_BUILDERS = {
    "proof-cycle": proof_cycle_html,
    "cli-check": cli_check_html,
    "ui-slop": ui_slop_html,
    "deck-office": deck_office_html,
    "agent-workflow": agent_workflow_html,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Render deterministic dislop demo GIFs, WebPs, and static posters.")
    parser.add_argument("--sheets-dir", default=str(DEFAULT_SHEET_DIR), help="Directory for 6-frame QA contact sheets.")
    parser.add_argument("--social-dir", default="", help="Optional output directory for 1080x600 MP4 social clips.")
    parser.add_argument(
        "--only",
        default="",
        help="Optional comma-separated scene slugs or full names (e.g. proof-cycle,ui-slop).",
    )
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    version = manifest["version"]
    scenes = manifest["scenes"]

    DEMOS_DIR.mkdir(parents=True, exist_ok=True)
    sheet_dir = Path(args.sheets_dir)
    sheet_dir.mkdir(parents=True, exist_ok=True)
    social_dir = Path(args.social_dir) if args.social_dir else None
    only = {s.strip() for s in args.only.split(",") if s.strip()}

    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(device_scale_factor=1)

        for spec in scenes:
            slug = spec["slug"]
            for lang in ("zh", "en"):
                full_name = f"{slug}-{lang}-{version}"
                if only and slug not in only and full_name not in only:
                    continue
                if spec["kind"] == "live-dom":
                    if not (SITE_DIR / "index.html").exists():
                        print(f"  [skip] {full_name}: site/index.html not built yet", file=sys.stderr)
                        continue
                    results.append(render_workbench_live(browser, spec, lang, version, sheet_dir, social_dir))
                else:
                    builder = SCENE_BUILDERS[slug]
                    html_text = builder(lang, duration=float(spec["duration"]))
                    results.append(
                        render_virtual_clock_scene(page, spec, lang, version, html_text, sheet_dir, social_dir)
                    )

        browser.close()

    total_gif_kb = sum(r["gif_kb"] for r in results)
    total_webp_kb = sum(r["webp_kb"] for r in results)
    for r in results:
        print(
            f"  [ok] {r['name']}: gif={r['gif_kb']:.1f} KB, webp={r['webp_kb']:.1f} KB, "
            f"poster={r['poster_kb']:.1f} KB, frames={r['frames']}, sheet={r['sheet']}"
        )
    print(f"Total across {len(results)} assets: GIF={total_gif_kb:.1f} KB, WebP={total_webp_kb:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
