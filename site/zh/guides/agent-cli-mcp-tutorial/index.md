---
content-type: reference-data
lang: zh
updated: 2026-11-23
version: 0.9.0
---

# 把去 AI 味检查接进 Claude Code、Codex、Cursor 与 CI：Skill / CLI / MCP 教程

> 防 AI 味最好分两步：写前挂上纯文档 Skill 让 Agent 少写套话，写完跑离线 `dislop check` 在本地或 Git PR 里做确定性拦截；如果是 Claude Cowork、WorkBuddy 等不方便装本机环境的办公 Agent，直接连 `https://dislop.com/mcp`。

开源维护者对“AI 水文 PR”的忍耐已经到达临界点。2026 年初，`Ghostty` 通过 `AI_POLICY.md` 强制要求 AI 辅助提交必须先获 Issue 批准并完全理解代码；`tldraw` 一度自动关闭外部 PR；CodeRabbit 实测 AI 生成 PR 平均多出约 1.7 倍问题。

把去 AI 味检查直接放进日常工具链，分三层接法，1 分钟就能跑起来。

## 1. 一分钟选对接入方式

| 使用场景 | 推荐形态 | 运行位置 | 典型命令 / 配置 |
|---|---|---|---|
| **动笔前约束 Agent 写作/设计** | 纯文档 Skill | 本地客户端 | `npx --yes skills add dislop-ai/dislop --skill dislop` |
| **写完后本地查硬伤与套话** | 开源 CLI（Node / Python） | 纯本机离线 | `npx --yes dislop check .` 或 `uvx dislop check .` |
| **Git 提交与 PR 自动拦截** | `--changed` + GitHub Actions | 本地 / CI | `npx --yes dislop check --changed origin/main --fail-on error` |
| **办公 Agent 免环境深度审校** | 官方远程 MCP | `https://dislop.com/mcp` | 0 额度基础检查免登录直连；OAuth 2.1 或登录后领每月 30 免费额度 |

## 2. 接进编码 Agent 与编辑器

### 安装纯文档 Agent Skill（Claude Code / Codex / Cursor / Antigravity）

依据跨端通用的 `Agent Skills` 规范，一条命令把 4 份按文体拆分的参考卡（工作文档、随笔、办公 PPT、前端网页）装进主流工具：

```bash
npx --yes skills add dislop-ai/dislop --skill dislop
```

如果是网页对话窗不方便装本地包，可以直接发一句：

```text
先读 https://dislop.com/llms.txt，按里面整理的文案和设计去 AI 味规矩与检查方法，帮我把接下来这份稿子发之前过一遍。
```

### 接进远程 MCP（Cursor / Claude Code / Codex）

服务端自动发现描述位于 `https://dislop.com/.well-known/mcp/server-card.json`。其中 `dislop_check`、`dislop_verify` 与 `dislop_rules` 免登录 0 额度可用；通过 OAuth 2.1 授权或填入免费 Bearer 密钥后，每月可用 30 额度调用多模型审校与改稿工具。

```json
{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "https://dislop.com/mcp",
      "headers": {
        "Authorization": "Bearer dslp_YOUR_FREE_TOKEN"
      }
    }
  }
}
```

![Agent 闭环工作流：加载 SKILL.md、增量门禁退出码 1、修复后 dislop verify 通过](demo:agent-workflow)

## 3. 在 Git 钩子与 GitHub Actions 里做增量门禁

在团队仓库里，推荐先把硬伤（`packs/core`，`severity: error`）设为阻塞项，把风格提醒留给作者自决，避免误伤老文件：

```yaml
name: dislop-gate
on: [pull_request]
jobs:
  check-slop:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: dislop-ai/dislop@v0.7.1
        with:
          args: check --changed origin/${{ github.base_ref }} --fail-on error --format github
```

对于研发文档和复盘，还可以专门加上 `--pack engineering-spec`，拦住复读 diff 动作的 `eng-pr-diff-parrot`、把根因归咎于“人工疏忽/沟通不足”的 `eng-shallow-root-cause`，以及没有负责人与截止日期的 `eng-vague-action-item`：

```bash
npx --yes dislop check docs/ postmortems/ --pack engineering-spec --fail-on warning
```

![dislop CLI 本地离线检查：原稿退出码 1 与清理后退出码 0](demo:cli-check)

## 常见问题

### 纯文档 Skill 和本地 CLI 有什么区别，需要两个都装吗？

Skill 是纯 Markdown 参考卡，不含可执行代码，负责在 Agent 动笔前定好规矩；CLI 是本地确定性检查工具，负责在写完后按行号验真。编码用户建议两个配合用：写前读 Skill，提交前跑 dislop check。

### 在 CI 里跑全仓库检查会不会把老文档全报一遍？

不会。用 dislop check --changed origin/main --fail-on error 可以只检查本次 PR 改过的行，既能拦住新混进来的寒暄、空链接和未填占位符，又不打扰存量历史文档。

### 如果我在离线内网环境或处理涉密代码，能接远程 MCP 吗？

不要接。涉密或内网材料请一律只使用开源纯文档 Skill 和纯本地 CLI（零联网、零上传）；远程 MCP 仅用于非涉密稿件的多模型深度审校与办公文档改写。

## 参考出处

- [Agent Skills Specification](https://agentskills.io/specification): Cross-agent directory and SKILL.md manifest specification decoupling portable instruction skills from individual client hosts.
- [The /llms.txt Proposal (llmstxt.org)](https://llmstxt.org/): Defines a curated Markdown index at /llms.txt so coding agents and retrieval scrapers can locate task docs without parsing full HTML chrome.
- [vale-cli/vale: Syntax-aware linter for prose](https://github.com/vale-cli/vale): 6,413 stars (2026-11-21 snapshot); deterministic prose linter for Markdown, HTML, and AsciiDoc built around configurable YAML style rules.
- [Ghostty AI_POLICY.md](https://github.com/ghostty-org/ghostty/blob/main/AI_POLICY.md): 64,293 repo stars (2026-11-21 snapshot); restricts AI-assisted PRs to pre-approved issues, requires tool disclosure, and mandates full contributor comprehension.
- [CodeRabbit: State of AI vs Human Code Generation Report](https://www.coderabbit.ai/reports-guides): Measured AI-generated PRs averaging ~1.7x more issues (10.83 vs 6.45), 75% more logic errors, and >3x readability/formatting issues compared with human PRs.
- [Google Technical Writing Courses](https://developers.google.com/tech-writing): Engineering writing guidance prioritizing short sentences, clear actors, explicit scope boundaries, and lists/tables over wall-of-text paragraphs.
