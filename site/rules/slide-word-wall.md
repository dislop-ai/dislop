---
content-type: reference-data
ruleId: slide-word-wall
pack: deck-and-ui
tier: taste
severity: warning
family: deck/density
---

# Rule: `slide-word-wall`

- Pack: [`deck-and-ui`](../packs/deck-and-ui.md) · Tier: `taste` · Severity: `warning`
- Modalities: `pptx, pdf`
- Human anchor: https://dislop.com/#rule-slide-word-wall

## What It Catches
- EN: Slide exceeds readable copy budget (> 120 Latin words or > 280 Chinese characters).
- ZH: 单页幻灯片可见文字超载（英文 > 120 词或中文 > 280 字），变成文档搬家。

## Deletion Test
- EN: Move background narrative to speaker notes or an appendix doc; keep one takeaway headline and <= 3 supporting evidence points on the slide.
- ZH: 将长篇背景移入演讲者备注或配套文档，画面仅保留 1 句结论标题与不超过 3 条核心论据。

## Exemplar (Reference Data)

```text
bad:  Slide 3 packs 215 words of full-sentence prose explaining migration history, rollback scripts, staffing, and Q4 SLA targets.
trap: Slide 3 shrinks body font to 9pt so all 215 words fit inside one rounded box.
good: Slide 3 headline: 'Zero-downtime migration cut p99 latency from 420 ms to 95 ms' + 3 short metric rows (54 words total); full runbook linked in notes.
```
