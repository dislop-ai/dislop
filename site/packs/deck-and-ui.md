---
content-type: reference-data
pack: deck-and-ui
tier: taste
version: 0.3.0
---

# Pack: `deck-and-ui` — Slide Deck, Web UI & Graphic Layout

> Flags PowerPoint and PDF slide word-walls, autofit text shrink, generic titles, Web UI neon gradients, glow orbs, emoji chrome, icon-tile grids, SVG layout defects, and raster image AI workflow/palette slop.

检查 PPT 与横版 PDF 文字墙、自动缩排、空泛标题，以及网页里的紫粉渐变、霓虹光球、Emoji 图标堆砌、模板卡格、SVG 排版缺陷和图片工作流残留与塑料配色。

## `slide-word-wall`
- Tier: `taste` · Severity: `warning` · Family: `deck/density`
- Modalities: `pptx, pdf`
- EN: Slide exceeds readable copy budget (> 120 Latin words or > 280 Chinese characters).
- ZH: 单页幻灯片可见文字超载（英文 > 120 词或中文 > 280 字），变成文档搬家。
- Deletion Test (EN): Move background narrative to speaker notes or an appendix doc; keep one takeaway headline and <= 3 supporting evidence points on the slide.
- Deletion Test (ZH): 将长篇背景移入演讲者备注或配套文档，画面仅保留 1 句结论标题与不超过 3 条核心论据。

```text
bad:  Slide 3 packs 215 words of full-sentence prose explaining migration history, rollback scripts, staffing, and Q4 SLA targets.
trap: Slide 3 shrinks body font to 9pt so all 215 words fit inside one rounded box.
good: Slide 3 headline: 'Zero-downtime migration cut p99 latency from 420 ms to 95 ms' + 3 short metric rows (54 words total); full runbook linked in notes.
```

Atomic card: [slide-word-wall.md](../rules/slide-word-wall.md)

## `slide-bullet-overload`
- Tier: `taste` · Severity: `warning` · Family: `deck/density`
- Modalities: `pptx`
- EN: Slide contains more than 6 bullet items (`maxSlideBullets`), fragmenting visual hierarchy.
- ZH: 单页幻灯片项目符号超过 6 条（`maxSlideBullets`），视觉层级碎裂。
- Deletion Test (EN): Group related bullets into 2–3 structured columns or split across two slides.
- Deletion Test (ZH): 将零散条目归并为 2–3 组结构化分栏，或拆分为两页演示。

```text
bad:  Slide lists 9 separate top-level bullets covering pricing, onboarding, compliance, SLA, and billing.
trap: Slide wraps 9 bullets into 9 tiny pill badges.
good: Slide groups commercial terms into 3 columns: Pricing ($49/seat), Onboarding (2 days), SLA (99.95%).
```

Atomic card: [slide-bullet-overload.md](../rules/slide-bullet-overload.md)

## `slide-autofit-shrink`
- Tier: `taste` · Severity: `warning` · Family: `deck/density`
- Modalities: `pptx`
- EN: PowerPoint `normAutofit` shrank text below 80% (`fontScale < 80000`) because copy overflowed its box.
- ZH: 文本框触发 PowerPoint 自动缩排（`fontScale < 80%`），表明文案超出容器容量。
- Deletion Test (EN): Trim the overflowing copy or enlarge the text frame so body type renders at 100% scale.
- Deletion Test (ZH): 精简溢出文案或调大文本框尺寸，使正文按 100% 原始字号清晰排布。

```text
bad:  <a:normAutofit fontScale="62500" lnSpcReduction="20000"/> on body placeholder
trap: Manually hardcode 10pt font so `normAutofit` disappears while text stays illegible.
good: <a:noAutofit/> with 42 words set at 18pt and full line spacing
```

Atomic card: [slide-autofit-shrink.md](../rules/slide-autofit-shrink.md)

## `slide-weak-topic-title`
- Tier: `taste` · Severity: `info` · Family: `deck/density`
- Modalities: `pptx`
- EN: Content-heavy slide uses a generic topic label (`Overview`, `Background`, `背景`) instead of stating its takeaway.
- ZH: 正文密集的幻灯片使用`背景/概述/总结`等空泛名词做标题，未直接亮出本页结论。
- Deletion Test (EN): Replace `Overview` with the one-sentence finding the audience should remember from this slide.
- Deletion Test (ZH): 把`项目背景/数据概述`替换为听众看完本页应记住的一句具体结论。

```text
bad:  Title: 'Background' (above 65 words detailing 38% cart abandonment on mobile Safari)
trap: Title: 'Reimagining Checkout Excellence'
good: Title: 'Mobile Safari accounts for 38% of cart abandonment due to 4-step address entry'
```

Atomic card: [slide-weak-topic-title.md](../rules/slide-weak-topic-title.md)

## `ui-ai-gradient`
- Tier: `taste` · Severity: `warning` · Family: `ui/slop-chrome`
- Modalities: `html, css, jsx, svg, pdf`
- EN: Default purple/indigo-to-pink generator gradient or gradient-clipped display headline.
- ZH: 使用默认紫粉/蓝紫高饱和渐变或渐变裁切艺术字标题（典型生成式模板特征）。
- Deletion Test (EN): Replace decorative neon gradients with solid surface tokens, crisp 1px rules, and typographic contrast.
- Deletion Test (ZH): 去掉装饰性霓虹渐变，改用克制的纯色纸面令牌、1px 结构分界线与字重对比。

```text
bad:  <h1 class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">Release Notes v2.4</h1>
trap: <h1 class="bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">Release Notes v2.4</h1>
good: <h1 class="page-title">Release Notes v2.4</h1>
```

Atomic card: [ui-ai-gradient.md](../rules/ui-ai-gradient.md)

## `ui-pill-soup`
- Tier: `taste` · Severity: `warning` · Family: `ui/slop-chrome`
- Modalities: `html, jsx`
- EN: Excessive `rounded-full` / `999px` text pills (> 6 per view) turn interface metadata into badge soup.
- ZH: 单视图堆砌超过 6 个胶囊圆角文字标签（`rounded-full` / `999px`），导致视觉噪音泛滥。
- Deletion Test (EN): Render metadata as plain tabular text separated by middots (`·`) or hairlines; save one high-contrast label for actionable status.
- Deletion Test (ZH): 将常规元数据改为用间隔号（`·`）或细线分隔的纯文本，仅对需要干预的异常状态保留单枚强调标记。

```text
bad:  8 adjacent `rounded-full` badges on one card: `Active`, `v2.4`, `US-West`, `SOC2`, `Fast`, `AI`, `Pro`, `Verified`.
trap: 8 square pastel badges with 8 emoji icons on one card.
good: Plain mono metadata line: `v2.4 · us-west-2 · SOC2` + single status word `degraded` when unhealthy.
```

Atomic card: [ui-pill-soup.md](../rules/ui-pill-soup.md)

## `ui-box-in-box`
- Tier: `taste` · Severity: `warning` · Family: `ui/slop-chrome`
- Modalities: `html, jsx`
- EN: Three or more nested bordered/rounded containers wrap the same content (`box-in-box-in-box`).
- ZH: 连续三层及以上带边框与圆角的容器层层套盒，挤压有效内容空间。
- Deletion Test (EN): Remove outer wrapper borders and separate sections with alignment, whitespace, or a single 1px rule.
- Deletion Test (ZH): 去掉多余的外层描边套盒，改用对齐、留白或单根 1px 分界线组织层级。

```text
bad:  <div class="border rounded-xl p-6"><div class="border rounded-lg p-4"><div class="border rounded-md p-3">99.98% uptime</div></div></div>
trap: <div class="shadow-xl rounded-2xl p-6"><div class="shadow-md rounded-xl p-4"><div class="bg-slate-900 rounded-lg p-3">99.98% uptime</div></div></div>
good: <section class="metric-row"><span>Uptime (90d)</span><strong>99.98%</strong></section>
```

Atomic card: [ui-box-in-box.md](../rules/ui-box-in-box.md)

## `ui-prompt-echo-badge`
- Tier: `taste` · Severity: `warning` · Family: `ui/slop-chrome`
- Modalities: `html, jsx, svg`
- EN: Interface chrome echoes prompt-engineering hype (`AI-Powered`, `Zero Hallucination`) instead of naming the function.
- ZH: 界面标签直接回显提示词营销口号（如`AI 强力驱动``零幻觉保证`），未说明具体功能。
- Deletion Test (EN): Delete the `AI-Powered` badge; label the control by the exact task it performs ('Extract invoice totals', 'Check slide word count').
- Deletion Test (ZH): 删去`AI 驱动`装饰标牌，直接用控件完成的实际动作命名（如`核对幻灯片字数`）。

```text
bad:  <span class="eyebrow">AI-Powered · Zero Hallucination</span><h2>Document Checker</h2>
trap: <span class="eyebrow">Built for Craft · Pure Signal</span><h2>Document Checker</h2>
good: <h2>Document Linter for Markdown, HTML, DOCX & PPTX</h2>
```

Atomic card: [ui-prompt-echo-badge.md](../rules/ui-prompt-echo-badge.md)

## `ui-glow-blob-chrome`
- Tier: `taste` · Severity: `warning` · Family: `ui/slop-chrome`
- Modalities: `html, css, jsx, svg`
- EN: Decorative ambient blur orbs (`blur-3xl`), neon box-shadows, pulsing `animate-ping` pill dots, or heavy SVG glow filters.
- ZH: 堆砌装饰性环境光晕球（`blur-3xl`）、霓虹色阴影、闪烁 `animate-ping` 小圆点或重度 SVG 发光滤镜。
- Deletion Test (EN): Delete decorative blur orbs and colored glow shadows; separate layers with solid surface tokens and crisp 1px borders.
- Deletion Test (ZH): 删掉无功能的光晕球和霓虹发光阴影，改用单调阶梯底色和 1px 实线分隔层次。

```text
bad:  <div class="blur-3xl rounded-full bg-purple-500/30"></div><button class="shadow-indigo-500/50">Launch</button>
trap: <div class="blur-3xl rounded-full bg-amber-500/20"></div><button class="shadow-teal-500/50">Launch</button>
good: <section class="surface-sheet border"><button class="btn-primary">Launch</button></section>
```

Atomic card: [ui-glow-blob-chrome.md](../rules/ui-glow-blob-chrome.md)

## `ui-emoji-icon-chrome`
- Tier: `taste` · Severity: `warning` · Family: `ui/slop-chrome`
- Modalities: `html, jsx, svg`
- EN: Three or more decorative AI stock emojis (`🚀`, `✨`, `⚡`, `🛡️`) used as interface or heading icons.
- ZH: 在界面标题、按钮或卡片里堆砌 3 处及以上通用 Emoji（如 `🚀`、`✨`、`⚡`、`🛡️`）充当图标。
- Deletion Test (EN): Strip decorative emojis from headings and controls; use plain typography or a consistent single-stroke SVG icon set.
- Deletion Test (ZH): 删去标题与按钮里的装饰 Emoji，改用纯文字层级或统一线宽的单色矢量图标。

```text
bad:  <h3>🚀 Fast</h3><h3>⚡ Sync</h3><h3>🛡️ Safe</h3>
trap: <h3>🌟 Fast</h3><h3>💎 Sync</h3><h3>🎯 Safe</h3>
good: <h3>Sub-50 ms checks</h3><h3>Local sync</h3><h3>Offline by default</h3>
```

Atomic card: [ui-emoji-icon-chrome.md](../rules/ui-emoji-icon-chrome.md)

## `ui-template-card-grid`
- Tier: `taste` · Severity: `warning` · Family: `ui/slop-chrome`
- Modalities: `html, jsx`
- EN: Stock generator UI boilerplate: tinted rounded-square icon tiles (>= 3), fake macOS 3-dot window chrome, or sequential `01`/`02`/`03` eyebrow kickers.
- ZH: 命中生成式界面三大件：彩色圆角方块图标卡（>= 3 组）、假 macOS 三色窗口圆点或 `01`/`02`/`03` 编号眉题。
- Deletion Test (EN): Remove fake window dots, sequential numeric kickers, and tinted icon tiles; organize cards with real headings and alignment.
- Deletion Test (ZH): 删去假窗口圆点、编号眉题和马卡龙图标块，靠真实小标题和对齐建立网格秩序。

```text
bad:  <div class="rounded-xl w-10 h-10 bg-indigo-50">A</div><div class="rounded-xl w-10 h-10 bg-purple-50">B</div><div class="rounded-xl w-10 h-10 bg-pink-50">C</div>
trap: <div><span>01</span><h3>Speed</h3><span>02</span><h3>Scale</h3><span>03</span><h3>Trust</h3></div>
good: <section class="grid"><div><h3>CLI</h3><p>Checks Markdown and PPTX locally.</p></div><div><h3>MCP</h3><p>Connects to coding agents.</p></div></section>
```

Atomic card: [ui-template-card-grid.md](../rules/ui-template-card-grid.md)

## `svg-layout-slop`
- Tier: `taste` · Severity: `warning` · Family: `graphic/svg-structure`
- Modalities: `svg`
- EN: SVG graphic has structural generation defects: missing `viewBox` on a large canvas, overlapping `<text>` coordinates, or >= 2 orphaned `<defs>` entries.
- ZH: SVG 平面图形存在生成式结构缺陷：大画布缺失 `viewBox`、文字坐标重叠或 `<defs>` 中残留 2 处及以上孤立未用定义。
- Deletion Test (EN): Add an explicit `viewBox`, separate `<text>` coordinates cleanly, and delete unused gradients or filters from `<defs>`.
- Deletion Test (ZH): 补齐显式 `viewBox`，拉开重叠文字坐标，并清理 `<defs>` 里未被引用的冗余渐变与滤镜。

```text
bad:  <svg width="640" height="360"><text x="40" y="50">Step 1</text><text x="42" y="52">Overlap</text></svg>
trap: <svg viewBox="0 0 640 360" width="640" height="360"><defs><linearGradient id="u1"/><linearGradient id="u2"/></defs><rect width="640" height="360"/></svg>
good: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360"><text x="40" y="50">Step 1</text><text x="40" y="96">Step 2</text></svg>
```

Atomic card: [svg-layout-slop.md](../rules/svg-layout-slop.md)

## `image-ai-workflow-residue`
- Tier: `taste` · Severity: `warning` · Family: `graphic/image-residue`
- Modalities: `image`
- EN: Raster image embeds unstripped AI generation prompt/workflow parameters (warning) or explicit synthetic provenance tags (info — retain required legal disclosures).
- ZH: 图片文件内嵌了未清理的生成提示词/工作流参数（提醒），或带有显式 AI 生成来源标识（提示：合规场景请保留法定标识，重点复核成图质感）。
- Deletion Test (EN): Strip accidental raw prompt/seed workflow JSON before shipping assets; keep legally required C2PA or IPTC `trainedAlgorithmicMedia` disclosures intact.
- Deletion Test (ZH): 交付前清理意外残留的提示词与工作流 JSON；属于法规要求的 C2PA 或 `trainedAlgorithmicMedia` 标识请勿私自剥除，仅作质感复核。

```text
bad:  PNG tEXt chunk `parameters`: `masterpiece, neon glow\nNegative prompt: blurry\nSteps: 28, Sampler: Euler a, CFG scale: 7`
trap: Stripping legal C2PA / `trainedAlgorithmicMedia` provenance tags instead of inspecting or re-shooting the asset
good: Clean PNG/JPEG export with raw prompt/node-graph chunks removed and natural photographic or editorial raster assets
```

Atomic card: [image-ai-workflow-residue.md](../rules/image-ai-workflow-residue.md)

## `image-ai-palette-slop`
- Tier: `taste` · Severity: `info` · Family: `graphic/image-aesthetics`
- Modalities: `image`
- EN: PNG pixel profile matches default AI-slop aesthetics: dominant neon purple-indigo-pink palette or hyper-saturated airbrushed plastic sheen.
- ZH: PNG 像素分布呈现典型生成式视觉套路：高占比蓝紫霓虹主色，或大面积高饱和光滑`塑料感`涂抹。
- Deletion Test (EN): Review the rendered image for plastic skin/surfaces or generic neon-purple backdrops; re-grade toward natural micro-contrast and restrained accents.
- Deletion Test (ZH): 人工复核图片是否存在塑料反光质感或默认黑底蓝紫霓虹，改用自然材质细节与克制配色。

```text
bad:  1024x1024 dark-mode hero PNG with 42% #0B0B14 dark backdrop and 28% glowing #7C3AED/#EC4899 purple-pink pixels
trap: 1024x1024 PNG pushing every surface to 92% saturation with airbrushed zero-texture gradients
good: 1024x1024 PNG on #F6F7F5 paper ground with crisp ink typography and <= 5% single vermilion accent
```

Atomic card: [image-ai-palette-slop.md](../rules/image-ai-palette-slop.md)

## `pdf-visual-layout-slop`
- Tier: `taste` · Severity: `warning` · Family: `graphic/pdf-layout`
- Modalities: `pdf`
- EN: PDF slide/poster layout exhibits synthetic template defects: multi-page raster-only slides, collapsed font hierarchy, crushed < 9.5pt body copy, or 4+ consecutive identical landscape slide skeletons.
- ZH: PDF 演示页或海报存在排版缺陷：多页全图无可选文字、横版页字阶扁平或正文缩至 < 9.5pt，或连续 4 页及以上同骨架纯字横版页。
- Deletion Test (EN): Export slides with selectable vector text, restore a >= 1.2x title-to-body type scale, keep body type >= 11pt, and vary layout structure across slides.
- Deletion Test (ZH): 导出可选择矢量文本而非整页贴图，拉开至少 1.2 倍的标题与正文字号阶梯（正文 >= 11pt），并穿插表格或图表。

```text
bad:  4-page landscape 960x540 PDF deck where every slide is a single rasterized PNG image with 0 selectable text operators
trap: 4-page landscape PDF deck shrinking all body text to 8.5pt with 10pt titles (1.17x ratio) to cram paragraphs
good: 5-page landscape PDF deck with 28pt assertion headlines, 13pt body copy, and alternating tables and charts
```

Atomic card: [pdf-visual-layout-slop.md](../rules/pdf-visual-layout-slop.md)
