"use client";

import type { CampaignVariant } from "@/lib/simulation/types";

/*
 * An X-style draft post, following the stage demo's TweetCard
 * (demo/src/components/TweetCard.tsx) in AgentSim's own skin.
 * Action icons are X's canonical glyph paths.
 */

const Icon = {
  reply: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z" />
    </svg>
  ),
  repost: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
    </svg>
  ),
  like: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z" />
    </svg>
  ),
  views: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z" />
    </svg>
  ),
  bookmark: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z" />
    </svg>
  ),
};

export function PostCard({
  variant,
  handle,
  name,
  label,
}: {
  variant: CampaignVariant;
  handle: string | null;
  name: string | null;
  /** Small chip above the post, e.g. "Current draft" or "Tailored for Students". */
  label?: string;
}) {
  const displayName = name ?? (handle ? `@${handle}` : "Your account");
  return (
    <div>
      {label && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-faint">
          <span
            className="flex h-4 w-4 items-center justify-center rounded text-xs font-bold text-ground"
            style={{ background: variant.id === "A" ? "#ffb02e" : "#2fd6f6" }}
          >
            {variant.id}
          </span>
          {label}
        </p>
      )}
      <article className="rounded-xl border border-line bg-surface px-4 py-3.5">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-base font-semibold text-accent">
            {displayName.replace("@", "").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-sm font-semibold">
              {displayName}
              <svg viewBox="0 0 22 22" width="15" height="15" fill="var(--color-accent)" aria-label="Verified">
                <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
              </svg>
            </p>
            <p className="truncate text-xs text-faint">{handle ? `@${handle}` : "not linked"} · draft</p>
          </div>
        </header>

        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{variant.copy}</p>

        {variant.mediaUrl && (
          <div className="mt-3 overflow-hidden rounded-lg border border-line">
            {variant.mediaKind === "video" ? (
              <video src={variant.mediaUrl} muted loop autoPlay playsInline className="max-h-80 w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={variant.mediaUrl} alt="" className="max-h-80 w-full object-cover" />
            )}
          </div>
        )}

        <footer className="mt-3 flex items-center justify-between pr-6 text-faint">
          <span className="flex items-center gap-1 text-xs">{Icon.reply} —</span>
          <span className="flex items-center gap-1 text-xs">{Icon.repost} —</span>
          <span className="flex items-center gap-1 text-xs">{Icon.like} —</span>
          <span className="flex items-center gap-1 text-xs">{Icon.views} —</span>
          <span className="flex items-center gap-1 text-xs">{Icon.bookmark}</span>
        </footer>
      </article>
    </div>
  );
}
