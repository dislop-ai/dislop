import { definePackScripts, maskInlineCode } from "dislop/sdk";

const ZH_PLACEHOLDER_UI_COPY =
  /^(?:卡片标题|功能(?:一|二|三|标题|名称)|此处输入(?:简短)?描述|请输入(?:您的)?(?:标题|标语|内容)|按钮文字|示例文本)$/;

const ZH_PROMPT_ECHO_HERO_RE =
  /(?:开启[^\s，。！？]{0,8}新纪元|一站式智能赋能平台|全方位重塑(?:您的)?(?:工作流|工作方式|业务体验)|重新定义[^\s，。！？]{2,8}新标准|智能驱动的新一代)/;

const ZH_LEADING_EMOJI_RE = /^[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?\s*[\u4e00-\u9fff]/u;

const ZH_FAKE_TESTIMONIAL_RE =
  /彻底改变了我们团队的(?:工作|协作|交付)方式/;

const ZH_UI_SLOGAN_REGRESSION_RE =
  /(?:新纪元|全方位赋能|一站式闭环|颠覆性体验|丝滑体验|(?:不是|并非)[^，。]{1,16}[，,]\s*而是)/;

export default definePackScripts({
  check(doc, ctx) {
    const emojiPrefixedSegs = [];

    for (const seg of doc.segments) {
      const text = seg.text.trim();
      const masked = maskInlineCode(text);
      const isStatusGlyph = /^[\u2713-\u2718\u26A0\u2610-\u2612]/u.test(text);

      if (ZH_PLACEHOLDER_UI_COPY.test(masked)) {
        ctx.reportDefect({
          ruleId: "placeholder-ui-copy",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          fixSafety: "manual",
          actionType: "prompt",
          reason: "前端界面节点中遗留了未替换的组件脚手架假文。",
          rewritePrompt: `请将“${seg.text}”替换为真实产品界面文案，或移除多余占位节点。`,
        });
        continue;
      }

      if (ZH_PROMPT_ECHO_HERO_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "prompt-echo-copy",
          priority: "moderate",
          fixSafety: "manual",
          actionType: "prompt",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          reason: "“开启新纪元 / 全方位重塑 / 一站式赋能”属于典型的生成式落地页空洞口号，无法传达产品具体用途。",
          rewritePrompt: "直接写清产品解决的具体任务、输入输出或实际节省的步骤：[填入具体产品功能与使用场景]",
        });
      }

      if (ZH_FAKE_TESTIMONIAL_RE.test(masked)) {
        ctx.reportSuggestion({
          ruleId: "synthetic-testimonial-cliche",
          priority: "moderate",
          fixSafety: "manual",
          actionType: "prompt",
          targetId: seg.id,
          line: seg.line,
          originalQuote: seg.text,
          reason: "“彻底改变了我们团队的协作方式”是高频 AI 编造的客户评价模板句。",
          rewritePrompt: "替换为真实署名客户的具体使用反馈，或直接移除无出处的证言模块。",
        });
      }

      if (
        seg.blockKind !== "table-cell" &&
        !seg.inTableCell &&
        !isStatusGlyph &&
        ZH_LEADING_EMOJI_RE.test(text) &&
        text.length <= 36
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
        reason: `页面中连续 ${emojiPrefixedSegs.length} 个标题或卡片以装饰性 Emoji 开头，呈现明显的模板生成痕迹。`,
        rewritePrompt: "去掉卡片标题前缀的装饰 Emoji，保持干净的纯文字排版或统一线性图标。",
      });
    }
  },

  verifyFix(_issue, candidateText) {
    if (candidateText && ZH_UI_SLOGAN_REGRESSION_RE.test(candidateText)) {
      return {
        ok: false,
        reason: "界面改写文案引入了“新纪元 / 全方位赋能 / 丝滑体验 / 不是…而是…”等二阶营销口号。",
      };
    }
    return { ok: true };
  },
});
