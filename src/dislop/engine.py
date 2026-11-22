"""Zero-dependency Python 3.10+ core engine matching `src/core.mjs`."""

from __future__ import annotations

import bisect
import colorsys
import fnmatch
import json
import math
import os
import re
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any

ENGINE_VERSION = "0.7.1"

SEVERITY_RANK = {
    "info": 1,
    "warning": 2,
    "error": 3,
    "never": 99,
}

EXT_TO_MODALITY = {
    ".md": "markdown",
    ".mdx": "markdown",
    ".txt": "text",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".jsx": "jsx",
    ".tsx": "jsx",
    ".svg": "svg",
    ".docx": "docx",
    ".pptx": "pptx",
}

DEFAULT_IGNORE_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
}


def find_packs_dir() -> Path:
    pkg_packs = Path(__file__).resolve().parent / "packs"
    if pkg_packs.is_dir():
        return pkg_packs
    return Path(__file__).resolve().parent.parent.parent / "packs"


def load_all_packs(packs_dir: Path | None = None) -> dict[str, dict[str, Any]]:
    root = packs_dir or find_packs_dir()
    packs: dict[str, dict[str, Any]] = {}
    if not root.is_dir():
        return packs
    for child in sorted(root.iterdir()):
        manifest = child / "pack.json"
        if child.is_dir() and manifest.is_file():
            data = json.loads(manifest.read_text(encoding="utf-8"))
            packs[data["id"]] = data
    return packs


def load_config(cwd: Path | None = None, explicit_path: str | None = None) -> dict[str, Any]:
    root = cwd or Path.cwd()
    base: dict[str, Any] = {}
    candidates = (
        [root / explicit_path]
        if explicit_path
        else [root / ".dislop.json", root / "dislop.json", root / ".disloprc.json"]
    )
    for cand in candidates:
        if cand.is_file():
            base = json.loads(cand.read_text(encoding="utf-8"))
            break

    local_path = root / ".dislop.local.json"
    if local_path.is_file():
        local_cfg = json.loads(local_path.read_text(encoding="utf-8"))
        merged = {**base, **local_cfg}
        merged["rules"] = {**base.get("rules", {}), **local_cfg.get("rules", {})}
        merged["allow"] = [*base.get("allow", []), *local_cfg.get("allow", [])]
        merged["ignore"] = [*base.get("ignore", []), *local_cfg.get("ignore", [])]
        merged["forbid"] = [*base.get("forbid", []), *local_cfg.get("forbid", [])]
        base = merged
    return base


def detect_modality(filename: str) -> str | None:
    if not filename or filename == "<memory>":
        return "markdown"
    ext = Path(filename).suffix.lower()
    if not ext:
        return None
    return EXT_TO_MODALITY.get(ext)


def default_pack_for_modality(modality: str) -> str:
    if modality in {"html", "css", "jsx", "svg", "pptx"}:
        return "deck-and-ui"
    return "business-brief"


def _expand_braces(pattern: str) -> list[str]:
    m = re.search(r"\{([^{}]+)\}", pattern)
    if not m:
        return [pattern]
    prefix, suffix = pattern[: m.start()], pattern[m.end() :]
    out: list[str] = []
    for part in m.group(1).split(","):
        out.extend(_expand_braces(prefix + part.strip() + suffix))
    return out


def _glob_to_regex(glob_pat: str) -> re.Pattern[str]:
    norm = glob_pat.replace("\\", "/").removeprefix("./")
    rx = ["^"]
    i = 0
    while i < len(norm):
        ch = norm[i]
        if ch == "*" and i + 1 < len(norm) and norm[i + 1] == "*":
            if i + 2 < len(norm) and norm[i + 2] == "/":
                rx.append("(?:.+/)?")
                i += 3
                continue
            rx.append(".*")
            i += 2
            continue
        if ch == "*":
            rx.append("[^/]*")
        elif ch == "?":
            rx.append("[^/]")
        elif ch in "+.^$|()[]{}":
            rx.append("\\" + ch)
        else:
            rx.append(ch)
        i += 1
    rx.append("$")
    return re.compile("".join(rx))


def matches_any_glob(rel_posix: str, globs: list[str]) -> bool:
    clean = rel_posix.removeprefix("./")
    for raw in globs:
        for pat in _expand_braces(raw):
            if _glob_to_regex(pat).match(clean):
                return True
    return False


def pick_pack_for_file(rel_posix: str, modality: str, explicit_pack: str | None, config: dict[str, Any]) -> str:
    if explicit_pack:
        return explicit_pack
    for ov in config.get("overrides", []):
        files = ov.get("files", [])
        patterns = files if isinstance(files, list) else [files]
        if ov.get("pack") and matches_any_glob(rel_posix, patterns):
            return ov["pack"]
    if config.get("pack"):
        return str(config["pack"])
    return default_pack_for_modality(modality)


def resolve_effective_pack(
    pack_id: str,
    packs_by_id: dict[str, dict[str, Any]],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = config or {}
    if pack_id not in packs_by_id:
        available = ", ".join(sorted(packs_by_id))
        raise ValueError(f"Unknown Taste Pack '{pack_id}'. Available packs: {available}")

    chain: list[dict[str, Any]] = []
    visited: set[str] = set()

    def collect(pid: str) -> None:
        if pid in visited:
            return
        visited.add(pid)
        p = packs_by_id.get(pid)
        if not p:
            return
        for parent in p.get("extends", []):
            collect(parent)
        chain.append(p)

    collect(pack_id)

    merged_thresholds: dict[str, Any] = {}
    rules_by_id: dict[str, dict[str, Any]] = {}
    rule_overrides = cfg.get("rules", {})

    for p in chain:
        merged_thresholds.update(p.get("thresholds", {}))
        for rule in p.get("rules", []):
            rid = rule["id"]
            ov = rule_overrides.get(rid)
            if ov == "off" and rule.get("tier") != "invariant":
                rules_by_id.pop(rid, None)
                continue
            eff = dict(rule)
            if isinstance(ov, str) and ov in SEVERITY_RANK and rule.get("tier") != "invariant":
                eff["severity"] = ov
            rules_by_id[rid] = eff

    forbid_list = cfg.get("forbid", [])
    if isinstance(forbid_list, list) and forbid_list:
        rules_by_id["local-custom-forbid"] = {
            "id": "local-custom-forbid",
            "tier": "invariant",
            "severity": "error",
            "family": "hygiene/forbid",
            "probe": "regex",
            "zones": ["raw"],
            "modalities": ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx", "pdf"],
            "patterns": forbid_list,
            "message": {
                "en": "Matched forbidden pattern from local `.dislop.local.json` policy.",
                "zh": "命中本地 `.dislop.local.json` 私有禁止词规则。",
            },
            "deletionTest": {
                "en": "Remove or de-identify the forbidden private term before committing.",
                "zh": "提交前删除或脱敏该私有敏感词。",
            },
            "exemplar": None,
        }

    target = dict(packs_by_id[pack_id])
    target["thresholds"] = merged_thresholds
    target["rules"] = list(rules_by_id.values())
    return target


def fnv1a_hex(text: str) -> str:
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def _preserve_lines_blank(match: re.Match[str]) -> str:
    return re.sub(r"[^\r\n]", " ", match.group(0))


def build_line_starts(text: str) -> list[int]:
    starts = [0]
    for idx, ch in enumerate(text):
        if ch == "\n":
            starts.append(idx + 1)
    return starts


def offset_to_line_col(line_starts: list[int], offset: int) -> tuple[int, int]:
    line_idx = max(0, bisect.bisect_right(line_starts, offset) - 1)
    col = (offset - line_starts[line_idx]) + 1
    return line_idx + 1, col


def _is_sentence_break_at(text: str, idx: int) -> bool:
    if idx < 0 or idx >= len(text):
        return False
    ch = text[idx]
    if ch not in "\n.!?。！？":
        return False
    if ch != ".":
        return True
    prev_ch = text[idx - 1] if idx > 0 else ""
    next_ch = text[idx + 1] if idx + 1 < len(text) else ""
    if prev_ch.isdigit() and next_ch.isdigit():
        return False
    before_word = text[max(0, idx - 6) : idx]
    if re.search(r"(?:^|\s)(?:vs|v|approx|e\.g|i\.e)$", before_word, re.I):
        return False
    return True


def enclosing_sentence(text: str, start: int, end: int) -> str:
    left = start
    while left > 0 and not _is_sentence_break_at(text, left - 1):
        left -= 1
    right = end
    while right < len(text) and not _is_sentence_break_at(text, right):
        right += 1
    if right < len(text) and text[right] in ".!?。！？":
        right += 1
    return re.sub(r"^[\s\ufeff]+|[\s\ufeff]+$", "", text[left:right])[:240]


def parse_suppressions(text: str) -> tuple[dict[int, list[dict[str, Any]]], list[dict[str, Any]]]:
    lines = text.splitlines()
    by_target: dict[int, list[dict[str, Any]]] = {}
    directives: list[dict[str, Any]] = []
    patterns = [
        re.compile(r"<!--\s*dislop-(?:ignore|disable)-next-line\s+([a-z0-9_*, -]+?)\s*--\s*(.+?)\s*-->", re.I),
        re.compile(r"/\*\s*dislop-(?:ignore|disable)-next-line\s+([a-z0-9_*, -]+?)\s*--\s*(.+?)\s*\*/", re.I),
    ]
    for i, line in enumerate(lines):
        for pat in patterns:
            m = pat.search(line)
            if m:
                rule_ids = [s.strip() for s in re.split(r"[,\s]+", m.group(1)) if s.strip()]
                reason = m.group(2).strip()
                target_line = i + 2
                while target_line <= len(lines) and not lines[target_line - 1].strip():
                    target_line += 1
                entry = {
                    "directiveLine": i + 1,
                    "targetLine": target_line,
                    "ruleIds": rule_ids,
                    "reason": reason,
                    "used": False,
                }
                directives.append(entry)
                by_target.setdefault(target_line, []).append(entry)
    return by_target, directives


def build_zones(raw_text: str, modality: str) -> dict[str, str]:
    norm_text = str(raw_text or "").replace("\ufeff", " ")
    raw = re.sub(r"<!--\s*dislop-[\s\S]*?-->", _preserve_lines_blank, norm_text, flags=re.I)
    raw = re.sub(r"/\*\s*dislop-[\s\S]*?\*/", _preserve_lines_blank, raw, flags=re.I)

    # Mask quote-specimen blocks BEFORE masking general HTML comments/directives
    ui_text = re.sub(
        r"<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->",
        _preserve_lines_blank,
        norm_text,
        flags=re.I,
    )
    ui_text = re.sub(r"<!--[\s\S]*?-->", _preserve_lines_blank, ui_text)
    ui_text = re.sub(r"/\*\s*dislop-[\s\S]*?\*/", _preserve_lines_blank, ui_text, flags=re.I)
    ui_text = re.sub(r"<(script|style|code|pre|del|kbd)\b[^>]*>[\s\S]*?</\1>", _preserve_lines_blank, ui_text, flags=re.I)

    prose = ui_text
    if modality in {"markdown", "text"}:
        prose = re.sub(r"^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)", _preserve_lines_blank, prose)
        prose = re.sub(r"```[\s\S]*?```", _preserve_lines_blank, prose)
        prose = re.sub(r"~~~[\s\S]*?~~~", _preserve_lines_blank, prose)
        prose = re.sub(r"^[ \t]*```[\s\S]*$", _preserve_lines_blank, prose, flags=re.M)
        prose = re.sub(r"^[ \t]*~~~[\s\S]*$", _preserve_lines_blank, prose, flags=re.M)
        prose = re.sub(r"`[^`\n]+`", _preserve_lines_blank, prose)
        prose = re.sub(r"~~[^~\n]+~~", _preserve_lines_blank, prose)
        prose = re.sub(r"^[ \t]*>.*$", _preserve_lines_blank, prose, flags=re.M)
        prose = re.sub(r"\]\([^)\n]+\)", lambda m: "]" + re.sub(r"[^\r\n]", " ", m.group(0)[1:]), prose)
    elif modality in {"html", "jsx", "svg"}:
        prose = re.sub(r"<[^>]+>", _preserve_lines_blank, prose)

    prose = re.sub(r"https?://[^\s)>\"'`]+", _preserve_lines_blank, prose)
    if modality in {"html", "jsx", "svg"}:
        ui_text = re.sub(r"<[^>]+>", _preserve_lines_blank, ui_text)

    return {"raw": raw, "prose": prose, "ui-text": ui_text}


def make_finding(
    *,
    rule: dict[str, Any],
    filename: str,
    modality: str,
    location: str,
    line: int = 1,
    col: int = 1,
    span: dict[str, int] | None = None,
    match: str,
    sentence: str = "",
) -> dict[str, Any]:
    norm_match = re.sub(r"^[\s\ufeff]+|[\s\ufeff]+$", "", match.lower())
    norm_sent = re.sub(r"[\s\ufeff]+", " ", (sentence or norm_match).lower()).strip()
    fp = rule['id'] + ':' + fnv1a_hex(f"{rule['id']}|{norm_match}|{norm_sent}")
    return {
        "fingerprint": fp,
        "ruleId": rule["id"],
        "tier": rule.get("tier", "taste"),
        "severity": rule.get("severity", "warning"),
        "family": rule.get("family", "general"),
        "file": filename,
        "modality": modality,
        "location": location,
        "line": line,
        "col": col,
        "span": span,
        "match": match,
        "message": rule["message"],
        "deletionTest": rule.get("deletionTest"),
        "exemplar": rule.get("exemplar"),
    }


# ---------- Probes ----------

def _probe_negation_pivot(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    zh_re = re.compile(
        r"(?:(?:这|那|它)?(?:(?:并)?不(?:是|只是|仅仅?是)|绝非|并非(?:只是)?)|与其说是?)([^，。！？；\n]{1,22})[，,；—]+\s*(?:而是|更是|不如说是?)([^。！？；\n]{1,28})"
    )
    zh_rhet_head = re.compile(r"^(?:(?:这|那|它)|绝非|并非|与其|并?不(?:只是|仅仅?是))")
    zh_factual_cause = re.compile(r"(?:报错|故障|原因|超时|磁盘|内存|耗尽|端口|进程|导致|因为|[A-Za-z_][A-Za-z0-9_-]{2,})")
    for m in zh_re.finditer(prose_text):
        clause_a, clause_b = (m.group(1) or "").strip(), (m.group(2) or "").strip()
        raw_slice = raw_text[m.start() : m.end()]
        context_before = raw_text[max(0, m.start() - 12) : m.start()]
        both_concrete = (
            (bool(re.search(r"\d", clause_a)) and bool(re.search(r"\d", clause_b)))
            or "`" in raw_slice
            or bool(re.search(r"\.[a-z]{2,4}\b", raw_slice, re.I))
            or bool(re.search(r"(?:第一次|第二次|站台|号楼|排第|星期|周[一二三四五六日天])", raw_slice))
        )
        if both_concrete or len(clause_b) > 26 or not clause_a or not clause_b:
            continue
        if not zh_rhet_head.search(m.group(0)) and zh_factual_cause.search(context_before + raw_slice):
            continue
        hits.append({"index": m.start(), "length": m.end() - m.start()})

    en_re = re.compile(
        r"\b(?:(?:(?:it|this|that)(?:'s| is| was)|they(?:'re| are))\s+not|(?:(?:it|this|that|they)\s+)?(?:isn't|wasn't|aren't|is not|was not|are not))\s+(?:just|merely|simply|only)\s+([^.;!?\n—–]{2,50}?)(?:[,;—–-]\s*(?:but|it(?:'s| is| was)|that(?:'s| is| was)|they(?:'re| are))\s+)([^.!?\n]{2,70})"
        r"|\b(?:It|This|That)\s+(?:isn't|wasn't|is not|was not)\s+(?:a\s+|an\s+|just\s+)?([A-Za-z][A-Za-z0-9 -]{1,32}?)\s*(?:[.!]\s+|[—–-]\s*)(?:it's|it is|it was|that's)\s+([^.!?\n]{2,70})",
        re.I,
    )
    for m in en_re.finditer(prose_text):
        clause_a = m.group(1) or m.group(3) or ""
        clause_b = m.group(2) or m.group(4) or ""
        raw_slice = raw_text[m.start() : m.end()]
        if (bool(re.search(r"\d", clause_a)) and bool(re.search(r"\d", clause_b))) or "`" in raw_slice or re.search(r"\.[a-z]{2,4}\b", raw_slice, re.I):
            continue
        hits.append({"index": m.start(), "length": m.end() - m.start()})
    return hits


def _probe_staccato_run(prose_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for pm in re.finditer(r"[^\n]+(?:\n(?!\s*\n)[^\n]+)*", prose_text):
        para = pm.group(0)
        trimmed = para.strip()
        if not trimmed or re.match(r"^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)", trimmed):
            continue
        sentences: list[dict[str, Any]] = []
        for sm in re.finditer(r"[^.!?。！？\n]+[.!?。！？]", para):
            s = sm.group(0).strip()
            if not s:
                continue
            body = re.sub(r"[.!?。！？]+$", "", s).strip()
            if not body:
                continue
            cjk = len(re.findall(r"[\u4e00-\u9fff]", body))
            en_words = len([w for w in body.split() if re.search(r"[A-Za-z0-9]", w)])
            is_short = (
                2 <= cjk <= 6 and en_words <= 1 and not re.search(r"[，,：:；;]", body)
            ) or (cjk == 0 and 2 <= en_words <= 4 and not re.search(r"[,:;]", body))
            lead_offset = sm.group(0).find(s)
            start = pm.start() + sm.start() + lead_offset
            sentences.append({"start": start, "end": start + len(s), "isShort": is_short})

        run_start = -1
        run_count = 0
        for idx in range(len(sentences) + 1):
            cur = sentences[idx] if idx < len(sentences) else None
            if cur and cur["isShort"]:
                if run_count == 0:
                    run_start = idx
                run_count += 1
            else:
                if run_count >= 3:
                    first = sentences[run_start]
                    last = sentences[idx - 1]
                    hits.append({"index": first["start"], "length": last["end"] - first["start"]})
                run_count = 0
    return hits


def _probe_zh_four_char_triad(prose_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    entity_suffix = re.compile(r"(?:大学|学院|学校|公司|集团|银行|医院|中心|委员|政府|部门|机场|车站|高速|铁路|[省市区县镇乡])$")
    broken_slice = re.compile(r"[的了在或与及把被]")
    pat = re.compile(
        r"(?:^|[，。！？；：、“‘（\s]|(?:实现|具备|坚持|保持|做到|形成|打造|追求|提供|确保|了|是|的|以|向|为))"
        r"([\u4e00-\u9fff]{4})[、，,]\s*([\u4e00-\u9fff]{4})[、，,]\s*([\u4e00-\u9fff]{4})"
        r"(?=$|[，。！？；：、”’）\s]|[的地等])"
    )
    for m in pat.finditer(prose_text):
        items = [m.group(1), m.group(2), m.group(3)]
        if any(entity_suffix.search(w) or broken_slice.search(w) for w in items):
            continue
        start_offset = m.start(1)
        if start_offset > 0 and prose_text[start_offset - 1] == "《":
            continue
        hits.append({"index": start_offset, "length": m.end() - start_offset})
    return hits


def _probe_unsourced_attribution(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    pat = re.compile(
        r"\b(?:[Ss]tudies|[Rr]esearch|[Ii]ndustry\s+research|[Ee]xperts|[Dd]ata)\s+(?:shows?|suggests?|indicates?|proves?)\b"
        r"|(?:研究|数据|专家|业内人士|行业报告)(?:表明|显示|指出|认为)[，,]?"
    )
    for m in pat.finditer(prose_text):
        win = raw_text[max(0, m.start() - 30) : min(len(raw_text), m.start() + 180)]
        has_source = bool(
            re.search(r"\[\^?\d+\]", win)
            or re.search(r"\]\([^)]+\)", win)
            or "http://" in win
            or "https://" in win
            or re.search(r"\([^()\n]{2,40},\s*(?:19|20)\d{2}[a-z]?\)", win)
            or re.search(r"《[^》\n]{2,30}》", win)
            or re.search(r"(?:见|参见|详见)\s*\[", win)
        )
        if not has_source:
            hits.append({"index": m.start(), "length": m.end() - m.start()})
    return hits


def _probe_bold_lead_list_wall(prose_text: str, raw_text: str, min_run: int = 4) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    lines = raw_text.splitlines()
    offset = 0
    run_start = 0
    run_end = 0
    run_count = 0

    for i in range(len(lines) + 1):
        line = lines[i] if i < len(lines) else ""
        prose_line = prose_text[offset : offset + len(line)] if i < len(lines) else ""
        is_bullet = bool(
            prose_line.strip()
            and re.match(r"^\s*(?:[-*+]|\d+[.)])\s+\*\*([^*\n`]{2,36})\*\*\s*[:：—-]", line)
        )
        if is_bullet:
            if run_count == 0:
                first_non_ws = len(line) - len(line.lstrip())
                run_start = offset + first_non_ws
            run_count += 1
            run_end = offset + len(line)
        elif i == len(lines) or line.strip():
            if run_count >= min_run:
                hits.append({"index": run_start, "length": run_end - run_start})
            run_count = 0
        offset += len(line) + 1
    return hits


def _probe_em_dash_density(prose_text: str, max_per_300: int = 4) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for pm in re.finditer(r"[^\n]+(?:\n(?!\s*\n)[^\n]+)*", prose_text):
        para = pm.group(0)
        if para.lstrip().startswith("|"):
            continue
        normalized = para.replace("——", "—")
        dashes = normalized.count("—")
        if dashes < 5:
            continue
        cjk = len(re.findall(r"[\u4e00-\u9fff]", normalized))
        en_words = len([w for w in normalized.split() if re.search(r"[A-Za-z0-9]", w)])
        units = max(1.0, en_words + cjk * 0.6)
        if (dashes / units) * 300 > max_per_300:
            first_dash = max(0, para.find("—"))
            hits.append({"index": pm.start() + first_dash, "length": min(len(para), 48)})
    return hits


# ---------- Multi-Angle Text Anti-Slop Probes & Stylometric Profile ----------

ZH_SUBTLE_MARKERS = [
    "有效推动", "持续优化", "显著提升", "进一步助力", "助力", "精细化运营",
    "深度融合", "充分释放", "创新潜能", "高度敏捷", "决策支撑体系", "复杂多变",
    "整体服务质量", "品牌竞争力", "协同效率", "交互体验", "核心竞争力",
    "新篇章", "新台阶", "新阶段", "充分保障", "轻量化交互", "一线响应速度",
    "不可逆转", "集体记忆", "呼吸感", "宏大叙事", "触手可及",
]

EN_SUBTLE_MARKERS = [
    "leverages", "leverage", "leveraging", "seamlessly", "streamline", "streamlines",
    "foster", "fostering", "robust", "empowers", "empower", "stakeholders",
    "navigate", "comprehensive", "harnesses", "harness", "elevate", "pivotal",
    "transformative", "transformative outcomes", "pivotal alignment", "transparent alignment",
    "resilience", "synergy", "holistic", "ecosystem", "actionable", "unparalleled",
]

ZH_DISCOURSE_MARKERS = [
    "此外", "与此同时", "不仅如此", "总而言之", "综上所述", "换言之",
    "进一步来看", "诚然", "综合来看", "归根结底",
]

EN_DISCOURSE_MARKERS = [
    "furthermore", "moreover", "additionally", "consequently",
    "in conclusion", "notably", "at the same time",
]


def _build_ascii_phrase_regex(phrase: str, flags: int = re.I) -> re.Pattern[str]:
    body = r"\s+".join(re.escape(part) for part in str(phrase).strip().split())
    return re.compile(rf"(?<![A-Za-z0-9_]){body}(?![A-Za-z0-9_])", flags)


def _round_non_neg(val: float, digits: int = 2) -> float:
    factor = 10 ** digits
    return math.floor(max(0.0, float(val)) * factor + 0.5) / factor


def _count_text_units_tenths(s: str) -> int:
    cjk = len(re.findall(r"[\u4e00-\u9fff]", s))
    en = len(re.findall(r"[A-Za-z0-9]+", s))
    return cjk * 6 + en * 10


def _count_text_units(s: str) -> float:
    return _count_text_units_tenths(s) / 10.0


def _count_concreteness_anchors(raw_slice: str) -> int:
    s = re.sub(r"<!--[\s\S]*?-->", " ", str(raw_slice or ""))
    count = 0
    count += len(re.findall(r"(?<![A-Za-z0-9_])\d+(?:[.,:]\d+)?%?(?![A-Za-z0-9_])", s))
    count += len(re.findall(r"`[^`\n]+`", s))
    count += len(re.findall(r"[/\\][A-Za-z0-9._-]+\.[a-z]{1,5}(?![A-Za-z0-9_])", s, re.I))
    count += len(re.findall(r"(?<![A-Za-z0-9_])(?:PR\s*#?\d+|v\d+\.\d+|HTTP\s*\d{3}|UTC|Q[1-4])(?![A-Za-z0-9_])", s))
    count += len(
        re.findall(
            r"(?:[一二三四五六七八九十两百千万]+[天月年次个张条座块斤米秒分时]|周[一二三四五六日天]|昨天|昨晚|今早|上周|下周|去年|前年|清晨|傍晚|凌晨|午后|十月|十一月|十二月)",
            s,
        )
    )
    return count


def _is_structured_line(trimmed_line: str) -> bool:
    return bool(re.match(r"^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)", trimmed_line))


def _extract_prose_paragraphs(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    paras: list[dict[str, Any]] = []
    n = len(prose_text)
    pos = 0
    cur_start = -1
    cur_end = -1

    def flush() -> None:
        nonlocal cur_start, cur_end
        if cur_start == -1 or cur_end <= cur_start:
            cur_start = -1
            cur_end = -1
            return
        text = prose_text[cur_start:cur_end]
        trimmed = text.strip()
        if trimmed:
            lead = text.find(trimmed)
            start = cur_start + max(0, lead)
            raw_slice = raw_text[cur_start:cur_end]
            paras.append({"start": start, "end": cur_end, "base": cur_start, "text": text, "trimmed": trimmed, "rawSlice": raw_slice})
        cur_start = -1
        cur_end = -1

    while pos <= n:
        nl = prose_text.find("\n", pos)
        line_end = n if nl == -1 else nl
        trim_prose = prose_text[pos:line_end].strip()
        trim_raw = raw_text[pos:line_end].strip()
        if not trim_prose or _is_structured_line(trim_prose) or _is_structured_line(trim_raw):
            flush()
        else:
            if cur_start == -1:
                cur_start = pos
            cur_end = line_end
        if nl == -1:
            break
        pos = nl + 1
    flush()
    return paras


def _split_prose_sentences_with_offsets(para: dict[str, Any]) -> list[dict[str, Any]]:
    """Linear O(n) sentence scanner with exact offsets (zero regex backtracking)."""
    out: list[dict[str, Any]] = []
    text = para["text"]
    base = para["base"]
    n = len(text)
    i = 0
    end_punct = set("。！？.!?")

    while i < n:
        while i < n and text[i] in "\n\r \t":
            i += 1
        if i >= n:
            break
        seg_start = i
        while i < n and text[i] != "\n" and text[i] not in end_punct:
            i += 1
        while i < n and text[i] in end_punct:
            i += 1
        seg_end = i
        while seg_end > seg_start and text[seg_end - 1] in " \t\r":
            seg_end -= 1
        if seg_end - seg_start >= 3:
            out.append({"start": base + seg_start, "end": base + seg_end, "text": text[seg_start:seg_end]})
        if i < n and text[i] == "\n":
            i += 1
    return out


def _probe_cooccurrence_slop_cluster(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    en_sci_robust_re = re.compile(
        r"(?<![A-Za-z0-9_])(?:robust\s+(?:estimator|regression|standard|statistics|variance|backoff|retry|inference|control|error\s+handling|parser|parsing|validation|recovery|fallback)|comprehensive\s+test(?:s|\s+suite)?)(?![A-Za-z0-9_])",
        re.I,
    )
    for para in _extract_prose_paragraphs(prose_text, raw_text):
        found: dict[str, tuple[int, int]] = {}
        base = para["base"]
        for term in ZH_SUBTLE_MARKERS:
            idx = para["text"].find(term)
            if idx != -1:
                if term == "助力" and "进一步助力" in found:
                    continue
                found[term] = (base + idx, base + idx + len(term))
        low_para = en_sci_robust_re.sub(lambda m: " " * len(m.group(0)), para["text"].lower())
        for term in EN_SUBTLE_MARKERS:
            m = _build_ascii_phrase_regex(term, re.I).search(low_para)
            if m:
                stem = re.sub(r"(?:ing|es|s)$", "", term)
                key = f"en:{stem}"
                if key not in found:
                    found[key] = (base + m.start(), base + m.end())
        distinct = len(found)
        if distinct < 2:
            continue
        units_tenths = max(10, _count_text_units_tenths(para["text"]))
        concreteness = (_count_concreteness_anchors(para["rawSlice"]) * 1000.0) / units_tenths
        if distinct >= 3 or (distinct >= 2 and concreteness < 6.0):
            spans = sorted(found.values(), key=lambda x: x[0])
            first = spans[0][0]
            last = spans[-1][1]
            hits.append({"index": first, "length": min(140, max(1, last - first))})
    return hits


def _probe_semicolon_tricolon(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    legal_guard = re.compile(
        r"(?<![A-Za-z0-9_])(?:shall|must|hereby|pursuant\s+to|provided\s+that)(?![A-Za-z0-9_])|(?:应当|须于|不得|依照)",
        re.I,
    )
    for para in _extract_prose_paragraphs(prose_text, raw_text):
        masked = para["text"]
        masked = re.sub(r"\([^)\n]*[;；][^)\n]*\)", lambda m: " " * len(m.group(0)), masked)
        masked = re.sub(r"（[^）\n]*[;；][^）\n]*）", lambda m: " " * len(m.group(0)), masked)
        masked = re.sub(r"“[^”\n]*[;；][^”\n]*”", lambda m: " " * len(m.group(0)), masked)
        masked = re.sub(r'"[^"\n]*[;；][^"\n]*"', lambda m: " " * len(m.group(0)), masked)
        masked_para = {**para, "text": masked}
        for s in _split_prose_sentences_with_offsets(masked_para):
            if re.search(r"[A-Za-z0-9_-]+\s*[:=]\s*[^;；\n]+[;；]", s["text"]):
                continue
            if re.match(r"^[^;；。！？.!?\n]{2,32}[：:]", s["text"]):
                continue
            if legal_guard.search(s["text"]):
                continue
            raw_sent = raw_text[s["start"] : s["end"]]
            tech_refs = len(re.findall(r"`[^`\n]+`|\]\([^)\n]+\)", raw_sent))
            if tech_refs >= 2:
                continue
            semis = len(re.findall(r"[;；]", s["text"]))
            if semis >= 2:
                hits.append({"index": s["start"], "length": min(140, len(s["text"]))})
    return hits


def _probe_rhetorical_qa_cadence(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for para in _extract_prose_paragraphs(prose_text, raw_text):
        base = para["base"]
        text = para["text"]
        for m in re.finditer(r"(?:为什么|为何)[^？?\n]{3,35}[？?]\s*(?:因为|原因(?:很|其实)?(?:简单|在于))", text):
            abs_idx = base + m.start()
            prev = raw_text[abs_idx - 1] if abs_idx > 0 else ""
            if prev and prev in '：:“"「『':
                continue
            hits.append({"index": abs_idx, "length": m.end() - m.start()})
        for m in re.finditer(r"(?:^|[。！？\n]\s*)(?:结果呢|原因呢|真相呢|代价呢)[？?]", text):
            lead = re.match(r"^[。！？\s]+", m.group(0))
            off = len(lead.group(0)) if lead else 0
            hits.append({"index": base + m.start() + off, "length": m.end() - m.start() - off})
        for m in re.finditer(r"(?<![A-Za-z0-9_])Why\s+(?:do|does|did|is|are)\s+[^?\n]{6,80}\?\s*Because(?![A-Za-z0-9_])", text, re.I):
            hits.append({"index": base + m.start(), "length": m.end() - m.start()})
        for m in re.finditer(r"(?:^|[.!?]\s+)(?:The\s+(?:result|reason|catch|truth|reality|secret))\?\s+[A-Z]", text):
            lead = re.match(r"^[.!?\s]+", m.group(0))
            off = len(lead.group(0)) if lead else 0
            hits.append({"index": base + m.start() + off, "length": m.end() - m.start() - off})
    return hits


def _probe_comma_chain_runon(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for para in _extract_prose_paragraphs(prose_text, raw_text):
        for s in _split_prose_sentences_with_offsets(para):
            cleaned = re.sub(r"(\d),(\d{3})(?!\d)", r"\1\2", s["text"])
            cleaned = re.sub(r"\([^)\n]{1,60}\)", " ", cleaned)
            cleaned = re.sub(r"（[^）\n]{1,60}）", " ", cleaned)
            commas = len(re.findall(r"[，,]", cleaned))
            if commas < 5:
                continue
            parts = [p.strip() for p in re.split(r"[，,]", cleaned) if p.strip()]
            if len(parts) < 6:
                continue
            clause_parts = 0
            for p in parts:
                cjk = len(re.findall(r"[\u4e00-\u9fff]", p))
                en_words = len(re.findall(r"[A-Za-z]+", p))
                has_gerund = bool(re.search(r"\b[a-z]{3,}ing\b", p, re.I))
                if cjk >= 6 or en_words >= 4 or (en_words >= 3 and has_gerund):
                    clause_parts += 1
            if clause_parts < 5:
                continue
            hits.append({"index": s["start"], "length": min(140, len(s["text"]))})
    return hits


def _probe_narrative_sandwich_frame(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    pats = [
        (r"(?:^|\n\s*)(?:随着[^，。\n]{2,18}(?:飞速|快速|不断|持续)(?:发展|深入|演进|推进)|在(?:当今|快节奏的)[^，。\n]{2,16}(?:时代|生活|社会)中?)", 0),
        (r"(?:^|\n\s*)(?:As\s+(?:organizations|teams|companies|distributed\s+teams)\s+(?:navigate|scale|adapt)[^,.\n]{2,60}|In\s+an\s+era\s+(?:defined\s+by|of|where)[^,.\n]{2,60})", re.I),
        (r"(?:展望未来[，,]|携手[^，。！？\n]{1,16}(?:开启|迈向)[^。！？\n]{2,20}|必将迎来[^。！？\n]{2,16}|值得每一个[^。！？\n]{2,16}深思)", 0),
        (r"\b(?:Looking\s+ahead,|Moving\s+forward,)[^.!?\n]{5,120}(?:well-positioned\s+to\s+thrive|vital\s+role|essential\s+for|year\s+ahead|remind\s+us)\b", re.I),
    ]
    for pat, flags in pats:
        for m in re.finditer(pat, prose_text, flags):
            lead = re.match(r"^\s+", m.group(0))
            off = len(lead.group(0)) if lead else 0
            hits.append({"index": m.start() + off, "length": m.end() - m.start() - off})

    disc_hits: list[dict[str, int]] = []
    for para in _extract_prose_paragraphs(prose_text, raw_text):
        base = para["base"]
        for marker in ZH_DISCOURSE_MARKERS:
            pos = 0
            while True:
                idx = para["text"].find(marker, pos)
                if idx == -1:
                    break
                disc_hits.append({"index": base + idx, "length": len(marker)})
                pos = idx + len(marker)
        low = para["text"].lower()
        for marker in EN_DISCOURSE_MARKERS:
            for m in _build_ascii_phrase_regex(marker, re.I).finditer(low):
                disc_hits.append({"index": base + m.start(), "length": m.end() - m.start()})

    if len(disc_hits) >= 3:
        disc_hits.sort(key=lambda h: h["index"])
        first = disc_hits[0]
        third = disc_hits[2]
        hits.append({
            "index": first["index"],
            "length": min(140, max(first["length"], third["index"] + third["length"] - first["index"])),
        })
    return hits


def _classify_opener_skeleton(text: str, explicit_only: bool = False) -> str | None:
    s = text.strip()
    if re.match(r"^[A-Za-z][A-Za-z0-9 _-]{1,28}:\s", s) or re.match(r"^[\u4e00-\u9fff]{2,8}：", s):
        return None
    if re.match(r"^在[\u4e00-\u9fff]{2,6}方面[，,]", s):
        return "ZH_ZAI_X_FANGMIAN"
    if re.match(r"^(?:首先|其次|再次|最后)[，,]", s):
        return "ZH_ORDINAL_STEP"
    if re.match(r"^By\s+[a-z]+ing\b", s, re.I):
        return "EN_BY_GERUND"
    if re.match(r"^(?:First|Second|Third|Fourth|Finally|Lastly),\s+", s, re.I):
        return "EN_ORDINAL_STEP"
    if explicit_only:
        return None
    if len(s) < 24:
        return None
    en_pre = re.match(r"^([A-Za-z]+\s+[A-Za-z]+)\b", s)
    if en_pre:
        low = en_pre.group(1).lower()
        if not re.match(r"^(?:in the|on the|at the|of the|to the|it is|this is|there is|we have|we are|the [a-z]+)$", low):
            return f"EN_PRE:{low}"
        return None
    zh_pre = re.match(r"^([\u4e00-\u9fff]{3})", s)
    if zh_pre:
        return f"ZH_PRE:{zh_pre.group(1)}"
    return None


def _has_repeated_post_ordinal_stem(items: list[dict[str, Any]]) -> bool:
    stems: dict[str, int] = {}
    for it in items:
        rest = re.sub(
            r"^(?:首先|其次|再次|最后|First|Second|Third|Fourth|Finally|Lastly)[，,]\s*",
            "",
            it["text"],
            flags=re.I,
        ).strip()
        m_en = re.match(r"^([A-Za-z]+(?:\s+[A-Za-z-]+){0,2})", rest)
        m_zh = re.match(r"^([\u4e00-\u9fff]{2,4})", rest)
        key = f"en:{m_en.group(1).lower()}" if m_en else f"zh:{m_zh.group(1)}" if m_zh else None
        if not key:
            continue
        stems[key] = stems.get(key, 0) + 1
        if stems[key] >= 2:
            return True
    return False


def _probe_template_skeleton_echo(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    paras = _extract_prose_paragraphs(prose_text, raw_text)

    def check_items(items: list[dict[str, Any]], explicit_only: bool, inside_single_para: bool) -> bool:
        groups: dict[str, list[dict[str, Any]]] = {}
        for item in items:
            skel = _classify_opener_skeleton(item["text"], explicit_only)
            if not skel:
                continue
            groups.setdefault(skel, []).append(item)
        for skel, matched in groups.items():
            if len(matched) >= 3:
                if (
                    inside_single_para
                    and skel in {"EN_ORDINAL_STEP", "ZH_ORDINAL_STEP"}
                    and not _has_repeated_post_ordinal_stem(matched)
                ):
                    continue
                hits.append({"index": matched[0]["start"], "length": min(120, len(matched[0]["text"]))})
                return True
        return False

    if len(paras) >= 3:
        if check_items([{"start": p["start"], "text": p["trimmed"]} for p in paras], False, False):
            return hits

    all_sents: list[dict[str, Any]] = []
    for para in paras:
        all_sents.extend(_split_prose_sentences_with_offsets(para))
    if len(all_sents) >= 3:
        check_items(all_sents, True, True)
    return hits


def _probe_low_burstiness_vapor(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    paras = _extract_prose_paragraphs(prose_text, raw_text)
    if not paras:
        return []
    sents: list[dict[str, Any]] = []
    for para in paras:
        for s in _split_prose_sentences_with_offsets(para):
            u = _count_text_units_tenths(s["text"])
            if u > 0:
                sents.append({**s, "tenths": u})
    if len(sents) < 5:
        return []
    sum_tenths = sum(s["tenths"] for s in sents)
    mean_tenths = sum_tenths / len(sents)
    if mean_tenths <= 0:
        return []
    variance_tenths = sum((s["tenths"] - mean_tenths) ** 2 for s in sents) / len(sents)
    cv = math.sqrt(variance_tenths) / mean_tenths
    total_tenths = max(10, sum_tenths)
    total_anchors = sum(_count_concreteness_anchors(p["rawSlice"]) for p in paras)
    concreteness = (total_anchors * 1000.0) / total_tenths
    if cv < 0.24 and concreteness < 1.5:
        return [{"index": paras[0]["start"], "length": min(80, len(paras[0]["trimmed"]))}]
    return []


def analyze_text_profile(text: str, *, modality: str = "markdown") -> dict[str, Any]:
    """Compute an explainable 5-axis offline statistical & structural text profile."""
    raw = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    zones = build_zones(raw, modality)
    prose = zones.get("prose", "")
    paras = _extract_prose_paragraphs(prose, raw)
    sents: list[dict[str, Any]] = []
    for para in paras:
        for s in _split_prose_sentences_with_offsets(para):
            u = _count_text_units_tenths(s["text"])
            if u > 0:
                sents.append({**s, "tenths": u})

    n_sents = len(sents)
    mean_len = 0.0
    cv = 0.0
    adj_contrast = 0.0
    if n_sents >= 2:
        sum_tenths = sum(s["tenths"] for s in sents)
        mean_tenths = sum_tenths / n_sents
        mean_len = mean_tenths / 10.0
        variance_tenths = sum((s["tenths"] - mean_tenths) ** 2 for s in sents) / n_sents
        cv = math.sqrt(variance_tenths) / mean_tenths if mean_tenths > 0 else 0.0
        diff_sum_tenths = sum(abs(sents[i]["tenths"] - sents[i - 1]["tenths"]) for i in range(1, n_sents))
        adj_contrast = (diff_sum_tenths / (n_sents - 1)) / mean_tenths if mean_tenths > 0 else 0.0
    elif n_sents == 1:
        mean_len = sents[0]["tenths"] / 10.0

    joined_prose = "\n".join(p["trimmed"] for p in paras)
    total_tenths = max(10, _count_text_units_tenths(joined_prose))
    total_units = total_tenths / 10.0

    tokens = re.findall(r"[\u4e00-\u9fff]|[a-z]{2,}", joined_prose.lower())
    n_tok = len(tokens)
    ttr = len(set(tokens)) / n_tok if n_tok > 0 else 0.0
    mattr = ttr
    win = 25
    if n_tok > win:
        acc = 0.0
        steps = 0
        for i in range(0, n_tok - win + 1, 5):
            acc += len(set(tokens[i : i + win])) / win
            steps += 1
        mattr = acc / steps if steps > 0 else ttr

    bigram_echo = 0.0
    if n_tok >= 2:
        b_set = {f"{tokens[i]}|{tokens[i + 1]}" for i in range(n_tok - 1)}
        bigram_echo = 1.0 - len(b_set) / (n_tok - 1)

    char_entropy = 0.0
    if joined_prose:
        counts = Counter(joined_prose)
        total_c = len(joined_prose)
        for c in counts.values():
            p = c / total_c
            char_entropy -= p * math.log2(p)

    anchor_count = sum(_count_concreteness_anchors(p["rawSlice"]) for p in paras)
    concreteness_per_100 = (anchor_count / total_units) * 100.0

    em_dashes = joined_prose.replace("——", "—").count("—")
    em_dash_per_300 = (em_dashes / total_units) * 300.0
    max_semi = 0
    max_comma = 0
    for s in sents:
        sc = len(re.findall(r"[;；]", re.sub(r"\([^)\n]*[;；][^)\n]*\)", " ", s["text"])))
        cc_txt = re.sub(r"\([^)\n]{1,60}\)", " ", re.sub(r"(\d),(\d{3})(?!\d)", r"\1\2", s["text"]))
        cc = len(re.findall(r"[，,]", cc_txt))
        if sc > max_semi:
            max_semi = sc
        if cc > max_comma:
            max_comma = cc

    cooc_hits = len(_probe_cooccurrence_slop_cluster(prose, raw))
    semi_hits = len(_probe_semicolon_tricolon(prose, raw))
    rhet_qa_count = len(_probe_rhetorical_qa_cadence(prose, raw))
    comma_hits = len(_probe_comma_chain_runon(prose, raw))
    skel_hits = len(_probe_template_skeleton_echo(prose, raw))
    narrative_hits = len(_probe_narrative_sandwich_frame(prose, raw))
    vapor_hits = len(_probe_low_burstiness_vapor(prose, raw))

    signals: list[str] = []
    risk_score = 0
    if cooc_hits > 0:
        risk_score += 28
        signals.append("cooccurrence-slop-cluster")
    if semi_hits > 0:
        risk_score += 24
        signals.append("semicolon-tricolon")
    if rhet_qa_count > 0:
        risk_score += 24
        signals.append("rhetorical-qa-cadence")
    if comma_hits > 0:
        risk_score += 18
        signals.append("comma-chain-runon")
    if narrative_hits > 0:
        risk_score += 26
        signals.append("narrative-sandwich-frame")
    if skel_hits > 0:
        risk_score += 26
        signals.append("template-skeleton-echo")
    if vapor_hits > 0:
        risk_score += 24
        signals.append("low-burstiness-vapor")
    elif n_sents >= 5 and cv < 0.24:
        risk_score += 10
        signals.append("flat-sentence-rhythm")
    if n_sents >= 3 and anchor_count == 0:
        risk_score += 10
        signals.append("zero-concrete-anchors")
    if em_dash_per_300 > 4.0 and em_dashes >= 5:
        risk_score += 12
        signals.append("high-em-dash-density")
    risk_score = min(100, risk_score)

    burstiness_status = "short" if n_sents < 3 else "flat" if cv < 0.24 else "varied" if cv >= 0.35 else "moderate"
    concreteness_status = "grounded" if concreteness_per_100 >= 4.0 else "moderate" if concreteness_per_100 >= 1.5 else "vapor"
    risk_level = "high" if risk_score >= 45 else "medium" if risk_score >= 20 else "low"

    return {
        "schema": "dislop.text-profile/1",
        "sentenceCount": n_sents,
        "paragraphCount": len(paras),
        "unitCount": _round_non_neg(total_units, 1),
        "burstiness": {
            "meanLength": _round_non_neg(mean_len, 1),
            "cv": _round_non_neg(cv, 2),
            "adjacentContrast": _round_non_neg(adj_contrast, 2),
            "status": burstiness_status,
        },
        "lexical": {
            "ttr": _round_non_neg(ttr, 2),
            "mattr": _round_non_neg(mattr, 2),
            "bigramEcho": _round_non_neg(bigram_echo, 2),
            "charEntropy": _round_non_neg(char_entropy, 2),
            "cooccurrenceClusters": cooc_hits,
        },
        "concreteness": {
            "anchorCount": anchor_count,
            "per100Units": _round_non_neg(concreteness_per_100, 1),
            "status": concreteness_status,
        },
        "punctuation": {
            "emDashPer300": _round_non_neg(em_dash_per_300, 1),
            "maxSemicolonsInSentence": max_semi,
            "maxCommasInSentence": max_comma,
            "rhetoricalQaCount": rhet_qa_count,
        },
        "structure": {
            "skeletonEchoHits": skel_hits,
            "narrativeFrameHits": narrative_hits,
            "lowBurstinessVapor": vapor_hits > 0,
        },
        "telemetryRisk": {
            "score": risk_score,
            "level": risk_level,
            "signals": signals,
        },
    }


def _parse_color_rgb(raw: str | None) -> tuple[int, int, int] | None:
    if not raw:
        return None
    val = raw.strip().lower()
    m6 = re.match(r"^#([0-9a-f]{6})$", val)
    if m6:
        n = int(m6.group(1), 16)
        return ((n >> 16) & 255, (n >> 8) & 255, n & 255)
    m3 = re.match(r"^#([0-9a-f]{3})$", val)
    if m3:
        s = m3.group(1)
        return (int(s[0] * 2, 16), int(s[1] * 2, 16), int(s[2] * 2, 16))
    mrgb = re.match(r"^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$", val)
    if mrgb:
        return (int(mrgb.group(1)), int(mrgb.group(2)), int(mrgb.group(3)))
    if val == "white":
        return (255, 255, 255)
    if val == "black":
        return (0, 0, 0)
    return None


def _probe_ui_dead_control(raw_text: str) -> list[dict[str, Any]]:
    clean = re.sub(
        r"<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->",
        _preserve_lines_blank,
        raw_text,
        flags=re.I,
    )
    clean = re.sub(r"<!--[\s\S]*?-->", _preserve_lines_blank, clean)
    clean = re.sub(r"<(script|style|code|pre)\b[^>]*>[\s\S]*?</\1>", _preserve_lines_blank, clean, flags=re.I)

    hits: list[dict[str, Any]] = []
    for m in re.finditer(r"<a\b([^>]*)>", clean, re.I):
        attrs = m.group(1) or ""
        hm = re.search(r"\bhref\s*=\s*(?:\"([^\"]*)\"|'([^']*)')", attrs, re.I)
        href = (hm.group(1) if hm and hm.group(1) is not None else hm.group(2) if hm else None)
        if href is not None:
            href = href.strip()
        has_handler = bool(re.search(r"\b(?:onClick|onclick|@click|hx-get|hx-post)\b", attrs))
        if not has_handler and (href in {"#", ""} or (href and href.lower().startswith("javascript:"))):
            hits.append({"index": m.start(), "length": m.end() - m.start(), "severity": "error"})

    for m in re.finditer(r"<button\b([^>]*)>([\s\S]*?)</button>", clean, re.I):
        attrs = m.group(1) or ""
        inner = re.sub(r"<[^>]+>", "", m.group(2) or "").strip()
        has_label = bool(inner) or bool(re.search(r"\b(?:aria-label|aria-labelledby|title)\s*=\s*[\"'][^\"']+[\"']", attrs, re.I))
        if not has_label and "{..." not in attrs:
            hits.append({"index": m.start(), "length": m.end() - m.start(), "severity": "error"})
            continue
        static_disabled = bool(re.search(r"\bdisabled(?:\s*=\s*(?:\"\"|\"disabled\"|'disabled'|\{true\}))?(?=[\s/>]|$)", attrs, re.I))
        has_reason = bool(re.search(r"\b(?:title|aria-describedby|data-allow-disabled)\b", attrs, re.I))
        if static_disabled and not has_reason:
            hits.append({"index": m.start(), "length": m.end() - m.start(), "severity": "warning"})
    return hits


def _probe_ui_ai_gradient(raw_text: str) -> list[dict[str, Any]]:
    clean = re.sub(
        r"<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->",
        _preserve_lines_blank,
        raw_text,
        flags=re.I,
    )
    clean = re.sub(r"<!--[\s\S]*?-->", _preserve_lines_blank, clean)
    clean = re.sub(r"/\*[\s\S]*?\*/", _preserve_lines_blank, clean)
    clean = re.sub(r"<(script|code|pre)\b[^>]*>[\s\S]*?</\1>", _preserve_lines_blank, clean, flags=re.I)

    hits: list[dict[str, Any]] = []
    tw_re = re.compile(
        r"\b(?:from-(?:indigo|purple|violet)-\d{2,3}[^\"'\n>]{0,60}(?:to|via)-(?:purple|pink|fuchsia|violet)-\d{2,3}|bg-clip-text\s+text-transparent|text-transparent\s+bg-clip-text)\b",
        re.I,
    )
    for m in tw_re.finditer(clean):
        hits.append({"index": m.start(), "length": m.end() - m.start()})

    for m in re.finditer(r"(?:linear|radial)-gradient\(([^)]+)\)", clean, re.I):
        hexes = re.findall(r"#[0-9a-fA-F]{3,6}\b", m.group(1))
        stops = 0
        for hx in hexes:
            rgb = _parse_color_rgb(hx)
            if not rgb:
                continue
            h, l, s = colorsys.rgb_to_hls(rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0)
            deg = h * 360.0
            if 245.0 <= deg <= 345.0 and (s * 100.0) >= 45.0:
                stops += 1
        near = clean[m.start() : min(len(clean), m.end() + 120)]
        if stops >= 2 or re.search(r"background-clip\s*:\s*text", near, re.I):
            hits.append({"index": m.start(), "length": m.end() - m.start()})
    return hits


def _probe_ui_pill_soup(raw_text: str, max_pills: int = 6) -> list[dict[str, Any]]:
    clean = re.sub(
        r"<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->",
        _preserve_lines_blank,
        raw_text,
        flags=re.I,
    )
    clean = re.sub(r"<!--[\s\S]*?-->", _preserve_lines_blank, clean)
    clean = re.sub(r"<(script|style|code|pre)\b[^>]*>[\s\S]*?</\1>", _preserve_lines_blank, clean, flags=re.I)

    matches: list[dict[str, Any]] = []
    for m in re.finditer(
        r"<([a-z0-9]+)\b([^>]*(?:\brounded-full\b|border-radius\s*:\s*999\d*px)[^>]*)>([^<]{1,48})</\1>",
        clean,
        re.I,
    ):
        attrs = m.group(2) or ""
        txt = (m.group(3) or "").strip()
        if not txt or re.search(r"\bsize-\d", attrs):
            continue
        wh = re.search(r"\bw-(\d+)\b.*\bh-(\d+)\b", attrs)
        if wh and wh.group(1) == wh.group(2):
            continue
        matches.append({"index": m.start(), "length": m.end() - m.start()})
    return [matches[0]] if len(matches) > max_pills else []


def _probe_ui_box_in_box(raw_text: str) -> list[dict[str, Any]]:
    clean = re.sub(
        r"<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->",
        _preserve_lines_blank,
        raw_text,
        flags=re.I,
    )
    clean = re.sub(r"<!--[\s\S]*?-->", _preserve_lines_blank, clean)
    clean = re.sub(r"<(script|style|code|pre|svg)\b[^>]*>[\s\S]*?</\1>", _preserve_lines_blank, clean, flags=re.I)

    void_tags = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
    stack: list[tuple[str, int]] = []
    hits: list[dict[str, Any]] = []
    for m in re.finditer(r"</?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)(/?)>", clean):
        full = m.group(0)
        tag = m.group(1).lower()
        attrs = m.group(2) or ""
        self_close = m.group(3) == "/" or tag in void_tags
        if full.startswith("</"):
            for i in range(len(stack) - 1, -1, -1):
                if stack[i][0] == tag:
                    del stack[i:]
                    break
            continue
        has_border = bool(re.search(r"\b(?:border(?:-[a-z0-9]+)?|ring-1|shadow(?:-[a-z]+)?)\b|border\s*:", attrs, re.I)) and not bool(
            re.search(r"\bborder-(?:t|b|l|r|0|none)\b", attrs, re.I)
        )
        has_radius = bool(re.search(r"\brounded(?:-[a-z0-9]+)?\b|border-radius\s*:", attrs, re.I)) and not bool(
            re.search(r"\brounded-none\b", attrs, re.I)
        )
        has_pad = bool(re.search(r"\bp[xy]?-\d|padding\s*:", attrs, re.I))
        is_box = has_border and has_radius and has_pad
        depth = (stack[-1][1] if stack else 0) + (1 if is_box else 0)
        if is_box and depth >= 3 and not hits:
            hits.append({"index": m.start(), "length": len(full)})
        if not self_close:
            stack.append((tag, depth))
    return hits


def _normalize_ascii_digits(s: str) -> str:
    return re.sub(r"[０-９]", lambda m: chr(ord(m.group(0)) - 0xFEE0), str(s or ""))


def _has_multiplier_baseline(sentence: str) -> bool:
    s = _normalize_ascii_digits(sentence)
    if re.search(r"(?<![A-Za-z0-9_])from\s+\S+[\s\S]{0,36}(?<![A-Za-z0-9_])to\s+\S*[0-9]", s, re.I):
        return True
    if re.search(r"(?<![A-Za-z0-9_])(?:vs\.?|compared\s+(?:to|with))\s+\S*[0-9]", s, re.I):
        return True
    if re.search(r"(?:从|由)\s*[0-9][\s\S]{0,28}(?:到|至|升至|降至|压到|降到|缩短至)\s*[0-9]", s):
        return True
    measured = re.findall(
        r"(?<![A-Za-z0-9_])[0-9][0-9,.]*\s*(?:%|(?:milliseconds?|ms|minutes?|mins?|seconds?|secs?|s|hours?|hrs?|KB|MB|GB|TB|QPS|TPS|RPS)(?![A-Za-z0-9_])|秒|分钟|小时|毫秒|万|亿|元|美元)",
        s,
        re.I,
    )
    return len(measured) >= 2


def _probe_unanchored_multiplier(zone_text: str, raw_text: str) -> list[dict[str, int]]:
    norm_zone = _normalize_ascii_digits(zone_text)
    hits: list[dict[str, int]] = []
    patterns = [
        (r"(?<![A-Za-z0-9_])(?:[0-9]+(?:\.[0-9]+)?x)\s+(?:faster|more\s+efficient|higher\s+(?:productivity|throughput|conversion)|lower\s+cost|cheaper|speedup)(?![A-Za-z0-9_])", re.I),
        (r"(?:效率|性能|速度|产能|转化率|吞吐量)(?:提升|提高|加快|翻了?|暴涨)(?:了?\s*)?(?:数倍|十倍|百倍|几十倍|好几倍|[0-9]+(?:\.[0-9]+)?\s*倍)", 0),
    ]
    for pat, flags in patterns:
        for m in re.finditer(pat, norm_zone, flags):
            sent = enclosing_sentence(raw_text, m.start(), m.end())
            if _has_multiplier_baseline(sent):
                continue
            hits.append({"index": m.start(), "length": m.end() - m.start()})
    return hits


def _eval_synthetic_binary_fixture(fixture: str, rule: dict[str, Any], thresholds: dict[str, Any]) -> list[dict[str, str]]:
    probe = rule.get("probe")
    if probe == "office-markdown-leak" and fixture.startswith("DOCX_RAW_MARKDOWN:"):
        return [{"location": "para 1", "match": "**Key Milestone**"}]
    if probe == "slide-word-wall" and fixture.startswith("PPTX_WORD_WALL:"):
        cnt = int(fixture.split(":")[1])
        if cnt > thresholds.get("maxSlideWords", 120):
            return [{"location": "slide 1", "match": f"{cnt} words"}]
    if probe == "slide-bullet-overload" and fixture.startswith("PPTX_BULLETS:"):
        cnt = int(fixture.split(":")[1])
        if cnt > thresholds.get("maxSlideBullets", 6):
            return [{"location": "slide 1", "match": f"{cnt} bullets"}]
    if probe == "slide-autofit-shrink" and fixture.startswith("PPTX_AUTOFIT:"):
        scale = int(fixture.split(":")[1])
        if scale < thresholds.get("minAutofitScale", 80000):
            return [{"location": "slide 1", "match": f"fontScale={scale}"}]
    if probe == "slide-weak-topic-title" and fixture.startswith("PPTX_WEAK_TITLE:"):
        return [{"location": "slide 1", "match": fixture.split(":")[1]}]
    if probe == "pptx-layout-monotony" and fixture.startswith("PPTX_MONOTONY:"):
        run = int(fixture.split(":")[1] or 0)
        if run >= thresholds.get("maxIdenticalSlideRun", 4):
            return [{"location": f"slide {run}", "match": f"{run} consecutive identical slide layouts"}]
    return []


def audit_text(
    text: str,
    *,
    filename: str = "<memory>",
    modality: str | None = None,
    pack: dict[str, Any],
    config: dict[str, Any] | None = None,
    allow_synthetic_fixtures: bool = False,
) -> dict[str, Any]:
    cfg = config or {}
    mod = modality or detect_modality(filename) or "markdown"
    line_starts = build_line_starts(text)
    zones = build_zones(text, mod)
    by_target, directives = parse_suppressions(text)
    allow_list = [str(a).lower() for a in cfg.get("allow", [])]
    findings: list[dict[str, Any]] = []
    thresholds = pack.get("thresholds", {})

    for rule in pack.get("rules", []):
        if rule.get("modalities") and mod not in rule["modalities"]:
            continue

        if allow_synthetic_fixtures and text.startswith(("DOCX_", "PPTX_")):
            for sh in _eval_synthetic_binary_fixture(text, rule, thresholds):
                findings.append(
                    make_finding(
                        rule=rule,
                        filename=filename,
                        modality=mod,
                        location=sh["location"],
                        match=sh["match"],
                        sentence=text,
                        span={"start": 0, "end": len(text)},
                    )
                )
            continue

        zone_name = (rule.get("zones") or ["prose"])[0]
        zone_text = zones.get(zone_name, zones["prose"])
        probe = rule.get("probe", "regex")
        raw_hits: list[dict[str, Any]] = []

        if probe == "regex":
            for pattern in rule.get("patterns", []):
                for m in re.finditer(pattern, zone_text, re.I | re.M):
                    if m.end() > m.start():
                        idx = m.start()
                        length = m.end() - m.start()
                        if zone_name == "prose":
                            lead = re.match(r"^[.!?。！？\s]+", m.group(0))
                            if lead and len(lead.group(0)) < length:
                                idx += len(lead.group(0))
                                length -= len(lead.group(0))
                        while length > 1 and text[idx] == "\ufeff":
                            idx += 1
                            length -= 1
                        if (
                            rule.get("id") == "unfilled-placeholder"
                            and text[idx] == "["
                            and text[idx + length - 1] == "]"
                            and idx + length < len(text)
                            and text[idx + length] in "([:"
                        ):
                            continue
                        raw_hits.append({"index": idx, "length": length})
        elif probe == "negation-pivot":
            raw_hits = _probe_negation_pivot(zone_text, text)
        elif probe == "staccato-run":
            raw_hits = _probe_staccato_run(zone_text)
        elif probe == "zh-four-char-triad":
            raw_hits = _probe_zh_four_char_triad(zone_text)
        elif probe == "unsourced-attribution":
            raw_hits = _probe_unsourced_attribution(zone_text, text)
        elif probe == "bold-lead-list-wall":
            raw_hits = _probe_bold_lead_list_wall(zone_text, text, thresholds.get("boldLeadListRun", 4))
        elif probe == "em-dash-density":
            raw_hits = _probe_em_dash_density(zone_text, thresholds.get("maxEmDashesPer300Words", 4))
        elif probe == "zh-halfwidth-punctuation":
            raw_hits = [
                {"index": m.start(), "length": m.end() - m.start()}
                for m in re.finditer(r"[\u4e00-\u9fff][,;:!?][\u4e00-\u9fff]", zone_text)
            ]
        elif probe == "cooccurrence-slop-cluster":
            raw_hits = _probe_cooccurrence_slop_cluster(zone_text, text)
        elif probe == "semicolon-tricolon":
            raw_hits = _probe_semicolon_tricolon(zone_text, text)
        elif probe == "rhetorical-qa-cadence":
            raw_hits = _probe_rhetorical_qa_cadence(zone_text, text)
        elif probe == "comma-chain-runon":
            raw_hits = _probe_comma_chain_runon(zone_text, text)
        elif probe == "narrative-sandwich-frame":
            raw_hits = _probe_narrative_sandwich_frame(zone_text, text)
        elif probe == "template-skeleton-echo":
            raw_hits = _probe_template_skeleton_echo(zone_text, text)
        elif probe == "low-burstiness-vapor":
            raw_hits = _probe_low_burstiness_vapor(zone_text, text)
        elif probe == "unanchored-multiplier":
            raw_hits = _probe_unanchored_multiplier(zone_text, text)
        elif probe == "ui-dead-control":
            raw_hits = _probe_ui_dead_control(text)
        elif probe == "ui-ai-gradient":
            raw_hits = _probe_ui_ai_gradient(text)
        elif probe == "ui-pill-soup":
            raw_hits = _probe_ui_pill_soup(text, thresholds.get("maxPillsPerFile", 6))
        elif probe == "ui-box-in-box":
            raw_hits = _probe_ui_box_in_box(text)

        raw_hits.sort(key=lambda h: (h["index"], -h["length"]))
        dedup_hits: list[dict[str, Any]] = []
        for h in raw_hits:
            if dedup_hits and h["index"] < dedup_hits[-1]["index"] + dedup_hits[-1]["length"]:
                continue
            dedup_hits.append(h)

        for hit in dedup_hits:
            start = hit["index"]
            end = start + hit["length"]
            matched_raw = text[start:end]
            low_match = matched_raw.lower()
            if any(al in low_match for al in allow_list):
                continue

            line, col = offset_to_line_col(line_starts, start)
            suppressed = False
            for sup in by_target.get(line, []):
                if "all" in sup["ruleIds"] or "*" in sup["ruleIds"] or rule["id"] in sup["ruleIds"]:
                    sup["used"] = True
                    suppressed = True
            if suppressed:
                continue

            eff_rule = {**rule, "severity": hit["severity"]} if "severity" in hit else rule
            findings.append(
                make_finding(
                    rule=eff_rule,
                    filename=filename,
                    modality=mod,
                    location=f"{line}:{col}",
                    line=line,
                    col=col,
                    span={"start": start, "end": end},
                    match=re.sub(r"[\s\ufeff]+", " ", matched_raw).strip()[:140],
                    sentence=enclosing_sentence(text, start, end),
                )
            )

    unused = [
        {"file": filename, "line": d["directiveLine"], "ruleIds": d["ruleIds"], "reason": d["reason"]}
        for d in directives
        if not d["used"]
    ]
    findings.sort(key=lambda f: (f.get("line", 0), f.get("col", 0)))
    return {"findings": findings, "unusedSuppressions": unused}


# ---------- OOXML Inspection (.docx / .pptx) ----------

def _decode_xml_entities(s: str) -> str:
    def _repl(m: re.Match[str]) -> str:
        full = m.group(0)
        if m.group(1):
            cp = int(m.group(1), 10)
            return chr(cp) if 0 < cp <= 0x10FFFF else full
        if m.group(2):
            cp = int(m.group(2), 16)
            return chr(cp) if 0 < cp <= 0x10FFFF else full
        if full == "&lt;":
            return "<"
        if full == "&gt;":
            return ">"
        if full == "&quot;":
            return '"'
        if full == "&apos;":
            return "'"
        return "&"

    return re.sub(r"&(?:#([0-9]+)|#x([0-9a-fA-F]+)|lt|gt|quot|apos|amp);", _repl, str(s))


def audit_ooxml_entries(
    entries: dict[str, str],
    *,
    filename: str,
    modality: str,
    pack: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    rules_by_id = {r["id"]: r for r in pack.get("rules", [])}

    if modality == "docx":
        doc_xml = entries.get("word/document.xml")
        if not doc_xml:
            return {"findings": findings, "skipped": [{"file": filename, "reason": "Missing word/document.xml inside DOCX archive"}]}

        md_leak_rule = rules_by_id.get("markdown-leak")
        para_idx = 0
        for pm in re.finditer(r"<w:p\b[^>]*>([\s\S]*?)</w:p>", doc_xml):
            p_body = re.sub(r"<w:del\b[\s\S]*?</w:del>", "", pm.group(1))
            runs = [_decode_xml_entities(tm.group(1)) for tm in re.finditer(r"<w:t(?:\s[^>]*)?>([\s\S]*?)</w:t>", p_body)]
            para_text = "".join(runs).strip()
            if not para_text:
                continue
            para_idx += 1
            if md_leak_rule and (re.search(r"\*\*[^*\n]{1,80}\*\*", para_text) or re.match(r"^#{1,6}\s+\S", para_text)):
                findings.append(
                    make_finding(rule=md_leak_rule, filename=filename, modality=modality, location=f"para {para_idx}", line=para_idx, match=para_text[:100])
                )
            sub = audit_text(para_text, filename=filename, modality="markdown", pack=pack, config=config)
            for f in sub["findings"]:
                if f["ruleId"] == "markdown-leak":
                    continue
                findings.append({**f, "modality": "docx", "location": f"para {para_idx}", "line": para_idx})
        return {"findings": findings, "skipped": skipped}

    if modality == "pptx":
        pres_xml = entries.get("ppt/presentation.xml", "")
        pres_rels = entries.get("ppt/_rels/presentation.xml.rels", "")

        rel_map: dict[str, str] = {}
        for rm in re.finditer(r'<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"|<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"', pres_rels):
            rid = rm.group(1) or rm.group(4)
            target = (rm.group(2) or rm.group(3) or "").lstrip("/").removeprefix("../")
            if not target.startswith("ppt/"):
                target = "ppt/" + target
            rel_map[rid] = target

        ordered_slides: list[str] = []
        for sm in re.finditer(r'<p:sldId\b[^>]*\br:id="([^"]+)"', pres_xml):
            t = rel_map.get(sm.group(1))
            if t and t in entries:
                ordered_slides.append(t)
        if not ordered_slides:
            ordered_slides = sorted(
                [k for k in entries if re.match(r"^ppt/slides/slide\d+\.xml$", k)],
                key=lambda k: int(re.search(r"\d+", k).group(0)),  # type: ignore[union-attr]
            )
        if not ordered_slides:
            return {"findings": findings, "skipped": [{"file": filename, "reason": "Missing ppt/slides/*.xml inside PPTX archive"}]}

        md_leak_rule = rules_by_id.get("markdown-leak")
        word_wall_rule = rules_by_id.get("slide-word-wall")
        bullet_rule = rules_by_id.get("slide-bullet-overload")
        autofit_rule = rules_by_id.get("slide-autofit-shrink")
        weak_title_rule = rules_by_id.get("slide-weak-topic-title")
        process_title_rule = rules_by_id.get("slide-process-not-finding-title")
        monotony_rule = rules_by_id.get("pptx-layout-monotony")
        thresholds = pack.get("thresholds", {})
        prev_layout_sig: str | None = None
        layout_run_count = 0

        for idx, slide_entry in enumerate(ordered_slides):
            slide_num = idx + 1
            xml = entries[slide_entry]
            is_hidden = bool(re.search(r'<p:sld\b[^>]*\bshow="(?:0|false)"', xml, re.I))
            if is_hidden:
                skipped.append({"file": f"{filename}#slide-{slide_num}", "reason": "Hidden slide (show=0) skipped for density rules"})

            if autofit_rule and not is_hidden:
                af_m = re.search(r'<a:normAutofit\b[^>]*\bfontScale="(\d+)"', xml)
                if af_m and int(af_m.group(1)) < thresholds.get("minAutofitScale", 80000):
                    pct = int(int(af_m.group(1)) / 1000.0 + 0.5)
                    findings.append(
                        make_finding(rule=autofit_rule, filename=filename, modality=modality, location=f"slide {slide_num}", line=slide_num, match=f"normAutofit fontScale={pct}%")
                    )

            slide_paras: list[str] = []
            title_text = ""
            bullet_count = 0
            non_footer_sp_count = 0
            for spm in re.finditer(r"<p:sp\b[\s\S]*?</p:sp>", xml):
                sp = spm.group(0)
                is_title = bool(re.search(r'<p:ph\b[^>]*\btype="(?:title|ctrTitle)"', sp))
                is_footer = bool(re.search(r'<p:ph\b[^>]*\btype="(?:sldNum|ftr|dt)"', sp))
                if not is_footer:
                    non_footer_sp_count += 1
                paras: list[str] = []
                for apm in re.finditer(r"<a:p\b[^>]*>([\s\S]*?)</a:p>", sp):
                    p_inner = apm.group(1)
                    runs = [_decode_xml_entities(atm.group(1)) for atm in re.finditer(r"<a:t(?:\s[^>]*)?>([\s\S]*?)</a:t>", p_inner)]
                    joined = "".join(runs).strip()
                    if not joined:
                        continue
                    paras.append(joined)
                    if not is_title and not is_footer and re.search(r"<a:buChar\b|<a:buAutoNum\b", p_inner):
                        bullet_count += 1
                if not paras:
                    continue
                if is_title and not title_text:
                    title_text = " ".join(paras)
                if not is_footer:
                    slide_paras.extend(paras)

            full_text = "\n".join(slide_paras)
            if md_leak_rule and (re.search(r"\*\*[^*\n]{1,80}\*\*", full_text) or re.search(r"^#{1,6}\s+\S", full_text, re.M)):
                findings.append(
                    make_finding(rule=md_leak_rule, filename=filename, modality=modality, location=f"slide {slide_num}", line=slide_num, match=full_text[:90])
                )

            if not is_hidden:
                cjk_chars = len(re.findall(r"[\u4e00-\u9fff]", full_text))
                latin_words = len([w for w in full_text.split() if re.search(r"[A-Za-z0-9]", w)])
                if word_wall_rule and (latin_words > thresholds.get("maxSlideWords", 120) or cjk_chars > thresholds.get("maxSlideCharsZh", 280)):
                    findings.append(
                        make_finding(
                            rule=word_wall_rule,
                            filename=filename,
                            modality=modality,
                            location=f"slide {slide_num}",
                            line=slide_num,
                            match=f"{latin_words} words / {cjk_chars} CJK chars",
                        )
                    )
                if bullet_rule and bullet_count > thresholds.get("maxSlideBullets", 6):
                    findings.append(
                        make_finding(rule=bullet_rule, filename=filename, modality=modality, location=f"slide {slide_num}", line=slide_num, match=f"{bullet_count} bullet items")
                    )
                if weak_title_rule and title_text and (latin_words > 25 or cjk_chars > 50):
                    if re.match(r"^(?:overview|background|agenda|summary|introduction|context|背景|项目背景|概述|数据概述|总结|目录)$", title_text.strip(), re.I):
                        findings.append(
                            make_finding(
                                rule=weak_title_rule,
                                filename=filename,
                                modality=modality,
                                location=f"slide {slide_num}",
                                line=slide_num,
                                match=f'Title: "{title_text.strip()}"',
                            )
                        )
                if process_title_rule and title_text:
                    tt = re.sub(r"\s*#+\s*$", "", title_text.strip()).strip()
                    if re.match(
                        r"^(?:Analysis\s+of|Overview\s+of|Update\s+on|Discussion\s+of|Deep\s+Dive\s+into|Thoughts\s+on)\s+\S[^\n#]{1,64}$",
                        tt,
                        re.I,
                    ) or re.match(
                        r"^(?:关于[^\n#]{2,36}的(?:分析(?:汇报|报告)?|汇报|思考|探讨|情况(?:说明|汇报)?)|[^\n#]{2,24}(?:阶段性进展汇报|情况分析汇报))$",
                        tt,
                    ):
                        findings.append(
                            make_finding(
                                rule=process_title_rule,
                                filename=filename,
                                modality=modality,
                                location=f"slide {slide_num}",
                                line=slide_num,
                                match=f'Title: "{tt}"',
                            )
                        )
                if monotony_rule:
                    has_data_graphic = bool(re.search(r"<c:chart\b|<a:tbl\b", xml))
                    pic_count = len(re.findall(r"<p:pic\b", xml))
                    bullet_bucket = 0 if bullet_count == 0 else (1 if bullet_count <= 3 else 2)
                    offs = ";".join(
                        f"{math.floor(int(mx) / 914400 + 0.5)},{math.floor(int(my) / 914400 + 0.5)}"
                        for mx, my in re.findall(r'<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"', xml)[:6]
                    )
                    geom_part = f"|g:{offs}" if offs else ""
                    sig = (
                        f"sp:{non_footer_sp_count}|b:{bullet_bucket}|p:{pic_count}{geom_part}"
                        if (not has_data_graphic and non_footer_sp_count >= 2 and (latin_words > 8 or cjk_chars > 16))
                        else None
                    )
                    if sig and sig == prev_layout_sig:
                        layout_run_count += 1
                    else:
                        prev_layout_sig = sig
                        layout_run_count = 1 if sig else 0
                    if layout_run_count == thresholds.get("maxIdenticalSlideRun", 4):
                        findings.append(
                            make_finding(
                                rule=monotony_rule,
                                filename=filename,
                                modality=modality,
                                location=f"slide {slide_num}",
                                line=slide_num,
                                match=f"{layout_run_count} consecutive identical slide layouts ({sig})",
                            )
                        )

            sub = audit_text(full_text, filename=filename, modality="markdown", pack=pack, config=config)
            for f in sub["findings"]:
                if is_hidden and f.get("severity") != "error":
                    continue
                findings.append({**f, "modality": "pptx", "location": f"slide {slide_num}", "line": slide_num})

        return {"findings": findings, "skipped": skipped}

    return {"findings": findings, "skipped": skipped}


def inspect_file(
    abs_path: Path,
    rel_posix: str,
    packs_by_id: dict[str, dict[str, Any]],
    explicit_pack: str | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = config or {}
    modality = detect_modality(abs_path.name)
    if not modality:
        return {
            "checked": False,
            "findings": [],
            "unusedSuppressions": [],
            "skipped": [{"file": rel_posix, "reason": f"Unsupported file extension '{abs_path.suffix or '(none)'}'"}],
        }

    if abs_path.stat().st_size > 25 * 1024 * 1024:
        return {
            "checked": False,
            "findings": [],
            "unusedSuppressions": [],
            "skipped": [{"file": rel_posix, "reason": "File exceeds 25 MB single-file inspection cap"}],
        }

    pack_id = pick_pack_for_file(rel_posix, modality, explicit_pack, cfg)
    pack = resolve_effective_pack(pack_id, packs_by_id, cfg)

    if modality in {"docx", "pptx"}:
        try:
            entries: dict[str, str] = {}
            total_bytes = 0
            with zipfile.ZipFile(abs_path, "r") as zf:
                infos = zf.infolist()
                if len(infos) > 3000:
                    raise ValueError("Archive exceeds 3000-entry safety cap")
                for info in infos:
                    if info.filename.endswith((".xml", ".rels")):
                        total_bytes += info.file_size
                        if total_bytes > 120 * 1024 * 1024:
                            raise ValueError("OOXML uncompressed XML exceeds 120 MB safety ceiling")
                        entries[info.filename] = zf.read(info.filename).decode("utf-8", errors="replace")
            res = audit_ooxml_entries(entries, filename=rel_posix, modality=modality, pack=pack, config=cfg)
            missing_core = any(s["file"] == rel_posix for s in res["skipped"])
            return {"checked": not missing_core, "findings": res["findings"], "unusedSuppressions": [], "skipped": res["skipped"]}
        except Exception as exc:
            return {
                "checked": False,
                "findings": [],
                "unusedSuppressions": [],
                "skipped": [{"file": rel_posix, "reason": f"Uninspectable {modality.upper()} archive: {exc}"}],
            }

    try:
        text = abs_path.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        return {
            "checked": False,
            "findings": [],
            "unusedSuppressions": [],
            "skipped": [{"file": rel_posix, "reason": "Non-UTF-8 text encoding; convert to UTF-8 to inspect"}],
        }

    res = audit_text(text, filename=rel_posix, modality=modality, pack=pack, config=cfg)
    return {"checked": True, "findings": res["findings"], "unusedSuppressions": res["unusedSuppressions"], "skipped": []}


def collect_target_files(targets: list[str], cwd: Path, config: dict[str, Any]) -> tuple[list[tuple[Path, str]], list[dict[str, str]]]:
    files: list[tuple[Path, str]] = []
    skipped: list[dict[str, str]] = []
    ignore_globs = list(config.get("ignore", []))
    is_self_repo = (cwd / "packs" / "core" / "pack.json").is_file() and (cwd / "src" / "core.mjs").is_file()
    effective_ignores = ["packs/**", "tests/**", "scratch/**"] if (is_self_repo and not ignore_globs) else ignore_globs

    def walk(abs_p: Path, explicit: bool) -> None:
        if not abs_p.exists():
            raise FileNotFoundError(f"Target path not found: {abs_p}")
        try:
            rel = abs_p.relative_to(cwd).as_posix()
        except ValueError:
            rel = abs_p.name
        if not explicit and matches_any_glob(rel, effective_ignores):
            return
        if abs_p.is_dir():
            for entry in sorted(abs_p.iterdir()):
                if entry.name in DEFAULT_IGNORE_DIRS:
                    continue
                walk(entry, False)
            return
        if not abs_p.is_file():
            return
        mod = detect_modality(abs_p.name)
        if not mod:
            if explicit:
                skipped.append({"file": rel, "reason": f"Unsupported file extension '{abs_p.suffix or '(none)'}'"})
            return
        files.append((abs_p, rel))

    for t in targets:
        walk((cwd / t).resolve(), True)
    return files, skipped


# ---------- Anti-Pattern Catalog & Pattern Library (dislop.catalog/1) ----------

FAMILY_TO_CATEGORY = {
    "hygiene/": "delivery-hygiene",
    "office/": "office-structure",
    "lexicon/": "language-lexicon",
    "frame/": "language-template",
    "rhythm/": "language-rhythm",
    "punctuation/": "language-punctuation",
    "structure/": "discourse-structure",
    "statistics/": "statistical-rhythm",
    "evidence/": "evidence-rigor",
    "deck/": "deck-layout",
    "ui/": "ui-design",
    "composite/": "composite-signal",
}


def find_patterns_dir() -> Path:
    pkg_patterns = Path(__file__).resolve().parent / "patterns"
    if pkg_patterns.is_dir():
        return pkg_patterns
    return Path(__file__).resolve().parent.parent.parent / "patterns"


def load_pattern_library(patterns_dir: Path | None = None) -> dict[str, dict[str, Any]]:
    root = patterns_dir or find_patterns_dir()
    dim_dir = root / "dimensions"
    by_rule_id: dict[str, dict[str, Any]] = {}
    if not dim_dir.is_dir():
        return by_rule_id
    for child in sorted(dim_dir.glob("*.json")):
        data = json.loads(child.read_text(encoding="utf-8"))
        dim = data.get("dimension")
        for pat in data.get("patterns", []):
            rid = pat.get("ruleId")
            if rid:
                by_rule_id[rid] = {"dimension": dim, **pat}
    return by_rule_id


def infer_rule_category(family: str = "") -> str:
    fam = str(family or "")
    for prefix, cat in FAMILY_TO_CATEGORY.items():
        if fam.startswith(prefix):
            return cat
    return "general"


def infer_rule_languages(rule_id: str = "") -> list[str]:
    rid = str(rule_id or "")
    if rid.startswith("zh-"):
        return ["zh"]
    if rid.startswith("en-"):
        return ["en"]
    return ["en", "zh"]


def build_catalog(
    packs_by_id: dict[str, dict[str, Any]],
    pattern_by_rule_id: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    pack_order = [
        "core",
        "business-brief",
        "engineering-spec",
        "regulated-comms",
        "literary-essay",
        "deck-and-ui",
        "executive-deck",
    ]

    def sort_key(pid: str) -> tuple[int, str]:
        return (pack_order.index(pid), pid) if pid in pack_order else (len(pack_order), pid)

    entries: list[dict[str, Any]] = []
    seen_rule_ids: set[str] = set()
    for pid in sorted(packs_by_id.keys(), key=sort_key):
        pack = packs_by_id.get(pid)
        if not pack:
            continue
        for rule in pack.get("rules", []):
            rid = rule["id"]
            seen_rule_ids.add(rid)
            pat = pattern_by_rule_id.get(rid) if pattern_by_rule_id else None
            category = rule.get("category") or (pat.get("category") if pat else None) or infer_rule_category(rule.get("family", ""))
            languages = rule.get("languages") or (pat.get("languages") if pat else None) or infer_rule_languages(rid)
            tags: list[str] = []
            for t in [*(rule.get("tags") or []), *((pat.get("tags") or []) if pat else [])]:
                if t not in tags:
                    tags.append(t)
            evidence_level = (
                rule.get("evidenceLevel")
                or (pat.get("evidenceLevel") if pat else None)
                or ("objective-invariant" if rule.get("tier") == "invariant" else "editorial-consensus")
            )
            entries.append(
                {
                    "id": rid,
                    "packId": pack["id"],
                    "tier": rule.get("tier") or pack.get("tier") or "taste",
                    "severity": rule.get("severity") or "warning",
                    "family": rule.get("family") or "general",
                    "category": category,
                    "dimension": pat.get("dimension") if pat else None,
                    "detectionAngle": (pat.get("detectionAngle") if pat else None) or rule.get("probe") or "regex",
                    "languages": languages,
                    "tags": tags,
                    "evidenceLevel": evidence_level,
                    "modelTendencies": rule.get("modelTendencies") or (pat.get("modelTendencies") if pat else []) or [],
                    "probe": rule.get("probe") or "regex",
                    "modalities": rule.get("modalities") or pack.get("modalities") or [],
                    "message": rule.get("message") or {"en": "", "zh": ""},
                    "deletionTest": rule.get("deletionTest"),
                    "exemplar": rule.get("exemplar"),
                    "anchorUrl": f"https://dislop.com/#rule-{rid}",
                }
            )
    if pattern_by_rule_id:
        for rid in sorted(pattern_by_rule_id.keys()):
            if rid in seen_rule_ids:
                continue
            pat = pattern_by_rule_id[rid]
            if not pat or pat.get("status") != "active-bank":
                continue
            guards_list = pat.get("falsePositiveGuards") or []
            guards_text = " ".join(guards_list) if isinstance(guards_list, list) else ""
            dim = pat.get("dimension")
            entries.append(
                {
                    "id": rid,
                    "packId": pat.get("packId") or "pattern-bank",
                    "tier": "taste",
                    "severity": pat.get("severityDefault") or "info",
                    "family": f"{dim}/{rid}" if dim else "pattern-bank",
                    "category": pat.get("category") or "general",
                    "dimension": dim,
                    "detectionAngle": pat.get("detectionAngle") or "pattern-bank",
                    "languages": pat.get("languages") or infer_rule_languages(rid),
                    "tags": list(pat.get("tags") or []),
                    "evidenceLevel": pat.get("evidenceLevel") or "empirical-corpus",
                    "modelTendencies": list(pat.get("modelTendencies") or []),
                    "probe": pat.get("detectionAngle") or "pattern-bank",
                    "modalities": list(pat.get("modalities") or ["markdown", "text"]),
                    "message": pat.get("mechanism") or pat.get("name") or {"en": "", "zh": ""},
                    "deletionTest": {"en": guards_text, "zh": guards_text} if guards_text else None,
                    "exemplar": pat.get("exemplar"),
                    "anchorUrl": f"https://dislop.com/patterns/#{rid}",
                }
            )
    return entries


def query_catalog(entries: list[dict[str, Any]], filters: dict[str, Any] | None = None) -> dict[str, Any]:
    f = filters or {}
    q = str(f.get("query") or "").strip().lower()
    terms = [t for t in q.split() if t]
    include_exemplars = f.get("includeExemplars", True) is not False
    limit = f.get("limit") if isinstance(f.get("limit"), int) and f.get("limit", 0) > 0 else None

    matched: list[dict[str, Any]] = []
    for e in entries:
        if f.get("pack") and e["packId"] != f["pack"]:
            continue
        if f.get("tier") and e["tier"] != f["tier"]:
            continue
        if f.get("severity") and e["severity"] != f["severity"]:
            continue
        if f.get("category") and e["category"] != f["category"]:
            continue
        if f.get("dimension") and e.get("dimension") != f["dimension"]:
            continue
        if f.get("family") and not str(e["family"]).lower().startswith(str(f["family"]).lower()):
            continue
        if f.get("modality") and f["modality"] not in (e.get("modalities") or []):
            continue
        if terms:
            ex = e.get("exemplar") or {}
            msg = e.get("message") or {}
            dt = e.get("deletionTest") or {}
            haystack = "\n".join(
                [
                    str(e["id"]),
                    str(e["packId"]),
                    str(e["family"]),
                    str(e["category"]),
                    str(e.get("dimension") or ""),
                    str(e.get("detectionAngle") or ""),
                    " ".join(e.get("tags") or []),
                    str(msg.get("en") or ""),
                    str(msg.get("zh") or ""),
                    str(dt.get("en") or ""),
                    str(dt.get("zh") or ""),
                    str(ex.get("bad") or ""),
                    str(ex.get("trap") or ""),
                    str(ex.get("good") or ""),
                ]
            ).lower()
            if not all(t in haystack for t in terms):
                continue
        matched.append(e)

    facets: dict[str, dict[str, int]] = {"pack": {}, "category": {}, "severity": {}}
    for item in matched:
        facets["pack"][item["packId"]] = facets["pack"].get(item["packId"], 0) + 1
        facets["category"][item["category"]] = facets["category"].get(item["category"], 0) + 1
        facets["severity"][item["severity"]] = facets["severity"].get(item["severity"], 0) + 1

    sliced = matched[:limit] if limit else matched
    items = sliced if include_exemplars else [{k: v for k, v in item.items() if k != "exemplar"} for item in sliced]

    return {
        "schema": "dislop.catalog/1",
        "total": len(entries),
        "matched": len(matched),
        "facets": facets,
        "items": items,
    }


# ---------- Zero-Entropy Fact-Lock Ledger (`dislop.fact-ledger/1`) & Stet Spans ----------

_FACT_QUALIFIER_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("max_inc", re.compile(r"^(?:up\s+to|no\s+more\s+than|at\s+most|within|max(?:imum)?(?:\s+of)?|<=|≤)\s*", re.I)),
    ("max_lt", re.compile(r"^(?:under|below|less\s+than|fewer\s+than|<)\s*", re.I)),
    ("max_inc", re.compile(r"^(?:最多|不超过|不高于|至多|以内|上限(?:为)?)\s*")),
    ("max_lt", re.compile(r"^(?:低于|小于|少于|不到)\s*")),
    ("min_inc", re.compile(r"^(?:at\s+least|no\s+less\s+than|no\s+fewer\s+than|minimum\s+of|>=|≥)\s*", re.I)),
    ("min_gt", re.compile(r"^(?:more\s+than|greater\s+than|over|above|>)\s*", re.I)),
    ("min_inc", re.compile(r"^(?:至少|不少于|不低于|下限(?:为)?)\s*")),
    ("min_gt", re.compile(r"^(?:超过|高于|大于)\s*")),
    ("approx", re.compile(r"^(?:approx(?:imately)?\.?|roughly|about|around|~|≈)\s*", re.I)),
    ("approx", re.compile(r"^(?:约|大约|近)\s*")),
    ("asof", re.compile(r"^(?:as\s+of|since|until)\s+", re.I)),
    ("asof", re.compile(r"^(?:截至|截止到?)\s*")),
]

_FACT_SUFFIX_QUALIFIERS: list[tuple[str, re.Pattern[str]]] = [
    ("max_inc", re.compile(r"^\s*(?:以内|以下|上限)")),
    ("min_inc", re.compile(r"^\s*(?:以上|起)")),
    ("approx", re.compile(r"^\s*(?:左右)")),
]

_UNIT_CANON_MAP: dict[str, str] = {
    "ms": "ms",
    "millisecond": "ms",
    "milliseconds": "ms",
    "毫秒": "ms",
    "s": "s",
    "sec": "s",
    "secs": "s",
    "second": "s",
    "seconds": "s",
    "秒": "s",
    "min": "min",
    "mins": "min",
    "minute": "min",
    "minutes": "min",
    "分钟": "min",
    "hr": "h",
    "hrs": "h",
    "hour": "h",
    "hours": "h",
    "小时": "h",
    "day": "d",
    "days": "d",
    "天": "d",
    "month": "mo",
    "months": "mo",
    "个月": "mo",
    "year": "yr",
    "years": "yr",
    "年": "yr",
    "row": "row",
    "rows": "row",
    "行": "row",
    "美元": "$",
    "元": "cny",
}


def _canonicalize_numeric_token(token: str) -> str:
    clean = token.replace(",", "").strip()
    if re.match(r"^[+-]?v[0-9]+(?:\.[0-9]+){1,3}$", clean, re.I):
        return clean.lower()
    if re.match(r"^(?:Q[1-4]|P(?:50|90|95|99))$", clean, re.I):
        return clean.upper()
    sign = ""
    rest = clean
    if rest.startswith(("+", "-")):
        sign = rest[0]
        rest = rest[1:].strip()
    curr = ""
    if rest and rest[0] in "$€¥£":
        curr = "cny" if rest[0] == "¥" else rest[0]
        rest = rest[1:].strip()
    nm = re.match(r"^([0-9]+(?:\.[0-9]+)?)\s*(.*)$", rest)
    if not nm:
        return f"{sign}{curr}{rest.lower()}"
    num_part = nm.group(1)
    raw_unit = nm.group(2).strip()
    norm_unit = (_UNIT_CANON_MAP.get(raw_unit.lower()) or _UNIT_CANON_MAP.get(raw_unit) or raw_unit.lower()) if raw_unit else ""
    return f"{sign}{curr}{num_part}{norm_unit}"


def _blank_markup_for_fact_scan(raw: str, modality: str) -> str:
    s = re.sub(r"```[\s\S]*?```", lambda m: " " * len(m.group(0)), str(raw or ""))
    if modality == "css":
        return " " * len(s)
    if modality in {"html", "jsx", "svg"} or re.search(r"<[a-zA-Z][^>]*>", s):
        s = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", lambda m: " " * len(m.group(0)), s, flags=re.I)
        s = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", lambda m: " " * len(m.group(0)), s, flags=re.I)
        s = re.sub(r"<[^>]+>", lambda m: " " * len(m.group(0)), s)
    return s


def extract_protected_facts(text: str, *, modality: str = "markdown") -> list[dict[str, Any]]:
    raw = str(text or "")
    if not raw.strip() or modality == "css":
        return []
    line_starts = build_line_starts(raw)
    items: list[dict[str, Any]] = []
    occupied: list[tuple[int, int]] = []

    def overlaps(start: int, end: int) -> bool:
        return any(start < b and end > a for a, b in occupied)

    def claim(item: dict[str, Any]) -> None:
        s, e = item["span"]["start"], item["span"]["end"]
        if overlaps(s, e):
            return
        occupied.append((s, e))
        line, col = offset_to_line_col(line_starts, s)
        items.append({**item, "line": line, "col": col})

    without_fences = re.sub(r"```[\s\S]*?```", lambda m: " " * len(m.group(0)), raw)

    # 1. Inline code spans
    for m in re.finditer(r"`([^`\n]{2,80})`", without_fences):
        inner = m.group(1).strip()
        if not inner:
            continue
        claim({
            "kind": "code",
            "raw": m.group(0),
            "canonical": inner,
            "qualifier": None,
            "span": {"start": m.start(), "end": m.end()},
        })

    # 2. Explicit URLs and HTML hrefs
    for m in re.finditer(r"\bhttps?://[^\s)>\]\"']+", without_fences, re.I):
        cleaned = re.sub(r"[.,;!?。，；！？]+$", "", m.group(0))
        claim({
            "kind": "url",
            "raw": cleaned,
            "canonical": cleaned,
            "qualifier": None,
            "span": {"start": m.start(), "end": m.start() + len(cleaned)},
        })

    if modality in {"html", "jsx"}:
        for m in re.finditer(r"\bhref=[\"']([^\"'#\s][^\"']*?)[\"']", raw, re.I):
            target = m.group(1).strip()
            if target.lower().startswith("javascript:"):
                continue
            val_start = m.start() + m.group(0).find(target)
            claim({
                "kind": "url",
                "raw": target,
                "canonical": target,
                "qualifier": None,
                "span": {"start": val_start, "end": val_start + len(target)},
            })

    # 3. Visible prose numbers + units + bounding qualifiers
    prose_scan = _blank_markup_for_fact_scan(raw, modality)
    chars = list(prose_scan)
    for s, e in occupied:
        for i in range(s, min(e, len(chars))):
            chars[i] = " "
    clean_scan = "".join(chars)

    _unit_tail = r"(?:\s?(?:%|(?:milliseconds?|ms|minutes?|mins?|seconds?|secs?|s|hours?|hrs?|days?|months?|years?|KB|MB|GB|TB|QPS|TPS|RPS|fps|px|rows?)(?![A-Za-z0-9_])|倍|秒|分钟|小时|天|个月|年|万|亿|元|美元|次|个|条|份|页|行|人|席))?"
    num_re = re.compile(
        r"(?<![A-Za-z0-9_])(?:"
        r"v[0-9]+(?:\.[0-9]+){1,3}(?![A-Za-z0-9_.])"
        r"|[0-9]+(?:\.[0-9]+){2,3}(?![A-Za-z0-9_.])"
        r"|Q[1-4](?![A-Za-z0-9_])"
        r"|P(?:50|90|95|99)(?![A-Za-z0-9_])"
        r"|(?<![.-])[+-][$€¥£]\s?[0-9][0-9,]*(?:\.[0-9]+)?(?:\s?[kKmMbB](?![A-Za-z0-9_])|万|亿)?"
        r"|[$€¥£]\s?[0-9][0-9,]*(?:\.[0-9]+)?(?:\s?[kKmMbB](?![A-Za-z0-9_])|万|亿)?"
        rf"|(?<![.-])[+-][0-9][0-9,]*(?:\.[0-9]+)?{_unit_tail}"
        rf"|[0-9][0-9,]*(?:\.[0-9]+)?{_unit_tail}"
        r")"
    )

    for m in num_re.finditer(clean_scan):
        num_start, num_end = m.start(), m.end()
        token = m.group(0).strip()

        line_start_idx = clean_scan.rfind("\n", 0, num_start) + 1
        is_line_lead = clean_scan[line_start_idx:num_start].strip() == ""
        after_slice = clean_scan[num_end : num_end + 2]
        if is_line_lead and token.isdigit() and re.match(r"^[.)、](?:\s|$)", after_slice):
            continue

        lookbehind_start = max(0, num_start - 24)
        prefix_window = clean_scan[lookbehind_start:num_start]
        qualifier: str | None = None
        span_start = num_start
        span_end = num_end

        for q_group, q_re in _FACT_QUALIFIER_PATTERNS:
            for offset in range(len(prefix_window)):
                sub = prefix_window[offset:]
                qm = q_re.match(sub)
                if qm and len(qm.group(0)) == len(sub):
                    qualifier = q_group
                    span_start = lookbehind_start + offset
                    break
            if qualifier:
                break

        if not qualifier:
            suffix_window = clean_scan[num_end : min(len(clean_scan), num_end + 6)]
            for s_group, s_re in _FACT_SUFFIX_QUALIFIERS:
                sm = s_re.match(suffix_window)
                if sm:
                    qualifier = s_group
                    span_end = num_end + len(sm.group(0))
                    break

        canonical = _canonicalize_numeric_token(token)

        claim({
            "kind": "qualified-number" if qualifier else "number",
            "raw": raw[span_start:span_end].strip(),
            "canonical": canonical,
            "qualifier": qualifier,
            "span": {"start": span_start, "end": span_end},
        })

    items.sort(key=lambda it: it["span"]["start"])
    return items


def verify_revision(
    before_text: str,
    after_text: str,
    *,
    modality: str = "markdown",
    allow_added: bool = False,
) -> dict[str, Any]:
    before_facts = extract_protected_facts(before_text, modality=modality)
    after_facts = extract_protected_facts(after_text, modality=modality)
    pool = [{**f, "used": False} for f in after_facts]
    preserved: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    qualifier_dropped: list[dict[str, Any]] = []

    for bf in before_facts:
        is_num = bf["kind"] in {"number", "qualified-number"}
        match_idx = -1
        for idx, af in enumerate(pool):
            if af["used"]:
                continue
            same_kind = af["kind"] in {"number", "qualified-number"} if is_num else af["kind"] == bf["kind"]
            if same_kind and af["canonical"] == bf["canonical"] and (not bf["qualifier"] or af["qualifier"] == bf["qualifier"]):
                match_idx = idx
                break
        if match_idx != -1:
            pool[match_idx]["used"] = True
            preserved.append({
                "before": bf["raw"],
                "after": pool[match_idx]["raw"],
                "kind": bf["kind"],
                "canonical": bf["canonical"],
                "qualifier": bf["qualifier"],
            })
            continue

        if bf["qualifier"]:
            bare_idx = -1
            for idx, af in enumerate(pool):
                if not af["used"] and af["kind"] in {"number", "qualified-number"} and af["canonical"] == bf["canonical"]:
                    bare_idx = idx
                    break
            if bare_idx != -1:
                pool[bare_idx]["used"] = True
                qualifier_dropped.append({
                    "before": bf["raw"],
                    "after": pool[bare_idx]["raw"],
                    "canonical": bf["canonical"],
                    "expectedQualifier": bf["qualifier"],
                    "actualQualifier": pool[bare_idx]["qualifier"],
                })
                continue

        missing.append({
            "raw": bf["raw"],
            "kind": bf["kind"],
            "canonical": bf["canonical"],
            "qualifier": bf["qualifier"],
            "line": bf["line"],
            "col": bf["col"],
        })

    added_numbers = [
        {"raw": af["raw"], "canonical": af["canonical"], "line": af["line"], "col": af["col"]}
        for af in pool
        if not af["used"] and af["kind"] in {"number", "qualified-number"}
    ]

    has_drift = bool(missing or qualifier_dropped or (not allow_added and added_numbers))
    total_prot = len(before_facts)
    ret_rate = 1 if total_prot == 0 else round(len(preserved) / total_prot, 4)
    if isinstance(ret_rate, float) and ret_rate.is_integer():
        ret_rate = int(ret_rate)

    return {
        "schema": "dislop.fact-ledger/1",
        "status": "drifted" if has_drift else "preserved",
        "totalProtected": total_prot,
        "retainedCount": len(preserved),
        "retentionRate": ret_rate,
        "preserved": preserved,
        "missing": missing,
        "qualifierDropped": qualifier_dropped,
        "addedNumbers": added_numbers,
    }


def _clean_num(v: float | int) -> float | int:
    return int(v) if isinstance(v, float) and v.is_integer() else v


def _round_half_up_1(v: float | int) -> float | int:
    return _clean_num(math.floor(float(v) * 10.0 + 0.5) / 10.0)


def extract_voice_profile_offline(samples: list[str] | str, *, lang: str = "auto") -> dict[str, Any]:
    raw_list = samples if isinstance(samples, list) else [samples]
    clean_samples = [str(s or "").strip() for s in raw_list if str(s or "").strip()]
    combined = "\n\n".join(clean_samples)
    cjk_count = len(re.findall(r"[\u4e00-\u9fff]", combined))
    latin_words = len(re.findall(r"[A-Za-z]{2,}", combined))
    resolved_lang = lang if lang in {"zh", "en"} else ("zh" if cjk_count >= latin_words else "en")

    prof = analyze_text_profile(combined, modality="markdown")
    mean_len = _clean_num(prof["burstiness"]["meanLength"])
    cv = _clean_num(prof["burstiness"]["cv"])
    conc = _clean_num(prof["concreteness"]["per100Units"])
    em_dash = _clean_num(prof["punctuation"]["emDashPer300"])
    min_band = _round_half_up_1(max(4.0, float(mean_len) * 0.65))
    max_band = _round_half_up_1(max(float(min_band) + 6.0, float(mean_len) * 1.45))

    if resolved_lang == "zh":
        tone = (
            "直接、重实据的平实技术/工作表达，优先给数字与具体对象"
            if conc >= 4
            else "克制、自然的白话叙述，少修饰词与铺垫帽"
        )
        sentence_habits = [
            f"长短句自然错落（平均句长 {mean_len}，起伏系数 {cv}）"
            if cv >= 0.35
            else f"句幅平稳克制（目标句长区间 {min_band}–{max_band}）",
            "几乎不用破折号插话，靠逗号与句号自然断句"
            if em_dash <= 1
            else f"适度使用破折号补充限定（约 {em_dash}/300 词单元）",
        ]
        preferred_patterns = [
            "每段保留可核对的数字、时间或配置锚点" if conc >= 3 else "第一句直接交代动作主体与结论",
            "条件与数字紧贴写出，不拆成排比口号",
        ]
        avoid_patterns = ["开头寒暄与宏大时代背景铺垫", "“不是 A，而是 B”反转与三段对称分号句"]
    else:
        tone = (
            "Direct, evidence-dense maker prose grounded in numbers and concrete nouns"
            if conc >= 4
            else "Plain, conversational prose with minimal throat-clearing or hype"
        )
        sentence_habits = [
            f"Varied sentence cadence (mean {mean_len} units, CV {cv})"
            if cv >= 0.35
            else f"Steady sentence cadence (target band {min_band}–{max_band} units)",
            "Minimal em-dash interruptions; relies on periods and plain clauses"
            if em_dash <= 1
            else f"Moderate parenthetical em-dashes (~{em_dash} per 300 units)",
        ]
        preferred_patterns = [
            "Anchor claims with specific metrics, versions, or file paths"
            if conc >= 3
            else "Lead paragraphs with concrete subjects and active verbs",
            "Keep bounding qualifiers ('up to', 'at least') attached to numbers",
        ]
        avoid_patterns = ["Throat-clearing openers and 'Looking ahead' closers", "'Not X, but Y' pivots and 3-part semicolon pitches"]

    return {
        "schema": "dislop.voice/1",
        "mode": "offline-deterministic",
        "lang": resolved_lang,
        "stylometrics": {
            "sampleCount": len(clean_samples),
            "sentenceCount": prof["sentenceCount"],
            "meanLength": mean_len,
            "lengthCV": cv,
            "targetLengthBand": [min_band, max_band],
            "concretenessPer100": conc,
            "mattr": prof["lexical"]["mattr"],
            "emDashPer300": em_dash,
            "maxSemicolonsInSentence": prof["punctuation"]["maxSemicolonsInSentence"],
        },
        "profile": {
            "tone": tone,
            "sentenceHabits": sentence_habits,
            "preferredPatterns": preferred_patterns,
            "avoidPatterns": avoid_patterns,
        },
    }
