---
name: deslop-verify
description: Verify revised drafts against original text or git HEAD to catch dropped numbers, units, URLs, code spans, proper nouns, and second-order AI slogans.
---

# deslop-verify

Use right after revising prose or running an external rewrite prompt on any important document.

## Workflow

1. Check the revised file for leftover delivery `DEFECT`s or unprompted negation slogans:
   ```bash
   npx --yes dislop check <revised-file> --format agent
   ```
2. Run the deterministic Fact Gate against `git HEAD` (or `<before-file> <after-file>`):
   ```bash
   npx --yes dislop verify --git HEAD <revised-file>
   ```
3. If `dislop verify` reports dropped numbers, units, URLs, inline code spans, proper nouns, or newly introduced `"not just X — it's Y"` slogans, restore the exact facts and re-verify until exit code is `0`.
