---
content-type: reference-data
ruleId: ui-ai-gradient
pack: deck-and-ui
tier: taste
severity: warning
family: ui/slop-chrome
---

# Rule: `ui-ai-gradient`

- Pack: [`deck-and-ui`](../packs/deck-and-ui.md) · Tier: `taste` · Severity: `warning`
- Modalities: `html, css, jsx, svg, pdf`
- Human anchor: https://dislop.com/#rule-ui-ai-gradient

## What It Catches
- EN: Default purple/indigo-to-pink generator gradient or gradient-clipped display headline.
- ZH: 使用默认紫粉/蓝紫高饱和渐变或渐变裁切艺术字标题（典型生成式模板特征）。

## Deletion Test
- EN: Replace decorative neon gradients with solid surface tokens, crisp 1px rules, and typographic contrast.
- ZH: 去掉装饰性霓虹渐变，改用克制的纯色纸面令牌、1px 结构分界线与字重对比。

## Exemplar (Reference Data)

```text
bad:  <h1 class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">Release Notes v2.4</h1>
trap: <h1 class="bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">Release Notes v2.4</h1>
good: <h1 class="page-title">Release Notes v2.4</h1>
```
