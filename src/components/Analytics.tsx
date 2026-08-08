"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path?: string; title?: string }) => void };
  }
}

/** Unset falls back to the project's own endpoint; set to "" to disable. */
const ENDPOINT =
  process.env.NEXT_PUBLIC_GOATCOUNTER_URL ??
  "https://adityabilawar.goatcounter.com/count";

/** Privacy-friendly unique-visitor counting (GoatCounter). No cookies, no PII. */
export function Analytics() {
  const pathname = usePathname();
  const isEntry = useRef(true);

  useEffect(() => {
    // count.js counts the entry page itself on load, so only the client-side
    // navigations after it need a manual hit — otherwise /dashboard and /p/[id]
    // would never be counted.
    if (isEntry.current) {
      isEntry.current = false;
      return;
    }
    window.goatcounter?.count?.({ path: pathname });
  }, [pathname]);

  if (!ENDPOINT) return null;

  return (
    <Script
      data-goatcounter={ENDPOINT}
      src="//gc.zgo.at/count.js"
      strategy="afterInteractive"
    />
  );
}
