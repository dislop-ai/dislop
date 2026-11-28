---
content-type: reference-data
version: 1.1.2
---

# dislop Tools & Usage Options

## Agent Evaluation, Install & Rollout Workflow

Users often hand [`https://dislop.com/llms.txt`](../llms.txt) directly to their coding or office agent with a one-line prompt. Follow this three-step workflow:

1. **Evaluate host & deliverables**: Inspect the user's current environment (Claude Code, Codex, Cursor, Windsurf, Gemini CLI, GitHub Actions, or browser chat) and existing project files (`.md`, `.txt`, `.html`, `.jsx`, `.svg`, `.docx`, `.pptx`, or `.pdf`). Pick the lightest surface from the table below (Skill for low-token drafting guidance, local CLI/stdio MCP for zero-network deterministic gating and CI, or Official Cloud MCP when `.docx`/`.pptx` cloud workflows or browser review are needed).
2. **Install & configure**:
   - Agent Skill: `npx --yes skills add dislop-ai/dislop --skill dislop` (or install via `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, or `gemini extensions install`).
   - Local CLI (zero dependencies, zero network): `npx --yes dislop init` (writes `.dislop.json` with per-glob `overrides`) or `npx --yes dislop check . --no-llm`.
   - Local stdio MCP: `npx --yes dislop-mcp` (runs locally with `dislop_check`, `dislop_verify`, `dislop_packs`, and `dislop_explain`).
   - Cloud MCP (optional): configure `https://dislop.com/mcp` (`dislop login` or OAuth 2.1 for 30 free credits/mo).
3. **Run first check & verify**: Run `npx --yes dislop check <target> --no-llm --format agent` on workspace files, fix `DEFECT`s first without inventing metrics, and finish with `npx --yes dislop verify --git HEAD <target>`.

Pick the lightest surface that fits your workflow:

| Surface | Status | How to start |
|---|---|---|
| Zero-Install Prompt & Static Pages | Live | Hand [`/llms.txt`](../llms.txt) or [`/catalog.json`](../catalog.json) to any web-capable AI, or test drafts offline in the [Browser Workbench](https://dislop.com/#workbench). |
| Agent Skill (Pure-Markdown References) | Live | Install [`SKILL.md`](./skill.md) + bundled `references/*.md` (0 scripts, 0 network calls) with `npx skills add dislop-ai/dislop` in Claude Code, Codex, Cursor, Windsurf, or Antigravity. |
| Local CLI, Fact Gate & Packs | Live | See [`/tools/cli-and-hooks.md`](./cli-and-hooks.md) for Node 20+ zero-dep CLI (`dislop check`, `dislop fix`, `dislop verify`, `dislop packs lint`, `dislop voice`), `.dislop.json` `overrides`, and custom `.dislop/rules.json`. |
| Local & 3-Tier Semantic Routing | Live | Default `--engine local` keeps drafts on-machine (optionally add Ollama via `dislop model pull`), or explicitly opt into `--engine byok` or `--engine cloud` (`dislop login`). |
| Official Cloud MCP | Live | Connect `https://dislop.com/mcp` for 0-credit `dislop_check`, `dislop_verify`, and `dislop_rules` without login, or sign in (OAuth 2.1 / free key from [`/#pricing`](https://dislop.com/#pricing)) for 30 free monthly credits on `dislop_review`, `dislop_deslop`, `dislop_office`, and `dislop_visual_review`. |
| Claude, Codex, Cursor & Gemini Plugins | Live | Claude: `/plugin marketplace add dislop-ai/dislop`; Codex: `codex plugin marketplace add dislop-ai/dislop`; Gemini CLI: `gemini extensions install https://github.com/dislop-ai/dislop`. |
| GitHub Action & pre-commit | Live | Gate changed PR files with `uses: dislop-ai/dislop@v1.1.2` (`action.yml` with `since` & `fail-on`) or `.pre-commit-hooks.yaml`. |
| Cloud MCP, HTTP API & `dislop/sdk` | Live | See [`/tools/mcp-sdk-api.md`](./mcp-sdk-api.md) for Official Cloud HTTP MCP, HTTP API, local stdio MCP, and programmatic `definePack()` / `createLinter()`. |
