---
content-type: reference-data
version: 0.9.0
---

# Voice, Copy, and Visual Guide

[简体中文](./brand-and-voice-guide.zh-CN.md) · [Product Brief](../PRODUCT.md)

One rule covers every public word in `dislop`—the website, READMEs, CLI help, and release notes: **write like the person who built the tool talking to a colleague. Plain, relaxed, direct.** Public slogans (`Cutting AI slop is real productivity.` / `去 AI 味才是真正的生产力！`), positioning, target users, selling points, and one-sentence pitch follow [PRODUCT.md](../PRODUCT.md).

Do not sound corporate, do not try to impress or please the reader, and do not dress the tool up in a literary persona.

---

## 1. A Real Before/After: Why 0 Findings Can Still Sound Like AI

An earlier draft of our own homepage hero passed `dislop check --fail-on info` with 0 findings, yet still read like an LLM wrote it:

```text
Before (0 findings, still reads like AI):
Your draft, minus the slop.
Paste a draft, a deck, or a page. dislop strikes what can't ship, asks about what sounds canned, and checks that your edit kept numbers, links, and citations. It never rewrites a word; the pen stays in your hand.
```

No single banned word caused that. Four structural LLM habits did. First, packing all three product features into one balanced parallel clause (`strikes X, asks about Y, and checks Z`) reads like an ad script. Second, ending on a pull-quote closer (`It never rewrites a word; the pen stays in your hand.`) sounds written to be screenshotted on a quote card. Third, editorial roleplay labels like `Pass for press`, `Sent back`, and `asks in the margin` put the tool in a vintage copy-editor costume instead of speaking normally. Fourth, comma-split banner headlines (`Your draft, minus the slop.`) read like a landing-page slogan rather than a working tool.

Strip the performance away and say what the tool actually does:

```text
After (plain, direct):
Catch the AI slop before you send it
AI-written docs, slides, and web pages often leave behind chat replies, stock phrasing, crowded slides, or purple-pink template chrome. dislop marks what looks off locally so you or your agent can fix it, with optional Cloud MCP rewrites in the workbench.
```

No metaphors, no quotable mic-drop at the end, and no three-way parallel bundle. A reader knows what it does in three seconds.

---

## 2. How We Write: Plain Technical Prose + Relaxed Maker Voice

We aim for the plain clarity of **ASD-STE100** (Simplified Technical English) in most sentences while keeping a casual, unpretentious tone. Combined with structural cuts from `stop-slop`, we follow six rules:

1. **One thought per sentence, with uneven lengths.** If a sentence binds two or three claims with semicolons or symmetrical clauses, split it.
2. **Use the same plain word for the same thing.** Do not rotate synonyms to sound lively. Stick to plain labels across the whole product: `hard bug`, `warning`, `passed`, `rejected`, `Awesome list`.
3. **Cut every pull-quote closer and roleplay metaphor.** If a line sounds like a poster slogan or a costumed persona (`Pass for press`, `the pen stays in your hand`, `the sheet is set by machine`), delete it or rewrite it flat.
4. **Start with something concrete.** Open with an actual draft, file, number, or command instead of throat-clearing background.
5. **State limits plainly.** Unreadable archives and unshipped work (like code AST linting) are marked as skipped or not built yet.
6. **Keep English and Chinese independent on one domain, never mixed.** `dislop.com` stays on a single domain: `/` serves native English (`x-default`), `/zh/` serves native Chinese, and legacy `/en/*` paths return a `301` redirect, with automatic first-visit browser language routing and a one-click manual toggle. Chinese and English materials are authored separately for their own audiences—separate copy, examples, banners, and single-language social accounts or posts (`@dislop_ai` publishes exclusively in English), never word-for-word translations and never mixed inside one page or post. Keep internal architecture tier codes, academic jargon, research shorthand, and internal principle labels such as `Agent-first` inside `docs/research/` and internal specs (`PRODUCT.md`, `AGENTS.md`), never in public copy.

### Copy Table

| Surface | Avoid (AI-flavored / performative) | Use (plain English) |
|---|---|---|
| **Headline / Slogan** | `Your draft, minus the slop.` | `Cutting AI slop is real productivity.` |
| **Positioning tag** | `Agent-first anti-slop platform` | `Built to run inside your agent, CLI, and CI, with a browser workbench ready whenever you need it.` |
| **Intro copy** | `dislop strikes what can't ship... the pen stays in your hand.` | `dislop marks what looks off locally so you or your agent can fix it, with optional Cloud MCP rewrites.` |
| **Clean check** | `Pass for press. 0 findings; protected spans stayed as written.` | `0 issues. Chat wrapper and stock phrasing removed.` |
| **Swapped slop** | `Sent back: displacement detected` | `Still flagged (1 issue). Old buzzwords are gone, replaced by a 'Not X, but Y' slogan.` |
| **Directory name** | `Fellow travelers directory` | `Awesome list` / `Awesome Anti-Slop` |
| **Privacy note** | `Physically locked from outbound requests` | `Runs only in this browser tab. Nothing gets uploaded.` |

### Honesty Boundaries

- **Stay focused on AI slop**: `dislop` does not pretend to be a general security scanner, PDF preflight tool, or WCAG accessibility auditor.
- **Never report unread input as clean**: blank drafts, corrupted Office archives, and hidden slides always get their own explicit status.

---

## 3. Visuals & UI: Keep the Playfulness in the Mark, Keep the Page Clean

Plain copy does not mean a dull interface. The lightness lives in the graphic mark itself, drawn from [assets/logo.svg](https://dislop.com/assets/logo.svg): a rounded carbon tile (`#14171A`), a light manuscript line underneath, and a single vermilion round-capped loop (`#F04438`) taking out the extra bit while leaving the rest alone. The struck AI greeting at the top of the homepage shows that action directly so the copy does not have to narrate a "red pen" metaphor.

Full contrast numbers live in [design-system.md](./design-system.md). Keep `1px` rules, cool neutral paper (`#F6F7F5` / `#FFFFFF`), monotonic dark surfaces (`#0E1012 → #15181C → #1D2127`), no external font CDNs, and `CSP: connect-src 'self'` (zero third-party requests; offline checking stays zero-upload by default). Skip both purple-pink neon gradients and warm-cream terracotta templates.

Use `--pen` (`#F04438`) on the logo loop and thick drawn strokes in both light and dark modes, `#B42318` (`6.6:1`) for small light-mode red text, and `#FF7A6B` (`7.0:1`) in dark mode, with a `1px` border around the logo tile in dark mode so it does not blend into the header. Keep `0px` radii on joined grid cells, `6px` on buttons (`5px` compact), `4px` on inputs, and no `999px` pill walls. Keep monospace for code, line numbers, rule IDs, and counts, use system sans for prose and controls, and keep `letter-spacing: 0` on Chinese headings.

Two mark styles stay readable without color:

- Red solid underline (`2px solid`, `#FEF3F2` wash): AI delivery artifact (`hard bug` in UI prose, `error` in CLI/JSON badges)
- Blue dashed underline (`1.5px dashed`, `#EFF4FF` wash): cliché or template warning (`warning` / `info`)

---

## 4. Automated Posts and Cards

When `dislop` publishes automated social cards, benchmark summaries, or release notes, free-form persuasive copy is the fastest way to sound like AI again. Rhetorical hooks, transition glue (`Moreover`, `Notably`, `In other words`), hype adjectives, and summary closers pull automated posts right back into LLM cadence.

Keep automated cards and captions plain:

1. **Show the verbatim text with its marks**: Frame a crisp `0px`-radius white sheet (`#FFFFFF`) on the dark charcoal stage (`#14171A`). Render the real input prose, HTML snippet, or slide XML with live `dislop check` marks (`#F04438` *dele* loop on deletable chat wrappers, solid red underline on other `core` hard bugs, dashed blue underline on style warnings) measured directly to the text span.
2. **Keep the dele mark (`₰`) as the only visual signature**: `dislop` never speaks in first person (`"I"`), never uses a mascot, and never scolds the reader. Any dry humor comes from letting verbatim AI leftovers—including `dislop`'s own retired drafts—sit under the *dele* mark without commentary.
3. **State what went in, what came out, and the command—then stop**: Name the concrete input file, commit, or setup (`30` drafts across `4` upstream `SKILL.md` prompts on `gemini-3.5-flash`). Give the verbatim surviving defect or count (`4/4` standalone runs left dead `href="#"` in HTML). Give the plain reason or reproducible command (`npx --yes dislop check . --pack auto`), and end there without a closing moral.
4. **Hard bans on outward copy**: No rhetorical-question openers (`?` in line 1), no exclamation hype (outside the official Chinese slogan), no transition glue, an explicit `EXAMPLE` badge on every constructed snippet (live benchmark cards cite commit + task ID instead), and an upfront self-scoring note whenever citing pass rates scored with `dislop`'s own rules.

---

## 5. Seven Checks Before Shipping Copy

Before merging changes to the website, README, CLI help, or release notes:

1. Read it aloud: does it sound like a person talking to a teammate, or like AI marketing copy?
2. Did you cram three features into one balanced semicolon or parallel sentence? Split it.
3. Is there a quotable pull-quote sentence at the end of a paragraph? Cut it.
4. Is the tool wearing a roleplay costume (`Pass for press`, `the pen stays in your hand`)? Say it plainly.
5. Does the same concept (`hard bug` / `warning` / `passed`) use the same plain name everywhere on the page?
6. Are English and Chinese strictly separated (no Chinese in EN examples, no English in ZH examples)?
7. Does `dislop check <file> --fail-on info` pass with 0 findings, and keep body prose free of `!`, emojis, and `finding(s)` (the official Chinese slogan `去 AI 味才是真正的生产力！` keeps its original `！`)?

The machine-readable voice config lives at [docs/brand/voice.json](https://github.com/dislop-ai/dislop/blob/main/docs/brand/voice.json) (`dislop.voice/1`, `v1.0.0`).
