---
content-type: reference-data
version: 1.1.2
snapshot: 2026-11-26
---

# 路线图与协作计划（Roadmap）

[English](./roadmap.md) · [产品定义](./methodology/product-brief.md)

最后更新：`2026-11-26` · 当前基线：`v1.1.2`（Node.js 微内核 Linter · `dislop.com` 已上线）

这份路线图记录 `dislop` 目前已经交付的能力、从编码 Agent / CI 向办公 Agent 与日常写作者扩展的节奏，以及欢迎一起在 [GitHub Discussions](https://github.com/dislop-ai/dislop/discussions) 或 [Issue](https://github.com/dislop-ai/dislop/issues) 讨论的开放问题。

---

## 1. 当前进度（`v1.1.2` 已落地）

| 模块 | 现已实现 | 核心目录 |
|---|---|---|
| 微内核与 `dislop/sdk` | Node.js（`>= 20.0.0`，ESM）零外部依赖 7 步微内核，支持项目与全局 `.dislop.json` 分层、`overrides` 分目录覆盖、`.dislop/rules.json` 自定义规则、双轨退出码仲裁（`Defect` vs `Suggestion`）、交互式 hunk 审核（`dislop fix`）、双端事实闸门（`dislop verify`）、规则安全体检（`dislop packs lint`）与可选本地开发工作日志（`dislop worklog`） | `src/kernel/`、`src/runtime/`、`src/commands/`、`src/sdk/` |
| 11 套模块化规则包 | 中英文与通用规则严格按单语目录隔离（`common` / `en` / `zh` × `artifact-qa` / `prose` / `web-ui` / `slide-deck`），确定性脚本（`scripts/*.mjs`）与按需提示词（`prompts/*.md`）分离 | `packs/`、`scripts/verify-packs-security.mjs` |
| 支持格式与无损写回 | `.md`、`.mdx`、`.txt`、`.html`、`.css`、`.jsx`、`.tsx`、`.svg`、`.docx`、`.pptx`、`.pdf`（支持 `FlateDecode` / `ASCII85Decode` / `ASCIIHexDecode`、`/ObjStm`、`/ToUnicode`、XObject 递归展开与 `/URI` 链接提取）以及 `.png`/`.jpg`/`.webp` | `src/document/`、`src/fact-gate/` |
| 3 档本地优先路由与 MCP | 默认纯本地确定性检查（支持可选 Ollama 本地小模型 `dislop model pull`）、Tier 2 自备密钥（`--engine byok`）、Tier 1 官方云端（`dislop login`）与本地 stdio MCP（`dislop mcp` / `dislop-mcp`） | `src/runtime/router.mjs`、`src/runtime/providers/`、`src/mcp/` |
| 官网与在线工作台 | 单域名 `dislop.com/` 默认纯英文（`x-default`）与 `/zh/` 原生中文子路径（旧路径 `/en/*` 保留 `301` 跳转）、浏览器本地离线工作台、双语指南、规则图鉴与 `/llms.txt` 端点 | `site/` |
| Awesome Anti-Slop | 90 条双语核验清单（`dislop.radar/2`），同源生成纯英文 `awesome/README.md`、纯中文 `awesome/README.zh-CN.md` 与 `dislop.com/awesome/`、`dislop.com/zh/awesome/` 网页筛选页 | `docs/research/anti-slop-radar-index.json`、`awesome/` |
| 多平台清单与 CI 集成 | 同源锁定分发清单：npm（`dislop`）、官方 MCP Registry（`io.github.dislop-ai/dislop`）、5 套纯文档 Agent Skill（`skills/*`）、Claude Code（`.claude-plugin/`）、Codex（`.codex-plugin/`）、Cursor（`.cursor-plugin/`）、Gemini CLI（`gemini-extension.json`）、GitHub Action（`action.yml`）与 `.pre-commit-hooks.yaml` | `package.json`、`server.json`、`action.yml`、`.pre-commit-hooks.yaml` |

---

## 2. 近期与中期工作轨道（支持多人并行）

各条轨道按目录边界拆开，减少合并冲突。

排期遵循 [PRODUCT.md](./methodology/product-brief.md) 的内部设计原则：能被 Agent 自动挂载复用的协议接口、防改坏验收门禁与 Office 保排版管线优先，纯人工手写触发的单点插件顺延。

### 轨道 A — 公共源正式上架与首批 6 大目录提审（当前最优先）

目标：完成账号侧首次发布，把全仓默认安装从 Git 拉取切到毫秒级公共注册中心，并拿下首批官方插件目录展位。

- [x] 建立同源清单同步与校验脚本（`scripts/sync_manifests.mjs`）、自动发包工作流（`.github/workflows/release.yml`）、GitHub Action（`action.yml`）与 `pre-commit` 钩子配置（`.pre-commit-hooks.yaml`）。
- [x] 默认开启本地 MCP 紧凑输出（`verbosity: "compact"`），收口为 7 个核心离线工具并剥离 `dislop_explain` 测试负例，通过 `claude plugin validate` 与 `codex plugin` 实装校验，配置 GitHub 仓库 `gemini-cli-extension` 等爬虫检索标签。
- [x] 完成 npm（`dislop`）正式发布，并将 `server.json` 推送上线至官方 MCP Registry（`io.github.dislop-ai/dislop`）。
- [ ] 核验 `skills.sh` 与 `geminicli.com/extensions` 自动收录状态，认领 Smithery 与 Glama 页面；Anthropic 官方目录与 OpenAI 通用插件目录待人工资质与提审窗口推进。

**验收标准**：公网直接执行 `npx --yes dislop check .`、`npx --yes dislop-mcp` 与 `gemini extensions install` 可用，官方 MCP Registry 返回 `io.github.dislop-ai/dislop` 官方远程端点。

### 轨道 B — 编辑器单包双发与多 Agent 并行编排器适配（下一里程碑）

目标：用同一份零依赖 `src/core.mjs` 吃下最大编辑器搜索流量，并解决 Orca、Herdr、Conductor 等多 Agent 并行工具的 Git Worktree 收口痛点。

- [x] 落地支持桌面与浏览器端（`vscode.dev`）的轻量 Web 扩展 `integrations/vscode/`（内置 7 包规则、波浪线诊断、悬停三段示例、`Cmd+.` 快速插入豁免注释与 Agent 工具双挂载，随 GitHub Release 附带 `.vsix` 安装包）。
- [x] 落地 `integrations/antigravity/`（通过 `agy plugin validate --strict` 零警告校验）、`.cursor-plugin/plugin.json` 以及多 Agent 编排器配置（`integrations/orca/orca.yaml`、`integrations/herdr/herdr-plugin.toml` 与带 2 次熔断的 `integrations/hooks/dislop-gate.sh`）。
- [ ] 配置发布者凭据同步上架 **VS Code Marketplace** 与 **Open VSX**，提交 Antigravity 伙伴审核及 Cursor / Cline 市场 PR。

**验收标准**：本地实装 `.vsix` 验证波浪线与 Agent 工具双挂载生效；模拟多 Worktree 并行场景验证私有禁词继承与 `--fail-on error` 拦截退出码准确。

### 轨道 C — 办公 Agent 与日常办公人群破圈及基准扩充（持续推进）

目标：从首批 Coding Agent 用户向 WorkBuddy、千问、Claude Cowork 等办公 Agent 用户及日常写方案、周报的人群延伸，并用公开可复现数据持续验证检出率。

- [x] 交付 `dislop-bench v2`（112 份核心检测基准与 154 份多角度反模式基准，精确率 `100.0%`、召回率 `100.0%`、干净原稿误报率 `0.0%`、双端一致率 `100.0%`，18 组端到端改稿评测 `18/18` 全过及 5 模型真实在线对比，见 [benchmarks/REPORT.md](https://github.com/dislop-ai/dislop/blob/main/benchmarks/REPORT.md)）及 30 任务 4 Skill 生态横向评测（[benchmarks/ECOSYSTEM-BENCHMARK.zh-CN.md](https://github.com/dislop-ai/dislop/blob/main/benchmarks/ECOSYSTEM-BENCHMARK.zh-CN.md)）。
- [ ] *（低优顺延）* 待云端 Office 保排版与 `dislop_verify_edit` 落地后，再评估复用纯 JS `src/core.mjs` 打包 **Obsidian Community Plugins** 与 **Raycast Store** 等纯手写单点扩展。
- [ ] 扩充真实长文、多页管理汇报 `.pptx` 与跨模型盲评样本，按双周复盘各商店安装量。

**验收标准**：CI 断网执行 `node scripts/run_benchmark.mjs --assert` 全绿，真实长文与多页 `.pptx` 评测样本补齐；纯手写单点插件待核心 Agent 与 Office 云端能力稳定后再行评估。

### 轨道 D — `Awesome Anti-Slop` 持续维护与拆仓阈值（并行推进）

目标：保持 90 条中英文工具清单准确、中立、好查，同时不分散主仓库注意力。

- [x] 增加 Awesome Anti-Slop 的 GitHub Issue 投稿表单模板（`.github/ISSUE_TEMPLATE/awesome_submission.yml`，含链接、类别、语种与中英各一句用途说明）。
- [x] 增加定时巡检 90 条清单外链与仓库健康度的脚本与工作流（`scripts/check_awesome_links.mjs` 与每周运行的 `.github/workflows/awesome-links.yml`）。
- [ ] 冷启动阶段继续把 `awesome/README.md`、`awesome/README.zh-CN.md` 与 `https://dislop.com/awesome/` 留在 `dislop-ai/dislop` 主仓维护。
- [ ] **拆仓阈值**：仅当外部有效目录 PR 持续达到 `>= 5 条/月` 时，再按 `dislop.radar/3` 预案切出独立 CC0-1.0 仓库 `dislop-ai/awesome-anti-slop`，永久保持 `https://dislop.com/awesome/` 地址不变。

### 轨道 E — 云端审校与独立官网仓拆分（`dislop-cloud`）

- **开源部分（`dislop-ai/dislop`，Apache-2.0）**：
  - 纯文档 `SKILL.md` 与 `./references/*.md`
  - 零依赖 Node.js CLI、SDK、本地 stdio MCP 与 `11` 套模块化规则包（`common/*`、`en/*`、`zh/*`）
  - 浏览器基础工作台、`Awesome Anti-Slop` 与 `dislop-bench v3`
- **闭源部分（`dislop-cloud`）**：官方云端 MCP（`https://dislop.com/mcp`）、多模型流水线与 Word/PPT 保排版处理。

- [x] **阶段 0（云端上线、Account Hub 与登录闭环）**：官方 `dislop-cloud` 已上线 `https://dislop.com/mcp` 与 `/api/v1/*`，落地每月 30 免费额度与 OAuth / 验证码登录。
- [ ] **对齐 `dislop.report/1` 契约与拆分官网仓**：按 [MIGRATION-TODO.md](https://github.com/dislop-ai/dislop/blob/main/docs/MIGRATION-TODO.md) 完成 `site/`、`content/`、`awesome/` 拆仓并让云端 `/api/v1/review` 对齐微内核 `dislop.report/1` 协议。

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

开放设计问题先在 [GitHub Discussions](https://github.com/dislop-ai/dislop/discussions) 对齐；具体任务认领、规则误报反馈与工具投稿统一建 [Issue](https://github.com/dislop-ai/dislop/issues)，按 `track:*`、`area:*`、`priority:*` 标签和里程碑（`v0.8.0`、`v0.9.0`、`v0.10.0`）汇总。日常状态只看 GitHub Issue 与看板，这份路线图只在发版或里程碑收口时统一勾选，不记两套账。

小修、文案微调和发版可直接快进推 `main`；新功能、改规则或跨模块改动建议建短分支（`feat/...`、`fix/...`、`docs/...`），PR 描述写 `Closes #<编号>` 关联任务，CI 通过即可合入。`.github/CODEOWNERS` 会自动请求维护者评审，合入后自动清理分支；`main` 禁强推和删分支。商业计费、配额与云端托管后台在私有仓单独管理，不放进本仓。

- **并行分工参考（少冲突）**：
  - 规则与双端内核：`packs/`、`patterns/`、`src/core.mjs`、`src/dislop/`、`tests/test_conformance.py`
  - 插件市场与编辑器集成：`scripts/sync_manifests.mjs`、`plugin.json`、`integrations/`、`action.yml`
  - 官网与工具清单：`docs/research/anti-slop-radar-index.json`、`scripts/build_site.mjs`、`site/`、`tests/test_site.mjs`
  - 评测基准与文档：`benchmarks/`、`docs/`、`README*.md`、`ROADMAP*.md`
- **三条底线**：
  - `src/core.mjs` 与 `src/dislop/` 核心检查器保持零外部运行时依赖。
  - 官网禁止加载第三方字体、统计脚本与外域请求（`CSP: connect-src 'self'`），默认离线检查 0 上传。
  - 所有写给访客看的文案遵守 [docs/brand-and-voice-guide.zh-CN.md](https://github.com/dislop-ai/dislop/blob/main/docs/brand-and-voice-guide.zh-CN.md) 与 [AGENTS.md](https://github.com/dislop-ai/dislop/blob/main/AGENTS.md) §2，中英文严格不混排。
- **提 PR 或发版前跑一条命令**（多平台发布细则见 [docs/releasing.zh-CN.md](https://github.com/dislop-ai/dislop/blob/main/docs/releasing.zh-CN.md)）：
  ```bash
  npm run release:check
  ```
