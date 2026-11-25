# Security Policy

## Scope & Privacy Model

- **Local CLI, SDK, Skills & Stdio MCP (`dislop`)**:
  - Default routing (`routing: "local"`) performs **zero external network uploads** and zero telemetry.
  - Ambient environment API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) are gated by `src/runtime/privacy-gate.mjs`: in interactive TTY sessions, `dislop` asks once before sending text to an unapproved remote host; in Non-TTY / CI / agent sessions, unapproved ambient keys are skipped automatically unless `--engine byok` is explicitly passed or the host is listed in `approvedHosts`.
  - Note that loopback endpoints (`localhost`, `127.0.0.1`) configured in `providers` are treated as local runtimes; if you run a local reverse proxy forwarding to a remote cloud API, set `"routing": "byok"` (or pass `--no-llm` when working offline).
- **Prompt-Injection & Archive Safety**:
  - Untrusted target documents are isolated with boundary-tag escaping (`<untrusted_document>`), LLM outputs are structurally clamped to non-blocking `Suggestion`s with `fixSafety` capped at `"review" | "manual"`, and `src/kernel/fact-gate.mjs` deterministically blocks injected URLs, inline code spans, or fabricated numbers.
  - OOXML (`.docx`, `.pptx`) parsing enforces a 3,000-entry cap, 120 MB uncompressed XML ceiling, path-traversal checks, and XXE (`<!DOCTYPE` / `<!ENTITY`) rejection.
- **Official Hosted Cloud (`https://dislop.com`)**: Uses paid-tier model APIs that do not train on submitted content.

## Supported Versions

Security fixes apply to the latest `1.0.x` release line on `main` (Node.js `>= 20.0.0`, published via `npm`).

## Reporting a Vulnerability

Do not open a public GitHub Issue for unpatched security vulnerabilities, archive/parser bypasses, or prompt-injection escapes.

- Preferred channel: open a private report through [GitHub Security Advisories](https://github.com/dislop-ai/dislop/security/advisories/new).
- Alternative contact: email `hello@dislop.com` with reproduction steps, affected version, and redacted proof-of-concept inputs.

We acknowledge reports within 48 hours and coordinate disclosure once a patch release is available.
