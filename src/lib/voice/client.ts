"use client";
// One WebSocket = the whole agent. Voice and text share the session; tool
// calls round-trip through dispatchTool. No custom STT/agent loop anywhere.
import { base64ToFloat32, floatTo16BitPCMBase64 } from "./pcm";
import { dispatchTool, type ToolContext } from "./tools";

export interface VoiceState {
  status: "idle" | "connecting" | "listening" | "speaking" | "error";
  caption?: string;
  userCaption?: string;
  lastError?: string;
}

const WS_URL = "wss://api.x.ai/v1/realtime";
const RATE = 24000;

export class RealtimeClient {
  onState: (s: VoiceState) => void = () => {};
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private micNode: ScriptProcessorNode | null = null;
  private micStream: MediaStream | null = null;
  private playHead = 0;
  private state: VoiceState = { status: "idle" };
  private toolCtx: ToolContext = {};

  private set(patch: Partial<VoiceState>) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  async connect(projectId?: string) {
    this.toolCtx = { projectId };
    this.set({ status: "connecting" });
    const res = await fetch("/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { error?: string };
      this.set({ status: "error", lastError: detail.error ?? `token: ${res.status}` });
      return;
    }
    const { token, model, sessionPayload } = await res.json();

    // Browsers can't set WS headers; the token rides the subprotocol (docs).
    const ws = new WebSocket(`${WS_URL}?model=${encodeURIComponent(model)}`, [
      `xai-client-secret.${token}`,
    ]);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify(sessionPayload));
      this.set({ status: "listening" });
    };
    ws.onmessage = (ev) => {
      try {
        this.handleEvent(JSON.parse(ev.data));
      } catch {
        // binary or non-JSON frames aren't used in json transport mode
      }
    };
    ws.onerror = () => this.set({ status: "error", lastError: "websocket error" });
    ws.onclose = () => {
      if (this.state.status !== "error") this.set({ status: "idle" });
    };
  }

  private async handleEvent(e: {
    type: string;
    delta?: string;
    transcript?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    error?: { message?: string };
  }) {
    switch (e.type) {
      case "response.created":
        this.set({ status: "speaking", caption: "" });
        break;
      case "response.done":
        this.set({ status: "listening" });
        break;
      case "response.output_audio.delta":
        if (e.delta) this.playChunk(base64ToFloat32(e.delta));
        break;
      case "response.output_text.delta":
      case "response.output_audio_transcript.delta":
        if (e.delta) this.set({ caption: (this.state.caption ?? "") + e.delta });
        break;
      case "conversation.item.input_audio_transcription.updated":
        this.set({ userCaption: e.transcript ?? e.delta ?? this.state.userCaption });
        break;
      case "response.function_call_arguments.done": {
        const output = await dispatchTool(
          e.name ?? "",
          JSON.parse(e.arguments || "{}"),
          this.toolCtx,
        );
        this.ws?.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: e.call_id, output },
          }),
        );
        this.ws?.send(JSON.stringify({ type: "response.create" }));
        break;
      }
      case "error":
        this.set({ status: "error", lastError: e.error?.message ?? "server error" });
        break;
    }
  }

  /** Text path — same brain, same session (conversation.item.create + response.create). */
  sendText(text: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.set({ caption: "", userCaption: text });
    this.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
      }),
    );
    this.ws.send(JSON.stringify({ type: "response.create" }));
  }

  async startMic() {
    if (this.micNode) return;
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    this.ctx ??= new AudioContext({ sampleRate: RATE });
    await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.micStream);
    // ScriptProcessor: deprecated but tiny and universal. AudioWorklet later.
    const node = this.ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (ev) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: floatTo16BitPCMBase64(ev.inputBuffer.getChannelData(0)),
          }),
        );
      }
    };
    src.connect(node);
    node.connect(this.ctx.destination); // keeps the node alive; it outputs silence
    this.micNode = node;
  }

  stopMic() {
    this.micNode?.disconnect();
    this.micNode = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  private playChunk(f32: Float32Array<ArrayBuffer>) {
    this.ctx ??= new AudioContext({ sampleRate: RATE });
    const buf = this.ctx.createBuffer(1, f32.length, RATE);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    this.playHead = Math.max(this.playHead, this.ctx.currentTime);
    src.start(this.playHead);
    this.playHead += buf.duration;
  }

  disconnect() {
    this.stopMic();
    this.ws?.close();
    this.ws = null;
  }
}
