import { describe, it, expect } from "vitest";
import { floatTo16BitPCMBase64, base64ToFloat32 } from "./pcm";

describe("pcm round trip", () => {
  it("survives encode → decode within int16 quantization error", () => {
    const src = new Float32Array([0, 0.5, -0.5, 1, -1, 0.001]);
    const out = base64ToFloat32(floatTo16BitPCMBase64(src));
    expect(out.length).toBe(src.length);
    for (let i = 0; i < src.length; i++) expect(Math.abs(out[i] - src[i])).toBeLessThan(1 / 32000);
  });

  it("clamps out-of-range samples instead of wrapping", () => {
    const out = base64ToFloat32(floatTo16BitPCMBase64(new Float32Array([2, -2])));
    expect(out[0]).toBeCloseTo(1, 3);
    expect(out[1]).toBeCloseTo(-1, 2);
  });

  it("handles large buffers without call-stack overflow", () => {
    const big = new Float32Array(48000).fill(0.25);
    const out = base64ToFloat32(floatTo16BitPCMBase64(big));
    expect(out.length).toBe(48000);
    expect(out[47999]).toBeCloseTo(0.25, 3);
  });
});
