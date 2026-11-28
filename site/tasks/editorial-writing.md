---
content-type: reference-data
task: editorial-writing
version: 1.1.2
---

# Task Bundle: Editorial & Literary Writing

Use this bundle for longform essays, non-fiction reporting, and narrative drafts in English or Chinese.

## 1. Editorial Principles

1. Stop on the concrete physical detail or direct observation instead of adding a moralizing closing sentence.
2. Cut formulaic `"Not X, but Y"` / `"不是 A，而是 B"` aphorisms unless stating a literal factual correction.
3. Keep em-dash density restrained (`<= 4` per 300 words) and avoid half-width ASCII punctuation wedged between Chinese characters.
4. Preserve natural sentence-length burstiness rather than flattening every sentence to uniform length.

## 2. Active Rules

### Pack `core`
- [`unfilled-placeholder`](../rules/unfilled-placeholder.md) (`error`): Unfilled AI template placeholder or dummy copy.
- [`chatbot-artifact`](../rules/chatbot-artifact.md) (`error`): Unstripped chatbot wrapper sentence or AI search citation token.
- [`markdown-leak`](../rules/markdown-leak.md) (`error`): Raw Markdown syntax (`**bold**` or `## heading`) pasted unrendered into Word or PowerPoint.
- [`ui-dead-control`](../rules/ui-dead-control.md) (`error`): Placeholder `href="#"` link, empty button, or unexplained disabled button typical of generated UI mockups.

### Pack `literary-essay`
- [`zh-essay-moralizing-ending`](../rules/zh-essay-moralizing-ending.md) (`warning`): Moralizing summary formula flattens concrete scene observation at the end of a passage.
- [`en-essay-moralizing-ending`](../rules/en-essay-moralizing-ending.md) (`warning`): Formulaic wistful conclusion tells the reader what to feel instead of ending on the scene.
- [`literary-negation-pivot`](../rules/literary-negation-pivot.md) (`warning`): Formulaic `Not X, but Y` / `不是 A，而是 B` aphorism interrupts narrative texture.
- [`excessive-em-dash-density`](../rules/excessive-em-dash-density.md) (`info`): High em-dash (`—` / `——`) frequency creates breathless LLM parenthetical rhythm.
- [`zh-halfwidth-punctuation`](../rules/zh-halfwidth-punctuation.md) (`warning`): Half-width ASCII punctuation (`,;:!?`) wedged directly between Chinese characters.
- [`literary-semicolon-tricolon`](../rules/literary-semicolon-tricolon.md) (`warning`): Balanced three-part semicolon sentence turns scene description into synthetic lyrical cadence.
- [`literary-rhetorical-qa`](../rules/literary-rhetorical-qa.md) (`warning`): Staged self-answered rhetorical question ('Why does ...? Because ...') lectures the reader instead of showing the scene.
- [`literary-narrative-frame`](../rules/literary-narrative-frame.md) (`warning`): Sweeping era opener ('In an era defined by...') or uplifting takeaway closer wraps a personal essay in an LLM template.

## 3. Reference Contrast

```text
bad:  傍晚六点半，修表匠把拆下的三枚铜齿轮泡进煤油皿里，关掉台灯。这或许就是慢工出细活在喧嚣时代真正的意义所在。
trap: 傍晚六点半，三枚铜齿轮泡进煤油皿。这不是修表，而是与时间的对话。
good: 傍晚六点半，修表匠把拆下的三枚铜齿轮泡进煤油皿里，关掉台灯。
```

## 4. Deterministic Verification Command

```bash
npx --yes dislop check essay.md --pack literary-essay --lang zh
```

Deep dives: [Pack `literary-essay`](../packs/literary-essay.md) · [Positive Divergence](../methodology/positive-divergence.md)
