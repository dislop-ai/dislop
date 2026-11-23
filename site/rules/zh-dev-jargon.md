---
content-type: reference-data
ruleId: zh-dev-jargon
pack: business-brief
tier: taste
severity: warning
family: lexicon/dev-jargon
---

# Rule: `zh-dev-jargon`

- Pack: [`business-brief`](../packs/business-brief.md) · Tier: `taste` · Severity: `warning`
- Modalities: `markdown, text, html, docx, pptx`
- Human anchor: https://dislop.com/#rule-zh-dev-jargon

## What It Catches
- EN: Paragraph concentrates hollow AI-generated corporate/engineering buzzwords ('全闭环', '深度赋能', '范式跃迁', '零误差', '…化') rather than grounded technical mechanisms.
- ZH: 单段集中出现 AI 爱写的空洞自嗨黑话（如`全闭环/深度赋能/范式跃迁/零失误/体系化`），而非具体工程或业务机制；偶发行业实词会自动豁免。

## Deletion Test
- EN: Replace each abstract buzzword with the concrete retry count, queue limit, or exit code.
- ZH: 把空洞黑话拆成真实机制：写出具体报错码、重试上限、超时秒数或人工处理步骤。

## Exemplar (Reference Data)

```text
bad:  本次发布建立全闭环校验机制，通过铁律约束完成总收口并形成强兜底，实现零失误交付。
trap: 这不只是发布脚本，而是零缺陷交付的工程铁律。
good: 发布脚本在合入前运行单测与类型检查；任一失败直接退出非零状态码，并保留前一次构建产物用于回滚。
```
