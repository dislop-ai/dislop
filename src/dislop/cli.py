"""Python CLI entrypoint matching `bin/dislop.mjs`."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .engine import (
    ENGINE_VERSION,
    SEVERITY_RANK,
    VALID_REGISTERS,
    analyze_text_profile,
    apply_register_override,
    audit_image_document,
    audit_ooxml_entries,
    audit_pdf_document,
    audit_text,
    build_catalog,
    build_finding_revision,
    build_line_starts,
    build_zones,
    collect_target_files,
    compute_finding_confidence,
    compute_ruleset_hash,
    default_pack_for_modality,
    derive_fix_strategy,
    detect_modality,
    discover_voice_card,
    extract_voice_profile_offline,
    find_patterns_dir,
    fnv1a_hex,
    get_scenario_strategy,
    has_embedded_ui_markup,
    inspect_file,
    is_long_form_html_document,
    load_all_packs,
    load_config,
    load_pattern_library,
    merge_packs,
    offset_to_line_col,
    parse_image_bytes,
    parse_pdf_bytes,
    pick_pack_for_file,
    query_catalog,
    resolve_config_for_file,
    resolve_effective_pack,
    resolve_register,
    rule_doc_url,
    verify_revision,
    verify_revision_bundle,
)
from .local_model import (
    LOCAL_MODEL_TIERS,
    build_model_status_report,
    import_local_model_file,
    install_optional_model,
    remove_installed_model,
    run_local_deslop,
)
from .mcp_server import run_mcp_stdio
from .pattern_engine import analyze_pattern_profile, audit_patterns, load_pattern_banks
from .pocket_model import analyze_document_with_pocket_models, predict_pack_with_pocket_router
from .review_client import (
    ReviewConfigError,
    assert_loopback_endpoint,
    build_review_prompt,
    chunk_text_by_paragraphs,
    extract_ooxml_review_text,
    inspect_byok_env_status,
    ping_endpoint_health,
    resolve_provider_config,
    run_review_request,
    scrub_secrets,
    validate_and_normalize_review_response,
)


PROSE_ML_MODALITIES = {"markdown", "text", "html", "svg"}


def _js_round_pct(v: float) -> int:
    return int(math.floor(v * 100.0 + 0.5))


def _lookup_rule_across_packs(
    packs: dict[str, dict[str, Any]] | None,
    pack: dict[str, Any] | None,
    rule_id: str,
) -> dict[str, Any] | None:
    if pack:
        for r in pack.get("rules", []):
            if r.get("id") == rule_id:
                return r
    for p in (packs or {}).values():
        for r in p.get("rules", []):
            if r.get("id") == rule_id:
                return r
    return None


def _merge_pattern_bank_findings(
    existing_findings: list[dict[str, Any]],
    pat_findings: list[dict[str, Any]],
    *,
    packs: dict[str, dict[str, Any]] | None = None,
    pack: dict[str, Any] | None = None,
    register: str = "unspecified",
    config: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    seen = {f"{f.get('ruleId')}:{f.get('line')}" for f in existing_findings}
    out = list(existing_findings)
    for pf in pat_findings:
        rid = str(pf.get("ruleId") or "")
        key = f"{rid}:{pf.get('line')}"
        if key in seen:
            continue
        rule_ref = _lookup_rule_across_packs(packs, pack, rid)
        reg_adjusted = False
        eff_sev = pf.get("severity") or "info"
        eff_msg = pf.get("message")
        eff_del = pf.get("deletionTest") or (rule_ref.get("deletionTest") if rule_ref else None)
        if rule_ref:
            reg_ov = apply_register_override(rule_ref, register, config)
            if reg_ov["skip"]:
                continue
            if reg_ov["registerAdjusted"]:
                reg_adjusted = True
                ov_rule = reg_ov["rule"]
                eff_sev = ov_rule.get("severity") or eff_sev
                if ov_rule.get("message"):
                    eff_msg = ov_rule["message"]
                if ov_rule.get("deletionTest"):
                    eff_del = ov_rule["deletionTest"]
        seen.add(key)
        fam = pf.get("family") or (f"{pf['dimension']}/{rid}" if pf.get("dimension") else "pattern-bank")
        mod = pf.get("modality") or "markdown"
        rev_scope = (rule_ref.get("revisionScope") if rule_ref else None) or (
            "paragraph" if rid == "low-burstiness-vapor" else None
        )
        fix_strat = pf.get("fixStrategy") or derive_fix_strategy({"id": rid, "family": fam})
        enriched = dict(pf)
        enriched["severity"] = eff_sev
        enriched["fixStrategy"] = fix_strat
        enriched["message"] = eff_msg
        if eff_del:
            enriched["deletionTest"] = eff_del
        enriched["confidence"] = pf.get("confidence") or compute_finding_confidence(
            rule_id=rid,
            tier=pf.get("tier") or "taste",
            severity=eff_sev,
            register_adjusted=reg_adjusted,
        )
        enriched["revision"] = pf.get("revision") or build_finding_revision(
            rule_id=rid,
            tier=pf.get("tier") or "taste",
            family=fam,
            modality=mod,
            message=eff_msg,
            deletion_test=eff_del,
            sentence=str(pf.get("match") or ""),
            revision_kind=rule_ref.get("revisionKind") if rule_ref else None,
            revision_scope=rev_scope,
            revision_avoid=rule_ref.get("revisionAvoid") if rule_ref else None,
            fix_strategy=fix_strat,
        )
        out.append(enriched)
    return out


def _filter_drivers_with_profile(drivers: list[dict[str, Any]], profile: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not profile or not drivers:
        return drivers or []
    out: list[dict[str, Any]] = []
    conc_grounded = (profile.get("concreteness") or {}).get("status") == "grounded"
    burst_varied = (profile.get("burstiness") or {}).get("status") == "varied"
    for d in drivers:
        feat = str(d.get("feature") or "")
        if conc_grounded and "concreteness" in feat:
            continue
        if burst_varied and "sent_cv" in feat:
            continue
        out.append(d)
    return out


def _build_pocket_ml_findings(
    text: str,
    filename: str,
    existing_findings: list[dict[str, Any]],
    threshold: float | None = None,
    *,
    profile: dict[str, Any] | None = None,
    modality: str | None = None,
    register: str = "unspecified",
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if register == "technical":
        return {"documentProbability": 0, "paragraphs": [], "flaggedCount": 0}, []
    doc = analyze_document_with_pocket_models(text, threshold=threshold)
    extras: list[dict[str, Any]] = []
    mod = modality or detect_modality(filename) or "markdown"
    text_lines = re.split(r"\r?\n", str(text or ""))
    for p in doc["paragraphs"]:
        if not p["flagged"]:
            continue
        if any(p["startLine"] <= f.get("line", -1) <= p["endLine"] for f in existing_findings):
            continue
        pct = _js_round_pct(p["slopProbability"])
        active_drivers = _filter_drivers_with_profile(p["topDrivers"], profile)
        drv_en = "; ".join(d["reason"]["en"] for d in active_drivers) or "uniform abstract phrasing"
        drv_zh = "、".join(d["reason"]["zh"] for d in active_drivers) or "句式与用词高度均质"
        loc = str(p["startLine"])
        clean_excerpt = str(p.get("excerpt") or "")
        full_para = "\n".join(text_lines[max(0, int(p["startLine"]) - 1) : int(p["endLine"])]) or clean_excerpt
        fp = f"pocket-stealth-vapor:{fnv1a_hex(f'pocket-stealth-vapor|{clean_excerpt.lower()}|{loc}')}"
        msg_obj = {
            "en": f"Paragraph reads as predictable low-concreteness AI filler ({pct}% pocket-ML score: {drv_en}).",
            "zh": f"段落呈高度可预测、低事实密度的温吞水套话（内置模型评分 {pct}%：{drv_zh}）。",
        }
        del_obj = {
            "en": "Cut this paragraph or replace abstract cushion wrappers with one concrete event, number, file path, or direct action.",
            "zh": "删掉整段空泛铺垫，或把抽象缓冲外壳直接换成具体事件、数字、文件路径或明确动作。",
        }
        extras.append({
            "fingerprint": fp,
            "ruleId": "pocket-stealth-vapor",
            "packId": "pocket-model",
            "severity": "warning",
            "confidence": compute_finding_confidence(
                rule_id="pocket-stealth-vapor",
                tier="taste",
                severity="warning",
            ),
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
            "message": msg_obj,
            "deletionTest": del_obj,
            "revision": build_finding_revision(
                rule_id="pocket-stealth-vapor",
                tier="taste",
                family="rhythm/pocket-stealth-vapor",
                modality=mod,
                message=msg_obj,
                deletion_test=del_obj,
                sentence=full_para,
                fix_strategy="rephrase",
            ),
        })
    return doc, extras


def _collect_text_coverage_warnings(text: str, modality: str, rel: str, profile: dict[str, Any] | None) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    if modality == "html" and re.search(
        r'<script\b[^>]*\btype\s*=\s*(?:"application/json"|\'application/json\'|application/json(?=[\s>]))',
        text,
        re.I | re.ASCII,
    ):
        zones = build_zones(text, "html")
        if len(re.sub(r"\s+", "", zones["prose"])) < 120:
            warnings.append({
                "file": rel,
                "code": "spa-json-shell",
                "message": 'HTML appears to be an SPA shell with <script type="application/json"> data and <120 visible prose chars; inspect JSON payload or rendered DOM.',
            })
            return warnings
    if modality in {"markdown", "text", "html"} and len(text) >= 2000 and profile and profile.get("proseCoverage", 1.0) < 0.15:
        pct = _js_round_pct(profile["proseCoverage"])
        if modality == "html":
            warnings.append({
                "file": rel,
                "code": "low-prose-coverage",
                "message": f"Extracted prose covers only {pct}% of file ({len(text)} chars); check fenced blocks/markup if unexpected.",
            })
            return warnings
        non_empty = [ln for ln in re.split(r"\r?\n", text) if ln.strip()]
        table_or_link = sum(1 for ln in non_empty if re.match(r"^\s*(?:\||[-*+]\s+\[)", ln))
        if non_empty and table_or_link / len(non_empty) < 0.5:
            warnings.append({
                "file": rel,
                "code": "low-prose-coverage",
                "message": f"Extracted prose covers only {pct}% of file ({len(text)} chars); check fenced blocks/markup if unexpected.",
            })
    return warnings


def _select_pack_with_confidence_floor(route_res: dict[str, Any]) -> tuple[str, str]:
    rec = str((route_res or {}).get("recommendedPack") or "business-brief")
    conf = float((route_res or {}).get("confidence") or 0.0)
    if rec == "business-brief":
        return "business-brief", "auto-pocket-router"
    if rec == "deck-and-ui" and conf >= 0.60:
        return "deck-and-ui", "auto-pocket-router"
    if rec != "deck-and-ui" and conf >= 0.65:
        return rec, "auto-pocket-router"
    return "business-brief", "auto-default-fallback"


def _resolve_text_pack_and_source(
    text: str,
    rel: str,
    modality: str,
    explicit_pack: str | None,
    file_config: dict[str, Any],
    packs: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], str, str]:
    if explicit_pack and explicit_pack != "auto":
        return resolve_effective_pack(explicit_pack, packs, file_config), explicit_pack, "cli-flag"
    if explicit_pack == "auto" and modality in {"markdown", "text"}:
        routed, pack_source = _select_pack_with_confidence_floor(predict_pack_with_pocket_router(text))
        if modality == "markdown" and has_embedded_ui_markup(text):
            prose_pack_id = routed
            if prose_pack_id == "deck-and-ui":
                stripped = re.sub(r"<[^>]+>", " ", text)
                stripped_cjk = len(re.findall(r"[\u4e00-\u9fff]", stripped))
                stripped_words = len([w for w in stripped.split() if re.search(r"[A-Za-z0-9]", w, re.ASCII)])
                if stripped_cjk >= 20 or stripped_words >= 12:
                    rerouted, _ = _select_pack_with_confidence_floor(predict_pack_with_pocket_router(stripped))
                    prose_pack_id = "business-brief" if rerouted == "deck-and-ui" else rerouted
            if prose_pack_id != "deck-and-ui":
                prose_pack = resolve_effective_pack(prose_pack_id, packs, file_config)
                ui_pack = resolve_effective_pack("deck-and-ui", packs, file_config)
                return merge_packs(prose_pack, ui_pack), f"{prose_pack_id}+deck-and-ui", "auto-mixed-ui"
        return resolve_effective_pack(routed, packs, file_config), routed, pack_source
    if explicit_pack == "auto" and modality == "html" and is_long_form_html_document(text):
        biz = resolve_effective_pack("business-brief", packs, file_config)
        ui = resolve_effective_pack("deck-and-ui", packs, file_config)
        return merge_packs(biz, ui), "business-brief+deck-and-ui", "auto-html-longform"
    pack_id = pick_pack_for_file(rel, modality, None if explicit_pack == "auto" else explicit_pack, file_config)
    pack = resolve_effective_pack(pack_id, packs, file_config)
    source = "auto-modality" if explicit_pack == "auto" else ("config" if file_config.get("pack") else "default-modality")
    return pack, pack_id, source


def _summarize_pocket_for_profile(text: str) -> dict[str, Any]:
    doc = analyze_document_with_pocket_models(text)
    return {
        "documentProbability": doc["documentProbability"],
        "band": doc["wholeTextScore"]["band"],
        "recommendedPack": doc["packRouter"]["recommendedPack"],
        "flaggedCount": doc["flaggedCount"],
    }


def _format_sarif(report: dict[str, Any], lang: str = "en") -> dict[str, Any]:
    rules_map: dict[str, dict[str, Any]] = {}
    for f in report["findings"]:
        rid = f["ruleId"]
        if rid not in rules_map:
            msg = (f.get("message") or {}).get(lang) or (f.get("message") or {}).get("en") or rid
            help_txt = (f.get("deletionTest") or {}).get(lang) or (f.get("deletionTest") or {}).get("en") or msg
            rules_map[rid] = {
                "id": rid,
                "shortDescription": {"text": msg},
                "help": {"text": help_txt},
                "helpUri": rule_doc_url(f, lang),
                "defaultConfiguration": {
                    "level": "error" if f["severity"] == "error" else "warning" if f["severity"] == "warning" else "note"
                },
            }
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "dislop",
                        "version": ENGINE_VERSION,
                        "informationUri": "https://dislop.com",
                        "rules": list(rules_map.values()),
                    }
                },
                "results": [
                    {
                        "ruleId": f["ruleId"],
                        "level": "error" if f["severity"] == "error" else "warning" if f["severity"] == "warning" else "note",
                        "message": {
                            "text": f"{(f.get('message') or {}).get(lang) or (f.get('message') or {}).get('en')} — \"{f['match']}\""
                        },
                        "locations": [
                            {
                                "physicalLocation": {
                                    "artifactLocation": {"uri": str(f["file"]).removeprefix("./")},
                                    "region": {
                                        "startLine": max(1, int(f.get("line") or 1)),
                                        "startColumn": max(1, int(f.get("col") or 1)),
                                    },
                                }
                            }
                        ],
                        "partialFingerprints": {"primaryLocationLineHash": f["fingerprint"]},
                    }
                    for f in report["findings"]
                ],
            }
        ],
    }


def _escape_github_prop(val: Any) -> str:
    return (
        str("" if val is None else val)
        .replace("%", "%25")
        .replace("\r", "%0D")
        .replace("\n", "%0A")
        .replace(":", "%3A")
        .replace(",", "%2C")
    )


def _escape_github_data(val: Any) -> str:
    return str("" if val is None else val).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def _clean_agent_text(val: Any, max_len: int) -> str:
    return re.sub(r"\s+", " ", str(val or "")).strip()[:max_len]


def _localize_skip_reason(reason: Any, lang: str = "en") -> str:
    r = str(reason or "")
    if lang != "zh":
        return r
    m = re.match(r"^Unsupported file extension '(.*)'$", r)
    if m:
        return f"不支持的文件扩展名 '{m.group(1)}'"
    if r == "File not found":
        return "文件不存在"
    if r.startswith("Non-UTF-8 text encoding"):
        return "非 UTF-8 编码文本，请转换为 UTF-8 后检查"
    if r.startswith("File exceeds 25 MB"):
        return "文件超过 25 MB 单文件检查上限"
    if r == "Missing word/document.xml inside DOCX archive":
        return "DOCX 归档缺少正文文件 word/document.xml"
    if r == "Missing ppt/slides/*.xml inside PPTX archive":
        return "PPTX 归档缺少幻灯片文件 ppt/slides/*.xml"
    if r.startswith("Uninspectable "):
        tail = re.sub(r"^Uninspectable\s+", "", r)
        return f"无法解析的文档归档：{tail}"
    return r


def _format_agent_report(
    report: dict[str, Any],
    lang: str = "en",
    *,
    quiet: bool = False,
    fail_on: str = "error",
) -> str:
    findings = report.get("findings", [])
    checked_count = int(report.get("checkedCount", 0))
    skipped = report.get("skipped", [])
    unused = report.get("unusedSuppressions", [])
    min_rank = SEVERITY_RANK.get(fail_on or "error", SEVERITY_RANK["error"])
    visible = [f for f in findings if SEVERITY_RANK.get(f.get("severity", "info"), 1) >= min_rank] if quiet else findings

    if quiet and not visible and not unused and not skipped:
        return ""

    out: list[str] = []
    ver = report.get("version") or ENGINE_VERSION
    if not visible and not unused and skipped:
        out.append(
            f"dislop {ver}: 未完成（已检 {checked_count} 项、跳过 {len(skipped)} 项）"
            if lang == "zh"
            else f"dislop {ver}: skipped (checked={checked_count}, skipped={len(skipped)})"
        )
    elif not visible and not unused:
        if not quiet:
            out.append(
                f"dislop {ver}: 通过（已检 {checked_count} 项、0 处命中）"
                if lang == "zh"
                else f"dislop {ver}: ok (checked={checked_count}, findings=0)"
            )
    else:
        err_count = sum(1 for f in visible if f.get("severity") == "error")
        warn_count = sum(1 for f in visible if f.get("severity") == "warning")
        info_count = sum(1 for f in visible if f.get("severity") == "info")
        ctx = report.get("context") or {}
        reg = ctx.get("register") or "unspecified"
        reg_source = ctx.get("registerSource") or "default"

        if lang == "zh":
            reg_zh_map = {
                "unspecified": "未指定",
                "official": "公文",
                "casual": "随笔/口语",
                "argumentative": "议论",
                "technical": "技术文档",
                "marketing": "营销",
                "narrative": "叙事",
                "mixed": "混合",
            }
            src_zh_map = {"flag": "参数", "frontmatter": "前言", "config": "配置", "default": "默认", "mixed": "多来源"}
            out.append(
                f"dislop {ver}: 已检={checked_count} 问题={len(visible)}（硬伤={err_count}、提醒={warn_count}、提示={info_count}） 语体={reg_zh_map.get(reg, reg)}·{src_zh_map.get(reg_source, reg_source)}"
            )
        else:
            out.append(
                f"dislop {ver}: checked={checked_count} findings={len(visible)} (error={err_count}, warning={warn_count}, info={info_count}) register={reg}({reg_source})"
            )

        sorted_findings = sorted(
            visible,
            key=lambda f: (
                -SEVERITY_RANK.get(f.get("severity", "info"), 1),
                str(f.get("file") or ""),
                int(f.get("line") or 0),
                int(f.get("col") or 0),
                str(f.get("ruleId") or ""),
            ),
        )
        agent_max = 30
        shown = sorted_findings[:agent_max]
        sev_zh_map = {"error": "硬伤", "warning": "提醒", "info": "提示"}
        conf_zh_map = {"high": "高", "medium": "中", "low": "低"}
        kind_zh_map = {"delete": "删减", "rewrite": "改写", "restructure": "重构"}
        scope_zh_map = {"span": "片段", "sentence": "句级", "paragraph": "段级", "document": "全文", "element": "元素"}

        for f in shown:
            rev = f.get("revision") or {}
            conf = f.get("confidence") or "medium"
            kind = rev.get("kind") or "rewrite"
            scope = rev.get("scope") or "sentence"
            rev_instr = rev.get("instruction") or {}
            dt = f.get("deletionTest") or {}
            msg = f.get("message") or {}
            instr_src = (
                rev_instr.get(lang)
                or rev_instr.get("en")
                or (dt.get(lang) if isinstance(dt, dict) else "")
                or (dt.get("en") if isinstance(dt, dict) else "")
                or msg.get(lang)
                or msg.get("en")
                or ""
            )
            keep_arr = rev.get("keep") if isinstance(rev.get("keep"), list) else []
            match_s = _clean_agent_text(f.get("match"), 90)
            fix_s = _clean_agent_text(instr_src, 140)
            if lang == "zh":
                keep_part = (" | 保留=" + "、".join(keep_arr)) if keep_arr else ""
                sev_lbl = sev_zh_map.get(f.get("severity", ""), f.get("severity", ""))
                conf_lbl = conf_zh_map.get(conf, conf)
                kind_lbl = kind_zh_map.get(kind, kind)
                scope_lbl = scope_zh_map.get(scope, scope)
                out.append(
                    f"[{sev_lbl}] {f['file']}:{f['location']} {f['ruleId']} 置信={conf_lbl} {kind_lbl}/{scope_lbl} | 原文=\"{match_s}\" | 改法=\"{fix_s}\"{keep_part}"
                )
            else:
                keep_part = (" | keep=" + ", ".join(keep_arr)) if keep_arr else ""
                out.append(
                    f"[{f['severity']}] {f['file']}:{f['location']} {f['ruleId']} conf={conf} {kind}/{scope} | match=\"{match_s}\" | fix=\"{fix_s}\"{keep_part}"
                )

        if len(sorted_findings) > agent_max:
            overflow = len(sorted_findings) - agent_max
            out.append(
                f"... 另有 {overflow} 处命中（完整列表请加 --format json）"
                if lang == "zh"
                else f"... +{overflow} more findings (use --format json for full list)"
            )

        for u in unused:
            rules_csv = ",".join(u.get("ruleIds") or [])
            out.append(
                f"[失效豁免] {u['file']}:{u['line']} 规则={rules_csv}"
                if lang == "zh"
                else f"[unused-ignore] {u['file']}:{u['line']} rules={rules_csv}"
            )

    for s in skipped:
        loc_reason = _localize_skip_reason(s.get("reason"), lang)
        out.append(
            f"[跳过] {s['file']} 原因={loc_reason}"
            if lang == "zh"
            else f"[skip] {s['file']} reason={loc_reason}"
        )

    if not quiet and report.get("profiles"):
        for item in report["profiles"]:
            p = item["profile"]
            out.append(
                f"[画像] {item['file']} 风险={p['telemetryRisk']['score']}/100 句长变异={p['burstiness']['cv']} 锚点={p['concreteness']['per100Units']}"
                if lang == "zh"
                else f"[profile] {item['file']} risk={p['telemetryRisk']['score']}/100 cv={p['burstiness']['cv']} anchors={p['concreteness']['per100Units']}"
            )
    return "\n".join(out)


def _summarize_report_context(reg_pairs: list[dict[str, str]], flag_register: str | None) -> dict[str, str]:
    if flag_register and str(flag_register).strip().lower() != "auto":
        return {"register": str(flag_register).strip().lower(), "registerSource": "flag"}
    if not reg_pairs:
        return {"register": "unspecified", "registerSource": "default"}
    regs = {r["register"] for r in reg_pairs}
    srcs = {r["registerSource"] for r in reg_pairs}
    if len(regs) == 1:
        reg = reg_pairs[0]["register"]
        src = reg_pairs[0]["registerSource"] if len(srcs) == 1 else "mixed"
        return {"register": reg, "registerSource": src}
    return {"register": "mixed", "registerSource": "mixed"}


def _fmt_js_num(val: Any) -> str:
    if isinstance(val, bool):
        return str(val).lower()
    if isinstance(val, float):
        if val.is_integer():
            return str(int(val))
        return str(val)
    return str(val)


def format_report(
    report: dict[str, Any],
    fmt: str = "text",
    lang: str = "en",
    *,
    quiet: bool = False,
    fail_on: str = "error",
) -> str:
    findings = report["findings"]
    checked_count = report["checkedCount"]
    skipped = report.get("skipped", [])
    unused = report.get("unusedSuppressions", [])
    coverage_warnings = report.get("coverageWarnings", [])
    changed_filter = bool(report.get("changedFilter"))

    if fmt == "json":
        return json.dumps(report, ensure_ascii=False, indent=2)
    if fmt == "sarif":
        return json.dumps(_format_sarif(report, lang), ensure_ascii=False, indent=2)
    if fmt == "github":
        lines = []
        for f in findings:
            lvl = "error" if f["severity"] == "error" else "warning" if f["severity"] == "warning" else "notice"
            msg = re.sub(r"\r?\n", " ", (f.get("message") or {}).get(lang) or (f.get("message") or {}).get("en") or "")
            file_prop = _escape_github_prop(f["file"])
            title_prop = _escape_github_prop(f["ruleId"])
            data_body = _escape_github_data(f"{msg} ({f['match']}) — {rule_doc_url(f, lang)}")
            lines.append(f"::{lvl} file={file_prop},line={f.get('line', 1)},col={f.get('col', 1)},title={title_prop}::{data_body}")
        return "\n".join(lines)
    if fmt == "md":
        rows = [
            "| Severity | File | Location | Rule | Match | Guidance |",
            "|---|---|---|---|---|---|",
        ]
        for f in findings:
            match_esc = str(f["match"]).replace("|", "\\|")
            msg = (f.get("message") or {}).get(lang) or (f.get("message") or {}).get("en") or ""
            rows.append(f"| `{f['severity']}` | `{f['file']}` | `{f['location']}` | `{f['ruleId']}` | `{match_esc}` | {msg} |")
        return "\n".join(rows)
    if fmt == "agent":
        return _format_agent_report(report, lang, quiet=quiet, fail_on=fail_on)

    min_rank = SEVERITY_RANK.get(fail_on or "error", SEVERITY_RANK["error"])
    visible_findings = (
        [f for f in findings if SEVERITY_RANK.get(f.get("severity", "info"), 1) >= min_rank]
        if quiet
        else findings
    )
    if quiet and not visible_findings and not unused and not skipped and not coverage_warnings:
        return ""

    is_review = report.get("schema") == "dislop.review/1"
    skip_note = f", {len(skipped)} skipped" if skipped else ""
    zh_skip = f"，跳过 {len(skipped)} 项" if skipped else ""
    out: list[str] = []
    if changed_filter and checked_count == 0 and not skipped and not visible_findings and not coverage_warnings:
        if not quiet:
            out.append(
                "dislop: --changed 未匹配到可检查的变更文件（已检 0 项，0 处命中）"
                if lang == "zh"
                else "dislop: --changed matched 0 inspectable files (0 checked, 0 findings)"
            )
    elif not visible_findings and not unused:
        if not quiet:
            file_label = "1 file" if checked_count == 1 else f"{checked_count} files"
            if is_review:
                out.append(
                    f"dislop review: 未标出 AI 味问题（已审 {checked_count} 项{zh_skip}，0 处命中）"
                    if lang == "zh"
                    else f"dislop review: no AI-flavor issues flagged ({file_label} reviewed{skip_note}, 0 findings)"
                )
            else:
                out.append(
                    f"dislop: 未发现已知模式（已检 {checked_count} 项{zh_skip}，0 处命中）"
                    if lang == "zh"
                    else f"dislop: no known patterns found ({file_label} checked{skip_note}, 0 findings)"
                )
    else:
        is_zh = lang == "zh"
        err_count = sum(1 for f in visible_findings if f["severity"] == "error")
        warn_count = sum(1 for f in visible_findings if f["severity"] == "warning")
        info_count = sum(1 for f in visible_findings if f["severity"] == "info")
        prefix = "dislop review" if is_review else "dislop"
        if is_zh:
            zh_parts: list[str] = []
            if err_count > 0:
                zh_parts.append(f"{err_count} 处硬伤")
            if warn_count > 0:
                zh_parts.append(f"{warn_count} 处提醒")
            if info_count > 0:
                zh_parts.append(f"{info_count} 处提示")
            detail = f"（{'、'.join(zh_parts)}）" if zh_parts else ""
            head_noun = f"发现 {len(visible_findings)} 处问题{detail}" if visible_findings else f"发现 {len(unused)} 处失效豁免"
            verb = "已审" if is_review else "已检"
            out.append(f"{prefix}: {head_noun}，{verb} {checked_count} 项{zh_skip}")
        else:
            en_parts: list[str] = []
            if err_count > 0:
                en_parts.append(f"{err_count} {'error' if err_count == 1 else 'errors'}")
            if warn_count > 0:
                en_parts.append(f"{warn_count} {'warning' if warn_count == 1 else 'warnings'}")
            if info_count > 0:
                en_parts.append(f"{info_count} info")
            breakdown = f" ({', '.join(en_parts)})" if en_parts else ""
            if visible_findings:
                f_noun = "finding" if len(visible_findings) == 1 else "findings"
                f_label = f"{len(visible_findings)} {f_noun}{breakdown}"
            else:
                s_noun = "suppression" if len(unused) == 1 else "suppressions"
                f_label = f"{len(unused)} stale {s_noun}"
            c_label = "1 file" if checked_count == 1 else f"{checked_count} files"
            out.append(f"{prefix}: {f_label} across {c_label}{skip_note}")

        strat_labels_zh = {"delete": "删掉", "need-source": "补出处", "unwrap-layout": "去套壳", "rephrase": "改写"}
        seen_rule_ids: set[str] = set()
        rule_counts: dict[str, int] = {}
        for f in visible_findings:
            rid = f["ruleId"]
            rule_counts[rid] = rule_counts.get(rid, 0) + 1
            strat = f.get("fixStrategy") or derive_fix_strategy({"id": rid, "family": f.get("family")})
            tag = strat_labels_zh.get(strat, "改写") if is_zh else strat
            if is_zh:
                sev_zh = "硬伤" if f["severity"] == "error" else ("提醒" if f["severity"] == "warning" else "提示")
                out.append(f"  [{sev_zh}] {f['file']}:{f['location']}  {rid} [{tag}]")
                out.append(f'    原文: "{f["match"]}"')
            else:
                sev_en = f["severity"].upper()
                out.append(f"  [{sev_en}] {f['file']}:{f['location']}  {rid} [{tag}]")
                out.append(f'    match: "{f["match"]}"')
            if rid not in seen_rule_ids:
                seen_rule_ids.add(rid)
                msg = (f.get("message") or {}).get(lang) or (f.get("message") or {}).get("en") or ""
                dt = f.get("deletionTest")
                test_txt = (dt.get(lang) or dt.get("en") or "") if isinstance(dt, dict) else ""
                if msg:
                    out.append(f"    原因: {msg}" if is_zh else f"    why:   {msg}")
                if test_txt and test_txt != msg:
                    out.append(f"    改法: {test_txt}" if is_zh else f"    fix:   {test_txt}")
        for u in unused:
            rules_str = ", ".join(u["ruleIds"])
            out.append(
                f"  [失效豁免] {u['file']}:{u['line']}  未命中的 dislop-ignore ({rules_str})"
                if is_zh
                else f"  [UNUSED] {u['file']}:{u['line']}  stale dislop-ignore ({rules_str})"
            )
        if len(visible_findings) >= 4 or (checked_count >= 2 and len(visible_findings) > 0):
            top_str = ", ".join(
                f"{rid}×{cnt}"
                for rid, cnt in sorted(rule_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
            )
            out.append(f"  按规则分布: {top_str}" if is_zh else f"  Top rules: {top_str}")
            out.append("  下一步: 改完可跑 dislop verify --git HEAD <文件>" if is_zh else "  Next: verify edits with dislop verify --git HEAD <file>")
    for s in skipped:
        loc_reason = _localize_skip_reason(s["reason"], lang)
        out.append(
            f"  [跳过] {s['file']} — {loc_reason}"
            if lang == "zh"
            else f"  [SKIP] {s['file']} — {loc_reason}"
        )
    for w in coverage_warnings:
        out.append(
            f"  [覆盖提示] {w['file']} — {w['message']}"
            if lang == "zh"
            else f"  [COVERAGE] {w['file']} — {w['message']}"
        )
    if not quiet and report.get("profiles"):
        level_zh_map = {"low": "低", "medium": "中", "high": "高"}
        status_zh_map = {"varied": "有起伏", "flat": "偏平", "short": "偏短", "grounded": "具体", "moderate": "一般", "vapor": "偏虚", "ok": "正常"}
        signal_zh_map = {
            "cooccurrence-slop-cluster": "弱套词共现",
            "semicolon-tricolon": "分号三段排比",
            "rhetorical-qa-cadence": "自问自答设问",
            "comma-chain-runon": "多逗号连环句",
            "narrative-sandwich-frame": "三明治叙事壳",
            "template-skeleton-echo": "句首骨架复用",
            "low-burstiness-vapor": "句长齐平空话",
            "flat-sentence-rhythm": "句长偏平",
            "zero-concrete-anchors": "缺乏具体锚点",
            "high-em-dash-density": "破折号过密",
        }
        for item in report["profiles"]:
            p = item["profile"]
            sigs_list = p["telemetryRisk"]["signals"]
            sc = _fmt_js_num(p["telemetryRisk"]["score"])
            b_cv = _fmt_js_num(p["burstiness"]["cv"])
            c_u = _fmt_js_num(p["concreteness"]["per100Units"])
            mattr_s = _fmt_js_num(p["lexical"]["mattr"])
            ent_s = _fmt_js_num(p["lexical"]["charEntropy"])
            if lang == "zh":
                sigs_zh = "、".join(signal_zh_map.get(s, s) for s in sigs_list) if sigs_list else "无"
                lvl_zh = level_zh_map.get(p["telemetryRisk"]["level"], p["telemetryRisk"]["level"])
                b_stat = status_zh_map.get(p["burstiness"]["status"], p["burstiness"]["status"])
                c_stat = status_zh_map.get(p["concreteness"]["status"], p["concreteness"]["status"])
                out.append(
                    f"  [统计] {item['file']}  风险={sc}/100（{lvl_zh}） | "
                    f"句长变异={b_cv}（{b_stat}） | "
                    f"具体锚点={c_u}/100字（{c_stat}） | "
                    f"词汇丰富度={mattr_s} | 字符熵={ent_s} | 信号={sigs_zh}"
                )
            else:
                sigs = ", ".join(sigs_list) if sigs_list else "none"
                out.append(
                    f"  [PROFILE] {item['file']}  risk={sc}/100 ({p['telemetryRisk']['level']}) | "
                    f"burstiness_cv={b_cv} ({p['burstiness']['status']}) | "
                    f"concreteness={c_u}/100u ({p['concreteness']['status']}) | "
                    f"mattr={mattr_s} | entropy={ent_s} | signals={sigs}"
                )
    return "\n".join(out)


def _unquote_git_path(raw_path: str) -> str:
    s = str(raw_path or "")
    if len(s) < 2 or not s.startswith('"') or not s.endswith('"'):
        return s
    inner = s[1:-1]
    buf = bytearray()
    esc_map = {
        "a": b"\x07",
        "b": b"\x08",
        "f": b"\x0c",
        "n": b"\n",
        "r": b"\r",
        "t": b"\t",
        "v": b"\x0b",
        "\\": b"\\",
        '"': b'"',
    }
    i = 0
    n = len(inner)
    while i < n:
        ch = inner[i]
        if ch != "\\":
            buf.extend(ch.encode("utf-8"))
            i += 1
            continue
        if i + 1 >= n:
            buf.append(0x5C)
            break
        nxt = inner[i + 1]
        if i + 3 < n and all("0" <= c <= "7" for c in inner[i + 1 : i + 4]):
            buf.append(int(inner[i + 1 : i + 4], 8))
            i += 4
        elif nxt in esc_map:
            buf.extend(esc_map[nxt])
            i += 2
        else:
            buf.extend(nxt.encode("utf-8"))
            i += 2
    return buf.decode("utf-8", errors="replace")


def _get_changed_lines(cwd: Path, git_ref: str, staged: bool) -> dict[str, set[int] | str]:
    cmd = (
        [
            "git", "-c", "core.quotepath=off", "-c", "diff.interHunkContext=0",
            "diff", "--cached",
            "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "--relative",
            "-U0", "--no-color", "--",
        ]
        if staged
        else [
            "git", "-c", "core.quotepath=off", "-c", "diff.interHunkContext=0",
            "diff",
            "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "--relative",
            "-U0", "--no-color", git_ref or "HEAD", "--",
        ]
    )
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, check=True)
    diff_text = res.stdout.decode("utf-8", errors="replace")
    changed: dict[str, set[int] | str] = {}
    cur_file: str | None = None
    in_hunk = False
    for line in re.split(r"\r?\n", diff_text):
        if line.startswith("diff --git "):
            in_hunk = False
            cur_file = None
        elif not in_hunk and (line.startswith("+++ b/") or line.startswith('+++ "b/')):
            target = _unquote_git_path(line[4:])
            if target.startswith("b/"):
                cur_file = target[2:]
                changed.setdefault(cur_file, set())
        elif not in_hunk and line.startswith("Binary files "):
            bm = re.match(r'^Binary files .* and (b/.+|"b/.+") differ$', line)
            if bm:
                bin_target = _unquote_git_path(bm.group(1))
                if bin_target.startswith("b/"):
                    changed[bin_target[2:]] = "ALL"
        elif line.startswith("@@ ") and cur_file:
            in_hunk = True
            m = re.search(r"\+(\d+)(?:,(\d+))?", line)
            if m and isinstance(changed.get(cur_file), set):
                start = int(m.group(1))
                cnt = int(m.group(2)) if m.group(2) is not None else 1
                if cnt == 0:
                    continue
                target_set = changed[cur_file]
                assert isinstance(target_set, set)
                for k in range(cnt):
                    target_set.add(start + k)
    return changed


def _inspect_single_file_full(
    abs_p: Path,
    rel: str,
    modality: str,
    packs: dict[str, dict[str, Any]],
    explicit_pack: str | None,
    config: dict[str, Any],
    *,
    include_ml: bool = False,
    include_patterns: bool = False,
    include_profile: bool = False,
    banks: dict[str, Any] | None = None,
    register: str | None = None,
) -> dict[str, Any]:
    if abs_p.stat().st_size > 25 * 1024 * 1024:
        return {
            "checked": False,
            "findings": [],
            "unusedSuppressions": [],
            "coverageWarnings": [],
            "skipped": [{"file": rel, "reason": "File exceeds 25 MB single-file inspection cap"}],
        }

    file_cfg = resolve_config_for_file(rel, config)
    raw_bytes = abs_p.read_bytes()

    if modality in {"docx", "pptx"}:
        pack_id = pick_pack_for_file(rel, modality, None if explicit_pack == "auto" else explicit_pack, file_cfg)
        pack = resolve_effective_pack(pack_id, packs, file_cfg)
        pack_source = (
            "cli-flag" if explicit_pack and explicit_pack != "auto"
            else ("auto-modality" if explicit_pack == "auto" else ("config" if file_cfg.get("pack") else "default-modality"))
        )
        reg_info = resolve_register("", filename=rel, flag_register=register, config=file_cfg)
        import io
        import zipfile
        try:
            entries: dict[str, str] = {}
            total_bytes = 0
            with zipfile.ZipFile(io.BytesIO(raw_bytes), "r") as zf:
                infos = zf.infolist()
                if len(infos) > 3000:
                    raise ValueError("Archive exceeds 3000-entry safety cap")
                for info in infos:
                    if info.filename.endswith((".xml", ".rels")):
                        total_bytes += info.file_size
                        if total_bytes > 120 * 1024 * 1024:
                            raise ValueError("OOXML uncompressed XML exceeds 120 MB safety ceiling")
                        entries[info.filename] = zf.read(info.filename).decode("utf-8", errors="replace")
            res = audit_ooxml_entries(entries, filename=rel, modality=modality, pack=pack, config=file_cfg, register=register)
            missing_core = any(s["file"] == rel for s in res["skipped"])
            f_list = list(res["findings"])
            if include_patterns and not missing_core:
                pat_res = audit_patterns("", filename=rel, modality=modality, banks=banks, ooxml=entries, config=file_cfg)
                f_list = _merge_pattern_bank_findings(
                    f_list,
                    pat_res["findings"],
                    packs=packs,
                    pack=pack,
                    register=reg_info["register"],
                    config=file_cfg,
                )
            return {
                "checked": not missing_core,
                "findings": f_list,
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": res["skipped"],
                "effectivePack": pack_id,
                "packSource": pack_source,
                "rulesetHash": compute_ruleset_hash(pack),
                "register": reg_info["register"],
                "registerSource": reg_info["registerSource"],
            }
        except Exception as exc:
            return {
                "checked": False,
                "findings": [],
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": [{"file": rel, "reason": f"Uninspectable {modality.upper()} archive: {exc}"}],
            }

    if modality == "image":
        pack_id = pick_pack_for_file(rel, modality, None if explicit_pack == "auto" else explicit_pack, file_cfg)
        pack = resolve_effective_pack(pack_id, packs, file_cfg)
        pack_source = (
            "cli-flag" if explicit_pack and explicit_pack != "auto"
            else ("auto-modality" if explicit_pack == "auto" else ("config" if file_cfg.get("pack") else "default-modality"))
        )
        reg_info = resolve_register("", filename=rel, flag_register=register, config=file_cfg)
        try:
            parsed = parse_image_bytes(raw_bytes)
            res = audit_image_document(parsed, filename=rel, pack=pack, config=file_cfg)
            return {
                "checked": True,
                "findings": res["findings"],
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": res["skipped"],
                "effectivePack": pack_id,
                "packSource": pack_source,
                "rulesetHash": compute_ruleset_hash(pack),
                "register": reg_info["register"],
                "registerSource": reg_info["registerSource"],
            }
        except Exception as exc:
            return {
                "checked": False,
                "findings": [],
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": [{"file": rel, "reason": f"Uninspectable image: {exc}"}],
            }

    if modality == "pdf":
        reg_info = resolve_register("", filename=rel, flag_register=register, config=file_cfg)
        try:
            parsed = parse_pdf_bytes(raw_bytes)
            if explicit_pack and explicit_pack != "auto":
                pack = resolve_effective_pack(explicit_pack, packs, file_cfg)
                eff_pack = explicit_pack
                pack_source = "cli-flag"
            elif explicit_pack == "auto":
                pages = parsed.get("pages") or []
                landscape_count = sum(1 for p in pages if p.get("isLandscape"))
                portrait_count = len(pages) - landscape_count
                if pages and portrait_count >= landscape_count:
                    pack = merge_packs(
                        resolve_effective_pack("business-brief", packs, file_cfg),
                        resolve_effective_pack("deck-and-ui", packs, file_cfg),
                    )
                    eff_pack = "business-brief+deck-and-ui"
                    pack_source = "auto-pdf-portrait"
                else:
                    pack = resolve_effective_pack("deck-and-ui", packs, file_cfg)
                    eff_pack = "deck-and-ui"
                    pack_source = "auto-pdf-landscape"
            else:
                pack_id = pick_pack_for_file(rel, modality, None, file_cfg)
                pack = resolve_effective_pack(pack_id, packs, file_cfg)
                eff_pack = pack_id
                pack_source = "config" if file_cfg.get("pack") else "default-modality"
            res = audit_pdf_document(parsed, filename=rel, pack=pack, config=file_cfg, register=register)
            uninspectable = any(s["file"] == rel for s in res["skipped"])
            return {
                "checked": not uninspectable,
                "findings": res["findings"],
                "unusedSuppressions": [],
                "coverageWarnings": res.get("coverageWarnings", []),
                "skipped": res["skipped"],
                "effectivePack": eff_pack,
                "packSource": pack_source,
                "rulesetHash": compute_ruleset_hash(pack),
                "register": reg_info["register"],
                "registerSource": reg_info["registerSource"],
            }
        except Exception as exc:
            return {
                "checked": False,
                "findings": [],
                "unusedSuppressions": [],
                "coverageWarnings": [],
                "skipped": [{"file": rel, "reason": f"Uninspectable PDF: {exc}"}],
            }

    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return {
            "checked": False,
            "findings": [],
            "unusedSuppressions": [],
            "coverageWarnings": [],
            "skipped": [{"file": rel, "reason": "Non-UTF-8 text encoding; convert to UTF-8 to inspect"}],
        }

    pack, eff_pack, pack_source = _resolve_text_pack_and_source(text, rel, modality, explicit_pack, file_cfg, packs)
    reg_info = resolve_register(text, filename=rel, flag_register=register, config=file_cfg)
    res = audit_text(text, filename=rel, modality=modality, pack=pack, config=file_cfg, register=register)
    f_list = list(res["findings"])
    if include_patterns:
        pat_res = audit_patterns(text, filename=rel, modality=modality, banks=banks, config=file_cfg)
        f_list = _merge_pattern_bank_findings(
            f_list,
            pat_res["findings"],
            packs=packs,
            pack=pack,
            register=reg_info["register"],
            config=file_cfg,
        )

    profile_obj: dict[str, Any] | None = None
    ml_input: str | None = None
    if modality in PROSE_ML_MODALITIES and (include_ml or include_profile or len(text) >= 2000 or modality == "html"):
        profile_obj = analyze_text_profile(text, modality=modality, config=file_cfg)
        if include_ml:
            ml_input = build_zones(text, modality, {"proseFences": file_cfg.get("proseFences"), "maskBlockquotes": file_cfg.get("maskBlockquotes")})["prose"] if modality in {"html", "svg"} else text
            _, ml_extras = _build_pocket_ml_findings(
                ml_input,
                rel,
                f_list,
                profile=profile_obj,
                modality=modality,
                register=reg_info["register"],
            )
            f_list.extend(ml_extras)

    coverage_warnings = _collect_text_coverage_warnings(text, modality, rel, profile_obj)
    profile_item: dict[str, Any] | None = None
    if include_profile and modality in PROSE_ML_MODALITIES:
        pocket_src = ml_input if ml_input is not None else (
            build_zones(text, modality, {"proseFences": file_cfg.get("proseFences"), "maskBlockquotes": file_cfg.get("maskBlockquotes")})["prose"]
            if modality in {"html", "svg"}
            else text
        )
        profile_item = {
            "file": rel,
            "profile": profile_obj or analyze_text_profile(text, modality=modality, config=file_cfg),
            "pocketModel": _summarize_pocket_for_profile(pocket_src),
        }

    return {
        "checked": True,
        "findings": f_list,
        "unusedSuppressions": res["unusedSuppressions"],
        "coverageWarnings": coverage_warnings,
        "skipped": [],
        "effectivePack": eff_pack,
        "packSource": pack_source,
        "rulesetHash": compute_ruleset_hash(pack),
        "register": reg_info["register"],
        "registerSource": reg_info["registerSource"],
        "profileItem": profile_item,
        "_lineStarts": build_line_starts(text),
    }


def _apply_compact_report(report: dict[str, Any]) -> dict[str, Any]:
    rule_meta: dict[str, Any] = {}
    compact_findings: list[dict[str, Any]] = []
    for f in report.get("findings") or []:
        rid = f["ruleId"]
        strategy = f.get("fixStrategy") or derive_fix_strategy({"id": rid, "family": f.get("family")})
        if rid not in rule_meta:
            meta: dict[str, Any] = {
                "tier": f.get("tier") or "taste",
                "family": f.get("family") or "general",
                "fixStrategy": strategy,
                "message": f.get("message"),
            }
            if f.get("deletionTest"):
                meta["deletionTest"] = f["deletionTest"]
            rule_meta[rid] = meta
        compact_item: dict[str, Any] = {
            "fingerprint": f.get("fingerprint"),
            "ruleId": rid,
            "severity": f.get("severity"),
            "fixStrategy": strategy,
            "file": f.get("file"),
            "modality": f.get("modality"),
            "location": f.get("location"),
            "line": f.get("line"),
            "col": f.get("col"),
        }
        if f.get("span") is not None:
            compact_item["span"] = f["span"]
        compact_item["match"] = f.get("match")
        compact_findings.append(compact_item)
    return {
        **report,
        "compact": True,
        "ruleMeta": rule_meta,
        "findings": compact_findings,
    }


def _should_use_color() -> bool:
    force = os.environ.get("FORCE_COLOR", "")
    if force and force != "0":
        return True
    if os.environ.get("NO_COLOR", "") != "":
        return False
    return bool(sys.stdout.isatty())


def _colorize_text_report(text: str, use_color: bool) -> str:
    if not use_color or not text:
        return text
    reset, red, yellow, cyan, dim, green = "\033[0m", "\033[31m", "\033[33m", "\033[36m", "\033[2m", "\033[32m"
    lines: list[str] = []
    for line in text.split("\n"):
        if line.startswith(("  [ERROR]", "  [硬伤]")):
            line = re.sub(r"^(\s*\[(?:ERROR|硬伤)\])", f"{red}\\1{reset}", line)
        elif line.startswith(("  [WARNING]", "  [提醒]")):
            line = re.sub(r"^(\s*\[(?:WARNING|提醒)\])", f"{yellow}\\1{reset}", line)
        elif line.startswith(("  [INFO]", "  [提示]")):
            line = re.sub(r"^(\s*\[(?:INFO|提示)\])", f"{cyan}\\1{reset}", line)
        elif line.startswith(("  [SKIP]", "  [跳过]", "  [UNUSED]", "  [失效豁免]", "  [COVERAGE]", "  [覆盖提示]")):
            line = f"{dim}{line}{reset}"
        elif line.startswith(("dislop: no known patterns found", "dislop: 未发现已知模式")):
            line = f"{green}{line}{reset}"
        lines.append(line)
    return "\n".join(lines)


def _read_stdin_text_checked(cmd_label: str = "check") -> str:
    raw = sys.stdin.buffer.read()
    if raw[:4] == b"PK\x03\x04":
        raise ValueError(
            f"dislop {cmd_label}: stdin looks like binary ZIP/OOXML (.docx/.pptx); pass the file path instead (e.g., 'dislop {cmd_label} deck.pptx')."
        )
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(
            f"dislop {cmd_label}: stdin is not valid UTF-8 text; convert to UTF-8 or pass a supported file path."
        ) from exc


def _detect_stdin_filename(raw_text: str, explicit_name: str | None) -> str:
    if explicit_name:
        return explicit_name
    head = raw_text.lstrip("\ufeff \t\r\n")[:128].lower()
    if head.startswith(("<!doctype html", "<html")):
        return "stdin.html"
    return "stdin.md"


def _collect_known_rule_ids(packs: dict[str, dict[str, Any]], banks: dict[str, Any] | None = None) -> set[str]:
    known = {"pocket-stealth-vapor"}
    for p in packs.values():
        for r in p.get("rules", []):
            if r.get("id"):
                known.add(r["id"])
    loaded_banks = banks if banks is not None else load_pattern_banks()
    for b in loaded_banks.values():
        for pat in b.get("patterns", []):
            if pat.get("ruleId"):
                known.add(pat["ruleId"])
    for rid in load_pattern_library():
        known.add(rid)
    return known


def _cmd_check(ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    cwd = Path.cwd()
    try:
        config = load_config(cwd, ns.config)
    except ValueError as exc:
        print(f"dislop: {exc}", file=sys.stderr)
        return 2
    fmt = "json" if ns.json else ns.format
    fail_on = ns.fail_on or config.get("failOn", "error")
    if fail_on not in SEVERITY_RANK:
        print(f"dislop: invalid --fail-on '{fail_on}'", file=sys.stderr)
        return 2

    flag_register: str | None = None
    if getattr(ns, "register", None) is not None:
        norm = str(ns.register).strip().lower()
        if not norm or (norm != "auto" and norm not in VALID_REGISTERS):
            joined = ", ".join(VALID_REGISTERS)
            print(f"dislop: invalid --register '{ns.register}' (expected auto, {joined})", file=sys.stderr)
            return 2
        flag_register = norm

    include_profile = bool(ns.profile or getattr(ns, "deep", False))
    include_ml = bool(ns.ml or getattr(ns, "deep", False))
    include_patterns = bool(ns.patterns or getattr(ns, "deep", False))
    compact_json = bool(getattr(ns, "compact", False) and fmt == "json")
    quiet = bool(getattr(ns, "quiet", False))
    use_color = fmt == "text" and _should_use_color()
    banks_cached = load_pattern_banks() if include_patterns else None

    rule_filter: set[str] | None = None
    if getattr(ns, "rule", None) is not None:
        requested = [s.strip() for s in str(ns.rule).split(",") if s.strip()]
        if not requested:
            print("dislop check: '--rule' requires at least one rule ID", file=sys.stderr)
            return 2
        known_ids = _collect_known_rule_ids(packs, banks_cached)
        unknown = [r for r in requested if r not in known_ids]
        if unknown:
            print(
                f"dislop check: unknown rule ID(s): {', '.join(unknown)}. Run 'dislop catalog' to list valid rule IDs.",
                file=sys.stderr,
            )
            return 2
        rule_filter = set(requested)

    if ns.pack and ns.pack != "auto" and ns.pack not in packs:
        avail = ", ".join(packs.keys())
        print(f"dislop: unknown pack '{ns.pack}' (available: auto, {avail})", file=sys.stderr)
        return 2

    if "-" in ns.paths:
        try:
            stdin_text = _read_stdin_text_checked("check")
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        fn = _detect_stdin_filename(stdin_text, ns.stdin_filename)
        mod = detect_modality(fn) or "markdown"
        file_cfg = resolve_config_for_file(fn, config)
        try:
            pack, eff_pack, pack_source = _resolve_text_pack_and_source(stdin_text, fn, mod, ns.pack, file_cfg, packs)
            reg_info = resolve_register(stdin_text, filename=fn, flag_register=flag_register, config=file_cfg)
        except Exception as exc:
            print(f"dislop: {exc}", file=sys.stderr)
            return 2
        res = audit_text(stdin_text, filename=fn, modality=mod, pack=pack, config=file_cfg, register=flag_register)
        findings = list(res["findings"])
        if include_patterns:
            pat_res = audit_patterns(stdin_text, filename=fn, modality=mod, banks=banks_cached, config=file_cfg)
            findings = _merge_pattern_bank_findings(
                findings,
                pat_res["findings"],
                packs=packs,
                pack=pack,
                register=reg_info["register"],
                config=file_cfg,
            )
        profile_obj: dict[str, Any] | None = None
        ml_input: str | None = None
        if mod in PROSE_ML_MODALITIES and (include_ml or include_profile or len(stdin_text) >= 2000 or mod == "html"):
            profile_obj = analyze_text_profile(stdin_text, modality=mod, config=file_cfg)
            if include_ml:
                ml_input = build_zones(stdin_text, mod, {"proseFences": file_cfg.get("proseFences"), "maskBlockquotes": file_cfg.get("maskBlockquotes")})["prose"] if mod in {"html", "svg"} else stdin_text
                _, ml_extras = _build_pocket_ml_findings(
                    ml_input,
                    fn,
                    findings,
                    profile=profile_obj,
                    modality=mod,
                    register=reg_info["register"],
                )
                findings.extend(ml_extras)
        if rule_filter is not None:
            findings = [f for f in findings if f.get("ruleId") in rule_filter]
        triggered = any(SEVERITY_RANK[f["severity"]] >= SEVERITY_RANK[fail_on] for f in findings) or (
            ns.report_unused and len(res["unusedSuppressions"]) > 0
        )
        out_findings = (
            [f for f in findings if SEVERITY_RANK.get(f.get("severity", "info"), 1) >= SEVERITY_RANK[fail_on]]
            if quiet
            else findings
        )
        coverage_warnings = _collect_text_coverage_warnings(stdin_text, mod, fn, profile_obj)
        report: dict[str, Any] = {
            "version": ENGINE_VERSION,
            "context": {"register": reg_info["register"], "registerSource": reg_info["registerSource"]},
            "rulesetHash": compute_ruleset_hash(pack),
            "effectivePack": eff_pack,
            "packSource": pack_source,
            "changedFilter": False,
            "files": [{"file": fn, "modality": mod, "effectivePack": eff_pack, "packSource": pack_source}],
            "checkedCount": 1,
            "skipped": [],
            "coverageWarnings": coverage_warnings,
            "findings": out_findings,
            "unusedSuppressions": res["unusedSuppressions"] if ns.report_unused else [],
        }
        if include_profile and mod in PROSE_ML_MODALITIES:
            pocket_src = ml_input if ml_input is not None else (
                build_zones(stdin_text, mod, {"proseFences": file_cfg.get("proseFences"), "maskBlockquotes": file_cfg.get("maskBlockquotes")})["prose"]
                if mod in {"html", "svg"}
                else stdin_text
            )
            report["profiles"] = [
                {
                    "file": fn,
                    "profile": profile_obj or analyze_text_profile(stdin_text, modality=mod, config=file_cfg),
                    "pocketModel": _summarize_pocket_for_profile(pocket_src),
                }
            ]
        out_report = _apply_compact_report(report) if compact_json else report
        rendered = _colorize_text_report(format_report(out_report, fmt, ns.lang, quiet=quiet, fail_on=fail_on), use_color)
        if rendered:
            print(rendered)
        return 1 if triggered else 0

    changed_map: dict[str, set[int] | str] | None = None
    if ns.changed is not None or ns.staged:
        try:
            changed_map = _get_changed_lines(cwd, ns.changed or "HEAD", ns.staged)
        except Exception as exc:
            print(f"dislop: failed to read git diff: {exc}", file=sys.stderr)
            return 2

    targets = ns.paths or ([p for p in (changed_map or {}) if (cwd / p).exists()] if changed_map is not None else ["."])
    try:
        files, skipped_init = collect_target_files(targets, cwd, config, explicit_targets=bool(ns.paths))
    except Exception as exc:
        print(f"dislop: {exc}", file=sys.stderr)
        return 2

    all_findings: list[dict[str, Any]] = []
    all_skipped = list(skipped_init)
    all_coverage_warnings: list[dict[str, str]] = []
    all_unused: list[dict[str, Any]] = []
    all_profiles: list[dict[str, Any]] = []
    file_meta: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    seen_packs: set[str] = set()
    seen_sources: set[str] = set()
    reg_pairs: list[dict[str, str]] = []
    checked_count = 0
    explicit_targets = {(cwd / p).resolve() for p in ns.paths}
    explicit_uninspectable = bool(skipped_init)

    for abs_p, rel in files:
        if changed_map is not None and rel not in changed_map:
            continue
        mod_f = detect_modality(abs_p.name)
        if not mod_f:
            if abs_p not in explicit_targets:
                continue
            explicit_uninspectable = True
            all_skipped.append({"file": rel, "reason": f"Unsupported file extension '{abs_p.suffix or '(none)'}'"})
            continue
        try:
            res = _inspect_single_file_full(
                abs_p,
                rel,
                mod_f,
                packs,
                ns.pack,
                config,
                include_ml=include_ml,
                include_patterns=include_patterns,
                include_profile=include_profile,
                banks=banks_cached,
                register=flag_register,
            )
        except Exception as exc:
            print(f"dislop: {exc}", file=sys.stderr)
            return 2

        f_list = list(res["findings"])
        if res["checked"]:
            checked_count += 1
            if res.get("register"):
                reg_pairs.append({"register": res["register"], "registerSource": res.get("registerSource", "default")})
            if res.get("effectivePack"):
                seen_packs.add(res["effectivePack"])
            if res.get("packSource"):
                seen_sources.add(res["packSource"])
            if res.get("rulesetHash"):
                seen_hashes.add(res["rulesetHash"])
            file_meta.append({
                "file": rel,
                "modality": mod_f,
                "effectivePack": res.get("effectivePack"),
                "packSource": res.get("packSource"),
            })
            if res.get("profileItem"):
                all_profiles.append(res["profileItem"])
        elif abs_p in explicit_targets:
            explicit_uninspectable = True

        if changed_map is not None and rel in changed_map:
            allowed = changed_map[rel]
            if isinstance(allowed, set):
                line_starts = res.get("_lineStarts")
                filtered_findings: list[dict[str, Any]] = []
                for f in f_list:
                    start_line = f["line"] if isinstance(f.get("line"), int) else 1
                    raw_end = f.get("endLine")
                    end_line = raw_end if isinstance(raw_end, int) and raw_end >= start_line else start_line
                    span = f.get("span")
                    if not isinstance(raw_end, int) and isinstance(span, dict) and isinstance(span.get("end"), int) and line_starts:
                        end_off = max(span.get("start") or 0, span["end"] - 1)
                        end_line = max(start_line, offset_to_line_col(line_starts, end_off)[0])
                    if any(ln in allowed for ln in range(start_line, end_line + 1)):
                        filtered_findings.append(f)
                f_list = filtered_findings

        if rule_filter is not None:
            f_list = [f for f in f_list if f.get("ruleId") in rule_filter]

        all_findings.extend(f_list)
        all_skipped.extend(res["skipped"])
        if res.get("coverageWarnings"):
            all_coverage_warnings.extend(res["coverageWarnings"])
        if ns.report_unused:
            all_unused.extend(res["unusedSuppressions"])

    ruleset_hash = (
        next(iter(seen_hashes)) if len(seen_hashes) == 1
        else (fnv1a_hex("|".join(sorted(seen_hashes))) if len(seen_hashes) > 1 else None)
    )
    eff_pack_out = (
        next(iter(seen_packs)) if len(seen_packs) == 1
        else ("mixed" if len(seen_packs) > 1 else ns.pack)
    )
    pack_source_out = (
        next(iter(seen_sources)) if len(seen_sources) == 1
        else ("mixed" if len(seen_sources) > 1 else None)
    )

    should_fail = any(SEVERITY_RANK[f["severity"]] >= SEVERITY_RANK[fail_on] for f in all_findings) or (
        ns.report_unused and len(all_unused) > 0
    )
    out_findings = (
        [f for f in all_findings if SEVERITY_RANK.get(f.get("severity", "info"), 1) >= SEVERITY_RANK[fail_on]]
        if quiet
        else all_findings
    )

    report = {
        "version": ENGINE_VERSION,
        "context": _summarize_report_context(reg_pairs, flag_register),
        "rulesetHash": ruleset_hash,
        "effectivePack": eff_pack_out,
        "packSource": pack_source_out,
        "changedFilter": changed_map is not None,
        "files": file_meta,
        "checkedCount": checked_count,
        "skipped": all_skipped,
        "coverageWarnings": all_coverage_warnings,
        "findings": out_findings,
        "unusedSuppressions": all_unused,
    }
    if all_profiles:
        report["profiles"] = all_profiles
    out_report = _apply_compact_report(report) if compact_json else report
    rendered = _colorize_text_report(format_report(out_report, fmt, ns.lang, quiet=quiet, fail_on=fail_on), use_color)
    if rendered:
        print(rendered)

    if explicit_uninspectable or (checked_count == 0 and len(all_skipped) > 0):
        return 2
    return 1 if should_fail else 0


_POCKET_STEALTH_VAPOR_RULE: dict[str, Any] = {
    "id": "pocket-stealth-vapor",
    "tier": "taste",
    "severity": "warning",
    "category": "statistical-vapor",
    "dimension": "discourse-rhythm",
    "family": "rhythm/pocket-stealth-vapor",
    "modalities": ["markdown", "text"],
    "tags": ["pocket-ml", "stealth-vapor", "low-concreteness", "flat-cadence"],
    "message": {
        "en": "Paragraph scores above the bundled 15 KB Pocket ML threshold for low-concreteness, uniform-cadence AI filler despite avoiding banned buzzwords.",
        "zh": "段落虽避开了禁用热词表，但在句长节奏、抽象名词化与低事实密度上命中内置 15 KB 轻量集成模型的温吞水套话阈值。",
    },
    "deletionTest": {
        "en": "Cut this paragraph or replace abstract cushion wrappers with one concrete event, number, file path, or direct action.",
        "zh": "删掉整段空泛铺垫，或把抽象缓冲外壳直接换成具体事件、数字、文件路径或明确动作。",
    },
    "exemplar": {
        "bad": "During ongoing collaboration, maintaining a steady rhythm across teams helps surface operational observations early while supporting long-term alignment.",
        "trap": "This isn't about more meetings — it's about radical operational clarity.",
        "good": "We post a 3-line status update in #release every Tuesday at 10:00 so blockers surface before Thursday's cut.",
        "source": "Original constructed example (Apache-2.0)",
    },
}


def _cmd_explain(
    ns: argparse.Namespace,
    packs: dict[str, dict[str, Any]],
    pattern_by_rule_id: dict[str, dict[str, Any]] | None = None,
) -> int:
    as_json = bool(ns.json or getattr(ns, "format", "text") == "json")
    for pack in packs.values():
        for rule in pack.get("rules", []):
            if rule["id"] == ns.rule_id:
                if as_json:
                    print(json.dumps({"packId": pack["id"], **rule}, ensure_ascii=False, indent=2))
                    return 0
                lang = ns.lang
                print(f"{rule['id']}  [{rule.get('tier')} / {rule.get('severity')}]  (pack: {pack['id']})")
                print(f"Modalities: {', '.join(rule.get('modalities', []))}")
                print(f"Why:        {rule['message'].get(lang) or rule['message'].get('en')}")
                dt = rule.get("deletionTest")
                if dt:
                    print(f"Test:       {dt.get(lang) or dt.get('en')}")
                ex = rule.get("exemplar")
                if ex:
                    print(f"\nBefore (bad):  {ex['bad']}")
                    if ex.get("trap"):
                        print(f"Trap (avoid):  {ex['trap']}")
                    print(f"After (good):  {ex['good']}")
                    if ex.get("note"):
                        print(f"Note:          {ex['note'].get(lang) or ex['note'].get('en')}")
                return 0
    pat = pattern_by_rule_id.get(ns.rule_id) if pattern_by_rule_id else None
    if pat:
        sev = pat.get("severityDefault") or "info"
        pack_id = pat.get("packId") or "pattern-bank"
        msg = pat.get("mechanism") or pat.get("name") or {"en": "", "zh": ""}
        guards_list = pat.get("falsePositiveGuards") or []
        guards = " ".join(guards_list) if isinstance(guards_list, list) else ""
        synth: dict[str, Any] = {
            "packId": pack_id,
            "id": ns.rule_id,
            "tier": "taste",
            "severity": sev,
            "category": pat.get("category") or "general",
            "dimension": pat.get("dimension"),
            "modalities": list(pat.get("modalities") or ["markdown", "text"]),
            "tags": list(pat.get("tags") or []),
            "message": msg,
        }
        if guards:
            synth["deletionTest"] = {"en": guards, "zh": guards}
        if pat.get("exemplar"):
            synth["exemplar"] = pat["exemplar"]
        if as_json:
            print(json.dumps(synth, ensure_ascii=False, indent=2))
            return 0
        lang = ns.lang
        print(f"{synth['id']}  [{synth['tier']} / {synth['severity']}]  (pack: {pack_id})")
        print(f"Modalities: {', '.join(synth['modalities'])}")
        print(f"Why:        {msg.get(lang) or msg.get('en')}")
        if guards:
            print(f"Guards:     {guards}")
        ex = pat.get("exemplar")
        if ex:
            print(f"\nBefore (bad):  {ex['bad']}")
            if ex.get("trap"):
                print(f"Trap (avoid):  {ex['trap']}")
            print(f"After (good):  {ex['good']}")
        return 0
    if ns.rule_id == "pocket-stealth-vapor":
        r = _POCKET_STEALTH_VAPOR_RULE
        if as_json:
            print(json.dumps({"packId": "pocket-model", **r}, ensure_ascii=False, indent=2))
            return 0
        lang = ns.lang
        print(f"{r['id']}  [{r['tier']} / {r['severity']}]  (pack: pocket-model)")
        print(f"Modalities: {', '.join(r['modalities'])}")
        print(f"Why:        {r['message'].get(lang) or r['message'].get('en')}")
        print(f"Test:       {r['deletionTest'].get(lang) or r['deletionTest'].get('en')}")
        ex = r["exemplar"]
        print(f"\nBefore (bad):  {ex['bad']}")
        print(f"Trap (avoid):  {ex['trap']}")
        print(f"After (good):  {ex['good']}")
        return 0
    print(f"dislop: unknown rule '{ns.rule_id}'", file=sys.stderr)
    return 2


def _cmd_packs(ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    items = [
        {
            "id": p["id"],
            "version": p["version"],
            "tier": p.get("tier"),
            "extends": p.get("extends", []),
            "name": p["name"],
            "modalities": p["modalities"],
            "ruleCount": len(p.get("rules", [])),
            "summary": p["summary"],
        }
        for p in packs.values()
    ]
    if ns.json or getattr(ns, "format", "text") == "json":
        print(json.dumps(items, ensure_ascii=False, indent=2))
        return 0
    for item in items:
        print(f"{item['id']:<18} [{item['tier']}] ({item['ruleCount']} rules) — {item['name']['en']} / {item['name']['zh']}")
        print(f"  modalities: {', '.join(item['modalities'])}")
    return 0


VALID_MODALITIES = {"markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx", "pdf", "image"}
VALID_SEVERITIES = {"error", "warning", "info"}
VALID_TIERS = {"invariant", "taste"}


def _cmd_catalog(ns: argparse.Namespace, packs: dict[str, dict[str, Any]], pattern_by_rule_id: dict[str, dict[str, Any]]) -> int:
    fmt = "json" if ns.json else ns.format
    if fmt not in {"text", "json", "md"}:
        print(f"dislop: invalid --format '{fmt}' (expected text, json, or md)", file=sys.stderr)
        return 2
    if ns.severity and ns.severity not in VALID_SEVERITIES:
        print(f"dislop: invalid --severity '{ns.severity}' (expected error, warning, or info)", file=sys.stderr)
        return 2
    if ns.modality and ns.modality not in VALID_MODALITIES:
        print(f"dislop: invalid --modality '{ns.modality}'", file=sys.stderr)
        return 2
    if ns.tier and ns.tier not in VALID_TIERS:
        print(f"dislop: invalid --tier '{ns.tier}' (expected invariant or taste)", file=sys.stderr)
        return 2

    q = ns.query or " ".join(ns.terms or []).strip()
    entries = build_catalog(packs, pattern_by_rule_id)
    result = query_catalog(
        entries,
        {
            "query": q,
            "pack": ns.pack,
            "category": ns.category,
            "dimension": ns.dimension,
            "family": ns.family,
            "modality": ns.modality,
            "severity": ns.severity,
            "tier": ns.tier,
            "includeExemplars": not ns.no_exemplars,
            "limit": ns.limit,
        },
    )
    if fmt == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    lang = ns.lang
    if fmt == "md":
        rows = [
            "| Rule | Pack | Severity | Category | Modalities | Description |",
            "|---|---|---|---|---|---|",
        ]
        for item in result["items"]:
            msg = ((item.get("message") or {}).get(lang) or (item.get("message") or {}).get("en") or "").replace("|", "\\|")
            rows.append(
                f"| `{item['id']}` | `{item['packId']}` | `{item['severity']}` | `{item['category']}` | {', '.join(item.get('modalities') or [])} | {msg} |"
            )
        print("\n".join(rows))
        return 0

    print(f"dislop catalog: {result['matched']} / {result['total']} rule(s) matched")
    for item in result["items"]:
        msg = (item.get("message") or {}).get(lang) or (item.get("message") or {}).get("en") or ""
        print(f"  [{item['severity']:<7}] {item['id']:<30} ({item['packId']} · {item['category']}) — {msg}")
    return 0


def _cmd_pack_test(packs: dict[str, dict[str, Any]]) -> int:
    errors: list[str] = []
    assertions = 0
    for pack in packs.values():
        if pack.get("schema") != "dislop.pack/2":
            errors.append(f"{pack['id']}: expected schema 'dislop.pack/2'")
        eff = resolve_effective_pack(pack["id"], packs, {})
        for rule in pack.get("rules", []):
            rid = rule["id"]
            if not (rule.get("deletionTest") or {}).get("en") or not (rule.get("deletionTest") or {}).get("zh"):
                errors.append(f"{pack['id']}/{rid}: missing bilingual deletionTest")
            ex = rule.get("exemplar") or {}
            if not ex.get("bad") or not ex.get("good") or not ex.get("source"):
                errors.append(f"{pack['id']}/{rid}: missing exemplar")
            hits = (rule.get("fixtures") or {}).get("hit", [])
            cleans = (rule.get("fixtures") or {}).get("clean", [])
            if not hits or not cleans:
                errors.append(f"{pack['id']}/{rid}: requires hit and clean fixtures")
            mod = (rule.get("modalities") or ["markdown"])[0]
            for h in hits:
                assertions += 1
                res = audit_text(h, filename=f"fixture.{mod}", modality=mod, pack=eff, allow_synthetic_fixtures=True)
                if not any(f["ruleId"] == rid for f in res["findings"]):
                    errors.append(f"{pack['id']}/{rid}: hit fixture missed: {h!r}")
            for c in cleans:
                assertions += 1
                res = audit_text(c, filename=f"fixture.{mod}", modality=mod, pack=eff, allow_synthetic_fixtures=True)
                if any(f["ruleId"] == rid for f in res["findings"]):
                    errors.append(f"{pack['id']}/{rid}: clean fixture falsely triggered: {c!r}")
            for pat in rule.get("patterns") or []:
                if ".*" in pat:
                    errors.append(f"{pack['id']}/{rid}: unbounded '.*' forbidden in portable pack regex: {pat}")
            reg_ov = rule.get("registerOverrides")
            if reg_ov:
                if rule.get("tier") == "invariant":
                    errors.append(f"{pack['id']}/{rid}: invariant rules cannot define registerOverrides")
                for rk, rov in reg_ov.items():
                    if rk not in VALID_REGISTERS or rk == "unspecified":
                        errors.append(f"{pack['id']}/{rid}: invalid registerOverrides key '{rk}'")
                    if isinstance(rov, dict) and rov.get("severity") and SEVERITY_RANK.get(rov["severity"], 0) > SEVERITY_RANK[rule["severity"]]:
                        errors.append(f"{pack['id']}/{rid}: registerOverrides['{rk}'] cannot raise severity above '{rule['severity']}'")
                reg_fixtures = (rule.get("fixtures") or {}).get("register") or []
                if not reg_fixtures:
                    errors.append(f"{pack['id']}/{rid}: registerOverrides requires at least 1 fixtures.register assertion")
                for rf in reg_fixtures:
                    assertions += 1
                    res = audit_text(
                        rf["text"],
                        filename=f"fixture.{mod}",
                        modality=mod,
                        pack=eff,
                        allow_synthetic_fixtures=True,
                        register=rf["register"],
                    )
                    hit = next((f for f in res["findings"] if f["ruleId"] == rid), None)
                    if rf["expect"] == "skip":
                        if hit is not None:
                            errors.append(f"{pack['id']}/{rid}: expected register '{rf['register']}' to skip")
                    elif hit is None or hit.get("severity") != rf["expect"]:
                        got_sev = hit.get("severity") if hit else "none"
                        errors.append(f"{pack['id']}/{rid}: register '{rf['register']}' expected '{rf['expect']}', got '{got_sev}'")
    if errors:
        print(f"dislop pack-test: FAILED ({len(errors)} error(s) across {assertions} assertions)", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print(f"dislop pack-test: ok ({len(packs)} packs, {assertions} fixture assertions passed)")
    return 0


def _cmd_resources(ns: argparse.Namespace, packs: dict[str, Any]) -> int:
    payload = {
        "schema": "dislop.resources/1",
        "offlineCheck": True,
        "note": "'dislop check' runs 100% locally with zero network requests and zero file uploads.",
        "bundledPacks": sorted(packs.keys()),
        "staticResources": {
            "llmsIndex": "https://dislop.com/llms.txt",
            "catalog": "https://dislop.com/catalog.json",
            "awesomeIndex": "https://dislop.com/awesome/index.json",
            "mcpServerCard": "https://dislop.com/.well-known/mcp/server-card.json",
            "agentSkillsIndex": "https://dislop.com/.well-known/agent-skills/index.json",
            "tasks": [
                "https://dislop.com/tasks/business-doc.md",
                "https://dislop.com/tasks/web-and-deck.md",
                "https://dislop.com/tasks/editorial-writing.md",
                "https://dislop.com/tasks/pre-release-gate.md",
            ],
            "ruleTemplate": "https://dislop.com/rules/<rule-id>.md",
        },
        "optionalCloudMcp": {
            "url": "https://dislop.com/mcp",
            "oauthMetadata": "https://dislop.com/.well-known/oauth-protected-resource/mcp",
            "pricingAndFreeToken": "https://dislop.com/#pricing",
            "freeToolsNoLogin": ["dislop_check", "dislop_verify", "dislop_rules"],
            "tools": [
                "dislop_check",
                "dislop_verify",
                "dislop_rules",
                "dislop_review",
                "dislop_deslop",
                "dislop_office",
                "dislop_visual_review",
                "dislop_voice_extract",
                "dislop_voice_manage",
                "dislop_account",
            ],
        },
    }
    if ns.json or getattr(ns, "format", "text") == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    print(f"dislop v{ENGINE_VERSION} resources (dislop check makes 0 network requests)")
    print(f"\nBundled offline packs: {', '.join(payload['bundledPacks'])}")
    print("\nFree read-only static resources (dislop.com):")
    print(f"  - Agent index : {payload['staticResources']['llmsIndex']}")
    print(f"  - Full catalog: {payload['staticResources']['catalog']}")
    print(f"  - Awesome 90  : {payload['staticResources']['awesomeIndex']}")
    print(f"  - MCP card    : {payload['staticResources']['mcpServerCard']}")
    print(f"  - Skills index: {payload['staticResources']['agentSkillsIndex']}")
    print(f"  - Rule card   : {payload['staticResources']['ruleTemplate']}")
    print("\nOptional hosted Cloud Remote MCP (0-credit check/verify/rules need no login; 30 free credits/mo after sign-in):")
    print(f"  - Endpoint    : {payload['optionalCloudMcp']['url']}")
    print(f"  - Free token  : {payload['optionalCloudMcp']['pricingAndFreeToken']}")
    return 0


def _cmd_patterns(ns: argparse.Namespace) -> int:
    import zipfile

    banks = load_pattern_banks()
    angles = [s.strip() for s in str(ns.angle).split(",") if s.strip()] if ns.angle else None
    text = ""
    filename = ns.stdin_filename or "stdin.md"
    modality = detect_modality(filename) or "markdown"
    ooxml: dict[str, str] | None = None

    if not ns.target or ns.target == "-":
        text = sys.stdin.read()
    else:
        abs_p = (Path.cwd() / ns.target).resolve()
        if not abs_p.is_file():
            print(f"dislop: file not found: {ns.target}", file=sys.stderr)
            return 2
        filename = ns.target
        detected = detect_modality(abs_p.name)
        if not detected:
            print(f"dislop: unsupported file extension for '{ns.target}'", file=sys.stderr)
            return 2
        modality = detected
        if modality in {"pdf", "image"}:
            print(
                f"dislop: unsupported modality '{modality}' for patterns (use 'dislop check' for PDF and image files)",
                file=sys.stderr,
            )
            return 2
        try:
            if modality in {"pptx", "docx"}:
                ooxml = {}
                with zipfile.ZipFile(abs_p, "r") as zf:
                    for info in zf.infolist():
                        if info.filename.endswith((".xml", ".rels")):
                            ooxml[info.filename] = zf.read(info.filename).decode("utf-8", errors="replace")
            else:
                text = abs_p.read_bytes().decode("utf-8")
        except Exception as exc:
            print(f"dislop: uninspectable {modality.upper()} file '{ns.target}': {exc}", file=sys.stderr)
            return 2

    profile = analyze_pattern_profile(text, filename=filename, modality=modality, banks=banks, angles=angles, ooxml=ooxml)
    if ns.json or ns.format == "json":
        print(json.dumps(profile, ensure_ascii=False, indent=2))
        return 0
    if profile["findingCount"] == 0:
        print(f"dislop patterns: ok ({filename}, 0 pattern findings)")
        return 0
    print(
        f"dislop patterns: {profile['findingCount']} finding(s) in {filename} "
        f"(dimensions: {', '.join(profile['activeDimensions'])})"
    )
    for f in profile["findings"]:
        msg = (f.get("message") or {}).get(ns.lang) or (f.get("message") or {}).get("en") or ""
        metric_note = f" · {f['metric']}" if f.get("metric") else ""
        print(f"  [{f['severity'].upper()}] {f['file']}:{f['location']}  {f['ruleId']}  ({f['detectionAngle']}{metric_note})")
        print(f'    match: "{f["match"]}"')
        print(f"    why:   {msg}")
    return 0


def _cmd_voice(ns: argparse.Namespace) -> int:
    samples: list[str] = []
    if not ns.paths or ns.paths == ["-"]:
        raw = sys.stdin.read()
        samples.extend([s.strip() for s in re.split(r"\n\s*\n", raw) if s.strip()])
    else:
        for p in ns.paths:
            abs_p = (Path.cwd() / p).resolve()
            if not abs_p.is_file():
                print(f"dislop: file not found: {p}", file=sys.stderr)
                return 2
            try:
                samples.append(abs_p.read_bytes().decode("utf-8"))
            except UnicodeDecodeError as exc:
                print(f"dislop: non-UTF-8 sample file '{p}': {exc}", file=sys.stderr)
                return 2
    if not samples:
        print("dislop voice: provide at least one non-empty sample file or stdin text", file=sys.stderr)
        return 2

    res = extract_voice_profile_offline(samples, lang=ns.lang)
    if ns.output:
        out_p = (Path.cwd() / ns.output).resolve()
        out_p.parent.mkdir(parents=True, exist_ok=True)
        out_p.write_text(json.dumps(res, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if ns.json or ns.format == "json":
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0

    s = res["stylometrics"]
    print(f"dislop voice ({res['mode']}, 0 network calls)")
    print(
        f"  samples={s['sampleCount']} · sentences={s['sentenceCount']} · mean={s['meanLength']} "
        f"· cv={s['lengthCV']} · band=[{s['targetLengthBand'][0]}, {s['targetLengthBand'][1]}]"
    )
    print(f"  tone: {res['profile']['tone']}")
    for h in res["profile"]["sentenceHabits"]:
        print(f"  - {h}")
    return 0


def _read_utf8_exact(path: Path) -> str:
    with path.open("r", encoding="utf-8", newline="") as f:
        return f.read()


def _cmd_local_deslop(target: str | None, ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    as_json = bool(ns.json or ns.format == "json")
    fn = getattr(ns, "stdin_filename", None) or "draft.md"
    if not target or target == "-":
        raw_text = sys.stdin.read()
    else:
        abs_p = (Path.cwd() / target).resolve()
        if not abs_p.is_file():
            print(f"dislop: file not found: {target}", file=sys.stderr)
            return 2
        fn = abs_p.name
        raw_text = _read_utf8_exact(abs_p)

    mod = detect_modality(fn) or "markdown"
    config = load_config(Path.cwd(), getattr(ns, "config", None))
    flag_register: str | None = None
    if getattr(ns, "register", None) is not None:
        norm = str(ns.register).strip().lower()
        if not norm or (norm != "auto" and norm not in VALID_REGISTERS):
            joined = ", ".join(VALID_REGISTERS)
            print(f"dislop: invalid --register '{ns.register}' (expected auto, {joined})", file=sys.stderr)
            return 2
        flag_register = norm
    file_cfg = resolve_config_for_file(fn, config)
    reg_info = resolve_register(raw_text, filename=fn, flag_register=flag_register, config=file_cfg)
    raw_pack = getattr(ns, "pack", None)
    eff_pack = (
        predict_pack_with_pocket_router(raw_text)["recommendedPack"]
        if raw_pack == "auto"
        else raw_pack
    )
    pack_id = pick_pack_for_file(fn, mod, eff_pack, config)
    pack = resolve_effective_pack(pack_id, packs, config)

    try:
        res = run_local_deslop(
            text=raw_text,
            pack=pack,
            modality=mod,
            register=reg_info["register"],
            endpoint=getattr(ns, "endpoint", None),
            model=getattr(ns, "model", None),
            allow_lan=bool(getattr(ns, "allow_lan", False)),
        )
    except Exception as exc:
        print(f"dislop: {exc}", file=sys.stderr)
        return 2

    if not res.get("ok"):
        if as_json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        else:
            print(f"dislop: {res.get('error')}", file=sys.stderr)
        return 2

    out_arg = getattr(ns, "output", None)
    if out_arg:
        out_p = (Path.cwd() / out_arg).resolve()
        out_p.parent.mkdir(parents=True, exist_ok=True)
        out_p.write_text(res["text"], encoding="utf-8")

    if as_json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0

    if not out_arg:
        txt_out = res["text"]
        sys.stdout.write(txt_out if txt_out.endswith("\n") else txt_out + "\n")
    elif ns.lang == "zh":
        st_str = "通过" if res["factLedgerOk"] else "未通过"
        print(
            f"dislop 本地改写完成（{res['model']}）：改写 {res['rewrittenParagraphs']} 段，保留原段 {res['keptOriginalParagraphs']} 段，事实核验 {st_str} -> {out_arg}"
        )
    else:
        st_str = "ok" if res["factLedgerOk"] else "drifted"
        print(
            f"dislop local deslop ({res['model']}): rewrote {res['rewrittenParagraphs']} paragraph(s), kept {res['keptOriginalParagraphs']} untouched, fact ledger {st_str} -> {out_arg}"
        )
    return 0


def _cmd_model(ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    action = ns.action or "status"
    valid_actions = {"status", "recommend", "score", "install", "setup", "import", "remove", "rm", "deslop"}
    if action not in valid_actions:
        print(
            f"dislop model: unknown action '{action}' (expected status, recommend, score, install, setup, import, remove, or deslop)",
            file=sys.stderr,
        )
        return 2
    as_json = bool(ns.json or ns.format == "json")
    lang = ns.lang

    if action == "score":
        target = ns.target or "-"
        if ns.threshold is not None and (math.isnan(ns.threshold) or math.isinf(ns.threshold) or ns.threshold < 0.0 or ns.threshold > 1.0):
            print(f"dislop model score: invalid --threshold '{ns.threshold}' (expected a number between 0 and 1)", file=sys.stderr)
            return 2
        label = ns.stdin_filename or "stdin.md"
        if target == "-":
            raw_text = sys.stdin.read()
        else:
            abs_p = (Path.cwd() / target).resolve()
            if not abs_p.is_file():
                print(f"dislop model score: file not found: {target}", file=sys.stderr)
                return 2
            label = target
            raw_text = _read_utf8_exact(abs_p)
        result = analyze_document_with_pocket_models(raw_text, threshold=ns.threshold)
        if as_json:
            print(json.dumps({"file": label, **result}, ensure_ascii=False, indent=2))
            return 0
        pct = _js_round_pct(result["documentProbability"])
        thr_pct = _js_round_pct(result["threshold"])
        conf_pct = _js_round_pct(result["packRouter"]["confidence"])
        if lang == "zh":
            print(f"dislop 内置传统模型评分（pocket-slop-v1 · 0 联网）：{label}")
            print(f"  文档最高温吞水概率 : {pct}%（阈值 {thr_pct}% · 命中段落 {result['flaggedCount']}/{len(result['paragraphs'])}）")
            print(f"  自动判别场景包     : {result['packRouter']['recommendedPack']}（置信度 {conf_pct}%）")
            for p in result["paragraphs"]:
                mark = "[提醒]" if p["flagged"] else "[正常]"
                drv = "、".join(d["reason"]["zh"] for d in p["topDrivers"])
                suffix = f"：{drv}" if drv else ""
                print(f"  {mark} 第 {p['startLine']}-{p['endLine']} 行 ({_js_round_pct(p['slopProbability'])}%){suffix}")
        else:
            print(f"dislop bundled Pocket ML score (pocket-slop-v1 · 0 network calls): {label}")
            print(f"  Max paragraph slop : {pct}% (threshold {thr_pct}% · flagged {result['flaggedCount']}/{len(result['paragraphs'])})")
            print(f"  Recommended pack   : {result['packRouter']['recommendedPack']} (confidence {conf_pct}%)")
            for p in result["paragraphs"]:
                mark = "[FLAG]" if p["flagged"] else "[OK]  "
                drv = "; ".join(d["reason"]["en"] for d in p["topDrivers"])
                suffix = f" — {drv}" if drv else ""
                print(f"  {mark} lines {p['startLine']}-{p['endLine']} ({_js_round_pct(p['slopProbability'])}%){suffix}")
        return 0

    if action in {"install", "setup"}:
        rules_count = sum(len(p.get("rules", [])) for p in packs.values())
        status = build_model_status_report(
            packs_count=len(packs),
            rules_count=rules_count,
            probe_loopback=False,
            cache_dir=ns.cache_dir,
        )
        chosen_tier = ns.tier
        if not chosen_tier:
            if action == "setup" and sys.stdin.isatty() and not ns.yes and not as_json and not ns.dry_run:
                rec_tier = status["recommendation"]["tier"]
                if lang == "zh":
                    print("dislop 模型选装向导（内置 15 KB 传统集成模型已就绪）")
                    print(f"  硬件检测：{status['hardware']['platform']}/{status['hardware']['arch']} · {status['hardware']['totalMemoryGb']} GB 内存 · 推荐档位 {rec_tier}")
                    for t in LOCAL_MODEL_TIERS.values():
                        print(f"  - {t['tier']:<9} ({t['approxDownloadMb']:>4} MB): {t['summary']['zh']}")
                    ans = input(f"\n请选择要选装的本地模型档位 [none / fast / balanced / quality]（回车默认 {rec_tier}）：").strip().lower()
                else:
                    print("dislop optional model setup (bundled 15 KB Pocket ML is already active)")
                    print(f"  Hardware: {status['hardware']['platform']}/{status['hardware']['arch']} · {status['hardware']['totalMemoryGb']} GB RAM · recommended '{rec_tier}'")
                    for t in LOCAL_MODEL_TIERS.values():
                        print(f"  - {t['tier']:<9} ({t['approxDownloadMb']:>4} MB): {t['summary']['en']}")
                    ans = input(f"\nChoose optional local model tier [none / fast / balanced / quality] (Enter for '{rec_tier}'): ").strip().lower()
                chosen_tier = ans or rec_tier
            else:
                chosen_tier = ns.target or "auto"

        res = install_optional_model(
            tier=chosen_tier,
            provider=ns.provider or "ollama",
            force=bool(ns.force),
            dry_run=bool(ns.dry_run),
            cache_dir=ns.cache_dir,
        )
        if as_json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
            if not res.get("ok"):
                return 1 if res.get("blockedByHardware") else 2
            return 0
        if not res.get("ok"):
            msg = (res.get("warning") or {}).get(lang) or (res.get("message") or {}).get(lang) or (res.get("warning") or {}).get("en") or (res.get("message") or {}).get("en") or res.get("error")
            print(f"dislop model install: {msg}", file=sys.stderr)
            return 1 if res.get("blockedByHardware") else 2
        if res.get("dryRun"):
            target_info = res.get("command") or res.get("modelCacheDir")
            if lang == "zh":
                print(f"dislop 选装预检通过：档位 {res['tier']} ({res.get('modelId') or res.get('provider')}, 约 {res.get('approxDownloadMb') or 0} MB) -> {target_info}")
            else:
                print(f"dislop install dry-run passed: tier '{res['tier']}' ({res.get('modelId') or res.get('provider')}, ~{res.get('approxDownloadMb') or 0} MB) -> {target_info}")
            return 0
        done_msg = (res.get("message") or {}).get(lang) or (res.get("message") or {}).get("en") or f"Installed tier '{res['tier']}' ({res.get('modelId')})."
        print(done_msg)
        return 0

    if action == "import":
        if not ns.target:
            print("Usage: dislop model import <file.gguf|file.onnx> [--tier <tier>] [--sha256 <hex>] [--no-copy] [--json]", file=sys.stderr)
            return 2
        res = import_local_model_file(
            file_path=ns.target,
            tier=ns.tier or "custom",
            expected_sha256=ns.sha256,
            copy_file=not bool(ns.no_copy),
            cache_dir=ns.cache_dir,
        )
        if as_json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
            return 0 if res.get("ok") else 2
        if not res.get("ok"):
            print(f"dislop model import: {res.get('error')}", file=sys.stderr)
            return 2
        imp = res["imported"]
        print(f"Imported {imp['id']} (tier={imp['tier']}, sha256={imp['sha256'][:12]}…) -> {imp['path']}")
        return 0

    if action in {"remove", "rm"}:
        target = ns.target or ns.tier or ""
        res = remove_installed_model(target=target, cache_dir=ns.cache_dir)
        if as_json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
            return 0 if res.get("ok") else 1
        if not res.get("ok"):
            print(f"dislop model remove: {res.get('error') or f'no cached model matched {target!r}'}", file=sys.stderr)
            return 1
        print(f"Removed {res['removedCount']} cached model entry(s).")
        return 0

    if action == "deslop":
        return _cmd_local_deslop(ns.target or "-", ns, packs)

    rules_count = sum(len(p.get("rules", [])) for p in packs.values())
    report = build_model_status_report(
        packs_count=len(packs),
        rules_count=rules_count,
        probe_loopback=not bool(ns.no_loopback),
        cache_dir=ns.cache_dir,
    )
    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    hw = report["hardware"]
    rec = report["recommendation"]
    bm = (report.get("bundledModels") or [None])[0]
    disk_str_zh = f" · 剩余磁盘 {hw['freeDiskGb']} GB" if hw["freeDiskGb"] is not None else ""
    disk_str_en = f" · {hw['freeDiskGb']} GB free disk" if hw["freeDiskGb"] is not None else ""
    if lang == "zh":
        print("dislop 本地引擎、随包传统模型与选装小模型状态（检查全程 0 联网）")
        print(f"  内置确定性引擎 : 已就绪（{report['builtinDeterministic']['bundledPacks']} 套规则包 / {report['builtinDeterministic']['bundledRules']} 条规则全量内置）")
        if bm:
            print(f"  随包传统模型   : 已内置 {bm['id']}（约 {bm['approxGzipKb']} KB gz · 含隐蔽水文集成评分与场景自动路由）")
        print(f"  当前机器硬件   : {hw['platform']}/{hw['arch']} · {hw['totalMemoryGb']} GB 内存{disk_str_zh}")
        rec_model = f" ({rec['modelId']}, 约 {rec['approxDownloadMb']} MB)" if rec["modelId"] else "（无需额外下载）"
        print(f"  可选生成小模型 : {rec['tier']}{rec_model}")
        print(f"  说明           : {rec['reason']['zh']}")
        if rec["installHint"]:
            print(f"  按需选装命令   : {rec['installHint']}")
        if report["installedModels"]:
            inst_str = ", ".join(f"{m['id']}[{m['tier']}]" for m in report["installedModels"])
            print(f"  已装本地权重   : {inst_str}")
        for r in report["localRunners"]:
            print(f"  已发现本地服务 : {r['kind']} ({r['endpoint']}) -> {', '.join(r['models']) or '无已装模型'}")
    else:
        print("dislop local engine, bundled ML & optional model status (0 external network calls)")
        print(f"  Built-in engine : ready ({report['builtinDeterministic']['bundledPacks']} packs / {report['builtinDeterministic']['bundledRules']} rules bundled offline)")
        if bm:
            print(f"  Bundled ML      : ready ({bm['id']}, ~{bm['approxGzipKb']} KB gz · paragraph slop ensemble + domain router)")
        print(f"  Hardware        : {hw['platform']}/{hw['arch']} · {hw['totalMemoryGb']} GB RAM{disk_str_en}")
        rec_model = f" ({rec['modelId']}, ~{rec['approxDownloadMb']} MB)" if rec["modelId"] else " (no extra download needed)"
        print(f"  Recommended SLM : {rec['tier']}{rec_model}")
        print(f"  Reason          : {rec['reason']['en']}")
        if rec["installHint"]:
            print(f"  Optional install: {rec['installHint']}")
        if report["installedModels"]:
            inst_str = ", ".join(f"{m['id']}[{m['tier']}]" for m in report["installedModels"])
            print(f"  Cached weights  : {inst_str}")
        for r in report["localRunners"]:
            print(f"  Active loopback : {r['kind']} ({r['endpoint']}) -> {', '.join(r['models']) or 'no models loaded'}")
    return 0


def _read_git_baseline_for_file(abs_file: Path, git_ref: str = "HEAD") -> str:
    top_res = subprocess.run(
        ["git", "-c", "core.quotepath=off", "rev-parse", "--show-toplevel"],
        cwd=abs_file.parent,
        capture_output=True,
        check=True,
    )
    top_dir = Path(top_res.stdout.decode("utf-8").strip()).resolve()
    rel_posix = abs_file.resolve().relative_to(top_dir).as_posix()
    show_res = subprocess.run(
        ["git", "-c", "core.quotepath=off", "show", f"{git_ref}:{rel_posix}"],
        cwd=top_dir,
        capture_output=True,
        check=True,
    )
    return show_res.stdout.decode("utf-8")


def _cmd_verify(ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    cwd = Path.cwd()
    fmt = "json" if ns.json else ns.format
    keep_terms = [t.strip() for t in (ns.keep or "").split(",") if t.strip()]
    config = load_config(cwd, ns.config)
    flag_register: str | None = None
    if getattr(ns, "register", None) is not None:
        norm = str(ns.register).strip().lower()
        if not norm or (norm != "auto" and norm not in VALID_REGISTERS):
            joined = ", ".join(VALID_REGISTERS)
            print(f"dislop: invalid --register '{ns.register}' (expected auto, {joined})", file=sys.stderr)
            return 2
        flag_register = norm

    if ns.git is not None:
        git_ref = "HEAD"
        target_arg: str | None = None
        if not ns.targets:
            target_arg = ns.git if ns.git != "HEAD" else None
        else:
            git_ref = ns.git or "HEAD"
            target_arg = ns.targets[0]
        if not target_arg:
            print("Usage: dislop verify --git [ref] <file> [--keep a,b] [--pack <id|auto>] [--strict] [--json]", file=sys.stderr)
            return 2
        abs_t = (cwd / target_arg).resolve()
        if not abs_t.is_file():
            print(f"dislop: file not found: {target_arg}", file=sys.stderr)
            return 2
        label = target_arg
        after_text = _read_utf8_exact(abs_t)
        try:
            before_text = _read_git_baseline_for_file(abs_t, git_ref)
        except Exception as exc:
            print(f"dislop verify: failed to read '{git_ref}' baseline for '{target_arg}': {exc}", file=sys.stderr)
            return 2
    else:
        if len(ns.targets) < 2:
            print("Usage: dislop verify <before-file> <after-file> [--keep a,b] [--pack <id|auto>] [--strict] [--json]", file=sys.stderr)
            return 2
        before_abs = (cwd / ns.targets[0]).resolve()
        after_abs = (cwd / ns.targets[1]).resolve()
        if not before_abs.is_file():
            print(f"dislop: file not found: {ns.targets[0]}", file=sys.stderr)
            return 2
        if not after_abs.is_file():
            print(f"dislop: file not found: {ns.targets[1]}", file=sys.stderr)
            return 2
        label = ns.targets[1]
        before_text = _read_utf8_exact(before_abs)
        after_text = _read_utf8_exact(after_abs)

    mod = detect_modality(label) or "markdown"
    file_cfg = resolve_config_for_file(label, config)
    try:
        pack, eff_pack, pack_source = _resolve_text_pack_and_source(after_text, label, mod, ns.pack or "auto", file_cfg, packs)
    except Exception as exc:
        print(f"dislop: {exc}", file=sys.stderr)
        return 2
    result = verify_revision_bundle(
        before_text,
        after_text,
        filename=label,
        modality=mod,
        pack=pack,
        config=file_cfg,
        register=flag_register,
        keep_terms=keep_terms,
        allow_added=bool(ns.allow_added),
        strict=bool(ns.strict),
    )
    result["effectivePack"] = eff_pack
    result["packSource"] = pack_source

    if fmt == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        fl = result["factLedger"]
        lc = result["lengthCheck"]
        ad = result["antiDegradation"]
        if ns.lang == "zh":
            print(f"dislop verify ({label}): {'通过 (PASSED)' if result['ok'] else '未通过 (FAILED)'}")
            print(f"  事实账本  : {fl['status']}（保留 {fl['retainedCount']}/{fl['totalProtected']}，丢失 {len(fl['missing'])}，限定词降级 {len(fl['qualifierDropped'])}）")
            if result["keepTerms"]["requested"]:
                miss = f"（缺失：{', '.join(result['keepTerms']['missing'])}）" if result["keepTerms"]["missing"] else ""
                print(f"  关键词保留: 保留 {len(result['keepTerms']['kept'])}/{len(result['keepTerms']['requested'])}{miss}")
            if result.get("findingsDelta"):
                fd = result["findingsDelta"]
                print(f"  AI味变化  : {fd['beforeCount']} -> {fd['afterCount']}（消解 {fd['resolvedCount']}，新引入 {len(fd['introduced'])}）")
            print(f"  篇幅比例  : {lc['beforeChars']} -> {lc['afterChars']} 字（{lc['ratio']}x · {lc['status']}）")
            print(f"  反退化校验: {ad['status']}")
            for w in ad["warnings"]:
                print(f"    - [{w['severity'].upper()}] {w['code']}: {w['message']['zh']}")
        else:
            print(f"dislop verify ({label}): {result['status'].upper()}")
            print(f"  Fact ledger   : {fl['status']} ({fl['retainedCount']}/{fl['totalProtected']} retained, {len(fl['missing'])} missing, {len(fl['qualifierDropped'])} qualifier dropped)")
            if result["keepTerms"]["requested"]:
                miss = f" (missing: {', '.join(result['keepTerms']['missing'])})" if result["keepTerms"]["missing"] else ""
                print(f"  Keep terms    : {len(result['keepTerms']['kept'])}/{len(result['keepTerms']['requested'])} kept{miss}")
            if result.get("findingsDelta"):
                fd = result["findingsDelta"]
                print(f"  Findings delta: {fd['beforeCount']} -> {fd['afterCount']} ({fd['resolvedCount']} resolved, {len(fd['introduced'])} introduced)")
            print(f"  Length ratio  : {lc['beforeChars']} -> {lc['afterChars']} chars ({lc['ratio']}x · {lc['status']})")
            print(f"  Anti-degrade  : {ad['status']}")
            for w in ad["warnings"]:
                print(f"    - [{w['severity'].upper()}] {w['code']}: {w['message']['en']}")
    return 0 if result["ok"] else 1


_REVIEW_RESLOP_ZH_RE = re.compile(r"(?:全闭环|闭环|严禁|杜绝|赋能|抓手|家人们|绝绝子|其实吧|咱就是说|不是[^。\n]{1,30}而是)")
_REVIEW_RESLOP_EN_RE = re.compile(r"\b(?:not\s+just\b[^.\n]{1,35}\bbut\b|game[- ]changing|seamless|delve\s+into|tapestry|let\s+that\s+sink\s+in)\b", re.I | re.ASCII)
_VALID_TIC_LAYERS = {"lexical", "syntactic", "rhythm", "cognitive-framing", "rhetorical-stance", "visual", "artifact"}


def _load_ai_tic_rubric() -> dict[str, Any]:
    p = find_patterns_dir() / "ai-tic-rubric.json"
    try:
        if p.is_file():
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {"layers": [], "antiDegradationPrinciples": {"en": [], "zh": []}}


def _map_finding_to_tic_layer(finding: dict[str, Any]) -> str:
    rid = str(finding.get("ruleId") or "")
    dim = str(finding.get("dimension") or "")
    fam = str(finding.get("family") or "")
    if rid.startswith("core/") or fam.startswith("hygiene/") or fam.startswith("office/") or dim == "artifacts":
        return "artifact"
    if rid.startswith("ui-") or rid.startswith("pptx-") or fam.startswith("deck/") or fam.startswith("ui/") or dim == "visual-and-deck":
        return "visual"
    if (
        dim == "rhythm"
        or fam.startswith("rhythm/")
        or fam.startswith("punctuation/")
        or rid in {
            "low-burstiness-vapor",
            "comma-chain-runon",
            "opener-anaphora-monotony",
            "inline-bold-saturation",
            "paragraph-length-uniformity",
            "semicolon-tricolon",
            "em-dash-cluster",
            "en-dash-overuse",
            "bold-lead-list-wall",
        }
    ):
        return "rhythm"
    if (
        dim == "syntactic"
        or fam.startswith("frame/")
        or rid in {
            "negation-pivot",
            "staccato-slogan-run",
            "zh-four-char-triad",
            "concession-symmetry-frame",
            "rhetorical-qa-cadence",
            "pull-quote-closer",
            "template-skeleton-echo",
        }
    ):
        return "syntactic"
    if (
        rid in {
            "macro-trend-opener",
            "moralizing-ending",
            "narrative-sandwich",
            "unsourced-attribution",
            "unsubstantiated-superlative",
            "composite-multi-signal",
        }
        or fam.startswith("evidence/")
    ):
        return "cognitive-framing"
    if rid in {"throat-clearing-opener", "sycophancy-residue", "hedge-cluster", "discourse-marker-cluster"} or dim == "discourse":
        return "rhetorical-stance"
    return "lexical"


def _build_cross_check_summary(
    *,
    rule_findings: list[dict[str, Any]],
    pattern_findings: list[dict[str, Any]],
    profile: dict[str, Any] | None,
    ml_findings: list[dict[str, Any]],
    merged_findings: list[dict[str, Any]],
    modality: str,
) -> dict[str, Any]:
    signals_present: list[str] = []
    if rule_findings:
        signals_present.append("rules")
    if pattern_findings:
        signals_present.append("patterns")
    if profile and ((profile.get("telemetryRisk", {}).get("score") or 0) >= 15 or profile.get("structure", {}).get("lowBurstinessVapor")):
        signals_present.append("profile")
    if ml_findings:
        signals_present.append("pocket-ml")

    layer_counts: dict[str, int] = {}
    for f in merged_findings:
        layer = _map_finding_to_tic_layer(f)
        layer_counts[layer] = layer_counts.get(layer, 0) + 1

    has_subtle_prose = bool(modality in {"markdown", "text", "html", "svg"} and profile and (profile.get("sentenceCount") or 0) >= 3)
    suspected_subtle_layers = ["cognitive-framing", "rhetorical-stance"] if has_subtle_prose and (signals_present or not rule_findings) else []
    llm_recommended = bool(
        has_subtle_prose and (((profile.get("telemetryRisk", {}).get("score") or 0) >= 15) or ml_findings or not rule_findings)
    )
    return {
        "signalsPresent": signals_present,
        "multiSignalConfirmed": len(signals_present) >= 2,
        "layerCounts": layer_counts,
        "suspectedSubtleLayers": suspected_subtle_layers,
        "llmRecommended": llm_recommended,
    }


def _findings_to_review_issues(findings: list[dict[str, Any]], lang: str = "en") -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for f in findings:
        strategy = f.get("fixStrategy") or derive_fix_strategy({"id": f["ruleId"], "family": f.get("family")})
        action = "edit" if strategy == "delete" else ("ask" if strategy == "need-source" else "rewrite")
        msg_obj = f.get("message") or {}
        dt_obj = f.get("deletionTest") or {}
        why = str(msg_obj.get(lang) or msg_obj.get("en") or f["ruleId"]).strip()
        guidance = str(dt_obj.get(lang) or dt_obj.get("en") or why).strip()
        item: dict[str, Any] = {
            "source": f.get("source") or "rule",
            "ruleId": f["ruleId"],
            "ticLayer": _map_finding_to_tic_layer(f),
            "severity": f["severity"],
            "fixStrategy": strategy,
            "action": action,
            "line": f.get("line") or 1,
            "col": f.get("col") or 1,
            "quote": f.get("match") or "",
            "why": why,
        }
        if action == "edit":
            item["replacement"] = ""
        elif action == "ask":
            item["question"] = guidance
        else:
            item["instruction"] = guidance
        out.append(item)
    return out


def _ground_byok_llm_issues(raw_issues: Any, source_text: str, line_starts: list[int]) -> list[dict[str, Any]]:
    if not isinstance(raw_issues, list):
        return []
    src = str(source_text or "")
    out: list[dict[str, Any]] = []
    for iss in raw_issues:
        if not isinstance(iss, dict):
            continue
        q = str(iss.get("quote") or "").strip()
        if not q:
            continue
        idx = src.find(q)
        if idx == -1:
            continue
        raw_act = str(iss.get("action") or "rewrite")
        action = raw_act if raw_act in {"edit", "replace", "delete", "rewrite", "ask"} else "rewrite"
        if action in {"replace", "delete"}:
            action = "edit"
        rep = str(iss.get("replacement") if iss.get("replacement") is not None else "") if action == "edit" else ""
        if action == "edit" or iss.get("replacement"):
            rep_txt = str(iss.get("replacement") or "")
            q_lower = q.lower()
            if any(m.group(0) not in q for m in _REVIEW_RESLOP_ZH_RE.finditer(rep_txt)):
                continue
            if any(m.group(0).lower() not in q_lower for m in _REVIEW_RESLOP_EN_RE.finditer(rep_txt)):
                continue
        final_inst = str(iss.get("instruction") or iss.get("why") or "").strip()
        if action == "edit":
            vr = verify_revision(q, rep)
            if vr["status"] != "preserved":
                action = "rewrite"
                if not final_inst:
                    final_inst = str(iss.get("why") or "Keep all numbers and qualifiers intact while removing filler.")
        line_no, col_no = offset_to_line_col(line_starts, idx) if line_starts else (1, 1)
        sev = iss.get("severity") if iss.get("severity") in {"error", "warning", "info"} else "warning"
        item: dict[str, Any] = {
            "source": "byok-llm",
            "ruleId": None,
            **({"ticLayer": iss["ticLayer"]} if iss.get("ticLayer") in _VALID_TIC_LAYERS else {}),
            "severity": sev,
            "fixStrategy": ("delete" if rep == "" else "rephrase") if action == "edit" else ("need-source" if action == "ask" else "rephrase"),
            "action": action,
            "line": line_no,
            "col": col_no,
            "quote": q,
            "why": str(iss.get("why") or "").strip(),
        }
        if action == "edit":
            item["replacement"] = rep
        elif action == "ask":
            item["question"] = str(iss.get("question") or final_inst).strip()
        else:
            item["instruction"] = final_inst
        out.append(item)
        if len(out) >= 16:
            break
    return out


def _build_rubric_prompt_digest(rubric: dict[str, Any], lang: str = "en") -> str:
    key = "zh" if lang == "zh" else "en"
    layers = rubric.get("layers") if isinstance(rubric.get("layers"), list) else []
    lines: list[str] = []
    for layer in layers:
        name = (layer.get("name") or {}).get(key) or layer.get("id") or ""
        prompt = (layer.get("llmCheckPrompt") or {}).get(key) or ""
        guards = ((layer.get("falsePositiveGuards") or {}).get(key) or [])[:1]
        g_txt = f" (Guard: {'; '.join(guards)})" if guards else ""
        lines.append(f"- [{layer.get('id')}] {name}: {prompt}{g_txt}")
    return "\n".join(lines)


_REVIEW_MAX_ZIP_ENTRIES = 3000
_REVIEW_MAX_ZIP_BYTES = 120 * 1024 * 1024


def _read_ooxml_zip_entries_bounded(zip_path: Path) -> dict[str, str]:
    import zipfile
    entries: dict[str, str] = {}
    total_actual = 0
    with zipfile.ZipFile(zip_path, "r") as zf:
        infos = zf.infolist()
        if len(infos) > _REVIEW_MAX_ZIP_ENTRIES:
            raise ReviewConfigError(
                f"Archive exceeds maximum XML entry cap ({len(infos)} > {_REVIEW_MAX_ZIP_ENTRIES})"
            )
        declared_sum = sum(max(0, info.file_size) for info in infos)
        if declared_sum > _REVIEW_MAX_ZIP_BYTES:
            raise ReviewConfigError(
                f"Archive exceeds maximum uncompressed cap ({declared_sum} bytes > {_REVIEW_MAX_ZIP_BYTES})"
            )
        for info in infos:
            if info.filename.endswith((".xml", ".rels")):
                raw_bytes = zf.read(info.filename)
                total_actual += len(raw_bytes)
                if total_actual > _REVIEW_MAX_ZIP_BYTES:
                    raise ReviewConfigError(
                        f"Archive exceeds maximum uncompressed cap ({total_actual} bytes > {_REVIEW_MAX_ZIP_BYTES})"
                    )
                entries[info.filename] = raw_bytes.decode("utf-8", errors="replace")
    return entries


def _cmd_rubric_review(ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    cwd = Path.cwd()
    fmt = "json" if ns.json else ns.format
    try:
        config = load_config(cwd, ns.config)
    except ValueError as exc:
        print(f"dislop: {exc}", file=sys.stderr)
        return 2
    voice_info = discover_voice_card(cwd)
    rubric = _load_ai_tic_rubric()
    target = ns.target or "-"

    if target == "-":
        try:
            text = _read_stdin_text_checked("review")
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        label = _detect_stdin_filename(text, ns.stdin_filename)
    else:
        abs_t = (cwd / target).resolve()
        if not abs_t.is_file():
            print(f"dislop: file not found: {target}", file=sys.stderr)
            return 2
        label = target
        text = _read_utf8_exact(abs_t)

    mod = detect_modality(label) or "markdown"
    file_cfg = resolve_config_for_file(label, config)
    flag_register: str | None = None
    if getattr(ns, "register", None) is not None:
        norm = str(ns.register).strip().lower()
        if not norm or (norm != "auto" and norm not in VALID_REGISTERS):
            joined = ", ".join(VALID_REGISTERS)
            print(f"dislop: invalid --register '{ns.register}' (expected auto, {joined})", file=sys.stderr)
            return 2
        flag_register = norm
    reg_info = resolve_register(text, filename=label, flag_register=flag_register, config=file_cfg)
    pack, eff_pack, pack_source = _resolve_text_pack_and_source(text, label, mod, ns.pack or "auto", file_cfg, packs)
    strategy = get_scenario_strategy(pack_id=eff_pack, register=reg_info["register"])
    audit_res = audit_text(text, filename=label, modality=mod, pack=pack, config=file_cfg, register=reg_info["register"])
    rule_findings = list(audit_res["findings"])
    pat_res = audit_patterns(text, filename=label, modality=mod, banks=load_pattern_banks(), config=file_cfg)
    pattern_findings = list(pat_res["findings"])
    findings = _merge_pattern_bank_findings(rule_findings, pattern_findings)
    profile = analyze_text_profile(text, modality=mod, config=file_cfg) if mod in PROSE_ML_MODALITIES else None
    ml_findings: list[dict[str, Any]] = []
    if mod in PROSE_ML_MODALITIES:
        ml_src = build_zones(text, mod, {"proseFences": file_cfg.get("proseFences"), "maskBlockquotes": file_cfg.get("maskBlockquotes")})["prose"] if mod in {"html", "svg"} else text
        _, ml_findings = _build_pocket_ml_findings(ml_src, label, findings, profile=profile, modality=mod)
        findings.extend(ml_findings)
    cross_check = _build_cross_check_summary(
        rule_findings=rule_findings,
        pattern_findings=pattern_findings,
        profile=profile,
        ml_findings=ml_findings,
        merged_findings=findings,
        modality=mod,
    )

    det_issues = _findings_to_review_issues(findings, ns.lang)
    issues = list(det_issues)
    mode = "offline-deterministic"
    sig_str = "+".join(cross_check["signalsPresent"]) or "rules"
    summary = (
        ("未发现确定性 AI 味或硬伤问题。" if ns.lang == "zh" else "No deterministic AI-slop issues detected.")
        if not issues
        else (
            f"发现 {len(issues)} 处多信号审校建议（覆盖 {sig_str}，改后可用 dislop verify 校验）。"
            if ns.lang == "zh"
            else f"Found {len(issues)} multi-signal review item(s) across {sig_str}."
        )
    )

    endpoint = "" if ns.offline else str(ns.endpoint or os.environ.get("DISLOP_REVIEW_ENDPOINT") or os.environ.get("OPENAI_BASE_URL") or "").strip()
    key_env_name = (
        str(ns.api_key_env)
        if ns.api_key_env
        else ("DISLOP_REVIEW_API_KEY" if os.environ.get("DISLOP_REVIEW_API_KEY") else ("OPENAI_API_KEY" if os.environ.get("OPENAI_API_KEY") else ""))
    )
    api_key = str(os.environ.get(key_env_name) or "") if key_env_name else ""

    if not ns.offline and endpoint and api_key:
        parsed_u = urllib.parse.urlparse(endpoint)
        if parsed_u.scheme not in {"http", "https"} or not parsed_u.hostname:
            print(f"dislop review: invalid endpoint URL '{endpoint}'", file=sys.stderr)
            return 2
        if os.environ.get("DISLOP_TEST_MODE") == "1" and parsed_u.hostname not in {"127.0.0.1", "localhost", "::1"}:
            print("dislop review: live BYOK requests are blocked when DISLOP_TEST_MODE=1", file=sys.stderr)
            return 2
        chat_url = endpoint if endpoint.endswith("/chat/completions") else f"{endpoint.rstrip('/')}/chat/completions"
        model_id = str(ns.model or os.environ.get("DISLOP_REVIEW_MODEL") or "gpt-4o-mini")
        strat_tag = "zh" if ns.lang == "zh" else "en"
        sys_prompt = (
            f"你是 dislop 审校助手，请结合五层 AI 口癖准则与当前写作场景（{strategy['label']['zh']}）交叉核对确定性预检与统计信号。本场景清理重点：{strategy['cut']['zh']}；必须保留：{strategy['protect']['zh']}；严禁改偏：{strategy['avoid']['zh']}。只输出 JSON：{{\"summary\":\"...\",\"issues\":[{{\"quote\":\"原文原样片段\",\"ticLayer\":\"lexical|syntactic|rhythm|cognitive-framing|rhetorical-stance|visual|artifact\",\"action\":\"edit|rewrite|ask\",\"severity\":\"error|warning|info\",\"why\":\"原因\",\"replacement\":\"仅edit填\",\"instruction\":\"仅rewrite填\",\"question\":\"仅ask填\"}}]}}。硬规则：1) 保留作者原有视角、自然句长起伏、个性化表达与带事实锚点的行业术语，禁止改写成死板说教、廉价“装人味”口水词（家人们/其实吧/绝绝子）或删减干货；2) quote 必须一字不差从原文复制；3) 禁止引入全闭环/闭环/赋能/抓手/不是A而是B等新套词；4) 绝不改丢数字或范围限定词（预计/仅在/除非/待确认）。"
            if ns.lang == "zh"
            else f"You are dislop's multi-layer AI-tic reviewer tuned for {strategy['label']['en']} ({strategy['id']}). Cut: {strategy['cut']['en']} Protect: {strategy['protect']['en']} Avoid: {strategy['avoid']['en']} Cross-check deterministic findings and telemetry against the 5-layer rubric. Output strict JSON only: {{\"summary\":\"...\",\"issues\":[{{\"quote\":\"exact verbatim substring\",\"ticLayer\":\"lexical|syntactic|rhythm|cognitive-framing|rhetorical-stance|visual|artifact\",\"action\":\"edit|rewrite|ask\",\"severity\":\"error|warning|info\",\"why\":\"reason\",\"replacement\":\"for edit\",\"instruction\":\"for rewrite\",\"question\":\"for ask\"}}]}}. Rules: 1) preserve author voice, perspective, rhythm contrast, vivid phrasing, grounded domain terms, and modality qualifiers; never suggest cheesy fake-human slang; 2) quote MUST match verbatim; 3) never introduce filler slogans; 4) keep every number and unit intact."
        )
        rubric_digest = _build_rubric_prompt_digest(rubric, ns.lang)
        user_parts = [
            f"Modality: {mod} | Pack: {eff_pack} | Register: {reg_info['register']} | Scenario: {strategy['id']}",
            f"Scenario Strategy ({strategy['label'][strat_tag]}): cut=[{strategy['cut'][strat_tag]}] protect=[{strategy['protect'][strat_tag]}] avoid=[{strategy['avoid'][strat_tag]}]",
        ]
        if rubric_digest:
            user_parts.append(f"5-Layer AI-Tic Rubric:\n{rubric_digest}")
        user_parts.append(f"Local Cross-Check Signals: {json.dumps(cross_check, ensure_ascii=False)}")
        if voice_info["found"] and isinstance((voice_info.get("card") or {}).get("profile"), dict):
            user_parts.append(f"Author style card ({voice_info['scope']}): {json.dumps(voice_info['card']['profile'], ensure_ascii=False)}")
        user_parts.append(
            "Deterministic findings: "
            + json.dumps([{"ruleId": d["ruleId"], "ticLayer": d.get("ticLayer"), "quote": d["quote"], "fixStrategy": d["fixStrategy"]} for d in det_issues[:12]], ensure_ascii=False)
        )
        user_parts.append(f"Draft:\n{text}")
        req_body = json.dumps({
            "model": model_id,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": "\n\n".join(user_parts)},
            ],
        }).encode("utf-8")
        try:
            req = urllib.request.Request(
                chat_url,
                data=req_body,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                if getattr(resp, "status", 200) >= 400:
                    raise RuntimeError(f"HTTP {resp.status}")
                data = json.loads(resp.read().decode("utf-8"))
            raw_content = str((((data.get("choices") or [{}])[0].get("message") or {}).get("content")) or "").strip()
            json_body = re.sub(r"^```(?:json)?\s*", "", raw_content, flags=re.I)
            json_body = re.sub(r"\s*```$", "", json_body).strip()
            parsed = json.loads(json_body)
            line_starts = build_line_starts(text)
            det_quotes = {d["quote"] for d in det_issues if d.get("quote")}
            llm_grounded = [x for x in _ground_byok_llm_issues(parsed.get("issues"), text, line_starts) if x["quote"] not in det_quotes]
            issues = [*det_issues, *llm_grounded]
            mode = "byok-llm"
            if isinstance(parsed.get("summary"), str) and parsed["summary"].strip():
                summary = parsed["summary"].strip()
        except Exception as exc:
            print(f"dislop review: endpoint call failed ({exc})", file=sys.stderr)
            return 2

    out: dict[str, Any] = {
        "schema": "dislop.review/1",
        "mode": mode,
        "file": label,
        "modality": mod,
        "effectivePack": eff_pack,
        "packSource": pack_source,
        "register": reg_info["register"],
        "scenarioStrategy": strategy["id"],
        "crossCheck": cross_check,
        "rubricLayers": [l.get("id") for l in (rubric.get("layers") or [])],
        "voiceCard": {"found": voice_info["found"], "scope": voice_info["scope"]},
    }
    if profile is not None:
        out["profile"] = profile
    out["summary"] = summary
    out["issues"] = issues

    if fmt == "json":
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0
    is_zh = ns.lang == "zh"
    strat_labels_zh = {"delete": "删掉", "need-source": "补出处", "unwrap-layout": "去套壳", "rephrase": "改写"}
    act_labels_zh = {"edit": "修改", "rewrite": "改写", "ask": "核实"}
    mode_label_zh = "本地+BYOK联合审校" if mode == "byok-llm" else "四路离线核对"
    vc_note = (f" · 个人文风:{voice_info['scope']}" if is_zh else f" · voice:{voice_info['scope']}") if voice_info["found"] else ""
    layer_str = ", ".join(f"{k}×{v}" for k, v in cross_check["layerCounts"].items()) or ("无明确命中" if is_zh else "none")
    sig_str_out = "+".join(cross_check["signalsPresent"]) or "rules"
    print(f"dislop review ({label} · {mode_label_zh if is_zh else mode} · {eff_pack}{vc_note})")
    print(f"  摘要    : {summary}" if is_zh else f"  summary : {summary}")
    print(f"  信号分布: {sig_str_out} | 层级: {layer_str}" if is_zh else f"  signals : {sig_str_out} | layers: {layer_str}")
    for iss in issues:
        tag = strat_labels_zh.get(iss["fixStrategy"], iss["fixStrategy"]) if is_zh else iss["fixStrategy"]
        act = act_labels_zh.get(iss["action"], iss["action"]) if is_zh else iss["action"]
        layer_tag = f" · {iss['ticLayer']}" if iss.get("ticLayer") else ""
        print(f'  [{str(iss["severity"]).upper()}] {iss["line"]}:{iss["col"]} {act} ({tag}{layer_tag}) "{iss["quote"]}"')
        print(f"    原因: {iss['why']}" if is_zh else f"    why: {iss['why']}")
        if iss["action"] == "edit":
            print(f"    替换: {json.dumps(iss['replacement'], ensure_ascii=False)}" if is_zh else f"    rep: {json.dumps(iss['replacement'], ensure_ascii=False)}")
        elif iss["action"] == "ask":
            print(f"    追问: {iss['question']}" if is_zh else f"    ask: {iss['question']}")
        elif iss.get("instruction") and iss["instruction"] != iss["why"]:
            print(f"    改法: {iss['instruction']}" if is_zh else f"    how: {iss['instruction']}")
    if mode == "offline-deterministic" and cross_check.get("llmRecommended"):
        print(
            "  深查提示: 思维“端水”(cognitive-framing)与说教角度(rhetorical-stance)可配 --endpoint 或云端 dislop_review 联合复核。"
            if is_zh
            else "  tip: Pass --endpoint (or use Cloud dislop_review) for LLM semantic cross-check on cognitive-framing and rhetorical-stance."
        )
    return 0


def _cmd_provider_review(ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    cwd = Path.cwd()
    try:
        config = load_config(cwd, ns.config)
    except ValueError as exc:
        print(f"dislop: {exc}", file=sys.stderr)
        return 2

    lang = ns.lang
    fmt = "json" if ns.json else ns.format
    fail_on = ns.fail_on or "warning"
    if fail_on not in SEVERITY_RANK:
        print(
            f"dislop review: invalid --fail-on '{fail_on}' (expected error, warning, info, or never)",
            file=sys.stderr,
        )
        return 2
    if ns.timeout < 1000 or ns.timeout > 120000:
        print("dislop review: --timeout must be between 1000 and 120000 ms", file=sys.stderr)
        return 2
    max_chunks = getattr(ns, "max_chunks", 20)
    if max_chunks < 1 or max_chunks > 100:
        print("dislop review: --max-chunks must be between 1 and 100", file=sys.stderr)
        return 2

    target = ns.target or "-"
    raw_text = ""
    filename = "stdin.md"
    modality = "markdown"
    if target == "-":
        try:
            raw_text = _read_stdin_text_checked("review")
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        filename = _detect_stdin_filename(raw_text, ns.stdin_filename)
        modality = detect_modality(filename) or "markdown"
        if ns.stdin_filename and modality in {"docx", "pptx", "pdf"}:
            print(
                f"dislop review: '--stdin-filename' cannot treat stdin as binary '{modality}'; pass the file path directly.",
                file=sys.stderr,
            )
            return 2
    else:
        abs_p = (cwd / target).resolve()
        if not abs_p.is_file():
            print(f"dislop review: file not found: {target}", file=sys.stderr)
            return 2
        try:
            filename = abs_p.relative_to(cwd.resolve()).as_posix()
        except ValueError:
            filename = abs_p.name
        mod = detect_modality(abs_p.name)
        if not mod:
            print(f"dislop review: unsupported file type '{abs_p.suffix or '(none)'}'", file=sys.stderr)
            return 2
        modality = mod
        if modality in {"docx", "pptx"}:
            try:
                entries = _read_ooxml_zip_entries_bounded(abs_p)
                raw_text = extract_ooxml_review_text(
                    entries,
                    modality,
                    include_notes=bool(ns.include_notes),
                    include_hidden=bool(ns.include_hidden),
                )
            except Exception as exc:
                print(f"dislop review: {exc}", file=sys.stderr)
                return 2
        else:
            try:
                raw_text = abs_p.read_bytes().decode("utf-8")
            except UnicodeDecodeError:
                print(f"dislop review: '{target}' is not valid UTF-8 text", file=sys.stderr)
                return 2

    filename = re.sub(r"[\r\n]+", " ", str(filename)).strip() or "draft.md"

    if not raw_text.strip():
        print("dislop review: extracted draft text is empty", file=sys.stderr)
        return 2

    flag_register = str(ns.register).strip().lower() if ns.register is not None else None
    try:
        reg_info = resolve_register(raw_text, filename=filename, flag_register=flag_register, config=config)
    except Exception as exc:
        print(f"dislop review: {exc}", file=sys.stderr)
        return 2

    pack_flag = (
        predict_pack_with_pocket_router(raw_text)["recommendedPack"]
        if ns.pack == "auto" and modality in {"markdown", "text"}
        else (None if ns.pack == "auto" else ns.pack)
    )
    pack_id = pick_pack_for_file(filename, modality, pack_flag, config)
    if pack_id not in packs:
        print(f"dislop review: unknown pack '{pack_id}'", file=sys.stderr)
        return 2

    is_dry_run = bool(ns.dry_run)
    is_print_prompt = bool(ns.print_prompt)
    try:
        prov = resolve_provider_config(
            provider=ns.provider or os.environ.get("DISLOP_REVIEW_PROVIDER") or "openai",
            model=ns.model,
            base_url=ns.base_url,
            allow_missing_key=(is_dry_run or is_print_prompt),
            env=os.environ,
        )
    except ReviewConfigError as exc:
        print(f"dislop review: {exc}", file=sys.stderr)
        return 2

    try:
        chunks = chunk_text_by_paragraphs(raw_text, 10000, max_chunks=max_chunks)
    except ReviewConfigError as exc:
        print(f"dislop review: {exc}", file=sys.stderr)
        return 2

    first_prompt = build_review_prompt(
        chunk_text=chunks[0]["text"],
        filename=filename,
        modality=modality,
        pack_id=pack_id,
        register=reg_info["register"],
        lang=lang,
    )
    total_bytes = len(raw_text.encode("utf-8"))
    consent_mode = (
        "local-loopback"
        if prov["isLocal"]
        else ("--yes" if ns.yes else ("DISLOP_ALLOW_REMOTE=1" if os.environ.get("DISLOP_ALLOW_REMOTE") == "1" else "required"))
    )

    if is_print_prompt:
        if fmt == "json":
            print(
                json.dumps(
                    {
                        "schema": "dislop.review-prompt/1",
                        "provider": prov["provider"],
                        "host": prov["host"],
                        "model": prov["model"],
                        "chunks": len(chunks),
                        "bytes": total_bytes,
                        "delimiter": first_prompt["delimiter"],
                        "systemPrompt": first_prompt["systemPrompt"],
                        "userPrompt": first_prompt["userPrompt"],
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
        else:
            print(
                f"=== SYSTEM PROMPT ===\n{first_prompt['systemPrompt']}\n\n"
                f"=== USER PROMPT (chunk 1/{len(chunks)}) ===\n{first_prompt['userPrompt']}"
            )
        return 0

    if is_dry_run:
        dry_payload = {
            "schema": "dislop.review-dry-run/1",
            "provider": prov["provider"],
            "host": prov["host"],
            "endpointUrl": prov["safeUrl"],
            "model": prov["model"],
            "consent": consent_mode,
            "keyPresent": bool(prov["apiKey"]),
            "keySource": prov["keySource"],
            "headers": {
                "content-type": "application/json",
                **({"authorization": "Bearer <REDACTED>"} if prov["apiKey"] else {}),
            },
            "file": filename,
            "modality": modality,
            "pack": pack_id,
            "context": reg_info,
            "chunks": len(chunks),
            "bytes": total_bytes,
            "requestBody": {
                "model": prov["model"],
                "temperature": 0,
                "messages": [
                    {"role": "system", "content": first_prompt["systemPrompt"]},
                    {"role": "user", "content": first_prompt["userPrompt"]},
                ],
            },
        }
        if fmt == "json":
            print(json.dumps(dry_payload, ensure_ascii=False, indent=2))
        elif lang == "zh":
            auth_desc = f"环境变量 {prov['keySource']}（已脱敏）" if prov["apiKey"] else "未设置 / 本地免密钥"
            print("dislop review 演练（0 次网络请求）")
            print(f"  目标接口 : {prov['safeUrl']} (provider={prov['provider']}, model={prov['model']}, consent={consent_mode})")
            print(f"  鉴权来源 : {auth_desc}")
            print(f"  待审文稿 : {filename}（{total_bytes} 字节，{len(chunks)} 段，语域={reg_info['register']}）")
            print(f"  分隔标记 : {first_prompt['delimiter']}")
        else:
            auth_desc = f"env {prov['keySource']} (redacted)" if prov["apiKey"] else "none/unset"
            print("dislop review dry-run: 0 network calls made")
            print(f"  destination : {prov['safeUrl']} (provider={prov['provider']}, model={prov['model']}, consent={consent_mode})")
            print(f"  auth        : {auth_desc}")
            print(f"  draft       : {filename} ({total_bytes} bytes, {len(chunks)} chunk(s), register={reg_info['register']})")
            print(f"  delimiter   : {first_prompt['delimiter']}")
        return 0

    forbid_list = config.get("forbid") if isinstance(config, dict) else None
    if not prov["isLocal"] and isinstance(forbid_list, list) and len(forbid_list) > 0:
        hit_locs: list[str] = []
        for pat in forbid_list:
            try:
                cre = re.compile(pat, re.I | re.M | re.U)
            except re.error as exc:
                print(f"dislop review: invalid .dislop.local.json forbid regex: {exc}", file=sys.stderr)
                return 2
            if cre.search(filename):
                hit_locs.append("filename")
            for fm in cre.finditer(raw_text):
                line_num = raw_text[: fm.start()].count("\n") + 1
                hit_locs.append(str(line_num))
                if len(hit_locs) >= 20:
                    break
        if hit_locs:
            uniq = ", ".join(list(dict.fromkeys(hit_locs))[:5])
            print(
                f"dislop review: refusing remote upload — matched {len(hit_locs)} local '.dislop.local.json' forbid policy hit(s) ({uniq}).",
                file=sys.stderr,
            )
            return 2

    if prov["isLocal"]:
        try:
            assert_loopback_endpoint(prov["hostname"])
        except ReviewConfigError as exc:
            print(
                f"dislop review: {scrub_secrets(str(exc), [prov['apiKey']] if prov.get('apiKey') else [])}",
                file=sys.stderr,
            )
            return 2
    elif not ns.yes and os.environ.get("DISLOP_ALLOW_REMOTE") != "1":
        print(
            "dislop review: refusing remote upload without explicit confirmation (--yes or DISLOP_ALLOW_REMOTE=1).\n"
            f"  target: host={prov['host']} provider={prov['provider']} model={prov['model']} file={filename} bytes={total_bytes} chunks={len(chunks)}",
            file=sys.stderr,
        )
        return 2

    print(
        f"dislop review: sending to host={prov['host']} provider={prov['provider']} model={prov['model']} file={filename} bytes={total_bytes} chunks={len(chunks)} register={reg_info['register']}",
        file=sys.stderr,
    )

    all_findings: list[dict[str, Any]] = []
    seen_fps: set[str] = set()
    rejected = {"ungroundedQuote": 0, "inventedFact": 0, "malformed": 0}
    summaries: list[str] = []
    levels: list[str] = []
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    has_usage = False
    redact_list = [prov["apiKey"]] if prov["apiKey"] else []

    for ch in chunks:
        prompt = (
            first_prompt
            if ch["index"] == 0
            else build_review_prompt(
                chunk_text=ch["text"],
                filename=filename,
                modality=modality,
                pack_id=pack_id,
                register=reg_info["register"],
                lang=lang,
            )
        )
        try:
            api_res = run_review_request(
                endpoint_url=prov["endpointUrl"],
                is_local=prov["isLocal"],
                hostname=prov["hostname"],
                model=prov["model"],
                api_key=prov["apiKey"],
                system_prompt=prompt["systemPrompt"],
                user_prompt=prompt["userPrompt"],
                timeout_ms=ns.timeout,
            )
            usage = api_res.get("usage")
            if isinstance(usage, dict):
                try:
                    _max_tok = 1_000_000_000

                    def _safe_tok_int(val: Any) -> int:
                        if isinstance(val, bool) or val is None:
                            return 0
                        if isinstance(val, int):
                            return val if 0 <= val <= _max_tok else 0
                        if isinstance(val, float):
                            return int(val) if math.isfinite(val) and 0 <= val <= _max_tok and val.is_integer() else 0
                        if isinstance(val, str):
                            s = val.strip()
                            if len(s) <= 10 and s.isascii() and s.isdigit():
                                iv = int(s)
                                return iv if iv <= _max_tok else 0
                        return 0

                    pt = _safe_tok_int(usage.get("prompt_tokens"))
                    ct = _safe_tok_int(usage.get("completion_tokens"))
                    tt = _safe_tok_int(usage.get("total_tokens"))
                    has_usage = True
                    prompt_tokens += pt
                    completion_tokens += ct
                    total_tokens += tt
                except Exception:
                    pass
            norm = validate_and_normalize_review_response(
                raw_content=api_res["content"],
                chunk_text=ch["text"],
                full_text=raw_text,
                chunk_start_offset=ch["startOffset"],
                filename=filename,
                modality=modality,
                lang=lang,
                redact_secrets=redact_list,
            )
            for f in norm["findings"]:
                fp = f["fingerprint"]
                if fp not in seen_fps:
                    seen_fps.add(fp)
                    all_findings.append(f)
            rejected["ungroundedQuote"] += norm["rejected"]["ungroundedQuote"]
            rejected["inventedFact"] += norm["rejected"]["inventedFact"]
            rejected["malformed"] += norm["rejected"]["malformed"]
            if norm["summary"]:
                summaries.append(norm["summary"])
            levels.append(norm["aiFlavorLevel"])
        except Exception as exc:
            safe_err = scrub_secrets(str(exc), redact_list)
            print(f"dislop review: chunk {ch['index'] + 1}/{len(chunks)} failed — {safe_err}", file=sys.stderr)
            return 2

    overall_level = "high" if "high" in levels else ("medium" if "medium" in levels else "low")
    level_label = {"high": "高", "medium": "中", "low": "低"}.get(overall_level, overall_level) if lang == "zh" else overall_level
    summary_text = " ".join(summaries).strip()
    usage_summary = (
        {"promptTokens": prompt_tokens, "completionTokens": completion_tokens, "totalTokens": total_tokens}
        if has_usage
        else None
    )
    report = {
        "schema": "dislop.review/1",
        "version": ENGINE_VERSION,
        "provider": prov["provider"],
        "host": prov["host"],
        "model": prov["model"],
        "file": filename,
        "pack": pack_id,
        "lang": lang,
        "chunks": len(chunks),
        "bytes": total_bytes,
        "aiFlavorLevel": overall_level,
        "summary": summary_text,
        "context": {"register": reg_info["register"], "registerSource": reg_info["registerSource"]},
        "checkedCount": 1,
        "skipped": [],
        "findings": all_findings,
        "unusedSuppressions": [],
        "rejected": rejected,
        "usage": usage_summary,
    }
    if fmt == "json":
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(format_report(report, fmt, lang, fail_on=fail_on))
        if fmt == "text" and summary_text:
            print(
                f"  [综述 · {level_label}] {summary_text}"
                if lang == "zh"
                else f"  [summary · {overall_level}] {summary_text}"
            )
        rej_total = rejected["ungroundedQuote"] + rejected["inventedFact"] + rejected["malformed"]
        if fmt == "text" and rej_total > 0:
            if lang == "zh":
                print(
                    f"  [校验过滤] 已丢弃 {rej_total} 条未通过核验的建议（无原文引用={rejected['ungroundedQuote']}，编造事实={rejected['inventedFact']}，格式异常={rejected['malformed']}）"
                )
            else:
                print(
                    f"  [guard] filtered {rej_total} unverified suggestion(s) (ungrounded={rejected['ungroundedQuote']}, inventedFact={rejected['inventedFact']}, malformed={rejected['malformed']})"
                )
    triggered = any(SEVERITY_RANK.get(f["severity"], 1) >= SEVERITY_RANK[fail_on] for f in all_findings)
    return 1 if triggered else 0


def _cmd_review(ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    if getattr(ns, "offline", False) or getattr(ns, "endpoint", None) or getattr(ns, "api_key_env", None):
        return _cmd_rubric_review(ns, packs)
    return _cmd_provider_review(ns, packs)


def _cmd_doctor(ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    cwd = Path.cwd()
    lang = ns.lang
    fmt = "json" if ns.json else ns.format
    rules_count = sum(len(p.get("rules", [])) for p in packs.values())
    base_status = build_model_status_report(
        packs_count=len(packs),
        rules_count=rules_count,
        probe_loopback=not ns.no_loopback,
        cache_dir=ns.cache_dir,
    )

    skill_rel = "skills/dislop/SKILL.md"
    pkg_root = Path(__file__).resolve().parent
    repo_root = pkg_root.parent.parent
    workspace_ready = (cwd / skill_rel).is_file()
    bundled_ready = (pkg_root / skill_rel).is_file() or (repo_root / skill_rel).is_file()
    skill_ready = workspace_ready or bundled_ready
    byok_env = inspect_byok_env_status(os.environ)
    cfg_found = any(
        (cwd / name).is_file() for name in (".dislop.json", "dislop.json", ".disloprc.json", ".dislop.local.json")
    )
    cfg_valid = True
    cfg_error: str | None = None
    try:
        load_config(cwd, None)
    except Exception as exc:
        cfg_valid = False
        cfg_error = scrub_secrets(str(exc))

    gitignore_local: bool | None = None
    try:
        g = subprocess.run(
            ["git", "check-ignore", "-q", ".dislop.local.json"],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=2,
        )
        if g.returncode == 0:
            gitignore_local = True
        elif g.returncode == 1:
            gitignore_local = False
    except Exception:
        pass

    ping = (
        ping_endpoint_health("https://dislop.com/api/health")
        if ns.online
        else {"checked": False, "ok": None, "status": None, "error": None}
    )

    report = {
        **base_status,
        "schema": "dislop.doctor/1",
        "layers": {
            "skill": {
                "ready": skill_ready,
                "workspaceReady": workspace_ready,
                "bundledReady": bundled_ready,
                "path": skill_rel,
            },
            "localCli": {
                "ready": True,
                "version": ENGINE_VERSION,
                "packs": len(packs),
                "rules": rules_count,
                "pocketMlReady": True,
                "localRunnersCount": len(base_status["localRunners"]),
            },
            "byokReview": byok_env,
            "officialCloudMcp": {
                "url": "https://dislop.com/mcp",
                "freeCreditsPerMonth": 30,
                "ping": ping,
            },
            "config": {
                "found": cfg_found,
                "valid": cfg_valid,
                "error": cfg_error,
                "gitignoreLocalConfig": gitignore_local,
            },
        },
    }

    if fmt == "json":
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if cfg_valid else 2

    configured_names = [f"{k}({v['keySource']})" for k, v in byok_env["providers"].items() if v["keyPresent"]]
    hw = report["hardware"]
    rec = report["recommendation"]
    if lang == "zh":
        skill_label = "已就绪（当前工作区）" if workspace_ready else ("已就绪（安装包内置）" if bundled_ready else "未找到")
        print(f"dislop doctor v{ENGINE_VERSION}（三层体检 · 默认 0 联网）")
        print(f"  1. 纯文档 Skill   : {skill_label} ({skill_rel})")
        print(
            f"  2. 本地 CLI 引擎  : 已就绪（{len(packs)} 套规则包 / {rules_count} 条规则 · 14.6 KB Pocket ML · {len(base_status['localRunners'])} 个本地推理端）"
        )
        rec_tail = f" ({rec['modelId']})" if rec.get("modelId") else "（内置模型即可）"
        print(f"     硬件与选装推荐 : {hw['platform']}/{hw['arch']} · {hw['totalMemoryGb']} GB 内存 -> {rec['tier']}{rec_tail}")
        print(
            f"     BYOK 深度审校  : {'已配置 ' + '、'.join(configured_names) if configured_names else '未配置密钥环境变量（仅按需 --yes 启用）'}"
        )
        ping_msg = (
            (f"在线连通 HTTP {ping['status']}" if ping["ok"] else f"连通失败：{ping['error'] or 'HTTP ' + str(ping['status'])}")
            if ping["checked"]
            else (f"已拦截（{ping['error']}）" if ping.get("error") else "未联网检测，可加 --online")
        )
        print(f"  3. 官方云端 MCP   : https://dislop.com/mcp（免费额度 30 次/月 · {ping_msg}）")
        cfg_msg = "使用默认" if not cfg_found else ("有效" if cfg_valid else f"异常：{cfg_error}")
        gi_msg = "已忽略" if gitignore_local is True else ("未加入 .gitignore" if gitignore_local is False else "非 git 仓库")
        print(f"  配置与隐私边界    : 配置={cfg_msg} | .dislop.local.json 忽略={gi_msg}")
    else:
        skill_label = "ready (workspace)" if workspace_ready else ("ready (bundled)" if bundled_ready else "not found")
        print(f"dislop doctor v{ENGINE_VERSION} (3-layer readiness · offline by default)")
        print(f"  1. Pure-doc Skill : {skill_label} ({skill_rel})")
        print(
            f"  2. Local CLI/ML   : ready ({len(packs)} packs / {rules_count} rules · 14.6 KB Pocket ML · {len(base_status['localRunners'])} local runner(s))"
        )
        rec_tail = f" ({rec['modelId']})" if rec.get("modelId") else " (bundled only)"
        print(f"     Hardware fit   : {hw['platform']}/{hw['arch']} · {hw['totalMemoryGb']} GB RAM -> {rec['tier']}{rec_tail}")
        print(
            f"     BYOK review    : {'configured: ' + ', '.join(configured_names) if configured_names else 'no API key env set (explicit opt-in only)'}"
        )
        ping_msg = (
            (f"reachable HTTP {ping['status']}" if ping["ok"] else f"unreachable: {ping['error'] or 'HTTP ' + str(ping['status'])}")
            if ping["checked"]
            else (f"blocked ({ping['error']})" if ping.get("error") else "offline (pass --online to ping)")
        )
        print(f"  3. Cloud MCP      : https://dislop.com/mcp (30 free/mo · {ping_msg})")
        cfg_msg = "defaults" if not cfg_found else ("valid" if cfg_valid else f"invalid ({cfg_error})")
        gi_msg = "n/a" if gitignore_local is None else str(gitignore_local).lower()
        print(f"  Config & hygiene  : config={cfg_msg} | .dislop.local.json gitignored={gi_msg}")
    return 0 if cfg_valid else 2


def _print_grouped_help() -> None:
    print(f"""dislop v{ENGINE_VERSION} — Cutting AI slop is real productivity. Linter for AI Slop in docs, web UI, and slides

Usage: dislop <command> [options]

Check & fix (local, 0 network calls):
  check [paths... | -]      Audit files or stdin [--pack <id|auto>] [--register <id|auto>] [--deep] [-q|--quiet]
                            [--fail-on error|warning|info|never] [--format text|json|agent|sarif|github|md]
                            [--changed [ref] | --staged] [--rule <id,...>] [--lang en|zh]
  verify <before> <after>   Verify edits retain numbers/qualifiers & --keep terms [--git [ref] <file>] [--strict]
  explain <rule-id>         Show rationale, deletion test, and bad/trap/good examples
  init                      Create starter .dislop.json and gitignore .dislop.local.json

Browse rules & style:
  catalog [query]           Search the 53-rule AI-slop catalog (alias: search)
  packs                     List bundled rule packs and supported formats
  patterns [file | -]       Run multi-angle extended pattern-bank scan
  voice [paths... | -]      Extract offline dislop.voice/1 writing profile

Agent & review:
  review [file | -]         Multi-layer review (--offline | --endpoint <url> | --provider openai|gemini|local)
  --mcp                     Run local stdio MCP server (7 offline tools)
  resources                 Show bundled packs, static agent links, and Official Cloud MCP

Diagnostics & optional local models:
  doctor [--online]         Check 3-layer readiness (Skill, Local CLI/ML, BYOK env, config, and optional Cloud ping)
  model [action]            Manage/score Pocket ML & optional local models (status|score|install|import|remove|deslop)
  pack-test                 Validate Pack Schema v2 manifests and embedded fixtures

Exit codes: 0 clean | 1 findings >= --fail-on | 2 usage, config, or unreadable file error
Example:    dislop check draft.md --deep --lang zh""")


def _cmd_init() -> int:
    cwd = Path.cwd()
    cfg = cwd / ".dislop.json"
    if not cfg.exists():
        starter = {
            "failOn": "error",
            "ignore": ["vendor/**", "dist/**"],
            "overrides": [{"files": ["docs/**/*.md"], "pack": "business-brief"}],
            "allow": [],
            "rules": {},
        }
        cfg.write_text(json.dumps(starter, indent=2) + "\n", encoding="utf-8")
        print(f"Created {cfg}")
    else:
        print(f"{cfg} already exists")
    gi = cwd / ".gitignore"
    if gi.is_file():
        cur = gi.read_text(encoding="utf-8")
        if ".dislop.local.json" not in cur.splitlines():
            gi.write_text(cur.rstrip() + "\n.dislop.local.json\n", encoding="utf-8")
            print("Added .dislop.local.json to .gitignore")
    elif (cwd / ".git").exists():
        gi.write_text(".dislop.local.json\n", encoding="utf-8")
        print("Created .gitignore with .dislop.local.json")
    return 0


_CHECK_BOOL_FLAGS = {
    "json", "staged", "report-unused", "profile", "ml", "patterns", "deep", "compact", "quiet", "help", "version"
}
_CHECK_VALUE_FLAGS = {"pack", "register", "config", "fail-on", "format", "stdin-filename", "lang", "rule"}


def _preprocess_changed_args(args: list[str]) -> list[str]:
    if not args or args[0] != "check":
        return args
    opts: list[str] = ["check"]
    pos: list[str] = []
    cwd = Path.cwd()
    i = 1
    end_of_flags = False
    while i < len(args):
        tok = args[i]
        if end_of_flags:
            pos.append(tok)
            i += 1
            continue
        if tok == "--":
            end_of_flags = True
            pos.append(tok)
            i += 1
            continue
        if tok in {"-h", "--help"}:
            return ["check", "--help"]
        if tok == "--changed=":
            opts.append("--changed=HEAD")
            i += 1
            continue
        if tok == "--changed":
            if i + 1 < len(args):
                nxt = args[i + 1]
                if nxt == "-" or nxt.startswith("-") or (cwd / nxt).exists():
                    opts.append("--changed=HEAD")
                    i += 1
                    continue
                opts.append(f"--changed={nxt}")
                i += 2
                continue
            opts.append("--changed=HEAD")
            i += 1
            continue
        if tok.startswith("--") and "=" in tok:
            k, v = tok[2:].split("=", 1)
            if k in _CHECK_BOOL_FLAGS:
                low = v.strip().lower()
                if low in {"true", "1", "yes"}:
                    opts.append(f"--{k}")
                elif low in {"false", "0", "no"}:
                    pass
                else:
                    opts.append(tok)
                i += 1
                continue
        if tok.startswith("--") and tok[2:] in _CHECK_VALUE_FLAGS and "=" not in tok:
            if i + 1 < len(args) and not (len(args[i + 1]) > 1 and args[i + 1].startswith("-")):
                opts.extend([tok, args[i + 1]])
                i += 2
                continue
        if tok == "-" or not tok.startswith("-"):
            pos.append(tok)
        else:
            opts.append(tok)
        i += 1
    return opts + pos


def main(argv: list[str] | None = None) -> None:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--mcp" in args:
        run_mcp_stdio()
        return

    if not args or args[0] in {"-h", "--help"}:
        _print_grouped_help()
        return

    known_cmds = {
        "check", "verify", "review", "explain", "packs", "catalog", "search", "patterns",
        "voice", "model", "doctor", "setup", "deslop", "resources", "pack-test", "init",
    }
    if args[0] == "help":
        if len(args) == 1:
            _print_grouped_help()
            return
        if args[1] not in known_cmds:
            print(f"dislop: unknown command '{args[1]}'. Run 'dislop --help' for usage.", file=sys.stderr)
            sys.exit(2)
        args = [args[1], "--help"]

    parser = argparse.ArgumentParser(prog="dislop", description="Cutting AI slop is real productivity. Linter for AI Slop in docs, web UI, and slides", allow_abbrev=False)
    parser.add_argument("-v", "--version", action="version", version=ENGINE_VERSION)
    sub = parser.add_subparsers(dest="cmd")

    p_check = sub.add_parser("check", help="Audit files or directories", allow_abbrev=False)
    p_check.add_argument("paths", nargs="*")
    p_check.add_argument("--pack", default=None)
    p_check.add_argument("--register", default=None)
    p_check.add_argument("--config", default=None)
    p_check.add_argument("--fail-on", default=None)
    p_check.add_argument("--format", default="text", choices=["text", "json", "agent", "sarif", "github", "md"])
    p_check.add_argument("--json", action="store_true")
    p_check.add_argument("--changed", nargs="?", const="HEAD", default=None)
    p_check.add_argument("--staged", action="store_true")
    p_check.add_argument("--stdin-filename", default=None)
    p_check.add_argument("--report-unused", action="store_true")
    p_check.add_argument("--profile", action="store_true", help="Attach 5-axis offline statistical text rhythm + Pocket ML profile")
    p_check.add_argument("--deep", action="store_true", help="Run thorough inspection (Pocket ML + extended 6-dimension pattern bank)")
    p_check.add_argument("--compact", action="store_true", help="Deduplicate repeated rule metadata into ruleMeta in --json output")
    p_check.add_argument("--ml", action="store_true", help="Enable bundled Pocket ML stealth-vapor paragraph detection")
    p_check.add_argument("--patterns", action="store_true", help="Include extended 6-dimension pattern-bank probes")
    p_check.add_argument("-q", "--quiet", action="store_true", help="Show only findings >= --fail-on and suppress clean summary")
    p_check.add_argument("--rule", default=None, help="Filter findings to comma-separated rule IDs")
    p_check.add_argument("--lang", default="en", choices=["en", "zh"])

    p_verify = sub.add_parser("verify", help="Verify fact ledger, keep terms, and anti-degradation guardrails on a revision", allow_abbrev=False)
    p_verify.add_argument("targets", nargs="*")
    p_verify.add_argument("--git", nargs="?", const="HEAD", default=None)
    p_verify.add_argument("--keep", default=None)
    p_verify.add_argument("--pack", default=None)
    p_verify.add_argument("--register", default=None)
    p_verify.add_argument("--config", default=None)
    p_verify.add_argument("--allow-added", action="store_true")
    p_verify.add_argument("--strict", action="store_true")
    p_verify.add_argument("--format", default="text", choices=["text", "json"])
    p_verify.add_argument("--json", action="store_true")
    p_verify.add_argument("--lang", default="en", choices=["en", "zh"])

    p_review = sub.add_parser("review", help="Multi-layer review (--offline | --endpoint | --provider)", allow_abbrev=False)
    p_review.add_argument("target", nargs="?", default="-")
    p_review.add_argument("--pack", default=None)
    p_review.add_argument("--register", default=None)
    p_review.add_argument("--config", default=None)
    p_review.add_argument("--stdin-filename", default=None)
    p_review.add_argument("--deep", action="store_true")
    p_review.add_argument("--offline", action="store_true")
    p_review.add_argument("--endpoint", default=None)
    p_review.add_argument("--api-key-env", default=None)
    p_review.add_argument("--provider", default=None)
    p_review.add_argument("--model", default=None)
    p_review.add_argument("--base-url", default=None)
    p_review.add_argument("--fail-on", default="warning")
    p_review.add_argument("--timeout", type=int, default=30000)
    p_review.add_argument("--max-chunks", type=int, default=20)
    p_review.add_argument("--dry-run", action="store_true")
    p_review.add_argument("--print-prompt", action="store_true")
    p_review.add_argument("-y", "--yes", action="store_true")
    p_review.add_argument("--include-notes", action="store_true")
    p_review.add_argument("--include-hidden", action="store_true")
    p_review.add_argument("--format", default="text", choices=["text", "json", "agent"])
    p_review.add_argument("--json", action="store_true")
    p_review.add_argument("--lang", default="en", choices=["en", "zh"])

    p_exp = sub.add_parser("explain", help="Show check question and before/trap/after examples for a rule", allow_abbrev=False)
    p_exp.add_argument("rule_id")
    p_exp.add_argument("--lang", default="en", choices=["en", "zh"])
    p_exp.add_argument("--format", default="text", choices=["text", "json"])
    p_exp.add_argument("--json", action="store_true")

    p_packs = sub.add_parser("packs", help="List installed rule packs", allow_abbrev=False)
    p_packs.add_argument("--format", default="text", choices=["text", "json"])
    p_packs.add_argument("--json", action="store_true")

    for alias in ("catalog", "search"):
        p_cat = sub.add_parser(alias, help="Search and filter dislop's AI-slop pattern catalog", allow_abbrev=False)
        p_cat.add_argument("terms", nargs="*")
        p_cat.add_argument("--query", default=None)
        p_cat.add_argument("--pack", default=None)
        p_cat.add_argument("--category", default=None)
        p_cat.add_argument("--dimension", default=None)
        p_cat.add_argument("--family", default=None)
        p_cat.add_argument("--modality", default=None)
        p_cat.add_argument("--severity", default=None)
        p_cat.add_argument("--tier", default=None)
        p_cat.add_argument("--lang", default="en", choices=["en", "zh"])
        p_cat.add_argument("--format", default="text")
        p_cat.add_argument("--json", action="store_true")
        p_cat.add_argument("--no-exemplars", action="store_true")
        p_cat.add_argument("--limit", type=int, default=None)

    p_pat = sub.add_parser("patterns", help="Run AI-Slop Pattern Library multi-angle scan & profile", allow_abbrev=False)
    p_pat.add_argument("target", nargs="?", default="-")
    p_pat.add_argument("--stdin-filename", default=None)
    p_pat.add_argument("--angle", default=None)
    p_pat.add_argument("--lang", default="en", choices=["en", "zh"])
    p_pat.add_argument("--format", default="text", choices=["text", "json"])
    p_pat.add_argument("--json", action="store_true")

    p_voice = sub.add_parser("voice", help="Extract offline deterministic dislop.voice/1 profile (0 network calls)", allow_abbrev=False)
    p_voice.add_argument("paths", nargs="*")
    p_voice.add_argument("--output", "-o", default=None)
    p_voice.add_argument("--format", default="text", choices=["text", "json"])
    p_voice.add_argument("--json", action="store_true")
    p_voice.add_argument("--lang", default="auto", choices=["auto", "en", "zh"])

    p_mod = sub.add_parser("model", help="Inspect bundled ML, hardware fit, and manage optional local models", allow_abbrev=False)
    p_mod.add_argument("action", nargs="?", default="status")
    p_mod.add_argument("target", nargs="?", default=None)
    p_mod.add_argument("--tier", default=None)
    p_mod.add_argument("--provider", default="ollama")
    p_mod.add_argument("--force", action="store_true")
    p_mod.add_argument("--dry-run", action="store_true")
    p_mod.add_argument("--yes", action="store_true")
    p_mod.add_argument("--sha256", default=None)
    p_mod.add_argument("--no-copy", action="store_true")
    p_mod.add_argument("--cache-dir", default=None)
    p_mod.add_argument("--threshold", type=float, default=None)
    p_mod.add_argument("--stdin-filename", default=None)
    p_mod.add_argument("--pack", default=None)
    p_mod.add_argument("--config", default=None)
    p_mod.add_argument("--endpoint", default=None)
    p_mod.add_argument("--model", default=None)
    p_mod.add_argument("--allow-lan", action="store_true")
    p_mod.add_argument("--output", "-o", default=None)
    p_mod.add_argument("--no-loopback", action="store_true")
    p_mod.add_argument("--format", default="text", choices=["text", "json"])
    p_mod.add_argument("--json", action="store_true")
    p_mod.add_argument("--lang", default="en", choices=["en", "zh"])

    p_doc = sub.add_parser("doctor", help="Check 3-layer readiness, BYOK env, config, and optional --online Cloud ping", allow_abbrev=False)
    p_doc.add_argument("--online", action="store_true")
    p_doc.add_argument("--no-loopback", action="store_true")
    p_doc.add_argument("--cache-dir", default=None)
    p_doc.add_argument("--format", default="text", choices=["text", "json"])
    p_doc.add_argument("--json", action="store_true")
    p_doc.add_argument("--lang", default="en", choices=["en", "zh"])

    p_setup = sub.add_parser("setup", help="Interactive or flag-driven optional local model setup", allow_abbrev=False)
    p_setup.add_argument("target", nargs="?", default=None)
    p_setup.add_argument("--tier", default=None)
    p_setup.add_argument("--provider", default="ollama")
    p_setup.add_argument("--force", action="store_true")
    p_setup.add_argument("--dry-run", action="store_true")
    p_setup.add_argument("--yes", action="store_true")
    p_setup.add_argument("--cache-dir", default=None)
    p_setup.add_argument("--format", default="text", choices=["text", "json"])
    p_setup.add_argument("--json", action="store_true")
    p_setup.add_argument("--lang", default="en", choices=["en", "zh"])

    p_deslop = sub.add_parser("deslop", help="Fact-locked paragraph cleanup using a local loopback model (--local)", allow_abbrev=False)
    p_deslop.add_argument("target", nargs="?", default="-")
    p_deslop.add_argument("--local", action="store_true")
    p_deslop.add_argument("--pack", default=None)
    p_deslop.add_argument("--register", default=None)
    p_deslop.add_argument("--config", default=None)
    p_deslop.add_argument("--stdin-filename", default=None)
    p_deslop.add_argument("--endpoint", default=None)
    p_deslop.add_argument("--model", default=None)
    p_deslop.add_argument("--allow-lan", action="store_true")
    p_deslop.add_argument("--output", "-o", default=None)
    p_deslop.add_argument("--format", default="text", choices=["text", "json"])
    p_deslop.add_argument("--json", action="store_true")
    p_deslop.add_argument("--lang", default="en", choices=["en", "zh"])

    p_res = sub.add_parser("resources", help="Show bundled offline packs and optional static/cloud resource links", allow_abbrev=False)
    p_res.add_argument("--format", default="text", choices=["text", "json"])
    p_res.add_argument("--json", action="store_true")

    sub.add_parser("pack-test", help="Validate Pack Schema v2 manifests and embedded fixtures", allow_abbrev=False)
    sub.add_parser("init", help="Create starter .dislop.json config", allow_abbrev=False)

    if args and args[0] == "review":
        for tok in args[1:]:
            if tok == "--api-key" or tok.startswith("--api-key=") or tok == "--token" or tok.startswith("--token="):
                print(
                    "dislop review: passing --api-key or --token as CLI arguments is forbidden (exposed via process list); set DISLOP_REVIEW_API_KEY or the provider env var instead.",
                    file=sys.stderr,
                )
                sys.exit(2)

    ns = parser.parse_args(_preprocess_changed_args(args))
    if ns.cmd == "voice":
        sys.exit(_cmd_voice(ns))
    if ns.cmd == "patterns":
        sys.exit(_cmd_patterns(ns))
    if ns.cmd == "init":
        sys.exit(_cmd_init())

    packs = load_all_packs()
    pattern_by_rule_id = load_pattern_library()

    if ns.cmd == "check":
        sys.exit(_cmd_check(ns, packs))
    if ns.cmd == "verify":
        sys.exit(_cmd_verify(ns, packs))
    if ns.cmd == "review":
        sys.exit(_cmd_review(ns, packs))
    if ns.cmd == "doctor":
        sys.exit(_cmd_doctor(ns, packs))
    if ns.cmd == "model":
        sys.exit(_cmd_model(ns, packs))
    if ns.cmd == "setup":
        ns.action = "setup"
        ns.no_loopback = True
        sys.exit(_cmd_model(ns, packs))
    if ns.cmd == "deslop":
        if not ns.local:
            print("dislop deslop: pass --local to run with a loopback local small model (0 external upload).", file=sys.stderr)
            sys.exit(2)
        sys.exit(_cmd_local_deslop(ns.target, ns, packs))
    if ns.cmd == "explain":
        sys.exit(_cmd_explain(ns, packs, pattern_by_rule_id))
    if ns.cmd in {"catalog", "search"}:
        sys.exit(_cmd_catalog(ns, packs, pattern_by_rule_id))
    if ns.cmd == "packs":
        sys.exit(_cmd_packs(ns, packs))
    if ns.cmd == "resources":
        sys.exit(_cmd_resources(ns, packs))
    if ns.cmd == "pack-test":
        sys.exit(_cmd_pack_test(packs))

    _print_grouped_help()


if __name__ == "__main__":
    main()
