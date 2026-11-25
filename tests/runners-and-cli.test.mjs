import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "../src/cli-main.mjs";
import { handleMcpJsonRpcRequest } from "../src/mcp/stdio-server.mjs";

function makeTempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dislop-cli-e2e-"));
  const cfgDir = path.join(root, ".cfg");
  fs.mkdirSync(cfgDir, { recursive: true });
  return { root, cfgDir };
}

function makeMemoryIo({ cwd, cfgDir, isTty = false, keys = [], editorRunner = null, clipboardRunner = null } = {}) {
  let out = "";
  let err = "";
  let keyIdx = 0;

  return {
    cwd,
    env: {
      DISLOP_CONFIG_DIR: cfgDir,
      DISLOP_SKIP_OLLAMA_PULL: "1",
      ...(isTty ? { DISLOP_FORCE_TTY: "1" } : { DISLOP_FORCE_NON_TTY: "1" }),
    },
    stdin: { isTTY: isTty },
    stdout: {
      isTTY: isTty,
      write(s) {
        out += String(s);
      },
    },
    stderr: {
      write(s) {
        err += String(s);
      },
    },
    keyReader:
      keys.length > 0
        ? {
            async nextKey() {
              return keys[keyIdx++] ?? "q";
            },
            dispose() {},
          }
        : null,
    editorRunner,
    clipboardRunner,
    getStdout: () => out,
    getStderr: () => err,
  };
}

test("Dual-Track Exit Codes: prose Suggestions + Defect:warning exit 0; Defect:error exits 1; invalid usage exits 2", async () => {
  const { root, cfgDir } = makeTempWorkspace();
  try {
    // 1. File with multiple strong prose Suggestions + Defect:warning ('href="#"' in markdown) -> MUST exit 0
    const suggestionsOnlyFile = path.join(root, "prose.md");
    const fiftyFillerLines = Array.from(
      { length: 12 },
      () => "In today's fast-paced digital world, change happens.",
    ).join("\n\n");
    fs.writeFileSync(
      suggestionsOnlyFile,
      `${fiftyFillerLines}\n\nRead [placeholder](#) for context.\n`,
      "utf8",
    );

    const ioCheck0 = makeMemoryIo({ cwd: root, cfgDir });
    const code0 = await runCli(["check", "prose.md", "--json", "--no-llm"], ioCheck0);
    assert.equal(code0, 0, `Expected exit 0 for Suggestions + Defect:warning, got ${code0}`);
    const report0 = JSON.parse(ioCheck0.getStdout());
    assert.equal(report0.schema, "dislop.report/1");
    assert.equal(report0.summary.defects.error, 0);
    assert.equal(report0.summary.defects.warning, 1);
    assert.equal(report0.summary.suggestions.strong, 12);

    // Verify SARIF maps all Suggestions strictly to "note"
    const ioSarif = makeMemoryIo({ cwd: root, cfgDir });
    const sarifCode = await runCli(["check", "prose.md", "--format", "sarif", "--no-llm"], ioSarif);
    assert.equal(sarifCode, 0);
    const sarif = JSON.parse(ioSarif.getStdout());
    const proseSarifLevels = sarif.runs[0].results
      .filter((r) => r.ruleId.startsWith("en/prose/"))
      .map((r) => r.level);
    assert.ok(proseSarifLevels.length === 12);
    assert.ok(proseSarifLevels.every((lvl) => lvl === "note"));

    // Verify `--format agent` compact output
    const ioAgent = makeMemoryIo({ cwd: root, cfgDir });
    await runCli(["check", "prose.md", "--format", "agent", "--no-llm"], ioAgent);
    assert.match(ioAgent.getStdout(), /^# dislop file=prose\.md engine=deterministic defects=1 suggestions=12/m);
    assert.match(ioAgent.getStdout(), /SUGGESTION\(strong,safe\) en\/prose\/hollow-transition/);

    // 2. File with unresolved Defect: error (`[TODO]`) -> MUST exit 1
    const defectFile = path.join(root, "broken.md");
    fs.writeFileSync(defectFile, "Ship before Friday to [TODO: owner].\n", "utf8");
    const ioCheck1 = makeMemoryIo({ cwd: root, cfgDir });
    const code1 = await runCli(["check", "broken.md", "--no-llm"], ioCheck1);
    assert.equal(code1, 1);

    // 3. Non-existent file & Non-TTY `dislop fix` without `--auto` -> MUST exit 2
    const ioMissing = makeMemoryIo({ cwd: root, cfgDir });
    assert.equal(await runCli(["check", "does-not-exist.md"], ioMissing), 2);

    const ioNonTtyFix = makeMemoryIo({ cwd: root, cfgDir, isTty: false });
    assert.equal(await runCli(["fix", "prose.md"], ioNonTtyFix), 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("dislop fix --auto clears safe Defect:error items and Interactive TTY state machine handles y/n/u/p/e/A/q", async () => {
  const { root, cfgDir } = makeTempWorkspace();
  try {
    // 1. Batch `dislop fix --auto` removes safe chatbot wrapper (`Defect: error`) -> exits 0
    const batchFile = path.join(root, "batch.md");
    fs.writeFileSync(
      batchFile,
      "Certainly! Here is your summary.\n\nIt is worth noting that throughput reached 950 req/s.\n",
      "utf8",
    );
    const ioAuto = makeMemoryIo({ cwd: root, cfgDir });
    const autoCode = await runCli(["fix", "batch.md", "--auto", "--no-llm"], ioAuto);
    assert.equal(autoCode, 0);
    assert.equal(fs.readFileSync(batchFile, "utf8").trim(), "Throughput reached 950 req/s.");

    // 2. Interactive TTY state machine:
    // Hunk 1 (Defect:error manual [TODO]) -> press 'p' (copy prompt), then 'u' (undo back to Hunk 1!),
    // then 'e' ($EDITOR drops 42ms -> triggers Fact Gate [y/N] -> press 'n' to reject bad edit!),
    // then 'e' again ($EDITOR keeps 42ms and fills owner -> saved!),
    // Hunk 2 (Suggestion:strong throat-clearing) -> press 'y' (accept), then exits cleanly with code 0!
    const ttyFile = path.join(root, "interactive.md");
    fs.writeFileSync(
      ttyFile,
      "Assign ticket to [TODO] with 42ms budget.\n\nIt is worth noting that backups run nightly.\n",
      "utf8",
    );

    const copiedPrompts = [];
    let editorCallCount = 0;
    const ioTty = makeMemoryIo({
      cwd: root,
      cfgDir,
      isTty: true,
      // Keys:
      // 1) 'p' on Hunk 1 -> advances to Hunk 2
      // 2) 'u' on Hunk 2 -> reverts back to Hunk 1
      // 3) 'e' on Hunk 1 -> editor call #1 drops '42ms' -> Fact Gate asks [y/N] -> 'n' discards edit
      // 4) 'e' on Hunk 1 -> editor call #2 preserves '42ms' -> advances to Hunk 2
      // 5) 'y' on Hunk 2 -> accepts throat-clearing cleanup -> loop ends & writes file!
      keys: ["p", "u", "e", "n", "e", "y"],
      clipboardRunner: async (txt) => {
        copiedPrompts.push(txt);
        return true;
      },
      editorRunner: async () => {
        editorCallCount += 1;
        if (editorCallCount === 1) {
          return "Assign ticket to @alice without latency number."; // drops 42ms!
        }
        return "Assign ticket to @alice with 42ms budget.";
      },
    });

    const ttyExit = await runCli(["fix", "interactive.md", "--no-llm"], ioTty);
    // Note: Hunk 1 was manually edited via $EDITOR so `_applied` is true -> 0 unresolved Defect:error -> exit 0!
    assert.equal(ttyExit, 0);
    assert.equal(copiedPrompts.length, 1);
    assert.equal(editorCallCount, 2);
    assert.match(ioTty.getStdout(), /Fact check notice:/);

    const finalContent = fs.readFileSync(ttyFile, "utf8");
    assert.equal(
      finalContent,
      "Assign ticket to @alice with 42ms budget.\n\nBackups run nightly.\n",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Subcommands (init, login/logout, voice, model, packs, verify, doctor) and Local Stdio MCP server work end-to-end", async () => {
  const { root, cfgDir } = makeTempWorkspace();
  try {
    // init
    const ioInit = makeMemoryIo({ cwd: root, cfgDir });
    assert.equal(await runCli(["init"], ioInit), 0);
    assert.ok(fs.existsSync(path.join(root, ".dislop.json")));

    // login & logout
    const ioLogin = makeMemoryIo({ cwd: root, cfgDir });
    assert.equal(await runCli(["login", "--token", "dslp_test_token_123"], ioLogin), 0);
    assert.ok(fs.existsSync(path.join(cfgDir, "credentials.json")));

    // voice extract & show & clear
    const handWritten = path.join(root, "author.md");
    fs.writeFileSync(
      handWritten,
      "I debugged the WAL lock at 2am. However, the replica caught up in 8 seconds. Specifically, we tuned max_wal_size.\n",
      "utf8",
    );
    const ioVoice = makeMemoryIo({ cwd: root, cfgDir });
    assert.equal(await runCli(["voice", "extract", "author.md", "--no-llm", "--json"], ioVoice), 0);
    const voiceProfile = JSON.parse(ioVoice.getStdout());
    assert.equal(voiceProfile.schema, "dislop.voice/1");
    assert.ok(voiceProfile.preferredConnectors.includes("however"));

    // model pull, list, rm
    const ioModel = makeMemoryIo({ cwd: root, cfgDir });
    assert.equal(await runCli(["model", "pull", "qwen2.5-1.5b-instruct"], ioModel), 0);
    const ioDoctor = makeMemoryIo({ cwd: root, cfgDir });
    assert.equal(await runCli(["doctor", "--json"], ioDoctor), 0);
    const docJson = JSON.parse(ioDoctor.getStdout());
    assert.equal(docJson.cloudAuthenticated, true);
    assert.deepEqual(docJson.localModels.installed, ["qwen2.5-1.5b-instruct"]);

    assert.equal(await runCli(["model", "rm", "qwen2.5-1.5b-instruct"], makeMemoryIo({ cwd: root, cfgDir })), 0);
    assert.equal(await runCli(["logout"], makeMemoryIo({ cwd: root, cfgDir })), 0);

    // verify <before> <after>
    const beforeFile = path.join(root, "before.md");
    const afterGood = path.join(root, "after-good.md");
    const afterBad = path.join(root, "after-bad.md");
    fs.writeFileSync(beforeFile, "It is worth noting that PostgreSQL p95 latency was 14ms.\n", "utf8");
    fs.writeFileSync(afterGood, "PostgreSQL p95 latency was 14ms.\n", "utf8");
    fs.writeFileSync(afterBad, "PostgreSQL latency improved.\n", "utf8");

    assert.equal(await runCli(["verify", "before.md", "after-good.md"], makeMemoryIo({ cwd: root, cfgDir })), 0);
    assert.equal(await runCli(["verify", "before.md", "after-bad.md"], makeMemoryIo({ cwd: root, cfgDir })), 1);

    // Local Stdio MCP JSON-RPC handlers
    const initReply = await handleMcpJsonRpcRequest(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      { cwd: root, env: { DISLOP_CONFIG_DIR: cfgDir } },
    );
    assert.equal(initReply.result.serverInfo.name, "dislop");

    const checkReply = await handleMcpJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "dislop_check",
          arguments: {
            text: "Certainly! Here is your draft.\n\nThroughput stayed at 800 req/s.",
            format: "md",
          },
        },
      },
      { cwd: root, env: { DISLOP_CONFIG_DIR: cfgDir } },
    );
    assert.equal(checkReply.result.structuredContent.summary.defects.error, 1);

    const verifyReply = await handleMcpJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "dislop_verify",
          arguments: {
            beforeText: "Throughput stayed at 800 req/s.",
            afterText: "Throughput stayed high.",
          },
        },
      },
      { cwd: root, env: { DISLOP_CONFIG_DIR: cfgDir } },
    );
    assert.equal(verifyReply.result.structuredContent.ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("End-to-end 7-Step LLM Pipeline with BYOK mock, custom .pack.md, zh/prose auto-detection, and common/web-ui checks", async () => {
  const { root, cfgDir } = makeTempWorkspace();
  try {
    // 1. Custom .pack.md + mocked BYOK LLM response + Fact Gate protection
    const customPackPath = path.join(root, "academic.pack.md");
    fs.writeFileSync(
      customPackPath,
      [
        "---",
        "name: academic-en",
        "languages: [en]",
        "formats: [md]",
        "rules:",
        "  - id: vague-attribution",
        "    priority: strong",
        "---",
        "",
        "1. **vague-attribution**: Ask for citations on unsourced claims.",
      ].join("\n"),
      "utf8",
    );

    const draftPath = path.join(root, "paper.md");
    fs.writeFileSync(
      draftPath,
      "Studies have shown that batching cuts tail latency by 37%.\n",
      "utf8",
    );

    fs.writeFileSync(
      path.join(root, ".dislop.json"),
      JSON.stringify({
        routing: "byok",
        providers: {
          mock: {
            protocol: "openai",
            baseUrl: "http://127.0.0.1:11434/v1",
            apiKey: "test",
            model: "mock-llm",
            structuredOutput: "json_object",
          },
        },
      }),
      "utf8",
    );

    const ioByok = {
      ...makeMemoryIo({ cwd: root, cfgDir }),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    documentToneAnchor: "Empirical systems paper.",
                    items: [
                      {
                        ruleId: "academic-en/vague-attribution",
                        targetId: "P1-S1",
                        priority: "strong",
                        fixSafety: "safe",
                        actionType: "replace",
                        originalQuote:
                          "Studies have shown that batching cuts tail latency by 37%.",
                        // Intentionally drops '37%' so Step 5 Fact Gate must intercept & downgrade!
                        suggestedReplacement: "Batching cuts tail latency.",
                        reason: "Unsourced claim.",
                        rewritePrompt: "Cite the benchmark dataset: [paper or benchmark]",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    };

    const byokCode = await runCli(
      ["check", "paper.md", "--pack", "./academic.pack.md", "--json"],
      ioByok,
    );
    assert.equal(byokCode, 0);
    const byokReport = JSON.parse(ioByok.getStdout());
    assert.equal(byokReport.engine, "byok:mock-llm");
    assert.equal(byokReport.documentToneAnchor, "Empirical systems paper.");
    assert.equal(byokReport.items.length, 1);
    assert.equal(byokReport.items[0].fixSafety, "manual"); // Fact Gate downgraded because 37% was dropped!
    assert.match(byokReport.items[0].verificationNote, /37/);

    // 2. Chinese document auto-mounts `zh/prose` and `dislop fix --auto` deletes zero-info macro opener
    const zhPath = path.join(root, "post-zh.md");
    fs.writeFileSync(
      zhPath,
      "在当今数字化转型的浪潮下，这一举措无疑具有深远的战略意义。\n\n队列批处理将峰值延迟压到了 18 毫秒。\n",
      "utf8",
    );
    const ioZh = makeMemoryIo({ cwd: root, cfgDir });
    const zhCode = await runCli(["fix", "post-zh.md", "--auto", "--no-llm"], ioZh);
    assert.equal(zhCode, 0);
    assert.equal(fs.readFileSync(zhPath, "utf8").trim(), "队列批处理将峰值延迟压到了 18 毫秒。");

    // 3. Multi-modal HTML + SVG checks via `common/web-ui` + `common/artifact-qa`
    const uiPath = path.join(root, "hero.html");
    fs.writeFileSync(
      uiPath,
      `<div class="bg-gradient-to-r from-purple-600 to-pink-500"><a href="#">Get Started</a><button disabled>Submit</button></div>\n`,
      "utf8",
    );
    const ioUi = makeMemoryIo({ cwd: root, cfgDir });
    const uiCode = await runCli(["check", "hero.html", "--json", "--no-llm"], ioUi);
    assert.equal(uiCode, 1); // `<a href="#">` in HTML markup is a Defect: error!
    const uiReport = JSON.parse(ioUi.getStdout());
    const uiRules = uiReport.items.map((i) => i.ruleId);
    assert.ok(uiRules.includes("common/artifact-qa/placeholder-dead-link"));
    assert.ok(uiRules.includes("common/web-ui/unexplained-disabled-button"));
    assert.ok(uiRules.includes("common/web-ui/neon-ai-gradient"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
