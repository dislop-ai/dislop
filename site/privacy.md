---
content-type: reference-data
version: 0.7.0
snapshot: 2026-11-21
---

# Privacy & Data Boundaries

`dislop` separates its **open-source offline tools** from its **optional hosted cloud service** so you always know whether text leaves your machine.

## 1. Open-Source Local Tools (Zero Uploads, Zero Telemetry)

- **Pure-Markdown Agent Skill (`skills/dislop/`, zero scripts)**, **Local CLI (`dislop check`, `patterns`, `voice`, `explain`, `packs`, `catalog`, `resources`)**, **Local Editor Plugins**, and the **local rule mode** in the browser workbench run 100% locally.
- `dislop check`, `dislop patterns`, and `dislop voice` make zero network calls.
- `dislop.com` loads zero third-party fonts, analytics, or external scripts (`Content-Security-Policy: connect-src 'self'`).

## 2. Official Cloud MCP & Web AI (`/api/v1/*` & `/mcp`)

Data is sent to `dislop.com` **only** when you sign in and explicitly click a Cloud AI button in the workbench, claim a free token, submit the early-access waitlist, or call an authenticated Official Cloud MCP tool:

- **Upstream Model Providers**: Paid-tier zero-training model endpoints (prompts and outputs are not used for model training).
- **Zero Draft Storage**: Draft text is processed in memory and never written to disk or server logs.
- **Sign-In Gate & Account Records**:
  - Cloud LLM endpoints require a registered `dslp_*` Bearer token (30 free monthly credits after email signup; no unauthenticated anonymous LLM trials).
  - When you claim a free token (`POST /api/v1/auth/register`), we store your email, a one-way **SHA-256 hash** of your Bearer token (never the plaintext key), and your monthly credit counter.
  - Re-registering with the same email rotates and invalidates the previous token immediately.
- **Confidential Drafts**: Never send confidential, regulated, or unreleased source documents to any hosted cloud endpoint; use the local offline CLI or pure-Markdown Skill instead.

## 3. Contact & Security Disclosures

- **Support, account deletion & privacy inquiries**: `hello@dislop.com`
- **Vulnerability & security reports**: `security@dislop.com`
