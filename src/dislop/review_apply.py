"""Apply exact edits from a dislop.review/1 report to its reviewed source."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile

from .engine import detect_modality, verify_revision


def editable_file(file):
    return detect_modality(str(file)) not in (None, "docx", "pptx", "pdf", "image")


def prepare_edits(report, text, file):
    items = report.get("issues", report.get("findings"))
    enabled = file != "-" and editable_file(file) and "\0" not in text
    if enabled:
        report["sourceSha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    for i, item in enumerate(items, 1):
        edit = item.get("edit")
        if not edit:
            continue
        start, before, after = edit["start"], edit["before"], edit["after"]
        if (enabled and type(start) is int and start >= 0 and before
                and isinstance(after, str) and "\0" not in after and not re.search(r"[\ud800-\udfff]", after)
                and before != after and text.startswith(before, start)
                and verify_revision(before, after)["status"] == "preserved"):
            edit["id"] = i
        else:
            del item["edit"]


def _ids(value):
    if value is None:
        return set()
    if not re.fullmatch(r"[1-9][0-9]*(,[1-9][0-9]*)*", value):
        raise ValueError("expected comma-separated positive edit IDs")
    return {int(part) for part in value.split(",")}


def require_picker(file, compatible):
    if not (editable_file(file) and compatible and sys.stdin.isatty() and sys.stdout.isatty()):
        raise ValueError("--interactive-apply requires one supported text file, text output, and an interactive terminal")
    if not shutil.which("vim"):
        raise ValueError("install Vim to use --interactive-apply")


def _pick(items, text, lang):
    rows = []
    for i, item in enumerate(items, 1):
        row = dict(id=i, why=item.get("why", item.get("message", {}).get(lang, "")),
                   quote=item.get("quote", item.get("match", "")),
                   advice=item.get("instruction") or item.get("question") or item.get("deletionTest", {}).get(lang) or item.get("replacement", ""))
        if edit := item.get("edit"):
            start, before = edit["start"], edit["before"]
            end = start + len(before)
            prefix = text[max(0, start - 60):start].rsplit("\n", 1)[-1]
            suffix = text[end:end + 60].split("\n", 1)[0].removesuffix("\r")
            row.update(before=before, after=edit["after"], prefix=prefix, suffix=suffix)
        rows.append(row)
    with tempfile.TemporaryDirectory(prefix="dislop-review-") as directory:
        root = Path(directory)
        (root / "items.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        script = Path(__file__).with_name("review-picker.vim")
        result = subprocess.run(["vim", "-Nu", "NONE", "-i", "NONE", "-n", "-X", "--noplugin", "-S", str(script)],
                                env={**os.environ, "DISLOP_PICKER_DIR": directory, "DISLOP_PICKER_LANG": lang})
        if result.returncode:
            raise ValueError("Vim review session did not complete")
        output = root / "selected"
        return set(json.loads(output.read_text(encoding="utf-8"))) if output.exists() else set()


def apply_review(report, file, *, include=None, exclude=None, all_edits=False, interactive=False, lang="en"):
    if not editable_file(file):
        raise ValueError("choose a supported UTF-8 source file")
    items = report.get("issues", report.get("findings")) if isinstance(report, dict) else None
    if (not isinstance(items, list) or report.get("schema") != "dislop.review/1"
            or not isinstance(report.get("sourceSha256"), str)):
        raise ValueError("this report has no file edit data; rerun review on the source file with --json")
    target = Path(file).resolve(strict=True)
    if not target.is_file():
        raise ValueError("source must be a regular file")
    original = target.read_bytes()
    if hashlib.sha256(original).hexdigest() != report["sourceSha256"]:
        raise ValueError("source differs from reviewed file; rerun review")
    text = original.decode("utf-8")
    if "\0" in text:
        raise ValueError("source contains binary data")
    edits = {}
    for i, item in enumerate(items, 1):
        if not isinstance(item, dict):
            raise ValueError(f"invalid review item #{i}")
        if "edit" not in item:
            continue
        edit = item["edit"]
        if (not isinstance(edit, dict) or type(edit.get("id")) is not int or edit["id"] != i
                or type(edit.get("start")) is not int or edit["start"] < 0
                or not isinstance(edit.get("before"), str) or not edit["before"]
                or not isinstance(edit.get("after"), str) or "\0" in edit["after"]):
            raise ValueError(f"invalid edit #{i}")
        edit["after"].encode("utf-8")
        edits[i] = edit

    if interactive:
        selected = _pick(items, text, lang) if items else set()
    else:
        if all_edits == (include is not None) or (exclude is not None and not all_edits):
            raise ValueError("choose --include IDS or --all [--exclude IDS]")
        selected = set(edits) if all_edits else _ids(include)
        excluded = _ids(exclude)
        for num in (selected | excluded) - edits.keys():
            raise ValueError(f"unknown or advisory edit #{num}")
        selected -= excluded

    pieces = []
    cursor = 0
    for edit in sorted((edits[i] for i in selected), key=lambda e: e["start"]):
        start, before = edit["start"], edit["before"]
        if not text.startswith(before, start):
            raise ValueError(f"source span mismatch for #{edit['id']}")
        if start < cursor:
            raise ValueError(f"overlapping edits at #{edit['id']}; select one alternative")
        pieces.extend((text[cursor:start], edit["after"]))
        cursor = start + len(before)
    if selected:
        pieces.append(text[cursor:])
        stage = target.with_name("." + target.name + ".dislop-apply.tmp")
        fd = os.open(stage, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        committed = False
        try:
            with os.fdopen(fd, "wb") as out:
                out.write("".join(pieces).encode("utf-8"))
            stage.chmod(stat.S_IMODE(target.stat().st_mode) & 0o777)
            if target.read_bytes() != original:
                raise ValueError("source changed during apply; rerun review")
            stage.replace(target)
            committed = True
        finally:
            if not committed:
                stage.unlink()
    print(f"已写入 {len(selected)} 处修改。" if lang == "zh" else f"Applied {len(selected)} edit(s).")
    return 0
