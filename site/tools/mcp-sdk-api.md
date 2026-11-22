---
content-type: reference-data
version: 0.7.1
---

# Official Cloud MCP, HTTP API & JS Core

## 1. Official Cloud HTTP MCP (Sign-In Required, Free 30 Credits/Month)

Claim a free Bearer token (`dslp_...`) at `https://dislop.com/#cloud-token-box` (paid-tier zero-training model endpoints, no draft logging; see [`/privacy.md`](../privacy.md)).

### Claude Code
```bash
claude mcp add --transport http dislop https://dislop.com/mcp --header "Authorization: Bearer dslp_YOUR_FREE_TOKEN"
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

### Official Cloud MCP Tools

- `dislop_check`, `dislop_explain`, `dislop_packs` (0 credits; note remote `dislop_check` accepts `text` only, not local filesystem `path`).
- `dislop_review` (1 credit, requires Bearer token):
  - Input: `{ "text": "...", "pack"?: "business-brief", "lang"?: "en"|"zh" }`
  - Output: `{ mode, model, deterministic, thirdOrderHits, llmReview: { summary, aiFlavorLevel, issues }, billing }`
- `dislop_deslop` (2 credits, requires Bearer token):
  - Input: `{ "text": "...", "pack"?: "business-brief", "lang"?: "en"|"zh", "voiceProfile"?: object }`
  - Output: `{ mode, model, revised, changes, afterCheck, numericDiff, attempts, repaired, billing }`
- `dislop_voice_extract` (2 credits, requires Bearer token):
  - Input: `{ "samples": ["Sample 1...", "Sample 2..."], "lang"?: "en"|"zh" }`
  - Output: `{ schema: "dislop.voice/1", stylometrics, profile }` — pass `output.profile` as `voiceProfile` in `dislop_deslop`.

## 2. Cloud HTTP API & JS Core Export

- Same-origin HTTP endpoints: `GET /api/health`, `POST /api/v1/check`, `POST /api/v1/review`, `POST /api/v1/deslop`, `POST /api/v1/voice/extract`, `POST /api/v1/auth/register`, `GET /api/v1/account/me`, and `POST /api/v1/waitlist`.
- `package.json` exports the zero-I/O pure ES module `src/core.mjs` (`auditText`, `auditOoxmlEntries`, `resolveEffectivePack`).
- Note: existing local `--mcp` stdio code remains in the open-source CLI during real-world evaluation, while official manifests target `https://dislop.com/mcp`.
