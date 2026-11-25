import { extractStructuredJson } from "../json-extract.mjs";

function isReasoningModel(model) {
  return /^(?:o1|o3|o4|gpt-[5-9])\b|deepseek-reasoner|\breasoner\b/i.test(String(model || ""));
}

/**
 * Tier 2 OpenAI-compatible `/v1/chat/completions` adapter
 * (covers OpenAI, OpenRouter, DeepSeek, CLIProxyAPI/Responses bridges, Ollama, vLLM, LM Studio).
 */
export async function invokeOpenAiCompatProvider({
  provider,
  payload,
  timeoutMs = 60000,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = String(provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const model = provider.model || "gpt-4o-mini";
  const modePref = provider.structuredOutput || "json_object";

  const modeFallbacks =
    modePref === "json_schema"
      ? ["json_schema", "json_object", "none"]
      : modePref === "json_object"
        ? ["json_object", "none"]
        : ["none"];

  let omitTemperature = isReasoningModel(model);
  let useInputField = provider.payloadStyle === "input";
  let lastErr = null;

  for (let i = 0; i < modeFallbacks.length; i += 1) {
    const mode = modeFallbacks[i];
    const body = useInputField
      ? {
          model,
          input: `${payload.systemPrompt}\n\n${payload.userPrompt}`,
        }
      : {
          model,
          messages: [
            { role: "system", content: payload.systemPrompt },
            { role: "user", content: payload.userPrompt },
          ],
        };

    if (!omitTemperature) {
      body.temperature = 0.1;
    }

    if (!useInputField) {
      if (mode === "json_schema" && payload.jsonSchema) {
        body.response_format = {
          type: "json_schema",
          json_schema: payload.jsonSchema,
        };
      } else if (mode === "json_object") {
        body.response_format = { type: "json_object" };
      }
    }

    const headers = {
      "Content-Type": "application/json",
    };
    if (provider.apiKey) {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res;
      try {
        res = await fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (netErr) {
        throw new Error(
          `Unable to reach provider '${provider.name}' at ${url} (${netErr?.cause?.code || netErr.message})`,
        );
      }

      if (res.status === 401 || res.status === 403) {
        const err = new Error(`Provider '${provider.name}' rejected API key (HTTP ${res.status})`);
        err.authError = true;
        throw err;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 400 || res.status === 422) {
          // If proxy rejects `temperature`, strip it and retry the same structured-output mode
          if (!omitTemperature && /temperature/i.test(errText)) {
            omitTemperature = true;
            i -= 1;
            continue;
          }
          // If proxy expects `"input"` instead of `"messages"` (Responses-style bridge), switch & retry
          if (!useInputField && /\binput\b/i.test(errText) && /\bmessages\b|required|missing/i.test(errText)) {
            useInputField = true;
            i -= 1;
            continue;
          }
          if (mode !== "none") {
            lastErr = new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
            continue;
          }
        }
        throw new Error(`Provider '${provider.name}' HTTP ${res.status}: ${errText.slice(0, 240)}`);
      }

      const json = await res.json();
      const content =
        json?.choices?.[0]?.message?.content ??
        (typeof json?.output_text === "string" ? json.output_text : null);
      if (typeof content !== "string" || !content.trim()) {
        throw new Error(`Provider '${provider.name}' returned empty completion content`);
      }
      return extractStructuredJson(content);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr || new Error(`Provider '${provider.name}' failed structured output negotiation`);
}
