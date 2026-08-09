import type { AppSettings, ChatMessage, DeployedPost, Project, ProjectFolder } from "../types";

/**
 * Pluggable persistence. The default adapter writes JSON files under ./data;
 * swap in SQLite/Postgres by implementing this interface and registering it
 * in ./index.ts (selected via the STORAGE_ADAPTER env var).
 */
export interface StorageAdapter {
  id: string;

  /** Active projects only; trashed ones come from listTrash(). */
  listProjects(): Promise<Project[]>;
  listTrash(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(title: string, folderId?: string | null): Promise<Project>;
  updateProject(
    id: string,
    patch: Partial<Pick<Project, "title" | "thumbnail" | "folderId">>
  ): Promise<Project | null>;
  /** Soft delete: moves the project to the trash. */
  deleteProject(id: string): Promise<void>;
  restoreProject(id: string): Promise<Project | null>;
  /** Hard delete: removes the project and its messages permanently. */
  purgeProject(id: string): Promise<void>;

  listFolders(): Promise<ProjectFolder[]>;
  createFolder(name: string): Promise<ProjectFolder>;
  renameFolder(id: string, name: string): Promise<ProjectFolder | null>;
  /** Deleting a folder unfiles its projects. */
  deleteFolder(id: string): Promise<void>;

  listMessages(projectId: string): Promise<ChatMessage[]>;
  appendMessage(message: ChatMessage): Promise<ChatMessage>;

  getSettings(): Promise<AppSettings>;
  putSettings(settings: AppSettings): Promise<AppSettings>;

  /** Posts published from Signal, newest first. */
  listDeploys(): Promise<DeployedPost[]>;
  recordDeploy(post: DeployedPost): Promise<DeployedPost>;

  /** Persist an uploaded/generated binary; returns a URL the app can serve. */
  saveFile(name: string, bytes: Buffer, mime: string): Promise<string>;
  readFile(name: string): Promise<{ bytes: Buffer; mime: string } | null>;
}
