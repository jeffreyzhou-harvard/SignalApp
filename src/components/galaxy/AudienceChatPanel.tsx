"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { Markdown } from "@/components/chat/Markdown";

/**
 * The ephemeral "ask your audience" chat, docked beside the Audience Map. It
 * holds its transcript in local state only (nothing persisted) and streams
 * grounded answers from /api/audience-chat, optionally scoped to the niche the
 * founder is currently focused on in the map.
 */

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function AudienceChatPanel({
  focusCluster,
  onClose,
}: {
  focusCluster?: { id: string; label: string } | null;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const updated: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setInput("");
    setError(null);
    setStreaming(true);

    try {
      const res = await fetch("/api/audience-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, clusterId: focusCluster?.id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "The copilot couldn't reply.");
      }

      // Append a live assistant message, growing it as deltas stream in.
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: full };
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-line bg-surface max-md:w-full">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Ask your audience</h2>
        {focusCluster && (
          <span className="truncate rounded-full border border-line bg-raised px-2 py-0.5 text-xs text-muted">
            focused: {focusCluster.label}
          </span>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto rounded-lg border border-line p-1.5 text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming && (
          <p className="text-sm text-muted">
            Ask about your niches, who’s in them, and how to launch to them.
            {focusCluster ? ` Focused on “${focusCluster.label}.”` : ""}
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-raised px-3.5 py-2 text-sm text-fg">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="text-fg">
              <Markdown text={m.content} />
            </div>
          )
        )}
        {streaming && messages[messages.length - 1]?.role === "user" && (
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="thinking-dot block h-1.5 w-1.5 rounded-full bg-muted"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </span>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask your audience…"
            className="max-h-32 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-faint focus:border-line-strong"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-raised hover:text-fg disabled:opacity-50"
          >
            <Send size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </aside>
  );
}
