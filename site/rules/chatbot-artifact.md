---
content-type: reference-data
ruleId: chatbot-artifact
pack: core
tier: invariant
severity: error
family: hygiene/chat-residue
---

# Rule: `chatbot-artifact`

- Pack: [`core`](../packs/core.md) · Tier: `invariant` · Severity: `error`
- Modalities: `markdown, text, html, jsx, docx, pptx, pdf`
- Human anchor: https://dislop.com/#rule-chatbot-artifact

## What It Catches
- EN: Unstripped chatbot wrapper sentence or AI search citation token.
- ZH: 残留未清理的 AI 对话寒暄壳或检索引用内部标记。

## Deletion Test
- EN: Delete the conversational wrapper or internal citation token completely; start at the actual subject.
- ZH: 直接删掉对话寒暄句或内部引用残迹，正文从实际内容开始。

## Exemplar (Reference Data)

```text
bad:  Certainly! Here is the revised rollout note: Cluster B migrates on November 24 at 02:00 UTC.
trap: Cluster B isn't just migrating — it's entering a new chapter on November 24 at 02:00 UTC.
good: Cluster B migrates on November 24 at 02:00 UTC.
```
