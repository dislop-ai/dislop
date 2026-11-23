# dislop 产品定义（Product Brief）

官网、`README`、插件描述与对外触达文案均从本文件派生。表达细则见 [docs/brand-and-voice-guide.zh-CN.md](./docs/brand-and-voice-guide.zh-CN.md)。

---

## 中文

### Slogan
去 AI 味才是真正的生产力！

### 定位
**AI 味检查工具。** 帮你（的 Agent）在文档、网页和 PPT 发出前，挑出并改掉里面的 AI 味。

### 中英文与多语种原则
- 网站（`dislop.com`、`/guides/`、`/rules/` 与 `/awesome/`）根据访问者浏览器语言自动默认中文或英文，不写死单一语种，并保留一键手动切换。
- 中英文各自面向独立受众做原生表达、原生案例和原生视觉物料，不做逐字翻译；X 等同时覆盖中英文读者的渠道，可分别发布独立中文帖与独立英文帖，单条内容严格不混排。

### 用户
第一批是 Coding Agent 用户，第二批是办公 Agent 用户，最后是所有用 AI 交付成果的人；他们的 Agent 也是直接使用者，能自己找到并调用。

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

---

## English

### Slogan
Cutting AI slop is real productivity.

### Positioning
**Linter for AI Slop.** Helps you (and your agent) catch and fix AI-sounding text and template layouts in docs, web pages, and slides before sending.

### Bilingual & Market Independence
- `dislop.com`, `/guides/`, `/rules/`, and `/awesome/` auto-detect the visitor's browser language (`zh` or `en`) instead of hardcoding one default, with a one-click manual toggle.
- Chinese and English materials are authored independently for their own audiences—separate examples, banners, social cards, and posts rather than word-for-word translations. Bilingual channels like X can run separate native Chinese and native English posts without mixing languages inside a single post.

### Users
First coding agent users, then office agent users, and finally everyone who delivers work with AI. Their agents are direct users too, and can find and run dislop on their own.

### Product Form
1. **Skill (open-source, Markdown only)**: Genre-specific writing and UI reference cards with no bundled scripts. Your agent reads the matching card before drafting and can run the CLI afterward to check its work.
2. **CLI & Local Plugins (open-source, local)**: Zero-dependency local checker that flags AI leftovers and stock templates across docs, web UI, Word, and PowerPoint in terminals, editors, Git hooks, and CI. Developers can also plug in their own model API key for deeper review.
3. **Official MCP & Web Workbench (cloud service)**: Sign in to connect office or coding agents to the remote MCP with no local setup, or use the web workbench directly. The cloud service runs multi-model review by genre, returns structured issues and edit guidance for your local agent to apply in context, and handles Word and PowerPoint files while keeping their layout.

### Selling Points
1. **Curated community work**: Combines vetted open-source rules, corpus findings, and an indexed tool directory across docs, web UI, Word, and PowerPoint, without hunting down scattered prompts.
2. **Broad host and scenario fit**: Ships domain packs for engineering, business, UI, and decks across Skill, Plugin, CLI, and Cloud MCP, connecting to major agents and editors in one command.
3. **Local, offline, private**: The CLI and local plugins run on your machine with zero uploads, keeping private drafts and source code local.

### One-Sentence Pitch
A dedicated linter for AI slop. It brings together vetted community rules and practices to help your agent find and fix AI slop in docs, web UI, and slides. Connects to major agents and editors in one command and can run completely offline.
