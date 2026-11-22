---
content-type: reference-data
task: pre-release-gate
version: 0.7.1
---

# Task Bundle: Pre-Release Objective Gate & CI

Use this bundle when gating pull requests, release docs, or agent-produced Office/PDF deliverables with zero subjective style noise.

## 1. Objective Invariants (`packs/core`, `error`)

### Pack `core`
- [`unfilled-placeholder`](../rules/unfilled-placeholder.md) (`error`): Unfilled AI template placeholder or dummy copy.
- [`chatbot-artifact`](../rules/chatbot-artifact.md) (`error`): Unstripped chatbot wrapper sentence or AI search citation token.
- [`markdown-leak`](../rules/markdown-leak.md) (`error`): Raw Markdown syntax (`**bold**` or `## heading`) pasted unrendered into Word or PowerPoint.
- [`ui-dead-control`](../rules/ui-dead-control.md) (`error`): Placeholder `href="#"` link, empty button, or unexplained disabled button typical of generated UI mockups.

## 2. Incremental CI & Local Verification

```bash
# Gate only git-changed lines against main (exit 1 on core error)
npx --yes dislop check --changed origin/main --fail-on error --format github

# Emit SARIF 2.1.0 for GitHub Code Scanning
npx --yes dislop check . --fail-on error --format sarif > dislop.sarif
```

Deep dives: [Pack `core`](../packs/core.md) · [CLI & Hooks](../tools/cli-and-hooks.md) · [MCP & SDK](../tools/mcp-sdk-api.md)
