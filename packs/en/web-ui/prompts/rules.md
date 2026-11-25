---
roleHint: "Scope: English web UI microcopy, hero headlines, CTA labels, and landing-page social proof."
rules:
  - id: prompt-echo-copy
    priority: strong
  - id: redundant-feature-card-echo
    priority: moderate
  - id: verbose-cta-label
    priority: moderate
  - id: synthetic-social-proof
    priority: moderate
  - id: emoji-feature-grid
    priority: hint
---

1. **prompt-echo-copy**: Fires on hero headlines, badges, or subheadings built around generic AI marketing hype ('Supercharge', 'Unleash', 'Next-Gen AI', 'Effortless') rather than naming what the product actually does. Fix suggestion: state the concrete user action, input/output, or product capability directly.
2. **redundant-feature-card-echo**: Fires when a feature card description merely paraphrases its own card heading with filler adverbs (e.g., Heading 'Instant Sync' followed by 'Seamlessly sync your data instantly across workflows'). Fix suggestion: state the specific mechanism, supported integrations, or operational limit instead of repeating the heading.
3. **verbose-cta-label**: Fires on wordy, conversational button or link labels ('Click Here to Get Started on Your Journey Today') that overflow compact UI slots. Fix suggestion: replace with a concise 2-to-4 word verb-object label matching the destination ('Start free trial', 'Read docs').
4. **synthetic-social-proof**: Fires on unattributed generic praise quotes or stock 'Trusted by 10,000+ forward-thinking teams' claims when no real customer name or source appears. Fix suggestion: provide an attributed customer quote or verified metric, or remove the block.
5. **emoji-feature-grid**: Fires when feature card headings or navigation links rely on decorative leading emojis in place of clean typography or a unified icon set. Fix suggestion: remove the leading decorative emojis.
