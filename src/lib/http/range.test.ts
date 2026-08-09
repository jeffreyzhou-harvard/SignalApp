import { describe, expect, it } from "vitest";
import { parseRangeHeader } from "./range";

describe("parseRangeHeader", () => {
  it("returns null without a header", () => {
    expect(parseRangeHeader(null, 100)).toBeNull();
  });

  it("parses a bounded range", () => {
    expect(parseRangeHeader("bytes=0-1023", 5000)).toEqual({ start: 0, end: 1023 });
  });

  it("clamps the end to the resource size", () => {
    expect(parseRangeHeader("bytes=0-9999", 100)).toEqual({ start: 0, end: 99 });
  });

  it("parses an open-ended range (Safari's probe)", () => {
    expect(parseRangeHeader("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
  });

  it("parses a suffix range", () => {
    expect(parseRangeHeader("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("flags a start beyond the resource as unsatisfiable", () => {
    expect(parseRangeHeader("bytes=100-", 100)).toBe("unsatisfiable");
  });

  it("ignores malformed and non-byte ranges", () => {
    expect(parseRangeHeader("bytes=abc-", 100)).toBeNull();
    expect(parseRangeHeader("items=0-5", 100)).toBeNull();
    expect(parseRangeHeader("bytes=5-2", 100)).toBeNull();
    expect(parseRangeHeader("bytes=-", 100)).toBeNull();
  });
});
