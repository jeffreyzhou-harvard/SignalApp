/** Parse an HTTP Range header against a resource size (RFC 9110 §14.1).
 * Only single byte ranges are supported (all browsers request one range for
 * media). Returns null for absent/malformed/other-unit ranges (serve full
 * body with 200) and "unsatisfiable" when the range is beyond the resource
 * (respond 416). */
export type ByteRange = { start: number; end: number };

export function parseRangeHeader(
  header: string | null,
  size: number,
): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;

  if (m[1] === "") {
    // Suffix range: last N bytes.
    const suffix = Number(m[2]);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(m[1]);
  if (start >= size) return "unsatisfiable";
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (end < start) return null;
  return { start, end };
}
