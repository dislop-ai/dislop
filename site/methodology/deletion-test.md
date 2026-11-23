---
content-type: reference-data
version: 0.8.2
---

# Deletion Test & Anti-Slop Editing Loop

## Why Flat Banned-Word Lists Fail

1. **False positives on real domain nouns**: Flat word lists flag `Delve` (Go debugger), `wool tapestry`, or literal numeric corrections (`重试窗口不是 5 秒，而是 60 秒`).
2. **Second-order displacement**: When models lose stock adjectives, they pivot to structural templates such as binary contrast slogans (`"It's not just X — it's Y"`) or three-word staccato chains (`"Signals drop. Photos vanish. Trust dies."`).
3. **Third-order cadence slop**: Even with `0` linter findings, 3-part semicolon pitches, editorial roleplay, and pull-quote closers still sound synthetic.

## Four-Step Loop

1. **Step 1 — Prevent while drafting (`SKILL.md`)**:
   - Lead with a concrete fact, example, number, or command; avoid 3-part semicolon pitches, pull-quote closers, and default AI UI templates upfront.
2. **Step 2 — Deterministic Check (`dislop check` / `dislop_check`)**:
   - Resolve every `packs/core` `error` first (stray chat wrappers, unfilled placeholders, raw Markdown in Word/PPT, dead `href="#"` links).
   - Review style and template `warning` / `info` findings locally.
3. **Step 3 — Deletion Test**:
   - Apply each rule's check question to the flagged span only.
   - Ask what concrete mechanism, measurement, or boundary remains if the filler phrase is deleted.
   - Keep code blocks, inline code, URLs, and quoted primary sources intact; never invent facts or numbers.
4. **Step 4 — Re-Check**:
   - Run `dislop check` again to confirm no second-order slogan families (`frame/negation-pivot`, `frame/staccato`, `frame/triad`, `frame/ending`, `frame/list-wall`) were introduced during editing.
