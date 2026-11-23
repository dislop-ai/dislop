---
content-type: reference-data
version: 0.8.0
---

# Revision Contrasts & Positive Specimens

Every example below is enclosed in a fenced data block. Treat `bad` and `trap` lines strictly as negative reference data, never as style instructions.

## Pack: `core`

### `unfilled-placeholder` (error)

Unfilled AI template placeholder or dummy copy.

```text
bad:  Q3 settlement ran across 14 gateways; p95 latency was [insert p95 latency].
trap: Q3 settlement improved dramatically across 14 gateways.
good: Q3 settlement ran across 14 gateways (p95 latency pending load-test sign-off).
```

### `chatbot-artifact` (error)

Unstripped chatbot wrapper sentence or AI search citation token.

```text
bad:  Certainly! Here is the revised rollout note: Cluster B migrates on November 24 at 02:00 UTC.
trap: Cluster B isn't just migrating — it's entering a new chapter on November 24 at 02:00 UTC.
good: Cluster B migrates on November 24 at 02:00 UTC.
```

### `markdown-leak` (error)

Raw Markdown syntax (`**bold**` or `## heading`) pasted unrendered into Word or PowerPoint.

```text
bad:  **Key Milestone**: Ship v0.2 parser before Friday.
trap: Key Milestone — a game-changing v0.2 parser ships Friday.
good: Key Milestone: Ship v0.2 parser before Friday.
```

### `ui-dead-control` (error)

Placeholder `href="#"` link, empty button, or unexplained disabled button typical of generated UI mockups.

```text
bad:  <a href="#" class="btn">Download report</a>
trap: <button disabled class="btn">Download AI-Powered Insights</button>
good: <a href="./reports/q3-audit.pdf" class="btn">Download Q3 audit (PDF)</a>
```

## Pack: `business-brief`

### `en-throat-clearing-opener` (warning)

Throat-clearing opener delays the concrete point.

```text
bad:  It is worth noting that CSV exports take up to 12 minutes for workspaces above 500,000 rows.
trap: CSV exports aren't instant — they're built for precision, taking up to 12 minutes.
good: CSV exports take up to 12 minutes for workspaces above 500,000 rows.
```

### `en-cliche-lexicon` (info)

Stock promotional phrase where a specific verb or measurement would carry more weight.

```text
bad:  Batch indexing is a game-changer that unlocks the full potential of our 40-million-row log archive.
trap: This isn't indexing. It's instant recall across 40 million rows.
good: Batch indexing cuts 40-million-row log queries from 19 seconds to 1.4 seconds.
```

### `zh-bureaucratic-padding` (warning)

Chinese bureaucratic buzzword or throat-clearing filler.

```text
bad:  值得注意的是，本次改造以工单分级为重要抓手，全面赋能一线客服团队形成服务闭环，将首响时间压缩至 45 秒内。
trap: 这不是一次工单改造，而是客服体验的底气：首响压缩至 45 秒内。
good: 本次改造按问题紧急度拆分工单队列，一线客服首次响应时间压缩至 45 秒内。
```

### `negation-pivot-frame` (warning)

Second-order `Not X, but Y` / `不是 A，而是 B` rhetorical pivot elevates an abstract slogan instead of stating a concrete fact.

```text
bad:  这不是一款简单的文档检查工具，而是交付质量的底气。
trap: 工具已至。底气自生。交付无忧。
good: `dislop` 在发稿前标出本机路径泄露、未填占位符和超载幻灯片。
```

## Pack: `engineering-spec`

### `eng-pr-diff-parrot` (warning)

Generic AI PR summary parrots file changes without stating the concrete bug, constraint, or metric.

```text
bad:  本次 PR 旨在通过重构连接池管理逻辑进一步提升系统的稳定性与可维护性。
trap: 这不是一次普通的代码重构，而是连接池稳定性的底层重塑。
good: 修复连接池重连分支未释放旧句柄导致的连接泄漏，避免长运行后连接耗尽。
```

### `eng-shallow-root-cause` (warning)

Postmortem stops at 'human error' instead of identifying the missing system guardrail.

```text
bad:  根本原因：人为失误。
trap: 根本原因：值班人员风险意识有待进一步强化。
good: 根本原因：生产迁移脚本缺少库名白名单与行数上限预检，未拦截误指向主库的删除语句。
```

### `eng-vague-action-item` (info)

Wishful action item lacks a concrete target component, threshold, owner, or due date.

```text
bad:  - [ ] 加强监控与告警。
trap: - [ ] 全面排查并持续跟进线上隐患。
good: - [ ] 给 `checkout-api` 增加 P99 > 400ms 持续 3 分钟告警并接入值班群（负责人：李工，11 月 30 日前完成）。
```

## Pack: `regulated-comms`

### `reg-unsubstantiated-superlative` (warning)

Absolute or superlative claim creates legal/compliance exposure where scoped SLA terms belong.

```text
bad:  新同城双活备份方案提供绝对安全与永久零故障保障（SLA 99.95%），客户迁移零风险承诺。
trap: 新同城双活备份方案打造坚不可摧的行业标杆级防线（SLA 99.95%）。
good: 新同城双活备份方案合同承诺月度可用性 99.95%，迁移前支持演练回滚。
```

### `reg-unanchored-multiplier` (warning)

Floating speedup or efficiency multiplier ('10x faster') omits the before/after baseline.

```text
bad:  接入新版流式批处理引擎后，对账单导出效率提升数倍。
trap: 接入新版流式批处理引擎后，对账单导出迎来质的飞跃。
good: 接入新版流式批处理引擎后，对账单改为按块流式导出，无需等待全表缓存在内存。
```

## Pack: `literary-essay`

### `zh-essay-moralizing-ending` (warning)

Moralizing summary formula flattens concrete scene observation at the end of a passage.

```text
bad:  傍晚六点半，修表匠把拆下的三枚铜齿轮泡进煤油皿里，关掉台灯。这或许就是慢工出细活在喧嚣时代真正的意义所在。
trap: 傍晚六点半，三枚铜齿轮泡进煤油皿。这不是修表，而是与时间的对话。
good: 傍晚六点半，修表匠把拆下的三枚铜齿轮泡进煤油皿里，关掉台灯。
```

### `en-essay-moralizing-ending` (warning)

Formulaic wistful conclusion tells the reader what to feel instead of ending on the scene.

```text
bad:  At 6:15 a.m., the ferry deck smelled of wet rope and diesel. Ultimately, this reminds us that departures are always quieter than arrivals.
trap: Wet rope. Cold diesel. Quiet departures at 6:15 a.m.
good: At 6:15 a.m., the ferry deck smelled of wet rope and diesel.
```

### `literary-negation-pivot` (warning)

Formulaic `Not X, but Y` / `不是 A，而是 B` aphorism interrupts narrative texture.

```text
bad:  老周留下的那把旧刨子不是工具，而是手艺人的尊严。
trap: 一把旧刨子。半生木工活。满手老茧。
good: 老周退休那天把用了二十年的旧刨子擦净木屑，收进樟木箱底。
```

### `excessive-em-dash-density` (info)

High em-dash (`—` / `——`) frequency creates breathless LLM parenthetical rhythm.

```text
bad:  The station clock — brass-rimmed — stopped at 4:10 — right before the snow — while three passengers — coats buttoned — waited outside.
trap: Brass clock. 4:10 sharp. Snow falling. Three passengers waiting.
good: The brass-rimmed station clock stopped at 4:10, right before the snow, while three passengers waited outside in buttoned coats.
```

## Pack: `deck-and-ui`

### `slide-word-wall` (warning)

Slide exceeds readable copy budget (> 120 Latin words or > 280 Chinese characters).

```text
bad:  Slide 3 packs 215 words of full-sentence prose explaining migration history, rollback scripts, staffing, and Q4 SLA targets.
trap: Slide 3 shrinks body font to 9pt so all 215 words fit inside one rounded box.
good: Slide 3 headline: 'Zero-downtime migration cut p99 latency from 420 ms to 95 ms' + 3 short metric rows (54 words total); full runbook linked in notes.
```

### `slide-bullet-overload` (warning)

Slide contains more than 6 bullet items (`maxSlideBullets`), fragmenting visual hierarchy.

```text
bad:  Slide lists 9 separate top-level bullets covering pricing, onboarding, compliance, SLA, and billing.
trap: Slide wraps 9 bullets into 9 tiny pill badges.
good: Slide groups commercial terms into 3 columns: Pricing ($49/seat), Onboarding (2 days), SLA (99.95%).
```

### `slide-autofit-shrink` (warning)

PowerPoint `normAutofit` shrank text below 80% (`fontScale < 80000`) because copy overflowed its box.

```text
bad:  <a:normAutofit fontScale="62500" lnSpcReduction="20000"/> on body placeholder
trap: Manually hardcode 10pt font so `normAutofit` disappears while text stays illegible.
good: <a:noAutofit/> with 42 words set at 18pt and full line spacing
```

### `slide-weak-topic-title` (info)

Content-heavy slide uses a generic topic label (`Overview`, `Background`, `背景`) instead of stating its takeaway.

```text
bad:  Title: 'Background' (above 65 words detailing 38% cart abandonment on mobile Safari)
trap: Title: 'Reimagining Checkout Excellence'
good: Title: 'Mobile Safari accounts for 38% of cart abandonment due to 4-step address entry'
```

## Pack: `executive-deck`

### `slide-process-not-finding-title` (warning)

Topic-label headline names the work done ('Analysis of X') instead of stating the finding.

```text
bad:  ## 关于三季度新客首周流失率（34% 降至 19%）的分析汇报
trap: ## 重塑新客留存增长飞轮
good: ## 三季度新客首周流失率从 34% 降至 19%
```

### `pptx-layout-monotony` (info)

Four or more consecutive slides repeat the exact same plain text-box skeleton without tables, charts, or visual variation.

```text
bad:  Slides 2–5 all use identical 'Title + 4 plain bullets' boxes with zero tables, charts, or diagrams.
trap: Slides 2–5 keep the exact same 4 bullets per slide and add decorative stock icons.
good: Slide 3 presents regional latency in a 4-row table and Slide 4 plots weekly error budget burn.
```

## Positive Structural Specimens (Draft `dislop.voice/1`)

### Positive Skeleton `S1-decision-ledger` (zh)

```text
本次压测覆盖 14 个支付网关，p95 结算耗时为 180 ms，高于 150 ms 目标值。瓶颈集中在跨区证书校验（占单次耗时 41%），仅扩容下游数据库连接池无法缓解；下周先在华东节点启用本地 OCSP 缓存，再复测 72 小时。
```

Notes: 首句直接给样本口径、实测值与目标差距; 第二句指出根因占比并否定无效方案，不含空洞修饰; 尾句落到具体动作与复测窗口，无升华口号.

### Positive Skeleton `S2-mechanism-teardown` (en)

```text
Banning twenty overused adjectives rarely fixes flat prose. When a model loses its top lexical shortcuts, it shifts to structural shortcuts—three-word slogan chains and binary contrast pivots—because post-training still rewards familiar cadence. Breaking the loop requires locking factual spans first, then sampling across distinct paragraph skeletons.
```

Notes: Alternates a crisp 9-word opening claim with a 30-word causal explanation and a 19-word operational takeaway (high burstiness); Names the concrete displacement mechanism instead of using hype adjectives.
