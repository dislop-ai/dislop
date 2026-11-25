import { extractStructuredJson } from "../json-extract.mjs";

export const DEFAULT_CLOUD_REVIEW_URL = "https://dislop.com/api/v1/review";

/**
 * Tier 1 Official Cloud adapter (`POST https://dislop.com/api/v1/review`).
 */
export async function invokeCloudProvider({
  credentials,
  payload,
  doc,
  promptRules,
  timeoutMs = 45000,
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  const endpoint = env.DISLOP_CLOUD_URL || credentials?.endpoint || DEFAULT_CLOUD_REVIEW_URL;
  const token = credentials?.accessToken || credentials?.token || credentials?.apiKey;
  if (!token) {
    const err = new Error("Missing Official Cloud token in credentials.json. Run 'dislop login'.");
    err.authError = true;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "dislop-cli/1.0.0",
      },
      body: JSON.stringify({
        schema: "dislop.review-request/1",
        file: doc.filePath,
        format: doc.format,
        language: doc.language,
        systemPrompt: payload.systemPrompt,
        userPrompt: payload.userPrompt,
        rules: promptRules,
      }),
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      const err = new Error(`Official Cloud authentication failed (HTTP ${res.status}). Run 'dislop login'.`);
      err.authError = true;
      throw err;
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`Official Cloud request failed (HTTP ${res.status}): ${bodyText.slice(0, 240)}`);
    }

    const data = await res.json();
    if (data && typeof data === "object" && Array.isArray(data.items)) {
      return data;
    }
    if (typeof data?.content === "string") {
      return extractStructuredJson(data.content);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
