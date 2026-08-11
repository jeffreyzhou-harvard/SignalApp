/**
 * The private-beta gate, in one place so the middleware and the landing CTAs
 * can never disagree about whether the app is open.
 *
 * Fails safe: an explicit BETA_LOCK wins, but with the variable unset a
 * production deploy is LOCKED. Forgetting to set it on a new environment used
 * to publish the whole app — dashboard, project pages and every API route —
 * to anyone who found the URL. Local development stays open, which is what
 * you want while building.
 */
export function isBetaLocked(): boolean {
  const flag = process.env.BETA_LOCK;
  if (flag === "1") return true;
  if (flag === "0") return false;
  return process.env.NODE_ENV === "production";
}
