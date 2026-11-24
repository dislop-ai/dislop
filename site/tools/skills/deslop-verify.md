---
content-type: reference-data
version: 0.9.0
skill: deslop-verify
---

---
name: deslop-verify
description: Verify LLM-revised drafts after using Humanizer or stop-slop to catch lost metrics, dropped qualifiers, and 2nd-order slogan drift.
---

# deslop-verify

Use right after running a style rewrite prompt or external humanizer skill on any important draft.

## Workflow

1. Check the revised file for leaked AI artifacts, `Not X, but Y` 2nd-order slogans, or leftover filler:
   ```bash
   npx --yes dislop check <revised-file> --pack auto --deep --compact --json
   ```
2. Verify against git HEAD or the original source file so no numbers, dates, units, URLs, or risk qualifiers (`up to`, `projected`, `only if`) were dropped or altered:
   ```bash
   npx --yes dislop verify --git HEAD <revised-file> --strict
   ```
3. If the check catches new AI slogans (`negation-pivot-frame`), swallowed bounds (`up to 12 minutes` -> `5 minutes`), or stiff register drift, restore the exact source numbers and rewrite only the offending phrase.
4. Re-run both commands until exit code is `0`.
