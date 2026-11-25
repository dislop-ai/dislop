---
name: deslop-docs
description: Audit Markdown docs, READMEs, RFCs, and release notes for delivery Defects and editorial anti-slop Suggestions using dislop.
---

# deslop-docs

Use when drafting, cleaning, or checking Markdown documentation, technical RFCs, postmortems, READMEs, release notes, or briefs.

## Workflow

1. Run a compact read-only check before rewriting:
   ```bash
   npx --yes dislop check <path> --format agent
   ```
2. Fix objective `DEFECT` items first (stray chatbot wrappers, leaked `[oaicite:N]` citations, unfilled `[TODO]` placeholders, broken relative links).
3. Apply `SUGGESTION` items with restraint: delete zero-information throat-clearing or macro filler, and unwrap unprompted `"Not X, but Y"` framing without inventing facts.
4. Verify your revision kept every number, unit, URL, inline code span, and proper noun intact:
   ```bash
   npx --yes dislop verify --git HEAD <path>
   ```
