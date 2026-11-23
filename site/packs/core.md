---
content-type: reference-data
pack: core
tier: invariant
version: 0.3.0
---

# Pack: `core` — AI Delivery Artifacts

> Clear AI-generation artifacts enabled across every pack: stray chatbot greetings, unfilled placeholders, raw Markdown pasted into Word/PowerPoint, and dead placeholder links/buttons in generated UI.

所有规则包默认开启的明显 AI 残留硬伤：留在正文里的 AI 寒暄、未填占位符、贴进 Word/PPT 没渲染的裸 Markdown，以及 AI 网页里的空链接与假按钮。

## `unfilled-placeholder`
- Tier: `invariant` · Severity: `error` · Family: `hygiene/placeholder`
- Modalities: `markdown, text, html, jsx, svg, docx, pptx, pdf`
- EN: Unfilled AI template placeholder or dummy copy.
- ZH: 存在未替换的模板占位符或测试假文。
- Deletion Test (EN): Supply the real value before sending, or delete the unfinished line instead of leaving a bracketed marker.
- Deletion Test (ZH): 发稿前填入真实信息，或者直接删掉这一句，不要留括号占位。

```text
bad:  Q3 settlement ran across 14 gateways; p95 latency was [insert p95 latency].
trap: Q3 settlement improved dramatically across 14 gateways.
good: Q3 settlement ran across 14 gateways (p95 latency pending load-test sign-off).
```

Atomic card: [unfilled-placeholder.md](../rules/unfilled-placeholder.md)

## `chatbot-artifact`
- Tier: `invariant` · Severity: `error` · Family: `hygiene/chat-residue`
- Modalities: `markdown, text, html, jsx, docx, pptx, pdf`
- EN: Unstripped chatbot wrapper sentence or AI search citation token.
- ZH: 残留未清理的 AI 对话寒暄壳或检索引用内部标记。
- Deletion Test (EN): Delete the conversational wrapper or internal citation token completely; start at the actual subject.
- Deletion Test (ZH): 直接删掉对话寒暄句或内部引用残迹，正文从实际内容开始。

```text
bad:  Certainly! Here is the revised rollout note: Cluster B migrates on November 24 at 02:00 UTC.
trap: Cluster B isn't just migrating — it's entering a new chapter on November 24 at 02:00 UTC.
good: Cluster B migrates on November 24 at 02:00 UTC.
```

Atomic card: [chatbot-artifact.md](../rules/chatbot-artifact.md)

## `markdown-leak`
- Tier: `invariant` · Severity: `error` · Family: `hygiene/markdown-leak`
- Modalities: `docx, pptx, pdf`
- EN: Raw Markdown syntax (`**bold**` or `## heading`) pasted unrendered into Word or PowerPoint.
- ZH: Word 或 PowerPoint 文本中残留未渲染的原始 Markdown 标记（如 `**加粗**` 或 `## 标题`）。
- Deletion Test (EN): Convert the raw asterisks or hash marks into native Word/PowerPoint formatting.
- Deletion Test (ZH): 去掉原始星号或井号，改用 Word/PowerPoint 原生样式或加粗格式。

```text
bad:  **Key Milestone**: Ship v0.2 parser before Friday.
trap: Key Milestone — a game-changing v0.2 parser ships Friday.
good: Key Milestone: Ship v0.2 parser before Friday.
```

Atomic card: [markdown-leak.md](../rules/markdown-leak.md)

## `ui-dead-control`
- Tier: `invariant` · Severity: `error` · Family: `ui/dead-control`
- Modalities: `html, jsx`
- EN: Placeholder `href="#"` link, empty button, or unexplained disabled button typical of generated UI mockups.
- ZH: AI 生成网页常见的空跳转链接（`href="#"`）、空按钮或未说明原因的占位禁用按钮。
- Deletion Test (EN): Wire the control to a real destination, explain why it is disabled via `title`/`aria-describedby`, or remove the fake button.
- Deletion Test (ZH): 接上真实链接或交互，或者说明禁用原因；没做的功能直接删掉按钮。

```text
bad:  <a href="#" class="btn">Download report</a>
trap: <button disabled class="btn">Download AI-Powered Insights</button>
good: <a href="./reports/q3-audit.pdf" class="btn">Download Q3 audit (PDF)</a>
```

Atomic card: [ui-dead-control.md](../rules/ui-dead-control.md)
