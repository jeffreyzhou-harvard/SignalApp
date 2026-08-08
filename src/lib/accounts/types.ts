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
  link(input: { handle: string }): Promise<LinkedXAccount>;
}
