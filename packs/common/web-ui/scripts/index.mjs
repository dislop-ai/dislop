import { definePackScripts } from "dislop/sdk";

export default definePackScripts({
  check(doc, ctx) {
    const ui = doc.artifacts.uiSignals;
    if (!ui) return;

    if (ui.missingSvgViewBox) {
      ctx.reportDefect({
        ruleId: "svg-missing-viewbox",
        severity: "warning",
        originalQuote: "<svg>",
        fixSafety: "manual",
        actionType: "prompt",
        reason: "SVG root element omits a 'viewBox' attribute, breaking responsive scaling.",
        rewritePrompt: "Add an explicit viewBox=\"0 0 <width> <height>\" on the root <svg> element.",
      });
    }

    for (const btn of ui.disabledButtonsWithoutTitle || []) {
      ctx.reportDefect({
        ruleId: "unexplained-disabled-button",
        severity: "warning",
        originalQuote: btn.text.slice(0, 100),
        fixSafety: "manual",
        actionType: "prompt",
        reason: "Disabled <button> has no title or aria-label explaining why it is inactive.",
        rewritePrompt: "Wire the button handler, remove the dead control, or add an explanatory title/aria-label.",
      });
    }

    if ((ui.purplePinkGradients || []).length > 0) {
      ctx.reportSuggestion({
        ruleId: "neon-ai-gradient",
        priority: "moderate",
        fixSafety: "manual",
        actionType: "prompt",
        originalQuote: ui.purplePinkGradients[0].text.slice(0, 100),
        reason: "Stock purple-to-pink gradient strongly signals default AI-generated landing page chrome.",
        rewritePrompt: "Replace stock purple-pink gradients with a restrained brand neutral or single accent token.",
      });
    }

    if ((ui.glowBlobs || []).length > 0) {
      ctx.reportSuggestion({
        ruleId: "glow-blob-backdrop",
        priority: "hint",
        fixSafety: "manual",
        actionType: "prompt",
        originalQuote: ui.glowBlobs[0].text.slice(0, 100),
        reason: "Blurred floating glow-orb backdrop is a recognizable stock AI UI trope.",
        rewritePrompt: "Remove decorative blur-3xl orbs unless required by an established brand system.",
      });
    }

    if ((ui.pillBadges || []).length >= 4) {
      ctx.reportSuggestion({
        ruleId: "pill-badge-soup",
        priority: "moderate",
        fixSafety: "manual",
        actionType: "prompt",
        originalQuote: ui.pillBadges[0].text.slice(0, 100),
        reason: `Dense cluster of ${ui.pillBadges.length} rounded-full pill badges creates visual clutter.`,
        rewritePrompt: "Consolidate decorative pill kickers into plain typographic labels or metadata rows.",
      });
    }
  },
});
