# `awesome-anti-slop` MVP 工程启动模板与治理边界草案

> 配套主报告：[awesome-anti-slop-topology-design.zh-CN.md](../awesome-anti-slop-topology-design.zh-CN.md) · 数据契约：[radar-v3-contract.json](./radar-v3-contract.json)
>
> **状态说明（2026-11-23）**：本文为达阈值拆仓（条目 `>= 150` 或月均有效外部 PR `>= 20`）时启用的备用启动模板；当前冷启动阶段清单继续随主仓构建至 `https://dislop.com/awesome/` 与 `/en/awesome/`（锁定 `CSP: connect-src 'self'`）。

本草案收敛 `dislop-ai/awesome-anti-slop` 建仓首日所需的四组最小可执行规范：中立治理宪章骨架、自动化 CI 流水线分工、投稿入口模板，以及与 `dislop` 主仓静态站同步的离线边界。

---

## 1. 中立治理宪章骨架（`CONTRIBUTING.md` 核心条款）

1. **维护方透明披露**：本仓库由 `dislop-ai` 发起并维护，数据以 `CC0-1.0` 协议开放。宿主组织的自有工具与其他开源项目遵守完全相同的字段规范、排序规则与审核标准，且仅作客观维护方标识，不设推广置顶或商业横幅。
2. **四条硬性准入门槛**：
   - 提供可公开访问与核验的真实 URL（开源仓库、论文、公开规范或可验证工具站）；不收录空壳占位仓、纯付费黑盒广告页或无公开代码的营销落地页。
   - 描述限定为一句客观机制说明（英文 `<= 160` 字符，中文 `<= 90` 汉字），说明「适用媒介、介入阶段与核心机制」，禁止堆砌主观营销形容词。
   - 开源软件与技能须在公开仓库中具备清晰用途与可查证产出；新建仓库建议具备至少 14 天公开历史或完整可复现示例，降低一次性垃圾投稿噪音。
   - 涉及「绕过学术查重」「降低 AIGC 检测率」或「去除音频/图像水印」的项目，统一归入 `contrast-and-detection` 分栏并标记 `status: contrast-watch`，附客观风险提示，与常规写作/设计/工程工具严格分区。
3. **两档生命周期机制**：
   - 上游显式归档（`archived: true`）或连续 2 次周度巡检返回 HTTP `404/410`，自动标记 `archived` 或进入下架复核。
   - `kind: software` 类项目若默认分支超过 18 个月无提交，标记为 `stale`；`kind: skill-doc` 与 `kind: research-policy` 类稳定规则文档及经典论文标记为 `historical-baseline`，不因提交频率低而误删。
4. **门禁中立纪律**：PR 自动校验仅检查 `dislop.radar/3` Schema、URL 归一化去重、HTTP 可达性与基本反广告词规则；**绝不使用 `dislop` 的主观文体包（`business-brief` / `literary-essay`）拦截第三方项目简介**。仅对自动生成的 `README.md` 与 `README.zh-CN.md` 执行 `dislop check --pack core --fail-on error`，防止泄漏路径、占位符或对话残迹。

---

## 2. 四条 GitHub Actions 流水线职责分工

| 工作流文件 | 触发条件 | 核心步骤 | 输出与阻断规则 |
|---|---|---|---|
| `pr-validate.yml` | `pull_request`（改动 `data/` 或 `scripts/`） | 1. 校验 PR 未手改自动生成文件（`README.md`、`README.zh-CN.md`、`dist/*`）<br>2. 执行 `node scripts/validate.mjs --changed`（Schema、枚举、URL 归一化去重、字符上限与营销词检查）<br>3. 检查新增/修改 URL 的 HTTP 200 可达性<br>4. 预试跑 `node scripts/build.mjs --dry-run` 并对临时产物执行 `dislop check --pack core --fail-on error` | 任一项失败直接红灯阻断，机器人回帖精准指出违规字段，减少人工往返沟通 |
| `build-and-sync.yml` | `push` 到 `main`（改动 `data/` 或 `scripts/`） | 1. 运行 `node scripts/build.mjs` 重新生成 `README.md`、`README.zh-CN.md`、`dist/radar.json`、`dist/llms.txt`、`dist/llms-full.txt`<br>2. 计算 `dist/radar.json` 的 SHA-256 摘要，若有产物变更则以 `[skip ci]` 自动提交<br>3. 向 `dislop-ai/dislop` 发送 `repository_dispatch`（事件类型 `radar-updated`，载荷仅含 `commitSha` 与 `sha256`） | 保持 GitHub 展示面与机读产物 100% 一致；跨仓仅传递版本指针，不直推主仓 `main` 分支 |
| `weekly-health.yml` | 每周定时（`cron`，如每周一 UTC 03:00）+ `workflow_dispatch` | 1. 运行 `node scripts/refresh-metrics.mjs` 刷新 GitHub 仓的 `stars`、`pushedAt`、`archived`、`license` 与 `verifiedAt`<br>2. 运行 `lychee` 执行死链巡检；首周失败记入临时计数，连续 2 周失败才开启单个汇总清理 Issue<br>3. 按 `kind` 自动更新 `stale` / `archived` 状态并开一条周度汇总 PR | 零日常手工点检；维护者只需在每周固定窗口审核一条汇总 PR |
| `triage-hygiene.yml` | `issues` / `pull_request` 创建与每日定时 | 1. 对通过 `submit-resource.yml` 提交的规范 Issue 自动解析字段并创建草稿 PR<br>2. 对缺失公开 URL 或 30 天无响应的待补全议题自动提醒并温和关闭 | 把开放议题稳定控制在两位数区间，杜绝千级垃圾积压 |

---

## 3. 投稿入口模板设计（双轨制）

### 3.1 PR 检查清单（`.github/pull_request_template.md` 关键项）

- 仅新增或修改 `data/entries/<id>.json`，未手工修改 `README.md`、`README.zh-CN.md` 或 `dist/`。
- `url` 已去除无关追踪参数（如 `utm_*`），且未与现有条目重复。
- `summaryEn` 与 `summaryZh`（可选，缺省由审校补全）为单句客观机制描述，不含主观排名或宣传词。
- 若项目主打绕过查重、降低检测率或去水印，已正确归入 `contrast-and-detection` 并设 `status: contrast-watch`。

### 3.2 非开发者表单（`.github/ISSUE_TEMPLATE/submit-resource.yml` 字段）

表单仅要求填写 6 个必填字段，降低编辑、写作者与设计师的参与门槛：

1. 资源名称（如 `owner/repo` 或公开标准全称）
2. 公开链接 URL（GitHub 仓库、论文或工具主页）
3. 所属分栏（下拉选择 8 大分栏）
4. 资源形态（下拉选择 `software` / `skill-doc` / `research-policy` / `directory`）
5. 适用媒介与语种（多选）
6. 一句客观机制说明（必填，限制 160 字符内）

---

## 4. `dislop` 主仓静态站同步与零上传安全边界

为了在不破坏 `dislop` 现有 `CSP: connect-src 'none'` 与离线测试红线的前提下接入官网目录，主仓侧同步遵守三条硬约束：

1. **快照拉取与网站构建彻底解耦**：
   - `dislop` 主仓新增独立工作流 `.github/workflows/sync-radar-snapshot.yml`（仅由 `repository_dispatch: radar-updated` 或手动触发）。该工作流拉取 `awesome-anti-slop` 指定 Commit SHA 的 `dist/radar.json`，验证 SHA-256 与 `dislop.radar/3` Schema 后写入 `vendor/radar-snapshot.json`，并自动开启 PR。
   - `scripts/build_site.mjs` **绝不发起网络请求**，始终仅读取本地 `vendor/radar-snapshot.json` 完成离线构建。
2. **预编译 ES 模块满足 `CSP: connect-src 'none'`**：
   - `scripts/build_site.mjs` 把 `vendor/radar-snapshot.json` 编译为四份静态产物写入 `site/`：
     - `site/radar/radar-data.mjs`：供 `site/radar/radar.js` 本地 `import` 的静态数据模块，页面交互筛选 0 网络请求，完全兼容 `connect-src 'none'`。
     - `site/radar/index.html`：复用 `site/styles.css` 清样栅格与浅/深色阶的交互目录页，`<head>` 中声明 `<link rel="alternate" type="text/markdown" href="./index.md">` 与 `<link rel="alternate" type="application/json" href="./index.json">`。
     - `site/radar/index.json` 与 `site/radar/index.md`：面向外部脚本、爬虫与 AI Agent 的原生静态只读端点。
     - `site/llms.txt`：位于站点根路径，统一索引工作台、`CLI / MCP` 文档、规则包目录与 `/radar/index.md`、`/radar/index.json`。
3. **跨端自检范围隔离**：
   - `dislop` 主仓 CI 继续对 `site/radar/index.html` 执行 `deck-and-ui` + `core` 审校，确保目录页面零死控件、对比度达标、零紫粉渐变或套盒堆叠。
   - `vendor/radar-snapshot.json` 与外部条目摘要仅接受 Schema 与 `core` 不变量检查（防路径泄露与占位符），不纳入主仓文体包阻断范围，避免因为某条第三方项目原名触发误报而卡死官网同步。
