---
content-type: reference-data
ruleId: zh-exclamation
pack: business-brief
tier: taste
severity: warning
family: punctuation/exclamation
---

# Rule: `zh-exclamation`

- Pack: [`business-brief`](../packs/business-brief.md) · Tier: `taste` · Severity: `warning`
- Modalities: `markdown, text, html, docx, pptx`
- Human anchor: https://dislop.com/#rule-zh-exclamation

## What It Catches
- EN: Chinese prose paragraph overuses exclamation marks or combines exclamation punctuation with hype modifiers.
- ZH: 中文正文段出现鸡血营销感叹号（2 处及以上或搭配`太棒了/重磅/彻底告别/震撼`等煽动词），破坏冷静客观的叙述语气。

## Deletion Test
- EN: Change trailing exclamation marks to periods and remove emotional hype adverbs.
- ZH: 把句末感叹号改回句号，删去`重磅/太棒了/彻底告别`等鼓动字眼。

## Exemplar (Reference Data)

```text
bad:  太棒了！新版工具帮你彻底告别繁琐的人工排查！
trap: 别再手查了！立刻开启自动化新体验！
good: 新版工具会在提交前自动扫描未填占位符和超长列表，减少人工复核遗漏。
```
