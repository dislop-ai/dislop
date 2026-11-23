# Word (`.docx`) & PowerPoint (`.pptx`) Decks

Scope: Word proposals and reports (`.docx`), executive decks (`.pptx`), slide outlines, and Office XML or document-API edits.
CLI pack: `dislop check <file.docx-or-pptx> --pack executive-deck` (or `business-brief` for `.docx`).

## Rules & Fixes

1. **Strip leaked Markdown & chat wrappers (`markdown-leak`, `chatbot-artifact`, `unfilled-placeholder`)**: Remove `**bold**`, `## Heading`, backticks, placeholder tags, and conversational wrapper sentences. Delete wrapper nouns whole—never glue partial headings onto body sentences.
2. **Keep XML structure, document-API styles & grammar intact**: Preserve valid XML tags (`<w:document>`, `<p:sld>`), document-API paragraph styles, tracked changes (`<w:ins>`, `<w:del>`), comments, and tables. Leave existing text runs and split numbers intact (for example `$18.` + `5M`) unless merging is necessary; after cutting hype modifiers (`Their faultless backup cluster`), keep determiner grammar intact (`Their backup cluster`).
3. **Write finding headlines (`slide-weak-topic-title`, `slide-process-not-finding-title`)**: Replace generic headings (`"Overview"`, `"Background"`) with the specific finding and source number (`"North Pier Pump Drew $42k Excess Power"`).
4. **Keep slides scannable without repeating numbers (`slide-word-wall`, `slide-bullet-overload`, `slide-autofit-shrink`)**: When drafting slides, stay within 120 words and 5–6 bullets without `<a:normAutofit fontScale="65000"/>`, and avoid repeating the headline number inside bullets. When revising, keep all source facts intact.
5. **Break consecutive bullet skeletons (`pptx-layout-monotony`)**: Across 4+ slides, vary layouts with tables for comparisons and charts for trends.

## Contrast

- **Original (`slide1.xml`)**: ``Title: Project Overview | Body: Happy to assist! Below is the slide copy. **Finding**: North pier pump drew $42k excess power in May, needing 4x stronger governance.``
- **Overcorrected**: ``Title: Pumping Reimagined | Body: Summary. This isn't an energy bill — it's an efficiency reset.``
- **Clean**: ``Title: North Pier Pump Drew $42k Excess Power in May``

## Keep These Intact

- Existing Word tracked changes, comments, tables, document-API formatting, and split run boundaries.
- Structural labels (`Timeline:`), numbers, units, bounds, and hedging words when deleting adjacent hype.
