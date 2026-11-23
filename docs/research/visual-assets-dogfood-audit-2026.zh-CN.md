# `dislop` 图像与动画素材狗粮自检报告（`2026-11`）

`dislop` 不只检查 Markdown 和 HTML 文本。仓库自身交付的 `assets/` 品牌横幅、社交预览卡片（OG PNG）、6 组双语演示 GIF/WebP/Poster，以及生成这些动画的 HTML 场景模板，同样要用自身规则集和像素度量先扫一遍再发版。本次实测在原有 PNG/JPEG/WebP 基础上补齐了原生零依赖 GIF 解析，并搭起三层狗粮自检闭环，先测出基线硬伤与版式毛病，再逐项返工、重出图并复验到全项通过。

## 1. 检查覆盖与三层狗粮闭环

三层流水线由 [audit_visual_assets.mjs](../../scripts/media/audit_visual_assets.mjs) 统一驱动，离线检查写入 `npm run media:audit` 与 `npm run dogfood` 门禁，联网多模态打分按需显式加 `--vlm` 触发：

| 层级 | 检验引擎 | 覆盖范围 | 离线 / 确定性 | 拦截标准 |
|---|---|---|---|---|
| 第 1 层（产物与源码） | `dislop` Node + Python 双端 CLI（`deck-and-ui` + `--patterns`） | `assets/` 下全部 61 个 SVG/PNG/WebP/GIF 文件 + 10 份虚拟时钟动画 HTML | 纯离线，100% 确定性 | 命中条数 `> 0` 或 Node/Python 结论不一致即失败 |
| 第 2 层（SVG 几何实测） | Playwright Chromium DOM `getBBox()` 探针 | 4 张 README 横幅 SVG + 2 张 OG 卡片 SVG | 纯离线，同机字体精确度量 | 圆角超 `4px`、中文字样先写黑体再写宋体、红蓝批注外溢超 `14px`、同基线短语意外断距超 `20px` 或卡片文字越界 |
| 第 3 层（多模态视觉审校） | 校准提示词 + 静态摘要的 Gemini 3.5 Flash（`Arm C`） | 6 张渲染 SVG、2 张 OG PNG、12 张关键帧海报、12 张量化 GIF 终态帧（共 32 张） | 按需 `--vlm` 触发（`DISLOP_TEST_MODE=1` 硬熔断） | 任一图像 `visualSlopScore >= 40` 即失败 |

为了让多端对 `.gif` 的检查落到字节级一致，[core.mjs](../../src/core.mjs)、[binary-node.mjs](../../src/binary-node.mjs) 与 [engine.py](../../src/dislop/engine.py) 新增了零外部依赖的 GIF87a/GIF89a 首帧 LZW 解码与采样像素指标提取（逻辑屏幕宽高、帧数、局部调色板与颜色量化数），并在 `assets/demos/*-v2.gif` 全部 12 个真实动图与 `tests/test_engine.py` 合成用例上对齐了 Node 与 Python 的逐字段输出。

## 2. 整改前 vs. 整改后实测数据对比

下表汇总离线与联网 `gemini-3.5-flash`（`--threshold 40`）两次全量跑测结果（`Before` 快照与最新落盘报告 [visual-dogfood-audit-latest.json](../../benchmarks/results/visual-dogfood-audit-latest.json) 逐项对应）：

| 指标项 | 整改前（Before） | 整改后（After） | 变化结论 |
|---|---|---|---|
| 第 1 层 `assets/` 静态自检（61 文件） | `0` 命中 · Node/Python `100%` 一致 | `0` 命中 · Node/Python `100%` 一致 | 全量包含 14 个 `.gif` 后保持零命中 |
| 第 1 层动画场景 HTML（10 份） | `11` 处命中（`proof-cycle`、`ui-slop`） | `0` 处命中 | 仅隔离负例演示块，外壳与正例清零 |
| 第 2 层 SVG `getBBox()` 几何/排版缺陷（6 张） | `11` 处缺陷 | `0` 处缺陷 | 宋体序列、直角底盒、`tspan` 坐标全对齐 |
| 第 3 层 VLM 均值分（32 张） | `33.22` | `32.44` | 平均视觉 AI 味进一步压低 |
| 第 3 层 VLM 最高分与超线项（`>= 40`） | 最高 `42` · **3 张超线** | 最高 `38` · **0 张超线** | 全部 32 张图通过 `< 40` 门禁 |

几张关键改动资产的 `gemini-3.5-flash` 单项分值变化如下：

| 资产文件 | 整改前得分 | 整改后得分 | 本轮主要改动 |
|---|---|---|---|
| `assets/banner-light.svg` | `42`（超线） | `32`（通过） | `<tspan>` 自然流拼接英文句子；蓝虚线终点由 `1014` 收回到测宽后的 `998` |
| `assets/og-card-zh.svg` | `42`（超线） | `32`（通过） | 字样改回宋体优先；例句外框由 `rx="8"` 改为 `rx="0"`；红笔曲线收窄至 `114..688` |
| `assets/banner-zh-light.svg` | `38` | `28`（通过） | 中文字样改为 `'Songti SC', 'Noto Serif CJK SC', 'STSong', Georgia, serif` 并合并同行短语 |
| `assets/og-card.png` | `34` | `32`（通过） | 重构 `og-card.svg` 两段 `<tspan>` 精准下划线后经 Chromium + Pillow `96` 色重绘输出（`20.5 KB`） |
| `assets/demos/proof-cycle-zh-v2-poster.png` | `42`（超线） | `38`（通过） | `.pen-svg` 去掉 `left: -3px` 与 `.mark-err` 左右内边距；调窄左右留白避免标点孤立换行 |
| `assets/demos/deck-office-zh-v2-poster.png` | `38` | `32`（通过） | 去掉双层蓝色虚线套盒，改为 `1px` 淡灰边框加 `3px` 左侧色条与 `2px` 徽章倒角 |
| `assets/demos/agent-workflow-en-v2-poster.png` | `32` | `28`（通过） | 非当前步骤终端卡片透明度由 `0.25` 提到 `0.65`，解决暗色底片文字过暗难读问题 |

## 3. 具体查出的三类病灶与修法

第一类是离线 SVG 坐标猜字宽引发的线框漂移。先前横幅与社交卡片里，`banner-light.svg` 的蓝线右端多出 `17px`，`og-card.svg` 的第二个短语下划线左端起笔偏后 `19px`。同时 `og-card-zh.svg` 例句盒遗留了 `rx="8"` 圆角，字体栈把 `PingFang SC` 排在 `Songti SC` 前面也导致例句落成黑体。现在改用同组 `<text><tspan>` 让同一行文字自然排版，再由 [render_brand_assets.py](../../scripts/media/render_brand_assets.py) 调用 Chromium `--measure` 输出实测包围盒回填坐标，最后重生成 `og-card.png`（`20.5 KB`）和 `og-card-zh.png`（`26.3 KB`）。

第二类是动图 HTML 自审时工具外壳与正反例界线不清。`proof-cycle` 和 `ui-slop` 需要同屏展示“AI 寒暄硬伤”“默认紫粉渐变”“AI 强力驱动装饰牌”这些反例。原先反例代码直接裸露在页面模板中，甚至右侧规则说明卡片 `ui-slop-zh-v2` 也原样引用了被禁词条本身，导致页面自检误伤。排查后，我们在 [render_gifs.py](../../scripts/media/render_gifs.py) 中只用 `<!-- dislop-quote-start/end -->` 与 CSS 注释块隔离专门演示“坏样本”的切片区域，同时改写规则卡片提示语为不回显原词的表述，工具外壳与修复态（`ms-2`、`.good-layer`）继续全量接受 `deck-and-ui` + `--patterns` 硬扫描并在双语下均达到 `0` 命中。

第三类是 VLM 在实拍海报与暗色 GIF 上抓出的排印瑕疵。静态规则拿“语义上没错但视觉看着别扭”的局部细节没有办法。例如 `proof-cycle-zh-v2-poster.png` 里红色删除线 SVG 因 `.pen-svg` 设置 `left: -3px; width: calc(100% + 6px)` 外溢汉字边界，且引导词末尾标点在第一行尾部孤立折行；`deck-office` 的蓝色嵌套虚线框显得多余；`agent-workflow` 未激活面板透明度 `0.25` 导致暗底次要命令行偏灰难读。三项均在同一轮改完重出图，8 组改动动画与 `site/` 已全量重编并走过体积预算与帧校验门禁。

## 4. 边界说明与可复现命令

静态层加 SVG 几何层离线即可拦截字体回退、圆角越界、坐标溢出和正例自污染，但不代替人眼与多模态模型对排版留白、对比度和 GIF 调色板噪点的综合把关。因此日常 `npm run dogfood` 与 `npm run media:audit` 保留第 1、2 层离线门禁以维持零网络、毫秒级稳定性；发版或大幅调整品牌图与动画模板时，建议显式补跑一次联网第 3 层复验：

```bash
# 离线全量狗粮闭环（assets 双端校验 + 演示 HTML 模板 + SVG getBBox）
npm run media:audit

# 联网补充多模态视觉评分（按需注入 GEMINI_API_KEY，不落仓、不进测试）
~/.local/bin/with-api --keys GEMINI_API_KEY -- node scripts/media/audit_visual_assets.mjs --vlm --model gemini-3.5-flash --assert
```
