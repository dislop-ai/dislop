---
content-type: reference-data
ruleId: ui-glow-blob-chrome
pack: deck-and-ui
tier: taste
severity: warning
family: ui/slop-chrome
---

# Rule: `ui-glow-blob-chrome`

- Pack: [`deck-and-ui`](../packs/deck-and-ui.md) · Tier: `taste` · Severity: `warning`
- Modalities: `html, css, jsx, svg`
- Human anchor: https://dislop.com/#rule-ui-glow-blob-chrome

## What It Catches
- EN: Decorative ambient blur orbs (`blur-3xl`), neon box-shadows, pulsing `animate-ping` pill dots, or heavy SVG glow filters.
- ZH: 堆砌装饰性环境光晕球（`blur-3xl`）、霓虹色阴影、闪烁 `animate-ping` 小圆点或重度 SVG 发光滤镜。

## Deletion Test
- EN: Delete decorative blur orbs and colored glow shadows; separate layers with solid surface tokens and crisp 1px borders.
- ZH: 删掉无功能的光晕球和霓虹发光阴影，改用单调阶梯底色和 1px 实线分隔层次。

## Exemplar (Reference Data)

```text
bad:  <div class="blur-3xl rounded-full bg-purple-500/30"></div><button class="shadow-indigo-500/50">Launch</button>
trap: <div class="blur-3xl rounded-full bg-amber-500/20"></div><button class="shadow-teal-500/50">Launch</button>
good: <section class="surface-sheet border"><button class="btn-primary">Launch</button></section>
```
