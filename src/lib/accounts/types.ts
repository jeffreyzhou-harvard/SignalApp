import type { LinkedXAccount } from "../types";

/**
 * Pluggable account linking. The stub provider validates and stores a handle
 * locally; a real X OAuth 2.0 provider implements the same interface later
 * (kick off the flow in link(), finish it in a callback route) with no UI
 * changes.
 */
export interface AccountProvider {
  id: string;
  label: string;
  /** "local" links by typed handle; "redirect" sends the user through OAuth. */
  mode: "local" | "redirect";
  /** Route that starts a redirect flow; null for local providers. */
  startUrl: string | null;
  link(input: { handle: string }): Promise<LinkedXAccount>;
}
