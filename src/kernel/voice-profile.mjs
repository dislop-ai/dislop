import fs from "node:fs";
import { computeFilesFingerprint, readJsonFileStrict, writeJsonFileSecure } from "./config.mjs";
import { parseDocumentFile } from "./document-model.mjs";

const EN_CONNECTORS = [
  "however",
  "instead",
  "because",
  "though",
  "meanwhile",
  "still",
  "yet",
  "for example",
  "in practice",
  "specifically",
];

// Unicode-escaped common CJK connectors so src/ stays pure English/ASCII
const ZH_CONNECTORS = [
  "\u4e0d\u8fc7",
  "\u5176\u5b9e",
  "\u56e0\u6b64",
  "\u6240\u4ee5",
  "\u6bd4\u5982",
  "\u6362\u53e5\u8bdd\u8bf4",
  "\u53cd\u8fc7\u6765",
  "\u5b9e\u9645\u4e0a",
  "\u53e6\u5916",
  "\u540c\u65f6",
];

/**
 * Extract a deterministic personal style baseline from hand-written reference files,
 * optionally enriched by an LLM route when provided.
 */
export async function extractVoiceProfile(referenceFiles, { route = null } = {}) {
  const existingFiles = referenceFiles.filter((fp) => fs.existsSync(fp) && fs.statSync(fp).isFile());
  if (existingFiles.length === 0) {
    throw new Error("No readable reference files found for voice profile extraction.");
  }

  const fingerprint = computeFilesFingerprint(existingFiles);
  const allSentences = [];
  let zhCount = 0;

  for (const fp of existingFiles) {
    const doc = parseDocumentFile(fp);
    if (doc.language === "zh") zhCount += 1;
    for (const seg of doc.segments) {
      if (seg.text.trim().length >= 4) {
        allSentences.push(seg.text.trim());
      }
    }
  }

  const primaryLang = zhCount > existingFiles.length / 2 ? "zh" : "en";
  const lengths = allSentences.map((s) =>
    primaryLang === "zh" ? s.replace(/\s+/g, "").length : s.split(/\s+/).filter(Boolean).length,
  );
  const meanLen =
    lengths.length > 0 ? Math.round((lengths.reduce((a, b) => a + b, 0) / lengths.length) * 10) / 10 : 0;
  const variance =
    lengths.length > 1
      ? lengths.reduce((acc, v) => acc + (v - meanLen) ** 2, 0) / lengths.length
      : 0;
  const stdLen = Math.round(Math.sqrt(variance) * 10) / 10;

  const corpusLower = allSentences.join("\n").toLowerCase();
  const candidates = primaryLang === "zh" ? ZH_CONNECTORS : EN_CONNECTORS;
  const connectorHits = candidates
    .map((c) => {
      const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = primaryLang === "zh" ? new RegExp(escaped, "g") : new RegExp(`\\b${escaped}\\b`, "gi");
      const count = (corpusLower.match(re) || []).length;
      return { c, count };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((x) => x.c);

  const firstPersonCount = (
    allSentences.join(" ").match(primaryLang === "zh" ? /\u6211|\u6211\u4eec/g : /\b(?:I|we|my|our)\b/g) || []
  ).length;

  const unitLabel = primaryLang === "zh" ? "chars" : "words";
  const voiceAnchors = [];
  if (firstPersonCount >= 2) {
    voiceAnchors.push("Preserve direct first-person voice");
  }
  if (stdLen > meanLen * 0.45 && lengths.length >= 3) {
    voiceAnchors.push(
      `Preserve varied short-and-long sentence rhythm (mean ${meanLen} ${unitLabel}, sd ${stdLen})`,
    );
  } else if (meanLen > 0) {
    voiceAnchors.push(`Keep concise sentence cadence (mean ~${meanLen} ${unitLabel})`);
  }

  let summary = `Personal voice profile derived from ${existingFiles.length} reference file(s) (${allSentences.length} sentences, mean ${meanLen} ${unitLabel}).`;

  if (route && typeof route.execute === "function" && allSentences.length > 0) {
    try {
      const sampleSlice = allSentences.slice(0, 30).join("\n");
      const parsed = await route.execute(
        {
          systemPrompt:
            "Summarize the author's recurring prose habits in JSON: {\"summary\": string, \"voiceAnchors\": string[], \"preferredConnectors\": string[]}. Be concise and factual.",
          userPrompt: sampleSlice,
        },
        { filePath: existingFiles[0], format: "md", language: primaryLang },
        [],
      );
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.summary === "string" && parsed.summary.trim()) {
          summary = parsed.summary.trim();
        }
        if (Array.isArray(parsed.voiceAnchors) && parsed.voiceAnchors.length > 0) {
          for (const a of parsed.voiceAnchors.slice(0, 4)) {
            if (typeof a === "string" && a.trim()) voiceAnchors.push(a.trim());
          }
        }
      }
    } catch {
      // Fall back cleanly to deterministic statistical voice profile
    }
  }

  return {
    schema: "dislop.voice/1",
    updatedAt: new Date().toISOString(),
    language: primaryLang,
    fingerprint,
    referenceFiles: existingFiles,
    sentenceStats: {
      count: allSentences.length,
      meanLength: meanLen,
      stdDev: stdLen,
    },
    summary,
    voiceAnchors: Array.from(new Set(voiceAnchors)),
    preferredConnectors: connectorHits,
  };
}

/**
 * Load cached `voice.json` if `fingerprint` matches current reference files;
 * otherwise extract and write updated cache.
 */
export async function resolveOrExtractVoiceProfile(config, { route = null } = {}) {
  const refFiles = (config.voice?.referenceFiles || []).filter((fp) => fs.existsSync(fp));
  const cachePath = config.voice?.cachePath;

  if (refFiles.length === 0) {
    if (cachePath && fs.existsSync(cachePath)) {
      return readJsonFileStrict(cachePath);
    }
    return null;
  }

  const currentFp = computeFilesFingerprint(refFiles);
  if (cachePath && fs.existsSync(cachePath)) {
    try {
      const cached = readJsonFileStrict(cachePath);
      if (cached && cached.fingerprint === currentFp) {
        return cached;
      }
    } catch {
      // regenerate corrupted voice cache
    }
  }

  const extracted = await extractVoiceProfile(refFiles, { route });
  if (cachePath) {
    writeJsonFileSecure(cachePath, extracted, { mode: 0o600 });
  }
  return extracted;
}
