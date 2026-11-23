# `dislop` 视觉 / Web UI / SVG / 图片 / PDF 去 AI 味基准评测报告（`visual-design-v1`）

> 基准版本：`visual-design-v1`（60 份对抗样本：32 份 AI 视觉套路正例 + 28 份困难负例）· 实验脚本：[scripts/run_visual_benchmark.mjs](../scripts/run_visual_benchmark.mjs) · 原始结果：[benchmarks/results/visual-benchmark-latest.json](./results/visual-benchmark-latest.json)

本报告汇总 `dislop` 视觉、前端 UI、SVG 图解、光栅图片（PNG/JPEG/WebP）与 PDF 演示版面检测能力的定量对比实验，涵盖 4 组检出对照臂、跨模态分项表现、PNG 像素启发式阈值消融，以及 Node.js 与 Python 双运行时的字节级一致性核验。

---

## 1. 数据集与实验设置

评测集 [benchmarks/datasets/visual-design-v1.json](./datasets/visual-design-v1.json) 共含 **60 份标签对抗样本**，全部为原创构造或由零依赖脚本动态合成的真实二进制文件（另含 1 份独立加密 PDF 用于验证诚实跳过退出码）：

| 模态组别 | 总样本 | 正例（AI 套路/缺陷） | 困难负例（干净专业设计） | 重点覆盖的误报/漏报边界 |
|---|---:|---:|---:|---|
| **Web HTML / CSS / JSX** | 24 | 13 | 11 | 紫粉渐变、死链接、胶囊墙、三层套盒、光晕球、霓虹阴影、`animate-ping`、Emoji 图标堆砌、彩色图标方块、假三色窗口圆点、`01/02/03` 眉题、毛玻璃滥用与 Gen-2 暖米白伪人文模板 vs. 代码标本块、`<blockquote>`、单处 `backdrop-blur-sm`、单用 `Inter` 或单用暖米白 |
| **SVG 矢量图解** | 12 | 7 | 5 | `<linearGradient>`/`<radialGradient>` 紫粉渐变、重度发光滤镜、Emoji 节点、缺 `viewBox`、同组 `<text>` 重叠、`<defs>` 孤立定义 vs. 24×24 小图标、不同 `<g transform>` 组文字、正常中性渐变图表 |
| **PNG / JPEG 光栅图片** | 12 | 6 | 6 | A1111 `parameters` 块、ComfyUI `workflow` JSON、JPEG XMP `trainedAlgorithmicMedia`、黑底紫粉霓虹、高饱和光滑塑料涂抹 vs. 纸面海报、干净暗底 UI、3.6% 紫色小标志、高频高饱和纹理、透明底图、相机 EXIF |
| **PDF 演示与文档** | 12 | 6 | 6 | FlateDecode 裸 Markdown 与占位符、横版 145 词文字墙、5 页同骨架单调纯字、3 页纯图无字演示稿、紫粉 RGB 填充、字阶坍缩至 8.5pt vs. 5 页图文交替汇报、竖版 190 词技术报告、单页横版封面、UTF-16BE、碳黑配朱砂红 |

**四组对照臂**：

1. **`arm1_v071_baseline`**：升级前 `v0.7.1` 基线，仅包含最初 5 条 HTML/CSS/JSX 规则，不支持 SVG `<linearGradient>`、光晕球/Emoji/图标块、图片与 PDF。
2. **`arm2_naive_regex`**：无上下文护栏与阈值的朴素单关键词正则基线（如直接匹配 `rounded-full`、`border-l-4`、`<svg`、`Inter`、`#FAF8F5`、`01`、`🚀` 等）。
3. **`arm3_dislop_core`**：升级后的零依赖核心引擎 + `deck-and-ui`（共 11 条 UI/视觉/SVG/图片/PDF 活跃规则）。
4. **`arm4_dislop_full_patterns`**：在 `arm3` 基础上叠加 `--patterns`（`ui-glassmorphism-overuse`、`ui-accent-stripe-card` 与二阶伪人文模板探测 `ui-gen2-tasteful-slop`）。

---

## 2. 四臂总览与分模态对比结果

运行 `node scripts/run_visual_benchmark.mjs --assert` 实测总览如下：

| 对照臂 | Precision | Recall | F1 | 困难负例误报率 (FPR) | TP / FP / TN / FN |
|---|---:|---:|---:|---:|---|
| `arm1_v071_baseline` | 100.0% | 18.8% | 31.6% | 0.0% | 6 / 0 / 28 / 26 |
| `arm2_naive_regex` | 55.2% | 50.0% | 52.5% | **46.4%** | 16 / 13 / 15 / 16 |
| `arm3_dislop_core` | **100.0%** | 93.8% | 96.8% | **0.0%** | 30 / 0 / 28 / 2 |
| `arm4_dislop_full_patterns` | **100.0%** | **100.0%** | **100.0%** | **0.0%** | **32 / 0 / 28 / 0** |

分模态 F1 与误报率拆解：

| 模态组 | `arm1` (v0.7.1) F1 / FPR | `arm2` (朴素正则) F1 / FPR | `arm3` (核心升级) F1 / FPR | `arm4` (核心 + `--patterns`) F1 / FPR |
|---|---|---|---|---|
| **Web HTML / CSS / JSX** (24) | 63.2% / 0.0% | 60.0% / 72.7% | 91.7% / 0.0% | **100.0% / 0.0%** |
| **SVG 矢量图解** (12) | 0.0% / 0.0% | 73.7% / 100.0% | **100.0% / 0.0%** | **100.0% / 0.0%** |
| **PNG / JPEG 图片** (12) | 0.0% / 0.0% | 0.0% / 0.0% | **100.0% / 0.0%** | **100.0% / 0.0%** |
| **PDF 演示与文档** (12) | 0.0% / 0.0% | 0.0% / 0.0% | **100.0% / 0.0%** | **100.0% / 0.0%** |

关键结论：

- **朴素正则的误报灾难**：仅凭 `rounded-full`、`Inter`、`#FAF8F5`、`01` 或 `<svg` 等单信号命中，在 Web 困难负例上的误报率高达 `72.7%`，在 SVG 上高达 `100.0%`，总体 FPR 达到 `46.4%`。
- **结构护栏与多信号合取的价值**：引入代码块/引用区掩码、`<g transform>` 分组碰撞判定、横竖版 PDF 分流，以及 Gen-2 多信号合取门槛后，`arm3` 与 `arm4` 在保持 **0.0% 误报率**的同时把跨模态召回从 `18.8%` 提升至 `93.8%` / `100.0%`。

---

## 3. PNG 像素启发式阈值消融与仓库实图验真

针对 `image-ai-palette-slop` 的两项核心像素比率（`neonPurpleRatio` 与高饱和光滑度 `smoothHighSatRatio`），我们在 10 份 PNG 测试样本及仓内 **9 张真实生产图片**（`assets/og-card.png` 与 8 张 `assets/demos/*-poster.png`）上进行了参数网格扫描：

| 样本 / 资产 | `neonPurpleRatio` | `darkBgRatio` | `highSatRatio` | `smoothHighSatRatio` | `neutralRatio` | 判定结果 |
|---|---:|---:|---:|---:|---:|---|
| `img-pos-04` (黑底紫粉霓虹) | 0.3571 | 0.4524 | 0.1905 | 0.9583 | 0.0000 | 命中（霓虹紫粉） |
| `img-pos-05` (光滑高饱和塑料渐变) | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 命中（塑料涂抹） |
| `img-pos-06` (紫粉渐变底) | 1.0000 | 0.0000 | 0.0079 | 1.0000 | 0.0000 | 命中（霓虹紫粉） |
| `img-neg-03` (3.6% 紫色小标志) | 0.0363 | 0.0000 | 0.0363 | 0.8403 | 0.9637 | 放行（占比与中性背景保护） |
| `img-neg-04` (高频高饱和自然纹理) | 0.0000 | 0.0000 | 1.0000 | 0.0000 | 0.0000 | 放行（4 邻域 L1 差大，非涂抹） |
| `assets/og-card.png` (仓内真实卡片) | 0.0000 | 0.0195 | 0.0031 | 0.4107 | 0.9721 | 放行（0 误报） |
| `assets/demos/ui-slop-zh-v1-poster.png` | 0.0099 | 0.3081 | 0.0047 | 0.2222 | 0.5333 | 放行（0 误报） |
| `assets/demos/ui-slop-en-v1-poster.png` | 0.0111 | 0.3022 | 0.0103 | 0.2015 | 0.5306 | 放行（0 误报） |

在 `neonPurpleRatio >= {0.08, 0.12, 0.16, 0.22}` 与 `smoothHighSatRatio >= {0.45, 0.55, 0.65, 0.75}` 的 `4 x 4` 网格扫描中，所有 16 组参数对 9 张真实仓内图片均保持 **0 误报**；最终选定 **`neonPurpleRatio >= 0.16`（同时要求 `neutralRatio < 0.75`）与 `highSatRatio >= 0.38 && smoothHighSatRatio >= 0.65`** 作为兼顾品牌小图标安全余量与塑料涂抹检出率的默认基线。

---

## 4. Node.js / Python 双端一致性与运行性能

- **跨运行时一致率**：`60 / 60 (100.0%)`（`coreRuleIds` 与 `fullRuleIds` 在全部 HTML、CSS、JSX、SVG、PNG、JPEG 与 PDF 样本上完全一致，PNG 像素采样指标与 Python `parse_image_bytes` 小数点后 4 位一致）。
- **加密 PDF 诚实跳过**：Node 与 Python 均正确识别 `/Encrypt` 字典并返回 `skipped`（退出码 `2`），绝不伪装成 `0 findings`。
- **离线运行耗时**（全量 60 份含 PNG 解码与 PDF `FlateDecode` 解析）：Node.js **120.29 ms（2.0 ms/项）**；Python **257.62 ms（4.29 ms/项）**。

复现命令：

```bash
npm run bench:visual
node scripts/run_visual_benchmark.mjs --assert
```

---

## 5. 渲染态 VLM 三臂对比实测（`visual-vlm-v1`）

为验证「本地静态规则 vs 裸视觉大模型 vs 结构证据 + 量表多模态审校」的真实差异，我们在 [visual-vlm-v1.json](./datasets/visual-vlm-v1.json)（16 份经 Playwright Chromium 与 `pdftoppm` 实时渲染的 PNG 截图：8 正例 + 8 困难负例，含 3 份静态规则完全盲区的纯排版/版式味样本）上跑完两轮实测对比（[run_visual_vlm_bench.mjs](../scripts/run_visual_vlm_bench.mjs)，结果存 [visual-vlm-benchmark-latest.json](./results/visual-vlm-benchmark-latest.json)）：

| 模型 / 对照臂 | Precision | Recall | F1 | FPR | 静态盲区 Recall | 正负均值差 (`gap`) | 双轮波动 (`MAD`) | 平均耗时 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `Arm A`（本地零依赖静态 + `--patterns`） | 100.0% | 62.5% | 76.9% | 0.0% | 0.0% | — | 0.00 | ~2 ms |
| `gemini-3.1-flash-lite` · `Arm B`（裸 VLM） | 100.0% | 62.5% | 76.9% | 0.0% | 33.3% | 54.4 | 0.00 | 1,487 ms |
| `gemini-3.1-flash-lite` · `Arm C`（量表+静态证据） | 100.0% | **93.8%** | **96.8%** | **0.0%** | **83.3%** | **66.3** | 1.16 | 1,510 ms |
| `gemini-3.5-flash` · `Arm B`（裸 VLM） | 100.0% | 75.0% | 85.7% | 0.0% | 66.7% | 29.3 | 0.88 | 5,412 ms |
| `gemini-3.5-flash` · `Arm C`（量表+静态证据） | **100.0%** | **100.0%** | **100.0%** | **0.0%** | **100.0%** | **46.0** | **0.75** | 6,899 ms |

实测结论：

1. **裸 VLM 存在明确的同源审美盲区**：`Arm B` 下两款模型均在全部 2 轮中漏判了暖米白配陶土红的 Gen-2 模板网页（`gemini-3.1-flash-lite` 仅打 `10` 分、`gemini-3.5-flash` 仅打 `32` 分）以及三栏空洞模板幻灯片（`15` / `30–32` 分）。
2. **结构证据与分维量表拉齐上下限**：切换到显式含 Gen-2 与干净设计校准的 `Arm C` 后，`gemini-3.1-flash-lite` F1 从 `76.9%` 升至 `96.8%`（盲区召回 `33.3% -> 83.3%`）；`gemini-3.5-flash` F1 从 `85.7%` 升至 `100.0%`（盲区召回 `66.7% -> 100.0%`，两轮波动降为 `0.75`），且干净困难负例（极简日志页、克制暗色监控台、纯单栏纸感散文页、图文报告）全部保持 `0.0%` 误报。

复现渲染态 VLM 对比实验（需通过 `with-api` 注入凭据）：

```bash
node scripts/run_visual_vlm_bench.mjs --dry-run
~/.local/bin/with-api --keys GEMINI_API_KEY -- npm run bench:visual:vlm -- --models gemini-3.1-flash-lite,gemini-3.5-flash --repeats 2
```
