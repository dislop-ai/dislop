# Grammarly 相关 10 款产品深度调研与呈现设计分析

日期：`2026-11-23` · 状态：静态历史情报快照（`snapshot-only`）· 数据索引：[sources.json](./sources.json)（`dislop.intel/1`，34 条已核验条目）· 综合情报档案：[dossier.zh-CN.md](./dossier.zh-CN.md) · 主研报：[grammarly-evolution-and-agent-lessons.zh-CN.md](../grammarly-evolution-and-agent-lessons.zh-CN.md)

> 证据边界与维护说明：本文所有融资、并购、功能、定价、星标与社区反馈均核验自截至 **2026-11-23** 的公开资料；第 3–4 节为面向 `dislop` 交互与呈现设计的推演。本文件隔离在 `docs/research/grammarly-intel/`，不接入官网构建、清单同步或定时外链巡检。

---

## 1. 10 款相关产品全景总览表

围绕 Grammarly / Superhuman 所处的「通用写作辅助、企业治理、轻度改写、长文精修、OS 原生集成、本地开源开发者工具」六条邻近赛道，我们逐个拆解了 10 款代表性产品（部分关联能力按同一生态合并分析）：

| 产品 | 所属阵营 | 2025–2026 发展状态与体量 | 核心功能 | 核心 UI/UX 呈现范式 | 定价 / 许可 | 最高频好评与最高频槽点 |
|---|---|---|---|---|---|---|
| **Grammarly** | 全表面写作辅助 | 母公司更名 Superhuman；2026 年初总年营收超 \$7 亿、DAU 超 4,000 万 | 4 级纠错润色、Grammarly Docs 与 8 Agent、`Authorship` 过程追踪 | 4 色语义下划线 + 环境态绿 `G` 浮标 + 渐进卡片与侧栏 | Free（100 提示）/ Pro \$12 年付 / Business \$33 年付 | 好评：无处不在且分类清晰；槽点：AI 弹窗膨胀、默认训练与误报检测器 |
| **Superhuman Mail & Go** | Agent 生产力套件 | 2025 并购入局；2026.07 Coda 更名 `Superhuman Docs` 并开 MCP | 分流收件箱、个人声纹草拟、Go SDK 接 20+ 伙伴 Agent、Docs MCP | **100ms 瞬时反馈** + 全键盘流 + `Cmd+K` 命令面板 | Pro \$12（含 Docs+Go）/ Business \$33（含 Mail） | 好评：操作极快不破心流；槽点：`Superhuman Docs` 命名在 B 端显生硬 |
| **Writer.com** | 企业级 Agentic 平台 | C 轮 \$2 亿（总融资约 \$3.69 亿，估值 \$19 亿–\$19.8 亿），ARR 超 \$4,700 万 | 自研 `Palmyra` 模型族、`AI Studio` 图谱 RAG、`WRITER Agent` 与权限合规 | 克制商务风工作台 + 品牌规范强约束 + 管理员会话/反馈日志 | 企业定制（服务数百家 Global 2000） | 好评：合规安全、品牌口径极稳；槽点：前期建库配置重、个人几乎不可用 |
| **Markup AI（原 Acrolinx）** | 企业内容治理与 QA | 2025–2026 正式更名 Markup AI（`markup.ai`），推出 `Content Guardian Agents` | 确定性术语/包容性/可读性检查、AI 草稿拦截、AEM/Docs/GitHub 与 MCP | 右侧小对勾唤出 **滑出 Sidebar** + 风格下拉 + **Acrolinx Score 记分卡** | 闭源企业年费 | 好评：跨国团队口径统一与量化审计强；槽点：规则偏死板、误报与部署重 |
| **LanguageTool** | 多语种语法与风格 | 被美国教育科技母公司 **Learneo** 收购，数据控制方迁至加州，覆盖 30+ 语种 | 多语种/多方言语法纠错、Simple/Standard/Formal 改写、Obsidian 集成 | 低打扰行内下划线 + 可选开启的 **`Picky Mode`**（挑剔模式） | Free / 个人年付约 \$5.83/月（\$70 档） | 好评：非英语语种极强、弹窗远少于旧版竞争对手；槽点：被美企收购引欧洲隐私疑虑 |
| **QuillBot** | 学术与大众改写套件 | 同属 **Learneo** 旗下，靠 Freemium 与 40%–50% 季节折扣维持学生流量 | 5 模式改写、摘要、引文生成、语法检查与 AI/查重检测 | **左右分栏实时对照（Split-Pane Diff）** + **`Synonym Slider` 力度滑杆** | Freemium + 年/月订阅（常设大促） | 好评：滑杆可控不写 Prompt；槽点：Creative 易失真、免费字数墙与升级弹窗扰人 |
| **Hemingway Editor Plus** | 可读性诊断与精修 | 保持免费网页诊断引流，Plus 版叠加基于句额度的 AI 逐句改写 | Flesch-Kincaid 年级分、句法密度定位、语气转换与 Markdown/Word 导出 | **全句背景 6 色视觉编码** + **逐句点击触发 AI 改写**（不盲改全文） | 网页免费 / 经典离线 \$19.99 买断 / Plus \$10/月（\$100/年 5k 句） | 好评：一眼清废话、作者握方向盘；槽点：过度崇尚短句伤及文学性、5k 句额度易触顶 |
| **ProWritingAid** | 长文与小说作者工具 | 推出 `Desktop Everywhere` 覆盖 Scrivener/Word/Vellum；全书分析另计点数 | 25+ 专项风格报表、`Sparks`/`Rephrase`（可一键全关）、`Virtual Beta Reader` | 多维报表仪表盘 + 章节评审侧栏 + 标出「差点弃读点」 | Premium \$120/年 / Pro \$144/年 / 终身版；全书分析另购 Story Credits（\$25–\$50/点） | 好评：抓重复与试读反馈极准；槽点：报表信息密度压迫、已付年费还要另买 Credits |
| **Apple Writing Tools / M365 Copilot** | OS 与办公套件原生层 | 2024–2026 随 macOS/iOS 与 M365 全面铺开，Copilot 已接 OpenAI 与 Anthropic 模型 | Apple 管系统级校对/改写/摘要；Copilot 管 Word/Outlook 多步起草与企业数据综合 | Apple：**OS 零界面壳浮窗**；Copilot：**功能区 + Editor + 常驻右侧聊天栏** | Apple 随系统免费；Copilot 随 M365 企业/个人订阅 | 好评：Apple 零摩擦、Copilot 懂企业数据；槽点：Apple 偏浅层、Word 界面拥挤视线乒乓 |
| **Harper / Vale** | 本地开源开发者派 | **Harper** 被 **Automattic** 收购，GitHub 1.6 万–1.7 万★；**Vale** 获 AWS/GitLab/Red Hat 采用 | Harper：Rust `< 10ms` 零联网语法检查；Vale：Go CLI + tree-sitter + YAML 风格包 | **编辑器 LSP 行内波浪线**（跳过代码围栏）+ `Code Action` + CLI/CI PR 门禁 | 全部开源免费（Harper 专注英文，Vale 专注 Docs-as-Code） | 好评：零上传极速、融入工作流；槽点：Harper 缺多语/深度润色，Vale 初期规则配置重 |

---

## 2. 逐个产品深度拆解（四大维度与界面呈现分析）

### 2.1 Grammarly（含 Grammarly Docs / 8 Agents / Authorship）

**具体功能与 2025–2026 发展现状**：在基础拼写与语法检查之上，Grammarly 于 2025 年 8 月推出协作工作区 `Grammarly Docs` 和 8 个任务型 AI Agent（其中 `Reader Reactions`、`Citation Finder` 与 `AI Grader` 口碑稳固，而冒名模拟名家的 `Expert Review` 于 2026 年 3 月因集体诉讼紧急撤回）；过程追踪工具 `Grammarly Authorship` 则接通 Word、Docs 及 Canvas / Blackboard LMS，截至 2026 年初生成超 500 万份学生报告。母公司更名 `Superhuman Platform Inc.` 后，2026 年初整体年营收突破 \$7 亿、DAU 超 4,000 万。

**设计思路与呈现效果深度分析**：Grammarly 早年最成功的界面创新，是把学校里让人产生防御心理的“满屏红叉”拆成一套温和的**教练式四色下划线语义体系**——红色代表硬性纠错（Correctness）、蓝色代表简洁清晰（Clarity）、绿色代表词汇感染力（Engagement）、紫色代表语气得体度（Delivery）。这种颜色分工降低了用户面对几十条修改建议时的认知负荷。浏览器插件采用右下角低饱和度绿色 `G` 徽章作为环境态指示器，点击后逐条展开轻量建议卡片（Progressive Disclosure），而全文目标设定和统计指标则收纳在右侧抽屉里，不抢正文视觉焦点。

**市场反馈与呈现退化教训**：2024–2026 年间，这套克制的渐进披露被商业化指标破坏——`r/Grammarly` 与 `r/sysadmin` 大量吐槽插件弹窗激进推销 Pro、把正常人话强行改成刻板商务腔，且自带黑盒 `AI Detector` 因标点微调即在 `0%` 与 `90%` 间剧烈跳分。更典型的界面信任失范发生在 `Expert Review`：界面在未经授权的作家与记者名字旁挂上类似官方认证的对勾图标，让用户误以为背书真实存在，最终在 *Decoder* 访谈与联邦诉讼中引爆危机。

### 2.2 Superhuman Mail 与 Superhuman Go（含 Superhuman Docs）

**具体功能与 2025–2026 发展现状**：2025 年 Grammarly 收购 Coda 与 Superhuman Mail 后，构建出以 `Superhuman Mail`（Split Inbox 智能分流、长邮件串摘要、按本人历史风格自动起草回复）、`Superhuman Docs`（2026 年 7 月由 Coda 更名，已开放 MCP Server）和 `Superhuman Go`（由 Coda Brain 演化，通过 Go SDK 接入 Databricks、DeepL、Amplitude 等 20+ 伙伴 Agent，带域名外联白名单与不可逆动作确认）组成的套件。Pro 定价 \$12/月（年付，含 Docs 与 Go），Business 定价 \$33/席位/月（年付，打包 Mail 与 CRM/工单连接器）。

**设计思路与呈现效果深度分析**：Superhuman 团队在产品设计上有两条几乎写进工程纪律的信条。第一条是 **100ms 瞬时响应阈值**——借鉴 Gmail 创始人 Paul Buchheit 的人机交互研究，任何翻页、归档或指令呼出只要低于 100 毫秒，大脑就会将其感知为「肢体动作的直接延伸」而不打断心流，为此客户端不惜重投入本地缓存与激进预加载。第二条是 **全键盘驱动 + 万能 `Cmd+K` 命令面板**：所有功能在代码架构上先写为独立命令再绑定按钮与快捷键，用户无需记忆嵌套菜单位置，按 `Cmd+K` 搜意图即可完成操作并顺带记住快捷键。

**市场反馈**：`Superhuman Mail` 在高管、投资人与重度邮件用户群中依然保持极高心流口碑，Rahul Vohra 也顺势将邮箱定位为多 Agent 异步协作的收发总站；但母公司把 `Coda` 更名为 `Superhuman Docs` 在社区引发抵触，许多 Coda 老用户反馈在向企业客户介绍「Superhuman Docs」时命名显得中二且脱离原有品牌信任。

### 2.3 Writer.com

**具体功能与 2025–2026 发展现状**：Writer 已彻底走出「营销文案助手」定位，完成 \$2 亿 C 轮融资（累计融资约 \$3.69 亿，估值 \$19 亿–\$19.8 亿），ARR 突破 \$4,700 万，服务 Uber、L'Oréal、Vanguard、IBM 等数百家 Global 2000 企业。技术与产品核心包含自研合规基础模型族 **Palmyra**、支持图谱 RAG 的 **AI Studio / AI HQ**、跨部门自动执行的 **WRITER Agent**（含 Playbooks、Routines、Salesforce 等系统连接器及集中式 **Enterprise Brain** 品牌知识库），并通过 SOC 2 Type II、HIPAA 与 ISO 42001 认证。

**设计思路与呈现效果深度分析**：Writer 的 UI 刻意避开消费级 AI 产品的花哨动效与聊天气泡，呈现出高度克制的 B 端专业工作台气质。团队一旦上传品牌手册、禁词表与产品事实文档，写作界面默认在受控语气轨道内生成内容，免去反复写提示词的麻烦；管理员后台（AI Studio）则把每一次模型输出都纳入**会话日志 + 赞踩反馈追踪 + JSONL/CSV 导出**的治理闭环。

**市场反馈**：G2 与企业采购评价高度认可其安全性、品牌口径一致性以及医疗/金融等强监管行业的合规落地方案；批评则集中在「冷启动配置偏重」（需要先整理大量内部规则与文档才能发挥威力）、复杂多步数据流水线仍需人工兜底复核，以及门槛高到几乎排除个人与自由职业者。

### 2.4 Markup AI（原 Acrolinx）

**具体功能与 2025–2026 发展现状**：创立于语言学规则引擎时代的老牌企业内容治理厂商 Acrolinx，于 2025–2026 年正式更名为 **Markup AI（`markup.ai`）**。它在保持确定性术语库、拼写、可读性与包容性规则核心的基础上，推出 **Content Guardian Agents** 专门拦截并清洗企业内部 AI 产出的高风险草稿，同时上线 **MCP 集成**对接 Claude、ChatGPT 与私有大模型，延续与 Adobe AEM、FrameMaker、Google Docs 和 GitHub 的深度嵌入。

**设计思路与呈现效果深度分析**：Markup AI 在企业内容治理领域留下了两个经典呈现设计。一是把复杂的多维风格审计压缩成一个直观的 **Acrolinx Score（质量记分卡）**，让文档负责人和管理层能用单一分数横向追踪各部门达标率；二是跨工具统一的 **滑出式 Sidebar**——作者在原生文档工具右侧点击小对勾即可展开面板，通过顶部的场景风格指南下拉框切换写作类型，下面排列按问题类别分色的行内建议卡。

**市场反馈**：全球大型软件、制造与生命科学文档团队认为它是跨多语种和海量旧文档保持一致性的行业标杆；一线撰稿人的槽点同样鲜明——如果管理员规则调得过死，Sidebar 容易把合理的口语或创意表达标成错，且系统上线实施周期较长。

### 2.5 LanguageTool

**具体功能与 2025–2026 发展现状**：作为支持超过 30 种语言及多种英语方言的老牌多语检查工具，LanguageTool 已被拥有 QuillBot、Course Hero 与 Scribbr 的美国教育科技集团 **Learneo, Inc.** 收购，并于 2024 年底至 2026 年正式将服务条款与数据控制方变更为位于美国加州的 Learneo。功能上提供语法/拼写/排版检查、个人词典与 Simple / Standard / Formal 三档 AI 句式改写，个人年费折合约 \$5.83/月（年付约 \$70 档），深度覆盖浏览器扩展、Office、Apple Notes 与 Obsidian。

**设计思路与呈现效果深度分析**：LanguageTool 的界面克制得像一把顺手工具，核心亮点是可主动切换的 **`Picky Mode`（挑剔模式）**。平时默认只报客观错误与高频失误，界面干净、弹窗极少；只有作者完成初稿准备精修时，打开 `Picky Mode` 才会释放词句重复、冗余修饰与句式节奏等高密度提醒。这种「默认安静、按需严苛」的开关设计，有效避免了初学者和专业写作者之间的噪音冲突。

**市场反馈**：在非英语写作（尤其德语、西班牙语、法语）和“低打扰体验”上口碑长期优于 Grammarly；但被美企 Learneo 收购后，`r/privacy` 与 `r/BuyFromEU` 等欧洲隐私社群对其数据管辖权迁出德国表达强烈不满，开源与 Linux 社区也对其逐步将扩展高级能力锁进付费墙并向「Grammarly 化」演进感到担忧，部分小语种（如丹麦语）精度与订阅退订客服也存在抱怨。

### 2.6 QuillBot

**具体功能与 2025–2026 发展现状**：同在 Learneo 生态内的 QuillBot 凭借免费入口与全年高频 40%–50% 促销策略，守住了学生群体、博主与非母语写作者的大盘。产品线已从最初的同义词改写器扩展为全套工具箱，包括 5 种以上改写模式（Standard、Fluency、Formal、Academic、Creative）、AI 摘要、引文生成器、语法检查与 AI 检测器，并配齐 Chrome、Word 和 Google Docs 插件。

**设计思路与呈现效果深度分析**：QuillBot 在交互上最成功的发明是 **左右分栏实时对照（Split-Pane Diff）** 配合顶部的 **同义词替换力度滑杆（`Synonym Slider`）**。用户不用写任何 Prompt，只要拖动滑杆，就能直观控制大模型或词库“只换几个别扭词”还是“大幅重组句式”，右侧用高亮标出增删替换，大幅降低了非技术用户的操作心智成本。

**市场反馈**：Reddit（`r/QuillBot`、`r/studytips`）高度赞赏 `Synonym Slider` 对保留人声的精细控制力以及比手写 Prompt 更快清理赶工病句的效率；但用户普遍反馈 `Creative` 等高强度模式容易丢失原意并显出机械腔，免费版的字数硬门槛与升级弹框打断心流，且即便买了 Premium，过度改写后的文章依然容易触发 Turnitin / GPTZero 的 AI 检测警报。

### 2.7 Hemingway Editor & Hemingway Editor Plus

**具体功能与 2025–2026 发展现状**：Hemingway 坚持极简商业结构：网页端可读性诊断长期免登录免费开放作为最大搜索流量入口；传统离线桌面版维持 \$19.99 一次性买断（纯规则无 AI）；2025–2026 年主推的 **Hemingway Editor Plus** 按 AI 改写句数计费，个人 5K 档约 \$10/月（年付 \$100/年，折 \$8.33/月），10K 档约 \$12.50/月，支持 Markdown、HTML 与 Microsoft Word 导入导出以及全文结构建议。

**设计思路与呈现效果深度分析**：Hemingway 把「行文简洁度」做成一眼看穿的 **全句背景 6 色热图**：黄色标出偏难读长句、红色标出极难读长句、紫色提示有更短平的替代词、蓝色标出副词、绿色标出被动语态、青色提示多音节复杂词，右上角同步滚动 Flesch-Kincaid 可读性年级分。进入 Plus 版后，它没有随大流上线「一键重写整篇文章」，而是坚持 **逐句点击、逐句生成对比、逐句人工确认**，把控稿权牢牢留在作者手里。

**市场反馈**：文案策划、技术博客作者与非母语写作者极度喜爱它「几秒钟砍掉废话」的直观反馈；反面声音则指出硬性追求短句和零副词会削弱小说与随笔的韵律感，整体文档点评偏模板化（如泛泛建议补充感官细节），且 5,000 句的月度 AI 额度对高产创作者很容易见底。

### 2.8 ProWritingAid

**具体功能与 2025–2026 发展现状**：面向长篇小说作者与非虚构长文作者，ProWritingAid 通过 `Desktop Everywhere` 原生打通 Scrivener、Word、Google Docs、Apple Pages、Notion 与 Vellum。订阅定价分为 Premium（约 \$30/月或 \$120/年，含每日 1 次章节评审）与 Premium Pro（约 \$36/月或 \$144/年，含每日 30 次章节评审），另有 \$399–\$699 终身买断档；核心长文 AI 能力（**Virtual Beta Reader**、全书架构/人物/情节/市场化分析，单次覆盖最高 30 万词）则绑定在 **Story Credits** 额外点数（约 \$25–\$50/点）上。

**设计思路与呈现效果深度分析**：它的核心交互是 **25+ 专项诊断报表仪表盘**，专治长篇写作的隐性顽疾——例如抓出几百页里无意识重复的「回声词（Echoes）」、对话标签冗余、粘滞句（Sticky Sentences）和句长节奏波动；所有 AI 功能（`Sparks` 扩写/头脑风暴与 `Rephrase` 改写）都配备一键全关开关，方便排斥 AI 介入的小说作者纯用统计报表。其 `Virtual Beta Reader` 的呈现极具巧思：不给空洞总分，而是沿章节模拟真实试读者的情绪起伏，并直接标出「差点把书放下（Almost Put the Book Down）」的具体段落。

**市场反馈**：`r/selfpublish` 与 `r/ProWritingAid` 反馈其机械统计报表在长篇自修上几乎没有替代品，甚至许多作者惊叹 `Virtual Beta Reader` 挑出的节奏问题与后续真人试读者意见高度吻合；主要批评来自两处——传统报表数据过密容易令人无从下手，以及用户在支付年费后发现最吸引人的全书 Beta 读者还要另付 Story Credits 时的被收割感。

### 2.9 Apple Writing Tools 与 Microsoft 365 Copilot（含 Microsoft Editor）

**具体功能与 2025–2026 发展现状**：这两股力量代表平台巨头对独立写作工具的双向挤压。**Apple Writing Tools** 直接内嵌于 macOS、iPadOS 与 iOS 系统文本框，随系统免费提供校对、改写、调语气与摘要，采用端侧优先模型加可选云端路由；**Microsoft 365 Copilot** 则与 Word、Outlook、Teams、Excel 深度捆绑，在保留传统 `Microsoft Editor` 拼写语法底层的同时，引入多模型选择（支持 OpenAI 与 Anthropic 模型）、引用溯源及跨企业文档/会议纪要生成。

**设计思路与呈现效果深度分析**：两家的呈现哲学截然相反。Apple 走 **OS 级「零界面壳（Zero-Chrome）」路线**——选中任何文字即可呼出半透明系统悬浮菜单与紧凑药丸按钮（Proofread / Rewrite / Summarize），改写结果采用无感过渡与轻量对比卡片直接内联替换，不存在独立窗口或侧边栏，零学习成本。Microsoft 则走 **重型全功能工作区路线**——Word 顶部是传统 Ribbon 功能区，正文里有 Editor 的红蓝波浪线，按 `Alt+I` 弹出画布内联输入框，右侧还常驻着 Copilot 对话与审阅侧栏，功能极其密集。

**市场反馈**：Apple 赢得了一边倒的流畅度与低摩擦赞誉，但重度创作者指出它太浅层，无法支撑多轮结构推敲；Microsoft 凭借调取企业真实资料生成长报告的能力获得 B 端认可，却在可用性评测中频繁遭遇「界面臃肿」与「正文 ↔ 右侧 Copilot 栏视线来回乒乓（context-switching fatigue）」的抱怨，加之免费与付费 Copilot 入口屡次调整也增加了认知摩擦。

### 2.10 Harper 与 Vale（本地优先开源开发者派）

**具体功能与 2025–2026 发展现状**：开发者生态正迅速向纯本地零上传工具收敛。**Harper** 由 Elijah Potter 发起后已被 **Automattic**（WordPress.com 母公司）收购，截至 2026 年在 GitHub 累积超过 **1.6 万–1.7 万星标**。它用 Rust 编写内核（`harper-core`、`harper-ls` 与浏览器端 `harper.js` WASM），无需联网且不收集任何遥测，能在 **10 毫秒内** 完成拼写与英文语法检查。它的内存开销远小于 Java 底座的 LanguageTool，且天然忽略 Markdown 代码块。目前 Harper 已覆盖 VS Code/Cursor/Windsurf、Obsidian、Neovim（`trouble.nvim`）、Zed、Helix、Chrome/Firefox/Edge 与 WordPress。**Vale** 则是 Go 编写的 MIT 开源 CLI（已被 AWS、GitLab、Microsoft、Red Hat 用于 Docs-as-Code），支持 Markdown/AsciiDoc/reST/HTML 标记感知解析、`tree-sitter` 抽取代码注释，以及通过 `.vale.ini` 和 `vale sync` 复用企业 YAML 风格指南并接入 VS Code（`vale-ls`）与 GitHub Actions。

**设计思路与呈现效果深度分析**：两者共享一套克制的开发者视觉语言——**把 Prose 当作代码来 Lint**。不弹出营销卡片，不设炫目仪表盘，直接复用编辑器原生 LSP 诊断通道（波浪线 + `Cmd+.` 代码修复动作）与终端/PR 增量报告。Harper 靠零配置开箱即用吃下了个人笔记（Obsidian）与编码写文档流量；Vale 靠高度可编程的 YAML 规则与作用域过滤（`Views`）守住大型技术文档仓库的 CI 门禁。

**市场反馈**：`r/ObsidianMD`、`r/neovim` 与 `r/vscode` 把 Harper 视为替换云端语法插件的开源标杆，唯一缺口在于当前只支持英文且不做文风与 AI 味深度治理；Vale 的离线确定性与企业风格继承广受技术写作团队好评，但初期编写与调优 `.vale.ini` 规则的学习成本较高，规则过严容易在团队 PR 里造成大量误报刷屏。

---

## 3. 跨产品设计思路与呈现效果 6 大范式抽象

把上述 10 款产品的界面与交互拆到骨架层，2025–2026 年的写作与内容检查工具其实只收敛为 6 种核心呈现范式，每一种都有清晰的适用边界与反噬风险：

| 呈现范式 | 代表产品 | 最适配的使用阶段 | 视觉与交互机制 | 认知负荷与核心风险 |
|---|---|---|---|---|
| **1. 语义色下划线 + 渐进卡片** | Grammarly、LanguageTool | 实时起草与边写边改 | 用颜色区分错误性质（硬错/清晰/风格），正文只画细线，悬停或点击才展开单条建议卡 | 色彩超过 4 种或卡片叠加推广弹窗时，会退化成高噪音干扰源 |
| **2. 全句背景热图 + 逐句审计** | Hemingway Editor Plus | 初稿完成后的精简消肿 | 用高对比整句色块直接标出长难句与被动语态，AI 仅在逐句点击后给出单句改写确认 | 长期看着大面积黄红底色易产生视觉压迫，且硬规则易把多样文风削成单一短句体 |
| **3. 左右分栏 Diff + 力度滑杆** | QuillBot | 局部段落转述与语气微调 | 左原文右改稿实时高亮差异，靠滑杆或模式标签直接控制改写幅度 | 脱离整篇上下文时易把跨段逻辑改散，且分栏切换不利于长文档沉浸写作 |
| **4. 滑出侧栏 + 记分卡与报表** | Markup AI（Acrolinx）、ProWritingAid | 团队合规验收与长篇结构复盘 | 收纳为单一合规总分或 25+ 专项报表，搭配章节结构/弃读风险侧栏 | 信息密度极大且规则配置重，若直接放进日常起草界面会扼杀写作心流 |
| **5. OS 零界面壳 / 100ms 命令面板** | Apple Writing Tools、Superhuman Mail | 高频短文本与跨应用即时处理 | 零常驻面板，选中即出轻量浮窗，或用 `Cmd+K` 与全键盘流在 100ms 内完成触发与切换 | 缺少长篇全局视角与批量审计能力，一旦叠加常驻聊天侧栏（如 Word Copilot）即出现视线乒乓 |
| **6. 编辑器 LSP 波浪线 + CI 门禁** | Harper、Vale、`dislop` | 技术文档、前端交付与 Agent 产线 | 跳过代码块与 URL，用原生波浪线、`Cmd+.` 豁免与增量 PR 摘要实现零感知把关 | 规则若不区分硬伤与主观风格并设置熔断，会把自动化 Agent 或团队 PR 卡进死循环 |

---

## 4. 对 `dislop` 产品设计与呈现效果的 7 条直接借鉴

结合 [PRODUCT.md](../../../PRODUCT.md)、[design-system.zh-CN.md](../../design-system.zh-CN.md) 与 [ROADMAP.zh-CN.md](../../../ROADMAP.zh-CN.md)，10 款产品的一线设计得失可以直接转化为 `dislop` 四个产品接触面的具体设计原则：

| 借鉴来源与核心洞察 | 对 `dislop` 的具体设计落地 | 落点接触面 |
|---|---|---|
| **1. 吸收 Grammarly 语义克制 + Hemingway 逐句掌控，避开 6 色花屏** | 官网工作台继续严守「红实线硬伤 + 蓝虚线套话提醒 + 5 格白话节奏条」三件套，绝不堆出 5–6 种荧光背景；自愈改写只做逐段可审计 Diff 与数字/限定词保真标记，不黑盒覆盖全文 | `site/` 浏览器清样工作台 |
| **2. 吸收 LanguageTool `Picky Mode` + QuillBot 力度滑杆** | 默认开启零误报与低噪音标准模式，让作者和编码 Agent 不被误报淹没；只在需要深度精修时提供更严苛档位，云端 `dislop_deslop` 则显式区分「微调去味（保句骨与声纹）」和「结构精简」两种力度 | CLI / `site/` / 云端 MCP |
| **3. 吸收 ProWritingAid「AI 一键可关 + 弃读点模拟」** | 坚持纯确定性离线模式永远无需任何模型与联网；云端 `dislop_review` 借鉴 `Virtual Beta Reader` 标出「读者卡壳/质疑缺少证据点」的思路，结合匿名通用读者视角输出具体追问，同时严禁任何实名人物冒名 | `dislop` 内核 + `dislop-cloud` |
| **4. 吸收 Harper 的零配置毫秒体验，避开 Vale 的配置负担** | 保持 `src/core.mjs` 零外部依赖 `< 15ms` 启动与默认跳过代码块/URL/引用块，让 VS Code 与 Obsidian 扩展做到「装上即用、零 YAML 门槛」；仅向团队或进阶用户提供 `.dislop.local.json` 与 `dislop-ignore-next-line` | `integrations/vscode/`、Obsidian / Raycast |
| **5. 吸收 Superhuman `100ms / Cmd+K` 与 Apple 零界面壳，规避 Word 视线乒乓** | 编辑器内不做重型常驻聊天侧栏，优先通过轻量波浪线、悬停三段示例（原句 -> 改过头 -> 改干净）、`Cmd+.` 快速操作与 Raycast 快捷键在原地完成检查与处理 | VS Code / Cursor / Raycast |
| **6. 对标 Markup AI（Acrolinx）转型的 B 端信号** | Acrolinx 更名 Markup AI 并推出 `Content Guardian Agents` 与 MCP，证明「AI 产线内容门禁」已是明确企业刚需；`dislop` 应继续用 `packs/core` 零争议硬伤阻断 + 2 次熔断保护 + GitHub Action PR 摘要卡位研发与办公 Agent 流水线 | `action.yml`、`integrations/hooks/`、`dislop-cloud` |
| **7. 规避 ProWritingAid「订阅外再卖 Story Credits」的反感** | 保持 `dislop-cloud` 单一透明的统一额度池（`1 credit` 审校 / `2 credits` 自愈改写 / `5 credits` 视觉 VLM），绝不在 Pro 月费之外对核心功能再设高价隐性二次点数包 | `dislop-cloud` 计费与官网定价页 |
