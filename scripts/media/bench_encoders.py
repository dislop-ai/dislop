#!/usr/bin/env python3
"""
Controlled encoding benchmark across 6 animation delivery pipelines for dislop.

Evaluates real rendered frames from:
  1) proof-cycle-zh-v2 (flat-paper editorial typography + red/blue strokes)
  2) ui-slop-zh-v2 (mixed dark gradient slop card + flat-paper sheet)

Pipelines tested:
  - gif-diff-none         (palettegen=96:diff, dither=none, gifsicle -O3 --lossy=20)
  - gif-full-sierra       (palettegen=128:full, dither=sierra2_4a, gifsicle -O3 --lossy=40)
  - gif-diff-bayer3       (palettegen=128:diff, dither=bayer:bayer_scale=3, gifsicle -O3 --lossy=20)
  - gif-2x-lanczos-none   (2x supersampled capture -> Lanczos downscale -> 96c diff, dither=none)
  - webp-anim-q84         (img2webp -loop 0 -lossy -q 84 -m 4)
  - webp-anim-lossless    (img2webp -loop 0 -lossless -m 4)
  - mp4-h264-crf22        (ffmpeg libx264 yuv420p crf 22)

Measures file size (KB), average PSNR (dB) vs ground-truth PNG frames,
flat-paper background purity (% exact #FFFFFF/#F6F7F5 retention), and encode time (s).
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageChops, ImageSequence
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_gifs as rg

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = Path(__file__).resolve().parent / "encoder-benchmark-latest.json"

PAPER_RGBS = {(255, 255, 255), (246, 247, 245)}


def render_png_sequence(page, html_text: str, width: int, height: int, fps: int, duration: float, out_dir: Path, scale: int = 1) -> list[Path]:
    html_path = out_dir / f"scene_{scale}x.html"
    html_path.write_text(html_text, encoding="utf-8")
    page.set_viewport_size({"width": width, "height": height})
    page.goto(html_path.as_uri(), wait_until="load")

    total = int(round(duration * fps))
    frames: list[Path] = []
    for i in range(total):
        t = i / fps
        page.evaluate(f"window.__renderAt({t:.4f})")
        fp = out_dir / f"frame_{i:04d}.png"
        page.screenshot(path=str(fp))
        frames.append(fp)
    return frames


def compute_metrics(gt_frames: list[Path], decoded_frames: list[Image.Image], sample_indices: list[int]) -> tuple[float, float]:
    """Return (avg_psnr_db, paper_purity_pct) across sampled frames."""
    psnrs = []
    purities = []

    for idx in sample_indices:
        gt = Image.open(gt_frames[idx]).convert("RGB")
        dec = decoded_frames[min(idx, len(decoded_frames) - 1)].convert("RGB")
        if dec.size != gt.size:
            dec = dec.resize(gt.size, Image.Resampling.LANCZOS)

        # MSE via Pillow histogram of squared difference
        diff = ImageChops.difference(gt, dec)
        hist = diff.histogram()  # 256*3 bins
        sq_sum = 0
        for ch in range(3):
            offset = ch * 256
            for val in range(256):
                sq_sum += hist[offset + val] * (val * val)
        total_vals = gt.width * gt.height * 3
        mse = sq_sum / total_vals if total_vals else 0.0
        psnr = 99.9 if mse <= 1e-9 else 10.0 * math.log10((255.0 * 255.0) / mse)
        psnrs.append(psnr)

        # Paper purity: among pixels that are pure #FFFFFF or #F6F7F5 in ground truth, what % stay exact?
        gt_bytes = gt.tobytes()
        dec_bytes = dec.tobytes()
        paper_total = 0
        paper_exact = 0
        # Stride by 3 bytes per pixel; sample every 2nd pixel for speed (deterministic)
        for p in range(0, len(gt_bytes), 6):
            r, g, b = gt_bytes[p], gt_bytes[p + 1], gt_bytes[p + 2]
            if (r, g, b) in PAPER_RGBS:
                paper_total += 1
                if dec_bytes[p] == r and dec_bytes[p + 1] == g and dec_bytes[p + 2] == b:
                    paper_exact += 1
        purity = (paper_exact / paper_total * 100.0) if paper_total else 100.0
        purities.append(purity)

    return (sum(psnrs) / len(psnrs), sum(purities) / len(purities))


def decode_video_frames(path: Path, sample_indices: list[int]) -> dict[int, Image.Image]:
    out = {}
    with tempfile.TemporaryDirectory(prefix="dislop-dec-") as td:
        tmp = Path(td)
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(path), str(tmp / "dec_%04d.png")],
            check=True,
        )
        all_pngs = sorted(tmp.glob("dec_*.png"))
        for idx in sample_indices:
            if all_pngs:
                pick = all_pngs[min(idx, len(all_pngs) - 1)]
                out[idx] = Image.open(pick).convert("RGB").copy()
    return out


def decode_animated_frames(path: Path) -> list[Image.Image]:
    if path.suffix == ".webp":
        # Pillow decodes animated WebP cleanly
        im = Image.open(path)
        return [frame.convert("RGB").copy() for frame in ImageSequence.Iterator(im)]
    im = Image.open(path)
    return [frame.convert("RGB").copy() for frame in ImageSequence.Iterator(im)]


def run_benchmark_for_scene(pw, slug: str, html_text: str, width: int, height: int, fps: int, duration: float) -> list[dict]:
    records = []
    with tempfile.TemporaryDirectory(prefix=f"dislop-benchenc-{slug}-") as td:
        root_tmp = Path(td)
        dir_1x = root_tmp / "frames_1x"
        dir_2x = root_tmp / "frames_2x"
        dir_1x.mkdir()
        dir_2x.mkdir()

        # Render 1x ground-truth frames
        b1 = pw.chromium.launch()
        p1 = b1.new_page(device_scale_factor=1)
        gt_frames = render_png_sequence(p1, html_text, width, height, fps, duration, dir_1x, scale=1)
        b1.close()

        # Render 2x supersampled frames and downscale to 1x via Lanczos
        b2 = pw.chromium.launch()
        p2 = b2.new_page(device_scale_factor=2)
        hi_frames = render_png_sequence(p2, html_text, width, height, fps, duration, dir_2x, scale=2)
        b2.close()
        dir_2x_down = root_tmp / "frames_2x_down"
        dir_2x_down.mkdir()
        for fp in hi_frames:
            im = Image.open(fp).convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
            im.save(dir_2x_down / fp.name)

        n = len(gt_frames)
        sample_indices = sorted({0, int(n * 0.2), int(n * 0.45), int(n * 0.7), n - 1})

        # 1. gif-diff-none
        t0 = time.perf_counter()
        out_1 = root_tmp / "gif-diff-none.gif"
        rg.encode_gif(dir_1x, out_1, fps=fps, max_colors=96, dither="none", lossy=20)
        dt = time.perf_counter() - t0
        dec = decode_animated_frames(out_1)
        psnr, purity = compute_metrics(gt_frames, dec, sample_indices)
        records.append({"scene": slug, "pipeline": "gif-diff-none", "size_kb": round(out_1.stat().st_size / 1024, 1), "psnr_db": round(psnr, 2), "paper_purity_pct": round(purity, 2), "encode_sec": round(dt, 2)})

        # 2. gif-full-sierra
        t0 = time.perf_counter()
        out_2_raw = root_tmp / "gif-full-sierra-raw.gif"
        out_2 = root_tmp / "gif-full-sierra.gif"
        pal2 = root_tmp / "pal2.png"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-framerate", str(fps), "-i", str(dir_1x / "frame_%04d.png"), "-vf", "palettegen=max_colors=128:stats_mode=full", str(pal2)], check=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-framerate", str(fps), "-i", str(dir_1x / "frame_%04d.png"), "-i", str(pal2), "-lavfi", "[0:v][1:v]paletteuse=dither=sierra2_4a", "-loop", "0", str(out_2_raw)], check=True)
        subprocess.run(["gifsicle", "-O3", "--lossy=40", str(out_2_raw), "-o", str(out_2)], check=True)
        dt = time.perf_counter() - t0
        dec = decode_animated_frames(out_2)
        psnr, purity = compute_metrics(gt_frames, dec, sample_indices)
        records.append({"scene": slug, "pipeline": "gif-full-sierra", "size_kb": round(out_2.stat().st_size / 1024, 1), "psnr_db": round(psnr, 2), "paper_purity_pct": round(purity, 2), "encode_sec": round(dt, 2)})

        # 3. gif-diff-bayer3
        t0 = time.perf_counter()
        out_3 = root_tmp / "gif-diff-bayer3.gif"
        rg.encode_gif(dir_1x, out_3, fps=fps, max_colors=128, dither="bayer", lossy=20)
        dt = time.perf_counter() - t0
        dec = decode_animated_frames(out_3)
        psnr, purity = compute_metrics(gt_frames, dec, sample_indices)
        records.append({"scene": slug, "pipeline": "gif-diff-bayer3", "size_kb": round(out_3.stat().st_size / 1024, 1), "psnr_db": round(psnr, 2), "paper_purity_pct": round(purity, 2), "encode_sec": round(dt, 2)})

        # 4. gif-2x-lanczos-none
        t0 = time.perf_counter()
        out_4 = root_tmp / "gif-2x-lanczos-none.gif"
        rg.encode_gif(dir_2x_down, out_4, fps=fps, max_colors=96, dither="none", lossy=20)
        dt = time.perf_counter() - t0
        dec = decode_animated_frames(out_4)
        psnr, purity = compute_metrics(gt_frames, dec, sample_indices)
        records.append({"scene": slug, "pipeline": "gif-2x-lanczos-none", "size_kb": round(out_4.stat().st_size / 1024, 1), "psnr_db": round(psnr, 2), "paper_purity_pct": round(purity, 2), "encode_sec": round(dt, 2)})

        # 5a. webp-anim-q84
        t0 = time.perf_counter()
        out_5a = root_tmp / "webp-anim-q84.webp"
        rg.encode_webp(gt_frames, out_5a, fps=fps, quality=84)
        dt = time.perf_counter() - t0
        dec = decode_animated_frames(out_5a)
        psnr, purity = compute_metrics(gt_frames, dec, sample_indices)
        records.append({"scene": slug, "pipeline": "webp-anim-q84", "size_kb": round(out_5a.stat().st_size / 1024, 1), "psnr_db": round(psnr, 2), "paper_purity_pct": round(purity, 2), "encode_sec": round(dt, 2)})

        # 5b. webp-anim-lossless
        t0 = time.perf_counter()
        out_5b = root_tmp / "webp-anim-lossless.webp"
        dur_ms = max(20, int(round(1000 / fps)))
        grouped: list[tuple[Path, int]] = []
        last_bytes = None
        for fp in gt_frames:
            b = fp.read_bytes()
            if grouped and last_bytes == b:
                pfp, pdur = grouped[-1]
                grouped[-1] = (pfp, pdur + dur_ms)
            else:
                grouped.append((fp, dur_ms))
                last_bytes = b
        cmd_ll = ["img2webp", "-loop", "0", "-lossless", "-m", "4"]
        for fp, d in grouped:
            cmd_ll.extend(["-d", str(d), str(fp)])
        cmd_ll.extend(["-o", str(out_5b)])
        subprocess.run(cmd_ll, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        dt = time.perf_counter() - t0
        dec = decode_animated_frames(out_5b)
        psnr, purity = compute_metrics(gt_frames, dec, sample_indices)
        records.append({"scene": slug, "pipeline": "webp-anim-lossless", "size_kb": round(out_5b.stat().st_size / 1024, 1), "psnr_db": round(psnr, 2), "paper_purity_pct": round(purity, 2), "encode_sec": round(dt, 2)})

        # 6. mp4-h264-crf22
        t0 = time.perf_counter()
        out_6 = root_tmp / "mp4-h264-crf22.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error", "-framerate", str(fps),
                "-i", str(dir_1x / "frame_%04d.png"),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-an",
                str(out_6),
            ],
            check=True,
        )
        dt = time.perf_counter() - t0
        dec_map = decode_video_frames(out_6, sample_indices)
        dec_list = [dec_map.get(i, dec_map[sample_indices[0]]) for i in range(n)]
        psnr, purity = compute_metrics(gt_frames, dec_list, sample_indices)
        records.append({"scene": slug, "pipeline": "mp4-h264-crf22", "size_kb": round(out_6.stat().st_size / 1024, 1), "psnr_db": round(psnr, 2), "paper_purity_pct": round(purity, 2), "encode_sec": round(dt, 2)})

    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark GIF, WebP, and MP4 encoding pipelines on dislop scenes.")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Path to write JSON benchmark report.")
    args = parser.parse_args()

    all_records = []
    with sync_playwright() as pw:
        all_records.extend(run_benchmark_for_scene(pw, "proof-cycle-zh", rg.proof_cycle_html("zh", 6.8), 960, 500, 16, 6.8))
        all_records.extend(run_benchmark_for_scene(pw, "ui-slop-zh", rg.ui_slop_html("zh", 6.8), 960, 500, 16, 6.8))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "dislop.media-bench/1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "records": all_records,
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print("| Scene | Pipeline | Size (KB) | PSNR (dB) | Paper Purity (%) | Time (s) |")
    print("|---|---|---:|---:|---:|---:|")
    for r in all_records:
        print(f"| {r['scene']} | `{r['pipeline']}` | {r['size_kb']} | {r['psnr_db']} | {r['paper_purity_pct']} | {r['encode_sec']} |")
    print(f"\nSaved JSON to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
