"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ImagePlus,
  Pencil,
  Wand2,
  X,
} from "lucide-react";
import type { AppSettings, ChatMessage, Project } from "@/lib/types";
import { XLogo } from "../XLogo";
import { SettingsDialog } from "../SettingsDialog";
import { Markdown } from "./Markdown";

interface Attachment {
  url: string;
  name: string;
}

const BRIEF_STARTERS = [
  {
    label: "Brief the launch",
    text: "Here's what I'm launching — help me sharpen the positioning and draft the announcement post for X.",
  },
  {
    label: "Find my tribes",
    text: "Who are the likely tribes in my audience for this launch, and how should the message differ for each?",
  },
  {
    label: "Poster concept",
    text: "/imagine a bold launch poster: dark background, product name in crisp type, electric momentum",
  },
];

export function ChatRoom({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imagineMode, setImagineMode] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = streamingText !== null || rendering;

  useEffect(() => {
    (async () => {
      setLoadError(false);
      try {
        const [pRes, s, m] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch("/api/settings").then((r) => r.json()),
          fetch(`/api/projects/${projectId}/messages`).then((r) => r.json()),
        ]);
        if (pRes.status === 404) {
          setNotFound(true);
          return;
        }
        if (!pRes.ok) throw new Error("load failed");
        setProject(await pRes.json());
        setSettings(s);
        setMessages(m);
        setLoaded(true);
      } catch {
        setLoadError(true);
      }
    })();
  }, [projectId, loadAttempt]);

  const scrollToBottom = useCallback(() => {
    const toBottom = () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    requestAnimationFrame(toBottom);
    // Images in the transcript report their height late; settle once more after they land.
    const t = setTimeout(toBottom, 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(scrollToBottom, [messages, streamingText, rendering, scrollToBottom]);

  function autogrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function attachFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setErrorNote(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed.");
        setAttachments((prev) => [...prev, { url: json.url, name: file.name }]);
      }
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || busy) return;

    const isImagine = imagineMode || text.startsWith("/imagine ");
    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      projectId,
      role: "user",
      kind: "text",
      content: text,
      images: attachments.map((a) => a.url),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachments([]);
    setErrorNote(null);
    requestAnimationFrame(autogrow);

    const body = JSON.stringify({
      projectId,
      text,
      images: userMessage.images,
      mode: isImagine ? "imagine" : "text",
    });

    try {
      if (isImagine) {
        setRendering(true);
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Image generation failed.");
        setMessages((prev) => [...prev, json.message]);
        setProject((p) => (p ? { ...p, thumbnail: json.message.images[0] ?? p.thumbnail } : p));
      } else {
        setStreamingText("");
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? "The copilot couldn't reply.");
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setStreamingText(full);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `local-a-${Date.now()}`,
            projectId,
            role: "assistant",
            kind: "text",
            content: full,
            images: [],
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStreamingText(null);
      setRendering(false);
    }
  }

  async function saveTitle() {
    if (!project) return;
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (!title || title === project.title) return;
    setProject({ ...project, title });
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  if (notFound) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">This project doesn’t exist anymore.</p>
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">Couldn’t load this project.</p>
        <p className="text-[13px] text-muted">The server didn’t answer — it may still be starting.</p>
        <button
          onClick={() => setLoadAttempt((n) => n + 1)}
          className="mt-2 rounded-full bg-fg px-5 py-2 text-sm font-semibold text-ground"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Link
          href="/"
          aria-label="Back to projects"
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-raised hover:text-fg"
        >
          <ArrowLeft size={17} strokeWidth={2} />
        </Link>
        <span className="logo-mask block h-5 w-6 text-fg" aria-hidden="true" />
        {editingTitle ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveTitle();
            }}
          >
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              autoFocus
              aria-label="Project title"
              className="rounded-md border border-line bg-raised px-2 py-1 text-sm font-medium focus:border-accent focus:outline-none"
            />
            <button type="submit" aria-label="Save title" className="rounded-md p-1 text-accent">
              <Check size={15} strokeWidth={2.5} />
            </button>
          </form>
        ) : (
          <button
            onClick={() => {
              if (!project) return;
              setTitleDraft(project.title);
              setEditingTitle(true);
            }}
            className="group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium hover:bg-raised"
            title="Rename project"
          >
            <span className="truncate">{project?.title ?? "…"}</span>
            <Pencil
              size={12}
              strokeWidth={2}
              className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
            title="Open settings"
          >
            <XLogo size={11} className="text-fg" />
            {settings?.xAccount ? `@${settings.xAccount.handle}` : "Link X account"}
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-6">
          {loaded && messages.length === 0 && !busy && (
            <div className="my-auto py-10 text-center rise-in">
              <span className="logo-mask mx-auto block h-12 w-16 text-line-strong" aria-hidden="true" />
              <h2 className="mt-5 text-lg font-semibold tracking-tight">
                Brief your copilot on “{project?.title ?? "this launch"}”
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                Describe what you’re launching and drop in product shots. The copilot drafts posts,
                thinks in audience tribes, and renders posters with Grok Imagine.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {BRIEF_STARTERS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      setInput(s.text);
                      textareaRef.current?.focus();
                      requestAnimationFrame(autogrow);
                    }}
                    className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-fg"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-6">
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}

            {streamingText !== null && (
              <div className="max-w-none">
                {streamingText === "" ? (
                  <ThinkingDots label="Grok is thinking" />
                ) : (
                  <Markdown text={streamingText} />
                )}
              </div>
            )}

            {rendering && (
              <div className="w-72 max-w-full">
                <div className="relative flex aspect-square flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-line bg-raised">
                  <svg viewBox="0 0 288 100" className="w-full text-line-strong" aria-hidden="true">
                    {["M0 20 C 90 20, 110 12, 288 16", "M0 50 C 84 50, 120 42, 288 46", "M0 80 C 90 80, 106 88, 288 82"].map(
                      (d, i) => (
                        <path
                          key={d}
                          d={d}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="streamline"
                          style={{ animationDelay: `${i * 0.12}s` }}
                        />
                      )
                    )}
                  </svg>
                  <ThinkingDots label="Rendering with Grok Imagine" />
                </div>
              </div>
            )}

            {errorNote && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] leading-5 text-danger">
                {errorNote}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-surface/60 px-4 pb-4 pt-3 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl">
          {attachments.length > 0 && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <span key={a.url} className="group relative block h-16 w-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.name}
                    className="h-16 w-16 rounded-lg border border-line object-cover"
                  />
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                    aria-label={`Remove ${a.name}`}
                    className="absolute -right-1.5 -top-1.5 rounded-full border border-line-strong bg-overlay p-0.5 text-muted hover:text-fg"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-raised px-3 py-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => attachFiles(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Attach images"
              title="Attach images"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-overlay hover:text-fg disabled:opacity-50"
            >
              <ImagePlus size={18} strokeWidth={2} />
            </button>
            <button
              onClick={() => setImagineMode((v) => !v)}
              aria-pressed={imagineMode}
              aria-label="Toggle Imagine mode"
              title={imagineMode ? "Imagine mode on — prompts render images" : "Imagine mode — render an image"}
              className={`rounded-lg p-1.5 transition-colors ${
                imagineMode ? "bg-fg text-ground" : "text-muted hover:bg-overlay hover:text-fg"
              }`}
            >
              <Wand2 size={18} strokeWidth={2} />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autogrow();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={
                imagineMode
                  ? "Describe the poster to render…"
                  : "Brief the copilot… (Shift+Enter for a new line, /imagine for a poster)"
              }
              aria-label="Message"
              className="max-h-[200px] flex-1 resize-none bg-transparent py-1 text-[15px] leading-6 placeholder:text-faint focus:outline-none"
            />

            <button
              onClick={() => send()}
              disabled={!input.trim() || busy}
              aria-label="Send"
              className="rounded-full bg-fg p-2 text-ground transition-all enabled:hover:scale-105 disabled:opacity-30"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
          {showSettings && (
            <SettingsDialog
              settings={settings}
              onClose={() => setShowSettings(false)}
              onSaved={(s) => setSettings(s)}
            />
          )}
          <p className="mt-2 text-center text-[11px] text-faint">
            {imagineMode
              ? "Imagine mode: this prompt goes to Grok Imagine and returns a poster."
              : uploading
                ? "Uploading image…"
                : "Grok drafts, you decide. Attach product shots for grounded creative."}
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-2">
        {message.images.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {message.images.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Attached image"
                  className="h-28 w-28 rounded-xl border border-line object-cover"
                />
              </a>
            ))}
          </div>
        )}
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-raised px-4 py-2.5 text-[15px] leading-7">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.kind === "image") {
    return (
      <div className="w-80 max-w-full">
        {message.images.map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Generated poster: ${message.content}`}
              className="w-full rounded-xl border border-line"
            />
          </a>
        ))}
        <p className="mt-2 text-xs leading-5 text-faint">
          <span className="font-mono">{message.model ?? "grok-imagine"}</span> · “{message.content}”
        </p>
      </div>
    );
  }

  return (
    <div>
      <Markdown text={message.content} />
    </div>
  );
}

function ThinkingDots({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted" role="status" aria-label={label}>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="thinking-dot block h-1.5 w-1.5 rounded-full bg-muted"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}
