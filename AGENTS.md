# AGENTS.md

写给在 `dislop` 仓库里干活的人和 AI 助手：规则放哪一层，字怎么写，哪些线不能踩，改完怎么验收。

## 1. 规则放哪一层

`dislop` 只做跟**去 AI 味**直接相关的确定性检查，不做通用的 WCAG 无障碍审计、PDF 预检、安全路径扫描或改稿事实比对。能从词法与句法结构、HTML/CSS/JSX 标记、Word/PPT Open XML 结构判定的 AI 味与残留问题，都写成确定性探针，在 JS 核心 `src/core.mjs` 与 Python 实现 `src/dislop/engine.py` 里各实现一遍，离线运行，不交给高波动的大模型主观打分。

明显的 AI 交付残留放进 `packs/core/`：留在正文里的 AI 寒暄、未填占位符、贴进 Word/PPT 没渲染的裸 Markdown、AI 网页里的空链接与占位禁用按钮。这一层固定为 `error`，所有文体包默认开启。因场景而异的 AI 套话与模板味放进各自的 `packs/<pack-id>/`，默认 `warning` 或 `info`，每条写清删掉会损失什么，并附原句、换了种 AI 味的改过头版本，以及改干净版本三段对照。

三个运行时要给出同一个结果。浏览器工作台（`site/`）与 Node CLI/MCP（`bin/`）共用零依赖 ES 模块 `src/core.mjs`；Python CLI/MCP（`src/dislop/`）须通过 `tests/test_conformance.py`，与 Node 跑同一组公开样本与 `dislop pack-test`。在技术、规则与评测优先级上始终以**英文（全球）语料精度与母语干净稿零误报**为第一基准，中文规则（`zh-*`）与双语评测同步跟进且不得拉低英文精度。仓库自身的文档、网站（`site/`）、`awesome/`、SVG 资产与 CLI 输出均受 `dislop check . --fail-on warning` 约束。

## 2. 写给人看的字与全球优先基准

`0 findings` 只说明没踩中规则，不代表文字不像 AI 写的。动笔前先对照 [PRODUCT.md](./PRODUCT.md) 对齐全球英文优先定位、用户阶梯、卖点与一句话介绍，再读 [docs/brand-and-voice-guide.md](./docs/brand-and-voice-guide.md)（中文见 [docs/brand-and-voice-guide.zh-CN.md](./docs/brand-and-voice-guide.zh-CN.md)），按朴实、轻松、直接的开发者口吻写（参考 ASD-STE100 简化技术表达），守住七条：

1. 第一句落在具体的东西上：一段原文、一个文件、一个数字或一条命令，不说空话。
2. 不写三段对称分号推销句，不写段尾“金句”收尾（如 `笔一直在你手里`），不穿校对编辑戏服（如 `可以付印`、`页边问你一句`、`蓝笔商榷`、`同路清单`）。
3. 同一个概念全站叫同一个普通名字（英文 `hard bug` / `warning` / `passed` / `rejected` / `Awesome list`；中文 `硬伤` / `提醒` / `通过` / `没通过` / `工具清单`），不为了显得有变化来回换词。
4. 内部叫法不出门。`Level 0`、`L0–L3`、`Stage-3`、`双引擎`、`负向防线`、`正向牵引`、`三带熵`、`人机双读`、`单一事实源`、`P0/P1` 只留在 `docs/research/`，对外换成用户自己会说的话。
5. 同一屏里，同一个数字只说一次，不反复念经。
6. 小标题是一句人话。不加编号眉题（`00 / ...`），不拿全大写等宽标签当标题。
7. **文档、物料与站点坚持英文（全球）优先，中英文独立成稿且绝不混排**。主干规范（`PRODUCT.md`、`README.md`、`ROADMAP.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`docs/*.md`、`skills/*/SKILL.md`）、协议描述与默认视觉物料（`og-card.png`、`-en-v2` 动图、纯英文官号 `@dislop_ai`）以英文为第一事实源；中文对应文档（`*.zh-CN.md`）与中文物料按母语习惯独立制作，不做逐字互译。全站守单一域名 `dislop.com`（不拆子域名），站点以根路径 `/` 提供默认纯英文静态页（`x-default`）、`/zh/` 提供原生中文静态页，旧路径 `/en/*` 保持 `301` 跳转，保留按浏览器语言自动引导与一键手动切换；中文页不夹英文样本，英文页不夹中文说明。

## 3. 安全、样本与隐私红线

- **零凭据与私密信息入库**：严禁在代码、测试样本、配置或提交记录中写入 API Key、Token、Cookie、本机真实用户目录、内网主机地址或非公开项目材料。本机专用禁词放在 Git 忽略的 `.dislop.local.json`。
- **样本脱敏与不编造事实**：纳入 `packs/` 或 `tests/` 的正反例样本须为原创构造或明确允许再分发的公开材料，每条 `exemplar` 记录 `source` 字段，且 `good` 改写稿不得凭空编造原句没有的事实或数值。
- **离线确定性测试**：单测默认离线运行，严禁发起外部网络请求或调用付费模型接口；网站严禁加载第三方字体、统计脚本或外域请求（`connect-src 'self'`），离线检查保持默认零上传，仅在用户主动点击云端 AI 按钮时发往同源付费模型端点。

## 4. 日常更新与发版怎么跑

按改动范围选最短路径，不做机械的全套发包（完整指南见 [docs/releasing.zh-CN.md](./docs/releasing.zh-CN.md)）：

- **先看现场与对外出口状态**：开工或收口前跑 `npm run release:status`，1 秒核对本机 `HEAD`、GitHub Release（含 `.vsix`）、仓库与组织简介、`dislop.com`（静态站 + `/api/health`）、`npm`、`PyPI` 与官方 MCP Registry 是否同号对齐。
- **第 1 档（仅官网、文案或工具清单微调）**：未改动 `src/`、`bin/`、`packs/`、`patterns/`、`skills/` 与 `integrations/` 时，**不升版本号、不发包**；跑通 `npm run release:check` 推 `main` 并同步官网静态目录即可。
- **第 2 档（补丁发版 `0.Y.Z`）**：新增或修改规则须在对应 `pack.json` 补至少 1 条 `fixtures.hit` 与 1 条 `fixtures.clean`；修改 CLI 参数、MCP 协议或规则包结构须同步更新 `README.md`、`README.zh-CN.md`、`docs/architecture.md` 与 `docs/architecture.zh-CN.md`；补齐 `CHANGELOG.md` 后跑 `npm run release -- <X.Y.Z> [--deploy] --commit --tag --push`，最后用 `npm run release:status` 验真全出口同号。
- **第 3 档（特性 / 里程碑发版 `0.(Y+1).0`）**：当包数、规则数、模式数或工具数变化时，`release:check` 会自动拦截仓内文档数字滞后；发版后同步更新 GitHub 仓库简介（`gh repo edit`）、组织主页（`dislop-ai/.github`）、`ROADMAP*.md` 勾选与到期 Milestone，再由 Agent 按内容价值决定是否在官方号发帖（补丁小修静默不刷屏）。

## 5. GitHub 与多 Agent 并行协作约定

1. 开工前先对齐现场：先看 `git status --short`、`git log -n 10 --oneline`、开放 Issue（`gh issue list`）和近期 Discussions，避免和协作者或另一台并行 Agent 撞车。
2. 多会话同仓防踩踏：若工作区存在其他并行会话尚未提交的文件，**严禁执行 `git add -A` 或直接在脏工作区跑 `release --commit`**；先显式 `git add <本任务路径>` 提交，再建临时干净 Worktree（`git worktree add --detach /tmp/dislop-rel HEAD`）执行发版与推送，推完立即移除临时 Worktree。
3. 认领与分支管理：较大改动先在对应 Issue 留一句或挂 `Assignee`；文案微调、小修和发版可直接快进推 `main`，新功能、改规则或跨模块改动拉短分支（`feat/...`、`fix/...`、`docs/...`）提 PR，正文写 `Closes #<编号>`，CI 通过即可合入并自动删分支。
4. 不记两套账：日常进度只记在 GitHub Issue 与看板，不在仓库里另建零散待办清单；`ROADMAP.zh-CN.md` 与 `ROADMAP.md` 只在发版或大里程碑收口时统一勾选。
5. 公开与私有边界：商业计费、配额策略、运营台账与本机路径只放私有仓 `dislop-cloud` 或本地忽略目录（`.private/`），严禁写入公开 Issue、PR、Discussions 或提交说明。
