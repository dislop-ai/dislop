#!/usr/bin/env python3
"""
Deterministic brand SVG geometry measurer and OpenGraph card PNG renderer.

Uses Playwright Chromium at 1x scale so SVG `getBBox()` measurements match the
exact font metrics rendered in desktop browsers, and rasterizes `assets/og-card.svg`
and `assets/og-card-zh.svg` into crisp palette-quantized 1200x630 PNGs.

Usage:
  python3 scripts/media/render_brand_assets.py --measure
  python3 scripts/media/render_brand_assets.py
"""

from __future__ import annotations

import argparse
import json
import re
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ASSETS_DIR = ROOT / "assets"

BRAND_SVGS = [
    "banner-light.svg",
    "banner-dark.svg",
    "banner-zh-light.svg",
    "banner-zh-dark.svg",
    "og-card.svg",
    "og-card-zh.svg",
]

OG_CARDS = [
    ("og-card.svg", "og-card.png"),
    ("og-card-zh.svg", "og-card-zh.png"),
]

MEASURE_JS = r"""() => {
  const svg = document.querySelector('svg');
  if (!svg) return { elements: [] };
  const rows = [];
  for (const el of svg.querySelectorAll('text, tspan, line, path, rect')) {
    const tag = el.tagName.toLowerCase();
    let b;
    try { b = el.getBBox(); } catch (_) { continue; }
    rows.push({
      tag,
      text: tag === 'text' || tag === 'tspan' ? (el.textContent || '').trim() : undefined,
      stroke: el.getAttribute('stroke') || undefined,
      rx: el.getAttribute('rx') || undefined,
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
      w: Math.round(b.width * 10) / 10,
      h: Math.round(b.height * 10) / 10,
      right: Math.round((b.x + b.width) * 10) / 10,
      bottom: Math.round((b.y + b.height) * 10) / 10,
      midY: Math.round((b.y + b.height / 2) * 10) / 10,
    });
  }
  return { elements: rows };
}"""


def parse_viewbox(svg_raw: str) -> tuple[int, int]:
    m = re.search(r'viewBox=["\']\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["\']', svg_raw)
    if not m:
        return (1200, 630)
    return (round(float(m.group(1))), round(float(m.group(2))))


def render_svg_to_png(page, svg_path: Path, out_png: Path, colors: int = 96) -> dict:
    svg_raw = svg_path.read_text(encoding="utf-8")
    w, h = parse_viewbox(svg_raw)
    page.set_viewport_size({"width": w, "height": h})
    html = f"<!doctype html><html><body style='margin:0;padding:0;background:transparent'>{svg_raw}</body></html>"
    page.set_content(html, wait_until="load")
    page.wait_for_timeout(40)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
        raw_tmp = Path(tf.name)
    try:
        page.screenshot(path=str(raw_tmp), omit_background=False)
        with Image.open(raw_tmp) as im:
            rgb = im.convert("RGB")
            quant = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
            quant.save(out_png, format="PNG", optimize=True)
    finally:
        raw_tmp.unlink(missing_ok=True)

    return {
        "svg": str(svg_path.relative_to(ROOT) if svg_path.is_relative_to(ROOT) else svg_path),
        "png": str(out_png.relative_to(ROOT) if out_png.is_relative_to(ROOT) else out_png),
        "width": w,
        "height": h,
        "kb": round(out_png.stat().st_size / 1024, 1),
    }


def measure_svgs(only: set[str] | None = None) -> list[dict]:
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=1)
        for name in BRAND_SVGS:
            if only and name not in only:
                continue
            svg_path = ASSETS_DIR / name
            svg_raw = svg_path.read_text(encoding="utf-8")
            w, h = parse_viewbox(svg_raw)
            page.set_viewport_size({"width": w, "height": h})
            html = f"<!doctype html><html><body style='margin:0;padding:0;background:transparent'>{svg_raw}</body></html>"
            page.set_content(html, wait_until="load")
            page.wait_for_timeout(40)
            info = page.evaluate(MEASURE_JS)
            results.append({
                "file": str(svg_path.relative_to(ROOT)),
                "width": w,
                "height": h,
                **info,
            })
        browser.close()
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure dislop brand SVGs and render 1200x630 OG card PNGs.")
    parser.add_argument("--measure", action="store_true", help="Print SVG getBBox() geometry for brand SVGs.")
    parser.add_argument("--only", default="", help="Comma-separated SVG filenames for --measure.")
    parser.add_argument("--colors", type=int, default=96, help="Palette size for quantized OG card PNGs.")
    parser.add_argument("--banners-dir", default="", help="Optional directory to also rasterize banner-*.svg PNGs.")
    args = parser.parse_args()

    only = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else None

    if args.measure:
        print(json.dumps(measure_svgs(only=only), ensure_ascii=False, indent=2))
        return 0

    rendered = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=1)
        for svg_name, png_name in OG_CARDS:
            rendered.append(render_svg_to_png(page, ASSETS_DIR / svg_name, ASSETS_DIR / png_name, colors=args.colors))
        if args.banners_dir:
            bdir = Path(args.banners_dir)
            bdir.mkdir(parents=True, exist_ok=True)
            for name in BRAND_SVGS:
                if name.startswith("banner-"):
                    rendered.append(render_svg_to_png(page, ASSETS_DIR / name, bdir / name.replace(".svg", ".png"), colors=args.colors))
        browser.close()

    for r in rendered:
        print(f"  [ok] {r['svg']} -> {r['png']} ({r['width']}x{r['height']}, {r['kb']} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
