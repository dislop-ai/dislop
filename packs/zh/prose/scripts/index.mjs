import { definePackScripts, maskInlineCode } from "dislop/sdk";

const PURE_FILLER_ZH_SENTENCES = [
  /^在当今[^，。！？\n]{2,20}的(?:浪潮|背景|时代|大背景|趋势)下[，,]\s*(?:这一举措|这|它)?(?:无疑)?具有[^。！？\n]{2,24}[。！？]$/,
  /^随着[^，。！？\n]{2,18}的(?:不断深入|飞速发展|持续演进|日益普及)[，,]\s*[^。！？\n]{2,24}已成(?:为)?必然趋势[。！？]$/,
  /^展望未来[，,]\s*我们将继续[^。！？\n]{2,30}[。！？]$/,
  /^总而言之[，,]\s*这不仅标志着新的起点[，,]\s*更为未来[^。！？\n]{2,24}[。！？]$/,
];

const THROAT_CLEARING_ZH_PREFIXES = [
  /^(?:值得注意的是[，,]\s*|需要指出的是[，,]\s*|毋庸置疑[，,]\s*|众所周知[，,]\s*)/,
];

const STANDALONE_SELF_QA_ZH_RE =
  /^(?:为什么这(?:一点|件事)?(?:如此|这么)?重要[？?]|这意味着什么[？?]|背后原因是什么[？?])$/;

const MECHANICAL_SELF_QA_ZH_RE =
  /^(?:答案很简单[：:—-]\s*|究其原因[，,：:]\s*|简而言之[，,]\s*答案就是)/;

const FOUR_CHAR_TRIAD_RE =
  /(?:精准高效|安全可靠|灵活易用|全面赋能|协同联动|稳步推进|持续优化|深度融合|多维驱动|闭环管理)(?:[、，,]\s*(?:精准高效|安全可靠|灵活易用|全面赋能|协同联动|稳步推进|持续优化|深度融合|多维驱动|闭环管理)){2,}/;

const SECOND_ORDER_ZH_SLOGAN_RE =
  /(?:不是|并非)(?:单纯的?|简单的?)?[^，。；\n]{1,20}[，,]\s*而是(?:一场|一次)?[^。！？\n]{1,28}/;

export default definePackScripts({
  check(doc, ctx) {
    for (const seg of doc.segments) {
      const text = seg.text.trim();
      const masked = maskInlineCode(text);

      if (PURE_FILLER_ZH_SENTENCES.some((re) => re.test(masked))) {
        ctx.reportSuggestion({
          ruleId: "hollow-transition",
          priority: "strong",
          fixSafety: "safe",
          actionType: "delete",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: "",
          reason: "零信息增量的宏大叙事套话，执行破坏性删除测试后不影响上下文事实与因果推进。",
        });
        continue;
      }

      for (const prefixRe of THROAT_CLEARING_ZH_PREFIXES) {
        const m = masked.match(prefixRe);
        if (m && text.length > m[0].length + 6) {
          ctx.reportSuggestion({
            ruleId: "throat-clearing",
            priority: "moderate",
            fixSafety: "safe",
            actionType: "replace",
            targetId: seg.id,
            line: seg.line,
            originalQuote: seg.text,
            suggestedReplacement: text.slice(m[0].length),
            reason: "删去无实质信息的句首套话铺垫，直接进入具体陈述。",
          });
          break;
        }
      }

      if (STANDALONE_SELF_QA_ZH_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "rhetorical-self-qa",
          priority: "moderate",
          fixSafety: "review",
          actionType: "delete",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          suggestedReplacement: "",
          reason: "移除机械的助手式自问过渡句，让后一句直接给出结论。",
        });
        continue;
      }

      if (MECHANICAL_SELF_QA_ZH_RE.test(masked) && text.length > 8) {
        const stripped = text.replace(MECHANICAL_SELF_QA_ZH_RE, "");
        if (stripped && stripped !== text) {
          ctx.reportSuggestion({
            ruleId: "rhetorical-self-qa",
            priority: "moderate",
            fixSafety: "review",
            actionType: "replace",
            targetId: seg.id,
            line: seg.line,
            originalQuote: seg.text,
            suggestedReplacement: stripped,
            reason: "去掉机械的助手式自问自答过渡壳，直接陈述结论。",
          });
        }
      }

      const pivotMatch = masked.match(
        /^这(?:不是|并非)(?:一次|一场)?(?:单纯的?|简单的?)?[^，,；\n]{2,20}[，,]\s*而是(.+)$/,
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
          suggestedReplacement: `这是${text.slice(rhsStart)}`,
          reason: "移除无前文语境支撑的“不是…而是…”伪深刻对比壳，直接陈述后半句内容。",
        });
      }

      const triadMatch = masked.match(FOUR_CHAR_TRIAD_RE);
      if (triadMatch) {
        const hitQuote = text.slice(triadMatch.index, triadMatch.index + triadMatch[0].length);
        ctx.reportSuggestion({
          ruleId: "four-char-slogan-triad",
          priority: "moderate",
          fixSafety: "manual",
          actionType: "prompt",
          targetId: seg.id,
          line: seg.line,
          originalQuote: hitQuote,
          reason: "连续堆砌三个及以上空洞四字套话排比，缺乏具体动作或边界信息。",
          rewritePrompt: "删去四字口号排比串，保留或改写为原文中实际发生的具体改动：[填入具体机制或动作]",
        });
      }
    }
  },

  verifyFix(_issue, candidateText) {
    if (candidateText && SECOND_ORDER_ZH_SLOGAN_RE.test(candidateText)) {
      return {
        ok: false,
        reason: "改写结果引入了“不是…而是…”二阶口号转折句式。",
      };
    }
    return { ok: true };
  },
});
