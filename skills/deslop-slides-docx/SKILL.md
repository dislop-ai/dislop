---
name: deslop-slides-docx
description: Check Word (.docx), PowerPoint (.pptx), PDF, and raster image deliverables offline for raw Markdown leaks, placeholders, and slide overflow.
---

# deslop-slides-docx

Use when preparing, inspecting, or cleaning `.docx`, `.pptx`, `.pdf`, or image deliverables before sharing.

## Workflow

1. Scan the Office or slide file locally (`0` network uploads by default):
   ```bash
   npx --yes dislop check <deck.pptx-or-doc.docx> --format agent
   ```
2. Fix `DEFECT` items first: unrendered `**bold**` Markdown syntax leaked into OOXML runs, stray AI chat wrappers, unfilled placeholders, `normAutofit` font shrink below `80%`, and unstripped ComfyUI/A1111 workflow metadata in images.
3. Address `SUGGESTION` items on overloaded slides (`> 120` words or `> 6` bullets) while keeping every metric, currency symbol, unit, and entity intact.
4. Re-run `npx --yes dislop check <file> --format agent` to confirm zero `DEFECT(error,...)` items remain.
