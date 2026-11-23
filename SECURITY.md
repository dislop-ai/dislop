# Security Policy

## Scope & Privacy Model

- **Local Skill, CLI, and Plugins (`dislop`)**: Run offline on your machine with zero uploads, zero telemetry, and zero external network calls during inspection (`dislop check`, `dislop patterns`, `dislop voice`). Never commit secrets, personal filesystem paths, or internal hostnames into repository fixtures or configuration examples.
- **Official Hosted MCP & Web AI (`https://dislop.com/mcp`, `/api/v1/*`)**: Hosted Cloud endpoints use paid-tier model APIs that do not train on submitted content and process submitted drafts only in memory. See [site/privacy.md](./site/privacy.md) for credential hashing and data retention details.

## Supported Versions

Security fixes apply to the latest `0.7.x` release line on `main` (published via `npm` and `PyPI`).

## Reporting a Vulnerability

Do not open a public GitHub Issue for unpatched security vulnerabilities, SSRF vectors in archive/SVG/HTML parsers, or hosted service bypasses.

- Preferred channel: open a private report through [GitHub Security Advisories](https://github.com/dislop-ai/dislop/security/advisories/new).
- Alternative contact: email `hello@dislop.com` with reproduction steps, affected version, and proof-of-concept inputs (redacted of real secrets or private data).

We acknowledge reports within 48 hours and coordinate disclosure once a patch release is available.
