# Research & Proposals Index (`2026-11`)

本目录保存围绕 `dislop` 开展的一手生态调研、数据快照与远期设计草案。对外最新口径请直接看：

- 品牌人格与表达基准：[brand-and-voice-guide.zh-CN.md](../brand-and-voice-guide.zh-CN.md)（[English](../brand-and-voice-guide.md)）
- 路线图与协作计划：[ROADMAP.zh-CN.md](../../ROADMAP.zh-CN.md)（[English](../../ROADMAP.md)）
- 90 条工具清单：[awesome/README.zh-CN.md](../../awesome/README.zh-CN.md)（[English](../../awesome/README.md) · 在线筛选 `https://dislop.com/awesome/`）

> 所有 GitHub 星标、最近推送日期与链接状态均于 **2026-11-21** 通过 GitHub API 与 HTTP 请求核验；SEO / GEO 内容资料库于 **2026-11-23** 核验补齐。本目录全部 Markdown 文档均需通过 Node 与 Python 双端 `dislop check docs/research --fail-on info` 零命中自审。

## 文档索引（区分现状、提案与历史资料）

| 文档 | 状态 | 内容说明 |
|---|---|---|
| [anti-slop-radar-index.json](./anti-slop-radar-index.json) | **现役数据 (`dislop.radar/2`)** | 90 条工具清单的单一 JSON 数据源（含中英双语摘要），直接编译生成 `awesome/README*.md` 与 `dislop.com/awesome/` |
| [content-kb/sources.json](./content-kb/sources.json) | **现役数据 (`dislop.kb/1`)** | 55 条跨 7 个主题域的一手行业知识与实证出处索引（写作计量学、编辑规范、PR 治理、UI/PPT、SEO/GEO、中文去味、开源增长），支撑双语指南与规则引用 |
| [content-kb/seo-geo-content-report.zh-CN.md](./content-kb/seo-geo-content-report.zh-CN.md) | **内容战略与 SEO/GEO 研报** | 官网检索短板诊断、7 域知识综合结论（含 `llms.txt` 反证校准）、`PRODUCT.md` 三层承接矩阵与零负担内容运维规范 |
| [open-source-star-growth-strategy-2026.zh-CN.md](./open-source-star-growth-strategy-2026.zh-CN.md) | **冷启动与加星策略研报** | 基于 GitHub/YouTube/X/HN 一手实证的 `0 -> 100 -> 500 -> 2,000` 星增长策略、Trending 机制分析与四支柱防踩坑指南 |
| [business-model-and-open-core.zh-CN.md](./business-model-and-open-core.zh-CN.md) | **战略设计基线** | 复利护城河飞轮（对抗基准 + 6 维标准 + 垂直包 + 成本套利自愈云 + 防改坏评估云）、9 款竞品定价对标、三层信任边界与 Google Cloud / Gemini 成本防刷账 |
| [agent-repair-boundaries-eval-and-dehedging.zh-CN.md](./agent-repair-boundaries-eval-and-dehedging.zh-CN.md) | **战略与工程研究** | 面向 Agent 的 L0–L3 修复安全分级（Ruff/Biome/Markup AI 参照）、写作净增益评估与防改坏验收云、“不粘锅后训练”去对冲边界及四级个人文风选型 |
| [grammarly-evolution-and-agent-lessons.zh-CN.md](./grammarly-evolution-and-agent-lessons.zh-CN.md) | **竞品复盘与战略输入** | Grammarly 17 年四阶段演进（2007–2026）、AI Agent 化与更名 Superhuman 实证、`Expert Review` 集体诉讼等 5 大教训，及对 `dislop` 的错位卡位与 6 条借鉴；配套 [grammarly-intel/dossier.zh-CN.md](./grammarly-intel/dossier.zh-CN.md)、10 款产品深拆 [grammarly-intel/product-deep-dives.zh-CN.md](./grammarly-intel/product-deep-dives.zh-CN.md)、五层系统借鉴 [grammarly-intel/five-layer-takeaways-for-dislop.zh-CN.md](./grammarly-intel/five-layer-takeaways-for-dislop.zh-CN.md) 与 34 条情报索引 [grammarly-intel/sources.json](./grammarly-intel/sources.json) |
| [text-antislop-integrated-methodology.zh-CN.md](./text-antislop-integrated-methodology.zh-CN.md) | **历史实证基线（`v0.6`，现已扩至 53 规则）** | 六个文字去 AI 味分析角度、六种离线技术范式对照实验与 7 包 42 规则基线 + 5 轴画像整合架构 |
| [ai-slop-pattern-library-5-rounds.zh-CN.md](./ai-slop-pattern-library-5-rounds.zh-CN.md) | **历史实证基线（`v0.6`，现已扩至 65 模式）** | 6 维度 7 角度反模式库组织架构、5 轮闭环迭代消融记录与 `v0.6.0` 53 模式（154 样本 `100.0%` F1 / `0.0%` 误报）的校准结果 |
| [ai-tic-taxonomy-and-cross-check.zh-CN.md](./ai-tic-taxonomy-and-cross-check.zh-CN.md) | **已落地方法论** | 五层 AI 口癖分类（`ai-tic-rubric.json`）与跨层交叉核对规则，支撑规则库扩充与多维检测 |
| [skill-optimization-5-rounds.zh-CN.md](./skill-optimization-5-rounds.zh-CN.md) | **已落地实证与实验** | 纯文档 Skill 与 8 张中英文分类参考卡的 5 轮对照评测（Routing F1 100.0%、卡准确率 100.0%、零误改干净原稿） |
| [cli-model-bundling-and-tiering.zh-CN.md](./cli-model-bundling-and-tiering.zh-CN.md) | **已落地实证与架构** | CLI 随包内置 `14.6 KB` 去词面化传统集成模型 vs. 按需选装 `0.6B–4B` 本地小模型的六范式盲测对比、体积实测与内部数字保真护栏 |
| [cli-positioning-optimization.zh-CN.md](./cli-positioning-optimization.zh-CN.md) | **已落地实证与实验** | 双端 CLI 严格解析、`--register` 场景策略、`--format agent`、BYOK `dislop review` 与 `dislop doctor` 的调研和 4 轮实测 |
| [universal-adaptation-and-marketplace-strategy.zh-CN.md](./universal-adaptation-and-marketplace-strategy.zh-CN.md) | **战略与工程规划基线** | 主流 Agent 客户端、编辑器（VS Code / Open VSX / Obsidian）、多 Agent 编排器（Orca / Herdr / Conductor）的统一薄壳适配、`/llms.txt` 静态契约与插件市场获客漏斗 |
| [anti-slop-landscape-2026.zh-CN.md](./anti-slop-landscape-2026.zh-CN.md) | **一手调研** | 2026 年跨媒介（文稿、网页、办公文档、代码、多模态）开源工具与社区治理全景盘点 |
| [visual-ui-design-antislop-2026.zh-CN.md](./visual-ui-design-antislop-2026.zh-CN.md) | **一手调研 / 已落地实证** | 视觉、Web UI、SVG、图片与 PDF 去 AI 味热门项目实测拆解、三代演化图谱及 `visual-design-v1` 四臂基准对照 |
| [anti-pattern-detection-and-catalog.zh-CN.md](./anti-pattern-detection-and-catalog.zh-CN.md) | **一手调研 / 已落地输入** | 语言节奏、主流模型家族实证对照、三层界面反模式可检边界与分层识别漏斗 |
| [x-animation-and-gif-tooling-2026.zh-CN.md](./x-animation-and-gif-tooling-2026.zh-CN.md) | **一手调研 / 已落地选型** | X 热门动画库与动效工具实测盘点（33 仓库星标/协议核验）及 `dislop` 确定性动画出图技术底座 |
| [gif-encoding-experiments-2026.zh-CN.md](./gif-encoding-experiments-2026.zh-CN.md) | **已落地实证与实验** | 7 条动画编码管线（无抖动 GIF、Bayer/Sierra 抖动、2× 超采样、无损/有损 WebP、H.264 MP4）在体积、PSNR 与白纸纯净度上的对照实测 |
| [visual-assets-dogfood-audit-2026.zh-CN.md](./visual-assets-dogfood-audit-2026.zh-CN.md) | **已落地实证与门禁** | 原生 GIF LZW 检查补齐与品牌横幅 / OG 卡片 / 6 组双语演示动画的三层狗粮自检（静态 `deck-and-ui` + SVG `getBBox()` + Gemini 3.5 Flash 对比） |
| [positive-divergence-and-personalization.zh-CN.md](./positive-divergence-and-personalization.zh-CN.md) | **远期提案** | 防均值回归与个性化声纹研究，配套 [positive-divergence/](./positive-divergence/) 草案 JSON 与 31 处公开设计参考源 |
| [awesome-anti-slop-topology-design.zh-CN.md](./awesome-anti-slop-topology-design.zh-CN.md) | **暂缓拆仓预案** | 8 组开源先例复盘与 `dislop.radar/3` 拆仓契约（[awesome-anti-slop-topology/](./awesome-anti-slop-topology/)）；现阶段清单留在主仓，仅当条目 `>= 150` 或月均有效外部 PR `>= 20 条`时再按需启用 |

## 维护说明

- 增删工具清单条目时，编辑 [anti-slop-radar-index.json](./anti-slop-radar-index.json)（同时填写中文 `summary` 与英文 `summaryEn`），然后运行 `node scripts/build_site.mjs` 同步 `awesome/README*.md`、`site/awesome/` 与 `/llms.txt`。
- [grammarly-intel/](./grammarly-intel/) 等竞品情报目录定位为静态历史快照（`snapshot-only`），不接入 `build_site.mjs`、`sync_manifests.mjs` 与每周外链巡检脚本，按需手动更新，不构成主项目日常维护负担。
- 修改本目录任意文档后，运行 `node ./bin/dislop.mjs check docs/research --fail-on info` 与 `PYTHONPATH=src python3 -m dislop.cli check docs/research --fail-on info` 确认零命中。
