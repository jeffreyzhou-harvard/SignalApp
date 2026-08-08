import type { AccountProvider } from "./types";

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/** Local stub: validates an X handle and records it. Swap for x-oauth later. */
export const xStubAccount: AccountProvider = {
  id: "x-stub",
  label: "X (local)",

  async link({ handle }) {
    const clean = handle.trim().replace(/^@/, "");
    if (!HANDLE_RE.test(clean)) {
      throw new Error("That doesn't look like an X handle. Use 1–15 letters, numbers, or underscores.");
    }
    return { handle: clean, linkedAt: new Date().toISOString(), provider: xStubAccount.id };
  },
};
