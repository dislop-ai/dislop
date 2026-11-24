---
content-type: reference-data
version: 0.9.0
snapshot: 2026-11-21
---

# Privacy & Data Boundaries

`dislop` separates its **open-source offline tools** from its **optional hosted cloud service** so you always know whether text leaves your machine.

## 1. Open-Source Local Tools (Zero Uploads, Zero Telemetry)

- **Pure-Markdown Agent Skill (`skills/dislop/`, zero scripts)**, **Local CLI (`dislop check`, `patterns`, `voice`, `explain`, `packs`, `catalog`, `resources`)**, **Local Editor Plugins**, and the **local rule mode** in the browser workbench run on your machine with zero network calls.
- `dislop check`, `dislop patterns`, and `dislop voice` make zero network calls.
- `dislop.com` loads zero third-party fonts, analytics, or external scripts (`Content-Security-Policy: connect-src 'self'`).

## 2. Official Cloud MCP & Web AI (`/api/v1/*` & `/mcp`)

Data is sent to `dislop.com` **only** when you sign in and explicitly click a Cloud AI button in the workbench, manage keys or saved voice profiles, submit the early-access waitlist, or call an authenticated Official Cloud MCP tool:

- **Upstream Model Providers**: Paid-tier Google Gemini API (prompts and outputs are not used for model training; Google may retain prompts for a limited period for abuse monitoring under its API terms).
- **Zero Draft Storage**: Draft text and uploaded Office files are processed in memory; we do not store drafts, filenames, or log their text.
- **Sign-In Gate & Account Records**:
  - Cloud LLM endpoints require an authenticated browser session (Email 6-digit OTP or Google OAuth) or a `dslp_*` Bearer token / MCP OAuth 2.1 grant (30 free monthly credits; no unauthenticated anonymous LLM trials).
  - We store your email, optional Google subject ID, one-way **SHA-256 hashes** of API keys and sessions (never plaintext keys), any voice cards you explicitly save, and your monthly credit counter.
  - You can revoke individual keys, disconnect OAuth apps, or delete your account self-serve in the Account Hub (`DELETE /api/v1/account`).
- **Confidential Drafts**: Never send confidential, regulated, or unreleased source documents to any hosted cloud endpoint; use the local offline CLI or pure-Markdown Skill instead.

## 3. Contact & Security Disclosures

- **Support, account deletion & privacy inquiries**: `hello@dislop.com`
- **Vulnerability & security reports**: `security@dislop.com`
