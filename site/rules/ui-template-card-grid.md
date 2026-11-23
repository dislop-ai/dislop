---
content-type: reference-data
ruleId: ui-template-card-grid
pack: deck-and-ui
tier: taste
severity: warning
family: ui/slop-chrome
---

# Rule: `ui-template-card-grid`

- Pack: [`deck-and-ui`](../packs/deck-and-ui.md) · Tier: `taste` · Severity: `warning`
- Modalities: `html, jsx`
- Human anchor: https://dislop.com/#rule-ui-template-card-grid

## What It Catches
- EN: Stock generator UI boilerplate: tinted rounded-square icon tiles (>= 3), fake macOS 3-dot window chrome, or sequential `01`/`02`/`03` eyebrow kickers.
- ZH: 命中生成式界面三大件：彩色圆角方块图标卡（>= 3 组）、假 macOS 三色窗口圆点或 `01`/`02`/`03` 编号眉题。

## Deletion Test
- EN: Remove fake window dots, sequential numeric kickers, and tinted icon tiles; organize cards with real headings and alignment.
- ZH: 删去假窗口圆点、编号眉题和马卡龙图标块，靠真实小标题和对齐建立网格秩序。

## Exemplar (Reference Data)

```text
bad:  <div class="rounded-xl w-10 h-10 bg-indigo-50">A</div><div class="rounded-xl w-10 h-10 bg-purple-50">B</div><div class="rounded-xl w-10 h-10 bg-pink-50">C</div>
trap: <div><span>01</span><h3>Speed</h3><span>02</span><h3>Scale</h3><span>03</span><h3>Trust</h3></div>
good: <section class="grid"><div><h3>CLI</h3><p>Checks Markdown and PPTX locally.</p></div><div><h3>MCP</h3><p>Connects to coding agents.</p></div></section>
```
