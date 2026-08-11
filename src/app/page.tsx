import { LandingPage } from "@/components/landing/LandingPage";
import { isBetaLocked } from "@/lib/beta";

/**
 * Landing. The beta version (waitlist only) and the open version (sign in with
 * X) both live in `LandingPage`; the beta gate picks which one ships, so
 * lifting the beta is a flag flip with nothing to rebuild.
 */
export default function Landing() {
  return <LandingPage mode={isBetaLocked() ? "beta" : "open"} />;
}
