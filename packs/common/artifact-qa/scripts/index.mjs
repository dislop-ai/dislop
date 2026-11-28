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

const LOCAL_HOME_PATH_RE =
  /(?:file:\/\/\/(?:Users|home|private\/var|[A-Za-z]:)[^\s)"'<>`\uFF0C\u3002\u3001\uFF09\uFF1B\uFF1A\u3011\u300D\u300F]*|\/(?:Users|home)\/[A-Za-z0-9._-]+\/[^\s)"'<>`\uFF0C\u3002\u3001\uFF09\uFF1B\uFF1A\u3011\u300D\u300F]*|[A-Za-z]:\\+Users\\[A-Za-z0-9._-]+\\+[^\s)"'<>`\uFF0C\u3002\u3001\uFF09\uFF1B\uFF1A\u3011\u300D\u300F]*)/;

const TRAILING_PATH_PUNCT = new Set([
  ".", ",", ";", ":", "!", "?", "*", "]", "}",
  "\u2019", "\u201D", "\uFF01", "\uFF1F", "\u300B",
]);

function trimTrailingPathPunct(str) {
  let end = str.length;
  while (end > 0 && TRAILING_PATH_PUNCT.has(str[end - 1])) {
    end -= 1;
  }
  return str.slice(0, end);
}

function safeDecodeUriComponent(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isExternalOrSpecialScheme(url) {
  return /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/.test(url);
}

function localTargetExists(docDir, cleanRel) {
  const resolvedTarget = path.resolve(docDir, cleanRel);
  const candidates = [
    resolvedTarget,
    `${resolvedTarget}.html`,
    `${resolvedTarget}.md`,
    path.join(resolvedTarget, "index.html"),
    path.join(resolvedTarget, "index.md"),
  ];
  if (candidates.some((c) => fs.existsSync(c))) {
    return true;
  }
  for (const staticSubdir of ["site", "dist", "public"]) {
    const altBase = path.resolve(docDir, "..", staticSubdir, cleanRel);
    if (
      fs.existsSync(altBase) ||
      fs.existsSync(`${altBase}.html`) ||
      fs.existsSync(path.join(altBase, "index.html"))
    ) {
      return true;
    }
  }
  return false;
}

export default definePackScripts({
  check(doc, ctx) {
    const isRenderedArtifact = ["html", "jsx", "tsx", "svg", "docx", "pptx", "pdf"].includes(
      doc.format,
    );
    const reportedLeaks = new Set();
    const reportedPaths = new Set();

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

      if (
        !url.startsWith("#") &&
        !url.startsWith("/") &&
        !url.startsWith("~/") &&
        !isExternalOrSpecialScheme(url)
      ) {
        const cleanRel = safeDecodeUriComponent(url.split("#")[0].split("?")[0]);
        if (cleanRel && doc.filePath && fs.existsSync(doc.filePath)) {
          const isExtensionlessRoute =
            doc.modality === "markup" && cleanRel.endsWith("/") && !path.extname(cleanRel.replace(/\/+$/, ""));
          if (!isExtensionlessRoute && !localTargetExists(docDir, cleanRel)) {
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

      if (LOCAL_HOME_PATH_RE.test(url)) {
        const leakKey = `${link.segmentId || "doc"}:${url}`;
        if (!reportedLeaks.has(leakKey)) {
          reportedLeaks.add(leakKey);
          reportedPaths.add(url);
          ctx.reportDefect({
            ruleId: "local-path-leak",
            severity: isRenderedArtifact ? "error" : "warning",
            targetId: link.segmentId || null,
            line: link.line,
            originalQuote: link.raw || url,
            fixSafety: "manual",
            actionType: "prompt",
            reason: `Personal or local machine filesystem path leaked in deliverable link ('${url}').`,
            rewritePrompt: "Replace local machine path with a portable relative path or public URL.",
            locator: link.locator,
          });
        }
      }
    }

    const globalLeakRe = new RegExp(LOCAL_HOME_PATH_RE.source, "g");
    for (const seg of doc.segments || []) {
      for (const m of seg.text.matchAll(globalLeakRe)) {
        const leakedPath = trimTrailingPathPunct(m[0]);
        if (!leakedPath) continue;
        const leakKey = `${seg.id}:${leakedPath}`;
        const alreadyFromLink = reportedPaths.has(leakedPath) || reportedLeaks.has(`${seg.id}:${leakedPath}`);
        if (alreadyFromLink || reportedLeaks.has(leakKey)) continue;
        reportedLeaks.add(leakKey);
        reportedPaths.add(leakedPath);
        ctx.reportDefect({
          ruleId: "local-path-leak",
          severity: isRenderedArtifact ? "error" : "warning",
          targetId: seg.id,
          line: seg.line,
          originalQuote: leakedPath,
          fixSafety: "manual",
          actionType: "prompt",
          reason: `Personal or local machine filesystem path leaked in content ('${leakedPath}').`,
          rewritePrompt: "Replace concrete local user path with a relative path, env placeholder, or public URL.",
        });
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
