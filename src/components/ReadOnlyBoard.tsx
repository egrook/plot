import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { File as FileIcon, FileText, ImageIcon, PenLine, Search } from "lucide-react";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BoardSearch } from "@/components/BoardSearch";
import { SpacePlanBadges } from "@/components/SpacePlanBadges";
import {
  SpaceTypeFilter,
  spaceKindLabel,
  type SpaceKindFilter,
} from "@/components/SpaceTypeFilter";
import DrawingNode from "@/components/DrawingNode";
import EditorOverlay from "@/components/EditorOverlay";
import FileNode from "@/components/FileNode";
import ImageNode from "@/components/ImageNode";
import MarkdownNode from "@/components/MarkdownNode";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { openFileUrl } from "@/lib/files";
import { spaceMatchesQuery } from "@/lib/search";
import { toast } from "@/lib/toast";
import { findSpaceByTitle } from "@/lib/wiki";
import { cn } from "@/lib/utils";
import type { Project, SpaceEdge, SpaceNode, SpaceStatus, SpaceType } from "@/types";

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

type Props = {
  project: Pick<Project, "name" | "viewport" | "ownerUsername">;
  spaces: SpaceNode[];
  edges: SpaceEdge[];
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
};

export function ReadOnlyBoard({
  project,
  spaces,
  edges,
  headerLeft,
  headerRight,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setCenter, getNode } = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<SpaceKindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<SpaceStatus | "all" | "none">(
    "all",
  );
  const [imageId, setImageId] = useState<string | null>(null);

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

  const openImage = useCallback(
    (nodeId: string | null) => {
      setImageId(nodeId);
      writeNodeParam(nodeId);
    },
    [writeNodeParam],
  );

  const openWikiLink = useCallback(
    (title: string) => {
      const existing = findSpaceByTitle(spaces, title);
      if (!existing) {
        toast.error(`No space named “${title.trim()}”.`);
        return;
      }
      if (existing.type === "file") {
        openFileUrl(existing.content);
        return;
      }
      if (existing.type === "image") {
        openImage(existing.id);
        return;
      }
      openSpace(existing.id);
    },
    [spaces, openImage, openSpace],
  );

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
        draggable: false,
        connectable: false,
        data: {
          title: space.title,
          content: space.content,
          preview: space.preview,
          spaceType: space.type,
          borderColor: space.borderColor || "",
          status: space.status || "",
          dueOn: space.dueOn || "",
          readOnly: true,
          onWikiLink: openWikiLink,
          onOpen: () => {
            if (space.type === "file") {
              openFileUrl(space.content);
              return;
            }
            if (space.type === "image") {
              openImage(space.id);
              return;
            }
            openSpace(space.id);
          },
          onResize: () => undefined,
        },
      }));
    });
  }, [spaces, openSpace, openImage, openWikiLink]);

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
    } else if (space.type === "image") {
      setImageId(space.id);
    }

    return () => window.clearInterval(timer);
  }, [searchParams, spaces, focusSpace]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        openSpace(null);
        openImage(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSpace, openImage]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const flowEdges = useMemo(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
        label: edge.label || undefined,
        type: "smoothstep" as const,
        animated: true,
      })),
    [edges],
  );

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

  const openNode = spaces.find((space) => space.id === openId) ?? null;
  const imageNode = spaces.find((space) => space.id === imageId) ?? null;

  return (
    <div className="grid h-full grid-rows-[56px_1fr] overflow-hidden">
      <header className="bg-background/90 flex min-w-0 items-center justify-between gap-2 border-b px-2 backdrop-blur-md sm:gap-3 sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
          {headerLeft}
          {headerLeft ? <Separator orientation="vertical" className="hidden h-5 sm:block" /> : null}
          <h1 className="min-w-0 truncate text-base font-medium">{project.name}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Badge variant="secondary" className="hidden sm:inline-flex">
            View only
          </Badge>
          {headerRight}
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <aside className="bg-sidebar hidden min-w-0 overflow-hidden border-r md:flex md:flex-col">
          <div className="space-y-3 p-3">
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
                    <button
                      key={space.id}
                      type="button"
                      className={cn(
                        "hover:bg-accent flex min-w-0 items-start gap-2.5 overflow-hidden rounded-lg px-2.5 py-1.5 text-left transition-colors",
                        (openId === space.id || imageId === space.id) && "bg-accent",
                      )}
                      onClick={() => {
                        focusSpace(space.id);
                        if (space.type === "file") openFileUrl(space.content);
                        else if (space.type === "image") openImage(space.id);
                        else openSpace(space.id);
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
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="bg-background relative min-h-0 min-w-0">
          {spaces.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-center">
              <p className="text-muted-foreground text-sm">This board is empty.</p>
            </div>
          ) : null}
          <ReactFlow
            colorMode="dark"
            nodes={nodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            defaultViewport={project.viewport}
            onNodesChange={onNodesChange}
            onNodeDoubleClick={(_, node) => {
              const space = spaces.find((item) => item.id === node.id);
              if (space?.type === "file") {
                openFileUrl(space.content);
                return;
              }
              if (space?.type === "image") {
                openImage(space.id);
                return;
              }
              openSpace(node.id);
            }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            edgesReconnectable={false}
            deleteKeyCode={null}
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
            <Panel position="top-right" className="!m-2 max-w-[calc(100%-1rem)] sm:!m-[15px]">
              <BoardSearch
                spaces={spaces}
                onJump={jumpToSpace}
                enabled={!openId && !imageId}
              />
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {openNode && openNode.type !== "image" && openNode.type !== "file" ? (
        <EditorOverlay
          node={openNode}
          saving={false}
          readOnly
          onTitle={() => undefined}
          onStatus={() => undefined}
          onDueOn={() => undefined}
          onMarkdown={() => undefined}
          onDrawing={() => undefined}
          onClose={() => openSpace(null)}
          onDelete={() => undefined}
          onWikiLink={openWikiLink}
        />
      ) : null}

      <Dialog
        open={Boolean(imageNode)}
        onOpenChange={(next) => {
          if (!next) openImage(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{imageNode?.title || "Image"}</DialogTitle>
            <DialogDescription>View only.</DialogDescription>
          </DialogHeader>
          {imageNode?.content ? (
            <img
              src={imageNode.content}
              alt={imageNode.title || ""}
              className="bg-background max-h-[70vh] w-full rounded-lg object-contain"
              draggable={false}
              onClick={(event) => event.preventDefault()}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No image.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
