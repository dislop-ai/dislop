import { definePackScripts } from "dislop/sdk";

export default definePackScripts({
  check(doc, ctx) {
    const deck = doc.artifacts.deckSignals;
    if (deck?.slides) {
      for (const slide of deck.slides) {
        if (slide.autofitFontScale < 80) {
          ctx.reportDefect({
            ruleId: "slide-autofit-shrink",
            severity: "warning",
            targetId: slide.firstSegmentId,
            originalQuote: slide.title || `Slide ${slide.index}`,
            fixSafety: "manual",
            actionType: "prompt",
            reason: `Slide ${slide.index} shrinks body text to ${slide.autofitFontScale}% via normAutofit to force overflowing copy onto one slide.`,
            rewritePrompt: `Trim copy on Slide ${slide.index} or split across two slides so text renders at 100% scale.`,
          });
        }

        if (slide.wordCount > 120 || slide.cjkCount > 280) {
          ctx.reportSuggestion({
            ruleId: "slide-word-wall",
            priority: "strong",
            fixSafety: "manual",
            actionType: "prompt",
            targetId: slide.firstSegmentId,
            originalQuote: slide.title || `Slide ${slide.index}`,
            reason: `Slide ${slide.index} packs ${slide.wordCount} words (${slide.cjkCount} CJK chars), creating an unreadable slide wall.`,
            rewritePrompt: `Distill Slide ${slide.index} to key takeaways and move dense prose to speaker notes.`,
          });
        }

        if (slide.bulletCount > 6) {
          ctx.reportSuggestion({
            ruleId: "slide-bullet-overload",
            priority: "moderate",
            fixSafety: "manual",
            actionType: "prompt",
            targetId: slide.firstSegmentId,
            originalQuote: slide.title || `Slide ${slide.index}`,
            reason: `Slide ${slide.index} stacks ${slide.bulletCount} bullet items (> 6 recommended maximum).`,
            rewritePrompt: `Group or trim bullets on Slide ${slide.index} to at most 4-5 distinct points.`,
          });
        }
      }
    }

    const media = doc.artifacts.mediaSignals;
    if (media?.aiWorkflowResidue) {
      ctx.reportDefect({
        ruleId: "image-ai-workflow-residue",
        severity: "warning",
        originalQuote: doc.filePath,
        fixSafety: "manual",
        actionType: "prompt",
        reason: "Image contains unstripped ComfyUI / Automatic1111 generation prompt parameters in metadata.",
        rewritePrompt: "Strip embedded generation workflow chunks from the image before publishing.",
      });
    }
  },
});
