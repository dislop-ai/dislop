# Grammarly 及相关产品对 `dislop` 的五层系统借鉴研报（战略 / 产品 / 设计 / 技术 / 运营）

日期：`2026-11-23` · 状态：静态快照综合研报（`snapshot-only`）

配套档案：[sources.json](./sources.json)（34 条已核验情报）· [dossier.zh-CN.md](./dossier.zh-CN.md) · [product-deep-dives.zh-CN.md](./product-deep-dives.zh-CN.md) · [grammarly-evolution-and-agent-lessons.zh-CN.md](../grammarly-evolution-and-agent-lessons.zh-CN.md)

关联基线：[PRODUCT.md](../../../PRODUCT.md) · [ROADMAP.zh-CN.md](../../../ROADMAP.zh-CN.md) · [design-system.zh-CN.md](../../design-system.zh-CN.md) · [brand-and-voice-guide.zh-CN.md](../../brand-and-voice-guide.zh-CN.md) · [business-model-and-open-core.zh-CN.md](../business-model-and-open-core.zh-CN.md) · [open-source-star-growth-strategy-2026.zh-CN.md](../open-source-star-growth-strategy-2026.zh-CN.md)

---

## 五层决策全景总表

把 10 款相关产品（Grammarly、Superhuman Mail & Go、Writer.com、Markup AI、LanguageTool、QuillBot、Hemingway Editor Plus、ProWritingAid、Apple Writing Tools / M365 Copilot、Harper / Vale）拆透之后，对 `dislop` 最有价值的结论可以压成下面五层坐标：

| 维度 | 正面参照产品 | 反面警示案例 | `dislop` 核心动作 | 可验证验收指标 |
|---|---|---|---|---|
| **战略层** | Harper（Automattic 收购、1.6 万–1.7 万★）、Writer、Markup AI | Grammarly 更名 Superhuman 割裂；\$10 亿担保融资倒逼扩盘 | 死守「Agent 交付物印前去 AI 味检查」单一心智；全档位零训练；只做协议薄壳 | 开源零规则 DLC；云端统一额度池毛利目标 `> 75%`；不自建编辑器或邮箱 |
| **产品层** | `Reader Reactions`、`Picky Mode`、`Synonym Slider`、Hemingway 逐句确认、`Authorship` | `Expert Review` 冒名诉讼；黑盒 AI 检测器误报；Story Credits 二次收费 | 云端增设匿名读者视角；区分微调与重构力度；PR 输出可复算质检凭据 | `dislop_review` 零实名预设；`dislop check` 维持诚实 `no known patterns found` |
| **设计层** | Grammarly 四色语义分层、Superhuman `100ms / Cmd+K`、Apple 零界面壳 | Word Copilot 侧栏视线乒乓；Grammarly 高频弹窗与刻板商务腔 | 守住红实线/蓝虚线双色校样网格、5 格白话节奏条与编辑区悬停三段对照 | `site/` 与 README 零弹窗、零侧栏乒乓，全文通过 `--fail-on info` 自审 |
| **技术层** | GECToR（标定不重写）、CoEdIT（小模型微调）、Harper Rust `< 10ms`、Vale CI | 脆弱全网页 DOM 注入与 macOS `AXUIElement` 高权限挂钩 | `< 15ms` 零依赖本地核 + `14.6 KB` Pocket ML + 云端保真手术修复 + Worktree 软链 | `dislop-bench v2` 双端一致、`18/18` 改稿保真、4 臂真实语料盲评 |
| **运营层** | Brad Hoover PLG、Hemingway 免费工作台引流、Harper 极客口碑、`skills.sh` 拆分 | 乞星模板帖、退订挽留暗黑弹窗、官网语种与仓库简介滞后 | 先修 `.gitattributes` 与简介数字，再 24–48 小时集中发图文对照与一行安装冲榜 | 仓库保持 JS/Python 主语言；16:9 原生对比图卡 + `#try=` 免注册试玩直达 |

---

## 1. 战略层（Strategy）：哑铃分化中的精准错位与商业纪律

### 1.1 行业结构判断：中间态正在消失

2026 年的写作与内容软件市场已经呈现清晰的**哑铃分化**。处于中间地带的「通用语法纠错与单轮句子润色」同时遭遇上方通用大模型（ChatGPT / Claude）与下方系统原生能力（Apple Writing Tools 随 macOS/iOS 免费内建）的双面吞噬；侧面又有 Microsoft 365 Copilot 在 Word 与 Outlook 捆绑企业预算。

结果是市场只剩两端有独立护城河。高端一极是 **Superhuman**（2026 年初年营收超 \$7 亿、DAU 超 4,000 万）、**Writer.com**（累计融资约 \$3.69 亿、估值 \$19 亿–\$19.8 亿、ARR 超 \$4,700 万）和 **Markup AI**（原 Acrolinx），它们靠自有企业知识图谱、合规审计与完整办公套件维持高客单价。轻量一极则是 **Harper**（已被 Automattic 收购、GitHub 1.6 万–1.7 万+ 星标）、**Vale**（获 AWS / GitLab / Red Hat 采用）以及 **`dislop`** 这类零上传、确定性、嵌进开发与办公工作流的轻资产基础设施。

### 1.2 三条战略卡位铁律

第一，**死守单一锐利心智，不做重品牌扩张**。Grammarly 在 2025 年 10 月将母公司更名为 Superhuman，2026 年 7 月又把 Coda 改名为 `Superhuman Docs`，引发老用户在 B 端推销时的明显违和感。`dislop` 必须把品牌认知牢牢钉在「Agent 交付物的印前去 AI 味检查」上，不向通用文档编辑器或邮件客户端扩张。

第二，**把隐私边界升格为长期战略资产**。LanguageTool 被美国教育科技集团 Learneo 收购并将数据控制方迁往加州后，欧洲隐私社群信任动摇；Grammarly 在 Free、个人 Pro 与官网自助团队档位仍默认开启训练授权（Opt-out 而非 Opt-in）。这恰好让 `dislop` 的「本地 100% 离线零上传 + 云端全档位付费零训练且原稿不落盘」形成降维信任优势。

第三，**顺势协议互操作，只做轻量薄壳**。Superhuman Docs 与 Markup AI 在 2026 年先后开放 MCP 接口，证明主流平台正在向标准协议收敛。`dislop` 坚持用 `SKILL.md`、`CLI`、`MCP` 与轻量 `VSIX` 寄生于用户现有宿主，能把研发精力集中到规则、基准和 `.docx`/`.pptx` 原排版解析上，而不是陷入多端重软件维护泥潭。

### 1.3 资本与盈利纪律

Max Lytvyn 在早期访谈中反复强调，Grammarly 前近十年坚持不拿风投、靠学生与高校订阅正现金流自造血；而后期为维持 \$130 亿估值引入的 \$10 亿非稀释营收担保融资，客观上推高了频繁弹窗逼单与向 \$33/席位/月套件上移的变现压力。同时，ProWritingAid 在年费之外对全书 Beta 读者加收 Story Credits（\$25–\$50/点）的做法在作者社群招致明显反感。

对应到 [business-model-and-open-core.zh-CN.md](../business-model-and-open-core.zh-CN.md)，`dislop` 应严守三条商业底线：开源核心与 7 套规则包永久免费（零规则 DLC）；云端 `dislop-cloud` 采用单一透明的统一额度池（Pro \$12/月 1,500 额度、PAYGO \$10 / 800 额度、Team \$29/席位/月），维持 `78%–88%` 测算毛利率；先跑通真实留存与免费 5/30 额度转化，再逐步解锁重资产云能力。

---

## 2. 产品层（Product）：分层可控审校闭环、人群梯度与伦理红线

### 2.1 可直接吸收的 5 项产品机制

| 竞品成功机制 | 解决的用户真痛点 | `dislop` 对应产品落地 |
|---|---|---|
| **Reader Reactions + Virtual Beta Reader** | 写作者发稿前看不见目标读者会在哪里卡壳或质疑 | 云端 `dislop_review` 探索**匿名通用读者视角**（技术评审 / 业务主管 / 外部新读者），标出空洞段落与缺证位置 |
| **LanguageTool `Picky Mode`** | 平时写初稿怕误报刷屏，定稿精修时又嫌规则太松 | 默认保持低噪音零误报基线；提供按需开启的严苛模式或 `--patterns` 扩展探针 |
| **QuillBot `Synonym Slider` + Hemingway 逐句确认** | 全文一键重写容易丢失原声或改坏事实，作者想握住方向盘 | 云端 `dislop_deslop` 区分「微调去味（保句骨与声纹）」与「结构精简」两档力度，配逐段可审计 Diff |
| **Grammarly `Authorship` 过程账本** | 高校与团队不信任黑盒 AI 率百分比，需要可核查的过程依据 | 拒绝概率打分，在 GitHub Action PR 摘要与 SARIF/JSON 输出命中规则、已修项、豁免注释与保真校验记录 |
| **Markup AI `Content Guardian Agents`** | AI 批量生成的企业草稿需要进入流水线前的一道确定性关卡 | 用 `packs/core` 硬伤阻断（`error`）+ 2 次熔断保护卡位 Orca / Herdr / Claude / Codex 交付门禁 |

### 2.2 三批用户与四大形态的分工边界

对齐 [PRODUCT.md](../../../PRODUCT.md) 的用户阶梯，第一批是 Coding Agent 用户，第二批是办公 Agent 用户，最后是所有用 AI 交付成果的人。四类产品形态的职责边界必须切干净：`SKILL.md` 与本地参考卡负责动笔前预防（`0` 联网）；开源 `CLI`、`VSIX` 与本地 stdio MCP 负责 `< 15ms` 离线标出硬伤与套话；网页工作台负责零注册体验与非终端用户交互；官方云端 MCP 负责免环境接入与多模型深审、原排版 `.docx`/`.pptx` 导出。

产品范围上同样要懂得克制：`dislop` 不与 **Harper** 拼英文常规拼写纠错，不与 **impeccable** 拼完整前端设计系统与 WCAG 审计，也不做 PDF 印前预检或独立通用 diff 工具，更不碰黑盒 AI 概率裁判与规避查重工具。

### 2.3 四条不可逾越的产品伦理红线

*Angwin v. Superhuman Platform, Inc.*（2026 年 3 月纽约南区联邦法院集体诉讼，索赔超 \$500 万）与 Nilay Patel 在 *Decoder* 节目上的追问，已经为所有审校工具划出了四条硬红线。第一，永久禁止任何在世或已故实名作者、学者、记者及商业品牌冒名预设。第二，绝不在机器生成的审校意见旁放置具有“官方认证或真人背书暗示”的对勾或头像。第三，绝不在任何免费或付费产品档位默认将用户文稿用于模型训练。第四，绝不上线以「降低 AI 检测率」「伪造错别字逃避监管」为卖点的规避功能。

---

## 3. 设计层（Design & UX）：印刷校样语言、心流保护与防同质化

对比 10 款产品的界面呈现后，`dislop` 在 [design-system.zh-CN.md](../../design-system.zh-CN.md) 与 [brand-and-voice-guide.zh-CN.md](../../brand-and-voice-guide.zh-CN.md) 中确立的设计选择获得了充分的跨产品实证支持。

在视觉与色彩上，应当**坚守克制，不做多色荧光花屏**。Grammarly 用红、蓝、绿、紫四色语义下划线拆解认知负荷，而 Hemingway 把整句染成 6 种背景色虽然一眼抓人，久看却易产生视觉压迫。`dislop` 坚持冷中性纸面（`#F6F7F5` / `#FFFFFF`）与深色单调亮度阶梯，仅保留朱红实线（`error`）与群青虚线（`warning`/`info`）加等宽字母标签，既保证无障碍可辨识，又避免五颜六色分散正文注意力。

在工作流交互上，要**护住写作心流，坚决规避「视线乒乓疲劳」**。Superhuman Mail 的 `100ms` 反馈阈值与 `Cmd+K` 全能命令面板证明，快捷指令先于嵌套菜单能保护高频操作流畅度；Apple Writing Tools 的零界面壳浮窗把打扰降到最低；反观 Microsoft Word 把功能区、Editor 窗格与常驻右侧 Copilot 聊天栏叠在一起，直接导致作者在正文与侧栏之间反复折返产生视线疲劳。因此，`dislop` 在 VS Code、Obsidian 与 Raycast 中不做重型常驻聊天侧栏，而是依靠原地波浪线、悬停三段对照（`原句 -> 改过头 -> 改干净`）与 `Cmd+.` 一键修复或豁免完成闭环。

在开关与弹窗纪律上，坚持**默认静态零打扰与 AI 一键可关**。Grammarly 后期最招老用户反感的是高频 Pro 弹窗与退订挽留框，QuillBot 免费字数墙也频繁打断思路；而 ProWritingAid 允许作者一键完全关闭所有生成式 AI 功能。`dislop` 网页工作台与编辑器扩展必须坚持默认纯本地离线运行，零营销弹窗，仅当用户主动点击云端审校或改写按钮时才发起同源请求。

在品牌文本自身上，**工具的文字先要像人话**。Grammarly 长期商务润色反而把大量文章磨成千篇一律的「Grammarly 腔」，Hemingway 的极短句硬规则也会削平细腻文风。`dislop` 自身的所有提示词、规则报错和官网指南必须严格通过 `dislop check --fail-on info`，不穿「校对戏服」，不写三段分号排比与段尾金句，并把中英文做成独立原生表达、严格零混排。

---

## 4. 技术层（Technology）：算法范式验证、轻薄客户端边界与硬骨头护城河

### 4.1 学术与工业算法范式的双边印证

Grammarly Research 公开的两篇关键论文，正好从学术和生产双侧验证了 `dislop` 的核心技术路线。2020 年的 **GECToR**（`arXiv:2005.12592`）证明，用编码器做词元级编辑标注（`"Tag, Not Rewrite"`）比慢速 seq2seq 整句重写快最高 10 倍，且不会误改本来没问题的句子。2023 年的 **CoEdIT**（`arXiv:2305.09857`）进一步证实，针对编辑指令微调的小模型体积比 GPT-3-Edit 小达 60 倍，却在定向编辑任务上反超通用大模型。

结合 Grammarly 后来披露的「每周超 1,000 亿次调用中 `98%` 跑在 `< 100ms` 定制小模型」与端侧约 `1B` 轻量模型实践，`dislop` 现有的三层计算架构完全站得住脚：

| 技术分层 | Grammarly / Harper / Vale 参照 | `dislop` 现有与演进实现 | 延迟与成本边界 |
|---|---|---|---|
| **L0：本地确定性核** | Grammarly 前置规则库、Harper Rust `< 10ms`、Vale 分作用域解析 | Node `src/core.mjs` 与 Python `src/dislop/engine.py` 双端零依赖内核（7 包 53 规则 + 65 模式 + 分区掩码） | `< 15ms`、\$0、100% 离线 |
| **L1：本地轻量模型** | GECToR 序列标注、Grammarly ~1B 端侧小模型 | 随包 `14.6 KB` `pocket-slop-v1` + 硬件感知按需选装 `0.6B–4B` GGUF（`dislop model`） | 毫秒级 / 本机推理、零上传 |
| **L2：托管自愈云端** | CoEdIT 定向微调小模型替代盲目调重模型 | `dislop-cloud` 确定性预检 + 轻量付费模型（约 \$0.09–\$0.36 / 1k 次）分文体改写 + 内部数字/限定词保真护栏 | 约 1.2 秒、单次成本 < \$0.005 |

### 4.2 客户端接入边界：避开重客户端泥潭

浏览器端重度 DOM 注入（需要维护类似 Focal / Embrace 的状态引擎）与 macOS `AXUIElement` 系统辅助功能权限虽然能覆盖百万输入框，但权限敏感度极高、易与富文本编辑器抢焦点，且无法进入自动化 CI。`dislop` 借鉴 Harper（`harper-ls` / `harper.js` WASM）与 Vale（`vale-ls` / CLI）的思路，用同一份零依赖 `src/core.mjs` 同时驱动浏览器工作台、Web 兼容 `.vsix`、Obsidian 插件与 Raycast 命令，并用标准化 `SKILL.md`、`.claude-plugin/`、`.codex-plugin/`、`.cursor-plugin/`、`integrations/orca/` 与 `integrations/herdr/`（含 Worktree 软链和 2 次熔断）接通编码与多 Agent 编排器。

### 4.3 把算力与工程砸向对手懒得啃的 3 块硬骨头

Rahul Vohra 在并购后的访谈中点破 AI 时代护城河的迁移：当生成代码的门槛趋近于零，真正的壁垒转移到了分发管道、持续执行以及**解决竞争对手嫌麻烦不愿啃的硬核工作流**。对 `dislop` 而言，这三块硬骨头非常明确：第一，真实中英文长文保留评测集与 4 臂盲评基线（对应 [ROADMAP.zh-CN.md](../../../ROADMAP.zh-CN.md) 轨道 E）；第二，拆解 OOXML 并在内部保真护栏复核数字后保留原样式导出 `.docx` 与 `.pptx`（Round-Trip）；第三，无头渲染真实页面与幻灯片截图并用 VLM 审校版式拥挤和模板味（Visual Anti-Slop）。

---

## 5. 运营与增长层（Operations & Growth）：冷启动破圈、PLG 漏斗与信任运营

把 Grammarly、Hemingway、Harper、QuillBot 的增长手法和本仓 [open-source-star-growth-strategy-2026.zh-CN.md](../open-source-star-growth-strategy-2026.zh-CN.md) 合并成一套可落地的运营打法：

1. **仓库算法基建先于一切发声（Stage 0）**：在向外引流前，先用 `.gitattributes` 把生成的 `site/` 大体量 HTML 标为 `linguist-generated=true`，确保主仓保持 JavaScript / Python 主语言以保住对应语种 GitHub Trending 榜单资格；同时把线上仓库简介从 `42 rules` 同步至 `53 rules` 与 90 条工具清单。
2. **PLG 双轮驱动 + GitHub Action 被动裂变（学 Brad Hoover 与 Vale）**：免费零依赖 CLI、Skill 与 `.vsix` 负责个人开发者零门槛装机；团队仓库只要挂上 `action.yml`，每次 PR 检查底部的克制统计摘要就会把所有协作者变成新访客，自然向 Team 版品牌声纹与 GitHub App 导流。
3. **免登录清样工作台 + SEO/GEO 内容承接（学 Hemingway 与内容战略）**：维持 `dislop.com` 免注册零上传体验，利用 `#try=` 预填直达样例降低 Show HN 与社交帖的试玩摩擦力；并用独立中英文静态教程与 106 页规则百科承接长尾搜索和 AI 检索引用。
4. **多平台商店蓝海抢位与场景拆分（学 Harper 与 `skills.sh` 实证）**：围绕「开源、`< 15ms`、零上传、中文/英文/Office/UI 去 AI 味」集中冲刺 Antigravity、Gemini CLI、Claude/Codex/Cursor 目录、VS Code/Open VSX、Obsidian 与 Raycast；同时评估将 `work-docs`、`web-ui`、`office`、`essay` 作为可独立发现条目暴露给 `skills.sh`。
5. **反套路技术传播与诚信边界（避开 QuillBot / Grammarly 疲劳）**：在 24–48 小时集中首发窗口内，用 16:9 原生图卡呈现 `Before / Still AI / After` 真实对比、突出 macOS 一行命令即装即跑并坦诚交代能力边界（不做代码 AST、不做黑盒 AI 率打分），彻底远离情绪化乞星帖与促销弹窗疲劳。

---

## 6. 反面禁忌总清单、止损冻结与 30/90 天执行门禁

### 6.1 绝不踩的 8 条红线（Anti-Roadmap）

| 绝对禁止动作 | 竞品反面出处 | `dislop` 正确替代方案 |
|---|---|---|
| **1. 冒名实名人物或品牌做审稿/仿写预设** | `Expert Review`（*Angwin v. Superhuman* 集体诉讼） | 仅做匿名通用职业读者视角；`voice` 画像只从本人自愿提供的本地历史稿统计 |
| **2. 上线黑盒「AI 生成概率百分比」检测器** | Grammarly `AI Detector`（增删逗号即跳分与利益冲突） | 坚持可解释确定性规则定位，输出诚实口径 `no known patterns found` |
| **3. 消费端/免费端默认拿用户文稿训练模型** | Grammarly Free/Pro 默认 Opt-out；LanguageTool 迁美隐私疑虑 | 本地工具 100% 离线零上传；云端全档位统一走付费零训练端点且原稿不落盘 |
| **4. 堆叠高频升级弹窗与退订挽留暗黑模式** | Reddit 对 Grammarly 与 QuillBot 弹窗打断心流的集中吐槽 | 工作台与编辑器零营销弹窗，仅在需要云端深审/原排版导出时清晰标价引导 |
| **5. 在订阅费之外再套高价核心点数包** | ProWritingAid 年费外另卖 Story Credits（\$25–\$50/点） | `dislop-cloud` 采用单一透明统一额度池，Pro 与 PAYGO 自由组合 |
| **6. 自建重型文档编辑器、邮箱或全网页 DOM 注入** | Superhuman 重并购包袱；Grammarly `AXUIElement` 高权限门槛 | 坚持协议薄壳（Skill / CLI / MCP / VSIX），把主战场留给用户既有工具 |
| **7. 用主观文风告警死锁每一次保存或 Agent 调用** | Vale 配置过严导致 PR 误报刷屏；Acrolinx 规则过于死板 | 默认仅对 `packs/core` 客观硬伤阻断，且内置同一文件连续 2 次拦截熔断 |
| **8. 提供「降检测率 / 伪造错字绕过查重」功能** | 灰色规避工具破坏事实准确性且触碰合规边界 | 严守提升清晰度、去除模板味与保真数字/限定词的诚实审校定位 |

### 6.2 现状红队校准与 30 天冻结清单（Stop-Doing）

对标当前真实起点（仓库刚对外公开、工程与文档表面已铺开十余个、外部采用与第一方漏斗计数尚未建立），必须先纠正三处认知偏差，再谈增长与变现。

第一，**把「确定性、零边际成本、CI 免密钥」放到比「本地隐私」更靠前的位置**。Coding Agent 用户的草稿本就经过云端大模型，Grammarly 默认 Opt-out 仍有 4,000 万 DAU，说明「零上传」在采购时是准入加分项，但在拉新时不如「同输入同结果、每次运行零成本、断网和 CI 无需配 API Key」更有结构不可替代性。

第二，**承认通用词表会随模型升级折旧，真正耐用的资产在交付硬伤与本地规矩**。72K★ 的 `humanizer` 证明单一 Markdown 技能已吃掉大部分「怎么写得更像人」的需求，而旗舰模型会不断把高频套词训掉。通用文风规则不再盲目扩张，长期不可替代的价值集中在 `packs/core` 客观交付事故、项目私有术语规则（`.dislop.local.json`）与 `.docx`/`.pptx` 原排版去味。

第三，**先把顺序摆正：先装量具与外部保留集，再小规模种子测试，最后才动大型首发**。在自建样本上跑出的 `100%` 指标不能直接作为对外核心卖点，必须撤回首页自证口径，改用包含「单用免费 Skill」对照组的外部盲评保留集来验证真实增量。同时，在已有产品表面未跑出外部留存前，未来 30 天执行以下冻结策略：

| 冻结或暂缓事项 | 30 天处置方式 | 解冻恢复条件 |
|---|---|---|
| 新规则、新行业包、新反模式及双端扩展 | 冻结增量开发，仅修真实用户反馈的误报 | 外部保留集跑完且收到至少 5 条外部规则需求 |
| 新插件商店与新客户端适配（Obsidian / Raycast / 新目录开发） | 暂缓新增工程投入（已成品仅做零开发上架） | 90 天主线过闸且收到至少 3 次外部点名需求 |
| 云端重功能扩展（视觉审校扩建、声纹同步、Team 套件） | 保持既有可用状态，不加新功能也不作主推 | 对应能力达到月调用至少 200 次的真实信号 |
| 本地 Pocket ML / GGUF 迭代与新竞品研究 | 暂停新开发与新研报编写，只记录真实实验日志 | 保留集客观证明本地模型组具备明确净增益 |
| Show HN 与全平台 48 小时集中大首发 | 推迟触发，避免在零量具状态下浪费唯一一次首发红利 | 种子曝光与外部保留集双双通过 Go 门禁 |

### 6.3 30 天 / 90 天发展建议与 Go / Pivot 验证门禁

未来 30 天将 80% 精力收口到三件事（其余 20% 用于快速修复种子用户暴露的误报与文档口径错位）：

| 30 天聚焦动作 | 核心执行内容 | Go 过关门禁 | Kill / Pivot 止损转向线 |
|---|---|---|---|
| **1. 第一方量具校准 + 小规模种子测试** | 补齐官网匿名聚合计数（工作台检查、`#try=` 打开、注册与转换事件，CLI 保持零遥测），同步仓库简介与文档口径，发 1 篇中文与 1 篇英文种子帖并附上「装免费 Skill 前后对比」链接 | 独立访客 `>= 300` 时，工作台实跑检查率 `>= 15%`，仓库访客转星率 `>= 3%`，收到 `>= 5` 条非本人的具体反馈 | 达 300 访客但跑检查 `< 5%` 或转星 `< 1%` 时，只允许换 1 次切入点重测；二次仍未过则暂缓大型首发并重定定位 |
| **2. 外部保留集与四组盲评** | 收集 120–200 份中英文真实保留样本（一半为多模型生成含是否加载 Skill，一半为 2022 年前公开人类文本），由非规则编写者盲标封存；对比裸写、单用免费 Skill、Skill + `dislop` 验收、云端改写四组 | 人类文本提醒级误报率 `<= 5%`、`core` 硬伤误报 `<= 1%`；加装 `dislop` 验收较单用免费 Skill 盲评胜率 `>= 60%` 或残留套话减少 `>= 30%` | 人类误报 `> 10%` 或加装验收胜率 `< 55%` 时，停止宣传「通用 AI 味检测」，全面收窄为「`core` 交付硬伤门禁 + 精简 Skill」 |
| **3. 10 分钟接入的 Agent 验收门禁 + 10 个外部伙伴** | 把 `Stop` hook、`pre-commit` 与 GitHub Action 压成一行极简配置，在 PR 摘要输出可复算质检凭据，并一对一陪跑邀请外部开源或个人仓库接入 | 第 30 天公开代码搜索可见 `>= 10` 个外部仓库配置 `dislop`，其中 `>= 6` 个在 14 天后仍活跃运行，且修完并回访 `>= 3` 条真实误报 | 主动邀请 `>= 30` 个候选后装上 `< 3` 个或 14 天留存 `< 30%` 时，放弃编码 PR 门禁主线，转向 Office 原排版赛道 |

在 **90 天主攻场景拍板** 上，资源按以下顺序严格分配，不四面出击：

1. **首选主线：Coding Agent 与 Git PR「确定性交付验收门禁」**。对外把 `dislop` 定位成 `humanizer` / `impeccable` 等嘱咐型写作技能的「交付前自动化验收测试」（Skill 负责教 Agent 怎么写，`dislop` 负责用零成本确定性规则验收它是否真做到了），顺带用 1 周小成本试做「开源维护者 PR/Issue `core` 硬伤打标器」，先拿真实留存与协作裂变，再于第 60 天后评估私有仓 GitHub App 收费模式。
2. **次选付费探针：Office（`.docx`/`.pptx`）原排版去味**。该场景具备非技术用户强付费意愿与 OOXML 保真壁垒，但缺少自然分发渠道。30 天内仅在工作台上线「拖入文件出免费本地体检报告，点击保留排版一键改写再进登录与额度」极简探针；仅当 30 天内体检 `>= 100` 次、改写点击率 `>= 20%` 且 `>= 10` 人用完免费额度时，才开通早期收款链接，否则继续冻结重投入。
3. **暂缓方向：个人声纹 + 读者视角、重型企业品牌治理**。通用大模型原生自定义指令已大幅压缩纯声纹与简单读者提示的独立产品空间，企业合规治理则受制于冷启动信用与长销售周期，二者均不单独抽调资源（仅以 `.dislop.local.json` 在 CI 里的团队复用作为自然种子）。

第 90 天设立明确总闸：若外部活跃安装达 `>= 50` 个仓库或付费加预付用户达 `>= 10` 个，则继续加码并按数据淘汰零使用表面；若处于 10–50 个仓库且付费不足 10 个，则收口为低维护开源项目与内容资产；若外部活跃不足 10 个且零付费，则全面停止商业化投入。
