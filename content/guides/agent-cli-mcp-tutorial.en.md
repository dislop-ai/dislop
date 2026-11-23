---
slug: "agent-cli-mcp-tutorial"
lang: "en"
title: "Adding an AI Slop Linter to Claude Code, Codex, Cursor, and GitHub Actions"
navTitle: "Agent, CLI & CI Setup"
description: "How to combine the pure-Markdown Agent Skill, zero-dependency offline CLI, incremental git-diff PR gates, and Cloud MCP."
summary: "The cleanest anti-slop setup splits prevention from verification: load the pure-Markdown Skill before drafting so agents avoid stock templates, then run the offline `dislop check` CLI locally or on `--changed` PR lines. For office agents without local shells, connect `https://dislop.com/mcp`."
category: "Setup & CI"
published: "2026-11-23"
updated: "2026-11-23"
readingMinutes: 6
keywords: ["claude code anti slop", "codex skill dislop", "cursor mcp anti slop", "github actions ai slop linter", "pre-commit hook"]
relatedRules: ["chatbot-artifact", "unfilled-placeholder", "eng-pr-diff-parrot", "eng-shallow-root-cause", "eng-vague-action-item"]
relatedGuides: ["fix-ai-slop-web-ui", "deslop-pptx-docx", "linter-vs-detector-vs-skill"]
sources: ["agentskills-spec", "llmstxt-specification", "vale-cli", "ghostty-ai-policy", "coderabbit-ai-pr-report", "tldraw-issue-7695", "google-tech-writing"]
faqs:
  - q: "Do I need both the pure-doc Skill and the CLI?"
    a: "They solve different halves of the loop. The Markdown Skill prevents clichés while the agent drafts; the offline CLI deterministically checks finished Markdown, HTML, DOCX, and PPTX files afterward."
  - q: "Will adding dislop to CI fail on legacy documentation?"
    a: "No, if you pass --changed origin/main --fail-on error. That checks only modified lines for hard AI delivery artifacts such as chat wrappers, placeholders, and dead href='#' buttons."
  - q: "Should confidential repositories use the Cloud MCP endpoint?"
    a: "No. Keep confidential codebases and internal specs strictly on the open-source Markdown Skill and offline CLI, both of which run locally with zero outbound network calls."
---

Open-source maintainers have moved from complaining about AI slop to shutting down intake channels: Ghostty added `AI_POLICY.md` requiring pre-approved issues and tool disclosure, tldraw began auto-closing external PRs in January 2026, and CodeRabbit found AI-generated PRs carry roughly 1.7x more issues than human PRs.

Adding deterministic checks to your agent workflow and CI takes under two minutes.

## 1. Pick the right surface for your workflow

| Goal | Surface | Where it runs | Command / endpoint |
|---|---|---|---|
| **Prevent clichés while drafting** | Pure-doc Skill | Local coding agent | `npx --yes skills add dislop-ai/dislop --skill dislop` |
| **Verify docs, UI, and slides offline** | Zero-dep CLI | Local shell (0 uploads) | `npx --yes dislop check .` or `uvx dislop check .` |
| **Block PR artifacts incrementally** | `--changed` + GitHub Action | Pre-commit / CI | `npx --yes dislop check --changed origin/main --fail-on error` |
| **Office agents without local CLI** | Official Cloud MCP | `https://dislop.com/mcp` | 0-credit checks without login; OAuth 2.1 or sign in for 30 free credits/mo |

## 2. Connect coding agents and editors

### Install the cross-host Agent Skill (Claude Code, Codex, Cursor, Antigravity)

Following the open `Agent Skills` specification, install the Markdown-only reference cards (`work-docs`, `essay`, `office`, `web-ui`) in one command:

```bash
npx --yes skills add dislop-ai/dislop --skill dislop
```

In a web chat client where local tools are unavailable, paste this single line:

```text
Read https://dislop.com/llms.txt and follow its writing and design anti-slop rules and checks before delivering my next doc, slide deck, or web page.
```

### Connect Official Cloud MCP (`mcp.json`)

Auto-discovery metadata is published at `https://dislop.com/.well-known/mcp/server-card.json`. `dislop_check`, `dislop_verify`, and `dislop_rules` run at 0 credits without login; OAuth 2.1 or a free Bearer token unlocks 30 monthly credits for cloud review and rewrite tools.

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

![Coding Agent + CI loop: loading pure-Markdown SKILL.md, gating PR diff with exit 1, and running dislop verify](demo:agent-workflow)

## 3. Gate pull requests incrementally in GitHub Actions

Start with `--changed` and `--fail-on error` so CI blocks hard AI leftovers without noise on untouched legacy files:

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

For RFCs, PR descriptions, and incident postmortems, add `--pack engineering-spec` to catch diff-parroting (`eng-pr-diff-parrot`), shallow `"human error"` root causes (`eng-shallow-root-cause`), and ownerless action items (`eng-vague-action-item`):

```bash
npx --yes dislop check docs/ postmortems/ --pack engineering-spec --fail-on warning
```

![dislop CLI offline check failing with exit code 1 on draft and passing with exit code 0 after cleanup](demo:cli-check)
