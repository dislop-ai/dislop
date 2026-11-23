#!/usr/bin/env node
/**
 * Real-install ecosystem benchmark for dislop Flagship Report #1.
 * Evaluates blader/humanizer, hardikpandya/stop-slop, op7418/Humanizer-zh,
 * larashero3-dotcom/lieflat-less-ai-tone, their "+ dislop gate" pairings, and dislop Skill+CLI
 * across 30 deterministic revision & clean-preservation tasks (15 EN + 15 ZH).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSkillPackage,
  scoreSkillOutput,
  selectReferenceForTask,
  wilsonCI,
} from "./run_skill_benchmark.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DATASETS_DIR = path.join(REPO_ROOT, "benchmarks", "datasets");
const UPSTREAM_DIR = process.env.DISLOP_UPSTREAM_SKILLS_DIR || path.join(REPO_ROOT, ".tmp-upstream-skills");
const RESULTS_DIR = path.join(REPO_ROOT, "benchmarks", "results");

const DATASET_FILES = [
  "revision-v1.json",
  "revision-hard-v2.json",
  "skill-revision-ext-v1.json",
];

function assertLiveNetworkAllowed() {
  if (
    process.env.DISLOP_TEST_MODE === "1" ||
    process.env.ZX_TEST_MODE === "1" ||
    process.env.NODE_TEST_CONTEXT
  ) {
    throw new Error("Live network calls are blocked in test mode (DISLOP_TEST_MODE=1 / ZX_TEST_MODE=1).");
  }
}

function loadAllRevisionTasks() {
  const tasks = [];
  for (const fname of DATASET_FILES) {
    const raw = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, fname), "utf8"));
    for (const t of raw.tasks || []) {
      tasks.push({ ...t, sourceDataset: fname });
    }
  }
  return tasks;
}

function loadSkillMarkdownBody(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const fm = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (fm ? fm[1] : raw).trim();
}

function stripOutputWrapper(raw) {
  let s = String(raw || "").trim();
  const thinkEnd = s.lastIndexOf("</think>");
  if (thinkEnd !== -1) s = s.slice(thinkEnd + 8).trim();
  s = s.replace(/^```(?:json|html|markdown|md|xml)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return s;
}

function unwrapOoxmlCandidate(candidate, modality) {
  if ((modality !== "docx" && modality !== "pptx") || typeof candidate !== "string") return candidate;
  const trimmed = candidate.trim();
  if (!trimmed.startsWith("{")) return candidate;
  try {
    const obj = JSON.parse(trimmed);
    if (modality === "docx" && obj["word/document.xml"]) return obj["word/document.xml"];
    if (modality === "pptx" && Object.keys(obj).some((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))) {
      return obj;
    }
  } catch {}
  return candidate;
}

function buildTaskUserPrompt(task) {
  const srcStr = typeof task.source === "object" ? JSON.stringify(task.source) : String(task.source);
  const inst =
    task.instruction ||
    (task.lang === "zh"
      ? "请按要求审校并输出最终结果，保留全部原始事实、数字和限定词，只返回最终成品不要加解释。"
      : "Review and revise if needed while preserving all original facts, numbers, and qualifiers. Return ONLY the final output with no commentary.");
  return `Input (${task.filename}):\n${srcStr}\n\nTask:\n${inst}\n\nReturn ONLY the final deliverable with zero commentary.`;
}

function estimateUsd(spec, usage) {
  return (
    ((usage.promptTokens || 0) * spec.pricing.inputPer1M +
      (usage.completionTokens || 0) * spec.pricing.outputPer1M) /
    1_000_000
  );
}

async function callChat(spec, apiKey, messages, maxTokens = 16384) {
  assertLiveNetworkAllowed();
  const url = `${spec.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const t0 = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180_000);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: spec.id,
          temperature: 0.2,
          max_tokens: spec.thinking ? Math.max(maxTokens, 16384) : maxTokens,
          messages,
        }),
      });
      const rawBody = await resp.text();
      if ((resp.status === 429 || resp.status === 503 || resp.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${rawBody.slice(0, 200)}`);
      const data = JSON.parse(rawBody);
      const choice = data?.choices?.[0];
      return {
        text: stripOutputWrapper(choice?.message?.content || ""),
        finishReason: choice?.finish_reason || "stop",
        latencyMs: Math.round(performance.now() - t0),
        usage: {
          promptTokens: Number(data?.usage?.prompt_tokens || 0),
          completionTokens: Number(data?.usage?.completion_tokens || 0),
        },
      };
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("Chat call failed");
}

function loadModelSpec(modelId) {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "benchmarks", "models", "candidates.json"), "utf8"));
  const spec = (cfg.candidates || []).find((c) => c.id === modelId);
  if (!spec) throw new Error(`Unknown model id: ${modelId}`);
  return spec;
}

async function runWithConcurrency(items, concurrency, workerFn) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = idx;
      idx += 1;
      if (i >= items.length) break;
      results[i] = await workerFn(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function summarizeRecords(records) {
  const count = records.length;
  const noVetoCount = records.filter((r) => r.passedNoVeto).length;
  const allClearCount = records.filter((r) => r.allClear).length;
  const tasksWithFactDrift = records.filter((r) => (r.factIssues || []).length > 0).length;
  const totalCoreErrors = records.reduce((s, r) => s + Number(r.coreErrors || 0), 0);
  const totalStyleAndPatternHits = records.reduce(
    (s, r) => s + Number(r.styleFindings || 0) + Number(r.patternCount || 0),
    0
  );
  const preserveRows = records.filter((r) => r.kind === "preserve");
  const preserveOverEditFailures = preserveRows.filter((r) =>
    (r.vetoes || []).includes("V_OVEREDIT_CLEAN")
  ).length;
  const avgComposite = count
    ? Number((records.reduce((s, r) => s + Number(r.scores?.composite || 0), 0) / count).toFixed(1))
    : 0;
  const avgFactRetentionPct = count
    ? Number(((records.reduce((s, r) => s + Number(r.factRetentionRate || 0), 0) / count) * 100).toFixed(1))
    : 0;
  const ciNoVeto = wilsonCI(noVetoCount, count);
  return {
    count,
    noVetoCount,
    noVetoPct: Number(((noVetoCount / count) * 100).toFixed(1)),
    noVetoWilson95: [ciNoVeto.low, ciNoVeto.high],
    allClearCount,
    allClearPct: Number(((allClearCount / count) * 100).toFixed(1)),
    avgComposite,
    avgFactRetentionPct,
    tasksWithFactDrift,
    totalCoreErrors,
    totalStyleAndPatternHits,
    preserveCount: preserveRows.length,
    preserveOverEditFailures,
  };
}

function scoreTaskRecord(task, candidate, extra = {}) {
  const sc = scoreSkillOutput(task, candidate, { mode: "revision" });
  return {
    taskId: task.id,
    lang: task.lang,
    domain: task.domain,
    modality: task.modality || sc.modality,
    kind: task.kind || "revision",
    sourceDataset: task.sourceDataset,
    pass1FinishReason: extra.pass1FinishReason || "offline",
    repairFinishReason: extra.repairFinishReason || null,
    repaired: Boolean(extra.repaired),
    repairTriggered: Boolean(extra.repairTriggered),
    adoptedRepair: Boolean(extra.adoptedRepair),
    latencyMs: Number(extra.latencyMs || 0),
    usage: extra.usage || { promptTokens: 0, completionTokens: 0 },
    output: candidate,
    ...sc,
  };
}

async function evaluatePassWithOptionalRepair({
  spec,
  apiKey,
  task,
  sysPrompt,
  applyDislopGate,
  precomputedPass1 = null,
}) {
  const userContent = buildTaskUserPrompt(task);
  const messages = [
    { role: "system", content: sysPrompt },
    { role: "user", content: userContent },
  ];

  let p1 = precomputedPass1;
  if (!p1) {
    const res1 = await callChat(spec, apiKey, messages, 16384);
    const cand1 = unwrapOoxmlCandidate(res1.text, task.modality);
    p1 = {
      rawText: res1.text,
      candidate: cand1,
      finishReason: res1.finishReason,
      latencyMs: res1.latencyMs,
      usage: { ...res1.usage },
    };
  }

  let finalCand = p1.candidate;
  let totalUsage = { ...p1.usage };
  let totalMs = p1.latencyMs;
  let repairFinishReason = null;
  let repairTriggered = false;
  let adoptedRepair = false;

  if (applyDislopGate) {
    const sc1 = scoreSkillOutput(task, p1.candidate, { mode: "revision" });
    const cliRevFacts = sc1.factIssues.filter(
      (f) => f.startsWith("missing:") || f.startsWith("qDrop:") || f.startsWith("invented:")
    );
    if (sc1.detRuleIds.length > 0 || cliRevFacts.length > 0) {
      repairTriggered = true;
      const diag = [
        ...sc1.detRuleIds.map((r) => `rule:${r}`),
        ...cliRevFacts.map((f) => `fact:${f}`),
      ].join("; ");
      const repairMsg = [
        ...messages,
        { role: "assistant", content: p1.rawText },
        {
          role: "user",
          content:
            `Local dislop check reported: ${diag}.\n` +
            "Fix ONLY those issues while preserving every number, qualifier, and clean sentence intact. Return ONLY the final output with no commentary.",
        },
      ];
      const res2 = await callChat(spec, apiKey, repairMsg, 16384);
      repairFinishReason = res2.finishReason;
      totalUsage.promptTokens += res2.usage.promptTokens;
      totalUsage.completionTokens += res2.usage.completionTokens;
      totalMs += res2.latencyMs;
      const cand2 = unwrapOoxmlCandidate(res2.text, task.modality);
      const sc2 = scoreSkillOutput(task, cand2, { mode: "revision" });
      if (sc2.passedNoVeto && (!sc1.passedNoVeto || sc2.scores.composite >= sc1.scores.composite)) {
        finalCand = cand2;
        adoptedRepair = true;
      }
    }
  }

  const record = scoreTaskRecord(task, finalCand, {
    pass1FinishReason: p1.finishReason,
    repairFinishReason,
    repaired: adoptedRepair,
    repairTriggered,
    adoptedRepair,
    latencyMs: totalMs,
    usage: totalUsage,
  });

  return { record, p1 };
}

async function main() {
  const args = process.argv.slice(2);
  const offlineSmoke = args.includes("--offline-smoke");
  const live = args.includes("--live");
  const modelIdx = args.indexOf("--model");
  const modelId = modelIdx !== -1 && args[modelIdx + 1] ? args[modelIdx + 1] : "gemini-3.5-flash";
  const concIdx = args.indexOf("--concurrency");
  const concurrency = concIdx !== -1 && args[concIdx + 1] ? Number(args[concIdx + 1]) || 4 : 4;
  const maxUsdIdx = args.indexOf("--max-usd");
  const maxUsd = maxUsdIdx !== -1 && args[maxUsdIdx + 1] ? Number(args[maxUsdIdx + 1]) || 1.5 : 1.5;

  const allTasks = loadAllRevisionTasks();
  const enTasks = allTasks.filter((t) => t.lang === "en");
  const zhTasks = allTasks.filter((t) => t.lang === "zh");
  if (enTasks.length !== 15 || zhTasks.length !== 15) {
    throw new Error(`Expected 15 EN + 15 ZH tasks, got ${enTasks.length} EN + ${zhTasks.length} ZH`);
  }

  if (offlineSmoke || !live) {
    // Verify circuit breaker refuses network when DISLOP_TEST_MODE=1 or ZX_TEST_MODE=1
    let breakerTripped = false;
    try {
      assertLiveNetworkAllowed();
    } catch {
      breakerTripped = true;
    }
    const rawEn = enTasks.map((t) => scoreTaskRecord(t, t.source));
    const rawZh = zhTasks.map((t) => scoreTaskRecord(t, t.source));
    console.log(
      JSON.stringify(
        {
          mode: "offline-smoke",
          circuitBreakerTripped: breakerTripped,
          enCount: rawEn.length,
          zhCount: rawZh.length,
          enRawSummary: summarizeRecords(rawEn),
          zhRawSummary: summarizeRecords(rawZh),
        },
        null,
        2
      )
    );
    return;
  }

  assertLiveNetworkAllowed();
  const spec = loadModelSpec(modelId);
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is required to run live benchmark arms.");

  const upstreamManifest = JSON.parse(fs.readFileSync(path.join(UPSTREAM_DIR, "manifest.json"), "utf8"));
  const upstreamPrompts = {
    humanizer: loadSkillMarkdownBody(path.join(UPSTREAM_DIR, "humanizer", "SKILL.md")),
    "stop-slop": loadSkillMarkdownBody(path.join(UPSTREAM_DIR, "stop-slop", "SKILL.md")),
    "humanizer-zh": loadSkillMarkdownBody(path.join(UPSTREAM_DIR, "humanizer-zh", "SKILL.md")),
    lieflat: loadSkillMarkdownBody(path.join(UPSTREAM_DIR, "lieflat", "SKILL.md")),
  };
  const dislopSkillPkg = loadSkillPackage(path.join(REPO_ROOT, "skills", "dislop"));

  function buildDislopSysPrompt(task) {
    const selectedRef = selectReferenceForTask(dislopSkillPkg, task);
    const refContent = selectedRef ? dislopSkillPkg.refs[selectedRef] : "";
    return [
      `Follow the '${dislopSkillPkg.name}' skill instructions strictly:`,
      dislopSkillPkg.body,
      refContent ? `\n--- Loaded Reference (${selectedRef}) ---\n${refContent}` : "",
    ].join("\n\n");
  }

  let totalUsage = { promptTokens: 0, completionTokens: 0 };
  const trackUsage = (u) => {
    totalUsage.promptTokens += u?.promptTokens || 0;
    totalUsage.completionTokens += u?.completionTokens || 0;
    const spent = estimateUsd(spec, totalUsage);
    if (spent > maxUsd) {
      throw new Error(`Budget cap exceeded: $${spent.toFixed(4)} > $${maxUsd}`);
    }
  };

  console.log(`Running live ecosystem benchmark on ${spec.id} (15 EN + 15 ZH tasks)...`);

  const arms = {};
  arms["en::raw_source"] = enTasks.map((t) => scoreTaskRecord(t, t.source));
  arms["zh::raw_source"] = zhTasks.map((t) => scoreTaskRecord(t, t.source));

  // Helper to run pair: bare competitor + competitor_plus_dislop (reusing pass1)
  async function runCompetitorAndPaired(armBareKey, armPairedKey, tasks, sysPrompt) {
    console.log(`  Running ${armBareKey}...`);
    const pass1Pack = await runWithConcurrency(tasks, concurrency, async (t) => {
      const out = await evaluatePassWithOptionalRepair({
        spec,
        apiKey,
        task: t,
        sysPrompt,
        applyDislopGate: false,
      });
      trackUsage(out.record.usage);
      return out;
    });
    arms[armBareKey] = pass1Pack.map((x) => x.record);

    console.log(`  Running ${armPairedKey} (reusing pass-1 + deterministic gate)...`);
    const pairedOut = await runWithConcurrency(tasks, concurrency, async (t, i) => {
      const prevP1 = pass1Pack[i].p1;
      const out = await evaluatePassWithOptionalRepair({
        spec,
        apiKey,
        task: t,
        sysPrompt,
        applyDislopGate: true,
        precomputedPass1: {
          ...prevP1,
          usage: { promptTokens: 0, completionTokens: 0 },
          latencyMs: 0,
        },
      });
      trackUsage(out.record.usage);
      // Record total cumulative tokens/latency including pass1
      out.record.usage = {
        promptTokens: prevP1.usage.promptTokens + out.record.usage.promptTokens,
        completionTokens: prevP1.usage.completionTokens + out.record.usage.completionTokens,
      };
      out.record.latencyMs = prevP1.latencyMs + out.record.latencyMs;
      return out.record;
    });
    arms[armPairedKey] = pairedOut;
  }

  await runCompetitorAndPaired("en::humanizer", "en::humanizer_plus_dislop", enTasks, upstreamPrompts.humanizer);
  await runCompetitorAndPaired("en::stop_slop", "en::stop_slop_plus_dislop", enTasks, upstreamPrompts["stop-slop"]);
  await runCompetitorAndPaired("zh::humanizer_zh", "zh::humanizer_zh_plus_dislop", zhTasks, upstreamPrompts["humanizer-zh"]);
  await runCompetitorAndPaired("zh::lieflat", "zh::lieflat_plus_dislop", zhTasks, upstreamPrompts.lieflat);

  console.log("  Running en::dislop_skill_cli...");
  arms["en::dislop_skill_cli"] = await runWithConcurrency(enTasks, concurrency, async (t) => {
    const out = await evaluatePassWithOptionalRepair({
      spec,
      apiKey,
      task: t,
      sysPrompt: buildDislopSysPrompt(t),
      applyDislopGate: true,
    });
    trackUsage(out.record.usage);
    return out.record;
  });

  console.log("  Running zh::dislop_skill_cli...");
  arms["zh::dislop_skill_cli"] = await runWithConcurrency(zhTasks, concurrency, async (t) => {
    const out = await evaluatePassWithOptionalRepair({
      spec,
      apiKey,
      task: t,
      sysPrompt: buildDislopSysPrompt(t),
      applyDislopGate: true,
    });
    trackUsage(out.record.usage);
    return out.record;
  });

  const lengthTruncations = [];
  for (const [armKey, rows] of Object.entries(arms)) {
    for (const r of rows) {
      if (r.pass1FinishReason === "length" || r.repairFinishReason === "length") {
        lengthTruncations.push({ armKey, taskId: r.taskId, pass1FinishReason: r.pass1FinishReason, repairFinishReason: r.repairFinishReason });
      }
    }
  }

  const summary = {
    schema: "dislop.ecosystem-benchmark-summary/1",
    generatedAt: new Date().toISOString(),
    model: spec.id,
    estimatedUsd: Number(estimateUsd(spec, totalUsage).toFixed(5)),
    totalUsage,
    lengthTruncationCount: lengthTruncations.length,
    upstreamSkills: upstreamManifest.skills,
    byArm: Object.fromEntries(Object.entries(arms).map(([k, rows]) => [k, summarizeRecords(rows)])),
  };

  const rawPayload = {
    schema: "dislop.ecosystem-benchmark-raw/1",
    generatedAt: summary.generatedAt,
    model: spec.id,
    estimatedUsd: summary.estimatedUsd,
    totalUsage,
    lengthTruncations,
    upstreamSkills: upstreamManifest.skills,
    datasets: DATASET_FILES,
    arms,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const rawJson = JSON.stringify(rawPayload, null, 2) + "\n";
  const summaryJson = JSON.stringify(summary, null, 2) + "\n";
  fs.writeFileSync(path.join(RESULTS_DIR, "ecosystem-benchmark-raw.json"), rawJson, "utf8");
  fs.writeFileSync(path.join(RESULTS_DIR, "ecosystem-benchmark-summary.json"), summaryJson, "utf8");

  console.log("\n=== Ecosystem Benchmark Summary ===");
  console.log(`Model: ${spec.id} | Spend: $${summary.estimatedUsd} | Truncations: ${lengthTruncations.length}`);
  for (const [k, s] of Object.entries(summary.byArm)) {
    console.log(
      `  ${k.padEnd(28)} NoVeto=${s.noVetoCount}/${s.count} (${s.noVetoPct}%)  AllClear=${s.allClearCount}/${s.count} (${s.allClearPct}%)  Comp=${s.avgComposite}  FactDriftTasks=${s.tasksWithFactDrift}  CoreErr=${s.totalCoreErrors}  PreserveFail=${s.preserveOverEditFailures}/${s.preserveCount}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
