import type { ImageProvider, TextProvider, VideoProvider } from "./types";
import { grokImagine, grokImagineVideo, grokText } from "./grok";

const textProviders: Record<string, TextProvider> = {
  [grokText.id]: grokText,
};

const imageProviders: Record<string, ImageProvider> = {
  [grokImagine.id]: grokImagine,
};

const videoProviders: Record<string, VideoProvider> = {
  [grokImagineVideo.id]: grokImagineVideo,
};

/** Register additional providers here (or call these from a plugin entrypoint). */
export function registerTextProvider(p: TextProvider) {
  textProviders[p.id] = p;
}
export function registerImageProvider(p: ImageProvider) {
  imageProviders[p.id] = p;
}
export function registerVideoProvider(p: VideoProvider) {
  videoProviders[p.id] = p;
}

export function getTextProvider(): TextProvider {
  const id = process.env.AI_TEXT_PROVIDER ?? grokText.id;
  const provider = textProviders[id];
  if (!provider) throw new Error(`Unknown text provider "${id}". Registered: ${Object.keys(textProviders).join(", ")}`);
  return provider;
}

export function getImageProvider(): ImageProvider {
  const id = process.env.AI_IMAGE_PROVIDER ?? grokImagine.id;
  const provider = imageProviders[id];
  if (!provider) throw new Error(`Unknown image provider "${id}". Registered: ${Object.keys(imageProviders).join(", ")}`);
  return provider;
}

export function getVideoProvider(): VideoProvider {
  const id = process.env.AI_VIDEO_PROVIDER ?? grokImagineVideo.id;
  const provider = videoProviders[id];
  if (!provider) throw new Error(`Unknown video provider "${id}". Registered: ${Object.keys(videoProviders).join(", ")}`);
  return provider;
}
