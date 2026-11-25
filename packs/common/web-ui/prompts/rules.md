---
roleHint: "Scope: UI component hierarchy and stock layout-copy patterns. {{uiSummary}}"
rules:
  - id: redundant-heading-subcopy
    priority: moderate
  - id: fabricated-stat-tile
    priority: strong
---

1. **redundant-heading-subcopy**: Fires when a card or section subcopy merely restates its immediately preceding heading in rearranged words without adding concrete detail, constraints, or examples. Fix suggestion: remove the redundant subcopy or replace it with a specific capability or boundary.
2. **fabricated-stat-tile**: Fires on suspiciously generic round hero stat tiles (e.g., '10,000+ Happy Users', '99.99% Uptime', '500+ Integrations') surrounded by template traits with no verifiable product context. Do not flag attributed or product-specific operational metrics. Fix suggestion: supply a verified production figure or remove the stock stat tile.
