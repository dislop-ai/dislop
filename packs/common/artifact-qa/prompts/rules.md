---
roleHint: "Scope: language-neutral pre-publication delivery residue."
rules:
  - id: unchosen-draft-options
    priority: strong
  - id: meta-editing-note
    priority: strong
---

1. **unchosen-draft-options**: Fires when inline text retains multiple mutually exclusive draft phrasings generated during brainstorming (e.g., 'Option A: ... / Option B: ...') where the author forgot to pick one. Do not flag genuine product comparison tables or documented user options. Fix suggestion: keep the single intended option and remove the remaining draft alternatives.
2. **meta-editing-note**: Fires on stray editorial commentary explaining how a passage was revised in response to a prompt (e.g., 'Note: I shortened paragraph two for clarity') that does not belong in the published document. Do not flag legitimate document footnotes or reader-facing caveats. Fix suggestion: remove the stray editorial meta-note.
