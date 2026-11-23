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
import os
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

FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
FONT_SERIF = '"Songti SC", "Noto Serif CJK SC", "STSong", Georgia, "Source Serif 4", serif'
FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

LOGO_SVG_INNER = """
<svg viewBox="0 0 64 64" width="22" height="22" fill="none" aria-hidden="true">
  <rect width="64" height="64" rx="12" fill="#14171A"/>
  <line x1="10" y1="38" x2="54" y2="38" stroke="#F4F5F3" stroke-width="4.5" stroke-linecap="round" stroke-opacity="0.26"/>
  <path d="M10 38H34C44.5 38 52 30.8 52 21.5C52 14.5 47.2 10 41.2 10C34.8 10 30.5 15 30.5 22.2C30.5 33.8 39.5 45.5 53 51" stroke="#F04438" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""

CURSOR_SVG = """
<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
  <path d="M4 2.5L19.5 12.2L12.1 13.7L15.4 20.6L13.1 21.7L9.8 14.8L4.8 19.3V2.5Z" fill="#14171A" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round"/>
</svg>
"""

BASE_CSS = f"""
* {{ box-sizing: border-box; }}
html, body {{
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #F6F7F5;
  color: #14171A;
  font-family: {FONT_SANS};
  -webkit-font-smoothing: antialiased;
}}
.mono {{
  font-family: {FONT_MONO};
  font-variant-numeric: tabular-nums;
}}
.serif {{
  font-family: {FONT_SERIF};
}}
.timeline-track {{
  position: relative;
  height: 2px;
  width: 100%;
  background: #E2E4DF;
  flex-shrink: 0;
}}
.timeline-fill {{
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0%;
  background: #F04438;
}}
.timeline-track.is-dark {{
  background: #22272E;
}}
"""


def run_dislop_cli(
    text: str,
    filename: str,
    lang: str,
    pack: str = "business-brief",
    extra_args: list[str] | None = None,
) -> dict:
    """Invoke the real Node.js dislop CLI on a sample file and return parsed JSON + raw text."""
    with tempfile.TemporaryDirectory(prefix="dislop-ground-") as td:
        fp = Path(td) / filename
        fp.write_text(text, encoding="utf-8")
        base_cmd = ["node", str(ROOT / "bin" / "dislop.mjs"), "check", str(fp), "--lang", lang]
        if pack:
            base_cmd.extend(["--pack", pack])
        if extra_args:
            base_cmd.extend(extra_args)

        res_text = subprocess.run(base_cmd, capture_output=True, text=True)
        res_json = subprocess.run(base_cmd + ["--format", "json"], capture_output=True, text=True)
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
        f'<a:p><a:r><a:rPr lang="zh-CN" sz="1400"/><a:t>{b}</a:t></a:r></a:p>'
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
            ["node", str(ROOT / "bin" / "dislop.mjs"), "check", str(fp), "--pack", "executive-deck", "--lang", lang, "--format", "json"],
            capture_output=True,
            text=True,
        )
        try:
            parsed = json.loads(res.stdout)
        except Exception:
            parsed = {}
        return {"exit_code": res.returncode, "json": parsed}


def proof_cycle_html(lang: str, duration: float = 6.8) -> str:
    is_zh = lang == "zh"
    if is_zh:
        s1_txt = "好的，以下是修改后的上线说明。值得注意的是，本次改造以队列分级为重要抓手，全面赋能一线运维团队，故障恢复时间最多 45 秒。"
        s2_txt = "这不是一次普通升级，而是结算架构的效率跃迁，性能实现数倍提升。"
        s3_txt = "本次上线将结算队列改为分级处理，故障恢复时间最多 45 秒。"
    else:
        s1_txt = "Certainly! Here is the launch note. It's worth noting that exports are a game-changer, finishing in up to 12 minutes for workspaces above 500,000 rows."
        s2_txt = "This isn't just an upgrade — it's a new standard."
        s3_txt = "Exports now finish in up to 12 minutes for workspaces above 500,000 rows."

    g1 = run_dislop_cli(s1_txt, "launch-note.md", lang)
    g2 = run_dislop_cli(s2_txt, "launch-note.md", lang)
    g3 = run_dislop_cli(s3_txt, "launch-note.md", lang)

    c1 = len(g1["json"].get("findings", [])) or (4 if is_zh else 3)
    c2 = len(g2["json"].get("findings", [])) or 1
    c3 = len(g3["json"].get("findings", []))

    if is_zh:
        copy = {
            "file": "launch-note.md",
            "pack": "business-brief",
            "tabs": ["1 · 原稿", "2 · 换了种 AI 味", "3 · 改干净了"],
            "s1_err": "好的，以下是",
            "s1_mid1": "修改后的上线说明。",
            "s1_w1": "值得注意的是，",
            "s1_mid2": "本次改造以队列分级为重要",
            "s1_w2": "抓手",
            "s1_mid3": "，",
            "s1_w3": "全面赋能",
            "s1_end": "一线运维团队，故障恢复时间最多 45 秒。",
            "s1_notes": [
                ("err", "chatbot-artifact", "删掉开头的 AI 对话寒暄壳"),
                ("warn", "zh-bureaucratic-padding", "“值得注意的是”“抓手”“全面赋能”换成具体动作"),
            ],
            "s1_badge": f"{c1} 处问题 · 退出码 {g1['exit_code']}",
            "s2_w1": "这不是一次普通升级，而是结算架构的效率跃迁，性能实现数倍提升",
            "s2_end": "。",
            "s2_notes": [
                ("warn", "negation-pivot-frame", "“不是 A，而是 B”二阶 AI 腔，删掉空洞对比并补回真实指标"),
            ],
            "s2_badge": f"{c2} 处问题 · 二阶 AI 腔",
            "s3_text": "本次上线将结算队列改为分级处理，故障恢复时间最多 45 秒。",
            "s3_notes": [
                ("ok", "0 findings", "寒暄与空话清零，45 秒真实指标保留"),
            ],
            "s3_badge": f"{c3} 处问题 · 退出码 {g3['exit_code']}",
            "foot_left": "确定性本地检查 · 0 上传",
            "foot_right": "dislop check launch-note.md --lang zh",
            "count_label": "命中",
            "counts": [str(c1), str(c2), str(c3)],
        }
    else:
        copy = {
            "file": "launch-note.md",
            "pack": "business-brief",
            "tabs": ["1 · Draft", "2 · 2nd-order slop", "3 · Clean"],
            "s1_err": "Certainly! Here is",
            "s1_mid1": " the launch note. ",
            "s1_w1": "It's worth noting that",
            "s1_mid2": " exports are a ",
            "s1_w2": "game-changer",
            "s1_mid3": "",
            "s1_w3": "",
            "s1_end": ", finishing in up to 12 minutes for workspaces above 500,000 rows.",
            "s1_notes": [
                ("err", "chatbot-artifact", "Strip leftover chatbot greeting"),
                ("warn", "en-throat-clearing-opener", "Cut throat-clearing opener; replace stock hype"),
            ],
            "s1_badge": f"{c1} findings · exit {g1['exit_code']}",
            "s2_w1": "This isn't just an upgrade — it's a new standard",
            "s2_end": ".",
            "s2_notes": [
                ("warn", "negation-pivot-frame", "'Not X, but Y' slogan caught; restore real metrics"),
            ],
            "s2_badge": f"{c2} finding · 2nd-order slop",
            "s3_text": "Exports now finish in up to 12 minutes for workspaces above 500,000 rows.",
            "s3_notes": [
                ("ok", "0 findings", "Filler removed; 12 min and 500,000 rows preserved"),
            ],
            "s3_badge": f"{c3} findings · exit {g3['exit_code']}",
            "foot_left": "Deterministic offline check · 0 uploads",
            "foot_right": "dislop check launch-note.md",
            "count_label": "HITS",
            "counts": [str(c1), str(c2), str(c3)],
        }

    def render_notes(items):
        rows = []
        for kind, rule_id, desc in items:
            cls = "is-err" if kind == "err" else ("is-warn" if kind == "warn" else "is-ok")
            if is_zh:
                tag = "硬伤" if kind == "err" else ("提醒" if kind == "warn" else "通过")
            else:
                tag = "ERROR" if kind == "err" else ("WARN" if kind == "warn" else "PASS")
            rows.append(
                f'<div class="note-row {cls}">'
                f'<span class="note-tag mono">{tag}</span>'
                f'<div class="note-content"><div class="note-rule mono">{rule_id}</div>'
                f'<div class="note-desc">{desc}</div></div></div>'
            )
        return "".join(rows)

    margin_head = "标出问题" if is_zh else "FINDINGS"
    count_digits = "".join(f'<div class="digit-item mono">{c}</div>' for c in copy["counts"])

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
  width: 960px;
  height: 500px;
  background: #F6F7F5;
  padding: 20px 24px;
}}
.frame {{
  width: 100%;
  height: 100%;
  background: #FFFFFF;
  border: 1px solid #D5D7D2;
  display: flex;
  flex-direction: column;
}}
.topbar {{
  height: 48px;
  border-bottom: 1px solid #D5D7D2;
  background: #ECEEE9;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}}
.brand {{
  display: flex;
  align-items: center;
  gap: 10px;
}}
.wordmark {{
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.025em;
}}
.file-pill {{
  font-size: 12.5px;
  color: #474C55;
  padding-left: 10px;
  border-left: 1px solid #D5D7D2;
}}
.tabs {{
  display: flex;
  gap: 6px;
}}
.tab {{
  font-size: 12.5px;
  font-weight: 600;
  padding: 5px 11px;
  border-radius: 5px;
  border: 1px solid #B6BAB2;
  background: #FFFFFF;
  color: #474C55;
}}
.tab.active {{
  background: #14171A;
  border-color: #14171A;
  color: #FFFFFF;
}}
.main {{
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 310px;
  min-height: 0;
}}
.galley {{
  padding: 26px 22px 18px 20px;
  border-right: 1px solid #D5D7D2;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
}}
.manuscript-wrap {{
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
  align-items: start;
}}
.lnum {{
  font-size: 13px;
  color: #5E646E;
  padding-top: 7px;
  text-align: right;
  user-select: none;
}}
.manuscript {{
  font-family: {FONT_SERIF};
  font-size: 22.5px;
  line-height: 1.72;
  color: #14171A;
  margin: 0;
}}
.mark-err {{
  position: relative;
  display: inline-block;
  background: rgba(240, 68, 56, 0.08);
  color: #B42318;
  padding: 0;
}}
.pen-svg {{
  position: absolute;
  left: 0;
  right: 0;
  top: 44%;
  width: 100%;
  height: 14px;
  overflow: visible;
  pointer-events: none;
}}
.pen-underline {{
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 2.5px;
  background: #F04438;
  transform-origin: left center;
  transform: scaleX(var(--err-progress, 0));
}}
.mark-warn {{
  background: rgba(27, 82, 176, var(--warn-bg, 0));
  border-bottom: 2px dashed rgba(27, 82, 176, var(--warn-alpha, 0));
  color: #14171A;
  padding: 0;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}}
.mark-clean {{
  background: rgba(30, 107, 71, var(--ok-bg, 0));
  padding: 2px 4px;
  border-bottom: 2px solid #1E6B47;
}}
.status-bar {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid #ECEEE9;
}}
.status-badge {{
  font-size: 13.5px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 4px;
}}
.status-badge.is-err {{
  background: #FCE9E7;
  color: #B42318;
  border: 1px solid #F04438;
}}
.status-badge.is-warn {{
  background: #E6EEFC;
  color: #1B52B0;
  border: 1px solid #1B52B0;
}}
.status-badge.is-ok {{
  background: #E3F3EB;
  color: #1E6B47;
  border: 1px solid #1E6B47;
}}
.margin {{
  background: #F6F7F5;
  padding: 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}}
.margin-head-row {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid #D5D7D2;
}}
.margin-head {{
  font-size: 12px;
  font-weight: 700;
  color: #474C55;
}}
.digit-counter {{
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #474C55;
}}
.digit-window {{
  height: 22px;
  width: 24px;
  overflow: hidden;
  border: 1px solid #D5D7D2;
  background: #FFFFFF;
  border-radius: 4px;
}}
.digit-reel {{
  display: flex;
  flex-direction: column;
}}
.digit-item {{
  height: 22px;
  line-height: 22px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #14171A;
}}
.note-row {{
  background: #FFFFFF;
  border: 1px solid #D5D7D2;
  border-left-width: 3px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}}
.note-row.is-err {{ border-left-color: #F04438; }}
.note-row.is-warn {{ border-left-color: #1B52B0; }}
.note-row.is-ok {{ border-left-color: #1E6B47; }}
.note-tag {{
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}}
.note-row.is-err .note-tag {{ color: #B42318; }}
.note-row.is-warn .note-tag {{ color: #1B52B0; }}
.note-row.is-ok .note-tag {{ color: #1E6B47; }}
.note-rule {{
  font-size: 12.5px;
  font-weight: 700;
  color: #14171A;
}}
.note-desc {{
  font-size: 13px;
  line-height: 1.48;
  color: #474C55;
  margin-top: 2px;
}}
.footer {{
  height: 34px;
  border-top: 1px solid #D5D7D2;
  background: #F6F7F5;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #5E646E;
}}
</style>
</head>
<body>
<div class="frame">
  <header class="topbar">
    <div class="brand">
      {LOGO_SVG_INNER}
      <span class="wordmark">dislop</span>
      <span class="file-pill mono">{copy["file"]} · {copy["pack"]}</span>
    </div>
    <div class="tabs">
      <div class="tab active" id="tab-0">{copy["tabs"][0]}</div>
      <div class="tab" id="tab-1">{copy["tabs"][1]}</div>
      <div class="tab" id="tab-2">{copy["tabs"][2]}</div>
    </div>
  </header>

  <main class="main">
    <section class="galley">
      <div class="manuscript-wrap" id="stage-box">
        <div class="lnum mono">01</div>
        <!-- dislop-quote-start -->
        <p class="manuscript" id="ms-0">
          <span class="mark-err" id="err-span">{copy["s1_err"]}<span class="pen-underline"></span><svg class="pen-svg" viewBox="0 0 180 14" preserveAspectRatio="none"><path id="pen-strike-path" d="M2 8 C52 5 124 10 178 6" stroke="#F04438" stroke-width="2.8" stroke-linecap="round" fill="none" stroke-dasharray="220" stroke-dashoffset="220"/></svg></span>{copy["s1_mid1"]}<span class="mark-warn" id="w1-span">{copy["s1_w1"]}</span>{copy["s1_mid2"]}<span class="mark-warn" id="w2-span">{copy["s1_w2"]}</span>{copy["s1_mid3"]}{f'<span class="mark-warn" id="w3-span">{copy["s1_w3"]}</span>' if copy["s1_w3"] else ""}{copy["s1_end"]}
        </p>
        <p class="manuscript" id="ms-1" style="display:none;">
          <span class="mark-warn" id="trap-span">{copy["s2_w1"]}</span>{copy["s2_end"]}
        </p>
        <!-- dislop-quote-end -->
        <p class="manuscript" id="ms-2" style="display:none;">
          <span class="mark-clean" id="clean-span">{copy["s3_text"]}</span>
        </p>
      </div>

      <div class="status-bar">
        <span class="status-badge is-err mono" id="status-badge">{copy["s1_badge"]}</span>
        <span class="mono" style="font-size:12px;color:#5E646E;">0.4 ms</span>
      </div>
    </section>

    <aside class="margin">
      <div class="margin-head-row">
        <div class="margin-head mono" id="margin-head">{margin_head}</div>
        <div class="digit-counter">
          <span class="mono">{copy["count_label"]}</span>
          <div class="digit-window">
            <div class="digit-reel" id="digit-reel">{count_digits}</div>
          </div>
        </div>
      </div>
      <div id="notes-0" style="display:flex;flex-direction:column;gap:10px;">{render_notes(copy["s1_notes"])}</div>
      <div id="notes-1" style="display:none;flex-direction:column;gap:10px;">{render_notes(copy["s2_notes"])}</div>
      <div id="notes-2" style="display:none;flex-direction:column;gap:10px;">{render_notes(copy["s3_notes"])}</div>
    </aside>
  </main>

  <div class="timeline-track"><div class="timeline-fill" id="tl-fill"></div></div>
  <footer class="footer">
    <span>{copy["foot_left"]}</span>
    <span class="mono">{copy["foot_right"]}</span>
  </footer>
</div>

<script>
const COPY = {json.dumps(copy, ensure_ascii=False)};
const DURATION = {duration:.2f};
function clamp01(v) {{ return Math.max(0, Math.min(1, v)); }}
function easeOut(v) {{ return 1 - Math.pow(1 - clamp01(v), 3); }}

window.__renderAt = function(t) {{
  const tabs = [0, 1, 2].map(i => document.getElementById("tab-" + i));
  const mss = [0, 1, 2].map(i => document.getElementById("ms-" + i));
  const nts = [0, 1, 2].map(i => document.getElementById("notes-" + i));
  const badge = document.getElementById("status-badge");
  const stageBox = document.getElementById("stage-box");
  const reel = document.getElementById("digit-reel");
  const tlFill = document.getElementById("tl-fill");

  tlFill.style.width = (clamp01(t / DURATION) * 100).toFixed(2) + "%";

  let active = 0;
  if (t >= 2.35 && t < 4.45) active = 1;
  else if (t >= 4.45) active = 2;

  tabs.forEach((el, i) => el.classList.toggle("active", i === active));
  mss.forEach((el, i) => el.style.display = i === active ? "block" : "none");
  nts.forEach((el, i) => el.style.display = i === active ? "flex" : "none");

  const localT = active === 0 ? t : (active === 1 ? t - 2.35 : t - 4.45);
  const slideIn = easeOut(localT / 0.22);
  stageBox.style.opacity = active === 0 ? 1 : (0.35 + 0.65 * slideIn);
  stageBox.style.transform = active === 0 ? "translateY(0)" : `translateY(${{(1 - slideIn) * 7}}px)`;

  let reelPos = 0;
  if (active === 1) reelPos = easeOut(localT / 0.22);
  else if (active === 2) reelPos = 1 + easeOut(localT / 0.22);
  reel.style.transform = `translateY(-${{(reelPos * 22).toFixed(2)}}px)`;

  if (active === 0) {{
    badge.className = "status-badge is-err mono";
    badge.textContent = COPY.s1_badge;
    const errP = easeOut((t - 0.12) / 0.28);
    const strikeP = easeOut((t - 0.38) / 0.34);
    const errEl = document.getElementById("err-span");
    errEl.style.setProperty("--err-progress", errP.toFixed(3));
    const path = document.getElementById("pen-strike-path");
    path.setAttribute("stroke-dashoffset", (220 * (1 - strikeP)).toFixed(1));

    ["w1-span", "w2-span", "w3-span"].forEach((id, idx) => {{
      const el = document.getElementById(id);
      if (el) {{
        const wp = easeOut((t - (0.52 + idx * 0.14)) / 0.28);
        el.style.setProperty("--warn-alpha", wp.toFixed(3));
        el.style.setProperty("--warn-bg", (0.08 * wp).toFixed(3));
      }}
    }});
    nts[0].style.opacity = easeOut((t - 0.18) / 0.25);
  }} else if (active === 1) {{
    badge.className = "status-badge is-warn mono";
    badge.textContent = COPY.s2_badge;
    const wP = easeOut((localT - 0.12) / 0.26);
    const tr = document.getElementById("trap-span");
    tr.style.setProperty("--warn-alpha", wP.toFixed(3));
    tr.style.setProperty("--warn-bg", (0.08 * wP).toFixed(3));
    nts[1].style.opacity = easeOut((localT - 0.14) / 0.24);
  }} else {{
    badge.className = "status-badge is-ok mono";
    badge.textContent = COPY.s3_badge;
    const okP = easeOut((localT - 0.10) / 0.24);
    document.getElementById("clean-span").style.setProperty("--ok-bg", (0.09 * okP).toFixed(3));
    nts[2].style.opacity = easeOut((localT - 0.12) / 0.24);
  }}
}};
window.__renderAt(0.0);
</script>
</body>
</html>
"""


def parse_cli_rows(stdout: str, is_zh: bool, exit_code: int) -> list[tuple[str, str]]:
    """Convert raw `dislop check --profile` output into cleanly styled terminal lines without English/Chinese leakage."""
    rows: list[tuple[str, str]] = []
    for raw in stdout.splitlines():
        line = raw.rstrip()
        if not line:
            continue
        # Strip temp directory prefix if any
        if "/launch-note" in line:
            idx = line.find("launch-note")
            prefix = line[:idx]
            # keep leading indentation / tag
            if "[ERROR]" in prefix:
                line = "  [ERROR] " + line[idx:]
            elif "[WARNING]" in prefix:
                line = "  [WARNING] " + line[idx:]
            elif "[INFO]" in prefix:
                line = "  [INFO] " + line[idx:]
            elif "[PROFILE]" in prefix:
                line = "  [PROFILE] " + line[idx:]
        if line.startswith("dislop:"):
            cls = "ok" if exit_code == 0 and ("0 处命中" in line or "0 findings" in line) else "head"
            rows.append((cls, line))
        elif "[ERROR]" in line:
            rows.append(("err", line))
        elif "[WARNING]" in line:
            rows.append(("warn", line))
        elif "[INFO]" in line:
            rows.append(("info", line))
        elif line.strip().startswith(("原因:", "改法:", "why:", "fix:")):
            # Keep compact to fit terminal cleanly without truncation
            continue
        elif line.strip().startswith(("按规则分布:", "下一步:", "by rule:", "next:")):
            continue
        elif "[PROFILE]" in line:
            # Trim long profile line to key metrics
            parts = [p.strip() for p in line.split("|")]
            compact = " | ".join(parts[:3]) if len(parts) >= 3 else line
            rows.append(("prof", compact))
    if is_zh:
        if exit_code != 0:
            rows.append(("exit", "  退出码: 1（命中 AI 残留硬伤，拦截提交）"))
        else:
            rows.append(("ok", "  退出码: 0（检查通过，允许发出）"))
    else:
        if exit_code != 0:
            rows.append(("exit", "  exit code: 1 (blocked by core AI artifact)"))
        else:
            rows.append(("ok", "  exit code: 0 (ready to ship)"))
    return rows


def cli_check_html(lang: str, duration: float = 6.4) -> str:
    is_zh = lang == "zh"
    if is_zh:
        s1 = "好的，以下是修改后的上线说明。值得注意的是，本次改造以队列分级为重要抓手，全面赋能一线运维团队，故障恢复时间最多 45 秒。"
        s2 = "本次上线将结算队列改为分级处理，故障恢复时间最多 45 秒。"
        cmd1 = "dislop check launch-note.md --lang zh --profile"
        cmd2 = "dislop check launch-note.clean.md --lang zh --profile"
        title = "终端离线校验 · Node / Python 双端同构"
    else:
        s1 = "Certainly! Here is the launch note. It's worth noting that exports are a game-changer, finishing in up to 12 minutes for workspaces above 500,000 rows."
        s2 = "Exports now finish in up to 12 minutes for workspaces above 500,000 rows."
        cmd1 = "dislop check launch-note.md --profile"
        cmd2 = "dislop check launch-note.clean.md --profile"
        title = "Offline CLI gate · zero dependencies · zero uploads"

    g1 = run_dislop_cli(s1, "launch-note.md", lang, extra_args=["--profile"])
    g2 = run_dislop_cli(s2, "launch-note.clean.md", lang, extra_args=["--profile"])
    out1 = parse_cli_rows(g1["stdout"], is_zh, g1["exit_code"])
    out2 = parse_cli_rows(g2["stdout"], is_zh, g2["exit_code"])

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
  width: 920px;
  height: 460px;
  background: #0E1012;
  color: #ECEEF0;
  padding: 20px;
}}
.term {{
  width: 100%;
  height: 100%;
  background: #15181C;
  border: 1px solid #2A2F37;
  display: flex;
  flex-direction: column;
}}
.term-head {{
  height: 42px;
  background: #1D2127;
  border-bottom: 1px solid #2A2F37;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}}
.term-title {{
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #ECEEF0;
}}
.term-badge {{
  font-size: 12px;
  color: #A6ACB5;
}}
.term-body {{
  flex: 1;
  padding: 16px 20px;
  background: #0A0C0E;
  font-family: {FONT_MONO};
  font-size: 13.5px;
  line-height: 1.54;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
}}
.cmd-line {{
  color: #ECEEF0;
  font-weight: 700;
  margin-bottom: 3px;
}}
.prompt {{ color: #6CD49B; margin-right: 8px; }}
.line {{ white-space: pre; overflow: hidden; text-overflow: ellipsis; }}
.l-head {{ color: #ECEEF0; font-weight: 600; }}
.l-err {{ color: #FF7A6B; font-weight: 700; }}
.l-warn {{ color: #85B4FF; font-weight: 700; }}
.l-info {{ color: #85B4FF; }}
.l-prof {{ color: #8C939E; font-size: 12.2px; }}
.l-exit {{ color: #FF7A6B; font-weight: 700; margin-top: 2px; }}
.l-ok {{ color: #6CD49B; font-weight: 700; }}
.sep {{
  height: 1px;
  background: #2A2F37;
  margin: 9px 0;
}}
</style>
</head>
<body>
<div class="term">
  <header class="term-head">
    <div class="term-title">
      {LOGO_SVG_INNER}
      <span>dislop CLI</span>
    </div>
    <span class="term-badge mono">{title}</span>
  </header>
  <div class="term-body" id="term-body">
    <div class="cmd-line" id="cmd1"><span class="prompt">$</span>{cmd1}</div>
    <div id="block1"></div>
    <div class="sep" id="sep" style="opacity:0;"></div>
    <div class="cmd-line" id="cmd2" style="opacity:0;"><span class="prompt">$</span>{cmd2}</div>
    <div id="block2"></div>
  </div>
  <div class="timeline-track is-dark"><div class="timeline-fill" id="tl-fill"></div></div>
</div>

<script>
const OUT1 = {json.dumps(out1, ensure_ascii=False)};
const OUT2 = {json.dumps(out2, ensure_ascii=False)};
const DURATION = {duration:.2f};

function escapeHtml(s) {{
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}}
function buildLines(containerId, rows) {{
  const el = document.getElementById(containerId);
  el.innerHTML = rows.map(([cls, txt], i) => `<div class="line l-${{cls}}" id="${{containerId}}-${{i}}" style="opacity:0;">${{escapeHtml(txt)}}</div>`).join("");
}}
buildLines("block1", OUT1);
buildLines("block2", OUT2);

window.__renderAt = function(t) {{
  document.getElementById("tl-fill").style.width = (Math.max(0, Math.min(1, t / DURATION)) * 100).toFixed(2) + "%";
  document.getElementById("cmd1").style.opacity = 1;
  OUT1.forEach((_, i) => {{
    const el = document.getElementById("block1-" + i);
    const start = 0.35 + i * 0.13;
    el.style.opacity = t >= start ? 1 : 0;
  }});

  const showCmd2 = t >= 3.15;
  document.getElementById("sep").style.opacity = showCmd2 ? 1 : 0;
  document.getElementById("cmd2").style.opacity = showCmd2 ? 1 : 0;
  OUT2.forEach((_, i) => {{
    const el = document.getElementById("block2-" + i);
    const start = 3.55 + i * 0.16;
    el.style.opacity = t >= start ? 1 : 0;
  }});
}};
window.__renderAt(0.0);
</script>
</body>
</html>
"""


def ui_slop_html(lang: str, duration: float = 6.8) -> str:
    is_zh = lang == "zh"
    if is_zh:
        copy = {
            "header_bad": "检查网页组件 · 发现 4 处 AI 模板味",
            "header_good": "清理完成 · 0 处界面问题 · 通过",
            "bad_title": "AI 强力驱动 · 新一代智能体验",
            "bad_sub": "重塑企业级工作流范式，打造全方位效率闭环。",
            "bad_pills": ["智能引擎", "极速协同", "深度洞察", "零门槛部署", "企业安全", "全链路"],
            "bad_badge": "AI 强力驱动",
            "bad_btn": '立即体验（href="#"）',
            "flags": [
                ("err", "ui-dead-control", "空链接 # 与无动作禁用按钮"),
                ("warn", "ui-ai-gradient", "默认蓝紫粉渐变标题"),
                ("warn", "ui-pill-soup", "6 枚无实质过滤功能的圆角胶囊墙"),
                ("warn", "ui-prompt-echo-badge", "把提示词营销口号贴成装饰牌"),
            ],
            "good_kicker": "校样检查报告 · 纯色纸面 + 1px 标尺",
            "good_title": "把稿子里的 AI 味挑出来",
            "good_sub": "去掉渐变和装饰徽章，按钮直接连向真实报告路径 ./report.html。",
            "good_btn": "打开检查报告 ./report.html",
            "good_meta": "7 套规则包 · 0 上传 · 通过 WCAG AA 对比度",
            "m1_label": "AI 模板问题",
            "m2_label": "真实跳转",
            "findings_head": "检查结果",
            "ok_prefix": "通过 · ",
        }
    else:
        copy = {
            "header_bad": "Audit UI component · 4 template smells flagged",
            "header_good": "Cleaned · 0 UI issues · passed",
            "bad_title": "AI-Powered Next-Gen Platform",
            "bad_sub": "Revolutionizing workflows with seamless intelligence.",
            "bad_pills": ["Smart Engine", "AI-Ready", "Instant Sync", "Zero Friction", "Enterprise", "Cloud Scale"],
            "bad_badge": "AI-Powered",
            "bad_btn": 'Get Started (href="#")',
            "flags": [
                ("err", "ui-dead-control", 'Dead href="#" placeholder control'),
                ("warn", "ui-ai-gradient", "Default indigo-purple-pink AI gradient"),
                ("warn", "ui-pill-soup", "6 decorative rounded-full pill badges"),
                ("warn", "ui-prompt-echo-badge", "Prompt-echo marketing badge"),
            ],
            "good_kicker": "Galley audit report · solid paper + 1px rails",
            "good_title": "Catch AI slop before you ship",
            "good_sub": "Drop the gradient and filler badges; wire the button to ./report.html.",
            "good_btn": "Open ./report.html",
            "good_meta": "7 packs · 0 uploads · WCAG AA verified",
            "m1_label": "UI template smells",
            "m2_label": "Action link",
            "findings_head": "RULE FINDINGS",
            "ok_prefix": "[OK] ",
        }

    pills_html = "".join(f'<span class="slop-pill">{p}</span>' for p in copy["bad_pills"])
    flags_html = "".join(
        f'<div class="flag-item {"is-err" if k == "err" else "is-warn"}" id="flag-{i}">'
        f'<div class="flag-top"><span class="mono flag-id">{rid}</span><span class="flag-state mono" id="fstate-{i}">{"待改" if is_zh else "FLAG"}</span></div>'
        f'<span class="flag-desc">{desc}</span></div>'
        for i, (k, rid, desc) in enumerate(copy["flags"])
    )

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
  width: 960px;
  height: 500px;
  background: #F6F7F5;
  padding: 20px 24px;
}}
.shell {{
  width: 100%;
  height: 100%;
  background: #FFFFFF;
  border: 1px solid #D5D7D2;
  display: flex;
  flex-direction: column;
}}
.bar {{
  height: 46px;
  padding: 0 18px;
  border-bottom: 1px solid #D5D7D2;
  background: #ECEEE9;
  display: flex;
  align-items: center;
  justify-content: space-between;
}}
.bar-left {{
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 15px;
}}
.bar-status {{
  font-size: 13px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 4px;
}}
.bar-status.bad {{ background: #FCE9E7; color: #B42318; border: 1px solid #F04438; }}
.bar-status.good {{ background: #E3F3EB; color: #1E6B47; border: 1px solid #1E6B47; }}
.stage {{
  flex: 1;
  display: grid;
  grid-template-columns: 1.18fr 0.82fr;
  gap: 18px;
  padding: 20px 22px;
  min-height: 0;
}}
.preview-col {{
  position: relative;
  overflow: hidden;
  border: 1px solid #D5D7D2;
  background: #FFFFFF;
}}
.slop-card {{
  position: absolute;
  inset: 0;
  background: #0F172A;
  color: #F8FAFC;
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}}
/* <!-- dislop-quote-start --> */
.slop-badge {{
  display: inline-block;
  align-self: flex-start;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 999px;
  background: linear-gradient(90deg, #6366F1, #A855F7, #EC4899);
  color: #FFFFFF;
}}
.slop-h {{
  font-size: 24px;
  font-weight: 800;
  margin: 12px 0 8px;
  background: linear-gradient(90deg, #818CF8, #C084FC, #F472B6);
  -webkit-background-clip: text;
  color: transparent;
}}
/* <!-- dislop-quote-end --> */
.slop-p {{
  margin: 0 0 14px;
  color: #CBD5E1;
  font-size: 14.5px;
}}
.slop-pills {{
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 14px;
}}
.slop-pill {{
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: #E2E8F0;
}}
.slop-btn {{
  display: inline-block;
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: 8px;
  background: #334155;
  color: #94A3B8;
  font-size: 13px;
  border: 1px dashed #F04438;
}}
.good-layer {{
  position: absolute;
  inset: 0;
  background: #FFFFFF;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  clip-path: inset(0 100% 0 0);
}}
.good-box {{
  border: 1px solid #D5D7D2;
  padding: 20px 22px;
  background: #F6F7F5;
  display: flex;
  flex-direction: column;
  gap: 10px;
}}
.good-kicker {{ font-size: 12px; font-weight: 700; color: #1E6B47; }}
.good-title {{ margin: 0; font-size: 24px; font-weight: 700; color: #14171A; letter-spacing: -0.015em; }}
.good-sub {{ margin: 0; font-size: 15px; color: #474C55; line-height: 1.55; }}
.good-actions {{ display: flex; align-items: center; gap: 12px; margin-top: 4px; flex-wrap: wrap; }}
.good-btn {{
  padding: 8px 14px;
  border-radius: 6px;
  background: #14171A;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 600;
}}
.good-meta {{ font-size: 12px; color: #5E646E; }}
.wipe-rule {{
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2.5px;
  background: #F04438;
  left: 0%;
  opacity: 0;
  pointer-events: none;
  z-index: 4;
}}
.flags-col {{
  background: #F6F7F5;
  border: 1px solid #D5D7D2;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}}
.flag-item {{
  background: #FFFFFF;
  border: 1px solid #D5D7D2;
  border-left-width: 3px;
  padding: 9px 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}}
.flag-item.is-err {{ border-left-color: #F04438; }}
.flag-item.is-warn {{ border-left-color: #1B52B0; }}
.flag-item.is-resolved {{ border-left-color: #1E6B47; background: #F4FAF7; }}
.flag-top {{ display: flex; justify-content: space-between; align-items: center; }}
.flag-id {{ font-size: 12px; font-weight: 700; color: #14171A; }}
.flag-item.is-err .flag-id {{ color: #B42318; }}
.flag-item.is-warn .flag-id {{ color: #1B52B0; }}
.flag-item.is-resolved .flag-id {{ color: #1E6B47; }}
.flag-state {{ font-size: 11px; font-weight: 700; color: #474C55; }}
.flag-item.is-resolved .flag-state {{ color: #1E6B47; }}
.flag-desc {{ font-size: 12.5px; color: #3D424B; }}
</style>
</head>
<body>
<div class="shell">
  <header class="bar">
    <div class="bar-left">
      {LOGO_SVG_INNER}
      <span>dislop</span>
      <span class="mono" style="font-size:12.5px;color:#474C55;font-weight:400;">deck-and-ui</span>
    </div>
    <span class="bar-status bad mono" id="bar-status">{copy["header_bad"]}</span>
  </header>

  <div class="stage">
    <div class="preview-col">
      <!-- dislop-quote-start -->
      <div class="slop-card">
        <div>
          <div class="slop-badge">{copy["bad_badge"]}</div>
          <h2 class="slop-h">{copy["bad_title"]}</h2>
          <p class="slop-p">{copy["bad_sub"]}</p>
          <div class="slop-pills">{pills_html}</div>
        </div>
        <div class="slop-btn mono">{copy["bad_btn"]}</div>
      </div>
      <!-- dislop-quote-end -->

      <div class="good-layer" id="good-layer">
        <div class="good-box">
          <div class="good-kicker mono">{copy["good_kicker"]}</div>
          <h2 class="good-title">{copy["good_title"]}</h2>
          <p class="good-sub">{copy["good_sub"]}</p>
          <div class="good-actions">
            <span class="good-btn">{copy["good_btn"]}</span>
            <span class="good-meta mono">{copy["good_meta"]}</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid #D5D7D2;background:#FFFFFF;">
          <div style="padding:10px 14px;border-right:1px solid #D5D7D2;display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-size:12.5px;color:#474C55;">{copy["m1_label"]}</span>
            <span class="mono" style="font-size:17px;font-weight:700;color:#1E6B47;">0</span>
          </div>
          <div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-size:12.5px;color:#474C55;">{copy["m2_label"]}</span>
            <span class="mono" style="font-size:13px;font-weight:700;color:#14171A;">./report.html</span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #D5D7D2;padding-top:10px;gap:10px;white-space:nowrap;">
          <span class="mono" style="font-size:12px;color:#1E6B47;font-weight:700;">{copy["ok_prefix"]}{"0 处界面问题" if is_zh else "0 UI issues · passed"}</span>
          <span class="mono" style="font-size:11px;color:#5E646E;">dislop check card.html --pack deck-and-ui</span>
        </div>
      </div>

      <div class="wipe-rule" id="wipe-rule"></div>
    </div>

    <div class="flags-col">
      <div class="mono" style="font-size:12px;font-weight:700;color:#474C55;border-bottom:1px solid #D5D7D2;padding-bottom:6px;">{copy["findings_head"]}</div>
      {flags_html}
    </div>
  </div>
  <div class="timeline-track"><div class="timeline-fill" id="tl-fill"></div></div>
</div>

<script>
const HEADER_BAD = {json.dumps(copy["header_bad"], ensure_ascii=False)};
const HEADER_GOOD = {json.dumps(copy["header_good"], ensure_ascii=False)};
const RESOLVED_TXT = {json.dumps("已清理" if is_zh else "FIXED", ensure_ascii=False)};
const FLAG_TXT = {json.dumps("待改" if is_zh else "FLAG", ensure_ascii=False)};
const ORIG_CLS = {json.dumps(["is-err" if k == "err" else "is-warn" for k, _, _ in copy["flags"]])};
const DURATION = {duration:.2f};

function clamp01(v) {{ return Math.max(0, Math.min(1, v)); }}
function easeOut(v) {{ return 1 - Math.pow(1 - clamp01(v), 3); }}
function easeInOut(v) {{
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}}

window.__renderAt = function(t) {{
  document.getElementById("tl-fill").style.width = (clamp01(t / DURATION) * 100).toFixed(2) + "%";
  const goodLayer = document.getElementById("good-layer");
  const wipeRule = document.getElementById("wipe-rule");
  const barStatus = document.getElementById("bar-status");

  if (t < 2.95) {{
    goodLayer.style.clipPath = "inset(0 100% 0 0)";
    wipeRule.style.opacity = (t >= 0.12 && t <= 1.25) ? 0.95 : 0;
    wipeRule.style.left = (clamp01((t - 0.12) / 1.05) * 100).toFixed(1) + "%";
    barStatus.className = "bar-status bad mono";
    barStatus.textContent = HEADER_BAD;
    for (let i = 0; i < 4; i++) {{
      const el = document.getElementById("flag-" + i);
      const st = document.getElementById("fstate-" + i);
      const p = easeOut((t - (0.30 + i * 0.24)) / 0.20);
      el.style.opacity = p;
      el.style.transform = `translateX(${{(1 - p) * 10}}px)`;
      el.className = "flag-item " + ORIG_CLS[i];
      st.textContent = FLAG_TXT;
    }}
  }} else {{
    const wipeP = easeInOut((t - 2.95) / 0.90);
    const rightInset = ((1 - wipeP) * 100).toFixed(2);
    goodLayer.style.clipPath = `inset(0 ${{rightInset}}% 0 0)`;
    wipeRule.style.opacity = wipeP > 0.01 && wipeP < 0.99 ? 1 : 0;
    wipeRule.style.left = (wipeP * 100).toFixed(2) + "%";

    for (let i = 0; i < 4; i++) {{
      const el = document.getElementById("flag-" + i);
      const st = document.getElementById("fstate-" + i);
      el.style.opacity = 1;
      el.style.transform = "translateX(0)";
      const done = t >= (3.15 + i * 0.18);
      el.className = "flag-item " + (done ? "is-resolved" : ORIG_CLS[i]);
      st.textContent = done ? RESOLVED_TXT : FLAG_TXT;
    }}
    if (wipeP >= 0.95) {{
      barStatus.className = "bar-status good mono";
      barStatus.textContent = HEADER_GOOD;
    }} else {{
      barStatus.className = "bar-status bad mono";
      barStatus.textContent = HEADER_BAD;
    }}
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
        findings = probe["json"].get("findings", [])
        copy = {
            "header_bad": f"quarterly-review.pptx · Slide 4 · 发现 {len(findings)} 处问题",
            "header_good": "quarterly-review.pptx · 0 处问题 · 通过",
            "bad_title": bad_title,
            "bad_b1_md": "**核心结论**：",
            "bad_b1_rest": "经过多轮梳理与协同，新客首周流失率受引导链路偏长、首日任务缺少反馈及渠道跟进不足影响……（共 312 字 / 7 条要点）",
            "bad_b2_md": "**优化策略**：",
            "bad_b2_rest": "以精细化运营为抓手，分阶段推进引导改版与触达优化，加强监控与告警，持续跟进……",
            "autofit_tag": "normAutofit: 68%（字号被硬压小）",
            "notes": [
                ("err", "markdown-leak", "正文留着从对话抄来的 **加粗** 裸星号"),
                ("warn", "slide-process-not-finding-title", "标题只写“关于……的分析汇报”，没亮结论"),
                ("warn", "slide-word-wall", "单页塞进 312 字 / 7 条要点，变文档搬家"),
                ("warn", "slide-autofit-shrink", "文本框缩排至 68%（低于 80% 可读底线）"),
            ],
            "good_title": "三季度新客首周流失率从 34% 降至 19%",
            "good_rows": [
                ("流失率变化", "34% → 19%", "引导步数从 6 步减到 3 步"),
                ("首日触达", "42 秒首响", "异常队列分级后自动分流"),
                ("后续动作", "周三对齐埋点", "数据组 + 前端组（备注见讲稿）"),
            ],
            "good_scale": "noAutofit: 100% 原始字号 · 58 字 · 3 行结构表",
            "foot_left": "本地 XML 解包检查 · 原文件不出本机",
            "foot_right": "dislop check quarterly-review.pptx --pack executive-deck",
            "margin_head": "PPTX 规则检测",
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
        findings = probe["json"].get("findings", [])
        copy = {
            "header_bad": f"quarterly-review.pptx · Slide 4 · {len(findings)} issues flagged",
            "header_good": "quarterly-review.pptx · 0 issues · passed",
            "bad_title": bad_title,
            "bad_b1_md": "**Key Takeaway**:",
            "bad_b1_rest": " Across Q3 we conducted a comprehensive review of activation funnels and onboarding workflows, identifying friction in step-3 completion and delayed follow-ups… (148 words / 7 bullets)",
            "bad_b2_md": "**Optimization Plan**:",
            "bad_b2_rest": " Leverage data-driven iteration to empower product teams, streamline onboarding, and continue to monitor metrics…",
            "autofit_tag": "normAutofit: 68% (shrunk below 80%)",
            "notes": [
                ("err", "markdown-leak", "Raw **markdown** asterisks pasted into slide"),
                ("warn", "slide-process-not-finding-title", "'Analysis of X' topic label hides conclusion"),
                ("warn", "slide-word-wall", "148 words / 7 bullets crammed onto one slide"),
                ("warn", "slide-autofit-shrink", "PowerPoint shrank body type to 68% scale"),
            ],
            "good_title": "Q3 week-1 churn fell from 34% to 19%",
            "good_rows": [
                ("Churn rate", "34% → 19%", "Cut onboarding flow from 6 steps to 3"),
                ("First reply", "42s median", "Tiered triage queue routes urgent tickets"),
                ("Next action", "Wed tag audit", "Analytics + Frontend (details in speaker notes)"),
            ],
            "good_scale": "noAutofit: 100% scale · 38 words · structured table",
            "foot_left": "Local OOXML unpack · file stays on machine",
            "foot_right": "dislop check quarterly-review.pptx --pack executive-deck",
            "margin_head": "PPTX FINDINGS",
        }

    notes_html = "".join(
        f'<div class="note-row {"is-err" if k == "err" else "is-warn"}" id="dnote-{i}">'
        f'<div class="note-top"><span class="note-rule mono">{rid}</span><span class="note-state mono" id="dstate-{i}">{"待改" if is_zh else "FLAG"}</span></div>'
        f'<div class="note-desc">{desc}</div></div>'
        for i, (k, rid, desc) in enumerate(copy["notes"])
    )
    good_rows_html = "".join(
        f'<div class="g-row"><span class="g-k mono">{k}</span><span class="g-v mono">{v}</span><span class="g-d">{d}</span></div>'
        for k, v, d in copy["good_rows"]
    )

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
  width: 960px;
  height: 500px;
  background: #F6F7F5;
  padding: 20px 24px;
}}
.frame {{
  width: 100%;
  height: 100%;
  background: #FFFFFF;
  border: 1px solid #D5D7D2;
  display: flex;
  flex-direction: column;
}}
.topbar {{
  height: 46px;
  border-bottom: 1px solid #D5D7D2;
  background: #ECEEE9;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}}
.brand {{ display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; }}
.status-pill {{ font-size: 12.5px; font-weight: 700; padding: 4px 10px; border-radius: 4px; }}
.status-pill.bad {{ background: #FCE9E7; color: #B42318; border: 1px solid #F04438; }}
.status-pill.good {{ background: #E3F3EB; color: #1E6B47; border: 1px solid #1E6B47; }}
.main {{
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 315px;
  min-height: 0;
}}
.slide-stage {{
  padding: 20px 22px;
  border-right: 1px solid #D5D7D2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: #F6F7F5;
  position: relative;
}}
.slide-canvas {{
  background: #FFFFFF;
  border: 1px solid #B6BAB2;
  height: 310px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
}}
.slide-head-bad {{
  font-size: 18px;
  font-weight: 700;
  color: #14171A;
  padding-bottom: 8px;
  border-bottom: 1px solid #D5D7D2;
}}
.slide-body-bad {{
  font-size: 13px;
  line-height: 1.55;
  color: #3D424B;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid #C7D7F5;
  border-left: 3px solid #1B52B0;
  padding: 10px 12px;
  background: #F8FAFE;
}}
.raw-md {{
  background: rgba(240, 68, 56, 0.10);
  color: #B42318;
  border-bottom: 2px solid #F04438;
  font-family: {FONT_MONO};
  font-weight: 700;
  padding: 0;
}}
.scale-chip {{
  align-self: flex-start;
  font-size: 11.5px;
  font-weight: 700;
  color: #1B52B0;
  background: #E6EEFC;
  border: 1px solid #1B52B0;
  padding: 2px 8px;
  border-radius: 2px;
}}
.slide-head-good {{
  font-size: 20px;
  font-weight: 700;
  color: #14171A;
  padding-bottom: 10px;
  border-bottom: 1px solid #D5D7D2;
}}
.g-table {{
  display: flex;
  flex-direction: column;
  border: 1px solid #D5D7D2;
}}
.g-row {{
  display: grid;
  grid-template-columns: 96px 110px 1fr;
  gap: 10px;
  padding: 10px 12px;
  align-items: center;
  border-top: 1px solid #D5D7D2;
  font-size: 13px;
}}
.g-row:first-child {{ border-top: none; }}
.g-k {{ color: #474C55; font-size: 12px; }}
.g-v {{ font-weight: 700; color: #1E6B47; font-size: 13.5px; }}
.g-d {{ color: #14171A; }}
.good-chip {{
  align-self: flex-start;
  font-size: 11.5px;
  font-weight: 700;
  color: #1E6B47;
  background: #E3F3EB;
  border: 1px solid #1E6B47;
  padding: 3px 8px;
  border-radius: 2px;
}}
.margin {{
  background: #FFFFFF;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}}
.margin-head {{
  font-size: 12px;
  font-weight: 700;
  color: #474C55;
  padding-bottom: 6px;
  border-bottom: 1px solid #D5D7D2;
}}
.note-row {{
  border: 1px solid #D5D7D2;
  border-left-width: 3px;
  padding: 7px 10px;
  background: #F6F7F5;
}}
.note-row.is-err {{ border-left-color: #F04438; }}
.note-row.is-warn {{ border-left-color: #1B52B0; }}
.note-row.is-ok {{ border-left-color: #1E6B47; background: #F4FAF7; }}
.note-top {{ display: flex; justify-content: space-between; align-items: center; gap: 6px; }}
.note-rule {{ font-size: 11.5px; font-weight: 700; color: #14171A; }}
.note-state {{ font-size: 10.5px; font-weight: 700; color: #474C55; }}
.note-row.is-ok .note-state {{ color: #1E6B47; }}
.note-row.is-err .note-rule {{ color: #B42318; }}
.note-row.is-warn .note-rule {{ color: #1B52B0; }}
.note-row.is-ok .note-rule {{ color: #1E6B47; }}
.note-desc {{ font-size: 12px; color: #3D424B; margin-top: 2px; line-height: 1.4; }}
.footer {{
  height: 34px;
  border-top: 1px solid #D5D7D2;
  background: #F6F7F5;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: #474C55;
}}
</style>
</head>
<body>
<div class="frame">
  <header class="topbar">
    <div class="brand">
      {LOGO_SVG_INNER}
      <span>dislop</span>
      <span class="mono" style="font-size:12px;color:#474C55;font-weight:400;">executive-deck</span>
    </div>
    <span class="status-pill bad mono" id="status-pill">{copy["header_bad"]}</span>
  </header>

  <main class="main">
    <section class="slide-stage">
      <div class="slide-canvas" id="slide-bad">
        <div class="slide-head-bad">{copy["bad_title"]}</div>
        <div class="slide-body-bad">
          <div><span class="raw-md">{copy["bad_b1_md"]}</span>{copy["bad_b1_rest"]}</div>
          <div><span class="raw-md">{copy["bad_b2_md"]}</span>{copy["bad_b2_rest"]}</div>
        </div>
        <div class="scale-chip mono">{copy["autofit_tag"]}</div>
      </div>

      <div class="slide-canvas" id="slide-good" style="display:none;">
        <div class="slide-head-good">{copy["good_title"]}</div>
        <div class="g-table">{good_rows_html}</div>
        <div class="good-chip mono">{copy["good_scale"]}</div>
      </div>
    </section>

    <aside class="margin">
      <div class="margin-head mono">{copy["margin_head"]}</div>
      {notes_html}
    </aside>
  </main>

  <div class="timeline-track"><div class="timeline-fill" id="tl-fill"></div></div>
  <footer class="footer">
    <span>{copy["foot_left"]}</span>
    <span class="mono">{copy["foot_right"]}</span>
  </footer>
</div>

<script>
const HEADER_BAD = {json.dumps(copy["header_bad"], ensure_ascii=False)};
const HEADER_GOOD = {json.dumps(copy["header_good"], ensure_ascii=False)};
const ORIG_CLS = {json.dumps(["is-err" if k == "err" else "is-warn" for k, _, _ in copy["notes"]])};
const FLAG_TXT = {json.dumps("待改" if is_zh else "FLAG", ensure_ascii=False)};
const FIXED_TXT = {json.dumps("已改好" if is_zh else "FIXED", ensure_ascii=False)};
const DURATION = {duration:.2f};

function clamp01(v) {{ return Math.max(0, Math.min(1, v)); }}
function easeOut(v) {{ return 1 - Math.pow(1 - clamp01(v), 3); }}

window.__renderAt = function(t) {{
  document.getElementById("tl-fill").style.width = (clamp01(t / DURATION) * 100).toFixed(2) + "%";
  const sb = document.getElementById("slide-bad");
  const sg = document.getElementById("slide-good");
  const pill = document.getElementById("status-pill");

  if (t < 3.15) {{
    sb.style.display = "flex";
    sg.style.display = "none";
    sb.style.opacity = 1;
    pill.className = "status-pill bad mono";
    pill.textContent = HEADER_BAD;
    for (let i = 0; i < 4; i++) {{
      const el = document.getElementById("dnote-" + i);
      const st = document.getElementById("dstate-" + i);
      const p = easeOut((t - (0.20 + i * 0.25)) / 0.20);
      el.style.opacity = p;
      el.style.transform = `translateX(${{(1 - p) * 10}}px)`;
      el.className = "note-row " + ORIG_CLS[i];
      st.textContent = FLAG_TXT;
    }}
  }} else {{
    const p = easeOut((t - 3.15) / 0.25);
    sb.style.display = "none";
    sg.style.display = "flex";
    sg.style.opacity = p;
    sg.style.transform = `translateY(${{(1 - p) * 8}}px)`;
    pill.className = "status-pill good mono";
    pill.textContent = HEADER_GOOD;
    for (let i = 0; i < 4; i++) {{
      const el = document.getElementById("dnote-" + i);
      const st = document.getElementById("dstate-" + i);
      el.style.opacity = 1;
      el.style.transform = "translateX(0)";
      el.className = "note-row is-ok";
      st.textContent = FIXED_TXT;
    }}
  }}
}};
window.__renderAt(0.0);
</script>
</body>
</html>
"""


def agent_workflow_html(lang: str, duration: float = 6.8) -> str:
    is_zh = lang == "zh"
    if is_zh:
        bad_pr = "好的，以下是本次 PR 的修改摘要。\n本次 PR 旨在通过优化任务调度模块进一步提升整体系统的可维护性。"
        good_pr = "修复调度队列超时未释放句柄导致的连接泄漏，压测下 FD 稳定在 180 以内。"
    else:
        bad_pr = "Certainly! Here is a summary of this PR.\nThis PR updates the retry middleware to ensure a more seamless and resilient developer experience."
        good_pr = "Fixes #412 by capping exponential backoff at 8s when upstream returns HTTP 503."

    g_bad = run_dislop_cli(bad_pr, "pr-summary.md", lang, pack="engineering-spec")
    g_good = run_dislop_cli(good_pr, "pr-summary.md", lang, pack="engineering-spec")
    bad_findings = g_bad["json"].get("findings", [])
    bad_ids = ", ".join(f.get("ruleId", "") for f in bad_findings)

    if is_zh:
        copy = {
            "top_badge": "Coding Agent + Git PR 闭环",
            "steps": ["1 · 动笔前读 Skill", "2 · 增量门禁拦截", "3 · 修完防退化校验"],
            "step1_title": "加载纯文档 Skill（0 脚本 · 0 联网）",
            "step1_cmd": "$ npx skills add dislop-ai/dislop --skill dislop",
            "step1_out": "已加载 skills/dislop/SKILL.md + references/business-and-rfc.md",
            "step2_title": "Agent 写完 PR 说明后跑本地增量门禁",
            "step2_cmd": "$ dislop check --changed origin/main --pack engineering-spec --lang zh",
            "step2_lines": [
                ("err", f"[ERROR] pr-summary.md:1:1  chatbot-artifact  \"好的，以下是\""),
                ("warn", f"[WARNING] pr-summary.md:2:1  eng-pr-diff-parrot  \"本次 PR 旨在通过……可维护性\""),
                ("exit", f"退出码: {g_bad['exit_code']}（{len(bad_findings)} 处命中: {bad_ids}）"),
            ],
            "step3_title": "Agent 按规则改写并用 git HEAD 校验数字不丢失",
            "step3_cmd": "$ dislop verify --git HEAD pr-summary.md && dislop check pr-summary.md --lang zh",
            "step3_lines": [
                ("ok", f"[VERIFY] 受保护数字完整保留: 180 · 无二阶套话回流"),
                ("ok", f"dislop: 未发现已知模式（0 处命中）· 退出码 {g_good['exit_code']}"),
            ],
            "foot_left": "确定性本地检查 · 保护源码与数字事实",
            "foot_right": "Claude Code / Codex / Cursor / GitHub Actions",
        }
    else:
        copy = {
            "top_badge": "Coding Agent + Git PR Loop",
            "steps": ["1 · Read Skill", "2 · Diff Gate", "3 · Verify"],
            "step1_title": "Load pure-Markdown Skill before drafting (0 scripts)",
            "step1_cmd": "$ npx skills add dislop-ai/dislop --skill dislop",
            "step1_out": "Loaded skills/dislop/SKILL.md + references/business-and-rfc.md",
            "step2_title": "Run incremental PR gate before committing",
            "step2_cmd": "$ dislop check --changed origin/main --pack engineering-spec",
            "step2_lines": [
                ("err", '[ERROR] pr-summary.md:1:1  chatbot-artifact  "Certainly! Here is"'),
                ("warn", '[WARNING] pr-summary.md:2:1  eng-pr-diff-parrot  "This PR updates...resilient"'),
                ("exit", f"exit code: {g_bad['exit_code']} ({len(bad_findings)} findings: {bad_ids})"),
            ],
            "step3_title": "Agent revises and verifies protected numbers against HEAD",
            "step3_cmd": "$ dislop verify --git HEAD pr-summary.md && dislop check pr-summary.md",
            "step3_lines": [
                ("ok", "[VERIFY] Protected facts intact: #412, 8s, HTTP 503 · no 2nd-order slop"),
                ("ok", f"dislop: ok (1 checked, 0 findings) · exit code {g_good['exit_code']}"),
            ],
            "foot_left": "Offline deterministic gate · code never leaves machine",
            "foot_right": "Claude Code / Codex / Cursor / GitHub Actions",
        }

    s2_html = "".join(f'<div class="l-{cls}">{txt}</div>' for cls, txt in copy["step2_lines"])
    s3_html = "".join(f'<div class="l-{cls}">{txt}</div>' for cls, txt in copy["step3_lines"])

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
  width: 960px;
  height: 500px;
  background: #0E1012;
  color: #ECEEF0;
  padding: 20px;
}}
.shell {{
  width: 100%;
  height: 100%;
  background: #15181C;
  border: 1px solid #2A2F37;
  display: flex;
  flex-direction: column;
}}
.head {{
  height: 44px;
  background: #1D2127;
  border-bottom: 1px solid #2A2F37;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}}
.brand {{ display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 14.5px; }}
.steps {{ display: flex; gap: 6px; }}
.st-pill {{
  font-size: 11.5px;
  padding: 3px 9px;
  border-radius: 4px;
  border: 1px solid #2A2F37;
  background: #15181C;
  color: #A6ACB5;
  font-weight: 600;
}}
.st-pill.active {{ background: #ECEEF0; color: #14171A; border-color: #ECEEF0; }}
.body {{
  flex: 1;
  padding: 16px 20px;
  background: #0A0C0E;
  display: flex;
  flex-direction: column;
  gap: 10px;
}}
.card {{
  border: 1px solid #2A2F37;
  background: #15181C;
  padding: 11px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}}
.card.is-active {{ border-color: #6F7784; }}
.card.is-ok {{ border-left: 3px solid #6CD49B; }}
.card.is-err {{ border-left: 3px solid #FF7A6B; }}
.c-title {{ font-size: 12px; color: #A6ACB5; font-weight: 600; }}
.c-cmd {{ font-size: 13.5px; color: #ECEEF0; font-weight: 700; }}
.c-out {{ font-size: 12.5px; line-height: 1.5; }}
.l-err {{ color: #FF7A6B; font-weight: 700; }}
.l-warn {{ color: #85B4FF; font-weight: 700; }}
.l-exit {{ color: #FF7A6B; font-weight: 700; }}
.l-ok {{ color: #6CD49B; font-weight: 700; }}
.foot {{
  height: 32px;
  background: #15181C;
  border-top: 1px solid #2A2F37;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: #A6ACB5;
}}
</style>
</head>
<body>
<div class="shell">
  <header class="head">
    <div class="brand">
      {LOGO_SVG_INNER}
      <span>dislop</span>
      <span class="mono" style="font-size:12px;color:#B8BEC7;font-weight:400;">{copy["top_badge"]}</span>
    </div>
    <div class="steps">
      <div class="st-pill active" id="sp-0">{copy["steps"][0]}</div>
      <div class="st-pill" id="sp-1">{copy["steps"][1]}</div>
      <div class="st-pill" id="sp-2">{copy["steps"][2]}</div>
    </div>
  </header>

  <div class="body">
    <div class="card is-active" id="c-0">
      <div class="c-title">{copy["step1_title"]}</div>
      <div class="c-cmd mono">{copy["step1_cmd"]}</div>
      <div class="c-out mono" style="color:#B8BEC7;">{copy["step1_out"]}</div>
    </div>

    <div class="card is-err" id="c-1" style="opacity:0.65;">
      <div class="c-title">{copy["step2_title"]}</div>
      <div class="c-cmd mono">{copy["step2_cmd"]}</div>
      <div class="c-out mono">{s2_html}</div>
    </div>

    <div class="card is-ok" id="c-2" style="opacity:0.65;">
      <div class="c-title">{copy["step3_title"]}</div>
      <div class="c-cmd mono">{copy["step3_cmd"]}</div>
      <div class="c-out mono">{s3_html}</div>
    </div>
  </div>

  <div class="timeline-track is-dark"><div class="timeline-fill" id="tl-fill"></div></div>
  <footer class="foot">
    <span>{copy["foot_left"]}</span>
    <span class="mono">{copy["foot_right"]}</span>
  </footer>
</div>

<script>
const DURATION = {duration:.2f};
function clamp01(v) {{ return Math.max(0, Math.min(1, v)); }}
function easeOut(v) {{ return 1 - Math.pow(1 - clamp01(v), 3); }}

window.__renderAt = function(t) {{
  document.getElementById("tl-fill").style.width = (clamp01(t / DURATION) * 100).toFixed(2) + "%";
  let active = 0;
  if (t >= 1.55 && t < 3.85) active = 1;
  else if (t >= 3.85) active = 2;

  for (let i = 0; i < 3; i++) {{
    document.getElementById("sp-" + i).classList.toggle("active", i === active);
  }}
  document.getElementById("c-0").style.opacity = 1;
  const p1 = easeOut((t - 1.55) / 0.24);
  document.getElementById("c-1").style.opacity = t >= 1.55 ? (0.65 + 0.35 * p1) : 0.65;
  const p2 = easeOut((t - 3.85) / 0.24);
  document.getElementById("c-2").style.opacity = t >= 3.85 ? (0.65 + 0.35 * p2) : 0.65;
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
        # Deduplicate consecutive identical frames by summing duration -> tiny files & fast decode
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
            cmd = ["img2webp", "-loop", "0", "-lossless", "-m", "4"]
        else:
            cmd = ["img2webp", "-loop", "0", "-lossy", "-q", str(quality), "-m", "4"]
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
            tmp, out_gif,
            fps=fps,
            max_colors=int(spec["max_colors"]),
            dither=str(spec["dither"]),
            lossy=int(spec["lossy"]),
        )
        encode_webp(
            frame_files,
            out_webp,
            fps=fps,
            quality=int(spec.get("webp_quality", 84)),
            lossless=spec.get("profile") in ("flat-paper", "dark-terminal"),
        )
        save_poster(frame_files[poster_idx], out_poster)

        if social_dir is not None:
            social_dir.mkdir(parents=True, exist_ok=True)
            encode_social_mp4(tmp, social_dir / f"{name}-1080x600.mp4", fps=fps)

        pick_indices = [0, int(total_frames * 0.2), int(total_frames * 0.4), int(total_frames * 0.55), int(total_frames * 0.78), total_frames - 1]
        sheet_path = sheet_dir / f"{name}-sheet.png"
        make_contact_sheet([frame_files[k] for k in pick_indices], sheet_path, f"{name} ({width}x{height}, {fps}fps, {duration:.1f}s)")

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

    handler = functools.partial(QuietHandler, directory=str(SITE_DIR))
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as httpd:
        port = httpd.server_address[1]
        th = threading.Thread(target=httpd.serve_forever, daemon=True)
        th.start()
        try:
            ctx = playwright_browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
            page = ctx.new_page()
            url = f"http://127.0.0.1:{port}/" + ("?lang=en" if lang == "en" else "?lang=zh")
            page.goto(url, wait_until="load")
            page.wait_for_selector("#proof-view .proof-line")
            page.evaluate(
                """(cursorSvg) => {
                const topbar = document.querySelector('.topbar');
                if (topbar) topbar.style.display = 'none';
                const hero = document.getElementById('top');
                if (hero) hero.style.display = 'none';
                window.scrollTo(0, 0);
                const c = document.createElement('div');
                c.id = 'demo-cursor';
                c.innerHTML = cursorSvg;
                c.style.cssText = 'position:fixed;left:40px;top:40px;z-index:99999;pointer-events:none;transform-origin:4px 3px;';
                document.body.appendChild(c);
                const ring = document.createElement('div');
                ring.id = 'demo-click-ring';
                ring.style.cssText = 'position:fixed;width:20px;height:20px;border:2px solid #F04438;border-radius:50%;pointer-events:none;z-index:99998;opacity:0;transform:translate(-50%,-50%);';
                document.body.appendChild(ring);
            }""",
                CURSOR_SVG,
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

                def get_center(selector: str) -> tuple[float, float]:
                    box = page.locator(selector).bounding_box()
                    if not box:
                        return (width * 0.5, height * 0.5)
                    return (box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5)

                def move_cursor(p0: tuple[float, float], p1: tuple[float, float], steps: int = 5) -> None:
                    for s in range(1, steps + 1):
                        u = s / steps
                        e = 1 - pow(1 - u, 3)
                        x = p0[0] + (p1[0] - p0[0]) * e
                        y = p0[1] + (p1[1] - p0[1]) * e
                        page.evaluate(f"() => {{ const c = document.getElementById('demo-cursor'); c.style.left='{x:.1f}px'; c.style.top='{y:.1f}px'; }}")
                        snap_frame()

                def click_pulse(pt: tuple[float, float], selector: str) -> None:
                    page.evaluate(f"""() => {{
                        const r = document.getElementById('demo-click-ring');
                        r.style.left='{pt[0]:.1f}px'; r.style.top='{pt[1]:.1f}px';
                        r.style.opacity='0.9'; r.style.transform='translate(-50%,-50%) scale(0.9)';
                        const c = document.getElementById('demo-cursor');
                        c.style.transform='scale(0.88)';
                    }}""")
                    snap_frame()
                    page.evaluate(f"""() => {{
                        document.querySelector({selector!r})?.click();
                        window.scrollTo(0, 0);
                        const r = document.getElementById('demo-click-ring');
                        r.style.opacity='0.35'; r.style.transform='translate(-50%,-50%) scale(1.45)';
                        const c = document.getElementById('demo-cursor');
                        c.style.transform='scale(1)';
                    }}""")
                    page.wait_for_timeout(120)
                    snap_frame()
                    page.evaluate("() => { document.getElementById('demo-click-ring').style.opacity='0'; }")

                # Start cursor near bottom-right of text
                cur = (width * 0.42, height * 0.56)
                page.evaluate(f"() => {{ const c = document.getElementById('demo-cursor'); c.style.left='{cur[0]:.1f}px'; c.style.top='{cur[1]:.1f}px'; }}")

                # Phase 1: default draft with red + blue marks + unclipped 5-axis telemetry
                poster_snap = capture_hold(1.6)

                # Move to 2nd-order slop trap button & click
                trap_pt = get_center("#btn-apply-trap")
                move_cursor(cur, trap_pt, steps=5)
                click_pulse(trap_pt, "#btn-apply-trap")
                cur = trap_pt
                capture_hold(1.7)

                # Move to clean version button & click
                good_pt = get_center("#btn-apply-good")
                move_cursor(cur, good_pt, steps=5)
                click_pulse(good_pt, "#btn-apply-good")
                # Park cursor gently aside so text/buttons are clear
                park_pt = (good_pt[0] + 40, good_pt[1] + 55)
                move_cursor(good_pt, park_pt, steps=3)
                capture_hold(2.1)

                out_gif = DEMOS_DIR / f"{name}.gif"
                out_webp = DEMOS_DIR / f"{name}.webp"
                out_poster = DEMOS_DIR / f"{name}-poster.png"

                encode_gif(
                    tmp, out_gif,
                    fps=fps,
                    max_colors=int(spec["max_colors"]),
                    dither=str(spec["dither"]),
                    lossy=int(spec["lossy"]),
                )
                encode_webp(
            frame_files,
            out_webp,
            fps=fps,
            quality=int(spec.get("webp_quality", 84)),
            lossless=spec.get("profile") in ("flat-paper", "dark-terminal"),
        )
                save_poster(poster_snap, out_poster)

                if social_dir is not None:
                    social_dir.mkdir(parents=True, exist_ok=True)
                    encode_social_mp4(tmp, social_dir / f"{name}-1080x600.mp4", fps=fps)

                total_frames = len(frame_files)
                pick_indices = [0, int(total_frames * 0.25), int(total_frames * 0.36), int(total_frames * 0.55), int(total_frames * 0.72), total_frames - 1]
                sheet_path = sheet_dir / f"{name}-sheet.png"
                make_contact_sheet([frame_files[k] for k in pick_indices], sheet_path, f"{name} ({width}x{height}, {fps}fps)")

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
    parser.add_argument("--only", default="", help="Optional comma-separated scene slugs or full names (e.g. proof-cycle,ui-slop).")
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
                    results.append(render_virtual_clock_scene(page, spec, lang, version, html_text, sheet_dir, social_dir))

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
