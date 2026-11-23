---
name: dislop
version: 0.8.0
description: "Use when drafting or revising text a person will read: README, docs, PR descriptions, release notes, RFCs, postmortems, CLI help/errors, emails, essays, web pages and UI copy (HTML/CSS/JSX), or Word and PowerPoint files. Removes AI-sounding phrasing, chatbot leftovers, placeholders, and template layouts without changing facts. Skip code logic, tests, refactors, commit messages, and configs with no reader-facing text."
---

# dislop

Pick the single card below matching the **language of the text you are writing or editing**, not the request language (English -> `.md` such as `office.md`, Chinese -> `.zh-CN.md`). Read it before drafting or revising. If `./references/` files are unavailable in your host, fetch the same file from `https://dislop.com/tools/references/<file>` (or follow Sections 2–3 directly if offline).

## 1. Reference Cards

| Deliverable | English | Chinese |
|---|---|---|
| Docs, README, PR, RFC, postmortem, release notes, CLI help & error copy, email, notices | `./references/work-docs.md` | `./references/work-docs.zh-CN.md` |
| Essays, columns, narrative non-fiction | `./references/essay.md` | `./references/essay.zh-CN.md` |
| Word (`.docx`) & PowerPoint (`.pptx`) files | `./references/office.md` | `./references/office.zh-CN.md` |
| Web pages, HTML/CSS/JSX & browser UI copy | `./references/web-ui.md` | `./references/web-ui.zh-CN.md` |

Match cleanup strategy to the writing scenario (`--register`):

| Scenario (`--pack` / `--register`) | Cut | Protect (never alter) | Avoid drift into |
|---|---|---|---|
| `engineering-spec` / `technical` | Marketing adjectives, diff parroting, ownerless action items | Uniform lists, passive voice, code identifiers, thresholds | Rewriting technical clauses into casual chatter |
| `regulated-comms` / `official` | Superlatives, unanchored multipliers, AI greetings | Formal phrasing, numbered clauses, scope qualifiers | Casual slang or unverified compliance claims |
| `business-brief` / `argumentative` | Macro openers, buzzword clusters, 3-part balanced pitches | Upfront takeaways, concrete metrics, named sources | Trading slogans for aphorisms or macro sign-offs |
| `literary-essay` / `narrative` | Moralizing endings, stock metaphors, mechanical Q&A | Sensory detail, dialogue, deliberate rhythm contrast | Flattening prose into bullets or inventing scenes |
| C2C / IM / `casual` | Scripted influencer clichés, chatbot wrappers, corporate jargon | First-person spoken wording, fixed shop/shipping policy lines | Stiff bookish prose or synonym cycling on policy lines |
| `deck-and-ui` / `deck-ui` | Topic-label slide titles, dead `#` links, gradient/pill soup | Action-takeaway headlines, tight UI slot lengths | Expanding microcopy past slot bounds or decorative AI badges |

## 2. Drafting New Text

1. Open on a concrete fact, file, metric, or action from the notes; let sentence length follow the thought naturally.
2. Every clause must trace to the notes or workspace files. Never add unstated causes, downstream effects, wider scope, altered evidence timing (`measured` -> `tested in production`), unstated completion, resolved relative dates (`by Monday` -> `by next Monday`), or stronger modality (`projected` / `target` -> `cuts`).
3. Keep source labels (`measured`, `projected`, `about`, `by Monday`) and requested length bounds using only the supplied notes. Omit missing metadata fields (`Date`, `Author`) without `[bracketed placeholders]`; list open questions separately if handing back a draft.

## 3. Revising Existing Drafts

1. Leave clean, direct sentences, grounded industry/domain terms, and the author's natural phrasing untouched.
2. Check all 5 AI-tic layers (`patterns/ai-tic-rubric.json`): lexical fluff (without hurting grounded technical terms), syntactic shells (pivots, role metaphors, dangling `-ing` commentary tails), rhythm uniformity, cognitive framing (false-neutral "both sides" hedging, forced macro elevation, defensive caveats, fake specificity), and rhetorical stance (lecturing, spoon-feeding recaps, cheesy fake-human slang).
3. Fix `error` findings first; follow each finding's `fixStrategy` (`delete`, `need-source`, `unwrap-layout`, or `rephrase`). Treat `warning` and `info` as prompts, keeping personal perspective, short-long rhythm contrast, quoted speech, and explicit user choices intact.
4. Keep numbers, units, bounds (`up to`, `at least`, `no less than`), direction (`from A to B`), modality (`projected`, `estimated`, `only if`), relative dates (`yesterday`), names, quotes, inline code, URLs, and every distinct fact intact—remove filler without collapsing multi-point prose into a one-sentence stub.
5. Never replace filler with `"Not X — it's Y"`, staccato slogan triplets, self-Q&A, moralizing closers, or fake-casual fillers. Keep output in a single language unless quoting an identifier.

## 4. Check & Finish

Run a check only if a callable tool or shell exists in this session:
1. Only if `dislop_*` tools appear in your active tool list: call `dislop_check` first, then `dislop_review` if needed, and verify edits with `dislop_verify` (pass `register` to match scenario strategy; setup: `https://dislop.com/tools/mcp-sdk-api.md`).
2. Only if you have a shell tool: run `dislop check <path> --pack auto --register <scenario> --deep` (or `npx --yes dislop check ...`), run `dislop review` with user config (`~/.config/dislop/config.json` / `voice.json`) when deep review is needed, and finish with `dislop verify --git HEAD <path> --register <scenario>` (or `dislop verify <before> <after> --register <scenario>`) to check facts and anti-degradation guards.
3. Otherwise, review your draft against Sections 2–3 and the loaded card checklist.

Always return the finished document or copy itself—never reply with only a tool name, shell command, or file path.
