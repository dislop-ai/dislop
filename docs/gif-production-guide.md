# Animation, GIF & WebP Production Guide

[简体中文](./gif-production-guide.zh-CN.md)

This guide specifies how `dislop` builds, verifies, and delivers animated demos across `dislop.com` (`/`), `/zh/`, `/guides/`, GitHub READMEs, editor marketplaces, and social posts. Visual tokens live in [design-system.md](./design-system.md), copy rules in [brand-and-voice-guide.md](./brand-and-voice-guide.md), and measured encoder data in [gif-encoding-experiments-2026.zh-CN.md](./research/gif-encoding-experiments-2026.zh-CN.md).

---

## 1. Brand Motion Rules & Banned Patterns

`dislop` visuals follow one theme: **a galley proof sheet with crisp vermilion proofreader marks**. Motion exists only to show what was flagged, what broke on overcorrection, and what changed after cleanup.

### Reuse site color & type tokens

| Category | Exact tokens and constraints |
|---|---|
| Light paper ground | `--stage` `#F6F7F5`, `--sheet` `#FFFFFF`, `1px` hairline `--rule` `#D5D7D2`, `--ink` `#14171A`, `--ink-2` `#474C55`, `--ink-3` `#5E646E` |
| Dark terminal & ink stage | Terminal frame `#15181C` (well `#0A0C0E`, border `#2A2F37`), social/demo ink stage `--ink-stage` `#14171A` (elevated `#1D2127`, border `#2D333B`), ink `#ECEEF0`, muted `#A6ACB5` |
| Semantic marks | Vermilion `--pen` `#F04438` (`#B42318` text on light / `#FF7A6B` on dark, wash `#FEF3F2`) + `2px solid` line or *dele* loop for `core` errors; Cobalt Blue `#1B52B0` (`#85B4FF` on dark, wash `#EFF4FF`) + `1.5px dashed` line for warnings; `--mark-ok` `#1E6B47` (`#6CD49B` on dark) strictly for `0 issues` / `preserved` pass states |
| Zero external fonts | Render strictly with the system font stack (`sans`, `serif`, `mono`) and zero outbound CDN calls |

### What never appears in dislop animations

| Banned element | Why it fails | What to use instead |
|---|---|---|
| Purple-pink neon gradients, glow orbs, glassmorphism | First-wave AI SaaS template pattern flagged by `dislop` itself | Flat paper `#FFFFFF` / `#F6F7F5` with `1px solid #D5D7D2` rails |
| Corner chapter kickers (`01 / INTRO`) or fake macOS window dots | Decorative clutter that eats copy space | Single-row header bar with filename, pack, and exit code |
| Character-by-character typewriter + blinking cursor | Forces viewers to wait for fake typing | Crisp `180–260ms` `ease-out` reveals and instant line cascades |
| Bouncy `scale(0)` springs, continuous wobble, or drift shimmer | Looks noisy, causes H.264 serif shimmer, and inflates frame-diff payload | Short `ease-out` transitions; hold final clean state `>= 1.8s` |
| Progress bars, duration badges, or player button chrome | Distracts from specimen text and adds fake UI chrome | Zero progress bars and zero visible player buttons; click media surface itself to pause |
| Invented rule IDs, fake CLI output, or made-up metrics | Breaks factual grounding | Ground CLI and PPTX scenes directly from `node bin/dislop.mjs check` |

---

## 2. Six-Scene Catalog (v2)

All scenes are declared in [scripts/media/demos.manifest.json](../scripts/media/demos.manifest.json) (`dislop.demos/2`). English (`-en-v2`) serves as the primary baseline for `dislop.com` (`/`), global READMEs, editor marketplaces, and `@dislop_ai`, paired with native Chinese (`-zh-v2`) counterparts for `/zh/` and `README.zh-CN.md` surfaces, with zero cross-language mixing.

| Slug | Dimensions | FPS / Length | Profile | Size Budgets (GIF / WebP / Poster) | Primary Surfaces |
|---|---|---|---|---|---|
| `proof-cycle` | `960×500` | `16 fps` / `6.8s` | `flat-paper` | `450 / 240 / 45 KB` | `/`, `/zh/`, README, VS Code Marketplace, Guides |
| `cli-check` | `920×460` | `15 fps` / `6.4s` | `dark-terminal` | `350 / 200 / 45 KB` | `/`, `/zh/`, README, Agent/CI guide |
| `workbench-live` | `1140×640` | `12 fps` / `6.8s` | `live-dom` | `550 / 300 / 65 KB` | `/`, `/zh/`, README, Writing guide |
| `ui-slop` | `960×500` | `16 fps` / `6.8s` | `flat-paper` | `480 / 260 / 50 KB` | `/`, `/zh/`, README, Web UI guide |
| `deck-office` | `960×500` | `16 fps` / `6.8s` | `flat-paper` | `480 / 260 / 50 KB` | `/`, `/zh/`, README, PPTX/DOCX guide |
| `agent-workflow` | `960×500` | `16 fps` / `6.8s` | `dark-terminal` | `420 / 240 / 50 KB` | `/`, `/zh/`, README, Antigravity plugin, Agent/CI guide |

Legacy `-v1.gif` and `-v1-poster.png` files stay in `assets/demos/` so existing external URLs never break.

---

## 3. Deterministic Rendering, Encoding & Verification

All rendering, encoding experiments, and QA checks run offline with Python stdlib, Playwright Chromium, FFmpeg, `gifsicle`, `img2webp` (`libwebp`), and Pillow:

```bash
# Render all 6 bilingual scenes (.gif + .webp + -poster.png) and 6-frame QA sheets
npm run media:render

# Run automated G0-G5 verification gates across all 12 asset sets
npm run media:verify

# Reproduce the 7-pipeline encoding benchmark (size, PSNR, white-paper purity)
npm run media:bench

# Optional: export 1080x600 H.264 MP4 clips for X (@dislop_ai) outside the repo
python3 scripts/media/render_gifs.py --social-dir /tmp/dislop-social
```

### Progressive `<picture>` delivery on `dislop.com`

Measured results in `encoder-benchmark-latest.json` show that **lossless animated WebP (`img2webp -loop 0 -lossless -m 4`)** achieves `99.9 dB` lossless clarity and `100.0%` white-paper background purity at sizes matching or beating lossy WebP (`35–198 KB` across flat-paper and terminal scenes), while `dither=none` 96-color GIF keeps GitHub READMEs and legacy clients speckle-free (`100.0%` purity).

Every web surface (`site/index.html` at `/`, `site/zh/index.html` at `/zh/`, and compiled `/guides/` and `/zh/guides/` pages) serves a three-tier `<picture>` element:

1. `<source media="(prefers-reduced-motion: reduce)" srcset="...-poster.png">` — instant static frame for reduced-motion users.
2. `<source type="image/webp" srcset="...webp">` — lossless animated WebP for modern browsers.
3. `<img src="...gif" loading="lazy" decoding="async">` — universal GIF fallback.

Animations have zero progress bars, zero duration badges, and zero visible player button chrome. On interactive web pages, clicking the media surface itself (`<button aria-pressed>`) pauses the animation to its static poster for WCAG 2.2.2, and `prefers-reduced-motion` serves the static poster automatically.

---

## 4. Automated QA Gates (G0–G5)

`npm run media:verify` enforces all six gates on every release:

| Gate | Check | Passing bar |
|---|---|---|
| G0 | Format & loop | `GIF89a` header with `NETSCAPE2.0` (`loop=0`), valid `RIFF/WEBP` `ANIM` header, valid PNG poster, and non-blank frame 0 |
| G1 | Dimension parity | Exact pixel dimensions match `demos.manifest.json` across `.gif`, `.webp`, and `-poster.png` |
| G2 | Live engine grounding | Executes `node bin/dislop.mjs check` against the canonical ZH/EN specimens and asserts rule IDs and exit codes match |
| G3 | Budgets & paper purity | Enforces per-scene KB caps and verifies `>= 99.0%` exact `#F6F7F5` / `#FFFFFF` retention on flat-paper GIF margins |
| G4 | End-state hold | Confirms the final `>= 1.5s` of decoded frames remain visually stable so readers can finish reading the pass state |
| G5 | Bilingual isolation | Blocks CJK characters in English manifest copy and maintains separate `-zh-v2` / `-en-v2` outputs |
