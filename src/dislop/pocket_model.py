"""
Zero-dependency Bundled Pocket Traditional ML Engine (`dislop.pocket-model/1`).
Runs two built-in offline models (<15 KB gzipped JSON, <0.5 ms per paragraph, 0 network):
  1. `pocket-slop-ensemble`: De-lexicalized INT8 N-gram Log-Odds LM + Calibrated 24-Feature
     Linear Attribution + 45-Tree Shallow GBDT Paragraph/Prose Slop Scorer.
  2. `pocket-pack-router`: Quantized INT8 Multinomial Log-Odds 5-Domain Pack Classifier.

Bit-for-bit aligned with Node `src/pocket-model.mjs`.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
_DEFAULT_CANDIDATES = [
    _HERE.parent.parent / "models" / "pocket-slop-v1.json",
    _HERE / "models" / "pocket-slop-v1.json",
    _HERE / "pocket-slop-v1.json",
]

_CACHED_BUNDLE: dict[str, Any] | None = None


def load_pocket_model_bundle(custom_path: str | Path | None = None) -> dict[str, Any]:
    global _CACHED_BUNDLE
    if custom_path is None and _CACHED_BUNDLE is not None:
        return _CACHED_BUNDLE
    candidates = [Path(custom_path)] if custom_path is not None else _DEFAULT_CANDIDATES
    for p in candidates:
        if p.exists():
            raw = json.loads(p.read_text(encoding="utf-8"))
            raw["_enFuncSet"] = set(raw.get("enFuncWords") or [])
            raw["_zhStructSet"] = set(raw.get("zhStructChars") or "")
            if custom_path is None:
                _CACHED_BUNDLE = raw
            return raw
    raise FileNotFoundError("dislop pocket model bundle (pocket-slop-v1.json) not found.")


def _round4(v: float) -> float | int:
    # Exact V8 Math.round semantics: floor(x) + (1 if x - floor(x) >= 0.5 else 0)
    scaled = v * 10000.0
    fl = math.floor(scaled)
    rounded = (fl + 1) if (scaled - fl >= 0.5) else fl
    res = rounded / 10000.0
    if res == 0.0:
        return 0
    return int(res) if res.is_integer() else res


DISLOP_QUOTE_BLOCK_RE = re.compile(r"<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->", re.I)
HTML_COMMENT_RE = re.compile(r"<!--[\s\S]*?-->")
HTML_TAG_RE = re.compile(r"</?[A-Za-z][^>\n]{0,400}>")

INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
MD_LINK_COUNT_RE = re.compile(r"\[[^\[\]\n]{1,240}\]\([^()\s\n]{1,360}\)")
MD_LINK_REPLACE_RE = re.compile(r"\[([^\[\]\n]{1,240})\]\([^()\s\n]{1,360}\)")
BARE_URL_RE = re.compile(r"https?://[^\s)>\]\"']+")
CITATION_AUTHOR_RE = re.compile(r"\([A-Z][A-Za-z-]{1,30}(?:\s+et\s+al\.)?,?\s*(?:19|20)[0-9]{2}[a-z]?(?:[;,]\s*[^()\n]{1,80})?\)")
CITATION_BRACKET_RE = re.compile(r"\[[0-9]{1,4}(?:\s*[,-]\s*[0-9]{1,4}){0,20}\]")
PAREN_QUOTE_RE = re.compile(r"[（(]\s*[“\"「『][^（(”\"」』\n]{6,160}[”\"」』]\s*[)）]")
EXAMPLE_QUOTE_RE = re.compile(r"(?:例如|比如|如|e\.g\.|such as)\s*[：:,，]?\s*[“\"「『][^”\"」』\n]{6,160}[”\"」』]", re.I)
TAG_STRIP_RE = re.compile(r"<(?:CODE|URL)>")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")
EN_WORD_RE = re.compile(r"[A-Za-z]+")
EN_ALNUM_RE = re.compile(r"[A-Za-z0-9]+")
NUM_MASK_RE = re.compile(r"(?<![A-Za-z0-9])[0-9]+(?:[.,:/-][0-9]+)*%?(?![A-Za-z0-9])")
NUM_HIT_RE = re.compile(r"(?<![A-Za-z0-9])[0-9]+(?:[.,:][0-9]+)?%?(?![A-Za-z0-9])")
TOKEN_SCAN_RE = re.compile(r"<(?:CODE|URL|NUM)>|[A-Za-z]+|[\u4e00-\u9fff]|[，。！？；：、,.!?;:—\-]")
LEX_TOK_RE = re.compile(r"[\u4e00-\u9fff]|[a-z]{2,}")

EN_NUM_TIME_RE = re.compile(
    r"(?<![A-Za-z])(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|"
    r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|last\s+week)(?![A-Za-z])",
    re.I,
)
ZH_NUM_TIME_RE = re.compile(
    r"(?:[一二三四五六七八九十两百千万]+[天月年次个张条座块斤米秒分时点]|周[一二三四五六日天]|昨天|昨晚|今早|上周|下周)"
)
PATH_HIT_RE = re.compile(r"[./\\][A-Za-z0-9._/-]+\.[a-z]{1,6}(?![A-Za-z])")

EN_ABSTRACT_RE = re.compile(
    r"(?<![A-Za-z])[A-Za-z]{4,}(?:tion|tions|sion|sions|ment|ments|ity|ities|ness|ance|ence|ization|isation)(?![A-Za-z])",
    re.I,
)
EN_GERUND_OPENER_RE = re.compile(
    r"(?:^|[.!?]\s+)(?:By\s+[a-z]+ing|[A-Z][a-z]+ing\s+[a-z]+)(?![A-Za-z])"
)
EN_CUSHION_RE = re.compile(
    r"(?<![A-Za-z])(?:plays?\s+an?\s+(?:important|key|vital|critical|central|meaningful)\s+role|"
    r"provides?\s+(?:meaningful|valuable|important|actionable)\s+(?:context|insights?|guidance)|"
    r"often\s+(?:notice|require|involves?|leads?\s+to|helps?)|"
    r"helps?\s+[a-z]+\s+(?:focus|maintain|reduce|build|navigate|cultivate)|"
    r"supports?\s+(?:steady|long-term|sustainable|effective|productive)|"
    r"contributes?\s+(?:directly\s+)?to|minimizes?\s+unexpected|enabling\s+[a-z]+\s+to|"
    r"while\s+(?:maintaining|preserving|enabling|supporting|ensuring|strengthening)|"
    r"greater\s+confidence|shared\s+visibility|operational\s+(?:progress|observations)|"
    r"rather\s+than\s+isolated\s+assumptions|when\s+additional\s+resources\s+are\s+required|"
    r"quiet\s+sense\s+of|creating\s+a\s+[a-z]+\s+rhythm\s+that)(?![A-Za-z])",
    re.I,
)

ZH_NOMINAL_FRAME_RE = re.compile(
    r"(?:在[^，。！？\n]{2,14}的(?:过程|背景|环境|节奏|框架|语境)[中里]|"
    r"之[中后前下]|的(?:打磨|推进|演进|提升|构建|平衡点|割裂感|积极意义|重要前提|良好基础))"
)
ZH_CUSHION_RE = re.compile(
    r"(?:往往(?:能够|需要|是|会)|能够在[^，。]{2,10}中|在很大程度上|潜移默化中|"
    r"不可忽视的|恰到好处的|平稳有序|稳步提升|奠定(?:了)?(?:良好|坚实)?基础|"
    r"具有[^，。]{2,8}意义|重要前提|独特气息|柔和的倒影|不知不觉中)"
)
ZH_COLLOQUIAL_CONCRETE_RE = re.compile(
    r"(?:砍掉|顺手|盯|摸了摸|揣进|烫着|铁桶|三轮车|报刊亭|置顶|标红|吞成|卡点|踩的|坑|锁死|别写成)"
)
EN_DIRECT_CONCRETE_RE = re.compile(
    r"(?<![A-Za-z])(?:we\s+stopped|never\s+[a-z]+|delete\s+the|way\s+more\s+than|"
    r"last\s+week|yesterday|three\s+in\s+the\s+morning|hoses\s+down|burnt\s+sugar|wet\s+cardboard)(?![A-Za-z])",
    re.I,
)
ZH_DIRECT_PRON_RE = re.compile(r"[我你咱们别]")
PUNCT_CHAR_RE = re.compile(r"[，。！？；：、,.!?;:—\-()（）“”\"']")
EMDASH_RE = re.compile(r"——|—")

EN_CUSHION_WORDS = {
    "often", "typically", "effectively", "seamlessly", "steadily", "proactively",
    "ensure", "ensures", "ensuring", "enable", "enables", "enabling", "foster",
    "fostering", "enhance", "enhancing", "streamline", "navigate", "leverage",
    "meaningful", "actionable", "sustainable", "holistic", "comprehensive",
}
EN_DIRECT_WORDS = {"i", "we", "you", "my", "our", "your", "never", "stop", "delete", "ship", "shipped", "broke"}

DRIVER_LABELS: dict[str, dict[str, str]] = {
    "ngram_llr_mean": {
        "en": "predictable structural & transition phrasing",
        "zh": "句式衔接高度顺滑可预测",
    },
    "ngram_llr_max_sent": {
        "en": "high-template sentence skeleton",
        "zh": "单句呈高频模板化骨架",
    },
    "concreteness": {
        "en": "low concrete anchors (few numbers, dates, files, or citations)",
        "zh": "缺少具体事实锚点（数字、时间、文件名或出处）",
    },
    "en_abstract_noun_rate": {
        "en": "dense abstract nominalizations (-tion/-ment/-ity/-ness)",
        "zh": "抽象名词化后缀密集",
    },
    "en_func_cushion_rate": {
        "en": "hedged corporate cushion verbs/adverbs",
        "zh": "堆叠温和缓冲动词与副词",
    },
    "en_cushion_phrase_rate": {
        "en": "stock framing phrases (plays a role / supports steady...)",
        "zh": "套用公关过渡短语",
    },
    "en_gerund_opener_rate": {
        "en": "participial/gerund sentence openers (By -ing / Maintaining...)",
        "zh": "分词结构机械起句",
    },
    "zh_nominal_frame_rate": {
        "en": "nominalized wrapper frames (在…的过程中 / …的推进)",
        "zh": "套用「在……的过程中 / ……的推进」名词化外壳",
    },
    "zh_cushion_phrase_rate": {
        "en": "soft filler cushions (往往能够 / 稳步提升 / 不可忽视)",
        "zh": "堆叠「往往能够 / 稳步提升」缓冲套话",
    },
    "zh_de_particle_rate": {
        "en": "heavy modifier chains (的)",
        "zh": "「的」字修饰链偏密",
    },
    "sent_cv": {
        "en": "uniform sentence lengths",
        "zh": "句长起伏偏平",
    },
    "clause_cv": {
        "en": "metronomic comma-clause lengths",
        "zh": "逗号分句长短过于整齐",
    },
    "pronoun_imperative_rate": {
        "en": "impersonal passive distance (no direct actor or action)",
        "zh": "缺少明确主语和直接动作",
    },
}


def _strip_fenced_blocks_linear(raw: str) -> str:
    out: list[str] = []
    fence_marker: str | None = None
    for ln in str(raw or "").split("\n"):
        trimmed = ln.strip()
        if fence_marker is None:
            if trimmed.startswith("```"):
                fence_marker = "```"
                continue
            if trimmed.startswith("~~~"):
                fence_marker = "~~~"
                continue
            if trimmed.startswith("|") and trimmed.endswith("|"):
                continue
            out.append(ln)
        elif trimmed.startswith(fence_marker):
            fence_marker = None
    return "\n".join(out)


def clean_prose_surface(raw: str) -> dict[str, Any]:
    s = re.sub(r"^\ufeff?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)", " ", str(raw or ""))
    s = s.replace("\ufeff", " ")
    s = DISLOP_QUOTE_BLOCK_RE.sub(" ", s)
    s = HTML_COMMENT_RE.sub(" ", s)
    s = _strip_fenced_blocks_linear(s)
    s = HTML_TAG_RE.sub(" ", s)

    inline_codes = len(INLINE_CODE_RE.findall(s))
    md_links = len(MD_LINK_COUNT_RE.findall(s))
    bare_urls = len(BARE_URL_RE.findall(s))
    citations = len(CITATION_AUTHOR_RE.findall(s)) + len(CITATION_BRACKET_RE.findall(s))
    tech_anchors = inline_codes + md_links + bare_urls + citations

    s = PAREN_QUOTE_RE.sub(" ", s)
    s = EXAMPLE_QUOTE_RE.sub(" ", s)

    s = MD_LINK_REPLACE_RE.sub(r"\1 <URL> ", s)
    s = BARE_URL_RE.sub(" <URL> ", s)
    s = INLINE_CODE_RE.sub(" <CODE> ", s)

    prose_only = TAG_STRIP_RE.sub(" ", s)
    cjk_n = len(CJK_RE.findall(prose_only))
    en_n = len(EN_WORD_RE.findall(prose_only))
    units = cjk_n * 0.6 + en_n
    sents = [p.strip() for p in re.split(r"[。！？.!?\n]+", prose_only) if len(p.strip()) >= 4]
    eligible = 1 if (len(sents) >= 2 and units >= 26.0) else 0
    return {"surface": s, "techAnchors": tech_anchors, "eligible": eligible, "units": units, "sentCount": len(sents)}


def delexicalize_tokens(raw: str, bundle: dict[str, Any]) -> list[str]:
    surf = clean_prose_surface(raw)["surface"]
    s = NUM_MASK_RE.sub(" <NUM> ", surf)
    en_func_set = bundle["_enFuncSet"]
    suffixes = bundle.get("enAbstractSuffixes") or []
    zh_struct_set = bundle["_zhStructSet"]
    tokens: list[str] = []

    for m in TOKEN_SCAN_RE.finditer(s):
        tok = m.group(0)
        c0 = tok[0]
        if c0 == "<":
            tokens.append(tok)
        elif ("A" <= c0 <= "Z") or ("a" <= c0 <= "z"):
            low = tok.lower()
            if low in en_func_set:
                tokens.append("en:" + low)
            else:
                matched_suf = None
                if len(low) >= 6:
                    for suf in suffixes:
                        if low.endswith(suf):
                            matched_suf = suf
                            break
                if matched_suf:
                    tokens.append("suf:" + matched_suf)
                elif low.endswith("ing") and len(low) >= 6:
                    tokens.append("suf:ing")
                elif low.endswith("ly") and len(low) >= 5:
                    tokens.append("suf:ly")
                elif low.endswith("ed") and len(low) >= 5:
                    tokens.append("suf:ed")
                elif len(low) <= 4:
                    tokens.append("en:<WS>")
                else:
                    tokens.append("en:<WC>")
        elif "\u4e00" <= c0 <= "\u9fff":
            tokens.append(("zh:" + tok) if tok in zh_struct_set else "zh:<H>")
        else:
            tokens.append("p:" + tok)
    return tokens


def _extract_ngrams(delex_tokens: list[str]) -> list[str]:
    feats: list[str] = []
    n = len(delex_tokens)
    for i in range(n):
        t1 = delex_tokens[i]
        if t1 not in ("en:<WC>", "en:<WS>", "zh:<H>"):
            feats.append(t1)
        if i + 1 < n:
            feats.append(t1 + "|" + delex_tokens[i + 1])
        if i + 2 < n:
            feats.append(t1 + "|" + delex_tokens[i + 1] + "|" + delex_tokens[i + 2])
    return feats


def _score_lm_span(text: str, bundle: dict[str, Any]) -> float:
    toks = delexicalize_tokens(text, bundle)
    if not toks:
        return 0.0
    unique_ngs = sorted(set(_extract_ngrams(toks)))
    if not unique_ngs:
        return 0.0
    weights = bundle["ngramLm"]["weightsInt8"]
    scale = bundle["ngramLm"]["scale"]
    total = 0.0
    for g in unique_ngs:
        w = weights.get(g)
        if w is not None:
            total += w * scale
    return total / math.sqrt(len(unique_ngs) + 8.0)


def _l2r_sum(vals: Any) -> float:
    acc = 0.0
    for v in vals:
        acc += v
    return acc


def _score_lm_features(text: str, bundle: dict[str, Any]) -> tuple[float, float, float]:
    whole = _score_lm_span(text, bundle)
    surf = clean_prose_surface(text)["surface"]
    sents = [s.strip() for s in re.split(r"[。！？.!?\n]+", surf) if len(s.strip()) >= 4]
    if not sents:
        return whole, whole, 0.0
    s_scores = [_score_lm_span(s, bundle) for s in sents]
    mean_s = _l2r_sum(s_scores) / len(s_scores)
    max_s = max(s_scores)
    std_s = math.sqrt(_l2r_sum((x - mean_s) ** 2 for x in s_scores) / len(s_scores)) if len(s_scores) >= 2 else 0.0
    return whole, max_s, std_s


def extract_pocket_features(text: str, bundle: dict[str, Any]) -> tuple[list[float], int]:
    raw = str(text or "")
    info = clean_prose_surface(raw)
    surf = info["surface"]
    tech_anchors = info["techAnchors"]
    eligible = info["eligible"]
    no_tags = TAG_STRIP_RE.sub(" ", surf)

    cjk_chars = CJK_RE.findall(no_tags)
    en_words = EN_WORD_RE.findall(no_tags)
    units = max(1.0, len(cjk_chars) * 0.6 + len(en_words))

    sents = [s.strip() for s in re.split(r"[。！？.!?\n]+", no_tags) if len(s.strip()) >= 3]
    sent_lens = [len(CJK_RE.findall(s)) * 0.6 + len(EN_ALNUM_RE.findall(s)) for s in sents]
    sent_lens = [x for x in sent_lens if x > 0]
    n_sents = len(sent_lens)
    if n_sents >= 2:
        mean_s = _l2r_sum(sent_lens) / n_sents
        std_s = math.sqrt(_l2r_sum((x - mean_s) ** 2 for x in sent_lens) / n_sents)
        sent_cv = std_s / mean_s if mean_s > 0 else 0.0
        adj_diff = (
            _l2r_sum(abs(sent_lens[i] - sent_lens[i - 1]) for i in range(1, n_sents))
            / ((n_sents - 1) * max(1.0, mean_s))
        )
    elif n_sents == 1:
        mean_s, sent_cv, adj_diff = sent_lens[0], 0.38, 0.38
    else:
        mean_s, sent_cv, adj_diff = 0.0, 0.38, 0.38

    clauses = [c.strip() for c in re.split(r"[，,；;：:。！？.!?\n]+", no_tags) if len(c.strip()) >= 2]
    clause_lens = [len(CJK_RE.findall(c)) * 0.6 + len(EN_ALNUM_RE.findall(c)) for c in clauses]
    clause_lens = [x for x in clause_lens if x > 0]
    if len(clause_lens) >= 3:
        mc = _l2r_sum(clause_lens) / len(clause_lens)
        sc = math.sqrt(_l2r_sum((x - mc) ** 2 for x in clause_lens) / len(clause_lens))
        clause_cv = sc / mc if mc > 0 else 0.0
    else:
        clause_cv = 0.42

    lex_toks = LEX_TOK_RE.findall(no_tags.lower())
    n_tok = len(lex_toks)
    if n_tok > 25:
        windows = [len(set(lex_toks[i : i + 25])) / 25.0 for i in range(0, n_tok - 24, 5)]
        mattr = _l2r_sum(windows) / len(windows)
    else:
        mattr = len(set(lex_toks)) / max(1, n_tok)

    if n_tok >= 2:
        bgs = [lex_toks[i] + "_" + lex_toks[i + 1] for i in range(n_tok - 1)]
        bigram_rep = 1.0 - (len(set(bgs)) / len(bgs))
    else:
        bigram_rep = 0.0

    num_hits = len(NUM_HIT_RE.findall(no_tags))
    en_num_time = len(EN_NUM_TIME_RE.findall(no_tags))
    zh_num_time = len(ZH_NUM_TIME_RE.findall(no_tags))
    path_hits = len(PATH_HIT_RE.findall(raw))
    concreteness = ((num_hits + en_num_time + zh_num_time + path_hits + tech_anchors) / units) * 100.0
    code_url_density = (tech_anchors / units) * 100.0

    n_en = max(1, len(en_words))
    en_abs = (len(EN_ABSTRACT_RE.findall(no_tags)) / n_en) * 100.0 if len(en_words) >= 5 else 0.0
    en_cush_words = sum(1 for w in en_words if w.lower() in EN_CUSHION_WORDS)
    en_func_cush = (en_cush_words / n_en) * 100.0 if len(en_words) >= 5 else 0.0
    en_gerund = (len(EN_GERUND_OPENER_RE.findall(no_tags)) / max(1, n_sents)) if len(en_words) >= 5 else 0.0
    en_cush_phrase = (len(EN_CUSHION_RE.findall(no_tags)) / units) * 100.0

    n_zh = max(1, len(cjk_chars))
    zh_de = (no_tags.count("的") / n_zh) * 100.0 if len(cjk_chars) >= 8 else 0.0
    zh_nom = (len(ZH_NOMINAL_FRAME_RE.findall(no_tags)) / units) * 100.0 if len(cjk_chars) >= 8 else 0.0
    zh_cush = (len(ZH_CUSHION_RE.findall(no_tags)) / units) * 100.0 if len(cjk_chars) >= 8 else 0.0
    zh_struct_ratio = (
        (sum(1 for c in cjk_chars if c in bundle["_zhStructSet"]) / n_zh) if len(cjk_chars) >= 8 else 0.5
    )

    en_direct = sum(1 for w in en_words if w.lower() in EN_DIRECT_WORDS) + len(EN_DIRECT_CONCRETE_RE.findall(no_tags))
    zh_direct = len(ZH_DIRECT_PRON_RE.findall(no_tags)) + len(ZH_COLLOQUIAL_CONCRETE_RE.findall(no_tags))
    pronoun_imp = ((en_direct + zh_direct) / units) * 100.0

    punct_chars = PUNCT_CHAR_RE.findall(no_tags)
    punct_var = len(set(punct_chars)) / max(1.0, math.sqrt(len(punct_chars))) if punct_chars else 0.0
    semi_em = ((no_tags.count(";") + no_tags.count("；") + len(EMDASH_RE.findall(no_tags))) / units) * 100.0

    llr_mean, llr_max, llr_std = _score_lm_features(raw, bundle)

    feats = [
        math.log1p(units),
        float(n_sents),
        mean_s,
        sent_cv,
        adj_diff,
        clause_cv,
        mattr,
        bigram_rep,
        concreteness,
        code_url_density,
        en_abs,
        en_func_cush,
        en_gerund,
        en_cush_phrase,
        zh_de,
        zh_nom,
        zh_cush,
        zh_struct_ratio,
        pronoun_imp,
        punct_var,
        semi_em,
        llr_mean,
        llr_max,
        llr_std,
    ]
    return feats, eligible


def _sigmoid(x: float) -> float:
    clamped = max(-30.0, min(30.0, x))
    return 1.0 / (1.0 + math.exp(-clamped))


def _infer_gbdt(gbdt_json: dict[str, Any], feats: list[float]) -> float:
    raw = float(gbdt_json["init"])
    lr = float(gbdt_json["lr"])
    for nodes in gbdt_json["trees"]:
        idx = 0
        while "v" not in nodes[idx]:
            nd = nodes[idx]
            idx = nd["l"] if feats[nd["f"]] <= nd["t"] else nd["r"]
        raw += lr * nodes[idx]["v"]
    return _sigmoid(raw)


def score_pocket_span(text: str, custom_bundle: dict[str, Any] | None = None) -> dict[str, Any]:
    bundle = custom_bundle or load_pocket_model_bundle()
    feats, eligible = extract_pocket_features(text, bundle)
    if not eligible:
        return {
            "eligible": False,
            "slopProbability": 0,
            "linearProbability": 0,
            "gbdtProbability": 0,
            "band": "short-or-non-prose",
            "topDrivers": [],
        }
    lin = bundle["linear"]
    z_vec = [(feats[i] - lin["mean"][i]) / lin["scale"][i] for i in range(len(feats))]
    logit = float(lin["intercept"])
    contribs: list[dict[str, Any]] = []
    f_names = bundle["featureNames"]
    for i, z in enumerate(z_vec):
        c = z * lin["coef"][i]
        logit += c
        fname = f_names[i]
        if c > 0.08 and fname in DRIVER_LABELS:
            contribs.append({
                "feature": fname,
                "impact": _round4(c),
                "reason": DRIVER_LABELS[fname],
            })
    contribs.sort(key=lambda d: d["impact"], reverse=True)
    p_lin = _sigmoid(logit)
    p_gbdt = _infer_gbdt(bundle["gbdt"], feats)
    ew = bundle["ensembleWeights"]
    prob = _round4(ew["linear"] * p_lin + ew["gbdt"] * p_gbdt)
    thresholds = bundle.get("thresholds") or {}
    stealth_thr = thresholds.get("stealthWarning", 0.755)
    adv_thr = thresholds.get("advisory", 0.62)
    band = "high" if prob >= stealth_thr else ("elevated" if prob >= adv_thr else "clean")

    return {
        "eligible": True,
        "slopProbability": prob,
        "linearProbability": _round4(p_lin),
        "gbdtProbability": _round4(p_gbdt),
        "band": band,
        "topDrivers": contribs[:3],
    }


def predict_pack_with_pocket_router(text: str, custom_bundle: dict[str, Any] | None = None) -> dict[str, Any]:
    bundle = custom_bundle or load_pocket_model_bundle()
    router = bundle["packRouter"]
    packs: list[str] = router["packs"]
    scores = [0.0] * len(packs)
    low = str(text or "").lower()
    seen: set[str] = set()

    for m in re.finditer(r"[a-z][a-z0-9_-]{2,22}", low):
        seen.add(m.group(0))
    for seg in re.findall(r"[\u4e00-\u9fff]{2,}", low):
        for i in range(len(seg) - 1):
            seen.add(seg[i : i + 2])

    matched_tokens = 0
    weights = router["weightsInt8"]
    scale = float(router["scale"])
    for tok in sorted(seen):
        w_vec = weights.get(tok)
        if w_vec is None:
            continue
        matched_tokens += 1
        for k in range(len(packs)):
            scores[k] += w_vec[k] * scale

    if matched_tokens == 0:
        unif = _round4(1.0 / len(packs))
        return {
            "recommendedPack": "business-brief",
            "confidence": unif,
            "matchedSignals": 0,
            "scores": {p: unif for p in packs},
        }

    norm_factor = 1.0 / math.sqrt(matched_tokens + 3.0)
    scaled = [s * norm_factor for s in scores]
    max_logit = max(scaled)
    exps = [math.exp(s - max_logit) for s in scaled]
    sum_exp = sum(exps)
    probs = [e / sum_exp for e in exps]

    best_idx = 0
    for i in range(1, len(probs)):
        if probs[i] > probs[best_idx]:
            best_idx = i

    return {
        "recommendedPack": packs[best_idx],
        "confidence": _round4(probs[best_idx]),
        "matchedSignals": matched_tokens,
        "scores": {packs[i]: _round4(probs[i]) for i in range(len(packs))},
    }


def _mask_newline_preserving(raw: str) -> str:
    s = re.sub(
        r"^\ufeff?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)",
        lambda m: re.sub(r"[^\n]", " ", m.group(0)),
        str(raw or ""),
    )
    s = s.replace("\ufeff", " ")
    s = DISLOP_QUOTE_BLOCK_RE.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), s)
    s = HTML_COMMENT_RE.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), s)
    return s


def _is_ui_short_line_stack(lines: list[str]) -> bool:
    if not lines or len(lines) < 3:
        return False
    non_empty = [ln.strip() for ln in lines if ln.strip()]
    if len(non_empty) < 3:
        return False
    short_count = sum(1 for ln in non_empty if len(ln) <= 16)
    return short_count * 2 >= len(non_empty)


def _split_paragraph_blocks_with_stats(raw: str) -> dict[str, Any]:
    text = _mask_newline_preserving(raw)
    blocks: list[dict[str, Any]] = []
    suppressed_ui_count = 0
    line_no = 1
    idx = 0
    lines = text.split("\n")
    cur_lines: list[str] = []
    cur_start_offset = 0
    cur_start_line = 1
    fence_marker: str | None = None

    def flush(end_offset: int, end_line: int) -> None:
        nonlocal cur_lines, suppressed_ui_count
        if not cur_lines:
            return
        content = "\n".join(cur_lines)
        trimmed = content.strip()
        if (
            len(trimmed) >= 24
            and not trimmed.startswith("#")
            and not trimmed.startswith("|")
            and not trimmed.startswith("```")
            and not trimmed.startswith("~~~")
            and not trimmed.startswith(">")
            and not re.match(r"^(?:[-*+]|[0-9]+\.)\s", trimmed)
        ):
            if _is_ui_short_line_stack(cur_lines):
                suppressed_ui_count += 1
            else:
                blocks.append({
                    "text": content,
                    "startOffset": cur_start_offset,
                    "endOffset": end_offset,
                    "startLine": cur_start_line,
                    "endLine": end_line,
                })
        cur_lines = []

    for ln in lines:
        trimmed = ln.strip()
        if fence_marker is None and (trimmed.startswith("```") or trimmed.startswith("~~~")):
            flush(idx, max(cur_start_line, line_no - 1))
            fence_marker = "```" if trimmed.startswith("```") else "~~~"
            idx += len(ln) + 1
            line_no += 1
            continue
        if fence_marker is not None:
            if trimmed.startswith(fence_marker):
                fence_marker = None
            idx += len(ln) + 1
            line_no += 1
            continue
        if trimmed == "":
            flush(idx, max(cur_start_line, line_no - 1))
        else:
            if not cur_lines:
                cur_start_offset = idx
                cur_start_line = line_no
            cur_lines.append(ln)
        idx += len(ln) + 1
        line_no += 1

    flush(len(text), len(lines))
    return {"blocks": blocks, "suppressedUiCount": suppressed_ui_count}


def _split_paragraph_blocks(raw: str) -> list[dict[str, Any]]:
    return _split_paragraph_blocks_with_stats(raw)["blocks"]


def analyze_document_with_pocket_models(
    text: str,
    *,
    threshold: float | None = None,
    custom_bundle: dict[str, Any] | None = None,
) -> dict[str, Any]:
    bundle = custom_bundle or load_pocket_model_bundle()
    if threshold is not None:
        if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or math.isnan(threshold) or math.isinf(threshold) or threshold < 0.0 or threshold > 1.0:
            raise ValueError(f"Invalid pocket model threshold '{threshold}' (expected a number between 0 and 1).")
    effective_threshold = (
        float(threshold)
        if threshold is not None
        else float((bundle.get("thresholds") or {}).get("stealthWarning", 0.755))
    )
    whole = score_pocket_span(text, bundle)
    pack_routing = predict_pack_with_pocket_router(text, bundle)
    split_res = _split_paragraph_blocks_with_stats(text)
    blocks = split_res["blocks"]
    suppressed_ui_count = split_res["suppressedUiCount"]

    paragraphs: list[dict[str, Any]] = []
    for b in blocks:
        res = score_pocket_span(b["text"], bundle)
        if not res["eligible"]:
            continue
        trimmed = b["text"].strip()
        excerpt = (trimmed[:120] + "…") if len(trimmed) > 120 else trimmed
        paragraphs.append({
            "startLine": b["startLine"],
            "endLine": b["endLine"],
            "startOffset": b["startOffset"],
            "endOffset": b["endOffset"],
            "excerpt": excerpt,
            **res,
            "flagged": res["slopProbability"] >= effective_threshold,
        })

    max_para_prob = (
        max(p["slopProbability"] for p in paragraphs) if paragraphs else whole["slopProbability"]
    )
    flagged_count = sum(1 for p in paragraphs if p["flagged"])
    doc_prob = _round4(max(whole["slopProbability"], max_para_prob))
    if (paragraphs or suppressed_ui_count > 0) and flagged_count == 0 and doc_prob >= effective_threshold:
        doc_prob = _round4(max(0.0, effective_threshold - 0.005))

    return {
        "schema": bundle["schema"],
        "modelVersion": bundle["version"],
        "threshold": _round4(effective_threshold),
        "documentProbability": doc_prob,
        "wholeTextScore": whole,
        "packRouter": pack_routing,
        "paragraphs": paragraphs,
        "flaggedCount": flagged_count,
    }
