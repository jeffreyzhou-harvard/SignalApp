import { afterEach, describe, expect, it } from "vitest";
import { isBetaLocked } from "./beta";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("isBetaLocked", () => {
  it("locks a production deploy when the flag was never set", () => {
    // The failure that mattered: an unset variable used to publish the whole
    // app — dashboard, project pages, every API route — to the public.
    process.env.NODE_ENV = "production";
    delete process.env.BETA_LOCK;
    expect(isBetaLocked()).toBe(true);
  });

  it("leaves local development open", () => {
    process.env.NODE_ENV = "development";
    delete process.env.BETA_LOCK;
    expect(isBetaLocked()).toBe(false);
  });

  it("honours an explicit flag over the environment", () => {
    process.env.NODE_ENV = "development";
    process.env.BETA_LOCK = "1";
    expect(isBetaLocked()).toBe(true);
    process.env.NODE_ENV = "production";
    process.env.BETA_LOCK = "0";
    expect(isBetaLocked()).toBe(false);
  });
});
