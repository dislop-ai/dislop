import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectModality, verifyRevision } from "./core.mjs";

export function editableFile(file) {
  const modality = detectModality(file);
  return Boolean(modality && !["docx", "pptx", "pdf", "image"].includes(modality));
}

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

// The on-disk format uses Unicode code points in both runtimes.
export function prepareEdits(report, text, file) {
  const items = report.issues ?? report.findings;
  const chars = Array.from(text);
  const enabled = file !== "-" && editableFile(file) && !text.includes("\0");
  if (enabled) report.sourceSha256 = digest(text);
  for (const [i, item] of items.entries()) {
    const edit = item.edit;
    if (!edit) continue;
    if (enabled && Number.isSafeInteger(edit.start) && edit.start >= 0 &&
        typeof edit.after === "string" && edit.after.isWellFormed() && !edit.after.includes("\0") &&
        edit.before && edit.before !== edit.after &&
        chars.slice(edit.start, edit.start + Array.from(edit.before).length).join("") === edit.before &&
        verifyRevision(edit.before, edit.after).status === "preserved") {
      edit.id = i + 1;
    } else {
      delete item.edit;
    }
  }
}

function ids(value) {
  if (value === undefined) return new Set();
  if (!/^[1-9]\d*(,[1-9]\d*)*$/.test(value)) throw Error("expected comma-separated positive edit IDs");
  return new Set(value.split(",").map(Number));
}

export function requirePicker(file, compatible) {
  if (!editableFile(file) || !compatible || !process.stdin.isTTY || !process.stdout.isTTY) {
    throw Error("--interactive-apply requires one supported text file, text output, and an interactive terminal");
  }
  if (spawnSync("vim", ["--version"], { stdio: "ignore" }).status !== 0) throw Error("install Vim to use --interactive-apply");
}

function pick(items, chars, lang) {
  const rows = items.map((item, i) => {
    const edit = item.edit;
    const row = { id: i + 1, why: item.why ?? item.message?.[lang] ?? item.message?.en ?? "", quote: item.quote ?? item.match ?? "",
      advice: item.instruction ?? item.question ?? item.deletionTest?.[lang] ?? item.deletionTest?.en ?? item.replacement ?? "" };
    if (edit) {
      const end = edit.start + Array.from(edit.before).length;
      Object.assign(row, { before: edit.before, after: edit.after,
        prefix: chars.slice(Math.max(0, edit.start - 60), edit.start).join("").split(/\r?\n/).at(-1),
        suffix: chars.slice(end, end + 60).join("").split(/\r?\n/, 1)[0] });
    }
    return row;
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dislop-review-"));
  try {
    fs.writeFileSync(path.join(dir, "items.json"), JSON.stringify(rows), { mode: 0o600 });
    const script = fileURLToPath(new URL("./dislop/review-picker.vim", import.meta.url));
    const result = spawnSync("vim", ["-Nu", "NONE", "-i", "NONE", "-n", "-X", "--noplugin", "-S", script], {
      stdio: "inherit", env: { ...process.env, DISLOP_PICKER_DIR: dir, DISLOP_PICKER_LANG: lang },
    });
    if (result.error || result.status !== 0) throw Error("Vim review session did not complete");
    const output = path.join(dir, "selected");
    return fs.existsSync(output) ? new Set(JSON.parse(fs.readFileSync(output, "utf8"))) : new Set();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function applyReview(report, file, flags, interactive = false) {
  if (!editableFile(file)) throw Error("choose a supported UTF-8 source file");
  const items = report?.issues ?? report?.findings;
  if (report?.schema !== "dislop.review/1" || typeof report.sourceSha256 !== "string" || !Array.isArray(items)) {
    throw Error("this report has no file edit data; rerun review on the source file with --json");
  }
  const target = fs.realpathSync(file);
  if (!fs.statSync(target).isFile()) throw Error("source must be a regular file");
  const original = fs.readFileSync(target);
  if (digest(original) !== report.sourceSha256) throw Error("source differs from reviewed file; rerun review");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(original);
  if (text.includes("\0")) throw Error("source contains binary data");
  const chars = Array.from(text);
  const edits = new Map();
  for (const [i, item] of items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw Error(`invalid review item #${i + 1}`);
    const edit = item.edit;
    if (edit === undefined) continue;
    if (edit?.id !== i + 1 || !Number.isSafeInteger(edit.start) || edit.start < 0 ||
        typeof edit.before !== "string" || !edit.before || typeof edit.after !== "string" ||
        !edit.after.isWellFormed() || edit.after.includes("\0")) throw Error(`invalid edit #${i + 1}`);
    edits.set(edit.id, edit);
  }

  let selected;
  if (interactive) {
    selected = items.length ? pick(items, chars, flags.lang || "en") : new Set();
  } else {
    if (Boolean(flags.all) === (flags.include !== undefined) || (flags.exclude !== undefined && !flags.all)) {
      throw Error("choose --include IDS or --all [--exclude IDS]");
    }
    selected = flags.all ? new Set(edits.keys()) : ids(flags.include);
    for (const id of ids(flags.exclude)) {
      if (!edits.has(id)) throw Error(`unknown or advisory edit #${id}`);
      selected.delete(id);
    }
  }
  const chosen = [...selected].map((id) => {
    if (!edits.has(id)) throw Error(`unknown or advisory edit #${id}`);
    return edits.get(id);
  }).sort((a, b) => a.start - b.start);

  const pieces = [];
  let cursor = 0;
  for (const edit of chosen) {
    const end = edit.start + Array.from(edit.before).length;
    if (chars.slice(edit.start, end).join("") !== edit.before) throw Error(`source span mismatch for #${edit.id}`);
    if (edit.start < cursor) throw Error(`overlapping edits at #${edit.id}; select one alternative`);
    pieces.push(chars.slice(cursor, edit.start).join(""), edit.after);
    cursor = end;
  }
  if (chosen.length) {
    pieces.push(chars.slice(cursor).join(""));
    // A sibling staging file serializes dislop writers and permits one same-volume rename.
    const stage = path.join(path.dirname(target), "." + path.basename(target) + ".dislop-apply.tmp");
    const fd = fs.openSync(stage, "wx", 0o600);
    let committed = false;
    try {
      try {
        fs.writeFileSync(fd, pieces.join(""));
        fs.fchmodSync(fd, fs.statSync(target).mode & 0o777);
      } finally {
        fs.closeSync(fd);
      }
      if (!original.equals(fs.readFileSync(target))) throw Error("source changed during apply; rerun review");
      fs.renameSync(stage, target);
      committed = true;
    } finally {
      // A successful rename releases the name; a new writer may already own it.
      if (!committed) fs.unlinkSync(stage);
    }
  }
  console.log(flags.lang === "zh" ? `已写入 ${chosen.length} 处修改。` : `Applied ${chosen.length} edit(s).`);
}
