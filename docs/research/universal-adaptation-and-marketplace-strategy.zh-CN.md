# `dislop` 全平台适配与插件市场流量增长策略

日期：`2026-11-22` · 状态：战略与工程规划基线（关联 `ROADMAP.zh-CN.md` 与 `business-model-and-open-core.zh-CN.md`；已吸收原多端集成与官网 Agent 服务静态契约）

这份调研解决两个直接绑定项目增长的问题：怎么用最小维护成本把主流 Agent 客户端、代码与写作编辑器、多 Agent 并行编排器（Orca、Herdr、Conductor 等）全部接通并跑出最佳去 AI 味效果；以及怎么把各大插件市场、技能榜单与扩展商店变成稳定的高意向流量入口。

---

## 1. 现状核查与四条核心判断

### 1.1 仓库与公网注册表实测基线（`2026-11-22`）

核对本仓现有清单与公网接口返回状态，当前多平台分发的真实起点如下：

- **三大核心注册表已正式上架贯通**：`https://registry.npmjs.org/dislop`（`npx dislop`）、`https://pypi.org/pypi/dislop/json`（`uvx dislop`）与官方 MCP Registry `https://registry.modelcontextprotocol.io`（`io.github.dislop-ai/dislop`，同时登记本地 `stdio` 与远程 `https://dislop.com/mcp`）均已完成首发验证并返回 `HTTP 200`，`.mcp.json` 等全套清单已切换至毫秒级公共注册表坐标。
- **多份清单已完成 `v0.6.0` 同源收敛**：此前各清单曾散落在 `0.2.0`–`0.5.0` 不同版本，现已通过 `scripts/sync_manifests.mjs` 全部对齐至 `v0.6.0` 基线，并在 `server.json` 中同时写入本地 `npm`/`pypi` 包与 `https://dislop.com/mcp` 远程 `streamable-http` 入口。
- **部分主流商店仍处于完全空白期**：实测检索 Antigravity 官方插件市场（`writing`、`lint`、`markdown`、`slop`、`proofread`、`copywriting` 六组词），当前针对文稿、PPT 与网页去 AI 味的插件数量为 `0`。VS Code 市场里虽已有数款带 `slop` 词根的扩展（如 `AI Slop Detector`、`AI Code Detector`），但几乎全部聚焦代码坏味道与函数复杂度，针对中英文文档、`.docx`/`.pptx` 和前端模板味的确定性检查仍是空位。

### 1.2 四条前置纠偏原则

在铺开适配工作前，先立住四条工程与增长边界，避免把“全适配”做成拖垮团队的多仓泥潭：

1. **“全适配”靠标准协议收敛，不靠每个软件写一套逻辑**。2026 年主流宿主已经高度收敛到 6 种标准载体：`SKILL.md`（`agentskills.io`）、`CLI`（npm / PyPI）、`MCP`（本地 `stdio` + 远程 `streamable-http`）、`Agent Plugins 1.0` 清单（`agent-plugins.org`）、兼容 Open VSX 的轻量 `VSIX` 扩展，以及 Git 仓库级配置模板。维护好这 6 份同源薄壳，就能覆盖市面上 95% 以上的工具。
2. **严格区分“兼容运行”与“自带搜索流量的商店”**。很多终端工具没有中心化商店，只要支持 CLI、Skill 或 MCP 就能直接用，写进文档和官网安装矩阵即可；真正的包装精力（图标、动图、关键词、首屏提示词、双通道提审）必须集中砸向**带客户端内搜索、排行榜或一键安装卡片**的 9 个核心流量入口。
3. **集成效果取决于“触发时机分层”，而不是把所有规则塞进同一个口子**。只挂一个被动 MCP Server，模型在长任务里经常忘记调用；反过来，如果把所有文风 `warning` 规则都挂进每次写文件的阻塞 Hook，又会把编码 Agent 卡进反复改写的死循环。有效做法是：**动笔前靠精简 Skill 预防、编辑中靠内存级波浪线或紧凑 MCP 诊断、交稿/提交前只拿 `packs/core` 的客观硬伤（`error`）做自动拦截**。
   - 行业对照印证（详见 [grammarly-evolution-and-agent-lessons.zh-CN.md](./grammarly-evolution-and-agent-lessons.zh-CN.md)）：Grammarly / Superhuman Go 凭借「原位消除 AI 绕道 + 98% 请求跑在 `< 100ms` 定制小模型」跑通了高频调用，随后却因插件 AI 膨胀、高频推销弹窗和生硬改写提醒引发老用户卸载；同时，Superhuman Docs 与 Go 分别开放 MCP Server 和第三方 SDK 也说明协议互操作才是主流。这反过来验证了 `dislop` 坚持「协议薄壳 + 毫秒级本地核 + 非阻断标线 + 连续 2 次熔断」的长期价值。
4. **Orca、Herdr 这类多 Agent 编排器的核心痛点在“Git Worktree 隔离”与“收口验收”**。当开发者同时开 5 到 10 个 Agent 并行干活时，没人会逐个终端窗口手动点检查。谁能帮他们在每个隔离 worktree 里自动继承本地词表（`.dislop.local.json`），并在 Agent 报完工或提 PR 前用 `< 100ms` 拦住未填占位符、开头寒暄和空链接，谁就能成为这类多 Agent 工作流的默认质检门禁。

---

## 2. 四大生态阵营调研：接入机制与流量价值对比

### 2.1 阵营一：Agent 客户端与编码 CLI

这一阵营的用户高频产出 README、技术方案、前端页面和汇报材料，且头部宿主已在 2026 年全面上线内置插件市场。

| 宿主平台 | 官方流量入口与发现机制 | 核心打包规范与关键要求 | 最佳适配组合（兼顾效果与获客） |
|---|---|---|---|
| **Claude Code & Cowork** | **Anthropic 官方目录**（`claude.ai/directory/manage` 自助提审后台）+ 仓库级 `/plugin marketplace add` | 早期本地 `.mcpb` 包在公开目录中已基本淡出，官方目录主推两类提审物：① 含 `.claude-plugin/plugin.json` 的 GitHub 插件包；② 远程 MCP Connector URL。`claude plugin details` 会直接向用户展示**预估 Token 开销**，`claude plugin eval` 支持跑有/无插件对比评测 | **双通道同时提审**：提交 GitHub 开源插件包（打包低 Token `SKILL.md` + 本地 `stdio MCP` + 轻量 `Stop` Hook），同时单独提交 `https://dislop.com/mcp` 作为免安装远程 Connector（承接 Cowork 桌面与网页端非技术用户） |
| **ChatGPT App & Codex** | **OpenAI 通用插件目录**（ChatGPT 与 Codex 共用）+ Codex CLI `codex plugin marketplace add` / `/plugins` 面板 | 根目录 `plugin.json` 遵循严格封闭顶层字段的 `agent-plugins.org/1.0.0` 标准，MCP 单独放根目录 `mcp.json`，UI 卡片信息写在 `extensions.com.openai.interface`；技能目录内用 `skills/dislop/agents/openai.yaml` 配置调用策略与默认提示词 | 补齐根目录标准 `plugin.json`、`mcp.json` 与 `skills/dislop/agents/openai.yaml`（设置清晰的应用卡片标题与 1 句默认检查指令），提审通用目录 |
| **Google Antigravity** | **Antigravity 内置 Agent Marketplace**（桌面端侧栏与 `search_marketplace` 直搜，支持 `<plugin-card>` 一键安装） | 插件目录含专属 `plugin.json`（支持 `displayName`、`logo`、3 条 `suggestedPrompts`，未知顶层字段会被静默丢弃）、`mcp_config.json`、`skills/`、`hooks.json`；上架前须通过 `agy plugin validate --strict` 零警告校验，经 Partner Intake 提交 | **优先抢占类目空白**：单独构建通过 `--strict` 校验的 Antigravity 插件包（含方形高对比度 `logo.svg` 与 3 条中英场景启动提示词），第一时间提交官方伙伴审核 |
| **Gemini CLI** | **Gemini CLI Extension Gallery**（`geminicli.com/extensions` 每日自动爬虫收录，无需人工排队审批） | 仓库根目录放置合法的 `gemini-extension.json`（声明 `mcpServers`、`skills`、`hooks` 或 `contextFileName`），给 GitHub 仓库打上 **`gemini-cli-extension`** Topic 并打 Release Tag | **零审核周期白拿官方展位**：发版当天补齐根目录 `gemini-extension.json` 与仓库 Topic，支持用户一行 `gemini extensions install dislop-ai/dislop` 安装 |
| **Cursor** | **Cursor 内置 Marketplace**（侧栏 Customize 一键装）+ `cursor.directory` + 网页 `cursor://` 协议唤起按钮 | 同时兼容 `agent-plugins.org` 根目录 `plugin.json` 与功能更全的 `.cursor-plugin/plugin.json`（额外支持 `.mdc` 规则、命令与 Hooks）；支持 `cursor://anysphere.cursor-deeplink/mcp/install` 网页一键装 MCP | 提供 `.cursor-plugin/` 完整包向官方 `cursor/plugins` 提 PR，并在 README 与 `dislop.com` 放上本地/云端两个 `cursor://` 一键安装按钮 |
| **Windsurf / Cline / Roo Code** | **Windsurf Cascade MCP Marketplace**、**Cline MCP Marketplace**（`cline/mcp-marketplace` 仓提 PR，配 `llms-installation.md`） | 均原生消费标准 MCP（`stdio` 与远程 HTTP）及 `.agents/skills` / 规则文件 | 提交 Cline 官方市场 PR，向 Windsurf MCP 目录登记，并在安装页提供标准配置块 |
| **跨宿主 Skill 生态（OpenCode / OpenClaw / Hermes 等）** | **`skills.sh` 排行榜**（Vercel 维护，按 `npx skills add` 真实安装遥测排榜）+ OpenClaw **ClawHub** 向量检索库 | `skills.sh` 直接索引公开 GitHub 仓内的 `skills/*/SKILL.md`，已覆盖 75+ 款编码 Agent；OpenCode 原生扫描 `.agents/skills` 与 `.claude/skills` | 把 `npx skills add dislop-ai/dislop` 作为全渠道主推安装命令之一，集中安装量冲刺 `skills.sh` 写作与前端分类前排，并同步登记至 ClawHub |

### 2.2 阵营二：多 Agent 并行编排器与终端控制室（Orca、Herdr、Conductor、cmux）

用户提到的 Orca（`stablyai/orca`）与 Herdr / Herder（`herdr.dev` / `herder.sh`），连同同赛道的 Conductor（`conductor.build`）、Superset（Paradev）和 cmux，代表了重度开发者的新工作台：不再手写单轮对话，而是同时调度多个 Claude Code、Codex、OpenCode 实例并行改代码、写文档、搭页面。

这两类工具的底层结构完全不同，适配方式不能照搬单聊天窗口插件：

| 工具代表 | 运行架构特点 | 直接用普通方式接入会踩什么坑 | 针对性适配方案 |
|---|---|---|---|
| **Orca（ADE 图形驾驶舱）**<br>同类：**Conductor**、**Superset** | 每个并行任务自动拉起独立 **Git Worktree** + 独立终端 + **内置 Chromium 实时预览窗（含 Design Mode）** + Diff 审阅面板；底层跑的是用户自己订阅的 Claude Code / Codex / Cursor CLI；项目根通过 `orca.yaml`（本地覆盖用 `orca.local.yaml`）管理启动脚本、端口与 `symlinkPaths` | ① `.dislop.local.json` 默认在 `.gitignore` 里，新建子 Worktree 时不会跟着过去，导致团队私有禁词在并行任务里全部失效；<br>② 不同面板混跑 Claude 和 Codex，单靠某一家私有目录配置会出现漏检；<br>③ 人工只在最后看 Diff 和内置浏览器预览 | 1. 提供开箱即用的 **`orca.yaml` 与 `conductor.local/hooks/` 模板**：在 `symlinkPaths` / `post-setup.d` 中自动把主仓 `.dislop.local.json` 软链进每个新 Worktree；<br>2. 在 Worktree 收口脚本与 Git Hook 中统一跑 `dislop check --changed origin/main --fail-on error`；<br>3. 利用 `deck-and-ui` 包在 Agent 产出前端页面进入 Orca Chromium 预览前，先清掉 `href="#"` 空链接、假禁用按钮、紫粉渐变和胶囊墙 |
| **Herdr（Agent 终端多路复用器）**<br>同类：**cmux** | Rust 编写的守护进程 + 终端/桌面/手机端，接管真实 PTY 面板并识别每个 Agent 的状态灯（`working` / `blocked` / `done` / `idle`）；提供 Socket API、`herdr` CLI 与声明式插件清单 **`herdr-plugin.toml`**（支持 `[[actions]]` 快捷键/菜单动作与 `herdr pane report-agent` 状态上报） | 纯靠 Agent 自觉跑命令不够直观；管理 8 个并发面板时，开发者需要在终端侧栏一眼看到“哪个面板刚写完的文档/页面还留着 AI 硬伤” | 编写一个不足 50 行的官方轻量插件 **`herdr-plugin.toml`**（放在 `integrations/herdr/`）：注册工作区动作 `Check AI Slop (changed files)`，一键对当前面板所在目录执行 `dislop check --changed HEAD --fail-on error`，命中硬伤时直接在面板回显精简行号或通过 `herdr` CLI 标记需返工状态 |

### 2.3 阵营三：代码与写作编辑器（推翻“暂缓 VS Code 扩展”的旧判断）

在早期 `v0.2` 草案中，曾把编辑器扩展列为远期低优项，理由是“维护多套 IDE 插件成本高，不如以后写通用 LSP”。结合 2026 年最新宿主能力重算投入产出比，这个判断需要修正——**VS Code + Open VSX 应当提前到 P1 核心工程**，原因有四条：

1. **零外部依赖纯 JS 内核让开发和运行成本极低**：`src/core.mjs` 本身就是零依赖纯 ES 模块。写成 VS Code 扩展时，不需要拉起任何外部 Python/Node 子进程，也不用折腾跨平台二进制分发，打包成一个 **`< 150 KB` 的纯 JS Web Extension（`.vsix`）** 就能在桌面端和浏览器端（`vscode.dev` / `github.dev`）毫秒级离线运行。
2. **一次打包同时吃下两大商店与六款主流 IDE**：同一份 `.vsix` 同时发布到微软 **Visual Studio Marketplace**（`vsce publish`）和开源基金会维护的 **Open VSX Registry**（`ovsx publish`），就能原生覆盖 **VS Code、Cursor、Windsurf、Antigravity、VSCodium、Gitpod** 全部扩展搜索框。
3. **2026 年的 VS Code 扩展可以“一包双挂载（人 + Agent 同装）”**：借助 VS Code 现成的 `vscode.lm.registerMcpServerDefinitionProvider`（`mcpServerDefinitions`）与 `contributes.languageModelTools` 接口，用户从扩展商店点一次安装，不仅自己写 Markdown / HTML / JSX 时有实时波浪线、悬停三段改法对照和 `Cmd+.` 快速忽略注释，扩展还会**自动把 `dislop` 工具和技能注入编辑器内的 Copilot / Agent 模式**，彻底省掉手改 `mcp.json` 的门槛。
4. **顺手扩圈两个非纯码农商店（P2 阶段）**：Obsidian 社区插件目录聚集了大量长文作者、研究员和 Newsletter 创作者，天然契合 `literary-essay` 与 `business-brief` 规则包；插件本身是单文件 `main.js` + `manifest.json`，可直接内嵌 `src/core.mjs` 离线运行，并留一个可选的 `dislop-cloud` Token 输入框承接一键去味需求。Raycast Store 则能用极薄的 React + TS 命令（`Check Selected Text` / `Clean Clipboard Slop`）让用户在飞书、Notion、邮件或浏览器输入框里按快捷键随时调起检查。至于维护重、回报慢的 JetBrains 独立 Java/Kotlin 插件、Zed 独立 Rust/Wasm 插件、Word/WPS 原生客户端审批和 Dify/Coze 私有插件仓，现阶段统一暂缓，分别交由未来的薄 LSP、网页/云端 `.docx`/`.pptx` 原排版导出和标准 OpenAPI 3.1 导入替代。

### 2.4 阵营四：包管理器、MCP 聚合站与仓库级裂变通道

- **硬前置底座（npm + PyPI）**：立刻发布 `dislop` 到 npm（保留 `package.json` 里的 `"mcpName": "io.github.dislop-ai/dislop"`）与 PyPI（在包元数据/README 补齐 `mcp-name` 标记）。这是所有下游一键安装的根基。
- **Official MCP Registry（`registry.modelcontextprotocol.io`）及下游聚合站（Smithery、Glama、PulseMCP、MCP.so）**：Smithery 和 Glama 等大型目录会自动同步官方注册表并提供在线安全评分与托管试用。升级本仓 `server.json` 时，**同时写进 `packages`（npm + PyPI 本地离线 `stdio`）和 `remotes`（`https://dislop.com/mcp` 远程 `streamable-http`）**，让每一个抓取 `server.json` 的第三方目录都自动替我们的官方云端做免配置导流。
- **GitHub Marketplace（GitHub Action）+ `pre-commit`**：在仓库根目录或 `dislop-ai/dislop-action` 提供标准 `action.yml` 并上架 GitHub Marketplace。每次团队 PR 触发增量检查（只查本次改动的文档、前端或 PPT，输出单条可原地刷新的摘要评论或行内批注），都会让整个仓库的协作者直接看到 `dislop` 的实际检出效果，是开源工具天然裂变率最高的 B2B 入口。

---

## 3. 最佳集成效果设计：三阶段防味闭环与防冲突仓库布局

### 3.1 避免“装而不用”与“死循环扰民”的三阶段配合

同一宿主里的几个组件按动笔前、改稿中、交稿前拆开配合：

| 阶段 | 负责组件 | 具体动作与延迟/Token 约束 | 严守的体验红线 |
|---|---|---|---|
| **1. 动笔前预防** | `SKILL.md`（及各宿主 `openai.yaml` / 精简规则） | 在任务涉及文稿、README、网页 UI 或幻灯片时按需激活，提前给出 5 个维度的平实写作与界面克制准则；正文严格控制在 **`<= 2.5 KB`**，并同步在官网提供 `<= 2,600 B` 的 `/llms.txt` 静态索引契约（含 `/catalog.json`、`/tasks/*.md`、`/rules/*.md`，剔除 HTML 注释与 `fixtures.hit` 负例） | 严禁把 42 条规则完整 JSON 或 `fixtures.hit` 负例样本塞进常驻上下文（既防止在 `claude plugin details` 中拉高 Token 评分被用户嫌弃，也防止模型被负例带偏写出同类套话） |
| **2. 改稿中诊断** | 编辑器内存诊断（VS Code / Obsidian）+ MCP `dislop_check` | 编辑器端在保存或停顿 `300ms` 后直接调内存 `src/core.mjs`（耗时 `< 15ms`），红实线标 `error`、蓝虚线标 `warning`，悬停展示检查问题与 `原句 -> 改过头 -> 改干净` 对照；MCP 端默认启用**紧凑模式（`compact`）**，只回传命中行号、片段、检查问题与二阶陷阱提示，需要看完整示例时再按需调 `dislop_explain(ruleId, lang)` | 编辑器在代码块、URL、引用块与 `dislop-quote` 内严格静默零误报；MCP 响应剔除 `fixtures` 并不做冗余双语重复输出，把单次检查上下文开销压低约 70% |
| **3. 交稿/提交硬门禁** | Agent Hooks（`PostToolUse` / `Stop`）、Orca/Herdr 收口脚本、`pre-commit`、GitHub Action | 只对变更的 `.md/.mdx/.txt/.html/.css/.jsx/.tsx/.docx/.pptx` 运行增量检查（`< 100ms`）；**默认仅 `--fail-on error` 阻断退出**（拦住开头 AI 寒暄、未填占位符、裸 Markdown 星号、空链接 `href="#"`），把文风 `warning` 压缩成最多 3 行非阻断提醒附在末尾 | 严禁用主观文风 `warning` 强行卡死每一次文件保存或 Agent 工具调用；Agent Hook 内置熔断计数，同一文件连续拦截达 2 次后放行并提示人工介入，彻底杜绝无限改写死循环 |

### 3.2 解决多市场清单冲突的单仓目录结构

核查各平台最新 Schema 发现一处必须提前避开的硬冲突：**OpenAI / Cursor 共用的便携标准 `agent-plugins.org/1.0.0` 要求根目录 `plugin.json` 执行严格封闭顶层字段校验**（只允许 `$schema`、`name`、`version`、`description`、`author`、`homepage`、`repository`、`license`、`keywords`、`extensions` 十个键，MCP 必须独立放在根目录 `mcp.json`）；而 **Google Antigravity 的 `plugin.json`** 需要顶层 `displayName`、`logo`、`suggestedPrompts` 以及同级 `mcp_config.json`，且上架须跑 `agy plugin validate --strict`。

把两者强塞进同一个根目录 `plugin.json` 会导致一边严格校验报错、另一边丢字段。最干净的解法是**根目录守通用开放标准，平台专属扩展放各自命名空间或 `integrations/` 子目录，由构建脚本同源同步**：

```text
dislop/
├── package.json                        # npm 包与 mcpName 声明
├── pyproject.toml                      # PyPI 包声明
├── server.json                         # 官方 MCP Registry（同时含 npm/pypi stdio 与 remotes HTTP）
├── plugin.json                         # 严格遵循 agent-plugins.org/1.0.0（含 extensions.com.openai）
├── mcp.json                            # Agent Plugins 1.0 标准根级 MCP 定义
├── .mcp.json                           # Claude Code / 通用工作区兼容 MCP 定义
├── gemini-extension.json               # Gemini CLI 画廊自动抓取清单（配 GitHub Topic）
├── action.yml                          # GitHub Marketplace 增量检查 Action 入口
├── .pre-commit-hooks.yaml              # pre-commit 官方钩子声明
├── .claude-plugin/                     # Anthropic 官方目录与 Claude Code 插件包清单
│   ├── plugin.json
│   └── marketplace.json
├── .cursor-plugin/                     # Cursor 官方市场增强清单（含规则与 Hooks）
│   ├── plugin.json
│   └── marketplace.json
├── skills/
│   └── dislop/
│       ├── SKILL.md                    # 跨 75+ 宿主共享核心技能（skills.sh 索引源）
│       └── agents/
│           └── openai.yaml             # ChatGPT / Codex 卡片展示与调用策略
└── integrations/
    ├── antigravity/                    # 独立通过 agy plugin validate --strict 的伙伴提审包
    │   ├── plugin.json                 # 含 displayName、logo、suggestedPrompts
    │   ├── mcp_config.json
    │   └── README.md
    ├── vscode/                         # 零依赖 Web 兼容 VSIX（同发 VS Code 市场 + Open VSX）
    ├── orca/
    │   └── orca.yaml                   # Worktree 软链 .dislop.local.json 与收口检查模板
    ├── herdr/
    │   └── herdr-plugin.toml           # Herdr 终端面板一键去味检查与状态标记插件
    └── hooks/                          # Claude Code / Codex / Cursor 即插即用防死循环 Hook 脚本
```

为彻底消灭目前已经出现的版本号分叉（`0.2.0` / `0.3.0` / `0.4.0` / `0.5.0`），新增一个零依赖构建脚本 `scripts/sync_manifests.mjs` 并接入 CI：以单一元数据文件为准，自动刷新并校验上述全部 JSON/YAML/TOML 清单的版本号、包名（发包后统一将 `github:dislop-ai/dislop` 切换为正式 npm 包 `dislop`）与字段合法性。

---

## 4. 最大化利用流量入口：商店运营与转化漏斗

### 4.1 流量入口分级投入表（好钢用在刀刃上）

| 优先级 | 渠道名称 | 流量性质 | 获客切口与差异化卖点 | 导流终点 |
|---|---|---|---|---|
| **S 级（必争主入口）** | **VS Code Marketplace + Open VSX** | 编辑器内高频搜索 + AI 分类推荐 | 避开已拥挤的“代码复杂度检测”，主攻 `markdown`、`proofreading`、`copywriting`、`pptx`、`ui`、`anti-slop`；首屏放三态动图（`原稿 -> 改过头 -> 改干净`），内置一键连编辑器 Agent 工具 | 本地高频留存 + `Cmd+.` 可选调用 `dislop-cloud` 一键去味 |
| **S 级（必争主入口）** | **`skills.sh`（Vercel 榜单）** | 安装量实时遥测排榜 | 同榜竞品（如 `humanizer`）多为纯提示词、无验真能力；突出 **`SKILL.md` + 零依赖确定性检查器 + 112 样本 0 误报基准**，所有文档统一引导 `npx skills add dislop-ai/dislop` 集中冲榜 | GitHub Star + 本地 CLI 安装 |
| **S 级（必争主入口）** | **Claude 官方目录 + ChatGPT/Codex 通用目录 + Cursor 市场** | 顶级编码与办公 Agent 内置商店 | **本地插件包 + 官方远程 Connector 双挂**：工程师装本地开源包零上传，产品经理/写作者在网页或桌面端一键连 `https://dislop.com/mcp` 免配环境 | 开源口碑 + 云端每月 30 次免费额度注册 |
| **S 级（蓝海抢位）** | **Antigravity 市场 + Gemini CLI 画廊** | 官方商店类目空白 + 每日自动收录 | Antigravity 当前同赛道 `0` 竞品，精心打磨 3 条开箱即用 `suggestedPrompts` 与图标拿下首发心智；Gemini CLI 打上 `gemini-cli-extension` 标签自动入库 | 原生一键安装 |
| **A 级（协议分发与裂变）** | **Official MCP Registry + Smithery + Glama + GitHub Marketplace Action** | 聚合检索 + PR 协作被动曝光 | `server.json` 同时挂本地与远程端点吃透下游爬虫；GitHub Action 在 PR 评论底部留一行克制的检查统计与规则链接，让每个被审稿的协作者自然认识 `dislop` | 团队级扩散 -> Team 版与 GitHub App 预约 |
| **B 级（人群破圈）** | **Obsidian 社区插件 + Raycast Store** | 硬核写作者与效率工具重度用户 | 零配置纯本地即装即查，精准触达不写代码但天天发文章、写周报、改方案的付费高潜人群 | `dislop.com` 工作台与 Pro 订阅转化 |

### 4.2 README 与官网的“一键安装门户”改造

把目前需要用户手动复制粘贴 JSON 的说明，升级成按宿主分组的一键唤起矩阵：

1. **网页端一键协议唤起徽章**：直接生成 `vscode:mcp/install`（经 `https://vscode.dev/redirect/mcp/install` 安全跳转）与 `cursor://anysphere.cursor-deeplink/mcp/install` 两个双模式按钮（**装本地零上传版** / **连云端免环境版**），点击直接拉起 IDE 确认框。
2. **一行终端安装组**：并排给出 `npx skills add dislop-ai/dislop`、Claude `/plugin`、Codex `codex plugin`、Gemini CLI `gemini extensions install`、`npx dislop` 与 `uvx dislop`，并在官网 `/llms.txt` 与 `/tools/` 页面同步暴露给外部联网 Agent，让别的 AI 在帮用户配环境时也能直接抄对命令。
3. **开源与云端的顺滑交接（不强推、不套路）**：所有本地插件、CLI、VS Code 波浪线检查永远保持 100% 离线免费零上传；只有当用户在 VS Code 里主动点“云端改写这一段”、在网页/Cowork 里不想装 Node/Python 直接连远程 `https://dislop.com/mcp`、或者需要导出保留原排版的 `.docx`/`.pptx` 时，才自然引导领取每月 30 次免费云端额度。

---

## 5. 分阶段执行路线与验收标准

按“先清底层发包阻断、再拿核心商店首发位、接着吃透编辑器与多 Agent 编排器”拆成三步推进：

### 阶段 P0（仓库与协议层已落地，待账号侧首次发布）：清零发包阻断，完成首批 6 大目录卡位

- **已完成项（`2026-11-22` 实测通过）**：
  1. 已上线 `scripts/sync_manifests.mjs` 统一生成并校验全仓 10 份清单至 `v0.6.0`，接入 `.github/workflows/ci.yml` 与 `tests/test_site.mjs` 防漂移门禁。
  2. 已将双端本地 MCP（Node 与 Python）收口为 7 个核心离线工具，`dislop_explain` 剥离负例 `fixtures` 并支持 `lang` 单语过滤，`dislop_check` 默认切为 `verbosity: "compact"` 紧凑输出，4 个测试模块共 26 项 Python `unittest` 全绿。
  3. 已交付根目录 `plugin.json` + `mcp.json`（`agent-plugins.org/1.0.0`）、`.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`、`skills/dislop/agents/openai.yaml`、`gemini-extension.json`、`server.json`（含 `remotes`）、`action.yml`、`.pre-commit-hooks.yaml` 与自动发包工作流 `.github/workflows/release.yml`；实测通过 `claude plugin validate`（常驻仅约 `130` tokens）、隔离环境 `codex plugin add dislop@dislop-ai`、`npm pack`（目标 `< 250 KB`，硬门禁 `<= 300 KB`）与 `uv build` 独立虚拟环境安装验证，并已为 GitHub 仓库配置 `gemini-cli-extension`、`claude-code-plugin`、`agent-plugins` 等标签。
- **待本人账号侧执行（一步闭环）**：
  1. 完成首次 `npm login` / `NPM_TOKEN` 配置与 PyPI Trusted Publisher 绑定，触发 `.github/workflows/release.yml`（或本地执行 `npm publish` + `uv publish`），再运行 `node scripts/sync_manifests.mjs --channel registry` 将 MCP 默认坐标切至正式 npm 包并推送 `server.json` 至 **Official MCP Registry**（同步认领 **Smithery** 与 **Glama**）。
  2. 登录 **Anthropic 官方目录后台（`claude.ai/directory/manage`）** 提交 GitHub 插件包与 `https://dislop.com/mcp` 远程 Connector 双通道审核，并在 **OpenAI 通用插件目录** 提交审核。
- **验收证据**：`npmjs.org/dislop`、`pypi.org/project/dislop`、`registry.modelcontextprotocol.io` 与 `geminicli.com/extensions` 实测返回 HTTP 200 且一行命令可装可用。

### 阶段 P1（3–5 天）：双发 VS Code / Open VSX 扩展，落地 Antigravity、Cursor、Orca/Herdr 与 GitHub Action

- **动作清单**：
  1. 基于 `src/core.mjs` 开发零外部依赖、支持浏览器端（`vscode.dev`）的轻量扩展 `integrations/vscode/`：实现保存/空闲诊断波浪线、悬停三段示例、`dislop-ignore-next-line` 快速修复，以及 `mcpServerDefinitions` / `languageModelTools` 自动挂载；同时发布至 **VS Code Marketplace** 与 **Open VSX**。
  2. 完成 `integrations/antigravity/` 插件包（含合规方形图标与 3 条场景提示词），跑通 `agy plugin validate --strict` 零警告后提交 **Antigravity Partner Intake**；补齐 `.cursor-plugin/` 提交 **Cursor Marketplace** 与 **Cline MCP Marketplace**；在 README 与官网上线一键唤起徽章。
  3. 交付 `integrations/orca/orca.yaml`（自动软链 `.dislop.local.json` 至子 Worktree + 收口检查）、`integrations/herdr/herdr-plugin.toml`（面板一键检查动作）、防死循环 Agent Hook 脚本（`--fail-on error` + 2 次熔断），以及根仓 `action.yml`（上架 **GitHub Marketplace**）与 `.pre-commit-hooks.yaml`。
- **验收证据**：在本地 VS Code / Cursor / Antigravity 实装 `.vsix` 与插件包验证波浪线和 Agent 工具自动挂载生效；在 Git Worktree 模拟环境下验证 `.dislop.local.json` 自动继承与硬伤拦截退出码准确。

### 阶段 P2（1–2 周）：扩圈写作与桌面效率商店，建立渠道数据复盘

- **动作清单**：
  1. 复用 `src/core.mjs` 打包上架 **Obsidian Community Plugins**（提交 `obsidianmd/obsidian-releases` PR）与 **Raycast Store**（提交 `raycast/extensions` PR）。
  2. 在 `Awesome Anti-Slop` 与各平台插件详情页之间建立双向互链，按双周跟踪各渠道真实漏斗指标：npm / PyPI 周下载量、`skills.sh` 安装排名、VS Code + Open VSX 活跃安装数、各商店带来的 GitHub Star 增量，以及远程 `https://dislop.com/mcp` 的免费 Token 激活与留存率，淘汰长期无自然流量的边缘目录维护项。
