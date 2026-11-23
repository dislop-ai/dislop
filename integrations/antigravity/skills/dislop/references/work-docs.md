# Work Docs, Technical Specs & Regulated Comms

Scope: READMEs, PRDs, RFCs, PR descriptions, postmortems, release notes, CLI help and error copy, emails, and regulated notices.
CLI pack: `dislop check <path> --pack business-brief` (or `engineering-spec` / `regulated-comms`).

## Rules & Fixes

1. **Strip chat wrappers & placeholders (`chatbot-artifact`, `unfilled-placeholder`)**: Delete opening conversational scaffolding and `[TBD]` markers; start directly on the ticket, release, or decision.
2. **Cut macro preambles & future-gazing (`narrative-sandwich-frame`)**: Drop trend openings (`"In an era defined by..."`) and vague outlooks (`"Looking ahead..."`).
3. **Break low-fact buzzword clusters (`cooccurrence-slop-cluster`)**: Replace stacked filler verbs (`leverage`, `streamline`, `robust`, `foster`) with the exact mechanism stated in the notes.
4. **Keep PRs, CLI copy & postmortems factual (`eng-pr-diff-parrot`, `eng-shallow-root-cause`, `eng-vague-action-item`)**: Copy owners, flags, thresholds, and due dates verbatim; list missing ones as open questions. State the missing check or recovery step directly instead of writing `"Not just X — it's Y"`.
5. **Cut absolute claims & unanchored multipliers (`reg-unsubstantiated-superlative`, `reg-unanchored-multiplier`)**: Delete unproven absolutes (`"always guaranteed"`, `"never fails"`) and bare multipliers (`"5x speed gain"`); cite a standard or baseline only when present in the source, and keep hedging words like `projected` intact.
6. **No invented attribution or bold list walls (`unsourced-attribution`, `bold-lead-list-wall`)**: Drop filler such as `"Studies show"`, keep source evidence labels (`benchmarked`, `measured`) without upgrading them, and turn stacked `- **Label**: text` lists into plain prose.
7. **Honest edits only**: Remove real filler while keeping every distinct point and mechanism intact; never compress multi-paragraph prose into a stub or add fake typos.

## Contrast

- **Original**: ``Good afternoon! Attached is a summary of our harbor dredge pump ticket: the PR leverages robust filter-screen inspection to run 5x faster with fail-safe uptime every 72 hours.``
- **Overcorrected**: ``Not a filter tweak — a harbor reliability leap. Steadier. Cleaner. Ready for work.``
- **Clean**: ``The harbor dredge pump ticket uses filter-screen inspection every 72 hours.``

## Keep These Intact

- Standard `Keep a Changelog` headings (`Added`, `Changed`, `Fixed`), PR checklists, legal `shall`/`must` clauses, and domain terms (`leverage` in finance, `robust` in statistics).
- Quoted speech, code identifiers, URLs, bounds, relative dates (`yesterday`), and `from X to Y` direction.
