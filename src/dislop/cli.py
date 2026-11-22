"""Python CLI entrypoint matching `bin/dislop.mjs`."""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from .engine import (
    ENGINE_VERSION,
    SEVERITY_RANK,
    analyze_text_profile,
    audit_text,
    build_catalog,
    collect_target_files,
    detect_modality,
    extract_voice_profile_offline,
    fnv1a_hex,
    inspect_file,
    load_all_packs,
    load_config,
    load_pattern_library,
    pick_pack_for_file,
    query_catalog,
    resolve_effective_pack,
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


def _js_round_pct(v: float) -> int:
    return int(math.floor(v * 100.0 + 0.5))


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


def _build_pocket_ml_findings(
    text: str,
    filename: str,
    existing_findings: list[dict[str, Any]],
    threshold: float | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    doc = analyze_document_with_pocket_models(text, threshold=threshold)
    extras: list[dict[str, Any]] = []
    mod = detect_modality(filename) or "markdown"
    for p in doc["paragraphs"]:
        if not p["flagged"]:
            continue
        if any(p["startLine"] <= f.get("line", -1) <= p["endLine"] for f in existing_findings):
            continue
        pct = _js_round_pct(p["slopProbability"])
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
    return doc, extras


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
                "helpUri": f"https://dislop.com/#rule-{rid}",
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


def format_report(report: dict[str, Any], fmt: str = "text", lang: str = "en") -> str:
    findings = report["findings"]
    checked_count = report["checkedCount"]
    skipped = report.get("skipped", [])
    unused = report.get("unusedSuppressions", [])

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
            data_body = _escape_github_data(f"{msg} ({f['match']})")
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

    skip_note = f", {len(skipped)} skipped" if skipped else ""
    out: list[str] = []
    if not findings and not unused:
        if lang == "zh":
            zh_skip = f"，跳过 {len(skipped)} 项" if skipped else ""
            out.append(f"dislop: 未发现已知模式（已检 {checked_count} 项{zh_skip}，0 处命中）")
        else:
            out.append(f"dislop: no known patterns found ({checked_count} checked{skip_note}, 0 findings)")
    else:
        out.append(f"dislop: {len(findings)} finding(s) across {checked_count} checked file(s){skip_note}")
        for f in findings:
            msg = (f.get("message") or {}).get(lang) or (f.get("message") or {}).get("en") or ""
            out.append(f"  [{f['severity'].upper()}] {f['file']}:{f['location']}  {f['ruleId']}")
            out.append(f'    match: "{f["match"]}"')
            out.append(f"    why:   {msg}")
            dt = f.get("deletionTest")
            if dt:
                out.append(f"    test:  {dt.get(lang) or dt.get('en')}")
        for u in unused:
            out.append(f"  [UNUSED] {u['file']}:{u['line']}  stale dislop-ignore ({', '.join(u['ruleIds'])})")
    for s in skipped:
        out.append(f"  [SKIP] {s['file']} — {s['reason']}")
    for item in report.get("profiles") or []:
        p = item["profile"]
        sigs = ", ".join(p["telemetryRisk"]["signals"]) if p["telemetryRisk"]["signals"] else "none"
        out.append(
            f"  [PROFILE] {item['file']}  risk={p['telemetryRisk']['score']}/100 ({p['telemetryRisk']['level']}) | "
            f"burstiness_cv={p['burstiness']['cv']} ({p['burstiness']['status']}) | "
            f"concreteness={p['concreteness']['per100Units']}/100u ({p['concreteness']['status']}) | "
            f"mattr={p['lexical']['mattr']} | entropy={p['lexical']['charEntropy']} | signals={sigs}"
        )
    return "\n".join(out)


def _get_changed_lines(cwd: Path, git_ref: str, staged: bool) -> dict[str, set[int] | str]:
    cmd = ["git", "diff", "--cached", "-U0", "--no-color"] if staged else ["git", "diff", "-U0", "--no-color", git_ref]
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=True)
    changed: dict[str, set[int] | str] = {}
    cur_file: str | None = None
    for line in res.stdout.splitlines():
        if line.startswith("diff --git "):
            dm = re.match(r"^diff --git a/.+ b/(.+)$", line)
            cur_file = dm.group(1).strip() if dm else None
        elif line.startswith("+++ b/"):
            cur_file = line[6:].strip()
            changed.setdefault(cur_file, set())
        elif line.startswith("Binary files ") and cur_file:
            changed[cur_file] = "ALL"
        elif line.startswith("@@ ") and cur_file:
            m = re.search(r"\+(\d+)(?:,(\d+))?", line)
            if m and isinstance(changed.get(cur_file), set):
                start = int(m.group(1))
                cnt = int(m.group(2)) if m.group(2) is not None else 1
                target_set = changed[cur_file]
                assert isinstance(target_set, set)
                for k in range(max(1, cnt)):
                    target_set.add(start + k)
    return changed


def _cmd_check(ns: argparse.Namespace, packs: dict[str, dict[str, Any]]) -> int:
    cwd = Path.cwd()
    config = load_config(cwd, ns.config)
    fmt = "json" if ns.json else ns.format
    fail_on = ns.fail_on or config.get("failOn", "error")
    if fail_on not in SEVERITY_RANK:
        print(f"dislop: invalid --fail-on '{fail_on}'", file=sys.stderr)
        return 2

    if "-" in ns.paths:
        stdin_text = sys.stdin.read()
        fn = ns.stdin_filename or "stdin.md"
        mod = detect_modality(fn) or "markdown"
        eff_explicit = (
            predict_pack_with_pocket_router(stdin_text)["recommendedPack"]
            if ns.pack == "auto" and mod in {"markdown", "text"}
            else (None if ns.pack == "auto" else ns.pack)
        )
        pack_id = pick_pack_for_file(fn, mod, eff_explicit, config)
        try:
            pack = resolve_effective_pack(pack_id, packs, config)
        except Exception as exc:
            print(f"dislop: {exc}", file=sys.stderr)
            return 2
        res = audit_text(stdin_text, filename=fn, modality=mod, pack=pack, config=config)
        findings = list(res["findings"])
        if ns.patterns:
            pat_res = audit_patterns(stdin_text, filename=fn, modality=mod, banks=load_pattern_banks())
            findings = _merge_pattern_bank_findings(findings, pat_res["findings"])
        if ns.ml and mod in {"markdown", "text"}:
            _, ml_extras = _build_pocket_ml_findings(stdin_text, fn, findings)
            findings.extend(ml_extras)
        report: dict[str, Any] = {
            "version": ENGINE_VERSION,
            "checkedCount": 1,
            "skipped": [],
            "findings": findings,
            "unusedSuppressions": res["unusedSuppressions"] if ns.report_unused else [],
        }
        if ns.profile and mod in {"markdown", "text"}:
            report["profiles"] = [
                {
                    "file": fn,
                    "profile": analyze_text_profile(stdin_text, modality=mod),
                    "pocketModel": _summarize_pocket_for_profile(stdin_text),
                }
            ]
        print(format_report(report, fmt, ns.lang))
        triggered = any(SEVERITY_RANK[f["severity"]] >= SEVERITY_RANK[fail_on] for f in findings) or (
            ns.report_unused and len(res["unusedSuppressions"]) > 0
        )
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
        files, skipped_init = collect_target_files(targets, cwd, config)
    except Exception as exc:
        print(f"dislop: {exc}", file=sys.stderr)
        return 2

    all_findings: list[dict[str, Any]] = []
    all_skipped = list(skipped_init)
    all_unused: list[dict[str, Any]] = []
    all_profiles: list[dict[str, Any]] = []
    checked_count = 0
    explicit_targets = {(cwd / p).resolve() for p in ns.paths}
    explicit_uninspectable = bool(skipped_init)

    banks_cached = load_pattern_banks() if ns.patterns else None
    for abs_p, rel in files:
        if changed_map is not None and rel not in changed_map:
            continue
        mod_f = detect_modality(abs_p.name)
        eff_pack_arg = ns.pack
        raw_txt_cached: str | None = None
        if (mod_f in {"markdown", "text"} and (ns.pack == "auto" or ns.ml or ns.profile)) or (
            ns.patterns and mod_f not in {"docx", "pptx"}
        ):
            try:
                raw_txt_cached = abs_p.read_text(encoding="utf-8")
            except Exception:
                raw_txt_cached = None
        if ns.pack == "auto":
            eff_pack_arg = (
                predict_pack_with_pocket_router(raw_txt_cached)["recommendedPack"]
                if raw_txt_cached is not None and mod_f in {"markdown", "text"}
                else None
            )
        try:
            res = inspect_file(abs_p, rel, packs, eff_pack_arg, config)
        except Exception as exc:
            print(f"dislop: {exc}", file=sys.stderr)
            return 2
        f_list = list(res["findings"])
        if res["checked"]:
            checked_count += 1
            if ns.patterns:
                if mod_f in {"docx", "pptx"}:
                    import zipfile
                    try:
                        ooxml_entries: dict[str, str] = {}
                        with zipfile.ZipFile(abs_p, "r") as zf:
                            for info in zf.infolist():
                                if info.filename.endswith((".xml", ".rels")):
                                    ooxml_entries[info.filename] = zf.read(info.filename).decode("utf-8", errors="replace")
                        pat_res = audit_patterns("", filename=rel, modality=mod_f or "pptx", banks=banks_cached, ooxml=ooxml_entries)
                        f_list = _merge_pattern_bank_findings(f_list, pat_res["findings"])
                    except Exception:
                        pass
                elif raw_txt_cached is not None and mod_f:
                    pat_res = audit_patterns(raw_txt_cached, filename=rel, modality=mod_f, banks=banks_cached)
                    f_list = _merge_pattern_bank_findings(f_list, pat_res["findings"])
            if ns.ml and raw_txt_cached is not None and mod_f in {"markdown", "text"}:
                _, ml_extras = _build_pocket_ml_findings(raw_txt_cached, rel, f_list)
                f_list.extend(ml_extras)
            if ns.profile and raw_txt_cached is not None and mod_f in {"markdown", "text"}:
                all_profiles.append(
                    {
                        "file": rel,
                        "profile": analyze_text_profile(raw_txt_cached, modality=mod_f),
                        "pocketModel": _summarize_pocket_for_profile(raw_txt_cached),
                    }
                )
        elif abs_p in explicit_targets:
            explicit_uninspectable = True

        if changed_map is not None and rel in changed_map:
            allowed = changed_map[rel]
            if isinstance(allowed, set):
                f_list = [f for f in f_list if f.get("line") in allowed]

        all_findings.extend(f_list)
        all_skipped.extend(res["skipped"])
        if ns.report_unused:
            all_unused.extend(res["unusedSuppressions"])

    report = {
        "version": ENGINE_VERSION,
        "checkedCount": checked_count,
        "skipped": all_skipped,
        "findings": all_findings,
        "unusedSuppressions": all_unused,
    }
    if all_profiles:
        report["profiles"] = all_profiles
    rendered = format_report(report, fmt, ns.lang)
    if rendered:
        print(rendered)

    if explicit_uninspectable or (checked_count == 0 and len(all_skipped) > 0):
        return 2
    should_fail = any(SEVERITY_RANK[f["severity"]] >= SEVERITY_RANK[fail_on] for f in all_findings) or (
        ns.report_unused and len(all_unused) > 0
    )
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


VALID_MODALITIES = {"markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx"}
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
            "pricingAndFreeToken": "https://dislop.com/#pricing",
            "tools": ["dislop_review", "dislop_deslop", "dislop_voice_extract"],
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
    print(f"  - Awesome 87  : {payload['staticResources']['awesomeIndex']}")
    print(f"  - Rule card   : {payload['staticResources']['ruleTemplate']}")
    print("\nOptional hosted Cloud Remote MCP (login + 30 free credits/mo):")
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
    return 0


def main(argv: list[str] | None = None) -> None:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--mcp" in args:
        run_mcp_stdio()
        return

    parser = argparse.ArgumentParser(prog="dislop", description="Linter for AI Slop in docs, web UI, and slides")
    parser.add_argument("-v", "--version", action="version", version=ENGINE_VERSION)
    sub = parser.add_subparsers(dest="cmd")

    p_check = sub.add_parser("check", help="Audit files or directories")
    p_check.add_argument("paths", nargs="*")
    p_check.add_argument("--pack", default=None)
    p_check.add_argument("--config", default=None)
    p_check.add_argument("--fail-on", default=None)
    p_check.add_argument("--format", default="text", choices=["text", "json", "sarif", "github", "md"])
    p_check.add_argument("--json", action="store_true")
    p_check.add_argument("--changed", nargs="?", const="HEAD", default=None)
    p_check.add_argument("--staged", action="store_true")
    p_check.add_argument("--stdin-filename", default=None)
    p_check.add_argument("--report-unused", action="store_true")
    p_check.add_argument("--profile", action="store_true", help="Attach 5-axis offline statistical text rhythm + Pocket ML profile")
    p_check.add_argument("--ml", action="store_true", help="Enable bundled Pocket ML stealth-vapor paragraph detection")
    p_check.add_argument("--patterns", action="store_true", help="Include extended 6-dimension pattern-bank probes")
    p_check.add_argument("--lang", default="en", choices=["en", "zh"])

    p_exp = sub.add_parser("explain", help="Show check question and before/trap/after examples for a rule")
    p_exp.add_argument("rule_id")
    p_exp.add_argument("--lang", default="en", choices=["en", "zh"])
    p_exp.add_argument("--format", default="text", choices=["text", "json"])
    p_exp.add_argument("--json", action="store_true")

    p_packs = sub.add_parser("packs", help="List installed rule packs")
    p_packs.add_argument("--format", default="text", choices=["text", "json"])
    p_packs.add_argument("--json", action="store_true")

    for alias in ("catalog", "search"):
        p_cat = sub.add_parser(alias, help="Search and filter dislop's AI-slop pattern catalog")
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

    p_pat = sub.add_parser("patterns", help="Run AI-Slop Pattern Library multi-angle scan & profile")
    p_pat.add_argument("target", nargs="?", default="-")
    p_pat.add_argument("--stdin-filename", default=None)
    p_pat.add_argument("--angle", default=None)
    p_pat.add_argument("--lang", default="en", choices=["en", "zh"])
    p_pat.add_argument("--format", default="text", choices=["text", "json"])
    p_pat.add_argument("--json", action="store_true")

    p_voice = sub.add_parser("voice", help="Extract offline deterministic dislop.voice/1 profile (0 network calls)")
    p_voice.add_argument("paths", nargs="*")
    p_voice.add_argument("--output", "-o", default=None)
    p_voice.add_argument("--format", default="text", choices=["text", "json"])
    p_voice.add_argument("--json", action="store_true")
    p_voice.add_argument("--lang", default="auto", choices=["auto", "en", "zh"])

    for m_alias in ("model", "doctor"):
        p_mod = sub.add_parser(m_alias, help="Inspect bundled ML, hardware fit, and manage optional local models")
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

    p_setup = sub.add_parser("setup", help="Interactive or flag-driven optional local model setup")
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

    p_deslop = sub.add_parser("deslop", help="Fact-locked paragraph cleanup using a local loopback model (--local)")
    p_deslop.add_argument("target", nargs="?", default="-")
    p_deslop.add_argument("--local", action="store_true")
    p_deslop.add_argument("--pack", default=None)
    p_deslop.add_argument("--config", default=None)
    p_deslop.add_argument("--stdin-filename", default=None)
    p_deslop.add_argument("--endpoint", default=None)
    p_deslop.add_argument("--model", default=None)
    p_deslop.add_argument("--allow-lan", action="store_true")
    p_deslop.add_argument("--output", "-o", default=None)
    p_deslop.add_argument("--format", default="text", choices=["text", "json"])
    p_deslop.add_argument("--json", action="store_true")
    p_deslop.add_argument("--lang", default="en", choices=["en", "zh"])

    p_res = sub.add_parser("resources", help="Show bundled offline packs and optional static/cloud resource links")
    p_res.add_argument("--format", default="text", choices=["text", "json"])
    p_res.add_argument("--json", action="store_true")

    sub.add_parser("pack-test", help="Validate Pack Schema v2 manifests and embedded fixtures")
    sub.add_parser("init", help="Create starter .dislop.json config")

    if not args or args[0] in {"-h", "--help", "help"}:
        parser.print_help()
        return

    ns = parser.parse_args(args)
    packs = load_all_packs()
    pattern_by_rule_id = load_pattern_library()

    if ns.cmd == "check":
        sys.exit(_cmd_check(ns, packs))
    if ns.cmd == "voice":
        sys.exit(_cmd_voice(ns))
    if ns.cmd in {"model", "doctor"}:
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
    if ns.cmd == "patterns":
        sys.exit(_cmd_patterns(ns))
    if ns.cmd == "packs":
        sys.exit(_cmd_packs(ns, packs))
    if ns.cmd == "resources":
        sys.exit(_cmd_resources(ns, packs))
    if ns.cmd == "pack-test":
        sys.exit(_cmd_pack_test(packs))
    if ns.cmd == "init":
        sys.exit(_cmd_init())

    parser.print_help()


if __name__ == "__main__":
    main()
