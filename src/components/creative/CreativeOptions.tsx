"use client";

import { Check } from "lucide-react";
import { STYLE_PRESETS } from "@/lib/styles";

/**
 * Shared creative-tuning controls: style preset, aspect ratio, resolution.
 * The chat composer and the campaign brief both render this panel inside
 * their own popovers, so the two surfaces stay in sync.
 */

export const RATIO_OPTIONS = [
  { value: "auto", label: "Auto", hint: "Grok picks the best fit from your prompt" },
  { value: "1:1", label: "Square", hint: "Standard post image" },
  { value: "16:9", label: "Wide", hint: "Banner or link card" },
  { value: "3:2", label: "Landscape", hint: "Photo-style card" },
  { value: "2:3", label: "Poster", hint: "Portrait launch poster" },
  { value: "9:16", label: "Tall", hint: "Full-bleed vertical" },
];

export function RatioGlyph({ value, size = 15 }: { value: string; size?: number }) {
  if (value === "auto") {
    return (
      <span
        aria-hidden="true"
        className="block shrink-0 rounded-[3px] border border-dashed border-current"
        style={{ width: size, height: size }}
      />
    );
  }
  const [w, h] = value.split(":").map(Number);
  const scale = size / Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 rounded-[3px] border border-current"
      style={{ width: Math.max(6, w * scale), height: Math.max(6, h * scale) }}
    />
  );
}

export function CreativeOptionsPanel({
  mediaKind,
  style,
  onStyle,
  aspectRatio,
  onAspectRatio,
  resolution,
  onResolution,
}: {
  mediaKind: "image" | "video";
  style: string;
  onStyle: (id: string) => void;
  aspectRatio: string;
  /** Called on pick; the parent usually closes its popover here. */
  onAspectRatio: (value: string) => void;
  resolution: "1k" | "2k";
  onResolution: (res: "1k" | "2k") => void;
}) {
  return (
    <>
      <p className="px-2.5 pb-1 pt-1.5 text-xs uppercase tracking-wide text-faint">Style</p>
      <div className="flex flex-wrap gap-1 px-1.5 pb-1.5">
        {STYLE_PRESETS.map((s) => (
          <button
            key={s.id}
            onClick={() => onStyle(s.id)}
            aria-pressed={style === s.id}
            title={s.hint}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              style === s.id
                ? "border-line-strong bg-raised text-fg"
                : "border-line text-muted hover:border-line-strong hover:text-fg"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {mediaKind === "image" && (
        <>
          <p className="border-t border-line px-2.5 pb-1 pt-2 text-xs uppercase tracking-wide text-faint">
            Size
          </p>
          {RATIO_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => onAspectRatio(r.value)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-raised ${
                aspectRatio === r.value ? "bg-raised" : ""
              }`}
            >
              <span className="flex w-5 justify-center text-muted">
                <RatioGlyph value={r.value} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5 text-[13px] font-medium text-fg">
                  {r.label}
                  {r.value !== "auto" && <span className="font-mono text-xs text-faint">{r.value}</span>}
                </span>
                <span className="block text-xs text-faint">{r.hint}</span>
              </span>
              {aspectRatio === r.value && <Check size={14} strokeWidth={2.5} className="text-accent" />}
            </button>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-line px-2.5 pb-1 pt-2">
            <span className="text-xs text-muted">Resolution</span>
            <div className="flex items-center rounded-lg border border-line p-0.5">
              {(["1k", "2k"] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => onResolution(res)}
                  aria-pressed={resolution === res}
                  className={`rounded-md px-2 py-0.5 font-mono text-xs font-medium transition-colors ${
                    resolution === res ? "bg-raised text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
