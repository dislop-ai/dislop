import * as vscode from "vscode";
import {
  SUPPORTED_LANGUAGES,
  buildHoverMarkdown,
  buildIgnoreComment,
  runDiagnosticsAudit,
} from "./diagnostics.mjs";

/* global __DISLOP_PACKS__, __DISLOP_IS_WEB__ */
const BUNDLED_PACKS = typeof __DISLOP_PACKS__ !== "undefined" ? __DISLOP_PACKS__ : {};
const IS_WEB = typeof __DISLOP_IS_WEB__ !== "undefined" ? __DISLOP_IS_WEB__ : false;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("dislop");
  return {
    checkOn: cfg.get("checkOn", "save"),
    debounceMs: cfg.get("debounceMs", 300),
    pack: cfg.get("pack", "auto"),
    minSeverity: cfg.get("minSeverity", "info"),
  };
}

function mapSeverity(sev) {
  if (sev === "error") return vscode.DiagnosticSeverity.Error;
  if (sev === "info") return vscode.DiagnosticSeverity.Information;
  return vscode.DiagnosticSeverity.Warning;
}

function filenameForDoc(doc) {
  if (doc.fileName) return doc.fileName;
  if (doc.languageId === "html") return "draft.html";
  if (doc.languageId === "css") return "style.css";
  if (doc.languageId === "javascriptreact") return "component.jsx";
  if (doc.languageId === "typescriptreact") return "component.tsx";
  if (doc.languageId === "plaintext") return "notes.txt";
  return "draft.md";
}

export function activate(context) {
  const collection = vscode.languages.createDiagnosticCollection("dislop");
  const findingCache = new Map();
  const timers = new Map();

  function auditDocument(doc) {
    if (!doc || !SUPPORTED_LANGUAGES.has(doc.languageId)) return;
    const cfg = getConfig();
    const filename = filenameForDoc(doc);
    const text = doc.getText();
    const audit = runDiagnosticsAudit(text, {
      filename,
      packId: cfg.pack,
      packsById: BUNDLED_PACKS,
      minSeverity: cfg.minSeverity,
    });

    const diagnostics = [];
    const cached = [];
    for (const item of audit.items) {
      const startPos = doc.positionAt(item.startOffset);
      const endPos = doc.positionAt(item.endOffset);
      const range = new vscode.Range(startPos, endPos);
      const diag = new vscode.Diagnostic(
        range,
        item.finding.message?.en || item.finding.ruleId,
        mapSeverity(item.finding.severity)
      );
      diag.source = "dislop";
      diag.code = item.finding.ruleId;
      diagnostics.push(diag);
      cached.push({ range, finding: item.finding, modality: audit.modality });
    }

    collection.set(doc.uri, diagnostics);
    findingCache.set(doc.uri.toString(), cached);
  }

  function scheduleAudit(doc) {
    const key = doc.uri.toString();
    const prev = timers.get(key);
    if (prev) clearTimeout(prev);
    const { debounceMs } = getConfig();
    const handle = setTimeout(() => {
      timers.delete(key);
      auditDocument(doc);
    }, debounceMs);
    timers.set(key, handle);
  }

  for (const doc of vscode.workspace.textDocuments || []) {
    auditDocument(doc);
  }

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument((doc) => auditDocument(doc)),
    vscode.workspace.onDidSaveTextDocument((doc) => auditDocument(doc)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (getConfig().checkOn === "type") {
        scheduleAudit(event.document);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      const key = doc.uri.toString();
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.delete(key);
      findingCache.delete(key);
      collection.delete(doc.uri);
    }),
    vscode.commands.registerCommand("dislop.checkCurrentFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) auditDocument(editor.document);
    }),
    vscode.commands.registerCommand("dislop.insertIgnoreLine", async (uri, lineIndex, ruleId, modality) => {
      const doc = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
      if (!doc) return;
      const edit = new vscode.WorkspaceEdit();
      const targetLine = Math.max(0, Number(lineIndex || 0));
      const lineText = doc.lineAt(targetLine).text;
      const indentMatch = lineText.match(/^\s*/);
      const indent = indentMatch ? indentMatch[0] : "";
      const comment = buildIgnoreComment(ruleId || "all", modality || "markdown");
      edit.insert(doc.uri, new vscode.Position(targetLine, 0), `${indent}${comment}\n`);
      await vscode.workspace.applyEdit(edit);
      auditDocument(doc);
    })
  );

  const selector = Array.from(SUPPORTED_LANGUAGES).map((language) => ({ language }));

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, {
      provideHover(doc, position) {
        const items = findingCache.get(doc.uri.toString()) || [];
        const hit = items.find((item) => item.range.contains(position));
        if (!hit) return null;
        const md = new vscode.MarkdownString(buildHoverMarkdown(hit.finding, "en"));
        md.isTrusted = false;
        return new vscode.Hover(md, hit.range);
      },
    }),
    vscode.languages.registerCodeActionsProvider(selector, {
      provideCodeActions(doc, range, ctx) {
        const actions = [];
        for (const diag of ctx.diagnostics || []) {
          if (diag.source !== "dislop" || !diag.code) continue;
          const ruleId = typeof diag.code === "object" ? diag.code.value : String(diag.code);
          const lineIdx = diag.range.start.line;
          const mod = filenameForDoc(doc).endsWith(".css")
            ? "css"
            : /\.[jt]sx$/.test(filenameForDoc(doc))
              ? "jsx"
              : "markdown";
          const action = new vscode.CodeAction(
            `dislop: Ignore '${ruleId}' on next line`,
            vscode.CodeActionKind.QuickFix
          );
          action.diagnostics = [diag];
          action.command = {
            command: "dislop.insertIgnoreLine",
            title: "Ignore rule on next line",
            arguments: [doc.uri, lineIdx, ruleId, mod],
          };
          actions.push(action);
        }
        return actions;
      },
    })
  );

  if (vscode.lm?.registerMcpServerDefinitionProvider && typeof vscode.McpHttpServerDefinition === "function" && vscode.Uri?.parse) {
    context.subscriptions.push(
      vscode.lm.registerMcpServerDefinitionProvider("dislop.mcp", {
        provideMcpServerDefinitions() {
          return [
            new vscode.McpHttpServerDefinition("dislop", vscode.Uri.parse("https://dislop.com/mcp")),
          ];
        },
      })
    );
  }

  if (vscode.lm?.registerTool) {
    context.subscriptions.push(
      vscode.lm.registerTool("dislop_check_document", {
        async invoke(options) {
          const input = options?.input || {};
          const text = String(input.text || "");
          const filename = String(input.filename || "draft.md");
          const packId = String(input.pack || "auto");
          const audit = runDiagnosticsAudit(text, {
            filename,
            packId,
            packsById: BUNDLED_PACKS,
            minSeverity: "info",
          });
          const summary = {
            pack: audit.packId,
            modality: audit.modality,
            findings: audit.items.map((item) => ({
              ruleId: item.finding.ruleId,
              severity: item.finding.severity,
              line: item.line,
              col: item.col,
              match: item.finding.match,
              message: item.finding.message?.en || "",
              deletionTest: item.finding.deletionTest?.en || "",
            })),
          };
          if (typeof vscode.LanguageModelToolResult === "function" && typeof vscode.LanguageModelTextPart === "function") {
            return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(summary))]);
          }
          return summary;
        },
      })
    );
  }
}

export function deactivate() {}
