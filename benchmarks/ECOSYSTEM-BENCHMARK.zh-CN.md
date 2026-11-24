# 去味之后，漏掉了什么？真装 4 款去 AI 味 Skill 跑 30 份真实稿件的实测记录

`2026-11-23`，我们拉取公开仓 `blader/humanizer`（commit `a32f244073`）、`hardikpandya/stop-slop`（`8da1f03018`）、`op7418/Humanizer-zh`（`f4518a8eab`）与 `larashero3-dotcom/lieflat-less-ai-tone`（`fe77df00a2`）的完整 `SKILL.md`，在同一模型（`gemini-3.5-flash`，总花费 `` `$0.18886` ``，`0` 次长度截断，原始输出见 `benchmarks/results/ecosystem-benchmark-raw.json`）上实跑 `30` 份修改与保真对照任务。

先交代评分口径偏置：第 2 节表格里的「一次全部通过率」由 `dislop` 自身的确定性规则包打分，天然对 `dislop` 有主场优势。建议先看第 3 节不依赖打分器的四类原始字符串事实：4 款独立改写 Skill 在 HTML 任务上全部保留了 `href="#"` 空链接，`stop-slop` 在 `.pptx` XML 里留下了未渲染的 `**Summary**:` 符号，其中 3 款把我们自己旧版的三分号首页推销句原封不动退了回来，`lieflat` 在 1 份技术规范上返回了 `0` 字符空串。在每款 Skill 的第一遍输出后接一道 `dislop` 确定性复检，英文一次过检率提升 `+13.3` 个百分点，中文提升 `+20.0` 个百分点，`6` 份干净人工对照稿零误伤。

## 1. 测试方法与样本构成

`30` 个任务取自 `dislop` 公开测试集 `revision-v1.json`、`revision-hard-v2.json` 与 `skill-revision-ext-v1.json`（英文 `15` 份、中文 `15` 份）：

1. 技术公告、上线说明、故障复盘、随笔和首页文案，外加 `6` 份专门用来测是否过度改写的干净人工对照稿。
2. 拆分成跨 Run XML 节点的 Word 文档（`.docx`）和含排版溢出风险的 PowerPoint 幻灯片（`.pptx`）。
3. 带有多层边框、模板徽章和 `href="#"` 空链接的 AI 生成网页组件（`.html`）。

每个外部项目都在相同任务提示词下对比两档：单独加载其 `SKILL.md` 跑一遍；以及保留它第一遍生成的原输出，经离线 `dislop` 检查标出命中规则和丢失的数字/限定词（不暴露任何隐藏测试断言）后再做一次定向修补。全部 `180` 条评分记录已由 Node 离线复算（`node scripts/run_ecosystem_benchmark.mjs --rescore-saved`）与独立 Python 校验脚本（`python3 benchmarks/verify_ecosystem_numbers.py`）交叉核对，数字逐项一致。

## 2. 中英文 30 份样本实测数据

### 中文测试集（`15` 份）

| 测试组 | 无硬破绽拦截率 | 一次全部通过率 | 综合分 | 事实保留率 | 事实漂移样本数 | 硬伤数 | 套话与结构命中数 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 原稿基线（`zh::raw_source`） | 13/15 (86.7%) | 3/15 (20.0%) | 74.2 | 100.0% | 0 | 5 | 33 |
| 单用 `op7418/Humanizer-zh` | 13/15 (86.7%) | 7/15 (46.7%) | 89.1 | 100.0% | 0 | 1 | 11 |
| `Humanizer-zh` + `dislop` 复检 | 13/15 (86.7%) | 10/15 (66.7%) | 94.9 | **100.0%** | **0** | **0** | 3 |
| 单用 `larashero3-dotcom/lieflat` | 13/15 (86.7%) | 6/15 (40.0%) | 82.8 | 93.3% | 1 | 1 | 12 |
| `lieflat` + `dislop` 复检 | **14/15 (93.3%)** | 9/15 (60.0%) | 95.8 | **100.0%** | **0** | **0** | 3 |
| `dislop` Skill + CLI 闭环 | **14/15 (93.3%)** | **13/15 (86.7%)** | **97.1** | **100.0%** | **0** | **0** | **2** |

### 英文测试集（`15` 份）

| 测试组 | 无硬破绽拦截率 | 一次全部通过率 | 综合分 | 事实保留率 | 事实漂移样本数 | 硬伤数 | 套话与结构命中数 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 原稿基线（`en::raw_source`） | 13/15 (86.7%) | 3/15 (20.0%) | 75.5 | 100.0% | 0 | 5 | 29 |
| 单用 `blader/humanizer` | 14/15 (93.3%) | 12/15 (80.0%) | 94.3 | 100.0% | 0 | 1 | 6 |
| `humanizer` + `dislop` 复检 | 14/15 (93.3%) | **14/15 (93.3%)** | 97.3 | **100.0%** | **0** | **0** | 2 |
| 单用 `hardikpandya/stop-slop` | **15/15 (100.0%)** | 11/15 (73.3%) | 94.9 | 100.0% | 0 | 2 | 3 |
| `stop-slop` + `dislop` 复检 | **15/15 (100.0%)** | 13/15 (86.7%) | **99.5** | **100.0%** | **0** | **0** | **0** |
| `dislop` Skill + CLI 闭环 | 14/15 (93.3%) | **14/15 (93.3%)** | 97.3 | **100.0%** | **0** | **0** | 2 |

中英文共 `6` 份干净人工对照稿在全部测试组上均保持 `0/6` 过度改写失误。

## 3. 从原始输出里核实的四类具体记录

1. **网页空链接与幻灯片残留直接漏出**：在前端落地页样本 `rev-ui-01-zh-landing-card` 上，`Humanizer-zh` 与 `lieflat` 单跑都原样保留了紫粉渐变、AI 驱动徽章和 `href="#"` 空按钮；英文 `rev-pptx-02-en-exec-slide` 上，`stop-slop` 在幻灯片 XML 里留下了裸 `**Summary**:` 符号和 `62.5%` 缩字参数。接入 `dislop` 复检后，所有组别的 `core` 硬伤全部清零。

```html
<div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
  <span class="badge">AI 驱动</span>
  <h2>1.2 秒查完 48 份演示文稿</h2>
  <a href="#">下载完整报告</a>
</div>
```

2. **三分号排比与金句收尾绕过了禁词表**：`rev-zh-02-homepage-pitch` 取自 `dislop` 自己早期改掉的一段首页旧文案。因为里面没有传统高频套词，`Humanizer-zh` 与 `lieflat` 都一字未改直接放行（英文版的 `humanizer` 同样一字未改放行）：

```text
硬伤红笔划掉；套话打个问号；你改完之后，我们再把所有文件重查一遍。它绝不代笔。笔一直在你手里。
```

在散文样本 `rev2-zh-03-essay-bookshop` 上，`Humanizer-zh` 删掉了「诚然」「然而」，末尾仍落回常见的先抑后扬尾句：

```text
或许，真正值得珍惜的从来不是速度本身，而是人与江水共处的片刻宁静。
```

3. **极端精简把整段技术指标压成了空串**：英文两款 Skill 在 `15` 个任务上保留了 `100%` 的数字。中文技术规范 `rev-zh-03-tech-spec` 上，单用 `lieflat` 直接输出了 `0` 字符空结果，核心指标 `8000 QPS` 全部丢失（得分 `0`）；经 `dislop` 检出 `missing:8000 QPS` 并自动补修后恢复至 `90` 分。

4. **自纠记录（`v0.8.2` -> `v0.8.3`）**：在最初的 `v0.8.2` 评分中，`verifyRevision` 对三处合法的英文改写报了误判——`humanizer` 把 `"inside 5 seconds"` 改成同义的 `"within 5 seconds"`（`rev2-en-01-api-release`），`stop-slop` 把 `"3600 seconds"` 改成连字符词 `"3600-second"`（`rev2-en-02-postmortem`），以及 `dislop` 删掉重复摘要列表后只保留一处 `"40-million-row"`（`rev-en-03-rfc-summary`）。`v0.8.3` 已补齐 `inside` 上界限定词、连字符英文单位归一与重复数字去重，修正后英文全部组别均为 `0` 事实漂移。

## 4. 怎么配合使用最稳

`Humanizer-zh`、`lieflat`、`humanizer` 和 `stop-slop` 擅长做第一遍文字顺稿，不需要二选一替换。把改写类 Skill 放在前面顺文字，再用 `dislop` 在本地离线过一遍硬伤、结构套话和原稿数字对齐即可：

```bash
# 本地离线检查 Markdown、HTML、Word 与 PPT（不上传任何文件）
npx --yes dislop check . --pack auto --lang zh

# 改完对照 git HEAD 核对数字和限定词有没有丢失
npx --yes dislop verify --git HEAD draft.md --strict
```

日常在 Claude Code、Codex、Cursor 或办公 Agent 里工作时，也可以直接把官网首页的一句话提示词发给它，让它读取 `https://dislop.com/llms.txt` 自行选装 Skill、CLI 或远程 MCP，并拿当前目录里的文件先试跑一次。

## 5. 局限性与口径说明

1. 本次对照在单模型（`gemini-3.5-flash`）的 `30` 份测试集上完成，按单语 `15` 份样本算，各组通过率的 95% 威尔逊置信区间较宽（例如 `14/15 = 93.3%` 对应 `[70.2%, 98.8%]`），仅反映这批任务的对比分布。
2. 四个外部项目均按 `2026-11-23` 公开版本原始 `SKILL.md` 运行，未改写提示词；`+ dislop` 配对组复用各自的第一遍输出加一轮确定性修补，专门隔离验证后置检查的增量效果。
