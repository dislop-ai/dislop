#!/usr/bin/env node
// Zero-dependency IndexNow batch submission helper for dislop.com.
// Usage:
//   node scripts/ping_indexnow.mjs [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const INDEXNOW_KEY = "d1510ba4e8f74c92a6d38b1e5f0c7a49";
const HOST = "dislop.com";
const KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const keyPath = path.join(SITE_DIR, `${INDEXNOW_KEY}.txt`);
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Missing IndexNow verification key file: ${path.relative(ROOT, keyPath)} (run npm run build:site first)`);
  }
  const keyBody = fs.readFileSync(keyPath, "utf8").trim();
  if (keyBody !== INDEXNOW_KEY) {
    throw new Error(`IndexNow key file mismatch in ${path.relative(ROOT, keyPath)}`);
  }

  const sitemapPath = path.join(SITE_DIR, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) {
    throw new Error("Missing site/sitemap.xml (run npm run build:site first)");
  }
  const xml = fs.readFileSync(sitemapPath, "utf8");
  const urls = [...xml.matchAll(/<loc>(https:\/\/[^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (urls.length === 0) {
    throw new Error("No <loc> URLs found in site/sitemap.xml");
  }
  for (const url of urls) {
    if (!url.startsWith(`https://${HOST}/`)) {
      throw new Error(`Unexpected host URL in sitemap.xml: ${url}`);
    }
  }

  const payload = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  if (dryRun) {
    console.log(`[dry-run] IndexNow payload validated: host=${HOST}, keyLocation=${KEY_LOCATION}, urls=${urls.length}`);
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = (await res.text()).trim();
  console.log(`IndexNow response: HTTP ${res.status}${text ? ` — ${text}` : ""} (${urls.length} URLs submitted)`);
  if (res.status >= 400) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`IndexNow ping failed: ${err.message}`);
  process.exit(1);
});
