---
content-type: reference-data
ruleId: markdown-leak
pack: core
tier: invariant
severity: error
family: hygiene/markdown-leak
---

# Rule: `markdown-leak`

- Pack: [`core`](../packs/core.md) · Tier: `invariant` · Severity: `error`
- Modalities: `docx, pptx, pdf`
- Human anchor: https://dislop.com/#rule-markdown-leak

## What It Catches
- EN: Raw Markdown syntax (`**bold**` or `## heading`) pasted unrendered into Word or PowerPoint.
- ZH: Word 或 PowerPoint 文本中残留未渲染的原始 Markdown 标记（如 `**加粗**` 或 `## 标题`）。

## Deletion Test
- EN: Convert the raw asterisks or hash marks into native Word/PowerPoint formatting.
- ZH: 去掉原始星号或井号，改用 Word/PowerPoint 原生样式或加粗格式。

## Exemplar (Reference Data)

```text
bad:  **Key Milestone**: Ship v0.2 parser before Friday.
trap: Key Milestone — a game-changing v0.2 parser ships Friday.
good: Key Milestone: Ship v0.2 parser before Friday.
```
