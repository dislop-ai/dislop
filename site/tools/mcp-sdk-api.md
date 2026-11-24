---
content-type: reference-data
version: 0.8.3
---

# Official Cloud MCP, HTTP API & JS Core

## 1. Official Cloud HTTP MCP (Free 0-Credit Checks Without Login; 30 Free Credits/Month After Sign-In)

Connect directly to `https://dislop.com/mcp` (auto-discovery metadata at [`/.well-known/mcp/server-card.json`](../.well-known/mcp/server-card.json) and OAuth 2.1 protected resource at `https://dislop.com/.well-known/oauth-protected-resource/mcp`).

- **No login required**: `dislop_check`, `dislop_verify`, and `dislop_rules` run at 0 credits without an API key.
- **Sign in or OAuth 2.1**: Claim a free Bearer token (`dslp_...`) at `https://dislop.com/#cloud-token-box` (or authorize via OAuth 2.1) for **30 free credits/month** on Cloud AI tools (paid-tier Google Gemini API; Google does not train on it, and we do not store drafts; see [`/privacy.md`](../privacy.md)).

### Claude Code
```bash
claude mcp add --transport http dislop https://dislop.com/mcp
# Optional Bearer header if skipping OAuth: --header "Authorization: Bearer dslp_YOUR_FREE_TOKEN"
```

### Cursor / Windsurf / Antigravity (`mcp.json`)
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

### Codex (`~/.codex/config.toml`)
```toml
[mcp_servers.dislop]
url = "https://dislop.com/mcp"
http_headers = { Authorization = "Bearer dslp_YOUR_FREE_TOKEN" }
```

### Official Cloud MCP v2 Tools (10 Tools)

- **0 credits, no login required**:
  - `dislop_check`: Deterministic anti-slop check on passed `text` (note remote check accepts `text`, not local filesystem `path`).
  - `dislop_verify`: Fact ledger, keep-terms, and anti-degradation guardrails on a `before` / `after` revision pair.
  - `dislop_rules`: List available rule packs or explain a specific `ruleId` with examples.
- **Sign-in / OAuth 2.1 required (30 free credits/month)**:
  - `dislop_review` (1 credit): Genre-aware multi-model diagnosis returning anchored `dislop.findings/1` `edit` / `rewrite` / `ask` guidance.
  - `dislop_deslop` (2 credits): Self-healing LLM rewrite with deterministic and fact-ledger verification.
  - `dislop_office` (2 credits review / 3 credits deslop): Review or rewrite `.docx` / `.pptx` text segments without emitting binary base64.
  - `dislop_visual_review` (2 credits): Multimodal visual anti-slop screenshot audit for webpages, slides, posters, and print layouts.
  - `dislop_voice_extract` (2 credits): Extract a reusable `dislop.voice/1` style card from 1–5 human samples (`save: true` stores it to your account).
  - `dislop_voice_manage` (0 credits): List, view, or delete saved personal voice cards.
  - `dislop_account` (0 credits): Inspect active plan, remaining credits, and saved voice count.

## 2. Cloud HTTP API & JS Core Export

- Same-origin HTTP endpoints: `GET /api/health`, `GET /api/v1/auth/session`, `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`, `GET /api/v1/account/me`, `GET|POST /api/v1/account/keys`, `POST /api/v1/check`, `POST /api/v1/review`, `POST /api/v1/deslop`, `POST /api/v1/office/review`, `POST /api/v1/office/deslop`, `POST /api/v1/voice/extract`, and `POST /api/v1/waitlist`.
- `package.json` exports the zero-I/O pure ES module `src/core.mjs` (`auditText`, `auditOoxmlEntries`, `resolveEffectivePack`).
- Note: existing local `--mcp` stdio code remains in the open-source CLI during real-world evaluation, while official manifests target `https://dislop.com/mcp`.
