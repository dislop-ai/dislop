# Essays, Columns & Narrative Non-Fiction

Scope: Long-form essays, newsletters, columns, op-eds, and reported sketches.
CLI pack: `dislop check <essay.md> --pack literary-essay --profile` (optional voice check: `dislop voice <past1.md> <past2.md>`).

## Rules & Fixes

1. **Let sentence lengths vary naturally (`low-burstiness-vapor`)**: Avoid 5+ uniform medium sentences filled with abstract nouns. Anchor clauses in supplied times, places, and physical actions without chopping prose into artificial short fragments.
2. **Cut staged self-Q&A & semicolon tricolons (`literary-rhetorical-qa`, `literary-semicolon-tricolon`)**: Remove `"Why does this matter? Because..."`, `"The result?"`, and 3-part balanced semicolon chains.
3. **Break 5-comma run-on chains (`comma-chain-runon`)**: Split sprawling comma-spliced sentences into 2–3 clear sentences.
4. **End on the last concrete scene (`en-essay-moralizing-ending`, `literary-narrative-frame`)**: Cut closing paragraphs that zoom out into life lessons (`"Ultimately, this reminds us..."`). Stop on the final observed action or quote.
5. **Restrain em-dashes & binary pivots (`excessive-em-dash-density`, `literary-negation-pivot`)**: Replace stacked em-dashes with commas or periods, and replace `"Not just X — it's Y"` pivots with plain action.
6. **Zero invented scene detail**: Use only objects, weather, bystanders, and quotes in the notes; develop those supplied details clearly to fit the target length without adding outside scenery.

## Contrast

- **Original**: ``The lighthouse lens — salt-crusted — turned past midnight — before the squall. Ultimately, this reminds us that patience outlasts storms.``
- **Overcorrected**: ``The lens turned past midnight. It wasn't just brass — it was a quiet promise of endurance.``
- **Clean**: ``The salt-crusted lighthouse lens turned past midnight before the squall.``

## Keep These Intact

- The author's existing prose, cadence, and deliberate short sentences when no AI framing is present.
- Direct quotes, timestamps, place names, and observed actions from the source notes.
