# Brand, Visual & UI Design System

[简体中文](./design-system.zh-CN.md)

`dislop` audits interfaces, slides, and prose for template noise. Its own visual identity, documentation banners, and web workbench (`site/`) follow one verifiable system: **an architectural galley proof sheet with hand-drawn proofreader marks** (paired with the voice and personality rules in [brand-and-voice-guide.md](./brand-and-voice-guide.md)). Automated lint and token checks run on `site/` and `assets/` in CI via `dislop check . --fail-on warning` and `tests/test_site.mjs`.

## 1. Visual Direction & Why Two Defaults Were Rejected

Current AI-generated developer pages cluster around two recognizable defaults:

1. **Generator Default #1 (2023–2025)**: Dark slate backgrounds with indigo-to-pink neon gradients, glowing `rounded-full` pill badges, and gradient-clipped headlines.
2. **Generator Default #2 (2025–2026)**: Warm cream backgrounds (`#F7F5F0`), Tailwind `stone-900` (`#1C1917`), and terracotta accents—what models produce immediately after being told "do not use purple gradients."

`dislop` avoids both. Instead, it borrows from two human trades:

- **Print Proofreading (Western Galley Proofs & GB/T 14706 Proofreading Symbols)**: Neutral cotton press paper, high-contrast carbon ink, serif manuscript columns for text under review, and margin notes linked to exact spans.
- **Architectural Software Grids**: Continuous `1px` structural hairlines, crisp `0–4px` radii on content cells, zero drop-shadow fog, and working tools in the first viewport rather than marketing illustrations.

## 2. Brand Mark & Wordmark

- **The Mark (`assets/logo.svg`)**: A single continuous proofreader's delete stroke (*dele* / GB/T 14706 delete mark) cutting horizontally across a muted manuscript rule and looping cleanly upward and down-right. Tested at `16×16` (favicon), `64×64` (organization avatar), and `512×512` so the inner counter of the loop stays open at tab-icon scale.
- **Wordmark**: Lowercase `dislop` set in tight geometric sans (`font-weight: 700`, `letter-spacing: -0.025em`) without version pills, sparkles, or nested badge rings. On desktop (`>= 1100px`) a `1px` divider separates one line of small monospace text, `AI slop linter · v<version>`; `scripts/build_site.mjs` writes the version from `package.json`, and the line hides on narrow screens.
- **Hero Dele Stroke**: The stroke that strikes `Certainly! Here is your polished draft.` on the homepage is the logo mark in motion. One `--pen` line crosses the sentence, loops up and right at the end, and exits down-right (`viewBox 0 0 340 40`, `stroke-width: 3`, `vector-effect: non-scaling-stroke`). It draws once on load (`300ms ease-out`) and renders in its final state under `prefers-reduced-motion`. The loop sits in a `40px` gutter after the sentence, clear of the headline below.
- **Repository Banners (`assets/banner-light.svg`, `assets/banner-dark.svg`)**: Paired via HTML `<picture>` (`prefers-color-scheme`) so GitHub renders native light and dark galley proofs rather than a bright white rectangle on dark mode. Both themes keep the master `#F04438` Vermilion loop in the logo tile and reserve Vermilion strictly for `core` `error` defects (`chatbot-artifact`), paired with Cobalt Blue dashed marks for style warnings.
- **Social Preview Cards (`assets/og-card.svg`, `assets/og-card.png` for `/`; `assets/og-card-zh.svg`, `assets/og-card-zh.png` for `/zh/`, `1200×630`)**: Architectural galley proof Open Graph cards synced into `site/assets/` for X, GitHub, Slack, Discord, and messaging previews.
- **Animated Demo Clips (`assets/demos/*-{zh,en}-v2.{gif,webp}` and `-poster.png`)**: Language-separated demo animations for README, `dislop.com` (`/`), `/zh/`, `/guides/`, and editor marketplaces delivered via `<picture>` (reduced-motion PNG poster, lossless animated WebP, no-dither GIF fallback); production workflow and G0–G5 gates are documented in [gif-production-guide.md](./gif-production-guide.md) ([简体中文](./gif-production-guide.zh-CN.md)).

## 3. Color Tokens & Monotonic Dark Elevation

All foreground/background text combinations meet or exceed **WCAG 2.2 AA (`4.5:1` normal text, `3.0:1` large text)**, and functional control borders (`--control-border`) exceed **WCAG 2.2 Non-Text Contrast (`3.0:1`)** against adjacent surfaces. In dark mode, surface lightness (`L*`) increases strictly from outer stage to raised sheet—never inverting elevation (`inset` code/input wells are the sole recessed exception).

| Token | Role | Light Hex | Contrast on Sheet | Dark Hex | Dark `L*` / Contrast |
|---|---|---|---|---|---|
| `--pen` | Drawn strokes (`>= 2.5px`) & master logo loop | `#F04438` | `3.8 : 1` (`4.8:1` on tile) | `#F04438` | `L* = 55.0` (`4.7 : 1` on dark sheet) |
| `--stage` | Outer margin / viewport ground | `#F6F7F5` | — (`L* = 97.1`) | `#0E1012` | `L* = 4.6` |
| `--sheet` | Primary galley column / card | `#FFFFFF` | — (`L* = 100.0`) | `#15181C` | `L* = 8.1` (`> stage`) |
| `--raised` | Active control / hover / header | `#ECEEE9` | — (`L* = 93.8`) | `#1D2127` | `L* = 12.6` (`> sheet`) |
| `--inset` | Recessed code / raw input well | `#F1F3F0` | — | `#0A0C0E` | `L* = 3.2` (recessed) |
| `--rule` | `1px` architectural hairlines | `#D5D7D2` | Decorative rail | `#2A2F37` | Decorative rail |
| `--control-border` | Interactive inputs, selects & buttons | `#767C85` | `4.2 : 1` (`3.6:1` on raised) | `#6F7784` | `3.9 : 1` (`3.6:1` on raised) |
| `--ink` | Primary copy & headlines | `#14171A` | `18.0 : 1` | `#ECEEF0` | `15.3 : 1` |
| `--ink-2` | Secondary labels & descriptions | `#474C55` | `8.6 : 1` | `#A6ACB5` | `7.8 : 1` |
| `--ink-3` | Line numbers & coordinates | `#5E646E` | `6.0 : 1` | `#8C939E` | `5.8 : 1` |
| `--mark-error` | Hard AI artifact error text & solid underline | `#B42318` | `6.6 : 1` | `#FF7A6B` | `7.0 : 1` |
| `--mark-error-wash` | Inline span tint behind `error` marks | `#FEF3F2` | — | `rgba(240,68,56,0.14)` | — |
| `--mark-warn` | Style and template warning text & dashed underline | `#1B52B0` | `7.3 : 1` | `#85B4FF` | `8.5 : 1` |
| `--mark-warn-wash` | Inline span tint behind `warning` marks | `#EFF4FF` | — | `rgba(133,180,255,0.12)` | — |
| `--mark-ok` | Clean pass (`0 issues` / `preserved`) status text | `#1E6B47` | `6.4 : 1` | `#6CD49B` | `10.1 : 1` |
| `--control-border-quiet` | Tier-3 quiet control border (toolbar secondaries, filters, share actions) | `#888E97` | `3.3 : 1` (`3.1:1` on stage) | `#636A76` | `3.3 : 1` (`3.5:1` on stage) |

### Charcoal Ink Stage (`--ink-stage`, same in both themes)

The logo tile's `#14171A` becomes three dark surfaces: the homepage agent prompt card, the setup terminal (`#cli-mcp`), and the demo room (`#demos`). Values do not change between themes. In dark mode the stage and the sheet are nearly the same color, so the outer edge switches to `--rule-strong`.

| Token | Role | Value | Contrast on `#14171A` |
|---|---|---|---|
| `--ink-stage` | Stage background | `#14171A` | — |
| `--ink-stage-elevated` | Tab band inside the stage | `#1D2127` | — |
| `--ink-stage-border` | `1px` hairlines inside the stage | `#2D333B` | Decorative |
| `--ink-stage-control-border` | Control borders on the stage | `#6F7784` | `4.0 : 1` (`3.6:1` on tab band) |
| `--ink-stage-ink` | Body text on the stage | `#ECEEF0` | `15.5 : 1` |
| `--ink-stage-muted` | Secondary text and idle tabs | `#A6ACB5` | `7.9 : 1` |
| `--ink-stage-pen` | Small red text on the stage (error counts, status notes) | `#FF7A6B` | `7.1 : 1` (`6.4:1` on tab band) |
| `--ink-stage-focus` | Keyboard focus ring and links on the stage | `#85B4FF` | `8.5 : 1` |

On the stage, `#F04438` only draws strokes of `>= 2.5px` (the dele mark, the selected tab's bottom edge). Small red text always uses `--ink-stage-pen`.

## 4. Two-Mark Proofreading Semantics

Color is never the sole indicator of meaning. Every inline mark pairs hue with distinct stroke geometry and a monospace label:

1. **Vermilion Solid (`--mark-error` + `2px solid` underline + `error`)**: Objective `core` AI delivery artifacts—stray chatbot greetings, unfilled `[insert ...]` or `{{var}}` placeholders, raw Markdown pasted unrendered into Office files, dead `<a href="#">` links, or unexplained disabled buttons. Red appears in exactly two forms on the page: this hard-bug mark, and brand `--pen` strokes of `>= 2.5px` (the logo, the hero dele stroke, the current-selection bar or underline, and the featured pricing column's top edge). No red fills, red badges, or red decorative text.
2. **Cobalt Blue Dashed (`--mark-warn` + `1.5px dashed` underline + `warn` / `info`)**: Scenario-pack style and template warnings—throat-clearing openers, `"Not X, but Y"` negation pivots, staccato slogan runs, purple-pink AI gradients, or slide word-walls.

## 5. Typography & Bilingual Typesetting

Zero third-party font CDNs (`fonts.googleapis.com`, `unpkg`, `jsdelivr`) are loaded—preserving instant rendering in both mainland China and overseas networks and upholding the workbench's zero-outbound-request guarantee.

- **Manuscript Text (Specimens & Prose Under Review)**:
  `Georgia, "Source Serif 4", "Noto Serif CJK SC", "Songti SC", "STSong", "Microsoft YaHei", serif`
  - Measure capped at `65ch` (Latin) / `36` characters (Chinese).
  - Line height `1.6` for English, `1.8` for Chinese (`:lang(zh)`).
- **Interface Chrome & Headings**:
  `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- **Coordinates, Rule IDs, CLI Commands & Counts**:
  `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` with `font-variant-numeric: tabular-nums`.

## 6. Layout Grid, Controls & Graphic Discipline

The page container caps at `1240px` between continuous `1px solid var(--rule)` vertical rails, with full-bleed `1px` horizontal rules instead of floating drop-shadow cards. Each section title gets an `18px`, `1px` tick on the left rail and stays a plain sentence without a numbered eyebrow. Content cells joined to rails use `0px` radius, pressable buttons use `--radius-ctrl: 6px` (`5px` compact), and recessed inputs or code wells use `--radius-input: 4px`; pill radii (`999px`) and three-level nested boxes (`box-in-box-in-box`) are banned.

Interactive controls split into three tiers so button rows do not read as one heavy gray block: primary `.btn-primary` (solid ink, `6px` radius, one or two per screen), standard `.ctrl-btn` (`--raised` fill + `--control-border`), and quiet `.sheet-btn` (transparent + `--control-border-quiet`, `--ink` border on hover) for toolbar secondaries, rule filters, and share buttons. In the workbench, the manuscript column sits between a left specimen rail and a right margin notes column; margin notes drop below `< 1040px`, and the specimen rail collapses into a horizontal strip below `< 820px`. Every `<button>` and `<a>` performs an immediate action or navigates to a live target, with standard UI transitions `<= 120ms` (`240–300ms` ease-out reserved for pen-stroke draw).

### Demo Stage, Social Cards & Promo Clips

The `#demos` clips start as a plain two-column grid so every scene stays visible without scripts. Once scripts run, they switch to a single-scene stage on the ink surface: a tab row on top (`role="tablist"`, arrow-key support), the full-width clip wrapped in a chrome-free `<button aria-pressed>` surface, and one plain caption sentence below. Animations have zero progress bars, zero duration badges, and zero visible player button chrome; clicking the media surface itself pauses the loop to its static poster for WCAG 2.2.2, and `prefers-reduced-motion` serves the static poster automatically.

Outward-facing social cards (`1600×900` 16:9, `1200×630` Open Graph, `1242×1660` portrait slides) and short promo clips frame a crisp `0px`-radius `--sheet` (`#FFFFFF`) slip inside a full-bleed `--ink-stage` (`#14171A`) canvas without corner registration crosshairs, progress bars, or constant drift shimmer. Keep specimen prose large enough to read in compressed feeds (`>= 28px` on `1600×900` cards, `>= 42px` on `1242×1660` portrait slides, `>= 54px` on `1920×1080` / `1080×1350` promo clips), measure *dele* loops and red/blue underlines from rendered text bounding boxes (`getBBox()`), use only `--mark-ok` (`#1E6B47` on light / `#6CD49B` on dark) for clean pass indicators, and stamp constructed examples with a plain monospace `EXAMPLE` badge.
