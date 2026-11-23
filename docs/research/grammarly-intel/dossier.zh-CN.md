# Grammarly / Superhuman 扩展情报档案库（产品、技术栈、访谈、媒体与社区）

日期：`2026-11-23` · 状态：静态历史情报快照（`snapshot-only`）· 索引数据源：[sources.json](./sources.json)（`dislop.intel/1`，29 条已核验条目）· 主研报：[grammarly-evolution-and-agent-lessons.zh-CN.md](../grammarly-evolution-and-agent-lessons.zh-CN.md)

> 维护边界说明：本目录（`docs/research/grammarly-intel/`）为独立静态情报包，不接入 `site/` 构建、`scripts/sync_manifests.mjs` 或每周外链巡检工作流。日常开发无需维护本目录，仅在复盘竞品路线时按需手动增量补充。

---

## 1. 关联产品与「四面夹击」竞品格局

2025 至 2026 年间，独立写作与语法纠错软件遭到来自四个方向的同步挤压：上方是 ChatGPT 与 Claude 等通用大模型直接吞并改写和润色；下方是 Apple Writing Tools 在 macOS 与 iOS 免费内建校对、语气切换与摘要；侧面是 Microsoft 365 Copilot 在 Word 与 Outlook 捆绑企业预算；极客与隐私敏感人群则迁向 Rust 编写的本地工具 Harper 与命令行 Linter。正是在这种夹击之下，传统写作平台分化出五条截然不同的生存路径。

| 产品 | 2025–2026 核心定位 | 核心机制与代表能力 | 目标人群与定价/许可 | 对 Grammarly 的压力及对 `dislop` 的启发 |
|---|---|---|---|---|
| **Superhuman Suite（Grammarly）** | 跨应用 Agent 生产力套件 | 原位嵌入百万应用、8 个垂直 Agent、`Superhuman Go`（Go SDK 接入 20+ 伙伴）、`Superhuman Docs`（MCP）、`Authorship` | 个人 Free（100 次提示）/ Pro \$12 年付；团队 Business \$33/席位/月年付 | 重资产并购抬高运营与变现压力，个人档位默认 Opt-out 训练与弹窗膨胀反而让出轻量可信检查空间 |
| **Writer.com** | 企业级 Agentic AI 平台 | `WRITER Agent`、`Playbooks`、`Routines`、CRM/Workfront 连接器、`Enterprise Brain` 集中品牌事实库 | 中大型企业跨部门团队（法务、HR、市场、销售） | 证明企业愿意为「共享品牌语调 + 私有事实约束 + 跨流程执行」持续付费，对应 `dislop` 团队声纹库方向 |
| **Acrolinx** | 受监管行业内容治理与 QA | 确定性术语、可读性、包容性规则评分引擎 + 企业批准的生成式助手，深嵌 AEM / FrameMaker / Creative Cloud | 制造、生命科学、大型科技企业文档部门（闭源企业年费） | 验证确定性规则检查在强合规场景的长期壁垒，提示 `dislop` 用 `engineering-spec` 与 `regulated-comms` 切入高价值行业文档 |
| **LanguageTool** | 隐私优先多语种纠错 | 覆盖数十种语言的高精度语法/风格检查与本地化 AI 改写 | 欧洲市场、多语种写作者与隐私敏感机构（Freemium / 订阅） | 说明不依赖单一美国通用大模型的数据边界，本身就是明确的获客卖点 |
| **QuillBot** | 学术与大众日常改写套件 | 改写器、摘要、引用生成、语法检查与轻量起草界面 | 学生、博客作者与低预算创作者（Freemium / \$8.33 年付） | 缺乏工作流嵌入与事实保真校对的纯改写工具极易陷入低价红海 |
| **Apple Writing Tools** | OS 级原生免费写作层 | macOS / iPadOS / iOS 系统级选区校对、重写、调语气，端侧优先加可选云端 | 全部 Apple 设备个人用户（随系统免费） | 直接抽走轻度个人用户的「基础润色」付费意愿，证明单靠普通改写已无收费壁垒 |
| **Microsoft 365 Copilot** | 办公套件原生 AI 助手 | 深植 Word、Outlook、Teams、Excel，直接调用企业工作区文件与会议纪要起草与总结 | M365 商业与企业订阅客户（按席位增购） | 压缩企业再另买一套写作插件的预算，迫使第三方工具要么像 Superhuman 那样自建套件，要么做极轻标准门禁 |
| **Harper** | 本地优先极速开源语法检查器 | Rust 单体实现、零联网、`< 10ms` 本地检查，原生进入 VS Code、Obsidian 与浏览器 | 开发者、技术作者、开源与隐私优先人群（开源免费） | 与 `dislop` 最值得参照的技术同路人：Harper 解决英文基础语法，`dislop` 解决跨媒介去 AI 味与模板味，两者零冲突互补 |

从这组横向对照能看清一个共同规律：凡是只做「通用润色和基础纠错」的工具，都在被操作系统和通用大模型加速替代；真正能留住用户的，要么下沉成 **Harper / `dislop` 这样零上传、毫秒级、贴合编辑器与 CLI 的确定性工具**，要么上浮成 **Writer / Acrolinx / Superhuman 这类掌握私有语调与企业工作流的治理平台**。

---

## 2. 核心技术栈演化与工程实证

Grammarly 的工程口碑，很大程度上建立在它在 NLP 研究与客户端基础设施上长达十余年的扎实积累，而不是单纯套壳外部大模型。把它的技术栈拆开看，能够清晰看到从「规则与标注」到「指令微调与端云混合推理」的四代演进。

| 演进代际 | 核心系统 / 论文 | 核心机制与关键指标 | 对 `dislop` 的直接技术映射 |
|---|---|---|---|
| **第一代：规则与统计引擎** | 确定性规则 + 启发式拼写/标点库 | 高精度正则与句法约束在本地或边缘极快触发，零幻觉、可直接归因到具体错误类型 | 对应 `dislop` 7 套内置规则包与 65 条反模式库，保证 `0ms–15ms` 确定性归因 |
| **第二代：序列标注替代重写** | **GECToR**（Omelianchuk et al., BEA 2020, `arXiv:2005.12592`, `grammarly/gector`） | 提出 `"Tag, Not Rewrite"`：用 BERT/RoBERTa/DeBERTa 编码器为每个词元预测 `$KEEP` / `$DELETE` / `$APPEND` / `$REPLACE` 局部编辑标签并多轮迭代，速度比 seq2seq NMT 快最高 **10 倍** | 确立「局部标定 + 手术式微改」原则，避免把没毛病的原句连带重写掉 |
| **第三代：任务特化编辑微调** | **CoEdIT**（Raheja et al., EMNLP 2023, `arXiv:2305.09857`, `vipulraheja/coedit`） | 不拿千亿通用对话模型硬改文章，而是用编辑指令数据集微调中小模型；体积比 GPT-3-Edit 小达 **60 倍**，在纠错、简化、风格与连贯性基准上反超通用模型 | 印证 `dislop-cloud` 成本套利路线：确定性诊断 + 轻量低价模型 + 保真护栏，跑赢裸调旗舰模型 |
| **第四代：端云分层 + 跨应用编排** | 周 1,000 亿次调用分级路由 + 端侧 ~1B 模型 + Go SDK / Docs MCP | `98%` 高频请求由 `< 100ms` 定制轻量模型兜底；同步落地约 `1B` 参数端侧小模型保隐私；上层靠 Coda Brain 演化的 `Superhuman Go` 与 `Docs MCP` 跨应用调度 | 验证 `dislop`「`< 15ms` 本地零依赖核 + `14.6 KB` Pocket ML + 按需云端深审」的分层算力账 |

在客户端捕获与渲染工程上，Grammarly 走了两条高维护成本的重路径。浏览器端通过 WebExtension 内容脚本持续监听各网站 DOM 变更与 `contenteditable` 选区，并为此自研开源了响应式状态库 **Focal** 与声明式 UI 引擎 **Embrace**，用来处理悬浮波浪线与卡片的高频刷新；桌面端在 macOS 上则依赖 **Accessibility API（`AXUIElement`）** 跨 Slack、Mail、Word、Notes 读取输入焦点并回写文本。这条架构虽然换来了「100 万个应用都能弹窗」的覆盖面，却也带来三个代价：需要用户授予高敏感的辅助功能或全网页读写权限、容易在复杂富文本编辑器里与宿主页面抢焦点或拖慢输入、且很难像标准协议那样干净地嵌入无人值守的 CI 与编码 Agent 流水线。

对 `dislop` 而言，GECToR 与 CoEdIT 的论文实证加上客户端权限代价，恰恰说明不必去碰脆弱的全局 DOM 注入和系统辅助功能挂钩——把检测做进零依赖 JS/Python 内核、`VSIX` 编辑器诊断、本地 `CLI` 与 `MCP`，既能把响应压在 `< 15ms`，又避开了重客户端兼容泥潭。

---

## 3. 五位核心人物访谈与播客实录精要

通过梳理创始人、历任 CEO 与核心并购创始人在主流播客、产品大会与媒体专访中的公开表述，可以还原出 Grammarly 从克制增长走向激进扩盘的决策脉络。

| 人物与角色 | 主要公开访谈与播客来源 | 核心观点与关键细节 | 对 `dislop` 的启发 |
|---|---|---|---|
| **Max Lytvyn**（联合创始人） | *Indie Hackers (Ep. 45)*、*My First Million* | 2007 年卖掉 MyDropBox 后在基辅组建工程团队；认为学生抄袭是因为不会用自己的话表达；坚持近十年不融风投，靠学生与高校订阅正现金流自造血至 2017 年 | 早期先把核心工具的真实痛点与单位经济算账跑正，比急着堆重资产平台更稳 |
| **Brad Hoover**（CEO 2011–2023） | *SaaStr (Ep. 602)*、*Masters of Scale* | 主导 2015 年转向浏览器 Freemium，总结「PLG 个人渗透 + 企业销售收口」双轮打法；并谈及在俄乌冲突期间保障基辅团队工程连续性的组织机制 | 开源免费个人工具（CLI/Skill/VSIX）负责自然扩散，GitHub Action 与团队规则管理自然引出 B 端付费 |
| **Rahul Roy-Chowdhury**（CEO 2023–2024） | *Masters of Scale*、*Generative Now*、*The Next Great Thing*、*The Logan Bartlett Show* | 前 Google Chrome 产品负责人；拆解从规则/NLP 切向 `GrammarlyGO` 生成式 AI 时的信任与隐私平衡，以及 2024 年 2 月盈利裁员约 230 人（20%–23%）加速 AI-first 协作的组织阵痛 | 大体量工具在范式切换期往往包袱沉重，专注单一清晰问题的轻团队反而在响应速度上占优 |
| **Shishir Mehrotra**（CEO 2025–2026） | *The Verge: Decoder*（2026.03）、*Creative Intelligence*、*Silicon Valley Girl*、*Village Global*、*Figma Config* | 在策略播客系统阐述「Digitization → Collaboration → Agency」三时代论与消除「AI Detour」的 AI 高速公路战略；但在 2026 年 3 月 *Decoder* 面对 Nilay Patel 对 `Expert Review` 冒名顶替的质问陷入被动 | 一方面要学他「嵌入最后一公里、消除复制粘贴绕道」的入口洞察，另一方面必须拿 *Decoder* 危机当永久警钟 |
| **Rahul Vohra**（Superhuman Mail CEO） | *New Economies*、*Product School*、*The Split* | 提出邮箱是天然的多 Agent 异步编排舞台；并修正 AI 时代的「40% 非常失望」PMF 框架，指出代码壁垒消失后，分发渠道、极致执行与攻克对手嫌麻烦的工作流才是护城河 | 印证 `dislop` 把 `.docx`/`.pptx` 原排版解析、对抗基准与全生态协议分发当作真护城河的判断 |

### 关键危机访谈切片：2026 年 3 月 *Decoder* 节目里的「归因 vs. 冒名」交锋

在 2026 年 3 月 *The Verge* 主编 Nilay Patel 主持的 *Decoder* 播客中，Shishir Mehrotra 迎来了上任后最尖锐的一次公开追问。Nilay Patel 直接指出，Grammarly 在未取得授权的情况下把包括他本人在内的多名记者和作家放进 `Expert Review` 审稿名单，姓名旁甚至配有类似官方认证的对勾图标，他当场直言：「You just made something up and put my name on it.」当 Nilay 进一步要求对方承认这是未经授权虚构归因时，Mehrotra 拒绝松口（「No, I'm not」）。

尽管 Mehrotra 在节目中致歉并承认该功能「对专家和用户都不好」、使用率很低且已下线，但他仍试图在「互联网公开内容的署名归因（attribution）」与「冒名顶替（impersonation）」之间划出辩护线，并将商业利用与公开权争议推给司法程序（*Angwin v. Superhuman Platform, Inc.*）。这次公开交锋给所有做审稿与风格代理的产品划出一条毫不含糊的界线：**哪怕工程团队的初衷只是借用公开语料提炼评审视角，只要产品界面把机器输出挂在真实个人名下售卖，就同时踩中伦理、公关与法律三条红线**。

---

## 4. 媒体、技术博客与社区声音交叉对照

将官方宣传口径、科技媒体调查报道与基层用户/IT 管理员的日常反馈放在同一张表里，能看清「商业叙事」与「真实体感」之间的四处明显裂缝：

| 议题 | 官方与资本叙事 | 权威媒体审视 | 真实用户与社区反馈 |
|---|---|---|---|
| **平台扩张与更名** | 从单点插件跃迁为 `Superhuman` 多产品 AI 平台，对标 M365 与 Google Workspace；年营收超 \$7 亿、DAU 超 4,000 万（*Fast Company* / *Observer* / *CodeUA*） | *The Verge* 与 *Wired* 指出放弃十余年单一品牌认知是一场高风险豪赌，核心起因是生成式大模型挤压旧护城河 | Coda 老用户在社区反映更名 `Superhuman Docs` 后向团队与客户推销时显得生硬割裂，削弱了原有产品认同 |
| **写作质量与 AI 检测** | `Paraphraser`、`Humanizer` 与 `AI Detector` 一站式满足润色与原创核验；`Authorship` 在高校累计生成超 500 万份报告（官方博客） | *Nieman Lab* 等持续关注学术界对黑盒检测误报的焦虑，肯定过程透明优于概率猜测 | 写作者在评测与社区抱怨商务润色把个人声音磨平为「Grammarly 腔」，而自家 AI 检测器只增删一个逗号就从 0% 跳到 50%–90% |
| **日常交互与商业化** | 「AI 高速公路」嵌入超 100 万应用，用 `98%` `< 100ms` 响应实现无感辅助 | *Contrary Research* 指出 \$10 亿非稀释营收担保融资保住了 \$130 亿估值，但也显著抬高了单客变现要求 | `r/Grammarly` 与 `r/sysadmin` 大量吐槽插件变重、Pro 升级弹窗与生硬改写提醒频繁打断思路、取消团队订阅挽留激进 |
| **隐私与数据训练** | 销售签约的 Business / Enterprise / Education 合同默认关闭模型训练，Go SDK 限制外联域与写操作确认（安全与隐私文档） | *The Guardian* 与隐私倡导社区持续质疑消费端抓取与默认训练条款透明度 | 隐私教程专门传播 `account.grammarly.com/security/privacy` 手动关闭 `Product Improvement and Training` 的路径 |

---

## 5. 零负担索引与维护边界约定

为避免外部情报越滚越大反过来拖累 `dislop` 主仓库的日常迭代，本目录采用**单源双文件隔离**结构：全部 29 条结构化情报元数据集中存放在 [sources.json](./sources.json)（`dislop.intel/1`），扩展分析集中在本文件 [dossier.zh-CN.md](./dossier.zh-CN.md)；主研报只保留核心结论与指向链接，不在两处同步维护重复出处表。

在工程与运维边界上，`scripts/build_site.mjs`、`scripts/sync_manifests.mjs`、`scripts/check_awesome_links.mjs` 与 `tests/test_site.mjs` 均不读取本目录，主仓升级规则、发版或更新 `awesome/` 清单时无需改动这里。本目录仅随其余 `docs/research/` 文档一并接受 `dislop check docs/research --fail-on info` 静态自审（不为未实测深链编造 URL，播客与报道以节目/刊物及日期归档），平时零日常维护，只在重新评估商业模式、竞品定价或云端 Agent 审校方向时按需手动增量补充。
