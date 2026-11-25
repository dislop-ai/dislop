import { definePackScripts, maskInlineCode } from "dislop/sdk";

const ZH_LEAKED_SLIDE_DIRECTIVE_RE =
  /^(?:\[(?:第\s*\d+\s*页|配图(?:建议)?|视觉(?:呈现|建议)|画面描述|图表建议|演讲者?备注)[：:][^\]]*\]|【(?:配图(?:建议)?|视觉建议|此处放[^】]{1,16}|演讲者?备注)[：:]?[^】]*】|演讲者?备注[：:]\s+)/;

const ZH_BUZZWORD_SLIDE_HEADLINE_RE =
  /^(?:顶层设计与生态赋能|多维驱动与闭环抓手|破局立新[，,、]?\s*智赢未来|构建全方位协同矩阵|全面赋能业务高质量发展|三大核心抓手与生态闭环)$/;

const ZH_CLOSING_SLOGAN_RE =
  /^(?:携手并进[，,]\s*共创(?:辉煌)?未来|凝心聚力[，,]\s*再谱(?:新篇|华章)|不忘初心[，,]\s*砥砺前行)[。！!]?$/;

const ZH_SLIDE_REGRESSION_RE =
  /(?:生态闭环|核心抓手|智赢未来|多维赋能|(?:不是|并非)[^，。]{1,16}[，,]\s*而是)/;

export default definePackScripts({
  check(doc, ctx) {
    for (const seg of doc.segments) {
      const text = seg.text.trim();
      const masked = maskInlineCode(text);

      if (ZH_LEAKED_SLIDE_DIRECTIVE_RE.test(masked)) {
        ctx.reportDefect({
          ruleId: "leaked-slide-directive",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          fixSafety: "manual",
          actionType: "prompt",
          reason: "幻灯片画面正文中遗留了 AI 生成时的配图提示指令或演讲者备注标签。",
          rewritePrompt: "将演讲词移入幻灯片备注栏，并将配图提示替换为真实图表或直接删除。",
        });
        continue;
      }

      if (ZH_BUZZWORD_SLIDE_HEADLINE_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "buzzword-slide-headline",
          priority: "moderate",
          fixSafety: "manual",
          actionType: "prompt",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          reason: "空洞的汇报黑话页标题没有传递任何当页业务结论或具体进展。",
          rewritePrompt: "直接用一句话写出当页核心结论或关键指标变化：[填入当页结论或指标结果]",
        });
      }

      if (ZH_CLOSING_SLOGAN_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "closing-slide-slogan",
          priority: "hint",
          fixSafety: "safe",
          actionType: "delete",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: "",
          reason: "模板化的表态口号式幻灯片结尾，可直接删除并保留具体下一步计划或答疑信息。",
        });
      }
    }
  },

  verifyFix(_issue, candidateText) {
    if (candidateText && ZH_SLIDE_REGRESSION_RE.test(candidateText)) {
      return {
        ok: false,
        reason: "幻灯片改写结果引入了“生态闭环 / 核心抓手 / 智赢未来 / 多维赋能 / 不是…而是…”套话口号。",
      };
    }
    return { ok: true };
  },
});
