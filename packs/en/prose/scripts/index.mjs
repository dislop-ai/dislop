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

const SINGLE_SEG_SELF_QA_RE =
  /^Why (?:does|do|is|are) [^?\n]{4,80}\?\s+Because\s+(.+)$/i;

const MORALIZING_CLOSER_EN_RE =
  /^(?:Ultimately|At the end of the day|In the final analysis),\s+(?:this|it) (?:serves as a |stands as a |is a |reminds us )?(?:powerful |quiet |timeless )?(?:reminder|testament|lesson|that )[\s\S]*[.!]$/i;

const STACCATO_SHORT_SENT_RE = /^[A-Z][a-z]{1,14}(?:\s+[a-z]{2,12}){1,2}[.!]$/;

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
    let staccatoRun = [];

    const flushStaccatoRun = () => {
      if (staccatoRun.length >= 3) {
        const anchor = staccatoRun[0];
        ctx.reportSuggestion({
          ruleId: "staccato-slogan-run",
          priority: "hint",
          fixSafety: "manual",
          actionType: "prompt",
          targetId: anchor.id,
          line: anchor.line,
          originalQuote: staccatoRun.map((s) => s.text).join(" "),
          reason: `${staccatoRun.length} consecutive 2-to-3-word punchy sentences create a stock AI slogan cadence.`,
          rewritePrompt: "Merge or expand the staccato clauses into varied, concrete prose.",
        });
      }
      staccatoRun = [];
    };

    for (const seg of doc.segments) {
      const text = seg.text.trim();
      const masked = maskInlineCode(text);
      const isHeading = seg.blockKind === "heading";

      if (!isHeading && staccatoRun.length > 0 && staccatoRun[0].paragraphId !== seg.paragraphId) {
        flushStaccatoRun();
      }
      if (!isHeading && text.length <= 24 && STACCATO_SHORT_SENT_RE.test(masked)) {
        staccatoRun.push(seg);
      } else {
        flushStaccatoRun();
      }

      if (!isHeading && PURE_FILLER_SENTENCES.some((re) => re.test(masked))) {
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

      if (!isHeading) {
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
      }

      if (!isHeading && STANDALONE_SELF_QA_RE.test(masked)) {
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

      if (!isHeading && INLINE_SELF_QA_PREFIX_RE.test(masked)) {
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
      } else if (!isHeading) {
        const singleQa = masked.match(SINGLE_SEG_SELF_QA_RE);
        if (singleQa) {
          const rhsStart = masked.length - singleQa[1].length;
          ctx.reportSuggestion({
            ruleId: "rhetorical-self-qa",
            priority: "moderate",
            fixSafety: "review",
            actionType: "replace",
            targetId: seg.id,
            line: seg.line,
            originalQuote: seg.text,
            suggestedReplacement: capitalizeFirst(text.slice(rhsStart)),
            reason: "Replaces artificial self-Q&A sentence with a direct statement.",
          });
        } else if (/^Why\s+(?:does|do|is|are)\b[^?\n]{4,80}\?$/i.test(masked)) {
          const segIdx = doc.segments.indexOf(seg);
          const nextSeg = segIdx !== -1 ? doc.segments[segIdx + 1] : null;
          if (nextSeg && nextSeg.paragraphId === seg.paragraphId && /^Because\s+/i.test(nextSeg.text.trim())) {
            ctx.reportSuggestion({
              ruleId: "rhetorical-self-qa",
              priority: "moderate",
              fixSafety: "review",
              actionType: "delete",
              targetId: seg.id,
              line: seg.line,
              originalQuote: seg.text,
              suggestedReplacement: "",
              reason: "Removes mechanical self-Q&A prompt before 'Because...' so the claim states the answer directly.",
            });
          }
        }
      }

      const pivotMatch = masked.match(
        /^(?:This|It) (?:isn't|is not|wasn't|was not) (?:just|merely|simply) [^—–,;]{2,60}(?:—|–|--|,\s*(?:but(?:\s+rather)?\s+|it(?:'s| is| was)\s+))(.+)$/i,
      );
      if (pivotMatch) {
        const rhsStart = masked.length - pivotMatch[1].length;
        const rhsRaw = text.slice(rhsStart).trim();
        const isPast = /\bwas(?:n't|\s+not)\b/i.test(masked.slice(0, rhsStart));
        const direct = /^(?:a|an|the)\b/i.test(rhsRaw)
          ? `${isPast ? "It was" : "It is"} ${rhsRaw}`
          : /^it(?:'s|\u2019s)\s+/i.test(rhsRaw)
            ? `It is ${rhsRaw.replace(/^it(?:'s|\u2019s)\s+/i, "")}`
            : /^it\s+was\s+/i.test(rhsRaw)
              ? `It was ${rhsRaw.replace(/^it\s+was\s+/i, "")}`
              : capitalizeFirst(rhsRaw);
        ctx.reportSuggestion({
          ruleId: "unprompted-negation",
          priority: "strong",
          fixSafety: "review",
          actionType: "replace",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: direct,
          reason:
            "Formulaic 'Not just X — it's Y' contrast shell; state the actual point directly without theatrical negation.",
        });
      } else {
        const subjPivot = masked.match(
          /^[A-Z][^.!?]{2,50}\s+(?:isn't|is not|wasn't|was not) (?:just|merely|simply) a [^—–,;]{2,40}(?:—|–|--|,\s*(?:but\s+)?)\s*it(?:'s| is| was)\s+(.+)$/i,
        );
        if (subjPivot) {
          ctx.reportSuggestion({
            ruleId: "unprompted-negation",
            priority: "strong",
            fixSafety: "manual",
            actionType: "prompt",
            targetId: seg.id,
            line: seg.line,
            originalQuote: seg.text,
            reason:
              "Formulaic 'X wasn't just A — it was B' aphorism pivot; rewrite directly around concrete details.",
            rewritePrompt: "Drop the 'wasn't just' contrast shell and state what the object or event actually did.",
          });
        }
      }

      if (!isHeading && MORALIZING_CLOSER_EN_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "moralizing-closer",
          priority: "moderate",
          fixSafety: "review",
          actionType: "delete",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: "",
          reason: "Preachy summary closer adds no concrete takeaway or next step.",
        });
      }

      const emDashCount = (masked.match(/\u2014/g) || []).length;
      if (emDashCount >= 3) {
        ctx.reportSuggestion({
          ruleId: "excessive-em-dash",
          priority: "hint",
          fixSafety: "manual",
          actionType: "prompt",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          reason: `Single sentence packs ${emDashCount} em-dashes, fragmenting flow.`,
          rewritePrompt: "Split parenthetical em-dash chains into separate direct sentences or commas.",
        });
      }

      if (seg.id.endsWith("-S1") && (seg.blockKind === "list-item" || !seg.blockKind)) {
        const boldLabel = text.match(/^\*\*([^*\n]{2,40})\*\*\s*[:\u2014-]/);
        if (boldLabel && !/`|--/.test(boldLabel[1])) {
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
      } else if (seg.id.endsWith("-S1")) {
        consecutiveBoldListItems = 0;
        boldWallAnchorSeg = null;
      }
    }
    flushStaccatoRun();
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
