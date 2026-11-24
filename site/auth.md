---
content-type: reference-data
version: 0.9.0
snapshot: 2026-11-21
---

# dislop Agent Auth & Access Guide

Connect to `https://dislop.com/mcp` with zero configuration for free checks, or sign in when you need multi-model review, layout-preserving Office cleanup, or visual screenshot audits.

## 1. Free Tools Without Sign-In (0 Credits)

Calling `dislop_check`, `dislop_verify`, or `dislop_rules` on `https://dislop.com/mcp` requires no Bearer token or OAuth flow. These deterministic checks run on the server and return structured `dislop.findings/1` diagnostics immediately.

## 2. OAuth 2.1 + PKCE S256 (Recommended for Remote MCP Clients)

Paid and account tools (`dislop_review`, `dislop_deslop`, `dislop_office`, `dislop_visual_review`, `dislop_voice_extract`, `dislop_voice_manage`, `dislop_account`) use standard OAuth 2.1 with dynamic client registration and PKCE S256:

- Authorization server metadata: `https://dislop.com/.well-known/oauth-authorization-server`
- Protected resource metadata (MCP): `https://dislop.com/.well-known/oauth-protected-resource/mcp`
- Supported scope: `dislop`
- Free signed-in tier: `30` credits per month (paid-tier Gemini models, zero draft training)

## 3. Personal Bearer Token (`dslp_*`)

For scripts or CLI wrappers, sign in at `https://dislop.com/#cloud-token-box` via Google, GitHub, or 6-digit email OTP to create a scoped `dslp_*` token and pass `Authorization: Bearer dslp_...` to `https://dislop.com/mcp`.

## 4. Offline Local Alternative (Zero Network)

Run the same 7 rule packs and 65 patterns locally with no sign-in or uploads:

```bash
npx --yes dislop check . --pack auto --format agent
```
