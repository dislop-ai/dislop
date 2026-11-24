#!/usr/bin/env python3
"""
Automated G0-G6 QA gate verifier for dislop animated demo assets (v2).

Checks every scene x language declared in scripts/media/demos.manifest.json:
  G0: Valid GIF89a + NETSCAPE2.0 infinite loop, valid WebP ANIM, valid PNG poster, non-blank frame 0
  G1: Exact pixel dimensions match manifest across .gif, .webp, and -poster.png
  G2: Live `node bin/dislop.mjs check` parity on canonical ZH & EN demo inputs
  G3: File size budgets strictly met; flat-paper GIFs achieve >= 99.0% background purity on margins
  G4: End-state stability (>= 1.5s hold at end of GIF with mean pixel diff <= 1.0)
  G5: Strict bilingual isolation & clean badge metadata (zero CJK in EN, zero duration clutter)
  G6: Explicit anti-progress-bar pixel gate (bottom strip of every frame has zero creeping red bar)
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageSequence

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = Path(__file__).resolve().parent / "demos.manifest.json"
CJK_RE = re.compile(r"[\u4e00-\u9fff]")
DURATION_BADGE_RE = re.compile(r"\b\d+(?:\.\d+)?s\b", re.IGNORECASE)


def verify_live_cli() -> list[str]:
    errors: list[str] = []
    checks = [
        (
            "zh-s1",
            "zh",
            "business-brief",
            "好的，以下是修改后的上线说明。值得注意的是，本次改造以队列分级为重要抓手，全面赋能一线运维团队，故障恢复时间最多 45 秒。",
            1,
            {"chatbot-artifact", "zh-bureaucratic-padding"},
        ),
        (
            "zh-s2",
            "zh",
            "business-brief",
            "本次上线将结算队列改为分级处理，故障恢复时间最多 45 秒。这不是一次普通升级，而是结算架构的效率跃迁。",
            0,
            {"negation-pivot-frame"},
        ),
        (
            "zh-s3",
            "zh",
            "business-brief",
            "本次上线将结算队列改为分级处理，故障恢复时间最多 45 秒。",
            0,
            set(),
        ),
        (
            "en-s1",
            "en",
            "business-brief",
            "Certainly! Here is the launch note. It's worth noting that CSV exports are a game-changer: they finish in up to 12 minutes for workspaces above 500,000 rows.",
            1,
            {"chatbot-artifact", "en-throat-clearing-opener", "en-cliche-lexicon"},
        ),
        (
            "en-s2",
            "en",
            "business-brief",
            "CSV exports finish in up to 12 minutes for workspaces above 500,000 rows. This isn't just an upgrade — it's a new standard.",
            0,
            {"negation-pivot-frame"},
        ),
        (
            "en-s3",
            "en",
            "business-brief",
            "CSV exports finish in up to 12 minutes for workspaces above 500,000 rows.",
            0,
            set(),
        ),
    ]
    with tempfile.TemporaryDirectory(prefix="dislop-g2-") as td:
        for label, lang, pack, text, exp_exit, exp_rules in checks:
            fp = Path(td) / f"{label}.md"
            fp.write_text(text, encoding="utf-8")
            res = subprocess.run(
                [
                    "node",
                    str(ROOT / "bin" / "dislop.mjs"),
                    "check",
                    str(fp),
                    "--pack",
                    pack,
                    "--lang",
                    lang,
                    "--format",
                    "json",
                ],
                capture_output=True,
                text=True,
            )
            if res.returncode != exp_exit:
                errors.append(f"G2 [{label}]: expected exit {exp_exit}, got {res.returncode}")
                continue
            data = json.loads(res.stdout)
            got_rules = {f["ruleId"] for f in data.get("findings", [])}
            if got_rules != exp_rules:
                errors.append(f"G2 [{label}]: expected rules {sorted(exp_rules)}, got {sorted(got_rules)}")
    return errors


def check_paper_margin_purity(frame: Image.Image) -> float:
    """Measure % of outer margin pixels (top 14px band) that stay pure #F6F7F5 or #FFFFFF."""
    rgb = frame.convert("RGB")
    w, h = rgb.size
    crop = rgb.crop((0, 0, w, min(14, h)))
    b = crop.tobytes()
    total = len(b) // 3
    clean = 0
    for i in range(0, len(b), 3):
        px = (b[i], b[i + 1], b[i + 2])
        if px in ((246, 247, 245), (255, 255, 255)):
            clean += 1
    return (clean / total * 100.0) if total else 100.0


def red_band_stats(im: Image.Image, y0: int, y1: int) -> tuple[int, int]:
    """Return (red_pixel_count, max_contiguous_horizontal_red_run) in [y0, y1)."""
    w, h = im.size
    band = im.crop((0, max(0, y0), w, min(h, y1))).convert("RGB")
    b = band.tobytes()
    reds = 0
    max_contig = 0
    cur_contig = 0
    px_idx = 0
    for i in range(0, len(b), 3):
        if px_idx % w == 0:
            cur_contig = 0
        r, g, bl = b[i], b[i + 1], b[i + 2]
        if r >= 180 and g <= 105 and bl <= 105 and (r - max(g, bl)) >= 75:
            reds += 1
            cur_contig += 1
            if cur_contig > max_contig:
                max_contig = cur_contig
        else:
            cur_contig = 0
        px_idx += 1
    return reds, max_contig


def verify_no_progress_bar(base: str, frames: list[Image.Image], poster: Image.Image) -> list[str]:
    """G6: Reject any horizontal red bar in the bottom strip or creeping red progress growth near bottom."""
    errs: list[str] = []
    if not frames:
        return errs
    _, h = frames[0].size

    # 1. Bottom 24px strip must have zero horizontal red progress bars (allowing 3px vertical card borders / 14px dash icons)
    _, poster_contig = red_band_stats(poster, h - 24, h)
    if poster_contig > 28:
        errs.append(f"G6 [{base}]: poster bottom 24px strip has contiguous horizontal red bar of {poster_contig}px (expected <= 28)")

    strip_contig = [red_band_stats(f, h - 24, h)[1] for f in frames]
    max_strip_contig = max(strip_contig)
    if max_strip_contig > 28:
        worst_idx = strip_contig.index(max_strip_contig)
        errs.append(
            f"G6 [{base}]: frame {worst_idx} bottom 24px strip has contiguous horizontal red bar of {max_strip_contig}px (no progress bar allowed)"
        )

    # 2. Deeper bottom 64px band must never exhibit monotonic creeping red growth across frames
    band_reds = [red_band_stats(f, h - 64, h)[0] for f in frames]
    inc_steps = sum(1 for i in range(1, len(band_reds)) if band_reds[i] > band_reds[i - 1] + 8)
    max_run = 0
    cur_run = 0
    for i in range(1, len(band_reds)):
        if band_reds[i] > band_reds[i - 1] + 8:
            cur_run += 1
            max_run = max(max_run, cur_run)
        elif band_reds[i] < band_reds[i - 1] - 8:
            cur_run = 0
    if max_run >= 4 or (len(band_reds) >= 8 and inc_steps >= max(4, int(len(band_reds) * 0.35))):
        errs.append(
            f"G6 [{base}]: detected creeping red progress bar in bottom 64px band "
            f"(inc_steps={inc_steps}, max_run={max_run}, max_red={max(band_reds)})"
        )
    return errs


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    version = manifest["version"]
    assets_dir = ROOT / manifest["assetsDir"]
    errors: list[str] = []

    # G2: live CLI parity
    errors.extend(verify_live_cli())

    checked = 0
    for spec in manifest["scenes"]:
        slug = spec["slug"]
        w, h = int(spec["width"]), int(spec["height"])
        fps = int(spec["fps"])
        budgets = spec["budgets"]

        # G5: bilingual manifest isolation & clean badges
        en_meta = spec["en"]
        for k in ("title", "desc", "alt", "badge"):
            if CJK_RE.search(en_meta.get(k, "")):
                errors.append(f"G5 [{slug}.en.{k}]: contains unexpected CJK text")
        for lang_key in ("zh", "en"):
            badge_val = spec[lang_key].get("badge", "")
            if DURATION_BADGE_RE.search(badge_val):
                errors.append(f"G5 [{slug}.{lang_key}.badge]: contains duration clutter ({badge_val!r})")

        for lang in ("zh", "en"):
            checked += 1
            before_errs = len(errors)
            base = f"{slug}-{lang}-{version}"
            gif_path = assets_dir / f"{base}.gif"
            webp_path = assets_dir / f"{base}.webp"
            poster_path = assets_dir / f"{base}-poster.png"

            for p in (gif_path, webp_path, poster_path):
                if not p.exists():
                    errors.append(f"G0 [{base}]: missing {p.relative_to(ROOT)}")
            if not (gif_path.exists() and webp_path.exists() and poster_path.exists()):
                continue

            # G0: headers & infinite loop
            gif_bytes = gif_path.read_bytes()
            if not gif_bytes.startswith(b"GIF89a"):
                errors.append(f"G0 [{base}]: GIF header is not GIF89a")
            if b"NETSCAPE2.0" not in gif_bytes[:1024]:
                errors.append(f"G0 [{base}]: GIF missing NETSCAPE2.0 loop=0 extension")

            webp_bytes = webp_path.read_bytes()
            if not (webp_bytes[:4] == b"RIFF" and webp_bytes[8:12] == b"WEBP" and b"ANIM" in webp_bytes[:64]):
                errors.append(f"G0 [{base}]: WebP missing RIFF/WEBP/ANIM header")

            # G3: size budgets
            gif_kb = len(gif_bytes) / 1024
            webp_kb = len(webp_bytes) / 1024
            poster_kb = poster_path.stat().st_size / 1024
            if gif_kb > budgets["gif_kb"]:
                errors.append(f"G3 [{base}]: GIF {gif_kb:.1f} KB > budget {budgets['gif_kb']} KB")
            if webp_kb > budgets["webp_kb"]:
                errors.append(f"G3 [{base}]: WebP {webp_kb:.1f} KB > budget {budgets['webp_kb']} KB")
            if poster_kb > budgets["poster_kb"]:
                errors.append(f"G3 [{base}]: Poster {poster_kb:.1f} KB > budget {budgets['poster_kb']} KB")

            # G1: dimensions across formats
            gif_im = Image.open(gif_path)
            webp_im = Image.open(webp_path)
            poster_im = Image.open(poster_path)
            if gif_im.size != (w, h):
                errors.append(f"G1 [{base}]: GIF size {gif_im.size} != ({w}, {h})")
            if webp_im.size != (w, h):
                errors.append(f"G1 [{base}]: WebP size {webp_im.size} != ({w}, {h})")
            if poster_im.size != (w, h):
                errors.append(f"G1 [{base}]: Poster size {poster_im.size} != ({w}, {h})")

            # G0/G3/G4/G6: inspect GIF frames, anti-progress-bar, & end-state hold
            frames = []
            durations = []
            for f in ImageSequence.Iterator(gif_im):
                frames.append(f.convert("RGB").copy())
                durations.append(int(f.info.get("duration", round(1000 / fps))))

            if not frames:
                errors.append(f"G0 [{base}]: GIF has 0 frames")
                continue

            # Non-blank frame 0 check
            ext = frames[0].getextrema()
            if all(lo == hi for lo, hi in ext):
                errors.append(f"G0 [{base}]: frame 0 is completely solid/blank")

            if spec["profile"] == "flat-paper":
                purity = check_paper_margin_purity(frames[0])
                if purity < 99.0:
                    errors.append(f"G3 [{base}]: flat-paper margin purity {purity:.2f}% < 99.0%")

            # G6: zero creeping red progress bar in bottom strip
            errors.extend(verify_no_progress_bar(base, frames, poster_im))

            # G4: end-state hold >= 1.5s
            tail_ms = 0
            last_f = frames[-1]
            for f, d in zip(reversed(frames), reversed(durations)):
                diff = ImageChops.difference(f, last_f)
                hist = diff.histogram()
                mean_diff = sum((i % 256) * c for i, c in enumerate(hist)) / (w * h * 3)
                if mean_diff <= 1.0:
                    tail_ms += d
                else:
                    break
            if tail_ms < 1500:
                errors.append(f"G4 [{base}]: end-state hold {tail_ms} ms < 1500 ms")

            tag = "pass" if len(errors) == before_errs else "FAIL"
            print(
                f"  [{tag}] {base}: {w}x{h}, gif={gif_kb:.1f}KB ({len(frames)}f), "
                f"webp={webp_kb:.1f}KB, poster={poster_kb:.1f}KB, tail={tail_ms}ms"
            )

    if errors:
        print("\nQA GATE FAILURES:", file=sys.stderr)
        for e in errors:
            print("  -", e, file=sys.stderr)
        return 1

    print(f"\nAll G0-G6 gates passed across {checked} demo assets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
