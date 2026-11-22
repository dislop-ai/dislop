import {
  analyzeTextProfile,
  auditOoxmlEntries,
  auditText,
  detectModality,
  extractVoiceProfileOffline,
  resolveEffectivePack,
} from "./engine/core.mjs";
import { PACKS_BY_ID, RULE_UI_META } from "./engine/packs-data.mjs";

// ---------- Native Bilingual Copy (Default ZH, Native EN — Zero Translationese) ----------

const I18N = {
  zh: {
    "page.title": "dislop — AI 味检查工具（Linter for AI Slop）",
    "nav.skip": "跳至正文",
    "nav.cases": "案例",
    "nav.workbench": "在线试",
    "nav.surfaces": "怎么用",
    "nav.pricing": "开源与云端",
    "nav.awesome": "87 条清单",
    "nav.rules": "规则",
    "nav.github": "GitHub ★",
    "theme.dark": "深色",
    "theme.light": "浅色",
    "btn.copy": "复制",
    "btn.copied": "已复制",

    "lead.strike": "好的，以下是为您润色后的版本。",
    "lead.title": "帮你（的 Agent）挑出并改掉文档、网页和 PPT 里的 AI 味",
    "lead.sub":
      "专用的 AI 味检查工具（Linter for AI Slop）。整合社区验证过的去味规则、语料经验与 87 条精选工具，一行命令接入主流 Coding Agent、办公 Agent 与编辑器；CLI 与本地插件可纯本地零上传，下方工作台可随时切换本地检查与云增强（MCP）模式。",
    "lead.promptLabel": "或者免安装：复制这句话直接发给任意联网 AI / Agent",
    "lead.promptText":
      "先读 https://dislop.com/llms.txt，按里面整理的文案和设计去 AI 味规矩与检查方法，帮我把接下来这份稿子发之前过一遍。",
    "lead.copyPromptBtn": "复制发给 AI",
    "lead.cta": "在工作台试用（本地 / 云增强）↓",
    "lead.cloudBtn": "免费领 30 额度远程 MCP 密钥",
    "lead.installBtn": "装进 Agent / 编辑器（可纯本地）",
    "lead.awesomeBtn": "工具清单 →",
    "lead.starBtn": "GitHub ★",
    "lead.reassure": "CLI 与本地插件纯本地运行、零上传；网页工作台支持本地规则检查与云增强（MCP）模式切换。",

    "hp.tabBad": "原稿",
    "hp.tabTrap": "换了种 AI 味",
    "hp.tabGood": "改干净了",
    "hp.meta": "用同一个检查引擎实时跑的",
    "hp.openWb": "在下面工作台打开 →",

    "m1.title": "1. 集成社区优质成果",
    "m1.desc": "整合经过核验的开源去味项目、语料经验与 87 条精选工具，覆盖文稿、网页和 Word/PPT，不用自己到处搜集拼凑。",
    "m2.title": "2. 多端与多场景兼容",
    "m2.desc": "内置研发、商务、前端与演示等 7 套场景包，提供 Skill、Plugin、CLI 与 MCP，一行命令接入 Codex、Claude Code、Cursor、WorkBuddy 等 Agent 与编辑器。",
    "m3.title": "3. 本地离线 + 云增强 MCP 切换",
    "m3.desc": "CLI 与本地插件纯本地运行、零上传；在工作台或远程 MCP 切到云增强模式，即可直接用大模型深层审校、一键改写并同步个人文风（每月 30 免费额度）。",

    "cases.title": "三个真实案例：为什么删了套词还是像 AI",
    "cases.desc":
      "删掉“抓手”“赋能”这类高频词之后，模型常会换成“不是 A，而是 B”这类反转口号，或者写出规则报 0 问题、读起来依然像推销稿的句子。下面三组对照可以直接试，也可以一键复制分享。",
    "cases.readAll": "看全部对照案例（.md）→",

    "demos.title": "6 秒看懂怎么查：从原稿到改干净",
    "demos.desc":
      "四段动画对应四个最常见场景：三态文字校样、终端离线检查、浏览器工作台实操，以及网页模板味清理。全部本地渲染，无外域请求。",
    "demos.guideLink": "GIF 制作与规范 →",
    "demos.c1Title": "1. 三态文字校样：防改过头换成反转口号",
    "demos.c1Desc": "先用红实线划掉开头寒暄，再用蓝虚线抓出“不是……而是……”反转口号，最后只留动作和 45 秒真实指标。",
    "demos.c2Title": "2. 命令行门禁：Node 与 Python 结果一致",
    "demos.c2Desc": "本地跑 dislop check --profile，硬伤直接返回退出码 1 卡住 CI，顺带输出句长起伏与具体度体检。",
    "demos.c3Title": "3. 浏览器离线工作台：真机操作实录",
    "demos.c3Desc": "就是本页上方的工作台。贴稿子、点切规则包、实时对齐右侧行号批注，全程在当前标签页内完成。",
    "demos.c4Title": "4. 网页与组件：清掉默认紫粉模板和死按钮",
    "demos.c4Desc": "直接扫 HTML/CSS/JSX 里的渐变标题、装饰徽章、胶囊堆叠和 href=\"#\" 假按钮，退回干净可用的界面。",

    "wb.heading": "直接在这里试一试（支持粘贴或拖拽本地文件）",
    "wb.packLabel": "内置场景包（0 联网）：",
    "pack.brief": "工作文档 / 方案",
    "pack.eng": "研发文档 / PR / 复盘",
    "pack.reg": "对外发布 / 严谨合规",
    "pack.exec": "汇报 PPT / 结论页",
    "pack.essay": "随笔 / 长文",
    "pack.ui": "网页与组件",
    "wb.openFile": "打开本地文件（.md / .html / .docx / .pptx）",
    "wb.specimensTitle": "示例",
    "wb.privacyNote": "本地基础检查在当前标签页运行；登录后点击下方云增强（MCP）按钮时才会调用官方零训练模型端点，不存草稿。",
    "wb.jumpNotes": "看批注详情 ↓",
    "ai.reviewBtn": "云端深度审校 · MCP（1 额度）",
    "ai.deslopBtn": "云端改写 · MCP（2 额度）",
    "ai.anonHint": "本地检查免登录零上传 · 云端审校与改写需登录（每月免费 30 额度）",
    "ai.claimLink": "领免费密钥 →",
    "voice.drawerTitle": "可选：提取个人文风（支持本地统计，或云端 AI 提炼）",
    "voice.drawerDesc": "贴入 1–3 段你自己写过的干净文字（用空行隔开）。点「本地统计文风」在当前标签页完成；也可登录免费密钥调用云端模型提炼并跨端同步。",
    "voice.offlineBtn": "本地统计文风（0 额度 · 不联网）",
    "voice.extractBtn": "云端 AI 提炼文风（2 额度）",
    "voice.clearBtn": "清除已保存文风",
    "wb.modeProof": "标出问题",
    "wb.modeEdit": "编辑原文",
    "wb.pasteOwn": "贴我的稿子",
    "wb.applyClean": "看改好的",
    "wb.tryTrap": "看换了种 AI 味的",
    "wb.reset": "还原",
    "wb.voiceTitle": "5 轴节奏与细节体检",
    "wb.nudgeText": "试完觉得顺手？需要绝对离线可装开源 Skill / CLI；想让办公与编码 Agent 接入多模型深度审校，10 秒登录领免费 30 额度官方 MCP。",
    "wb.nudgeCloud": "领免费 30 额度 ↓",
    "wb.nudgeInstall": "装开源 Skill / CLI ↓",
    "wb.nudgeCopy": "复制发给 AI",
    "wb.nudgeStar": "GitHub ★",
    "legend.error": "红实线：AI 残留硬伤",
    "legend.warn": "蓝虚线：套话与模板味",

    "surf.title": "怎么用：纯文档 Skill → 开源本地 CLI → 官方云端 MCP",
    "surf.desc":
      "产品分为三层：纯文档 Skill（动笔前避坑）、开源本地 CLI（零依赖快检与 CI 门禁）、官方云端 MCP（https://dislop.com/mcp，免配本地环境做多模型分文体审校）。",
    "surf.readTools": "完整接入文档（.md）→",
    "surf.w1Title": "1. 开源纯文档 Skill（动笔前防呆）",
    "surf.w1Desc": "按文体整理的写作与界面避坑参考卡，不含可执行脚本。装进 Claude Code、Codex、Cursor 或 Antigravity 后，动笔前读取，写完调用本地 CLI 自检。",
    "surf.w2Title": "2. 开源本地 CLI 与插件（零依赖快检）",
    "surf.w2Desc": "< 250 KB 零依赖直接内置全部 7 套规则包，断网毫秒级查文档、Word、PPT 与 Git 改动；适合终端、编辑器与 CI，开发者也可配自有密钥做深度审校。",
    "surf.w3Title": "3. 官方云端 MCP（办公与编码 Agent 直连）",
    "surf.w3Desc": "在 WorkBuddy、千问、Claude Cowork 或编辑器里直连 https://dislop.com/mcp，登录领每月 30 免费额度，做多模型分文体审校并返回结构化改法。",
    "surf.w4Title": "4. 网页工作台与一句话读规则",
    "surf.w4Desc": "浏览器工作台可先看对比样例和做本地基础检查，登录后使用云端审校；不装任何工具时，也可让联网对话先读 dislop.com/llms.txt。",
    "snip.prompt": "发给 AI",
    "snip.cloud": "官方 MCP（云端）",
    "snip.localMcp": "官方 MCP",
    "snip.cli": "命令行",

    "price.title": "开源本地免费，云端按需升级",
    "price.desc":
      "Skill、CLI 与规则库按 Apache-2.0 开源，支持纯本地离线运行、零上传。需要大模型深层文风审校、复检改写与官方云端 MCP 时，可在登录工作台或 Agent 授权后使用（免费版每月 30 次额度，付费端点不用于模型训练）。",
    "price.benchLink": "看 5 模型实测对比 →",
    "price.t1Name": "开源本地（Skill + CLI）",
    "price.t1Price": "$0 · 永久免费",
    "price.t1Sub": "适合重视数据隐私的个人、研发团队与内网环境，代码与规则全部开源透明。",
    "price.t1F1": "纯文档 Agent Skill（不含脚本）与开源本地 CLI（Apache-2.0）",
    "price.t1F2": "全量内置 7 套场景与行业包（42 条规则），离线查文档、Word、PPT 与 PR",
    "price.t1F3": "内置 5 轴节奏体检、14.6 KB 轻量本地模型（--ml）与 dislop voice 离线个人文风",
    "price.t1F4": "零联网零上传；开发者也可配自有密钥做单步审校",
    "price.t1Cta": "安装 Skill / CLI ↑",
    "price.t2Name": "云端免费版（远程 MCP）",
    "price.t2Price": "$0 · 30 额度 / 月",
    "price.t2Sub": "邮箱领取免费密钥，无需绑卡，立即在官网工作台或远程 MCP 使用。",
    "price.t2F1": "直连 https://dislop.com/mcp，免本地装环境（单次最长 12,000 字）",
    "price.t2F2": "云增强审校（1 额度）：查出推销腔、官话与套话，给出具体改法",
    "price.t2F3": "云增强改写（2 额度）：自动改写后复检，核对原稿数字与限定词",
    "price.t2F4": "个人文风提取（2 额度）：1–3 篇旧稿提炼专属文风，工作台与远程 MCP 均可用",
    "price.t2Cta": "下方 10 秒免费领密钥 ↓",
    "price.t3Name": "Pro · 按量包 · Team（早鸟预约）",
    "price.t3Price": "$12/月 · $10 按量",
    "price.t3Sub": "高频写作选 Pro 更划算（比按量省 36%）；低频偶尔用可选永不过期的按量包。",
    "price.t3F1": "Pro（$12/月）：1,500 额度/月（约 $0.008/额度），长文不限字数 + 10 份个人文风",
    "price.t3F2": "按量额度包（$10 / 800 额度）：一次购买永不过期，低频重度用户友好",
    "price.t3F3": "Team（$29/席位/月）：5,000 额度 + 团队共享品牌文风与 PR 审核",
    "price.t3F4": "统一使用 Google Gemini 付费级端点，不存草稿、绝不用于模型训练",
    "price.t3Cta": "预约开通通知 ↓",

    "cloud.tokenTitle": "免费领取 30 额度 + 远程 MCP 密钥",
    "cloud.tokenDesc": "输入邮箱立即生成专属密钥，自动同步到上方工作台，无需绑卡（服务端不存明文与草稿，详见页面底部隐私说明）。",
    "cloud.tokenBtn": "领取免费密钥",
    "cloud.wlTitle": "预约 Pro / 按量包 / Team",
    "cloud.wlDesc": "自助支付即将上线。留下邮箱和需要的方案，上线第一时间通知并附赠早鸟体验额度。",
    "cloud.planPro": "Pro（$12/月 · 1,500 额度）",
    "cloud.planCredits": "按量包（$10 / 800 额度 · 永不过期）",
    "cloud.planTeam": "Team（$29/席位 · 团队文风）",
    "cloud.wlBtn": "提交预约",
    "ep.foldTitle": "给 Agent / 开发者看：静态 Markdown 与 JSON 接口",
    "ep.foldSub": "/llms.txt · /catalog.json · 任务卡 · 规则卡（纯静态，展开查看）",
    "ep.heading": "给 Agent 读的静态文档（纯 Markdown / JSON）",
    "ep.llms": "Agent 入口索引",
    "ep.catalog": "全部文档的 JSON 目录",
    "ep.taskBiz": "任务卡：工作文档与技术方案",
    "ep.taskWeb": "任务卡：网页与 PPT 模板味",
    "ep.taskEdit": "任务卡：随笔与长文",
    "ep.taskGate": "任务卡：发稿前 AI 残留硬伤检查",
    "ep.skill": "跨宿主 Agent Skill",
    "ep.awesome": "87 条工具清单 JSON",
    "ep.brief": "产品定义（定位 / 用户 / 卖点）",
    "ep.method": "文案与设计基准",
    "ep.full": "单次拉取的全部 42 条规则",

    "awesome.title": "去 AI 味工具清单：87 个核验工具与参考资料",
    "awesome.desc":
      "除了 dislop 自己，我们也维护了一份按场景整理的去 AI 味资源索引，包含成熟检查器、中英文写作规范、代码提交治理规则和实证论文。全部链接在 2026-11-21 逐条核过一遍。",
    "awesome.openFull": "打开完整清单 →",
    "awesome.ecoTitle": "按用途筛选，也可以直接给 Agent 读",
    "awesome.ecoDesc": "按写作、网页、代码、研究分类筛选，或者只看能本地自动检查的工具。AI 检测器和规避工具单独放在最下面做对照。",
    "awesome.browseBtn": "在线筛选 87 条清单 →",
    "awesome.ghBtn": "GitHub 中文版",
    "awesome.shareBtn": "复制清单推荐语",
    "awesome.posTitle": "不想长成 AI 模板？看看这些设计参考",
    "awesome.posDesc": "除了去套话，还存了 31 个印刷、字体厂和独立出版站点，做网页或排版时拿来找灵感很管用。",
    "awesome.posAll": "全部 31 个参考（.md）→",
    "stat.entries": "条资料",
    "stat.sections": "个分类",
    "stat.det": "个可自动检查",
    "stat.zh": "条中文 / 多语种",

    "share.title": "觉得顺手？发给同事，或者去 GitHub 收藏",
    "share.desc": "纯文档 Skill、开源本地 CLI 与全部 42 条内置规则按 Apache-2.0 开源，支持纯本地零上传；网页工作台与官方云端 MCP 登录后可使用多模型深层审校，且不存草稿。",
    "share.c1Title": "一键分享给团队或朋友",
    "share.c1Desc": "复制一段直白不浮夸的介绍（带官网试用链接、案例页和工具清单），直接贴到群聊或文档里就行。",
    "share.copySiteBtn": "复制项目推荐语",
    "share.copyCasesBtn": "复制案例页链接",
    "share.c2Title": "去 GitHub 收藏仓库",
    "share.c2Desc": "检查引擎、纯文档 Skill、Plugin、命令行和 Awesome Anti-Slop 清单都在同一个仓库，点个 Star 方便以后找。",
    "share.starCta": "GitHub 点 Star ★",
    "share.c3Title": "一起补案例、规则和工具",
    "share.c3Desc": "遇到特别典型的 AI 味翻车案例，或者发现好用的去 AI 味工具没进清单，欢迎在路线图或 Issue 里一起补。",
    "share.roadmapCta": "看路线图 →",
    "share.issueCta": "投稿案例 / 工具",

    "cov.title": "支持哪些文件，哪些还查不了",
    "cov.desc": "能查的和还没做的都写明白。损坏或读不出来的文档会直接报跳过，不会显示成 0 问题。",
    "cov.readMd": "看纯文本说明（.md）→",
    "cov.colTarget": "文件类型",
    "cov.colFormat": "扩展名",
    "cov.colScope": "查什么",
    "cov.colStatus": "现状",
    "cov.r1Name": "文稿与研发文档",
    "cov.r1Scope": "开头寒暄、未填占位符、公文黑话、“不是 A，而是 B”套句、三段分号推销句、自问自答、五连逗号句、同构句首、句长齐平空话、PR 摘要壳与浅层复盘归因。",
    "cov.r2Name": "Word 和 PPT",
    "cov.r2Scope": "贴进文档没渲染的 Markdown 星号、正文套话、PPT 单页字墙、要点过多、文字自动缩太小、过程标签式标题与连续 4 页同版式。",
    "cov.r4Name": "网页与组件",
    "cov.r4Scope": "点不动的空链接和占位按钮、默认紫粉渐变、满屏胶囊标签、三层套盒、把提示词口号印成装饰徽章。",
    "cov.r5Name": "Git 改动与 PR",
    "cov.r5Scope": "只查本次改过的行，拦住残留寒暄、占位符和文字/页面里的 AI 味，支持 GitHub PR 批注和 SARIF。代码语法树检查还没做。",
    "cov.r6Name": "个人文风、轻量模型与云端深度审校",
    "cov.r6Scope": "本地 CLI 与工作台支持离线统计个人文风、内置 14.6 KB 轻量空话识别（--ml）；登录后可通过官方云端 MCP 按文体做多模型深度审校与提炼个人文风。",
    "status.live": "可用",
    "status.partial": "改动检查可用，AST 未做",
    "status.partialVoice": "本地与云端均可用",
    "status.notYet": "还没上线（原型阶段）",

    "rules.title": "全部 42 条内置规则明细（7 套场景包）",
    "rules.desc": "平时不需要背规则，直接交给 Agent 或贴进工作台就行。想逐条查判断依据、看正反例或者点「试试 ↑」加载单条规则时，展开下面这张表。",
    "rules.readCases": "单文件拉取全部规则（llms-full.txt）→",
    "rules.foldTitle": "展开查看内置规则明细与在线筛选",
    "rules.modAll": "全部格式",
    "rules.sevAll": "全部级别",
    "rules.sevError": "硬伤（error）",
    "rules.sevWarn": "提醒（warning）",
    "rules.sevInfo": "轻提示（info）",
    "rules.filterAll": "全部",
    "rules.filterCore": "交付底线",
    "rules.filterBrief": "工作文档",
    "rules.filterEng": "研发复盘",
    "rules.filterReg": "对外合规",
    "rules.filterEssay": "随笔长文",
    "rules.filterUi": "PPT 和网页",
    "rules.filterExec": "管理汇报",
    "rules.colId": "规则",
    "rules.colPack": "分类",
    "rules.colMod": "格式",
    "rules.colWhy": "查什么 / 怎么判断",
    "rules.colEx": "原句 → 改坏 → 改好",

    "pos.norm-zurich": "苏黎世独立设计事务所，以极克制的模数网格见长。",
    "pos.stiftung-buchkunst": "世界最美的书评选档案：看页边距、版心比例与长篇阅读怎么拉开呼吸感。",
    "pos.fonts-in-use": "真实印刷品与网页里的字体搭配库。",
    "pos.dinamo": "瑞士独立字厂，看可变字重与大号字阶怎么撑起实用界面。",
    "pos.the-type": "中文排印评论，细聊标点挤压、混排细节与出版规范。",
    "pos.arena": "研究者自己攒的视觉线索库：旧印刷、路牌与独立小书。",

    "footer.selfAudit": "这个页面自己也跑过 dislop check site/，0 处问题。",
    "footer.agentHint": "给 Agent 读的话，从 /llms.txt 开始。",
    "footer.awesome": "工具清单",
    "footer.privacy": "隐私与数据边界",
    "footer.roadmap": "路线图",
    "footer.brand": "文案基准",
    "footer.design": "视觉规范",
  },
  en: {
    "page.title": "dislop — Linter for AI Slop",
    "nav.skip": "Skip to main content",
    "nav.cases": "Cases",
    "nav.workbench": "Try it",
    "nav.surfaces": "How to use",
    "nav.pricing": "Open & Cloud",
    "nav.awesome": "87 tools",
    "nav.rules": "Rules",
    "nav.github": "GitHub ★",
    "theme.dark": "Dark",
    "theme.light": "Light",
    "btn.copy": "Copy",
    "btn.copied": "Copied",

    "lead.strike": "Certainly! Here is your polished draft.",
    "lead.title": "Linter for AI Slop in docs, web pages, and slides",
    "lead.sub":
      "Helps you (and your agent) catch and fix AI-sounding text and template layouts before sending. Combines vetted community rules and 87 curated tools across Skill, Plugin, CLI, and MCP. Run completely offline locally, or switch to Cloud MCP mode in the workbench below.",
    "lead.promptLabel": "Or zero install: copy this line into any web-capable AI / coding agent",
    "lead.promptText":
      "Read https://dislop.com/llms.txt and follow its writing and design anti-slop rules and checks before delivering my next doc, slide deck, or web page.",
    "lead.copyPromptBtn": "Copy for AI",
    "lead.cta": "Try in workbench (Local / Cloud) ↓",
    "lead.cloudBtn": "Free 30-credit Remote MCP key",
    "lead.installBtn": "Install for Agent / Editor (runs offline)",
    "lead.awesomeBtn": "87-tool directory →",
    "lead.starBtn": "GitHub ★",
    "lead.reassure": "CLI and local plugins run completely offline with zero uploads. The browser workbench switches between local rule checks and Cloud MCP mode.",

    "hp.tabBad": "Original",
    "hp.tabTrap": "Still sounds like AI",
    "hp.tabGood": "Cleaned up",
    "hp.meta": "Running live on the same linter engine",
    "hp.openWb": "Open in workbench ↓",

    "m1.title": "1. Curated community work",
    "m1.desc": "Combines vetted open-source rules, corpus findings, and 87 curated tools across docs, web UI, Word, and PowerPoint, without hunting down scattered prompts.",
    "m2.title": "2. Broad host and scenario fit",
    "m2.desc": "Ships 7 domain packs across Skill, Plugin, CLI, and MCP, connecting to Codex, Claude Code, Cursor, Claude Cowork, and editors in one command.",
    "m3.title": "3. Local offline + Cloud MCP toggle",
    "m3.desc": "CLI and local plugins run on your machine with zero uploads. Switch to Cloud MCP in the workbench or an office agent for deeper review, rewrites, and synced style (30 free credits/mo).",

    "cases.title": "Three real cases: why cutting buzzwords still sounds like AI",
    "cases.desc":
      "After cutting cliché nouns, models often fall back on contrast slogans ('Not X, but Y') or pitch cadence that passes basic checks with 0 issues. Try them live or copy any case to share.",
    "cases.readAll": "All contrast cases (.md) →",

    "demos.title": "Four 6-second loops: from raw draft to clean copy",
    "demos.desc":
      "Every GIF is rendered offline from the real rules and browser workbench, covering 3-state proofing, CLI gating, interactive browser checks, and UI template cleanup.",
    "demos.guideLink": "GIF production guide →",
    "demos.c1Title": "1. 3-state galley proof: catch fallback slogans too",
    "demos.c1Desc": "Strikes the leftover chatbot greeting in red, flags a 'Not X, but Y' rewrite in blue, then settles on plain prose with numbers intact.",
    "demos.c2Title": "2. Offline CLI gate: Node & Python parity",
    "demos.c2Desc": "Run dislop check --profile in CI or pre-commit—core artifacts exit 1 alongside 5-axis rhythm and concreteness telemetry.",
    "demos.c3Title": "3. Live browser workbench capture",
    "demos.c3Desc": "Real Playwright capture of the offline workbench above: switching from draft to fallback slogan to clean copy in this tab.",
    "demos.c4Title": "4. Web & UI: strip AI gradients and dead links",
    "demos.c4Desc": "Flags purple-pink gradients, pill-badge walls, prompt-echo stickers, and dead href=\"#\" controls before handing off to a plain 1px sheet.",

    "wb.heading": "Try it right here (paste text or drop a local file)",
    "wb.packLabel": "Built-in pack (0 network):",
    "pack.brief": "Work doc / spec",
    "pack.eng": "Engineering RFC / PR / postmortem",
    "pack.reg": "External & regulated copy",
    "pack.exec": "Executive slide deck",
    "pack.essay": "Essay / longform",
    "pack.ui": "Web UI & components",
    "wb.openFile": "Open a local file (.md / .html / .docx / .pptx)",
    "wb.specimensTitle": "Examples",
    "wb.privacyNote": "Local checks run in this browser tab. Clicking Cloud MCP buttons below requires a free key and sends the draft to our paid-tier zero-training model endpoint with no draft storage.",
    "wb.jumpNotes": "Jump to margin notes ↓",
    "ai.reviewBtn": "Cloud Review · MCP (1 credit)",
    "ai.deslopBtn": "Cloud Rewrite · MCP (2 credits)",
    "ai.anonHint": "Local checks need no sign-in · Sign in for Cloud AI (30 free credits/mo)",
    "ai.claimLink": "Get free key →",
    "voice.drawerTitle": "Optional: extract personal style (local stats or Cloud AI)",
    "voice.drawerDesc": "Paste 1-3 clean paragraphs you wrote (separated by blank lines). 'Local style stats' runs in this tab with zero uploads, or use a free key for Cloud AI extraction.",
    "voice.offlineBtn": "Local style stats (0 credits · offline)",
    "voice.extractBtn": "Cloud AI style extract (2 credits)",
    "voice.clearBtn": "Clear saved style",
    "wb.modeProof": "Highlights",
    "wb.modeEdit": "Edit text",
    "wb.pasteOwn": "Paste my draft",
    "wb.applyClean": "Clean version",
    "wb.tryTrap": "Fallback AI slogan",
    "wb.reset": "Reset",
    "wb.voiceTitle": "5-axis rhythm & detail check",
    "wb.nudgeText": "Like how it feels? Install the open-source pure-doc Skill + offline CLI for local privacy, or claim a free 30-credit Official Cloud MCP key for genre-aware multi-model review.",
    "wb.nudgeCloud": "Claim 30 free credits ↓",
    "wb.nudgeInstall": "Install open-source Skill / CLI ↓",
    "wb.nudgeCopy": "Copy for AI",
    "wb.nudgeStar": "GitHub ★",
    "legend.error": "Red solid: AI artifact",
    "legend.warn": "Blue dashed: cliché / template slop",

    "surf.title": "How to use it: pure-doc Skill -> local CLI -> Official Cloud MCP",
    "surf.desc":
      "Three clear layers: a pure-Markdown Skill for drafting prevention, an open-source offline CLI for fast deterministic checks and CI, and Official Cloud MCP (https://dislop.com/mcp) for zero-setup genre-aware multi-model review.",
    "surf.readTools": "Full setup guide (.md) →",
    "surf.w1Title": "1. Open-Source Pure-Doc Skill (drafting guardrails)",
    "surf.w1Desc": "Genre-specific writing and UI reference cards with zero bundled scripts. Install into Claude Code, Codex, Cursor, or Antigravity to prevent clichés upfront and run local CLI checks afterward.",
    "surf.w2Title": "2. Open-Source Local CLI & Plugins (zero-dep fast linter)",
    "surf.w2Desc": "< 250 KB zero-dep CLI bundles all 7 packs for docs, Word, PowerPoint, and Git diffs in terminals, editors, and CI. Developers can also plug in their own model API key for deeper review.",
    "surf.w3Title": "3. Official Cloud MCP (office & coding agents)",
    "surf.w3Desc": "Connect https://dislop.com/mcp in Claude Cowork, WorkBuddy, Qwen, or editors after signing in (30 free credits/mo) for multi-model genre review returning structured guidance.",
    "surf.w4Title": "4. Web Workbench & One-Line Rules (/llms.txt)",
    "surf.w4Desc": "Browse before/after examples and run basic local checks in this tab, sign in for cloud review, or ask any web chat to read dislop.com/llms.txt first.",
    "snip.prompt": "Send to AI",
    "snip.cloud": "Official MCP (Cloud)",
    "snip.localMcp": "Official MCP",
    "snip.cli": "CLI",

    "price.title": "Free open-source local tools, optional cloud MCP",
    "price.desc":
      "The pure-doc Skill, CLI, and all 7 scenario packs (42 rules) are Apache-2.0 open source and run completely offline locally. Sign in for Official Cloud MCP or web workbench deep review and layout-preserving Office cleanup (30 free credits/mo, zero training).",
    "price.benchLink": "Read 5-model benchmark →",
    "price.t1Name": "Open Source Local (Skill + CLI)",
    "price.t1Price": "$0 · Forever free",
    "price.t1Sub": "Built for privacy-first writers, air-gapped repos, and engineering teams. Full transparency, zero uploads.",
    "price.t1F1": "Pure-Markdown Agent Skill (no scripts) & local CLI (Apache-2.0)",
    "price.t1F2": "All 7 domain packs (42 rules) bundled offline for Markdown, HTML/CSS, DOCX, PPTX & PRs",
    "price.t1F3": "Built-in 5-axis rhythm telemetry, 14.6 KB Pocket ML (--ml) & offline dislop voice",
    "price.t1F4": "Zero network during check; developers can also plug in their own model key",
    "price.t1Cta": "Install Skill / CLI ↑",
    "price.t2Name": "Cloud Free (Remote MCP)",
    "price.t2Price": "$0 · 30 credits / mo",
    "price.t2Sub": "Enter your email for a free key—no card required—for Remote MCP and the web workbench.",
    "price.t2F1": "Direct https://dislop.com/mcp endpoint with zero local setup (up to 12,000 chars/call)",
    "price.t2F2": "Cloud Review (1 credit): catches pitch cadence, filler, and clichés with concrete edits",
    "price.t2F3": "Cloud Rewrite (2 credits): plain rewrite that re-checks rules, numbers, and qualifiers",
    "price.t2F4": "Style Extract (2 credits): build a reusable style profile in the workbench or Remote MCP",
    "price.t2Cta": "Claim free key below ↓",
    "price.t3Name": "Pro · Credit Packs · Team (Early Access)",
    "price.t3Price": "$12/mo · $10 PAYGO",
    "price.t3Sub": "Regular writers save 36% with Pro; occasional heavy users can buy credits that never expire.",
    "price.t3F1": "Pro ($12/mo): 1,500 monthly credits (~$0.008/cr), unlimited length + 10 voice profiles",
    "price.t3F2": "PAYGO Pack ($10 / 800 credits): one-time credit top-up that never expires",
    "price.t3F3": "Team ($29/seat/mo): 5,000 credits, shared brand voice cards, and PR review tooling",
    "price.t3F4": "Paid-tier Google Gemini API only—no draft logging and never used for training",
    "price.t3Cta": "Join early access ↓",

    "cloud.tokenTitle": "Claim 30 free credits + Remote MCP key",
    "cloud.tokenDesc": "Enter your email to generate a free key immediately and unlock 30 monthly credits in the workbench above (no card, no draft storage—see Privacy in the footer).",
    "cloud.tokenBtn": "Get free key",
    "cloud.wlTitle": "Join Pro / Credit Pack / Team waitlist",
    "cloud.wlDesc": "Self-serve billing opens shortly. Leave your email and preferred plan to get early access and bonus launch credits.",
    "cloud.planPro": "Pro ($12/mo · 1,500 credits)",
    "cloud.planCredits": "PAYGO Pack ($10 / 800 credits · never expires)",
    "cloud.planTeam": "Team ($29/seat · shared voice)",
    "cloud.wlBtn": "Join waitlist",
    "ep.foldTitle": "For Agents & Developers: Static Markdown & JSON Endpoints",
    "ep.foldSub": "/llms.txt · /catalog.json · task guides · rule cards (click to expand)",
    "ep.heading": "Plain Markdown & JSON pages for agents",
    "ep.llms": "Entry index for agents",
    "ep.catalog": "JSON index of all pages",
    "ep.taskBiz": "Guide: work docs & specs",
    "ep.taskWeb": "Guide: web pages & slides",
    "ep.taskEdit": "Guide: essays & longform",
    "ep.taskGate": "Guide: pre-release AI artifact checks",
    "ep.skill": "Cross-host Agent Skill",
    "ep.awesome": "Raw JSON for 87 anti-slop tools",
    "ep.brief": "Product brief (positioning & pitch)",
    "ep.method": "Voice & design guide",
    "ep.full": "All 42 rules in one file",

    "awesome.title": "Awesome Anti-Slop: 87 checked tools, guides & papers",
    "awesome.desc":
      "Beyond dislop itself, we maintain a verified directory of anti-slop tools, writing guides, UI rules, PR policies, and papers—including Vale and Impeccable. Every link was checked on 2026-11-21.",
    "awesome.openFull": "Open full list →",
    "awesome.ecoTitle": "Filter by use case, or feed it to an agent",
    "awesome.ecoDesc": "Filter by writing, web UI, code, or research, or show only tools with automated checks. Detectors and bypass tools are kept separate at the bottom.",
    "awesome.browseBtn": "Filter all 87 entries →",
    "awesome.ghBtn": "View on GitHub",
    "awesome.shareBtn": "Copy list blurb",
    "awesome.posTitle": "Design references that don't look like AI templates",
    "awesome.posDesc": "31 public print, type foundry, and independent publishing sites worth browsing when you want a page to look grounded.",
    "awesome.posAll": "All 31 references (.md) →",
    "stat.entries": "entries",
    "stat.sections": "topics",
    "stat.det": "automated tools",
    "stat.zh": "zh / multilingual",

    "share.title": "Found this useful? Share it or bookmark the repo",
    "share.desc": "The pure-Markdown Skill, local CLI, and all 42 built-in rules are Apache-2.0 open source and run offline with zero uploads; sign in on the web workbench or Official Cloud MCP for multi-model deep review with no draft storage.",
    "share.c1Title": "Share with a teammate or friend",
    "share.c1Desc": "Copy a plain, no-hype blurb with the live workbench, real cases, and curated tool directory.",
    "share.copySiteBtn": "Copy project blurb",
    "share.copyCasesBtn": "Copy cases link",
    "share.c2Title": "Star dislop on GitHub",
    "share.c2Desc": "The engine, pure-doc Skill, Plugin, CLI, and Awesome Anti-Slop index all live in one repo.",
    "share.starCta": "Star on GitHub ★",
    "share.c3Title": "Add a case, rule, or tool",
    "share.c3Desc": "Have a classic AI-slop before/after example or a solid anti-slop tool missing from the list? Drop it in our Roadmap or Issues.",
    "share.roadmapCta": "View Roadmap →",
    "share.issueCta": "Submit case / tool",

    "cov.title": "What it checks, and what it skips",
    "cov.desc": "Plain status for each file type. Unreadable archives are marked as skipped instead of 0 issues.",
    "cov.readMd": "Plain text overview (.md) →",
    "cov.colTarget": "File type",
    "cov.colFormat": "Extensions",
    "cov.colScope": "What gets checked",
    "cov.colStatus": "Status",
    "cov.r1Name": "Docs & engineering specs",
    "cov.r1Scope": "Chat wrappers, placeholders, buzz-clusters, 'Not X, but Y' frames, 3-part semicolon pitches, rhetorical Q&A, 5-comma chains, flat-cadence filler, PR diff-parrots, and shallow 'human error' root causes.",
    "cov.r2Name": "Word & PowerPoint",
    "cov.r2Scope": "Raw Markdown asterisks pasted from chat, prose clichés, crowded slides, > 6 bullets, shrunk autofit text, process-label headlines, and 4+ monotonous bullet slides.",
    "cov.r4Name": "Web pages & components",
    "cov.r4Scope": "Dead href='#' placeholder links, unexplained disabled buttons, purple-pink AI gradients, pill walls, 3-level nested boxes, and 'AI-Powered' prompt-echo badges.",
    "cov.r5Name": "Git diffs & PRs",
    "cov.r5Scope": "Checks only modified lines for chat wrappers, placeholders, prose clichés, and UI template slop, with GitHub annotations and SARIF output. Code AST linting is not built.",
    "cov.r6Name": "Personal style, Pocket ML & Cloud Review",
    "cov.r6Scope": "The CLI and workbench support offline style stats and bundled 14.6 KB Pocket ML (--ml); sign in for Official Cloud MCP multi-model genre review and style extraction.",
    "status.live": "Works now",
    "status.partial": "Diff checks work; no AST",
    "status.partialVoice": "Live offline & cloud",
    "status.notYet": "Not shipped (prototype)",

    "rules.title": "All 42 built-in rules (7 scenario packs)",
    "rules.desc": "You don't need to memorize rules—just hand dislop to your agent or paste into the workbench. Expand the table below whenever you want exact rule details or to test a single rule.",
    "rules.readCases": "Single-file rule digest (llms-full.txt) →",
    "rules.foldTitle": "Expand built-in rules and filter online",
    "rules.modAll": "All formats",
    "rules.sevAll": "All levels",
    "rules.sevError": "Hard bug (error)",
    "rules.sevWarn": "Warning",
    "rules.sevInfo": "Info",
    "rules.filterAll": "All",
    "rules.filterCore": "Core",
    "rules.filterBrief": "Work docs",
    "rules.filterEng": "Engineering",
    "rules.filterReg": "Regulated",
    "rules.filterEssay": "Essays",
    "rules.filterUi": "Slides & UI",
    "rules.filterExec": "Exec decks",
    "rules.colId": "Rule",
    "rules.colPack": "Group",
    "rules.colMod": "Formats",
    "rules.colWhy": "What it checks / how to judge",
    "rules.colEx": "Before → Bad edit → After",

    "pos.norm-zurich": "Strict modular graphic systems, micro-typographic rules, and structural restraint.",
    "pos.stiftung-buchkunst": "Book proportion, margin choreography, and pacing principles transferable to reports, PDFs, and decks.",
    "pos.fonts-in-use": "Real-world typography pairings across books, posters, and interfaces.",
    "pos.dinamo": "Independent Swiss foundry demonstrating typographic scale, variable axes, and clean utility UI.",
    "pos.the-type": "Chinese and multilingual typography critique, CJK punctuation mechanics, and editorial layout standards.",
    "pos.arena": "Research-oriented visual channels for archival print, editorial systems, and signage.",

    "footer.selfAudit": "This site passes dislop check site/ with 0 issues.",
    "footer.agentHint": "For agents, start at /llms.txt.",
    "footer.awesome": "Awesome list",
    "footer.privacy": "Privacy",
    "footer.roadmap": "Roadmap",
    "footer.brand": "Voice guide",
    "footer.design": "Design tokens",
  },
};

// ---------- Hero 3-State Proof Card Data (100% Language-Pure, Live Engine Verified) ----------

const HERO_PROOF_BY_LANG = {
  zh: {
    filename: "launch-note.md",
    modality: "markdown",
    pack: "business-brief",
    bad: "好的，以下是修改后的上线说明。值得注意的是，本次改造以队列分级为重要抓手，全面赋能一线运维团队，故障恢复时间最多 45 秒。",
    trap: "队列分级已经落地，故障恢复时间最多 45 秒。这不是一次简单的升级，而是一场效率革命。",
    good: "这次改造给队列分了级，一线运维团队的故障恢复时间最多 45 秒。",
    badNotes: [
      { kind: "error", label: "红实线：", text: "开头留着 AI 寒暄，删掉就行。" },
      { kind: "warn", label: "蓝虚线：", text: "“值得注意的是”“抓手”“全面赋能”都是空话，可以直接说做了什么。" },
    ],
    trapVerdict: "没通过：旧套词删掉了，但换上了“不是……而是……”这种二阶 AI 腔。",
    goodVerdict: "0 处问题。寒暄和空话都清掉了，句子直接说清改动和结果。",
  },
  en: {
    filename: "launch-note.md",
    modality: "markdown",
    pack: "business-brief",
    bad: "Certainly! Here is the launch note. It's worth noting that CSV exports are a game-changer, finishing in up to 12 minutes for workspaces above 500,000 rows.",
    trap: "CSV exports finish in up to 12 minutes for workspaces above 500,000 rows. This isn't just an upgrade — it's a new standard.",
    good: "CSV exports finish in up to 12 minutes for workspaces above 500,000 rows.",
    badNotes: [
      { kind: "error", label: "Red: ", text: "Stray chat reply on line one. Delete it." },
      { kind: "warn", label: "Blue: ", text: "Filler opener and hype noun ('game-changer'). Say what changed instead." },
    ],
    trapVerdict: "Still fails: old buzzwords are gone, replaced by a 'Not X, but Y' AI slogan.",
    goodVerdict: "0 issues. Chat wrapper and stock phrasing removed.",
  },
};

// ---------- Language-Pure Workbench Specimens (7 ZH + 7 EN, ZERO Mixing) ----------

const SPECIMENS_BY_LANG = {
  zh: [
    {
      id: "brief",
      num: "01",
      label: "汇报与上线说明",
      pack: "business-brief",
      filename: "weekly-report.md",
      modality: "markdown",
      bad: [
        "好的，以下是修改后的上线说明。",
        "",
        "压测延迟数据见【待补充】。",
        "",
        "值得注意的是，本次改造以工单分级为重要抓手，全面赋能一线客服团队形成服务闭环，将首响时间压缩至最多 45 秒。",
      ].join("\n"),
      trap: [
        "压测延迟待压测签字后补齐。",
        "",
        "本次改造给工单分了级，一线客服首响时间压缩至最多 45 秒。这不是普通优化，而是行业标杆。",
      ].join("\n"),
      good: [
        "压测延迟待压测签字后补齐。",
        "",
        "本次改造给工单分了级，一线客服首响时间压缩至最多 45 秒。",
      ].join("\n"),
    },
    {
      id: "essay",
      num: "02",
      label: "随笔与长文",
      pack: "literary-essay",
      filename: "winter-note.md",
      modality: "markdown",
      bad: [
        "冬至那天下了初雪,院子里的腊梅开了 3 朵;香气一直飘到走廊。",
        "",
        "老周留下的那把旧刨子不是工具，而是手艺人的尊严。",
        "",
        "傍晚 18:30，修表匠把拆下的 3 枚铜齿轮泡进煤油皿里，关掉台灯。这或许就是慢工出细活在喧嚣时代真正的意义所在。",
      ].join("\n"),
      trap: [
        "冬至那天下了初雪，院子里的腊梅开了 3 朵；香气一直飘到走廊。",
        "",
        "老周的旧刨子不是木头，而是时间本身。",
        "",
        "傍晚 18:30，修表匠把拆下的 3 枚铜齿轮泡进煤油皿里，关掉台灯。",
      ].join("\n"),
      good: [
        "冬至那天下了初雪，院子里的腊梅开了 3 朵；香气一直飘到走廊。",
        "",
        "老周留下的那把旧刨子刃口磨窄了一半，松木柄被手汗浸得发亮。",
        "",
        "傍晚 18:30，修表匠把拆下的 3 枚铜齿轮泡进煤油皿里，关掉台灯。",
      ].join("\n"),
    },
    {
      id: "ui-chrome",
      num: "03",
      label: "网页模板味",
      pack: "deck-and-ui",
      filename: "landing-card.html",
      modality: "html",
      bad: [
        '<div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">',
        '  <span class="badge">AI 强力驱动</span>',
        "  <h2>1.2 秒查完 48 份演示文稿</h2>",
        '  <a href="#">下载完整报告</a>',
        "</div>",
      ].join("\n"),
      trap: [
        '<div class="surface-card">',
        '  <span class="badge">零幻觉保证</span>',
        "  <h2>1.2 秒查完 48 份演示文稿</h2>",
        '  <a href="./report.html">下载完整报告</a>',
        "</div>",
      ].join("\n"),
      good: [
        '<div class="surface-card">',
        "  <h2>1.2 秒查完 48 份演示文稿</h2>",
        '  <a href="./report.html">下载完整报告</a>',
        "</div>",
      ].join("\n"),
    },
    {
      id: "second-order",
      num: "04",
      label: "四字排比与二阶腔",
      pack: "business-brief",
      filename: "sla-update.md",
      modality: "markdown",
      bad: [
        "新版网关具备精准高效、安全可靠、灵活易用的特性，单节点支持 8000 QPS。",
        "",
        "数据显示，大多数团队在发稿前都不会检查套话。",
      ].join("\n"),
      trap: [
        "新版网关单节点支持 8000 QPS。这不是一次普通升级，而是系统架构的质变。",
      ].join("\n"),
      good: [
        "新版网关单节点支持 8000 QPS，上游超时 2 秒后自动熔断。",
        "",
        "我们在 2026 年 3 月抽查的 40 份发布说明里，有 28 份留着未清理的套话。",
      ].join("\n"),
    },
    {
      id: "clean-nearmiss",
      num: "05",
      label: "看着像套话，其实不是",
      pack: "business-brief",
      filename: "clean-chinese.md",
      modality: "markdown",
      bad: [
        "她抓手机拍下黑板上的推导过程，默认超时不是 30 秒，而是 300 秒。",
        "",
        "北京大学、清华大学、复旦大学三校联合公开了这份语料，单次推理平均延迟降至 18 毫秒。",
      ].join("\n"),
      trap: [
        "这不是一份普通的语料，而是学术协作的新起点。",
      ].join("\n"),
      good: [
        "她抓手机拍下黑板上的推导过程，默认超时不是 30 秒，而是 300 秒。",
        "",
        "北京大学、清华大学、复旦大学三校联合公开了这份语料，单次推理平均延迟降至 18 毫秒。",
      ].join("\n"),
    },
    {
      id: "eng-postmortem",
      num: "06",
      label: "研发 PR 与故障复盘",
      pack: "engineering-spec",
      filename: "postmortem-412.md",
      modality: "markdown",
      bad: [
        "本次 PR 旨在通过重构连接池管理逻辑进一步提升整体系统的可维护性。",
        "",
        "故障单 412：常驻连接上限最多 64，告警延迟阈值 400ms。",
        "",
        "根本原因：人为操作不当。",
        "",
        "- [ ] 加强监控与告警",
      ].join("\n"),
      trap: [
        "这不是一次普通的代码重构，而是连接池稳定性的底层重塑。",
        "",
        "故障单 412：常驻连接上限 64，告警延迟阈值 400ms。",
      ].join("\n"),
      good: [
        "修复重连分支未释放旧句柄导致的连接泄漏。",
        "",
        "故障单 412：常驻连接上限最多 64，告警延迟阈值 400ms。",
        "",
        "根本原因：生产迁移脚本缺少库名白名单预检。",
        "",
        "- [ ] 给结算接口补齐延迟超阈值自动告警（负责人：李工，周五前合入）",
      ].join("\n"),
    },
    {
      id: "reg-external",
      num: "07",
      label: "对外发布与严谨合规",
      pack: "regulated-comms",
      filename: "security-brief.md",
      modality: "markdown",
      bad: [
        "新备份架构承诺绝对安全与零风险承诺（月度可用性至少 99.95%）。大表导出效率提升数倍。",
      ].join("\n"),
      trap: [
        "新备份架构不是简单存储升级，而是企业数据安全的坚固防线，月度可用性 99.95%。",
      ].join("\n"),
      good: [
        "新备份架构采用同城双活与离线快照，合同承诺月度可用性至少 99.95%。大表导出改为流式分页读取。",
      ].join("\n"),
    },
  ],
  en: [
    {
      id: "brief",
      num: "01",
      label: "Release brief",
      pack: "business-brief",
      filename: "launch-note.md",
      modality: "markdown",
      bad: [
        "Certainly! Here is the Q3 update.",
        "",
        "p95 latency is [insert p95 latency].",
        "",
        "It is worth noting that CSV exports take up to 12 minutes for accounts above 500,000 rows. This is a game-changer that isn't just faster — it's a paradigm shift.",
      ].join("\n"),
      trap: [
        "p95 latency is pending load-test sign-off.",
        "",
        "CSV exports take up to 12 minutes for accounts above 500,000 rows. Queues clear. Charts load. Teams ship.",
      ].join("\n"),
      good: [
        "p95 latency is pending load-test sign-off.",
        "",
        "CSV exports take up to 12 minutes for accounts above 500,000 rows.",
      ].join("\n"),
    },
    {
      id: "essay",
      num: "02",
      label: "Narrative essay",
      pack: "literary-essay",
      filename: "ferry-deck.md",
      modality: "markdown",
      bad: [
        "The station clock — brass-rimmed — stopped at 4:10 — right before the rain — leaving the platform quiet — and empty.",
        "",
        "At 6:15 a.m., the ferry deck smelled of wet rope and diesel. Ultimately, this reminds us that departures are always quieter than arrivals.",
      ].join("\n"),
      trap: [
        "The brass-rimmed station clock stopped at 4:10 right before the rain, leaving the platform quiet.",
        "",
        "At 6:15 a.m., the ferry deck smelled of wet rope and diesel. It wasn't just a crossing — it was a reckoning.",
      ].join("\n"),
      good: [
        "The brass-rimmed station clock stopped at 4:10 right before the rain, leaving the platform quiet.",
        "",
        "At 6:15 a.m., the ferry deck smelled of wet rope and diesel.",
      ].join("\n"),
    },
    {
      id: "ui-chrome",
      num: "03",
      label: "Web page & UI",
      pack: "deck-and-ui",
      filename: "hero-card.html",
      modality: "html",
      bad: [
        '<div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">',
        '  <span class="badge">AI-Powered · Zero Hallucination</span>',
        "  <h2>Audit 48 slide decks in 1.2 seconds</h2>",
        '  <a href="#">Download report</a>',
        "</div>",
      ].join("\n"),
      trap: [
        '<div class="surface-card">',
        '  <span class="badge">Supercharge Your Workflow</span>',
        "  <h2>Audit 48 slide decks in 1.2 seconds</h2>",
        '  <a href="./report.html">Download report</a>',
        "</div>",
      ].join("\n"),
      good: [
        '<div class="surface-card">',
        "  <h2>Audit 48 slide decks in 1.2 seconds</h2>",
        '  <a href="./report.html">Download report</a>',
        "</div>",
      ].join("\n"),
    },
    {
      id: "second-order",
      num: "04",
      label: "Staccato & bullet walls",
      pack: "business-brief",
      filename: "sla-note.md",
      modality: "markdown",
      bad: [
        "Studies show that 70% of decks pack too much text onto one slide.",
        "",
        "Signals drop. Audits stall. Launches slip.",
      ].join("\n"),
      trap: [
        "This isn't just a deck linter — it's a new standard for clear slides.",
      ].join("\n"),
      good: [
        "In our audit of 48 internal Q3 decks, 31 had at least one slide over 120 words.",
      ].join("\n"),
    },
    {
      id: "clean-nearmiss",
      num: "05",
      label: "Looks like slop, isn't",
      pack: "business-brief",
      filename: "clean-english.md",
      modality: "markdown",
      bad: [
        "The Delve debugger inspected a 19th-century wool tapestry archive on 2026-10-15.",
        "",
        "The bug is not in `parser.py`, but in `loader.py` line 42.",
      ].join("\n"),
      trap: [
        "This isn't just speed — it's clarity.",
      ].join("\n"),
      good: [
        "The Delve debugger inspected a 19th-century wool tapestry archive on 2026-10-15.",
        "",
        "The bug is not in `parser.py`, but in `loader.py` line 42.",
      ].join("\n"),
    },
    {
      id: "eng-postmortem",
      num: "06",
      label: "Engineering PR & postmortem",
      pack: "engineering-spec",
      filename: "postmortem-412.md",
      modality: "markdown",
      bad: [
        "This PR updates the retry middleware to ensure a more seamless and resilient developer experience.",
        "",
        "Incident 412 context: retry backoff cap up to 8s; checkout alert threshold 400ms.",
        "",
        "Root cause: human error.",
        "",
        "- [ ] Add more monitoring.",
      ].join("\n"),
      trap: [
        "This isn't a minor retry tweak — it's a resilience milestone.",
        "",
        "Incident 412 context: retry backoff cap 8s; checkout alert threshold 400ms.",
      ].join("\n"),
      good: [
        "Cap retry jitter when upstream returns HTTP 503.",
        "",
        "Incident 412 context: retry backoff cap up to 8s; checkout alert threshold 400ms.",
        "",
        "Root cause: deploy runner skipped schema validation when `--fast` was passed.",
        "",
        "- [ ] Wire P99 alert on `checkout-api` (@payments-oncall, Friday).",
      ].join("\n"),
    },
    {
      id: "reg-external",
      num: "07",
      label: "External & regulated copy",
      pack: "regulated-comms",
      filename: "security-brief.md",
      modality: "markdown",
      bad: [
        "Our vault architecture is 100% secure with a zero-risk migration (monthly uptime at least 99.95%). Incident triage is 10x faster.",
      ].join("\n"),
      trap: [
        "Our vault architecture isn't just storage — it's enterprise peace of mind with 99.95% monthly uptime.",
      ].join("\n"),
      good: [
        "Vault backups use AES-256 encryption at rest with monthly uptime at least 99.95%. Incident triage now indexes trace IDs directly at ingest.",
      ].join("\n"),
    },
  ],
};

// ---------- Real Cases & Share Blurbs (100% Language-Pure) ----------

const CASES_BY_LANG = {
  zh: [
    {
      id: "doc",
      kicker: "案例 01 · 发版简报（去套话 + 核对数字）",
      title: "清掉寒暄、官话与口号，四个核心指标一个不丢",
      steps: [
        {
          cls: "is-bad",
          label: "原稿（AI 寒暄 + 黑话 + 喊口号）",
          text: "好的，以下是 Q4 结算引擎升级说明。值得注意的是，本次以异步化为核心抓手，全面赋能商户体验。峰值 TPS 从 1,200 升至 4,800，P99 延迟从 210ms 降至 42ms，一致性达 99.99%。",
        },
        {
          cls: "is-trap",
          label: "改过头（掉进反转口号）",
          text: "这绝非一次普通升级，而是结算架构的效率跃迁，性能实现数倍提升。",
        },
        {
          cls: "is-good",
          label: "改干净（只留动作和真实数字）",
          text: "Q4 结算引擎改为全链路异步化后，峰值 TPS 从 1,200 升至 4,800，P99 延迟从 210ms 降至 42ms，数据一致性 99.99%。",
        },
      ],
      loadSpecimenId: "brief",
      loadLabel: "在工作台试一下 ↑",
      shareLabel: "复制这段分享",
      shareText: [
        "看一个发版简报去 AI 味对照：",
        "原稿：好的，以下是 Q4 结算引擎升级说明。值得注意的是，本次以异步化为核心抓手，全面赋能商户体验。峰值 TPS 从 1,200 升至 4,800，P99 延迟从 210ms 降至 42ms，一致性达 99.99%。",
        "改过头：这绝非一次普通升级，而是结算架构的效率跃迁，性能实现数倍提升。",
        "改干净：Q4 结算引擎改为全链路异步化后，峰值 TPS 从 1,200 升至 4,800，P99 延迟从 210ms 降至 42ms，数据一致性 99.99%。",
        "在线试查与一键去味：https://dislop.com/#workbench",
      ].join("\n"),
    },
    {
      id: "autopsy",
      kicker: "案例 02 · 真实自查（句式推销味）",
      title: "检查报 0 处问题，但我们自己上一版首屏照样像 AI",
      steps: [
        {
          cls: "is-bad",
          label: "翻车原稿（0 命中，却满屏 AI 味）",
          text: "把稿子、PPT 或网页贴进来。不能发的硬伤，dislop 直接划掉；听着像套话的地方，它在页边问你一句；等你改完，再拿原稿逐条对一遍。它不替你改稿，笔一直在你手里。",
        },
        {
          cls: "is-good",
          label: "改回人话",
          text: "AI 写完的文档、Word、PPT 和网页，经常留着开头寒暄、空话套话、满页字墙或默认紫粉模板。你可以装进本地 Coding Agent 离线运行，也可以在这里切换本地检查与云增强（MCP）模式。",
        },
      ],
      note: "毛病不在单个词，在于“三段对称分号推销句 + 假装老校对 + 段尾金句收尾”。这就是为什么单靠脚本标红线不够，必须把写作规矩一起写进 Skill 和 Plugin。",
      linkHref: "./methodology/brand-and-voice.md",
      linkLabel: "看完整复盘 →",
      shareLabel: "复制这段分享",
      shareText: [
        "为什么有时候把“赋能”“抓手”删完了，读起来还是满屏 AI 味？",
        "我们拿自己上一版官网首屏做了次复盘：工具检查报 0 处问题，但三段对称分号推销句 + 校对戏服 + 段尾“笔一直在你手里”金句收尾，一眼还是 AI 写的。",
        "完整前后对照与去 AI 味方法：https://dislop.com/#cases",
      ].join("\n"),
    },
    {
      id: "ui",
      kicker: "案例 03 · 网页与 PPT 模板味",
      title: "紫粉渐变 + 装饰徽章 + 点不动的空链接",
      steps: [
        {
          cls: "is-bad",
          label: "生成式模板原稿",
          html: '<code>from-indigo via-purple to-pink</code> 渐变标题 + <code>AI 强力驱动</code> 徽章 + <code>href="#"</code> 假下载按钮。',
        },
        {
          cls: "is-good",
          label: "改干净",
          html: "纯色纸面和 1px 分界线、去掉装饰徽章、按钮接上真实报告路径 <code>./report.html</code>。",
        },
      ],
      note: "同一套引擎也能直接读 .pptx，挑出单页字墙（> 280 字）、要点超过 6 条、文字自动缩排和空泛标题。",
      loadSpecimenId: "ui-chrome",
      loadLabel: "在工作台试一下 ↑",
      shareLabel: "复制这段分享",
      shareText: [
        "AI 写的网页和 PPT 常见老三样：紫粉渐变标题、AI 强力驱动徽章、点不动的 href=\"#\" 空链接，还有单页塞满 300 字的 PPT。",
        "dislop 可以在浏览器或命令行直接离线挑出这些模板味：https://dislop.com/#cases",
      ].join("\n"),
    },
  ],
  en: [
    {
      id: "doc",
      kicker: "Case 01 · Release note (rewrite + number check)",
      title: "Stripping chat wrappers and hype while keeping every metric exact",
      steps: [
        {
          cls: "is-bad",
          label: "Original (chat wrapper + buzzwords)",
          text: "Happy to help! Below is the Q4 settlement note. In today's fast-paced landscape, async queues supercharge throughput from 1,200 to 4,800 TPS and cut p99 latency from 210ms to 42ms.",
        },
        {
          cls: "is-trap",
          label: "Overcorrected (dropped numbers + fallback slogan)",
          text: "This isn't just an upgrade — it's a new standard for blazing-fast settlement.",
        },
        {
          cls: "is-good",
          label: "Cleaned up (just the action and numbers)",
          text: "Switching the Q4 settlement engine to async queues raised peak throughput from 1,200 to 4,800 TPS and cut p99 latency from 210ms to 42ms.",
        },
      ],
      loadSpecimenId: "brief",
      loadLabel: "Try in workbench ↑",
      shareLabel: "Copy to share",
      shareText: [
        "Quick AI-slop before/after:",
        "Before: Happy to help! Below is the Q4 settlement note. In today's fast-paced landscape, async queues supercharge throughput from 1,200 to 4,800 TPS and cut p99 latency from 210ms to 42ms.",
        "Overcorrected: This isn't just an upgrade — it's a new standard for blazing-fast settlement.",
        "After: Switching the Q4 settlement engine to async queues raised peak throughput from 1,200 to 4,800 TPS and cut p99 latency from 210ms to 42ms.",
        "Try drafts offline or run 1-click AI rewrite: https://dislop.com/?lang=en#workbench",
      ].join("\n"),
    },
    {
      id: "autopsy",
      kicker: "Case 02 · Real self-audit (pitch cadence)",
      title: "0 linter findings, yet our own previous hero still sounded like AI",
      steps: [
        {
          cls: "is-bad",
          label: "Previous hero (0 findings, still pitchy AI)",
          text: "Drop in a draft, deck, or page. Hard defects get crossed out; cliché lines get a margin query; once you edit, we check every number and link. It never rewrites for you—the pen stays in your hand.",
        },
        {
          cls: "is-good",
          label: "Plain rewrite",
          text: "AI-written docs, Word files, slides, and web pages often ship with chat replies, stock phrasing, crowded slides, or purple-pink template chrome. Install dislop into your coding agent offline, or switch between local and Cloud MCP checks here.",
        },
      ],
      note: "Zero buzzwords triggered a rule, yet the 3-part semicolon pitch, editor roleplay, and pull-quote closer still screamed AI. That's why we put plain writing rules into SKILL.md and the Plugin alongside the linter.",
      linkHref: "./methodology/brand-and-voice.md",
      linkLabel: "Read full autopsy →",
      shareLabel: "Copy to share",
      shareText: [
        "Why a draft with 0 linter findings can still scream AI:",
        "Our own previous hero had zero banned buzzwords, yet a 3-part semicolon pitch + editor costume + pull-quote closer ('the pen stays in your hand') still felt synthetic.",
        "Full before/after & anti-slop Skill/Plugin: https://dislop.com/#cases",
      ].join("\n"),
    },
    {
      id: "ui",
      kicker: "Case 03 · Web UI & slide templates",
      title: "Purple-pink gradient + prompt badge + dead href='#' button",
      steps: [
        {
          cls: "is-bad",
          label: "Default generated template",
          html: '<code>from-indigo via-purple to-pink</code> gradient heading + <code>AI-Powered</code> badge + dead <code>href="#"</code> download button.',
        },
        {
          cls: "is-good",
          label: "Cleaned up",
          html: "Flat paper surfaces with 1px rules, no prompt-echo badge, and a working <code>./report.html</code> link.",
        },
      ],
      note: "The same zero-dep engine inspects .pptx decks for slide word walls (> 120 words), > 6 bullets, autofit text shrink, and generic 'Overview' titles.",
      loadSpecimenId: "ui-chrome",
      loadLabel: "Try in workbench ↑",
      shareLabel: "Copy to share",
      shareText: [
        "Classic AI UI & deck slop: indigo-purple-pink gradients, 'AI-Powered' badges, dead href=\"#\" buttons, and 150-word slides.",
        "dislop catches all of them offline in your browser, CLI, or agent MCP: https://dislop.com/#cases",
      ].join("\n"),
    },
  ],
};

const SHARE_BLURBS_BY_LANG = {
  zh: {
    site: "分享一个 AI 味检查工具 dislop（Linter for AI Slop）：整合了 87 条精选去味工具和社区规则，帮你（的 Agent）在文档、网页和 PPT 发出前挑出并改掉 AI 味，一行命令就能接进 Codex / Claude Code / Cursor / WorkBuddy 等，支持纯本地离线运行。官网：https://dislop.com GitHub：https://github.com/dislop-ai/dislop",
    awesome: "整理了一份 87 条去 AI 味工具与资料清单（Awesome Anti-Slop），涵盖中英文写作规范、Vale / Impeccable 等自动检查器、网页设计规则、PR 治理和论文，支持在线筛选也提供给 Agent 读的 JSON：https://dislop.com/awesome/ （GitHub：https://github.com/dislop-ai/dislop/blob/main/awesome/README.zh-CN.md）",
    cases: "https://dislop.com/#cases",
  },
  en: {
    site: "Checking out dislop — a dedicated linter for AI slop. It brings together vetted community rules and 87 curated tools to help your agent find and fix AI slop in docs, web UI, and slides. Connects to Codex, Claude Code, Cursor, and office agents in one command and can run offline: https://dislop.com (GitHub: https://github.com/dislop-ai/dislop)",
    awesome: "Awesome Anti-Slop: 87 verified anti-slop tools, writing guides, UI standards, PR policies, and papers with an offline filter UI and agent-ready JSON: https://dislop.com/awesome/ (GitHub: https://github.com/dislop-ai/dislop/tree/main/awesome)",
    cases: "https://dislop.com/#cases",
  },
};

// ---------- Snippets by Language ----------

const SNIPPETS_BY_LANG = {
  zh: {
    prompt: `# 复制下面这段直接发给任意能联网的 AI / Agent（免安装）：
请先读 https://dislop.com/llms.txt，按里面的去 AI 味写作规矩和检查方法，帮我把接下来这份稿子（文档 / PPT / 网页）交付前过一遍：
1. 先删掉 AI 寒暄、没填的占位符和空链接；
2. 把套话、二阶口号和三段分号推销句改回平实人话，不编造新数字；
3. 改完再对照规则复检一遍。`,
    skill: `# 一行安装跨宿主纯文档 Agent Skill（不含可执行脚本）
npx skills add dislop-ai/dislop

# 装完后全程本地运行（0 联网，不弹外网审批框）：
# 1. 动笔前按需读取自带的 4 张场景参考卡（skills/dislop/references/*.md）
# 2. 写完如有本地终端，自动调用 npx dislop check 自检硬伤与常见套话`,
    plugin: `# 在 Claude Code 里一键安装 Plugin（纯文档 Skill + 官方云端 MCP）
/plugin marketplace add dislop-ai/dislop
/plugin install dislop@dislop-ai

# 仓库根目录自带标准清单：
# .claude-plugin/marketplace.json · .claude-plugin/plugin.json · .mcp.json`,
    mcp: `{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "https://dislop.com/mcp",
      "headers": {
        "Authorization": "Bearer dslp_REPLACE_WITH_FREE_KEY"
      }
    }
  }
}`,
    cloud: `{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "https://dislop.com/mcp",
      "headers": {
        "Authorization": "Bearer dslp_REPLACE_WITH_FREE_KEY"
      }
    }
  }
}`,
    cli: `# 离线检查当前目录（Node 或 Python PyPI 包，内置全部 7 套场景包，0 联网）
npx --yes dislop check .
uvx dislop check .

# 开启 5 轴节奏统计、内置 14.6 KB 轻量模型与扩展探针
npx --yes dislop check draft.md --pack auto --profile --ml --patterns

# 离线提取你自己的句长与标点个人文风（0 上传）
npx --yes dislop voice my-notes.md

# 查看某条规则的判断方法和改前/改后示例
npx --yes dislop explain negation-pivot-frame --lang zh`,
    ci: `name: dislop
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npx --yes dislop check --changed origin/main --format github`,
    config: `{
  "failOn": "error",
  "ignore": ["vendor/**", "dist/**"],
  "overrides": [
    { "files": ["docs/**/*.md"], "pack": "business-brief" },
    { "files": ["rfcs/**/*.md", "postmortems/**/*.md"], "pack": "engineering-spec" },
    { "files": ["press/**/*.md"], "pack": "regulated-comms" },
    { "files": ["site/**/*.{html,css,svg}"], "pack": "deck-and-ui" }
  ],
  "allow": ["无缝钢管"]
}`,
  },
  en: {
    prompt: `# Copy and paste this into any web-capable AI chat or coding agent (zero install):
Read https://dislop.com/llms.txt and follow its anti-slop rules before we ship this draft (doc, slide deck, or web page):
1. Remove stray AI chat wrappers, unfilled placeholders, and dead links;
2. Rewrite clichés, 2nd-order slogans, and 3-part semicolon pitches plainly without inventing facts;
3. Run a final check against the rules before delivering.`,
    skill: `# Install the pure-Markdown cross-host Agent Skill (no bundled scripts)
npx skills add dislop-ai/dislop

# Runs 100% locally after install (0 network calls, 0 WebFetch prompts):
# 1. Loads the matching local reference card before drafting (skills/dislop/references/*.md)
# 2. Runs npx dislop check afterward when a local shell is available`,
    plugin: `# Install as a Claude Code Plugin (pure-doc SKILL.md + Official Cloud MCP)
/plugin marketplace add dislop-ai/dislop
/plugin install dislop@dislop-ai

# Standard plugin manifests live in the repo root:
# .claude-plugin/marketplace.json · .claude-plugin/plugin.json · .mcp.json`,
    mcp: `{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "https://dislop.com/mcp",
      "headers": {
        "Authorization": "Bearer dslp_REPLACE_WITH_FREE_KEY"
      }
    }
  }
}`,
    cloud: `{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "https://dislop.com/mcp",
      "headers": {
        "Authorization": "Bearer dslp_REPLACE_WITH_FREE_KEY"
      }
    }
  }
}`,
    cli: `# Check the current folder offline (Node or PyPI, ships all 7 built-in packs, 0 network calls)
npx --yes dislop check .
uvx dislop check .

# Run with 5-axis rhythm telemetry, 14.6 KB Pocket ML, and extended pattern probes
npx --yes dislop check draft.md --pack auto --profile --ml --patterns

# Extract a deterministic personal style profile offline (0 uploads)
npx --yes dislop voice my-notes.md

# Inspect a rule's rationale and before/after examples
npx --yes dislop explain negation-pivot-frame`,
    ci: `name: dislop
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npx --yes dislop check --changed origin/main --format github`,
    config: `{
  "failOn": "error",
  "ignore": ["vendor/**", "dist/**"],
  "overrides": [
    { "files": ["docs/**/*.md"], "pack": "business-brief" },
    { "files": ["rfcs/**/*.md", "postmortems/**/*.md"], "pack": "engineering-spec" },
    { "files": ["press/**/*.md"], "pack": "regulated-comms" },
    { "files": ["site/**/*.{html,css,svg}"], "pack": "deck-and-ui" }
  ],
  "allow": ["Delve", "Bayeux Tapestry"]
}`,
  },
};

const PACK_LABELS = {
  zh: {
    core: "交付底线",
    "business-brief": "工作文档",
    "engineering-spec": "研发复盘",
    "regulated-comms": "对外合规",
    "literary-essay": "随笔长文",
    "deck-and-ui": "PPT 和网页",
    "executive-deck": "管理汇报",
  },
  en: {
    core: "Core",
    "business-brief": "Work docs",
    "engineering-spec": "Engineering",
    "regulated-comms": "Regulated",
    "literary-essay": "Essays",
    "deck-and-ui": "Slides & UI",
    "executive-deck": "Exec decks",
  },
};

// ---------- Safe Storage & Application State ----------

function safeGetStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or restricted-origin errors
  }
}

function detectInitialLang() {
  try {
    const param = new URLSearchParams(window.location.search).get("lang");
    if (param === "en" || param === "zh") return param;
  } catch {
    // ignore URL parsing errors
  }
  const stored = safeGetStorage("dislop-lang");
  if (stored === "en" || stored === "zh") return stored;
  const navLang = String(window.navigator?.language || "").toLowerCase();
  if (navLang && !navLang.startsWith("zh")) return "en";
  return "zh";
}

let currentLang = detectInitialLang();
let currentTheme = "light";
let heroProofState = "bad";
let activeSpecimenIdx = 0;
let activeSpecimen = SPECIMENS_BY_LANG[currentLang][0];
let customRuleTitle = null;
let baselineText = activeSpecimen.bad;
let currentText = activeSpecimen.bad;
let currentFilename = activeSpecimen.filename;
let currentModality = activeSpecimen.modality;
let currentPackId = activeSpecimen.pack;
let viewMode = "proof";
let focusedFindingIdx = -1;
let binaryAuditResult = null;
let lastUploadedFile = null;
let uploadedOriginalText = null;
let uploadSeq = 0;
let activeRuleFilter = "all";
let activeModalityFilter = "all";
let activeSeverityFilter = "all";
let activeRuleSearch = "";
let highlightedRuleId = null;
let activeSnippet = "prompt";
const copyTimers = new WeakMap();

// ---------- Browser-Native ZIP Reader (`DecompressionStream`) ----------

async function readBrowserZipXmlEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("Invalid ZIP header");
  }
  let eocd = -1;
  const minOff = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOff; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Missing ZIP central directory");
  const total = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = {};
  let ptr = cdOffset;

  for (let i = 0; i < total && ptr + 46 <= bytes.length; i += 1) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOff = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!/\.(?:xml|rels)$/i.test(name)) continue;
    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const slice = bytes.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      entries[name] = decoder.decode(slice);
    } else if (method === 8 && typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      writer.write(slice);
      writer.close();
      const buf = await new Response(ds.readable).arrayBuffer();
      entries[name] = decoder.decode(buf);
    }
  }
  return entries;
}

// ---------- Local Rhythm Stats ----------

function computeStylometrics(text, modality) {
  if (!text || modality === "html" || modality === "css" || modality === "svg") {
    return null;
  }
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
  const rawSents = stripped
    .split(/(?<=[。！？])|(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  if (rawSents.length === 0) return null;

  const lengths = rawSents
    .map((s) => {
      const han = (s.match(/[\u4E00-\u9FFF]/g) || []).length;
      const latin = (s.match(/[A-Za-z0-9]+/g) || []).length;
      return han + latin;
    })
    .filter((n) => n > 0);

  if (lengths.length === 0) return null;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((acc, v) => acc + (v - mean) ** 2, 0) / lengths.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  const emDashes = (stripped.match(/——|—/g) || []).length;

  return {
    sentences: lengths.length,
    meanLen: mean.toFixed(1),
    cv: lengths.length >= 2 ? cv.toFixed(2) : "—",
    emDashes,
  };
}

// ---------- Helpers ----------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizePublicExemplar(str) {
  if (!str) return "";
  return String(str)
    .replace(/file:\/\/\/Users\/[A-Za-z0-9._-]+\//g, "file:///Users/example/")
    .replace(/(?<![A-Za-z0-9_])\/Users\/(?!example\/)[A-Za-z0-9._-]+\//g, "/Users/example/");
}

function cleanRuleCopyForLang(str, lang) {
  if (!str) return "";
  if (lang === "en") {
    return String(str)
      .replace(/\s*\/\s*['"`“「][^'"`”」]*[\u4E00-\u9FFF][^'"`”」]*['"`”」]/g, "")
      .replace(/\s*\([^)]*[\u4E00-\u9FFF][^)]*\)/g, "");
  }
  return String(str);
}

function formatRuleProseHtml(str) {
  return escapeHtml(cleanRuleCopyForLang(str, currentLang))
    .replace(/'(AI-Powered|Zero Hallucination|Overview|Background|studies show)'/g, "<code>$1</code>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function getLocalizedExemplar(rule, lang) {
  const meta = RULE_UI_META[rule.id];
  if (lang === "zh" && meta?.zhEx) return meta.zhEx;
  if (lang === "en" && meta?.enEx) return meta.enEx;
  return rule.exemplar || null;
}

function setViewMode(mode) {
  viewMode = binaryAuditResult ? "proof" : mode;
  const proofBtn = document.getElementById("mode-proof-btn");
  const editBtn = document.getElementById("mode-edit-btn");
  const isProof = viewMode === "proof";
  proofBtn.classList.toggle("is-active", isProof);
  proofBtn.setAttribute("aria-pressed", String(isProof));
  editBtn.classList.toggle("is-active", !isProof);
  editBtn.setAttribute("aria-pressed", String(!isProof));
  editBtn.disabled = Boolean(binaryAuditResult);
  editBtn.title = binaryAuditResult
    ? currentLang === "zh"
      ? "Word / PPT 文件为只读体检，请修改原文件后重新打开"
      : "Binary files (DOCX/PPTX) are read-only here; edit the source file and re-open"
    : "";
}

function cpOffsetToUtf16(str, cpTarget) {
  if (!/[\uD800-\uDBFF]/.test(str)) return cpTarget;
  let cp = 0;
  let u16 = 0;
  while (u16 < str.length && cp < cpTarget) {
    const code = str.codePointAt(u16);
    u16 += code > 0xffff ? 2 : 1;
    cp += 1;
  }
  return u16;
}

function withUtf16Spans(text, rawFindings) {
  if (!rawFindings?.length || !/[\uD800-\uDBFF]/.test(text)) return rawFindings || [];
  return rawFindings.map((f) =>
    f.span
      ? {
          ...f,
          span: {
            start: cpOffsetToUtf16(text, f.span.start),
            end: cpOffsetToUtf16(text, f.span.end),
          },
        }
      : f
  );
}

function renderAnnotatedLine(lineText, lineGlobalStart, findings, focusIdx = focusedFindingIdx) {
  const lineEnd = lineGlobalStart + lineText.length;
  const tokens = [];

  findings.forEach((f, idx) => {
    if (!f.span) return;
    const s = Math.max(lineGlobalStart, f.span.start);
    const e = Math.min(lineEnd, f.span.end);
    if (s < e) {
      tokens.push({
        start: s - lineGlobalStart,
        end: e - lineGlobalStart,
        cls: f.severity === "error" ? "mark-span mark-error" : "mark-span mark-warn",
        findingIdx: idx,
        title: RULE_UI_META[f.ruleId]?.title?.[currentLang] || f.ruleId,
      });
    }
  });

  tokens.sort((a, b) => a.start - b.start || b.end - a.end);

  let html = "";
  let cursor = 0;
  for (const t of tokens) {
    if (t.start < cursor) continue;
    if (t.start > cursor) {
      html += escapeHtml(lineText.slice(cursor, t.start));
    }
    const piece = escapeHtml(lineText.slice(t.start, t.end));
    const focused = t.findingIdx === focusIdx ? " is-focused" : "";
    html += `<span class="${t.cls}${focused}" data-finding-idx="${t.findingIdx}" title="${escapeHtml(t.title)}" tabindex="0">${piece}</span>`;
    cursor = t.end;
  }
  if (cursor < lineText.length) {
    html += escapeHtml(lineText.slice(cursor));
  }
  return html || "&nbsp;";
}

// ---------- Hero 3-State Proof Card Renderer ----------

function renderHeroProof() {
  const data = HERO_PROOF_BY_LANG[currentLang] || HERO_PROOF_BY_LANG.zh;
  const stageEl = document.getElementById("hero-proof-stage");
  const fbEl = document.getElementById("hero-proof-feedback");
  if (!stageEl || !fbEl) return;

  const pack = resolveEffectivePack(data.pack, PACKS_BY_ID);
  const text = data[heroProofState] || data.bad;
  const audit = auditText(text, { filename: data.filename, modality: data.modality, pack });
  stageEl.innerHTML = renderAnnotatedLine(text, 0, withUtf16Spans(text, audit.findings), -1);

  if (heroProofState === "bad") {
    fbEl.innerHTML = `<ul class="hero-proof-notes">${data.badNotes
      .map(
        (n) =>
          `<li><span class="hero-note-dot is-${n.kind}"></span><span><strong>${escapeHtml(n.label)}</strong>${escapeHtml(n.text)}</span></li>`
      )
      .join("")}</ul>`;
  } else if (heroProofState === "good") {
    fbEl.innerHTML = `<div class="hero-proof-verdict">${escapeHtml(data.goodVerdict)}</div>`;
  } else {
    fbEl.innerHTML = `<div class="hero-proof-verdict is-rejected">${escapeHtml(data.trapVerdict)}</div>`;
  }

  document.querySelectorAll("[data-hero-state]").forEach((btn) => {
    const active = btn.getAttribute("data-hero-state") === heroProofState;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
  });
}

// ---------- Workbench Renderers ----------

function updateSpecimenRailSelection() {
  const rail = document.getElementById("specimen-list");
  if (!rail) return;
  rail.querySelectorAll(".specimen-btn").forEach((b) => {
    const active = !lastUploadedFile && !customRuleTitle && b.getAttribute("data-specimen-id") === activeSpecimen?.id;
    b.classList.toggle("is-active", active);
  });
}

function renderSpecimenRail() {
  const rail = document.getElementById("specimen-list");
  const titleEl = rail.querySelector(".rail-title");
  const privacyEl = rail.querySelector(".privacy-note");
  rail.querySelectorAll(".specimen-btn").forEach((el) => el.remove());

  const list = SPECIMENS_BY_LANG[currentLang] || SPECIMENS_BY_LANG.zh;
  list.forEach((sp, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "specimen-btn" + (!lastUploadedFile && !customRuleTitle && sp.id === activeSpecimen.id ? " is-active" : "");
    btn.setAttribute("data-specimen-id", sp.id);
    const packName = PACK_LABELS[currentLang]?.[sp.pack] || sp.pack;
    btn.innerHTML = `<span class="spec-num">${sp.num}</span><span class="spec-label">${escapeHtml(sp.label)}</span><span class="spec-pack">${escapeHtml(packName)}</span>`;
    btn.addEventListener("click", () => {
      uploadSeq += 1;
      clearWorkbenchTransientPanels();
      activeSpecimenIdx = idx;
      activeSpecimen = sp;
      lastUploadedFile = null;
      uploadedOriginalText = null;
      binaryAuditResult = null;
      customRuleTitle = null;
      currentPackId = sp.pack;
      currentFilename = sp.filename;
      currentModality = sp.modality;
      baselineText = sp.bad;
      currentText = sp.bad;
      focusedFindingIdx = -1;
      document.getElementById("pack-select").value = sp.pack;
      setViewMode("proof");
      updateSpecimenRailSelection();
      renderWorkbench();
    });
    rail.insertBefore(btn, privacyEl);
  });
  titleEl.textContent = I18N[currentLang]["wb.specimensTitle"];
}

function buildRhythmCellHtml({ label, state, tone, pct, tip }) {
  const stateCls = tone === "bad" ? " is-bad" : tone === "warn" ? " is-warn" : " is-good";
  const fillCls = tone === "bad" ? " is-bad" : tone === "warn" ? " is-warn" : "";
  const clamped = Math.max(6, Math.min(100, Math.round(pct)));
  return `<div class="rhythm-cell" title="${escapeHtml(tip || "")}">
    <div class="rhythm-cell-top">
      <span class="rhythm-label">${escapeHtml(label)}</span>
      <span class="rhythm-state${stateCls}">${escapeHtml(state)}</span>
    </div>
    <div class="rhythm-track" aria-hidden="true"><div class="rhythm-fill${fillCls}" style="width:${clamped}%;"></div></div>
  </div>`;
}

function renderVoiceMeter(text, modality, isBinary) {
  const valuesEl = document.getElementById("voice-meter-values");
  const subEl = document.getElementById("voice-meter-summary");
  if (!valuesEl) return;
  const isZh = currentLang === "zh";

  if (isBinary) {
    if (subEl) subEl.textContent = isZh ? "本地内存检查 · 0 上传" : "Local browser RAM · 0 uploads";
    valuesEl.innerHTML = `<div class="rhythm-empty">${
      isZh ? "Word / PPT 文档仅做结构与正文体检，不统计散文句长节奏。" : "Rhythm gauges apply to editable prose drafts; Office files run structure & text checks."
    }</div>`;
    return;
  }
  if (modality !== "markdown" && modality !== "text") {
    if (subEl) subEl.textContent = isZh ? "标记与样式体检 · 0 上传" : "Markup & style check · 0 uploads";
    valuesEl.innerHTML = `<div class="rhythm-empty">${
      isZh ? "网页与组件片段按配色、嵌套和交互控件规则检查，不统计散文句长。" : "HTML/CSS drafts are checked for gradients, nested cards, and dead controls."
    }</div>`;
    return;
  }
  if (!text || !text.trim()) {
    if (subEl) subEl.textContent = isZh ? "等待输入 · 0 上传" : "Waiting for text · 0 uploads";
    valuesEl.innerHTML = `<div class="rhythm-empty">${
      isZh ? "贴入一段文字后，这里会实时显示句长起伏、细节密度与套路痕迹。" : "Paste a prose draft to inspect sentence cadence, concrete detail, and template risk."
    }</div>`;
    return;
  }

  const p = analyzeTextProfile(text, { modality });
  if (p.sentenceCount === 0) {
    if (subEl) subEl.textContent = isZh ? "实时离线计算 · 0 上传" : "Computed offline · 0 uploads";
    valuesEl.innerHTML = `<div class="rhythm-empty">${
      isZh ? "正文不含可统计的完整句子。" : "No prose sentences detected."
    }</div>`;
    return;
  }

  if (subEl) {
    subEl.textContent = isZh
      ? `共 ${p.sentenceCount} 句 · 平均句长 ${p.burstiness.meanLength} · 离线计算`
      : `${p.sentenceCount} ${p.sentenceCount === 1 ? "sentence" : "sentences"} · avg length ${p.burstiness.meanLength} · offline`;
  }

  const cv = p.burstiness.cv;
  let cadenceState;
  let cadenceTone;
  let cadencePct;
  if (p.sentenceCount < 2) {
    cadenceState = isZh ? "单句" : "1 sent";
    cadenceTone = "warn";
    cadencePct = 48;
  } else if (cv >= 0.32) {
    cadenceState = isZh ? "错落自然" : "Natural";
    cadenceTone = "good";
    cadencePct = Math.min(100, 55 + Math.round((cv - 0.32) * 110));
  } else if (cv >= 0.22) {
    cadenceState = isZh ? "偏平" : "Even";
    cadenceTone = "warn";
    cadencePct = 42;
  } else {
    cadenceState = isZh ? "句句等长" : "Monotone";
    cadenceTone = "bad";
    cadencePct = 20;
  }

  const conc = p.concreteness.per100Units;
  const anchors = p.concreteness.anchorCount;
  const detailTone = conc >= 3 ? "good" : conc >= 1.5 ? "warn" : "bad";
  const detailState = isZh ? `${anchors} 处实据` : `${anchors} ${anchors === 1 ? "fact" : "facts"}`;
  const detailPct = Math.min(100, Math.max(12, Math.round((conc / 6) * 100)));

  const varietyPct = Math.round(p.lexical.mattr * 100);
  const varietyTone = p.lexical.mattr >= 0.72 ? "good" : p.lexical.mattr >= 0.58 ? "warn" : "bad";
  const varietyState = `${varietyPct}%`;

  const semi = p.punctuation.maxSemicolonsInSentence;
  const dash = p.punctuation.emDashPer300;
  let punctTone = "good";
  let punctState = isZh ? "克制" : "Clean";
  let punctPct = 92;
  if (semi >= 2 || dash > 7) {
    punctTone = "bad";
    punctState = semi >= 2 ? (isZh ? "排比分号" : `${semi} semicolons`) : isZh ? "破折号偏密" : "Dash-heavy";
    punctPct = 26;
  } else if (dash > 3.5) {
    punctTone = "warn";
    punctState = isZh ? "略密" : "Watch";
    punctPct = 55;
  }

  const riskScore = p.telemetryRisk.score;
  const riskLevel = p.telemetryRisk.level;
  const riskTone = riskLevel === "high" ? "bad" : riskLevel === "medium" ? "warn" : "good";
  const riskState = isZh
    ? `${riskScore}/100 ${riskLevel === "high" ? "高" : riskLevel === "medium" ? "中" : "低"}`
    : `${riskScore}/100 ${riskLevel}`;

  valuesEl.innerHTML = [
    buildRhythmCellHtml({
      label: isZh ? "句长起伏" : "Sentence cadence",
      state: cadenceState,
      tone: cadenceTone,
      pct: cadencePct,
      tip: isZh ? "长短句交替越自然，越不容易读出机器匀速感" : "Varied short and long sentences read more naturally than uniform length",
    }),
    buildRhythmCellHtml({
      label: isZh ? "具体细节" : "Concrete detail",
      state: detailState,
      tone: detailTone,
      pct: detailPct,
      tip: isZh ? "数字、时间、单位、代码或配置项等可核对锚点数量" : "Count of checkable numbers, dates, units, paths, and code tokens",
    }),
    buildRhythmCellHtml({
      label: isZh ? "用词变化" : "Word variety",
      state: varietyState,
      tone: varietyTone,
      pct: varietyPct,
      tip: isZh ? "滑动窗口内的词汇丰富度，防止同一套连接词反复打转" : "Sliding-window vocabulary variety across consecutive sentences",
    }),
    buildRhythmCellHtml({
      label: isZh ? "标点克制" : "Punctuation",
      state: punctState,
      tone: punctTone,
      pct: punctPct,
      tip: isZh ? "检查单句多重分号排比与高频破折号插话" : "Watches for multi-semicolon pitch clauses and heavy em-dash habits",
    }),
    buildRhythmCellHtml({
      label: isZh ? "套路风险" : "Template risk",
      state: riskState,
      tone: riskTone,
      pct: Math.max(10, riskScore),
      tip: isZh ? "综合句式骨架复读、匀速空话与标点密度计算的模板痕迹分（越低越好）" : "Combined structural repetition and uniform-cadence risk score (lower is cleaner)",
    }),
  ].join("");
}

function renderWorkbench() {
  const pack = resolveEffectivePack(currentPackId, PACKS_BY_ID);
  const t0 = performance.now();
  const auditRes = binaryAuditResult
    ? binaryAuditResult
    : auditText(currentText, {
        filename: currentFilename,
        modality: currentModality,
        pack,
      });
  const elapsedMs = (performance.now() - t0).toFixed(1);
  const findings = binaryAuditResult
    ? auditRes.findings || []
    : withUtf16Spans(currentText, auditRes.findings);
  const skipped = auditRes.skipped || [];
  if (focusedFindingIdx >= findings.length) {
    focusedFindingIdx = -1;
  }

  const proofView = document.getElementById("proof-view");
  const editArea = document.getElementById("edit-textarea");
  const summaryEl = document.getElementById("wb-summary");
  const mobileCountsEl = document.getElementById("wb-mobile-counts");
  const notesEl = document.getElementById("notes-container");

  setViewMode(viewMode);
  const goodBtn = document.getElementById("btn-apply-good");
  const trapBtn = document.getElementById("btn-apply-trap");
  if (goodBtn) {
    goodBtn.disabled = Boolean(lastUploadedFile || binaryAuditResult || typeof activeSpecimen?.good !== "string");
  }
  if (trapBtn) {
    trapBtn.disabled = Boolean(lastUploadedFile || binaryAuditResult || typeof activeSpecimen?.trap !== "string");
  }

  const errorsCount = findings.filter((f) => f.severity === "error").length;
  const queriesCount = findings.length - errorsCount;

  const isEmptySheet = !binaryAuditResult && currentText.trim().length === 0;
  if (isEmptySheet) {
    const emptyLabel = currentLang === "zh" ? "空稿纸 · 等你贴字进来" : "Blank sheet · paste a draft";
    summaryEl.innerHTML = `<span>${emptyLabel}</span><span>${elapsedMs} ms</span>`;
    if (mobileCountsEl) mobileCountsEl.textContent = emptyLabel;
  } else {
    const countLabel =
      currentLang === "zh"
        ? `${errorsCount} 处硬伤 · ${queriesCount} 条提醒`
        : `${errorsCount} ${errorsCount === 1 ? "error" : "errors"} · ${queriesCount} ${queriesCount === 1 ? "warning" : "warnings"}`;
    summaryEl.innerHTML = `<span>${countLabel}</span><span>${elapsedMs} ms</span>`;
    if (mobileCountsEl) mobileCountsEl.textContent = countLabel;
  }

  renderVoiceMeter(currentText, currentModality, Boolean(binaryAuditResult));

  // Render Proof Sheet or Edit Mode
  if (viewMode === "edit" && !binaryAuditResult) {
    proofView.hidden = true;
    editArea.hidden = false;
    if (editArea.value !== currentText) {
      editArea.value = currentText;
    }
  } else {
    proofView.hidden = false;
    editArea.hidden = true;

    const lines = currentText.split("\n");
    let offset = 0;
    const htmlLines = lines.map((line, i) => {
      const annotated = binaryAuditResult
        ? escapeHtml(line)
        : renderAnnotatedLine(line, offset, findings, focusedFindingIdx);
      offset += line.length + 1;
      return `<li class="proof-line"><span class="line-num">${i + 1}</span><span class="line-content">${annotated}</span></li>`;
    });
    proofView.innerHTML = htmlLines.join("");

    proofView.querySelectorAll("[data-finding-idx]").forEach((el) => {
      const focusHandler = () => {
        const clickedIdx = Number(el.getAttribute("data-finding-idx"));
        focusedFindingIdx = focusedFindingIdx === clickedIdx ? -1 : clickedIdx;
        renderWorkbench();
        if (focusedFindingIdx >= 0) {
          const noteCard = notesEl.querySelector(`[data-note-idx="${focusedFindingIdx}"]`);
          if (noteCard) noteCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      };
      el.addEventListener("click", focusHandler);
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          focusHandler();
        }
      });
    });
  }

  // Render Margin Notes
  syncAiButtonsForBinary();
  const cards = [];

  for (const s of skipped) {
    cards.push(`<div class="note-card">
      <div class="note-head"><span class="sev-tag sev-warning">${currentLang === "zh" ? "跳过未查" : "Skipped"}</span><span class="note-loc">${escapeHtml(s.file)}</span></div>
      <div class="note-why">${escapeHtml(s.reason)}</div>
    </div>`);
  }

  if (findings.length === 0 && skipped.length === 0) {
    const cleanMsg = isEmptySheet
      ? currentLang === "zh"
        ? "这里还是空的。点「编辑原文」贴一段字，或者从左边选个例子。"
        : "Nothing here yet. Click 'Edit text' to paste a draft, or pick an example on the left."
      : !lastUploadedFile && !customRuleTitle && activeSpecimen?.id === "clean-nearmiss" && currentText === baselineText
        ? currentLang === "zh"
          ? "0 处问题。“抓手机”是动作，“默认超时不是 30 秒，而是 300 秒”是真实纠偏，“北京大学、清华大学、复旦大学”是真实校名，不会被误伤。"
          : "0 issues. 'Delve' is a debugger, 'wool tapestry' is literal, and the line-42 correction is factual, so nothing gets flagged."
        : currentLang === "zh"
          ? "没查出问题。"
          : "No issues found.";
    cards.push(`<div class="clean-sheet-msg">${escapeHtml(cleanMsg)}</div>`);
  }

  findings.forEach((f, idx) => {
    const isErr = f.severity === "error";
    const ruleDef = (pack.rules || []).find((r) => r.id === f.ruleId);
    const meta = RULE_UI_META[f.ruleId];
    const plainTitle = meta?.title?.[currentLang] || f.ruleId;
    const msg = ruleDef?.message?.[currentLang] || f.message || "";
    const dt = ruleDef?.deletionTest?.[currentLang] || f.deletionTest || "";
    const ex = ruleDef ? getLocalizedExemplar(ruleDef, currentLang) : f.exemplar;
    const loc = typeof f.location === "string" && f.location ? f.location : `${f.line || 1}:${f.col || 1}`;
    const excerpt = f.match || "";
    const focusedCls = idx === focusedFindingIdx ? " is-focused" : "";
    const dotCls = isErr ? "is-error" : "is-warn";

    const actionButtons = [];
    if (!binaryAuditResult && f.span) {
      if (f.ruleId === "chatbot-artifact") {
        actionButtons.push(
          `<button type="button" class="ctrl-btn ctrl-btn-sm" data-quick-strip="${idx}">${
            currentLang === "zh" ? "删掉这句寒暄" : "Strip wrapper"
          }</button>`
        );
      }
      actionButtons.push(
        `<button type="button" class="ctrl-btn ctrl-btn-sm" data-jump-edit="${idx}">${
          currentLang === "zh" ? "定位修改" : "Edit span"
        }</button>`
      );
    }
    const actionsHtml = actionButtons.length ? `<div class="note-actions">${actionButtons.join("")}</div>` : "";

    const exHtml = ex
      ? `<div class="note-exemplar">
          <div><span class="ex-label">${currentLang === "zh" ? "原句：" : "Before:"}</span> ${escapeHtml(sanitizePublicExemplar(ex.bad))}</div>
          ${ex.trap ? `<div><span class="ex-label">${currentLang === "zh" ? "改过头：" : "Overcorrected:"}</span> ${escapeHtml(sanitizePublicExemplar(ex.trap))}</div>` : ""}
          <div><span class="ex-label">${currentLang === "zh" ? "改好：" : "After:"}</span> ${escapeHtml(sanitizePublicExemplar(ex.good))}</div>
        </div>`
      : "";

    cards.push(`<article class="note-card${focusedCls}" data-note-idx="${idx}">
      <div class="note-head">
        <span style="display:inline-flex;align-items:center;gap:8px;font-weight:650;color:var(--ink);font-size:0.86rem;">
          <span class="hero-note-dot ${dotCls}"></span>${escapeHtml(plainTitle)}
        </span>
        <span class="note-loc">${escapeHtml(loc)}</span>
      </div>
      ${excerpt ? `<div class="note-snippet">“${escapeHtml(sanitizePublicExemplar(excerpt))}”</div>` : ""}
      ${dt ? `<div class="note-test"><strong>${currentLang === "zh" ? "判断方法：" : "Check:"}</strong> ${formatRuleProseHtml(dt)}</div>` : ""}
      ${actionsHtml}
      <details class="note-details">
        <summary>${currentLang === "zh" ? "规则和示例" : "Rule & examples"}</summary>
        <div class="note-why" style="margin-top:6px;">${formatRuleProseHtml(msg)}</div>
        ${exHtml}
        <div style="margin-top:6px;font-family:var(--font-mono);font-size:0.72rem;color:var(--ink-3);">
          <a href="#rule-${escapeHtml(f.ruleId)}">${escapeHtml(f.ruleId)}</a> · <a href="./rules/${escapeHtml(f.ruleId)}.md">.md</a>
        </div>
      </details>
    </article>`);
  });

  notesEl.innerHTML = cards.join("");
  notesEl.querySelectorAll("[data-quick-strip]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idx = Number(btn.getAttribute("data-quick-strip"));
      const f = findings[idx];
      if (!f?.span) return;
      let s = f.span.start;
      let e = f.span.end;
      // Strip trailing punctuation/whitespace belonging to the chat wrapper sentence
      while (e < currentText.length && /[：:！!。.，,\s]/.test(currentText[e])) {
        if (currentText[e] === "\n") {
          e += 1;
          break;
        }
        e += 1;
      }
      currentText = (currentText.slice(0, s) + currentText.slice(e)).replace(/^\n+/, "");
      focusedFindingIdx = -1;
      renderWorkbench();
    });
  });

  notesEl.querySelectorAll("[data-jump-edit]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idx = Number(btn.getAttribute("data-jump-edit"));
      const f = findings[idx];
      if (!f?.span || binaryAuditResult) return;
      setViewMode("edit");
      renderWorkbench();
      editArea.focus();
      try {
        editArea.setSelectionRange(f.span.start, f.span.end);
      } catch {
        // ignore selection errors
      }
    });
  });

  notesEl.querySelectorAll("[data-note-idx]").forEach((card) => {
    card.addEventListener("click", (ev) => {
      if (ev.target.closest("summary, a, button")) return;
      const clickedIdx = Number(card.getAttribute("data-note-idx"));
      focusedFindingIdx = focusedFindingIdx === clickedIdx ? -1 : clickedIdx;
      renderWorkbench();
      if (focusedFindingIdx >= 0 && viewMode === "proof") {
        const spanEl = proofView.querySelector(`[data-finding-idx="${focusedFindingIdx}"]`);
        if (spanEl) spanEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  });

  const nudgeEl = document.getElementById("wb-nudge-text");
  if (nudgeEl) {
    if (!isEmptySheet && findings.length === 0 && skipped.length === 0) {
      nudgeEl.textContent =
        currentLang === "zh"
          ? "检查通过（0 处问题）。装成 Skill / Plugin / MCP 让 Agent 下次自动跑，顺手去 GitHub 点个 Star 吧。"
          : "Looks clean (0 issues). Install the Skill, Plugin, or MCP so your agent checks automatically next time, or star us on GitHub.";
    } else if (!isEmptySheet && (lastUploadedFile || currentText !== baselineText)) {
      nudgeEl.textContent =
        currentLang === "zh"
          ? `已标出 ${findings.length} 处问题。不想每次手动贴进来？把 dislop 装给你的 Agent，或去 GitHub 收藏仓库。`
          : `Flagged ${findings.length} ${findings.length === 1 ? "issue" : "issues"}. Install dislop for your agent to run this automatically, or star the repo on GitHub.`;
    } else {
      nudgeEl.textContent = (I18N[currentLang] || I18N.zh)["wb.nudgeText"];
    }
  }
}

// ---------- Real Cases Showcase (Language-Pure + Interactive Load & Share) ----------

function clearWorkbenchTransientPanels() {
  aiReqSeq += 1;
  preRewriteDraft = null;
  const aiPanel = document.getElementById("ai-result-panel");
  if (aiPanel) {
    aiPanel.hidden = true;
    aiPanel.innerHTML = "";
  }
  const appliedEl = document.getElementById("wb-applied-banner");
  if (appliedEl) {
    appliedEl.hidden = true;
    appliedEl.innerHTML = "";
  }
}

function focusWorkbench() {
  document.getElementById("workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("wb-heading")?.focus({ preventScroll: true });
}

function loadSpecimenById(specimenId) {
  const list = SPECIMENS_BY_LANG[currentLang] || SPECIMENS_BY_LANG.zh;
  const idx = list.findIndex((s) => s.id === specimenId);
  if (idx === -1) return;
  const sp = list[idx];
  uploadSeq += 1;
  clearWorkbenchTransientPanels();
  binaryAuditResult = null;
  lastUploadedFile = null;
  uploadedOriginalText = null;
  customRuleTitle = null;
  activeSpecimenIdx = idx;
  activeSpecimen = sp;
  currentPackId = sp.pack;
  currentFilename = sp.filename;
  currentModality = sp.modality;
  baselineText = sp.bad;
  currentText = sp.bad;
  focusedFindingIdx = -1;
  document.getElementById("pack-select").value = sp.pack;
  setViewMode("proof");
  updateSpecimenRailSelection();
  renderWorkbench();
  focusWorkbench();
}

function loadCaseIntoWorkbench(caseObj) {
  if (!caseObj) return;
  if (caseObj.id === "doc") {
    const badText = caseObj.steps.find((s) => s.cls === "is-bad")?.text || "";
    const trapText = caseObj.steps.find((s) => s.cls === "is-trap")?.text || null;
    const goodText = caseObj.steps.find((s) => s.cls === "is-good")?.text || null;
    uploadSeq += 1;
    clearWorkbenchTransientPanels();
    binaryAuditResult = null;
    lastUploadedFile = null;
    uploadedOriginalText = null;
    customRuleTitle = "case-doc";
    activeSpecimen = {
      id: "case-doc",
      pack: "business-brief",
      filename: "q4-settlement.md",
      modality: "markdown",
      bad: badText,
      trap: trapText,
      good: goodText,
    };
    currentPackId = "business-brief";
    currentFilename = "q4-settlement.md";
    currentModality = "markdown";
    baselineText = badText;
    currentText = badText;
    focusedFindingIdx = -1;
    document.getElementById("pack-select").value = "business-brief";
    setViewMode("proof");
    updateSpecimenRailSelection();
    renderWorkbench();
    focusWorkbench();
    return;
  }
  loadSpecimenById(caseObj.loadSpecimenId);
}

function renderCases() {
  const grid = document.getElementById("cases-grid");
  if (!grid) return;
  const cases = CASES_BY_LANG[currentLang] || CASES_BY_LANG.zh;
  grid.innerHTML = cases
    .map((c) => {
      const stepsHtml = c.steps
        .map((st) => {
          const body = st.html ? st.html : escapeHtml(st.text);
          return `<div class="case-step ${escapeHtml(st.cls)}"><span class="case-step-label">${escapeHtml(st.label)}</span>${body}</div>`;
        })
        .join("");
      const noteHtml = c.note ? `<p class="case-note">${escapeHtml(c.note)}</p>` : "";
      const primaryAction = c.loadSpecimenId
        ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-load-case="${escapeHtml(c.id)}">${escapeHtml(c.loadLabel)}</button>`
        : `<a href="${escapeHtml(c.linkHref)}" class="ctrl-btn ctrl-btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;">${escapeHtml(c.linkLabel)}</a>`;
      return `<article class="case-card">
        <span class="case-kicker">${escapeHtml(c.kicker)}</span>
        <h3 class="case-title">${escapeHtml(c.title)}</h3>
        <div class="case-body">${stepsHtml}${noteHtml}</div>
        <div class="case-actions">
          ${primaryAction}
          <button type="button" class="ctrl-btn ctrl-btn-sm" data-share-case="${escapeHtml(c.id)}">${escapeHtml(c.shareLabel)}</button>
        </div>
      </article>`;
    })
    .join("");

  grid.querySelectorAll("[data-load-case]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = btn.getAttribute("data-load-case");
      const found = cases.find((c) => c.id === cid || c.loadSpecimenId === cid);
      loadCaseIntoWorkbench(found);
    });
  });

  grid.querySelectorAll("[data-share-case]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const caseId = btn.getAttribute("data-share-case");
      const found = cases.find((x) => x.id === caseId);
      if (found) {
        await copyTextWithFeedback(btn, found.shareText);
      }
    });
  });
}

// ---------- Rule Catalog (Strict Language Purity: ZH shows ZH+both; EN shows EN+both) ----------

function findRuleById(ruleId) {
  for (const [packId, pack] of Object.entries(PACKS_BY_ID)) {
    const found = (pack.rules || []).find((r) => r.id === ruleId);
    if (found) return { packId, rule: found };
  }
  return null;
}

function loadRuleInWorkbench(ruleId) {
  const found = findRuleById(ruleId);
  if (!found || !found.rule.exemplar) return;
  const { packId, rule } = found;
  const mods = rule.modalities || [];
  let modality = "markdown";
  let ext = "md";
  if (mods.includes("css") && !mods.includes("markdown")) {
    modality = "css";
    ext = "css";
  } else if (mods.includes("svg") && !mods.includes("markdown") && !mods.includes("html")) {
    modality = "svg";
    ext = "svg";
  } else if (mods.includes("html") && !mods.includes("markdown")) {
    modality = "html";
    ext = "html";
  }
  const targetPack =
    packId === "core"
      ? modality === "html" || modality === "css" || modality === "svg"
        ? "deck-and-ui"
        : "business-brief"
      : packId;
  const effPack = resolveEffectivePack(targetPack, PACKS_BY_ID);
  const sampleFilename = `${rule.id}.${ext}`;

  const localizedEx = getLocalizedExemplar(rule, currentLang) || rule.exemplar;
  let badSample = localizedEx.bad;
  let goodSample = localizedEx.good;
  let trapSample = localizedEx.trap || null;

  const probeEx = auditText(badSample, { filename: sampleFilename, modality, pack: effPack });
  if (!probeEx.findings.some((f) => f.ruleId === rule.id)) {
    const rawProbe = auditText(rule.exemplar.bad, { filename: sampleFilename, modality, pack: effPack });
    if (rawProbe.findings.some((f) => f.ruleId === rule.id)) {
      badSample = rule.exemplar.bad;
      goodSample = rule.exemplar.good;
      trapSample = rule.exemplar.trap || null;
    } else if (rule.demo?.bad) {
      badSample = rule.demo.bad;
      goodSample = rule.demo.good || null;
      trapSample = null;
    }
  }

  if (goodSample) {
    const gAudit = auditText(goodSample, { filename: sampleFilename, modality, pack: effPack });
    if (gAudit.findings.length > 0) goodSample = null;
  }
  if (trapSample) {
    const tAudit = auditText(trapSample, { filename: sampleFilename, modality, pack: effPack });
    if (tAudit.findings.length === 0) trapSample = null;
  }

  uploadSeq += 1;
  binaryAuditResult = null;
  lastUploadedFile = null;
  uploadedOriginalText = null;
  customRuleTitle = rule.id;
  activeSpecimen = {
    id: `rule-${rule.id}`,
    pack: targetPack,
    filename: sampleFilename,
    modality,
    bad: badSample,
    trap: trapSample,
    good: goodSample,
  };
  currentPackId = targetPack;
  currentFilename = activeSpecimen.filename;
  currentModality = modality;
  baselineText = activeSpecimen.bad;
  currentText = activeSpecimen.bad;
  focusedFindingIdx = -1;
  document.getElementById("pack-select").value = targetPack;
  setViewMode("proof");
  updateSpecimenRailSelection();
  renderWorkbench();
  document.getElementById("workbench").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetRuleFilters() {
  activeRuleFilter = "all";
  activeModalityFilter = "all";
  activeSeverityFilter = "all";
  activeRuleSearch = "";
  document.getElementById("rule-search").value = "";
  document.getElementById("rule-modality-filter").value = "all";
  document.getElementById("rule-severity-filter").value = "all";
  document.querySelectorAll("[data-pack-filter]").forEach((b) => {
    const active = b.getAttribute("data-pack-filter") === "all";
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  renderRulesTable();
}

function renderRulesTable() {
  const tbody = document.getElementById("rules-tbody");
  const countEl = document.getElementById("rules-count");
  const rows = [];
  let visibleInLangCount = 0;
  let matchedCount = 0;
  const q = activeRuleSearch.trim().toLowerCase();
  const order = [
    "core",
    "business-brief",
    "engineering-spec",
    "regulated-comms",
    "literary-essay",
    "deck-and-ui",
    "executive-deck",
  ];
  const textMods = new Set(["markdown", "text", "html", "css", "jsx", "svg"]);

  for (const pid of order) {
    const pack = PACKS_BY_ID[pid];
    if (!pack) continue;
    for (const r of pack.rules || []) {
      const meta = RULE_UI_META[r.id] || { lang: "both", title: { zh: r.id, en: r.id } };
      // Strict language purity: hide EN-only rules in ZH view and ZH-only rules in EN view
      // (unless specifically targeted via #rule-<id> hash link)
      const hiddenByLang =
        highlightedRuleId !== r.id &&
        ((currentLang === "zh" && meta.lang === "en") || (currentLang === "en" && meta.lang === "zh"));
      if (hiddenByLang) continue;

      visibleInLangCount += 1;
      if (activeRuleFilter !== "all" && activeRuleFilter !== pid) continue;
      if (activeModalityFilter !== "all" && !(r.modalities || []).includes(activeModalityFilter)) continue;
      if (activeSeverityFilter !== "all" && r.severity !== activeSeverityFilter) continue;

      const ex = getLocalizedExemplar(r, currentLang);
      const title = meta.title?.[currentLang] || r.id;
      const why = r.message?.[currentLang] || r.message?.en || "";
      const dt = r.deletionTest?.[currentLang] || r.deletionTest?.en || "";

      if (q) {
        const hay = [r.id, title, pid, why, dt, ex?.bad, ex?.trap, ex?.good, ...(r.modalities || [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }

      matchedCount += 1;
      const sevCls = r.severity === "error" ? "sev-error" : "sev-warning";
      const sevLabel =
        currentLang === "zh"
          ? r.severity === "error"
            ? "硬伤"
            : r.severity === "warning"
              ? "提醒"
              : "轻提示"
          : r.severity === "error"
            ? "hard bug"
            : r.severity === "warning"
              ? "warning"
              : "info";
      const canTry = ex && (r.modalities || []).some((m) => textMods.has(m));
      const hashCls = highlightedRuleId === r.id ? " is-hash-target" : "";
      const packLabel = PACK_LABELS[currentLang]?.[pid] || pid;

      const badLabel = currentLang === "zh" ? "原句：" : "Before:";
      const trapLabel = currentLang === "zh" ? "改过头：" : "Overcorrected:";
      const goodLabel = currentLang === "zh" ? "改好：" : "After:";

      rows.push(`<tr id="rule-${escapeHtml(r.id)}" class="rule-row${hashCls}" data-rule-lang="${escapeHtml(meta.lang)}">
        <td class="rule-id-cell">
          <strong>${escapeHtml(title)}</strong>
          <div style="margin-top:2px;"><code>${escapeHtml(r.id)}</code></div>
          <div class="rule-id-actions">
            ${
              canTry
                ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-try-rule="${escapeHtml(r.id)}">${
                    currentLang === "zh" ? "试试 ↑" : "Try ↑"
                  }</button>`
                : ""
            }
            <a class="rule-md-link" href="./rules/${escapeHtml(r.id)}.md">.md</a>
          </div>
        </td>
        <td class="rule-pack-cell"><span class="rule-pack-name">${escapeHtml(packLabel)}</span><span class="sev-tag ${sevCls}" style="font-size:0.75rem;">${escapeHtml(sevLabel)}</span></td>
        <td><code>${escapeHtml((r.modalities || []).join(", "))}</code></td>
        <td><div>${formatRuleProseHtml(why)}</div><div style="color:var(--ink-2);font-size:0.82rem;margin-top:4px;"><strong>${
        currentLang === "zh" ? "判断方法：" : "Check:"
      }</strong> ${formatRuleProseHtml(dt)}</div></td>
        <td>${
          ex
            ? `<div class="ex-stack">
                 <div class="ex-row-bad"><strong>${badLabel}</strong> <code>${escapeHtml(sanitizePublicExemplar(ex.bad))}</code></div>
                 ${ex.trap ? `<div class="ex-row-trap"><strong>${trapLabel}</strong> <code>${escapeHtml(sanitizePublicExemplar(ex.trap))}</code></div>` : ""}
                 <div class="ex-row-good"><strong>${goodLabel}</strong> <code>${escapeHtml(sanitizePublicExemplar(ex.good))}</code></div>
               </div>`
            : "—"
        }</td>
      </tr>`);
    }
  }

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--ink-2);padding:18px;">${
      currentLang === "zh" ? "没有匹配的规则。" : "No rules matched."
    } <button type="button" class="ctrl-btn ctrl-btn-sm" id="rules-clear-empty-btn" style="margin-left:8px;">${
      currentLang === "zh" ? "清空筛选" : "Clear filters"
    }</button></td></tr>`;
    const clearBtn = document.getElementById("rules-clear-empty-btn");
    if (clearBtn) clearBtn.addEventListener("click", resetRuleFilters);
  } else {
    tbody.innerHTML = rows.join("");
  }

  countEl.textContent =
    currentLang === "zh" ? `${matchedCount} / ${visibleInLangCount} 条规则` : `${matchedCount} / ${visibleInLangCount} rules`;

  tbody.querySelectorAll("[data-try-rule]").forEach((btn) => {
    btn.addEventListener("click", () => {
      loadRuleInWorkbench(btn.getAttribute("data-try-rule"));
    });
  });
}

function handleRuleHash() {
  const hash = window.location.hash || "";
  const rulesFold = document.getElementById("rules-fold");
  if (hash === "#rules" && rulesFold) {
    rulesFold.open = true;
  }
  if (!hash.startsWith("#rule-")) {
    if (highlightedRuleId) {
      highlightedRuleId = null;
      renderRulesTable();
    }
    return;
  }
  const ruleId = hash.slice("#rule-".length);
  if (!findRuleById(ruleId)) return;

  if (rulesFold) rulesFold.open = true;

  activeRuleFilter = "all";
  activeModalityFilter = "all";
  activeSeverityFilter = "all";
  activeRuleSearch = "";
  highlightedRuleId = ruleId;

  document.getElementById("rule-search").value = "";
  document.getElementById("rule-modality-filter").value = "all";
  document.getElementById("rule-severity-filter").value = "all";
  document.querySelectorAll("[data-pack-filter]").forEach((b) => {
    const active = b.getAttribute("data-pack-filter") === "all";
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-pressed", String(active));
  });

  renderRulesTable();
  const row = document.getElementById(`rule-${ruleId}`);
  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function selectSnippetTab(tabBtn, moveFocus = false) {
  const tabs = Array.from(document.querySelectorAll("[data-snippet]"));
  activeSnippet = tabBtn.getAttribute("data-snippet");
  tabs.forEach((b) => {
    const active = b === tabBtn;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
    b.setAttribute("tabindex", active ? "0" : "-1");
  });
  const panel = document.getElementById("snippet-panel");
  if (panel && tabBtn.id) {
    panel.setAttribute("aria-labelledby", tabBtn.id);
  }
  renderSnippet();
  if (moveFocus) tabBtn.focus();
}

function renderSnippet() {
  const map = SNIPPETS_BY_LANG[currentLang] || SNIPPETS_BY_LANG.zh;
  document.getElementById("snippet-code").textContent = map[activeSnippet] || map.prompt;
}

async function copyTextWithFeedback(btn, text) {
  let copied = false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    document.body.removeChild(ta);
  }
  const prevTimer = copyTimers.get(btn);
  if (prevTimer) {
    clearTimeout(prevTimer);
  } else {
    btn.dataset.origLabel = btn.textContent;
  }
  const origLabel = btn.dataset.origLabel || I18N[currentLang]["btn.copy"];
  btn.textContent = copied
    ? I18N[currentLang]["btn.copied"]
    : currentLang === "zh"
      ? "复制失败"
      : "Copy failed";
  const timer = setTimeout(() => {
    const i18nKey = btn.getAttribute("data-i18n");
    btn.textContent = (i18nKey && I18N[currentLang]?.[i18nKey]) || origLabel;
    delete btn.dataset.origLabel;
    copyTimers.delete(btn);
  }, 1200);
  copyTimers.set(btn, timer);
}

function updateThemeToggleLabel() {
  const btn = document.getElementById("theme-toggle");
  const dict = I18N[currentLang] || I18N.zh;
  btn.textContent = currentTheme === "dark" ? dict["theme.light"] : dict["theme.dark"];
  btn.setAttribute("aria-label", currentLang === "zh" ? "切换浅色/深色主题" : "Toggle color theme");
}

function applyI18n(isUserSwitch = false) {
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  safeSetStorage("dislop-lang", currentLang);
  const dict = I18N[currentLang] || I18N.zh;
  if (dict["page.title"]) document.title = dict["page.title"];
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] !== undefined) el.textContent = dict[key];
  });

  // Update struck opener text safely without touching the sibling SVG path
  const strikeEl = document.getElementById("hero-strike-text");
  if (strikeEl) strikeEl.textContent = dict["lead.strike"];

  // Switch demo GIFs and reduced-motion posters strictly between ZH and EN assets
  const demoAlts = {
    zh: {
      "proof-cycle": "dislop 三态印刷校样：标出 AI 寒暄与空话、拦下二阶口号、改干净后退出码 0",
      "cli-check": "dislop CLI 本地离线检查：原稿退出码 1，清掉套话后复检退出码 0",
      "workbench-live": "dislop.com 浏览器离线工作台真实操作：点击切换原稿、二阶 AI 味与改干净版本",
      "ui-slop": "网页组件模板味排查：标出紫粉渐变、胶囊标签墙与空链接，改为冷白纸面 1px 校样",
    },
    en: {
      "proof-cycle": "dislop 3-state proof: flagging chatbot artifact, catching 2nd-order slogan, passing with exit 0",
      "cli-check": "dislop CLI offline check: exit code 1 on draft and exit code 0 after cleanup",
      "workbench-live": "dislop.com browser workbench capture: checking draft, 2nd-order slop, and clean copy",
      "ui-slop": "UI template slop check: flagging AI gradient, pill wall, and dead href='#' control",
    },
  };
  document.querySelectorAll("img[data-demo-gif]").forEach((imgEl) => {
    const slug = imgEl.getAttribute("data-demo-gif");
    if (!slug) return;
    imgEl.src = `./assets/demos/${slug}-${currentLang}-v1.gif`;
    if (demoAlts[currentLang]?.[slug]) imgEl.alt = demoAlts[currentLang][slug];
  });
  document.querySelectorAll("source[data-demo-poster]").forEach((srcEl) => {
    const slug = srcEl.getAttribute("data-demo-poster");
    if (!slug) return;
    srcEl.srcset = `./assets/demos/${slug}-${currentLang}-v1-poster.png`;
  });

  // Footer agent hint with link
  const agentHintEl = document.querySelector("[data-i18n='footer.agentHint']");
  if (agentHintEl) {
    agentHintEl.innerHTML =
      currentLang === "zh"
        ? '给 Agent 读的话，从 <a href="./llms.txt">/llms.txt</a> 开始。'
        : 'For agents, start at <a href="./llms.txt">/llms.txt</a>.';
  }

  // Update GitHub Awesome & Roadmap links to match language
  const ghLink = document.getElementById("awesome-gh-link");
  if (ghLink) {
    ghLink.href =
      currentLang === "zh"
        ? "https://github.com/dislop-ai/dislop/blob/main/awesome/README.zh-CN.md"
        : "https://github.com/dislop-ai/dislop/tree/main/awesome";
  }
  document.querySelectorAll('a[href^="./awesome/"]').forEach((aEl) => {
    const rawHref = aEl.getAttribute("href") || "./awesome/";
    if (rawHref.endsWith(".json") || rawHref.endsWith(".md")) return;
    aEl.setAttribute("href", currentLang === "en" ? "./awesome/?lang=en" : "./awesome/");
  });
  const roadmapHref =
    currentLang === "zh"
      ? "https://github.com/dislop-ai/dislop/blob/main/ROADMAP.zh-CN.md"
      : "https://github.com/dislop-ai/dislop/blob/main/ROADMAP.md";
  const roadmapLink = document.getElementById("footer-roadmap-link");
  if (roadmapLink) roadmapLink.href = roadmapHref;
  const shareRoadmapLink = document.getElementById("share-roadmap-link");
  if (shareRoadmapLink) shareRoadmapLink.href = roadmapHref;

  const searchEl = document.getElementById("rule-search");
  if (searchEl) {
    searchEl.placeholder = currentLang === "zh" ? "搜规则名、毛病或关键词…" : "Search rules or symptoms...";
    searchEl.setAttribute("aria-label", currentLang === "zh" ? "搜索规则" : "Search rules");
  }
  const editAreaEl = document.getElementById("edit-textarea");
  if (editAreaEl) {
    editAreaEl.placeholder =
      currentLang === "zh"
        ? "把你的文档、文案或 HTML 粘贴到这里，实时标出 AI 味…"
        : "Paste your doc, copy, or HTML here to check for AI slop live...";
    editAreaEl.setAttribute("aria-label", currentLang === "zh" ? "编辑文稿区域" : "Draft text editor");
  }
  const mainNavEl = document.querySelector("nav.nav-links");
  if (mainNavEl) {
    mainNavEl.setAttribute("aria-label", currentLang === "zh" ? "主导航" : "Main navigation");
  }
  const tokEmailEl = document.getElementById("token-email-input");
  if (tokEmailEl) {
    tokEmailEl.placeholder =
      currentLang === "zh" ? "输入你的常用邮箱，例如 you@company.com" : "Enter your email, e.g. you@company.com";
  }
  const wlEmailEl = document.getElementById("wl-email-input");
  if (wlEmailEl) {
    wlEmailEl.placeholder = currentLang === "zh" ? "联系邮箱" : "Work or personal email";
  }
  const wlNoteEl = document.getElementById("wl-note-input");
  if (wlNoteEl) {
    wlNoteEl.placeholder =
      currentLang === "zh"
        ? "选填：主要场景（如周报 / PPT / 公众号 / 团队文档）"
        : "Optional: main use case (specs, slides, blog, team docs)";
  }
  const voiceSamplesEl = document.getElementById("voice-samples-input");
  if (voiceSamplesEl) {
    voiceSamplesEl.placeholder =
      currentLang === "zh"
        ? "粘贴 1–3 段你自己写过的段落，段与段之间留一个空行…"
        : "Paste 1-3 paragraphs you wrote, separated by blank lines...";
  }

  const langBtn = document.getElementById("lang-toggle");
  langBtn.textContent = currentLang === "zh" ? "EN" : "中文";
  langBtn.setAttribute("aria-label", currentLang === "zh" ? "Switch to English" : "切换为中文");

  // Swap built-in specimen to native language if user has not uploaded or edited their own draft
  if (isUserSwitch && !lastUploadedFile && !customRuleTitle) {
    const untouched = currentText === baselineText || currentText === activeSpecimen.good || currentText === activeSpecimen.trap;
    if (untouched) {
      const nextList = SPECIMENS_BY_LANG[currentLang] || SPECIMENS_BY_LANG.zh;
      const nextSp = nextList[activeSpecimenIdx] || nextList[0];
      activeSpecimen = nextSp;
      currentPackId = nextSp.pack;
      currentFilename = nextSp.filename;
      currentModality = nextSp.modality;
      baselineText = nextSp.bad;
      currentText = nextSp.bad;
      focusedFindingIdx = -1;
      document.getElementById("pack-select").value = nextSp.pack;
    }
  }

  if (isUserSwitch) {
    safeSetStorage("dislop-lang", currentLang);
    clearWorkbenchTransientPanels();
  }

  updateThemeToggleLabel();
  renderHeroProof();
  renderCases();
  renderSpecimenRail();
  renderWorkbench();
  renderSnippet();
  renderRulesTable();
  renderCloudAccountState();
  renderSavedVoiceState(Boolean(isUserSwitch));
  syncAiButtonsForBinary();
}

function syncAiButtonsForBinary() {
  const revBtn = document.getElementById("btn-ai-review");
  const desBtn = document.getElementById("btn-ai-deslop");
  const isBin = Boolean(binaryAuditResult);
  const tip =
    currentLang === "zh"
      ? "Word / PPT 文件仅在本地离线检查；请切换到文本或 HTML 样稿再使用云端 AI。"
      : "Word/PowerPoint files run offline only; switch to a text or HTML draft to use Cloud AI.";
  for (const btn of [revBtn, desBtn]) {
    if (!btn) continue;
    if (isBin) {
      btn.disabled = true;
      btn.title = tip;
    } else if (!cloudBusy) {
      btn.disabled = false;
      btn.removeAttribute("title");
    }
  }
}

// ---------- Opt-In Cloud AI Workbench & Free Token / Waitlist ----------

const CLOUD_STORE_KEY = "dislop_cloud_account_v1";
const VOICE_STORE_KEY = "dislop_voice_profile_v1";
let cloudBusy = false;
let aiReqSeq = 0;
let preRewriteDraft = null;

function loadSavedVoiceProfile() {
  try {
    const raw = safeGetStorage(VOICE_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.tone ? parsed : null;
  } catch {
    return null;
  }
}

function saveVoiceProfile(profile) {
  if (!profile) {
    try {
      window.localStorage.removeItem(VOICE_STORE_KEY);
    } catch {
      // ignore storage errors
    }
    return;
  }
  safeSetStorage(VOICE_STORE_KEY, JSON.stringify(profile));
}

function formatVoiceHabits(habits, isZh) {
  if (!habits) return "";
  if (Array.isArray(habits)) {
    return habits.filter(Boolean).join(isZh ? "；" : "; ");
  }
  return String(habits);
}

function renderSavedVoiceState(forceRefreshText = false) {
  const saved = loadSavedVoiceProfile();
  const badge = document.getElementById("voice-active-badge");
  const clearBtn = document.getElementById("btn-voice-clear");
  const outBox = document.getElementById("voice-output-box");
  const isZh = currentLang === "zh";
  if (saved) {
    if (badge) {
      badge.hidden = false;
      badge.textContent = isZh ? "已启用个人文风" : "Personal voice active";
    }
    if (clearBtn) clearBtn.hidden = false;
    if (outBox && (outBox.hidden || forceRefreshText)) {
      const habitsStr = formatVoiceHabits(saved.sentenceHabits, isZh);
      outBox.hidden = false;
      outBox.innerHTML = `<strong>${isZh ? "当前生效文风：" : "Active voice profile:"}</strong> ${escapeHtmlSafe(saved.tone)}${habitsStr ? ` · ${escapeHtmlSafe(habitsStr)}` : ""}`;
    }
  } else {
    if (badge) badge.hidden = true;
    if (clearBtn) clearBtn.hidden = true;
    if (outBox) {
      outBox.hidden = true;
      outBox.innerHTML = "";
    }
  }
}

function handleVoiceOfflineClick() {
  const isZh = currentLang === "zh";
  const outBox = document.getElementById("voice-output-box");
  if (!outBox) return;
  const raw = String(document.getElementById("voice-samples-input")?.value || "").trim();
  const samples = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  if (samples.length === 0) {
    outBox.hidden = false;
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${isZh ? "请先贴入至少 1 段你自己的文字样稿。" : "Paste at least 1 paragraph of your own writing first."}</p>`;
    return;
  }

  const res = extractVoiceProfileOffline(samples, { lang: isZh ? "zh" : "en" });
  saveVoiceProfile(res.profile);
  const st = res.stylometrics;
  const habitsStr = formatVoiceHabits(res.profile?.sentenceHabits, isZh);
  outBox.hidden = false;
  outBox.innerHTML = `<div><strong>${isZh ? "已在本地提取并保存个人文风（0 上传 · 0 额度）：" : "Personal voice extracted offline (0 uploads · 0 credits):"}</strong></div>
    <div style="margin-top:4px;">${escapeHtmlSafe(res.profile?.tone || "")}${habitsStr ? ` · ${escapeHtmlSafe(habitsStr)}` : ""}</div>
    <div style="margin-top:4px;font-family:var(--font-mono);font-size:0.74rem;color:var(--ink-2);">${
      isZh
        ? `统计样稿 ${st.sampleCount} 段 / ${st.sentenceCount} 句 · 平均句长 ${st.meanLength} · 细节密度 ${st.concretenessPer100}`
        : `${st.sampleCount} sample(s) / ${st.sentenceCount} sentences · avg length ${st.meanLength} · detail density ${st.concretenessPer100}`
    }</div>`;
  renderSavedVoiceState();
}

async function handleVoiceExtractClick() {
  const isZh = currentLang === "zh";
  const savedAcct = loadSavedCloudAccount();
  const outBox = document.getElementById("voice-output-box");
  const btn = document.getElementById("btn-voice-extract");
  if (!outBox) return;

  if (!savedAcct?.token) {
    outBox.hidden = false;
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0 0 8px;">${
      isZh ? "云端 AI 提炼需要先领取免费 30 额度密钥（也可直接点旁边「离线统计声纹」0 联网提取）。" : "Claim a free 30-credit key for Cloud AI extraction, or click 'Offline voice stats' right beside it."
    }</p><a href="#cloud-token-box" class="btn-primary" style="min-height:30px;padding:5px 12px;font-size:0.8rem;">${
      isZh ? "去下方 10 秒免费领密钥 ↓" : "Claim free key below ↓"
    }</a>`;
    return;
  }

  const raw = String(document.getElementById("voice-samples-input")?.value || "").trim();
  const samples = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  if (samples.length === 0) {
    outBox.hidden = false;
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${isZh ? "请先贴入至少 1 段你自己的文字样稿。" : "Paste at least 1 paragraph of your own writing first."}</p>`;
    return;
  }

  if (btn) btn.disabled = true;
  outBox.hidden = false;
  outBox.textContent = isZh ? "正在分析句长习惯与文风特征…" : "Analyzing sentence rhythm and voice profile...";

  try {
    const resp = await fetch("/api/v1/voice/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${savedAcct.token}` },
      body: JSON.stringify({ samples, lang: isZh ? "zh" : "en" }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</p>`;
      return;
    }
    updateCreditsFromBilling(data.billing);
    saveVoiceProfile(data.profile);
    const habitsStr = formatVoiceHabits(data.profile?.sentenceHabits, isZh);
    outBox.hidden = false;
    outBox.innerHTML = `<div><strong>${isZh ? "个人文风已保存，后续「AI 一键去味」将自动套用：" : "Personal voice saved and wired into AI Rewrite:"}</strong></div>
      <div style="margin-top:4px;">${escapeHtmlSafe(data.profile?.tone || "")}${habitsStr ? ` · ${escapeHtmlSafe(habitsStr)}` : ""}</div>`;
    renderSavedVoiceState();
  } catch (err) {
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function loadSavedCloudAccount() {
  try {
    const raw = safeGetStorage(CLOUD_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

function saveCloudAccount(acct) {
  if (!acct) {
    try {
      window.localStorage.removeItem(CLOUD_STORE_KEY);
    } catch {
      // ignore storage errors
    }
    return;
  }
  safeSetStorage(CLOUD_STORE_KEY, JSON.stringify(acct));
}

function escapeHtmlSafe(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCloudAccountState() {
  const saved = loadSavedCloudAccount();
  const quotaEl = document.getElementById("ai-quota-label");
  const tokenLinkEl = document.getElementById("ai-token-link");
  const statusEl = document.getElementById("cloud-account-status");
  const isZh = currentLang === "zh";

  if (saved) {
    const rem = saved.remaining ?? saved.monthlyQuota ?? 30;
    if (quotaEl) {
      quotaEl.textContent = isZh
        ? `已登录 ${saved.email} · 剩余 ${rem} 额度`
        : `Signed in as ${saved.email} · ${rem} credits left`;
    }
    if (tokenLinkEl) {
      tokenLinkEl.textContent = isZh ? "管理密钥 →" : "Manage key →";
    }
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.innerHTML = isZh
        ? `<span>当前浏览器已绑定 <strong>${escapeHtmlSafe(saved.email)}</strong>（${escapeHtmlSafe(saved.plan || "free")} · 剩余 ${escapeHtmlSafe(rem)} 额度）</span><span class="quick-actions"><button type="button" id="btn-refresh-cloud-token" class="ctrl-btn ctrl-btn-sm">刷新额度</button><button type="button" id="btn-clear-cloud-token" class="ctrl-btn ctrl-btn-sm">退出本地绑定</button></span>`
        : `<span>Active key for <strong>${escapeHtmlSafe(saved.email)}</strong> (${escapeHtmlSafe(saved.plan || "free")} · ${escapeHtmlSafe(rem)} credits left)</span><span class="quick-actions"><button type="button" id="btn-refresh-cloud-token" class="ctrl-btn ctrl-btn-sm">Refresh</button><button type="button" id="btn-clear-cloud-token" class="ctrl-btn ctrl-btn-sm">Sign out</button></span>`;
      document.getElementById("btn-refresh-cloud-token")?.addEventListener("click", async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          const resp = await fetch("/api/v1/account/me", { headers: { Authorization: `Bearer ${saved.token}` } });
          const data = await resp.json().catch(() => ({}));
          const stillSignedIn = loadSavedCloudAccount();
          if (resp.ok && data.account && stillSignedIn && stillSignedIn.token === saved.token) {
            saveCloudAccount({
              ...stillSignedIn,
              plan: data.account.plan,
              remaining: data.account.totalRemaining,
              monthlyQuota: data.account.monthlyQuota,
            });
            renderCloudAccountState();
          }
        } catch {
          // keep cached state on transient error
        } finally {
          btn.disabled = false;
        }
      });
      document.getElementById("btn-clear-cloud-token")?.addEventListener("click", () => {
        saveCloudAccount(null);
        const out = document.getElementById("token-output-box");
        if (out) out.hidden = true;
        renderCloudAccountState();
      });
    }
  } else {
    if (quotaEl) {
      quotaEl.textContent = isZh
        ? "本地检查免登录零上传 · 云端审校与改写需登录（每月免费 30 额度）"
        : "Local checks need no sign-in · Sign in for Cloud AI (30 free credits/mo)";
    }
    if (tokenLinkEl) {
      tokenLinkEl.textContent = isZh ? "领免费密钥 →" : "Get free key →";
    }
    if (statusEl) {
      statusEl.hidden = true;
      statusEl.innerHTML = "";
    }
  }
}

function updateCreditsFromBilling(billing) {
  const saved = loadSavedCloudAccount();
  if (billing?.mode === "account" && billing.account && saved) {
    saveCloudAccount({
      ...saved,
      plan: billing.account.plan,
      remaining: billing.account.totalRemaining,
      monthlyQuota: billing.account.monthlyQuota,
    });
    renderCloudAccountState();
  } else if (billing?.mode === "anonymous" && billing.anon) {
    const quotaEl = document.getElementById("ai-quota-label");
    if (quotaEl) {
      quotaEl.textContent =
        currentLang === "zh"
          ? `今日匿名试用剩余 ${billing.anon.remaining} / ${billing.anon.limit} 额度 · 登录后每月 30 次`
          : `Anonymous trial: ${billing.anon.remaining} / ${billing.anon.limit} credits left today · 30/mo with free token`;
    }
  }
}

function setAiButtonsBusy(busy, labelZh, labelEn) {
  cloudBusy = busy;
  const revBtn = document.getElementById("btn-ai-review");
  const desBtn = document.getElementById("btn-ai-deslop");
  if (revBtn) revBtn.disabled = busy;
  if (desBtn) desBtn.disabled = busy;
  const panel = document.getElementById("ai-result-panel");
  if (busy && panel) {
    panel.hidden = false;
    panel.innerHTML = `<div class="ai-result-meta">${escapeHtmlSafe(currentLang === "zh" ? labelZh : labelEn)}</div>`;
  }
}

function renderAiError(errCode, message) {
  const panel = document.getElementById("ai-result-panel");
  if (!panel) return;
  panel.hidden = false;
  const isZh = currentLang === "zh";
  const needsToken =
    errCode === "auth_required" ||
    errCode === "anon_limit_reached" ||
    errCode === "anon_text_too_long" ||
    errCode === "insufficient_credits";
  const ctaHtml = needsToken
    ? `<div class="quick-actions"><a href="#cloud-token-box" class="btn-primary" style="min-height:30px;padding:5px 12px;font-size:0.8rem;">${isZh ? "免费领取 30 额度密钥 ↓" : "Claim free 30-credit key ↓"}</a></div>`
    : "";
  panel.innerHTML = `<p class="ai-error-msg">${escapeHtmlSafe(message)}</p>${ctaHtml}`;
}

async function runCloudAction(kind) {
  if (cloudBusy) return;
  const isZh = currentLang === "zh";
  if (binaryAuditResult) {
    renderAiError(
      "binary_unsupported",
      isZh
        ? "网页 AI 审校和一键去味目前支持文本、Markdown 与 HTML。Word / PPT 可继续用左侧离线检查。"
        : "Web AI review and rewrite currently support text, Markdown, and HTML. Word and PowerPoint files run offline above."
    );
    return;
  }
  const text = String(currentText || "").trim();
  if (!text) {
    renderAiError("empty", isZh ? "请先粘贴或选择一段草稿。" : "Paste or pick a draft first.");
    return;
  }

  const endpoint = kind === "review" ? "/api/v1/review" : "/api/v1/deslop";
  const saved = loadSavedCloudAccount();
  if (!saved?.token) {
    renderAiError(
      "auth_required",
      isZh
        ? "云端深度审校与改写需要先在下方免费领取 30 额度密钥（无需绑卡，本地基础检查无需登录）。"
        : "Claim a free 30-credit key below to run Cloud Review or Rewrite (no card required; local checks stay free without sign-in)."
    );
    return;
  }
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${saved.token}` };
  const reqId = ++aiReqSeq;
  const sourceSnapshot = currentText;
  const localPack = resolveEffectivePack(currentPackId || "business-brief", PACKS_BY_ID);
  const localBeforeCount = (auditText(sourceSnapshot, { filename: currentFilename || "draft.md", modality: currentModality || "markdown", pack: localPack }).findings || []).length;

  setAiButtonsBusy(
    true,
    kind === "review" ? "正在调用 AI 深度审校（通常 1–2 秒）…" : "正在调用 AI 一键去味并自动复检数字与规则（通常 5–8 秒）…",
    kind === "review" ? "Running AI 3rd-order review (typically 1-2s)..." : "Running self-healing AI rewrite + post-check (typically 5-8s)..."
  );

  try {
    const savedVoice = kind === "deslop" ? loadSavedVoiceProfile() : null;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text,
        filename: currentFilename || "draft.md",
        modality: currentModality || "markdown",
        pack: currentPackId || "business-brief",
        lang: currentLang === "zh" ? "zh" : "en",
        ...(savedVoice ? { voiceProfile: savedVoice } : {}),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (reqId !== aiReqSeq) return;
    if (!resp.ok) {
      renderAiError(data.error || "request_failed", data.message || `HTTP ${resp.status}`);
      return;
    }

    updateCreditsFromBilling(data.billing);
    const panel = document.getElementById("ai-result-panel");
    if (!panel) return;
    panel.hidden = false;

    if (kind === "review") {
      const level = data.llmReview?.aiFlavorLevel || "medium";
      const summary = data.llmReview?.summary || "";
      const issues = Array.isArray(data.llmReview?.issues) ? data.llmReview.issues : [];
      const itemsHtml = issues.length
        ? `<ul class="ai-changes-list">${issues
            .map(
              (it) =>
                `<li><strong>${escapeHtmlSafe(it.layer || it.category || (isZh ? "结构与文风" : "style"))}</strong>：${escapeHtmlSafe(it.why || "")}${it.fix ? ` → ${escapeHtmlSafe(it.fix)}` : ""}</li>`
            )
            .join("")}</ul>`
        : "";
      panel.innerHTML = `
        <div class="ai-result-head">
          <span class="ai-result-title">${isZh ? `AI 深度审校（AI 味等级：${escapeHtmlSafe(level)}）` : `AI Review (slop level: ${escapeHtmlSafe(level)})`}</span>
          <span class="ai-result-meta">${escapeHtmlSafe(data.model || "")} · -${escapeHtmlSafe(data.creditWeight ?? 1)} ${isZh ? "额度" : "cr"}</span>
        </div>
        <p style="margin:0 0 8px;">${escapeHtmlSafe(summary)}</p>
        ${itemsHtml}
        <div class="quick-actions">
          <button type="button" id="btn-ai-close-panel" class="ctrl-btn ctrl-btn-sm">${isZh ? "收起" : "Dismiss"}</button>
        </div>`;
      document.getElementById("btn-ai-close-panel")?.addEventListener("click", () => {
        panel.hidden = true;
      });
    } else {
      const revised = String(data.revised || "");
      const localAfterCount = (auditText(revised, { filename: currentFilename || "draft.md", modality: currentModality || "markdown", pack: localPack }).findings || []).length;
      const hasNumDiff = Boolean(data.numericDiff && Array.isArray(data.numericDiff.missing) && Array.isArray(data.numericDiff.added));
      const numDelta = hasNumDiff ? data.numericDiff.missing.length + data.numericDiff.added.length : null;
      const numNote = !hasNumDiff
        ? ""
        : isZh
          ? ` · 数字${numDelta === 0 ? " 100% 保留" : `变动 ${numDelta}`}`
          : ` · Numbers ${numDelta === 0 ? "100% intact" : `delta ${numDelta}`}`;
      const changes = Array.isArray(data.changes) ? data.changes : [];
      const statusMeta = isZh
        ? `原稿 ${localBeforeCount} 处命中 → 改稿 ${localAfterCount} 处命中${numNote}${data.repaired ? " · 已自动二次修复" : ""} · ${data.model || ""}`
        : `Before: ${localBeforeCount} → After: ${localAfterCount} findings${numNote}${data.repaired ? " · auto-repaired" : ""} · ${data.model || ""}`;
      const changesHtml = changes.length
        ? `<ul class="ai-changes-list">${changes.map((c) => `<li>${escapeHtmlSafe(c)}</li>`).join("")}</ul>`
        : "";

      panel.innerHTML = `
        <div class="ai-result-head">
          <span class="ai-result-title">${isZh ? "AI 一键去味结果" : "AI Self-Healing Rewrite"}</span>
          <span class="ai-result-meta">${escapeHtmlSafe(statusMeta)}</span>
        </div>
        <div class="ai-result-text" id="ai-revised-output">${escapeHtmlSafe(revised)}</div>
        ${changesHtml}
        <div class="quick-actions">
          <button type="button" id="btn-ai-apply" class="btn-primary" style="min-height:30px;padding:5px 12px;font-size:0.8rem;">${isZh ? "应用到正文并复检" : "Apply to editor"}</button>
          <button type="button" id="btn-ai-copy" class="ctrl-btn ctrl-btn-sm">${isZh ? "复制改稿" : "Copy rewrite"}</button>
          <button type="button" id="btn-ai-close-panel" class="ctrl-btn ctrl-btn-sm">${isZh ? "收起" : "Dismiss"}</button>
        </div>`;

      document.getElementById("btn-ai-apply")?.addEventListener("click", () => {
        if (reqId !== aiReqSeq) return;
        preRewriteDraft = sourceSnapshot;
        currentText = revised;
        const editEl = document.getElementById("edit-textarea");
        if (editEl) editEl.value = revised;
        focusedFindingIdx = -1;
        panel.hidden = true;
        setViewMode("proof");
        renderWorkbench();
        const appliedEl = document.getElementById("wb-applied-banner");
        if (appliedEl) {
          const safeBefore = escapeHtmlSafe(String(Number(localBeforeCount)));
          const safeAfter = escapeHtmlSafe(String(Number(localAfterCount)));
          appliedEl.hidden = false;
          appliedEl.innerHTML = isZh
            ? `<span>已将改稿应用到正文并完成本地离线复检（${safeBefore} → ${safeAfter} 处命中）。</span><button type="button" id="btn-banner-restore" class="ctrl-btn ctrl-btn-sm">还原改前原稿</button>`
            : `<span>Applied rewrite and re-checked locally (${safeBefore} → ${safeAfter} findings).</span><button type="button" id="btn-banner-restore" class="ctrl-btn ctrl-btn-sm">Restore pre-rewrite draft</button>`;
          document.getElementById("btn-banner-restore")?.addEventListener("click", () => {
            if (typeof preRewriteDraft === "string") {
              currentText = preRewriteDraft;
              const ta = document.getElementById("edit-textarea");
              if (ta) ta.value = preRewriteDraft;
              preRewriteDraft = null;
              appliedEl.hidden = true;
              focusedFindingIdx = -1;
              setViewMode("proof");
              renderWorkbench();
            }
          });
        }
      });
      document.getElementById("btn-ai-copy")?.addEventListener("click", async (ev) => {
        await copyTextWithFeedback(ev.currentTarget, revised);
      });
      document.getElementById("btn-ai-close-panel")?.addEventListener("click", () => {
        panel.hidden = true;
      });
    }
  } catch (err) {
    renderAiError(
      "network_error",
      isZh ? `无法连接云端端点：${err.message || "请稍后重试"}` : `Could not reach cloud endpoint: ${err.message || "retry later"}`
    );
  } finally {
    cloudBusy = false;
    const revBtn = document.getElementById("btn-ai-review");
    const desBtn = document.getElementById("btn-ai-deslop");
    if (revBtn) revBtn.disabled = false;
    if (desBtn) desBtn.disabled = false;
  }
}

async function handleFreeTokenSubmit(e) {
  e.preventDefault();
  const isZh = currentLang === "zh";
  const emailInput = document.getElementById("token-email-input");
  const submitBtn = document.getElementById("token-submit-btn");
  const outBox = document.getElementById("token-output-box");
  const email = String(emailInput?.value || "").trim();
  if (!email || !outBox) return;

  if (submitBtn) submitBtn.disabled = true;
  outBox.hidden = false;
  outBox.textContent = isZh ? "正在生成专属密钥…" : "Generating API key...";

  try {
    const resp = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</p>`;
      return;
    }

    saveCloudAccount({
      token: data.apiKey,
      email: data.account.email,
      plan: data.account.plan,
      remaining: data.account.totalRemaining,
      monthlyQuota: data.account.monthlyQuota,
    });
    renderCloudAccountState();

    const mcpJsonStr = JSON.stringify(data.mcpConfig, null, 2);
    outBox.innerHTML = `
      <div><strong>${isZh ? "已自动绑定到本页工作台（每月 30 额度）" : "Saved to this browser (30 monthly credits active)"}</strong></div>
      <div style="margin-top:6px;">${isZh ? "专属密钥：" : "API key:"} <code>${escapeHtmlSafe(data.apiKey)}</code></div>
      <div style="margin-top:6px;font-size:0.78rem;color:var(--ink-2);">${isZh ? "远程 HTTP MCP 配置（粘进 Claude Code / Cursor / Codex）：" : "Remote HTTP MCP config (paste into Claude Code / Cursor / Codex):"}</div>
      <pre class="cloud-output-pre" id="generated-mcp-config">${escapeHtmlSafe(mcpJsonStr)}</pre>
      <div class="quick-actions" style="margin-top:8px;">
        <a href="#workbench" class="btn-primary" style="min-height:30px;padding:5px 12px;font-size:0.8rem;">${isZh ? "返回工作台立即试用 ↑" : "Back to workbench ↑"}</a>
        <button type="button" id="btn-copy-mcp-cfg" class="ctrl-btn ctrl-btn-sm">${isZh ? "复制远程 MCP 配置" : "Copy Remote MCP JSON"}</button>
      </div>`;
    document.getElementById("btn-copy-mcp-cfg")?.addEventListener("click", async (ev) => {
      await copyTextWithFeedback(ev.currentTarget, mcpJsonStr);
    });
  } catch (err) {
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleWaitlistSubmit(e) {
  e.preventDefault();
  const isZh = currentLang === "zh";
  const plan = document.getElementById("wl-plan-select")?.value || "pro";
  const email = String(document.getElementById("wl-email-input")?.value || "").trim();
  const note = String(document.getElementById("wl-note-input")?.value || "").trim();
  const submitBtn = document.getElementById("wl-submit-btn");
  const outBox = document.getElementById("wl-output-box");
  if (!email || !outBox) return;

  if (submitBtn) submitBtn.disabled = true;
  outBox.hidden = false;
  outBox.textContent = isZh ? "正在提交…" : "Submitting...";

  try {
    const resp = await fetch("/api/v1/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, plan, note }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</p>`;
      return;
    }
    outBox.textContent = isZh
      ? `已登记 ${data.email}（${data.plan} 方案），自助支付开放后会第一时间发邮件通知。`
      : `Saved ${data.email} for the ${data.plan} plan. We will email you as soon as self-serve billing opens.`;
    const wlEmailEl = document.getElementById("wl-email-input");
    const wlNoteEl = document.getElementById("wl-note-input");
    if (wlEmailEl) wlEmailEl.value = "";
    if (wlNoteEl) wlNoteEl.value = "";
  } catch (err) {
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeToggleLabel();
}

// ---------- Wire Events ----------

function init() {
  const savedTheme = safeGetStorage("dislop-theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = currentTheme === "dark" ? "light" : "dark";
    safeSetStorage("dislop-theme", next);
    applyTheme(next);
  });

  document.getElementById("lang-toggle").addEventListener("click", () => {
    currentLang = currentLang === "zh" ? "en" : "zh";
    applyI18n(true);
  });

  // Hero 3-state Proof Card tabs
  document.querySelectorAll("[data-hero-state]").forEach((btn) => {
    btn.addEventListener("click", () => {
      heroProofState = btn.getAttribute("data-hero-state") || "bad";
      renderHeroProof();
    });
  });

  document.getElementById("hero-open-wb")?.addEventListener("click", () => {
    const data = HERO_PROOF_BY_LANG[currentLang] || HERO_PROOF_BY_LANG.zh;
    uploadSeq += 1;
    lastUploadedFile = null;
    uploadedOriginalText = null;
    binaryAuditResult = null;
    customRuleTitle = "hero-proof";
    activeSpecimen = {
      id: "hero-proof",
      pack: data.pack,
      filename: data.filename,
      modality: data.modality,
      bad: data.bad,
      good: data.good,
      trap: data.trap,
    };
    currentPackId = data.pack;
    currentFilename = data.filename;
    currentModality = data.modality;
    baselineText = data.bad;
    currentText = data[heroProofState] || data.bad;
    focusedFindingIdx = -1;
    document.getElementById("pack-select").value = data.pack;
    setViewMode("proof");
    updateSpecimenRailSelection();
    renderWorkbench();
  });

  document.getElementById("pack-select").addEventListener("change", async (e) => {
    currentPackId = e.target.value;
    if (lastUploadedFile && binaryAuditResult) {
      await handleUploadedFile(lastUploadedFile, false);
    } else {
      renderWorkbench();
    }
  });

  document.getElementById("mode-proof-btn").addEventListener("click", () => {
    if (customRuleTitle === "user-draft" && !baselineText && currentText.trim()) {
      baselineText = currentText;
      if (activeSpecimen && activeSpecimen.id === "user-draft") {
        activeSpecimen.bad = currentText;
      }
    }
    setViewMode("proof");
    renderWorkbench();
  });

  document.getElementById("mode-edit-btn").addEventListener("click", () => {
    if (binaryAuditResult) return;
    setViewMode("edit");
    renderWorkbench();
    document.getElementById("edit-textarea").focus();
  });

  document.getElementById("edit-textarea").addEventListener("paste", () => {
    if (binaryAuditResult) return;
    if (customRuleTitle === "user-draft" && !baselineText) {
      setTimeout(() => {
        const val = document.getElementById("edit-textarea")?.value || "";
        if (val.trim() && !baselineText) {
          baselineText = val;
          if (activeSpecimen && activeSpecimen.id === "user-draft") {
            activeSpecimen.bad = val;
          }
          renderWorkbench();
        }
      }, 0);
    }
  });

  document.getElementById("edit-textarea").addEventListener("input", (e) => {
    if (binaryAuditResult) return;
    clearWorkbenchTransientPanels();
    currentText = e.target.value;
    renderWorkbench();
  });

  document.getElementById("edit-textarea").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (customRuleTitle === "user-draft" && !baselineText && currentText.trim()) {
        baselineText = currentText;
        if (activeSpecimen && activeSpecimen.id === "user-draft") {
          activeSpecimen.bad = currentText;
        }
      }
      setViewMode("proof");
      renderWorkbench();
    }
  });

  document.getElementById("btn-paste-own")?.addEventListener("click", () => {
    uploadSeq += 1;
    binaryAuditResult = null;
    lastUploadedFile = null;
    uploadedOriginalText = null;
    customRuleTitle = "user-draft";
    currentModality = currentPackId === "deck-and-ui" ? "html" : "markdown";
    currentFilename = currentModality === "html" ? "my-draft.html" : "my-draft.md";
    activeSpecimen = {
      id: "user-draft",
      pack: currentPackId,
      filename: currentFilename,
      modality: currentModality,
      bad: "",
      trap: null,
      good: null,
    };
    baselineText = "";
    currentText = "";
    focusedFindingIdx = -1;
    const appliedEl = document.getElementById("wb-applied-banner");
    if (appliedEl) appliedEl.hidden = true;
    const aiPanel = document.getElementById("ai-result-panel");
    if (aiPanel) aiPanel.hidden = true;
    setViewMode("edit");
    updateSpecimenRailSelection();
    renderWorkbench();
    const ta = document.getElementById("edit-textarea");
    if (ta) ta.focus();
  });

  document.getElementById("btn-apply-good").addEventListener("click", () => {
    if (lastUploadedFile || binaryAuditResult || typeof activeSpecimen?.good !== "string") return;
    currentText = activeSpecimen.good;
    focusedFindingIdx = -1;
    renderWorkbench();
  });

  document.getElementById("btn-apply-trap").addEventListener("click", () => {
    if (lastUploadedFile || binaryAuditResult || typeof activeSpecimen?.trap !== "string") return;
    currentText = activeSpecimen.trap;
    focusedFindingIdx = -1;
    renderWorkbench();
  });

  document.getElementById("btn-reset").addEventListener("click", async () => {
    const appliedEl = document.getElementById("wb-applied-banner");
    if (appliedEl) appliedEl.hidden = true;
    const aiPanel = document.getElementById("ai-result-panel");
    if (aiPanel) aiPanel.hidden = true;
    if (lastUploadedFile) {
      if (uploadedOriginalText !== null) {
        binaryAuditResult = null;
        baselineText = uploadedOriginalText;
        currentText = uploadedOriginalText;
        focusedFindingIdx = -1;
        renderWorkbench();
      } else {
        await handleUploadedFile(lastUploadedFile, false);
      }
      return;
    }
    uploadSeq += 1;
    binaryAuditResult = null;
    currentFilename = activeSpecimen.filename;
    currentModality = activeSpecimen.modality;
    currentPackId = activeSpecimen.pack;
    document.getElementById("pack-select").value = currentPackId;
    baselineText = activeSpecimen.bad;
    currentText = activeSpecimen.bad;
    focusedFindingIdx = -1;
    updateSpecimenRailSelection();
    renderWorkbench();
  });

  async function handleUploadedFile(file, autoSelectPack = true) {
    const mod = detectModality(file.name);
    if (!mod) {
      const appliedEl = document.getElementById("wb-applied-banner");
      if (appliedEl) {
        appliedEl.hidden = false;
        appliedEl.textContent =
          currentLang === "zh"
            ? `暂不支持打开 ${file.name}。请选择 .md、.txt、.html、.css、.jsx、.tsx、.svg、.docx 或 .pptx 文件。`
            : `Unsupported file type: ${file.name}. Open a .md, .txt, .html, .css, .jsx, .tsx, .svg, .docx, or .pptx file.`;
      }
      return;
    }
    const token = ++uploadSeq;
    const nextPackId =
      autoSelectPack && (mod === "pptx" || mod === "html" || mod === "css" || mod === "jsx" || mod === "svg")
        ? "deck-and-ui"
        : currentPackId;
    const pack = resolveEffectivePack(nextPackId, PACKS_BY_ID);

    let nextBinaryResult = null;
    let nextOriginalText = null;
    let nextBaselineText = "";
    let nextCurrentText = "";

    try {
      if (mod === "docx" || mod === "pptx") {
        const buf = await file.arrayBuffer();
        const entries = await readBrowserZipXmlEntries(buf);
        const hasExpectedXml =
          mod === "docx"
            ? typeof entries["word/document.xml"] === "string" && entries["word/document.xml"].includes("<")
            : (typeof entries["ppt/presentation.xml"] === "string" && entries["ppt/presentation.xml"].includes("<")) ||
              Object.keys(entries).some((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k) && entries[k].includes("<"));
        if (!hasExpectedXml) {
          throw new Error(
            mod === "docx"
              ? "Missing or invalid word/document.xml inside archive"
              : "Missing or invalid ppt/presentation.xml or slide XML inside archive"
          );
        }
        const res = auditOoxmlEntries(entries, { filename: file.name, modality: mod, pack });
        nextBinaryResult = res;
        nextCurrentText =
          currentLang === "zh"
            ? `[已在标签页内存检查本地 ${mod.toUpperCase()}：${file.name}]\n检出：${res.findings.length} 处`
            : `[Inspected local ${mod.toUpperCase()} in browser memory: ${file.name}]\nFindings: ${res.findings.length}`;
      } else {
        const buf = await file.arrayBuffer();
        let text;
        try {
          text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new Uint8Array(buf));
        } catch {
          throw new Error("File is not valid UTF-8 text");
        }
        nextOriginalText = text;
        nextBaselineText = text;
        nextCurrentText = text;
      }
    } catch (err) {
      nextBinaryResult = {
        findings: [],
        skipped: [{ file: file.name, reason: `Uninspectable ${mod.toUpperCase()}: ${err.message}` }],
      };
      nextCurrentText = `Could not inspect ${file.name}: ${err.message}`;
    }

    if (token !== uploadSeq) return;

    lastUploadedFile = file;
    customRuleTitle = null;
    currentFilename = file.name;
    currentModality = mod;
    currentPackId = nextPackId;
    document.getElementById("pack-select").value = nextPackId;
    binaryAuditResult = nextBinaryResult;
    uploadedOriginalText = nextOriginalText;
    baselineText = nextBaselineText;
    currentText = nextCurrentText;
    focusedFindingIdx = -1;
    if (binaryAuditResult) {
      setViewMode("proof");
    }
    updateSpecimenRailSelection();
    renderWorkbench();
  }

  document.getElementById("file-picker").addEventListener("change", async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const appliedEl = document.getElementById("wb-applied-banner");
    if (appliedEl) appliedEl.hidden = true;
    await handleUploadedFile(file, true);
  });

  // Drag-and-drop local files directly onto the workbench sheet (100% offline in RAM)
  const dropZone = document.getElementById("galley-dropzone");
  if (dropZone) {
    let dragDepth = 0;
    dropZone.addEventListener("dragenter", (ev) => {
      ev.preventDefault();
      dragDepth += 1;
      dropZone.classList.add("is-drop-active");
    });
    dropZone.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      dropZone.classList.add("is-drop-active");
    });
    dropZone.addEventListener("dragleave", (ev) => {
      ev.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dropZone.classList.remove("is-drop-active");
    });
    dropZone.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      dragDepth = 0;
      dropZone.classList.remove("is-drop-active");
      const file = ev.dataTransfer?.files?.[0];
      if (!file) return;
      clearWorkbenchTransientPanels();
      if (!detectModality(file.name)) {
        const appliedEl = document.getElementById("wb-applied-banner");
        if (appliedEl) {
          appliedEl.hidden = false;
          appliedEl.textContent =
            currentLang === "zh"
              ? `暂不支持拖入 ${file.name}。请拖入 .md、.txt、.html、.css、.jsx、.tsx、.svg、.docx 或 .pptx 文件。`
              : `Unsupported file type: ${file.name}. Drop a .md, .txt, .html, .css, .jsx, .tsx, .svg, .docx, or .pptx file.`;
        }
        return;
      }
      await handleUploadedFile(file, true);
    });
  }

  document.querySelectorAll("[data-pack-filter]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.classList.contains("is-active")));
    btn.addEventListener("click", () => {
      activeRuleFilter = btn.getAttribute("data-pack-filter");
      document.querySelectorAll("[data-pack-filter]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      renderRulesTable();
    });
  });

  document.getElementById("rule-search").addEventListener("input", (e) => {
    activeRuleSearch = e.target.value;
    renderRulesTable();
  });

  document.getElementById("rule-modality-filter").addEventListener("change", (e) => {
    activeModalityFilter = e.target.value;
    renderRulesTable();
  });

  document.getElementById("rule-severity-filter").addEventListener("change", (e) => {
    activeSeverityFilter = e.target.value;
    renderRulesTable();
  });

  const snippetTabs = Array.from(document.querySelectorAll("[data-snippet]"));
  snippetTabs.forEach((btn, idx) => {
    btn.addEventListener("click", () => selectSnippetTab(btn, false));
    btn.addEventListener("keydown", (e) => {
      let nextIdx = -1;
      if (e.key === "ArrowRight") nextIdx = (idx + 1) % snippetTabs.length;
      else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + snippetTabs.length) % snippetTabs.length;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = snippetTabs.length - 1;
      if (nextIdx !== -1) {
        e.preventDefault();
        selectSnippetTab(snippetTabs[nextIdx], true);
      }
    });
  });

  document.querySelectorAll("[data-copy-target]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.getAttribute("data-copy-target");
      const text = document.getElementById(targetId)?.textContent || "";
      await copyTextWithFeedback(btn, text);
    });
  });

  document.getElementById("copy-snippet-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const text = document.getElementById("snippet-code")?.textContent || "";
    await copyTextWithFeedback(btn, text);
  });

  document.getElementById("copy-awesome-share-btn")?.addEventListener("click", async (e) => {
    const blurb = (SHARE_BLURBS_BY_LANG[currentLang] || SHARE_BLURBS_BY_LANG.zh).awesome;
    await copyTextWithFeedback(e.currentTarget, blurb);
  });

  document.getElementById("copy-site-share-btn")?.addEventListener("click", async (e) => {
    const blurb = (SHARE_BLURBS_BY_LANG[currentLang] || SHARE_BLURBS_BY_LANG.zh).site;
    await copyTextWithFeedback(e.currentTarget, blurb);
  });

  document.getElementById("copy-cases-link-btn")?.addEventListener("click", async (e) => {
    const blurb = (SHARE_BLURBS_BY_LANG[currentLang] || SHARE_BLURBS_BY_LANG.zh).cases;
    await copyTextWithFeedback(e.currentTarget, blurb);
  });

  document.querySelectorAll('a[href="#rules"]').forEach((link) => {
    link.addEventListener("click", () => {
      const fold = document.getElementById("rules-fold");
      if (fold) fold.open = true;
    });
  });

  document.getElementById("btn-ai-review")?.addEventListener("click", () => runCloudAction("review"));
  document.getElementById("btn-ai-deslop")?.addEventListener("click", () => runCloudAction("deslop"));
  document.getElementById("btn-voice-offline")?.addEventListener("click", handleVoiceOfflineClick);
  document.getElementById("btn-voice-extract")?.addEventListener("click", handleVoiceExtractClick);
  document.getElementById("btn-voice-clear")?.addEventListener("click", () => {
    saveVoiceProfile(null);
    renderSavedVoiceState();
  });
  document.getElementById("free-token-form")?.addEventListener("submit", handleFreeTokenSubmit);
  document.getElementById("waitlist-form")?.addEventListener("submit", handleWaitlistSubmit);

  window.addEventListener("hashchange", handleRuleHash);

  applyI18n(false);
  handleRuleHash();
}

init();
