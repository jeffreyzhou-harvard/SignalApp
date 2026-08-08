import { promises as fs } from "fs";
import path from "path";
import type { AppSettings, ChatMessage, Project } from "../types";
import type { StorageAdapter } from "./types";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const MESSAGES_DIR = path.join(DATA_DIR, "messages");
const FILES_DIR = path.join(DATA_DIR, "files");

async function ensureDirs() {
  await fs.mkdir(MESSAGES_DIR, { recursive: true });
  await fs.mkdir(FILES_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  await ensureDirs();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

export const jsonFileStorage: StorageAdapter = {
  id: "json",

  async listProjects() {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getProject(id) {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    return projects.find((p) => p.id === id) ?? null;
  },

  async createProject(title) {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      title: title.trim() || "Untitled project",
      createdAt: now,
      updatedAt: now,
      thumbnail: null,
    };
    projects.push(project);
    await writeJson(PROJECTS_FILE, projects);
    return project;
  },

  async updateProject(id, patch) {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    const project = projects.find((p) => p.id === id);
    if (!project) return null;
    if (patch.title !== undefined) project.title = patch.title.trim() || project.title;
    if (patch.thumbnail !== undefined) project.thumbnail = patch.thumbnail;
    project.updatedAt = new Date().toISOString();
    await writeJson(PROJECTS_FILE, projects);
    return project;
  },

  async deleteProject(id) {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    await writeJson(PROJECTS_FILE, projects.filter((p) => p.id !== id));
    await fs.rm(path.join(MESSAGES_DIR, `${id}.json`), { force: true });
  },

  async listMessages(projectId) {
    return readJson<ChatMessage[]>(path.join(MESSAGES_DIR, `${projectId}.json`), []);
  },

  async appendMessage(message) {
    const file = path.join(MESSAGES_DIR, `${message.projectId}.json`);
    const messages = await readJson<ChatMessage[]>(file, []);
    messages.push(message);
    await writeJson(file, messages);
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    const project = projects.find((p) => p.id === message.projectId);
    if (project) {
      project.updatedAt = message.createdAt;
      await writeJson(PROJECTS_FILE, projects);
    }
    return message;
  },

  async getSettings() {
    return readJson<AppSettings>(SETTINGS_FILE, { xAccount: null });
  },

  async putSettings(settings) {
    await writeJson(SETTINGS_FILE, settings);
    return settings;
  },

  async saveFile(name, bytes, mime) {
    await ensureDirs();
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = path.extname(safe) || MIME_EXT[mime] || "";
    const stored = path.extname(safe) ? safe : `${safe}${ext}`;
    await fs.writeFile(path.join(FILES_DIR, stored), bytes);
    return `/api/files/${stored}`;
  },

  async readFile(name) {
    const safe = path.basename(name);
    try {
      const bytes = await fs.readFile(path.join(FILES_DIR, safe));
      const ext = path.extname(safe).toLowerCase();
      const mime =
        Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ??
        (ext === ".jpeg" ? "image/jpeg" : "application/octet-stream");
      return { bytes, mime };
    } catch {
      return null;
    }
  },
};
