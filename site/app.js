import {
  analyzeTextProfile,
  auditImageDocument,
  auditOoxmlEntries,
  auditPdfDocument,
  auditText,
  defaultPackForModality,
  detectModality,
  extractVoiceProfileOffline,
  getScenarioStrategy,
  resolveEffectivePack,
  resolveRegister,
} from "./engine/core.mjs";
import { auditPatterns } from "./engine/pattern-engine.mjs";
import { PATTERN_BANKS } from "./engine/patterns-data.mjs";
import { analyzeDocumentWithPocketModels, predictPackWithPocketRouter, setPocketModelBundle } from "./engine/pocket-model.mjs";
import { parseBrowserImageBuffer, parseBrowserPdfBuffer, readBrowserZipXmlEntries } from "./engine/binary-browser.mjs";
import { PACKS_BY_ID, RULE_UI_META } from "./engine/packs-data.mjs";

const SITE_ROOT_PATH = (() => {
  try {
    return new URL("./", import.meta.url).pathname;
  } catch {
    return "/";
  }
})();

function siteAssetUrl(rel) {
  return `${SITE_ROOT_PATH}${String(rel || "").replace(/^\.?\//, "")}`;
}

let pocketModelReady = false;
let pocketModelPromise = null;
function ensurePocketModelLoaded() {
  if (pocketModelReady) return Promise.resolve(true);
  if (!pocketModelPromise) {
    pocketModelPromise = import("./engine/pocket-model-data.mjs")
      .then((mod) => {
        if (mod?.POCKET_MODEL_BUNDLE) {
          setPocketModelBundle(mod.POCKET_MODEL_BUNDLE);
          pocketModelReady = true;
        }
        return pocketModelReady;
      })
      .catch(() => false);
  }
  return pocketModelPromise;
}

// ---------- Native Bilingual Copy (Default ZH, Native EN — Zero Translationese) ----------

const I18N = {
  zh: {
    "page.title": "dislop — 去 AI 味才是真正的生产力！",
    "nav.skip": "跳至正文",
    "nav.signIn": "登录",
    "nav.cases": "案例",
    "nav.workbench": "工作台",
    "nav.surfaces": "接入",
    "nav.guides": "指南",
    "nav.awesome": "工具清单",
    "nav.rules": "规则",
    "nav.github": "GitHub ★",
    "nav.brandMeta": "AI 味检查",
    "theme.dark": "深色",
    "theme.light": "浅色",
    "btn.copy": "复制",
    "btn.copied": "已复制",

    "lead.strike": "好的，以下是为您润色后的版本。",
    "lead.title": "去 AI 味才是真正的生产力！",
    "lead.sub":
      "专用的 AI 味检查工具。在文档、网页和 Word/PPT 发出前，标出开头寒暄、空话套话、反转口号和默认紫粉模板。一行命令接进主流 Agent 与编辑器，默认纯本地运行。",
    "lead.promptLabel": "发给 Agent · 自动评估与安装",
    "lead.promptText":
      "请阅读 https://dislop.com/llms.txt，结合我当前的环境与项目内容评估最合适的 dislop 接入方式（Skill、本地 CLI 或远程 MCP），完成安装配置并拿现有文件试跑一次。",
    "lead.copyPromptBtn": "复制发给 Agent",
    "lead.cta": "在工作台试一段 ↓",
    "lead.installBtn": "装进 Agent 或编辑器",

    "hp.tabBad": "改前",
    "hp.tabTrap": "换了种 AI 味",
    "hp.tabGood": "改后",
    "hp.meta": "用同一个检查引擎实时跑的",
    "hp.openWb": "在下面工作台打开 ↓",

    "cases.title": "删掉热词之后，哪些写法读着还像 AI",
    "cases.desc":
      "删掉空话和自嗨黑话之后，模型常换成“不是 A，而是 B”的反转口号，或者写出检查报 0 处问题、读起来仍像推销稿的句子。每组都能在工作台里直接试。",
    "cases.readAll": "看全部对照案例（.md）→",

    "demos.title": "命令行、网页、PPT 与 PR 门禁实录",
    "demos.desc": "用同一套规则离线录制，点击画面可定格查看细节。",
    "demos.tab2": "命令行门禁",
    "demos.tab4": "网页去模板",
    "demos.tab5": "Word / PPT",
    "demos.tab6": "Agent + CI",
    "demos.c2Title": "命令行门禁：确定性硬伤拦 CI，建议不阻塞",
    "demos.c2Desc": "本地跑 dislop check --no-llm，硬伤（Defect）直接返回退出码 1 卡住 CI，散文建议（Suggestion）只提示不误杀，顺带输出句长起伏统计。",
    "demos.c4Title": "网页与组件：清掉默认紫粉模板和死按钮",
    "demos.c4Desc": "直接扫 HTML/CSS/JSX 里的渐变标题、装饰徽章、胶囊堆叠和 href=\"#\" 假按钮，退回干净可用的界面。",
    "demos.c5Title": "Word / PPT 检查：揪出裸星号、字墙和过程标题",
    "demos.c5Desc": "直接解包 .pptx 检查未渲染的 **加粗** 符号、单页字墙、68% 自动缩字与空泛标题，改回结论先行的干净页。",
    "demos.c6Title": "编码 Agent + CI 闭环：写前读 Skill，提交前过门禁",
    "demos.c6Desc": "Agent 先读取纯文档 SKILL.md，再用 --changed origin/main 拦下 PR 寒暄与复读 diff，修完复检确认数字零丢失。",
    "demos.pause": "暂停画面",
    "demos.play": "继续播放",

    "wb.heading": "工作台",
    "wb.subhint": "粘贴文字，或把文档 / 网页 / PPT / PDF / 图片拖进稿纸",
    "wb.packLabel": "场景包：",
    "pack.auto": "自动识别",
    "pack.brief": "工作文档",
    "pack.eng": "研发文档与复盘",
    "pack.reg": "对外合规",
    "pack.exec": "管理汇报",
    "pack.essay": "随笔长文",
    "pack.ui": "PPT 和网页",
    "wb.registerLabel": "语体：",
    "reg.auto": "自动",
    "reg.technical": "工程技术",
    "reg.argumentative": "商业论证",
    "reg.official": "公文合规",
    "reg.narrative": "随笔叙事",
    "reg.casual": "日常口语",
    "reg.marketing": "宣传推广",
    "wb.openFile": "打开本地文件",
    "wb.specimensTitle": "示例",
    "wb.privacyNote": "本地检查在当前标签页完成。点下方云端按钮（审校、改写、提炼文风）并登录后，才会经我们的服务端发给付费版 Google Gemini 接口；Google 不拿它训练，我们不存草稿。",
    "wb.jumpNotes": "看批注详情 ↓",
    "wb.offlinePill": "当前标签页离线运行 · 0 上传",
    "wb.editHint": "直接粘贴或修改原文，右侧批注会实时更新；按 ⌘/Ctrl+Enter 或切回「标出问题」查看划线。",
    "wb.copyDraft": "复制正文",
    "wb.shareLink": "生成分享链接",
    "wb.copyAgentBrief": "复制给 Agent 改稿",
    "ai.reviewBtn": "云端审校（1 额度）",
    "ai.deslopBtn": "云端改写（2 额度）",
    "ai.trackChanges": "保留 Word 修订标记",
    "ai.anonHint": "本地检查免登录 · 云端审校需免费登录（每月 30 额度，同账号可用于远程 MCP）",
    "ai.claimLink": "登录 / 绑定密钥",
    "ai.lowCreditLink": "额度偏低 · 预约扩容 ↓",
    "voice.drawerTitle": "可选：提取个人文风（支持本地统计，或云端提炼）",
    "voice.drawerDesc": "贴入 1–3 段你自己写过的干净文字（用空行隔开）。点「本地统计文风」在当前标签页完成；保存的文风会在点「云端改写」时自动套用。",
    "voice.offlineBtn": "本地统计文风（0 额度 · 不联网）",
    "voice.extractBtn": "云端提炼文风（2 额度）",
    "voice.clearBtn": "清除已保存文风",
    "wb.modeProof": "标出问题",
    "wb.modeEdit": "编辑原文",
    "wb.pasteOwn": "贴我的稿子",
    "wb.applyClean": "看改好的",
    "wb.tryTrap": "看换了种 AI 味的",
    "wb.reset": "还原",
    "wb.voiceTitle": "5 轴节奏与细节体检",
    "wb.nudgeText": "想在自己电脑上离线查，就装开源 Skill 或 CLI。想让 Agent 用云端审校，登录后每月有 30 免费额度。",
    "wb.nudgeCloud": "验证码登录 · 30 免费额度",
    "wb.nudgeInstall": "装开源 Skill / CLI ↓",
    "wb.nudgeCopy": "复制发给 Agent",
    "wb.nudgeStar": "GitHub ★",
    "legend.error": "红实线：硬伤",
    "legend.warn": "蓝虚线：提醒（套话与模板味）",

    "surf.title": "接入方式：纯文档 Skill、本地 CLI 与云端 MCP",
    "surf.desc":
      "按你手上的工具选一种，每种都有能直接复制的配置。",
    "surf.readTools": "完整接入文档（.md）→",
    "surf.w1Title": "纯文档 Agent Skill",
    "surf.w1Desc": "按文体整理的写作与界面避坑卡，不带脚本。装进 Claude Code、Codex、Cursor 或 Antigravity，Agent 动笔前读取，写完再调用本地 CLI 自检。",
    "surf.w2Title": "开源本地 CLI 与插件",
    "surf.w2Desc": "Node.js 20+ 零外部依赖微内核，内置 11 套模块化规则包，支持 .dislop.json 分目录覆盖与 .dislop/rules.json 自定义规则。断网也能查文档、Word、PPT、PDF 和 Git 改动，还可选 Ollama 本地小模型或自有密钥。",
    "surf.w3Title": "官方云端 MCP 与网页工作台",
    "surf.w3Desc": "在 WorkBuddy、千问、Claude Cowork 或编辑器里直连，登录后每月 30 免费额度，按文体做多模型审校并返回改法。",
    "surf.w4Title": "一句话让 Agent 自己接管",
    "surf.w4Desc": "把 dislop.com/llms.txt 发给你的 Agent，它会自己判断装 Skill、CLI 还是远程 MCP，再拿现有文件试跑一次。",
    "snip.prompt": "发给 Agent",
    "snip.cloud": "云端 MCP",
    "snip.plugin": "插件",
    "snip.localMcp": "官方 MCP",
    "snip.cli": "命令行",

    "price.title": "本地工具永久免费，云端审校按额度计费",
    "price.desc":
      "Skill、CLI 和规则库按 Apache-2.0 开源，离线运行不上传。云端审校、改写和远程 MCP 登录后使用，免费版每月 30 额度，付费版模型接口不拿你的稿子训练。",
    "price.benchLink": "看 5 模型实测对比 →",
    "price.t1Name": "开源本地（Skill + CLI + SDK）",
    "price.t1Price": "$0 · 永久免费",
    "price.t1Sub": "适合稿子不能上传的场景，比如内网和私有仓库。代码和规则都开源。",
    "price.t1F1": "纯文档 Agent Skill（不含脚本）、Node.js 零依赖 CLI 与本地 stdio MCP（Apache-2.0）",
    "price.t1F2": "全量内置 11 套模块化规则包，离线查 Markdown、HTML/CSS/JSX/SVG、图片、Word、PPT 与 PDF",
    "price.t1F3": "双轨 CI 门禁（Defect vs Suggestion）、.dislop.json 分目录覆盖、事实核验（verify）与本地 Ollama / 个人文风",
    "price.t1F4": "零联网零上传；开发者也可配自有密钥（BYOK）或通过 dislop/sdk 自定义插件包",
    "price.t1Cta": "安装 Skill / CLI ↑",
    "price.t2Name": "云端免费版（远程 MCP）",
    "price.t2Price": "$0 · 30 额度 / 月",
    "price.t2Sub": "邮箱验证码登录，免密码免绑卡，立即在网页工作台或远程 MCP 使用。",
    "price.t2F1": "直连 https://dislop.com/mcp，支持 OAuth 免填密钥或生成 API 密钥（单次最长 12,000 字）",
    "price.t2F2": "云增强审校（1 额度）：查出推销腔、官话与套话，给出具体改法",
    "price.t2F3": "云增强改写（2 额度）：自动改写后复检，核对原稿数字与限定词",
    "price.t2F4": "Word/PPT 原排版去味与个人文风（2–3 额度）：保留样式与修订，云端文风同步给远程 MCP",
    "price.t2Cta": "下方 10 秒验证码登录 ↓",
    "price.t3Name": "Pro · 按量包 · Team",
    "price.t3Price": "$12/月 · $10 按量",
    "price.t3Sub": "经常写选 Pro，每额度比按量省 36%；偶尔用买按量包，额度不过期。",
    "price.t3F1": "Pro（$12/月 或 $108/年）：1,500 额度/月（单次最长 50,000 字）+ 20 份云端文风",
    "price.t3F2": "按量额度包（$10 / 800 额度）：一次买断不过期，解锁单次 50,000 字上限",
    "price.t3F3": "Team（$29/席位/月）：每席位 5,000 额度 + 50 份团队共享文风与 PR 审核",
    "price.t3F4": "统一调用 Google Gemini 付费版接口，不存草稿，不拿你的稿子训练",
    "price.t3Cta": "预约开通通知 ↓",

    "cloud.tokenTitle": "登录领取每月 30 免费额度 · 管理远程 MCP",
    "cloud.tokenDesc": "输入邮箱接收 6 位验证码或一键登录链接，免密码免绑卡。登录后可在工作台审校与改写 Word/PPT，并管理订阅额度、MCP 密钥、已连应用与云端文风（不存草稿，详见底部隐私说明）。",
    "cloud.tokenBtn": "发验证码",
    "cloud.otpVerifyBtn": "验证并登录",
    "cloud.otpChangeBtn": "换个邮箱",
    "cloud.githubBtn": "用 GitHub 账号登录",
    "cloud.googleBtn": "用 Google 账号登录",
    "cloud.legacyKeySummary": "已有 dslp_... 密钥？点此直接绑定",
    "cloud.legacyKeyBtn": "验证并绑定",
    "cloud.wlTitle": "预约 Pro / 按量包 / Team",
    "cloud.wlDesc": "自助支付还没上线。留下邮箱和想用的方案，上线后通知你。",
    "cloud.planPro": "Pro（$12/月 · 1,500 额度）",
    "cloud.planCredits": "按量包（$10 / 800 额度 · 永不过期）",
    "cloud.planTeam": "Team（$29/席位 · 团队文风）",
    "cloud.wlBtn": "提交预约",
    "ep.foldTitle": "给 Agent / 开发者看：静态 Markdown 与 JSON 接口",
    "ep.foldSub": "/llms.txt · /catalog.json · 任务卡 · 规则卡（纯静态，展开查看）",
    "ep.heading": "给 Agent 读的静态文档（纯 Markdown / JSON）",
    "ep.llms": "Agent 入口索引",
    "ep.catalog": "全部文档的 JSON 目录",
    "ep.mcpCard": "MCP 自动发现描述（10 个工具）",
    "ep.skillsIdx": "Agent Skills 索引与 SHA-256",
    "ep.taskBiz": "任务卡：工作文档与技术方案",
    "ep.taskWeb": "任务卡：网页与 PPT 模板味",
    "ep.taskEdit": "任务卡：随笔与长文",
    "ep.taskGate": "任务卡：发稿前 AI 残留硬伤检查",
    "ep.skill": "跨宿主 Agent Skill",
    "ep.awesome": "90 条工具清单 JSON",
    "ep.brief": "产品定义（定位 / 用户 / 卖点）",
    "ep.method": "文案与设计基准",
    "ep.full": "单文件拉取核心规则摘要",

    "awesome.title": "去 AI 味工具清单：核验过的工具、规范与论文",
    "awesome.desc":
      "除了 dislop 自己，我们也维护了一份按场景整理的去 AI 味资源索引，包含 Vale、Impeccable 等常用工具、中英文写作规范、代码 PR 治理规则和实证论文。全部链接在 2026-11-21 逐条核过一遍。",
    "awesome.openFull": "打开完整清单 →",
    "awesome.ecoTitle": "按用途筛选，也可以直接给 Agent 读",
    "awesome.ecoDesc": "按写作、网页、代码、研究分类筛选，或者只看能本地自动检查的工具。AI 检测器和规避工具单独放在最下面做对照。",
    "awesome.browseBtn": "打开在线筛选 →",
    "awesome.ghBtn": "GitHub 中文版",
    "awesome.shareBtn": "复制清单推荐语",
    "awesome.posTitle": "非模板排版与字体参考",
    "awesome.posDesc": "印刷、字体厂和独立出版站点，做网页或排版前可以拿来对照。",
    "awesome.posAll": "看全部参考（.md）→",
    "stat.entries": "条资料",
    "stat.sections": "个分类",
    "stat.det": "个可自动检查",
    "stat.zh": "条中文 / 多语种",
    "guides.title": "写作、网页、PPT 与工程接入指南",
    "guides.desc": "每篇都带可复制的命令和前后对照，按手上的活挑一篇读。",
    "guides.all": "全部指南 →",
    "guides.g1Cat": "写作与改稿 · 7 分钟",
    "guides.g1Title": "中文写作怎么去 AI 味",
    "guides.g1Desc": "别只靠禁词表，用删除测试避开换汤不换药的二阶套话。",
    "guides.g2Cat": "前端与视觉 · 6 分钟",
    "guides.g2Title": "前端页面怎么去模板味",
    "guides.g2Desc": "清掉紫粉渐变、卡片套卡片和点不动的假按钮。",
    "guides.g3Cat": "办公文档与演示 · 6 分钟",
    "guides.g3Title": "PPT 和 Word 去模板味",
    "guides.g3Desc": "排查裸星号、单页字墙、自动缩字和空泛标题。",
    "guides.g4Cat": "工程接入 · 6 分钟",
    "guides.g4Title": "接进 Agent、编辑器与 CI",
    "guides.g4Desc": "Skill、本地 CLI、GitHub Actions 增量门禁和远程 MCP 的配置步骤。",
    "guides.g5Cat": "选型与基准 · 6 分钟",
    "guides.g5Title": "检查器、检测器和写作 Skill 怎么选",
    "guides.g5Desc": "三类工具各能查什么、查不了什么。",
    "guides.g6Cat": "基础识别 · 6 分钟",
    "guides.g6Title": "AI 味长什么样",
    "guides.g6Desc": "从词面套话、二阶句式到模板网页与 PPT 的四层信号。",
    "guides.g7Cat": "评测基准 · 7 分钟",
    "guides.g7Title": "4 款去 AI 味 Skill 30 样本实测",
    "guides.g7Desc": "Humanizer、stop-slop 与 Humanizer-zh 单独跑通后仍漏掉哪些硬伤。",

    "share.title": "推荐给同事或一起补案例和规则",
    "share.c1Title": "发给团队",
    "share.c1Desc": "复制一段直白的介绍，带官网、案例页和工具清单链接，贴进群聊或文档。",
    "share.copySiteBtn": "复制项目推荐语",
    "share.copyCasesBtn": "复制案例页链接",
    "share.c2Title": "在 GitHub 收藏",
    "share.c2Desc": "检查引擎、Skill、插件、命令行和工具清单都在同一个仓库。",
    "share.starCta": "GitHub 点 Star ★",
    "share.c3Title": "一起补案例、规则和工具",
    "share.c3Desc": "碰到典型的 AI 味翻车样本，或者好用的工具还没收录，开个 Issue 告诉我们。",
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
    "cov.r1Scope": "开头寒暄、未填占位符、公文黑话、“不是 A，而是 B”套句、三段分号推销句、自问自答、五连逗号句、同构句首、句长齐平空话、PR 摘要复读与浅层复盘归因。",
    "cov.r2Name": "Word 和 PPT",
    "cov.r2Scope": "贴进文档没渲染的 Markdown 星号、正文套话、PPT 单页字墙、要点超过 6 条、文字自动缩得太小、空泛标题（如“背景”“概述”）与连续 4 页同版式。",
    "cov.r4Name": "网页与组件",
    "cov.r4Scope": "点不动的空链接和占位按钮、默认紫粉渐变、满屏胶囊标签、三层套盒、把提示词口号印成装饰徽章。",
    "cov.r5Name": "Git 改动与 PR",
    "cov.r5Scope": "只查本次改过的或 --since <ref> 变动文件，拦住残留寒暄、占位符和文字/页面里的 AI 味，支持 SARIF 2.1.0。代码语法树检查还没做。",
    "cov.r6Name": "个人文风、本地小模型与 3 档路由",
    "cov.r6Scope": "CLI 与工作台支持离线个人文风（dislop voice）、可选 Ollama 本地小模型（dislop model pull）、自有密钥（--engine byok），以及登录后通过官方云端 MCP 做多模型审校。",
    "status.live": "可用",
    "status.partial": "改动检查可用，AST 未做",
    "status.partialVoice": "本地与云端均可用",
    "status.notYet": "还没上线（原型阶段）",

    "rules.title": "内置规则明细与在线筛选",
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
    "rules.filterEng": "研发文档与复盘",
    "rules.filterReg": "对外合规",
    "rules.filterEssay": "随笔长文",
    "rules.filterUi": "PPT 和网页",
    "rules.filterExec": "管理汇报",
    "rules.colId": "规则",
    "rules.colPack": "分类",
    "rules.colMod": "格式",
    "rules.colWhy": "查什么 / 怎么判断",
    "rules.colEx": "原句 → 换了种 AI 味 → 改好",

    "pos.norm-zurich": "苏黎世独立设计事务所，用严格的模数网格排版。",
    "pos.stiftung-buchkunst": "世界最美的书评选档案：看页边距、版心比例与长篇阅读怎么排得不挤。",
    "pos.fonts-in-use": "真实印刷品与网页里的字体搭配库。",
    "pos.dinamo": "瑞士独立字厂，看可变字重与大号字阶怎么撑起实用界面。",
    "pos.the-type": "中文排印评论，细聊标点挤压、混排细节与出版规范。",
    "pos.arena": "研究者自己攒的视觉线索库：旧印刷、路牌与独立小书。",

    "footer.selfAudit": "这个页面自己也跑过 dislop check site/，0 处问题。",
    "footer.agentHint": "给 Agent 读的话，从 /llms.txt 开始。",
    "footer.guides": "实用指南",
    "footer.awesome": "工具清单",
    "footer.rules": "全部规则",
    "footer.privacy": "隐私与数据边界",
    "footer.roadmap": "路线图",
    "footer.brand": "文案基准",
    "footer.design": "视觉规范",
    "footer.gResources": "资料",
    "footer.gProject": "项目",
    "footer.gElsewhere": "外部链接",
  },
  en: {
    "page.title": "dislop — Cutting AI slop is real productivity.",
    "nav.skip": "Skip to main content",
    "nav.signIn": "Sign in",
    "nav.cases": "Cases",
    "nav.workbench": "Workbench",
    "nav.surfaces": "Setup",
    "nav.guides": "Guides",
    "nav.awesome": "Directory",
    "nav.rules": "Rules",
    "nav.github": "GitHub ★",
    "nav.brandMeta": "AI slop linter",
    "theme.dark": "Dark",
    "theme.light": "Light",
    "btn.copy": "Copy",
    "btn.copied": "Copied",

    "lead.strike": "Certainly! Here is your polished draft.",
    "lead.title": "Cutting AI slop is real productivity.",
    "lead.sub":
      "A dedicated linter for AI slop. Flags leftover chat greetings, filler phrases, 'Not X, but Y' slogans, and stock template UI across docs, web pages, Word, and PowerPoint before you ship. Connects in one command and runs offline by default.",
    "lead.promptLabel": "Agent prompt · auto-setup",
    "lead.promptText":
      "Read https://dislop.com/llms.txt, evaluate which dislop setup fits my environment and project (Skill, offline CLI, or Cloud MCP), install and configure it, and run a first check on our files.",
    "lead.copyPromptBtn": "Copy for agent",
    "lead.cta": "Try it in the workbench ↓",
    "lead.installBtn": "Add to your agent or editor",

    "hp.tabBad": "Before",
    "hp.tabTrap": "Still sounds like AI",
    "hp.tabGood": "After",
    "hp.meta": "Running live on the same linter engine",
    "hp.openWb": "Open in workbench ↓",

    "cases.title": "Where cutting buzzwords still leaves AI cadence",
    "cases.desc":
      "After the buzzwords go, models often fall back on 'Not X, but Y' slogans or pitch cadence that passes basic checks with 0 issues. Each case loads straight into the workbench.",
    "cases.readAll": "All contrast cases (.md) →",

    "demos.title": "Recorded from real files, HTML, decks, and CI",
    "demos.desc": "Recorded offline from the same rule engine. Click any clip to pause on a frame.",
    "demos.tab2": "CLI gate",
    "demos.tab4": "Web UI",
    "demos.tab5": "PPTX & DOCX",
    "demos.tab6": "Agent + CI",
    "demos.c2Title": "Offline CLI gate: deterministic Defects block CI",
    "demos.c2Desc": "Runs dislop check --no-llm locally: objective Defect: error hits exit 1 to block CI, while editorial Suggestions always exit 0.",
    "demos.c4Title": "Web UI audit: strip gradients & dead controls",
    "demos.c4Desc": "Flags indigo-purple gradients, prompt-echo badges, pill walls, and dead href='#' buttons before switching to a 1px paper sheet.",
    "demos.c5Title": "PPTX & DOCX audit: catch walls & shrunk text",
    "demos.c5Desc": "Unpacks .pptx slides locally to flag raw **markdown** leaks, word walls, 68% autofit shrink, and process titles.",
    "demos.c6Title": "Coding agent + CI loop: Skill, diff gate & re-check",
    "demos.c6Desc": "Agent reads pure-Markdown SKILL.md, gates changed PR lines with exit 1, and re-checks the clean edit to confirm metrics stay intact.",
    "demos.pause": "Pause animation",
    "demos.play": "Resume animation",

    "wb.heading": "Workbench",
    "wb.subhint": "Paste text or drop a Markdown, HTML, SVG, Office, PDF, or image file",
    "wb.packLabel": "Pack:",
    "pack.auto": "Auto-detect",
    "pack.brief": "Work docs",
    "pack.eng": "Engineering",
    "pack.reg": "Regulated",
    "pack.exec": "Exec decks",
    "pack.essay": "Essays",
    "pack.ui": "Slides & UI",
    "wb.registerLabel": "Register:",
    "reg.auto": "Auto",
    "reg.technical": "Technical",
    "reg.argumentative": "Argumentative",
    "reg.official": "Official",
    "reg.narrative": "Narrative",
    "reg.casual": "Casual",
    "reg.marketing": "Marketing",
    "wb.openFile": "Open local file",
    "wb.specimensTitle": "Examples",
    "wb.privacyNote": "Local checks stay in this tab. Cloud buttons (review, rewrite, style extract) send your draft through our server to the paid Google Gemini API. Google does not train on it, and we do not store it.",
    "wb.jumpNotes": "Jump to notes ↓",
    "wb.offlinePill": "Offline in this tab · 0 uploads",
    "wb.editHint": "Paste or edit your draft here; margin notes update live. Press Cmd/Ctrl+Enter or switch back to Highlights.",
    "wb.copyDraft": "Copy text",
    "wb.shareLink": "Copy share link",
    "wb.copyAgentBrief": "Copy for Agent",
    "ai.reviewBtn": "Cloud Review (1 credit)",
    "ai.deslopBtn": "Cloud Rewrite (2 credits)",
    "ai.trackChanges": "Keep Word Track Changes",
    "ai.anonHint": "Local checks stay offline · Cloud Review needs free sign-in (30/mo, also works in Remote MCP)",
    "ai.claimLink": "Sign in / bind key",
    "ai.lowCreditLink": "Low credits · join waitlist ↓",
    "voice.drawerTitle": "Optional: extract personal style (local stats or Cloud AI)",
    "voice.drawerDesc": "Paste 1-3 clean paragraphs you wrote (separated by blank lines). 'Local style stats' runs in this tab with zero uploads; any saved profile is applied automatically by Cloud Rewrite.",
    "voice.offlineBtn": "Local style stats (0 credits · offline)",
    "voice.extractBtn": "Cloud style extract (2 credits)",
    "voice.clearBtn": "Clear saved style",
    "wb.modeProof": "Highlights",
    "wb.modeEdit": "Edit text",
    "wb.pasteOwn": "Paste my draft",
    "wb.applyClean": "Clean version",
    "wb.tryTrap": "Still sounds like AI",
    "wb.reset": "Reset",
    "wb.voiceTitle": "5-axis rhythm & detail check",
    "wb.nudgeText": "To check offline on your machine, install the Skill or CLI. For cloud review in your agent, sign in for 30 free credits a month.",
    "wb.nudgeCloud": "Sign in · 30 free credits",
    "wb.nudgeInstall": "Install open-source Skill / CLI ↓",
    "wb.nudgeCopy": "Copy for Agent",
    "wb.nudgeStar": "GitHub ★",
    "legend.error": "Red solid: hard bug",
    "legend.warn": "Blue dashed: warning (cliché / template)",

    "surf.title": "Run dislop as a Skill, local CLI, or Cloud MCP",
    "surf.desc":
      "Pick the one that matches your tools. Each comes with a copy-ready config.",
    "surf.readTools": "Full setup guide (.md) →",
    "surf.w1Title": "Markdown-only Agent Skill",
    "surf.w1Desc": "Writing and UI reference cards by genre, with no bundled scripts. Install it in Claude Code, Codex, Cursor, or Antigravity so the agent reads it before drafting and runs the local CLI afterward.",
    "surf.w2Title": "Open-source local CLI, SDK, and plugins",
    "surf.w2Desc": "Zero-dependency Node.js 20+ Micro-Kernel with 11 modular Packs built in, walk-up .dislop.json overrides, and custom .dislop/rules.json. Checks docs, Word, PowerPoint, PDF, and Git diffs offline, with optional Ollama local models or BYOK.",
    "surf.w3Title": "Official Cloud MCP & web workbench",
    "surf.w3Desc": "Connect from Claude Cowork, WorkBuddy, Qwen, or your editor. Sign in for 30 free credits a month and get multi-model review by genre with concrete edits.",
    "surf.w4Title": "Let your agent set it up",
    "surf.w4Desc": "Send dislop.com/llms.txt to your agent. It picks the Skill, CLI, or remote MCP, installs it, and runs a first check on your files.",
    "snip.prompt": "Send to Agent",
    "snip.cloud": "Cloud MCP",
    "snip.plugin": "Plugin",
    "snip.localMcp": "Official MCP",
    "snip.cli": "CLI",

    "price.title": "Local tools stay free; cloud review uses credits",
    "price.desc":
      "The Skill, CLI, and rules are Apache-2.0 and run offline. Cloud review, rewrites, and remote MCP need a sign-in: 30 free credits a month, and the paid model API does not train on your text.",
    "price.benchLink": "Read 5-model benchmark →",
    "price.t1Name": "Open Source Local (Skill + CLI + SDK)",
    "price.t1Price": "$0 · Forever free",
    "price.t1Sub": "For drafts that can't leave your machine: offline setups, private repos, and internal docs. All code and rules are open source.",
    "price.t1F1": "Pure-Markdown Agent Skill, zero-dep Node.js CLI & local stdio MCP (Apache-2.0)",
    "price.t1F2": "All 11 modular Packs bundled offline for Markdown, HTML/CSS/JSX/SVG, images, DOCX, PPTX & PDF",
    "price.t1F3": "Dual-Track CI gates (Defect vs. Suggestion), .dislop.json overrides, Fact Gate (verify), Ollama & dislop voice",
    "price.t1F4": "Zero network by default; bring your own key (BYOK) or build custom Packs via dislop/sdk",
    "price.t1Cta": "Install Skill / CLI ↑",
    "price.t2Name": "Cloud Free (Remote MCP)",
    "price.t2Price": "$0 · 30 credits / mo",
    "price.t2Sub": "Sign in with a 6-digit email code—no password or card—for the web workbench and Remote MCP.",
    "price.t2F1": "Connect https://dislop.com/mcp via zero-config OAuth or API keys (up to 12,000 chars/call)",
    "price.t2F2": "Cloud Review (1 credit): catches pitch cadence, filler, and clichés with concrete edits",
    "price.t2F3": "Cloud Rewrite (2 credits): plain rewrite that re-checks rules, numbers, and qualifiers",
    "price.t2F4": "Layout-preserving Word/PPT & voice profiles (2-3 credits): keeps formatting and syncs style to MCP",
    "price.t2Cta": "Sign in below ↓",
    "price.t3Name": "Pro · Credit Packs · Team",
    "price.t3Price": "$12/mo · $10 PAYGO",
    "price.t3Sub": "If you write often, Pro costs 36% less per credit. If you only need it now and then, credit packs never expire.",
    "price.t3F1": "Pro ($12/mo or $108/yr): 1,500 credits/mo (up to 50,000 chars/call) + 20 cloud voice cards",
    "price.t3F2": "PAYGO Pack ($10 / 800 credits): one-time purchase, never expires, unlocks 50,000 chars/call",
    "price.t3F3": "Team ($29/seat/mo): 5,000 credits/seat + 50 shared brand voice cards & PR review",
    "price.t3F4": "Paid-tier Google Gemini API only—no draft storage and never used for training",
    "price.t3Cta": "Join waitlist ↓",

    "cloud.tokenTitle": "Sign in for 30 free credits/mo & Remote MCP",
    "cloud.tokenDesc": "Sign in with a 6-digit email code or 1-click link—no password or card required. Review and rewrite text or Word/PPT files, and manage plans, MCP keys, connected apps, and voice cards (zero draft storage).",
    "cloud.tokenBtn": "Send code",
    "cloud.otpVerifyBtn": "Verify & sign in",
    "cloud.otpChangeBtn": "Change email",
    "cloud.githubBtn": "Continue with GitHub",
    "cloud.googleBtn": "Continue with Google",
    "cloud.legacyKeySummary": "Already have a dslp_... key? Bind it here",
    "cloud.legacyKeyBtn": "Verify & bind",
    "cloud.wlTitle": "Join Pro / Credit Pack / Team waitlist",
    "cloud.wlDesc": "Self-serve billing isn't live yet. Leave your email and preferred plan, and we'll notify you when it opens.",
    "cloud.planPro": "Pro ($12/mo · 1,500 credits)",
    "cloud.planCredits": "PAYGO Pack ($10 / 800 credits · never expires)",
    "cloud.planTeam": "Team ($29/seat · shared voice)",
    "cloud.wlBtn": "Join waitlist",
    "ep.foldTitle": "For Agents & Developers: Static Markdown & JSON Endpoints",
    "ep.foldSub": "/llms.txt · /catalog.json · task guides · rule cards (click to expand)",
    "ep.heading": "Plain Markdown & JSON pages for agents",
    "ep.llms": "Entry index for agents",
    "ep.catalog": "JSON index of all pages",
    "ep.mcpCard": "MCP server discovery card (10 tools)",
    "ep.skillsIdx": "Agent Skills index & SHA-256 digests",
    "ep.taskBiz": "Guide: work docs & specs",
    "ep.taskWeb": "Guide: web pages & slides",
    "ep.taskEdit": "Guide: essays & longform",
    "ep.taskGate": "Guide: pre-release AI artifact checks",
    "ep.skill": "Cross-host Agent Skill",
    "ep.awesome": "Raw JSON for 90 anti-slop tools",
    "ep.brief": "Product brief (positioning & pitch)",
    "ep.method": "Voice & design guide",
    "ep.full": "Single-file rule digest",

    "awesome.title": "Awesome Anti-Slop: checked tools, guides, and papers",
    "awesome.desc":
      "Beyond dislop itself, we maintain a verified directory of anti-slop tools, writing guides, UI rules, PR policies, and papers—including Vale and Impeccable. Every link was checked on 2026-11-21.",
    "awesome.openFull": "Open full list →",
    "awesome.ecoTitle": "Filter by use case, or feed it to an agent",
    "awesome.ecoDesc": "Filter by writing, web UI, code, or research, or show only tools with automated checks. Detectors and bypass tools are kept separate at the bottom.",
    "awesome.browseBtn": "Open the filterable list →",
    "awesome.ghBtn": "View on GitHub",
    "awesome.shareBtn": "Copy list blurb",
    "awesome.posTitle": "Typography and layout references outside AI templates",
    "awesome.posDesc": "Print, type foundry, and independent publishing sites to study before you lay out a page.",
    "awesome.posAll": "All references (.md) →",
    "stat.entries": "entries",
    "stat.sections": "topics",
    "stat.det": "automated tools",
    "stat.zh": "zh / multilingual",
    "guides.title": "Practical guides for prose, web UI, decks, and CI",
    "guides.desc": "Each guide comes with copy-ready commands and before/after examples.",
    "guides.all": "All guides →",
    "guides.g1Cat": "Writing & Editing · 7 min",
    "guides.g1Title": "Remove AI slop from writing",
    "guides.g1Desc": "Skip flat banned-word lists and use the deletion test to avoid second-order clichés.",
    "guides.g2Cat": "UI & Visual Craft · 6 min",
    "guides.g2Title": "Fix AI slop in web UI",
    "guides.g2Desc": "Replace purple gradients, pill walls, nested boxes, and dead buttons.",
    "guides.g3Cat": "Docs & Decks · 6 min",
    "guides.g3Title": "Clean up AI-made decks and docs",
    "guides.g3Desc": "Catch raw asterisks, slide word walls, shrunk autofit text, and vague titles.",
    "guides.g4Cat": "Setup & CI · 6 min",
    "guides.g4Title": "Add dislop to agents and CI",
    "guides.g4Desc": "Set up the Skill, offline CLI, GitHub Actions diff gate, and Cloud MCP.",
    "guides.g5Cat": "Selection & Benchmarks · 6 min",
    "guides.g5Title": "Linter vs. detector vs. skill",
    "guides.g5Desc": "What each kind of tool can and cannot catch.",
    "guides.g6Cat": "Fundamentals · 6 min",
    "guides.g6Title": "What AI slop looks like",
    "guides.g6Desc": "Four layers of signals across prose, web pages, and slides.",
    "guides.g7Cat": "Benchmarks · 7 min",
    "guides.g7Title": "4 anti-slop skills on 30 drafts",
    "guides.g7Desc": "Raw defects that slipped past Humanizer, stop-slop, and Humanizer-zh before gating.",

    "share.title": "Share with your team, or contribute a case",
    "share.c1Title": "Send it to your team",
    "share.c1Desc": "Copy a plain blurb with links to the workbench, the cases, and the Awesome list.",
    "share.copySiteBtn": "Copy project blurb",
    "share.copyCasesBtn": "Copy cases link",
    "share.c2Title": "Star it on GitHub",
    "share.c2Desc": "The engine, Skill, plugins, CLI, and Awesome list live in one repo.",
    "share.starCta": "Star on GitHub ★",
    "share.c3Title": "Add a case, rule, or tool",
    "share.c3Desc": "Send a classic AI-slop sample or a tool we missed through a GitHub issue.",
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
    "cov.r4Scope": "Dead href='#' placeholder links, unexplained disabled buttons, purple-pink AI gradients, pill walls, 3-level nested boxes, and prompt-echo badges.",
    "cov.r5Name": "Git diffs & PRs",
    "cov.r5Scope": "Checks modified or --since <ref> deliverable files for chat wrappers, placeholders, prose clichés, and UI slop, with SARIF 2.1.0 output. Code AST linting is not built.",
    "cov.r6Name": "Personal voice, local Ollama & 3-Tier routing",
    "cov.r6Scope": "The CLI supports offline voice baselines (dislop voice), local Ollama small models (dislop model pull), BYOK (--engine byok), and Official Cloud MCP multi-model review.",
    "status.live": "Works now",
    "status.partial": "Diff checks work; no AST",
    "status.partialVoice": "Live offline & cloud",
    "status.notYet": "Not shipped (prototype)",

    "rules.title": "Built-in rules across 7 scenario packs",
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
    "rules.colEx": "Before → Still sounds like AI → After",

    "pos.norm-zurich": "Strict modular graphic systems, micro-typographic rules, and structural restraint.",
    "pos.stiftung-buchkunst": "Book proportions, margins, and pacing you can reuse in reports, PDFs, and slide decks.",
    "pos.fonts-in-use": "Real-world typography pairings across books, posters, and interfaces.",
    "pos.dinamo": "Independent Swiss foundry demonstrating typographic scale, variable axes, and clean utility UI.",
    "pos.the-type": "Chinese and multilingual typography critique, CJK punctuation mechanics, and editorial layout standards.",
    "pos.arena": "Research-oriented visual channels for archival print, editorial systems, and signage.",

    "footer.selfAudit": "This site passes dislop check site/ with 0 issues.",
    "footer.agentHint": "For agents, start at /llms.txt.",
    "footer.guides": "Guides",
    "footer.awesome": "Awesome list",
    "footer.rules": "All rules",
    "footer.privacy": "Privacy",
    "footer.roadmap": "Roadmap",
    "footer.brand": "Voice guide",
    "footer.design": "Design tokens",
    "footer.gResources": "Resources",
    "footer.gProject": "Project",
    "footer.gElsewhere": "Elsewhere",
  },
};

// ---------- Hero 3-State Proof Card Data (100% Language-Pure, Live Engine Verified) ----------

const HERO_PROOF_BY_LANG = {
  zh: {
    filename: "release-notes.md",
    modality: "markdown",
    pack: "business-brief",
    bad: "本次升级重构了搜索底层逻辑，以增量索引把改价和上下架从凌晨 3 点全量重建压到最多 30 秒生效，显著提升上新效率、持续优化交互体验，类目调整暂走夜间重建。这不是一次简单的提速，而是运营节奏的重塑。详见【待补充】。",
    trap: "商品搜索已切到增量索引，改价和上下架不用再苦等凌晨 3 点全量重建，最多 30 秒生效（类目调整仍走夜间重建）。这不是一次简单的提速，而是运营节奏的重塑。",
    good: "商品搜索改成了增量索引：改价和上下架最多 30 秒生效，不用再等凌晨 3 点全量重建；类目调整仍走夜间重建。",
    badNotes: [
      { kind: "error", label: "硬伤：", text: "末尾还留着没填完的占位符，发版前补上链接或直接删掉。" },
      { kind: "warn", label: "提醒：", text: "把改动埋进了黑话自嗨、空泛吹捧和“不是……而是……”口号里，全段拆成直白人话。" },
    ],
    trapVerdict: "没通过：黑话和占位符删了，却留着“不是……而是……”的反转口号。",
    goodVerdict: "0 处问题。字数砍掉一半，黑话、口号和占位符全清掉，30 秒、凌晨 3 点和例外规则一个没丢。",
  },
  en: {
    filename: "release-notes.md",
    modality: "markdown",
    pack: "business-brief",
    bad: "This release leverages a robust, seamless pipeline to streamline webhook recovery, retrying failed deliveries up to 8 times over 24 hours with exponential backoff before routing unrecovered events to a 14-day dead-letter queue. This isn't just a retry policy — it's peace of mind. [insert docs link]",
    trap: "Failed webhook deliveries now retry up to 8 times over 24 hours with exponential backoff, and events that still fail wait in a dead-letter queue for 14 days. This isn't just a retry policy — it's peace of mind.",
    good: "Failed webhook deliveries retry up to 8 times over 24 hours with exponential backoff. If the last attempt fails, they stay in a dead-letter queue for 14 days.",
    badNotes: [
      { kind: "error", label: "Hard bug: ", text: "Unfilled docs placeholder at the end. Add the link or delete the token." },
      { kind: "warn", label: "Warning: ", text: "Stacked buzzwords like 'seamless' and a 'Not just X — it's Y' closer bury the actual change. State the retry rule directly." },
    ],
    trapVerdict: "Rejected: the buzzwords and placeholder are gone, but a 'Not just X — it's Y' slogan took their place.",
    goodVerdict: "0 issues. Cut nearly in half into two plain sentences, with 8 retries, 24 hours, and 14 days intact.",
  },
};

// ---------- Language-Pure Workbench Specimens (8 ZH + 8 EN, ZERO Mixing) ----------

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
        "本次改造重塑了工单调度链路，显著提升处理效率，持续优化一线客服协同体验，将首响时间压缩至最多 45 秒。",
      ].join("\n"),
      trap: [
        "压测延迟待压测签字后补齐。",
        "",
        "本次改造给工单分了级，一线客服首响时间压缩至最多 45 秒。这不是一次普通的派单优化，而是服务标准线的整体重构。",
      ].join("\n"),
      good: [
        "压测延迟待压测签字后补齐。",
        "",
        "本次改造给工单分了级，一线客服首响时间压缩至最多 45 秒。",
      ].join("\n"),
    },
    {
      id: "eng-postmortem",
      num: "02",
      label: "研发 PR 与复盘",
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
      id: "ui-chrome",
      num: "03",
      label: "网页与 SVG 模板味",
      pack: "deck-and-ui",
      filename: "landing-card.html",
      modality: "html",
      bad: [
        '<div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">',
        '  <div class="blur-3xl rounded-full bg-purple-500/30"></div>',
        '  <span class="badge">AI 强力驱动</span>',
        "  <h2>🚀 1.2 秒查完 48 份演示文稿</h2>",
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
      id: "exec-deck",
      num: "04",
      label: "管理汇报提纲",
      pack: "executive-deck",
      filename: "q3-retention-slides.md",
      modality: "markdown",
      bad: [
        "## 关于第三季度客户留存的分析汇报",
        "",
        "- **洞察**：全面复盘转化链路。",
        "- **协同**：推动跨部门机制。",
        "- **赋能**：打磨新客引导体验。",
        "- **闭环**：建立周度追踪看板。",
        "- **沉淀**：形成标准化方法论。",
      ].join("\n"),
      trap: [
        "## 客户留存全面跃迁阶段性进展汇报",
        "",
        "- **战略**：全面赋能续费体验。",
        "- **抓手**：持续打造增长飞轮。",
      ].join("\n"),
      good: [
        "## Q3 老客月留存从 72% 升至 81%",
        "",
        "- 注册后 48 小时内加配首条规则的团队，次月续费率高出 19 个百分点。",
        "- 客服把配置指导缩成 3 步清单后，首次配置耗时从 24 分钟降到 8 分钟。",
      ].join("\n"),
    },
    {
      id: "stealth-vapor",
      num: "05",
      label: "表面像真话的空话",
      pack: "business-brief",
      filename: "stealth-vapor.md",
      modality: "markdown",
      bad: [
        "在当今快速变化的数字环境中，这一流程的推进往往能够为团队带来稳步提升的协作体验，并在很大程度上促进整体效能的持续优化。",
        "",
        "与此同时，相关团队能够更加平稳有序地推进日常协作，为后续项目落地奠定更加坚实的基础，在潜移默化中提升整体交付稳定性。",
      ].join("\n"),
      trap: [
        "新流程上线后，团队沟通效率迈上了新台阶。跨部门合作正迎来前所未有的新气象，各项工作在有条不紊中持续向好。",
      ].join("\n"),
      good: [
        "周一改用新的工单分流表后，客服把超时工单从 42 条压到 7 条。后端张工今天下午 4 点前把重试上限从 5 次调成 2 次，下周再看一周报警数。",
      ].join("\n"),
    },
    {
      id: "essay",
      num: "06",
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
      id: "reg-external",
      num: "07",
      label: "对外合规",
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
    {
      id: "clean-nearmiss",
      num: "08",
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
        "Certainly! Here is the release brief.",
        "",
        "p95 latency is [insert p95 latency].",
        "",
        "This release leverages a seamless, robust export pipeline to streamline large jobs and elevate reliability — finishing CSV exports in up to 12 minutes for accounts above 500,000 rows.",
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
      id: "eng-postmortem",
      num: "02",
      label: "PR & postmortem",
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
      id: "ui-chrome",
      num: "03",
      label: "Web page & UI",
      pack: "deck-and-ui",
      filename: "hero-card.html",
      modality: "html",
      bad: [
        '<div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">',
        '  <div class="blur-3xl rounded-full bg-purple-500/30"></div>',
        '  <span class="badge">AI-Powered · Zero Hallucination</span>',
        "  <h2>🚀 Audit 48 slide decks in 1.2 seconds</h2>",
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
      id: "exec-deck",
      num: "04",
      label: "Exec deck outline",
      pack: "executive-deck",
      filename: "q3-retention-slides.md",
      modality: "markdown",
      bad: [
        "## Analysis of Q3 Customer Retention",
        "",
        "- Aligned cross-functional priorities across onboarding and account teams.",
        "- Enhanced lifecycle communication touchpoints for mid-market accounts.",
        "- Streamlined internal handoff checklists during quarterly renewals.",
      ].join("\n"),
      trap: [
        "## Overview of Retention Roadmap",
        "",
        "- **Alignment**: Streamlined cross-functional workflows.",
        "- **Impact**: Unlocked sustainable quarterly retention.",
      ].join("\n"),
      good: [
        "## Q3 Net Retention Rose from 88% to 94%",
        "",
        "- Teams finishing setup within 48 hours renew at 96% vs 71% for slower accounts.",
        "- Cutting onboarding to a 3-step checklist dropped setup time from 24 to 8 minutes.",
      ].join("\n"),
    },
    {
      id: "stealth-vapor",
      num: "05",
      label: "Polite empty prose",
      pack: "business-brief",
      filename: "stealth-vapor.md",
      modality: "markdown",
      bad: [
        "This workflow upgrade plays an important role in supporting steady operational progress across distributed teams. By maintaining shared visibility, it helps stakeholders cultivate greater confidence while preserving consistent execution standards.",
        "",
        "Furthermore, structured documentation provides meaningful context for daily reviews and minimizes unexpected friction when additional resources are required.",
      ].join("\n"),
      trap: [
        "Teams often notice smoother alignment across departments when shared documentation helps everyone focus on steady progress. Rather than isolated assumptions, consistent review habits support long-term visibility across quarterly planning cycles.",
      ].join("\n"),
      good: [
        "We split triage into P0 and P1 queues on Monday, cutting first-response time from 110s to 42s across 312 tickets. Next Tuesday @ops-oncall will drop the retry cap from 5 to 2 in `queue.yaml`.",
      ].join("\n"),
    },
    {
      id: "essay",
      num: "06",
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
      id: "reg-external",
      num: "07",
      label: "Regulated copy",
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
    {
      id: "clean-nearmiss",
      num: "08",
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
  ],
};

// ---------- Real Cases & Share Blurbs (100% Language-Pure) ----------

const CASES_BY_LANG = {
  zh: [
    {
      id: "doc",
      kicker: "发版简报（去套话 + 核对数字）",
      title: "清掉寒暄、官话与口号，四个核心指标一个不丢",
      steps: [
        {
          cls: "is-bad",
          label: "原稿（AI 寒暄 + 黑话 + 喊口号）",
          text: "好的，以下是 Q4 结算引擎升级说明。值得注意的是，本次以异步化为核心抓手，全面赋能商户体验。峰值 TPS 从 1,200 升至 4,800，P99 延迟从 210ms 降至 42ms，一致性达 99.99%。",
        },
        {
          cls: "is-trap",
          label: "换了种 AI 味（掉进反转口号）",
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
        "换了种 AI 味：这绝非一次普通升级，而是结算架构的效率跃迁，性能实现数倍提升。",
        "改干净：Q4 结算引擎改为全链路异步化后，峰值 TPS 从 1,200 升至 4,800，P99 延迟从 210ms 降至 42ms，数据一致性 99.99%。",
        "在线试查与一键去味：https://dislop.com/zh/#workbench",
      ].join("\n"),
    },
    {
      id: "autopsy",
      kicker: "上一版首屏复盘（句式推销味）",
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
      linkHref: "/methodology/brand-and-voice.md",
      linkLabel: "看完整复盘 →",
      shareLabel: "复制这段分享",
      shareText: [
        "为什么有时候把“赋能”“抓手”删完了，读起来还是满屏 AI 味？",
        "我们拿自己上一版官网首屏做了次复盘：工具检查报 0 处问题，但三段对称分号推销句 + 校对戏服 + 段尾“笔一直在你手里”金句收尾，一眼还是 AI 写的。",
        "完整前后对照与去 AI 味方法：https://dislop.com/zh/#cases",
      ].join("\n"),
    },
    {
      id: "ui",
      kicker: "网页与 PPT 模板味",
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
        "dislop 可以在浏览器或命令行直接离线挑出这些模板味：https://dislop.com/zh/#cases",
      ].join("\n"),
    },
  ],
  en: [
    {
      id: "doc",
      kicker: "Release note (rewrite + number check)",
      title: "Stripping chat wrappers and hype while keeping every metric exact",
      steps: [
        {
          cls: "is-bad",
          label: "Original (chat wrapper + buzzwords)",
          text: "Happy to help! Below is the Q4 settlement note. In today's fast-paced landscape, async queues supercharge throughput from 1,200 to 4,800 TPS and cut p99 latency from 210ms to 42ms.",
        },
        {
          cls: "is-trap",
          label: "Still sounds like AI (dropped numbers + fallback slogan)",
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
        "Still sounds like AI: This isn't just an upgrade — it's a new standard for blazing-fast settlement.",
        "After: Switching the Q4 settlement engine to async queues raised peak throughput from 1,200 to 4,800 TPS and cut p99 latency from 210ms to 42ms.",
        "Try drafts offline or run 1-click AI rewrite: https://dislop.com/#workbench",
      ].join("\n"),
    },
    {
      id: "autopsy",
      kicker: "Previous hero audit (pitch cadence)",
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
      linkHref: "/methodology/brand-and-voice.md",
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
      kicker: "Web UI & slide templates",
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
    site: "去 AI 味才是真正的生产力！分享一个专用 AI 味检查工具 dislop：整合了 90 条精选去味工具和社区规则，帮你（的 Agent）在文档、网页和 PPT 发出前挑出并改掉 AI 味，一行命令接进 Codex / Claude Code / Cursor / WorkBuddy 等，支持纯本地离线运行。官网：https://dislop.com/zh/ GitHub：https://github.com/dislop-ai/dislop",
    awesome: "去 AI 味才是真正的生产力！整理了一份 90 条去 AI 味工具与资料清单（Awesome Anti-Slop），涵盖中英文写作规范、Vale / Impeccable 等自动检查器、网页设计规则、PR 治理和论文，支持在线筛选也提供给 Agent 读的 JSON：https://dislop.com/zh/awesome/ （GitHub：https://github.com/dislop-ai/dislop/blob/main/awesome/README.zh-CN.md）",
    cases: "https://dislop.com/zh/#cases",
  },
  en: {
    site: "Cutting AI slop is real productivity. Check out dislop — a dedicated linter for AI slop with vetted community rules and 90 curated tools across docs, web UI, and slides. Connects to Codex, Claude Code, Cursor, and office agents in one command and runs offline: https://dislop.com (GitHub: https://github.com/dislop-ai/dislop)",
    awesome: "Awesome Anti-Slop: 90 verified anti-slop tools, writing guides, UI standards, PR policies, and papers with a browser filter UI and agent-ready JSON: https://dislop.com/awesome/ (GitHub: https://github.com/dislop-ai/dislop/tree/main/awesome)",
    cases: "https://dislop.com/#cases",
  },
};

// ---------- Snippets by Language ----------

const SNIPPETS_BY_LANG = {
  zh: {
    prompt: `# 复制下面这句话发给你的 Agent（自动评估、安装并试跑）：
请阅读 https://dislop.com/llms.txt，结合我当前的环境与项目内容评估最合适的 dislop 接入方式（Skill、本地 CLI 或远程 MCP），完成安装配置并拿现有文件试跑一次。`,
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
    cli: `# 离线检查当前目录（Node.js 20+ 零依赖，内置 11 套模块化规则包，0 联网）
npx --yes dislop check .

# 仅跑确定性规则包并在 warning 时阻断 CI（0 联网）
npx --yes dislop check . --no-llm --fail-on warning

# 仅写回通过安全检验的确定性修复（交互式 hunks 去掉 --auto）
npx --yes dislop fix draft.md --auto

# 改后事实闸门核验，确认数字、单位、网址与限定词无漂移
npx --yes dislop verify --git HEAD draft.md

# 查看内置规则包，或校验自定义 .pack.md 安全性
npx --yes dislop packs list`,
    ci: `name: dislop
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: dislop-ai/dislop@v1.1.2
        with:
          since: origin/\${{ github.base_ref }}
          fail-on: error`,
    config: `{
  "routing": "local",
  "failOn": "error",
  "ignore": ["vendor/**", "dist/**"],
  "overrides": [
    { "files": ["docs/**/*.md"], "packs": ["zh/prose"], "failOn": "warning" },
    { "files": ["slides/**/*.pptx"], "packs": ["common/slide-deck", "zh/slide-deck"] },
    { "files": ["site/**/*.{html,css,jsx,tsx,svg}"], "packs": ["common/web-ui"] }
  ]
}`,
  },
  en: {
    prompt: `# Send this one-line prompt to your Agent (evaluate, install, and run first check):
Read https://dislop.com/llms.txt, evaluate which dislop setup fits my environment and project (Skill, offline CLI, or Cloud MCP), install and configure it, and run a first check on our files.`,
    skill: `# Install the pure-Markdown cross-host Agent Skill (no bundled scripts)
npx skills add dislop-ai/dislop

# Runs locally on your machine after install (0 network calls, 0 WebFetch prompts):
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
    cli: `# Check the current folder offline (Node.js 20+ zero dependencies, 11 modular Packs)
npx --yes dislop check .

# Deterministic CI check treating Defect: warning as exit 1
npx --yes dislop check . --no-llm --fail-on warning

# Batch-apply verified safe cleanups (omit --auto for interactive hunks)
npx --yes dislop fix draft.md --auto

# Deterministic Fact Gate verifying numbers, units, and qualifiers against git HEAD
npx --yes dislop verify --git HEAD draft.md

# List built-in Packs or lint custom .pack.md packs before PR submission
npx --yes dislop packs list`,
    ci: `name: dislop
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: dislop-ai/dislop@v1.1.2
        with:
          since: origin/\${{ github.base_ref }}
          fail-on: error`,
    config: `{
  "routing": "local",
  "failOn": "error",
  "ignore": ["vendor/**", "dist/**"],
  "overrides": [
    { "files": ["docs/**/*.md"], "packs": ["en/prose"], "failOn": "warning" },
    { "files": ["slides/**/*.pptx"], "packs": ["common/slide-deck", "en/slide-deck"] },
    { "files": ["site/**/*.{html,css,jsx,tsx,svg}"], "packs": ["common/web-ui"] }
  ]
}`,
  },
};

const PACK_LABELS = {
  zh: {
    core: "交付底线",
    "business-brief": "工作文档",
    "engineering-spec": "研发文档与复盘",
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

const LANG_SWITCH_DRAFT_KEY = "dislop_lang_switch_draft_v1";

function detectInitialLang() {
  const staticLang =
    typeof document !== "undefined" && document.documentElement
      ? document.documentElement.getAttribute("data-static-lang")
      : "";
  try {
    const param = new URLSearchParams(window.location.search).get("lang");
    if (param) {
      const norm = String(param).trim().toLowerCase();
      if (/^zh\b/.test(norm)) return "zh";
      if (/^en\b/.test(norm)) return "en";
    }
  } catch {
    // ignore URL parsing errors
  }
  return staticLang === "zh" ? "zh" : "en";
}

let currentLang = detectInitialLang();
let currentTheme = "light";
let heroProofState = "bad";
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pausedDemoSlugs = new Set();
let activeSpecimenIdx = 0;
let activeSpecimen = SPECIMENS_BY_LANG[currentLang][0];
let customRuleTitle = null;
let baselineText = activeSpecimen.bad;
let currentText = activeSpecimen.bad;
let currentFilename = activeSpecimen.filename;
let currentModality = activeSpecimen.modality;
let currentPackId = activeSpecimen.pack;
let currentRegister = "auto";
let lastResolvedPackInfo = { packId: activeSpecimen.pack, source: "specimen" };
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

const BINARY_MODALITIES = new Set(["docx", "pptx", "pdf", "image"]);
const TEXT_PROSE_MODALITIES = new Set(["markdown", "text"]);
const UI_CODE_MODALITIES = new Set(["html", "css", "jsx", "tsx", "svg"]);

function resolveWorkbenchPack(packSelection, text, modality) {
  if (packSelection && packSelection !== "auto") {
    return { packId: packSelection, source: "manual" };
  }
  if (modality && !TEXT_PROSE_MODALITIES.has(modality)) {
    return { packId: defaultPackForModality(modality), source: "auto-modality" };
  }
  if (pocketModelReady && String(text || "").trim().length >= 20) {
    try {
      const routed = predictPackWithPocketRouter(text);
      if (routed?.recommendedPack && PACKS_BY_ID[routed.recommendedPack]) {
        return {
          packId: routed.recommendedPack,
          source: "auto-router",
          confidence: routed.confidence || 0,
        };
      }
    } catch {
      // fallback to default modality pack
    }
  }
  return { packId: defaultPackForModality(modality || "markdown"), source: "auto-default" };
}

function collectUnifiedOfflineAudit(text, { filename, modality, packId, pack, register = null }) {
  const baseRes = auditText(text, { filename, modality, pack, register });
  const rawFindings = withUtf16Spans(text, [...(baseRes.findings || [])]);
  const seenKeys = new Set(
    rawFindings.map((f) => `${f.ruleId}|${f.line || 1}|${String(f.match || "").slice(0, 32)}`)
  );

  // Extended pattern-bank probes (deduplicated against core + scenario pack rules)
  try {
    const patRes = auditPatterns(text, {
      filename,
      modality,
      banks: PATTERN_BANKS,
    });
    for (const pf of patRes.findings || []) {
      const dedupKey = `${pf.ruleId}|${pf.line || 1}|${String(pf.match || "").slice(0, 32)}`;
      if (seenKeys.has(dedupKey)) continue;
      if (rawFindings.some((rf) => rf.ruleId === pf.ruleId && Math.abs((rf.line || 1) - (pf.line || 1)) <= 1)) {
        continue;
      }
      seenKeys.add(dedupKey);
      const utf16Span = pf.span
        ? withUtf16Spans(text, [pf])[0]?.span
        : resolveUtf16SpanFromLineColMatch(text, pf.line, pf.col, pf.match);
      rawFindings.push({
        ...pf,
        isPatternProbe: true,
        ...(utf16Span ? { span: utf16Span } : {}),
      });
    }
  } catch {
    // keep deterministic base findings if pattern probe skips
  }

  let pocketMl = null;
  if (pocketModelReady && TEXT_PROSE_MODALITIES.has(modality) && String(text || "").trim().length > 0) {
    try {
      pocketMl = analyzeDocumentWithPocketModels(text);
    } catch {
      pocketMl = null;
    }
  }

  return {
    findings: rawFindings,
    skipped: baseRes.skipped || [],
    pocketMl,
    effectivePackId: packId,
  };
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
      ? "本地二进制文件（Word / PPT / PDF / 图片）为只读体检，请修改原文件后重新打开"
      : "Local binary files (Word / PPT / PDF / image) are read-only here; edit the source file and re-open"
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
        title: getRuleUiTitle(f.ruleId, currentLang),
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

  const slipEl = document.getElementById("hero-proof-slip");
  document.querySelectorAll("[data-hero-state]").forEach((btn) => {
    const active = btn.getAttribute("data-hero-state") === heroProofState;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
    btn.setAttribute("tabindex", active ? "0" : "-1");
    if (active && slipEl && btn.id) {
      slipEl.setAttribute("aria-labelledby", btn.id);
    }
  });
}

function setHeroProofState(nextState) {
  heroProofState = nextState;
  const stageEl = document.getElementById("hero-proof-stage");
  if (stageEl && !prefersReducedMotion) {
    stageEl.classList.add("is-swapping");
    window.setTimeout(() => {
      renderHeroProof();
      stageEl.classList.remove("is-swapping");
    }, 90);
  } else {
    renderHeroProof();
  }
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
      lastUploadedBinaryBuffer = null;
      uploadedOriginalText = null;
      binaryAuditResult = null;
      customRuleTitle = null;
      currentPackId = sp.pack;
      currentFilename = sp.filename;
      currentModality = sp.modality;
      baselineText = sp.bad;
      currentText = sp.bad;
      focusedFindingIdx = -1;
      currentRegister = "auto";
      document.getElementById("pack-select").value = sp.pack;
      const regSel = document.getElementById("register-select");
      if (regSel) regSel.value = "auto";
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

const PATTERN_PROBE_META = {
  "composite-multi-signal": {
    title: { zh: "多维弱信号叠加", en: "Multi-signal AI cluster" },
  },
  "comma-chain-runon": {
    title: { zh: "超长逗号链", en: "Run-on comma chain" },
  },
  "low-burstiness-vapor": {
    title: { zh: "句长过度均匀", en: "Monotone sentence rhythm" },
  },
  "opener-anaphora-monotony": {
    title: { zh: "连续同句首起笔", en: "Repeated sentence openers" },
  },
  "inline-bold-saturation": {
    title: { zh: "段内加粗过密", en: "Inline bold confetti" },
  },
  "paragraph-length-uniformity": {
    title: { zh: "段落字数高度均一", en: "Uniform paragraph lengths" },
  },
  "discourse-marker-cluster": {
    title: { zh: "机械过渡词堆叠", en: "Stacked transition signposts" },
  },
  "zh-ai-calque-cluster": {
    title: { zh: "中文翻译腔与空洞套语", en: "Chinese AI calque cluster" },
  },
  "en-ai-phrase-cluster": {
    title: { zh: "高频英文 AI 词汇聚集", en: "Dense AI vocabulary cluster" },
  },
  "concession-symmetry-frame": {
    title: { zh: "两面端水让步句式", en: "Formulaic both-sides frame" },
  },
  "pull-quote-closer": {
    title: { zh: "段尾强行金句收尾", en: "Poster-style pull-quote closer" },
  },
  "rhetorical-qa-cadence": {
    title: { zh: "主持词式自问自答", en: "Staged rhetorical Q&A" },
  },
  "ui-glassmorphism-overuse": {
    title: { zh: "毛玻璃半透明面板堆砌", en: "Overused glassmorphism panels" },
  },
  "ui-accent-stripe-card": {
    title: { zh: "卡片左侧粗彩条堆叠", en: "Repeated left accent stripes" },
  },
  "pptx-layout-monotony": {
    title: { zh: "连续多页纯字相同版式", en: "Consecutive identical slide layouts" },
  },
  "ui-gen2-tasteful-slop": {
    title: { zh: "精致模板套路组合", en: "Tasteful AI template cluster" },
  },
};

function getRuleUiTitle(ruleId, lang = currentLang) {
  return RULE_UI_META[ruleId]?.title?.[lang] || PATTERN_PROBE_META[ruleId]?.title?.[lang] || ruleId;
}

function pickLocalizedField(val, lang = currentLang) {
  if (val && typeof val === "object") {
    return val[lang] || val.en || val.zh || "";
  }
  return typeof val === "string" ? val : "";
}

function resolveUtf16SpanFromLineColMatch(text, lineNum, colNum, matchStr) {
  if (!text) return null;
  const targetLine = Math.max(1, Number(lineNum) || 1);
  let lineStart = 0;
  let curLine = 1;
  while (curLine < targetLine && lineStart < text.length) {
    const nl = text.indexOf("\n", lineStart);
    if (nl === -1) break;
    lineStart = nl + 1;
    curLine += 1;
  }
  const nlEnd = text.indexOf("\n", lineStart);
  const lineEnd = nlEnd === -1 ? text.length : nlEnd;
  const lineStr = text.slice(lineStart, lineEnd);
  if (!lineStr.trim()) return null;

  const rawMatch = String(matchStr || "").trim();
  const candidates = [];
  if (rawMatch) {
    candidates.push(rawMatch);
    if (rawMatch.length > 48) candidates.push(rawMatch.slice(0, 48));
    if (rawMatch.length > 24) candidates.push(rawMatch.slice(0, 24));
  }

  const colHint = Math.max(0, (Number(colNum) || 1) - 1);
  for (const probe of candidates) {
    let pos = text.indexOf(probe, Math.min(text.length, lineStart + Math.max(0, colHint - 2)));
    if (pos === -1) pos = text.indexOf(probe, lineStart);
    if (pos !== -1) {
      return { start: pos, end: pos + probe.length };
    }
  }

  const firstNonWs = lineStr.search(/\S/);
  const start = lineStart + (firstNonWs >= 0 ? firstNonWs : 0);
  const end = Math.max(start + 1, lineEnd);
  return { start, end };
}

function inferPastedTextModality(text, selectedPackId) {
  if (selectedPackId && selectedPackId !== "auto" && selectedPackId !== "deck-and-ui") {
    return "markdown";
  }
  const s = String(text || "").trim();
  if (!s) return selectedPackId === "deck-and-ui" ? "html" : "markdown";
  if (/^<\s*svg\b/i.test(s) || /<\s*svg\b[\s\S]*<\/\s*svg\s*>/i.test(s)) {
    return "svg";
  }
  if (
    /<!doctype\s+html/i.test(s) ||
    /<\s*(html|head|body|div|section|main|header|footer|button|article|nav|style|script)\b/i.test(s) ||
    /\bclassName\s*=/.test(s) ||
    /\bbackdrop-blur\b/.test(s)
  ) {
    return "html";
  }
  if (
    !/^#{1,6}\s/m.test(s) &&
    /(?:^|\n)\s*(?::root|@media|@keyframes|[.#*a-zA-Z][\w\s,.:>+~[\]=*()-]*)\{[^}]*:[^}]+;[^}]*\}/m.test(s)
  ) {
    return "css";
  }
  return selectedPackId === "deck-and-ui" ? "html" : "markdown";
}

function localizeBinaryModalityLabel(mod, isZh) {
  switch (String(mod || "").toLowerCase()) {
    case "image":
      return isZh ? "图片" : "Image";
    case "pdf":
      return isZh ? "PDF 文档" : "PDF";
    case "docx":
      return isZh ? "Word 文档 (.docx)" : "Word (.docx)";
    case "pptx":
      return isZh ? "PPT 演示 (.pptx)" : "PowerPoint (.pptx)";
    case "svg":
      return "SVG";
    default:
      return String(mod || "").toUpperCase();
  }
}

function localizeFindingLocationForUi(loc, lang) {
  const s = String(loc || "");
  if (lang !== "zh" || !s) return s;
  if (s === "metadata") return "元数据";
  if (s === "pixels") return "像素采样";
  if (/^slide\s+(\d+)$/i.test(s)) return s.replace(/^slide\s+(\d+)$/i, "第 $1 页");
  if (/^page\s+(\d+)$/i.test(s)) return s.replace(/^page\s+(\d+)$/i, "第 $1 页");
  if (/^para\s+(\d+)$/i.test(s)) return s.replace(/^para\s+(\d+)$/i, "第 $1 段");
  return s;
}

function localizeFindingMatchForUi(matchStr, lang) {
  const s = String(matchStr || "");
  if (lang !== "zh" || !s) return s;
  if (s === "C2PA / AI provenance manifest present") {
    return "包含 C2PA / AI 来源清单（按规范保留）";
  }
  const autofit = s.match(/^normAutofit\s+fontScale=(\d+%)$/i);
  if (autofit) {
    return `启用自动缩字（字号被压至 ${autofit[1]}）`;
  }
  const wcMatch = s.match(/^(\d+)\s+words\s*\/\s*(\d+)\s+CJK chars$/i);
  if (wcMatch) {
    return `${wcMatch[1]} 个英文词 / ${wcMatch[2]} 个中文字符`;
  }
  const bullets = s.match(/^(\d+)\s+bullet items$/i);
  if (bullets) {
    return `单页堆叠 ${bullets[1]} 条要点`;
  }
  const slideMono = s.match(/^(\d+)\s+consecutive identical slide layouts\b/i);
  if (slideMono) {
    return `连续 ${slideMono[1]} 页幻灯片套用相同纯字版式`;
  }
  const pdfMono = s.match(/^(\d+)\s+consecutive identical plain-text landscape PDF pages\b/i);
  if (pdfMono) {
    return `连续 ${pdfMono[1]} 页横版纯文字 PDF 页面版式相同`;
  }
  const rgbFills = s.match(/^(\d+)\s+neon purple-pink RGB fills\/shadings$/i);
  if (rgbFills) {
    return `含 ${rgbFills[1]} 处紫粉霓虹填充或渐变`;
  }
  const fontCollapse = s.match(/^font hierarchy collapsed\s*\(min=([\d.]+)pt,\s*max=([\d.]+)pt,\s*words=(\d+)\)$/i);
  if (fontCollapse) {
    return `字号层级塌缩（最小 ${fontCollapse[1]}pt / 最大 ${fontCollapse[2]}pt，共 ${fontCollapse[3]} 词）`;
  }
  const rasterPages = s.match(/^(\d+)\s+raster-only landscape pages with zero selectable text$/i);
  if (rasterPages) {
    return `${rasterPages[1]} 页横版页面全为整图（无可选文字）`;
  }
  const pxMatch = s.match(/^(\d+)x(\d+)\s*\(([^)]+)\)$/);
  if (pxMatch) {
    const keyMap = {
      neonPurple: "紫粉霓虹",
      highSat: "高饱和",
      smooth: "平滑过渡",
      gridLines: "网格线",
      darkBg: "暗色背景",
    };
    const parts = pxMatch[3].split(",").map((part) => {
      const m = part.trim().match(/^([a-zA-Z]+)=(.+)$/);
      if (!m) return part.trim();
      return `${keyMap[m[1]] || m[1]} ${m[2]}`;
    });
    return `${pxMatch[1]}×${pxMatch[2]} 像素（${parts.join(" · ")}）`;
  }
  return s;
}

function localizeSkippedReasonForUi(reason, lang) {
  const s = String(reason || "");
  if (lang !== "zh" || !s) return s;
  if (s === "Encrypted PDF cannot be audited offline") {
    return "PDF 已加密，无法离线读取正文与排版，已跳过。";
  }
  if (s.includes("Hidden slide (show=0)")) {
    return "隐藏页（show=0）不参与正文密度规则检查。";
  }
  if (s === "Unparseable PDF file") {
    return "无法解析该 PDF 文件。";
  }
  if (s === "Missing page objects inside PDF") {
    return "PDF 内未找到可识别的页面对象。";
  }
  if (s === "Unparseable image file") {
    return "无法解析该图片文件。";
  }
  const uninsp = s.match(/^Uninspectable\s+([a-zA-Z0-9_-]+):\s*(.+)$/);
  if (uninsp) {
    const modLabel = localizeBinaryModalityLabel(uninsp[1], true);
    let detail = uninsp[2];
    if (detail.includes("word/document.xml")) {
      detail = "压缩包内缺少有效的 word/document.xml";
    } else if (detail.includes("ppt/presentation.xml")) {
      detail = "压缩包内缺少有效的幻灯片 XML";
    } else if (detail.includes("valid UTF-8")) {
      detail = "文件不是有效的 UTF-8 文本";
    } else if (/decompress|deflate|zip/i.test(detail)) {
      detail = "压缩数据损坏或无法解压";
    }
    return `无法离线读取该${modLabel}文件：${detail}`;
  }
  return s;
}

function renderVoiceMeter(text, modality, isBinary, pocketMl = null) {
  const valuesEl = document.getElementById("voice-meter-values");
  const subEl = document.getElementById("voice-meter-summary");
  if (!valuesEl) return;
  const isZh = currentLang === "zh";

  if (isBinary) {
    if (modality === "image") {
      if (subEl) subEl.textContent = isZh ? "图片像素与元数据检查 · 0 上传" : "Image pixel & metadata check · 0 uploads";
      valuesEl.innerHTML = `<div class="rhythm-empty">${
        isZh
          ? "图片检查配色分布、尺寸与来源元数据，不统计散文句长节奏。"
          : "Image files run pixel sampling and metadata checks in RAM rather than prose rhythm gauges."
      }</div>`;
      return;
    }
    if (modality === "pdf") {
      if (subEl) subEl.textContent = isZh ? "PDF 版式与文本检查 · 0 上传" : "PDF layout & text check · 0 uploads";
      valuesEl.innerHTML = `<div class="rhythm-empty">${
        isZh
          ? "PDF 检查页数、字号阶梯、纯图页与加密状态，不统计散文句长节奏。"
          : "PDF files inspect page dimensions, font scale, and raster ratio rather than prose rhythm gauges."
      }</div>`;
      return;
    }
    if (subEl) subEl.textContent = isZh ? "本地内存检查 · 0 上传" : "Local browser RAM · 0 uploads";
    valuesEl.innerHTML = `<div class="rhythm-empty">${
      isZh ? "Word / PPT 文档仅做结构与正文体检，不统计散文句长节奏。" : "Office files run structure & text checks rather than prose rhythm gauges."
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

  const mlScore = pocketMl?.wholeTextScore?.eligible ? Math.round((pocketMl.documentProbability ?? 0) * 100) : null;
  const combinedRisk = mlScore !== null ? Math.max(p.telemetryRisk.score, mlScore) : p.telemetryRisk.score;
  const naturalPct = Math.max(8, 100 - combinedRisk);
  const naturalTone = combinedRisk >= 68 ? "bad" : combinedRisk >= 42 ? "warn" : "good";
  const naturalState = isZh
    ? `${naturalPct}/100 ${naturalTone === "good" ? "自然" : naturalTone === "warn" ? "略模板" : "偏机械"}`
    : `${naturalPct}/100 ${naturalTone === "good" ? "high" : naturalTone === "warn" ? "fair" : "low"}`;

  valuesEl.innerHTML = [
    buildRhythmCellHtml({
      label: isZh ? "句长起伏" : "Cadence",
      state: cadenceState,
      tone: cadenceTone,
      pct: cadencePct,
      tip: isZh ? "长短句交替越自然，越不容易读出机器匀速感" : "Varied short and long sentences read more naturally than uniform length",
    }),
    buildRhythmCellHtml({
      label: isZh ? "具体细节" : "Details",
      state: detailState,
      tone: detailTone,
      pct: detailPct,
      tip: isZh ? "数字、时间、单位、代码或配置项等可核对锚点数量" : "Count of checkable numbers, dates, units, paths, and code tokens",
    }),
    buildRhythmCellHtml({
      label: isZh ? "用词变化" : "Variety",
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
      label: isZh ? "文风自然度" : "Naturalness",
      state: naturalState,
      tone: naturalTone,
      pct: naturalPct,
      tip: isZh ? "综合句式骨架、匀速空话与本地风格模型的自然度判断（越高越像人写）" : "Combined naturalness score from structural telemetry and the local style model (higher reads more human)",
    }),
  ].join("");
}

let lastRenderedAudit = { findings: [], skipped: [], pocketMl: null, packId: "business-brief" };
let lastUploadedPreviewDataUrl = null;

function formatBytesShort(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAgentFixBrief() {
  const isZh = currentLang === "zh";
  const packId = lastResolvedPackInfo?.packId || currentPackId || "business-brief";
  const packLabel = PACK_LABELS[currentLang]?.[packId] || packId;
  const effectiveRules = resolveEffectivePack(packId, PACKS_BY_ID).rules || [];
  const findings = lastRenderedAudit?.findings || [];
  const coverageWarnings = lastRenderedAudit?.coverageWarnings || [];
  const skipped = lastRenderedAudit?.skipped || [];
  const ml = lastRenderedAudit?.pocketMl || null;
  const mlHigh = ml && ml.wholeTextScore?.eligible && ml.documentProbability >= (ml.threshold ?? 0.755);

  const lines = [];
  if (isZh) {
    lines.push(`请按以下 dislop 检查结果帮我修改 ${currentFilename || "这份稿件"}（场景包：${packLabel} / ${packId}）：`);
    if (findings.length === 0 && !mlHigh && coverageWarnings.length === 0 && skipped.length === 0) {
      lines.push("- 当前未发现已知规则问题，请结合实际上下文确认事实与逻辑即可。");
    } else {
      findings.forEach((f, idx) => {
        const title = getRuleUiTitle(f.ruleId, "zh");
        const locRaw = typeof f.location === "string" && f.location ? f.location : `${f.line || 1}:${f.col || 1}`;
        const loc = localizeFindingLocationForUi(locRaw, "zh");
        const sev = f.severity === "error" ? "硬伤" : "提醒";
        const ruleDef = effectiveRules.find((r) => r.id === f.ruleId);
        const dt = pickLocalizedField(ruleDef?.deletionTest ?? f.deletionTest, "zh");
        lines.push(`${idx + 1}. [${sev}] ${title} (${f.ruleId}) @ ${loc}`);
        if (f.match) lines.push(`   命中：${localizeFindingMatchForUi(f.match, "zh")}`);
        if (dt) lines.push(`   改法：${dt}`);
      });
      for (const s of skipped) {
        lines.push(`- [跳过未查] ${s.file || currentFilename || "文件"}：${localizeSkippedReasonForUi(s.reason, "zh")}`);
      }
      for (const cw of coverageWarnings) {
        const pList = Array.isArray(cw.pages) && cw.pages.length ? `第 ${cw.pages.join(", ")} 页` : "部分页面";
        lines.push(`- [覆盖提示] ${pList}离线未提取出可选文字，请直接目视复核。`);
      }
      if (mlHigh) {
        const drivers = (ml.wholeTextScore.topDrivers || []).map((d) => d.reason?.zh || d.feature).filter(Boolean);
        lines.push(`- [本地风格模型 ${Math.round(ml.documentProbability * 100)}%] ${drivers.join("；")}`);
      }
    }
    if (!binaryAuditResult && currentText.trim()) {
      lines.push("", "原文：", "```", currentText.slice(0, 6000), "```");
    }
    lines.push("", "要求：改掉上述问题，保留原稿所有真实数字、日期、路径与限定词；不要换成“不是……而是……”反转口号或对称分号套话。");
  } else {
    lines.push(`Please revise ${currentFilename || "this draft"} based on these dislop findings (pack: ${packLabel} / ${packId}):`);
    if (findings.length === 0 && !mlHigh && coverageWarnings.length === 0 && skipped.length === 0) {
      lines.push("- No known patterns found; double-check facts and tone in context.");
    } else {
      findings.forEach((f, idx) => {
        const title = getRuleUiTitle(f.ruleId, "en");
        const loc = typeof f.location === "string" && f.location ? f.location : `${f.line || 1}:${f.col || 1}`;
        const sev = f.severity === "error" ? "hard bug" : f.severity || "warning";
        const ruleDef = effectiveRules.find((r) => r.id === f.ruleId);
        const dt = pickLocalizedField(ruleDef?.deletionTest ?? f.deletionTest, "en");
        lines.push(`${idx + 1}. [${sev}] ${title} (${f.ruleId}) @ ${loc}`);
        if (f.match) lines.push(`   Match: ${f.match}`);
        if (dt) lines.push(`   Check: ${dt}`);
      });
      for (const s of skipped) {
        lines.push(`- [Skipped] ${s.file || currentFilename || "file"}: ${s.reason}`);
      }
      for (const cw of coverageWarnings) {
        lines.push(`- [Coverage] ${cw.message}`);
      }
      if (mlHigh) {
        const drivers = (ml.wholeTextScore.topDrivers || []).map((d) => d.reason?.en || d.feature).filter(Boolean);
        lines.push(`- [Local style model ${Math.round(ml.documentProbability * 100)}%] ${drivers.join("; ")}`);
      }
    }
    if (!binaryAuditResult && currentText.trim()) {
      lines.push("", "Draft:", "```", currentText.slice(0, 6000), "```");
    }
    lines.push("", "Constraints: keep every number, date, qualifier, and path intact; do not swap clichés for 'Not X, but Y' slogans or 3-part semicolon pitches.");
  }
  return lines.join("\n");
}

function renderBinarySummaryCard(binRes) {
  const box = document.getElementById("binary-summary-view");
  if (!box) return;
  if (!binRes) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const isZh = currentLang === "zh";
  const meta = binRes.binaryMeta || {};
  const rows = [];
  rows.push([isZh ? "文件名" : "File", meta.filename || currentFilename || "—"]);
  rows.push([
    isZh ? "格式 / 大小" : "Format / Size",
    `${localizeBinaryModalityLabel(meta.modality || currentModality || "", isZh)} · ${formatBytesShort(meta.sizeBytes)}`,
  ]);
  if (meta.modality === "pptx") {
    rows.push([isZh ? "幻灯片页数" : "Slides", String(meta.slideCount ?? 0)]);
    rows.push([isZh ? "检查范围" : "Scope", isZh ? "放映顺序文字、字墙、要点条数、自动缩排、标题与连续同版式" : "Slide text, word-walls, >6 bullets, autofit shrink, generic titles, 4+ layout monotony"]);
  } else if (meta.modality === "docx") {
    rows.push([isZh ? "XML 部件" : "XML parts", String(meta.xmlCount ?? 0)]);
    rows.push([isZh ? "检查范围" : "Scope", isZh ? "合并段落、未渲染 Markdown 符号与正文套话（按段落定位）" : "Merged runs, raw Markdown asterisks, prose clichés (by paragraph)"]);
  } else if (meta.modality === "pdf") {
    rows.push([isZh ? "页数 / 状态" : "Pages / Status", meta.encrypted ? (isZh ? "已加密（跳过未查）" : "Encrypted (skipped)") : `${meta.pageCount ?? 0} ${isZh ? "页" : "pages"}`]);
    rows.push([isZh ? "检查范围" : "Scope", isZh ? "横版幻灯片字墙、纯图页面、字号阶梯与紫粉填充；加密 PDF 跳过" : "Landscape slide word-walls, raster pages, flat type scale, purple fills"]);
  } else if (meta.modality === "image") {
    rows.push([isZh ? "图片尺寸" : "Dimensions", meta.width && meta.height ? `${meta.width} × ${meta.height} px (${String(meta.format || "").toUpperCase()})` : "—"]);
    rows.push([
      isZh ? "元数据 / 来源" : "Metadata / C2PA",
      meta.hasC2pa
        ? isZh
          ? `发现 C2PA / 来源标识（已提示保留） · ${meta.metadataCount || 0} 条文本块`
          : `C2PA / AI provenance present (keep per policy) · ${meta.metadataCount || 0} text chunks`
        : isZh
          ? `${meta.metadataCount || 0} 条文本块`
          : `${meta.metadataCount || 0} text chunks`,
    ]);
    if (meta.pixelMetrics) {
      const pm = meta.pixelMetrics;
      rows.push([
        isZh ? "像素配色采样" : "Pixel sampling",
        isZh
          ? `紫粉霓虹占比 ${Math.round(pm.neonPurpleRatio * 100)}% · 高饱和占比 ${Math.round(pm.highSatRatio * 100)}%`
          : `Neon purple ${Math.round(pm.neonPurpleRatio * 100)}% · high saturation ${Math.round(pm.highSatRatio * 100)}%`,
      ]);
    }
  }
  if (Array.isArray(binRes.coverageWarnings) && binRes.coverageWarnings.length > 0) {
    const pagesList = binRes.coverageWarnings.flatMap((cw) => cw.pages || []);
    rows.push([
      isZh ? "文字提取" : "Text extraction",
      isZh
        ? `第 ${pagesList.length ? pagesList.join("、") : "部分"} 页未读出可选文本，建议直接目视复核`
        : `0 selectable characters extracted on page(s) ${pagesList.length ? pagesList.join(", ") : "?"}; inspect visually`,
    ]);
  }
  if (meta.error) {
    rows.push([isZh ? "读取异常" : "Read error", localizeSkippedReasonForUi(`Uninspectable ${meta.modality || "file"}: ${meta.error}`, currentLang)]);
  }

  const previewHtml =
    lastUploadedPreviewDataUrl && (meta.modality === "image" || currentModality === "svg")
      ? `<div class="binary-preview-wrap"><img src="${escapeHtmlSafe(lastUploadedPreviewDataUrl)}" alt="${escapeHtmlSafe(meta.filename || "preview")}"></div>`
      : "";

  box.hidden = false;
  box.innerHTML = `
    <div class="binary-summary-head">
      <strong>${isZh ? "本地文件离线体检（当前标签页内存解析 · 0 上传）" : "Offline local file inspection (parsed in browser memory · 0 uploads)"}</strong>
      <span class="binary-readonly-note">${
        isZh
          ? "二进制文件只读检查；顶部「编辑原文」与下方云端按钮仅对文本或网页草稿可用。"
          : "Read-only offline inspection; Edit text and Cloud AI buttons apply only to text or markup drafts."
      }</span>
    </div>
    ${previewHtml}
    <dl class="binary-meta-grid">
      ${rows.map(([k, v]) => `<div class="binary-meta-row"><dt>${escapeHtmlSafe(k)}</dt><dd>${escapeHtmlSafe(v)}</dd></div>`).join("")}
    </dl>
  `;
}

function renderWorkbench() {
  const packInfo = binaryAuditResult
    ? { packId: currentPackId === "auto" ? defaultPackForModality(currentModality) : currentPackId, source: currentPackId === "auto" ? "auto-modality" : "manual" }
    : resolveWorkbenchPack(currentPackId, currentText, currentModality);
  lastResolvedPackInfo = packInfo;
  const pack = resolveEffectivePack(packInfo.packId, PACKS_BY_ID);
  const regOverride = currentRegister && currentRegister !== "auto" ? currentRegister : null;
  const regResolved = resolveRegister(binaryAuditResult ? "" : currentText || "", {
    filename: currentFilename || "draft.md",
    flagRegister: regOverride,
  });
  const strategy = getScenarioStrategy({ packId: packInfo.packId, register: regResolved.register });
  const t0 = performance.now();
  const auditRes = binaryAuditResult
    ? binaryAuditResult
    : collectUnifiedOfflineAudit(currentText, {
        filename: currentFilename,
        modality: currentModality,
        packId: packInfo.packId,
        pack,
        register: regOverride,
      });
  const elapsedMs = (performance.now() - t0).toFixed(1);
  const findings = auditRes.findings || [];
  const skipped = auditRes.skipped || [];
  const coverageWarnings = auditRes.coverageWarnings || [];
  const pocketMl = auditRes.pocketMl || null;
  lastRenderedAudit = { findings, skipped, coverageWarnings, pocketMl, packId: packInfo.packId };
  if (focusedFindingIdx >= findings.length) {
    focusedFindingIdx = -1;
  }

  const proofView = document.getElementById("proof-view");
  const editArea = document.getElementById("edit-textarea");
  const editHintEl = document.getElementById("wb-edit-hint");
  const summaryEl = document.getElementById("wb-summary");
  const mobileCountsEl = document.getElementById("wb-mobile-counts");
  const notesEl = document.getElementById("notes-container");
  const docFileEl = document.getElementById("wb-doc-file");
  const docPackEl = document.getElementById("wb-doc-pack");
  const docStatsEl = document.getElementById("wb-doc-stats");
  const scenarioHintEl = document.getElementById("wb-scenario-hint");
  if (scenarioHintEl) {
    const langTag = currentLang === "zh" ? "zh" : "en";
    scenarioHintEl.innerHTML =
      currentLang === "zh"
        ? `<span><strong>当前策略 · ${escapeHtml(strategy.label[langTag])}</strong>：${escapeHtml(strategy.cut[langTag])}</span><span><strong>保护</strong>：${escapeHtml(strategy.protect[langTag])}</span><span><strong>防改偏</strong>：${escapeHtml(strategy.avoid[langTag])}</span>`
        : `<span><strong>Strategy · ${escapeHtml(strategy.label[langTag])}</strong>: ${escapeHtml(strategy.cut[langTag])}</span><span><strong>Protect</strong>: ${escapeHtml(strategy.protect[langTag])}</span><span><strong>Avoid</strong>: ${escapeHtml(strategy.avoid[langTag])}</span>`;
  }

  setViewMode(viewMode);
  const isCodeMod = UI_CODE_MODALITIES.has(currentModality);
  proofView.classList.toggle("is-code", isCodeMod);
  editArea.classList.toggle("is-code", isCodeMod);
  if (editHintEl) {
    editHintEl.hidden = !(viewMode === "edit" && !binaryAuditResult);
  }

  const packLabelText = PACK_LABELS[currentLang]?.[packInfo.packId] || packInfo.packId;
  if (docFileEl) docFileEl.textContent = currentFilename || "draft.md";
  if (docPackEl) {
    const isAuto = currentPackId === "auto";
    docPackEl.textContent = isAuto
      ? currentLang === "zh"
        ? `自动 → ${packLabelText}`
        : `Auto → ${packLabelText}`
      : packLabelText;
  }
  if (docStatsEl) {
    if (binaryAuditResult) {
      docStatsEl.textContent = formatBytesShort(binaryAuditResult.binaryMeta?.sizeBytes || 0) || String(currentModality).toUpperCase();
    } else {
      const lineCount = currentText ? currentText.split("\n").length : 0;
      const charCount = currentText.length;
      docStatsEl.textContent =
        currentLang === "zh" ? `${lineCount} 行 · ${charCount} 字` : `${lineCount} lines · ${charCount} chars`;
    }
  }

  const goodBtn = document.getElementById("btn-apply-good");
  const trapBtn = document.getElementById("btn-apply-trap");
  const copyDraftBtn = document.getElementById("btn-copy-draft");
  const shareLinkBtn = document.getElementById("wb-share-link-btn");
  const prevBtn = document.getElementById("btn-prev-finding");
  const nextBtn = document.getElementById("btn-next-finding");
  const canApplyGood = !lastUploadedFile && !binaryAuditResult && typeof activeSpecimen?.good === "string";
  const canApplyTrap = !lastUploadedFile && !binaryAuditResult && typeof activeSpecimen?.trap === "string";
  const isGoodActive = canApplyGood && currentText === activeSpecimen?.good;
  const isTrapActive = canApplyTrap && currentText === activeSpecimen?.trap;
  if (goodBtn) {
    goodBtn.disabled = !canApplyGood;
    goodBtn.hidden = !canApplyGood;
    goodBtn.classList.toggle("is-active", isGoodActive);
    goodBtn.setAttribute("aria-pressed", String(isGoodActive));
  }
  if (trapBtn) {
    trapBtn.disabled = !canApplyTrap;
    trapBtn.hidden = !canApplyTrap;
    trapBtn.classList.toggle("is-active", isTrapActive);
    trapBtn.setAttribute("aria-pressed", String(isTrapActive));
  }
  if (copyDraftBtn) {
    copyDraftBtn.disabled = Boolean(binaryAuditResult || !currentText.trim());
  }
  if (shareLinkBtn) {
    shareLinkBtn.disabled = Boolean(binaryAuditResult || !currentText.trim());
  }
  if (prevBtn) prevBtn.disabled = findings.length === 0;
  if (nextBtn) nextBtn.disabled = findings.length === 0;

  const errorsCount = findings.filter((f) => f.severity === "error").length;
  const queriesCount = findings.length - errorsCount;

  const isEmptySheet = !binaryAuditResult && currentText.trim().length === 0;
  const mlHigh = Boolean(!isEmptySheet && pocketMl && pocketMl.wholeTextScore?.eligible && pocketMl.documentProbability >= (pocketMl.threshold ?? 0.755));
  if (isEmptySheet) {
    const emptyLabel = currentLang === "zh" ? "空稿纸 · 等你贴字进来" : "Blank sheet · paste a draft";
    summaryEl.innerHTML = `<span>${emptyLabel}</span><span>${elapsedMs} ms</span>`;
    if (mobileCountsEl) mobileCountsEl.textContent = emptyLabel;
  } else if (findings.length === 0 && (skipped.length > 0 || coverageWarnings.length > 0)) {
    const covLabel =
      skipped.length > 0
        ? currentLang === "zh"
          ? `未完成完整检查 · ${skipped.length} 项跳过`
          : `Incomplete scan · ${skipped.length} skipped`
        : currentLang === "zh"
          ? "部分页面未读出文字 · 请人工复核"
          : "Unreadable PDF pages · inspect visually";
    summaryEl.innerHTML = `<span>${covLabel}</span><span>${elapsedMs} ms</span>`;
    if (mobileCountsEl) mobileCountsEl.textContent = covLabel;
  } else {
    const mlTag = mlHigh ? (currentLang === "zh" ? " · 风格模型提示" : " · style note") : "";
    const countLabel =
      currentLang === "zh"
        ? `${errorsCount} 处硬伤 · ${queriesCount} 条提醒${mlTag}`
        : `${errorsCount} ${errorsCount === 1 ? "hard bug" : "hard bugs"} · ${queriesCount} ${queriesCount === 1 ? "warning" : "warnings"}${mlTag}`;
    summaryEl.innerHTML = `<span>${countLabel}</span><span>${elapsedMs} ms</span>`;
    if (mobileCountsEl) mobileCountsEl.textContent = countLabel;
  }

  renderVoiceMeter(currentText, currentModality, Boolean(binaryAuditResult), pocketMl);

  // Render Binary Card, Proof Sheet, or Edit Mode
  if (binaryAuditResult) {
    proofView.hidden = true;
    editArea.hidden = true;
    renderBinarySummaryCard(binaryAuditResult);
  } else if (viewMode === "edit") {
    renderBinarySummaryCard(null);
    proofView.hidden = true;
    editArea.hidden = false;
    if (editArea.value !== currentText) {
      editArea.value = currentText;
    }
  } else {
    renderBinarySummaryCard(null);
    proofView.hidden = false;
    editArea.hidden = true;

    const svgPreviewWrap =
      currentModality === "svg" && lastUploadedPreviewDataUrl
        ? `<li class="proof-line proof-svg-preview"><span class="line-num">SVG</span><span class="line-content"><img class="inline-svg-preview" src="${escapeHtmlSafe(lastUploadedPreviewDataUrl)}" alt="${escapeHtmlSafe(currentFilename || "svg")}"></span></li>`
        : "";
    const lines = currentText.split("\n");
    let offset = 0;
    const htmlLines = lines.map((line, i) => {
      const annotated = renderAnnotatedLine(line, offset, findings, focusedFindingIdx);
      offset += line.length + 1;
      return `<li class="proof-line"><span class="line-num">${i + 1}</span><span class="line-content">${annotated}</span></li>`;
    });
    proofView.innerHTML = svgPreviewWrap + htmlLines.join("");

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
    cards.push(`<div class="note-card is-sev-skip">
      <div class="note-head"><span class="sev-tag sev-warning">${currentLang === "zh" ? "跳过未查" : "Skipped"}</span><span class="note-loc">${escapeHtml(s.file)}</span></div>
      <div class="note-why">${escapeHtml(localizeSkippedReasonForUi(s.reason, currentLang))}</div>
    </div>`);
  }

  for (const cw of coverageWarnings) {
    const pList = Array.isArray(cw.pages) && cw.pages.length ? cw.pages.join(currentLang === "zh" ? "、" : ", ") : "";
    const covMsg =
      currentLang === "zh"
        ? `PDF ${pList ? `第 ${pList} 页` : "部分页面"}包含字体或压缩内容，但离线未能提取出可选文字，请直接目视核对或改用可复制文本导出。`
        : cw.message;
    cards.push(`<div class="note-card is-sev-skip">
      <div class="note-head"><span class="sev-tag sev-warning">${currentLang === "zh" ? "覆盖提示" : "Coverage"}</span><span class="note-loc">${escapeHtml(cw.file || currentFilename || "PDF")}</span></div>
      <div class="note-why">${escapeHtml(covMsg)}</div>
    </div>`);
  }

  if (findings.length === 0 && skipped.length === 0 && coverageWarnings.length === 0) {
    const cleanMsg = isEmptySheet
      ? currentLang === "zh"
        ? "这里还是空的。点「编辑原文」贴一段字，或者从左边选个例子。"
        : "Nothing here yet. Click 'Edit text' to paste a draft, or pick an example on the left."
      : !lastUploadedFile && !customRuleTitle && activeSpecimen?.id === "clean-nearmiss" && currentText === baselineText
        ? currentLang === "zh"
          ? "未发现已知模式。“抓手机”是动作，“默认超时不是 30 秒，而是 300 秒”是真实纠偏，“北京大学、清华大学、复旦大学”是真实校名，不会被误伤。"
          : "No known patterns found. 'Delve' is a debugger, 'wool tapestry' is literal, and the line-42 correction is factual, so nothing gets flagged."
        : mlHigh
          ? currentLang === "zh"
            ? "固定规则未命中，但本地风格模型识别出较高的隐性模板腔，可参照下方特征补充具体事实后复检。"
            : "Deterministic rules did not fire, but the local style model flagged elevated template prose below."
          : currentLang === "zh"
            ? "未发现已知模式（离线规则仅覆盖明确套话与硬伤，不代表深度内容质量无误）。"
            : "No known patterns found (offline rules catch known defects and clichés, not deep editorial quality).";
    cards.push(`<div class="clean-sheet-msg${mlHigh ? " is-ml-warn" : ""}">${escapeHtml(cleanMsg)}</div>`);
  }

  const orderedFindingEntries = [
    ...findings.map((f, idx) => ({ f, idx })).filter(({ f }) => f.severity === "error"),
    ...findings.map((f, idx) => ({ f, idx })).filter(({ f }) => f.severity !== "error"),
  ];

  orderedFindingEntries.forEach(({ f, idx }) => {
    const isErr = f.severity === "error";
    const ruleDef = (pack.rules || []).find((r) => r.id === f.ruleId);
    const plainTitle = getRuleUiTitle(f.ruleId, currentLang);
    const msg = pickLocalizedField(ruleDef?.message ?? f.message, currentLang);
    const dt = pickLocalizedField(ruleDef?.deletionTest ?? f.deletionTest, currentLang);
    const ex = ruleDef ? getLocalizedExemplar(ruleDef, currentLang) : f.exemplar;
    const locRaw = typeof f.location === "string" && f.location ? f.location : `${f.line || 1}:${f.col || 1}`;
    const loc = localizeFindingLocationForUi(locRaw, currentLang);
    const excerpt = localizeFindingMatchForUi(f.match || "", currentLang);
    const focusedCls = idx === focusedFindingIdx ? " is-focused" : "";
    const dotCls = isErr ? "is-error" : "is-warn";
    const sevCls = isErr ? "is-sev-error" : f.severity === "info" ? "is-sev-info" : "is-sev-warning";

    const actionButtons = [];
    if (!binaryAuditResult && f.span) {
      if (f.ruleId === "chatbot-artifact") {
        actionButtons.push(
          `<button type="button" class="ctrl-btn ctrl-btn-sm sheet-btn" data-quick-strip="${idx}">${
            currentLang === "zh" ? "删掉这句寒暄" : "Strip wrapper"
          }</button>`
        );
      }
      actionButtons.push(
        `<button type="button" class="ctrl-btn ctrl-btn-sm sheet-btn" data-jump-edit="${idx}">${
          currentLang === "zh" ? "定位修改" : "Edit span"
        }</button>`
      );
    }
    const actionsHtml = actionButtons.length ? `<div class="note-actions">${actionButtons.join("")}</div>` : "";

    const exHtml = ex
      ? `<div class="note-exemplar">
          <div><span class="ex-label">${currentLang === "zh" ? "原句：" : "Before:"}</span> ${escapeHtml(sanitizePublicExemplar(ex.bad))}</div>
          ${ex.trap ? `<div><span class="ex-label">${currentLang === "zh" ? "换了种 AI 味：" : "Still sounds like AI:"}</span> ${escapeHtml(sanitizePublicExemplar(ex.trap))}</div>` : ""}
          <div><span class="ex-label">${currentLang === "zh" ? "改好：" : "After:"}</span> ${escapeHtml(sanitizePublicExemplar(ex.good))}</div>
        </div>`
      : "";

    const hasDocPage = Boolean(RULE_UI_META[f.ruleId]) && !f.isPatternProbe;
    const footerLinkHtml = hasDocPage
      ? `<a href="#rule-${escapeHtml(f.ruleId)}">${escapeHtml(f.ruleId)}</a> · <a href="${escapeHtml(siteAssetUrl(`rules/${f.ruleId}.md`))}">.md</a>`
      : `<span>${currentLang === "zh" ? "扩展文风探针" : "Extended style probe"} · ${escapeHtml(f.ruleId)}</span>`;

    cards.push(`<article class="note-card ${sevCls}${focusedCls}" data-note-idx="${idx}">
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
          ${footerLinkHtml}
        </div>
      </details>
    </article>`);
  });

  if (!isEmptySheet && pocketMl && pocketMl.wholeTextScore?.eligible) {
    const prob = pocketMl.documentProbability ?? 0;
    const thr = pocketMl.threshold ?? 0.755;
    const advThr = 0.62;
    if (prob >= advThr) {
      const isHigh = prob >= thr;
      const pctStr = `${Math.round(prob * 100)}%`;
      const rawDrivers = pocketMl.wholeTextScore.topDrivers || [];
      const drivers = rawDrivers
        .map((d) => d.reason?.[currentLang] || d.reason?.en || d.feature)
        .filter(Boolean);
      const flaggedPara = (pocketMl.paragraphs || []).find((p) => p.flagged);
      let mlAdvice = "";
      if (flaggedPara) {
        const lineSpanZh =
          flaggedPara.startLine === flaggedPara.endLine
            ? `第 ${flaggedPara.startLine} 行`
            : `第 ${flaggedPara.startLine}–${flaggedPara.endLine} 行`;
        const lineSpanEn =
          flaggedPara.startLine === flaggedPara.endLine
            ? `line ${flaggedPara.startLine}`
            : `lines ${flaggedPara.startLine}-${flaggedPara.endLine}`;
        const needsDetail = rawDrivers.some((d) =>
          String(d.feature || "").includes("concrete") || String(d.feature || "").includes("anchor") || String(d.feature || "").includes("density")
        );
        mlAdvice = currentLang === "zh"
          ? needsDetail
            ? `重点检查${lineSpanZh}段落，可补入具体数字、时间、文件名或明确结论。`
            : `重点检查${lineSpanZh}段落，拆掉空泛套话或换回更直白的说法。`
          : needsDetail
            ? `Check ${lineSpanEn}: add concrete numbers, dates, file names, or direct actions.`
            : `Check ${lineSpanEn}: cut vague framing and swap back plain spoken phrasing.`;
      }
      const mlActionHtml =
        findings.length === 0 && mlHigh && !isCloudSignedIn()
          ? `<div class="note-actions" style="margin-top:8px;"><button type="button" class="btn-primary ctrl-btn-sm" data-ml-cloud-signin style="min-height:30px;padding:4px 12px;font-size:0.78rem;">${
              currentLang === "zh" ? "登录用云端大模型深度审校（送 30 额度）" : "Sign in for deep Cloud Review (30 free)"
            }</button></div>`
          : "";
      cards.push(`<article class="note-card note-card-ml is-sev-warning">
        <div class="note-head">
          <span style="display:inline-flex;align-items:center;gap:8px;font-weight:650;color:var(--ink);font-size:0.86rem;">
            <span class="hero-note-dot is-warn"></span>${
              currentLang === "zh"
                ? isHigh
                  ? "本地风格模型：疑似隐性 AI 空话"
                  : "本地风格模型：略带模板节奏"
                : isHigh
                  ? "Local style model: likely stealth AI prose"
                  : "Local style model: mild template cadence"
            }
          </span>
          <span class="note-loc">${escapeHtml(currentLang === "zh" ? `AI 像真度 ${pctStr}` : `${pctStr} AI-like`)}</span>
        </div>
        ${
          drivers.length
            ? `<div class="note-test"><strong>${currentLang === "zh" ? "主要特征：" : "Signals:"}</strong> ${escapeHtml(drivers.join(currentLang === "zh" ? "；" : "; "))}</div>`
            : ""
        }
        ${mlAdvice ? `<div class="note-why" style="margin-top:4px;">${escapeHtml(mlAdvice)}</div>` : ""}
        ${mlActionHtml}
      </article>`);
    }
  }

  notesEl.innerHTML = cards.join("");
  notesEl.querySelector("[data-ml-cloud-signin]")?.addEventListener("click", () => {
    pendingCloudAction = "review";
    openAuthModal({
      action: "review",
      reasonMsg:
        currentLang === "zh"
          ? "固定规则 0 命中但局部结构偏空泛：登录后立刻调用云端大模型深查（每月 30 免费额度）。"
          : "0 deterministic rule hits, but cadence reads templated: sign in to run deep Cloud Review (30 free credits/mo).",
    });
  });
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
    if (!isEmptySheet && findings.length === 0 && skipped.length === 0 && mlHigh) {
      nudgeEl.textContent =
        currentLang === "zh"
          ? "固定规则 0 命中，但本地风格模型提示隐性模板腔。可补充具体事实后复检，或点上方「复制给 Agent 改稿」。"
          : "0 deterministic rule hits, but the local style model flagged stealth template prose. Add concrete facts or copy the fix brief to your agent.";
    } else if (!isEmptySheet && findings.length === 0 && skipped.length === 0) {
      nudgeEl.textContent =
        currentLang === "zh"
          ? "离线检查未发现已知模式。装成 Skill / Plugin / MCP 让 Agent 下次自动跑，顺手去 GitHub 点个 Star 吧。"
          : "No known patterns found offline. Install the Skill, Plugin, or MCP so your agent checks automatically next time, or star us on GitHub.";
    } else if (!isEmptySheet && (lastUploadedFile || currentText !== baselineText)) {
      nudgeEl.textContent =
        currentLang === "zh"
          ? `已标出 ${findings.length} 处问题。不想每次手动贴进来？把 dislop 装给你的 Agent，或去 GitHub 收藏仓库。`
          : `Flagged ${findings.length} ${findings.length === 1 ? "issue" : "issues"}. Install dislop for your agent to run this automatically, or star the repo on GitHub.`;
    } else {
      nudgeEl.textContent = (I18N[currentLang] || I18N.zh)["wb.nudgeText"];
    }
  }
  if (typeof syncAiButtonsForBinary === "function") {
    syncAiButtonsForBinary();
  }
}

// ---------- Real Cases Showcase (Language-Pure + Interactive Load & Share) ----------

function clearWorkbenchTransientPanels() {
  aiReqSeq += 1;
  preRewriteDraft = null;
  lastUploadedPreviewDataUrl = null;
  const aiPanel = document.getElementById("ai-result-panel");
  if (aiPanel) {
    aiPanel.hidden = true;
    aiPanel.innerHTML = "";
  }
  const appliedEl = document.getElementById("wb-applied-banner");
  if (appliedEl) {
    appliedEl.hidden = true;
    appliedEl.classList.remove("is-error");
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
  lastUploadedBinaryBuffer = null;
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
  currentRegister = "auto";
  document.getElementById("pack-select").value = sp.pack;
  const regSel = document.getElementById("register-select");
  if (regSel) regSel.value = "auto";
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
    lastUploadedBinaryBuffer = null;
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
    currentRegister = "auto";
    document.getElementById("pack-select").value = "business-brief";
    const regSel = document.getElementById("register-select");
    if (regSel) regSel.value = "auto";
    setViewMode("proof");
    updateSpecimenRailSelection();
    renderWorkbench();
    focusWorkbench();
    return;
  }
  loadSpecimenById(caseObj.loadSpecimenId);
}

const CASE_STEP_TAGS = {
  zh: { "is-bad": "没通过", "is-trap": "没通过", "is-good": "通过" },
  en: { "is-bad": "rejected", "is-trap": "rejected", "is-good": "passed" },
};

function renderCases() {
  const grid = document.getElementById("cases-grid");
  if (!grid) return;
  const cases = CASES_BY_LANG[currentLang] || CASES_BY_LANG.zh;
  grid.innerHTML = cases
    .map((c) => {
      const stepsHtml = c.steps
        .map((st) => {
          const body = st.html ? st.html : escapeHtml(st.text);
          const tag = CASE_STEP_TAGS[currentLang]?.[st.cls] || "";
          return `<div class="case-step ${escapeHtml(st.cls)}"><span class="case-step-label"><span>${escapeHtml(st.label)}</span>${
            tag ? `<span class="case-step-tag">${escapeHtml(tag)}</span>` : ""
          }</span>${body}</div>`;
        })
        .join("");
      const noteHtml = c.note ? `<p class="case-note">${escapeHtml(c.note)}</p>` : "";
      const primaryAction = c.loadSpecimenId
        ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-load-case="${escapeHtml(c.id)}">${escapeHtml(c.loadLabel)}</button>`
        : `<a href="${escapeHtml(c.linkHref)}" class="ctrl-btn ctrl-btn-sm">${escapeHtml(c.linkLabel)}</a>`;
      return `<article class="case-card">
        <span class="case-kicker">${escapeHtml(c.kicker)}</span>
        <h3 class="case-title">${escapeHtml(c.title)}</h3>
        <div class="case-body">${stepsHtml}${noteHtml}</div>
        <div class="case-actions">
          ${primaryAction}
          <button type="button" class="ctrl-btn ctrl-btn-sm sheet-btn" data-share-case="${escapeHtml(c.id)}">${escapeHtml(c.shareLabel)}</button>
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
  clearWorkbenchTransientPanels();
  clearSpecimenStateReset();
  binaryAuditResult = null;
  lastUploadedFile = null;
  lastUploadedBinaryBuffer = null;
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
  let totalBuiltInCount = 0;
  let visibleInLangCount = 0;
  let matchedCount = 0;
  let crossLangMatchedCount = 0;
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
      totalBuiltInCount += 1;
      const meta = RULE_UI_META[r.id] || { lang: "both", title: { zh: r.id, en: r.id } };
      // Strict language purity: hide EN-only rules in ZH view and ZH-only rules in EN view
      // (unless specifically targeted via #rule-<id> hash link)
      const isOtherLang = (currentLang === "zh" && meta.lang === "en") || (currentLang === "en" && meta.lang === "zh");
      const isCrossLangPin = isOtherLang && highlightedRuleId === r.id;
      if (isOtherLang && !isCrossLangPin) continue;

      if (!isCrossLangPin) visibleInLangCount += 1;
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

      if (isCrossLangPin) crossLangMatchedCount += 1;
      else matchedCount += 1;
      const sevCls = r.severity === "error" ? "sev-error" : r.severity === "info" ? "sev-info" : "sev-warning";
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
      const trapLabel = currentLang === "zh" ? "换了种 AI 味：" : "Still sounds like AI:";
      const goodLabel = currentLang === "zh" ? "改好：" : "After:";

      rows.push(`<tr id="rule-${escapeHtml(r.id)}" class="rule-row${hashCls}" data-rule-lang="${escapeHtml(meta.lang)}">
        <td class="rule-id-cell">
          <strong>${escapeHtml(title)}</strong>
          <div style="margin-top:2px;"><code>${escapeHtml(r.id)}</code></div>
          <div class="rule-id-actions">
            ${
              canTry
                ? `<button type="button" class="ctrl-btn ctrl-btn-sm sheet-btn" data-try-rule="${escapeHtml(r.id)}">${
                    currentLang === "zh" ? "试试 ↑" : "Try ↑"
                  }</button>`
                : ""
            }
            <a class="rule-md-link" href="${escapeHtml(siteAssetUrl(`rules/${r.id}.md`))}">.md</a>
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

  const hiddenLangCount = totalBuiltInCount - visibleInLangCount;
  const pinNote =
    crossLangMatchedCount > 0
      ? currentLang === "zh"
        ? `（含 ${crossLangMatchedCount} 条跨语种跳转规则）`
        : ` (+${crossLangMatchedCount} linked rule)`
      : "";
  if (matchedCount === visibleInLangCount && hiddenLangCount > 0) {
    countEl.textContent =
      currentLang === "zh"
        ? `当前展示 ${visibleInLangCount} 条中文与通用规则（共 ${totalBuiltInCount} 条，含 ${hiddenLangCount} 条纯英文规则）${pinNote}`
        : `${visibleInLangCount} English & cross-language rules (${totalBuiltInCount} built-in, ${hiddenLangCount} Chinese-only hidden)${pinNote}`;
  } else {
    countEl.textContent =
      currentLang === "zh"
        ? `${matchedCount} / ${visibleInLangCount} 条当前语种规则（共 ${totalBuiltInCount} 条）${pinNote}`
        : `${matchedCount} / ${visibleInLangCount} rules (${totalBuiltInCount} built-in)${pinNote}`;
  }

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

const SHARE_ALLOWED_PACKS = new Set([
  "auto",
  "business-brief",
  "engineering-spec",
  "regulated-comms",
  "executive-deck",
  "literary-essay",
  "deck-and-ui",
]);
const SHARE_ALLOWED_MODS = new Set(["markdown", "text", "html", "css", "svg"]);

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64u) {
  let b64 = String(b64u || "").replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function transformBytes(bytes, streamCtor) {
  const ds = new streamCtor("deflate-raw");
  const writer = ds.writable.getWriter();
  const [buf] = await Promise.all([
    new Response(ds.readable).arrayBuffer(),
    (async () => {
      await writer.write(bytes);
      await writer.close();
    })(),
  ]);
  return new Uint8Array(buf);
}

async function encodeShareHash(text, packId, modality) {
  const payloadBytes = new TextEncoder().encode(
    JSON.stringify({
      p: SHARE_ALLOWED_PACKS.has(packId) ? packId : "auto",
      m: SHARE_ALLOWED_MODS.has(modality) ? modality : "markdown",
      t: text,
    })
  );
  const hasCompression = typeof CompressionStream === "function" && typeof DecompressionStream === "function";
  let token = "";
  let maxLen = 800;
  if (hasCompression) {
    try {
      const compressed = await transformBytes(payloadBytes, CompressionStream);
      token = `v1.${bytesToBase64Url(compressed)}`;
      maxLen = 3000;
    } catch {
      token = `v0.${bytesToBase64Url(payloadBytes)}`;
      maxLen = 800;
    }
  } else {
    token = `v0.${bytesToBase64Url(payloadBytes)}`;
    maxLen = 800;
  }
  if (`#share=${token}`.length > maxLen) {
    throw new Error("SHARE_TOO_LONG");
  }
  return token;
}

async function decodeShareHash(hash) {
  const raw = String(hash || "").replace(/^#share=/, "");
  let payloadBytes;
  if (raw.startsWith("v1.")) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("NO_DECOMPRESSION");
    }
    const compressed = base64UrlToBytes(raw.slice(3));
    payloadBytes = await transformBytes(compressed, DecompressionStream);
  } else if (raw.startsWith("v0.")) {
    payloadBytes = base64UrlToBytes(raw.slice(3));
  } else {
    throw new Error("INVALID_VERSION");
  }
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes));
  if (!parsed || typeof parsed.t !== "string") {
    throw new Error("INVALID_PAYLOAD");
  }
  return {
    pack: SHARE_ALLOWED_PACKS.has(parsed.p) ? parsed.p : "auto",
    modality: SHARE_ALLOWED_MODS.has(parsed.m) ? parsed.m : "markdown",
    text: parsed.t,
  };
}

function showShareBanner(message, isError = false) {
  const appliedEl = document.getElementById("wb-applied-banner");
  if (!appliedEl) return;
  appliedEl.hidden = false;
  appliedEl.classList.toggle("is-error", Boolean(isError));
  appliedEl.textContent = message;
}

async function applyShareHash(hash) {
  try {
    const decoded = await decodeShareHash(hash);
    uploadSeq += 1;
    clearWorkbenchTransientPanels();
    clearSpecimenStateReset();
    binaryAuditResult = null;
    lastUploadedFile = null;
    lastUploadedBinaryBuffer = null;
    uploadedOriginalText = null;
    customRuleTitle = "shared-draft";
    currentPackId = decoded.pack;
    currentModality = decoded.modality;
    const ext = decoded.modality === "markdown" ? "md" : decoded.modality;
    currentFilename = `shared-draft.${ext}`;
    activeSpecimen = {
      id: "shared-draft",
      pack: decoded.pack,
      filename: currentFilename,
      modality: decoded.modality,
      bad: decoded.text,
      trap: null,
      good: null,
    };
    baselineText = decoded.text;
    currentText = decoded.text;
    focusedFindingIdx = -1;
    const packSelect = document.getElementById("pack-select");
    if (packSelect) packSelect.value = decoded.pack;
    setViewMode("proof");
    updateSpecimenRailSelection();
    renderWorkbench();
    showShareBanner(
      currentLang === "zh"
        ? "已从分享链接载入稿件（仅在当前标签页离线打开，服务器不保存你的文字）。"
        : "Loaded shared draft locally in this tab. Text stays in the URL hash and is not stored on our server."
    );
    document.getElementById("workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showShareBanner(
      currentLang === "zh"
        ? "这个分享链接不完整或已损坏，无法还原稿件。"
        : "This share link is incomplete or corrupted and could not be decoded.",
      true
    );
  }
}

async function handleWorkbenchHash() {
  const hash = window.location.hash || "";
  if (hash.startsWith("#try=")) {
    const ruleId = decodeURIComponent(hash.slice("#try=".length)).trim();
    if (ruleId && findRuleById(ruleId)) {
      loadRuleInWorkbench(ruleId);
      return;
    }
  }
  if (hash.startsWith("#share=")) {
    await applyShareHash(hash);
    return;
  }
  handleRuleHash();
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
  const dict = I18N[currentLang] || I18N.zh;
  if (dict["page.title"]) document.title = dict["page.title"];
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] !== undefined) el.textContent = dict[key];
  });

  // Update struck opener text safely without touching the sibling SVG path
  const strikeEl = document.getElementById("hero-strike-text");
  if (strikeEl) strikeEl.textContent = dict["lead.strike"];

  // Switch demo WebP, GIFs, and reduced-motion posters strictly between ZH and EN assets (v2)
  const demoAlts = {
    zh: {
      "proof-cycle": "dislop 检查上线说明：标出 AI 寒暄与空话、拦下二阶口号、改干净后退出码 0",
      "cli-check": "dislop CLI 本地离线检查：原稿退出码 1，清掉套话后复检退出码 0",
      "workbench-live": "dislop.com 浏览器离线工作台真实操作：点击切换原稿、二阶 AI 味与改干净版本",
      "ui-slop": "网页组件模板味排查：标出紫粉渐变、胶囊标签墙与空链接，改为 1px 白底版式",
      "deck-office": "dislop 检查 quarterly-review.pptx：标出裸 Markdown、字墙、缩排和过程标题后改为结论页",
      "agent-workflow": "Agent 闭环工作流：加载 SKILL.md、增量门禁退出码 1、修复后复检退出码 0",
    },
    en: {
      "proof-cycle": "dislop 3-state proof: flagging chatbot artifact, catching 2nd-order slogan, passing with exit 0",
      "cli-check": "dislop CLI offline check: exit code 1 on draft and exit code 0 after cleanup",
      "workbench-live": "dislop.com browser workbench capture: checking draft, 2nd-order slop, and clean copy",
      "ui-slop": "UI template slop check: flagging AI gradient, pill wall, and dead href='#' control",
      "deck-office": "dislop auditing quarterly-review.pptx for markdown leaks, word walls, autofit shrink, and process titles",
      "agent-workflow": "Agent workflow loop: loading SKILL.md, PR diff gate exit 1, and passing re-check with exit 0",
    },
  };
  document.querySelectorAll("source[data-demo-poster]").forEach((srcEl) => {
    const slug = srcEl.getAttribute("data-demo-poster");
    if (!slug) return;
    srcEl.srcset = siteAssetUrl(`assets/demos/${slug}-${currentLang}-v2-poster.png`);
  });
  document.querySelectorAll("source[data-demo-webp]").forEach((srcEl) => {
    const slug = srcEl.getAttribute("data-demo-webp");
    if (!slug) return;
    const isPaused = pausedDemoSlugs.has(slug);
    srcEl.srcset = isPaused
      ? siteAssetUrl(`assets/demos/${slug}-${currentLang}-v2-poster.png`)
      : siteAssetUrl(`assets/demos/${slug}-${currentLang}-v2.webp`);
  });
  document.querySelectorAll("img[data-demo-gif]").forEach((imgEl) => {
    const slug = imgEl.getAttribute("data-demo-gif");
    if (!slug) return;
    const isPaused = pausedDemoSlugs.has(slug);
    imgEl.src = isPaused
      ? siteAssetUrl(`assets/demos/${slug}-${currentLang}-v2-poster.png`)
      : siteAssetUrl(`assets/demos/${slug}-${currentLang}-v2.gif`);
    if (demoAlts[currentLang]?.[slug]) imgEl.alt = demoAlts[currentLang][slug];
  });
  document.querySelectorAll("[data-demo-toggle]").forEach((btn) => {
    const slug = btn.getAttribute("data-demo-toggle");
    if (!slug) return;
    const isPaused = pausedDemoSlugs.has(slug);
    btn.setAttribute("aria-pressed", String(isPaused));
    btn.setAttribute("aria-label", isPaused ? dict["demos.play"] : dict["demos.pause"]);
  });

  // Footer agent hint with link
  const agentHintEl = document.querySelector("[data-i18n='footer.agentHint']");
  if (agentHintEl) {
    const llmsHref = escapeHtml(siteAssetUrl("llms.txt"));
    agentHintEl.innerHTML =
      currentLang === "zh"
        ? `给 Agent 读的话，从 <a href="${llmsHref}">/llms.txt</a> 开始。`
        : `For agents, start at <a href="${llmsHref}">/llms.txt</a>.`;
  }

  // Update GitHub Awesome & Roadmap links to match language
  const ghLink = document.getElementById("awesome-gh-link");
  if (ghLink) {
    ghLink.href =
      currentLang === "zh"
        ? "https://github.com/dislop-ai/dislop/blob/main/awesome/README.zh-CN.md"
        : "https://github.com/dislop-ai/dislop/tree/main/awesome";
  }
  const awesomeHref = currentLang === "zh" ? siteAssetUrl("zh/awesome/") : siteAssetUrl("awesome/");
  document.querySelectorAll('a[href="./awesome/"], a[href="../zh/awesome/"], a[href="/awesome/"], a[href="/zh/awesome/"]').forEach((aEl) => {
    aEl.setAttribute("href", awesomeHref);
  });
  const guidesBase = currentLang === "zh" ? siteAssetUrl("zh/guides/") : siteAssetUrl("guides/");
  const navGuidesLink = document.getElementById("nav-guides-link");
  if (navGuidesLink) navGuidesLink.href = guidesBase;
  document.querySelectorAll("[data-guide-slug]").forEach((aEl) => {
    aEl.setAttribute("href", `${guidesBase}${aEl.getAttribute("data-guide-slug")}/`);
  });
  const guidesHomeAll = document.getElementById("guides-home-all");
  if (guidesHomeAll) guidesHomeAll.href = guidesBase;
  const footerGuidesLink = document.getElementById("footer-guides-link");
  if (footerGuidesLink) footerGuidesLink.href = guidesBase;
  const footerRulesLink = document.getElementById("footer-rules-link");
  if (footerRulesLink) footerRulesLink.href = currentLang === "zh" ? siteAssetUrl("zh/rules/") : siteAssetUrl("rules/");
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
  const demoTablistEl = document.querySelector('#demos [role="tablist"]');
  if (demoTablistEl) {
    demoTablistEl.setAttribute("aria-label", currentLang === "zh" ? "选择演示场景" : "Choose a demo scene");
  }
  const langToggleBtn = document.getElementById("lang-toggle");
  if (langToggleBtn) {
    langToggleBtn.setAttribute("lang", currentLang === "zh" ? "en" : "zh-CN");
  }
  const tokEmailEl = document.getElementById("token-email-input");
  if (tokEmailEl) {
    tokEmailEl.placeholder =
      currentLang === "zh" ? "输入你的常用邮箱，例如 you@company.com" : "Enter your email, e.g. you@company.com";
  }
  const tokOtpEl = document.getElementById("token-otp-input");
  if (tokOtpEl) {
    tokOtpEl.placeholder =
      currentLang === "zh" ? "输入邮件里的 6 位数字验证码" : "Enter 6-digit code from email";
  }
  const legacyKeyEl = document.getElementById("legacy-key-input");
  if (legacyKeyEl) {
    legacyKeyEl.placeholder = "dslp_...";
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
  document.documentElement.removeAttribute("data-lang-hydrating");
}

function syncAiButtonsForBinary() {
  const revBtn = document.getElementById("btn-ai-review");
  const desBtn = document.getElementById("btn-ai-deslop");
  const tcWrap = document.getElementById("office-track-changes-wrap");
  const isZh = currentLang === "zh";
  const dict = I18N[currentLang] || I18N.zh;
  const isBin = Boolean(binaryAuditResult);
  const isOffice = Boolean(isBin && (currentModality === "docx" || currentModality === "pptx") && lastUploadedBinaryBuffer);
  if (tcWrap) {
    tcWrap.hidden = !(isOffice && currentModality === "docx");
  }

  if (isOffice) {
    const kindLabel = currentModality === "pptx" ? "PPT" : "Word";
    if (revBtn) {
      if (!cloudBusy) revBtn.disabled = false;
      revBtn.removeAttribute("title");
      revBtn.textContent = isZh ? `云端审校 ${kindLabel}（2 额度）` : `Cloud Review ${kindLabel} (2 credits)`;
    }
    if (desBtn) {
      if (!cloudBusy) desBtn.disabled = false;
      desBtn.removeAttribute("title");
      desBtn.textContent = isZh ? `原排版改写 ${kindLabel}（3 额度）` : `Layout-safe Rewrite ${kindLabel} (3 credits)`;
    }
    return;
  }

  if (revBtn) revBtn.textContent = dict["ai.reviewBtn"] || (isZh ? "云端审校（1 额度）" : "Cloud Review (1 credit)");
  if (desBtn) desBtn.textContent = dict["ai.deslopBtn"] || (isZh ? "云端改写（2 额度）" : "Cloud Rewrite (2 credits)");

  const tip = isZh
    ? "PDF / 图片仅在当前浏览器内存离线检查；上传 .docx / .pptx 或切回文本/HTML 可用云端 AI。"
    : "PDF and image files run offline only; open a .docx / .pptx or text/HTML draft to use Cloud AI.";
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
const ENTRY_SOURCE_KEY = "dislop_entry_source_v1";
const PENDING_WB_KEY = "dislop_pending_wb_v1";
let cloudBusy = false;
let aiReqSeq = 0;
let preRewriteDraft = null;
let pendingCloudAction = null;
let otpResendTimer = null;
let modalOtpResendTimer = null;
let lastUploadedBinaryBuffer = null;
let cloudSessionState = {
  loaded: false,
  authenticated: false,
  authMethod: null,
  account: null,
  methods: { emailOtp: true, google: false, github: false, magicLink: true },
  billing: { enabled: false, portalEnabled: false },
  pendingLink: null,
};
let activeHubTab = "plan";
let cachedHubData = { accountId: null, keys: null, apps: null, voices: null, usage: null, billingHistory: null };
let lastAuthModalTrigger = null;
let lastVisibilitySessionSyncMs = 0;

function resetCachedHubData(accountId = cloudSessionState.account?.id || null) {
  cachedHubData = { accountId, keys: null, apps: null, voices: null, usage: null, billingHistory: null };
}

function buildCurrentPageReturnTo(anchor = "cloud-token-box") {
  try {
    const u = new URL(window.location.href);
    const keep = new URLSearchParams();
    const authQ = u.searchParams.get("auth");
    const nextQ = u.searchParams.get("next");
    if (authQ === "link" || authQ === "github-link") keep.set("auth", authQ);
    if (nextQ && /^\/(?!\/)/.test(nextQ)) keep.set("next", nextQ);
    const qs = keep.toString();
    const hashPart = anchor ? `#${String(anchor).replace(/^#+/, "")}` : "";
    const defaultPath = currentLang === "zh" ? siteAssetUrl("zh/") : SITE_ROOT_PATH;
    return `${u.pathname || defaultPath}${qs ? `?${qs}` : ""}${hashPart}`;
  } catch {
    return `${currentLang === "zh" ? "/zh/" : "/"}#${anchor}`;
  }
}

function captureEntrySource() {
  try {
    const existing = window.sessionStorage?.getItem(ENTRY_SOURCE_KEY);
    if (existing) return existing;
    const params = new URLSearchParams(window.location.search || "");
    let src = String(params.get("utm_source") || params.get("source") || "").trim().toLowerCase();
    if (!src && document.referrer) {
      try {
        const refHost = new URL(document.referrer).hostname.toLowerCase();
        if (refHost && refHost !== "dislop.com" && refHost !== "www.dislop.com" && refHost !== window.location.hostname) {
          if (refHost.includes("github.")) src = "github";
          else if (refHost === "t.co" || refHost === "x.com" || refHost === "twitter.com") src = "x";
          else if (refHost.includes("google.")) src = "google";
          else if (refHost.includes("bing.")) src = "bing";
          else src = refHost.slice(0, 32);
        }
      } catch {
        // ignore bad referrer URL
      }
    }
    const clean = (src || "workbench").replace(/[^a-z0-9._:/-]+/g, "").slice(0, 32) || "workbench";
    window.sessionStorage?.setItem(ENTRY_SOURCE_KEY, clean);
    return clean;
  } catch {
    return "workbench";
  }
}

function getEntrySource() {
  return captureEntrySource();
}

function loadSavedVoiceProfile() {
  try {
    const raw = safeGetStorage(VOICE_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.tone) return null;
    if (parsed.sourceAccountId) {
      const curId = cloudSessionState.authenticated ? cloudSessionState.account?.id : null;
      if (!curId || parsed.sourceAccountId !== curId) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

function stripVoiceLocalMeta(profile) {
  if (!profile || typeof profile !== "object") return null;
  const { sourceAccountId: _sa, sourceVoiceId: _sv, ...rest } = profile;
  return rest;
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
  const active = getActiveCloudAccount();
  const outBox = document.getElementById("voice-output-box");
  const btn = document.getElementById("btn-voice-extract");
  if (!outBox) return;

  if (!active) {
    pendingCloudAction = "voice_extract";
    outBox.hidden = false;
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0 0 8px;">${
      isZh ? "云端 AI 提炼需要先用邮箱验证码登录（也可直接点旁边「本地统计文风」0 联网提取）。" : "Sign in with a 6-digit email code for Cloud AI extraction, or click 'Local style stats' right beside it."
    }</p><button type="button" id="btn-voice-open-signin" class="btn-primary" style="min-height:30px;padding:5px 12px;font-size:0.8rem;">${
      isZh ? "立即验证码登录" : "Sign in now"
    }</button>`;
    document.getElementById("btn-voice-open-signin")?.addEventListener("click", () => {
      openAuthModal({
        action: "voice_extract",
        reasonMsg: isZh
          ? "登录后立刻提炼个人写作风格并保存到云端账号（每月 30 免费额度）。"
          : "Sign in to extract your personal style and save it to your account (30 free credits/mo).",
      });
    });
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
    const resp = await fetch(
      "/api/v1/voice/extract",
      buildCloudFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          samples,
          lang: isZh ? "zh" : "en",
          source: getEntrySource(),
          ...(active.mode === "session" ? { save: true } : {}),
        },
      })
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (data.error === "account_changed" || resp.status === 401) {
        resetCachedHubData(null);
        await refreshCloudSession();
      }
      if (data.error === "voice_limit_exceeded" || data.error === "insufficient_credits") {
        openQuotaUpgradePanel(data.message || "", data.error);
      }
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</p>`;
      return;
    }
    updateCreditsFromBilling(data.billing);
    const savedVoiceId = data.savedVoice?.voiceId || data.savedVoice?.id || null;
    saveVoiceProfile(
      active.mode === "session" && active.id
        ? {
            ...data.profile,
            sourceAccountId: active.id,
            ...(savedVoiceId ? { sourceVoiceId: savedVoiceId } : {}),
          }
        : data.profile
    );
    cachedHubData.usage = null;
    cachedHubData.billingHistory = null;
    if (data.savedVoice) cachedHubData.voices = null;
    const habitsStr = formatVoiceHabits(data.profile?.sentenceHabits, isZh);
    outBox.hidden = false;
    outBox.innerHTML = `<div><strong>${
      data.savedVoice
        ? isZh
          ? "个人文风已保存到账号（工作台与远程 MCP 均自动可用）："
          : "Personal voice saved to your account (active in workbench & Remote MCP):"
        : isZh
          ? "个人文风已保存，后续「云端改写」将自动套用："
          : "Personal voice saved and wired into Cloud Rewrite:"
    }</strong></div>
      <div style="margin-top:4px;">${escapeHtmlSafe(data.profile?.tone || "")}${habitsStr ? ` · ${escapeHtmlSafe(habitsStr)}` : ""}</div>`;
    renderSavedVoiceState();
    if (active.mode === "session" && typeof renderAccountHub === "function") renderAccountHub();
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

function getActiveCloudAccount() {
  if (cloudSessionState.authenticated && cloudSessionState.account) {
    return { mode: "session", ...cloudSessionState.account };
  }
  const saved = loadSavedCloudAccount();
  if (saved?.token) {
    return {
      mode: "token",
      token: saved.token,
      email: saved.email || "",
      plan: saved.plan || "free",
      totalRemaining: saved.remaining ?? saved.monthlyQuota ?? 30,
      monthlyQuota: saved.monthlyQuota ?? 30,
      monthlyUsed: Math.max(0, (saved.monthlyQuota ?? 30) - (saved.remaining ?? saved.monthlyQuota ?? 30)),
      bonusCredits: 0,
    };
  }
  return null;
}

function isCloudSignedIn() {
  return Boolean(getActiveCloudAccount());
}

function buildSessionMutationHeaders(extra = {}) {
  const hdrs = { ...extra };
  if (cloudSessionState.authenticated && cloudSessionState.account?.id) {
    hdrs["X-Dislop-Account-Id"] = cloudSessionState.account.id;
  }
  return hdrs;
}

function buildCloudFetchInit({ method = "POST", headers = {}, body = undefined } = {}) {
  const hdrs = { ...headers };
  if (cloudSessionState.authenticated && cloudSessionState.account?.id && !hdrs.Authorization) {
    hdrs["X-Dislop-Account-Id"] = cloudSessionState.account.id;
  } else if (!cloudSessionState.authenticated) {
    const saved = loadSavedCloudAccount();
    if (saved?.token && !hdrs.Authorization) {
      hdrs.Authorization = `Bearer ${saved.token}`;
    }
  }
  const init = {
    method,
    headers: hdrs,
    credentials: "same-origin",
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return init;
}

function syncCloudOAuthButtons() {
  const oauthRow = document.getElementById("cloud-google-row");
  const ghBtn = document.getElementById("cloud-github-btn");
  const gBtn = document.getElementById("cloud-google-btn");
  const isSessionAuthed = Boolean(cloudSessionState.authenticated && cloudSessionState.account);
  const hasGh = Boolean(cloudSessionState.methods?.github);
  const hasG = Boolean(cloudSessionState.methods?.google);
  const retParam = encodeURIComponent(buildCurrentPageReturnTo("cloud-token-box"));
  if (ghBtn) {
    ghBtn.hidden = !hasGh;
    ghBtn.href = `/api/v1/auth/github/start?return=${retParam}`;
    ghBtn.style.order = currentLang === "zh" ? "1" : "2";
  }
  if (gBtn) {
    gBtn.hidden = !hasG;
    gBtn.href = `/api/v1/auth/google/start?return=${retParam}`;
    gBtn.style.order = currentLang === "zh" ? "2" : "1";
  }
  if (oauthRow) {
    oauthRow.hidden = isSessionAuthed || (!hasGh && !hasG);
  }
}

function savePendingWorkbenchIntent(action = pendingCloudAction) {
  if (!action) return;
  try {
    const isCheckout = String(action).startsWith("checkout:");
    const payload = isCheckout
      ? { action, ts: Date.now() }
      : {
          action,
          packId: currentPackId,
          register: currentRegister || "auto",
          modality: currentModality,
          filename: currentFilename,
          isBinary: Boolean(binaryAuditResult),
          isCustom: Boolean(customRuleTitle === "user-draft" || currentText !== baselineText || !lastUploadedFile),
          text: !binaryAuditResult && currentText ? String(currentText).slice(0, 50000) : "",
          voiceSamples:
            action === "voice_extract" ? String(document.getElementById("voice-samples-input")?.value || "").slice(0, 20000) : "",
          ts: Date.now(),
        };
    window.sessionStorage?.setItem(PENDING_WB_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function clearPendingWorkbenchIntent() {
  try {
    window.sessionStorage?.removeItem(PENDING_WB_KEY);
  } catch {
    // ignore
  }
}

async function consumePendingWorkbenchIntent() {
  let raw = "";
  try {
    raw = window.sessionStorage?.getItem(PENDING_WB_KEY) || "";
  } catch {
    raw = "";
  }
  if (!raw || !isCloudSignedIn()) return false;
  let intent = null;
  try {
    intent = JSON.parse(raw);
  } catch {
    intent = null;
  }
  if (!intent || !intent.action || !intent.ts || Date.now() - Number(intent.ts) > 15 * 60_000) {
    clearPendingWorkbenchIntent();
    return false;
  }
  if (String(intent.action).startsWith("checkout:")) {
    if (!cloudSessionState.authenticated) return false;
    clearPendingWorkbenchIntent();
    pendingCloudAction = intent.action;
    startPendingCloudContinuation();
    return true;
  }
  clearPendingWorkbenchIntent();
  if (intent.action === "voice_extract" && intent.voiceSamples) {
    const vsInput = document.getElementById("voice-samples-input");
    const voiceDrawer = document.getElementById("voice-drawer");
    if (vsInput) vsInput.value = intent.voiceSamples;
    if (voiceDrawer) voiceDrawer.open = true;
    pendingCloudAction = "voice_extract";
    startPendingCloudContinuation();
    return true;
  }
  if (!intent.isBinary && typeof intent.text === "string" && intent.text.trim()) {
    uploadSeq += 1;
    clearWorkbenchTransientPanels();
    clearSpecimenStateReset();
    binaryAuditResult = null;
    lastUploadedFile = null;
    lastUploadedBinaryBuffer = null;
    uploadedOriginalText = null;
    customRuleTitle = "user-draft";
    currentPackId = PACKS_BY_ID[intent.packId] || intent.packId === "auto" ? intent.packId : "auto";
    currentRegister = intent.register || "auto";
    currentModality = intent.modality || inferPastedTextModality(intent.text, currentPackId);
    currentFilename = intent.filename || `pasted-draft.${currentModality === "markdown" ? "md" : currentModality}`;
    activeSpecimen = {
      id: "user-draft",
      pack: currentPackId,
      filename: currentFilename,
      modality: currentModality,
      bad: intent.text,
      trap: null,
      good: null,
    };
    baselineText = intent.text;
    currentText = intent.text;
    focusedFindingIdx = -1;
    const packSel = document.getElementById("pack-select");
    if (packSel) packSel.value = currentPackId;
    const regSel = document.getElementById("register-select");
    if (regSel) regSel.value = currentRegister;
    setViewMode("proof");
    updateSpecimenRailSelection();
    renderWorkbench();
    document.getElementById("workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
    pendingCloudAction = intent.action;
    startPendingCloudContinuation();
    return true;
  }
  return false;
}

async function refreshCloudSession() {
  try {
    const resp = await fetch("/api/v1/auth/session", { credentials: "same-origin", cache: "no-store" });
    if (!resp.ok) return false;
    const data = await resp.json().catch(() => null);
    if (!data || typeof data !== "object") return false;
    const nextAcctId = data.authenticated && data.account ? data.account.id : null;
    if (cachedHubData.accountId !== nextAcctId) {
      resetCachedHubData(nextAcctId);
    }
    cloudSessionState = {
      loaded: true,
      authenticated: Boolean(data.authenticated && data.account),
      authMethod: data.authMethod || null,
      account: data.account || null,
      methods: data.methods || { emailOtp: true, google: false, github: false, magicLink: true },
      billing: data.billing || { enabled: false, portalEnabled: false },
      pendingLink: data.pendingLink || null,
    };
    if (cloudSessionState.authenticated && cloudSessionState.account?.email) {
      const savedKeyAcct = loadSavedCloudAccount();
      if (savedKeyAcct?.email && savedKeyAcct.email.toLowerCase() !== cloudSessionState.account.email.toLowerCase()) {
        saveCloudAccount(null);
      }
    }
    if (cloudSessionState.pendingLink?.email) {
      const tokenEmailInput = document.getElementById("token-email-input");
      if (tokenEmailInput && !tokenEmailInput.value.trim()) {
        tokenEmailInput.value = cloudSessionState.pendingLink.email;
      }
    }
    syncCloudOAuthButtons();
    renderSavedVoiceState();
    renderCloudAccountState();
    return true;
  } catch {
    return false;
  }
}

async function finalizePendingOAuthLinkIfNeeded() {
  let linkMode = "";
  let rawNext = "";
  try {
    const params = new URLSearchParams(window.location.search || "");
    const raw = params.get("auth") || "";
    if (raw === "link" || raw === "github-link") linkMode = raw;
    rawNext = params.get("next") || "";
  } catch {
    linkMode = "";
    rawNext = "";
  }
  if (!linkMode && cloudSessionState.pendingLink?.provider) {
    linkMode = cloudSessionState.pendingLink.provider === "github" ? "github-link" : "link";
  }
  if (!rawNext && cloudSessionState.pendingLink?.returnTo) {
    rawNext = cloudSessionState.pendingLink.returnTo;
  }
  if (!linkMode || !cloudSessionState.authenticated) return { ok: false, skipped: true };
  const endpoint = linkMode === "github-link" ? "/api/v1/auth/github/link-confirm" : "/api/v1/auth/google/link-confirm";
  const outBox = document.getElementById("token-output-box");
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: buildSessionMutationHeaders({ "Content-Type": "application/json" }),
      credentials: "same-origin",
      body: JSON.stringify({}),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      const url = new URL(window.location.href);
      url.searchParams.delete("auth");
      url.searchParams.delete("next");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      const safeNext =
        rawNext &&
        /^\/(?!\/)/.test(rawNext) &&
        rawNext !== "/" &&
        rawNext !== "/zh/" &&
        !rawNext.startsWith("/#") &&
        !rawNext.startsWith("/zh/#") &&
        !rawNext.startsWith("/?lang=");
      if (safeNext) {
        window.location.assign(rawNext);
        return { ok: true, navigated: true };
      }
      await refreshCloudSession();
      if (outBox) {
        const providerName = linkMode === "github-link" ? "GitHub" : "Google";
        outBox.hidden = false;
        outBox.textContent =
          currentLang === "zh" ? `已完成验证并绑定 ${providerName} 账号。` : `Verified and linked your ${providerName} account.`;
      }
      return { ok: true, navigated: false };
    }
    if (outBox) {
      outBox.hidden = false;
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(
        data.message || (currentLang === "zh" ? "第三方账号绑定未完成，请核对邮箱后重试。" : "Could not complete account linking. Check the email and retry.")
      )}</p>`;
    }
    return { ok: false, error: data.error || "link_failed", message: data.message || "" };
  } catch (err) {
    if (outBox) {
      outBox.hidden = false;
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
    }
    return { ok: false, error: "network_error" };
  }
}

function startPendingCloudContinuation() {
  const act = pendingCloudAction;
  pendingCloudAction = null;
  clearPendingWorkbenchIntent();
  if (!act) return;
  if (String(act).startsWith("checkout:")) {
    const rawPlan = String(act).slice("checkout:".length) || "pro";
    startBillingCheckout(rawPlan);
  } else if (act === "voice_extract") {
    handleVoiceExtractClick();
  } else if (act === "review" || act === "deslop") {
    runCloudAction(act);
  }
}

async function startBillingCheckout(planKey = "pro", { seats = 2, triggerBtn = null } = {}) {
  const isZh = currentLang === "zh";
  const active = getActiveCloudAccount();
  if (!active || active.mode !== "session") {
    openAuthModal({
      action: `checkout:${planKey}`,
      reasonMsg: isZh
        ? "请先用邮箱验证码、Google 或 GitHub 登录，登录后会自动继续开通方案。"
        : "Sign in first with an email code, Google, or GitHub to continue directly to checkout.",
    });
    return;
  }
  if (!cloudSessionState.billing?.enabled) {
    const wlSelect = document.getElementById("wl-plan-select");
    const wlEmail = document.getElementById("wl-email-input");
    if (wlSelect) wlSelect.value = planKey === "pro_yearly" ? "pro" : planKey;
    if (wlEmail && active.email && !wlEmail.value.trim()) wlEmail.value = active.email;
    document.getElementById("cloud-waitlist-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (triggerBtn) triggerBtn.disabled = true;
  const outBox = document.getElementById("token-output-box");
  if (outBox) {
    outBox.hidden = false;
    outBox.textContent = isZh ? "正在打开 Stripe 安全结账页…" : "Opening secure Stripe Checkout...";
  }
  try {
    const resp = await fetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: buildSessionMutationHeaders({ "Content-Type": "application/json" }),
      credentials: "same-origin",
      body: JSON.stringify({
        plan: planKey,
        seats: planKey === "team" ? Math.max(1, Number(seats) || 2) : 1,
        lang: isZh ? "zh" : "en",
        returnTo: buildCurrentPageReturnTo("cloud-token-box"),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.url) {
      if (data.error === "account_changed" || resp.status === 401) {
        await refreshCloudSession();
      }
      if (outBox) {
        outBox.hidden = false;
        outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</p>`;
      }
      return;
    }
    window.location.assign(data.url);
  } catch (err) {
    if (outBox) {
      outBox.hidden = false;
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
    }
  } finally {
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

async function openBillingPortal(triggerBtn = null) {
  if (triggerBtn) triggerBtn.disabled = true;
  const outBox = document.getElementById("token-output-box");
  try {
    const resp = await fetch("/api/v1/billing/portal", {
      method: "POST",
      headers: buildSessionMutationHeaders({ "Content-Type": "application/json" }),
      credentials: "same-origin",
      body: JSON.stringify({ returnTo: buildCurrentPageReturnTo("cloud-token-box") }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.url) {
      if (data.error === "account_changed" || resp.status === 401) {
        await refreshCloudSession();
      }
      if (outBox) {
        outBox.hidden = false;
        outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</p>`;
      }
      return;
    }
    window.location.assign(data.url);
  } catch (err) {
    if (outBox) {
      outBox.hidden = false;
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
    }
  } finally {
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

function syncBillingSurfaceUi() {
  const isZh = currentLang === "zh";
  const billingLive = Boolean(cloudSessionState.billing?.enabled);
  const skus = cloudSessionState.billing?.availableSkus || {};
  const hasSku = (k) => skus[k] !== false;
  const paidActionsEl = document.getElementById("pricing-paid-actions");
  const wlHeading = document.getElementById("cloud-wl-heading");
  const wlDesc = document.getElementById("cloud-wl-desc");
  const selfServeStrip = document.getElementById("cloud-self-serve-strip");

  if (paidActionsEl) {
    if (billingLive) {
      const creditsFirst = isZh && hasSku("credits");
      const btnPro = hasSku("pro")
        ? `<button type="button" class="${creditsFirst ? "ctrl-btn" : "btn-primary"}" ${
            creditsFirst ? "" : 'style="min-height:32px;padding:6px 12px;font-size:0.8rem;"'
          } data-checkout-plan="pro">${isZh ? "开通 Pro · $12/月" : "Get Pro · $12/mo"}</button>`
        : "";
      const btnCredits = hasSku("credits")
        ? `<button type="button" class="${creditsFirst ? "btn-primary" : "ctrl-btn"}" ${
            creditsFirst ? 'style="min-height:32px;padding:6px 12px;font-size:0.8rem;"' : ""
          } data-checkout-plan="credits">${isZh ? "买按量包 · $10 / 800 额度" : "Buy 800 cr · $10"}</button>`
        : "";
      paidActionsEl.innerHTML = creditsFirst ? `${btnCredits}${btnPro}` : `${btnPro}${btnCredits}`;
      paidActionsEl.querySelectorAll("[data-checkout-plan]").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          startBillingCheckout(btn.getAttribute("data-checkout-plan") || "pro", { triggerBtn: ev.currentTarget });
        });
      });
    } else {
      const label = I18N[currentLang]?.["price.t3Cta"] || (isZh ? "预约开通通知 ↓" : "Join waitlist ↓");
      paidActionsEl.innerHTML = `<a href="#cloud-waitlist-box" class="ctrl-btn" id="pricing-t3-cta" data-i18n="price.t3Cta">${escapeHtmlSafe(label)}</a>`;
    }
  }

  if (billingLive) {
    if (wlHeading) wlHeading.textContent = isZh ? "自助开通按量包 / Pro · 团队采购咨询" : "Upgrade to Pro or Credit Pack · Team inquiries";
    if (wlDesc) {
      wlDesc.textContent = isZh
        ? "支持 Stripe 银行卡、支付宝与微信支付自助结账；如需多席位对公发票，可在下方留言。"
        : "Instant self-serve checkout via Stripe, or leave a note below for multi-seat invoicing.";
    }
    if (selfServeStrip) {
      const stripItems = isZh
        ? [
            hasSku("credits")
              ? `<button type="button" class="btn-primary" style="min-height:32px;padding:5px 12px;font-size:0.8rem;" data-wl-checkout="credits">按量 800 额度（$10·免月租）</button>`
              : "",
            hasSku("pro")
              ? `<button type="button" class="${hasSku("credits") ? "ctrl-btn ctrl-btn-sm" : "btn-primary"}" data-wl-checkout="pro">Pro 月付（$12）</button>`
              : "",
            hasSku("pro_yearly") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-wl-checkout="pro_yearly">Pro 年付（$108·省25%）</button>` : "",
            hasSku("team") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-wl-checkout="team">Team（$29/席位）</button>` : "",
          ]
        : [
            hasSku("pro")
              ? `<button type="button" class="btn-primary" style="min-height:32px;padding:5px 12px;font-size:0.8rem;" data-wl-checkout="pro">Pro Monthly ($12)</button>`
              : "",
            hasSku("pro_yearly") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-wl-checkout="pro_yearly">Pro Annual ($108)</button>` : "",
            hasSku("credits") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-wl-checkout="credits">800 Credits ($10)</button>` : "",
            hasSku("team") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-wl-checkout="team">Team ($29/seat)</button>` : "",
          ];
      const stripHtml = stripItems.filter(Boolean).join("");
      selfServeStrip.hidden = !stripHtml;
      selfServeStrip.innerHTML = stripHtml;
      selfServeStrip.querySelectorAll("[data-wl-checkout]").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          startBillingCheckout(btn.getAttribute("data-wl-checkout") || "pro", { triggerBtn: ev.currentTarget });
        });
      });
    }
  } else {
    if (wlHeading) wlHeading.textContent = I18N[currentLang]?.["cloud.wlTitle"] || (isZh ? "预约 Pro / 按量包 / Team" : "Join Pro / Credit Pack / Team waitlist");
    if (wlDesc) {
      wlDesc.textContent =
        I18N[currentLang]?.["cloud.wlDesc"] ||
        (isZh ? "自助支付还没上线。留下邮箱和想用的方案，上线后通知你。" : "Self-serve billing isn't live yet. Leave your email and preferred plan, and we'll notify you when it opens.");
    }
    if (selfServeStrip) {
      selfServeStrip.hidden = true;
      selfServeStrip.innerHTML = "";
    }
  }
}

function escapeHtmlSafe(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCloudAccountState() {
  syncBillingSurfaceUi();
  const active = getActiveCloudAccount();
  const quotaEl = document.getElementById("ai-quota-label");
  const tokenLinkEl = document.getElementById("ai-token-link");
  const upgradeLinkEl = document.getElementById("ai-upgrade-link");
  const topAcctBtn = document.getElementById("topbar-account-btn");
  const statusEl = document.getElementById("cloud-account-status");
  const authPanelEl = document.getElementById("cloud-auth-panel");
  const hubEl = document.getElementById("cloud-account-hub");
  const googleRow = document.getElementById("cloud-google-row");
  const wlEmailEl = document.getElementById("wl-email-input");
  const isZh = currentLang === "zh";

  if (active) {
    const rem = Number(active.totalRemaining ?? active.monthlyQuota ?? 30);
    const emailLabel = active.email || (isZh ? "已绑定密钥" : "Key active");
    if (topAcctBtn) {
      topAcctBtn.classList.add("is-signed-in");
      const shortMail = emailLabel.includes("@") ? emailLabel.split("@")[0].slice(0, 12) : emailLabel.slice(0, 12);
      topAcctBtn.textContent = isZh ? `${shortMail} · ${rem} 额度` : `${shortMail} · ${rem} cr`;
    }
    if (quotaEl) {
      quotaEl.textContent = isZh
        ? `已登录 ${emailLabel} · 剩余 ${rem} 额度`
        : `Signed in as ${emailLabel} · ${rem} credits left`;
    }
    if (tokenLinkEl) {
      tokenLinkEl.textContent = active.mode === "session" ? (isZh ? "账号与密钥" : "Account & keys") : isZh ? "管理绑定" : "Manage key";
    }
    const nudgeCloudBtn = document.getElementById("wb-nudge-cloud-btn");
    if (nudgeCloudBtn) {
      nudgeCloudBtn.textContent = isZh ? "账号与密钥 ↓" : "Account & keys ↓";
    }
    if (upgradeLinkEl) {
      upgradeLinkEl.hidden = !(active.plan === "free" && rem <= 5);
    }
    if (wlEmailEl && active.email && !wlEmailEl.value.trim()) {
      wlEmailEl.value = active.email;
    }
    syncCloudOAuthButtons();
    if (authPanelEl) authPanelEl.hidden = active.mode === "session";
    if (statusEl) {
      statusEl.hidden = false;
      const modeNote =
        active.mode === "session"
          ? isZh
            ? `已登录 <strong>${escapeHtmlSafe(emailLabel)}</strong>（${escapeHtmlSafe(active.plan || "free")} · 剩余 ${escapeHtmlSafe(rem)} 额度）`
            : `Signed in as <strong>${escapeHtmlSafe(emailLabel)}</strong> (${escapeHtmlSafe(active.plan || "free")} · ${escapeHtmlSafe(rem)} credits left)`
          : isZh
            ? `已绑定密钥 <strong>${escapeHtmlSafe(emailLabel)}</strong>（剩余 ${escapeHtmlSafe(rem)} 额度；用下方验证码或第三方登录后可管理多密钥与订阅）`
            : `Bound key for <strong>${escapeHtmlSafe(emailLabel)}</strong> (${escapeHtmlSafe(rem)} credits left; sign in below for full Account Hub & billing)`;
      statusEl.innerHTML = `<span>${modeNote}</span><span class="quick-actions"><button type="button" id="btn-refresh-cloud-token" class="ctrl-btn ctrl-btn-sm">${isZh ? "刷新额度" : "Refresh"}</button><button type="button" id="btn-clear-cloud-token" class="ctrl-btn ctrl-btn-sm">${
        active.mode === "session" ? (isZh ? "退出登录" : "Sign out") : isZh ? "清除密钥" : "Unbind key"
      }</button></span>`;
      document.getElementById("btn-refresh-cloud-token")?.addEventListener("click", async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          if (active.mode === "session") {
            resetCachedHubData(active.id);
            await refreshCloudSession();
          } else {
            const resp = await fetch("/api/v1/account/me", { headers: { Authorization: `Bearer ${active.token}` } });
            if (resp.status === 401) {
              saveCloudAccount(null);
              renderCloudAccountState();
              return;
            }
            const data = await resp.json().catch(() => ({}));
            const stillSignedIn = loadSavedCloudAccount();
            if (resp.ok && data.account && stillSignedIn && stillSignedIn.token === active.token) {
              saveCloudAccount({
                ...stillSignedIn,
                plan: data.account.plan,
                remaining: data.account.totalRemaining,
                monthlyQuota: data.account.monthlyQuota,
              });
              renderCloudAccountState();
            }
          }
        } catch {
          // keep cached state on transient error
        } finally {
          btn.disabled = false;
        }
      });
      document.getElementById("btn-clear-cloud-token")?.addEventListener("click", async (ev) => {
        const out = document.getElementById("token-output-box");
        if (active.mode === "session") {
          const btn = ev.currentTarget;
          if (btn) btn.disabled = true;
          const loResp = await fetch("/api/v1/auth/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }).catch(() => null);
          if (!loResp || (!loResp.ok && loResp.status !== 401)) {
            if (btn) btn.disabled = false;
            if (out) {
              out.hidden = false;
              out.innerHTML = `<p class="ai-error-msg" style="margin:0;">${
                isZh ? "退出登录未成功，请检查网络后再试。" : "Could not sign out right now. Please check your connection and retry."
              }</p>`;
            }
            return;
          }
          cloudSessionState = { ...cloudSessionState, authenticated: false, authMethod: null, account: null };
        }
        if (loadSavedVoiceProfile()?.sourceAccountId) {
          saveVoiceProfile(null);
          renderSavedVoiceState();
        }
        saveCloudAccount(null);
        resetCachedHubData(null);
        if (out) out.hidden = true;
        renderCloudAccountState();
      });
    }
    if (hubEl) {
      if (active.mode === "session" && typeof renderAccountHub === "function") {
        hubEl.hidden = false;
        renderAccountHub();
      } else {
        hubEl.hidden = true;
        hubEl.innerHTML = "";
      }
    }
  } else {
    if (topAcctBtn) {
      topAcctBtn.classList.remove("is-signed-in");
      topAcctBtn.textContent = I18N[currentLang]?.["nav.signIn"] || (isZh ? "登录" : "Sign in");
    }
    if (quotaEl) {
      quotaEl.textContent =
        I18N[currentLang]?.["ai.anonHint"] ||
        "本地检查免登录 · 云端审校需免费登录（每月 30 额度，同账号可用于远程 MCP）";
    }
    if (tokenLinkEl) {
      tokenLinkEl.textContent = I18N[currentLang]?.["ai.claimLink"] || "登录 / 绑定密钥";
    }
    const nudgeCloudBtn = document.getElementById("wb-nudge-cloud-btn");
    if (nudgeCloudBtn) {
      nudgeCloudBtn.textContent = I18N[currentLang]?.["wb.nudgeCloud"] || (isZh ? "验证码登录 · 30 免费额度" : "Sign in · 30 free credits");
    }
    if (upgradeLinkEl) upgradeLinkEl.hidden = true;
    if (authPanelEl) authPanelEl.hidden = false;
    syncCloudOAuthButtons();
    if (statusEl) {
      statusEl.hidden = true;
      statusEl.innerHTML = "";
    }
    if (hubEl) {
      hubEl.hidden = true;
      hubEl.innerHTML = "";
    }
  }
}

function updateCreditsFromBilling(billing) {
  if (billing?.mode === "account" && billing.account) {
    if (cloudSessionState.authenticated && cloudSessionState.account) {
      cloudSessionState.account = {
        ...cloudSessionState.account,
        ...billing.account,
      };
    }
    const saved = loadSavedCloudAccount();
    if (saved) {
      saveCloudAccount({
        ...saved,
        plan: billing.account.plan,
        remaining: billing.account.totalRemaining,
        monthlyQuota: billing.account.monthlyQuota,
      });
    }
    renderCloudAccountState();
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

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  });
}

function clearSpecimenStateReset() {
  lastUploadedPreviewDataUrl = null;
  lastUploadedBinaryBuffer = null;
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8Array(b64) {
  const clean = String(b64 || "").replace(/^data:[^;]+;base64,/, "").trim();
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function focusDraftLineOrQuote(lineNum, quoteText = "") {
  if (binaryAuditResult) return;
  if (viewMode !== "proof") {
    setViewMode("proof");
    renderWorkbench();
  }
  const proofView = document.getElementById("proof-view");
  if (!proofView) return;
  const rows = proofView.querySelectorAll(".proof-line");
  let targetRow = null;
  if (Number.isFinite(Number(lineNum)) && Number(lineNum) >= 1 && rows[Number(lineNum) - 1]) {
    targetRow = rows[Number(lineNum) - 1];
  } else if (quoteText) {
    const needle = String(quoteText).trim().slice(0, 32);
    for (const r of rows) {
      if ((r.textContent || "").includes(needle)) {
        targetRow = r;
        break;
      }
    }
  }
  if (targetRow) {
    targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
    targetRow.style.outline = "2px solid var(--mark-warn)";
    setTimeout(() => {
      targetRow.style.outline = "";
    }, 1800);
  }
}

async function renderAccountHub() {
  const hubEl = document.getElementById("cloud-account-hub");
  const active = getActiveCloudAccount();
  if (!hubEl || !active || active.mode !== "session") {
    if (hubEl) {
      hubEl.hidden = true;
      hubEl.innerHTML = "";
    }
    return;
  }
  if (cachedHubData.accountId !== active.id) {
    resetCachedHubData(active.id);
  }
  const renderTab = activeHubTab;
  const renderAcctId = active.id;
  const isStaleHubRender = () => activeHubTab !== renderTab || getActiveCloudAccount()?.id !== renderAcctId;
  const isZh = currentLang === "zh";
  const tabDefs = [
    { id: "plan", label: isZh ? "订阅与额度" : "Plan & Quota" },
    { id: "keys", label: isZh ? "MCP 与密钥" : "MCP & Keys" },
    { id: "apps", label: isZh ? "已连应用" : "Connected Apps" },
    { id: "voices", label: isZh ? "云端文风" : "Voice Cards" },
    { id: "security", label: isZh ? "登录与安全" : "Sign-in & Security" },
  ];
  if (!tabDefs.some((t) => t.id === activeHubTab)) {
    activeHubTab = "plan";
  }

  hubEl.hidden = false;
  hubEl.innerHTML = `
    <div class="account-hub-tabs" role="tablist" aria-label="${isZh ? "账号控制台" : "Account hub"}">
      ${tabDefs
        .map(
          (t) =>
            `<button type="button" role="tab" aria-selected="${activeHubTab === t.id ? "true" : "false"}" class="ctrl-btn ctrl-btn-sm ${
              activeHubTab === t.id ? "is-active" : ""
            }" data-hub-tab="${t.id}">${escapeHtmlSafe(t.label)}</button>`
        )
        .join("")}
    </div>
    <div id="account-hub-body"><div class="ai-result-meta">${isZh ? "正在加载…" : "Loading..."}</div></div>
  `;

  hubEl.querySelectorAll("[data-hub-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeHubTab = btn.getAttribute("data-hub-tab") || "plan";
      renderAccountHub();
    });
  });

  const bodyEl = document.getElementById("account-hub-body");
  if (!bodyEl) return;

  if (activeHubTab === "plan") {
    let loadErrMsg = "";
    if (!cachedHubData.usage) {
      const resp = await fetch("/api/v1/account/usage?limit=12", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (resp?.status === 401) {
        await refreshCloudSession();
        return;
      }
      if (resp && resp.ok) {
        const data = await resp.json().catch(() => ({}));
        cachedHubData.usage = Array.isArray(data.items) ? data.items : [];
      } else {
        loadErrMsg = isZh ? "调用明细加载失败，请点上方「刷新额度」重试。" : "Could not load usage history. Click Refresh above to retry.";
      }
    }
    if (!cachedHubData.billingHistory) {
      const bResp = await fetch("/api/v1/billing/history", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (bResp?.status === 401) {
        await refreshCloudSession();
        return;
      }
      if (bResp && bResp.ok) {
        const bData = await bResp.json().catch(() => ({}));
        cachedHubData.billingHistory = Array.isArray(bData.items) ? bData.items : [];
      }
    }
    if (isStaleHubRender()) return;
    const used = Number(active.monthlyUsed || 0);
    const quota = Math.max(1, Number(active.monthlyQuota || 30));
    const pct = Math.min(100, Math.round((used / quota) * 100));
    const bonus = Math.max(0, Number(active.bonusCredits || 0));
    const rem = Number(active.totalRemaining ?? Math.max(0, quota - used) + bonus);
    const planCode = String(active.plan || "free").toLowerCase();
    const sub = active.subscription || {};
    const seats = Math.max(1, Number(sub.seats || active.seats || 1));
    const charCap = Number(active.maxChars || active.maxTextChars || (planCode !== "free" || bonus > 0 ? 50000 : 12000)).toLocaleString("en-US");
    const voiceCap = Number(active.voiceCap || (planCode === "team" ? 50 : planCode === "pro" || bonus > 0 ? 20 : 3));
    const officeCap =
      active.officeExportCap === null || active.officeExportCap === undefined
        ? planCode === "free" && bonus === 0
          ? 2
          : null
        : Number(active.officeExportCap);
    const officeUsed = Math.max(0, Number(active.officeExportsUsed || 0));
    const officeMeta =
      officeCap !== null
        ? isZh
          ? `Office 导出剩余 ${Math.max(0, officeCap - officeUsed)}/${officeCap} 次`
          : `${Math.max(0, officeCap - officeUsed)}/${officeCap} free Office exports left`
        : isZh
          ? "Office 原排版导出不限次"
          : "Unlimited Office exports";
    const billingLive = Boolean(cloudSessionState.billing?.enabled);
    const skus = cloudSessionState.billing?.availableSkus || {};
    const hasSku = (k) => skus[k] !== false;
    const portalReady = Boolean(sub.hasCustomerPortal && (cloudSessionState.billing?.portalEnabled ?? billingLive));
    const periodEndDay = sub.currentPeriodEnd ? String(sub.currentPeriodEnd).slice(0, 10) : "";

    let subStatusHtml = "";
    if (sub.status === "past_due" || sub.status === "unpaid") {
      subStatusHtml = `<div class="hub-warn-banner">${
        isZh
          ? "最近一期订阅扣款未成功，请打开账单门户更新付款方式，以免订阅额度中断。"
          : "Subscription payment is past due. Open the Billing Portal to update your payment method."
      }</div>`;
    } else if (sub.cancelAtPeriodEnd && periodEndDay) {
      subStatusHtml = `<p class="hub-section-note">${
        isZh
          ? `已设为到期不续订，当前订阅权益将保留至 <code>${escapeHtmlSafe(periodEndDay)}</code>。`
          : `Set to cancel at period end. Current plan stays active through <code>${escapeHtmlSafe(periodEndDay)}</code>.`
      }</p>`;
    } else if (sub.status === "active" && periodEndDay) {
      subStatusHtml = `<p class="hub-section-note">${
        isZh
          ? `订阅生效中 · 下次续期日 <code>${escapeHtmlSafe(periodEndDay)}</code>`
          : `Active subscription · renews <code>${escapeHtmlSafe(periodEndDay)}</code>`
      }</p>`;
    }

    let planActionsHtml = "";
    if (billingLive) {
      const creditsPrimary = isZh && bonus === 0 && hasSku("credits");
      const upgradeBtns =
        planCode === "free"
          ? (isZh
              ? [
                  hasSku("credits")
                    ? `<button type="button" class="${creditsPrimary ? "btn-primary" : "ctrl-btn ctrl-btn-sm"}" ${
                        creditsPrimary ? 'style="min-height:30px;padding:4px 12px;font-size:0.79rem;"' : ""
                      } data-hub-checkout="credits">买按量包（$10 / 800 额度）</button>`
                    : "",
                  hasSku("pro")
                    ? `<button type="button" class="${creditsPrimary ? "ctrl-btn ctrl-btn-sm" : "btn-primary"}" ${
                        creditsPrimary ? "" : 'style="min-height:30px;padding:4px 12px;font-size:0.79rem;"'
                      } data-hub-checkout="pro">升级 Pro（$12/月）</button>`
                    : "",
                  hasSku("pro_yearly") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-hub-checkout="pro_yearly">Pro 年付（$108·省25%）</button>` : "",
                  hasSku("team") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-hub-checkout="team">开通 Team（$29/席位）</button>` : "",
                ]
              : [
                  hasSku("pro")
                    ? `<button type="button" class="btn-primary" style="min-height:30px;padding:4px 12px;font-size:0.79rem;" data-hub-checkout="pro">Upgrade to Pro ($12/mo)</button>`
                    : "",
                  hasSku("pro_yearly") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-hub-checkout="pro_yearly">Pro Annual ($108/yr)</button>` : "",
                  hasSku("credits") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-hub-checkout="credits">Buy 800 Credits ($10)</button>` : "",
                  hasSku("team") ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-hub-checkout="team">Start Team ($29/seat)</button>` : "",
                ]
            ).filter(Boolean).join("")
          : hasSku("credits")
            ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-hub-checkout="credits">${
                isZh ? "加购按量包（$10 / 800 额度）" : "Top up 800 Credits ($10)"
              }</button>`
            : "";
      const portalBtn = portalReady
        ? `<button type="button" class="ctrl-btn ctrl-btn-sm" id="hub-open-portal-btn">${
            isZh ? "管理账单与发票" : "Manage billing & invoices"
          }</button>`
        : "";
      planActionsHtml = `<div class="quick-actions" style="margin-top:8px;">${upgradeBtns}${portalBtn}</div>`;
    } else {
      planActionsHtml = `<div class="quick-actions" style="margin-top:8px;">
        <a href="#cloud-waitlist-box" class="ctrl-btn ctrl-btn-sm" style="text-decoration:none;">${
          isZh ? "预约升级 Pro / 按量包 / Team →" : "Reserve Pro, Credit Pack, or Team →"
        }</a>
      </div>`;
    }

    const usageItems = cachedHubData.usage || [];
    const billingItems = cachedHubData.billingHistory || [];
    const billingLedgerHtml =
      billingItems.length === 0
        ? ""
        : `<div class="hub-sub-heading">${isZh ? "账单与充值记录" : "Billing history"}</div>
           <ul class="hub-list">
             ${billingItems
               .slice(0, 6)
               .map((b) => {
                 const amt =
                   typeof b.amountCents === "number" && b.amountCents > 0
                     ? `$${(b.amountCents / 100).toFixed(2)}`
                     : "";
                 const stamp = String(b.ts || "").replace("T", " ").slice(0, 16);
                 return `<li class="hub-list-row">
                   <span><strong>${escapeHtmlSafe(b.summary || b.kind || "billing")}</strong>${amt ? ` · <code>${escapeHtmlSafe(amt)}</code>` : ""}</span>
                   <span style="color:var(--ink-2);">${escapeHtmlSafe(stamp)}</span>
                 </li>`;
               })
               .join("")}
           </ul>`;

    bodyEl.innerHTML = `
      <div class="hub-plan-card">
        <div class="hub-plan-head">
          <span>
            <span class="hub-badge ${planCode !== "free" || bonus > 0 ? "is-paid" : ""}">${escapeHtmlSafe(planCode.toUpperCase())}</span>
            ${planCode === "team" ? `<span style="font-size:0.78rem;color:var(--ink-2);margin-left:6px;">${seats} ${isZh ? "席位" : "seat(s)"}</span>` : ""}
          </span>
          <span style="font-size:0.76rem;color:var(--ink-2);">${
            isZh
              ? `单次上限 ${charCap} 字 · 文风卡 ${voiceCap} 份 · ${officeMeta}`
              : `Up to ${charCap} chars/call · ${voiceCap} voice cards · ${officeMeta}`
          }</span>
        </div>
        ${subStatusHtml}
        <div style="font-size:0.8rem;">
          <strong>${isZh ? `本月已用 ${used} / ${quota} 额度` : `${used} / ${quota} monthly credits used`}</strong>${
            bonus > 0 ? (isZh ? ` · 按量/永久额度 ${bonus}` : ` · ${bonus} permanent credits`) : ""
          } (${isZh ? `可用 ${rem}` : `${rem} available`})
        </div>
        <div class="hub-quota-bar"><div class="hub-quota-fill ${rem <= 5 ? "is-low" : ""}" style="width:${pct}%"></div></div>
        ${planActionsHtml}
      </div>
      ${billingLedgerHtml}
      <div class="hub-sub-heading">${isZh ? "近期云端调用明细" : "Recent cloud calls"}</div>
      ${loadErrMsg ? `<p class="ai-error-msg" style="margin:4px 0;">${escapeHtmlSafe(loadErrMsg)}</p>` : ""}
      <ul class="hub-list">
        ${
          usageItems.length === 0 && !loadErrMsg
            ? `<li class="hub-list-row"><span>${isZh ? "本月还没有云端调用记录。" : "No cloud calls recorded yet."}</span></li>`
            : usageItems
                .map((it) => {
                  const rawTs = String(it.ts || it.at || "").replace("T", " ").slice(0, 16);
                  return `<li class="hub-list-row">
                    <span><code>${escapeHtmlSafe(it.tool || "cloud")}</code> · -${escapeHtmlSafe(it.credits ?? 0)} ${isZh ? "额度" : "cr"}</span>
                    <span style="color:var(--ink-2);">${escapeHtmlSafe(rawTs)}</span>
                  </li>`;
                })
                .join("")
        }
      </ul>
    `;
    bodyEl.querySelectorAll("[data-hub-checkout]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        startBillingCheckout(btn.getAttribute("data-hub-checkout") || "pro", { triggerBtn: ev.currentTarget });
      });
    });
    document.getElementById("hub-open-portal-btn")?.addEventListener("click", (ev) => {
      openBillingPortal(ev.currentTarget);
    });
    return;
  }

  if (activeHubTab === "keys") {
    let keysLoadErr = "";
    if (!cachedHubData.keys) {
      const resp = await fetch("/api/v1/account/keys", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (resp?.status === 401) {
        await refreshCloudSession();
        return;
      }
      if (resp && resp.ok) {
        const data = await resp.json().catch(() => ({}));
        cachedHubData.keys = Array.isArray(data.keys) ? data.keys : [];
      } else {
        keysLoadErr = isZh ? "密钥列表加载失败，请点上方「刷新额度」重试。" : "Could not load API keys. Click Refresh above to retry.";
      }
    }
    if (isStaleHubRender()) return;
    const keys = cachedHubData.keys || [];
    const mcpUrl = `${window.location.origin}/mcp`;
    const cliCmd = `claude mcp add --transport http dislop ${mcpUrl}`;
    const renderKeyRowHtml = (k) => {
      const keyId = k.id || k.keyId || "";
      const capMeta = k.monthlyLimit ? ` · ${isZh ? "月限" : "cap"} ${k.monthlyUsed || 0}/${k.monthlyLimit}` : "";
      const statusMeta = k.revokedAt
        ? isZh
          ? "已撤销"
          : "revoked"
        : k.lastUsedDay
          ? `${isZh ? "最近使用" : "last used"} ${k.lastUsedDay}`
          : isZh
            ? "未使用"
            : "unused";
      return `<li class="hub-list-row">
        <span><strong>${escapeHtmlSafe(k.name || "MCP Key")}</strong> · <code>${escapeHtmlSafe(k.prefix || "dslp_***")}</code>${escapeHtmlSafe(capMeta)} · ${escapeHtmlSafe(statusMeta)}</span>
        ${
          k.revokedAt || !keyId
            ? ""
            : `<button type="button" class="ctrl-btn ctrl-btn-sm" data-revoke-key="${escapeHtmlSafe(keyId)}">${isZh ? "撤销" : "Revoke"}</button>`
        }
      </li>`;
    };
    const wireRevokeKeyBtns = (container) => {
      container.querySelectorAll("[data-revoke-key]").forEach((rBtn) => {
        rBtn.addEventListener("click", async () => {
          const kid = rBtn.getAttribute("data-revoke-key");
          if (!kid) return;
          rBtn.disabled = true;
          const rResp = await fetch(`/api/v1/account/keys/${encodeURIComponent(kid)}`, {
            method: "DELETE",
            headers: buildSessionMutationHeaders(),
            credentials: "same-origin",
          }).catch(() => null);
          if (!rResp || !rResp.ok) {
            rBtn.disabled = false;
            const rData = rResp ? await rResp.json().catch(() => ({})) : {};
            if (rData.error === "account_changed" || rResp?.status === 401) {
              await refreshCloudSession();
              return;
            }
            const outEl = document.getElementById("hub-new-key-out");
            if (outEl) {
              outEl.hidden = false;
              outEl.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(rData.message || (isZh ? "撤销密钥失败，请重试。" : "Could not revoke key. Please retry."))}</p>`;
            }
            return;
          }
          cachedHubData.keys = null;
          renderAccountHub();
        });
      });
    };

    bodyEl.innerHTML = `
      <p class="hub-section-note">${
        isZh
          ? `OAuth 2.1 免密钥端点（Claude Code / ChatGPT / Cursor / VS Code）：<code>${escapeHtmlSafe(mcpUrl)}</code>`
          : `Zero-key OAuth 2.1 endpoint (Claude Code / ChatGPT / Cursor / VS Code): <code>${escapeHtmlSafe(mcpUrl)}</code>`
      }</p>
      <div class="quick-actions" style="margin-bottom:8px;">
        <button type="button" id="hub-copy-mcp-cli" class="ctrl-btn ctrl-btn-sm">${isZh ? "复制 Claude Code 一行接入" : "Copy Claude Code command"}</button>
        <button type="button" id="hub-copy-mcp-url" class="ctrl-btn ctrl-btn-sm">${isZh ? "复制 MCP 地址" : "Copy MCP URL"}</button>
      </div>
      <form id="hub-new-key-form" class="cloud-inline-form">
        <input type="text" id="hub-new-key-name" class="cloud-input" maxlength="40" placeholder="${isZh ? "新建密钥备注（如 Cursor / 笔记本）" : "Key label (e.g. Cursor / Laptop)"}">
        <input type="number" id="hub-new-key-limit" class="cloud-input hub-key-limit" min="1" max="100000" placeholder="${isZh ? "月度限额（选填）" : "Monthly cap (opt)"}">
        <button type="submit" id="hub-new-key-btn" class="btn-primary" style="min-height:32px;padding:4px 12px;font-size:0.79rem;">${isZh ? "生成新密钥" : "Create API key"}</button>
      </form>
      <div id="hub-new-key-out" class="cloud-output-box" ${keysLoadErr ? "" : "hidden"}>${keysLoadErr ? `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(keysLoadErr)}</p>` : ""}</div>
      <ul class="hub-list">
        ${
          keys.length === 0 && !keysLoadErr
            ? `<li class="hub-list-row"><span>${isZh ? "暂未创建长期 API 密钥（用 OAuth 直连无需建密钥）。" : "No API keys yet (OAuth clients don't need one)."}</span></li>`
            : keys.map(renderKeyRowHtml).join("")
        }
      </ul>
    `;
    document.getElementById("hub-copy-mcp-cli")?.addEventListener("click", async (ev) => {
      await copyTextWithFeedback(ev.currentTarget, cliCmd);
    });
    document.getElementById("hub-copy-mcp-url")?.addEventListener("click", async (ev) => {
      await copyTextWithFeedback(ev.currentTarget, mcpUrl);
    });
    document.getElementById("hub-new-key-form")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nameInput = document.getElementById("hub-new-key-name");
      const limitInput = document.getElementById("hub-new-key-limit");
      const outEl = document.getElementById("hub-new-key-out");
      const btn = document.getElementById("hub-new-key-btn");
      const name = String(nameInput?.value || "").trim() || "MCP Key";
      const rawLimit = Number.parseInt(String(limitInput?.value || "").trim(), 10);
      const monthlyLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
      if (btn) btn.disabled = true;
      try {
        const resp = await fetch("/api/v1/account/keys", {
          method: "POST",
          headers: buildSessionMutationHeaders({ "Content-Type": "application/json" }),
          credentials: "same-origin",
          body: JSON.stringify({ name, ...(monthlyLimit ? { monthlyLimit } : {}) }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.apiKey) {
          if (data.error === "account_changed" || resp.status === 401) {
            await refreshCloudSession();
            return;
          }
          if (outEl) {
            outEl.hidden = false;
            outEl.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</p>`;
          }
          return;
        }
        cachedHubData.keys = null;
        if (nameInput) nameInput.value = "";
        if (limitInput) limitInput.value = "";
        const cfgStr = JSON.stringify(data.mcpConfig, null, 2);
        if (outEl) {
          outEl.hidden = false;
          outEl.innerHTML = `<div><strong>${isZh ? "新密钥已生成（仅显示这一次，请立即复制保存）：" : "API key created (shown once—copy it now):"}</strong></div>
            <div style="margin-top:4px;"><code>${escapeHtmlSafe(data.apiKey)}</code></div>
            <pre class="cloud-output-pre">${escapeHtmlSafe(cfgStr)}</pre>
            <div class="quick-actions" style="margin-top:6px;"><button type="button" id="hub-copy-key-cfg" class="ctrl-btn ctrl-btn-sm">${isZh ? "复制 MCP JSON" : "Copy MCP JSON"}</button></div>`;
          document.getElementById("hub-copy-key-cfg")?.addEventListener("click", async (cEv) => {
            await copyTextWithFeedback(cEv.currentTarget, cfgStr);
          });
        }
        const kResp = await fetch("/api/v1/account/keys", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
        if (kResp && kResp.ok) {
          const kData = await kResp.json().catch(() => ({}));
          cachedHubData.keys = Array.isArray(kData.keys) ? kData.keys : [];
          const listEl = bodyEl.querySelector(".hub-list");
          if (listEl) {
            listEl.innerHTML = cachedHubData.keys.map(renderKeyRowHtml).join("");
            wireRevokeKeyBtns(listEl);
          }
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    wireRevokeKeyBtns(bodyEl);
    return;
  }

  if (activeHubTab === "apps") {
    let appsLoadErr = "";
    if (!cachedHubData.apps) {
      const resp = await fetch("/api/v1/account/apps", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (resp?.status === 401) {
        await refreshCloudSession();
        return;
      }
      if (resp && resp.ok) {
        const data = await resp.json().catch(() => ({}));
        cachedHubData.apps = Array.isArray(data.apps) ? data.apps : [];
      } else {
        appsLoadErr = isZh ? "已连应用列表加载失败，请点上方「刷新额度」重试。" : "Could not load connected apps. Click Refresh above to retry.";
      }
    }
    if (isStaleHubRender()) return;
    const apps = cachedHubData.apps || [];
    bodyEl.innerHTML = `
      <p class="hub-section-note">${isZh ? "通过 OAuth 2.1 免密钥授权接入的编辑器或 Agent 会列在这里，可随时断开。" : "Editors and agents authorized via OAuth 2.1 appear here and can be revoked anytime."}</p>
      <div id="hub-apps-feedback" class="ai-result-meta">${appsLoadErr ? `<span class="ai-error-msg">${escapeHtmlSafe(appsLoadErr)}</span>` : ""}</div>
      <ul class="hub-list">
        ${
          apps.length === 0 && !appsLoadErr
            ? `<li class="hub-list-row"><span>${isZh ? "暂无已连接的 OAuth 应用。" : "No connected OAuth apps yet."}</span></li>`
            : apps
                .map((a) => {
                  const appId = a.id || a.grantId || "";
                  const hostNote = a.redirectHost ? ` · <code>${escapeHtmlSafe(a.redirectHost)}</code>` : "";
                  const dayNote = a.lastUsedDay || String(a.createdAt || "").slice(0, 10);
                  return `<li class="hub-list-row">
                    <span><strong>${escapeHtmlSafe(a.clientName || a.clientId || "MCP Client")}</strong>${hostNote} · ${escapeHtmlSafe(dayNote)}</span>
                    ${
                      appId
                        ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-revoke-app="${escapeHtmlSafe(appId)}">${isZh ? "断开授权" : "Disconnect"}</button>`
                        : ""
                    }
                  </li>`;
                })
                .join("")
        }
      </ul>
    `;
    bodyEl.querySelectorAll("[data-revoke-app]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const gid = btn.getAttribute("data-revoke-app");
        if (!gid) return;
        btn.disabled = true;
        const rResp = await fetch(`/api/v1/account/apps/${encodeURIComponent(gid)}`, {
          method: "DELETE",
          headers: buildSessionMutationHeaders(),
          credentials: "same-origin",
        }).catch(() => null);
        if (!rResp || !rResp.ok) {
          btn.disabled = false;
          const rData = rResp ? await rResp.json().catch(() => ({})) : {};
          if (rData.error === "account_changed" || rResp?.status === 401) {
            await refreshCloudSession();
            return;
          }
          const fb = document.getElementById("hub-apps-feedback");
          if (fb) fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(rData.message || (isZh ? "断开失败，请重试。" : "Could not disconnect app. Please retry."))}</span>`;
          return;
        }
        cachedHubData.apps = null;
        renderAccountHub();
      });
    });
    return;
  }

  if (activeHubTab === "voices") {
    let voicesLoadErr = "";
    if (!cachedHubData.voices) {
      const resp = await fetch("/api/v1/account/voices", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (resp?.status === 401) {
        await refreshCloudSession();
        return;
      }
      if (resp && resp.ok) {
        const data = await resp.json().catch(() => ({}));
        cachedHubData.voices = Array.isArray(data.voices) ? data.voices : [];
      } else {
        voicesLoadErr = isZh ? "云端文风列表加载失败，请点上方「刷新额度」重试。" : "Could not load voice cards. Click Refresh above to retry.";
      }
    }
    if (isStaleHubRender()) return;
    const voices = cachedHubData.voices || [];
    const voiceCap = Number(active.voiceCap || (active.plan === "team" ? 50 : active.plan === "pro" ? 20 : 3));
    bodyEl.innerHTML = `
      <p class="hub-section-note">${
        isZh
          ? `已保存 ${voices.length} / ${voiceCap} 份云端文风。在工作台提炼的文风会自动同步给远程 MCP 改稿复用。`
          : `${voices.length} / ${voiceCap} cloud voice cards saved. Profiles extracted in the workbench sync automatically to Remote MCP.`
      }</p>
      <div id="hub-voices-feedback" class="ai-result-meta">${voicesLoadErr ? `<span class="ai-error-msg">${escapeHtmlSafe(voicesLoadErr)}</span>` : ""}</div>
      <ul class="hub-list">
        ${
          voices.length === 0 && !voicesLoadErr
            ? `<li class="hub-list-row"><span>${isZh ? "还没有云端文风卡。可在工作台下方「提取个人文风」抽屉里保存。" : "No saved voice cards yet. Extract one from the workbench style drawer."}</span></li>`
            : voices
                .map(
                  (v) => `<li class="hub-list-row">
                    <span><strong>${escapeHtmlSafe(v.name || "Personal voice")}</strong> (${escapeHtmlSafe(v.lang || "zh")}) · ${escapeHtmlSafe(v.tone || "")}</span>
                    <span class="quick-actions">
                      <button type="button" class="ctrl-btn ctrl-btn-sm" data-use-voice="${escapeHtmlSafe(v.voiceId || v.id)}">${isZh ? "工作台启用" : "Use now"}</button>
                      <button type="button" class="ctrl-btn ctrl-btn-sm" data-del-voice="${escapeHtmlSafe(v.voiceId || v.id)}">${isZh ? "删除" : "Delete"}</button>
                    </span>
                  </li>`
                )
                .join("")
        }
      </ul>
    `;
    bodyEl.querySelectorAll("[data-use-voice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const vid = btn.getAttribute("data-use-voice");
        const found = voices.find((v) => (v.voiceId || v.id) === vid);
        if (found) {
          saveVoiceProfile({
            tone: found.tone,
            sentenceHabits: found.sentenceHabits,
            preferredPatterns: found.preferredPatterns,
            avoidPatterns: found.avoidPatterns,
            sourceAccountId: active.id,
            sourceVoiceId: vid,
          });
          renderSavedVoiceState(true);
          btn.textContent = isZh ? "已启用" : "Active";
        }
      });
    });
    bodyEl.querySelectorAll("[data-del-voice]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const vid = btn.getAttribute("data-del-voice");
        if (!vid) return;
        btn.disabled = true;
        const rResp = await fetch(`/api/v1/account/voices/${encodeURIComponent(vid)}`, {
          method: "DELETE",
          headers: buildSessionMutationHeaders(),
          credentials: "same-origin",
        }).catch(() => null);
        if (!rResp || !rResp.ok) {
          btn.disabled = false;
          const rData = rResp ? await rResp.json().catch(() => ({})) : {};
          if (rData.error === "account_changed" || rResp?.status === 401) {
            await refreshCloudSession();
            return;
          }
          const fb = document.getElementById("hub-voices-feedback");
          if (fb) fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(rData.message || (isZh ? "删除失败，请重试。" : "Could not delete voice card. Please retry."))}</span>`;
          return;
        }
        if (loadSavedVoiceProfile()?.sourceVoiceId === vid) {
          saveVoiceProfile(null);
          renderSavedVoiceState();
        }
        cachedHubData.voices = null;
        renderAccountHub();
      });
    });
    return;
  }

  // Sign-in & Security tab
  const hasGoogleLinked = Boolean(active.googleLinked || active.identities?.google);
  const hasGithubLinked = Boolean(active.githubLinked || active.identities?.github);
  const googleServerReady = Boolean(cloudSessionState.methods?.google);
  const githubServerReady = Boolean(cloudSessionState.methods?.github);
  const deliverableEmail = active.deliverableEmail !== false;
  const connectRet = encodeURIComponent(buildCurrentPageReturnTo("cloud-token-box"));

  const googleRowHtml =
    hasGoogleLinked || googleServerReady
      ? `<li class="hub-list-row">
          <span><strong>Google</strong> · ${hasGoogleLinked ? (isZh ? "已绑定" : "Connected") : isZh ? "未绑定" : "Not connected"}</span>
          ${
            hasGoogleLinked
              ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-unlink-provider="google">${isZh ? "解绑" : "Disconnect"}</button>`
              : `<a href="/api/v1/auth/google/start?intent=link&return=${connectRet}" class="ctrl-btn ctrl-btn-sm" style="text-decoration:none;">${isZh ? "绑定 Google" : "Connect Google"}</a>`
          }
        </li>`
      : "";

  const githubRowHtml =
    hasGithubLinked || githubServerReady
      ? `<li class="hub-list-row">
          <span><strong>GitHub</strong> · ${hasGithubLinked ? (isZh ? "已绑定" : "Connected") : isZh ? "未绑定" : "Not connected"}</span>
          ${
            hasGithubLinked
              ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-unlink-provider="github">${isZh ? "解绑" : "Disconnect"}</button>`
              : `<a href="/api/v1/auth/github/start?intent=link&return=${connectRet}" class="ctrl-btn ctrl-btn-sm" style="text-decoration:none;">${isZh ? "绑定 GitHub" : "Connect GitHub"}</a>`
          }
        </li>`
      : "";

  bodyEl.innerHTML = `
    <p class="hub-section-note">${
      isZh
        ? "同一账号可同时绑定邮箱验证码/一键链接、Google 与 GitHub 登录，配额与云端文风自动共享。"
        : "Link Email code/magic link, Google, and GitHub to the same account so your quota and voice cards stay unified."
    }</p>
    <ul class="hub-list">
      <li class="hub-list-row">
        <span><strong>${isZh ? "邮箱" : "Email"}</strong> · <code>${escapeHtmlSafe(active.email || "")}</code></span>
        <span style="color:var(--ink-2);">${
          deliverableEmail
            ? isZh
              ? "可收验证码与一键链接"
              : "Receives 6-digit codes & links"
            : isZh
              ? "隐私代收邮箱（请保留第三方登录）"
              : "Private noreply address (keep OAuth linked)"
        }</span>
      </li>
      ${googleRowHtml}
      ${githubRowHtml}
    </ul>
    <div id="hub-security-feedback" class="ai-result-meta" style="margin-top:6px;"></div>
    <div class="quick-actions" style="margin-top:10px;">
      <button type="button" id="hub-logout-all-btn" class="ctrl-btn ctrl-btn-sm">${isZh ? "退出所有设备会话" : "Sign out all devices"}</button>
    </div>
    <details class="hub-danger-fold">
      <summary>${isZh ? "永久注销账号与全部记录" : "Delete account permanently"}</summary>
      <p class="hub-section-note" style="margin-top:6px;">${
        isZh
          ? "若有生效中的订阅将同步自动退订，所有 API 密钥、OAuth 授权、云端文风与账单记录会立即清除。"
          : "Any active subscription is canceled immediately, and all API keys, OAuth grants, voice cards, and records are erased."
      }</p>
      <form id="hub-delete-acct-form" class="cloud-inline-form" style="margin-top:8px;">
        <input type="email" id="hub-delete-confirm-email" class="cloud-input" required placeholder="${escapeHtmlSafe(active.email)}" aria-label="${isZh ? "确认邮箱" : "Confirm email"}">
        <button type="submit" id="hub-delete-acct-btn" class="ctrl-btn ctrl-btn-sm">${isZh ? "确认注销" : "Delete account"}</button>
      </form>
      <div id="hub-delete-feedback" class="ai-result-meta" style="margin-top:6px;"></div>
    </details>
  `;

  bodyEl.querySelectorAll("[data-unlink-provider]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const provider = btn.getAttribute("data-unlink-provider");
      const secFb = document.getElementById("hub-security-feedback");
      if (!provider) return;
      btn.disabled = true;
      try {
        const resp = await fetch(`/api/v1/account/identities/${encodeURIComponent(provider)}`, {
          method: "DELETE",
          headers: buildSessionMutationHeaders(),
          credentials: "same-origin",
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          if (data.error === "account_changed" || resp.status === 401) {
            await refreshCloudSession();
            return;
          }
          if (secFb) secFb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</span>`;
          btn.disabled = false;
          return;
        }
        await refreshCloudSession();
      } catch (err) {
        if (secFb) secFb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(err.message || "Network error")}</span>`;
        btn.disabled = false;
      }
    });
  });

  document.getElementById("hub-logout-all-btn")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    const secFb = document.getElementById("hub-security-feedback");
    btn.disabled = true;
    const loResp = await fetch("/api/v1/auth/logout-all", {
      method: "POST",
      credentials: "same-origin",
      headers: buildSessionMutationHeaders({ "Content-Type": "application/json" }),
      body: "{}",
    }).catch(() => null);
    if (!loResp || (!loResp.ok && loResp.status !== 401)) {
      btn.disabled = false;
      const lData = loResp ? await loResp.json().catch(() => ({})) : {};
      if (lData.error === "account_changed") {
        await refreshCloudSession();
        return;
      }
      if (secFb) {
        secFb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(
          lData.message || (isZh ? "退出所有设备失败，请重试。" : "Could not sign out all devices. Please retry.")
        )}</span>`;
      }
      return;
    }
    if (loadSavedVoiceProfile()?.sourceAccountId) {
      saveVoiceProfile(null);
      renderSavedVoiceState();
    }
    cloudSessionState = { ...cloudSessionState, authenticated: false, authMethod: null, account: null };
    saveCloudAccount(null);
    resetCachedHubData(null);
    renderCloudAccountState();
  });
  document.getElementById("hub-delete-acct-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const confirmEmail = String(document.getElementById("hub-delete-confirm-email")?.value || "").trim();
    const fb = document.getElementById("hub-delete-feedback");
    const btn = document.getElementById("hub-delete-acct-btn");
    if (!confirmEmail || !fb) return;
    if (btn) btn.disabled = true;
    try {
      const resp = await fetch("/api/v1/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: buildSessionMutationHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ confirmEmail }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (data.error === "account_changed") {
          await refreshCloudSession();
          return;
        }
        fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</span>`;
        return;
      }
      if (loadSavedVoiceProfile()?.sourceAccountId) {
        saveVoiceProfile(null);
        renderSavedVoiceState();
      }
      cloudSessionState = { ...cloudSessionState, authenticated: false, authMethod: null, account: null };
      saveCloudAccount(null);
      resetCachedHubData(null);
      renderCloudAccountState();
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function closeAuthModal({ clearPending = false } = {}) {
  const backdrop = document.getElementById("auth-modal-backdrop");
  const wasOpen = Boolean(backdrop && !backdrop.hidden);
  if (backdrop) backdrop.hidden = true;
  if (modalOtpResendTimer) {
    clearInterval(modalOtpResendTimer);
    modalOtpResendTimer = null;
  }
  if (clearPending) {
    pendingCloudAction = null;
    clearPendingWorkbenchIntent();
  }
  if (wasOpen && lastAuthModalTrigger && document.contains(lastAuthModalTrigger)) {
    const restoreEl = lastAuthModalTrigger;
    lastAuthModalTrigger = null;
    setTimeout(() => restoreEl.focus?.(), 0);
  }
}

function openAuthModal({ reasonMsg = "", action = null } = {}) {
  const backdrop = document.getElementById("auth-modal-backdrop");
  const titleEl = document.getElementById("auth-modal-title");
  const subEl = document.getElementById("auth-modal-sub");
  const bodyEl = document.getElementById("auth-modal-body");
  if (!backdrop || !bodyEl) {
    openInlineCloudKeyPanelFallback(reasonMsg);
    return;
  }
  if (backdrop.hidden && document.activeElement instanceof HTMLElement) {
    lastAuthModalTrigger = document.activeElement;
  }
  const isZh = currentLang === "zh";
  if (action) pendingCloudAction = action;
  if (modalOtpResendTimer) {
    clearInterval(modalOtpResendTimer);
    modalOtpResendTimer = null;
  }

  const act = pendingCloudAction;
  const isCheckoutAct = typeof act === "string" && act.startsWith("checkout:");
  const titleMap = {
    deslop: isZh ? "登录并立即执行云端改写" : "Sign in & run Cloud Rewrite",
    review: isZh ? "登录并立即执行云端审校" : "Sign in & run Cloud Review",
    voice_extract: isZh ? "登录并提炼个人文风" : "Sign in & extract voice profile",
  };
  if (titleEl) {
    titleEl.textContent = isCheckoutAct
      ? isZh
        ? "登录并继续开通方案"
        : "Sign in & continue to checkout"
      : titleMap[act] || (isZh ? "登录 / 注册 dislop 账号" : "Sign in or join dislop Cloud");
  }
  if (subEl) {
    subEl.textContent = isZh
      ? "登录即自动开通每月 30 免费额度 · 同一账号可用于远程 MCP，草稿不落盘。"
      : "No separate signup step · 30 free monthly credits usable in Remote MCP, zero draft storage.";
  }

  const githubSvg =
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';
  const googleSvg =
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/></svg>';

  const modalReturnAnchor = isCheckoutAct ? "cloud-token-box" : "workbench";
  const modalReturnTo = buildCurrentPageReturnTo(modalReturnAnchor);
  const encodedModalReturn = encodeURIComponent(modalReturnTo);
  const hasGh = Boolean(cloudSessionState.methods?.github);
  const hasG = Boolean(cloudSessionState.methods?.google);
  const githubBtnHtml = hasGh
    ? `<a href="/api/v1/auth/github/start?return=${encodedModalReturn}" class="auth-provider-btn" data-oauth-provider="github">${githubSvg}<span>${
        isZh ? "使用 GitHub 一键继续" : "Continue with GitHub"
      }</span></a>`
    : "";
  const googleBtnHtml = hasG
    ? `<a href="/api/v1/auth/google/start?return=${encodedModalReturn}" class="auth-provider-btn" data-oauth-provider="google">${googleSvg}<span>${
        isZh ? "使用 Google 一键继续" : "Continue with Google"
      }</span></a>`
    : "";

  const otpFormHtml = `
    <form id="auth-modal-otp-form" class="inline-auth-form">
      <label class="inline-auth-label" for="auth-modal-email">${isZh ? "邮箱 6 位验证码（免密直连）" : "Email 6-digit code (passwordless)"}</label>
      <div class="cloud-inline-form">
        <input type="email" id="auth-modal-email" class="cloud-input" required autocomplete="email" placeholder="you@company.com">
        <button type="submit" id="auth-modal-send-btn" class="btn-primary" style="min-height:36px;padding:5px 14px;font-size:0.82rem;">${
          isZh ? "发验证码" : "Send code"
        }</button>
      </div>
      <div id="auth-modal-otp-step" class="cloud-inline-form" hidden>
        <input type="text" id="auth-modal-otp-code" class="cloud-input auth-otp-input" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="••••••" aria-label="${
          isZh ? "6 位验证码" : "6-digit code"
        }">
        <button type="button" id="auth-modal-verify-btn" class="btn-primary" style="min-height:36px;padding:5px 14px;font-size:0.82rem;">${
          isZh ? "验证并继续" : "Verify & continue"
        }</button>
        <button type="button" id="auth-modal-change-email" class="ctrl-btn ctrl-btn-sm">${isZh ? "换邮箱" : "Change"}</button>
      </div>
    </form>`;

  const binaryNoteHtml =
    binaryAuditResult && !isCheckoutAct
      ? `<p class="auth-modal-note">${
          isZh
            ? "提示：当前 Word / PPT 已加载在内存，用上方邮箱验证码可不刷新页面直接继续处理。"
            : "Tip: your Word/PPT file stays loaded in browser RAM when using Email code sign-in below."
        }</p>`
      : "";
  const reasonHtml = reasonMsg ? `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(reasonMsg)}</p>` : "";

  let providersSection = "";
  if (isZh) {
    const bottomProviders = [githubBtnHtml, googleBtnHtml].filter(Boolean).join("");
    providersSection = `
      ${otpFormHtml}
      ${bottomProviders ? `<div class="auth-divider"><span>或用第三方账号</span></div><div class="auth-provider-stack">${bottomProviders}</div>` : ""}`;
  } else {
    const topProviders = [googleBtnHtml, githubBtnHtml].filter(Boolean).join("");
    providersSection = `
      ${topProviders ? `<div class="auth-provider-stack">${topProviders}</div><div class="auth-divider"><span>or use email</span></div>` : ""}
      ${otpFormHtml}`;
  }

  const legacyFoldHtml = isCheckoutAct
    ? ""
    : `<details class="cloud-legacy-fold">
        <summary>${isZh ? "已有 dslp_... 密钥？点此绑定" : "Already have a dslp_... API key?"}</summary>
        <form id="auth-modal-key-form" class="cloud-inline-form" style="margin-top:8px;">
          <input type="text" id="auth-modal-key-input" class="cloud-input" required placeholder="dslp_..." autocomplete="off">
          <button type="submit" id="auth-modal-key-btn" class="ctrl-btn ctrl-btn-sm">${isZh ? "绑定" : "Bind"}</button>
        </form>
      </details>`;

  bodyEl.innerHTML = `
    ${reasonHtml}
    ${binaryNoteHtml}
    ${providersSection}
    <div id="auth-modal-feedback" class="ai-result-meta" aria-live="polite">${
      isZh ? "支持直接粘贴 6 位数字验证码自动登录。" : "Paste your 6-digit code to sign in automatically."
    }</div>
    ${legacyFoldHtml}`;

  backdrop.hidden = false;

  bodyEl.querySelectorAll("[data-oauth-provider]").forEach((link) => {
    link.addEventListener("click", () => {
      savePendingWorkbenchIntent(pendingCloudAction);
    });
  });

  const emailEl = document.getElementById("auth-modal-email");
  if (emailEl && cloudSessionState.pendingLink?.email && !emailEl.value.trim()) {
    emailEl.value = cloudSessionState.pendingLink.email;
  }
  const otpInput = document.getElementById("auth-modal-otp-code");
  const otpStep = document.getElementById("auth-modal-otp-step");
  const sendBtn = document.getElementById("auth-modal-send-btn");
  const verifyBtn = document.getElementById("auth-modal-verify-btn");
  const fb = document.getElementById("auth-modal-feedback");

  const startModalSendCooldown = (seconds) => {
    if (modalOtpResendTimer) clearInterval(modalOtpResendTimer);
    let left = Math.max(1, Math.ceil(Number(seconds) || 60));
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = `${left}s`;
      modalOtpResendTimer = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          clearInterval(modalOtpResendTimer);
          modalOtpResendTimer = null;
          sendBtn.disabled = false;
          sendBtn.textContent = isZh ? "重发验证码" : "Resend";
        } else {
          sendBtn.textContent = `${left}s`;
        }
      }, 1000);
    }
  };

  let modalVerifyInFlight = false;
  const submitModalOtpVerify = async () => {
    if (modalVerifyInFlight) return;
    const email = String(emailEl?.value || "").trim();
    const code = String(otpInput?.value || "").replace(/\D/g, "").slice(0, 6);
    if (!email || code.length !== 6 || !fb) return;
    modalVerifyInFlight = true;
    if (verifyBtn) verifyBtn.disabled = true;
    fb.textContent = isZh ? "正在验证 6 位验证码…" : "Verifying 6-digit code...";
    try {
      const resp = await fetch("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, code, lang: isZh ? "zh" : "en", source: getEntrySource() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.account) {
        fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</span>`;
        return;
      }
      resetCachedHubData(data.account.id);
      cloudSessionState = {
        ...cloudSessionState,
        loaded: true,
        authenticated: true,
        authMethod: "email_otp",
        account: data.account,
      };
      const linkOut = await finalizePendingOAuthLinkIfNeeded();
      if (linkOut?.navigated) return;
      await refreshCloudSession();
      closeAuthModal({ clearPending: false });
      if (pendingCloudAction) {
        startPendingCloudContinuation();
      }
    } catch (err) {
      fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(err.message || "Network error")}</span>`;
    } finally {
      modalVerifyInFlight = false;
      if (verifyBtn) verifyBtn.disabled = false;
    }
  };

  document.getElementById("auth-modal-otp-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = String(emailEl?.value || "").trim();
    if (!email || !fb) return;
    if (pendingCloudAction) savePendingWorkbenchIntent(pendingCloudAction);
    if (sendBtn) sendBtn.disabled = true;
    fb.textContent = isZh ? "正在发送 6 位验证码…" : "Sending 6-digit code...";
    try {
      const resp = await fetch("/api/v1/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, lang: isZh ? "zh" : "en", returnTo: modalReturnTo }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</span>`;
        if (Number(data.retryAfterSec) > 0) {
          startModalSendCooldown(data.retryAfterSec);
        } else if (sendBtn) {
          sendBtn.disabled = false;
        }
        return;
      }
      if (emailEl) emailEl.readOnly = true;
      if (otpStep) otpStep.hidden = false;
      if (otpInput) {
        otpInput.value = "";
        otpInput.focus();
      }
      startModalSendCooldown(60);
      fb.textContent =
        data.message || (isZh ? "验证码已发送，输入或粘贴 6 位数字即可自动登录。" : "Code sent — enter or paste 6 digits to continue.");
    } catch (err) {
      fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(err.message || "Network error")}</span>`;
      if (sendBtn) sendBtn.disabled = false;
    }
  });

  otpInput?.addEventListener("input", () => {
    const cleaned = String(otpInput.value || "").replace(/\D/g, "").slice(0, 6);
    if (otpInput.value !== cleaned) otpInput.value = cleaned;
    if (cleaned.length === 6) {
      submitModalOtpVerify();
    }
  });
  otpInput?.addEventListener("paste", (ev) => {
    const txt = ev.clipboardData?.getData("text/plain") || "";
    const digits = txt.replace(/\D/g, "").slice(0, 6);
    if (digits) {
      ev.preventDefault();
      otpInput.value = digits;
      if (digits.length === 6) {
        submitModalOtpVerify();
      }
    }
  });
  otpInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      submitModalOtpVerify();
    }
  });
  verifyBtn?.addEventListener("click", submitModalOtpVerify);
  document.getElementById("auth-modal-change-email")?.addEventListener("click", () => {
    if (modalOtpResendTimer) {
      clearInterval(modalOtpResendTimer);
      modalOtpResendTimer = null;
    }
    if (emailEl) {
      emailEl.readOnly = false;
      emailEl.focus();
    }
    if (otpStep) otpStep.hidden = true;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = isZh ? "发验证码" : "Send code";
    }
    if (fb) fb.textContent = isZh ? "请输入新的邮箱地址。" : "Enter another email address.";
  });

  document.getElementById("auth-modal-key-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const rawKey = String(document.getElementById("auth-modal-key-input")?.value || "").trim();
    const btn = document.getElementById("auth-modal-key-btn");
    if (!rawKey || !fb) return;
    if (btn) btn.disabled = true;
    fb.textContent = isZh ? "正在校验密钥…" : "Verifying key...";
    try {
      const resp = await fetch("/api/v1/account/me", { headers: { Authorization: `Bearer ${rawKey}` } });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.account) {
        fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(data.message || (isZh ? "密钥无效或已失效" : "Invalid or expired key"))}</span>`;
        return;
      }
      saveCloudAccount({
        token: rawKey,
        email: data.account.email,
        plan: data.account.plan,
        remaining: data.account.totalRemaining,
        monthlyQuota: data.account.monthlyQuota,
      });
      closeAuthModal({ clearPending: false });
      renderCloudAccountState();
      if (pendingCloudAction) {
        startPendingCloudContinuation();
      }
    } catch (err) {
      fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(err.message || "Network error")}</span>`;
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  setTimeout(() => {
    const focusTarget = isZh
      ? document.getElementById("auth-modal-email")
      : document.querySelector("#auth-modal-body [data-oauth-provider]") || document.getElementById("auth-modal-email");
    focusTarget?.focus();
  }, 20);
}

function openInlineCloudKeyPanelFallback(reasonMsg = "") {
  const panel = document.getElementById("ai-result-panel");
  if (!panel) return;
  const isZh = currentLang === "zh";
  const active = getActiveCloudAccount();
  panel.hidden = false;
  if (active) {
    panel.innerHTML = `
      <div class="cloud-status-bar">
        <span>${
          isZh
            ? `当前已登录 <strong>${escapeHtmlSafe(active.email)}</strong> · 剩余 ${escapeHtmlSafe(active.totalRemaining ?? 30)} 额度`
            : `Signed in as <strong>${escapeHtmlSafe(active.email)}</strong> · ${escapeHtmlSafe(active.totalRemaining ?? 30)} credits left`
        }</span>
        <span class="quick-actions">
          <a href="#cloud-token-box" class="ctrl-btn ctrl-btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;">${isZh ? "管理账号与密钥 ↓" : "Manage account ↓"}</a>
          <button type="button" id="inline-clear-key-btn" class="ctrl-btn ctrl-btn-sm">${isZh ? "退出登录" : "Sign out"}</button>
          <button type="button" id="btn-ai-close-panel" class="ctrl-btn ctrl-btn-sm">${isZh ? "收起" : "Close"}</button>
        </span>
      </div>`;
    document.getElementById("btn-ai-close-panel")?.addEventListener("click", () => {
      panel.hidden = true;
    });
    document.getElementById("inline-clear-key-btn")?.addEventListener("click", async (ev) => {
      if (cloudSessionState.authenticated) {
        const btn = ev.currentTarget;
        if (btn) btn.disabled = true;
        const loResp = await fetch("/api/v1/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }).catch(() => null);
        if (!loResp || (!loResp.ok && loResp.status !== 401)) {
          if (btn) btn.disabled = false;
          return;
        }
        cloudSessionState = { ...cloudSessionState, authenticated: false, authMethod: null, account: null };
      }
      if (loadSavedVoiceProfile()?.sourceAccountId) {
        saveVoiceProfile(null);
        renderSavedVoiceState();
      }
      saveCloudAccount(null);
      resetCachedHubData(null);
      renderCloudAccountState();
      panel.hidden = true;
    });
    return;
  }
  panel.innerHTML = `<p class="ai-error-msg">${escapeHtmlSafe(reasonMsg || (isZh ? "请先登录后再使用云端 AI。" : "Sign in first to use Cloud AI."))}</p>`;
}

function openInlineCloudKeyPanel(reasonMsg = "") {
  if (!isCloudSignedIn()) {
    openAuthModal({ reasonMsg, action: pendingCloudAction });
    return;
  }
  openInlineCloudKeyPanelFallback(reasonMsg);
}

function openQuotaUpgradePanel(message = "", reasonCode = "insufficient_credits") {
  const panel = document.getElementById("ai-result-panel");
  if (!panel) return;
  const isZh = currentLang === "zh";
  const active = getActiveCloudAccount();
  const billingLive = Boolean(cloudSessionState.billing?.enabled);
  const skus = cloudSessionState.billing?.availableSkus || {};
  const hasSku = (k) => skus[k] !== false;
  panel.hidden = false;

  const titleByReason = {
    office_export_upgrade_required: isZh
      ? "2 次免费 Word/PPT 原排版导出已用完（审校仍可用免费额度）"
      : "2 complimentary Word/PPT exports used (Office review stays open)",
    text_too_long: isZh
      ? "超出免费档 12,000 字单次上限（付费解锁 50,000 字）"
      : "Draft exceeds the 12,000-char Free limit (unlock 50,000 chars)",
    voice_limit_exceeded: isZh
      ? "云端文风卡已达免费上限（付费解锁 20–50 份）"
      : "Free cloud voice card limit reached (unlock 20–50 cards)",
  };
  const panelTitle =
    titleByReason[reasonCode] ||
    (billingLive
      ? isZh
        ? "当前云端额度不足（本地离线检查仍永久免费）"
        : "Cloud credits used up (local checks stay unlimited)"
      : isZh
        ? "本月云端免费额度已用完（本地离线检查仍永久免费）"
        : "Monthly cloud credits used up (local checks stay unlimited)");

  const capabilityLead = isZh
    ? "$10 按量包（800 额度·不过期）或 Pro（$12/月）均可同时解锁不限次 Word/PPT 原排版导出、50,000 字长文与 20 份文风卡："
    : "Either the $10 Credit Pack (800 non-expiring credits) or Pro ($12/mo) unlocks unlimited Word/PPT exports, 50,000 chars/call, and 20 voice cards:";

  if (billingLive) {
    const creditsLead = (isZh || reasonCode === "office_export_upgrade_required") && hasSku("credits");
    const actionBtns = (creditsLead
      ? [
          hasSku("credits")
            ? `<button type="button" class="btn-primary" style="min-height:32px;padding:5px 12px;font-size:0.8rem;" data-inline-checkout="credits">${
                isZh ? "买按量包（$10 / 800 额度 · 不过期）" : "Buy 800 Credits ($10 · never expires)"
              }</button>`
            : "",
          hasSku("pro")
            ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-inline-checkout="pro">${
                isZh ? "升级 Pro（$12/月 · 1,500 额度）" : "Upgrade to Pro ($12/mo · 1,500 cr)"
              }</button>`
            : "",
          hasSku("team")
            ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-inline-checkout="team">${
                isZh ? "Team（$29/席位）" : "Team ($29/seat)"
              }</button>`
            : "",
        ]
      : [
          hasSku("pro")
            ? `<button type="button" class="btn-primary" style="min-height:32px;padding:5px 12px;font-size:0.8rem;" data-inline-checkout="pro">${
                isZh ? "升级 Pro（$12/月 · 1,500 额度）" : "Upgrade to Pro ($12/mo · 1,500 cr)"
              }</button>`
            : "",
          hasSku("credits")
            ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-inline-checkout="credits">${
                isZh ? "买按量包（$10 / 800 额度 · 不过期）" : "Buy 800 Credits ($10 · never expires)"
              }</button>`
            : "",
          hasSku("team")
            ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-inline-checkout="team">${
                isZh ? "Team（$29/席位）" : "Team ($29/seat)"
              }</button>`
            : "",
        ]
    ).filter(Boolean).join("");

    panel.innerHTML = `
      <div class="ai-result-head">
        <span class="ai-result-title">${panelTitle}</span>
        <button type="button" id="btn-ai-close-panel" class="ctrl-btn ctrl-btn-sm">${isZh ? "收起" : "Dismiss"}</button>
      </div>
      ${message ? `<p class="ai-error-msg">${escapeHtmlSafe(message)}</p>` : ""}
      <div class="upgrade-box">
        <p style="margin:0 0 8px;font-size:0.82rem;color:var(--ink-2);">${capabilityLead}</p>
        <div class="quick-actions">${actionBtns}</div>
      </div>
    `;
    document.getElementById("btn-ai-close-panel")?.addEventListener("click", () => {
      panel.hidden = true;
    });
    panel.querySelectorAll("[data-inline-checkout]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        startBillingCheckout(btn.getAttribute("data-inline-checkout") || "pro", { triggerBtn: ev.currentTarget });
      });
    });
    return;
  }

  panel.innerHTML = `
    <div class="ai-result-head">
      <span class="ai-result-title">${panelTitle}</span>
      <button type="button" id="btn-ai-close-panel" class="ctrl-btn ctrl-btn-sm">${isZh ? "收起" : "Dismiss"}</button>
    </div>
    ${message ? `<p class="ai-error-msg">${escapeHtmlSafe(message)}</p>` : ""}
    <div class="upgrade-box">
      <p style="margin:0 0 8px;font-size:0.82rem;color:var(--ink-2);">${capabilityLead}</p>
      <form id="inline-upgrade-waitlist-form" class="cloud-inline-form">
        <select id="inline-wl-plan" class="pack-select" aria-label="${isZh ? "选择方案" : "Select plan"}">
          <option value="credits" ${isZh ? "selected" : ""}>${isZh ? "按量包（$10 / 800 额度 · 不过期）" : "PAYGO ($10 / 800 credits · never expires)"}</option>
          <option value="pro" ${!isZh ? "selected" : ""}>${isZh ? "Pro（$12/月 · 1,500 额度）" : "Pro ($12/mo · 1,500 credits)"}</option>
          <option value="team">${isZh ? "Team（$29/席位 · 团队文风）" : "Team ($29/seat · shared voice)"}</option>
        </select>
        <input type="email" id="inline-wl-email" class="cloud-input" required value="${escapeHtmlSafe(active?.email || "")}" placeholder="you@company.com">
        <button type="submit" id="inline-wl-submit" class="btn-primary" style="min-height:34px;padding:5px 12px;font-size:0.8rem;">${isZh ? "一键预约扩容" : "Request upgrade"}</button>
      </form>
      <div id="inline-wl-feedback" class="ai-result-meta" style="margin-top:8px;"></div>
    </div>
  `;
  document.getElementById("btn-ai-close-panel")?.addEventListener("click", () => {
    panel.hidden = true;
  });
  document.getElementById("inline-upgrade-waitlist-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const plan = document.getElementById("inline-wl-plan")?.value || "pro";
    const email = String(document.getElementById("inline-wl-email")?.value || "").trim();
    const btn = document.getElementById("inline-wl-submit");
    const fb = document.getElementById("inline-wl-feedback");
    if (!email || !fb) return;
    if (btn) btn.disabled = true;
    fb.textContent = isZh ? "正在登记预约…" : "Submitting request...";
    try {
      const resp = await fetch("/api/v1/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan, note: reasonCode || "exhausted_credits_inline", source: getEntrySource() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</span>`;
        return;
      }
      fb.textContent = isZh
        ? `已登记 ${data.email}（${data.plan}），我们会邮件联系你开通或补充测试额度。`
        : `Saved ${data.email} (${data.plan}). We will email you with early access or top-up credits.`;
    } catch (err) {
      fb.innerHTML = `<span class="ai-error-msg">${escapeHtmlSafe(err.message || "Network error")}</span>`;
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function renderAiError(errCode, message) {
  const panel = document.getElementById("ai-result-panel");
  if (!panel) return;
  if (
    errCode === "insufficient_credits" ||
    errCode === "office_export_upgrade_required" ||
    errCode === "text_too_long" ||
    errCode === "voice_limit_exceeded"
  ) {
    openQuotaUpgradePanel(message, errCode);
    return;
  }
  if (errCode === "account_changed") {
    resetCachedHubData(null);
    refreshCloudSession();
    panel.hidden = false;
    panel.innerHTML = `<p class="ai-error-msg">${escapeHtmlSafe(message)}</p>`;
    return;
  }
  const needsToken = errCode === "auth_required" || errCode === "unauthorized" || errCode === "invalid_token";
  if (needsToken) {
    if (cloudSessionState.authenticated) {
      resetCachedHubData(null);
      refreshCloudSession();
    } else if (errCode === "invalid_token" && loadSavedCloudAccount()) {
      saveCloudAccount(null);
      renderCloudAccountState();
    }
    openInlineCloudKeyPanel(message);
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `<p class="ai-error-msg">${escapeHtmlSafe(message)}</p>`;
}

function normalizeCloudFindingItem(f, isZh) {
  const rev = f?.revision || null;
  const act = String(rev?.kind || f?.action || "edit");
  const actionMapZh = { edit: "改措辞", rewrite: "重写", ask: "先核实" };
  const actLabel = isZh ? actionMapZh[act] || act : act;
  const quote = f?.anchor?.quote || f?.quote || rev?.find || "";
  const lineNum = f?.anchor?.line || "";
  const segId = f?.segmentId || f?.anchor?.segmentId || f?.location || "";
  const label = f?.ruleId || f?.lens || f?.layer || (isZh ? "文风与结构" : "style");
  let suggestion = f?.suggestion || "";
  if (!suggestion && rev) {
    if (rev.kind === "edit") {
      suggestion = rev.replace ? rev.replace : isZh ? "直接删掉这段" : "Delete this phrase";
    } else if (rev.kind === "rewrite") {
      suggestion = rev.instruction || "";
    } else if (rev.kind === "ask") {
      suggestion = rev.question || "";
    }
  }
  return {
    act,
    actLabel,
    label,
    quote,
    lineNum,
    segId,
    why: f?.why || "",
    suggestion,
  };
}

async function runOfficeCloudAction(kind) {
  const isZh = currentLang === "zh";
  const mod = currentModality === "pptx" ? "pptx" : "docx";
  if (!lastUploadedBinaryBuffer || lastUploadedBinaryBuffer.byteLength === 0) {
    renderAiError("empty", isZh ? "请先重新选择本地 Word 或 PPT 文件。" : "Re-open your local Word or PowerPoint file first.");
    return;
  }
  if (lastUploadedBinaryBuffer.byteLength > 9 * 1024 * 1024) {
    renderAiError(
      "file_too_large",
      isZh ? "文件超过 9 MiB 云端处理上限；请使用本地离线 CLI（dislop check）处理大文件。" : "File exceeds the 9 MiB cloud limit; use the offline CLI (dislop check) for large decks or docs."
    );
    return;
  }
  const active = getActiveCloudAccount();
  if (!active) {
    openAuthModal({ action: kind });
    return;
  }

  const endpoint = kind === "review" ? "/api/v1/office/review" : "/api/v1/office/deslop";
  const trackChanges = mod === "docx" && Boolean(document.getElementById("office-track-changes")?.checked);
  const reqId = ++aiReqSeq;
  setAiButtonsBusy(
    true,
    kind === "review" ? `正在审校 ${mod.toUpperCase()} 正文结构与套话…` : `正在原排版改写 ${mod.toUpperCase()} 并校验数字…`,
    kind === "review" ? `Reviewing ${mod.toUpperCase()} segments...` : `Running layout-safe ${mod.toUpperCase()} rewrite...`
  );

  try {
    const savedVoice = kind === "deslop" ? stripVoiceLocalMeta(loadSavedVoiceProfile()) : null;
    const resp = await fetch(
      endpoint,
      buildCloudFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          fileBase64: arrayBufferToBase64(lastUploadedBinaryBuffer),
          filename: currentFilename || `draft.${mod}`,
          kind: mod,
          lang: isZh ? "zh" : "en",
          trackChanges,
          source: getEntrySource(),
          ...(savedVoice ? { voiceProfile: savedVoice } : {}),
        },
      })
    );
    const data = await resp.json().catch(() => ({}));
    if (reqId !== aiReqSeq) return;
    if (!resp.ok) {
      renderAiError(data.error || "request_failed", data.message || `HTTP ${resp.status}`);
      return;
    }

    updateCreditsFromBilling(data.billing);
    cachedHubData.usage = null;
    cachedHubData.billingHistory = null;
    const panel = document.getElementById("ai-result-panel");
    if (!panel) return;
    panel.hidden = false;

    if (kind === "review") {
      const findings = Array.isArray(data.findings) ? data.findings : [];
      const normalized = findings.map((f) => normalizeCloudFindingItem(f, isZh));
      const summary = data.verdict?.summary || data.summary || (isZh ? `共发现 ${normalized.length} 处可改项。` : `Found ${normalized.length} item(s).`);
      const itemsHtml = normalized.length
        ? `<ul class="finding-review-list">${normalized
            .map(
              (n) => `<li class="finding-review-item">
                <div class="finding-review-head">
                  <span class="finding-action-tag">${escapeHtmlSafe(n.actLabel)}</span>
                  <strong>${escapeHtmlSafe(n.label)}</strong>
                  ${n.segId ? `<span style="color:var(--ink-2);">${escapeHtmlSafe(n.segId)}</span>` : ""}
                </div>
                ${n.quote ? `<div style="font-family:var(--font-mono);font-size:0.76rem;color:var(--ink-2);margin-bottom:4px;">${escapeHtmlSafe(n.quote)}</div>` : ""}
                <div>${escapeHtmlSafe(n.why)}${n.suggestion ? ` → <strong>${escapeHtmlSafe(n.suggestion)}</strong>` : ""}</div>
              </li>`
            )
            .join("")}</ul>`
        : `<p class="hub-section-note">${isZh ? "未检出明显 AI 套话或硬伤。" : "No obvious AI clichés or artifacts found."}</p>`;
      const briefText = [
        summary,
        ...normalized.map((n, i) => `${i + 1}. [${n.segId || n.act}] ${n.quote ? `"${n.quote}" — ` : ""}${n.why} -> ${n.suggestion || n.why}`),
      ]
        .filter(Boolean)
        .join("\n");
      panel.innerHTML = `
        <div class="ai-result-head">
          <span class="ai-result-title">${isZh ? `${mod.toUpperCase()} 云端审校结果` : `${mod.toUpperCase()} Cloud Review`}</span>
          <span class="ai-result-meta">-${escapeHtmlSafe(data.creditWeight ?? 2)} ${isZh ? "额度" : "cr"}</span>
        </div>
        <p style="margin:0 0 8px;">${escapeHtmlSafe(summary)}</p>
        ${itemsHtml}
        <div class="quick-actions">
          <button type="button" id="btn-ai-copy-review" class="ctrl-btn ctrl-btn-sm">${isZh ? "复制审校清单" : "Copy review brief"}</button>
          <button type="button" id="btn-ai-close-panel" class="ctrl-btn ctrl-btn-sm">${isZh ? "收起" : "Dismiss"}</button>
        </div>`;
      document.getElementById("btn-ai-copy-review")?.addEventListener("click", async (ev) => {
        await copyTextWithFeedback(ev.currentTarget, briefText);
      });
      document.getElementById("btn-ai-close-panel")?.addEventListener("click", () => {
        panel.hidden = true;
      });
    } else {
      const outcomes = Array.isArray(data.segmentOutcomes) ? data.segmentOutcomes : [];
      const changed = outcomes.filter((o) => o.status === "changed").length;
      const rejected = outcomes.filter((o) => o.status === "rejected");
      const unchanged = Math.max(0, outcomes.length - changed - rejected.length);
      const outName = `cleaned-${(currentFilename || `draft.${mod}`).replace(/[^A-Za-z0-9._\u4e00-\u9fff-]/g, "_")}`;
      const rejectedHtml = rejected.length
        ? `<ul class="ai-changes-list">${rejected
            .slice(0, 6)
            .map((r) => `<li>${escapeHtmlSafe(r.id)}: ${isZh ? "已保留原文（" : "kept original ("}${escapeHtmlSafe(r.reason || "guard")})</li>`)
            .join("")}</ul>`
        : "";
      panel.innerHTML = `
        <div class="ai-result-head">
          <span class="ai-result-title">${isZh ? `${mod.toUpperCase()} 原排版改写完成` : `Layout-safe ${mod.toUpperCase()} rewrite ready`}</span>
          <span class="ai-result-meta">${
            isZh
              ? `已改 ${changed} 段 · 保留 ${unchanged} 段 · 护栏跳过 ${rejected.length} 段${data.trackChanges ? " · 含 Word 修订" : ""}`
              : `${changed} changed · ${unchanged} unchanged · ${rejected.length} kept by guard${data.trackChanges ? " · Track Changes" : ""}`
          }</span>
        </div>
        ${rejectedHtml}
        <div class="quick-actions">
          ${
            data.fileBase64
              ? `<button type="button" id="btn-office-download" class="btn-primary" style="min-height:32px;padding:5px 14px;font-size:0.82rem;">${
                  isZh ? `下载改后 ${mod.toUpperCase()}` : `Download cleaned ${mod.toUpperCase()}`
                }</button>`
              : ""
          }
          <button type="button" id="btn-ai-close-panel" class="ctrl-btn ctrl-btn-sm">${isZh ? "收起" : "Dismiss"}</button>
        </div>`;
      document.getElementById("btn-office-download")?.addEventListener("click", () => {
        if (!data.fileBase64) return;
        const mime =
          mod === "pptx"
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const blob = new Blob([base64ToUint8Array(data.fileBase64)], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = outName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 15000);
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
    syncAiButtonsForBinary();
  }
}

async function runCloudAction(kind) {
  if (cloudBusy) return;
  const isZh = currentLang === "zh";
  if (binaryAuditResult) {
    if (currentModality === "docx" || currentModality === "pptx") {
      await runOfficeCloudAction(kind);
      return;
    }
    renderAiError(
      "binary_unsupported",
      isZh
        ? "PDF 与图片仅支持上方本地离线检查；文本、Markdown、HTML 与 Word/PPT 可使用云端 AI。"
        : "PDF and image files run offline above; Cloud AI supports text, Markdown, HTML, Word, and PowerPoint."
    );
    return;
  }
  const text = String(currentText || "").trim();
  if (!text) {
    renderAiError("empty", isZh ? "请先粘贴或选择一段草稿。" : "Paste or pick a draft first.");
    return;
  }

  const endpoint = kind === "review" ? "/api/v1/review" : "/api/v1/deslop";
  const active = getActiveCloudAccount();
  if (!active) {
    openAuthModal({ action: kind });
    return;
  }
  const reqId = ++aiReqSeq;
  const sourceSnapshot = currentText;
  const localPack = resolveEffectivePack(currentPackId || "business-brief", PACKS_BY_ID);
  const regOverride = currentRegister && currentRegister !== "auto" ? currentRegister : null;
  const localBeforeCount = (auditText(sourceSnapshot, { filename: currentFilename || "draft.md", modality: currentModality || "markdown", pack: localPack, register: regOverride }).findings || []).length;

  setAiButtonsBusy(
    true,
    kind === "review" ? "正在调用云端审校（通常 1–2 秒）…" : "正在调用云端改写并自动核对数字与规则（通常 5–8 秒）…",
    kind === "review" ? "Running Cloud Review (typically 1-2s)..." : "Running Cloud Rewrite and re-checking (typically 5-8s)..."
  );

  try {
    const savedVoice = kind === "deslop" ? stripVoiceLocalMeta(loadSavedVoiceProfile()) : null;
    const resp = await fetch(
      endpoint,
      buildCloudFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          text,
          filename: currentFilename || "draft.md",
          modality: currentModality || "markdown",
          pack: currentPackId || "business-brief",
          lang: currentLang === "zh" ? "zh" : "en",
          source: getEntrySource(),
          ...(regOverride ? { register: regOverride } : {}),
          ...(savedVoice ? { voiceProfile: savedVoice } : {}),
        },
      })
    );
    const data = await resp.json().catch(() => ({}));
    if (reqId !== aiReqSeq) return;
    if (!resp.ok) {
      renderAiError(data.error || "request_failed", data.message || `HTTP ${resp.status}`);
      return;
    }

    updateCreditsFromBilling(data.billing);
    cachedHubData.usage = null;
    cachedHubData.billingHistory = null;
    const panel = document.getElementById("ai-result-panel");
    if (!panel) return;
    panel.hidden = false;

    if (kind === "review") {
      const structured = Array.isArray(data.findings) && data.findings.length > 0 ? data.findings : null;
      const level = data.aiFlavorLevel || data.llmReview?.aiFlavorLevel || "medium";
      const summary = data.summary || data.llmReview?.summary || "";
      let itemsHtml = "";
      let reviewAgentText = summary;

      if (structured) {
        const normalized = structured.map((f) => normalizeCloudFindingItem(f, isZh));
        itemsHtml = `<ul class="finding-review-list">${normalized
          .map(
            (n) => `<li class="finding-review-item">
              <div class="finding-review-head">
                <span class="finding-action-tag">${escapeHtmlSafe(n.actLabel)}</span>
                <strong>${escapeHtmlSafe(n.label)}</strong>
                ${n.lineNum ? `<span style="color:var(--ink-2);">L${escapeHtmlSafe(n.lineNum)}</span>` : ""}
              </div>
              ${
                n.quote
                  ? `<button type="button" class="finding-quote-btn" data-jump-line="${escapeHtmlSafe(n.lineNum)}" data-jump-quote="${escapeHtmlSafe(n.quote)}">${escapeHtmlSafe(n.quote)}</button>`
                  : ""
              }
              <div>${escapeHtmlSafe(n.why)}${n.suggestion ? ` → <strong>${escapeHtmlSafe(n.suggestion)}</strong>` : ""}</div>
            </li>`
          )
          .join("")}</ul>`;
        reviewAgentText = [
          summary,
          ...normalized.map(
            (n, i) =>
              `${i + 1}. [${n.act}${n.lineNum ? ` L${n.lineNum}` : ""}] ${n.quote ? `"${n.quote}" — ` : ""}${n.why}${
                n.suggestion ? ` -> ${n.suggestion}` : ""
              }`
          ),
        ]
          .filter(Boolean)
          .join("\n");
      } else {
        const issues = Array.isArray(data.llmReview?.issues) ? data.llmReview.issues : [];
        itemsHtml = issues.length
          ? `<ul class="ai-changes-list">${issues
              .map(
                (it) =>
                  `<li><strong>${escapeHtmlSafe(it.layer || it.category || (isZh ? "结构与文风" : "style"))}</strong>：${escapeHtmlSafe(it.why || "")}${it.fix ? ` → ${escapeHtmlSafe(it.fix)}` : ""}</li>`
              )
              .join("")}</ul>`
          : "";
        reviewAgentText = [
          summary,
          ...issues.map((it, i) => `${i + 1}. [${it.layer || it.category || "style"}] ${it.why || ""}${it.fix ? ` -> ${it.fix}` : ""}`),
        ]
          .filter(Boolean)
          .join("\n");
      }

      panel.innerHTML = `
        <div class="ai-result-head">
          <span class="ai-result-title">${isZh ? `云端审校结果（AI 味：${escapeHtmlSafe(level)}）` : `Cloud Review (slop level: ${escapeHtmlSafe(level)})`}</span>
          <span class="ai-result-meta">${escapeHtmlSafe(data.model || "")}${data.register ? ` · ${escapeHtmlSafe(data.register)}` : ""} · -${escapeHtmlSafe(data.creditWeight ?? 1)} ${isZh ? "额度" : "cr"}</span>
        </div>
        <p style="margin:0 0 8px;">${escapeHtmlSafe(summary)}</p>
        ${itemsHtml}
        <div class="quick-actions">
          <button type="button" id="btn-ai-copy-review" class="ctrl-btn ctrl-btn-sm">${isZh ? "复制审校建议给 Agent" : "Copy review for Agent"}</button>
          <button type="button" id="btn-ai-close-panel" class="ctrl-btn ctrl-btn-sm">${isZh ? "收起" : "Dismiss"}</button>
        </div>`;
      panel.querySelectorAll("[data-jump-quote]").forEach((qBtn) => {
        qBtn.addEventListener("click", () => {
          focusDraftLineOrQuote(qBtn.getAttribute("data-jump-line"), qBtn.getAttribute("data-jump-quote"));
        });
      });
      document.getElementById("btn-ai-copy-review")?.addEventListener("click", async (ev) => {
        await copyTextWithFeedback(ev.currentTarget, reviewAgentText);
      });
      document.getElementById("btn-ai-close-panel")?.addEventListener("click", () => {
        panel.hidden = true;
      });
    } else {
      cachedHubData.usage = null;
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
          <span class="ai-result-title">${isZh ? "云端改写结果" : "Cloud Rewrite"}</span>
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
    syncAiButtonsForBinary();
  }
}

async function handleFreeTokenSubmit(e) {
  e.preventDefault();
  const isZh = currentLang === "zh";
  const emailInput = document.getElementById("token-email-input");
  const submitBtn = document.getElementById("token-submit-btn");
  const otpStep = document.getElementById("token-otp-step");
  const otpInput = document.getElementById("token-otp-input");
  const outBox = document.getElementById("token-output-box");
  const email = String(emailInput?.value || "").trim();
  if (!email || !outBox) return;

  const startInlineResendCooldown = (seconds) => {
    if (otpResendTimer) clearInterval(otpResendTimer);
    let leftSec = Math.max(1, Math.ceil(Number(seconds) || 60));
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = isZh ? `${leftSec} 秒后可重发` : `Resend (${leftSec}s)`;
      otpResendTimer = setInterval(() => {
        leftSec -= 1;
        if (leftSec <= 0) {
          clearInterval(otpResendTimer);
          otpResendTimer = null;
          submitBtn.disabled = false;
          submitBtn.textContent = I18N[currentLang]?.["cloud.tokenBtn"] || (isZh ? "发验证码" : "Send code");
        } else {
          submitBtn.textContent = isZh ? `${leftSec} 秒后可重发` : `Resend (${leftSec}s)`;
        }
      }, 1000);
    }
  };

  if (pendingCloudAction) savePendingWorkbenchIntent(pendingCloudAction);
  if (submitBtn) submitBtn.disabled = true;
  outBox.hidden = false;
  outBox.textContent = isZh ? "正在发送 6 位登录验证码…" : "Sending 6-digit verification code...";

  try {
    const resp = await fetch("/api/v1/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email,
        lang: isZh ? "zh" : "en",
        returnTo: buildCurrentPageReturnTo("cloud-token-box"),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</p>`;
      if (Number(data.retryAfterSec) > 0) {
        startInlineResendCooldown(data.retryAfterSec);
      } else if (submitBtn) {
        submitBtn.disabled = false;
      }
      return;
    }

    if (emailInput) emailInput.readOnly = true;
    if (otpStep) otpStep.hidden = false;
    if (otpInput) {
      otpInput.value = "";
      otpInput.focus();
    }
    startInlineResendCooldown(60);
    outBox.textContent =
      data.message ||
      (isZh ? "验证码已发往你的邮箱（10 分钟内有效），填入上方即可登录。" : "Check your email for the 6-digit code (valid 10 min) and enter it above.");
  } catch (err) {
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleOtpVerifySubmit() {
  const isZh = currentLang === "zh";
  const emailInput = document.getElementById("token-email-input");
  const otpInput = document.getElementById("token-otp-input");
  const verifyBtn = document.getElementById("token-otp-verify-btn");
  const outBox = document.getElementById("token-output-box");
  const email = String(emailInput?.value || "").trim();
  const code = String(otpInput?.value || "").replace(/\D/g, "").slice(0, 6);
  if (!email || code.length !== 6 || !outBox) return;

  if (verifyBtn) verifyBtn.disabled = true;
  outBox.hidden = false;
  outBox.textContent = isZh ? "正在验证…" : "Verifying...";

  try {
    const resp = await fetch("/api/v1/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, code, lang: isZh ? "zh" : "en", source: getEntrySource() }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.account) {
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || `HTTP ${resp.status}`)}</p>`;
      return;
    }
    if (otpResendTimer) {
      clearInterval(otpResendTimer);
      otpResendTimer = null;
    }
    if (emailInput) emailInput.readOnly = false;
    const otpStep = document.getElementById("token-otp-step");
    if (otpStep) otpStep.hidden = true;
    const submitBtn = document.getElementById("token-submit-btn");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = I18N[currentLang]?.["cloud.tokenBtn"] || (isZh ? "发验证码" : "Send code");
    }

    resetCachedHubData(data.account.id);
    cloudSessionState = {
      ...cloudSessionState,
      loaded: true,
      authenticated: true,
      authMethod: "email_otp",
      account: data.account,
    };
    const linkOut = await finalizePendingOAuthLinkIfNeeded();
    if (linkOut?.navigated) return;
    await refreshCloudSession();
    if (linkOut?.skipped) {
      outBox.hidden = true;
    }
    startPendingCloudContinuation();
  } catch (err) {
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
  } finally {
    if (verifyBtn) verifyBtn.disabled = false;
  }
}

async function handleLegacyKeyBindSubmit(e) {
  e.preventDefault();
  const isZh = currentLang === "zh";
  const input = document.getElementById("legacy-key-input");
  const btn = document.getElementById("legacy-key-btn");
  const outBox = document.getElementById("token-output-box");
  const rawKey = String(input?.value || "").trim();
  if (!rawKey || !outBox) return;
  if (btn) btn.disabled = true;
  outBox.hidden = false;
  outBox.textContent = isZh ? "正在校验密钥…" : "Verifying key...";
  try {
    const resp = await fetch("/api/v1/account/me", { headers: { Authorization: `Bearer ${rawKey}` } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.account) {
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(data.message || (isZh ? "密钥无效或已失效" : "Invalid or expired key"))}</p>`;
      return;
    }
    saveCloudAccount({
      token: rawKey,
      email: data.account.email,
      plan: data.account.plan,
      remaining: data.account.totalRemaining,
      monthlyQuota: data.account.monthlyQuota,
    });
    if (input) input.value = "";
    outBox.hidden = true;
    renderCloudAccountState();
  } catch (err) {
    outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
  } finally {
    if (btn) btn.disabled = false;
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
      body: JSON.stringify({ email, plan, note, source: getEntrySource() }),
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

// ---------- Dark-room demo stage: one scene at a time (plain grid until this runs) ----------

function initDemoStage() {
  const stage = document.querySelector("[data-demo-stage]");
  const rail = stage?.querySelector('[role="tablist"]');
  const grid = stage?.querySelector(".demos-grid");
  if (!stage || !rail || !grid) return;
  const tabs = Array.from(rail.querySelectorAll("[data-demo-select]"));
  if (!tabs.length) return;

  function selectDemo(slug, moveFocus = false) {
    tabs.forEach((tab) => {
      const active = tab.getAttribute("data-demo-select") === slug;
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("tabindex", active ? "0" : "-1");
      if (active && moveFocus) tab.focus();
    });
    grid.querySelectorAll("[data-demo-card]").forEach((card) => {
      card.classList.toggle("is-active-demo", card.getAttribute("data-demo-card") === slug);
    });
  }

  tabs.forEach((tab) => {
    const slug = tab.getAttribute("data-demo-select");
    const card = grid.querySelector(`[data-demo-card="${slug}"]`);
    if (card) {
      card.setAttribute("role", "tabpanel");
      card.setAttribute("aria-labelledby", tab.id);
    }
    tab.addEventListener("click", () => selectDemo(slug));
  });

  rail.addEventListener("keydown", (e) => {
    const idx = tabs.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    selectDemo(tabs[next].getAttribute("data-demo-select"), true);
  });

  rail.hidden = false;
  stage.classList.add("is-stage-ready");
  grid.classList.add("is-stage-ready");
  const initial = tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0];
  selectDemo(initial.getAttribute("data-demo-select"));
}

// ---------- Wire Events ----------

function registerWebMcpTools() {
  try {
    const mc =
      (typeof navigator !== "undefined" && navigator.modelContext) ||
      (typeof document !== "undefined" && document.modelContext);
    if (!mc || typeof mc.registerTool !== "function") return;
    mc.registerTool({
      name: "dislop_check_draft",
      description:
        "Run offline deterministic AI-slop checks on prose, Markdown, HTML/CSS/JSX, or SVG directly in browser memory with zero uploads.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string", description: "Draft text or markup to check locally" },
          pack: {
            type: "string",
            description:
              "Style pack ID (auto, business-brief, engineering-spec, regulated-comms, literary-essay, deck-and-ui, executive-deck)",
          },
          filename: { type: "string", description: "Optional virtual filename hint such as draft.md or page.html" },
        },
      },
      async execute(args) {
        const input = String(args?.text || "");
        const filename = String(args?.filename || "draft.md");
        const modality = detectModality(filename, input);
        const packInfo = resolveWorkbenchPack(String(args?.pack || "auto"), input, modality);
        const pack = resolveEffectivePack(packInfo.packId, PACKS_BY_ID);
        const res = collectUnifiedOfflineAudit(input, { filename, modality, packId: packInfo.packId, pack });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                packId: packInfo.packId,
                modality,
                summary: res.summary,
                findings: res.findings,
              }),
            },
          ],
        };
      },
    });
  } catch {
    // Progressive enhancement: ignore unsupported WebMCP hosts
  }
}

function init() {
  registerWebMcpTools();
  const savedTheme = safeGetStorage("dislop-theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = currentTheme === "dark" ? "light" : "dark";
    safeSetStorage("dislop-theme", next);
    applyTheme(next);
  });

  document.getElementById("lang-toggle").addEventListener("click", () => {
    const nextLang = currentLang === "zh" ? "en" : "zh";
    safeSetStorage("dislop-lang", nextLang);
    if (!binaryAuditResult && currentText && (customRuleTitle === "user-draft" || currentText !== baselineText)) {
      try {
        window.sessionStorage?.setItem(
          LANG_SWITCH_DRAFT_KEY,
          JSON.stringify({
            packId: currentPackId,
            register: currentRegister || "auto",
            modality: currentModality,
            filename: currentFilename,
            text: String(currentText).slice(0, 50000),
            ts: Date.now(),
          })
        );
      } catch {
        // ignore storage errors
      }
    }
    const hreflang = nextLang === "zh" ? "zh-Hans" : "en";
    const altEl = document.querySelector(`link[rel="alternate"][hreflang="${hreflang}"]`);
    let targetPath = nextLang === "zh" ? siteAssetUrl("zh/") : SITE_ROOT_PATH;
    if (altEl?.getAttribute("href")) {
      try {
        targetPath = new URL(altEl.getAttribute("href"), window.location.href).pathname || targetPath;
      } catch {
        // keep fallback targetPath
      }
    }
    if (window.location.pathname !== targetPath) {
      const peerParams = new URLSearchParams(window.location.search || "");
      if (peerParams.has("lang")) peerParams.set("lang", nextLang);
      const peerQs = peerParams.toString();
      window.location.assign(`${targetPath}${peerQs ? `?${peerQs}` : ""}${window.location.hash || ""}`);
      return;
    }
    currentLang = nextLang;
    applyI18n(true);
  });

  // Hero 2-state Proof Card tabs (roving tabindex + arrow keys)
  const heroTabsRail = document.getElementById("hero-proof-tabs");
  const heroTabs = heroTabsRail ? Array.from(heroTabsRail.querySelectorAll("[data-hero-state]")) : [];
  heroTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-hero-state") || "bad";
      setHeroProofState(next);
    });
  });
  if (heroTabsRail && heroTabs.length) {
    heroTabsRail.addEventListener("keydown", (e) => {
      const idx = heroTabs.indexOf(document.activeElement);
      if (idx < 0) return;
      let next = -1;
      if (e.key === "ArrowRight") next = (idx + 1) % heroTabs.length;
      else if (e.key === "ArrowLeft") next = (idx - 1 + heroTabs.length) % heroTabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = heroTabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      const targetTab = heroTabs[next];
      setHeroProofState(targetTab.getAttribute("data-hero-state") || "bad");
      targetTab.focus();
    });
  }

  // Demo cards: borderless click/keyboard surface swaps animated loop <-> poster (supports reduced-motion override)
  function setDemoCardPaused(slug, paused) {
    if (paused) pausedDemoSlugs.add(slug);
    else pausedDemoSlugs.delete(slug);
    const dict = I18N[currentLang] || I18N.zh;
    const card = document.querySelector(`[data-demo-card="${slug}"]`);
    if (!card) return;
    const poster = card.querySelector(`source[data-demo-poster="${slug}"]`);
    const webp = card.querySelector(`source[data-demo-webp="${slug}"]`);
    const img = card.querySelector(`img[data-demo-gif="${slug}"]`);
    const btn = card.querySelector(`[data-demo-toggle="${slug}"]`);
    if (poster) {
      poster.media = paused ? "(prefers-reduced-motion: reduce)" : "not all";
    }
    if (webp) {
      webp.srcset = paused
        ? siteAssetUrl(`assets/demos/${slug}-${currentLang}-v2-poster.png`)
        : siteAssetUrl(`assets/demos/${slug}-${currentLang}-v2.webp`);
    }
    if (img) {
      img.src = paused
        ? siteAssetUrl(`assets/demos/${slug}-${currentLang}-v2-poster.png`)
        : siteAssetUrl(`assets/demos/${slug}-${currentLang}-v2.gif`);
    }
    if (btn) {
      btn.setAttribute("aria-pressed", String(paused));
      btn.setAttribute("aria-label", paused ? dict["demos.play"] : dict["demos.pause"]);
    }
  }

  document.querySelectorAll("[data-demo-toggle]").forEach((btn) => {
    const slug = btn.getAttribute("data-demo-toggle");
    if (prefersReducedMotion && slug) {
      setDemoCardPaused(slug, true);
    }
    btn.addEventListener("click", () => {
      if (!slug) return;
      setDemoCardPaused(slug, !pausedDemoSlugs.has(slug));
    });
  });
  initDemoStage();

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

  const regSelectEl = document.getElementById("register-select");
  if (regSelectEl) {
    regSelectEl.addEventListener("change", async (e) => {
      currentRegister = e.target.value || "auto";
      if (lastUploadedFile && binaryAuditResult) {
        await handleUploadedFile(lastUploadedFile, false);
      } else {
        renderWorkbench();
      }
    });
  }

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
    if (activeSpecimen && activeSpecimen.id === "user-draft" && (currentPackId === "auto" || currentPackId === "deck-and-ui")) {
      const inferred = inferPastedTextModality(currentText, currentPackId);
      currentModality = inferred;
      currentFilename = `my-draft.${inferred === "markdown" ? "md" : inferred}`;
      activeSpecimen.modality = inferred;
      activeSpecimen.filename = currentFilename;
    }
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
    clearWorkbenchTransientPanels();
    binaryAuditResult = null;
    lastUploadedFile = null;
    lastUploadedBinaryBuffer = null;
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
    clearWorkbenchTransientPanels();
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
        appliedEl.classList.add("is-error");
        appliedEl.hidden = false;
        appliedEl.textContent =
          currentLang === "zh"
            ? `暂不支持打开 ${file.name}。支持 .md、.mdx、.txt、.html、.css、.jsx、.tsx、.svg、.docx、.pptx、.pdf、.png、.jpg、.webp。`
            : `Unsupported file type: ${file.name}. Open a .md, .mdx, .txt, .html, .css, .jsx, .tsx, .svg, .docx, .pptx, .pdf, .png, .jpg, or .webp file.`;
      }
      return;
    }
    const token = ++uploadSeq;
    clearWorkbenchTransientPanels();
    const isBinaryMod = BINARY_MODALITIES.has(mod);
    const nextPackId = autoSelectPack
      ? isBinaryMod || UI_CODE_MODALITIES.has(mod)
        ? defaultPackForModality(mod)
        : "auto"
      : currentPackId;
    const resolvedPackId = nextPackId === "auto" ? defaultPackForModality(mod) : nextPackId;
    const pack = resolveEffectivePack(resolvedPackId, PACKS_BY_ID);

    let nextBinaryResult = null;
    let nextOriginalText = null;
    let nextBaselineText = "";
    let nextCurrentText = "";
    let nextBinaryBuffer = null;

    let previewDataUrl = null;
    try {
      if (mod === "docx" || mod === "pptx") {
        const buf = await file.arrayBuffer();
        nextBinaryBuffer = buf;
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
        const regOverride = currentRegister && currentRegister !== "auto" ? currentRegister : null;
        const res = auditOoxmlEntries(entries, { filename: file.name, modality: mod, pack, register: regOverride });
        const slideCount = Object.keys(entries).filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k)).length;
        nextBinaryResult = {
          ...res,
          binaryMeta: {
            modality: mod,
            filename: file.name,
            sizeBytes: file.size,
            slideCount,
            xmlCount: Object.keys(entries).length,
          },
        };
        nextCurrentText =
          currentLang === "zh"
            ? `[已在标签页内存检查本地 ${mod.toUpperCase()}：${file.name}]\n检出：${res.findings.length} 处`
            : `[Inspected local ${mod.toUpperCase()} in browser memory: ${file.name}]\nFindings: ${res.findings.length}`;
      } else if (mod === "image") {
        const buf = await file.arrayBuffer();
        const parsedImg = await parseBrowserImageBuffer(buf);
        const res = auditImageDocument(parsedImg, { filename: file.name, pack });
        if (file.size <= 4 * 1024 * 1024) {
          previewDataUrl = await readFileAsDataUrl(file);
        }
        nextBinaryResult = {
          ...res,
          binaryMeta: {
            modality: "image",
            filename: file.name,
            sizeBytes: file.size,
            format: parsedImg.format,
            width: parsedImg.width,
            height: parsedImg.height,
            hasC2pa: parsedImg.hasC2pa,
            metadataCount: parsedImg.metadataTexts?.length || 0,
            pixelMetrics: parsedImg.pixelMetrics || null,
          },
        };
        nextCurrentText =
          currentLang === "zh"
            ? `[已在标签页内存检查本地图片：${file.name} (${parsedImg.width}×${parsedImg.height})]\n检出：${res.findings.length} 处`
            : `[Inspected local image in browser memory: ${file.name} (${parsedImg.width}x${parsedImg.height})]\nFindings: ${res.findings.length}`;
      } else if (mod === "pdf") {
        const buf = await file.arrayBuffer();
        const parsedPdf = await parseBrowserPdfBuffer(buf);
        const regOverride = currentRegister && currentRegister !== "auto" ? currentRegister : null;
        const res = auditPdfDocument(parsedPdf, { filename: file.name, pack, register: regOverride });
        nextBinaryResult = {
          ...res,
          coverageWarnings: res.coverageWarnings || [],
          binaryMeta: {
            modality: "pdf",
            filename: file.name,
            sizeBytes: file.size,
            encrypted: Boolean(parsedPdf.encrypted),
            pageCount: parsedPdf.pageCount || 0,
            hasFonts: Boolean(parsedPdf.hasFonts),
            hasCompressedStreams: Boolean(parsedPdf.hasCompressedStreams),
          },
        };
        nextCurrentText = parsedPdf.encrypted
          ? currentLang === "zh"
            ? `[PDF 已加密，无法读取内容，已诚实跳过：${file.name}]`
            : `[Encrypted PDF skipped honestly: ${file.name}]`
          : currentLang === "zh"
            ? `[已在标签页内存检查本地 PDF：${file.name}（共 ${parsedPdf.pageCount} 页）]\n检出：${res.findings.length} 处`
            : `[Inspected local PDF in browser memory: ${file.name} (${parsedPdf.pageCount} pages)]\nFindings: ${res.findings.length}`;
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
        if (mod === "svg" && file.size <= 512 * 1024) {
          previewDataUrl = await readFileAsDataUrl(file);
        }
      }
    } catch (err) {
      nextBinaryResult = {
        findings: [],
        skipped: [{ file: file.name, reason: `Uninspectable ${mod.toUpperCase()}: ${err.message}` }],
        binaryMeta: { modality: mod, filename: file.name, sizeBytes: file.size, error: err.message },
      };
      nextCurrentText = `Could not inspect ${file.name}: ${err.message}`;
    }

    if (token !== uploadSeq) return;

    lastUploadedFile = file;
    lastUploadedBinaryBuffer = nextBinaryBuffer;
    lastUploadedPreviewDataUrl = previewDataUrl;
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
          appliedEl.classList.add("is-error");
          appliedEl.hidden = false;
          appliedEl.textContent =
            currentLang === "zh"
              ? `暂不支持拖入 ${file.name}。支持 .md、.mdx、.txt、.html、.css、.jsx、.tsx、.svg、.docx、.pptx、.pdf、.png、.jpg、.webp。`
              : `Unsupported file type: ${file.name}. Drop a .md, .mdx, .txt, .html, .css, .jsx, .tsx, .svg, .docx, .pptx, .pdf, .png, .jpg, or .webp file.`;
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

  document.getElementById("btn-copy-draft")?.addEventListener("click", async (ev) => {
    if (binaryAuditResult || !currentText.trim()) return;
    await copyTextWithFeedback(ev.currentTarget, currentText);
  });

  document.getElementById("wb-share-link-btn")?.addEventListener("click", async (ev) => {
    if (binaryAuditResult || !currentText.trim()) return;
    const btn = ev.currentTarget;
    try {
      const token = await encodeShareHash(currentText, currentPackId, currentModality);
      const shareBase = currentLang === "zh" ? siteAssetUrl("zh/") : SITE_ROOT_PATH;
      const url = `${window.location.origin}${shareBase}#share=${token}`;
      await copyTextWithFeedback(btn, url);
      showShareBanner(
        currentLang === "zh"
          ? "已复制离线分享链接：原文只保存在链接 # 后，不上传服务器；只有拿到链接的人看得到。"
          : "Share link copied. Your text stays inside the # URL hash offline — nothing is uploaded or stored on our server."
      );
    } catch (err) {
      const tooLong = err && err.message === "SHARE_TOO_LONG";
      showShareBanner(
        tooLong
          ? currentLang === "zh"
            ? "当前文稿较长，超出了离线分享链接的长度上限，请删减几句或改用「复制正文」。"
            : "Draft is too long for an offline share URL. Trim a few sentences or use Copy text."
          : currentLang === "zh"
            ? "生成分享链接失败，请改用「复制正文」。"
            : "Could not encode share link. Please use Copy text instead.",
        true
      );
    }
  });

  document.getElementById("btn-copy-agent-brief")?.addEventListener("click", async (ev) => {
    await copyTextWithFeedback(ev.currentTarget, buildAgentFixBrief());
  });

  const stepFinding = (delta) => {
    const count = lastRenderedAudit?.findings?.length || 0;
    if (count === 0) return;
    if (focusedFindingIdx < 0 || focusedFindingIdx >= count) {
      focusedFindingIdx = delta > 0 ? 0 : count - 1;
    } else {
      focusedFindingIdx = (focusedFindingIdx + delta + count) % count;
    }
    if (viewMode === "edit" && !binaryAuditResult) setViewMode("proof");
    renderWorkbench();
    const notesEl = document.getElementById("notes-container");
    const proofView = document.getElementById("proof-view");
    notesEl?.querySelector(`[data-note-idx="${focusedFindingIdx}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    proofView?.querySelector(`[data-finding-idx="${focusedFindingIdx}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  document.getElementById("btn-prev-finding")?.addEventListener("click", () => stepFinding(-1));
  document.getElementById("btn-next-finding")?.addEventListener("click", () => stepFinding(1));
  document.getElementById("ai-token-link")?.addEventListener("click", () => {
    if (isCloudSignedIn()) {
      openInlineCloudKeyPanelFallback();
    } else {
      openAuthModal();
    }
  });
  document.getElementById("wb-nudge-cloud-btn")?.addEventListener("click", () => {
    if (isCloudSignedIn()) {
      document.getElementById("cloud-token-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      openAuthModal();
    }
  });
  document.getElementById("auth-modal-close")?.addEventListener("click", () => closeAuthModal({ clearPending: true }));
  document.getElementById("auth-modal-backdrop")?.addEventListener("click", (ev) => {
    if (ev.target === ev.currentTarget) closeAuthModal({ clearPending: true });
  });
  document.addEventListener("keydown", (ev) => {
    const modal = document.getElementById("auth-modal-backdrop");
    if (!modal || modal.hidden) return;
    if (ev.key === "Escape") {
      closeAuthModal({ clearPending: true });
      return;
    }
    if (ev.key === "Tab") {
      const card = modal.querySelector(".auth-modal-card") || modal;
      const focusable = Array.from(
        card.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.closest("[hidden]") && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (ev.shiftKey && (document.activeElement === first || !card.contains(document.activeElement))) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastVisibilitySessionSyncMs < 15_000) return;
    if (cloudSessionState.authenticated || document.cookie.includes("dslp_hint=")) {
      lastVisibilitySessionSyncMs = now;
      refreshCloudSession();
    }
  });

  // Paste directly into workbench when not typing in another field
  document.addEventListener("paste", (ev) => {
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
    const wbEl = document.getElementById("workbench");
    if (!wbEl) return;
    const rect = wbEl.getBoundingClientRect();
    const wbInView = rect.bottom > 0 && rect.top < window.innerHeight;
    if (!wbInView && !wbEl.contains(active)) return;
    const pasted = ev.clipboardData?.getData("text/plain");
    if (!pasted || !pasted.trim()) return;
    ev.preventDefault();
    uploadSeq += 1;
    clearWorkbenchTransientPanels();
    clearSpecimenStateReset();
    binaryAuditResult = null;
    lastUploadedFile = null;
    lastUploadedBinaryBuffer = null;
    uploadedOriginalText = null;
    customRuleTitle = "user-draft";
    currentModality = inferPastedTextModality(pasted, currentPackId);
    currentFilename = `pasted-draft.${currentModality === "markdown" ? "md" : currentModality}`;
    activeSpecimen = {
      id: "user-draft",
      pack: currentPackId,
      filename: currentFilename,
      modality: currentModality,
      bad: pasted,
      trap: null,
      good: null,
    };
    baselineText = pasted;
    currentText = pasted;
    focusedFindingIdx = -1;
    setViewMode("proof");
    updateSpecimenRailSelection();
    renderWorkbench();
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
  document.getElementById("token-otp-verify-btn")?.addEventListener("click", handleOtpVerifySubmit);
  document.getElementById("token-otp-input")?.addEventListener("input", (ev) => {
    const inp = ev.currentTarget;
    const cleaned = String(inp.value || "").replace(/\D/g, "").slice(0, 6);
    if (inp.value !== cleaned) inp.value = cleaned;
    if (cleaned.length === 6) {
      handleOtpVerifySubmit();
    }
  });
  document.getElementById("token-otp-input")?.addEventListener("paste", (ev) => {
    const inp = ev.currentTarget;
    const digits = String(ev.clipboardData?.getData("text/plain") || "").replace(/\D/g, "").slice(0, 6);
    if (digits) {
      ev.preventDefault();
      inp.value = digits;
      if (digits.length === 6) {
        handleOtpVerifySubmit();
      }
    }
  });
  document.getElementById("token-otp-input")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      handleOtpVerifySubmit();
    }
  });
  document.getElementById("token-otp-change-btn")?.addEventListener("click", () => {
    if (otpResendTimer) {
      clearInterval(otpResendTimer);
      otpResendTimer = null;
    }
    const emailInput = document.getElementById("token-email-input");
    const submitBtn = document.getElementById("token-submit-btn");
    const otpStep = document.getElementById("token-otp-step");
    const outBox = document.getElementById("token-output-box");
    if (emailInput) {
      emailInput.readOnly = false;
      emailInput.focus();
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = I18N[currentLang]?.["cloud.tokenBtn"] || (currentLang === "zh" ? "发验证码" : "Send code");
    }
    if (otpStep) otpStep.hidden = true;
    if (outBox) outBox.hidden = true;
  });
  document.getElementById("legacy-key-bind-form")?.addEventListener("submit", handleLegacyKeyBindSubmit);
  document.getElementById("topbar-account-btn")?.addEventListener("click", () => {
    if (isCloudSignedIn()) {
      document.getElementById("cloud-token-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      openAuthModal();
    }
  });
  document.getElementById("waitlist-form")?.addEventListener("submit", handleWaitlistSubmit);

  captureEntrySource();
  let initialMagicToken = "";
  let initialBillingState = "";
  let initialAuthError = "";
  try {
    const curUrl = new URL(window.location.href);
    const rawHash = curUrl.hash ? curUrl.hash.slice(1) : "";
    let restoredAnchor = "";
    if (rawHash.startsWith("magic=") || rawHash.includes("&magic=")) {
      const hp = new URLSearchParams(rawHash);
      initialMagicToken = String(hp.get("magic") || "").trim();
      restoredAnchor = String(hp.get("anchor") || "cloud-token-box").trim();
    } else if (rawHash.startsWith("auth-error=")) {
      initialAuthError = decodeURIComponent(rawHash.slice("auth-error=".length));
      restoredAnchor = "cloud-token-box";
    }
    if (!initialMagicToken) {
      initialMagicToken = String(curUrl.searchParams.get("magic") || "").trim();
    }
    initialBillingState = String(curUrl.searchParams.get("billing") || "").trim();
    if (initialMagicToken || initialBillingState || initialAuthError) {
      curUrl.searchParams.delete("magic");
      curUrl.searchParams.delete("billing");
      curUrl.searchParams.delete("session_id");
      if (restoredAnchor) {
        curUrl.hash = `#${restoredAnchor.replace(/^#+/, "")}`;
      }
      window.history.replaceState({}, "", curUrl.pathname + curUrl.search + curUrl.hash);
    }
  } catch {
    initialMagicToken = "";
    initialBillingState = "";
    initialAuthError = "";
  }

  window.addEventListener("hashchange", () => {
    handleWorkbenchHash();
  });

  try {
    const rawDraft = window.sessionStorage?.getItem(LANG_SWITCH_DRAFT_KEY) || "";
    if (rawDraft) {
      window.sessionStorage?.removeItem(LANG_SWITCH_DRAFT_KEY);
      const stashed = JSON.parse(rawDraft);
      if (stashed?.text && stashed?.ts && Date.now() - Number(stashed.ts) < 5 * 60_000) {
        customRuleTitle = "user-draft";
        currentPackId = PACKS_BY_ID[stashed.packId] || stashed.packId === "auto" ? stashed.packId : "auto";
        currentRegister = stashed.register || "auto";
        currentModality = stashed.modality || inferPastedTextModality(stashed.text, currentPackId);
        currentFilename = stashed.filename || `pasted-draft.${currentModality === "markdown" ? "md" : currentModality}`;
        activeSpecimen = {
          id: "user-draft",
          pack: currentPackId,
          filename: currentFilename,
          modality: currentModality,
          bad: stashed.text,
          trap: null,
          good: null,
        };
        baselineText = stashed.text;
        currentText = stashed.text;
        focusedFindingIdx = -1;
        const packSel = document.getElementById("pack-select");
        if (packSel) packSel.value = currentPackId;
        const regSel = document.getElementById("register-select");
        if (regSel) regSel.value = currentRegister;
      }
    }
  } catch {
    // ignore storage restore errors
  }

  applyI18n(false);

  try {
    const params = new URLSearchParams(window.location.search || "");
    const outBox = document.getElementById("token-output-box");
    const authParam = params.get("auth") || "";
    const isZhNow = currentLang === "zh";
    if (initialAuthError && outBox) {
      const errMsgMap = {
        google_already_linked: isZhNow
          ? "该 Google 账号已绑定在其他 dislop 账号上，无法重复绑定。"
          : "That Google account is already linked to another dislop account.",
        github_already_linked: isZhNow
          ? "该 GitHub 账号已绑定在其他 dislop 账号上，无法重复绑定。"
          : "That GitHub account is already linked to another dislop account.",
        provider_already_connected: isZhNow
          ? "当前账号已绑定另一个同平台账号，请先在「登录与安全」解绑后再更换。"
          : "Another account from this provider is already connected. Disconnect it first in Sign-in & Security.",
        link_session_mismatch: isZhNow
          ? "登录会话已变化或超时，请确认当前账号后重新绑定。"
          : "Your signed-in session changed or expired before linking finished. Please retry.",
        link_reauth_required: isZhNow
          ? "为保护账号安全，请先重新登录一次再绑定第三方账号。"
          : "Please sign in again before connecting a new provider.",
        session_required: isZhNow
          ? "请先登录你的 dislop 账号，再执行绑定操作。"
          : "Sign in to your dislop account first before connecting a provider.",
      };
      const friendly =
        errMsgMap[initialAuthError] ||
        (isZhNow
          ? `操作未完成（${escapeHtmlSafe(initialAuthError)}），请重试或改用邮箱验证码。`
          : `Action did not complete (${escapeHtmlSafe(initialAuthError)}). Retry or use an email code.`);
      outBox.hidden = false;
      outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${friendly}</p>`;
      document.getElementById("cloud-token-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if ((authParam === "link" || authParam === "github-link") && outBox) {
      const providerName = authParam === "github-link" ? "GitHub" : "Google";
      outBox.hidden = false;
      outBox.textContent = isZhNow
        ? `检测到同邮箱已有账号。用下方邮箱验证码验证一次后，会自动绑定你的 ${providerName} 账号。`
        : `An account already exists for this email. Verify with a 6-digit email code below to finish linking ${providerName}.`;
    }
  } catch {
    // ignore URL parsing errors
  }

  (async () => {
    const outBox = document.getElementById("token-output-box");
    const isZh = currentLang === "zh";
    let magicSwitchPaused = false;

    const executeMagicVerify = async (confirmAccountSwitch = false) => {
      if (outBox) {
        outBox.hidden = false;
        outBox.textContent = isZh ? "正在验证一键登录链接…" : "Verifying 1-click sign-in link...";
      }
      try {
        const mResp = await fetch("/api/v1/auth/magic/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            token: initialMagicToken,
            lang: currentLang === "zh" ? "zh" : "en",
            source: getEntrySource(),
            ...(confirmAccountSwitch ? { confirmAccountSwitch: true } : {}),
          }),
        });
        const mData = await mResp.json().catch(() => ({}));
        if (mResp.status === 409 && mData.error === "account_switch_confirm_required" && outBox) {
          magicSwitchPaused = true;
          outBox.hidden = false;
          outBox.innerHTML = `
            <div style="margin-bottom:8px;">${escapeHtmlSafe(
              mData.message ||
                (currentLang === "zh"
                  ? `当前已登录 ${mData.currentEmail || ""}，确认切换为 ${mData.targetEmail || ""} 吗？`
                  : `Currently signed in as ${mData.currentEmail || ""}. Switch to ${mData.targetEmail || ""}?`)
            )}</div>
            <div class="quick-actions">
              <button type="button" id="btn-confirm-magic-switch" class="btn-primary" style="min-height:30px;padding:4px 12px;font-size:0.8rem;">${
                currentLang === "zh" ? "确认切换账号" : "Switch account"
              }</button>
              <button type="button" id="btn-cancel-magic-switch" class="ctrl-btn ctrl-btn-sm">${
                currentLang === "zh" ? "保留当前账号" : "Keep current session"
              }</button>
            </div>`;
          document.getElementById("cloud-token-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
          document.getElementById("btn-confirm-magic-switch")?.addEventListener("click", async () => {
            pendingCloudAction = null;
            clearPendingWorkbenchIntent();
            magicSwitchPaused = false;
            await executeMagicVerify(true);
            await refreshCloudSession();
            await finalizePendingOAuthLinkIfNeeded();
          });
          document.getElementById("btn-cancel-magic-switch")?.addEventListener("click", () => {
            if (outBox) outBox.hidden = true;
          });
          return false;
        }
        if (mResp.ok && mData.account) {
          resetCachedHubData(mData.account.id);
          cloudSessionState = {
            ...cloudSessionState,
            loaded: true,
            authenticated: true,
            authMethod: "magic_link",
            account: mData.account,
          };
          if (outBox) {
            outBox.hidden = false;
            outBox.textContent = currentLang === "zh" ? "已通过邮件链接登录。" : "Signed in via email link.";
          }
          return true;
        }
        if (outBox) {
          outBox.hidden = false;
          outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(
            mData.message || (currentLang === "zh" ? "登录链接已失效，请重新发送验证码。" : "Sign-in link expired. Please request a new code.")
          )}</p>`;
        }
        return false;
      } catch (err) {
        if (outBox) {
          outBox.hidden = false;
          outBox.innerHTML = `<p class="ai-error-msg" style="margin:0;">${escapeHtmlSafe(err.message || "Network error")}</p>`;
        }
        return false;
      }
    };

    if (initialMagicToken) {
      await executeMagicVerify(false);
    }

    await refreshCloudSession();
    if (!magicSwitchPaused) {
      const linkOut = await finalizePendingOAuthLinkIfNeeded();
      if (linkOut?.navigated) return;
    }

    if (initialBillingState === "success" || initialBillingState === "cancel") {
      activeHubTab = "plan";
      resetCachedHubData(cloudSessionState.account?.id || null);
      renderCloudAccountState();
      if (outBox) {
        outBox.hidden = false;
        outBox.textContent =
          initialBillingState === "success"
            ? currentLang === "zh"
              ? "已收到结账返回，正在同步订阅或按量额度…"
              : "Returned from checkout. Syncing your plan or credit pack..."
            : currentLang === "zh"
              ? "已取消本次结账，未产生扣款。"
              : "Checkout canceled. No charge was made.";
      }
      document.getElementById("cloud-token-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (initialBillingState === "success") {
        setTimeout(async () => {
          resetCachedHubData(null);
          await refreshCloudSession();
          if (outBox && !outBox.hidden) {
            outBox.textContent =
              currentLang === "zh"
                ? "账单状态已刷新（如银行仍在确认，稍后可点「刷新额度」查看）。"
                : "Billing status refreshed (if Stripe is still confirming, click Refresh shortly).";
          }
        }, 2500);
      }
    }

    if (!magicSwitchPaused) {
      await consumePendingWorkbenchIntent();
    }
  })();
  handleWorkbenchHash();
  ensurePocketModelLoaded().then((loaded) => {
    if (loaded && !binaryAuditResult) {
      renderWorkbench();
    }
  });
}

init();
