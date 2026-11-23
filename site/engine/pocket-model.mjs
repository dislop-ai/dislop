/**
 * Zero-dependency Bundled Pocket Traditional ML Engine (`dislop.pocket-model/1`).
 * Runs two built-in offline models (<15 KB gzipped JSON, <0.5 ms per paragraph, 0 network):
 *   1. `pocket-slop-ensemble`: De-lexicalized INT8 N-gram Log-Odds LM + Calibrated 24-Feature
 *      Linear Attribution + 45-Tree Shallow GBDT Paragraph/Prose Slop Scorer.
 *   2. `pocket-pack-router`: Quantized INT8 Multinomial Log-Odds 5-Domain Pack Classifier.
 *
 * Bit-for-bit aligned with Python `src/dislop/pocket_model.py`.
 */

let _cachedBundle = null;

export function preparePocketModelBundle(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("dislop pocket model bundle must be passed in browser mode.");
  }
  if (!raw._enFuncSet) raw._enFuncSet = new Set(raw.enFuncWords || []);
  if (!raw._zhStructSet) raw._zhStructSet = new Set(Array.from(raw.zhStructChars || ""));
  return raw;
}

export function setPocketModelBundle(bundle) {
  _cachedBundle = preparePocketModelBundle(bundle);
  return _cachedBundle;
}

export function loadPocketModelBundle(customBundle = null) {
  if (customBundle && typeof customBundle === "object") return preparePocketModelBundle(customBundle);
  if (_cachedBundle) return _cachedBundle;
  throw new Error("dislop pocket model bundle not initialized.");
}

function cpLen(s) {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
}

function round4(v) {
  const scaled = v * 10000.0;
  const fl = Math.floor(scaled);
  const rounded = scaled - fl >= 0.5 ? fl + 1 : fl;
  const res = rounded / 10000.0;
  return Object.is(res, -0) ? 0 : res;
}

function maxOf(arr) {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i += 1) {
    if (arr[i] > m) m = arr[i];
  }
  return m;
}

const FENCE_BLOCK_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const DISLOP_QUOTE_BLOCK_RE = /<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->/gi;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const HTML_TAG_RE = /<\/?[A-Za-z][^>\n]{0,400}>/g;

const INLINE_CODE_RE = /`[^`\n]+`/g;
const MD_LINK_COUNT_RE = /\[[^\[\]\n]{1,240}\]\([^()\s\n]{1,360}\)/g;
const MD_LINK_REPLACE_RE = /\[([^\[\]\n]{1,240})\]\([^()\s\n]{1,360}\)/g;
const BARE_URL_RE = /https?:\/\/[^\s)>\]"']+/g;
const CITATION_AUTHOR_RE = /\([A-Z][A-Za-z-]{1,30}(?:\s+et\s+al\.)?,?\s*(?:19|20)[0-9]{2}[a-z]?(?:[;,]\s*[^()\n]{1,80})?\)/g;
const CITATION_BRACKET_RE = /\[[0-9]{1,4}(?:\s*[,-]\s*[0-9]{1,4}){0,20}\]/g;
const PAREN_QUOTE_RE = /[（(]\s*[“"「『][^（(”"」』\n]{6,160}[”"」』]\s*[)）]/gu;
const EXAMPLE_QUOTE_RE = /(?:例如|比如|如|e\.g\.|such as)\s*[：:,，]?\s*[“"「『][^”"」』\n]{6,160}[”"」』]/giu;
const TAG_STRIP_RE = /<(?:CODE|URL)>/g;
const CJK_RE = /[\u4e00-\u9fff]/g;
const EN_WORD_RE = /[A-Za-z]+/g;
const EN_ALNUM_RE = /[A-Za-z0-9]+/g;
const NUM_MASK_RE = /(?<![A-Za-z0-9])[0-9]+(?:[.,:/-][0-9]+)*%?(?![A-Za-z0-9])/g;
const NUM_HIT_RE = /(?<![A-Za-z0-9])[0-9]+(?:[.,:][0-9]+)?%?(?![A-Za-z0-9])/g;
const TOKEN_SCAN_RE = /<(?:CODE|URL|NUM)>|[A-Za-z]+|[\u4e00-\u9fff]|[，。！？；：、,.!?;:—\-]/g;
const LEX_TOK_RE = /[\u4e00-\u9fff]|[a-z]{2,}/g;

const EN_NUM_TIME_RE = /(?<![A-Za-z])(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|last\s+week)(?![A-Za-z])/gi;
const ZH_NUM_TIME_RE = /(?:[一二三四五六七八九十两百千万]+[天月年次个张条座块斤米秒分时点]|周[一二三四五六日天]|昨天|昨晚|今早|上周|下周)/g;
const PATH_HIT_RE = /[./\\][A-Za-z0-9._/-]+\.[a-z]{1,6}(?![A-Za-z])/g;

const EN_ABSTRACT_RE = /(?<![A-Za-z])[A-Za-z]{4,}(?:tion|tions|sion|sions|ment|ments|ity|ities|ness|ance|ence|ization|isation)(?![A-Za-z])/gi;
const EN_GERUND_OPENER_RE = /(?:^|[.!?]\s+)(?:By\s+[a-z]+ing|[A-Z][a-z]+ing\s+[a-z]+)(?![A-Za-z])/g;
const EN_CUSHION_RE = /(?<![A-Za-z])(?:plays?\s+an?\s+(?:important|key|vital|critical|central|meaningful)\s+role|provides?\s+(?:meaningful|valuable|important|actionable)\s+(?:context|insights?|guidance)|often\s+(?:notice|require|involves?|leads?\s+to|helps?)|helps?\s+[a-z]+\s+(?:focus|maintain|reduce|build|navigate|cultivate)|supports?\s+(?:steady|long-term|sustainable|effective|productive)|contributes?\s+(?:directly\s+)?to|minimizes?\s+unexpected|enabling\s+[a-z]+\s+to|while\s+(?:maintaining|preserving|enabling|supporting|ensuring|strengthening)|greater\s+confidence|shared\s+visibility|operational\s+(?:progress|observations)|rather\s+than\s+isolated\s+assumptions|when\s+additional\s+resources\s+are\s+required|quiet\s+sense\s+of|creating\s+a\s+[a-z]+\s+rhythm\s+that)(?![A-Za-z])/gi;

const ZH_NOMINAL_FRAME_RE = /(?:在[^，。！？\n]{2,14}的(?:过程|背景|环境|节奏|框架|语境)[中里]|之[中后前下]|的(?:打磨|推进|演进|提升|构建|平衡点|割裂感|积极意义|重要前提|良好基础))/g;
const ZH_CUSHION_RE = /(?:往往(?:能够|需要|是|会)|能够在[^，。]{2,10}中|在很大程度上|潜移默化中|不可忽视的|恰到好处的|平稳有序|稳步提升|奠定(?:了)?(?:良好|坚实)?基础|具有[^，。]{2,8}意义|重要前提|独特气息|柔和的倒影|不知不觉中)/g;
const ZH_COLLOQUIAL_CONCRETE_RE = /(?:砍掉|顺手|盯|摸了摸|揣进|烫着|铁桶|三轮车|报刊亭|置顶|标红|吞成|卡点|踩的|坑|锁死|别写成)/g;
const EN_DIRECT_CONCRETE_RE = /(?<![A-Za-z])(?:we\s+stopped|never\s+[a-z]+|delete\s+the|way\s+more\s+than|last\s+week|yesterday|three\s+in\s+the\s+morning|hoses\s+down|burnt\s+sugar|wet\s+cardboard)(?![A-Za-z])/gi;
const ZH_DIRECT_PRON_RE = /[我你咱们别]/g;
const PUNCT_CHAR_RE = /[，。！？；：、,.!?;:—\-()（）“”"']/g;
const EMDASH_RE = /——|—/g;

const EN_CUSHION_WORDS = new Set([
  "often", "typically", "effectively", "seamlessly", "steadily", "proactively",
  "ensure", "ensures", "ensuring", "enable", "enables", "enabling", "foster",
  "fostering", "enhance", "enhancing", "streamline", "navigate", "leverage",
  "meaningful", "actionable", "sustainable", "holistic", "comprehensive",
]);
const EN_DIRECT_WORDS = new Set([
  "i", "we", "you", "my", "our", "your", "never", "stop", "delete", "ship", "shipped", "broke",
]);

const DRIVER_LABELS = {
  ngram_llr_mean: {
    en: "predictable structural & transition phrasing",
    zh: "句式衔接高度顺滑可预测",
  },
  ngram_llr_max_sent: {
    en: "high-template sentence skeleton",
    zh: "单句呈高频模板化骨架",
  },
  concreteness: {
    en: "low concrete anchors (few numbers, dates, files, or citations)",
    zh: "缺少具体事实锚点（数字、时间、文件名或出处）",
  },
  en_abstract_noun_rate: {
    en: "dense abstract nominalizations (-tion/-ment/-ity/-ness)",
    zh: "抽象名词化后缀密集",
  },
  en_func_cushion_rate: {
    en: "hedged corporate cushion verbs/adverbs",
    zh: "堆叠温和缓冲动词与副词",
  },
  en_cushion_phrase_rate: {
    en: "stock framing phrases (plays a role / supports steady...)",
    zh: "套用公关过渡短语",
  },
  en_gerund_opener_rate: {
    en: "participial/gerund sentence openers (By -ing / Maintaining...)",
    zh: "分词结构机械起句",
  },
  zh_nominal_frame_rate: {
    en: "nominalized wrapper frames (在…的过程中 / …的推进)",
    zh: "套用「在……的过程中 / ……的推进」名词化外壳",
  },
  zh_cushion_phrase_rate: {
    en: "soft filler cushions (往往能够 / 稳步提升 / 不可忽视)",
    zh: "堆叠「往往能够 / 稳步提升」缓冲套话",
  },
  zh_de_particle_rate: {
    en: "heavy modifier chains (的)",
    zh: "「的」字修饰链偏密",
  },
  sent_cv: {
    en: "uniform sentence lengths",
    zh: "句长起伏偏平",
  },
  clause_cv: {
    en: "metronomic comma-clause lengths",
    zh: "逗号分句长短过于整齐",
  },
  pronoun_imperative_rate: {
    en: "impersonal passive distance (no direct actor or action)",
    zh: "缺少明确主语和直接动作",
  },
};

function countMatches(str, re) {
  const m = str.match(re);
  return m ? m.length : 0;
}

function stripFencedBlocksLinear(raw) {
  const lines = String(raw || "").split("\n");
  const out = [];
  let fenceMarker = null;
  for (const ln of lines) {
    const trimmed = ln.trim();
    if (!fenceMarker) {
      if (trimmed.startsWith("```")) {
        fenceMarker = "```";
        continue;
      }
      if (trimmed.startsWith("~~~")) {
        fenceMarker = "~~~";
        continue;
      }
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) continue;
      out.push(ln);
    } else if (trimmed.startsWith(fenceMarker)) {
      fenceMarker = null;
    }
  }
  return out.join("\n");
}

export function cleanProseSurface(raw) {
  let s = String(raw || "").replace(/^\uFEFF/, "").replace(/\uFEFF/g, " ");
  s = s.replace(/^[ \t]*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/, " ");
  s = s.replace(DISLOP_QUOTE_BLOCK_RE, " ");
  s = s.replace(HTML_COMMENT_RE, " ");
  s = stripFencedBlocksLinear(s);
  s = s.replace(HTML_TAG_RE, " ");

  const inlineCodes = countMatches(s, INLINE_CODE_RE);
  const mdLinks = countMatches(s, MD_LINK_COUNT_RE);
  const bareUrls = countMatches(s, BARE_URL_RE);
  const citations = countMatches(s, CITATION_AUTHOR_RE) + countMatches(s, CITATION_BRACKET_RE);
  const techAnchors = inlineCodes + mdLinks + bareUrls + citations;

  s = s.replace(PAREN_QUOTE_RE, " ");
  s = s.replace(EXAMPLE_QUOTE_RE, " ");

  s = s.replace(MD_LINK_REPLACE_RE, "$1 <URL> ");
  s = s.replace(BARE_URL_RE, " <URL> ");
  s = s.replace(INLINE_CODE_RE, " <CODE> ");

  const proseOnly = s.replace(TAG_STRIP_RE, " ");
  const cjkN = countMatches(proseOnly, CJK_RE);
  const enN = countMatches(proseOnly, EN_WORD_RE);
  const units = cjkN * 0.6 + enN;
  const sents = proseOnly
    .split(/[。！？.!?\n]+/)
    .map((p) => p.trim())
    .filter((p) => cpLen(p) >= 4);
  const eligible = sents.length >= 2 && units >= 26.0 ? 1 : 0;
  return { surface: s, techAnchors, eligible, units, sentCount: sents.length };
}

export function delexicalizeTokens(raw, bundle) {
  const { surface } = cleanProseSurface(raw);
  const s = surface.replace(NUM_MASK_RE, " <NUM> ");
  const enFuncSet = bundle._enFuncSet;
  const suffixes = bundle.enAbstractSuffixes || [];
  const zhStructSet = bundle._zhStructSet;
  const tokens = [];

  const matches = s.match(TOKEN_SCAN_RE) || [];
  for (const tok of matches) {
    const c0 = tok[0];
    if (c0 === "<") {
      tokens.push(tok);
    } else if ((c0 >= "A" && c0 <= "Z") || (c0 >= "a" && c0 <= "z")) {
      const low = tok.toLowerCase();
      if (enFuncSet.has(low)) {
        tokens.push("en:" + low);
      } else {
        let matchedSuf = null;
        if (low.length >= 6) {
          for (const suf of suffixes) {
            if (low.endsWith(suf)) {
              matchedSuf = suf;
              break;
            }
          }
        }
        if (matchedSuf) {
          tokens.push("suf:" + matchedSuf);
        } else if (low.endsWith("ing") && low.length >= 6) {
          tokens.push("suf:ing");
        } else if (low.endsWith("ly") && low.length >= 5) {
          tokens.push("suf:ly");
        } else if (low.endsWith("ed") && low.length >= 5) {
          tokens.push("suf:ed");
        } else if (low.length <= 4) {
          tokens.push("en:<WS>");
        } else {
          tokens.push("en:<WC>");
        }
      }
    } else if (c0 >= "\u4e00" && c0 <= "\u9fff") {
      tokens.push(zhStructSet.has(tok) ? "zh:" + tok : "zh:<H>");
    } else {
      tokens.push("p:" + tok);
    }
  }
  return tokens;
}

function extractNgrams(delexTokens) {
  const feats = [];
  const n = delexTokens.length;
  for (let i = 0; i < n; i += 1) {
    const t1 = delexTokens[i];
    if (t1 !== "en:<WC>" && t1 !== "en:<WS>" && t1 !== "zh:<H>") {
      feats.push(t1);
    }
    if (i + 1 < n) {
      feats.push(t1 + "|" + delexTokens[i + 1]);
    }
    if (i + 2 < n) {
      feats.push(t1 + "|" + delexTokens[i + 1] + "|" + delexTokens[i + 2]);
    }
  }
  return feats;
}

function scoreLmSpan(text, bundle) {
  const toks = delexicalizeTokens(text, bundle);
  if (toks.length === 0) return 0.0;
  const uniqueNgs = Array.from(new Set(extractNgrams(toks))).sort();
  if (uniqueNgs.length === 0) return 0.0;
  const weights = bundle.ngramLm.weightsInt8;
  const scale = bundle.ngramLm.scale;
  let total = 0.0;
  for (const g of uniqueNgs) {
    if (Object.hasOwn(weights, g)) {
      total += weights[g] * scale;
    }
  }
  return total / Math.sqrt(uniqueNgs.length + 8.0);
}

function scoreLmFeatures(text, bundle) {
  const whole = scoreLmSpan(text, bundle);
  const { surface } = cleanProseSurface(text);
  const sents = surface
    .split(/[。！？.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => cpLen(s) >= 4);
  if (sents.length === 0) return [whole, whole, 0.0];
  const sScores = sents.map((s) => scoreLmSpan(s, bundle));
  const meanS = sScores.reduce((a, b) => a + b, 0) / sScores.length;
  const maxS = maxOf(sScores);
  let stdS = 0.0;
  if (sScores.length >= 2) {
    const variance = sScores.reduce((acc, x) => acc + (x - meanS) ** 2, 0) / sScores.length;
    stdS = Math.sqrt(variance);
  }
  return [whole, maxS, stdS];
}

export function extractPocketFeatures(text, bundle) {
  preparePocketModelBundle(bundle);
  const raw = String(text || "");
  const { surface, techAnchors, eligible } = cleanProseSurface(raw);
  const noTags = surface.replace(TAG_STRIP_RE, " ");

  const cjkChars = noTags.match(CJK_RE) || [];
  const enWords = noTags.match(EN_WORD_RE) || [];
  const units = Math.max(1.0, cjkChars.length * 0.6 + enWords.length);

  const sents = noTags
    .split(/[。！？.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => cpLen(s) >= 3);
  const sentLens = sents
    .map((s) => countMatches(s, CJK_RE) * 0.6 + countMatches(s, EN_ALNUM_RE))
    .filter((x) => x > 0);
  const nSents = sentLens.length;
  let meanS = 0.0;
  let sentCv = 0.38;
  let adjDiff = 0.38;
  if (nSents >= 2) {
    meanS = sentLens.reduce((a, b) => a + b, 0) / nSents;
    const stdS = Math.sqrt(sentLens.reduce((acc, x) => acc + (x - meanS) ** 2, 0) / nSents);
    sentCv = meanS > 0 ? stdS / meanS : 0.0;
    let diffSum = 0.0;
    for (let i = 1; i < nSents; i += 1) {
      diffSum += Math.abs(sentLens[i] - sentLens[i - 1]);
    }
    adjDiff = diffSum / ((nSents - 1) * Math.max(1.0, meanS));
  } else if (nSents === 1) {
    meanS = sentLens[0];
  }

  const clauses = noTags
    .split(/[，,；;：:。！？.!?\n]+/)
    .map((c) => c.trim())
    .filter((c) => cpLen(c) >= 2);
  const clauseLens = clauses
    .map((c) => countMatches(c, CJK_RE) * 0.6 + countMatches(c, EN_ALNUM_RE))
    .filter((x) => x > 0);
  let clauseCv = 0.42;
  if (clauseLens.length >= 3) {
    const mc = clauseLens.reduce((a, b) => a + b, 0) / clauseLens.length;
    const sc = Math.sqrt(clauseLens.reduce((acc, x) => acc + (x - mc) ** 2, 0) / clauseLens.length);
    clauseCv = mc > 0 ? sc / mc : 0.0;
  }

  const lexToks = noTags.toLowerCase().match(LEX_TOK_RE) || [];
  const nTok = lexToks.length;
  let mattr = 0.0;
  if (nTok > 25) {
    let winSum = 0.0;
    let winCount = 0;
    for (let i = 0; i <= nTok - 25; i += 5) {
      winSum += new Set(lexToks.slice(i, i + 25)).size / 25.0;
      winCount += 1;
    }
    mattr = winSum / winCount;
  } else {
    mattr = new Set(lexToks).size / Math.max(1, nTok);
  }

  let bigramRep = 0.0;
  if (nTok >= 2) {
    const bgs = [];
    for (let i = 0; i < nTok - 1; i += 1) {
      bgs.push(lexToks[i] + "_" + lexToks[i + 1]);
    }
    bigramRep = 1.0 - new Set(bgs).size / bgs.length;
  }

  const numHits = countMatches(noTags, NUM_HIT_RE);
  const enNumTime = countMatches(noTags, EN_NUM_TIME_RE);
  const zhNumTime = countMatches(noTags, ZH_NUM_TIME_RE);
  const pathHits = countMatches(raw, PATH_HIT_RE);
  const concreteness = ((numHits + enNumTime + zhNumTime + pathHits + techAnchors) / units) * 100.0;
  const codeUrlDensity = (techAnchors / units) * 100.0;

  const nEn = Math.max(1, enWords.length);
  const enAbs = enWords.length >= 5 ? (countMatches(noTags, EN_ABSTRACT_RE) / nEn) * 100.0 : 0.0;
  const enCushWords = enWords.filter((w) => EN_CUSHION_WORDS.has(w.toLowerCase())).length;
  const enFuncCush = enWords.length >= 5 ? (enCushWords / nEn) * 100.0 : 0.0;
  const enGerund = enWords.length >= 5 ? countMatches(noTags, EN_GERUND_OPENER_RE) / Math.max(1, nSents) : 0.0;
  const enCushPhrase = (countMatches(noTags, EN_CUSHION_RE) / units) * 100.0;

  const nZh = Math.max(1, cjkChars.length);
  const deCount = (noTags.match(/的/g) || []).length;
  const zhDe = cjkChars.length >= 8 ? (deCount / nZh) * 100.0 : 0.0;
  const zhNom = cjkChars.length >= 8 ? (countMatches(noTags, ZH_NOMINAL_FRAME_RE) / units) * 100.0 : 0.0;
  const zhCush = cjkChars.length >= 8 ? (countMatches(noTags, ZH_CUSHION_RE) / units) * 100.0 : 0.0;
  const zhStructRatio =
    cjkChars.length >= 8
      ? cjkChars.filter((c) => bundle._zhStructSet.has(c)).length / nZh
      : 0.5;

  const enDirect =
    enWords.filter((w) => EN_DIRECT_WORDS.has(w.toLowerCase())).length +
    countMatches(noTags, EN_DIRECT_CONCRETE_RE);
  const zhDirect = countMatches(noTags, ZH_DIRECT_PRON_RE) + countMatches(noTags, ZH_COLLOQUIAL_CONCRETE_RE);
  const pronounImp = ((enDirect + zhDirect) / units) * 100.0;

  const punctChars = noTags.match(PUNCT_CHAR_RE) || [];
  const punctVar =
    punctChars.length > 0 ? new Set(punctChars).size / Math.max(1.0, Math.sqrt(punctChars.length)) : 0.0;
  const semiCount = (noTags.match(/;/g) || []).length + (noTags.match(/；/g) || []).length;
  const semiEm = ((semiCount + countMatches(noTags, EMDASH_RE)) / units) * 100.0;

  const [llrMean, llrMax, llrStd] = scoreLmFeatures(raw, bundle);

  const features = [
    Math.log1p(units),
    nSents,
    meanS,
    sentCv,
    adjDiff,
    clauseCv,
    mattr,
    bigramRep,
    concreteness,
    codeUrlDensity,
    enAbs,
    enFuncCush,
    enGerund,
    enCushPhrase,
    zhDe,
    zhNom,
    zhCush,
    zhStructRatio,
    pronounImp,
    punctVar,
    semiEm,
    llrMean,
    llrMax,
    llrStd,
  ];
  return { features, eligible };
}

function sigmoid(x) {
  const clamped = Math.max(-30.0, Math.min(30.0, x));
  return 1.0 / (1.0 + Math.exp(-clamped));
}

function inferGbdt(gbdtJson, feats) {
  let raw = gbdtJson.init;
  const lr = gbdtJson.lr;
  for (const nodes of gbdtJson.trees) {
    let idx = 0;
    while (nodes[idx].v === undefined) {
      const nd = nodes[idx];
      idx = feats[nd.f] <= nd.t ? nd.l : nd.r;
    }
    raw += lr * nodes[idx].v;
  }
  return sigmoid(raw);
}

export function scorePocketSpan(text, customBundle = null) {
  const bundle = preparePocketModelBundle(customBundle || loadPocketModelBundle());
  const { features, eligible } = extractPocketFeatures(text, bundle);
  if (!eligible) {
    return {
      eligible: false,
      slopProbability: 0,
      linearProbability: 0,
      gbdtProbability: 0,
      band: "short-or-non-prose",
      topDrivers: [],
    };
  }
  const lin = bundle.linear;
  const zVec = features.map((v, i) => (v - lin.mean[i]) / lin.scale[i]);
  let logit = lin.intercept;
  const contribs = [];
  const fNames = bundle.featureNames;
  for (let i = 0; i < zVec.length; i += 1) {
    const c = zVec[i] * lin.coef[i];
    logit += c;
    const fname = fNames[i];
    if (c > 0.08 && Object.hasOwn(DRIVER_LABELS, fname)) {
      contribs.push({
        feature: fname,
        impact: round4(c),
        reason: DRIVER_LABELS[fname],
      });
    }
  }
  contribs.sort((a, b) => b.impact - a.impact);
  const pLin = sigmoid(logit);
  const pGbdt = inferGbdt(bundle.gbdt, features);
  const prob = round4(bundle.ensembleWeights.linear * pLin + bundle.ensembleWeights.gbdt * pGbdt);
  const stealthThr = bundle.thresholds?.stealthWarning ?? 0.755;
  const advThr = bundle.thresholds?.advisory ?? 0.62;
  const band = prob >= stealthThr ? "high" : prob >= advThr ? "elevated" : "clean";

  return {
    eligible: true,
    slopProbability: prob,
    linearProbability: round4(pLin),
    gbdtProbability: round4(pGbdt),
    band,
    topDrivers: contribs.slice(0, 3),
  };
}

export function predictPackWithPocketRouter(text, customBundle = null) {
  const bundle = preparePocketModelBundle(customBundle || loadPocketModelBundle());
  const router = bundle.packRouter;
  const packs = router.packs;
  const scores = new Array(packs.length).fill(0.0);
  const low = String(text || "").toLowerCase();
  const seen = new Set();

  const enMatches = low.match(/[a-z][a-z0-9_-]{2,22}/g) || [];
  for (const w of enMatches) seen.add(w);
  const zhSegs = low.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const seg of zhSegs) {
    const chars = Array.from(seg);
    for (let i = 0; i < chars.length - 1; i += 1) {
      seen.add(chars[i] + chars[i + 1]);
    }
  }

  let matchedTokens = 0;
  const weightsMap = router.weightsInt8;
  for (const tok of Array.from(seen).sort()) {
    if (!Object.hasOwn(weightsMap, tok)) continue;
    const wVec = weightsMap[tok];
    matchedTokens += 1;
    for (let k = 0; k < packs.length; k += 1) {
      scores[k] += wVec[k] * router.scale;
    }
  }

  if (matchedTokens === 0) {
    return {
      recommendedPack: "business-brief",
      confidence: round4(1.0 / packs.length),
      matchedSignals: 0,
      scores: Object.fromEntries(packs.map((p) => [p, round4(1.0 / packs.length)])),
    };
  }

  const normFactor = 1.0 / Math.sqrt(matchedTokens + 3.0);
  const scaled = scores.map((s) => s * normFactor);
  const maxLogit = maxOf(scaled);
  const exps = scaled.map((s) => Math.exp(s - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);

  let bestIdx = 0;
  for (let i = 1; i < probs.length; i += 1) {
    if (probs[i] > probs[bestIdx]) bestIdx = i;
  }

  return {
    recommendedPack: packs[bestIdx],
    confidence: round4(probs[bestIdx]),
    matchedSignals: matchedTokens,
    scores: Object.fromEntries(packs.map((p, i) => [p, round4(probs[i])])),
  };
}

function maskNewlinePreserving(text) {
  return String(text || "")
    .replace(/^\uFEFF?[ \t]*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/, (m) => m.replace(/[^\n]/g, " "))
    .replace(DISLOP_QUOTE_BLOCK_RE, (m) => m.replace(/[^\n]/g, " "))
    .replace(HTML_COMMENT_RE, (m) => m.replace(/[^\n]/g, " "));
}

function isUiShortLineStack(lines) {
  if (!lines || lines.length < 3) return false;
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  if (nonEmpty.length < 3) return false;
  const shortCount = nonEmpty.filter((l) => cpLen(l) <= 16).length;
  return shortCount * 2 >= nonEmpty.length;
}

function splitParagraphBlocks(raw, meta = null) {
  const text = maskNewlinePreserving(raw);
  const blocks = [];
  let suppressedUiCount = 0;
  let lineNo = 1;
  let idx = 0;
  const lines = text.split("\n");
  let curLines = [];
  let curStartOffset = 0;
  let curStartLine = 1;
  let fenceMarker = null;

  const flush = (endOffset, endLine) => {
    if (curLines.length === 0) return;
    const content = curLines.join("\n");
    const trimmed = content.trim();
    if (isUiShortLineStack(curLines)) {
      suppressedUiCount += 1;
    } else if (
      trimmed.length >= 24 &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("|") &&
      !trimmed.startsWith("```") &&
      !trimmed.startsWith("~~~") &&
      !trimmed.startsWith(">") &&
      !/^(?:[-*+]|[0-9]+\.)\s/.test(trimmed)
    ) {
      blocks.push({
        text: content,
        startOffset: curStartOffset,
        endOffset,
        startLine: curStartLine,
        endLine,
      });
    }
    curLines = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i];
    const trimmed = ln.trim();
    const lnLen = cpLen(ln);
    if (!fenceMarker && (trimmed.startsWith("```") || trimmed.startsWith("~~~"))) {
      flush(idx, Math.max(curStartLine, lineNo - 1));
      fenceMarker = trimmed.startsWith("```") ? "```" : "~~~";
      idx += lnLen + 1;
      lineNo += 1;
      continue;
    }
    if (fenceMarker) {
      if (trimmed.startsWith(fenceMarker)) fenceMarker = null;
      idx += lnLen + 1;
      lineNo += 1;
      continue;
    }
    if (trimmed === "") {
      flush(idx, Math.max(curStartLine, lineNo - 1));
    } else {
      if (curLines.length === 0) {
        curStartOffset = idx;
        curStartLine = lineNo;
      }
      curLines.push(ln);
    }
    idx += lnLen + 1;
    lineNo += 1;
  }
  flush(cpLen(text), lines.length);
  if (meta) meta.suppressedUiCount = suppressedUiCount;
  return blocks;
}

export function analyzeDocumentWithPocketModels(text, { threshold = null, customBundle = null } = {}) {
  const bundle = preparePocketModelBundle(customBundle || loadPocketModelBundle());
  if (threshold !== null && threshold !== undefined) {
    if (typeof threshold !== "number" || Number.isNaN(threshold) || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error(`Invalid pocket model threshold '${threshold}' (expected a number between 0 and 1).`);
    }
  }
  const effectiveThreshold = threshold ?? bundle.thresholds?.stealthWarning ?? 0.755;
  const whole = scorePocketSpan(text, bundle);
  const packRouting = predictPackWithPocketRouter(text, bundle);
  const blockMeta = { suppressedUiCount: 0 };
  const blocks = splitParagraphBlocks(text, blockMeta);

  const paragraphs = [];
  for (const b of blocks) {
    const res = scorePocketSpan(b.text, bundle);
    if (!res.eligible) continue;
    const trimmed = b.text.trim();
    paragraphs.push({
      startLine: b.startLine,
      endLine: b.endLine,
      startOffset: b.startOffset,
      endOffset: b.endOffset,
      excerpt: cpLen(trimmed) > 120 ? Array.from(trimmed).slice(0, 120).join("") + "…" : trimmed,
      ...res,
      flagged: res.slopProbability >= effectiveThreshold,
    });
  }

  const maxParagraphProb =
    paragraphs.length > 0 ? maxOf(paragraphs.map((p) => p.slopProbability)) : whole.slopProbability;
  const flaggedParagraphs = paragraphs.filter((p) => p.flagged);
  let documentProbability = round4(Math.max(whole.slopProbability, maxParagraphProb));
  if (
    flaggedParagraphs.length === 0 &&
    (paragraphs.length > 0 || blockMeta.suppressedUiCount > 0 || !whole.eligible) &&
    documentProbability >= effectiveThreshold
  ) {
    documentProbability = round4(Math.max(0, effectiveThreshold - 0.005));
  }

  return {
    schema: bundle.schema,
    modelVersion: bundle.version,
    threshold: round4(effectiveThreshold),
    documentProbability,
    wholeTextScore: whole,
    packRouter: packRouting,
    paragraphs,
    flaggedCount: flaggedParagraphs.length,
  };
}
