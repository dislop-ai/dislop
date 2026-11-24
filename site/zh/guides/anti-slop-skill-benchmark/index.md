---
content-type: reference-data
lang: zh
updated: 2026-11-24
version: 0.9.1
---

# 4 款去 AI 味 Skill 跑 30 份真实稿件的实测记录（2026 基准）

> 先交代口径偏置：第 2 节通过率由 dislop 自身规则打分。从原始输出字符串看，4 款独立 Skill 在 HTML 任务上全部留下了 href="#" 空链接，stop-slop 在 .pptx XML 里留下了裸 **Summary**: 与 62.5% 缩字参数，3 款原样退回了三分号旧推销句。接入一道 dislop 复检后，英文一次过检率提升 +13.3 个百分点，中文提升 +20.0 个百分点，6 份干净人工对照稿零误伤。

`2026-11-23`，我们拉取公开仓 `blader/humanizer`（commit `a32f244073`）、`hardikpandya/stop-slop`（`8da1f03018`）、`op7418/Humanizer-zh`（`f4518a8eab`）与 `larashero3-dotcom/lieflat-less-ai-tone`（`fe77df00a2`）的完整 `SKILL.md`，在同一模型（`gemini-3.5-flash`，总花费 `$0.18886`，`0` 次长度截断）上实跑 `30` 份修改与保真对照任务。

先说明评分偏置：第 2 节表格里的「一次全部通过率」由 `dislop` 自身的确定性规则包打分，天然贴合 `dislop` 的检查口径。因此建议优先核对第 3 节不依赖任何打分器的原始字符串事实。

## 1. 测试方法与样本构成

`30` 个任务取自 `dislop` 公开测试集 `revision-v1.json`、`revision-hard-v2.json` 与 `skill-revision-ext-v1.json`（英文 `15` 份、中文 `15` 份）：

1. **工作文档与随笔**：技术公告、上线说明、故障复盘、随笔和首页文案，外加 `6` 份干净人工对照稿（`preserve`，中英文各 `3` 份）用来测是否过度改写。
2. **办公 XML 文档**：拆分成跨 Run XML 节点的 Word 文档（`word/document.xml`）和含溢出风险的 PowerPoint 幻灯片（`.pptx`）。
3. **网页组件**：带有多层边框、模板徽章和 `href="#"` 空链接的 AI 生成 HTML 卡片。

每款外部工具都在相同任务提示词下对比两档：单独加载其 `SKILL.md` 跑一遍；以及保留它第一遍生成的原输出，经离线 `dislop` 检查标出命中规则和丢失的数字或限定词后再做一轮定向修补。全部 `180` 条评分记录已由 Node（`node scripts/run_ecosystem_benchmark.mjs --rescore-saved`）与 Python（`python3 benchmarks/verify_ecosystem_numbers.py`）离线复算一致。

## 2. 中英文 30 份样本实测数据

### 中文测试集（`15` 份）

| 测试组 | 无硬破绽拦截率 | 一次全部通过率 | 综合分 | 事实保留率 | 事实漂移样本数 | 硬伤数 | 套话与结构命中数 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 原稿基线 | 13/15 (86.7%) | 3/15 (20.0%) | 74.2 | 100.0% | 0 | 5 | 33 |
| 单用 `op7418/Humanizer-zh` | 13/15 (86.7%) | 7/15 (46.7%) | 89.1 | 100.0% | 0 | 1 | 11 |
| `Humanizer-zh` + `dislop` 复检 | 13/15 (86.7%) | 10/15 (66.7%) | 94.9 | **100.0%** | **0** | **0** | 3 |
| 单用 `larashero3-dotcom/lieflat` | 13/15 (86.7%) | 6/15 (40.0%) | 82.8 | 93.3% | 1 | 1 | 12 |
| `lieflat` + `dislop` 复检 | **14/15 (93.3%)** | 9/15 (60.0%) | 95.8 | **100.0%** | **0** | **0** | 3 |
| `dislop` Skill + CLI 闭环 | **14/15 (93.3%)** | **13/15 (86.7%)** | **97.1** | **100.0%** | **0** | **0** | **2** |

### 英文测试集（`15` 份）

| 测试组 | 无硬破绽拦截率 | 一次全部通过率 | 综合分 | 事实保留率 | 事实漂移样本数 | 硬伤数 | 套话与结构命中数 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 原稿基线 | 13/15 (86.7%) | 3/15 (20.0%) | 75.5 | 100.0% | 0 | 5 | 29 |
| 单用 `blader/humanizer` | 14/15 (93.3%) | 12/15 (80.0%) | 94.3 | 100.0% | 0 | 1 | 6 |
| `humanizer` + `dislop` 复检 | 14/15 (93.3%) | **14/15 (93.3%)** | 97.3 | **100.0%** | **0** | **0** | 2 |
| 单用 `hardikpandya/stop-slop` | **15/15 (100.0%)** | 11/15 (73.3%) | 94.9 | 100.0% | 0 | 2 | 3 |
| `stop-slop` + `dislop` 复检 | **15/15 (100.0%)** | 13/15 (86.7%) | **99.5** | **100.0%** | **0** | **0** | **0** |
| `dislop` Skill + CLI 闭环 | 14/15 (93.3%) | **14/15 (93.3%)** | 97.3 | **100.0%** | **0** | **0** | 2 |

中英文共 `6` 份干净人工对照稿在全部测试组上均保持 `0/6` 过度改写失误。

## 3. 从原始输出核实的四类漏检事实

1. **网页空链接与幻灯片 XML 残留直接漏出**：`4` 款独立改写 Skill 在 HTML 任务上全部原样保留了 `href="#"` 空按钮；在幻灯片 XML 上，`stop-slop` 留下了未渲染的 `**Summary**:` 符号和 `62.5%` 缩字参数。接入 `dislop` 复检后，所有组别的 `core` 硬伤清零。

```html
<div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
  <span class="badge">AI 驱动</span>
  <h2>1.2 秒查完 48 份演示文稿</h2>
  <a href="#">下载完整报告</a>
</div>
```

2. **三分号排比与金句收尾绕过了禁词表**：在取自 `dislop` 早期淘汰首页文案的测试样本上，`humanizer`、`Humanizer-zh` 与 `lieflat` 均原字不动退回（`3/4` 款）。

```text
硬伤红笔划掉；套话打个问号；你改完之后，我们再把所有文件重查一遍。它绝不代笔。笔一直在你手里。
```

3. **极端压缩把整段中文技术规范压成了空串**：在 `rev-zh-03-tech-spec` 上，单用 `lieflat` 输出 `0` 字符空串（`8000 QPS` 指标全部丢失，得分 `0`），经 `dislop` 检出后修补恢复至 `90` 分。
4. **验证器自纠记录（`v0.8.2` -> `v0.8.3`）**：首轮 `v0.8.2` 对英文同义边界改写报过 `3` 次误判（例如 `inside 5 seconds` 改为 `within 5 seconds`、`3600 seconds` 改为 `3600-second`、`40 million rows` 合并重复条目）。`v0.8.3` 补齐词法归一与去重后，英文全部组别事实漂移降至 `0`。

## 4. 稳妥的组合用法与口径局限

`Humanizer-zh`、`lieflat`、`humanizer` 和 `stop-slop` 适合做第一遍顺文字，不需要二选一替换。在前面保留你顺手的改写 Skill，交付前加一道本地离线检查与核对即可：

```bash
# 本地离线检查 Markdown、HTML/JSX/SVG、Word 与 PPT（零上传）
npx --yes dislop check . --pack auto --lang zh --format agent

# 改完对照 git HEAD 核对数字和限定词有没有丢失
npx --yes dislop verify --git HEAD draft.md --strict
```

**口径与局限**：本轮测试覆盖单模型（`gemini-3.5-flash`）的 `30` 份样本，按单语 `15` 份计算时 95% 威尔逊置信区间较宽（如 `14/15 = 93.3%` 对应 `[70.2%, 98.8%]`）；外部 `SKILL.md` 均按 `2026-11-23` 公开原版未改提示词实测。完整原始记录见 [ECOSYSTEM-BENCHMARK.zh-CN.md](https://github.com/dislop-ai/dislop/blob/main/benchmarks/ECOSYSTEM-BENCHMARK.zh-CN.md)。

## 常见问题

### 为什么只装写作类去味 Skill，还是会漏掉网页死按钮和 PPT 裸星号？

纯文字 Skill 的指令集中在散文用词和语气上，Agent 修改 HTML 属性或 Office Open XML 时很少主动排查 href="#" 空链接、三层套盒边框或幻灯片里的 **Summary**: 符号。

### 在 Humanizer-zh 后面再挂一道 dislop，会不会把原本写得好的人话改坏或改丢数字？

30 份测试稿与 6 份干净人工对照稿的实测中，所有配对组在人工对照稿上均为 0 误伤，英文组事实漂移为 0。

### 这组数据如何在本地复现验证？

在仓库根目录运行 node scripts/run_ecosystem_benchmark.mjs --rescore-saved 与 python3 benchmarks/verify_ecosystem_numbers.py，可离线复算全部 180 条评分记录。

## 参考出处

- [blader/humanizer (Agent Skill based on WP:AISIGNS)](https://github.com/blader/humanizer): 71,724 stars (2026-11-21 snapshot); translates Wikipedia's Signs of AI Writing into an agent editing skill with voice sample calibration.
- [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop): 19,097 stars (2026-11-21 snapshot); separates banned phrases, structural patterns, and before/after examples with a five-axis rubric.
- [op7418/Humanizer-zh: 中文去 AI 味写作技能](https://github.com/op7418/Humanizer-zh): 23,450 星标（2026-11-21 快照）；针对中文写作里的套话、公文腔与翻译腔整理对照清单，适合作为写作前提示参考。
- [vale-cli/vale: Syntax-aware linter for prose](https://github.com/vale-cli/vale): 6,413 stars (2026-11-21 snapshot); deterministic prose linter for Markdown, HTML, and AsciiDoc built around configurable YAML style rules.
- [Artificial Hivemind: The Open-Ended Homogeneity of Language Models (and Beyond) (NeurIPS 2025)](https://arxiv.org/abs/2510.22954): Using the Infinity-Chat dataset, demonstrated both intra-model repetition and inter-model homogeneity across different LLM families.
- [GEO: Generative Engine Optimization (Aggarwal et al., ACM KDD 2024)](https://arxiv.org/abs/2311.09735): Adding verifiable statistics, primary quotations, and clear inline citations raised generative-engine visibility by up to 40%, while keyword stuffing hurt.
