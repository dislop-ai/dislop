# Migration, Decoupling & Security TODOs

`dislop` has been re-architected into a single-stack Node.js (`>= 20`) Pluggable Micro-Kernel CLI, SDK, and local MCP server. Track the following follow-up tasks:

## 1. Extract Static Website & Content Directories Out of `dislop`

Currently retained untouched on disk (and excluded from npm `"files"` in `package.json`):
- `site/` — Pre-compiled static HTML, CSS, JS, and discovery files currently served from `/var/www/dislop/site` by Nginx on `dislop.com`.
- `content/` — Bilingual Markdown guides previously compiled into `site/guides/`.
- `awesome/` — Curated Awesome Anti-Slop Markdown lists (`README.md`, `README.zh-CN.md`).

### Action Items
1. Move `site/`, `content/`, and `awesome/` (along with `docs/research/anti-slop-radar-index.json` if needed by `/awesome/`) into either a dedicated website repository (e.g., `dislop-ai/dislop-site` / `dislop-ai.github.io`) or `dislop-cloud`.
2. Update the production static deploy pipeline to publish `/var/www/dislop/site` from the extracted website repository instead of `dislop`.
3. Update the browser workbench in `site/` if client-side inspection is desired against the new `packs/` format, or route interactive checks through `dislop-cloud`.
4. Delete `site/`, `content/`, and `awesome/` from `dislop` once the external deployment pipeline is live.

## 2. Align `dislop-cloud` with the Micro-Kernel `dislop.report/1` Contract

`dislop-cloud` was intentionally left untouched during the Micro-Kernel CLI rewrite:
1. Update `POST https://dislop.com/api/v1/review` in `dislop-cloud` to accept segment-indexed payloads from `src/runtime/providers/cloud.mjs` and return items conforming to `dislop.report/1`.
2. Replace `dislop-cloud/scripts/sync_core.mjs` + `dislop-cloud/vendor/` (which previously vendored the legacy `src/core.mjs` and `pack.json` manifests) with a clean dependency on `dislop` (`src/kernel/` + `packs/`).

## 3. Add CI Malicious-Pack Security Scanner for Community Pack PRs

Because Packs are separated into `pack.json`, `scripts/*.mjs`, and `prompts/*.md` and reviewed via GitHub PRs, add a dedicated CI gate (`.github/workflows/ci.yml` + `scripts/verify-packs-security.mjs`) that fails incoming PRs if any Pack contains:
1. **Boundary Tag / Prompt-Override Injection in `prompts/*.md` or `.pack.md`**:
   - Any literal kernel delimiter tags (`<pack_rules>`, `</pack_rules>`, `<untrusted_document>`, `</untrusted_document>`, `<context_readonly>`, `</context_readonly>`).
   - Jailbreak / override directives (`ignore previous instructions`, `override core invariants`, `system prompt`, `disregard safety`, etc.) or leaked internal schema identifiers (`actionType`, `fixSafety`, `suggestedReplacement`).
   - Hidden zero-width or bidirectional Trojan Source Unicode characters (`U+200B`–`U+200F`, `U+202A`–`U+202E`, `U+2066`–`U+2069`, `U+FEFF` mid-file).
2. **Forbidden Runtime Capabilities in `scripts/*.mjs`**:
   - Disallow outbound network, process-spawning, dynamic code execution, or filesystem mutation primitives inside Pack scripts (`child_process`, `http`, `https`, `net`, `tls`, `dgram`, `dns`, `fetch`, `WebSocket`, `eval`, `new Function`, `fs.writeFile*`, `fs.unlink*`, `fs.rm*`).
