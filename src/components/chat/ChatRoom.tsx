"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Film,
  Image as ImageIcon,
  ImagePlus,
  MessageSquare,
  Orbit,
  Palette,
  Pencil,
  Wand2,
  X,
} from "lucide-react";
import { STYLE_PRESETS } from "@/lib/styles";
import type { ChatMessage, Project, PublicSettings } from "@/lib/types";
import { XLogo } from "../XLogo";
import { SettingsDialog } from "../SettingsDialog";
import { VoiceDock } from "../VoiceDock";
import { Markdown } from "./Markdown";

const GalaxyView = dynamic(() => import("../galaxy/GalaxyView").then((m) => m.GalaxyView), {
  ssr: false,
});

interface Attachment {
  url: string;
  name: string;
}

const RATIO_OPTIONS = [
  { value: "auto", label: "Auto", hint: "Grok picks the best fit from your prompt" },
  { value: "1:1", label: "Square", hint: "Standard post image" },
  { value: "16:9", label: "Wide", hint: "Banner or link card" },
  { value: "3:2", label: "Landscape", hint: "Photo-style card" },
  { value: "2:3", label: "Poster", hint: "Portrait launch poster" },
  { value: "9:16", label: "Tall", hint: "Full-bleed vertical" },
];

function RatioGlyph({ value, size = 15 }: { value: string; size?: number }) {
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

const BRIEF_STARTERS = [
  {
    label: "Poster concept",
    text: "a bold launch poster: dark background, product name in crisp type, electric momentum",
    imagine: true,
  },
  {
    label: "Brief the launch",
    text: "Here's what I'm launching. Help me sharpen the positioning and draft the announcement post for X.",
    imagine: false,
  },
  {
    label: "Find my tribes",
    text: "Who are the likely tribes in my audience for this launch, and how should the message differ for each?",
    imagine: false,
  },
];

export function ChatRoom({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imagineMode, setImagineMode] = useState(false);
  const [mediaKind, setMediaKind] = useState<"image" | "video">("image");
  const [aspectRatio, setAspectRatio] = useState("auto");
  const [resolution, setResolution] = useState<"1k" | "2k">("1k");
  const [style, setStyle] = useState("none");
  const [ratioOpen, setRatioOpen] = useState(false);
  const [view, setView] = useState<"chat" | "galaxy">("chat");
  const autoSwitched = useRef(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [rendering, setRendering] = useState<"image" | "video" | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = streamingText !== null || rendering !== null;

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
        // A fresh project opens ready to render: the initial brief goes to Grok Imagine.
        if (m.length === 0) setImagineMode(true);
        // Creative defaults from Settings seed the composer.
        if (s?.defaults) {
          setStyle(s.defaults.style ?? "none");
          setResolution(s.defaults.resolution ?? "1k");
        }
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
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setErrorNote("Only images can be attached.");
      return;
    }
    setUploading(true);
    setErrorNote(null);
    try {
      for (const file of images) {
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
      mediaType: mediaKind,
      aspectRatio,
      resolution,
      style,
    });

    try {
      if (isImagine) {
        setRendering(mediaKind);
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Media generation failed.");
        setMessages((prev) => [...prev, json.message]);
        if (json.message.kind === "image") {
          setProject((p) => (p ? { ...p, thumbnail: json.message.images[0] ?? p.thumbnail } : p));
        }
        // First render done → reveal the audience map the campaign will target.
        if (!autoSwitched.current) {
          autoSwitched.current = true;
          setTimeout(() => setView("galaxy"), 1600);
        }
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
      setRendering(null);
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
        <Link href="/dashboard" className="text-sm font-medium text-accent hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">Couldn’t load this project.</p>
        <p className="text-[13px] text-muted">The server didn’t answer. It may still be starting.</p>
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
    <div
      className="relative flex h-dvh flex-col"
      onDragEnter={(e) => {
        if (view !== "chat" || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (view !== "chat" || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
      }}
      onDragLeave={() => {
        if (view !== "chat") return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (view !== "chat") return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        attachFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-ground/80 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line-strong px-16 py-12">
            <ImagePlus size={28} strokeWidth={1.75} className="text-muted" />
            <p className="text-sm font-semibold">Drop images to attach</p>
            <p className="text-[13px] text-muted">They’ll ground your next render or brief.</p>
          </div>
        </div>
      )}
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Link
          href="/dashboard"
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
          <div className="flex items-center rounded-full border border-line p-0.5" role="tablist" aria-label="Project view">
            <button
              role="tab"
              aria-selected={view === "chat"}
              onClick={() => setView("chat")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                view === "chat" ? "bg-raised text-fg" : "text-muted hover:text-fg"
              }`}
            >
              <MessageSquare size={12} strokeWidth={2} />
              Chat
            </button>
            <button
              role="tab"
              aria-selected={view === "galaxy"}
              onClick={() => setView("galaxy")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                view === "galaxy" ? "bg-raised text-fg" : "text-muted hover:text-fg"
              }`}
            >
              <Orbit size={12} strokeWidth={2} />
              Audience
            </button>
          </div>
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

      {view === "galaxy" ? (
        <div className="min-h-0 flex-1">
          <GalaxyView
            projectId={projectId}
            xHandle={settings?.xAccount?.handle ?? null}
            displayName={settings?.profile.name ?? null}
          />
        </div>
      ) : (
        <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-6">
          {loaded && messages.length === 0 && !busy && (
            <div className="my-auto py-10 text-center rise-in">
              <span className="logo-mask mx-auto block h-12 w-16 text-line-strong" aria-hidden="true" />
              <h2 className="mt-5 text-lg font-semibold tracking-tight">
                Brief your copilot on “{project?.title ?? "this launch"}”
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                Describe what you’re launching and how it should look. The first prompt renders a
                poster or teaser video with Grok Imagine, then the map of your audience opens.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {BRIEF_STARTERS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      setInput(s.text);
                      setImagineMode(s.imagine);
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
              <div
                className={
                  rendering === "video"
                    ? "w-136 max-w-full"
                    : (() => {
                        if (aspectRatio === "auto" || aspectRatio === "1:1") return "w-96 max-w-full";
                        const [rw, rh] = aspectRatio.split(":").map(Number);
                        return rw > rh ? "w-136 max-w-full" : "w-72 max-w-full";
                      })()
                }
              >
                <div
                  className="relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-line bg-raised"
                  style={{
                    aspectRatio:
                      rendering === "video"
                        ? "16 / 9"
                        : aspectRatio === "auto"
                          ? "1 / 1"
                          : aspectRatio.replace(":", " / "),
                  }}
                >
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
                  <ThinkingDots
                    label={
                      rendering === "video"
                        ? "Rendering video with Grok Imagine (a minute or two)"
                        : "Rendering with Grok Imagine"
                    }
                  />
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
        <div className="mx-auto w-full max-w-3xl">
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
              title={imagineMode ? "Imagine mode on: prompts render media" : "Imagine mode: render an image or video"}
              className={`rounded-lg p-1.5 transition-colors ${
                imagineMode ? "bg-fg text-ground" : "text-muted hover:bg-overlay hover:text-fg"
              }`}
            >
              <Wand2 size={18} strokeWidth={2} />
            </button>
            {imagineMode && (
              <div
                className="flex items-center self-center rounded-lg border border-line p-0.5"
                role="tablist"
                aria-label="Media type"
              >
                <button
                  role="tab"
                  aria-selected={mediaKind === "image"}
                  onClick={() => setMediaKind("image")}
                  title="Render an image"
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    mediaKind === "image" ? "bg-raised text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  <ImageIcon size={12} strokeWidth={2} />
                  Image
                </button>
                <button
                  role="tab"
                  aria-selected={mediaKind === "video"}
                  onClick={() => setMediaKind("video")}
                  title="Render a short video"
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    mediaKind === "video" ? "bg-raised text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  <Film size={12} strokeWidth={2} />
                  Video
                </button>
              </div>
            )}
            {imagineMode && (
              <div className="relative self-center">
                <button
                  onClick={() => setRatioOpen((v) => !v)}
                  aria-expanded={ratioOpen}
                  aria-label="Style and size"
                  title="Style and size"
                  className={`flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs font-medium transition-colors ${
                    ratioOpen ? "bg-raised text-fg" : "text-muted hover:border-line-strong hover:text-fg"
                  }`}
                >
                  {mediaKind === "image" ? (
                    <>
                      <RatioGlyph value={aspectRatio} size={13} />
                      {RATIO_OPTIONS.find((r) => r.value === aspectRatio)?.label ?? aspectRatio}
                      {style !== "none" && (
                        <span className="text-faint">· {STYLE_PRESETS.find((s) => s.id === style)?.label}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <Palette size={13} strokeWidth={2} />
                      {style === "none" ? "Style" : STYLE_PRESETS.find((s) => s.id === style)?.label}
                    </>
                  )}
                </button>
                {ratioOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setRatioOpen(false)} aria-hidden="true" />
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-line-strong bg-overlay p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]">
                      <p className="px-2.5 pb-1 pt-1.5 text-xs uppercase tracking-wide text-faint">Style</p>
                      <div className="flex flex-wrap gap-1 px-1.5 pb-1.5">
                        {STYLE_PRESETS.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setStyle(s.id)}
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
                          onClick={() => {
                            setAspectRatio(r.value);
                            setRatioOpen(false);
                          }}
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
                              onClick={() => setResolution(res)}
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
                    </div>
                  </>
                )}
              </div>
            )}

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
                  ? mediaKind === "video"
                    ? "Describe the teaser video to render…"
                    : "Describe your launch and how it should look…"
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
          <p className="mt-2 text-center text-[11px] text-faint">
            {imagineMode
              ? attachments.length > 0
                ? mediaKind === "video"
                  ? "Your upload becomes the opening frame; the prompt directs the motion."
                  : "Your upload is the base image; the prompt describes the edit."
                : mediaKind === "video"
                  ? "Imagine mode: this prompt renders a short video with Grok Imagine (about a minute or two)."
                  : "Imagine mode: this prompt goes to Grok Imagine and returns a poster."
              : uploading
                ? "Uploading image…"
                : "Grok drafts, you decide. Attach or drop product shots for grounded creative."}
          </p>
        </div>
      </div>
        </>
      )}

      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => setSettings(s)}
        />
      )}
      <VoiceDock projectId={projectId} />
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

  if (message.kind === "video") {
    return (
      <div className="w-136 max-w-full">
        {message.images.map((url) => (
          <video key={url} src={url} controls playsInline className="w-full rounded-xl border border-line" />
        ))}
        <p className="mt-2 text-xs leading-5 text-faint">
          <span className="font-mono">{message.model ?? "grok-imagine-video"}</span> · “{message.content}”
        </p>
      </div>
    );
  }

  if (message.kind === "image") {
    // Sized by the image itself: tall renders cap at 26rem high, wide renders
    // spread to the column, so a 16:9 banner reads as large as a 2:3 poster.
    return (
      <div className="w-fit max-w-full">
        {message.images.map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Generated poster: ${message.content}`}
              className="max-h-104 w-auto max-w-full rounded-xl border border-line"
            />
          </a>
        ))}
        <p className="mt-2 max-w-md text-xs leading-5 text-faint">
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
