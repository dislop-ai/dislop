---
content-type: reference-data
version: 0.7.1
---

# dislop Tools & Usage Options

Pick the lightest surface that fits your workflow:

| Surface | Status | How to start |
|---|---|---|
| Zero-Install Prompt & Static Pages | Live | Hand [`/llms.txt`](../llms.txt) or [`/catalog.json`](../catalog.json) to any web-capable AI, or test drafts offline in the [Browser Workbench](https://dislop.com/#workbench). |
| Agent Skill (Pure-Markdown References) | Live | Install [`SKILL.md`](./skill.md) + bundled `references/*.md` (0 scripts, 0 network calls) with `npx skills add dislop-ai/dislop` in Claude Code, Codex, Cursor, Windsurf, or Antigravity. |
| Local CLI & Offline Voice | Live | See [`/tools/cli-and-hooks.md`](./cli-and-hooks.md) for zero-network Node (`npx`), Python (`uvx`), all 7 built-in packs, 65 patterns, 14.6 KB `--ml`, and `dislop voice`. |
| Official Cloud MCP | Live | Connect `https://dislop.com/mcp` with a free 30-credit/month Bearer key from [`/#pricing`](https://dislop.com/#pricing) for `dislop_review` (genre-aware structured edits), `dislop_deslop`, and `dislop_voice_extract`. |
| Claude Code Plugin | Live | Install pure-Markdown Skill + Official Cloud MCP in one step using `.claude-plugin/marketplace.json` (`/plugin marketplace add dislop-ai/dislop` then `/plugin install dislop@dislop-ai`; ~130 always-on tokens). |
| OpenAI Codex Plugin & Gemini CLI Extension | Live | Codex: `codex plugin marketplace add dislop-ai/dislop` then `codex plugin add dislop@dislop-ai`; Gemini CLI: `gemini extensions install https://github.com/dislop-ai/dislop`. |
| GitHub Action & pre-commit | Live | Gate modified PR lines with `uses: dislop-ai/dislop@main` (`action.yml`) or `.pre-commit-hooks.yaml`. |
| Official Cloud MCP, HTTP API & JS Export | Live | See [`/tools/mcp-sdk-api.md`](./mcp-sdk-api.md) for Official Cloud HTTP MCP, HTTP API, and `src/core.mjs`. |
