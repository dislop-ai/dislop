---
content-type: reference-data
task: business-doc
version: 0.8.0
---

# Task Bundle: Business Brief & Technical Proposal

Use this bundle when auditing or revising PRDs, architecture specs, memos, Word (`.docx`) reports, or bilingual executive briefs.

## 1. Core Principles

1. Clear all `core` AI artifact errors first (chatbot wrappers, unfilled placeholders, raw Markdown pasted into Word/PPT).
2. Apply each rule's check question to flagged prose phrases rather than swapping synonyms.
3. Avoid 2nd-order slogans (`"Not X, but Y"`, three-word staccato chains, 4-char Chinese slogan triads) and 3rd-order 3-part semicolon pitches.
4. Keep code spans, URLs, and quoted primary sources intact; never invent facts or numbers.

## 2. Active Rules

### Pack `core`
- [`unfilled-placeholder`](../rules/unfilled-placeholder.md) (`error`): Unfilled AI template placeholder or dummy copy.
- [`chatbot-artifact`](../rules/chatbot-artifact.md) (`error`): Unstripped chatbot wrapper sentence or AI search citation token.
- [`markdown-leak`](../rules/markdown-leak.md) (`error`): Raw Markdown syntax (`**bold**` or `## heading`) pasted unrendered into Word or PowerPoint.
- [`ui-dead-control`](../rules/ui-dead-control.md) (`error`): Placeholder `href="#"` link, empty button, or unexplained disabled button typical of generated UI mockups.

### Pack `business-brief`
- [`en-throat-clearing-opener`](../rules/en-throat-clearing-opener.md) (`warning`): Throat-clearing opener delays the concrete point.
- [`en-cliche-lexicon`](../rules/en-cliche-lexicon.md) (`info`): Stock promotional phrase where a specific verb or measurement would carry more weight.
- [`zh-bureaucratic-padding`](../rules/zh-bureaucratic-padding.md) (`warning`): Chinese bureaucratic buzzword or throat-clearing filler.
- [`negation-pivot-frame`](../rules/negation-pivot-frame.md) (`warning`): Second-order `Not X, but Y` / `不是 A，而是 B` rhetorical pivot elevates an abstract slogan instead of stating a concrete fact.
- [`staccato-slogan-run`](../rules/staccato-slogan-run.md) (`warning`): Three or more consecutive ultra-short slogan fragments mimic dramatic copywriting cadence.
- [`zh-four-char-triad`](../rules/zh-four-char-triad.md) (`warning`): Chained four-character Chinese slogan triad pads prose without measurable detail.
- [`unsourced-attribution`](../rules/unsourced-attribution.md) (`warning`): Vague authority claim (`studies show`, `业内人士指出`) without a named source, link, or citation.
- [`bold-lead-list-wall`](../rules/bold-lead-list-wall.md) (`info`): Run of 4+ `- **Label**: description` bullets reads like an unedited LLM summary wall.
- [`cooccurrence-slop-cluster`](../rules/cooccurrence-slop-cluster.md) (`warning`): Multiple subtle corporate/AI fluff verbs and modifiers co-occur in one low-evidence paragraph.
- [`semicolon-tricolon`](../rules/semicolon-tricolon.md) (`warning`): Three-part balanced semicolon pitch sentence reads like generated marketing cadence.
- [`rhetorical-qa-cadence`](../rules/rhetorical-qa-cadence.md) (`warning`): Formulaic self-answered rhetorical question ('Why...? Because...' / 'The result?') mimics LLM blog hooks.
- [`comma-chain-runon`](../rules/comma-chain-runon.md) (`info`): Single sentence chains 5+ comma clauses in breathless LLM cadence.
- [`narrative-sandwich-frame`](../rules/narrative-sandwich-frame.md) (`warning`): Macro-trend opener, future-facing closer, or dense transition-marker cluster ('Furthermore/Moreover/Additionally') follows the stock LLM essay sandwich.
- [`template-skeleton-echo`](../rules/template-skeleton-echo.md) (`warning`): Three or more paragraphs or sentences repeat the exact same syntactic opener skeleton ('By <verb>ing...', '在……方面，', 'First/Second/Third/Finally').
- [`low-burstiness-vapor`](../rules/low-burstiness-vapor.md) (`info`): Multi-sentence passage combines robotically uniform sentence lengths (low burstiness CV < 0.24) with near-zero concrete anchors (numbers, dates, files, or verifiable actions).
- [`zh-dev-jargon`](../rules/zh-dev-jargon.md) (`warning`): Paragraph concentrates hollow AI-generated corporate/engineering buzzwords ('全闭环', '深度赋能', '范式跃迁', '零误差', '…化') rather than grounded technical mechanisms.
- [`zh-exclamation`](../rules/zh-exclamation.md) (`warning`): Chinese prose paragraph overuses exclamation marks or combines exclamation punctuation with hype modifiers.
- [`zh-mega-sentence`](../rules/zh-mega-sentence.md) (`warning`): Single Chinese prose sentence exceeds 180 CJK characters (or 120+ CJK with 180+ total chars) without breaking.
- [`unsourced-statistic`](../rules/unsourced-statistic.md) (`warning`): Marketing-style percentage claim ('up to X%', 'reduces by X%', '提升 X%', '高达 X%') lacks a baseline, sample size, metric name, or citation.

## 3. Reference Contrast

```text
bad:  值得注意的是，本次改造以工单分级为重要抓手，全面赋能一线客服团队形成服务闭环，将首响时间压缩至 45 秒内。
trap: 这不是一次工单改造，而是客服体验的底气：首响压缩至 45 秒内。
good: 本次改造按问题紧急度拆分工单队列，一线客服首次响应时间压缩至 45 秒内。
```

## 4. Deterministic Verification Command

```bash
npx --yes dislop check brief.md --pack business-brief
```

Deep dives: [Pack `business-brief`](../packs/business-brief.md) · [Deletion Test](../methodology/deletion-test.md) · [Skill](../tools/skill.md)
