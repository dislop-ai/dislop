# Installing dislop for AI Coding Agents

Use this specification to install and verify `dislop` in Cline, Roo Code, Cursor, Claude Code, Codex, Antigravity, or Gemini CLI.

## 1. Remote Streamable HTTP MCP (No Local Dependencies)

Connect directly to the hosted MCP endpoint at `https://dislop.com/mcp`. Deterministic tools (`dislop_check`, `dislop_verify`, and `dislop_rules`) run at 0 credits without sign-in. Cloud VLM tools (`dislop_visual_review`, `dislop_rewrite`) use OAuth 2.1 discovery at `https://dislop.com/.well-known/oauth-authorization-server`.

```json
{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "https://dislop.com/mcp"
    }
  }
}
```

## 2. Local Offline stdio MCP (Zero Network Uploads)

Run the deterministic engine locally over stdio when drafts cannot leave the machine. Both Node and Python servers expose the same 6 read-only tools (`dislop_check`, `dislop_verify`, `dislop_rules`, `dislop_voice_extract`, `dislop_model_score`, `dislop_model_status`).

Node 20+:

```json
{
  "mcpServers": {
    "dislop": {
      "command": "npx",
      "args": ["--yes", "dislop-mcp"]
    }
  }
}
```

Python 3.10+ via `uvx`:

```json
{
  "mcpServers": {
    "dislop": {
      "command": "uvx",
      "args": ["--from", "dislop", "dislop-mcp"]
    }
  }
}
```

## 3. Pure-Markdown Agent Skills

Install the router skill or individual workflow skills directly into agent skill directories:

```bash
npx --yes skills add dislop-ai/dislop --skill dislop
```

Focused workflow skills in `dislop-ai/dislop`:

- `deslop-docs`: Markdown docs, READMEs, RFCs, and release notes
- `deslop-slides-docx`: PowerPoint (`.pptx`), Word (`.docx`), and PDF deliverables
- `deslop-web-ui`: HTML, CSS, JSX, and SVG web interfaces
- `deslop-verify`: Fact preservation and anti-degradation checks against original text or git `HEAD`

## 4. Verify Installation

Run a local CLI check against any Markdown file:

```bash
npx --yes dislop check README.md --pack auto --format agent
```

Exit codes:

- `0`: Pass at or below the selected severity threshold
- `1`: Findings met or exceeded `--fail-on` (`error`, `warning`, or `info`)
- `2`: Invalid CLI arguments, unreadable path, or unexpected runtime error

For edits to an existing tracked file, verify that all numbers, dates, units, and protected terms survived:

```bash
npx --yes dislop verify --git HEAD README.md --strict
```
