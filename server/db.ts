import { config } from "./config";
import { initSql, prepare, sql } from "./sql";
import { safeAvatarUrl } from "./uploads";

export type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  created_at: number;
  avatar_url?: string;
};

export type SessionRow = {
  token: string;
  user_id: string;
  expires_at: number;
};

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color: string;
  viewport: string;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
  public_slug?: string | null;
  public_access?: string;
  node_count?: number;
  owner_username?: string;
  role?: "owner" | "shared";
  permission?: "view" | "edit";
  folder_id?: string | null;
  can_manage_history?: boolean;
};

export type NodeRow = {
  id: string;
  project_id: string;
  type: "markdown" | "excalidraw" | "image" | "file";
  title: string;
  content: string;
  preview: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  border_color: string;
  status: string;
  due_on: string;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
};

export type UploadRow = {
  id: string;
  user_id: string;
  original_name: string;
  mime: string;
  size: number;
  created_at: number;
};

export type EdgeRow = {
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
  source_handle: string | null;
  target_handle: string | null;
  label: string;
  created_at: number;
};

const mysql = config.dbBackend === "mysql";
const typeCol = mysql ? "`type`" : "type";
const upsertGrantSql = mysql
  ? `INSERT INTO public_link_grants (project_id, user_id, slug, permission, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE permission = VALUES(permission)`
  : `INSERT INTO public_link_grants (project_id, user_id, slug, permission, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id, user_id, slug) DO UPDATE SET
       permission = excluded.permission`;
const setProjectFolderSql = mysql
  ? `INSERT INTO project_folder_items (folder_id, project_id, user_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE folder_id = VALUES(folder_id)`
  : `INSERT INTO project_folder_items (folder_id, project_id, user_id)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, project_id) DO UPDATE SET folder_id = excluded.folder_id`;

export const queries = {
  ping: prepare("SELECT 1 AS ok"),
  createUser: prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
  ),
  findUserByUsername: prepare("SELECT * FROM users WHERE username = ?"),
  findUserById: prepare(
    "SELECT id, username, created_at, avatar_url FROM users WHERE id = ?",
  ),
  findUserAuthById: prepare("SELECT * FROM users WHERE id = ?"),
  updatePassword: prepare("UPDATE users SET password_hash = ? WHERE id = ?"),
  updateAvatar: prepare("UPDATE users SET avatar_url = ? WHERE id = ?"),

  createSession: prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
  ),
  findSession: prepare(
    `SELECT s.token, s.user_id, s.expires_at, u.username
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
  ),
  deleteSession: prepare("DELETE FROM sessions WHERE token = ?"),
  deleteExpiredSessions: prepare("DELETE FROM sessions WHERE expires_at < ?"),

  searchProjects: prepare(
    `SELECT p.*, u.username AS owner_username,
            CASE WHEN p.user_id = ? THEN 'owner' ELSE 'shared' END AS role
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE p.deleted_at IS NULL
       AND (p.user_id = ?
        OR p.id IN (SELECT project_id FROM project_shares WHERE user_id = ?))
     ORDER BY p.updated_at DESC`,
  ),
  searchNodes: prepare(
    `SELECT n.*, p.name AS project_name
     FROM nodes n
     JOIN projects p ON p.id = n.project_id
     WHERE p.deleted_at IS NULL
       AND n.deleted_at IS NULL
       AND (p.user_id = ?
        OR p.id IN (SELECT project_id FROM project_shares WHERE user_id = ?))`,
  ),
  listProjects: prepare(
    `SELECT p.*,
            u.username AS owner_username,
            CASE WHEN p.user_id = ? THEN 'owner' ELSE 'shared' END AS role,
            CASE
              WHEN p.user_id = ? THEN 'edit'
              ELSE COALESCE(
                (SELECT s.permission FROM project_shares s
                 WHERE s.project_id = p.id AND s.user_id = ?),
                'view'
              )
            END AS permission,
            (SELECT COUNT(*) FROM nodes n WHERE n.project_id = p.id AND n.deleted_at IS NULL) AS node_count
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE p.deleted_at IS NULL
       AND (p.user_id = ?
        OR p.id IN (SELECT project_id FROM project_shares WHERE user_id = ?))
     ORDER BY p.updated_at DESC`,
  ),
  findProject: prepare(
    "SELECT * FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  ),
  findProjectById: prepare(
    `SELECT p.*, u.username AS owner_username
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
  ),
  listTrash: prepare(
    `SELECT p.*,
            (SELECT COUNT(*) FROM nodes n WHERE n.project_id = p.id AND n.deleted_at IS NULL) AS node_count
     FROM projects p
     WHERE p.user_id = ? AND p.deleted_at IS NOT NULL
     ORDER BY p.deleted_at DESC`,
  ),
  trashProject: prepare(
    "UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  ),
  restoreProject: prepare(
    "UPDATE projects SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL",
  ),
  purgeProject: prepare(
    "DELETE FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL",
  ),
  clearShares: prepare("DELETE FROM project_shares WHERE project_id = ?"),
  findShare: prepare(
    "SELECT * FROM project_shares WHERE project_id = ? AND user_id = ?",
  ),
  listShares: prepare(
    `SELECT u.id, u.username, s.created_at, s.permission
     FROM project_shares s
     JOIN users u ON u.id = s.user_id
     WHERE s.project_id = ?
     ORDER BY LOWER(u.username)`,
  ),
  addShare: prepare(
    "INSERT INTO project_shares (project_id, user_id, created_at, permission) VALUES (?, ?, ?, ?)",
  ),
  updateSharePermission: prepare(
    "UPDATE project_shares SET permission = ? WHERE project_id = ? AND user_id = ?",
  ),
  removeShare: prepare(
    "DELETE FROM project_shares WHERE project_id = ? AND user_id = ?",
  ),
  listPublicLinks: prepare(
    `SELECT slug, access, created_at, password_hash
     FROM project_public_links
     WHERE project_id = ?
     ORDER BY created_at DESC`,
  ),
  countPublicLinks: prepare(
    "SELECT COUNT(*) AS count FROM project_public_links WHERE project_id = ?",
  ),
  findPublicLink: prepare("SELECT * FROM project_public_links WHERE slug = ?"),
  findPublicLinkForProject: prepare(
    "SELECT * FROM project_public_links WHERE project_id = ? AND slug = ?",
  ),
  findProjectByPublicSlug: prepare(
    `SELECT l.slug AS link_slug, l.access AS link_access, l.created_at AS link_created_at,
            l.password_hash AS link_password_hash,
            p.*, u.username AS owner_username
     FROM project_public_links l
     JOIN projects p ON p.id = l.project_id
     JOIN users u ON u.id = p.user_id
     WHERE l.slug = ?`,
  ),
  createPublicLink: prepare(
    "INSERT INTO project_public_links (slug, project_id, access, created_at, password_hash) VALUES (?, ?, ?, ?, ?)",
  ),
  updatePublicLink: prepare(
    "UPDATE project_public_links SET access = ? WHERE project_id = ? AND slug = ?",
  ),
  updatePublicLinkPassword: prepare(
    "UPDATE project_public_links SET password_hash = ? WHERE project_id = ? AND slug = ?",
  ),
  deletePublicLink: prepare(
    "DELETE FROM project_public_links WHERE project_id = ? AND slug = ?",
  ),
  upsertPublicLinkGrant: prepare(upsertGrantSql),
  deletePublicLinkGrants: prepare(
    "DELETE FROM public_link_grants WHERE project_id = ? AND slug = ?",
  ),
  findActiveEditGrant: prepare(
    `SELECT g.project_id, g.user_id, g.slug, g.permission
     FROM public_link_grants g
     JOIN project_public_links l
       ON l.slug = g.slug AND l.project_id = g.project_id
     WHERE g.project_id = ? AND g.user_id = ?
       AND g.permission = 'edit' AND l.access = 'edit'`,
  ),
  listFolders: prepare(
    "SELECT * FROM project_folders WHERE user_id = ? ORDER BY LOWER(name)",
  ),
  findFolder: prepare(
    "SELECT * FROM project_folders WHERE id = ? AND user_id = ?",
  ),
  createFolder: prepare(
    "INSERT INTO project_folders (id, user_id, name, created_at) VALUES (?, ?, ?, ?)",
  ),
  updateFolder: prepare(
    "UPDATE project_folders SET name = ? WHERE id = ? AND user_id = ?",
  ),
  deleteFolder: prepare(
    "DELETE FROM project_folders WHERE id = ? AND user_id = ?",
  ),
  listFolderItemsForUser: prepare(
    "SELECT folder_id, project_id FROM project_folder_items WHERE user_id = ?",
  ),
  listFolderItems: prepare(
    "SELECT project_id FROM project_folder_items WHERE folder_id = ?",
  ),
  clearProjectFolder: prepare(
    "DELETE FROM project_folder_items WHERE user_id = ? AND project_id = ?",
  ),
  setProjectFolder: prepare(setProjectFolderSql),

  createProject: prepare(
    `INSERT INTO projects (id, user_id, name, description, color, viewport, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  updateProject: prepare(
    `UPDATE projects
     SET name = COALESCE(?, name),
         description = COALESCE(?, description),
         color = COALESCE(?, color),
         viewport = COALESCE(?, viewport),
         updated_at = ?
     WHERE id = ?`,
  ),
  touchProject: prepare("UPDATE projects SET updated_at = ? WHERE id = ?"),
  deleteProject: prepare("DELETE FROM projects WHERE id = ? AND user_id = ?"),

  listNodes: prepare(
    "SELECT * FROM nodes WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
  ),
  listTrashedNodes: prepare(
    "SELECT * FROM nodes WHERE project_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
  ),
  findNode: prepare("SELECT * FROM nodes WHERE id = ? AND project_id = ?"),
  listNodeTitles: prepare("SELECT title FROM nodes WHERE project_id = ?"),
  createNode: prepare(
    `INSERT INTO nodes (id, project_id, ${typeCol}, title, content, preview, x, y, width, height, border_color, status, due_on, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  updateNode: prepare(
    `UPDATE nodes
     SET title = COALESCE(?, title),
         content = COALESCE(?, content),
         preview = COALESCE(?, preview),
         x = COALESCE(?, x),
         y = COALESCE(?, y),
         width = COALESCE(?, width),
         height = COALESCE(?, height),
         border_color = COALESCE(?, border_color),
         status = COALESCE(?, status),
         due_on = COALESCE(?, due_on),
         updated_at = ?
     WHERE id = ? AND project_id = ?`,
  ),
  deleteNode: prepare(
    "UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ? AND deleted_at IS NULL",
  ),
  restoreNode: prepare(
    "UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE id = ? AND project_id = ? AND deleted_at IS NOT NULL",
  ),
  listLiveEdgesForNode: prepare(
    `SELECT e.*
     FROM edges e
     JOIN nodes s ON s.id = e.source_id AND s.deleted_at IS NULL
     JOIN nodes t ON t.id = e.target_id AND t.deleted_at IS NULL
     WHERE e.project_id = ?
       AND (e.source_id = ? OR e.target_id = ?)`,
  ),

  listEdges: prepare(
    `SELECT e.*
     FROM edges e
     JOIN nodes s ON s.id = e.source_id AND s.deleted_at IS NULL
     JOIN nodes t ON t.id = e.target_id AND t.deleted_at IS NULL
     WHERE e.project_id = ?`,
  ),
  createEdge: prepare(
    `INSERT INTO edges (id, project_id, source_id, target_id, source_handle, target_handle, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  updateEdge: prepare(
    "UPDATE edges SET label = ? WHERE id = ? AND project_id = ?",
  ),
  deleteEdge: prepare("DELETE FROM edges WHERE id = ? AND project_id = ?"),

  createUpload: prepare(
    `INSERT INTO uploads (id, user_id, original_name, mime, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  findUpload: prepare("SELECT * FROM uploads WHERE id = ?"),

  listSnapshots: prepare(
    `SELECT s.id, s.project_id, s.user_id, s.name, s.node_count, s.created_at,
            u.username AS created_by
     FROM project_snapshots s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.project_id = ?
     ORDER BY s.created_at DESC`,
  ),
  findSnapshot: prepare(
    "SELECT * FROM project_snapshots WHERE id = ? AND project_id = ?",
  ),
  countSnapshots: prepare(
    "SELECT COUNT(*) AS count FROM project_snapshots WHERE project_id = ?",
  ),
  createSnapshot: prepare(
    `INSERT INTO project_snapshots (id, project_id, user_id, name, payload, node_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  updateSnapshotName: prepare(
    "UPDATE project_snapshots SET name = ? WHERE id = ? AND project_id = ?",
  ),
  deleteSnapshot: prepare(
    "DELETE FROM project_snapshots WHERE id = ? AND project_id = ?",
  ),
  findOldestSnapshot: prepare(
    `SELECT id FROM project_snapshots
     WHERE project_id = ? AND id != ?
     ORDER BY created_at ASC
     LIMIT 1`,
  ),
  deleteLiveNodes: prepare(
    "DELETE FROM nodes WHERE project_id = ? AND deleted_at IS NULL",
  ),
  deleteProjectEdges: prepare("DELETE FROM edges WHERE project_id = ?"),
};

function sqliteSchema() {
  return `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#71717a',
    viewport TEXT NOT NULL DEFAULT '{"x":40,"y":40,"zoom":1}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    public_slug TEXT,
    public_access TEXT NOT NULL DEFAULT 'off',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    preview TEXT,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    width REAL NOT NULL DEFAULT 320,
    height REAL NOT NULL DEFAULT 240,
    border_color TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    due_on TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    source_handle TEXT,
    target_handle TEXT,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_shares (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    permission TEXT NOT NULL DEFAULT 'edit',
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_public_links (
    slug TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    access TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_folder_items (
    folder_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (user_id, project_id),
    FOREIGN KEY (folder_id) REFERENCES project_folders(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS public_link_grants (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    permission TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, user_id, slug),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_snapshots (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`;
}

function postgresSchema() {
  return `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#71717a',
    viewport TEXT NOT NULL DEFAULT '{"x":40,"y":40,"zoom":1}',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT,
    public_slug TEXT,
    public_access TEXT NOT NULL DEFAULT 'off'
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    preview TEXT,
    x DOUBLE PRECISION NOT NULL DEFAULT 0,
    y DOUBLE PRECISION NOT NULL DEFAULT 0,
    width DOUBLE PRECISION NOT NULL DEFAULT 320,
    height DOUBLE PRECISION NOT NULL DEFAULT 240,
    border_color TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    due_on TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT
  );

  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_handle TEXT,
    target_handle TEXT,
    label TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size BIGINT NOT NULL,
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_shares (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    permission TEXT NOT NULL DEFAULT 'edit',
    PRIMARY KEY (project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS project_public_links (
    slug TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    access TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    password_hash TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS project_folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_folder_items (
    folder_id TEXT NOT NULL REFERENCES project_folders(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, project_id)
  );

  CREATE TABLE IF NOT EXISTS public_link_grants (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    permission TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (project_id, user_id, slug)
  );

  CREATE TABLE IF NOT EXISTS project_snapshots (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  );
`;
}

function mysqlSchema() {
  return `
  CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(32) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL,
    avatar_url VARCHAR(2000) NOT NULL DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    expires_at BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    color VARCHAR(32) NOT NULL DEFAULT '#71717a',
    viewport TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    public_slug VARCHAR(32) NULL,
    public_access VARCHAR(16) NOT NULL DEFAULT 'off',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS nodes (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    \`type\` VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT '',
    content LONGTEXT NOT NULL,
    preview TEXT NULL,
    x DOUBLE NOT NULL DEFAULT 0,
    y DOUBLE NOT NULL DEFAULT 0,
    width DOUBLE NOT NULL DEFAULT 320,
    height DOUBLE NOT NULL DEFAULT 240,
    border_color VARCHAR(32) NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL DEFAULT '',
    due_on VARCHAR(32) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS edges (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    source_id VARCHAR(36) NOT NULL,
    target_id VARCHAR(36) NOT NULL,
    source_handle VARCHAR(64) NULL,
    target_handle VARCHAR(64) NULL,
    label VARCHAR(255) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS uploads (
    id VARCHAR(80) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS project_shares (
    project_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    created_at BIGINT NOT NULL,
    permission VARCHAR(16) NOT NULL DEFAULT 'edit',
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS project_public_links (
    slug VARCHAR(16) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    access VARCHAR(16) NOT NULL,
    created_at BIGINT NOT NULL,
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS project_folders (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    name VARCHAR(80) NOT NULL,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS project_folder_items (
    folder_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (user_id, project_id),
    FOREIGN KEY (folder_id) REFERENCES project_folders(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS public_link_grants (
    project_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    slug VARCHAR(16) NOT NULL,
    permission VARCHAR(16) NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (project_id, user_id, slug),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE TABLE IF NOT EXISTS project_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NULL,
    name VARCHAR(120) NOT NULL,
    payload LONGTEXT NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
}

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_edges_project ON edges(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_shares_user ON project_shares(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_public_links_project ON project_public_links(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_folders_user ON project_folders(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_folder_items_folder ON project_folder_items(folder_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_public_slug ON projects(public_slug)",
  "CREATE INDEX IF NOT EXISTS idx_snapshots_project ON project_snapshots(project_id)",
];

async function columnExists(table: string, column: string) {
  const backend = config.dbBackend;
  if (backend === "sqlite") {
    const rows = await sql().all<{ name: string }>(`PRAGMA table_info(${table})`);
    return rows.some((row) => row.name === column);
  }
  if (backend === "postgres") {
    const row = await sql().get<{ exists: boolean | string | number }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = ?
           AND column_name = ?
       ) AS exists`,
      [table, column],
    );
    return row?.exists === true || row?.exists === "t" || Number(row?.exists) === 1;
  }
  const row = await sql().get<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [table, column],
  );
  return Number(row?.count ?? 0) > 0;
}

async function addColumn(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) return;
  const quoted = mysql ? `\`${column}\`` : column;
  await sql().exec(`ALTER TABLE ${table} ADD COLUMN ${quoted} ${definition}`);
}

async function migrateSqliteLegacy() {
  if (config.dbBackend !== "sqlite") return;

  const statements = [
    "ALTER TABLE nodes ADD COLUMN border_color TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN deleted_at INTEGER",
    "ALTER TABLE projects ADD COLUMN public_slug TEXT",
    "ALTER TABLE projects ADD COLUMN public_access TEXT NOT NULL DEFAULT 'off'",
    "ALTER TABLE project_shares ADD COLUMN permission TEXT NOT NULL DEFAULT 'edit'",
    "ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE nodes ADD COLUMN deleted_at INTEGER",
    "ALTER TABLE project_public_links ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE nodes ADD COLUMN status TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE nodes ADD COLUMN due_on TEXT NOT NULL DEFAULT ''",
  ];
  for (const statement of statements) {
    try {
      await sql().exec(statement);
    } catch {
      // column already exists
    }
  }

  try {
    await sql().exec(`
      INSERT OR IGNORE INTO project_public_links (slug, project_id, access, created_at)
      SELECT public_slug, id, public_access, COALESCE(updated_at, created_at)
      FROM projects
      WHERE public_slug IS NOT NULL
        AND TRIM(public_slug) != ''
        AND public_access IN ('view', 'edit')
    `);
  } catch {
    // table may already hold the migrated rows
  }

  const grantSql = await sql().get<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'public_link_grants'",
  );
  if (grantSql && !grantSql.sql.includes("PRIMARY KEY (project_id, user_id, slug)")) {
    await sql().exec("DROP TABLE public_link_grants");
    await sql().exec(`
      CREATE TABLE public_link_grants (
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        permission TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, user_id, slug),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }
}

async function applySchema() {
  const schema =
    config.dbBackend === "sqlite"
      ? sqliteSchema()
      : config.dbBackend === "postgres"
        ? postgresSchema()
        : mysqlSchema();

  const statements = schema
    .split(/;\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql().exec(statement);
  }

  if (config.dbBackend === "sqlite") {
    await migrateSqliteLegacy();
  } else {
    const extra =
      config.dbBackend === "postgres"
        ? [
            ["users", "avatar_url", "TEXT NOT NULL DEFAULT ''"],
            ["projects", "deleted_at", "BIGINT"],
            ["projects", "public_slug", "TEXT"],
            ["projects", "public_access", "TEXT NOT NULL DEFAULT 'off'"],
            ["project_shares", "permission", "TEXT NOT NULL DEFAULT 'edit'"],
            ["nodes", "border_color", "TEXT NOT NULL DEFAULT ''"],
            ["nodes", "deleted_at", "BIGINT"],
            ["project_public_links", "password_hash", "TEXT NOT NULL DEFAULT ''"],
            ["nodes", "status", "TEXT NOT NULL DEFAULT ''"],
            ["nodes", "due_on", "TEXT NOT NULL DEFAULT ''"],
          ]
        : [
            ["users", "avatar_url", "VARCHAR(2000) NOT NULL DEFAULT ''"],
            ["projects", "deleted_at", "BIGINT NULL"],
            ["projects", "public_slug", "VARCHAR(32) NULL"],
            ["projects", "public_access", "VARCHAR(16) NOT NULL DEFAULT 'off'"],
            ["project_shares", "permission", "VARCHAR(16) NOT NULL DEFAULT 'edit'"],
            ["nodes", "border_color", "VARCHAR(32) NOT NULL DEFAULT ''"],
            ["nodes", "deleted_at", "BIGINT NULL"],
            ["project_public_links", "password_hash", "VARCHAR(255) NOT NULL DEFAULT ''"],
            ["nodes", "status", "VARCHAR(16) NOT NULL DEFAULT ''"],
            ["nodes", "due_on", "VARCHAR(32) NOT NULL DEFAULT ''"],
          ];
    for (const [table, column, definition] of extra) {
      await addColumn(table, column, definition);
    }
  }

  for (const index of INDEXES) {
    try {
      await sql().exec(index);
    } catch {
      // unique index on nullable public_slug may already exist
    }
  }
}

export async function initDb() {
  await initSql();
  await applySchema();
  if (Math.random() < 0.25) {
    await queries.deleteExpiredSessions.run(now());
  }
}

export function now() {
  return Date.now();
}

export function publicUser(row: {
  id: string;
  username: string;
  created_at: number;
  avatar_url?: string | null;
}) {
  return {
    id: row.id,
    username: row.username,
    createdAt: Number(row.created_at),
    avatarUrl: safeAvatarUrl(row.avatar_url),
  };
}

export function publicProject(row: ProjectRow) {
  let viewport = { x: 40, y: 40, zoom: 1 };
  try {
    viewport = JSON.parse(row.viewport);
  } catch {
    // keep default
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    viewport,
    nodeCount: Number(row.node_count ?? 0),
    ownerUsername: row.owner_username ?? "",
    role: row.role === "shared" ? "shared" : "owner",
    permission: row.permission === "view" ? "view" : "edit",
    folderId: row.folder_id ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    canManageHistory: row.can_manage_history === true,
  };
}

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newPublicSlug() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let slug = "";
  for (const byte of bytes) slug += SLUG_ALPHABET[byte % 36];
  return slug;
}

function isStoredDueOn(value: string | null | undefined) {
  if (!value) return false;
  const dateTime = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  const dateOnly = dateTime ? null : value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = dateTime ?? dateOnly;
  if (!parts) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = dateTime ? Number(parts[4]) : 0;
  const minute = dateTime ? Number(parts[5]) : 0;
  if (dateTime && (hour > 23 || minute > 59)) return false;
  const date = new Date(year, month - 1, day, hour, minute);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute
  );
}

export function publicNode(row: NodeRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    title: row.title,
    content: row.content,
    preview: row.preview,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    borderColor: row.border_color || "",
    status: row.status === "doing" || row.status === "blocked" || row.status === "done"
      ? row.status
      : row.status === "todo"
        ? "todo"
        : "",
    dueOn: isStoredDueOn(row.due_on) ? row.due_on! : "",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    deletedAt: row.deleted_at != null ? Number(row.deleted_at) : undefined,
  };
}

export function publicEdge(row: EdgeRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    source: row.source_id,
    target: row.target_id,
    sourceHandle: row.source_handle,
    targetHandle: row.target_handle,
    label: row.label,
    createdAt: Number(row.created_at),
  };
}
