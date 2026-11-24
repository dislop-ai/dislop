"""Zero-dependency Python 3.10+ core engine matching `src/core.mjs`."""

from __future__ import annotations

import bisect
import colorsys
import fnmatch
import functools
import json
import math
import os
import re
import struct
import zipfile
import zlib
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

ENGINE_VERSION = "0.8.4"

SEVERITY_RANK = {
    "info": 1,
    "warning": 2,
    "error": 3,
    "never": 99,
}

VALID_REGISTERS: tuple[str, ...] = (
    "unspecified",
    "official",
    "casual",
    "argumentative",
    "technical",
    "marketing",
    "narrative",
)
_VALID_REGISTER_SET = set(VALID_REGISTERS)


def _expand_braces(pattern: str) -> list[str]:
    m = re.search(r"\{([^{}]+)\}", str(pattern or ""))
    if not m:
        return [str(pattern or "")]
    prefix = str(pattern or "")[: m.start()]
    suffix = str(pattern or "")[m.end() :]
    out: list[str] = []
    for part in m.group(1).split(","):
        out.extend(_expand_braces(prefix + part.strip() + suffix))
    return out


def _glob_to_regex(glob: str) -> re.Pattern[str]:
    norm = str(glob or "").replace("\\", "/").lstrip("./")
    rx = "^"
    i = 0
    while i < len(norm):
        ch = norm[i]
        if ch == "*" and i + 1 < len(norm) and norm[i + 1] == "*":
            if i + 2 < len(norm) and norm[i + 2] == "/":
                rx += "(?:.+/)?"
                i += 2
            else:
                rx += ".*"
                i += 1
        elif ch == "*":
            rx += "[^/]*"
        elif ch == "?":
            rx += "[^/]"
        elif ch in "+.^$|()[]{}":
            rx += "\\" + ch
        else:
            rx += ch
        i += 1
    rx += "$"
    return re.compile(rx)


def matches_any_glob(rel_posix: str, globs: list[str] | None = None) -> bool:
    clean = str(rel_posix or "").replace("\\", "/").lstrip("./")
    for raw_g in globs or []:
        for expanded in _expand_braces(raw_g):
            if _glob_to_regex(expanded).match(clean):
                return True
    return False


def validate_config(config: Any) -> Any:
    if config is None:
        return config
    if not isinstance(config, dict):
        raise ValueError("Invalid config: expected JSON object")
    if config.get("failOn") is not None:
        fail_on = config.get("failOn")
        if not isinstance(fail_on, str) or fail_on not in SEVERITY_RANK:
            raise ValueError("Invalid config 'failOn': expected error, warning, info, or never")
    if config.get("register") is not None:
        reg = config.get("register")
        if not isinstance(reg, str):
            raise ValueError("Invalid config 'register': expected string")
        norm = reg.strip().lower()
        if norm != "" and norm not in _VALID_REGISTER_SET:
            joined = ", ".join(VALID_REGISTERS)
            raise ValueError(f"Invalid config register '{reg}' (expected {joined})")
    if config.get("overrides") is not None:
        overrides = config.get("overrides")
        if not isinstance(overrides, list):
            raise ValueError("Invalid config 'overrides': expected array")
        for ov in overrides:
            if not isinstance(ov, dict):
                raise ValueError("Invalid config 'overrides' item: expected object")
            if ov.get("register") is not None:
                ov_reg = ov.get("register")
                if not isinstance(ov_reg, str):
                    raise ValueError("Invalid config override 'register': expected string")
                ov_norm = ov_reg.strip().lower()
                if ov_norm != "" and ov_norm not in _VALID_REGISTER_SET:
                    joined = ", ".join(VALID_REGISTERS)
                    raise ValueError(f"Invalid config override register '{ov_reg}' (expected {joined})")
    return config


def parse_front_matter_register(text: str) -> str | None:
    if not isinstance(text, str) or not text:
        return None
    stripped = text[1:] if text.startswith("\ufeff") else text
    fm = re.match(r"^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)", stripped)
    if not fm:
        return None
    generic_reg: str | None = None
    for raw_line in re.split(r"\r?\n", fm.group(1)):
        m = re.match(r"^(dislop_register|register):[ \t]*(.*?)[ \t]*(?:#.*)?$", raw_line)
        if not m:
            continue
        key = m.group(1).lower()
        raw_val = (m.group(2) or "").strip()
        if len(raw_val) >= 2 and (
            (raw_val.startswith('"') and raw_val.endswith('"'))
            or (raw_val.startswith("'") and raw_val.endswith("'"))
        ):
            raw_val = raw_val[1:-1].strip()
        val = raw_val.lower()
        if key == "dislop_register":
            if not val or val not in _VALID_REGISTER_SET:
                joined = ", ".join(VALID_REGISTERS)
                raise ValueError(f"Invalid dislop_register '{raw_val}' in frontmatter (expected {joined})")
            return val
        if generic_reg is None and val in _VALID_REGISTER_SET:
            generic_reg = val
    return generic_reg


def resolve_register(
    text: str = "",
    *,
    filename: str = "<memory>",
    flag_register: str | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, str]:
    cfg = config or {}
    validate_config(cfg)
    joined = ", ".join(VALID_REGISTERS)
    if flag_register is not None:
        if not isinstance(flag_register, str):
            raise ValueError(f"Invalid --register (expected string: auto, {joined})")
        if flag_register.strip() != "":
            norm = flag_register.strip().lower()
            if norm != "auto":
                if norm not in _VALID_REGISTER_SET:
                    raise ValueError(f"Invalid --register '{flag_register}' (expected auto, {joined})")
                return {"register": norm, "registerSource": "flag"}

    mod = detect_modality(filename)
    if mod is None or mod in {"markdown", "text"}:
        fm_reg = parse_front_matter_register(text)
        if fm_reg:
            return {"register": fm_reg, "registerSource": "frontmatter"}

    rel = str(filename or "").replace("\\", "/").lstrip("./")
    for ov in cfg.get("overrides") or []:
        if not isinstance(ov, dict) or not ov.get("register"):
            continue
        ov_reg = str(ov["register"]).strip().lower()
        if not ov_reg:
            continue
        raw_files = ov.get("files")
        patterns = raw_files if isinstance(raw_files, list) else ([raw_files] if raw_files else [])
        if patterns and matches_any_glob(rel, patterns):
            return {"register": ov_reg, "registerSource": "config"}

    cfg_reg = cfg.get("register")
    if isinstance(cfg_reg, str) and cfg_reg.strip() != "":
        return {"register": cfg_reg.strip().lower(), "registerSource": "config"}

    return {"register": "unspecified", "registerSource": "default"}


def apply_register_override(
    rule: dict[str, Any],
    register: str = "unspecified",
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not register or register == "unspecified" or rule.get("tier") == "invariant":
        return {"skip": False, "rule": rule, "registerAdjusted": False}
    user_override = (config or {}).get("rules", {}).get(rule["id"]) if isinstance((config or {}).get("rules"), dict) else None
    if isinstance(user_override, str) and user_override in SEVERITY_RANK:
        return {"skip": False, "rule": rule, "registerAdjusted": False}
    ov = (rule.get("registerOverrides") or {}).get(register)
    if not ov:
        return {"skip": False, "rule": rule, "registerAdjusted": False}
    if ov.get("action") == "skip":
        return {"skip": True, "rule": None, "registerAdjusted": True}
    eff = {**rule}
    if ov.get("severity") and ov["severity"] in SEVERITY_RANK:
        eff["severity"] = ov["severity"]
    if ov.get("message"):
        eff["message"] = ov["message"]
    if ov.get("deletionTest"):
        eff["deletionTest"] = ov["deletionTest"]
    if ov.get("revisionKind"):
        eff["revisionKind"] = ov["revisionKind"]
    if ov.get("revisionScope"):
        eff["revisionScope"] = ov["revisionScope"]
    if ov.get("revisionAvoid"):
        eff["revisionAvoid"] = ov["revisionAvoid"]
    return {"skip": False, "rule": eff, "registerAdjusted": True}


SCENARIO_STRATEGIES: dict[str, dict[str, Any]] = {
    "technical": {
        "id": "technical",
        "label": {"en": "Engineering Spec & RFC", "zh": "研发文档与复盘"},
        "cut": {
            "en": "Remove marketing hype, code-diff parroting, hollow 'not human error' excuses, and ownerless action items.",
            "zh": "删掉营销形容词、纯复述 Diff 的句子、“并非单纯人为失误”套话和无责任人的待办项。",
        },
        "protect": {
            "en": "Keep uniform constraint lists, semicolon preconditions, CLI/code identifiers, exact thresholds, and parameter tables intact.",
            "zh": "保留等长的约束条款、分号并列前置条件、代码/命令标识、阈值数字与参数表，不强求文学长短句起伏。",
        },
        "avoid": {
            "en": "Do not alter code identifiers, weaken numeric bounds, or add casual chatter.",
            "zh": "绝不改写代码标识、放宽数值边界，也不要为了所谓人味掺入随口聊天腔。",
        },
    },
    "official": {
        "id": "official",
        "label": {"en": "Official & Regulated Notice", "zh": "公文、合规与正式通告"},
        "cut": {
            "en": "Strip unsubstantiated superlatives, unanchored multipliers, AI chat greetings, and empty slogans lacking a referent.",
            "zh": "删掉无证据绝对化承诺、悬空倍数、AI 寒暄壳，以及没有具体指代的空洞口号。",
        },
        "protect": {
            "en": "Preserve formal institutional phrasing, numbered clauses, legal disclaimers, and scope qualifiers ('only if', 'unless').",
            "zh": "保留规范书面措辞、条款编号、责任边界、法律免责与限定条件（如“仅限”“除非”）。",
        },
        "avoid": {
            "en": "Do not rewrite formal clauses into casual slang or invent unverified compliance guarantees.",
            "zh": "不要把正式条款改成轻浮口语，也绝不补写未核实的合规承诺。",
        },
    },
    "argumentative": {
        "id": "argumentative",
        "label": {"en": "Business Brief & Essay-Argument", "zh": "工作简报与观点长文"},
        "cut": {
            "en": "Cut macro-trend openers, buzzword clusters, 3-part balanced semicolon pitches, 'Not X, but Y' slogans, and unsourced claims.",
            "zh": "切掉宏观趋势开场、热词共现、三段对称分号推销句、“不是 A 而是 B”金句和无出处背书。",
        },
        "protect": {
            "en": "Keep upfront conclusions, concrete metrics, genuine trade-off contrasts, and named internal data sources.",
            "zh": "保留前置结论与关键数字、带真实动作的取舍对比，以及具名后台/实测数据来源。",
        },
        "avoid": {
            "en": "Do not trade one slogan for another aphorism or add macro sign-offs ('Looking ahead').",
            "zh": "不要把一种套话换成另一句金句，更别在结尾补写“展望未来”式拔高。",
        },
    },
    "narrative": {
        "id": "narrative",
        "label": {"en": "Literary Essay & Column", "zh": "随笔、专栏与叙事非虚构"},
        "cut": {
            "en": "Strip moralizing endings, stock AI metaphors, stiff translationese, mechanical Q&A transitions, and halfwidth CJK punctuation.",
            "zh": "删掉结尾强行升华、陈旧 AI 意象、生硬欧化翻译腔、机械设问过渡与中文里的半角标点。",
        },
        "protect": {
            "en": "Preserve sensory details, dialogue, author rhythm contrast, deliberate short dramatic beats, and natural flowing sentences.",
            "zh": "保留现场细节、人物原话、个人节奏起伏、有意的短句停顿和通顺的流水长句。",
        },
        "avoid": {
            "en": "Do not flatten personal prose into technical bullet points or invent scenes missing from the notes.",
            "zh": "不要把个人叙述改呆板成工程条目，也绝不外编素材里没有的细节。",
        },
    },
    "casual": {
        "id": "casual",
        "label": {"en": "Conversational & Personal Post", "zh": "口语帖、闲置转卖与社区分享"},
        "cut": {
            "en": "Remove scripted influencer clichés, customer-service filler wrappers, chatbot openings, and injected corporate jargon.",
            "zh": "去掉网红脚本腔、刻意客服套话、AI 开场白和硬塞进去的企业黑话。",
        },
        "protect": {
            "en": "Preserve first-person spoken phrasing, conversational cadence, and recurring shop or shipping policy lines verbatim.",
            "zh": "保留第一人称口语词、日常停顿节奏，以及固定交易/发货规则短句。",
        },
        "avoid": {
            "en": "Do not inflate spoken wording into stiff bookish prose or cycle synonyms on recurring policy lines.",
            "zh": "绝不为了规避重复把口语改成生硬书面腔（如把“自己收的”改成“仅出/略有/旨在”），也无需同义词轮换。",
        },
    },
    "marketing": {
        "id": "marketing",
        "label": {"en": "Product & Launch Copy", "zh": "产品介绍与发布文案"},
        "cut": {
            "en": "Remove generic AI SaaS hype ('unleash', 'supercharge', 'new era'), empty triads, and unverified speed/quality claims.",
            "zh": "删掉千篇一律的 AI 营销大词（赋能/颠覆/新纪元）、空洞三段排比和无基准夸大宣称。",
        },
        "protect": {
            "en": "Keep concrete product mechanisms, intentional punchy benefit lines, and verified user counts or benchmarks.",
            "zh": "保留具体产品机制、有实质信息的短促利益点，以及实测或真实用户数字。",
        },
        "avoid": {
            "en": "Do not invent customer metrics or pad short benefits into abstract manifesto paragraphs.",
            "zh": "不编造用户数据，不把短促清楚的功能点抻成长段虚词。",
        },
    },
    "deck-ui": {
        "id": "deck-ui",
        "label": {"en": "Slides, PDF & Web UI", "zh": "PPT、海报与网页界面"},
        "cut": {
            "en": "Cut vague topic slide titles, >120-word slide walls, dead '#' links, purple-pink gradients, pill soup, and nested boxes.",
            "zh": "去掉空泛主题式标题、整屏文字墙、空 '#' 链接、紫粉霓虹渐变、胶囊标签墙和多层套盒。",
        },
        "protect": {
            "en": "Keep action-takeaway titles, concise UI slot copy, real interactive routes, and single-screen hierarchy.",
            "zh": "保留直接说结论的标题、简短清晰的界面词条、真实跳转路径与单屏层级结构。",
        },
        "avoid": {
            "en": "Never expand microcopy past its container slot or add decorative 'AI-Powered' badges.",
            "zh": "界面短文案改写长度不得超过原位置容量，不加装饰性 AI 标签。",
        },
    },
}

_PACK_DEFAULT_STRATEGY: dict[str, str] = {
    "engineering-spec": "technical",
    "regulated-comms": "official",
    "literary-essay": "narrative",
    "deck-and-ui": "deck-ui",
    "executive-deck": "deck-ui",
    "business-brief": "argumentative",
    "core": "argumentative",
}


def get_scenario_strategy(*, pack_id: str = "business-brief", register: str = "unspecified") -> dict[str, Any]:
    reg_norm = str(register or "").strip().lower()
    if reg_norm and reg_norm not in {"unspecified", "auto"} and reg_norm in SCENARIO_STRATEGIES:
        return SCENARIO_STRATEGIES[reg_norm]
    key = _PACK_DEFAULT_STRATEGY.get(pack_id, "argumentative")
    return SCENARIO_STRATEGIES.get(key, SCENARIO_STRATEGIES["argumentative"])

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
    ".pdf": "pdf",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".gif": "image",
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


def _split_lf(text: str) -> list[str]:
    return re.split(r"\r?\n", str(text or ""))


def _fix_surrogates(s: str) -> str:
    if not any(0xD800 <= ord(ch) <= 0xDFFF for ch in s):
        return s
    out: list[str] = []
    i = 0
    n = len(s)
    while i < n:
        c = ord(s[i])
        if 0xD800 <= c <= 0xDBFF:
            if i + 1 < n:
                c2 = ord(s[i + 1])
                if 0xDC00 <= c2 <= 0xDFFF:
                    out.append(chr(0x10000 + (((c - 0xD800) << 10) | (c2 - 0xDC00))))
                    i += 2
                    continue
            out.append("\ufffd")
        elif 0xDC00 <= c <= 0xDFFF:
            out.append("\ufffd")
        else:
            out.append(s[i])
        i += 1
    return "".join(out)


def get_user_config_dir() -> Path:
    if os.environ.get("DISLOP_CONFIG_HOME"):
        return Path(os.environ["DISLOP_CONFIG_HOME"]).expanduser()
    xdg = os.environ.get("XDG_CONFIG_HOME")
    base = Path(xdg).expanduser() if xdg else (Path.home() / ".config")
    return base / "dislop"


def _should_skip_user_config(root: Path, explicit_path: str | None) -> bool:
    if explicit_path or os.environ.get("DISLOP_NO_USER_CONFIG") == "1":
        return True
    is_self_repo = (root / "packs" / "core" / "pack.json").is_file() and (root / "src" / "core.mjs").is_file()
    return is_self_repo and not os.environ.get("DISLOP_CONFIG_HOME")


def _merge_config_layers(base: dict[str, Any], layer: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(layer, dict):
        return base
    merged = {**base, **layer}
    merged["rules"] = {**(base.get("rules") or {}), **(layer.get("rules") or {})}
    merged["allow"] = [*(base.get("allow") or []), *(layer.get("allow") or [])]
    merged["ignore"] = [*(base.get("ignore") or []), *(layer.get("ignore") or [])]
    merged["forbid"] = [*(base.get("forbid") or []), *(layer.get("forbid") or [])]
    merged["overrides"] = [*(base.get("overrides") or []), *(layer.get("overrides") or [])]
    merged["proseFences"] = [*(base.get("proseFences") or []), *(layer.get("proseFences") or [])]
    if "maskBlockquotes" in layer:
        merged["maskBlockquotes"] = layer["maskBlockquotes"]
    return merged


def _read_config_json(path: Path) -> dict[str, Any] | None:
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in config {path}: {exc.msg}") from exc
    if not isinstance(loaded, dict):
        raise ValueError(f"Invalid config in {path}: expected JSON object")
    return loaded


def load_config(cwd: Path | None = None, explicit_path: str | None = None) -> dict[str, Any]:
    root = cwd or Path.cwd()
    base: dict[str, Any] = {}
    if not _should_skip_user_config(root, explicit_path):
        user_cfg = get_user_config_dir() / "config.json"
        if user_cfg.is_file():
            loaded_u = _read_config_json(user_cfg)
            if loaded_u is not None:
                base = _merge_config_layers(base, loaded_u)

    if explicit_path:
        cand = Path(explicit_path)
        if not cand.is_absolute():
            cand = root / cand
        if not cand.is_file():
            raise ValueError(f"Config file not found: {cand}")
        loaded = _read_config_json(cand)
        if loaded is not None:
            base = _merge_config_layers(base, loaded)
    else:
        for cand in [root / ".dislop.json", root / "dislop.json", root / ".disloprc.json"]:
            if cand.is_file():
                loaded = _read_config_json(cand)
                if loaded is not None:
                    base = _merge_config_layers(base, loaded)
                break

    local_path = root / ".dislop.local.json"
    if local_path.is_file():
        local_cfg = _read_config_json(local_path)
        if local_cfg is not None:
            base = _merge_config_layers(base, local_cfg)
    validate_config(base)
    return base


def discover_voice_card(cwd: Path | None = None) -> dict[str, Any]:
    root = cwd or Path.cwd()
    candidates: list[tuple[str, Path]] = [
        ("local", root / ".dislop.local" / "voice.json"),
        ("project", root / ".dislop" / "voice.json"),
    ]
    if not _should_skip_user_config(root, None):
        candidates.append(("user", get_user_config_dir() / "voice.json"))
    for scope, p in candidates:
        if p.is_file():
            try:
                card = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(card, dict):
                    return {"found": True, "scope": scope, "card": card}
            except Exception:
                continue
    return {"found": False, "scope": None, "card": None}


def resolve_config_for_file(rel_posix: str, config: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = config or {}
    merged: dict[str, Any] = {
        **cfg,
        "rules": dict(cfg.get("rules") or {}),
        "allow": list(cfg.get("allow") or []),
        "forbid": list(cfg.get("forbid") or []),
        "proseFences": list(cfg.get("proseFences") or []),
    }
    for ov in (cfg.get("overrides") or []):
        if not isinstance(ov, dict):
            continue
        files = ov.get("files") or []
        patterns = files if isinstance(files, list) else [files]
        if not matches_any_glob(rel_posix, patterns):
            continue
        if ov.get("pack"):
            merged["pack"] = ov["pack"]
        if isinstance(ov.get("rules"), dict):
            merged["rules"] = {**merged["rules"], **ov["rules"]}
        if isinstance(ov.get("allow"), list):
            merged["allow"] = [*merged["allow"], *ov["allow"]]
        if isinstance(ov.get("forbid"), list):
            merged["forbid"] = [*merged["forbid"], *ov["forbid"]]
        if isinstance(ov.get("proseFences"), list):
            merged["proseFences"] = [*merged["proseFences"], *ov["proseFences"]]
        if "maskBlockquotes" in ov:
            merged["maskBlockquotes"] = ov["maskBlockquotes"]
    return merged


def is_long_form_html_document(raw_html: str) -> bool:
    raw = str(raw_html or "")
    if not raw.strip():
        return False
    if re.search(r'(?:class\s*=\s*["\'][^"\']*\b(?:reveal|slides)\b|data-slide\b)', raw, re.I):
        return False
    slide_cls = re.findall(r'class\s*=\s*["\'][^"\']*\bslide\b', raw, re.I)
    if len(slide_cls) >= 2:
        return False
    zones = build_zones(raw, "html")
    visible = zones.get("proseLogical") or zones.get("prose") or ""
    cjk_chars = len(re.findall(r"[\u4e00-\u9fff]", visible))
    en_words = len([w for w in visible.split() if re.search(r"[A-Za-z0-9]", w, re.ASCII)])
    if cjk_chars >= 600 or en_words >= 250:
        return True
    blocks = [b.strip() for b in re.split(r"\n+| {5,}", visible) if b.strip()]
    substantial_blocks = 0
    for blk in blocks:
        blk_cjk = len(re.findall(r"[\u4e00-\u9fff]", blk))
        blk_en = len([w for w in blk.split() if re.search(r"[A-Za-z0-9]", w, re.ASCII)])
        if blk_cjk >= 20 or blk_en >= 14:
            substantial_blocks += 1
        if substantial_blocks >= 2:
            return True
    return False


def has_embedded_ui_markup(raw_markdown: str) -> bool:
    s = _mask_markdown_fences(str(raw_markdown or ""), set())
    s = re.sub(r"`[^`\n]+`", " ", s)
    ui_tags = re.findall(
        r"<(?:(?:div|section|article|header|nav|button)\b[^>]*(?:class(?:Name)?=|style=)|a\b[^>]*(?:class(?:Name)?=|style=|href=[\"'](?:#|javascript:|\s*[\"']))|svg\b[^>]*>)",
        s,
        re.I | re.ASCII,
    )
    return len(ui_tags) >= 2


def compute_ruleset_hash(pack: dict[str, Any] | None) -> str:
    p = pack or {}
    parts = "|".join(sorted(f"{r.get('id')}:{r.get('severity') or 'warning'}" for r in (p.get("rules") or [])))
    return fnv1a_hex(f"{ENGINE_VERSION}|{p.get('id') or ''}|{parts}")


def merge_packs(primary_pack: dict[str, Any], extra_pack: dict[str, Any]) -> dict[str, Any]:
    by_id: dict[str, dict[str, Any]] = {}
    for r in extra_pack.get("rules", []):
        by_id[r["id"]] = r
    for r in primary_pack.get("rules", []):
        by_id[r["id"]] = r
    return {
        **extra_pack,
        **primary_pack,
        "id": f"{primary_pack['id']}+{extra_pack['id']}",
        "thresholds": {**extra_pack.get("thresholds", {}), **primary_pack.get("thresholds", {})},
        "rules": list(by_id.values()),
    }


def detect_modality(filename: str) -> str | None:
    if not filename or filename == "<memory>":
        return "markdown"
    ext = Path(filename).suffix.lower()
    if not ext:
        return None
    return EXT_TO_MODALITY.get(ext)


def default_pack_for_modality(modality: str) -> str:
    if modality in {"html", "css", "jsx", "svg", "pptx", "pdf", "image"}:
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
    if explicit_pack and explicit_pack != "auto":
        return explicit_pack
    if explicit_pack != "auto":
        for ov in (config.get("overrides") or []):
            files = ov.get("files") or []
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
    rule_overrides = cfg.get("rules") or {}

    for p in chain:
        merged_thresholds.update(p.get("thresholds") or {})
        for rule in (p.get("rules") or []):
            rid = rule["id"]
            ov = rule_overrides.get(rid)
            if ov == "off" and rule.get("tier") != "invariant":
                rules_by_id.pop(rid, None)
                continue
            eff = dict(rule)
            if isinstance(ov, str) and ov in SEVERITY_RANK and rule.get("tier") != "invariant":
                eff["severity"] = ov
            rules_by_id[rid] = eff

    forbid_list = cfg.get("forbid") or []
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
    for b in text.encode("utf-8", errors="replace"):
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


def is_sentence_break_at(text: str, idx: int) -> bool:
    if idx < 0 or idx >= len(text):
        return False
    ch = text[idx]
    if ch not in "\n.!?。！？":
        return False
    if ch != ".":
        return True
    prev_ch = text[idx - 1] if idx > 0 else ""
    next_ch = text[idx + 1] if idx + 1 < len(text) else ""
    if "0" <= prev_ch <= "9" and "0" <= next_ch <= "9":
        return False
    if (prev_ch.isascii() and (prev_ch.isalnum() or prev_ch in "_-")) and (next_ch.isascii() and (("a" <= next_ch <= "z") or ("0" <= next_ch <= "9"))):
        return False
    before_word = text[max(0, idx - 6) : idx]
    if re.search(r"(?:^|\s)(?:vs|v|approx|e\.g|i\.e)$", before_word, re.I | re.ASCII):
        return False
    return True


def _is_sentence_break_at(text: str, idx: int) -> bool:
    return is_sentence_break_at(text, idx)


def _build_sentence_break_indices(text: str) -> list[int]:
    return [i for i, ch in enumerate(text) if ch in "\n.!?。！？" and is_sentence_break_at(text, i)]


def enclosing_sentence(text: str, start: int, end: int, break_indices: list[int] | None = None) -> str:
    left = 0
    right = len(text)
    if break_indices:
        pos_l = bisect.bisect_left(break_indices, start)
        if pos_l > 0:
            left = break_indices[pos_l - 1] + 1
        pos_r = bisect.bisect_left(break_indices, end)
        if pos_r < len(break_indices):
            right = break_indices[pos_r]
    else:
        left = start
        while left > 0 and not is_sentence_break_at(text, left - 1):
            left -= 1
        right = end
        while right < len(text) and not is_sentence_break_at(text, right):
            right += 1
    if right < len(text) and text[right] in ".!?。！？":
        right += 1
    return re.sub(r"^[\s\ufeff]+|[\s\ufeff]+$", "", text[left:right])[:240]


def enclosing_sentence_unclipped(text: str, start: int, end: int) -> str:
    prev_nl = text.rfind("\n", 0, max(0, start))
    line_start = 0 if prev_nl == -1 else prev_nl + 1
    next_nl = text.find("\n", end)
    line_end = len(text) if next_nl == -1 else next_nl
    line_text = text[line_start:line_end]
    code_ranges = [(line_start + cm.start(), line_start + cm.end()) for cm in re.finditer(r"`[^`\n]+`", line_text)]

    def in_backticks(idx: int) -> bool:
        return any(s <= idx < e for s, e in code_ranges)

    left = start
    while left > line_start and (in_backticks(left - 1) or not is_sentence_break_at(text, left - 1)):
        left -= 1
    right = end
    while right < line_end and (in_backticks(right) or not is_sentence_break_at(text, right)):
        right += 1
    if right < line_end and not in_backticks(right) and text[right] in ".!?。！？":
        right += 1
    return re.sub(r"^[\s\ufeff]+|[\s\ufeff]+$", "", text[left:right])


def parse_suppressions(text: str) -> tuple[dict[int, list[dict[str, Any]]], list[dict[str, Any]]]:
    lines = _split_lf(text)
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


_HTML_ENTITY_NAMED = {
    "lt": "<",
    "gt": ">",
    "amp": "&",
    "quot": '"',
    "apos": "'",
    "nbsp": " ",
    "mdash": "—",
    "ndash": "–",
    "hellip": "…",
}

_HTML_BLOCK_BREAK_TAG_RE = re.compile(
    r"^<\/(?:p|div|li|td|th|tr|h[1-6]|section|article|header|footer|aside|blockquote|dt|dd|button|title)\b|^<br\b",
    re.I,
)


_HTML_ENTITY_RE = re.compile(
    r"&(?:#([0-9]+)|#x([0-9a-fA-F]+)|lt|gt|amp|quot|apos|nbsp|mdash|ndash|hellip);",
    re.I,
)


def _decode_entity_token(raw_ent: str, dec: str | None, hx: str | None) -> str | None:
    if dec:
        cp = int(dec, 10)
        return chr(cp) if 0 < cp <= 0x10FFFF else " "
    if hx:
        cp = int(hx, 16)
        return chr(cp) if 0 < cp <= 0x10FFFF else " "
    return _HTML_ENTITY_NAMED.get(raw_ent[1:-1].lower())


def _decode_html_entities_preserving_length(text: str) -> str:
    def _repl(m: re.Match[str]) -> str:
        raw_ent = m.group(0)
        ch = _decode_entity_token(raw_ent, m.group(1), m.group(2))
        if ch is None:
            return raw_ent
        ch = _fix_surrogates(ch)
        if len(ch) <= len(raw_ent):
            return ch + " " * (len(raw_ent) - len(ch))
        return ch[0] + " " * max(0, len(raw_ent) - 1)

    return _HTML_ENTITY_RE.sub(_repl, str(text))


def _decode_html_with_offset_map(text: str) -> tuple[str, list[int], list[int]] | None:
    s = str(text or "")
    if "&" not in s:
        return None
    out_chars: list[str] = []
    map_starts: list[int] = []
    map_ends: list[int] = []
    last = 0
    matched_any = False
    for m in _HTML_ENTITY_RE.finditer(s):
        for k in range(last, m.start()):
            out_chars.append(s[k])
            map_starts.append(k)
            map_ends.append(k + 1)
        ch = _decode_entity_token(m.group(0), m.group(1), m.group(2))
        if ch is not None:
            matched_any = True
            # Handle adjacent UTF-16 surrogate pair entities later via _fix_surrogates mapping
            out_chars.append(ch)
            map_starts.append(m.start())
            map_ends.append(m.end())
        else:
            for k in range(m.start(), m.end()):
                out_chars.append(s[k])
                map_starts.append(k)
                map_ends.append(k + 1)
        last = m.end()
    if not matched_any:
        return None
    for k in range(last, len(s)):
        out_chars.append(s[k])
        map_starts.append(k)
        map_ends.append(k + 1)
    # Collapse adjacent surrogate entities cleanly while preserving outer span
    joined: list[str] = []
    j_starts: list[int] = []
    j_ends: list[int] = []
    i = 0
    n = len(out_chars)
    while i < n:
        c = ord(out_chars[i])
        if 0xD800 <= c <= 0xDBFF:
            if i + 1 < n and 0xDC00 <= ord(out_chars[i + 1]) <= 0xDFFF:
                c2 = ord(out_chars[i + 1])
                joined.append(chr(0x10000 + (((c - 0xD800) << 10) | (c2 - 0xDC00))))
                j_starts.append(map_starts[i])
                j_ends.append(map_ends[i + 1])
                i += 2
                continue
            joined.append("\ufffd")
            j_starts.append(map_starts[i])
            j_ends.append(map_ends[i])
        elif 0xDC00 <= c <= 0xDFFF:
            joined.append("\ufffd")
            j_starts.append(map_starts[i])
            j_ends.append(map_ends[i])
        else:
            joined.append(out_chars[i])
            j_starts.append(map_starts[i])
            j_ends.append(map_ends[i])
        i += 1
    return "".join(joined), j_starts, j_ends


def _mask_markdown_fences(text: str, prose_fence_set: set[str]) -> str:
    lines = text.split("\n")
    out: list[str] = []
    fence_char: str | None = None
    fence_len = 0
    keep_body = False
    for raw_line in lines:
        has_cr = raw_line.endswith("\r")
        no_cr = raw_line[:-1] if has_cr else raw_line
        cr = "\r" if has_cr else ""
        trimmed = no_cr.strip()
        if fence_char is None:
            fm = re.match(r"^[ \t]*(`{3,}|~{3,})(.*)$", no_cr)
            if fm:
                fence_char = fm.group(1)[0]
                fence_len = len(fm.group(1))
                info = fm.group(2).strip().split()
                lang = info[0].lower() if info else ""
                keep_body = bool(prose_fence_set) and lang in prose_fence_set
                out.append(" " * len(no_cr) + cr)
                continue
            out.append(raw_line)
        else:
            close_pat = rf"^[ \t]*{re.escape(fence_char)}{{{fence_len},}}[ \t]*$"
            if re.match(close_pat, trimmed):
                fence_char = None
                fence_len = 0
                keep_body = False
                out.append(" " * len(no_cr) + cr)
            elif keep_body:
                out.append(raw_line)
            else:
                out.append(" " * len(no_cr) + cr)
    return "\n".join(out)


def build_zones(raw_text: str, modality: str, options: dict[str, Any] | None = None) -> dict[str, str]:
    opts = options or {}
    norm_text = str(raw_text or "").replace("\ufeff", " ")
    raw_fences = opts.get("proseFences") or []
    prose_fence_set = {str(s or "").strip().lower() for s in raw_fences if str(s or "").strip()}
    mask_blockquotes = opts.get("maskBlockquotes", True) is not False

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
        prose = _mask_markdown_fences(prose, prose_fence_set)
        prose = re.sub(r"`[^`\n]+`", _preserve_lines_blank, prose)
        prose = re.sub(r"~~[^~\n]+~~", _preserve_lines_blank, prose)
        if mask_blockquotes:
            prose = re.sub(r"^[ \t]*>.*$", _preserve_lines_blank, prose, flags=re.M)
        else:
            prose = re.sub(r"^[ \t]*(?:>[ \t]?)+", _preserve_lines_blank, prose, flags=re.M)
        prose = re.sub(r"\]\([^)\n]+\)", lambda m: "](" + re.sub(r"[^\r\n]", " ", m.group(0)[2:]), prose)
    prose_logical: str | None = None
    prose_map: tuple[list[int], list[int]] | None = None
    if modality in {"html", "jsx", "svg"}:
        def _blank_tag_or_break(m: re.Match[str]) -> str:
            tag = m.group(0)
            if _HTML_BLOCK_BREAK_TAG_RE.match(tag) and len(tag) >= 1:
                return re.sub(r"[^\r\n]", " ", tag[:-1]) + "\n"
            return _preserve_lines_blank(m)

        prose = re.sub(r"<[^>]+>", _blank_tag_or_break, prose)
        decoded = _decode_html_with_offset_map(prose)
        if decoded is not None:
            dec_text, dec_starts, dec_ends = decoded
            prose_logical = re.sub(r"https?://[^\s)>\"'`]+", _preserve_lines_blank, dec_text)
            prose_map = (dec_starts, dec_ends)
        prose = _decode_html_entities_preserving_length(prose)

    prose = re.sub(r"https?://[^\s)>\"'`]+", _preserve_lines_blank, prose)
    if modality in {"html", "jsx", "svg"}:
        ui_text = re.sub(r"<[^>]+>", _preserve_lines_blank, ui_text)
        ui_text = _decode_html_entities_preserving_length(ui_text)

    return {"raw": raw, "prose": prose, "proseLogical": prose_logical, "proseMap": prose_map, "ui-text": ui_text}


_DELETE_STRATEGY_IDS = {
    "chatbot-artifact",
    "markdown-leak",
    "ui-prompt-echo-badge",
    "ui-dead-control",
    "throat-clearing-opener",
    "closing-platitude",
}

_NEED_SOURCE_STRATEGY_IDS = {
    "unfilled-placeholder",
    "unsourced-attribution",
    "unsourced-statistic",
    "reg-unsubstantiated-superlative",
    "reg-unqualified-guarantee",
}


def derive_fix_strategy(rule: dict[str, Any] | None) -> str:
    if isinstance(rule, dict) and rule.get("fixStrategy"):
        return str(rule["fixStrategy"])
    rid = str((rule or {}).get("id") or (rule or {}).get("ruleId") or "").strip()
    fam = str((rule or {}).get("family") or "").strip()
    if rid in _DELETE_STRATEGY_IDS or fam == "hygiene/chat-residue":
        return "delete"
    if rid in _NEED_SOURCE_STRATEGY_IDS or fam.startswith("evidence/") or fam.startswith("hygiene/placeholder"):
        return "need-source"
    if (
        rid.startswith(("ui-", "slide-", "pdf-", "img-", "docx-"))
        or fam.startswith("design/")
        or fam.startswith("visual/")
    ):
        return "unwrap-layout"
    return "rephrase"


_HIGH_CONF_PROBES = {
    "office-markdown-leak",
    "ui-dead-control",
    "slide-word-wall",
    "slide-bullet-overload",
    "slide-autofit-shrink",
    "zh-halfwidth-punctuation",
}
_HIGH_CONF_RULES = {"unfilled-placeholder", "chatbot-artifact", "local-custom-forbid"}
_LOW_CONF_RULES = {"pocket-stealth-vapor", "low-burstiness-vapor"}
_DELETE_KIND_RULES = {
    "en-throat-clearing-opener",
    "zh-bureaucratic-padding",
    "zh-essay-moralizing-ending",
    "en-essay-moralizing-ending",
    "chatbot-artifact",
}
_RESTRUCTURE_PROBES = {
    "staccato-run",
    "bold-lead-list-wall",
    "semicolon-tricolon",
    "rhetorical-qa-cadence",
    "comma-chain-runon",
    "narrative-sandwich-frame",
    "template-skeleton-echo",
    "low-burstiness-vapor",
    "slide-word-wall",
    "slide-bullet-overload",
    "slide-autofit-shrink",
    "pptx-layout-monotony",
    "ui-box-in-box",
    "ui-pill-soup",
    "ui-dead-control",
}
_DOCUMENT_SCOPE_PROBES = {"template-skeleton-echo", "low-burstiness-vapor", "em-dash-density"}
_DOCUMENT_SCOPE_RULES = {
    "pptx-layout-monotony",
    "low-burstiness-vapor",
    "template-skeleton-echo",
    "excessive-em-dash-density",
}
_PARAGRAPH_SCOPE_PROBES = {"bold-lead-list-wall", "narrative-sandwich-frame", "staccato-run"}
_SPAN_SCOPE_RULES = {
    "unfilled-placeholder",
    "local-custom-forbid",
    "zh-halfwidth-punctuation",
    "en-cliche-lexicon",
    "reg-unsubstantiated-superlative",
}


def compute_finding_confidence(
    *,
    rule_id: str,
    tier: str = "taste",
    severity: str = "warning",
    probe: str = "",
    register_adjusted: bool = False,
) -> str:
    if tier == "invariant" or probe in _HIGH_CONF_PROBES or rule_id in _HIGH_CONF_RULES:
        return "high"
    if severity == "info" or rule_id in _LOW_CONF_RULES or register_adjusted:
        return "low"
    return "medium"


def build_finding_revision(
    *,
    rule_id: str = "",
    tier: str = "taste",
    family: str = "",
    probe: str = "",
    modality: str = "markdown",
    message: dict[str, Any] | None = None,
    deletion_test: dict[str, Any] | None = None,
    sentence: str = "",
    revision_kind: str | None = None,
    revision_scope: str | None = None,
    revision_avoid: dict[str, Any] | None = None,
    fix_strategy: str | None = None,
) -> dict[str, Any]:
    kind = revision_kind or "rewrite"
    if not revision_kind:
        if rule_id in _DELETE_KIND_RULES:
            kind = "delete"
        elif (
            probe in _RESTRUCTURE_PROBES
            or rule_id == "pocket-stealth-vapor"
            or str(family).startswith(("layout/", "ui/", "statistics/"))
        ):
            kind = "restructure"

    scope = revision_scope or "sentence"
    if not revision_scope:
        if probe in _DOCUMENT_SCOPE_PROBES or rule_id in _DOCUMENT_SCOPE_RULES:
            scope = "document"
        elif modality in {"html", "jsx", "css", "svg", "pptx", "docx"} and (
            str(probe).startswith(("ui-", "slide-"))
            or probe in {"office-markdown-leak", "pptx-layout-monotony"}
            or rule_id in {"ui-prompt-echo-badge", "markdown-leak"}
        ):
            scope = "element"
        elif rule_id == "pocket-stealth-vapor" or probe in _PARAGRAPH_SCOPE_PROBES:
            scope = "paragraph"
        elif rule_id in _SPAN_SCOPE_RULES:
            scope = "span"

    eff_strategy = fix_strategy or derive_fix_strategy({"id": rule_id, "family": family})
    repair_tier = "guarded-fix"
    if eff_strategy == "need-source" or kind == "ask" or probe in _DOCUMENT_SCOPE_PROBES or rule_id in _DOCUMENT_SCOPE_RULES:
        repair_tier = "diagnostic-only"
    elif tier == "invariant" and (eff_strategy == "delete" or rule_id == "markdown-leak"):
        repair_tier = "safe-fix"
    do_not_auto_edit = repair_tier == "diagnostic-only"

    instr_src = deletion_test or message or {}
    msg = message or {}
    instruction = {
        "en": str(instr_src.get("en") or msg.get("en") or ""),
        "zh": str(instr_src.get("zh") or msg.get("zh") or instr_src.get("en") or msg.get("en") or ""),
    }

    keep: list[str] = []
    if sentence and modality != "css":
        seen: set[str] = set()
        for fact in extract_protected_facts(sentence, modality=modality, keep_mode=True):
            r = str(fact.get("raw") or "").strip()
            if not r or r in seen:
                continue
            seen.add(r)
            keep.append(r)
            if len(keep) >= 20:
                break

    if revision_avoid and (revision_avoid.get("en") or revision_avoid.get("zh")):
        avoid = {
            "en": str(revision_avoid.get("en") or revision_avoid.get("zh") or ""),
            "zh": str(revision_avoid.get("zh") or revision_avoid.get("en") or ""),
        }
    elif probe == "negation-pivot" or "negation-pivot" in str(rule_id):
        avoid = {
            "en": "Do not trade one 'Not X, but Y' slogan for a shorter aphorism or staccato tagline.",
            "zh": "不要把“不是 A，而是 B”的套话置换成另一句短金句或断句口号。",
        }
    elif kind == "delete":
        avoid = {
            "en": "Do not rephrase the filler wrapper; delete it while keeping every concrete number, date, and name in the sentence.",
            "zh": "不要把废话外壳换个说法留着，直接删掉并完整保留句中的数字、时间和实体名。",
        }
    elif kind == "restructure":
        avoid = {
            "en": "Do not compress away concrete facts or invent new numbers while fixing cadence or layout.",
            "zh": "调整结构与节奏时不要删掉具体事实，也不要凭空编造原文没有的数字。",
        }
    else:
        avoid = {
            "en": "Do not invent unstated numbers, alter inequality bounds, or swap in another cliche phrase.",
            "zh": "改写时不要编造未给出的指标、更改数值边界，或换成另一种高频套话。",
        }

    return {
        "kind": kind,
        "scope": scope,
        "repairTier": repair_tier,
        "doNotAutoEdit": do_not_auto_edit,
        "instruction": instruction,
        "keep": keep,
        "mustPreserve": keep,
        "avoid": avoid,
    }


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
    keep_sentence: str | None = None,
    register_adjusted: bool = False,
) -> dict[str, Any]:
    norm_match = re.sub(r"^[\s\ufeff]+|[\s\ufeff]+$", "", match.lower())
    norm_sent = re.sub(r"[\s\ufeff]+", " ", (sentence or norm_match).lower()).strip()
    fp = rule['id'] + ':' + fnv1a_hex(f"{rule['id']}|{norm_match}|{norm_sent}")
    tier = rule.get("tier", "taste")
    severity = rule.get("severity", "warning")
    family = rule.get("family", "general")
    probe = rule.get("probe", "")
    fix_strategy = derive_fix_strategy(rule)
    confidence = compute_finding_confidence(
        rule_id=rule["id"],
        tier=tier,
        severity=severity,
        probe=probe,
        register_adjusted=register_adjusted,
    )
    revision = build_finding_revision(
        rule_id=rule["id"],
        tier=tier,
        family=family,
        probe=probe,
        modality=modality,
        message=rule["message"],
        deletion_test=rule.get("deletionTest"),
        sentence=keep_sentence if keep_sentence is not None else sentence,
        revision_kind=rule.get("revisionKind"),
        revision_scope=rule.get("revisionScope"),
        revision_avoid=rule.get("revisionAvoid"),
        fix_strategy=fix_strategy,
    )
    return {
        "fingerprint": fp,
        "ruleId": rule["id"],
        "tier": tier,
        "severity": severity,
        "confidence": confidence,
        "fixStrategy": fix_strategy,
        "family": family,
        "file": filename,
        "modality": modality,
        "location": location,
        "line": line,
        "col": col,
        "span": span,
        "match": match,
        "message": rule["message"],
        "deletionTest": rule.get("deletionTest"),
        "revision": revision,
        "exemplar": rule.get("exemplar"),
    }


# ---------- Probes ----------

def _probe_negation_pivot(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []

    def check_concrete_zh(clause_a: str, clause_b: str, raw_slice: str) -> bool:
        return (
            (bool(re.search(r"\d", clause_a)) and bool(re.search(r"\d", clause_b)))
            or "`" in raw_slice
            or bool(re.search(r"\.[a-z]{2,4}\b", raw_slice, re.I))
            or bool(re.search(r"(?:第一次|第二次|站台|号楼|排第|星期|周[一二三四五六日天])", raw_slice))
        )

    zh_triple_re = re.compile(
        r"(?:(?:这|那|它)?(?:既)?(?:并)?不(?:是|只是|仅仅?是)|绝非|并非(?:只是)?)([^，。！？；\n]{1,22})[，,；—]+\s*也(?:并)?不(?:是|只是|仅仅?是)([^，。！？；\n]{1,22})[，,；—]+\s*(?:而是|更是)([^。！？；\n]{1,28})"
    )
    zh_re = re.compile(
        r"(?:(?:这|那|它)?(?:(?:并)?不(?:是|只是|仅仅?是|仅(?:让|使|能|可以|在于|停留在)|在(?:于)?|搞|做|靠)|绝非|并非(?:只是)?)|与其说是?)([^，。！？；\n]{1,22})[，,；—]+\s*(?:而(?:是在(?:于)?|是|靠)|更(?:是|能|在于|让|使)|不如说是?)([^。！？；\n]{1,28})"
    )
    zh_rhet_head = re.compile(r"^(?:(?:这|那|它)|绝非|并非|与其|并?不(?:只是|仅仅?是|仅(?:让|使|能|可以|在于|停留在)|在(?:于)?|搞|做|靠))")
    zh_factual_cause = re.compile(r"(?:报错|故障|原因|超时|磁盘|内存|耗尽|端口|进程|导致|因为|[A-Za-z_][A-Za-z0-9_-]{2,})")
    covered_spans: list[tuple[int, int]] = []

    for m in zh_triple_re.finditer(prose_text):
        ca, cb, cc = (m.group(1) or "").strip(), (m.group(2) or "").strip(), (m.group(3) or "").strip()
        raw_slice = raw_text[m.start() : m.end()]
        if check_concrete_zh(ca + cb, cc, raw_slice) or len(cc) > 26 or not ca or not cb or not cc:
            continue
        covered_spans.append((m.start(), m.end()))
        hits.append({"index": m.start(), "length": m.end() - m.start()})

    for m in zh_re.finditer(prose_text):
        if any(s <= m.start() < e for s, e in covered_spans):
            continue
        clause_a, clause_b = (m.group(1) or "").strip(), (m.group(2) or "").strip()
        raw_slice = raw_text[m.start() : m.end()]
        context_before = raw_text[max(0, m.start() - 12) : m.start()]
        if check_concrete_zh(clause_a, clause_b, raw_slice) or len(clause_b) > 26 or not clause_a or not clause_b:
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


def _probe_staccato_run(prose_text: str, raw_text: str = "") -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for pm in re.finditer(r"[^\n]+(?:\n(?!\s*\n)[^\n]+)*", prose_text):
        raw_para = pm.group(0)
        para = re.sub(
            r"!\[[^\]]*\](?:\([ \t]*|\[[^\]]*\])?",
            lambda m: re.sub(r"[^\r\n]", " ", m.group(0)),
            raw_para,
        )
        trimmed = para.strip()
        if not trimmed or re.match(r"^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)", trimmed):
            continue
        sentences: list[dict[str, Any]] = []
        i = 0
        n = len(para)
        while i < n:
            while i < n and para[i] in " \t\r\n\u00a0\u3000":
                i += 1
            if i >= n:
                break
            seg_start = i
            while i < n and para[i] != "\n" and not (is_sentence_break_at(para, i) and para[i] != "\n"):
                i += 1
            if i >= n or para[i] == "\n":
                sentences.append({"start": pm.start() + seg_start, "end": pm.start() + i, "isShort": False})
                if i < n and para[i] == "\n":
                    i += 1
                continue
            while i < n and para[i] in ".!?。！？":
                i += 1
            s = para[seg_start:i].strip()
            body = re.sub(r"[.!?。！？]+$", "", s).strip()
            if body:
                cjk = len(re.findall(r"[\u4e00-\u9fff]", body))
                en_words = len([w for w in body.split() if re.search(r"[A-Za-z0-9]", w)])
                is_short = (
                    2 <= cjk <= 6 and en_words <= 1 and not re.search(r"[，,：:；;]", body)
                ) or (cjk == 0 and 2 <= en_words <= 4 and not re.search(r"[,:;]", body))
                lead_offset = para[seg_start:i].find(s)
                start = pm.start() + seg_start + max(0, lead_offset)
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


_ZH_TRIAD_SLOGAN_ROOTS = re.compile(
    r"(?:高效|精准|全面|智能|可靠|协同|赋能|闭环|引领|抓手|稳健|灵活|深度|多元|生态|敏捷|极致|易用|统筹|兼顾|推进|提质|增效|创新|优质|卓越|无缝|安全|稳定|科学|规范|统一|便捷|智慧|领先|透明|可控|弹性|全方位|立体)"
)


def _probe_zh_four_char_triad(prose_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    entity_suffix = re.compile(
        r"(?:大学|学院|学校|公司|集团|银行|医院|中心|委员|政府|部门|机场|车站|高速|铁路|[省市区县镇乡]|编号|日期|时间|记录|清单|台账|出处|明细|汇总|报表|状态|字段|开关|配置|步骤|检查|规则|目录|路径|文档|手册|模板|脚本|接口|模块|节点|日志|指标|参数|列表|表格|工作表|表|拓扑|矩阵|样例|资产|结果|组合|读取|创建|输入|输出|去重|占用|冲回)$"
    )
    broken_slice = re.compile(r"[的了在或与及把被]")
    pat = re.compile(
        r"(?:^|[，。！？；：、“‘（\s]|(?:实现|具备|坚持|保持|做到|形成|打造|追求|提供|确保|了|是|的|以|向|为))"
        r"([\u4e00-\u9fff]{4})[、，,·・]\s*([\u4e00-\u9fff]{4})[、，,·・]\s*([\u4e00-\u9fff]{4})"
        r"(?=$|[，。！？；：、”’）\s·・]|[的地等])"
    )
    for m in pat.finditer(prose_text):
        items = [m.group(1), m.group(2), m.group(3)]
        if any(entity_suffix.search(w) or broken_slice.search(w) for w in items):
            continue
        start_offset = m.start(1)
        end_offset = m.end()
        if start_offset > 0 and prose_text[start_offset - 1] == "《":
            continue
        before = prose_text[max(0, start_offset - 24) : start_offset]
        after = prose_text[end_offset : min(len(prose_text), end_offset + 24)]
        if re.search(r"[\u4e00-\u9fff]{4}\s*[、，,·・]\s*$", before) or re.match(r"^\s*[、，,·・]\s*[\u4e00-\u9fff]{4}", after):
            continue
        if re.search(r"(?:包括|包含|涵盖|设有|分为|列出|涉及|字段为|表名为|包含如下)[：:]?\s*$", before) and re.match(r"^\s*等", after):
            continue
        slogan_matches = sum(1 for w in items if _ZH_TRIAD_SLOGAN_ROOTS.search(w))
        if slogan_matches < 2:
            continue
        hits.append({"index": start_offset, "length": end_offset - start_offset})
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
        has_internal_ref = bool(
            re.search(r"^(?:研究|数据)", m.group(0))
            and re.search(
                r"(?:后台|明细|监控|日志|统计|系统|看板|报表|实测|压测|采样|实验|账单|订单|运营|客服|审计|财务|清单|台账|埋点|数据库|线上|本地|本次|本季度|本期|近\d+[天周月年]|Q[1-4]|20\d{2})\S{0,8}(?:研究|数据)$",
                prose_text[max(0, m.start() - 28) : m.start() + 2],
                re.I,
            )
            and re.search(r"\d", prose_text[m.start() : min(len(prose_text), m.start() + 80)])
        )
        if not has_source and not has_internal_ref:
            hits.append({"index": m.start(), "length": m.end() - m.start()})
    return hits


def _probe_bold_lead_list_wall(prose_text: str, raw_text: str, min_run: int = 4) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    raw_lines = str(raw_text or "").split("\n")
    offset = 0
    run_start = 0
    run_end = 0
    run_count = 0

    for i in range(len(raw_lines) + 1):
        raw_line = raw_lines[i] if i < len(raw_lines) else ""
        line = raw_line[:-1] if raw_line.endswith("\r") else raw_line
        prose_line = prose_text[offset : offset + len(line)] if i < len(raw_lines) else ""
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
        elif i == len(raw_lines) or line.strip():
            if run_count >= min_run:
                hits.append({"index": run_start, "length": run_end - run_start})
            run_count = 0
        offset += len(raw_line) + 1
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
    "leverages", "leverage", "leveraging", "seamless", "seamlessly", "streamline", "streamlines",
    "foster", "fostering", "robust", "empowers", "empower", "stakeholders",
    "navigate", "comprehensive", "harnesses", "harness", "elevate", "pivotal",
    "transformative", "transformative outcomes", "pivotal alignment", "transparent alignment",
    "resilience", "synergy", "holistic", "ecosystem", "actionable", "unparalleled",
    "effortless", "effortlessly", "blazing-fast", "blazing fast", "lightning-fast", "lightning fast",
    "supercharge", "supercharges", "cutting-edge", "next-gen", "next-generation",
]


def _normalize_en_marker_stem(term: str) -> str:
    norm = re.sub(r"\s+", "-", str(term or "").lower())
    if norm == "next-generation":
        return "next-gen"
    if norm.endswith("lessly"):
        return norm[:-2]
    if norm.endswith("less"):
        return norm
    return re.sub(r"(?:ing|es|s)$", "", norm)

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


def strip_parentheticals(text: str) -> str:
    out: list[str] = []
    depth = 0
    for ch in text:
        if ch in "(（":
            depth += 1
            out.append(" ")
        elif ch in ")）" and depth > 0:
            depth -= 1
            out.append(" ")
        elif depth > 0 and ch not in "\n\r":
            out.append(" ")
        else:
            out.append(ch)
    return "".join(out)


def _count_concreteness_anchors(raw_slice: str) -> int:
    s = re.sub(r"<!--[\s\S]*?-->", " ", str(raw_slice or ""))
    count = 0
    count += len(re.findall(r"(?<![A-Za-z0-9_])\d+(?:[.,:]\d+)?%?(?![A-Za-z0-9_])", s))
    count += len(re.findall(r"(?<![A-Za-z0-9_])[A-Z]{1,4}-?\d{1,3}(?![A-Za-z0-9_])", s))
    count += len(re.findall(r"`[^`\n]+`", s))
    count += len(re.findall(r"[/\\][A-Za-z0-9._-]+\.[a-z]{1,5}(?![A-Za-z0-9_])", s, re.I))
    count += len(re.findall(r"(?<![A-Za-z0-9_])(?:PR\s*#?\d+|v\d+\.\d+|HTTP\s*\d{3}|UTC|Q[1-4])(?![A-Za-z0-9_])", s))
    count += len(
        re.findall(
            r"(?:[一二三四五六七八九十两百千万]+[天月年次个张条座块斤米秒分时人颗枚格炉瓶对]|周[一二三四五六日天]|昨天|昨晚|今早|上周|下周|去年|前年|清晨|傍晚|凌晨|午后|十月|十一月|十二月)",
            s,
        )
    )
    count += len(re.findall(r"《[^》\n]{1,32}》", s))
    count += len(re.findall(r'[「『“"][\u4e00-\u9fffA-Za-z0-9_/-]{1,16}[」』”"]', s))
    count += len(re.findall(r"(?:点击|打开|勾选|切换|输入|选择|保存|导出|上传|下载|复制|粘贴|刷新|重启|执行|登录|填写|核对)", s))
    return count


def _is_structured_line(trimmed_line: str) -> bool:
    return bool(re.match(r"^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)", trimmed_line))


def _extract_structured_prose_blocks(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    pos = 0
    n = len(prose_text)
    while pos <= n:
        nl = prose_text.find("\n", pos)
        line_end = n if nl == -1 else nl
        line_prose = prose_text[pos:line_end]
        line_raw = raw_text[pos:line_end]
        lm = re.match(r"^(\s*(?:[-*+]|\d+[.)])\s+)(.+)$", line_prose)
        if lm:
            body_start = pos + len(lm.group(1))
            body_text = lm.group(2)
            trimmed = body_text.strip()
            cjk = len(re.findall(r"[\u4e00-\u9fff]", trimmed))
            en = len([w for w in trimmed.split() if re.search(r"[A-Za-z0-9]", w)])
            if cjk >= 24 or en >= 15:
                items.append(
                    {
                        "start": body_start + max(0, body_text.find(trimmed)),
                        "end": line_end,
                        "base": body_start,
                        "text": body_text,
                        "trimmed": trimmed,
                        "rawSlice": raw_text[body_start:line_end],
                        "isListItem": True,
                        "isTableCell": False,
                    }
                )
        elif re.match(r"^\s*\|", line_raw) and not re.match(r"^\s*\|[\s:|-]+\|?\s*$", line_raw):
            cell_pos = 0
            while cell_pos < len(line_prose):
                pipe_idx = line_prose.find("|", cell_pos)
                if pipe_idx == -1:
                    break
                next_pipe = line_prose.find("|", pipe_idx + 1)
                if next_pipe == -1:
                    break
                cell_raw = line_prose[pipe_idx + 1 : next_pipe]
                trimmed = cell_raw.strip()
                cjk = len(re.findall(r"[\u4e00-\u9fff]", trimmed))
                en = len([w for w in trimmed.split() if re.search(r"[A-Za-z0-9]", w)])
                if cjk >= 15 or en >= 10:
                    base = pos + pipe_idx + 1
                    items.append(
                        {
                            "start": base + max(0, cell_raw.find(trimmed)),
                            "end": pos + next_pipe,
                            "base": base,
                            "text": cell_raw,
                            "trimmed": trimmed,
                            "rawSlice": raw_text[base : pos + next_pipe],
                            "isListItem": False,
                            "isTableCell": True,
                        }
                    )
                cell_pos = next_pipe
        if nl == -1:
            break
        pos = nl + 1
    return items


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
    """Linear O(n) sentence scanner with exact offsets and decimal/version protection."""
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
        while i < n and text[i] != "\n" and not (is_sentence_break_at(text, i) and text[i] != "\n"):
            i += 1
        while i < n and text[i] in end_punct:
            i += 1
        if text[seg_start:i].lstrip().startswith("**") and text[i : i + 2] == "**":
            i += 2
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
    blocks = [*_extract_prose_paragraphs(prose_text, raw_text), *_extract_structured_prose_blocks(prose_text, raw_text)]
    for para in blocks:
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
                stem = _normalize_en_marker_stem(term)
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


def _has_isomorphic_clause_head(clauses: list[str]) -> bool:
    lead_verbs = re.compile(r"^(?:把|将|通过|让|使|对|按|负责|支持|提供|确保|实现|帮助|提升|优化|构建|打造)")
    keys: list[str] = []
    for cl in clauses:
        t = re.sub(r'^[\s*"“「『(（]+', "", cl.strip())
        if not t:
            continue
        vm = lead_verbs.match(t)
        if vm:
            keys.append(f"zhv:{vm.group(0)}")
            continue
        zhm = re.match(r"^[\u4e00-\u9fff]{2}", t)
        if zhm:
            keys.append(f"zh2:{zhm.group(0)}")
            continue
        enm = re.match(r"^([A-Za-z]{2,})", t)
        if enm:
            keys.append(f"en:{enm.group(1).lower()}")
    counts: dict[str, int] = {}
    for k in keys:
        counts[k] = counts.get(k, 0) + 1
        if counts[k] >= 2:
            return True
    return False


def _probe_semicolon_tricolon(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    legal_guard = re.compile(
        r"(?<![A-Za-z0-9_])(?:shall|must|hereby|pursuant\s+to|provided\s+that)(?![A-Za-z0-9_])|(?:应当|须于|不得|依照)",
        re.I,
    )
    checklist_lead_re = re.compile(
        r"^\s*(?:\d+[.)、）]|[（(]\d+[)）]|第[一二三四五六七八九十\d]+[步项条点]|先|随后|接着|然后|最后|若|如果|当|检查\s*\d|步骤\s*\d|step\s*\d|first\b|then\b|finally\b)",
        re.I,
    )
    blocks = [
        *_extract_prose_paragraphs(prose_text, raw_text),
        *[b for b in _extract_structured_prose_blocks(prose_text, raw_text) if b["isListItem"]],
    ]
    for para in blocks:
        masked = para["text"]
        masked = re.sub(r"&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]{1,24});", lambda m: " " * len(m.group(0)), masked)
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
            tech_refs = len(re.findall(r"`[^`\n]+`|\]\([^)\n]+\)|<code\b[^>]*>[\s\S]*?</code>", raw_sent, re.I))
            if tech_refs >= 2:
                continue
            clauses = [c.strip() for c in re.split(r"[;；]", s["text"]) if c.strip()]
            if len(clauses) < 3:
                continue
            checklist_count = sum(1 for c in clauses if checklist_lead_re.match(c))
            if checklist_count >= 2:
                continue
            if clauses[0].startswith("先") and any(re.match(r"^(?:再|随后|接着|然后|最后)", c) for c in clauses[1:]):
                continue
            lens = [max(10, _count_text_units_tenths(c)) for c in clauses]
            mean = sum(lens) / len(lens)
            variance = sum((x - mean) ** 2 for x in lens) / len(lens)
            cv = math.sqrt(variance) / mean if mean > 0 else 1.0
            iso = _has_isomorphic_clause_head(clauses)
            if not iso and re.search(r"(?:依赖|共用|失联|期间|否则|除非|仅在|禁止|不新写|不写入|不触发|幂等|持久化)", s["text"]):
                continue
            if cv < 0.28 or (cv < 0.40 and iso):
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
    blocks = [
        *_extract_prose_paragraphs(prose_text, raw_text),
        *[b for b in _extract_structured_prose_blocks(prose_text, raw_text) if b["isListItem"]],
    ]
    for para in blocks:
        for s in _split_prose_sentences_with_offsets(para):
            if para.get("isListItem") and re.search(r"`[^`\n]+`", raw_text[s["start"] : s["end"]]):
                continue
            cleaned = strip_parentheticals(re.sub(r"(\d),(\d{3})(?!\d)", r"\1\2", s["text"]))
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
    if (
        re.match(r"^[A-Za-z][A-Za-z0-9 _-]{1,28}:\s", s)
        or re.match(r"^[\u4e00-\u9fff]{2,8}：", s)
        or re.match(r"^[\u4e00-\u9fffA-Za-z0-9_-]{2,10}\s*0?\d+(?:\s|$|[·：:.-])", s)
    ):
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
        para_items = [{"start": p["start"], "text": p["trimmed"]} for p in paras]
        if len(para_items) <= 5:
            if check_items(para_items, False, False):
                return hits
        else:
            for w in range(len(para_items) - 4):
                if check_items(para_items[w : w + 5], False, False):
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


_ZH_AI_SLOP_JARGON_TERMS = [
    "全闭环", "形成闭环", "商业闭环", "深度赋能", "全面赋能", "价值跃迁", "范式跃迁", "范式转移",
    "底层逻辑", "顶层设计", "多维协同", "生态共赢", "无缝衔接", "无缝融合", "丝滑", "满血",
    "降维打击", "一剑封喉", "一步到位", "心智占领", "颗粒度对齐", "铁律", "彻底根治",
    "重塑格局", "破局", "降本增效", "护城河", "天花板", "深水区", "王炸", "硬核",
    "暴雷", "翻车", "崩塌", "雕花", "破框", "无缝", "跃迁",
]
_ZH_INDUSTRY_AMBIGUOUS_TERMS = [
    "闭环", "收口", "兜底", "打通", "落盘", "拉齐", "死线", "根治",
]
_ZH_DEV_ZERO_RE = re.compile(r"零(?:幻觉|侵入|摩擦|失误|死角|妥协|门槛|负担|缺陷|暴雷|翻车)")
_ZH_DEV_HUA_RE = re.compile(r"(?:体系|精细|常态|全链路|数智|智能|生态|矩阵|范式|极致|平台|中台)化")


_ZH_DEV_STORAGE_RE = re.compile(r"WAL|fsync|快照|持久化|落盘到\s*[A-Za-z0-9_./-]+|写入(?:磁盘|日志|文件)|事务日志", re.I)
_ZH_DEV_HARDWARE_CTRL_RE = re.compile(r"(?:位置|速度|电流|力矩|伺服|PID|反馈|外环|内环)闭环|编码器|控制柜")
_ZH_DEV_GROUNDED_FILE_RE = re.compile(r"`[^`\n]+`|[A-Za-z0-9_/-]+\.(?:py|js|ts|mjs|go|rs|sql|json|yaml|yml|log|md)\b", re.I | re.ASCII)


def _probe_zh_dev_jargon(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    blocks = [
        *_extract_prose_paragraphs(prose_text, raw_text),
        *[b for b in _extract_structured_prose_blocks(prose_text, raw_text) if b["isTableCell"]],
    ]
    for para in blocks:
        ai_slop_hits: dict[str, tuple[int, int]] = {}
        industry_hits: dict[str, tuple[int, int]] = {}
        base = para["base"]
        ctx_slice = para.get("rawSlice") or para["text"]
        is_storage_ctx = bool(_ZH_DEV_STORAGE_RE.search(ctx_slice))
        is_hw_ctrl = bool(_ZH_DEV_HARDWARE_CTRL_RE.search(ctx_slice))

        for term in _ZH_AI_SLOP_JARGON_TERMS:
            idx = para["text"].find(term)
            if idx != -1 and term not in ai_slop_hits:
                ai_slop_hits[term] = (base + idx, base + idx + len(term))
        for m in _ZH_DEV_ZERO_RE.finditer(para["text"]):
            key = m.group(0)
            if key not in ai_slop_hits:
                ai_slop_hits[key] = (base + m.start(), base + m.end())
        for m in _ZH_DEV_HUA_RE.finditer(para["text"]):
            key = m.group(0)
            if key not in ai_slop_hits:
                ai_slop_hits[key] = (base + m.start(), base + m.end())

        for term in _ZH_INDUSTRY_AMBIGUOUS_TERMS:
            if term == "落盘" and is_storage_ctx:
                continue
            if term == "闭环" and is_hw_ctrl:
                continue
            if any(term in ai_key for ai_key in ai_slop_hits):
                continue
            idx = para["text"].find(term)
            if idx != -1 and term not in industry_hits:
                industry_hits[term] = (base + idx, base + idx + len(term))

        grounded_domain = (
            _count_concreteness_anchors(ctx_slice) >= 2
            or bool(_ZH_DEV_GROUNDED_FILE_RE.search(ctx_slice))
        )
        active_spans: list[tuple[int, int]] | None = None
        if grounded_domain:
            if len(ai_slop_hits) >= 3:
                active_spans = list(ai_slop_hits.values())
        elif len(ai_slop_hits) >= 1 and (len(ai_slop_hits) + len(industry_hits)) >= 3:
            active_spans = [*ai_slop_hits.values(), *industry_hits.values()]

        if active_spans:
            active_spans.sort(key=lambda x: x[0])
            first = active_spans[0][0]
            last = active_spans[-1][1]
            hits.append({"index": first, "length": min(140, max(1, last - first))})
    return hits


_ZH_EXCLAMATION_HYPE_RE = re.compile(r"(?:太棒了|千万不要|一定要|震撼|重磅|惊艳|必看|立即开启|彻底告别|强力推荐|绝对不能|不可错过)")


def _probe_zh_exclamation(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    all_marks: list[dict[str, Any]] = []
    hype_hits: list[dict[str, Any]] = []
    for para in _extract_prose_paragraphs(prose_text, raw_text):
        trim_p = para["trimmed"]
        para_cjk = len(re.findall(r"[\u4e00-\u9fff]", trim_p))
        if para_cjk < 20:
            continue
        if re.match(r"^(?:示例|例句|提示词|prompt)(?:[\s:：]|$)", trim_p, re.I):
            continue
        masked = re.sub(r"“[^”\n]*”", lambda m: " " * len(m.group(0)), para["text"])
        masked = re.sub(r"「[^」\n]*」", lambda m: " " * len(m.group(0)), masked)
        masked = re.sub(r'"[^"\n]*"', lambda m: " " * len(m.group(0)), masked)
        masked = strip_parentheticals(masked)
        masked_para = {**para, "text": masked}
        for s in _split_prose_sentences_with_offsets(masked_para):
            for m in re.finditer(r"[\u4e00-\u9fff][！!]", s["text"]):
                hit = {"index": s["start"] + m.start(), "length": m.end() - m.start()}
                all_marks.append(hit)
                if _ZH_EXCLAMATION_HYPE_RE.search(s["text"]):
                    hype_hits.append(hit)
    if len(all_marks) >= 2:
        return all_marks
    return hype_hits


def _probe_zh_mega_sentence(prose_text: str, raw_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for para in _extract_prose_paragraphs(prose_text, raw_text):
        para_cjk = len(re.findall(r"[\u4e00-\u9fff]", para["text"]))
        para_semis = len(re.findall(r"[;；]", para["text"]))
        sent_hit = False
        for s in _split_prose_sentences_with_offsets(para):
            s_cjk = len(re.findall(r"[\u4e00-\u9fff]", s["text"]))
            visible_compacted = re.sub(r"[ \t]{2,}", " ", s["text"]).strip()
            if s_cjk > 180 or (s_cjk >= 120 and len(visible_compacted) > 180):
                hits.append({"index": s["start"], "length": min(140, len(s["text"]))})
                sent_hit = True
        if not sent_hit and para_cjk > 600 and para_semis >= 3:
            hits.append({"index": para["start"], "length": min(140, len(para["trimmed"]))})
    return hits


_UNSOURCED_STAT_MEASUREMENT_RE = re.compile(
    r"(?:从|由)\s*\d[\d.,]*\S{0,8}(?:到|至|降到|降至|升至|压缩至|缩减至)\s*\d|\bfrom\s+\d[\d.,]*\S{0,8}\s+to\s+\d|(?<![A-Za-z0-9_])(?:n\s*=\s*\d+|benchmark|dataset|sample|audit|log|metric|F1|FPR|Recall|Precision|p95|p99|SLA|SLO|RPO|RTO|uptime|availability|contract|CPU|RAM|memory|disk|coverage|confidence|threshold|CI|eval)(?![A-Za-z0-9_])|(?:实测|压测|基准|抽样|样本|日志|监控|报表|账单|测试集|留出集|置信|阈值|覆盖率|分位|召回|误报|命中|耗时|延迟|错误率|成功率|一致率|配额|折扣|比例|占比|权重|可用率|可用性|增长率|合同|协议|条款)",
    re.I | re.ASCII,
)

_UNSOURCED_STAT_DIRECTIVE_RE = re.compile(
    r"^\s*(?:Set|Configure|Keep|Ensure|Allow|Leave|Pass|Use|Pick|Select|Adjust|Limit|Clamp|Require|设置|保持|确保|调整|限制|允许|预留)\b|(?:must|should|need\s+to)\s+be\s+(?:at\s+least|no\s+more\s+than|under|over)\b",
    re.I | re.ASCII,
)


def _probe_unsourced_statistic(
    prose_text: str,
    raw_text: str,
    prose_map: tuple[list[int], list[int]] | None = None,
) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    patterns = [
        re.compile(r"(?:高达|多达|超过|近|约|至少|足足|整整|提升(?:了)?|提高(?:了)?|降低(?:了)?|减少(?:了)?|节省(?:了)?|缩短(?:了)?|增长(?:了)?|暴涨(?:了)?)\s*\d+(?:\.\d+)?%", re.ASCII),
        re.compile(r"\b(?:up\s+to|over|nearly|more\s+than|at\s+least|as\s+much\s+as|by)\s+\d+(?:\.\d+)?%", re.I | re.ASCII),
    ]
    breaks = _build_sentence_break_indices(prose_text)
    for pat in patterns:
        for m in pat.finditer(prose_text):
            left = 0
            right = len(prose_text)
            pos_l = bisect.bisect_left(breaks, m.start())
            if pos_l > 0:
                left = breaks[pos_l - 1] + 1
            pos_r = bisect.bisect_left(breaks, m.end())
            if pos_r < len(breaks):
                right = breaks[pos_r] + 1
            sent_prose = prose_text[left:right]
            if _UNSOURCED_STAT_DIRECTIVE_RE.search(sent_prose) and not re.search(
                r"(?:提升|提高|降低|减少|节省|缩短|增长|暴涨|faster|improve|reduce|save)", sent_prose, re.I
            ):
                continue
            if prose_map is not None:
                starts_m, ends_m = prose_map
                raw_start = starts_m[left] if left < len(starts_m) else left
                last_idx = max(left, right - 1)
                raw_end = ends_m[last_idx] if last_idx < len(ends_m) else right
            else:
                raw_start, raw_end = left, right
            win = f"{sent_prose}\n{raw_text[raw_start:raw_end]}"
            has_source = bool(
                re.search(r"\[\^?\d+\]", win, re.ASCII)
                or re.search(r"\]\([^)]+\)", win)
                or "http://" in win
                or "https://" in win
                or re.search(r"\([^()\n]{2,40},\s*(?:19|20)\d{2}[a-z]?\)", win, re.ASCII)
                or re.search(r"《[^》\n]{2,30}》", win)
                or re.search(r"(?:见|参见|详见)\s*\[", win)
                or _UNSOURCED_STAT_MEASUREMENT_RE.search(win)
            )
            if not has_source:
                hits.append({"index": m.start(), "length": m.end() - m.start()})
    return hits


def analyze_text_profile(text: str, *, modality: str = "markdown", config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Compute an explainable 5-axis offline statistical & structural text profile."""
    raw = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    cfg = config or {}
    zones = build_zones(raw, modality, {"proseFences": cfg.get("proseFences"), "maskBlockquotes": cfg.get("maskBlockquotes")})
    prose_logical = zones.get("proseLogical")
    prose = prose_logical if prose_logical is not None else (zones.get("prose") or "")
    raw_for_probes = prose if prose_logical is not None else raw
    paras = _extract_prose_paragraphs(prose, raw_for_probes)
    struct_blocks = _extract_structured_prose_blocks(prose, raw_for_probes)
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

    total_raw_chars = len(re.sub(r"\s+", "", raw))
    scanned_chars = len(re.sub(r"\s+", "", "".join(p["trimmed"] for p in paras))) + len(
        re.sub(r"\s+", "", "".join(b["trimmed"] for b in struct_blocks))
    )
    prose_coverage = _round_non_neg(min(1.0, scanned_chars / total_raw_chars), 2) if total_raw_chars > 0 else 1.0

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
        s_semi_masked = re.sub(r"（[^）\n]*[;；][^）\n]*）", " ", re.sub(r"\([^)\n]*[;；][^)\n]*\)", " ", s["text"]))
        sc = len(re.findall(r"[;；]", s_semi_masked))
        cc_txt = strip_parentheticals(re.sub(r"(\d),(\d{3})(?!\d)", r"\1\2", s["text"]))
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
        "proseCoverage": prose_coverage,
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
            "termConsistencySafe": concreteness_status == "grounded" and cooc_hits == 0 and skel_hits == 0,
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
        static_disabled = bool(
            re.search(r"(?<![A-Za-z0-9_-])disabled(?:\s*=\s*(?:\"\"|\"disabled\"|'disabled'|\"true\"|'true'|\{true\}))?(?=[\s/>]|$)", attrs, re.I)
        )
        has_reason = bool(re.search(r"(?<![A-Za-z0-9_-])(?:title|aria-describedby|data-allow-disabled)\s*=", attrs, re.I))
        attrs_no_data_title = re.sub(r"\bdata-[a-z0-9_-]*title\s*=\s*[\"'][^\"']*[\"']", "", attrs, flags=re.I)
        is_pager_action = bool(
            re.search(
                r"(?:^|[\s_-])(?:prev|previous|next|first|last|pager|pagination|page-\d|step-\d|go\s+back|back\s+(?:page|to)|forward)(?=[\s_-]|$)|上一页|下一页|首页|末页|上一步|下一步",
                f"{attrs_no_data_title} {inner}",
                re.I,
            )
        )
        before_ctx = clean[max(0, m.start() - 220) : m.start()]
        in_pager_container = bool(
            re.search(
                r"<(?:nav|div|ul|section)\b[^>]*\b(?:aria-label\s*=\s*[\"'][^\"']*pagination|class(?:Name)?\s*=\s*[\"'][^\"']*(?:pagination|pager))",
                before_ctx,
                re.I,
            )
            and not re.search(r"</(?:nav|ul)\b", before_ctx, re.I)
        )
        if static_disabled and not has_reason and not (is_pager_action or in_pager_container):
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
            deg, s, _ = _rgb_to_hsl_norm(rgb[0], rgb[1], rgb[2])
            if 235.0 <= deg <= 345.0 and (s * 100.0) >= 45.0:
                stops += 1
        near = clean[m.start() : min(len(clean), m.end() + 120)]
        if stops >= 2 or re.search(r"background-clip\s*:\s*text", near, re.I):
            hits.append({"index": m.start(), "length": m.end() - m.start()})

    # 3. SVG <linearGradient> / <radialGradient> with >= 2 purple/indigo/pink stops
    for m in re.finditer(r"<(linearGradient|radialGradient)\b[^>]*>([\s\S]*?)</\1>", clean, re.I):
        body = m.group(2) or ""
        color_tokens = re.findall(r"#[0-9a-fA-F]{3,6}\b|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)", body, re.I)
        purple_pink_stops = 0
        for tok in color_tokens:
            rgb = _parse_color_rgb(tok)
            if not rgb:
                continue
            deg, s, _ = _rgb_to_hsl_norm(rgb[0], rgb[1], rgb[2])
            if 235.0 <= deg <= 345.0 and (s * 100.0) >= 45.0:
                purple_pink_stops += 1
        if purple_pink_stops >= 2:
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
    for m in re.finditer(r"<svg\b[^>]*>([\s\S]*?)</svg>", clean, re.I):
        svg_start = m.start()
        svg_chunk = m.group(0)
        for rm in re.finditer(r"<rect\b([^>]*)/?>", svg_chunk, re.I):
            attrs = rm.group(1) or ""
            wm = re.search(r"(?<![A-Za-z0-9_-])width\s*=\s*[\"']?(\d+(?:\.\d+)?)", attrs, re.I)
            hm = re.search(r"(?<![A-Za-z0-9_-])height\s*=\s*[\"']?(\d+(?:\.\d+)?)", attrs, re.I)
            rxm = re.search(r"(?<![A-Za-z0-9_-])r[xy]\s*=\s*[\"']?(\d+(?:\.\d+)?)", attrs, re.I)
            if not (wm and hm and rxm):
                continue
            w, h, rx = float(wm.group(1)), float(hm.group(1)), float(rxm.group(1))
            if w >= 36 and 14 <= h <= 44 and w >= h * 1.5 and rx >= h * 0.35:
                matches.append({"index": svg_start + rm.start(), "length": len(rm.group(0))})

    if len(matches) > max_pills:
        matches.sort(key=lambda item: item["index"])
        return [matches[0]]
    return []


def _extract_css_box_classes(raw_text: str) -> set[str]:
    box_classes: set[str] = set()
    for sm in re.finditer(r"<style\b[^>]*>([\s\S]*?)</style>", raw_text, re.I):
        css = sm.group(1) or ""
        for rm in re.finditer(r"([^{}]+)\{([^{}]+)\}", css):
            sel = rm.group(1) or ""
            decl = rm.group(2) or ""
            has_border_or_shadow = bool(re.search(r"(?:^|[;\s])(?:border|box-shadow)\s*:\s*(?!none\b|0\b)", decl, re.I)) and not bool(
                re.search(r"(?:^|[;\s])border\s*:\s*(?:none|0)\b", decl, re.I)
            )
            has_radius = bool(re.search(r"(?:^|[;\s])border-radius\s*:\s*(?!0(?:px)?\b)", decl, re.I))
            has_pad = bool(re.search(r"(?:^|[;\s])padding(?:-(?:top|right|bottom|left|inline|block))?\s*:\s*(?!0(?:px)?\b)", decl, re.I))
            if has_border_or_shadow and has_radius and has_pad:
                for cls_m in re.finditer(r"\.([A-Za-z_-][A-Za-z0-9_-]*)", sel):
                    box_classes.add(cls_m.group(1))
    return box_classes


def _probe_ui_box_in_box(raw_text: str) -> list[dict[str, Any]]:
    box_css_classes = _extract_css_box_classes(raw_text)
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
        cls_attr = re.search(r"\bclass(?:Name)?\s*=\s*[\"']([^\"']+)[\"']", attrs, re.I)
        has_css_box = any(c in box_css_classes for c in cls_attr.group(1).split()) if cls_attr else False
        has_border = bool(re.search(r"\b(?:border(?:-[a-z0-9]+)?|ring-1|shadow(?:-[a-z]+)?)\b|border\s*:", attrs, re.I)) and not bool(
            re.search(r"\bborder-(?:t|b|l|r|0|none)\b", attrs, re.I)
        )
        has_radius = bool(re.search(r"\brounded(?:-[a-z0-9]+)?\b|border-radius\s*:", attrs, re.I)) and not bool(
            re.search(r"\brounded-none\b", attrs, re.I)
        )
        has_pad = bool(re.search(r"\bp[xy]?-\d|padding\s*:", attrs, re.I))
        is_box = has_css_box or (has_border and has_radius and has_pad)
        depth = (stack[-1][1] if stack else 0) + (1 if is_box else 0)
        if is_box and depth >= 3 and not hits:
            hits.append({"index": m.start(), "length": len(full)})
        if not self_close:
            stack.append((tag, depth))
    return hits


def _rgb_to_hsl_norm(r: int, g: int, b: int) -> tuple[float, float, float]:
    rn = r / 255.0
    gn = g / 255.0
    bn = b / 255.0
    mx = max(rn, gn, bn)
    mn = min(rn, gn, bn)
    l = (mx + mn) / 2.0
    if mx == mn:
        return (0.0, 0.0, l)
    d = mx - mn
    s = d / (2.0 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == rn:
        h = (gn - bn) / d + (6.0 if gn < bn else 0.0)
    elif mx == gn:
        h = (bn - rn) / d + 2.0
    else:
        h = (rn - gn) / d + 4.0
    return (h * 60.0, s, l)


def _mask_ui_visual_markup(raw_text: str) -> str:
    clean = re.sub(
        r"<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->",
        _preserve_lines_blank,
        str(raw_text or ""),
        flags=re.I,
    )
    clean = re.sub(r"<!--[\s\S]*?-->", _preserve_lines_blank, clean)
    clean = re.sub(r"/\*[\s\S]*?\*/", _preserve_lines_blank, clean)
    clean = re.sub(r"<(script|code|pre)\b[^>]*>[\s\S]*?</\1>", _preserve_lines_blank, clean, flags=re.I)
    return clean


def _probe_ui_glow_blob_chrome(raw_text: str) -> list[dict[str, Any]]:
    clean = _mask_ui_visual_markup(raw_text)
    hits: list[dict[str, Any]] = []
    seen: set[str] = set()

    def push_hit(idx: int, length: int) -> None:
        key = f"{idx}:{length}"
        if key not in seen:
            seen.add(key)
            hits.append({"index": idx, "length": length})

    # 1. Tailwind ambient blur orbs (blur-3xl / blur-[>=40px])
    for m in re.finditer(r"<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*\b(?:blur-3xl|blur-\[(\d+)px\])[^>]*>", clean, re.I):
        px = int(m.group(1)) if m.group(1) else 64
        if px < 40:
            continue
        tag = m.group(0)
        if re.search(r"\b(?:rounded-full|indigo-|purple-|violet-|pink-|fuchsia-|cyan-)\b|radial-gradient", tag, re.I):
            push_hit(m.start(), len(tag))

    # 2. CSS filter: blur(>=40px) paired with circular / radial-gradient / hex
    for m in re.finditer(r"filter\s*:\s*blur\(\s*(\d+)px\s*\)", clean, re.I):
        if int(m.group(1)) < 40:
            continue
        ctx = clean[max(0, m.start() - 220) : min(len(clean), m.end() + 220)]
        if re.search(r"border-radius\s*:\s*(?:50%|999\d*px)|radial-gradient|#[0-9a-fA-F]{6}", ctx, re.I):
            push_hit(m.start(), m.end() - m.start())

    # 3. Neon colored shadow glow (Tailwind or CSS box-shadow)
    for m in re.finditer(r"\bshadow-(?:indigo|purple|violet|pink|fuchsia|cyan)-[45]00(?:/\d+)?\b", clean, re.I):
        push_hit(m.start(), m.end() - m.start())

    for m in re.finditer(r"box-shadow\s*:[^;\n]{0,160}", clean, re.I):
        decl = m.group(0)
        if not re.search(r"\b(?:1[5-9]|[2-9]\d)px\b", decl):
            continue
        for c_tok in re.findall(r"#[0-9a-fA-F]{3,6}\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}[^)]*\)", decl, re.I):
            rm = re.match(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})", c_tok, re.I)
            rgb = [int(rm.group(1)), int(rm.group(2)), int(rm.group(3))] if rm else _parse_color_rgb(c_tok)
            if not rgb:
                continue
            deg, s, _ = _rgb_to_hsl_norm(rgb[0], rgb[1], rgb[2])
            if (s * 100.0) >= 55.0 and ((175.0 <= deg <= 210.0) or (245.0 <= deg <= 345.0)):
                push_hit(m.start(), len(decl))
                break

    # 4. Pulsing badge dot (`animate-ping` in `rounded-full`)
    for m in re.finditer(r"<[^>]*\banimate-ping\b[^>]*>", clean, re.I):
        ctx = clean[max(0, m.start() - 140) : min(len(clean), m.end() + 140)]
        if re.search(r"\brounded-full\b", ctx):
            push_hit(m.start(), m.end() - m.start())

    # 5. SVG excessive glow / drop-shadow filters
    for m in re.finditer(r"<svg\b[^>]*>[\s\S]*?</svg>", clean, re.I):
        svg_body = m.group(0)
        blur_tags = re.findall(r"<(?:feGaussianBlur|feDropShadow)\b", svg_body, re.I)
        heavy_blur = bool(
            re.search(r"<(?:feGaussianBlur|feDropShadow)\b[^>]*\bstdDeviation\s*=\s*[\"']\s*(?:[89]|\d{2,})(?:\.\d+)?", svg_body, re.I)
        )
        if len(blur_tags) >= 2 or heavy_blur:
            ff = re.search(r"<(?:feGaussianBlur|feDropShadow)\b[^>]*>", svg_body, re.I)
            idx = m.start() + ff.start() if ff else m.start()
            length = len(ff.group(0)) if ff else 32
            push_hit(idx, length)

    return hits


def _probe_ui_emoji_icon_chrome(raw_text: str) -> list[dict[str, Any]]:
    clean = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", _preserve_lines_blank, _mask_ui_visual_markup(raw_text), flags=re.I)
    emoji_cls = "[\U0001F680\u2728\u26A1\U0001F525\U0001F4A1\U0001F3AF\U0001F6E1\u2699\U0001F4C8\U0001F916\U0001F48E\U0001F31F\U0001F3A8\U0001F512\U0001F4CA\U0001F9E0\U0001F310\U0001F389]\uFE0F?"
    tag_re = re.compile(rf"<(h[1-4]|button|a|span|div|text)\b[^>]*>[^<]{{0,90}}{emoji_cls}[^<]{{0,90}}</\1>", re.I)
    matches = [{"index": m.start(), "length": m.end() - m.start()} for m in tag_re.finditer(clean)]
    return [matches[0]] if len(matches) >= 3 else []


def _probe_ui_template_card_grid(raw_text: str) -> list[dict[str, Any]]:
    clean = _mask_ui_visual_markup(raw_text)
    clean = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", _preserve_lines_blank, clean, flags=re.I)
    clean = re.sub(r"<svg\b[^>]*>[\s\S]*?</svg>", _preserve_lines_blank, clean, flags=re.I)
    hits: list[dict[str, Any]] = []

    # 1. >= 3 tinted rounded-square icon tiles
    tile_hits: list[dict[str, int]] = []
    for m in re.finditer(r"<(div|span)\b([^>]*)>", clean, re.I):
        attrs = m.group(2) or ""
        has_round = bool(re.search(r"\brounded-(?:lg|xl|2xl)\b", attrs))
        has_size = bool(re.search(r"\bsize-(?:8|9|10|11|12|14|16)\b", attrs)) or (
            bool(re.search(r"\bw-(?:8|9|10|11|12|14|16)\b", attrs))
            and bool(re.search(r"\bh-(?:8|9|10|11|12|14|16)\b", attrs))
        )
        has_tint = bool(
            re.search(
                r"\bbg-(?:indigo|purple|violet|blue|pink|fuchsia|emerald|teal|cyan|amber|orange|rose)-(?:50|100|400/\d+|500/\d+|900/\d+|950/\d+)\b",
                attrs,
            )
        )
        if has_round and has_size and has_tint:
            tile_hits.append({"index": m.start(), "length": m.end() - m.start()})
    if len(tile_hits) >= 3:
        hits.append(tile_hits[0])

    # 2. Fake macOS 3-dot traffic-light window chrome
    dots = [
        {"index": m.start(), "length": m.end() - m.start(), "color": m.group(1).lower()}
        for m in re.finditer(
            r"<(?:span|div)\b[^>]*\brounded-full\b[^>]*\bbg-(red|rose|yellow|amber|green|emerald)-\d{2,3}\b[^>]*>(?:\s*</(?:span|div)>)?",
            clean,
            re.I,
        )
    ]
    for i in range(len(dots) - 2):
        a, b, c = dots[i], dots[i + 1], dots[i + 2]
        if (
            a["color"] in {"red", "rose"}
            and b["color"] in {"yellow", "amber"}
            and c["color"] in {"green", "emerald"}
            and (c["index"] - a["index"]) <= 280
        ):
            hits.append({"index": a["index"], "length": min(120, c["index"] + c["length"] - a["index"])})
            break

    # 3. Sequential standalone zero-padded eyebrow kickers (01, 02, 03)
    void_list_tags = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
    list_ranges: list[tuple[int, int]] = []
    list_stack: list[tuple[str, bool, int]] = []
    for tm in re.finditer(r"</?([a-zA-Z0-9-]+)\b([^>]*)/?>", clean):
        full_t = tm.group(0)
        tag_t = tm.group(1).lower()
        attrs_t = tm.group(2) or ""
        self_close_t = full_t.endswith("/>") or tag_t in void_list_tags
        if full_t.startswith("</"):
            for si in range(len(list_stack) - 1, -1, -1):
                if list_stack[si][0] == tag_t:
                    popped = list_stack[si:]
                    del list_stack[si:]
                    for _, is_lc, s_pos in popped:
                        if is_lc:
                            list_ranges.append((s_pos, tm.end()))
                    break
            continue
        is_lc = tag_t in {"ol", "nav"} or bool(re.search(r"(?<![A-Za-z0-9_-])role\s*=\s*[\"']list[\"']", attrs_t, re.I))
        if not self_close_t:
            list_stack.append((tag_t, is_lc, tm.start()))
    for _, is_lc, s_pos in list_stack:
        if is_lc:
            list_ranges.append((s_pos, len(clean)))

    def _in_sem_list(idx_val: int) -> bool:
        return any(s_p <= idx_val <= e_p for s_p, e_p in list_ranges)

    seq_tags = []
    for m in re.finditer(r"<(span|div|p)\b[^>]*>\s*(0[1-9])\s*</\1>", clean, re.I):
        if _in_sem_list(m.start()):
            continue
        seq_tags.append({"index": m.start(), "length": m.end() - m.start(), "num": m.group(2)})
    seq_nums = {t["num"] for t in seq_tags}
    if len(seq_tags) >= 3 and {"01", "02", "03"}.issubset(seq_nums):
        hits.append({"index": seq_tags[0]["index"], "length": seq_tags[0]["length"]})

    return hits


def _probe_svg_layout_slop(raw_text: str) -> list[dict[str, Any]]:
    clean = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", _preserve_lines_blank, _mask_ui_visual_markup(raw_text), flags=re.I)
    hits: list[dict[str, Any]] = []

    # 1. Non-icon <svg> missing viewBox
    for m in re.finditer(r"<svg\b([^>]*)>", clean, re.I):
        attrs = m.group(1) or ""
        if re.search(r"\bviewBox\s*=", attrs, re.I):
            continue
        wm = re.search(r"\bwidth\s*=\s*[\"']?(\d+(?:\.\d+)?)", attrs, re.I)
        hm = re.search(r"\bheight\s*=\s*[\"']?(\d+(?:\.\d+)?)", attrs, re.I)
        if wm and hm and float(wm.group(1)) >= 120 and float(hm.group(1)) >= 80:
            hits.append({"index": m.start(), "length": m.end() - m.start()})

    # 2. Overlapping <text x="..." y="..."> coordinates within same <g> transform scope
    g_stack: list[str] = []
    texts_by_group: dict[str, list[dict[str, Any]]] = {}
    in_text = False
    cur_text_info: dict[str, Any] | None = None
    cur_text_body = ""
    for m in re.finditer(r"</?(?:g|text)\b[^>]*>|[^<]+", clean, re.I):
        tok = m.group(0)
        if re.match(r"^<g\b", tok, re.I):
            tr = re.search(r"\btransform\s*=\s*[\"']([^\"']+)[\"']", tok, re.I)
            g_stack.append(tr.group(1).strip() if tr else "")
            continue
        if re.match(r"^<\/g>", tok, re.I):
            if g_stack:
                g_stack.pop()
            continue
        if re.match(r"^<text\b", tok, re.I):
            xm = re.search(r"\bx\s*=\s*[\"']?(-?\d+(?:\.\d+)?)", tok, re.I)
            ym = re.search(r"\by\s*=\s*[\"']?(-?\d+(?:\.\d+)?)", tok, re.I)
            if xm and ym and not tok.endswith("/>"):
                in_text = True
                cur_text_body = ""
                gkey = "|".join([x for x in g_stack if x]) or "root"
                cur_text_info = {
                    "index": m.start(),
                    "length": len(tok),
                    "x": float(xm.group(1)),
                    "y": float(ym.group(1)),
                    "groupKey": gkey,
                }
            continue
        if re.match(r"^<\/text>", tok, re.I):
            if in_text and cur_text_info and cur_text_body.strip():
                texts_by_group.setdefault(cur_text_info["groupKey"], []).append(cur_text_info)
            in_text = False
            cur_text_info = None
            continue
        if in_text:
            cur_text_body += re.sub(r"<[^>]+>", "", tok)

    for lst in texts_by_group.values():
        found_overlap = False
        for i in range(len(lst)):
            if found_overlap:
                break
            for j in range(i + 1, len(lst)):
                if abs(lst[i]["x"] - lst[j]["x"]) < 8 and abs(lst[i]["y"] - lst[j]["y"]) < 8:
                    hits.append({"index": lst[j]["index"], "length": lst[j]["length"]})
                    found_overlap = True
                    break

    # 3. >= 2 orphaned unused id="..." entries inside <defs>
    for m in re.finditer(r"<defs\b[^>]*>([\s\S]*?)</defs>", clean, re.I):
        defs_body = m.group(1) or ""
        outside_defs = clean[: m.start()] + clean[m.end() :]
        id_matches = list(re.finditer(r"\bid\s*=\s*[\"']([^\"']+)[\"']", defs_body, re.I))
        orphan_count = 0
        for im in id_matches:
            def_id = im.group(1)
            used_re = re.compile(rf"#{re.escape(def_id)}(?![A-Za-z0-9_-])")
            other_defs = defs_body.replace(im.group(0), "", 1)
            if not used_re.search(outside_defs) and not used_re.search(other_defs):
                orphan_count += 1
        if orphan_count >= 2:
            hits.append({"index": m.start(), "length": min(80, m.end() - m.start())})

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
    if probe == "image-ai-workflow-residue":
        if fixture.startswith("IMG_WORKFLOW:"):
            return [{"location": "metadata", "match": fixture[len("IMG_WORKFLOW:") :], "severity": "warning"}]
        if fixture.startswith("IMG_PROVENANCE:"):
            return [{"location": "metadata", "match": fixture[len("IMG_PROVENANCE:") :], "severity": "info"}]
    if probe == "image-ai-palette-slop":
        if fixture.startswith("IMG_NEON_PALETTE:") or fixture.startswith("IMG_PLASTIC:"):
            parts = fixture.split(":", 1)
            return [{"location": "pixels", "match": parts[1] if len(parts) > 1 and parts[1] else "synthetic-palette"}]
    if probe == "pdf-visual-layout-slop":
        if fixture.startswith(("PDF_RASTER_DECK:", "PDF_FLAT_TYPE:", "PDF_MONOTONY:")):
            parts = fixture.split(":", 1)
            return [{"location": "page 1", "match": parts[1] if len(parts) > 1 and parts[1] else "pdf-layout"}]
    return []


_META_MENTION_GUARD_RULES = {
    "unsubstantiated-superlative",
    "false-certainty",
    "overclaiming",
    "unanchored-multiplier",
    "unsourced-attribution",
}


_META_MENTION_GUARD_RULES_EX = {
    "unsubstantiated-superlative",
    "reg-unsubstantiated-superlative",
    "false-certainty",
    "overclaiming",
    "unanchored-multiplier",
    "unsourced-attribution",
}


def _is_meta_mention_hit(
    clause_source: str,
    start: int,
    end: int,
    rule: dict[str, Any],
    break_indices: list[int] | None = None,
) -> bool:
    fam = str(rule.get("family") or "")
    rid = str(rule.get("id") or "")
    unprefixed_id = re.sub(r"^(?:reg|eng|biz|ess|lit|exec|ui)-", "", rid)
    if (
        rule.get("category") != "lexicon"
        and not fam.startswith("lexicon/")
        and rid not in _META_MENTION_GUARD_RULES_EX
        and unprefixed_id not in _META_MENTION_GUARD_RULES_EX
    ):
        return False
    s = str(clause_source or "")
    left = s.rfind("\n", 0, max(0, start)) + 1
    nl_after = s.find("\n", end)
    right = len(s) if nl_after == -1 else nl_after
    if break_indices:
        pos_l = bisect.bisect_left(break_indices, start)
        if pos_l > 0:
            left = max(left, break_indices[pos_l - 1] + 1)
        pos_r = bisect.bisect_left(break_indices, end)
        if pos_r < len(break_indices):
            right = min(right, break_indices[pos_r])
    else:
        p = start
        while p > left and not is_sentence_break_at(s, p - 1):
            p -= 1
        left = p
        p = end
        while p < right and not is_sentence_break_at(s, p):
            p += 1
        right = p
    clause = s[left:right]

    has_meta_cue = bool(
        re.search(
            r"(?:禁用|禁词|忌用|黑词|黑话|套话|套词|违禁|回避|勿用|避免(?:使用)?|最好别用|少用|慎用|别用|这类词|等词|字眼|话术|替换为|改为|改成|改写|反例|原句|例句|示例|forbidden|banned|avoid|do\s+not\s+use|replace\s+with|instead\s+of|anti-pattern|clich[eé]|slop|buzzwords?|jargon|filler|phrases\s+like|words\s+like)",
            clause,
            re.I | re.ASCII,
        )
        or re.search(r"(?:^|\b)(?:FORBIDDEN|BANNED|DISALLOWED|BLOCKLIST|STOP_WORDS)\s*[:=]", clause, re.I | re.ASCII)
    )
    if not has_meta_cue:
        return False

    quote_pairs = [('"', '"'), ("“", "”"), ("‘", "’"), ("「", "」"), ("『", "』"), ("`", "`"), ("'", "'")]
    rel_start = start - left
    rel_end = end - left
    for open_q, close_q in quote_pairs:
        q_open = clause.rfind(open_q, 0, max(0, rel_start + 1))
        if q_open == -1 or rel_start - q_open > 24:
            continue
        q_close = clause.find(close_q, rel_end)
        if q_close == -1:
            continue
        if q_close - q_open <= 48:
            return True
    return False


def _clean_match_excerpt(matched_raw: str, modality: str, primary_zone_name: str) -> str:
    out = str(matched_raw or "")
    if primary_zone_name == "prose" and modality in {"html", "jsx", "svg"}:
        no_tags = re.sub(r"<[^>]+>", " ", out)
        dec = _HTML_ENTITY_RE.sub(lambda m: _decode_entity_token(m.group(0), m.group(1), m.group(2)) or m.group(0), no_tags)
        stripped = _decode_xml_entities(dec)
        stripped = re.sub(r"[\s\ufeff]+", " ", _fix_surrogates(stripped)).strip()
        if stripped:
            out = stripped
    else:
        out = re.sub(r"[\s\ufeff]+", " ", _fix_surrogates(out)).strip()
    if out.startswith("**") and "*" not in out[2:]:
        out = out[2:].strip()
    if out.endswith("**") and "*" not in out[:-2]:
        out = out[:-2].strip()
    return out[:140]


@functools.lru_cache(maxsize=256)
def _compile_rule_regex(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.I | re.M)


def audit_text(
    text: str,
    *,
    filename: str = "<memory>",
    modality: str | None = None,
    pack: dict[str, Any],
    config: dict[str, Any] | None = None,
    register: str | None = None,
    allow_synthetic_fixtures: bool = False,
) -> dict[str, Any]:
    cfg = config or {}
    mod = modality or detect_modality(filename) or "markdown"
    line_starts = build_line_starts(text)
    zones = build_zones(text, mod, {"proseFences": cfg.get("proseFences"), "maskBlockquotes": cfg.get("maskBlockquotes")})
    by_target, directives = parse_suppressions(text)
    allow_list = [str(a).lower() for a in (cfg.get("allow") or [])]
    text_breaks = _build_sentence_break_indices(text)
    prose_breaks = _build_sentence_break_indices(zones["prose"]) if zones.get("prose") else text_breaks
    reg_info = resolve_register(text, filename=filename, flag_register=register, config=cfg)
    allow_html_rules_in_mixed_md = mod == "markdown" and has_embedded_ui_markup(text)
    md_ui_zone = (
        re.sub(r"`[^`\n]+`", lambda m: " " * len(m.group(0)), _mask_markdown_fences(text, set()))
        if allow_html_rules_in_mixed_md
        else None
    )
    findings: list[dict[str, Any]] = []
    thresholds = pack.get("thresholds") or {}

    for base_rule in (pack.get("rules") or []):
        rule_mods = base_rule.get("modalities")
        direct_mod_match = not rule_mods or mod in rule_mods
        mixed_ui_rule = (not direct_mod_match) and allow_html_rules_in_mixed_md and ("html" in (rule_mods or []))
        if not direct_mod_match and not mixed_ui_rule:
            continue

        reg_applied = apply_register_override(base_rule, reg_info["register"], cfg)
        if reg_applied["skip"]:
            for d in directives:
                if not d["used"] and base_rule["id"] in d["ruleIds"]:
                    d["used"] = True
            continue
        rule = reg_applied["rule"]
        reg_adjusted = bool(reg_applied["registerAdjusted"])

        if allow_synthetic_fixtures and text.startswith(("DOCX_", "PPTX_", "IMG_", "PDF_")):
            for sh in _eval_synthetic_binary_fixture(text, rule, thresholds):
                eff_rule = {**rule, "severity": sh["severity"]} if "severity" in sh else rule
                findings.append(
                    make_finding(
                        rule=eff_rule,
                        filename=filename,
                        modality=mod,
                        location=sh["location"],
                        match=sh["match"],
                        sentence=text,
                        span={"start": 0, "end": len(text)},
                        register_adjusted=reg_adjusted,
                    )
                )
            continue

        zone_name = (rule.get("zones") or ["prose"])[0]
        use_logical_prose = (not mixed_ui_rule) and zone_name == "prose" and zones.get("proseLogical") is not None and zones.get("proseMap") is not None
        zone_text = md_ui_zone if mixed_ui_rule else (zones["proseLogical"] if use_logical_prose else zones.get(zone_name, zones["prose"]))
        raw_for_probes = zone_text if use_logical_prose else text
        probe = rule.get("probe", "regex")
        raw_hits: list[dict[str, Any]] = []

        if probe == "regex":
            for pattern in rule.get("patterns", []):
                rx = _compile_rule_regex(pattern)
                for m in rx.finditer(zone_text):
                    if m.end() > m.start():
                        idx = m.start()
                        length = m.end() - m.start()
                        if zone_name == "prose":
                            lead = re.match(r"^[.!?。！？\s]+", m.group(0))
                            if lead and len(lead.group(0)) < length:
                                idx += len(lead.group(0))
                                length -= len(lead.group(0))
                        while length > 1 and zone_text[idx] == "\ufeff":
                            idx += 1
                            length -= 1
                        if (
                            rule.get("id") == "unfilled-placeholder"
                            and zone_text[idx] == "["
                            and zone_text[idx + length - 1] == "]"
                            and idx + length < len(zone_text)
                            and zone_text[idx + length] in "([:"
                        ):
                            continue
                        raw_hits.append({"index": idx, "length": length})
        elif probe == "negation-pivot":
            raw_hits = _probe_negation_pivot(zone_text, raw_for_probes)
        elif probe == "staccato-run":
            raw_hits = _probe_staccato_run(zone_text, raw_for_probes)
        elif probe == "zh-four-char-triad":
            raw_hits = _probe_zh_four_char_triad(zone_text)
        elif probe == "unsourced-attribution":
            raw_hits = _probe_unsourced_attribution(zone_text, raw_for_probes)
        elif probe == "bold-lead-list-wall":
            raw_hits = _probe_bold_lead_list_wall(zone_text, raw_for_probes, thresholds.get("boldLeadListRun", 4))
        elif probe == "em-dash-density":
            raw_hits = _probe_em_dash_density(zone_text, thresholds.get("maxEmDashesPer300Words", 4))
        elif probe == "zh-halfwidth-punctuation":
            raw_hits = [
                {"index": m.start(), "length": m.end() - m.start()}
                for m in re.finditer(r"[\u4e00-\u9fff][,;:!?][\u4e00-\u9fff]", zone_text)
            ]
        elif probe == "cooccurrence-slop-cluster":
            raw_hits = _probe_cooccurrence_slop_cluster(zone_text, raw_for_probes)
        elif probe == "semicolon-tricolon":
            raw_hits = _probe_semicolon_tricolon(zone_text, raw_for_probes)
        elif probe == "rhetorical-qa-cadence":
            raw_hits = _probe_rhetorical_qa_cadence(zone_text, raw_for_probes)
        elif probe == "comma-chain-runon":
            raw_hits = _probe_comma_chain_runon(zone_text, raw_for_probes)
        elif probe == "narrative-sandwich-frame":
            raw_hits = _probe_narrative_sandwich_frame(zone_text, raw_for_probes)
        elif probe == "template-skeleton-echo":
            raw_hits = _probe_template_skeleton_echo(zone_text, raw_for_probes)
        elif probe == "low-burstiness-vapor":
            raw_hits = _probe_low_burstiness_vapor(zone_text, raw_for_probes)
        elif probe == "unanchored-multiplier":
            raw_hits = _probe_unanchored_multiplier(zone_text, raw_for_probes)
        elif probe == "zh-dev-jargon":
            raw_hits = _probe_zh_dev_jargon(zone_text, raw_for_probes)
        elif probe == "zh-exclamation":
            raw_hits = _probe_zh_exclamation(zone_text, raw_for_probes)
        elif probe == "zh-mega-sentence":
            raw_hits = _probe_zh_mega_sentence(zone_text, raw_for_probes)
        elif probe == "unsourced-statistic":
            raw_hits = _probe_unsourced_statistic(zone_text, text, zones.get("proseMap") if use_logical_prose else None)
        elif probe == "ui-dead-control":
            raw_hits = _probe_ui_dead_control(text)
        elif probe == "ui-ai-gradient":
            raw_hits = _probe_ui_ai_gradient(text)
        elif probe == "ui-pill-soup":
            raw_hits = _probe_ui_pill_soup(text, thresholds.get("maxPillsPerFile", 6))
        elif probe == "ui-box-in-box":
            raw_hits = _probe_ui_box_in_box(text)
        elif probe == "ui-glow-blob-chrome":
            raw_hits = _probe_ui_glow_blob_chrome(text)
        elif probe == "ui-emoji-icon-chrome":
            raw_hits = _probe_ui_emoji_icon_chrome(text)
        elif probe == "ui-template-card-grid":
            raw_hits = _probe_ui_template_card_grid(text)
        elif probe == "svg-layout-slop":
            raw_hits = _probe_svg_layout_slop(text)

        if use_logical_prose and zones.get("proseMap"):
            starts_m, ends_m = zones["proseMap"]
            mapped_hits: list[dict[str, Any]] = []
            for h in raw_hits:
                s_idx = starts_m[h["index"]] if h["index"] < len(starts_m) else h["index"]
                last_pos = max(h["index"], h["index"] + h["length"] - 1)
                e_idx = ends_m[last_pos] if last_pos < len(ends_m) else h["index"] + h["length"]
                mapped_hits.append({**h, "index": s_idx, "length": max(1, e_idx - s_idx)})
            raw_hits = mapped_hits

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
            matched_display = _clean_match_excerpt(matched_raw, mod, zone_name)
            low_match = matched_raw.lower()
            low_disp = matched_display.lower()
            if any(al in low_match or al in low_disp for al in allow_list):
                continue
            mention_src = zones["prose"] if zone_name == "prose" else text
            mention_breaks = prose_breaks if zone_name == "prose" else text_breaks
            if _is_meta_mention_hit(mention_src, start, end, rule, mention_breaks):
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
                    match=matched_display,
                    sentence=enclosing_sentence(text, start, end, text_breaks),
                    keep_sentence=enclosing_sentence_unclipped(text, start, end),
                    register_adjusted=reg_adjusted,
                )
            )

    unused = [
        {"file": filename, "line": d["directiveLine"], "ruleIds": d["ruleIds"], "reason": d["reason"]}
        for d in directives
        if not d["used"]
    ]
    findings.sort(key=lambda f: (f.get("line", 0), f.get("col", 0)))
    jargon_ranges = [f["span"] for f in findings if f.get("ruleId") == "zh-dev-jargon" and isinstance(f.get("span"), dict)]
    if jargon_ranges:
        findings = [
            f for f in findings
            if f.get("ruleId") != "zh-bureaucratic-padding"
            or not isinstance(f.get("span"), dict)
            or not any(f["span"]["start"] >= j["start"] - 2 and f["span"]["end"] <= j["end"] + 2 for j in jargon_ranges)
        ]
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

    raw_dec = re.sub(r"&(?:#([0-9]+)|#x([0-9a-fA-F]+)|lt|gt|quot|apos|amp);", _repl, str(s))
    return _fix_surrogates(raw_dec)


def audit_ooxml_entries(
    entries: dict[str, str],
    *,
    filename: str,
    modality: str,
    pack: dict[str, Any],
    config: dict[str, Any] | None = None,
    register: str | None = None,
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
            if md_leak_rule and (re.search(r"\*\*[^*\n]{1,80}\*\*", para_text) or re.match(r"^#{1,6}[ \t]+\S", para_text)):
                findings.append(
                    make_finding(rule=md_leak_rule, filename=filename, modality=modality, location=f"para {para_idx}", line=para_idx, match=para_text[:100])
                )
            sub = audit_text(para_text, filename=filename, modality="markdown", pack=pack, config=config, register=register)
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
            if md_leak_rule and (re.search(r"\*\*[^*\n]{1,80}\*\*", full_text) or re.search(r"^#{1,6}[ \t]+\S", full_text, re.M)):
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

            sub = audit_text(full_text, filename=filename, modality="markdown", pack=pack, config=config, register=register)
            for f in sub["findings"]:
                if is_hidden and f.get("severity") != "error":
                    continue
                findings.append({**f, "modality": "pptx", "location": f"slide {slide_num}", "line": slide_num})

        return {"findings": findings, "skipped": skipped}

    return {"findings": findings, "skipped": skipped}


# ---------- Binary Image & PDF Parsers & Auditors ----------

_MAX_STREAM_UNCOMPRESSED_BYTES = 32 * 1024 * 1024
_MAX_PNG_PIXELS = 16_000_000


def _paeth_predictor(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _round4(v: float) -> float:
    return int(v * 10000.0 + 0.5) / 10000.0


def _decode_png_scanlines_and_metrics(
    idat_chunks: list[bytes],
    width: int,
    height: int,
    bit_depth: int,
    color_type: int,
    interlace: int,
    palette: list[tuple[int, int, int]] | None,
) -> dict[str, Any] | None:
    if interlace != 0 or bit_depth != 8 or width <= 0 or height <= 0 or width * height > _MAX_PNG_PIXELS:
        return None
    bpp_map = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
    bpp = bpp_map.get(color_type)
    if not bpp:
        return None
    if color_type == 3 and not palette:
        return None
    compressed = b"".join(idat_chunks)
    if not compressed:
        return None
    try:
        decomp = zlib.decompressobj()
        raw = decomp.decompress(compressed, _MAX_STREAM_UNCOMPRESSED_BYTES + 1)
        if len(raw) > _MAX_STREAM_UNCOMPRESSED_BYTES:
            return None
    except Exception:
        return None

    stride = width * bpp
    expected = height * (1 + stride)
    if len(raw) < expected:
        return None

    pixels = bytearray(height * stride)
    for y in range(height):
        row_in = y * (1 + stride)
        filter_type = raw[row_in]
        row_out = y * stride
        prev_out = (y - 1) * stride
        if filter_type == 0:
            pixels[row_out : row_out + stride] = raw[row_in + 1 : row_in + 1 + stride]
        else:
            for x in range(stride):
                filt = raw[row_in + 1 + x]
                a = pixels[row_out + x - bpp] if x >= bpp else 0
                b = pixels[prev_out + x] if y > 0 else 0
                c = pixels[prev_out + x - bpp] if (y > 0 and x >= bpp) else 0
                if filter_type == 1:
                    val = (filt + a) & 0xFF
                elif filter_type == 2:
                    val = (filt + b) & 0xFF
                elif filter_type == 3:
                    val = (filt + ((a + b) >> 1)) & 0xFF
                elif filter_type == 4:
                    val = (filt + _paeth_predictor(a, b, c)) & 0xFF
                else:
                    val = filt
                pixels[row_out + x] = val

    def get_rgba(x: int, y: int) -> tuple[int, int, int, int]:
        off = y * stride + x * bpp
        if color_type == 2:
            return (pixels[off], pixels[off + 1], pixels[off + 2], 255)
        if color_type == 6:
            return (pixels[off], pixels[off + 1], pixels[off + 2], pixels[off + 3])
        if color_type == 0:
            g = pixels[off]
            return (g, g, g, 255)
        if color_type == 4:
            g = pixels[off]
            return (g, g, g, pixels[off + 1])
        idx = pixels[off]
        pal = palette[idx] if palette and idx < len(palette) else (0, 0, 0)
        return (pal[0], pal[1], pal[2], 255)

    return _compute_pixel_metrics(width, height, get_rgba)


def _compute_pixel_metrics(width: int, height: int, get_rgba) -> dict[str, Any] | None:
    step_x = max(1, width // 160)
    step_y = max(1, height // 160)
    start_x = 1 if width >= 3 else 0
    end_x = width - 1 if width >= 3 else width
    start_y = 1 if height >= 3 else 0
    end_y = height - 1 if height >= 3 else height

    opaque_pixels = 0
    neon_purple_count = 0
    neon_cyan_count = 0
    dark_bg_count = 0
    high_sat_count = 0
    smooth_high_sat_count = 0
    neutral_count = 0
    quantized: set[int] = set()

    for y in range(start_y, end_y, step_y):
        for x in range(start_x, end_x, step_x):
            r, g, b, a = get_rgba(x, y)
            if a < 32:
                continue
            opaque_pixels += 1
            quantized.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4))
            h, s, l = _rgb_to_hsl_norm(r, g, b)
            if l <= 0.14:
                dark_bg_count += 1
            if s <= 0.12:
                neutral_count += 1
            if s >= 0.40 and 0.15 <= l <= 0.85 and 235.0 <= h <= 335.0:
                neon_purple_count += 1
            if s >= 0.45 and 0.25 <= l <= 0.80 and 175.0 <= h <= 210.0:
                neon_cyan_count += 1
            if s >= 0.78 and 0.20 <= l <= 0.85:
                high_sat_count += 1
                left = get_rgba(max(0, x - 1), y)
                right = get_rgba(min(width - 1, x + 1), y)
                up = get_rgba(x, max(0, y - 1))
                down = get_rgba(x, min(height - 1, y + 1))
                diff_sum = (
                    abs(r - left[0]) + abs(g - left[1]) + abs(b - left[2])
                    + abs(r - right[0]) + abs(g - right[1]) + abs(b - right[2])
                    + abs(r - up[0]) + abs(g - up[1]) + abs(b - up[2])
                    + abs(r - down[0]) + abs(g - down[1]) + abs(b - down[2])
                )
                if diff_sum / 4.0 < 18.0:
                    smooth_high_sat_count += 1

    if opaque_pixels == 0:
        return None
    return {
        "sampledPixels": opaque_pixels,
        "neonPurpleRatio": _round4(neon_purple_count / opaque_pixels),
        "neonCyanRatio": _round4(neon_cyan_count / opaque_pixels),
        "darkBgRatio": _round4(dark_bg_count / opaque_pixels),
        "highSatRatio": _round4(high_sat_count / opaque_pixels),
        "smoothHighSatRatio": _round4(smooth_high_sat_count / high_sat_count) if high_sat_count > 0 else 0,
        "neutralRatio": _round4(neutral_count / opaque_pixels),
        "quantizedColors": len(quantized),
    }


def _decode_gif_lzw(lzw_bytes: bytes, min_code_size: int, expected_len: int) -> bytearray | None:
    if min_code_size < 1 or min_code_size > 8 or expected_len <= 0:
        return None
    clear_code = 1 << min_code_size
    eoi_code = clear_code + 1
    prefixes = [-1] * 4096
    suffixes = bytearray(4096)
    first_chars = bytearray(4096)
    stack = bytearray(4096)
    out = bytearray(expected_len)

    for i in range(clear_code):
        suffixes[i] = i
        first_chars[i] = i

    code_size = min_code_size + 1
    next_code = eoi_code + 1
    prev_code = -1
    out_pos = 0
    bit_buf = 0
    bit_count = 0
    byte_pos = 0
    n_bytes = len(lzw_bytes)

    while out_pos < expected_len:
        while bit_count < code_size and byte_pos < n_bytes:
            bit_buf |= lzw_bytes[byte_pos] << bit_count
            bit_count += 8
            byte_pos += 1
        if bit_count < code_size:
            break
        code = bit_buf & ((1 << code_size) - 1)
        bit_buf >>= code_size
        bit_count -= code_size

        if code == eoi_code:
            break
        if code == clear_code:
            code_size = min_code_size + 1
            next_code = eoi_code + 1
            prev_code = -1
            continue

        in_code = code
        stack_len = 0
        if code == next_code:
            if prev_code < 0:
                break
            stack[stack_len] = first_chars[prev_code]
            stack_len += 1
            in_code = prev_code
        elif code > next_code:
            break

        walk = in_code
        while walk >= clear_code and stack_len < 4096:
            stack[stack_len] = suffixes[walk]
            stack_len += 1
            walk = prefixes[walk]
        if walk < 0 or stack_len >= 4096:
            break
        base_char = first_chars[walk]
        stack[stack_len] = base_char
        stack_len += 1

        for i in range(stack_len - 1, -1, -1):
            if out_pos >= expected_len:
                break
            out[out_pos] = stack[i]
            out_pos += 1

        if prev_code >= 0 and next_code < 4096:
            prefixes[next_code] = prev_code
            suffixes[next_code] = base_char
            first_chars[next_code] = first_chars[prev_code]
            next_code += 1
            if next_code == (1 << code_size) and code_size < 12:
                code_size += 1
        prev_code = code

    return out


def parse_image_bytes(data: bytes) -> dict[str, Any]:
    if not isinstance(data, (bytes, bytearray)) or len(data) < 12:
        raise ValueError("Invalid or truncated image buffer")
    buf = bytes(data)
    metadata_texts: list[dict[str, str]] = []
    has_c2pa = False

    # 1. PNG
    if buf[:8] == b"\x89PNG\r\n\x1a\n":
        offset = 8
        width = 0
        height = 0
        bit_depth = 0
        color_type = 0
        interlace = 0
        has_ihdr = False
        palette: list[tuple[int, int, int]] | None = None
        idat_chunks: list[bytes] = []
        idat_bytes = 0

        while offset + 12 <= len(buf):
            length = struct.unpack(">I", buf[offset : offset + 4])[0]
            ctype = buf[offset + 4 : offset + 8].decode("latin1")
            data_start = offset + 8
            data_end = data_start + length
            if data_end + 4 > len(buf):
                break
            chunk = buf[data_start:data_end]
            offset = data_end + 4

            if ctype == "IHDR" and len(chunk) >= 13:
                has_ihdr = True
                width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", chunk[:13])
            elif ctype == "PLTE":
                palette = [(chunk[i], chunk[i + 1], chunk[i + 2]) for i in range(0, len(chunk) - 2, 3)]
            elif ctype == "tEXt":
                nul = chunk.find(b"\x00")
                if nul >= 0:
                    metadata_texts.append(
                        {"key": chunk[:nul].decode("latin1"), "value": chunk[nul + 1 :].decode("latin1")}
                    )
            elif ctype == "zTXt":
                nul = chunk.find(b"\x00")
                if nul >= 0 and nul + 2 <= len(chunk) and chunk[nul + 1] == 0:
                    try:
                        val = zlib.decompress(chunk[nul + 2 :]).decode("utf-8", errors="replace")
                        metadata_texts.append({"key": chunk[:nul].decode("latin1"), "value": val})
                    except Exception:
                        pass
            elif ctype == "iTXt":
                nul1 = chunk.find(b"\x00")
                if nul1 >= 0 and nul1 + 3 <= len(chunk):
                    key = chunk[:nul1].decode("latin1")
                    comp_flag = chunk[nul1 + 1]
                    comp_method = chunk[nul1 + 2]
                    nul2 = chunk.find(b"\x00", nul1 + 3)
                    nul3 = chunk.find(b"\x00", nul2 + 1) if nul2 >= 0 else -1
                    if nul3 >= 0:
                        payload = chunk[nul3 + 1 :]
                        try:
                            if comp_flag == 1 and comp_method == 0:
                                val = zlib.decompress(payload).decode("utf-8", errors="replace")
                            else:
                                val = payload.decode("utf-8", errors="replace")
                            metadata_texts.append({"key": key, "value": val})
                        except Exception:
                            pass
            elif ctype == "eXIf":
                metadata_texts.append({"key": "exif", "value": re.sub(r"\x00+", " ", chunk.decode("latin1"))})
            elif ctype == "caBX":
                has_c2pa = True
                metadata_texts.append({"key": "c2pa", "value": re.sub(r"\x00+", " ", chunk.decode("latin1"))})
            elif ctype == "IDAT":
                idat_bytes += len(chunk)
                if idat_bytes <= 24 * 1024 * 1024:
                    idat_chunks.append(chunk)
            elif ctype == "IEND":
                break

        if not has_ihdr or width <= 0 or height <= 0:
            raise ValueError("Invalid PNG missing valid IHDR chunk")
        for m in metadata_texts:
            if re.search(r"(?:c2pa|trainedAlgorithmicMedia|jumbf)", f"{m['key']} {m['value']}", re.I):
                has_c2pa = True
        pixel_metrics = _decode_png_scanlines_and_metrics(
            idat_chunks, width, height, bit_depth, color_type, interlace, palette
        )
        return {
            "format": "png",
            "width": width,
            "height": height,
            "metadataTexts": metadata_texts,
            "hasC2pa": has_c2pa,
            "pixelMetrics": pixel_metrics,
        }

    # 2. JPEG
    if buf[:2] == b"\xff\xd8":
        pos = 2
        width = 0
        height = 0
        while pos < len(buf):
            while pos < len(buf) and buf[pos] == 0xFF:
                pos += 1
            if pos >= len(buf):
                break
            marker = buf[pos]
            pos += 1
            if marker in (0xD9, 0xDA):
                break
            if marker in (0x00, 0x01) or (0xD0 <= marker <= 0xD8):
                continue
            if pos + 2 > len(buf):
                break
            seg_len = struct.unpack(">H", buf[pos : pos + 2])[0]
            if seg_len < 2 or pos + seg_len > len(buf):
                break
            payload = buf[pos + 2 : pos + seg_len]
            pos += seg_len

            if marker in (0xC0, 0xC1, 0xC2) and len(payload) >= 5:
                height = struct.unpack(">H", payload[1:3])[0]
                width = struct.unpack(">H", payload[3:5])[0]
            elif marker == 0xE1:
                if payload.startswith(b"http://ns.adobe.com/xap/1.0/\x00"):
                    metadata_texts.append({"key": "xmp", "value": payload[29:].decode("utf-8", errors="replace")})
                elif payload.startswith(b"Exif\x00\x00"):
                    metadata_texts.append(
                        {"key": "exif", "value": re.sub(r"\x00+", " ", payload[6:].decode("latin1"))}
                    )
            elif marker == 0xEB:
                s = re.sub(r"\x00+", " ", payload.decode("latin1"))
                if re.search(r"c2pa|jumb", s, re.I):
                    has_c2pa = True
                    metadata_texts.append({"key": "c2pa", "value": s})
            elif marker == 0xFE:
                metadata_texts.append({"key": "comment", "value": payload.decode("utf-8", errors="replace")})

        for m in metadata_texts:
            if re.search(r"(?:c2pa|trainedAlgorithmicMedia|jumbf)", f"{m['key']} {m['value']}", re.I):
                has_c2pa = True
        return {
            "format": "jpeg",
            "width": width,
            "height": height,
            "metadataTexts": metadata_texts,
            "hasC2pa": has_c2pa,
            "pixelMetrics": None,
        }

    # 3. WebP
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        pos = 12
        width = 0
        height = 0
        while pos + 8 <= len(buf):
            fourcc = buf[pos : pos + 4].decode("ascii", errors="replace")
            size = struct.unpack("<I", buf[pos + 4 : pos + 8])[0]
            data_start = pos + 8
            if data_start + size > len(buf):
                break
            chunk = buf[data_start : data_start + size]
            pos = data_start + size + (size % 2)

            if fourcc == "VP8 " and len(chunk) >= 10 and chunk[3:6] == b"\x9d\x01\x2a":
                width = struct.unpack("<H", chunk[6:8])[0] & 0x3FFF
                height = struct.unpack("<H", chunk[8:10])[0] & 0x3FFF
            elif fourcc == "VP8L" and len(chunk) >= 5 and chunk[0] == 0x2F:
                bits = struct.unpack("<I", chunk[1:5])[0]
                width = (bits & 0x3FFF) + 1
                height = ((bits >> 14) & 0x3FFF) + 1
            elif fourcc == "VP8X" and len(chunk) >= 10:
                width = (chunk[4] | (chunk[5] << 8) | (chunk[6] << 16)) + 1
                height = (chunk[7] | (chunk[8] << 8) | (chunk[9] << 16)) + 1
            elif fourcc == "EXIF":
                metadata_texts.append({"key": "exif", "value": re.sub(r"\x00+", " ", chunk.decode("latin1"))})
            elif fourcc == "XMP ":
                metadata_texts.append({"key": "xmp", "value": chunk.decode("utf-8", errors="replace")})

        if width <= 0 or height <= 0:
            raise ValueError("Invalid WebP missing dimension chunk")
        for m in metadata_texts:
            if re.search(r"(?:c2pa|trainedAlgorithmicMedia|jumbf)", f"{m['key']} {m['value']}", re.I):
                has_c2pa = True
        return {
            "format": "webp",
            "width": width,
            "height": height,
            "metadataTexts": metadata_texts,
            "hasC2pa": has_c2pa,
            "pixelMetrics": None,
        }

    # 4. GIF (GIF87a / GIF89a)
    gif_sig = buf[:6].decode("ascii", errors="replace")
    if gif_sig in ("GIF87a", "GIF89a") and len(buf) >= 13:
        width, height = struct.unpack("<HH", buf[6:10])
        if width <= 0 or height <= 0:
            raise ValueError("Invalid GIF missing valid screen dimensions")
        packed = buf[10]
        has_gct = (packed & 0x80) != 0
        gct_size = (1 << ((packed & 0x07) + 1)) if has_gct else 0
        pos = 13
        gct: list[tuple[int, int, int]] | None = None
        if has_gct:
            if pos + gct_size * 3 > len(buf):
                raise ValueError("Truncated GIF global color table")
            gct = [(buf[pos + i * 3], buf[pos + i * 3 + 1], buf[pos + i * 3 + 2]) for i in range(gct_size)]
            pos += gct_size * 3

        transparent_idx = -1
        frame0_decoded = False
        pixel_metrics = None

        while pos < len(buf):
            block_id = buf[pos]
            pos += 1
            if block_id == 0x3B:
                break
            if block_id == 0x21:
                if pos >= len(buf):
                    break
                label = buf[pos]
                pos += 1
                chunks = []
                while pos < len(buf):
                    sz = buf[pos]
                    pos += 1
                    if sz == 0:
                        break
                    end = min(len(buf), pos + sz)
                    chunks.append(buf[pos:end])
                    pos = end
                payload = b"".join(chunks)
                if label == 0xF9 and len(payload) >= 4 and not frame0_decoded:
                    transparent_idx = payload[3] if (payload[0] & 0x01) != 0 else -1
                elif label == 0xFE and payload:
                    metadata_texts.append({"key": "comment", "value": payload.decode("utf-8", errors="replace")})
                elif label == 0xFF and len(payload) >= 11:
                    app_id = payload[:11].decode("latin1")
                    if app_id not in ("NETSCAPE2.0", "ANIMEXTS1.0"):
                        text = re.sub(r"\x00+", " ", payload[11:].decode("utf-8", errors="replace")).strip()
                        if text:
                            if re.search(r"xmp", app_id, re.I):
                                key = "xmp"
                            elif re.search(r"c2pa|jumb", app_id + text, re.I):
                                key = "c2pa"
                            else:
                                key = "app"
                            metadata_texts.append({"key": key, "value": text})
            elif block_id == 0x2C:
                if pos + 9 > len(buf):
                    break
                left, top, img_w, img_h, img_packed = struct.unpack("<HHHHB", buf[pos : pos + 9])
                pos += 9
                has_lct = (img_packed & 0x80) != 0
                interlaced = (img_packed & 0x40) != 0
                lct_size = (1 << ((img_packed & 0x07) + 1)) if has_lct else 0
                palette = gct
                if has_lct:
                    if pos + lct_size * 3 > len(buf):
                        break
                    palette = [(buf[pos + i * 3], buf[pos + i * 3 + 1], buf[pos + i * 3 + 2]) for i in range(lct_size)]
                    pos += lct_size * 3
                if pos >= len(buf):
                    break
                min_code_size = buf[pos]
                pos += 1
                data_chunks = []
                while pos < len(buf):
                    sz = buf[pos]
                    pos += 1
                    if sz == 0:
                        break
                    end = min(len(buf), pos + sz)
                    if not frame0_decoded:
                        data_chunks.append(buf[pos:end])
                    pos = end

                if not frame0_decoded:
                    frame0_decoded = True
                    if palette and img_w > 0 and img_h > 0 and width * height <= _MAX_PNG_PIXELS:
                        indices = _decode_gif_lzw(b"".join(data_chunks), min_code_size, img_w * img_h)
                        if indices is not None:
                            row_map = [0] * img_h
                            if interlaced:
                                src_row = 0
                                for start, step in ((0, 8), (4, 8), (2, 4), (1, 2)):
                                    for y in range(start, img_h, step):
                                        row_map[y] = src_row
                                        src_row += 1
                            else:
                                for y in range(img_h):
                                    row_map[y] = y
                            rgba = bytearray(width * height * 4)
                            bg_rgb = gct[0] if gct else (0, 0, 0)
                            if transparent_idx == -1:
                                for i in range(width * height):
                                    off = i * 4
                                    rgba[off] = bg_rgb[0]
                                    rgba[off + 1] = bg_rgb[1]
                                    rgba[off + 2] = bg_rgb[2]
                                    rgba[off + 3] = 255
                            for iy in range(img_h):
                                cy = top + iy
                                if cy < 0 or cy >= height:
                                    continue
                                src_off = row_map[iy] * img_w
                                for ix in range(img_w):
                                    cx = left + ix
                                    if cx < 0 or cx >= width:
                                        continue
                                    c_idx = indices[src_off + ix]
                                    if c_idx == transparent_idx:
                                        continue
                                    rgb = palette[c_idx] if c_idx < len(palette) else (0, 0, 0)
                                    dst = (cy * width + cx) * 4
                                    rgba[dst] = rgb[0]
                                    rgba[dst + 1] = rgb[1]
                                    rgba[dst + 2] = rgb[2]
                                    rgba[dst + 3] = 255
                            pixel_metrics = _compute_pixel_metrics(
                                width,
                                height,
                                lambda x, y: (
                                    rgba[(y * width + x) * 4],
                                    rgba[(y * width + x) * 4 + 1],
                                    rgba[(y * width + x) * 4 + 2],
                                    rgba[(y * width + x) * 4 + 3],
                                ),
                            )
            else:
                break

        for m in metadata_texts:
            if re.search(r"(?:c2pa|trainedAlgorithmicMedia|jumbf)", f"{m['key']} {m['value']}", re.I):
                has_c2pa = True
        return {
            "format": "gif",
            "width": width,
            "height": height,
            "metadataTexts": metadata_texts,
            "hasC2pa": has_c2pa,
            "pixelMetrics": pixel_metrics,
        }

    raise ValueError("Unsupported or corrupted image header (expected PNG, JPEG, WebP, or GIF)")


def _safe_pdf_float(tok: str) -> float | None:
    try:
        v = float(tok)
        return v if math.isfinite(v) else None
    except ValueError:
        return None


def _decode_utf16be_hex(hex_raw: str) -> str:
    clean = re.sub(r"[^0-9a-fA-F]", "", hex_raw)
    if not clean:
        return ""
    padded = clean + "0" if len(clean) % 2 == 1 else clean
    start = 4 if padded.lower().startswith("feff") and len(padded) >= 4 else 0
    out: list[str] = []
    i = start
    n = len(padded)
    while i + 3 < n:
        code = int(padded[i : i + 4], 16)
        if code == 0:
            i += 4
            continue
        if 0xD800 <= code <= 0xDBFF:
            if i + 7 < n:
                low = int(padded[i + 4 : i + 8], 16)
                if 0xDC00 <= low <= 0xDFFF:
                    cp = 0x10000 + (((code - 0xD800) << 10) | (low - 0xDC00))
                    out.append(chr(cp))
                    i += 8
                    continue
            i += 4
            continue
        if 0xDC00 <= code <= 0xDFFF:
            i += 4
            continue
        out.append(chr(code))
        i += 4
    return "".join(out)


def _decode_pdf_literal_string(raw: str) -> str:
    out: list[str] = []
    i = 0
    n = len(raw)
    while i < n:
        ch = raw[i]
        if ch != "\\":
            out.append(ch)
            i += 1
            continue
        i += 1
        if i >= n:
            break
        esc = raw[i]
        if esc == "n":
            out.append("\n")
        elif esc == "r":
            out.append("\r")
        elif esc == "t":
            out.append("\t")
        elif esc == "b":
            out.append("\b")
        elif esc == "f":
            out.append("\f")
        elif esc in ("(", ")", "\\"):
            out.append(esc)
        elif esc == "\r" and i + 1 < n and raw[i + 1] == "\n":
            i += 1
        elif esc in ("\n", "\r"):
            pass
        elif "0" <= esc <= "7":
            oct_m = re.match(r"^[0-7]{1,3}", raw[i : i + 3])
            if oct_m:
                out.append(chr(int(oct_m.group(0), 8)))
                i += len(oct_m.group(0)) - 1
        else:
            out.append(esc)
        i += 1
    return "".join(out)


def _decode_pdf_unicode_literal(raw: str) -> str:
    bytes_str = _decode_pdf_literal_string(raw)
    if len(bytes_str) >= 4 and ord(bytes_str[0]) == 0xFE and ord(bytes_str[1]) == 0xFF:
        hex_str = "".join(f"{ord(ch) & 0xFF:02x}" for ch in bytes_str[2:])
        return _decode_utf16be_hex(hex_str)
    return bytes_str


def _decode_pdf_hex_string(hex_raw: str) -> str:
    clean = re.sub(r"[^0-9a-fA-F]", "", hex_raw)
    if not clean:
        return ""
    padded = clean + "0" if len(clean) % 2 == 1 else clean
    if padded.lower().startswith("feff") and len(padded) >= 8:
        return _decode_utf16be_hex(padded)
    out: list[str] = []
    for i in range(0, len(padded) - 1, 2):
        code = int(padded[i : i + 2], 16)
        if 0x20 <= code <= 0x7E:
            out.append(chr(code))
        elif code in (0x0A, 0x0D, 0x09):
            out.append(" ")
    return "".join(out)


_AGL_GLYPH_MAP: dict[str, str] = {
    "space": " ", "exclam": "!", "quotedbl": '"', "numbersign": "#", "dollar": "$", "percent": "%",
    "ampersand": "&", "quotesingle": "'", "parenleft": "(", "parenright": ")", "asterisk": "*", "plus": "+",
    "comma": ",", "hyphen": "-", "period": ".", "slash": "/", "zero": "0", "one": "1", "two": "2",
    "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "colon": ":", "semicolon": ";", "less": "<", "equal": "=", "greater": ">", "question": "?", "at": "@",
    "bracketleft": "[", "backslash": "\\", "bracketright": "]", "underscore": "_", "braceleft": "{",
    "bar": "|", "braceright": "}", "asciitilde": "~", "endash": "–", "emdash": "—", "bullet": "•",
}


def _parse_tounicode_cmap(cmap_text: str) -> dict[str, Any]:
    cmap: dict[str, str] = {}
    ranges: list[dict[str, Any]] = []
    codespaces: list[tuple[int, int, int]] = []
    len_set: set[int] = set()
    if not cmap_text:
        return {"map": cmap, "ranges": ranges, "codespaces": codespaces, "byteLens": []}

    for sec in re.finditer(r"begincodespacerange\b([\s\S]*?)endcodespacerange", cmap_text):
        for pm in re.finditer(r"<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>", sec.group(1)):
            s_hx, e_hx = pm.group(1).lower(), pm.group(2).lower()
            if len(s_hx) == len(e_hx) and len(s_hx) >= 2 and len(s_hx) % 2 == 0:
                b_len = len(s_hx) // 2
                codespaces.append((b_len, int(s_hx, 16), int(e_hx, 16)))
                len_set.add(b_len)

    for sec in re.finditer(r"beginbfchar\b([\s\S]*?)endbfchar", cmap_text):
        for pm in re.finditer(r"<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>", sec.group(1)):
            src = pm.group(1).lower()
            dst = _decode_utf16be_hex(pm.group(2))
            if len(src) >= 2 and len(src) % 2 == 0 and dst:
                cmap[src] = dst
                len_set.add(len(src) // 2)

    for sec in re.finditer(r"beginbfrange\b([\s\S]*?)endbfrange", cmap_text):
        body = sec.group(1)
        for rm in re.finditer(r"<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:\[([\s\S]*?)\]|<([0-9a-fA-F]+)>)", body):
            start_hex = rm.group(1).lower()
            end_hex = rm.group(2).lower()
            if len(start_hex) != len(end_hex) or len(start_hex) % 2 != 0:
                continue
            start_code = int(start_hex, 16)
            end_code = int(end_hex, 16)
            if end_code < start_code:
                continue
            b_len = len(start_hex) // 2
            len_set.add(b_len)
            if rm.group(3) is not None:
                items = [_decode_utf16be_hex(m_i.group(1)) for m_i in re.finditer(r"<([0-9a-fA-F]+)>", rm.group(3))]
                ranges.append({"startCode": start_code, "endCode": end_code, "byteLen": b_len, "items": items, "prefixHex": None, "baseLastUnit": 0})
            elif rm.group(4) is not None:
                dst_base_hex = rm.group(4)
                if len(dst_base_hex) < 4:
                    continue
                ranges.append({
                    "startCode": start_code,
                    "endCode": end_code,
                    "byteLen": b_len,
                    "items": None,
                    "prefixHex": dst_base_hex[:-4],
                    "baseLastUnit": int(dst_base_hex[-4:], 16),
                })

    return {"map": cmap, "ranges": ranges, "codespaces": codespaces, "byteLens": sorted(len_set, reverse=True)}


def _glyph_name_to_char(raw_name: str) -> str:
    if not raw_name:
        return ""
    name = re.sub(r"#([0-9a-fA-F]{2})", lambda m: chr(int(m.group(1), 16)), raw_name)
    if name in _AGL_GLYPH_MAP:
        return _AGL_GLYPH_MAP[name]
    if len(name) == 1 and name.isascii() and name.isalnum():
        return name
    uni = re.match(r"^uni((?:[0-9a-fA-F]{4})+)$", name)
    if uni:
        return _decode_utf16be_hex(uni.group(1))
    uhex = re.match(r"^u([0-9a-fA-F]{4,6})$", name)
    if uhex:
        cp = int(uhex.group(1), 16)
        return chr(cp) if 0 < cp <= 0x10FFFF else ""
    return ""


def _parse_encoding_differences(font_dict_raw: str, objects: dict[int, dict[str, Any]]) -> dict[int, str] | None:
    enc_dict = ""
    ref_m = re.search(r"/Encoding\s+(\d+)\s+\d+\s+R", font_dict_raw)
    if ref_m and int(ref_m.group(1)) in objects:
        enc_dict = objects[int(ref_m.group(1))].get("dictRaw", "")
    else:
        inline_m = re.search(r"/Encoding\s*<<([\s\S]*?)>>", font_dict_raw)
        if inline_m:
            enc_dict = inline_m.group(1)
    if not enc_dict:
        return None
    diff_m = re.search(r"/Differences\s*\[([\s\S]*?)\]", enc_dict)
    if not diff_m:
        return None
    diff_map: dict[int, str] = {}
    cur_code = 0
    for tok in re.finditer(r"(\d+)|/([^\s\x00/[\]()<>]+)", diff_m.group(1)):
        if tok.group(1) is not None:
            cur_code = int(tok.group(1))
        elif tok.group(2) is not None:
            ch = _glyph_name_to_char(tok.group(2))
            if ch:
                diff_map[cur_code] = ch
            cur_code += 1
    return diff_map if diff_map else None


def _lookup_range_cmap(ranges: list[dict[str, Any]], code: int, byte_len: int) -> str:
    for r in ranges:
        if r["byteLen"] != byte_len or code < r["startCode"] or code > r["endCode"]:
            continue
        offset = code - r["startCode"]
        if r["items"] is not None:
            return r["items"][offset] if offset < len(r["items"]) else ""
        unit_hex = f"{(r['baseLastUnit'] + offset) & 0xFFFF:04x}"
        return _decode_utf16be_hex(r["prefixHex"] + unit_hex)
    return ""


def _decode_hex_via_tounicode(hex_lower: str, to_unicode: dict[str, Any]) -> str:
    out: list[str] = []
    pos = 0
    codespaces = to_unicode.get("codespaces") or []
    byte_lens = to_unicode.get("byteLens") or [1]
    cmap = to_unicode["map"]
    ranges = to_unicode.get("ranges") or []
    step_min = (byte_lens[-1] or 1) * 2
    while pos < len(hex_lower):
        if codespaces:
            cs_matched = False
            for b_len, cs_start, cs_end in codespaces:
                h_len = b_len * 2
                if pos + h_len <= len(hex_lower):
                    key = hex_lower[pos : pos + h_len]
                    code_val = int(key, 16)
                    if cs_start <= code_val <= cs_end:
                        if key in cmap:
                            out.append(cmap[key])
                        elif ranges:
                            out.append(_lookup_range_cmap(ranges, code_val, b_len))
                        pos += h_len
                        cs_matched = True
                        break
            if cs_matched:
                continue

        matched = False
        for b_len in byte_lens:
            h_len = b_len * 2
            if pos + h_len <= len(hex_lower):
                key = hex_lower[pos : pos + h_len]
                if key in cmap:
                    out.append(cmap[key])
                    pos += h_len
                    matched = True
                    break
                if ranges:
                    r_val = _lookup_range_cmap(ranges, int(key, 16), b_len)
                    if r_val:
                        out.append(r_val)
                        pos += h_len
                        matched = True
                        break
        if not matched:
            pos += step_min
    return "".join(out)


def _decode_pdf_hex_with_font(hex_raw: str, font_entry: dict[str, Any] | None) -> str:
    clean = re.sub(r"[^0-9a-fA-F]", "", hex_raw)
    if not clean:
        return ""
    padded = (clean + "0" if len(clean) % 2 == 1 else clean).lower()
    if padded.startswith("feff") and len(padded) >= 8:
        return _decode_utf16be_hex(padded)
    if font_entry and font_entry.get("toUnicode") and (font_entry["toUnicode"]["map"] or font_entry["toUnicode"].get("ranges")):
        return _decode_hex_via_tounicode(padded, font_entry["toUnicode"])
    if font_entry and font_entry.get("differences"):
        diffs = font_entry["differences"]
        is_custom = font_entry.get("isCustomGlyph", False)
        out: list[str] = []
        for i in range(0, len(padded) - 1, 2):
            code = int(padded[i : i + 2], 16)
            if code in diffs:
                out.append(diffs[code])
            elif not is_custom and 0x20 <= code <= 0x7E:
                out.append(chr(code))
        return "".join(out)
    if font_entry and font_entry.get("isCustomGlyph"):
        return ""
    return _decode_pdf_hex_string(hex_raw)


def _decode_pdf_literal_with_font(raw: str, font_entry: dict[str, Any] | None) -> str:
    bytes_str = _decode_pdf_literal_string(raw)
    if len(bytes_str) >= 4 and ord(bytes_str[0]) == 0xFE and ord(bytes_str[1]) == 0xFF:
        return _decode_pdf_unicode_literal(raw)
    if font_entry and font_entry.get("toUnicode") and (font_entry["toUnicode"]["map"] or font_entry["toUnicode"].get("ranges")):
        hex_str = "".join(f"{ord(ch) & 0xFF:02x}" for ch in bytes_str)
        return _decode_hex_via_tounicode(hex_str, font_entry["toUnicode"])
    if font_entry and font_entry.get("differences"):
        diffs = font_entry["differences"]
        is_custom = font_entry.get("isCustomGlyph", False)
        out: list[str] = []
        for ch in bytes_str:
            code = ord(ch) & 0xFF
            if code in diffs:
                out.append(diffs[code])
            elif not is_custom and 0x20 <= code <= 0x7E:
                out.append(chr(code))
        return "".join(out)
    if font_entry and font_entry.get("isCustomGlyph"):
        return ""
    return bytes_str


def _read_pdf_literal_at(src: str, open_idx: int) -> tuple[str, int]:
    depth = 1
    i = open_idx + 1
    n = len(src)
    while i < n and depth > 0:
        ch = src[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        i += 1
    return src[open_idx + 1 : max(open_idx + 1, i - 1)], i


def _parse_mediabox_rect(dict_text: str) -> tuple[float, float] | None:
    m = re.search(r"/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]", dict_text)
    if not m:
        return None
    v1, v2, v3, v4 = (_safe_pdf_float(m.group(k)) for k in (1, 2, 3, 4))
    if v1 is None or v2 is None or v3 is None or v4 is None:
        return None
    w = abs(v3 - v1)
    h = abs(v4 - v2)
    if not (w > 0 and h > 0):
        return None
    return (w, h)


def _extract_pdf_objects(buf: bytes) -> tuple[str, dict[int, dict[str, Any]], bool]:
    latin = buf.decode("latin1")
    objects: dict[int, dict[str, Any]] = {}
    obj_re = re.compile(r"(\d+)\s+(\d+)\s+obj\b")
    pos = 0
    while True:
        m = obj_re.search(latin, pos)
        if not m:
            break
        obj_num = int(m.group(1))
        body_start = m.end()
        end_obj_idx = latin.find("endobj", body_start)
        if end_obj_idx == -1:
            break
        stream_tag_idx = latin.find("stream", body_start, end_obj_idx)
        dict_part = ""
        stream_bytes: bytes | None = None
        next_pos = end_obj_idx + 6

        if stream_tag_idx != -1:
            dict_part = latin[body_start:stream_tag_idx]
            s_start = stream_tag_idx + 6
            if latin[s_start : s_start + 2] == "\r\n":
                s_start += 2
            elif latin[s_start : s_start + 1] in ("\n", "\r"):
                s_start += 1
            len_m = re.search(r"/Length\s+(\d+)\b(?!\s+\d+\s+R)", dict_part)
            s_end = -1
            if len_m:
                cand_end = s_start + int(len_m.group(1))
                if cand_end <= len(buf):
                    s_end = cand_end
                    after_stream = latin.find("endstream", s_end)
                    real_end_obj = latin.find("endobj", after_stream) if after_stream != -1 else -1
                    if real_end_obj != -1:
                        next_pos = real_end_obj + 6
            if s_end == -1:
                end_stream_idx = latin.find("endstream", s_start)
                if end_stream_idx != -1:
                    s_end = end_stream_idx
                    if s_end > s_start and latin[s_end - 1] == "\n":
                        s_end -= 1
                    if s_end > s_start and latin[s_end - 1] == "\r":
                        s_end -= 1
                    real_end_obj = latin.find("endobj", end_stream_idx)
                    if real_end_obj != -1:
                        next_pos = real_end_obj + 6
            if s_end >= s_start:
                stream_bytes = buf[s_start:s_end]
        else:
            dict_part = latin[body_start:end_obj_idx]

        objects[obj_num] = {"objNum": obj_num, "dictRaw": dict_part, "streamBytes": stream_bytes}
        pos = next_pos

    has_compressed_streams = False
    for obj in list(objects.values()):
        if obj["streamBytes"] is not None and re.search(r"/FlateDecode\b", obj["dictRaw"]):
            has_compressed_streams = True
        if obj["streamBytes"] is None or not re.search(r"/Type\s*/ObjStm\b", obj["dictRaw"]):
            continue
        n_m = re.search(r"/N\s+(\d+)", obj["dictRaw"])
        first_m = re.search(r"/First\s+(\d+)", obj["dictRaw"])
        if not n_m or not first_m:
            continue
        count = int(n_m.group(1))
        first = int(first_m.group(1))
        stream_text = _decode_pdf_object_stream(obj)
        if not stream_text or first <= 0 or first > len(stream_text) or count <= 0:
            continue
        header_nums = re.findall(r"\d+", stream_text[:first])
        pairs: list[tuple[int, int]] = []
        k = 0
        while k + 1 < len(header_nums) and len(pairs) < count:
            pairs.append((int(header_nums[k]), first + int(header_nums[k + 1])))
            k += 2
        sorted_starts = sorted(pairs, key=lambda x: x[1])
        for idx_s, (o_num, abs_start) in enumerate(sorted_starts):
            if abs_start < first or abs_start >= len(stream_text):
                continue
            next_start = sorted_starts[idx_s + 1][1] if idx_s + 1 < len(sorted_starts) else len(stream_text)
            body = stream_text[abs_start : max(abs_start, min(len(stream_text), next_start))].strip()
            if o_num not in objects and body:
                objects[o_num] = {"objNum": o_num, "dictRaw": body, "streamBytes": None, "fromObjStm": True}

    return latin, objects, has_compressed_streams


def _decode_pdf_object_stream(obj: dict[str, Any] | None) -> str:
    if not obj or obj.get("streamBytes") is None:
        return ""
    raw_bytes = obj["streamBytes"]
    if re.search(r"/FlateDecode\b", obj["dictRaw"]):
        try:
            decomp = zlib.decompressobj()
            raw_bytes = decomp.decompress(raw_bytes, _MAX_STREAM_UNCOMPRESSED_BYTES + 1)
            if len(raw_bytes) > _MAX_STREAM_UNCOMPRESSED_BYTES:
                return ""
        except Exception:
            return ""
    return raw_bytes.decode("latin1")


def _collect_pdf_rgb_stops(dict_text: str, out_colors: list[list[int]]) -> None:
    for m in re.finditer(r"/C[01]\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]", dict_text):
        r_v, g_v, b_v = _safe_pdf_float(m.group(1)), _safe_pdf_float(m.group(2)), _safe_pdf_float(m.group(3))
        if r_v is None or g_v is None or b_v is None:
            continue
        r = min(255, max(0, int(r_v * 255.0 + 0.5)))
        g = min(255, max(0, int(g_v * 255.0 + 0.5)))
        b = min(255, max(0, int(b_v * 255.0 + 0.5)))
        out_colors.append([r, g, b])


def _read_pdf_dict_at(src: str, open_idx: int) -> tuple[str, int]:
    depth = 1
    j = open_idx + 2
    n = len(src)
    while j < n and depth > 0:
        if src[j] == "(":
            _, j = _read_pdf_literal_at(src, j)
            continue
        if src[j] == "<" and j + 1 < n and src[j + 1] == "<":
            depth += 1
            j += 2
            continue
        if src[j] == "<":
            close = src.find(">", j + 1)
            j = close + 1 if close != -1 else j + 1
            continue
        if src[j] == ">" and j + 1 < n and src[j + 1] == ">":
            depth -= 1
            j += 2
            continue
        j += 1
    return src[open_idx:j], j


def _extract_actual_text_from_prop_dict(dict_raw: str) -> str | None:
    m = re.search(r"/ActualText(?=\s|[<(])", dict_raw)
    if not m:
        return None
    j = m.end()
    while j < len(dict_raw) and dict_raw[j].isspace():
        j += 1
    if j < len(dict_raw) and dict_raw[j] == "<" and dict_raw[j + 1 : j + 2] != "<":
        close = dict_raw.find(">", j + 1)
        if close != -1:
            hex_s = re.sub(r"\s+", "", dict_raw[j + 1 : close])
            if hex_s.lower().startswith("feff"):
                return _decode_utf16be_hex(hex_s)
            return _decode_pdf_hex_string(hex_s)
    elif j < len(dict_raw) and dict_raw[j] == "(":
        raw_lit, _ = _read_pdf_literal_at(dict_raw, j)
        return _decode_pdf_unicode_literal(raw_lit)
    return None


_PDF_WS = {" ", "\n", "\r", "\t", "\f", "\x00"}
_PDF_DELIM = _PDF_WS | {"/", "[", "]", "(", ")", "<", ">", "{", "}", "%"}


def _read_pdf_op_at(src: str, pos: int) -> tuple[str, int]:
    n = len(src)
    p = pos
    while p < n and src[p] in _PDF_WS:
        p += 1
    end = p
    while end < n and src[end] not in _PDF_DELIM:
        end += 1
    return src[p:end], end


def _strip_inline_images_linear(stream_text: str) -> tuple[str, int]:
    image_count = 0
    out: list[str] = []
    pos = 0
    n = len(stream_text)
    while pos < n:
        bi_idx = stream_text.find("BI", pos)
        if bi_idx == -1:
            out.append(stream_text[pos:])
            break
        prev_ok = bi_idx == 0 or stream_text[bi_idx - 1] in _PDF_DELIM
        next_ok = bi_idx + 2 < n and stream_text[bi_idx + 2] in _PDF_WS
        if not prev_ok or not next_ok:
            out.append(stream_text[pos : bi_idx + 2])
            pos = bi_idx + 2
            continue
        id_idx = stream_text.find("ID", bi_idx + 3)
        if id_idx == -1 or not (stream_text[id_idx - 1] in _PDF_WS and id_idx + 2 < n and stream_text[id_idx + 2] in _PDF_WS):
            out.append(stream_text[pos : bi_idx + 2])
            pos = bi_idx + 2
            continue
        search_from = id_idx + 3
        ei_idx = -1
        while search_from < n:
            cand = stream_text.find("EI", search_from)
            if cand == -1:
                break
            after_ok = cand + 2 >= n or stream_text[cand + 2] in _PDF_DELIM
            if stream_text[cand - 1] in _PDF_WS and after_ok:
                ei_idx = cand
                break
            search_from = cand + 2
        if ei_idx == -1:
            out.append(stream_text[pos : bi_idx + 2])
            pos = bi_idx + 2
            continue
        out.append(stream_text[pos:bi_idx])
        out.append(" ")
        image_count += 1
        pos = ei_idx + 2
    return "".join(out), image_count


def _parse_pdf_content_stream(
    stream_text: str,
    image_xobj_names: set[str],
    font_map: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    fmap = font_map or {}
    font_sizes: list[float] = []
    rgb_colors: list[list[int]] = []
    text_op_count = 0
    text_parts: list[str] = []

    cleaned, image_count = _strip_inline_images_linear(stream_text)

    for m in re.finditer(
        r"(?:^|[\s\]>])(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(?:rg|RG)\b",
        cleaned,
    ):
        r_v, g_v, b_v = _safe_pdf_float(m.group(1)), _safe_pdf_float(m.group(2)), _safe_pdf_float(m.group(3))
        if r_v is not None and g_v is not None and b_v is not None:
            rgb_colors.append([int(r_v * 255.0 + 0.5), int(g_v * 255.0 + 0.5), int(b_v * 255.0 + 0.5)])

    for m in re.finditer(r"/([A-Za-z0-9_+.-]+)\s+Do\b", cleaned):
        if m.group(1) in image_xobj_names:
            image_count += 1

    i = 0
    n = len(cleaned)
    current_line = ""
    active_font: dict[str, Any] | None = None
    raw_font_size = 0.0
    last_name: str | None = None
    cur_y: float | None = None
    tm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    no_array_close = False
    num_stack: list[float] = []
    mc_stack: list[dict[str, Any]] = []
    actual_text_depth = 0

    def flush_line() -> None:
        nonlocal current_line
        t = current_line.strip()
        if t:
            text_parts.append(t)
        current_line = ""

    def record_eff_font_size() -> None:
        if not (raw_font_size > 0):
            return
        scale_y = math.hypot(tm[2], tm[3])
        eff = abs(raw_font_size) * (scale_y if scale_y > 0 else 1.0)
        rounded = int(eff * 100.0 + 0.5) / 100.0
        if 0.05 <= rounded <= 300.0:
            font_sizes.append(rounded)

    def emit_chunk(s: str) -> None:
        nonlocal text_op_count, current_line
        if not s:
            return
        if s.strip():
            text_op_count += 1
        current_line += s

    while i < n:
        ch = cleaned[i]
        if ch in _PDF_WS:
            i += 1
            continue
        if ch == "%":
            nl = cleaned.find("\n", i)
            i = n if nl == -1 else nl + 1
            continue
        if ch == "(":
            raw, end_idx = _read_pdf_literal_at(cleaned, i)
            op, after_op = _read_pdf_op_at(cleaned, end_idx)
            if op in ("Tj", "'", '"'):
                record_eff_font_size()
                if actual_text_depth == 0:
                    if op in ("'", '"'):
                        flush_line()
                    emit_chunk(_decode_pdf_literal_with_font(raw, active_font))
                i = after_op
                num_stack.clear()
                continue
            i = end_idx
            continue
        if ch == "<" and cleaned[i + 1 : i + 2] == "<":
            dict_raw, end_idx = _read_pdf_dict_at(cleaned, i)
            op, after_op = _read_pdf_op_at(cleaned, end_idx)
            if op == "BDC":
                actual = _extract_actual_text_from_prop_dict(dict_raw)
                if actual is not None:
                    if mc_stack:
                        mc_stack[-1]["hasChildActual"] = True
                    mc_stack.append({"actualText": actual, "hasChildActual": False})
                    actual_text_depth += 1
                else:
                    mc_stack.append({"actualText": None, "hasChildActual": False})
                i = after_op
                num_stack.clear()
                continue
            i = end_idx
            continue
        if ch == "<" and cleaned[i + 1 : i + 2] != "<":
            close_idx = cleaned.find(">", i + 1)
            if close_idx != -1:
                op, after_op = _read_pdf_op_at(cleaned, close_idx + 1)
                if op in ("Tj", "'", '"'):
                    record_eff_font_size()
                    if actual_text_depth == 0:
                        if op in ("'", '"'):
                            flush_line()
                        emit_chunk(_decode_pdf_hex_with_font(cleaned[i + 1 : close_idx], active_font))
                    i = after_op
                    num_stack.clear()
                    continue
                i = close_idx + 1
                continue
        if ch == "[":
            if no_array_close:
                i += 1
                continue
            j = i + 1
            seg = ""
            valid = False
            pending_space = False
            saw_num = False
            cur_num_str = ""

            def flush_kern() -> None:
                nonlocal pending_space, saw_num, cur_num_str
                if cur_num_str:
                    kv = _safe_pdf_float(cur_num_str)
                    if kv is not None and kv <= -200.0 and seg and not seg[-1].isspace():
                        pending_space = True
                    cur_num_str = ""
                saw_num = False

            while j < n:
                cj = cleaned[j]
                if cj == "(":
                    flush_kern()
                    lit_raw, lit_end = _read_pdf_literal_at(cleaned, j)
                    if actual_text_depth == 0:
                        dec = _decode_pdf_literal_with_font(lit_raw, active_font)
                        if dec:
                            if pending_space and not dec[0].isspace():
                                seg += " "
                            pending_space = False
                            seg += dec
                    j = lit_end
                    continue
                if cj == "<" and cleaned[j + 1 : j + 2] != "<":
                    flush_kern()
                    c2 = cleaned.find(">", j + 1)
                    if c2 != -1:
                        if actual_text_depth == 0:
                            dec = _decode_pdf_hex_with_font(cleaned[j + 1 : c2], active_font)
                            if dec:
                                if pending_space and not dec[0].isspace():
                                    seg += " "
                                pending_space = False
                                seg += dec
                        j = c2 + 1
                        continue
                if cj == "]":
                    flush_kern()
                    op, after_op = _read_pdf_op_at(cleaned, j + 1)
                    if op == "TJ":
                        valid = True
                        j = after_op
                    else:
                        j += 1
                    break
                if cj == "[" or j - i > 262144:
                    break
                if ("0" <= cj <= "9") or cj in "-+.":
                    cur_num_str += cj
                    saw_num = True
                elif saw_num:
                    flush_kern()
                j += 1
            if j >= n and not valid:
                no_array_close = True
            if valid:
                record_eff_font_size()
                if actual_text_depth == 0:
                    emit_chunk(seg)
                i = j
                num_stack.clear()
                continue
        if ch == "/":
            j = i + 1
            while j < n and cleaned[j] not in _PDF_DELIM:
                j += 1
            last_name = cleaned[i + 1 : j]
            i = j
            continue
        end_tok = i
        while end_tok < n and cleaned[end_tok] not in _PDF_DELIM:
            end_tok += 1
        tok = cleaned[i:end_tok]
        num_val = _safe_pdf_float(tok) if re.match(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$", tok) else None
        if num_val is not None:
            num_stack.append(num_val)
            if len(num_stack) > 8:
                num_stack.pop(0)
        else:
            if tok == "Tf":
                active_font = fmap.get(last_name or "") if last_name else None
                if num_stack:
                    raw_font_size = abs(num_stack[-1])
            elif tok == "BT":
                cur_y = None
                tm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
            elif tok == "ET":
                flush_line()
                cur_y = None
            elif tok == "T*":
                flush_line()
            elif tok in ("Td", "TD"):
                tx = num_stack[-2] if len(num_stack) >= 2 else 0.0
                ty = num_stack[-1] if len(num_stack) >= 2 else 0.0
                tm[4] += tx
                tm[5] += ty
                if abs(ty) > 2.0:
                    flush_line()
                cur_y = (cur_y or 0.0) + ty
            elif tok == "Tm":
                if len(num_stack) >= 6:
                    vals = list(num_stack[-6:])
                    f = vals[5]
                    if cur_y is not None and abs(f - cur_y) > 2.0:
                        flush_line()
                    cur_y = f
                    tm = vals
            elif tok in ("BMC", "BDC"):
                mc_stack.append({"actualText": None, "hasChildActual": False})
            elif tok == "EMC":
                if mc_stack:
                    frame = mc_stack.pop()
                    if frame.get("actualText") is not None:
                        actual_text_depth = max(0, actual_text_depth - 1)
                        if not frame.get("hasChildActual") and actual_text_depth == 0:
                            emit_chunk(frame["actualText"])
            num_stack.clear()
        i = i + 1 if end_tok == i else end_tok
    flush_line()

    if not font_sizes and raw_font_size > 0:
        record_eff_font_size()

    return {
        "text": "\n".join(text_parts),
        "fontSizes": font_sizes,
        "rgbColors": rgb_colors,
        "imageCount": image_count,
        "textOpCount": text_op_count,
    }


def _resolve_page_font_map(res_text: str, objects: dict[int, dict[str, Any]], font_cache: dict[int, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    font_map: dict[str, dict[str, Any]] = {}
    font_refs: list[tuple[str, int]] = []
    inline_m = re.search(r"/Font\s*<<([\s\S]*?)>>", res_text)
    if inline_m:
        for fm in re.finditer(r"/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R", inline_m.group(1)):
            font_refs.append((fm.group(1), int(fm.group(2))))
    for ref_m in re.finditer(r"/Font\s+(\d+)\s+\d+\s+R", res_text):
        f_dict_obj = objects.get(int(ref_m.group(1)))
        if f_dict_obj:
            for fm in re.finditer(r"/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R", f_dict_obj.get("dictRaw", "")):
                font_refs.append((fm.group(1), int(fm.group(2))))

    for alias, f_obj_num in font_refs:
        if f_obj_num in font_cache:
            font_map[alias] = font_cache[f_obj_num]
            continue
        f_obj = objects.get(f_obj_num)
        if not f_obj:
            continue
        full_dict = f_obj.get("dictRaw", "")
        desc_m = re.search(r"/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R", full_dict)
        if desc_m and int(desc_m.group(1)) in objects:
            full_dict += "\n" + objects[int(desc_m.group(1))].get("dictRaw", "")
        to_unicode: dict[str, Any] | None = None
        tu_m = re.search(r"/ToUnicode\s+(\d+)\s+\d+\s+R", full_dict)
        if tu_m and int(tu_m.group(1)) in objects:
            cmap_str = _decode_pdf_object_stream(objects[int(tu_m.group(1))])
            parsed = _parse_tounicode_cmap(cmap_str)
            if parsed["map"] or parsed.get("ranges"):
                to_unicode = parsed
        differences = _parse_encoding_differences(full_dict, objects)
        has_std_enc = bool(re.search(r"/BaseEncoding\s*/(?:WinAnsiEncoding|MacRomanEncoding|StandardEncoding)\b", full_dict))
        is_custom_glyph = (
            bool(re.search(r"/Subtype\s*/(?:Type3|Type0)\b|/Identity-[HV]\b", full_dict))
            or bool(to_unicode)
        ) and not has_std_enc
        entry = {"toUnicode": to_unicode, "differences": differences, "isCustomGlyph": is_custom_glyph}
        font_cache[f_obj_num] = entry
        font_map[alias] = entry
    return font_map


def parse_pdf_bytes(data: bytes) -> dict[str, Any]:
    if not isinstance(data, (bytes, bytearray)) or len(data) < 8:
        raise ValueError("Invalid or truncated PDF buffer")
    buf = bytes(data)
    head = buf[: min(1024, len(buf))].decode("latin1")
    if "%PDF-" not in head:
        raise ValueError("Invalid PDF header (missing %PDF-)")

    latin, objects, has_compressed_streams = _extract_pdf_objects(buf)

    trailer_m = re.search(r"trailer\s*<<[\s\S]*?>>", latin)
    if trailer_m and re.search(r"/Encrypt\b", trailer_m.group(0)):
        return {"encrypted": True, "pageCount": 0, "metadata": {}, "pages": []}
    for obj in objects.values():
        if obj["streamBytes"] is None and re.search(r"/Encrypt\b", obj["dictRaw"]):
            return {"encrypted": True, "pageCount": 0, "metadata": {}, "pages": []}

    producer = ""
    creator = ""
    has_fonts = False
    for obj in objects.values():
        if re.search(r"/Type\s*/Font\b|/Subtype\s*/(?:Type0|Type1|Type3|TrueType|CIDFontType[02])\b", obj["dictRaw"]):
            has_fonts = True
        if obj["streamBytes"] is None and (re.search(r"/Producer\b", obj["dictRaw"]) or re.search(r"/Creator\b", obj["dictRaw"])):
            pm = re.search(r"/Producer\s*\(([^)]*)\)", obj["dictRaw"])
            if pm:
                producer = _decode_pdf_literal_string(pm.group(1))
            cm = re.search(r"/Creator\s*\(([^)]*)\)", obj["dictRaw"])
            if cm:
                creator = _decode_pdf_literal_string(cm.group(1))

    image_obj_nums: set[int] = set()
    shading_obj_colors: dict[int, list[list[int]]] = {}
    for obj in objects.values():
        if re.search(r"/Subtype\s*/Image\b", obj["dictRaw"]):
            image_obj_nums.add(obj["objNum"])
        cols: list[list[int]] = []
        _collect_pdf_rgb_stops(obj["dictRaw"], cols)
        if cols:
            shading_obj_colors[obj["objNum"]] = cols

    def _extract_own_res(dict_raw: str) -> str:
        out_r = dict_raw or ""
        res_ref = re.search(r"/Resources\s+(\d+)\s+\d+\s+R", out_r)
        if res_ref and int(res_ref.group(1)) in objects:
            out_r += "\n" + objects[int(res_ref.group(1))]["dictRaw"]
        return out_r

    ordered_page_objs: list[dict[str, Any]] = []
    inherited_mediabox: dict[int, tuple[float, float]] = {}
    inherited_resources: dict[int, str] = {}
    visited_tree: set[int] = set()

    def walk_pages_tree_iter(root_num: int) -> None:
        work: list[tuple[int, tuple[float, float] | None, str]] = [(root_num, None, "")]
        while work:
            obj_num, parent_box, parent_res = work.pop()
            if obj_num in visited_tree:
                continue
            visited_tree.add(obj_num)
            obj = objects.get(obj_num)
            if not obj:
                continue
            own_box = _parse_mediabox_rect(obj["dictRaw"]) or parent_box
            has_own_res = bool(re.search(r"/Resources(?:\s|\n|<<)", obj["dictRaw"]))
            comb_res = f"{parent_res}\n{_extract_own_res(obj['dictRaw'])}" if has_own_res else parent_res
            if re.search(r"/Type\s*/Pages\b", obj["dictRaw"]):
                kids_m = re.search(r"/Kids\s*\[([^\]]*)\]", obj["dictRaw"])
                if kids_m:
                    kids = [int(rm.group(1)) for rm in re.finditer(r"(\d+)\s+\d+\s+R", kids_m.group(1))]
                    for k_id in reversed(kids):
                        work.append((k_id, own_box, comb_res))
                continue
            if re.search(r"/Type\s*/Page(?![a-zA-Z])", obj["dictRaw"]):
                inherited_mediabox[obj_num] = own_box or (612.0, 792.0)
                inherited_resources[obj_num] = comb_res or _extract_own_res(obj["dictRaw"])
                ordered_page_objs.append(obj)

    catalog_obj = next((o for o in objects.values() if re.search(r"/Type\s*/Catalog\b", o["dictRaw"])), None)
    if catalog_obj:
        pages_ref = re.search(r"/Pages\s+(\d+)\s+\d+\s+R", catalog_obj["dictRaw"])
        if pages_ref:
            walk_pages_tree_iter(int(pages_ref.group(1)))
    if not ordered_page_objs:
        for obj in sorted(objects.values(), key=lambda o: o["objNum"]):
            if re.search(r"/Type\s*/Page(?![a-zA-Z])", obj["dictRaw"]):
                inherited_mediabox[obj["objNum"]] = _parse_mediabox_rect(obj["dictRaw"]) or (612.0, 792.0)
                inherited_resources[obj["objNum"]] = _extract_own_res(obj["dictRaw"])
                ordered_page_objs.append(obj)

    font_cache: dict[int, dict[str, Any]] = {}
    pages: list[dict[str, Any]] = []
    for idx, page_obj in enumerate(ordered_page_objs):
        width, height = inherited_mediabox.get(page_obj["objNum"], (612.0, 792.0))
        is_landscape = width > height

        res_text = inherited_resources.get(page_obj["objNum"]) or _extract_own_res(page_obj["dictRaw"])

        font_map = _resolve_page_font_map(res_text, objects, font_cache)
        if font_map:
            has_fonts = True

        image_xobj_names: set[str] = set()
        for xm in re.finditer(r"/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R", res_text):
            if int(xm.group(2)) in image_obj_nums:
                image_xobj_names.add(xm.group(1))

        resource_colors: list[list[int]] = []
        _collect_pdf_rgb_stops(res_text, resource_colors)
        for rm in re.finditer(r"(\d+)\s+\d+\s+R", res_text):
            ref_num = int(rm.group(1))
            if ref_num in shading_obj_colors:
                resource_colors.extend(shading_obj_colors[ref_num])
            ref_obj = objects.get(ref_num)
            if ref_obj:
                for sub_ref in re.finditer(r"(\d+)\s+\d+\s+R", ref_obj["dictRaw"]):
                    snum = int(sub_ref.group(1))
                    if snum in shading_obj_colors:
                        resource_colors.extend(shading_obj_colors[snum])

        content_refs: list[int] = []
        arr_m = re.search(r"/Contents\s*\[([^\]]*)\]", page_obj["dictRaw"])
        if arr_m:
            for rm in re.finditer(r"(\d+)\s+\d+\s+R", arr_m.group(1)):
                content_refs.append(int(rm.group(1)))
        else:
            single_m = re.search(r"/Contents\s+(\d+)\s+\d+\s+R", page_obj["dictRaw"])
            if single_m:
                content_refs.append(int(single_m.group(1)))

        joined_stream = "\n".join(_decode_pdf_object_stream(objects.get(cid)) for cid in content_refs)
        parsed = _parse_pdf_content_stream(joined_stream, image_xobj_names, font_map)

        pages.append({
            "pageNum": idx + 1,
            "width": int(width * 100.0 + 0.5) / 100.0,
            "height": int(height * 100.0 + 0.5) / 100.0,
            "isLandscape": is_landscape,
            "text": parsed["text"],
            "hasFonts": bool(font_map),
            "fontSizes": parsed["fontSizes"],
            "rgbColors": [*parsed["rgbColors"], *resource_colors],
            "imageCount": parsed["imageCount"],
            "textOpCount": parsed["textOpCount"],
        })

    return {
        "encrypted": False,
        "pageCount": len(pages),
        "hasFonts": has_fonts,
        "hasCompressedStreams": has_compressed_streams,
        "metadata": {"producer": producer, "creator": creator},
        "pages": pages,
    }


def audit_image_document(
    parsed_image: dict[str, Any] | None,
    *,
    filename: str,
    pack: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    if not parsed_image or not parsed_image.get("format"):
        return {"findings": findings, "skipped": [{"file": filename, "reason": "Unparseable image metadata"}]}

    allow_list = [str(a).lower() for a in (config or {}).get("allow", [])]
    rules_by_id = {r["id"]: r for r in pack.get("rules", [])}

    wf_rule = rules_by_id.get("image-ai-workflow-residue")
    if wf_rule:
        workflow_matches: list[str] = []
        provenance_matches: list[str] = []
        for item in parsed_image.get("metadataTexts") or []:
            key = str(item.get("key") or "").strip()
            val = str(item.get("value") or "")
            combined = f"{key}: {val}"
            if any(al in combined.lower() for al in allow_list):
                continue
            if re.match(r"^(?:parameters|prompt|workflow|generation_data)$", key, re.I) or re.search(
                r"(?:Negative prompt:|Steps:\s*\d+\s*,\s*Sampler:|CFG scale:\s*\d|\"class_type\"\s*:\s*\"(?:KSampler|CheckpointLoaderSimple|CLIPTextEncode)\")",
                val,
                re.I,
            ):
                cleaned_v = re.sub(r"\s+", " ", val).strip()
                workflow_matches.append(f"{key or 'chunk'}: {cleaned_v}"[:120])
            elif re.search(
                r"(?:trainedAlgorithmicMedia|c2pa|Midjourney|DALL-E|Adobe Firefly|Stable Diffusion|ComfyUI|AUTOMATIC1111|Flux\.1|Ideogram|Recraft)",
                combined,
                re.I,
            ):
                cleaned_v = re.sub(r"\s+", " ", val).strip()
                provenance_matches.append(f"{key or 'tag'}: {cleaned_v}"[:120])

        if workflow_matches:
            findings.append(
                make_finding(
                    rule={**wf_rule, "severity": "warning"},
                    filename=filename,
                    modality="image",
                    location="metadata",
                    line=1,
                    match=workflow_matches[0],
                )
            )
        elif parsed_image.get("hasC2pa") or provenance_matches:
            findings.append(
                make_finding(
                    rule={**wf_rule, "severity": "info"},
                    filename=filename,
                    modality="image",
                    location="metadata",
                    line=1,
                    match=provenance_matches[0] if provenance_matches else "C2PA / AI provenance manifest present",
                )
            )

    pal_rule = rules_by_id.get("image-ai-palette-slop")
    pm = parsed_image.get("pixelMetrics")
    if pal_rule and pm and parsed_image.get("width", 0) >= 64 and parsed_image.get("height", 0) >= 64:
        is_neon_purple = (pm["neonPurpleRatio"] >= 0.16 and pm["neutralRatio"] < 0.75) or (
            pm["darkBgRatio"] >= 0.35
            and (pm["neonPurpleRatio"] + pm["neonCyanRatio"]) >= 0.14
            and pm["neonPurpleRatio"] >= 0.06
        )
        is_plastic = pm["highSatRatio"] >= 0.38 and pm["smoothHighSatRatio"] >= 0.65
        if is_neon_purple or is_plastic:
            reasons: list[str] = []
            if is_neon_purple:
                reasons.append(f"neonPurple={int(pm['neonPurpleRatio'] * 100.0 + 0.5)}%")
                if pm["darkBgRatio"] >= 0.35:
                    reasons.append(f"darkBg={int(pm['darkBgRatio'] * 100.0 + 0.5)}%")
            if is_plastic:
                reasons.append(f"highSat={int(pm['highSatRatio'] * 100.0 + 0.5)}%")
                reasons.append(f"smooth={int(pm['smoothHighSatRatio'] * 100.0 + 0.5)}%")
            findings.append(
                make_finding(
                    rule=pal_rule,
                    filename=filename,
                    modality="image",
                    location="pixels",
                    line=1,
                    match=f"{parsed_image['width']}x{parsed_image['height']} ({', '.join(reasons)})",
                )
            )

    return {"findings": findings, "skipped": skipped}


def audit_pdf_document(
    parsed_pdf: dict[str, Any] | None,
    *,
    filename: str,
    pack: dict[str, Any],
    config: dict[str, Any] | None = None,
    register: str | None = None,
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    if not parsed_pdf:
        return {"findings": findings, "skipped": [{"file": filename, "reason": "Unparseable PDF file"}]}
    if parsed_pdf.get("encrypted"):
        return {"findings": findings, "skipped": [{"file": filename, "reason": "Encrypted PDF cannot be audited offline"}]}
    pages = parsed_pdf.get("pages") or []
    if not pages:
        return {"findings": findings, "skipped": [{"file": filename, "reason": "Missing page objects inside PDF"}]}

    rules_by_id = {r["id"]: r for r in pack.get("rules", [])}
    thresholds = pack.get("thresholds", {})
    md_leak_rule = rules_by_id.get("markdown-leak")
    word_wall_rule = rules_by_id.get("slide-word-wall")
    gradient_rule = rules_by_id.get("ui-ai-gradient")
    pdf_layout_rule = rules_by_id.get("pdf-visual-layout-slop")

    raster_only_landscape = 0
    prev_sig: str | None = None
    mono_run = 0
    mono_emitted = False

    for p in pages:
        page_num = p.get("pageNum") or 1
        text = p.get("text") or ""
        cjk_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
        latin_words = len([w for w in text.split() if re.search(r"[A-Za-z0-9]", w)])

        if md_leak_rule and (re.search(r"\*\*[^*\n]{1,80}\*\*", text) or re.search(r"^#{1,6}[ \t]+\S", text, re.M)):
            findings.append(
                make_finding(
                    rule=md_leak_rule,
                    filename=filename,
                    modality="pdf",
                    location=f"page {page_num}",
                    line=page_num,
                    match=re.sub(r"\s+", " ", text).strip()[:100],
                )
            )

        if p.get("isLandscape") and word_wall_rule:
            max_words = thresholds.get("maxSlideWords", 120)
            max_zh = thresholds.get("maxSlideCharsZh", 280)
            if latin_words > max_words or cjk_chars > max_zh:
                findings.append(
                    make_finding(
                        rule=word_wall_rule,
                        filename=filename,
                        modality="pdf",
                        location=f"page {page_num}",
                        line=page_num,
                        match=f"{latin_words} words / {cjk_chars} CJK chars",
                    )
                )

        if gradient_rule and p.get("rgbColors"):
            purple_keys: set[str] = set()
            for rgb in p["rgbColors"]:
                h, s, _ = _rgb_to_hsl_norm(rgb[0], rgb[1], rgb[2])
                if 235.0 <= h <= 345.0 and (s * 100.0) >= 45.0:
                    purple_keys.add(f"{rgb[0] // 16},{rgb[1] // 16},{rgb[2] // 16}")
            if len(purple_keys) >= 2:
                findings.append(
                    make_finding(
                        rule=gradient_rule,
                        filename=filename,
                        modality="pdf",
                        location=f"page {page_num}",
                        line=page_num,
                        match=f"{len(purple_keys)} neon purple-pink RGB fills/shadings",
                    )
                )

        if pdf_layout_rule:
            if p.get("isLandscape") and (p.get("textOpCount") or 0) == 0 and (p.get("imageCount") or 0) >= 1:
                raster_only_landscape += 1

            font_sizes = p.get("fontSizes") or []
            if p.get("isLandscape") and (latin_words >= 40 or cjk_chars >= 90) and len(font_sizes) >= 4:
                min_f = min(font_sizes)
                max_f = max(font_sizes)
                if max_f / min_f < 1.2 or (p.get("width", 0) >= 500 and min_f < 9.5):
                    findings.append(
                        make_finding(
                            rule=pdf_layout_rule,
                            filename=filename,
                            modality="pdf",
                            location=f"page {page_num}",
                            line=page_num,
                            match=f"font hierarchy collapsed (min={min_f:g}pt, max={max_f:g}pt, words={latin_words})",
                        )
                    )

            if len(pages) >= 5:
                is_plain = (
                    bool(p.get("isLandscape"))
                    and (p.get("imageCount") or 0) == 0
                    and (latin_words > 8 or cjk_chars > 16)
                    and len(font_sizes) > 0
                )
                sig = (
                    f"f:{int(min(font_sizes) + 0.5)}-{int(max(font_sizes) + 0.5)}|w:{2 if (latin_words >= 25 or cjk_chars >= 50) else 1}"
                    if is_plain
                    else None
                )
                if sig and sig == prev_sig:
                    mono_run += 1
                else:
                    prev_sig = sig
                    mono_run = 1 if sig else 0
                if not mono_emitted and mono_run >= thresholds.get("maxIdenticalSlideRun", 4):
                    mono_emitted = True
                    findings.append(
                        make_finding(
                            rule=pdf_layout_rule,
                            filename=filename,
                            modality="pdf",
                            location=f"page {page_num}",
                            line=page_num,
                            match=f"{mono_run} consecutive identical plain-text landscape PDF pages ({sig})",
                        )
                    )

        if text.strip():
            sub = audit_text(text, filename=filename, modality="markdown", pack=pack, config=config, register=register)
            for f in sub["findings"]:
                if f["ruleId"] == "markdown-leak":
                    continue
                findings.append({**f, "modality": "pdf", "location": f"page {page_num}", "line": page_num})

    if pdf_layout_rule and len(pages) >= 2 and raster_only_landscape >= 2:
        findings.append(
            make_finding(
                rule=pdf_layout_rule,
                filename=filename,
                modality="pdf",
                location="page 1",
                line=1,
                match=f"{raster_only_landscape} raster-only landscape pages with zero selectable text",
            )
        )

    coverage_warnings: list[dict[str, Any]] = []
    unreadable_pages: list[int] = []
    for p in pages:
        empty_text = not (p.get("text") or "").strip()
        is_raster_slide = bool(p.get("isLandscape") and (p.get("textOpCount") or 0) == 0 and (p.get("imageCount") or 0) >= 1)
        if empty_text and not is_raster_slide and (
            p.get("hasFonts") or parsed_pdf.get("hasFonts") or parsed_pdf.get("hasCompressedStreams") or bool(p.get("fontSizes"))
        ):
            unreadable_pages.append(int(p.get("pageNum") or 1))
    if unreadable_pages and not (raster_only_landscape >= 2 and len(unreadable_pages) == len(pages)):
        coverage_warnings.append({
            "file": filename,
            "code": "unreadable-pdf-text",
            "pages": unreadable_pages,
            "message": f"PDF contains fonts or streams on page(s) {', '.join(str(n) for n in unreadable_pages)} with 0 selectable characters extracted; inspect visually or via pdftotext.",
        })

    findings.sort(key=lambda f: (f.get("line", 0), f.get("col", 0)))
    return {"findings": findings, "skipped": skipped, "coverageWarnings": coverage_warnings}


def inspect_file(
    abs_path: Path,
    rel_posix: str,
    packs_by_id: dict[str, dict[str, Any]],
    explicit_pack: str | None = None,
    config: dict[str, Any] | None = None,
    register: str | None = None,
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

    file_cfg = resolve_config_for_file(rel_posix, cfg)
    pack_id = pick_pack_for_file(rel_posix, modality, explicit_pack, file_cfg)
    pack = resolve_effective_pack(pack_id, packs_by_id, file_cfg)

    if modality in {"docx", "pptx"}:
        reg_info = resolve_register("", filename=rel_posix, flag_register=register, config=file_cfg)
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
            res = audit_ooxml_entries(entries, filename=rel_posix, modality=modality, pack=pack, config=file_cfg, register=register)
            missing_core = any(s["file"] == rel_posix for s in res["skipped"])
            return {
                "checked": not missing_core,
                "findings": res["findings"],
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": res["skipped"],
                "register": reg_info["register"],
                "registerSource": reg_info["registerSource"],
            }
        except Exception as exc:
            return {
                "checked": False,
                "findings": [],
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": [{"file": rel_posix, "reason": f"Uninspectable {modality.upper()} archive: {exc}"}],
            }

    if modality == "image":
        reg_info = resolve_register("", filename=rel_posix, flag_register=register, config=file_cfg)
        try:
            parsed = parse_image_bytes(abs_path.read_bytes())
            res = audit_image_document(parsed, filename=rel_posix, pack=pack, config=file_cfg)
            return {
                "checked": True,
                "findings": res["findings"],
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": res["skipped"],
                "register": reg_info["register"],
                "registerSource": reg_info["registerSource"],
            }
        except Exception as exc:
            return {
                "checked": False,
                "findings": [],
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": [{"file": rel_posix, "reason": f"Uninspectable image: {exc}"}],
            }

    if modality == "pdf":
        reg_info = resolve_register("", filename=rel_posix, flag_register=register, config=file_cfg)
        try:
            parsed = parse_pdf_bytes(abs_path.read_bytes())
            res = audit_pdf_document(parsed, filename=rel_posix, pack=pack, config=file_cfg, register=register)
            uninspectable = any(s["file"] == rel_posix for s in res["skipped"])
            return {
                "checked": not uninspectable,
                "findings": res["findings"],
                "unusedSuppressions": [],
                "coverageWarnings": res.get("coverageWarnings", []),
                "skipped": res["skipped"],
                "register": reg_info["register"],
                "registerSource": reg_info["registerSource"],
            }
        except Exception as exc:
            return {
                "checked": False,
                "findings": [],
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": [{"file": rel_posix, "reason": f"Uninspectable PDF: {exc}"}],
            }

    try:
        text = abs_path.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        return {
            "checked": False,
            "findings": [],
            "unusedSuppressions": [],
            "coverageWarnings": [],
            "skipped": [{"file": rel_posix, "reason": "Non-UTF-8 text encoding; convert to UTF-8 to inspect"}],
        }

    reg_info = resolve_register(text, filename=rel_posix, flag_register=register, config=file_cfg)
    res = audit_text(text, filename=rel_posix, modality=modality, pack=pack, config=file_cfg, register=register)
    return {
        "checked": True,
        "findings": res["findings"],
        "unusedSuppressions": res["unusedSuppressions"],
        "coverageWarnings": [],
        "skipped": [],
        "register": reg_info["register"],
        "registerSource": reg_info["registerSource"],
    }


def collect_target_files(
    targets: list[str],
    cwd: Path,
    config: dict[str, Any],
    *,
    explicit_targets: bool = True,
) -> tuple[list[tuple[Path, str]], list[dict[str, str]]]:
    files: list[tuple[Path, str]] = []
    skipped: list[dict[str, str]] = []
    ignore_globs = list(config.get("ignore") or [])
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
        walk((cwd / t).resolve(), explicit_targets)
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
    "graphic/": "graphic-layout",
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


def rule_doc_url(item: dict[str, Any] | None, lang: str = "en") -> str:
    obj = item or {}
    rule_id = str(obj.get("ruleId") or obj.get("id") or "")
    source = str(obj.get("source") or "")
    pack_id = str(obj.get("packId") or "")
    is_zh = lang == "zh" or rule_id.startswith("zh-")
    base = "https://dislop.com/zh/rules/" if is_zh else "https://dislop.com/rules/"
    if not rule_id or source == "pattern-library" or pack_id == "pocket-model":
        return base
    return f"{base}{rule_id}/"


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
                    "anchorUrl": rule_doc_url({"ruleId": rid}, "en"),
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
    ("min_inc", re.compile(r"^(?:no\s+less\s+than|no\s+fewer\s+than|at\s+least|minimum\s+of|>=|≥)\s*", re.I | re.ASCII)),
    ("min_inc", re.compile(r"^(?:不低于|不少于|不小于|不得低于|不得少于|至少|最少|最低|起码|下限(?:为)?)\s*", re.ASCII)),
    ("max_inc", re.compile(r"^(?:no\s+more\s+than|up\s+to|at\s+most|within|inside(?:\s+of)?|max(?:imum)?(?:\s+of)?|<=|≤)\s*", re.I | re.ASCII)),
    ("max_inc", re.compile(r"^(?:不超过|不高于|不大于|不多于|不得超过|不得高于|最多|至多|最高|以内|上限(?:为)?)\s*", re.ASCII)),
    ("max_lt", re.compile(r"^(?:under|below|less\s+than|fewer\s+than|<)\s*", re.I | re.ASCII)),
    ("max_lt", re.compile(r"^(?:低于|小于|少于|不到)\s*", re.ASCII)),
    ("min_gt", re.compile(r"^(?:more\s+than|greater\s+than|over|above|>)\s*", re.I | re.ASCII)),
    ("min_gt", re.compile(r"^(?:超过|高于|大于)\s*", re.ASCII)),
    ("approx", re.compile(r"^(?:approx(?:imately)?\.?|roughly|about|around|~|≈)\s*", re.I | re.ASCII)),
    ("approx", re.compile(r"^(?:约|大约|近)\s*", re.ASCII)),
    ("asof", re.compile(r"^(?:as\s+of|since|until)\s+", re.I | re.ASCII)),
    ("asof", re.compile(r"^(?:截至|截止到?)\s*", re.ASCII)),
]

_FACT_SUFFIX_QUALIFIERS: list[tuple[str, re.Pattern[str]]] = [
    ("max_inc", re.compile(r"^\s*(?:以内|以下|上限)", re.ASCII)),
    ("min_inc", re.compile(r"^\s*(?:以上|起)", re.ASCII)),
    ("approx", re.compile(r"^\s*(?:左右)", re.ASCII)),
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

_FACT_ZH_UNIT_EXTRA = {
    "个": "个", "条": "条", "项": "项", "次": "次", "份": "份", "页": "页", "行": "行",
    "人": "人", "家": "家", "位": "人", "名": "人", "台": "台", "套": "套", "批": "批",
    "种": "种", "轮": "轮", "层": "层", "步": "步", "篇": "篇", "节": "节", "章": "章",
}


def _normalize_fact_scan_text(raw: str) -> str:
    out: list[str] = []
    for ch in str(raw or ""):
        c = ord(ch)
        if 0xFF10 <= c <= 0xFF19:
            out.append(chr(c - 0xFF10 + 48))
        elif c == 0xFF05:
            out.append("%")
        elif c == 0x2212:
            out.append("-")
        else:
            out.append(ch)
    return "".join(out)


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
    nm = re.match(r"^([0-9]+(?:\.[0-9]+)?)[\s-]*(.*)$", rest)
    if not nm:
        return f"{sign}{curr}{rest.lower()}"
    num_part = nm.group(1)
    raw_unit = nm.group(2).strip()
    norm_unit = (
        _UNIT_CANON_MAP.get(raw_unit.lower())
        or _UNIT_CANON_MAP.get(raw_unit)
        or _FACT_ZH_UNIT_EXTRA.get(raw_unit)
        or raw_unit.lower()
    ) if raw_unit else ""
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


def extract_protected_facts(text: str, *, modality: str = "markdown", keep_mode: bool = False) -> list[dict[str, Any]]:
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
    for m in re.finditer(r"https?://[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+", without_fences, re.I | re.ASCII):
        cleaned = re.sub(r"[.,;!?)]+$", "", m.group(0))
        claim({
            "kind": "url",
            "raw": cleaned,
            "canonical": cleaned,
            "qualifier": None,
            "span": {"start": m.start(), "end": m.start() + len(cleaned)},
        })

    if modality in {"html", "jsx"}:
        for m in re.finditer(r"\bhref=[\"']([^\"'#\s][^\"']*?)[\"']", raw, re.I | re.ASCII):
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

    _ZH_NUM_DIGIT = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    _ZH_UNIT_CANON = _FACT_ZH_UNIT_EXTRA

    def _parse_zh_numeral(zh_str: str) -> int | None:
        s = zh_str.strip()
        if not s or s.startswith(("万", "亿")):
            return None
        if len(s) == 1 and s in _ZH_NUM_DIGIT:
            return _ZH_NUM_DIGIT[s]
        total = 0
        section = 0
        num = 0
        for ch in s:
            if ch in _ZH_NUM_DIGIT:
                num = _ZH_NUM_DIGIT[ch]
            elif ch == "十":
                section += (1 if num == 0 else num) * 10
                num = 0
            elif ch == "百":
                section += (1 if num == 0 else num) * 100
                num = 0
            elif ch == "千":
                section += (1 if num == 0 else num) * 1000
                num = 0
            elif ch == "万":
                if section + num == 0:
                    return None
                total += (section + num) * 10000
                section = 0
                num = 0
            elif ch == "亿":
                if section + num == 0:
                    return None
                total += (section + num) * 100000000
                section = 0
                num = 0
            else:
                return None
        val = total + section + num
        return val if val >= 0 else None

    def _canon_date_token(raw_date: str) -> str:
        s = raw_date.strip()
        m = re.match(r"^((?:19|20)\d{2})[-/.年]\s*(0?[1-9]|1[0-2])[-/.月]\s*(0?[1-9]|[12]\d|3[01])\s*[日号]?$", s, re.ASCII)
        if m:
            return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        m = re.match(r"^(0?[1-9]|[12]\d|3[01])[/.](0?[1-9]|[12]\d|3[01])[/.]((?:19|20)\d{2})$", s, re.ASCII)
        if m:
            return f"{int(m.group(1)):02d}/{int(m.group(2)):02d}/{m.group(3)}"
        m = re.match(r"^(0?[1-9]|1[0-2])[/.月]\s*(0?[1-9]|[12]\d|3[01])\s*[日号]?$", s, re.ASCII)
        if m:
            return f"{int(m.group(1)):02d}/{int(m.group(2)):02d}"
        return s

    def _extract_leading_qualifier(scan_text: str, num_start: int, lookback: int = 24) -> tuple[str | None, int]:
        lb_start = max(0, num_start - lookback)
        prefix_w = scan_text[lb_start:num_start]
        qual: str | None = None
        s_start = num_start
        best_len = 0
        for q_group, q_re in _FACT_QUALIFIER_PATTERNS:
            for offset in range(len(prefix_w)):
                sub = prefix_w[offset:]
                qm = q_re.match(sub)
                if qm and len(qm.group(0)) == len(sub) and len(qm.group(0)) > best_len:
                    best_len = len(qm.group(0))
                    qual = q_group
                    s_start = lb_start + offset
        return qual, s_start

    def _apply_trailing_qual(scan_text: str, span_end: int, initial_qual: str | None) -> tuple[str | None, int]:
        if initial_qual:
            return initial_qual, span_end
        suffix_w = scan_text[span_end : min(len(scan_text), span_end + 6)]
        suffix_list = (
            [("max_inc", re.compile(r"^\s*(?:以内|内|以下|上限)", re.ASCII))] + _FACT_SUFFIX_QUALIFIERS[1:]
            if keep_mode
            else _FACT_SUFFIX_QUALIFIERS
        )
        for s_group, s_re in suffix_list:
            sm = s_re.match(suffix_w)
            if sm:
                return s_group, span_end + len(sm.group(0))
        return None, span_end

    # 3. Atomic ratios/dates/times and numbers/units/versions in visible prose (1:1 normalized digits/minus)
    prose_scan = _normalize_fact_scan_text(_blank_markup_for_fact_scan(raw, modality))

    def _mask_occupied() -> str:
        chars = list(prose_scan)
        for s, e in occupied:
            for i in range(s, min(e, len(chars))):
                chars[i] = " "
        return "".join(chars)

    if keep_mode:
        clean_keep_dates = _mask_occupied()
        keep_date_patterns = [
            re.compile(r"\b\d{4}-\d{1,2}-\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?Z?)?\b", re.ASCII),
            re.compile(
                r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b",
                re.I | re.ASCII,
            ),
            re.compile(r"\d{4}\s*年(?:\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?)?", re.ASCII),
        ]
        for dp in keep_date_patterns:
            for dm in dp.finditer(clean_keep_dates):
                cleaned_d = raw[dm.start() : dm.end()].strip()
                claim({
                    "kind": "date",
                    "raw": cleaned_d,
                    "canonical": cleaned_d,
                    "qualifier": None,
                    "span": {"start": dm.start(), "end": dm.end()},
                })

    # 3a. Context slash ratios, dates (`2026-11-23.`, `05/06/2024`, `11/20`), and colon times/ratios
    clean_scan = _mask_occupied()
    for m in re.finditer(r"(?<![A-Za-z0-9_.])([0-9]+)/([0-9]+)(?![A-Za-z0-9_./])", clean_scan, re.ASCII):
        pre = clean_scan[max(0, m.start() - 18) : m.start()]
        if re.search(r"(?:比例|比值|比率|系数|概率|胜率|占比|ratio|fraction|odds|chance)", pre, re.I):
            pre_q, span_start = _extract_leading_qualifier(clean_scan, m.start())
            qual, span_end = _apply_trailing_qual(clean_scan, m.end(), pre_q)
            claim({
                "kind": "qualified-number" if qual else "number",
                "raw": raw[span_start:span_end].strip(),
                "canonical": m.group(0).strip(),
                "qualifier": qual,
                "span": {"start": span_start, "end": span_end},
            })

    clean_scan = _mask_occupied()
    dt_re = re.compile(
        r"(?:(?<![A-Za-z0-9_.])(?:19|20)[0-9]{2}[-/.年]\s*(?:0?[1-9]|1[0-2])[-/.月]\s*(?:0?[1-9]|[12][0-9]|3[01])\s*[日号]?(?!(?:\.[0-9]|[A-Za-z0-9_/-]))"
        r"|(?<![A-Za-z0-9_.])(?:0?[1-9]|[12][0-9]|3[01])[/.](?:0?[1-9]|[12][0-9]|3[01])[/.](?:19|20)[0-9]{2}(?!(?:\.[0-9]|[A-Za-z0-9_/-]))"
        r"|(?<![A-Za-z0-9_.])(?:0?[1-9]|1[0-2])/(?:0?[1-9]|[12][0-9]|3[01])(?!(?:\.[0-9]|[A-Za-z0-9_./]))"
        r"|(?:0?[1-9]|1[0-2])\s*月\s*(?:0?[1-9]|[12][0-9]|3[01])\s*[日号]"
        r"|(?<![A-Za-z0-9_:])(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?(?![A-Za-z0-9_:]))",
        re.ASCII,
    )
    for m in dt_re.finditer(clean_scan):
        dt_start, dt_end = m.start(), m.end()
        qualifier, span_start = _extract_leading_qualifier(clean_scan, dt_start)
        canonical = m.group(0).strip() if ":" in m.group(0) else _canon_date_token(m.group(0))
        claim({
            "kind": "date",
            "raw": raw[span_start:dt_end].strip(),
            "canonical": canonical,
            "qualifier": qualifier,
            "span": {"start": span_start, "end": dt_end},
        })

    clean_scan = _mask_occupied()
    for m in re.finditer(r"(?<![A-Za-z0-9_:])([0-9]+:[0-9]+)(?![A-Za-z0-9_:])", clean_scan, re.ASCII):
        pre_q, span_start = _extract_leading_qualifier(clean_scan, m.start())
        qual, span_end = _apply_trailing_qual(clean_scan, m.end(), pre_q)
        claim({
            "kind": "qualified-number" if qual else "number",
            "raw": raw[span_start:span_end].strip(),
            "canonical": m.group(1),
            "qualifier": qual,
            "span": {"start": span_start, "end": span_end},
        })

    # 3b. Constrained Chinese numerals with classifiers / 零+noun
    clean_scan = _mask_occupied()
    zh_count_re = re.compile(
        r"(?:(?:(共|共计|合计|至少|不超过|不少于|不小于|不高于|不低于|超过|低于|多于|少于|仅|约|大约)\s*)?([一二两三四五六七八九十百千万亿零〇]+)(个月|[个条项次份页行人家位名台套批种轮层步篇章节]))"
        r"|(?<![0-9])(?:零|0)\s*(误差|漏报|误报|残留|依赖|新增|故障|容忍|阻塞|中断|风险)",
        re.ASCII,
    )
    for m in zh_count_re.finditer(clean_scan):
        if m.group(2):
            lead = m.group(1) or ""
            num_str = m.group(2)
            unit_str = m.group(3)
            if num_str == "一" and not lead:
                continue
            val = _parse_zh_numeral(num_str)
            if val is None:
                continue
            unit_canon = _UNIT_CANON_MAP.get(unit_str) or _ZH_UNIT_CANON.get(unit_str, unit_str)
            s_off = m.start() + (m.group(0).find(num_str) if lead else 0)
            pre_q, span_start = _extract_leading_qualifier(clean_scan, s_off)
            qualifier, span_end = _apply_trailing_qual(clean_scan, m.end(), pre_q)
            claim({
                "kind": "qualified-number" if qualifier else "number",
                "raw": raw[span_start:span_end].strip(),
                "canonical": f"{val}{unit_canon}",
                "qualifier": qualifier,
                "span": {"start": span_start, "end": span_end},
            })
        elif m.group(4):
            pre_q, span_start = _extract_leading_qualifier(clean_scan, m.start())
            qualifier, span_end = _apply_trailing_qual(clean_scan, m.end(), pre_q)
            claim({
                "kind": "qualified-number" if qualifier else "number",
                "raw": raw[span_start:span_end].strip(),
                "canonical": f"0{m.group(4)}",
                "qualifier": qualifier,
                "span": {"start": span_start, "end": span_end},
            })

    # 3c. Arabic numbers, units, versions, and bounding qualifiers
    clean_scan = _mask_occupied()
    _comma_num = r"(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)"
    if keep_mode:
        _dollar_tail = r"(?:\s?[kKmMbB](?![A-Za-z0-9_])|万元|亿元|万|亿)?"
        _unit_tail = r"(?:(?:x|×)(?![A-Za-z0-9_])|[\s-]?(?:milliseconds?|ms|microseconds?|us|µs|minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|weeks?|months?|years?|KB|MB|GB|TB|PB|QPS|TPS|RPS|fps|px|rows?|items?|files?)(?![A-Za-z0-9_])|\s?(?:%|requests?/s|req/s|s(?![A-Za-z0-9_])|毫秒|微秒|秒钟|分钟|小时|个月|万元|亿元|万美元|美元|欧元|日元|千瓦时|倍|秒|天|年|万|亿|元|次|个|条|项|份|页|行|人|家|位|名|台|套|批|种|轮|层|步|篇|章|节))?"
    else:
        _dollar_tail = r"(?:\s?[kKmMbB](?![A-Za-z0-9_])|万|亿)?"
        _unit_tail = r"(?:[\s-]?(?:milliseconds?|ms|minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|months?|years?|KB|MB|GB|TB|QPS|TPS|RPS|fps|px|rows?)(?![A-Za-z0-9_])|\s?(?:%|s(?![A-Za-z0-9_])|个月|倍|秒|分钟|小时|天|年|万|亿|元|美元|次|个|条|项|份|页|行|人|家|位|名|台|套|批|种|轮|层|步|篇|章|节))?"
    num_re = re.compile(
        r"(?<![A-Za-z0-9_])(?:"
        r"v[0-9]+(?:\.[0-9]+){1,3}(?![A-Za-z0-9_.])"
        r"|[0-9]+(?:\.[0-9]+){2,3}(?![A-Za-z0-9_.])"
        r"|Q[1-4](?![A-Za-z0-9_])"
        r"|P(?:50|90|95|99)(?![A-Za-z0-9_])"
        rf"|(?<![A-Za-z0-9_.-])[+-][$€¥£]\s?{_comma_num}(?:\.[0-9]+)?{_dollar_tail}"
        rf"|[$€¥£]\s?{_comma_num}(?:\.[0-9]+)?{_dollar_tail}"
        rf"|(?<![A-Za-z0-9_.-])[+-]{_comma_num}(?:\.[0-9]+)?{_unit_tail}"
        rf"|{_comma_num}(?:\.[0-9]+)?{_unit_tail}"
        r")",
        re.ASCII,
    )

    for m in num_re.finditer(clean_scan):
        num_start, num_end = m.start(), m.end()
        token = m.group(0).strip()

        line_start_idx = clean_scan.rfind("\n", 0, num_start) + 1
        is_line_lead = clean_scan[line_start_idx:num_start].strip() == ""
        after_slice = clean_scan[num_end : num_end + 2]
        if is_line_lead and token.isdigit() and re.match(r"^[.)、](?:\s|$)", after_slice, re.ASCII):
            continue

        pre_q, span_start = _extract_leading_qualifier(clean_scan, num_start)
        qualifier, span_end = _apply_trailing_qual(clean_scan, num_end, pre_q)

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
    unmatched_indices: list[int] = []

    # Pass 1: exact (kind-compatible, canonical, qualifier) match first
    for i, bf in enumerate(before_facts):
        is_num = bf["kind"] in {"number", "qualified-number"}
        match_idx = -1
        for idx, af in enumerate(pool):
            if af["used"]:
                continue
            same_kind = af["kind"] in {"number", "qualified-number"} if is_num else af["kind"] == bf["kind"]
            if same_kind and af["canonical"] == bf["canonical"] and (af["qualifier"] or None) == (bf["qualifier"] or None):
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
        else:
            unmatched_indices.append(i)

    # Pass 2: remaining items catch dropped, added, or mismatched qualifiers
    for i in unmatched_indices:
        bf = before_facts[i]
        is_num = bf["kind"] in {"number", "qualified-number"}
        bare_idx = -1
        for idx, af in enumerate(pool):
            if af["used"]:
                continue
            same_kind = af["kind"] in {"number", "qualified-number"} if is_num else af["kind"] == bf["kind"]
            if same_kind and af["canonical"] == bf["canonical"]:
                bare_idx = idx
                break
        if bare_idx != -1 and (bf["qualifier"] or pool[bare_idx]["qualifier"]):
            pool[bare_idx]["used"] = True
            qualifier_dropped.append({
                "before": bf["raw"],
                "after": pool[bare_idx]["raw"],
                "canonical": bf["canonical"],
                "expectedQualifier": bf["qualifier"],
                "actualQualifier": pool[bare_idx]["qualifier"],
            })
            continue

        dup_preserved = None
        for p in preserved:
            same_p_kind = p["kind"] in {"number", "qualified-number"} if is_num else p["kind"] == bf["kind"]
            if same_p_kind and p["canonical"] == bf["canonical"] and (p["qualifier"] or None) == (bf["qualifier"] or None):
                dup_preserved = p
                break
        if dup_preserved is not None:
            preserved.append({
                "before": bf["raw"],
                "after": dup_preserved["after"],
                "kind": bf["kind"],
                "canonical": bf["canonical"],
                "qualifier": bf["qualifier"],
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
    if total_prot == 0:
        ret_rate: float | int = 1
    else:
        dec = (Decimal(len(preserved)) / Decimal(total_prot)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        ret_rate = int(dec) if dec == int(dec) else float(dec)

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


def verify_revision_bundle(
    before_text: str,
    after_text: str,
    *,
    filename: str = "<memory>",
    modality: str | None = None,
    pack: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
    register: str | None = None,
    keep_terms: list[str] | None = None,
    allow_added: bool = False,
    strict: bool = False,
) -> dict[str, Any]:
    bef = str(before_text or "")
    aft = str(after_text or "")
    mod = modality or detect_modality(filename) or "markdown"
    cfg = config or {}
    reg_info = resolve_register(bef, filename=filename, flag_register=register, config=cfg)
    eff_register = reg_info["register"]
    fact_ledger = verify_revision(bef, aft, allow_added=allow_added)

    requested: list[str] = []
    seen_keep: set[str] = set()
    for t in (keep_terms or []):
        clean = str(t or "").strip()
        if not clean or clean in seen_keep:
            continue
        seen_keep.add(clean)
        requested.append(clean)
    aft_lower = aft.lower()
    kept: list[str] = []
    missing_terms: list[str] = []
    for term in requested:
        is_ascii = bool(re.match(r"^[A-Za-z0-9 _.-]+$", term, re.ASCII))
        present = (term.lower() in aft_lower) if is_ascii else (term in aft)
        if present:
            kept.append(term)
        else:
            missing_terms.append(term)
    keep_terms_check = {"requested": requested, "kept": kept, "missing": missing_terms}

    findings_delta: dict[str, Any] | None = None
    if pack is not None:
        before_res = audit_text(bef, filename=filename, modality=mod, pack=pack, config=cfg, register=eff_register)
        after_res = audit_text(aft, filename=filename, modality=mod, pack=pack, config=cfg, register=eff_register)
        before_counts: Counter[str] = Counter()
        after_counts: Counter[str] = Counter()
        for f in before_res["findings"]:
            before_counts[f"{f['ruleId']}|{f.get('match', '')}"] += 1
        for f in after_res["findings"]:
            after_counts[f"{f['ruleId']}|{f.get('match', '')}"] += 1
        resolved_count = sum(max(0, bc - after_counts.get(k, 0)) for k, bc in before_counts.items())
        seen_after: Counter[str] = Counter()
        introduced: list[dict[str, Any]] = []
        for f in after_res["findings"]:
            k = f"{f['ruleId']}|{f.get('match', '')}"
            seen_after[k] += 1
            if seen_after[k] > before_counts.get(k, 0):
                introduced.append({
                    "ruleId": f["ruleId"],
                    "severity": f["severity"],
                    "fixStrategy": f["fixStrategy"],
                    "line": f["line"],
                    "col": f["col"],
                    "match": f["match"],
                })
        findings_delta = {
            "beforeCount": len(before_res["findings"]),
            "afterCount": len(after_res["findings"]),
            "resolvedCount": resolved_count,
            "introduced": introduced,
            "introducedErrors": sum(1 for x in introduced if x["severity"] == "error"),
        }

    before_chars = len(bef.strip())
    after_chars = len(aft.strip())
    ratio = (
        1
        if before_chars == 0
        else _clean_num(float((Decimal(after_chars) / Decimal(before_chars)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)))
    )
    length_status = "ok"
    if before_chars >= 120 and ratio < 0.5:
        length_status = "over-compressed"
    elif 60 <= before_chars <= 160 and ratio > 1.8:
        length_status = "over-expanded"
    length_check = {
        "beforeChars": before_chars,
        "afterChars": after_chars,
        "ratio": ratio,
        "status": length_status,
    }

    before_prof = analyze_text_profile(bef, modality=mod, config=cfg)
    after_prof = analyze_text_profile(aft, modality=mod, config=cfg)
    deg_warnings: list[dict[str, Any]] = []

    def _count_persp(s: str) -> int:
        zh_n = len(re.findall(r"(?:我|我们|咱们|你|你们)", s))
        en_n = len(re.findall(r"\b(?:I|we|my|our|you|your)\b", s, re.I | re.ASCII))
        return zh_n + en_n

    before_persp = _count_persp(bef)
    after_persp = _count_persp(aft)
    perspective_preserved = not (before_persp >= 2 and after_persp == 0)
    if not perspective_preserved:
        deg_warnings.append({
            "code": "voice-perspective-erased",
            "severity": "warning",
            "message": {
                "en": "Original author perspective (first/second person) was erased into impersonal prose.",
                "zh": "原文的第一/第二人称作者视角被完全抹平，改成了冰冷的第三方腔。",
            },
        })

    if (
        eff_register not in {"technical", "official"}
        and before_prof["sentenceCount"] >= 4
        and after_prof["sentenceCount"] >= 4
        and before_prof["burstiness"]["cv"] >= 0.32
        and after_prof["burstiness"]["cv"] < 0.22
        and (before_prof["burstiness"]["cv"] - after_prof["burstiness"]["cv"]) >= 0.12
    ):
        deg_warnings.append({
            "code": "cadence-flattened",
            "severity": "warning",
            "message": {
                "en": "Sentence rhythm was flattened into uniform cadence, losing the original phrasing variation.",
                "zh": "原文错落的句长节奏被压平变呆板，丢失了自然的表达起伏。",
            },
        })

    casual_marker_re = re.compile(r"(?:自己收|只出|咱们|大伙|顺手|包邮|私聊|闲置|\b(?:folks|gonna|wanna|my own)\b)", re.I)
    stiff_bookish_re = re.compile(r"(?:旨在|谨此|兹有|切勿|务必|仅出|略有|偶见|赋能|抓手|闭环|\b(?:thereof|herein|pursuant to|endeavor to|facilitate)\b)", re.I)
    slang_drift_re = re.compile(r"(?:家人们|绝绝子|咱就是说|尊嘟假嘟|\b(?:no cap|frfr|lowkey)\b)", re.I)
    bef_casual_hits = len(casual_marker_re.findall(bef))
    bef_stiff_set = {x.lower() for x in stiff_bookish_re.findall(bef)}
    aft_new_stiff = [x for x in stiff_bookish_re.findall(aft) if x.lower() not in bef_stiff_set]
    is_casual_register = eff_register == "casual" or (bef_casual_hits >= 2 and not bef_stiff_set)
    if is_casual_register and len(aft_new_stiff) >= 2:
        deg_warnings.append({
            "code": "register-drift",
            "severity": "warning",
            "message": {
                "en": "Conversational wording drifted into stiff bookish/bureaucratic prose instead of keeping the original casual voice.",
                "zh": "口语/个人表达被改写成生硬书面或公文腔，丢掉了原本的自然口吻。",
            },
        })
    elif (eff_register in {"official", "technical"} or (pack and pack.get("id") in {"regulated-comms", "engineering-spec"})) and not slang_drift_re.search(bef) and slang_drift_re.search(aft):
        deg_warnings.append({
            "code": "register-drift",
            "severity": "warning",
            "message": {
                "en": "Formal/technical draft drifted into fake-casual internet slang.",
                "zh": "正式或技术文本中混入了轻浮网络口水词，与当前写作场景不符。",
            },
        })

    if (
        before_prof["concreteness"]["anchorCount"] >= 3
        and after_prof["concreteness"]["anchorCount"] < before_prof["concreteness"]["anchorCount"] * 0.7
    ):
        deg_warnings.append({
            "code": "information-loss",
            "severity": "warning",
            "message": {
                "en": "Concrete facts, metrics, paths, or examples dropped by >30%, reducing information density.",
                "zh": "具体数字、路径、时间或实例锚点流失超过 30%，信息量受损。",
            },
        })

    modality_buckets = [
        ("estimate", re.compile(r"(?:预计|约|大约|估算|大概|\b(?:projected|estimated|approx(?:imately)?|roughly|target)\b)", re.I | re.ASCII)),
        ("condition", re.compile(r"(?:仅在|除非|前提是|当且仅当|\b(?:only when|unless|provided that|if and only if)\b)", re.I | re.ASCII)),
        ("unverified", re.compile(r"(?:暂未|尚未|待确认|待验证|\b(?:pending|unverified|not yet)\b)", re.I | re.ASCII)),
        ("measured", re.compile(r"(?:实测|压测|基准测试|\b(?:measured|benchmarked|observed)\b)", re.I | re.ASCII)),
    ]
    modality_drifts = [b_name for b_name, b_re in modality_buckets if b_re.search(bef) and not b_re.search(aft)]
    if modality_drifts:
        joined_drifts = ", ".join(modality_drifts)
        deg_warnings.append({
            "code": "modality-drifted",
            "severity": "error",
            "message": {
                "en": f"Precision/modality qualifiers dropped ({joined_drifts}); revision may overclaim or lose scope bounds.",
                "zh": f"边界或模态限定词丢失（{joined_drifts}），改稿可能导致表述失准或过度承诺。",
            },
        })

    if findings_delta is not None and findings_delta["introduced"]:
        deg_warnings.append({
            "code": "secondary-slop-introduced",
            "severity": "error" if findings_delta["introducedErrors"] > 0 else "warning",
            "message": {
                "en": "Revision introduced new AI-slop pattern(s) not present in the original.",
                "zh": "改稿新引入了原文原本没有的 AI 套路或残留问题。",
            },
        })

    if length_status == "over-compressed":
        deg_warnings.append({
            "code": "over-compressed",
            "severity": "warning",
            "message": {
                "en": "Revision shrank below 50% of original length; verify no substance or nuance was stripped.",
                "zh": "改稿篇幅被压缩至原文 50% 以下，请核对是否误删干货或细节。",
            },
        })
    elif length_status == "over-expanded":
        deg_warnings.append({
            "code": "over-expanded",
            "severity": "warning",
            "message": {
                "en": "Short UI/label copy expanded above 180% of original length; check layout overflow risk.",
                "zh": "短文案被扩写超过原文 180%，注意检查界面换行或卡片溢出。",
            },
        })

    anti_degradation = {
        "status": "preserved" if not deg_warnings else "degraded",
        "warnings": deg_warnings,
        "metrics": {
            "beforeCv": before_prof["burstiness"]["cv"],
            "afterCv": after_prof["burstiness"]["cv"],
            "beforeAnchors": before_prof["concreteness"]["anchorCount"],
            "afterAnchors": after_prof["concreteness"]["anchorCount"],
            "perspectivePreserved": perspective_preserved,
            "modalityDrifts": modality_drifts,
            "secondarySlopCount": len(findings_delta["introduced"]) if findings_delta is not None else 0,
        },
    }

    hard_pass = (
        fact_ledger["status"] == "preserved"
        and len(missing_terms) == 0
        and len(modality_drifts) == 0
        and (findings_delta["introducedErrors"] == 0 if findings_delta is not None else True)
    )
    ok = hard_pass and ((not strict) or len(deg_warnings) == 0)

    out: dict[str, Any] = {
        "schema": "dislop.verify/1",
        "ok": ok,
        "status": "passed" if ok else "failed",
        "factLedger": fact_ledger,
        "keepTerms": keep_terms_check,
        "lengthCheck": length_check,
        "antiDegradation": anti_degradation,
    }
    if findings_delta is not None:
        out["findingsDelta"] = findings_delta
    return out


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
