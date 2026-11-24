---
content-type: reference-data
lang: en
updated: 2026-11-23
version: 0.9.1
---

# What Is AI Slop? A 2026 Field Guide Across Prose, Web UI, and Slide Decks

> AI slop is unreviewed, low-signal machine output driven by statistical averaging. Beyond banned words like 'delve' and 'tapestry', it shows up as 'Not X, but Y' contrast slogans, purple-pink SaaS web templates, dense PowerPoint word walls, and stray chatbot greetings.

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

## FAQ

### Why does writing still sound like AI after I delete words like 'delve' and 'leverage'?

When models lose cliché nouns and verbs, post-trained RLHF habits shift to structural templates—especially 'Not just X — it's Y' contrast slogans, three-word staccato chains, and moralizing final sentences.

### What are the fastest AI delivery leftovers to catch before shipping?

Check for leftover chat replies, unfilled bracketed placeholders (`TODO` markers), raw Markdown asterisks pasted into Word or PowerPoint, and dead `href="#"` placeholder buttons in web pages.

### Is there hard evidence on how widespread AI slop has become?

Yes. Kobak et al. ([arXiv:2406.07016](https://arxiv.org/abs/2406.07016), Science Advances 2025, n=15M PubMed abstracts) measured excess-vocabulary shifts showing at least 13.5% of 2024 biomedical abstracts reflected LLM processing. In software, CodeRabbit (2025) found AI-generated pull requests averaged 10.83 issues vs. 6.45 in human PRs.

## References

- [Simon Willison: Slop is the new name for unwanted AI-generated content](https://simonwillison.net/2024/May/8/slop/): Published 2024-05-08; popularized 'slop' for unsolicited, unreviewed AI-generated content by analogy to email spam.
- [Wikipedia: Signs of AI writing (WP:AISIGNS)](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing): WikiProject AI Cleanup's living taxonomy of AI prose defects: inflated significance, stock vocabulary, rule-of-three lists, negative parallelisms, chatbot wrappers, and formatting artifacts.
- [Delving into LLM-assisted writing in biomedical publications through excess vocabulary (Science Advances 2025)](https://arxiv.org/abs/2406.07016): Analyzed 15M PubMed abstracts and estimated at least 13.5% of 2024 biomedical abstracts were processed with LLMs (lower bound), marked by excess words like 'delve', 'intricate', and 'pivotal'.
- [Artificial Hivemind: The Open-Ended Homogeneity of Language Models (and Beyond) (NeurIPS 2025)](https://arxiv.org/abs/2510.22954): Using the Infinity-Chat dataset, demonstrated both intra-model repetition and inter-model homogeneity across different LLM families.
- [EQ-Bench Slop Score](https://eqbench.com/slop-score.html): Public composite index (60% slop words + 25% 'not X but Y' contrast frames + 15% overused trigrams) measuring LLM output templating.
- [Daniel Stenberg: The end of the curl bug bounty](https://daniel.haxx.se/blog/2026/01/26/the-end-of-the-curl-bug-bounty/): Published 2026-01-26; ended curl's bug bounty effective 2026-01-31 after low-quality AI-generated reports pushed valid report rates from >15% down below 5%.
- [CodeRabbit: State of AI vs Human Code Generation Report](https://www.coderabbit.ai/reports-guides): Measured AI-generated PRs averaging ~1.7x more issues (10.83 vs 6.45), 75% more logic errors, and >3x readability/formatting issues compared with human PRs.
