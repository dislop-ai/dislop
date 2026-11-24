# 路线图与协作计划（Roadmap）

[English](./ROADMAP.md) · [产品定义](./PRODUCT.md)

最后更新：`2026-11-24` · 当前基线：`v0.8.3`（`dislop.com` 已上线 · 全球英文优先基线）

这份路线图记录 `dislop` 现在已经做到哪一步、接下来按全球英文优先与中英同核适配原则覆盖 Coding Agent 用户、办公 Agent（Claude Cowork、ChatGPT 及千问、WorkBuddy 等）用户与日常办公人群的推进顺序，以及欢迎团队一起拍板的开放问题。认领任务、反馈误报，或者聊新点子，直接在 [GitHub Discussions](https://github.com/dislop-ai/dislop/discussions) 开帖，或建一个 [Issue](https://github.com/dislop-ai/dislop/issues) 即可。

---

## 1. 当前进度（`v0.8.3` 已落地）

| 模块 | 现已实现 | 核心目录 |
|---|---|---|
| 双端零依赖内核 | Node.js 20+ 与 Python 3.10+ 双端零外部依赖，通过 230 项规则与语体样本断言、分场景策略路由（`getScenarioStrategy` / `registerOverrides`）、65 条反模式库核验、离线个人文风提取及 66 项 Python `unittest` 跨运行时一致性、CLI 与安全单测 | `src/core.mjs`、`src/dislop/engine.py`、`src/review-client.mjs`、`tests/` |
| 全内置规则包与轻量模型 | 全部 7 套场景与行业包（53 条规则）直接内置离线运行：`core`、`business-brief`、`engineering-spec`、`regulated-comms`、`literary-essay`、`deck-and-ui`、`executive-deck`；附 12 条扩展模式库探针（`--patterns`）、随包 `14.6 KB` gzip 零依赖集成模型（`pocket-slop-v1`）与本机内存/芯片小模型选装向导（`dislop model`） | `packs/*/pack.json`、`patterns/`、`models/`、`src/local-model.mjs` |
| 支持格式 | `.md`、`.mdx`、`.txt`、`.html`、`.css`、`.jsx`、`.tsx`、`.svg`、`.docx`、`.pptx`、`.pdf`、`.png`、`.jpg`、`.jpeg`、`.webp` | `src/binary-node.mjs`、`src/dislop/engine.py` |
| 官网与在线工作台 | 按浏览器语言自动匹配中文或原生英文的 `dislop.com`，支持场景包 + 语体选择器与分场景改稿提示、两种标线（红实线硬伤 / 蓝虚线套话提醒）、5 格白话节奏条、离线 `#share=v1.*` 分享链接与 `#try=<ruleId>` 直达、双语指南与规则图鉴、`/llms.txt` 端点 | `scripts/build_site.mjs`、`site/` |
| Awesome Anti-Slop | 90 条双语核验清单（`dislop.radar/2`），同源生成纯英文 `awesome/README.md`、纯中文 `awesome/README.zh-CN.md` 与 `dislop.com/awesome/` 网页筛选页 | `docs/research/anti-slop-radar-index.json`、`awesome/` |
| 多平台清单与编辑器集成 | 同源生成并受 CI 校验的分发清单与集成包：npm（`dislop`）、PyPI（`dislop`）、官方 MCP Registry（`io.github.dislop-ai/dislop`，直连官方云端 `https://dislop.com/mcp`）、纯文档 Agent Skill（`skills/dislop/` 含 4 张本地参考卡与 `agents/openai.yaml`）、Claude Code 插件（`.claude-plugin/`，常驻仅约 130 tokens）、Codex 插件（`.codex-plugin/` 与 `.agents/plugins/marketplace.json`）、Cursor 插件（`.cursor-plugin/`）、Antigravity 插件包（`integrations/antigravity/`）、VS Code / Open VSX 轻量 Web 扩展（`integrations/vscode/`）、可复用 GitHub Action（`action.yml`）与 `.pre-commit-hooks.yaml` | `scripts/sync_manifests.mjs`、`integrations/`、`server.json`、`action.yml` |

---

## 2. 近期与中期工作轨道（支持多人并行）

全平台适配调研与渠道分级详见 [docs/research/universal-adaptation-and-marketplace-strategy.zh-CN.md](./docs/research/universal-adaptation-and-marketplace-strategy.zh-CN.md)。各条轨道按目录边界拆开，减少合并冲突。

### 轨道 A — 公共源正式上架与首批 6 大目录提审（当前最优先）

目标：完成账号侧首次发布，把全仓默认安装从 Git 拉取切到毫秒级公共注册中心，并拿下首批官方插件目录展位。

- [x] 建立同源清单同步与校验脚本（`scripts/sync_manifests.mjs`）、自动发包工作流（`.github/workflows/release.yml`）、GitHub Action（`action.yml`）与 `pre-commit` 钩子配置（`.pre-commit-hooks.yaml`）。
- [x] 默认开启本地 MCP 紧凑输出（`verbosity: "compact"`），收口为 7 个核心离线工具并剥离 `dislop_explain` 测试负例，通过 `claude plugin validate` 与 `codex plugin` 实装校验，配置 GitHub 仓库 `gemini-cli-extension` 等爬虫检索标签。
- [x] 完成 npm（`dislop`）与 PyPI（`dislop`）正式发布，运行 `node scripts/sync_manifests.mjs --channel registry` 将全仓默认坐标切换至正式公共包，并已将 `server.json` 推送上线至官方 MCP Registry（`io.github.dislop-ai/dislop`）。
- [ ] 核验 `skills.sh` 与 `geminicli.com/extensions` 自动收录状态，认领 Smithery 与 Glama 页面；Anthropic 官方目录与 OpenAI 通用插件目录待人工资质与提审窗口推进。

**验收标准**：公网直接执行 `npx dislop check .`、`uvx dislop check .` 与 `gemini extensions install` 可用，官方 MCP Registry 返回 `io.github.dislop-ai/dislop` 官方远程端点。

### 轨道 B — 编辑器单包双发与多 Agent 并行编排器适配（下一里程碑）

目标：用同一份零依赖 `src/core.mjs` 吃下最大编辑器搜索流量，并解决 Orca、Herdr、Conductor 等多 Agent 并行工具的 Git Worktree 收口痛点。

- [x] 落地支持桌面与浏览器端（`vscode.dev`）的轻量 Web 扩展 `integrations/vscode/`（内置 7 包规则、波浪线诊断、悬停三段示例、`Cmd+.` 快速插入豁免注释与 Agent 工具双挂载，随 GitHub Release 附带 `.vsix` 安装包）。
- [x] 落地 `integrations/antigravity/`（通过 `agy plugin validate --strict` 零警告校验）、`.cursor-plugin/plugin.json` 以及多 Agent 编排器配置（`integrations/orca/orca.yaml`、`integrations/herdr/herdr-plugin.toml` 与带 2 次熔断的 `integrations/hooks/dislop-gate.sh`）。
- [ ] 配置发布者凭据同步上架 **VS Code Marketplace** 与 **Open VSX**，提交 Antigravity 伙伴审核及 Cursor / Cline 市场 PR。

**验收标准**：本地实装 `.vsix` 验证波浪线与 Agent 工具双挂载生效；模拟多 Worktree 并行场景验证私有禁词继承与 `--fail-on error` 拦截退出码准确。

### 轨道 C — 办公 Agent 与日常办公人群破圈及基准扩充（持续推进）

目标：从首批 Coding Agent 用户向 WorkBuddy、千问、Claude Cowork 等办公 Agent 用户及日常写方案、周报的人群延伸，并用公开可复现数据持续验证检出率。

- [x] 交付 `dislop-bench v2`：112 份核心检测基准与 154 份多角度反模式基准（精确率 `100.0%`、召回率 `100.0%`、干净原稿误报率 `0.0%`、双端一致率 `100.0%`）、18 组端到端改稿评测（`18/18` 全过）与 5 模型真实在线对比（[benchmarks/REPORT.md](./benchmarks/REPORT.md)）。
- [ ] 复用纯 JS `src/core.mjs` 打包上架 **Obsidian Community Plugins**（单文件离线检查 + 可选云端改写）与 **Raycast Store**（系统快捷键检查选中文本 / 剪贴板）。
- [ ] 扩充真实长文、多页管理汇报 `.pptx` 与跨模型盲评样本，按双周复盘各商店安装量。

**验收标准**：CI 断网执行 `node scripts/run_benchmark.mjs --assert` 全绿，Obsidian 与 Raycast 扩展通过各自社区仓库机器校验。

### 轨道 D — `Awesome Anti-Slop` 持续维护与拆仓阈值（并行推进）

目标：保持 90 条中英文工具清单准确、中立、好查，同时不分散主仓库注意力。

- [x] 增加 Awesome Anti-Slop 的 GitHub Issue 投稿表单模板（`.github/ISSUE_TEMPLATE/awesome_submission.yml`，含链接、类别、语种与中英各一句用途说明）。
- [x] 增加定时巡检 90 条清单外链与仓库健康度的脚本与工作流（`scripts/check_awesome_links.mjs` 与每周运行的 `.github/workflows/awesome-links.yml`）。
- [ ] 冷启动阶段继续把 `awesome/README.md`、`awesome/README.zh-CN.md` 与 `https://dislop.com/awesome/` 留在 `dislop-ai/dislop` 主仓维护。
- [ ] **拆仓阈值**：仅当外部有效目录 PR 持续达到 `>= 5 条/月` 时，再按 `dislop.radar/3` 预案切出独立 CC0-1.0 仓库 `dislop-ai/awesome-anti-slop`，永久保持 `https://dislop.com/awesome/` 地址不变。

### 轨道 E — 真实评测驱动的智能审校与闭源云端能力（`v0.7.0+`）

完整定价、成本测算与防改坏边界见 [docs/research/business-model-and-open-core.zh-CN.md](./docs/research/business-model-and-open-core.zh-CN.md) 与 [docs/research/agent-repair-boundaries-eval-and-dehedging.zh-CN.md](./docs/research/agent-repair-boundaries-eval-and-dehedging.zh-CN.md)。**先评测再精简代码**：在真实保留集完成评测对比前，保留既有离线规则、Pocket ML 与 Python 双端代码不删。

- **开源部分（`dislop-ai/dislop`，Apache-2.0）**：
  - 纯文档 `SKILL.md` 与 `./references/*.md`
  - 零依赖本地 `CLI`，内置全部 7 套规则包（53 条规则）、65 条反模式库与 `14.6 KB` 轻量集成模型
  - 浏览器基础工作台、`Awesome Anti-Slop`、开源单步审校 Prompt 与 `dislop-bench v2`
- **闭源部分（`dislop-cloud`）**：官方云端 MCP（`https://dislop.com/mcp`）、多模型流水线与防改坏净增益评估服务（`dislop_eval` / `dislop_verify_edit`）。

- [x] **阶段 0（云端上线与登录试用收口）**：官方 `dislop-cloud` 已上线 `https://dislop.com/mcp` 与 `/api/v1/*`，启用登录领取每月 30 免费额度，并开放 Pro / 按量包 / Team 预约；`v0.7.0` 起 CLI 0 命中输出改为“未发现已知模式”并统一全部插件清单直连官方云端 MCP。
- [ ] **真实语料保留评测集与 4 臂盲评**：收集覆盖叙事随笔、思辨论述、公文简报与工程文档的真实中英文文章并人工标注，对比离线快检、单个开源 Prompt、纯云端大模型与混合流水线（离线规则 + 5 轴特征注入 + 分文体大模型审校 + 确定性护栏），用保留集结果决定后续代码取舍。
- [x] **分场景语体策略、结构化 `revision` 与 CLI 自备密钥 `review` + `doctor`**：双端落地 `--register`（`technical` / `official` / `argumentative` / `narrative` / `casual` / `marketing`）、`getScenarioStrategy`、`registerOverrides`、带保护锚点的 `edit`/`rewrite`/`ask` 改法建议、`verify` 口语/书面语域防漂移护栏、`--format agent` 紧凑输出、零联网 `dislop doctor` 与显式授权 BYOK `dislop review`。
- [ ] **闭源云端防改坏净增益评估（`dislop_eval` / `dislop_verify_edit`）与零训练校准飞轮**：对 `Before vs. After` 改写执行原子事实精确度/召回率与跨厂商换序盲测；全档位坚持用户稿件零训练，仅利用闭源对抗基准、脱敏合成改坏集、Opt-in 纠错反馈与人工金标 Kappa 持续校准评估器。
- [ ] **按地区多模型路由与保留原排版去味导出（`.docx` / `.pptx` Round-Trip）**：按地区切换不拿稿子训练的付费模型接口，拆解 OOXML、去掉 AI 味并复核数字与限定词后保留原样式导出。
- [ ] **网页与 PPT 视觉多模态审查（Visual Anti-Slop）与团队共享文风库**：无头渲染真实截图 + VLM 审校版式拥挤度、模板审美与连续同版式，并支持跨成员复用 `dislop.voice/1`。

---

## 3. 待讨论的 5 个开放问题（欢迎直接拍砖）

以下问题尚未写死，欢迎协作者在 Discussions / Issue 里直接给意见：

1. VS Code 与 Open VSX 扩展是在保存文件（`onSave`）时再刷新波浪线，还是默认开启 `300ms` 停顿实时刷新？长文写作时实时划线会不会打断思路？
2. 目前默认建议 Agent 的 `PostToolUse` / `Stop` Hook 只对 `packs/core` 的 `error` 硬伤返回非零退出码、同一文件连续拦截 2 次即放行转人工；是否还需要一套一键严苛预设（连 `regulated-comms` 极限词也一起硬拦）？
3. 在 Orca 和 Conductor 新建子 Git Worktree 时，除了 `.dislop.local.json` 私有词表，是否默认把 `.dislop.local/voice.json` 个人文风卡也一并软链过去？
4. PR diff 增量检查里，`dislop` 是继续专注文档、文案、PPT 与前端 UI 文件（把代码 AST 交给 Oxlint / ESLint / Ruff），还是给空话 PR 描述和假 JSDoc 单独做一条可选探针？
5. 长文作者在 Obsidian 里更需要侧边栏整篇节奏体检面板，还是直接在正文编辑区划蓝虚线？

---

## 4. 协作方式与合并前检查

开放设计问题先在 [GitHub Discussions](https://github.com/dislop-ai/dislop/discussions) 对齐；具体任务认领、规则误报反馈与工具投稿统一建 [Issue](https://github.com/dislop-ai/dislop/issues)，按 `track:*`、`area:*`、`priority:*` 标签和里程碑（`v0.6.1`、`v0.7.0`、`v0.8.0`）汇总。日常状态只看 GitHub Issue 与看板，这份路线图只在发版或里程碑收口时统一勾选，不记两套账。

小修、文案微调和发版可直接快进推 `main`；新功能、改规则或跨模块改动建议建短分支（`feat/...`、`fix/...`、`docs/...`），PR 描述写 `Closes #<编号>` 关联任务，CI 通过即可合入。`.github/CODEOWNERS` 会自动请求维护者评审，合入后自动清理分支；`main` 禁强推和删分支。商业计费、配额与云端托管后台在私有仓单独管理，不放进本仓。

- **并行分工参考（少冲突）**：
  - 规则与双端内核：`packs/`、`patterns/`、`src/core.mjs`、`src/dislop/`、`tests/test_conformance.py`
  - 插件市场与编辑器集成：`scripts/sync_manifests.mjs`、`plugin.json`、`integrations/`、`action.yml`
  - 官网与工具清单：`docs/research/anti-slop-radar-index.json`、`scripts/build_site.mjs`、`site/`、`tests/test_site.mjs`
  - 评测基准与文档：`benchmarks/`、`docs/`、`README*.md`、`ROADMAP*.md`
- **三条底线**：
  - `src/core.mjs` 与 `src/dislop/` 核心检查器保持零外部运行时依赖。
  - 官网禁止加载第三方字体、统计脚本与外域请求（`CSP: connect-src 'self'`），默认离线检查 0 上传。
  - 所有写给访客看的文案遵守 [docs/brand-and-voice-guide.zh-CN.md](./docs/brand-and-voice-guide.zh-CN.md) 与 [AGENTS.md](./AGENTS.md) §2，中英文严格不混排。
- **提 PR 或发版前跑一条命令**（多平台发布细则见 [docs/releasing.zh-CN.md](./docs/releasing.zh-CN.md)）：
  ```bash
  npm run release:check
  ```
