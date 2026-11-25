import { definePackScripts, maskInlineCode } from "dislop/sdk";

const ZH_PLACEHOLDER_PATTERNS = [
  /\[(?:待补充|待填写|此处插入|请填写|占位符|待确认|公司名称|项目名称|姓名|日期)(?:[：:\s][^\][\n]{0,40})?\](?!\s*\()/,
  /【[^】\n]{0,20}(?:待补充|待填写|此处插入|请填写|请替换|占位符)[^】\n]{0,20}】/,
  /(?:单击此处添加(?:标题|副标题|文本|备注)|点击此处输入(?:标题|正文|内容))/,
];

const ZH_CHATBOT_WRAPPER_SENTENCES = [
  /^(?:好的|当然|当然可以|没问题)[，,！!]?\s*(?:以下是|下面是|这是为您|这里为您|我已经为您)[\s\S]*$/,
  /^(?:以下是|下面是)(?:为您)?(?:整理|修改|润色|优化|重写|起草)后的?[\s\S]*[：:。]$/,
  /^作为一(?:名|个)(?:人工智能|大语言模型|语言模型)[\s\S]*$/,
  /^希望(?:以上|这份|这些|上述)(?:内容|方案|回答|总结)对(?:您|你)有(?:所)?帮助[\s\S]*$/,
  /^如果(?:您|你)(?:还有其他问题|需要进一步(?:修改|调整|补充|展开))[\s\S]*(?:告诉我|提问)[。！!]?$/,
  /^需要我为(?:您|你)进一步(?:展开|细化|调整)[\s\S]*[？?]$/,
];

const ZH_CUTOFF_OR_REFUSAL_RE =
  /(?:截至我的知识截止(?:日期|时间)|很抱歉[，,]作为一(?:名|个)人工智能|我无法满足该请求)/;

const ZH_WRAPPER_REGRESSION_RE =
  /^(?:好的[，,！!]|以下是为您|希望以上内容对您)/;

export default definePackScripts({
  check(doc, ctx) {
    for (const seg of doc.segments) {
      const text = seg.text.trim();
      const proseOnly = maskInlineCode(text);

      for (const re of ZH_PLACEHOLDER_PATTERNS) {
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
            reason: "正文中存在未替换的中文模板占位符或默认假文。",
            rewritePrompt: `发稿前请将“${hitQuote}”替换为真实信息，或直接删去该未完成句。`,
          });
          break;
        }
      }

      if (ZH_CHATBOT_WRAPPER_SENTENCES.some((re) => re.test(proseOnly))) {
        ctx.reportDefect({
          ruleId: "chatbot-artifact",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          fixSafety: "safe",
          actionType: "delete",
          suggestedReplacement: "",
          reason: "正文中遗留了 AI 对话寒暄开场或客套收尾壳，可直接安全删除。",
        });
        continue;
      }

      if (ZH_CUTOFF_OR_REFUSAL_RE.test(proseOnly)) {
        ctx.reportDefect({
          ruleId: "chatbot-cutoff-leak",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          fixSafety: "manual",
          actionType: "prompt",
          reason: "正文中遗留了大模型知识截止说明或拒答套话。",
          rewritePrompt: "删除粘贴进文稿的模型免责声明，并补入经核实的最新事实。",
        });
      }
    }
  },

  verifyFix(_issue, candidateText) {
    if (candidateText && ZH_WRAPPER_REGRESSION_RE.test(candidateText.trim())) {
      return {
        ok: false,
        reason: "改写文本中仍残留了面向提问者的 AI 助手寒暄交差句式。",
      };
    }
    return { ok: true };
  },
});
