# Web UI, Components & Interface Copy

Scope: Web pages, CSS, HTML, JSX/TSX components, dashboards, and browser interface copy.
CLI check: `dislop check <dir> --pack web-ui --format agent`

## Rules & Fixes

1. **Zero dead controls (`ui-dead-control`, severity `error`)**: Never emit `<a href="#">`, empty `href=""`, or unexplained `<button disabled>`. Wire only real routes from the codebase or prompt; if an action is unbuilt, omit the control or explain why it is disabled with visible text linked via `aria-describedby`.
2. **Skip stock AI chrome (`ui-ai-gradient`, `ui-pill-soup`, `ui-box-in-box`, `ui-prompt-echo-badge`)**: Avoid indigo-purple-pink neon gradients, `bg-clip-text text-transparent` hero titles, `> 6` `rounded-full` pills per view, triple nested bordered boxes, and `"AI-Powered"` or `"Zero Hallucination"` badges.
3. **Skip secondary fallback templates (`ui-glassmorphism-overuse`, `ui-accent-stripe-card`)**: Do not replace neon gradients with stacked `backdrop-blur` translucent cards, thick `border-l-4` accent stripes, or warm-beige `#F7F5F0` 3-column icon boxes.
4. **Use clean structural grammar**: Use `1px` rules, clear type scale, `tabular-nums` for aligned metrics, and restrained radii (`0–6px`). When revising existing UI, fix flagged issues in place without redesigning working layout or wrapping a snippet prompt in a full `<!DOCTYPE html>` shell unless asked.
5. **Keep UI copy exact**: State only requested labels, counts, states, and existing routes without inventing headings or file names.
6. **Respect non-UI graphic deliverables (posters, infographics, flowcharts, diagrams, comics)**: Standalone posters are not slide decks—never recommend moving text to speaker notes; open diagram connectors and feedback loops are structural graph edges, never treat them as nested `box-in-box` UI chrome or delete return arrows; keep explicit warm-paper or dark palettes when chosen intentionally.

## Contrast

- **Original**: ``<div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"><span>AI-Powered</span><h2>4 cranes offline</h2><a href="#">Export Schedule</a></div>``
- **Overcorrected**: ``<div class="backdrop-blur-md bg-white/30 border-l-4 border-purple-500"><span class="rounded-full">Verified Live</span><a href="#">Export Schedule</a></div>``
- **Clean**: ``<section class="panel"><h2>4 cranes offline</h2></section>``

## Keep These Intact

- Existing valid `href` / `src` targets, exact labels, counts, units, and accessibility attributes (`aria-describedby`, `title`, `alt`).
- Clean layout CSS rules and responsive breakpoints already present in existing UI.
