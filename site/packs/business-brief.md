---
content-type: reference-data
pack: business-brief
tier: taste
version: 0.2.0
---

# Pack: `business-brief` — Business Brief & Technical Proposal

> Flags throat-clearing openers, bureaucratic padding, second-order negation pivots (`Not X, but Y`), staccato slogan chains, four-character triads, and unsourced claims.

检出铺垫废话、空洞套话、二阶对比口号（`不是 A，而是 B`）、断句口号链、四字排比串与无出处归因。

## `en-throat-clearing-opener`
- Tier: `taste` · Severity: `warning` · Family: `frame/opener`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Throat-clearing opener delays the concrete point.
- ZH: 英文铺垫式开场白拖延了核心事实。
- Deletion Test (EN): Cut everything up to 'that' or the comma. Does the remaining clause already state the full observation or constraint?
- Deletion Test (ZH): 删掉前半句铺垫壳，看剩下的主干是否已经完整表达了事实或限制条件。

```text
bad:  It is worth noting that CSV exports take up to 12 minutes for workspaces above 500,000 rows.
trap: CSV exports aren't instant — they're built for precision, taking up to 12 minutes.
good: CSV exports take up to 12 minutes for workspaces above 500,000 rows.
```

Atomic card: [en-throat-clearing-opener.md](../rules/en-throat-clearing-opener.md)

## `en-cliche-lexicon`
- Tier: `taste` · Severity: `info` · Family: `lexicon/cliche`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Stock promotional phrase where a specific verb or measurement would carry more weight.
- ZH: 高频公关套语，建议替换为具体动作或实测指标。
- Deletion Test (EN): If you delete this modifier, which concrete mechanism, metric, or trade-off disappears? State that fact directly.
- Deletion Test (ZH): 如果删掉这个修饰语，读者会少知道哪项机制、指标或取舍？直接写出那项事实。

```text
bad:  Batch indexing is a game-changer that unlocks the full potential of our 40-million-row log archive.
trap: This isn't indexing. It's instant recall across 40 million rows.
good: Batch indexing cuts 40-million-row log queries from 19 seconds to 1.4 seconds.
```

Atomic card: [en-cliche-lexicon.md](../rules/en-cliche-lexicon.md)

## `zh-bureaucratic-padding`
- Tier: `taste` · Severity: `warning` · Family: `lexicon/cliche`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Chinese bureaucratic buzzword or throat-clearing filler.
- ZH: 存在空泛汇报套词或铺垫口头禅，掩盖了具体动作、主体与结果。
- Deletion Test (EN): Ask 'who changed what, by how much, under what constraint?' and delete the abstract wrapper.
- Deletion Test (ZH): 追问`谁对什么做了哪项改动、指标变了多少`，删掉抽象包装词。

```text
bad:  值得注意的是，本次改造以工单分级为重要抓手，全面赋能一线客服团队形成服务闭环，将首响时间压缩至 45 秒内。
trap: 这不是一次工单改造，而是客服体验的底气：首响压缩至 45 秒内。
good: 本次改造按问题紧急度拆分工单队列，一线客服首次响应时间压缩至 45 秒内。
```

Atomic card: [zh-bureaucratic-padding.md](../rules/zh-bureaucratic-padding.md)

## `negation-pivot-frame`
- Tier: `taste` · Severity: `warning` · Family: `frame/negation-pivot`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Second-order `Not X, but Y` / `不是 A，而是 B` rhetorical pivot elevates an abstract slogan instead of stating a concrete fact.
- ZH: 二阶`不是 A，而是 B`对比修辞：先否定稻草人再拔高抽象概念，缺乏具体事实增量。
- Deletion Test (EN): Delete the negated first half ('Not X,'). If the remaining clause ('Y') holds no measurement, mechanism, or real correction, rewrite or cut the whole sentence.
- Deletion Test (ZH): 删掉前半句否定铺垫，只看`而是 B`。如果 B 没有数值、机制或真实纠偏信息，整句删改。

```text
bad:  这不是一款简单的文档检查工具，而是交付质量的底气。
trap: 工具已至。底气自生。交付无忧。
good: `dislop` 在发稿前标出本机路径泄露、未填占位符和超载幻灯片。
```

Atomic card: [negation-pivot-frame.md](../rules/negation-pivot-frame.md)

## `staccato-slogan-run`
- Tier: `taste` · Severity: `warning` · Family: `frame/staccato`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Three or more consecutive ultra-short slogan fragments mimic dramatic copywriting cadence.
- ZH: 连续三个及以上超短断句口号（第二代 AI 戏剧化腔调）。
- Deletion Test (EN): Combine the fragments into one factual sentence naming the cause and effect, or cut purely decorative rhythm beats.
- Deletion Test (ZH): 把零碎口号合并为一句交代因果与边界的完整陈述，删去纯节奏铺陈。

```text
bad:  Signals drop. Photos vanish. Audits stall. Offline sync keeps all 120 inspection photos queued locally.
trap: Offline sync isn't a fallback — it's field resilience for 120 photos.
good: When cellular coverage drops in basement vaults, offline sync queues up to 120 inspection photos locally until reconnection.
```

Atomic card: [staccato-slogan-run.md](../rules/staccato-slogan-run.md)

## `zh-four-char-triad`
- Tier: `taste` · Severity: `warning` · Family: `frame/triad`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Chained four-character Chinese slogan triad pads prose without measurable detail.
- ZH: 连续三个及以上四字套语并列（如`精准高效、安全可靠、灵活易用`），信息密度低。
- Deletion Test (EN): Delete all three adjectives; keep only claims backed by a number, failure mode, or configuration option.
- Deletion Test (ZH): 删掉整组四字形容词，只保留有数字、故障边界或配置项支撑的具体事实。

```text
bad:  新版网关具备精准高效、安全可靠、灵活易用的特性，单节点支持 8,000 QPS。
trap: 新版网关不是简单升级，而是 8,000 QPS 的性能飞跃。
good: 新版网关单节点支持 8,000 QPS，并在上游超时 2 秒后自动熔断。
```

Atomic card: [zh-four-char-triad.md](../rules/zh-four-char-triad.md)

## `unsourced-attribution`
- Tier: `taste` · Severity: `warning` · Family: `evidence/unsourced`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Vague authority claim (`studies show`, `业内人士指出`) without a named source, link, or citation.
- ZH: 出现`研究表明/数据显示/业内人士指出`等模糊权威背书，但句内无具体机构、年份、链接或引用标记。
- Deletion Test (EN): Name the exact dataset, report year, or footnote `[n]`; if no source exists, delete the claim.
- Deletion Test (ZH): 补齐具体报告名称、年份或引用编号 `[n]`；若查无实据则直接删去该判断。

```text
bad:  Industry research shows that 70% of enterprise decks fail basic accessibility checks.
trap: Everyone knows most enterprise decks fail basic accessibility checks.
good: In our audit of 48 internal Q3 review decks, 31 contained at least one low-contrast caption (< 4.5:1).
```

Atomic card: [unsourced-attribution.md](../rules/unsourced-attribution.md)

## `bold-lead-list-wall`
- Tier: `taste` · Severity: `info` · Family: `frame/list-wall`
- Modalities: `markdown, text`
- EN: Run of 4+ `- **Label**: description` bullets reads like an unedited LLM summary wall.
- ZH: 连续 4 条及以上 `- **小标题**：说明` 列表墙，呈现典型大模型平铺罗列感。
- Deletion Test (EN): If the items argue one thesis, turn them into a short paragraph; keep bulleted bold labels only for true reference tables, CLI flags, or glossaries.
- Deletion Test (ZH): 如果是在阐述同一观点，改写为有主次逻辑的自然段；仅在参数说明、术语表或清单核对时保留加粗列表。

```text
bad:  - **Speed**: Runs fast locally.
- **Privacy**: Keeps files offline.
- **Modularity**: Uses JSON packs.
- **Clarity**: Prints line numbers.
trap: Speed. Privacy. Modularity. Clarity.
good: `dislop` runs locally with no network calls, loads rules from plain JSON packs, and prints exact file and line coordinates.
```

Atomic card: [bold-lead-list-wall.md](../rules/bold-lead-list-wall.md)

## `cooccurrence-slop-cluster`
- Tier: `taste` · Severity: `warning` · Family: `lexicon/cooccurrence`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Multiple subtle corporate/AI fluff verbs and modifiers co-occur in one low-evidence paragraph.
- ZH: 同一低事实段落内密集堆叠多个弱套词组合（如`有效推动/持续优化/显著提升`或`leverage/streamline/robust`），冲淡了具体改动。
- Deletion Test (EN): Do not swap one buzzword for another; replace the whole cluster with who changed what and the measured delta.
- Deletion Test (ZH): 不要把一个套词换成另一个近义词；整片替换成具体改动、执行主体与实测变化。

```text
bad:  本次客服系统按工单紧急度拆成 3 级队列，旨在有效推动跨部门协同效率，持续优化客户交互体验，并进一步助力业务团队实现精细化运营，最终显著提升整体服务质量，首响时间从 110 秒降到 42 秒。
trap: 客服系统升级不是功能叠加，而是首响从 110 秒降到 42 秒的服务跃升。
good: 本次客服系统按工单紧急度拆成 3 级队列，平均首响时间从 110 秒降到 42 秒。
```

Atomic card: [cooccurrence-slop-cluster.md](../rules/cooccurrence-slop-cluster.md)

## `semicolon-tricolon`
- Tier: `taste` · Severity: `warning` · Family: `punctuation/tricolon`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Three-part balanced semicolon pitch sentence reads like generated marketing cadence.
- ZH: 单句内连续使用两个及以上分号构成三段对称排比，呈现典型 AI 推销腔。
- Deletion Test (EN): Break the symmetry: split into plain sentences of unequal length or keep only the concrete behaviors.
- Deletion Test (ZH): 打破三段工整对称：拆成长短不一的平实句子，或删掉充数的并列分句。

```text
bad:  前端把表单校验前置到输入时；后端将异步任务拆进独立队列；监控台实时追踪每笔超时请求。
trap: 校验前置。任务异步。超时可追。
good: 前端在输入时先做字段校验，后端把异步任务放进独立队列，监控台则负责追踪每笔超时请求。
```

Atomic card: [semicolon-tricolon.md](../rules/semicolon-tricolon.md)

## `rhetorical-qa-cadence`
- Tier: `taste` · Severity: `warning` · Family: `punctuation/rhetorical-qa`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Formulaic self-answered rhetorical question ('Why...? Because...' / 'The result?') mimics LLM blog hooks.
- ZH: 自问自答式设问套路（`为什么……？因为……``结果呢？`），带有明显生成式营销文节奏。
- Deletion Test (EN): Delete the staged question and state the cause-and-effect directly in one sentence.
- Deletion Test (ZH): 删掉摆拍式设问，直接在一句话里写出原因与结果。

```text
bad:  Why do internal dashboards collect dust after launch? Because they show vanity totals instead of next actions. The result? Teams export CSVs every Monday.
trap: Dashboards fail. Numbers pile up. Teams export CSVs.
good: Internal dashboards go unused when they show vanity totals without next actions, so teams end up exporting CSVs every Monday.
```

Atomic card: [rhetorical-qa-cadence.md](../rules/rhetorical-qa-cadence.md)

## `comma-chain-runon`
- Tier: `taste` · Severity: `info` · Family: `punctuation/comma-chain`
- Modalities: `markdown, text, html, docx`
- EN: Single sentence chains 5+ comma clauses in breathless LLM cadence.
- ZH: 单句内连续串接 5 个及以上逗号分句，节奏平铺拖沓。
- Deletion Test (EN): Split into 2–3 shorter sentences with a clear main verb in each, and drop redundant parallel clauses.
- Deletion Test (ZH): 拆成 2 到 3 句主干清晰的短句，顺手删掉凑排比的空分句。

```text
bad:  通过建立跨部门沟通机制，明确周二评审与周五发版节点，优化内部评审流程，加强文档沉淀管理，完善接口超时预警体系，同步推进自动化落地，我们让团队交付过程更稳。
trap: 建机制。明节点。优评审。强沉淀。
good: 我们固定了周二评审和周五发版两个节点，并补齐了接口超时预警和自动化检查，交付过程稳定多了。
```

Atomic card: [comma-chain-runon.md](../rules/comma-chain-runon.md)

## `narrative-sandwich-frame`
- Tier: `taste` · Severity: `warning` · Family: `structure/narrative-frame`
- Modalities: `markdown, text, html, docx`
- EN: Macro-trend opener, future-facing closer, or dense transition-marker cluster ('Furthermore/Moreover/Additionally') follows the stock LLM essay sandwich.
- ZH: 出现宏大趋势开场（`随着……的飞速发展`）、展望式升华收尾（`展望未来……`）或连接词堆叠（`此外/与此同时/不仅如此`），呈现典型 AI 三明治叙事壳。
- Deletion Test (EN): Cut the opening trend preamble and closing cheerleading; start on the concrete fact or decision and end on the next action or limit.
- Deletion Test (ZH): 切掉开头趋势帽和结尾展望帽，直接从具体事实或改动起笔，在下一步动作或边界条件处收束。

```text
bad:  随着人工智能技术的飞速发展，研发团队正面临效率变革。此外，我们在 11 月把 PR 静态检查接入了 CI。与此同时，配置错误提前被拦了下来。不仅如此，下周还会覆盖剩余 4 个仓库。展望未来，主动拥抱变化的团队必将赢得先机。
trap: 时代变了。工具变了。协作也在变。
good: 11 月我们把 PR 静态检查接入了 CI，配置错误会在合并前被拦下，下周计划覆盖剩余 4 个仓库。
```

Atomic card: [narrative-sandwich-frame.md](../rules/narrative-sandwich-frame.md)

## `template-skeleton-echo`
- Tier: `taste` · Severity: `warning` · Family: `structure/skeleton-echo`
- Modalities: `markdown, text, html, docx`
- EN: Three or more paragraphs or sentences repeat the exact same syntactic opener skeleton ('By <verb>ing...', '在……方面，', 'First/Second/Third/Finally').
- ZH: 连续 3 个及以上段落或句子复用同一句首骨架（如`在……方面，``首先/其次/再次/最后``By …ing,`），结构像套模板填词。
- Deletion Test (EN): Merge related points into natural prose with varied openings, or use a compact table if you are listing parallel specs.
- Deletion Test (ZH): 把同构段落按因果或主次合并成自然段并变化句首；若是并列参数对照，直接改成简洁表格。

```text
bad:  在数据采集方面，系统接入了业务日志。

在模型训练方面，团队定期更新权重。

在结果应用方面，业务方通过看板查看波动。
trap: 采数据。训模型。看看板。
good: 系统接入业务日志后，团队定期更新模型权重，业务方直接在看板里查看指标波动。
```

Atomic card: [template-skeleton-echo.md](../rules/template-skeleton-echo.md)

## `low-burstiness-vapor`
- Tier: `taste` · Severity: `info` · Family: `statistics/monotony`
- Modalities: `markdown, text`
- EN: Multi-sentence passage combines robotically uniform sentence lengths (low burstiness CV < 0.24) with near-zero concrete anchors (numbers, dates, files, or verifiable actions).
- ZH: 多句段落同时出现句长高度齐平（突发性变异系数 CV < 0.24）且几乎没有具体锚点（数字、时间、文件名或可核查动作），空泛同质感强。
- Deletion Test (EN): Cut abstract summary sentences in half, vary sentence length naturally, and anchor every kept claim with a number, file, date, or concrete failure mode.
- Deletion Test (ZH): 砍掉一半抽象概括句，拉开长短句节奏，并为保留的每条判断补上数字、文件、时间或真实边界。

```text
bad:  该方案注重用户体验的全面改善。系统架构保持了良好的扩展能力。团队协作形成了清晰的责任分工。日常运维建立了规范的处理流程。产品迭代围绕核心需求稳步推进。业务指标呈现出健康的增长态势。
trap: 体验改善。架构扩展。分工清晰。运维规范。
good: 本段暂未提供具体指标、改动文件或责任人，请先删去概括句，再由作者补入实测数据和变更项。
```

Atomic card: [low-burstiness-vapor.md](../rules/low-burstiness-vapor.md)

## `zh-dev-jargon`
- Tier: `taste` · Severity: `warning` · Family: `lexicon/dev-jargon`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Paragraph concentrates hollow AI-generated corporate/engineering buzzwords ('全闭环', '深度赋能', '范式跃迁', '零误差', '…化') rather than grounded technical mechanisms.
- ZH: 单段集中出现 AI 爱写的空洞自嗨黑话（如`全闭环/深度赋能/范式跃迁/零失误/体系化`），而非具体工程或业务机制；偶发行业实词会自动豁免。
- Deletion Test (EN): Replace each abstract buzzword with the concrete retry count, queue limit, or exit code.
- Deletion Test (ZH): 把空洞黑话拆成真实机制：写出具体报错码、重试上限、超时秒数或人工处理步骤。

```text
bad:  本次发布建立全闭环校验机制，通过铁律约束完成总收口并形成强兜底，实现零失误交付。
trap: 这不只是发布脚本，而是零缺陷交付的工程铁律。
good: 发布脚本在合入前运行单测与类型检查；任一失败直接退出非零状态码，并保留前一次构建产物用于回滚。
```

Atomic card: [zh-dev-jargon.md](../rules/zh-dev-jargon.md)

## `zh-exclamation`
- Tier: `taste` · Severity: `warning` · Family: `punctuation/exclamation`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Chinese prose paragraph overuses exclamation marks or combines exclamation punctuation with hype modifiers.
- ZH: 中文正文段出现鸡血营销感叹号（2 处及以上或搭配`太棒了/重磅/彻底告别/震撼`等煽动词），破坏冷静客观的叙述语气。
- Deletion Test (EN): Change trailing exclamation marks to periods and remove emotional hype adverbs.
- Deletion Test (ZH): 把句末感叹号改回句号，删去`重磅/太棒了/彻底告别`等鼓动字眼。

```text
bad:  太棒了！新版工具帮你彻底告别繁琐的人工排查！
trap: 别再手查了！立刻开启自动化新体验！
good: 新版工具会在提交前自动扫描未填占位符和超长列表，减少人工复核遗漏。
```

Atomic card: [zh-exclamation.md](../rules/zh-exclamation.md)

## `zh-mega-sentence`
- Tier: `taste` · Severity: `warning` · Family: `rhythm/mega-sentence`
- Modalities: `markdown, text, html, docx`
- EN: Single Chinese prose sentence exceeds 180 CJK characters (or 120+ CJK with 180+ total chars) without breaking.
- ZH: 中文单句一逗到底超过 180 个汉字（或 >= 120 汉字且总长超 180 字），阅读负担重，呈大模型长从句生成特征。
- Deletion Test (EN): Split at the natural clause shift using periods so each sentence carries one main subject and action.
- Deletion Test (ZH): 按事件或条件转换处切成句号短句，每句只交代一个主动作或边界条件。

```text
bad:  我们在周一完成双集群流量切分后观察到 orders-worker-service-cluster-01 核心交易接口延迟上升三毫秒但考虑到异步日志落盘能够避免主线程在高峰期被磁盘刷写操作阻塞并且可在节点异常重启后完整保留上下文追踪链路以便值班同学快速排查请求参数与调用栈因此决定保留当前配置并在周四晚低峰期继续观察四十八小时以确认内存缓冲池没有缓慢泄漏或堆积风险。
trap: 切双集群。延迟微升。观察两天。
good: 周一完成双集群切分后延迟升了 3ms，但异步落盘可防阻塞并保链路。团队周四再复查 48 小时内存占用。
```

Atomic card: [zh-mega-sentence.md](../rules/zh-mega-sentence.md)

## `unsourced-statistic`
- Tier: `taste` · Severity: `warning` · Family: `evidence/unsourced-stat`
- Modalities: `markdown, text, html, docx, pptx`
- EN: Marketing-style percentage claim ('up to X%', 'reduces by X%', '提升 X%', '高达 X%') lacks a baseline, sample size, metric name, or citation.
- ZH: 宣传式百分比数字宣称（如`提升 40%``高达 80%``up to 50%`）附近缺少测试基线、样本数、指标口径或引用来源。
- Deletion Test (EN): Add the before -> after baseline, sample size (n=...), or link to the benchmark; otherwise cut the unverified percentage.
- Deletion Test (ZH): 补出改动前后的基准对比、样本量或测评出处；拿不出出处就删掉具体百分比。

```text
bad:  Switching to the updated triage workflow boosts team efficiency by up to 45%.
trap: Teams work smarter. Triage moves faster. Quality soars.
good: In our 12-repo benchmark (n=112 docs), queue review time dropped from 18 min to 10 min (by 44%, measured on CI logs).
```

Atomic card: [unsourced-statistic.md](../rules/unsourced-statistic.md)
