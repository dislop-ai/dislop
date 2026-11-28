# dislop

[English](./README.md) | 简体中文

**去 AI 味才是真正的生产力！**

`dislop` 是一款构建在零第三方运行时依赖 Node.js（`>= 20`）微内核上的可插拔文稿与交付物 Linter。它在正式发稿、提交 PR 或导出客户交付物前，自动审计 Markdown、纯文本、HTML/CSS/JSX/TSX/SVG、Word（`.docx`）、PowerPoint（`.pptx`）、PDF 与位图图片，将客观交付**缺陷（Defect）**与非阻断的文风去 AI 味**建议（Suggestion）**严格隔离。

架构细节详见 [docs/architecture.md](./docs/architecture.md)，自定义规则包开发指南详见 [CONTRIBUTING.md](./CONTRIBUTING.md)，多语言测试样本文稿位于 [slop-samples/](./slop-samples/)（[`zh-CN.md`](./slop-samples/zh-CN.md)、[`en.md`](./slop-samples/en.md)）。

## 核心设计

1. **微内核 + 分阶段按需加载规则包（`dislop/sdk`）**：
   - 微内核负责物理坐标解析（`DocumentModel`）、不可变安全与防提示词注入约束、双层事实守恒门禁（Dual Post-LLM Fact Gate）、三层模型路由、无损坐标写回与 CI 退出码仲裁。
   - 语言与场景规则封装在 `packs/<语言或通用域>/<场景>/{pack.json,scripts/,prompts/}` 下（涵盖 `common/*` 跨语言结构检查及 `zh/*`、`en/*` 在 `artifact-qa`、`prose`、`web-ui`、`slide-deck` 四大场景的专属规则包），`scripts/` 与 `prompts/` 均按实际执行阶段惰性加载。
2. **双轨分类体系（`Defect` vs. `Suggestion`）**：
   - **文风建议绝不阻断 CI**：所有去 AI 味诊断均归为 `Suggestion`（`strong | moderate | hint`），在任何场景下恒返回 **退出码 `0`**（SARIF 中严格映射为 `"note"`）。
   - **客观交付事故拦截 CI**：未替换的 `[公司名称]` / `[TODO]` 占位符、遗留的 AI 助手寒暄壳、泄露的 `[oaicite:1]` 引用标记、空链接/死链以及漏进 `.docx`/`.pptx` 的裸 Markdown 语法归为 `Defect`（`error | warning`），仅由确定性 `scripts/` 抛出；存在未解决的 `Defect: error` 时返回 **退出码 `1`**。
3. **本地隐私优先 + 三层模型语义增强**：
   - 默认运行在 `--engine local` 本地模式（零外网上传），执行毫秒级确定性脚本检查，并可通过 [Ollama](https://ollama.com) 挂载 Tier 3 本地小模型（`dislop model pull`；若本机未安装 Ollama，CLI 会自动回退至离线规则并提示安装方式）。
   - 按需启用 `--engine auto`、`--engine cloud`（`dislop login`）或 `--engine byok`（支持 OpenAI 兼容网关、Anthropic、Gemini、本地代理及 Ollama/vLLM），首次向外部域名发送文本前受域名隐私授权门禁（`privacy-gate.mjs`）保护。
4. **双层事实守恒与防注入门禁（Fact Gate）**：
   - 任何改写候选在展示或落盘前，均强制校验数字、量纲单位、百分比、URL、行内代码与专有名词未丢失、未捏造，并执行规则包自带的 `verifyFix()` 二阶口号回归拦截。

## 快速上手

```bash
# 1. 只读检查（默认本地运行，零外网上传，自动识别中文文稿挂载 zh/* 规则包）
npx --yes dislop check slop-samples/zh-CN.md

# 2. 输出面向 Coding / Writing Agent 的紧凑结构化流
npx --yes dislop check docs/ --format agent

# 3. 终端逐块交互式审校（支持 y/n/e/p/a/A/s/u/q 快捷键）
npx --yes dislop fix draft.md

# 4. 非交互式批量自动清理经校验的 fixSafety === "safe" 项并备份原文件
npx --yes dislop fix draft.md --auto --backup

# 5. 校验人工或 Agent 改稿前后的事实与指标是否守恒
npx --yes dislop verify --git HEAD draft.md
```

## 中文去 AI 味实战用例（基于 `slop-samples/zh-CN.md`）

以下所有输出均基于仓库内的真实中文样本文稿 [slop-samples/zh-CN.md](./slop-samples/zh-CN.md) 实测采集，未做任何人工删改。

### 用例 1：离线零 Token 确定性排查（`--no-llm`）

仅加载 `common/artifact-qa`、`zh/artifact-qa` 与 `zh/prose` 的 `scripts/` 钩子（完全不读取 `prompts/`），毫秒级揪出遗留寒暄壳（`当然可以！以下是为您润色后的…` / `希望以上内容对您有所帮助！`）、内部检索标记 `[oaicite:1]`、未填占位符 `[公司名称]` / `[TODO: 确认故障负责人]`、空死链，以及中文高频宏大叙事起手式、句首铺垫套话、机械自问句、“不是…而是…”伪深刻句壳与四字口号排比串：

```bash
dislop check slop-samples/zh-CN.md --no-llm --format agent
```

```text
# dislop file=slop-samples/zh-CN.md engine=deterministic defects=8 suggestions=6
[P1-S1|L1] DEFECT(error,safe) zh/artifact-qa/chatbot-artifact
  quote: "当然可以！以下是为您润色后的第三季度存储集群迁移复盘报告。"
  reason: 正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。
  fix: DELETE
[P3-S2|L5] DEFECT(error,safe) common/artifact-qa/chatbot-citation-leak
  quote: "[oaicite:1]"
  reason: Internal AI search/citation token leaked into output text.
  fix: DELETE
[P3-S2|L5] DEFECT(error,manual) zh/artifact-qa/unfilled-placeholder
  quote: "[公司名称]"
  reason: 正文中存在未替换的中文模板占位符或默认假文。
  prompt: 发稿前请将“[公司名称]”替换为真实信息，或直接删去该未完成句。
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/unfilled-placeholder
  quote: "[TODO: 确认故障负责人]"
  reason: Unfilled developer or template token left in deliverable.
  prompt: Replace '[TODO: 确认故障负责人]' with the real value before publishing, or remove the unfinished sentence.
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/empty-link-target
  quote: "[值班应急手册]()"
  reason: Link has an empty destination URL.
  prompt: Provide a valid destination URL or unwrap the link.
[P9-S1|L17] DEFECT(error,safe) zh/artifact-qa/chatbot-artifact
  quote: "希望以上内容对您有所帮助！"
  reason: 正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。
  fix: DELETE
[P9-S2|L17] DEFECT(error,safe) zh/artifact-qa/chatbot-artifact
  quote: "如果您需要进一步调整，请随时告诉我。"
  reason: 正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。
  fix: DELETE
[P5-S2|L9] DEFECT(warning,manual) common/artifact-qa/placeholder-dead-link
  quote: "[故障时间线](#)"
  reason: Placeholder non-navigating link target '#'.
  prompt: Wire a real destination URL or use a <button type="button"> control.
[P3-S1|L5] SUGGESTION(strong,safe) zh/prose/hollow-transition
  quote: "在当今数字化转型加速推进的时代浪潮下，这一举措无疑具有举足轻重的战略意义。"
  reason: 零信息增量的宏大叙事套话，执行破坏性删除测试后不影响上下文事实与因果推进。
  fix: DELETE
[P5-S1|L9] SUGGESTION(strong,review) zh/prose/unprompted-negation
  quote: "这不是一次简单的参数微调，而是核心结账链路可靠性基线的重建。"
  reason: 移除无前文语境支撑的“不是…而是…”伪深刻对比壳，直接陈述后半句内容。
  fix: "这是核心结账链路可靠性基线的重建。"
[P8-S1|L15] SUGGESTION(strong,safe) zh/prose/hollow-transition
  quote: "展望未来，我们将继续砥砺前行，构筑更加稳健的数字底座！"
  reason: 零信息增量的宏大叙事套话，执行破坏性删除测试后不影响上下文事实与因果推进。
  fix: DELETE
[P4-S1|L7] SUGGESTION(moderate,safe) zh/prose/throat-clearing
  quote: "值得注意的是，PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。"
  reason: 删去无实质信息的句首套话铺垫，直接进入具体陈述。
  fix: "PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。"
[P4-S2|L7] SUGGESTION(moderate,review) zh/prose/rhetorical-self-qa
  quote: "为什么这一点如此重要？"
  reason: 移除机械的助手式自问过渡句，让后一句直接给出结论。
  fix: DELETE
[P6-S1|L11] SUGGESTION(moderate,manual) zh/prose/four-char-slogan-triad
  quote: "全面赋能、协同联动、闭环管理"
  reason: 连续堆砌三个及以上空洞四字套话排比，缺乏具体动作或边界信息。
  prompt: 删去四字口号排比串，保留或改写为原文中实际发生的具体改动：[填入具体机制或动作]
```

### 用例 2：一键安全剥离寒暄壳与零信息空话（`fix --auto --dry-run`）

在自动化流水线或提交前钩子中，`dislop fix --auto` 仅自动执行 `fixSafety === "safe"` 的确定性清理项（移除首尾助手寒暄、`[oaicite:1]`、宏大背景空话、文末口号与“值得注意的是，”前缀），完整保留 `142ms`、`18ms`、`64%`、`{{cluster_region}}` 等全部技术参数，并将需要人工拍板的 `[公司名称]`、`[TODO: 确认故障负责人]` 与空链接留待人工补齐：

```bash
dislop fix slop-samples/zh-CN.md --auto --dry-run --no-llm
```

```diff
--- a/slop-samples/zh-CN.md
+++ b/slop-samples/zh-CN.md
@@ -1,1 +1,1 @@
-当然可以！以下是为您润色后的第三季度存储集群迁移复盘报告。
+# 第三季度存储层迁移复盘纪要
@@ -2,2 +2,2 @@
 
-# 第三季度存储层迁移复盘纪要
+根据您提供的会议纪要，我已将 [公司名称]（合作方某某科技）的核心发现梳理如下。
@@ -4,2 +4,2 @@
 
-在当今数字化转型加速推进的时代浪潮下，这一举措无疑具有举足轻重的战略意义。根据您提供的会议纪要，我已将 [公司名称]（合作方某某科技）的核心发现梳理如下 [oaicite:1]。
+PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。为什么这一点如此重要？通过 `--pool-mode=transaction` 启用事务级连接池后，空闲连接内存开销降低了 64%，且未中断任何活跃会话。
@@ -6,2 +6,2 @@
 
-值得注意的是，PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。为什么这一点如此重要？通过 `--pool-mode=transaction` 启用事务级连接池后，空闲连接内存开销降低了 64%，且未中断任何活跃会话。
+这不是一次简单的参数微调，而是核心结账链路可靠性基线的重建。请在周五前查阅 [故障时间线](#) 或打开 [值班应急手册]()，并将后续压测核验指派给 [TODO: 确认故障负责人]。
@@ -8,2 +8,2 @@
 
-这不是一次简单的参数微调，而是核心结账链路可靠性基线的重建。请在周五前查阅 [故障时间线](#) 或打开 [值班应急手册]()，并将后续压测核验指派给 [TODO: 确认故障负责人]。
+本次架构升级实现了全面赋能、协同联动、闭环管理，具体收益包括：混沌演练自动主从切换耗时控制在 9 秒以内，工作节点峰值 RSS 内存低于 4.2GB，慢查询日志采样阈值收紧至 50ms。
@@ -10,2 +10,2 @@
 
-本次架构升级实现了全面赋能、协同联动、闭环管理，具体收益包括：混沌演练自动主从切换耗时控制在 9 秒以内，工作节点峰值 RSS 内存低于 4.2GB，慢查询日志采样阈值收紧至 50ms。
+方案 A：周二将连接池参数灰度至欧洲分片。 / 方案 B：等账单冻结窗口结束后再推欧洲分片。待 SRE 团队签字确认后在此处补上第三季度错误预算消耗率。
@@ -12,7 +12,2 @@
 
-方案 A：周二将连接池参数灰度至欧洲分片。 / 方案 B：等账单冻结窗口结束后再推欧洲分片。待 SRE 团队签字确认后在此处补上第三季度错误预算消耗率。
-
-展望未来，我们将继续砥砺前行，构筑更加稳健的数字底座！
-
-希望以上内容对您有所帮助！如果您需要进一步调整，请随时告诉我。
-
+
```

### 用例 3：Tier 1 官方云端引擎（`--engine cloud`）

```bash
dislop login --token dslp_...
dislop check slop-samples/zh-CN.md --engine cloud --format agent
```

> **当前状态：** 适配新版 `dislop.report/1` 微内核协议的官方云端接口正在建设中，上线后将补充实测输出。

### 用例 4：Tier 2 自有密钥 / OpenAI 兼容网关深度语义审校（`--engine byok`）

在确定性规则基础上叠加前沿大模型语义理解，精准捕获绕过固定正则的隐性交付问题：面向委托人的交差过渡句（`根据您提供的会议纪要…` `[P3-S2|L5]`）、合作方占位假名（`某某科技` `[P3-S2|L5]`）、未二选一的并列排期草稿（`方案 A … / 方案 B …` `[P7-S2|L13]`）、混入正文的作者自留备忘（`待 SRE 团队签字确认后在此处补上第三季度错误预算消耗率。` `[P7-S3|L13]`），并直接将 `本次架构升级实现了全面赋能、协同联动、闭环管理，具体收益包括：…` 收敛为 `本次架构升级的具体收益包括：…`（`[P6-S1|L11]`）：

```bash
dislop check slop-samples/zh-CN.md --engine byok --provider gemini --format agent
```

```text
# dislop file=slop-samples/zh-CN.md engine=byok:gemini-3.8-flash defects=8 suggestions=10
[P1-S1|L1] DEFECT(error,safe) zh/artifact-qa/chatbot-artifact
  quote: "当然可以！以下是为您润色后的第三季度存储集群迁移复盘报告。"
  reason: 正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。
  fix: DELETE
[P3-S2|L5] DEFECT(error,safe) common/artifact-qa/chatbot-citation-leak
  quote: "[oaicite:1]"
  reason: Internal AI search/citation token leaked into output text.
  fix: DELETE
[P3-S2|L5] DEFECT(error,manual) zh/artifact-qa/unfilled-placeholder
  quote: "[公司名称]"
  reason: 正文中存在未替换的中文模板占位符或默认假文。
  prompt: 发稿前请将“[公司名称]”替换为真实信息，或直接删去该未完成句。
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/unfilled-placeholder
  quote: "[TODO: 确认故障负责人]"
  reason: Unfilled developer or template token left in deliverable.
  prompt: Replace '[TODO: 确认故障负责人]' with the real value before publishing, or remove the unfinished sentence.
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/empty-link-target
  quote: "[值班应急手册]()"
  reason: Link has an empty destination URL.
  prompt: Provide a valid destination URL or unwrap the link.
[P9-S1|L17] DEFECT(error,safe) zh/artifact-qa/chatbot-artifact
  quote: "希望以上内容对您有所帮助！"
  reason: 正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。
  fix: DELETE
[P9-S2|L17] DEFECT(error,safe) zh/artifact-qa/chatbot-artifact
  quote: "如果您需要进一步调整，请随时告诉我。"
  reason: 正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。
  fix: DELETE
[P5-S2|L9] DEFECT(warning,manual) common/artifact-qa/placeholder-dead-link
  quote: "[故障时间线](#)"
  reason: Placeholder non-navigating link target '#'.
  prompt: Wire a real destination URL or use a <button type="button"> control.
[P3-S1|L5] SUGGESTION(strong,safe) zh/prose/hollow-transition
  quote: "在当今数字化转型加速推进的时代浪潮下，这一举措无疑具有举足轻重的战略意义。"
  reason: 零信息增量的宏大叙事套话，执行破坏性删除测试后不影响上下文事实与因果推进。
  fix: DELETE
[P3-S2|L5] SUGGESTION(strong,review) zh/artifact-qa/implicit-assistant-framing
  quote: "根据您提供的会议纪要，我已将 [公司名称]（合作方某某科技）的核心发现梳理如下 [oaicite:1]。"
  reason: 向提示词提问者汇报的助手过渡句，并残留引用标记，不应出现在正式复盘文档中。
  fix: DELETE
[P5-S1|L9] SUGGESTION(strong,review) zh/prose/unprompted-negation
  quote: "这不是一次简单的参数微调，而是核心结账链路可靠性基线的重建。"
  reason: 移除无前文语境支撑的“不是…而是…”伪深刻对比壳，直接陈述后半句内容。
  fix: "这是核心结账链路可靠性基线的重建。"
[P7-S2|L13] SUGGESTION(strong,manual) common/artifact-qa/unchosen-draft-options
  quote: "/ 方案 B：等账单冻结窗口结束后再推欧洲分片。"
  reason: 正文中保留了头脑风暴期互斥的方案 A/B 草稿选项，未做最终定夺。
  prompt: 请在 [方案 A / 方案 B] 中二选一保留最终确定的执行方案，并删除未采纳的选项。
[P7-S3|L13] SUGGESTION(strong,manual) zh/artifact-qa/disguised-placeholder-prose
  quote: "待 SRE 团队签字确认后在此处补上第三季度错误预算消耗率。"
  reason: 正文中混入写给作者自己的待办备忘指令，非定稿内容。
  prompt: 请填入经 SRE 团队确认的具体 [第三季度错误预算消耗率]，或在发布前删除此待办说明。
[P8-S1|L15] SUGGESTION(strong,safe) zh/prose/hollow-transition
  quote: "展望未来，我们将继续砥砺前行，构筑更加稳健的数字底座！"
  reason: 零信息增量的宏大叙事套话，执行破坏性删除测试后不影响上下文事实与因果推进。
  fix: DELETE
[P3-S2|L5] SUGGESTION(moderate,manual) zh/artifact-qa/synthetic-example-entity
  quote: "某某科技"
  reason: 正式交付文档中残留了未替换的测试假名“某某科技”。
  prompt: 请将占位假名“某某科技”替换为真实的合作方机构名称，例如 [合作方真实名称]。
[P4-S1|L7] SUGGESTION(moderate,safe) zh/prose/throat-clearing
  quote: "值得注意的是，PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。"
  reason: 删去无实质信息的句首套话铺垫，直接进入具体陈述。
  fix: "PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。"
[P4-S2|L7] SUGGESTION(moderate,review) zh/prose/rhetorical-self-qa
  quote: "为什么这一点如此重要？"
  reason: 移除机械的助手式自问过渡句，让后一句直接给出结论。
  fix: DELETE
[P6-S1|L11] SUGGESTION(moderate,manual) zh/prose/four-char-slogan-triad
  quote: "全面赋能、协同联动、闭环管理"
  reason: 连续堆砌三个及以上空洞四字套话排比，缺乏具体动作或边界信息。
  prompt: 删去四字口号排比串，保留或改写为原文中实际发生的具体改动：[填入具体机制或动作]
[P6-S1|L11] SUGGESTION(moderate,review) zh/prose/cooccurrence-padding
  quote: "本次架构升级实现了全面赋能、协同联动、闭环管理，具体收益包括：混沌演练自动主从切换耗时控制在 9 秒以内，工作节点峰值 RSS 内存低于 4.2GB，慢查询日志采样阈值收紧至 50ms。"
  reason: 连续堆叠‘全面赋能、协同联动、闭环管理’等空泛管理词，去除后不影响后续具体收益数据。
  fix: "本次架构升级的具体收益包括：混沌演练自动主从切换耗时控制在 9 秒以内，工作节点峰值 RSS 内存低于 4.2GB，慢查询日志采样阈值收紧至 50ms。"
```

### 用例 5：Tier 3 本地小模型离线语义审校（`--engine local`）

> **前置依赖 — [Ollama](https://ollama.com)：** Tier 3 本地小模型语义检查（`--engine local` 大模型模式及 `dislop model pull`）依赖本机安装并运行 **Ollama**（默认监听 `http://127.0.0.1:11434/v1`）。当本机缺少 Ollama 或未启动服务时，`dislop --help`、`dislop doctor`、`dislop model` 与 `dislop check --engine local` 均会主动提示缺失原因与安装步骤。

全程本机离线推理，零外部网络请求。实测可见，即便超轻量 1.5B 模型（`qwen2.5:1.5b`）在部分复杂长句上出现规则归类噪声，`dislop` 微内核依然将所有模型产出严格锁定在 `SUGGESTION` 轨道（绝不误杀 CI），并通过双层事实门禁将未通过实体/指标守恒校验的条目降级为 `manual`，确保 `dislop fix --auto` 不会破坏任何工程数据（追求更高本地中文语义精度可拉取 `qwen2.5-7b-instruct`）：

```bash
# 安装并启动 Ollama（macOS Homebrew 示例；Linux/Windows 详见 https://ollama.com）
brew install ollama
ollama serve &

# 拉取并注册 Tier 3 本地模型后执行检查
dislop model pull qwen2.5-1.5b-instruct
dislop check slop-samples/zh-CN.md --engine local --format agent
```

```text
# dislop file=slop-samples/zh-CN.md engine=local:qwen2.5:1.5b defects=8 suggestions=16
[P1-S1|L1] DEFECT(error,safe) zh/artifact-qa/chatbot-artifact
  quote: "当然可以！以下是为您润色后的第三季度存储集群迁移复盘报告。"
  reason: 正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。
  fix: DELETE
[P3-S2|L5] DEFECT(error,safe) common/artifact-qa/chatbot-citation-leak
  quote: "[oaicite:1]"
  reason: Internal AI search/citation token leaked into output text.
  fix: DELETE
[P3-S2|L5] DEFECT(error,manual) zh/artifact-qa/unfilled-placeholder
  quote: "[公司名称]"
  reason: 正文中存在未替换的中文模板占位符或默认假文。
  prompt: 发稿前请将“[公司名称]”替换为真实信息，或直接删去该未完成句。
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/unfilled-placeholder
  quote: "[TODO: 确认故障负责人]"
  reason: Unfilled developer or template token left in deliverable.
  prompt: Replace '[TODO: 确认故障负责人]' with the real value before publishing, or remove the unfinished sentence.
[P5-S2|L9] DEFECT(error,manual) common/artifact-qa/empty-link-target
  quote: "[值班应急手册]()"
  reason: Link has an empty destination URL.
  prompt: Provide a valid destination URL or unwrap the link.
[P9-S1|L17] DEFECT(error,safe) zh/artifact-qa/chatbot-artifact
  quote: "希望以上内容对您有所帮助！"
  reason: 正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。
  fix: DELETE
[P9-S2|L17] DEFECT(error,safe) zh/artifact-qa/chatbot-artifact
  quote: "如果您需要进一步调整，请随时告诉我。"
  reason: 正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。
  fix: DELETE
[P5-S2|L9] DEFECT(warning,manual) common/artifact-qa/placeholder-dead-link
  quote: "[故障时间线](#)"
  reason: Placeholder non-navigating link target '#'.
  prompt: Wire a real destination URL or use a <button type="button"> control.
[P1-S1|L1] SUGGESTION(strong,review) common/artifact-qa/unchosen-draft-options
  quote: "当然可以！以下是为您润色后的第三季度存储集群迁移复盘报告。"
  reason: 该段落保留了多个互斥的草稿选项，但作者未选择其中一个。
  fix: DELETE
[P2-S1|L3] SUGGESTION(strong,manual) common/artifact-qa/meta-editing-note
  quote: "第三季度存储层迁移复盘纪要"
  reason: 该段落中的编辑注释解释了为什么需要修改，但不属于最终发布的文档。
  prompt: 移除这些编辑注释，保留实际的文档内容。
[P3-S1|L5] SUGGESTION(strong,safe) zh/prose/hollow-transition
  quote: "在当今数字化转型加速推进的时代浪潮下，这一举措无疑具有举足轻重的战略意义。"
  reason: 零信息增量的宏大叙事套话，执行破坏性删除测试后不影响上下文事实与因果推进。
  fix: DELETE
[P3-S1|L5] SUGGESTION(strong,manual) zh/artifact-qa/implicit-assistant-framing
  quote: "在当今数字化转型加速推进的时代浪潮下，这一举措无疑具有举足轻重的战略意义。"
  reason: 该段落中的交差过渡句不属于最终发布的文档。
  prompt: 移除这些交差过渡句，保留实际的文档内容。
[P3-S2|L5] SUGGESTION(strong,manual) zh/artifact-qa/disguised-placeholder-prose
  quote: "根据您提供的会议纪要，我已将 [公司名称]（合作方某某科技）的核心发现梳理如下 [oaicite:1]。"
  reason: 该段落中的待办备忘录不是成品叙述，而是写给作者自己的待办备忘。
  prompt: 移除这些待办备忘录，保留实际的成品叙述。
[P4-S2|L7] SUGGESTION(strong,manual) zh/prose/unprompted-negation
  quote: "为什么这一点如此重要？"
  reason: 该段落中的伪深刻对比句壳不触发，因为前文确实存在旧观念或误解需澄清。
  prompt: 请去掉虚设的对立否定壳，仅用句中既有事实直接陈述。
[P5-S1|L9] SUGGESTION(strong,review) zh/prose/unprompted-negation
  quote: "这不是一次简单的参数微调，而是核心结账链路可靠性基线的重建。"
  reason: 移除无前文语境支撑的“不是…而是…”伪深刻对比壳，直接陈述后半句内容。
  fix: "这是核心结账链路可靠性基线的重建。"
[P5-S1|L9] SUGGESTION(strong,manual) zh/prose/hollow-transition
  quote: "这不是一次简单的参数微调，而是核心结账链路可靠性基线的重建。"
  reason: 该段落中的宏大叙事背景套话不触发，因为它是技术方案中的真实待讨论问题。
  prompt: 请移除空话铺垫，从具体事实、问题或结论直接切入。
[P8-S1|L15] SUGGESTION(strong,safe) zh/prose/hollow-transition
  quote: "展望未来，我们将继续砥砺前行，构筑更加稳健的数字底座！"
  reason: 零信息增量的宏大叙事套话，执行破坏性删除测试后不影响上下文事实与因果推进。
  fix: DELETE
[P4-S1|L7] SUGGESTION(moderate,safe) zh/prose/throat-clearing
  quote: "值得注意的是，PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。"
  reason: 删去无实质信息的句首套话铺垫，直接进入具体陈述。
  fix: "PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。"
[P4-S1|L7] SUGGESTION(moderate,manual) zh/artifact-qa/synthetic-example-entity
  quote: "值得注意的是，PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。"
  reason: 该段落中的假名示例不触发，因为它们是教学文档或测试规范中的有意示例。
  prompt: 请替换为真实的机构、项目或责任人名称。
[P4-S2|L7] SUGGESTION(moderate,review) zh/prose/rhetorical-self-qa
  quote: "为什么这一点如此重要？"
  reason: 移除机械的助手式自问过渡句，让后一句直接给出结论。
  fix: DELETE
[P6-S1|L11] SUGGESTION(moderate,manual) zh/prose/four-char-slogan-triad
  quote: "全面赋能、协同联动、闭环管理"
  reason: 连续堆砌三个及以上空洞四字套话排比，缺乏具体动作或边界信息。
  prompt: 删去四字口号排比串，保留或改写为原文中实际发生的具体改动：[填入具体机制或动作]
[P6-S1|L11] SUGGESTION(moderate,manual) zh/prose/throat-clearing
  quote: "本次架构升级实现了全面赋能、协同联动、闭环管理，具体收益包括：混沌演练自动主从切换耗时控制在 9 秒以内，工作节点峰值 RSS 内存低于 4.2GB，慢查询日志采样阈值收紧至 50ms。"
  reason: 该段落中的元叙事赘语不触发，因为它是架构升级的具体收益。
  prompt: 请去掉元叙事起手式，保留核心陈述。
[P7-S1|L13] SUGGESTION(moderate,manual) zh/prose/moralizing-closer
  quote: "方案 A：周二将连接池参数灰度至欧洲分片。"
  reason: 该段落中的口号式收尾不触发，因为它是对未来展望的口号式收尾。
  prompt: 请移除口号式收尾，在最后一项具体结论或行动安排处自然收束。
[P9-S1|L17] SUGGESTION(hint,manual) zh/prose/rhetorical-self-qa
  quote: "希望以上内容对您有所帮助！"
  reason: 该段落中的机械的助手式自问自答过渡触发，但技术方案中真实待讨论的开放问题不触发。
  fix: "期待以上内容对您有所帮助！"
```

## CLI 命令参考

```text
dislop check <files/globs... | -> [options] 只读双轨 Linter 审计（支持 `-` 管道与 `--stdin-filename`、`--changed` / `--since <ref>`）
dislop fix <files/globs...> [options]       终端交互式逐块修补，或批量安全清理（--auto）
dislop verify <before> <after> [--json]     校验改稿前后数字、量纲、极性反转、限定词与指标配对是否守恒
dislop verify --git [ref] <file> [--json]   对比 Git 历史版本校验当前工作区改稿安全性
dislop init [--global] [--voice <glob>]     初始化项目最小 .dislop.json 或 ~/.config/dislop/config.json
dislop login [--token <dslp_*>]             保存官方云端访问凭据
dislop logout                               清除本机保存的官方云端凭据
dislop voice <extract|show|clear> [files]   提取并管理个人写作风格基线（voice.json）
dislop model <list|pull|rm> [name]          管理 Tier 3 本地小模型（依赖 Ollama）
dislop packs [list|lint <path>] [--json]    查看内置规则包，或对外部 .pack.md / 规则包目录运行安全与格式检查
dislop doctor [--json]                      诊断当前路由层级、Ollama 状态、鉴权与规则包配置
dislop worklog <status|list|show|stats|reflect|clear>  查看本地工作记录与反思摘要
dislop mcp                                  启动本地 stdio MCP 服务（亦可直接运行 `dislop-mcp`）
```

常用工程接入参数：`--fail-on <none|error|warning>`（仅控制确定性 Defect 退出码，Suggestion 恒为退出码 `0`）、`--changed` / `--since <ref>`（只扫 Git 变更文件）、`--stdin-filename <name>`（stdin 扩展名提示）。

## 分层配置边界（`~/.config/dislop/config.json` 与 `.dislop.json`）

共享仓库内的 `.dislop.json` 按不可信配置隔离：`routing` 仅允许 `"local"` 或 `"off"`，支持按路径 `overrides`、`extraPacks`、`rules`、`failOn`、`ignore` 与项目内 `.dislop/rules.json`；大模型供应商与本地凭据仅可写在 `~/.config/dislop/config.json` 或未跟踪的 `.dislop.local.json` 中：

```json
{
  "routing": "local",
  "ignore": [".private/**"],
  "failOn": "error",
  "overrides": [
    { "files": ["docs/**/*.md"], "packs": ["prose"] },
    { "files": ["site/**/*.html"], "packs": ["web-ui"] }
  ]
}
```

`overrides` 中的 `packs` 会替换匹配文件的场景规则包，但 `common/artifact-qa` 与对应语言的 `en/artifact-qa` 或 `zh/artifact-qa` 始终保留（仅需追加时请用 `extraPacks`）。从父目录扫描以及 `--changed`、`--since` 均会自动跳过 `.dislop/`；校验项目自带规则包请运行 `dislop packs lint .dislop/<name>.pack.md`。

个人配置（`~/.config/dislop/config.json`）：

```json
{
  "routing": "byok",
  "activeProvider": "openai-default",
  "approvedHosts": ["api.openai.com"],
  "ignore": [".private/**"],
  "concurrency": 4,
  "providers": {
    "openai-default": {
      "protocol": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "model": "gpt-4o-mini",
      "structuredOutput": "json_schema",
      "maxInputTokens": 16000
    },
    "local-ollama": {
      "protocol": "openai",
      "baseUrl": "http://127.0.0.1:11434/v1",
      "apiKey": "ollama",
      "model": "qwen2.5:7b",
      "structuredOutput": "json_object",
      "maxInputTokens": 8000
    }
  }
}
```

## 参与贡献与自定义规则包

如需编写自定义规则包（分离式 `pack.json` + `scripts/` + `prompts/` 目录、零代码单文件 `<name>.pack.md` 或编程式 `definePack()` 插件），请查阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 开源许可

[Apache-2.0](./LICENSE)
