import { afterEach, describe, expect, it, vi } from "vitest";
import { isBetaLocked } from "./beta";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isBetaLocked", () => {
  it("locks a production deploy when the flag was never set", () => {
    // The failure that mattered: an unset variable used to publish the whole
    // app — dashboard, project pages, every API route — to the public.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETA_LOCK", undefined);
    expect(isBetaLocked()).toBe(true);
  });

  it("leaves local development open", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BETA_LOCK", undefined);
    expect(isBetaLocked()).toBe(false);
  });

  it("honours an explicit flag over the environment", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BETA_LOCK", "1");
    expect(isBetaLocked()).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETA_LOCK", "0");
    expect(isBetaLocked()).toBe(false);
  });
});
