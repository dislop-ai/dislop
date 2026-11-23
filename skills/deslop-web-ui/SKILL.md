---
name: deslop-web-ui
description: Inspect AI-generated HTML, CSS, JSX, and SVG pages offline for dead placeholder links, fake disabled buttons, pill soup, and default gradients.
---

# deslop-web-ui

Use when reviewing or cleaning generated frontend components, landing pages, dashboards, or SVGs.

## Workflow

1. Run the offline structural and UI check:
   ```bash
   npx --yes dislop check <ui-dir-or-file> --pack deck-and-ui --compact --json
   ```
2. Eliminate `error` UI bugs first: `<a href="#">` dead links, unimplemented placeholder buttons, `TODO` labels, and `AI-Powered` prompt-echo badges.
3. Simplify flagged AI layout tics (`warning`): purple-pink neon gradients, pill-badge walls, 3-level nested card frames, and templated eyebrow numbers (`01 / ...`).
4. Replace banned placeholder copy with concrete product details already in scope; do not fabricate stats or customer logos.
5. Re-run `npx --yes dislop check <ui-dir-or-file> --fail-on warning` before committing.
