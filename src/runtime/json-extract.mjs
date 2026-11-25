/**
 * 3-stage structured output fallback & state-machine JSON sanitizer.
 * Handles reasoning model `<think>...</think>` blocks, Markdown code fences,
 * trailing commas, and unescaped literal control newlines inside JSON string values.
 */
export function extractStructuredJson(rawText) {
  const input = String(rawText ?? "").trim();
  if (!input) {
    throw new Error("Empty LLM response body");
  }

  // Strip `<think>...</think>` blocks emitted by reasoning models
  const stripped = input.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();

  // Stage 1: Direct JSON.parse
  try {
    return JSON.parse(stripped);
  } catch {
    // proceed to Stage 2
  }

  // Stage 2: Fenced ```json ... ``` or ``` ... ``` block
  const fenceRe = /```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n?```/g;
  let fm;
  while ((fm = fenceRe.exec(stripped)) !== null) {
    const candidate = fm[1].trim();
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(sanitizeJsonStringStateMachine(candidate));
      } catch {
        // continue scanning
      }
    }
  }

  // Stage 3: Balanced object/array state-machine scan + sanitizer
  const balanced = findFirstBalancedJsonContainer(stripped);
  if (balanced) {
    try {
      return JSON.parse(balanced);
    } catch {
      const sanitized = sanitizeJsonStringStateMachine(balanced);
      return JSON.parse(sanitized);
    }
  }

  throw new Error("Unable to extract valid JSON object from LLM response");
}

function findFirstBalancedJsonContainer(text) {
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) start = Math.min(firstBrace, firstBracket);
  else start = firstBrace !== -1 ? firstBrace : firstBracket;
  if (start === -1) return null;

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      stack.push("}");
    } else if (ch === "[") {
      stack.push("]");
    } else if (ch === "}" || ch === "]") {
      if (stack.length === 0) return null;
      const expected = stack.pop();
      if (ch !== expected) return null;
      if (stack.length === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function sanitizeJsonStringStateMachine(raw) {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === "\\") {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === "\n") {
        out += "\\n";
      } else if (ch === "\r") {
        // skip bare CR inside string
      } else if (ch === "\t") {
        out += "\\t";
      } else {
        out += ch;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    // Strip trailing commas before `}` or `]` outside strings
    if (ch === ",") {
      let lookahead = i + 1;
      while (lookahead < raw.length && /\s/.test(raw[lookahead])) lookahead += 1;
      if (raw[lookahead] === "}" || raw[lookahead] === "]") {
        continue;
      }
    }

    out += ch;
  }

  return out;
}
