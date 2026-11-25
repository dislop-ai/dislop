import { extractStructuredJson } from "../json-extract.mjs";

/**
 * Tier 2 Anthropic `/v1/messages` adapter.
 */
export async function invokeAnthropicProvider({
  provider,
  payload,
  timeoutMs = 60000,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = String(provider.baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
  const url = `${baseUrl}/messages`;
  const model = provider.model || "claude-3-5-haiku-latest";

  if (!provider.apiKey) {
    const err = new Error(`Anthropic provider '${provider.name}' is missing an API key`);
    err.authError = true;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: provider.maxOutputTokens || 4096,
        temperature: 0.1,
        system: payload.systemPrompt,
        messages: [{ role: "user", content: payload.userPrompt }],
      }),
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      const err = new Error(`Anthropic provider '${provider.name}' rejected API key (HTTP ${res.status})`);
      err.authError = true;
      throw err;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Anthropic provider '${provider.name}' HTTP ${res.status}: ${errText.slice(0, 240)}`);
    }

    const json = await res.json();
    const textBlocks = Array.isArray(json?.content)
      ? json.content.filter((b) => b.type === "text").map((b) => b.text)
      : [];
    const content = textBlocks.join("\n").trim();
    if (!content) {
      throw new Error(`Anthropic provider '${provider.name}' returned empty text content`);
    }
    return extractStructuredJson(content);
  } finally {
    clearTimeout(timer);
  }
}
