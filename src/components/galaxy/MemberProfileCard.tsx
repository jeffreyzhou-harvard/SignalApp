"use client";

import { useEffect } from "react";
import { BadgeCheck, ExternalLink, Heart, MapPin, MessageCircle, Quote, Repeat2, X } from "lucide-react";
import type { AudienceCluster, AudienceMember, MemberProfile } from "@/lib/audience/types";
import { XLogo } from "../XLogo";

/**
 * Full-screen profile card for one audience member: everything the pipeline
 * stores (persona card, metrics, engagement with you, sample posts), plus a
 * link out to their X profile. Fields render only when present, so the card
 * degrades cleanly on sample data.
 */

const compact = (n: number | null | undefined): string | null => {
  if (n === null || n === undefined) return null;
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
};

/**
 * How this member ended up in this niche, stated honestly.
 *
 * Deep-profiled members were clustered directly from their own posts, so they
 * define the niche rather than being scored against it. Bio-assigned members
 * carry a distance ratio (runner-up niche ÷ chosen niche, so >= 1): 1.0 means
 * two niches fit equally well, higher means the chosen one is clearly closer.
 * `1 - 1/ratio` turns that into the share of the gap the winner actually won,
 * which is the number a marketer should see before trusting the placement.
 */
function nicheFit(p: MemberProfile | null | undefined): string {
  if (p?.enrichmentTier === 2) {
    return p?.periphery
      ? "Clustered from their own posts · sits on this niche's edge"
      : "Clustered from their own posts · core member";
  }
  const ratio = p?.confidence ?? null;
  if (ratio === null || !Number.isFinite(ratio)) return "Placed by bio similarity";
  const margin = Math.max(0, Math.min(0.99, 1 - 1 / Math.max(ratio, 1)));
  const strength = margin >= 0.3 ? "clear" : margin >= 0.12 ? "likely" : "narrow";
  return `Placed by bio similarity · ${strength} match (${(margin * 100).toFixed(0)}% ahead of the next niche)`;
}

function Stat({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-line bg-raised/50 px-4 py-2.5">
      <span className="font-mono text-[15px] font-semibold text-fg">{value}</span>
      <span className="text-xs uppercase tracking-wide text-faint">{label}</span>
    </div>
  );
}

function Chips({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wide text-faint">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span
            key={it}
            className="rounded-full border border-line bg-raised/60 px-2.5 py-1 text-xs font-medium text-muted"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MemberProfileCard({
  member,
  cluster,
  onClose,
}: {
  member: AudienceMember;
  cluster: AudienceCluster | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = member.profile;
  const card = p?.card;
  const xUrl = p?.profileUrl ?? `https://x.com/${member.handle.replace(/^@/, "")}`;
  const engagement = [
    { icon: <Heart size={13} strokeWidth={2} />, label: "likes", n: p?.seedEngagement?.likes },
    { icon: <Repeat2 size={13} strokeWidth={2} />, label: "reposts", n: p?.seedEngagement?.reposts },
    { icon: <MessageCircle size={13} strokeWidth={2} />, label: "replies", n: p?.seedEngagement?.replies },
  ].filter((e) => (e.n ?? 0) > 0);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-ground/70 p-4 backdrop-blur-sm max-md:p-2"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Profile of ${member.name}`}
    >
      <div
        className="rise-in flex max-h-[88%] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Identity ─────────────────────────────────────────── */}
        <header className="flex items-start gap-4 border-b border-line px-6 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={member.avatar}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full border-2 object-cover"
            style={{ borderColor: cluster?.color ?? "var(--color-line-strong)" }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-lg font-semibold tracking-tight">{member.name}</h2>
              {p?.verified && <BadgeCheck size={16} strokeWidth={2} className="shrink-0 text-accent" />}
            </div>
            <a
              href={xUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-muted hover:text-accent hover:underline"
            >
              {member.handle}
            </a>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
              {cluster && (
                <span className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-medium text-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: cluster.color }} />
                  {cluster.label}
                </span>
              )}
              {p?.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} strokeWidth={2} />
                  {p.location}
                </span>
              )}
              {p?.relationship && <span className="capitalize">{p.relationship}</span>}
              {(p?.accountAgeDays ?? null) !== null && <span>{p!.accountAgeDays} days on X</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={xUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-fg px-3.5 py-1.5 text-[13px] font-semibold text-ground transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              <XLogo size={11} className="text-ground" />
              View on X
              <ExternalLink size={11} strokeWidth={2.5} />
            </a>
            <button
              onClick={onClose}
              aria-label="Close profile"
              className="rounded-lg border border-line p-1.5 text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* ── Everything we store ──────────────────────────────── */}
        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          {member.bio && <p className="text-sm leading-6 text-fg">{member.bio}</p>}

          <div className="grid grid-cols-4 gap-2 max-md:grid-cols-2">
            <Stat label="Followers" value={compact(p?.metrics?.followers)} />
            <Stat label="Following" value={compact(p?.metrics?.following)} />
            <Stat label="Posts" value={compact(p?.metrics?.tweets)} />
            <Stat label="Listed" value={compact(p?.metrics?.listed)} />
          </div>

          {engagement.length > 0 && (
            <div className="flex items-center gap-4 rounded-xl border border-line bg-raised/40 px-4 py-2.5">
              <span className="text-xs uppercase tracking-wide text-faint">With your posts</span>
              {engagement.map((e) => (
                <span key={e.label} className="flex items-center gap-1.5 text-[13px] text-muted">
                  {e.icon}
                  <span className="font-mono font-semibold text-fg">{e.n}</span> {e.label}
                </span>
              ))}
            </div>
          )}

          {card && (
            <div className="flex flex-col gap-4 rounded-xl border border-line bg-ground/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {card.archetype && (
                  <span className="rounded-full bg-fg px-3 py-1 text-xs font-bold text-ground">
                    {card.archetype}
                  </span>
                )}
                {card.toneAffinity && <span className="text-xs text-faint">{card.toneAffinity}</span>}
                {p?.enrichmentTier === 2 && (
                  <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-xs text-faint">
                    Deep persona
                  </span>
                )}
              </div>
              {card.oneLiner && <p className="text-sm font-medium leading-6">{card.oneLiner}</p>}
              {card.summary && <p className="text-[13px] leading-6 text-muted">{card.summary}</p>}
              <Chips title="Interests" items={card.interests} />
              <Chips title="What converts them" items={card.conversionLevers} />
              <Chips title="Formats they engage with" items={card.preferredFormats} />
            </div>
          )}

          {(p?.samplePosts?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-wide text-faint">Recent posts</p>
              <div className="flex flex-col gap-2">
                {p!.samplePosts!.map((text) => (
                  <blockquote
                    key={text}
                    className="flex items-start gap-2.5 rounded-xl border border-line bg-raised/40 px-3.5 py-2.5"
                  >
                    <Quote size={12} strokeWidth={2} className="mt-1 shrink-0 text-faint" />
                    <p className="text-[13px] leading-5 text-muted">{text}</p>
                  </blockquote>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-faint">{nicheFit(p)}</p>
        </div>
      </div>
    </div>
  );
}
