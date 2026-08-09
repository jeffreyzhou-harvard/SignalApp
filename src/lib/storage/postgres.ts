import { Pool } from "pg";
import path from "path";
import type { AppSettings, ChatMessage, DeployedPost, MetricSnapshot, Project, ProjectFolder } from "../types";
import type { StorageAdapter } from "./types";

/**
 * Postgres-backed storage for hosts without a persistent filesystem (Vercel).
 * Selected with STORAGE_ADAPTER=postgres; connects via STORAGE_DATABASE_URL or
 * DATABASE_URL (SQLAlchemy-style "postgresql+psycopg://" URLs are normalized).
 * Domain objects live as jsonb docs in app_-prefixed tables so the adapter
 * coexists with the ingestion backend's tables on the shared database.
 */

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function db(): Pool {
  if (!pool) {
    const raw = process.env.STORAGE_DATABASE_URL || process.env.DATABASE_URL;
    if (!raw) throw new Error("STORAGE_ADAPTER=postgres needs STORAGE_DATABASE_URL or DATABASE_URL.");
    const url = raw.replace("postgresql+psycopg://", "postgresql://");
    pool = new Pool({
      connectionString: url,
      max: 3,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

function init(): Promise<void> {
  ready ??= (async () => {
    await db().query(`
      CREATE TABLE IF NOT EXISTS app_projects (id text PRIMARY KEY, doc jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS app_folders (id text PRIMARY KEY, doc jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS app_messages (
        project_id text NOT NULL,
        seq bigserial PRIMARY KEY,
        doc jsonb NOT NULL
      );
      CREATE INDEX IF NOT EXISTS app_messages_project ON app_messages (project_id, seq);
      CREATE TABLE IF NOT EXISTS app_settings (id int PRIMARY KEY DEFAULT 1, doc jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS app_deploys (id text PRIMARY KEY, doc jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS app_files (name text PRIMARY KEY, mime text NOT NULL, bytes bytea NOT NULL);
      CREATE TABLE IF NOT EXISTS app_metric_snapshots (
        deploy_id text NOT NULL,
        seq bigserial PRIMARY KEY,
        doc jsonb NOT NULL
      );
      CREATE INDEX IF NOT EXISTS app_metric_snapshots_deploy ON app_metric_snapshots (deploy_id, seq);
    `);
  })();
  return ready;
}

async function allProjects(): Promise<Project[]> {
  await init();
  const res = await db().query("SELECT doc FROM app_projects");
  return res.rows.map((r) => r.doc as Project);
}

async function putProject(p: Project): Promise<void> {
  await db().query(
    "INSERT INTO app_projects (id, doc) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET doc = $2",
    [p.id, p]
  );
}

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

export const postgresStorage: StorageAdapter = {
  id: "postgres",

  async listProjects() {
    const projects = await allProjects();
    return projects
      .filter((p) => !p.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async listTrash() {
    const projects = await allProjects();
    return projects
      .filter((p) => !!p.deletedAt)
      .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  },

  async getProject(id) {
    await init();
    const res = await db().query("SELECT doc FROM app_projects WHERE id = $1", [id]);
    return (res.rows[0]?.doc as Project) ?? null;
  },

  async createProject(title, folderId = null) {
    await init();
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      title: title.trim() || "Untitled project",
      createdAt: now,
      updatedAt: now,
      thumbnail: null,
      folderId,
    };
    await putProject(project);
    return project;
  },

  async updateProject(id, patch) {
    const project = await this.getProject(id);
    if (!project) return null;
    if (patch.title !== undefined) project.title = patch.title.trim() || project.title;
    if (patch.thumbnail !== undefined) project.thumbnail = patch.thumbnail;
    if (patch.folderId !== undefined) project.folderId = patch.folderId;
    project.updatedAt = new Date().toISOString();
    await putProject(project);
    return project;
  },

  async deleteProject(id) {
    const project = await this.getProject(id);
    if (!project) return;
    project.deletedAt = new Date().toISOString();
    await putProject(project);
  },

  async restoreProject(id) {
    const project = await this.getProject(id);
    if (!project) return null;
    project.deletedAt = null;
    await putProject(project);
    return project;
  },

  async purgeProject(id) {
    await init();
    await db().query("DELETE FROM app_projects WHERE id = $1", [id]);
    await db().query("DELETE FROM app_messages WHERE project_id = $1", [id]);
  },

  async listFolders() {
    await init();
    const res = await db().query("SELECT doc FROM app_folders");
    return (res.rows.map((r) => r.doc) as ProjectFolder[]).sort((a, b) => a.name.localeCompare(b.name));
  },

  async createFolder(name) {
    await init();
    const folder: ProjectFolder = {
      id: crypto.randomUUID(),
      name: name.trim() || "Untitled folder",
      createdAt: new Date().toISOString(),
    };
    await db().query("INSERT INTO app_folders (id, doc) VALUES ($1, $2)", [folder.id, folder]);
    return folder;
  },

  async renameFolder(id, name) {
    await init();
    const res = await db().query("SELECT doc FROM app_folders WHERE id = $1", [id]);
    const folder = res.rows[0]?.doc as ProjectFolder | undefined;
    if (!folder) return null;
    folder.name = name.trim() || folder.name;
    await db().query("UPDATE app_folders SET doc = $2 WHERE id = $1", [id, folder]);
    return folder;
  },

  async deleteFolder(id) {
    await init();
    await db().query("DELETE FROM app_folders WHERE id = $1", [id]);
    await db().query(
      "UPDATE app_projects SET doc = doc || '{\"folderId\": null}'::jsonb WHERE doc->>'folderId' = $1",
      [id]
    );
  },

  async listMessages(projectId) {
    await init();
    const res = await db().query("SELECT doc FROM app_messages WHERE project_id = $1 ORDER BY seq", [projectId]);
    return res.rows.map((r) => r.doc as ChatMessage);
  },

  async appendMessage(message) {
    await init();
    await db().query("INSERT INTO app_messages (project_id, doc) VALUES ($1, $2)", [message.projectId, message]);
    await db().query(
      "UPDATE app_projects SET doc = doc || jsonb_build_object('updatedAt', $2::text) WHERE id = $1",
      [message.projectId, message.createdAt]
    );
    return message;
  },

  async getSettings() {
    await init();
    const res = await db().query("SELECT doc FROM app_settings WHERE id = 1");
    return (res.rows[0]?.doc as AppSettings) ?? { xAccount: null };
  },

  async putSettings(settings) {
    await init();
    await db().query(
      "INSERT INTO app_settings (id, doc) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET doc = $1",
      [settings]
    );
    return settings;
  },

  async listDeploys() {
    await init();
    const res = await db().query("SELECT doc FROM app_deploys");
    return (res.rows.map((r) => r.doc) as DeployedPost[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async recordDeploy(post) {
    await init();
    await db().query(
      "INSERT INTO app_deploys (id, doc) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET doc = $2",
      [post.id, post]
    );
    return post;
  },

  async listMetricSnapshots(deployId) {
    await init();
    const res = await db().query("SELECT doc FROM app_metric_snapshots WHERE deploy_id = $1", [deployId]);
    return (res.rows.map((r) => r.doc) as MetricSnapshot[]).sort((a, b) =>
      a.capturedAt.localeCompare(b.capturedAt)
    );
  },

  async appendMetricSnapshot(snapshot) {
    await init();
    await db().query("INSERT INTO app_metric_snapshots (deploy_id, doc) VALUES ($1, $2)", [
      snapshot.deployId,
      snapshot,
    ]);
  },

  async saveFile(name, bytes, mime) {
    await init();
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = path.extname(safe) || MIME_EXT[mime] || "";
    const stored = path.extname(safe) ? safe : `${safe}${ext}`;
    await db().query(
      "INSERT INTO app_files (name, mime, bytes) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET mime = $2, bytes = $3",
      [stored, mime, bytes]
    );
    return `/api/files/${stored}`;
  },

  async readFile(name) {
    await init();
    const safe = path.basename(name);
    const res = await db().query("SELECT mime, bytes FROM app_files WHERE name = $1", [safe]);
    if (!res.rows[0]) return null;
    return { bytes: res.rows[0].bytes as Buffer, mime: res.rows[0].mime as string };
  },
};
