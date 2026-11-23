---
content-type: reference-data
ruleId: svg-layout-slop
pack: deck-and-ui
tier: taste
severity: warning
family: graphic/svg-structure
---

# Rule: `svg-layout-slop`

- Pack: [`deck-and-ui`](../packs/deck-and-ui.md) · Tier: `taste` · Severity: `warning`
- Modalities: `svg`
- Human anchor: https://dislop.com/#rule-svg-layout-slop

## What It Catches
- EN: SVG graphic has structural generation defects: missing `viewBox` on a large canvas, overlapping `<text>` coordinates, or >= 2 orphaned `<defs>` entries.
- ZH: SVG 平面图形存在生成式结构缺陷：大画布缺失 `viewBox`、文字坐标重叠或 `<defs>` 中残留 2 处及以上孤立未用定义。

## Deletion Test
- EN: Add an explicit `viewBox`, separate `<text>` coordinates cleanly, and delete unused gradients or filters from `<defs>`.
- ZH: 补齐显式 `viewBox`，拉开重叠文字坐标，并清理 `<defs>` 里未被引用的冗余渐变与滤镜。

## Exemplar (Reference Data)

```text
bad:  <svg width="640" height="360"><text x="40" y="50">Step 1</text><text x="42" y="52">Overlap</text></svg>
trap: <svg viewBox="0 0 640 360" width="640" height="360"><defs><linearGradient id="u1"/><linearGradient id="u2"/></defs><rect width="640" height="360"/></svg>
good: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360"><text x="40" y="50">Step 1</text><text x="40" y="96">Step 2</text></svg>
```
