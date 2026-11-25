# dislop

[English](./README.md) | 简体中文

**去除 AI 废话与交付脏残留，就是硬核生产力。**

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
@@ -1,13 +1,13 @@
-当然可以！以下是为您润色后的第三季度存储集群迁移复盘报告。
-
-# 第三季度存储层迁移复盘纪要
-
-在当今数字化转型加速推进的时代浪潮下，这一举措无疑具有举足轻重的战略意义。根据您提供的会议纪要，我已将 [公司名称]（合作方某某科技）的核心发现梳理如下 [oaicite:1]。
-
-值得注意的是，PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。为什么这一点如此重要？通过 `--pool-mode=transaction` 启用事务级连接池后，空闲连接内存开销降低了 64%，且未中断任何活跃会话。
-
-这不是一次简单的参数微调，而是核心结账链路可靠性基线的重建。请在周五前查阅 [故障时间线](#) 或打开 [值班应急手册]()，并将后续压测核验指派给 [TODO: 确认故障负责人]。
-
-本次架构升级实现了全面赋能、协同联动、闭环管理，具体收益包括：混沌演练自动主从切换耗时控制在 9 秒以内，工作节点峰值 RSS 内存低于 4.2GB，慢查询日志采样阈值收紧至 50ms。
-
-方案 A：周二将连接池参数灰度至欧洲分片。 / 方案 B：等账单冻结窗口结束后再推欧洲分片。待 SRE 团队签字确认后在此处补上第三季度错误预算消耗率。
+
+# 第三季度存储层迁移复盘纪要
+
+根据您提供的会议纪要，我已将 [公司名称]（合作方某某科技）的核心发现梳理如下。
+
+PostgreSQL 在 `{{cluster_region}}` 区域的 4 个只读副本上 p95 查询延迟从 142ms 降至 18ms。为什么这一点如此重要？通过 `--pool-mode=transaction` 启用事务级连接池后，空闲连接内存开销降低了 64%，且未中断任何活跃会话。
+
+这不是一次简单的参数微调，而是核心结账链路可靠性基线的重建。请在周五前查阅 [故障时间线](#) 或打开 [值班应急手册]()，并将后续压测核验指派给 [TODO: 确认故障负责人]。
+
+本次架构升级实现了全面赋能、协同联动、闭环管理，具体收益包括：混沌演练自动主从切换耗时控制在 9 秒以内，工作节点峰值 RSS 内存低于 4.2GB，慢查询日志采样阈值收紧至 50ms。
+
+方案 A：周二将连接池参数灰度至欧洲分片。 / 方案 B：等账单冻结窗口结束后再推欧洲分片。待 SRE 团队签字确认后在此处补上第三季度错误预算消耗率。
+
@@ -14,5 +14,1 @@
 
-展望未来，我们将继续砥砺前行，构筑更加稳健的数字底座！
-
-希望以上内容对您有所帮助！如果您需要进一步调整，请随时告诉我。
-
```

### 用例 3：Tier 1 官方云端引擎（`--engine cloud`）

```bash
dislop login --token dslp_...
dislop check slop-samples/zh-CN.md --engine cloud --format agent
```

> **当前状态：** 适配新版 `dislop.report/1` 微内核协议的官方云端接口正在建设中，上线后将补充实测输出。

### 用例 4：Tier 2 自有密钥 / OpenAI 兼容网关深度语义审校（`--engine byok`）

在确定性规则基础上叠加前沿大模型语义理解，精准捕获绕过固定正则的隐性交付问题：面向委托人的交差过渡句（`根据您提供的会议纪要…` `[P3-S2|L5]`）、未二选一的并列排期草稿（`方案 A … / 方案 B …` `[P7-S1|L13]`）、混入正文的作者自留备忘（`待 SRE 团队签字确认后在此处补上第三季度错误预算消耗率。` `[P7-S3|L13]`），并直接将 `本次架构升级实现了全面赋能、协同联动、闭环管理，具体收益包括：` 收敛为 `本次架构升级的具体收益包括：`（`[P6-S1|L11]`）：

```bash
dislop check slop-samples/zh-CN.md --engine byok --format agent
```

```text
# dislop file=slop-samples/zh-CN.md engine=byok:gpt-6.2-astra defects=8 suggestions=15
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
[P1-S1|L1] SUGGESTION(strong,review) zh/artifact-qa/implicit-assistant-framing
  quote: "当然可以！以下是为您润色后的第三季度存储集群迁移复盘报告。"
  reason: 这句话向委托人交代润色任务已完成。下一行标题已说明报告主题，可以直接从标题开始。
  fix: DELETE
[P3-S1|L5] SUGGESTION(strong,safe) zh/prose/hollow-transition
  quote: "在当今数字化转型加速推进的时代浪潮下，这一举措无疑具有举足轻重的战略意义。"
  reason: 零信息增量的宏大叙事套话，执行破坏性删除测试后不影响上下文事实与因果推进。
  fix: DELETE
[P3-S2|L5] SUGGESTION(strong,review) zh/artifact-qa/implicit-assistant-framing
  quote: "根据您提供的会议纪要，我已将 [公司名称]（合作方某某科技）的核心发现梳理如下 [oaicite:1]。"
  reason: 这句说明的是如何替委托人整理材料，没有陈述任何发现，也没有给出可识别的公司或可查阅的出处。
  fix: DELETE
[P5-S1|L9] SUGGESTION(strong,review) zh/prose/unprompted-negation
  quote: "这不是一次简单的参数微调，而是核心结账链路可靠性基线的重建。"
  reason: 移除无前文语境支撑的“不是…而是…”伪深刻对比壳，直接陈述后半句内容。
  fix: "这是核心结账链路可靠性基线的重建。"
[P5-S2|L9] SUGGESTION(strong,manual) zh/artifact-qa/disguised-placeholder-prose
  quote: "[TODO: 确认故障负责人]"
  reason: 核验指派的对象仍是给作者的待办，值班团队无法据此分派工作。
  prompt: 将待办替换为[已确认的故障负责人]，保留周五前查阅资料的要求。
[P6-S1|L11] SUGGESTION(strong,review) zh/prose/hollow-transition
  quote: "本次架构升级实现了全面赋能、协同联动、闭环管理，具体收益包括："
  reason: 三个概括性标签没有说明谁在协同、如何闭环。缩短引语即可突出冒号后的切换耗时、内存峰值和采样阈值。
  fix: "本次架构升级的具体收益包括："
[P7-S1|L13] SUGGESTION(strong,manual) common/artifact-qa/unchosen-draft-options
  quote: "方案 A：周二将连接池参数灰度至欧洲分片。"
  reason: 此句与下一句用斜线并列，给同一次欧洲分片灰度留下两种排期，未说明哪一种获准执行。
  prompt: 按[已确认的欧洲分片灰度排期]保留对应安排，删除另一稿及方案编号。
[P7-S3|L13] SUGGESTION(strong,manual) zh/artifact-qa/disguised-placeholder-prose
  quote: "待 SRE 团队签字确认后在此处补上第三季度错误预算消耗率。"
  reason: “在此处补上”是在提醒作者填数，不是已经确认的复盘结果。
  prompt: 签字后填入[SRE 团队确认的第三季度错误预算消耗率]；未确认前不要把它写成实测结论。
[P8-S1|L15] SUGGESTION(strong,safe) zh/prose/hollow-transition
  quote: "展望未来，我们将继续砥砺前行，构筑更加稳健的数字底座！"
  reason: 零信息增量的宏大叙事套话，执行破坏性删除测试后不影响上下文事实与因果推进。
  fix: DELETE
[P9-S1|L17] SUGGESTION(strong,review) zh/artifact-qa/implicit-assistant-framing
  quote: "希望以上内容对您有所帮助！"
  reason: 这是面向提问者的客套收尾，不属于迁移纪要。
  fix: DELETE
[P9-S2|L17] SUGGESTION(strong,review) zh/artifact-qa/implicit-assistant-framing
  quote: "如果您需要进一步调整，请随时告诉我。"
  reason: 这句邀请委托人继续改稿，不是给工程团队的后续行动。
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
[P8-S1|L15] SUGGESTION(moderate,review) zh/prose/moralizing-closer
  quote: "展望未来，我们将继续砥砺前行，构筑更加稳健的数字底座！"
  reason: 这句没有新增改进措施或验收条件，报告可止于已确认的结果或行动安排。
  fix: DELETE
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
dislop check <files/globs...> [options]     只读双轨审校（Defect 缺陷与 Suggestion 建议）
dislop fix <files/globs...> [options]       终端交互式逐块修补，或批量安全清理（--auto）
dislop verify <before> <after> [--json]     校验改稿前后数字、单位、链接与专有名词守恒
dislop verify --git [ref] <file> [--json]   对比 Git 历史版本校验当前工作区改稿安全性
dislop init [--global] [--voice <glob>]     初始化 .dislop.json 或 ~/.config/dislop/config.json
dislop login [--token <dslp_*>]             保存官方云端访问凭据
dislop logout                               清除本机保存的官方云端凭据
dislop voice <extract|show|clear> [files]   提取并管理个人写作风格基线（voice.json）
dislop model <list|pull|rm> [name]          管理 Tier 3 本地小模型（依赖 Ollama）
dislop packs [--json]                       查看内置多层级规则包列表
dislop doctor [--json]                      诊断当前路由层级、Ollama 状态、鉴权与规则包配置
dislop mcp                                  启动本地 stdio MCP 服务（亦可直接运行 `dislop-mcp`）
```

## 配置大模型后端（`~/.config/dislop/config.json` 或 `.dislop.json`）

```json
{
  "routing": "byok",
  "activeProvider": "openai-default",
  "approvedHosts": ["api.openai.com"],
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
