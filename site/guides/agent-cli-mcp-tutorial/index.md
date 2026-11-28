---
content-type: reference-data
lang: en
updated: 2026-11-23
version: 1.1.2
---

# Adding an AI Slop Linter to Claude Code, Codex, Cursor, and GitHub Actions

> The cleanest anti-slop setup splits prevention from verification: load the pure-Markdown Skill before drafting so agents avoid stock templates, then run the offline `dislop check` CLI locally or on `--changed` PR lines. For office agents without local shells, connect `https://dislop.com/mcp`.

Open-source maintainers have moved from complaining about AI slop to shutting down intake channels: Ghostty added `AI_POLICY.md` requiring pre-approved issues and tool disclosure, tldraw began auto-closing external PRs in January 2026, and CodeRabbit found AI-generated PRs carry roughly 1.7x more issues than human PRs.

Adding deterministic checks to your agent workflow and CI takes under two minutes.

## 1. Pick the right surface for your workflow

| Goal | Surface | Where it runs | Command / endpoint |
|---|---|---|---|
| **Prevent clichés while drafting** | Pure-doc Skill | Local coding agent | `npx --yes skills add dislop-ai/dislop --skill dislop` |
| **Verify docs, UI, and slides offline** | Zero-dep CLI | Local shell (0 uploads) | `npx --yes dislop check .` |
| **Block PR artifacts incrementally** | `--since` + GitHub Action | Pre-commit / CI | `npx --yes dislop check --since origin/main --fail-on error` |
| **Office agents without local CLI** | Official Cloud MCP | `https://dislop.com/mcp` | 0-credit checks without login; OAuth 2.1 or sign in for 30 free credits/mo |

## 2. Connect coding agents and editors

### Install the cross-host Agent Skill (Claude Code, Codex, Cursor, Antigravity)

Following the open `Agent Skills` specification, install the Markdown-only reference cards (`work-docs`, `essay`, `office`, `web-ui`) in one command:

```bash
npx --yes skills add dislop-ai/dislop --skill dislop
```

In a web chat client where local tools are unavailable, paste this single line:

```text
Read https://dislop.com/llms.txt and follow its writing and design anti-slop rules and checks before delivering my next doc, slide deck, or web page.
```

### Connect Official Cloud MCP (`mcp.json`)

Auto-discovery metadata is published at `https://dislop.com/.well-known/mcp/server-card.json`. `dislop_check`, `dislop_verify`, and `dislop_rules` run at 0 credits without login; OAuth 2.1 or a free Bearer token unlocks 30 monthly credits for cloud review and rewrite tools.

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

![Coding Agent + CI loop: loading pure-Markdown SKILL.md, gating PR diff with exit 1, and running dislop verify](demo:agent-workflow)

## 3. Gate pull requests incrementally in GitHub Actions

Start with `--changed` and `--fail-on error` so CI blocks hard AI leftovers without noise on untouched legacy files:

```yaml
name: dislop-gate
on: [pull_request]
jobs:
  check-slop:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: dislop-ai/dislop@v1.1.2
        with:
          since: origin/${{ github.base_ref }}
          fail-on: error
          format: sarif
```

For RFCs, PR descriptions, and incident postmortems, add explicit Packs alongside `.dislop.json` per-glob `overrides`:

```bash
npx --yes dislop check docs/ postmortems/ --pack common/artifact-qa,en/prose --no-llm --fail-on warning
```

![dislop CLI offline check failing with exit code 1 on draft and passing with exit code 0 after cleanup](demo:cli-check)

## FAQ

### Do I need both the pure-doc Skill and the CLI?

They solve different halves of the loop. The Markdown Skill prevents clichés while the agent drafts; the offline CLI deterministically checks finished Markdown, HTML, DOCX, and PPTX files afterward.

### Will adding dislop to CI fail on legacy documentation?

No, if you pass --changed origin/main --fail-on error. That checks only modified lines for hard AI delivery artifacts such as chat wrappers, placeholders, and dead href='#' buttons.

### Should confidential repositories use the Cloud MCP endpoint?

No. Keep confidential codebases and internal specs strictly on the open-source Markdown Skill and offline CLI, both of which run locally with zero outbound network calls.

## References

- [Agent Skills Specification](https://agentskills.io/specification): Cross-agent directory and SKILL.md manifest specification decoupling portable instruction skills from individual client hosts.
- [The /llms.txt Proposal (llmstxt.org)](https://llmstxt.org/): Defines a curated Markdown index at /llms.txt so coding agents and retrieval scrapers can locate task docs without parsing full HTML chrome.
- [vale-cli/vale: Syntax-aware linter for prose](https://github.com/vale-cli/vale): 6,413 stars (2026-11-21 snapshot); deterministic prose linter for Markdown, HTML, and AsciiDoc built around configurable YAML style rules.
- [Ghostty AI_POLICY.md](https://github.com/ghostty-org/ghostty/blob/main/AI_POLICY.md): 64,293 repo stars (2026-11-21 snapshot); restricts AI-assisted PRs to pre-approved issues, requires tool disclosure, and mandates full contributor comprehension.
- [CodeRabbit: State of AI vs Human Code Generation Report](https://www.coderabbit.ai/reports-guides): Measured AI-generated PRs averaging ~1.7x more issues (10.83 vs 6.45), 75% more logic errors, and >3x readability/formatting issues compared with human PRs.
- [tldraw: Stay away from my trash! (Issue #7695)](https://github.com/tldraw/tldraw/issues/7695): January 2026 policy auto-closing external pull requests in response to a surge of unreviewed AI-generated PRs.
- [Google Technical Writing Courses](https://developers.google.com/tech-writing): Engineering writing guidance prioritizing short sentences, clear actors, explicit scope boundaries, and lists/tables over wall-of-text paragraphs.
