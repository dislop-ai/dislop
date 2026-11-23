# dislop for VS Code & Open VSX

Cutting AI slop is real productivity. Linter for AI Slop built on `src/core.mjs` — helps you (and your agent) catch and fix AI-sounding text and template layouts locally.

## Preview

![dislop auditing a launch note across three states](https://dislop.com/assets/demos/proof-cycle-en-v2.gif)

## Features

- Checks `.md`, `.mdx`, `.txt`, `.html`, `.css`, `.jsx`, and `.tsx` offline with 7 built-in packs (53 rules).
- Marks AI delivery artifacts (`error`) and cliché/template patterns (`warning`) with hover examples (`Original` / `Overcorrected` / `Clean`).
- Quick Fix (`Cmd+.`) inserts a documented `dislop-ignore-next-line` comment.
- Registers the Official Cloud MCP server (`https://dislop.com/mcp`, with 0-credit checks available without login) and offline `dislop_check_document` language model tool automatically.

## Build & Test

```bash
node integrations/vscode/scripts/build.mjs
node integrations/vscode/test_extension.mjs
```
