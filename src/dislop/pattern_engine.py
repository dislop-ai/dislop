"""Zero-dependency Python 3.10+ AI-Slop Pattern Library Multi-Angle Engine matching `src/pattern-engine.mjs`."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

from .engine import (
    build_line_starts,
    build_zones,
    derive_fix_strategy,
    detect_modality,
    find_patterns_dir,
    fnv1a_hex,
    is_sentence_break_at,
    offset_to_line_col,
    parse_suppressions,
    strip_parentheticals,
)

PATTERN_ENGINE_VERSION = "1.0.0"
TEXT_MODALITIES = {"markdown", "text", "html", "docx"}
UI_MODALITIES = {"html", "css", "jsx"}


def _blank_preserve_lines(match: re.Match[str]) -> str:
    return re.sub(r"[^\r\n]", " ", match.group(0))


def _mask_ui_markup(raw_text: str) -> str:
    s = re.sub(
        r"<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->",
        _blank_preserve_lines,
        str(raw_text or "").replace("\ufeff", " "),
        flags=re.I,
    )
    s = re.sub(r"<!--[\s\S]*?-->", _blank_preserve_lines, s)
    s = re.sub(r"/\*[\s\S]*?\*/", _blank_preserve_lines, s)
    return re.sub(r"<(script|code|pre)\b[^>]*>[\s\S]*?</\1>", _blank_preserve_lines, s, flags=re.I)


def load_pattern_banks(patterns_dir: Path | None = None) -> dict[str, dict[str, Any]]:
    root = patterns_dir or find_patterns_dir()
    bank_dir = root / "banks"
    out: dict[str, dict[str, Any]] = {}
    if not bank_dir.is_dir():
        return out
    for child in sorted(bank_dir.glob("*.json")):
        data = json.loads(child.read_text(encoding="utf-8"))
        bid = data.get("id") or child.stem
        out[bid] = data
    return out


# ---------- Shared Linguistic Measurement Helpers ----------

def _strip_formatted_numbers_and_code(s: str) -> str:
    s = re.sub(r"\d{1,3}(?:,\d{3})+", "0", str(s or ""))
    return re.sub(r"`[^`\n]+`", "CODE", s)


def detect_primary_lang(s: str) -> str:
    cjk = len(re.findall(r"[\u4e00-\u9fff]", s))
    en_words = len([w for w in s.split() if re.search(r"[A-Za-z]", w)])
    return "zh" if cjk >= en_words * 2 else "en"


def _js_round(val: float) -> int:
    # Match JS Math.round (half towards +inf) for exact parity
    return int(math.floor(val + 0.5))


def measure_units(text: str, lang: str) -> int:
    clean = re.sub(r"[.!?。！？]+$", "", _strip_formatted_numbers_and_code(text)).strip()
    cjk = len(re.findall(r"[\u4e00-\u9fff]", clean))
    en_words = len([w for w in clean.split() if re.search(r"[A-Za-z0-9]", w)])
    return cjk + _js_round(en_words * 1.5) if lang == "zh" else en_words + _js_round(cjk * 0.6)


def _is_skippable_prose_block(trimmed: str) -> bool:
    return (not trimmed) or bool(re.match(r"^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)", trimmed))


def _iter_prose_paragraphs(prose_text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in re.finditer(r"[^\n]+(?:\n(?!\s*\n)[^\n]+)*", prose_text):
        raw = m.group(0)
        trimmed = raw.strip()
        ws = re.search(r"\S", raw)
        first_non_ws = ws.start() if ws else 0
        out.append(
            {
                "raw": raw,
                "trimmed": trimmed,
                "index": m.start() + first_non_ws,
                "blockStart": m.start(),
                "skippable": _is_skippable_prose_block(trimmed),
            }
        )
    return out


def _make_pattern_finding(
    *,
    rule_id: str,
    dimension: str,
    detection_angle: str,
    severity: str,
    filename: str,
    modality: str,
    line: int = 1,
    col: int = 1,
    location: str | None = None,
    match: str,
    metric: str = "",
    message: dict[str, str],
    deletion_test: dict[str, str] | None = None,
) -> dict[str, Any]:
    loc = location or f"{line}:{col}"
    clean_match = re.sub(r"[\s\ufeff]+", " ", str(match or "")).strip()[:140]
    fp = f"{rule_id}:{fnv1a_hex(f'{rule_id}|{clean_match.lower()}|{loc}')}"
    item = {
        "fingerprint": fp,
        "ruleId": rule_id,
        "source": "pattern-library",
        "dimension": dimension,
        "detectionAngle": detection_angle,
        "severity": severity,
        "fixStrategy": derive_fix_strategy({"id": rule_id, "severity": severity}),
        "file": filename,
        "modality": modality,
        "location": loc,
        "line": line,
        "col": col,
        "match": clean_match,
        "metric": metric,
        "message": message,
    }
    if deletion_test:
        item["deletionTest"] = deletion_test
    return item


def _iter_sentence_spans_in_para(raw_para: str) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    start = 0
    for i, ch in enumerate(raw_para):
        if ch == "\n":
            start = i + 1
            continue
        if is_sentence_break_at(raw_para, i):
            text = raw_para[start : i + 1]
            if text.strip():
                spans.append({"text": text, "index": start})
            start = i + 1
    return spans


# ---------- Angle: Rhythm & Cadence Statistics ----------

def _probe_comma_chain(prose_text: str, raw_text: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    min_commas = cfg.get("minCommas", 5)
    min_long = cfg.get("minLongClauses", 4)
    max_links = cfg.get("maxMarkdownLinks", 2)
    for para in _iter_prose_paragraphs(prose_text):
        if para["skippable"]:
            continue
        for sm in _iter_sentence_spans_in_para(para["raw"]):
            sent = sm["text"]
            normalized = _strip_formatted_numbers_and_code(sent)
            lang = detect_primary_lang(normalized)
            no_parens = strip_parentheticals(normalized)
            commas = re.findall(r"[，,]", no_parens)
            if len(commas) < min_commas:
                continue
            clauses = [c.strip() for c in re.split(r"[，,]", no_parens) if c.strip()]
            lang_cfg = cfg["zh"] if lang == "zh" else cfg["en"]
            lens = [measure_units(c, lang) for c in clauses]
            long_clauses = sum(1 for n in lens if n >= lang_cfg["minClauseUnits"])
            avg_units = sum(lens) / max(1, len(lens))
            if long_clauses >= min_long and avg_units >= lang_cfg["minAvgClauseUnits"]:
                ws = re.search(r"\S", sent)
                lead_ws = ws.start() if ws else 0
                start_offset = para["blockStart"] + sm["index"] + lead_ws
                raw_slice = raw_text[start_offset : start_offset + len(sent.strip())]
                if raw_slice.count("](") > max_links:
                    continue
                hits.append(
                    {
                        "index": start_offset,
                        "length": len(sent.strip()),
                        "metric": f"lang={lang}, commas={len(commas)}, avgUnits={avg_units:.1f}",
                    }
                )
    return hits


def _probe_sentence_length_monotony(prose_text: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    min_sents = cfg.get("minSentences", 5)
    min_units = cfg.get("minSentenceUnits", 4)
    max_cv = cfg.get("maxCv", 0.16)
    for para in _iter_prose_paragraphs(prose_text):
        if para["skippable"]:
            continue
        lang = detect_primary_lang(para["trimmed"])
        lengths = []
        for sm in _iter_sentence_spans_in_para(para["raw"]):
            u = measure_units(sm["text"], lang)
            if u >= min_units:
                lengths.append(u)
        if len(lengths) < min_sents:
            continue
        mean = sum(lengths) / len(lengths)
        min_mean = cfg.get("minMeanUnitsZh", 14) if lang == "zh" else cfg.get("minMeanUnitsEn", 10)
        if mean < min_mean:
            continue
        variance = sum((x - mean) ** 2 for x in lengths) / len(lengths)
        cv = math.sqrt(variance) / mean
        if cv < max_cv:
            hits.append(
                {
                    "index": para["index"],
                    "length": min(len(para["trimmed"]), 100),
                    "metric": f"lang={lang}, sentences={len(lengths)}, mean={mean:.1f}, cv={cv:.3f}",
                }
            )
    return hits


def _extract_sentence_opener(sentence: str, lang: str, cfg: dict[str, Any]) -> str:
    clean = re.sub(r"^[\"'“‘(（]+", "", sentence.strip())
    if not clean:
        return ""
    if lang == "zh":
        m = re.match(r"^([\u4e00-\u9fff]{2,3})", clean)
        if not m:
            return ""
        return m.group(1)[: cfg.get("minOpenerCharsZh", 2)]
    words = [w for w in re.sub(r"[^a-z0-9\s'-]", " ", clean.lower()).strip().split() if w]
    need = cfg.get("minOpenerWordsEn", 2)
    if len(words) < need + 1:
        return ""
    return " ".join(words[:need])


def _probe_opener_anaphora(prose_text: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    min_run = cfg.get("minConsecutive", 4)
    for para in _iter_prose_paragraphs(prose_text):
        if para["skippable"]:
            continue
        lang = detect_primary_lang(para["trimmed"])
        sentences: list[dict[str, Any]] = []
        for sm in _iter_sentence_spans_in_para(para["raw"]):
            s = sm["text"].strip()
            opener = _extract_sentence_opener(s, lang, cfg)
            ws = re.search(r"\S", sm["text"])
            lead = ws.start() if ws else 0
            start = para["blockStart"] + sm["index"] + lead
            sentences.append({"opener": opener, "start": start, "end": start + len(s)})

        run_key = ""
        run_start = 0
        run_len = 0
        for i in range(len(sentences) + 1):
            cur = sentences[i] if i < len(sentences) else None
            if cur and cur["opener"] and cur["opener"] == run_key:
                run_len += 1
            else:
                if run_len >= min_run and run_key:
                    first = sentences[run_start]
                    last = sentences[i - 1]
                    hits.append(
                        {
                            "index": first["start"],
                            "length": min(120, last["end"] - first["start"]),
                            "metric": f'opener="{run_key}", consecutive={run_len}',
                        }
                    )
                run_key = cur["opener"] if cur else ""
                run_start = i
                run_len = 1 if run_key else 0
    return hits


def _probe_inline_bold_saturation(prose_text: str, raw_text: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    min_spans = cfg.get("minBoldSpans", 4)
    for para in _iter_prose_paragraphs(prose_text):
        if para["skippable"]:
            continue
        raw_slice = raw_text[para["blockStart"] : para["blockStart"] + len(para["raw"])]
        if re.search(r"^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)", raw_slice, re.M):
            continue
        bold_matches: list[dict[str, int]] = []
        for bm in re.finditer(r"\*\*([^*\n`]{1,40})\*\*", raw_slice):
            prose_span = para["raw"][bm.start() : bm.end()]
            if prose_span.strip():
                bold_matches.append({"index": para["blockStart"] + bm.start(), "length": bm.end() - bm.start()})
        if len(bold_matches) < min_spans:
            continue
        lang = detect_primary_lang(para["trimmed"])
        plain_len = (
            len(re.findall(r"[\u4e00-\u9fff]", para["trimmed"]))
            if lang == "zh"
            else len([w for w in para["trimmed"].split() if re.search(r"[A-Za-z0-9]", w)])
        )
        ratio = plain_len / len(bold_matches)
        max_per_bold = cfg.get("maxCjkPerBoldZh", 55) if lang == "zh" else cfg.get("maxWordsPerBoldEn", 28)
        if ratio <= max_per_bold:
            hits.append(
                {
                    "index": bold_matches[0]["index"],
                    "length": min(100, len(para["trimmed"])),
                    "metric": f"lang={lang}, boldSpans={len(bold_matches)}, unitsPerBold={ratio:.1f}",
                }
            )
    return hits


def _probe_paragraph_length_uniformity(prose_text: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    paras = [p for p in _iter_prose_paragraphs(prose_text) if not p["skippable"]]
    min_paras = cfg.get("minParagraphs", 5)
    if len(paras) < min_paras:
        return []
    lang = detect_primary_lang(prose_text)
    scored = [{"para": p, "units": measure_units(p["trimmed"], lang)} for p in paras]
    scored = [x for x in scored if x["units"] >= 15]
    if len(scored) < min_paras:
        return []
    mean = sum(x["units"] for x in scored) / len(scored)
    if mean < cfg.get("minMeanUnits", 35):
        return []
    variance = sum((x["units"] - mean) ** 2 for x in scored) / len(scored)
    cv = math.sqrt(variance) / mean
    if cv < cfg.get("maxCv", 0.13):
        first = scored[0]["para"]
        return [
            {
                "index": first["index"],
                "length": min(100, len(first["trimmed"])),
                "metric": f"lang={lang}, paragraphs={len(scored)}, mean={mean:.1f}, cv={cv:.3f}",
            }
        ]
    return []


# ---------- Angle: Discourse Signpost Cluster ----------

def _probe_discourse_marker_cluster(prose_text: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    zh_alts = "|".join(re.escape(x) for x in cfg.get("zhLeadMarkers", []))
    en_alts = "|".join(re.escape(x) for x in cfg.get("enLeadMarkers", []))
    zh_lead_re = re.compile(rf"^(?:{zh_alts})[，,：:\s]") if zh_alts else None
    en_lead_re = re.compile(rf"^(?:{en_alts})[,\s]", re.I) if en_alts else None
    zh_inner_re = re.compile(rf"(?:^|[。！？；\n]\s*)(?:{zh_alts})[，,：:]") if zh_alts else None
    en_inner_re = re.compile(rf"(?:^|[.!?;]\s+)(?:{en_alts}),", re.I) if en_alts else None

    paras: list[dict[str, Any]] = []
    for p in _iter_prose_paragraphs(prose_text):
        if p["skippable"]:
            paras.append({**p, "isMarked": False})
        else:
            is_marked = bool(
                (zh_lead_re and zh_lead_re.search(p["trimmed"])) or (en_lead_re and en_lead_re.search(p["trimmed"]))
            )
            paras.append({**p, "isMarked": is_marked})

    min_paras = cfg.get("minConsecutiveParagraphs", 3)
    run_start = -1
    run_count = 0
    for i in range(len(paras) + 1):
        cur = paras[i] if i < len(paras) else None
        if cur and cur["isMarked"]:
            if run_count == 0:
                run_start = i
            run_count += 1
        else:
            if run_count >= min_paras:
                first = paras[run_start]
                hits.append(
                    {
                        "index": first["index"],
                        "length": min(80, len(first["trimmed"])),
                        "metric": f"consecutiveMarkedParagraphs={run_count}",
                    }
                )
            run_count = 0

    min_in_para = cfg.get("minMarkersInParagraph", 3)
    for p in paras:
        if p["skippable"]:
            continue
        zh_hits = len(zh_inner_re.findall(p["trimmed"])) if zh_inner_re else 0
        en_hits = len(en_inner_re.findall(p["trimmed"])) if en_inner_re else 0
        total = zh_hits + en_hits
        if total >= min_in_para and not any(h["index"] == p["index"] for h in hits):
            hits.append(
                {
                    "index": p["index"],
                    "length": min(80, len(p["trimmed"])),
                    "metric": f"markersInParagraph={total}",
                }
            )
    return hits


# ---------- Angle: Weighted Lexical & Calque Cluster ----------

def _probe_lexical_cluster(prose_text: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    compiled = [
        {"id": s["id"], "weight": float(s.get("weight", 1.0)), "re": re.compile(s["pattern"], re.I)}
        for s in cfg.get("signals", [])
    ]
    min_distinct = int(cfg.get("minDistinctHits", 2))
    min_score = float(cfg.get("minWeightedScore", min_distinct))

    for para in _iter_prose_paragraphs(prose_text):
        if para["skippable"]:
            continue
        matched: list[str] = []
        score = 0.0
        first_idx = -1
        first_len = 0
        for sig in compiled:
            m = sig["re"].search(para["raw"])
            if m:
                matched.append(sig["id"])
                score += sig["weight"]
                abs_idx = para["blockStart"] + m.start()
                if first_idx == -1 or abs_idx < first_idx:
                    first_idx = abs_idx
                    first_len = m.end() - m.start()
        if len(matched) >= min_distinct and score >= min_score and first_idx != -1:
            hits.append(
                {
                    "index": first_idx,
                    "length": max(first_len, min(100, len(para["trimmed"]))),
                    "metric": f"signals={len(matched)}, score={score:.1f}, ids={'+'.join(matched[:4])}",
                }
            )
    return hits


# ---------- Angle: Syntactic & Rhetorical Frames ----------

def _is_inside_quotation(text: str, start: int, end: int) -> bool:
    before = text[max(0, start - 32) : start]
    after = text[end : min(len(text), end + 16)]
    if before.count("“") - before.count("”") > 0 and "”" in after:
        return True
    if before.count("「") - before.count("」") > 0 and "」" in after:
        return True
    if re.search(r'(?:例如|比如|如)\s*[“"「]?$', before):
        return True
    return False


def _probe_prose_regex_patterns(prose_text: str, patterns: list[str], *, skip_quoted: bool = False) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    compiled = [re.compile(p, re.I) for p in patterns]
    for para in _iter_prose_paragraphs(prose_text):
        if para["skippable"]:
            continue
        for pat in compiled:
            for m in pat.finditer(para["raw"]):
                if m.start() == m.end():
                    continue
                idx = para["blockStart"] + m.start()
                length = m.end() - m.start()
                lead = re.match(r"^[.!?。！？\s]+", m.group(0))
                if lead and len(lead.group(0)) < length:
                    idx += len(lead.group(0))
                    length -= len(lead.group(0))
                if skip_quoted and _is_inside_quotation(prose_text, idx, idx + length):
                    continue
                hits.append({"index": idx, "length": length, "metric": f"matchedLen={length}"})
    hits.sort(key=lambda h: (h["index"], -h["length"]))
    dedup: list[dict[str, Any]] = []
    for h in hits:
        if dedup and h["index"] < dedup[-1]["index"] + dedup[-1]["length"]:
            continue
        dedup.append(h)
    return dedup


# ---------- Angle: Visual / UI & PPTX Structural Templates ----------

def _probe_ui_pattern_count(raw_text: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    clean = _mask_ui_markup(raw_text)
    pat = re.compile(cfg["pattern"], re.I)
    exempt_pat = re.compile(cfg["exemptPattern"], re.I) if cfg.get("exemptPattern") else None
    lookbehind = int(cfg.get("exemptLookbehindChars", 48))
    matches: list[dict[str, int]] = []
    for m in pat.finditer(clean):
        if exempt_pat:
            before = clean[max(0, m.start() - lookbehind) : m.start()]
            if exempt_pat.search(before):
                continue
        matches.append({"index": m.start(), "length": m.end() - m.start()})
    min_occ = int(cfg.get("minOccurrences", 3))
    if len(matches) >= min_occ:
        return [{"index": matches[0]["index"], "length": matches[0]["length"], "metric": f"occurrences={len(matches)}"}]
    return []


def _decode_xml_simple(s: str) -> str:
    return (
        str(s or "")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&amp;", "&")
    )


def _resolve_ordered_slides(entries: dict[str, str]) -> list[str]:
    pres_xml = entries.get("ppt/presentation.xml", "")
    pres_rels = entries.get("ppt/_rels/presentation.xml.rels", "")
    rel_map: dict[str, str] = {}
    rel_re = re.compile(
        r'<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"'
        r'|<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"'
    )
    for rm in rel_re.finditer(pres_rels):
        rid = rm.group(1) or rm.group(4) or ""
        raw_target = re.sub(r"^/+", "", rm.group(2) or rm.group(3) or "")
        raw_target = re.sub(r"^\.\./", "ppt/", raw_target)
        target = raw_target if raw_target.startswith("ppt/") else f"ppt/{raw_target}"
        rel_map[rid] = target
    ordered: list[str] = []
    for sm in re.finditer(r'<p:sldId\b[^>]*\br:id="([^"]+)"', pres_xml):
        target = rel_map.get(sm.group(1))
        if target and target in entries:
            ordered.append(target)
    if not ordered:
        fallback = [k for k in entries if re.match(r"^ppt/slides/slide\d+\.xml$", k)]
        fallback.sort(key=lambda k: int(re.search(r"\d+", k).group(0)))  # type: ignore[union-attr]
        ordered.extend(fallback)
    return ordered


def _probe_pptx_layout_monotony(ooxml_entries: dict[str, str] | None, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    if not ooxml_entries or not isinstance(ooxml_entries, dict):
        return []
    slides = _resolve_ordered_slides(ooxml_entries)
    content_slides: list[dict[str, Any]] = []
    min_words = int(cfg.get("minSlideLatinWords", 12))
    min_cjk = int(cfg.get("minSlideCjkChars", 25))

    for idx, entry_key in enumerate(slides):
        slide_num = idx + 1
        xml = str(ooxml_entries.get(entry_key, ""))
        if re.search(r'<p:sld\b[^>]*\bshow="0"', xml):
            continue

        text_parts: list[str] = []
        body_text_shapes = 0
        has_bullets = False
        for spm in re.finditer(r"<p:sp\b[\s\S]*?</p:sp>", xml):
            sp = spm.group(0)
            is_title = bool(re.search(r'<p:ph\b[^>]*\btype="(?:title|ctrTitle)"', sp))
            is_footer = bool(re.search(r'<p:ph\b[^>]*\btype="(?:sldNum|ftr|dt)"', sp))
            if is_footer:
                continue
            runs = [_decode_xml_simple(tm.group(1)) for tm in re.finditer(r"<a:t(?:\s[^>]*)?>([\s\S]*?)</a:t>", sp)]
            joined = "".join(runs).strip()
            if not joined:
                continue
            text_parts.append(joined)
            if not is_title:
                body_text_shapes += 1
                if re.search(r"<a:buChar\b|<a:buAutoNum\b", sp):
                    has_bullets = True

        full = " ".join(text_parts)
        cjk = len(re.findall(r"[\u4e00-\u9fff]", full))
        latin = len([w for w in full.split() if re.search(r"[A-Za-z0-9]", w)])
        has_visual = bool(re.search(r"<c:chart\b|<a:tbl\b|<p:pic\b", xml))
        if not has_visual and latin < min_words and cjk < min_cjk:
            continue

        is_plain_bullet_only = (not has_visual) and has_bullets and body_text_shapes <= 1
        content_slides.append({"slideNum": slide_num, "isPlainBulletOnly": is_plain_bullet_only})

    if len(content_slides) < int(cfg.get("minContentSlides", 5)):
        return []
    need_run = int(cfg.get("minConsecutivePlainBulletSlides", 4))
    run = 0
    for s in content_slides:
        if s["isPlainBulletOnly"]:
            run += 1
            if run == need_run:
                return [
                    {
                        "slideNum": s["slideNum"],
                        "match": f"{need_run}+ consecutive plain-bullet slides (out of {len(content_slides)} content slides)",
                        "metric": f"contentSlides={len(content_slides)}, consecutivePlainBullet={run}",
                    }
                ]
        else:
            run = 0
    return []


# ---------- Angle: Multi-Dimension Composite Stealth-Slop Fusion ----------

def _count_concrete_facts(raw_slice: str, fact_res: list[re.Pattern[str]]) -> int:
    return sum(len(pat.findall(raw_slice)) for pat in fact_res)


def _probe_composite_multi_signal(
    prose_text: str,
    raw_text: str,
    banks: dict[str, dict[str, Any]],
    existing_findings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    comp = banks.get("composite-fusion")
    if not comp:
        return []
    lex = banks.get("lexical-signals") or {}
    dr = banks.get("discourse-rhythm") or {}

    lex_signals = [
        {"id": s["id"], "re": re.compile(s["pattern"], re.I)}
        for s in [
            *(lex.get("zhCalqueCluster", {}).get("signals") or []),
            *(lex.get("enPhraseCluster", {}).get("signals") or []),
        ]
    ]

    zh_alts = "|".join(re.escape(x) for x in (dr.get("discourseMarkers", {}).get("zhLeadMarkers") or []))
    en_alts = "|".join(re.escape(x) for x in (dr.get("discourseMarkers", {}).get("enLeadMarkers") or []))
    disc_zh_re = re.compile(rf"(?:^|[。！？；\n]\s*)(?:{zh_alts})[，,：:]") if zh_alts else None
    disc_en_re = re.compile(rf"(?:^|[.!?;]\s+|^)(?:{en_alts})[,\s]", re.I | re.M) if en_alts else None

    framing_res = [re.compile(p, re.I) for p in (comp.get("weakFramingPatterns") or [])]
    fact_res = [re.compile(p, re.I) for p in (comp.get("concreteFactPatterns") or [])]

    line_starts = build_line_starts(raw_text)
    existing_lines = {f.get("line") for f in existing_findings}
    min_dims = int(comp.get("minDistinctDimensions", 3))
    max_facts = int(comp.get("maxFactSignals", 1))
    hits: list[dict[str, Any]] = []

    for para in _iter_prose_paragraphs(prose_text):
        if para["skippable"]:
            continue
        para_line, _ = offset_to_line_col(line_starts, para["index"])
        if para_line in existing_lines:
            continue

        raw_slice = raw_text[para["blockStart"] : para["blockStart"] + len(para["raw"])]
        fact_count = _count_concrete_facts(raw_slice, fact_res)
        if fact_count > max_facts:
            continue

        active_dims: list[str] = []

        lex_matched = [s["id"] for s in lex_signals if s["re"].search(para["raw"])]
        if lex_matched:
            active_dims.append(f"lexical({lex_matched[0]})")

        disc_hits = (
            (len(disc_zh_re.findall(para["trimmed"])) if disc_zh_re else 0)
            + (len(disc_en_re.findall(para["trimmed"])) if disc_en_re else 0)
        )
        if disc_hits >= 1:
            active_dims.append(f"discourse({disc_hits})")

        if any(pat.search(para["raw"]) for pat in framing_res):
            active_dims.append("framing")

        sents = re.findall(r"[^.!?。！？\n]+[.!?。！？]", para["raw"])
        has_mild_comma = any(len(re.findall(r"[，,]", _strip_formatted_numbers_and_code(s))) >= 4 for s in sents)
        has_mild_bold = len(re.findall(r"\*\*[^*\n`]{1,40}\*\*", raw_slice)) >= 3
        if has_mild_comma or has_mild_bold:
            active_dims.append("cadence")

        if len(active_dims) >= min_dims:
            hits.append(
                {
                    "index": para["index"],
                    "length": min(110, len(para["trimmed"])),
                    "metric": f"dims={len(active_dims)} [{'+'.join(active_dims)}], facts={fact_count}",
                }
            )
    return hits


def _probe_ui_gen2_tasteful_slop(raw_text: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    clean = _mask_ui_markup(raw_text)
    min_signals = int(cfg.get("minSignals", 2))
    signals: list[str] = []
    first_hit: dict[str, int] | None = None

    cream_m = re.search(r"#(?:faf8f5|f7f5f0|fbf9f6|f5f2eb|f9f6f0|fdfbf7|f4efe6)\b|\bbg-(?:stone|amber)-50\b", clean, re.I)
    terra_m = re.search(r"#(?:c45a3b|d97757|b85038|c85a32|c2410c|b45309)\b|\bterracotta\b|\b(?:text|bg)-orange-700\b", clean, re.I)
    if cream_m and terra_m:
        signals.append("cream-terracotta")
        first_hit = {"index": cream_m.start(), "length": cream_m.end() - cream_m.start()}

    italic_m = re.search(r"<h[1-3]\b[^>]*>[\s\S]{0,160}<(?:em|i|span[^>]*\bitalic\b)[^>]*>[^<]{2,40}</(?:em|i|span)>", clean, re.I)
    if italic_m:
        signals.append("serif-italic-headline")
        if not first_hit:
            first_hit = {"index": italic_m.start(), "length": min(80, italic_m.end() - italic_m.start())}

    inter_m = re.search(r"font-family\s*:[^;\n]{0,80}['\"]?Inter['\"]?|font-\[\s*['\"]?Inter['\"]?\s*\]", clean, re.I)
    if inter_m:
        signals.append("inter-default")
        if not first_hit:
            first_hit = {"index": inter_m.start(), "length": inter_m.end() - inter_m.start()}

    eyebrow_m = re.search(
        r"\b(?:tracking-(?:widest|wider|\[0\.[12]\d*em\])[^\"'\n>]{0,40}\buppercase\b|\buppercase[^\"'\n>]{0,40}\btracking-(?:widest|wider|\[0\.[12]\d*em\]))|letter-spacing\s*:\s*0\.[1-3]\d*em[^;]{0,60}text-transform\s*:\s*uppercase",
        clean,
        re.I,
    )
    shell_m = bool(re.search(r"\b(?:rounded-2xl|rounded-3xl|shadow-xl|shadow-lg)\b", clean))
    if eyebrow_m and shell_m:
        signals.append("tracked-eyebrow-shell")
        if not first_hit:
            first_hit = {"index": eyebrow_m.start(), "length": eyebrow_m.end() - eyebrow_m.start()}

    if len(signals) >= min_signals and first_hit:
        return [{**first_hit, "metric": f"gen2Signals={len(signals)} [{'+'.join(signals)}]"}]
    return []


# ---------- Main Pattern Library Multi-Angle Auditor ----------

def audit_patterns(
    text: str,
    *,
    filename: str = "<memory>",
    modality: str | None = None,
    banks: dict[str, dict[str, Any]] | None = None,
    angles: list[str] | None = None,
    ooxml: dict[str, str] | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = config or {}
    mod = modality or detect_modality(filename) or "markdown"
    line_starts = build_line_starts(text)
    zones = build_zones(text, mod, {"proseFences": cfg.get("proseFences"), "maskBlockquotes": cfg.get("maskBlockquotes")})
    by_target, _ = parse_suppressions(text)
    allow_list = [str(a).lower() for a in (cfg.get("allow") or [])]
    rule_overrides = cfg.get("rules") or {}
    b = banks if banks is not None else load_pattern_banks()
    allow_angle = lambda a: angles is None or a in angles
    findings: list[dict[str, Any]] = []

    def is_suppressed_or_off(rule_id: str, line: int, raw_match: str) -> bool:
        ov = rule_overrides.get(rule_id)
        if ov == "off" or ov is False:
            return True
        if raw_match and any(al in raw_match.lower() for al in allow_list):
            return True
        for sup in by_target.get(line, []):
            if "all" in sup["ruleIds"] or "*" in sup["ruleIds"] or rule_id in sup["ruleIds"]:
                return True
        return False

    def resolve_sev(rule_id: str, base_sev: str | None) -> str:
        ov = rule_overrides.get(rule_id)
        if ov in {"error", "warning", "info"}:
            return ov
        return base_sev or "info"

    def emit_hits(
        rule_meta: dict[str, Any],
        raw_hits: list[dict[str, Any]],
        message: dict[str, str],
        deletion_test: dict[str, str] | None = None,
    ) -> None:
        rid = rule_meta["ruleId"]
        ov_rid = rule_overrides.get(rid)
        if ov_rid == "off" or ov_rid is False:
            return
        for h in raw_hits:
            raw_match = text[h["index"] : h["index"] + h["length"]]
            line, col = offset_to_line_col(line_starts, h["index"])
            if is_suppressed_or_off(rid, line, raw_match):
                continue
            findings.append(
                _make_pattern_finding(
                    rule_id=rid,
                    dimension=rule_meta["dimension"],
                    detection_angle=rule_meta["detectionAngle"],
                    severity=resolve_sev(rid, rule_meta.get("severity")),
                    filename=filename,
                    modality=mod,
                    line=line,
                    col=col,
                    match=raw_match,
                    metric=h.get("metric", ""),
                    message=message,
                    deletion_test=deletion_test,
                )
            )

    dr = b.get("discourse-rhythm")
    if dr and mod in TEXT_MODALITIES:
        if allow_angle("rhythm-statistics"):
            if dr.get("commaChain"):
                emit_hits(
                    dr["commaChain"],
                    _probe_comma_chain(zones["prose"], text, dr["commaChain"]),
                    {
                        "en": "Single sentence chains 5+ comma-separated clauses in a flat cadence.",
                        "zh": "单句连续串联 5 个及以上逗号分句，形成平铺拖沓的逗号链节奏。",
                    },
                    {
                        "en": "Split into 2–3 shorter sentences at causal or chronological boundaries without dropping numbers.",
                        "zh": "按因果或时间停顿拆成 2 到 3 句，保留全部条件与数字，删掉多余顺承逗号。",
                    },
                )
            if dr.get("sentenceLengthMonotony"):
                emit_hits(
                    dr["sentenceLengthMonotony"],
                    _probe_sentence_length_monotony(zones["prose"], dr["sentenceLengthMonotony"]),
                    {
                        "en": "Paragraph exhibits metronome sentence-length uniformity (CV < 0.16 across >= 5 sentences).",
                        "zh": "段落内连续 5 句以上句长高度均一（CV < 0.16），呈现节拍器生成韵律。",
                    },
                    {
                        "en": "Merge related clauses or cut one sentence short to create natural length contrast.",
                        "zh": "把相邻因果合并成长句，并收短关键结论句，拉开长短句起伏。",
                    },
                )
            if dr.get("openerAnaphora"):
                emit_hits(
                    dr["openerAnaphora"],
                    _probe_opener_anaphora(zones["prose"], dr["openerAnaphora"]),
                    {
                        "en": "4+ consecutive prose sentences open with the identical mechanical prefix.",
                        "zh": "段落内连续 4 句及以上使用完全相同的机械句首开头。",
                    },
                    {
                        "en": "Vary sentence openings or move shared context into one topic sentence or clean list.",
                        "zh": "改写句首起笔，或把并列动作收拢成一句话或真实列表。",
                    },
                )
            if dr.get("inlineBoldSaturation") and mod in {"markdown", "text"}:
                emit_hits(
                    dr["inlineBoldSaturation"],
                    _probe_inline_bold_saturation(zones["prose"], text, dr["inlineBoldSaturation"]),
                    {
                        "en": "Dense inline `**bold**` highlight confetti inside a normal prose paragraph.",
                        "zh": "普通自然段内高密度堆砌 `**加粗词**` 高亮，呈现助手式排版噪点。",
                    },
                    {
                        "en": "Unbold inline phrases and keep emphasis only on 1 genuine key decision or caveat.",
                        "zh": "去掉多余行内加粗，仅保留最关键的一处结论或风险提示。",
                    },
                )
            if dr.get("paragraphLengthUniformity"):
                emit_hits(
                    dr["paragraphLengthUniformity"],
                    _probe_paragraph_length_uniformity(zones["prose"], dr["paragraphLengthUniformity"]),
                    {
                        "en": "Long document allocates nearly identical word budgets across >= 5 consecutive paragraphs.",
                        "zh": "连续 5 段及以上正文自然段字数高度均一（CV < 0.13），呈现均匀切块模板感。",
                    },
                    {
                        "en": "Combine two thin subsections or expand the load-bearing section with concrete details.",
                        "zh": "合并偏薄的过渡段落，把篇幅集中到真正有数据或机制的核心段落。",
                    },
                )
        if allow_angle("discourse-structure") and dr.get("discourseMarkers"):
            emit_hits(
                dr["discourseMarkers"],
                _probe_discourse_marker_cluster(zones["prose"], dr["discourseMarkers"]),
                {
                    "en": "Mechanical transition signposts stacked across consecutive paragraphs or sentences.",
                    "zh": "连续段落或句子堆砌机械过渡路标词（如“首先/其次/此外/最后”或连续“Furthermore/Moreover/Additionally”）。",
                },
                {
                    "en": "Delete additive signposts (`Moreover`, `Furthermore`) and connect steps by causal order.",
                    "zh": "删掉“首先/其次/此外/最后”一类空路标词，直接按动作先后或因果衔接。",
                },
            )

    lex = b.get("lexical-signals")
    if lex and mod in TEXT_MODALITIES and allow_angle("lexicon-cluster"):
        if lex.get("zhCalqueCluster"):
            emit_hits(
                lex["zhCalqueCluster"],
                _probe_lexical_cluster(zones["prose"], lex["zhCalqueCluster"]),
                {
                    "en": "Chinese AI translation-calque and hollow-connector cluster inside one paragraph.",
                    "zh": "单段内聚集多处中文 AI 翻译腔或空洞连接套语（如“在……的背景下/不可否认的是/扮演着重要角色”）。",
                },
                {
                    "en": "Cut hollow wrappers (`undeniably`, `plays a vital role`) and state the subject and action directly.",
                    "zh": "直接删掉“不可否认/扮演着角色/奠定基础”等空架子，主语紧接具体动作与结果。",
                },
            )
        if lex.get("enPhraseCluster"):
            emit_hits(
                lex["enPhraseCluster"],
                _probe_lexical_cluster(zones["prose"], lex["enPhraseCluster"]),
                {
                    "en": "Dense cluster of empirically over-represented English AI vocabulary in one paragraph.",
                    "zh": "单段内高频聚集多个大模型超额偏好英文词组（如 `meticulous`/`pivotal`/`holistic`/`foster`/`underscore`）。",
                },
                {
                    "en": "Swap abstract buzzwords (`foster`, `pivotal`, `seamless`) for plain verbs and concrete facts.",
                    "zh": "把虚浮高频词换成直白动词与可验证指标，不用靠叠词制造分量。",
                },
            )

    syn = b.get("syntactic-frames")
    if syn and mod in TEXT_MODALITIES and allow_angle("syntactic-frame"):
        if syn.get("concessionSymmetry"):
            pats = [*(syn["concessionSymmetry"].get("enPatterns") or []), *(syn["concessionSymmetry"].get("zhPatterns") or [])]
            emit_hits(
                syn["concessionSymmetry"],
                _probe_prose_regex_patterns(zones["prose"], pats),
                {
                    "en": "Formulaic both-sides concession frame ('While X presents challenges, it also offers tremendous opportunities').",
                    "zh": "模板化两面平衡让步句式（“虽然……面临挑战，但也带来了巨大机遇”）。",
                },
                {
                    "en": "Drop the both-sides cushion and state a clear recommendation with exact boundary conditions.",
                    "zh": "撤掉“有利有弊/既要又要”的端水套壳，直接给出明确判断或写清触发阈值。",
                },
            )
        if syn.get("pullQuoteCloser"):
            emit_hits(
                syn["pullQuoteCloser"],
                _probe_prose_regex_patterns(
                    zones["prose"],
                    syn["pullQuoteCloser"].get("patterns") or [],
                    skip_quoted=bool(syn["pullQuoteCloser"].get("skipQuoted")),
                ),
                {
                    "en": "Poster-style pull-quote punchline closer.",
                    "zh": "段尾硬加广告卡片式金句收尾（如“笔一直在你手里”“这才是……真正的温度”）。",
                },
                {
                    "en": "Cut the bumper-sticker sign-off and end on the last concrete fact or next action.",
                    "zh": "删掉结尾口号金句，让文章停在最后一条具体事实或下一步动作上。",
                },
            )
        if syn.get("rhetoricalSelfQa"):
            emit_hits(
                syn["rhetoricalSelfQa"],
                _probe_prose_regex_patterns(zones["prose"], syn["rhetoricalSelfQa"].get("patterns") or []),
                {
                    "en": "Staged rhetorical self-Q&A transition ('Why does this matter? Because...', '这意味着什么？意味着……').",
                    "zh": "正文内使用主持词式自问自答过渡句（如“这意味着什么？意味着……”“结果呢？……”）。",
                },
                {
                    "en": "Remove the staged question and state the consequence in one direct declarative sentence.",
                    "zh": "去掉“为什么重要？因为……”问答腔，用一句直白陈述句直接交代原因或后果。",
                },
            )

    vd = b.get("visual-deck")
    if vd and allow_angle("visual-markup-ooxml"):
        if mod in UI_MODALITIES:
            if vd.get("glassmorphismOveruse"):
                emit_hits(
                    vd["glassmorphismOveruse"],
                    _probe_ui_pattern_count(text, vd["glassmorphismOveruse"]),
                    {
                        "en": "Repeated `backdrop-blur` translucent panels (>= 3 per view) mimic default AI glassmorphism templates.",
                        "zh": "单视图重复堆砌 3 处及以上 `backdrop-blur` 毛玻璃半透明面板，呈现典型生成式模板特征。",
                    },
                    {
                        "en": "Replace stacked blur cards with crisp 1px borders and solid surface contrast.",
                        "zh": "撤掉满屏毛玻璃半透明层，改用清晰 1px 边框与实体背景区分层级。",
                    },
                )
            if vd.get("accentStripeCard"):
                emit_hits(
                    vd["accentStripeCard"],
                    _probe_ui_pattern_count(text, vd["accentStripeCard"]),
                    {
                        "en": "Repeated thick left accent-stripe cards (`border-l-4` / `border-left: >=4px solid`, >= 3 per view) signal boilerplate dashboards.",
                        "zh": "单视图堆叠 3 处及以上左侧粗彩条卡片（`border-l-4` / `border-left: >=4px solid`），呈现典型 AI 后台面板套路。",
                    },
                    {
                        "en": "Drop thick decorative side stripes and rely on alignment, spacing, and typography scale.",
                        "zh": "去掉卡片左侧装饰粗彩条，靠留白对齐和字阶主次划分模块。",
                    },
                )
            if vd.get("gen2TastefulSlop"):
                emit_hits(
                    vd["gen2TastefulSlop"],
                    _probe_ui_gen2_tasteful_slop(text, vd["gen2TastefulSlop"]),
                    {
                        "en": "Second-generation 'tasteful' AI UI template cluster (>= 2 of warm-cream/terracotta, serif-italic headline accent, Inter stack, tracked-uppercase eyebrow).",
                        "zh": "第二代“伪人文精致模板”组合特征（同时命中暖米白+陶土红配色、标题斜体强调词、Inter 默认字体或宽字距全大写眉题中 2 项及以上）。",
                    },
                    {
                        "en": "Cut generic template chrome (uppercase kickers, italic buzzword spans) and keep layout purposeful.",
                        "zh": "删掉宽字距全大写眉题和标题斜体装点，用项目真实品牌字体与克制版式。",
                    },
                )
        ov_m = rule_overrides.get(vd["pptxLayoutMonotony"]["ruleId"]) if (vd and vd.get("pptxLayoutMonotony")) else None
        if mod == "pptx" and ooxml and vd.get("pptxLayoutMonotony") and not (ov_m == "off" or ov_m is False):
            pm = vd["pptxLayoutMonotony"]
            for sh in _probe_pptx_layout_monotony(ooxml, pm):
                if is_suppressed_or_off(pm["ruleId"], sh["slideNum"], sh["match"]):
                    continue
                findings.append(
                    _make_pattern_finding(
                        rule_id=pm["ruleId"],
                        dimension=pm["dimension"],
                        detection_angle=pm["detectionAngle"],
                        severity=resolve_sev(pm["ruleId"], pm.get("severity")),
                        filename=filename,
                        modality=mod,
                        line=sh["slideNum"],
                        col=1,
                        location=f"slide {sh['slideNum']}",
                        match=sh["match"],
                        metric=sh["metric"],
                        message={
                            "en": "4+ consecutive content slides share the identical plain-bullet layout with no table, chart, or diagram.",
                            "zh": "连续 4 页及以上正文幻灯片均退化为纯字要点列表页（无图表、表格或配图），版式过于单调。",
                        },
                        deletion_test={
                            "en": "Turn data points into a comparison table or chart, or pair one claim with concrete visual evidence.",
                            "zh": "把连续文字清单改排成对比表格、结构图或数据卡片，打破连页纯字版式。",
                        },
                    )
                )

    comp = b.get("composite-fusion")
    if comp and mod in TEXT_MODALITIES and allow_angle("composite-cooccurrence"):
        emit_hits(
            comp,
            _probe_composite_multi_signal(zones["prose"], text, b, findings),
            {
                "en": "Multiple sub-threshold AI signals (lexical + discourse + framing/cadence) co-occur in one low-fact paragraph.",
                "zh": "同一低事实段落内叠加多个跨维度弱 AI 味信号（套词 + 过渡路标 + 抽象框架/节奏），虽未单点越线但整体 AI 腔明显。",
            },
            {
                "en": "Trim empty framing phrases and anchor the paragraph in at least one metric, file, date, or concrete decision.",
                "zh": "删掉空泛套词与过渡壳，至少补进一条实测指标、文件名、日期或明确取舍结论。",
            },
        )

    findings.sort(key=lambda f: (f.get("line", 0), f.get("col", 0), f["ruleId"]))
    return {"version": PATTERN_ENGINE_VERSION, "findings": findings}


def analyze_pattern_profile(text: str, **kwargs: Any) -> dict[str, Any]:
    res = audit_patterns(text, **kwargs)
    by_dim: dict[str, int] = {}
    by_angle: dict[str, int] = {}
    for f in res["findings"]:
        by_dim[f["dimension"]] = by_dim.get(f["dimension"], 0) + 1
        by_angle[f["detectionAngle"]] = by_angle.get(f["detectionAngle"], 0) + 1
    return {
        "version": PATTERN_ENGINE_VERSION,
        "findingCount": len(res["findings"]),
        "activeDimensions": sorted(by_dim.keys()),
        "byDimension": by_dim,
        "byAngle": by_angle,
        "findings": res["findings"],
    }
