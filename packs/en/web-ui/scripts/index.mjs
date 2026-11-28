import { definePackScripts, maskInlineCode } from "dislop/sdk";

const EN_PLACEHOLDER_UI_COPY =
  /^(?:Card Title|Feature (?:One|Two|Three|Title)|Short description goes here\.?|Your tagline here\.?|Button Text|Enter your text here\.?)$/i;

const EN_PROMPT_ECHO_HERO_RE =
  /\b(?:AI-Powered|Next-Gen(?:eration)? AI)\b|(?:^(?:Supercharge|Unleash|Revolutionize) Your (?:Workflow|Productivity|Business)\b)/i;

const LEADING_EMOJI_RE = /^[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?\s+[A-Z]/u;

const EN_FAKE_TESTIMONIAL_RE =
  /\bcompletely transformed how our team (?:works|operates|collaborates)\b/i;

const EN_UI_SLOGAN_REGRESSION_RE =
  /\b(?:supercharge|unleash|next-gen|game-changer|revolutionize|seamless(?:ly)?)\b/i;

export default definePackScripts({
  check(doc, ctx) {
    const emojiPrefixedSegs = [];

    for (const seg of doc.segments) {
      const text = seg.text.trim();
      const masked = maskInlineCode(text);
      const isStatusGlyph = /^[\u2713-\u2718\u26A0\u2610-\u2612]/u.test(text);

      if (EN_PLACEHOLDER_UI_COPY.test(masked)) {
        ctx.reportDefect({
          ruleId: "placeholder-ui-copy",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          fixSafety: "manual",
          actionType: "prompt",
          reason: "Unreplaced English UI scaffold label left inside rendered markup.",
          rewritePrompt: `Replace '${seg.text}' with real product copy or remove the placeholder element.`,
        });
        continue;
      }

      if (EN_PROMPT_ECHO_HERO_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "prompt-echo-copy",
          priority: "moderate",
          fixSafety: "manual",
          actionType: "prompt",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          reason:
            "Stock 'AI-Powered / Supercharge Your Workflow' copy echoes the generation prompt instead of stating what the product actually does.",
          rewritePrompt:
            "State the concrete user task, input/output, or workflow speed-up directly: [specific product capability]",
        });
      }

      if (EN_FAKE_TESTIMONIAL_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "synthetic-testimonial-cliche",
          priority: "moderate",
          fixSafety: "manual",
          actionType: "prompt",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          reason: "Generic AI-generated testimonial phrasing signals synthetic social proof.",
          rewritePrompt:
            "Use a real attributed quote with a concrete outcome, or remove the synthetic testimonial block.",
        });
      }

      if (
        seg.blockKind !== "table-cell" &&
        !seg.inTableCell &&
        !isStatusGlyph &&
        LEADING_EMOJI_RE.test(text) &&
        text.length <= 60
      ) {
        emojiPrefixedSegs.push(seg);
      }
    }

    if (emojiPrefixedSegs.length >= 3) {
      const first = emojiPrefixedSegs[0];
      ctx.reportSuggestion({
        ruleId: "emoji-feature-grid",
        priority: "hint",
        fixSafety: "manual",
        actionType: "prompt",
        targetId: first.id,
        line: first.line,
        originalQuote: first.text,
        reason: `${emojiPrefixedSegs.length} UI headings/labels start with decorative emojis, a common AI component-generator pattern.`,
        rewritePrompt:
          "Strip leading decorative emojis from card headings or replace them with consistent SVG icons.",
      });
    }
  },

  verifyFix(_issue, candidateText) {
    if (candidateText && EN_UI_SLOGAN_REGRESSION_RE.test(candidateText)) {
      return {
        ok: false,
        reason:
          "UI copy replacement introduced generic AI marketing hype ('supercharge' / 'unleash' / 'next-gen' / 'seamless').",
      };
    }
    return { ok: true };
  },
});
