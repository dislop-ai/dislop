# dislop 内容战略与 SEO / GEO 分析研报

> 整理日期：2026-11-23 · 资料库索引：[sources.json](./sources.json)（`dislop.kb/1`，55 条已核验一手出处，覆盖 7 个主题域）

从 `site/` 的结构演变看，`dislop.com` 此前只有首页与 `/awesome/` 两个 HTML 页面，缺少独立英文静态 HTML 与结构化数据标记，导致搜索引擎和 AI 回答引擎很难按场景引用 `dislop`。这份研报基于 [PRODUCT.md](../../../PRODUCT.md) 的产品定义，先梳理 5 个技术短板、7 个主题域的一手资料与反证，再对齐「三层受众 × 三种产品形态」的内容与运营转换链路、轻量基础架构约束与日常运维边界。

---

## 1. 现状诊断：`dislop.com` 在搜索与 AI 检索里的 5 个短板

目前 `site/` 已经有了不错的 Agent 纯文本接口（`/llms.txt` 约 2.5 KB、`/llms-full.txt`、`/catalog.json` 和 53 张规则 `.md` 卡），但对 Google、Bing、Perplexity、ChatGPT Search 和中文搜索而言，还卡在五个具体位置：

| 维度 | 现状（改动前） | 带来的实际损失 | 本轮改法 |
|---|---|---|---|
| **HTML 入口密度** | 全站只有 `site/index.html` 和 `site/awesome/index.html` 两个 HTML 页面 | 53 条规则与 6 大核心场景没有独立人类可读着陆页，长尾检索词无页可承接 | 新增 6 组双语实用指南 HTML + 99 个双语规则百科 HTML（53 中文 + 46 英文，7 条中文专用规则不生成英文页）+ 指南/规则聚合目录页（全站共 119 个静态 HTML） |
| **英文版可抓取性** | 英文内容靠 `app.js` 在浏览器端动态替换，`hreflang="en"` 指向 `/?lang=en` | 爬虫抓取 `/` 看到的是中文 DOM，`/?lang=en` 与自指 `canonical: /` 冲突，英文词几乎不参与索引 | 生成纯英文静态 `/en/`、`/en/awesome/`、`/en/guides/`、`/en/rules/`，实现双向对等 `hreflang` |
| **社交卡片与语种纯度** | `site/index.html` 和 `site/awesome/index.html` 默认用英文 `og-card.png`，且 `twitter:*` 写了英文 | 中文页面在社交媒体与检索摘要里中英混排 | 中文页统一使用 `og-card-zh.png` 与纯中文 meta；英文页使用 `og-card.png` 与纯英文 meta |
| **结构化实体（JSON-LD）** | 全站零 `<script type="application/ld+json">` | 搜索引擎与问答引擎无法直接解析 `SoftwareApplication`、`TechArticle`、`FAQPage`、`CollectionPage` 与 `BreadcrumbList` | 编译期自动注入并校验每类页面的 JSON-LD `@graph` |
| **内容承接深度** | `/awesome/` 只有 90 条工具表格，缺少「怎么选工具」「如何排查文档/UI/PPT」的操作教程 | 用户搜“中文写作去 AI 味”“Vibe Coding 紫粉渐变怎么改”“AI 检测器 vs linter”时找不到直答页 | 依托 `content/guides/*.md` 产出双语 Answer-First 教程，并互链到对应规则页与 `/awesome/` |

---

## 2. 行业知识资料库综述（7 个主题域与反证校准）

资料库 [sources.json](./sources.json) 归档了 55 条经过核验的一手出处，直接支撑指南写作、产品定位与运营节奏：

1. **学术计量学与去味边界（10 条）**：
   - Kobak 等人在 *Science Advances*（[arXiv:2406.07016](https://arxiv.org/abs/2406.07016)，2025）统计了 1,500 万篇 PubMed 摘要的超额用词，估算 2024 年至少 13.5% 的生物医学摘要（n=1,500 万篇）经过大模型处理；Holzwarth、González-Márquez 与 Kobak（[arXiv:2608.10715](https://arxiv.org/abs/2608.10715)，2026）在 PubMed Central 全文的后续追踪显示，讨论（Discussion）部分的机器痕迹明显高于方法（Methods）部分。
   - Padmakumar & He（ICLR 2024）、Doshi & Hauser（*Science Advances* 2024）与 Jiang 等人（NeurIPS 2025 *Artificial Hivemind*）一致证明：单靠换模型或删高频词，模型仍会退回高概率统计均值，既出现同模型自重复，也出现跨模型趋同。
   - 概率型 AI 检测器（Fast-DetectGPT、Binoculars、Pangram、腾讯朱雀）只给出概率百分比，不能指明哪一句是空话、哪一页 PPT 缩字或哪个网页按钮点不动。
2. **中英文编辑标准（9 条）**：
   - 英文社区以 `Wikipedia: Signs of AI writing`（WP:AISIGNS）、`ASD-STE100`、`Digital.gov Plain Language`、`GOV.UK Style Guide` 与 `Google Technical Writing` 为主流基准，核心做法是短主动句、第一句亮结论、同一概念保持同一名称。
   - 开源写作技能（`blader/humanizer` 71,724 星、`hardikpandya/stop-slop` 19,097 星）和规则检查器（`vale-cli/vale` 6,413 星）分工明确：Skill 管写作前防呆，确定性工具管交付前拦截。
3. **开源协作与代码 PR 治理（5 条）**：
   - 2026 年初，curl 维护者 Daniel Stenberg 因低质 AI 漏洞报告将有效率从 15% 以上拉低到 5% 以下而关闭赏金计划；`tldraw` 出现自动关闭外部 PR 的防御公告；`Ghostty` 通过 `AI_POLICY.md` 强制预批与工具披露；CodeRabbit 实测 AI 生成的 PR 平均多出约 1.7 倍问题。工程团队迫切需要本地和 CI 可执行的快速检查门禁。
4. **界面设计与演示文档规范（7 条）**：
   - Coding Agent 批量生成的网页普遍出现紫粉霓虹渐变、胶囊标签堆叠、三层套盒和 `href="#"` 死按钮；`frontend-design`、`Impeccable` 与 `ui-ux-pro-max-skill` 已累计收获几十万星标。
   - `Norm (Zurich)`、`Stiftung Buchkunst`、`Fonts In Use` 与中文排印站点 `The Type` 提供了可落地的版心比例、字阶梯度和标点挤压基准。
5. **搜索、爬虫分离与 AI 检索可见性（6 条，含反证）**：
   - Aggarwal 等人（ACM KDD 2024 *GEO*）的实验证明，在正文中加入可核验统计数字、一手引文和直答摘要能显著提升回答引擎引用率，而堆砌关键词会适得其反。
   - Google 国际化规范要求 `hreflang` 必须在所有语言对偶页之间形成双向互指，且 `x-default` 指向独立可抓取 URL；OpenAI 将 `GPTBot`（训练）与 `OAI-SearchBot` / `ChatGPT-User`（检索）分离，Anthropic 同样区分为 `ClaudeBot` 与 `Claude-SearchBot` / `Claude-User`。因此 `site/robots.txt` 显式放行主流检索爬虫并屏蔽 `/api/` 与 `/mcp`。
   - **反证校准**：2025–2026 年多项第三方百万域名级 SEO 扫描（SE Ranking、ESEOspace 等统计）显示，在根目录放置 `llms.txt` 的站点仅占少数，且多项回归分析未观察到单靠 `llms.txt` 直接提升 AI 引用率。因此本方案不把 `llms.txt` 当排名杠杆，只把它保留为 `<= 2,600 B` 的低成本 Agent 路由地图，把真正的 SEO/GEO 押在可抓取的语义 HTML、JSON-LD `@graph`、双向 `hreflang` 与一手出处上。
6. **中文去 AI 味生态（5 条）**：
   - 中文高频需求集中在拆解“抓手 / 赋能 / 闭环”公文黑话（如 `op7418/Humanizer-zh` 23,558 星、`MrGeDiao/shuorenhua` 2,726 星）与排查半角标点、破折号过密和道德升华结尾（依据 `GB/T 15834—2011`）。
7. **开源内容转化与 Star 冷启动（13 条）**：
   - 整合 PostHog 公开手册（「只写别人写不出来的具体实证，不发泛泛行话」）、Supabase 文档驱动增长、GitHub 社区标准文件（`CONTRIBUTING.md` + `SECURITY.md`），以及 Coreyhaines31（`marketing-skills` 15K★）、Nevo David（`Postiz` 25K★ / `Novu` 20K★）、Eddie Jaoude 等一手实证，明确以「单一事实源仓库 + 交互工作台」协同转化 GitHub Stars 与安装留存。

---

## 3. 内容战略：对齐 `PRODUCT.md` 的受众推进与三种产品形态

严格对照 [PRODUCT.md](../../../PRODUCT.md) 确定的用户推进顺序与三种产品形态（纯文档 Skill、本地零依赖 CLI 与插件、官方远程 MCP 与网页工作台），不写泛泛而谈的新闻资讯流，而是把写作精力集中在可验证的长青页面与产品内置传播回路上：

| 受众阶段 | 典型中文搜索 / AI 提问意图 | 典型英文搜索 / AI 提问意图 | 承接内容 | 对应产品形态与目标动作 |
|---|---|---|---|---|
| **1. Coding Agent 用户** | `Claude Code 去 AI 味`、`Vibe Coding 紫粉渐变`、`PR 去水`、`AI 代码文档检查` | `how to stop claude code writing ai slop`, `fix ai slop web ui`, `ci linter for ai slop` | 指南 `fix-ai-slop-web-ui` + `agent-cli-mcp-tutorial` + 规则页 `ui-*` / `eng-*` | 第 1/2 形态：装纯文档 Skill、跑 `npx dislop check .`、配置 PR `--format github` / SARIF 规则直链 |
| **2. 办公 Agent 用户** | `AI 生成 PPT 排版问题`、`Word 残留星号清理`、`汇报标题怎么写` | `clean up ai generated powerpoint`, `remove markdown asterisks from docx`, `deslop executive deck` | 指南 `deslop-pptx-docx` + 规则页 `slide-*` / `markdown-leak` | 第 2/3 形态：拖入离线工作台试用、或登录连 `https://dislop.com/mcp` 做保留排版处理（月免费 30 额度） |
| **3. 所有用 AI 交付的人** | `中文写作怎么去 AI 味`、`AI 检测器准吗`、`去 AI 味工具推荐` | `what is ai slop`, `remove ai slop from writing`, `ai slop linter vs detector` | 指南 `what-is-ai-slop` + `remove-ai-slop-writing` + `linter-vs-detector-vs-skill` + `/awesome/` | 第 2/3 形态：规则页点 `#try=` 进工作台、生成 `#share=v1.*` 零上传分享链接或复制单行 PR/群聊引文 |

### 为什么坚持「双语分治 + 单源编译 + 不做泛博客流」

1. **零重复维护与防过度设计**：99 个规则百科 HTML（53 中文 + 46 英文）直接从 `packs/*/pack.json` 编译生成；12 篇指南复用统一的布局、JSON-LD 与 `.share-action-bar`，每份 Markdown 源文件同时生成语义 HTML 与 `index.md`。
2. **严格遵守中英文独立原则**：中文 6 篇与英文 6 篇分别面向中文公文腔/全角标点与英文 `delve`/句式趋同独立成文，7 条中文专用规则只出中文规则页，编译期门禁保证 `/en/**` 零汉字泄漏。
3. **坚持 PostHog 式反套话写作准入**：不在官网发空洞新闻稿；每篇指南必须先写直答摘要、给出可直接运行或对照的实证例句，并明确标出规则误报与能力边界。

---

## 4. 轻量架构底座与零负担运维边界

在不引入重型 CMS、前端框架或第三方追踪的前提下，仅通过四项确定性工程底座把内容与资料库稳住：

1. **物理隔离进发包白名单外（自动化锁死 `0 KB` 增量）**：`content/guides/` 和 `docs/research/content-kb/` 不在 `package.json` 的 `files` 与 `pyproject.toml` 的打包规则里，`tests/test_site.mjs` 自动断言排除关系，保证 npm 与 PyPI 安装包体积不膨胀。
2. **资料库防膨胀与引用一致校验**：`tests/test_site.mjs` 在每次测试校验 `sources.json` 条目唯一 ID、规范化 HTTPS URL 去重、分类与 `verifiedAt` 日期格式、`<= 120 条` / `<= 80 KB` 容量硬顶，以及 12 篇 `content/guides/*.md` 引用的每条出处 ID 均真实存在。
3. **不改双端检查内核、仓库语言判定不受静态页拖累**：`.gitattributes` 将生成 HTML/引擎产物标为 `linguist-generated=true` 保住 JS/Python 主语言；日常内容或清单微调只走第 1 档发版流程（改文案 → `npm run build:site` → `npm test` → `npm run dogfood` → 同步静态目录）。
4. **全量自检门禁与季度审校**：每季度核验一次 `sources.json` 时效并只就地修订旧章节；所有文档与静态页须通过 Node/Python `dislop check` 零命中自审，绝不在反 AI 味工具站点里留存 AI 套话。

---

## 5. 从搜索与 AI 发现到 GitHub Star 沉淀的转化链路

内容中心不是只为获取点击量，而是要把长尾搜索与社区分享转化成仓库试用与 GitHub Star（完整定量分析与分阶段节奏见 [open-source-star-growth-strategy-2026.zh-CN.md](../open-source-star-growth-strategy-2026.zh-CN.md)）：

1. **搜索/AI 问答 -> 规则百科与指南**：用户在 Google、Bing、Perplexity 或中文搜索里遇到具体报错规则或排版痛点时，落进 `/guides/*`、`/rules/*` 或 `/en/rules/*`，看到直答摘要、三段对照与单句改法要点，不靠推销口号建立信任。
2. **阅读 -> 一键工作台试用与离线分享**：规则页与工作台打通 `#try=<ruleId>` 与离线 `#share=v1.*` 链接；团队在 GitHub PR 评论（`--format sarif` / `--format github` 注解直链）或群聊引用单条规则卡片，形成无需服务端存储的低摩擦二次传播。
3. **试用 -> 主仓 Star 与样本共建**：精简后的双语 `README` 只用首屏 3 条命令、可玩工作台链接与 `.github/ISSUE_TEMPLATE/slop_sample.yml` 接住回流访客；同时配合 `.gitattributes` 锁定仓库主语言为 JavaScript/Python，为集中发布冲榜与 `good first issue` 新人转化铺平道路。

---

## 6. Agent EO（AX）与 2026 GEO 实证补全

围绕「大模型找方案时搜得到、Agent 进门后自己跑得通、需要深度能力时顺滑接上云端」这条链路，补充 2025–2026 年一手基础设施实证与本轮全仓对齐动作：

### 6.1 `llms.txt` 实证纠偏与三段漏斗分工

- Ahrefs（13.7 万域名服务器日志）与 SE Ranking（30 万域名统计建模）均表明，约 97% 的 `llms.txt` 很少被主流 AI 搜索爬虫抓取，站内是否放 `llms.txt` 与 ChatGPT、Claude 或 Perplexity 的引用率没有统计相关性。
- AI 搜索的真正上游是 Google / Bing 索引、语义化 HTML、结构化比较表以及站外证据栈（GitHub README 与活跃度、npm / PyPI 包页、Reddit / HN 真实讨论与第三方清单）。
- 因此，全链路拆成三段分工：站外证据栈与官网 HTML 负责让大模型搜到并引用（GEO/AEO）；`/llms.txt`、`.well-known` 发现文件与 CLI `--json` 负责让已经进门的 Agent 一次看懂并跑通（Agent EO / AX）；免登录 0 额度远程 MCP 工具与结构化鉴权引导负责承接无终端环境下的顺畅使用。

### 6.2 本轮全仓对齐的协议与实体清单

| 对齐层 | 落地文件或出口 | 解决的具体断点 |
|---|---|---|
| 产品定义与包元数据 | [PRODUCT.md](../../../PRODUCT.md)、`package.json`、`pyproject.toml`、`scripts/sync_manifests.mjs`、GitHub About/Topics | 明确 Agent 也是直接使用者，能自己找到并调用；补齐 `humanizer`、`claude-code`、`codex`、`cursor`、`pptx`、`docx` 等高意图检索词并同步线上介绍 |
| 官网结构化实体 | [scripts/lib/site_content.mjs](../../../scripts/lib/site_content.mjs) | 在首页 `Organization.sameAs` 补全 GitHub 组织、npm 与 PyPI 主页，并在 `SoftwareApplication` 补全 `codeRepository` 与 `softwareHelp` |
| 机器自动发现协议 | [scripts/build_site.mjs](../../../scripts/build_site.mjs) | 编译生成 `/.well-known/mcp/server-card.json`（及 `/.well-known/mcp.json`）与 `/.well-known/agent-skills/index.json`（含 `SKILL.md` 及 8 张参考卡 `sha256` 摘要），写入 `catalog.json` 与 `robots.txt` 注释 |
| `/llms.txt` 与 MCP v2 口径 | [scripts/build_site.mjs](../../../scripts/build_site.mjs)、[README.md](../../../README.md)、[README.zh-CN.md](../../../README.zh-CN.md)、`agent-cli-mcp-tutorial` | 在 2,600 字节预算内将 `/llms.txt` 顶部改造成可直接执行的 Quick Start；文档统一对齐线上 MCP v2 的 10 个工具与免登录 0 额度工具边界 |
| 双端 CLI 一致性 | [bin/dislop.mjs](../../../bin/dislop.mjs)、[src/dislop/cli.py](../../../src/dislop/cli.py) | 在 `--help` 补齐 `check --json` 与退出码说明；同步双端 `resources` 输出，新增 `mcpServerCard`、`agentSkillsIndex`、`freeToolsNoLogin` 与 10 个云端工具 |

### 6.3 发版后 10 题盲测探针（可复算验收）

每次发布前或发版后用 10 条固定无提示提问（中英各 5 条，覆盖文档去味、前端紫粉渐变修复、PPT 排版检查、Git CI 拦截 AI 占位符与 `vale` 对比）做两项核验：

1. **GEO 提及率**：在联网 AI 检索中统计提及 `dislop` 的比例，以及返回链接是否直接指向 `dislop.com` 或 GitHub 主仓。
2. **Agent 自上手率**：给一个干净 Coding Agent 只提供 `https://dislop.com`（不给安装命令），核验其能否在 2 次工具调用内跑通第一次 `dislop check --compact --json` 并正确解读退出码。

### 6.4 单域名国际化路径演进规范（英文默认 `/` + 中文子路径 `/zh/`）

评估「纯英文仅靠客户端 JS 切换语言」「单域名下根路径 `/` 默认英文 + `/zh/` 原生中文子路径」「拆独立子域名 `zh.dislop.com` 或双域名」三种国际化架构后，确定后续站点路由收敛规范：

1. **坚持单一根域名 `dislop.com`，不拆子域名或独立域名**：
   - 子路径 `dislop.com/zh/` 可完整继承根域名积累的 GitHub、技术周刊与注册表外链权威度，而独立子域名或新域名会被搜索引擎视作半独立新站重新积累权重。
   - 同源架构（Same-Origin）可直接复用现有的严格安全头 `CSP: connect-src 'self'`、本地存储状态、OAuth 回调白名单与 23 份跨平台协议清单，省去跨子域鉴权与双线运维成本（如需海报短链，仅配置 `zh.dislop.com` `302` 跳转至 `https://dislop.com/zh/`）。
2. **保留静态中文树 `/zh/`，不退化为纯客户端翻译开关**：
   - 去 AI 味高度依赖母语语料；若仅靠前端脚本切换界面文字，53 条中文规则百科与中文指南将失去独立可索引 URL，国内社交软件抓取分享链接时也无法展示中文标题与 `og-card-zh.png`。
3. **根路径 `x-default` 演进方向**：
   - 自 `v0.8.4–v0.9.0` 起已正式切换为**根路径 `/`、`/guides/`、`/rules/`、`/awesome/` 默认产出纯英文静态页（`x-default`），中文整体落入 `/zh/` 子路径**，既有 `/en/*` 路径保留 `301` 兼容跳转；英文对外分享统一使用 `https://dislop.com/`，中文对外分享统一使用 `https://dislop.com/zh/`。

### 6.5 Agent Readiness 协议补全与 4-Skill 横评入口（`2026-11-24`）

结合外部 Agent 就绪度体检、MCP 目录质量评分与技能市场索引核验，在保持原有静态架构的前提下补全多项机器协议与 1 组高引用基准页面。边缘网关已为 `/`、`/awesome/` 与双语指南详情页提供 `Accept: text/markdown` 透明映射，同步输出 `Vary: Accept`、`Content-Signal: ai-train=no, search=yes, ai-input=yes` 与 RFC 8288 `Link` 响应头，并在 `robots.txt` 声明 `Content-Signal` 与 `Agentmap`。

机器发现端点新增了 `/.well-known/api-catalog`（RFC 9727 `linkset` 指向 `/mcp` 与 `/api/health`）、`/.well-known/ai-catalog.json` 与 `<link rel="ai-catalog">`、纯英文 `/auth.md` 鉴权说明，修正了 `/.well-known/oauth-protected-resource` 根路径与 `/mcp` 子路径的 `resource` 精确匹配，并在浏览器工作台渐进注册只读 `dislop_check_draft` WebMCP 工具。技能与工具元数据方面，`/.well-known/agent-skills/index.json` 现已暴露全部 5 个技能及 `sha256` 摘要（含 4 个任务子技能镜像 `/tools/skills/*.md`），云端 MCP 全部 10 个工具也补齐了参数级 `description`。内容侧同步上线第 7 组双语指南 `anti-slop-skill-benchmark`（[EN](../../../content/guides/anti-slop-skill-benchmark.en.md) / [ZH](../../../content/guides/anti-slop-skill-benchmark.zh-CN.md)），把 `4` 款开源技能 `30` 份样本的一手字符串漏检与置信区间公开沉淀为可验证的长青参考页，配合站外社区与清单提交形成 GEO 交叉印证。
