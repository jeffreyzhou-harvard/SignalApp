import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Signal",
  description:
    "Your followers' bios, posts, and engagement — embedded into constellations. One launch, engagement-tuned for every niche.",
  icons: { icon: "/Signal.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <span
          hidden
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: A launch studio's flight deck — each project is a wind-tunnel run for a launch on X. Refuses the SaaS dashboard of stat cards and the generic chatbot shell; the file-browser grid and the copilot chat are the product.
OWN-WORLD: layered near-blacks (#08090a ground, #0e0f11 surface, #16181b raised) under hairline #212428 borders; crisp white type (Geist); white pill primary actions in the Grok idiom; one signal blue #4da3ff reserved for identity, links, focus, and the X account; masked Signal mark in currentColor; drifting streamline motif for empty air.
STORY: a founder lands on their runs, links their X account once (bottom of the rail), titles a new run, and is dropped straight into a copilot chat where the brief + product shots become posts and Imagine posters.
FIRST VIEWPORT: fixed left rail (mark, nav, X account + settings pinned to the bottom); content column with title row and "New project" white pill top right; thumbnail grid of runs — or the authored wind-tunnel empty state.
FORM: brief-pinned by the user (Figma drafts browser structure, dark Grok-native skin); no seed roll — pinned direction beats the roll.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
-->`,
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
