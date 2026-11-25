---
roleHint: "Scope: cross-slide narrative cadence and scannability. {{deckSummary}}"
rules:
  - id: repetitive-slide-skeleton
    priority: moderate
  - id: cross-slide-recap-padding
    priority: hint
---

1. **repetitive-slide-skeleton**: Fires when 3 or more consecutive slides repeat an identical mechanical bullet skeleton (such as three symmetrical 'Noun: abstract clause' bullets per slide) regardless of content type. Fix suggestion: vary layout to match the content (direct takeaway line, metric comparison, or concise fact bullets).
2. **cross-slide-recap-padding**: Fires on transitional sentences on a slide that only restate the previous slide's topic without introducing new facts or decisions. Fix suggestion: remove the recap sentence so the slide opens directly on its own point.
