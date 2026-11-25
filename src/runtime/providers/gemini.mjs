import { extractStructuredJson } from "../json-extract.mjs";

/**
 * Tier 2 Google Gemini `:generateContent` adapter.
 */
export async function invokeGeminiProvider({
  provider,
  payload,
  timeoutMs = 60000,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = String(
    provider.baseUrl || "https://generativelanguage.googleapis.com/v1beta",
  ).replace(/\/+$/, "");
  const model = String(provider.model || "gemini-2.5-flash").replace(/^models\//, "");

  if (!provider.apiKey) {
    const err = new Error(`Gemini provider '${provider.name}' is missing an API key`);
    err.authError = true;
    throw err;
  }

  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": provider.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: payload.systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: payload.userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      const err = new Error(`Gemini provider '${provider.name}' rejected API key (HTTP ${res.status})`);
      err.authError = true;
      throw err;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini provider '${provider.name}' HTTP ${res.status}: ${errText.slice(0, 240)}`);
    }

    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const content = parts
      .map((p) => p.text || "")
      .join("\n")
      .trim();
    if (!content) {
      throw new Error(`Gemini provider '${provider.name}' returned empty candidate parts`);
    }
    return extractStructuredJson(content);
  } finally {
    clearTimeout(timer);
  }
}
