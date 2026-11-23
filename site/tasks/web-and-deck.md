---
content-type: reference-data
task: web-and-deck
version: 0.7.1
---

# Task Bundle: Web UI, SVG & Slide Decks

Use this bundle when building or auditing HTML/CSS/JSX pages, SVG diagrams, or PowerPoint (`.pptx`) presentations.

## 1. Hard AI Artifact & Template Guards

1. Zero dead controls (`<a href="#">`, empty buttons, or unexplained `<button disabled>`).
2. Avoid purple-pink AI gradients, `"AI-Powered"` prompt-echo badges, pill-badge walls (`> 6` pills per view), and 3-level nested bordered boxes.
3. Keep PowerPoint slides readable: `<= 120` Latin words (`<= 280` Han chars), `<= 6` bullets, `normAutofit >= 80%`, and conclusion titles instead of `"Overview"`.

## 2. Active Rules

### Pack `core`
- [`unfilled-placeholder`](../rules/unfilled-placeholder.md) (`error`): Unfilled AI template placeholder or dummy copy.
- [`chatbot-artifact`](../rules/chatbot-artifact.md) (`error`): Unstripped chatbot wrapper sentence or AI search citation token.
- [`markdown-leak`](../rules/markdown-leak.md) (`error`): Raw Markdown syntax (`**bold**` or `## heading`) pasted unrendered into Word or PowerPoint.
- [`ui-dead-control`](../rules/ui-dead-control.md) (`error`): Placeholder `href="#"` link, empty button, or unexplained disabled button typical of generated UI mockups.

### Pack `deck-and-ui`
- [`slide-word-wall`](../rules/slide-word-wall.md) (`warning`): Slide exceeds readable copy budget (> 120 Latin words or > 280 Chinese characters).
- [`slide-bullet-overload`](../rules/slide-bullet-overload.md) (`warning`): Slide contains more than 6 bullet items (`maxSlideBullets`), fragmenting visual hierarchy.
- [`slide-autofit-shrink`](../rules/slide-autofit-shrink.md) (`warning`): PowerPoint `normAutofit` shrank text below 80% (`fontScale < 80000`) because copy overflowed its box.
- [`slide-weak-topic-title`](../rules/slide-weak-topic-title.md) (`info`): Content-heavy slide uses a generic topic label (`Overview`, `Background`, `背景`) instead of stating its takeaway.
- [`ui-ai-gradient`](../rules/ui-ai-gradient.md) (`warning`): Default purple/indigo-to-pink generator gradient or gradient-clipped display headline.
- [`ui-pill-soup`](../rules/ui-pill-soup.md) (`warning`): Excessive `rounded-full` / `999px` text pills (> 6 per view) turn interface metadata into badge soup.
- [`ui-box-in-box`](../rules/ui-box-in-box.md) (`warning`): Three or more nested bordered/rounded containers wrap the same content (`box-in-box-in-box`).
- [`ui-prompt-echo-badge`](../rules/ui-prompt-echo-badge.md) (`warning`): Interface chrome echoes prompt-engineering hype (`AI-Powered`, `Zero Hallucination`) instead of naming the function.
- [`ui-glow-blob-chrome`](../rules/ui-glow-blob-chrome.md) (`warning`): Decorative ambient blur orbs (`blur-3xl`), neon box-shadows, pulsing `animate-ping` pill dots, or heavy SVG glow filters.
- [`ui-emoji-icon-chrome`](../rules/ui-emoji-icon-chrome.md) (`warning`): Three or more decorative AI stock emojis (`🚀`, `✨`, `⚡`, `🛡️`) used as interface or heading icons.
- [`ui-template-card-grid`](../rules/ui-template-card-grid.md) (`warning`): Stock generator UI boilerplate: tinted rounded-square icon tiles (>= 3), fake macOS 3-dot window chrome, or sequential `01`/`02`/`03` eyebrow kickers.
- [`svg-layout-slop`](../rules/svg-layout-slop.md) (`warning`): SVG graphic has structural generation defects: missing `viewBox` on a large canvas, overlapping `<text>` coordinates, or >= 2 orphaned `<defs>` entries.
- [`image-ai-workflow-residue`](../rules/image-ai-workflow-residue.md) (`warning`): Raster image embeds unstripped AI generation prompt/workflow parameters (warning) or explicit synthetic provenance tags (info — retain required legal disclosures).
- [`image-ai-palette-slop`](../rules/image-ai-palette-slop.md) (`info`): PNG pixel profile matches default AI-slop aesthetics: dominant neon purple-indigo-pink palette or hyper-saturated airbrushed plastic sheen.
- [`pdf-visual-layout-slop`](../rules/pdf-visual-layout-slop.md) (`warning`): PDF slide/poster layout exhibits synthetic template defects: multi-page raster-only slides, collapsed font hierarchy, crushed < 9.5pt body copy, or 4+ consecutive identical landscape slide skeletons.

## 3. Reference Contrast

```text
bad:  <h1 class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">Release Notes v2.4</h1>
trap: <h1 class="bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">Release Notes v2.4</h1>
good: <h1 class="page-title">Release Notes v2.4</h1>
```

## 4. Deterministic Verification Command

```bash
npx --yes dislop check site/ --pack deck-and-ui --fail-on warning
uvx dislop check deck.pptx
```

Deep dives: [Pack `deck-and-ui`](../packs/deck-and-ui.md) · [Design System](../methodology/design-system.md) · [UI References](../cases/ui-specimens.md)
