---
content-type: reference-data
version: 0.9.1
---

# dislop Tools & Usage Options

## Agent Evaluation, Install & Rollout Workflow

Users often hand [`https://dislop.com/llms.txt`](../llms.txt) directly to their coding or office agent with a one-line prompt. Follow this three-step workflow:

1. **Evaluate host & deliverables**: Inspect the user's current environment (Claude Code, Codex, Cursor, Windsurf, Gemini CLI, OpenClaw, GitHub Actions, or browser chat) and existing project files (`.md`, `.txt`, `.html`, `.jsx`, `.svg`, `.docx`, `.pptx`, or `.pdf`). Pick the lightest surface from the table below (Skill for low-token guidance, local CLI for zero-network deterministic gating and CI, or Official Cloud MCP when deep LLM review or `.docx`/`.pptx` visual/structural audit is needed).
2. **Install & configure**:
   - Agent Skill: `npx --yes skills add dislop-ai/dislop --skill dislop` (or use plugin marketplaces for Claude Code / Codex / Gemini CLI).
   - Local CLI (zero network): `npx --yes dislop init` (writes `.dislop.json` config/hooks) or `uvx dislop check .`.
   - Cloud MCP (optional): configure `https://dislop.com/mcp` (anonymous `dislop_check` / `dislop_rules` at 0 credits; OAuth 2.1 or free key for `dislop_review` / `dislop_deslop` / `dislop_office`).
3. **Run first check & report**: Run `npx --yes dislop check <target> --pack auto --compact --json` on real workspace files (or pass text/files through `dislop_check`), summarize concrete `error` and `warning` hits, and offer to clean them without inventing facts.

Pick the lightest surface that fits your workflow:

| Surface | Status | How to start |
|---|---|---|
| Zero-Install Prompt & Static Pages | Live | Hand [`/llms.txt`](../llms.txt) or [`/catalog.json`](../catalog.json) to any web-capable AI, or test drafts offline in the [Browser Workbench](https://dislop.com/#workbench). |
| Agent Skill (Pure-Markdown References) | Live | Install [`SKILL.md`](./skill.md) + bundled `references/*.md` (0 scripts, 0 network calls) with `npx skills add dislop-ai/dislop` in Claude Code, Codex, Cursor, Windsurf, or Antigravity. |
| Local CLI & Offline Voice | Live | See [`/tools/cli-and-hooks.md`](./cli-and-hooks.md) for zero-network Node (`npx`), Python (`uvx`), all 7 built-in packs, 65 patterns, 14.6 KB `--ml`, and `dislop voice`. |
| Official Cloud MCP | Live | Connect `https://dislop.com/mcp` for 0-credit `dislop_check`, `dislop_verify`, and `dislop_rules` without login, or sign in (OAuth 2.1 / free key from [`/#pricing`](https://dislop.com/#pricing)) for 30 free monthly credits on `dislop_review`, `dislop_deslop`, `dislop_office`, and `dislop_visual_review`. |
| Claude Code Plugin | Live | Install pure-Markdown Skill + Official Cloud MCP in one step using `.claude-plugin/marketplace.json` (`/plugin marketplace add dislop-ai/dislop` then `/plugin install dislop@dislop-ai`; ~130 always-on tokens). |
| OpenAI Codex Plugin & Gemini CLI Extension | Live | Codex: `codex plugin marketplace add dislop-ai/dislop` then `codex plugin add dislop@dislop-ai`; Gemini CLI: `gemini extensions install https://github.com/dislop-ai/dislop`. |
| GitHub Action & pre-commit | Live | Gate modified PR lines with `uses: dislop-ai/dislop@main` (`action.yml`) or `.pre-commit-hooks.yaml`. |
| Official Cloud MCP, HTTP API & JS Export | Live | See [`/tools/mcp-sdk-api.md`](./mcp-sdk-api.md) for Official Cloud HTTP MCP, HTTP API, and `src/core.mjs`. |
