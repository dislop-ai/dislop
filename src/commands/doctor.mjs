import fs from "node:fs";
import { isInteractiveHumanTty, resolveLayeredConfig } from "../kernel/config.mjs";
import { listBuiltinPackIds } from "../kernel/pack-loader.mjs";
import { readInstalledModelsManifest } from "../runtime/providers/local-model.mjs";
import {
  loadCloudCredentials,
  resolveExecutionRoute,
  resolveTier2ProviderCandidate,
} from "../runtime/router.mjs";

/**
 * `dislop doctor [--json]` — zero-network diagnostic snapshot of config, active tier, auth, voice, and Packs.
 */
export async function runDoctorCommand(_positionals, flags, io = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
  } = io;

  const isTty = isInteractiveHumanTty({ stdin, stdout, env });
  const config = resolveLayeredConfig({ cwd, env, cliFlags: flags });
  const cloudCreds = loadCloudCredentials(config.credentialsPath);
  const tier2Candidate = resolveTier2ProviderCandidate(config, env);
  const modelsManifest = readInstalledModelsManifest(config.modelsDir);
  const builtinPacks = listBuiltinPackIds();

  // Resolve route non-interactively so `doctor` never triggers consent prompts
  const route = await resolveExecutionRoute({
    config,
    isTty: false,
    env,
    stdin,
    stderr: { write() {} },
  });

  const diagnosis = {
    schema: "dislop.doctor/1",
    nodeVersion: process.version,
    interactiveTty: isTty,
    routingMode: config.routing,
    activeEngine: route.engineLabel,
    activeTier: route.tier,
    configSources: config.loadedSources,
    approvedHosts: config.approvedHosts,
    cloudAuthenticated: Boolean(cloudCreds),
    byokCandidate: tier2Candidate
      ? {
          name: tier2Candidate.name,
          protocol: tier2Candidate.protocol,
          model: tier2Candidate.model,
          baseUrl: tier2Candidate.baseUrl,
          fromAmbientEnv: tier2Candidate.fromAmbientEnv,
        }
      : null,
    localModels: {
      activeModel: modelsManifest.activeModel,
      installed: Object.keys(modelsManifest.installed),
    },
    voiceCachePresent: Boolean(config.voice?.cachePath && fs.existsSync(config.voice.cachePath)),
    configuredPacks: config.packs || ["(auto by document format & language)"],
    builtinPacks,
  };

  if (flags.json || flags.format === "json") {
    stdout.write(`${JSON.stringify(diagnosis, null, 2)}\n`);
    return 0;
  }

  stdout.write("dislop doctor\n");
  stdout.write(`  Node.js          : ${diagnosis.nodeVersion}\n`);
  stdout.write(`  Interactive TTY  : ${diagnosis.interactiveTty ? "yes" : "no (read-only / batch safe)"}\n`);
  stdout.write(`  Routing Mode     : ${diagnosis.routingMode} -> active engine '${diagnosis.activeEngine}'\n`);
  stdout.write(
    `  Config Files     : ${diagnosis.configSources.length > 0 ? diagnosis.configSources.join(", ") : "(defaults only)"}\n`,
  );
  stdout.write(`  Cloud Tier 1     : ${diagnosis.cloudAuthenticated ? "authenticated" : "not logged in"}\n`);
  stdout.write(
    `  BYOK Tier 2      : ${
      diagnosis.byokCandidate
        ? `${diagnosis.byokCandidate.name} (${diagnosis.byokCandidate.protocol}:${diagnosis.byokCandidate.model})`
        : "not configured"
    }\n`,
  );
  stdout.write(
    `  Approved Hosts   : ${diagnosis.approvedHosts.length > 0 ? diagnosis.approvedHosts.join(", ") : "(none)"}\n`,
  );
  stdout.write(
    `  Local Tier 3     : ${
      diagnosis.localModels.installed.length > 0
        ? diagnosis.localModels.installed.join(", ")
        : "none installed (run 'dislop model pull')"
    }\n`,
  );
  stdout.write(`  Voice Profile    : ${diagnosis.voiceCachePresent ? "cached" : "not configured"}\n`);
  stdout.write(`  Built-in Packs   : ${diagnosis.builtinPacks.join(", ")}\n`);

  return 0;
}
