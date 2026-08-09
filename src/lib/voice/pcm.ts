// PCM16LE ⇄ Float32 ⇄ base64, isomorphic (browser atob/btoa vs Node Buffer).
// Chunked String.fromCharCode: spreading a whole mic buffer overflows the stack.

const toB64 = (bytes: Uint8Array): string => {
  if (typeof btoa !== "function") return Buffer.from(bytes).toString("base64");
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};

const fromB64 = (b64: string): Uint8Array =>
  typeof atob === "function"
    ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    : new Uint8Array(Buffer.from(b64, "base64"));

export function floatTo16BitPCMBase64(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return toB64(new Uint8Array(i16.buffer));
}

export function base64ToFloat32(b64: string): Float32Array<ArrayBuffer> {
  const bytes = fromB64(b64);
  const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / (i16[i] < 0 ? 0x8000 : 0x7fff);
  return f32;
}
