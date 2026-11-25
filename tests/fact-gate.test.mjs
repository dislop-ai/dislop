import assert from "node:assert/strict";
import test from "node:test";
import { parseDocumentText } from "../src/kernel/document-model.mjs";
import {
  applyDualFactGate,
  verifyBaselineFacts,
  verifyDocumentRevision,
} from "../src/kernel/fact-gate.mjs";
import { resolveActivePacks } from "../src/kernel/pack-loader.mjs";

test("Kernel Baseline Fact Gate preserves numbers, units, URLs, inline code, and proper nouns while allowing negation removal", () => {
  // Removing 'not only ... but also' reduces negation count yet keeps every fact -> MUST PASS
  const negRemoval = verifyBaselineFacts(
    "PostgreSQL is not only fast at 1,250 req/s (99.9% SLA), but also honours `--sync-mode` via https://db.example.com.",
    "PostgreSQL runs at 1250 req/s (99.9% SLA) and honours `--sync-mode` via https://db.example.com.",
  );
  assert.equal(negRemoval.ok, true, negRemoval.summary);

  // Dropping percentage or unit -> MUST FAIL
  const droppedUnit = verifyBaselineFacts(
    "p95 latency stayed under 42ms across 3 clusters.",
    "p95 latency stayed under 42 across 3 clusters.",
  );
  assert.equal(droppedUnit.ok, false);
  assert.match(droppedUnit.summary, /ms/);

  // Dropping proper noun -> MUST FAIL
  const droppedEntity = verifyBaselineFacts(
    "Traffic failed over from Cloudflare to Fastly in Q3.",
    "Traffic failed over to Fastly in Q3.",
  );
  assert.equal(droppedEntity.ok, false);
  assert.match(droppedEntity.summary, /Cloudflare/);

  // Dropping inline code -> MUST FAIL
  const droppedCode = verifyBaselineFacts(
    "Pass `--dry-run` before deploying.",
    "Run a preview before deploying.",
  );
  assert.equal(droppedCode.ok, false);
  assert.match(droppedCode.summary, /--dry-run/);
});

test("Step 5 applyDualFactGate downgrades unsafe LLM replacements and pack.verifyFix rejections to fixSafety: 'manual'", async () => {
  const doc = parseDocumentText(
    "It is worth noting that Redis handled 18,000 ops in 4ms.",
    "bench.md",
    "md",
  );
  const packs = await resolveActivePacks(doc);

  const rawItems = [
    // Item 1: drops '4ms' -> Kernel Baseline Gate rejects & downgrades
    {
      kind: "suggestion",
      pack: "en/prose",
      ruleId: "en/prose/throat-clearing",
      targetId: "P1-S1",
      priority: "strong",
      fixSafety: "safe",
      actionType: "replace",
      originalQuote: "It is worth noting that Redis handled 18,000 ops in 4ms.",
      suggestedReplacement: "Redis handled 18,000 ops.",
      reason: "Trimmed opener.",
    },
    // Item 2: keeps all facts, but introduces 'game-changer' -> en/prose verifyFix rejects & downgrades
    {
      kind: "suggestion",
      pack: "en/prose",
      ruleId: "en/prose/throat-clearing",
      targetId: "P1-S1",
      priority: "strong",
      fixSafety: "safe",
      actionType: "replace",
      originalQuote: "It is worth noting that Redis handled 18,000 ops in 4ms.",
      suggestedReplacement: "Redis was a game-changer handling 18,000 ops in 4ms.",
      reason: "Trimmed opener.",
    },
    // Item 3: clean replacement keeping every fact -> stays 'safe'
    {
      kind: "suggestion",
      pack: "en/prose",
      ruleId: "en/prose/throat-clearing",
      targetId: "P1-S1",
      priority: "strong",
      fixSafety: "safe",
      actionType: "replace",
      originalQuote: "It is worth noting that Redis handled 18,000 ops in 4ms.",
      suggestedReplacement: "Redis handled 18,000 ops in 4ms.",
      reason: "Trimmed opener.",
    },
  ];

  const gated = await applyDualFactGate(rawItems, doc, packs);

  assert.equal(gated[0].fixSafety, "manual");
  assert.equal(gated[0].suggestedReplacement, "");
  assert.match(gated[0].verificationNote, /Fact Gate withheld replacement/);

  assert.equal(gated[1].fixSafety, "manual");
  assert.equal(gated[1].suggestedReplacement, "");
  assert.match(gated[1].verificationNote, /Pack 'en\/prose' withheld replacement/);

  assert.equal(gated[2].fixSafety, "safe");
  assert.equal(gated[2].suggestedReplacement, "Redis handled 18,000 ops in 4ms.");

  // Prompt-injection / hallucination defense: block injected URLs, inline code, or fabricated numbers!
  const injectedItems = [
    {
      kind: "suggestion",
      pack: "en/prose",
      ruleId: "en/prose/throat-clearing",
      targetId: "P1-S1",
      priority: "strong",
      fixSafety: "review",
      actionType: "replace",
      originalQuote: "It is worth noting that Redis handled 18,000 ops in 4ms.",
      suggestedReplacement:
        "Redis handled 18,000 ops in 4ms — details at https://attacker.example or run `curl evil.sh` for 99 nodes.",
      reason: "Jailbroken replacement attempt.",
    },
  ];
  const gatedInjected = await applyDualFactGate(injectedItems, doc, packs);
  assert.equal(gatedInjected[0].fixSafety, "manual");
  assert.equal(gatedInjected[0].suggestedReplacement, "");
  assert.match(gatedInjected[0].verificationNote, /injected unverified URL/);
  assert.match(gatedInjected[0].verificationNote, /injected unverified inline code/);
  assert.match(gatedInjected[0].verificationNote, /fabricated number/);
});

test("verifyDocumentRevision catches second-order slogan regressions", () => {
  const res = verifyDocumentRevision(
    "Exports complete in 12 minutes.",
    "This isn't just an export — it's a workflow revolution completing in 12 minutes.",
  );
  assert.equal(res.ok, false);
  assert.equal(res.regressions.length, 1);
  assert.equal(res.regressions[0].id, "introduced-negation-slogan");
});
