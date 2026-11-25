import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { resolveLayeredConfig } from "../kernel/config.mjs";
import { verifyDocumentRevision } from "../kernel/fact-gate.mjs";
import { listBuiltinPackIds } from "../kernel/pack-loader.mjs";
import { runDocumentPipeline } from "../kernel/pipeline.mjs";
import { runAutoFixOnDocumentResult } from "../runners/auto-fix.mjs";
import { formatAgentReports } from "../runners/reporters.mjs";
import { resolveExecutionRoute } from "../runtime/router.mjs";

const SUPPORTED_MCP_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];

export const LOCAL_MCP_TOOLS = [
  {
    name: "dislop_check",
    description:
      "Inspect a file or inline text for objective delivery Defects and non-blocking editorial Suggestions (returns compact agent report + dislop.report/1).",
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to local file on disk" },
        text: { type: "string", description: "Inline document text when checking unsaved content" },
        format: {
          type: "string",
          description: "Document format extension when passing inline text (e.g., md, html, jsx)",
        },
        packs: {
          type: "array",
          items: { type: "string" },
          description: "Optional Pack IDs or paths (e.g., ['common/artifact-qa', 'en/prose'])",
        },
        noLlm: { type: "boolean", description: "Run deterministic Script Packs only (default true for fast local MCP checks)" },
        level: { type: "string", enum: ["strong", "moderate", "hint", "all"] },
      },
    },
  },
  {
    name: "dislop_fix_safe",
    description:
      "Atomically apply verified fixSafety === 'safe' edits on a local file and return the unified diff + remaining report.",
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      required: ["filePath"],
      properties: {
        filePath: { type: "string" },
        dryRun: { type: "boolean" },
        backup: { type: "boolean" },
        packs: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "dislop_verify",
    description:
      "Verify that a revised draft preserved all numbers, units, URLs, inline code spans, and proper nouns from the original without introducing second-order AI slogans.",
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      required: ["beforeText", "afterText"],
      properties: {
        beforeText: { type: "string" },
        afterText: { type: "string" },
      },
    },
  },
  {
    name: "dislop_packs",
    description: "List built-in multi-modal and language Packs available in this dislop installation.",
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function handleMcpJsonRpcRequest(msg, { cwd = process.cwd(), env = process.env } = {}) {
  if (!msg || typeof msg !== "object") {
    return {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid JSON-RPC request" },
    };
  }

  // Notifications carry no `id` and produce no response frame
  if (msg.id === undefined) {
    return null;
  }

  const { id, method, params = {} } = msg;

  try {
    if (method === "initialize") {
      const clientVer = params?.protocolVersion;
      const protocolVersion = SUPPORTED_MCP_VERSIONS.includes(clientVer)
        ? clientVer
        : "2025-03-26";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          serverInfo: {
            name: "dislop",
            version: "1.0.0",
          },
          capabilities: {
            tools: {},
          },
          instructions:
            "Use dislop_check to audit deliverables (Defects vs. non-blocking Suggestions). After revising prose in project context, call dislop_verify to ensure no numbers, units, URLs, code spans, or entities were dropped.",
        },
      };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: LOCAL_MCP_TOOLS },
      };
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === "dislop_packs") {
        const packs = listBuiltinPackIds();
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify({ packs }, null, 2) }],
            structuredContent: { packs },
          },
        };
      }

      if (toolName === "dislop_verify") {
        const res = verifyDocumentRevision(String(args.beforeText || ""), String(args.afterText || ""));
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
            structuredContent: res,
          },
        };
      }

      if (toolName === "dislop_check") {
        let targetPath = args.filePath ? path.resolve(cwd, String(args.filePath)) : null;
        let tmpFile = null;

        try {
          if (!targetPath) {
            if (typeof args.text !== "string") {
              throw new Error("Provide either 'filePath' or 'text' to dislop_check.");
            }
            const ext = String(args.format || "md").replace(/^\./, "");
            tmpFile = path.join(
              os.tmpdir(),
              `dislop-mcp-${process.pid}-${crypto.randomBytes(4).toString("hex")}.${ext}`,
            );
            fs.writeFileSync(tmpFile, args.text, "utf8");
            targetPath = tmpFile;
          }

          const config = resolveLayeredConfig({
            cwd,
            env,
            cliFlags: {
              packs: Array.isArray(args.packs) ? args.packs : null,
              noLlm: args.noLlm !== undefined ? Boolean(args.noLlm) : true,
              level: args.level || "all",
            },
          });
          const route = await resolveExecutionRoute({ config, isTty: false, env });
          const docRes = await runDocumentPipeline({ filePath: targetPath, config, route, cwd });
          if (tmpFile) {
            docRes.report.file = `inline.${args.format || "md"}`;
          }
          const agentText = formatAgentReports([docRes]);

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: agentText }],
              structuredContent: docRes.report,
            },
          };
        } finally {
          if (tmpFile && fs.existsSync(tmpFile)) {
            fs.unlinkSync(tmpFile);
          }
        }
      }

      if (toolName === "dislop_fix_safe") {
        if (!args.filePath) {
          throw new Error("dislop_fix_safe requires 'filePath'.");
        }
        const targetPath = path.resolve(cwd, String(args.filePath));
        const config = resolveLayeredConfig({
          cwd,
          env,
          cliFlags: {
            packs: Array.isArray(args.packs) ? args.packs : null,
            noLlm: true,
          },
        });
        const route = await resolveExecutionRoute({ config, isTty: false, env });
        const docRes = await runDocumentPipeline({ filePath: targetPath, config, route, cwd });
        const fixRes = runAutoFixOnDocumentResult(docRes, {
          dryRun: Boolean(args.dryRun),
          backup: Boolean(args.backup),
        });

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    appliedCount: fixRes.appliedCount,
                    modified: fixRes.modified,
                    diff: fixRes.diff,
                    report: fixRes.report,
                  },
                  null,
                  2,
                ),
              },
            ],
            structuredContent: {
              appliedCount: fixRes.appliedCount,
              modified: fixRes.modified,
              report: fixRes.report,
            },
          },
        };
      }

      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool '${toolName}'` },
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: '${method}'` },
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        isError: true,
        content: [{ type: "text", text: err.message }],
      },
    };
  }
}

/**
 * Start the stdio JSON-RPC 2.0 MCP server loop (supports newline-delimited JSON-RPC and Content-Length framing).
 */
export function startStdioMcpServer({
  stdin = process.stdin,
  stdout = process.stdout,
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  let buffer = Buffer.alloc(0);
  let useContentLength = false;

  const sendResponse = (resObj) => {
    if (!resObj) return;
    const json = JSON.stringify(resObj);
    if (useContentLength) {
      const byteLen = Buffer.byteLength(json, "utf8");
      stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
    } else {
      stdout.write(`${json}\n`);
    }
  };

  const drainBuffer = async () => {
    while (buffer.length > 0) {
      const asciiHead = buffer.subarray(0, Math.min(buffer.length, 32)).toString("utf8");
      if (/^Content-Length:/i.test(asciiHead)) {
        useContentLength = true;
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const headerStr = buffer.subarray(0, headerEnd).toString("utf8");
        const lenMatch = headerStr.match(/Content-Length:\s*(\d+)/i);
        if (!lenMatch) {
          buffer = buffer.subarray(headerEnd + 4);
          continue;
        }
        const bodyLen = parseInt(lenMatch[1], 10);
        const frameEnd = headerEnd + 4 + bodyLen;
        if (buffer.length < frameEnd) return;
        const bodyStr = buffer.subarray(headerEnd + 4, frameEnd).toString("utf8");
        buffer = buffer.subarray(frameEnd);
        try {
          const parsed = JSON.parse(bodyStr);
          const reply = await handleMcpJsonRpcRequest(parsed, { cwd, env });
          sendResponse(reply);
        } catch {
          sendResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        }
      } else {
        const nl = buffer.indexOf(0x0a);
        if (nl === -1) return;
        const line = buffer.subarray(0, nl).toString("utf8").trim();
        buffer = buffer.subarray(nl + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          const reply = await handleMcpJsonRpcRequest(parsed, { cwd, env });
          sendResponse(reply);
        } catch {
          sendResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        }
      }
    }
  };

  stdin.on("data", (chunk) => {
    const bufChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
    buffer = Buffer.concat([buffer, bufChunk]);
    drainBuffer();
  });
}
