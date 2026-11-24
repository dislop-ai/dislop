---
content-type: reference-data
version: 0.9.0
snapshot: 2026-11-21
---

# auth.md

- **Resource Server:** https://dislop.com/mcp
- **Authorization Server:** https://dislop.com

Connect to https://dislop.com/mcp with zero setup for free checks, or register via OAuth 2.1 when calling multi-model review, layout-preserving Office cleanup, or visual screenshot audits.

## Step 1 — Free Tools Without Sign-In (0 Credits)

Calling `dislop_check`, `dislop_verify`, or `dislop_rules` on https://dislop.com/mcp requires no Bearer token or OAuth registration. These deterministic checks return structured `dislop.findings/1` diagnostics immediately.

## Step 2 — Discover OAuth 2.1 & `agent_auth` Metadata

Fetch protected resource and authorization server metadata (including the `agent_auth` block):

- Protected resource metadata: https://dislop.com/.well-known/oauth-protected-resource/mcp
- Authorization server metadata: https://dislop.com/.well-known/oauth-authorization-server
- Supported scope: `dislop`
- Free signed-in tier: `30` credits per month (paid-tier Gemini models, zero draft training)

## Step 3 — Dynamic Client Registration & PKCE S256

Register a public OAuth client before initiating PKCE `/oauth/authorize` and `/oauth/token`:

```http
POST /oauth/register HTTP/1.1
Host: dislop.com
Content-Type: application/json

{
  "client_name": "my-agent-client",
  "redirect_uris": ["http://127.0.0.1:8788/callback"],
  "token_endpoint_auth_method": "none"
}
```

## Step 4 — Personal Bearer Token (`dslp_*`)

For scripts or CLI wrappers, sign in at https://dislop.com/#cloud-token-box via Google, GitHub, or 6-digit email OTP to create a scoped `dslp_*` token and pass `Authorization: Bearer dslp_...` to https://dislop.com/mcp.

## Step 5 — Offline Local Alternative (Zero Network)

Run the same 7 rule packs and 65 patterns locally with no sign-in or uploads:

```bash
npx --yes dislop check . --pack auto --format agent
```
