---
name: deslop-docs
description: Audit Markdown docs, READMEs, RFCs, and release notes for AI chat wrappers, clichés, and vague filler using dislop offline rules.
---

# deslop-docs

Use when drafting, cleaning, or checking Markdown documentation, technical RFCs, postmortems, READMEs, release notes, or short briefs.

## Workflow

1. Run an offline deterministic check before rewriting:
   ```bash
   npx --yes dislop check <path> --pack auto --deep --compact --json
   ```
2. Remove `error` artifacts first (stray chatbot greetings, citations like `[oaicite:N]`, unfilled placeholders).
3. Rewrite flagged `warning` clichés and 2nd-order negation slogans (`"Not X, but Y"`) into plain specifics. Keep every original number, unit, date, and qualifier intact.
4. Do not invent causes, metrics, or examples absent from the draft.
5. Re-run `npx --yes dislop check <path> --fail-on warning` until hard errors and clichés clear.
