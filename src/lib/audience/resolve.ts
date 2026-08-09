/**
 * One rule for which audience a server route talks about. Without this, every
 * route fell back to settings.xAccount (often null), which let the backend
 * serve the most recently ACTIVATED run — and because cluster ids collide
 * across runs ("0", "1", …), a campaign targeting one audience's "AI Infra
 * Engineers" could silently tailor copy for another audience's cluster "0".
 *
 * Priority: explicit handle from the request > the workspace's audience-map
 * picker (settings.audienceHandle) > the default demo map. The linked X
 * account deliberately does NOT imply a map: most linked accounts have no
 * ingested audience, which used to mean "whatever run activated last".
 */

/** The audience map shown when nothing is picked. */
export const DEFAULT_AUDIENCE_HANDLE = process.env.DEFAULT_AUDIENCE_HANDLE || "ishand";

export function resolveAudienceHandle(
  settings: { audienceHandle?: string | null; xAccount?: { handle: string } | null },
  explicit?: string | null
): string | undefined {
  return explicit ?? settings.audienceHandle ?? DEFAULT_AUDIENCE_HANDLE;
}
