---
content-type: reference-data
ruleId: pdf-visual-layout-slop
pack: deck-and-ui
tier: taste
severity: warning
family: graphic/pdf-layout
---

# Rule: `pdf-visual-layout-slop`

- Pack: [`deck-and-ui`](../packs/deck-and-ui.md) · Tier: `taste` · Severity: `warning`
- Modalities: `pdf`
- Human anchor: https://dislop.com/#rule-pdf-visual-layout-slop

## What It Catches
- EN: PDF slide/poster layout exhibits synthetic template defects: multi-page raster-only slides, collapsed font hierarchy, crushed < 9.5pt body copy, or 4+ consecutive identical landscape slide skeletons.
- ZH: PDF 演示页或海报存在排版缺陷：多页全图无可选文字、横版页字阶扁平或正文缩至 < 9.5pt，或连续 4 页及以上同骨架纯字横版页。

## Deletion Test
- EN: Export slides with selectable vector text, restore a >= 1.2x title-to-body type scale, keep body type >= 11pt, and vary layout structure across slides.
- ZH: 导出可选择矢量文本而非整页贴图，拉开至少 1.2 倍的标题与正文字号阶梯（正文 >= 11pt），并穿插表格或图表。

## Exemplar (Reference Data)

```text
bad:  4-page landscape 960x540 PDF deck where every slide is a single rasterized PNG image with 0 selectable text operators
trap: 4-page landscape PDF deck shrinking all body text to 8.5pt with 10pt titles (1.17x ratio) to cram paragraphs
good: 5-page landscape PDF deck with 28pt assertion headlines, 13pt body copy, and alternating tables and charts
```
