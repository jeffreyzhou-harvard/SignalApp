import type { AppSettings, ChatMessage, Project, ProjectFolder } from "../types";

/**
 * Pluggable persistence. The default adapter writes JSON files under ./data;
 * swap in SQLite/Postgres by implementing this interface and registering it
 * in ./index.ts (selected via the STORAGE_ADAPTER env var).
 */
export interface StorageAdapter {
  id: string;

  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(title: string, folderId?: string | null): Promise<Project>;
  updateProject(
    id: string,
    patch: Partial<Pick<Project, "title" | "thumbnail" | "folderId">>
  ): Promise<Project | null>;
  deleteProject(id: string): Promise<void>;

  listFolders(): Promise<ProjectFolder[]>;
  createFolder(name: string): Promise<ProjectFolder>;
  renameFolder(id: string, name: string): Promise<ProjectFolder | null>;
  /** Deleting a folder unfiles its projects. */
  deleteFolder(id: string): Promise<void>;

  listMessages(projectId: string): Promise<ChatMessage[]>;
  appendMessage(message: ChatMessage): Promise<ChatMessage>;

  getSettings(): Promise<AppSettings>;
  putSettings(settings: AppSettings): Promise<AppSettings>;

  /** Persist an uploaded/generated binary; returns a URL the app can serve. */
  saveFile(name: string, bytes: Buffer, mime: string): Promise<string>;
  readFile(name: string): Promise<{ bytes: Buffer; mime: string } | null>;
}
