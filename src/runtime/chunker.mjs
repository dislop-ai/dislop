/**
 * Estimate token count conservatively across Latin and CJK scripts.
 */
export function estimateTokens(text) {
  const s = String(text || "");
  if (!s) return 0;
  const cjk = (s.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
  const other = s.length - cjk;
  return Math.ceil(cjk / 1.5 + other / 3.6);
}

/**
 * Partition `doc.segments` along paragraph boundaries with a 1-paragraph read-only
 * lookbehind (`[CTX-P{k}]`) whenever input exceeds `maxInputTokens`.
 */
export function buildSlidingWindowChunks(doc, { maxInputTokens = 12000, reservedOverheadTokens = 1800 } = {}) {
  const segments = doc.segments || [];
  if (segments.length === 0) return [];

  const budget = Math.max(600, maxInputTokens - reservedOverheadTokens);

  // Group segments by paragraphId preserving document order
  const paraGroups = [];
  let currentGroup = null;
  for (const seg of segments) {
    if (!currentGroup || currentGroup.paragraphId !== seg.paragraphId) {
      currentGroup = {
        paragraphId: seg.paragraphId,
        segments: [],
        tokens: 0,
      };
      paraGroups.push(currentGroup);
    }
    currentGroup.segments.push(seg);
    currentGroup.tokens += estimateTokens(`[${seg.id}] ${seg.text}\n`);
  }

  const totalTokens = paraGroups.reduce((acc, g) => acc + g.tokens, 0);
  if (totalTokens <= budget) {
    return [
      {
        chunkIndex: 0,
        readonlyContext: [],
        segments: [...segments],
      },
    ];
  }

  const chunks = [];
  let currentParas = [];
  let currentTokens = 0;
  let prevLastParagraph = null;

  const flushChunk = () => {
    if (currentParas.length === 0) return;
    const readonlyContext = prevLastParagraph
      ? [
          {
            ctxId: `CTX-${prevLastParagraph.paragraphId}`,
            paragraphId: prevLastParagraph.paragraphId,
            text: prevLastParagraph.segments.map((s) => s.text).join(" "),
          },
        ]
      : [];

    chunks.push({
      chunkIndex: chunks.length,
      readonlyContext,
      segments: currentParas.flatMap((g) => g.segments),
    });

    prevLastParagraph = currentParas[currentParas.length - 1];
    currentParas = [];
    currentTokens = 0;
  };

  for (const grp of paraGroups) {
    if (currentParas.length > 0 && currentTokens + grp.tokens > budget) {
      flushChunk();
    }
    currentParas.push(grp);
    currentTokens += grp.tokens;
  }
  flushChunk();

  return chunks;
}
