# `awesome-anti-slop` 纳入 `dislop` 产品体系的载体形态与拓扑架构设计

> 文档状态：暂缓拆仓预案（历史架构提案） · 核验基准日：2026-11-23
>
> 关联文档：[ROADMAP.zh-CN.md](../../ROADMAP.zh-CN.md) · [anti-slop-radar-index.json](./anti-slop-radar-index.json) · [anti-pattern-detection-and-catalog.zh-CN.md](./anti-pattern-detection-and-catalog.zh-CN.md) · [multi-surface-integration-architecture.zh-CN.md](./multi-surface-integration-architecture.zh-CN.md)
>
> 配套草案：[radar-v3-contract.json](./awesome-anti-slop-topology/radar-v3-contract.json)（`dislop.radar/3` 契约示例） · [mvp-starter-templates.md](./awesome-anti-slop-topology/mvp-starter-templates.md)（目录树、CI 流水线、Issue/PR 模板与同步脚本边界）

## 核心结论（冷启动期单仓优先，达阈值再拆仓）

> [!IMPORTANT]
> **执行时序结论**：经早期流量、星标动量与维护带宽复盘，**当前冷启动阶段暂不拆分独立 `awesome-anti-slop` 仓库**。90 条精选条目继续留在 `dislop-ai/dislop` 主仓，由构建脚本离线编译至统一规范入口 `https://dislop.com/awesome/`（与英文入口 `https://dislop.com/en/awesome/`）以及仓库 `awesome/` 目录，让所有搜索反 AI 味清单的访客直接为主仓积累星标，并自然转化至在线工作台、指南、规则页与 CLI/MCP。本文保留的方案 D 与 `dislop.radar/3` 契约作为**触发式拆仓预案**——当目录条目数达到 `>= 150 条`、或外部有效目录 PR 持续 `>= 20 条/月` 且社区维护者明确需要独立 CC0 中立仓时，再按以下设计无损切出，同时 `dislop.com/awesome/` 规范 URL 权重零损失。

远期目标拓扑为 **方案 D（独立 `dislop-ai/awesome-anti-slop` 仓库 + `dislop.com/awesome/` 人机双读目录 + 主仓 `dislop-ai/dislop` 双向联动）**。经 8 组真实开源项目实测复盘，在社区投稿进入高频阶段后，`awesome-*` 独立仓库承担 GitHub 搜索入口、星标复利与外部 PR 协作，官网静态目录承担多维筛选、SEO/GEO 与 Agent 消费（`/llms.txt` + `/awesome/index.json`），主工具仓保持内核纯净与议题零噪音。三者由同一份结构化数据驱动，避免手工双份维护。

当前存在清晰的命名空间窗口。2026-11-21 GitHub Search API 实测显示，全站匹配 `awesome-anti-slop` 的公开仓库仅 3 个（最高 12★），匹配 `awesome-deslop` 为 0 个，`awesome-slop` 最高仅 28★（且为反讽列表）。`dislop` 手握 90 条已核验的跨媒介双语索引，待达到触发阈值后具备以 `dislop-ai/awesome-anti-slop` 建立品类独立索引的先发条件。

在工程实现上，既有单文件 `anti-slop-radar-index.json` 在主仓阶段已提供静态筛选目录 `dislop.com/awesome/` 与 Issue 表单（`awesome_submission.yml`）；触发拆仓后，可进一步演进为 `dislop.radar/3` 拆条目目录（`data/entries/<id>.json`）。每条资源独立成文件，从根源消除多人并行 PR 的合并冲突。零依赖构建脚本自动生成 `README.md`、`README.zh-CN.md`、`dist/awesome.json` 与 `dist/llms.txt`，并通过固定版本快照同步至 `dislop.com/awesome/`，保持官网离线查看与本地测试零外链（`CSP: connect-src 'self'`，仅保留同源云端端点与离线静态构建）。

该设计完整吸收了早期战略复盘对「中立性损耗」「精力分散」「死链积压」的判断：通过公开伦理分区、`dislop` 客观平等入列、禁止商业横幅以及「CI 只查结构不审文风」守住公信力，并把稳态人工投入锁死在每周 `<= 45` 分钟。同时以离线可复算的事实保留与二阶漂移基准，提供 `skills.sh` 无法替代的选型信号。若拆仓后 12 周外部有效 PR 低于 5 条，则平滑转入月度自动巡检的低功耗快照模式，零重构保留已积累的 URL、星标与搜索权重。

分阶段时序已对齐当前冷启动事实：先在主仓稳定维护 `awesome/`、`dislop.com/awesome/`、`/guides/`、`/rules/` 与 `v0.7+` CLI/MCP，待达到触发门槛后再在独立仓 `dislop-ai/awesome-anti-slop` 发布 `v0.1.0` 并切出快照同步。

---

## 1. 真实开源先例复盘（8 组跨领域项目实测拆解）

为避免凭直觉照搬历史经验，本节于 **2026-11-21** 通过 GitHub REST API 与仓库目录直查，核验了覆盖前端/设计、开发者工具、AI/Agent 与自托管 4 个领域的 8 组典型开源先例（同时覆盖正面样本与反面踩坑案例）。

### 1.1 八组先例实测对比矩阵

| 领域与代表项目 | 拓扑形态 | 2026-11-21 实测数据（主仓 vs Awesome 仓） | 数据源与自动化治理机制 | 实战成败与核心启示 |
|---|---|---|---|---|
| **1. Vite & Vue & Tauri**（前端/跨端基建） | **组织内独立 Awesome 仓** + 主仓 + 官网文档 | `vitejs/vite` 84,008★ vs `vitejs/awesome-vite` 17,301★（160 issues）<br>`vuejs/vue` 212,515★ vs `vuejs/awesome-vue` 73,469★（114 issues）<br>`tauri-apps/tauri` 113,034★ vs `tauri-apps/awesome-tauri` 8,183★（40 issues） | 同属官方 GitHub Org；仓库轻量，仅配 `lint.yml` / `readme-lint-double-link.yml` / `toc.yml`；页头仅克制说明「A curated list related to X」 | **官方组织建独立 Awesome 仓完全可建立社区信任**。关键在于克制页头、零商业追踪链接、严控积压（3 仓开放议题均在百级以内），均被 `sindresorhus/awesome` 收录。 |
| **2. awesome-selfhosted**（自托管目录标杆） | **SSOT 数据仓 -> 自动生成 Awesome 仓 + 静态官网** | `awesome-selfhosted` 339,051★（**0 open issues**）<br>`awesome-selfhosted-data` 1,233★（225 issues）<br>官网 `awesome-selfhosted.net` | 每条软件独立 YAML 文件（`software/*.yml`）+ 5 条 GitHub Actions（`build.yml`、`check-dead-links.yml`、`check-unmaintained-projects.yml`、`daily-update-metadata.yml`、`pull-request.yml`） | **SSOT 自动渲染的天花板**。单条目独立文件彻底消除 PR 冲突，展示仓保持 0 积压。但对百级规模项目，拆成两座独立目录仓偏重，合并为单仓内「`data/entries/` -> 自动渲染」性价比更高。 |
| **3. shadcn/ui 社区**（前端 UI 设计） | 主仓 + **社区独立 Awesome 仓兼伴生检索站** | `shadcn-ui/ui` 128,663★ vs `birobirobiro/awesome-shadcn-ui` 20,844★（50 issues）<br>伴生站 `awesomeshadcn.dev` | 单仓同时承载 `README.md` 与 Web 目录代码；4 条工作流（`add-dates.yml`、`format-readme.yml`、`link-check.yml`、`update-stars.yml`）+ `.lycheeignore` | **GitHub 列表 + 可筛选官网目录协同的典范**。GitHub 接住搜索与星标，Web 端补足按分类/星标/更新日期的检索体验，4 条轻量脚本把开放议题控制在 50 条。 |
| **4. MCP 协议生态**（AI/Agent 基础设施） | 主仓剥离列表 vs **独立 Awesome 仓 + 商业目录站** | `modelcontextprotocol/servers` 92,140★（**11 issues**）<br>`punkpeye/awesome-mcp-servers` 98,336★（**4,972 issues**）<br>目录站 `glama.ai/mcp/servers` | 官方仓主动把第三方列表迁出到独立注册中心与外部目录；`awesome-mcp-servers` 长期直改 Markdown 并向 `glama.ai` 导流 | **反面与正面同框的教科书案例**。官方仓靠剥离社区清单守住 11 条议题的极低噪音；`awesome-mcp-servers` 虽拿近 10 万星，但缺乏自动分流导致 4,972 条 PR/Issue 堵塞，且伴生商业站引发社区中立性争论。 |
| **5. Claude Code 社区**（AI 编程宿主） | **结构化数据 SSOT + Issue 表单机器人自动建 PR** | `hesreallyhim/awesome-claude-code` 58,483★（1,309 issues） | 核心数据源 `THE_RESOURCES_TABLE_NEW.csv` + `generate_readme.py` + 5 条工作流（`validate-new-issue.yml`、`handle-resource-submission-commands.yml`、`regenerate-readme.yml`、`update-repo-ticker.yml`） | 证明**非开发者也能通过 Issue 表单零门槛投稿并由机器人生成结构化条目**；但也警示，即便全自动生成，若缺少严格准入阈值与过期自动关闭机制，高热赛道仍会堆积 1,300+ 开放议题。 |
| **6. 工具商主导的 AI Awesome 仓**（VoltAgent / Composio / E2B） | **厂商 Org 下独立 Awesome 仓为自家主工具导流** | `VoltAgent/awesome-agent-skills` 37,400★（42 issues）vs 主仓 11,000★（**3.4x**）<br>`ComposioHQ/awesome-claude-skills` 79,970★（1,912 issues）vs 主仓 31,216★（**2.6x**）<br>`e2b-dev/awesome-ai-agents` 31,012★（1,345 issues）vs 主仓 14,950★（**2.1x**） | `VoltAgent` 仅首页横幅温和指向主仓且人工控流（42 issues）；`ComposioHQ` 顶部挂带 UTM 的 SaaS 登录页横幅且仓内放可执行技能目录；`e2b-dev` 零 CI，仓内残留 `.DS_Store` 与 `TBD` 注释 | 证实**组织自建 Awesome 仓的拉新放大倍率可达主工具仓的 2–3.4 倍**。同时暴露两类明确踩坑：`ComposioHQ` 的登录页 UTM 横幅与缺失 SPDX 许可证损耗中立信任；`e2b-dev` 的「建完不管」酿成 1,345 条死积压。 |
| **7. Vale & Astro**（文档 Linter 与静态站） | **仅官网交互目录 / 机器注册表**（无官方 Awesome 仓） | `vale-cli/vale` 6,413★ + `errata-ai/packages` 129★（0 issues）+ `vale.sh/hub`<br>`withastro/astro` 64,096★ + `astro.build/integrations` vs 民间 `one-aalam/awesome-astro` 958★（98 issues） | `errata-ai/packages` 以 `library.json` 驱动 CLI `vale sync` 与官网 Hub；Astro 官网集成目录直接由 npm 元数据构建 | **纯官网目录与机器注册表的增长上限实证**。`vale` 与 `dislop` 品类最接近，其 Hub 在产品内体验顺滑，但因放弃 `awesome-*` 命名与社区策展形态，`errata-ai/packages` 仅 129★，`one-aalam/awesome-astro` 停在 958★，完全错失 GitHub 发现飞轮。 |
| **8. ESLint & sindresorhus**（老牌 Linter 与总规范） | 主工具仓 + 独立 CC0 Awesome 仓 + 总榜规范 | `eslint/eslint` 27,639★ vs `dustinspecker/awesome-eslint` 4,779★（23 issues，CC0-1.0）<br>`sindresorhus/awesome` 540,121★ · `awesome-nodejs` 67,582★（25 issues） | 遵循 Awesome Manifesto：CC0 协议、30 天存活期门槛、客观功能描述、零广告词、`awesome-lint` 自动校验；面对垃圾 PR 宁可阶段性收紧也不放水 | 确立长期公信力的四条硬纪律：**开放数据协议（CC0/CC-BY）、事实型单句摘要、客观准入门槛、自动化格式与死链防线**。 |

### 1.2 从八组先例提炼的五条实战规律

第一，GitHub 搜索与星标漏斗存在显著的「命名协议红利」。开发者在 GitHub 检索某一垂直主题时，习惯直接输入 `awesome-<topic>`。同样是生态目录，带 `awesome-*` 命名的独立仓库星标量级普遍是纯机器注册表（如 `errata-ai/packages` 129★）的 30 倍以上，且在 AI 工具领域（VoltAgent、E2B、Composio）其星标数反向达到主工具仓的 2.1–3.4 倍。

第二，外部 PR 协作遵循「公共广场效应」而非「竞品客场效应」。其他去 AI 味工具作者（例如 `humanizer`、`impeccable`、`sloptrim`、`lieflat-less-ai-tone` 的维护者）愿意把项目提交到公共索引仓 `awesome-anti-slop` 换取曝光，却极少向竞品主工具仓的子目录 `dislop/docs/research/` 提交自荐 PR。

第三，官方组织归属与中立性可以共存，分水岭在「披露透明 + 克制导流」。`vitejs/awesome-vite`、`vuejs/awesome-vue` 与 `tauri-apps/awesome-tauri` 全部建在官方组织下，依然获得高信任度并入选 `sindresorhus/awesome`；真正引发反感的从来在于 `ComposioHQ` 式的强制登录 UTM 横幅或把竞品打上主观差评标签，而与组织名本身无关。

第四，纯手工编辑 Markdown 必然在百级 PR 后崩溃。`punkpeye/awesome-mcp-servers`（4,972 issues）、`ComposioHQ/awesome-claude-skills`（1,912 issues）与 `e2b-dev/awesome-ai-agents`（1,345 issues）无一例外栽在「单文件 README 冲突 + 缺自动初筛」。反观 `awesome-selfhosted-data`（单条目文件 + 5 条 Action）与 `birobirobiro/awesome-shadcn-ui`（4 条定时/PR Action），把积压稳定压在两位数甚至零。

第五，高粘性 Awesome 仓都有「纯链接之外的增量资产」。`awesome-selfhosted` 提供多维筛选官网与活跃度状态，`awesome-claude-code` 提供结构化分类与一键验证，`VoltAgent/awesome-claude-design` 提供可直接复用的 `DESIGN.md`。对 `awesome-anti-slop` 而言，这份增量资产就是跨媒介结构化筛选、Agent 原生可读接口（`llms.txt` / JSON），以及可复算的离线改稿评测基准。

---

## 2. 四种载体拓扑深度对比与选型决策

### 2.1 四种方案七维对比矩阵

| 评估维度 | 方案 A：仅官网 `dislop.com` 资源板块 | 方案 B：`dislop` 主仓子目录（Monorepo） | 方案 C：仅独立仓 `dislop-ai/awesome-anti-slop` | 方案 D（推荐）：独立 Awesome 仓 + 官网双读目录 + 主仓双向联动 |
|---|---|---|---|---|
| **GitHub 搜索与星标漏斗** | 极弱。脱离 GitHub 站内搜索与 Star/Fork 社交传播（参见 `errata-ai/packages` 129★） | 弱。仓库名为 `dislop`，搜 `awesome-anti-slop` 几乎不可见，无法申报 `sindresorhus/awesome` | 强。直占 `awesome-anti-slop` 空白命名空间，承接 GitHub 搜索与星标复利 | **最强**。GitHub 站内漏斗与搜索引擎/官网漏斗双线并收 |
| **外部社区 PR 心智** | 高摩擦。无原生 GitHub PR/Issue 协作入口，用户提交只能走邮件或外链表单 | 低意愿。第三方工具作者视其为竞品主仓子目录，自荐动力差；且易受主仓代码 CI 牵连 | 强。契合开源开发者对 `awesome-*` 仓库的直觉投稿习惯 | **最强**。GitHub 侧开放标准化 PR 与 Issue 表单，官网侧提供一键「提交新资源 / 纠错」直达 GitHub |
| **主仓工程噪音隔离** | 强。完全不影响主仓代码提交与 Issue | **极差**。外链投稿、死链修复、星标刷新会污染主仓 Commit 历史、Watch 通知与 Release 变更日志 | 强。主仓专注零依赖双端引擎与 `packs/` | **强**。主仓仅通过固定版本快照消费数据，提交与议题完全隔离 |
| **交互检索与 SEO/GEO（含 Agent 读取）** | 强。支持多维筛选、结构化 JSON-LD、`llms.txt` 与独立页面收录 | 弱。GitHub Markdown 表格无法多维过滤，对搜索引擎外链权重也归属 `github.com` 而非 `dislop.com` | 弱。静态长 Markdown 难以按「媒介 × 语种 × 阶段 × 确定性检查」组合筛选，也不自带官网 `/llms.txt` 路由 | **最强**。`dislop.com/awesome/` 提供零后端多维过滤、双语切换、`/llms.txt`、`/awesome/index.json` 与 `/awesome/index.md` |
| **工程维护成本** | 中低。全量变更只需改一套静态构建脚本 | 低（初期），中后期高。初期省去跨仓同步，但 PR 冲突与主仓 CI 耗时叠加 | 低。单仓自动化即可，但缺官网展示转化 | **可控（初期 2–3 天，稳态 <= 45 分钟/周）**。单源自动同步消除人工搬运，只在建仓与打通 `repository_dispatch` 时有一次性工程成本 |
| **中立性治理与信任建立** | 中。托管在商业或产品主域名下，外部作者常将其理解为产品附属文档 | 弱。夹在主工具仓内，天然带着「竞品对比附表」色彩 | 较强。采用独立中立宪章与 CC0 协议，可参照 `vitejs/awesome-vite` 建立行业信任 | **强（前提是执行中立隔离规范）**。独立仓用 CC0 开放数据协议 + 平等入列；官网 `/awesome/` 明确标注数据来源与开放协议 |
| **与 `dislop` 核心壁垒协同** | 强。用户看完目录可一键跳回首页清样工作台试用 | 中。方便仓内脚本引用，但难以形成外部品牌势能 | 中。只能靠 README 温和外链导流 | **最强**。GitHub 捕获认知 -> `dislop.com/awesome/` 完成对比选型 -> 零上传清样工作台 & 离线 `verify` 基准承接转化 -> 优质语料反哺 `packs/` |

### 2.2 明确选型结论与取舍理由

**当前与远期分工：冷启动期采用「方案 B + A 混合单仓双读」（主仓承载结构化数据并同时编译 GitHub `awesome/` 与官网 `/awesome/`）；达到触发阈值后再平滑切换为「方案 D」（三位一体独立仓）。**

完全放弃方案 A（仅官网）的原因很直接：对开发者与 AI Agent 建设者而言，GitHub 是开源工具的第一信任锚点。长期纯靠静态官网目录、不提供 GitHub 清单入口，容易重演 `errata-ai/packages`（129★）与 `one-aalam/awesome-astro`（958★）在发现层失声的结局。

冷启动期先以主仓目录配合 `dislop.com/awesome/` 承接流量，原因在于先把搜索「awesome anti-slop」的用户与 Star 势能集中到主仓 `dislop-ai/dislop`；待条目规模达到 `>= 150 条` 或外部有效投稿持续 `>= 20 条/月`（或出现首批第三方竞争工具维护者自荐 PR 诉求）时，再按方案 D 无损拆出独立仓，以免主仓提交历史和 Issue 队列被外部死链巡检与格式化 PR 噪音淹没。

不满足于纯 GitHub 列表的原因在于既有基础设施的复利。`dislop` 已经拥有零后端静态站架构（`dislop.com` 统一静态源站）和 90 条带四维标签的结构化索引。把这份结构化 JSON 只渲染成一堵 GitHub Markdown 墙，等于白白放弃了「按媒介/语种/介入阶段/确定性检查即时筛选」的交互体验，也放弃了 `dislop.com/llms.txt` 与 `/awesome/index.json` 的 GEO/Agent 入口红利。

同时，单源渲染双端的工程量极低。在零依赖 Node 20+ 体系下，从结构化 JSON 编译静态目录页与 `llms.txt`，仅需一套共享数据管线与既有设计 Token（复用 `site/styles.css`），无需引入框架或后端服务。

### 2.3 零重构渐进演进路径（冷启动 -> 成长期）

为避免「还没跑出外部贡献就先维护两个仓库」的过早拆仓负担，同时保证未来切出时 URL 与数据契约零推翻，方案按三个冷启动至今的真实阶段推进：

| 阶段 | 启动时机 | 交付内容与架构状态 | 为什么此顺序做到切换零重构 |
|---|---|---|---|
| **Phase 0–1：主仓双读冷启动（已落地）** | 当前冷启动期（条目 `< 150`、月均外部 PR `< 20`） | 结构化索引留在 `dislop` 主仓（现已扩充至 90 条），由 `scripts/build_site.mjs` 同源编译为仓内 `awesome/`、官网 `/awesome/` + `/en/awesome/` + `index.json` / `index.md`，以及 `site/llms.txt`；配齐 `.github/ISSUE_TEMPLATE/awesome_submission.yml` | 全站继续保持静态构建与 `CSP: connect-src 'self'`；所有条目复用统一 ID 与语义分组，后续切出到独立仓时仅改数据来源路径，官网规范 URL `/awesome/` 与权重零损失 |
| **Phase 2：触发式独立仓切出（预案）** | **触发门槛**：目录条目 `>= 150 条`，或外部有效目录 PR 持续 `>= 20 条/月` | 创建公开仓 `dislop-ai/awesome-anti-slop`，按 `dislop.radar/3` 契约迁出 `data/entries/<id>.json`，配英文主 `README.md` + `README.zh-CN.md`、CC0-1.0 协议与 4 条自动化 GitHub Actions；发布 `v0.1.0` 并通过 `repository_dispatch` 向主仓同步只读快照 | 拆仓前的数据已按标准 ID 与双语摘要整理完毕，迁出后无需重造 Schema；`dislop` 主仓切换为读取版本化只读快照继续离线构建 `/awesome/`，不打破任何测试与 CSP 约束 |
| **Phase 3：基准护城河与语料反哺（持续）** | 离线评测基准扩充期 | 在条目 Schema 中启用可选 `benchmarkRef` 字段，展示可复算的「二阶漂移率 / 数字保留率」实测链接；按季度从 `corpus-source` 标签条目中筛选规则样本反哺 `dislop` `packs/` 与 `dislop catalog` | 纯增量可选字段，旧条目无需改动即可平滑兼容；目录由此从「静态外链清单」跃升为「带公开实测证据的行业参考系」 |

---

## 3. 双仓互动与「官网 + GitHub」单一事实源工程设计

### 3.1 总体数据流与单源多端拓扑

整个体系坚持**「一处写入、多端编译、快照解耦、离线可测」**四条原则：

```text
                外部贡献者 (GitHub PR / Issue Form) & 维护者
                                     │
                                     ▼ (仅编辑单条目 JSON，杜绝单文件合并冲突)
┌────────────────────────────────────────────────────────────────────────────┐
│  仓库 1：dislop-ai/awesome-anti-slop（单一事实源 SSOT · CC0-1.0 数据协议）   │
│  ├── data/taxonomy.json          (8 大分类、媒介、语种、阶段、形态权威枚举)  │
│  ├── data/entries/<id>.json      (每条资源 1 个独立 JSON，遵循 dislop.radar/3)│
│  ├── scripts/validate.mjs        (Schema + 去重 + 中立措辞 + URL 规范校验)   │
│  ├── scripts/build.mjs           (零依赖 Node 20+ 编译器)                   │
│  │     ├──> README.md            (英文主视图，自动生成，禁止手改)            │
│  │     ├──> README.zh-CN.md      (中文镜像视图，自动生成，禁止手改)          │
│  │     ├──> dist/radar.json      (全量合并机读索引 + SHA-256 校验和)         │
│  │     ├──> dist/llms.txt        (轻量路由地图，供 Agent 低 Token 发现)      │
│  │     └──> dist/llms-full.txt   (紧凑纯文本目录，供 Agent 单次全量读取)     │
│  └── .github/workflows/          (PR 校验 / 合并重编 / 周度巡检 / 过期清理)  │
└─────────────────────────┬──────────────────────────────────────────────────┘
                          │ (合并到 main 后触发 repository_dispatch，
                          │  携带 commit SHA + dist/radar.json 校验和)
                          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  仓库 2：dislop-ai/dislop（主引擎仓 · Apache-2.0 · 离线零依赖）              │
│  ├── vendor/radar-snapshot.json  (自动化 bot PR 同步的只读版本化快照)        │
│  ├── scripts/build_site.mjs      (离线静态编译：core.mjs + packs + radar)    │
│  │     ├──> site/index.html      (清样工作台首页，离线 CSP 锁定)           │
│  │     ├──> site/awesome/        (交互多维筛选目录 + index.json / index.md)  │
│  │     └──> site/llms.txt        (全站路由地图：工作台 + CLI/MCP + 规则 + 清单)│
│  └── packs/*/pack.json & benchmarks/ (按季度吸收高价值语料与离线实测基准)    │
└─────────────────────────┬──────────────────────────────────────────────────┘
                          │ (静态源站部署，零后端目录请求)
                          ▼
        https://dislop.com/awesome/  （统一规范主站，中英文独立路径）
```

### 3.2 关键工程决策说明

1. **为什么把单文件 JSON 改为「单条目独立 JSON（`data/entries/<id>.json`）」**：
   现有 `anti-slop-radar-index.json` 超过千行。触发独立仓拆分后，如果外部贡献者直接修改同一个大数组文件，只要一周内有 3 个 PR 并行打开，第 2 个和第 3 个 PR 必然出现尾部逗号与行号冲突。参照 `awesome-selfhosted-data/software/*.yml` 的实战经验，拆分为 `data/entries/<id>.json` 后，每份文件仅 15–25 行，任意数量的新增 PR 互不冲突；合并后再由 `scripts/build.mjs` 按固定排序规则编译出单文件 `dist/radar.json` 与 `README.md`，同时满足「人类写得顺」和「机器读得快」。
2. **为什么采用「固定快照同步」而非构建时实时拉取外网**：
   `dislop` 的 `AGENTS.md` 明确规定单测与构建保持离线确定性，且 `site/` 严格锁定 `CSP: connect-src 'self'`（本地检查与目录筛选零外域请求）。如果 `dislop` 主仓在 `build_site.mjs` 里实时调用 `fetch("https://raw.githubusercontent.com/...")`，一旦 GitHub 网络波动或限流，主仓发版就会无故失败。待未来拆仓后，由 `awesome-anti-slop` 通过 `repository_dispatch` 推送提交 SHA 与校验和，主仓校验后更新只读快照并提 PR。主仓日常测试与网站构建始终 100% 离线。
3. **Agent 与 GEO 双读设计（`llms.txt` + `.md` + JSON）**：
   - 在 `https://dislop.com/llms.txt` 遵循 `llmstxt.org` 规范，以 H1 站点名、单句事实摘要和按用途分组的 Markdown 链接列出全站核心入口（清样工作台、CLI/MCP 接入文档、指南页、规则目录以及 `/awesome/index.md` 与 `/awesome/index.json`），方便 Coding Agent 与检索 Agent 用极低 Token 完成路由。
   - 在 `site/awesome/index.html` 的 `<head>` 中声明 `<link rel="alternate" type="text/markdown" href="/awesome/index.md">` 与 `<link rel="alternate" type="application/json" href="/awesome/index.json">`，兼顾人类读者与自动化检索。
   - 前端筛选逻辑完全用零依赖原生 ES 模块直接 `import` 预编译的同源脚本，从而做到 **0 运行期目录 fetch 请求、100% 兼容 `connect-src 'self'` 离线约束**；同时保留 `/awesome/index.json` 与 `/awesome/index.md` 供外部工具与 Agent 直接读取。

### 3.3 `dislop.radar/3` Schema 演进设计

在 100% 向后兼容现有 90 条索引字段的前提下，`dislop.radar/3` 仅增补 6 类必要运营与双语字段（完整示例见 [radar-v3-contract.json](./awesome-anti-slop-topology/radar-v3-contract.json)）：

| 字段 | 类型 / 枚举 | 工程用途 |
|---|---|---|
| `summaryEn` / `summaryZh` | `string`（各限 `<= 160` 字符 / `<= 90` 汉字） | 支撑英文主站面向全球开发者推广，同时保留高质量中文目录，强制单句客观机制描述 |
| `kind` | `software \| skill-doc \| research-policy \| directory` | **支撑两档生命周期巡检**：避免把长期稳定可用的纯文档技能（如 `stop-slop`）或经典论文按「18 个月无代码提交」误判为废弃软件 |
| `status` | `active \| historical-baseline \| stale \| archived \| contrast-watch` | 显式机器可读状态；凡规避检测/去水印类工具固定标为 `contrast-watch` 并归入隔离分栏 |
| `addedAt` / `verifiedAt` | `YYYY-MM-DD` | 记录入榜日期与最近一次 CI 自动核验日期，支撑排序与死链双次确认窗口 |
| `tags` | `string[]`（受控词表，最多 5 个） | 例如 `corpus-source`、`empirical-study`、`sarif`、`stop-hook`、`bilingual`，用于精准筛选和季度反哺检索 |
| `benchmarkRef`（可选） | `{ suite, url, measuredAt } \| null` | Phase 3 预留接口，指向公开可复算的离线评测结果页，**绝不在条目 JSON 中存主观星级或相对 `dislop` 优劣评语** |

### 3.4 双仓高质量联动与中立治理协议

双仓之间既要顺畅连接 GitHub 发现、官网筛选与清样工作台试用，又要严守开源社区的审美与边界感：

1. **双向导航边界（温和归属，拒绝硬广）**：
   - **`dislop-ai/awesome-anti-slop` -> `dislop`**：
     - 页头副标题仅一行克制说明：`Maintained by dislop-ai · Open CC0-1.0 dataset · Interactive web filter & llms.txt at dislop.com/awesome/`；严禁放置带 UTM 追踪参数的登录横幅或「推荐首选」置顶广告位。
     - `dislop` 本身严格按客观分类进入确定性工具分栏，按与其他条目完全一致的排序规则（如按字母或按客观星标/机制分组）排列，仅加注客观括号标识 `(maintained by this list's host org)`，信息透明度拉满。
   - **`dislop-ai/dislop` -> `awesome-anti-slop`**：
     - 主仓 `README.md` / `README.zh-CN.md` 挂接 `awesome/` 与 `dislop.com/awesome/`（触发拆仓后指向 `dislop-ai/awesome-anti-slop`），说明 `dislop` 聚焦「印前确定性检查与改稿守卫」，并客观指引用户在目录中按需组合上游 Prompt 技能、模型层工具或代码 Linter。
     - 官网 `site/index.html` 顶栏设导航入口「工具清单 / Awesome」（指向 `/awesome/` 与 `/en/awesome/`），不抢占首屏清样工作台的视觉权重。
2. **投稿双轨制（PR + Issue Form）与四条自动门禁**：
   - **开发者通道**：Fork 后新增 `data/entries/<id>.json` 并提交 PR，无需修改 `README.md`（PR 模板明确提示禁止手改生成产物）。
   - **非开发者通道**：填写 GitHub Issue Form（`submit-resource.yml`），输入 URL、分类、媒介、语种与一句机制描述，由机器人校验后自动生成结构化 PR（借鉴 `hesreallyhim/awesome-claude-code` 的低门槛经验）。
   - **四条 GitHub Actions 自动守卫**（模板见 [mvp-starter-templates.md](./awesome-anti-slop-topology/mvp-starter-templates.md)）：
     1. `pr-validate.yml`：校验 JSON Schema、规范化 URL 防重复（去尾斜杠、统一小写主机名、识别 `www.` 与 `.git` 变体）、检查 HTTP 200 可达性、校验仓库存活满 14–30 天或具备可验证公开产出、拦截常见营销形容词（如 `revolutionary`、`best-in-class`、`#1`）；**明确不对他人条目简介施加 `dislop` 主观文体包（`business-brief` / `literary-essay`）惩罚**，仅对自动生成的 `README.md` 运行 `dislop check README.md --pack core --fail-on error`，确保零本地路径、零占位符与零对话残迹。
     2. `build-and-sync.yml`：合入 `main` 后自动执行 `scripts/build.mjs` 重新生成中英文 `README`、`dist/radar.json` 与 `dist/llms.txt`，校验并提交产物，随后通过 `repository_dispatch` 通知 `dislop` 主仓拉取新快照。
     3. `weekly-health.yml`：每周定时执行（`cron`），通过 GitHub API 刷新星标、最近推送日期、归档状态与真实 SPDX 许可证，并运行 `lychee` 死链扫描；连续 2 次（间隔 7 天）返回 `404/410` 才自动标记待处理，避免临时网络抖动误杀；按 `kind` 分档执行生命周期规则（软件类超过 18 个月无提交标 `stale`，纯文档技能与经典论文标 `historical-baseline`）。
     4. `triage-hygiene.yml`：对未按模板填写、缺公开 URL 或 30 天无响应的草稿 PR/Issue 自动提示并温和关闭，防止步 `e2b-dev`（1,345 issues）与 `awesome-mcp-servers`（4,972 issues）的后尘。
3. **从目录到产品护城河的三条反哺链路**：
   - **反模式规则源回流（对接 [anti-pattern-detection-and-catalog.zh-CN.md](./anti-pattern-detection-and-catalog.zh-CN.md)）**：在目录中带有 `corpus-source` 或 `empirical-study` 标签的新条目（如新发表的风格计量论文、跨模型对照语料、高星前端规则集），自动汇总进季度复盘 Issue，由 `dislop` 维护者抽样验证误报率后转化为 `packs/*/pack.json` 新规则或 `dislop catalog` 词条。
   - **正向写作与设计基准库**：目录的 `standards-research-policy` 分栏与高星写作/编辑部手册作为 `dislop` 负样本之外的「纯人类高质对照语料源」，直接用于校验 `packs/` 的误报基线（`core` 0 误报，文体包低误报）。
   - **离线实测基准联动**：依托已落地的 `dislop-bench v2`（`Suite A` 检出与 `Suite B` 改稿漂移/数字保真双轨基准），目录中受测的改写技能与工具可通过 `benchmarkRef` 链接至可复算的客观指标页。这使得 `awesome-anti-slop` 拥有其他纯链接目录与 `skills.sh` 榜单都没有的硬数据壁垒，同时也以最自然、无推销感的方式展示 `dislop` 多维确定性评测的技术价值。

---

## 4. 与既有策略文档的衔接、风险兜底与 MVP 启动清单

### 4.1 正面化解既有研报指出的四项核心风险

早期战略复盘提出的审慎判断建立在真实数据之上，本预案针对每条风险落了具体的工程与治理机制：

| 既有研报指出的真实风险 | 风险根因 | 方案 D 的工程与治理化解措施 |
|---|---|---|
| **风险 1：「运动员兼裁判」损害中立公信力** | 工具商办目录时，常出现自家置顶、拿自家规则卡竞品 PR、用主观标签贬低对手 | ① 数据仓库采用 `CC0-1.0` 开放协议并公开《中立治理宪章》；② `dislop` 客观平等入列并标明维护方身份；③ CI 门禁明确禁止对第三方条目简介启用 `dislop` 文体包，只查客观 Schema/去重/可达性；④ 竞品定位对比留在主仓调研报告，绝不写入 `dislop.radar/3` |
| **风险 2：维护精力分散，拖慢核心引擎迭代** | 手工改 Markdown、逐条核查链接、回应海量低质 PR 会吞噬小团队时间 | ① **先后秩序锁死**：冷启动期维持单仓，达到触发阈值（`>= 150 条`或外部有效 PR `>= 20 条/月`）后再拆仓；② **单条目 JSON + 4 条全自动 Action** 接管 90% 机械工作（格式化、去重、死链、星标更新、官网同步）；③ 设立**每周 45 分钟固定审稿窗口**（批量合并 CI 全绿 PR），严禁随时响应打断核心研发 |
| **风险 3：沦为死链僵尸列表或千条 PR 积压墓地** | 缺持续巡检导致 404 遍地，或如 `e2b-dev` / `awesome-mcp-servers` 积压数千未处理议题 | ① `weekly-health.yml` 自动双次确认死链与上游归档状态；② 区分 `software` 与 `skill-doc`/`research-policy` 两档生命周期，既清死链又不误杀经典规则；③ `triage-hygiene.yml` 自动清理格式不合规与 30 天无响应投稿；④ 任何 PR 未过机器初筛不进入人工队列 |
| **风险 4：纯链接墙体量有限，冷启动回报不及预期** | `skills.sh` 与综合技能大榜已承接基础查找流量，纯搬运链接信息增益低 | ① 面向全球英文检索首发（现有 90 条中英双语化），直接覆盖跨媒介（文稿 + UI + Office/PDF + 代码 PR 治理），切入 `skills.sh` 覆盖薄弱的「交付物印前与跨模态反模式」空白；② Phase 3 叠加离线 `verify` 实测基准列，创造注册中心缺失的一手数据；③ 设定**12 周低功耗降级阈值**：若拆仓后 12 周外部有效 PR `< 5`，自动把定时巡检降频为月度运行，进入「零人工负担的季度快照 + 基准落地页」模式 |

### 4.2 独立仓触发后的迁移启动清单（备用预案）

> 当目录规模或外部投稿达到触发条件时，按以下结构创建独立仓 `dislop-ai/awesome-anti-slop`。

#### A. 独立仓 `dislop-ai/awesome-anti-slop` MVP 目录结构

```text
dislop-ai/awesome-anti-slop/
├── LICENSE                         # CC0-1.0（开放数据协议，便于社区与研究引用）
├── README.md                       # 自动生成（英文主视图，禁止手改）
├── README.zh-CN.md                 # 自动生成（中文镜像视图，禁止手改）
├── CONTRIBUTING.md                 # 中立治理宪章、准入标准、伦理分区与投稿指南
├── data/
│   ├── taxonomy.json               # 8 大分栏、媒介、语种、阶段、形态、受控标签表
│   ├── schema.v3.json              # dislop.radar/3 JSON Schema 定义
│   └── entries/                    # 从主仓现有 90+ 条索引无损迁出（每条 1 文件）
│       ├── blader-humanizer.json
│       ├── dislop-self.json
│       └── ...
├── scripts/
│   ├── validate.mjs                # 零依赖 Node 20+：Schema / 去重 / 禁用营销词 / 排序校验
│   ├── build.mjs                   # 零依赖 Node 20+：编译 README*、dist/radar.json、dist/llms*.txt
│   └── refresh-metrics.mjs         # 周度定时调用 GitHub API 刷新星标、pushedAt、archived、license
├── dist/                           # 构建产物（供主仓与外部 Agent 直接引用）
│   ├── radar.json
│   ├── llms.txt
│   └── llms-full.txt
└── .github/
    ├── ISSUE_TEMPLATE/
    │   ├── submit-resource.yml     # 非开发者低门槛投稿表单
    │   └── report-issue.yml        # 死链/归档/分类纠错表单
    ├── pull_request_template.md    # 勾选清单：仅改 data/entries/、客观单句摘要、无营销词
    └── workflows/
        ├── pr-validate.yml
        ├── build-and-sync.yml
        ├── weekly-health.yml
        └── triage-hygiene.yml
```

#### B. 首个 Release（`v0.1.0`）执行清单

1. 确认触发门槛达成：`awesome/` 条目数 `>= 150` 或持续外部投稿 `>= 20 条/月`，主仓 `dislop.com/awesome/` 已稳定承接初始流量与规则页回流。
2. 数据迁移与双语补齐：编写一次性转换脚本，将 `docs/research/anti-slop-radar-index.json` 现有条目无损拆分为 `data/entries/<id>.json`，补齐全部 `summaryEn` 与 `kind` 字段。
3. 验证与构建自检：运行 `node scripts/validate.mjs` 与 `node scripts/build.mjs`，生成中英文 `README`、`dist/radar.json` 与 `dist/llms.txt`，并通过 `dislop check README.md README.zh-CN.md --pack core --fail-on error` 自检。
4. 独立仓发布 `v0.1.0`：推送至 `dislop-ai/awesome-anti-slop`，设置 GitHub Topics（`awesome`, `awesome-list`, `anti-slop`, `ai-slop`, `llm`, `writing`, `design-systems`, `code-quality`）与简洁仓库简介，打标 `v0.1.0`。
5. 主仓低侵入对接：在 `dislop` 主仓 `README` 与 `awesome/` 说明来源已切至独立仓，停止主仓内双份更新。
6. 官网快照同步：在 `dislop` 主仓落地 `vendor/radar-snapshot.json` 同步工作流，保持 `scripts/build_site.mjs` 编译 `site/awesome/`、`site/en/awesome/` 与 `site/llms.txt`，验证 `CSP: connect-src 'self'` 下交互筛选 0 外域请求。
7. 外部生态登记：独立仓存活满 30 天且自动化巡检稳定后，按 `awesome-lint` 校验通过结果向 `sindresorhus/awesome` 提交收录申请。

#### C. 同步脚本与主仓的清晰职责边界

- **`awesome-anti-slop` 负责**：条目数据治理、外部 PR 接待、死链与星标刷新、GitHub 视图（`README*`）渲染、`dist/radar.json` 与 `dist/llms.txt` 产出、以及向主仓发送包含精确 Commit SHA 与 SHA-256 摘要的 `repository_dispatch` 事件。
- **`dislop` 主仓负责**：接收 dispatch 后在独立同步工作流中校验快照完整性并提 PR 更新 `vendor/radar-snapshot.json`；`scripts/build_site.mjs` 始终仅读取本地快照离线编译静态页面与同源 ES 模块；主仓普通代码提交、单测与发包与 `awesome-anti-slop` 彻底解耦。

---

## 5. 架构决策结论（已对齐现状）

| 编号 | 决策事项 | 已执行 / 当前基线 | 后续触发与影响说明 |
|---|---|---|---|
| **D1** | **启动与拆仓时机**：冷启动期是立刻另建 `awesome-anti-slop`，还是先由主仓 + `dislop.com/awesome/` 承接并设触发阈值后再拆仓？ | **冷启动单仓优先（条目 `< 150` 或外部 PR `< 20/月` 前不拆仓）** | 集中早期的搜索引擎、GitHub 搜索与 Star 势能到 `dislop-ai/dislop`，避免空跑双仓 CI 与同步工作流；达到阈值后再按 §4.2 无损切出 |
| **D2** | **目录双语与数据协议**：英文主视与中文镜像 + `CC0-1.0` 开放数据？ | **中英双语严格分流（`/awesome/` 与 `/en/awesome/`）+ `CC0-1.0` 数据协议** | 保留完整中文目录同时承接英文 `awesome-*` 搜索与 `sindresorhus/awesome` 申报资格 |
| **D3** | **官网目录挂载路径**：`dislop.com/awesome/`（主域名子路径）还是独立二级域名？ | **`dislop.com/awesome/` + `/en/awesome/` + 根路径 `dislop.com/llms.txt`** | 直接复用现有单站部署管线与设计系统，把 SEO/GEO 权重集中沉淀在 `dislop.com` 主域，零额外 DNS 与证书维护成本 |
