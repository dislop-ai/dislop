---
content-type: reference-data
version: 0.9.0
---

# dislop Product Brief

All website copy, `README` files, marketplace manifests, visual assets, and outbound materials derive from this document. Voice and visual rules live in [docs/brand-and-voice-guide.md](./docs/brand-and-voice-guide.md) ([简体中文](./brand-and-voice.md)).

---

## English (Primary / Global Baseline)

### Slogan
Cutting AI slop is real productivity.

### Positioning
**Linter for AI Slop.** Built to run inside your agent, CLI, and CI, with a browser workbench ready whenever you want to check a draft yourself. Catches AI-sounding text and template layouts in docs, web pages, and slides before sending.

### Global-First Priority & Single-Domain Strategy
- **English (Global) first across code, docs, and assets**: Rule precision on native English prose/UI/decks, CLI/MCP/Skill schemas, canonical documentation (`*.md`), and primary visual assets (`og-card.png`, `-en-v2` demos, `@dislop_ai`) always come first. Chinese (`*.zh-CN.md`, `zh-*` rules, `-zh-v2` demos) is maintained in lockstep as a native localized counterpart, never the upstream source for machine translation.
- **Strategic horizon**: Short-term rollout pairs global package/MCP/skill registries and flagship English benchmarks with fast community seed validation; medium-to-long-term growth focuses on winning the default pre-flight slot across global Agent ecosystems and international team workflows, while serving localized office document cleanup as a complementary track on the same engine.
- **One brand, one repository, one domain (`dislop.com`)**: Never split into separate regional subdomains or separate codebases. The site serves native English at the root `dislop.com/` (`x-default`) and native Chinese under `dislop.com/zh/`, with automatic browser language routing, a one-click manual toggle, and `301` redirects on legacy `/en/*` paths.
- **Strict language separation**: English and Chinese materials use their own native examples, banners, social cards, and single-language accounts (`@dislop_ai` publishes exclusively in English), never word-for-word translations and never mixed inside one page or post.

### Users
Primary operators are coding agents, office agents, and CI pipelines. Primary customers and decision-makers are the people and teams delivering work with AI: first coding agent users, then office agent users, and finally teams managing shared voice and review gates.

### Design Principle (Internal): Agent-First Interface, Human-Owned Quality
Every new check, review flow, or verification guard ships first as a deterministic, low-token CLI, MCP, or Skill surface, while the browser workbench and editor extensions expose that same core for human review. Prioritize compact machine output (`--format agent`), exact line spans, low false positives, 2-strike circuit breakers, and fact-preserving verification over decorative dashboards. Ship first where agents look (npm, PyPI, Official MCP Registry, `skills.sh`, editor tool hooks, and CI) before standalone manual paste surfaces. People and teams keep ownership of quality—setting voice bounds, accepting edits, and paying for governance—while public copy avoids the `"Agent-first"` label and names concrete tools and outcomes instead.

### Product Form
1. **Skill (open-source, Markdown only)**: Genre-specific writing and UI reference cards with no bundled scripts. Your agent reads the matching card before drafting and can run the CLI afterward to check its work.
2. **CLI & Local Plugins (open-source, local)**: Zero-dependency local checker that flags AI leftovers and stock templates across docs, web UI, Word, and PowerPoint in terminals, editors, Git hooks, and CI. Developers can also plug in their own model API key for deeper review.
3. **Official MCP & Web Workbench (cloud service)**: Sign in to connect office or coding agents to the remote MCP with no local setup, or use the web workbench directly. The cloud service runs multi-model review by genre, returns structured issues and edit guidance for your local agent to apply in context, and handles Word and PowerPoint files while keeping their layout.

### Selling Points
1. **Curated community work**: Combines vetted open-source rules, corpus findings, and an indexed 90-tool directory across docs, web UI, Word, and PowerPoint, without hunting down scattered prompts.
2. **Broad host and scenario fit**: Ships domain packs for engineering, business, UI, and decks across Skill, Plugin, CLI, and Cloud MCP, connecting to major agents and editors in one command.
3. **Local, offline, private**: The CLI and local plugins run on your machine with zero uploads, keeping private drafts and source code local.

### One-Sentence Pitch
A dedicated linter for AI slop. It brings together vetted community rules and practices to help your agent find and fix AI slop in docs, web UI, and slides. Connects to major agents and editors in one command and can run completely offline.

---

## 中文（独立原生适配）

### Slogan
去 AI 味才是真正的生产力！

### 定位
**AI 味检查工具。** 默认挂进你的 Agent、终端和 CI 自动自检，也提供网页工作台随时手动排查。帮你和你的 Agent 在文档、网页和 PPT 发出前，挑出并改掉里面的 AI 味。

### 全球英文优先与单域名兼容原则
- **技术、文档与主物料以英文（全球）为第一基准**：地道英文语料检出精度与零误报边界、CLI/MCP/Skill 协议字段、主干英文文档（`*.md`）及默认视觉物料（`og-card.png`、`-en-v2` 动图、`@dislop_ai`）始终优先建设与验收；中文文档（`*.zh-CN.md`）、`zh-*` 专属规则与中文演示物料面向中文场景原生独立编写，不做英译中或中译英套翻。
- **短中长期节奏统一**：短期同步推进全球注册表/目录上架、中文技术社区快速种子验证与英文旗舰实测发布；中长期坚定以全球英语 Agent 生态标准和国际团队协作工作流为主战场，同时在同一套底座上承接中文免配置网页工作台与办公文档去味需求。
- **单品牌、单仓库、单域名（`dislop.com`）**：不拆独立子域名或第二套代码库。站点路由以根路径 `dislop.com/` 默认提供纯英文静态页（`x-default`），以子路径 `dislop.com/zh/` 提供原生中文静态页，支持按浏览器语言自动引导、一键手动切换与旧路径 `/en/*` `301` 跳转。
- **单页单帖严格不混排**：中英文各自使用独立案例、视觉卡片与单语社交账号（官方号 `@dislop_ai` 固定纯英文发布），同一页面或单条帖子内绝不中英混排。

### 用户
日常高频调用方是 Coding Agent、办公 Agent 与 CI 流水线；真正的服务与买单对象是用 AI 交付成果的人和团队：第一批是 Coding Agent 用户，第二批是办公 Agent 用户，中长期延伸至需要共享文风与交付门禁的团队。

### 内部设计原则：接口按 Agent 优先，质量与买单归属人和团队
所有新检查、审校与防改坏能力先交付确定性、低 token 的 CLI、MCP 或 Skill 出口，网页工作台和编辑器扩展复用同一底座供人审阅，不做只能手工点按钮的孤岛功能。优先打磨紧凑输出（`--format agent`）、精确行号定位、低误报边界、2 次阻断熔断与事实保真核验，胜过堆砌展示型仪表盘。分发优先覆盖 npm、PyPI、官方 MCP Registry、`skills.sh`、编辑器内置工具与 CI 门禁，再考虑需人工复制粘贴的入口。声纹边界、改稿拍板和团队治理采购始终由人和团队掌握；对外文案不用 `Agent-first` 这类标签词，直接写具体入口和效果。

### 产品形态
1. **Skill（开源，纯文档）**：按文体整理的写作与界面避坑参考卡，不带可执行脚本。Agent 动笔前按需读取，写完后可调用 CLI 自检。
2. **CLI 与本地插件（开源，本地运行）**：零依赖本地检查工具，快速标出文档、网页和 Word/PPT 里的 AI 残留硬伤与常见套话，适合终端、编辑器、Git 钩子与 CI。开发者也可以配自有模型密钥做深度审校。
3. **官方 MCP 与网页工作台（云端服务）**：不用配本地环境，登录就能在办公或编码 Agent 里接入远程 MCP，或者直接在网页工作台使用。云端按文体做多模型深度审校，返回具体问题和改法建议，交给你的 Agent 结合本地上下文去改，也支持保留原排版的 Word/PPT 处理。

### 卖点
1. **社区规则和工具一处拿全**：整合经过核验的开源去味规则、语料经验与 90 条精选工具，覆盖文稿、网页和 Word/PPT，不用自己到处搜集拼凑。
2. **多端与多场景兼容**：内置研发、商务、前端与演示等场景包，提供 Skill、Plugin、CLI 与官方 MCP，快速接入主流 Agent 和编辑器。
3. **本地离线保护隐私**：CLI 与本地插件支持纯本地运行、零上传，私密文稿与代码不出本机。

### 一句话介绍
专用的 AI 味检查工具。整合社区验证过的去味规则与经验，帮你和你的 Agent 发现并改掉文档、网页和 PPT 里的 AI 味。一行命令接入主流 Agent 与编辑器，可纯本地离线运行。
