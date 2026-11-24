---
content-type: reference-data
version: 0.8.3
---

# Architectural Galley Proof Design System

`dislop` rejects both Generator Default #1 (dark slate + indigo/purple/pink neon gradients + pill soup) and Generator Default #2 (warm cream `#F7F5F0` + stone + terracotta fallback).

## Verified Surface & Mark Tokens (WCAG 2.2 AA)

| Token | Role | Light | Dark | Dark Lightness / Contrast |
|---|---|---|---|---|
| `--pen` | Drawn strokes (`>= 2.5px`) & logo loop | `#F04438` | `#F04438` | `L* = 55.0` (`4.8:1` on tile / `4.7:1` dark sheet) |
| `--stage` | Outer margin / viewport ground | `#F6F7F5` | `#0E1012` | `L* = 4.6` |
| `--sheet` | Primary column | `#FFFFFF` | `#15181C` | `L* = 8.1` (> stage) |
| `--raised` | Controls & hover | `#ECEEE9` | `#1D2127` | `L* = 12.6` (> sheet) |
| `--inset` | Code / input well | `#F1F3F0` | `#0A0C0E` | `L* = 3.2` (recessed) |
| `--control-border` | Inputs, selects & buttons | `#767C85` | `#6F7784` | `4.2:1` light / `3.9:1` dark (WCAG >= 3:1) |
| `--control-border-quiet` | Quiet tier-3 controls | `#888E97` | `#636A76` | `3.3:1` light / `3.3:1` dark (WCAG >= 3:1) |
| `--ink-stage` | Charcoal stage: agent prompt, terminal, demo room | `#14171A` | `#14171A` | Text `#ECEEF0` `15.5:1`, muted `#A6ACB5` `7.9:1`, red text `#FF7A6B` `7.1:1` |
| `--ink` | Primary ink | `#14171A` | `#ECEEF0` | `18.0:1` light / `15.3:1` dark |
| `--mark-error` | Hard AI artifact (`error`) | `#B42318` | `#FF7A6B` | `6.6:1` / `7.0:1` (2px solid) |
| `--mark-warn` | Cliché / template warning (`warning` / `info`) | `#1B52B0` | `#85B4FF` | `7.3:1` / `8.5:1` (1.5px dashed) |
| `--ok` | Clean pass & active UI state | `#1E6B47` | `#6CD49B` | `6.5:1` / `9.8:1` |

## Structural Rules Enforced on `site/`

- Zero external font CDNs, analytics, or third-party requests (`CSP: connect-src 'self'`; offline checks stay 0-upload by default).
- Continuous `1px` structural rails (`max-width: 1240px`); `0px` shared cell radii, `6px` button radii (`5px` compact), `4px` input wells; zero `rounded-full` badge soup.
- Red text and underlines (`--mark-error`) are reserved for objective invariant defects; the brand `--pen` only draws strokes of `>= 2.5px` (logo, hero dele stroke, current-selection bar).
- Measure capped at `65ch` (Latin) / `36` Han chars; line height `1.68` EN / `1.82` ZH; `tabular-nums` on coordinates and metrics.
