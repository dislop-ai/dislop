# `dislop` 初期 GitHub Star 增长与开源冷启动策略研报（2026-11）

> 整理日期：2026-11-23 · 状态：规划与实证研究（尚未对外执行） · 实证出处：[content-kb/sources.json](./content-kb/sources.json)
>
> 关联文档：[seo-geo-content-report.zh-CN.md](./content-kb/seo-geo-content-report.zh-CN.md) · [universal-adaptation-and-marketplace-strategy.zh-CN.md](./universal-adaptation-and-marketplace-strategy.zh-CN.md) · [awesome-anti-slop-topology-design.zh-CN.md](./awesome-anti-slop-topology-design.zh-CN.md) · [business-model-and-open-core.zh-CN.md](./business-model-and-open-core.zh-CN.md)

初期项目的 Star 数决定了新访客点进仓库时的第一眼信任度、GitHub 站内搜索排序，以及能否进入每日/每周 GitHub Trending 列表获得二次自然分发。结合本机实时拉取的 GitHub 基线、X 与 Hacker News 一手讨论、YouTube 高星开源作者访谈字幕以及公开渠道研究，本研报系统梳理冷启动期的可复用规律，给出 `dislop` 下一阶段的四支柱加星运营方案。

---

## 1. 现状诊断与同类参照（2026-11-23 实测）

通过 GitHub API 对 `dislop-ai/dislop` 与同赛道开源项目做实时快照核验（2026-11-23）：

| 仓库 | Stars | Forks | 创建时间 | 定位形态 |
|---|---:|---:|---|---|
| `pbakaus/impeccable` | 115,035 | 6,852 | 2025-11-16 | Coding Agent 视觉设计技能包与命令规范 |
| `blader/humanizer` | 72,340 | 5,665 | 2026-01-18 | 去 AI 写作痕迹纯文档 Skill |
| `op7418/Humanizer-zh` | 23,558 | 1,444 | 2026-01-19 | 中文去 AI 味 Claude Code Skill |
| `hardikpandya/stop-slop` | 19,125 | 1,412 | 2026-01-11 | 英文散文去 AI 套话规则 Skill |
| `dislop-ai/dislop` | **2** | **1** | — | 在线工作台 + 本地确定性 CLI/MCP/Skill + 90 条工具索引 |

从当前基线看，`dislop` 有三处直接制约早期 Star 转化和被发现率的技术问题（功能之外）：

1. **仓库语言占比被生成的静态站撑偏**：GitHub API `languages` 返回 JavaScript `1,032,662` 字节、Python `439,558` 字节、HTML `207,322` 字节；加上 `site/` 新编译的百余份双语规则页与指南页后，本地 HTML 体积已达 `1,784,406` 字节，远超 `src/` + `bin/` JavaScript（`462,550` 字节）与 Python（`513,865` 字节）。若不加 `.gitattributes` 将生成 HTML 标为 `linguist-generated=true`，主语言会滑向 HTML，直接错过 JavaScript / Python 分区 Trending 榜单。
2. **远端仓库简介数字滞后**：`dislop-ai/dislop` 当前线上 `description` 仍写着 `42 rules`，尚未同步到已发布的 `53 rules` 与 90 条工具清单。
3. **14 天仓库流量基数极低**：当前 14 天累计浏览 `11` 次（`2` 位独立访客，主要来自 `github.com` 与 `dislop.com`），说明站点、CLI 与文档已完成就绪，真正的缺口是站外分发入口与集中触发机制，而不是继续加功能。

同时应保持清醒的商业预期：X 社区（2026-11 实采）开发者普遍反馈开源工具哪怕做到数万星，托管版付费转化也通常只有约千分之 3.5（即每 1,000 星带来约 3 至 4 个付费客户）。Star 是认知漏斗和可信度背书（正如 Postiz 作者指出，非技术采购方进仓库看到近期提交和星标会认定项目活跃可靠），不能直接等同于现金流，它主要服务于冷启动信任、社区反馈和后续生态合作。

---

## 2. YouTube 开源增长一手实证拆解

基于 2026-11-23 通过 `intel youtube fetch` 获取的原生字幕原文，5 组实操案例揭示了 2020 至 2026 年开发者工具拿到前 1,000 到 25,000 星的核心动作：

| 作者与项目 | 规模 / 里程碑 | 核心打法（源自视频原生字幕） | 对 `dislop` 的直接启发 |
|---|---|---|---|
| **Coreyhaines31** (`marketing-skills`) | 15,000★ (2026-04) | 先借 Claude Code + Skills 热点发推拿到近百万浏览、破千星上 GitHub Trending；真正的放大器是在 Vercel 的 `skills.sh` 目录一次发布 22 个按场景拆分的子技能，直接霸屏首页（与 Vercel / Anthropic / Microsoft 并列），一行安装继续滚大传播 | 不能只把一个大 Skill 丢在仓库里；后续评估将 `work-docs`、`web-ui`、`office`、`essay` 作为独立可发现条目暴露给目录索引，让搜索不同任务的人都能一行装进来 |
| **Nevo David** (`Postiz` / `Novu`) | `Postiz` 25,000★ / $17K 月收入；`Novu` 一年内 `2K → 20K★` | 1) 把 GitHub README 当第一官网落地页，首屏 10 秒写清「你是谁的开源替代」，提前建好可认领 Issue；2) **集中同一周**多平台爆发冲 Trending（Show HN + Reddit `r/selfhosted` / `r/LocalLLaMA` 先养号 + Lemmy + Dev.to/Medium/HackerNoon 吃 Google Discover + X/LinkedIn）；3) 坦诚承认「前 500 星比第 5,000 星容易得多」，因为新面孔有首次亮相的新鲜度红利；4) 文章结尾谦逊、带个人视角（用「I」不用「we」）向读者要一颗 Star | `dislop` 从 2★ 起步正是首发新鲜度红利窗口；发文要集中在同一 24–48 小时冲击日榜，不要把 6 篇材料分散成每周发一篇 |
| **AIex The AI Workbench** (`11 Repos Gained 30k Stars`) | 单期 4.6 万播放 (2026-10) | 评测博主一晚上拉 11 个单日涨星近 3 万的项目实装 8 个：Mac 上**一行命令能否装起来**直接决定他测不测（需要复杂编译和 CUDA 的直接跳过）；欣赏**诚实交代指标取舍**的项目（如 `open-code-review` 标注消耗约 1/9 Token、用部分召回率换低成本）；高度偏好**一眼看懂解哪一类痛点**的小技能（如 Paul Hudson 的 `SwiftUI Pro` 5.6K★ 专拦 LLM 反复犯的过期 API 错误） | 首屏安装命令（`npx dislop check .`、`pipx install dislop`）必须在 macOS 上零配置跑通；发文主动讲清 14.6 KB 本地模型与正则规则的确定性边界，不吹虚高准确率 |
| **Eddie Jaoude** (`LinkFree`) | 3,000+★ (2023) | 6 条实操：1) 禁全平台乱刷链接乞星；2) 仓库顶部简介 5 秒说清用途；3) README 放 1 至 2 个真实截图或动图（不要塞几十张）；4) 新人反馈看不懂 README 立刻按新人问题改文档；5) 补齐 GitHub `Community Standards` 检查项并撰写步骤详细的 `good first issue`；6) 用 CI 自动检查格式与单测，省出时间在评论区做深度协作 | 补齐仓库内清晰的 `CONTRIBUTING.md`、规范模板与 5 个以上带有明确改动位置和样例的 `good first issue` |
| **QuanticDev** (`KOAN`) | 2 天 800★ (2020) | 第一前提是有真实在线 Live Demo 可直接点开比对，配合整洁 README（简介 + 技术栈 + 在线示例 + 快速上手 + 配置表 + 测试）、24 小时内秒回并关闭不合理 Issue 维持干净待办栏，主动投稿给技术周刊与子版块 | 把 `dislop.com/?lang=en#try=negation-pivot-frame` 作为主仓 README 与投稿正文的第一眼可玩链接，用零门槛试用代替干巴巴的功能介绍 |

---

## 3. X、Hacker News 与 GitHub Trending 实证机制

### 3.1 GitHub Trending 的窗口与速度阈值

1. **相对增速决定上榜**：GitHub Trending 衡量的是过去 24 小时（或本周/本月）相对于仓库自身基线的新增星数速度，而非历史总星数。50★ 基线突然单日涨 200★，比 5 万星老仓库单日稳态涨 200★ 更易冲进首页。
2. **重置窗口与语言门槛**：Trending 榜单通常在每日 **00:00 UTC** 前后重算刷新（对应北京时间 08:00）。单语言日榜通常需要 24 小时 **50 至 100+ 星**，全语言总榜则通常需要 **200 至 500+ 星**（AI 工具类竞争激烈区往往更高）。因此，集中流量窗口应安排在 UTC 上午时段起跑，确保有完整近 20 小时累计当日速率。
3. **上榜后的二次自来水放大**：X 上存在大量追踪每日/每周 GitHub 涨星榜的中文与英文策展账号（如本周中文榜、每日 AI 开源速递、YouTube 一周热榜合集）。一旦挤进单语言日榜或周榜，会触发一轮无需维护者出面的免费转录与评测。

### 3.2 X 平台高传播与高书签规律（基于公开样本）

结合本仓库关联调研此前在 2026-11 对 X 官方 API 采集的 89 条非转推主帖量化结果，以及 2026-11-23 新采样本对照：

1. **原生图文卡是硬门槛**：自带照片或视频的主帖浏览中位数达 **734.5**，纯文本仅 **144**；工程类账号应把「Before / Still sounds like AI / After」对比与终端输出截成 16:9 原生图卡。
2. **篇幅短而密、新号零外链首发**：剔除短链后，`120–240` 字符主帖浏览中位数为 **1,621.5**，而超过 `240` 字符骤降至 **167.0**；官号带外链 1 楼的浏览量通常只有主帖的 `1/3.01` 至 `1/19.48`（中位数 **1/6.75**），因此主帖必须独立讲完核心对比，链接放在 1 楼作为安装出口。
3. **带上下文数字 vs 模板乞星腔**：同批无认证 linter 官号 `@biomejs` 在更新帖中写清“新增 25 条规则、突破 800 条、提速最高 60%”收获 **4,088** 浏览，仅贴规则总数与图片的帖子只有 **982** 浏览；而 2026-11-23 实采中文推特上一条堆砌 `🔥/✅`、「神器」「效率拉满」「点个 Star 支持一波」的常见推广帖仅拿到 **130 浏览、1 赞、0 收藏**。朴实交代适用边界与实测数值远胜情绪化口号。

### 3.3 Show HN 工程社区观察（2026-11 实采）

从 2026-11-23 拉取的近期 HN 讨论（`GoogleChrome/modern-web-guidance` 449 分 / 146 评、`Onlook` 125 分 / 86 评、`Mastra Factory` 158 分 / 45 评、`HippoMaps` 136 分 / 44 评）看，高分开源帖共享三个特征：

1. **一句话把技术代差或痛点说死**：例如 Chrome 团队写明“把 Agent 从 2019 年的老 JS 拉回 `CSS.highlights` 和 `<dialog>` 原生能力”，没有任何形容词铺垫。
2. **第一人称讲真实起心动念，点开即用**：直接给出可复制 URL 参数的试用地址或 1 条测试命令，免注册、免填邮箱。
3. **主动自曝局限性**：提前写清楚哪些文件类型不支持、概率模型有什么局限、哪些场景不需要云端。

---

## 4. `dislop` 四支柱阶段式加星战略（0 → 100 → 500 → 2,000★）

> 注：本节为规划基线，所有对外动作均须先经作者人工审稿与明确授权后分步推进，不在本文阶段擅自外发。

### 支柱一：仓库第一印象与算法基建（Stage 0 · 发声前必改）

1. **修复 GitHub Linguist 主语言判定**：通过 `.gitattributes` 把 `site/en/**`、`site/guides/**`、`site/rules/**`、`site/awesome/index.html`、`site/awesome/awesome-data.mjs` 与 `site/engine/**` 标为 `linguist-generated=true`，确保主仓保持 JavaScript / Python，保留进入对应语言 Trending 的资格。
2. **同步仓库顶部信息与标签**：将 GitHub `About` 描述中的 `42 rules` 更新为 `53 rules`，把网址指向 `https://dislop.com`，并维持 `agent-skills`、`ai-slop`、`anti-slop`、`claude-code-plugin`、`mcp-server`、`linter` 等高意图 Topics。
3. **README 首屏 10 秒闭环**：已对齐双语导航（`Guides` / `Rule Catalog` / `Awesome`）、单图直观展示、3 条精简命令与可折叠进阶说明，保证海外与中文开发者点进仓库 10 秒看懂定位并能跑出第一条结果。
4. **备好 5 至 8 个真实 `good first issue`**：围绕具体缺规则的 AI 套话场景、IDE/CLI 边界样例和文档小修，标明涉及文件、复现样本和验证命令，把响应时长压在 24 小时内，吸引早期的 Star + Contributor 转化。

### 支柱二：多货架分发与子技能铺位（持续复利）

借鉴 Coreyhaines31 靠 `skills.sh` 首页铺位拿到持续流量的路径：

1. **Coding Agent 市场与注册表**：补齐 MCP Official Registry、Smithery、Glama、Claude Code Marketplace、Codex / Cursor 插件目录、VS Code Marketplace 与 Open VSX 的独立条目，确保用户在宿主工具内搜 `anti-slop`、`humanizer`、`linter` 时能搜到 `dislop`。
2. **场景包细粒度暴露评估**：后续版本可评估为 `work-docs`、`web-ui`、`office`、`essay` 提供更易检索的子技能说明入口，在不拆散单一引擎源码的前提下增加技能市场卡片曝光数。
3. **高权重大清单中性占位**：向 `awesome-mcp-servers`、`awesome-claude-code`、`awesome-cli-apps` 等 6 个开源清单按其格式规范提交 1 行客观条目（详见私有执行清单，人工批准后再投）。

### 支柱三：三阶段发布节奏（种子验证 → 单周集中爆发 → 策展人复利）

| 阶段 | Star 目标 | 核心渠道组合 | 关键门槛与验收信号 |
|---|---|---|---|
| **Stage 1：种子与钩子验证** | **0 → 100★** | 中文圈（V2EX「分享创造」、即刻、少数派/开发者周刊、HelloGitHub 月刊与阮一峰周刊投稿）+ X（英文/中文分池发锚点标本对比卡，不混排） | 观察每 100 名独立访客转化出多少颗 Star（健康线 `>= 3%–5%`），筛选出收藏率最高的一组对比图卡与 1 句话钩子 |
| **Stage 2：24–48 小时集中爆发（冲 Trending）** | **100 → 500–1,000★** | 选定 UTC 00:00 后 2 小时窗口（北京时间 10:00 左右，或美东早间覆盖 HN 黄金时段），在 **24–48 小时内集中同步**：1) Show HN（作者本人手写+回评）；2) Reddit `r/LocalLLaMA` / `r/ClaudeAI` / `r/selfhosted`（前置养号，一版块一帖，遵守自荐规范）；3) Lemmy 开源社区；4) Dev.to / Hashnode 工程解析文（配封面图吃 Google Discover，文末附谦逊真实的一句 Star 邀请）；5) X 置顶长图与 `3–5` 分钟 YouTube 一行安装实操视频（`npx` + `.pptx`/`.docx` 实检） | 关注单日新增是否跨过 JS/Python 语言 Trending 门槛（`50–100+★/24h`）；当周内保持 Issue 秒回与快速发补丁 |
| **Stage 3：内容复利与月度基准** | **1,000★+** | 借助已上线的 `6` 篇双语指南 + `53` 条规则页承接 Google/AI 搜索长尾词；每月发一次可复算的行业小评测（例如用 `dislop verify` 对比主流模型或热门去味提示词在数字保真上的真实留存率） | 形成「搜索/AI 引用 -> 试工作台 -> 导出 `#share=` 链接 -> GitHub 点星/提样本 Issue」的长效飞轮 |

### 支柱四：产品内建分享回路与归因闭环

1. **零服务器摩擦的分享钩子**：工作台生成的 `#share=v1.*` 链接、规则/指南页的「复制 PR/群聊单行引用」、以及 SARIF / `--format github` 输出末尾自带的规则页直链，都会在使用者每次贴进 PR 评审或微信群时，把同事带回可交互页面并附带仓库入口。
2. **每周一可观测漏斗复盘**：固定记录 GitHub 14 天 `traffic/views`、`traffic/clones`、`traffic/popular/referrers`、npm/PyPI 下载量、官网 SEO 入口点击与每周新增 Star，重点追踪 `t.co`、HN、Reddit、Dev.to、规则页和指南页各自带来的独立访客与转星效率，淘汰低效渠道，只保留高转化栏目。

---

## 5. 反例清单与不可踩的红线

综合 Eddie Jaoude 视频警示、X 开发者信任共识与社区反垃圾规则，以下四项操作明确禁止。

- 不做刷星、买星或互星群。X 社区近期的工程讨论表明，开发者已不再单看累计星数，还会交叉检查最近提交日期、Issue 响应速度和可运行样例；异常尖刺与僵尸账号只会损毁项目在技术圈的长期公信力。
- 不做跨号协同造势或社媒刷屏，个人账号与项目官方账号互不转发、互不点赞、不发同源改写稿；在 Reddit、Discord 或 Telegram 群严格遵守各社区自荐条款。
- 不在工作台、CLI 输出或规则百科页添加阻断式的乞星弹窗，只在文档和页脚保留克制的仓库入口链接，或于长篇工程文章末尾以第一人称说明开源地址。
- 不在单页或单帖中混排中英文，也不虚构检测率或删减数值，所有公开发布数据须能回源至对应离线评测日志或基准文档。
