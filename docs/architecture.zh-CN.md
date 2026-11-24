# 系统架构说明（`v0.8.4`）

[English](./architecture.md) · [产品定义](../PRODUCT.md)

`dislop` 是面向文档、网页、SVG、图片与 PPT/PDF 幻灯片的 **AI 味检查工具**，基于统一的规则包清单协议（`schema: "dislop.pack/2"`）。它整合社区核验过的去味规则与语料经验，帮你（的 Agent）在本地挑出并改掉 AI 寒暄与未填占位符、模板套话与反转口号、句式节奏异常，以及网页、SVG、图片与 PPT/PDF 版式模板味；不做通用安全路径扫描、WCAG 无障碍审计或通用 PDF/X 印前检查。

## 1. 三层产品形态与边界架构

```text
第 1 层：开源纯文档 Skill（`skills/dislop/SKILL.md` + `./references/*.md`，不含脚本，0 联网）
   └── 按文体与写作场景策略加载避坑参考卡，动笔前先避开套词、口号与过度润色漂移
   │
   ▼
第 2 层：开源本地 CLI 与编辑器插件（`< 380 KB` 压缩包，零依赖内置 7 套规则包 + 14.6 KB 传统集成模型，0 上传）
   ├── `dislop check [--pack <id|auto>] [--register <name>] [--deep] [--format text|json|agent|sarif|github|md]` -> 分场景校准命中 + 结构化改法提示 + 5 轴节奏体检
   ├── `dislop review`                                                   -> 显式授权的自备密钥 / 本地回环或离线多维审校（带场景策略与原文引用锁）
   ├── `dislop verify`                                                   -> 事实账本、关键术语、节奏起伏与口语/书面语域防漂移核验
   ├── `dislop patterns` / `voice` / `doctor`                            -> 6 维度模式库扫描、个人文风提取（`dislop.voice/1`）与零联网接入体检
   └── （注：仓内保留既有 `--mcp` 与 `dislop model` 选装模块，待真实语料盲评后再定保留范围）
   │
   ▼
第 3 层：闭源官方 MCP 与网页工作台（`https://dislop.com/mcp`、`/api/v1/*`）
   └── 免本地环境接入，登录后多模型按文体深度审校并返回结构化修改建议（供本地 Agent 结合上下文改稿），兼顾保留排版 Word/PPT 处理
```

`check` 只读不改稿。引擎通过等长空格掩码构造 `raw`、`prose` 与 `ui-text` 三层视图：代码块、行内代码、URL、HTML 标签/注释与引用样本不会触发正文误报，同时所有命中的行号与 Unicode 码点列号均与源文件严格对齐。

## 2. 双运行时与浏览器同源架构

| 模块 | 路径 | 职责 |
|---|---|---|
| JS 共享核心 | `src/core.mjs` | 纯标准 ES 模块（零 `node:*` 与 DOM 依赖，含 `auditText`、`auditOoxmlEntries`、`auditImageDocument`、`auditPdfDocument`、`analyzeTextProfile`、`getScenarioStrategy`、`resolveRegister`、`verifyRevisionBundle`、`extractVoiceProfileOffline`），由 Node CLI、MCP 与浏览器工作台直接共用 |
| 扩展模式库引擎 | `src/pattern-engine.mjs`, `src/dislop/pattern_engine.py`, `patterns/banks/*.json` | 多角度执行 12 条扩展模式库探针（`dislop patterns`、`dislop check --patterns`），Node 与 Python 100% 一致 |
| 随包内置传统集成模型 | `models/pocket-slop-v1.json`, `src/pocket-model.mjs`, `src/dislop/pocket_model.py` | 零依赖去词面化 INT8 N-gram 语言模型 + 24 维线性归因 + 45 棵浅层梯度提升树 + 5 场景自动路由（`14.6 KB` gzip / 原始 `49.0 KB`，离线 `< 0.5 ms`，在 `stealth-vapor-v1` 上 F1 `100.0%`、干净误报 `0.0%`） |
| 硬件探测与选装小模型管理 | `models/manifest.json`, `src/local-model.mjs`, `src/dislop/local_model.py` | 检测本机内存与磁盘预算，按需选装 `fast`（`0.6B`）/ `balanced`（`1.7B`）/ `quality`（`4B`）权重（支持 `install`、离线 SHA-256 `import`、`remove`），并在本地自动改写 `deslop --local` 中内置分场景策略、数字与限定词核对 |
| Node 二进制解析与 BYOK 客户端 | `src/binary-node.mjs`, `src/review-client.mjs` | 基于标准库 `zlib` 解析 `.docx`/`.pptx` ZIP、`.png`/`.jpg`/`.webp`/`.gif`（含 LZW 首帧像素统计）及 `.pdf` 版式，并提供零外部依赖 `dislop.review/1` 自备密钥审校与脱敏引用核验 |
| Node CLI 与 MCP | `bin/dislop.mjs`, `bin/dislop-mcp.mjs` | 严格参数校验命令行（`check [--pack <id|auto>] [--register <name>] [--rule <ids>] [-q] [--deep] [--compact] [--profile] [--ml] [--patterns] [--changed [ref]] [--staged] [--format text|json|agent|sarif|github|md]`、`verify [--register <name>]`、`review`、`doctor`、`patterns`、`voice`、`model`、`setup`、`deslop --local`、`explain`、`packs`、`catalog`、`resources`、`pack-test`、`init`）、用户级与项目级配置链（`~/.config/dislop/config.json` + `voice.json`）及本地 stdio MCP |
| Python 核心与接口 | `src/dislop/{engine,pattern_engine,pocket_model,local_model,review_client,cli,mcp_server}.py` | 纯 Python 3.10+ 标准库实现，通过 66 项 Python `unittest`（一致性、CLI 参数、语体与修订校验、BYOK 安全与引擎单测）与 Node 保持一致 |
| 多平台清单与编辑器集成 | `scripts/sync_manifests.mjs`, `plugin.json`, `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.agents/plugins/`, `gemini-extension.json`, `integrations/{antigravity,vscode,orca,herdr,hooks}/`, `server.json`, `action.yml`, `.pre-commit-hooks.yaml` | 由同一份元数据配置生成并校验 npm、PyPI、Official MCP Registry（`https://dislop.com/mcp`）、Agent Plugins 1.0、Claude Code、Codex、Cursor、Antigravity、VS Code / Open VSX 与 GitHub Action 清单，消除跨市场版本与 Schema 漂移 |
| 规则包与反模式库 | `packs/*/pack.json`, `patterns/dimensions/*.json`, `patterns/ai-tic-rubric.json` | 7 套内置 `dislop.pack/2` 规则包（`core`、`business-brief`、`engineering-spec`、`regulated-comms`、`literary-essay`、`deck-and-ui`、`executive-deck`，共 53 条活跃规则、230 项正反样本与分场景语体断言）、6 维度 7 角度 65 条结构化反模式库（53 条规则映射 + 12 条扩展模式库规则）与五层 AI 口癖交叉准则 |
| 官方托管云端与远程 MCP | 独立闭源 `dislop-cloud`（`https://dislop.com/mcp`、`/api/v1/*`） | 闭源托管 MCP v2 服务，提供 10 个工具（`dislop_check`、`dislop_verify`、`dislop_rules` 免登录 0 额度；OAuth 2.1 或免费 `dslp_*` 密钥每月 30 额度，用于 `dislop_review`、`dislop_deslop`、`dislop_office`、`dislop_visual_review`、`dislop_voice_extract`、`dislop_voice_manage`、`dislop_account`），后端调用付费版 Google Gemini 接口且不拿稿子训练 |
| 离线效果基准评测（`dislop-bench v2`） | `benchmarks/`、`scripts/run_benchmark.mjs`、`scripts/run_visual_benchmark.mjs`、`scripts/pattern_lab.mjs`、`scripts/run_text_paradigm_experiments.py` | 112 份核心检测样本 + 154 份多角度反模式样本 + `visual-design-v1` 60 份视觉设计样本（Node/Python 一致率 `100.0%`）+ 18 组端到端改稿任务（`D1=45 / D2=20 / D3=25 / D4=10`）、`--eval` 与盲评表导出 |
| 官网静态编译器与内容层 | `scripts/build_site.mjs`, `scripts/lib/site_content.mjs`, `content/guides/*.md` | 零依赖编译器，将 `src/core.mjs`、`packs/`、`skills/`、`content/guides/`、`docs/research/content-kb/sources.json`、`docs/brand*`、`ROADMAP*.md` 与 `anti-slop-radar-index.json` 同源编译为 119 个静态 HTML 页面（`/`、`/en/`、`/guides/`、`/en/guides/`、`/rules/`、`/en/rules/`、`/awesome/`、`/en/awesome/`）、Atom 订阅（`/feed.xml`、`/en/feed.xml`）、JSON-LD `@graph`、双向 `hreflang`、显式放行 AI 检索爬虫的 `robots.txt` 及 `awesome/README*.md` |
| 专题研究、知识库与语言识别隔离 | `docs/research/`, `docs/research/content-kb/sources.json`, `.gitattributes` | 90 条核验 Awesome Anti-Slop 数据源（`dislop.radar/2`）、55 条资料库索引（`dislop.kb/1`，经 `tests/test_site.mjs` 锁死不进 npm/PyPI 发包）、开源增长策略，以及 `.gitattributes`（`linguist-generated=true`）保证仓库主语言识别为 JavaScript / Python |

### 将审校建议写回原文

审校支持的文本文件时，JSON 报告用 `sourceSha256` 记录原文件 UTF-8 字节的摘要。可直接采用的建议包含 `edit`，其中 `id` 是该建议在报告中的序号（从 1 开始），`start` 是按 Unicode 码点计数的起始位置（从 0 开始），`before` 是原文，`after` 是替换文本。空字符串表示删除。模型给出了明确的替换文本，且引文在本次审校片段中可唯一定位时，才会生成可执行修改。标准输入和从 Office 文件提取的文字不生成写回信息。

Node 和 Python 命令可互读审校报告。两端共用 Vim 临时缓冲区展示建议，将用户选中的编号交回命令行。`review --interactive-apply` 与 `apply --review-file … --source-file …` 都先核对文件摘要、原文和选区重叠，再以原子替换写回文件。

## 3. 覆盖率诚实原则与退出码

未经检查的内容绝不伪装成“0 问题”：

- `0` — 已完成检查，且高于或等于 `--fail-on`（默认 `error`）的命中数为 0。
- `1` — 存在达到 `--fail-on` 阈值的命中项（或启用 `--report-unused` 时存在失效豁免注释）。
- `2` — 参数错误、目标路径不存在，或显式指定的单个文件无法检查（如损坏的 Office 压缩包或非 UTF-8 编码文本）。

## 4. 官网静态部署（`dislop.com`）

`site/` 产物为纯静态文件，通过单一域名 `https://dislop.com` 静态托管（配置 HSTS 与 `Content-Security-Policy` 锁死 `connect-src 'self'`，零第三方字体、统计与外域请求，不拆独立子域名）。默认离线确定性检查完全在浏览器内存中完成、零上传；仅当用户主动点击工作台 AI 按钮、领取免费 Token 或连接远程 MCP 时，才经由同源 `/api/v1/*` 或 `/mcp` 转发至托管 `dislop-cloud` 服务。按 `PRODUCT.md` 的全球英文优先规范，静态路径正从 `v0.8.2` 的 `/` + `/en/` 收敛为根路径 `/` 默认纯英文（`x-default`）、`/zh/` 承载原生中文（保留 `/en/*` `301` 兼容），配合 `navigator.languages` 自动引导与右上角一键手动切换，中英文页面的样稿、规则例句、头图与 90 条清单摘要各自独立制作、严格不混排：

- **面向人类**：首屏一键「复制发给 Agent」提示句、实时三态示例卡、3 组可复制分享的前后对照案例（`/#cases`）、零上传浏览器工作台（`/#workbench`，支持一键「贴我的稿子」、离线 `#share=v1.*` 压缩分享链接与 `#try=<ruleId>` 直达试用、测后安装/GitHub 引导）、清晰的 5 种使用方式（`/#surfaces`）、6 组双语实用指南（`/guides/`、`/en/guides/`）、99 个规则百科页（`/rules/`、`/en/rules/`，附改法要点与 PR/群聊引用复制）、90 条网页筛选工具清单（`/awesome/`）与分享/Star 引导区（`/#share`）。
- **面向外部 Agent 与检索爬虫**：技术端点列表与 53 条规则明细表在页面中用 `<details>` 折叠（不打扰普通访客，同时在静态 HTML 与 DOM 中完整保留），并同步提供机器自动发现文件与纯文本直连端点（`/.well-known/mcp/server-card.json`、`/.well-known/mcp.json`、`/.well-known/agent-skills/index.json`、`/llms.txt`、`/catalog.json`、`/index.md`、`/roadmap.md`、`/feed.xml`、`/en/feed.xml`、`/tasks/*.md`、`/methodology/*.md`、`/cases/*.md`、`/tools/*.md`、`/packs/*.md`、`/rules/*.md`、`/awesome/index.{json,md}`、`/llms-full.txt`）；`robots.txt` 显式放行 `Googlebot`、`Bingbot`、`OAI-SearchBot`、`ChatGPT-User`、`Claude-SearchBot`、`Claude-User` 与 `PerplexityBot` 并屏蔽 `/api/` 与 `/mcp`。构建期自动执行体积预算（`llms.txt <= 2,600 B`、`sources.json <= 80 KB`）、链接可达性、剔除 `fixtures.hit`、去除 HTML 注释/不可见字符及 `/en/**` 零汉字校验。
