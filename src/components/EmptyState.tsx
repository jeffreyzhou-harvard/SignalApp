"use client";

import { Plus } from "lucide-react";

/** Wind-tunnel empty state: streamlines flowing past the node cluster. */
export function EmptyState({ onNewProject }: { onNewProject: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
      <svg
        viewBox="0 0 420 160"
        className="mb-8 w-[340px] max-w-full text-line-strong"
        aria-hidden="true"
      >
        {[
          { d: "M0 30 C 120 30, 150 18, 420 22", delay: "0s" },
          { d: "M0 65 C 110 65, 170 52, 420 58", delay: "0.12s" },
          { d: "M0 100 C 120 100, 160 112, 420 104", delay: "0.24s" },
          { d: "M0 135 C 110 135, 150 146, 420 140", delay: "0.36s" },
        ].map((line) => (
          <path
            key={line.d}
            d={line.d}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="streamline"
            style={{ animationDelay: line.delay }}
          />
        ))}
        <g className="text-muted" fill="currentColor">
          <circle cx="292" cy="58" r="10" />
          <circle cx="330" cy="98" r="13" />
          <circle cx="262" cy="102" r="8" />
          <g stroke="currentColor" strokeWidth="4">
            <path d="M292 58 L330 98" />
            <path d="M330 98 L262 102" />
            <path d="M262 102 L292 58" />
          </g>
        </g>
      </svg>

      <h2 className="text-xl font-semibold tracking-tight">Every launch starts in the tunnel</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
        A project is one campaign: your brief, product shots, the copilot conversation, and the
        posts and posters it produces for each niche of your audience.
      </p>
      <button
        onClick={onNewProject}
        className="mt-7 flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-ground transition-transform hover:scale-[1.03] active:scale-[0.98]"
      >
        <Plus size={16} strokeWidth={2.5} />
        New project
      </button>
    </div>
  );
}
