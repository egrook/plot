import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { config } from "./config";
import {
  initDb,
  now,
  newPublicSlug,
  publicEdge,
  publicNode,
  publicProject,
  publicUser,
  queries,
  type EdgeRow,
  type NodeRow,
  type ProjectRow,
  type UploadRow,
} from "./db";
import { createHmac } from "node:crypto";
import { getCookie, setCookie } from "hono/cookie";
import {
  clearSessionCookie,
  createSession,
  getSessionUser,
  requireAuth,
  SESSION_COOKIE,
  setSessionCookie,
  type AuthEnv,
} from "./auth";
import { seedStarterProject } from "./seed";
import { initStorage, openUpload, putUpload } from "./storage";
import {
  extForMime,
  extFromFilename,
  isBlockedExt,
  isSafeUploadId,
  MAX_FILE_BYTES,
  MAX_UPLOAD_BYTES,
  mimeForExt,
  newUploadId,
  shouldInlineExt,
  sniffImageMime,
} from "./uploads";

await initDb();
initStorage();

const app = new Hono();
const api = new Hono<AuthEnv>();
const isProd = config.isProd;
const PORT = config.port;

function isPublicApi(path: string, method: string) {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/health" || clean === "/api/health") return true;
  if (method === "GET" && (clean === "/auth/me" || clean === "/api/auth/me")) {
    return true;
  }
  if (
    method === "POST" &&
    (clean === "/auth/login" ||
      clean === "/auth/register" ||
      clean === "/auth/logout" ||
      clean === "/api/auth/login" ||
      clean === "/api/auth/register" ||
      clean === "/api/auth/logout")
  ) {
    return true;
  }
  if (method === "GET" && /^\/(?:api\/)?files\/[^/]+$/.test(clean)) return true;
  if (method === "GET" && /^\/(?:api\/)?s\/[a-z0-9]{4,16}$/i.test(clean)) {
    return true;
  }
  if (method === "POST" && /^\/(?:api\/)?s\/[a-z0-9]{4,16}\/unlock$/i.test(clean)) {
    return true;
  }
  return false;
}

api.use("*", async (c, next) => {
  if (isPublicApi(c.req.path, c.req.method)) {
    await next();
    return;
  }
  return requireAuth(c, next);
});

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseSpaceStatus(value: unknown): "todo" | "doing" | "blocked" | "done" | "" | null {
  if (value === undefined) return null;
  if (value === "todo" || value === "doing" || value === "blocked" || value === "done") {
    return value;
  }
  if (value === "" || value === null) return "";
  return null;
}

function isRealDueStamp(
  year: number,
  month: number,
  day: number,
  hour?: number,
  minute?: number,
) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  if (hour !== undefined && (!Number.isInteger(hour) || hour < 0 || hour > 23)) {
    return false;
  }
  if (minute !== undefined && (!Number.isInteger(minute) || minute < 0 || minute > 59)) {
    return false;
  }
  const date = new Date(year, month - 1, day, hour ?? 0, minute ?? 0);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    (hour === undefined || date.getHours() === hour) &&
    (minute === undefined || date.getMinutes() === minute)
  );
}

function parseDueOn(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null || value === "") return "";
  const raw = asString(value).trim();
  const dateTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (dateTime) {
    const [, year, month, day, hour, minute] = dateTime;
    if (!isRealDueStamp(+year, +month, +day, +hour, +minute)) return null;
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    if (!isRealDueStamp(+year, +month, +day)) return null;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function usernameOk(name: string) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(name);
}

async function projectOwned(projectId: string, userId: string) {
  return queries.findProject.get<ProjectRow>(projectId, userId);
}

function parsePermission(value: unknown): "view" | "edit" {
  return value === "edit" ? "edit" : "view";
}

function parseLinkAccess(value: unknown): "view" | "edit" | null {
  if (value === "view" || value === "edit") return value;
  return null;
}

type PublicLinkRow = {
  slug: string;
  project_id: string;
  access: string;
  created_at: number;
  password_hash?: string | null;
};

type PublicBoardRow = ProjectRow & {
  link_slug: string;
  link_access: string;
  link_created_at: number;
  link_password_hash?: string | null;
};

const LINK_UNLOCK_MS = 1000 * 60 * 60 * 24 * 30;

function linkCookieName(slug: string) {
  return `plot_link_${slug}`;
}

function linkUnlockToken(slug: string, passwordHash: string) {
  return createHmac("sha256", passwordHash).update(slug).digest("base64url");
}

function setLinkUnlockCookie(c: Parameters<typeof setCookie>[0], slug: string, passwordHash: string) {
  setCookie(c, linkCookieName(slug), linkUnlockToken(slug, passwordHash), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: LINK_UNLOCK_MS / 1000,
    secure: config.cookieSecure,
  });
}

async function parseLinkPassword(value: unknown) {
  if (value === undefined) return { kind: "omit" } as const;
  if (value === null) return { kind: "clear" } as const;
  const password = asString(value);
  if (!password) return { kind: "clear" } as const;
  if (password.length < 4) {
    return { kind: "invalid", error: "Link password must be at least 4 characters." } as const;
  }
  if (password.length > 128) {
    return { kind: "invalid", error: "Link password is too long." } as const;
  }
  const hash = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
  return { kind: "set", hash } as const;
}

async function publicLinkUnlocked(
  c: Parameters<typeof getCookie>[0],
  slug: string,
  passwordHash: string | null | undefined,
  userId: string | null,
  project: ProjectRow,
) {
  if (!passwordHash) return true;
  if (userId && project.user_id === userId) return true;
  if (userId) {
    const share = await queries.findShare.get(project.id, userId);
    if (share) return true;
  }
  const token = getCookie(c, linkCookieName(slug));
  return Boolean(token && token === linkUnlockToken(slug, passwordHash));
}

const MAX_PUBLIC_LINKS = 20;

async function allocatePublicSlug() {
  for (let i = 0; i < 8; i++) {
    const candidate = newPublicSlug();
    const taken = await queries.findPublicLink.get<PublicLinkRow>(candidate);
    if (!taken) return candidate;
  }
  return null;
}

function publicLinkJson(row: {
  slug: string;
  access: string;
  created_at: number;
  password_hash?: string | null;
}) {
  return {
    slug: row.slug,
    access: parsePermission(row.access),
    createdAt: Number(row.created_at),
    hasPassword: Boolean(row.password_hash),
  };
}

async function projectAccessible(projectId: string, userId: string) {
  const project = await queries.findProjectById.get<ProjectRow>(projectId);
  if (!project || project.deleted_at) return null;
  if (project.user_id === userId) {
    return { project, role: "owner" as const, permission: "edit" as const };
  }
  const share = await queries.findShare.get<{ permission?: string }>(
    projectId,
    userId,
  );
  if (share) {
    return {
      project,
      role: "shared" as const,
      permission: parsePermission(share.permission),
    };
  }
  const grant = await queries.findActiveEditGrant.get<{ permission?: string }>(
    projectId,
    userId,
  );
  if (grant && parsePermission(grant.permission) === "edit") {
    return { project, role: "shared" as const, permission: "edit" as const };
  }
  return null;
}

async function viewerCanEdit(
  project: ProjectRow,
  userId: string | null,
  linkAccess: "view" | "edit",
) {
  if (!userId) return false;
  if (project.user_id === userId) return true;
  const share = await queries.findShare.get<{ permission?: string }>(
    project.id,
    userId,
  );
  if (share && parsePermission(share.permission) === "edit") return true;
  return linkAccess === "edit";
}

function denyIfViewOnly(permission: "view" | "edit") {
  if (permission !== "edit") {
    return { error: "This board is view only." } as const;
  }
  return null;
}

async function touch(projectId: string) {
  await queries.touchProject.run(now(), projectId);
}

function nextNumberedTitle(titles: string[], base: string) {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = new RegExp(`^${escaped}$`, "i");
  const numbered = new RegExp(`^${escaped} (\\d+)$`, "i");
  let highest = 0;
  for (const title of titles) {
    if (exact.test(title)) highest = Math.max(highest, 1);
    const match = title.match(numbered);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  if (highest === 0) return base;
  return `${base} ${highest + 1}`;
}

api.get("/health", async (c) => {
  await queries.ping.get();
  return c.json({
    ok: true,
    db: config.dbBackend,
    storage: config.storageBackend,
  });
});

api.get("/auth/me", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ user: null });
  const row = await queries.findUserById.get<{
    id: string;
    username: string;
    created_at: number;
    avatar_url?: string;
  }>(user.id);
  return c.json({ user: row ? publicUser(row) : user });
});

api.post("/auth/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = asString(body.username).trim();
  const password = asString(body.password);

  if (!usernameOk(username)) {
    return c.json(
      { error: "Username must be 3–32 letters, numbers, or underscores." },
      400,
    );
  }
  if (password.length < 6) {
    return c.json({ error: "Password must be at least 6 characters." }, 400);
  }
  if (await queries.findUserByUsername.get(username)) {
    return c.json({ error: "That username is already taken." }, 409);
  }

  const id = crypto.randomUUID();
  const hash = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
  const createdAt = now();
  await queries.createUser.run(id, username, hash, createdAt);
  await seedStarterProject(id);
  const token = await createSession(id);
  setSessionCookie(c, token);
  return c.json({ user: publicUser({ id, username, created_at: createdAt }) }, 201);
});

api.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = asString(body.username).trim();
  const password = asString(body.password);
  const row = await queries.findUserByUsername.get<{
    id: string;
    username: string;
    password_hash: string;
    created_at: number;
  }>(username);

  if (!row || !(await Bun.password.verify(password, row.password_hash))) {
    return c.json({ error: "Wrong username or password." }, 401);
  }

  const token = await createSession(row.id);
  setSessionCookie(c, token);
  return c.json({ user: publicUser(row) });
});

api.post("/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await queries.deleteSession.run(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

function avatarUrlOk(value: string) {
  if (!value) return true;
  if (value.length > 2000) return false;
  if (value.startsWith("/api/files/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

api.patch("/auth/password", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const currentPassword = asString(body.currentPassword);
  const newPassword = asString(body.newPassword);
  if (newPassword.length < 6) {
    return c.json({ error: "New password must be at least 6 characters." }, 400);
  }
  const row = await queries.findUserAuthById.get<{ password_hash: string }>(
    user.id,
  );
  if (!row || !(await Bun.password.verify(currentPassword, row.password_hash))) {
    return c.json({ error: "Current password is wrong." }, 400);
  }
  const hash = await Bun.password.hash(newPassword, {
    algorithm: "bcrypt",
    cost: 10,
  });
  await queries.updatePassword.run(hash, user.id);
  return c.json({ ok: true });
});

api.patch("/auth/profile", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const avatarUrl = asString(body.avatarUrl).trim();
  if (!avatarUrlOk(avatarUrl)) {
    return c.json({ error: "Enter an http(s) image URL, or leave it blank." }, 400);
  }
  await queries.updateAvatar.run(avatarUrl, user.id);
  const row = await queries.findUserById.get<{
    id: string;
    username: string;
    created_at: number;
    avatar_url?: string;
  }>(user.id);
  return c.json({ user: row ? publicUser(row) : { ...user, avatarUrl } });
});

api.post("/uploads", requireAuth, async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "Choose an image to upload." }, 400);
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: "Image must be under 8 MB." }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  const ext = mime ? extForMime(mime) : null;
  if (!mime || !ext) {
    return c.json({ error: "Use a PNG, JPEG, GIF, or WebP image." }, 400);
  }

  const id = newUploadId(ext);
  await putUpload(id, bytes, mime);
  const original = file.name.replace(/[^\w.\- ()[\]]+/g, "").slice(0, 120) || `image.${ext}`;
  await queries.createUpload.run(id, user.id, original, mime, bytes.byteLength, now());

  return c.json(
    {
      url: `/api/files/${id}`,
      name: original.replace(/\.[^.]+$/, "") || "image",
    },
    201,
  );
});

api.post("/uploads/file", requireAuth, async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "Choose a file to upload." }, 400);
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return c.json({ error: "File must be under 25 MB." }, 400);
  }

  const ext = extFromFilename(file.name);
  if (isBlockedExt(ext)) {
    return c.json({ error: "That file type is not allowed." }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = newUploadId(ext);
  const mime = mimeForExt(ext, file.type || "application/octet-stream");
  await putUpload(id, bytes, mime);
  const original =
    file.name.replace(/[^\w.\- ()[\]]+/g, "").slice(0, 120) || `file.${ext}`;
  await queries.createUpload.run(id, user.id, original, mime, bytes.byteLength, now());

  return c.json(
    {
      url: `/api/files/${id}`,
      name: original.replace(/\.[^.]+$/, "") || "file",
      ext,
    },
    201,
  );
});

api.get("/files/:id", async (c) => {
  const id = c.req.param("id");
  if (!isSafeUploadId(id)) return c.json({ error: "Not found." }, 404);
  const row = await queries.findUpload.get<UploadRow>(id);
  if (!row) return c.json({ error: "Not found." }, 404);

  const stored = await openUpload(id);
  if (!stored) return c.json({ error: "Not found." }, 404);
  if (stored.kind === "redirect") {
    return c.redirect(stored.url, 302);
  }

  const ext = extFromFilename(id);
  const inline = shouldInlineExt(ext);
  const filename = row.original_name.replace(/["\r\n\\]+/g, "") || `file.${ext}`;
  // Bun S3File cannot be passed to `new Response(file, init)` — stream it.
  const body =
    typeof stored.file.stream === "function" ? stored.file.stream() : stored.file;
  return new Response(body, {
    headers: {
      "Content-Type": inline ? row.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

function extractExcalidrawText(content: string) {
  try {
    const data = JSON.parse(content);
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const parts: string[] = [];
    for (const element of elements) {
      if (!element || typeof element !== "object") continue;
      if (typeof element.text === "string") parts.push(element.text);
      if (typeof element.originalText === "string") parts.push(element.originalText);
      if (element.label && typeof element.label.text === "string") {
        parts.push(element.label.text);
      }
    }
    return parts.join(" ");
  } catch {
    return "";
  }
}

function searchableText(type: string, content: string) {
  if (type === "excalidraw") return extractExcalidrawText(content);
  if (type === "image" || type === "file") return "";
  return content;
}

function snippetAround(text: string, query: string) {
  const hay = text.replace(/\s+/g, " ").trim();
  const index = hay.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return hay.slice(0, 140);
  const start = Math.max(0, index - 40);
  const end = Math.min(hay.length, index + query.length + 80);
  return `${start > 0 ? "…" : ""}${hay.slice(start, end)}${end < hay.length ? "…" : ""}`;
}

api.get("/search", requireAuth, async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 1) return c.json({ results: [] });
  const needle = q.toLowerCase();

  const results: {
    kind: "project" | "node";
    projectId: string;
    projectName: string;
    nodeId?: string;
    nodeType?: string;
    title: string;
    snippet: string;
  }[] = [];

  const projects = await queries.searchProjects.all<ProjectRow>(
    user.id,
    user.id,
    user.id,
  );
  for (const project of projects) {
    const nameHit = project.name.toLowerCase().includes(needle);
    const descHit = project.description.toLowerCase().includes(needle);
    if (nameHit || descHit) {
      results.push({
        kind: "project",
        projectId: project.id,
        projectName: project.name,
        title: project.name,
        snippet: descHit && !nameHit ? snippetAround(project.description, q) : project.description,
      });
    }
  }

  const nodes = await queries.searchNodes.all<NodeRow & { project_name: string }>(
    user.id,
    user.id,
  );
  for (const node of nodes) {
    const body = searchableText(node.type, node.content);
    const titleHit = node.title.toLowerCase().includes(needle);
    const bodyHit = body.toLowerCase().includes(needle);
    if (!titleHit && !bodyHit) continue;
    results.push({
      kind: "node",
      projectId: node.project_id,
      projectName: node.project_name,
      nodeId: node.id,
      nodeType: node.type,
      title: node.title || "Untitled",
      snippet: bodyHit ? snippetAround(body, q) : "",
    });
  }

  return c.json({ results: results.slice(0, 40) });
});

api.use("/projects/*", requireAuth);
api.use("/projects", requireAuth);

api.get("/projects", async (c) => {
  const user = c.get("user");
  const rows = await queries.listProjects.all<ProjectRow>(
    user.id,
    user.id,
    user.id,
    user.id,
    user.id,
  );
  const placements = await queries.listFolderItemsForUser.all<{
    folder_id: string;
    project_id: string;
  }>(user.id);
  const folderByProject = new Map(
    placements.map((item) => [item.project_id, item.folder_id]),
  );
  return c.json({
    projects: rows.map((row) =>
      publicProject({ ...row, folder_id: folderByProject.get(row.id) ?? null }),
    ),
  });
});

function publicFolder(row: {
  id: string;
  name: string;
  created_at: number;
  projectIds?: string[];
}) {
  return {
    id: row.id,
    name: row.name,
    createdAt: Number(row.created_at),
    projectIds: row.projectIds ?? [],
  };
}

api.get("/folders", async (c) => {
  const user = c.get("user");
  const folders = await queries.listFolders.all<{
    id: string;
    name: string;
    created_at: number;
  }>(user.id);
  const items = await queries.listFolderItemsForUser.all<{
    folder_id: string;
    project_id: string;
  }>(user.id);
  const byFolder = new Map<string, string[]>();
  for (const item of items) {
    const list = byFolder.get(item.folder_id) ?? [];
    list.push(item.project_id);
    byFolder.set(item.folder_id, list);
  }
  return c.json({
    folders: folders.map((folder) =>
      publicFolder({ ...folder, projectIds: byFolder.get(folder.id) ?? [] }),
    ),
  });
});

api.post("/folders", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name).trim();
  if (!name) return c.json({ error: "Give the folder a name." }, 400);
  if (name.length > 80) return c.json({ error: "Folder name is too long." }, 400);
  const id = crypto.randomUUID();
  const createdAt = now();
  await queries.createFolder.run(id, user.id, name, createdAt);
  return c.json({ folder: publicFolder({ id, name, created_at: createdAt }) }, 201);
});

api.patch("/folders/:id", async (c) => {
  const user = c.get("user");
  const folder = await queries.findFolder.get<{
    id: string;
    name: string;
    created_at: number;
  }>(c.req.param("id"), user.id);
  if (!folder) return c.json({ error: "Folder not found." }, 404);
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name).trim();
  if (!name) return c.json({ error: "Give the folder a name." }, 400);
  if (name.length > 80) return c.json({ error: "Folder name is too long." }, 400);
  await queries.updateFolder.run(name, folder.id, user.id);
  const items = await queries.listFolderItems.all<{ project_id: string }>(
    folder.id,
  );
  return c.json({
    folder: publicFolder({
      ...folder,
      name,
      projectIds: items.map((item) => item.project_id),
    }),
  });
});

api.delete("/folders/:id", async (c) => {
  const user = c.get("user");
  const result = await queries.deleteFolder.run(c.req.param("id"), user.id);
  if (result.changes === 0) return c.json({ error: "Folder not found." }, 404);
  return c.json({ ok: true });
});

api.put("/projects/:id/folder", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const body = await c.req.json().catch(() => ({}));
  const folderId =
    body.folderId === null || body.folderId === ""
      ? null
      : asString(body.folderId);
  if (folderId) {
    const folder = await queries.findFolder.get(folderId, user.id);
    if (!folder) return c.json({ error: "Folder not found." }, 404);
    await queries.setProjectFolder.run(folderId, access.project.id, user.id);
  } else {
    await queries.clearProjectFolder.run(user.id, access.project.id);
  }
  return c.json({ folderId });
});

api.post("/projects", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name).trim();
  const description = asString(body.description).trim();
  const color = asString(body.color, "#71717a");
  if (!name) return c.json({ error: "Give the project a name." }, 400);

  const id = crypto.randomUUID();
  const t = now();
  await queries.createProject.run(
    id,
    user.id,
    name,
    description,
    color,
    JSON.stringify({ x: 40, y: 40, zoom: 1 }),
    t,
    t,
  );
  const folderId =
    body.folderId === null || body.folderId === undefined || body.folderId === ""
      ? null
      : asString(body.folderId);
  if (folderId) {
    const folder = await queries.findFolder.get(folderId, user.id);
    if (folder) await queries.setProjectFolder.run(folderId, id, user.id);
  }
  const row = (await queries.findProject.get<ProjectRow>(id, user.id))!;
  return c.json({
    project: {
      ...publicProject({ ...row, folder_id: folderId }),
      nodeCount: 0,
    },
  }, 201);
});

api.post("/projects/:id/duplicate", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const source = access.project;

  const existing = await queries.listProjects.all<ProjectRow>(
    user.id,
    user.id,
    user.id,
    user.id,
    user.id,
  );
  const name = nextNumberedTitle(
    existing.map((row) => row.name),
    `${source.name} copy`,
  );

  const id = crypto.randomUUID();
  const t = now();
  await queries.createProject.run(
    id,
    user.id,
    name,
    source.description,
    source.color,
    source.viewport,
    t,
    t,
  );

  const nodes = await queries.listNodes.all<NodeRow>(source.id);
  const idMap = new Map<string, string>();
  for (const node of nodes) {
    const nodeId = crypto.randomUUID();
    idMap.set(node.id, nodeId);
    await queries.createNode.run(
      nodeId,
      id,
      node.type,
      node.title,
      node.content,
      node.preview,
      node.x,
      node.y,
      node.width,
      node.height,
      node.border_color,
      node.status || "todo",
      parseDueOn(node.due_on ?? "") ?? "",
      t,
      t,
    );
  }

  const edges = await queries.listEdges.all<EdgeRow>(source.id);
  for (const edge of edges) {
    const sourceId = idMap.get(edge.source_id);
    const targetId = idMap.get(edge.target_id);
    if (!sourceId || !targetId) continue;
    await queries.createEdge.run(
      crypto.randomUUID(),
      id,
      sourceId,
      targetId,
      edge.source_handle,
      edge.target_handle,
      edge.label,
      t,
    );
  }

  const placements = await queries.listFolderItemsForUser.all<{
    folder_id: string;
    project_id: string;
  }>(user.id);
  const folderId =
    placements.find((item) => item.project_id === source.id)?.folder_id ?? null;
  if (folderId) {
    const folder = await queries.findFolder.get(folderId, user.id);
    if (folder) await queries.setProjectFolder.run(folderId, id, user.id);
  }

  const row = (await queries.findProject.get<ProjectRow>(id, user.id))!;
  return c.json(
    {
      project: publicProject({
        ...row,
        role: "owner",
        permission: "edit",
        folder_id: folderId,
        node_count: nodes.length,
      }),
    },
    201,
  );
});

api.get("/projects/:id", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const { project, role, permission } = access;
  const nodes = await queries.listNodes.all<NodeRow>(project.id);
  const edges = await queries.listEdges.all<EdgeRow>(project.id);
  return c.json({
    project: publicProject({
      ...project,
      role,
      permission,
      can_manage_history: await canManageSnapshots(project.id, user.id, role),
      node_count: nodes.length,
    }),
    nodes: nodes.map(publicNode),
    edges: edges.map(publicEdge),
  });
});

const MAX_SNAPSHOTS = 30;

type SnapshotRow = {
  id: string;
  project_id: string;
  user_id: string | null;
  name: string;
  payload: string;
  node_count: number;
  created_at: number;
  created_by?: string | null;
};

function publicSnapshot(
  row: Omit<SnapshotRow, "payload"> & { payload?: string; created_by?: string | null },
) {
  return {
    id: row.id,
    name: row.name,
    nodeCount: Number(row.node_count ?? 0),
    createdAt: Number(row.created_at),
    createdBy: row.created_by ?? "",
  };
}

async function canManageSnapshots(
  projectId: string,
  userId: string,
  role: "owner" | "shared",
) {
  if (role === "owner") return true;
  const share = await queries.findShare.get<{ permission?: string }>(
    projectId,
    userId,
  );
  return Boolean(share && parsePermission(share.permission) === "edit");
}

function defaultSnapshotName(at: number) {
  return new Date(at).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function captureBoardSnapshot(
  project: ProjectRow,
  userId: string,
  name: string,
) {
  const nodes = await queries.listNodes.all<NodeRow>(project.id);
  const edges = await queries.listEdges.all<EdgeRow>(project.id);
  const id = crypto.randomUUID();
  const t = now();
  await queries.createSnapshot.run(
    id,
    project.id,
    userId,
    name.slice(0, 120) || defaultSnapshotName(t),
    JSON.stringify({
      viewport: project.viewport,
      nodes,
      edges,
    }),
    nodes.length,
    t,
  );
  return {
    id,
    project_id: project.id,
    user_id: userId,
    name: name.slice(0, 120) || defaultSnapshotName(t),
    node_count: nodes.length,
    created_at: t,
  };
}

async function pruneSnapshots(projectId: string, keepId = "") {
  for (;;) {
    const countRow = await queries.countSnapshots.get<{ count: number }>(
      projectId,
    );
    if (Number(countRow?.count ?? 0) <= MAX_SNAPSHOTS) return;
    const oldest = await queries.findOldestSnapshot.get<{ id: string }>(
      projectId,
      keepId,
    );
    if (!oldest) return;
    await queries.deleteSnapshot.run(oldest.id, projectId);
  }
}

api.get("/projects/:id/snapshots", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const rows = await queries.listSnapshots.all<Omit<SnapshotRow, "payload">>(
    access.project.id,
  );
  return c.json({ snapshots: rows.map(publicSnapshot) });
});

api.post("/projects/:id/snapshots", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  if (!(await canManageSnapshots(access.project.id, user.id, access.role))) {
    return c.json({ error: "Only people invited to edit can save versions." }, 403);
  }

  const countRow = await queries.countSnapshots.get<{ count: number }>(
    access.project.id,
  );
  if (Number(countRow?.count ?? 0) >= MAX_SNAPSHOTS) {
    return c.json(
      { error: "This board already has the maximum number of versions." },
      400,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name).trim() || defaultSnapshotName(now());
  const row = await captureBoardSnapshot(access.project, user.id, name);
  return c.json({
    snapshot: publicSnapshot({ ...row, created_by: user.username }),
  }, 201);
});

api.patch("/projects/:id/snapshots/:snapshotId", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  if (!(await canManageSnapshots(access.project.id, user.id, access.role))) {
    return c.json({ error: "Only people invited to edit can change versions." }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name).trim();
  if (!name) return c.json({ error: "Give the snapshot a name." }, 400);
  if (name.length > 120) return c.json({ error: "Name is too long." }, 400);
  const result = await queries.updateSnapshotName.run(
    name,
    c.req.param("snapshotId"),
    access.project.id,
  );
  if (result.changes === 0) return c.json({ error: "Snapshot not found." }, 404);
  const row = await queries.findSnapshot.get<SnapshotRow>(
    c.req.param("snapshotId"),
    access.project.id,
  );
  return c.json({
    snapshot: publicSnapshot({ ...row!, created_by: user.username }),
  });
});

api.delete("/projects/:id/snapshots/:snapshotId", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  if (!(await canManageSnapshots(access.project.id, user.id, access.role))) {
    return c.json({ error: "Only people invited to edit can change versions." }, 403);
  }
  const result = await queries.deleteSnapshot.run(
    c.req.param("snapshotId"),
    access.project.id,
  );
  if (result.changes === 0) return c.json({ error: "Snapshot not found." }, 404);
  return c.json({ ok: true });
});

api.post("/projects/:id/snapshots/:snapshotId/restore", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  if (!(await canManageSnapshots(access.project.id, user.id, access.role))) {
    return c.json({ error: "Only people invited to edit can restore versions." }, 403);
  }
  const project = access.project;
  const snapshot = await queries.findSnapshot.get<SnapshotRow>(
    c.req.param("snapshotId"),
    project.id,
  );
  if (!snapshot) return c.json({ error: "Snapshot not found." }, 404);

  let data: { viewport?: string; nodes?: NodeRow[]; edges?: EdgeRow[] };
  try {
    data = JSON.parse(snapshot.payload);
  } catch {
    return c.json({ error: "That snapshot is unreadable." }, 500);
  }
  const snapNodes = Array.isArray(data.nodes) ? data.nodes : [];
  const snapEdges = Array.isArray(data.edges) ? data.edges : [];

  const backup = await captureBoardSnapshot(
    project,
    user.id,
    `Before restoring ${snapshot.name}`.slice(0, 120),
  );
  const backupPublic = publicSnapshot({ ...backup, created_by: user.username });
  await pruneSnapshots(project.id, snapshot.id);

  await queries.deleteProjectEdges.run(project.id);
  await queries.deleteLiveNodes.run(project.id);

  const t = now();
  const idMap = new Map<string, string>();
  for (const node of snapNodes) {
    const type = asString(node.type);
    if (
      type !== "markdown" &&
      type !== "excalidraw" &&
      type !== "image" &&
      type !== "file"
    ) {
      continue;
    }
    const nodeId = crypto.randomUUID();
    idMap.set(node.id, nodeId);
    await queries.createNode.run(
      nodeId,
      project.id,
      type,
      asString(node.title),
      asString(node.content),
      node.preview ?? null,
      Number(node.x) || 0,
      Number(node.y) || 0,
      Number(node.width) || 320,
      Number(node.height) || 240,
      asString(node.border_color),
      parseSpaceStatus(node.status) ?? "",
      parseDueOn(node.due_on ?? "") ?? "",
      Number(node.created_at) || t,
      t,
    );
  }

  for (const edge of snapEdges) {
    const sourceId = idMap.get(edge.source_id);
    const targetId = idMap.get(edge.target_id);
    if (!sourceId || !targetId) continue;
    await queries.createEdge.run(
      crypto.randomUUID(),
      project.id,
      sourceId,
      targetId,
      edge.source_handle ?? null,
      edge.target_handle ?? null,
      asString(edge.label),
      Number(edge.created_at) || t,
    );
  }

  const viewport =
    typeof data.viewport === "string" && data.viewport
      ? data.viewport
      : project.viewport;
  await queries.updateProject.run(null, null, null, viewport, t, project.id);

  const row = (await queries.findProjectById.get<ProjectRow>(project.id))!;
  const nodes = await queries.listNodes.all<NodeRow>(project.id);
  const edges = await queries.listEdges.all<EdgeRow>(project.id);
  return c.json({
    project: publicProject({
      ...row,
      role: access.role,
      permission: access.permission,
      owner_username: row.owner_username || access.project.owner_username,
      can_manage_history: true,
      node_count: nodes.length,
    }),
    nodes: nodes.map(publicNode),
    edges: edges.map(publicEdge),
    backup: backupPublic,
  });
});

api.patch("/projects/:id", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const { project, role, permission } = access;
  const denied = denyIfViewOnly(permission);
  if (denied) return c.json(denied, 403);
  const body = await c.req.json().catch(() => ({}));

  const canEditMeta = role === "owner";
  const name = !canEditMeta
    ? null
    : body.name === undefined
      ? null
      : asString(body.name).trim() || project.name;
  const description = !canEditMeta
    ? null
    : body.description === undefined
      ? null
      : asString(body.description);
  const color = !canEditMeta
    ? null
    : body.color === undefined
      ? null
      : asString(body.color);
  const viewport =
    body.viewport === undefined ? null : JSON.stringify(body.viewport);

  await queries.updateProject.run(
    name,
    description,
    color,
    viewport,
    now(),
    project.id,
  );
  const row = (await queries.findProjectById.get<ProjectRow>(project.id))!;
  return c.json({ project: publicProject({ ...row, role, permission }) });
});

api.delete("/projects/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const t = now();
  const result = await queries.trashProject.run(t, t, id, user.id);
  if (result.changes === 0) return c.json({ error: "Project not found." }, 404);
  await queries.clearShares.run(id);
  return c.json({ ok: true });
});

api.get("/trash", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await queries.listTrash.all<ProjectRow>(user.id);
  return c.json({
    projects: rows.map((row) => ({
      ...publicProject({ ...row, role: "owner", owner_username: user.username }),
      deletedAt: Number(row.deleted_at ?? 0),
    })),
  });
});

api.post("/trash/:id/restore", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await queries.restoreProject.run(now(), c.req.param("id"), user.id);
  if (result.changes === 0) return c.json({ error: "Nothing to restore." }, 404);
  return c.json({ ok: true });
});

api.delete("/trash/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await queries.purgeProject.run(c.req.param("id"), user.id);
  if (result.changes === 0) return c.json({ error: "Nothing to delete." }, 404);
  return c.json({ ok: true });
});

api.get("/s/:slug", async (c) => {
  const slug = c.req.param("slug").toLowerCase();
  if (!/^[a-z0-9]{4,16}$/.test(slug)) {
    return c.json({ error: "Share link not found." }, 404);
  }
  const row = await queries.findProjectByPublicSlug.get<PublicBoardRow>(slug);
  const linkAccess = row ? parseLinkAccess(row.link_access) : null;
  if (!row || row.deleted_at || !linkAccess) {
    return c.json({ error: "Share link not found." }, 404);
  }

  const user = await getSessionUser(c);
  const unlocked = await publicLinkUnlocked(
    c,
    slug,
    row.link_password_hash,
    user?.id ?? null,
    row,
  );
  if (!unlocked) {
    return c.json(
      { error: "This link is locked.", passwordRequired: true },
      401,
    );
  }

  if (user && linkAccess === "edit") {
    await queries.upsertPublicLinkGrant.run(
      row.id,
      user.id,
      slug,
      "edit",
      now(),
    );
  }
  const canEdit = await viewerCanEdit(row, user?.id ?? null, linkAccess);
  const nodes = await queries.listNodes.all<NodeRow>(row.id);
  const edges = await queries.listEdges.all<EdgeRow>(row.id);
  return c.json({
    project: publicProject({
      ...row,
      role: row.user_id === user?.id ? "owner" : "shared",
      permission: canEdit ? "edit" : "view",
      node_count: nodes.length,
    }),
    nodes: nodes.map(publicNode),
    edges: edges.map(publicEdge),
    canEdit,
  });
});

api.post("/s/:slug/unlock", async (c) => {
  const slug = c.req.param("slug").toLowerCase();
  if (!/^[a-z0-9]{4,16}$/.test(slug)) {
    return c.json({ error: "Share link not found." }, 404);
  }
  const row = await queries.findProjectByPublicSlug.get<PublicBoardRow>(slug);
  const linkAccess = row ? parseLinkAccess(row.link_access) : null;
  if (!row || row.deleted_at || !linkAccess) {
    return c.json({ error: "Share link not found." }, 404);
  }
  if (!row.link_password_hash) {
    return c.json({ ok: true });
  }

  const body = await c.req.json().catch(() => ({}));
  const password = asString(body.password);
  const ok = await Bun.password.verify(password, row.link_password_hash);
  if (!ok) {
    return c.json({ error: "Wrong password." }, 401);
  }
  setLinkUnlockCookie(c, slug, row.link_password_hash);
  return c.json({ ok: true });
});

api.get("/projects/:id/shares", async (c) => {
  const user = c.get("user");
  const project = await projectOwned(c.req.param("id"), user.id);
  if (!project) return c.json({ error: "Only the owner can manage sharing." }, 403);
  const rows = await queries.listShares.all<{
    id: string;
    username: string;
    created_at: number;
    permission?: string;
  }>(project.id);
  return c.json({
    shares: rows.map((row) => ({
      userId: row.id,
      username: row.username,
      createdAt: Number(row.created_at),
      permission: parsePermission(row.permission),
    })),
    links: (
      await queries.listPublicLinks.all<{
        slug: string;
        access: string;
        created_at: number;
        password_hash?: string | null;
      }>(project.id)
    ).map(publicLinkJson),
  });
});

api.post("/projects/:id/shares", async (c) => {
  const user = c.get("user");
  const project = await projectOwned(c.req.param("id"), user.id);
  if (!project) return c.json({ error: "Only the owner can manage sharing." }, 403);
  const body = await c.req.json().catch(() => ({}));
  const username = asString(body.username).trim();
  if (!usernameOk(username)) {
    return c.json({ error: "Enter an exact username." }, 400);
  }
  const target = await queries.findUserByUsername.get<{
    id: string;
    username: string;
  }>(username);
  if (!target) return c.json({ error: "No user with that username." }, 404);
  if (target.id === user.id) {
    return c.json({ error: "You already own this board." }, 400);
  }
  if (await queries.findShare.get(project.id, target.id)) {
    return c.json({ error: "Already shared with that user." }, 409);
  }
  const permissionRaw = asString(body.permission, "edit");
  if (permissionRaw !== "view" && permissionRaw !== "edit") {
    return c.json({ error: "Permission must be view or edit." }, 400);
  }
  await queries.addShare.run(project.id, target.id, now(), permissionRaw);
  return c.json(
    {
      share: {
        userId: target.id,
        username: target.username,
        createdAt: now(),
        permission: permissionRaw,
      },
    },
    201,
  );
});

api.patch("/projects/:id/shares/:userId", async (c) => {
  const user = c.get("user");
  const project = await projectOwned(c.req.param("id"), user.id);
  if (!project) return c.json({ error: "Only the owner can manage sharing." }, 403);
  const body = await c.req.json().catch(() => ({}));
  const permission = asString(body.permission);
  if (permission !== "view" && permission !== "edit") {
    return c.json({ error: "Permission must be view or edit." }, 400);
  }
  const result = await queries.updateSharePermission.run(
    permission,
    project.id,
    c.req.param("userId"),
  );
  if (result.changes === 0) {
    return c.json({ error: "Share not found." }, 404);
  }
  return c.json({ ok: true, permission });
});

api.post("/projects/:id/links", async (c) => {
  const user = c.get("user");
  const project = await projectOwned(c.req.param("id"), user.id);
  if (!project) return c.json({ error: "Only the owner can manage sharing." }, 403);
  const body = await c.req.json().catch(() => ({}));
  const access = parseLinkAccess(asString(body.access, "view"));
  if (!access) return c.json({ error: "Permission must be view or edit." }, 400);

  const countRow = await queries.countPublicLinks.get<{ count: number }>(
    project.id,
  );
  if (Number(countRow?.count ?? 0) >= MAX_PUBLIC_LINKS) {
    return c.json({ error: "This board already has the maximum number of links." }, 400);
  }

  const password = await parseLinkPassword(body.password);
  if (password.kind === "invalid") {
    return c.json({ error: password.error }, 400);
  }

  const slug = await allocatePublicSlug();
  if (!slug) return c.json({ error: "Could not create a share link." }, 500);

  const createdAt = now();
  const passwordHash = password.kind === "set" ? password.hash : "";
  await queries.createPublicLink.run(
    slug,
    project.id,
    access,
    createdAt,
    passwordHash,
  );
  return c.json(
    {
      link: publicLinkJson({
        slug,
        access,
        created_at: createdAt,
        password_hash: passwordHash,
      }),
    },
    201,
  );
});

api.patch("/projects/:id/links/:slug", async (c) => {
  const user = c.get("user");
  const project = await projectOwned(c.req.param("id"), user.id);
  if (!project) return c.json({ error: "Only the owner can manage sharing." }, 403);
  const slug = c.req.param("slug").toLowerCase();
  const body = await c.req.json().catch(() => ({}));
  const access =
    body.access === undefined
      ? null
      : parseLinkAccess(asString(body.access));
  if (body.access !== undefined && !access) {
    return c.json({ error: "Permission must be view or edit." }, 400);
  }
  const password = await parseLinkPassword(body.password);
  if (password.kind === "invalid") {
    return c.json({ error: password.error }, 400);
  }

  const existing = await queries.findPublicLinkForProject.get<PublicLinkRow>(
    project.id,
    slug,
  );
  if (!existing) return c.json({ error: "Share link not found." }, 404);

  const nextAccess = access ?? parsePermission(existing.access);
  if (access) {
    await queries.updatePublicLink.run(access, project.id, slug);
    if (access === "view") {
      await queries.deletePublicLinkGrants.run(project.id, slug);
    }
  }
  let passwordHash = existing.password_hash ?? "";
  if (password.kind === "set") {
    passwordHash = password.hash;
    await queries.updatePublicLinkPassword.run(passwordHash, project.id, slug);
  } else if (password.kind === "clear") {
    passwordHash = "";
    await queries.updatePublicLinkPassword.run("", project.id, slug);
  }
  return c.json({
    link: publicLinkJson({
      ...existing,
      access: nextAccess,
      password_hash: passwordHash,
    }),
  });
});

api.delete("/projects/:id/links/:slug", async (c) => {
  const user = c.get("user");
  const project = await projectOwned(c.req.param("id"), user.id);
  if (!project) return c.json({ error: "Only the owner can manage sharing." }, 403);
  const slug = c.req.param("slug").toLowerCase();
  const result = await queries.deletePublicLink.run(project.id, slug);
  if (result.changes === 0) {
    return c.json({ error: "Share link not found." }, 404);
  }
  await queries.deletePublicLinkGrants.run(project.id, slug);
  return c.json({ ok: true });
});

api.delete("/projects/:id/shares/:userId", async (c) => {
  const user = c.get("user");
  const project = await projectOwned(c.req.param("id"), user.id);
  if (!project) return c.json({ error: "Only the owner can manage sharing." }, 403);
  await queries.removeShare.run(project.id, c.req.param("userId"));
  return c.json({ ok: true });
});

api.post("/projects/:id/nodes", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const denied = denyIfViewOnly(access.permission);
  if (denied) return c.json(denied, 403);
  const project = access.project;
  const body = await c.req.json().catch(() => ({}));
  const type = asString(body.type);
  if (
    type !== "markdown" &&
    type !== "excalidraw" &&
    type !== "image" &&
    type !== "file"
  ) {
    return c.json({ error: "Unknown space type." }, 400);
  }

  const id = crypto.randomUUID();
  const t = now();
  const baseTitle =
    asString(body.title).trim() ||
    (type === "markdown"
      ? "Untitled note"
      : type === "image"
        ? "Untitled image"
        : type === "file"
          ? "Untitled file"
          : "Untitled drawing");
  const existingTitles = (
    await queries.listNodeTitles.all<{ title: string }>(project.id)
  ).map((row) => row.title);
  const title = nextNumberedTitle(existingTitles, baseTitle);
  const content =
    type === "excalidraw"
      ? JSON.stringify({
          elements: [],
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
        })
      : asString(body.content);
  if (type === "file" && !content) {
    return c.json({ error: "Upload a file first." }, 400);
  }
  const preview =
    type === "file" ? asString(body.preview).toLowerCase().slice(0, 8) || null : null;
  const x = asNumber(body.x) ?? 120;
  const y = asNumber(body.y) ?? 120;
  const width =
    asNumber(body.width) ??
    (type === "markdown" ? 340 : type === "image" ? 360 : type === "file" ? 220 : 400);
  const height =
    asNumber(body.height) ??
    (type === "markdown" ? 280 : type === "image" ? 280 : type === "file" ? 88 : 300);

  if (body.status !== undefined && parseSpaceStatus(body.status) === null) {
    return c.json({ error: "Status must be todo, doing, blocked, or done." }, 400);
  }
  const rawDue = body.dueOn !== undefined ? body.dueOn : body.due_on;
  if (rawDue !== undefined && rawDue !== null && rawDue !== "" && parseDueOn(rawDue) === null) {
    return c.json({ error: "Due date must include a valid date and time." }, 400);
  }

  await queries.createNode.run(
    id,
    project.id,
    type,
    title,
    content,
    preview,
    x,
    y,
    width,
    height,
    asString(body.borderColor),
    parseSpaceStatus(body.status) ?? "todo",
    parseDueOn(body.dueOn !== undefined ? body.dueOn : body.due_on ?? "") ?? "",
    t,
    t,
  );
  await touch(project.id);
  const row = (await queries.findNode.get<NodeRow>(id, project.id))!;
  return c.json({ node: publicNode(row) }, 201);
});

api.patch("/projects/:id/nodes/:nodeId", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const denied = denyIfViewOnly(access.permission);
  if (denied) return c.json(denied, 403);
  const project = access.project;
  const nodeId = c.req.param("nodeId");
  const existing = await queries.findNode.get<NodeRow>(nodeId, project.id);
  if (!existing || existing.deleted_at) {
    return c.json({ error: "Space not found." }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const title = body.title === undefined ? null : asString(body.title);
  const content = body.content === undefined ? null : asString(body.content);
  const preview = body.preview === undefined ? null : body.preview;
  const x = body.x === undefined ? null : asNumber(body.x);
  const y = body.y === undefined ? null : asNumber(body.y);
  const width = body.width === undefined ? null : asNumber(body.width);
  const height = body.height === undefined ? null : asNumber(body.height);
  const borderColor =
    body.borderColor === undefined ? null : asString(body.borderColor);
  if (body.status !== undefined && parseSpaceStatus(body.status) === null) {
    return c.json({ error: "Status must be todo, doing, blocked, or done." }, 400);
  }
  const status = parseSpaceStatus(body.status);
  if (body.dueOn !== undefined || body.due_on !== undefined) {
    const rawDue = body.dueOn !== undefined ? body.dueOn : body.due_on;
    if (rawDue !== null && rawDue !== "" && parseDueOn(rawDue) === null) {
      return c.json({ error: "Due date must include a valid date and time." }, 400);
    }
  }
  const dueOn =
    body.dueOn === undefined && body.due_on === undefined
      ? null
      : parseDueOn(body.dueOn ?? body.due_on ?? "") ?? "";

  await queries.updateNode.run(
    title,
    content,
    preview,
    x,
    y,
    width,
    height,
    borderColor,
    status,
    dueOn,
    now(),
    nodeId,
    project.id,
  );
  await touch(project.id);
  const row = (await queries.findNode.get<NodeRow>(nodeId, project.id))!;
  return c.json({ node: publicNode(row) });
});

api.delete("/projects/:id/nodes/:nodeId", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const denied = denyIfViewOnly(access.permission);
  if (denied) return c.json(denied, 403);
  const project = access.project;
  const t = now();
  const result = await queries.deleteNode.run(
    t,
    t,
    c.req.param("nodeId"),
    project.id,
  );
  if (result.changes === 0) return c.json({ error: "Space not found." }, 404);
  await touch(project.id);
  return c.json({ ok: true });
});

api.get("/projects/:id/trashed-nodes", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const rows = await queries.listTrashedNodes.all<NodeRow>(access.project.id);
  return c.json({ nodes: rows.map(publicNode) });
});

api.post("/projects/:id/nodes/:nodeId/restore", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const denied = denyIfViewOnly(access.permission);
  if (denied) return c.json(denied, 403);
  const project = access.project;
  const nodeId = c.req.param("nodeId");
  const result = await queries.restoreNode.run(now(), nodeId, project.id);
  if (result.changes === 0) return c.json({ error: "Nothing to restore." }, 404);
  await touch(project.id);
  const row = (await queries.findNode.get<NodeRow>(nodeId, project.id))!;
  const edges = await queries.listLiveEdgesForNode.all<EdgeRow>(
    project.id,
    nodeId,
    nodeId,
  );
  return c.json({ node: publicNode(row), edges: edges.map(publicEdge) });
});

api.post("/projects/:id/edges", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const denied = denyIfViewOnly(access.permission);
  if (denied) return c.json(denied, 403);
  const project = access.project;
  const body = await c.req.json().catch(() => ({}));
  const source = asString(body.source);
  const target = asString(body.target);
  if (!source || !target || source === target) {
    return c.json({ error: "A link needs two different spaces." }, 400);
  }
  const sourceNode = await queries.findNode.get<NodeRow>(source, project.id);
  const targetNode = await queries.findNode.get<NodeRow>(target, project.id);
  if (!sourceNode || !targetNode || sourceNode.deleted_at || targetNode.deleted_at) {
    return c.json({ error: "Both ends of the link must exist." }, 400);
  }

  const id = asString(body.id) || crypto.randomUUID();
  await queries.createEdge.run(
    id,
    project.id,
    source,
    target,
    body.sourceHandle ?? null,
    body.targetHandle ?? null,
    asString(body.label),
    now(),
  );
  await touch(project.id);
  const rows = await queries.listEdges.all<EdgeRow>(project.id);
  const row = rows.find((edge) => edge.id === id);
  return c.json({ edge: publicEdge(row!) }, 201);
});

api.patch("/projects/:id/edges/:edgeId", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const denied = denyIfViewOnly(access.permission);
  if (denied) return c.json(denied, 403);
  const project = access.project;
  const body = await c.req.json().catch(() => ({}));
  await queries.updateEdge.run(
    asString(body.label),
    c.req.param("edgeId"),
    project.id,
  );
  return c.json({ ok: true });
});

api.delete("/projects/:id/edges/:edgeId", async (c) => {
  const user = c.get("user");
  const access = await projectAccessible(c.req.param("id"), user.id);
  if (!access) return c.json({ error: "Project not found." }, 404);
  const denied = denyIfViewOnly(access.permission);
  if (denied) return c.json(denied, 403);
  const project = access.project;
  await queries.deleteEdge.run(c.req.param("edgeId"), project.id);
  await touch(project.id);
  return c.json({ ok: true });
});

app.route("/api", api);

if (isProd) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

export default {
  port: PORT,
  fetch: app.fetch,
};

const host = config.appUrl || `http://127.0.0.1:${PORT}`;
console.log(
  isProd
    ? `Plot running on ${host} (db=${config.dbBackend} storage=${config.storageBackend})`
    : `Plot API running on http://127.0.0.1:${PORT} (db=${config.dbBackend} storage=${config.storageBackend})`,
);
