---
name: dislop
version: 1.1.2
description: "Use when drafting or revising text or deliverables a person will read: README, docs, PR descriptions, release notes, RFCs, postmortems, CLI help/errors, emails, essays, web pages and UI copy (HTML/CSS/JSX/SVG), or Word and PowerPoint files. Removes AI-sounding phrasing, chatbot leftovers, placeholders, and template layouts without changing facts."
---

# dislop

Pick the single reference card matching the **language of the text you are writing or editing** (English -> `.md`, Chinese -> `.zh-CN.md`). Read it before drafting or revising.

## 1. Reference Cards

| Deliverable | English | Chinese |
|---|---|---|
| Docs, README, PR, RFC, postmortem, release notes, CLI help & error copy, email | `./references/work-docs.md` | `./references/work-docs.zh-CN.md` |
| Essays, columns, narrative non-fiction | `./references/essay.md` | `./references/essay.zh-CN.md` |
| Word (`.docx`) & PowerPoint (`.pptx`) files | `./references/office.md` | `./references/office.zh-CN.md` |
| Web pages, HTML/CSS/JSX & browser UI copy | `./references/web-ui.md` | `./references/web-ui.zh-CN.md` |

## 2. Drafting New Text

1. Open directly on a concrete fact, file, metric, or action from the notes; let sentence length follow the thought naturally.
2. Every clause must trace to the notes or workspace files. Never invent unstated causes, downstream effects, wider scope, or stronger modality (`projected` -> `cuts`).
3. Keep source qualifiers (`measured`, `projected`, `about`, `up to`) intact. Omit missing metadata fields without leaving `[TODO]` or `[insert ...]` placeholders; list open questions separately if needed.

## 3. Revising Existing Drafts

1. Leave clean, direct sentences, grounded domain terms, and the author's natural voice untouched. Do not rewrite ordinary sentences merely because they contain an abstract verb.
2. Fix objective `Defect`s (`error` / `warning`) first: stray chatbot greetings, unfilled bracket placeholders, broken links, and unrendered Markdown syntax in `.docx`/`.pptx`/`.html`.
3. Treat editorial `Suggestion`s (`strong` / `moderate` / `hint`) with restraint: delete zero-information macro preambles and moralizing closers, and unwrap unprompted `"Not X, but Y"` shells using only existing facts.
4. Preserve every number, unit, percentage, URL, inline code span, and proper noun intact. Never replace filler with second-order AI slogans (`"Not just X — it's Y"`).

## 4. Check & Verify

Run a check when a callable MCP tool or shell exists in your session:
1. If `dislop_*` MCP tools are active: call `dislop_check` first, revise in project context, and verify with `dislop_verify`.
2. If you have a shell tool: run `npx --yes dislop check <path> --format agent` (or `dislop fix --auto <path>` for verified `safe` cleanups), and finish with `npx --yes dislop verify --git HEAD <path>` (or `dislop verify <before> <after>`).
3. Otherwise, review your draft against Sections 2–3 and the loaded reference card.

Always return the finished document or copy itself—never reply with only a tool name, shell command, or file path.
