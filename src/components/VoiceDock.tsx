"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MessageSquare, X as XIcon } from "lucide-react";
import { RealtimeClient, type VoiceState } from "@/lib/voice/client";

/**
 * The copilot dock: a Siri-style orb with two equal input modes — voice and
 * text — riding one realtime session. Self-contained; mount anywhere.
 */
export function VoiceDock({ projectId }: { projectId?: string }) {
  const clientRef = useRef<RealtimeClient | null>(null);
  const [state, setState] = useState<VoiceState>({ status: "idle" });
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => () => clientRef.current?.disconnect(), []);

  async function ensureConnected(): Promise<RealtimeClient> {
    if (!clientRef.current) {
      const c = new RealtimeClient();
      c.onState = setState;
      clientRef.current = c;
      await c.connect(projectId);
    }
    return clientRef.current;
  }

  const live = state.status === "listening" || state.status === "speaking";

  async function start(m: "voice" | "text") {
    setMode(m);
    setOpen(true);
    const c = await ensureConnected();
    if (m === "voice") {
      try {
        await c.startMic();
      } catch {
        setMode("text"); // mic denied → text is a first-class mode, not a failure
      }
    } else {
      c.stopMic();
    }
  }

  function end() {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setState({ status: "idle" });
    setOpen(false);
  }

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const c = await ensureConnected();
    c.sendText(draft.trim());
    setDraft("");
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2">
      {open && (state.caption || state.userCaption) && (
        <div className="pointer-events-auto flex max-w-xl flex-col items-center gap-1.5 px-4">
          {state.userCaption && (
            <div className="rounded-2xl border border-line bg-raised/90 px-4 py-2 text-sm text-muted backdrop-blur">
              {state.userCaption}
            </div>
          )}
          {state.caption && (
            <div className="rounded-2xl border border-line bg-surface/90 px-4 py-2.5 text-sm text-fg shadow-lg backdrop-blur">
              {state.caption}
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-2">
        {open && mode === "text" && (
          <form onSubmit={submitText}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type to the copilot…"
              className="w-72 rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-fg outline-none placeholder:text-faint focus:border-line-strong"
            />
          </form>
        )}

        <button
          onClick={() => start("voice")}
          aria-label="Talk to the copilot"
          title="Talk to the copilot"
          className={[
            "relative grid h-14 w-14 place-items-center rounded-full border transition",
            state.status === "speaking"
              ? "animate-pulse border-accent/60 bg-accent/20 text-accent"
              : state.status === "listening" && mode === "voice"
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-line bg-surface text-muted hover:bg-raised hover:text-fg",
          ].join(" ")}
        >
          <Mic size={20} />
          {mode === "voice" && state.status === "listening" && (
            <span className="absolute inset-0 animate-ping rounded-full border border-accent/30" />
          )}
          {mode === "voice" && live && (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-ground bg-danger" />
          )}
        </button>

        <button
          onClick={() => start(mode === "text" ? "voice" : "text")}
          aria-label={mode === "text" ? "Switch to voice" : "Switch to text"}
          title={mode === "text" ? "Switch to voice" : "Switch to text"}
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-muted hover:bg-raised hover:text-fg"
        >
          {mode === "text" ? <Mic size={16} /> : <MessageSquare size={16} />}
        </button>

        {open && (
          <button
            onClick={end}
            aria-label="End copilot session"
            title="End copilot session"
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-muted hover:bg-raised hover:text-fg"
          >
            <XIcon size={16} />
          </button>
        )}
      </div>

      {open && (
        <span className="pointer-events-auto text-xs text-faint">
          {state.status === "error"
            ? `error — ${state.lastError}`
            : state.status === "listening" && mode === "voice"
              ? "listening — your mic is live"
              : state.status}
        </span>
      )}
    </div>
  );
}
