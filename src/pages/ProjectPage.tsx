import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  File as FileIcon,
  FileText,
  History,
  ImageIcon,
  Pencil,
  PenLine,
  Plus,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import DrawingNode from "@/components/DrawingNode";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { SnapshotDialog } from "@/components/SnapshotDialog";
import EditorOverlay from "@/components/EditorOverlay";
import FileNode from "@/components/FileNode";
import ImageNode from "@/components/ImageNode";
import { LoadingScreen } from "@/components/LoadingScreen";
import MarkdownNode from "@/components/MarkdownNode";
import { BoardSearch } from "@/components/BoardSearch";
import { ReadOnlyBoard } from "@/components/ReadOnlyBoard";
import { SpacePlanBadges } from "@/components/SpacePlanBadges";
import { SpacePlanFields } from "@/components/SpacePlanFields";
import {
  SpaceTypeFilter,
  spaceKindLabel,
  type SpaceKindFilter,
} from "@/components/SpaceTypeFilter";
import { UserMenu } from "@/components/UserMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { openFileUrl, pickFiles } from "@/lib/files";
import { clipboardImages, isImageUrl } from "@/lib/images";
import { findSpaceByTitle } from "@/lib/wiki";
import { spaceMatchesQuery } from "@/lib/search";
import { toast, toastFromError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  NODE_BORDER_COLORS,
  type Project,
  type ProjectGraph,
  type SpaceEdge,
  type SpaceNode,
  type SpaceStatus,
  type SpaceType,
} from "@/types";

const nodeTypes = {
  markdown: MarkdownNode,
  drawing: DrawingNode,
  image: ImageNode,
  file: FileNode,
};

function flowType(type: SpaceType) {
  if (type === "markdown") return "markdown";
  if (type === "image") return "image";
  if (type === "file") return "file";
  return "drawing";
}

function sameViewport(a: Viewport, b: Viewport) {
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.zoom - b.zoom) < 0.002
  );
}

function formatDeletedAgo(value: number) {
  const ms = Date.now() - value;
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

function WorkspaceInner() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { screenToFlowPosition, setCenter, getNode, setViewport } = useReactFlow();
  const [project, setProject] = useState<Project | null>(null);
  const [spaces, setSpaces] = useState<SpaceNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<SpaceEdge[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<SpaceKindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<SpaceStatus | "all" | "none">(
    "all",
  );
  const saveTimer = useRef<number | null>(null);
  const viewportTimer = useRef<number | null>(null);
  const lastSavedViewport = useRef<Viewport | null>(null);
  const renameTimer = useRef<number | null>(null);
  const pendingPatch = useRef<Record<string, Partial<SpaceNode>>>({});
  const [spaceToDelete, setSpaceToDelete] = useState<string | null>(null);
  const [deletingSpace, setDeletingSpace] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameColor, setRenameColor] = useState("");
  const [renameStatus, setRenameStatus] = useState<SpaceStatus | "">("");
  const [renameDue, setRenameDue] = useState("");
  const [imageDialog, setImageDialog] = useState<
    null | { mode: "create" } | { mode: "edit"; id: string }
  >(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [spaceTrashOpen, setSpaceTrashOpen] = useState(false);
  const [trashedSpaces, setTrashedSpaces] = useState<SpaceNode[]>([]);
  const [loadingSpaceTrash, setLoadingSpaceTrash] = useState(false);

  const writeNodeParam = useCallback(
    (nodeId: string | null) => {
      setSearchParams(
        (prev) => {
          const current = prev.get("node");
          if (current === nodeId) return prev;
          const next = new URLSearchParams(prev);
          if (nodeId) next.set("node", nodeId);
          else next.delete("node");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const openSpace = useCallback(
    (nodeId: string | null) => {
      setOpenId(nodeId);
      writeNodeParam(nodeId);
    },
    [writeNodeParam],
  );

  const persistNode = useCallback(
    async (nodeId: string, patch: Partial<SpaceNode>) => {
      if (!id) return;
      setSaving(true);
      try {
        const { node } = await api.updateNode(id, nodeId, {
          ...patch,
          preview: patch.preview === null ? "" : patch.preview,
        });
        setSpaces((current) =>
          current.map((item) => (item.id === node.id ? { ...item, ...node } : item)),
        );
      } catch (err) {
        toastFromError(err, "Could not save that change.");
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const applyGraph = useCallback(
    (data: ProjectGraph) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      pendingPatch.current = {};
      setProject((current) => ({
        ...data.project,
        role: current?.role === "shared" ? "shared" : data.project.role,
        permission:
          current?.permission === "view" ? "view" : data.project.permission,
        ownerUsername: data.project.ownerUsername || current?.ownerUsername || "",
        folderId: current?.folderId ?? data.project.folderId,
        canManageHistory:
          current?.canManageHistory ?? data.project.canManageHistory,
      }));
      lastSavedViewport.current = data.project.viewport;
      setSpaces(data.nodes);
      setGraphEdges(data.edges);
      setEdges(
        data.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? undefined,
          targetHandle: edge.targetHandle ?? undefined,
          label: edge.label || undefined,
          type: "smoothstep" as const,
          animated: true,
        })),
      );
      setOpenId(null);
      writeNodeParam(null);
      setViewport(data.project.viewport);
    },
    [setViewport, writeNodeParam],
  );

  const flushSaves = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const queued = pendingPatch.current;
    pendingPatch.current = {};
    for (const [nodeIdToSave, nextPatch] of Object.entries(queued)) {
      void persistNode(nodeIdToSave, nextPatch);
    }
  }, [persistNode]);

  const schedulePersist = useCallback(
    (nodeId: string, patch: Partial<SpaceNode>) => {
      pendingPatch.current[nodeId] = {
        ...(pendingPatch.current[nodeId] ?? {}),
        ...patch,
      };
      setSpaces((current) =>
        current.map((item) => (item.id === nodeId ? { ...item, ...patch } : item)),
      );
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const queued = pendingPatch.current;
        pendingPatch.current = {};
        for (const [nodeIdToSave, nextPatch] of Object.entries(queued)) {
          void persistNode(nodeIdToSave, nextPatch);
        }
      }, 500);
    },
    [persistNode],
  );

  const deleteSpace = useCallback(
    async (nodeId: string) => {
      if (!id) return;
      setDeletingSpace(true);
      try {
        await api.deleteNode(id, nodeId);
        setSpaces((current) => current.filter((item) => item.id !== nodeId));
        setEdges((current) =>
          current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
        );
        setOpenId((current) => {
          if (current === nodeId) writeNodeParam(null);
          return current === nodeId ? null : current;
        });
        setSpaceToDelete(null);
      } catch (err) {
        toastFromError(err, "Could not delete that space.");
      } finally {
        setDeletingSpace(false);
      }
    },
    [id, writeNodeParam],
  );

  const removeSpace = useCallback(
    async (nodeId: string, confirmDelete = true) => {
      const space = spaces.find((item) => item.id === nodeId);
      if (confirmDelete && space?.content) {
        setSpaceToDelete(nodeId);
        return;
      }
      await deleteSpace(nodeId);
    },
    [spaces, deleteSpace],
  );

  const addSpace = useCallback(
    async (type: SpaceType) => {
      if (!id) return;
      const point = screenToFlowPosition({
        x: window.innerWidth / 2 + 40,
        y: window.innerHeight / 2,
      });
      try {
        const { node } = await api.createNode(id, {
          type,
          x: point.x,
          y: point.y,
        });
        setSpaces((current) => [...current, node]);
        if (type !== "image") openSpace(node.id);
        else writeNodeParam(node.id);
      } catch (err) {
        toastFromError(err, "Could not add that space.");
      }
    },
    [id, screenToFlowPosition, openSpace, writeNodeParam],
  );

  const addImageSpace = useCallback(
    async (src: string, title?: string) => {
      if (!id) return;
      const point = screenToFlowPosition({
        x: window.innerWidth / 2 + 40,
        y: window.innerHeight / 2,
      });
      try {
        const { node } = await api.createNode(id, {
          type: "image",
          title: title || "Untitled image",
          content: src,
          x: point.x,
          y: point.y,
          width: 360,
          height: 280,
        });
        setSpaces((current) => [...current, node]);
        writeNodeParam(node.id);
      } catch (err) {
        toastFromError(err, "Could not add that image.");
      }
    },
    [id, screenToFlowPosition, writeNodeParam],
  );

  const addFileSpace = useCallback(
    async (file: File) => {
      if (!id) return;
      const uploaded = await api.uploadFile(file);
      const point = screenToFlowPosition({
        x: window.innerWidth / 2 + 40,
        y: window.innerHeight / 2,
      });
      const { node } = await api.createNode(id, {
        type: "file",
        title: uploaded.name,
        content: uploaded.url,
        preview: uploaded.ext,
        x: point.x,
        y: point.y,
        width: 220,
        height: 88,
      });
      setSpaces((current) => [...current, node]);
      writeNodeParam(node.id);
    },
    [id, screenToFlowPosition, writeNodeParam],
  );

  const openWikiLink = useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      if (!trimmed || !id) return;
      const existing = findSpaceByTitle(spaces, trimmed);
      if (existing) {
        if (existing.type === "file") {
          openFileUrl(existing.content);
          return;
        }
        if (existing.type === "image") {
          setImageDialog({ mode: "edit", id: existing.id });
          setImageUrl(existing.content);
          writeNodeParam(existing.id);
          return;
        }
        openSpace(existing.id);
        return;
      }
      if (project?.permission === "view") {
        toast.error(`No space named “${trimmed}”.`);
        return;
      }
      flushSaves();
      const source = spaces.find((space) => space.id === openId);
      try {
        const { node } = await api.createNode(id, {
          type: "markdown",
          title: trimmed,
          x: (source?.x ?? 120) + (source?.width ?? 340) + 48,
          y: source?.y ?? 120,
        });
        setSpaces((current) => [...current, node]);
        openSpace(node.id);
        toast.success(`Created “${node.title}”.`);
      } catch (err) {
        toastFromError(err, "Could not create that note.");
      }
    },
    [
      id,
      spaces,
      project?.permission,
      openId,
      openSpace,
      writeNodeParam,
      flushSaves,
    ],
  );

  const pickAndAddFiles = useCallback(async () => {
    try {
      const files = await pickFiles();
      for (const file of files) await addFileSpace(file);
    } catch (err) {
      toastFromError(err, "Could not add that file.");
    }
  }, [addFileSpace]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api
      .getProject(id)
      .then((data) => {
        if (!alive) return;
        setProject(data.project);
        lastSavedViewport.current = data.project.viewport;
        setSpaces(data.nodes);
        setGraphEdges(data.edges);
        setEdges(
          data.edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? undefined,
            targetHandle: edge.targetHandle ?? undefined,
            label: edge.label || undefined,
            type: "smoothstep",
            animated: true,
          })),
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load project.");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    setNodes((current) => {
      const selected = new Set(
        current.filter((node) => node.selected).map((node) => node.id),
      );
      return spaces.map((space) => ({
        id: space.id,
        type: flowType(space.type),
        position: { x: space.x, y: space.y },
        style: { width: space.width, height: space.height },
        selected: selected.has(space.id),
        width: space.width,
        height: space.height,
        data: {
          title: space.title,
          content: space.content,
          preview: space.preview,
          spaceType: space.type,
          borderColor: space.borderColor || "",
          status: space.status || "",
          dueOn: space.dueOn || "",
          onOpen: () => {
            if (space.type === "file") {
              openFileUrl(space.content);
              return;
            }
            if (space.type === "image") {
              setImageDialog({ mode: "edit", id: space.id });
              setImageUrl(space.content);
              writeNodeParam(space.id);
              return;
            }
            openSpace(space.id);
          },
          onResize: (width: number, height: number) => {
            schedulePersist(space.id, { width, height });
          },
          onWikiLink: (title: string) => {
            void openWikiLink(title);
          },
        },
      }));
    });
  }, [spaces, schedulePersist, openSpace, writeNodeParam, openWikiLink]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (openId) {
        if (event.key === "Escape") openSpace(null);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.key.toLowerCase() === "n") void addSpace("markdown");
      if (event.key.toLowerCase() === "d") void addSpace("excalidraw");
      if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        setImageUrl("");
        setImageDialog({ mode: "create" });
      }
      if (event.key.toLowerCase() === "f" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        void pickAndAddFiles();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, addSpace, openSpace, pickAndAddFiles]);

  useEffect(() => {
    async function onPaste(event: ClipboardEvent) {
      if (openId || imageDialog) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;

      const files = clipboardImages(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        try {
          for (const file of files) {
            const uploaded = await api.uploadImage(file);
            await addImageSpace(uploaded.url, uploaded.name);
          }
        } catch (err) {
          toastFromError(err, "Could not paste that image.");
        }
        return;
      }

      const text = event.clipboardData?.getData("text")?.trim() ?? "";
      if (isImageUrl(text)) {
        event.preventDefault();
        await addImageSpace(text);
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [openId, imageDialog, addImageSpace]);

  const openNode = spaces.find((space) => space.id === openId) ?? null;

  const filteredSpaces = useMemo(
    () =>
      spaces.filter((space) => {
        if (kindFilter !== "all" && space.type !== kindFilter) return false;
        if (statusFilter === "none" && space.status) return false;
        if (
          statusFilter !== "all" &&
          statusFilter !== "none" &&
          space.status !== statusFilter
        ) {
          return false;
        }
        return spaceMatchesQuery(space, query);
      }),
    [spaces, query, kindFilter, statusFilter],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((current) => applyEdgeChanges(changes, current));
      if (!id) return;
      for (const change of changes) {
        if (change.type === "remove") {
          void api.deleteEdge(id, change.id).catch((err) => {
            toastFromError(err, "Could not remove that link.");
          });
        }
      }
    },
    [id],
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!id || !connection.source || !connection.target) return;
      const tempId = crypto.randomUUID();
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: tempId,
            type: "smoothstep",
            animated: true,
          },
          current,
        ),
      );
      try {
        const { edge } = await api.createEdge(id, {
          id: tempId,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        });
        setEdges((current) =>
          current.map((item) =>
            item.id === tempId
              ? { ...item, id: edge.id, label: edge.label || undefined }
              : item,
          ),
        );
      } catch (err) {
        setEdges((current) => current.filter((item) => item.id !== tempId));
        toastFromError(err, "Could not link those spaces.");
      }
    },
    [id],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (!id) return;
      void api
        .updateNode(id, node.id, {
          x: node.position.x,
          y: node.position.y,
        })
        .catch((err) => {
          toastFromError(err, "Could not move that space.");
        });
      setSpaces((current) =>
        current.map((item) =>
          item.id === node.id
            ? { ...item, x: node.position.x, y: node.position.y }
            : item,
        ),
      );
    },
    [id],
  );

  const focusSpace = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      const space = spaces.find((item) => item.id === nodeId);
      const x = node?.position.x ?? space?.x;
      const y = node?.position.y ?? space?.y;
      if (x == null || y == null) return false;
      const width = node?.measured?.width ?? node?.width ?? space?.width ?? 320;
      const height =
        node?.measured?.height ?? node?.height ?? space?.height ?? 240;
      setCenter(x + width / 2, y + height / 2, {
        zoom: 1.05,
        duration: 420,
      });
      return true;
    },
    [getNode, setCenter, spaces],
  );

  const jumpToSpace = useCallback(
    (nodeId: string) => {
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: node.id === nodeId })),
      );
      focusSpace(nodeId);
    },
    [focusSpace],
  );

  useEffect(() => {
    const nodeId = searchParams.get("node");
    if (!nodeId || spaces.length === 0) return;
    const space = spaces.find((item) => item.id === nodeId);
    if (!space) return;

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const focused = focusSpace(space.id);
      if (focused || tries > 12) window.clearInterval(timer);
    }, 80);

    if (space.type === "markdown" || space.type === "excalidraw") {
      setOpenId(space.id);
    }

    return () => window.clearInterval(timer);
  }, [searchParams, spaces, focusSpace]);

  const pendingSpace = spaces.find((space) => space.id === spaceToDelete);
  const renamingSpace = spaces.find((space) => space.id === renamingId);

  function renameProject(name: string) {
    if (!id || !project) return;
    setProject({ ...project, name });
    if (renameTimer.current) window.clearTimeout(renameTimer.current);
    renameTimer.current = window.setTimeout(() => {
      void api.updateProject(id, { name }).catch((err) => {
        toastFromError(err, "Could not rename the board.");
      });
    }, 400);
  }

  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">{error}</p>
        <Button asChild variant="outline">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  async function duplicateBoard() {
    if (!id || duplicating) return;
    setDuplicating(true);
    try {
      const { project: copy } = await api.duplicateProject(id);
      toast.success(`Copied as “${copy.name}”.`);
      navigate(`/project/${copy.id}`);
    } catch (err) {
      toastFromError(err, "Could not duplicate that board.");
    } finally {
      setDuplicating(false);
    }
  }

  if (!project || !id) {
    return <LoadingScreen message="Laying out the board…" />;
  }

  if (project.permission === "view") {
    return (
      <>
      <ReadOnlyBoard
        project={project}
        spaces={spaces}
        edges={graphEdges}
        headerLeft={
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">
              <ArrowLeft />
              Projects
            </Link>
          </Button>
        }
        headerRight={
          <>
            {project.role === "shared" ? (
              <Badge variant="outline">Shared by {project.ownerUsername}</Badge>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={duplicating}
              onClick={() => void duplicateBoard()}
            >
              <Copy />
              {duplicating ? "Copying…" : "Duplicate"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVersionsOpen(true)}
            >
              <History />
              Versions
            </Button>
            <UserMenu
              username={user?.username ?? ""}
              onLogout={() => logout().then(() => navigate("/login"))}
            />
          </>
        }
      />
      <SnapshotDialog
        projectId={id}
        open={versionsOpen}
        canEdit={false}
        onOpenChange={setVersionsOpen}
        onRestore={applyGraph}
      />
      </>
    );
  }

  return (
    <div className="grid h-full grid-rows-[56px_1fr] overflow-hidden">
      <header className="bg-background/90 flex items-center justify-between gap-3 border-b px-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">
              <ArrowLeft />
              Projects
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <Input
            value={project.name}
            onChange={(e) => renameProject(e.target.value)}
            className="font-serif h-8 max-w-xs border-transparent bg-transparent text-base shadow-none focus-visible:border-input focus-visible:bg-input/30"
          />
        </div>
        <div className="flex items-center gap-2">
          {project.role === "shared" ? (
            <Badge variant="secondary">Shared by {project.ownerUsername}</Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
            >
              <Share2 />
              Share
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={duplicating}
            onClick={() => void duplicateBoard()}
          >
            <Copy />
            {duplicating ? "Copying…" : "Duplicate"}
          </Button>
          <Badge variant={saving ? "secondary" : "outline"}>
            {saving ? "Saving…" : "Saved"}
          </Badge>
          <UserMenu
            username={user?.username ?? ""}
            onLogout={() => logout().then(() => navigate("/login"))}
          />
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <aside className="bg-sidebar hidden min-h-0 min-w-0 overflow-hidden border-r md:flex md:flex-col">
          <div className="shrink-0 space-y-3 p-3">
            <p className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
              Spaces
            </p>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                className="h-8 pl-8"
                placeholder="Find a note or drawing"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <SpaceTypeFilter value={kindFilter} onChange={setKindFilter} />
            <select
              value={statusFilter}
              className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
              onChange={(event) =>
                setStatusFilter(event.target.value as typeof statusFilter)
              }
            >
              <option value="all">Any status</option>
              <option value="todo">Todo</option>
              <option value="doing">Doing</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
              <option value="none">No status</option>
            </select>
          </div>
          <div className="thin-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3">
            {filteredSpaces.length === 0 ? (
              <p className="text-muted-foreground px-2 py-8 text-center text-sm">
                {spaces.length === 0
                  ? "Nothing on this board yet."
                  : kindFilter === "all"
                    ? "No spaces match that search."
                    : `No ${spaceKindLabel(kindFilter).toLowerCase()} here.`}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredSpaces.map((space) => {
                  const Icon =
                    space.type === "markdown"
                      ? FileText
                      : space.type === "image"
                        ? ImageIcon
                        : space.type === "file"
                          ? FileIcon
                          : PenLine;
                  return (
                    <div
                      key={space.id}
                      className={cn(
                        "group hover:bg-accent flex min-w-0 items-start gap-0.5 rounded-lg px-1.5 py-1.5 transition-colors",
                        openId === space.id && "bg-accent",
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-2.5 overflow-hidden px-1 py-0.5 text-left"
                        onClick={() => {
                          if (space.type === "file") {
                            focusSpace(space.id);
                            openFileUrl(space.content);
                            return;
                          }
                          if (space.type === "image") {
                            setImageDialog({ mode: "edit", id: space.id });
                            setImageUrl(space.content);
                            focusSpace(space.id);
                            writeNodeParam(space.id);
                            return;
                          }
                          focusSpace(space.id);
                          openSpace(space.id);
                        }}
                      >
                        <span className="relative mt-0.5 shrink-0">
                          <Icon
                            className={cn(
                              "size-4",
                              space.type === "markdown"
                                ? "text-primary"
                                : "text-muted-foreground",
                            )}
                          />
                          {space.borderColor ? (
                            <span
                              className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-sidebar"
                              style={{ background: space.borderColor }}
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {space.title || "Untitled"}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {space.type === "markdown"
                              ? "Markdown note"
                              : space.type === "image"
                                ? "Image"
                                : space.type === "file"
                                  ? "File"
                                  : "Excalidraw drawing"}
                          </span>
                          <SpacePlanBadges
                            status={space.status}
                            dueOn={space.dueOn}
                            className="mt-1"
                          />
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground size-7"
                          title="Rename"
                          onClick={(event) => {
                            event.stopPropagation();
                            setRenamingId(space.id);
                            setRenameDraft(space.title || "");
                            setRenameColor(space.borderColor || "");
                            setRenameStatus(space.status || "");
                            setRenameDue(space.dueOn || "");
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive size-7"
                          title="Delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeSpace(space.id);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="shrink-0 space-y-1 border-t p-2">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground w-full justify-start"
              onClick={() => setVersionsOpen(true)}
            >
              <History />
              Versions
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground w-full justify-start"
              onClick={() => {
                if (!id) return;
                setSpaceTrashOpen(true);
                setLoadingSpaceTrash(true);
                void api
                  .listTrashedNodes(id)
                  .then((data) => setTrashedSpaces(data.nodes))
                  .catch((err) => {
                    toastFromError(err, "Could not load trash.");
                  })
                  .finally(() => setLoadingSpaceTrash(false));
              }}
            >
              <Trash2 />
              Trash
            </Button>
          </div>
        </aside>

        <div
          className="bg-background relative min-h-0 min-w-0"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) event.preventDefault();
          }}

          onDrop={(event) => {
            const dropped = Array.from(event.dataTransfer.files);
            if (dropped.length === 0) return;
            event.preventDefault();
            void (async () => {
              try {
                for (const file of dropped) {
                  if (file.type.startsWith("image/")) {
                    const uploaded = await api.uploadImage(file);
                    await addImageSpace(uploaded.url, uploaded.name);
                  } else {
                    await addFileSpace(file);
                  }
                }
              } catch (err) {
                toastFromError(err, "Could not add that file.");
              }
            })();
          }}
        >
          {spaces.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-center">
              <div>
                <p className="font-serif text-2xl">An empty desk</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Add a note or a drawing, then drag a handle to link them.
                </p>
              </div>
            </div>
          ) : null}
          <ReactFlow
            colorMode="dark"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            defaultViewport={project.viewport}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeDoubleClick={(_, node) => {
              const space = spaces.find((item) => item.id === node.id);
              if (space?.type === "file") {
                openFileUrl(space.content);
                return;
              }
              if (space?.type === "image") {
                setImageDialog({ mode: "edit", id: space.id });
                setImageUrl(space.content);
                writeNodeParam(space.id);
                return;
              }
              openSpace(node.id);
            }}
            onNodesDelete={(deleted) => {
              for (const node of deleted) void removeSpace(node.id, false);
            }}
            onMoveEnd={(_, viewport: Viewport) => {
              if (openId || imageDialog) return;
              const prev = lastSavedViewport.current;
              if (prev && sameViewport(prev, viewport)) return;
              if (viewportTimer.current) window.clearTimeout(viewportTimer.current);
              viewportTimer.current = window.setTimeout(() => {
                if (
                  lastSavedViewport.current &&
                  sameViewport(lastSavedViewport.current, viewport)
                ) {
                  return;
                }
                lastSavedViewport.current = viewport;
                void api.updateProject(id, { viewport }).catch((err) => {
                  toastFromError(err, "Could not save the view.");
                });
              }, 400);
            }}
            onEdgeDoubleClick={(_, edge) => {
              const label = prompt("Link label", String(edge.label ?? ""));
              if (label === null) return;
              setEdges((current) =>
                current.map((item) =>
                  item.id === edge.id ? { ...item, label } : item,
                ),
              );
              void api.updateEdge(id, edge.id, label).catch((err) => {
                toastFromError(err, "Could not update that link.");
              });
            }}
            isValidConnection={(c) => c.source !== c.target}
            deleteKeyCode={openId ? null : ["Backspace", "Delete"]}
            minZoom={0.25}
            maxZoom={1.8}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { strokeWidth: 1.8 },
            }}
          >
            <Background gap={22} size={1.4} color="oklch(1 0 0 / 8%)" />
            <Controls />
            <MiniMap
              pannable
              zoomable
              bgColor="oklch(0.145 0 0)"
              maskColor="oklch(0.205 0 0 / 72%)"
              nodeStrokeColor="oklch(1 0 0 / 14%)"
              nodeColor={(node) =>
                node.type === "drawing"
                  ? "oklch(0.37 0 0)"
                  : node.type === "image"
                    ? "oklch(0.41 0 0)"
                    : node.type === "file"
                      ? "oklch(0.33 0 0)"
                      : "oklch(0.45 0 0)"
              }
            />
            <Panel position="top-left">
              <div className="bg-card/95 flex items-center gap-2 rounded-xl border p-1.5 shadow-lg backdrop-blur">
                <Button size="sm" variant="secondary" onClick={() => addSpace("markdown")}>
                  <Plus />
                  Note
                </Button>
                <Button size="sm" variant="secondary" onClick={() => addSpace("excalidraw")}>
                  <Plus />
                  Drawing
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setImageDialog({ mode: "create" });
                    setImageUrl("");
                  }}
                >
                  <Plus />
                  Image
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void pickAndAddFiles()}>
                  <Plus />
                  File
                </Button>
                <span className="text-muted-foreground hidden px-2 text-xs sm:inline">
                  N note · D drawing · I image · F file · ⌘F search
                </span>
              </div>
            </Panel>
            <Panel position="top-right">
              <BoardSearch
                spaces={spaces}
                onJump={jumpToSpace}
                enabled={!openId && !imageDialog}
              />
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {openNode && openNode.type !== "image" && openNode.type !== "file" ? (
        <EditorOverlay
          node={openNode}
          saving={saving}
          onTitle={(title) => schedulePersist(openNode.id, { title })}
          onStatus={(status) => schedulePersist(openNode.id, { status })}
          onDueOn={(dueOn) => schedulePersist(openNode.id, { dueOn })}
          onMarkdown={(content) => schedulePersist(openNode.id, { content })}
          onDrawing={(content, preview) =>
            schedulePersist(openNode.id, { content, preview })
          }
          onClose={() => {
            flushSaves();
            openSpace(null);
          }}
          onDelete={() => void removeSpace(openNode.id)}
          onWikiLink={(title) => void openWikiLink(title)}
        />
      ) : null}

      <Dialog
        open={Boolean(imageDialog)}
        onOpenChange={(open) => {
          if (!open && !imageBusy) {
            setImageDialog(null);
            setImageError("");
          }
        }}
      >
        <DialogContent
          className={
            imageDialog?.mode === "edit" ? "sm:max-w-4xl" : "sm:max-w-md"
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const src = imageUrl.trim();
              if (!src) return;
              if (imageDialog?.mode === "edit") {
                schedulePersist(imageDialog.id, { content: src });
              } else {
                void addImageSpace(src);
              }
              setImageDialog(null);
              setImageUrl("");
              setImageError("");
            }}
            className="space-y-4"
            onPaste={(event) => {
              const files = clipboardImages(event.clipboardData);
              if (files.length === 0) return;
              event.preventDefault();
              void (async () => {
                setImageBusy(true);
                setImageError("");
                try {
                  const uploaded = await api.uploadImage(files[0]);
                  if (imageDialog?.mode === "edit") {
                    schedulePersist(imageDialog.id, {
                      content: uploaded.url,
                      title: uploaded.name,
                    });
                  } else {
                    await addImageSpace(uploaded.url, uploaded.name);
                  }
                  setImageDialog(null);
                  setImageUrl("");
                } catch (err) {
                  setImageError(
                    err instanceof Error ? err.message : "Upload failed.",
                  );
                } finally {
                  setImageBusy(false);
                }
              })();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {imageDialog?.mode === "edit"
                  ? spaces.find((item) => item.id === imageDialog.id)?.title ||
                    "Image"
                  : "Add image"}
              </DialogTitle>
              <DialogDescription>
                {imageDialog?.mode === "edit"
                  ? "Preview stays in Plot. Change the source below if you need to."
                  : "Upload a file, paste a URL, or use whatever is on the clipboard."}
              </DialogDescription>
            </DialogHeader>
            {imageDialog?.mode === "edit" && imageUrl.trim() ? (
              <div className="bg-background flex max-h-[min(65vh,36rem)] items-center justify-center overflow-hidden rounded-lg border">
                <img
                  src={imageUrl.trim()}
                  alt=""
                  className="max-h-[min(65vh,36rem)] w-full object-contain"
                  draggable={false}
                  onClick={(event) => event.preventDefault()}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="image-url">Image URL</Label>
              <Input
                id="image-url"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://… or /api/files/…"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={imageBusy}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/png,image/jpeg,image/gif,image/webp";
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    void (async () => {
                      setImageBusy(true);
                      setImageError("");
                      try {
                        const uploaded = await api.uploadImage(file);
                        if (imageDialog?.mode === "edit") {
                          schedulePersist(imageDialog.id, {
                            content: uploaded.url,
                            title: uploaded.name,
                          });
                        } else {
                          await addImageSpace(uploaded.url, uploaded.name);
                        }
                        setImageDialog(null);
                        setImageUrl("");
                      } catch (err) {
                        setImageError(
                          err instanceof Error ? err.message : "Upload failed.",
                        );
                      } finally {
                        setImageBusy(false);
                      }
                    })();
                  };
                  input.click();
                }}
              >
                Upload file
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={imageBusy}
                onClick={() => {
                  void (async () => {
                    setImageBusy(true);
                    setImageError("");
                    try {
                      const items = await navigator.clipboard.read();
                      for (const item of items) {
                        const type = item.types.find((value) =>
                          value.startsWith("image/"),
                        );
                        if (type) {
                          const blob = await item.getType(type);
                          const file = new File([blob], "clipboard-image.png", {
                            type,
                          });
                          const uploaded = await api.uploadImage(file);
                          if (imageDialog?.mode === "edit") {
                            schedulePersist(imageDialog.id, {
                              content: uploaded.url,
                              title: uploaded.name,
                            });
                          } else {
                            await addImageSpace(uploaded.url, uploaded.name);
                          }
                          setImageDialog(null);
                          setImageUrl("");
                          return;
                        }
                      }
                      const text = (await navigator.clipboard.readText()).trim();
                      if (text && (isImageUrl(text) || /^https?:\/\//i.test(text))) {
                        if (imageDialog?.mode === "edit") {
                          schedulePersist(imageDialog.id, { content: text });
                        } else {
                          await addImageSpace(text);
                        }
                        setImageDialog(null);
                        setImageUrl("");
                        return;
                      }
                      setImageError("Clipboard has no image or URL.");
                    } catch {
                      setImageError(
                        "Could not read the clipboard. Allow access, or press Ctrl+V.",
                      );
                    } finally {
                      setImageBusy(false);
                    }
                  })();
                }}
              >
                Use from clipboard
              </Button>
            </div>
            {imageError ? (
              <p className="text-destructive text-sm">{imageError}</p>
            ) : null}
            <DialogFooter className="sm:justify-between">
              {imageDialog?.mode === "edit" ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={imageBusy}
                  onClick={() => {
                    const nodeId = imageDialog.id;
                    setImageDialog(null);
                    setImageError("");
                    void removeSpace(nodeId);
                  }}
                >
                  <Trash2 />
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={imageBusy}
                  onClick={() => setImageDialog(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={imageBusy || !imageUrl.trim()}>
                  {imageBusy
                    ? "Working…"
                    : imageDialog?.mode === "edit"
                      ? "Update"
                      : "Add to board"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renamingId)}
        onOpenChange={(open) => {
          if (!open) setRenamingId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!renamingId) return;
              schedulePersist(renamingId, {
                title: renameDraft.trim() || renamingSpace?.title || "Untitled",
                borderColor: renameColor,
                status: renameStatus,
                dueOn: renameDue,
              });
              setRenamingId(null);
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit space</DialogTitle>
              <DialogDescription>
                Rename this card, set a status and due date, and pick a border
                color.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="space-title">Name</Label>
              <Input
                id="space-title"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                autoFocus
              />
            </div>
            <SpacePlanFields
              status={renameStatus}
              dueOn={renameDue}
              onStatus={setRenameStatus}
              onDueOn={setRenameDue}
            />
            <div className="space-y-2">
              <Label>Border color</Label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  title="Default"
                  className={cn(
                    "size-7 rounded-full border border-dashed",
                    !renameColor
                      ? "border-foreground"
                      : "border-muted-foreground/40",
                  )}
                  onClick={() => setRenameColor("")}
                />
                {NODE_BORDER_COLORS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    title={value}
                    className={cn(
                      "size-7 rounded-full border-2",
                      renameColor === value
                        ? "border-foreground scale-110"
                        : "border-transparent",
                    )}
                    style={{ background: value }}
                    onClick={() => setRenameColor(value)}
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenamingId(null)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ShareProjectDialog
        projectId={id}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />

      <SnapshotDialog
        projectId={id ?? null}
        open={versionsOpen}
        canEdit={project.canManageHistory === true}
        onOpenChange={setVersionsOpen}
        onBeforeMutate={flushSaves}
        onRestore={applyGraph}
      />

      <Dialog open={spaceTrashOpen} onOpenChange={setSpaceTrashOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Trash</DialogTitle>
            <DialogDescription>
              Spaces removed from this board stay here until you restore them.
            </DialogDescription>
          </DialogHeader>
          {loadingSpaceTrash ? (
            <p className="text-muted-foreground text-sm">Loading trash…</p>
          ) : trashedSpaces.length === 0 ? (
            <p className="text-muted-foreground text-sm">Trash is empty.</p>
          ) : (
            <div className="thin-scroll max-h-[min(20rem,calc(100dvh-16rem))] space-y-2 overflow-y-auto pr-1">
              {trashedSpaces.map((space) => {
                const Icon =
                  space.type === "markdown"
                    ? FileText
                    : space.type === "image"
                      ? ImageIcon
                      : space.type === "file"
                        ? FileIcon
                        : PenLine;
                return (
                  <div
                    key={space.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {space.title || "Untitled"}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {space.type === "markdown"
                            ? "Note"
                            : space.type === "image"
                              ? "Image"
                              : space.type === "file"
                                ? "File"
                                : "Drawing"}
                          {space.deletedAt
                            ? ` · ${formatDeletedAgo(space.deletedAt)}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!id) return;
                        void api
                          .restoreNode(id, space.id)
                          .then((data) => {
                            setSpaces((current) => [...current, data.node]);
                            setEdges((current) => [
                              ...current,
                              ...data.edges.map((edge) => ({
                                id: edge.id,
                                source: edge.source,
                                target: edge.target,
                                sourceHandle: edge.sourceHandle ?? undefined,
                                targetHandle: edge.targetHandle ?? undefined,
                                label: edge.label || undefined,
                                type: "smoothstep" as const,
                                animated: true,
                              })),
                            ]);
                            setTrashedSpaces((current) =>
                              current.filter((item) => item.id !== space.id),
                            );
                            toast.success("Space restored.");
                          })
                          .catch((err) => {
                            toastFromError(err, "Could not restore that space.");
                          });
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(spaceToDelete)}
        title="Delete space"
        description={
          pendingSpace?.title
            ? `“${pendingSpace.title}” will be moved to this board’s trash.`
            : "This note or drawing will be moved to this board’s trash."
        }
        confirmLabel="Delete"
        busy={deletingSpace}
        onOpenChange={(next) => {
          if (!next && !deletingSpace) setSpaceToDelete(null);
        }}
        onConfirm={() => {
          if (spaceToDelete) void deleteSpace(spaceToDelete);
        }}
      />
    </div>
  );
}

export default function ProjectPage() {
  return (
    <ReactFlowProvider>
      <WorkspaceInner />
    </ReactFlowProvider>
  );
}
