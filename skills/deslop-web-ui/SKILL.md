---
name: deslop-web-ui
description: Inspect HTML, CSS, JSX, TSX, and SVG files for dead placeholder links, unexplained disabled buttons, pill-badge soup, and stock neon gradients.
---

# deslop-web-ui

Use when reviewing or cleaning frontend components, landing pages, dashboards, or SVGs.

## Workflow

1. Run the multi-modal UI & artifact check:
   ```bash
   npx --yes dislop check <ui-dir-or-file> --format agent
   ```
2. Fix `DEFECT` items first: empty links, `<a href="#">` placeholder links, unexplained `<button disabled>` controls, missing `<svg viewBox>`, and unrendered Markdown leaks.
3. Review `SUGGESTION` items (`common/web-ui`): stock purple-to-pink gradients, `blur-3xl` glow orbs, and stacked `rounded-full` pill-badge soup.
4. Re-run `npx --yes dislop check <ui-dir-or-file> --format agent` before committing.
