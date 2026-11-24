---
content-type: reference-data
version: 0.9.0
skill: deslop-slides-docx
---

---
name: deslop-slides-docx
description: Check Word (.docx) and PowerPoint (.pptx) files offline for unrendered markdown, chat leftovers, dense slide walls, and empty process titles.
---

# deslop-slides-docx

Use when preparing, inspecting, or cleaning `.docx`, `.pptx`, or PDF slide decks before sharing.

## Workflow

1. Scan the Office document offline without uploading files:
   ```bash
   npx --yes dislop check <deck.pptx-or-doc.docx> --compact --json
   ```
2. Fix OOXML `error` findings first: unrendered `**bold**` or `` `code` `` markup inside text runs, stray AI chat openers, and unfilled bracket placeholders.
3. Trim slide copy density when `deck-and-ui` or `executive-deck` flags text walls, `normText` shrink-to-fit overflow, empty process titles, or identical consecutive slide layouts.
4. Keep every metric, date, currency figure, and boundary qualifier exact while shortening sentences.
5. Re-run `npx --yes dislop check <file>` before exporting or sending.
