# Contributing to `dislop`

Thank you for contributing to `dislop`! Because the micro-kernel (`src/kernel/`) is strictly domain-blind, all linguistic, UI, and slide anti-slop rules belong inside modular **Packs**.

---

## 1. Authoring Custom Packs

`dislop` supports three ways to build Packs:

### A. Separated Pack Directory (`pack.json` + `scripts/` + `prompts/`) *(Recommended for Built-in & Multi-Rule Packs)*

Every built-in Pack under `packs/<scope-or-lang>/<scenario>/` separates metadata, deterministic code, and Markdown prompts so the kernel can lazy-load each stage on demand:

```text
packs/en/my-scenario/
├── pack.json              # Lightweight admission manifest (read with 0 JS imports)
├── scripts/
│   └── index.mjs          # Deterministic checks & post-LLM verifyFix() gate
└── prompts/
    └── rules.md           # Pure Markdown trigger criteria & fix suggestions
```

#### 1. `pack.json`
```json
{
  "name": "en/my-scenario",
  "version": "0.1.0",
  "description": "Concise summary of what this Pack checks.",
  "languages": ["en"],
  "formats": ["md", "mdx", "txt", "docx"]
}
```

#### 2. `scripts/index.mjs` (`definePackScripts`)
Loaded lazily in Step 3 (`check`) and Step 5 (`verifyFix`). Only deterministic `check(doc, ctx)` hooks may call `ctx.reportDefect(...)`:

```js
import { definePackScripts, maskInlineCode } from "dislop/sdk";

export default definePackScripts({
  check(doc, ctx) {
    for (const seg of doc.segments) {
      const masked = maskInlineCode(seg.text);
      if (/\[INTERNAL ONLY\]/i.test(masked)) {
        ctx.reportDefect({
          ruleId: "internal-marker",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          fixSafety: "manual",
          reason: "Internal-only marker left in public release note.",
          rewritePrompt: "Remove the internal marker or move the note to a private doc.",
        });
      }
    }
  },

  verifyFix(_issue, candidateText) {
    if (/\bgame-changer\b/i.test(candidateText)) {
      return {
        ok: false,
        reason: "Replacement introduced marketing hype ('game-changer').",
      };
    }
    return { ok: true };
  },
});
```

#### 3. `prompts/rules.md` (Pure Declarative Trigger + Fix Suggestions)
Loaded lazily in Step 4 **only** when an LLM engine is active. Prompt files must state **only** what pattern fires (including false-positive boundaries) and plain editorial fix guidance—never internal kernel JSON keys (`actionType`, `fixSafety`, `suggestedReplacement`, etc.):

```markdown
---
roleHint: "Scope: technical release notes and postmortems."
rules:
  - id: throat-clearing
    priority: strong
  - id: vague-attribution
    priority: moderate
---

1. **throat-clearing**: Fires when a paragraph opens with a meta-announcement ("In this section, we will discuss...") whose scope is already established by the heading. Fix suggestion: remove the meta-announcement and open directly on the claim.
2. **vague-attribution**: Fires on unanchored authority claims ("Studies have shown", "Many experts argue") lacking a named source. Fix suggestion: cite the specific study, author, or empirical dataset.
```

---

### B. Single-File Zero-Code Markdown Pack (`<name>.pack.md`)

For quick team or personal prompt rules without any JavaScript, create a standalone `.pack.md` file with `name`, `languages`, `formats`, and `rules` in YAML frontmatter:

```markdown
---
name: academic-en
languages: [en]
formats: [md, txt, docx]
rules:
  - id: vague-attribution
    priority: moderate
---

1. **vague-attribution**: Fires on unanchored authority claims ("Studies have shown") lacking a citation. Fix suggestion: cite the specific study or empirical dataset.
```

Run it directly from the CLI:

```bash
dislop check paper.md --pack ./academic-en.pack.md --engine byok
```

---

### C. Single-File Programmatic Pack (`definePack`)

Third-party npm packages or local `.mjs` scripts can also export a single `definePack({...})` object from `dislop/sdk`:

```js
import { definePack } from "dislop/sdk";

export default definePack({
  name: "custom/release-notes",
  version: "0.1.0",
  formats: ["md"],
  check(doc, ctx) {
    // ctx.reportDefect(...) or ctx.reportSuggestion(...)
  },
});
```

---

## 2. Pack Authoring Guardrails

1. **High Restraint**: Do not flag ordinary domain or technical sentences merely because they contain an abstract verb when external repository context is unavailable. Reserve built-in rules for zero-information filler or self-contained syntactic AI tics.
2. **Strict Single-Language Separation**:
   - Files under `packs/common/` and `packs/en/` must stay strictly in English (`0` CJK characters).
   - Files under `packs/zh/` must use native Chinese descriptions, rules, and examples without mixed English prose specimens.
3. **No Kernel Schema Leakage or Forbidden Capabilities**:
   - `prompts/*.md` must not reference internal report fields (`actionType`, `fixSafety`, `suggestedReplacement`, `targetId`) or boundary tags (`<untrusted_document>`, `<pack_rules>`).
   - `scripts/*.mjs` must remain deterministic and offline (no `fetch`, `http`, `child_process`, `eval`, or filesystem writes).

---

## 3. Running Tests & Dogfood Checks Before Opening a PR

```bash
npm test
npm run dogfood
```
