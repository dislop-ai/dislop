"""Zero-dependency MCP stdio JSON-RPC server matching `bin/dislop.mjs --mcp`."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import math
import zipfile
from .engine import (
    ENGINE_VERSION,
    VALID_REGISTERS,
    analyze_text_profile,
    apply_register_override,
    audit_text,
    build_catalog,
    build_finding_revision,
    build_zones,
    compute_finding_confidence,
    compute_ruleset_hash,
    derive_fix_strategy,
    detect_modality,
    extract_voice_profile_offline,
    fnv1a_hex,
    load_all_packs,
    load_config,
    load_pattern_library,
    pick_pack_for_file,
    query_catalog,
    resolve_config_for_file,
    resolve_register,
    verify_revision_bundle,
)
from .local_model import build_model_status_report
from .pattern_engine import audit_patterns, load_pattern_banks
from .pocket_model import analyze_document_with_pocket_models


def _merge_pattern_bank_findings(
    existing_findings: list[dict[str, Any]],
    pat_findings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    seen = {f"{f.get('ruleId')}:{f.get('line')}" for f in existing_findings}
    out = list(existing_findings)
    for pf in pat_findings:
        key = f"{pf.get('ruleId')}:{pf.get('line')}"
        if key in seen:
            continue
        seen.add(key)
        out.append(pf)
    return out


def _build_pocket_ml_findings_mcp(
    text: str,
    filename: str,
    existing_findings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    doc = analyze_document_with_pocket_models(text)
    extras: list[dict[str, Any]] = []
    mod = detect_modality(filename) or "markdown"
    for p in doc["paragraphs"]:
        if not p["flagged"]:
            continue
        if any(p["startLine"] <= f.get("line", -1) <= p["endLine"] for f in existing_findings):
            continue
        pct = int(math.floor(p["slopProbability"] * 100.0 + 0.5))
        drv_en = "; ".join(d["reason"]["en"] for d in p["topDrivers"]) or "uniform abstract phrasing"
        drv_zh = "、".join(d["reason"]["zh"] for d in p["topDrivers"]) or "句式与用词高度均质"
        loc = str(p["startLine"])
        clean_excerpt = str(p.get("excerpt") or "")
        fp = f"pocket-stealth-vapor:{fnv1a_hex(f'pocket-stealth-vapor|{clean_excerpt.lower()}|{loc}')}"
        extras.append({
            "fingerprint": fp,
            "ruleId": "pocket-stealth-vapor",
            "packId": "pocket-model",
            "severity": "warning",
            "tier": "taste",
            "fixStrategy": "rephrase",
            "family": "rhythm/pocket-stealth-vapor",
            "category": "statistical-vapor",
            "modality": mod,
            "file": filename,
            "location": loc,
            "line": p["startLine"],
            "col": 1,
            "endLine": p["endLine"],
            "match": clean_excerpt,
            "excerpt": clean_excerpt,
            "mlProbability": p["slopProbability"],
            "message": {
                "en": f"Paragraph reads as predictable low-concreteness AI filler ({pct}% pocket-ML score: {drv_en}).",
                "zh": f"段落呈高度可预测、低事实密度的温吞水套话（内置模型评分 {pct}%：{drv_zh}）。",
            },
            "deletionTest": {
                "en": "Cut this paragraph or replace abstract cushion wrappers with one concrete event, number, file path, or direct action.",
                "zh": "删掉整段空泛铺垫，或把抽象缓冲外壳直接换成具体事件、数字、文件路径或明确动作。",
            },
        })
    return extras


def _send(msg: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _tool_result(req_id: Any, payload: dict[str, Any], is_error: bool = False) -> None:
    _send(
        {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "isError": is_error,
                "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=2)}],
            },
        }
    )


def _localize_obj(obj: Any, lang: str | None) -> Any:
    if not isinstance(obj, dict) or lang not in {"en", "zh"}:
        return obj
    return {lang: obj.get(lang) or obj.get("en") or ""}


def _format_rule_for_explain(rule: dict[str, Any], pack_id: str, lang: Any) -> dict[str, Any]:
    clean_lang = lang if lang in {"en", "zh"} else None
    out: dict[str, Any] = {
        "packId": pack_id,
        "id": rule["id"],
        "tier": rule.get("tier"),
        "severity": rule.get("severity"),
    }
    if rule.get("category"):
        out["category"] = rule["category"]
    if rule.get("family"):
        out["family"] = rule["family"]
    out["modalities"] = rule.get("modalities") or []
    if isinstance(rule.get("tags"), list):
        out["tags"] = rule["tags"]
    out["message"] = _localize_obj(rule.get("message"), clean_lang)
    out["deletionTest"] = _localize_obj(rule.get("deletionTest"), clean_lang)
    if rule.get("exemplar"):
        ex = dict(rule["exemplar"])
        if ex.get("note"):
            ex["note"] = _localize_obj(ex["note"], clean_lang)
        out["exemplar"] = ex
    return out


def _localize_revision(rev: Any, clean_lang: str | None) -> Any:
    if not rev:
        return None
    if not clean_lang:
        return rev
    return {
        **rev,
        "instruction": _localize_obj(rev.get("instruction"), clean_lang),
        "avoid": _localize_obj(rev.get("avoid"), clean_lang),
    }


def _format_findings_for_mcp(findings: list[dict[str, Any]], verbosity: str, lang: Any) -> list[dict[str, Any]]:
    clean_lang = lang if lang in {"en", "zh"} else None
    if verbosity == "full":
        if not clean_lang:
            return findings
        return [
            {
                **f,
                "message": _localize_obj(f.get("message"), clean_lang),
                "deletionTest": _localize_obj(f.get("deletionTest"), clean_lang),
                "revision": _localize_revision(f.get("revision"), clean_lang),
            }
            for f in findings
        ]
    return [
        {
            "fingerprint": f.get("fingerprint"),
            "ruleId": f.get("ruleId"),
            "tier": f.get("tier") if f.get("tier") is not None else "taste",
            "severity": f.get("severity"),
            "confidence": f.get("confidence") or "medium",
            "fixStrategy": f.get("fixStrategy") or derive_fix_strategy({"id": f.get("ruleId"), "family": f.get("family")}),
            "family": f.get("family") if f.get("family") is not None else (f"{f['dimension']}/{f['ruleId']}" if f.get("dimension") else None),
            "file": f.get("file"),
            "modality": f.get("modality"),
            "location": f.get("location"),
            "line": f.get("line"),
            "col": f.get("col"),
            "match": f.get("match"),
            "message": _localize_obj(f.get("message"), clean_lang),
            "deletionTest": _localize_obj(f.get("deletionTest"), clean_lang) if f.get("deletionTest") else None,
            "revision": _localize_revision(f.get("revision"), clean_lang),
        }
        for f in findings
    ]


OFFLINE_TOOL_ANNOTATIONS = {
    "readOnlyHint": True,
    "idempotentHint": True,
    "destructiveHint": False,
    "openWorldHint": False,
}

TOOLS = [
    {
        "name": "dislop_check",
        "description": (
            "Check a draft (`text` or workspace-relative `path`) for AI-generation artifacts, clichés, and template slop "
            "across Markdown, HTML/CSS/JSX/SVG, PNG/JPEG/WebP, Word (.docx), PowerPoint (.pptx), and PDF. Edit only the flagged spans using `fixStrategy`, then run `dislop_verify`."
        ),
        "annotations": OFFLINE_TOOL_ANNOTATIONS,
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Draft text to inspect in memory"},
                "path": {"type": "string", "description": "Workspace-relative file path (.md, .html, .css, .jsx, .svg, .png, .jpg, .jpeg, .webp, .docx, .pptx, .pdf)"},
                "pack": {"type": "string", "description": "Style pack ID (auto, business-brief, engineering-spec, regulated-comms, literary-essay, deck-and-ui, executive-deck)"},
                "register": {"type": "string", "enum": ["auto", *VALID_REGISTERS], "description": "Optional writing register override (auto, unspecified, official, casual, argumentative, technical, marketing, narrative)"},
                "filename": {"type": "string", "description": "Virtual filename hint when inspecting `text`"},
                "profile": {"type": "boolean", "description": "Include 5-axis rhythm & concreteness telemetry on text/markdown (default true)"},
                "deep": {"type": "boolean", "description": "Enable thorough inspection (Pocket ML + extended 6-dimension pattern bank)"},
                "ml": {"type": "boolean", "description": "Enable bundled 15 KB Pocket ML stealth-vapor paragraph detection (default false)"},
                "patterns": {"type": "boolean", "description": "Include extended 6-dimension pattern-bank probes (default false)"},
                "verbosity": {"type": "string", "enum": ["compact", "full"], "description": "Default compact (omits per-hit exemplars to save context tokens; pass full to inline exemplars)"},
                "lang": {"type": "string", "enum": ["en", "zh"], "description": "Optional single-locale filter for finding messages"},
            },
        },
    },
    {
        "name": "dislop_verify",
        "description": (
            "Verify a revised draft against its original text (or Git baseline for workspace `path`): checks numbers/qualifiers, "
            "required `keep` terms, newly introduced AI slop, length bounds, and anti-degradation guardrails (author perspective, cadence, info density, modality)."
        ),
        "annotations": OFFLINE_TOOL_ANNOTATIONS,
        "inputSchema": {
            "type": "object",
            "properties": {
                "before": {"type": "string", "description": "Original text before revision (required unless `path` is provided)"},
                "after": {"type": "string", "description": "Revised text after revision (required unless `path` is provided)"},
                "path": {"type": "string", "description": "Workspace-relative file path to compare working tree against `gitRef`"},
                "gitRef": {"type": "string", "description": "Git ref baseline when `path` is given (default HEAD)"},
                "filename": {"type": "string", "description": "Optional virtual filename hint when passing `before`/`after`"},
                "pack": {"type": "string", "description": "Optional pack ID or 'auto' to also verify findingsDelta"},
                "register": {"type": "string", "enum": ["auto", *VALID_REGISTERS], "description": "Optional writing register override (auto, unspecified, official, casual, argumentative, technical, marketing, narrative)"},
                "keep": {"type": "array", "items": {"type": "string"}, "description": "Protected terms/concepts that must stay intact in the revision"},
                "allowAdded": {"type": "boolean", "description": "Allow new numbers not present in original (default false)"},
                "strict": {"type": "boolean", "description": "Fail `ok` on any anti-degradation warning in addition to hard fact/error checks"},
            },
        },
    },
    {
        "name": "dislop_rules",
        "description": "Unified rule lookup: pass `ruleId` to explain a rule, filters (`query`/`pack`/`dimension`) to search, or empty object to list all packs.",
        "annotations": OFFLINE_TOOL_ANNOTATIONS,
        "inputSchema": {
            "type": "object",
            "properties": {
                "ruleId": {"type": "string", "description": "Optional rule ID to explain with before/trap/after examples"},
                "query": {"type": "string", "description": "Optional keyword search query"},
                "pack": {"type": "string", "description": "Filter rules by style pack ID"},
                "category": {"type": "string", "description": "Filter rules by category identifier"},
                "dimension": {"type": "string", "description": "Filter pattern bank rules by writing dimension"},
                "family": {"type": "string", "description": "Filter pattern bank rules by pattern family"},
                "modality": {"type": "string", "description": "Filter rules by target content modality (text, web, doc, visual)"},
                "severity": {"type": "string", "enum": ["error", "warning", "info"], "description": "Filter rules by severity level"},
                "tier": {"type": "string", "enum": ["invariant", "taste"], "description": "Filter rules by enforcement tier (invariant or taste)"},
                "lang": {"type": "string", "enum": ["en", "zh"], "description": "Optional single-locale filter for rule descriptions and examples"},
                "includeExemplars": {"type": "boolean", "description": "Include before/trap/after examples in search results (default false)"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "description": "Maximum number of matching rules to return (1..100)"},
            },
        },
    },
    {
        "name": "dislop_voice_extract",
        "description": "Extract a deterministic offline `dislop.voice/1` personal style card from 1-15 clean author samples (0 network calls, 0 uploads).",
        "annotations": OFFLINE_TOOL_ANNOTATIONS,
        "inputSchema": {
            "type": "object",
            "properties": {
                "samples": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 15,
                    "description": "1 to 15 clean sample passages written by the author",
                },
                "lang": {"type": "string", "enum": ["auto", "en", "zh"], "description": "Language hint for style extraction (auto, en, or zh)"},
            },
            "required": ["samples"],
        },
    },
    {
        "name": "dislop_model_score",
        "description": (
            "Run the bundled zero-dependency 15 KB Pocket ML ensemble (`pocket-slop-v1`) + 5-domain pack router on `text` "
            "to detect clean-wordlist stealth AI vapor paragraphs and explain top contributing signals (0 network calls)."
        ),
        "annotations": OFFLINE_TOOL_ANNOTATIONS,
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Draft text to score with bundled Pocket ML"},
                "threshold": {"type": "number", "description": "Optional paragraph flag threshold (0..1)"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "dislop_model_status",
        "description": "Inspect bundled models, installed optional model weights, hardware memory budget, and recommended optional local model tier.",
        "annotations": OFFLINE_TOOL_ANNOTATIONS,
        "inputSchema": {"type": "object", "properties": {}},
    },
]


def run_mcp_stdio() -> None:
    packs = load_all_packs()
    pattern_by_rule_id = load_pattern_library()
    catalog_entries = build_catalog(packs, pattern_by_rule_id)
    cwd = Path.cwd().resolve()

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        if not isinstance(req, dict):
            _send({
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32600, "message": "Invalid Request: expected JSON-RPC object"},
            })
            continue
        req_id = req.get("id")
        if req_id is None:
            continue
        method = req.get("method")
        raw_params = req.get("params")
        if raw_params is not None and not isinstance(raw_params, dict):
            _send({
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32600, "message": "Invalid Request: params must be an object"},
            })
            continue
        params = raw_params or {}

        if method == "initialize":
            client_ver = params.get("protocolVersion", "2024-11-05")
            _send(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": client_ver,
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "dislop", "version": ENGINE_VERSION},
                    },
                }
            )
            continue

        if method == "ping":
            _send({"jsonrpc": "2.0", "id": req_id, "result": {}})
            continue

        if method == "tools/list":
            _send({"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}})
            continue

        if method == "tools/call":
            name = params.get("name")
            raw_args = params.get("arguments")
            if raw_args is not None and not isinstance(raw_args, dict):
                _send({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32602, "message": "Invalid params: arguments must be an object"},
                })
                continue
            args = raw_args or {}
            try:
                def _resolve_explain_by_id(rid: str, lang_arg: Any) -> dict[str, Any] | None:
                    for p in packs.values():
                        for r in p.get("rules", []):
                            if r["id"] == rid:
                                return _format_rule_for_explain(r, p["id"], lang_arg)
                    if rid in pattern_by_rule_id:
                        pat = pattern_by_rule_id[rid]
                        guards_list = pat.get("falsePositiveGuards") or []
                        guards = " ".join(guards_list) if isinstance(guards_list, list) else ""
                        dim = pat.get("dimension")
                        synth_rule: dict[str, Any] = {
                            "id": rid,
                            "tier": "taste",
                            "severity": pat.get("severityDefault") or "info",
                            "category": pat.get("category") or "general",
                            "family": f"{dim}/{rid}" if dim else "pattern-bank",
                            "modalities": list(pat.get("modalities") or ["markdown", "text"]),
                            "tags": list(pat.get("tags") or []),
                            "message": pat.get("mechanism") or pat.get("name") or {"en": "", "zh": ""},
                        }
                        if guards:
                            synth_rule["deletionTest"] = {"en": guards, "zh": guards}
                        if pat.get("exemplar"):
                            synth_rule["exemplar"] = pat["exemplar"]
                        return _format_rule_for_explain(synth_rule, pat.get("packId") or "pattern-bank", lang_arg)
                    if rid == "pocket-stealth-vapor":
                        from .cli import _POCKET_STEALTH_VAPOR_RULE
                        return _format_rule_for_explain(_POCKET_STEALTH_VAPOR_RULE, "pocket-model", lang_arg)
                    return None

                if name == "dislop_rules":
                    if args.get("ruleId"):
                        found = _resolve_explain_by_id(str(args["ruleId"]), args.get("lang"))
                        if found:
                            _tool_result(req_id, found)
                        else:
                            _tool_result(req_id, {"error": f"Unknown ruleId '{args['ruleId']}'"}, True)
                        continue
                    has_filter = any(
                        bool(args.get(k))
                        for k in ("query", "pack", "category", "dimension", "family", "modality", "severity", "tier")
                    )
                    if has_filter:
                        result = query_catalog(
                            catalog_entries,
                            {
                                "query": args.get("query") or "",
                                "pack": args.get("pack"),
                                "category": args.get("category"),
                                "dimension": args.get("dimension"),
                                "family": args.get("family"),
                                "modality": args.get("modality"),
                                "severity": args.get("severity"),
                                "tier": args.get("tier"),
                                "includeExemplars": args.get("includeExemplars", True) is not False,
                                "limit": args.get("limit") if isinstance(args.get("limit"), int) and args.get("limit") > 0 else None,
                            },
                        )
                        _tool_result(req_id, result)
                        continue
                    items = [
                        {
                            "id": p["id"],
                            "tier": p.get("tier"),
                            "name": p["name"],
                            "modalities": p["modalities"],
                            "ruleCount": len(p.get("rules", [])),
                            "summary": p["summary"],
                        }
                        for p in packs.values()
                    ]
                    _tool_result(req_id, {"packs": items})
                    continue

                if name == "dislop_verify":
                    from .cli import _read_git_baseline_for_file, _read_utf8_exact, _resolve_text_pack_and_source

                    live_config = load_config(cwd)
                    has_before = isinstance(args.get("before"), str)
                    has_after = isinstance(args.get("after"), str)
                    has_path = isinstance(args.get("path"), str) and bool(args["path"].strip())
                    if has_path:
                        real_cwd = cwd.resolve()
                        resolved = (cwd / str(args["path"])).resolve()
                        try:
                            rel = resolved.relative_to(real_cwd).as_posix()
                        except ValueError:
                            _tool_result(req_id, {"error": "Path must stay within the current workspace directory."}, True)
                            continue
                        if not resolved.is_file():
                            _tool_result(req_id, {"error": f"File not found: {args['path']}"}, True)
                            continue
                        fn = rel
                        after_text = _read_utf8_exact(resolved)
                        g_ref = str(args.get("gitRef") or "HEAD").strip() or "HEAD"
                        before_text = _read_git_baseline_for_file(resolved, g_ref)
                    elif has_before and has_after:
                        fn = str(args.get("filename") or "draft.md")
                        before_text = args["before"]
                        after_text = args["after"]
                    else:
                        _tool_result(req_id, {"error": "Provide both `before` and `after` strings, or a workspace `path`."}, True)
                        continue
                    mod = detect_modality(fn) or "markdown"
                    file_cfg = resolve_config_for_file(fn, live_config)
                    arg_register: str | None = None
                    if args.get("register") is not None:
                        if not isinstance(args.get("register"), str):
                            joined = ", ".join(VALID_REGISTERS)
                            _tool_result(
                                req_id,
                                {"error": f"Invalid register (expected string: auto, {joined})"},
                                True,
                            )
                            continue
                        raw_reg = args["register"]
                        norm_reg = raw_reg.strip().lower()
                        if not norm_reg or (norm_reg != "auto" and norm_reg not in VALID_REGISTERS):
                            joined = ", ".join(VALID_REGISTERS)
                            _tool_result(
                                req_id,
                                {"error": f"Invalid register '{raw_reg}' (expected auto, {joined})"},
                                True,
                            )
                            continue
                        arg_register = norm_reg
                    pack_obj, eff_pack, pack_source = _resolve_text_pack_and_source(
                        after_text, fn, mod, args.get("pack") or "auto", file_cfg, packs
                    )
                    raw_keep = args.get("keep")
                    if isinstance(raw_keep, list):
                        keep_terms = [str(x).strip() for x in raw_keep if str(x).strip()]
                    elif isinstance(raw_keep, str):
                        keep_terms = [x.strip() for x in raw_keep.split(",") if x.strip()]
                    else:
                        keep_terms = []
                    out = verify_revision_bundle(
                        before_text,
                        after_text,
                        filename=fn,
                        modality=mod,
                        pack=pack_obj,
                        config=file_cfg,
                        register=arg_register,
                        keep_terms=keep_terms,
                        allow_added=bool(args.get("allowAdded")),
                        strict=bool(args.get("strict")),
                    )
                    out["effectivePack"] = eff_pack
                    out["packSource"] = pack_source
                    _tool_result(req_id, out)
                    continue

                if name == "dislop_packs":
                    items = [
                        {
                            "id": p["id"],
                            "tier": p.get("tier"),
                            "name": p["name"],
                            "modalities": p["modalities"],
                            "ruleCount": len(p.get("rules", [])),
                            "summary": p["summary"],
                        }
                        for p in packs.values()
                    ]
                    _tool_result(req_id, {"packs": items})
                    continue

                if name == "dislop_catalog":
                    result = query_catalog(
                        catalog_entries,
                        {
                            "query": args.get("query") or "",
                            "pack": args.get("pack"),
                            "category": args.get("category"),
                            "dimension": args.get("dimension"),
                            "family": args.get("family"),
                            "modality": args.get("modality"),
                            "severity": args.get("severity"),
                            "tier": args.get("tier"),
                            "includeExemplars": args.get("includeExemplars", True) is not False,
                            "limit": args.get("limit") if isinstance(args.get("limit"), int) and args.get("limit") > 0 else None,
                        },
                    )
                    _tool_result(req_id, result)
                    continue

                if name == "dislop_explain":
                    rid = args.get("ruleId")
                    if not rid:
                        _tool_result(req_id, {"error": "Missing required argument `ruleId`"}, True)
                        continue
                    found = None
                    for p in packs.values():
                        for r in p.get("rules", []):
                            if r["id"] == rid:
                                found = _format_rule_for_explain(r, p["id"], args.get("lang"))
                                break
                    if not found and rid in pattern_by_rule_id:
                        pat = pattern_by_rule_id[rid]
                        guards_list = pat.get("falsePositiveGuards") or []
                        guards = " ".join(guards_list) if isinstance(guards_list, list) else ""
                        dim = pat.get("dimension")
                        synth_rule: dict[str, Any] = {
                            "id": rid,
                            "tier": "taste",
                            "severity": pat.get("severityDefault") or "info",
                            "category": pat.get("category") or "general",
                            "family": f"{dim}/{rid}" if dim else "pattern-bank",
                            "modalities": list(pat.get("modalities") or ["markdown", "text"]),
                            "tags": list(pat.get("tags") or []),
                            "message": pat.get("mechanism") or pat.get("name") or {"en": "", "zh": ""},
                        }
                        if guards:
                            synth_rule["deletionTest"] = {"en": guards, "zh": guards}
                        if pat.get("exemplar"):
                            synth_rule["exemplar"] = pat["exemplar"]
                        found = _format_rule_for_explain(synth_rule, pat.get("packId") or "pattern-bank", args.get("lang"))
                    if not found and rid == "pocket-stealth-vapor":
                        from .cli import _POCKET_STEALTH_VAPOR_RULE

                        found = _format_rule_for_explain(_POCKET_STEALTH_VAPOR_RULE, "pocket-model", args.get("lang"))
                    if found:
                        _tool_result(req_id, found)
                    else:
                        _tool_result(req_id, {"error": f"Unknown ruleId '{rid}'"}, True)
                    continue

                if name == "dislop_check":
                    has_text = isinstance(args.get("text"), str)
                    has_path = isinstance(args.get("path"), str) and bool(args["path"].strip())
                    if has_text == has_path:
                        _tool_result(
                            req_id,
                            {"error": "Provide exactly one of `text` (in-memory string) or `path` (workspace file path)."},
                            True,
                        )
                        continue

                    from .cli import (
                        PROSE_ML_MODALITIES,
                        _build_pocket_ml_findings,
                        _collect_text_coverage_warnings,
                        _inspect_single_file_full,
                        _merge_pattern_bank_findings,
                        _resolve_text_pack_and_source,
                    )

                    live_config = load_config(cwd)
                    verbosity = "full" if args.get("verbosity") == "full" else "compact"
                    include_ml = bool(args.get("ml") or args.get("deep"))
                    include_patterns = bool(args.get("patterns") or args.get("deep"))
                    want_profile = args.get("profile") is not False
                    banks = load_pattern_banks() if include_patterns else None

                    arg_register: str | None = None
                    if args.get("register") is not None:
                        if not isinstance(args.get("register"), str):
                            joined = ", ".join(VALID_REGISTERS)
                            _tool_result(
                                req_id,
                                {"error": f"Invalid register (expected string: auto, {joined})"},
                                True,
                            )
                            continue
                        raw_reg = args["register"]
                        norm_reg = raw_reg.strip().lower()
                        if not norm_reg or (norm_reg != "auto" and norm_reg not in VALID_REGISTERS):
                            joined = ", ".join(VALID_REGISTERS)
                            _tool_result(
                                req_id,
                                {"error": f"Invalid register '{raw_reg}' (expected auto, {joined})"},
                                True,
                            )
                            continue
                        arg_register = norm_reg

                    if has_text:
                        fn = args.get("filename") or "draft.md"
                        mod = detect_modality(fn) or "markdown"
                        file_cfg = resolve_config_for_file(fn, live_config)
                        pack, eff_pack, pack_source = _resolve_text_pack_and_source(
                            args["text"], fn, mod, args.get("pack"), file_cfg, packs
                        )
                        reg_info = resolve_register(args["text"], filename=fn, flag_register=arg_register, config=file_cfg)
                        res = audit_text(args["text"], filename=fn, modality=mod, pack=pack, config=file_cfg, register=arg_register)
                        findings = list(res["findings"])
                        if include_patterns:
                            pat_res = audit_patterns(args["text"], filename=fn, modality=mod, banks=banks, config=file_cfg)
                            findings = _merge_pattern_bank_findings(
                                findings,
                                pat_res["findings"],
                                packs=packs,
                                pack=pack,
                                register=reg_info["register"],
                                config=file_cfg,
                            )
                        needs_coverage_profile = len(args["text"]) >= 2000 or mod == "html"
                        profile = (
                            analyze_text_profile(args["text"], modality=mod, config=file_cfg)
                            if (mod in PROSE_ML_MODALITIES and (want_profile or include_ml or needs_coverage_profile))
                            else None
                        )
                        if include_ml and mod in PROSE_ML_MODALITIES:
                            ml_src = (
                                build_zones(args["text"], mod, {"proseFences": file_cfg.get("proseFences"), "maskBlockquotes": file_cfg.get("maskBlockquotes")})["prose"]
                                if mod in {"html", "svg"}
                                else args["text"]
                            )
                            _, ml_extras = _build_pocket_ml_findings(
                                ml_src,
                                fn,
                                findings,
                                profile=profile,
                                modality=mod,
                                register=reg_info["register"],
                            )
                            findings.extend(ml_extras)
                        formatted = _format_findings_for_mcp(findings, verbosity, args.get("lang"))
                        payload: dict[str, Any] = {
                            "pack": eff_pack,
                            "packSource": pack_source,
                            "rulesetHash": compute_ruleset_hash(pack),
                            "modality": mod,
                            "context": {"register": reg_info["register"], "registerSource": reg_info["registerSource"]},
                            "checked": True,
                            "skipped": [],
                            "coverageWarnings": _collect_text_coverage_warnings(args["text"], mod, fn, profile),
                            "count": len(formatted),
                            "findings": formatted,
                        }
                        if verbosity == "compact" and formatted:
                            payload["explainHint"] = "Call dislop_explain(ruleId) for before/trap/after examples."
                        if want_profile and profile is not None:
                            payload["profile"] = profile
                        _tool_result(req_id, payload)
                        continue

                    real_cwd = cwd.resolve()
                    resolved = (cwd / str(args["path"])).resolve()
                    try:
                        rel = resolved.relative_to(real_cwd).as_posix()
                    except ValueError:
                        _tool_result(req_id, {"error": "Path must stay within the current workspace directory."}, True)
                        continue
                    if not resolved.is_file():
                        _tool_result(req_id, {"error": f"File not found: {args['path']}"}, True)
                        continue
                    mod = detect_modality(resolved.name)
                    if not mod:
                        _tool_result(req_id, {"error": f"Unsupported file extension for '{args['path']}'"}, True)
                        continue
                    res = _inspect_single_file_full(
                        resolved,
                        rel,
                        mod,
                        packs,
                        args.get("pack"),
                        live_config,
                        include_ml=include_ml,
                        include_patterns=include_patterns,
                        include_profile=want_profile,
                        banks=banks,
                        register=arg_register,
                    )
                    profile = res["profileItem"]["profile"] if res.get("profileItem") else None
                    formatted = _format_findings_for_mcp(res["findings"], verbosity, args.get("lang"))
                    payload = {
                        "pack": res.get("effectivePack") or pick_pack_for_file(rel, mod, args.get("pack"), live_config),
                        "packSource": res.get("packSource"),
                        "rulesetHash": res.get("rulesetHash"),
                        "modality": mod,
                        "context": {"register": res.get("register") or "unspecified", "registerSource": res.get("registerSource") or "default"},
                        "checked": res["checked"],
                        "skipped": res["skipped"],
                        "coverageWarnings": res.get("coverageWarnings") or [],
                        "count": len(formatted),
                        "findings": formatted,
                    }
                    if verbosity == "compact" and formatted:
                        payload["explainHint"] = "Call dislop_explain(ruleId) for before/trap/after examples."
                    if profile is not None:
                        payload["profile"] = profile
                    _tool_result(req_id, payload)
                    continue

                if name in {"dislop_voice_extract_offline", "dislop_voice_extract"}:
                    samples = args.get("samples")
                    if not isinstance(samples, list) or not samples:
                        _tool_result(req_id, {"error": "Non-empty `samples` string array is required."}, True)
                        continue
                    if len(samples) > 15:
                        _tool_result(req_id, {"error": "Provide at most 15 sample passages per call."}, True)
                        continue
                    if any(not isinstance(s, str) for s in samples):
                        _tool_result(req_id, {"error": "Every element in `samples` must be a string."}, True)
                        continue
                    non_blank = [s.strip() for s in samples if s.strip()]
                    if not non_blank:
                        _tool_result(req_id, {"error": "At least one non-empty sample passage is required."}, True)
                        continue
                    voice = extract_voice_profile_offline(non_blank, lang=args.get("lang") or "auto")
                    _tool_result(req_id, voice)
                    continue

                if name == "dislop_model_score":
                    text_arg = args.get("text")
                    if not isinstance(text_arg, str):
                        _tool_result(req_id, {"error": "Required string argument `text` missing."}, True)
                        continue
                    thr = args.get("threshold")
                    if thr is not None:
                        if isinstance(thr, bool) or not isinstance(thr, (int, float)) or thr != thr or thr < 0.0 or thr > 1.0:
                            _tool_result(req_id, {"error": "`threshold` must be a number between 0 and 1."}, True)
                            continue
                    thr_val = float(thr) if thr is not None else None
                    _tool_result(req_id, analyze_document_with_pocket_models(text_arg, threshold=thr_val))
                    continue

                if name == "dislop_model_status":
                    rules_cnt = sum(len(p.get("rules", [])) for p in packs.values())
                    st = build_model_status_report(packs_count=len(packs), rules_count=rules_cnt, probe_loopback=False)
                    _tool_result(req_id, st)
                    continue

                _tool_result(req_id, {"error": f"Unknown tool '{name}'"}, True)
            except Exception as exc:
                _tool_result(req_id, {"error": str(exc)}, True)
            continue

        _send({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}})


def main() -> None:
    run_mcp_stdio()


if __name__ == "__main__":
    main()
