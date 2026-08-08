import type { AppSettings, ChatMessage, Project } from "./types";
import type { ProviderMessage } from "./providers/types";

/**
 * Builds the provider message list for a copilot turn: system brief +
 * conversation history, with attached images inlined as vision parts.
 */
export function buildCopilotMessages(
  project: Project,
  settings: AppSettings,
  history: ChatMessage[],
  resolveImage: (url: string) => Promise<string | null>
): Promise<ProviderMessage[]> {
  return (async () => {
    const linked = settings.xAccount
      ? `The founder's linked X account is @${settings.xAccount.handle}; treat it as the account whose audience this campaign targets.`
      : "No X account is linked yet; if audience-specific data would help, suggest linking one in Settings.";

    const founder = settings.profile?.name ? `The founder's name is ${settings.profile.name}.` : "";

    const system: ProviderMessage = {
      role: "system",
      content: [
        "You are the AgentSim campaign copilot, a launch strategist for products announced on X.",
        founder,
        "AgentSim clusters a founder's real followers into interest tribes and turns marketing goals into targeting decisions, emitting a tailored post + poster per targeted tribe.",
        `You are working inside the project "${project.title}".`,
        linked,
        "Help the founder shape their launch: sharpen positioning, draft X posts, think in audience tribes, and propose poster concepts.",
        "When the founder wants a visual, tell them to use Imagine mode (the wand in the composer) or refine the poster prompt for them.",
        "Be concrete and concise. Draft real copy, not descriptions of copy. Never use em dashes.",
      ]
        .filter(Boolean)
        .join(" "),
    };

    const messages: ProviderMessage[] = [system];
    for (const m of history) {
      if (m.role === "assistant") {
        messages.push({
          role: "assistant",
          content:
            m.kind === "image"
              ? `[Generated poster for prompt: "${m.content}"]`
              : m.kind === "video"
                ? `[Generated video for prompt: "${m.content}"]`
                : m.content,
        });
        continue;
      }
      if (m.images.length === 0) {
        messages.push({ role: "user", content: m.content });
        continue;
      }
      const parts: ProviderMessage["content"] = [];
      for (const url of m.images) {
        const dataUrl = await resolveImage(url);
        if (dataUrl) parts.push({ type: "image_url", image_url: { url: dataUrl } });
      }
      parts.push({ type: "text", text: m.content });
      messages.push({ role: "user", content: parts });
    }
    return messages;
  })();
}
