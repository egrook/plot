import { toast } from "@/lib/toast";
import type {
  AccessPermission,
  AdminUser,
  Project,
  ProjectFolder,
  ProjectGraph,
  ProjectShare,
  ProjectSnapshot,
  PublicAccess,
  PublicBoard,
  PublicLink,
  SearchHit,
  SpaceEdge,
  SpaceNode,
  SpaceStatus,
  SpaceType,
  User,
  Viewport,
} from "./types";

export class ApiError extends Error {
  status: number;
  passwordRequired: boolean;
  constructor(message: string, status: number, passwordRequired = false) {
    super(message);
    this.status = status;
    this.passwordRequired = passwordRequired;
  }
}

function notifyRequestError(path: string, error: ApiError) {
  const clean = path.split("?")[0];
  if (
    clean === "/api/auth/me" ||
    clean === "/api/auth/login" ||
    clean === "/api/auth/register" ||
    clean === "/api/auth/logout"
  ) {
    return;
  }
  if (error.passwordRequired || clean.startsWith("/api/s/")) return;
  if (error.status === 403) {
    toast.error(error.message || "You don't have permission to do that.");
    return;
  }
  if (error.status === 401) {
    toast.error("Your session expired. Sign in again.");
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new ApiError(
      data.error || "Request failed",
      res.status,
      Boolean(data.passwordRequired),
    );
    notifyRequestError(path, error);
    throw error;
  }
  return data as T;
}

export const api = {
  me: () =>
    request<{ user: User | null; registrationEnabled?: boolean }>("/api/auth/me"),
  register: (username: string, password: string) =>
    request<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  updatePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/api/auth/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updateProfile: (input: { avatarUrl: string }) =>
    request<{ user: User }>("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  listAdminUsers: () => request<{ users: AdminUser[] }>("/api/admin/users"),
  createAdminUser: (username: string, password: string) =>
    request<{ user: AdminUser }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  setAdminUserPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    }),
  deleteAdminUser: (id: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),

  listProjects: () => request<{ projects: Project[] }>("/api/projects"),
  listFolders: () => request<{ folders: ProjectFolder[] }>("/api/folders"),
  createFolder: (name: string) =>
    request<{ folder: ProjectFolder }>("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  updateFolder: (id: string, name: string) =>
    request<{ folder: ProjectFolder }>(`/api/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteFolder: (id: string) =>
    request<{ ok: true }>(`/api/folders/${id}`, { method: "DELETE" }),
  setProjectFolder: (projectId: string, folderId: string | null) =>
    request<{ folderId: string | null }>(`/api/projects/${projectId}/folder`, {
      method: "PUT",
      body: JSON.stringify({ folderId }),
    }),
  search: (q: string) =>
    request<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  createProject: (input: {
    name: string;
    description: string;
    color: string;
    folderId?: string | null;
  }) =>
    request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getProject: (id: string) => request<ProjectGraph>(`/api/projects/${id}`),
  updateProject: (
    id: string,
    input: Partial<{
      name: string;
      description: string;
      color: string;
      viewport: Viewport;
    }>,
  ) =>
    request<{ project: Project }>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteProject: (id: string) =>
    request<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" }),
  duplicateProject: (id: string) =>
    request<{ project: Project }>(`/api/projects/${id}/duplicate`, {
      method: "POST",
    }),
  listSnapshots: (id: string) =>
    request<{ snapshots: ProjectSnapshot[] }>(`/api/projects/${id}/snapshots`),
  createSnapshot: (id: string, name?: string) =>
    request<{ snapshot: ProjectSnapshot }>(`/api/projects/${id}/snapshots`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  updateSnapshot: (id: string, snapshotId: string, name: string) =>
    request<{ snapshot: ProjectSnapshot }>(
      `/api/projects/${id}/snapshots/${snapshotId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name }),
      },
    ),
  deleteSnapshot: (id: string, snapshotId: string) =>
    request<{ ok: true }>(`/api/projects/${id}/snapshots/${snapshotId}`, {
      method: "DELETE",
    }),
  restoreSnapshot: (id: string, snapshotId: string) =>
    request<ProjectGraph & { backup: ProjectSnapshot }>(
      `/api/projects/${id}/snapshots/${snapshotId}/restore`,
      { method: "POST" },
    ),
  listTrash: () => request<{ projects: Project[] }>("/api/trash"),
  restoreProject: (id: string) =>
    request<{ ok: true }>(`/api/trash/${id}/restore`, { method: "POST" }),
  purgeProject: (id: string) =>
    request<{ ok: true }>(`/api/trash/${id}`, { method: "DELETE" }),
  getPublicBoard: (slug: string) => request<PublicBoard>(`/api/s/${slug}`),
  unlockPublicBoard: (slug: string, password: string) =>
    request<{ ok: true }>(`/api/s/${slug}/unlock`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  listShares: (id: string) =>
    request<{ shares: ProjectShare[]; links: PublicLink[] }>(
      `/api/projects/${id}/shares`,
    ),
  addShare: (
    id: string,
    username: string,
    permission: AccessPermission = "edit",
  ) =>
    request<{ share: ProjectShare }>(`/api/projects/${id}/shares`, {
      method: "POST",
      body: JSON.stringify({ username, permission }),
    }),
  updateShare: (id: string, userId: string, permission: AccessPermission) =>
    request<{ ok: true; permission: AccessPermission }>(
      `/api/projects/${id}/shares/${userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ permission }),
      },
    ),
  createPublicLink: (id: string, access: PublicAccess, password?: string) =>
    request<{ link: PublicLink }>(`/api/projects/${id}/links`, {
      method: "POST",
      body: JSON.stringify({ access, password: password || undefined }),
    }),
  updatePublicLink: (
    id: string,
    slug: string,
    input: { access?: PublicAccess; password?: string | null },
  ) =>
    request<{ link: PublicLink }>(`/api/projects/${id}/links/${slug}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deletePublicLink: (id: string, slug: string) =>
    request<{ ok: true }>(`/api/projects/${id}/links/${slug}`, {
      method: "DELETE",
    }),
  removeShare: (id: string, userId: string) =>
    request<{ ok: true }>(`/api/projects/${id}/shares/${userId}`, {
      method: "DELETE",
    }),

  createNode: (
    projectId: string,
    input: {
      type: SpaceType;
      title?: string;
      content?: string;
      preview?: string | null;
      x: number;
      y: number;
      width?: number;
      height?: number;
      status?: SpaceStatus | "";
      dueOn?: string;
    },
  ) =>
    request<{ node: SpaceNode }>(`/api/projects/${projectId}/nodes`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateNode: (
    projectId: string,
    nodeId: string,
    input: Partial<{
      title: string;
      content: string;
      preview: string | null;
      x: number;
      y: number;
      width: number;
      height: number;
      borderColor: string;
      status: SpaceStatus | "";
      dueOn: string | null;
    }>,
  ) =>
    request<{ node: SpaceNode }>(
      `/api/projects/${projectId}/nodes/${nodeId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    ),
  deleteNode: (projectId: string, nodeId: string) =>
    request<{ ok: true }>(`/api/projects/${projectId}/nodes/${nodeId}`, {
      method: "DELETE",
    }),
  listTrashedNodes: (projectId: string) =>
    request<{ nodes: SpaceNode[] }>(`/api/projects/${projectId}/trashed-nodes`),
  restoreNode: (projectId: string, nodeId: string) =>
    request<{ node: SpaceNode; edges: SpaceEdge[] }>(
      `/api/projects/${projectId}/nodes/${nodeId}/restore`,
      { method: "POST" },
    ),
  purgeNode: (projectId: string, nodeId: string) =>
    request<{ ok: true }>(
      `/api/projects/${projectId}/nodes/${nodeId}/purge`,
      { method: "DELETE" },
    ),

  createEdge: (
    projectId: string,
    input: {
      id?: string;
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
      label?: string;
    },
  ) =>
    request<{ edge: SpaceEdge }>(`/api/projects/${projectId}/edges`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateEdge: (projectId: string, edgeId: string, label: string) =>
    request<{ ok: true }>(`/api/projects/${projectId}/edges/${edgeId}`, {
      method: "PATCH",
      body: JSON.stringify({ label }),
    }),
  deleteEdge: (projectId: string, edgeId: string) =>
    request<{ ok: true }>(`/api/projects/${projectId}/edges/${edgeId}`, {
      method: "DELETE",
    }),

  uploadImage: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/uploads", {
      method: "POST",
      body,
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new ApiError(data.error || "Upload failed", res.status);
      notifyRequestError("/api/uploads", error);
      throw error;
    }
    return data as { url: string; name: string };
  },
  uploadFile: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/uploads/file", {
      method: "POST",
      body,
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new ApiError(data.error || "Upload failed", res.status);
      if (error.status === 403) {
        toast.error(error.message || "You don't have permission to do that.");
      } else if (error.status === 401) {
        toast.error("Your session expired. Sign in again.");
      }
      throw error;
    }
    return data as { url: string; name: string; ext: string };
  },
};
