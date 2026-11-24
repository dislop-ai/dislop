---
content-type: reference-data
version: 0.8.4
---

# Zero-Install Audit Checklists (When Local CLI/MCP Is Unavailable)

## One-Line Agent Rollout Prompt

Paste either prompt into your own Agent so it reads [`/llms.txt`](../llms.txt), picks the right surface, installs or configures `dislop`, and runs a first check on your files:

```text
Read https://dislop.com/llms.txt, evaluate which dislop setup fits my environment and project (Skill, offline CLI, or Cloud MCP), install and configure it, and run a first check on our files.
```

```text
请阅读 https://dislop.com/llms.txt，结合我当前的环境与项目内容评估最合适的 dislop 接入方式（Skill、本地 CLI 或远程 MCP），完成安装配置并拿现有文件试跑一次。
```

## Prose & Technical Brief Checklist

```text
1. Remove unfilled placeholders and chatbot wrappers.
2. Cut throat-clearing openers, stock promotional adjectives, and moralizing endings.
3. Do not replace cut filler with binary negation slogans ("Not X, but Y") or three-word staccato fragments.
4. Re-check the revised draft locally with: npx --yes dislop check draft.md
```

## Web UI & Slide Deck Checklist

```text
1. Verify zero dead controls (<a href="#"> or unexplained disabled buttons).
2. Avoid default purple-pink neon gradients, "AI-Powered" prompt-echo badges, pill-badge soup (> 6 pills per view), and 3-level nested bordered boxes.
3. Cap slide copy at <= 120 English words (<= 280 Chinese chars), <= 6 bullets, 100% font scale (no autofit shrink), and a conclusion title instead of "Overview".
```
