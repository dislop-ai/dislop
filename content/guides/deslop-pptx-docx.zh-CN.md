---
slug: "deslop-pptx-docx"
lang: "zh"
title: "AI 生成的 PPT 和 Word 怎么去模板味：字墙、自动缩字和伪结论标题排查教程"
navTitle: "PPT 与 Word 去模板味"
description: "直接扫描 DOCX、PPTX 和横版 PDF 的结构问题：清理未渲染星号、单页字墙、过量要点、自动缩字和空泛汇报标题。"
summary: "AI 做的 PPT 和 Word 最常出五种毛病：直接贴进文档没渲染的 `**加粗**` 星号、单页超过 280 字的字墙、6 条以上同级要点、文字框自动缩到看不清，以及“概述”“关于……的分析”这类没给结论的标题。用本地工具直接解包检查 XML 结构，比肉眼翻快得多。"
category: "办公文档与演示"
published: "2026-11-23"
updated: "2026-11-23"
readingMinutes: 6
keywords: ["PPT去AI味", "Word去AI味", "PPT排版检查", "字墙排查", "办公Agent", "markdown-leak"]
relatedRules: ["markdown-leak", "slide-word-wall", "slide-bullet-overload", "slide-autofit-shrink", "slide-weak-topic-title", "slide-process-not-finding-title", "pptx-layout-monotony", "pdf-visual-layout-slop"]
relatedGuides: ["what-is-ai-slop", "remove-ai-slop-writing", "agent-cli-mcp-tutorial"]
sources: ["wp-signs-of-ai-writing", "asd-ste100", "digitalgov-plain-language", "mrgediao-shuorenhua", "stiftung-buchkunst", "the-type-cjk", "gbt-15834-punctuation"]
faqs:
  - q: "把文件直接拖进网页工作台检查 Word 或 PPT，会把原文件传到服务器吗？"
    a: "不会。浏览器工作台的本地检查完全在当前标签页里解包 XML 并运行规则，不上传文件；只有你主动登录并点击“云端审校/保留排版改写”时，才会走云端服务处理，且不保存原稿。"
  - q: "为什么 PPT 里只是塞满了字或连续 4 页版式相同也要被标出来？"
    a: "因为大模型生成幻灯片时往往只是把大纲塞进同一套模板：每页 300 多汉字配 8 条要点，靠 PowerPoint 自动缩字（normAutofit）硬塞进框里，观众根本没法扫读。穿插表格、折线图和双栏对照能明显降低审阅疲劳。"
  - q: "横版 PDF 导出幻灯片也能查吗？"
    a: "可以。如果导出时把整页文字压成了无法选中的位图、正文小到 9.5pt 以下，或者连续 4 页用同一个字阶扁平的纯字骨架，`pdf-visual-layout-slop` 会直接给出提醒。"
---

用 AI 生成一份 Word 方案或季度汇报 PPT，最花时间的往往不是文字本身，而是发出去前才发现：第 4 页贴着对话里抄来的 `**核心结论**` 裸星号，第 7 页硬塞了 350 个字被自动缩到 10 号，第 2 到第 6 页全是完全一样的“标题 + 四行要点”。

这类问题不需要靠人眼一页页翻，直接解析 `.docx`、`.pptx` 和 `.pdf` 内部结构就能一次标清。

## 1. 办公交付最常踩中的 7 个结构问题

| 规则 ID | 实际表现 | 为什么必须改 | 怎么改最直接 |
|---|---|---|---|
| `markdown-leak` | Word 或 PPT 正文出现 `**重点**` 或 `## 小节` 裸符号 | 属于交付硬伤，一眼看出从聊天框直接粘贴 | 删掉符号，用 Word/PPT 原生加粗和标题样式 |
| `slide-word-wall` | 单页幻灯片塞进超过 280 个汉字（或 120 个英文词） | 一页写成文档，投影时谁也看不下去 | 拆成两页，或者删到只留结论和 1 组对比数字 |
| `slide-bullet-overload` | 单页堆了 7 条及以上同级列表要点 | 看不出重点排序，像机器凑出来的大纲 | 合并同类项，每页保留 `3–5` 条主要点 |
| `slide-autofit-shrink` | `normAutofit` 字号缩放跌破 `80%` | 字体被硬压小，台下根本看不清 | 删减多余说明文字，恢复正常字号 |
| `slide-weak-topic-title` | 标题只写“背景”“概述”“总结”“下一步” | 听众只看标题不知道这页到底要表达什么 | 改成一句带结论的完整判断 |
| `slide-process-not-finding-title` | 标题写成“关于三季度流失率的分析汇报” | 只交代了工作过程，没有亮出发现的数字 | 直接把结论放进标题：“三季度首周流失率从 34% 降至 19%” |
| `pptx-layout-monotony` | 连续 4 页以上使用完全相同的纯文字要点版式 | 满屏字块视觉疲劳，缺少数据直观性 | 把对比或趋势页改成对照表、流程图或折线图 |

看一个管理汇报标题从空泛标签改到结论先行的对照：

```text
bad:  ## 关于三季度新客首周流失率（34% 降至 19%）的分析汇报
trap: ## 重塑新客留存增长飞轮
good: ## 三季度新客首周流失率从 34% 降至 19%
```

`trap` 里把过程标签换成了“增长飞轮”这种黑话口号，结果反而把最关键的 `34% -> 19%` 数字弄丢了。

![dislop 检查 quarterly-review.pptx：标出裸 Markdown、字墙、68% 缩排和过程标题后改为结论页](demo:deck-office)

## 2. 本地零上传检查 Word、PPT 和 PDF

如果你的文件涉及内部经营数据或未公开方案，最稳妥的方式是在本机离线跑一遍检查：

```bash
# Node 命令行（零依赖）
npx --yes dislop check report.docx deck.pptx slides.pdf

# Python 命令行（uvx 一行执行）
uvx dislop check deck.pptx --pack executive-deck
```

如果文件本身已损坏、加密或扫描 PDF 完全没有可选文字，`dislop` 会如实输出 `[SKIP]` 或覆盖率警告（单文件返回退出码 `2`），不会假装报成“0 处问题”。

## 3. 什么时候用云端保留排版改写

需要让系统按原文档样式自动清理套话并生成带修订标记（Track Changes）的 `.docx` 或保留母版结构的 `.pptx` 时，可以登录网页工作台或连接官方远程 MCP（`https://dislop.com/mcp`）。建议按这个顺序操作：

1. 先用本地 CLI 扫一遍，手动补齐未填占位符和缺失数字（模型无法替你编造真实数据）。
2. 将非涉密文稿送入云端改写，保留 Word 修订标记，逐条确认数字与专有名词原封不动。
3. 导出后再跑一次本地 `dislop check`，确保没引入二阶反转句。
