---
content-type: reference-data
version: 0.7.1
snapshot: 2026-11-21
---

# Privacy & Data Boundaries

`dislop` separates its **open-source offline tools** from its **optional hosted cloud service** so you always know whether text leaves your machine.

## 1. Open-Source Local Tools (Zero Uploads, Zero Telemetry)

- **Pure-Markdown Agent Skill (`skills/dislop/`, zero scripts)**, **Local CLI (`dislop check`, `patterns`, `voice`, `explain`, `packs`, `catalog`, `resources`)**, **Local Editor Plugins**, and the **local rule mode** in the browser workbench run 100% locally.
- `dislop check`, `dislop patterns`, and `dislop voice` make zero network calls.
- `dislop.com` loads zero third-party fonts, analytics, or external scripts (`Content-Security-Policy: connect-src 'self'`). When the sign-in area loads, the browser fetches same-origin `/api/health` (and `/api/v1/auth/session` when signed in or visiting `#cloud-token-box`); clicking Google Sign-In navigates only on explicit user action.

## 2. Official Cloud MCP & Web AI (`/api/v1/*`, `/mcp`, `/oauth/*`)

Unauthenticated deterministic rule checks (`POST /api/v1/check` and MCP `dislop_check`) inspect submitted text transiently in memory and store nothing. All Cloud LLM endpoints require sign-in via Email 6-digit OTP (`HttpOnly` `__Host-dslp_sid` cookie session), Google Sign-In, OAuth 2.1 MCP authorization, or a scoped `dslp_*` API key:

- **Upstream Model Providers**: Paid-tier zero-training model endpoints (prompts and outputs are not used for model training).
- **Zero Draft Storage**: Draft text, uploaded `.docx`/`.pptx` files, and visual screenshots are processed in memory and never written to disk or server logs.
- **What Is Stored (Account & Service Metadata Only)**:
  - Account record: email address (for OTP login and notices), plan tier, monthly credit balance, and optional linked Google account subject ID (`sub`).
  - Optional saved voice cards: when you opt in (`save: true`), your extracted `dislop.voice/1` style summary is saved until you delete it in Account Hub.
  - Waitlist submissions: submitted email, selected plan, and optional note are saved to notify you at launch.
  - Hashed credentials & usage metadata: session tokens, OAuth tokens, and API keys are stored only as one-way SHA-256 hashes (plaintext keys appear once at creation). Usage logs record tool name, credit delta, timestamp, and source tag, never drafts or filenames.
  - Self-serve control: revoke API keys, disconnect OAuth apps, delete saved voice cards, or permanently delete your account via `DELETE /api/v1/account` from `https://dislop.com/#cloud-token-box`.
- **Confidential Drafts**: Never send confidential, regulated, or unreleased source documents to any hosted cloud endpoint; use the local offline CLI or pure-Markdown Skill instead.

## 3. Contact & Security Disclosures

- **Support, account deletion & privacy inquiries**: `hello@dislop.com`
- **Vulnerability & security reports**: `security@dislop.com`
