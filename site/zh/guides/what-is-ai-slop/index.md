---
content-type: reference-data
lang: zh
updated: 2026-11-23
version: 0.8.4
---

# 什么是 AI 味：从词面套话、二阶句式到模板网页与 PPT 的识别图谱

> AI 味（AI slop）指大模型按训练统计均值批量吐出的低信息密度内容，不仅包括抽象公文黑话和开头寒暄，还包括删掉套词后冒出来的反转句式、紫粉渐变网页模板，以及挤满字墙的 PPT。

收到一份 AI 帮忙起草的周报、网页或 PPT 时，很多人第一眼会觉得“说得都对，但一眼假”。程序员和写作者通常把这种未经认真审阅、直接堆出来的内容叫做 **AI 味（AI slop）**。

2024 年 5 月，开发者 Simon Willison 在一篇讨论文章里把类比垃圾邮件（spam）的未经审阅 AI 产物定名为 slop。到了 2025—2026 年，这个问题已经从博客蔓延到科研文献、开源仓库和办公交付物里。

## 1. 行业里看到的真实规模

AI 味是经过对齐微调的模型按高概率均值生成的默认习惯，很少只出现在某一个词上：

1. **科研论文用词偏移**：Kobak 等人在 *Science Advances*（[arXiv:2406.07016](https://arxiv.org/abs/2406.07016)，2025）统计了 1,500 万篇 PubMed 摘要，估算出 2024 年至少 13.5% 的生物医学摘要带有明显的模型超额词汇，比例远高于往年基线。
2. **模型之间高度趋同**：NeurIPS 2025 论文 *Artificial Hivemind*（[arXiv:2510.22954](https://arxiv.org/abs/2510.22954)）用 Infinity-Chat 数据集对比了多个主流模型，发现不同模型面对开放问题时不仅自重复，彼此给出的句式和套路也非常接近。
3. **开源协作被水文拖垮**：2026 年 1 月，curl 维护者 Daniel Stenberg 宣布关闭漏洞赏金计划，原因是大量 AI 生成的低质量漏洞报告把有效率从 15% 以上拉低到 5% 以下；CodeRabbit（2025）对真实开源 PR 的统计也发现，AI 生成的 PR 平均出现 10.83 个问题，约为人工 PR（6.45 个）的 1.7 倍。

## 2. 怎么一眼拆出四类常见 AI 味

不管是文档、网页还是汇报 PPT，AI 味主要集中在这四层：

| 层级 | 中文里最常见的样子 | 为什么必须优先清掉 |
|---|---|---|
| **交付残留硬伤** | 开头留着“好的，以下是润色后版本”、没填的 `【待补充】`、贴进 Word 的 `**加粗**`、网页 `href="#"` 死链接 | 一眼暴露没自己看一遍就往外发，属于硬伤 |
| **词面套话与黑话** | “值得注意的是”“抓手”“全面赋能”“形成闭环”“显著提升” | 把具体的操作主体和改动动作糊成抽象词 |
| **二阶句式与节奏** | “不是 X，而是 Y”反转口号、三段分号对称排比、四字套话连串、自问自答、段尾金句升华 | 只删禁词不改结构时，模型立刻换成这类演出来的强调句 |
| **网页与 PPT 模板** | Tailwind 紫粉霓虹渐变、满屏圆角胶囊标签、三层框套框、PPT 单页塞满纯字、自动缩字、`概述/背景` 标题 | 每一份不同主题的页面长成同一个模板脸，信息反而不突出 |

下面是一段上线说明从原稿到换壳、再到改干净的真实对照：

```text
bad:  好的，以下是修改后的上线说明。值得注意的是，本次改造以队列分级为重要抓手，全面赋能一线运维团队，故障恢复时间最多 45 秒。
trap: 队列分级已经落地，故障恢复时间最多 45 秒。这不是一次简单的升级，而是一场效率革命。
good: 这次改造给队列分了级，一线运维团队的故障恢复时间最多 45 秒。
```

第二句 `trap` 里把抽象黑话全删掉了，但读起来依然像推广文案，原因就在“这不是……而是……”把正常技术事实硬拔成了空口号。

![dislop 检查上线说明三步对照：标出 AI 寒暄与空话、拦下二阶口号、改干净后退出码 0](demo:proof-cycle)

## 3. 先查哪一层最省时间

1. **先把交付底线清干净**：删掉寒暄壳、占位符、Word/PPT 里的裸星号和空链接。如果用 `dislop check .`，这一层对应 `packs/core`，默认作为报错拦住。
2. **再看保留信息**：对着标出来的套话或反转句，只问自己一句“删掉这半句之后，读者会少知道哪个数字、机制或边界？”没有新增信息就直接砍掉。
3. **最后过一遍排版与标点**：中文正文检查有没有误夹英文半角逗号括号、每页 PPT 有没有退化成字墙、网页有没有堆无用装饰渐变。

想立刻测试手头的文字、Markdown、Word、PPT 或 HTML，可以直接用 `npx --yes dislop check .` 在本地离线扫一遍，也可以打开首页工作台粘贴试查。

## 常见问题

### 删掉公文黑话和空泛动词之后，为什么文章还是像 AI 写的？

因为模型会退回结构模板。禁用高频套词后，大模型最常见的替代写法是“不是 A，而是 B”反转口号、三段工整分号排比和段尾升华总结，这些同样可以通过句法规则标出来。

### 哪些文件最容易混进 AI 味残留？

最常见的是从对话窗口直接复制粘贴的内容：文稿开头的对话寒暄、Word 和 PPT 里没渲染的星号加粗符号、忘了替换的括号占位文字，以及网页里点不动的 `href=\"#\"` 空按钮。

### AI 味问题有多普遍，有实证数据吗？

有。Kobak 等人在 Science Advances（2025，n=1,500 万篇 PubMed 摘要）通过超额词汇测算，2024 年至少 13.5% 的生物医学摘要经过 LLM 处理；CodeRabbit 实测（2025）也显示，AI 生成的代码 PR 平均多出约 1.7 倍问题（10.83 个对比人类 6.45 个）。

## 参考出处

- [Simon Willison: Slop is the new name for unwanted AI-generated content](https://simonwillison.net/2024/May/8/slop/): Published 2024-05-08; popularized 'slop' for unsolicited, unreviewed AI-generated content by analogy to email spam.
- [Wikipedia: Signs of AI writing (WP:AISIGNS)](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing): WikiProject AI Cleanup's living taxonomy of AI prose defects: inflated significance, stock vocabulary, rule-of-three lists, negative parallelisms, chatbot wrappers, and formatting artifacts.
- [Delving into LLM-assisted writing in biomedical publications through excess vocabulary (Science Advances 2025)](https://arxiv.org/abs/2406.07016): Analyzed 15M PubMed abstracts and estimated at least 13.5% of 2024 biomedical abstracts were processed with LLMs (lower bound), marked by excess words like 'delve', 'intricate', and 'pivotal'.
- [Artificial Hivemind: The Open-Ended Homogeneity of Language Models (and Beyond) (NeurIPS 2025)](https://arxiv.org/abs/2510.22954): Using the Infinity-Chat dataset, demonstrated both intra-model repetition and inter-model homogeneity across different LLM families.
- [op7418/Humanizer-zh: 中文去 AI 味写作技能](https://github.com/op7418/Humanizer-zh): 23,450 星标（2026-11-21 快照）；针对中文写作里的套话、公文腔与翻译腔整理对照清单，适合作为写作前提示参考。
- [Daniel Stenberg: The end of the curl bug bounty](https://daniel.haxx.se/blog/2026/01/26/the-end-of-the-curl-bug-bounty/): Published 2026-01-26; ended curl's bug bounty effective 2026-01-31 after low-quality AI-generated reports pushed valid report rates from >15% down below 5%.
- [CodeRabbit: State of AI vs Human Code Generation Report](https://www.coderabbit.ai/reports-guides): Measured AI-generated PRs averaging ~1.7x more issues (10.83 vs 6.45), 75% more logic errors, and >3x readability/formatting issues compared with human PRs.
