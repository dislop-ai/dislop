const SENTENCE_INITIAL_STOPWORDS = new Set([
  "A",
  "An",
  "And",
  "Are",
  "As",
  "At",
  "After",
  "Although",
  "Also",
  "Because",
  "Before",
  "Beyond",
  "Both",
  "But",
  "By",
  "Certainly",
  "Despite",
  "During",
  "Each",
  "Even",
  "Every",
  "Finally",
  "First",
  "For",
  "From",
  "Furthermore",
  "Generally",
  "Given",
  "Here",
  "However",
  "If",
  "Importantly",
  "In",
  "Indeed",
  "Instead",
  "It",
  "Its",
  "Let",
  "Looking",
  "Many",
  "Meanwhile",
  "Moreover",
  "Most",
  "Naturally",
  "Needless",
  "Nevertheless",
  "Next",
  "No",
  "Nor",
  "Not",
  "Notably",
  "Now",
  "Of",
  "Often",
  "On",
  "Once",
  "One",
  "Only",
  "Or",
  "Overall",
  "Perhaps",
  "Please",
  "Rather",
  "Second",
  "Simply",
  "Since",
  "So",
  "Some",
  "Specifically",
  "Still",
  "Such",
  "Sure",
  "That",
  "The",
  "Their",
  "Then",
  "There",
  "Therefore",
  "These",
  "They",
  "This",
  "Those",
  "Though",
  "Through",
  "Thus",
  "To",
  "Today",
  "Ultimately",
  "Under",
  "Unless",
  "Unlike",
  "Until",
  "Upon",
  "Use",
  "Using",
  "We",
  "What",
  "When",
  "Where",
  "Whether",
  "Which",
  "While",
  "Who",
  "Why",
  "With",
  "Within",
  "Without",
  "Yet",
  "You",
  "Your",
]);

function normalizeNumericToken(raw) {
  return raw.replace(/,/g, "");
}

/**
 * Extract protected factual anchors from a text span:
 * - Numbers, decimals, percentages, currencies, version tags (NOT negation counts)
 * - Measurement units paired with numbers (`ms`, `KB`, `GB`, `%`, `hours`, etc.)
 * - URLs (`https://...`, `http://...`, `mailto:...`)
 * - Inline code spans (`` `...` ``)
 * - Capitalized proper nouns, acronyms (`OAuth`, `PostgreSQL`, `GDPR`, `Q3`), excluding sentence-initial stopwords
 */
export function extractProtectedFacts(text) {
  const input = String(text || "");

  // 1. Inline code spans
  const codeSpans = [];
  const codeMask = new Uint8Array(input.length);
  const codeRe = /`+([^`]+)`+/g;
  let m;
  while ((m = codeRe.exec(input)) !== null) {
    codeSpans.push(m[1].trim());
    codeMask.fill(1, m.index, m.index + m[0].length);
  }

  // 2. URLs
  const urls = [];
  const urlRe = /\bhttps?:\/\/[^\s)>\]"']+/gi;
  while ((m = urlRe.exec(input)) !== null) {
    if (codeMask[m.index]) continue;
    const cleanUrl = m[0].replace(/[.,;:!?]+$/, "");
    urls.push(cleanUrl);
    codeMask.fill(1, m.index, m.index + cleanUrl.length);
  }

  // Mask unfilled placeholder tokens ([TODO], [Company Name], {{var}}, [oaicite:1]) so resolving/deleting artifacts is never flagged
  const placeholderRe =
    /\[(?:TODO|TBD|FIXME|XXX|oaicite:\d+|turn\d+search\d+|citation:[^\]]+|Company Name|Recipient Name|Client Name|Author Name|Project Name|insert\s+[^\]]+|add\s+[^\]]+|placeholder[^\]]*|\u5f85\u8865\u5145[^\]]*|\u5f85\u586b\u5199[^\]]*|\u6b64\u5904\u63d2\u5165[^\]]*)\](?!\s*\()|\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*\}\}/gi;
  while ((m = placeholderRe.exec(input)) !== null) {
    codeMask.fill(1, m.index, m.index + m[0].length);
  }

  const unmasked = Array.from(input)
    .map((ch, idx) => (codeMask[idx] ? " " : ch))
    .join("");

  // 3. Numbers & numeric-unit compounds
  const numbers = [];
  const units = [];
  const numUnitRe =
    /(?:[$€£¥]\s*)?\b\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:\s*(?:%|ms|s|sec|mins?|hrs?|hours?|days?|weeks?|months?|years?|kb|mb|gb|tb|bps|kbps|mbps|gbps|hz|khz|mhz|ghz|px|pt|x))?\b|(?:[$€£¥]\s*)?\b\d+(?:\.\d+)?(?:\s*(?:%|ms|s|sec|mins?|hrs?|hours?|days?|weeks?|months?|years?|kb|mb|gb|tb|bps|kbps|mbps|gbps|hz|khz|mhz|ghz|px|pt|x))?(?![A-Za-z0-9_])/gi;

  while ((m = numUnitRe.exec(unmasked)) !== null) {
    const token = m[0].trim();
    const numPart = token.match(/\d[\d,]*(?:\.\d+)?/);
    if (numPart) {
      numbers.push(normalizeNumericToken(numPart[0]));
    }
    const unitPart = token.match(/(?:[$€£¥]|%|ms|s|sec|mins?|hrs?|hours?|days?|weeks?|months?|years?|kb|mb|gb|tb|bps|kbps|mbps|gbps|hz|khz|mhz|ghz|px|pt|x)$/i);
    if (unitPart) {
      units.push(unitPart[0].toLowerCase());
    }
    const prefixCurrency = token.match(/^[$€£¥]/);
    if (prefixCurrency) {
      units.push(prefixCurrency[0]);
    }
  }

  // CJK numeric units via Unicode escapes so src/ remains strictly English/ASCII
  const cjkUnitRe =
    /\d+(?:\.\d+)?\s*(?:\u4e07|\u4ebf|\u500d|\u6beb\u79d2|\u79d2|\u5206\u949f|\u5c0f\u65f6|\u5929|\u5468|\u4e2a\u6708|\u5e74|%|\u4e2a\u767e\u5206\u70b9)/g;
  while ((m = cjkUnitRe.exec(unmasked)) !== null) {
    const u = m[0].replace(/[\d.\s]+/g, "");
    if (u) units.push(u);
  }

  // 4. Capitalized proper nouns, mixed-case identifiers, and ALL-CAPS / alphanumeric acronyms (`Q3`, `GDPR`, `PostgreSQL`)
  const properNouns = [];
  const wordRe = /\b(?:[A-Z][a-zA-Z0-9]+|[A-Z]{2,}[0-9]*|[a-z]+[A-Z][a-zA-Z0-9]*)\b/g;
  while ((m = wordRe.exec(unmasked)) !== null) {
    const word = m[0];
    const idx = m.index;
    // Check if word sits at start of text or right after sentence-ending punctuation
    const beforeSlice = unmasked.slice(0, idx).trimEnd();
    const isSentenceStart =
      beforeSlice.length === 0 || /[.!?\u3002\uff01\uff1f:\uff1a"\u201c\u201d'(\[-]$/.test(beforeSlice);

    const isAllCapsOrMixed =
      /^[A-Z]{2,}[0-9]*$/.test(word) ||
      /[a-z][A-Z]/.test(word) ||
      /[A-Z].*\d|\d.*[A-Z]/.test(word);

    if (isSentenceStart && !isAllCapsOrMixed && SENTENCE_INITIAL_STOPWORDS.has(word)) {
      continue;
    }
    if (SENTENCE_INITIAL_STOPWORDS.has(word) && !isAllCapsOrMixed) {
      continue;
    }
    properNouns.push(word);
  }

  return {
    numbers,
    units,
    urls,
    codeSpans,
    properNouns: Array.from(new Set(properNouns)),
  };
}

function multisetMissing(expectedList, actualList) {
  const counts = new Map();
  for (const item of actualList) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  const missing = [];
  for (const req of expectedList) {
    const c = counts.get(req) || 0;
    if (c > 0) {
      counts.set(req, c - 1);
    } else {
      missing.push(req);
    }
  }
  return Array.from(new Set(missing));
}

/**
 * Run the Kernel Baseline Fact Gate comparing `originalText` against `candidateText`.
 * When `checkFabrication` is true (used on automated LLM `suggestedReplacement`s), also blocks
 * newly injected URLs, inline code spans, or fabricated numbers absent from `originalText`.
 */
export function verifyBaselineFacts(originalText, candidateText, { checkFabrication = false } = {}) {
  const orig = extractProtectedFacts(originalText);
  const cand = extractProtectedFacts(candidateText);
  const origRaw = String(originalText || "");
  const candRaw = String(candidateText || "");

  const reasons = [];

  const missingNums = multisetMissing(orig.numbers, cand.numbers);
  if (missingNums.length > 0) {
    reasons.push(`dropped number(s): ${missingNums.join(", ")}`);
  }

  const missingUnits = multisetMissing(orig.units, cand.units);
  if (missingUnits.length > 0) {
    reasons.push(`dropped unit/symbol(s): ${missingUnits.join(", ")}`);
  }

  const missingUrls = orig.urls.filter((u) => !cand.urls.includes(u) && !candRaw.includes(u));
  if (missingUrls.length > 0) {
    reasons.push(`dropped URL(s): ${missingUrls.join(", ")}`);
  }

  const missingCode = orig.codeSpans.filter(
    (c) => !cand.codeSpans.includes(c) && !candRaw.includes(c),
  );
  if (missingCode.length > 0) {
    reasons.push(`dropped inline code: ${missingCode.map((c) => `\`${c}\``).join(", ")}`);
  }

  const missingNouns = orig.properNouns.filter(
    (n) => !cand.properNouns.includes(n) && !candRaw.includes(n),
  );
  if (missingNouns.length > 0) {
    reasons.push(`dropped proper noun/entity: ${missingNouns.join(", ")}`);
  }

  // Deterministic anti-injection / anti-fabrication check for automated replacements
  if (checkFabrication && candRaw.trim() !== "") {
    const fabricatedUrls = cand.urls.filter((u) => !orig.urls.includes(u) && !origRaw.includes(u));
    if (fabricatedUrls.length > 0) {
      reasons.push(`injected unverified URL(s): ${fabricatedUrls.join(", ")}`);
    }

    const fabricatedCode = cand.codeSpans.filter(
      (c) => !orig.codeSpans.includes(c) && !origRaw.includes(c),
    );
    if (fabricatedCode.length > 0) {
      reasons.push(`injected unverified inline code: ${fabricatedCode.map((c) => `\`${c}\``).join(", ")}`);
    }

    const fabricatedNums = multisetMissing(cand.numbers, orig.numbers);
    if (fabricatedNums.length > 0) {
      reasons.push(`fabricated number(s): ${fabricatedNums.join(", ")}`);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    summary: reasons.join("; "),
  };
}

/**
 * Execute Step 5 Dual Post-LLM Fact Gate across all candidate items:
 * 1. Kernel Baseline Fact Gate (`verifyBaselineFacts`)
 * 2. Originating Pack Custom Gate (`pack.verifyFix(item, candidateText, doc)`)
 *
 * Items that fail either gate have `suggestedReplacement` cleared, `fixSafety` downgraded
 * to `"manual"`, and `verificationNote` attached.
 */
export async function applyDualFactGate(items, doc, activePacks) {
  const packMap = new Map(activePacks.map((p) => [p.name, p]));
  const gated = [];

  for (const item of items) {
    // Only gate items that propose an automatic/reviewable edit or deletion
    const hasReplacement = Boolean(item.suggestedReplacement && item.suggestedReplacement.trim() !== "");
    const isAutoDelete = item.actionType === "delete" && item.fixSafety !== "manual";
    if (!hasReplacement && !isAutoDelete) {
      gated.push(item);
      continue;
    }

    // Deterministic `defect` artifact deletions (chatbot wrappers & leaked tool citations) intentionally strip meta-wrappers
    if (
      item.kind === "defect" &&
      item.actionType === "delete" &&
      (item.ruleId.endsWith("/chatbot-artifact") || item.ruleId.endsWith("/chatbot-citation-leak"))
    ) {
      gated.push(item);
      continue;
    }

    const candidateText = hasReplacement ? item.suggestedReplacement : "";
    const baseline = verifyBaselineFacts(item.originalQuote, candidateText, {
      checkFabrication: hasReplacement,
    });

    if (!baseline.ok) {
      gated.push({
        ...item,
        suggestedReplacement: "",
        fixSafety: "manual",
        actionType: item.rewritePrompt ? "prompt" : item.actionType,
        verificationNote: `Fact Gate withheld replacement (${baseline.summary}).`,
      });
      continue;
    }

    const pack = packMap.get(item.pack);
    let customRejected = null;
    if (pack) {
      if (typeof pack.verifyFix === "function") {
        const res = pack.verifyFix(item, candidateText, doc);
        if (res && res.ok === false) customRejected = res;
      } else if (pack.hasScripts && typeof pack.loadScripts === "function") {
        const scriptModules = await pack.loadScripts();
        for (const sm of scriptModules) {
          if (typeof sm.verifyFix === "function") {
            const res = sm.verifyFix(item, candidateText, doc);
            if (res && res.ok === false) {
              customRejected = res;
              break;
            }
          }
        }
      }
    }

    if (customRejected) {
      gated.push({
        ...item,
        suggestedReplacement: "",
        fixSafety: "manual",
        actionType: item.rewritePrompt ? "prompt" : item.actionType,
        verificationNote: `Pack '${pack.name}' withheld replacement (${customRejected.reason || "failed custom verifyFix"}).`,
      });
      continue;
    }

    gated.push(item);
  }

  return gated;
}

/**
 * Standalone revision verification used by `dislop verify <before> <after>` and local MCP `dislop_verify`.
 */
export function verifyDocumentRevision(beforeText, afterText) {
  const factCheck = verifyBaselineFacts(beforeText, afterText);
  const secondOrderSlopHits = [];

  const regressions = [
    {
      id: "introduced-negation-slogan",
      re: /\b(?:this )?(?:isn't|is not) (?:just|merely|simply)\b[\s\S]{1,60}\bit(?:'s| is)\b/i,
      beforeRe: /\b(?:isn't|is not) (?:just|merely|simply)\b/i,
      message: "Introduced a 'not just X — it's Y' slogan frame not present in original.",
    },
    {
      id: "introduced-zh-negation-slogan",
      re: /(?:\u8fd9)?(?:\u4e0d\u662f|\u5e76\u975e)(?:\u5355\u7eaf\u7684?|\u7b80\u5355\u7684?)?[^\uff0c\u3002\uff1b\n]{1,24}[\uff0c,]\s*\u800c\u662f[^\u3002\uff01\uff1f\n]{1,36}/,
      beforeRe: /(?:\u4e0d\u662f|\u5e76\u975e)[^\uff0c\u3002\uff1b\n]{1,24}[\uff0c,]\s*\u800c\u662f/,
      message: "Introduced an unprompted Chinese 'not X, but Y' slogan pivot.",
    },
    {
      id: "introduced-placeholder",
      re: /\[(?:TODO|TBD|FIXME|insert [^\]]+)\]/i,
      beforeRe: /\[(?:TODO|TBD|FIXME|insert [^\]]+)\]/i,
      message: "Introduced an unfilled bracketed placeholder into revised text.",
    },
  ];

  for (const rule of regressions) {
    if (rule.re.test(afterText) && !rule.beforeRe.test(beforeText)) {
      secondOrderSlopHits.push({ id: rule.id, message: rule.message });
    }
  }

  const ok = factCheck.ok && secondOrderSlopHits.length === 0;
  return {
    ok,
    droppedFacts: factCheck.reasons,
    regressions: secondOrderSlopHits,
  };
}
