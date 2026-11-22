---
name: dislop
version: 0.7.1
description: Linter for AI Slop. Helps coding and office agents catch and fix AI-sounding text and template layouts in docs, web UI, and slides using pure-Markdown references, local offline CLI, or Official Cloud MCP.
---

# dislop

- **Skill (Markdown only, `0` scripts, `0` network)**: Read only the matching local file under `./references/` before drafting.
- **Local CLI (`< 250 KB`, `0` uploads)**: Offline deterministic checker (`7` packs, `42` rules, `14.6 KB` Pocket ML, `11` extended probes) for terminals, hooks, and CI. Zero hits clears known surface and structural patterns, not deep content hollowness.
- **Official Cloud MCP (`https://dislop.com/mcp`)**: Sign in for multi-model genre-aware review (`dislop_review` returns structured issues and edit guidance so you revise in local context) and optional `dislop_deslop` / `dislop_voice_extract` (`30` free credits/mo).

## Local References

- Briefs, PRDs, RFCs, PRs & postmortems -> `./references/business-and-rfc.md`
- Essays, columns & narrative cadence -> `./references/editorial-and-essay.md`
- Web UI (`HTML/CSS/JSX`) & `.pptx` decks -> `./references/web-ui-and-deck.md`
- Regulated comms & rewrite precision -> `./references/regulated-and-precision.md`

*(Web fallback only when `./references/` is absent: `https://dislop.com/llms.txt`.)*

## 1. Write Plainly First

1. Open on a concrete file, metric, ticket, command, or scene.
2. Replace corporate buzz-clusters (`leverage`, `streamline`, `robust`) with facts.
3. Skip 3-part semicolon pitches, `"Why...? Because..."` hooks, 5-comma run-ons, and repeated paragraph openers.
4. Never swap clichés for `"Not X — it's Y"` pivots, staccato slogans, or moralizing closers.
5. Keep languages separate while keeping exact identifiers and units (`Q4`, `TPS`, `P99`, `42ms`).
6. Avoid `href="#"`, unexplained `<button disabled>`, purple-pink gradients, pill walls (`> 6`), and `"Overview"` slide titles.

## 2. Run Local CLI Check (When Shell Is Available)

Packs (`core` errors always on, or `--pack auto`): `business-brief`, `engineering-spec`, `regulated-comms`, `literary-essay`, `deck-and-ui`, `executive-deck`.

```bash
npx --yes dislop check <path> --pack auto --profile --ml --patterns --format json
npx --yes dislop explain <rule-id>
```

## 3. Revise in Context & Re-Check

Fix `core` `error` items first. If Official Cloud MCP (`dislop_review`) is connected, use its structured issues and guidance to revise with full project context. Keep numbers, qualifiers (`"up to"`, `"at least"`), URLs, and code spans exact, then re-run `dislop check`.

## Official Cloud MCP

```json
{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "https://dislop.com/mcp",
      "headers": {
        "Authorization": "Bearer dslp_your_token_here"
      }
    }
  }
}
```
