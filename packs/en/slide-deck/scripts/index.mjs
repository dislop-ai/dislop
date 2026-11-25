import { definePackScripts, maskInlineCode } from "dislop/sdk";

const EN_LEAKED_SLIDE_DIRECTIVE_RE =
  /^(?:\[(?:Slide\s+\d+|Visual|Image(?:\s+suggestion)?|Chart|Diagram|Speaker\s+Notes?)\s*:[^\]]*\]|Speaker Notes:\s+)/i;

const EN_BUZZWORD_SLIDE_HEADLINE_RE =
  /^(?:Unlocking Synergies|Charting the Path Forward|Navigating the (?:Evolving )?Landscape|A Holistic (?:Overview|Ecosystem)|Key Pillars of (?:Success|Excellence)|Driving Impactful Transformation)$/i;

const EN_CLOSING_SLOGAN_RE =
  /^(?:Together,\s*Let's Shape the Future|Let's Build Tomorrow,?\s*Today|The Future Starts Now)[.!]?$/i;

const EN_SLIDE_REGRESSION_RE =
  /\b(?:synergies|game-changer|paradigm shift|holistic ecosystem|unlocking)\b/i;

export default definePackScripts({
  check(doc, ctx) {
    for (const seg of doc.segments) {
      const text = seg.text.trim();
      const masked = maskInlineCode(text);

      if (EN_LEAKED_SLIDE_DIRECTIVE_RE.test(masked)) {
        ctx.reportDefect({
          ruleId: "leaked-slide-directive",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          fixSafety: "manual",
          actionType: "prompt",
          reason:
            "AI slide-generator stage direction or speaker-note prefix leaked onto visible slide canvas.",
          rewritePrompt:
            "Move speaker notes into the presentation notes pane and replace '[Visual: ...]' directives with the actual figure.",
        });
        continue;
      }

      if (EN_BUZZWORD_SLIDE_HEADLINE_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "buzzword-slide-headline",
          priority: "moderate",
          fixSafety: "manual",
          actionType: "prompt",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          reason:
            "Formulaic executive-deck buzzword title carries zero takeaway information.",
          rewritePrompt:
            "Replace with a concrete takeaway headline summarizing the slide's main finding: [metric or decision takeaway]",
        });
      }

      if (EN_CLOSING_SLOGAN_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "closing-slide-slogan",
          priority: "hint",
          fixSafety: "safe",
          actionType: "delete",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: "",
          reason:
            "Stock AI closing-slide slogan; safe to delete in favor of concrete next steps or Q&A contact details.",
        });
      }
    }
  },

  verifyFix(_issue, candidateText) {
    if (candidateText && EN_SLIDE_REGRESSION_RE.test(candidateText)) {
      return {
        ok: false,
        reason:
          "Slide edit introduced executive buzzword filler ('synergies' / 'paradigm shift' / 'unlocking').",
      };
    }
    return { ok: true };
  },
});
