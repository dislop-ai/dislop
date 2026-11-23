---
content-type: reference-data
ruleId: unfilled-placeholder
pack: core
tier: invariant
severity: error
family: hygiene/placeholder
---

# Rule: `unfilled-placeholder`

- Pack: [`core`](../packs/core.md) · Tier: `invariant` · Severity: `error`
- Modalities: `markdown, text, html, jsx, svg, docx, pptx, pdf`
- Human anchor: https://dislop.com/#rule-unfilled-placeholder

## What It Catches
- EN: Unfilled AI template placeholder or dummy copy.
- ZH: 存在未替换的模板占位符或测试假文。

## Deletion Test
- EN: Supply the real value before sending, or delete the unfinished line instead of leaving a bracketed marker.
- ZH: 发稿前填入真实信息，或者直接删掉这一句，不要留括号占位。

## Exemplar (Reference Data)

```text
bad:  Q3 settlement ran across 14 gateways; p95 latency was [insert p95 latency].
trap: Q3 settlement improved dramatically across 14 gateways.
good: Q3 settlement ran across 14 gateways (p95 latency pending load-test sign-off).
```
