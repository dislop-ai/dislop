import { definePackScripts, maskInlineCode } from "dislop/sdk";

const EN_PLACEHOLDER_PATTERNS = [
  /(?<![A-Za-z])(?:lorem ipsum|dolor sit amet)(?![A-Za-z])/i,
  /\[(?:insert|add|your|placeholder|enter|fill in)\s+[^\][\n]{1,60}\](?!\s*\()/i,
  /\[(?:Company Name|Recipient Name|Client Name|Author Name|Project Name|Date|Metric|Link)\](?!\s*\()/i,
  /(?:Click to add (?:title|subtitle|text|notes))/i,
];

const EN_CHATBOT_WRAPPER_SENTENCES = [
  /^(?:Certainly!|Sure!|Of course!|Absolutely!|Great question!)\s+(?:Here(?:'s| is)\b|Below is\b|I(?:'ve| have)\b)[\s\S]*$/i,
  /^Here(?:'s| is) (?:a|the|your) (?:revised|updated|draft|polished|rewritten|concise|cleaned-up)\b[\s\S]*[:.]$/i,
  /^As an AI(?: language model| assistant)?\b[\s\S]*$/i,
  /^(?:I hope this helps!?|Hope this helps!?|(?:Please )?[Ll]et me know if you(?:'d| would) like (?:any )?(?:further |more |additional )?(?:changes|adjustments|edits|modifications|revisions)[\s\S]*)$/i,
  /^Feel free to (?:ask|reach out) if you need (?:any(?:thing)? else|further assistance)[\s\S]*$/i,
  /^Would you like me to (?:expand on|refine|adjust|tailor) [\s\S]*\?$/i,
];

const EN_REFUSAL_OR_CUTOFF_RE =
  /\b(?:As of my (?:last )?knowledge cutoff|I cannot fulfill this request|I'm sorry, but as an AI)\b/i;

const EN_WRAPPER_REGRESSION_RE =
  /^(?:Certainly!|Sure!|Here(?:'s| is) the revised|I hope this helps)/i;

export default definePackScripts({
  check(doc, ctx) {
    for (const seg of doc.segments) {
      const text = seg.text.trim();
      const proseOnly = maskInlineCode(text);

      for (const re of EN_PLACEHOLDER_PATTERNS) {
        const m = proseOnly.match(re);
        if (m) {
          const hitQuote = text.slice(m.index, m.index + m[0].length);
          ctx.reportDefect({
            ruleId: "unfilled-placeholder",
            severity: "error",
            targetId: seg.id,
            line: seg.line,
            originalQuote: hitQuote,
            fixSafety: "manual",
            actionType: "prompt",
            reason: "Unfilled English template placeholder or dummy Latin copy left in deliverable.",
            rewritePrompt: `Supply the real copy in place of '${hitQuote}', or delete the unfinished sentence.`,
          });
          break;
        }
      }

      if (EN_CHATBOT_WRAPPER_SENTENCES.some((re) => re.test(proseOnly))) {
        ctx.reportDefect({
          ruleId: "chatbot-artifact",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          fixSafety: "safe",
          actionType: "delete",
          suggestedReplacement: "",
          reason: "Conversational English assistant wrapper left in the deliverable; safe to delete.",
        });
        continue;
      }

      if (EN_REFUSAL_OR_CUTOFF_RE.test(proseOnly)) {
        ctx.reportDefect({
          ruleId: "chatbot-cutoff-leak",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          fixSafety: "manual",
          actionType: "prompt",
          reason: "AI refusal or knowledge-cutoff disclaimer pasted into document.",
          rewritePrompt: "Remove the pasted AI disclaimer and supply verified current information.",
        });
      }
    }
  },

  verifyFix(_issue, candidateText) {
    if (candidateText && EN_WRAPPER_REGRESSION_RE.test(candidateText.trim())) {
      return {
        ok: false,
        reason: "Replacement still contains conversational assistant wrapper phrasing.",
      };
    }
    return { ok: true };
  },
});
