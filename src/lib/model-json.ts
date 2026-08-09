/**
 * Parse a JSON object out of raw model output. Grok is asked for strict JSON
 * but multi-line launch copy often comes back with real newlines inside the
 * string literals, which JSON.parse rejects ("Bad control character"). This
 * extracts the outermost {...} and, if strict parsing fails, escapes control
 * characters found inside strings before retrying.
 */
export function parseModelJson<T = unknown>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const raw = match[0];
  try {
    return JSON.parse(raw) as T;
  } catch {
    let out = "";
    let inString = false;
    let escaped = false;
    for (const ch of raw) {
      if (!inString) {
        if (ch === '"') inString = true;
        out += ch;
        continue;
      }
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out +=
          code === 10 ? "\\n" : code === 13 ? "\\r" : code === 9 ? "\\t" : `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
      out += ch;
    }
    try {
      return JSON.parse(out) as T;
    } catch {
      return null;
    }
  }
}
