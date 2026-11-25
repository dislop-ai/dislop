import fs from "node:fs";
import path from "node:path";
import { definePackScripts, maskInlineCode } from "dislop/sdk";

const UNIVERSAL_PLACEHOLDER_PATTERNS = [
  /\[(?:TODO|TBD|FIXME|XXX)(?:[:\s][^\][\n]{0,60})?\](?!\s*\()/i,
  /\{\{\s*[A-Za-z_][A-Za-z0-9_.-]{0,40}\s*\}\}/,
  /<INSERT_[A-Z0-9_]{1,40}>/,
];

const CITATION_ARTIFACT_RE =
  /(?::contentReference\[oaicite:\d+\](?:\{[^}]*\})?|\[(?:oaicite|turn\d+search\d+|citation):\s*[^\]]+\])/i;

function isExternalOrSpecialScheme(url) {
  return /^(?:https?:|mailto:|tel:|data:|blob:|ftp:|irc:|vscode:)/i.test(url);
}

export default definePackScripts({
  check(doc, ctx) {
    for (const seg of doc.segments) {
      const proseOnly = maskInlineCode(seg.text);

      for (const re of UNIVERSAL_PLACEHOLDER_PATTERNS) {
        const m = proseOnly.match(re);
        if (m) {
          const hitQuote = seg.text.slice(m.index, m.index + m[0].length);
          ctx.reportDefect({
            ruleId: "unfilled-placeholder",
            severity: "error",
            targetId: seg.id,
            line: seg.line,
            originalQuote: hitQuote,
            fixSafety: "manual",
            actionType: "prompt",
            reason: "Unfilled developer or template token left in deliverable.",
            rewritePrompt: `Replace '${hitQuote}' with the real value before publishing, or remove the unfinished sentence.`,
          });
          break;
        }
      }

      const citeMatch = proseOnly.match(CITATION_ARTIFACT_RE);
      if (citeMatch) {
        const hitQuote = seg.text.slice(citeMatch.index, citeMatch.index + citeMatch[0].length);
        ctx.reportDefect({
          ruleId: "chatbot-citation-leak",
          severity: "error",
          targetId: seg.id,
          line: seg.line,
          originalQuote: hitQuote,
          fixSafety: "safe",
          actionType: "delete",
          suggestedReplacement: "",
          reason: "Internal AI search/citation token leaked into output text.",
        });
      }
    }

    const docDir = doc.filePath ? path.dirname(path.resolve(ctx.cwd, doc.filePath)) : ctx.cwd;
    for (const link of doc.artifacts.links || []) {
      const url = String(link.url || "").trim();

      if (url === "") {
        ctx.reportDefect({
          ruleId: "empty-link-target",
          severity: "error",
          targetId: link.segmentId || null,
          line: link.line,
          originalQuote: link.raw || link.url,
          fixSafety: "manual",
          actionType: "prompt",
          reason: "Link has an empty destination URL.",
          rewritePrompt: "Provide a valid destination URL or unwrap the link.",
          locator: link.locator,
        });
        continue;
      }

      if (url === "#" || /^javascript:\s*(?:void\(0\)|;)?$/i.test(url)) {
        ctx.reportDefect({
          ruleId: "placeholder-dead-link",
          severity: doc.modality === "markup" ? "error" : "warning",
          targetId: link.segmentId || null,
          line: link.line,
          originalQuote: link.raw || url,
          fixSafety: "manual",
          actionType: "prompt",
          reason: `Placeholder non-navigating link target '${url}'.`,
          rewritePrompt: "Wire a real destination URL or use a <button type=\"button\"> control.",
          locator: link.locator,
        });
        continue;
      }

      if (!url.startsWith("#") && !url.startsWith("/") && !isExternalOrSpecialScheme(url)) {
        const cleanRel = decodeURIComponent(url.split("#")[0].split("?")[0]);
        if (cleanRel && doc.filePath && fs.existsSync(doc.filePath)) {
          const resolvedTarget = path.resolve(docDir, cleanRel);
          if (!fs.existsSync(resolvedTarget)) {
            ctx.reportDefect({
              ruleId: "broken-local-link",
              severity: "error",
              targetId: link.segmentId || null,
              line: link.line,
              originalQuote: link.raw || url,
              fixSafety: "manual",
              actionType: "prompt",
              reason: `Broken relative link: target '${cleanRel}' does not exist on disk.`,
              rewritePrompt: `Fix path '${cleanRel}' to point to an existing file.`,
              locator: link.locator,
            });
          }
        }
      }
    }

    for (const leak of doc.artifacts.rawFormattingLeaks || []) {
      let safeCleanup = "";
      let fixSafety = "manual";
      if (leak.pattern === "bold-asterisks" && /^\*\*([^*]+)\*\*$/.test(leak.text)) {
        const seg = doc.segments.find((s) => s.id === leak.segmentId);
        if (seg) {
          safeCleanup = seg.text.replace(/\*\*([^*\n]+)\*\*/g, "$1");
          fixSafety = "safe";
        }
      }

      ctx.reportDefect({
        ruleId: "raw-markdown-leak",
        severity: "error",
        targetId: leak.segmentId,
        line: leak.line,
        originalQuote:
          fixSafety === "safe"
            ? doc.segments.find((s) => s.id === leak.segmentId)?.text || leak.text
            : leak.text,
        fixSafety,
        actionType: fixSafety === "safe" ? "replace" : "prompt",
        suggestedReplacement: safeCleanup,
        reason: `Unrendered raw Markdown syntax (${leak.pattern}) leaked into ${doc.format.toUpperCase()} content.`,
        ...(fixSafety === "manual"
          ? { rewritePrompt: "Convert raw Markdown syntax into native document formatting." }
          : {}),
      });
    }
  },
});
