import { promises as fs } from "fs";
import path from "path";
import type { AppSettings, ChatMessage, DeployedPost, Project, ProjectFolder } from "../types";
import type { StorageAdapter } from "./types";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const FOLDERS_FILE = path.join(DATA_DIR, "folders.json");
const DEPLOYS_FILE = path.join(DATA_DIR, "deploys.json");
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
    return projects
      .filter((p) => !p.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async listTrash() {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    return projects
      .filter((p) => !!p.deletedAt)
      .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  },

  async getProject(id) {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    return projects.find((p) => p.id === id) ?? null;
  },

  async createProject(title, folderId = null) {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      title: title.trim() || "Untitled project",
      createdAt: now,
      updatedAt: now,
      thumbnail: null,
      folderId,
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
    if (patch.folderId !== undefined) project.folderId = patch.folderId;
    project.updatedAt = new Date().toISOString();
    await writeJson(PROJECTS_FILE, projects);
    return project;
  },

  async listFolders() {
    const folders = await readJson<ProjectFolder[]>(FOLDERS_FILE, []);
    return folders.sort((a, b) => a.name.localeCompare(b.name));
  },

  async createFolder(name) {
    const folders = await readJson<ProjectFolder[]>(FOLDERS_FILE, []);
    const folder: ProjectFolder = {
      id: crypto.randomUUID(),
      name: name.trim() || "Untitled folder",
      createdAt: new Date().toISOString(),
    };
    folders.push(folder);
    await writeJson(FOLDERS_FILE, folders);
    return folder;
  },

  async renameFolder(id, name) {
    const folders = await readJson<ProjectFolder[]>(FOLDERS_FILE, []);
    const folder = folders.find((f) => f.id === id);
    if (!folder) return null;
    folder.name = name.trim() || folder.name;
    await writeJson(FOLDERS_FILE, folders);
    return folder;
  },

  async deleteFolder(id) {
    const folders = await readJson<ProjectFolder[]>(FOLDERS_FILE, []);
    await writeJson(FOLDERS_FILE, folders.filter((f) => f.id !== id));
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    let touched = false;
    for (const p of projects) {
      if (p.folderId === id) {
        p.folderId = null;
        touched = true;
      }
    }
    if (touched) await writeJson(PROJECTS_FILE, projects);
  },

  async deleteProject(id) {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    const project = projects.find((p) => p.id === id);
    if (project) {
      project.deletedAt = new Date().toISOString();
      await writeJson(PROJECTS_FILE, projects);
    }
  },

  async restoreProject(id) {
    const projects = await readJson<Project[]>(PROJECTS_FILE, []);
    const project = projects.find((p) => p.id === id);
    if (!project) return null;
    project.deletedAt = null;
    await writeJson(PROJECTS_FILE, projects);
    return project;
  },

  async purgeProject(id) {
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

  async listDeploys() {
    const deploys = await readJson<DeployedPost[]>(DEPLOYS_FILE, []);
    return deploys.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async recordDeploy(post) {
    const deploys = await readJson<DeployedPost[]>(DEPLOYS_FILE, []);
    deploys.push(post);
    await writeJson(DEPLOYS_FILE, deploys);
    return post;
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
