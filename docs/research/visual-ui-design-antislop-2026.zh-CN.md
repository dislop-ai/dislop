# 视觉、Web UI 与平面/图片/PDF 去 AI 味（Anti-Slop）行业实践研报与实验对比

> 快照日期：2026-11-22 · 开源生态核验样本：14 个通过 GitHub API 与源码核查的视觉/前端/图解/动效项目 · 自研基准：[visual-design-v1（60 份对抗样本）](../../benchmarks/VISUAL-BENCHMARK.md)
>
> 证据边界：文中所有星标数、许可证与规则数量均核验自 2026-11-22 GitHub REST API 及仓内源码；业界规范归纳区分「开源检查器源码实证」与「公开基准论文结论」。

截至 2026 年 11 月 22 日，GitHub 上关注度最高的前端与视觉去 AI 味项目已跨过十万星门槛：`anthropics/skills` 达 198,794★，`nextlevelbuilder/ui-ux-pro-max-skill` 达 152,711★，`Leonxlnx/taste-skill` 达 119,943★，`pbakaus/impeccable` 达 114,807★，`cathrynlavery/diagram-design` 达 70,096★。前端、图解、图片与演示文档的去 AI 味已经从早期提示词清单，演化为「设计契约前置 + 零 LLM 确定性扫描器 + 渲染态/像素采样校验 + 轻量多模态审查」的多层工程体系。

---

## 1. 行业热点项目全景盘点（2026-11-22 源码与星标核验）

按作用阶段与技术形态，当前主流视觉去 AI 味项目可分为四类：

| 类别 | 项目 | 星标 (2026-11-22) | 协议 | 最近推送 | 核心机制与可验证亮点 |
|---|---|---:|---|---|---|
| **前置设计契约与词汇控制** | `anthropics/skills` (`frontend-design`) | 198,794 | Apache-2.0（子目录） | 2026-11-16 | 把编码 Agent 定位为设计负责人，强制在写 HTML/CSS 前先锁定审美方向、字体组合与版式主轴 |
| **前置设计令牌库** | `nextlevelbuilder/ui-ux-pro-max-skill` | 152,711 | MIT | 2026-11-22 | 按行业提供成套色板、字体配对与平台组件规范，减少模型即兴拼凑 |
| **品味参数与浏览器钩子** | `Leonxlnx/taste-skill` | 119,943 | MIT | 2026-11-22 | 提供 `DESIGN_VARIANCE`、`MOTION_INTENSITY` 等显式旋钮，配套 `gate.mjs` 停机检查与参考图引导 |
| **设计词典 + Rust 确定性扫描** | `pbakaus/impeccable` | 114,807 | Apache-2.0 | 2026-11-22 | 用 `PRODUCT.md`/`DESIGN.md` 建立项目上下文，自带 Rust 编写的 62 条零 LLM 确定性检测规则与 SARIF 输出 |
| **出版级 HTML+SVG 图解** | `cathrynlavery/diagram-design` | 70,096 | MIT | 2026-11-22 | 封装 45 类自包含 HTML+SVG 图解模板，配 `lint-skin.py` 与 `verify_static_svg_visibility.py` 拦截阴影滥用与字形遮挡 |
| **改版保真防破坏** | `Nutlope/hallmark` | 59,308 | MIT | 2026-11-11 | 专注「旧页面翻新」场景，防止模型在美化界面时删掉原有路由链接、表单字段与真实交互 |
| **Web 工程与可用性准则** | `vercel-labs/agent-skills` (`web-design-guidelines`) | 34,714 | 见仓内许可 | 2026-11-20 | 将界面审查拆成可访问性、表单状态、焦点环、溢出与动画性能等工程核对条 |
| **Vibecoding 视觉精修** | `heydamir/unslop` | 20,020 | CC-BY-4.0 | 2026-11-15 | 聚焦把 AI 初版页面改造为克制排版的交互工作流技能 |
| **动效去模板** | `Tejashmakwana/motionmaxxing` | 1,766 | Apache-2.0 | 2026-10-06 | 消除千篇一律的弹性缓动、等速淡入与数字滚动动画 |
| **35 条视觉体征图谱** | `yetone/kill-ai-slop` | 1,467 | Apache-2.0 | 2026-09-15 | 总结 35 条 AI 产品视觉与文案体征，配套 `skill/scripts/scan.mjs` 本地扫描脚本 |
| **设计工作台集成** | `superdesigndev/superdesign-skill` | 1,045 | MIT | 2026-08-21 | 接入设计系统工作流，限制默认圆角卡片与通用图标堆砌 |
| **生成式审美护栏** | `Yu-369/VibeCurb` | 1,011 | MIT | 2026-08-05 | 为编码 Agent 注入版式密度与对比度前置约束 |
| **一二阶双代视觉扫描器** | `funboy322/avoid-ai-design` | 170 | MIT | 2026-11-18 | `scripts/detect.mjs`（729 行）系统列出 56 条规则，同时打击紫粉霓虹与「暖米白+陶土红」二阶伪精致模板 |
| **网页对比评分卡** | `cesaroeduardo/antiwebslop` | 44 | MIT | 2026-11-17 | 提供改造前后画廊、Next.js 对照站与验证评分脚本 |

横向对比上述头部项目源码后，可以看到三条明确的工程演进趋势：

1. **头部技能已全面转向「规范卡 + 本地扫描器」双件套**。单纯写一段提示词告诉模型「不要像 AI 做的」往往在 3 轮修改后失效。`impeccable` 在 `crates/core/src/checks/` 下用 Rust 实现了 CSS 扫描、采样对比度、渐变几何、硬偏移阴影与装饰文本等 16 个检测子模块；`diagram-design` 用 Python 静态校验 SVG 可见性与皮肤极性；`avoid-ai-design` 与 `kill-ai-slop` 则直接把检查规则固化为零依赖 `.mjs` 扫描器。
2. **检测对象已从 HTML/CSS 扩展到 SVG 图解与动效代码**。仅查 Tailwind 类名抓不到 `<svg>` 里失控的 `<feGaussianBlur>`、缺失的 `viewBox` 与重叠 `<text>`，也抓不到把 Mermaid 默认粗糙图塞进文档的偷懒行为。
3. **跨媒介覆盖仍有明显空档**。主流高星项目几乎全部聚焦前端源码（HTML/CSS/JSX/SVG），很少把**导出的 PDF 演示稿/海报**和**嵌入网页或 PPT 的光栅图片（PNG/JPEG/WebP）**纳入同一套本地确定性检查流程。

---

## 2. 视觉 AI 味的三代演化图谱与跨模态缺陷

结合 `avoid-ai-design`、`kill-ai-slop`、`impeccable` 规则集与扩散模型/幻灯片生成实测，视觉与平面设计中的 AI 味呈现清晰的三代演化：

| 代际与媒介 | 典型视觉表现 | 形成原因 | 对应确定性可检特征 |
|---|---|---|---|
| **第一代 Web 霓虹模板** | 深蓝紫/黑底配 `indigo -> purple -> pink` 渐变与裁切大字、超大 `blur-3xl` 发光球、彩光按钮阴影、`animate-ping` 小绿点、三层套盒、满屏 `rounded-full` 胶囊、假 macOS 三色窗口圆点、彩色图标方块、标题堆 `🚀✨⚡` | 早期 SaaS 着陆页训练语料高度集中，模型默认用高饱和发光与圆角徽章制造「科技感」 | Tailwind/CSS 颜色与滤镜声明、DOM 嵌套栈深、UI 标签内 Emoji 计数、相邻红黄绿圆点序列 |
| **第二代「伪人文精致模板」** | 禁用紫粉渐变后，模型整体退回「暖米白底（`#FAF8F5`/`#F7F5F0`）+ 陶土红点缀（`#C45A3B`/`#D97757`）」、标题里刻意放一个衬线斜体词（`Built for <em>clarity</em>`）、全站 `Inter`、宽字距全大写眉题配 `rounded-2xl shadow-xl`、`01`/`02`/`03` 编号卡 | 提示词只禁止一阶模板时，模型坍缩到训练集中另一种高分审美均值 | 多信号共现：单用 `Inter` 或单用暖米白均属正常，但 2 项以上套路在同一视图共现时暴露模板味 |
| **SVG 矢量与图解缺陷** | 非图标大图缺少 `viewBox` 导致自适应裁切、同一坐标系内 `<text>` 重叠碰撞、`<defs>` 中堆满未引用的渐变和滤镜、用 `<radialGradient>` 画紫粉光晕背景 | 语言模型缺少真实像素坐标空间规划能力，常硬编码坐标或生成冗余定义 | XML 属性提取、同 `<g transform>` 作用域内文本坐标欧氏距离校验、`<defs>` ID 引用计数 |
| **光栅图片（PNG/JPEG/WebP）** | 工作流导出未剥离的 A1111 `parameters` 提示词或 ComfyUI 节点图 JSON；黑底紫粉霓虹大片色块；过度平滑的高饱和「塑料涂抹感」缺乏自然纹理微对比 | 生成管线默认把完整提示词与随机种子写进 `tEXt`/`XMP`；潜在空间扩散在未加相机噪点约束时倾向高饱和光滑表面 | PNG chunk / JPEG APP1-APP11 / WebP RIFF 块解析；8 位 PNG 扫描线解码采样与 4 邻域 L1 纹理梯度均值 |
| **PDF 演示页与平面海报** | 多页横版幻灯片全部输出为整页光栅图（零可选文字）；横版页塞入 140 词以上正文或将正文缩到 `< 9.5pt`（标题与正文倍率 `< 1.2x`）；连续 4 页及以上同骨架纯字；RGB 填充或渐变函数使用紫粉霓虹停靠点 | 自动生成 PPT/海报导出 PDF 时常把页面压平为图片，或在容器溢出时整体压低字号并套用单一列表页模板 | `/MediaBox` 横竖版判定、`/FlateDecode` 内容流解析（`Tf` 字号、`Tj`/`TJ` 文本、`rg`/`RG`/`C0`/`C1` 颜色、`/Do` 图像 XObject） |

必须补充一条合规与伦理边界：**清理图片工作流残留绝不等于剥除法定 AI 来源标识**。中国《人工智能生成合成内容标识办法》及 GB 45438-2025（2025 年 9 月 1 日施行）与欧盟 EU AI Act 第 50 条（2026 年 8 月 2 日适用）均要求对公众分发的合成图片与音视频保留显式或隐式标识。因此，检查器必须区分两类元数据：

1. **意外泄露的内部工作流参数（`warning`）**：如 `Negative prompt:`、`Steps:`、`CFG scale:` 或 ComfyUI `"class_type": "KSampler"` JSON，建议在公开交付前清理。
2. **合规来源标识（`info`）**：如 C2PA `caBX`/`JUMBF` 清单与 IPTC `trainedAlgorithmicMedia`，明确提示「依法保留法定标识，仅做视觉质感复核」。

---

## 3. 学术界与行业评估基准及四层可检边界

| 基准/平台 | 主导方 | 评测对象 | 核心方法 | 对工程工具的启示 |
|---|---|---|---|---|
| **UI-Bench** | 宾夕法尼亚大学 / AfterQuery | Text-to-App 工具（v0、Lovable 等） | 专业设计师盲评成对比较 + TrueSkill 排序 | 同一个底层模型在不同提示词工程与后处理护栏下，成品质感差距显著 |
| **Design Arena** | Arcada Labs | 多模型前端与可视化生成 | 众包盲投 Elo 排行榜 | 单靠模型自身难以稳定避开默认模板，需外部约束文件与检查环 |
| **Design2Code** | 学术开源基准 | 多模态截图转前端代码 | 视觉还原度 + DOM 结构评估 | 静态源码声明与最终渲染像素框之间存在差异，不能用静态正则硬替浏览态几何检查 |
| **UICrit** | 开源 UI 评审数据集 | MLLM 自动设计点评能力 | 人类设计师框选区域与可用性/美学评分 | 构图呼吸感、视觉焦点与情绪基调属于多模态模型擅长层，不宜强行写成静态硬规则 |

由此确立 `dislop` 在视觉与平面方向的**四层可检边界**：

1. **静态源码与矢量/二进制结构层（`dislop` 零依赖核心）**：覆盖 HTML/CSS/JSX 模板样式、SVG 结构与坐标系、PNG/JPEG/WebP 元数据与像素色域采样、PDF 页面流与版面结构。毫秒级离线运行，零外域请求。
2. **组合模式库层（`--patterns`）**：处理毛玻璃叠用、侧边粗彩条卡片与第二代「暖米白+陶土红」多信号共现。
3. **渲染态浏览器几何层（留给 `impeccable` 浏览器检查或可选 Playwright 插件）**：处理跨文件 CSS 级联覆盖、视口溢出与真实对比度计算，不放进零依赖核心包。
4. **视觉大模型审校层（P2 可选云端能力）**：处理整页构图重心、视觉层级与跨图风格统一，仅做 `info` 建议。

---

## 4. `dislop` 视觉检测升级与 `visual-design-v1` 基准实验

基于上述调研结论，我们在 `dislop` Node.js 与 Python 双端零依赖内核中新增并升级了 7 条活跃规则与 1 条 Gen-2 组合探针（规则总数由 42 增至 49，模式库由 53 增至 61，正式支持 `.pdf` 与 `.png`/`.jpg`/`.jpeg`/`.webp`）：

- **Web 模板防线补全**：`ui-glow-blob-chrome`（`blur-3xl` 光晕球、霓虹阴影、`animate-ping` 闪烁圆点、SVG 过度模糊滤镜）、`ui-emoji-icon-chrome`（UI 控件堆砌 3 个以上通用 Emoji）、`ui-template-card-grid`（3 组以上彩色图标方块、假三色窗口圆点、`01`/`02`/`03` 编号眉题）、扩展模式库 `ui-gen2-tasteful-slop`（Gen-2 伪人文四维多信号合取）。
- **SVG 图解结构检查**：扩展 `ui-ai-gradient` 解析 `<linearGradient>`/`<radialGradient>` 紫粉停靠点（修正了早期色相下界 `245°` 漏掉 Tailwind `indigo-500` `#6366f1` 色相 `238.7°` 的问题，统一调整为 `235°–345°`）；新增 `svg-layout-slop` 检查非图标大图缺失 `viewBox`、同 `<g transform>` 作用域内 `<text>` 坐标重叠碰撞与 `<defs>` 孤立定义。
- **零依赖图片检查（`image`）**：自研 PNG/JPEG/WebP 二进制解析器（基于标准库 `zlib`），实现 `image-ai-workflow-residue` 与 `image-ai-palette-slop`（8 位 PNG 解码后按最大 `160×160` 网格采样，结合 4 邻域 L1 像素梯度均值区分「光滑塑料涂抹」与「高频自然纹理」）。
- **零依赖 PDF 视觉/演示检查（`pdf`）**：明确聚焦**AI 演示文稿与视觉排版缺陷**（不做通用 PDF/X 印前检查），解析 `/FlateDecode` 流、`/MediaBox` 继承、`Tf` 字号、`rg`/`RG`/`C0`/`C1` 颜色与图像 XObject。竖版技术报告与单页封面自动豁免横版文字墙和连页单调规则；加密 PDF 诚实返回 `skipped`（退出码 `2`）。

在新建的 60 样本对抗评测集 [benchmarks/datasets/visual-design-v1.json](../../benchmarks/datasets/visual-design-v1.json) 上实测对比 4 组方案：

| 对照臂 | Precision | Recall | F1 | 困难负例误报率 (FPR) |
|---|---:|---:|---:|---:|
| `arm1_v071_baseline`（升级前基线） | 100.0% | 18.8% | 31.6% | 0.0% |
| `arm2_naive_regex`（无护栏单特征正则） | 55.2% | 50.0% | 52.5% | **46.4%** |
| `arm3_dislop_core`（升级后核心 + `deck-and-ui`） | **100.0%** | 93.8% | 96.8% | **0.0%** |
| `arm4_dislop_full_patterns`（核心 + `--patterns`） | **100.0%** | **100.0%** | **100.0%** | **0.0%** |

实验还同步验证了仓内全部 9 张真实生产 PNG 图片（`assets/og-card.png` 与 8 张演示海报）在阈值消融网格上全部保持 **0 误报**，Node.js 与 Python 双端在 60 份样本上达到 **100.0% 检出一致率**（全量耗时 Node `120.29 ms`、Python `257.62 ms`）。完整分模态数据与像素消融记录见 [benchmarks/VISUAL-BENCHMARK.md](../../benchmarks/VISUAL-BENCHMARK.md)。

### 补充实验：渲染态 VLM 三臂对比（`visual-vlm-v1`）

我们在 16 份真实渲染截图（Playwright Chromium + `pdftoppm`，含 3 份静态规则故意保持 0 命中的纯排版盲区样本与 8 份极简/单栏/报告困难负例）上进一步实测对比了「纯静态规则（`Arm A`）」「裸 VLM 提示（`Arm B`）」「分维量表 + Gen-2 校准 + 静态信号（`Arm C`）」。结果显示：仅靠 `Arm B` 裸问模型时，`gemini-3.1-flash-lite` 与 `gemini-3.5-flash` 均在两轮中稳定漏掉暖米白二阶模板页（分别打 `10` 与 `32` 分）和空洞三栏模板幻灯片（F1 分别为 `76.9%` 与 `85.7%`）；接入 `Arm C` 后，`gemini-3.1-flash-lite` F1 升至 `96.8%`（盲区召回 `83.3%`），`gemini-3.5-flash` F1 达到 `100.0%`（盲区召回 `100.0%`，两轮分差 `MAD=0.75`，困难负例 `0.0%` 误报）。这也确认了 `dislop` 的工程分工：**本地静态核心 2ms 清掉硬伤和可定量结构缺陷，关键成品再将渲染图与静态指标一并交给带量表的视觉审校**。
