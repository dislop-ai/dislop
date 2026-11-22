---
content-type: reference-data
version: 0.7.1
---

# Official Cloud MCP, HTTP API & JS Core

## 1. Official Cloud HTTP MCP (Sign-In Required, Free 30 Credits/Month)

Connect directly at `https://dislop.com/mcp` via **OAuth 2.1** (Claude Code, Cursor, Antigravity, Codex) or sign in via 6-digit Email OTP / Google Sign-In at `https://dislop.com/#cloud-token-box` to create scoped `dslp_*` API keys (paid-tier zero-training model endpoints, zero draft logging; see [`/privacy.md`](../privacy.md)).

### OAuth 2.1 Direct URL

```text
https://dislop.com/mcp
```

Metadata discovery: `https://dislop.com/.well-known/oauth-protected-resource/mcp` and `https://dislop.com/.well-known/oauth-authorization-server`.

### Claude Code (API Key or OAuth)
```bash
claude mcp add --transport http dislop https://dislop.com/mcp
# or with an API key created at https://dislop.com/#cloud-token-box:
claude mcp add --transport http dislop https://dislop.com/mcp --header "Authorization: Bearer dslp_YOUR_KEY"
```

### Cursor / Windsurf / Antigravity (`mcp.json`)
```json
{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "https://dislop.com/mcp",
      "headers": {
        "Authorization": "Bearer dslp_YOUR_KEY"
      }
    }
  }
}
```

### Codex (`~/.codex/config.toml`)
```toml
[mcp_servers.dislop]
url = "https://dislop.com/mcp"
http_headers = { Authorization = "Bearer dslp_YOUR_KEY" }
```

### Official Cloud MCP Tools

- `dislop_check`, `dislop_rules`, `dislop_explain`, `dislop_packs` (0 credits; note remote `dislop_check` accepts `text` only, not local filesystem `path`).
- `dislop_review` (1 credit, requires auth):
  - Input: `{ "text": "...", "pack"?: "auto"|"business-brief"|..., "lang"?: "en"|"zh", "minSeverity"?: "info"|"warning"|"error", "maxFindings"?: 1..25 }`
  - Output: `dislop.findings/1` structured review with exact code-point `anchor` spans, `revision` (`edit` / `rewrite` / `ask`), protected facts in `keep`, and telemetry.
- `dislop_deslop` (2 credits, requires auth):
  - Input: `{ "text": "...", "pack"?: "auto"|"business-brief", "lang"?: "en"|"zh", "voiceProfile"?: object, "voiceProfileId"?: string, "output"?: "text"|"edits" }`
  - Output: `{ mode, model, revised, changes, afterCheck, numericDiff, attempts, repaired, billing }` (fails closed if protected facts or numbers drift).
- `dislop_office` (2 credits review / 3 credits deslop, requires auth):
  - Accepts extracted JSON `segments` for `.docx` / `.pptx` review or batched clean rewrites while guarding protected numbers and slide length.
- `dislop_visual_review` (2 credits, requires auth): accepts an image screenshot, URL, or HTML snippet for visual anti-slop review.
- `dislop_voice_extract` (2 credits, requires auth): builds a reusable `dislop.voice/1` profile from 1-5 writing samples and saves it to your account.
- `dislop_voice_manage` and `dislop_account` (0 credits, requires auth): list/get/delete saved voice profiles and inspect quota balance.

## 2. Cloud HTTP API & JS Core Export

- Same-origin HTTP endpoints: `GET /api/health`, `GET /api/v1/auth/session`, `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`, `GET /api/v1/auth/google/start`, `GET/POST/DELETE /api/v1/account/{me,keys,apps,voices,usage}`, `DELETE /api/v1/account`, `POST /api/v1/check`, `POST /api/v1/review`, `POST /api/v1/deslop`, `POST /api/v1/office/{review,deslop}` (including binary base64 `.docx` / `.pptx` round-trip and Word Track Changes), `POST /api/v1/voice/extract`, and `POST /api/v1/waitlist`.
- `package.json` exports the zero-I/O pure ES module `src/core.mjs` (`auditText`, `auditOoxmlEntries`, `resolveEffectivePack`).
- Note: existing local `--mcp` stdio code remains in the open-source CLI during real-world evaluation, while official manifests target `https://dislop.com/mcp`.
