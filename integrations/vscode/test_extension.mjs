#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildHoverMarkdown,
  buildIgnoreComment,
  codepointOffsetToUtf16,
  runDiagnosticsAudit,
} from "./src/diagnostics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function loadPacks() {
  const packsDir = path.join(REPO_ROOT, "packs");
  const out = {};
  for (const entry of fs.readdirSync(packsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = path.join(packsDir, entry.name, "pack.json");
    if (fs.existsSync(p)) {
      const m = JSON.parse(fs.readFileSync(p, "utf8"));
      out[m.id] = m;
    }
  }
  return out;
}

function createMockVscode(initialText) {
  const collections = new Map();
  const registeredTools = new Map();
  const registeredMcp = new Map();
  let hoverProvider = null;
  let codeActionProvider = null;

  class Position {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  }
  class Range {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
    contains(pos) {
      if (pos.line < this.start.line || pos.line > this.end.line) return false;
      if (pos.line === this.start.line && pos.character < this.start.character) return false;
      if (pos.line === this.end.line && pos.character > this.end.character) return false;
      return true;
    }
  }
  class Diagnostic {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  }
  class MarkdownString {
    constructor(value) {
      this.value = value;
      this.isTrusted = false;
    }
  }
  class Hover {
    constructor(contents, range) {
      this.contents = contents;
      this.range = range;
    }
  }
  class CodeAction {
    constructor(title, kind) {
      this.title = title;
      this.kind = kind;
    }
  }
  class WorkspaceEdit {
    constructor() {
      this.edits = [];
    }
    insert(uri, pos, text) {
      this.edits.push({ uri, pos, text });
    }
  }
  class McpHttpServerDefinition {
    constructor(label, uri) {
      this.label = label;
      this.uri = uri;
    }
  }
  class LanguageModelTextPart {
    constructor(value) {
      this.value = value;
    }
  }
  class LanguageModelToolResult {
    constructor(content) {
      this.content = content;
    }
  }

  const doc = {
    uri: { toString: () => "file:///tmp/launch-note.md" },
    fileName: "/tmp/launch-note.md",
    languageId: "markdown",
    getText: () => initialText,
    lineAt: (idx) => ({ text: initialText.split("\n")[idx] || "" }),
    positionAt: (offset) => {
      const before = initialText.slice(0, offset);
      const lines = before.split("\n");
      return new Position(lines.length - 1, lines[lines.length - 1].length);
    },
  };

  const api = {
    Uri: {
      parse: (v) => ({ toString: () => String(v), value: String(v) }),
    },
    Position,
    Range,
    Diagnostic,
    MarkdownString,
    Hover,
    CodeAction,
    WorkspaceEdit,
    McpHttpServerDefinition,
    LanguageModelTextPart,
    LanguageModelToolResult,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CodeActionKind: { QuickFix: "quickfix" },
    workspace: {
      textDocuments: [doc],
      getConfiguration: () => ({ get: (_k, d) => d }),
      onDidOpenTextDocument: () => ({ dispose() {} }),
      onDidSaveTextDocument: () => ({ dispose() {} }),
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onDidCloseTextDocument: () => ({ dispose() {} }),
      openTextDocument: async () => doc,
      applyEdit: async () => true,
    },
    window: { activeTextEditor: { document: doc } },
    commands: { registerCommand: () => ({ dispose() {} }) },
    languages: {
      createDiagnosticCollection: (name) => {
        const store = new Map();
        const col = {
          set: (uri, diags) => store.set(uri.toString(), diags),
          delete: (uri) => store.delete(uri.toString()),
          dispose() {},
          _store: store,
        };
        collections.set(name, col);
        return col;
      },
      registerHoverProvider: (_sel, provider) => {
        hoverProvider = provider;
        return { dispose() {} };
      },
      registerCodeActionsProvider: (_sel, provider) => {
        codeActionProvider = provider;
        return { dispose() {} };
      },
    },
    lm: {
      registerMcpServerDefinitionProvider: (id, provider) => {
        registeredMcp.set(id, provider);
        return { dispose() {} };
      },
      registerTool: (name, tool) => {
        registeredTools.set(name, tool);
        return { dispose() {} };
      },
    },
  };

  return {
    api,
    doc,
    collections,
    registeredTools,
    registeredMcp,
    getHoverProvider: () => hoverProvider,
    getCodeActionProvider: () => codeActionProvider,
  };
}

function loadBundledExtension(bundlePath, mockVscode) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "vscode") return mockVscode;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const req = Module.createRequire(import.meta.url);
    delete req.cache[req.resolve(bundlePath)];
    return req(bundlePath);
  } finally {
    Module._load = originalLoad;
  }
}

async function main() {
  const build = spawnSync("node", ["scripts/build.mjs"], { cwd: __dirname, encoding: "utf8" });
  assert.equal(build.status, 0, `build.mjs failed: ${build.stderr}`);

  const packs = loadPacks();

  // 1. Unit tests on diagnostics.mjs
  const emojiSample = "Sure, here is 🚀 the draft.\nIt is worth noting that backups run every 6 hours.";
  const emojiAudit = runDiagnosticsAudit(emojiSample, { filename: "note.md", packsById: packs });
  assert.ok(emojiAudit.items.some((i) => i.finding.ruleId === "chatbot-artifact"));
  assert.ok(emojiAudit.items.some((i) => i.finding.ruleId === "en-throat-clearing-opener"));
  const secondItem = emojiAudit.items.find((i) => i.finding.ruleId === "en-throat-clearing-opener");
  assert.equal(
    codepointOffsetToUtf16(emojiSample, secondItem.finding.span.start),
    secondItem.startOffset
  );
  assert.ok(secondItem.startOffset > secondItem.finding.span.start, "UTF-16 offset accounts for surrogate pair 🚀");

  const hoverMd = buildHoverMarkdown(secondItem.finding, "en");
  assert.ok(hoverMd.includes("**dislop**"));
  assert.ok(hoverMd.includes("**Clean:**"));
  assert.equal(
    buildIgnoreComment("en-throat-clearing-opener", "markdown"),
    "<!-- dislop-ignore-next-line en-throat-clearing-opener -- intentional phrasing -->"
  );
  assert.equal(
    buildIgnoreComment("ui-ai-gradient", "css"),
    "/* dislop-ignore-next-line ui-ai-gradient -- intentional phrasing */"
  );
  assert.equal(
    buildIgnoreComment("ui-dead-control", "jsx"),
    "// dislop-ignore-next-line ui-dead-control -- intentional phrasing"
  );

  const cleanAudit = runDiagnosticsAudit(
    "We rolled out queue partitioning on Tuesday. Median recovery time dropped from 180s to 45s.",
    { filename: "note.md", packsById: packs }
  );
  assert.equal(cleanAudit.items.length, 0);

  // 2. End-to-end bundle test (desktop + web)
  const sampleText = "Sure, here is the draft.\nIt is worth noting that backups run every 6 hours.";
  const mockDesktop = createMockVscode(sampleText);
  const desktopExt = loadBundledExtension(path.join(__dirname, "dist", "extension.js"), mockDesktop.api);
  const context = { subscriptions: [] };
  desktopExt.activate(context);

  const diags = mockDesktop.collections.get("dislop")._store.get(mockDesktop.doc.uri.toString());
  assert.ok(Array.isArray(diags) && diags.length >= 2, "Expected diagnostics from desktop bundle");

  const hover = mockDesktop.getHoverProvider().provideHover(mockDesktop.doc, diags[0].range.start);
  assert.ok(hover && hover.contents.value.includes("dislop"), "Expected hover markdown");

  const quickFixes = mockDesktop
    .getCodeActionProvider()
    .provideCodeActions(mockDesktop.doc, diags[0].range, { diagnostics: [diags[0]] });
  assert.equal(quickFixes.length, 1);

  assert.ok(mockDesktop.registeredMcp.has("dislop.mcp"), "Desktop extension should register MCP provider");
  const mcpDefs = mockDesktop.registeredMcp.get("dislop.mcp").provideMcpServerDefinitions();
  assert.equal(mcpDefs[0].uri.toString(), "https://dislop.com/mcp");

  const lmTool = mockDesktop.registeredTools.get("dislop_check_document");
  assert.ok(lmTool, "Desktop extension should register dislop_check_document LM tool");
  const toolResult = await lmTool.invoke({ input: { text: sampleText, filename: "draft.md" } });
  const parsed = JSON.parse(toolResult.content[0].value);
  assert.ok(parsed.findings.length >= 2);

  // Web bundle check (must register remote HTTP MCP provider, audit offline & register LM tool)
  const mockWeb = createMockVscode(sampleText);
  const webExt = loadBundledExtension(path.join(__dirname, "dist", "web", "extension.js"), mockWeb.api);
  webExt.activate({ subscriptions: [] });
  assert.ok(mockWeb.registeredMcp.has("dislop.mcp"), "Web bundle should register remote HTTP MCP provider");
  assert.ok(mockWeb.registeredTools.has("dislop_check_document"), "Web bundle must register LM tool");

  console.log("VS Code & Open VSX extension tests: ALL PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
