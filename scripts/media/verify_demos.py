#!/usr/bin/env python3
"""
Automated G0-G5 QA gate verifier for dislop animated demo assets (v2).

Checks every scene x language declared in scripts/media/demos.manifest.json:
  G0: Valid GIF89a + NETSCAPE2.0 infinite loop, valid WebP ANIM, valid PNG poster, non-blank frame 0
  G1: Exact pixel dimensions match manifest across .gif, .webp, and -poster.png
  G2: Live `node bin/dislop.mjs check` parity on canonical ZH & EN demo inputs
  G3: File size budgets strictly met; flat-paper GIFs achieve >= 99.0% background purity on margins
  G4: End-state stability (>= 1.5s hold at end of GIF with mean pixel diff < 1.0)
  G5: Strict bilingual isolation on manifest copy (zero CJK in EN metadata)
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
            "这不是一次普通升级，而是结算架构的效率跃迁，性能实现数倍提升。",
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
            "Certainly! Here is the launch note. It's worth noting that exports are a game-changer, finishing in up to 12 minutes for workspaces above 500,000 rows.",
            1,
            {"chatbot-artifact", "en-throat-clearing-opener", "en-cliche-lexicon"},
        ),
        (
            "en-s2",
            "en",
            "business-brief",
            "This isn't just an upgrade — it's a new standard.",
            0,
            {"negation-pivot-frame"},
        ),
        (
            "en-s3",
            "en",
            "business-brief",
            "Exports now finish in up to 12 minutes for workspaces above 500,000 rows.",
            0,
            set(),
        ),
    ]
    with tempfile.TemporaryDirectory(prefix="dislop-g2-") as td:
        for label, lang, pack, text, exp_exit, exp_rules in checks:
            fp = Path(td) / f"{label}.md"
            fp.write_text(text, encoding="utf-8")
            res = subprocess.run(
                ["node", str(ROOT / "bin" / "dislop.mjs"), "check", str(fp), "--pack", pack, "--lang", lang, "--format", "json"],
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

        # G5: bilingual manifest isolation
        en_meta = spec["en"]
        for k in ("title", "desc", "alt", "badge"):
            if CJK_RE.search(en_meta.get(k, "")):
                errors.append(f"G5 [{slug}.en.{k}]: contains unexpected CJK text")

        for lang in ("zh", "en"):
            checked += 1
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

            # G0/G3/G4: inspect GIF frames & end-state hold
            frames = []
            durations = []
            for f in ImageSequence.Iterator(gif_im):
                frames.append(f.convert("RGB").copy())
                durations.append(int(f.info.get("duration", round(1000 / fps))))

            if not frames:
                errors.append(f"G0 [{base}]: GIF has 0 frames")
                continue

            # Non-blank frame 0 check: standard deviation / pixel range
            ext = frames[0].getextrema()
            if all(lo == hi for lo, hi in ext):
                errors.append(f"G0 [{base}]: frame 0 is completely solid/blank")

            if spec["profile"] == "flat-paper":
                purity = check_paper_margin_purity(frames[0])
                if purity < 99.0:
                    errors.append(f"G3 [{base}]: flat-paper margin purity {purity:.2f}% < 99.0%")

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

            print(
                f"  [pass] {base}: {w}x{h}, gif={gif_kb:.1f}KB, webp={webp_kb:.1f}KB, "
                f"poster={poster_kb:.1f}KB, tail={tail_ms}ms"
            )

    if errors:
        print("\nQA GATE FAILURES:", file=sys.stderr)
        for e in errors:
            print("  -", e, file=sys.stderr)
        return 1

    print(f"\nAll G0-G5 gates passed across {checked} demo assets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
