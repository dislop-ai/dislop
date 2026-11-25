---
roleHint: "Scope: English executive and technical presentation slides (slides detected: {{slideCount}})."
rules:
  - id: vague-slide-headline
    priority: strong
  - id: slide-prose-dump
    priority: strong
  - id: bullet-stem-padding
    priority: moderate
  - id: unanchored-slide-multiplier
    priority: moderate
---

1. **vague-slide-headline**: Fires when a content slide's bullets state a clear metric outcome or decision while its slide title is a generic topic bucket or slogan ('Overview', 'Charting Our Future', 'Performance Deep Dive'). Do not flag cover slides or section dividers. Fix suggestion: summarize the slide's primary factual takeaway in the headline.
2. **slide-prose-dump**: Fires on multi-sentence narrative report paragraphs pasted verbatim onto slide canvases where conversational filler obscures scannability. Fix suggestion: condense filler clauses into concise takeaway lines while keeping all numbers, units, entities, and qualifiers intact.
3. **bullet-stem-padding**: Fires when multiple bullets on a slide open with repetitive gerund filler stems ('Leveraging X to...', 'Empowering teams to...', 'Fostering a culture of...'). Fix suggestion: start bullets directly with the concrete action or metric.
4. **unanchored-slide-multiplier**: Fires on bare multipliers or comparative claims on slides ('5x faster', 'dramatic cost reduction') lacking a baseline or timeframe on the slide. Fix suggestion: add the comparison baseline and measurement window.
