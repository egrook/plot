import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, File as FileIcon, FileText, Folder, FolderPlus, ImageIcon, MoreHorizontal, PenLine, Plus, Search, Share2, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { BrandMark } from "@/components/BrandMark";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { UserMenu } from "@/components/UserMenu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastFromError } from "@/lib/toast";
import { PROJECT_COLORS, type Project, type ProjectFolder, type SearchHit } from "@/types";
import { cn } from "@/lib/utils";

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(value);
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get("folder");
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shareId, setShareId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [renameFolder, setRenameFolder] = useState<ProjectFolder | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api.listProjects(), api.listFolders()])
      .then(([projectData, folderData]) => {
        setProjects(projectData.projects);
        setFolders(folderData.folders);
      })
      .catch((err) => {
        toastFromError(err, "Could not load projects.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ownedIds = useMemo(
    () =>
      new Set(
        projects.filter((project) => project.role === "owner").map((project) => project.id),
      ),
    [projects],
  );

  const visibleHits = useMemo(
    () => (mineOnly ? hits.filter((hit) => ownedIds.has(hit.projectId)) : hits),
    [hits, mineOnly, ownedIds],
  );

  const activeFolder = folders.find((folder) => folder.id === folderId) ?? null;

  const filtered = useMemo(() => {
    const scoped = mineOnly
      ? projects.filter((project) => project.role === "owner")
      : projects;
    const q = query.trim().toLowerCase();
    if (q) {
      const matchingIds = new Set(visibleHits.map((hit) => hit.projectId));
      return scoped.filter(
        (project) =>
          matchingIds.has(project.id) ||
          project.name.toLowerCase().includes(q) ||
          project.description.toLowerCase().includes(q),
      );
    }
    if (folderId) {
      return scoped.filter((project) => project.folderId === folderId);
    }
    return scoped.filter((project) => !project.folderId);
  }, [projects, query, visibleHits, mineOnly, folderId]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .search(q)
        .then((data) => setHits(data.results))
        .catch((err) => {
          toastFromError(err, "Search failed.");
          setHits([]);
        })
        .finally(() => setSearching(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { project } = await api.createProject({
        name,
        description,
        color,
        folderId: folderId || null,
      });
      setProjects((current) => [project, ...current]);
      if (folderId) {
        setFolders((current) =>
          current.map((folder) =>
            folder.id === folderId
              ? { ...folder, projectIds: [...folder.projectIds, project.id] }
              : folder,
          ),
        );
      }
      setOpen(false);
      setName("");
      setDescription("");
      navigate(`/project/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setBusy(false);
    }
  }

  async function duplicateProject(projectId: string) {
    if (duplicatingId) return;
    setDuplicatingId(projectId);
    try {
      const { project } = await api.duplicateProject(projectId);
      setProjects((current) => [project, ...current]);
      if (project.folderId) {
        setFolders((current) =>
          current.map((folder) =>
            folder.id === project.folderId
              ? { ...folder, projectIds: [...folder.projectIds, project.id] }
              : folder,
          ),
        );
      }
      toast.success(`Copied as “${project.name}”.`);
    } catch (err) {
      toastFromError(err, "Could not duplicate that board.");
    } finally {
      setDuplicatingId(null);
    }
  }

  async function removeProject() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.deleteProject(deleteId);
      setProjects((current) => current.filter((project) => project.id !== deleteId));
      setDeleteId(null);
      toast.success("Board moved to trash.");
    } catch (err) {
      toastFromError(err, "Could not delete that board.");
    } finally {
      setDeleting(false);
    }
  }

  const projectToDelete = projects.find((project) => project.id === deleteId);
  const folderToDelete = folders.find((folder) => folder.id === deleteFolderId);

  function openFolder(id: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("folder", id);
        else next.delete("folder");
        return next;
      },
      { replace: true },
    );
  }

  function moveProject(projectId: string, nextFolderId: string | null) {
    const previous = projects.find((item) => item.id === projectId)?.folderId ?? null;
    setProjects((current) =>
      current.map((item) =>
        item.id === projectId ? { ...item, folderId: nextFolderId } : item,
      ),
    );
    setFolders((current) =>
      current.map((folder) => {
        const without = folder.projectIds.filter((id) => id !== projectId);
        if (folder.id === nextFolderId) {
          return { ...folder, projectIds: [...without, projectId] };
        }
        if (folder.id === previous) {
          return { ...folder, projectIds: without };
        }
        return folder.projectIds === without ? folder : { ...folder, projectIds: without };
      }),
    );
    void api.setProjectFolder(projectId, nextFolderId).catch((err) => {
      toastFromError(err, "Could not move that board.");
      void Promise.all([api.listProjects(), api.listFolders()]).then(
        ([projectData, folderData]) => {
          setProjects(projectData.projects);
          setFolders(folderData.folders);
        },
      );
    });
  }

  return (
    <div className="min-h-svh">
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <BrandMark />
          <UserMenu username={user?.username ?? ""} onLogout={() => void logout()} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            {activeFolder ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground mb-1 inline-flex items-center gap-1 text-sm"
                onClick={() => openFolder(null)}
              >
                <ArrowLeft className="size-3.5" />
                All projects
              </button>
            ) : null}
            <h1 className="font-serif text-4xl tracking-tight">
              {activeFolder ? activeFolder.name : "Your projects"}
            </h1>
            <p className="text-muted-foreground">
              {activeFolder
                ? "Boards in this folder."
                : "Open a board, or start a new one and grow it in 2D."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!activeFolder ? (
              <Button variant="outline" onClick={() => setFolderOpen(true)}>
                <FolderPlus />
                New folder
              </Button>
            ) : null}
            <Button onClick={() => setOpen(true)}>
              <Plus />
              New project
            </Button>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              ref={searchRef}
              className="pr-16 pl-9"
              placeholder="Search projects, notes, drawings…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </div>
          <div className="bg-muted/50 flex w-fit rounded-lg border p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                !mineOnly
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMineOnly(false)}
            >
              All
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                mineOnly
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMineOnly(true)}
            >
              Mine
            </button>
          </div>
        </div>

        {query.trim() ? (
          <div className="mb-8 space-y-2">
            <p className="text-muted-foreground text-sm">
              {searching
                ? "Searching…"
                : `${visibleHits.length} ${visibleHits.length === 1 ? "result" : "results"}`}
            </p>
            {visibleHits.map((hit) => {
              const Icon =
                hit.kind === "project"
                  ? Folder
                  : hit.nodeType === "excalidraw"
                    ? PenLine
                    : hit.nodeType === "image"
                      ? ImageIcon
                      : hit.nodeType === "file"
                        ? FileIcon
                        : FileText;
              return (
                <button
                  key={`${hit.kind}-${hit.projectId}-${hit.nodeId ?? "project"}`}
                  type="button"
                  className="hover:bg-accent/50 flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                  onClick={() => {
                    if (hit.nodeId) {
                      navigate(`/project/${hit.projectId}?node=${hit.nodeId}`);
                    } else {
                      navigate(`/project/${hit.projectId}`);
                    }
                  }}
                >
                  <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{hit.title}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {hit.kind === "project"
                          ? "Project"
                          : hit.nodeType === "excalidraw"
                            ? "Drawing"
                            : hit.nodeType === "image"
                              ? "Image"
                              : hit.nodeType === "file"
                                ? "File"
                                : "Note"}
                      </Badge>
                      {hit.kind === "node" ? (
                        <span className="text-muted-foreground text-xs">
                          in {hit.projectName}
                        </span>
                      ) : null}
                    </span>
                    {hit.snippet ? (
                      <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-sm">
                        {hit.snippet}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading your boards…</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hover:border-primary/40 hover:bg-accent/40 flex min-h-52 flex-col items-start justify-between rounded-xl border border-dashed p-5 text-left transition-colors"
          >
            <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              <Plus className="size-5" />
            </span>
            <div>
              <p className="font-serif text-xl">Start a board</p>
              <p className="text-muted-foreground mt-1 text-sm">
                A fresh 2D space for notes, drawings, and the links between them.
              </p>
            </div>
          </button>

          {!query.trim() && !activeFolder
            ? folders.map((folder) => {
                const count = projects.filter(
                  (project) =>
                    project.folderId === folder.id &&
                    (!mineOnly || project.role === "owner"),
                ).length;
                return (
                  <Card
                    key={folder.id}
                    className="hover:border-primary/30 cursor-pointer gap-3 py-0 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    onClick={() => openFolder(folder.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openFolder(folder.id);
                    }}
                  >
                    <div className="bg-muted h-1.5 rounded-t-xl" />
                    <CardHeader className="pt-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                          <Folder className="size-5" />
                        </span>
                      </div>
                      <CardTitle className="font-serif text-2xl font-medium">
                        {folder.name}
                      </CardTitle>
                      <CardDescription>
                        {count} {count === 1 ? "board" : "boards"}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="justify-end gap-1 pb-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRenameFolder(folder);
                          setFolderName(folder.name);
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteFolderId(folder.id);
                        }}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })
            : null}

          {filtered.map((project) => (
            <Card
              key={project.id}
              className="hover:border-primary/30 cursor-pointer gap-3 py-0 transition-all hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => navigate(`/project/${project.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter") navigate(`/project/${project.id}`);
              }}
            >
              <div
                className="h-1.5 rounded-t-xl"
                style={{ background: project.color }}
              />
              <CardHeader className="pt-1">
                <CardTitle className="font-serif text-2xl font-medium">
                  {project.name}
                </CardTitle>
                {project.role === "shared" ? (
                  <Badge variant="secondary" className="w-fit text-[10px]">
                    {project.permission === "view" ? "View only · " : ""}
                    Shared by {project.ownerUsername}
                  </Badge>
                ) : null}
                <CardDescription className="line-clamp-2 min-h-10">
                  {project.description || "No description yet."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between pb-2">
                <Badge variant="secondary">
                  {project.nodeCount}{" "}
                  {project.nodeCount === 1 ? "space" : "spaces"}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  Updated {formatDate(project.updatedAt)}
                </span>
              </CardContent>
              <CardFooter className="justify-end pb-4">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      aria-label="Board actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DropdownMenuItem
                      disabled={duplicatingId === project.id}
                      onSelect={() => void duplicateProject(project.id)}
                    >
                      <Copy />
                      {duplicatingId === project.id ? "Copying…" : "Duplicate"}
                    </DropdownMenuItem>
                    {project.role === "owner" ? (
                      <DropdownMenuItem onSelect={() => setShareId(project.id)}>
                        <Share2 />
                        Share
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Move to</DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={() => moveProject(project.id, null)}
                    >
                      <Folder />
                      No folder
                    </DropdownMenuItem>
                    {folders.map((folder) => (
                      <DropdownMenuItem
                        key={folder.id}
                        onSelect={() => moveProject(project.id, folder.id)}
                      >
                        <Folder />
                        {folder.name}
                        {project.folderId === folder.id ? " ·" : ""}
                      </DropdownMenuItem>
                    ))}
                    {project.role === "owner" ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleteId(project.id)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={createProject} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>
                Give the board a name. You can add notes and drawings next.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kitchen renovation"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-desc">Description</Label>
              <Textarea
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this desk for?"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {PROJECT_COLORS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Color ${value}`}
                    className={cn(
                      "size-7 rounded-full border-2 transition-transform",
                      color === value
                        ? "border-foreground scale-110"
                        : "border-transparent",
                    )}
                    style={{ background: value }}
                    onClick={() => setColor(value)}
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy}>Create board</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={folderOpen || Boolean(renameFolder)}
        onOpenChange={(next) => {
          if (!next && !folderBusy) {
            setFolderOpen(false);
            setRenameFolder(null);
            setFolderName("");
          }
        }}
      >
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const name = folderName.trim();
              if (!name) return;
              setFolderBusy(true);
              const request = renameFolder
                ? api.updateFolder(renameFolder.id, name)
                : api.createFolder(name);
              request
                .then((data) => {
                  if (renameFolder) {
                    setFolders((current) =>
                      current.map((folder) =>
                        folder.id === data.folder.id
                          ? { ...folder, name: data.folder.name }
                          : folder,
                      ),
                    );
                    toast.success("Folder renamed.");
                  } else {
                    setFolders((current) =>
                      [...current, data.folder].sort((a, b) =>
                        a.name.localeCompare(b.name),
                      ),
                    );
                    toast.success("Folder created.");
                  }
                  setFolderOpen(false);
                  setRenameFolder(null);
                  setFolderName("");
                })
                .catch((err) => {
                  toastFromError(err, "Could not save the folder.");
                })
                .finally(() => setFolderBusy(false));
            }}
          >
            <DialogHeader>
              <DialogTitle>{renameFolder ? "Rename folder" : "New folder"}</DialogTitle>
              <DialogDescription>
                Folders are just for you. Shared boards can live in them too.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Client work"
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFolderOpen(false);
                  setRenameFolder(null);
                  setFolderName("");
                }}
              >
                Cancel
              </Button>
              <Button disabled={folderBusy || !folderName.trim()}>
                {folderBusy ? "Saving…" : renameFolder ? "Save" : "Create folder"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ShareProjectDialog
        projectId={shareId}
        open={Boolean(shareId)}
        onOpenChange={(open) => {
          if (!open) setShareId(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteFolderId)}
        title="Delete folder"
        description={
          folderToDelete
            ? `“${folderToDelete.name}” will be removed. The boards inside stay on your dashboard.`
            : "The folder will be removed. The boards inside stay on your dashboard."
        }
        confirmLabel="Delete folder"
        onOpenChange={(next) => {
          if (!next) setDeleteFolderId(null);
        }}
        onConfirm={() => {
          if (!deleteFolderId) return;
          const id = deleteFolderId;
          void api
            .deleteFolder(id)
            .then(() => {
              setFolders((current) => current.filter((folder) => folder.id !== id));
              setProjects((current) =>
                current.map((project) =>
                  project.folderId === id ? { ...project, folderId: null } : project,
                ),
              );
              if (folderId === id) openFolder(null);
              setDeleteFolderId(null);
              toast.success("Folder deleted.");
            })
            .catch((err) => {
              toastFromError(err, "Could not delete that folder.");
            });
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Move to trash"
        description={
          projectToDelete
            ? `“${projectToDelete.name}” will move to trash. You can restore it from your profile.`
            : "This project will move to trash. You can restore it from your profile."
        }
        confirmLabel="Move to trash"
        busy={deleting}
        onOpenChange={(next) => {
          if (!next && !deleting) setDeleteId(null);
        }}
        onConfirm={() => void removeProject()}
      />
    </div>
  );
}
