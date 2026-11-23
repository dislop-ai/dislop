---
slug: "deslop-pptx-docx"
lang: "en"
title: "Cleaning Up AI-Generated PowerPoint Decks and Word Docs (PPTX / DOCX / PDF)"
navTitle: "Clean Up PPTX & DOCX"
description: "How to catch raw Markdown asterisks, 140-word slide walls, shrunk autofit text, and process-only headlines in Word, PowerPoint, and PDF decks."
summary: "AI-generated Office deliverables break in five predictable ways: pasted `**bold**` Markdown asterisks, 120+ word slide walls, >6 bullets per slide, shrunk `normAutofit` fonts below 80%, and vague titles like 'Overview' or 'Analysis of Q3 Retention'. Inspect the OOXML and PDF text layers deterministically before sending."
category: "Docs & Decks"
published: "2026-11-23"
updated: "2026-11-23"
readingMinutes: 6
keywords: ["clean up ai powerpoint", "remove markdown from word", "pptx linter", "slide word wall", "executive deck headlines"]
relatedRules: ["markdown-leak", "slide-word-wall", "slide-bullet-overload", "slide-autofit-shrink", "slide-weak-topic-title", "slide-process-not-finding-title", "pptx-layout-monotony", "pdf-visual-layout-slop"]
relatedGuides: ["what-is-ai-slop", "remove-ai-slop-writing", "agent-cli-mcp-tutorial"]
sources: ["wp-signs-of-ai-writing", "asd-ste100", "digitalgov-plain-language", "stiftung-buchkunst"]
faqs:
  - q: "Does inspecting a .docx or .pptx in the browser workbench upload the file?"
    a: "No. Local checks unzip OOXML entries inside your current browser tab with zero network requests. Files are only sent to the cloud service when you sign in and click a Cloud Review or Cloud Rewrite button."
  - q: "Why flag slides just for having 4 identical bullet layouts in a row?"
    a: "LLM slide generators repeat the same 'Title + 4 bullets' template across consecutive slides instead of switching to comparison tables, timelines, or charts—causing immediate reader fatigue."
  - q: "Can dislop check landscape PDF decks exported from Keynote or Google Slides?"
    a: "Yes. It checks whether pages were flattened into unselectable raster images, whether body typography drops below 9.5pt, and whether 4+ consecutive landscape slides share a flat text-only scale."
---

An LLM can draft a 15-slide deck or a 10-page Word memo in thirty seconds, yet sending it raw almost always leaves telltale damage: unrendered `**bold**` asterisks copied from chat, a slide jammed with 160 words shrunk down by PowerPoint autofit, and five consecutive slides titled *"Overview"* or *"Analysis of Q3 Retention."*

Inspecting the underlying `.docx`, `.pptx`, and `.pdf` structures programmatically catches these defects in one pass.

## 1. Seven structural defects in AI Office files

| Rule ID | What shows up in the deck or doc | Why it hurts readers | Clean fix |
|---|---|---|---|
| `markdown-leak` | Raw `**key metric**` or `## Heading` in Word or PPTX | Hard delivery bug showing raw chat copy-paste | Strip syntax and apply native bold/heading styles |
| `slide-word-wall` | More than 120 Latin words on a single PowerPoint slide | Turns a visual slide into an unreadable wall of text | Split the claim or trim to one takeaway plus data |
| `slide-bullet-overload` | 7 or more bullets packed onto one slide | Hides priority; reads like a raw brainstorm dump | Consolidate to `3–5` sharp points |
| `slide-autofit-shrink` | `normAutofit` font scale pushed below `80%` | Text shrinks until back-row readers cannot scan it | Cut filler words until body text sits cleanly at scale |
| `slide-weak-topic-title` | Slide headlines such as `"Overview"` or `"Background"` | Tells the audience the topic, not the takeaway | Replace with a single-sentence conclusion |
| `slide-process-not-finding-title` | `"Analysis of Q3 Customer Retention"` | Names the activity instead of the finding | Put the metric in the headline (`"Q3 Net Retention Rose from 88% to 94%"`) |
| `pptx-layout-monotony` | 4+ consecutive slides sharing one identical bullet skeleton | Creates visual fatigue across executive reviews | Convert comparisons or trends into tables or charts |

Compare how an executive deck headline moves from a process label to a hype trap to a concrete finding:

```text
bad:  ## Analysis of Q3 Customer Retention (88% to 94%)
trap: ## Unlocking the Next-Gen Retention Flywheel
good: ## Q3 Net Retention Rose from 88% to 94%
```

Notice how `trap` dropped the actual numbers (`88% to 94%`) in favor of an empty metaphor (`Retention Flywheel`).

![dislop auditing quarterly-review.pptx for raw markdown leaks, word walls, 68% autofit shrink, and process titles](demo:deck-office)

## 2. Check Office and PDF files offline

Keep confidential quarterly decks and internal memos on your machine using the zero-upload CLI:

```bash
# Node CLI (zero dependencies)
npx --yes dislop check proposal.docx board-deck.pptx summary.pdf

# Python CLI (with executive-deck headline rules)
uvx dislop check board-deck.pptx --pack executive-deck
```

If an archive is corrupted, password-locked, or exported as an unreadable scan with zero selectable text, `dislop` prints `[SKIP]` or a coverage warning (exiting `2` on single-file runs) instead of pretending the file passed with `0` issues.

## 3. Layout-preserving cloud cleanup (optional)

When you want multi-model prose cleanup that keeps `.docx` Track Changes or `.pptx` master layouts intact:

1. Run local `dislop check` first and fill any missing bracketed numbers manually.
2. Sign in on the workbench or connect Official Cloud MCP (`https://dislop.com/mcp`) for non-confidential drafts.
3. Re-run local `dislop check` on the exported file to verify numbers and clean structure held up.
