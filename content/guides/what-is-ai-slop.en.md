---
slug: "what-is-ai-slop"
lang: "en"
title: "What Is AI Slop? A 2026 Field Guide Across Prose, Web UI, and Slide Decks"
navTitle: "What Is AI Slop?"
description: "A breakdown of the four layers of AI slop across prose, websites, and slides—backed by empirical benchmarks, Wikipedia's cleanup catalog, and real repository examples."
summary: "AI slop is unreviewed, low-signal machine output driven by statistical averaging. Beyond banned words like 'delve' and 'tapestry', it shows up as 'Not X, but Y' contrast slogans, purple-pink SaaS web templates, dense PowerPoint word walls, and stray chatbot greetings."
category: "Fundamentals"
published: "2026-11-23"
updated: "2026-11-23"
readingMinutes: 6
keywords: ["what is ai slop", "signs of ai writing", "ai slop examples", "ai ui slop", "pr slop"]
relatedRules: ["chatbot-artifact", "en-cliche-lexicon", "negation-pivot-frame", "ui-ai-gradient", "slide-word-wall"]
relatedGuides: ["remove-ai-slop-writing", "fix-ai-slop-web-ui", "deslop-pptx-docx"]
sources: ["simon-willison-slop", "wp-signs-of-ai-writing", "kobak-excess-vocabulary-2025", "jiang-artificial-hivemind-2025", "eqbench-slop-score", "curl-bug-bounty-end", "coderabbit-ai-pr-report"]
faqs:
  - q: "Why does writing still sound like AI after I delete words like 'delve' and 'leverage'?"
    a: "When models lose cliché nouns and verbs, post-trained RLHF habits shift to structural templates—especially 'Not just X — it's Y' contrast slogans, three-word staccato chains, and moralizing final sentences."
  - q: "What are the fastest AI delivery leftovers to catch before shipping?"
    a: "Check for leftover chat replies, unfilled bracketed placeholders (`TODO` markers), raw Markdown asterisks pasted into Word or PowerPoint, and dead `href=\"#\"` placeholder buttons in web pages."
  - q: "Is there hard evidence on how widespread AI slop has become?"
    a: "Yes. Kobak et al. ([arXiv:2406.07016](https://arxiv.org/abs/2406.07016), Science Advances 2025, n=15M PubMed abstracts) measured excess-vocabulary shifts showing at least 13.5% of 2024 biomedical abstracts reflected LLM processing. In software, CodeRabbit (2025) found AI-generated pull requests averaged 10.83 issues vs. 6.45 in human PRs."
---

Open an unedited draft from an LLM and you rarely see broken grammar. Instead, you see the same smooth filler, the same contrast slogans, and the same purple-gradient hero cards across completely unrelated projects. Developers and editors call this **AI slop**.

Simon Willison popularized the term in May 2024 as an analogy to email spam: unsolicited, unreviewed AI-generated material pushed downstream onto readers and maintainers. By 2026, documented cases span peer-reviewed journals, open-source security trackers, product UIs, and internal slide decks.

## 1. Measured impact across writing and code

AI slop is not caused by one sloppy prompt. Post-training rewards safe, average phrasing that repeats across runs and vendors:

1. **Academic literature drift**: Analyzing 15 million PubMed abstracts, Kobak et al. (*Science Advances*, [arXiv:2406.07016](https://arxiv.org/abs/2406.07016), 2025) estimated at least 13.5% of 2024 biomedical abstracts reflected LLM processing through excess vocabulary such as *delve*, *intricate*, and *pivotal*.
2. **Cross-model homogenization**: In *Artificial Hivemind* (NeurIPS 2025, [arXiv:2510.22954](https://arxiv.org/abs/2510.22954)), researchers tested models on the Infinity-Chat dataset and documented both intra-model repetition and strong inter-model convergence—meaning switching providers does not automatically restore distinct voice.
3. **Maintainer fatigue in open source**: On January 26, 2026, curl maintainer Daniel Stenberg shut down curl's bug bounty program after AI-generated junk reports pulled valid report rates from above 15% down below 5%. Separately, CodeRabbit's 2025 benchmark reported AI-authored PRs averaging 10.83 issues compared with 6.45 for human PRs (~1.7x higher).

## 2. The four layers of AI slop

Most real-world artifacts break down into four distinct layers tracked by Wikipedia's *Signs of AI writing* (`WP:AISIGNS`) and EQ-Bench Slop Score:

| Layer | What it looks like | Why teams catch it first |
|---|---|---|
| **Hard delivery artifacts** | `"Certainly! Here is..."`, `[INSERT METRIC]`, `**bold**` asterisks in `.docx`/`.pptx`, `<a href="#">` buttons | Proves nobody reviewed the output before sending |
| **Stock lexicon & padding** | `"It is worth noting that"`, `"game-changer"`, `"leverage"`, `"seamless"`, `"robust"` | Replaces concrete actors and mechanisms with PR fluff |
| **Second-order cadence** | `"It's not X — it's Y"`, `"Signals drop. Photos vanish. Trust dies."`, 3-part semicolon pitches | Happens right after banning stock words without changing structure |
| **Template UI & deck sprawl** | Indigo-to-pink gradients, 8+ pill badges per card, 140-word PowerPoint walls, `"Overview"` slide titles | Makes distinct products and quarterly updates look identical |

Look at how a release note fails at layer 1, shifts into layer 3 when edited carelessly, and finally lands clean:

```text
bad:  Certainly! Here is the launch note. It's worth noting that CSV exports are a game-changer, finishing in up to 12 minutes for workspaces above 500,000 rows.
trap: CSV exports finish in up to 12 minutes for workspaces above 500,000 rows. This isn't just an upgrade — it's a new standard.
good: CSV exports finish in up to 12 minutes for workspaces above 500,000 rows.
```

Notice that `trap` removed every obvious buzzword, yet the added contrast slogan (`This isn't just...`) still reads like generated marketing copy.

![dislop three-state check: flagging chatbot greeting and filler, catching a 2nd-order slogan, and passing with exit code 0](demo:proof-cycle)

## 3. A practical order for cleaning drafts

1. **Block core artifacts first**: Strip stray chat wrappers, placeholders, unrendered Markdown in Office files, and dead UI links. In `dislop`, `packs/core` treats these as hard `error` failures.
2. **Apply the Deletion Test**: For every flagged phrase or contrast frame, ask what specific number, mechanism, or boundary remains if you delete it. If nothing is lost, cut the span.
3. **Verify layout and visual craft**: Check slide density (`<= 120` words per slide), heading clarity, and CSS/HTML restraint before shipping.

Run `npx --yes dislop check .` locally with zero network calls to see which layers appear in your current repo or docs.
