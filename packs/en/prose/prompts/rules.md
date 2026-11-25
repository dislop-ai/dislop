---
roleHint: "Scope: restrained English prose anti-slop patterns. Do not fire on ordinary domain claims merely because they use abstract verbs."
rules:
  - id: unprompted-negation
    priority: strong
  - id: hollow-transition
    priority: strong
  - id: throat-clearing
    priority: moderate
  - id: moralizing-closer
    priority: moderate
  - id: rhetorical-self-qa
    priority: hint
---

1. **unprompted-negation**: Fires on 'Not X, but Y' or 'This isn't about X — it's about Y' contrast shells when X was never claimed, expected, or implied in preceding context. Do not flag genuine corrections of a prior misconception established earlier in the text. Fix suggestion: drop the theatrical negation and state Y directly using existing facts.
2. **hollow-transition**: Fires on zero-information macro preambles ('In an era defined by...', 'As technology continues to evolve...') or empty bridge sentences whose removal loses zero factual or causal content. Fix suggestion: remove the filler sentence and start directly on the concrete claim.
3. **throat-clearing**: Fires on meta-announcements ('In this section, we will explore...', 'It is worth noting that...') when the heading or clause already establishes scope. Fix suggestion: strip the meta-announcement prefix and keep the core statement.
4. **moralizing-closer**: Fires on preachy or promotional closing sentences ('Ultimately, this journey underscores...', 'Looking ahead, the future is bright...') that add no concrete conclusion or next step. Fix suggestion: remove the closing slogan or end on the last substantive point.
5. **rhetorical-self-qa**: Fires on mechanical assistant self-Q&A transitions ('Why does this matter? Because...'). Do not flag genuine open research questions in specs or essays. Fix suggestion: merge the artificial question-and-answer pair into a single direct statement.
