# dislop 内容战略与 SEO / GEO 分析研报

> 整理日期：2026-11-23 · 资料库索引：[sources.json](./sources.json)（`dislop.kb/1`，52 条已核验一手出处）

从 `site/` 的当前结构看，`dislop.com` 只有两个 HTML 页面（首页与 `/awesome/`），缺少独立英文静态 HTML，且没有结构化数据标记，导致搜索引擎和 AI 回答引擎很难按场景引用 `dislop`。这份研报先拆清现有网站的 5 个技术短板，再结合 6 个行业知识域的实证依据，给出「教程指南 + 规则百科 + 工具清单」的零负担内容布局与日常维护边界。

---

## 1. 现状诊断：`dislop.com` 在搜索与 AI 检索里的 5 个短板

目前 `site/` 已经有了不错的 Agent 纯文本接口（`/llms.txt` 约 2.5 KB、`/llms-full.txt`、`/catalog.json` 和 53 张规则 `.md` 卡），但对 Google、Bing、Perplexity、ChatGPT Search 和中文搜索而言，还卡在五个具体位置：

| 维度 | 现状（改动前） | 带来的实际损失 | 本轮改法 |
|---|---|---|---|
| **HTML 入口密度** | 全站只有 `site/index.html` 和 `site/awesome/index.html` 两个 HTML 页面 | 53 条规则与 6 大核心场景没有独立人类可读着陆页，长尾检索词无页可承接 | 新增 6 组双语实用指南 HTML + 106 个双语规则百科 HTML + 指南/规则聚合目录页 |
| **英文版可抓取性** | 英文内容靠 `app.js` 在浏览器端动态替换，`hreflang="en"` 指向 `/?lang=en` | 爬虫抓取 `/` 看到的是中文 DOM，`/?lang=en` 与自指 `canonical: /` 冲突，英文词几乎不参与索引 | 生成纯英文静态 `/en/`、`/en/awesome/`、`/en/guides/`、`/en/rules/`，实现双向对等 `hreflang` |
| **社交卡片与语种纯度** | `site/index.html` 和 `site/awesome/index.html` 默认用英文 `og-card.png`，且 `twitter:*` 写了英文 | 中文页面在社交媒体与检索摘要里中英混排 | 中文页统一使用 `og-card-zh.png` 与纯中文 meta；英文页使用 `og-card.png` 与纯英文 meta |
| **结构化实体（JSON-LD）** | 全站零 `<script type="application/ld+json">` | 搜索引擎与问答引擎无法直接解析 `SoftwareApplication`、`TechArticle`、`FAQPage`、`CollectionPage` 与 `BreadcrumbList` | 编译期自动注入并校验每类页面的 JSON-LD `@graph` |
| **内容承接深度** | `/awesome/` 只有 90 条工具表格，缺少「怎么选工具」「如何排查文档/UI/PPT」的操作教程 | 用户搜“中文写作去 AI 味”“Vibe Coding 紫粉渐变怎么改”“AI 检测器 vs linter”时找不到直答页 | 依托 `content/guides/*.md` 产出双语 Answer-First 教程，并互链到对应规则页与 `/awesome/` |

---

## 2. 行业知识资料库综述（6 个领域的核心结论）

资料库 [sources.json](./sources.json) 归档了 42 条经过核验的一手出处，直接支撑后续指南写作与产品定位表达：

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
5. **搜索与 AI 检索可见性（6 条）**：
   - Aggarwal 等人（ACM KDD 2024 *GEO*）的实验证明，在正文中加入可核验统计数字、一手引文和直答摘要能显著提升回答引擎引用率，而堆砌关键词会适得其反。
   - Google 国际化规范要求 `hreflang` 必须在所有语言对偶页之间形成双向互指，且 `x-default` 指向独立可抓取 URL；OpenAI 将检索爬虫 `OAI-SearchBot` 与训练爬虫 `GPTBot` 分开控制，网站 `robots.txt` 放行检索爬虫即可参与实时引用。
6. **中文去 AI 味生态（5 条）**：
   - 中文高频需求集中在拆解“抓手 / 赋能 / 闭环”公文黑话（如 `op7418/Humanizer-zh` 23,450 星、`MrGeDiao/shuorenhua` 2,726 星）与排查半角标点、破折号过密和道德升华结尾（依据 `GB/T 15834—2011`）。

---

## 3. 内容战略：三层受众、搜索意图与页面分工

对照 [PRODUCT.md](../../../PRODUCT.md) 确定的用户推进顺序，不写泛泛而谈的行业新闻博客，而是把有限写作精力集中在三类长青内容资产上：

| 受众阶段 | 典型中文搜索 / AI 提问意图 | 典型英文搜索 / AI 提问意图 | 承接页面 | 目标动作 |
|---|---|---|---|---|
| **1. Coding Agent 用户** | `Claude Code 去 AI 味`、`Vibe Coding 紫粉渐变`、`PR 去水`、`AI 代码文档检查` | `how to stop claude code writing ai slop`, `fix ai slop web ui`, `ci linter for ai slop` | 指南 `fix-ai-slop-web-ui` + `agent-cli-mcp-tutorial` + 规则页 `ui-*` / `eng-*` | 安装纯文档 Skill 或跑 `npx dislop check .` |
| **2. 办公 Agent 用户** | `AI 生成 PPT 排版问题`、`Word 残留星号清理`、`汇报标题怎么写` | `clean up ai generated powerpoint`, `remove markdown asterisks from docx`, `deslop executive deck` | 指南 `deslop-pptx-docx` + 规则页 `slide-*` / `markdown-leak` | 打开 `/#workbench` 拖入 DOCX/PPTX 或连远程 MCP |
| **3. 所有用 AI 交付的人** | `中文写作怎么去 AI 味`、`AI 检测器准吗`、`去 AI 味工具推荐` | `what is ai slop`, `remove ai slop from writing`, `ai slop linter vs detector` | 指南 `what-is-ai-slop` + `remove-ai-slop-writing` + `linter-vs-detector-vs-skill` + `/awesome/` | 使用本地工作台检查，或从 `/awesome/` 选配套工具 |

### 为什么不做传统新闻流博客，而做「6 组指南 + 53 组规则页 + 90 条清单」

1. **零重复维护**：53 组双语规则 HTML 直接从 `packs/*/pack.json` 编译生成，规则正文、正反例与判断方法本身就是精确匹配长尾问题的问答页（如搜 `slide-autofit-shrink`、`ui-ai-gradient`、`negation-pivot-frame`）。
2. **中英彻底分治**：中文 6 篇和英文 6 篇分别针对中文公文腔/半角标点与英文 `delve`/RLHF 模式崩溃独立写作，避免生硬翻译腔，严格遵守中英文不混排原则。
3. **人机同源**：每篇指南同时输出语义 HTML（给人与搜索引擎）与纯净 `index.md`（给 Agent 与 `/llms.txt`），同一份 Markdown 源文件一处修改、两处同步。

---

## 4. 零负担运维边界（避免成为主干开发累赘）

为了保证内容库长期可控、不拖慢功能迭代和发包节奏：

1. **物理隔离进发包白名单外**：`content/guides/` 和 `docs/research/content-kb/` 不在 `package.json` 的 `files` 与 `pyproject.toml` 的打包列表中，npm 与 PyPI 包体积增加 **0 KB**。
2. **不改双端检查内核**：本轮和后续新增内容都不碰 `src/`、`bin/`、`packs/`、`patterns/` 或 `skills/`，日常更新走发版指南的第 1 档流程（改文案 → `npm run build:site` → `npm test` → `npm run dogfood` → 同步 `site/`）。
3. **准入与淘汰两条硬标准**：
   - 新增一篇指南前，必须能写出它对应哪一类具体搜索/提问意图，以及至少 3 条已在 `sources.json` 核验的一手出处；不写没有具体操作步骤或对照例子的空泛随想。
   - 每季度核验一次 `sources.json` 与 `content/guides/` 的时效字段；规则或命令有变动时只原地更新对应章节，不靠堆新文章刷数量。
4. **强制自检门禁**：所有指南、资料库与编译出的 HTML 必须通过 `dislop check . --fail-on warning` 与 `dislop check site/ --fail-on info` 零命中，杜绝在反 AI 味站点里出现 AI 套话。

---

## 5. 从搜索与 AI 发现到 GitHub Star 沉淀的转化链路

内容中心不是只为获取点击量，而是要把长尾搜索与社区分享转化成仓库试用与 GitHub Star（完整定量分析与分阶段节奏见 [open-source-star-growth-strategy-2026.zh-CN.md](../open-source-star-growth-strategy-2026.zh-CN.md)）：

1. **搜索/AI 问答 -> 规则百科与指南**：用户在 Google、Bing、Perplexity 或中文搜索里遇到具体报错规则或排版痛点时，落进 `/guides/*`、`/rules/*` 或 `/en/rules/*`，看到直答摘要、三段对照与单句改法要点，不靠推销口号建立信任。
2. **阅读 -> 一键工作台试用与离线分享**：规则页与工作台打通 `#try=<ruleId>` 与离线 `#share=v1.*` 链接；团队在 GitHub PR 评论（`--format sarif` / `--format github` 注解直链）或群聊引用单条规则卡片，形成无需服务端存储的低摩擦二次传播。
3. **试用 -> 主仓 Star 与样本共建**：精简后的双语 `README` 只用首屏 3 条命令、可玩工作台链接与 `.github/ISSUE_TEMPLATE/slop_sample.yml` 接住回流访客；同时配合 `.gitattributes` 锁定仓库主语言为 JavaScript/Python，为集中发布冲榜与 `good first issue` 新人转化铺平道路。
