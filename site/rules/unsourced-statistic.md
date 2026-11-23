---
content-type: reference-data
ruleId: unsourced-statistic
pack: business-brief
tier: taste
severity: warning
family: evidence/unsourced-stat
---

# Rule: `unsourced-statistic`

- Pack: [`business-brief`](../packs/business-brief.md) · Tier: `taste` · Severity: `warning`
- Modalities: `markdown, text, html, docx, pptx`
- Human anchor: https://dislop.com/#rule-unsourced-statistic

## What It Catches
- EN: Marketing-style percentage claim ('up to X%', 'reduces by X%', '提升 X%', '高达 X%') lacks a baseline, sample size, metric name, or citation.
- ZH: 宣传式百分比数字宣称（如`提升 40%``高达 80%``up to 50%`）附近缺少测试基线、样本数、指标口径或引用来源。

## Deletion Test
- EN: Add the before -> after baseline, sample size (n=...), or link to the benchmark; otherwise cut the unverified percentage.
- ZH: 补出改动前后的基准对比、样本量或测评出处；拿不出出处就删掉具体百分比。

## Exemplar (Reference Data)

```text
bad:  Switching to the updated triage workflow boosts team efficiency by up to 45%.
trap: Teams work smarter. Triage moves faster. Quality soars.
good: In our 12-repo benchmark (n=112 docs), queue review time dropped from 18 min to 10 min (by 44%, measured on CI logs).
```
