---
content-type: reference-data
lang: en
updated: 2026-11-23
version: 0.9.0
---

# How to Remove AI Slop From Writing Without Triggering Second-Order Clichés

> Banning stock words alone forces LLMs to swap buzzwords for second-order templates like 'Not X, but Y' slogans, three-word staccato chains, and moralizing endings. Replace clichés by running the Deletion Test on flagged spans and re-checking after edits.

Ask an LLM to rewrite a draft without stock words like `delve` or `leverage`, and it usually drops those tokens right away—then hands back a dramatic slogan instead:

```text
bad:  This isn't just an export script. It's clarity at scale. Fast. Reliable. Unstoppable.
```

Empirical studies explain why. Padmakumar & He (ICLR 2024, [arXiv:2309.05196](https://arxiv.org/abs/2309.05196)) and Doshi & Hauser (*Science Advances*, 2024) showed that RLHF-tuned models compress writing toward high-probability, familiar framing. Blocking surface nouns without changing sentence structure simply displaces the slop one level deeper.

## 1. Where second-order slop hides

Community skills such as `blader/humanizer` (71,724 stars) and `hardikpandya/stop-slop` (19,097 stars), along with `WP:AISIGNS`, converge on four displacement patterns that appear right after deleting cliché words:

| Pattern | Example that slips past word lists | What to do instead |
|---|---|---|
| **Negation pivot** | `"This isn't just a linter — it's delivery confidence."` | Delete the negation setup; state what the tool checks |
| **Staccato slogan run** | `"Signals drop. Photos vanish. Audits stall."` | Merge into one plain sentence explaining cause and limit |
| **3-part semicolon pitch** | `"Validates on input; queues slow jobs; tracks timeouts."` | Break symmetry into plain clauses with uneven lengths |
| **Moralizing ending** | `"Ultimately, tools matter less than the discipline behind them."` | Stop on the final concrete measurement or action |

## 2. The four-step Deletion Test

Grounded in plain-writing standards—`ASD-STE100`, `Digital.gov Plain Language`, `GOV.UK Style Guide`, and `Google Technical Writing`—use this edit loop instead of synonym swapping:

1. **Strip hard leftovers first**: Remove chat greetings, unfilled `[TODO]` brackets, and unverified claims such as `"studies show"` without a source.
2. **Run the Deletion Test on flagged spans**: Ask what concrete actor, mechanism, number, or boundary disappears if the flagged phrase is deleted.
   - If nothing disappears, delete the span completely.
   - If a real claim disappears, replace the abstract adjective with the measured fact.
3. **Vary paragraph openings and sentence length**: If three paragraphs in a row open with the same gerund skeleton (`"By standardizing..."`, `"By automating..."`, `"By surfacing..."`), collapse them into direct active statements.
4. **Re-check after editing**: Run `dislop check` again to make sure your cleanup didn't introduce a negation pivot or staccato slogan.

Here is a real edit cycle on a field-sync note:

```text
bad:  Signals drop. Photos vanish. Audits stall. It is worth noting that offline sync is a game-changer that unlocks seamless resilience for 120 inspection photos.
trap: Offline sync isn't a fallback — it's field resilience for 120 photos.
good: When cellular coverage drops in basement vaults, offline sync queues up to 120 inspection photos locally until reconnection.
```

![dislop browser workbench checking draft, 2nd-order slop trap, and clean version with 5-axis telemetry](demo:workbench-live)

## 3. Better structures before you draft

If you draft with an agent, pick an explicit structural skeleton upfront instead of letting the model default to *"Background -> Benefits -> Conclusion."* Inspired by Verbalized Sampling ([arXiv:2510.01171](https://arxiv.org/abs/2510.01171)), four compact shapes cover most engineering and business writing:

| Skeleton | Sequence |
|---|---|
| Decision Ledger | 1-sentence decision → sample size & metrics → known limitation → owner & date |
| Mechanism Teardown | observed anomaly → wrong initial guess → underlying cause → bounded fix |
| Technical Spec | capability table → explicit non-goals → failure modes & exit codes → minimal command |
| Field Note | time, place, and physical detail → direct quote or observation → stop on the last concrete detail |

Run deterministic prose and cadence checks locally before publishing:

```bash
npx --yes dislop check draft.md --pack business-brief
```

## FAQ

### Why does telling an LLM 'avoid AI clichés' still produce synthetic prose?

Post-trained models compensate for banned adjectives by switching to dramatic contrast frames (`Not just X — it's Y`), short staccato three-word bursts, or neat 3-part semicolon sentences.

### Does dislop flag legitimate factual contrasts like 'The bug is not in parser.py, but in loader.py'?

No. Specific file, number, and mechanism corrections are preserved. The rule targets strawman negation pivots that contrast an empty label with an abstract noun ('Not just a tool — peace of mind').

### Do flat banned-word lists cause false positives on technical terms?

Yes. Naive word lists routinely flag real nouns such as Delve (the Go debugger), wool tapestry, or legitimate domain terms. Context-aware rules keep literal nouns intact.

## References

- [Does Writing with Language Models Reduce Content Diversity? (ICLR 2024)](https://arxiv.org/abs/2309.05196): Feedback-tuned models (RLHF) reduce collective lexical and content diversity compared with unaided human writing.
- [Generative artificial intelligence enhances creativity but reduces the diversity of novel content (Science Advances 2024)](https://doi.org/10.1126/sciadv.adn5290): Controlled short-story experiments showed AI ideas improved individual ratings while making stories across writers significantly more similar to one another.
- [Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity](https://arxiv.org/abs/2510.01171): Prompting models to verbalize a distribution of candidate outputs mitigates RLHF typicality bias without retraining.
- [Wikipedia: Signs of AI writing (WP:AISIGNS)](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing): WikiProject AI Cleanup's living taxonomy of AI prose defects: inflated significance, stock vocabulary, rule-of-three lists, negative parallelisms, chatbot wrappers, and formatting artifacts.
- [ASD-STE100 Simplified Technical English Specification](https://www.asd-ste100.org/): Aerospace and technical documentation specification enforcing short active sentences, one instruction per sentence, and consistent naming for the same concept.
- [Digital.gov Plain Language Guide (formerly PlainLanguage.gov)](https://digital.gov/guides/plain-language/): Federal plain-writing rules: front-load key conclusions, use active voice, replace hidden verbs and filler openings with concrete actors and actions.
- [GOV.UK Content and Style Guide](https://www.gov.uk/guidance/style-guide): Bans empty corporate padding and buzzwords ('deliver', 'key', 'going forward') in favor of direct user-facing verbs and verifiable dates/numbers.
- [Google Technical Writing Courses](https://developers.google.com/tech-writing): Engineering writing guidance prioritizing short sentences, clear actors, explicit scope boundaries, and lists/tables over wall-of-text paragraphs.
- [blader/humanizer (Agent Skill based on WP:AISIGNS)](https://github.com/blader/humanizer): 71,724 stars (2026-11-21 snapshot); translates Wikipedia's Signs of AI Writing into an agent editing skill with voice sample calibration.
- [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop): 19,097 stars (2026-11-21 snapshot); separates banned phrases, structural patterns, and before/after examples with a five-axis rubric.
