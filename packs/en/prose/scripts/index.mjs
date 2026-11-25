import { definePackScripts, maskInlineCode } from "dislop/sdk";

const PURE_FILLER_SENTENCES = [
  /^In today's (?:fast-paced|rapidly evolving|ever-changing|modern|digital) [^.!?\n]{2,120}[.!?]$/i,
  /^In conclusion,\s+(?:this|it) (?:represents|marks|is) a (?:significant|major|pivotal|exciting) (?:step forward|milestone|leap forward)[.!?]$/i,
  /^Looking ahead,\s+the possibilities are (?:truly )?(?:endless|limitless|boundless)[.!?]$/i,
];

const THROAT_CLEARING_PREFIXES = [
  {
    re: /^(?:It is (?:worth noting|important to note|essential to remember|crucial to understand) that\s+)/i,
    label: "throat-clearing opener",
  },
  {
    re: /^(?:Needless to say,\s+|As you may already know,\s+|At the end of the day,\s+)/i,
    label: "filler preamble",
  },
];

const STANDALONE_SELF_QA_RE =
  /^(?:Why does this matter\?|What does this mean(?: in practice| for you)?\?|Here(?:'s| is) the kicker:|The (?:result|bottom line|catch)\?)$/i;

const INLINE_SELF_QA_PREFIX_RE =
  /^(?:Why does this matter\?|What does this mean(?: in practice)?\?|The (?:result|bottom line|catch)\?|(?:And )?[Ss]imply put,|The answer is simple\s*[:—-])\s+/i;

const SECOND_ORDER_SLOGAN_RE =
  /\b(?:isn't|is not) (?:just|merely|simply)\b[\s\S]{1,50}\bit(?:'s| is)\b|\b(?:game-changer|testament to)\b/i;

function capitalizeFirst(str) {
  if (!str) return str;
  return str[0].toUpperCase() + str.slice(1);
}

export default definePackScripts({
  check(doc, ctx) {
    let consecutiveBoldListItems = 0;
    let boldWallAnchorSeg = null;

    for (const seg of doc.segments) {
      const text = seg.text.trim();
      const masked = maskInlineCode(text);

      if (PURE_FILLER_SENTENCES.some((re) => re.test(masked))) {
        ctx.reportSuggestion({
          ruleId: "hollow-transition",
          priority: "strong",
          fixSafety: "safe",
          actionType: "delete",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: "",
          reason:
            "Zero-information macro filler sentence; deleting it preserves all factual claims and causal links.",
        });
        continue;
      }

      for (const { re, label } of THROAT_CLEARING_PREFIXES) {
        const m = masked.match(re);
        if (m && text.length > m[0].length + 8) {
          const remainder = capitalizeFirst(text.slice(m[0].length));
          ctx.reportSuggestion({
            ruleId: "throat-clearing",
            priority: "strong",
            fixSafety: "safe",
            actionType: "replace",
            targetId: seg.id,
            line: seg.line,
            originalQuote: seg.text,
            suggestedReplacement: remainder,
            reason: `Removes zero-information ${label} so the sentence opens directly on the claim.`,
          });
          break;
        }
      }

      if (STANDALONE_SELF_QA_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "rhetorical-self-qa",
          priority: "moderate",
          fixSafety: "review",
          actionType: "delete",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: "",
          reason: "Removes mechanical assistant rhetorical bridge question so the answer states the point directly.",
        });
        continue;
      }

      if (INLINE_SELF_QA_PREFIX_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "rhetorical-self-qa",
          priority: "moderate",
          fixSafety: "review",
          actionType: "replace",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: capitalizeFirst(text.replace(INLINE_SELF_QA_PREFIX_RE, "")),
          reason: "Replaces mechanical assistant self-Q&A transition with a direct statement.",
        });
      }

      const pivotMatch = masked.match(
        /^(?:This|It) (?:isn't|is not) (?:just|merely|simply) [^—–,;]{2,50}(?:—|–|--|,\s*)\s*it(?:'s| is)\s+(.+)$/i,
      );
      if (pivotMatch) {
        const rhsStart = masked.length - pivotMatch[1].length;
        ctx.reportSuggestion({
          ruleId: "unprompted-negation",
          priority: "strong",
          fixSafety: "review",
          actionType: "replace",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: `It is ${text.slice(rhsStart)}`,
          reason:
            "Formulaic 'Not just X — it's Y' contrast shell; state the actual point directly without theatrical negation.",
        });
      }

      if (seg.id.endsWith("-S1")) {
        if (/^\*\*[^*\n]{2,40}\*\*\s*[:—-]/.test(text)) {
          consecutiveBoldListItems += 1;
          if (consecutiveBoldListItems === 1) boldWallAnchorSeg = seg;
          if (consecutiveBoldListItems === 4 && boldWallAnchorSeg) {
            ctx.reportSuggestion({
              ruleId: "bold-lead-list-wall",
              priority: "hint",
              fixSafety: "manual",
              actionType: "prompt",
              targetId: boldWallAnchorSeg.id,
              line: boldWallAnchorSeg.line,
              originalQuote: boldWallAnchorSeg.text,
              reason:
                "Four or more consecutive '**Label**: description' list items create a mechanical assistant list wall.",
              rewritePrompt:
                "Convert uniform bold-lead bullets into direct sentences or plain list items without bold title prefixes.",
            });
          }
        } else {
          consecutiveBoldListItems = 0;
          boldWallAnchorSeg = null;
        }
      }
    }
  },

  verifyFix(_issue, candidateText) {
    if (candidateText && SECOND_ORDER_SLOGAN_RE.test(candidateText)) {
      return {
        ok: false,
        reason: "Replacement introduced a second-order AI slogan ('not just X, it's Y' / 'game-changer').",
      };
    }
    return { ok: true };
  },
});
