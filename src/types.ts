export type User = {
  id: string;
  username: string;
  createdAt: number;
  avatarUrl: string;
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type AccessPermission = "view" | "edit";
export type PublicAccess = "view" | "edit";

export type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  viewport: Viewport;
  nodeCount: number;
  ownerUsername: string;
  role: "owner" | "shared";
  permission: AccessPermission;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  canManageHistory?: boolean;
};

export type ProjectFolder = {
  id: string;
  name: string;
  createdAt: number;
  projectIds: string[];
};

export type ProjectShare = {
  userId: string;
  username: string;
  createdAt: number;
  permission: AccessPermission;
};

export type PublicLink = {
  slug: string;
  access: PublicAccess;
  createdAt: number;
  hasPassword: boolean;
};

export type SpaceType = "markdown" | "excalidraw" | "image" | "file";

export type SpaceNode = {
  id: string;
  projectId: string;
  type: SpaceType;
  title: string;
  content: string;
  preview: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  borderColor: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type SpaceEdge = {
  id: string;
  projectId: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  label: string;
  createdAt: number;
};

export type ProjectGraph = {
  project: Project;
  nodes: SpaceNode[];
  edges: SpaceEdge[];
};

export type PublicBoard = {
  project: Project;
  nodes: SpaceNode[];
  edges: SpaceEdge[];
  canEdit: boolean;
};

export type ProjectSnapshot = {
  id: string;
  name: string;
  nodeCount: number;
  createdAt: number;
  createdBy: string;
};

export type SearchHit = {
  kind: "project" | "node";
  projectId: string;
  projectName: string;
  nodeId?: string;
  nodeType?: SpaceType;
  title: string;
  snippet: string;
};

export type SpaceNodeData = {
  title: string;
  content: string;
  preview: string | null;
  spaceType: SpaceType;
  borderColor: string;
  readOnly?: boolean;
  onOpen: () => void;
  onResize: (width: number, height: number) => void;
};

export const PROJECT_COLORS = [
  "#71717a",
  "#7d9a72",
  "#6a8f9a",
  "#c4746e",
  "#8f6b8b",
  "#c6a15b",
];

export const NODE_BORDER_COLORS = [
  "#e4e4e7",
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#c084fc",
  "#22d3ee",
  "#fb923c",
];
